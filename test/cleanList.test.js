const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');

// Setup mock chrome API before loading storage
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
