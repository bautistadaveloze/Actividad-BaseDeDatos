'use strict';

// Projector screen. It plays the cluster manager, shows what every phone is
// doing and keeps a button for every step, so the class never depends on
// the phone that plays the driver.
(() => {
  const $ = (sel, root = document) => root.querySelector(sel);

  const ORDER = ['lobby', 'solo', 'manager', 'work', 'combine', 'fail', 'end'];
  const STEPS = [
    { id: 'lobby', label: 'Unirse' },
    { id: 'solo', label: 'Driver solo' },
    { id: 'manager', label: 'Cluster manager' },
    { id: 'work', label: 'Workers' },
    { id: 'combine', label: 'Juntar' },
    { id: 'fail', label: 'Se cae una' },
    { id: 'end', label: 'Cierre' },
  ];

  // Texts come straight from presentacion-web/ACTIVIDAD.md, section 4.
  const COPY = {
    lobby: {
      title: 'Sumate con tu celular',
      lead: 'Escaneá el QR. Tu celular va a ser una computadora.',
    },
    solo: {
      title: 'Paso 1 · Sos el driver',
      lead: 'El driver es la compu que tiene el trabajo. Sin ayuda, tiene que pintar todos los puntos sola.',
      main: 'Una sola compu con todos los datos. ¿Llega a terminar?',
      tech: 'En Spark: el driver es el programa principal. Sin clúster, hace todo en una sola máquina.',
    },
    manager: {
      title: 'Paso 2 · Aparece el cluster manager',
      lead: 'Sabe qué compus están libres y se las presta al driver. Sumá la tuya desde el celular.',
      main: 'Un driver solo no da abasto. El cluster manager junta compus para ayudarlo.',
      tech: 'En Spark: el cluster manager puede ser Standalone, YARN o Kubernetes. Reparte las máquinas.',
    },
    work: {
      title: 'Paso 3 · Los workers pintan su parte',
      lead: 'El driver repartió los datos: cada worker pinta solo sus 6 puntos y le manda un resumen.',
      main: 'Todas las compus trabajan al mismo tiempo, cada una con su parte.',
      tech: 'En Spark: cada parte es una partición y pintarla es una tarea que corre en un executor.',
    },
    combine: {
      title: 'Paso 4 · El driver junta los resúmenes',
      lead: 'Con los resúmenes de todos, mueve cada centro al medio de su grupo.',
      main: 'Por la red no viajaron los puntos: viajaron resúmenes chiquitos.',
      tech: 'En Spark: juntar en el driver lo que devuelven las tareas es el reduce. Repetir hasta que no cambie es entrenar el modelo.',
    },
    fail: {
      title: 'Paso 5 · ¿Y si se cae una compu?',
      lead: 'Otra vuelta a mano. Mientras pintan, giramos la ruleta: a una compu se le corta todo.',
      main: 'Si una compu se cae, el cluster manager se da cuenta y otra hace su parte.',
      tech: 'En Spark: el driver vuelve a lanzar la tarea perdida en otro executor. Eso es tolerancia a fallos.',
    },
    end: {
      title: 'Lo que hicimos es lo que hace un clúster',
      lead: '',
    },
  };

  // Status -> icon, tone and words. Never color alone: every state has its own icon.
  const STATUS = {
    waiting: { icon: 'check', tone: 'ok', label: 'conectada' },
    painting: { icon: 'timer', tone: 'warn', label: 'pintando' },
    done: { icon: 'hourglass', tone: 'ok', label: 'terminó el tiempo' },
    joined: { icon: 'user-plus', tone: 'accent', label: 'se sumó' },
    out: { icon: 'hand', tone: 'mute', label: 'no se sumó' },
    driver: { icon: 'crown', tone: 'driver', label: 'driver' },
    sent: { icon: 'send', tone: 'ok', label: 'envió el resumen' },
    idle: { icon: 'check', tone: 'ok', label: 'libre' },
    working: { icon: 'zap', tone: 'accent', label: 'calculando' },
    off: { icon: 'power-off', tone: 'bad', label: 'caída' },
    offline: { icon: 'wifi-off', tone: 'mute', label: 'sin conexión' },
  };
  // In step 3 a connected phone that did not lend itself yet looks pending.
  const NOT_YET = { icon: 'hand', tone: 'mute', label: 'todavía no se sumó' };

  const icon = (name) => `<svg class="icon" aria-hidden="true"><use href="/icons.svg#${name}"/></svg>`;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = (n) => String(n).padStart(2, '0');
  const nf = new Intl.NumberFormat('es-AR');
  const plural = (n, one, many) => `${nf.format(n)} ${n === 1 ? one : many}`;
  const nf1 = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const NAMES = ['Violeta', 'Celeste', 'Rosa'];
  const swatch = (j) => `<i class="shape shape-${j}"></i>`;

  function fmtTime(ms) {
    const sec = ms / 1000;
    if (sec < 59.95) return `${nf1.format(sec)} s`;
    const total = Math.round(sec);
    return `${Math.floor(total / 60)} min ${total % 60} s`;
  }
  // Estimates are rounded and say "unos".
  function fmtAbout(ms) {
    const sec = ms / 1000;
    if (sec < 90) return `unos ${Math.max(5, Math.round(sec / 5) * 5)} segundos`;
    return `unos ${Math.max(2, Math.round(sec / 60))} minutos`;
  }
  function names(list, max = 4) {
    if (!list.length) return '';
    if (list.length <= max) return list.length === 1 ? list[0] : `${list.slice(0, -1).join(', ')} y ${list[list.length - 1]}`;
    return `${list.slice(0, max).join(', ')} y ${list.length - max} más`;
  }

  const embedded = document.documentElement.dataset.embed === 'true';
  let socket = null;
  let state = null;

  // ------------------------------------------------------------ auth

  const params = new URLSearchParams(location.search);
  let key = params.get('key');
  try {
    if (key) sessionStorage.setItem('driver-key', key);
    else key = sessionStorage.getItem('driver-key');
  } catch { /* storage blocked: the key only lives in this page */ }
  // Keep the key out of the address bar (and of screenshots), but stay embedded.
  if (params.has('key')) history.replaceState(null, '', embedded ? '/driver?embed=1' : '/driver');

  function showAuth(message = '') {
    $('#auth').hidden = false;
    $('#authError').textContent = message;
    $('#authKey').focus();
  }

  $('#authForm').addEventListener('submit', (e) => {
    e.preventDefault();
    key = $('#authKey').value.trim();
    try { sessionStorage.setItem('driver-key', key); } catch { /* ignore */ }
    $('#auth').hidden = true;
    connect();
  });

  function connect() {
    if (socket) socket.close();
    socket = io({ auth: { role: 'projector', key } });
    socket.on('auth:error', (msg) => { socket.close(); showAuth(msg); });
    socket.on('connect', () => { $('#conn').hidden = true; });
    socket.on('disconnect', () => { $('#conn').hidden = false; });
    socket.on('state', (s) => { state = s; render(); });
  }

  const send = (event, payload) => socket && socket.emit(event, payload);

  if (key) connect();
  else showAuth();

  // ------------------------------------------------------------ rules (mirror the server)

  const connectedCount = (s) => s.phones.filter((p) => p.status !== 'offline').length;
  const liveWorkers = (s) => s.phones.filter((p) => p.registered && p.status !== 'offline' && p.status !== 'off' && p.status !== 'driver');

  // Only forward, one step at a time; `reset` is the only way back.
  function canGo(s, id) {
    if (!s || ORDER.indexOf(id) !== ORDER.indexOf(s.phase) + 1) return false;
    if (id === 'solo') return connectedCount(s) > 0;
    if (id === 'work') return liveWorkers(s).length > 0;
    if (id === 'combine') return !!s.manual && s.manual.done > 0;
    return true;
  }

  function goNext() {
    if (!state) return;
    const target = ORDER[ORDER.indexOf(state.phase) + 1];
    if (target && canGo(state, target)) send('phase', { phase: target });
  }

  const canJoinFail = (s) => s.phase === 'fail' && !!s.manual && s.manual.done > 0 && !s.spin;
  const canRound = (s) => s.phase === 'combine' && !s.busy && !s.converged;
  const failCandidates = (s) => liveWorkers(s).filter((p) => p.parts > 0);
  const canSpin = (s) => s.phase === 'fail' && !!s.manual && !s.spin && failCandidates(s).length > 1;
  const canKill = (s) => s.phase === 'fail' && !!s.manual && !s.spin;

  // ------------------------------------------------------------ chrome

  function setTheme(theme) {
    document.documentElement.dataset.theme = theme;
    $('#themeBtn').setAttribute('aria-pressed', String(theme === 'contrast'));
    try { localStorage.setItem('driver-theme', theme); } catch { /* ignore */ }
  }
  const toggleTheme = () => setTheme(document.documentElement.dataset.theme === 'contrast' ? 'dark' : 'contrast');
  $('#themeBtn').addEventListener('click', toggleTheme);
  $('#themeBtn').setAttribute('aria-pressed', String(document.documentElement.dataset.theme === 'contrast'));

  function toggleFullscreen() {
    if (embedded) { parent.postMessage({ type: 'deck-fullscreen' }, location.origin); return; }
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(() => {});
  }
  $('#fullBtn').addEventListener('click', toggleFullscreen);

  const qr = $('#qrOverlay');
  const toggleQr = (show = qr.hidden) => { qr.hidden = !show; };
  $('#joinChip').addEventListener('click', () => toggleQr(true));
  qr.addEventListener('click', (e) => { if (e.target === qr || e.target.closest('[data-close]')) toggleQr(false); });

  const confirmBox = $('#confirm');
  function askReset(show) {
    confirmBox.hidden = !show;
    if (show) $('#confirmNo').focus();
  }
  $('#confirmNo').addEventListener('click', () => askReset(false));
  $('#confirmYes').addEventListener('click', () => { askReset(false); send('reset'); });
  confirmBox.addEventListener('click', (e) => { if (e.target === confirmBox) askReset(false); });

  const toggleRun = () => { if (state && state.phase === 'combine' && (state.running || !state.converged)) send('run', { on: !state.running }); };
  const doRound = () => { if (state && canRound(state)) send('round'); };
  const doSpin = () => { if (state && canSpin(state)) send('spin'); };
  const doJoin = () => {
    if (!state) return;
    if (state.phase === 'work' && canGo(state, 'combine')) send('phase', { phase: 'combine' });
    else if (canJoinFail(state)) send('join');
  };

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target instanceof HTMLInputElement) return;
    if (e.key === 'Escape') { toggleQr(false); askReset(false); return; }
    if (!confirmBox.hidden) return; // the dialog owns the keyboard while open
    const k = e.key.toLowerCase();
    if (e.key === 'ArrowRight') goNext();
    else if (e.key === ' ' || k === 'r') { e.preventDefault(); doRound(); }
    else if (k === 's') toggleRun();
    else if (k === 'j') doJoin();
    else if (k === 'k') doSpin();
    else if (k === 'q') toggleQr();
    else if (k === 't') toggleTheme();
    else if (k === 'f') toggleFullscreen();
  });

  // ------------------------------------------------------------ stepper

  const stepper = $('#stepper');
  stepper.innerHTML = STEPS.map((st, i) =>
    `<button class="step" type="button" data-step="${st.id}"><span class="step-n">${i + 1}</span><span class="step-label">${st.label}</span></button>`).join('');
  stepper.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-step]');
    if (btn && state && canGo(state, btn.dataset.step)) send('phase', { phase: btn.dataset.step });
  });

  function renderStepper(s) {
    const cur = ORDER.indexOf(s.phase);
    stepper.querySelectorAll('.step').forEach((btn, i) => {
      const id = STEPS[i].id;
      const active = i === cur;
      btn.classList.toggle('is-active', active);
      btn.classList.toggle('is-done', i < cur);
      btn.disabled = !active && !canGo(s, id);
      btn.setAttribute('aria-current', active ? 'step' : 'false');
      btn.querySelector('.step-n').innerHTML = i < cur ? icon('check') : String(i + 1);
    });
  }

  // ------------------------------------------------------------ plot (SVG)

  const NS = 'http://www.w3.org/2000/svg';
  const svg = $('#plot');
  const mk = (tag, attrs = {}, parent = null) => {
    const node = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    if (parent) parent.appendChild(node);
    return node;
  };
  const sy = (y) => 100 - y; // the plane grows upward, SVG grows downward

  // Shapes are centered on the origin so scaling animations pivot on the point.
  function shape(label, big) {
    const fill = label < 0 ? 'var(--c-none)' : `var(--c${label})`;
    const m = big ? 1 : 0;
    if (label < 0) return mk('circle', { r: 1.25, fill });
    if (label === 0) return mk('circle', { r: m ? 4.2 : 1.55, fill });
    if (label === 1) {
      const h = m ? 3.7 : 1.4;
      return mk('rect', { x: -h, y: -h, width: 2 * h, height: 2 * h, rx: m ? 0.5 : 0.2, fill });
    }
    return mk('path', { d: m ? 'M0 -5.2 L4.9 3.5 L-4.9 3.5Z' : 'M0 -2.1 L1.9 1.4 L-1.9 1.4Z', fill, 'stroke-linejoin': 'round' });
  }

  // Layers, bottom to top: grid, trails, points, centers.
  const gridG = mk('g', { class: 'grid' }, svg);
  mk('rect', { x: 0, y: 0, width: 100, height: 100, rx: 1.5, class: 'plane' }, gridG);
  for (let v = 20; v < 100; v += 20) {
    mk('line', { x1: v, y1: 0, x2: v, y2: 100 }, gridG);
    mk('line', { x1: 0, y1: v, x2: 100, y2: v }, gridG);
  }
  const trailG = mk('g', { class: 'trails' }, svg);
  const pointsG = mk('g', { class: 'points' }, svg);
  const centersG = mk('g', { class: 'centers' }, svg);

  const trailEls = [0, 1, 2].map((k) => {
    const g = mk('g', { class: `trail trail-${k}` }, trailG);
    return { g, line: mk('polyline', {}, g), dots: mk('g', {}, g), sig: '' };
  });
  const centerEls = [0, 1, 2].map((k) => {
    const g = mk('g', { class: 'center' }, centersG);
    const body = mk('g', { class: 'center-body' }, g);
    body.appendChild(shape(k, true));
    return g;
  });
  let centersPlaced = false;

  const pointEls = []; // index-keyed: points keep their slot between states

  function ensurePoint(i) {
    if (pointEls[i]) return pointEls[i];
    const g = mk('g', { class: 'pt' }, pointsG);
    const ring = mk('circle', { class: 'ring', r: 3, visibility: 'hidden' }, g);
    const body = mk('g', { class: 'pt-body' }, g);
    return (pointEls[i] = { g, ring, body, label: null, x: null, y: null, ringOn: false });
  }

  function renderPlot(s) {
    const pts = s.points;
    while (pointEls.length > pts.length) pointEls.pop().g.remove();
    const showRings = s.phase === 'fail';
    pts.forEach((pt, i) => {
      const el = ensurePoint(i);
      if (el.x !== pt.x || el.y !== pt.y) {
        el.g.setAttribute('transform', `translate(${pt.x} ${sy(pt.y)})`);
        el.x = pt.x; el.y = pt.y;
        el.label = null;
      }
      if (el.label !== pt.label) {
        const first = el.label === null;
        el.body.replaceChildren(shape(pt.label, false));
        if (!first && pt.label >= 0) {
          // Replay the pop animation, with a small random delay so a whole
          // part does not flash on the same frame.
          el.body.classList.remove('pop');
          el.body.style.animationDelay = `${Math.floor(Math.random() * 260)}ms`;
          void el.body.getBoundingClientRect();
          el.body.classList.add('pop');
        }
        el.label = pt.label;
      }
      const ringOn = showRings && pt.moved;
      if (ringOn !== el.ringOn) {
        el.ring.setAttribute('visibility', ringOn ? 'visible' : 'hidden');
        el.ringOn = ringOn;
      }
    });

    s.centers.forEach((c, k) => {
      centerEls[k].style.transform = `translate(${c.x}px, ${sy(c.y)}px)`;
    });
    if (!centersPlaced) {
      // First placement must not glide in from the corner: enable the
      // transition only after the first frame has been painted.
      centersPlaced = true;
      requestAnimationFrame(() => requestAnimationFrame(() => svg.classList.add('animated')));
    }

    trailEls.forEach((t, k) => {
      const len = s.trail.length;
      const sig = `${len}:${s.trail[len - 1] ? s.trail[len - 1][k].x : ''}`;
      if (t.sig === sig) return;
      t.sig = sig;
      const path = s.trail.map((step) => step[k]);
      t.line.setAttribute('points', path.map((p) => `${p.x},${sy(p.y)}`).join(' '));
      t.dots.replaceChildren(...path.slice(0, -1).map((p) => mk('circle', { cx: p.x, cy: sy(p.y), r: 0.8 })));
    });
  }

  // ------------------------------------------------------------ compus grid

  const grid = $('#compusGrid');
  const compusTitle = $('#compusTitle');
  const tiles = new Map(); // id -> { el, sig, id }

  // Roulette effects live in classes that a status change must not wipe out.
  const fx = { cands: new Set(), lit: null, blink: null };
  function applyTileFx(t) {
    t.el.classList.toggle('is-cand', fx.cands.has(t.id));
    t.el.classList.toggle('is-lit', fx.lit === t.id);
    t.el.classList.toggle('is-blink', fx.blink === t.id);
  }
  const applyAllFx = () => tiles.forEach(applyTileFx);

  // What a tap on a tile does in this state, or null.
  function tileAction(s, p) {
    if (s.phase === 'manager' && p.status !== 'offline' && p.status !== 'driver') return 'driver';
    if (canKill(s) && p.registered && p.parts > 0 && ['painting', 'sent', 'idle'].includes(p.status)) return 'kill';
    return null;
  }

  function tileExtra(s, p) {
    if (s.phase === 'solo') return p.solo > 0 ? String(p.solo) : '';
    if (p.inherited > 0) return `+${p.inherited}`;
    return '';
  }

  function renderCompus(s) {
    const titles = {
      lobby: 'Compus conectadas', solo: 'Drivers pintando solos', manager: 'Compus en el clúster',
    };
    const inCluster = s.phones.filter((p) => p.registered).length;
    const count = s.phase === 'manager' ? `${inCluster} de ${connectedCount(s) - (s.driver ? 1 : 0)}`
      : ORDER.indexOf(s.phase) > ORDER.indexOf('manager') ? String(liveWorkers(s).length) : String(connectedCount(s));
    const title = `${titles[s.phase] || 'Workers'}: <span class="mono">${count}</span>`;
    if (compusTitle.innerHTML !== title) compusTitle.innerHTML = title;
    const hint = $('#compusHint');
    const hintText = s.phase === 'manager' ? 'Tocá una compu para cambiar quién es el driver.'
      : canKill(s) ? 'Tocá un worker para que se caiga.' : '';
    hint.textContent = hintText;
    hint.hidden = !hintText;

    const n = s.phones.length;
    grid.dataset.size = n <= 12 ? 'm' : n <= 28 ? 's' : n <= 48 ? 'xs' : 'xxs';
    const seen = new Set();
    s.phones.forEach((p, idx) => {
      seen.add(p.id);
      let t = tiles.get(p.id);
      if (!t) {
        const el = document.createElement('button');
        el.type = 'button';
        el.setAttribute('role', 'listitem');
        el.innerHTML = '<span class="t-ico"></span><span class="t-num mono"></span><span class="t-name"></span><span class="t-inh mono"></span>';
        el.querySelector('.t-num').textContent = pad(p.id);
        el.addEventListener('click', () => {
          if (!state) return;
          const cur = state.phones.find((q) => q.id === p.id);
          const action = cur && tileAction(state, cur);
          if (action === 'driver') send('driver', { id: p.id });
          else if (action === 'kill') send('kill', { id: p.id });
        });
        t = { el, sig: '', id: p.id };
        tiles.set(p.id, t);
      }
      const action = tileAction(s, p);
      const st = s.phase === 'manager' && p.status === 'waiting' ? NOT_YET : (STATUS[p.status] || STATUS.idle);
      const extra = tileExtra(s, p);
      const sig = `${p.name}|${p.status}|${s.phase}|${extra}|${action}`;
      if (t.sig !== sig) {
        t.sig = sig;
        const el = t.el;
        el.className = `tile tone-${st.tone}`;
        el.dataset.status = p.status;
        el.disabled = !action;
        el.classList.toggle('is-tappable', !!action);
        el.classList.toggle('is-kill', action === 'kill');
        el.querySelector('.t-ico').innerHTML = icon(st.icon);
        el.querySelector('.t-name').textContent = p.name;
        el.querySelector('.t-inh').textContent = extra;
        el.title = `Compu ${pad(p.id)} · ${p.name} · ${st.label}`;
        const tap = action === 'driver' ? '. Tocar para hacerla driver' : action === 'kill' ? '. Tocar para que se caiga' : '';
        el.setAttribute('aria-label', `Compu ${pad(p.id)}, ${p.name}, ${st.label}${p.inherited ? `, heredó ${p.inherited} puntos` : ''}${tap}`);
      }
      if (grid.children[idx] !== t.el) grid.insertBefore(t.el, grid.children[idx] || null);
      applyTileFx(t);
    });
    grid.classList.toggle('is-spinning', !!(s.spin && s.phase === 'fail'));
    for (const [id, t] of tiles) {
      if (!seen.has(id)) { t.el.remove(); tiles.delete(id); }
    }
  }

  // ------------------------------------------------------------ rail

  function renderRoles(s) {
    const show = ORDER.indexOf(s.phase) >= ORDER.indexOf('manager') && s.phase !== 'end';
    $('#roles').hidden = !show;
    if (!show) return;
    const d = s.driver;
    $('#roleDriver').textContent = d ? `${d.name}${d.connected ? '' : ' (sin conexión)'}` : 'El proyector';
  }

  function renderCard(s) {
    const copy = COPY[s.phase];
    const show = s.phase !== 'lobby' && s.phase !== 'end';
    $('#card').hidden = !show;
    if (!show) return;
    $('#cardMain').textContent = copy.main;
    $('#cardMain').hidden = !copy.main;
    $('#cardTech').innerHTML = `${icon('layers')}<span>${esc(copy.tech)}</span>`;
  }

  // ------------------------------------------------------------ stage

  const views = document.querySelectorAll('[data-view]');
  let shownHead = null;

  function leadOf(s) {
    if (s.phase === 'solo' && s.solo && s.solo.over) return 'Se terminó el tiempo. Una sola compu no llega con todos los datos.';
    if (s.phase === 'fail' && !s.manual) return 'La vuelta terminó aunque se cayó una compu.';
    return COPY[s.phase].lead;
  }

  function renderHead(s) {
    const copy = COPY[s.phase];
    const lead = leadOf(s);
    const sig = `${s.phase}|${lead}`;
    if (sig === shownHead) return;
    const phaseChanged = !shownHead || !shownHead.startsWith(`${s.phase}|`);
    shownHead = sig;
    $('#title').textContent = copy.title;
    $('#lead').textContent = lead;
    $('#lead').hidden = !lead;
    if (phaseChanged) {
      const head = $('#stageHead');
      head.classList.remove('enter');
      void head.offsetWidth;
      head.classList.add('enter');
      const viewName = { lobby: 'lobby', solo: 'solo', manager: 'arch', end: 'end' }[s.phase] || 'plot';
      views.forEach((v) => { v.hidden = v.dataset.view !== viewName; });
    }
  }

  // ---------------- step 2: the driver alone

  let soloEnd = null;
  function renderSolo(s) {
    const so = s.solo;
    if (s.phase !== 'solo' || !so) { soloEnd = null; return; }
    const end = so.over ? Date.now() : Date.now() + so.remainingMs;
    if (soloEnd === null || Math.abs(end - soloEnd) > 600 || so.over) soloEnd = end;
    tickSolo();
    $('#soloJob').innerHTML = `Cada celular tiene <strong>${nf.format(so.total)}</strong> puntos para pintar solo.`;
    $('#soloClockBox').hidden = so.over;
    $('#soloJob').hidden = so.over;
    $('#soloResult').hidden = !so.over;
    if (so.over) {
      const top = so.top;
      const finished = top && top.done >= so.total;
      $('#soloBig').textContent = finished ? `¡${top.name} pintó todo!` : 'Nadie terminó.';
      $('#soloTopLine').innerHTML = top
        ? `La que más pintó: <strong>${esc(top.name)}</strong>, ${nf.format(top.done)} de ${nf.format(so.total)}.`
        : 'Nadie llegó a pintar.';
      $('#soloEstimate').innerHTML = `A este ritmo, un driver solo tardaría <strong>${fmtAbout(so.estimateMs)}</strong>.`;
      $('#soloNext').textContent = top ? `${top.name} va a ser el driver del clúster.` : '';
    }
    const leaders = so.leaders || [];
    $('#leaders').innerHTML = leaders.length
      ? leaders.map((l, i) => `<li class="leader${i === 0 ? ' is-first' : ''}">
          <span class="ld-rank">${i + 1}</span><span class="ld-name">${esc(l.name)}</span>
          <span class="ld-num mono">${nf.format(l.done)}</span>
          <span class="ld-bar"><i style="width:${Math.min(100, Math.round((100 * l.done) / so.total))}%"></i></span></li>`).join('')
      : '<li class="ld-empty">Todavía nadie pintó.</li>';
    $('#soloSum').textContent = so.players
      ? `${plural(so.players, 'persona pintó', 'personas pintaron')}, cada una con su copia de los ${nf.format(so.total)} puntos.`
      : '';
  }

  function tickSolo() {
    if (soloEnd === null) return;
    const sec = Math.ceil(Math.max(0, soloEnd - Date.now()) / 1000);
    const el = $('#soloClock');
    if (el.textContent !== String(sec)) el.textContent = String(sec);
    $('#soloClockBox').classList.toggle('is-low', sec <= 5);
  }
  setInterval(tickSolo, 200);

  // ---------------- step 3: the cluster manager

  function renderArch(s) {
    if (s.phase !== 'manager') return;
    const d = s.driver;
    $('#archDriver').textContent = d ? d.name : 'El proyector';
    $('#archDriverNote').textContent = d ? 'Pintó más que nadie y tiene todos los datos' : 'Tiene todos los datos';
    const pool = s.phones.filter((p) => p.registered && p.status !== 'offline' && p.status !== 'off').map((p) => p.name);
    const count = $('#poolCount');
    if (count.textContent !== String(pool.length)) {
      count.textContent = String(pool.length);
      if (!reducedMotion()) {
        count.classList.remove('bump');
        void count.offsetWidth;
        count.classList.add('bump');
      }
    }
    $('#poolNames').textContent = pool.length ? names(pool) : 'Todavía ninguna. Sumá la tuya desde el celular.';
    $('#archFoot').innerHTML = d
      ? `Cuando <strong>${esc(d.name)}</strong> pida compus desde su celular, el cluster manager le presta todas estas: van a ser los <strong>workers</strong>.`
      : 'Cuando el driver pida compus, el cluster manager le presta todas estas: van a ser los <strong>workers</strong>.';
  }

  // ---------------- steps 3 to 5: plot side

  function countsHtml(counts) {
    return counts.map((c, j) => `<span class="tot">${swatch(j)}<b>${NAMES[j]}</b><span class="mono">${nf.format(c)}</span></span>`).join('');
  }

  const inboxEl = $('#inbox');
  let inboxSig = '';
  function renderInbox(s) {
    const show = !!s.manual && (s.phase === 'work' || s.phase === 'fail');
    inboxEl.hidden = !show || !s.inbox.length;
    if (!show) { inboxSig = ''; return; }
    const last = s.inbox.slice(-5).reverse();
    const sig = last.map((e) => e.part).join(',');
    if (sig === inboxSig) return;
    const fresh = inboxSig ? last[0] && !inboxSig.split(',').includes(String(last[0].part)) : false;
    inboxSig = sig;
    inboxEl.innerHTML = last.map((e, i) => `<li class="${i === 0 && fresh && !reducedMotion() ? 'is-new' : ''}">
        <span class="in-name">${esc(e.by)}${e.from !== e.by ? `<small>hizo la parte de ${esc(e.from)}</small>` : ''}</span>
        <span class="in-counts">${e.counts.map((c, j) => `<span>${swatch(j)}<span class="mono">${c}</span></span>`).join('')}</span></li>`).join('');
  }

  function renderSide(s) {
    // Summaries arriving at the driver (manual rounds).
    const manual = !!s.manual && (s.phase === 'work' || s.phase === 'fail');
    $('#partsBlock').hidden = !manual;
    if (manual) {
      const { done, total } = s.manual;
      $('#partsDone').textContent = nf.format(done);
      $('#partsTotal').textContent = nf.format(total);
      $('#partsBar').style.width = total ? `${Math.round((100 * done) / total)}%` : '0%';
      const alive = liveWorkers(s).length;
      $('#partsNote').textContent = s.phase === 'fail'
        ? `${plural(total, 'parte', 'partes')} y ${plural(alive, 'compu viva', 'compus vivas')}.`
        : done >= total ? 'Llegaron todos: el driver ya puede juntar.' : 'El driver espera a que lleguen todos.';
    }
    renderInbox(s);

    // A fall.
    const lf = s.phase === 'fail' && s.lastFail;
    $('#failCard').hidden = !lf || !!s.spin;
    if (lf) {
      const why = lf.cause === 'lost' ? `La compu de <strong>${esc(lf.victim)}</strong> no responde: se desconectó. ` : `Se cayó la compu de <strong>${esc(lf.victim)}</strong>. `;
      $('#failText').innerHTML = `${why}El cluster manager le pasó su parte a <strong>${esc(lf.heir)}</strong>.`;
    }

    // The join in step 6: nothing was lost.
    const j = s.join;
    const joined = s.phase === 'fail' && !s.manual && j;
    $('#joinCard').hidden = !joined;
    if (joined) {
      const filled = j.filled ? ` Faltaban ${plural(j.filled, 'parte', 'partes')}: las terminó el driver.` : '';
      $('#joinText').innerHTML = `Llegaron las <strong>${nf.format(j.parts)} partes</strong> con <strong>${plural(j.workers, 'compu', 'compus')}</strong>. `
        + `${j.rescued ? 'No se perdió nada.' : 'El resultado está completo.'}${filled}`;
    }

    // Step 5: what traveled and how long it took.
    const combine = s.phase === 'combine';
    const stat = $('#stat');
    stat.hidden = !combine || !j || s.round > 1;
    if (!stat.hidden) {
      const summaries = j.parts - j.filled;
      stat.innerHTML = `Por la red viajaron <strong>${plural(summaries, 'resumen', 'resúmenes')}</strong>, no <strong>${plural(j.points, 'punto', 'puntos')}</strong>.`;
    }
    renderVersus(s);

    const rounds = combine && (s.round > 1 || s.running || s.busy);
    $('#roundBlock').hidden = !rounds;
    if (rounds) {
      $('#roundLabel').textContent = `Vuelta ${s.round}`;
      $('#roundBusy').textContent = s.busy ? `Calculando: ${s.progress.done} de ${s.progress.total}` : (s.converged ? 'Terminamos' : '');
      const max = Math.max(...s.shifts, 0.0001);
      const bars = $('#shiftBars');
      const want = s.shifts.length;
      while (bars.children.length < want) bars.appendChild(document.createElement('span'));
      while (bars.children.length > want) bars.lastChild.remove();
      s.shifts.forEach((v, i) => {
        bars.children[i].style.height = `${Math.max(4, Math.round((100 * v) / max))}%`;
        bars.children[i].classList.toggle('is-last', i === want - 1);
      });
    }

    const totals = $('#totals');
    totals.hidden = !(combine || joined);
    if (!totals.hidden) totals.innerHTML = countsHtml(s.totals);

    $('#doneBanner').hidden = !(combine && s.converged);
  }

  const versus = $('#versus');
  let versusKey = '';
  function renderVersus(s) {
    const j = s.join;
    const show = s.phase === 'combine' && j && j.parallelMs != null && s.round <= 1 && !s.busy;
    versus.hidden = !show;
    if (!show) { versusKey = ''; return; }
    const key = `${j.parallelMs}|${j.soloMs}`;
    if (key === versusKey) return;
    versusKey = key;
    $('#vsTeamVal').textContent = fmtTime(j.parallelMs);
    $('#vsSoloVal').textContent = fmtAbout(j.soloMs);
    $('#vsNote').textContent = j.slowest ? `El clúster terminó cuando terminó el último worker: ${j.slowest}.` : '';
    // Same scale for both bars. The short one lands first, the long one keeps growing.
    const scale = Math.max(j.parallelMs, j.soloMs, 1);
    const team = $('#vsTeamBar');
    const solo = $('#vsSoloBar');
    [team, solo].forEach((b) => { b.classList.add('no-anim'); b.style.width = '0%'; });
    void versus.offsetWidth;
    [team, solo].forEach((b) => b.classList.remove('no-anim'));
    team.style.width = `${Math.max(1.5, (100 * j.parallelMs) / scale)}%`;
    solo.style.width = `${Math.max(1.5, (100 * j.soloMs) / scale)}%`;
  }

  function renderEnd(s) {
    if (s.phase !== 'end') return;
    $('#endDriverRow').textContent = s.driver ? `${s.driver.name}, que tenía todo el trabajo` : 'El proyector, que tenía todo el trabajo';
    const st = s.stats;
    const parts = [
      plural(st.parts, 'parte', 'partes'),
      plural(st.points, 'punto', 'puntos'),
      plural(s.round, 'vuelta', 'vueltas'),
    ];
    if (st.fails) parts.push(`${plural(st.fails, 'compu caída', 'compus caídas')} y ningún dato perdido`);
    $('#endNums').textContent = parts.join(' · ');
  }

  // ------------------------------------------------------------ roulette

  const spinBanner = $('#spinBanner');
  let spinHandled = 0; // last spin.n whose animation we started
  let spinLive = null; // { victim, timers } while a spin is on screen
  let firstState = true;
  let blinkTimer = 0;

  function setLit(id) { fx.lit = id; applyAllFx(); }

  function startSpin(sp, animate) {
    stopSpin();
    spinLive = { victim: sp.victim, timers: [] };
    fx.cands = new Set(sp.candidates);
    fx.lit = null;
    clearTimeout(blinkTimer);
    fx.blink = null;
    applyAllFx();
    const m = sp.candidates.length;
    if (!animate || reducedMotion() || m < 2) return;
    // Intervals grow geometrically (fast first, slower and slower) and are
    // rescaled so the last hop lands exactly at sp.ms, on the victim.
    const ratio = 1.08;
    const steps = Math.max(6, Math.ceil(Math.log(1 + (sp.ms * (ratio - 1)) / 60) / Math.log(ratio)));
    let raw = 0;
    const cum = [];
    for (let k = 0; k < steps; k++) { raw += Math.pow(ratio, k); cum.push(raw); }
    const vIdx = Math.max(0, sp.candidates.indexOf(sp.victim));
    const t0 = performance.now();
    cum.forEach((c, k) => {
      const at = (c / raw) * sp.ms;
      const id = sp.candidates[(((vIdx - (steps - 1 - k)) % m) + m) % m];
      spinLive.timers.push(setTimeout(() => setLit(id), Math.max(0, at - (performance.now() - t0))));
    });
  }

  function stopSpin() {
    if (!spinLive) return;
    spinLive.timers.forEach(clearTimeout);
    spinLive = null;
  }

  // The server cleared `spin`: the wheel stopped. Land on the victim and blink.
  function endSpin() {
    if (!spinLive) return;
    const victim = spinLive.victim;
    stopSpin();
    fx.cands = new Set();
    fx.lit = null;
    fx.blink = victim;
    applyAllFx();
    clearTimeout(blinkTimer);
    blinkTimer = setTimeout(() => { fx.blink = null; applyAllFx(); }, 3600);
  }

  function renderSpin(s) {
    const sp = s.phase === 'fail' ? s.spin : null;
    spinBanner.hidden = !sp;
    if (sp) {
      if (sp.n !== spinHandled) {
        // A reload in the middle of a wheel only shows the banner: we do not know how far it got.
        startSpin(sp, !firstState);
        spinHandled = sp.n;
      }
    } else if (spinLive) {
      if (s.phase === 'fail') endSpin(); else stopSpin();
    }
    if (s.phase !== 'fail' && !sp && (fx.blink !== null || fx.cands.size)) {
      clearTimeout(blinkTimer);
      fx.cands = new Set(); fx.lit = null; fx.blink = null; applyAllFx();
    }
    firstState = false;
  }

  // ------------------------------------------------------------ party

  const confetti = $('#confetti');
  let prevConverged = null; // null until the first state: loading an already finished class does not celebrate
  let confettiTimer = 0;

  function party() {
    if (reducedMotion()) return;
    clearTimeout(confettiTimer);
    confetti.style.setProperty('--fall', `${$('#stage').clientHeight + 80}px`);
    const frag = document.createDocumentFragment();
    for (let i = 0; i < 90; i++) {
      const p = document.createElement('span');
      p.className = `conf conf-s${i % 3}`;
      p.style.setProperty('--x', `${(Math.random() * 100).toFixed(1)}%`);
      p.style.setProperty('--sz', `${(0.8 + Math.random() * 0.9).toFixed(2)}rem`);
      p.style.setProperty('--d', `${Math.floor(Math.random() * 700)}ms`);
      p.style.setProperty('--t', `${1500 + Math.floor(Math.random() * 400)}ms`);
      p.style.setProperty('--r', `${Math.floor(Math.random() * 720 - 360)}deg`);
      p.style.setProperty('--dx', `${Math.floor(Math.random() * 120 - 60)}px`);
      frag.appendChild(p);
    }
    confetti.replaceChildren(frag);
    confettiTimer = setTimeout(() => confetti.replaceChildren(), 3000);
  }

  function renderParty(s) {
    if (prevConverged === false && s.converged && s.phase === 'combine') party();
    prevConverged = s.converged;
  }

  // ------------------------------------------------------------ actions

  // Buttons are rebuilt only when their set or labels change, so a click is never
  // lost to a re-render in the middle of a press.
  const sub = $('#actionsSub');
  const mainBtn = $('#mainBtn');
  let subSig = '';
  let mainAction = null;

  function renderActions(s) {
    const defs = [];
    if (s.phase === 'combine') {
      defs.push({ id: 'round', label: 'Otra vuelta', ico: 'rotate-ccw', disabled: !canRound(s), run: doRound });
      defs.push(s.running
        ? { id: 'run', label: 'Pausar', ico: 'pause', disabled: false, run: toggleRun }
        : { id: 'run', label: 'Repetir solo', ico: 'play', disabled: s.converged, run: toggleRun });
    }
    if (s.phase === 'fail') {
      defs.push({ id: 'spin', label: 'Girar la ruleta', ico: 'dices', disabled: !canSpin(s), run: doSpin });
      const anyOff = s.phones.some((p) => p.status === 'off');
      defs.push({ id: 'revive', label: 'Prender todas', ico: 'power', disabled: !anyOff || !!s.spin, run: () => send('revive') });
      if (s.manual) defs.push({ id: 'join', label: 'Juntar resúmenes', ico: 'merge', disabled: !canJoinFail(s), run: doJoin });
    }
    if (s.phase === 'end') {
      defs.push({ id: 'reset', label: 'Reiniciar actividad', ico: 'rotate-ccw', disabled: false, run: () => askReset(true) });
    }
    const sig = defs.map((d) => `${d.id}:${d.label}:${d.disabled}`).join('|');
    if (sig !== subSig) {
      subSig = sig;
      sub.replaceChildren(...defs.map((d) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'btn btn-act';
        b.disabled = d.disabled;
        b.innerHTML = `${icon(d.ico)}<span>${esc(d.label)}</span>`;
        b.addEventListener('click', d.run);
        return b;
      }));
    }

    const main = {
      lobby: { label: 'Empezar: cada uno es el driver', to: 'solo', ico: 'arrow-right' },
      solo: { label: 'Siguiente: aparece el cluster manager', to: 'manager', ico: 'arrow-right' },
      manager: { label: 'Pedir compus al cluster manager', to: 'work', ico: 'server' },
      work: { label: 'Juntar resúmenes', to: 'combine', ico: 'merge' },
      combine: { label: 'Siguiente: se cae una compu', to: 'fail', ico: 'arrow-right' },
      fail: { label: 'Cierre', to: 'end', ico: 'arrow-right' },
      end: null,
    }[s.phase];
    mainBtn.hidden = !main;
    if (main) {
      mainBtn.innerHTML = `<span>${esc(main.label)}</span>${icon(main.ico)}`;
      mainBtn.disabled = !canGo(s, main.to);
      const ready = (s.phase === 'work' && s.manual && s.manual.total > 0 && s.manual.done >= s.manual.total)
        || (s.phase === 'solo' && s.solo && s.solo.over)
        || (s.phase === 'fail' && !s.manual);
      mainBtn.classList.toggle('is-ready', !!ready);
      mainAction = main.to;
    } else {
      mainAction = null;
    }
  }
  mainBtn.addEventListener('click', () => { if (state && mainAction && canGo(state, mainAction)) send('phase', { phase: mainAction }); });

  // ------------------------------------------------------------ render

  function render() {
    const s = state;
    if (!s) return;
    document.body.dataset.phase = s.phase;
    document.body.dataset.manual = s.manual ? 'true' : 'false';
    renderHead(s);
    const addr = (s.publicUrl || '').replace(/^https?:\/\//, '');
    $('#joinUrl').textContent = addr || '…';
    $('#lobbyUrl').innerHTML = addr ? esc(addr).replace(/:(\d+)$/, '<wbr>:$1') : '…';
    $('#overlayUrl').textContent = addr;

    renderStepper(s);
    renderRoles(s);
    renderCompus(s);
    renderSpin(s);
    renderCard(s);
    renderSolo(s);
    renderArch(s);
    renderSide(s);
    renderEnd(s);
    renderActions(s);
    if (['work', 'combine', 'fail'].includes(s.phase)) renderPlot(s);
    renderParty(s);
  }
})();
