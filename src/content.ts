import { parseSRT, Cue } from "./srt";

interface SrtEntry {
  name: string;
  cues: Cue[];
}

const PROCESSED = new WeakSet<HTMLVideoElement>();

// Session-wide shared state
const srtLibrary: SrtEntry[] = [];
let offsetMs = 0;

function attachOverlay(video: HTMLVideoElement) {
  if (PROCESSED.has(video)) return;
  PROCESSED.add(video);

  const parent = video.parentElement;
  if (!parent) return;
  if (getComputedStyle(parent).position === "static") {
    parent.style.position = "relative";
  }

  let activeCues: Cue[] = [];
  let subtitlesVisible = true;

  // --- Container for CC + X buttons ---
  const btnGroup = document.createElement("div");
  btnGroup.className = "srt-btn-group";

  const ccBtn = document.createElement("button");
  ccBtn.className = "srt-overlay-btn";
  ccBtn.textContent = "CC";

  const closeBtn = document.createElement("button");
  closeBtn.className = "srt-overlay-btn srt-close-btn";
  closeBtn.textContent = "×";

  btnGroup.appendChild(ccBtn);
  btnGroup.appendChild(closeBtn);
  parent.appendChild(btnGroup);

  // --- Dropdown menu (fixed position, tracks video) ---
  const dropdown = document.createElement("div");
  dropdown.className = "srt-dropdown srt-hidden";
  document.body.appendChild(dropdown);

  function positionDropdown() {
    const rect = video.getBoundingClientRect();
    dropdown.style.top = `${rect.top + 32}px`;
    dropdown.style.right = `${window.innerWidth - rect.right + 8}px`;
  }

  // --- Subtitle display (fixed position, tracks video) ---
  const subtitleDiv = document.createElement("div");
  subtitleDiv.className = "srt-subtitle-display";
  document.body.appendChild(subtitleDiv);

  function positionSubtitle() {
    const rect = video.getBoundingClientRect();
    subtitleDiv.style.left = `${rect.left + rect.width / 2}px`;
    subtitleDiv.style.top = `${rect.bottom - 100}px`;
  }

  // --- Offset indicator (fixed, top-left of video) ---
  const offsetIndicator = document.createElement("div");
  offsetIndicator.className = "srt-offset-indicator srt-hidden";
  document.body.appendChild(offsetIndicator);

  let offsetTimeout: ReturnType<typeof setTimeout> | null = null;
  function showOffset() {
    const sign = offsetMs >= 0 ? "+" : "";
    offsetIndicator.textContent = `${sign}${offsetMs}ms`;
    const rect = video.getBoundingClientRect();
    offsetIndicator.style.left = `${rect.left + 8}px`;
    offsetIndicator.style.top = `${rect.top + 8}px`;
    offsetIndicator.classList.remove("srt-hidden");
    if (offsetTimeout) clearTimeout(offsetTimeout);
    offsetTimeout = setTimeout(() => {
      offsetIndicator.classList.add("srt-hidden");
    }, 1500);
  }

  function buildDropdown() {
    dropdown.innerHTML = "";

    for (const entry of srtLibrary) {
      const item = document.createElement("button");
      item.className = "srt-dropdown-item";
      item.textContent = entry.name;
      item.addEventListener("click", (e) => {
        e.stopPropagation();
        activeCues = entry.cues;
        subtitlesVisible = true;
        subtitleDiv.classList.remove("srt-hidden");
        ccBtn.classList.add("srt-overlay-btn--active");
        dropdown.classList.add("srt-hidden");
      });
      dropdown.appendChild(item);
    }

    // --- Offset controls ---
    const offsetRow = document.createElement("div");
    offsetRow.className = "srt-dropdown-offset";

    const minusBtn = document.createElement("button");
    minusBtn.className = "srt-offset-btn";
    minusBtn.textContent = "−";
    minusBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      offsetMs += 100;
      offsetInput.value = String(offsetMs);
      showOffset();
      refreshSubtitle();
    });

    const offsetInput = document.createElement("input");
    offsetInput.type = "text";
    offsetInput.className = "srt-offset-input";
    offsetInput.value = String(offsetMs);
    offsetInput.placeholder = "0";
    offsetInput.addEventListener("click", (e) => e.stopPropagation());
    offsetInput.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") {
        const val = parseInt(offsetInput.value, 10);
        if (!isNaN(val)) {
          offsetMs = val;
          showOffset();
          refreshSubtitle();
        }
        dropdown.classList.add("srt-hidden");
      }
    });

    const plusBtn = document.createElement("button");
    plusBtn.className = "srt-offset-btn";
    plusBtn.textContent = "+";
    plusBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      offsetMs -= 100;
      offsetInput.value = String(offsetMs);
      showOffset();
      refreshSubtitle();
    });

    const msLabel = document.createElement("span");
    msLabel.textContent = "ms";
    msLabel.className = "srt-offset-label";

    offsetRow.appendChild(minusBtn);
    offsetRow.appendChild(offsetInput);
    offsetRow.appendChild(plusBtn);
    offsetRow.appendChild(msLabel);
    dropdown.appendChild(offsetRow);

    const uploadItem = document.createElement("button");
    uploadItem.className = "srt-dropdown-item srt-dropdown-upload";
    uploadItem.textContent = "+ Upload SRT…";
    uploadItem.addEventListener("click", (e) => {
      e.stopPropagation();
      dropdown.classList.add("srt-hidden");
      promptUpload();
    });
    dropdown.appendChild(uploadItem);
  }

  function promptUpload() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".srt";
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const cues = parseSRT(reader.result as string);
        srtLibrary.push({ name: file.name, cues });
        activeCues = cues;
        subtitlesVisible = true;
        subtitleDiv.classList.remove("srt-hidden");
        ccBtn.classList.add("srt-overlay-btn--active");
      };
      reader.readAsText(file);
    });
    input.click();
  }

  // CC button toggles dropdown
  ccBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (dropdown.classList.contains("srt-hidden")) {
      buildDropdown();
      positionDropdown();
      dropdown.classList.remove("srt-hidden");
    } else {
      dropdown.classList.add("srt-hidden");
    }
  });

  // X button hides the entire overlay
  closeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    e.preventDefault();
    btnGroup.classList.add("srt-hidden");
    subtitleDiv.classList.add("srt-hidden");
    dropdown.classList.add("srt-hidden");
  });

  // Clicking subtitle text toggles subtitles off/on
  subtitleDiv.addEventListener("click", (e) => {
    e.stopPropagation();
    subtitlesVisible = !subtitlesVisible;
    if (!subtitlesVisible) {
      subtitleDiv.textContent = "";
      subtitleDiv.classList.add("srt-hidden");
    }
  });

  // Close dropdown when clicking elsewhere
  document.addEventListener("click", () => {
    dropdown.classList.add("srt-hidden");
  });

  // Shift+Z / Shift+X to nudge offset by ±100ms
  // Use window + capture phase to intercept before YouTube's handlers
  window.addEventListener("keydown", (e) => {
    if (
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement
    )
      return;
    if (activeCues.length === 0) return;

    if (e.shiftKey && (e.key === "z" || e.key === "Z")) {
      e.preventDefault();
      e.stopImmediatePropagation();
      offsetMs += 100;
      showOffset();
      refreshSubtitle();
    } else if (e.shiftKey && (e.key === "x" || e.key === "X")) {
      e.preventDefault();
      e.stopImmediatePropagation();
      offsetMs -= 100;
      showOffset();
      refreshSubtitle();
    }
  }, true);

  function refreshSubtitle() {
    if (activeCues.length === 0 || !subtitlesVisible) return;
    const t = video.currentTime + offsetMs / 1000;
    const active = activeCues.find((c) => t >= c.start && t <= c.end);
    subtitleDiv.textContent = active ? active.text : "";
    positionSubtitle();
  }

  video.addEventListener("timeupdate", refreshSubtitle);
}

function scanForVideos() {
  document.querySelectorAll("video").forEach(attachOverlay);
}

scanForVideos();
setInterval(scanForVideos, 2000);
