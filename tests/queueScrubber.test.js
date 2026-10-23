const test = require('node:test');
const assert = require('node:assert');
const { performance } = require('node:perf_hooks');
const { YTMBlockController } = require('../content.js');

function createMockLink(href, text) {
  return {
    getAttribute(attr) {
      if (attr === 'href') return href;
      return null;
    },
    textContent: text
  };
}

function createMockQueueItem(title, artist, album) {
  const anchors = [
    createMockLink(`/browse/UC12345`, artist),
    createMockLink(`/browse/MPRE12345`, album),
    createMockLink(`/watch?v=12345`, title)
  ];

  let querySelectorAllCalls = 0;
  const dataset = {};
  const classes = new Set();
  const attributes = {};

  const mockItem = {
    anchors,
    dataset,
    get querySelectorAllCalls() { return querySelectorAllCalls; },
    classList: {
      contains(cls) { return classes.has(cls); },
      add(cls) { classes.add(cls); },
      remove(cls) { classes.delete(cls); }
    },
    setAttribute(attr, val) { attributes[attr] = val; },
    removeAttribute(attr) { delete attributes[attr]; },
    getAttribute(attr) { return attributes[attr]; },
    querySelectorAll(selector) {
      if (selector === 'a') {
        querySelectorAllCalls++;
        return anchors;
      }
      return [];
    },
    querySelector(selector) {
      if (selector === '.song-title' || selector === '.title' || selector === 'yt-formatted-string' || selector === '.song-title, .title, yt-formatted-string') {
        return { textContent: title };
      }
      if (selector === '.byline' || selector === '[class*="byline"]') {
        return { textContent: `${artist} • ${album}` };
      }
      return null;
    }
  };

  return mockItem;
}

test('YTMBlockController - queue item extractors functionality', async (t) => {
  const controller = new YTMBlockController();

  await t.test('extracts artist, title, and album correctly with pre-queried anchors', () => {
    const item = createMockQueueItem('Song Title', 'Artist Name', 'Album Name');
    const anchors = item.querySelectorAll('a');

    assert.strictEqual(controller.getQueueItemArtist(item, anchors), 'Artist Name');
    assert.strictEqual(controller.getQueueItemTitle(item), 'Song Title');
    assert.strictEqual(controller.getQueueItemAlbum(item, anchors), 'Album Name');
  });

  await t.test('extracts artist and album correctly with fallback (no anchors passed)', () => {
    const item = createMockQueueItem('Song Title', 'Artist Name', 'Album Name');

    assert.strictEqual(controller.getQueueItemArtist(item), 'Artist Name');
    assert.strictEqual(controller.getQueueItemAlbum(item), 'Album Name');
  });

  await t.test('scrubQueue reduces DOM query calls from 2 to 1 per queue item', () => {
    const items = [
      createMockQueueItem('Track 1', 'Artist 1', 'Album 1'),
      createMockQueueItem('Track 2', 'Artist 2', 'Album 2')
    ];

    global.document = {
      querySelectorAll(selector) {
        if (selector === 'ytmusic-player-queue-item') return items;
        return [];
      },
      querySelector() { return null; },
      getElementById() { return null; }
    };

    controller.scrubQueue();

    for (const item of items) {
      assert.strictEqual(item.querySelectorAllCalls, 1);
    }
  });
});

test('YTMBlockController - performance benchmark', async (t) => {
  const controller = new YTMBlockController();

  await t.test('benchmark unoptimized (multiple querySelectorAll calls) vs optimized (single querySelectorAll call)', () => {
    const count = 500;
    const iterations = 500;
    const items = [];
    for (let i = 0; i < count; i++) {
      items.push(createMockQueueItem(`Song ${i}`, `Artist ${i}`, `Album ${i}`));
    }

    // Warmup V8 JIT
    for (let i = 0; i < 100; i++) {
      const item = items[i % count];
      controller.getQueueItemArtist(item);
      controller.getQueueItemAlbum(item);
      const anchors = item.querySelectorAll('a');
      controller.getQueueItemArtist(item, anchors);
      controller.getQueueItemAlbum(item, anchors);
    }

    // Run baseline trial
    const startBaseline = performance.now();
    for (let iter = 0; iter < iterations; iter++) {
      for (let i = 0; i < count; i++) {
        const item = items[i];
        controller.getQueueItemArtist(item);
        controller.getQueueItemTitle(item);
        controller.getQueueItemAlbum(item);
      }
    }
    const durationBaseline = performance.now() - startBaseline;

    // Run optimized trial
    const startOptimized = performance.now();
    for (let iter = 0; iter < iterations; iter++) {
      for (let i = 0; i < count; i++) {
        const item = items[i];
        const anchors = item.querySelectorAll('a');
        controller.getQueueItemArtist(item, anchors);
        controller.getQueueItemTitle(item);
        controller.getQueueItemAlbum(item, anchors);
      }
    }
    const durationOptimized = performance.now() - startOptimized;

    const speedup = ((durationBaseline - durationOptimized) / durationBaseline) * 100;
    console.log(`[Benchmark] Baseline (redundant queries): ${durationBaseline.toFixed(2)}ms`);
    console.log(`[Benchmark] Optimized (shared anchors):   ${durationOptimized.toFixed(2)}ms`);
    console.log(`[Benchmark] Speedup: ${speedup.toFixed(2)}%`);
  });
});

test('YTMBlockController - updateQueueStats functionality and benchmark', async (t) => {
  const controller = new YTMBlockController();

  await t.test('updates stats badge correctly when statsEl exists or needs creation', () => {
    let appendedChild = null;
    const headerMock = {
      appendChild(el) { appendedChild = el; }
    };

    let documentStatsEl = null;
    global.document = {
      getElementById(id) {
        if (id === 'ytm-queue-stats') return documentStatsEl;
        return null;
      },
      querySelector(selector) {
        if (selector === 'ytmusic-player-queue #header, ytmusic-player-queue .title, ytmusic-player-queue' ||
            selector === 'ytmusic-player-queue #header' ||
            selector === 'ytmusic-player-queue .title' ||
            selector === 'ytmusic-player-queue') {
          return headerMock;
        }
        return null;
      },
      createElement(tag) {
        const el = {
          id: '',
          className: '',
          textContent: '',
          classList: {
            add(cls) { el.className += ` ${cls}`; },
            remove(cls) { el.className = el.className.replace(cls, '').trim(); }
          }
        };
        return el;
      }
    };

    controller.updateQueueStats(3);
    assert.ok(appendedChild !== null);
    assert.strictEqual(appendedChild.id, 'ytm-queue-stats');
    assert.strictEqual(appendedChild.textContent, '3 blocked tracks hidden');

    documentStatsEl = appendedChild;
    controller.updateQueueStats(1);
    assert.strictEqual(documentStatsEl.textContent, '1 blocked track hidden');
  });

  await t.test('benchmark updateQueueStats baseline vs optimized DOM queries when creating stats element', () => {
    const iterations = 50000;

    const mockHeader = {
      appendChild() {}
    };

    global.document = {
      getElementById() { return null; },
      querySelector(selector) {
        if (selector === 'ytmusic-player-queue #header') return null;
        if (selector === 'ytmusic-player-queue .title') return null;
        if (selector === 'ytmusic-player-queue' || selector === 'ytmusic-player-queue #header, ytmusic-player-queue .title, ytmusic-player-queue') {
          return mockHeader;
        }
        return null;
      },
      createElement() {
        return {
          id: '',
          className: '',
          textContent: '',
          classList: { add() {}, remove() {} }
        };
      }
    };

    // Unoptimized implementation function
    function updateQueueStatsBaseline(blockedCount) {
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
    }

    // Optimized implementation function
    function updateQueueStatsOptimized(blockedCount) {
      let statsEl = document.getElementById('ytm-queue-stats');
      if (!statsEl) {
        const queueHeader = document.querySelector('ytmusic-player-queue #header, ytmusic-player-queue .title, ytmusic-player-queue');
        if (!queueHeader) return;

        statsEl = document.createElement('div');
        statsEl.id = 'ytm-queue-stats';
        statsEl.className = 'ytm-queue-stats-badge';
        queueHeader.appendChild(statsEl);
      }
    }

    // Warmup
    for (let i = 0; i < 1000; i++) {
      updateQueueStatsBaseline(1);
      updateQueueStatsOptimized(1);
    }

    const startBaseline = performance.now();
    for (let i = 0; i < iterations; i++) {
      updateQueueStatsBaseline(1);
    }
    const durationBaseline = performance.now() - startBaseline;

    const startOptimized = performance.now();
    for (let i = 0; i < iterations; i++) {
      updateQueueStatsOptimized(1);
    }
    const durationOptimized = performance.now() - startOptimized;

    const speedup = ((durationBaseline - durationOptimized) / durationBaseline) * 100;
    console.log(`[Benchmark updateQueueStats] Baseline: ${durationBaseline.toFixed(2)}ms`);
    console.log(`[Benchmark updateQueueStats] Optimized: ${durationOptimized.toFixed(2)}ms`);
    console.log(`[Benchmark updateQueueStats] Speedup: ${speedup.toFixed(2)}%`);
  });
});
