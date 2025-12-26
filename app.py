from __future__ import annotations

import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Final

from fastapi import BackgroundTasks, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

BASE_DIR: Final = Path(__file__).resolve().parent
STATIC_DIR: Final = BASE_DIR / "static"

app = FastAPI()
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

STAGE_ZOOMS: Final = {1: 1.10, 2: 1.20, 3: 1.30}
DEFAULT_FPS: Final = 30
MAX_DURATION_SECONDS: Final = 60.0


@app.get("/")
async def index() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")


def clamp_duration(seconds: float) -> float:
    if seconds <= 0:
        return 5.0
    return min(seconds, MAX_DURATION_SECONDS)


def run_ffmpeg(input_path: Path, output_path: Path, duration: float, stage: int) -> None:
    fps = DEFAULT_FPS
    frames = max(1, int(duration * fps))
    end_zoom = STAGE_ZOOMS.get(stage, STAGE_ZOOMS[1])
    zoom_inc = (end_zoom - 1.0) / frames

    # Keep the zoom centered to produce a clean Ken Burns effect.
    zoompan = (
        "zoompan="
        f"z='min(zoom+{zoom_inc:.6f},{end_zoom:.2f})'"
        ":x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'"
        f":d={frames}:fps={fps}"
    )
    vf = f"{zoompan},scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,format=yuv420p"

    command = [
        "ffmpeg",
        "-y",
        "-loop",
        "1",
        "-i",
        str(input_path),
        "-vf",
        vf,
        "-t",
        f"{duration:.2f}",
        "-movflags",
        "+faststart",
        str(output_path),
    ]

    try:
        subprocess.run(
            command,
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
    except subprocess.CalledProcessError as exc:
        raise RuntimeError(exc.stderr.decode("utf-8", errors="ignore")) from exc


@app.post("/api/convert")
async def convert(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    duration: float = Form(5.0),
    stage: int = Form(1),
) -> FileResponse:
    duration = clamp_duration(duration)
    stage = stage if stage in STAGE_ZOOMS else 1

    work_dir = Path(tempfile.mkdtemp(prefix="kenburns_"))
    safe_name = Path(file.filename or "input").name
    input_path = work_dir / safe_name
    output_path = work_dir / "kenburns.mp4"

    payload = await file.read()
    if not payload:
        shutil.rmtree(work_dir, ignore_errors=True)
        raise HTTPException(status_code=400, detail="Empty upload.")

    input_path.write_bytes(payload)

    try:
        run_ffmpeg(input_path, output_path, duration, stage)
    except RuntimeError as exc:
        shutil.rmtree(work_dir, ignore_errors=True)
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    background_tasks.add_task(shutil.rmtree, work_dir, ignore_errors=True)
    return FileResponse(
        output_path,
        media_type="video/mp4",
        filename=f"kenburns_stage_{stage}.mp4",
        background=background_tasks,
    )
