'use strict';

// Phone screen: one view per moment of the class, one action per view.
// The phone first plays the driver alone, then the cluster manager signs it
// up and it works as a worker (or, for one person, as the driver).
(() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const NAMES = ['Violeta', 'Celeste', 'Rosa'];
  const KM = window.KM;

  const icon = (name) => `<svg class="icon" aria-hidden="true"><use href="/icons.svg#${name}"/></svg>`;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = (n) => String(n).padStart(2, '0');
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const swatch = (j) => `<i class="shape shape-${j}"></i>`;

  const safe = {
    get(area, k) { try { return window[area].getItem(k); } catch { return null; } },
    set(area, k, v) { try { window[area].setItem(k, v); } catch { /* private mode */ } },
  };

  const newToken = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`);

  // ?nombre=Ana joins straight away. The token then lives in sessionStorage so
  // each tab is a different computer (handy to rehearse with several tabs).
  const params = new URLSearchParams(location.search);
  const urlName = (params.get('nombre') || '').trim().slice(0, 16);
  const tabMode = urlName !== '';
  const tokenArea = tabMode ? 'sessionStorage' : 'localStorage';
  let token = safe.get(tokenArea, 'worker-token');
  if (!token) { token = newToken(); safe.set(tokenArea, 'worker-token', token); }
  let name = urlName || safe.get('localStorage', 'worker-name') || '';
  let joined = tabMode || safe.get('localStorage', 'worker-joined') === '1';

  const screen = $('#screen');
  let socket = null;
  let state = null;
  let viewKey = null;
  let hintTimer = null;
  let lastPainted = -1; // index that just got painted, for the pop animation

  // How to play: a few practice points that do not count. One per center,
  // each far closer to one center than to the others.
  const PRACTICE = [{ x: 74, y: 76 }, { x: 14, y: 62 }, { x: 66, y: 16 }];
  let practiceDone = 0;

  // Step 2: the driver alone with every point.
  const solo = { seed: null, points: [], done: 0, endsAt: null };

  // Steps 4 and 6: painting a part by hand.
  const sentLocal = new Set(); // `${dataKey}:${part}` already submitted from here

  // Game layer
  let prevConverged = null;
  let celebrating = false;
  let seenFailN = null;
  const MEDALS = {
    driver: ['crown', 'Fuiste el driver'],
    top: ['trophy', 'Pintaste más que nadie solo'],
    heir: ['heart-handshake', 'Hiciste el trabajo de otra compu'],
    fallen: ['power-off', 'Se cayó tu compu y no se perdió nada'],
    survivor: ['shield-check', 'Sobreviviste a la ruleta'],
    worker: ['smartphone', 'Fuiste un worker del clúster'],
    cluster: ['users', 'Parte del clúster'],
  };

  // Automatic task (step 5): { round, ms, status: 'working' | 'done' }
  let taskUi = null;
  let taskTimer = null;

  // ------------------------------------------------------------ connection

  function connect() {
    if (socket) return;
    socket = io({ auth: (cb) => cb({ role: 'worker', token, name }) });
    socket.on('connect', () => setConn(true));
    socket.on('disconnect', () => setConn(false));
    socket.on('connect_error', () => setConn(false));
    socket.on('state', (s) => { state = s; onState(); });
    socket.on('task', onTask);
    socket.on('join:error', (msg) => {
      banner('bad', 'circle-alert', esc(msg), 8000);
      joined = false;
      socket = null;
      state = null;
      safe.set('localStorage', 'worker-joined', '0');
      render();
    });
  }

  const emit = (event, payload) => { if (socket) socket.emit(event, payload); };

  function setConn(on) {
    const el = $('#conn');
    el.dataset.state = on ? 'on' : 'off';
    el.lastElementChild.textContent = on ? 'Conectado' : 'Reconectando';
  }

  let wakeLock = null;
  async function keepAwake() {
    if (!('wakeLock' in navigator) || document.visibilityState !== 'visible' || wakeLock) return;
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } catch { /* not allowed: the note on screen covers it */ }
  }
  document.addEventListener('visibilitychange', () => { if (joined) keepAwake(); });
  document.addEventListener('click', () => { if (joined) keepAwake(); });

  function banner(kind, iconName, html, ms = 6000) {
    const el = document.createElement('div');
    el.className = `banner ${kind}`;
    el.innerHTML = `${icon(iconName)}<p>${html}</p>`;
    $('#banners').prepend(el);
    setTimeout(() => {
      el.classList.add('out');
      el.addEventListener('animationend', () => el.remove(), { once: true });
    }, ms);
  }

  const vibrate = (pattern) => { if (navigator.vibrate) try { navigator.vibrate(pattern); } catch { /* ignore */ } };

  // ------------------------------------------------------------ times (es-AR)

  const comma = (n) => n.toFixed(1).replace('.', ',');
  function fmtMs(ms) {
    if (ms < 60000) return `${comma(ms / 1000)} s`;
    const s = Math.round(ms / 1000);
    return `${Math.floor(s / 60)} min ${pad(s % 60)} s`;
  }
  function fmtAbout(ms) {
    if (ms < 90000) return `unos ${Math.max(5, Math.round(ms / 5000) * 5)} segundos`;
    return `unos ${Math.max(2, Math.round(ms / 60000))} minutos`;
  }

  // ------------------------------------------------------------ solo (step 2)

  const soloLeft = () => (solo.endsAt === null ? 0 : Math.max(0, solo.endsAt - Date.now()));
  const soloFinished = () => !state.solo || state.solo.over || soloLeft() <= 0 || solo.done >= solo.points.length;

  function syncSolo() {
    const s = state.solo;
    if (!s) return;
    if (s.seed !== solo.seed) {
      solo.seed = s.seed;
      solo.points = KM.soloPoints(s.seed, s.total);
      const saved = Number(safe.get('sessionStorage', `solo:${s.seed}`));
      solo.done = Math.max(Number.isInteger(saved) ? saved : 0, state.me.soloDone || 0);
      solo.endsAt = null;
    }
    // The server sends what is left; keep a local end time unless it drifts.
    const end = s.over ? Date.now() : Date.now() + s.remainingMs;
    if (solo.endsAt === null || Math.abs(end - solo.endsAt) > 600 || s.over) solo.endsAt = end;
  }

  function tickClock() {
    const el = document.getElementById('clock');
    if (el) {
      const s = Math.ceil(soloLeft() / 1000);
      const text = `0:${pad(s)}`;
      if (el.textContent !== text) el.textContent = text;
      el.classList.toggle('is-low', s <= 5);
    }
    if (viewKey === 'solo' && state && soloFinished()) render();
  }
  setInterval(tickClock, 200);

  // ------------------------------------------------------------ parts (steps 4 and 6)

  const partKey = (part) => `${state.dataKey}:${part.id}`;
  const paintedOf = (part) => {
    const n = Number(safe.get('sessionStorage', `part:${partKey(part)}`));
    return Number.isInteger(n) && n > 0 ? Math.min(n, part.points.length) : 0;
  };
  const isSent = (part) => part.sent || sentLocal.has(partKey(part));
  // The part to paint now: own part first, then the inherited ones.
  const currentPart = () => (state.manual ? state.parts.find((part) => !isSent(part)) : null) || null;
  const correctOf = (p) => KM.nearest(p, state.centers);
  const driverName = () => (state.driver ? state.driver.name : 'el driver');
  const toDriver = () => (state.driver ? esc(state.driver.name) : 'al driver');

  // ------------------------------------------------------------ automatic task (step 5)

  function onTask({ round, centers }) {
    if (!state || state.me.off) return;
    const points = state.parts.flatMap((part) => part.points);
    const sums = KM.partialSums(points, centers);
    const ms = 400 + Math.round(Math.random() * 500);
    taskUi = { round, ms, status: 'working' };
    render();
    clearTimeout(taskTimer);
    taskTimer = setTimeout(() => {
      // A phone switched off in the meantime stays silent.
      if (state && state.me.off) { taskUi = null; render(); return; }
      emit('task:result', { round, sums });
      taskUi = { round, ms, status: 'done' };
      render();
    }, ms);
  }

  // ------------------------------------------------------------ state

  function onState() {
    const { me } = state;
    $('#barTitle').textContent = `Compu ${pad(me.id)} · ${me.name}`;
    const role = $('#barRole');
    const roleText = me.role === 'driver' ? 'Driver' : me.role === 'worker' ? 'Worker' : state.phase === 'solo' ? 'Driver' : '';
    role.textContent = roleText;
    role.hidden = !roleText;
    role.dataset.role = me.role;
    document.title = `Compu ${pad(me.id)} · Clúster`;
    if (state.phase === 'solo') syncSolo();
    if (state.phase !== 'howto') practiceDone = 0;
    if (state.phase !== 'combine') taskUi = null;
    reactToGame();
    if (me.off) { clearTimeout(taskTimer); taskUi = null; }
    render();
  }

  // Party and falls: each fires once per change, never on reconnect.
  function reactToGame() {
    const { lastFail, converged, me } = state;

    if (prevConverged === false && converged) {
      celebrating = true;
      vibrate([80, 60, 80, 60, 200]);
    }
    if (!converged) celebrating = false;
    prevConverged = converged;

    const n = lastFail ? lastFail.n : 0;
    if (seenFailN === null) {
      const saved = safe.get('sessionStorage', 'fail-n');
      seenFailN = saved === null ? n : Number(saved);
      if (saved === null) safe.set('sessionStorage', 'fail-n', String(n));
    }
    if (n === seenFailN) return;
    seenFailN = n;
    safe.set('sessionStorage', 'fail-n', String(n));
    if (!lastFail) return;
    $('#banners').replaceChildren();
    const who = esc(lastFail.victim);
    const heir = esc(lastFail.heir);
    if (lastFail.me === 'victim') {
      vibrate([200, 80, 200]);
    } else if (lastFail.me === 'heir') {
      vibrate([60, 40, 60]);
      banner('ok', 'heart-handshake', `Te llegó trabajo extra: se cayó la compu de ${who} y su parte ahora la hacés vos.`, 8000);
    } else if (me.role === 'driver') {
      vibrate([60, 40, 60]); // the inbox view says what happened, in place
    } else if (!me.off) {
      const lead = lastFail.cause === 'spin' ? '¡Te salvaste! ' : '';
      banner('ok', 'shield-check', `${lead}Se cayó la compu de ${who}. Su parte la hace ${heir}.`, 6000);
    }
  }

  function currentView() {
    if (!joined) return 'join';
    if (!state) return 'connecting';
    const { me, phase } = state;
    if (phase === 'end') return 'end';
    if (me.off) return 'off';
    if (state.spin) return 'spin';
    if (phase === 'lobby') return 'lobby';
    if (phase === 'howto') return practiceDone >= PRACTICE.length ? 'howtoReady' : 'howto';
    if (phase === 'solo') return soloFinished() ? 'soloOver' : 'solo';
    if (me.role === 'driver') {
      if (phase === 'manager') return 'driverAsk';
      if (phase === 'combine') return 'driverCombine';
      return state.manual ? 'driverInbox' : 'driverDone';
    }
    // The cluster manager signs every phone up by itself; this lasts an instant.
    if (!me.registered) return 'connecting';
    if (phase === 'manager') return 'assigned';
    if (phase === 'combine') return 'combine';
    if (!state.manual) return 'failDone';
    if (!state.parts.length) return 'idle';
    const part = currentPart();
    if (!part) return 'sent';
    return paintedOf(part) >= part.points.length ? 'ready' : 'paint';
  }

  function render() {
    const view = currentView();
    const changed = view !== viewKey;
    if (changed && view === 'end') $('#banners').replaceChildren();
    if (changed) lastPainted = -1;
    if (changed && view === 'assigned' && viewKey !== null) vibrate([60, 40, 60]); // "you are a worker"
    viewKey = view;
    document.body.dataset.view = view;
    const html = VIEWS[view]();
    if (screen._html !== html) {
      screen.innerHTML = html;
      screen._html = html;
    }
    screen.classList.toggle('no-dock', !screen.querySelector('.dock'));
    if (changed) {
      screen.style.animation = 'none';
      void screen.offsetWidth;
      screen.style.animation = '';
      window.scrollTo({ top: 0 });
    }
    tickClock();
  }

  // ------------------------------------------------------------ drawing

  function shapeSvg(kind, x, y, r, cls) {
    if (kind === 0) return `<circle class="${cls}" cx="${x}" cy="${y}" r="${r}"/>`;
    if (kind === 1) { const s = r * 0.9; return `<rect class="${cls}" x="${x - s}" y="${y - s}" width="${s * 2}" height="${s * 2}" rx="0.6"/>`; }
    const R = r * 1.3;
    return `<polygon class="${cls}" points="${x},${y - R} ${x + R * 0.866},${y + R * 0.5} ${x - R * 0.866},${y + R * 0.5}"/>`;
  }

  // labelOf(i, point) returns the group (0..2) or -1 for an unpainted point.
  // `size` shrinks the dots when there are many (the driver alone has hundreds).
  function plotSvg({ pts, labelOf, current = -1, pop = -1, size = 1, label = 'Tus puntos y los tres centros' }) {
    const grid = [25, 50, 75].map((v) => `<line class="grid" x1="${v}" x2="${v}" y1="0" y2="100"/><line class="grid" x1="0" x2="100" y1="${v}" y2="${v}"/>`).join('');
    const centers = state.centers.map((c, j) => shapeSvg(j, c.x, 100 - c.y, 5.6, `center c-${j}`)).join('');
    const dots = pts.map((p, i) => {
      if (i === current) return '';
      const l = labelOf(i, p);
      const cls = `pt${i === pop ? ' pop' : ''}`;
      return l >= 0
        ? shapeSvg(l, p.x, 100 - p.y, 3.9 * size, `${cls} c-${l}`)
        : `<circle class="${cls} pt-empty" cx="${p.x}" cy="${100 - p.y}" r="${3.7 * size}"/>`;
    }).join('');
    // The current point goes last so nothing covers it.
    const cur = pts[current];
    const now = cur
      ? `<circle class="pt pt-empty pt-current" cx="${cur.x}" cy="${100 - cur.y}" r="3.9"/><circle class="ring" cx="${cur.x}" cy="${100 - cur.y}" r="8"/>`
      : '';
    return `<svg class="plot" viewBox="-6 -6 112 112" role="img" aria-label="${label}">
      <rect class="frame" x="-5" y="-5" width="110" height="110" rx="3"/>${grid}${dots}${centers}${now}</svg>`;
  }

  const labeledPlot = (pts) => plotSvg({ pts, labelOf: (i, p) => (p.label >= 0 ? p.label : correctOf(p)) });
  const allMyPoints = () => state.parts.flatMap((part) => part.points);

  function countsHtml(counts) {
    return `<div class="counts">${counts.map((c, j) => `<span class="count">${swatch(j)}<b>${NAMES[j]}</b><span class="mono">${c}</span></span>`).join('')}</div>`;
  }

  function miniCounts(counts) {
    return `<span class="mini-counts">${counts.map((c, j) => `<span>${swatch(j)}<span class="mono">${c}</span></span>`).join('')}</span>`;
  }

  function compareHtml() {
    const j = state.join;
    if (!j || j.parallelMs == null) return '';
    return `<p class="compare">${icon('timer')}<span>Con el clúster tardaron <b>${fmtMs(j.parallelMs)}</b>. Un driver solo habría tardado <b>${fmtAbout(j.soloMs)}</b>.</span></p>`;
  }

  const eyebrow = (text, ico = 'smartphone') => `<p class="eyebrow">${icon(ico)}<span>${text}</span></p>`;
  const waiting = (text) => `<div class="waiting"><span class="pulse"></span><span>${text}</span></div>`;
  const dock = (inner) => `<div class="dock"><div class="dock-inner">${inner}</div></div>`;
  const soloSecs = () => Math.round((state.soloMs || 20000) / 1000);
  const picks = () => `<p class="hint" id="hint" aria-live="polite"></p>
    <div class="picks">${NAMES.map((nm, j) => `<button class="pick" type="button" data-pick="${j}">${swatch(j)}<span>${nm}</span></button>`).join('')}</div>`;

  // ------------------------------------------------------------ views

  const VIEWS = {
    join() {
      return `
        <form class="join" id="joinForm">
          <div class="stack">
            <h1>Sumate al clúster</h1>
            <p class="lead">Tu celular va a ser una computadora del clúster.</p>
          </div>
          <div class="field">
            <label for="name">Tu nombre</label>
            <input id="name" name="name" maxlength="16" autocomplete="nickname" autocapitalize="words" value="${esc(name)}" required>
          </div>
          <button class="btn btn-primary btn-lg btn-block" type="submit">Entrar</button>
          <p class="note">${icon('circle-alert')}<span>Dejá la pantalla prendida y esta pestaña abierta.</span></p>
        </form>`;
    },

    connecting() {
      return waiting('Conectando…');
    },

    lobby() {
      const { me } = state;
      return `
        <div class="ident">
          <p class="ident-top">Sos la compu</p>
          <div class="ident-id mono">${pad(me.id)}</div>
          <div class="ident-name">${esc(me.name)}</div>
        </div>
        ${waiting('Esperá: ya arrancamos.')}
        <p class="note">${icon('circle-alert')}<span>Dejá la pantalla prendida y esta pestaña abierta.</span></p>`;
    },

    // ---------------- how to play: practice, then wait for the clock

    howto() {
      const i = practiceDone;
      const dots = PRACTICE.map((_, k) => `<i class="pdot${k < i ? ' on' : ''}${k === i ? ' now' : ''}"></i>`).join('');
      return `
        ${eyebrow('Práctica: no cuenta', 'hand')}
        <div class="head">
          <h1>Cómo se juega</h1>
          <div class="pdots" aria-hidden="true">${dots}</div>
        </div>
        <p class="ask">Tocá el color del <b>centro</b> que le queda más cerca al punto que titila.</p>
        ${plotSvg({ pts: PRACTICE, labelOf: (k, p) => (k < i ? correctOf(p) : -1), current: i, pop: lastPainted, label: 'Punto de práctica y los tres centros' })}
        ${dock(picks())}`;
    },

    howtoReady() {
      return `
        <div class="result">
          <div class="result-icon ok">${icon('check')}</div>
          <h1>¡Ya sabés jugar!</h1>
          <p class="lead">Cuando arranque vas a ser <b>el driver</b>: vas a tener todos los puntos y ${soloSecs()} segundos. Pintá todos los que puedas.</p>
        </div>
        ${labeledPlot(PRACTICE.map((p) => ({ ...p, label: -1 })))}
        ${waiting('Esperá: el reloj arranca desde el proyector.')}`;
    },

    // ---------------- step 2: the driver alone

    solo() {
      const total = solo.points.length;
      const i = solo.done;
      const pct = Math.round((100 * i) / Math.max(1, total));
      return `
        <div class="head">
          <h1>Sos el driver</h1>
          <span class="clock countdown mono" id="clock" role="timer" aria-live="off">0:00</span>
        </div>
        <p class="lead">Tenés <b>todos</b> los datos y nadie te ayuda. Pintá todos los puntos que puedas.</p>
        <div class="meter-row"><span>Punto <b class="mono">${i + 1}</b> de <span class="mono">${total}</span></span>
          <div class="meter" aria-hidden="true"><i style="width:${pct}%"></i></div></div>
        ${plotSvg({ pts: solo.points, labelOf: (k, p) => (k < i ? correctOf(p) : -1), current: i, pop: lastPainted, size: 0.42, label: 'Todos los puntos y los tres centros' })}
        ${dock(picks())}`;
    },

    soloOver() {
      const total = solo.points.length || (state.solo && state.solo.total) || 0;
      const done = Math.max(solo.done, state.me.soloDone || 0);
      const all = done >= total && total > 0;
      const dur = (state.solo && state.solo.durationMs) || 20000;
      const myEstimate = done >= 3 ? Math.round((dur / done) * total) : null;
      const top = state.me.top
        ? `<div class="podium">${icon('crown')}<span>¡Pintaste más que nadie! Vas a ser el driver del clúster.</span></div>`
        : state.solo && state.solo.over && state.solo.top
          ? `<p class="note">${icon('trophy')}<span>La que más pintó fue la compu de <b>${esc(state.solo.top)}</b>.</span></p>` : '';
      return `
        <div class="result">
          <div class="result-icon warn">${icon('hourglass')}</div>
          <h1>${all ? '¡Pintaste todo!' : '¡Tiempo!'}</h1>
          <p class="lead">Pintaste <b>${done}</b> de ${total} puntos.${all ? '' : ` Te faltaron <b>${total - done}</b>.`}</p>
        </div>
        ${myEstimate && !all ? `<p class="compare">${icon('timer')}<span>A tu ritmo, para pintar los ${total} solo tardarías <b>${fmtAbout(myEstimate)}</b>.</span></p>` : ''}
        ${top}
        ${waiting('Mirá el proyector.')}`;
    },

    // ---------------- step 3: the cluster manager

    assigned() {
      const d = state.driver ? `<b>${esc(state.driver.name)}</b> es el driver` : 'El driver';
      return `
        <div class="stack">
          ${eyebrow('Apareció el cluster manager', 'server')}
          <h1>Vas a ser un worker</h1>
          <p class="lead">${d} y solo no llega. El cluster manager vio que tu compu está libre y te anotó para ayudarlo.</p>
        </div>
        <div class="arch-mini" aria-hidden="true">
          <span class="node">${icon('crown')}Driver</span><span class="arr">${icon('arrow-right')}</span>
          <span class="node">${icon('server')}Cluster manager</span><span class="arr">${icon('arrow-right')}</span>
          <span class="node hl">${icon('smartphone')}Vos: worker</span>
        </div>
        ${waiting(`Esperá: ${esc(driverName())} le va a pedir compus al cluster manager.`)}`;
    },

    driverAsk() {
      const n = state.workers;
      return `
        <div class="stack">
          ${eyebrow(state.me.top ? 'Pintaste más que nadie' : 'Te eligieron', 'crown')}
          <h1>Sos el driver</h1>
          <p class="lead">Tenés todos los datos y solo no llegás. Pedile compus al cluster manager.</p>
        </div>
        <div class="big-count"><b class="mono">${n}</b><span>${n === 1 ? 'compu libre anotada' : 'compus libres anotadas'} como ${n === 1 ? 'worker' : 'workers'}</span></div>
        ${dock(`${n ? '' : '<p class="dock-note">Esperá a que se conecten compus.</p>'}
          <button class="btn btn-primary btn-lg btn-block cta" type="button" data-ask ${n ? '' : 'disabled'}>${icon('server')}Pedir compus al cluster manager</button>`)}`;
    },

    // ---------------- steps 4 and 6: a worker paints its part

    paint() {
      const part = currentPart();
      const pts = part.points;
      const painted = paintedOf(part);
      const dots = pts.map((_, i) => `<i class="pdot${i < painted ? ' on' : ''}${i === painted ? ' now' : ''}"></i>`).join('');
      const round = state.manual.round > 1 ? `Vuelta ${state.manual.round} · ` : '';
      const top = part.from
        ? `<p class="inherit-chip">${icon('heart-handshake')}<span>Parte de <b>${esc(part.from)}</b>: se cayó su compu</span></p>`
        : eyebrow(`${round}Sos un worker: pintá tu parte`);
      return `
        ${top}
        <div class="head">
          <h1>Punto ${painted + 1} de ${pts.length}</h1>
          <div class="pdots" aria-hidden="true">${dots}</div>
        </div>
        <p class="ask">¿Qué centro le queda más cerca al punto que titila?</p>
        ${plotSvg({ pts, labelOf: (i, p) => (i < painted ? correctOf(p) : -1), current: painted, pop: lastPainted })}
        ${dock(picks())}`;
    },

    ready() {
      const part = currentPart();
      const counts = KM.countsOf(part.points, state.centers);
      return `
        <div class="stack">
          <h1>${part.from ? `Pintaste la parte de ${esc(part.from)}` : 'Pintaste tu parte'}</h1>
          ${countsHtml(counts)}
          <p class="lead">Este es tu <b>resumen</b>: cuántos puntos hay de cada color. Es lo único que viaja ${state.driver ? `a ${esc(state.driver.name)}` : 'al driver'}, no tus puntos.</p>
        </div>
        ${plotSvg({ pts: part.points, labelOf: (i, p) => correctOf(p) })}
        ${dock(`<button class="btn btn-primary btn-lg btn-block cta" type="button" data-send="${part.id}">${icon('send')}Enviar resumen ${state.driver ? `a ${esc(state.driver.name)}` : 'al driver'}</button>`)}`;
    },

    sent() {
      return `
        <div class="result">
          <div class="result-icon ok">${icon('check')}</div>
          <h1>Resumen enviado</h1>
          <p class="lead">${esc(driverName())} lo junta con los resúmenes de las demás compus. Mirá el proyector.</p>
        </div>
        ${labeledPlot(allMyPoints())}`;
    },

    idle() {
      const lost = state.me.lostTo;
      return `
        <div class="result">
          <div class="result-icon">${icon(lost ? 'wifi-off' : 'smartphone')}</div>
          <h1>${lost ? 'Se cortó tu conexión' : 'Tu compu está libre'}</h1>
          <p class="lead">${lost ? `Mientras no estabas, tu parte la hizo ${esc(lost)}. No se perdió nada.` : 'Esperá la próxima tarea.'}</p>
        </div>
        ${waiting('Mirá el proyector.')}`;
    },

    // ---------------- step 4 and 6: the driver collects summaries

    driverInbox() {
      const { done, total } = state.progress;
      const all = total > 0 && done >= total;
      const round = state.manual.round > 1 ? ` · vuelta ${state.manual.round}` : '';
      const items = (state.inbox || []).slice().reverse().map((e) => `<li>
          <span class="in-name">${esc(e.by)}${e.from !== e.by ? `<small>hizo la parte de ${esc(e.from)}</small>` : ''}</span>
          ${miniCounts(e.counts)}</li>`).join('');
      return `
        <div class="stack">
          ${eyebrow(`Sos el driver${round}`, 'crown')}
          <h1>Llegaron ${done} de ${total} resúmenes</h1>
          <div class="meter" aria-hidden="true"><i style="width:${Math.round((100 * done) / Math.max(1, total))}%"></i></div>
        </div>
        ${state.lastFail ? `<p class="note warn">${icon('power-off')}<span>Se cayó la compu de <b>${esc(state.lastFail.victim)}</b>. El cluster manager le pasó su parte a <b>${esc(state.lastFail.heir)}</b>.</span></p>` : ''}
        ${items ? `<ul class="inbox">${items}</ul>` : waiting('Repartiste los datos. Esperá los resúmenes de los workers.')}
        ${dock(`${all ? '' : `<p class="dock-note">Faltan ${plural(total - done, 'resumen', 'resúmenes')}.</p>`}
          <button class="btn btn-primary btn-lg btn-block cta" type="button" data-join ${all ? '' : 'disabled'}>${icon('merge')}Juntar resúmenes</button>`)}`;
    },

    driverCombine() {
      const t = state.totals || [0, 0, 0];
      let action;
      if (state.converged) action = '';
      else if (state.running) action = `<button class="btn btn-lg btn-block cta" type="button" data-run="0">${icon('pause')}Pausar</button>`;
      else action = `<button class="btn btn-primary btn-lg btn-block cta" type="button" data-run="1">${icon('repeat')}Repetir solo hasta que no cambie</button>`;
      const head = state.converged
        ? `<div class="result${celebrating ? ' party' : ''}"><div class="result-icon ok">${icon(celebrating ? 'party-popper' : 'check')}</div><h1>Terminamos</h1><p class="lead">Los centros ya no se mueven: el modelo está entrenado.</p></div>`
        : `<div class="stack">${eyebrow('Sos el driver', 'crown')}<h1>${state.round > 1 ? `Vuelta ${state.round}` : 'Juntaste los resúmenes'}</h1>
            <p class="lead">${state.round > 1 ? 'Las compus calculan solas y vos movés los centros.' : 'Moviste cada centro al medio de su grupo.'}</p></div>`;
      return `${head}${countsHtml(t)}${state.round <= 1 ? compareHtml() : ''}${action ? dock(action) : ''}`;
    },

    driverDone() {
      const j = state.join;
      const f = state.lastFail;
      return `
        <div class="result">
          <div class="result-icon ok">${icon('shield-check')}</div>
          <h1>${j ? `Juntaste las ${j.parts} partes` : 'Juntaste todo'}</h1>
          <p class="lead">${j ? `Las hicieron ${plural(j.workers, 'compu', 'compus')}.` : ''} ${f ? `Se cayó la compu de ${esc(f.victim)} y no se perdió nada.` : ''}</p>
        </div>
        ${countsHtml(state.totals || [0, 0, 0])}
        ${waiting('Mirá el proyector.')}`;
    },

    // ---------------- step 5: the driver joined; then automatic rounds

    combine() {
      let head;
      if (state.converged) {
        head = `<div class="result${celebrating ? ' party' : ''}"><div class="result-icon ok">${icon(celebrating ? 'party-popper' : 'check')}</div><h1>Terminamos</h1><p class="lead">Los centros ya no se mueven. El modelo está entrenado.</p></div>`;
      } else if (taskUi && taskUi.status === 'working') {
        head = `<div class="result"><h1>Vuelta ${taskUi.round} · Calculando…</h1><p class="lead">Ahora tu compu pinta sola.</p>
          <div class="bar-work" role="progressbar" aria-label="Calculando"><i style="animation-duration:${taskUi.ms}ms"></i></div></div>`;
      } else if (taskUi && taskUi.status === 'done') {
        head = `<div class="result"><div class="result-icon ok">${icon('send')}</div><h1>Vuelta ${taskUi.round} · Resumen enviado</h1></div>`;
      } else {
        head = `<div class="result"><h1>${esc(driverName())} juntó los resúmenes</h1>
          <p class="lead">Movió cada centro al medio de su grupo. Mirá el proyector.</p>${compareHtml()}</div>`;
      }
      return `${head}${labeledPlot(allMyPoints())}`;
    },

    failDone() {
      const f = state.lastFail;
      return `
        <div class="result">
          <div class="result-icon ok">${icon('shield-check')}</div>
          <h1>Llegaron todas las partes</h1>
          <p class="lead">${f ? `Se cayó la compu de ${esc(f.victim)} y no se perdió nada: su parte la ${f.me === 'heir' ? 'hiciste vos' : `hizo ${esc(f.heir)}`}.` : `${esc(driverName())} juntó todo otra vez.`}</p>
        </div>
        ${labeledPlot(allMyPoints())}`;
    },

    // ---------------- step 6: falls

    off() {
      const f = state.lastFail;
      const heir = state.me.lostTo || (f && f.heir) || 'otra compu';
      return `
        <div class="off">
          <div class="off-icon">${icon('power-off')}</div>
          <h1>¡Se cayó tu compu!</h1>
          <p class="lead">Es de mentira. Tu parte ahora la hace <b>${esc(heir)}</b>. Mirá el proyector: no se pierde nada.</p>
        </div>`;
    },

    spin() {
      return `
        <div class="spin">
          <h1>¿Se cae tu compu?</h1>
          <p class="lead">La ruleta está girando…</p>
          <div class="spinner" aria-hidden="true">${swatch(0)}${swatch(1)}${swatch(2)}</div>
        </div>`;
    },

    end() {
      const { me } = state;
      const medals = (me.medals || []).filter((k) => MEDALS[k]);
      const cards = medals.map((k) => `<div class="medal medal-${k}"><span class="medal-icon">${icon(MEDALS[k][0])}</span><span class="medal-text">${MEDALS[k][1]}</span></div>`).join('');
      return `
        <div class="result">
          <div class="result-icon ok">${icon('sparkles')}</div>
          <h1>Gracias por ser parte del clúster</h1>
          <p class="lead">Fuiste la compu <span class="mono">${pad(me.id)}</span>${me.soloDone ? ` · solo pintaste ${plural(me.soloDone, 'punto', 'puntos')}` : ''}${me.rounds ? ` · calculaste ${plural(me.rounds, 'vuelta', 'vueltas')}` : ''}.</p>
        </div>
        <div class="medals">${cards}</div>`;
    },
  };

  // ------------------------------------------------------------ events

  screen.addEventListener('submit', (e) => {
    if (e.target.id !== 'joinForm') return;
    e.preventDefault();
    const value = $('#name').value.trim().slice(0, 16);
    if (!value) return;
    name = value;
    safe.set('localStorage', 'worker-name', name);
    safe.set('localStorage', 'worker-joined', '1');
    joined = true;
    keepAwake();
    render();
    connect();
  });

  function showHint(text, ok = false) {
    const el = $('#hint');
    if (!el) return;
    el.textContent = text;
    el.classList.toggle('is-ok', ok);
    el.classList.toggle('show', text !== '');
    clearTimeout(hintTimer);
    if (text) hintTimer = setTimeout(() => showHint(''), 3000);
  }

  function wrong(pick) {
    vibrate([70, 40, 70]);
    pick.classList.remove('shake');
    void pick.offsetWidth;
    pick.classList.add('shake');
    pick.addEventListener('animationend', () => pick.classList.remove('shake'), { once: true });
    showHint('Casi. Fijate otra vez: hay un centro más cerca.');
  }

  function onPick(pick) {
    const j = Number(pick.dataset.pick);
    if (viewKey === 'howto') {
      const p = PRACTICE[practiceDone];
      if (!p) return;
      if (j !== correctOf(p)) { wrong(pick); return; }
      lastPainted = practiceDone;
      practiceDone += 1;
      vibrate(25);
      render();
      if (practiceDone < PRACTICE.length) showHint('¡Bien! Ese es el centro más cerca.', true);
      return;
    }
    if (viewKey === 'solo') {
      const p = solo.points[solo.done];
      if (!p || soloFinished()) return;
      if (j !== correctOf(p)) { wrong(pick); return; }
      lastPainted = solo.done;
      solo.done += 1;
      safe.set('sessionStorage', `solo:${solo.seed}`, String(solo.done));
      emit('solo:progress', { done: solo.done });
      vibrate(20);
      showHint('');
      render();
      return;
    }
    if (viewKey === 'paint') {
      const part = currentPart();
      const painted = paintedOf(part);
      const p = part && part.points[painted];
      if (!p) return;
      if (j !== correctOf(p)) { wrong(pick); return; }
      lastPainted = painted;
      safe.set('sessionStorage', `part:${partKey(part)}`, String(painted + 1));
      vibrate(25);
      showHint('');
      render();
    }
  }

  screen.addEventListener('click', (e) => {
    const pick = e.target.closest('[data-pick]');
    if (pick) { onPick(pick); return; }
    const btn = e.target.closest('button');
    if (!btn || btn.disabled || !state) return;
    if (btn.hasAttribute('data-ask')) {
      btn.disabled = true;
      emit('driver:ask');
    } else if (btn.hasAttribute('data-join')) {
      btn.disabled = true;
      emit('driver:join');
    } else if (btn.hasAttribute('data-run')) {
      emit('driver:run', { on: btn.dataset.run === '1' });
    } else if (btn.hasAttribute('data-send')) {
      const part = state.parts.find((pt) => pt.id === Number(btn.dataset.send));
      if (!part || isSent(part)) return;
      sentLocal.add(partKey(part));
      lastPainted = -1;
      emit('part:submit', { part: part.id });
      render();
    }
  });

  if (joined) { connect(); render(); keepAwake(); } else render();
})();
