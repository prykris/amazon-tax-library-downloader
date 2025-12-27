# Installation Guide

## Quick Start (5 Minutes)

### Step 1: Create Icon Files

The extension needs three icon files. Here's the easiest way to create them:

#### Option A: Use Online Tool (Recommended)
1. Go to https://www.favicon-generator.org/
2. Upload any image or create a simple design
3. Download the generated icons
4. Rename them to: `icon16.png`, `icon48.png`, `icon128.png`
5. Place them in the extension folder

#### Option B: Use Simple Colored Squares
Create three PNG files with these dimensions:
- `icon16.png` - 16x16 pixels
- `icon48.png` - 48x48 pixels  
- `icon128.png` - 128x128 pixels

You can use any image editor (Paint, Photoshop, GIMP, etc.) or even take a screenshot and crop it.

**Tip**: Use Amazon's orange color (#FF9900) for brand consistency.

### Step 2: Install the Extension

1. **Open Chrome Extensions Page**
   - Type `chrome://extensions/` in your address bar
   - Or: Menu (⋮) → Extensions → Manage Extensions

2. **Enable Developer Mode**
   - Toggle the switch in the top-right corner
   - This allows you to load unpacked extensions

3. **Load the Extension**
   - Click "Load unpacked" button (top-left)
   - Navigate to the folder containing all extension files:
     ```
     your-folder/
     ├── manifest.json
     ├── content.js
     ├── background.js
     ├── styles.css
     ├── icon16.png
     ├── icon48.png
     └── icon128.png
     ```
   - Click "Select Folder"

4. **Verify Installation**
   - You should see "Amazon Seller Fee Invoice Downloader" in your extensions list
   - The extension should be enabled (toggle switch is blue)

### Step 3: Test It Out

1. **Navigate to Amazon Seller Central**
   ```
   https://sellercentral.amazon.co.uk/tax/seller-fee-invoices
   ```

2. **Look for the Toolbar**
   - You should see a new toolbar above the invoice table
   - It has a gradient background and says "📥 Bulk Invoice Downloader"

3. **Try a Test Download**
   - Check one invoice
   - Click "Download Selected (1)"
   - The file should download to `Downloads/amazon_invoices/`

## Troubleshooting Installation

### "Load unpacked" is Grayed Out
- **Solution**: Enable Developer Mode (toggle in top-right)

### Extension Loads but Toolbar Doesn't Appear
- **Check**: Are you on the correct page? (`/tax/seller-fee-invoices`)
- **Try**: Refresh the page (F5)
- **Check**: Open DevTools (F12) → Console tab for errors

### "Manifest file is missing or unreadable"
- **Check**: All files are in the same folder
- **Check**: `manifest.json` is valid JSON (no syntax errors)
- **Try**: Re-download the files

### Icons Not Showing
- **Solution**: Create placeholder icon files (see Step 1)
- **Note**: The extension will work without icons, but Chrome will show warnings

### Permission Errors
- **Check**: The manifest.json includes all required permissions
- **Try**: Remove and re-add the extension

## File Structure Checklist

Before loading, ensure you have these files:

```
✅ manifest.json       (Extension configuration)
✅ content.js          (Main functionality)
✅ background.js       (Download handler)
✅ styles.css          (Styling)
✅ icon16.png          (Small icon)
✅ icon48.png          (Medium icon)
✅ icon128.png         (Large icon)
✅ README.md           (Documentation - optional)
```

## Updating the Extension

When you make changes to the code:

1. Go to `chrome://extensions/`
2. Find "Amazon Seller Fee Invoice Downloader"
3. Click the refresh icon (🔄)
4. Refresh the Amazon page

## Uninstalling

1. Go to `chrome://extensions/`
2. Find "Amazon Seller Fee Invoice Downloader"
3. Click "Remove"
4. Confirm deletion

Your download history will be cleared automatically.

## Next Steps

Once installed, check out the [README.md](README.md) for:
- Feature overview
- Usage instructions
- Configuration options
- Troubleshooting tips

---

**Need Help?** Open an issue on GitHub or check the troubleshooting section in README.md