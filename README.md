# Ken Burns 영상 변환기

정지 이미지를 Ken Burns 효과가 적용된 MP4로 변환하는 간단한 Python 웹 앱입니다. 결과 영상은 16:9 FHD(1920x1080), 60fps입니다.

## 설정 (uv)

```bash
uv venv
source .venv/bin/activate
uv sync
```

## 실행

```bash
./run.sh
```

브라우저에서 `http://127.0.0.1:8005`로 접속하세요.

## 참고

- `ffmpeg`가 설치되어 있고 PATH에 있어야 합니다.
- 변환 시간 입력값은 브라우저에 저장되어 다음 드롭의 기본값으로 사용됩니다.
