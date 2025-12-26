const dropZone = document.getElementById("drop-zone");
const fileInput = document.getElementById("file-input");
const durationInput = document.getElementById("duration");
const stageSelect = document.getElementById("stage");
const logEl = document.getElementById("log");
const clearLogButton = document.getElementById("clear-log");
const resultPanel = document.getElementById("result-panel");
const downloadLink = document.getElementById("download-link");
const downloadHint = document.getElementById("download-hint");

const STORAGE_KEYS = {
  duration: "kenburns_duration",
  stage: "kenburns_stage",
};

const STAGE_LABELS = {
  1: "1단계 (줌 1.10배)",
  2: "2단계 (줌 1.20배)",
  3: "3단계 (줌 1.30배)",
};

function logLine(message) {
  const timestamp = new Date().toLocaleTimeString();
  const line = `[${timestamp}] ${message}`;
  logEl.textContent = logEl.textContent ? `${logEl.textContent}\n${line}` : line;
  logEl.scrollTop = logEl.scrollHeight;
}

let currentDownloadUrl = null;

function resetDownload() {
  if (currentDownloadUrl) {
    URL.revokeObjectURL(currentDownloadUrl);
    currentDownloadUrl = null;
  }
  downloadLink.removeAttribute("href");
  resultPanel.classList.remove("is-visible");
  downloadHint.textContent = "자동 다운로드가 차단되면 위 버튼을 눌러주세요.";
}

function showDownload(url, filename) {
  currentDownloadUrl = url;
  downloadLink.href = url;
  downloadLink.download = filename;
  resultPanel.classList.add("is-visible");
}

function setBusy(isBusy) {
  durationInput.disabled = isBusy;
  stageSelect.disabled = isBusy;
  fileInput.disabled = isBusy;
  dropZone.classList.toggle("is-busy", isBusy);
  dropZone.setAttribute("aria-disabled", isBusy ? "true" : "false");
}

function restoreDefaults() {
  const storedDuration = localStorage.getItem(STORAGE_KEYS.duration);
  const storedStage = localStorage.getItem(STORAGE_KEYS.stage);

  if (storedDuration) {
    durationInput.value = storedDuration;
  }
  if (storedStage) {
    stageSelect.value = storedStage;
  }
}

function persistDefaults() {
  localStorage.setItem(STORAGE_KEYS.duration, durationInput.value);
  localStorage.setItem(STORAGE_KEYS.stage, stageSelect.value);
}

async function parseError(response) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const data = await response.json();
    return data.detail || "서버 응답이 예상과 다릅니다.";
  }
  return response.text();
}

async function convertFile(file) {
  if (!file || !file.type.startsWith("image/")) {
    logLine("올바른 이미지 파일을 넣어주세요.");
    return;
  }

  const duration = Number.parseFloat(durationInput.value || "5") || 5;
  const stage = Number.parseInt(stageSelect.value, 10) || 1;

  persistDefaults();
  setBusy(true);
  resetDownload();
  logLine(`변환 시작: ${STAGE_LABELS[stage] || "1단계"}, ${duration}초.`);

  const formData = new FormData();
  formData.append("file", file);
  formData.append("duration", duration);
  formData.append("stage", stage);

  try {
    const response = await fetch("/api/convert", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const detail = await parseError(response);
      throw new Error(detail);
    }

    logLine("렌더링 완료. 다운로드 준비 중...");
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const filename = `kenburns_stage_${stage}.mp4`;
    showDownload(url, filename);
    logLine("다운로드 링크를 준비했습니다.");
    const canAutoDownload = !("userActivation" in navigator) || navigator.userActivation.isActive;
    if (canAutoDownload) {
      downloadLink.click();
      logLine("자동 다운로드를 시도했습니다.");
    } else {
      downloadHint.textContent = "자동 다운로드가 차단될 수 있습니다. 버튼을 눌러주세요.";
      logLine("자동 다운로드가 차단될 수 있습니다. 버튼을 눌러주세요.");
    }
  } catch (error) {
    logLine(`오류: ${error.message}`);
  } finally {
    setBusy(false);
  }
}

function stopDefaults(event) {
  event.preventDefault();
  event.stopPropagation();
}

["dragenter", "dragover"].forEach((eventName) => {
  dropZone.addEventListener(eventName, (event) => {
    stopDefaults(event);
    dropZone.classList.add("is-dragover");
  });
});

["dragleave", "drop"].forEach((eventName) => {
  dropZone.addEventListener(eventName, (event) => {
    stopDefaults(event);
    dropZone.classList.remove("is-dragover");
  });
});

dropZone.addEventListener("drop", (event) => {
  if (fileInput.disabled) {
    logLine("변환이 끝나면 새 파일을 넣어주세요.");
    return;
  }
  const file = event.dataTransfer.files[0];
  convertFile(file);
});

fileInput.addEventListener("change", (event) => {
  if (fileInput.disabled) {
    logLine("변환이 끝나면 새 파일을 넣어주세요.");
    return;
  }
  const file = event.target.files[0];
  if (file) {
    convertFile(file);
  }
});

clearLogButton.addEventListener("click", () => {
  logEl.textContent = "";
});

durationInput.addEventListener("change", persistDefaults);
stageSelect.addEventListener("change", persistDefaults);

restoreDefaults();
resetDownload();
logLine("준비 완료. 이미지를 드롭해 시작하세요.");
