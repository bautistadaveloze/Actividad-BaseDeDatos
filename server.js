'use strict';

const path = require('path');
const http = require('http');
const os = require('os');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const { Server } = require('socket.io');
const QRCode = require('qrcode');
const km = require('./lib/kmeans');

const PORT = Number(process.env.PORT) || 3000;
const DRIVER_KEY = process.env.DRIVER_KEY || crypto.randomBytes(3).toString('hex');
const PUBLIC_URL = (process.env.PUBLIC_URL || `http://${lanAddress()}:${PORT}`).replace(/\/+$/, '');

const PHASES = ['lobby', 'paint', 'combine', 'auto', 'fail', 'end'];
const K = km.K;
const POINTS_PER_PHONE = 6;
const MAX_PHONES = 150;
const TASK_TIMEOUT_MS = 2000; // longest wait for a phone's answer
const ROUND_PAUSE_MS = 700; // pause between rounds in "Seguir solo"
const EMPTY_ROUND_MS = 600; // length of a round when nobody can be asked
const CONVERGED_SHIFT = 0.5;
const MAX_ROUNDS = 15;
const PENALTY_MS = 3000; // each mistake while painting adds this to the score
const MAX_MISTAKES = 500;
const SPIN_MS = Number(process.env.SPIN_MS) > 0 ? Number(process.env.SPIN_MS) : 4500; // roulette length

// ---------------------------------------------------------------- http

const app = express();
const server = http.createServer(app);
const io = new Server(server, { pingInterval: 4000, pingTimeout: 7000 });

const publicDir = path.join(__dirname, 'presentacion-web', 'public');
app.get('/', (_req, res) => res.sendFile(path.join(publicDir, 'worker.html')));
app.get('/driver', (_req, res) => res.sendFile(path.join(publicDir, 'driver.html')));
app.get('/fichas', (_req, res) => res.sendFile(path.join(publicDir, 'fichas.html')));
app.get('/teoria', (_req, res) => res.sendFile(path.join(publicDir, 'teoria.html')));
app.get('/presentacion', (_req, res) => res.sendFile(path.join(publicDir, 'presentacion.html')));
// Atkinson Hyperlegible: drawn for legibility at a distance, which is
// exactly the back row of a classroom looking at a projector.
app.use('/fonts/sans', express.static(path.join(__dirname, 'node_modules/@fontsource-variable/atkinson-hyperlegible-next/files'), { maxAge: '7d' }));
app.use('/fonts/mono', express.static(path.join(__dirname, 'node_modules/@fontsource-variable/atkinson-hyperlegible-mono/files'), { maxAge: '7d' }));

const iconSprite = buildIconSprite([
  'play', 'pause', 'rotate-ccw', 'contrast', 'qr-code', 'maximize', 'x', 'check', 'skull', 'zap',
  'arrow-right', 'arrow-left', 'send', 'circle-alert', 'users', 'power', 'power-off', 'repeat',
  'sparkles', 'monitor', 'smartphone', 'wifi-off', 'layers', 'timer',
  'trophy', 'medal', 'award', 'target', 'heart-handshake', 'shield-check', 'dices', 'party-popper',
]);
app.get('/icons.svg', (_req, res) => res.type('image/svg+xml').send(iconSprite));

app.get('/qr.svg', async (_req, res) => {
  const svg = await QRCode.toString(PUBLIC_URL, {
    type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' },
  });
  res.type('image/svg+xml').send(svg);
});

app.use(express.static(publicDir, { extensions: ['html'], index: false }));

// ---------------------------------------------------------------- state

// phone: { id, token, name, socket, connected, off, sent, pending, rounds,
//          hasData, inheritedFrom, paintStart, paint, heir, survivor, fallen }
//   pending = round number awaiting an answer
//   paintStart = when it got unpainted points (null otherwise)
//   paint = { ms, mistakes, score, points } once it submitted
//   heir / survivor / fallen = medal facts, kept until the data is recreated
const S = {
  phase: 'lobby',
  phones: new Map(), // token -> phone
  byId: new Map(), // id -> phone
  nextId: 1,
  points: [], // { x, y, owner, home, label }
  dataVersion: 0, // bumps every time the data is created from scratch
  centers: cloneCenters(km.START),
  trail: [cloneCenters(km.START)],
  round: 0,
  shifts: [],
  progress: { done: 0, total: 0 },
  busy: false,
  running: false,
  converged: false,
  lastFail: null,
  failCount: 0, // never goes down: shared by roulette spins and shutdowns, so clients can spot a new one by `n`
  spin: null, // { n, candidates, victim, ms, timer } while the roulette turns
  summaries: 0,
  roundCenters: null, // centers the round in flight started from
  roundNo: 0,
  roundTimer: null,
  runTimer: null,
};

const phoneList = () => [...S.byId.values()];

function cloneCenters(cs) {
  return cs.map((c) => ({ x: c.x, y: c.y }));
}

const connectedOn = () => [...S.byId.values()].filter((p) => p.connected && !p.off);
const hasPoints = (p) => S.points.some((pt) => pt.owner === p.id);

function statusOf(p, count) {
  if (p.off) return 'off';
  if (!p.connected) return 'offline';
  if (S.phase === 'lobby') return 'waiting';
  if (S.phase === 'paint') return p.sent ? 'sent' : 'painting';
  return p.pending !== null && count > 0 ? 'working' : 'idle';
}

// ---------------------------------------------------------------- broadcast

let broadcastTimer = null;
function broadcast() {
  if (broadcastTimer) return;
  broadcastTimer = setTimeout(() => {
    broadcastTimer = null;
    const race = raceInfo();
    io.to('drivers').emit('state', driverSnapshot(race));
    const owned = new Map();
    for (const pt of S.points) {
      if (!owned.has(pt.owner)) owned.set(pt.owner, []);
      owned.get(pt.owner).push(pt);
    }
    for (const p of S.byId.values()) {
      if (p.socket && p.connected) p.socket.emit('state', phoneSnapshot(p, owned.get(p.id) || [], race));
    }
  }, 60);
}

function progressNow() {
  if (S.phase === 'paint') {
    const owners = new Set(S.points.map((pt) => pt.owner));
    const withPoints = [...S.byId.values()].filter((p) => owners.has(p.id));
    return { done: withPoints.filter((p) => p.sent).length, total: withPoints.length };
  }
  return { ...S.progress };
}

// ---------------------------------------------------------------- race

// Lowest score wins; ties go to the lower `ms`, then to the lower id.
function compareRace(a, b) {
  return (a.score - b.score) || (a.ms - b.ms) || (a.id - b.id);
}

// Everything the race screens show, computed from the phones that submitted.
function raceInfo() {
  const entries = phoneList().filter((p) => p.paint).map((p) => ({
    id: p.id, name: p.name, ms: p.paint.ms, mistakes: p.paint.mistakes, score: p.paint.score, points: p.paint.points,
  })).sort(compareRace);
  const rank = new Map(entries.map((e, i) => [e.id, i + 1]));
  let parallelMs = null;
  let soloMs = null;
  let slowest = null;
  if (entries.length) {
    for (const e of entries) if (!slowest || e.ms > slowest.ms) slowest = { name: e.name, ms: e.ms };
    parallelMs = slowest.ms;
    const totalMs = entries.reduce((a, e) => a + e.ms, 0);
    const painted = entries.reduce((a, e) => a + e.points, 0);
    soloMs = Math.round((totalMs / painted) * S.points.length);
  }
  return {
    rank,
    of: entries.length,
    parallelMs,
    soloMs,
    slowest,
    podium: entries.slice(0, 3).map(({ id, name, ms, mistakes, score }) => ({ id, name, ms, mistakes, score })),
  };
}

const MEDAL_ORDER = ['fastest', 'podium', 'perfect', 'heir', 'survivor', 'fallen'];

function medalsOf(p, race) {
  const rank = race.rank.get(p.id);
  const has = {
    fastest: rank === 1,
    podium: rank === 2 || rank === 3,
    perfect: !!p.paint && p.paint.mistakes === 0,
    heir: p.heir,
    survivor: p.survivor,
    fallen: p.fallen,
  };
  const medals = MEDAL_ORDER.filter((m) => has[m]);
  return medals.length ? medals : ['cluster'];
}

function driverSnapshot(race = raceInfo()) {
  const count = new Map();
  const inherited = new Map();
  for (const pt of S.points) {
    count.set(pt.owner, (count.get(pt.owner) || 0) + 1);
    if (pt.owner !== pt.home) inherited.set(pt.owner, (inherited.get(pt.owner) || 0) + 1);
  }
  return {
    phase: S.phase,
    publicUrl: PUBLIC_URL,
    phones: [...S.byId.values()].map((p) => ({
      id: p.id,
      name: p.name,
      status: statusOf(p, count.get(p.id) || 0),
      points: count.get(p.id) || 0,
      inherited: inherited.get(p.id) || 0,
    })),
    points: S.points.map((pt) => ({ x: pt.x, y: pt.y, owner: pt.owner, home: pt.home, label: pt.label })),
    centers: S.centers,
    trail: S.trail,
    round: S.round,
    shifts: S.shifts,
    progress: progressNow(),
    busy: S.busy,
    running: S.running,
    converged: S.converged,
    lastFail: S.lastFail,
    race: {
      podium: race.podium,
      finished: race.of,
      parallelMs: race.parallelMs,
      soloMs: race.soloMs,
      slowest: race.slowest,
      penaltyMs: PENALTY_MS,
    },
    spin: S.spin && { n: S.spin.n, candidates: S.spin.candidates, victim: S.spin.victim, ms: S.spin.ms },
    stats: { phones: S.byId.size, points: S.points.length, summaries: S.summaries },
  };
}

function phoneSnapshot(p, mine, race) {
  // Own points first, then inherited ones; both keep their creation order.
  const own = mine.filter((pt) => pt.home === p.id);
  const inherited = mine.filter((pt) => pt.home !== p.id);
  return {
    phase: S.phase,
    me: {
      id: p.id,
      name: p.name,
      off: p.off,
      sent: p.sent,
      working: p.pending !== null,
      rounds: p.rounds,
      inheritedFrom: p.inheritedFrom,
      paint: p.paint && {
        ms: p.paint.ms,
        mistakes: p.paint.mistakes,
        score: p.paint.score,
        rank: race.rank.get(p.id),
        of: race.of,
      },
      medals: medalsOf(p, race),
    },
    centers: S.centers,
    points: [...own, ...inherited].map((pt) => ({ x: pt.x, y: pt.y, label: pt.label })),
    own: own.length,
    paintKey: `${S.dataVersion}:${p.id}`,
    round: S.round,
    converged: S.converged,
    totals: { phones: S.byId.size, points: S.points.length },
    race: { parallelMs: race.parallelMs, soloMs: race.soloMs },
    // Only candidates of a turning roulette get to see it.
    spin: S.spin && S.spin.candidates.includes(p.id) ? { n: S.spin.n, ms: S.spin.ms } : null,
    lastFail: S.lastFail && {
      n: S.lastFail.n,
      victim: S.lastFail.victim,
      heir: S.lastFail.heir,
      points: S.lastFail.points,
      me: p.id === S.lastFail.victimId ? 'victim' : p.id === S.lastFail.heirId ? 'heir' : 'safe',
    },
  };
}

// ---------------------------------------------------------------- data

function newPointsFor(p) {
  const seed = Math.floor(Math.random() * 0x100000000);
  // Late phones get their points already painted (except during paint).
  const painted = S.phase !== 'paint' && S.phase !== 'lobby';
  for (const pt of km.createPhonePoints(seed)) {
    S.points.push({
      x: pt.x,
      y: pt.y,
      owner: p.id,
      home: p.id,
      label: painted ? km.nearest(pt, S.centers) : -1,
    });
  }
  p.hasData = true;
  p.paintStart = painted ? null : Date.now();
}

function clearGameFacts(p) {
  p.paintStart = null;
  p.paint = null;
  p.heir = false;
  p.survivor = false;
  p.fallen = false;
}

// Anyone who is here but has no points yet (arrived late, or came back
// after the data was created) gets 6 new ones.
function seedLatecomers() {
  if (S.phase === 'lobby' || S.phase === 'end') return;
  for (const p of [...S.byId.values()].sort((a, b) => a.id - b.id)) {
    if (p.connected && !p.hasData) newPointsFor(p);
  }
}

function createData() {
  S.points = [];
  S.dataVersion += 1;
  S.centers = cloneCenters(km.START);
  S.trail = [cloneCenters(km.START)];
  S.round = 0;
  S.shifts = [];
  S.progress = { done: 0, total: 0 };
  S.converged = false;
  S.lastFail = null;
  S.summaries = 0;
  cancelSpin();
  for (const p of S.byId.values()) {
    p.hasData = false;
    p.sent = false;
    p.pending = null;
    p.rounds = 0;
    p.off = false;
    p.inheritedFrom = [];
    clearGameFacts(p);
  }
  for (const p of [...S.byId.values()].sort((a, b) => a.id - b.id)) {
    if (p.connected) newPointsFor(p);
  }
}

// ---------------------------------------------------------------- phases

function setPhase(phase) {
  if (!PHASES.includes(phase) || phase === S.phase) return;
  if (phase === 'lobby') return; // only `reset` goes back to the lobby
  if (S.phase === 'lobby') {
    // The only way out of the lobby is to start painting.
    if (phase !== 'paint' || ![...S.byId.values()].some((p) => p.connected)) return;
    stopRounds();
    createData();
  } else if (phase === 'paint') {
    return;
  } else if (S.phase === 'paint' || S.round === 0) {
    combine();
  }
  cancelSpin();
  S.phase = phase;
  if (phase !== 'auto' && phase !== 'fail') stopRunning();
  seedLatecomers();
  broadcast();
}

// The coordinator merges the summaries and moves each center to the middle
// of its group. Phones that never sent get their part finished by the server.
function combine() {
  const before = S.centers;
  const { centers, shift } = km.step(S.points, before);
  for (const pt of S.points) pt.label = km.nearest(pt, before);
  applyStep(centers, shift);
}

function applyStep(centers, shift) {
  S.centers = centers;
  S.trail.push(cloneCenters(centers));
  S.shifts.push(shift);
  S.round += 1;
  S.converged = shift < CONVERGED_SHIFT || S.round >= MAX_ROUNDS;
}

function paintSubmit(p, payload) {
  if (S.phase !== 'paint' || p.sent || p.off || !p.connected) return;
  const mine = S.points.filter((pt) => pt.owner === p.id);
  if (!mine.length) return;
  for (const pt of mine) pt.label = km.nearest(pt, S.centers);
  const m = payload && typeof payload === 'object' ? payload.mistakes : undefined;
  const mistakes = Number.isInteger(m) && m >= 0 && m <= MAX_MISTAKES ? m : 0;
  const ms = Math.max(0, Date.now() - (p.paintStart ?? Date.now()));
  p.paint = { ms, mistakes, score: ms + PENALTY_MS * mistakes, points: mine.length };
  p.sent = true;
  S.summaries += 1;
  broadcast();
}

// ---------------------------------------------------------------- rounds

// `converged` only blocks new rounds in `auto`: in `fail` one more round is
// the whole point (watching the survivors carry on), see the note in the report.
function canRound() {
  return (S.phase === 'auto' || S.phase === 'fail') && !S.busy && !S.spin && S.round >= 1
    && !(S.converged && S.phase === 'auto');
}

function startRound() {
  if (!canRound()) return;
  S.busy = true;
  S.roundNo = S.round + 1;
  S.roundCenters = cloneCenters(S.centers);
  const targets = connectedOn().filter(hasPoints);
  S.progress = { done: 0, total: targets.length };
  for (const p of targets) {
    p.pending = S.roundNo;
    p.socket.emit('task', { round: S.roundNo, centers: S.roundCenters });
  }
  S.roundTimer = setTimeout(finishRound, targets.length ? TASK_TIMEOUT_MS : EMPTY_ROUND_MS);
  broadcast();
}

// The server is the authority: it labels and averages by itself with the
// centers the round started from. Phone answers only drive the progress.
function finishRound() {
  if (!S.busy) return;
  clearTimeout(S.roundTimer);
  S.roundTimer = null;
  for (const p of S.byId.values()) p.pending = null;
  const before = S.roundCenters;
  const { centers, shift } = km.step(S.points, before);
  for (const pt of S.points) pt.label = km.nearest(pt, before);
  applyStep(centers, shift);
  S.busy = false;
  if (S.running) {
    if (S.converged) S.running = false;
    else scheduleRound();
  }
  broadcast();
}

function scheduleRound() {
  S.runTimer = setTimeout(() => {
    S.runTimer = null;
    if (!S.running) return;
    if (S.spin) scheduleRound(); // the roulette goes first; "Seguir solo" picks up after it
    else startRound();
  }, ROUND_PAUSE_MS);
}

// A phone stopped being awaited (answered, went off or disconnected).
function clearPending(p) {
  if (p.pending === null) return;
  p.pending = null;
  if (S.busy && ![...S.byId.values()].some((q) => q.pending !== null)) finishRound();
}

function taskResult(p, payload) {
  if (!S.busy || p.pending === null || !payload || typeof payload !== 'object') return;
  if (payload.round !== p.pending) return;
  const sums = payload.sums;
  const valid = Array.isArray(sums) && sums.length === K
    && sums.every((s) => s && typeof s === 'object'
      && Number.isFinite(s.sx) && Number.isFinite(s.sy) && Number.isInteger(s.n) && s.n >= 0);
  if (!valid) return;
  p.rounds += 1;
  S.progress.done += 1;
  S.summaries += 1;
  p.pending = null;
  if (![...S.byId.values()].some((q) => q.pending !== null)) finishRound();
  else broadcast();
}

function setRunning(on) {
  if (!on) { stopRunning(); broadcast(); return; }
  if (S.phase !== 'auto' && S.phase !== 'fail') return;
  if (S.converged && S.phase === 'auto') return;
  if (S.spin) return;
  S.running = true;
  if (!S.busy && !S.runTimer) startRound();
  broadcast();
}

function stopRunning() {
  S.running = false;
  clearTimeout(S.runTimer);
  S.runTimer = null;
}

function stopRounds() {
  stopRunning();
  clearTimeout(S.roundTimer);
  S.roundTimer = null;
  S.busy = false;
  for (const p of S.byId.values()) p.pending = null;
}

// ---------------------------------------------------------------- faults

function kill(id) {
  if (S.phase !== 'fail' || S.spin) return;
  const alive = connectedOn();
  let victim;
  if (id === undefined) {
    const options = alive.filter((p) => hasPoints(p) && alive.length > 1);
    victim = options[Math.floor(Math.random() * options.length)];
  } else {
    victim = S.byId.get(id);
  }
  if (victim) shutDown(victim, ++S.failCount);
}

// Turns `victim` off and hands everything it had to the least loaded phone.
// `n` identifies this shutdown for the screens. False if it was not possible.
function shutDown(victim, n) {
  if (victim.off) return false;
  const heirs = connectedOn().filter((p) => p !== victim);
  if (!heirs.length) return false; // someone has to be left to do the work
  const load = new Map(heirs.map((p) => [p.id, 0]));
  for (const pt of S.points) if (load.has(pt.owner)) load.set(pt.owner, load.get(pt.owner) + 1);
  const heir = heirs.sort((a, b) => (load.get(a.id) - load.get(b.id)) || (a.id - b.id))[0];

  victim.off = true;
  victim.fallen = true;
  const moved = S.points.filter((pt) => pt.owner === victim.id);
  for (const pt of moved) pt.owner = heir.id;
  S.lastFail = { n, victim: victim.name, victimId: victim.id, heir: heir.name, heirId: heir.id, points: moved.length };
  if (moved.length) {
    heir.heir = true;
    if (!heir.inheritedFrom.includes(victim.name)) heir.inheritedFrom.push(victim.name);
    heir.socket.emit('inherit', { from: victim.name, count: moved.length, total: load.get(heir.id) + moved.length });
  }
  clearPending(victim);
  broadcast();
  return true;
}

// ---------------------------------------------------------------- roulette

function spinStart() {
  if (S.phase !== 'fail' || S.spin || S.busy) return;
  const alive = connectedOn();
  if (alive.length < 2) return;
  const options = alive.filter(hasPoints);
  if (!options.length) return;
  const victim = options[Math.floor(Math.random() * options.length)];
  const n = ++S.failCount;
  S.spin = {
    n,
    candidates: alive.map((p) => p.id).sort((a, b) => a - b),
    victim: victim.id,
    ms: SPIN_MS,
    timer: setTimeout(spinEnd, SPIN_MS),
  };
  broadcast();
}

function spinEnd() {
  const spin = S.spin;
  if (!spin) return;
  S.spin = null;
  // The chosen phone may have left while the roulette turned: pick another.
  let victim = S.byId.get(spin.victim);
  const alive = connectedOn();
  if (!victim || !alive.includes(victim) || !hasPoints(victim)) {
    const options = alive.filter(hasPoints);
    victim = options[Math.floor(Math.random() * options.length)];
  }
  if (victim && shutDown(victim, spin.n)) {
    for (const id of spin.candidates) {
      const p = S.byId.get(id);
      if (p && p !== victim) p.survivor = true;
    }
  }
  broadcast();
}

function cancelSpin() {
  if (!S.spin) return;
  clearTimeout(S.spin.timer);
  S.spin = null;
}

function revive() {
  if (S.spin) return;
  for (const pt of S.points) pt.owner = pt.home;
  for (const p of S.byId.values()) {
    p.off = false;
    p.inheritedFrom = [];
  }
  S.lastFail = null;
  broadcast();
}

function reset() {
  cancelSpin();
  stopRounds();
  // Phones that already left do not come back to the next class.
  for (const p of [...S.byId.values()]) {
    if (!p.connected) { S.byId.delete(p.id); S.phones.delete(p.token); }
  }
  S.phase = 'lobby';
  S.points = [];
  S.dataVersion += 1;
  S.centers = cloneCenters(km.START);
  S.trail = [cloneCenters(km.START)];
  S.round = 0;
  S.shifts = [];
  S.progress = { done: 0, total: 0 };
  S.converged = false;
  S.lastFail = null;
  S.summaries = 0;
  for (const p of S.byId.values()) {
    p.hasData = false;
    p.sent = false;
    p.off = false;
    p.rounds = 0;
    p.inheritedFrom = [];
    clearGameFacts(p);
  }
  broadcast();
}

// ---------------------------------------------------------------- sockets

io.on('connection', (socket) => {
  const auth = socket.handshake.auth || {};
  if (auth.role === 'driver') return attachDriver(socket, auth);
  if (auth.role === 'worker') return attachPhone(socket, auth);
  socket.disconnect(true);
});

function attachDriver(socket, auth) {
  if (auth.key !== DRIVER_KEY) {
    socket.emit('auth:error', 'Clave de coordinador incorrecta');
    socket.disconnect(true);
    return;
  }
  socket.join('drivers');
  socket.emit('state', driverSnapshot());

  // A malformed payload or a bug in one handler must never take the server down.
  const on = (event, fn) => socket.on(event, (payload) => {
    try {
      fn(payload && typeof payload === 'object' ? payload : {});
    } catch (err) {
      console.error(`driver event "${event}" failed:`, err);
    }
  });

  on('phase', ({ phase }) => { if (typeof phase === 'string') setPhase(phase); });
  on('round', () => startRound());
  on('run', ({ on: value }) => { if (typeof value === 'boolean') setRunning(value); });
  on('kill', ({ id }) => {
    if (id === undefined || id === null) kill(undefined);
    else if (Number.isInteger(id)) kill(id);
  });
  on('spin', () => spinStart());
  on('revive', () => revive());
  on('reset', () => reset());
}

function attachPhone(socket, auth) {
  const token = typeof auth.token === 'string' ? auth.token.slice(0, 64) : '';
  if (!token) { socket.disconnect(true); return; }
  let p = S.phones.get(token);
  if (!p) {
    if (S.byId.size >= MAX_PHONES) {
      socket.emit('join:error', 'El aula está llena');
      socket.disconnect(true);
      return;
    }
    const id = S.nextId++;
    p = {
      id, token, name: cleanName(auth.name) || `Compu ${id}`, socket: null, connected: false,
      off: false, sent: false, pending: null, rounds: 0, hasData: false, inheritedFrom: [],
      paintStart: null, paint: null, heir: false, survivor: false, fallen: false,
    };
    S.phones.set(token, p);
    S.byId.set(id, p);
  } else if (cleanName(auth.name)) {
    p.name = cleanName(auth.name);
  }
  if (p.socket && p.socket !== socket) p.socket.disconnect(true);
  p.socket = socket;
  p.connected = true;
  seedLatecomers();
  broadcast();

  const safe = (fn) => (payload) => {
    try { fn(payload); } catch (err) { console.error('phone event failed:', err); }
  };
  socket.on('paint:submit', safe((payload) => paintSubmit(p, payload)));
  socket.on('task:result', safe((payload) => taskResult(p, payload)));
  socket.on('disconnect', () => {
    if (p.socket !== socket) return;
    p.connected = false;
    p.socket = null;
    clearPending(p);
    broadcast();
  });
}

// ---------------------------------------------------------------- utils

function cleanName(name) {
  if (typeof name !== 'string') return '';
  return name.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 16);
}

function lanAddress() {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list || []) if (i.family === 'IPv4' && !i.internal) return i.address;
  }
  return 'localhost';
}

function buildIconSprite(names) {
  const dir = path.join(__dirname, 'node_modules/lucide-static/icons');
  const symbols = names.map((name) => {
    const svg = fs.readFileSync(path.join(dir, `${name}.svg`), 'utf8');
    const inner = svg.slice(svg.indexOf('>', svg.indexOf('<svg')) + 1, svg.lastIndexOf('</svg>')).trim();
    return `<symbol id="${name}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</symbol>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg">${symbols.join('')}</svg>`;
}

if (require.main === module) {
  server.listen(PORT, () => {
    console.log('\n  Clúster en el aula');
    console.log(`  Alumnos:   ${PUBLIC_URL}`);
    console.log(`  Presentación: http://localhost:${PORT}/presentacion?key=${DRIVER_KEY}`);
    console.log(`  Proyector: http://localhost:${PORT}/driver?key=${DRIVER_KEY}\n`);
  });
}

// Pure helpers, so the smoke test can check the tie-break without timing luck.
module.exports = { compareRace };
