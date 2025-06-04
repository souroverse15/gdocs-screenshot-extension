/* Helpers -------------------------------------------------------------- */
function parseDocId(url) {
  // Google Docs URL pattern: https://docs.google.com/document/d/XXXXXXXXX/edit
  const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : null;
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
    removeBtn.title = "Remove";
    removeBtn.onclick = () => removeDoc(doc.docId);

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
  chrome.storage.sync.set({ docs }, cb);
}

/* Add ----------------------------------------------------------------- */
function addDoc() {
  const url = document.getElementById("doc-url").value.trim();
  const label = document.getElementById("doc-name").value.trim() || "Untitled";

  const docId = parseDocId(url);
  if (!docId) {
    alert("❌ Not a valid Google Doc URL");
    return;
  }

  getDocs((docs) => {
    if (docs.some((d) => d.docId === docId)) {
      alert("This doc is already added.");
      return;
    }
    docs.push({ docId, label });
    saveDocs(docs, () => {
      renderDocs(docs);
      document.getElementById("doc-url").value = "";
      document.getElementById("doc-name").value = "";
    });
  });
}

/* Remove -------------------------------------------------------------- */
function removeDoc(docId) {
  getDocs((docs) => {
    const filtered = docs.filter((d) => d.docId !== docId);
    saveDocs(filtered, () => renderDocs(filtered));
  });
}

/* Capture ------------------------------------------------------------- */
function handleCapture() {
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    // Check if the tab supports content scripts
    if (
      tab.url.startsWith("chrome://") ||
      tab.url.startsWith("chrome-extension://") ||
      tab.url.startsWith("moz-extension://")
    ) {
      alert(
        "⚠️ Cannot capture screenshots on this type of page.\nPlease navigate to a regular webpage."
      );
      return;
    }

    chrome.tabs.sendMessage(tab.id, { type: "START_CAPTURE" }, (response) => {
      if (chrome.runtime.lastError) {
        alert(
          "⚠️ Could not start capture overlay.\nPlease try reloading the tab first."
        );
      } else {
        window.close();
      }
    });
  });
}

/* Init ---------------------------------------------------------------- */
document.getElementById("add-doc").addEventListener("click", addDoc);
document.getElementById("capture-btn").addEventListener("click", handleCapture);
getDocs(renderDocs);
