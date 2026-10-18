const test = require('node:test');
const assert = require('node:assert');
const { performance } = require('node:perf_hooks');
const { YTMBlockController } = require('../content.js');

test('extractArtist - benchmark textContent evaluation overhead', () => {
  const controller = new YTMBlockController();

  const anchorsData = [
    { href: '/watch?v=12345', text: 'Song Title' },
    { href: '/browse/VL12345', text: 'Playlist Title' },
    { href: '/browse/MPRE12345', text: 'Album Title' },
    { href: '/watch?v=67890', text: 'Video Title' },
    { href: '/artist/UC123456789', text: ' Artist Name ' }
  ];

  let textAccesses = 0;

  function createMockTarget() {
    const mockAnchors = anchorsData.map(({ href, text }) => ({
      getAttribute(attr) { return attr === 'href' ? href : null; },
      get textContent() {
        textAccesses++;
        return text;
      }
    }));

    const mockResponsiveItem = {
      querySelectorAll(selector) { return selector === 'a' ? mockAnchors : []; },
      querySelector() { return null; }
    };

    return {
      closest(selector) {
        return selector === 'ytmusic-responsive-list-item-renderer' ? mockResponsiveItem : null;
      }
    };
  }

  const target = createMockTarget();
  const iterations = 500000;

  // Warmup V8
  for (let i = 0; i < 10000; i++) controller.extractArtist(target);

  textAccesses = 0;
  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    controller.extractArtist(target);
  }
  const duration = performance.now() - start;

  console.log(`[Benchmark] extractArtist optimized implementation: ${duration.toFixed(2)}ms (${textAccesses} textContent accesses across ${iterations} iterations)`);

  const result = controller.extractArtist(target);
  assert.strictEqual(result.value, 'Artist Name');
  assert.strictEqual(result.source, 'Row Artist Link extraction');
  assert.strictEqual(textAccesses / (iterations + 1), 1, 'textContent should only be accessed once per loop iteration for matching href');
});
