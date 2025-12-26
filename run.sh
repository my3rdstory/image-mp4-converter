#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

LOG_FILE="${LOG_FILE:-run.log}"
exec > >(tee -a "$LOG_FILE") 2>&1

echo "[$(date '+%Y-%m-%d %H:%M:%S')] 시작: image-mp4-converter 서버"

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "ffmpeg가 설치되어 있지 않습니다. 먼저 ffmpeg를 설치해주세요."
  exit 1
fi

PYTHON_BIN=""
if command -v python3 >/dev/null 2>&1; then
  PYTHON_BIN="python3"
elif command -v python >/dev/null 2>&1; then
  PYTHON_BIN="python"
else
  echo "Python 3.10+가 필요합니다. python3를 설치해주세요."
  exit 1
fi

if ! "$PYTHON_BIN" - <<'PY'
import sys
if sys.version_info < (3, 10):
    raise SystemExit("Python 3.10+가 필요합니다.")
PY
then
  exit 1
fi

VENV_DIR="${VENV_DIR:-.venv}"
USE_UV="${USE_UV:-1}"

mkdir -p .uv-cache
export UV_CACHE_DIR="$(pwd)/.uv-cache"
export XDG_CACHE_HOME="$(pwd)/.uv-cache"

if [ "$USE_UV" = "1" ] && command -v uv >/dev/null 2>&1; then
  uv venv "$VENV_DIR" --python "$PYTHON_BIN" --allow-existing --no-managed-python
  source "$VENV_DIR/bin/activate"
  uv sync
else
  if [ ! -d "$VENV_DIR" ]; then
    "$PYTHON_BIN" -m venv "$VENV_DIR"
  fi
  source "$VENV_DIR/bin/activate"
  if ! python -m pip --version >/dev/null 2>&1; then
    if python -m ensurepip --upgrade >/dev/null 2>&1; then
      :
    else
      echo "pip 설치에 실패했습니다. python3-venv 패키지를 확인해주세요."
      exit 1
    fi
  fi
  python -m pip install --upgrade pip
  if [ ! -f requirements.txt ]; then
    echo "requirements.txt가 없습니다. 배포용 의존성 목록을 확인해주세요."
    exit 1
  fi
  python -m pip install -r requirements.txt
fi

HOST="${HOST:-127.0.0.1}"
PORT="${PORT:-1031}"

echo "접속 주소: http://127.0.0.1:${PORT}/"
python -m uvicorn app:app --host "$HOST" --port "$PORT"
