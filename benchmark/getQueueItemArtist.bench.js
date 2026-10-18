const { performance } = require('perf_hooks');

// Benchmark querySelector fallback in getQueueItemArtist
// Baseline: multiple querySelector calls
function baselineGetByline(item) {
  return item.querySelector('.byline') || item.querySelector('[class*="byline"]');
}

// Optimized: single combined querySelector call
function optimizedGetByline(item) {
  return item.querySelector('.byline, [class*="byline"]');
}

// Mock item implementation that simulates DOM querySelector traversal
class MockItem {
  constructor(hasByline, hasClassByline) {
    this.hasByline = hasByline;
    this.hasClassByline = hasClassByline;
  }

  querySelector(selector) {
    const selectors = selector.split(',').map(s => s.trim());
    for (const sel of selectors) {
      if (sel === '.byline' && this.hasByline) {
        return { textContent: 'Artist Name' };
      }
      if (sel === '[class*="byline"]' && this.hasClassByline) {
        return { textContent: 'Artist Name' };
      }
    }
    return null;
  }
}

function runBenchmark() {
  // Test cases:
  // 1. First selector matches (.byline)
  // 2. Second selector matches ([class*="byline"]) - where baseline does 2 queries, optimized does 1 query
  // 3. Neither selector matches - where baseline does 2 failed queries, optimized does 1 failed query
  const items = [
    new MockItem(true, false),
    new MockItem(false, true),
    new MockItem(false, false)
  ];

  const iterations = 500000;

  // Warmup
  for (let i = 0; i < 10000; i++) {
    for (const item of items) {
      baselineGetByline(item);
      optimizedGetByline(item);
    }
  }

  // Baseline Benchmark
  const startBaseline = performance.now();
  for (let i = 0; i < iterations; i++) {
    for (const item of items) {
      baselineGetByline(item);
    }
  }
  const endBaseline = performance.now();
  const baselineTime = endBaseline - startBaseline;

  // Optimized Benchmark
  const startOptimized = performance.now();
  for (let i = 0; i < iterations; i++) {
    for (const item of items) {
      optimizedGetByline(item);
    }
  }
  const endOptimized = performance.now();
  const optimizedTime = endOptimized - startOptimized;

  const diff = baselineTime - optimizedTime;
  const pct = (diff / baselineTime) * 100;

  console.log('=== getQueueItemArtist querySelector Benchmark ===');
  console.log(`Iterations: ${iterations} x 3 items`);
  console.log(`Baseline (multiple querySelector): ${baselineTime.toFixed(3)} ms`);
  console.log(`Optimized (combined querySelector): ${optimizedTime.toFixed(3)} ms`);
  console.log(`Improvement: ${diff.toFixed(3)} ms (${pct.toFixed(2)}%)`);
}

runBenchmark();
