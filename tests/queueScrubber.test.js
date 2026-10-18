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
