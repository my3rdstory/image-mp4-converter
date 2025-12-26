# 정지 이미지 모션 MP4 변환기

정지 이미지를 다양한 모션 이펙트와 3단계 줌 강도로 변환하는 Python 웹 앱입니다. 결과 영상은 16:9 FHD(1920x1080), 60fps입니다.

## 요구 사항

- Python 3.10+
- `ffmpeg` (PATH에 등록)
- (선택) `uv`

## OS별 설치 및 실행

아래 모든 OS 공통으로 먼저 저장소를 내려받습니다.

```bash
git clone https://github.com/my3rdstory/image-mp4-converter.git
cd image-mp4-converter
```

### Windows (Git Bash 또는 WSL2)

Git Bash를 쓰는 경우:

```powershell
winget install Python.Python.3.11
winget install Gyan.FFmpeg
winget install Git.Git
```

Git Bash에서 실행:

```bash
chmod +x run.sh
./run.sh
```

WSL2를 쓰는 경우:

```bash
sudo apt update
sudo apt install -y python3 python3-venv ffmpeg
chmod +x run.sh
./run.sh
```

### macOS

```bash
brew install python@3.11 ffmpeg
brew install uv
chmod +x run.sh
./run.sh
```

### Linux (Ubuntu/Debian)

```bash
sudo apt update
sudo apt install -y python3 python3-venv ffmpeg
chmod +x run.sh
./run.sh
```

`uv`가 없거나 설치가 어려운 환경은 아래처럼 실행할 수 있습니다.

```bash
USE_UV=0 ./run.sh
```

브라우저에서 `http://127.0.0.1:1031/`로 접속하세요.

## systemd로 실행 (Linux)

서비스 파일을 `/etc/systemd/system`에 복사한 뒤 활성화합니다.

```bash
sudo cp image-mp4-converter.service /etc/systemd/system/image-mp4-converter.service
sudo systemctl daemon-reload
sudo systemctl enable --now image-mp4-converter
```

외부 접속이 필요하면 `HOST=0.0.0.0`으로 설정하세요. 필요 시 override로 환경 변수를 덮어쓸 수 있습니다.

```bash
sudo systemctl edit image-mp4-converter
```

```ini
[Service]
Environment=HOST=0.0.0.0
Environment=PORT=1031
Environment=USE_UV=1
```

변경 후 재시작합니다.

```bash
sudo systemctl restart image-mp4-converter
```

상태와 로그는 아래에서 확인합니다.

```bash
sudo systemctl status image-mp4-converter --no-pager
journalctl -u image-mp4-converter -f
```

외부에서 접속하려면 방화벽/보안그룹에서 포트를 열어야 합니다.

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

<img src="static/nextmoney-oksusu.jpg" alt="기부 QR 코드" width="186" height="188">

## 참고

- 기본 호스트는 `127.0.0.1`이며, 외부 접속이 필요하면 `HOST=0.0.0.0 ./run.sh`를 사용하세요.
- systemd 배포용 서비스 파일은 `image-mp4-converter.service`이며, 환경 변수는 override로 변경하는 것을 권장합니다.
- 기본 포트는 `1031`이며, `PORT=9000 ./run.sh`처럼 변경할 수 있습니다.
- 변환 시간 입력값은 브라우저에 저장되어 다음 드롭의 기본값으로 사용됩니다.
- 이펙트 설정 파일은 `effects/` 폴더의 JSON으로 관리됩니다.

## 라이선스

MIT License. 자세한 내용은 `LICENSE`를 참고하세요.
