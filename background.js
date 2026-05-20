/**
 * YTM Block - Service Worker / Background Script (Hardened Phase 7)
 * 
 * Runs in the background of Manifest V3, spawning on demand when registered events
 * are fired and terminating when idle to optimize browser resource utilization.
 * Manages the hierarchical native context menus, handles clicks, and communicates
 * with content.js to display dynamic toast alerts and support unblock triggers.
 */

// Import the shared storage helper library
importScripts('storage.js');

// Troubleshooting and logging configuration
const DEBUG = true; // Toggle for verbose debugging logs

const Logger = {
  info: (msg, ...args) => {
    console.log(`%c[YTM Block Info]%c ${msg}`, 'color: #38BDF8; font-weight: bold;', 'color: default;', ...args);
  },
  debug: (msg, ...args) => {
    if (DEBUG) {
      console.log(`%c[YTM Block Debug]%c ${msg}`, 'color: #A78BFA; font-weight: bold;', 'color: default;', ...args);
    }
  },
  warn: (msg, ...args) => {
    console.warn(`%c[YTM Block Warn]%c ${msg}`, 'color: #FBBF24; font-weight: bold;', 'color: default;', ...args);
  },
  error: (msg, ...args) => {
    console.error(`%c[YTM Block Error]%c ${msg}`, 'color: #FF1E46; font-weight: bold;', 'color: default;', ...args);
  }
};

// Diagnostics: Log startup telemetry
Logger.info(`Service worker top-level execution initialized. Wake Reason: Startup/Event Trigger. Timestamp: ${new Date().toISOString()}`);

// Start a runtime heartbeat log interval that runs as long as the service worker is awake
let heartbeatInterval = null;
function startHeartbeat() {
  if (heartbeatInterval) clearInterval(heartbeatInterval);
  heartbeatInterval = setInterval(() => {
    Logger.debug(`Heartbeat: Service worker is awake and healthy. Uptime check: ${new Date().toISOString()}`);
  }, 10000); // Heartbeat every 10 seconds
}
startHeartbeat();

// Unique IDs for the context menu items
const CONTEXT_MENU_PARENT_ID = "ytm_block_parent";
const CONTEXT_MENU_ARTIST_ID = "block_artist";
const CONTEXT_MENU_SONG_ID = "block_song";
const CONTEXT_MENU_ALBUM_ID = "block_album";

// Concurrency guard to prevent parallel initialization races
let activeInitPromise = null;

/**
 * Creates the context menus after removing any existing ones to avoid duplicate ID errors.
 */
async function createMenus() {
  Logger.debug("Clearing existing context menus...");
  try {
    await new Promise((resolve) => {
      chrome.contextMenus.removeAll(() => {
        const err = chrome.runtime.lastError;
        if (err) {
          Logger.warn("Warning during removeAll:", err.message);
        } else {
          Logger.debug("All existing context menus removed successfully.");
        }
        resolve();
      });
    });

    Logger.debug("Registering context menus...");

    // Create the parent menu
    await new Promise((resolve) => {
      chrome.contextMenus.create({
        id: CONTEXT_MENU_PARENT_ID,
        title: "YTM Block",
        contexts: ["page", "link"],
        documentUrlPatterns: ["https://music.youtube.com/*"]
      }, () => {
        const err = chrome.runtime.lastError;
        if (err) {
          Logger.error("Failed to create parent menu:", err.message);
        } else {
          Logger.debug("Parent menu created.");
        }
        resolve();
      });
    });

    // Create child menus (initially visible by default with generic titles)
    const childMenus = [
      { id: CONTEXT_MENU_ARTIST_ID, title: "Block Artist" },
      { id: CONTEXT_MENU_SONG_ID, title: "Block Song" },
      { id: CONTEXT_MENU_ALBUM_ID, title: "Block Album" }
    ];

    for (const menu of childMenus) {
      await new Promise((resolve) => {
        chrome.contextMenus.create({
          id: menu.id,
          parentId: CONTEXT_MENU_PARENT_ID,
          title: menu.title,
          contexts: ["page", "link"],
          documentUrlPatterns: ["https://music.youtube.com/*"]
        }, () => {
          const err = chrome.runtime.lastError;
          if (err) {
            Logger.error(`Failed to create child menu ${menu.id}:`, err.message);
          } else {
            Logger.debug(`Child menu ${menu.id} created.`);
          }
          resolve();
        });
      });
    }

    Logger.info("All context menus registered successfully.");
  } catch (error) {
    Logger.error("Critical error during context menu creation:", error);
  }
}

/**
 * Verifies that the context menus actually exist in Chrome's registry.
 * If verification fails, it recreates them.
 */
async function verifyMenus() {
  return new Promise((resolve) => {
    Logger.debug("Verifying context menu registry...");
    chrome.contextMenus.update(CONTEXT_MENU_PARENT_ID, {}, () => {
      const err = chrome.runtime.lastError;
      if (err) {
        Logger.warn("Menu verification failed, recreating menus. Error:", err.message);
        createMenus().then(resolve);
      } else {
        Logger.debug("Menu verification succeeded: parent menu exists.");
        resolve();
      }
    });
  });
}

/**
 * Concurrency-guarded menu initialization pipeline.
 */
async function safeInitializeMenus() {
  if (activeInitPromise) {
    Logger.debug("Menu initialization already in progress. Awaiting existing promise...");
    return activeInitPromise;
  }
  activeInitPromise = createMenus();
  try {
    await activeInitPromise;
  } finally {
    activeInitPromise = null;
  }
}

/**
 * Centralized extension startup and verification logic.
 */
async function initializeExtension() {
  Logger.info("Starting centralized initializeExtension...");
  try {
    await safeInitializeMenus();
    await verifyMenus();
    Logger.info("Centralized initializeExtension completed.");
  } catch (error) {
    Logger.error("Fatal error during initializeExtension:", error);
  }
}

// ==========================================
// RUNTIME LIFECYCLE LISTENERS
// ==========================================

// 1. Initialize on extension install or update
chrome.runtime.onInstalled.addListener((details) => {
  Logger.info(`onInstalled event fired (Reason: ${details.reason}). Initializing extension...`);
  initializeExtension();
});

// 2. Initialize on browser startup
chrome.runtime.onStartup.addListener(() => {
  Logger.info("onStartup event fired. Initializing extension...");
  initializeExtension();
});

// 3. Initialize on Service Worker activation
self.addEventListener('activate', (event) => {
  Logger.info("Service worker 'activate' event fired. Ensuring extension is initialized...");
  event.waitUntil(initializeExtension());
});

// 4. Initialize immediately on top-level script evaluation (covers wakeup from suspension)
initializeExtension();

// ==========================================
// ERROR BOUNDARY WRAPPERS & EVENT HANDLERS
// ==========================================

/**
 * Wraps a listener callback with a try/catch error boundary to avoid service worker crashes.
 */
function safeEventListener(listenerName, callback) {
  return (...args) => {
    Logger.debug(`Event received: ${listenerName}`);
    try {
      const result = callback(...args);
      if (result instanceof Promise) {
        result.catch(err => {
          Logger.error(`Error in async handler for ${listenerName}:`, err);
        });
      }
      return result;
    } catch (err) {
      Logger.error(`Error in listener ${listenerName}:`, err);
    }
  };
}

// Listen for clicks on context menu items
chrome.contextMenus.onClicked.addListener(safeEventListener('contextMenus.onClicked', async (info, tab) => {
  Logger.info(`Context menu clicked: id="${info.menuItemId}" on tabId=${tab ? tab.id : 'unknown'}`);
  if (!tab) return;

  try {
    // 1. Attempt to query content script for the freshest context
    const context = await new Promise((resolve) => {
      chrome.tabs.sendMessage(tab.id, { action: "getCurrentTrack" }, (response) => {
        const err = chrome.runtime.lastError;
        if (err || !response) {
          Logger.warn("Content script unresponsive or did not return context. Falling back to local storage.", err ? err.message : "");
          resolve(null);
        } else {
          resolve({
            artist: response.rightClickedArtist || response.artist,
            song: response.rightClickedSong || response.song,
            album: response.rightClickedAlbum || response.album
          });
        }
      });
    });

    let ctx = context;
    if (!ctx) {
      // 2. Fall back to local storage if content script didn't respond
      const result = await chrome.storage.local.get(['lastRightClickedContext']);
      ctx = result.lastRightClickedContext;
    }

    if (!ctx) {
      Logger.warn("No context found (either from tab message or storage fallback).");
      chrome.tabs.sendMessage(tab.id, { action: "showToast", status: "failed", type: "artist" });
      return;
    }

    let type = null;
    let value = null;

    if (info.menuItemId === CONTEXT_MENU_ARTIST_ID) {
      type = 'artist';
      value = ctx.artist;
    } else if (info.menuItemId === CONTEXT_MENU_SONG_ID) {
      type = 'song';
      value = ctx.song;
    } else if (info.menuItemId === CONTEXT_MENU_ALBUM_ID) {
      type = 'album';
      value = ctx.album;
    }

    if (!type || !value) {
      Logger.warn(`Clicked ${info.menuItemId} but could not resolve value in context.`, JSON.stringify(ctx));
      chrome.tabs.sendMessage(tab.id, { action: "showToast", status: "failed", type: type || 'artist' });
      return;
    }

    // Check if it is currently blocked to toggle between block and unblock
    const blockData = await getBlockData();
    const storageKey = STORAGE_KEYS[type];
    const isBlocked = blockData[storageKey].includes(value.trim().toLowerCase());

    if (isBlocked) {
      await handleUnblockAction(tab.id, type, value);
    } else {
      await handleBlockAction(tab.id, type, value);
    }
  } catch (err) {
    Logger.error("Error processing context menu click:", err);
  }
}));

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener(safeEventListener('runtime.onMessage', (request, sender, sendResponse) => {
  if (!request) return false;

  // Heartbeat logging to monitor runtime connection health
  if (request.action === 'heartbeat') {
    Logger.debug(`Heartbeat received from tab: ${sender.tab ? sender.tab.id : 'unknown'}`);
    sendResponse({ status: 'alive', timestamp: Date.now() });
    return true;
  }

  if (request.action === 'rightClickContext') {
    const ctx = request.context;
    Logger.debug("Received right-click context message:", JSON.stringify(ctx));
    // Persist context to local storage to be safe during worker suspension
    chrome.storage.local.set({ lastRightClickedContext: ctx }, () => {
      updateNativeMenus(ctx);
    });
  }
  return true;
}));

/**
 * Dynamically updates the titles and visibility of hierarchical context menu options
 * based on the music entity context resolved under the right-click.
 * @param {Object} ctx - The music entity context (artist, song, album).
 */
async function updateNativeMenus(ctx) {
  try {
    Logger.debug("Updating context menus with context:", JSON.stringify(ctx));
    const blockData = await getBlockData();
    
    const hasArtist = !!(ctx && ctx.artist);
    const hasSong = !!(ctx && ctx.song);
    const hasAlbum = !!(ctx && ctx.album);

    const artistName = hasArtist ? ctx.artist.trim() : "";
    const songName = hasSong ? ctx.song.trim() : "";
    const albumName = hasAlbum ? ctx.album.trim() : "";

    const isArtistBlocked = hasArtist && blockData.blockedArtists.includes(artistName.toLowerCase());
    const isSongBlocked = hasSong && blockData.blockedSongs.includes(songName.toLowerCase());
    const isAlbumBlocked = hasAlbum && blockData.blockedAlbums.includes(albumName.toLowerCase());

    // Update Artist Menu Item
    let artistTitle = "Block Artist";
    if (hasArtist) {
      artistTitle = isArtistBlocked ? `Unblock Artist "${artistName}"` : `Block Artist "${artistName}"`;
    }
    chrome.contextMenus.update(CONTEXT_MENU_ARTIST_ID, {
      title: artistTitle,
      visible: hasArtist
    }, () => {
      const err = chrome.runtime.lastError;
      if (err) {
        Logger.warn("Error updating artist menu:", err.message);
        if (err.message.includes("Cannot find menu item") || err.message.includes("does not exist")) {
          Logger.info("Menu items missing during update. Re-initializing...");
          safeInitializeMenus();
        }
      }
    });

    // Update Song Menu Item
    let songTitle = "Block Song";
    if (hasSong) {
      songTitle = isSongBlocked ? `Unblock Song "${songName}"` : `Block Song "${songName}"`;
    }
    chrome.contextMenus.update(CONTEXT_MENU_SONG_ID, {
      title: songTitle,
      visible: hasSong
    }, () => {
      const err = chrome.runtime.lastError;
      if (err) Logger.warn("Error updating song menu:", err.message);
    });

    // Update Album Menu Item
    let albumTitle = "Block Album";
    if (hasAlbum) {
      albumTitle = isAlbumBlocked ? `Unblock Album "${albumName}"` : `Block Album "${albumName}"`;
    }
    chrome.contextMenus.update(CONTEXT_MENU_ALBUM_ID, {
      title: albumTitle,
      visible: hasAlbum
    }, () => {
      const err = chrome.runtime.lastError;
      if (err) Logger.warn("Error updating album menu:", err.message);
    });

    const parentVisible = hasArtist || hasSong || hasAlbum;
    chrome.contextMenus.update(CONTEXT_MENU_PARENT_ID, {
      visible: parentVisible
    }, () => {
      const err = chrome.runtime.lastError;
      if (err) Logger.warn("Error updating parent menu visibility:", err.message);
    });
  } catch (error) {
    Logger.error("Error in updateNativeMenus:", error);
  }
}

/**
 * Normalizes, validates, and adds a new item to the chrome.storage.sync blocklist.
 * @param {number} tabId - Active YouTube Music tab window ID.
 * @param {('artist'|'song'|'album')} type - The block category.
 * @param {string} value - Raw item value.
 */
async function handleBlockAction(tabId, type, value) {
  Logger.info(`Attempting to block ${type}: "${value}"`);
  try {
    const result = await addBlockedItem(type, value);
    if (!result.success) {
      if (result.status === 'already_blocked') {
        Logger.info(`${type} "${value}" is already blocked.`);
        chrome.tabs.sendMessage(tabId, { 
          action: "showToast", 
          status: "already_blocked", 
          name: value,
          type: type
        });
      } else {
        chrome.tabs.sendMessage(tabId, { action: "showToast", status: "failed", type: type });
      }
      return;
    }

    Logger.info(`Successfully blocked ${type}: "${value}"`);
    chrome.tabs.sendMessage(tabId, { 
      action: "showToast", 
      status: "blocked", 
      name: value,
      type: type
    });
  } catch (err) {
    Logger.error(`Failed to block ${type} "${value}":`, err);
    chrome.tabs.sendMessage(tabId, { action: "showToast", status: "failed", type: type });
  }
}

/**
 * Normalizes, validates, and removes an item from the chrome.storage.sync blocklist.
 * @param {number} tabId - Active YouTube Music tab window ID.
 * @param {('artist'|'song'|'album')} type - The block category.
 * @param {string} value - Raw item value.
 */
async function handleUnblockAction(tabId, type, value) {
  Logger.info(`Attempting to unblock ${type}: "${value}"`);
  try {
    const result = await removeBlockedItem(type, value);
    if (!result.success) {
      Logger.warn(`${type} "${value}" is not blocked.`);
      chrome.tabs.sendMessage(tabId, { action: "showToast", status: "failed", type: type });
      return;
    }

    Logger.info(`Successfully unblocked ${type}: "${value}"`);
    chrome.tabs.sendMessage(tabId, { 
      action: "showToast", 
      status: "unblocked", 
      name: value,
      type: type
    });
  } catch (err) {
    Logger.error(`Failed to unblock ${type} "${value}":`, err);
    chrome.tabs.sendMessage(tabId, { action: "showToast", status: "failed", type: type });
  }
}
