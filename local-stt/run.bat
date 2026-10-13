@echo off
setlocal
chcp 65001 >nul

cd /d "%~dp0"

if not exist ".venv" (
    echo [local-stt] 创建虚拟环境 ...
    py -3 -m venv .venv 2>nul || python -m venv .venv
)

echo [local-stt] 安装依赖 ...
call ".venv\Scripts\python.exe" -m pip install --upgrade pip >nul
call ".venv\Scripts\python.exe" -m pip install -r requirements.txt

echo [local-stt] 启动服务: http://localhost:8000
call ".venv\Scripts\python.exe" -m uvicorn server:app --host 0.0.0.0 --port 8000

endlocal
