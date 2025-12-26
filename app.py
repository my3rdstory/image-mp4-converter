from __future__ import annotations

import json
import shutil
import subprocess
import tempfile
import time
from dataclasses import dataclass
from pathlib import Path
from threading import Lock, Thread
from typing import Callable, Final
from uuid import uuid4

from fastapi import BackgroundTasks, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

BASE_DIR: Final = Path(__file__).resolve().parent
STATIC_DIR: Final = BASE_DIR / "static"
EFFECTS_DIR: Final = BASE_DIR / "effects"
FAVICON_PATH: Final = BASE_DIR / "favicon.png"

app = FastAPI()
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

DEFAULT_EFFECT_ID: Final = "zoom_in_center"
OUTPUT_FPS: Final = 60
INTERNAL_FPS: Final = 90
MAX_DURATION_SECONDS: Final = 60.0
DEFAULT_ZOOM_RATE: Final = 0.015
MAX_ZOOM: Final = 1.6
DEFAULT_PAN: Final = (0.5, 0.5)
OUTPUT_WIDTH: Final = 1920
OUTPUT_HEIGHT: Final = 1080
OVERSAMPLE_FACTOR: Final = 2
STAGE_MULTIPLIERS: Final = {1: 1.0, 2: 1.35, 3: 1.7}


@dataclass
class Job:
    id: str
    status: str
    progress: float
    error: str | None
    work_dir: Path
    input_path: Path
    output_path: Path
    filename: str
    created_at: float


JOBS: dict[str, Job] = {}
JOBS_LOCK: Final = Lock()


@app.get("/")
async def index() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/favicon.png")
async def favicon() -> FileResponse:
    return FileResponse(FAVICON_PATH)




def clamp_duration(seconds: float) -> float:
    if seconds <= 0:
        return 5.0
    return min(seconds, MAX_DURATION_SECONDS)


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(value, high))


def parse_point(value: object, fallback: tuple[float, float]) -> tuple[float, float]:
    try:
        x, y = value  # type: ignore[misc]
        return (clamp(float(x), 0.0, 1.0), clamp(float(y), 0.0, 1.0))
    except (TypeError, ValueError):
        return fallback


def load_effects() -> dict[str, dict[str, object]]:
    effects: dict[str, dict[str, object]] = {}
    if EFFECTS_DIR.exists():
        for path in sorted(EFFECTS_DIR.glob("*.json")):
            try:
                data = json.loads(path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                continue
            effect_id = str(data.get("id") or path.stem)
            zoom_rate = clamp(float(data.get("zoom_rate", DEFAULT_ZOOM_RATE)), 0.0, 0.05)
            zoom_direction = data.get("zoom_direction", "in")
            if zoom_direction not in ("in", "out"):
                zoom_direction = "in"
            pan_start = parse_point(data.get("pan_start"), DEFAULT_PAN)
            pan_end = parse_point(data.get("pan_end"), DEFAULT_PAN)
            effects[effect_id] = {
                "id": effect_id,
                "zoom_rate": zoom_rate,
                "zoom_direction": zoom_direction,
                "pan_start": pan_start,
                "pan_end": pan_end,
            }
    if DEFAULT_EFFECT_ID not in effects:
        effects[DEFAULT_EFFECT_ID] = {
            "id": DEFAULT_EFFECT_ID,
            "zoom_rate": DEFAULT_ZOOM_RATE,
            "zoom_direction": "in",
            "pan_start": DEFAULT_PAN,
            "pan_end": DEFAULT_PAN,
        }
    return effects


EFFECTS: Final = load_effects()


def resolve_effect_id(effect_id: str) -> str:
    return effect_id if effect_id in EFFECTS else DEFAULT_EFFECT_ID


def get_effect(effect_id: str) -> dict[str, object]:
    return EFFECTS.get(effect_id, EFFECTS[DEFAULT_EFFECT_ID])


def update_job(job_id: str, **updates: object) -> None:
    with JOBS_LOCK:
        job = JOBS.get(job_id)
        if not job:
            return
        for key, value in updates.items():
            setattr(job, key, value)


def get_job(job_id: str) -> Job | None:
    with JOBS_LOCK:
        return JOBS.get(job_id)


def cleanup_job(job_id: str) -> None:
    with JOBS_LOCK:
        job = JOBS.pop(job_id, None)
    if job:
        shutil.rmtree(job.work_dir, ignore_errors=True)


def run_ffmpeg(
    input_path: Path,
    output_path: Path,
    duration: float,
    effect_id: str,
    stage: int,
    on_progress: Callable[[int], None] | None = None,
) -> None:
    fps = OUTPUT_FPS
    internal_frames = max(1, int(round(duration * INTERNAL_FPS)))
    output_frames = max(1, int(round(duration * OUTPUT_FPS)))
    effect = get_effect(effect_id)
    zoom_rate = float(effect.get("zoom_rate", DEFAULT_ZOOM_RATE))
    zoom_rate *= STAGE_MULTIPLIERS.get(stage, 1.0)
    zoom_direction = effect.get("zoom_direction", "in")
    pan_start = effect.get("pan_start", DEFAULT_PAN)
    pan_end = effect.get("pan_end", DEFAULT_PAN)
    pan_x_start, pan_y_start = pan_start
    pan_x_end, pan_y_end = pan_end
    pan_x_delta = pan_x_end - pan_x_start
    pan_y_delta = pan_y_end - pan_y_start
    denom = max(1, internal_frames - 1)

    zoom_delta = max(0.0, min(MAX_ZOOM - 1.0, zoom_rate * duration))
    if zoom_direction == "out":
        start_zoom = 1.0 + zoom_delta
        end_zoom = 1.0
    else:
        start_zoom = 1.0
        end_zoom = 1.0 + zoom_delta

    max_zoom = max(start_zoom, end_zoom)
    target_width = OUTPUT_WIDTH * OVERSAMPLE_FACTOR
    target_height = OUTPUT_HEIGHT * OVERSAMPLE_FACTOR
    base_width = int(round(target_width * max_zoom))
    base_height = int(round(target_height * max_zoom))
    zoom_span = end_zoom - start_zoom
    ease = f"(0.5-0.5*cos(PI*on/{denom}))"

    zoompan = (
        "zoompan="
        f"z='{start_zoom:.6f}+({zoom_span:.6f})*{ease}'"
        f":x='(iw-iw/zoom)*({pan_x_start:.4f}+({pan_x_delta:.4f})*{ease})'"
        f":y='(ih-ih/zoom)*({pan_y_start:.4f}+({pan_y_delta:.4f})*{ease})'"
        f":d={internal_frames}:s={target_width}x{target_height}:fps={INTERNAL_FPS}"
    )
    vf = (
        f"scale={base_width}:{base_height}:force_original_aspect_ratio=increase:flags=lanczos,"
        f"crop={base_width}:{base_height},"
        f"{zoompan},"
        f"scale={OUTPUT_WIDTH}:{OUTPUT_HEIGHT}:flags=lanczos,"
        "tmix=frames=3:weights='1 1 1',"
        f"fps={OUTPUT_FPS},"
        "format=yuv420p"
    )

    command = [
        "ffmpeg",
        "-y",
        "-loglevel",
        "error",
        "-nostats",
        "-progress",
        "pipe:1",
        "-framerate",
        str(INTERNAL_FPS),
        "-loop",
        "1",
        "-i",
        str(input_path),
        "-vf",
        vf,
        "-vsync",
        "cfr",
        "-r",
        str(OUTPUT_FPS),
        "-frames:v",
        str(output_frames),
        "-movflags",
        "+faststart",
        str(output_path),
    ]

    output_lines: list[str] = []
    process = subprocess.Popen(
        command,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )

    assert process.stdout is not None
    for line in process.stdout:
        text = line.strip()
        if text:
            output_lines.append(text)
            if len(output_lines) > 80:
                output_lines.pop(0)
        if "=" in text:
            key, value = text.split("=", 1)
            if key == "out_time_ms" and on_progress:
                try:
                    out_time_us = int(value)
                except ValueError:
                    continue
                on_progress(out_time_us)

    return_code = process.wait()
    if return_code != 0:
        tail = "\n".join(output_lines[-20:])
        raise RuntimeError(tail or "FFmpeg 처리 중 오류가 발생했습니다.")


def render_job(job_id: str, duration: float, effect_id: str, stage: int) -> None:
    job = get_job(job_id)
    if not job:
        return

    def handle_progress(out_time_us: int) -> None:
        progress = min(out_time_us / (duration * 1_000_000), 1.0)
        update_job(job_id, progress=progress)

    try:
        run_ffmpeg(
            input_path=job.input_path,
            output_path=job.output_path,
            duration=duration,
            effect_id=effect_id,
            stage=stage,
            on_progress=handle_progress,
        )
    except Exception as exc:
        update_job(job_id, status="error", error=str(exc))
        return

    update_job(job_id, status="done", progress=1.0)


@app.post("/api/convert")
async def convert(
    file: UploadFile = File(...),
    duration: float = Form(5.0),
    effect: str = Form(DEFAULT_EFFECT_ID),
    stage: int = Form(1),
) -> dict[str, str]:
    duration = clamp_duration(duration)
    effect_id = resolve_effect_id(effect)
    stage = stage if stage in STAGE_MULTIPLIERS else 1

    work_dir = Path(tempfile.mkdtemp(prefix="kenburns_"))
    safe_name = Path(file.filename or "input").name
    input_path = work_dir / safe_name
    output_path = work_dir / "motion.mp4"

    payload = await file.read()
    if not payload:
        shutil.rmtree(work_dir, ignore_errors=True)
        raise HTTPException(status_code=400, detail="빈 파일이 업로드되었습니다.")

    input_path.write_bytes(payload)

    job_id = uuid4().hex
    job = Job(
        id=job_id,
        status="processing",
        progress=0.0,
        error=None,
        work_dir=work_dir,
        input_path=input_path,
        output_path=output_path,
        filename=f"motion_{effect_id}.mp4",
        created_at=time.time(),
    )

    with JOBS_LOCK:
        JOBS[job_id] = job

    thread = Thread(target=render_job, args=(job_id, duration, effect_id, stage), daemon=True)
    thread.start()

    return {"job_id": job_id}


@app.get("/api/progress/{job_id}")
async def progress(job_id: str) -> dict[str, object]:
    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="작업을 찾을 수 없습니다.")
    return {
        "status": job.status,
        "progress": job.progress,
        "error": job.error,
    }


@app.get("/api/download/{job_id}")
async def download(job_id: str, background_tasks: BackgroundTasks) -> FileResponse:
    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="작업을 찾을 수 없습니다.")
    if job.status != "done":
        raise HTTPException(status_code=409, detail="아직 다운로드 준비가 되지 않았습니다.")
    if not job.output_path.exists():
        raise HTTPException(status_code=410, detail="결과 파일이 없습니다.")

    background_tasks.add_task(cleanup_job, job_id)
    return FileResponse(
        job.output_path,
        media_type="video/mp4",
        filename=job.filename,
        background=background_tasks,
    )
