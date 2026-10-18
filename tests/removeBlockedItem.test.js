const test = require('node:test');
const assert = require('node:assert/strict');

// Set up mock DOM and browser globals if needed before requiring content.js
if (typeof global.window === 'undefined') {
  global.window = {};
}

// Global mocks for removeBlockedItem and chrome storage/runtime
global.removeBlockedItem = async (type, name) => {
  if (global.__mockRemoveResult) {
    return global.__mockRemoveResult;
  }
  return { success: true };
};

global.chrome = {
  runtime: {
    id: 'test-extension-id',
    onMessage: { addListener: () => {} }
  }
};

const { YTMBlockController } = require('../content.js');

test('removeBlockedItemFromInline - success flow', async () => {
  const controller = new YTMBlockController();
  controller.showToastNotification = (name, action, type) => {
    controller.lastToast = { name, action, type };
  };

  global.__mockRemoveResult = { success: true };
  controller.removeBlockedItemFromInline('artist', 'Test Artist');

  // Wait for promise microtask resolution
  await new Promise(resolve => setTimeout(resolve, 50));

  assert.deepEqual(controller.lastToast, {
    name: 'Test Artist',
    action: 'unblocked',
    type: 'artist'
  });
});

test('removeBlockedItemFromInline - failure flow', async () => {
  const controller = new YTMBlockController();
  controller.showToastNotification = (name, action, type) => {
    controller.lastToast = { name, action, type };
  };

  global.__mockRemoveResult = { success: false };
  controller.removeBlockedItemFromInline('artist', 'Test Artist');

  // Wait for promise microtask resolution
  await new Promise(resolve => setTimeout(resolve, 50));

  assert.deepEqual(controller.lastToast, {
    name: 'Test Artist',
    action: 'failed',
    type: 'artist'
  });
});

test('removeBlockedItemFromInline - invalid context flow', async () => {
  const controller = new YTMBlockController();
  controller.isContextValid = () => false;
  controller.showToastNotification = (name, action, type) => {
    controller.lastToast = { name, action, type };
  };

  global.__mockRemoveResult = { success: true };
  controller.removeBlockedItemFromInline('artist', 'Test Artist');

  await new Promise(resolve => setTimeout(resolve, 50));

  assert.equal(controller.lastToast, undefined);
});
