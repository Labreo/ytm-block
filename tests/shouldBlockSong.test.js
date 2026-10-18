const test = require('node:test');
const assert = require('node:assert');
const { performance } = require('node:perf_hooks');
const { YTMBlockController } = require('../content.js');

test('YTMBlockController - shouldBlockSong correctness', async (t) => {
  const controller = new YTMBlockController();

  await t.test('returns null when songTitle is empty or blockedSongs is empty', () => {
    controller.blockedSongs = [];
    assert.strictEqual(controller.shouldBlockSong('Some Song'), null);

    controller.blockedSongs = ['Some Song'];
    assert.strictEqual(controller.shouldBlockSong(''), null);
    assert.strictEqual(controller.shouldBlockSong(null), null);
  });

  await t.test('matches exact, substring, or superstring blocked songs', () => {
    controller.blockedSongs = ['Radioactive (Official Video)', 'Believer'];

    // Exact match normalized
    assert.strictEqual(controller.shouldBlockSong('Radioactive'), 'Radioactive (Official Video)');
    assert.strictEqual(controller.shouldBlockSong('Believer'), 'Believer');

    // Substring match
    assert.strictEqual(controller.shouldBlockSong('Believer (Remix)'), 'Believer');

    // Non-match
    assert.strictEqual(controller.shouldBlockSong('Demons'), null);
  });
});

test('YTMBlockController - shouldBlockSong performance benchmark', async (t) => {
  const controller = new YTMBlockController();

  await t.test('benchmark performance of song blocking evaluation', () => {
    const blockedSongs = [];
    for (let i = 0; i < 100; i++) {
      blockedSongs.push(`Blocked Song Title Number ${i} (Official Audio) [Remastered 2023]`);
    }
    controller.blockedSongs = blockedSongs;

    const testSong = 'Unblocked Song Title (Live at Wembley Stadium 2020) [Deluxe Edition]';

    // Warmup JIT
    for (let i = 0; i < 100; i++) {
      controller.shouldBlockSong(testSong);
    }

    const iterations = 5000;
    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      controller.shouldBlockSong(testSong);
    }
    const duration = performance.now() - start;

    console.log(`[Benchmark] ${iterations} shouldBlockSong calls duration: ${duration.toFixed(2)}ms`);
  });
});
