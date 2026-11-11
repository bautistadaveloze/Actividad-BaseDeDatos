'use strict';

(() => {
  const $ = (sel, root = document) => root.querySelector(sel);

  const ORDER = ['lobby', 'paint', 'combine', 'auto', 'fail', 'end'];
  const STEPS = [
    { id: 'lobby', label: 'Unirse' },
    { id: 'paint', label: 'Pintar' },
    { id: 'combine', label: 'Juntar' },
    { id: 'auto', label: 'Repetir' },
    { id: 'fail', label: 'Se apaga una' },
    { id: 'end', label: 'Cierre' },
  ];

  // Texts come straight from presentacion-web/ACTIVIDAD.md, section 4.
  const COPY = {
    lobby: {
      title: 'Sumate con tu celular',
      lead: 'Escaneá el QR. Tu celular va a ser una de las computadoras del clúster.',
    },
    paint: {
      title: 'Paso 1 · Pintá tus puntos',
      lead: 'Cada celular recibió 6 puntos. Pintá cada uno del color del centro que le queda más cerca.',
      main: 'Los datos se repartieron. Cada compu tiene solo su parte y trabaja sin esperar a nadie.',
      tech: 'En un clúster: cada parte es una partición y pintar es la tarea (map).',
    },
    combine: {
      title: 'Paso 2 · El coordinador junta todo',
      lead: 'Con los resúmenes de todos, mueve cada centro al medio de su grupo.',
      main: 'Cada compu mandó solo cuántos puntos pintó de cada color y dónde están. Con eso alcanza para mover los centros.',
      tech: 'En un clúster: juntar es el reduce. Se mueve el cálculo, no los datos.',
    },
    auto: {
      title: 'Paso 3 · Repetir hasta que no cambie',
      lead: 'Ahora cada celular pinta solo. En cada vuelta los centros se acomodan un poco más.',
      main: 'Entrenar un modelo es esto: repetir muchas veces lo mismo sobre los mismos datos.',
      tech: 'En Spark los datos quedan en memoria; por eso cada vuelta es rápida.',
    },
    fail: {
      title: 'Paso 4 · ¿Y si se apaga una compu?',
      lead: 'Tocá una compu para apagarla. Sus puntos pasan a otra y el trabajo sigue.',
      main: '',
      tech: 'En un clúster real se rompen máquinas todos los días. El coordinador repite ese trabajo en otra: eso es tolerancia a fallos.',
    },
    end: {
      title: 'Lo que hicimos es lo que hace un clúster',
      lead: '',
    },
  };

  // Status -> icon and tone. Never color alone: every state has its own icon.
  const STATUS = {
    waiting: { icon: 'check', tone: 'ok', label: 'conectada' },
    painting: { icon: 'timer', tone: 'warn', label: 'pintando' },
    sent: { icon: 'check', tone: 'ok', label: 'envió' },
    idle: { icon: 'check', tone: 'ok', label: 'libre' },
    working: { icon: 'zap', tone: 'accent', label: 'trabajando' },
    off: { icon: 'power-off', tone: 'bad', label: 'apagada' },
    offline: { icon: 'wifi-off', tone: 'mute', label: 'sin conexión' },
  };

  const icon = (name) => `<svg class="icon" aria-hidden="true"><use href="/icons.svg#${name}"/></svg>`;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = (n) => String(n).padStart(2, '0');
  const nf = new Intl.NumberFormat('es-AR');
  const plural = (n, one, many) => `${nf.format(n)} ${n === 1 ? one : many}`;

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
    socket = io({ auth: { role: 'driver', key } });
    socket.on('auth:error', (msg) => { socket.close(); showAuth(msg); });
    socket.on('connect', () => { $('#conn').hidden = true; });
    socket.on('disconnect', () => { $('#conn').hidden = false; });
    socket.on('state', (s) => { state = s; render(); });
  }

  const send = (event, payload) => socket && socket.emit(event, payload);

  if (key) connect();
  else showAuth();

  // ------------------------------------------------------------ rules

  const connectedCount = (s) => s.phones.filter((p) => p.status !== 'offline').length;
  const liveCount = (s) => s.phones.filter((p) => p.status !== 'offline' && p.status !== 'off').length;

  // Phase changes the server accepts (ACTIVIDAD.md 6.3): lobby -> paint needs a
  // phone, paint -> combine needs a submitted phone, and from combine on you
  // can move freely among combine, auto, fail and end.
  function canGo(s, id) {
    if (!s || id === s.phase) return false;
    if (s.phase === 'lobby') return id === 'paint' && connectedCount(s) > 0;
    if (s.phase === 'paint') return id === 'combine' && s.progress.done > 0;
    return ORDER.indexOf(id) >= ORDER.indexOf('combine');
  }

  function go(delta) {
    if (!state) return;
    const target = ORDER[ORDER.indexOf(state.phase) + delta];
    if (target && canGo(state, target)) send('phase', { phase: target });
  }

  // In `fail` a round is allowed after convergence: it shows the work goes on without the lost phone.
  const canRound = (s) => !s.busy && (s.phase === 'fail' || (s.phase === 'auto' && !s.converged));
  const canKill = (s) => s.phase === 'fail' && liveCount(s) > 1;

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

  const toggleRun = () => { if (state && (state.phase === 'auto' || state.phase === 'fail') && (state.running || !state.converged)) send('run', { on: !state.running }); };
  const doRound = () => { if (state && canRound(state)) send('round'); };
  const doKill = () => { if (state && canKill(state)) send('kill', {}); };

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target instanceof HTMLInputElement) return;
    if (e.key === 'Escape') { toggleQr(false); askReset(false); return; }
    if (!confirmBox.hidden) return; // the dialog owns the keyboard while open
    const k = e.key.toLowerCase();
    if (e.key === 'ArrowRight') go(1);
    else if (e.key === 'ArrowLeft') go(-1);
    else if (e.key === ' ' || k === 'r') { e.preventDefault(); doRound(); }
    else if (k === 's') toggleRun();
    else if (k === 'k') doKill();
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
    return { g, line: mk('polyline', {}, g), dots: mk('g', {}, g), len: -1 };
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
      }
      if (el.label !== pt.label) {
        const first = el.label === null;
        el.body.replaceChildren(shape(pt.label, false));
        if (!first) {
          // Replay the pop animation, with a small random delay so a whole
          // phone's points do not all flash on the same frame.
          el.body.classList.remove('pop');
          el.body.style.animationDelay = `${Math.floor(Math.random() * 260)}ms`;
          void el.body.getBoundingClientRect();
          el.body.classList.add('pop');
        }
        el.label = pt.label;
      }
      const ringOn = showRings && pt.owner !== pt.home;
      if (ringOn !== el.ringOn) {
        el.ring.setAttribute('visibility', ringOn ? 'visible' : 'hidden');
        el.ringOn = ringOn;
      }
    });

    s.centers.forEach((c, k) => {
      const g = centerEls[k];
      g.style.transform = `translate(${c.x}px, ${sy(c.y)}px)`;
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
  const tiles = new Map(); // id -> { el, sig }

  function renderCompus(s) {
    $('#compusCount').textContent = String(connectedCount(s));
    const n = s.phones.length;
    grid.dataset.size = n <= 12 ? 'm' : n <= 28 ? 's' : n <= 48 ? 'xs' : 'xxs';
    const seen = new Set();
    const clickable = s.phase === 'fail';
    s.phones.forEach((p, idx) => {
      seen.add(p.id);
      let t = tiles.get(p.id);
      if (!t) {
        const el = document.createElement('button');
        el.type = 'button';
        el.setAttribute('role', 'listitem');
        el.innerHTML = `<span class="t-ico"></span><span class="t-num mono"></span><span class="t-name"></span><span class="t-inh mono"></span>`;
        el.querySelector('.t-num').textContent = pad(p.id);
        el.addEventListener('click', () => {
          if (state && state.phase === 'fail' && el.dataset.status !== 'off' && el.dataset.status !== 'offline') send('kill', { id: p.id });
        });
        t = { el, sig: '' };
        tiles.set(p.id, t);
      }
      const sig = `${p.name}|${p.status}|${p.inherited}|${clickable}|${canKill(s)}`;
      if (t.sig !== sig) {
        t.sig = sig;
        const st = STATUS[p.status] || STATUS.idle;
        const el = t.el;
        el.className = `tile tone-${st.tone}`;
        el.dataset.status = p.status;
        el.disabled = !(clickable && p.status !== 'off' && p.status !== 'offline' && canKill(s));
        el.classList.toggle('is-tappable', !el.disabled);
        el.querySelector('.t-ico').innerHTML = icon(st.icon);
        el.querySelector('.t-name').textContent = p.name;
        el.querySelector('.t-inh').textContent = p.inherited > 0 ? `+${p.inherited}` : '';
        el.title = `Compu ${pad(p.id)} · ${p.name} · ${st.label}`;
        el.setAttribute('aria-label', `Compu ${pad(p.id)}, ${p.name}, ${st.label}${p.inherited ? `, heredó ${p.inherited} puntos` : ''}${clickable && !el.disabled ? '. Tocar para apagar' : ''}`);
      }
      if (grid.children[idx] !== t.el) grid.insertBefore(t.el, grid.children[idx] || null);
    });
    for (const [id, t] of tiles) {
      if (!seen.has(id)) { t.el.remove(); tiles.delete(id); }
    }
  }

  // ------------------------------------------------------------ rail & stage

  const views = document.querySelectorAll('[data-view]');
  let shownPhase = null;

  function renderHead(s) {
    const copy = COPY[s.phase];
    $('#title').textContent = copy.title;
    $('#lead').textContent = copy.lead;
    $('#lead').hidden = !copy.lead;
    const head = $('#stageHead');
    head.classList.remove('enter');
    void head.offsetWidth;
    head.classList.add('enter');
    const viewName = s.phase === 'lobby' ? 'lobby' : s.phase === 'end' ? 'end' : 'plot';
    views.forEach((v) => { v.hidden = v.dataset.view !== viewName; });
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

  function renderExtras(s) {
    // paint: how many phones are done
    const paint = s.phase === 'paint';
    $('#progressBlock').hidden = !paint;
    if (paint) {
      const { done, total } = s.progress;
      $('#progressText').textContent = `Listos: ${done} de ${total}`;
      $('#progressBar').style.width = total ? `${Math.round((100 * done) / total)}%` : '0%';
    }

    // auto: round counter and bars
    const auto = s.phase === 'auto';
    $('#roundBlock').hidden = !auto;
    if (auto) {
      $('#roundLabel').textContent = `Vuelta ${s.round}`;
      $('#roundBusy').textContent = s.busy ? `Pintando: ${s.progress.done} de ${s.progress.total}` : (s.converged ? 'Terminamos' : '');
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

    // fail: what happened to the last phone
    const lf = s.phase === 'fail' && s.lastFail;
    $('#failCard').hidden = !lf;
    if (lf) {
      $('#failText').innerHTML = `Se apagó la compu de <strong>${esc(lf.victim)}</strong>. `
        + `${lf.points === 1 ? 'Su punto ahora lo pinta' : `Sus ${nf.format(lf.points)} puntos ahora los pinta`} <strong>${esc(lf.heir)}</strong>. `
        + 'No se perdió nada.';
    }

    // combine: the highlighted fact, next to the drawing
    const stat = $('#stat');
    stat.hidden = s.phase !== 'combine';
    if (!stat.hidden) {
      stat.innerHTML = `Por la red viajaron <strong>${plural(s.stats.summaries, 'resumen', 'resúmenes')}</strong>, no <strong>${plural(s.stats.points, 'punto', 'puntos')}</strong>.`;
    }

    $('#doneBanner').hidden = !(auto && s.converged);

    if (s.phase === 'end') {
      $('#endNums').textContent = `${plural(s.stats.phones, 'compu', 'compus')} · ${plural(s.stats.points, 'punto', 'puntos')} · ${plural(s.round, 'vuelta', 'vueltas')}`;
    }
  }

  // Buttons are rebuilt only when their set or labels change, so a click is never
  // lost to a re-render in the middle of a press.
  const sub = $('#actionsSub');
  const mainBtn = $('#mainBtn');
  let subSig = '';
  let mainAction = null;

  function renderActions(s) {
    const defs = [];
    if (s.phase === 'auto' || s.phase === 'fail') {
      if (s.phase === 'fail') {
        defs.push({ id: 'kill', label: 'Apagar una al azar', ico: 'power-off', disabled: !canKill(s), run: doKill });
      }
      defs.push({ id: 'round', label: 'Otra vuelta', ico: 'rotate-ccw', disabled: !canRound(s), run: doRound });
      if (s.phase === 'auto') {
        defs.push(s.running
          ? { id: 'run', label: 'Pausar', ico: 'pause', disabled: false, run: toggleRun }
          : { id: 'run', label: 'Seguir solo', ico: 'play', disabled: s.converged, run: toggleRun });
      }
      if (s.phase === 'fail') {
        const anyOff = s.phones.some((p) => p.status === 'off') || !!s.lastFail;
        defs.push({ id: 'revive', label: 'Prender todas', ico: 'power', disabled: !anyOff, run: () => send('revive') });
      }
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
      lobby: { label: 'Empezar: repartir los puntos', to: 'paint', ico: 'arrow-right' },
      paint: { label: 'Juntar los resultados', to: 'combine', ico: 'arrow-right' },
      combine: { label: 'Repetir', to: 'auto', ico: 'repeat' },
      auto: { label: 'Siguiente: apagar una compu', to: 'fail', ico: 'arrow-right' },
      fail: { label: 'Cierre', to: 'end', ico: 'arrow-right' },
      end: null,
    }[s.phase];
    mainBtn.hidden = !main;
    if (main) {
      mainBtn.innerHTML = `<span>${esc(main.label)}</span>${icon(main.ico)}`;
      mainBtn.disabled = !canGo(s, main.to);
      mainBtn.classList.toggle('is-ready', s.phase === 'paint' && s.progress.total > 0 && s.progress.done >= s.progress.total);
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
    if (s.phase !== shownPhase) {
      shownPhase = s.phase;
      document.body.dataset.phase = s.phase;
      renderHead(s);
    }
    const addr = (s.publicUrl || '').replace(/^https?:\/\//, '');
    $('#joinUrl').textContent = addr || '…';
    $('#lobbyUrl').innerHTML = addr ? esc(addr).replace(/:(\d+)$/, '<wbr>:$1') : '…';
    $('#overlayUrl').textContent = addr;

    renderStepper(s);
    renderCompus(s);
    renderCard(s);
    renderExtras(s);
    renderActions(s);
    if (s.phase !== 'lobby' && s.phase !== 'end') renderPlot(s);
  }
})();
