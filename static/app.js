const dropZone = document.getElementById("drop-zone");
const fileInput = document.getElementById("file-input");
const durationInput = document.getElementById("duration");
const stageSelect = document.getElementById("stage");
const logEl = document.getElementById("log");
const clearLogButton = document.getElementById("clear-log");

const STORAGE_KEYS = {
  duration: "kenburns_duration",
  stage: "kenburns_stage",
};

const STAGE_LABELS = {
  1: "Stage 1 (gentle zoom 1.10x)",
  2: "Stage 2 (medium zoom 1.20x)",
  3: "Stage 3 (strong zoom 1.30x)",
};

function logLine(message) {
  const timestamp = new Date().toLocaleTimeString();
  const line = `[${timestamp}] ${message}`;
  logEl.textContent = logEl.textContent ? `${logEl.textContent}\n${line}` : line;
  logEl.scrollTop = logEl.scrollHeight;
}

function setBusy(isBusy) {
  durationInput.disabled = isBusy;
  stageSelect.disabled = isBusy;
  fileInput.disabled = isBusy;
  dropZone.classList.toggle("is-busy", isBusy);
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
    return data.detail || "Unexpected server response.";
  }
  return response.text();
}

async function convertFile(file) {
  if (!file || !file.type.startsWith("image/")) {
    logLine("Please drop a valid image file.");
    return;
  }

  const duration = Number.parseFloat(durationInput.value || "5") || 5;
  const stage = Number.parseInt(stageSelect.value, 10) || 1;

  persistDefaults();
  setBusy(true);
  logLine(`Starting conversion: ${STAGE_LABELS[stage] || "Stage 1"}, ${duration}s.`);

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

    logLine("Rendering finished. Preparing download...");
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `kenburns_stage_${stage}.mp4`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    logLine("Download started.");
  } catch (error) {
    logLine(`Error: ${error.message}`);
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
  const file = event.dataTransfer.files[0];
  convertFile(file);
});

fileInput.addEventListener("change", (event) => {
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
logLine("Ready. Drop an image to start.");
