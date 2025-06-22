const GOOGLE_DRIVE_API_KEY = "YOUR_API_KEY_HERE"; // Users will need to get their own
const GOOGLE_DRIVE_FOLDER_NAME = "GDocs Screenshots";

// ②  Apps Script Web-App endpoint  (runs "as you" and writes to Docs)
const APPS_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycby-c5wFql8yELI1IXu5p0rAdt7UyXAAd_4Np9jFdHhZ-jHrkwAOdQ_OTIHOe76J812E/exec";

// Configuration for uploads
const UPLOAD_CONFIG = {
  maxRetries: 3,
  retryDelay: 2000, // 2 seconds
  timeout: 60000, // 60 seconds for Google Drive
  maxImageSize: 25 * 1024 * 1024, // 25MB limit for Google Drive
};

let uploadRetryCount = 0;
let lastUploadRequest = 0;

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

async function processImage({ dataUrl, note, targets, useBase64 }) {
  try {
    if (!dataUrl || !targets || targets.length === 0) {
      throw new Error("Missing required data for image processing");
    }

    console.log(
      `Processing image for ${targets.length} target(s)${
        useBase64 ? " using Base64 embedding" : " via Google Drive"
      }`
    );

    let imgUrl;

    if (useBase64) {
      // For Base64 embedding, we send the data URL directly
      imgUrl = dataUrl;
      console.log("✅ Using Base64 embedding (no upload needed)");
    } else {
      // Check image size before upload
      const imageSizeBytes = estimateImageSize(dataUrl);
      if (imageSizeBytes > UPLOAD_CONFIG.maxImageSize) {
        throw new Error(
          `Image too large: ${Math.round(
            imageSizeBytes / 1024 / 1024
          )}MB. Max: ${UPLOAD_CONFIG.maxImageSize / 1024 / 1024}MB`
        );
      }

      // Upload the cropped screenshot to Google Drive with retry logic
      imgUrl = await uploadToGoogleDriveWithRetry(dataUrl);
      console.log("✅ Image uploaded to Google Drive:", imgUrl);
    }

    // POST to Apps Script for each target Doc
    const results = [];
    for (const docId of targets) {
      try {
        await postToAppsScript({ docId, imgUrl, note, useBase64 });
        console.log(
          `✅ Inserted into ${docId}${
            useBase64 ? " (Base64)" : " (Google Drive)"
          }`
        );
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

// Get Google OAuth token
async function getGoogleAuthToken() {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive: true }, (token) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(token);
      }
    });
  });
}

// Upload to Google Drive with retry logic
async function uploadToGoogleDriveWithRetry(dataUrl, retryCount = 0) {
  try {
    // Rate limiting: enforce minimum delay between requests
    const now = Date.now();
    const timeSinceLastRequest = now - lastUploadRequest;
    const minDelay = 500; // 500ms minimum between requests (much faster than Imgur)

    if (timeSinceLastRequest < minDelay) {
      const waitTime = minDelay - timeSinceLastRequest;
      console.log(`Rate limiting: waiting ${waitTime}ms...`);
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }

    lastUploadRequest = Date.now();

    return await uploadToGoogleDrive(dataUrl);
  } catch (error) {
    console.error(
      `Google Drive upload attempt ${retryCount + 1} failed:`,
      error
    );

    // Check if we should retry
    if (retryCount < UPLOAD_CONFIG.maxRetries) {
      // Exponential backoff for retries
      const delay = UPLOAD_CONFIG.retryDelay * Math.pow(2, retryCount);
      console.log(
        `Retrying in ${delay}ms... (attempt ${retryCount + 1}/${
          UPLOAD_CONFIG.maxRetries
        })`
      );

      await new Promise((resolve) => setTimeout(resolve, delay));
      return uploadToGoogleDriveWithRetry(dataUrl, retryCount + 1);
    }

    // All retries exhausted
    throw new Error(
      `Google Drive upload failed after ${UPLOAD_CONFIG.maxRetries} attempts: ${error.message}`
    );
  }
}

// Upload base64 image to Google Drive
async function uploadToGoogleDrive(dataUrl) {
  let controller;

  try {
    if (!dataUrl || !dataUrl.includes(",")) {
      throw new Error("Invalid data URL format");
    }

    const base64Data = dataUrl.split(",")[1];
    if (!base64Data) {
      throw new Error("No base64 data found in data URL");
    }

    // Check for empty or corrupted base64 data
    if (base64Data.length < 100) {
      throw new Error("Base64 data appears to be corrupted or too small");
    }

    console.log(
      `Uploading to Google Drive... (${Math.round(base64Data.length / 1024)}KB)`
    );

    // Get OAuth token
    const token = await getGoogleAuthToken();

    // Create AbortController for timeout handling
    controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, UPLOAD_CONFIG.timeout);

    // Convert base64 to blob
    const byteCharacters = atob(base64Data);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: "image/png" });

    // Generate unique filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `screenshot-${timestamp}.png`;

    // Upload to Google Drive
    const formData = new FormData();
    formData.append(
      "metadata",
      new Blob(
        [
          JSON.stringify({
            name: filename,
            parents: await getOrCreateFolder(token),
          }),
        ],
        { type: "application/json" }
      )
    );
    formData.append("file", blob);

    const res = await fetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
        signal: controller.signal,
      }
    );

    clearTimeout(timeoutId);

    if (!res.ok) {
      let errorText;
      try {
        const errorData = await res.json();
        errorText = errorData.error?.message || `HTTP ${res.status}`;
      } catch (e) {
        errorText = `HTTP ${res.status}`;
      }

      // Handle specific Google Drive error codes
      if (res.status === 401) {
        throw new Error("Authentication failed. Please try again.");
      } else if (res.status === 403) {
        throw new Error("Google Drive access denied. Check permissions.");
      } else if (res.status === 429) {
        throw new Error("Google Drive rate limit exceeded. Please wait.");
      } else if (res.status >= 500) {
        throw new Error(
          `Google Drive server error (${res.status}). Please try again later.`
        );
      }

      throw new Error(`Google Drive API error: ${errorText}`);
    }

    const fileData = await res.json();

    if (!fileData.id) {
      throw new Error("Google Drive response missing file ID");
    }

    // Make file publicly viewable
    await makeFilePublic(token, fileData.id);

    // Return the public view URL
    const publicUrl = `https://drive.google.com/uc?id=${fileData.id}`;
    console.log(`✅ Google Drive upload successful: ${publicUrl}`);
    return publicUrl;
  } catch (error) {
    if (controller) {
      controller.abort(); // Cleanup on error
    }

    if (error.name === "AbortError") {
      throw new Error(
        `Google Drive upload timed out after ${
          UPLOAD_CONFIG.timeout / 1000
        } seconds`
      );
    }

    if (error.message.includes("Failed to fetch")) {
      throw new Error(
        "Network error: Could not connect to Google Drive. Check your internet connection."
      );
    }

    console.error("Google Drive upload error:", error);
    throw error;
  }
}

// Get or create the screenshots folder in Google Drive
async function getOrCreateFolder(token) {
  try {
    // Search for existing folder
    const searchRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=name='${GOOGLE_DRIVE_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder'`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    const searchData = await searchRes.json();

    if (searchData.files && searchData.files.length > 0) {
      return [searchData.files[0].id];
    }

    // Create folder if it doesn't exist
    const createRes = await fetch("https://www.googleapis.com/drive/v3/files", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: GOOGLE_DRIVE_FOLDER_NAME,
        mimeType: "application/vnd.google-apps.folder",
      }),
    });

    const folderData = await createRes.json();
    return [folderData.id];
  } catch (error) {
    console.warn("Could not create/find folder, uploading to root:", error);
    return undefined; // Upload to root if folder creation fails
  }
}

// Make file publicly viewable
async function makeFilePublic(token, fileId) {
  try {
    await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}/permissions`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          role: "reader",
          type: "anyone",
        }),
      }
    );
  } catch (error) {
    console.warn("Could not make file public:", error);
    // Continue anyway - file might still be accessible
  }
}

// Send image-URL + note to your Apps Script (which appends to Doc)
async function postToAppsScript({ docId, imgUrl, note, useBase64 }) {
  let controller;

  try {
    if (!docId) {
      throw new Error("Document ID is required");
    }
    if (!imgUrl) {
      throw new Error("Image URL is required");
    }

    console.log(`Posting to Apps Script for doc: ${docId}`);

    // Create AbortController for timeout handling
    controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, 30000); // 30 second timeout for Apps Script

    const res = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ docId, imgUrl, note: note || "", useBase64 }),
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
      throw new Error(`Apps Script HTTP ${res.status}: ${errorText}`);
    }

    const responseText = await res.text();

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
  // Reset rate limiting on install/update
  uploadRetryCount = 0;
  lastUploadRequest = 0;
});

// Handle extension startup
chrome.runtime.onStartup.addListener(() => {
  console.log("GDocs Screenshot Extension started");
  // Reset rate limiting on startup
  uploadRetryCount = 0;
  lastUploadRequest = 0;
});

// Handle extension suspension/wake
chrome.runtime.onSuspend.addListener(() => {
  console.log("Extension suspending - cleaning up resources");
});

// Memory cleanup - periodically reset counters
setInterval(() => {
  if (Date.now() - lastUploadRequest > 300000) {
    // 5 minutes
    uploadRetryCount = 0;
    console.log("Reset upload rate limiting counters due to inactivity");
  }
}, 60000); // Check every minute
