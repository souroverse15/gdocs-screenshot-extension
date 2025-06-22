# 🚀 Google Drive Setup Guide

## Why Google Drive Instead of Imgur?

✅ **No rate limits** - Upload as many screenshots as you want  
✅ **25MB file size limit** (vs 10MB on Imgur)  
✅ **Private storage** - Images aren't public by default  
✅ **Unlimited storage** - Uses your Google Drive space  
✅ **Same ecosystem** - Works seamlessly with Google Docs  
✅ **More reliable** - Google's infrastructure

## 📋 Setup Instructions

### Step 1: Get Google OAuth Credentials

1. **Go to Google Cloud Console**: https://console.cloud.google.com/
2. **Create a new project** (or select existing one)
3. **Enable Google Drive API**:
   - Go to "APIs & Services" → "Library"
   - Search for "Google Drive API"
   - Click "Enable"
4. **Create OAuth credentials**:
   - Go to "APIs & Services" → "Credentials"
   - Click "Create Credentials" → "OAuth 2.0 Client IDs"
   - Application type: "Chrome Extension"
   - Name: "GDocs Screenshot Extension"
   - Copy the **Client ID**

### Step 2: Update Extension Files

1. **Open `manifest.json`**
2. **Replace** `YOUR_OAUTH_CLIENT_ID_HERE` with your actual Client ID:
   ```json
   "client_id": "123456789-abcdef.apps.googleusercontent.com"
   ```

### Step 3: Load Extension

1. **Open Chrome** → Go to `chrome://extensions/`
2. **Enable Developer Mode** (top right toggle)
3. **Click "Load unpacked"**
4. **Select your extension folder**

### Step 4: First Use

1. **Take a screenshot** (Ctrl+Shift+X or Cmd+Shift+X)
2. **Click "Upload"** - you'll be prompted to sign in to Google
3. **Grant permissions** for Google Drive access
4. **Done!** Screenshots will now upload to Google Drive

## 📁 Where Are My Screenshots?

- Screenshots are saved to a folder called **"GDocs Screenshots"** in your Google Drive
- Each screenshot has a unique filename with timestamp
- Files are made publicly viewable so Google Docs can access them

## 🔧 Troubleshooting

### "Authentication failed" error

- Make sure your OAuth Client ID is correct in manifest.json
- Check that Google Drive API is enabled in your project

### "Access denied" error

- Grant permissions when prompted
- Go to chrome://settings/content/googleAuth to manage permissions

### Still having issues?

- Check browser console for error details
- Make sure you're signed in to the correct Google account
- Try reloading the extension

## 🔒 Privacy & Security

- **Your images are private** - stored in your Google Drive
- **No third-party access** - only you and Google Docs can see them
- **No rate limiting** - upload as many screenshots as needed
- **No file size issues** - 25MB limit is very generous

## 🎯 Benefits Over Imgur

| Feature     | Imgur          | Google Drive               |
| ----------- | -------------- | -------------------------- |
| Rate Limits | ❌ Strict      | ✅ None                    |
| File Size   | ❌ 10MB        | ✅ 25MB                    |
| Privacy     | ❌ Public      | ✅ Private                 |
| Storage     | ❌ Limited     | ✅ Unlimited\*             |
| Reliability | ❌ Can go down | ✅ Google's infrastructure |
| Integration | ❌ Third-party | ✅ Native Google           |

\*Uses your Google Drive storage quota
