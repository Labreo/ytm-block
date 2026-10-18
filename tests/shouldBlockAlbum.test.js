const test = require('node:test');
const assert = require('node:assert');
const { performance } = require('node:perf_hooks');
const { YTMBlockController } = require('../content.js');

test('YTMBlockController - shouldBlockAlbum correctness', async (t) => {
  const controller = new YTMBlockController();

  await t.test('returns null when albumTitle is empty or blockedAlbums is empty', () => {
    controller.blockedAlbums = ['Abbey Road'];
    assert.strictEqual(controller.shouldBlockAlbum(''), null);
    assert.strictEqual(controller.shouldBlockAlbum(null), null);
    assert.strictEqual(controller.shouldBlockAlbum(undefined), null);

    controller.blockedAlbums = [];
    assert.strictEqual(controller.shouldBlockAlbum('Abbey Road'), null);
  });

  await t.test('matches exact album title ignoring case and whitespace', () => {
    controller.blockedAlbums = ['  Abbey Road  ', 'Dark Side of the Moon'];
    assert.strictEqual(controller.shouldBlockAlbum('abbey road'), '  Abbey Road  ');
    assert.strictEqual(controller.shouldBlockAlbum('DARK SIDE OF THE MOON'), 'Dark Side of the Moon');
  });

  await t.test('matches substring album title', () => {
    controller.blockedAlbums = ['Abbey Road'];
    assert.strictEqual(controller.shouldBlockAlbum('Abbey Road (Remastered 2009)'), 'Abbey Road');
  });

  await t.test('returns null when album title does not match any blocked album', () => {
    controller.blockedAlbums = ['Abbey Road', 'Dark Side of the Moon'];
    assert.strictEqual(controller.shouldBlockAlbum('OK Computer'), null);
  });

  await t.test('updates precomputed cache when blockedAlbums property is updated', () => {
    controller.blockedAlbums = ['Album 1'];
    assert.strictEqual(controller.shouldBlockAlbum('Album 1'), 'Album 1');
    assert.strictEqual(controller.shouldBlockAlbum('Album 2'), null);

    controller.blockedAlbums = ['Album 2'];
    assert.strictEqual(controller.shouldBlockAlbum('Album 1'), null);
    assert.strictEqual(controller.shouldBlockAlbum('Album 2'), 'Album 2');
  });
});

test('YTMBlockController - shouldBlockAlbum performance benchmark', async (t) => {
  const controller = new YTMBlockController();

  await t.test('benchmark pre-computed lowercase vs on-the-fly lowercasing', () => {
    const blockedCount = 50;
    const iterations = 10000;
    const rawAlbums = [];

    for (let i = 0; i < blockedCount; i++) {
      rawAlbums.push(`  Album Title Number ${i} (Deluxe Edition)  `);
    }

    controller.blockedAlbums = rawAlbums;
    const testAlbumTitle = 'Album Title Number 49 (Deluxe Edition) [2024 Remaster]';

    // Unoptimized reference implementation for baseline comparison
    function unoptimizedShouldBlockAlbum(albumTitle, blockedAlbums) {
      if (!albumTitle || blockedAlbums.length === 0) return null;
      const albumLower = albumTitle.toLowerCase().trim();
      for (const blocked of blockedAlbums) {
        const blockedLower = blocked.toLowerCase().trim();
        if (albumLower === blockedLower || albumLower.includes(blockedLower)) {
          return blocked;
        }
      }
      return null;
    }

    // Warmup JIT
    for (let i = 0; i < 500; i++) {
      unoptimizedShouldBlockAlbum(testAlbumTitle, rawAlbums);
      controller.shouldBlockAlbum(testAlbumTitle);
    }

    // Measure unoptimized baseline
    const startBaseline = performance.now();
    for (let i = 0; i < iterations; i++) {
      unoptimizedShouldBlockAlbum(testAlbumTitle, rawAlbums);
    }
    const durationBaseline = performance.now() - startBaseline;

    // Measure optimized pre-computed implementation
    const startOptimized = performance.now();
    for (let i = 0; i < iterations; i++) {
      controller.shouldBlockAlbum(testAlbumTitle);
    }
    const durationOptimized = performance.now() - startOptimized;

    const speedup = ((durationBaseline - durationOptimized) / durationBaseline) * 100;

    console.log(`[Benchmark] Baseline (on-the-fly lowercasing): ${durationBaseline.toFixed(2)}ms`);
    console.log(`[Benchmark] Optimized (pre-computed lowercase): ${durationOptimized.toFixed(2)}ms`);
    console.log(`[Benchmark] Speedup: ${speedup.toFixed(2)}%`);

    // Ensure optimized is faster than baseline
    assert.ok(durationOptimized <= durationBaseline, 'Optimized implementation should be faster or equal to baseline');
  });
});
