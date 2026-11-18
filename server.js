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

const envMs = (name, fallback) => (Number(process.env[name]) > 0 ? Number(process.env[name]) : fallback);

const PORT = Number(process.env.PORT) || 3000;
const DRIVER_KEY = process.env.DRIVER_KEY || crypto.randomBytes(3).toString('hex');
const PUBLIC_URL = (process.env.PUBLIC_URL || `http://${lanAddress()}:${PORT}`).replace(/\/+$/, '');

// The class goes through these steps in order (see presentacion-web/ACTIVIDAD.md).
const PHASES = ['lobby', 'howto', 'solo', 'manager', 'work', 'combine', 'fail', 'end'];
const K = km.K;
const MAX_PHONES = 150;
const SOLO_MS = envMs('SOLO_MS', 20000); // "driver solo" countdown
const SOLO_GRACE_MS = 1500; // late taps that were already in flight still count
const SOLO_MIN_POINTS = 60;
const SOLO_MAX_POINTS = 300;
const FALLBACK_MS_PER_POINT = 1500; // when nobody painted enough to measure
const DEAD_AFTER_MS = envMs('DEAD_AFTER_MS', 6000); // a worker that left this long is given up
const TASK_TIMEOUT_MS = 2000; // longest wait for a phone's answer in an automatic round
const ROUND_PAUSE_MS = 700;
const EMPTY_ROUND_MS = 600;
const CONVERGED_SHIFT = 0.5;
const MAX_ROUNDS = 15;
const SPIN_MS = envMs('SPIN_MS', 4500); // roulette length
const INBOX_SHOWN = 60;

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
app.get('/kmeans.js', (_req, res) => res.type('application/javascript').sendFile(path.join(__dirname, 'lib', 'kmeans.js')));
// Atkinson Hyperlegible: drawn for legibility at a distance, which is
// exactly the back row of a classroom looking at a projector.
app.use('/fonts/sans', express.static(path.join(__dirname, 'node_modules/@fontsource-variable/atkinson-hyperlegible-next/files'), { maxAge: '7d' }));
app.use('/fonts/mono', express.static(path.join(__dirname, 'node_modules/@fontsource-variable/atkinson-hyperlegible-mono/files'), { maxAge: '7d' }));

const iconSprite = buildIconSprite([
  'play', 'pause', 'rotate-ccw', 'contrast', 'qr-code', 'maximize', 'x', 'check', 'zap',
  'arrow-right', 'arrow-left', 'arrow-down', 'send', 'circle-alert', 'users', 'power', 'power-off', 'repeat',
  'sparkles', 'monitor', 'smartphone', 'wifi-off', 'layers', 'timer', 'hourglass',
  'trophy', 'heart-handshake', 'shield-check', 'dices', 'party-popper',
  'crown', 'server', 'user-plus', 'inbox', 'merge', 'hand', 'user-x', 'log-in',
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

// phone: { id, token, name, socket, connected, registered, off, offCause,
//          lostTo, hadPart, pending, rounds, solo: { done, at }, facts, deadTimer }
//   registered = the cluster manager signed it up as a worker
//   off = knocked out by the roulette, by a tap, or for leaving mid-task ('lost')
//   facts = { top, heir, fallen, survivor }: medal facts for this class
// part:  { id, home, owner, sent, startAt, sentAt, by, ms }
//   one worker's slice of the data (6 points); `owner` changes when a worker falls
// point: { x, y, part, label }   label -1 = not painted yet
const S = {
  phase: 'lobby',
  phones: new Map(), // token -> phone
  byId: new Map(), // id -> phone
  nextId: 1,
  solo: null, // { seed, total, startedAt, endsAt, endedAt, over, timer }
  parts: [],
  points: [],
  dataVersion: 0, // bumps every time the data is created from scratch
  centers: cloneCenters(km.START),
  trail: [cloneCenters(km.START)],
  round: 0, // joins done (manual and automatic)
  shifts: [],
  manual: null, // { round } while workers paint by hand (steps 4 and 6)
  inbox: [], // summaries of the current manual round: { part, home, by, counts }
  firstJoin: null, // facts of the first join (step 5 shows them)
  lastJoin: null, // facts of the latest manual join (step 6 shows them)
  progress: { done: 0, total: 0 }, // automatic round
  busy: false,
  running: false,
  converged: false,
  lastFail: null,
  failCount: 0, // never goes down: screens spot a new fall by `n`
  spin: null, // { n, candidates, victim, ms, timer } while the roulette turns
  summaries: 0,
  roundCenters: null,
  roundNo: 0,
  roundTimer: null,
  runTimer: null,
};

// Phones the projector took out stay in `byId` so their name still shows in
// old summaries, but they are out of every list and count.
const phoneList = () => [...S.byId.values()].filter((p) => !p.removed);

// Tokens of phones taken out: an idle phone would reconnect by itself, so the
// token is refused. The person can still join again from the phone (new token).
const kickedTokens = new Set();
const byId = (a, b) => a.id - b.id;
const nameOf = (id) => (S.byId.get(id) || { name: '?' }).name;
const isLive = (p) => p.connected && !p.off;
const liveWorkers = () => phoneList().filter((p) => isLive(p) && p.registered);
const partsOf = (p) => S.parts.filter((part) => part.owner === p.id);
const hasUnsent = (p) => !!S.manual && partsOf(p).some((part) => !part.sent);

function cloneCenters(cs) {
  return cs.map((c) => ({ x: c.x, y: c.y }));
}

function newFacts() {
  return { top: false, heir: false, fallen: false, survivor: false };
}

function statusOf(p) {
  if (p.off) return 'off';
  if (!p.connected) return 'offline';
  switch (S.phase) {
    case 'lobby':
    case 'howto': return 'waiting';
    case 'solo': return S.solo && S.solo.over ? 'done' : 'painting';
    case 'manager': return p.registered ? 'joined' : 'waiting';
    case 'work':
    case 'fail': {
      if (!p.registered) return 'out';
      const mine = partsOf(p);
      if (!mine.length) return 'idle';
      if (!S.manual) return 'idle';
      return mine.some((part) => !part.sent) ? 'painting' : 'sent';
    }
    case 'combine':
      if (!p.registered) return 'out';
      return p.pending !== null ? 'working' : 'idle';
    default: return p.registered ? 'idle' : 'out';
  }
}

// ---------------------------------------------------------------- broadcast

let broadcastTimer = null;
function broadcast() {
  if (broadcastTimer) return;
  broadcastTimer = setTimeout(() => {
    broadcastTimer = null;
    const byPart = new Map(S.parts.map((part) => [part.id, []]));
    for (const pt of S.points) byPart.get(pt.part).push(pt);
    io.to('projectors').emit('state', projectorSnapshot());
    for (const p of S.byId.values()) {
      if (p.socket && p.connected) p.socket.emit('state', phoneSnapshot(p, byPart));
    }
  }, 60);
}

// ---------------------------------------------------------------- solo (step 2)

function startSolo() {
  const connected = phoneList().filter((p) => p.connected).length;
  const total = Math.max(SOLO_MIN_POINTS, Math.min(SOLO_MAX_POINTS, 6 * connected));
  const now = Date.now();
  S.solo = {
    seed: crypto.randomInt(1, 2 ** 31),
    total,
    startedAt: now,
    endsAt: now + SOLO_MS,
    endedAt: null,
    over: false,
    timer: setTimeout(endSolo, SOLO_MS),
  };
  for (const p of phoneList()) {
    p.solo = { done: 0, at: null };
    p.facts.top = false;
  }
}

function endSolo() {
  const solo = S.solo;
  if (!solo || solo.over) return;
  clearTimeout(solo.timer);
  solo.timer = null;
  solo.over = true;
  solo.endedAt = Math.min(Date.now(), solo.endsAt);
  const top = soloTop();
  if (top) top.facts.top = true;
  broadcast();
}

// Who painted the most alone; ties go to whoever got there first.
function soloRanking() {
  return phoneList().filter((p) => p.solo.done > 0)
    .sort((a, b) => (b.solo.done - a.solo.done) || (a.solo.at - b.solo.at) || (a.id - b.id));
}
const soloTop = () => soloRanking()[0] || null;

// Median time per point among those who painted at least 3: what one
// person alone needs, to estimate how long the whole job would take.
function msPerPoint() {
  if (!S.solo) return FALLBACK_MS_PER_POINT;
  const rates = phoneList().filter((p) => p.solo.done >= 3 && p.solo.at)
    .map((p) => (p.solo.at - S.solo.startedAt) / p.solo.done)
    .sort((a, b) => a - b);
  if (!rates.length) return FALLBACK_MS_PER_POINT;
  const mid = Math.floor(rates.length / 2);
  return rates.length % 2 ? rates[mid] : (rates[mid - 1] + rates[mid]) / 2;
}

function soloProgress(p, payload) {
  const solo = S.solo;
  if (S.phase !== 'solo' || !solo || !p.connected) return;
  const now = Date.now();
  if (solo.over && now > solo.endedAt + SOLO_GRACE_MS) return;
  const done = payload.done;
  if (!Number.isInteger(done) || done <= p.solo.done || done > solo.total) return;
  p.solo.done = done;
  p.solo.at = Math.min(now, solo.endsAt);
  broadcast();
}

function soloInfo() {
  const solo = S.solo;
  if (!solo) return null;
  const rate = msPerPoint();
  const top = soloTop();
  return {
    total: solo.total,
    remainingMs: solo.over ? 0 : Math.max(0, solo.endsAt - Date.now()),
    durationMs: SOLO_MS,
    over: solo.over,
    leaders: soloRanking().slice(0, 5).map((p) => ({ id: p.id, name: p.name, done: p.solo.done })),
    painted: phoneList().reduce((a, p) => a + p.solo.done, 0),
    players: phoneList().filter((p) => p.solo.done > 0).length,
    msPerPoint: Math.round(rate),
    estimateMs: Math.round(rate * solo.total),
    top: top && { id: top.id, name: top.name, done: top.solo.done },
  };
}

// ---------------------------------------------------------------- cluster manager (step 3)

// From step 3 on the driver is the projector: whoever presents asks for
// computers and joins the summaries there. No phone ever plays the driver.

// The cluster manager signs up every free phone by itself: nobody has to
// tap anything, each phone is just told "you are a worker". Once the data
// exists, a phone that arrives late gets its part right away.
function enlist(p) {
  if (!['manager', 'work', 'combine', 'fail'].includes(S.phase)) return;
  if (p.off || !p.connected) return;
  p.registered = true;
  if (S.phase !== 'manager' && !p.hadPart) newPart(p);
}

// ---------------------------------------------------------------- data (step 4)

function createData() {
  S.dataVersion += 1;
  S.parts = [];
  S.points = [];
  S.centers = cloneCenters(km.START);
  S.trail = [cloneCenters(km.START)];
  S.round = 0;
  S.shifts = [];
  S.converged = false;
  S.inbox = [];
  S.firstJoin = null;
  S.lastJoin = null;
  S.lastFail = null;
  S.summaries = 0;
  S.manual = { round: 1 };
  for (const p of phoneList()) p.hadPart = false;
  for (const p of liveWorkers().sort(byId)) newPart(p);
}

// A new 6-point part for `p`. Outside a manual round it arrives already painted.
function newPart(p) {
  const id = S.parts.length;
  const painted = !S.manual;
  S.parts.push({ id, home: p.id, owner: p.id, sent: false, startAt: Date.now(), sentAt: null, by: null, ms: null });
  for (const pt of km.createPhonePoints(crypto.randomInt(0, 2 ** 32))) {
    S.points.push({ x: pt.x, y: pt.y, part: id, label: painted ? km.nearest(pt, S.centers) : -1 });
  }
  p.hadPart = true;
}

function startManualRound() {
  const now = Date.now();
  S.manual = { round: S.round + 1 };
  S.inbox = [];
  S.lastJoin = null;
  for (const part of S.parts) Object.assign(part, { sent: false, startAt: now, sentAt: null, by: null, ms: null });
  for (const pt of S.points) pt.label = -1;
  // Owners that already left will never answer: start counting.
  for (const p of phoneList()) if (!p.connected && !p.off && partsOf(p).length) armDeadTimer(p);
}

function partSubmit(p, payload) {
  if (!S.manual || p.off || !p.connected) return;
  const part = Number.isInteger(payload.part) ? S.parts[payload.part] : null;
  if (!part || part.owner !== p.id || part.sent) return;
  const now = Date.now();
  const counts = [0, 0, 0];
  for (const pt of S.points) {
    if (pt.part !== part.id) continue;
    pt.label = km.nearest(pt, S.centers);
    counts[pt.label] += 1;
  }
  Object.assign(part, { sent: true, sentAt: now, by: p.id, ms: now - part.startAt });
  S.inbox.push({ part: part.id, home: part.home, by: p.id, counts });
  S.summaries += 1;
  broadcast();
}

// The driver merges the summaries and moves each center to the middle of
// its group. Parts nobody sent are finished here so the class never waits.
function join() {
  if (!S.manual || (S.phase !== 'work' && S.phase !== 'fail')) return false;
  const sent = S.parts.filter((part) => part.sent);
  if (!sent.length) return false;
  const before = S.centers;
  const filled = S.parts.length - sent.length;
  for (const pt of S.points) if (pt.label < 0) pt.label = km.nearest(pt, before);
  const { centers, shift } = km.step(S.points, before);
  applyStep(centers, shift);
  let slowest = null;
  for (const part of sent) if (!slowest || part.ms > slowest.ms) slowest = part;
  const info = {
    round: S.manual.round,
    parts: S.parts.length,
    filled,
    workers: new Set(sent.map((part) => part.by)).size,
    rescued: sent.filter((part) => part.by !== part.home).length,
    points: S.points.length,
    parallelMs: slowest ? slowest.ms : null,
    slowest: slowest ? nameOf(slowest.by) : null,
    soloMs: Math.round(msPerPoint() * S.points.length),
  };
  for (const part of S.parts) part.sent = true;
  S.manual = null;
  if (!S.firstJoin) S.firstJoin = info;
  S.lastJoin = info;
  return true;
}

// Leaving a manual round without joining: paint what is left so every
// screen shows a finished drawing.
function abandonManual() {
  if (!S.manual) return;
  for (const pt of S.points) if (pt.label < 0) pt.label = km.nearest(pt, S.centers);
  for (const part of S.parts) part.sent = true;
  S.manual = null;
}

function applyStep(centers, shift) {
  S.centers = centers;
  S.trail.push(cloneCenters(centers));
  S.shifts.push(shift);
  S.round += 1;
  S.converged = shift < CONVERGED_SHIFT || S.round >= MAX_ROUNDS;
}

function totals() {
  const t = [0, 0, 0];
  for (const pt of S.points) if (pt.label >= 0) t[pt.label] += 1;
  return t;
}

// ---------------------------------------------------------------- phases

function setPhase(phase) {
  const next = PHASES[PHASES.indexOf(S.phase) + 1];
  if (!next || phase !== next) return;
  switch (phase) {
    case 'howto':
      if (!phoneList().some((p) => p.connected)) return;
      break;
    case 'solo':
      if (!phoneList().some((p) => p.connected)) return;
      startSolo();
      break;
    case 'manager':
      endSolo();
      S.phase = phase; // enlist() only signs up phones once the manager is here
      for (const p of phoneList()) enlist(p);
      break;
    case 'work':
      if (!liveWorkers().length) return;
      createData();
      break;
    case 'combine':
      if (!join()) return;
      break;
    case 'fail':
      stopRounds();
      startManualRound();
      break;
    case 'end':
      stopRounds();
      if (!join()) abandonManual();
      break;
    default:
      return;
  }
  cancelSpin();
  S.phase = phase;
  broadcast();
}

function joinNow() {
  if (S.phase === 'work') setPhase('combine');
  else if (S.phase === 'fail' && !S.spin && join()) broadcast();
}

// ---------------------------------------------------------------- automatic rounds (step 5)

function canRound() {
  return S.phase === 'combine' && !S.busy && S.round >= 1 && !S.converged;
}

function startRound() {
  if (!canRound()) return;
  S.busy = true;
  S.roundNo = S.round + 1;
  S.roundCenters = cloneCenters(S.centers);
  const targets = liveWorkers().filter((p) => partsOf(p).length);
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
    if (S.running) startRound();
  }, ROUND_PAUSE_MS);
}

function clearPending(p) {
  if (p.pending === null) return;
  p.pending = null;
  if (S.busy && ![...S.byId.values()].some((q) => q.pending !== null)) finishRound();
}

function taskResult(p, payload) {
  if (!S.busy || p.pending === null || payload.round !== p.pending) return;
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
  if (S.phase !== 'combine' || S.converged || S.round < 1) return;
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

// ---------------------------------------------------------------- faults (step 6)

// Turns `victim` off and hands every part it had to the least loaded live
// worker. `cause`: 'spin' | 'kill' | 'lost'. False if it was not possible.
function knockOut(victim, cause, n = S.failCount + 1) {
  if (victim.off) return false;
  const mine = partsOf(victim);
  if (!mine.length) return false;
  const heir = pickHeir(victim);
  if (!heir) return false; // someone has to be left to do the work
  const pending = handParts(mine, heir);
  S.failCount = Math.max(S.failCount, n);
  victim.off = true;
  victim.offCause = cause;
  victim.lostTo = heir.name;
  victim.facts.fallen = true;
  clearTimeout(victim.deadTimer);
  S.lastFail = {
    n, cause,
    victim: victim.name, victimId: victim.id,
    heir: heir.name, heirId: heir.id,
    parts: mine.length, pending,
  };
  clearPending(victim);
  broadcast();
  return true;
}

// The live worker with the fewest parts (ties: lowest id), or null.
function pickHeir(except) {
  const heirs = liveWorkers().filter((p) => p !== except);
  if (!heirs.length) return null;
  const load = new Map(heirs.map((p) => [p.id, partsOf(p).length]));
  return heirs.sort((a, b) => (load.get(a.id) - load.get(b.id)) || (a.id - b.id))[0];
}

// Gives `parts` to `heir`; returns how many of them still have to be painted.
function handParts(parts, heir) {
  const now = Date.now();
  let pending = 0;
  for (const part of parts) {
    part.owner = heir.id;
    if (S.manual && !part.sent) { part.startAt = now; pending += 1; }
  }
  heir.facts.heir = true;
  return pending;
}

function armDeadTimer(p) {
  clearTimeout(p.deadTimer);
  p.deadTimer = setTimeout(() => {
    p.deadTimer = null;
    if (!p.connected && !p.off && hasUnsent(p)) knockOut(p, 'lost');
  }, DEAD_AFTER_MS);
}

const canFail = () => S.phase === 'fail' && !!S.manual && !S.spin;

function kill(id) {
  if (!canFail()) return;
  const victim = S.byId.get(id);
  if (victim && isLive(victim)) knockOut(victim, 'kill');
}

function spinStart() {
  if (!canFail()) return;
  const candidates = liveWorkers().filter((p) => partsOf(p).length);
  if (candidates.length < 2) return;
  // Prefer someone still painting: then the heir really has work to pick up.
  const busy = candidates.filter(hasUnsent);
  const pool = busy.length ? busy : candidates;
  const victim = pool[Math.floor(Math.random() * pool.length)];
  S.failCount += 1;
  S.spin = {
    n: S.failCount,
    candidates: candidates.map((p) => p.id).sort((a, b) => a - b),
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
  const alive = liveWorkers().filter((p) => partsOf(p).length);
  if (!victim || !alive.includes(victim)) victim = alive[Math.floor(Math.random() * alive.length)];
  if (victim && knockOut(victim, 'spin', spin.n)) {
    for (const id of spin.candidates) {
      const p = S.byId.get(id);
      if (p && p !== victim) p.facts.survivor = true;
    }
  }
  broadcast();
}

function cancelSpin() {
  if (!S.spin) return;
  clearTimeout(S.spin.timer);
  S.spin = null;
}

// Phones that are still here come back on, and every worker that is here
// gets its own part back (also those that returned after a lost connection).
function revive() {
  if (S.phase !== 'fail' || S.spin) return;
  for (const p of S.byId.values()) {
    if (p.connected) {
      p.off = false;
      p.offCause = null;
      p.lostTo = null;
    }
  }
  const now = Date.now();
  for (const part of S.parts) {
    const home = S.byId.get(part.home);
    if (home && isLive(home) && home.registered && part.owner !== part.home) {
      part.owner = part.home;
      if (S.manual && !part.sent) part.startAt = now;
    }
  }
  S.lastFail = null;
  broadcast();
}

// ---------------------------------------------------------------- taking a phone out

// The projector takes out a phone that left, went idle or does not want to
// play. Its parts go to another worker, like a fall but without the drama:
// no lastFail, no medals for the one who left. If nobody is left to take
// them, the driver fills them in at the join.
function removePhone(id) {
  const p = S.byId.get(id);
  if (!p || p.removed) return;
  if (S.spin && S.spin.candidates.includes(p.id)) cancelSpin();
  const mine = partsOf(p);
  const heir = mine.length ? pickHeir(p) : null;
  if (heir) handParts(mine, heir);
  p.removed = true;
  p.registered = false;
  clearTimeout(p.deadTimer);
  p.deadTimer = null;
  kickedTokens.add(p.token);
  S.phones.delete(p.token);
  const socket = p.socket;
  p.socket = null;
  p.connected = false;
  if (socket) {
    socket.emit('kicked');
    socket.disconnect(true);
  }
  clearPending(p);
  broadcast();
}

function reset() {
  cancelSpin();
  stopRounds();
  if (S.solo) clearTimeout(S.solo.timer);
  // Phones that already left do not come back to the next class.
  for (const p of [...S.byId.values()]) {
    if (!p.connected) { clearTimeout(p.deadTimer); S.byId.delete(p.id); S.phones.delete(p.token); }
  }
  Object.assign(S, {
    phase: 'lobby',
    solo: null,
    parts: [],
    points: [],
    dataVersion: S.dataVersion + 1,
    centers: cloneCenters(km.START),
    trail: [cloneCenters(km.START)],
    round: 0,
    shifts: [],
    manual: null,
    inbox: [],
    firstJoin: null,
    lastJoin: null,
    progress: { done: 0, total: 0 },
    converged: false,
    lastFail: null,
    summaries: 0,
  });
  for (const p of S.byId.values()) {
    Object.assign(p, {
      registered: false, off: false, offCause: null, lostTo: null, hadPart: false,
      pending: null, rounds: 0, solo: { done: 0, at: null }, facts: newFacts(),
    });
  }
  broadcast();
}

// ---------------------------------------------------------------- snapshots

const MEDAL_ORDER = ['top', 'heir', 'fallen', 'survivor', 'worker'];

function medalsOf(p) {
  const has = {
    top: p.facts.top,
    heir: p.facts.heir,
    fallen: p.facts.fallen,
    survivor: p.facts.survivor,
    worker: p.registered,
  };
  const medals = MEDAL_ORDER.filter((m) => has[m]);
  return medals.length ? medals : ['cluster'];
}

function joinFacts() {
  const j = S.phase === 'combine' ? S.firstJoin : S.lastJoin;
  return j && { ...j };
}

function inboxView() {
  return S.inbox.slice(-INBOX_SHOWN).map((e) => ({
    part: e.part, from: nameOf(e.home), by: nameOf(e.by), counts: e.counts,
  }));
}

function lastFailView() {
  const f = S.lastFail;
  return f && { n: f.n, cause: f.cause, victim: f.victim, victimId: f.victimId, heir: f.heir, heirId: f.heirId, parts: f.parts, pending: f.pending };
}

function projectorSnapshot() {
  const partCount = new Map();
  const inherited = new Map();
  for (const part of S.parts) partCount.set(part.owner, (partCount.get(part.owner) || 0) + 1);
  for (const pt of S.points) {
    const part = S.parts[pt.part];
    if (part.owner !== part.home) inherited.set(part.owner, (inherited.get(part.owner) || 0) + 1);
  }
  return {
    phase: S.phase,
    publicUrl: PUBLIC_URL,
    soloMs: SOLO_MS,
    phones: phoneList().map((p) => ({
      id: p.id,
      name: p.name,
      status: statusOf(p),
      registered: p.registered,
      parts: partCount.get(p.id) || 0,
      inherited: inherited.get(p.id) || 0,
      solo: p.solo.done,
    })),
    points: S.points.map((pt) => {
      const part = S.parts[pt.part];
      return { x: pt.x, y: pt.y, label: pt.label, moved: part.owner !== part.home };
    }),
    centers: S.centers,
    trail: S.trail,
    round: S.round,
    shifts: S.shifts,
    solo: soloInfo(),
    manual: S.manual && {
      round: S.manual.round,
      done: S.parts.filter((part) => part.sent).length,
      total: S.parts.length,
    },
    inbox: inboxView(),
    totals: totals(),
    progress: { ...S.progress },
    busy: S.busy,
    running: S.running,
    converged: S.converged,
    join: joinFacts(),
    lastFail: lastFailView(),
    spin: S.spin && { n: S.spin.n, candidates: S.spin.candidates, victim: S.spin.victim, ms: S.spin.ms },
    stats: {
      phones: phoneList().length,
      connected: phoneList().filter((p) => p.connected).length,
      workers: liveWorkers().length,
      registered: phoneList().filter((p) => p.registered).length,
      points: S.points.length,
      parts: S.parts.length,
      summaries: S.summaries,
      fails: S.failCount,
    },
  };
}

function phoneSnapshot(p, byPart) {
  // Own part first, then inherited ones in the order they arrived.
  const mine = partsOf(p).sort((a, b) => ((a.home === p.id ? 0 : 1) - (b.home === p.id ? 0 : 1)) || (a.id - b.id));
  const solo = S.phase === 'solo' && S.solo ? soloInfo() : null;
  return {
    phase: S.phase,
    soloMs: SOLO_MS,
    me: {
      id: p.id,
      name: p.name,
      role: p.registered ? 'worker' : 'none',
      registered: p.registered,
      off: p.off,
      offCause: p.offCause,
      lostTo: p.lostTo,
      working: p.pending !== null,
      rounds: p.rounds,
      soloDone: p.solo.done,
      top: !!(S.solo && S.solo.over && p.facts.top),
      medals: medalsOf(p),
    },
    solo: solo && {
      seed: S.solo.seed,
      total: solo.total,
      remainingMs: solo.remainingMs,
      durationMs: solo.durationMs,
      over: solo.over,
      msPerPoint: solo.msPerPoint,
      top: solo.top && solo.top.name,
    },
    dataKey: `${S.dataVersion}:${S.manual ? S.manual.round : S.round}`,
    centers: S.centers,
    round: S.round,
    converged: S.converged,
    running: S.running,
    busy: S.busy,
    manual: S.manual && { round: S.manual.round },
    parts: mine.map((part) => ({
      id: part.id,
      from: part.home === p.id ? null : nameOf(part.home),
      left: part.home !== p.id && !!(S.byId.get(part.home) || {}).removed, // its owner was taken out
      sent: part.sent,
      points: (byPart.get(part.id) || []).map((pt) => ({ x: pt.x, y: pt.y, label: pt.label })),
    })),
    workers: liveWorkers().length,
    join: joinFacts(),
    spin: S.spin && S.spin.candidates.includes(p.id) ? { n: S.spin.n, ms: S.spin.ms } : null,
    lastFail: S.lastFail && {
      n: S.lastFail.n,
      cause: S.lastFail.cause,
      victim: S.lastFail.victim,
      heir: S.lastFail.heir,
      parts: S.lastFail.parts,
      me: p.id === S.lastFail.victimId ? 'victim' : p.id === S.lastFail.heirId ? 'heir' : 'safe',
    },
    stats: { workers: liveWorkers().length, points: S.points.length, parts: S.parts.length },
  };
}

// ---------------------------------------------------------------- sockets

io.on('connection', (socket) => {
  const auth = socket.handshake.auth || {};
  if (auth.role === 'projector') return attachProjector(socket, auth);
  if (auth.role === 'worker') return attachPhone(socket, auth);
  socket.disconnect(true);
});

// A malformed payload or a bug in one handler must never take the server down.
function guarded(socket, event, fn) {
  socket.on(event, (payload) => {
    try {
      fn(payload && typeof payload === 'object' ? payload : {});
    } catch (err) {
      console.error(`event "${event}" failed:`, err);
    }
  });
}

function attachProjector(socket, auth) {
  if (auth.key !== DRIVER_KEY) {
    socket.emit('auth:error', 'Clave del proyector incorrecta');
    socket.disconnect(true);
    return;
  }
  socket.join('projectors');
  socket.emit('state', projectorSnapshot());
  const on = (event, fn) => guarded(socket, event, fn);
  on('phase', ({ phase }) => { if (typeof phase === 'string') setPhase(phase); });
  on('join', () => joinNow());
  on('round', () => startRound());
  on('run', ({ on: value }) => { if (typeof value === 'boolean') setRunning(value); });
  on('kill', ({ id }) => { if (Number.isInteger(id)) kill(id); });
  on('spin', () => spinStart());
  on('revive', () => revive());
  on('remove', ({ id }) => { if (Number.isInteger(id)) removePhone(id); });
  on('reset', () => reset());
}

function attachPhone(socket, auth) {
  const token = typeof auth.token === 'string' ? auth.token.slice(0, 64) : '';
  if (!token) { socket.disconnect(true); return; }
  if (kickedTokens.has(token)) { socket.emit('kicked'); socket.disconnect(true); return; }
  let p = S.phones.get(token);
  if (!p) {
    if (S.phones.size >= MAX_PHONES) {
      socket.emit('join:error', 'El aula está llena');
      socket.disconnect(true);
      return;
    }
    const id = S.nextId++;
    p = {
      id, token, name: cleanName(auth.name) || `Compu ${id}`, socket: null, connected: false,
      registered: false, off: false, offCause: null, lostTo: null, hadPart: false,
      pending: null, rounds: 0, solo: { done: 0, at: null }, facts: newFacts(), deadTimer: null,
    };
    S.phones.set(token, p);
    S.byId.set(id, p);
  } else if (cleanName(auth.name)) {
    p.name = cleanName(auth.name);
  }
  if (p.socket && p.socket !== socket) p.socket.disconnect(true);
  p.socket = socket;
  p.connected = true;
  clearTimeout(p.deadTimer);
  p.deadTimer = null;
  // Back after the cluster gave up on it: a free worker again, without its part.
  if (p.off && p.offCause === 'lost') { p.off = false; p.offCause = null; }
  // Arrived late, or was away when the data was handed out.
  enlist(p);
  broadcast();

  const on = (event, fn) => guarded(socket, event, fn);
  on('solo:progress', (payload) => soloProgress(p, payload));
  on('part:submit', (payload) => partSubmit(p, payload));
  on('task:result', (payload) => taskResult(p, payload));
  socket.on('disconnect', () => {
    if (p.socket !== socket) return;
    p.connected = false;
    p.socket = null;
    clearPending(p);
    if (hasUnsent(p) && !p.off) armDeadTimer(p);
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

module.exports = { PHASES };
