// Amazon Seller Fee Invoice Downloader - Content Script
// High-performance version with direct PDF downloads (no tab opening)

(function() {
  'use strict';

  // Configuration
  const CONFIG = {
    DELAY_BETWEEN_DOWNLOADS: 2500,
    STORAGE_KEY: 'amazon_downloaded_invoices',
    FILTER_DEBOUNCE_MS: 300,
    VIRTUAL_SCROLL_BUFFER: 50,
    CHUNK_SIZE: 100,
    MAX_VISIBLE_ROWS: 500,
    DOWNLOAD_TIMEOUT: 30000, // 30 seconds timeout for PDF downloads
    RETRY_ATTEMPTS: 3
  };

  // Enhanced state management with persistent storage
  class InvoiceDataManager {
    constructor() {
      this.allRows = [];
      this.filteredRows = [];
      this.downloadedInvoices = new Set();
      this.rowDataCache = new Map();
      this.filterCache = new Map();
      this.isInitialized = false;
      this.downloadStatus = new Map(); // Track download attempts and failures
    }

    // Load download status from localStorage
    async loadDownloadStatus() {
      return new Promise((resolve) => {
        chrome.storage.local.get([CONFIG.STORAGE_KEY, CONFIG.STORAGE_KEY + '_status'], (result) => {
          // Load downloaded invoices
          if (result[CONFIG.STORAGE_KEY]) {
            this.downloadedInvoices = new Set(result[CONFIG.STORAGE_KEY]);
          }
          
          // Load download status (attempts, failures, etc.)
          if (result[CONFIG.STORAGE_KEY + '_status']) {
            this.downloadStatus = new Map(Object.entries(result[CONFIG.STORAGE_KEY + '_status']));
          }
          
          resolve();
        });
      });
    }

    // Save download status to localStorage
    saveDownloadStatus() {
      const statusObj = Object.fromEntries(this.downloadStatus);
      chrome.storage.local.set({
        [CONFIG.STORAGE_KEY]: Array.from(this.downloadedInvoices),
        [CONFIG.STORAGE_KEY + '_status']: statusObj
      });
    }

    // Mark invoice as downloaded
    markAsDownloaded(invoiceId) {
      this.downloadedInvoices.add(invoiceId);
      this.downloadStatus.set(invoiceId, {
        status: 'downloaded',
        timestamp: Date.now(),
        attempts: (this.downloadStatus.get(invoiceId)?.attempts || 0) + 1
      });
      this.saveDownloadStatus();
    }

    // Mark invoice as failed
    markAsFailed(invoiceId, error) {
      const current = this.downloadStatus.get(invoiceId) || { attempts: 0 };
      this.downloadStatus.set(invoiceId, {
        status: 'failed',
        timestamp: Date.now(),
        attempts: current.attempts + 1,
        error: error
      });
      this.saveDownloadStatus();
    }

    // Get download status for an invoice
    getDownloadStatus(invoiceId) {
      if (this.downloadedInvoices.has(invoiceId)) {
        return 'downloaded';
      }
      
      const status = this.downloadStatus.get(invoiceId);
      if (status?.status === 'failed' && status.attempts >= CONFIG.RETRY_ATTEMPTS) {
        return 'failed';
      }
      
      return 'pending';
    }

    // Efficiently parse and cache row data
    parseRowData(row, index) {
      if (this.rowDataCache.has(index)) {
        return this.rowDataCache.get(index);
      }

      const cells = row.querySelectorAll('td');
      const viewButton = row.querySelector('button[id*="view_invoice_button"]');
      
      const data = {
        element: row,
        index: index,
        invoiceId: this.extractInvoiceId(cells),
        startDate: this.extractDate(cells, 0),
        endDate: this.extractDate(cells, 1),
        marketplace: this.extractMarketplace(cells),
        textContent: row.textContent.toLowerCase(),
        documentVersionId: viewButton?.value || '',
        buttonData: this.extractButtonData(viewButton),
        isVisible: true,
        isSelected: false
      };

      this.rowDataCache.set(index, data);
      return data;
    }

    // Extract button data attributes (all fields needed for Amazon's endpoint)
    extractButtonData(button) {
      if (!button) return {};
      
      return {
        endDate: button.getAttribute('data-enddate'),
        fileType: button.getAttribute('data-filetype'),
        filterName: button.getAttribute('data-filtername'),
        invoice: button.getAttribute('data-invoice'),
        payeeRegistrationNumber: button.getAttribute('data-payeeregistrationnumber'),
        rarId: button.getAttribute('data-rarid'),
        shedDocumentName: button.getAttribute('data-sheddocumentname')
      };
    }

    extractInvoiceId(cells) {
      for (let cell of cells) {
        const text = cell.textContent.trim();
        if (/^[A-Z]{2}-[A-Z]+-\d+-\d+$/.test(text)) {
          return text;
        }
      }
      return '';
    }

    extractDate(cells, occurrence) {
      const datePattern = /^\w{3}\s\w{3}\s\d{2}/;
      let dateCount = 0;
      
      for (let cell of cells) {
        const text = cell.textContent.trim();
        if (text.match(datePattern)) {
          if (dateCount === occurrence) {
            return new Date(text).toISOString().split('T')[0];
          }
          dateCount++;
        }
      }
      return '';
    }

    extractMarketplace(cells) {
      for (let cell of cells) {
        const text = cell.textContent.trim();
        if (text.startsWith('Amazon.')) {
          return text.replace('Amazon.', '').toLowerCase();
        }
      }
      return 'unknown';
    }

    // Initialize data with chunked processing
    async initializeData(tableRows) {
      if (this.isInitialized) return;

      await this.loadDownloadStatus();
      
      const chunks = this.chunkArray(Array.from(tableRows), CONFIG.CHUNK_SIZE);
      
      for (let chunk of chunks) {
        await this.processChunk(chunk);
        await this.sleep(0);
      }

      this.filteredRows = [...this.allRows];
      this.isInitialized = true;
    }

    async processChunk(chunk) {
      chunk.forEach((row, localIndex) => {
        const globalIndex = this.allRows.length;
        const data = this.parseRowData(row, globalIndex);
        this.allRows.push(data);
      });
    }

    chunkArray(array, size) {
      const chunks = [];
      for (let i = 0; i < array.length; i += size) {
        chunks.push(array.slice(i, i + size));
      }
      return chunks;
    }

    sleep(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Optimized filtering with caching
    applyFilters(filters) {
      const cacheKey = JSON.stringify(filters);
      
      if (this.filterCache.has(cacheKey)) {
        this.filteredRows = this.filterCache.get(cacheKey);
        return this.filteredRows;
      }

      this.filteredRows = this.allRows.filter(data => {
        // Marketplace filter
        if (filters.marketplace && !data.textContent.includes(filters.marketplace.toLowerCase())) {
          return false;
        }

        // Date range filter
        if (filters.dateFrom && data.endDate && data.endDate < filters.dateFrom) {
          return false;
        }
        if (filters.dateTo && data.startDate && data.startDate > filters.dateTo) {
          return false;
        }

        // Status filter
        if (filters.status) {
          const downloadStatus = this.getDownloadStatus(data.invoiceId);
          if (filters.status !== downloadStatus) {
            return false;
          }
        }

        return true;
      });

      // Cache management
      if (this.filterCache.size > 50) {
        const firstKey = this.filterCache.keys().next().value;
        this.filterCache.delete(firstKey);
      }
      this.filterCache.set(cacheKey, this.filteredRows);

      return this.filteredRows;
    }

    getVisibleRowsSlice(startIndex, endIndex) {
      return this.filteredRows.slice(startIndex, endIndex);
    }

    getSelectedCount() {
      return this.filteredRows.filter(data => data.isSelected).length;
    }

    getSelectedByStatus(status) {
      return this.filteredRows.filter(data => 
        data.isSelected && this.getDownloadStatus(data.invoiceId) === status
      ).length;
    }

    toggleSelection(index, selected) {
      if (this.filteredRows[index]) {
        this.filteredRows[index].isSelected = selected;
      }
    }

    selectAllVisible(selected) {
      this.filteredRows.forEach(data => {
        data.isSelected = selected;
      });
    }

    selectByStatus(status, selected) {
      this.filteredRows.forEach(data => {
        if (this.getDownloadStatus(data.invoiceId) === status) {
          data.isSelected = selected;
        }
      });
    }

    clearDownloadHistory() {
      this.downloadedInvoices.clear();
      this.downloadStatus.clear();
      chrome.storage.local.remove([CONFIG.STORAGE_KEY, CONFIG.STORAGE_KEY + '_status']);
    }
  }

  // Direct PDF download manager - NO TAB OPENING
  class DirectDownloadManager {
    constructor(dataManager) {
      this.dataManager = dataManager;
      this.isDownloading = false;
      this.currentDownload = null;
      this.abortController = null;
    }

    // Download PDF directly using Amazon's actual endpoint - NO TAB OPENING
    async downloadPdfDirect(invoiceData) {
      const { documentVersionId, invoiceId, buttonData } = invoiceData;
      
      if (!documentVersionId && !buttonData.rarId) {
        throw new Error('No document version ID or rarId found');
      }

      // Create abort controller for timeout
      this.abortController = new AbortController();
      const timeoutId = setTimeout(() => {
        this.abortController.abort();
      }, CONFIG.DOWNLOAD_TIMEOUT);

      try {
        // Step 1: Get PDF URL from Amazon's endpoint (same as original button click)
        const pdfUrl = await this.getPdfUrlFromAmazon(documentVersionId, buttonData);
        
        console.log(`Direct download: ${invoiceId} from ${pdfUrl}`);

        // Step 2: Fetch PDF with session cookies
        const response = await fetch(pdfUrl, {
          method: 'GET',
          credentials: 'include', // Include session cookies
          signal: this.abortController.signal,
          headers: {
            'Accept': 'application/pdf,*/*',
            'Cache-Control': 'no-cache'
          }
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        // Get PDF blob
        const pdfBlob = await response.blob();
        
        if (pdfBlob.size === 0) {
          throw new Error('Empty PDF received');
        }

        // Generate filename
        const filename = this.generateFilename(invoiceData);
        
        // Download using browser's download API
        await this.downloadBlob(pdfBlob, filename);
        
        return { success: true, filename };

      } catch (error) {
        clearTimeout(timeoutId);
        
        if (error.name === 'AbortError') {
          throw new Error('Download timeout');
        }
        
        throw error;
      }
    }

    // Get PDF URL from Amazon's endpoint (replicates the original button behavior)
    async getPdfUrlFromAmazon(documentVersionId, buttonData) {
      // Construct the request payload exactly like Amazon's original code
      const value = {
        fileType: encodeURIComponent(buttonData.fileType || ''),
        vatInvoiceNumber: encodeURIComponent(buttonData.invoice || ''),
        endDate: encodeURIComponent(buttonData.endDate || ''),
        payeeRegistrationNumber: encodeURIComponent(buttonData.payeeRegistrationNumber || ''),
        filterName: encodeURIComponent(buttonData.filterName || '')
      };

      // Handle different invoice types (CtrlP vs Beejak)
      const rarId = buttonData.rarId;
      const shedDocumentName = buttonData.shedDocumentName;

      if (rarId && shedDocumentName && rarId !== 'null' && shedDocumentName !== 'null') {
        // CtrlP Invoice - use SHED fields
        value.rarId = encodeURIComponent(rarId);
        value.shedDocumentName = encodeURIComponent(shedDocumentName);
      } else {
        // Beejak Invoice - use Alexandria field
        value.documentVersionId = encodeURIComponent(documentVersionId);
      }

      // Make the same AJAX request as Amazon's original code
      const response = await fetch('/tax/view-seller-fee-invoice-execute', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: JSON.stringify(value)
      });

      if (!response.ok) {
        throw new Error(`Failed to get PDF URL: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      if (!data.url) {
        throw new Error('No PDF URL returned from Amazon');
      }

      return data.url;
    }

    // Download blob as file
    async downloadBlob(blob, filename) {
      return new Promise((resolve, reject) => {
        try {
          // Create object URL
          const url = URL.createObjectURL(blob);
          
          // Create download link
          const a = document.createElement('a');
          a.href = url;
          a.download = filename;
          a.style.display = 'none';
          
          // Trigger download
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          
          // Cleanup
          setTimeout(() => {
            URL.revokeObjectURL(url);
            resolve();
          }, 100);
          
        } catch (error) {
          reject(error);
        }
      });
    }

    // Generate clean filename
    generateFilename(invoiceData) {
      const { invoiceId, endDate, marketplace } = invoiceData;
      const date = endDate ? endDate.split('T')[0] : 'unknown-date';
      const cleanInvoiceId = invoiceId.replace(/[^a-zA-Z0-9-]/g, '_');
      const cleanMarketplace = marketplace || 'unknown';
      
      return `${date}_${cleanInvoiceId}_${cleanMarketplace}.pdf`;
    }

    // Cancel current download
    cancelDownload() {
      if (this.abortController) {
        this.abortController.abort();
      }
      this.isDownloading = false;
      this.currentDownload = null;
    }
  }

  // Enhanced filter manager with status filtering
  class FilterManager {
    constructor(dataManager, updateCallback) {
      this.dataManager = dataManager;
      this.updateCallback = updateCallback;
      this.debounceTimer = null;
      this.currentFilters = {
        marketplace: '',
        dateFrom: '',
        dateTo: '',
        status: '' // 'pending', 'downloaded', 'failed'
      };
    }

    updateFilter(filterType, value) {
      this.currentFilters[filterType] = value;
      
      clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(() => {
        this.applyFilters();
      }, CONFIG.FILTER_DEBOUNCE_MS);
    }

    applyFilters() {
      const startTime = performance.now();
      
      this.dataManager.applyFilters(this.currentFilters);
      this.updateCallback();

      const endTime = performance.now();
      console.log(`Filter applied in ${endTime - startTime}ms`);
    }

    clearFilters() {
      this.currentFilters = {
        marketplace: '',
        dateFrom: '',
        dateTo: '',
        status: ''
      };
      this.applyFilters();
    }
  }

  // Main application class
  class InvoiceDownloader {
    constructor() {
      this.dataManager = new InvoiceDataManager();
      this.downloadManager = new DirectDownloadManager(this.dataManager);
      this.filterManager = null;
      this.isDownloading = false;
      this.downloadQueue = [];
      this.currentDownloadIndex = 0;
    }

    async init() {
      const table = document.querySelector('table.fba-core-data');
      if (!table) {
        console.log('Amazon Invoice Downloader: Table not found');
        return;
      }

      this.showLoadingIndicator();

      // Initialize data manager
      const rows = table.querySelectorAll('tbody tr');
      await this.dataManager.initializeData(rows);

      // Inject enhanced toolbar
      this.injectEnhancedToolbar(table);

      // Initialize filter manager
      this.filterManager = new FilterManager(this.dataManager, () => {
        this.updateDisplay();
      });

      // Setup event listeners
      this.attachEventListeners();

      // Initial display update
      this.updateDisplay();

      this.hideLoadingIndicator();

      console.log(`Initialized with ${this.dataManager.allRows.length} rows`);
    }

    showLoadingIndicator() {
      const indicator = document.createElement('div');
      indicator.id = 'amz-loading-indicator';
      indicator.innerHTML = `
        <div style="position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); 
                    background: white; padding: 20px; border: 2px solid #ff9900; border-radius: 8px; z-index: 10000;">
          <div class="amz-loading-spinner"></div>
          <div>Loading invoice data...</div>
          <div style="margin-top: 10px; font-size: 12px; color: #666;">
            Optimizing for ${document.querySelectorAll('table.fba-core-data tbody tr').length} rows
          </div>
        </div>
      `;
      document.body.appendChild(indicator);
    }

    hideLoadingIndicator() {
      const indicator = document.getElementById('amz-loading-indicator');
      if (indicator) {
        indicator.remove();
      }
    }

    injectEnhancedToolbar(table) {
      const toolbar = document.createElement('div');
      toolbar.className = 'amz-invoice-toolbar';
      toolbar.innerHTML = `
        <div class="amz-toolbar-section">
          <h3>📥 Bulk Invoice Downloader (No Tab Opening)</h3>
          <div class="amz-stats">
            Total: <span id="amz-total-count">${this.dataManager.allRows.length}</span> | 
            Visible: <span id="amz-visible-count">${this.dataManager.filteredRows.length}</span> | 
            Selected: <span id="amz-selected-count">0</span>
            <span class="amz-performance-badge amz-performance-good">No Hibernation</span>
          </div>
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

          <label class="amz-filter-label">
            📊 Filter by Status:
            <select id="amz-status-filter" class="amz-filter-input">
              <option value="">All Status</option>
              <option value="pending">Pending Only</option>
              <option value="downloaded">Downloaded Only</option>
              <option value="failed">Failed Only</option>
            </select>
          </label>
          
          <button id="amz-quick-6months" class="amz-btn amz-btn-secondary">Last 6 Months</button>
          <button id="amz-clear-filters" class="amz-btn amz-btn-secondary">Clear Filters</button>
        </div>
        
        <div class="amz-toolbar-section">
          <label class="amz-checkbox-label">
            <input type="checkbox" id="amz-select-all" class="amz-checkbox">
            <span>Select All Visible</span>
          </label>

          <button id="amz-select-pending" class="amz-btn amz-btn-secondary">Select Pending</button>
          <button id="amz-select-failed" class="amz-btn amz-btn-secondary">Select Failed</button>
          
          <button id="amz-download-selected" class="amz-btn amz-btn-primary" disabled>
            Download Selected (<span id="amz-selected-count-btn">0</span>)
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
          <div id="amz-download-details" class="amz-download-details"></div>
          <button id="amz-cancel-download" class="amz-btn amz-btn-danger">Cancel</button>
        </div>
      `;

      table.parentElement.insertBefore(toolbar, table);
    }

    attachEventListeners() {
      // Filter listeners
      document.getElementById('amz-marketplace-filter').addEventListener('input', (e) => {
        this.filterManager.updateFilter('marketplace', e.target.value);
      });

      document.getElementById('amz-date-from').addEventListener('change', (e) => {
        this.filterManager.updateFilter('dateFrom', e.target.value);
      });

      document.getElementById('amz-date-to').addEventListener('change', (e) => {
        this.filterManager.updateFilter('dateTo', e.target.value);
      });

      document.getElementById('amz-status-filter').addEventListener('change', (e) => {
        this.filterManager.updateFilter('status', e.target.value);
      });

      // Quick filters
      document.getElementById('amz-quick-6months').addEventListener('click', () => {
        const today = new Date();
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(today.getMonth() - 6);
        
        document.getElementById('amz-date-from').value = sixMonthsAgo.toISOString().split('T')[0];
        document.getElementById('amz-date-to').value = today.toISOString().split('T')[0];
        
        this.filterManager.updateFilter('dateFrom', document.getElementById('amz-date-from').value);
        this.filterManager.updateFilter('dateTo', document.getElementById('amz-date-to').value);
      });

      document.getElementById('amz-clear-filters').addEventListener('click', () => {
        document.getElementById('amz-marketplace-filter').value = '';
        document.getElementById('amz-date-from').value = '';
        document.getElementById('amz-date-to').value = '';
        document.getElementById('amz-status-filter').value = '';
        this.filterManager.clearFilters();
      });

      // Selection listeners
      document.getElementById('amz-select-all').addEventListener('change', (e) => {
        this.dataManager.selectAllVisible(e.target.checked);
        this.updateDisplay();
      });

      document.getElementById('amz-select-pending').addEventListener('click', () => {
        this.dataManager.selectByStatus('pending', true);
        this.updateDisplay();
      });

      document.getElementById('amz-select-failed').addEventListener('click', () => {
        this.dataManager.selectByStatus('failed', true);
        this.updateDisplay();
      });

      // Download listener
      document.getElementById('amz-download-selected').addEventListener('click', () => {
        this.startDirectDownload();
      });

      // Clear history
      document.getElementById('amz-clear-history').addEventListener('click', () => {
        if (confirm('Clear download history? This will remove all download status.')) {
          this.dataManager.clearDownloadHistory();
          this.updateDisplay();
        }
      });

      // Cancel download
      document.getElementById('amz-cancel-download').addEventListener('click', () => {
        this.cancelDownload();
      });
    }

    updateDisplay() {
      this.updateCounts();
      this.updateSelectionCount();
      this.updateTableStatus();
    }

    updateCounts() {
      document.getElementById('amz-total-count').textContent = this.dataManager.allRows.length;
      document.getElementById('amz-visible-count').textContent = this.dataManager.filteredRows.length;
    }

    updateSelectionCount() {
      const count = this.dataManager.getSelectedCount();
      const pendingCount = this.dataManager.getSelectedByStatus('pending');
      const downloadedCount = this.dataManager.getSelectedByStatus('downloaded');
      const failedCount = this.dataManager.getSelectedByStatus('failed');
      
      document.getElementById('amz-selected-count').textContent = 
        `${count} (${pendingCount}P, ${downloadedCount}D, ${failedCount}F)`;
      document.getElementById('amz-selected-count-btn').textContent = count;
      document.getElementById('amz-download-selected').disabled = pendingCount === 0 && failedCount === 0;
    }

    updateTableStatus() {
      // Update table rows with current status
      const tbody = document.querySelector('table.fba-core-data tbody');
      if (!tbody) return;

      const rows = tbody.querySelectorAll('tr');
      rows.forEach((row, index) => {
        const data = this.dataManager.allRows[index];
        if (!data) return;

        let statusCell = row.querySelector('.amz-status-cell');
        if (!statusCell) {
          // Add status cell if it doesn't exist
          statusCell = document.createElement('td');
          statusCell.className = 'amz-status-cell';
          row.appendChild(statusCell);
        }

        const status = this.dataManager.getDownloadStatus(data.invoiceId);
        const statusInfo = this.dataManager.downloadStatus.get(data.invoiceId);
        
        let statusHtml = '';
        switch (status) {
          case 'downloaded':
            statusHtml = '<span class="amz-status-downloaded">✅ Downloaded</span>';
            row.classList.add('amz-downloaded-row');
            row.classList.remove('amz-failed-row');
            break;
          case 'failed':
            const attempts = statusInfo?.attempts || 0;
            statusHtml = `<span class="amz-status-failed">❌ Failed (${attempts}/${CONFIG.RETRY_ATTEMPTS})</span>`;
            row.classList.add('amz-failed-row');
            row.classList.remove('amz-downloaded-row');
            break;
          default:
            statusHtml = '<span class="amz-status-pending">⬜ Pending</span>';
            row.classList.remove('amz-downloaded-row', 'amz-failed-row');
        }
        
        statusCell.innerHTML = statusHtml;
      });
    }

    // Direct download without tab opening
    async startDirectDownload() {
      if (this.isDownloading) return;

      const selectedRows = this.dataManager.filteredRows.filter(data => {
        const status = this.dataManager.getDownloadStatus(data.invoiceId);
        return data.isSelected && (status === 'pending' || status === 'failed');
      });
      
      if (selectedRows.length === 0) {
        alert('Please select at least one pending or failed invoice to download.');
        return;
      }

      this.isDownloading = true;
      this.downloadQueue = selectedRows;
      this.currentDownloadIndex = 0;

      // Show progress
      this.showProgress();

      let successCount = 0;
      let failureCount = 0;

      for (let i = 0; i < this.downloadQueue.length && this.isDownloading; i++) {
        this.currentDownloadIndex = i;
        const invoiceData = this.downloadQueue[i];
        
        this.updateProgress(i + 1, this.downloadQueue.length, invoiceData.invoiceId);

        try {
          const result = await this.downloadManager.downloadPdfDirect(invoiceData);
          
          this.dataManager.markAsDownloaded(invoiceData.invoiceId);
          successCount++;
          
          console.log(`✅ Downloaded: ${invoiceData.invoiceId} as ${result.filename}`);
          
        } catch (error) {
          this.dataManager.markAsFailed(invoiceData.invoiceId, error.message);
          failureCount++;
          
          console.error(`❌ Failed: ${invoiceData.invoiceId} - ${error.message}`);
        }

        // Update display
        this.updateDisplay();

        // Wait between downloads
        if (i < this.downloadQueue.length - 1 && this.isDownloading) {
          await this.sleep(CONFIG.DELAY_BETWEEN_DOWNLOADS);
        }
      }

      this.hideProgress();
      this.isDownloading = false;

      // Show completion message
      const message = `Download completed!\n✅ Success: ${successCount}\n❌ Failed: ${failureCount}`;
      alert(message);
    }

    showProgress() {
      document.getElementById('amz-progress-container').style.display = 'block';
      document.getElementById('amz-download-selected').disabled = true;
    }

    hideProgress() {
      document.getElementById('amz-progress-container').style.display = 'none';
      document.getElementById('amz-download-selected').disabled = false;
    }

    updateProgress(current, total, invoiceId) {
      const progress = (current / total) * 100;
      document.getElementById('amz-progress-fill').style.width = progress + '%';
      document.getElementById('amz-progress-text').textContent = 
        `Processing ${current} / ${total} - ${invoiceId}`;
      
      const details = document.getElementById('amz-download-details');
      if (details) {
        details.textContent = `Direct download (no tabs) - Stay on this page`;
      }
    }

    cancelDownload() {
      this.isDownloading = false;
      this.downloadManager.cancelDownload();
      this.hideProgress();
      alert(`Download cancelled. Processed ${this.currentDownloadIndex} of ${this.downloadQueue.length} invoices.`);
    }

    sleep(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    }
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      new InvoiceDownloader().init();
    });
  } else {
    new InvoiceDownloader().init();
  }

})();