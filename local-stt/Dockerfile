FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DEBIAN_FRONTEND=noninteractive

WORKDIR /app

# ffmpeg: 音频解码；libgomp1: ctranslate2 (faster-whisper) 运行依赖
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg libgomp1 \
  && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY server.py .

# 模型文件持久化到卷，避免每次重建都重新下载
ENV STT_MODEL=large-v3 \
    STT_DEVICE=cpu \
    STT_COMPUTE_TYPE=int8 \
    STT_MODELS_DIR=/models
VOLUME ["/models"]

EXPOSE 8000
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000"]
