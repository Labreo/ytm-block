/**
 * YTM Block - Service Worker / Background Script (Phase 7: Context Menus & Dynamic Toasts)
 * 
 * Runs in the background of Manifest V3, spawning on demand when registered events
 * are fired and terminating when idle to optimize browser resource utilization.
 * Manages the custom context menu, queries the active tab's content script to retrieve
 * either the targeted right-clicked artist or the playing artist, and writes to sync storage.
 * Dispatching clear, explicit showToast messages back to the content script for success, 
 * duplicate, or failure states.
 */

// Unique ID for the context menu item
const CONTEXT_MENU_ID = "block_artist_context_menu";

// Register context menu on installation/service worker startup
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: CONTEXT_MENU_ID,
    title: "Block Artist with YTM Block",
    contexts: ["page", "link"], // Show on page background, text, and link selections
    documentUrlPatterns: ["https://music.youtube.com/*"] // Restrict strictly to YouTube Music URLs
  });
  console.log("[YTM Block Background] Context menu registered.");
});

// Listen for clicks on the context menu item
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === CONTEXT_MENU_ID && tab) {
    handleBlockArtistAction(tab);
  }
});

/**
 * Communicates with the content script in the active tab to retrieve 
 * either the right-clicked artist (context-aware) or the playing artist (fallback).
 * @param {chrome.tabs.Tab} tab - Active YouTube Music tab object.
 */
function handleBlockArtistAction(tab) {
  // Query the content script for the active track info and right-click cache
  chrome.tabs.sendMessage(tab.id, { action: "getCurrentTrack" }, (response) => {
    // Check for runtime connection errors (e.g. content script not loaded on page)
    if (chrome.runtime.lastError || !response) {
      console.warn("[YTM Block Background] Could not retrieve active track/artist response from page.");
      // Dispatch failed toast message
      chrome.tabs.sendMessage(tab.id, { action: "showToast", status: "failed" });
      return;
    }

    // Context-Aware Block: Prioritize right-clicked artist, falling back to playing artist
    const artistToBlock = response.rightClickedArtist || response.artist;
    
    if (artistToBlock) {
      addArtistToBlocklist(tab.id, artistToBlock);
    } else {
      console.warn("[YTM Block Background] No context-clicked or playing artist detected.");
      chrome.tabs.sendMessage(tab.id, { action: "showToast", status: "failed" });
    }
  });
}

/**
 * Normalizes, validates, and adds a new artist to the chrome.storage.sync blocklist.
 * @param {number} tabId - Active YouTube Music tab window ID.
 * @param {string} artistName - Raw artist name.
 */
function addArtistToBlocklist(tabId, artistName) {
  const normalizedArtist = artistName.trim().toLowerCase();
  if (!normalizedArtist) return;

  chrome.storage.sync.get({ blockedArtists: [] }, (result) => {
    const list = result.blockedArtists || [];
    
    // Prevent duplicate entries - Dispatch duplicate warning toast
    if (list.includes(normalizedArtist)) {
      console.log(`[YTM Block Background] "${artistName}" is already blocked.`);
      chrome.tabs.sendMessage(tabId, { 
        action: "showToast", 
        status: "already_blocked", 
        artist: artistName 
      });
      return;
    }

    list.push(normalizedArtist);
    list.sort(); // Keep sorted alphabetically

    chrome.storage.sync.set({ blockedArtists: list }, () => {
      if (chrome.runtime.lastError) {
        console.error("[YTM Block Background] Failed to save blocked artist to sync storage:", chrome.runtime.lastError);
        chrome.tabs.sendMessage(tabId, { action: "showToast", status: "failed" });
        return;
      }
      console.log(`[YTM Block Background] Successfully blocked: "${artistName}"`);
      // Dispatch success toast message
      chrome.tabs.sendMessage(tabId, { 
        action: "showToast", 
        status: "blocked", 
        artist: artistName 
      });
    });
  });
}
