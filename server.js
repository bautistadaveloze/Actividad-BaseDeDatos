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

const PHASES = ['lobby', 'map', 'reduce', 'spark', 'faults', 'hadoop', 'code'];
const POINTS_PER_PARTITION = 8;
const MAX_WORKERS = 150;
const SPARK_MAX_ITER = 12;
const RACE_ITER = 5;
const DISK_READ_MS = 1100;
const DISK_WRITE_MS = 500;
const REPLICA_READ_MS = 500;
const SLOW_EXTRA_MS = 4500;
const TASK_GRACE_MS = 8000;
const CONVERGED_SHIFT = 0.05;

// Bytes per message, as if values were 8-byte doubles and longs.
const BYTES = {
  A: (n) => n * 20, // x, y and a label per point
  B: () => km.K * 16, // x̄, ȳ per cluster
  C: () => km.K * 24, // Σx, Σy, n per cluster
};
const SCALE_POINTS = 1_000_000; // "a escala real": points per partition

// ---------------------------------------------------------------- http

const app = express();
const server = http.createServer(app);
const io = new Server(server, { pingInterval: 4000, pingTimeout: 7000 });

const publicDir = path.join(__dirname, 'public');
app.get('/', (_req, res) => res.sendFile(path.join(publicDir, 'worker.html')));
app.get('/driver', (_req, res) => res.sendFile(path.join(publicDir, 'driver.html')));
// Atkinson Hyperlegible: drawn for legibility at a distance, which is
// exactly the back row of a classroom looking at a projector.
app.use('/fonts/sans', express.static(path.join(__dirname, 'node_modules/@fontsource-variable/atkinson-hyperlegible-next/files'), { maxAge: '7d' }));
app.use('/fonts/mono', express.static(path.join(__dirname, 'node_modules/@fontsource-variable/atkinson-hyperlegible-mono/files'), { maxAge: '7d' }));

const iconSprite = buildIconSprite([
  'play', 'pause', 'rotate-ccw', 'contrast', 'qr-code', 'maximize', 'x', 'check', 'turtle',
  'skull', 'heart-pulse', 'zap', 'hard-drive', 'cpu', 'wifi-off', 'arrow-right', 'arrow-left',
  'chevron-right', 'shuffle', 'send', 'circle-alert', 'git-branch', 'timer', 'database', 'layers',
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

const S = {
  phase: 'lobby',
  workers: new Map(), // token -> worker
  byId: new Map(), // id -> worker
  nextId: 1,
  data: null, // { points, partitions, seed }
  centroids: cloneCentroids(km.START),
  trail: [],
  manual: null, // { submissions: Map<workerId, sub>, result }
  job: null,
  history: [],
  race: { hadoop: null, spark: null },
  speculative: true,
  lineage: [],
  log: [],
};

function cloneCentroids(cs) {
  return cs.map((c) => ({ x: c.x, y: c.y }));
}

function pushLog(kind, text) {
  S.log.push({ t: Date.now(), kind, text });
  if (S.log.length > 80) S.log.shift();
}

function liveWorkers() {
  return [...S.byId.values()].filter((w) => w.alive && w.connected);
}

function partitionById(pid) {
  return S.data && S.data.partitions[pid - 1];
}

function partitionPoints(part) {
  return S.data.points.slice(part.from, part.to + 1);
}

function statusOf(w) {
  if (!w.alive) return 'dead';
  if (!w.connected) return 'offline';
  if (w.tasks.size) return w.slow ? 'slow' : 'busy';
  if (S.phase === 'map' && S.manual) {
    if (!w.partitions.length) return 'standby';
    return S.manual.submissions.has(w.id) ? 'done' : 'busy';
  }
  if (S.data && !w.partitions.length) return 'standby';
  if (w.slow) return 'slow';
  return 'idle';
}

// ---------------------------------------------------------------- broadcast

let broadcastTimer = null;
function broadcast() {
  if (broadcastTimer) return;
  broadcastTimer = setTimeout(() => {
    broadcastTimer = null;
    io.to('drivers').emit('state', driverSnapshot());
    for (const w of S.byId.values()) {
      if (w.socket && w.connected) w.socket.emit('state', workerSnapshot(w));
    }
  }, 60);
}

function driverSnapshot() {
  const job = S.job;
  const round = job && job.round;
  return {
    phase: S.phase,
    publicUrl: PUBLIC_URL,
    workers: [...S.byId.values()].map((w) => ({
      id: w.id,
      name: w.name,
      status: statusOf(w),
      slow: w.slow,
      partitions: w.partitions,
      tasks: w.stats.tasks,
      bytes: w.stats.bytes,
    })),
    data: S.data && {
      partitions: S.data.partitions.map((p) => ({ id: p.id, owner: p.owner })),
      points: S.data.points.length,
      perPartition: POINTS_PER_PARTITION,
    },
    centroids: S.centroids,
    trail: S.trail.slice(-24),
    history: S.history,
    job: job && {
      mode: job.mode,
      race: job.race,
      iter: job.iter,
      maxIter: job.maxIter,
      running: job.running,
      stopping: job.stopAfterRound,
      done: round ? round.results.size : 0,
      total: S.data ? S.data.partitions.length : 0,
      roundStartedAt: round ? round.startedAt : null,
      startedAt: job.startedAt,
      iterTimes: job.iterTimes,
    },
    manual: S.manual && {
      owners: S.data ? S.data.partitions.filter((p) => S.byId.get(p.owner)?.alive).length : 0,
      submissions: [...S.manual.submissions.values()].map((s) => ({
        id: s.workerId, name: s.name, option: s.option, bytes: s.bytes,
        sums: s.sums, avgs: s.avgs, wrong: s.wrong,
        points: s.option === 'A' ? s.points.map((p, i) => ({ x: p.x, y: p.y, c: s.labels[i] })) : null,
      })),
      result: S.manual.result,
    },
    race: S.race,
    speculative: S.speculative,
    lineage: S.lineage.slice(-6),
    log: S.log.slice(-40),
    config: { diskReadMs: DISK_READ_MS, diskWriteMs: DISK_WRITE_MS, scalePoints: SCALE_POINTS },
  };
}

function workerSnapshot(w) {
  const parts = w.partitions.map(partitionById).filter(Boolean);
  let manual = null;
  if (S.manual && (S.phase === 'map' || S.phase === 'reduce')) {
    const sub = S.manual.submissions.get(w.id);
    const part = parts[0];
    manual = {
      task: part ? { pid: part.id, from: part.from, to: part.to, points: partitionPoints(part).map(({ x, y }) => ({ x, y })) } : null,
      submitted: sub ? { option: sub.option, bytes: sub.bytes, wrong: sub.wrong, total: sub.points.length } : null,
      revealed: Boolean(S.manual.result),
    };
  }
  return {
    phase: S.phase,
    me: {
      id: w.id,
      name: w.name,
      status: statusOf(w),
      alive: w.alive,
      slow: w.slow,
      partitions: parts.map((p) => ({ id: p.id, from: p.from, to: p.to, inherited: w.inherited.has(p.id) })),
      stats: w.stats,
    },
    centroids: S.centroids,
    manual,
    job: S.job && { mode: S.job.mode, iter: S.job.iter, maxIter: S.job.maxIter, running: S.job.running, race: S.job.race },
    hasData: Boolean(S.data),
  };
}

// ---------------------------------------------------------------- phases

function setPhase(phase) {
  if (!PHASES.includes(phase) || phase === S.phase) return;
  const from = S.phase;
  stopJob();
  if (phase === 'map') {
    if (from === 'lobby' || !S.data) createData();
    startManual();
  }
  if (phase === 'reduce') {
    if (!S.manual || !(S.manual.result || S.manual.submissions.size)) return; // nothing to reduce yet
    if (!S.manual.result) manualReduce();
  }
  // Jumping straight to an automatic phase still needs partitions.
  if (!S.data && ['spark', 'faults', 'hadoop'].includes(phase)) {
    createData();
    resetCentroids();
  }
  S.phase = phase;
  pushLog('phase', `Fase: ${PHASE_LABELS[phase]}`);
  broadcast();
}

const PHASE_LABELS = {
  lobby: 'Unirse', map: 'Map a mano', reduce: 'Reduce', spark: 'Modo Spark',
  faults: 'Fallos', hadoop: 'Hadoop vs Spark', code: 'Código',
};

function createData() {
  const live = liveWorkers().sort((a, b) => a.id - b.id);
  const n = Math.max(1, live.length);
  S.data = km.createDataset(n, POINTS_PER_PARTITION, Date.now() & 0xffffffff);
  for (const w of S.byId.values()) {
    w.partitions = [];
    w.cache.clear();
    w.inherited.clear();
    w.stats = freshStats();
    if (w.socket) w.socket.emit('cache:clear');
  }
  S.data.partitions.forEach((part, i) => {
    const w = live[i];
    if (!w) return;
    part.owner = w.id;
    w.partitions.push(part.id);
  });
  S.lineage = [];
  S.history = [];
  S.race = { hadoop: null, spark: null };
  pushLog('data', `Dataset sintético: ${S.data.points.length} clientes en ${n} particiones de ${POINTS_PER_PARTITION}`);
}

function resetCentroids() {
  S.centroids = cloneCentroids(km.START);
  S.trail = [cloneCentroids(S.centroids)];
  S.history = [];
}

function startManual() {
  resetCentroids();
  S.manual = { submissions: new Map(), result: null };
  for (const w of S.byId.values()) {
    // The manual round loads each partition into its executor's memory.
    w.cache = new Set(w.partitions);
  }
}

function manualSubmit(w, payload) {
  if (S.phase !== 'map' || !S.manual || !w.alive) return;
  if (S.manual.submissions.has(w.id)) return;
  const part = partitionById(w.partitions[0]);
  if (!part) return;
  const points = partitionPoints(part);
  const option = payload && payload.option;
  const labels = payload && payload.labels;
  if (!['A', 'B', 'C'].includes(option)) return;
  if (!Array.isArray(labels) || labels.length !== points.length) return;
  if (!labels.every((l) => Number.isInteger(l) && l >= 0 && l < km.K)) return;

  const sums = km.sumsFromLabels(points, labels);
  const avgs = sums.map((s) => (s.n ? { x: s.sx / s.n, y: s.sy / s.n } : null));
  const wrong = points.reduce((acc, p, i) => acc + (km.nearest(p, S.centroids) === labels[i] ? 0 : 1), 0);
  const bytes = BYTES[option](points.length);
  S.manual.submissions.set(w.id, {
    workerId: w.id, name: w.name, option, labels, points, sums, avgs, wrong, bytes, at: Date.now(),
  });
  w.stats.bytes += bytes;
  w.stats.tasks += 1;
  pushLog('submit', `#${pad(w.id)} ${w.name} envió ${option} · ${formatBytes(bytes)}`);
  broadcast();
}

// The driver only gets what executors sent. Option B carries averages
// without counts, so the driver can't weight them: each one counts as a
// single point. That's the "promedio de promedios" bug, made visible.
function manualReduce() {
  const subs = [...S.manual.submissions.values()];
  const before = cloneCentroids(S.centroids);
  const exact = Array.from({ length: km.K }, () => ({ sx: 0, sy: 0, n: 0 }));
  const naive = Array.from({ length: km.K }, () => ({ sx: 0, sy: 0, n: 0 }));
  const counts = { A: 0, B: 0, C: 0 };
  const bytes = { A: 0, B: 0, C: 0 };
  let wrong = 0;
  let points = 0;

  for (const s of subs) {
    counts[s.option] += 1;
    bytes[s.option] += s.bytes;
    wrong += s.wrong;
    points += s.points.length;
    s.sums.forEach((sum, j) => {
      exact[j].sx += sum.sx; exact[j].sy += sum.sy; exact[j].n += sum.n;
      if (s.option === 'B') {
        if (sum.n) { naive[j].sx += sum.sx / sum.n; naive[j].sy += sum.sy / sum.n; naive[j].n += 1; }
      } else {
        naive[j].sx += sum.sx; naive[j].sy += sum.sy; naive[j].n += sum.n;
      }
    });
  }

  const correct = km.centroidsFromSums(exact, before);
  const after = km.centroidsFromSums(naive, before);
  const error = after.map((c, j) => Math.sqrt(km.dist2(c, correct[j])));
  const owners = S.data.partitions.length;
  S.centroids = after;
  S.trail.push(cloneCentroids(after));
  S.manual.result = {
    before, after, correct, error, counts, bytes, wrong, points,
    missing: Math.max(0, owners - subs.length),
    scaled: {
      A: BYTES.A(SCALE_POINTS), B: BYTES.B(), C: BYTES.C(),
    },
  };
  pushLog('reduce', `Reduce: ${subs.length} mensajes, ${formatBytes(bytes.A + bytes.B + bytes.C)} por la red`);
}

// ---------------------------------------------------------------- jobs

function freshStats() {
  return { tasks: 0, bytes: 0, inherited: 0, speculative: 0 };
}

function startJob(mode, { race = false } = {}) {
  if (!S.data) return;
  if (S.job) {
    // Resume a paused job instead of starting over.
    if (!S.job.running && S.job.mode === mode && !race) {
      S.job.running = true;
      S.job.stopAfterRound = false;
      if (!S.job.round) nextIteration();
      broadcast();
    }
    return;
  }
  if (race) {
    // A fair race: same start, no stragglers, nothing cached.
    resetCentroids();
    for (const w of S.byId.values()) w.slow = false;
    for (const w of S.byId.values()) {
      w.cache.clear();
      if (w.socket) w.socket.emit('cache:clear');
    }
  }
  S.job = {
    mode, race, iter: race ? 0 : S.history.length, running: true, stopAfterRound: false,
    maxIter: race ? RACE_ITER : SPARK_MAX_ITER, startedAt: Date.now(), iterTimes: [], round: null,
  };
  if (S.job.iter >= S.job.maxIter) S.job.maxIter = S.job.iter + SPARK_MAX_ITER;
  pushLog('job', race
    ? `Carrera: ${RACE_ITER} iteraciones en modo ${mode === 'hadoop' ? 'Hadoop MapReduce' : 'Spark'}`
    : 'Job K-Means lanzado');
  nextIteration();
  broadcast();
}

function nextIteration() {
  const job = S.job;
  if (!job || !job.running) return;
  job.iter += 1;
  job.round = {
    iter: job.iter,
    startedAt: Date.now(),
    centroids: cloneCentroids(S.centroids),
    attempts: new Map(), // pid -> task[]
    results: new Map(), // pid -> { sums, cost }
    durations: [],
  };
  for (const part of S.data.partitions) {
    job.round.attempts.set(part.id, []);
    launchTask(part, ownerOrReassign(part, 'sin ejecutor'));
  }
}

let taskSeq = 0;
function launchTask(part, w, speculative = false) {
  const job = S.job;
  if (!job || !job.round) return;
  if (!w) {
    pushLog('warn', `P${pad(part.id)} sin executors disponibles`);
    return;
  }
  const round = job.round;
  const hadoop = job.mode === 'hadoop';
  const needsRead = hadoop || !w.cache.has(part.id);
  const task = {
    key: `${round.iter}.${part.id}.${++taskSeq}`,
    pid: part.id,
    iter: round.iter,
    workerId: w.id,
    speculative,
    startedAt: Date.now(),
    readMs: needsRead ? (speculative ? REPLICA_READ_MS : DISK_READ_MS) : 0,
    computeMs: 350 + Math.round(Math.random() * 550) + (w.slow ? SLOW_EXTRA_MS : 0),
    writeMs: hadoop ? DISK_WRITE_MS : 0,
  };
  task.timer = setTimeout(() => taskTimedOut(task), task.readMs + task.computeMs + task.writeMs + TASK_GRACE_MS);
  w.tasks.set(task.key, task);
  round.attempts.get(part.id).push(task);
  if (speculative) w.stats.speculative += 1;
  w.socket.emit('task', {
    key: task.key,
    pid: part.id,
    iter: round.iter,
    mode: job.mode,
    speculative,
    centroids: round.centroids,
    points: needsRead ? partitionPoints(part).map(({ x, y }) => ({ x, y })) : null,
    cache: !hadoop,
    readMs: task.readMs,
    computeMs: task.computeMs,
    writeMs: task.writeMs,
  });
}

function cancelTask(task, notify = true, reason = 'stop') {
  clearTimeout(task.timer);
  const w = S.byId.get(task.workerId);
  if (!w) return;
  w.tasks.delete(task.key);
  if (notify && w.socket) w.socket.emit('task:cancel', { key: task.key, reason });
}

function taskResult(w, payload) {
  const task = payload && w.tasks.get(payload.key);
  if (!task) return;
  clearTimeout(task.timer);
  w.tasks.delete(task.key);
  const job = S.job;
  const round = job && job.round;
  if (!w.alive || !round || round.iter !== task.iter || round.results.has(task.pid)) {
    broadcast();
    return;
  }
  const sums = payload.sums;
  const cost = Number(payload.cost);
  const valid = Array.isArray(sums) && sums.length === km.K
    && sums.every((s) => s && [s.sx, s.sy, s.n].every(Number.isFinite)) && Number.isFinite(cost);
  if (!valid) return;

  round.results.set(task.pid, { sums, cost });
  round.durations.push(Date.now() - task.startedAt);
  w.stats.tasks += 1;
  w.stats.bytes += BYTES.C();
  if (job.mode === 'spark') w.cache.add(task.pid);

  for (const other of round.attempts.get(task.pid)) {
    if (other !== task && w.id !== other.workerId) cancelTask(other, true, 'spec');
  }
  if (task.speculative) {
    const original = round.attempts.get(task.pid)[0];
    pushLog('spec', `P${pad(task.pid)}: la copia en #${pad(w.id)} le ganó a #${pad(original.workerId)}`);
  }
  if (round.results.size === S.data.partitions.length) finishIteration();
  else broadcast();
}

function finishIteration() {
  const job = S.job;
  const round = job.round;
  const totals = Array.from({ length: km.K }, () => ({ sx: 0, sy: 0, n: 0 }));
  let cost = 0;
  for (const r of round.results.values()) {
    r.sums.forEach((s, j) => { totals[j].sx += s.sx; totals[j].sy += s.sy; totals[j].n += s.n; });
    cost += r.cost;
  }
  const next = km.centroidsFromSums(totals, round.centroids);
  const shift = Math.max(...next.map((c, j) => Math.sqrt(km.dist2(c, round.centroids[j]))));
  const ms = Date.now() - round.startedAt;
  S.centroids = next;
  S.trail.push(cloneCentroids(next));
  if (S.trail.length > 60) S.trail.shift();
  job.iterTimes.push(ms);
  if (!job.race) S.history.push({ iter: round.iter, cost, ms, shift });
  job.round = null;

  const converged = !job.race && shift < CONVERGED_SHIFT;
  if (converged) pushLog('done', `Convergió en la iteración ${round.iter} (costo ${Math.round(cost)})`);
  if (converged || job.iter >= job.maxIter || job.stopAfterRound) {
    if (job.race) {
      S.race[job.mode] = { iterTimes: job.iterTimes, total: job.iterTimes.reduce((a, b) => a + b, 0) };
      pushLog('done', `${job.mode === 'hadoop' ? 'Hadoop' : 'Spark'}: ${RACE_ITER} iteraciones en ${(S.race[job.mode].total / 1000).toFixed(1)} s`);
    }
    if (job.stopAfterRound && !converged && job.iter < job.maxIter) {
      job.running = false;
      job.stopAfterRound = false;
    } else {
      S.job = null;
    }
  } else {
    setTimeout(nextIteration, 450);
  }
  broadcast();
}

function stopJob() {
  if (!S.job) return;
  const round = S.job.round;
  if (round) for (const list of round.attempts.values()) for (const t of list) cancelTask(t);
  S.job = null;
}

function taskTimedOut(task) {
  const w = S.byId.get(task.workerId);
  const round = S.job && S.job.round;
  if (!w || !w.tasks.has(task.key)) return;
  w.tasks.delete(task.key);
  if (!round || round.iter !== task.iter || round.results.has(task.pid)) return;
  pushLog('warn', `#${pad(w.id)} no respondió a tiempo (P${pad(task.pid)})`);
  const part = partitionById(task.pid);
  const live = round.attempts.get(task.pid).some((t) => t !== task && S.byId.get(t.workerId)?.tasks.has(t.key));
  if (!live) launchTask(part, reassign(part, 'sin respuesta', w.id));
  broadcast();
}

// Speculative execution: once half the partitions are back, relaunch the
// ones that take far longer than the median on an idle executor.
setInterval(() => {
  const round = S.job && S.job.round;
  if (!round || !S.speculative || !S.data) return;
  const total = S.data.partitions.length;
  if (round.results.size < Math.ceil(total * 0.5) || !round.durations.length) return;
  const sorted = [...round.durations].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const threshold = Math.max(1500, median * 2.2);
  const now = Date.now();
  for (const [pid, attempts] of round.attempts) {
    if (round.results.has(pid) || !attempts.length || attempts.some((t) => t.speculative)) continue;
    const primary = attempts[attempts.length - 1];
    if (now - primary.startedAt - primary.readMs < threshold) continue;
    const idle = liveWorkers()
      .filter((w) => !w.tasks.size && !w.slow && w.id !== primary.workerId)
      .sort((a, b) => a.stats.tasks - b.stats.tasks)[0];
    if (!idle) return;
    pushLog('spec', `P${pad(pid)} tarda demasiado en #${pad(primary.workerId)}: copia especulativa en #${pad(idle.id)}`);
    launchTask(partitionById(pid), idle, true);
    broadcast();
  }
}, 300);

// ---------------------------------------------------------------- faults

function ownerOrReassign(part, reason) {
  const owner = S.byId.get(part.owner);
  if (owner && owner.alive && owner.connected) return owner;
  return reassign(part, reason, part.owner);
}

// Lineage: a lost partition isn't copied from anywhere, it's recomputed
// from the source by replaying the transformations that built it.
function reassign(part, reason, excludeId) {
  const target = liveWorkers()
    .filter((w) => w.id !== excludeId)
    .sort((a, b) => (a.partitions.length - b.partitions.length) || (a.tasks.size - b.tasks.size) || (a.id - b.id))[0];
  if (!target) return null;
  const prev = S.byId.get(part.owner);
  if (prev) {
    prev.partitions = prev.partitions.filter((p) => p !== part.id);
    prev.cache.delete(part.id);
  }
  part.owner = target.id;
  target.partitions.push(part.id);
  target.inherited.add(part.id);
  target.stats.inherited += 1;
  const event = { t: Date.now(), pid: part.id, from: prev ? prev.id : null, to: target.id, reason };
  S.lineage.push(event);
  if (S.lineage.length > 30) S.lineage.shift();
  pushLog('lineage', `P${pad(part.id)} perdida${prev ? ` en #${pad(prev.id)}` : ''} (${reason}): se recalcula desde el origen en #${pad(target.id)}`);
  if (target.socket) target.socket.emit('inherited', { pid: part.id, from: prev ? prev.id : null, reason });
  return target;
}

function failWorker(w, reason) {
  const round = S.job && S.job.round;
  const lost = [...w.tasks.values()];
  for (const t of lost) cancelTask(t, false);
  if (!S.data) return;
  for (const pid of [...w.partitions]) {
    const part = partitionById(pid);
    const t = lost.find((x) => x.pid === pid);
    if (S.phase === 'map' && S.manual && S.manual.submissions.has(w.id)) continue;
    if (S.job || reason === 'caído') {
      const target = reassign(part, reason, w.id);
      if (round && t && !round.results.has(pid)) launchTask(part, target);
    }
  }
  // Speculative copies this executor was running for others.
  if (round) {
    for (const t of lost) {
      if (w.partitions.includes(t.pid) || round.results.has(t.pid)) continue;
      const others = round.attempts.get(t.pid).some((x) => x !== t && S.byId.get(x.workerId)?.tasks.has(x.key));
      if (!others) launchTask(partitionById(t.pid), ownerOrReassign(partitionById(t.pid), reason));
    }
  }
}

function killWorker(id) {
  const w = S.byId.get(id);
  if (!w || !w.alive) return;
  w.alive = false;
  pushLog('kill', `#${pad(w.id)} ${w.name} se cayó`);
  if (w.socket) w.socket.emit('killed');
  failWorker(w, 'caído');
}

function reviveWorker(id) {
  const w = S.byId.get(id);
  if (!w || w.alive) return;
  w.alive = true;
  w.slow = false;
  w.cache.clear();
  pushLog('revive', `#${pad(w.id)} volvió como executor de reserva`);
}

// ---------------------------------------------------------------- sockets

io.on('connection', (socket) => {
  const auth = socket.handshake.auth || {};
  if (auth.role === 'driver') return attachDriver(socket, auth);
  if (auth.role === 'worker') return attachWorker(socket, auth);
  socket.disconnect(true);
});

function attachDriver(socket, auth) {
  if (auth.key !== DRIVER_KEY) {
    socket.emit('auth:error', 'Clave de driver incorrecta');
    socket.disconnect(true);
    return;
  }
  socket.join('drivers');
  socket.emit('data', S.data && S.data.points);
  socket.emit('state', driverSnapshot());

  const on = (event, fn) => socket.on(event, (payload) => {
    const hadData = S.data;
    fn(payload || {});
    if (S.data !== hadData) io.to('drivers').emit('data', S.data && S.data.points);
    broadcast();
  });

  on('phase', ({ phase }) => setPhase(phase));
  on('manual:reduce', () => {
    if (S.phase === 'map' && S.manual && S.manual.submissions.size) setPhase('reduce');
  });
  on('job:run', () => startJob('spark'));
  on('job:pause', () => { if (S.job) S.job.stopAfterRound = true; });
  on('job:reset', () => { stopJob(); resetCentroids(); pushLog('job', 'Centroides reiniciados'); });
  on('speculative', ({ on: value }) => { S.speculative = Boolean(value); });
  on('worker:kill', ({ id }) => killWorker(id));
  on('worker:revive', ({ id }) => reviveWorker(id));
  on('worker:slow', ({ id }) => {
    const w = S.byId.get(id);
    if (!w) return;
    w.slow = !w.slow;
    pushLog('slow', w.slow ? `#${pad(w.id)} ahora es un straggler` : `#${pad(w.id)} volvió a su velocidad`);
  });
  on('chaos', ({ n }) => {
    const victims = liveWorkers().filter((w) => w.partitions.length).sort(() => Math.random() - 0.5).slice(0, Math.max(1, Math.min(10, n | 0)));
    victims.forEach((w) => killWorker(w.id));
  });
  on('race:run', ({ mode }) => {
    if (S.job) return;
    if (mode === 'hadoop' || mode === 'spark') startJob(mode, { race: true });
  });
  on('race:reset', () => { stopJob(); S.race = { hadoop: null, spark: null }; });
  on('data:new', () => {
    stopJob();
    createData();
    if (S.phase === 'map' || S.phase === 'reduce') { S.phase = 'map'; startManual(); } else resetCentroids();
  });
}

function attachWorker(socket, auth) {
  const token = typeof auth.token === 'string' ? auth.token.slice(0, 64) : '';
  if (!token) { socket.disconnect(true); return; }
  let w = S.workers.get(token);
  if (!w) {
    if (S.byId.size >= MAX_WORKERS) {
      socket.emit('join:error', 'El clúster está lleno');
      socket.disconnect(true);
      return;
    }
    const id = S.nextId++;
    w = {
      id, token, name: cleanName(auth.name) || `Executor ${id}`, socket: null, connected: false,
      alive: true, slow: false, partitions: [], cache: new Set(), inherited: new Set(),
      tasks: new Map(), stats: freshStats(),
    };
    S.workers.set(token, w);
    S.byId.set(id, w);
    pushLog('join', `#${pad(id)} ${w.name} se unió${S.data ? ' (reserva)' : ''}`);
  } else if (cleanName(auth.name)) {
    w.name = cleanName(auth.name);
  }
  if (w.socket && w.socket !== socket) w.socket.disconnect(true);
  w.socket = socket;
  w.connected = true;
  // A reconnecting phone lost its in-memory cache along with the page.
  if (auth.fresh) w.cache.clear();
  socket.emit('state', workerSnapshot(w));
  broadcast();

  socket.on('manual:submit', (payload) => manualSubmit(w, payload));
  socket.on('task:result', (payload) => taskResult(w, payload));
  socket.on('rename', (name) => {
    const n = cleanName(name);
    if (n) { w.name = n; broadcast(); }
  });
  socket.on('disconnect', () => {
    if (w.socket !== socket) return;
    w.connected = false;
    w.socket = null;
    if (S.job && w.alive) {
      pushLog('offline', `#${pad(w.id)} perdió conexión`);
      failWorker(w, 'desconectado');
    }
    broadcast();
  });
}

// ---------------------------------------------------------------- utils

function cleanName(name) {
  if (typeof name !== 'string') return '';
  return name.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 16);
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function formatBytes(b) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
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

server.listen(PORT, () => {
  console.log('\n  Clúster en el aula');
  console.log(`  Alumnos:   ${PUBLIC_URL}`);
  console.log(`  Proyector: http://localhost:${PORT}/driver?key=${DRIVER_KEY}\n`);
});
