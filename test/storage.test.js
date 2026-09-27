const { describe, it } = require('node:test');
const assert = require('node:assert');
const { normalizeEntry } = require('../storage.js');

describe('normalizeEntry', () => {
  it('should return empty string for non-string inputs', () => {
    assert.strictEqual(normalizeEntry(null), '');
    assert.strictEqual(normalizeEntry(undefined), '');
    assert.strictEqual(normalizeEntry(123), '');
    assert.strictEqual(normalizeEntry({}), '');
    assert.strictEqual(normalizeEntry(['artist']), '');
    assert.strictEqual(normalizeEntry(true), '');
    assert.strictEqual(normalizeEntry(false), '');
  });

  it('should return empty string for empty string input', () => {
    assert.strictEqual(normalizeEntry(''), '');
    assert.strictEqual(normalizeEntry('   '), '');
  });

  it('should trim leading and trailing spaces and lowercase string', () => {
    assert.strictEqual(normalizeEntry('  Taylor Swift  '), 'taylor swift');
    assert.strictEqual(normalizeEntry('DRAKE'), 'drake');
    assert.strictEqual(normalizeEntry('   The Beatles'), 'the beatles');
  });

  it('should collapse multiple inner whitespaces into a single space', () => {
    assert.strictEqual(normalizeEntry('Radiohead    -   Karma   Police'), 'radiohead - karma police');
    assert.strictEqual(normalizeEntry('Coldplay\t\n  Yellow'), 'coldplay yellow');
  });

  it('should strip zero-width spaces and zero-width joiners/non-joiners/BOM', () => {
    // \u200B (zero-width space), \u200C (zero-width non-joiner), \u200D (zero-width joiner), \uFEFF (zero-width no-break space / BOM)
    const stringWithZeroWidth = 'Artist\u200BName\u200CWith\u200DHidden\uFEFFChars';
    assert.strictEqual(normalizeEntry(stringWithZeroWidth), 'artistnamewithhiddenchars');
  });

  it('should correctly normalize complex inputs combining casing, spaces, and zero-width characters', () => {
    const complexInput = '   \u200B  Kanye   \u200D WEST  \uFEFF ';
    assert.strictEqual(normalizeEntry(complexInput), 'kanye west');
  });
});
