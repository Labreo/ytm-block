/**
 * YTM Block - Service Worker / Background Script (Phase 7: Context Menus & Dynamic Toasts)
 * 
 * Runs in the background of Manifest V3, spawning on demand when registered events
 * are fired and terminating when idle to optimize browser resource utilization.
 * Manages the hierarchical native context menus, handles clicks, and communicates
 * with content.js to display dynamic toast alerts and support unblock triggers.
 */

// Import the shared storage helper library
importScripts('storage.js');

// Unique IDs for the context menu items
const CONTEXT_MENU_PARENT_ID = "ytm_block_parent";
const CONTEXT_MENU_ARTIST_ID = "block_artist";
const CONTEXT_MENU_SONG_ID = "block_song";
const CONTEXT_MENU_ALBUM_ID = "block_album";

console.log("[YTM Block Background] Service worker evaluated/restarted.");

/**
 * Creates the context menus after removing any existing ones to avoid duplicate ID errors.
 */
async function createMenus() {
  console.log("[YTM Block Background] Clearing existing context menus...");
  try {
    await new Promise((resolve) => {
      chrome.contextMenus.removeAll(() => {
        const err = chrome.runtime.lastError;
        if (err) {
          console.warn("[YTM Block Background] Warning during removeAll:", err.message);
        } else {
          console.log("[YTM Block Background] All context menus removed.");
        }
        resolve();
      });
    });

    console.log("[YTM Block Background] Registering context menus...");

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
          console.error("[YTM Block Background] Failed to create parent menu:", err.message);
        } else {
          console.log("[YTM Block Background] Parent menu created.");
        }
        resolve();
      });
    });

    // Create child menus (make them visible by default with generic titles)
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
            console.error(`[YTM Block Background] Failed to create child menu ${menu.id}:`, err.message);
          } else {
            console.log(`[YTM Block Background] Child menu ${menu.id} created.`);
          }
          resolve();
        });
      });
    }

    console.log("[YTM Block Background] All context menus initialized successfully.");
  } catch (error) {
    console.error("[YTM Block Background] Critical error during context menu creation:", error);
  }
}

// Concurrency guard to prevent parallel initialization races
let activeInitPromise = null;
async function safeInitializeMenus() {
  if (activeInitPromise) {
    console.log("[YTM Block Background] Menu initialization already in progress. Awaiting existing promise...");
    return activeInitPromise;
  }
  activeInitPromise = createMenus();
  try {
    await activeInitPromise;
  } finally {
    activeInitPromise = null;
  }
}

// 1. Initialize on extension install or update
chrome.runtime.onInstalled.addListener((details) => {
  console.log(`[YTM Block Background] Extension installed/updated (Reason: ${details.reason}). Initializing menus.`);
  safeInitializeMenus();
});

// 2. Initialize on browser startup
chrome.runtime.onStartup.addListener(() => {
  console.log("[YTM Block Background] Browser startup. Initializing menus.");
  safeInitializeMenus();
});

// 3. Initialize on Service Worker activation
self.addEventListener('activate', (event) => {
  console.log("[YTM Block Background] Service worker activated. Initializing menus.");
  event.waitUntil(safeInitializeMenus());
});

// 4. Initialize immediately on top-level script evaluation (covers wakeup from suspension)
safeInitializeMenus();

// Listen for clicks on context menu items
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  console.log(`[YTM Block Background] Context menu clicked: id="${info.menuItemId}" on tabId=${tab ? tab.id : 'unknown'}`);
  if (!tab) return;

  try {
    // 1. Attempt to query content script for the freshest context
    const context = await new Promise((resolve) => {
      chrome.tabs.sendMessage(tab.id, { action: "getCurrentTrack" }, (response) => {
        const err = chrome.runtime.lastError;
        if (err || !response) {
          console.warn("[YTM Block Background] Content script unresponsive or did not return context. Falling back to local storage.", err ? err.message : "");
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
      console.warn("[YTM Block Background] No context found (either from tab message or storage fallback).");
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
      console.warn(`[YTM Block Background] Clicked ${info.menuItemId} but could not resolve value in context.`, JSON.stringify(ctx));
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
    console.error("[YTM Block Background] Error processing context menu click:", err);
  }
});

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'rightClickContext') {
    const ctx = request.context;
    console.log("[YTM Block Background] Received right-click context message:", JSON.stringify(ctx));
    // Persist context to local storage to be safe during worker suspension
    chrome.storage.local.set({ lastRightClickedContext: ctx }, () => {
      updateNativeMenus(ctx);
    });
  }
  return true;
});

/**
 * Dynamically updates the titles and visibility of hierarchical context menu options
 * based on the music entity context resolved under the right-click.
 * @param {Object} ctx - The music entity context (artist, song, album).
 */
async function updateNativeMenus(ctx) {
  try {
    console.log("[YTM Block Background] Updating context menus with context:", JSON.stringify(ctx));
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
        console.warn("[YTM Block Background] Error updating artist menu:", err.message);
        if (err.message.includes("Cannot find menu item") || err.message.includes("does not exist")) {
          console.log("[YTM Block Background] Menu items missing. Re-initializing...");
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
      if (err) console.warn("[YTM Block Background] Error updating song menu:", err.message);
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
      if (err) console.warn("[YTM Block Background] Error updating album menu:", err.message);
    });

    const parentVisible = hasArtist || hasSong || hasAlbum;
    chrome.contextMenus.update(CONTEXT_MENU_PARENT_ID, {
      visible: parentVisible
    }, () => {
      const err = chrome.runtime.lastError;
      if (err) console.warn("[YTM Block Background] Error updating parent menu visibility:", err.message);
    });
  } catch (error) {
    console.error("[YTM Block Background] Error in updateNativeMenus:", error);
  }
}

/**
 * Normalizes, validates, and adds a new item to the chrome.storage.sync blocklist.
 * @param {number} tabId - Active YouTube Music tab window ID.
 * @param {('artist'|'song'|'album')} type - The block category.
 * @param {string} value - Raw item value.
 */
async function handleBlockAction(tabId, type, value) {
  console.log(`[YTM Block Background] Blocking ${type}: "${value}"`);
  try {
    const result = await addBlockedItem(type, value);
    if (!result.success) {
      if (result.status === 'already_blocked') {
        console.log(`[YTM Block Background] ${type} "${value}" is already blocked.`);
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

    console.log(`[YTM Block Background] Successfully blocked ${type}: "${value}"`);
    chrome.tabs.sendMessage(tabId, { 
      action: "showToast", 
      status: "blocked", 
      name: value,
      type: type
    });
  } catch (err) {
    console.error(`[YTM Block Background] Failed to block ${type} "${value}":`, err);
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
  console.log(`[YTM Block Background] Unblocking ${type}: "${value}"`);
  try {
    const result = await removeBlockedItem(type, value);
    if (!result.success) {
      console.warn(`[YTM Block Background] ${type} "${value}" is not blocked.`);
      chrome.tabs.sendMessage(tabId, { action: "showToast", status: "failed", type: type });
      return;
    }

    console.log(`[YTM Block Background] Successfully unblocked ${type}: "${value}"`);
    chrome.tabs.sendMessage(tabId, { 
      action: "showToast", 
      status: "unblocked", 
      name: value,
      type: type
    });
  } catch (err) {
    console.error(`[YTM Block Background] Failed to unblock ${type} "${value}":`, err);
    chrome.tabs.sendMessage(tabId, { action: "showToast", status: "failed", type: type });
  }
}
