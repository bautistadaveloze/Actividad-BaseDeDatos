'use strict';

// Fake phones for rehearsing without a class:
//   npm run bots -- 25            (25 bots against localhost:3000)
//   URL=https://... npm run bots -- 10
// Bots play every step like a person would: they paint alone at a human pace
// (one point every 0.8–1.8 s), get signed up as workers by the cluster
// manager (no tap needed), paint their part and send the summary, and answer
// the automatic rounds with sums they really compute. The driver is whoever
// presents: the projector buttons drive the class.

const { io } = require('socket.io-client');
const km = require('../lib/kmeans');

const COUNT = Number(process.argv[2]) || 20;
const URL = process.env.URL || 'http://localhost:3000';
const NAMES = ['Ana', 'Bruno', 'Caro', 'Dani', 'Eze', 'Flor', 'Gonza', 'Hernán', 'Iara', 'Juli', 'Kevin', 'Lu',
  'Mati', 'Nahue', 'Oli', 'Pau', 'Quimey', 'Rocío', 'Santi', 'Tomi', 'Uriel', 'Vale', 'Wanda', 'Xime', 'Yami', 'Zoe'];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const between = (a, b) => a + Math.random() * (b - a);

function bot(i) {
  const name = `${NAMES[i % NAMES.length]}${i >= NAMES.length ? ` ${Math.floor(i / NAMES.length) + 1}` : ''}`;
  const socket = io(URL, { auth: { role: 'worker', token: `bot-${i}`, name } });
  let state = null;
  let soloSeed = null;
  const painting = new Set(); // `${dataKey}:${part}` in progress or sent

  async function paintSolo(seed) {
    let done = state.me.soloDone || 0;
    const pace = between(800, 1800);
    while (state && state.phase === 'solo' && state.solo && state.solo.seed === seed && !state.solo.over) {
      await sleep(pace * between(0.7, 1.3));
      if (!state.solo || state.solo.over || done >= state.solo.total) break;
      done += 1;
      socket.emit('solo:progress', { done });
    }
  }

  async function paintPart(key, partId) {
    await sleep(between(3000, 10000));
    if (!state || !state.manual || state.me.off) { painting.delete(key); return; }
    socket.emit('part:submit', { part: partId });
  }

  socket.on('state', async (s) => {
    state = s;
    if (s.phase === 'solo' && s.solo && !s.solo.over && s.solo.seed !== soloSeed) {
      soloSeed = s.solo.seed;
      paintSolo(soloSeed);
    }
    if (s.manual && !s.me.off) {
      for (const part of s.parts) {
        const key = `${s.dataKey}:${part.id}`;
        if (part.sent || painting.has(key)) continue;
        painting.add(key);
        paintPart(key, part.id);
      }
    }
  });

  socket.on('task', async ({ round, centers }) => {
    await sleep(between(400, 900));
    // Uses every point it holds now, inherited ones included.
    const points = state ? state.parts.flatMap((part) => part.points) : [];
    socket.emit('task:result', { round, sums: km.partialSums(points, centers) });
  });
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
