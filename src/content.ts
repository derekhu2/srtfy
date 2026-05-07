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

  video.addEventListener("timeupdate", () => {
    if (activeCues.length === 0 || !subtitlesVisible) return;
    const t = video.currentTime;
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
