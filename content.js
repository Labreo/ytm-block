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
    // Local memory caches of blocked items to ensure instant lookups
    this.blockedArtists = [];
    this.blockedSongs = [];
    this.blockedAlbums = [];
    
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

    // Recommendation Filter references
    this.recObserver = null;
    this.recDebounceTimeout = null;

    // Context Menu Temporary Storage
    this.lastRightClickedContext = null; // Caches the right-clicked music entity context temporarily
    
    // Hardening Guards
    this.initialized = false;
    this.debugMode = true; // Telemetry toggle
    this.observerLifecycle = {
      track: false,
      queue: false,
      rec: false
    };

    this.log('info', 'Extension active. Resilient async hardening engine loaded.');
  }

  /**
   * Structured logging utility that prints telemetry logs if debugMode is active.
   * @param {string} level - 'info' | 'warn' | 'error' | 'debug'
   * @param {string} message - Logging message.
   * @param {any[]} args - Optional metadata or data variables.
   */
  log(level, message, ...args) {
    if (!this.debugMode && level === 'debug') return;
    
    const prefix = `%c[YTM Block Debug]%c`;
    const style1 = level === 'error' ? 'color: #EF4444; font-weight: bold;' : 
                   level === 'warn' ? 'color: #F59E0B; font-weight: bold;' :
                   level === 'info' ? 'color: #10B981; font-weight: bold;' : 
                   'color: #8B5CF6; font-weight: bold;';
    const style2 = 'color: default;';

    if (level === 'error') {
      console.error(`${prefix} ${message}`, style1, style2, ...args);
    } else if (level === 'warn') {
      console.warn(`${prefix} ${message}`, style1, style2, ...args);
    } else {
      console.log(`${prefix} ${message}`, style1, style2, ...args);
    }
  }

  /**
   * Initializes the content script controller.
   */
  async init() {
    this.log('debug', 'Controller initialization sequence started.');
    try {
      // 1. Fetch initial blocklist from persistent storage
      await this.getBlocklist();
      this.log('debug', 'Initial blocklists loaded:', {
        artists: this.blockedArtists,
        songs: this.blockedSongs,
        albums: this.blockedAlbums
      });

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

      // 9. Bind capture-phase click listener to block playing items from the queue manually
      this.setupQueueClickListener();

      // 10. Setup the dedicated MutationObserver for home feed and recommendations
      this.setupRecObserver();

      // 11. Bind history and frame events to handle SPA navigation layout updates
      this.setupNavigationListener();

      this.initialized = true;
      this.log('info', 'Controller initialization completed successfully.');
    } catch (error) {
      this.log('error', 'Initialization sequence failed:', error);
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
        position: relative !important;
        opacity: 0.35 !important;
        border-left: 3px solid #FF1E46 !important;
        transition: all 0.3s ease-in-out !important;
      }
      .ytm-blocked-queue-item:hover {
        opacity: 0.6 !important;
      }
      .ytm-blocked-queue-item::after {
        content: 'BLOCKED' !important;
        position: absolute !important;
        right: 48px !important;
        top: 50% !important;
        transform: translateY(-50%) !important;
        color: #FFFFFF !important;
        background-color: #FF1E46 !important;
        font-size: 8px !important;
        font-weight: 800 !important;
        padding: 2px 6px !important;
        border-radius: 4px !important;
        letter-spacing: 0.5px !important;
        pointer-events: none !important;
        z-index: 10 !important;
      }
      .ytm-queue-stats-badge {
        display: none !important;
        font-family: Roboto, 'Noto Sans', sans-serif !important;
        font-size: 11px !important;
        font-weight: 700 !important;
        color: #FF1E46 !important;
        background-color: rgba(255, 30, 70, 0.08) !important;
        border: 1px solid rgba(255, 30, 70, 0.15) !important;
        padding: 4px 10px !important;
        border-radius: 12px !important;
        margin: 8px 16px !important;
        width: fit-content !important;
        text-transform: uppercase !important;
        letter-spacing: 0.5px !important;
        animation: fadeIn 0.3s ease-in-out !important;
      }
      .ytm-queue-stats-badge.show {
        display: inline-block !important;
      }
      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      .ytm-blocked-rec-card {
        position: relative !important;
        pointer-events: none !important;
        user-select: none !important;
      }
      .ytm-blocked-rec-card > * {
        filter: blur(12px) !important;
        opacity: 0.15 !important;
      }
      .ytm-blocked-rec-overlay {
        position: absolute !important;
        top: 0 !important;
        left: 0 !important;
        width: 100% !important;
        height: 100% !important;
        display: flex !important;
        flex-direction: column !important;
        align-items: center !important;
        justify-content: center !important;
        color: #FF5A79 !important;
        font-family: 'Inter', system-ui, -apple-system, sans-serif !important;
        font-size: 10px !important;
        font-weight: 700 !important;
        text-transform: uppercase !important;
        letter-spacing: 0.5px !important;
        z-index: 100 !important;
        pointer-events: none !important;
      }
      .ytm-blocked-rec-overlay-text {
        background-color: rgba(255, 30, 70, 0.12) !important;
        border: 1px solid rgba(255, 30, 70, 0.25) !important;
        padding: 4px 8px !important;
        border-radius: 8px !important;
        text-align: center !important;
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
    this.log('warn', 'Extension context invalidated. Tearing down active observers...');
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
      if (this.recObserver) {
        this.recObserver.disconnect();
        this.recObserver = null;
      }
      if (this.recDebounceTimeout) {
        clearTimeout(this.recDebounceTimeout);
        this.recDebounceTimeout = null;
      }
      if (this.queueCheckInterval) {
        clearInterval(this.queueCheckInterval);
        this.queueCheckInterval = null;
      }
      this.observerLifecycle.track = false;
      this.observerLifecycle.queue = false;
      this.observerLifecycle.rec = false;
      this.initialized = false;
    } catch (e) {
      // Catch silently during invalidation tear-down
    }
  }

  /**
   * Asynchronously retrieves the latest blocklist categories from chrome.storage.sync.
   * @returns {Promise<Object>} Object containing all blocked category arrays.
   */
  async getBlocklist() {
    return new Promise((resolve) => {
      if (!this.isContextValid()) {
        resolve({ blockedArtists: [], blockedSongs: [], blockedAlbums: [] });
        return;
      }

      try {
        getBlockData().then((data) => {
          if (!this.isContextValid()) {
            resolve({ blockedArtists: [], blockedSongs: [], blockedAlbums: [] });
            return;
          }
          this.blockedArtists = data.blockedArtists || [];
          this.blockedSongs = data.blockedSongs || [];
          this.blockedAlbums = data.blockedAlbums || [];
          resolve(data);
        });
      } catch (error) {
        this.disconnectAllObservers();
        resolve({ blockedArtists: [], blockedSongs: [], blockedAlbums: [] });
      }
    });
  }

  /**
   * Synchronizes storage changes instantly when any blocklist category is altered.
   */
  setupStorageListener() {
    if (!this.isContextValid()) return;

    try {
      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (!this.initialized) {
          this.log('debug', 'Storage change event ignored: initialization not completed.');
          return;
        }
        this.log('debug', 'Storage onChanged event captured. Area:', areaName, 'Changes:', changes);
        
        if (!this.isContextValid()) return;

        if (areaName === 'sync') {
          let updated = false;

          if (changes.blockedArtists) {
            this.blockedArtists = changes.blockedArtists.newValue || [];
            updated = true;
          }
          if (changes.blockedSongs) {
            this.blockedSongs = changes.blockedSongs.newValue || [];
            updated = true;
          }
          if (changes.blockedAlbums) {
            this.blockedAlbums = changes.blockedAlbums.newValue || [];
            updated = true;
          }

          if (updated) {
            this.log('info', 'Storage sync detected changes. Re-evaluating client DOM state...');
            
            // Force the queue scrubber to re-evaluate the entire list
            this.resetQueueScrubbingMarkers();

            // Force recommendations to re-evaluate
            this.resetRecScrubbingMarkers();

            // Re-evaluate the current track immediately (force check to skip instantly if blocked)
            this.handleTrackChange(true);
          }
        }
      });
    } catch (error) {
      this.log('error', 'Failed to register storage listener:', error);
      this.disconnectAllObservers();
    }
  }

  /**
   * Renders a highly-polished glass capsule floating notification inside the page body.
   * @param {string} name - Normalized item name.
   * @param {string} status - Dynamic status state ('blocked', 'already_blocked', 'failed').
   * @param {string} type - Block type ('artist', 'song', 'album').
   */
  showToastNotification(name, status, type = 'artist') {
    // 1. Wipe existing toast elements to prevent multiple stacked overlays
    const existing = document.getElementById('ytm-toast-alert');
    if (existing) existing.remove();

    // 2. Create the wrapper element
    const toast = document.createElement('div');
    toast.id = 'ytm-toast-alert';
    toast.className = 'ytm-toast-notification';

    // Capitalize word sequences for presentation
    const displayName = name
      ? name.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
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
        <span>Blocked ${type}: <span class="ytm-toast-artist">${displayName}</span></span>
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
        <span><span class="ytm-toast-artist">${displayName}</span> is already blocked</span>
      `;

      // Append unblock button
      const unblockBtn = document.createElement('button');
      unblockBtn.className = 'ytm-toast-action-btn';
      unblockBtn.textContent = 'Unblock';
      unblockBtn.addEventListener('click', () => {
        this.removeItemFromBlocklist(type, name);
        toast.remove();
      });
      toast.appendChild(unblockBtn);
    } else {
      // Failed to detect state
      toast.style.borderColor = 'rgba(239, 68, 68, 0.25)';
      toast.innerHTML = `
        <span class="ytm-toast-icon" style="color: #EF4444;">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
        </span>
        <span style="color: #E5E7EB;">Could not detect ${type} name</span>
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

  removeItemFromBlocklist(type, name) {
    if (!this.isContextValid()) return;

    try {
      removeBlockedItem(type, name).then(() => {
        if (!this.isContextValid()) return;
        console.log(`%c[YTM Block]%c Unblocked: "${name}" (${type}) via toast shortcut.`, 'color: #10B981; font-weight: bold;', 'color: default;');
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
          const album = this.getCurrentAlbum();
          const isPlaying = this.isPlaybackActive();
          
          sendResponse({
            artist: artistData.artist,
            title: title,
            album: album,
            isPlaying: isPlaying,
            rightClickedArtist: this.lastRightClickedContext ? this.lastRightClickedContext.artist : null,
            rightClickedSong: this.lastRightClickedContext ? this.lastRightClickedContext.song : null,
            rightClickedAlbum: this.lastRightClickedContext ? this.lastRightClickedContext.album : null,
            rightClickedEntityType: this.lastRightClickedContext ? this.lastRightClickedContext.entityType : null
          });
        } else if (request.action === 'showToast') {
          this.showToastNotification(request.artist || request.name, request.status, request.type || 'artist');
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
    if (!this.isContextValid()) return;

    if (this.observerLifecycle.track) {
      this.log('debug', 'Track observer already active. Skipping setup.');
      return;
    }

    const target = document.querySelector('ytmusic-app');
    if (!target) {
      setTimeout(() => this.setupObserver(), 1000);
      return;
    }

    try {
      this.observer = new MutationObserver((mutations) => {
        if (!this.initialized) return;

        try {
          let hasPopupChange = false;
          for (let i = 0; i < mutations.length; i++) {
            const mutation = mutations[i];
            if (mutation.addedNodes && mutation.addedNodes.length > 0) {
              for (let j = 0; j < mutation.addedNodes.length; j++) {
                const node = mutation.addedNodes[j];
                if (node && node.nodeType === 1) { // Node.ELEMENT_NODE
                  const tagName = node.tagName ? node.tagName.toLowerCase() : '';
                  if (tagName === 'ytmusic-menu-popup-renderer' ||
                      (node.querySelector && node.querySelector('ytmusic-menu-popup-renderer'))) {
                    hasPopupChange = true;
                    break;
                  }
                }
              }
            }
            if (hasPopupChange) break;
          }

          if (hasPopupChange && this.isContextValid()) {
            this.injectCustomMenuItem();
          }
        } catch (err) {
          this.log('error', 'Error processing menu mutations:', err);
        }

        if (this.debounceTimeout) {
          clearTimeout(this.debounceTimeout);
        }
        this.debounceTimeout = setTimeout(() => {
          if (!this.initialized) return;
          this.log('debug', 'setupObserver: debounce timeout fired.');
          this.handleTrackChange();
          // Check if queue container was dynamically replaced/recreated
          this.checkQueueRebinding();
        }, 300);
      });

      this.observer.observe(target, {
        childList: true,
        subtree: true,
        characterData: true
      });

      this.observerLifecycle.track = true;
      this.log('debug', 'Track observer successfully registered.');
    } catch (error) {
      this.log('error', 'Failed to register track observer:', error);
    }
  }

  /**
   * SECONDARY OBSERVER: Sets up a dedicated MutationObserver on the queue list.
   * Runs lightweight polling initially to bind once the queue element is attached.
   */
  /**
   * Initializes the queue element monitoring.
   */
  setupQueueObserver() {
    this.currentQueueElement = null;
    this.checkQueueRebinding();
  }

  /**
   * Verifies that the queue observer is still bound to the active queue DOM element.
   * If a new queue element is loaded during SPA page transitions, tears down the old
   * observer and attaches a new one.
   */
  checkQueueRebinding() {
    if (!this.isContextValid()) return;

    const queue = document.querySelector('ytmusic-player-queue');
    if (queue) {
      if (this.currentQueueElement !== queue) {
        if (this.queueObserver) {
          this.queueObserver.disconnect();
          this.observerLifecycle.queue = false;
        }
        this.currentQueueElement = queue;
        this.bindQueueObserver(queue);
      }
    } else {
      this.currentQueueElement = null;
      if (this.queueObserver) {
        this.queueObserver.disconnect();
        this.queueObserver = null;
        this.observerLifecycle.queue = false;
      }
    }
  }

  /**
   * Binds MutationObserver onto active queue element.
   * @param {HTMLElement} queueElement 
   */
  bindQueueObserver(queueElement) {
    if (this.observerLifecycle.queue) {
      this.log('debug', 'Queue observer already active. Skipping setup.');
      return;
    }

    try {
      this.queueObserver = new MutationObserver(() => {
        if (!this.initialized) return;
        if (!this.isContextValid()) return;
        
        try {
          if (this.queueDebounceTimeout) {
            clearTimeout(this.queueDebounceTimeout);
          }
          this.queueDebounceTimeout = setTimeout(() => {
            if (!this.initialized) return;
            this.scrubQueue();
          }, 400);
        } catch (err) {
          this.log('error', 'Error in queue observer debounce callback:', err);
        }
      });

      this.queueObserver.observe(queueElement, {
        childList: true,
        subtree: true
      });

      this.observerLifecycle.queue = true;
      this.log('debug', 'Queue observer successfully registered.');
      this.scrubQueue();
    } catch (error) {
      this.log('error', 'Failed to bind queue observer:', error);
    }
  }

  /**
   * Scans all player queue items inside the player page,
   * matches them against the blocklist, and dims blocked entries.
   * Optimized with dual-layer performance guards to eliminate redundant processing.
   */
  /**
   * Scans all player queue items inside the player page,
   * matches them against the blocklist, and dims blocked entries.
   * Employs attribute-level verification to handle virtualized scrolling lists correctly.
   */
  scrubQueue() {
    const items = document.querySelectorAll('ytmusic-player-queue-item');
    if (items.length === 0) return;

    let processedCount = 0;
    let blockedCount = 0;
    let totalBlockedInVisibleQueue = 0;

    items.forEach((item) => {
      const artist = this.getQueueItemArtist(item);
      const title = this.getQueueItemTitle(item);
      const album = this.getQueueItemAlbum(item);

      // Virtualization Check: Has the content changed since we last processed this element?
      if (item.dataset.ytmProcessed === 'true' && 
          item.dataset.ytmTitle === title && 
          item.dataset.ytmArtist === artist && 
          item.dataset.ytmAlbum === album) {
        if (item.classList.contains('ytm-blocked-queue-item')) {
          totalBlockedInVisibleQueue++;
        }
        return;
      }

      // Mark as processed with current track keys
      item.dataset.ytmProcessed = 'true';
      item.dataset.ytmTitle = title;
      item.dataset.ytmArtist = artist;
      item.dataset.ytmAlbum = album;
      processedCount++;

      const matchResult = this.shouldSkipTrack(title, artist, album);
      if (matchResult.shouldSkip) {
        item.classList.add('ytm-blocked-queue-item');
        item.setAttribute('title', `Blocked track: Matched ${matchResult.matchedType} rule "${matchResult.matchedTerm}"`);
        blockedCount++;
        totalBlockedInVisibleQueue++;
      } else {
        item.classList.remove('ytm-blocked-queue-item');
        item.removeAttribute('title');
      }
    });

    this.updateQueueStats(totalBlockedInVisibleQueue);

    if (processedCount > 0 || blockedCount > 0) {
      console.log(`[YTM Block Scrubber] Evaluated ${processedCount} new/recycled items. Total blocked: ${totalBlockedInVisibleQueue}`);
    }
  }

  /**
   * Updates or injects the blocked track stats counter above/within the queue element.
   * @param {number} blockedCount - The total number of blocked tracks detected.
   */
  updateQueueStats(blockedCount) {
    let statsEl = document.getElementById('ytm-queue-stats');
    if (!statsEl) {
      const queueHeader = document.querySelector('ytmusic-player-queue #header') || 
                          document.querySelector('ytmusic-player-queue .title') ||
                          document.querySelector('ytmusic-player-queue');
      if (!queueHeader) return;

      statsEl = document.createElement('div');
      statsEl.id = 'ytm-queue-stats';
      statsEl.className = 'ytm-queue-stats-badge';
      queueHeader.appendChild(statsEl);
    }

    if (blockedCount > 0) {
      statsEl.textContent = `${blockedCount} blocked track${blockedCount > 1 ? 's' : ''} hidden`;
      statsEl.classList.add('show');
    } else {
      statsEl.classList.remove('show');
    }
  }

  /**
   * Intercepts and suppresses click events targeting blocked queue items.
   */
  setupQueueClickListener() {
    document.addEventListener('click', (e) => {
      const clicked = e.target;
      if (!clicked) return;

      const blockedItem = clicked.closest('.ytm-blocked-queue-item');
      if (blockedItem) {
        console.log('%c[YTM Block]%c Intercepted and blocked click on disabled queue track.', 'color: #FF0033; font-weight: bold;', 'color: default;');
        e.preventDefault();
        e.stopPropagation();
        
        const title = blockedItem.dataset.ytmTitle || 'Blocked Track';
        this.showToastNotification(title, 'blocked', 'song');
      }
    }, true); // Capture phase bindings
  }

  /**
   * Extracts the album name from a queue item element using structural links.
   * @param {HTMLElement} item - Single queue list item element.
   * @returns {string} Trimmed album name.
   */
  getQueueItemAlbum(item) {
    const anchors = item.querySelectorAll('a');
    for (const link of anchors) {
      const href = link.getAttribute('href') || '';
      const text = link.textContent.trim();
      
      if ((href.includes('/browse/MPRE') || href.includes('/browse/FIBY')) && text) {
        return text;
      }
    }
    return '';
  }

  /**
   * Extracts the song title from a queue item element.
   * @param {HTMLElement} item - Single queue list item element.
   * @returns {string} Trimmed song title.
   */
  getQueueItemTitle(item) {
    const titleEl = item.querySelector('.song-title') || 
                    item.querySelector('.title') || 
                    item.querySelector('yt-formatted-string');
    if (titleEl && titleEl.textContent) {
      return titleEl.textContent.trim();
    }
    return '';
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
      item.removeAttribute('data-ytm-title');
      item.removeAttribute('data-ytm-artist');
      item.removeAttribute('data-ytm-album');
      item.removeAttribute('title');
      item.classList.remove('ytm-blocked-queue-item');
    });

    this.scrubQueue();
  }

  // --- RIGHT-CLICK CONTEXT EXTRACTION SYSTEM ---

  /**
   * Sets up a capture-phase right-click event listener to resolve the targeted music entities.
   */
  setupRightClickListener() {
    document.addEventListener('contextmenu', (event) => {
      if (!this.isContextValid()) return;
      this.handleRightClick(event);
    }, true); // Binds to capture phase to intercept context menu before propagation halts
  }

  /**
   * Sets up a capture-phase left-click event listener to cache targeted music entities
   * when the user clicks a three-dot button or a similar custom menu launcher.
   */
  setupLeftClickListener() {
    document.addEventListener('click', (event) => {
      if (!this.isContextValid()) return;
      const clicked = event.target;
      if (!clicked) return;

      const menuButton = clicked.closest('ytmusic-menu-renderer') || 
                         clicked.closest('.menu-button') || 
                         clicked.closest('#button') ||
                         clicked.closest('.ytmusic-menu-renderer');
      if (menuButton) {
        console.log('%c[YTM Block]%c 🖱️ Left-click on menu button resolved! Crawling context...', 'color: #FF0033; font-weight: bold;', 'color: default;');
        const context = this.extractContextData(menuButton);
        if (context && (context.artist || context.song || context.album)) {
          this.lastRightClickedContext = {
            artist: context.artist,
            song: context.song,
            album: context.album,
            entityType: context.entityType,
            timestamp: Date.now()
          };
          console.log(`%c[YTM Block]%c Cached context from menu launcher click: artist="${context.artist}", song="${context.song}", album="${context.album}"`, 'color: #10B981; font-weight: bold;', 'color: default;');
        } else {
          console.log('%c[YTM Block]%c Could not extract context data from click.', 'color: #EF4444; font-weight: bold;', 'color: default;');
        }
      }
    }, true);
  }

  /**
   * Instantly injects custom crimson "Block" options into 
   * YouTube Music's custom DOM context menu overlay.
   */
  injectCustomMenuItem() {
    const menuList = document.querySelector('ytmusic-menu-popup-renderer #items') || 
                     document.querySelector('#items.ytmusic-menu-popup-renderer');
    if (!menuList) return;

    // Check if already injected to avoid duplicate items
    if (menuList.querySelector('[data-ytm-block-injected="true"]')) return;

    // Retrieve last clicked/right-clicked context
    const context = this.lastRightClickedContext;
    const itemsToInject = [];
    
    if (context) {
      if (context.artist) {
        itemsToInject.push({
          type: 'artist',
          label: `Block Artist (${context.artist})`,
          value: context.artist
        });
      }
      if (context.song) {
        itemsToInject.push({
          type: 'song',
          label: `Block Song (${context.song})`,
          value: context.song
        });
      }
      if (context.album) {
        itemsToInject.push({
          type: 'album',
          label: `Block Album (${context.album})`,
          value: context.album
        });
      }
    }

    // Fallback: If absolutely nothing is in the context, check current playing track
    if (itemsToInject.length === 0) {
      const activeArtist = this.getCurrentArtist().artist;
      if (activeArtist) {
        itemsToInject.push({
          type: 'artist',
          label: `Block Artist (${activeArtist})`,
          value: activeArtist
        });
      }
      const activeSong = this.getCurrentSongTitle();
      if (activeSong) {
        itemsToInject.push({
          type: 'song',
          label: `Block Song (${activeSong})`,
          value: activeSong
        });
      }
      const activeAlbum = this.getCurrentAlbum();
      if (activeAlbum) {
        itemsToInject.push({
          type: 'album',
          label: `Block Album (${activeAlbum})`,
          value: activeAlbum
        });
      }
    }

    // Now inject each menu item
    itemsToInject.forEach(item => {
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
        <span class="ytm-custom-menu-text">${item.label}</span>
      `;

      let actionTriggered = false;
      const handleAction = (e) => {
        e.preventDefault();
        e.stopPropagation();

        if (actionTriggered) return;
        actionTriggered = true;
        setTimeout(() => { actionTriggered = false; }, 500);

        console.log(`%c[YTM Block] Custom menu item clicked for type "${item.type}": "${item.value}"`, 'color: #FF1E46; font-weight: bold;');

        this.addBlockedItemFromInline(item.type, item.value);

        // Close YouTube Music's overlay menu naturally
        const dismisser = document.querySelector('iron-overlay-backdrop');
        if (dismisser) {
          dismisser.click();
        } else {
          document.body.click();
        }
      };

      newItem.addEventListener('mousedown', handleAction, true);
      newItem.addEventListener('click', handleAction, true);

      menuList.appendChild(newItem);
    });

    if (itemsToInject.length > 0) {
      console.log(`[YTM Block] Successfully injected ${itemsToInject.length} custom block options into YTM dropdown.`);
    }
  }

  /**
   * Adds an item to persistent blocklist directly from inline actions.
   * @param {('artist'|'song'|'album')} type - Block type.
   * @param {string} name - Raw item name.
   */
  addBlockedItemFromInline(type, name) {
    console.log(`%c[YTM Block]%c Direct blocking storage query started for: "${name}" (${type})`, 'color: #10B981; font-weight: bold;', 'color: default;');
    if (!this.isContextValid()) {
      console.error('[YTM Block] Storage write halted: Context is invalid (please refresh the page).');
      return;
    }

    try {
      addBlockedItem(type, name).then((result) => {
        if (!this.isContextValid()) return;

        if (!result.success) {
          if (result.status === 'already_blocked') {
            console.log(`%c[YTM Block]%c ${type} "${name}" is already blocked. Spawning warning toast.`, 'color: #EAB308; font-weight: bold;', 'color: default;');
            this.showToastNotification(name, 'already_blocked', type);
          } else {
            this.showToastNotification(name, 'failed', type);
          }
          return;
        }

        console.log(`%c[YTM Block]%c Direct block success! Persistent storage updated for: "${name}" (${type})`, 'color: #10B981; font-weight: bold;', 'color: default;');
        this.showToastNotification(name, 'blocked', type);
      });
    } catch (error) {
      console.error('[YTM Block] Direct blocking failed with exception:', error);
      this.disconnectAllObservers();
    }
  }

  /**
   * Handles right click event by pulling the click target and routing to the context extractor.
   * @param {MouseEvent} event - Native contextmenu event.
   */
  handleRightClick(event) {
    const clickedElement = event.target;
    if (!clickedElement) return;

    const context = this.extractContextData(clickedElement);
    
    if (context && (context.artist || context.song || context.album)) {
      this.lastRightClickedContext = {
        artist: context.artist,
        song: context.song,
        album: context.album,
        entityType: context.entityType,
        timestamp: Date.now()
      };
      console.log('%c[YTM Block] 🖱️ Right-click context resolved!', 'color: #10B981; font-weight: bold;');
    } else {
      // Clear cache on empty backgrounds to allow standard player bar fallback
      this.lastRightClickedContext = null;
    }

    // Inform background script of context to update native context menus
    try {
      chrome.runtime.sendMessage({
        action: 'rightClickContext',
        context: this.lastRightClickedContext
      });
    } catch (e) {
      console.warn('[YTM Block] Failed to send right-click context to background script:', e);
    }
  }

  /**
   * Extracts the artist name from the clicked DOM element or its ancestors.
   * @param {HTMLElement} el - Clicked/Target DOM element.
   * @returns {Object|null} { value: string, confidence: number, source: string }
   */
  extractArtist(el) {
    if (!el) return null;

    // 1. Direct link checks
    const link = el.closest('a');
    if (link) {
      const href = link.getAttribute('href') || '';
      const text = link.textContent.trim();
      if ((href.includes('/browse/UC') || href.includes('/channel/UC') || href.includes('/artist/') || 
          (href.includes('/browse/') && !href.includes('/browse/VL') && !href.includes('/browse/MPRE') && !href.includes('/watch?v='))) && 
          text) {
        return {
          value: text,
          confidence: 1.0,
          source: 'Direct Artist Link (closest a)'
        };
      }
    }

    // 2. Responsive list item rows
    const responsiveItem = el.closest('ytmusic-responsive-list-item-renderer');
    if (responsiveItem) {
      const anchors = responsiveItem.querySelectorAll('a');
      for (const a of anchors) {
        const href = a.getAttribute('href') || '';
        const text = a.textContent.trim();
        if ((href.includes('/browse/UC') || href.includes('/channel/UC') || href.includes('/artist/') ||
            (href.includes('/browse/') && !href.includes('/browse/VL') && !href.includes('/browse/MPRE') && !href.includes('/watch?v='))) && 
            text) {
          return {
            value: text,
            confidence: 0.9,
            source: 'Row Artist Link extraction'
          };
        }
      }
      const subtitleEl = responsiveItem.querySelector('.subtitle') || responsiveItem.querySelector('.secondary-flex-columns') || responsiveItem.querySelector('.flex-column:nth-child(2)');
      if (subtitleEl && subtitleEl.textContent) {
        const text = subtitleEl.textContent.trim();
        const parts = text.split(/[•·]/);
        if (parts[0] && parts[0].trim()) {
          return {
            value: parts[0].trim(),
            confidence: 0.7,
            source: 'Row Subtitle parse fallback'
          };
        }
      }
    }

    // 3. Queue list items
    const queueItem = el.closest('ytmusic-player-queue-item');
    if (queueItem) {
      const anchors = queueItem.querySelectorAll('a');
      for (const a of anchors) {
        const href = a.getAttribute('href') || '';
        const text = a.textContent.trim();
        if ((href.includes('/browse/UC') || href.includes('/channel/UC') || 
            (href.includes('/browse/') && !href.includes('/browse/VL') && !href.includes('/browse/MPRE') && !href.includes('/watch?v='))) && 
            text) {
          return {
            value: text,
            confidence: 0.9,
            source: 'Queue Row Artist Link extraction'
          };
        }
      }
      const bylineEl = queueItem.querySelector('.byline') || queueItem.querySelector('[class*="byline"]') || queueItem.querySelector('.secondary-title');
      if (bylineEl && bylineEl.textContent) {
        const text = bylineEl.textContent.trim();
        const parts = text.split(/[•·]/);
        if (parts[0] && parts[0].trim()) {
          return {
            value: parts[0].trim(),
            confidence: 0.7,
            source: 'Queue Row Byline parse fallback'
          };
        }
      }
    }

    // 4. Recommendation Cards / Grid items
    const card = el.closest('ytmusic-two-row-item-renderer') || 
                 el.closest('ytmusic-grid-single-column-item-renderer') ||
                 el.closest('ytmusic-card-shelf-renderer');
    if (card) {
      const artistLink = card.querySelector('a[href*="/browse/UC"]') || 
                         card.querySelector('a[href*="/channel/UC"]') || 
                         card.querySelector('.subtitle a') || 
                         card.querySelector('.secondary a');
      if (artistLink && artistLink.textContent.trim()) {
        return {
          value: artistLink.textContent.trim(),
          confidence: 0.8,
          source: 'Card Artist link extraction'
        };
      }
      
      const cardTitleLink = card.querySelector('a.title') || card.querySelector('#title a') || card.querySelector('a');
      if (cardTitleLink) {
        const href = cardTitleLink.getAttribute('href') || '';
        const text = cardTitleLink.textContent.trim();
        if ((href.includes('/browse/UC') || href.includes('/channel/UC')) && text) {
          return {
            value: text,
            confidence: 0.9,
            source: 'Card Title Artist link extraction'
          };
        }
      }

      const subtitleEl = card.querySelector('.subtitle') || card.querySelector('#subtitle');
      if (subtitleEl && subtitleEl.textContent.trim()) {
        return {
          value: subtitleEl.textContent.trim(),
          confidence: 0.6,
          source: 'Card Subtitle text fallback'
        };
      }
    }

    // 5. Player Bar
    const playerBar = el.closest('ytmusic-player-bar');
    if (playerBar) {
      const curArtistData = this.getCurrentArtist();
      if (curArtistData && curArtistData.artist) {
        return {
          value: curArtistData.artist,
          confidence: 0.8,
          source: `Player Bar current artist (${curArtistData.selector})`
        };
      }
    }

    // 6. Page Header (e.g. Artist Page or Details Page)
    const header = el.closest('ytmusic-imig-header-renderer') || 
                   el.closest('ytmusic-header-renderer') || 
                   el.closest('ytmusic-detail-header-renderer');
    if (header) {
      const titleEl = header.querySelector('.title') || header.querySelector('h2') || header.querySelector('h1');
      if (window.location.href.includes('/channel/') || window.location.href.includes('/browse/UC')) {
        if (titleEl && titleEl.textContent.trim()) {
          return {
            value: titleEl.textContent.trim(),
            confidence: 0.9,
            source: 'Artist Page Header title extraction'
          };
        }
      }
      const artistLink = header.querySelector('.subtitle a') || header.querySelector('.byline a');
      if (artistLink && artistLink.textContent.trim()) {
        return {
          value: artistLink.textContent.trim(),
          confidence: 0.9,
          source: 'Detail Page Header Artist link extraction'
        };
      }
    }

    // 7. Generic list item container fallback
    const container = el.closest('.responsive-list-item') || el.closest('.song-table-row') || el.closest('tr');
    if (container) {
      const anchors = container.querySelectorAll('a');
      for (const a of anchors) {
        const href = a.getAttribute('href') || '';
        const text = a.textContent.trim();
        if ((href.includes('/browse/UC') || href.includes('/channel/UC') || 
            (href.includes('/browse/') && !href.includes('/browse/VL') && !href.includes('/browse/MPRE') && !href.includes('/watch?v='))) && 
            text) {
          return {
            value: text,
            confidence: 0.7,
            source: 'Generic Container Artist Link extraction'
          };
        }
      }
    }

    return null;
  }

  /**
   * Extracts the song title from the clicked DOM element or its ancestors.
   * @param {HTMLElement} el - Clicked/Target DOM element.
   * @returns {Object|null} { value: string, confidence: number, source: string }
   */
  extractSong(el) {
    if (!el) return null;

    // 1. Direct watch link check
    const link = el.closest('a');
    if (link) {
      const href = link.getAttribute('href') || '';
      const text = link.textContent.trim();
      if (href.includes('/watch?v=') && text) {
        return {
          value: text,
          confidence: 1.0,
          source: 'Direct Song Link (closest a)'
        };
      }
    }

    // 2. Responsive list item rows
    const responsiveItem = el.closest('ytmusic-responsive-list-item-renderer');
    if (responsiveItem) {
      const titleEl = responsiveItem.querySelector('.title') || 
                      responsiveItem.querySelector('.title-column') || 
                      responsiveItem.querySelector('a[class*="title"]') ||
                      responsiveItem.querySelector('yt-formatted-string.title');
      if (titleEl && titleEl.textContent) {
        return {
          value: titleEl.textContent.trim(),
          confidence: 0.9,
          source: 'Row Title element extraction'
        };
      }
      const firstColumn = responsiveItem.querySelector('ytmusic-responsive-list-item-flex-column-renderer');
      if (firstColumn && firstColumn.textContent) {
        return {
          value: firstColumn.textContent.trim(),
          confidence: 0.8,
          source: 'Row First Flex Column fallback'
        };
      }
    }

    // 3. Queue list items
    const queueItem = el.closest('ytmusic-player-queue-item');
    if (queueItem) {
      const titleEl = queueItem.querySelector('.song-title') || 
                      queueItem.querySelector('.title') || 
                      queueItem.querySelector('yt-formatted-string');
      if (titleEl && titleEl.textContent) {
        return {
          value: titleEl.textContent.trim(),
          confidence: 0.9,
          source: 'Queue Row Title element extraction'
        };
      }
    }

    // 4. Recommendation Cards / Grid items
    const card = el.closest('ytmusic-two-row-item-renderer') || 
                 el.closest('ytmusic-grid-single-column-item-renderer');
    if (card) {
      const cardTitleLink = card.querySelector('a.title') || card.querySelector('#title a');
      if (cardTitleLink) {
        const href = cardTitleLink.getAttribute('href') || '';
        const text = cardTitleLink.textContent.trim();
        if (href.includes('/watch?v=') && text) {
          return {
            value: text,
            confidence: 0.9,
            source: 'Song Card Title extraction'
          };
        }
      }
    }

    // 5. Player Bar
    const playerBar = el.closest('ytmusic-player-bar');
    if (playerBar) {
      const curTitle = this.getCurrentSongTitle();
      if (curTitle) {
        return {
          value: curTitle,
          confidence: 0.8,
          source: 'Player Bar current song'
        };
      }
    }

    // 6. Generic list item container fallback
    const container = el.closest('.responsive-list-item') || el.closest('.song-table-row') || el.closest('tr');
    if (container) {
      const titleEl = container.querySelector('.title') || container.querySelector('[class*="title"]');
      if (titleEl && titleEl.textContent) {
        return {
          value: titleEl.textContent.trim(),
          confidence: 0.8,
          source: 'Generic Container Title element'
        };
      }
      const watchLink = container.querySelector('a[href*="/watch?v="]');
      if (watchLink && watchLink.textContent.trim()) {
        return {
          value: watchLink.textContent.trim(),
          confidence: 0.8,
          source: 'Generic Container watch link'
        };
      }
    }

    return null;
  }

  /**
   * Extracts the album title from the clicked DOM element or its ancestors.
   * @param {HTMLElement} el - Clicked/Target DOM element.
   * @returns {Object|null} { value: string, confidence: number, source: string }
   */
  extractAlbum(el) {
    if (!el) return null;

    // 1. Direct link checks
    const link = el.closest('a');
    if (link) {
      const href = link.getAttribute('href') || '';
      const text = link.textContent.trim();
      if ((href.includes('/browse/MPRE') || href.includes('/browse/FIBY')) && text) {
        return {
          value: text,
          confidence: 1.0,
          source: 'Direct Album Link (closest a)'
        };
      }
    }

    // 2. Responsive list item rows
    const responsiveItem = el.closest('ytmusic-responsive-list-item-renderer');
    if (responsiveItem) {
      const anchors = responsiveItem.querySelectorAll('a');
      for (const a of anchors) {
        const href = a.getAttribute('href') || '';
        const text = a.textContent.trim();
        if ((href.includes('/browse/MPRE') || href.includes('/browse/FIBY')) && text) {
          return {
            value: text,
            confidence: 0.9,
            source: 'Row Album Link extraction'
          };
        }
      }
      const subtitleEl = responsiveItem.querySelector('.subtitle') || responsiveItem.querySelector('.secondary-flex-columns');
      if (subtitleEl && subtitleEl.textContent) {
        const text = subtitleEl.textContent.trim();
        const parts = text.split(/[•·]/);
        if (parts.length >= 3) {
          const possibleAlbum = parts[2].trim();
          if (possibleAlbum && !possibleAlbum.match(/^\d+:\d+$/)) {
            return {
              value: possibleAlbum,
              confidence: 0.6,
              source: 'Row Subtitle parse (3rd segment)'
            };
          }
        }
        if (parts.length === 2) {
          const possibleAlbum = parts[1].trim();
          if (possibleAlbum && !possibleAlbum.match(/^\d+:\d+$/)) {
            return {
              value: possibleAlbum,
              confidence: 0.5,
              source: 'Row Subtitle parse (2nd segment)'
            };
          }
        }
      }
    }

    // 3. Recommendation Cards / Grid items
    const card = el.closest('ytmusic-two-row-item-renderer') || 
                 el.closest('ytmusic-grid-single-column-item-renderer') ||
                 el.closest('ytmusic-card-shelf-renderer');
    if (card) {
      const cardTitleLink = card.querySelector('a.title') || card.querySelector('#title a');
      if (cardTitleLink) {
        const href = cardTitleLink.getAttribute('href') || '';
        const text = cardTitleLink.textContent.trim();
        if ((href.includes('/browse/MPRE') || href.includes('/browse/FIBY')) && text) {
          return {
            value: text,
            confidence: 0.9,
            source: 'Album Card Title extraction'
          };
        }
      }
      const albumLink = card.querySelector('a[href*="/browse/MPRE"]') || card.querySelector('a[href*="/browse/FIBY"]');
      if (albumLink && albumLink.textContent.trim()) {
        return {
          value: albumLink.textContent.trim(),
          confidence: 0.8,
          source: 'Card Subtitle Album link'
        };
      }
    }

    // 4. Album Page Details Header
    const detailHeader = el.closest('ytmusic-detail-header-renderer');
    if (detailHeader) {
      const titleEl = detailHeader.querySelector('.title') || detailHeader.querySelector('h2');
      if (titleEl && titleEl.textContent.trim()) {
        return {
          value: titleEl.textContent.trim(),
          confidence: 0.9,
          source: 'Detail Album Page Title extraction'
        };
      }
    }

    // 5. Player Bar
    const playerBar = el.closest('ytmusic-player-bar');
    if (playerBar) {
      const curAlbum = this.getCurrentAlbum();
      if (curAlbum) {
        return {
          value: curAlbum,
          confidence: 0.8,
          source: 'Player Bar current album'
        };
      }
    }

    // 6. Generic list item container fallback
    const container = el.closest('.responsive-list-item') || el.closest('.song-table-row') || el.closest('tr');
    if (container) {
      const albumLink = container.querySelector('a[href*="/browse/MPRE"]') || container.querySelector('a[href*="/browse/FIBY"]');
      if (albumLink && albumLink.textContent.trim()) {
        return {
          value: albumLink.textContent.trim(),
          confidence: 0.7,
          source: 'Generic Container Album link'
        };
      }
    }

    // 7. Page Context Fallback
    if (window.location.href.includes('/browse/MPRE') || window.location.href.includes('/browse/FIBY')) {
      const titleEl = document.querySelector('ytmusic-detail-header-renderer .title') || 
                      document.querySelector('h2.ytmusic-detail-header-renderer');
      if (titleEl && titleEl.textContent.trim()) {
        return {
          value: titleEl.textContent.trim(),
          confidence: 0.8,
          source: 'Page Context Album Title fallback'
        };
      }
    }

    return null;
  }

  /**
   * Compiles the full music entity context from the clicked element.
   * Determines the primary entity type and logs debugging telemetry.
   * @param {HTMLElement} el - Target DOM element.
   * @returns {Object|null} Context data object.
   */
  extractContextData(el) {
    if (!el) return null;

    const domPath = this.getDOMPath(el);
    const artistRes = this.extractArtist(el);
    const songRes = this.extractSong(el);
    const albumRes = this.extractAlbum(el);

    const artistVal = artistRes ? artistRes.value : null;
    const songVal = songRes ? songRes.value : null;
    const albumVal = albumRes ? albumRes.value : null;

    // Determine the entityType (primary target of the click)
    let entityType = null;
    let confidence = 0.0;
    let selectorSource = 'None';

    // Walk up the clicked element to see which direct link or element was hit first
    let current = el;
    let matchedLinkType = null;
    while (current && current !== document.body) {
      if (current.tagName === 'A') {
        const href = current.getAttribute('href') || '';
        if (href.includes('/browse/UC') || href.includes('/channel/UC') || 
            (href.includes('/browse/') && !href.includes('/browse/VL') && !href.includes('/browse/MPRE') && !href.includes('/watch?v='))) {
          matchedLinkType = 'artist';
          break;
        } else if (href.includes('/browse/MPRE') || href.includes('/browse/FIBY')) {
          matchedLinkType = 'album';
          break;
        } else if (href.includes('/watch?v=')) {
          matchedLinkType = 'song';
          break;
        }
      }
      current = current.parentElement || (current.parentNode && current.parentNode.host ? current.parentNode.host : current.parentNode);
    }

    if (matchedLinkType) {
      entityType = matchedLinkType;
      confidence = 1.0;
      selectorSource = `Direct ${matchedLinkType} link click`;
    } else {
      if (el.closest('ytmusic-responsive-list-item-renderer') || el.closest('ytmusic-player-queue-item') || el.closest('.song-table-row') || el.closest('tr')) {
        entityType = 'song';
        confidence = 0.9;
        selectorSource = 'Row Container context';
      } else if (el.closest('ytmusic-detail-header-renderer')) {
        entityType = 'album';
        confidence = 0.9;
        selectorSource = 'Detail Header context';
      } else if (el.closest('ytmusic-imig-header-renderer') || el.closest('ytmusic-header-renderer')) {
        entityType = 'artist';
        confidence = 0.9;
        selectorSource = 'Artist/General Header context';
      } else if (el.closest('ytmusic-two-row-item-renderer') || el.closest('ytmusic-grid-single-column-item-renderer')) {
        const card = el.closest('ytmusic-two-row-item-renderer') || el.closest('ytmusic-grid-single-column-item-renderer');
        const titleLink = card.querySelector('a.title') || card.querySelector('#title a');
        if (titleLink) {
          const href = titleLink.getAttribute('href') || '';
          if (href.includes('/browse/MPRE') || href.includes('/browse/FIBY')) {
            entityType = 'album';
            confidence = 0.9;
            selectorSource = 'Album Card context';
          } else if (href.includes('/browse/UC') || href.includes('/channel/UC')) {
            entityType = 'artist';
            confidence = 0.9;
            selectorSource = 'Artist Card context';
          } else if (href.includes('/watch?v=')) {
            entityType = 'song';
            confidence = 0.9;
            selectorSource = 'Song Card context';
          }
        }
      } else if (el.closest('ytmusic-player-bar')) {
        if (el.closest('.title')) {
          entityType = 'song';
          confidence = 0.9;
          selectorSource = 'Player Bar Song title';
        } else if (el.closest('.byline a[href*="/browse/MPRE"]') || el.closest('.byline a[href*="/browse/FIBY"]')) {
          entityType = 'album';
          confidence = 0.9;
          selectorSource = 'Player Bar Album link';
        } else if (el.closest('.byline a[href*="/browse/UC"]') || el.closest('.byline a[href*="/channel/UC"]')) {
          entityType = 'artist';
          confidence = 0.9;
          selectorSource = 'Player Bar Artist link';
        } else {
          entityType = 'song';
          confidence = 0.7;
          selectorSource = 'Player Bar general click';
        }
      } else {
        if (songVal) {
          entityType = 'song';
          confidence = 0.5;
          selectorSource = 'Song extraction fallback';
        } else if (artistVal) {
          entityType = 'artist';
          confidence = 0.5;
          selectorSource = 'Artist extraction fallback';
        } else if (albumVal) {
          entityType = 'album';
          confidence = 0.5;
          selectorSource = 'Album extraction fallback';
        }
      }
    }

    const data = {
      artist: artistVal,
      song: songVal,
      album: albumVal,
      entityType,
      confidence,
      selectorSource,
      domPath
    };

    console.log('%c[YTM Block] 🔍 Context Data Extracted!', 'color: #10B981; font-weight: bold;');
    console.log(`%cDOM Path:    %c"${data.domPath}"`, 'font-weight: bold; color: #FFFFFF;', 'color: #D4D4D8;');
    console.log(`%cArtist:      %c"${data.artist || 'None'}"`, 'font-weight: bold; color: #FFFFFF;', 'color: #FF1E46;');
    console.log(`%cSong:        %c"${data.song || 'None'}"`, 'font-weight: bold; color: #FFFFFF;', 'color: #38BDF8;');
    console.log(`%cAlbum:       %c"${data.album || 'None'}"`, 'font-weight: bold; color: #FFFFFF;', 'color: #34D399;');
    console.log(`%cPrimary Type:%c"${data.entityType || 'None'}"`, 'font-weight: bold; color: #FFFFFF;', 'color: #FBBF24;');
    console.log(`%cConfidence:  %c${data.confidence.toFixed(2)} (${data.selectorSource})`, 'font-weight: bold; color: #FFFFFF;', 'color: #A78BFA;');

    return data;
  }

  /**
   * Helper to retrieve a representative CSS selector/tag path for DOM telemetry.
   */
  getDOMPath(el) {
    if (!el) return '';
    const path = [];
    let current = el;
    while (current && current !== document.body) {
      let selector = current.tagName.toLowerCase();
      if (current.id) {
        selector += `#${current.id}`;
        path.unshift(selector);
        break;
      } else {
        if (current.className) {
          const classes = Array.from(current.classList)
            .filter(c => !c.includes('style-scope') && !c.startsWith('ytmusic-') && !c.startsWith('yt-'))
            .join('.');
          if (classes) {
            selector += `.${classes}`;
          }
        }
        path.unshift(selector);
      }
      current = current.parentElement;
    }
    return path.join(' > ');
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
   * Evaluates if the given artist name matches any blocked artist rules (partial matching allowed).
   * @param {string} artistName - The raw artist name.
   * @returns {string|null} The matched block rule value, or null.
   */
  shouldBlockArtist(artistName) {
    if (!artistName || this.blockedArtists.length === 0) return null;
    const artistLower = artistName.toLowerCase().trim();
    
    for (const blocked of this.blockedArtists) {
      const blockedLower = blocked.toLowerCase().trim();
      if (artistLower === blockedLower || artistLower.includes(blockedLower)) {
        return blocked;
      }
    }
    return null;
  }

  /**
   * Evaluates if the given song title matches any blocked song rules (exact or fuzzy matching).
   * @param {string} songTitle - The raw song title.
   * @returns {string|null} The matched block rule value, or null.
   */
  shouldBlockSong(songTitle) {
    if (!songTitle || this.blockedSongs.length === 0) return null;
    const titleLower = songTitle.toLowerCase().trim();
    
    // Clean string helper for fuzzy matching (removes standard punctuation / extras like feat, remix, bracketed info)
    const cleanString = (str) => {
      return str.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()\[\]]/g, "").replace(/\s+/g, " ").trim();
    };
    
    const cleanedTitle = cleanString(titleLower);

    for (const blocked of this.blockedSongs) {
      const blockedLower = blocked.toLowerCase().trim();
      const cleanedBlocked = cleanString(blockedLower);

      // Exact match
      if (titleLower === blockedLower || cleanedTitle === cleanedBlocked) {
        return blocked;
      }
      
      // Fuzzy: Substring match on clean titles or title includes blocked term
      if (titleLower.includes(blockedLower) || cleanedTitle.includes(cleanedBlocked)) {
        return blocked;
      }
    }
    return null;
  }

  /**
   * Evaluates if the given album title matches any blocked album rules.
   * @param {string} albumTitle - The raw album title.
   * @returns {string|null} The matched block rule value, or null.
   */
  shouldBlockAlbum(albumTitle) {
    if (!albumTitle || this.blockedAlbums.length === 0) return null;
    const albumLower = albumTitle.toLowerCase().trim();
    
    for (const blocked of this.blockedAlbums) {
      const blockedLower = blocked.toLowerCase().trim();
      if (albumLower === blockedLower || albumLower.includes(blockedLower)) {
        return blocked;
      }
    }
    return null;
  }

  /**
   * Evaluates if the current track should be skipped based on song title, album, or artist.
   * Priority: 1. blockedSongs, 2. blockedAlbums, 3. blockedArtists.
   * @param {string} title - Song title.
   * @param {string} artist - Artist name.
   * @param {string} album - Album name.
   * @returns {Object} { shouldSkip: boolean, matchedTerm: string|null, matchedType: string|null }
   */
  shouldSkipTrack(title, artist, album) {
    console.log('[YTM Block Debug] shouldSkipTrack() evaluating:', { title, artist, album });
    // 1. Evaluate Song Title Blocks (Priority 1)
    const matchedSong = this.shouldBlockSong(title);
    if (matchedSong) {
      console.log('[YTM Block Debug] shouldSkipTrack matched song:', matchedSong);
      return { shouldSkip: true, matchedTerm: matchedSong, matchedType: 'song' };
    }

    // 2. Evaluate Album Blocks (Priority 2)
    const matchedAlbum = this.shouldBlockAlbum(album);
    if (matchedAlbum) {
      return { shouldSkip: true, matchedTerm: matchedAlbum, matchedType: 'album' };
    }

    // 3. Evaluate Artist Blocks (Priority 3)
    const matchedArtist = this.shouldBlockArtist(artist);
    if (matchedArtist) {
      return { shouldSkip: true, matchedTerm: matchedArtist, matchedType: 'artist' };
    }

    return { shouldSkip: false, matchedTerm: null, matchedType: null };
  }

  /**
   * Safely extracts the currently playing album title from the player bar bylines.
   * @returns {string} Trimmed album title or empty string.
   */
  getCurrentAlbum() {
    const albumAnchor = document.querySelector('ytmusic-player-bar .byline a[href*="/browse/MPRE"]');
    if (albumAnchor && albumAnchor.textContent) {
      return albumAnchor.textContent.trim();
    }
    return '';
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
   * Responds to changes in player metadata or forced blocks.
   * Performs strict duplicate prevention, logs debugs, and runs blocklist checks.
   */
  handleTrackChange(force = false) {
    console.log('[YTM Block Debug] handleTrackChange() invoked. Force:', force);
    if (!this.isContextValid()) {
      console.log('[YTM Block Debug] handleTrackChange aborted: Context is invalid.');
      return;
    }

    const artistData = this.getCurrentArtist();
    const artist = artistData.artist;
    const selectorUsed = artistData.selector;

    const title = this.getCurrentSongTitle();

    if (!title && !artist) {
      return;
    }

    if (!force && title === this.lastTrackInfo.title && artist === this.lastTrackInfo.artist) {
      return;
    }

    this.lastTrackInfo = {
      title,
      artist
    };

    const album = this.getCurrentAlbum();

    const matchResult = this.shouldSkipTrack(title, artist, album);
    
    // Debug telemetry logs matching the required parameters
    console.log('%c[YTM Block] 🔍 Skip Engine Evaluation', 'color: #8B5CF6; font-weight: bold;');
    console.log(`- Current Track:      "${title}"`);
    console.log(`- Current Artist:     "${artist || 'Unknown'}" (extracted via ${selectorUsed})`);
    console.log(`- Current Album:      "${album || 'None'}"`);
    console.log(`- Skip Decision:      ${matchResult.shouldSkip ? '🚫 SKIP' : '✅ PLAY'}`);
    
    if (matchResult.shouldSkip) {
      console.log(`- Match Reason:       "Track matches a blocked rule"`);
      console.log(`- Matched Block Rule: "${matchResult.matchedTerm}" (category: ${matchResult.matchedType})`);
      console.log(`- Skip Trigger:       "Automatic queue skip triggered"`);
      
      console.log(
        `%c[YTM Block] 🚫 BLOCKED ${matchResult.matchedType.toUpperCase()} DETECTED: "${matchResult.matchedTerm}" (type: "${matchResult.matchedType}")`, 
        'color: #FFFFFF; font-weight: bold; background-color: #EF4444; padding: 4px 8px; border-radius: 4px;'
      );
      
      const skipped = this.skipTrack();
      if (!skipped) {
        // Clear track cache so that when playback resumes or buffering completes, it evaluates again
        this.lastTrackInfo = { title: '', artist: '' };
      }
    } else {
      this.consecutiveSkips = 0;
      this.lastSkippedTrack = { title: '', artist: '' }; // Clear the last skipped track cache on successful playback
    }
  }

  /**
   * Programmatically triggers the YouTube Music next-track action.
   * Includes structural safety guards to prevent loop spams, empty queues, and pauses.
   * @returns {boolean} True if skip click was dispatched, false if suppressed.
   */
  skipTrack() {
    const title = this.lastTrackInfo.title;
    const artist = this.lastTrackInfo.artist;

    // Suppress skips only if the player is explicitly paused by the user (i.e. play button is showing and not transitioning)
    const playPauseBtn = document.querySelector('ytmusic-player-bar #play-pause-button') || 
                         document.querySelector('#play-pause-button');
    if (playPauseBtn) {
      const titleAttr = playPauseBtn.getAttribute('title') || '';
      const ariaLabel = playPauseBtn.getAttribute('aria-label') || '';
      const isPlayButtonShowing = titleAttr.toLowerCase().includes('play') || ariaLabel.toLowerCase().includes('play');
      
      // Check if we are buffering/transitioning (or if media elements aren't initialized yet)
      const media = document.querySelector('audio, video');
      const isBuffering = !media || (media.readyState < 3); // HAVE_FUTURE_DATA
      
      if (isPlayButtonShowing && !isBuffering) {
        console.log('%c[YTM Block] ⏸️ Playback is explicitly paused by user. Auto-skip suppressed.', 'color: #EAB308;');
        return false;
      }
    }

    const now = Date.now();
    if (now - this.lastClickTime < this.cooldownDuration) {
      this.isCooldownActive = true;
      console.log('%c[YTM Block] ⏳ Cooldown active (rate limit 1s). Next click suppressed.', 'color: #F59E0B;');
      return false;
    }
    this.isCooldownActive = false;

    if (title === this.lastSkippedTrack.title && artist === this.lastSkippedTrack.artist) {
      console.log('%c[YTM Block] ⚠️ Skip already attempted for this track. Suppressing spam click.', 'color: #EF4444;');
      return false;
    }

    if (this.consecutiveSkips >= this.maxConsecutiveSkips) {
      console.log('%c[YTM Block] 🚨 Loop Prevention: Max consecutive skips (5) reached. Skip locked for 8s.', 'color: #EF4444; font-weight: bold;');
      this.isCooldownActive = true;
      
      setTimeout(() => {
        this.isCooldownActive = false;
        this.consecutiveSkips = 0;
        console.log('[YTM Block] Loop protection reset. Ready.');
      }, 8000);
      
      return false;
    }

    const nextBtn = document.querySelector('ytmusic-player-bar .next-button') || 
                    document.querySelector('.next-button') || 
                    document.querySelector('#next-button');

    if (!nextBtn) {
      console.log('%c[YTM Block] ❌ Skip failed: Next button element could not be found.', 'color: #EF4444;');
      return false;
    }

    this.lastClickTime = now;
    this.lastSkippedTrack = { title, artist };
    this.consecutiveSkips++;

    nextBtn.click();
    
    console.log('%c[YTM Block] next-button clicked successfully.', 'color: #10B981;');
    return true;
  }

  /**
   * Sets up a dedicated MutationObserver targeting recommendation shelves and cards.
   * Debounces execution to prevent CPU spikes.
   */
  setupRecObserver() {
    if (!this.isContextValid()) return;

    if (this.observerLifecycle.rec) {
      this.log('debug', 'Recommendation observer already active. Skipping setup.');
      return;
    }

    const target = document.querySelector('ytmusic-app') || document.body;
    
    try {
      this.recObserver = new MutationObserver(() => {
        if (!this.initialized) return;
        
        try {
          if (this.recDebounceTimeout) {
            clearTimeout(this.recDebounceTimeout);
          }
          this.recDebounceTimeout = setTimeout(() => {
            if (!this.initialized) return;
            this.scrubRecommendations();
          }, 500);
        } catch (err) {
          this.log('error', 'Error in recommendation observer callback:', err);
        }
      });

      this.recObserver.observe(target, {
        childList: true,
        subtree: true
      });

      this.observerLifecycle.rec = true;
      this.log('debug', 'Recommendation observer successfully registered.');
      this.scrubRecommendations();
    } catch (error) {
      this.log('error', 'Failed to register recommendation observer:', error);
    }
  }

  /**
   * Scans all visible elements matching the recommendation card selectors,
   * extracts their metadata details, and suppresses blocked items layout-safely.
   */
  scrubRecommendations() {
    const selector = 'ytmusic-two-row-item-renderer, ytmusic-responsive-list-item-renderer, ytmusic-card-renderer, ytmusic-grid-single-column-item-renderer';
    const cards = document.querySelectorAll(selector);
    if (cards.length === 0) return;

    cards.forEach((card) => {
      // Bypass elements inside the player queue (handled by queue scrubber)
      if (card.tagName.toLowerCase() === 'ytmusic-player-queue-item' || card.closest('ytmusic-player-queue')) {
        return;
      }

      const artistRes = this.extractArtist(card);
      const songRes = this.extractSong(card);
      const albumRes = this.extractAlbum(card);

      const artist = artistRes ? artistRes.value : '';
      const song = songRes ? songRes.value : '';
      const album = albumRes ? albumRes.value : '';

      // Virtualization Check
      if (card.dataset.ytmRecProcessed === 'true' &&
          card.dataset.ytmRecArtist === artist &&
          card.dataset.ytmRecSong === song &&
          card.dataset.ytmRecAlbum === album) {
        return;
      }

      // Mark element as evaluated
      card.dataset.ytmRecProcessed = 'true';
      card.dataset.ytmRecArtist = artist;
      card.dataset.ytmRecSong = song;
      card.dataset.ytmRecAlbum = album;

      const matchResult = this.shouldSkipTrack(song, artist, album);
      if (matchResult.shouldSkip) {
        this.applyRecBlockOverlay(card, matchResult);
      } else {
        this.removeRecBlockOverlay(card);
      }
    });
  }

  /**
   * Applies blur styling and overlay capsule on recommendation cards.
   */
  applyRecBlockOverlay(card, matchResult) {
    card.classList.add('ytm-blocked-rec-card');
    
    let overlay = card.querySelector('.ytm-blocked-rec-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'ytm-blocked-rec-overlay';
      
      const badge = document.createElement('div');
      badge.className = 'ytm-blocked-rec-overlay-text';
      badge.textContent = 'Blocked by YTM Block';
      
      overlay.appendChild(badge);
      card.appendChild(overlay);
    }
  }

  /**
   * Restores normal styling and removes blocked overlays.
   */
  removeRecBlockOverlay(card) {
    card.classList.remove('ytm-blocked-rec-card');
    const overlay = card.querySelector('.ytm-blocked-rec-overlay');
    if (overlay) {
      overlay.remove();
    }
  }

  /**
   * Clears recommendation cache attributes, forcing a complete reload scrub.
   */
  resetRecScrubbingMarkers() {
    const selector = 'ytmusic-two-row-item-renderer, ytmusic-responsive-list-item-renderer, ytmusic-card-renderer, ytmusic-grid-single-column-item-renderer';
    const cards = document.querySelectorAll(selector);
    cards.forEach((card) => {
      card.removeAttribute('data-ytm-rec-processed');
      card.removeAttribute('data-ytm-rec-artist');
      card.removeAttribute('data-ytm-rec-song');
      card.removeAttribute('data-ytm-rec-album');
      this.removeRecBlockOverlay(card);
    });

    this.scrubRecommendations();
  }

  /**
   * Listens to SPA navigation events to trigger recalculations of the page contents.
   */
  setupNavigationListener() {
    window.addEventListener('popstate', () => {
      if (!this.isContextValid()) return;
      this.handleSPAPageTransition();
    });

    document.addEventListener('yt-navigate-finish', () => {
      if (!this.isContextValid()) return;
      this.handleSPAPageTransition();
    });
  }

  /**
   * Handles recheck and evaluation of queue items and recommendations upon SPA transitions.
   */
  handleSPAPageTransition() {
    if (!this.isContextValid()) return;
    
    console.log('[YTM Block] SPA Navigation finished. Re-scrubbing elements...');
    
    // Check if queue element has changed and requires binding
    this.checkQueueRebinding();

    // Recheck recommendation cards and queue items
    this.scrubRecommendations();
    this.scrubQueue();
  }
}

// Instantiate and initialize the controller
const ytmBlockController = new YTMBlockController();
ytmBlockController.init();
