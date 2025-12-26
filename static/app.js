const dropZone = document.getElementById("drop-zone");
const fileInput = document.getElementById("file-input");
const durationInput = document.getElementById("duration");
const stageSelect = document.getElementById("stage");
const effectButtons = Array.from(document.querySelectorAll(".effect-button"));
const logEl = document.getElementById("log");
const clearLogButton = document.getElementById("clear-log");
const downloadLink = document.getElementById("download-link");
const downloadHint = document.getElementById("download-hint");
const progressFill = document.querySelector(".progress-fill");
const thumbsGrid = document.getElementById("thumbs");

const STORAGE_KEYS = {
  duration: "kenburns_duration",
  effect: "kenburns_effect",
  stage: "kenburns_stage",
};

const STAGE_LABELS = {
  1: "1단계",
  2: "2단계",
  3: "3단계",
};

const MAX_FILES = 20;
const POLL_INTERVAL_MS = 500;

let progressTimer = null;
let isPolling = false;
let isProcessing = false;
let randomizeEffects = false;

const queue = [];

function logLine(message) {
  const timestamp = new Date().toLocaleTimeString();
  const line = `[${timestamp}] ${message}`;
  logEl.textContent = logEl.textContent ? `${logEl.textContent}\n${line}` : line;
  logEl.scrollTop = logEl.scrollHeight;
}

function setProgress(value) {
  const clamped = Math.max(0, Math.min(100, value));
  if (progressFill) {
    progressFill.style.width = `${clamped}%`;
  }
}

function stopProgressPolling() {
  if (progressTimer) {
    clearInterval(progressTimer);
    progressTimer = null;
  }
  isPolling = false;
}

function setDownloadEnabled(enabled) {
  downloadLink.classList.toggle("is-disabled", !enabled);
  downloadLink.setAttribute("aria-disabled", enabled ? "false" : "true");
}

function resetDownload() {
  downloadLink.removeAttribute("href");
  setDownloadEnabled(false);
  downloadHint.textContent = "변환이 완료되면 자동 다운로드됩니다.";
}

function showDownload(jobId, filename) {
  downloadLink.href = `/api/download/${jobId}`;
  downloadLink.download = filename;
  setDownloadEnabled(true);
}

function triggerAutoDownload(jobId, filename) {
  showDownload(jobId, filename);
  const iframe = document.createElement("iframe");
  iframe.style.display = "none";
  iframe.src = downloadLink.href;
  document.body.appendChild(iframe);
  setTimeout(() => iframe.remove(), 60000);
}

function setBusy(isBusy) {
  durationInput.disabled = isBusy;
  stageSelect.disabled = isBusy;
  fileInput.disabled = isBusy;
  effectButtons.forEach((button) => {
    button.disabled = isBusy;
    button.classList.toggle("is-disabled", isBusy);
  });
  dropZone.classList.toggle("is-busy", isBusy);
  dropZone.setAttribute("aria-disabled", isBusy ? "true" : "false");
}

function getActiveEffectButton() {
  return (
    effectButtons.find((button) => button.classList.contains("is-active")) ||
    effectButtons[0]
  );
}

function setActiveEffect(effectId) {
  let matched = false;
  effectButtons.forEach((button) => {
    const isActive = button.dataset.effect === effectId;
    button.classList.toggle("is-active", isActive);
    if (isActive) {
      matched = true;
    }
  });
  if (!matched && effectButtons[0]) {
    effectButtons[0].classList.add("is-active");
  }
}

function getActiveEffect() {
  const button = getActiveEffectButton();
  if (!button) {
    return { id: "zoom_in_center", label: "줌 인 (중앙)" };
  }
  return {
    id: button.dataset.effect || "zoom_in_center",
    label: button.dataset.label || button.textContent.trim(),
  };
}

function getRandomEffect() {
  if (!effectButtons.length) {
    return { id: "zoom_in_center", label: "줌 인 (중앙)" };
  }
  const index = Math.floor(Math.random() * effectButtons.length);
  const button = effectButtons[index];
  return {
    id: button.dataset.effect || "zoom_in_center",
    label: button.dataset.label || button.textContent.trim(),
  };
}

function restoreDefaults() {
  const storedDuration = localStorage.getItem(STORAGE_KEYS.duration);
  const storedEffect = localStorage.getItem(STORAGE_KEYS.effect);
  const storedStage = localStorage.getItem(STORAGE_KEYS.stage);

  if (storedDuration) {
    durationInput.value = storedDuration;
  }
  if (storedEffect) {
    setActiveEffect(storedEffect);
  }
  if (storedStage) {
    stageSelect.value = storedStage;
  }
}

function persistDefaults() {
  const { id: effectId } = getActiveEffect();
  localStorage.setItem(STORAGE_KEYS.duration, durationInput.value);
  localStorage.setItem(STORAGE_KEYS.effect, effectId);
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

function createThumbnail(file) {
  const wrapper = document.createElement("div");
  wrapper.className = "thumb-item";
  const img = document.createElement("img");
  const url = URL.createObjectURL(file);
  img.src = url;
  img.onload = () => URL.revokeObjectURL(url);
  const status = document.createElement("div");
  status.className = "thumb-status";
  status.textContent = "변환완료";
  wrapper.appendChild(img);
  wrapper.appendChild(status);
  thumbsGrid.appendChild(wrapper);
  return wrapper;
}

function enqueueFiles(files) {
  const images = files.filter((file) => file.type.startsWith("image/"));
  if (images.length === 0) {
    logLine("올바른 이미지 파일을 넣어주세요.");
    return;
  }

  if (!isProcessing && queue.length === 0) {
    resetDownload();
    setProgress(0);
  }

  const activeCount = queue.filter(
    (item) => item.status === "pending" || item.status === "processing",
  ).length;
  const available = MAX_FILES - queue.length;
  if (available <= 0) {
    logLine("최대 20장까지 추가할 수 있습니다.");
    return;
  }

  const toAdd = images.slice(0, available);
  const shouldRandomize = activeCount + toAdd.length >= 2 || randomizeEffects;
  if (shouldRandomize && !randomizeEffects) {
    randomizeEffects = true;
    logLine("두 장 이상 변환 시 이펙트는 랜덤으로 적용됩니다.");
  }

  toAdd.forEach((file) => {
    const { id: effectId, label } = getActiveEffect();
    const duration = Number.parseFloat(durationInput.value || "5") || 5;
    const stage = Number.parseInt(stageSelect.value, 10) || 1;
    const element = createThumbnail(file);
    queue.push({
      file,
      element,
      status: "pending",
      effectId,
      label,
      duration,
      stage,
    });
  });

  if (images.length > available) {
    logLine(`최대 20장까지 가능해서 ${images.length - available}장은 제외했습니다.`);
  }

  logLine(`${toAdd.length}장 추가했습니다. 대기열: ${queue.length}장.`);
  persistDefaults();
  startNext();
}

async function pollProgress(jobId, filename, item) {
  if (isPolling) {
    return;
  }
  isPolling = true;
  try {
    const response = await fetch(`/api/progress/${jobId}`);
    if (!response.ok) {
      throw new Error(await parseError(response));
    }
    const data = await response.json();
    const progress = Math.round((data.progress || 0) * 100);
    setProgress(progress);

    if (data.status === "done") {
      stopProgressPolling();
      setProgress(100);
      triggerAutoDownload(jobId, filename);
      logLine("변환 완료. 다운로드를 시작합니다.");
      item.status = "done";
      item.element.classList.remove("is-processing");
      item.element.classList.add("is-done");
      isProcessing = false;
      startNext();
    } else if (data.status === "error") {
      stopProgressPolling();
      logLine(`오류: ${data.error || "처리 중 문제가 발생했습니다."}`);
      item.status = "error";
      item.element.classList.remove("is-processing");
      isProcessing = false;
      startNext();
    }
  } catch (error) {
    stopProgressPolling();
    logLine(`오류: ${error.message}`);
    item.status = "error";
    item.element.classList.remove("is-processing");
    isProcessing = false;
    startNext();
  } finally {
    isPolling = false;
  }
}

function startProgressPolling(jobId, filename, item) {
  stopProgressPolling();
  progressTimer = setInterval(() => {
    pollProgress(jobId, filename, item);
  }, POLL_INTERVAL_MS);
  pollProgress(jobId, filename, item);
}

async function startConversion(item) {
  const filename = `motion_${item.effectId}.mp4`;
  const formData = new FormData();
  formData.append("file", item.file);
  formData.append("duration", item.duration);
  formData.append("effect", item.effectId);
  formData.append("stage", item.stage);

  try {
    const response = await fetch("/api/convert", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const detail = await parseError(response);
      throw new Error(detail);
    }

    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const data = await response.json();
      if (!data.job_id) {
        throw new Error("작업 ID를 받지 못했습니다.");
      }
      startProgressPolling(data.job_id, filename, item);
      return;
    }

    if (contentType.includes("video/mp4")) {
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      downloadLink.href = url;
      downloadLink.download = filename;
      setDownloadEnabled(true);
      setProgress(100);
      logLine("변환 완료. 다운로드를 시작합니다.");
      item.status = "done";
      item.element.classList.remove("is-processing");
      item.element.classList.add("is-done");
      downloadLink.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      isProcessing = false;
      startNext();
      return;
    }

    throw new Error("알 수 없는 응답 형식입니다.");
  } catch (error) {
    logLine(`오류: ${error.message}`);
    item.status = "error";
    item.element.classList.remove("is-processing");
    isProcessing = false;
    startNext();
  }
}

function startNext() {
  if (isProcessing) {
    return;
  }
  const nextItem = queue.find((item) => item.status === "pending");
  if (!nextItem) {
    setBusy(false);
    setProgress(0);
    randomizeEffects = false;
    return;
  }

  isProcessing = true;
  setBusy(true);
  setProgress(0);
  nextItem.status = "processing";
  nextItem.element.classList.add("is-processing");

  if (randomizeEffects) {
    const randomEffect = getRandomEffect();
    nextItem.effectId = randomEffect.id;
    nextItem.label = randomEffect.label;
  }

  logLine(
    `변환 시작: ${nextItem.label}, ${nextItem.duration}초, ${
      STAGE_LABELS[nextItem.stage] || "1단계"
    }.`,
  );
  startConversion(nextItem);
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
  const files = Array.from(event.dataTransfer.files || []);
  enqueueFiles(files);
});

fileInput.addEventListener("change", (event) => {
  if (fileInput.disabled) {
    logLine("변환이 끝나면 새 파일을 넣어주세요.");
    return;
  }
  const files = Array.from(event.target.files || []);
  if (files.length) {
    enqueueFiles(files);
  }
  event.target.value = "";
});

effectButtons.forEach((button) => {
  button.addEventListener("click", () => {
    setActiveEffect(button.dataset.effect);
    persistDefaults();
  });
});

clearLogButton.addEventListener("click", () => {
  logEl.textContent = "";
});

durationInput.addEventListener("change", persistDefaults);
stageSelect.addEventListener("change", persistDefaults);

restoreDefaults();
resetDownload();
setProgress(0);
logLine("준비 완료. 이미지를 드롭해 시작하세요.");
