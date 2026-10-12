const test = require('node:test');
const assert = require('node:assert');

const { YTMBlockController } = require('../content.js');

function setupMockDOM() {
  const state = {
    querySelectorCalls: 0,
    querySelectorAllCalls: 0,
    mediaElement: {
      tagName: 'VIDEO',
      isConnected: true,
      paused: false,
      ended: false,
      currentTime: 10
    },
    playPauseBtn: null,
    mediaSessionState: null
  };

  try {
    Object.defineProperty(navigator, 'mediaSession', {
      get() {
        return state.mediaSessionState ? { playbackState: state.mediaSessionState } : null;
      },
      configurable: true
    });
  } catch (e) {
    // Fallback if redefine fails
  }

  global.document = {
    querySelector: (selector) => {
      state.querySelectorCalls++;
      if (selector.includes('play-pause-button')) {
        return state.playPauseBtn;
      }
      return null;
    },
    querySelectorAll: (selector) => {
      state.querySelectorAllCalls++;
      if (selector === 'audio, video') {
        return state.mediaElement ? [state.mediaElement] : [];
      }
      return [];
    }
  };

  return state;
}

test('YTMBlockController - isPlaybackActive', async (t) => {
  await t.test('detects active playback from navigator.mediaSession', () => {
    const domState = setupMockDOM();
    domState.mediaSessionState = 'playing';
    const controller = new YTMBlockController();

    assert.strictEqual(controller.isPlaybackActive(), true);

    domState.mediaSessionState = 'paused';
    assert.strictEqual(controller.isPlaybackActive(), false);
  });

  await t.test('detects active playback from play pause button title/aria-label', () => {
    const domState = setupMockDOM();
    domState.playPauseBtn = {
      getAttribute: (attr) => attr === 'title' ? 'Pause (k)' : ''
    };
    const controller = new YTMBlockController();

    assert.strictEqual(controller.isPlaybackActive(), true);
  });

  await t.test('detects active playback from DOM media element', () => {
    const domState = setupMockDOM();
    const controller = new YTMBlockController();

    assert.strictEqual(controller.isPlaybackActive(), true);
  });

  await t.test('caches media element and avoids redundant querySelectorAll calls', () => {
    const domState = setupMockDOM();
    const controller = new YTMBlockController();

    // First call populates cache
    assert.strictEqual(controller.isPlaybackActive(), true);
    const initialQueryCount = domState.querySelectorAllCalls;

    // Second call should hit cache if cached element is connected and playing
    assert.strictEqual(controller.isPlaybackActive(), true);

    // If caching is implemented, querySelectorAll should NOT be called again
    assert.strictEqual(controller.cachedMediaElement, domState.mediaElement);
    assert.strictEqual(domState.querySelectorAllCalls, initialQueryCount);
  });

  await t.test('re-queries DOM when cached media element is disconnected', () => {
    const domState = setupMockDOM();
    const controller = new YTMBlockController();

    controller.isPlaybackActive();
    const queryCount1 = domState.querySelectorAllCalls;

    // Disconnect cached media element
    domState.mediaElement.isConnected = false;

    // Create a new connected media element
    const newMedia = {
      tagName: 'AUDIO',
      isConnected: true,
      paused: false,
      ended: false,
      currentTime: 5
    };
    domState.mediaElement = newMedia;

    assert.strictEqual(controller.isPlaybackActive(), true);
    assert.strictEqual(domState.querySelectorAllCalls, queryCount1 + 1);
    assert.strictEqual(controller.cachedMediaElement, newMedia);
  });
});
