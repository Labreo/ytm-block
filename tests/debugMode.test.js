const test = require('node:test');
const assert = require('node:assert');
const { YTMBlockController } = require('../content.js');

test('YTMBlockController - debugMode hardening', async (t) => {
  await t.test('defaults debugMode to false to prevent sensitive telemetry exposure', () => {
    const controller = new YTMBlockController();
    assert.strictEqual(controller.debugMode, false);
  });

  await t.test('suppresses debug level logging when debugMode is false', () => {
    const controller = new YTMBlockController();

    let consoleLogged = false;
    const originalLog = console.log;
    console.log = () => {
      consoleLogged = true;
    };

    try {
      controller.log('debug', 'Sensitive debug message', { userHabits: 'data' });
      assert.strictEqual(consoleLogged, false);
    } finally {
      console.log = originalLog;
    }
  });

  await t.test('allows debug level logging when debugMode is explicitly set to true', () => {
    const controller = new YTMBlockController();
    controller.debugMode = true;

    let consoleLogged = false;
    const originalLog = console.log;
    console.log = () => {
      consoleLogged = true;
    };

    try {
      controller.log('debug', 'Debug mode enabled message');
      assert.strictEqual(consoleLogged, true);
    } finally {
      console.log = originalLog;
    }
  });
});
