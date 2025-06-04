# Google Docs Screenshot Extension

A Chrome extension that allows you to capture screenshots and insert them directly into selected Google Docs documents.

## Features

- 📸 **Screenshot Capture**: Select any area on your screen to capture
- 🎯 **Multiple Document Support**: Add and manage multiple Google Docs
- ⌨️ **Keyboard Shortcut**: Quick capture with `Ctrl+Shift+S` (Windows/Linux) or `Command+Shift+S` (Mac)
- 🎨 **Floating Toolbar**: Clean, contextual UI that appears next to your selection
- 📝 **Notes Support**: Add optional notes to your screenshots
- 🎨 **Automatic Upload**: Screenshots are uploaded to Imgur and inserted into your docs
- 🔗 **Apps Script Integration**: Seamlessly integrates with Google Apps Script for document insertion

## Installation

1. **Download or Clone** this repository
2. **Open Chrome** and navigate to `chrome://extensions/`
3. **Enable Developer Mode** (toggle in the top right)
4. **Click "Load unpacked"** and select the extension folder
5. **Pin the extension** to your toolbar for easy access

## Setup

### 1. Apps Script Configuration

You'll need to set up a Google Apps Script to handle document insertion:

1. Go to [script.google.com](https://script.google.com)
2. Create a new project
3. Add your document insertion code
4. Deploy as a web app with permissions to run "as you"
5. Copy the deployment URL and update `APPS_SCRIPT_URL` in `background.js`

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

1. Press `Ctrl+Shift+S` (Windows/Linux) or `Command+Shift+S` (Mac)
2. Select the area you want to capture
3. Choose target documents and add notes in the floating toolbar
4. Click "Upload"

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
- `storage`: Save user preferences
- `tabs`: Access tab information
- `<all_urls>`: Content script injection on all sites

### Architecture

1. **Popup** (`popup.js`): Manages Google Docs list and triggers capture
2. **Content Script** (`content.js`): Handles screen selection and floating toolbar
3. **Background Script** (`background.js`): Processes images, uploads to Imgur, and communicates with Apps Script
4. **Apps Script** (external): Inserts images into Google Docs

## Contributing

Feel free to submit issues, feature requests, or pull requests!

## License

MIT License - feel free to use and modify as needed.

## Troubleshooting

- **"Could not establish connection" error**: Reload the tab and try again
- **Screenshots not appearing in docs**: Check your Apps Script deployment URL
- **Extension not working on certain pages**: Chrome extensions cannot run on `chrome://` pages or the Chrome Web Store
- **Keyboard shortcut not working**: Check Chrome's extension shortcuts in `chrome://extensions/shortcuts`
