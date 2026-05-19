/**
 * YTM Block - Content Script (Phase 7: Context Menus, Dynamic Toasts & Auto-Skipping)
 * 
 * Injected automatically on music.youtube.com at document_idle.
 * Monitors track transitions, scrubs Up Next queue elements, caches right-click context menu 
 * selections, and renders premium floating glass capsule notifications with unblock action 
 * bindings.
 */

class YTMBlockController {
  constructor() {
    // Local memory cache of blocked artists to ensure instant lookups
    this.blockedArtists = [];
    
    // Player observer references
    this.observer = null;
    this.debounceTimeout = null;
    
    // Cache for tracking the currently logged track to prevent duplicate logs during DOM churn
    this.lastTrackInfo = {
      title: '',
      artist: ''
    };

    // Cache of the last track we attempted to skip to avoid infinite retry loops on same song
    this.lastSkippedTrack = {
      title: '',
      artist: ''
    };

    // Cooldown and Rate Limiting
    this.lastClickTime = 0;          // Timestamp of the last next-button click
    this.cooldownDuration = 1000;    // Cooldown rate limit window in milliseconds (1 second)
    this.isCooldownActive = false;   // Boolean tracking variable for log status

    // Infinite Loop Safeguards
    this.consecutiveSkips = 0;       // Track consecutive automatic skips
    this.maxConsecutiveSkips = 5;    // Stop skipping if 5 songs in a row are blocked (prevents dead loops)

    // Queue Scrubber references
    this.queueObserver = null;
    this.queueDebounceTimeout = null;
    this.queueCheckInterval = null;
    this.processedQueueItems = new WeakSet(); // Performance safeguard to prevent redundant DOM operations

    // Context Menu Temporary Storage
    this.lastRightClickedArtist = null; // Caches the right-clicked artist temporarily
    
    console.log('%c[YTM Block]%c Extension active. Phase 7 Resilient Link Parser is loaded.', 'color: #FF0033; font-weight: bold;', 'color: default;');
  }

  /**
   * Initializes the content script controller.
   */
  async init() {
    try {
      // 1. Fetch initial blocklist from persistent storage
      await this.getBlocklist();

      // 2. Set up real-time listener for storage changes
      this.setupStorageListener();

      // 3. Inject custom CSS styles for the blocked queue elements & dynamic toast alerts
      this.injectCustomStyles();

      // 4. Setup the DOM MutationObserver to detect track switches
      this.setupObserver();

      // 5. Set up message port listener to communicate with the popup & service worker
      this.setupMessageListener();

      // 6. Setup the secondary MutationObserver dedicated to the Up Next Queue
      this.setupQueueObserver();

      // 7. Bind capture-phase contextmenu listeners for right-click artist extraction
      this.setupRightClickListener();

      // 8. Bind capture-phase left-click listeners for three-dot menu button caching
      this.setupLeftClickListener();

    } catch (error) {
      console.error('[YTM Block] Initialization failed:', error);
    }
  }

  /**
   * Inject visual styling rules to handle blocked queue elements beautifully and floating toast notifications.
   */
  injectCustomStyles() {
    const styleId = 'ytm-block-custom-styles';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      .ytm-blocked-queue-item {
        opacity: 0.16 !important;
        pointer-events: none !important;
        text-decoration: line-through !important;
        transition: opacity 0.3s ease-in-out !important;
      }
      .ytm-blocked-queue-item::after {
        content: ' [Blocked]' !important;
        color: #FF1E46 !important;
        font-size: 9px !important;
        font-weight: bold !important;
        letter-spacing: 0.5px !important;
        text-transform: uppercase !important;
        margin-left: 6px !important;
        text-decoration: none !important;
        display: inline-block !important;
      }
      .ytm-toast-notification {
        position: fixed !important;
        top: 24px !important;
        left: 50% !important;
        transform: translateX(-50%) translateY(-20px) !important;
        background: rgba(13, 13, 20, 0.88) !important;
        backdrop-filter: blur(12px) !important;
        -webkit-backdrop-filter: blur(12px) !important;
        border: 1px solid rgba(255, 30, 70, 0.25) !important;
        color: #FFFFFF !important;
        padding: 10px 18px !important;
        border-radius: 30px !important;
        font-family: 'Inter', system-ui, -apple-system, sans-serif !important;
        font-size: 12px !important;
        font-weight: 600 !important;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6), 0 0 10px rgba(255, 30, 70, 0.1) !important;
        z-index: 9999999 !important;
        display: flex !important;
        align-items: center !important;
        gap: 8px !important;
        pointer-events: none !important;
        opacity: 0 !important;
        transition: all 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) !important;
      }
      .ytm-toast-notification.show {
        opacity: 1 !important;
        transform: translateX(-50%) translateY(0) !important;
      }
      .ytm-toast-icon {
        color: #FF1E46 !important;
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
      }
      .ytm-toast-artist {
        color: #FF5A79 !important;
        text-transform: capitalize !important;
      }
      .ytm-toast-action-btn {
        background: none !important;
        border: none !important;
        color: #FF5A79 !important;
        font-family: inherit !important;
        font-size: 10px !important;
        font-weight: 700 !important;
        text-transform: uppercase !important;
        letter-spacing: 0.5px !important;
        cursor: pointer !important;
        margin-left: 10px !important;
        padding: 3px 8px !important;
        border-radius: 10px !important;
        background: rgba(255, 30, 70, 0.12) !important;
        transition: all 0.2s ease !important;
        pointer-events: auto !important; /* Enable click events on button */
      }
      .ytm-toast-action-btn:hover {
        background: rgba(255, 30, 70, 0.22) !important;
        transform: scale(1.05) !important;
      }
      .ytm-toast-action-btn:active {
        transform: scale(0.95) !important;
      }
      .ytm-custom-menu-item {
        display: flex !important;
        align-items: center !important;
        padding: 0 24px 0 16px !important;
        cursor: pointer !important;
        background: transparent !important;
        transition: background-color 0.15s ease !important;
        user-select: none !important;
        height: 48px !important;
        box-sizing: border-box !important;
      }
      .ytm-custom-menu-item:hover {
        background-color: rgba(255, 255, 255, 0.08) !important;
      }
      .ytm-custom-menu-icon {
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        margin-right: 12px !important;
        width: 24px !important;
        height: 24px !important;
        color: #FF1E46 !important;
      }
      .ytm-custom-menu-text {
        font-family: Roboto, 'Noto Sans', sans-serif !important;
        font-size: 14px !important;
        font-weight: 400 !important;
        color: #E5E7EB !important;
        transition: color 0.15s ease !important;
      }
      .ytm-custom-menu-item:hover .ytm-custom-menu-text {
        color: #FF1E46 !important;
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * Safely checks if the extension context is still valid.
   * If the context is invalidated (extension updated/reloaded), cleanly tears down observers.
   * @returns {boolean} True if context is active and valid.
   */
  isContextValid() {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id) {
      this.disconnectAllObservers();
      return false;
    }
    return true;
  }

  /**
   * Cleanly disconnects all active DOM MutationObservers and clears timers
   * to protect browser memory and prevent console error spam if reloaded.
   */
  disconnectAllObservers() {
    console.warn('[YTM Block] Extension context invalidated (extension reloaded/updated). Disconnecting observers. Please refresh the page to reactivate.');
    try {
      if (this.observer) {
        this.observer.disconnect();
        this.observer = null;
      }
      if (this.queueObserver) {
        this.queueObserver.disconnect();
        this.queueObserver = null;
      }
      if (this.debounceTimeout) {
        clearTimeout(this.debounceTimeout);
        this.debounceTimeout = null;
      }
      if (this.queueDebounceTimeout) {
        clearTimeout(this.queueDebounceTimeout);
        this.queueDebounceTimeout = null;
      }
      if (this.queueCheckInterval) {
        clearInterval(this.queueCheckInterval);
        this.queueCheckInterval = null;
      }
    } catch (e) {
      // Catch silently during invalidation tear-down
    }
  }

  /**
   * Asynchronously retrieves the latest blocklist from chrome.storage.sync.
   * @returns {Promise<Array>} List of lowercased, trimmed blocked artist names.
   */
  async getBlocklist() {
    return new Promise((resolve) => {
      if (!this.isContextValid()) {
        resolve([]);
        return;
      }

      try {
        chrome.storage.sync.get({ blockedArtists: [] }, (result) => {
          if (!this.isContextValid()) {
            resolve([]);
            return;
          }
          this.blockedArtists = result.blockedArtists || [];
          resolve(this.blockedArtists);
        });
      } catch (error) {
        this.disconnectAllObservers();
        resolve([]);
      }
    });
  }

  /**
   * Synchronizes storage changes instantly when the blocklist is altered.
   */
  setupStorageListener() {
    if (!this.isContextValid()) return;

    try {
      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (!this.isContextValid()) return;

        if (areaName === 'sync' && changes.blockedArtists) {
          this.blockedArtists = changes.blockedArtists.newValue || [];
          console.log(
            `%c[YTM Block]%c Blocklist updated. Re-scrubbing queue...`,
            'color: #FF0033; font-weight: bold;', 'color: default;'
          );
          
          // Force the queue scrubber to re-evaluate the entire list
          this.resetQueueScrubbingMarkers();

          // Re-evaluate the current track immediately
          this.handleTrackChange();
        }
      });
    } catch (error) {
      this.disconnectAllObservers();
    }
  }

  /**
   * Renders a highly-polished glass capsule floating notification inside the page body.
   * @param {string} artist - Normalized artist name.
   * @param {string} status - Dynamic status state ('blocked', 'already_blocked', 'failed').
   */
  showToastNotification(artist, status) {
    // 1. Wipe existing toast elements to prevent multiple stacked overlays
    const existing = document.getElementById('ytm-toast-alert');
    if (existing) existing.remove();

    // 2. Create the wrapper element
    const toast = document.createElement('div');
    toast.id = 'ytm-toast-alert';
    toast.className = 'ytm-toast-notification';

    // Capitalize artist word sequences for presentation
    const displayArtist = artist
      ? artist.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
      : '';

    // Config custom HTML layout based on status states
    if (status === 'blocked') {
      toast.style.borderColor = 'rgba(255, 30, 70, 0.25)';
      toast.innerHTML = `
        <span class="ytm-toast-icon">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line>
          </svg>
        </span>
        <span>Blocked artist: <span class="ytm-toast-artist">${displayArtist}</span></span>
      `;
    } else if (status === 'already_blocked') {
      toast.style.borderColor = 'rgba(239, 68, 68, 0.25)';
      toast.innerHTML = `
        <span class="ytm-toast-icon" style="color: #EAB308;">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
            <line x1="12" y1="9" x2="12" y2="13"></line>
            <line x1="12" y1="17" x2="12.01" y2="17"></line>
          </svg>
        </span>
        <span><span class="ytm-toast-artist">${displayArtist}</span> is already blocked</span>
      `;

      // Append unblock button
      const unblockBtn = document.createElement('button');
      unblockBtn.className = 'ytm-toast-action-btn';
      unblockBtn.textContent = 'Unblock';
      unblockBtn.addEventListener('click', () => {
        this.removeArtistFromBlocklist(artist);
        toast.remove();
      });
      toast.appendChild(unblockBtn);
    } else {
      // Failed to detect artist state
      toast.style.borderColor = 'rgba(239, 68, 68, 0.25)';
      toast.innerHTML = `
        <span class="ytm-toast-icon" style="color: #EF4444;">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
        </span>
        <span style="color: #E5E7EB;">Could not detect artist name</span>
      `;
    }

    document.body.appendChild(toast);

    // 3. Trigger transition after micro-insertion timeout
    setTimeout(() => {
      toast.classList.add('show');
    }, 20);

    // 4. Clean up transitions and remove node (longer duration if unblock action is present)
    const displayDuration = status === 'already_blocked' ? 4000 : 2500;
    setTimeout(() => {
      if (document.body.contains(toast)) {
        toast.classList.remove('show');
        setTimeout(() => {
          if (document.body.contains(toast)) toast.remove();
        }, 350);
      }
    }, displayDuration);
  }

  /**
   * Dynamically removes an artist from persistent sync storage.
   * @param {string} artist - Raw artist name string.
   */
  removeArtistFromBlocklist(artist) {
    if (!this.isContextValid()) return;

    const normalized = artist.trim().toLowerCase();
    try {
      chrome.storage.sync.get({ blockedArtists: [] }, (result) => {
        if (!this.isContextValid()) return;

        let list = result.blockedArtists || [];
        list = list.filter(x => x !== normalized);
        chrome.storage.sync.set({ blockedArtists: list }, () => {
          if (!this.isContextValid()) return;
          console.log(`%c[YTM Block]%c Unblocked: "${artist}" via toast shortcut.`, 'color: #10B981; font-weight: bold;', 'color: default;');
        });
      });
    } catch (error) {
      this.disconnectAllObservers();
    }
  }

  /**
   * Sets up a message listener to respond to real-time track metadata inquiries from the popup or background.
   */
  setupMessageListener() {
    if (!this.isContextValid()) return;

    try {
      chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (!this.isContextValid()) return;

        if (request.action === 'getCurrentTrack') {
          const artistData = this.getCurrentArtist();
          const title = this.getCurrentSongTitle();
          const isPlaying = this.isPlaybackActive();
          
          sendResponse({
            artist: artistData.artist,
            title: title,
            isPlaying: isPlaying,
            rightClickedArtist: this.lastRightClickedArtist ? this.lastRightClickedArtist.artist : null
          });
        } else if (request.action === 'showToast') {
          this.showToastNotification(request.artist, request.status);
        }
        return true; // Keep message channel open for asynchronous responses
      });
    } catch (error) {
      this.disconnectAllObservers();
    }
  }

  /**
   * Sets up a MutationObserver targeting the root 'ytmusic-app' element.
   * Uses a robust debounce window to let DOM updates settle before track parsing.
   */
  setupObserver() {
    const target = document.querySelector('ytmusic-app');
    if (!target) {
      setTimeout(() => this.setupObserver(), 1000);
      return;
    }

    this.observer = new MutationObserver(() => {
      // --- ROBUST DYNAMIC POPUP MENU DETECTOR ---
      if (this.isContextValid()) {
        const popup = document.querySelector('ytmusic-menu-popup-renderer');
        if (popup) {
          this.injectCustomMenuItem();
        }
      }

      if (this.debounceTimeout) {
        clearTimeout(this.debounceTimeout);
      }
      this.debounceTimeout = setTimeout(() => {
        this.handleTrackChange();
      }, 300);
    });

    this.observer.observe(target, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  /**
   * SECONDARY OBSERVER: Sets up a dedicated MutationObserver on the queue list.
   * Runs lightweight polling initially to bind once the queue element is attached.
   */
  setupQueueObserver() {
    const queue = document.querySelector('ytmusic-player-queue');
    if (!queue) {
      if (this.queueCheckInterval) clearInterval(this.queueCheckInterval);
      this.queueCheckInterval = setInterval(() => {
        const activeQueue = document.querySelector('ytmusic-player-queue');
        if (activeQueue) {
          clearInterval(this.queueCheckInterval);
          this.bindQueueObserver(activeQueue);
        }
      }, 2000);
      return;
    }

    this.bindQueueObserver(queue);
  }

  /**
   * Binds MutationObserver onto active queue element.
   * @param {HTMLElement} queueElement 
   */
  bindQueueObserver(queueElement) {
    this.queueObserver = new MutationObserver(() => {
      if (this.queueDebounceTimeout) {
        clearTimeout(this.queueDebounceTimeout);
      }
      this.queueDebounceTimeout = setTimeout(() => {
        this.scrubQueue();
      }, 400);
    });

    this.queueObserver.observe(queueElement, {
      childList: true,
      subtree: true
    });

    this.scrubQueue();
  }

  /**
   * Scans all player queue items inside the player page,
   * matches them against the blocklist, and dims blocked entries.
   * Optimized with dual-layer performance guards to eliminate redundant processing.
   */
  scrubQueue() {
    const items = document.querySelectorAll('ytmusic-player-queue-item');
    if (items.length === 0) return;

    let processedCount = 0;
    let blockedCount = 0;

    items.forEach((item) => {
      if (this.processedQueueItems.has(item) && item.dataset.ytmProcessed === 'true') {
        return;
      }

      this.processedQueueItems.add(item);
      item.dataset.ytmProcessed = 'true';
      processedCount++;

      const artist = this.getQueueItemArtist(item);
      if (!artist) return;

      const matchResult = this.shouldSkipArtist(artist);
      if (matchResult.shouldSkip) {
        item.classList.add('ytm-blocked-queue-item');
        blockedCount++;
      }
    });

    if (processedCount > 0 || blockedCount > 0) {
      console.log(`[YTM Block Scrubber] Processed ${processedCount} items. Marked ${blockedCount} blocked track(s).`);
    }
  }

  /**
   * Extracts the artist name from a queue item element using structural links.
   * @param {HTMLElement} item - Single queue list item element.
   * @returns {string} Trimmed artist name.
   */
  getQueueItemArtist(item) {
    // Upgraded: Scan all links to locate browse links (excluding playlist/album links)
    const anchors = item.querySelectorAll('a');
    for (const link of anchors) {
      const href = link.getAttribute('href') || '';
      const text = link.textContent.trim();
      
      if (href.includes('/browse/') && 
          !href.includes('/browse/VL') && 
          !href.includes('/browse/MPRE') && 
          !href.includes('/watch?v=') && 
          text) {
        return text;
      }
    }

    // Fallback: Parse secondary split-by-bullet byline classes
    const bylineEl = item.querySelector('.byline') || item.querySelector('[class*="byline"]');
    if (bylineEl && bylineEl.textContent) {
      const text = bylineEl.textContent.trim();
      if (text) {
        const parts = text.split(/[•·]/);
        if (parts[0] && parts[0].trim()) {
          return parts[0].trim();
        }
      }
    }

    const secondary = item.querySelector('.secondary-title') || item.querySelector('.secondary');
    if (secondary && secondary.textContent && secondary.textContent.trim()) {
      return secondary.textContent.trim();
    }

    return '';
  }

  /**
   * Resets all processed cache markers on queue elements.
   * Used to force-scrub the entire queue when the blocklist is updated.
   */
  resetQueueScrubbingMarkers() {
    this.processedQueueItems = new WeakSet();
    const items = document.querySelectorAll('ytmusic-player-queue-item');
    items.forEach((item) => {
      item.removeAttribute('data-ytm-processed');
      item.classList.remove('ytm-blocked-queue-item');
    });

    this.scrubQueue();
  }

  // --- RIGHT-CLICK CONTEXT EXTRACTION SYSTEM ---

  /**
   * Sets up a capture-phase right-click event listener to resolve the targeted artist name.
   */
  setupRightClickListener() {
    document.addEventListener('contextmenu', (event) => {
      this.handleRightClick(event);
    }, true); // Binds to capture phase to intercept context menu before propagation halts
  }

  /**
   * Sets up a capture-phase left-click event listener to cache targeted artist names 
   * when the user clicks a three-dot button or a similar custom menu launcher.
   */
  setupLeftClickListener() {
    document.addEventListener('click', (event) => {
      const clicked = event.target;
      if (!clicked) return;

      const menuButton = clicked.closest('ytmusic-menu-renderer') || 
                         clicked.closest('.menu-button') || 
                         clicked.closest('#button') ||
                         clicked.closest('.ytmusic-menu-renderer');
      if (menuButton) {
        console.log('%c[YTM Block]%c 🖱️ Left-click on menu button resolved! Crawling context...', 'color: #FF0033; font-weight: bold;', 'color: default;');
        const extracted = this.extractArtistFromContext(menuButton);
        if (extracted && extracted.artist) {
          const normalized = this.normalizeArtist(extracted.artist);
          this.lastRightClickedArtist = {
            artist: extracted.artist,
            normalized: normalized,
            title: extracted.title || '',
            timestamp: Date.now()
          };
          console.log(`%c[YTM Block]%c Cached artist from menu launcher click: %c"${extracted.artist}"`, 'color: #10B981; font-weight: bold;', 'color: default;', 'color: #FF1E46; font-weight: bold;');
        } else {
          console.log('%c[YTM Block]%c Could not extract artist context from click.', 'color: #EF4444; font-weight: bold;', 'color: default;');
        }
      }
    }, true);
  }

  /**
   * Instantly injects a custom crimson "Block Artist" menu item into 
   * YouTube Music's custom DOM context menu overlay.
   */
  injectCustomMenuItem() {
    const menuList = document.querySelector('ytmusic-menu-popup-renderer #items') || 
                     document.querySelector('#items.ytmusic-menu-popup-renderer');
    if (!menuList) return;

    // Check if already injected to avoid duplicate items
    if (menuList.querySelector('[data-ytm-block-injected="true"]')) return;

    // Create standard HTML item with custom classes (bypasses shadow DOM and Polymer binding limits)
    const newItem = document.createElement('div');
    newItem.className = 'ytm-custom-menu-item';
    newItem.setAttribute('data-ytm-block-injected', 'true');
    newItem.setAttribute('role', 'menuitem');

    newItem.innerHTML = `
      <span class="ytm-custom-menu-icon">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FF1E46" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="9"></circle>
          <line x1="5.64" y1="5.64" x2="18.36" y2="18.36"></line>
        </svg>
      </span>
      <span class="ytm-custom-menu-text">Block Artist with YTM Block</span>
    `;

    // Define a unified event handler to intercept before YTM closes on mousedown/click
    let actionTriggered = false;
    const handleAction = (e) => {
      e.preventDefault();
      e.stopPropagation();

      // Avoid double-execution if both mousedown and click fire in the same user interaction
      if (actionTriggered) return;
      actionTriggered = true;
      setTimeout(() => { actionTriggered = false; }, 500);

      console.log(`%c[YTM Block] Crimson custom menu item event (${e.type}) triggered!`, 'color: #FF1E46; font-weight: bold;');

      const artistToBlock = this.lastRightClickedArtist ? this.lastRightClickedArtist.artist : null;
      console.log(`%c[YTM Block]%c Block action triggered. Cached artist: %c"${artistToBlock || 'None'}"`, 'color: #FF1E46; font-weight: bold;', 'color: default;', 'color: #FF1E46; font-weight: bold;');

      if (artistToBlock) {
        this.addArtistToBlocklistFromInline(artistToBlock);
      } else {
        // Fallback to currently playing artist
        const activeArtist = this.getCurrentArtist().artist;
        console.log(`%c[YTM Block]%c Fallback to active playing artist: %c"${activeArtist || 'None'}"`, 'color: #38BDF8; font-weight: bold;', 'color: default;', 'color: #38BDF8; font-weight: bold;');
        if (activeArtist) {
          this.addArtistToBlocklistFromInline(activeArtist);
        } else {
          console.warn('[YTM Block] Block failed: No artist could be extracted from either context or active track.');
          this.showToastNotification('', 'failed');
        }
      }

      // Close YouTube Music's overlay menu naturally (non-destructively)
      const dismisser = document.querySelector('iron-overlay-backdrop');
      if (dismisser) {
        dismisser.click();
      } else {
        document.body.click();
      }
    };

    // Bind to both mousedown and click in the capture phase to guarantee interception before YTM closes the menu
    newItem.addEventListener('mousedown', handleAction, true);
    newItem.addEventListener('click', handleAction, true);

    // Append to the end of the menu list
    menuList.appendChild(newItem);
    console.log('[YTM Block] Successfully injected custom HTML "Block Artist" option into YTM dropdown.');
  }

  /**
   * Adds an artist to persistent blocklist directly from inline actions.
   * @param {string} artistName - Raw artist name.
   */
  addArtistToBlocklistFromInline(artistName) {
    console.log(`%c[YTM Block]%c Direct blocking storage query started for: "${artistName}"`, 'color: #10B981; font-weight: bold;', 'color: default;');
    if (!this.isContextValid()) {
      console.error('[YTM Block] Storage write halted: Context is invalid (please refresh the page).');
      return;
    }

    const normalizedArtist = artistName.trim().toLowerCase();
    if (!normalizedArtist) return;

    try {
      chrome.storage.sync.get({ blockedArtists: [] }, (result) => {
        if (!this.isContextValid()) return;

        const list = result.blockedArtists || [];
        if (list.includes(normalizedArtist)) {
          console.log(`%c[YTM Block]%c Artist "${artistName}" is already blocked. Spawning warning toast.`, 'color: #EAB308; font-weight: bold;', 'color: default;');
          this.showToastNotification(artistName, 'already_blocked');
          return;
        }

        list.push(normalizedArtist);
        list.sort();

        chrome.storage.sync.set({ blockedArtists: list }, () => {
          if (!this.isContextValid()) return;
          console.log(`%c[YTM Block]%c Direct block success! Persistent storage updated for: "${artistName}"`, 'color: #10B981; font-weight: bold;', 'color: default;');
          this.showToastNotification(artistName, 'blocked');
        });
      });
    } catch (error) {
      console.error('[YTM Block] Direct blocking failed with exception:', error);
      this.disconnectAllObservers();
    }
  }

  /**
   * Handles right click event by pulling the click target and routing to the parser.
   * @param {MouseEvent} event - Native contextmenu event.
   */
  handleRightClick(event) {
    const clickedElement = event.target;
    if (!clickedElement) return;

    const extracted = this.extractArtistFromContext(clickedElement);
    
    if (extracted && extracted.artist) {
      const normalized = this.normalizeArtist(extracted.artist);
      this.lastRightClickedArtist = {
        artist: extracted.artist,
        normalized: normalized,
        title: extracted.title || '',
        timestamp: Date.now()
      };

      console.log('%c[YTM Block] 🖱️ Right-click detected artist!', 'color: #10B981; font-weight: bold;');
      console.log(`%cArtist:    %c"${extracted.artist}"`, 'font-weight: bold; color: #FFFFFF;', 'color: #FF1E46;');
      console.log(`%cSong:      %c"${extracted.title || 'None'}"`, 'font-weight: bold; color: #FFFFFF;', 'color: #38BDF8;');
      console.log(`%cSelector:  %c"${extracted.selector}"`, 'font-weight: bold; color: #FFFFFF;', 'color: #A1A1AA;');
    } else {
      // Clear cache on empty backgrounds to allow standard player bar fallback
      this.lastRightClickedArtist = null;
    }
  }

  /**
   * Traverses upwards from the clicked element utilizing closest() boundaries
   * to resolve the targeted artist across search, playlists, tracks, albums, queues, or pages.
   * @param {HTMLElement} el - Right clicked DOM element.
   * @returns {Object|null} { artist, title, selector }
   */
  extractArtistFromContext(el) {
    if (!el) return null;

    // --- CASE 1: Direct link hover (direct artist link or text anchor) ---
    const link = el.closest('a');
    if (link) {
      const href = link.getAttribute('href') || '';
      const text = link.textContent.trim();
      if (href.includes('/browse/') && !href.includes('/browse/VL') && text) {
        return {
          artist: text,
          title: '',
          selector: 'Direct Artist Link (closest a)'
        };
      }
    }

    // --- CASE 2: Inside a Playlist or Search Row (Responsive List Item) ---
    const responsiveItem = el.closest('ytmusic-responsive-list-item-renderer');
    if (responsiveItem) {
      const artist = this.getResponsiveItemArtist(responsiveItem);
      const title = this.getResponsiveItemTitle(responsiveItem);
      if (artist) {
        return {
          artist,
          title,
          selector: 'ytmusic-responsive-list-item-renderer (closest)'
        };
      }
    }

    // --- CASE 3: Inside the Player Bar ---
    const playerBar = el.closest('ytmusic-player-bar');
    if (playerBar) {
      const artistData = this.getCurrentArtist();
      const title = this.getCurrentSongTitle();
      return {
        artist: artistData.artist,
        title: title,
        selector: `ytmusic-player-bar (getCurrentArtist)`
      };
    }

    // --- CASE 4: Inside a Queue Item ---
    const queueItem = el.closest('ytmusic-player-queue-item');
    if (queueItem) {
      const artist = this.getQueueItemArtist(queueItem);
      const titleEl = queueItem.querySelector('.title') || queueItem.querySelector('.song-title');
      const title = titleEl ? titleEl.textContent.trim() : '';
      if (artist) {
        return {
          artist,
          title,
          selector: 'ytmusic-player-queue-item (closest)'
        };
      }
    }

    // --- CASE 5: Inside an Album page or Shelf card ---
    const card = el.closest('ytmusic-card-shelf-renderer') || el.closest('ytmusic-grid-single-column-item-renderer');
    if (card) {
      const artistLink = card.querySelector('a[href*="/browse/UC"]') || card.querySelector('.subtitle a') || card.querySelector('.secondary a');
      if (artistLink && artistLink.textContent.trim()) {
        return {
          artist: artistLink.textContent.trim(),
          title: '',
          selector: 'Card/Shelf Artist link extraction'
        };
      }
    }

    // --- CASE 6: Generic list item or container fallback ---
    const container = el.closest('.responsive-list-item') || el.closest('.song-table-row') || el.closest('tr');
    if (container) {
      const artist = this.getQueueItemArtist(container);
      if (artist) {
        return {
          artist,
          title: '',
          selector: 'Generic table-row container'
        };
      }
    }

    return null;
  }

  /**
   * Upgraded artist parser: extracts explicit browse channel links inside dynamic list items.
   */
  getResponsiveItemArtist(item) {
    // Target all anchors inside this list row item
    const anchors = item.querySelectorAll('a');
    for (const link of anchors) {
      const href = link.getAttribute('href') || '';
      const text = link.textContent.trim();
      
      // An artist browse link points to /browse/ and is NOT a playlist (VL), release (MPRE), or track watch link
      if (href.includes('/browse/') && 
          !href.includes('/browse/VL') && 
          !href.includes('/browse/MPRE') && 
          !href.includes('/watch?v=') && 
          text) {
        return text;
      }
    }

    // Fallback: Parse secondary/subtitle columns split by bullets
    const subtitleEl = item.querySelector('.subtitle') || item.querySelector('.secondary-flex-columns');
    if (subtitleEl && subtitleEl.textContent) {
      const text = subtitleEl.textContent.trim();
      const parts = text.split(/[•·]/);
      if (parts[0] && parts[0].trim()) {
        return parts[0].trim();
      }
    }

    return '';
  }

  /**
   * Helper to parse song titles inside dynamic responsive list item rows.
   */
  getResponsiveItemTitle(item) {
    const titleEl = item.querySelector('.title') || 
                    item.querySelector('.title-column') || 
                    item.querySelector('a[class*="title"]');
    if (titleEl && titleEl.textContent) {
      return titleEl.textContent.trim();
    }
    return '';
  }

  /**
   * Sanitizes and normalizes artist name values.
   */
  normalizeArtist(name) {
    if (!name) return '';
    return name.trim().toLowerCase();
  }

  // --- CORE PLAYER EXTRACTION METHODS ---

  /**
   * Extracts the current song title from the DOM or browser media metadata.
   * @returns {string} Trimmed song title.
   */
  getCurrentSongTitle() {
    if (navigator.mediaSession && navigator.mediaSession.metadata && navigator.mediaSession.metadata.title) {
      const title = navigator.mediaSession.metadata.title.trim();
      if (title) return title;
    }

    const titleEl = document.querySelector('ytmusic-player-bar .title');
    if (titleEl && titleEl.textContent) {
      const title = titleEl.textContent.trim();
      if (title) return title;
    }

    const altTitleEl = document.querySelector('.song-title');
    if (altTitleEl && altTitleEl.textContent) {
      const title = altTitleEl.textContent.trim();
      if (title) return title;
    }

    return '';
  }

  /**
   * Extracts the current artist name using multiple layered selectors 
   * to guarantee compatibility across both standard songs and video uploads.
   * @returns {Object} { artist: string, selector: string }
   */
  getCurrentArtist() {
    if (navigator.mediaSession && navigator.mediaSession.metadata && navigator.mediaSession.metadata.artist) {
      const artist = navigator.mediaSession.metadata.artist.trim();
      if (artist) {
        return {
          artist,
          selector: 'navigator.mediaSession.metadata.artist'
        };
      }
    }

    const anchorEl = document.querySelector('ytmusic-player-bar .byline a');
    if (anchorEl && anchorEl.textContent && anchorEl.textContent.trim()) {
      return {
        artist: anchorEl.textContent.trim(),
        selector: 'ytmusic-player-bar .byline a'
      };
    }

    const generalAnchor = document.querySelector('.byline a');
    if (generalAnchor && generalAnchor.textContent && generalAnchor.textContent.trim()) {
      return {
        artist: generalAnchor.textContent.trim(),
        selector: '.byline a'
      };
    }

    const bylineEl = document.querySelector('ytmusic-player-bar .byline');
    if (bylineEl && bylineEl.textContent) {
      const text = bylineEl.textContent.trim();
      if (text) {
        const parts = text.split(/[•·]/);
        if (parts[0] && parts[0].trim()) {
          return {
            artist: parts[0].trim(),
            selector: 'ytmusic-player-bar .byline (parsed first segment)'
          };
        }
      }
    }

    const genBylineEl = document.querySelector('.byline');
    if (genBylineEl && genBylineEl.textContent) {
      const text = genBylineEl.textContent.trim();
      if (text) {
        const parts = text.split(/[•·]/);
        if (parts[0] && parts[0].trim()) {
          return {
            artist: parts[0].trim(),
            selector: '.byline (parsed first segment)'
          };
        }
      }
    }

    return {
      artist: '',
      selector: 'none'
    };
  }

  /**
   * Evaluates if the playing artist matches any blocked artist.
   * Supports case-insensitive and partial matching.
   * @param {string} artist - Raw artist string from the active player.
   * @returns {Object} { shouldSkip: boolean, matchedTerm: string|null }
   */
  shouldSkipArtist(artist) {
    if (!artist || this.blockedArtists.length === 0) {
      return { shouldSkip: false, matchedTerm: null };
    }

    const currentLower = artist.toLowerCase().trim();
    
    const match = this.blockedArtists.find(blocked => currentLower.includes(blocked));
    
    if (match) {
      return {
        shouldSkip: true,
        matchedTerm: match
      };
    }

    return {
      shouldSkip: false,
      matchedTerm: null
    };
  }

  /**
   * Verifies if audio or video playback is actively running on the tab.
   * Uses both browser Session APIs and direct DOM inspection for reliability.
   * @returns {boolean} True if player is active and playing.
   */
  isPlaybackActive() {
    if (navigator.mediaSession && navigator.mediaSession.playbackState) {
      if (navigator.mediaSession.playbackState === 'playing') return true;
      if (navigator.mediaSession.playbackState === 'paused') return false;
    }

    const playPauseBtn = document.querySelector('ytmusic-player-bar #play-pause-button') || 
                         document.querySelector('#play-pause-button');
    if (playPauseBtn) {
      const title = playPauseBtn.getAttribute('title') || '';
      const ariaLabel = playPauseBtn.getAttribute('aria-label') || '';
      if (title.toLowerCase().includes('pause') || ariaLabel.toLowerCase().includes('pause')) {
        return true;
      }
    }

    const mediaElements = document.querySelectorAll('audio, video');
    for (const media of mediaElements) {
      if (!media.paused && !media.ended && media.currentTime > 0) {
        return true;
      }
    }

    return false;
  }

  /**
   * Called when track change triggers. Resolves artist/title metadata,
   * performs strict duplicate prevention, logs debugs, and runs blocklist checks.
   */
  async handleTrackChange() {
    await this.getBlocklist();

    const artistData = this.getCurrentArtist();
    const artist = artistData.artist;
    const selectorUsed = artistData.selector;

    const title = this.getCurrentSongTitle();

    if (!title && !artist) {
      return;
    }

    if (title === this.lastTrackInfo.title && artist === this.lastTrackInfo.artist) {
      return;
    }

    this.lastTrackInfo = {
      title,
      artist
    };

    console.log('%c[YTM Block] 🎵 Track Changed!', 'color: #38BDF8; font-weight: bold;');
    console.log(`%cSong:   %c"${title}"`, 'font-weight: bold; color: #FFFFFF;', 'color: #38BDF8;');
    console.log(`%cArtist: %c"${artist || 'Unknown'}"`, 'font-weight: bold; color: #FFFFFF;', 'color: #F43F5E;');
    console.log(`%cSource: %c"${selectorUsed}"`, 'font-weight: bold; color: #FFFFFF;', 'color: #A1A1AA;');

    const matchResult = this.shouldSkipArtist(artist);
    console.log(`[YTM Block] Match result: shouldSkip=${matchResult.shouldSkip}, matchedTerm="${matchResult.matchedTerm || 'none'}"`);

    if (matchResult.shouldSkip) {
      console.log(
        `%c[YTM Block] 🚫 BLOCKED ARTIST DETECTED: "${artist}" (matches: "${matchResult.matchedTerm}")`, 
        'color: #FFFFFF; font-weight: bold; background-color: #EF4444; padding: 4px 8px; border-radius: 4px;'
      );
      
      this.skipTrack();
    } else {
      this.consecutiveSkips = 0;
    }
  }

  /**
   * Programmatically triggers the YouTube Music next-track action.
   * Includes structural safety guards to prevent loop spams, empty queues, and pauses.
   */
  skipTrack() {
    const title = this.lastTrackInfo.title;
    const artist = this.lastTrackInfo.artist;

    const active = this.isPlaybackActive();
    if (!active) {
      console.log('%c[YTM Block] ⏸️ Playback is paused/inactive. Skip suppressed.', 'color: #EAB308;');
      return;
    }

    const now = Date.now();
    if (now - this.lastClickTime < this.cooldownDuration) {
      this.isCooldownActive = true;
      console.log('%c[YTM Block] ⏳ Cooldown active (rate limit 1s). Next click suppressed.', 'color: #F59E0B;');
      return;
    }
    this.isCooldownActive = false;

    if (title === this.lastSkippedTrack.title && artist === this.lastSkippedTrack.artist) {
      console.log('%c[YTM Block] ⚠️ Skip already attempted for this track. Suppressing spam click.', 'color: #EF4444;');
      return;
    }

    if (this.consecutiveSkips >= this.maxConsecutiveSkips) {
      console.log('%c[YTM Block] 🚨 Loop Prevention: Max consecutive skips (5) reached. Skip locked for 8s.', 'color: #EF4444; font-weight: bold;');
      this.isCooldownActive = true;
      
      setTimeout(() => {
        this.isCooldownActive = false;
        this.consecutiveSkips = 0;
        console.log('[YTM Block] Loop protection reset. Ready.');
      }, 8000);
      
      return;
    }

    const nextBtn = document.querySelector('ytmusic-player-bar .next-button') || 
                    document.querySelector('.next-button') || 
                    document.querySelector('#next-button');

    if (!nextBtn) {
      console.error('[YTM Block] Error: Next button not found in DOM.');
      return;
    }

    console.log(`%c[YTM Block] ⏩ TRIGGERING AUTO-SKIP: Skipping "${title}" by "${artist}"...`, 'color: #10B981; font-weight: bold;');
    
    this.lastClickTime = now;
    this.lastSkippedTrack = { title, artist };
    this.consecutiveSkips++;

    nextBtn.click();
    
    console.log('%c[YTM Block] next-button clicked successfully.', 'color: #10B981;');
  }
}

// Instantiate and initialize the controller
const ytmBlockController = new YTMBlockController();
ytmBlockController.init();
