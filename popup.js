/**
 * YTM Block - Popup Controller
 * 
 * Manages the UI lifecycle, persistent storage sync, pill rendering,
 * and dynamic message-passing to query active playing track metadata
 * from the YouTube Music content script.
 */

// DOM Elements
const artistInput = document.getElementById('artistInput');
const addBtn = document.getElementById('addBtn');
const artistList = document.getElementById('artistList');
const emptyState = document.getElementById('emptyState');
const countBadge = document.getElementById('countBadge');
const feedbackMsg = document.getElementById('feedbackMsg');

// Now Playing DOM Elements
const nowPlayingPanel = document.getElementById('nowPlayingPanel');
const playingStatusText = document.getElementById('playingStatusText');
const currentArtistText = document.getElementById('currentArtistText');
const currentTitleText = document.getElementById('currentTitleText');
const blockCurrentBtn = document.getElementById('blockCurrentBtn');

// Application State
let state = {
  blockedArtists: [],
  currentPlayingArtist: ''
};

// --- INITIALIZATION ---

document.addEventListener('DOMContentLoaded', () => {
  // 1. Initial load of the blocklist from persistent storage
  loadBlocklist();

  // 2. Query currently playing track immediately and poll every 1s
  queryCurrentlyPlaying();
  const pollInterval = setInterval(queryCurrentlyPlaying, 1000);

  // 3. Action Listeners
  addBtn.addEventListener('click', handleAddArtist);
  
  artistInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      handleAddArtist();
    }
  });

  blockCurrentBtn.addEventListener('click', handleBlockCurrentArtist);

  // Clean up polling interval on unload
  window.addEventListener('unload', () => {
    clearInterval(pollInterval);
  });

  // Focus input automatically on load
  artistInput.focus();
});

// --- PERSISTENCE & STORAGE FLOW ---

/**
 * Loads the artist blocklist from chrome.storage.sync.
 */
function loadBlocklist() {
  chrome.storage.sync.get({ blockedArtists: [] }, (result) => {
    if (chrome.runtime.lastError) {
      showFeedback('Error loading blocklist.');
      console.error(chrome.runtime.lastError);
      return;
    }

    state.blockedArtists = result.blockedArtists || [];
    renderUI();
  });
}

/**
 * Saves the current local blocklist state to chrome.storage.sync.
 */
function saveBlocklist() {
  chrome.storage.sync.set({ blockedArtists: state.blockedArtists }, () => {
    if (chrome.runtime.lastError) {
      showFeedback('Failed to save to Chrome Sync.');
      console.error(chrome.runtime.lastError);
      return;
    }

    renderUI();
    // Refresh Now Playing state in case we just blocked/unblocked the playing artist
    queryCurrentlyPlaying();
  });
}

// --- MESSAGE PASSING & NOW PLAYING QUERY ---

/**
 * Queries the active YouTube Music tab for its current playing track.
 */
function queryCurrentlyPlaying() {
  chrome.tabs.query({ url: "*://music.youtube.com/*" }, (tabs) => {
    if (chrome.runtime.lastError) {
      updateNowPlayingUI(null);
      return;
    }

    if (tabs && tabs.length > 0) {
      // Send message to the active YTM tab content script
      chrome.tabs.sendMessage(tabs[0].id, { action: 'getCurrentTrack' }, (response) => {
        if (chrome.runtime.lastError || !response) {
          updateNowPlayingUI(null);
          return;
        }
        updateNowPlayingUI(response);
      });
    } else {
      // No tab open on music.youtube.com
      updateNowPlayingUI(null);
    }
  });
}

/**
 * Updates the "Currently Playing" card in the popup using active metadata.
 */
function updateNowPlayingUI(track) {
  if (!track || !track.artist || !track.title) {
    // Inactive state (no tab or paused/loading)
    playingStatusText.textContent = 'Disconnected';
    playingStatusText.classList.remove('live');
    
    currentArtistText.textContent = 'No active track';
    currentTitleText.textContent = 'Open YouTube Music tab';
    
    nowPlayingPanel.classList.remove('active');
    
    blockCurrentBtn.setAttribute('disabled', 'true');
    blockCurrentBtn.dataset.artist = '';
    
    const blockBtnText = blockCurrentBtn.querySelector('span');
    if (blockBtnText) blockBtnText.textContent = 'Block';
    
    state.currentPlayingArtist = '';
    return;
  }

  // Active track playing state
  state.currentPlayingArtist = track.artist.trim();
  
  playingStatusText.textContent = 'Live';
  playingStatusText.classList.add('live');
  
  currentArtistText.textContent = capitalizeWords(state.currentPlayingArtist);
  currentTitleText.textContent = track.title;
  
  nowPlayingPanel.classList.add('active');
  blockCurrentBtn.dataset.artist = state.currentPlayingArtist;

  // Check if this artist is already blocked
  const normalizedArtist = state.currentPlayingArtist.toLowerCase().trim();
  const isAlreadyBlocked = state.blockedArtists.includes(normalizedArtist);
  
  const blockBtnText = blockCurrentBtn.querySelector('span');
  
  if (isAlreadyBlocked) {
    blockCurrentBtn.setAttribute('disabled', 'true');
    if (blockBtnText) blockBtnText.textContent = 'Blocked';
  } else {
    blockCurrentBtn.removeAttribute('disabled');
    if (blockBtnText) blockBtnText.textContent = 'Block';
  }
}

// --- INTERACTIVE ACTIONS & STATE MUTATIONS ---

/**
 * Shared method to add a sanitized, non-duplicate artist to the blocklist.
 * @param {string} rawName - User entered name.
 * @returns {boolean} True if successfully added.
 */
function addArtistToBlocklist(rawName) {
  const normalizedArtist = rawName.trim().toLowerCase();

  // 1. Validate Empty Input
  if (!normalizedArtist) {
    showFeedback('Please enter an artist name.');
    flashInputError();
    return false;
  }

  // 2. Prevent Duplicates
  if (state.blockedArtists.includes(normalizedArtist)) {
    showFeedback('Artist is already in your blocklist.');
    flashInputError();
    return false;
  }

  // 3. Push and sort state
  state.blockedArtists.push(normalizedArtist);
  state.blockedArtists.sort();
  
  saveBlocklist();
  showFeedback(`Blocked "${capitalizeWords(normalizedArtist)}".`);
  return true;
}

/**
 * Handles adding an artist from the input box.
 */
function handleAddArtist() {
  const rawInput = artistInput.value;
  const success = addArtistToBlocklist(rawInput);
  if (success) {
    artistInput.value = '';
    artistInput.focus();
  }
}

/**
 * One-click handler to block the currently playing artist.
 */
function handleBlockCurrentArtist() {
  const artistToBlock = blockCurrentBtn.dataset.artist;
  if (artistToBlock) {
    addArtistToBlocklist(artistToBlock);
  }
}

/**
 * Removes an artist from the blocklist state.
 */
function handleRemoveArtist(index) {
  if (index >= 0 && index < state.blockedArtists.length) {
    state.blockedArtists.splice(index, 1);
    saveBlocklist();
  }
}

// --- UI RENDERING & COMPONENT GENERATION ---

/**
 * Synchronizes the visual DOM structure with the current blocklist state.
 */
function renderUI() {
  const totalCount = state.blockedArtists.length;
  countBadge.textContent = totalCount;

  if (totalCount === 0) {
    emptyState.classList.remove('hidden');
    artistList.classList.add('hidden');
  } else {
    emptyState.classList.add('hidden');
    artistList.classList.remove('hidden');

    // Build modern responsive Flex Pills
    artistList.innerHTML = '';
    
    state.blockedArtists.forEach((artist, index) => {
      const pill = document.createElement('div');
      pill.className = 'artist-pill';

      const displayName = capitalizeWords(artist);

      const nameSpan = document.createElement('span');
      nameSpan.className = 'pill-name';
      nameSpan.textContent = displayName;
      nameSpan.title = displayName; // Hover tooltip support

      const removeBtn = document.createElement('button');
      removeBtn.className = 'remove-btn';
      removeBtn.title = `Unblock ${displayName}`;
      removeBtn.setAttribute('aria-label', `Remove ${displayName} from blocklist`);
      
      // Sleek minimalistic close SVG icon
      removeBtn.innerHTML = `
        <svg viewBox="0 0 24 24" width="10" height="10" stroke="currentColor" stroke-width="3.5" fill="none" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      `;

      // Click deletion handler with exit scale animation
      removeBtn.addEventListener('click', () => {
        pill.style.transform = 'scale(0.9)';
        pill.style.opacity = '0';
        setTimeout(() => {
          handleRemoveArtist(index);
        }, 150);
      });

      pill.appendChild(nameSpan);
      pill.appendChild(removeBtn);
      artistList.appendChild(pill);
    });
  }
}

// --- UTILITY & ANIMATION HELPER FUNCTIONS ---

/**
 * Capitalizes the first letter of each word in a string.
 */
function capitalizeWords(str) {
  return str
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// Timer tracker for toast animations
let feedbackTimeout = null;

/**
 * Slide-in warning toast message handler.
 */
function showFeedback(message) {
  if (feedbackTimeout) {
    clearTimeout(feedbackTimeout);
  }

  feedbackMsg.textContent = message;
  feedbackMsg.classList.add('show');

  feedbackTimeout = setTimeout(() => {
    feedbackMsg.classList.remove('show');
  }, 2500);
}

/**
 * Triggers red glow effect on the manual input field on errors.
 */
function flashInputError() {
  artistInput.style.borderColor = '#FF5A79';
  artistInput.style.boxShadow = '0 0 8px rgba(255, 90, 121, 0.4)';
  
  setTimeout(() => {
    artistInput.style.borderColor = '';
    artistInput.style.boxShadow = '';
  }, 400);
}
