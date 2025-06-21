const IMGUR_CLIENT_ID = "32c4723d8ebca57";

// ②  Apps Script Web-App endpoint  (runs "as you" and writes to Docs)
const APPS_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycby-c5wFql8yELI1IXu5p0rAdt7UyXAAd_4Np9jFdHhZ-jHrkwAOdQ_OTIHOe76J812E/exec";

// Rate limiting and retry configuration
const IMGUR_RATE_LIMIT = {
  maxRetries: 3,
  retryDelay: 2000, // 2 seconds
  timeout: 30000, // 30 seconds
  maxImageSize: 10 * 1024 * 1024, // 10MB limit
};

let imgurRetryCount = 0;
let lastImgurRequest = 0;

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

    // Check image size before upload
    const imageSizeBytes = estimateImageSize(dataUrl);
    if (imageSizeBytes > IMGUR_RATE_LIMIT.maxImageSize) {
      throw new Error(
        `Image too large: ${Math.round(imageSizeBytes / 1024 / 1024)}MB. Max: ${
          IMGUR_RATE_LIMIT.maxImageSize / 1024 / 1024
        }MB`
      );
    }

    // 3-A) Upload the cropped screenshot to Imgur with retry logic
    const imgUrl = await uploadToImgurWithRetry(dataUrl);
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

// Compress image if it's too large
function compressImageIfNeeded(
  dataUrl,
  maxSizeBytes = IMGUR_RATE_LIMIT.maxImageSize
) {
  return new Promise((resolve) => {
    try {
      const estimatedSize = estimateImageSize(dataUrl);

      if (estimatedSize <= maxSizeBytes) {
        resolve(dataUrl);
        return;
      }

      console.log(
        `Image size (${Math.round(
          estimatedSize / 1024
        )}KB) exceeds limit, compressing...`
      );

      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d");

          // Calculate compression ratio
          const compressionRatio = Math.sqrt(maxSizeBytes / estimatedSize);
          canvas.width = Math.floor(img.width * compressionRatio);
          canvas.height = Math.floor(img.height * compressionRatio);

          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

          // Try different quality levels
          for (let quality = 0.8; quality > 0.1; quality -= 0.1) {
            const compressedDataUrl = canvas.toDataURL("image/jpeg", quality);
            if (estimateImageSize(compressedDataUrl) <= maxSizeBytes) {
              console.log(
                `Image compressed to ${Math.round(
                  estimateImageSize(compressedDataUrl) / 1024
                )}KB`
              );
              resolve(compressedDataUrl);
              return;
            }
          }

          // If still too large, use lowest quality
          resolve(canvas.toDataURL("image/jpeg", 0.1));
        } catch (error) {
          console.error("Image compression failed:", error);
          resolve(dataUrl); // Return original if compression fails
        }
      };

      img.onerror = () => {
        console.error("Could not load image for compression");
        resolve(dataUrl);
      };

      img.src = dataUrl;
    } catch (error) {
      console.error("Error in image compression:", error);
      resolve(dataUrl);
    }
  });
}

// Upload to Imgur with retry logic and rate limiting
async function uploadToImgurWithRetry(dataUrl, retryCount = 0) {
  try {
    // Rate limiting: enforce minimum delay between requests
    const now = Date.now();
    const timeSinceLastRequest = now - lastImgurRequest;
    const minDelay = 1000; // 1 second minimum between requests

    if (timeSinceLastRequest < minDelay) {
      const waitTime = minDelay - timeSinceLastRequest;
      console.log(`Rate limiting: waiting ${waitTime}ms...`);
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }

    lastImgurRequest = Date.now();

    // Compress image if needed
    const processedDataUrl = await compressImageIfNeeded(dataUrl);

    return await uploadToImgur(processedDataUrl);
  } catch (error) {
    console.error(`Imgur upload attempt ${retryCount + 1} failed:`, error);

    // Check if we should retry
    if (retryCount < IMGUR_RATE_LIMIT.maxRetries) {
      // Exponential backoff for retries
      const delay = IMGUR_RATE_LIMIT.retryDelay * Math.pow(2, retryCount);
      console.log(
        `Retrying in ${delay}ms... (attempt ${retryCount + 1}/${
          IMGUR_RATE_LIMIT.maxRetries
        })`
      );

      await new Promise((resolve) => setTimeout(resolve, delay));
      return uploadToImgurWithRetry(dataUrl, retryCount + 1);
    }

    // All retries exhausted
    throw new Error(
      `Imgur upload failed after ${IMGUR_RATE_LIMIT.maxRetries} attempts: ${error.message}`
    );
  }
}

// Upload base64 PNG to Imgur with timeout handling
async function uploadToImgur(dataUrl) {
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
      `Uploading to Imgur... (${Math.round(base64Data.length / 1024)}KB)`
    );

    // Create AbortController for timeout handling
    controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, IMGUR_RATE_LIMIT.timeout);

    const res = await fetch("https://api.imgur.com/3/image", {
      method: "POST",
      headers: {
        Authorization: `Client-ID ${IMGUR_CLIENT_ID}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        image: base64Data,
        type: "base64",
        title: "Screenshot from GDocs Extension",
        description: "Automatically uploaded screenshot",
      }),
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

      // Handle specific Imgur error codes
      if (res.status === 429) {
        throw new Error(
          "Imgur rate limit exceeded. Please wait before uploading again."
        );
      } else if (res.status === 413) {
        throw new Error("Image too large for Imgur");
      } else if (res.status >= 500) {
        throw new Error(
          `Imgur server error (${res.status}). Please try again later.`
        );
      }

      throw new Error(`Imgur API error ${res.status}: ${errorText}`);
    }

    const json = await res.json();

    if (!json.success) {
      const errorMsg =
        json.data?.error?.message || json.data?.error || "Unknown error";
      throw new Error(`Imgur upload failed: ${errorMsg}`);
    }

    if (!json.data?.link) {
      throw new Error("Imgur response missing image link");
    }

    console.log(`✅ Imgur upload successful: ${json.data.link}`);
    return json.data.link;
  } catch (error) {
    if (controller) {
      controller.abort(); // Cleanup on error
    }

    if (error.name === "AbortError") {
      throw new Error(
        `Imgur upload timed out after ${
          IMGUR_RATE_LIMIT.timeout / 1000
        } seconds`
      );
    }

    if (error.message.includes("Failed to fetch")) {
      throw new Error(
        "Network error: Could not connect to Imgur. Check your internet connection."
      );
    }

    console.error("Imgur upload error:", error);
    throw error;
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
      body: JSON.stringify({ docId, imgUrl, note: note || "" }),
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
  imgurRetryCount = 0;
  lastImgurRequest = 0;
});

// Handle extension startup
chrome.runtime.onStartup.addListener(() => {
  console.log("GDocs Screenshot Extension started");
  // Reset rate limiting on startup
  imgurRetryCount = 0;
  lastImgurRequest = 0;
});

// Handle extension suspension/wake
chrome.runtime.onSuspend.addListener(() => {
  console.log("Extension suspending - cleaning up resources");
});

// Memory cleanup - periodically reset counters
setInterval(() => {
  if (Date.now() - lastImgurRequest > 300000) {
    // 5 minutes
    imgurRetryCount = 0;
    console.log("Reset Imgur rate limiting counters due to inactivity");
  }
}, 60000); // Check every minute
