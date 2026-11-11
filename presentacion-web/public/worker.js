'use strict';

// Phone screen: one view per state, one action per view.
(() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const NAMES = ['Violeta', 'Celeste', 'Rosa'];

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

  // Hand painting
  let painted = 0;
  let paintedKey = null;
  let lastPainted = -1;
  let submitted = false;
  let hintTimer = null;

  // Automatic task: { round, ms, status: 'working' | 'done' }
  let taskUi = null;
  let taskTimer = null;

  // ------------------------------------------------------------ math

  function nearest(p, cs) {
    let best = 0;
    let bd = Infinity;
    cs.forEach((c, j) => {
      const d = (p.x - c.x) ** 2 + (p.y - c.y) ** 2;
      if (d < bd) { bd = d; best = j; }
    });
    return best;
  }

  function summarize(points, centers) {
    const sums = centers.map(() => ({ sx: 0, sy: 0, n: 0 }));
    for (const p of points) {
      const s = sums[nearest(p, centers)];
      s.sx += p.x; s.sy += p.y; s.n += 1;
    }
    return sums;
  }

  // ------------------------------------------------------------ connection

  function connect() {
    if (socket) return;
    socket = io({ auth: (cb) => cb({ role: 'worker', token, name }) });
    socket.on('connect', () => setConn(true));
    socket.on('disconnect', () => setConn(false));
    socket.on('connect_error', () => setConn(false));
    socket.on('state', (s) => { state = s; onState(); });
    socket.on('task', onTask);
    socket.on('inherit', ({ from, count, total }) => {
      banner('ok', 'layers', `Heredaste ${plural(count, 'punto', 'puntos')} de ${esc(from)}. Ahora tenés ${total}.`, 7000);
    });
    socket.on('join:error', (msg) => {
      banner('bad', 'circle-alert', esc(msg), 8000);
      joined = false;
      socket = null;
      state = null;
      safe.set('localStorage', 'worker-joined', '0');
      render();
    });
  }

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

  // ------------------------------------------------------------ automatic task

  function onTask({ round, centers }) {
    if (!state || state.me.off) return;
    const points = state.points;
    const sums = summarize(points, centers);
    const ms = 400 + Math.round(Math.random() * 500);
    taskUi = { round, ms, status: 'working' };
    render();
    clearTimeout(taskTimer);
    taskTimer = setTimeout(() => {
      // A phone switched off in the meantime stays silent.
      if (state && state.me.off) { taskUi = null; render(); return; }
      if (socket) socket.emit('task:result', { round, sums });
      taskUi = { round, ms, status: 'done' };
      render();
    }, ms);
  }

  // ------------------------------------------------------------ state

  function onState() {
    const { me, paintKey } = state;
    $('#barTitle').textContent = `Compu ${pad(me.id)} · ${me.name}`;
    document.title = `Compu ${pad(me.id)} · Clúster`;

    if (paintKey !== paintedKey) {
      paintedKey = paintKey;
      const saved = Number(safe.get('sessionStorage', `paint:${paintKey}`));
      painted = Number.isFinite(saved) ? Math.max(0, Math.min(saved, state.own)) : 0;
      lastPainted = -1;
      submitted = false;
    }
    if (me.off) { clearTimeout(taskTimer); taskUi = null; $('#banners').replaceChildren(); }
    if (!me.sent && state.phase !== 'paint') submitted = false;
    render();
  }

  function currentView() {
    if (!joined) return 'join';
    if (!state) return 'connecting';
    const { me, phase } = state;
    if (phase === 'end') return 'end';
    if (me.off) return 'off';
    if (phase === 'lobby') return 'lobby';
    if (phase === 'paint') {
      if (state.own === 0) return 'standby';
      if (me.sent || submitted) return 'sent';
      return painted >= state.own ? 'ready' : 'paint';
    }
    if (phase === 'combine') return 'combine';
    return 'run';
  }

  function render() {
    const view = currentView();
    const changed = view !== viewKey;
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
  }

  // ------------------------------------------------------------ drawing

  function shapeSvg(kind, x, y, r, cls) {
    if (kind === 0) return `<circle class="${cls}" cx="${x}" cy="${y}" r="${r}"/>`;
    if (kind === 1) { const s = r * 0.9; return `<rect class="${cls}" x="${x - s}" y="${y - s}" width="${s * 2}" height="${s * 2}" rx="0.6"/>`; }
    const R = r * 1.3;
    return `<polygon class="${cls}" points="${x},${y - R} ${x + R * 0.866},${y + R * 0.5} ${x - R * 0.866},${y + R * 0.5}"/>`;
  }

  // labelOf(i, point) returns the group (0..2) or -1 for an unpainted point.
  function plotSvg({ pts, labelOf, current = -1, pop = -1 }) {
    const grid = [25, 50, 75].map((v) => `<line class="grid" x1="${v}" x2="${v}" y1="0" y2="100"/><line class="grid" x1="0" x2="100" y1="${v}" y2="${v}"/>`).join('');
    const centers = state.centers.map((c, j) => shapeSvg(j, c.x, 100 - c.y, 5.6, `center c-${j}`)).join('');
    const dots = pts.map((p, i) => {
      const l = labelOf(i, p);
      const cls = `pt${i === pop ? ' pop' : ''}`;
      const dot = l >= 0 ? shapeSvg(l, p.x, 100 - p.y, 3.9, `${cls} c-${l}`) : `<circle class="${cls} pt-empty${i === current ? ' pt-current' : ''}" cx="${p.x}" cy="${100 - p.y}" r="3.7"/>`;
      const ring = i === current ? `<circle class="ring" cx="${p.x}" cy="${100 - p.y}" r="8"/>` : '';
      return dot + ring;
    }).join('');
    return `<svg class="plot" viewBox="-6 -6 112 112" role="img" aria-label="Tus puntos y los tres centros">
      <rect class="frame" x="-5" y="-5" width="110" height="110" rx="3"/>${grid}${centers}${dots}</svg>`;
  }

  function stateLabelPlot() {
    return plotSvg({ pts: state.points, labelOf: (i, p) => p.label });
  }

  // Own points, in delivery order (easiest first).
  const ownPoints = () => state.points.slice(0, state.own);
  const correctOf = (p) => nearest(p, state.centers);

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
      return `<div class="waiting"><span class="pulse"></span><span>Conectando…</span></div>`;
    },

    lobby() {
      const { me } = state;
      return `
        <div class="ident">
          <p class="ident-top">Sos la compu</p>
          <div class="ident-id mono">${pad(me.id)}</div>
          <div class="ident-name">${esc(me.name)}</div>
        </div>
        <div class="waiting"><span class="pulse"></span><span>Esperá: ya te llega tu parte de los datos.</span></div>
        <p class="note">${icon('circle-alert')}<span>Dejá la pantalla prendida y esta pestaña abierta.</span></p>`;
    },

    standby() {
      return `
        <div class="waiting"><span class="pulse"></span><span>Esperá: ya te llega tu parte de los datos.</span></div>`;
    },

    paint() {
      const pts = ownPoints();
      const n = pts.length;
      const dots = pts.map((_, i) => `<i class="pdot${i < painted ? ' on' : ''}${i === painted ? ' now' : ''}"></i>`).join('');
      return `
        <div class="head">
          <h1>Punto ${painted + 1} de ${n}</h1>
          <div class="pdots" aria-hidden="true">${dots}</div>
        </div>
        <p class="ask">¿Qué centro le queda más cerca al punto que titila?</p>
        ${plotSvg({ pts, labelOf: (i, p) => (i < painted ? correctOf(p) : -1), current: painted, pop: lastPainted })}
        <p class="plot-note">Las figuras grandes son los centros.</p>
        <div class="dock"><div class="dock-inner">
          <p class="hint" id="hint" aria-live="polite"></p>
          <div class="picks">
            ${NAMES.map((nm, j) => `<button class="pick" type="button" data-pick="${j}">${swatch(j)}<span>${nm}</span></button>`).join('')}
          </div>
        </div></div>`;
    },

    ready() {
      const pts = ownPoints();
      const counts = [0, 0, 0];
      pts.forEach((p) => { counts[correctOf(p)] += 1; });
      return `
        <div class="stack">
          <h1>Pintaste tus ${pts.length} puntos</h1>
          <div class="counts">${counts.map((c, j) => `<span class="count">${swatch(j)}<b>${NAMES[j]}</b><span class="mono">${c}</span></span>`).join('')}</div>
          <p class="lead">Esto es lo único que le vas a mandar al coordinador: un resumen, no tus puntos.</p>
        </div>
        ${plotSvg({ pts, labelOf: (i, p) => correctOf(p) })}
        <div class="dock"><div class="dock-inner">
          <button class="btn btn-primary btn-lg btn-block cta" type="button" data-send>${icon('send')}Enviar al coordinador</button>
        </div></div>`;
    },

    sent() {
      const pts = ownPoints();
      return `
        <div class="result">
          <div class="result-icon ok">${icon('check')}</div>
          <h1>Enviado</h1>
          <p class="lead">Mandaste solo un resumen chiquito. Mirá el proyector.</p>
        </div>
        ${plotSvg({ pts, labelOf: (i, p) => correctOf(p) })}`;
    },

    combine() {
      return `
        <div class="result">
          <h1>El coordinador juntó todo</h1>
          <p class="lead">Movió los centros. Mirá el proyector.</p>
          ${state.me.sent ? '' : `<p class="note warn">${icon('circle-alert')}<span>No llegaste a enviar: tu compu terminó sola tu parte.</span></p>`}
        </div>
        ${stateLabelPlot()}`;
    },

    run() {
      let head;
      if (state.converged) {
        head = `<div class="result"><div class="result-icon ok">${icon('check')}</div><h1>Terminamos</h1><p class="lead">Los centros ya no se mueven. El modelo está entrenado.</p></div>`;
      } else if (taskUi && taskUi.status === 'working') {
        head = `<div class="result"><h1>Vuelta ${taskUi.round} · Pintando…</h1>
          <div class="bar-work" role="progressbar" aria-label="Pintando"><i style="animation-duration:${taskUi.ms}ms"></i></div></div>`;
      } else if (taskUi && taskUi.status === 'done') {
        head = `<div class="result"><div class="result-icon ok">${icon('send')}</div><h1>Vuelta ${taskUi.round} · Resumen enviado</h1></div>`;
      } else {
        head = `<div class="result"><h1>Vuelta ${state.round}</h1><p class="lead">Esperá: el coordinador arma la próxima vuelta.</p></div>`;
      }
      return `${head}${stateLabelPlot()}`;
    },

    off() {
      return `
        <div class="off">
          <div class="off-icon">${icon('power-off')}</div>
          <h1>Tu compu se apagó</h1>
          <p class="lead">Es de mentira. No se perdió nada: tus puntos ahora los pinta otra compu.</p>
        </div>`;
    },

    end() {
      const { me, own } = state;
      return `
        <div class="result">
          <div class="result-icon ok">${icon('sparkles')}</div>
          <h1>Gracias por ser parte del clúster</h1>
          <p class="lead">Fuiste la compu <span class="mono">${pad(me.id)}</span> · pintaste ${plural(own, 'punto', 'puntos')} · hiciste ${plural(me.rounds, 'vuelta', 'vueltas')}.</p>
        </div>`;
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

  function showHint(text) {
    const el = $('#hint');
    if (!el) return;
    el.textContent = text;
    el.classList.toggle('show', text !== '');
    clearTimeout(hintTimer);
    if (text) hintTimer = setTimeout(() => showHint(''), 3500);
  }

  screen.addEventListener('click', (e) => {
    const pick = e.target.closest('[data-pick]');
    if (pick && viewKey === 'paint') {
      const j = Number(pick.dataset.pick);
      const p = ownPoints()[painted];
      if (!p) return;
      if (j === correctOf(p)) {
        lastPainted = painted;
        painted += 1;
        safe.set('sessionStorage', `paint:${state.paintKey}`, String(painted));
        vibrate(25);
        clearTimeout(hintTimer);
        render();
      } else {
        vibrate([70, 40, 70]);
        pick.classList.remove('shake');
        void pick.offsetWidth;
        pick.classList.add('shake');
        pick.addEventListener('animationend', () => pick.classList.remove('shake'), { once: true });
        showHint('Casi. Fijate otra vez: hay un centro más cerca.');
      }
      return;
    }
    if (e.target.closest('[data-send]') && socket && !submitted) {
      submitted = true;
      socket.emit('paint:submit');
      render();
    }
  });

  if (joined) { connect(); render(); keepAwake(); } else render();
})();
