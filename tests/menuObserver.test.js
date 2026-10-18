const test = require('node:test');
const assert = require('node:assert');
const { performance } = require('node:perf_hooks');

test('MutationObserver tag matching performance benchmark', async (t) => {
  await t.test('compares toLowerCase vs direct uppercase comparison', () => {
    const mutations = [];
    for (let i = 0; i < 500; i++) {
      const addedNodes = [];
      for (let j = 0; j < 20; j++) {
        addedNodes.push({
          nodeType: 1,
          tagName: (i + j) % 7 === 0 ? 'YTMUSIC-MENU-POPUP-RENDERER' : 'DIV'
        });
      }
      mutations.push({ addedNodes });
    }

    function checkBaseline(mutations) {
      let hasPopupChange = false;
      for (let i = 0; i < mutations.length; i++) {
        const mutation = mutations[i];
        if (mutation.addedNodes && mutation.addedNodes.length > 0) {
          for (let j = 0; j < mutation.addedNodes.length; j++) {
            const node = mutation.addedNodes[j];
            if (node && node.nodeType === 1) {
              const tagName = node.tagName ? node.tagName.toLowerCase() : '';
              if (tagName === 'ytmusic-menu-popup-renderer' ||
                  tagName === 'tp-yt-paper-listbox') {
                hasPopupChange = true;
                break;
              }
            }
          }
        }
        if (hasPopupChange) break;
      }
      return hasPopupChange;
    }

    function checkOptimized(mutations) {
      let hasPopupChange = false;
      for (let i = 0; i < mutations.length; i++) {
        const mutation = mutations[i];
        if (mutation.addedNodes && mutation.addedNodes.length > 0) {
          for (let j = 0; j < mutation.addedNodes.length; j++) {
            const node = mutation.addedNodes[j];
            if (node && node.nodeType === 1) {
              const tagName = node.tagName || '';
              if (tagName === 'YTMUSIC-MENU-POPUP-RENDERER' ||
                  tagName === 'TP-YT-PAPER-LISTBOX') {
                hasPopupChange = true;
                break;
              }
            }
          }
        }
        if (hasPopupChange) break;
      }
      return hasPopupChange;
    }

    // Warmup
    for (let i = 0; i < 50; i++) {
      checkBaseline(mutations);
      checkOptimized(mutations);
    }

    const startBaseline = performance.now();
    for (let i = 0; i < 2000; i++) {
      checkBaseline(mutations);
    }
    const durationBaseline = performance.now() - startBaseline;

    const startOptimized = performance.now();
    for (let i = 0; i < 2000; i++) {
      checkOptimized(mutations);
    }
    const durationOptimized = performance.now() - startOptimized;

    const speedup = ((durationBaseline - durationOptimized) / durationBaseline) * 100;
    console.log(`[MutationObserver Benchmark] Baseline (toLowerCase): ${durationBaseline.toFixed(2)}ms`);
    console.log(`[MutationObserver Benchmark] Optimized (uppercase):   ${durationOptimized.toFixed(2)}ms`);
    console.log(`[MutationObserver Benchmark] Speedup: ${speedup.toFixed(2)}%`);

    assert.strictEqual(checkBaseline(mutations), checkOptimized(mutations));
  });
});
