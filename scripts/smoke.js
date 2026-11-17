'use strict';

// End-to-end test: boots the server on a free port, plays a whole class with
// the projector and a handful of phones, and checks the contract in
// presentacion-web/ACTIVIDAD.md. Exit code 0 = all good, 1 = something failed.
//   npm test

const net = require('net');
const path = require('path');
const { spawn } = require('child_process');
const { io } = require('socket.io-client');
const km = require('../lib/kmeans');

const KEY = 'smoke-key';
// Short timers so the test does not wait like a real class.
const ENV = { SOLO_MS: '900', SPIN_MS: '600', DEAD_AFTER_MS: '500' };
const failures = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const same = (a, b) => Math.abs(a - b) < 1e-9;

function check(cond, msg) {
  if (!cond) { failures.push(msg); console.log(`  FALLA: ${msg}`); }
  return cond;
}

function step(name) {
  console.log(`- ${name}`);
}

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

function startServer(port) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
      env: { ...process.env, ...ENV, PORT: String(port), DRIVER_KEY: KEY, PUBLIC_URL: `http://localhost:${port}` },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    const timer = setTimeout(() => reject(new Error(`el servidor no arrancó:\n${out}`)), 8000);
    child.stdout.on('data', (d) => { out += d; if (out.includes('Proyector:')) { clearTimeout(timer); resolve(child); } });
    child.stderr.on('data', (d) => { out += d; process.stderr.write(d); });
    child.on('exit', (code) => reject(new Error(`el servidor salió con código ${code}:\n${out}`)));
  });
}

// ---------------------------------------------------------------- clients

const clients = [];

function connect(url, auth) {
  const socket = io(url, { auth, reconnection: false, forceNew: true });
  const c = { socket, state: null, tasks: [], errors: [], respond: false, listeners: [] };
  clients.push(c);
  socket.on('state', (s) => { c.state = s; c.listeners.forEach((fn) => fn()); });
  socket.on('auth:error', (m) => c.errors.push(['auth:error', m]));
  socket.on('join:error', (m) => c.errors.push(['join:error', m]));
  socket.on('task', (t) => {
    c.tasks.push(t);
    if (!c.respond) return;
    // A phone that is off stays silent; the others compute for real.
    setTimeout(() => {
      if (!c.state || c.state.me.off) return;
      const points = c.state.parts.flatMap((part) => part.points);
      socket.emit('task:result', { round: t.round, sums: km.partialSums(points, t.centers) });
    }, 120);
  });
  return c;
}

const phone = (url, name) => connect(url, { role: 'worker', token: `tok-${name}`, name });

function waitFor(c, pred, label, ms = 6000) {
  return new Promise((resolve, reject) => {
    const test = () => {
      let ok = false;
      try { ok = c.state && pred(c.state); } catch (_) { ok = false; }
      if (ok) {
        c.listeners = c.listeners.filter((fn) => fn !== test);
        clearTimeout(timer);
        resolve(c.state);
      }
      return ok;
    };
    const timer = setTimeout(() => {
      c.listeners = c.listeners.filter((fn) => fn !== test);
      reject(new Error(`timeout esperando: ${label}`));
    }, ms);
    if (!test()) c.listeners.push(test);
  });
}

const waitAll = (list, pred, label, ms) => Promise.all(list.map((c) => waitFor(c, pred, label, ms)));

// ---------------------------------------------------------------- contract shapes

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isPoint = (p) => p && isNum(p.x) && isNum(p.y);
const isCounts = (c) => Array.isArray(c) && c.length === 3 && c.every((n) => Number.isInteger(n) && n >= 0);
const PHASES = ['lobby', 'solo', 'manager', 'work', 'combine', 'fail', 'end'];
const MEDALS = ['driver', 'top', 'heir', 'fallen', 'survivor', 'worker', 'cluster'];
const STATUSES = ['waiting', 'painting', 'done', 'joined', 'out', 'driver', 'sent', 'idle', 'working', 'off', 'offline'];

function checkProjectorShape(s, where) {
  const ok = (cond, what) => check(cond, `[${where}] state del proyector: ${what}`);
  ok(PHASES.includes(s.phase), 'phase');
  ok(typeof s.publicUrl === 'string', 'publicUrl');
  ok(s.driver === null || (isNum(s.driver.id) && typeof s.driver.name === 'string' && typeof s.driver.connected === 'boolean'), 'driver');
  ok(Array.isArray(s.phones) && s.phones.every((p) => isNum(p.id) && typeof p.name === 'string' && STATUSES.includes(p.status)
    && typeof p.registered === 'boolean' && isNum(p.parts) && isNum(p.inherited) && isNum(p.solo)), 'phones[{id,name,status,registered,parts,inherited,solo}]');
  ok(Array.isArray(s.points) && s.points.every((p) => isPoint(p) && typeof p.moved === 'boolean'
    && Number.isInteger(p.label) && p.label >= -1 && p.label < 3), 'points[{x,y,label,moved}]');
  ok(Array.isArray(s.centers) && s.centers.length === 3 && s.centers.every(isPoint), 'centers');
  ok(Array.isArray(s.trail) && s.trail.length === s.round + 1 && s.shifts.length === s.round, 'trail y shifts coherentes con round');
  ok(same(s.trail[s.trail.length - 1][0].x, s.centers[0].x), 'la última posición de trail es centers');
  ok(s.solo === null || (isNum(s.solo.total) && isNum(s.solo.remainingMs) && typeof s.solo.over === 'boolean'
    && Array.isArray(s.solo.leaders) && isNum(s.solo.estimateMs) && isNum(s.solo.msPerPoint)), 'solo');
  ok(s.manual === null || (isNum(s.manual.round) && isNum(s.manual.done) && isNum(s.manual.total)), 'manual');
  ok(Array.isArray(s.inbox) && s.inbox.every((e) => isNum(e.part) && typeof e.from === 'string' && typeof e.by === 'string' && isCounts(e.counts)), 'inbox');
  ok(isCounts(s.totals), 'totals');
  ok(typeof s.busy === 'boolean' && typeof s.running === 'boolean' && typeof s.converged === 'boolean', 'busy/running/converged');
  ok(s.join === null || (isNum(s.join.parts) && isNum(s.join.filled) && isNum(s.join.workers) && isNum(s.join.rescued) && isNum(s.join.soloMs)), 'join');
  ok(s.lastFail === null || (isNum(s.lastFail.n) && ['spin', 'kill', 'lost'].includes(s.lastFail.cause)
    && typeof s.lastFail.victim === 'string' && typeof s.lastFail.heir === 'string' && isNum(s.lastFail.parts)), 'lastFail');
  ok(s.spin === null || (isNum(s.spin.n) && Array.isArray(s.spin.candidates) && s.spin.candidates.includes(s.spin.victim) && isNum(s.spin.ms)), 'spin');
  const st = s.stats;
  ok(st && isNum(st.phones) && isNum(st.workers) && isNum(st.points) && isNum(st.parts) && isNum(st.summaries) && isNum(st.fails), 'stats');
  ok(st.phones === s.phones.length && st.points === s.points.length, 'stats coherente');
}

function checkPhoneShape(s, where) {
  const ok = (cond, what) => check(cond, `[${where}] state del celular: ${what}`);
  ok(PHASES.includes(s.phase), 'phase');
  const m = s.me;
  ok(m && isNum(m.id) && typeof m.name === 'string' && ['driver', 'worker', 'none'].includes(m.role)
    && typeof m.off === 'boolean' && typeof m.working === 'boolean' && isNum(m.rounds) && isNum(m.soloDone)
    && typeof m.top === 'boolean', 'me');
  ok(Array.isArray(m.medals) && m.medals.length >= 1 && m.medals.every((x) => MEDALS.includes(x)), 'me.medals');
  ok(s.solo === null || (isNum(s.solo.seed) && isNum(s.solo.total) && isNum(s.solo.remainingMs) && typeof s.solo.over === 'boolean'), 'solo');
  ok(typeof s.dataKey === 'string' && /^\d+:\d+$/.test(s.dataKey), 'dataKey');
  ok(Array.isArray(s.centers) && s.centers.length === 3 && s.centers.every(isPoint), 'centers');
  ok(Array.isArray(s.parts) && s.parts.every((p) => isNum(p.id) && (p.from === null || typeof p.from === 'string')
    && typeof p.sent === 'boolean' && Array.isArray(p.points) && p.points.every((q) => isPoint(q) && Number.isInteger(q.label))), 'parts');
  ok(s.driver === null || typeof s.driver.name === 'string', 'driver');
  ok(isNum(s.workers), 'workers');
  ok(s.spin === null || (isNum(s.spin.n) && isNum(s.spin.ms)), 'spin');
  ok(s.lastFail === null || ['victim', 'heir', 'safe'].includes(s.lastFail.me), 'lastFail.me');
  if (m.role === 'driver') ok(Array.isArray(s.inbox) && s.progress && isCounts(s.totals), 'campos del driver');
  else ok(s.inbox === undefined, 'el inbox solo lo ve el driver');
}

// ---------------------------------------------------------------- generator and convergence

function convergence() {
  for (const phones of [3, 10, 30]) {
    let worstRounds = 0;
    let worstDist = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const pts = [];
      for (let i = 0; i < phones; i++) pts.push(...km.createPhonePoints(seed * 1000 + i));
      let centers = km.START.map((c) => ({ ...c }));
      let rounds = 0;
      let shift = Infinity;
      while (shift >= 0.5 && rounds < 30) {
        ({ centers, shift } = km.step(pts, centers));
        rounds += 1;
      }
      worstRounds = Math.max(worstRounds, rounds);
      // "Real group" = the mean of the points actually drawn from that group.
      for (let g = 0; g < 3; g++) {
        const m = pts.filter((p) => p.group === g);
        const mean = { x: m.reduce((a, p) => a + p.x, 0) / m.length, y: m.reduce((a, p) => a + p.y, 0) / m.length };
        worstDist = Math.max(worstDist, km.dist(centers[g], mean));
      }
    }
    console.log(`  ${phones} celulares x 200 semillas: peor caso ${worstRounds} vueltas, centro a ${worstDist.toFixed(2)} de su grupo`);
    check(worstRounds <= 8, `convergencia con ${phones} celulares tarda ${worstRounds} vueltas (máx 8)`);
    check(worstDist < 8, `convergencia con ${phones} celulares: un centro quedó a ${worstDist.toFixed(2)} de su grupo (máx 8)`);
  }
}

function pointsGenerator() {
  for (let seed = 1; seed <= 200; seed++) {
    const pts = km.createPhonePoints(seed);
    if (!check(pts.length === 6, 'createPhonePoints devuelve 6 puntos')) return;
    for (let g = 0; g < 3; g++) {
      if (!check(pts.filter((p) => p.group === g).length === 2, 'createPhonePoints: 2 puntos por grupo')) return;
    }
    for (let i = 0; i < 6; i++) {
      if (!check(km.margin(pts[i], km.START) >= 8, `createPhonePoints: margen < 8 (semilla ${seed})`)) return;
      if (i && !check(km.margin(pts[i - 1], km.START) >= km.margin(pts[i], km.START), 'createPhonePoints: no está ordenado por margen')) return;
    }
  }
  const a = km.soloPoints(12345, 150);
  const b = km.soloPoints(12345, 150);
  check(a.length === 150 && a.every((p, i) => p.x === b[i].x && p.y === b[i].y), 'soloPoints: misma semilla, mismos puntos');
  check(a.every((p) => km.margin(p, km.START) >= 8), 'soloPoints: margen >= 8 en todos');
  check(km.soloPoints(1, 61).length === 61, 'soloPoints respeta el total');
}

// ---------------------------------------------------------------- the class

async function activity(port) {
  const url = `http://localhost:${port}`;

  step('autenticación');
  const bad = connect(url, { role: 'projector', key: 'mala' });
  await sleep(400);
  check(bad.errors.some((e) => e[0] === 'auth:error'), 'clave incorrecta debe emitir auth:error');
  check(!bad.socket.connected, 'clave incorrecta debe desconectar');
  const anon = connect(url, { role: 'worker' });
  const old = connect(url, { role: 'driver', key: KEY });
  await sleep(300);
  check(!anon.socket.connected, 'celular sin token debe desconectarse');
  check(!old.socket.connected, 'el rol viejo "driver" ya no existe');

  const proj = connect(url, { role: 'projector', key: KEY });
  await waitFor(proj, (s) => s.phase === 'lobby', 'proyector en lobby');
  checkProjectorShape(proj.state, 'lobby');

  step('unirse (lobby)');
  const [A, B, C, D, E] = ['Ana', 'Bruno', 'Caro', 'Dani', 'Eze'].map((n) => phone(url, n));
  await waitFor(proj, (s) => s.phones.length === 5, '5 celulares');
  await waitAll([A, B, C, D, E], (s) => s.phase === 'lobby' && s.me.role === 'none', 'celulares en lobby');
  checkPhoneShape(A.state, 'lobby');
  check(proj.state.phones.every((p) => p.status === 'waiting'), 'en lobby todos están "waiting"');

  step('basura y saltos no rompen nada');
  proj.socket.emit('phase', { phase: 'work' });
  proj.socket.emit('phase', { phase: 'end' });
  proj.socket.emit('kill', 'x');
  proj.socket.emit('join', null);
  proj.socket.emit('driver', { id: 'x' });
  A.socket.emit('part:submit', null);
  A.socket.emit('solo:progress', { done: 'x' });
  A.socket.emit('driver:ask');
  A.socket.emit('register');
  await sleep(250);
  check(proj.state.phase === 'lobby', 'no se puede saltar pasos ni registrarse en lobby');
  check(proj.state.stats.registered === 0, 'nadie se registró en lobby');

  step('solo: cada celular es el driver con todos los puntos');
  proj.socket.emit('phase', { phase: 'solo' });
  await waitAll([proj, A, B, C, D, E], (s) => s.phase === 'solo', 'fase solo');
  const so = A.state.solo;
  check(so && so.total === 60, `con 5 celulares el trabajo solo es de 60 puntos (es ${so && so.total})`);
  check([B, C, D, E].every((c) => c.state.solo.seed === so.seed), 'todos tienen la misma semilla');
  check(so.remainingMs > 0 && so.remainingMs <= 900, 'remainingMs dentro del tiempo');
  checkPhoneShape(A.state, 'solo');
  for (let i = 1; i <= 10; i++) A.socket.emit('solo:progress', { done: i });
  for (let i = 1; i <= 5; i++) B.socket.emit('solo:progress', { done: i });
  C.socket.emit('solo:progress', { done: 7 });
  E.socket.emit('solo:progress', { done: 2 });
  E.socket.emit('solo:progress', { done: 1 });
  E.socket.emit('solo:progress', { done: 999 });
  await waitFor(proj, (s) => s.solo.leaders.length === 4 && s.solo.leaders[0].name === 'Ana', 'ranking solo');
  const lead = proj.state.solo.leaders;
  check(lead.map((l) => l.name).join(',') === 'Ana,Caro,Bruno,Eze', `orden del ranking: ${lead.map((l) => l.name).join(',')}`);
  check(lead.find((l) => l.name === 'Eze').done === 2, 'el avance solo no baja ni pasa el total');
  check(proj.state.solo.painted === 24 && proj.state.solo.players === 4, 'suma de lo pintado');
  checkProjectorShape(proj.state, 'solo');
  await waitFor(proj, (s) => s.solo.over, 'se termina el tiempo', 3000);
  check(proj.state.solo.top && proj.state.solo.top.name === 'Ana', 'la que más pintó es Ana');
  check(proj.state.solo.estimateMs > 0, 'hay estimación para un driver solo');
  await waitFor(A, (s) => s.me.top, 'Ana se entera de que pintó más');
  check(!B.state.me.top, 'solo una es la que más pintó');
  await sleep(1600);
  B.socket.emit('solo:progress', { done: 6 });
  await sleep(200);
  check(proj.state.solo.leaders.find((l) => l.name === 'Bruno').done === 5, 'después del tiempo no se cuenta más');

  step('manager: aparece el cluster manager, elige el driver y anota a los workers');
  E.socket.disconnect(); // Eze is away when the cluster manager shows up
  await waitFor(proj, (s) => s.phones.find((p) => p.name === 'Eze').status === 'offline', 'Eze se desconecta');
  proj.socket.emit('phase', { phase: 'manager' });
  await waitAll([proj, A], (s) => s.phase === 'manager', 'fase manager');
  check(proj.state.driver && proj.state.driver.name === 'Ana', 'el driver es la que más pintó');
  await waitFor(A, (s) => s.me.role === 'driver', 'Ana es driver');
  await waitAll([B, C, D], (s) => s.me.role === 'worker' && s.me.registered, 'los demás quedan anotados como workers sin tocar nada');
  checkPhoneShape(A.state, 'manager driver');
  checkPhoneShape(B.state, 'manager worker');
  check(proj.state.stats.registered === 3, `3 compus anotadas (hay ${proj.state.stats.registered})`);
  check(proj.state.phones.find((p) => p.name === 'Bruno').status === 'joined', 'status "joined"');
  check(!proj.state.phones.find((p) => p.name === 'Eze').registered, 'quien no estaba conectada no queda anotada');
  A.socket.emit('register');
  await sleep(200);
  check(A.state.me.role === 'driver', 'el driver no es worker');
  const idOf = (c) => c.state.me.id;
  proj.socket.emit('driver', { id: idOf(B) });
  await waitFor(B, (s) => s.me.role === 'driver', 'el proyector cambia el driver');
  await waitFor(A, (s) => s.me.role === 'worker', 'la driver anterior pasa a ser worker');
  proj.socket.emit('driver', { id: idOf(A) });
  await waitFor(A, (s) => s.me.role === 'driver', 'Ana vuelve a ser driver');
  await waitFor(B, (s) => s.me.role === 'worker', 'Bruno vuelve a ser worker solo');
  check(proj.state.stats.registered === 3, 'siguen 3 workers');
  C.socket.emit('driver:ask');
  await sleep(200);
  check(proj.state.phase === 'manager', 'solo el driver puede pedir compus');
  A.socket.emit('driver:ask');

  step('work: cada worker pinta su parte y manda el resumen');
  await waitAll([proj, A, B, C, D], (s) => s.phase === 'work', 'fase work');
  check(proj.state.manual && proj.state.manual.round === 1 && proj.state.manual.total === 3, 'una parte por worker');
  check([B, C, D].every((c) => c.state.parts.length === 1 && c.state.parts[0].points.length === 6
    && c.state.parts[0].points.every((p) => p.label === -1) && c.state.parts[0].from === null), 'cada worker tiene 6 puntos sin pintar');
  check(A.state.parts.length === 0 && A.state.progress.total === 3, 'el driver no tiene parte: espera resúmenes');
  checkPhoneShape(B.state, 'work');
  checkProjectorShape(proj.state, 'work');
  E.socket.connect();
  await waitFor(E, (s) => s.phase === 'work' && s.me.role === 'worker' && s.parts.length === 1
    && s.parts[0].points.every((p) => p.label === -1), 'Eze vuelve tarde: el cluster manager lo anota y recibe su parte');
  await waitFor(proj, (s) => s.manual.total === 4, '4 partes');
  const partOf = (c) => c.state.parts[0].id;
  B.socket.emit('part:submit', { part: partOf(B) });
  await waitFor(A, (s) => s.inbox.length === 1, 'llega el primer resumen al driver');
  const first = A.state.inbox[0];
  check(first.by === 'Bruno' && first.from === 'Bruno' && first.counts.reduce((a, n) => a + n, 0) === 6, 'el resumen cuenta los 6 puntos');
  B.socket.emit('part:submit', { part: partOf(B) });
  C.socket.emit('part:submit', { part: partOf(B) });
  await sleep(200);
  check(proj.state.manual.done === 1 && proj.state.inbox.length === 1, 'no se manda dos veces ni la parte de otro');
  check(proj.state.points.filter((p) => p.label >= 0).length === 6, 'se pintan solo los puntos que llegaron');

  step('work: una compu se desconecta y su parte pasa a otra');
  const dTok = 'tok-Dani';
  const dId = idOf(D);
  D.socket.close();
  await waitFor(proj, (s) => s.lastFail && s.lastFail.cause === 'lost', 'el cluster manager se da cuenta', 3000);
  const lost = proj.state.lastFail;
  check(lost.victim === 'Dani' && lost.parts === 1, 'se cayó Dani con su parte');
  check(lost.heir === 'Bruno', `hereda el menos cargado y de menor id (heredó ${lost.heir})`);
  await waitFor(B, (s) => s.parts.length === 2 && s.parts[1].from === 'Dani', 'Bruno recibe la parte de Dani');
  check(B.state.lastFail.me === 'heir', 'Bruno sabe que heredó');
  check(proj.state.phones.find((p) => p.id === dId).status === 'off', 'Dani figura caída');
  const D2 = connect(url, { role: 'worker', token: dTok, name: 'Dani' });
  await waitFor(D2, (s) => s.me.id === dId && !s.me.off && s.me.lostTo === 'Bruno' && s.parts.length === 0, 'Dani vuelve libre y sin su parte');
  C.socket.emit('part:submit', { part: partOf(C) });
  E.socket.emit('part:submit', { part: partOf(E) });
  B.socket.emit('part:submit', { part: B.state.parts[1].id });
  await waitFor(A, (s) => s.progress.done === 4, 'llegan los 4 resúmenes');
  check(A.state.inbox.some((e) => e.from === 'Dani' && e.by === 'Bruno'), 'el driver ve que Bruno hizo la parte de Dani');

  step('combine: el driver junta');
  const ptsBefore = proj.state.points;
  A.socket.emit('driver:join');
  await waitAll([proj, A, B], (s) => s.phase === 'combine', 'fase combine');
  const expected = km.step(ptsBefore, km.START).centers;
  check(proj.state.centers.every((c, k) => same(c.x, expected[k].x) && same(c.y, expected[k].y)), 'centros = un paso de K-Means desde START');
  check(proj.state.round === 1 && proj.state.manual === null, 'round 1 y sin vuelta a mano');
  const j1 = proj.state.join;
  check(j1.parts === 4 && j1.filled === 0 && j1.workers === 3 && j1.rescued === 1, `datos del join: ${JSON.stringify(j1)}`);
  check(isNum(j1.parallelMs) && j1.soloMs > 0 && typeof j1.slowest === 'string', 'tiempos del clúster y del driver solo');
  check(proj.state.points.every((p) => p.label >= 0), 'todos los puntos pintados');
  check(proj.state.totals.reduce((a, n) => a + n, 0) === 24, 'totales = 24 puntos');
  checkProjectorShape(proj.state, 'combine');
  checkPhoneShape(A.state, 'combine driver');

  step('combine: repetir solo hasta que no cambie');
  [B, C, E, D2].forEach((c) => { c.respond = true; });
  B.socket.emit('driver:run', { on: true });
  await sleep(200);
  check(!proj.state.running, 'solo el driver o el proyector arrancan las vueltas');
  A.socket.emit('driver:run', { on: true });
  await waitFor(proj, (s) => s.converged && !s.busy, 'converge', 15000);
  check(proj.state.round >= 2 && !proj.state.running, 'hubo vueltas automáticas y se frenó al converger');
  await waitFor(B, (s) => s.me.rounds >= 1, 'los workers respondieron tareas');
  check(D2.tasks.length === 0, 'una compu sin partes no recibe tareas');
  const roundsBefore = proj.state.round;
  proj.socket.emit('round');
  await sleep(250);
  check(proj.state.round === roundsBefore, 'después de converger no hay más vueltas');

  step('fail: otra vuelta a mano y la ruleta');
  proj.socket.emit('phase', { phase: 'fail' });
  await waitAll([proj, B, C, E], (s) => s.phase === 'fail' && s.manual, 'fase fail con vuelta a mano');
  check(proj.state.manual.round === roundsBefore + 1 && proj.state.manual.done === 0, 'vuelta nueva sin resúmenes');
  check(proj.state.points.every((p) => p.label === -1), 'todo vuelve a estar sin pintar');
  check(proj.state.lastFail === null || proj.state.lastFail.cause === 'lost', 'lastFail anterior');
  proj.socket.emit('spin');
  await waitFor(proj, (s) => s.spin, 'gira la ruleta');
  const spin = proj.state.spin;
  check(!spin.candidates.includes(idOf(A)), 'el driver no entra en la ruleta');
  check(!spin.candidates.includes(dId), 'una compu sin partes no entra en la ruleta');
  await waitFor(C, (s) => s.spin, 'los candidatos ven la ruleta');
  check(A.state.spin === null, 'el driver no ve la ruleta');
  proj.socket.emit('kill', { id: idOf(C) });
  proj.socket.emit('spin');
  await waitFor(proj, (s) => !s.spin && s.lastFail && s.lastFail.cause === 'spin', 'frena la ruleta', 3000);
  const lf = proj.state.lastFail;
  check(lf.n === spin.n && lf.victimId === spin.victim, 'la víctima es la que eligió la ruleta');
  check(proj.state.phones.filter((p) => p.status === 'off').length === 1, 'se cayó una sola (el kill durante la ruleta se ignora)');
  // Dani came back free (no parts): as the least loaded worker she inherits.
  const byName = { Bruno: B, Caro: C, Eze: E, Dani: D2 };
  const victim = byName[lf.victim];
  const heir = byName[lf.heir];
  await waitFor(victim, (s) => s.me.off && s.lastFail.me === 'victim', 'la víctima se entera');
  await waitFor(heir, (s) => s.lastFail && s.lastFail.me === 'heir' && s.parts.some((p) => p.from === lf.victim), 'el heredero recibe la parte');
  checkPhoneShape(heir.state, 'fail heredero');
  checkProjectorShape(proj.state, 'fail');
  check(proj.state.points.some((p) => p.moved), 'los puntos movidos se marcan');
  check(lf.heir === 'Dani', `hereda la compu libre (heredó ${lf.heir})`);
  for (const c of [B, C, E, D2]) {
    if (c === victim) continue;
    for (const part of c.state.parts) c.socket.emit('part:submit', { part: part.id });
  }
  victim.socket.emit('part:submit', { part: 0 });
  await waitFor(proj, (s) => s.manual && s.manual.done === s.manual.total, 'llegan todas las partes con una compu menos');
  proj.socket.emit('join');
  await waitFor(proj, (s) => s.phase === 'fail' && !s.manual && s.join, 'el proyector junta en fail');
  const j2 = proj.state.join;
  check(j2.parts === 4 && j2.filled === 0 && j2.workers === 3 && j2.rescued >= 1, `se juntaron 4 partes con 3 compus: ${JSON.stringify(j2)}`);
  check(proj.state.points.every((p) => p.label >= 0), 'no quedó ningún punto sin pintar');
  proj.socket.emit('spin');
  await sleep(200);
  check(!proj.state.spin, 'sin vuelta a mano no hay ruleta');

  step('fail: prender todas y llegada tardía');
  proj.socket.emit('revive');
  await waitFor(proj, (s) => !s.phones.some((p) => p.status === 'off') && s.lastFail === null, 'se prenden todas');
  check(proj.state.points.every((p) => !p.moved), 'cada parte vuelve a su dueño');
  const F = phone(url, 'Fede');
  await waitFor(F, (s) => s.phase === 'fail' && s.me.role === 'worker' && s.parts.length === 1
    && s.parts[0].points.every((p) => p.label >= 0), 'Fede entra tarde, queda anotado y recibe una parte ya pintada');

  step('end');
  proj.socket.emit('phase', { phase: 'end' });
  await waitAll([proj, A, B, C, E, F], (s) => s.phase === 'end', 'fase end');
  check(A.state.me.medals.includes('driver') && A.state.me.medals.includes('top'), `medallas del driver: ${A.state.me.medals}`);
  check(B.state.me.medals.includes('heir') && B.state.me.medals.includes('worker'), `medallas de Bruno: ${B.state.me.medals}`);
  check(D2.state.me.medals.includes('heir'), `Dani también heredó: ${D2.state.me.medals}`);
  check(victim.state.me.medals.includes('fallen'), 'la víctima tiene "fallen"');
  check(D2.state.me.medals.includes('fallen'), 'Dani (desconectada) tiene "fallen"');
  const survivors = [B, C, E].filter((c) => c !== victim);
  check(survivors.every((c) => c.state.me.medals.includes('survivor')), 'los que zafaron de la ruleta tienen "survivor"');
  checkPhoneShape(A.state, 'end');
  checkProjectorShape(proj.state, 'end');

  step('reset y token repetido');
  F.socket.close();
  await sleep(200);
  proj.socket.emit('reset');
  await waitFor(proj, (s) => s.phase === 'lobby' && s.phones.length === 5, 'reset: lobby sin los desconectados');
  await waitFor(A, (s) => s.phase === 'lobby' && s.me.role === 'none' && s.me.medals.join() === 'cluster', 'reset limpia roles y medallas');
  check(proj.state.driver === null && proj.state.points.length === 0 && proj.state.solo === null, 'reset borra driver, datos y solo');
  const A2 = connect(url, { role: 'worker', token: 'tok-Ana', name: 'Ana' });
  await waitFor(A2, (s) => s.me.id === idOf(A), 'el mismo token recupera su lugar');
  check(!A.socket.connected || A.socket.disconnected, 'la conexión vieja se corta');
}

// A rehearsal with a single phone: the projector plays the driver.
async function lonePhone(port) {
  const url = `http://localhost:${port}`;
  const proj = connect(url, { role: 'projector', key: KEY });
  const P = phone(url, 'Sola');
  await waitFor(proj, (s) => s.phones.length === 1, 'un celular');
  proj.socket.emit('phase', { phase: 'solo' });
  await waitFor(P, (s) => s.phase === 'solo' && s.solo, 'solo');
  P.socket.emit('solo:progress', { done: 3 });
  proj.socket.emit('phase', { phase: 'manager' });
  await waitFor(proj, (s) => s.phase === 'manager', 'manager');
  check(proj.state.driver === null, 'con un solo celular el driver es el proyector');
  await waitFor(proj, (s) => s.stats.registered === 1, 'el cluster manager la anota sola');
  proj.socket.emit('phase', { phase: 'work' });
  await waitFor(P, (s) => s.phase === 'work' && s.parts.length === 1, 'recibe su parte');
  proj.socket.emit('phase', { phase: 'combine' });
  await sleep(200);
  check(proj.state.phase === 'work', 'sin resúmenes no se puede juntar');
  P.socket.emit('part:submit', { part: P.state.parts[0].id });
  await waitFor(proj, (s) => s.manual && s.manual.done === 1, 'llega el resumen');
  proj.socket.emit('phase', { phase: 'combine' });
  await waitFor(proj, (s) => s.phase === 'combine' && s.round === 1, 'el proyector junta');
  proj.socket.emit('phase', { phase: 'fail' });
  await waitFor(proj, (s) => s.phase === 'fail', 'fail');
  proj.socket.emit('spin');
  await sleep(200);
  check(!proj.state.spin, 'con un solo worker no hay ruleta');
  proj.socket.emit('phase', { phase: 'end' });
  await waitFor(proj, (s) => s.phase === 'end' && s.points.every((p) => p.label >= 0), 'end completa lo que faltaba');
}

// ---------------------------------------------------------------- main

async function withServer(label, fn) {
  const port = await freePort();
  const server = await startServer(port);
  server.removeAllListeners('exit');
  let crashed = false;
  server.on('exit', (code) => { if (code) { crashed = true; failures.push(`el servidor se cayó (código ${code})`); } });
  try {
    await fn(port);
  } catch (err) {
    failures.push(`${label}: ${err.message}`);
  }
  check(!crashed, `${label}: el servidor no se cayó`);
  clients.forEach((c) => c.socket.close());
  clients.length = 0;
  server.kill();
}

async function main() {
  console.log('Generador de puntos y convergencia');
  step('puntos: 2 por grupo, margen >= 8, ordenados; soloPoints');
  pointsGenerator();
  step('convergencia');
  convergence();

  console.log('Actividad completa');
  await withServer('actividad', activity);

  console.log('Ensayo con un solo celular');
  await withServer('un celular', lonePhone);
}

main().catch((err) => { failures.push(err.stack || err.message); }).then(() => {
  if (failures.length) {
    console.log(`\n${failures.length} falla(s):`);
    failures.forEach((f) => console.log(` - ${f}`));
    process.exit(1);
  }
  console.log('\nTodo bien.');
  process.exit(0);
});
