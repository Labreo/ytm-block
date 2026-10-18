const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');

// Setup mock chrome API before loading storage
let storageData = {};
let storageSaved = null;
let lastError = null;
let errorOnSet = false;

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
        if (errorOnSet) {
          lastError = { message: 'Quota exceeded' };
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

const { getBlockData, addBlockedItem, removeBlockedItem } = require('../storage.js');

describe('getBlockData and list cleaning / deduplication', () => {
  beforeEach(() => {
    storageData = {};
    storageSaved = null;
    lastError = null;
    errorOnSet = false;
  });

  it('should clean, normalize, and de-duplicate lists correctly', async () => {
    storageData = {
      blockedArtists: ['  Taylor Swift  ', 'taylor swift', 'DRAKE', 'drake', ''],
      blockedSongs: ['song 1', 'SONG 1', '  song 2  ', null, 123],
      blockedAlbums: ['Album A', 'album a', 'Album B']
    };

    const data = await getBlockData();

    assert.deepStrictEqual(data.blockedArtists, ['taylor swift', 'drake']);
    assert.deepStrictEqual(data.blockedSongs, ['song 1', 'song 2']);
    assert.deepStrictEqual(data.blockedAlbums, ['album a', 'album b']);

    // Should have saved migrated data back to storage because cleanup changed length
    assert.ok(storageSaved);
    assert.deepStrictEqual(storageSaved.blockedArtists, ['taylor swift', 'drake']);
  });

  it('should not mark migrated if lists are already clean and normalized', async () => {
    storageData = {
      blockedArtists: ['drake', 'taylor swift'],
      blockedSongs: ['song 1', 'song 2'],
      blockedAlbums: ['album a']
    };

    const data = await getBlockData();

    assert.deepStrictEqual(data.blockedArtists, ['drake', 'taylor swift']);
    assert.deepStrictEqual(data.blockedSongs, ['song 1', 'song 2']);
    assert.deepStrictEqual(data.blockedAlbums, ['album a']);

    // No set call if not migrated
    assert.strictEqual(storageSaved, null);
  });

  it('should set migrated if undefined lists are returned', async () => {
    storageData = {};

    const data = await getBlockData();

    assert.deepStrictEqual(data, {
      blockedArtists: [],
      blockedSongs: [],
      blockedAlbums: []
    });

    assert.ok(storageSaved);
  });
});

describe('removeBlockedItem', () => {
  beforeEach(() => {
    storageData = {
      blockedArtists: ['taylor swift', 'drake'],
      blockedSongs: ['song 1', 'song 2'],
      blockedAlbums: ['album a', 'album b']
    };
    storageSaved = null;
    lastError = null;
    errorOnSet = false;
  });

  it('should return invalid_type for unsupported block types', async () => {
    const res = await removeBlockedItem('podcast', 'some item');
    assert.deepStrictEqual(res, { success: false, status: 'invalid_type' });
    assert.strictEqual(storageSaved, null);
  });

  it('should return empty_value for empty or non-string inputs', async () => {
    const nullRes = await removeBlockedItem('artist', null);
    assert.deepStrictEqual(nullRes, { success: false, status: 'empty_value' });

    const emptyRes = await removeBlockedItem('artist', '   ');
    assert.deepStrictEqual(emptyRes, { success: false, status: 'empty_value' });

    const undefinedRes = await removeBlockedItem('song', undefined);
    assert.deepStrictEqual(undefinedRes, { success: false, status: 'empty_value' });

    assert.strictEqual(storageSaved, null);
  });

  it('should return not_blocked when the item is not found in storage', async () => {
    const res = await removeBlockedItem('artist', 'kanye west');
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.status, 'not_blocked');
    assert.deepStrictEqual(res.data, {
      blockedArtists: ['taylor swift', 'drake'],
      blockedSongs: ['song 1', 'song 2'],
      blockedAlbums: ['album a', 'album b']
    });
    assert.strictEqual(storageSaved, null);
  });

  it('should return storage_error when chrome.runtime.lastError occurs during storage set', async () => {
    errorOnSet = true;
    const res = await removeBlockedItem('artist', 'drake');
    assert.deepStrictEqual(res, { success: false, status: 'storage_error' });
  });

  it('should successfully remove an existing blocked artist with normalized matching', async () => {
    const res = await removeBlockedItem('artist', '  DRAKE ');
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.status, 'unblocked');
    assert.deepStrictEqual(res.data.blockedArtists, ['taylor swift']);
    assert.deepStrictEqual(storageData.blockedArtists, ['taylor swift']);
  });

  it('should successfully remove an existing blocked song with normalized matching', async () => {
    const res = await removeBlockedItem('song', 'SONG 1');
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.status, 'unblocked');
    assert.deepStrictEqual(res.data.blockedSongs, ['song 2']);
    assert.deepStrictEqual(storageData.blockedSongs, ['song 2']);
  });

  it('should successfully remove an existing blocked album with normalized matching', async () => {
    const res = await removeBlockedItem('album', '  album b  ');
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.status, 'unblocked');
    assert.deepStrictEqual(res.data.blockedAlbums, ['album a']);
    assert.deepStrictEqual(storageData.blockedAlbums, ['album a']);
  });
});
