const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');

let storageData = {};
let storageSaved = null;
let lastError = null;

global.chrome = {
  runtime: {
    get lastError() { return lastError; }
  },
  storage: {
    sync: {
      get: (keys, callback) => {
        const res = {};
        keys.forEach(k => {
          if (k in storageData) res[k] = storageData[k];
        });
        callback(res);
      },
      set: (data, callback) => {
        if (lastError) {
          if (callback) callback();
          return;
        }
        storageSaved = data;
        Object.assign(storageData, data);
        if (callback) callback();
      }
    }
  }
};

const { addBlockedItem } = require('../storage.js');

describe('addBlockedItem', () => {
  beforeEach(() => {
    storageData = {};
    storageSaved = null;
    lastError = null;
  });

  it('should return invalid_type for unsupported block categories', async () => {
    const resNull = await addBlockedItem(null, 'Some Artist');
    assert.deepStrictEqual(resNull, { success: false, status: 'invalid_type' });

    const resInvalid = await addBlockedItem('genre', 'Pop');
    assert.deepStrictEqual(resInvalid, { success: false, status: 'invalid_type' });
  });

  it('should return empty_value for empty, whitespace, or non-string inputs', async () => {
    const resEmpty = await addBlockedItem('artist', '');
    assert.deepStrictEqual(resEmpty, { success: false, status: 'empty_value' });

    const resSpaces = await addBlockedItem('song', '   ');
    assert.deepStrictEqual(resSpaces, { success: false, status: 'empty_value' });

    const resNull = await addBlockedItem('album', null);
    assert.deepStrictEqual(resNull, { success: false, status: 'empty_value' });
  });

  it('should successfully add and normalize a new blocked item for artist, song, and album', async () => {
    const resArtist = await addBlockedItem('artist', '  Taylor Swift  ');
    assert.strictEqual(resArtist.success, true);
    assert.strictEqual(resArtist.status, 'blocked');
    assert.deepStrictEqual(resArtist.data.blockedArtists, ['taylor swift']);

    const resSong = await addBlockedItem('song', '  Karma   Police  ');
    assert.strictEqual(resSong.success, true);
    assert.strictEqual(resSong.status, 'blocked');
    assert.deepStrictEqual(resSong.data.blockedSongs, ['karma police']);

    const resAlbum = await addBlockedItem('album', 'OK COMPUTER');
    assert.strictEqual(resAlbum.success, true);
    assert.strictEqual(resAlbum.status, 'blocked');
    assert.deepStrictEqual(resAlbum.data.blockedAlbums, ['ok computer']);
  });

  it('should sort items alphabetically upon adding', async () => {
    storageData = {
      blockedArtists: ['drake', 'radiohead']
    };

    const res = await addBlockedItem('artist', 'Coldplay');
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.status, 'blocked');
    assert.deepStrictEqual(res.data.blockedArtists, ['coldplay', 'drake', 'radiohead']);
    assert.deepStrictEqual(storageSaved, { blockedArtists: ['coldplay', 'drake', 'radiohead'] });
  });

  it('should return already_blocked when item is already present in storage', async () => {
    storageData = {
      blockedArtists: ['taylor swift']
    };

    const res = await addBlockedItem('artist', 'TAYLOR SWIFT');
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.status, 'already_blocked');
    assert.deepStrictEqual(res.data.blockedArtists, ['taylor swift']);
  });

  it('should return storage_error if chrome.runtime.lastError occurs during storage set', async () => {
    lastError = { message: 'Quota exceeded' };

    const res = await addBlockedItem('artist', 'Drake');
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.status, 'storage_error');
  });
});
