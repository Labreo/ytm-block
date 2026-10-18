const test = require('node:test');
const assert = require('node:assert');
const { performance } = require('node:perf_hooks');

const { YTMBlockController } = require('../content.js');

// Helper to create simple mock DOM node
function createMockElement(tagName, id = '', className = '') {
  const children = [];
  let parentNode = null;
  let shadowRoot = null;

  const element = {
    tagName: tagName.toUpperCase(),
    id,
    className,
    shadowRoot: null,
    parentNode: null,
    children,
    querySelector(selector) {
      return mockQuerySelector(element, selector);
    },
    querySelectorAll(selector) {
      return mockQuerySelectorAll(element, selector);
    }
  };

  return element;
}

function mockQuerySelector(root, selector) {
  const selectors = selector.split(',').map(s => s.trim());
  for (const sel of selectors) {
    const match = mockQuerySelectorSingle(root, sel);
    if (match) return match;
  }
  return null;
}

function mockQuerySelectorSingle(root, selector) {
  // Simple mock selector parser
  // Supported: 'ytmusic-menu-popup-renderer #items', '#items.ytmusic-menu-popup-renderer', 'tp-yt-paper-listbox#items', '#items', 'tp-yt-paper-listbox'
  const allNodes = getAllDescendants(root);

  if (selector === 'ytmusic-menu-popup-renderer #items') {
    for (const node of allNodes) {
      if (node.tagName === 'YTMUSIC-MENU-POPUP-RENDERER') {
        const subNodes = getAllDescendants(node);
        const match = subNodes.find(n => n.id === 'items');
        if (match) return match;
      }
    }
  } else if (selector === '#items.ytmusic-menu-popup-renderer') {
    return allNodes.find(n => n.id === 'items' && n.className.includes('ytmusic-menu-popup-renderer')) || null;
  } else if (selector === 'tp-yt-paper-listbox#items') {
    return allNodes.find(n => n.tagName === 'TP-YT-PAPER-LISTBOX' && n.id === 'items') || null;
  } else if (selector === '#items') {
    return allNodes.find(n => n.id === 'items') || null;
  } else if (selector === 'tp-yt-paper-listbox') {
    return allNodes.find(n => n.tagName === 'TP-YT-PAPER-LISTBOX') || null;
  } else if (selector === 'ytmusic-menu-popup-renderer') {
    return allNodes.find(n => n.tagName === 'YTMUSIC-MENU-POPUP-RENDERER') || null;
  }
  return null;
}

function mockQuerySelectorAll(root, selector) {
  const match = mockQuerySelector(root, selector);
  return match ? [match] : [];
}

function getAllDescendants(root) {
  const results = [];
  function traverse(node) {
    if (!node || !node.children) return;
    for (const child of node.children) {
      results.push(child);
      traverse(child);
    }
  }
  traverse(root);
  return results;
}

test('YTMBlockController - findMenuItemsContainer correctness', async (t) => {
  const controller = new YTMBlockController();

  await t.test('finds container via standard Light DOM queries (ytmusic-menu-popup-renderer #items)', () => {
    const doc = createMockElement('html');
    const renderer = createMockElement('ytmusic-menu-popup-renderer');
    const items = createMockElement('div', 'items');
    renderer.children.push(items);
    doc.children.push(renderer);

    global.document = doc;
    assert.strictEqual(controller.findMenuItemsContainer(), items);
  });

  await t.test('finds container via #items.ytmusic-menu-popup-renderer', () => {
    const doc = createMockElement('html');
    const items = createMockElement('div', 'items', 'ytmusic-menu-popup-renderer');
    doc.children.push(items);

    global.document = doc;
    assert.strictEqual(controller.findMenuItemsContainer(), items);
  });

  await t.test('finds container via tp-yt-paper-listbox#items', () => {
    const doc = createMockElement('html');
    const listbox = createMockElement('tp-yt-paper-listbox', 'items');
    doc.children.push(listbox);

    global.document = doc;
    assert.strictEqual(controller.findMenuItemsContainer(), items = listbox);
  });

  await t.test('finds container via shadow DOM of ytmusic-menu-popup-renderer', () => {
    const doc = createMockElement('html');
    const renderer = createMockElement('ytmusic-menu-popup-renderer');
    const shadow = createMockElement('shadow-root');
    const items = createMockElement('div', 'items');
    shadow.children.push(items);
    renderer.shadowRoot = shadow;
    doc.children.push(renderer);

    global.document = doc;
    assert.strictEqual(controller.findMenuItemsContainer(), items);
  });

  await t.test('finds container via fallback paper-listbox', () => {
    const doc = createMockElement('html');
    const listbox = createMockElement('tp-yt-paper-listbox');
    doc.children.push(listbox);

    global.document = doc;
    assert.strictEqual(controller.findMenuItemsContainer(), listbox);
  });

  await t.test('returns null when menu container is not in DOM', () => {
    const doc = createMockElement('html');
    global.document = doc;
    assert.strictEqual(controller.findMenuItemsContainer(), null);
  });
});

test('YTMBlockController - findMenuItemsContainer performance benchmark', async (t) => {
  const controller = new YTMBlockController();

  await t.test('benchmark unoptimized vs optimized queries', () => {
    const doc = createMockElement('html');
    const renderer = createMockElement('ytmusic-menu-popup-renderer');
    renderer.shadowRoot = createMockElement('shadow-root');
    const listbox = createMockElement('tp-yt-paper-listbox', 'items');
    renderer.shadowRoot.children.push(listbox);
    doc.children.push(renderer);

    global.document = doc;

    // Unoptimized implementation simulation
    function unoptimizedFindMenuItemsContainer() {
      let container = doc.querySelector('ytmusic-menu-popup-renderer #items') ||
                      doc.querySelector('#items.ytmusic-menu-popup-renderer') ||
                      doc.querySelector('tp-yt-paper-listbox#items');
      if (container) return container;

      const popupRenderer = doc.querySelector('ytmusic-menu-popup-renderer');
      if (popupRenderer) {
        if (popupRenderer.shadowRoot) {
          container = popupRenderer.shadowRoot.querySelector('#items') ||
                      popupRenderer.shadowRoot.querySelector('tp-yt-paper-listbox#items');
          if (container) return container;
        }
        container = popupRenderer.querySelector('#items') ||
                    popupRenderer.querySelector('tp-yt-paper-listbox#items');
        if (container) return container;
      }

      const paperListbox = doc.querySelector('tp-yt-paper-listbox');
      if (paperListbox) return paperListbox;

      return null;
    }

    // Optimized implementation simulation
    function optimizedFindMenuItemsContainer() {
      let container = doc.querySelector('ytmusic-menu-popup-renderer #items, #items.ytmusic-menu-popup-renderer, tp-yt-paper-listbox#items');
      if (container) return container;

      const popupRenderer = doc.querySelector('ytmusic-menu-popup-renderer');
      if (popupRenderer) {
        if (popupRenderer.shadowRoot) {
          container = popupRenderer.shadowRoot.querySelector('#items, tp-yt-paper-listbox#items');
          if (container) return container;
        }
        container = popupRenderer.querySelector('#items, tp-yt-paper-listbox#items');
        if (container) return container;
      }

      const paperListbox = doc.querySelector('tp-yt-paper-listbox');
      if (paperListbox) return paperListbox;

      return null;
    }

    const iterations = 100000;

    // Warmup JIT
    for (let i = 0; i < 1000; i++) {
      unoptimizedFindMenuItemsContainer();
      optimizedFindMenuItemsContainer();
    }

    const startBaseline = performance.now();
    for (let i = 0; i < iterations; i++) {
      unoptimizedFindMenuItemsContainer();
    }
    const durationBaseline = performance.now() - startBaseline;

    const startOptimized = performance.now();
    for (let i = 0; i < iterations; i++) {
      optimizedFindMenuItemsContainer();
    }
    const durationOptimized = performance.now() - startOptimized;

    const speedup = ((durationBaseline - durationOptimized) / durationBaseline) * 100;
    console.log(`[Benchmark findMenuItemsContainer] Unoptimized: ${durationBaseline.toFixed(2)}ms`);
    console.log(`[Benchmark findMenuItemsContainer] Optimized:   ${durationOptimized.toFixed(2)}ms`);
    console.log(`[Benchmark findMenuItemsContainer] Speedup:     ${speedup.toFixed(2)}%`);
  });
});
