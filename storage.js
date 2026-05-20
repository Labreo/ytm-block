/**
 * YTM Block - Shared Storage & Migration Library
 * 
 * Reusable utility script shared across the background service worker, 
 * content scripts, and popup contexts to ensure dry storage manipulation,
 * automatic entry normalization, duplicate prevention, and zero-downtime migrations.
 */

// Supported block categories mapped to their chrome.storage.sync keys
const STORAGE_KEYS = {
  artist: 'blockedArtists',
  song: 'blockedSongs',
  album: 'blockedAlbums'
};

/**
 * Normalizes input entries to ensure consistent comparison (lowercase & trimmed).
 * @param {string} val - Raw string input.
 * @returns {string} Normalized string.
 */
function normalizeEntry(val) {
  if (typeof val !== 'string') return '';
  return val.trim().toLowerCase();
}

/**
 * Retrieves all blocked data categories from persistent sync storage.
 * Safely migrates old legacy artist lists, normalizes entries, and guarantees all arrays exist.
 * @returns {Promise<{blockedArtists: string[], blockedSongs: string[], blockedAlbums: string[]}>}
 */
function getBlockData() {
  return new Promise((resolve) => {
    try {
      chrome.storage.sync.get(['blockedArtists', 'blockedSongs', 'blockedAlbums'], (result) => {
        if (chrome.runtime.lastError) {
          console.error('[YTM Block Storage] Error fetching storage:', chrome.runtime.lastError);
          resolve({ blockedArtists: [], blockedSongs: [], blockedAlbums: [] });
          return;
        }

        let migrated = false;

        // 1. Retrieve or initialize categories
        let blockedArtists = Array.isArray(result.blockedArtists) ? result.blockedArtists : [];
        let blockedSongs = Array.isArray(result.blockedSongs) ? result.blockedSongs : [];
        let blockedAlbums = Array.isArray(result.blockedAlbums) ? result.blockedAlbums : [];

        // Detect if any expected list keys are completely missing (triggering backward compatibility initialization)
        if (result.blockedArtists === undefined) migrated = true;
        if (result.blockedSongs === undefined) migrated = true;
        if (result.blockedAlbums === undefined) migrated = true;

        // 2. Clean, normalize, and de-duplicate lists
        const cleanList = (list) => {
          const seen = new Set();
          const cleaned = [];
          list.forEach(item => {
            const norm = normalizeEntry(item);
            if (norm && !seen.has(norm)) {
              seen.add(norm);
              cleaned.push(norm);
            }
          });
          if (cleaned.length !== list.length) {
            migrated = true;
          }
          return cleaned;
        };

        blockedArtists = cleanList(blockedArtists);
        blockedSongs = cleanList(blockedSongs);
        blockedAlbums = cleanList(blockedAlbums);

        const finalData = {
          blockedArtists,
          blockedSongs,
          blockedAlbums
        };

        // 3. Write back to storage if any initialization or normalization occurred
        if (migrated) {
          console.log('[YTM Block Storage] Storage schema migration/normalization executed.');
          chrome.storage.sync.set(finalData, () => {
            resolve(finalData);
          });
        } else {
          resolve(finalData);
        }
      });
    } catch (e) {
      console.error('[YTM Block Storage] Failed to access storage system safely:', e);
      resolve({ blockedArtists: [], blockedSongs: [], blockedAlbums: [] });
    }
  });
}

/**
 * Adds an entry to a specific category list in sync storage.
 * @param {('artist'|'song'|'album')} type - The block type.
 * @param {string} value - The raw item value to block.
 * @returns {Promise<{success: boolean, status: string, data: object}>}
 */
function addBlockedItem(type, value) {
  return new Promise((resolve) => {
    const storageKey = STORAGE_KEYS[type];
    if (!storageKey) {
      resolve({ success: false, status: 'invalid_type' });
      return;
    }

    const normalizedVal = normalizeEntry(value);
    if (!normalizedVal) {
      resolve({ success: false, status: 'empty_value' });
      return;
    }

    getBlockData().then((data) => {
      const list = data[storageKey];

      // Prevent duplicates
      if (list.includes(normalizedVal)) {
        resolve({ success: false, status: 'already_blocked', data });
        return;
      }

      list.push(normalizedVal);
      list.sort(); // Sort alphabetically for clean UI rendering

      chrome.storage.sync.set({ [storageKey]: list }, () => {
        if (chrome.runtime.lastError) {
          console.error(`[YTM Block Storage] Failed to add blocked ${type}:`, chrome.runtime.lastError);
          resolve({ success: false, status: 'storage_error' });
          return;
        }
        
        // Return updated dataset
        data[storageKey] = list;
        resolve({ success: true, status: 'blocked', data });
      });
    });
  });
}

/**
 * Removes an entry from a specific category list in sync storage.
 * @param {('artist'|'song'|'album')} type - The block type.
 * @param {string} value - The raw or normalized item value to unblock.
 * @returns {Promise<{success: boolean, status: string, data: object}>}
 */
function removeBlockedItem(type, value) {
  return new Promise((resolve) => {
    const storageKey = STORAGE_KEYS[type];
    if (!storageKey) {
      resolve({ success: false, status: 'invalid_type' });
      return;
    }

    const normalizedVal = normalizeEntry(value);
    if (!normalizedVal) {
      resolve({ success: false, status: 'empty_value' });
      return;
    }

    getBlockData().then((data) => {
      const list = data[storageKey];
      const index = list.indexOf(normalizedVal);

      if (index === -1) {
        resolve({ success: false, status: 'not_blocked', data });
        return;
      }

      list.splice(index, 1);

      chrome.storage.sync.set({ [storageKey]: list }, () => {
        if (chrome.runtime.lastError) {
          console.error(`[YTM Block Storage] Failed to remove blocked ${type}:`, chrome.runtime.lastError);
          resolve({ success: false, status: 'storage_error' });
          return;
        }

        // Return updated dataset
        data[storageKey] = list;
        resolve({ success: true, status: 'unblocked', data });
      });
    });
  });
}
