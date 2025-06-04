const IMGUR_CLIENT_ID = "32c4723d8ebca57";

// ②  Apps Script Web-App endpoint  (runs "as you" and writes to Docs)
const APPS_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycby-c5wFql8yELI1IXu5p0rAdt7UyXAAd_4Np9jFdHhZ-jHrkwAOdQ_OTIHOe76J812E/exec";

chrome.commands.onCommand.addListener((cmd) => {
  if (cmd === "start_capture") {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      // Check if the tab supports content scripts (not chrome:// pages, etc.)
      if (
        tab.url.startsWith("chrome://") ||
        tab.url.startsWith("chrome-extension://") ||
        tab.url.startsWith("moz-extension://")
      ) {
        console.log("Cannot capture screenshot on this type of page");
        return;
      }

      chrome.tabs.sendMessage(
        tab.id,
        { type: "START_CAPTURE_KEY" },
        (response) => {
          if (chrome.runtime.lastError) {
            console.error(
              "Could not communicate with content script:",
              chrome.runtime.lastError.message || chrome.runtime.lastError
            );
          }
        }
      );
    });
  }
});

/** 2. MESSAGE HANDLERS  *********************************************/

// Listen for messages from popup.js  &  content.js
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "CAPTURE_VISIBLE") {
    chrome.tabs.captureVisibleTab(
      sender.tab.windowId,
      { format: "png" },
      (dataUrl) => sendResponse(dataUrl)
    );
    return true; // keep channel open for async sendResponse
  }

  if (msg.type === "PROCESS_IMAGE") {
    processImage(msg).then(() => sendResponse());
    return true;
  }
});

/** 3. MAIN PIPELINE  *************************************************/

async function processImage({ dataUrl, note, targets }) {
  // 3-A) Upload the cropped screenshot to Imgur
  const imgUrl = await uploadToImgur(dataUrl);

  // 3-B) POST to Apps Script for each target Doc
  for (const docId of targets) {
    await postToAppsScript({ docId, imgUrl, note });
    console.log(`✅ Inserted into ${docId}`);
  }
}

/** 4. HELPERS  *******************************************************/

// Upload base64 PNG to Imgur -> return public https://i.imgur.com/… link
async function uploadToImgur(dataUrl) {
  const res = await fetch("https://api.imgur.com/3/image", {
    method: "POST",
    headers: { Authorization: `Client-ID ${IMGUR_CLIENT_ID}` },
    body: new URLSearchParams({
      image: dataUrl.split(",")[1], // strip  "data:image/png;base64,"
      type: "base64",
    }),
  });

  const json = await res.json();
  if (!json.success) throw new Error("Imgur upload failed");
  return json.data.link; // ⇒ publicly accessible URL
}

// Send image-URL + note to your Apps Script (which appends to Doc)
async function postToAppsScript({ docId, imgUrl, note }) {
  const res = await fetch(APPS_SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ docId, imgUrl, note }),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Apps Script error ${res.status}: ${txt}`);
  }
}
