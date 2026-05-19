/**
 * YTM Block - Content Script (Phase 5: Queue Scrubbing & Auto-Skipping)
 * 
 * Injected automatically on music.youtube.com at document_idle.
 * Monitors track transitions via a MutationObserver and automatically skips tracks 
 * by blocked artists. Also actively scrubs the "Up Next" queue, visually dimming 
 * and crossing out blocked tracks to prevent accidental clicks and improve queue visibility.
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
    
    console.log('%c[YTM Block]%c Extension active. Phase 5 Queue Scrubber is disarmed.', 'color: #FF0033; font-weight: bold;', 'color: default;');
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

      // 3. Inject custom CSS styles for the blocked queue elements
      this.injectCustomStyles();

      // 4. Setup the DOM MutationObserver to detect track switches
      this.setupObserver();

      // 5. Set up message port listener to communicate with the popup
      this.setupMessageListener();

      // 6. Setup the secondary MutationObserver dedicated to the Up Next Queue
      this.setupQueueObserver();

    } catch (error) {
      console.error('[YTM Block] Initialization failed:', error);
    }
  }

  /**
   * Inject visual styling rules to handle blocked queue elements beautifully.
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
    `;
    document.head.appendChild(style);
  }

  /**
   * Asynchronously retrieves the latest blocklist from chrome.storage.sync.
   * @returns {Promise<Array>} List of lowercased, trimmed blocked artist names.
   */
  async getBlocklist() {
    return new Promise((resolve) => {
      chrome.storage.sync.get({ blockedArtists: [] }, (result) => {
        this.blockedArtists = result.blockedArtists || [];
        resolve(this.blockedArtists);
      });
    });
  }

  /**
   * Synchronizes storage changes instantly when the blocklist is altered.
   */
  setupStorageListener() {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'sync' && changes.blockedArtists) {
        this.blockedArtists = changes.blockedArtists.newValue || [];
        console.log(
          `%c[YTM Block]%c Blocklist updated. Re-scrubbing queue...`,
          'color: #FF0033; font-weight: bold;', 'color: default;'
        );
        
        // Force the queue scrubber to re-evaluate the entire list under the new blocklist parameters
        this.resetQueueScrubbingMarkers();

        // Re-evaluate the current track immediately
        this.handleTrackChange();
      }
    });
  }

  /**
   * Sets up a message listener to respond to real-time track metadata inquiries from the popup.
   */
  setupMessageListener() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === 'getCurrentTrack') {
        const artistData = this.getCurrentArtist();
        const title = this.getCurrentSongTitle();
        const isPlaying = this.isPlaybackActive();
        
        sendResponse({
          artist: artistData.artist,
          title: title,
          isPlaying: isPlaying
        });
      }
      return true; // Keep message channel open for asynchronous responses
    });
  }

  /**
   * Sets up a MutationObserver targeting the root 'ytmusic-app' element.
   * Uses a robust debounce window to let DOM updates settle before track parsing.
   */
  setupObserver() {
    console.log('[YTM Block] Initializing DOM MutationObserver on ytmusic-app...');

    const target = document.querySelector('ytmusic-app');
    if (!target) {
      console.warn('[YTM Block] ytmusic-app not found in DOM yet. Retrying in 1 second...');
      setTimeout(() => this.setupObserver(), 1000);
      return;
    }

    this.observer = new MutationObserver(() => {
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

    console.log('[YTM Block] MutationObserver is active and listening for track switches.');
  }

  /**
   * SECONDARY OBSERVER: Sets up a dedicated MutationObserver on the queue list.
   * Runs lightweight polling initially to bind once the queue element is attached.
   */
  setupQueueObserver() {
    console.log('[YTM Block] Initializing Up Next Queue Scrubber observer...');

    const queue = document.querySelector('ytmusic-player-queue');
    if (!queue) {
      // The queue element is usually instantiated dynamically on active playback.
      // Poll dynamically to capture and bind once present.
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
    console.log('[YTM Block] Queue container found. Binding MutationObserver...');

    this.queueObserver = new MutationObserver(() => {
      // Debounce queue modifications (400ms) to ensure scrubbing is exceptionally lightweight
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

    // Run an initial scrub to catch items pre-populated inside the DOM
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
      // --- DUAL LAYER PERFORMANCE GUARD ---
      // Skip item if it has already been processed to save DOM performance.
      // Utilizing both WeakSet (memory reference) and HTML dataset markers (DOM attribute)
      // provides complete protection across dynamic virtual scroll lists.
      if (this.processedQueueItems.has(item) && item.dataset.ytmProcessed === 'true') {
        return;
      }

      // Mark item as processed
      this.processedQueueItems.add(item);
      item.dataset.ytmProcessed = 'true';
      processedCount++;

      // Extract artist from the queue item
      const artist = this.getQueueItemArtist(item);
      if (!artist) return;

      // Evaluate against the blocklist
      const matchResult = this.shouldSkipArtist(artist);
      if (matchResult.shouldSkip) {
        // Dim the queue item and restrict clicks
        item.classList.add('ytm-blocked-queue-item');
        blockedCount++;
      }
    });

    if (processedCount > 0 || blockedCount > 0) {
      console.log(`[YTM Block Scrubber] Processed ${processedCount} items. Marked ${blockedCount} blocked track(s).`);
    }
  }

  /**
   * Extracts the artist name from a queue item element using multiple stable selectors.
   * @param {HTMLElement} item - Single queue list item element.
   * @returns {string} Trimmed artist name.
   */
  getQueueItemArtist(item) {
    // Selector 1: Stable byline class inside queue element
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

    // Selector 2: Anchor links inside byline (usually points to artist profiles)
    const anchor = item.querySelector('a');
    if (anchor && anchor.textContent && anchor.textContent.trim()) {
      return anchor.textContent.trim();
    }

    // Selector 3: Generic secondary metadata label
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

    // Run active scrub immediately
    this.scrubQueue();
  }

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
    
    // Check for a case-insensitive partial match
    // e.g. blocked "drake" matches current playing "Drake ft. Future"
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
    // 1. Primary Check: browser MediaSession playback status
    if (navigator.mediaSession && navigator.mediaSession.playbackState) {
      if (navigator.mediaSession.playbackState === 'playing') return true;
      if (navigator.mediaSession.playbackState === 'paused') return false;
    }

    // 2. Secondary Check: DOM inspection of the primary play/pause button state
    const playPauseBtn = document.querySelector('ytmusic-player-bar #play-pause-button') || 
                         document.querySelector('#play-pause-button');
    if (playPauseBtn) {
      const title = playPauseBtn.getAttribute('title') || '';
      const ariaLabel = playPauseBtn.getAttribute('aria-label') || '';
      // If active, the button represents the action "Pause" (clicking it pauses)
      if (title.toLowerCase().includes('pause') || ariaLabel.toLowerCase().includes('pause')) {
        return true;
      }
    }

    // 3. Fallback: inspect raw audio/video elements on the page
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
    // 1. Force retrieval of blocklist from async storage before matching
    await this.getBlocklist();

    // 2. Gather current track metadata
    const artistData = this.getCurrentArtist();
    const artist = artistData.artist;
    const selectorUsed = artistData.selector;

    const title = this.getCurrentSongTitle();

    // 3. Skip if player is idle/loading (empty metadata)
    if (!title && !artist) {
      return;
    }

    // 4. DUPLICATE PREVENTION:
    // Check if the captured song is exactly the same as our previous check.
    // Exit silently to prevent duplicated logs from rapid sub-tree mutations.
    if (title === this.lastTrackInfo.title && artist === this.lastTrackInfo.artist) {
      return;
    }

    // 5. Update active track cache
    this.lastTrackInfo = {
      title,
      artist
    };

    // 6. Print track change details
    console.log('%c[YTM Block] 🎵 Track Changed!', 'color: #38BDF8; font-weight: bold;');
    console.log(`%cSong:   %c"${title}"`, 'font-weight: bold; color: #FFFFFF;', 'color: #38BDF8;');
    console.log(`%cArtist: %c"${artist || 'Unknown'}"`, 'font-weight: bold; color: #FFFFFF;', 'color: #F43F5E;');
    console.log(`%cSource: %c"${selectorUsed}"`, 'font-weight: bold; color: #FFFFFF;', 'color: #A1A1AA;');

    // 7. Check if artist is blocked
    const matchResult = this.shouldSkipArtist(artist);
    console.log(`[YTM Block] Match result: shouldSkip=${matchResult.shouldSkip}, matchedTerm="${matchResult.matchedTerm || 'none'}"`);

    if (matchResult.shouldSkip) {
      console.log(
        `%c[YTM Block] 🚫 BLOCKED ARTIST DETECTED: "${artist}" (matches: "${matchResult.matchedTerm}")`, 
        'color: #FFFFFF; font-weight: bold; background-color: #EF4444; padding: 4px 8px; border-radius: 4px;'
      );
      
      // Execute the skip
      this.skipTrack();
    } else {
      // Safely reset consecutive skips on transitioning to an unblocked song
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

    // --- GUARD 1: Active Playback Check ---
    // Do not skip if the music is paused. Doing so ruins the user's focus if they paused
    // the player themselves, and prevents skips when a queue ends and playback naturally stops.
    const active = this.isPlaybackActive();
    if (!active) {
      console.log('%c[YTM Block] ⏸️ Playback is paused/inactive. Skip suppressed.', 'color: #EAB308;');
      return;
    }

    // --- GUARD 2: Click Cooldown (Rate Limiting) ---
    // Prevent physical button clicks from firing within 1 second of each other.
    const now = Date.now();
    if (now - this.lastClickTime < this.cooldownDuration) {
      this.isCooldownActive = true;
      console.log('%c[YTM Block] ⏳ Cooldown active (rate limit 1s). Next click suppressed.', 'color: #F59E0B;');
      return;
    }
    this.isCooldownActive = false;

    // --- GUARD 3: Stuck DOM/Already Skipped Check ---
    // If the active track matches our last skipped track, it means the DOM has not finished
    // transitioning or loading the next song yet, or the next button click failed to register.
    // Suppress repeated clicks to prevent browser freezing.
    if (title === this.lastSkippedTrack.title && artist === this.lastSkippedTrack.artist) {
      console.log('%c[YTM Block] ⚠️ Skip already attempted for this track. Suppressing spam click.', 'color: #EF4444;');
      return;
    }

    // --- GUARD 4: Infinite Loop Protection (Max Consecutive Skips) ---
    // If 5 blocked tracks are hit in a row, we shut down skipping for 8 seconds.
    // This protects against endless skipped lists, empty playlist ends, or buffering loops.
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

    // Locate Next Button
    const nextBtn = document.querySelector('ytmusic-player-bar .next-button') || 
                    document.querySelector('.next-button') || 
                    document.querySelector('#next-button');

    if (!nextBtn) {
      console.error('[YTM Block] Error: Next button not found in DOM.');
      return;
    }

    // Perform Auto-Skip
    console.log(`%c[YTM Block] ⏩ TRIGGERING AUTO-SKIP: Skipping "${title}" by "${artist}"...`, 'color: #10B981; font-weight: bold;');
    
    // Update attempt states
    this.lastClickTime = now;
    this.lastSkippedTrack = { title, artist };
    this.consecutiveSkips++;

    // Click Next Button programmatically
    nextBtn.click();
    
    console.log('%c[YTM Block] next-button clicked successfully.', 'color: #10B981;');
  }
}

// Instantiate and initialize the controller
const ytmBlockController = new YTMBlockController();
ytmBlockController.init();
