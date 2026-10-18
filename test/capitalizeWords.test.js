const { describe, it } = require('node:test');
const assert = require('node:assert');
const { capitalizeWords } = require('../popup.js');

describe('capitalizeWords', () => {
  it('should capitalize the first letter of each word in a lowercase string', () => {
    assert.strictEqual(capitalizeWords('hello world'), 'Hello World');
    assert.strictEqual(capitalizeWords('taylor swift'), 'Taylor Swift');
    assert.strictEqual(capitalizeWords('ok computer'), 'Ok Computer');
  });

  it('should handle single word strings', () => {
    assert.strictEqual(capitalizeWords('hello'), 'Hello');
    assert.strictEqual(capitalizeWords('drake'), 'Drake');
  });

  it('should preserve existing capitalization', () => {
    assert.strictEqual(capitalizeWords('Hello World'), 'Hello World');
    assert.strictEqual(capitalizeWords('Taylor Swift'), 'Taylor Swift');
    assert.strictEqual(capitalizeWords('TAYLOR SWIFT'), 'TAYLOR SWIFT');
  });

  it('should handle single-letter words', () => {
    assert.strictEqual(capitalizeWords('a b c'), 'A B C');
    assert.strictEqual(capitalizeWords('a song for x'), 'A Song For X');
  });

  it('should handle strings with multiple consecutive spaces or leading/trailing spaces', () => {
    assert.strictEqual(capitalizeWords('hello   world'), 'Hello   World');
    assert.strictEqual(capitalizeWords('  hello world  '), '  Hello World  ');
  });

  it('should handle strings with numbers and special characters', () => {
    assert.strictEqual(capitalizeWords('123 song name'), '123 Song Name');
    assert.strictEqual(capitalizeWords('hello-world'), 'Hello-world');
    assert.strictEqual(capitalizeWords('artist & band'), 'Artist & Band');
  });

  it('should return empty string for empty string input', () => {
    assert.strictEqual(capitalizeWords(''), '');
  });

  it('should return empty string for non-string inputs', () => {
    assert.strictEqual(capitalizeWords(null), '');
    assert.strictEqual(capitalizeWords(undefined), '');
    assert.strictEqual(capitalizeWords(123), '');
    assert.strictEqual(capitalizeWords({}), '');
    assert.strictEqual(capitalizeWords([]), '');
    assert.strictEqual(capitalizeWords(true), '');
  });
});
