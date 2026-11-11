'use strict';

// End-to-end test: boots the server on a free port, plays a whole class with
// one driver and a handful of phones, and checks the contract in
// presentacion-web/ACTIVIDAD.md. Exit code 0 = all good, 1 = something failed.
//   npm test

const net = require('net');
const path = require('path');
const { spawn } = require('child_process');
const { io } = require('socket.io-client');
const km = require('../lib/kmeans');
const { compareRace } = require('../server');

const KEY = 'smoke-key';
const SPIN_MS = 700; // short roulette so the test does not wait 4.5 s
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
      env: { ...process.env, PORT: String(port), DRIVER_KEY: KEY, PUBLIC_URL: `http://localhost:${port}`, SPIN_MS: String(SPIN_MS) },
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
  const c = { socket, state: null, inherits: [], tasks: [], errors: [], respond: false, listeners: [] };
  clients.push(c);
  socket.on('state', (s) => { c.state = s; c.listeners.forEach((fn) => fn()); });
  socket.on('inherit', (d) => c.inherits.push(d));
  socket.on('auth:error', (m) => c.errors.push(['auth:error', m]));
  socket.on('join:error', (m) => c.errors.push(['join:error', m]));
  socket.on('task', (t) => {
    c.tasks.push(t);
    if (!c.respond) return;
    // A phone that is "off" stays silent; the others compute for real.
    setTimeout(() => {
      if (!c.state || c.state.me.off) return;
      socket.emit('task:result', { round: t.round, sums: km.partialSums(c.state.points, t.centers) });
    }, 450);
  });
  return c;
}

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

// ---------------------------------------------------------------- contract shapes

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isPoint = (p) => p && isNum(p.x) && isNum(p.y);
const PHASES = ['lobby', 'paint', 'combine', 'auto', 'fail', 'end'];
const MEDALS = ['fastest', 'podium', 'perfect', 'heir', 'survivor', 'fallen', 'cluster'];
const STATUSES = ['waiting', 'painting', 'sent', 'idle', 'working', 'off', 'offline'];

function checkDriverShape(s, where) {
  const ok = (cond, what) => check(cond, `[${where}] state del proyector: ${what}`);
  ok(PHASES.includes(s.phase), 'phase');
  ok(typeof s.publicUrl === 'string', 'publicUrl');
  ok(Array.isArray(s.phones) && s.phones.every((p) => isNum(p.id) && typeof p.name === 'string'
    && STATUSES.includes(p.status) && isNum(p.points) && isNum(p.inherited)), 'phones[{id,name,status,points,inherited}]');
  ok(Array.isArray(s.points) && s.points.every((p) => isPoint(p) && isNum(p.owner) && isNum(p.home)
    && Number.isInteger(p.label) && p.label >= -1 && p.label < 3), 'points[{x,y,owner,home,label}]');
  ok(Array.isArray(s.centers) && s.centers.length === 3 && s.centers.every(isPoint), 'centers');
  ok(Array.isArray(s.trail) && s.trail.length >= 1 && s.trail.every((t) => Array.isArray(t) && t.length === 3 && t.every(isPoint)), 'trail');
  ok(Number.isInteger(s.round), 'round');
  ok(Array.isArray(s.shifts) && s.shifts.every(isNum), 'shifts');
  ok(s.progress && isNum(s.progress.done) && isNum(s.progress.total), 'progress{done,total}');
  ok(typeof s.busy === 'boolean' && typeof s.running === 'boolean' && typeof s.converged === 'boolean', 'busy/running/converged');
  ok(s.lastFail === null || (isNum(s.lastFail.n) && typeof s.lastFail.victim === 'string' && isNum(s.lastFail.victimId)
    && typeof s.lastFail.heir === 'string' && isNum(s.lastFail.heirId) && isNum(s.lastFail.points)), 'lastFail{n,victim,victimId,heir,heirId,points}');
  const r = s.race;
  ok(r && Array.isArray(r.podium) && r.podium.length <= 3 && r.podium.every((e) => isNum(e.id) && typeof e.name === 'string'
    && isNum(e.ms) && Number.isInteger(e.mistakes) && e.score === e.ms + r.penaltyMs * e.mistakes)
    && isNum(r.finished) && r.penaltyMs === 3000, 'race{podium,finished,penaltyMs}');
  ok(r && (r.parallelMs === null || isNum(r.parallelMs)) && (r.soloMs === null || isNum(r.soloMs))
    && (r.slowest === null || (typeof r.slowest.name === 'string' && isNum(r.slowest.ms))), 'race{parallelMs,soloMs,slowest}');
  ok(s.spin === null || (isNum(s.spin.n) && Array.isArray(s.spin.candidates) && s.spin.candidates.includes(s.spin.victim) && isNum(s.spin.ms)), 'spin');
  ok(s.stats && isNum(s.stats.phones) && isNum(s.stats.points) && isNum(s.stats.summaries), 'stats{phones,points,summaries}');
  ok(s.trail.length === s.round + 1 && s.shifts.length === s.round, 'trail y shifts coherentes con round');
  ok(same(s.trail[s.trail.length - 1][0].x, s.centers[0].x), 'la última posición de trail es centers');
  ok(s.stats.phones === s.phones.length && s.stats.points === s.points.length, 'stats coherente');
}

function checkPhoneShape(s, where) {
  const ok = (cond, what) => check(cond, `[${where}] state del celular: ${what}`);
  ok(PHASES.includes(s.phase), 'phase');
  const m = s.me;
  ok(m && isNum(m.id) && typeof m.name === 'string' && typeof m.off === 'boolean' && typeof m.sent === 'boolean'
    && typeof m.working === 'boolean' && isNum(m.rounds) && Array.isArray(m.inheritedFrom), 'me{id,name,off,sent,working,rounds,inheritedFrom}');
  ok(Array.isArray(s.centers) && s.centers.length === 3 && s.centers.every(isPoint), 'centers');
  ok(Array.isArray(s.points) && s.points.every((p) => isPoint(p) && Number.isInteger(p.label) && p.label >= -1 && p.label < 3), 'points[{x,y,label}]');
  ok(Number.isInteger(s.own) && s.own <= s.points.length, 'own');
  ok(typeof s.paintKey === 'string' && /^\d+:\d+$/.test(s.paintKey), 'paintKey');
  ok(Number.isInteger(s.round) && typeof s.converged === 'boolean', 'round/converged');
  ok(s.totals && isNum(s.totals.phones) && isNum(s.totals.points), 'totals{phones,points}');
  ok(m.paint === null || (isNum(m.paint.ms) && Number.isInteger(m.paint.mistakes) && isNum(m.paint.score)
    && Number.isInteger(m.paint.rank) && Number.isInteger(m.paint.of)), 'me.paint');
  ok(Array.isArray(m.medals) && m.medals.length >= 1 && m.medals.every((x) => MEDALS.includes(x)), 'me.medals');
  ok(s.race && (s.race.parallelMs === null || isNum(s.race.parallelMs)) && (s.race.soloMs === null || isNum(s.race.soloMs)), 'race{parallelMs,soloMs}');
  ok(s.spin === null || (isNum(s.spin.n) && isNum(s.spin.ms)), 'spin{n,ms}');
  ok(s.lastFail === null || (isNum(s.lastFail.n) && typeof s.lastFail.victim === 'string' && typeof s.lastFail.heir === 'string'
    && isNum(s.lastFail.points) && ['victim', 'heir', 'safe'].includes(s.lastFail.me)), 'lastFail{n,victim,heir,points,me}');
}

// ---------------------------------------------------------------- convergence (6.5)

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
}

// ---------------------------------------------------------------- the class

async function activity(port) {
  const url = `http://localhost:${port}`;

  step('autenticación');
  const bad = connect(url, { role: 'driver', key: 'mala' });
  await sleep(400);
  check(bad.errors.some((e) => e[0] === 'auth:error'), 'clave incorrecta debe emitir auth:error');
  check(!bad.socket.connected, 'clave incorrecta debe desconectar');
  const anon = connect(url, { role: 'worker' });
  await sleep(300);
  check(!anon.socket.connected, 'celular sin token debe desconectarse');

  step('unirse (lobby)');
  const driver = connect(url, { role: 'driver', key: KEY });
  await waitFor(driver, (s) => s.phase === 'lobby', 'estado inicial del proyector');
  const names = ['Ana', 'Bruno', 'Caro', 'Dani', 'Eze'];
  const phones = names.map((name, i) => connect(url, { role: 'worker', token: `t${i}`, name }));
  await waitFor(driver, (s) => s.phones.length === 5 && s.phones.every((p) => p.status === 'waiting'), '5 celulares en el lobby');
  checkDriverShape(driver.state, 'lobby');
  for (const p of phones) {
    await waitFor(p, (s) => s.me && s.phase === 'lobby', 'estado del celular en lobby');
    checkPhoneShape(p.state, 'lobby');
    check(p.state.points.length === 0, 'en lobby el celular no tiene puntos');
  }
  check(driver.state.phones.map((p) => p.name).join() === names.join(), 'nombres de los celulares');
  const ids = driver.state.phones.map((p) => p.id);
  const idOf = (i) => phones[i].state.me.id;
  check(new Set(ids).size === 5, 'ids únicos');
  check(driver.state.centers.every((c, i) => c.x === km.START[i].x && c.y === km.START[i].y), 'centros iniciales en lobby');

  step('basura no rompe nada');
  const junk = [null, undefined, 42, 'x', [], {}, { phase: 7 }, { phase: 'nope' }, { on: 'si' }, { id: 'x' }, { id: -1 }, { id: 1.5 }, { round: 'a', sums: 3 }];
  for (const j of junk) {
    for (const ev of ['phase', 'round', 'run', 'kill', 'revive', 'noexiste']) driver.socket.emit(ev, j);
    for (const p of phones) { p.socket.emit('paint:submit', j); p.socket.emit('task:result', j); }
  }
  driver.socket.emit('phase', { phase: 'combine' }); // not allowed from the lobby
  driver.socket.emit('phase', { phase: 'auto' });
  driver.socket.emit('phase', { phase: 'lobby' });
  await sleep(300);
  check(driver.state.phase === 'lobby', 'desde lobby solo se puede ir a paint');
  check(driver.socket.connected && phones.every((p) => p.socket.connected), 'el servidor sigue vivo tras recibir basura');

  step('paint: cada celular recibe 6 puntos');
  driver.socket.emit('phase', { phase: 'paint' });
  await waitFor(driver, (s) => s.phase === 'paint' && s.points.length === 30, 'fase paint con 30 puntos');
  for (const p of phones) {
    const s = await waitFor(p, (st) => st.phase === 'paint' && st.points.length === 6, 'celular con 6 puntos');
    checkPhoneShape(s, 'paint');
    check(s.own === 6, 'own = 6');
    check(s.points.every((pt) => pt.label === -1), 'puntos sin pintar en paint');
    const margins = s.points.map((pt) => km.margin(pt, km.START));
    check(margins.every((m) => m >= 8), 'margen >= 8');
    check(margins.every((m, i) => i === 0 || margins[i - 1] >= m), 'puntos ordenados de mayor a menor margen');
    check(s.me.sent === false && s.totals.phones === 5 && s.totals.points === 30, 'me.sent / totals en paint');
  }
  checkDriverShape(driver.state, 'paint');
  check(driver.state.progress.done === 0 && driver.state.progress.total === 5, 'progress inicial en paint 0/5');
  check(driver.state.points.every((pt) => pt.label === -1 && pt.owner === pt.home), 'puntos grises y con su dueño');
  check(driver.state.phones.every((p) => p.status === 'painting' && p.points === 6 && p.inherited === 0), 'estado painting');
  driver.socket.emit('phase', { phase: 'paint' });
  driver.socket.emit('phase', { phase: 'lobby' });
  await sleep(150);
  check(driver.state.phase === 'paint', 'no se vuelve a lobby sin reset');

  step('paint: envían 3 de 5');
  for (const i of [0, 1, 2]) phones[i].socket.emit('paint:submit');
  phones[0].socket.emit('paint:submit'); // a duplicate must not count twice
  await waitFor(driver, (s) => s.progress.done === 3, 'progress 3/5');
  check(driver.state.progress.total === 5, 'progress total 5');
  check(driver.state.stats.summaries === 3, 'summaries = 3 tras 3 envíos (y un duplicado)');
  check(driver.state.phones.filter((p) => p.status === 'sent').length === 3, '3 celulares en sent');
  const labeled = driver.state.points.filter((pt) => pt.label >= 0);
  check(labeled.length === 18 && labeled.every((pt) => pt.label === km.nearest(pt, km.START)), 'solo los puntos de quienes enviaron quedan pintados, con el centro más cercano');
  await waitFor(phones[0], (s) => s.me.sent, 'me.sent del celular que envió');

  step('combine');
  driver.socket.emit('phase', { phase: 'combine' });
  const comb = await waitFor(driver, (s) => s.phase === 'combine' && s.round === 1, 'combine con round 1');
  checkDriverShape(comb, 'combine');
  check(comb.points.every((pt) => pt.label === km.nearest(pt, km.START)), 'combine: todos los puntos etiquetados');
  const expected = km.step(comb.points, km.START).centers;
  check(comb.centers.every((c, i) => same(c.x, expected[i].x) && same(c.y, expected[i].y)), 'combine: centros = promedio de cada grupo');
  check(comb.centers.some((c, i) => km.dist(c, km.START[i]) > 1), 'combine: los centros se movieron');
  check(comb.trail.length === 2 && comb.shifts.length === 1 && comb.shifts[0] > 0, 'combine: trail y shifts');
  check(comb.stats.summaries === 3, 'combine: summaries sigue en 3 (el resto lo completa el servidor)');
  const lazy = await waitFor(phones[4], (s) => s.phase === 'combine' && s.round === 1, 'celular que no envió ve combine');
  check(lazy.me.sent === false, 'el celular que no envió ve me.sent = false');

  step('auto: dos vueltas a mano y después "seguir solo"');
  phones.forEach((p) => { p.respond = true; });
  driver.socket.emit('phase', { phase: 'auto' });
  await waitFor(driver, (s) => s.phase === 'auto', 'fase auto');
  driver.socket.emit('kill', { id: idOf(1) }); // only valid in `fail`
  await sleep(150);
  check(driver.state.phones.every((p) => p.status !== 'off'), 'kill fuera de la fase fail se ignora');
  driver.socket.emit('round');
  const busy = await waitFor(driver, (s) => s.busy, 'vuelta en curso');
  check(busy.progress.total === 5, 'progress.total = 5 durante la vuelta');
  await waitFor(phones[0], (s) => s.me.working, 'celular working durante la vuelta');
  check(driver.state.phones.some((p) => p.status === 'working'), 'status working en el proyector');
  driver.socket.emit('round'); // refused: one is already running
  const r2 = await waitFor(driver, (s) => s.round === 2 && !s.busy, 'vuelta 2 terminada');
  check(r2.progress.done === 5 && r2.progress.total === 5, 'progress 5/5 al terminar la vuelta');
  check(r2.stats.summaries === 3 + 5, 'summaries suma las respuestas');
  check(r2.shifts.length === 2 && r2.trail.length === 3, 'shifts/trail tras la vuelta 2');
  check(phones.every((p) => p.tasks.length === 1 && p.tasks[0].round === 2 && p.tasks[0].centers.length === 3), 'cada celular recibió task {round: 2, centers}');
  for (const p of phones) await waitFor(p, (s) => s.me.rounds === 1 && s.round === 2, 'me.rounds cuenta las respuestas');
  // K-Means converges fast on this data: the second hand-launched round and
  // "seguir solo" only make sense if the first round did not already converge.
  if (!r2.converged) {
    driver.socket.emit('round');
    await waitFor(driver, (s) => s.round === 3 && !s.busy, 'vuelta 3 terminada');
  }
  if (!driver.state.converged) {
    driver.socket.emit('run', { on: true });
    await waitFor(driver, (s) => s.running || s.converged, 'running activo');
  }
  const done = await waitFor(driver, (s) => s.converged && !s.busy, 'convergencia', 20000);
  check(done.running === false, 'al converger se apaga "seguir solo"');
  check(done.shifts[done.shifts.length - 1] < 0.5 || done.round >= 15, 'converge por shift < 0.5 o MAX_ROUNDS');
  check(done.shifts.length === done.round && done.trail.length === done.round + 1, 'shifts/trail coherentes tras converger');
  check(done.round <= 8, `convergió en ${done.round} vueltas (máx 8)`);
  checkDriverShape(done, 'auto');
  await waitFor(phones[2], (s) => s.converged, 'celular ve converged');
  const roundsDone = done.round;
  driver.socket.emit('round');
  driver.socket.emit('run', { on: true });
  await sleep(500);
  check(driver.state.round === roundsDone && !driver.state.busy && !driver.state.running, 'no se lanzan vueltas después de converger en auto');
  const round3Centers = driver.state.centers;
  const finalCenters = km.step(driver.state.points, round3Centers).centers;
  check(finalCenters.every((c, i) => km.dist(c, round3Centers[i]) < 0.5), 'los centros finales son un punto fijo de K-Means');

  step('fail: apagar una compu');
  driver.socket.emit('phase', { phase: 'fail' });
  await waitFor(driver, (s) => s.phase === 'fail', 'fase fail');
  const victim = 1;
  const expectedHeir = [0, 2, 3, 4][0];
  driver.socket.emit('kill', { id: idOf(victim) });
  const killed = await waitFor(driver, (s) => s.lastFail, 'lastFail');
  checkDriverShape(killed, 'fail');
  check(killed.lastFail.victim === names[victim] && killed.lastFail.heir === names[expectedHeir] && killed.lastFail.points === 6,
    `lastFail = {victim: ${names[victim]}, heir: ${names[expectedHeir]}, points: 6}, vino ${JSON.stringify(killed.lastFail)}`);
  const vp = killed.phones.find((p) => p.id === idOf(victim));
  const hp = killed.phones.find((p) => p.id === idOf(expectedHeir));
  check(vp.status === 'off' && vp.points === 0, 'la víctima queda off y sin puntos');
  check(hp.points === 12 && hp.inherited === 6, 'el heredero tiene 12 puntos, 6 heredados');
  check(killed.points.length === 30, 'no se pierde ningún punto');
  check(killed.points.filter((pt) => pt.home === idOf(victim)).every((pt) => pt.owner === idOf(expectedHeir)), 'los puntos de la víctima pasan al heredero');
  await sleep(150);
  check(phones[expectedHeir].inherits.length === 1, 'el heredero recibe un evento inherit');
  const inh = phones[expectedHeir].inherits[0] || {};
  check(inh.from === names[victim] && inh.count === 6 && inh.total === 12, `inherit = {from, count: 6, total: 12}, vino ${JSON.stringify(inh)}`);
  check(phones[victim].inherits.length === 0, 'la víctima no recibe inherit');
  const hs = await waitFor(phones[expectedHeir], (s) => s.points.length === 12, 'celular heredero con 12 puntos');
  check(hs.own === 6 && hs.me.inheritedFrom.includes(names[victim]), 'heredero: own = 6 y me.inheritedFrom');
  const vs = await waitFor(phones[victim], (s) => s.me.off, 'celular víctima apagado');
  check(vs.points.length === 0 && vs.own === 0, 'la víctima ya no tiene puntos');
  driver.socket.emit('kill', { id: idOf(victim) });
  await sleep(150);
  check(driver.state.points.filter((pt) => pt.owner === idOf(expectedHeir)).length === 12, 'apagar a una apagada no hace nada');

  step('fail: una vuelta más, sin esperar a la víctima');
  const before = driver.state.round;
  driver.socket.emit('round');
  const afterRound = await waitFor(driver, (s) => s.round === before + 1 && !s.busy, 'vuelta con una compu apagada');
  check(afterRound.converged, 'en fail se puede dar otra vuelta aunque ya haya convergido');
  check(afterRound.progress.total === 4 && afterRound.progress.done === 4, 'la vuelta pide a 4 y responden 4');
  check(phones[victim].tasks.every((t) => t.round <= roundsDone), 'la víctima no recibe tareas nuevas');
  check(afterRound.points.length === 30 && afterRound.points.every((pt) => pt.label >= 0), 'la vuelta sigue etiquetando todos los puntos');
  driver.socket.emit('run', { on: true }); // in fail it runs one round and stops (already converged)
  await waitFor(driver, (s) => s.round === before + 2 && !s.busy && !s.running, '"seguir solo" en fail da una vuelta y se detiene');
  driver.socket.emit('kill', {});
  const second = await waitFor(driver, (s) => s.phones.filter((p) => p.status === 'off').length === 2, 'segunda compu apagada al azar');
  check(second.points.length === 30 && second.phones.reduce((a, p) => a + p.points, 0) === 30, 'tras el segundo apagado siguen los 30 puntos');
  check(second.phones.filter((p) => p.status === 'off').every((p) => p.points === 0), 'las apagadas no tienen puntos');

  step('revive');
  driver.socket.emit('revive');
  const rev = await waitFor(driver, (s) => s.lastFail === null && s.phones.every((p) => p.status !== 'off'), 'revive');
  check(rev.points.every((pt) => pt.owner === pt.home), 'cada punto vuelve a su home');
  check(rev.phones.every((p) => p.points === 6 && p.inherited === 0), 'todos vuelven a 6 puntos propios');
  await waitFor(phones[victim], (s) => !s.me.off && s.points.length === 6, 'la víctima vuelve a tener su parte');

  step('entra un celular tarde (fase fail)');
  const late = connect(url, { role: 'worker', token: 'late', name: 'Tarde' });
  const ls = await waitFor(late, (s) => s.me && s.points.length === 6, 'celular tardío con 6 puntos');
  checkPhoneShape(ls, 'late');
  check(ls.own === 6 , 'tardío: own = 6');
  await waitFor(driver, (s) => s.phones.length === 6 && s.points.length === 36, '6 celulares y 36 puntos');
  check(driver.state.stats.phones === 6 && driver.state.stats.points === 36, 'stats con el tardío');
  check(ls.points.every((pt) => pt.label >= 0 && pt.label < 3), 'tardío: llegan pintados');

  step('end');
  driver.socket.emit('run', { on: true });
  driver.socket.emit('phase', { phase: 'end' });
  await waitFor(driver, (s) => s.phase === 'end', 'fase end');
  await sleep(1500);
  check(driver.state.running === false, 'entrar a end detiene "seguir solo"');
  checkDriverShape(driver.state, 'end');
  checkPhoneShape(phones[0].state, 'end');
  check(phones[0].state.phase === 'end', 'el celular ve end');
  driver.socket.emit('phase', { phase: 'combine' });
  await waitFor(driver, (s) => s.phase === 'combine', 'se puede volver de end a combine');
  driver.socket.emit('phase', { phase: 'end' });
  await waitFor(driver, (s) => s.phase === 'end', 'end otra vez');

  step('reset y una segunda clase (llegada tardía durante paint)');
  driver.socket.emit('reset');
  const rst = await waitFor(driver, (s) => s.phase === 'lobby' && s.points.length === 0, 'reset a lobby');
  check(rst.phones.length === 6 && rst.phones.every((p) => p.status === 'waiting'), 'reset conserva los celulares conectados y los prende');
  check(rst.round === 0 && rst.trail.length === 1 && rst.shifts.length === 0 && !rst.converged && rst.lastFail === null && rst.stats.summaries === 0, 'reset borra vueltas y resultados');
  check(rst.centers.every((c, i) => c.x === km.START[i].x && c.y === km.START[i].y), 'reset devuelve los centros iniciales');
  const keyBefore = phones[0].state.paintKey;
  driver.socket.emit('phase', { phase: 'paint' });
  await waitFor(driver, (s) => s.phase === 'paint' && s.points.length === 36, 'segunda ronda de paint');
  await waitFor(phones[0], (s) => s.phase === 'paint' && s.points.length === 6, 'celular con puntos nuevos');
  check(phones[0].state.paintKey !== keyBefore, 'paintKey cambia cuando cambian los datos');
  const late2 = connect(url, { role: 'worker', token: 'late2', name: 'Tarde 2' });
  const l2 = await waitFor(late2, (s) => s.me && s.points.length === 6, 'tardío en paint');
  check(l2.points.every((pt) => pt.label === -1), 'tardío en paint: puntos sin pintar');
  const l2margins = l2.points.map((pt) => km.margin(pt, km.START));
  check(l2margins.every((m, i) => m >= 8 && (i === 0 || l2margins[i - 1] >= m)), 'tardío: margen >= 8 y ordenados');
  await waitFor(driver, (s) => s.progress.total === 7, 'progress suma al tardío');
  // A phone that drops mid-class goes offline but keeps its points.
  phones[4].socket.disconnect();
  await waitFor(driver, (s) => s.phones.find((p) => p.name === 'Eze').status === 'offline', 'celular desconectado queda offline');
  check(driver.state.points.filter((pt) => pt.owner === idOf(4)).length === 6, 'el desconectado conserva sus puntos');
  driver.socket.emit('reset');
  await waitFor(driver, (s) => s.phase === 'lobby', 'reset final');
  check(driver.state.phones.length === 6 && !driver.state.phones.some((p) => p.name === 'Eze'), 'reset descarta a los desconectados');

  step('celular con token repetido recupera su lugar');
  const again = connect(url, { role: 'worker', token: 't0', name: 'Ana' });
  await waitFor(again, (s) => s.me && s.me.id === idOf(0), 'misma id al reconectar');
  check(driver.state.phones.filter((p) => p.name === 'Ana').length === 1, 'sin duplicados al reconectar');
}

// ---------------------------------------------------------------- the game layer (section 9)

function tieBreak() {
  const e = (id, ms, mistakes) => ({ id, ms, mistakes, score: ms + 3000 * mistakes });
  const order = (list) => [...list].sort(compareRace).map((x) => x.id).join();
  check(order([e(1, 20000, 0), e(2, 11000, 3), e(3, 12000, 1)]) === '3,2,1', 'ranking: gana el menor puntaje (ms + 3 s por error), con desempate por ms');
  check(order([e(1, 13000, 0), e(2, 10000, 1)]) === '2,1', 'desempate: mismo puntaje, gana el menor ms');
  check(order([e(5, 10000, 1), e(2, 10000, 1), e(9, 10000, 1)]) === '2,5,9', 'desempate: mismo puntaje y ms, gana el menor id');
}

const medalsOf = (c) => c.state.me.medals.join();

async function game(port) {
  const url = `http://localhost:${port}`;
  const names = ['Ana', 'Bruno', 'Caro', 'Dani', 'Eze'];

  step('juego: carrera al pintar');
  const driver = connect(url, { role: 'driver', key: KEY });
  const phones = names.map((name, i) => connect(url, { role: 'worker', token: `g${i}`, name }));
  await waitFor(driver, (s) => s.phones.length === 5, '5 celulares');
  for (const p of phones) await waitFor(p, (st) => st.me, 'estado del celular');
  const ids = phones.map((p) => p.state.me.id);
  const rst0 = driver.state;
  check(rst0.race.finished === 0 && rst0.race.podium.length === 0 && rst0.race.parallelMs === null
    && rst0.race.soloMs === null && rst0.race.slowest === null && rst0.race.penaltyMs === 3000, 'race vacío antes de que alguien envíe');
  check(rst0.spin === null && rst0.lastFail === null, 'sin ruleta ni apagado al principio');
  driver.socket.emit('phase', { phase: 'paint' });
  await waitFor(driver, (s) => s.phase === 'paint' && s.points.length === 30, 'paint con 30 puntos');
  await waitFor(phones[4], (s) => s.phase === 'paint' && s.points.length === 6 && s.me.paint === null, 'celular sin resultado de carrera todavía');
  check(phones.every((p) => p.state.me.paint === null && p.state.race.parallelMs === null && p.state.race.soloMs === null), 'me.paint = null y race nulo antes de enviar');
  const t0 = Date.now();

  // Submission order and mistakes: (index, wait, payload, expected mistakes).
  // Ana is first and clean, Dani is last-but-one and clean, Bruno is earlier than Dani but has a mistake.
  const plan = [
    [0, 500, { mistakes: 0 }, 0],
    [2, 1000, { mistakes: 2.5 }, 0], // not an integer
    [1, 1500, { mistakes: 1 }, 1],
    [3, 2000, { mistakes: -1 }, 0], // negative
    [4, 2500, { mistakes: 501 }, 0], // over the limit
  ];
  let sent = 0;
  for (const [i, at, payload] of plan) {
    await sleep(Math.max(0, at - (Date.now() - t0)));
    phones[i].socket.emit('paint:submit', payload);
    sent += 1;
    await waitFor(driver, (s) => s.race.finished === sent, `race.finished = ${sent}`);
    if (sent === 1) {
      const r = driver.state.race;
      const mine = await waitFor(phones[0], (s) => s.me.paint, 'me.paint del primero');
      check(r.podium.length === 1 && r.podium[0].id === ids[0] && r.podium[0].mistakes === 0, 'el podio tiene al primero que envió');
      check(r.parallelMs === mine.me.paint.ms && r.slowest.name === 'Ana' && r.slowest.ms === r.parallelMs, 'con uno solo, parallelMs = su ms y slowest es él');
      check(r.soloMs === Math.round(mine.me.paint.ms / 6 * 30), 'soloMs de uno solo = su ms por 5 (30 puntos / 6)');
      check(mine.me.paint.rank === 1 && mine.me.paint.of === 1, 'me.paint.rank 1 de 1');
      check(mine.me.paint.ms >= 400 && mine.me.paint.ms < 1500, `ms medido por el servidor (${mine.me.paint.ms})`);
    }
  }
  const dup = driver.state.race.finished;
  phones[0].socket.emit('paint:submit', { mistakes: 3 }); // already sent: must not count again
  await sleep(200);
  check(driver.state.race.finished === dup && phones[0].state.me.paint.mistakes === 0, 'un segundo envío no cambia el resultado');

  const race = driver.state.race;
  const paints = await Promise.all(phones.map(async (p) => (await waitFor(p, (s) => s.me.paint && s.me.paint.of === 5, 'me.paint con of = 5')).me.paint));
  const expectOrder = [0, 2, 3, 4, 1]; // by score: Bruno's mistake (+3 s) sends him behind Eze, who sent a second later
  check(paints.every((x, i) => x.mistakes === plan.find((q) => q[0] === i)[3]), 'mistakes inválidos cuentan 0 y los válidos se respetan');
  check(paints.every((x) => x.score === x.ms + 3000 * x.mistakes), 'score = ms + 3000 x errores');
  check(expectOrder.every((i, pos) => paints[i].rank === pos + 1 && paints[i].of === 5), `ranking en me.paint: ${paints.map((x) => x.rank)}`);
  check(race.finished === 5 && race.podium.map((e) => e.id).join() === [0, 2, 3].map((i) => ids[i]).join(), 'el podio son los 3 mejores puntajes');
  check(race.podium.every((e, i) => i === 0 || race.podium[i - 1].score <= e.score), 'el podio está ordenado por puntaje');
  check(race.podium.every((e) => e.mistakes === 0), 'el podio informa los errores');
  const msAll = paints.map((x) => x.ms);
  check(race.parallelMs === Math.max(...msAll) && race.slowest.ms === race.parallelMs && race.slowest.name === 'Eze', 'parallelMs = el ms del último; slowest = Eze');
  check(Math.abs(race.soloMs - msAll.reduce((a, b) => a + b, 0)) <= 1, 'soloMs = suma de ms (todos enviaron, 6 puntos cada uno)');
  check(race.soloMs > race.parallelMs, 'una sola persona tarda más que el grupo');
  check(race.parallelMs > 2300 && race.parallelMs < 4500, `parallelMs esperable (${race.parallelMs})`);
  check(phones.every((p) => p.state.race.parallelMs === race.parallelMs && p.state.race.soloMs === race.soloMs), 'el celular ve parallelMs y soloMs');
  checkDriverShape(driver.state, 'carrera');
  phones.forEach((p) => checkPhoneShape(p.state, 'carrera'));

  step('juego: ruleta (precondiciones)');
  driver.socket.emit('spin'); // not in fail
  await sleep(200);
  check(driver.state.spin === null, 'spin fuera de la fase fail se ignora');
  driver.socket.emit('phase', { phase: 'fail' });
  await waitFor(driver, (s) => s.phase === 'fail' && s.round === 1, 'fase fail');
  phones.forEach((p) => { p.tasks.length = 0; });
  driver.socket.emit('round');
  await waitFor(driver, (s) => s.busy, 'vuelta en curso');
  driver.socket.emit('spin');
  await sleep(200);
  check(driver.state.spin === null, 'spin con una vuelta en curso se ignora');
  await waitFor(driver, (s) => !s.busy, 'fin de la vuelta', 4000);

  // Tapping a token still switches it off directly (no roulette) and counts as `fallen`.
  // Everyone has 6 points, so the tie goes to the lowest id (ids follow connection order, not name order).
  const clickHeirId = Math.min(...[0, 1, 2, 3].map((i) => ids[i]));
  driver.socket.emit('kill', { id: ids[4] });
  const click = await waitFor(driver, (s) => s.lastFail, 'apagado por toque');
  check(click.lastFail.victimId === ids[4] && click.lastFail.heirId === clickHeirId && click.lastFail.heir === names[ids.indexOf(clickHeirId)]
    && click.lastFail.victim === 'Eze' && click.spin === null, 'apagado directo: victimId/heirId, sin ruleta');
  const clickN = click.lastFail.n;
  check(Number.isInteger(clickN), 'lastFail.n es un entero');

  step('juego: ruleta de punta a punta');
  const loadBefore = new Map(driver.state.phones.map((p) => [p.id, p.points]));
  const t1 = Date.now();
  driver.socket.emit('spin');
  const sp = await waitFor(driver, (s) => s.spin, 'spin visible para el proyector');
  const spinN = sp.spin.n;
  const candidates = [0, 1, 2, 3].map((i) => ids[i]).sort((a, b) => a - b);
  check(sp.spin.candidates.join() === candidates.join(), `candidatos = prendidas y conectadas (${sp.spin.candidates})`);
  check(candidates.includes(sp.spin.victim) && sp.spin.ms === SPIN_MS && spinN > clickN, 'spin: víctima entre los candidatos, ms = SPIN_MS, n nuevo');
  check(sp.lastFail.n === clickN, 'mientras gira, lastFail sigue siendo el anterior');
  for (const i of [0, 1, 2, 3]) {
    const s = await waitFor(phones[i], (st) => st.spin, `spin visible para el candidato ${names[i]}`);
    check(s.spin.n === spinN && s.spin.ms === SPIN_MS, 'spin del celular = {n, ms}');
  }
  await sleep(100);
  check(phones[4].state.spin === null, 'la compu apagada no es candidata: no ve el spin');
  // Everything below must be ignored while the roulette turns.
  phones.forEach((p) => { p.tasks.length = 0; });
  driver.socket.emit('kill', { id: ids[1] });
  driver.socket.emit('kill', {});
  driver.socket.emit('round');
  driver.socket.emit('spin');
  driver.socket.emit('revive');
  driver.socket.emit('run', { on: true });
  await sleep(250);
  check(driver.state.spin && driver.state.spin.n === spinN && driver.state.spin.victim === sp.spin.victim, 'otro spin no cambia la ruleta en curso');
  check(driver.state.phones.filter((p) => p.status === 'off').length === 1 && driver.state.lastFail.n === clickN, 'kill y revive se ignoran mientras gira');
  check(!driver.state.busy && !driver.state.running && phones.every((p) => p.tasks.length === 0), 'round y run { on: true } se ignoran mientras gira');
  const done = await waitFor(driver, (s) => s.spin === null && s.lastFail && s.lastFail.n === spinN, 'fin de la ruleta', 4000);
  check(Date.now() - t1 >= SPIN_MS - 50, 'la ruleta dura SPIN_MS');
  const lf = done.lastFail;
  check(lf.victimId === sp.spin.victim, 'la víctima es la que anunció el spin');
  const expHeir = candidates.filter((id) => id !== lf.victimId)
    .sort((a, b) => (loadBefore.get(a) - loadBefore.get(b)) || (a - b))[0];
  check(lf.heirId === expHeir && lf.points === loadBefore.get(lf.victimId), `heredero = el de menos puntos (${lf.heir}), points = ${lf.points}`);
  check(lf.victim === done.phones.find((p) => p.id === lf.victimId).name && lf.heir === done.phones.find((p) => p.id === lf.heirId).name, 'lastFail: nombres coinciden con los ids');
  check(done.phones.find((p) => p.id === lf.victimId).status === 'off' && done.phones.filter((p) => p.status === 'off').length === 2, 'al terminar la víctima queda off');
  check(done.points.length === 30 && done.points.filter((pt) => pt.home === lf.victimId).every((pt) => pt.owner === lf.heirId), 'los puntos de la víctima pasan al heredero');
  checkDriverShape(done, 'ruleta');
  const roles = {};
  for (let i = 0; i < 5; i++) {
    const s = await waitFor(phones[i], (st) => st.spin === null && st.lastFail && st.lastFail.n === spinN, `lastFail.n nuevo en ${names[i]}`);
    roles[i] = s.lastFail.me;
    checkPhoneShape(s, 'ruleta');
    check(s.lastFail.victim === lf.victim && s.lastFail.heir === lf.heir && s.lastFail.points === lf.points, 'lastFail del celular: victim, heir, points');
    const want = ids[i] === lf.victimId ? 'victim' : ids[i] === lf.heirId ? 'heir' : 'safe';
    check(s.lastFail.me === want, `lastFail.me de ${names[i]} = ${want}, vino ${s.lastFail.me}`);
  }
  check(roles[4] === 'safe', 'quien ya estaba apagada y no fue candidata ve safe');
  await sleep(200);
  check(phones.every((p) => p.state.spin === null), 'terminada la ruleta nadie ve spin');
  const idx = (id) => ids.indexOf(id);
  check(phones[idx(lf.heirId)].inherits.length >= 1 && phones[idx(lf.heirId)].inherits.some((x) => x.count === lf.points), 'el heredero de la ruleta recibe inherit');

  step('juego: llega una compu tarde y medallas en end');
  const late = connect(url, { role: 'worker', token: 'glate', name: 'Tarde' });
  await waitFor(late, (s) => s.me && s.points.length === 6, 'celular tardío');
  driver.socket.emit('phase', { phase: 'end' });
  await waitFor(driver, (s) => s.phase === 'end', 'fase end');
  const rankOf = [1, 5, 2, 3, 4]; // Ana, Bruno, Caro, Dani, Eze
  const heirs = new Set([clickHeirId, lf.heirId]); // heir of Eze's points, and heir of the roulette victim
  const fallen = new Set([ids[4], lf.victimId]);
  for (let i = 0; i < 5; i++) {
    const want = [];
    if (rankOf[i] === 1) want.push('fastest');
    if (rankOf[i] === 2 || rankOf[i] === 3) want.push('podium');
    if (paints[i].mistakes === 0) want.push('perfect');
    if (heirs.has(ids[i])) want.push('heir');
    if (candidates.includes(ids[i]) && ids[i] !== lf.victimId) want.push('survivor');
    if (fallen.has(ids[i])) want.push('fallen');
    const s = await waitFor(phones[i], (st) => st.phase === 'end', 'end en el celular');
    check(medalsOf(phones[i]) === want.join(), `medallas de ${names[i]}: ${want.join()}, vino ${medalsOf(phones[i])}`);
    checkPhoneShape(s, 'end');
  }
  check(medalsOf(phones[0]).startsWith('fastest,perfect'), 'Ana: fastest y perfect (en ese orden)');
  check(late.state.me.paint === null && medalsOf(late) === 'cluster', `quien llegó tarde y no hizo nada tiene solo "cluster" (${medalsOf(late)})`);
  check(phones.every((p) => !p.state.me.medals.includes('cluster')), 'cluster solo cuando no hay otra medalla');

  step('juego: la ruleta se cancela al cambiar de fase y con reset');
  driver.socket.emit('phase', { phase: 'fail' });
  await waitFor(driver, (s) => s.phase === 'fail', 'vuelta a fail');
  const offBefore = driver.state.phones.filter((p) => p.status === 'off').length;
  const nBefore = driver.state.lastFail.n;
  driver.socket.emit('spin');
  await waitFor(driver, (s) => s.spin, 'segunda ruleta');
  driver.socket.emit('phase', { phase: 'combine' });
  await waitFor(driver, (s) => s.phase === 'combine' && s.spin === null, 'ruleta cancelada al cambiar de fase');
  await sleep(SPIN_MS + 300);
  check(driver.state.phones.filter((p) => p.status === 'off').length === offBefore && driver.state.lastFail.n === nBefore, 'la ruleta cancelada no apaga a nadie');
  check(phones.every((p) => p.state.spin === null && p.state.lastFail.n === nBefore), 'los celulares no ven la ruleta cancelada');
  driver.socket.emit('phase', { phase: 'fail' });
  await waitFor(driver, (s) => s.phase === 'fail', 'otra vez fail');
  driver.socket.emit('spin');
  await waitFor(driver, (s) => s.spin, 'tercera ruleta');
  driver.socket.emit('reset');
  const rst = await waitFor(driver, (s) => s.phase === 'lobby', 'reset');
  check(rst.spin === null, 'reset cancela la ruleta');
  await sleep(SPIN_MS + 300);
  check(driver.state.phase === 'lobby' && driver.state.lastFail === null && driver.socket.connected, 'tras el reset la ruleta no hace nada');

  step('juego: reset limpia todo');
  const r = driver.state.race;
  check(r.finished === 0 && r.podium.length === 0 && r.parallelMs === null && r.soloMs === null && r.slowest === null, 'reset: race vacío');
  check(driver.state.lastFail === null && driver.state.spin === null, 'reset: sin lastFail ni spin');
  for (const p of [...phones, late]) {
    const s = await waitFor(p, (st) => st.phase === 'lobby' && st.lastFail === null, 'celular en lobby');
    check(s.me.paint === null && medalsOf(p) === 'cluster' && s.spin === null && s.race.parallelMs === null && s.race.soloMs === null,
      `reset: ${s.me.name} sin paint, sin medallas (salvo cluster), sin spin ni race`);
  }
  driver.socket.emit('phase', { phase: 'paint' });
  await waitFor(driver, (s) => s.phase === 'paint', 'nueva clase');
  check(driver.state.race.finished === 0 && phones.every((p) => p.state.me.paint === null), 'la clase nueva arranca con la carrera en cero');
}

// ---------------------------------------------------------------- main

async function main() {
  console.log('Generador de puntos y convergencia');
  step('puntos: 2 por grupo, margen >= 8, ordenados');
  pointsGenerator();
  step('convergencia (6.5)');
  convergence();

  console.log('Actividad completa');
  const port = await freePort();
  const server = await startServer(port);
  server.removeAllListeners('exit');
  let crashed = false;
  server.on('exit', (code) => { if (code) { crashed = true; failures.push(`el servidor se cayó (código ${code})`); } });
  try {
    await activity(port);
  } catch (err) {
    failures.push(err.message);
  }
  check(!crashed, 'el servidor no se cayó');
  clients.forEach((c) => c.socket.close());
  clients.length = 0;
  server.kill();

  console.log('Capa de juego');
  step('desempate del ranking');
  tieBreak();
  // A fresh server so the game starts from an empty room.
  const port2 = await freePort();
  const server2 = await startServer(port2);
  server2.removeAllListeners('exit');
  let crashed2 = false;
  server2.on('exit', (code) => { if (code) { crashed2 = true; failures.push(`el servidor del juego se cayó (código ${code})`); } });
  try {
    await game(port2);
  } catch (err) {
    failures.push(err.message);
  }
  check(!crashed2, 'el servidor del juego no se cayó');
  clients.forEach((c) => c.socket.close());
  server2.kill();
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
