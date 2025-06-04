# Google Docs Screenshot Extension

A Chrome extension that allows you to capture screenshots and insert them directly into selected Google Docs documents.

## Features

- 📸 **Screenshot Capture**: Select any area on your screen to capture
- 🎯 **Multiple Document Support**: Add and manage multiple Google Docs
- ⌨️ **Keyboard Shortcut**: Quick capture with `Ctrl+Shift+Q` (Windows/Linux) or `Command+Shift+Q` (Mac)
- 🎨 **Floating Toolbar**: Clean, contextual UI that appears next to your selection
- 📝 **Notes Support**: Add optional notes to your screenshots
- 🧠 **Memory Function**: Remembers your previous usage (selected docs + notes)
- ☁️ **Automatic Upload**: Screenshots are uploaded to Imgur and inserted into your docs
- 🔗 **Apps Script Integration**: Seamlessly integrates with Google Apps Script for document insertion

## Installation

1. **Download or Clone** this repository
2. **Open Chrome** and navigate to `chrome://extensions/`
3. **Enable Developer Mode** (toggle in the top right)
4. **Click "Load unpacked"** and select the extension folder
5. **Pin the extension** to your toolbar for easy access

## Setup

### 1. Apps Script Configuration (Required)

You **must** set up a Google Apps Script to handle document insertion. Follow these detailed steps:

#### Step 1: Create the Apps Script

1. Go to [script.google.com](https://script.google.com)
2. Click **"New project"**
3. Delete the default code and paste this code:

```javascript
function doPost(e) {
  const { docId, imgUrl, note } = JSON.parse(e.postData.contents);
  const doc = DocumentApp.openById(docId);
  const body = doc.getBody();

  if (note) body.appendParagraph(note);

  const blob = UrlFetchApp.fetch(imgUrl).getBlob();
  const image = body.appendImage(blob);

  const MAX_WIDTH_PT = 654; // 6.5 inches
  if (image.getWidth() > MAX_WIDTH_PT) {
    const scale = MAX_WIDTH_PT / image.getWidth();
    image.setWidth(MAX_WIDTH_PT).setHeight(image.getHeight() * scale);
  }

  return ContentService.createTextOutput("ok").setMimeType(
    ContentService.MimeType.TEXT
  );
}
```

#### Step 2: Save and Name Your Project

1. Click the **"Untitled project"** at the top
2. Name it something like **"GDocs Screenshot Handler"**
3. Press **Ctrl/Cmd + S** to save

#### Step 3: Deploy as Web App

1. Click **"Deploy"** → **"New deployment"**
2. Click the gear icon ⚙️ next to "Type"
3. Select **"Web app"**
4. Configure settings:
   - **Description**: "Screenshot insertion handler"
   - **Execute as**: **"Me"** (your email)
   - **Who has access**: **"Anyone"**
5. Click **"Deploy"**
6. **Grant permissions** when prompted (review and allow access to Google Docs)
7. **Copy the Web App URL** - it looks like:
   ```
   https://script.google.com/macros/s/AKfycby...../exec
   ```

#### Step 4: Update the Extension

1. Open `background.js` in your extension folder
2. Find the line with `APPS_SCRIPT_URL`
3. Replace the URL with your copied Web App URL:
   ```javascript
   const APPS_SCRIPT_URL =
     "https://script.google.com/macros/s/YOUR_COPIED_URL/exec";
   ```
4. Save the file

#### What This Apps Script Does:

- **Receives** the screenshot URL and document ID from the extension
- **Opens** the specified Google Doc
- **Adds** the optional note as a paragraph (if provided)
- **Downloads** the image from Imgur
- **Inserts** the image into the document
- **Resizes** large images to fit properly (max 6.5 inches wide)
- **Returns** a success response

### 2. Imgur API (Optional)

The extension uses a public Imgur client ID. For production use, consider:

1. Getting your own Imgur API key from [api.imgur.com](https://api.imgur.com)
2. Updating `IMGUR_CLIENT_ID` in `background.js`

## Usage

### Adding Google Docs

1. Click the extension icon in your toolbar
2. Paste a Google Doc URL (e.g., `https://docs.google.com/document/d/XXXXXXXXX/edit`)
3. Add a label for easy identification
4. Click "Add"

### Capturing Screenshots

#### Method 1: Extension Popup

1. Click the extension icon
2. Click "Capture & Upload"
3. Select the area you want to capture
4. Choose target documents and add notes in the floating toolbar
5. Click "Upload"

#### Method 2: Keyboard Shortcut

1. Press `Ctrl+Shift+Q` (Windows/Linux) or `Command+Shift+Q` (Mac)
2. Select the area you want to capture
3. Choose target documents and add notes in the floating toolbar
4. Click "Upload"

### 🧠 Memory Feature

The extension remembers your previous usage:

- **Selected documents** will be automatically checked again
- **Note field** will be pre-filled with your last note
- This saves time when taking multiple screenshots with similar settings

## Customization

### Changing Keyboard Shortcuts

1. **Open Chrome Extensions Settings**:

   - Go to `chrome://extensions/`
   - Click the hamburger menu (☰) in the top-left
   - Select **"Keyboard shortcuts"**

2. **Find your extension**:

   - Look for "GDocs Screenshot Uploader"
   - You'll see "Start screenshot capture"

3. **Change the shortcut**:

   - Click in the shortcut field
   - Press your desired key combination
   - Examples: `Ctrl+Shift+A`, `Alt+S`, `Ctrl+Q`, etc.

4. **Shortcut Requirements**:
   - Must include a modifier key (Ctrl, Alt, Shift, or Command on Mac)
   - Cannot conflict with existing browser shortcuts
   - Some combinations are reserved by Chrome

### Modifying Image Size

To change the maximum image width in Google Docs:

1. Edit the Apps Script code
2. Change `MAX_WIDTH_PT = 654` to your desired width in points
3. Save and redeploy the web app

Common widths:

- **US Letter**: 612pt (6.5")
- **A4**: 595pt (8.3")
- **Custom**: Any value you prefer

## File Structure

```
gdocs-screenshot-extension/
├── manifest.json          # Extension manifest
├── background.js          # Service worker for API calls
├── content.js            # Content script for UI overlay
├── popup.html            # Extension popup interface
├── popup.js              # Popup functionality
├── screenshot.js         # (Reserved for future use)
├── styles.css            # (Reserved for styling)
├── utils/
│   └── imgur.js          # (Reserved for Imgur utilities)
└── README.md             # This file
```

## Technical Details

### Permissions Required

- `activeTab`: Capture visible tab screenshots
- `scripting`: Inject content scripts
- `storage`: Save user preferences and remember usage
- `tabs`: Access tab information
- `<all_urls>`: Content script injection on all sites

### Architecture

1. **Popup** (`popup.js`): Manages Google Docs list and triggers capture
2. **Content Script** (`content.js`): Handles screen selection, floating toolbar, and memory functionality
3. **Background Script** (`background.js`): Processes images, uploads to Imgur, and communicates with Apps Script
4. **Apps Script** (external): Inserts images into Google Docs with proper formatting

## Contributing

Feel free to submit issues, feature requests, or pull requests!

## License

MIT License - feel free to use and modify as needed.

## Troubleshooting

### Common Issues

- **"Could not establish connection" error**: Reload the tab and try again
- **Screenshots not appearing in docs**:
  - Check your Apps Script deployment URL in `background.js`
  - Ensure the Apps Script is deployed with "Anyone" access
  - Verify you granted all necessary permissions
- **Extension not working on certain pages**: Chrome extensions cannot run on `chrome://` pages or the Chrome Web Store
- **Keyboard shortcut not working**:
  - Check Chrome's extension shortcuts in `chrome://extensions/shortcuts`
  - Make sure your shortcut doesn't conflict with browser shortcuts
- **Images too large in docs**: Modify `MAX_WIDTH_PT` in the Apps Script code
- **Permission denied errors**: Redeploy the Apps Script and re-grant permissions

### Windows-Specific Issues

**Windows Display Scaling Problems:**

- If screenshots appear cropped incorrectly on Windows (especially with 125%, 150%, or 200% display scaling):
  - The extension now automatically detects Windows and adjusts for DPI scaling
  - If issues persist, try setting your display scaling to 100% temporarily
  - Check that Chrome zoom level is at 100% (Ctrl+0)

**Windows Keyboard Shortcut Conflicts:**

- Default shortcut changed to `Ctrl+Shift+Q` to avoid Windows conflicts
- If still conflicts occur, customize the shortcut in `chrome://extensions/shortcuts`
- Avoid shortcuts that conflict with Windows system shortcuts

**Windows Performance:**

- Extension includes a small delay on Windows for better DOM readiness
- If capture seems slow, this is intentional to ensure reliability

### Debug Mode

Open Chrome DevTools (F12) and check the Console for error messages that can help identify issues.
