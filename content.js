/* content.js  – injected into every page (per manifest) */

// Prevent multiple initializations
if (window.gdocsScreenshotExtension) {
  console.log("GDocs Screenshot Extension already initialized");
} else {
  window.gdocsScreenshotExtension = true;

  const TOOLBAR_HTML = `
  <div id="gd-toolbar" style="
    position: absolute;
    z-index: 2147483648;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
    font-size: 14px;
    line-height: 1.4;
    background: #ffffff;
    border: 1px solid #e1e5e9;
    border-radius: 8px;
    padding: 12px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    min-width: 260px;
    max-width: 320px;
    max-height: 400px;
    overflow-y: auto;
  ">
    <div style="
      font-weight: 600;
      color: #1a1a1a;
      margin-bottom: 10px;
      font-size: 15px;
    ">📸 Screenshot Ready</div>
    
    <div id="gd-doc-boxes" style="
      margin-bottom: 10px;
      max-height: 150px;
      overflow-y: auto;
      border: 1px solid #e1e5e9;
      border-radius: 6px;
      padding: 6px;
      background: #fafafa;
    "></div>
    
    <textarea id="gd-note"
      placeholder="Add a note (optional)..." 
      rows="2"
      style="
        width: 100%;
        box-sizing: border-box;
        resize: vertical;
        margin-bottom: 10px;
        padding: 6px 8px;
        border: 1px solid #e1e5e9;
        border-radius: 6px;
        font-family: inherit;
        font-size: 13px;
        background: #ffffff;
        transition: border-color 0.2s ease;
      "
    ></textarea>
    <div style="display: flex; gap: 8px; justify-content: flex-end; align-items: center;">
      <button id="gd-cancel" style="
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 4px;
        padding: 8px 14px;
        border: 1px solid #e1e5e9;
        border-radius: 6px;
        background: #ffffff;
        color: #666;
        font-family: inherit;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s ease;
        min-height: 32px;
        white-space: nowrap;
      ">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
        Cancel
      </button>
      <button id="gd-upload" style="
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 4px;
        padding: 8px 14px;
        border: none;
        border-radius: 6px;
        background: #4285f4;
        color: white;
        font-family: inherit;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s ease;
        min-height: 32px;
        white-space: nowrap;
      ">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7,10 12,15 17,10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
        Insert
      </button>
    </div>
  </div>`;

  const TOAST_HTML = `
  <div id="gd-toast" style="
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 2147483649;
    background: #4285f4;
    color: white;
    padding: 10px 16px;
    border-radius: 8px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
    font-size: 13px;
    font-weight: 500;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    transform: translateX(100%);
    opacity: 0;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    display: flex;
    align-items: center;
    gap: 6px;
    max-width: 280px;
  ">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
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

  // Show progress toast with progress bar
  function showProgressToast(docCount) {
    try {
      // Remove existing toast
      const existingToast = document.getElementById("gd-toast");
      if (existingToast && existingToast.parentNode) {
        existingToast.parentNode.removeChild(existingToast);
      }

      // Create progress toast
      const toast = document.createElement("div");
      toast.id = "gd-toast";
      toast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 2147483649;
        background: #4285f4;
        color: white;
        padding: 12px 16px;
        border-radius: 8px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
        font-size: 13px;
        font-weight: 500;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        transform: translateX(100%);
        opacity: 0;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        min-width: 280px;
        max-width: 320px;
      `;

      toast.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 6v6l4 2"/>
          </svg>
          <span>Inserting into ${docCount} document${
        docCount > 1 ? "s" : ""
      }...</span>
        </div>
        <div style="
          width: 100%;
          height: 4px;
          background: rgba(255, 255, 255, 0.3);
          border-radius: 2px;
          overflow: hidden;
        ">
          <div id="gd-progress-bar" style="
            width: 0%;
            height: 100%;
            background: white;
            border-radius: 2px;
            transition: width 0.3s ease;
          "></div>
        </div>
      `;

      document.body.appendChild(toast);
      currentToast = toast;

      // Animate in
      requestAnimationFrame(() => {
        toast.style.transform = "translateX(0)";
        toast.style.opacity = "1";
      });

      // Animate progress bar
      setTimeout(() => {
        const progressBar = toast.querySelector("#gd-progress-bar");
        if (progressBar) {
          progressBar.style.width = "100%";
        }
      }, 200);
    } catch (error) {
      console.error("Error showing progress toast:", error);
    }
  }

  // Show success toast
  function showSuccessToast(docCount) {
    try {
      const existingToast = document.getElementById("gd-toast");
      if (existingToast && existingToast.parentNode) {
        // Update existing toast to success
        existingToast.style.background = "#34a853";
        existingToast.innerHTML = `
          <div style="display: flex; align-items: center; gap: 8px;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M20 6L9 17l-5-5"/>
            </svg>
            <span>✅ Inserted into ${docCount} document${
          docCount > 1 ? "s" : ""
        }!</span>
          </div>
        `;

        // Auto hide after 2 seconds
        setTimeout(() => {
          if (existingToast && existingToast.parentNode) {
            existingToast.style.transform = "translateX(100%)";
            existingToast.style.opacity = "0";
            setTimeout(() => {
              if (existingToast && existingToast.parentNode) {
                existingToast.parentNode.removeChild(existingToast);
              }
              if (currentToast === existingToast) {
                currentToast = null;
              }
            }, 300);
          }
        }, 2000);
      }
    } catch (error) {
      console.error("Error showing success toast:", error);
    }
  }

  // Show error toast
  function showErrorToast() {
    try {
      const existingToast = document.getElementById("gd-toast");
      if (existingToast && existingToast.parentNode) {
        // Update existing toast to error
        existingToast.style.background = "#dc3545";
        existingToast.innerHTML = `
          <div style="display: flex; align-items: center; gap: 8px;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="15" y1="9" x2="9" y2="15"/>
              <line x1="9" y1="9" x2="15" y2="15"/>
            </svg>
            <span>❌ Failed to insert screenshot</span>
          </div>
        `;

        // Auto hide after 3 seconds
        setTimeout(() => {
          if (existingToast && existingToast.parentNode) {
            existingToast.style.transform = "translateX(100%)";
            existingToast.style.opacity = "0";
            setTimeout(() => {
              if (existingToast && existingToast.parentNode) {
                existingToast.parentNode.removeChild(existingToast);
              }
              if (currentToast === existingToast) {
                currentToast = null;
              }
            }, 300);
          }
        }, 3000);
      }
    } catch (error) {
      console.error("Error showing error toast:", error);
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
      addTrackedEventListener(document, "mouseup", handleMouseUp, {
        once: true,
      });
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
        ]
          .filter((cb) => cb.id !== "gd-use-base64")
          .map((cb) => cb.value);

        if (!targets.length) {
          showToast("⚠️ Please select at least one document", 2000);
          return;
        }

        // Save current usage for next time
        saveLastUsage(targets, note);

        // Hide toolbar immediately
        cleanupAll();

        // Show progress toast
        showProgressToast(targets.length);

        try {
          await captureAndCrop(bbox, note, targets);

          // Show success toast
          showSuccessToast(targets.length);
        } catch (error) {
          console.error("Processing failed:", error);
          showErrorToast();
        }
      };

      addTrackedEventListener(uploadBtn, "click", handleUploadClick);

      // Add hover effects for upload button
      const handleUploadMouseEnter = () => {
        if (uploadBtn.style.cursor !== "not-allowed") {
          uploadBtn.style.transform = "translateY(-1px)";
          uploadBtn.style.background = "#3367d6";
        }
      };
      const handleUploadMouseLeave = () => {
        uploadBtn.style.transform = "translateY(0)";
        uploadBtn.style.background = "#4285f4";
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
        // Validate bounding box
        if (!box || box.width <= 0 || box.height <= 0) {
          reject(new Error("Invalid selection area"));
          return;
        }

        // Check for reasonable image dimensions to prevent memory issues
        const maxDimension = 8192; // 8K max
        if (box.width > maxDimension || box.height > maxDimension) {
          reject(
            new Error(
              `Selection too large: ${box.width}x${box.height}. Max: ${maxDimension}x${maxDimension}`
            )
          );
          return;
        }

        chrome.runtime.sendMessage({ type: "CAPTURE_VISIBLE" }, (dataUrl) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }

          if (!dataUrl) {
            reject(new Error("Failed to capture screenshot"));
            return;
          }

          // Check data URL size to prevent memory issues
          if (dataUrl.length > 50 * 1024 * 1024) {
            // 50MB limit for raw data URL
            reject(
              new Error(
                "Screenshot data too large. Try a smaller selection area."
              )
            );
            return;
          }

          // 🎞️ Crop with Windows DPI fix
          const img = new Image();
          img.onload = () => {
            let canvas, ctx;
            try {
              canvas = document.createElement("canvas");
              canvas.width = box.width;
              canvas.height = box.height;
              ctx = canvas.getContext("2d");

              if (!ctx) {
                throw new Error("Could not get canvas context");
              }

              // Fix for Windows DPI scaling issues
              const pixelRatio = window.devicePixelRatio || 1;
              const isWindows = navigator.platform
                .toLowerCase()
                .includes("win");

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

              // Validate coordinates
              if (
                sourceX < 0 ||
                sourceY < 0 ||
                sourceWidth <= 0 ||
                sourceHeight <= 0
              ) {
                throw new Error("Invalid crop coordinates calculated");
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

              // Check cropped image size
              if (cropped.length > 20 * 1024 * 1024) {
                // 20MB limit for cropped image
                console.warn(
                  "Cropped image is very large, this may cause upload issues"
                );
              }

              // Clean up canvas to free memory
              canvas.width = 0;
              canvas.height = 0;
              canvas = null;
              ctx = null;

              // Hand cropped image to background for upload & Docs insertion
              chrome.runtime.sendMessage(
                {
                  type: "PROCESS_IMAGE",
                  note,
                  targets,
                  dataUrl: cropped,
                },
                (response) => {
                  if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                  } else if (response && response.error) {
                    reject(new Error(response.error));
                  } else {
                    resolve(response);
                  }
                }
              );
            } catch (error) {
              // Clean up on error
              if (canvas) {
                canvas.width = 0;
                canvas.height = 0;
              }
              reject(error);
            }
          };

          img.onerror = () => {
            reject(new Error("Failed to load captured image"));
          };

          // Set timeout for image loading
          const imageLoadTimeout = setTimeout(() => {
            img.onload = null;
            img.onerror = null;
            reject(new Error("Image loading timed out"));
          }, 10000); // 10 second timeout

          img.onload = ((originalOnLoad) => {
            return function () {
              clearTimeout(imageLoadTimeout);
              return originalOnLoad.apply(this, arguments);
            };
          })(img.onload);

          img.onerror = ((originalOnError) => {
            return function () {
              clearTimeout(imageLoadTimeout);
              return originalOnError.apply(this, arguments);
            };
          })(img.onerror);

          img.src = dataUrl;
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  // Cleanup on page unload to prevent memory leaks - using safer events
  try {
    addTrackedEventListener(window, "beforeunload", cleanupAll);
  } catch (e) {
    console.warn("beforeunload listener blocked:", e);
  }

  try {
    addTrackedEventListener(document, "visibilitychange", () => {
      if (document.hidden) {
        cleanupAll();
      }
    });
  } catch (e) {
    console.warn("visibilitychange listener blocked:", e);
  }

  // Additional cleanup for page navigation - using safer alternatives
  try {
    addTrackedEventListener(window, "pagehide", cleanupAll);
  } catch (e) {
    console.warn("pagehide listener blocked:", e);
  }
} // End of window.gdocsScreenshotExtension initialization

// Remove the problematic unload listener that causes permissions policy violation
// The unload event is blocked by many sites' permissions policies
// We rely on beforeunload, visibilitychange, and pagehide for cleanup instead
