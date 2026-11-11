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

const KEY = 'smoke-key';
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
      env: { ...process.env, PORT: String(port), DRIVER_KEY: KEY, PUBLIC_URL: `http://localhost:${port}` },
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
  ok(s.lastFail === null || (typeof s.lastFail.victim === 'string' && typeof s.lastFail.heir === 'string' && isNum(s.lastFail.points)), 'lastFail');
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
  server.kill();
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
