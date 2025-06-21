const IMGUR_CLIENT_ID = "32c4723d8ebca57";

// ②  Apps Script Web-App endpoint  (runs "as you" and writes to Docs)
const APPS_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycby-c5wFql8yELI1IXu5p0rAdt7UyXAAd_4Np9jFdHhZ-jHrkwAOdQ_OTIHOe76J812E/exec";

chrome.commands.onCommand.addListener((cmd) => {
  if (cmd === "start_capture") {
    try {
      chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
        if (!tab) {
          console.error("No active tab found");
          return;
        }

        // Check if the tab supports content scripts (not chrome:// pages, etc.)
        if (
          tab.url.startsWith("chrome://") ||
          tab.url.startsWith("chrome-extension://") ||
          tab.url.startsWith("moz-extension://") ||
          tab.url.startsWith("edge://") ||
          tab.url.startsWith("about:")
        ) {
          console.log(
            "Cannot capture screenshot on this type of page:",
            tab.url
          );
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
    } catch (error) {
      console.error("Error in command handler:", error);
    }
  }
});

/** 2. MESSAGE HANDLERS  *********************************************/

// Listen for messages from popup.js  &  content.js
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  try {
    if (msg.type === "CAPTURE_VISIBLE") {
      if (!sender.tab || !sender.tab.windowId) {
        console.error("Invalid sender tab information");
        sendResponse(null);
        return false;
      }

      chrome.tabs.captureVisibleTab(
        sender.tab.windowId,
        { format: "png", quality: 95 },
        (dataUrl) => {
          if (chrome.runtime.lastError) {
            console.error(
              "Screenshot capture failed:",
              chrome.runtime.lastError
            );
            sendResponse(null);
          } else if (!dataUrl) {
            console.error("Screenshot capture returned empty data");
            sendResponse(null);
          } else {
            sendResponse(dataUrl);
          }
        }
      );
      return true; // keep channel open for async sendResponse
    }

    if (msg.type === "PROCESS_IMAGE") {
      if (!msg.dataUrl || !msg.targets || !Array.isArray(msg.targets)) {
        console.error("Invalid PROCESS_IMAGE message:", msg);
        sendResponse({ error: "Invalid message format" });
        return false;
      }

      processImage(msg)
        .then((result) => {
          sendResponse({ success: true, result });
        })
        .catch((error) => {
          console.error("Image processing failed:", error);
          sendResponse({
            error: error.message || "Image processing failed",
            details: error.stack,
          });
        });
      return true;
    }
  } catch (error) {
    console.error("Error in message handler:", error);
    sendResponse({ error: "Internal error" });
    return false;
  }

  // Return false for unknown message types
  return false;
});

/** 3. MAIN PIPELINE  *************************************************/

async function processImage({ dataUrl, note, targets }) {
  try {
    if (!dataUrl || !targets || targets.length === 0) {
      throw new Error("Missing required data for image processing");
    }

    console.log(`Processing image for ${targets.length} target(s)`);

    // 3-A) Upload the cropped screenshot to Imgur
    const imgUrl = await uploadToImgur(dataUrl);
    console.log("✅ Image uploaded to Imgur:", imgUrl);

    // 3-B) POST to Apps Script for each target Doc
    const results = [];
    for (const docId of targets) {
      try {
        await postToAppsScript({ docId, imgUrl, note });
        console.log(`✅ Inserted into ${docId}`);
        results.push({ docId, success: true });
      } catch (error) {
        console.error(`❌ Failed to insert into ${docId}:`, error);
        results.push({ docId, success: false, error: error.message });
      }
    }

    return results;
  } catch (error) {
    console.error("Error in processImage:", error);
    throw error;
  }
}

/** 4. HELPERS  *******************************************************/

// Upload base64 PNG to Imgur -> return public https://i.imgur.com/… link
async function uploadToImgur(dataUrl) {
  try {
    if (!dataUrl || !dataUrl.includes(",")) {
      throw new Error("Invalid data URL format");
    }

    const base64Data = dataUrl.split(",")[1];
    if (!base64Data) {
      throw new Error("No base64 data found in data URL");
    }

    console.log("Uploading to Imgur...");

    const res = await fetch("https://api.imgur.com/3/image", {
      method: "POST",
      headers: {
        Authorization: `Client-ID ${IMGUR_CLIENT_ID}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        image: base64Data,
        type: "base64",
      }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Imgur API error ${res.status}: ${errorText}`);
    }

    const json = await res.json();

    if (!json.success) {
      throw new Error(
        `Imgur upload failed: ${json.data?.error || "Unknown error"}`
      );
    }

    if (!json.data?.link) {
      throw new Error("Imgur response missing image link");
    }

    return json.data.link; // ⇒ publicly accessible URL
  } catch (error) {
    console.error("Imgur upload error:", error);
    throw new Error(`Imgur upload failed: ${error.message}`);
  }
}

// Send image-URL + note to your Apps Script (which appends to Doc)
async function postToAppsScript({ docId, imgUrl, note }) {
  try {
    if (!docId) {
      throw new Error("Document ID is required");
    }
    if (!imgUrl) {
      throw new Error("Image URL is required");
    }

    console.log(`Posting to Apps Script for doc: ${docId}`);

    const res = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ docId, imgUrl, note: note || "" }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Apps Script HTTP ${res.status}: ${errorText}`);
    }

    const responseText = await res.text();

    // Apps Script should return "ok" on success
    if (responseText.trim().toLowerCase() !== "ok") {
      console.warn(`Unexpected Apps Script response: ${responseText}`);
    }

    return responseText;
  } catch (error) {
    console.error("Apps Script error:", error);
    throw new Error(`Apps Script failed: ${error.message}`);
  }
}

// Global error handler
chrome.runtime.onInstalled.addListener(() => {
  console.log("GDocs Screenshot Extension installed/updated");
});

// Handle extension startup
chrome.runtime.onStartup.addListener(() => {
  console.log("GDocs Screenshot Extension started");
});
