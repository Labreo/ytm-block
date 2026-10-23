const { describe, it } = require('node:test');
const assert = require('node:assert');
const { performance } = require('node:perf_hooks');
const { YTMBlockController } = require('../content.js');

describe('YTMBlockController - getQueueItemTitle', () => {
  it('extracts title correctly with .song-title', () => {
    const controller = new YTMBlockController();
    const mockItem = {
      querySelector(selector) {
        if (selector === '.song-title' || selector === '.song-title, .title, yt-formatted-string') {
          return { textContent: '  Song Title 1  ' };
        }
        return null;
      }
    };
    assert.strictEqual(controller.getQueueItemTitle(mockItem), 'Song Title 1');
  });

  it('extracts title correctly with .title fallback', () => {
    const controller = new YTMBlockController();
    const mockItem = {
      querySelector(selector) {
        if (selector === '.title' || selector === '.song-title, .title, yt-formatted-string') {
          return { textContent: '  Song Title 2  ' };
        }
        return null;
      }
    };
    assert.strictEqual(controller.getQueueItemTitle(mockItem), 'Song Title 2');
  });

  it('extracts title correctly with yt-formatted-string fallback', () => {
    const controller = new YTMBlockController();
    const mockItem = {
      querySelector(selector) {
        if (selector === 'yt-formatted-string' || selector === '.song-title, .title, yt-formatted-string') {
          return { textContent: '  Song Title 3  ' };
        }
        return null;
      }
    };
    assert.strictEqual(controller.getQueueItemTitle(mockItem), 'Song Title 3');
  });

  it('returns empty string if no title element found or empty content', () => {
    const controller = new YTMBlockController();
    const mockItem1 = {
      querySelector() { return null; }
    };
    const mockItem2 = {
      querySelector() { return { textContent: '   ' }; }
    };
    assert.strictEqual(controller.getQueueItemTitle(mockItem1), '');
    assert.strictEqual(controller.getQueueItemTitle(mockItem2), '');
  });

  it('benchmark sequential querySelector vs combined querySelector', () => {
    // Unoptimized implementation: 3 sequential querySelector calls
    function getQueueItemTitleUnoptimized(item) {
      const titleEl = item.querySelector('.song-title') ||
                      item.querySelector('.title') ||
                      item.querySelector('yt-formatted-string');
      if (titleEl && titleEl.textContent) {
        return titleEl.textContent.trim();
      }
      return '';
    }

    // Optimized implementation: 1 combined querySelector call
    function getQueueItemTitleOptimized(item) {
      const titleEl = item.querySelector('.song-title, .title, yt-formatted-string');
      if (titleEl && titleEl.textContent) {
        return titleEl.textContent.trim();
      }
      return '';
    }

    // Simulate items requiring fallback queries
    const items = [];
    const count = 1000;
    for (let i = 0; i < count; i++) {
      const mode = i % 3;
      items.push({
        querySelector(selector) {
          if (selector === '.song-title, .title, yt-formatted-string') {
            return { textContent: `Song ${i}` };
          }
          if (mode === 0 && selector === '.song-title') return { textContent: `Song ${i}` };
          if (mode === 1 && selector === '.title') return { textContent: `Song ${i}` };
          if (mode === 2 && selector === 'yt-formatted-string') return { textContent: `Song ${i}` };
          return null;
        }
      });
    }

    const iterations = 1000;

    // Warmup
    for (let iter = 0; iter < 100; iter++) {
      for (const item of items) {
        getQueueItemTitleUnoptimized(item);
        getQueueItemTitleOptimized(item);
      }
    }

    // Measure Unoptimized
    const t0 = performance.now();
    for (let iter = 0; iter < iterations; iter++) {
      for (const item of items) {
        getQueueItemTitleUnoptimized(item);
      }
    }
    const durationUnoptimized = performance.now() - t0;

    // Measure Optimized
    const t1 = performance.now();
    for (let iter = 0; iter < iterations; iter++) {
      for (const item of items) {
        getQueueItemTitleOptimized(item);
      }
    }
    const durationOptimized = performance.now() - t1;

    const speedup = ((durationUnoptimized - durationOptimized) / durationUnoptimized) * 100;
    console.log(`[getQueueItemTitle Benchmark] Unoptimized (sequential): ${durationUnoptimized.toFixed(2)}ms`);
    console.log(`[getQueueItemTitle Benchmark] Optimized (combined):   ${durationOptimized.toFixed(2)}ms`);
    console.log(`[getQueueItemTitle Benchmark] Speedup: ${speedup.toFixed(2)}%`);

    assert.ok(durationOptimized <= durationUnoptimized, 'Optimized should be faster or equal');
  });
});
