const test = require('node:test');
const assert = require('node:assert');

// Require YTMBlockController from content.js
const { YTMBlockController } = require('../content.js');

test('YTMBlockController - normalizeArtist', async (t) => {
  const controller = new YTMBlockController();

  await t.test('handles empty, null, and undefined values', () => {
    assert.strictEqual(controller.normalizeArtist(null), '');
    assert.strictEqual(controller.normalizeArtist(undefined), '');
    assert.strictEqual(controller.normalizeArtist(''), '');
  });

  await t.test('normalizes standard artist names (lowercasing and whitespace trimming)', () => {
    assert.strictEqual(controller.normalizeArtist('Dua Lipa'), 'dua lipa');
    assert.strictEqual(controller.normalizeArtist('  Coldplay  '), 'coldplay');
    assert.strictEqual(controller.normalizeArtist('THE WEEKND'), 'the weeknd');
  });

  await t.test('collapses multiple internal whitespaces', () => {
    assert.strictEqual(controller.normalizeArtist('Taylor   Swift'), 'taylor swift');
    assert.strictEqual(controller.normalizeArtist(' Kendrick \t Lamar \n '), 'kendrick lamar');
  });

  await t.test('removes special characters except hyphens and spaces', () => {
    assert.strictEqual(controller.normalizeArtist('P!nk'), 'pnk');
    assert.strictEqual(controller.normalizeArtist('Ke$ha'), 'keha');
    assert.strictEqual(controller.normalizeArtist('AC/DC'), 'acdc');
    assert.strictEqual(controller.normalizeArtist('Jay-Z'), 'jay-z');
    assert.strictEqual(controller.normalizeArtist('Panic! At The Disco'), 'panic at the disco');
  });

  await t.test('handles non-string values gracefully', () => {
    assert.strictEqual(controller.normalizeArtist(123), '');
    assert.strictEqual(controller.normalizeArtist({}), '');
    assert.strictEqual(controller.normalizeArtist([]), '');
  });
});
