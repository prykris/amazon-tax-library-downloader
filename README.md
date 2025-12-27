# Amazon Seller Fee Invoice Downloader

A Chrome extension that adds bulk download and filtering capabilities to Amazon Seller Central's Tax Document Library page.

## 🎯 Features

### ✅ Bulk Download
- Select multiple invoices with checkboxes
- Download all selected invoices with one click
- Automatic file naming: `YYYY-MM-DD_InvoiceID_Marketplace.pdf`
- Progress bar with real-time status updates
- Automatic tab management (opens and closes PDF tabs)

### 🔍 Smart Filtering
- **Marketplace Filter**: Filter by Amazon.de, Amazon.pl, etc.
- **Date Range Filter**: Select custom date ranges
- **Quick Filter**: "Last 6 Months" button for convenience
- **Clear Filters**: Reset all filters instantly

### 📊 Download History
- Tracks which invoices have been downloaded
- Visual indicators (✅ Downloaded / ⬜ Pending)
- Persistent storage across browser sessions
- Clear history option

### 🎨 User Interface
- Clean, professional design matching Amazon's style
- Responsive layout
- Smooth animations and transitions
- Real-time row highlighting during download

## 📦 Installation

### Method 1: Load Unpacked (Development)

1. **Download the Extension**
   - Clone or download this repository
   - Extract to a folder on your computer

2. **Open Chrome Extensions**
   - Navigate to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top-right corner)

3. **Load the Extension**
   - Click "Load unpacked"
   - Select the folder containing the extension files
   - The extension should now appear in your extensions list

4. **Verify Installation**
   - Navigate to Amazon Seller Central Tax Document Library
   - You should see the new toolbar above the invoice table

### Method 2: Create Icons (Optional)

The extension requires three icon files. You can create simple placeholder icons:

1. Create three PNG files: `icon16.png`, `icon48.png`, `icon128.png`
2. Use any image editor or online tool
3. Recommended: Use Amazon's orange (#FF9900) with a download symbol

## 🚀 Usage

### Basic Workflow

1. **Navigate to the Invoice Page**
   ```
   https://sellercentral.amazon.co.uk/tax/seller-fee-invoices
   ```

2. **Apply Filters (Optional)**
   - Type marketplace name (e.g., "Amazon.pl")
   - Select date range
   - Or click "Last 6 Months" for quick filtering

3. **Select Invoices**
   - Check individual invoices
   - Or use "Select All Visible" to select all filtered results

4. **Download**
   - Click "Download Selected (X)" button
   - Watch the progress bar
   - Files will be saved to `Downloads/amazon_invoices/`

### Advanced Features

#### Download History
- Previously downloaded invoices are marked with ✅
- History persists across browser sessions
- Click "Clear Download History" to reset

#### Canceling Downloads
- Click "Cancel" button during download process
- Already downloaded files will be kept
- Remaining downloads will be skipped

#### File Organization
All invoices are automatically saved to:
```
Downloads/
  └── amazon_invoices/
      ├── 2025-11-30_GB-AEU-2025-4852891_de.pdf
      ├── 2025-11-30_GB-AEU-2025-4896471_pl.pdf
      └── 2025-11-30_PL-AEU-2025-1034084_pl.pdf
```

## 🛠️ Technical Details

### Architecture

- **manifest.json**: Extension configuration and permissions
- **content.js**: Main logic, UI injection, filtering, download orchestration
- **background.js**: Tab monitoring, download interception, file management
- **styles.css**: Professional styling matching Amazon's design language

### How It Works

1. **Content Script** injects a toolbar into the Amazon page
2. User selects invoices and clicks download
3. **Content Script** clicks each "View" button sequentially
4. Amazon opens a new tab with the PDF
5. **Background Script** intercepts the new tab
6. **Background Script** downloads the PDF with a clean filename
7. **Background Script** closes the tab automatically
8. Process repeats for each selected invoice

### Permissions Explained

- `storage`: Save download history
- `downloads`: Programmatically download and rename files
- `tabs`: Monitor and close PDF tabs
- `host_permissions`: Access Amazon Seller Central pages

## 🔧 Configuration

You can modify the download delay in `content.js`:

```javascript
const CONFIG = {
  DELAY_BETWEEN_DOWNLOADS: 2500, // milliseconds (default: 2.5 seconds)
  STORAGE_KEY: 'amazon_downloaded_invoices'
};
```

**Note**: Reducing the delay too much may cause Amazon to rate-limit your requests.

## 🐛 Troubleshooting

### Extension Not Appearing
- Ensure you're on the correct page: `/tax/seller-fee-invoices`
- Check that the extension is enabled in `chrome://extensions/`
- Refresh the page after installing

### Downloads Not Working
- Check Chrome's download permissions
- Ensure pop-ups are not blocked for Amazon Seller Central
- Verify the `amazon_invoices` folder exists in Downloads

### Files Not Downloading
- Check browser console for errors (F12 → Console)
- Ensure you have write permissions to Downloads folder
- Try increasing `DELAY_BETWEEN_DOWNLOADS` in config

### Filters Not Working
- Clear filters and try again
- Check date format (YYYY-MM-DD)
- Refresh the page

## 📝 Changelog

### Version 1.0.0 (2025-12-27)
- Initial release
- Bulk download functionality
- Marketplace and date filtering
- Download history tracking
- Progress bar with cancel option
- Automatic file naming and organization

## 🤝 Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

### Development Setup

1. Clone the repository
2. Make your changes
3. Test in Chrome with "Load unpacked"
4. Submit a pull request

## ⚠️ Disclaimer

This extension is not affiliated with, endorsed by, or sponsored by Amazon. It is an independent tool created to improve the user experience of Amazon Seller Central.

Use at your own risk. Always verify downloaded files and maintain backups of important documents.

## 📄 License

MIT License - Feel free to use and modify as needed.

## 🙏 Acknowledgments

- Built for sellers frustrated with manual invoice downloads
- Inspired by the need for better bulk operations in Seller Central
- Thanks to the Chrome Extensions API documentation

## 📧 Support

For issues, questions, or feature requests, please open an issue on GitHub.

---

**Happy Downloading! 📥**