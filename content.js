// Amazon Seller Fee Invoice Downloader - Content Script
// This script runs on the Amazon Seller Central invoice page

(function() {
  'use strict';

  // Configuration
  const CONFIG = {
    DELAY_BETWEEN_DOWNLOADS: 2500, // ms between each download
    STORAGE_KEY: 'amazon_downloaded_invoices'
  };

  // State management
  let isDownloading = false;
  let downloadedInvoices = new Set();

  // Initialize the extension
  function init() {
    // Load previously downloaded invoices from storage
    loadDownloadedInvoices();
    
    // Find the invoice table
    const table = document.querySelector('table.fba-core-data');
    if (!table) {
      console.log('Amazon Invoice Downloader: Table not found');
      return;
    }

    // Inject the control toolbar
    injectToolbar(table);
    
    // Add checkboxes to table rows
    enhanceTable(table);
    
    // Mark previously downloaded invoices
    markDownloadedInvoices();
  }

  // Load downloaded invoices from Chrome storage
  function loadDownloadedInvoices() {
    chrome.storage.local.get([CONFIG.STORAGE_KEY], (result) => {
      if (result[CONFIG.STORAGE_KEY]) {
        downloadedInvoices = new Set(result[CONFIG.STORAGE_KEY]);
      }
    });
  }

  // Save downloaded invoice to storage
  function saveDownloadedInvoice(invoiceId) {
    downloadedInvoices.add(invoiceId);
    chrome.storage.local.set({
      [CONFIG.STORAGE_KEY]: Array.from(downloadedInvoices)
    });
  }

  // Inject the control toolbar above the table
  function injectToolbar(table) {
    const toolbar = document.createElement('div');
    toolbar.className = 'amz-invoice-toolbar';
    toolbar.innerHTML = `
      <div class="amz-toolbar-section">
        <h3>📥 Bulk Invoice Downloader</h3>
      </div>
      
      <div class="amz-toolbar-section">
        <label class="amz-filter-label">
          🔍 Filter by Marketplace:
          <input type="text" id="amz-marketplace-filter" class="amz-filter-input" placeholder="e.g., Amazon.pl, Amazon.de">
        </label>
        
        <label class="amz-filter-label">
          📅 Filter by Date Range:
          <input type="date" id="amz-date-from" class="amz-date-input">
          <span>to</span>
          <input type="date" id="amz-date-to" class="amz-date-input">
        </label>
        
        <button id="amz-quick-6months" class="amz-btn amz-btn-secondary">Last 6 Months</button>
        <button id="amz-clear-filters" class="amz-btn amz-btn-secondary">Clear Filters</button>
      </div>
      
      <div class="amz-toolbar-section">
        <label class="amz-checkbox-label">
          <input type="checkbox" id="amz-select-all" class="amz-checkbox">
          <span>Select All Visible</span>
        </label>
        
        <button id="amz-download-selected" class="amz-btn amz-btn-primary" disabled>
          Download Selected (<span id="amz-selected-count">0</span>)
        </button>
        
        <button id="amz-clear-history" class="amz-btn amz-btn-warning">
          Clear Download History
        </button>
      </div>
      
      <div id="amz-progress-container" class="amz-progress-container" style="display: none;">
        <div class="amz-progress-bar">
          <div id="amz-progress-fill" class="amz-progress-fill"></div>
        </div>
        <div id="amz-progress-text" class="amz-progress-text">Processing 0 / 0...</div>
        <button id="amz-cancel-download" class="amz-btn amz-btn-danger">Cancel</button>
      </div>
    `;

    table.parentElement.insertBefore(toolbar, table);

    // Attach event listeners
    attachToolbarListeners();
  }

  // Attach event listeners to toolbar controls
  function attachToolbarListeners() {
    // Marketplace filter
    document.getElementById('amz-marketplace-filter').addEventListener('input', (e) => {
      filterRows();
    });

    // Date filters
    document.getElementById('amz-date-from').addEventListener('change', filterRows);
    document.getElementById('amz-date-to').addEventListener('change', filterRows);

    // Quick filter: Last 6 months
    document.getElementById('amz-quick-6months').addEventListener('click', () => {
      const today = new Date();
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(today.getMonth() - 6);
      
      document.getElementById('amz-date-from').value = sixMonthsAgo.toISOString().split('T')[0];
      document.getElementById('amz-date-to').value = today.toISOString().split('T')[0];
      filterRows();
    });

    // Clear filters
    document.getElementById('amz-clear-filters').addEventListener('click', () => {
      document.getElementById('amz-marketplace-filter').value = '';
      document.getElementById('amz-date-from').value = '';
      document.getElementById('amz-date-to').value = '';
      filterRows();
    });

    // Select all checkbox
    document.getElementById('amz-select-all').addEventListener('change', (e) => {
      toggleAllVisible(e.target.checked);
    });

    // Download button
    document.getElementById('amz-download-selected').addEventListener('click', startBulkDownload);

    // Clear history button
    document.getElementById('amz-clear-history').addEventListener('click', () => {
      if (confirm('Clear download history? This will remove all checkmarks.')) {
        downloadedInvoices.clear();
        chrome.storage.local.remove(CONFIG.STORAGE_KEY);
        markDownloadedInvoices();
      }
    });
  }

  // Enhance table with checkboxes and status indicators
  function enhanceTable(table) {
    const thead = table.querySelector('thead tr');
    const checkboxTh = document.createElement('th');
    checkboxTh.innerHTML = '<input type="checkbox" id="amz-header-checkbox" class="amz-checkbox">';
    thead.insertBefore(checkboxTh, thead.firstChild);

    // Add status column
    const statusTh = document.createElement('th');
    statusTh.textContent = 'Status';
    statusTh.className = 'info';
    thead.appendChild(statusTh);

    const tbody = table.querySelector('tbody');
    const rows = tbody.querySelectorAll('tr');

    rows.forEach((row, index) => {
      // Add checkbox column
      const checkboxTd = document.createElement('td');
      checkboxTd.innerHTML = `<input type="checkbox" class="amz-row-checkbox amz-checkbox" data-row-index="${index}">`;
      row.insertBefore(checkboxTd, row.firstChild);

      // Add status column
      const statusTd = document.createElement('td');
      statusTd.className = 'amz-status-cell';
      row.appendChild(statusTd);

      // Extract invoice data
      const invoiceId = extractInvoiceId(row);
      const startDate = extractStartDate(row);
      const endDate = extractEndDate(row);
      
      // Store data attributes
      row.dataset.invoiceId = invoiceId;
      row.dataset.startDate = startDate;
      row.dataset.endDate = endDate;

      // Checkbox change listener
      checkboxTd.querySelector('input').addEventListener('change', updateSelectedCount);
    });

    // Header checkbox listener
    document.getElementById('amz-header-checkbox').addEventListener('change', (e) => {
      toggleAllVisible(e.target.checked);
    });
  }

  // Extract invoice ID from row
  function extractInvoiceId(row) {
    const cells = row.querySelectorAll('td');
    // Invoice Number is typically in column 6 (after our added checkbox column, it's 7)
    for (let cell of cells) {
      const text = cell.textContent.trim();
      if (text.match(/^[A-Z]{2}-[A-Z]+-\d+-\d+$/)) {
        return text;
      }
    }
    return '';
  }

  // Extract start date from row
  function extractStartDate(row) {
    const cells = row.querySelectorAll('td');
    // Start Date column - look for date pattern
    for (let cell of cells) {
      const text = cell.textContent.trim();
      if (text.match(/^\w{3}\s\w{3}\s\d{2}/)) {
        return new Date(text).toISOString().split('T')[0];
      }
    }
    return '';
  }

  // Extract end date from row
  function extractEndDate(row) {
    const cells = row.querySelectorAll('td');
    const datePattern = /^\w{3}\s\w{3}\s\d{2}/;
    let dateCount = 0;
    
    for (let cell of cells) {
      const text = cell.textContent.trim();
      if (text.match(datePattern)) {
        dateCount++;
        if (dateCount === 2) {
          return new Date(text).toISOString().split('T')[0];
        }
      }
    }
    return '';
  }

  // Filter table rows based on current filter values
  function filterRows() {
    const marketplaceFilter = document.getElementById('amz-marketplace-filter').value.toLowerCase();
    const dateFrom = document.getElementById('amz-date-from').value;
    const dateTo = document.getElementById('amz-date-to').value;

    const rows = document.querySelectorAll('table.fba-core-data tbody tr');
    
    rows.forEach(row => {
      let show = true;

      // Marketplace filter
      if (marketplaceFilter && !row.textContent.toLowerCase().includes(marketplaceFilter)) {
        show = false;
      }

      // Date range filter
      if (dateFrom && row.dataset.endDate && row.dataset.endDate < dateFrom) {
        show = false;
      }
      if (dateTo && row.dataset.startDate && row.dataset.startDate > dateTo) {
        show = false;
      }

      row.style.display = show ? '' : 'none';
    });

    updateSelectedCount();
  }

  // Toggle all visible checkboxes
  function toggleAllVisible(checked) {
    const rows = document.querySelectorAll('table.fba-core-data tbody tr');
    rows.forEach(row => {
      if (row.style.display !== 'none') {
        const checkbox = row.querySelector('.amz-row-checkbox');
        if (checkbox) {
          checkbox.checked = checked;
        }
      }
    });
    updateSelectedCount();
  }

  // Update selected count display
  function updateSelectedCount() {
    const checkboxes = document.querySelectorAll('.amz-row-checkbox:checked');
    const visibleChecked = Array.from(checkboxes).filter(cb => {
      return cb.closest('tr').style.display !== 'none';
    });
    
    const count = visibleChecked.length;
    document.getElementById('amz-selected-count').textContent = count;
    document.getElementById('amz-download-selected').disabled = count === 0;
  }

  // Mark previously downloaded invoices
  function markDownloadedInvoices() {
    const rows = document.querySelectorAll('table.fba-core-data tbody tr');
    rows.forEach(row => {
      const invoiceId = row.dataset.invoiceId;
      const statusCell = row.querySelector('.amz-status-cell');
      
      if (downloadedInvoices.has(invoiceId)) {
        statusCell.innerHTML = '<span class="amz-status-downloaded">✅ Downloaded</span>';
        row.classList.add('amz-downloaded-row');
      } else {
        statusCell.innerHTML = '<span class="amz-status-pending">⬜ Pending</span>';
        row.classList.remove('amz-downloaded-row');
      }
    });
  }

  // Start bulk download process
  async function startBulkDownload() {
    if (isDownloading) return;

    const selectedCheckboxes = Array.from(document.querySelectorAll('.amz-row-checkbox:checked'))
      .filter(cb => cb.closest('tr').style.display !== 'none');

    if (selectedCheckboxes.length === 0) {
      alert('Please select at least one invoice to download.');
      return;
    }

    isDownloading = true;
    const total = selectedCheckboxes.length;
    let current = 0;
    let cancelled = false;

    // Show progress bar
    const progressContainer = document.getElementById('amz-progress-container');
    const progressFill = document.getElementById('amz-progress-fill');
    const progressText = document.getElementById('amz-progress-text');
    const cancelBtn = document.getElementById('amz-cancel-download');
    
    progressContainer.style.display = 'block';
    document.getElementById('amz-download-selected').disabled = true;

    // Cancel handler
    const cancelHandler = () => {
      cancelled = true;
      cancelBtn.removeEventListener('click', cancelHandler);
    };
    cancelBtn.addEventListener('click', cancelHandler);

    // Process each selected invoice
    for (let i = 0; i < selectedCheckboxes.length && !cancelled; i++) {
      current = i + 1;
      const checkbox = selectedCheckboxes[i];
      const row = checkbox.closest('tr');
      const invoiceId = row.dataset.invoiceId;
      
      // Update progress
      const progress = (current / total) * 100;
      progressFill.style.width = progress + '%';
      progressText.textContent = `Processing ${current} / ${total} - ${invoiceId}`;

      // Highlight current row
      row.classList.add('amz-processing-row');
      row.scrollIntoView({ behavior: 'smooth', block: 'center' });

      // Find and click the View button
      const viewButton = row.querySelector('button[id*="view_invoice_button"]');
      if (viewButton) {
        const documentVersionId = viewButton.value;
        const endDate = row.dataset.endDate;
        const marketplace = extractMarketplace(row);

        // Notify background script to expect a download
        chrome.runtime.sendMessage({
          action: 'expect_download',
          invoiceId: invoiceId,
          documentVersionId: documentVersionId,
          endDate: endDate,
          marketplace: marketplace
        });

        // Click the button
        viewButton.click();

        // Wait for download to process
        await sleep(CONFIG.DELAY_BETWEEN_DOWNLOADS);

        // Mark as downloaded
        saveDownloadedInvoice(invoiceId);
        const statusCell = row.querySelector('.amz-status-cell');
        statusCell.innerHTML = '<span class="amz-status-downloaded">✅ Downloaded</span>';
        row.classList.add('amz-downloaded-row');
      }

      row.classList.remove('amz-processing-row');
      checkbox.checked = false;
    }

    // Cleanup
    progressContainer.style.display = 'none';
    progressFill.style.width = '0%';
    isDownloading = false;
    updateSelectedCount();

    if (cancelled) {
      alert(`Download cancelled. Processed ${current} of ${total} invoices.`);
    } else {
      alert(`Successfully processed ${total} invoices!`);
    }
  }

  // Extract marketplace from row
  function extractMarketplace(row) {
    const cells = row.querySelectorAll('td');
    for (let cell of cells) {
      const text = cell.textContent.trim();
      if (text.startsWith('Amazon.')) {
        return text.replace('Amazon.', '').toLowerCase();
      }
    }
    return 'unknown';
  }

  // Sleep utility
  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();