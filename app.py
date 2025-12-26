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
STAGE_PANS: Final = {
    1: (0.4, 0.45, 0.6, 0.55),
    2: (0.35, 0.4, 0.65, 0.6),
    3: (0.3, 0.35, 0.7, 0.65),
}
DEFAULT_FPS: Final = 60
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
    frames = max(1, int(round(duration * fps)))
    end_zoom = STAGE_ZOOMS.get(stage, STAGE_ZOOMS[1])
    pan = STAGE_PANS.get(stage, STAGE_PANS[1])
    pan_x_start, pan_y_start, pan_x_end, pan_y_end = pan
    pan_x_delta = pan_x_end - pan_x_start
    pan_y_delta = pan_y_end - pan_y_start
    denom = max(1, frames - 1)
    base_width = int(1920 * end_zoom)
    base_height = int(1080 * end_zoom)

    zoompan = (
        "zoompan="
        f"z='1+({end_zoom - 1.0:.4f})*on/{denom}'"
        f":x='(iw-iw/zoom)*({pan_x_start:.2f}+({pan_x_delta:.2f})*on/{denom})'"
        f":y='(ih-ih/zoom)*({pan_y_start:.2f}+({pan_y_delta:.2f})*on/{denom})'"
        f":d={frames}:s=1920x1080:fps={fps}"
    )
    vf = (
        f"scale={base_width}:{base_height}:force_original_aspect_ratio=increase,"
        f"crop={base_width}:{base_height},"
        f"{zoompan},"
        "format=yuv420p"
    )

    command = [
        "ffmpeg",
        "-y",
        "-framerate",
        str(fps),
        "-loop",
        "1",
        "-i",
        str(input_path),
        "-vf",
        vf,
        "-vsync",
        "cfr",
        "-r",
        str(fps),
        "-frames:v",
        str(frames),
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
        raise HTTPException(status_code=400, detail="빈 파일이 업로드되었습니다.")

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
