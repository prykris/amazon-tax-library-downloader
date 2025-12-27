// Amazon Seller Fee Invoice Downloader - Background Script
// Handles tab monitoring and download interception

let isMonitoring = false;
let currentDownloadInfo = null;
let monitoringTabId = null;

// Listen for messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'expect_download') {
    isMonitoring = true;
    monitoringTabId = sender.tab.id;
    currentDownloadInfo = {
      invoiceId: request.invoiceId,
      documentVersionId: request.documentVersionId,
      endDate: request.endDate,
      marketplace: request.marketplace
    };
    console.log('Background: Expecting download for', currentDownloadInfo.invoiceId);
  }
  return true;
});

// Monitor for new tabs opening (when View button is clicked)
chrome.tabs.onCreated.addListener((tab) => {
  if (isMonitoring && tab.openerTabId === monitoringTabId) {
    console.log('Background: New tab detected', tab.id);
    
    // Wait a moment for the URL to load
    setTimeout(() => {
      chrome.tabs.get(tab.id, (updatedTab) => {
        if (chrome.runtime.lastError) {
          console.log('Background: Tab already closed');
          return;
        }
        
        if (updatedTab.url && (updatedTab.url.includes('.pdf') || updatedTab.url.startsWith('blob:'))) {
          handlePdfTab(updatedTab);
        }
      });
    }, 500);
  }
});

// Monitor tab updates (for URL changes)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!isMonitoring || !changeInfo.url) return;
  
  // Check if this is a PDF URL or blob
  if (changeInfo.url.includes('.pdf') || changeInfo.url.startsWith('blob:') || changeInfo.url.includes('document/download')) {
    console.log('Background: PDF URL detected', changeInfo.url);
    handlePdfTab(tab);
  }
});

// Handle PDF tab - download and close
function handlePdfTab(tab) {
  if (!currentDownloadInfo) {
    console.log('Background: No download info available');
    return;
  }

  const filename = generateFilename(currentDownloadInfo);
  
  console.log('Background: Initiating download', filename);
  
  // Download the PDF
  chrome.downloads.download({
    url: tab.url,
    filename: `amazon_invoices/${filename}`,
    conflictAction: 'uniquify',
    saveAs: false
  }, (downloadId) => {
    if (chrome.runtime.lastError) {
      console.error('Background: Download error', chrome.runtime.lastError);
    } else {
      console.log('Background: Download started', downloadId);
      
      // Close the tab after a short delay
      setTimeout(() => {
        chrome.tabs.remove(tab.id, () => {
          if (chrome.runtime.lastError) {
            console.log('Background: Tab already closed');
          }
        });
      }, 1000);
    }
  });

  // Reset monitoring state
  isMonitoring = false;
  currentDownloadInfo = null;
}

// Generate a clean filename
function generateFilename(info) {
  const date = info.endDate || 'unknown-date';
  const invoiceId = info.invoiceId.replace(/[^a-zA-Z0-9-]/g, '_');
  const marketplace = info.marketplace || 'unknown';
  
  return `${date}_${invoiceId}_${marketplace}.pdf`;
}

// Listen for download completion
chrome.downloads.onChanged.addListener((delta) => {
  if (delta.state && delta.state.current === 'complete') {
    console.log('Background: Download completed', delta.id);
  }
  
  if (delta.error) {
    console.error('Background: Download error', delta.error);
  }
});

console.log('Amazon Invoice Downloader: Background script loaded');