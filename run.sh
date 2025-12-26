#!/usr/bin/env bash
set -euo pipefail

uv venv
source .venv/bin/activate
uv sync

exec uvicorn app:app --host 0.0.0.0 --port 8005
