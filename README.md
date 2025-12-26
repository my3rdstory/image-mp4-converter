# 정지 이미지 모션 MP4 변환기

정지 이미지를 다양한 모션 이펙트와 3단계 줌 강도로 변환하는 Python 웹 앱입니다. 결과 영상은 16:9 FHD(1920x1080), 60fps입니다.

## 요구 사항

- Python 3.10+
- `ffmpeg` (PATH에 등록)
- (선택) `uv`

## OS별 설치 및 실행

### Windows (Git Bash 또는 WSL2)

Git Bash를 쓰는 경우:

```powershell
winget install Python.Python.3.11
winget install Gyan.FFmpeg
winget install Git.Git
```

Git Bash에서 실행:

```bash
cd /c/path/image-mp4-converter
chmod +x run.sh
./run.sh
```

WSL2를 쓰는 경우:

```bash
sudo apt update
sudo apt install -y python3 python3-venv ffmpeg
cd /mnt/c/path/image-mp4-converter
chmod +x run.sh
./run.sh
```

### macOS

```bash
brew install python@3.11 ffmpeg
brew install uv
cd /path/image-mp4-converter
chmod +x run.sh
./run.sh
```

### Linux (Ubuntu/Debian)

```bash
sudo apt update
sudo apt install -y python3 python3-venv ffmpeg
cd /path/image-mp4-converter
chmod +x run.sh
./run.sh
```

`uv`가 없거나 설치가 어려운 환경은 아래처럼 실행할 수 있습니다.

```bash
USE_UV=0 ./run.sh
```

브라우저에서 `http://127.0.0.1:1031/`로 접속하세요.

## 수동 설정 (선택)

### uv

```bash
uv venv
source .venv/bin/activate
uv sync
```

### pip

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
```

## 기부

기부는 `nextmoney@oksu.su`로 보내주세요.

![기부 QR 코드](static/nextmoney-oksusu.jpg)

## 참고

- 기본 호스트는 `127.0.0.1`이며, 외부 접속이 필요하면 `HOST=0.0.0.0 ./run.sh`를 사용하세요.
- 기본 포트는 `1031`이며, `PORT=9000 ./run.sh`처럼 변경할 수 있습니다.
- 변환 시간 입력값은 브라우저에 저장되어 다음 드롭의 기본값으로 사용됩니다.
- 이펙트 설정 파일은 `effects/` 폴더의 JSON으로 관리됩니다.

## 라이선스

MIT License. 자세한 내용은 `LICENSE`를 참고하세요.
