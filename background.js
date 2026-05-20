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

// Register context menus on installation/service worker startup
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: CONTEXT_MENU_PARENT_ID,
    title: "YTM Block",
    contexts: ["page", "link"], // Show on page background, text, and link selections
    documentUrlPatterns: ["https://music.youtube.com/*"] // Restrict strictly to YouTube Music URLs
  });

  chrome.contextMenus.create({
    id: CONTEXT_MENU_ARTIST_ID,
    parentId: CONTEXT_MENU_PARENT_ID,
    title: "Block Artist",
    contexts: ["page", "link"],
    documentUrlPatterns: ["https://music.youtube.com/*"],
    visible: false
  });

  chrome.contextMenus.create({
    id: CONTEXT_MENU_SONG_ID,
    parentId: CONTEXT_MENU_PARENT_ID,
    title: "Block Song",
    contexts: ["page", "link"],
    documentUrlPatterns: ["https://music.youtube.com/*"],
    visible: false
  });

  chrome.contextMenus.create({
    id: CONTEXT_MENU_ALBUM_ID,
    parentId: CONTEXT_MENU_PARENT_ID,
    title: "Block Album",
    contexts: ["page", "link"],
    documentUrlPatterns: ["https://music.youtube.com/*"],
    visible: false
  });

  console.log("[YTM Block Background] Context menus registered.");
});

// Listen for clicks on context menu items
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab) return;

  chrome.storage.local.get(['lastRightClickedContext'], (result) => {
    const ctx = result.lastRightClickedContext;
    if (!ctx) {
      console.warn("[YTM Block Background] No cached context found in storage.");
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

    if (type && value) {
      addBlockedItemToStorage(tab.id, type, value);
    }
  });
});

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'rightClickContext') {
    const ctx = request.context;
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
function updateNativeMenus(ctx) {
  const hasArtist = !!(ctx && ctx.artist);
  const hasSong = !!(ctx && ctx.song);
  const hasAlbum = !!(ctx && ctx.album);

  chrome.contextMenus.update(CONTEXT_MENU_ARTIST_ID, {
    title: hasArtist ? `Block Artist "${ctx.artist}"` : "Block Artist",
    visible: hasArtist
  });

  chrome.contextMenus.update(CONTEXT_MENU_SONG_ID, {
    title: hasSong ? `Block Song "${ctx.song}"` : "Block Song",
    visible: hasSong
  });

  chrome.contextMenus.update(CONTEXT_MENU_ALBUM_ID, {
    title: hasAlbum ? `Block Album "${ctx.album}"` : "Block Album",
    visible: hasAlbum
  });

  const parentVisible = hasArtist || hasSong || hasAlbum;
  chrome.contextMenus.update(CONTEXT_MENU_PARENT_ID, {
    visible: parentVisible
  });
}

/**
 * Normalizes, validates, and adds a new item to the chrome.storage.sync blocklist.
 * @param {number} tabId - Active YouTube Music tab window ID.
 * @param {('artist'|'song'|'album')} type - The block category.
 * @param {string} value - Raw item value.
 */
function addBlockedItemToStorage(tabId, type, value) {
  addBlockedItem(type, value).then((result) => {
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
    // Dispatch success toast message
    chrome.tabs.sendMessage(tabId, { 
      action: "showToast", 
      status: "blocked", 
      name: value,
      type: type
    });
  });
}
