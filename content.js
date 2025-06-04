/* content.js  – injected into every page (per manifest) */

const TOOLBAR_HTML = `
  <div id="gd-toolbar" style="
    position:absolute; z-index:2147483648; font:14px/1.3 sans-serif;
    background:#fff; border:1px solid #ccc; border-radius:4px; padding:8px;
    box-shadow:0 2px 6px rgba(0,0,0,.25);"
  >
    <div id="gd-doc-boxes"></div>
    <textarea id="gd-note"
      placeholder="Optional note…" rows="2"
      style="width:180px; resize:vertical; margin-top:6px;"
    ></textarea>
    <div style="text-align:right; margin-top:6px;">
      <button id="gd-upload" style="margin-right:4px;">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7,10 12,15 17,10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
        Upload
      </button>
      <button id="gd-cancel">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
        Cancel
      </button>
    </div>
  </div>`;

let overlay = null;

function fetchDocs(cb) {
  chrome.storage.sync.get({ docs: [] }, ({ docs }) => cb(docs));
}

// Function to save last usage settings
function saveLastUsage(targets, note) {
  chrome.storage.sync.set({
    lastUsage: {
      targets: targets,
      note: note,
    },
  });
}

// Function to get last usage settings
function getLastUsage(cb) {
  chrome.storage.sync.get(
    { lastUsage: { targets: [], note: "" } },
    ({ lastUsage }) => cb(lastUsage)
  );
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "START_CAPTURE" || msg.type === "START_CAPTURE_KEY") {
    // Small delay for Windows to ensure DOM is ready
    const isWindows = navigator.platform.toLowerCase().includes("win");
    const delay = isWindows ? 100 : 0;

    setTimeout(() => {
      makeOverlay();
      sendResponse();
    }, delay);

    return true; // Keep message channel open for async response
  }
});

function makeOverlay(noteDefault = "", targetsDefault = []) {
  if (overlay) return; // guard

  overlay = document.createElement("div");
  overlay.style =
    "position:fixed; inset:0; cursor:crosshair; z-index:2147483647;";
  document.body.appendChild(overlay);

  // region rectangle
  let rect;
  let startX, startY;

  overlay.addEventListener("mousedown", (e) => {
    startX = e.clientX;
    startY = e.clientY;
    rect = document.createElement("div");
    rect.style =
      "position:fixed; background:rgba(0,0,0,.35); outline:2px solid #fff;";
    overlay.appendChild(rect);

    overlay.addEventListener("mousemove", onMove);
    overlay.addEventListener("mouseup", onUp, { once: true });
  });

  overlay.addEventListener("keydown", (e) => {
    if (e.key === "Escape") cleanup();
  });
  overlay.tabIndex = 0; // make it receive key events
  overlay.focus();

  function onMove(e) {
    const x = Math.min(e.clientX, startX);
    const y = Math.min(e.clientY, startY);
    const w = Math.abs(e.clientX - startX);
    const h = Math.abs(e.clientY - startY);
    Object.assign(rect.style, {
      left: `${x}px`,
      top: `${y}px`,
      width: `${w}px`,
      height: `${h}px`,
    });
  }

  async function onUp() {
    overlay.removeEventListener("mousemove", onMove);
    const bbox = rect.getBoundingClientRect();

    // ------- inject toolbar -------------
    const tb = document.createElement("div");
    tb.innerHTML = TOOLBAR_HTML;
    const toolbar = tb.firstElementChild; // Get the actual toolbar div
    document.body.appendChild(toolbar);

    // position toolbar near bottom-right of selection (clamp to viewport)
    const left = Math.min(bbox.right + 10, window.innerWidth - 210);
    const top = Math.min(bbox.bottom + 10, window.innerHeight - 150);
    toolbar.style.left = `${left}px`;
    toolbar.style.top = `${top}px`;

    // Get last usage settings and populate toolbar
    getLastUsage((lastUsage) => {
      const previousTargets = lastUsage.targets || [];
      const previousNote = lastUsage.note || "";

      // populate check-boxes
      fetchDocs((docs) => {
        const boxContainer = toolbar.querySelector("#gd-doc-boxes");
        docs.forEach((d, i) => {
          const id = `gd-cb-${i}`;
          boxContainer.insertAdjacentHTML(
            "beforeend",
            `<div><input type="checkbox" id="${id}" value="${d.docId}">
              <label for="${id}">${d.label}</label></div>`
          );

          // Check if this doc was selected in previous usage
          if (previousTargets.includes(d.docId)) {
            boxContainer.lastChild.firstChild.checked = true;
          }

          // Also check any targets passed as parameters (for backward compatibility)
          if (targetsDefault.includes(d.docId)) {
            boxContainer.lastChild.firstChild.checked = true;
          }
        });
      });

      // Set note field with previous note (or parameter default)
      toolbar.querySelector("#gd-note").value = noteDefault || previousNote;
    });

    // Upload click
    toolbar.querySelector("#gd-upload").onclick = async () => {
      const note = toolbar.querySelector("#gd-note").value;
      const targets = [
        ...toolbar.querySelectorAll("input[type=checkbox]:checked"),
      ].map((cb) => cb.value);
      if (!targets.length) {
        alert("Select at least one Doc.");
        return;
      }

      // Save current usage for next time
      saveLastUsage(targets, note);

      toolbar.remove(); // hide UI
      overlay.remove();
      overlay = null;
      await new Promise(requestAnimationFrame); // wait paint
      captureAndCrop(bbox, note, targets).catch(console.error);
    };

    // Cancel
    toolbar.querySelector("#gd-cancel").onclick = cleanup;
  }

  function cleanup() {
    overlay?.remove();
    overlay = null;
    document.querySelector("#gd-toolbar")?.remove();
  }
}

/* ------------------------------------------------------------------- */
function captureAndCrop(box, note, targets) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: "CAPTURE_VISIBLE" }, (dataUrl) => {
      if (!dataUrl) {
        reject();
        return;
      }

      // 🎞️ Crop with Windows DPI fix
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = box.width;
        canvas.height = box.height;
        const ctx = canvas.getContext("2d");

        // Fix for Windows DPI scaling issues
        const pixelRatio = window.devicePixelRatio || 1;
        const isWindows = navigator.platform.toLowerCase().includes("win");

        // Windows often has DPI scaling issues, use different approach
        let sourceX, sourceY, sourceWidth, sourceHeight;

        if (isWindows && pixelRatio !== 1) {
          // Windows with scaling: use zoom-adjusted coordinates
          const zoomFactor = window.visualViewport
            ? window.visualViewport.scale || 1
            : 1;

          sourceX = (box.left * pixelRatio) / zoomFactor;
          sourceY = (box.top * pixelRatio) / zoomFactor;
          sourceWidth = (box.width * pixelRatio) / zoomFactor;
          sourceHeight = (box.height * pixelRatio) / zoomFactor;
        } else {
          // Standard approach for Mac/Linux
          sourceX = box.left * pixelRatio;
          sourceY = box.top * pixelRatio;
          sourceWidth = box.width * pixelRatio;
          sourceHeight = box.height * pixelRatio;
        }

        ctx.drawImage(
          img,
          sourceX,
          sourceY,
          sourceWidth,
          sourceHeight,
          0,
          0,
          box.width,
          box.height
        );

        const cropped = canvas.toDataURL("image/png");
        // Hand cropped image to background for upload & Docs insertion
        chrome.runtime.sendMessage(
          { type: "PROCESS_IMAGE", note, targets, dataUrl: cropped },
          () => resolve()
        );
      };
      img.src = dataUrl;
    });
  });
}
