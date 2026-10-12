const { describe, it } = require('node:test');
const assert = require('node:assert');
const { validateImportSchema } = require('../popup.js');

describe('validateImportSchema', () => {
  it('should return false for primitive and non-object inputs', () => {
    assert.strictEqual(validateImportSchema(null), false);
    assert.strictEqual(validateImportSchema(undefined), false);
    assert.strictEqual(validateImportSchema(123), false);
    assert.strictEqual(validateImportSchema('invalid json string'), false);
    assert.strictEqual(validateImportSchema(true), false);
    assert.strictEqual(validateImportSchema(false), false);
  });

  it('should return false for array inputs', () => {
    assert.strictEqual(validateImportSchema([]), false);
    assert.strictEqual(validateImportSchema(['artist1', 'artist2']), false);
  });

  it('should return false if any blocklist key is not an array', () => {
    assert.strictEqual(validateImportSchema({ blockedArtists: 'artist1' }), false);
    assert.strictEqual(validateImportSchema({ blockedSongs: 123 }), false);
    assert.strictEqual(validateImportSchema({ blockedAlbums: null }), false);
    assert.strictEqual(validateImportSchema({ blockedArtists: {}, blockedSongs: [] }), false);
  });

  it('should return true for valid object inputs containing array blocklists', () => {
    assert.strictEqual(validateImportSchema({}), true);
    assert.strictEqual(validateImportSchema({ blockedArtists: ['taylor swift'] }), true);
    assert.strictEqual(validateImportSchema({ blockedSongs: ['karma police'] }), true);
    assert.strictEqual(validateImportSchema({ blockedAlbums: ['ok computer'] }), true);
    assert.strictEqual(validateImportSchema({
      blockedArtists: ['taylor swift'],
      blockedSongs: ['yellow'],
      blockedAlbums: ['parachutes']
    }), true);
  });
});
