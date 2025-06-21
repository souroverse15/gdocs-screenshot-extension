/* content.js  – injected into every page (per manifest) */

const TOOLBAR_HTML = `
  <div id="gd-toolbar" style="
    position: absolute;
    z-index: 2147483648;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
    font-size: 14px;
    line-height: 1.4;
    background: #ffffff;
    border: 1px solid #e1e5e9;
    border-radius: 12px;
    padding: 16px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15), 0 4px 12px rgba(0, 0, 0, 0.1);
    min-width: 280px;
    backdrop-filter: blur(10px);
  ">
    <div style="
      font-weight: 600;
      color: #1a1a1a;
      margin-bottom: 12px;
      font-size: 16px;
    ">📸 Screenshot Ready</div>
    
    <div id="gd-doc-boxes" style="
      margin-bottom: 12px;
      max-height: 120px;
      overflow-y: auto;
      border: 1px solid #f0f0f0;
      border-radius: 8px;
      padding: 8px;
      background: #fafafa;
    "></div>
    
    <textarea id="gd-note"
      placeholder="Add a note (optional)..." 
      rows="2"
      style="
        width: 100%;
        box-sizing: border-box;
        resize: vertical;
        margin-bottom: 12px;
        padding: 8px 12px;
        border: 1px solid #e1e5e9;
        border-radius: 8px;
        font-family: inherit;
        font-size: 14px;
        background: #ffffff;
        transition: border-color 0.2s ease;
      "
    ></textarea>
    <div style="display: flex; gap: 8px; justify-content: flex-end;">
      <button id="gd-cancel" style="
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 8px 16px;
        border: 1px solid #e1e5e9;
        border-radius: 8px;
        background: #ffffff;
        color: #666;
        font-family: inherit;
        font-size: 14px;
        cursor: pointer;
        transition: all 0.2s ease;
      ">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
        Cancel
      </button>
      <button id="gd-upload" style="
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 8px 16px;
        border: none;
        border-radius: 8px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        font-family: inherit;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s ease;
        box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);
      ">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7,10 12,15 17,10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
        Upload
      </button>
    </div>
  </div>`;

const TOAST_HTML = `
  <div id="gd-toast" style="
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 2147483649;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    padding: 12px 20px;
    border-radius: 12px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
    font-size: 14px;
    font-weight: 500;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
    backdrop-filter: blur(10px);
    transform: translateX(100%);
    opacity: 0;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    display: flex;
    align-items: center;
    gap: 8px;
    max-width: 300px;
  ">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M20 6L9 17l-5-5"/>
    </svg>
    <span id="gd-toast-message">Screenshot uploaded successfully!</span>
  </div>`;

let overlay = null;
let currentToolbar = null;
let currentToast = null;
let isCapturing = false;
let eventListeners = new Set(); // Track event listeners for cleanup

// Enhanced cleanup function to prevent memory leaks and crashes
function cleanupAll() {
  try {
    isCapturing = false;

    // Remove all tracked event listeners
    eventListeners.forEach(({ element, event, handler }) => {
      if (element && typeof element.removeEventListener === "function") {
        element.removeEventListener(event, handler);
      }
    });
    eventListeners.clear();

    // Remove overlay
    if (overlay && overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
    }
    overlay = null;

    // Remove toolbar
    if (currentToolbar && currentToolbar.parentNode) {
      currentToolbar.parentNode.removeChild(currentToolbar);
    }
    currentToolbar = null;

    // Remove any existing toolbar by ID
    const existingToolbar = document.getElementById("gd-toolbar");
    if (existingToolbar && existingToolbar.parentNode) {
      existingToolbar.parentNode.removeChild(existingToolbar);
    }

    // Remove toast if exists
    const existingToast = document.getElementById("gd-toast");
    if (existingToast && existingToast.parentNode) {
      existingToast.parentNode.removeChild(existingToast);
    }

    // Reset cursor
    document.body.style.cursor = "";
  } catch (error) {
    console.error("Error during cleanup:", error);
  }
}

// Enhanced event listener tracking to prevent memory leaks
function addTrackedEventListener(element, event, handler, options = {}) {
  element.addEventListener(event, handler, options);
  eventListeners.add({ element, event, handler });
}

// Show toast notification
function showToast(message, duration = 3000) {
  try {
    // Remove existing toast
    const existingToast = document.getElementById("gd-toast");
    if (existingToast && existingToast.parentNode) {
      existingToast.parentNode.removeChild(existingToast);
    }

    // Create new toast
    const toastContainer = document.createElement("div");
    toastContainer.innerHTML = TOAST_HTML;
    const toast = toastContainer.firstElementChild;

    // Update message
    toast.querySelector("#gd-toast-message").textContent = message;

    document.body.appendChild(toast);
    currentToast = toast;

    // Animate in
    requestAnimationFrame(() => {
      toast.style.transform = "translateX(0)";
      toast.style.opacity = "1";
    });

    // Auto hide
    setTimeout(() => {
      if (toast && toast.parentNode) {
        toast.style.transform = "translateX(100%)";
        toast.style.opacity = "0";
        setTimeout(() => {
          if (toast && toast.parentNode) {
            toast.parentNode.removeChild(toast);
          }
          if (currentToast === toast) {
            currentToast = null;
          }
        }, 300);
      }
    }, duration);
  } catch (error) {
    console.error("Error showing toast:", error);
  }
}

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
    // Prevent multiple capture sessions
    if (isCapturing) {
      sendResponse();
      return true;
    }

    // Clean up any existing UI first
    cleanupAll();

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
  if (isCapturing) return; // Prevent multiple overlays

  isCapturing = true;
  cleanupAll(); // Ensure clean state

  overlay = document.createElement("div");
  overlay.style.cssText = `
    position: fixed;
    inset: 0;
    cursor: crosshair;
    z-index: 2147483647;
    background: rgba(0, 0, 0, 0.05);
  `;
  document.body.appendChild(overlay);

  // region rectangle
  let rect = null;
  let startX, startY;
  let isDragging = false;

  const handleMouseDown = (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (isDragging) return;
    isDragging = true;

    startX = e.clientX;
    startY = e.clientY;

    // Remove existing rect if any
    if (rect && rect.parentNode) {
      rect.parentNode.removeChild(rect);
    }

    rect = document.createElement("div");
    rect.style.cssText = `
      position: fixed;
      background: rgba(102, 126, 234, 0.2);
      border: 2px solid #667eea;
      border-radius: 4px;
      pointer-events: none;
      z-index: 2147483648;
    `;
    overlay.appendChild(rect);

    const handleMouseMove = (e) => {
      if (!rect || !isDragging) return;

      const x = Math.min(e.clientX, startX);
      const y = Math.min(e.clientY, startY);
      const w = Math.abs(e.clientX - startX);
      const h = Math.abs(e.clientY - startY);

      rect.style.left = `${x}px`;
      rect.style.top = `${y}px`;
      rect.style.width = `${w}px`;
      rect.style.height = `${h}px`;
    };

    const handleMouseUp = async (e) => {
      if (!isDragging) return;
      isDragging = false;

      // Remove event listeners
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);

      if (!rect) return;

      const bbox = rect.getBoundingClientRect();

      // Minimum selection size
      if (bbox.width < 10 || bbox.height < 10) {
        cleanupAll();
        return;
      }

      try {
        // Hide overlay and rect immediately to prevent blur in screenshot
        overlay.style.display = "none";
        if (rect) rect.style.display = "none";

        // Small delay to ensure overlay is hidden before screenshot
        setTimeout(async () => {
          await createToolbar(bbox, noteDefault, targetsDefault);
        }, 50);
      } catch (error) {
        console.error("Error in mouse up handler:", error);
        cleanupAll();
      }
    };

    addTrackedEventListener(document, "mousemove", handleMouseMove);
    addTrackedEventListener(document, "mouseup", handleMouseUp, { once: true });
  };

  const handleKeyDown = (e) => {
    if (e.key === "Escape") {
      cleanupAll();
    }
  };

  addTrackedEventListener(overlay, "mousedown", handleMouseDown);
  addTrackedEventListener(overlay, "keydown", handleKeyDown);
  overlay.tabIndex = 0; // make it receive key events
  overlay.focus();
}

// Separate function to create toolbar after screenshot area is selected
async function createToolbar(bbox, noteDefault = "", targetsDefault = []) {
  try {
    // Create and position toolbar
    const toolbarContainer = document.createElement("div");
    toolbarContainer.innerHTML = TOOLBAR_HTML;
    const toolbar = toolbarContainer.firstElementChild;
    document.body.appendChild(toolbar);
    currentToolbar = toolbar;

    // Position toolbar near bottom-right of selection (clamp to viewport)
    const left = Math.min(bbox.right + 10, window.innerWidth - 300);
    const top = Math.min(bbox.bottom + 10, window.innerHeight - 200);
    toolbar.style.left = `${Math.max(10, left)}px`;
    toolbar.style.top = `${Math.max(10, top)}px`;

    // Get last usage settings and populate toolbar
    getLastUsage((lastUsage) => {
      const previousTargets = lastUsage.targets || [];
      const previousNote = lastUsage.note || "";

      // populate check-boxes
      fetchDocs((docs) => {
        const boxContainer = toolbar.querySelector("#gd-doc-boxes");

        if (docs.length === 0) {
          boxContainer.innerHTML = `
            <div style="color: #666; font-style: italic; text-align: center; padding: 12px;">
              No documents added yet.<br>
              Add some in the extension popup!
            </div>
          `;
        } else {
          docs.forEach((d, i) => {
            const id = `gd-cb-${i}`;
            const docItem = document.createElement("div");
            docItem.style.cssText = `
              display: flex;
              align-items: center;
              gap: 8px;
              padding: 6px 8px;
              border-radius: 6px;
              transition: background-color 0.2s ease;
              margin-bottom: 4px;
            `;

            docItem.innerHTML = `
              <input type="checkbox" id="${id}" value="${d.docId}" style="
                margin: 0;
                transform: scale(1.1);
              ">
              <label for="${id}" style="
                flex: 1;
                margin: 0;
                cursor: pointer;
                color: #333;
                font-weight: 500;
              ">${d.label}</label>
            `;

            boxContainer.appendChild(docItem);

            // Check if this doc was selected in previous usage
            const checkbox = docItem.querySelector("input");
            if (
              previousTargets.includes(d.docId) ||
              targetsDefault.includes(d.docId)
            ) {
              checkbox.checked = true;
            }

            // Add hover effect
            const handleMouseEnter = () => {
              docItem.style.backgroundColor = "#f0f0f0";
            };
            const handleMouseLeave = () => {
              docItem.style.backgroundColor = "transparent";
            };

            addTrackedEventListener(docItem, "mouseenter", handleMouseEnter);
            addTrackedEventListener(docItem, "mouseleave", handleMouseLeave);
          });
        }
      });

      // Set note field with previous note (or parameter default)
      const noteField = toolbar.querySelector("#gd-note");
      noteField.value = noteDefault || previousNote;

      // Add focus styles
      const handleFocus = () => {
        noteField.style.borderColor = "#667eea";
        noteField.style.boxShadow = "0 0 0 3px rgba(102, 126, 234, 0.1)";
      };
      const handleBlur = () => {
        noteField.style.borderColor = "#e1e5e9";
        noteField.style.boxShadow = "none";
      };

      addTrackedEventListener(noteField, "focus", handleFocus);
      addTrackedEventListener(noteField, "blur", handleBlur);
    });

    // Upload click handler
    const uploadBtn = toolbar.querySelector("#gd-upload");
    const handleUploadClick = async () => {
      const note = toolbar.querySelector("#gd-note").value;
      const targets = [
        ...toolbar.querySelectorAll("input[type=checkbox]:checked"),
      ].map((cb) => cb.value);

      if (!targets.length) {
        showToast("⚠️ Please select at least one document", 2000);
        return;
      }

      // Save current usage for next time
      saveLastUsage(targets, note);

      // Show uploading state
      uploadBtn.style.opacity = "0.7";
      uploadBtn.style.cursor = "not-allowed";
      uploadBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <path d="M12 6v6l4 2"/>
        </svg>
        Uploading...
      `;

      try {
        await captureAndCrop(bbox, note, targets);
        showToast(
          `✅ Screenshot uploaded to ${targets.length} document${
            targets.length > 1 ? "s" : ""
          }!`
        );
        cleanupAll();
      } catch (error) {
        console.error("Upload failed:", error);
        showToast("❌ Failed to upload screenshot", 3000);
        cleanupAll();
      }
    };

    addTrackedEventListener(uploadBtn, "click", handleUploadClick);

    // Add hover effects for upload button
    const handleUploadMouseEnter = () => {
      if (uploadBtn.style.cursor !== "not-allowed") {
        uploadBtn.style.transform = "translateY(-1px)";
        uploadBtn.style.boxShadow = "0 4px 12px rgba(102, 126, 234, 0.4)";
      }
    };
    const handleUploadMouseLeave = () => {
      uploadBtn.style.transform = "translateY(0)";
      uploadBtn.style.boxShadow = "0 2px 8px rgba(102, 126, 234, 0.3)";
    };

    addTrackedEventListener(uploadBtn, "mouseenter", handleUploadMouseEnter);
    addTrackedEventListener(uploadBtn, "mouseleave", handleUploadMouseLeave);

    // Cancel click handler
    const cancelBtn = toolbar.querySelector("#gd-cancel");
    addTrackedEventListener(cancelBtn, "click", cleanupAll);

    // Add hover effects for cancel button
    const handleCancelMouseEnter = () => {
      cancelBtn.style.backgroundColor = "#f5f5f5";
      cancelBtn.style.borderColor = "#ccc";
    };
    const handleCancelMouseLeave = () => {
      cancelBtn.style.backgroundColor = "#ffffff";
      cancelBtn.style.borderColor = "#e1e5e9";
    };

    addTrackedEventListener(cancelBtn, "mouseenter", handleCancelMouseEnter);
    addTrackedEventListener(cancelBtn, "mouseleave", handleCancelMouseLeave);
  } catch (error) {
    console.error("Error creating toolbar:", error);
    cleanupAll();
  }
}

/* ------------------------------------------------------------------- */
function captureAndCrop(box, note, targets) {
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage({ type: "CAPTURE_VISIBLE" }, (dataUrl) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }

        if (!dataUrl) {
          reject(new Error("Failed to capture screenshot"));
          return;
        }

        // 🎞️ Crop with Windows DPI fix
        const img = new Image();
        img.onload = () => {
          try {
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
              (response) => {
                if (chrome.runtime.lastError) {
                  reject(new Error(chrome.runtime.lastError.message));
                } else {
                  resolve(response);
                }
              }
            );
          } catch (error) {
            reject(error);
          }
        };

        img.onerror = () => {
          reject(new Error("Failed to load captured image"));
        };

        img.src = dataUrl;
      });
    } catch (error) {
      reject(error);
    }
  });
}

// Cleanup on page unload to prevent memory leaks
addTrackedEventListener(window, "beforeunload", cleanupAll);
addTrackedEventListener(document, "visibilitychange", () => {
  if (document.hidden) {
    cleanupAll();
  }
});

// Additional cleanup for page navigation
addTrackedEventListener(window, "pagehide", cleanupAll);
addTrackedEventListener(window, "unload", cleanupAll);
