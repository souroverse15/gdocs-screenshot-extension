// Apps Script Web-App endpoint (runs "as you" and writes to Docs)
const APPS_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycby-c5wFql8yELI1IXu5p0rAdt7UyXAAd_4Np9jFdHhZ-jHrkwAOdQ_OTIHOe76J812E/exec";

// Configuration for Base64 processing
const UPLOAD_CONFIG = {
  timeout: 30000, // 30 seconds for Apps Script
  maxImageSize: 10 * 1024 * 1024, // 10MB limit for Base64 (reasonable for documents)
};

let uploadRetryCount = 0;
let lastUploadRequest = 0;

chrome.commands.onCommand.addListener((cmd) => {
  console.log("🎯 Command received:", cmd); // Debug log

  if (cmd === "start_capture") {
    console.log("🚀 Starting screenshot capture..."); // Debug log

    try {
      chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
        if (!tab) {
          console.error("No active tab found");
          return;
        }

        console.log("📄 Active tab:", tab.url); // Debug log

        // Check if tab.url exists and if the tab supports content scripts
        if (
          !tab.url ||
          tab.url.startsWith("chrome://") ||
          tab.url.startsWith("chrome-extension://") ||
          tab.url.startsWith("moz-extension://") ||
          tab.url.startsWith("edge://") ||
          tab.url.startsWith("about:")
        ) {
          console.log(
            "❌ Cannot capture screenshot on this type of page:",
            tab.url || "undefined URL"
          );
          return;
        }

        console.log("💬 Sending message to content script..."); // Debug log

        // First try to send message to existing content script
        chrome.tabs.sendMessage(
          tab.id,
          { type: "START_CAPTURE_KEY" },
          (response) => {
            if (chrome.runtime.lastError) {
              // Content script not loaded, inject it first
              console.log("Content script not found, injecting...");

              chrome.scripting.executeScript(
                {
                  target: { tabId: tab.id },
                  files: ["content.js"],
                },
                () => {
                  if (chrome.runtime.lastError) {
                    console.error(
                      "Failed to inject content script:",
                      chrome.runtime.lastError
                    );
                    return;
                  }

                  // Wait a moment for content script to initialize, then send message
                  setTimeout(() => {
                    chrome.tabs.sendMessage(
                      tab.id,
                      { type: "START_CAPTURE_KEY" },
                      (response) => {
                        if (chrome.runtime.lastError) {
                          console.error(
                            "Still could not communicate with content script:",
                            chrome.runtime.lastError
                          );
                        }
                      }
                    );
                  }, 100);
                }
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

    if (msg.type === "GET_AUTH_TOKEN") {
      // Get Google OAuth token for Drive API
      chrome.identity.getAuthToken({ interactive: true }, (token) => {
        if (chrome.runtime.lastError) {
          sendResponse({ error: chrome.runtime.lastError.message });
        } else {
          sendResponse({ token });
        }
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

    console.log(`Processing Base64 image for ${targets.length} target(s)`);

    // Check image size before processing
    const imageSizeBytes = estimateImageSize(dataUrl);
    if (imageSizeBytes > UPLOAD_CONFIG.maxImageSize) {
      throw new Error(
        `Image too large: ${Math.round(imageSizeBytes / 1024 / 1024)}MB. Max: ${
          UPLOAD_CONFIG.maxImageSize / 1024 / 1024
        }MB`
      );
    }

    // For Base64 embedding, we send the data URL directly
    const imgUrl = dataUrl;
    console.log("✅ Using Base64 embedding (no upload needed)");

    // POST to Apps Script for each target Doc
    const results = [];
    for (const docId of targets) {
      try {
        await postToAppsScript({ docId, imgUrl, note });
        console.log(`✅ Inserted into ${docId} (Base64)`);
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

// Estimate image size from base64 data
function estimateImageSize(dataUrl) {
  try {
    if (!dataUrl || !dataUrl.includes(",")) return 0;
    const base64Data = dataUrl.split(",")[1];
    if (!base64Data) return 0;

    // Base64 encoding increases size by ~33%, so actual size is ~75% of base64 length
    return Math.round(base64Data.length * 0.75);
  } catch (error) {
    console.warn("Could not estimate image size:", error);
    return 0;
  }
}

// Send image-URL + note to your Apps Script (which appends to Doc)
async function postToAppsScript({ docId, imgUrl, note }) {
  let controller;

  try {
    if (!docId) {
      throw new Error("Document ID is required");
    }
    if (!imgUrl) {
      throw new Error("Image URL is required");
    }

    console.log(`Posting to Apps Script for doc: ${docId}`);
    console.log(`Image URL length: ${imgUrl.length}`);
    console.log(`Note: ${note || "(none)"}`);

    // Create AbortController for timeout handling
    controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, 30000); // 30 second timeout for Apps Script

    const payload = { docId, imgUrl, note: note || "" };
    console.log("Sending payload to Apps Script:", {
      ...payload,
      imgUrl: `[${imgUrl.length} chars]`,
    });

    const res = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      let errorText;
      try {
        errorText = await res.text();
      } catch (e) {
        errorText = "Could not read error response";
      }
      console.error("Apps Script HTTP error:", res.status, errorText);
      throw new Error(`Apps Script HTTP ${res.status}: ${errorText}`);
    }

    const responseText = await res.text();
    console.log("Apps Script response:", responseText);

    // Apps Script should return "ok" on success
    if (responseText.trim().toLowerCase() !== "ok") {
      console.warn(`Unexpected Apps Script response: ${responseText}`);
    }

    return responseText;
  } catch (error) {
    if (controller) {
      controller.abort(); // Cleanup on error
    }

    if (error.name === "AbortError") {
      throw new Error("Apps Script request timed out after 30 seconds");
    }

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

// Handle extension suspension/wake
chrome.runtime.onSuspend.addListener(() => {
  console.log("Extension suspending - cleaning up resources");
});
