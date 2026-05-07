import { parseSRT, Cue } from "./srt";

interface SrtEntry {
  name: string;
  cues: Cue[];
}

const PROCESSED = new WeakSet<HTMLVideoElement>();

// Session-wide store of uploaded SRT files
const srtLibrary: SrtEntry[] = [];

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
  let offsetMs = 0; // subtitle time offset in milliseconds

  // --- Container for CC + X buttons ---
  const btnGroup = document.createElement("div");
  btnGroup.className = "srt-btn-group";

  const ccBtn = document.createElement("button");
  ccBtn.className = "srt-overlay-btn";
  ccBtn.textContent = "CC";

  const closeBtn = document.createElement("button");
  closeBtn.className = "srt-overlay-btn srt-close-btn";
  closeBtn.textContent = "\u00D7";

  btnGroup.appendChild(ccBtn);
  btnGroup.appendChild(closeBtn);
  parent.appendChild(btnGroup);

  // --- Dropdown menu ---
  const dropdown = document.createElement("div");
  dropdown.className = "srt-dropdown";
  dropdown.style.display = "none";
  parent.appendChild(dropdown);

  // --- Subtitle display ---
  const subtitleDiv = document.createElement("div");
  subtitleDiv.className = "srt-subtitle-display";
  parent.appendChild(subtitleDiv);

  // --- Offset indicator (shows briefly when offset changes) ---
  const offsetIndicator = document.createElement("div");
  offsetIndicator.className = "srt-offset-indicator";
  parent.appendChild(offsetIndicator);

  let offsetTimeout: ReturnType<typeof setTimeout> | null = null;
  function showOffset() {
    const sign = offsetMs >= 0 ? "+" : "";
    offsetIndicator.textContent = `${sign}${offsetMs}ms`;
    offsetIndicator.style.display = "";
    if (offsetTimeout) clearTimeout(offsetTimeout);
    offsetTimeout = setTimeout(() => {
      offsetIndicator.style.display = "none";
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
        subtitleDiv.classList.remove("srt-subtitle-hidden");
        ccBtn.classList.add("srt-overlay-btn--active");
        dropdown.style.display = "none";
      });
      dropdown.appendChild(item);
    }

    // --- Offset controls ---
    const offsetRow = document.createElement("div");
    offsetRow.className = "srt-dropdown-offset";

    const offsetLabel = document.createElement("span");
    offsetLabel.textContent = "Offset:";
    offsetLabel.className = "srt-offset-label";

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
        }
        dropdown.style.display = "none";
      }
    });

    const msLabel = document.createElement("span");
    msLabel.textContent = "ms";
    msLabel.className = "srt-offset-label";

    offsetRow.appendChild(offsetLabel);
    offsetRow.appendChild(offsetInput);
    offsetRow.appendChild(msLabel);
    dropdown.appendChild(offsetRow);

    const hintRow = document.createElement("div");
    hintRow.className = "srt-dropdown-hint";
    hintRow.textContent = "Z / X to nudge \u00b1100ms";
    dropdown.appendChild(hintRow);

    const uploadItem = document.createElement("button");
    uploadItem.className = "srt-dropdown-item srt-dropdown-upload";
    uploadItem.textContent = "+ Upload SRT\u2026";
    uploadItem.addEventListener("click", (e) => {
      e.stopPropagation();
      dropdown.style.display = "none";
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
        subtitleDiv.classList.remove("srt-subtitle-hidden");
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
    if (dropdown.style.display === "none") {
      buildDropdown();
      dropdown.style.display = "";
    } else {
      dropdown.style.display = "none";
    }
  });

  // X button hides the entire overlay
  closeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    e.preventDefault();
    btnGroup.style.display = "none";
    subtitleDiv.style.display = "none";
    dropdown.style.display = "none";
  });

  // Clicking subtitle text toggles subtitles off/on
  subtitleDiv.addEventListener("click", (e) => {
    e.stopPropagation();
    subtitlesVisible = !subtitlesVisible;
    subtitleDiv.classList.toggle("srt-subtitle-hidden", !subtitlesVisible);
    if (!subtitlesVisible) {
      subtitleDiv.textContent = "";
    }
  });

  // Close dropdown when clicking elsewhere
  document.addEventListener("click", () => {
    dropdown.style.display = "none";
  });

  // Z / X keys to nudge offset by ±100ms
  document.addEventListener("keydown", (e) => {
    // Don't capture when typing in an input
    if (
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement
    )
      return;
    if (activeCues.length === 0) return;

    if (e.key === "z" || e.key === "Z") {
      offsetMs -= 100;
      showOffset();
    } else if (e.key === "x" || e.key === "X") {
      offsetMs += 100;
      showOffset();
    }
  });

  video.addEventListener("timeupdate", () => {
    if (activeCues.length === 0 || !subtitlesVisible) return;
    const t = video.currentTime + offsetMs / 1000;
    const active = activeCues.find((c) => t >= c.start && t <= c.end);
    subtitleDiv.textContent = active ? active.text : "";
  });
}

function scanForVideos() {
  document.querySelectorAll("video").forEach(attachOverlay);
}

scanForVideos();

const observer = new MutationObserver((mutations) => {
  for (const m of mutations) {
    for (const node of m.addedNodes) {
      if (node instanceof HTMLVideoElement) {
        attachOverlay(node);
      } else if (node instanceof HTMLElement) {
        node.querySelectorAll<HTMLVideoElement>("video").forEach(attachOverlay);
      }
    }
  }
});
observer.observe(document.body, { childList: true, subtree: true });
