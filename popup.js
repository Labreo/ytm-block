/**
 * YTM Block - Popup Controller (Dashboard Edition)
 * 
 * Manages the multi-category dashboard layout, real-time list filtering,
 * manual block additions, one-click currently playing blockers, and background polling.
 */

// DOM Elements
const blockInput = document.getElementById('blockInput');
const blockTypeSelect = document.getElementById('blockTypeSelect');
const addBtn = document.getElementById('addBtn');
const feedbackMsg = document.getElementById('feedbackMsg');

// Lists, Badges, and Empty States
const songList = document.getElementById('songList');
const albumList = document.getElementById('albumList');
const artistList = document.getElementById('artistList');

const songCountBadge = document.getElementById('songCountBadge');
const albumCountBadge = document.getElementById('albumCountBadge');
const artistCountBadge = document.getElementById('artistCountBadge');

const songEmptyState = document.getElementById('songEmptyState');
const albumEmptyState = document.getElementById('albumEmptyState');
const artistEmptyState = document.getElementById('artistEmptyState');

// Now Playing elements
const nowPlayingPanel = document.getElementById('nowPlayingPanel');
const playingStatusText = document.getElementById('playingStatusText');
const currentTitleText = document.getElementById('currentTitleText');
const currentArtistText = document.getElementById('currentArtistText');
const currentAlbumText = document.getElementById('currentAlbumText');

const blockCurrentSongBtn = document.getElementById('blockCurrentSongBtn');
const blockCurrentAlbumBtn = document.getElementById('blockCurrentAlbumBtn');
const blockCurrentArtistBtn = document.getElementById('blockCurrentArtistBtn');

// State Manager
let state = {
  blockedArtists: [],
  blockedSongs: [],
  blockedAlbums: [],
  currentPlayingArtist: '',
  currentPlayingTitle: '',
  currentPlayingAlbum: '',
  filterQuery: ''
};

// --- INITIALIZATION ---

document.addEventListener('DOMContentLoaded', () => {
  // Load blocklists from synced storage
  loadBlocklist();

  // Poll current playing track status
  queryCurrentlyPlaying();
  const pollInterval = setInterval(queryCurrentlyPlaying, 1000);

  // Setup list filter search listener
  blockInput.addEventListener('input', (e) => {
    state.filterQuery = e.target.value.toLowerCase().trim();
    renderListsOnly();
  });

  // Action listeners
  addBtn.addEventListener('click', handleAddManualItem);
  blockInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      handleAddManualItem();
    }
  });

  // One-click actions
  blockCurrentSongBtn.addEventListener('click', () => handleBlockCurrent('song', state.currentPlayingTitle));
  blockCurrentAlbumBtn.addEventListener('click', () => handleBlockCurrent('album', state.currentPlayingAlbum));
  blockCurrentArtistBtn.addEventListener('click', () => handleBlockCurrent('artist', state.currentPlayingArtist));

  window.addEventListener('unload', () => {
    clearInterval(pollInterval);
  });

  blockInput.focus();
});

// --- PERSISTENCE & STORAGE ---

/**
 * Reads all block data from storage and triggers a complete UI render cycle.
 */
function loadBlocklist() {
  getBlockData().then((data) => {
    state.blockedArtists = data.blockedArtists || [];
    state.blockedSongs = data.blockedSongs || [];
    state.blockedAlbums = data.blockedAlbums || [];
    renderAll();
  }).catch((err) => {
    showFeedback('Error loading blocklists.');
    console.error(err);
  });
}

// --- NOW PLAYING & MESSAGE PASSING ---

/**
 * Sends a message query to content script in the active YTM tab.
 * Sequentially tests matches, prioritizing active/audible tabs to prevent empty states when multiple tabs exist.
 */
function queryCurrentlyPlaying() {
  chrome.tabs.query({ url: "*://music.youtube.com/*" }, (tabs) => {
    if (chrome.runtime.lastError) {
      updateNowPlayingUI(null);
      return;
    }

    if (!tabs || tabs.length === 0) {
      updateNowPlayingUI(null);
      return;
    }

    // Sort tabs so audible tabs or active tabs are tried first
    tabs.sort((a, b) => {
      if (a.audible !== b.audible) return a.audible ? -1 : 1;
      if (a.active !== b.active) return a.active ? -1 : 1;
      return 0;
    });

    let tabIndex = 0;
    function tryTab() {
      if (tabIndex >= tabs.length) {
        updateNowPlayingUI(null);
        return;
      }

      const currentTab = tabs[tabIndex];
      chrome.tabs.sendMessage(currentTab.id, { action: 'getCurrentTrack' }, (response) => {
        if (chrome.runtime.lastError || !response || !response.title) {
          tabIndex++;
          tryTab(); // try next tab
          return;
        }
        updateNowPlayingUI(response);
      });
    }

    tryTab();
  });
}

/**
 * Updates the fields, state, and buttons of the Now Playing card.
 */
function updateNowPlayingUI(track) {
  if (!track || !track.title) {
    playingStatusText.textContent = 'Disconnected';
    playingStatusText.classList.remove('live');

    currentTitleText.textContent = 'Open YouTube Music tab';
    currentArtistText.textContent = 'No active track';
    currentAlbumText.textContent = 'No active album';

    nowPlayingPanel.classList.remove('active');

    // Disable all actions
    setBtnBlockedState(blockCurrentSongBtn, false, 'Song');
    setBtnBlockedState(blockCurrentAlbumBtn, false, 'Album');
    setBtnBlockedState(blockCurrentArtistBtn, false, 'Artist');

    blockCurrentSongBtn.disabled = true;
    blockCurrentAlbumBtn.disabled = true;
    blockCurrentArtistBtn.disabled = true;

    state.currentPlayingArtist = '';
    state.currentPlayingTitle = '';
    state.currentPlayingAlbum = '';
    return;
  }

  // Populate active track details
  state.currentPlayingTitle = track.title.trim();
  state.currentPlayingArtist = track.artist ? track.artist.trim() : '';
  state.currentPlayingAlbum = track.album ? track.album.trim() : '';

  playingStatusText.textContent = 'Live';
  playingStatusText.classList.add('live');

  currentTitleText.textContent = state.currentPlayingTitle;
  currentArtistText.textContent = state.currentPlayingArtist || 'Unknown Artist';
  currentAlbumText.textContent = state.currentPlayingAlbum || 'Single / No Album';

  nowPlayingPanel.classList.add('active');

  // Evaluate blocking states for each button
  const isSongBlocked = state.blockedSongs.includes(normalizeEntry(state.currentPlayingTitle));
  const isAlbumBlocked = state.currentPlayingAlbum ? state.blockedAlbums.includes(normalizeEntry(state.currentPlayingAlbum)) : false;
  const isArtistBlocked = state.currentPlayingArtist ? state.blockedArtists.includes(normalizeEntry(state.currentPlayingArtist)) : false;

  // Render song action btn state
  if (isSongBlocked) {
    setBtnBlockedState(blockCurrentSongBtn, true, 'Blocked');
  } else {
    setBtnBlockedState(blockCurrentSongBtn, false, '+ Song');
    blockCurrentSongBtn.disabled = !state.currentPlayingTitle;
  }

  // Render album action btn state
  if (isAlbumBlocked) {
    setBtnBlockedState(blockCurrentAlbumBtn, true, 'Blocked');
  } else {
    setBtnBlockedState(blockCurrentAlbumBtn, false, '+ Album');
    blockCurrentAlbumBtn.disabled = !state.currentPlayingAlbum;
  }

  // Render artist action btn state
  if (isArtistBlocked) {
    setBtnBlockedState(blockCurrentArtistBtn, true, 'Blocked');
  } else {
    setBtnBlockedState(blockCurrentArtistBtn, false, '+ Artist');
    blockCurrentArtistBtn.disabled = !state.currentPlayingArtist;
  }
}

/**
 * Visual styling toggle helper for action buttons.
 */
function setBtnBlockedState(btn, isBlocked, text) {
  btn.textContent = text;
  if (isBlocked) {
    btn.classList.add('blocked');
    btn.disabled = true;
  } else {
    btn.classList.remove('blocked');
  }
}

// --- ACTIONS & ADDITIONS ---

/**
 * Handles manual entries from the input bar matching select type.
 */
function handleAddManualItem() {
  const rawInput = blockInput.value.trim();
  const type = blockTypeSelect.value; // 'song', 'album', 'artist'

  if (!rawInput) {
    showFeedback(`Please enter a valid ${type} target.`);
    return;
  }

  addBlockedItem(type, rawInput).then((result) => {
    if (!result.success) {
      if (result.status === 'already_blocked') {
        showFeedback(`This ${type} is already blocked.`);
      } else {
        showFeedback('Failed to update blocklists.');
      }
      return;
    }

    // Refresh state arrays
    state.blockedArtists = result.data.blockedArtists || [];
    state.blockedSongs = result.data.blockedSongs || [];
    state.blockedAlbums = result.data.blockedAlbums || [];

    blockInput.value = '';
    state.filterQuery = '';
    renderAll();
    queryCurrentlyPlaying();
    showFeedback(`Blocked ${type}: "${capitalizeWords(normalizeEntry(rawInput))}"`);
  });
}

/**
 * Handles currently playing block buttons.
 */
function handleBlockCurrent(type, value) {
  if (!value) return;

  addBlockedItem(type, value).then((result) => {
    if (result.success) {
      state.blockedArtists = result.data.blockedArtists || [];
      state.blockedSongs = result.data.blockedSongs || [];
      state.blockedAlbums = result.data.blockedAlbums || [];
      renderAll();
      queryCurrentlyPlaying();
      showFeedback(`Blocked current ${type}: "${capitalizeWords(normalizeEntry(value))}"`);
    }
  });
}

/**
 * Removes blocked item from sync storage.
 */
function handleRemoveItem(type, itemValue) {
  removeBlockedItem(type, itemValue).then((result) => {
    if (result.success) {
      state.blockedArtists = result.data.blockedArtists || [];
      state.blockedSongs = result.data.blockedSongs || [];
      state.blockedAlbums = result.data.blockedAlbums || [];
      renderAll();
      queryCurrentlyPlaying();
      showFeedback(`Unblocked ${type}: "${capitalizeWords(normalizeEntry(itemValue))}"`);
    }
  });
}

// --- RENDERERS ---

function renderAll() {
  renderListsOnly();
  queryCurrentlyPlaying();
}

/**
 * Modular rendering logic for lists that runs separately for quick search updates.
 */
function renderListsOnly() {
  renderCategoryList('song', state.blockedSongs, songList, songCountBadge, songEmptyState);
  renderCategoryList('album', state.blockedAlbums, albumList, albumCountBadge, albumEmptyState);
  renderCategoryList('artist', state.blockedArtists, artistList, artistCountBadge, artistEmptyState);
}

/**
 * Reusable tag renderer that respects the filter state.
 */
function renderCategoryList(type, list, container, badge, emptyStateEl) {
  // Apply real-time search query filter
  const filtered = state.filterQuery 
    ? list.filter(item => item.toLowerCase().includes(state.filterQuery))
    : list;

  badge.textContent = filtered.length;

  if (filtered.length === 0) {
    container.innerHTML = '';
    container.classList.add('hidden');
    emptyStateEl.classList.remove('hidden');
    // If filter is active, update empty state label to indicate no matches
    emptyStateEl.textContent = state.filterQuery ? 'No matching blocks' : `No blocked ${type}s`;
  } else {
    emptyStateEl.classList.add('hidden');
    container.classList.remove('hidden');
    
    // Clear list container
    container.innerHTML = '';
    
    filtered.forEach((item) => {
      container.appendChild(createTagComponent(type, item));
    });
  }
}

/**
 * Reusable HTML component for blocked pills.
 */
function createTagComponent(type, value) {
  const pill = document.createElement('div');
  pill.className = 'pill-tag';

  const displayName = capitalizeWords(value);

  const textSpan = document.createElement('span');
  textSpan.className = 'tag-text';
  textSpan.textContent = displayName;
  textSpan.title = displayName;

  const removeBtn = document.createElement('button');
  removeBtn.className = 'tag-remove-btn';
  removeBtn.title = `Remove "${displayName}"`;
  removeBtn.innerHTML = `
    <svg viewBox="0 0 24 24" width="10" height="10" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"></line>
      <line x1="6" y1="6" x2="18" y2="18"></line>
    </svg>
  `;

  removeBtn.addEventListener('click', () => {
    pill.style.transform = 'scale(0.9)';
    pill.style.opacity = '0';
    setTimeout(() => {
      handleRemoveItem(type, value);
    }, 150);
  });

  pill.appendChild(textSpan);
  pill.appendChild(removeBtn);
  return pill;
}

// --- UTILITIES ---

function capitalizeWords(str) {
  return str
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

let feedbackTimeout = null;
function showFeedback(message) {
  if (feedbackTimeout) {
    clearTimeout(feedbackTimeout);
  }

  feedbackMsg.textContent = message;
  feedbackMsg.classList.add('show');

  feedbackTimeout = setTimeout(() => {
    feedbackMsg.classList.remove('show');
  }, 2200);
}
