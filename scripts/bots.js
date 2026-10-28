'use strict';

// Fake executors for rehearsing without a class:
//   npm run bots -- 25            (25 bots against localhost:3000)
//   URL=https://... npm run bots -- 10
// Bots join, assign their points (with a few honest mistakes), pick what
// to send like a real class would, and run tasks honoring the delays.

const { io } = require('socket.io-client');
const km = require('../lib/kmeans');

const COUNT = Number(process.argv[2]) || 20;
const URL = process.env.URL || 'http://localhost:3000';
const NAMES = ['Ana', 'Bruno', 'Caro', 'Dani', 'Eze', 'Flor', 'Gonza', 'Hernán', 'Iara', 'Juli', 'Kevin', 'Lu',
  'Mati', 'Nahue', 'Oli', 'Pau', 'Quimey', 'Rocío', 'Santi', 'Tomi', 'Uriel', 'Vale', 'Wanda', 'Xime', 'Yami', 'Zoe'];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pick = (weights) => {
  let r = Math.random() * Object.values(weights).reduce((a, b) => a + b, 0);
  for (const [k, w] of Object.entries(weights)) { r -= w; if (r <= 0) return k; }
  return Object.keys(weights)[0];
};

function bot(i) {
  const name = `${NAMES[i % NAMES.length]}${i >= NAMES.length ? ` ${Math.floor(i / NAMES.length) + 1}` : ''}`;
  const socket = io(URL, { auth: { role: 'worker', token: `bot-${i}`, name, fresh: true } });
  const cache = new Map();
  let submittedFor = null;
  const queue = [];
  let busy = false;
  const cancelled = new Set();

  socket.on('state', async (s) => {
    const task = s.manual && s.manual.task;
    if (s.phase !== 'map' || !task || s.manual.submitted || !s.me.alive) return;
    const key = `${task.pid}:${task.from}`;
    if (submittedFor === key) return;
    submittedFor = key;
    cache.set(task.pid, task.points);
    await sleep(2000 + Math.random() * 9000);
    const labels = task.points.map((p) => (Math.random() < 0.08 ? Math.floor(Math.random() * km.K) : km.nearest(p, s.centroids)));
    socket.emit('manual:submit', { option: pick({ A: 3, B: 4, C: 4 }), labels });
  });

  socket.on('cache:clear', () => cache.clear());
  socket.on('task:cancel', ({ key }) => cancelled.add(key));
  socket.on('task', (t) => { queue.push(t); run(); });

  async function run() {
    if (busy) return;
    busy = true;
    while (queue.length) {
      const t = queue.shift();
      if (t.points && t.cache) cache.set(t.pid, t.points);
      const pts = t.points || cache.get(t.pid);
      if (!pts) continue;
      await sleep(t.readMs + t.computeMs + t.writeMs);
      if (cancelled.has(t.key)) continue;
      const { sums, cost } = km.partialStats(pts, t.centroids);
      socket.emit('task:result', { key: t.key, sums, cost });
    }
    busy = false;
  }
  return socket;
}

const bots = [];
(async () => {
  for (let i = 0; i < COUNT; i++) {
    bots.push(bot(i));
    await sleep(120);
  }
  console.log(`${COUNT} bots conectados a ${URL}. Ctrl+C para cortar.`);
})();
process.on('SIGINT', () => { bots.forEach((b) => b.close()); process.exit(0); });
