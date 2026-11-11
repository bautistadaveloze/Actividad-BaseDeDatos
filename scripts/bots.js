'use strict';

// Fake phones for rehearsing without a class:
//   npm run bots -- 25            (25 bots against localhost:3000)
//   URL=https://... npm run bots -- 10
// Bots join, paint by waiting 2–9 s like a person would, and answer every
// task after 400–900 ms with sums they really compute.

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
  let paintedKey = null;

  socket.on('state', async (s) => {
    state = s;
    if (s.phase !== 'paint' || s.me.sent || s.me.off || !s.points.length || paintedKey === s.paintKey) return;
    paintedKey = s.paintKey;
    await sleep(between(2000, 9000));
    if (state.phase === 'paint' && !state.me.sent) socket.emit('paint:submit');
  });

  socket.on('task', async ({ round, centers }) => {
    await sleep(between(400, 900));
    // Uses every point it holds now, inherited ones included.
    const sums = km.partialSums(state ? state.points : [], centers);
    socket.emit('task:result', { round, sums });
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
