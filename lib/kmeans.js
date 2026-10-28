'use strict';

// K-Means helpers shared by the server and the test bots.
// Points live on a 0–100 plane so students can reason about them by hand.

const K = 3;

// Deliberately off starting centroids: the first manual round has points
// near the boundaries, so students actually have to measure. They still
// converge to the three real segments (checked over 200 random datasets,
// with and without jitter from a sloppy manual round); worse starts left
// one centroid covering two segments, a local minimum that confuses the demo.
const START = [
  { x: 26, y: 48 },
  { x: 60, y: 58 },
  { x: 78, y: 34 },
];

// Hidden "true" segments of the synthetic customer dataset.
const TRUE_CENTERS = [
  { x: 22, y: 72 },
  { x: 72, y: 78 },
  { x: 62, y: 22 },
];
const SPREAD = 9;

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rand) {
  let u = 0;
  while (u === 0) u = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Builds `numPartitions` partitions of `perPartition` points each.
// Points are shuffled before slicing so every partition mixes segments,
// like a real file split by byte ranges rather than by meaning.
function createDataset(numPartitions, perPartition, seed = Date.now()) {
  const rand = mulberry32(seed);
  const total = numPartitions * perPartition;
  const points = [];
  for (let i = 0; i < total; i++) {
    const c = TRUE_CENTERS[i % K];
    points.push({
      x: Math.round(clamp(c.x + gaussian(rand) * SPREAD, 2, 98)),
      y: Math.round(clamp(c.y + gaussian(rand) * SPREAD, 2, 98)),
    });
  }
  for (let i = points.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [points[i], points[j]] = [points[j], points[i]];
  }
  points.forEach((p, i) => { p.id = i; });

  const partitions = [];
  for (let p = 0; p < numPartitions; p++) {
    const from = p * perPartition;
    partitions.push({ id: p + 1, from, to: from + perPartition - 1, owner: null });
  }
  return { points, partitions, seed };
}

const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

function nearest(p, centroids) {
  let best = 0;
  let bestD = Infinity;
  centroids.forEach((c, i) => {
    const d = dist2(p, c);
    if (d < bestD) { bestD = d; best = i; }
  });
  return best;
}

// What one executor computes for its partition: per-cluster sums and
// counts (the combiner output) plus its share of the cost (WSSSE).
function partialStats(points, centroids) {
  const sums = centroids.map(() => ({ sx: 0, sy: 0, n: 0 }));
  let cost = 0;
  for (const p of points) {
    const j = nearest(p, centroids);
    sums[j].sx += p.x;
    sums[j].sy += p.y;
    sums[j].n += 1;
    cost += dist2(p, centroids[j]);
  }
  return { sums, cost };
}

function sumsFromLabels(points, labels) {
  const sums = Array.from({ length: K }, () => ({ sx: 0, sy: 0, n: 0 }));
  points.forEach((p, i) => {
    const s = sums[labels[i]];
    s.sx += p.x;
    s.sy += p.y;
    s.n += 1;
  });
  return sums;
}

function centroidsFromSums(totals, previous) {
  return totals.map((s, j) => (s.n > 0
    ? { x: s.sx / s.n, y: s.sy / s.n }
    : { ...previous[j] }));
}

module.exports = {
  K,
  START,
  createDataset,
  nearest,
  dist2,
  partialStats,
  sumsFromLabels,
  centroidsFromSums,
};
