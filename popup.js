/* Helpers -------------------------------------------------------------- */
function parseDocId(url) {
  // Handle different Google Docs URL patterns:
  // https://docs.google.com/document/d/DOCUMENT_ID/edit
  // https://docs.google.com/document/d/DOCUMENT_ID/edit#gid=0
  // https://docs.google.com/document/d/DOCUMENT_ID/
  // https://docs.google.com/document/d/DOCUMENT_ID

  if (!url || typeof url !== "string") {
    return null;
  }

  // Remove any trailing whitespace and normalize the URL
  url = url.trim();

  // Match the document ID pattern
  const match = url.match(/\/document\/d\/([a-zA-Z0-9-_]+)/);
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

function showStatus(message, isError = false) {
  const status = document.getElementById("status");
  status.textContent = message;
  status.className = isError ? "status error" : "status success";
  status.style.display = "block";

  setTimeout(() => {
    status.style.display = "none";
  }, 3000);
}

function renderDocs(docs) {
  const container = document.getElementById("docList");

  if (docs.length === 0) {
    container.innerHTML =
      '<div class="empty-state">No documents added yet</div>';
    return;
  }

  container.innerHTML = ""; // clear

  docs.forEach((doc, i) => {
    const docItem = document.createElement("div");
    docItem.className = "doc-item";

    const docName = document.createElement("div");
    docName.className = "doc-name";
    docName.textContent = doc.label;

    const removeBtn = document.createElement("button");
    removeBtn.className = "doc-remove";
    removeBtn.textContent = "Remove";
    removeBtn.onclick = (e) => {
      e.preventDefault();
      removeDoc(doc.docId);
    };

    docItem.appendChild(docName);
    docItem.appendChild(removeBtn);
    container.appendChild(docItem);
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
  const labelInput = document.getElementById("docLabel");
  const urlInput = document.getElementById("docUrl");
  const addBtn = document.getElementById("addDoc");

  const label = labelInput.value.trim();
  const url = urlInput.value.trim();

  if (!label || !url) {
    showStatus("Please fill in both fields", true);
    return;
  }

  // Extract document ID from the URL
  const docId = parseDocId(url);
  if (!docId) {
    showStatus(
      "Invalid Google Docs URL. Please provide a valid Google Docs link.",
      true
    );
    return;
  }

  // Show loading state
  addBtn.textContent = "Adding...";
  addBtn.disabled = true;

  getDocs((docs) => {
    if (docs.some((d) => d.docId === docId)) {
      showStatus("This document is already added", true);
      addBtn.textContent = "Add";
      addBtn.disabled = false;
      return;
    }

    docs.push({ docId, label });
    saveDocs(docs, () => {
      renderDocs(docs);

      // Clear inputs
      labelInput.value = "";
      urlInput.value = "";

      // Show success
      showStatus(`Added "${label}" successfully!`);

      // Reset button
      addBtn.textContent = "Add";
      addBtn.disabled = false;
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
  const captureBtn = document.getElementById("captureBtn");
  const originalContent = captureBtn.innerHTML;

  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    // Check if the tab supports content scripts
    if (
      tab.url.startsWith("chrome://") ||
      tab.url.startsWith("chrome-extension://") ||
      tab.url.startsWith("moz-extension://")
    ) {
      captureBtn.style.background = "#dc3545";
      captureBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <line x1="15" y1="9" x2="9" y2="15"/>
          <line x1="9" y1="9" x2="15" y2="15"/>
        </svg>
        Cannot capture this page
      `;

      // Reset after 3 seconds
      setTimeout(() => {
        captureBtn.style.background = "#4285f4";
        captureBtn.innerHTML = originalContent;
      }, 3000);
      return;
    }

    // Show loading state
    captureBtn.style.opacity = "0.7";
    captureBtn.style.cursor = "not-allowed";
    captureBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/>
        <path d="M12 6v6l4 2"/>
      </svg>
      Starting capture...
    `;

    chrome.tabs.sendMessage(tab.id, { type: "START_CAPTURE" }, (response) => {
      if (chrome.runtime.lastError) {
        // Error state
        captureBtn.style.opacity = "1";
        captureBtn.style.cursor = "pointer";
        captureBtn.style.background = "#dc3545";
        captureBtn.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="15" y1="9" x2="9" y2="15"/>
            <line x1="9" y1="9" x2="15" y2="15"/>
          </svg>
          Failed - Try reloading the page
        `;

        // Reset after 4 seconds
        setTimeout(() => {
          captureBtn.style.background = "#4285f4";
          captureBtn.style.opacity = "1";
          captureBtn.style.cursor = "pointer";
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
  const urlInput = document.getElementById("docUrl");
  const nameInput = document.getElementById("docLabel");

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
  document.getElementById("addDoc").addEventListener("click", addDoc);
  document
    .getElementById("captureBtn")
    .addEventListener("click", handleCapture);

  // Enter key handling for inputs
  document.getElementById("docLabel").addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      document.getElementById("docUrl").focus();
    }
  });

  document.getElementById("docUrl").addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addDoc();
    }
  });

  // Setup input enhancements
  setupInputEnhancements();

  // Load and render docs
  getDocs(renderDocs);

  // Focus first input
  document.getElementById("docLabel").focus();
});
