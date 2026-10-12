const { performance } = require('perf_hooks');
const { normalizeEntry } = require('../storage.js');

// Current implementation of cleanList (forEach)
function currentCleanList(list) {
  let migrated = false;
  const seen = new Set();
  const cleaned = [];
  list.forEach(item => {
    const norm = normalizeEntry(item);
    if (norm && !seen.has(norm)) {
      seen.add(norm);
      cleaned.push(norm);
    }
  });
  if (cleaned.length !== list.length) {
    migrated = true;
  }
  return cleaned;
}

// Option A: Standard for loop
function cleanListForLoop(list) {
  let migrated = false;
  const seen = new Set();
  const cleaned = [];
  const len = list.length;
  for (let i = 0; i < len; i++) {
    const norm = normalizeEntry(list[i]);
    if (norm && !seen.has(norm)) {
      seen.add(norm);
      cleaned.push(norm);
    }
  }
  if (cleaned.length !== len) {
    migrated = true;
  }
  return cleaned;
}

// Option B: Array.from + Set
function cleanListArrayFrom(list) {
  let migrated = false;
  const seen = new Set();
  const cleaned = [];
  for (let i = 0; i < list.length; i++) {
    const norm = normalizeEntry(list[i]);
    if (norm && !seen.has(norm)) {
      seen.add(norm);
      cleaned.push(norm);
    }
  }
  if (cleaned.length !== list.length) {
    migrated = true;
  }
  return cleaned;
}

// Option C: Set initialized directly from filtered normalized items
function cleanListSetFrom(list) {
  let migrated = false;
  const cleaned = Array.from(new Set(
    list
      .map(normalizeEntry)
      .filter(Boolean)
  ));
  if (cleaned.length !== list.length) {
    migrated = true;
  }
  return cleaned;
}

function generateDataset(size) {
  const dataset = [];
  const sampleArtists = [
    '  Taylor Swift  ', 'taylor swift', 'DRAKE', 'drake', '  \u200B  Kanye   \u200D WEST  \uFEFF ',
    'Coldplay', 'COLDPLAY', 'Radiohead    -   Karma   Police', 'The Beatles', '  The Beatles  ',
    '', '   ', null, undefined, 123
  ];

  for (let i = 0; i < size; i++) {
    const sample = sampleArtists[i % sampleArtists.length];
    dataset.push(sample);
  }
  return dataset;
}

function benchmark(fn, list, iterations = 1000) {
  for (let i = 0; i < 50; i++) fn(list);

  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    fn(list);
  }
  const end = performance.now();
  return end - start;
}

function runBenchmarks() {
  const sizes = [10, 100, 1000, 10000];
  console.log('=== Performance Benchmarks Comparison ===\n');

  sizes.forEach(size => {
    const dataset = generateDataset(size);
    const iterations = size >= 10000 ? 200 : (size >= 1000 ? 2000 : 20000);

    const timeCurrent = benchmark(currentCleanList, dataset, iterations);
    const timeForLoop = benchmark(cleanListForLoop, dataset, iterations);
    const timeSetFrom = benchmark(cleanListSetFrom, dataset, iterations);

    console.log(`Dataset size: ${size} items (${iterations} iterations)`);
    console.log(`  Current (forEach):                 ${timeCurrent.toFixed(3)} ms`);
    console.log(`  For loop (cleanListForLoop):       ${timeForLoop.toFixed(3)} ms (${((timeCurrent - timeForLoop) / timeCurrent * 100).toFixed(2)}% improvement)`);
    console.log(`  Array.from(new Set) (SetFrom):     ${timeSetFrom.toFixed(3)} ms (${((timeCurrent - timeSetFrom) / timeCurrent * 100).toFixed(2)}% improvement)`);
    console.log('');
  });
}

runBenchmarks();
