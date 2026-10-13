"""
本地 Whisper 语音识别服务（兼容 OpenAI /v1/audio/transcriptions）

用 faster-whisper 在本地跑 Whisper 模型，供 Next.js 应用调用。
支持词级时间戳（word timestamps），返回格式与 OpenAI 的 verbose_json 一致，
因此 ai-subtitles 只需把「接口地址」指向本服务即可，无需任何 API Key。

启动：
    pip install -r requirements.txt
    uvicorn server:app --host 0.0.0.0 --port 8000

常用环境变量：
    STT_MODEL        默认模型，默认 large-v3
    STT_DEVICE       cpu / cuda，默认 cpu
    STT_COMPUTE_TYPE int8 / float16 / int8_float16，默认 int8
    STT_BEAM_SIZE    束搜索宽度，默认 5
    STT_MODELS_DIR   模型下载目录，默认 ./models
    STT_VAD          是否启用 VAD 过滤，默认 true
"""

import os
import logging
import tempfile
import threading
from typing import Any, Optional

try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:
    pass

from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import JSONResponse, PlainTextResponse
from faster_whisper import WhisperModel

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("local-stt")

DEFAULT_MODEL = os.getenv("STT_MODEL", "large-v3")
DEVICE = os.getenv("STT_DEVICE", "cpu")
COMPUTE_TYPE = os.getenv("STT_COMPUTE_TYPE", "int8")
BEAM_SIZE = int(os.getenv("STT_BEAM_SIZE", "5"))
MODELS_DIR = os.getenv("STT_MODELS_DIR", os.path.join(os.getcwd(), "models"))
USE_VAD = os.getenv("STT_VAD", "true").lower() not in ("0", "false", "no")

app = FastAPI(title="Local Whisper STT", version="1.0.0")

_model_lock = threading.Lock()
_transcribe_lock = threading.Lock()
_models: dict[str, WhisperModel] = {}


def get_model(name: str) -> WhisperModel:
    """按需加载并缓存模型。"""
    with _model_lock:
        if name not in _models:
            log.info("加载模型 %s (device=%s, compute_type=%s)...", name, DEVICE, COMPUTE_TYPE)
            _models[name] = WhisperModel(
                name,
                device=DEVICE,
                compute_type=COMPUTE_TYPE,
                download_root=MODELS_DIR,
            )
            log.info("模型 %s 加载完成", name)
        return _models[name]


def format_timestamp(seconds: float, sep: str = ",") -> str:
    hh = int(seconds // 3600)
    mm = int((seconds % 3600) // 60)
    ss = int(seconds % 60)
    ms = int(round((seconds - int(seconds)) * 1000))
    return f"{hh:02}:{mm:02}:{ss:02}{sep}{ms:03}"


def build_srt(segments: list[dict]) -> str:
    lines = []
    for i, seg in enumerate(segments, 1):
        lines.append(str(i))
        lines.append(f"{format_timestamp(seg['start'])} --> {format_timestamp(seg['end'])}")
        lines.append(seg["text"])
        lines.append("")
    return "\n".join(lines)


def build_vtt(segments: list[dict]) -> str:
    lines = ["WEBVTT", ""]
    for seg in segments:
        lines.append(f"{format_timestamp(seg['start'], '.')} --> {format_timestamp(seg['end'], '.')}")
        lines.append(seg["text"])
        lines.append("")
    return "\n".join(lines)


def transcribe_file(model_name: str, audio_path: str, language: Optional[str]) -> dict[str, Any]:
    model = get_model(model_name)
    with _transcribe_lock:
        segments_gen, info = model.transcribe(
            audio_path,
            beam_size=BEAM_SIZE,
            word_timestamps=True,
            vad_filter=USE_VAD,
            language=language or None,
        )

        words: list[dict] = []
        segments: list[dict] = []
        texts: list[str] = []
        for i, seg in enumerate(segments_gen):
            text = (seg.text or "").strip()
            texts.append(text)
            segments.append({
                "id": i,
                "seek": getattr(seg, "seek", 0),
                "start": float(seg.start),
                "end": float(seg.end),
                "text": text,
                "tokens": list(getattr(seg, "tokens", []) or []),
                "temperature": float(getattr(seg, "temperature", 0.0) or 0.0),
                "avg_logprob": float(getattr(seg, "avg_logprob", 0.0) or 0.0),
                "compression_ratio": float(getattr(seg, "compression_ratio", 0.0) or 0.0),
                "no_speech_prob": float(getattr(seg, "no_speech_prob", 0.0) or 0.0),
            })
            for w in (getattr(seg, "words", None) or []):
                words.append({
                    "word": w.word,
                    "start": float(w.start),
                    "end": float(w.end),
                })

        return {
            "text": "".join(texts).strip(),
            "language": getattr(info, "language", None),
            "language_probability": float(getattr(info, "language_probability", 0.0) or 0.0),
            "duration": float(getattr(info, "duration", 0.0) or 0.0),
            "words": words,
            "segments": segments,
        }


@app.get("/")
@app.get("/health")
async def health() -> JSONResponse:
    return JSONResponse({
        "status": "ok",
        "default_model": DEFAULT_MODEL,
        "device": DEVICE,
        "compute_type": COMPUTE_TYPE,
        "loaded_models": list(_models.keys()),
    })


@app.get("/v1/models")
async def list_models() -> JSONResponse:
    return JSONResponse({
        "object": "list",
        "data": [{"id": DEFAULT_MODEL, "object": "model", "owned_by": "local"}],
    })


@app.post("/v1/audio/transcriptions")
async def transcriptions(request: Request):
    form = await request.form()
    upload = form.get("file")
    if upload is None:
        raise HTTPException(status_code=400, detail="缺少 file 字段")

    model_name = (form.get("model") or DEFAULT_MODEL).strip() or DEFAULT_MODEL
    response_format = (form.get("response_format") or "json").strip().lower()
    language = form.get("language")
    language = language.strip() if isinstance(language, str) and language.strip() else None

    filename = getattr(upload, "filename", "") or "audio"
    suffix = os.path.splitext(filename)[1] or ".wav"

    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp_path = tmp.name
            while True:
                chunk = await upload.read(1024 * 1024)
                if not chunk:
                    break
                tmp.write(chunk)

        log.info("转写 %s (model=%s, format=%s, lang=%s)", filename, model_name, response_format, language or "auto")
        result = transcribe_file(model_name, tmp_path, language)
        log.info("完成：%d 段, %d 词, 时长 %.1fs", len(result["segments"]), len(result["words"]), result["duration"])
    finally:
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.unlink(tmp_path)
            except OSError:
                pass

    if response_format == "text":
        return PlainTextResponse(result["text"])
    if response_format == "srt":
        return PlainTextResponse(build_srt(result["segments"]), media_type="application/x-subrip")
    if response_format == "vtt":
        return PlainTextResponse(build_vtt(result["segments"]), media_type="text/vtt")

    # verbose_json 与 json 都返回带时间戳的完整结构
    payload = {
        "task": "transcribe",
        "language": result["language"],
        "duration": result["duration"],
        "text": result["text"],
    }
    if response_format == "verbose_json":
        payload["words"] = result["words"]
        payload["segments"] = result["segments"]
    else:
        # 标准 json 只要求 text；这里额外附带时间戳，方便下游直接使用
        payload["words"] = result["words"]
        payload["segments"] = result["segments"]
    return JSONResponse(payload)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        app,
        host=os.getenv("STT_HOST", "0.0.0.0"),
        port=int(os.getenv("STT_PORT", "8000")),
    )
