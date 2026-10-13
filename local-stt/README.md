# 本地 Whisper STT 服务

用 [faster-whisper](https://github.com/SYSTRAN/faster-whisper) 在本机运行 Whisper 模型，
对外提供**兼容 OpenAI** 的接口，供 ai-subtitles 调用，**完全不需要 API Key、不联网上传音频**。

- 接口：`POST /v1/audio/transcriptions`
- 返回：OpenAI `verbose_json` 结构，包含**词级时间戳**（`words`）与分段（`segments`）

## 安装

需要 Python 3.9+（推荐 3.10–3.12）。CPU 即可运行。

```bash
cd local-stt
python -m venv .venv
# Windows
.venv\Scripts\activate
# macOS/Linux
source .venv/bin/activate
pip install -r requirements.txt
```

或者直接用脚本一键安装并启动：Windows 双击 `run.bat`，macOS/Linux 执行 `./run.sh`。

## 启动

```bash
uvicorn server:app --host 0.0.0.0 --port 8000
```

看到 `Uvicorn running on http://0.0.0.0:8000` 即成功。首次使用某个模型时会自动从
HuggingFace 下载（large-v3 约 1.5GB），请保持网络通畅。

> **国内网络下载模型慢/失败？** 设置镜像后再启动：
> ```bash
> # Windows (PowerShell)
> $env:HF_ENDPOINT="https://hf-mirror.com"; uvicorn server:app --host 0.0.0.0 --port 8000
> # macOS/Linux
> HF_ENDPOINT=https://hf-mirror.com uvicorn server:app --host 0.0.0.0 --port 8000
> ```
> Docker Compose 中也可给 `local-stt` 服务加环境变量 `HF_ENDPOINT: https://hf-mirror.com`。

## 配置

通过环境变量或 `.env`（见 `.env.example`）配置：

| 变量 | 说明 | 默认 |
| --- | --- | --- |
| `STT_MODEL` | 默认模型：tiny/base/small/medium/large-v3 | `large-v3` |
| `STT_DEVICE` | `cpu` 或 `cuda` | `cpu` |
| `STT_COMPUTE_TYPE` | `int8` / `float16` / `int8_float16` | `int8` |
| `STT_BEAM_SIZE` | 束搜索宽度 | `5` |
| `STT_MODELS_DIR` | 模型下载目录 | `./models` |
| `STT_VAD` | 是否启用 VAD 过滤静音 | `true` |
| `STT_HOST` / `STT_PORT` | 监听地址/端口 | `0.0.0.0` / `8000` |

> 性能：CPU 上 `large-v3` 较慢（约为音频时长的数倍），建议先用 `small` 或 `medium` 体验；
> 有 NVIDIA 显卡时设 `STT_DEVICE=cuda`、`STT_COMPUTE_TYPE=float16` 会快很多。

## 在 ai-subtitles 中使用

1. 启动本服务（默认 `http://localhost:8000`）。
2. 打开 ai-subtitles，点击右上角**「接口设置」**。
3. 语音识别选择**「本地 Whisper」**，接口地址填 `http://localhost:8000/v1`，模型名填
   `large-v3`（或你用的模型），无需填 Key。
4. 上传视频即可。

## Docker

```bash
docker build -t local-stt .
docker run -p 8000:8000 -v whisper-models:/models -e STT_MODEL=large-v3 local-stt
```

根目录 `docker-compose.yml` 也已包含该服务（见注释）。

## 接口自测

```bash
curl http://localhost:8000/health
curl -X POST http://localhost:8000/v1/audio/transcriptions \
  -F file=@test.mp3 -F model=large-v3 -F response_format=verbose_json
```

## 常见问题

- **`TypeError: open() got an unexpected keyword argument 'metadata_errors'`**
  这是 PyAV 19 的破坏性变更，`requirements.txt` 已用 `av<19` 规避。若手动装过 `av`，
  请执行 `pip install "av<19"`。
- **转写报 `ReadTimeout` / 连接 HuggingFace 失败**：见上方 `HF_ENDPOINT` 镜像设置。
- **模型下载后仍报找不到**：确认 `STT_MODELS_DIR` 可写，且容器/进程有权限读取该目录。
