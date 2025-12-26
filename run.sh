#!/usr/bin/env bash
set -euo pipefail

LOG_FILE="run.log"
exec > >(tee -a "$LOG_FILE") 2>&1

echo "[$(date '+%Y-%m-%d %H:%M:%S')] 시작: kenburn-video 서버"

if ! command -v uv >/dev/null 2>&1; then
  echo "uv가 설치되어 있지 않습니다. 먼저 uv를 설치해주세요."
  exit 1
fi

mkdir -p .uv-cache
export UV_CACHE_DIR="$(pwd)/.uv-cache"
export XDG_CACHE_HOME="$(pwd)/.uv-cache"

uv venv
source .venv/bin/activate
uv sync

echo "uvicorn 실행: http://127.0.0.1:8005"
uvicorn app:app --host 0.0.0.0 --port 8005
