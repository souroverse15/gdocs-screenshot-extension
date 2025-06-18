/* Helpers -------------------------------------------------------------- */
function parseDocId(url) {
  // Google Docs URL pattern: https://docs.google.com/document/d/XXXXXXXXX/edit
  const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : null;
}

function showTooltip(element, message, duration = 2000) {
  const tooltip = document.createElement("div");
  tooltip.textContent = message;
  tooltip.style.cssText = `
    position: absolute;
    background: #333;
    color: white;
    padding: 6px 12px;
    border-radius: 6px;
    font-size: 12px;
    z-index: 1000;
    top: -35px;
    left: 50%;
    transform: translateX(-50%);
    white-space: nowrap;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.2s ease;
  `;

  element.style.position = "relative";
  element.appendChild(tooltip);

  // Animate in
  setTimeout(() => (tooltip.style.opacity = "1"), 10);

  // Remove after duration
  setTimeout(() => {
    tooltip.style.opacity = "0";
    setTimeout(() => {
      if (tooltip.parentNode) {
        tooltip.parentNode.removeChild(tooltip);
      }
    }, 200);
  }, duration);
}

function renderDocs(docs) {
  const container = document.getElementById("doc-list");
  container.innerHTML = ""; // clear

  docs.forEach((doc, i) => {
    const wrapper = document.createElement("div");
    wrapper.className = "doc-row";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.id = `doc-${i}`;
    checkbox.value = doc.docId;

    const label = document.createElement("label");
    label.htmlFor = checkbox.id;
    label.textContent = doc.label;

    const removeBtn = document.createElement("button");
    removeBtn.textContent = "✕";
    removeBtn.title = "Remove document";
    removeBtn.onclick = (e) => {
      e.preventDefault();
      removeDoc(doc.docId);
    };

    wrapper.append(checkbox, label, removeBtn);
    container.appendChild(wrapper);
  });
}

/* Storage ------------------------------------------------------------- */
// Use `storage.sync` so the list follows user's Chrome profile.
function getDocs(cb) {
  chrome.storage.sync.get({ docs: [] }, ({ docs }) => cb(docs));
}

function saveDocs(docs, cb) {
  chrome.storage.sync.set({ docs }, cb || (() => {}));
}

/* Add ----------------------------------------------------------------- */
function addDoc() {
  const urlInput = document.getElementById("doc-url");
  const nameInput = document.getElementById("doc-name");
  const addBtn = document.getElementById("add-doc");

  const url = urlInput.value.trim();
  const label = nameInput.value.trim() || "Untitled Document";

  const docId = parseDocId(url);
  if (!docId) {
    urlInput.style.borderColor = "#dc3545";
    urlInput.style.boxShadow = "0 0 0 3px rgba(220, 53, 69, 0.1)";
    showTooltip(urlInput, "Please enter a valid Google Docs URL");

    // Reset border after 3 seconds
    setTimeout(() => {
      urlInput.style.borderColor = "#e9ecef";
      urlInput.style.boxShadow = "none";
    }, 3000);
    return;
  }

  // Show loading state
  addBtn.classList.add("button-loading");
  addBtn.textContent = "Adding...";

  getDocs((docs) => {
    if (docs.some((d) => d.docId === docId)) {
      // Already exists
      urlInput.style.borderColor = "#ffc107";
      urlInput.style.boxShadow = "0 0 0 3px rgba(255, 193, 7, 0.1)";
      showTooltip(urlInput, "This document is already added");

      // Reset loading state
      addBtn.classList.remove("button-loading");
      addBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="12" y1="5" x2="12" y2="19"/>
          <line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        Add Document
      `;

      // Reset border after 3 seconds
      setTimeout(() => {
        urlInput.style.borderColor = "#e9ecef";
        urlInput.style.boxShadow = "none";
      }, 3000);
      return;
    }

    docs.push({ docId, label });
    saveDocs(docs, () => {
      renderDocs(docs);

      // Clear inputs
      urlInput.value = "";
      nameInput.value = "";

      // Show success state
      addBtn.style.background =
        "linear-gradient(135deg, #28a745 0%, #20c997 100%)";
      addBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M20 6L9 17l-5-5"/>
        </svg>
        Added!
      `;

      // Reset after 2 seconds
      setTimeout(() => {
        addBtn.classList.remove("button-loading");
        addBtn.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Add Document
        `;
      }, 2000);
    });
  });
}

/* Remove -------------------------------------------------------------- */
function removeDoc(docId) {
  if (!confirm("Remove this document from the list?")) {
    return;
  }

  getDocs((docs) => {
    const filtered = docs.filter((d) => d.docId !== docId);
    saveDocs(filtered, () => renderDocs(filtered));
  });
}

/* Capture ------------------------------------------------------------- */
function handleCapture() {
  const captureBtn = document.getElementById("capture-btn");
  const originalContent = captureBtn.innerHTML;

  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    // Check if the tab supports content scripts
    if (
      tab.url.startsWith("chrome://") ||
      tab.url.startsWith("chrome-extension://") ||
      tab.url.startsWith("moz-extension://")
    ) {
      captureBtn.style.background =
        "linear-gradient(135deg, #dc3545 0%, #c82333 100%)";
      captureBtn.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <line x1="15" y1="9" x2="9" y2="15"/>
          <line x1="9" y1="9" x2="15" y2="15"/>
        </svg>
        Cannot capture this page
      `;

      // Reset after 3 seconds
      setTimeout(() => {
        captureBtn.style.background =
          "linear-gradient(135deg, #667eea 0%, #764ba2 100%)";
        captureBtn.innerHTML = originalContent;
      }, 3000);
      return;
    }

    // Show loading state
    captureBtn.classList.add("button-loading");
    captureBtn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/>
        <path d="M12 6v6l4 2"/>
      </svg>
      Starting capture...
    `;

    chrome.tabs.sendMessage(tab.id, { type: "START_CAPTURE" }, (response) => {
      if (chrome.runtime.lastError) {
        // Error state
        captureBtn.classList.remove("button-loading");
        captureBtn.style.background =
          "linear-gradient(135deg, #dc3545 0%, #c82333 100%)";
        captureBtn.innerHTML = `
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="15" y1="9" x2="9" y2="15"/>
            <line x1="9" y1="9" x2="15" y2="15"/>
          </svg>
          Failed - Try reloading the page
        `;

        // Reset after 4 seconds
        setTimeout(() => {
          captureBtn.style.background =
            "linear-gradient(135deg, #667eea 0%, #764ba2 100%)";
          captureBtn.innerHTML = originalContent;
        }, 4000);
      } else {
        // Success - close popup
        window.close();
      }
    });
  });
}

/* Input validation and enhancement ----------------------------------- */
function setupInputEnhancements() {
  const urlInput = document.getElementById("doc-url");
  const nameInput = document.getElementById("doc-name");

  // Auto-generate label from URL
  urlInput.addEventListener("input", () => {
    const url = urlInput.value.trim();
    const docId = parseDocId(url);

    if (docId && !nameInput.value.trim()) {
      // Try to extract document name from URL if possible
      // This is a simplified approach - could be enhanced
      nameInput.placeholder = "Document label (auto-generated if empty)";
    }
  });

  // Enter key handling
  urlInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (nameInput.value.trim()) {
        addDoc();
      } else {
        nameInput.focus();
      }
    }
  });

  nameInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addDoc();
    }
  });
}

/* Init ---------------------------------------------------------------- */
document.addEventListener("DOMContentLoaded", () => {
  // Setup event listeners
  document.getElementById("add-doc").addEventListener("click", addDoc);
  document
    .getElementById("capture-btn")
    .addEventListener("click", handleCapture);

  // Setup input enhancements
  setupInputEnhancements();

  // Load and render docs
  getDocs(renderDocs);

  // Focus first input
  document.getElementById("doc-url").focus();
});
