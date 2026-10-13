#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

if [ ! -d ".venv" ]; then
  echo "[local-stt] 创建虚拟环境..."
  python3 -m venv .venv
fi

echo "[local-stt] 安装依赖..."
./.venv/bin/python -m pip install --upgrade pip >/dev/null
./.venv/bin/python -m pip install -r requirements.txt

echo "[local-stt] 启动服务 (http://localhost:8000) ..."
exec ./.venv/bin/python -m uvicorn server:app --host 0.0.0.0 --port 8000
