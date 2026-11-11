'use strict';

// K-Means helpers shared by the server, the bots and the smoke test.
// Points live on a 0–100 plane (y up) so students can reason about them by eye.

const K = 3;
const POINTS_PER_GROUP = 2;
const MIN_MARGIN = 8;
// On a phone a point is about 8 units wide and a center about 11: keep one
// phone's points apart from each other and clear of the initial centers.
const MIN_GAP = 10;
const CENTER_CLEARANCE = 10;

// Deliberately off starting centers, so the first "juntar" visibly moves them.
// They still converge to the three real groups (checked by scripts/smoke.js);
// worse starts leave one center covering two groups, a local minimum that
// confuses the demo.
const START = [
  { x: 26, y: 48 },
  { x: 60, y: 58 },
  { x: 78, y: 34 },
];

// Hidden "true" groups the points are drawn from.
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
const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
const dist = (a, b) => Math.sqrt(dist2(a, b));

function nearest(p, centers) {
  let best = 0;
  let bestD = Infinity;
  centers.forEach((c, i) => {
    const d = dist2(p, c);
    if (d < bestD) { bestD = d; best = i; }
  });
  return best;
}

// Distance to the second nearest center minus distance to the nearest one:
// how obvious the right answer is when painting by eye.
function margin(p, centers) {
  const d = centers.map((c) => dist(p, c)).sort((a, b) => a - b);
  return d[1] - d[0];
}

// The 6 points of one phone: 2 per real group, each with a margin of at
// least MIN_MARGIN against the initial centers, easiest (biggest margin) first.
function createPhonePoints(seed, centers = START) {
  const rand = mulberry32(seed);
  const out = [];
  for (let g = 0; g < K; g++) {
    for (let i = 0; i < POINTS_PER_GROUP; i++) {
      let best = null;
      // Rejection sampling; the cap only guards against a bad START/TRUE_CENTERS edit.
      for (let tries = 0; tries < 500; tries++) {
        const p = {
          x: Math.round(clamp(TRUE_CENTERS[g].x + gaussian(rand) * SPREAD, 2, 98)),
          y: Math.round(clamp(TRUE_CENTERS[g].y + gaussian(rand) * SPREAD, 2, 98)),
        };
        p.margin = margin(p, centers);
        const clear = out.every((q) => dist(p, q) >= MIN_GAP)
          && centers.every((c) => dist(p, c) >= CENTER_CLEARANCE);
        if (clear && p.margin >= MIN_MARGIN) { best = p; break; }
        if (!best || p.margin > best.margin) best = p;
      }
      best.group = g;
      out.push(best);
    }
  }
  return out.sort((a, b) => b.margin - a.margin);
}

// What one phone computes: per-center sum of x, sum of y and count.
function partialSums(points, centers) {
  const sums = centers.map(() => ({ sx: 0, sy: 0, n: 0 }));
  for (const p of points) {
    const s = sums[nearest(p, centers)];
    s.sx += p.x;
    s.sy += p.y;
    s.n += 1;
  }
  return sums;
}

// An empty group keeps its previous center.
function centersFromSums(totals, previous) {
  return totals.map((s, j) => (s.n > 0 ? { x: s.sx / s.n, y: s.sy / s.n } : { ...previous[j] }));
}

// One K-Means step over every point: new centers and the largest move.
function step(points, centers) {
  const next = centersFromSums(partialSums(points, centers), centers);
  const shift = Math.max(...next.map((c, j) => dist(c, centers[j])));
  return { centers: next, shift };
}

module.exports = {
  K, START, TRUE_CENTERS, MIN_MARGIN,
  mulberry32, createPhonePoints, margin, nearest, dist, dist2, partialSums, centersFromSums, step,
};
