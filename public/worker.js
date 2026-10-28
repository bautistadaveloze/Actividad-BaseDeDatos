'use strict';

(() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const K = 3;
  const CLUSTERS = ['Violeta', 'Cian', 'Rosa'];
  const BYTES = { A: (n) => n * 20, B: () => K * 16, C: () => K * 24 };

  const icon = (name) => `<svg class="icon" aria-hidden="true"><use href="/icons.svg#${name}"/></svg>`;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = (n) => String(n).padStart(2, '0');
  const pad4 = (n) => String(n).padStart(4, '0');
  const nf1 = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const nf0 = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });
  const fmtBytes = (b) => (b < 1024 ? `${nf0.format(b)} B` : b < 1024 ** 2 ? `${nf1.format(b / 1024)} KB` : `${nf1.format(b / 1024 ** 2)} MB`);
  const swatch = (j) => `<i class="shape shape-${j}"></i>`;

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
  };
  const session = {
    get(k) { try { return JSON.parse(sessionStorage.getItem(k)); } catch { return null; } },
    set(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } },
  };

  const newToken = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`);
  let token = store.get('worker-token');
  if (!token) { token = newToken(); store.set('worker-token', token); }
  let name = store.get('worker-name') || '';
  let joined = store.get('worker-joined') === '1';

  const screen = $('#screen');
  let socket = null;
  let state = null;
  let fresh = true;
  let viewKey = null;

  // Partition data held "in memory" by this executor, and what we've seen
  // (for drawing even when Hadoop mode forbids keeping it).
  const cache = new Map();
  const seen = new Map();

  // manual round
  let manualKey = null;
  let labels = [];
  let brush = 0;
  let step = 'assign';
  let option = null;
  let justTapped = -1;

  // automatic tasks
  const queue = [];
  let current = null;
  let stage = { kind: 'idle' };

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

  function partialStats(points, centroids) {
    const sums = centroids.map(() => ({ sx: 0, sy: 0, n: 0 }));
    let cost = 0;
    for (const p of points) {
      const j = nearest(p, centroids);
      sums[j].sx += p.x; sums[j].sy += p.y; sums[j].n += 1;
      cost += (p.x - centroids[j].x) ** 2 + (p.y - centroids[j].y) ** 2;
    }
    return { sums, cost };
  }

  // ------------------------------------------------------------ connection

  function connect() {
    if (socket) return;
    socket = io({ auth: (cb) => cb({ role: 'worker', token, name, fresh }) });
    socket.on('connect', () => { fresh = false; setConn(true); });
    socket.on('disconnect', () => setConn(false));
    socket.on('connect_error', () => setConn(false));
    socket.on('state', (s) => { state = s; onState(); });
    socket.on('task', (t) => { queue.push(t); pump(); });
    socket.on('task:cancel', ({ key, reason }) => {
      const i = queue.findIndex((t) => t.key === key);
      if (i >= 0) queue.splice(i, 1);
      if (current && current.key === key) { current.cancelled = true; current.cancelReason = reason; }
    });
    socket.on('cache:clear', () => cache.clear());
    socket.on('inherited', ({ pid, from, reason }) => {
      banner('ok', 'git-branch', `Heredaste la partición <b class="mono">P${pad(pid)}</b>${from ? ` de #${pad(from)}` : ''} (${esc(reason)}). La recalculás desde el origen: eso es el <b>lineage</b>.`, 7000);
    });
    socket.on('killed', () => {
      queue.length = 0;
      if (current) current.cancelled = true;
    });
    socket.on('join:error', (msg) => banner('bad', 'circle-alert', esc(msg), 8000));
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

  // ------------------------------------------------------------ banners

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

  // ------------------------------------------------------------ state

  function onState() {
    const me = state.me;
    $('#barTitle').textContent = `Executor #${pad(me.id)} · ${me.name}`;
    document.title = `#${pad(me.id)} · Clúster`;

    const task = state.manual && state.manual.task;
    if (task) {
      const key = `${task.pid}:${task.from}:${task.points.map((p) => `${p.x},${p.y}`).join(';')}`;
      if (key !== manualKey) {
        manualKey = key;
        const saved = session.get(`labels:${key}`);
        labels = Array.isArray(saved) && saved.length === task.points.length ? saved : task.points.map(() => -1);
        step = 'assign';
        option = null;
      }
      cache.set(task.pid, task.points);
      seen.set(task.pid, task.points);
    }
    render();
  }

  function currentView() {
    if (!joined) return 'join';
    if (!state) return 'connecting';
    const { me, phase, manual } = state;
    if (phase === 'code') return 'summary';
    if (!me.alive) return 'dead';
    if (phase === 'lobby') return 'lobby';
    if (phase === 'map') {
      if (!manual || !manual.task) return 'standby';
      if (manual.submitted) return 'sent';
      return step === 'choose' ? 'choose' : 'assign';
    }
    if (phase === 'reduce') return 'feedback';
    if (phase === 'code') return 'summary';
    return 'job';
  }

  function render() {
    const view = currentView();
    const changed = view !== viewKey;
    viewKey = view;
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
    if (view === 'job') updateTask();
  }

  // ------------------------------------------------------------ svg plot

  function shapeSvg(kind, x, y, r, cls) {
    if (kind === 0) return `<circle class="${cls}" cx="${x}" cy="${y}" r="${r}"/>`;
    if (kind === 1) { const s = r * 0.9; return `<rect class="${cls}" x="${x - s}" y="${y - s}" width="${s * 2}" height="${s * 2}" rx="0.3"/>`; }
    const R = r * 1.25;
    return `<polygon class="${cls}" points="${x},${y - R} ${x + R * 0.866},${y + R * 0.5} ${x - R * 0.866},${y + R * 0.5}"/>`;
  }

  function plotSvg({ pts, colorOf, centroids, interactive = false, numbered = false }) {
    const grid = [0, 25, 50, 75, 100].map((v) => `
      <line class="grid" x1="${v}" x2="${v}" y1="0" y2="100"/>
      <line class="grid" x1="0" x2="100" y1="${100 - v}" y2="${100 - v}"/>
      <text class="tick" x="${v}" y="104.5" text-anchor="middle">${v}</text>
      ${v ? `<text class="tick" x="-1.8" y="${101 - v}" text-anchor="end">${v}</text>` : ''}`).join('');
    const cents = centroids.map((c, j) => shapeSvg(j, c.x, 100 - c.y, 3.6, `centroid c-${j}`)).join('');
    const dots = pts.map((p, i) => {
      const c = colorOf(i, p);
      const x = p.x;
      const y = 100 - p.y;
      const body = c >= 0 ? shapeSvg(c, x, y, 1.9, `pt c-${c}${i === justTapped ? ' just' : ''}`) : `<circle class="pt pt-empty" cx="${x}" cy="${y}" r="1.7"/>`;
      const label = numbered ? `<text class="pt-label" x="${x + 2.6}" y="${y - 1.6}">${i + 1}</text>` : '';
      return body + label;
    }).join('');
    return `<svg viewBox="-7 -4 110 112" role="img" aria-label="Tus puntos y los centroides"${interactive ? ' data-tap' : ''}>${grid}${cents}${dots}</svg>`;
  }

  // ------------------------------------------------------------ views

  const VIEWS = {
    join() {
      return `
        <form class="join" id="joinForm">
          <div>
            <h1>Sumate al clúster</h1>
            <p class="lead">Tu celular va a ser un <strong>executor</strong> de Spark: va a recibir una parte de los datos, procesarla y mandarle el resultado al proyector.</p>
          </div>
          <div class="field">
            <label for="name">Tu nombre</label>
            <input id="name" name="name" maxlength="16" autocomplete="nickname" autocapitalize="words" placeholder="Como te dicen" value="${esc(name)}" required>
          </div>
          <button class="btn btn-primary btn-lg btn-block" type="submit">Unirme</button>
          <p class="note">${icon('circle-alert')}<span>Dejá esta pestaña abierta y la pantalla prendida. Si se apaga, el clúster te da por caído.</span></p>
        </form>`;
    },

    connecting() {
      return `<div class="waiting"><span class="pulse"></span><span>Conectando al clúster…</span></div>`;
    },

    lobby() {
      const { me } = state;
      return `
        <div class="ident">
          <div class="ident-id"><span>#</span>${pad(me.id)}</div>
          <div class="ident-name">${esc(me.name)}</div>
        </div>
        <div class="waiting"><span class="pulse"></span><span>Esperando que el driver reparta los datos.</span></div>
        <p class="note">${icon('circle-alert')}<span>Mantené la pantalla prendida. Si el celular se bloquea, el driver deja de escucharte y te da por caído (y lo vamos a usar).</span></p>`;
    },

    standby() {
      return `
        <div class="result">
          <div class="result-icon warn">${icon('layers')}</div>
          <h1>Sos executor de reserva</h1>
          <p class="lead">Llegaste después del reparto, así que no tenés partición. Si se cae otro executor, su partición viene a vos.</p>
        </div>`;
    },

    assign() {
      const t = state.manual.task;
      const done = labels.filter((l) => l >= 0).length;
      const rows = t.points.map((p, i) => `
        <li><button type="button" data-i="${i}">
          <span class="mono">p${i + 1}</span>
          <span class="mono">(${p.x}, ${p.y})</span>
          ${labels[i] >= 0 ? `<span class="who">${swatch(labels[i])}${CLUSTERS[labels[i]]}</span>` : '<span class="who none">sin asignar</span>'}
        </button></li>`).join('');
      return `
        <div>
          <div class="meta"><span>Partición <span class="mono">P${pad(t.pid)}</span></span><span>puntos <span class="mono">${pad4(t.from)}–${pad4(t.to)}</span></span></div>
          <h1 style="margin-top:.375rem">Asigná tus ${t.points.length} puntos</h1>
          <p class="lead">Cada punto va al centroide <strong>más cercano</strong>. Elegí un color y tocá los puntos.</p>
        </div>
        <div class="brush" role="group" aria-label="Color a asignar">
          ${CLUSTERS.map((n, j) => `<button type="button" data-brush="${j}" aria-pressed="${brush === j}">${swatch(j)}${n}</button>`).join('')}
        </div>
        <div class="mini" id="assignPlot">${plotSvg({ pts: t.points, colorOf: (i) => labels[i], centroids: state.centroids, interactive: true, numbered: true })}</div>
        <ul class="pts">${rows}</ul>
        <div class="dock"><div class="dock-inner">
          <span class="dock-count">${done}/${t.points.length}</span>
          <button class="btn btn-primary btn-lg" type="button" data-go="choose" ${done === t.points.length ? '' : 'disabled'}>Siguiente${icon('arrow-right')}</button>
        </div></div>`;
    },

    choose() {
      const t = state.manual.task;
      const sums = Array.from({ length: K }, () => ({ sx: 0, sy: 0, n: 0 }));
      t.points.forEach((p, i) => { const s = sums[labels[i]]; s.sx += p.x; s.sy += p.y; s.n += 1; });
      const name = (j) => CLUSTERS[j].toLowerCase().padEnd(8);
      const previewA = t.points.slice(0, 3).map((p, i) => `p${i + 1} (${p.x}, ${p.y}) ${CLUSTERS[labels[i]].toLowerCase()}`).join('\n') + `\n… y ${t.points.length - 3} más`;
      const previewB = sums.map((s, j) => `${name(j)}${s.n ? `x̄ ${nf1.format(s.sx / s.n)}  ȳ ${nf1.format(s.sy / s.n)}` : '—'}`).join('\n');
      const previewC = sums.map((s, j) => `${name(j)}Σx ${s.sx}  Σy ${s.sy}  n ${s.n}`).join('\n');
      const opt = (k, title, text, preview, bytes) => `
        <label class="option">
          <input type="radio" name="opt" value="${k}" ${option === k ? 'checked' : ''}>
          <span class="option-key">${k}</span>
          <h3>${title}</h3>
          <span class="option-bytes">${fmtBytes(bytes)}</span>
          <p>${text}</p>
          <pre>${preview}</pre>
        </label>`;
      return `
        <div>
          <button class="btn btn-ghost btn-sm" type="button" data-go="assign" style="margin-left:-.75rem">${icon('arrow-left')}Volver a asignar</button>
          <h1 style="margin-top:.5rem">¿Qué le mandás al driver?</h1>
          <p class="lead">El driver tiene que calcular el promedio de <strong>todos</strong> los puntos de cada color, juntando lo que manden todos los executors. Con lo que elijas, ¿puede hacerlo bien?</p>
        </div>
        <div class="options" role="radiogroup" aria-label="Qué enviar">
          ${opt('A', 'Todos mis puntos', 'Cada punto con su color.', previewA, BYTES.A(t.points.length))}
          ${opt('B', 'El promedio de cada color', 'Un punto promedio por color.', previewB, BYTES.B())}
          ${opt('C', 'La suma de cada color y cuántos son', 'Σx, Σy y la cantidad de puntos por color.', previewC, BYTES.C())}
        </div>
        <div class="dock"><div class="dock-inner">
          <button class="btn btn-primary btn-lg" type="button" data-send ${option ? '' : 'disabled'}>${icon('send')}Enviar al driver</button>
        </div></div>`;
    },

    sent() {
      const s = state.manual.submitted;
      return `
        <div class="result">
          <div class="result-icon">${icon('check')}</div>
          <h1>Enviado al driver</h1>
          <p class="lead">Mandaste la opción <strong>${s.option}</strong> · <span class="mono">${fmtBytes(s.bytes)}</span>.</p>
          <p class="lead">Mirá el proyector: el driver espera a los demás y después reduce.</p>
        </div>`;
    },

    feedback() {
      const m = state.manual;
      const s = m && m.submitted;
      if (!s) {
        return `
          <div class="result">
            <div class="result-icon warn">${icon('timer')}</div>
            <h1>No llegaste a mandar</h1>
            <p class="lead">El driver redujo sin tu partición: sus centroides salieron de datos incompletos. En Spark, el driver espera tu tarea o la reintenta.</p>
          </div>`;
      }
      const verdict = {
        C: ['', 'check', 'Justo lo que hace Spark', `Con las sumas y la cantidad el driver calcula el promedio exacto, y pesa <span class="mono">${fmtBytes(s.bytes)}</span> tengas 8 puntos o un millón. Eso es la <strong>agregación parcial</strong> (combiner).`],
        A: ['warn', 'database', 'Correcto, pero caro', 'El driver puede calcular todo, pero le mandaste el dato entero. Con un millón de puntos serían ~19 MB por executor viajando por la red: el <strong>shuffle</strong> es lo más caro de un clúster.'],
        B: ['bad', 'circle-alert', 'Liviano, pero incorrecto', 'Un promedio sin la cantidad no se puede ponderar: si tu grupo tenía 1 punto y el de otro tenía 7, el driver los cuenta igual. Por eso el centroide quedó corrido en el proyector.'],
      }[s.option];
      return `
        <div class="result">
          <div class="result-icon ${verdict[0]}">${icon(verdict[1])}</div>
          <h1>${verdict[2]}</h1>
          <p class="lead">${verdict[3]}</p>
        </div>
        <p class="note ${s.wrong ? 'warn' : 'ok'}">${icon(s.wrong ? 'circle-alert' : 'check')}<span>${s.wrong
          ? `Asignaste bien <strong>${s.total - s.wrong} de ${s.total}</strong> puntos. El driver no lo puede saber: confía en lo que le mandan.`
          : `Asignaste bien los <strong>${s.total}</strong> puntos.`}</span></p>`;
    },

    job() {
      const { me, job, phase } = state;
      const hadoop = (job && job.mode === 'hadoop') || (!job && phase === 'hadoop' && stage.mode === 'hadoop');
      const parts = me.partitions;
      const shown = parts.flatMap((p) => seen.get(p.id) || []);
      return `
        <div>
          <div class="meta">
            <span class="tag ${hadoop ? 'warn' : 'accent'}">${icon(hadoop ? 'hard-drive' : 'zap')}${hadoop ? 'Hadoop · sin caché' : 'Spark · datos en memoria'}</span>
          </div>
          <h1 style="margin-top:.625rem">${phase === 'faults' ? 'Tolerancia a fallos' : phase === 'hadoop' ? 'Hadoop contra Spark' : 'Modo Spark'}</h1>
        </div>
        ${me.slow ? `<p class="note warn">${icon('turtle')}<span>Sos un <strong>straggler</strong>: el driver te volvió lento. Toda la iteración espera tu tarea.</span></p>` : ''}
        <section class="task" id="task">
          <div class="task-top">
            <span class="task-state" id="taskState"></span>
            <span class="tag mono" id="taskIter"></span>
          </div>
          <div class="track"><i id="taskBar"></i></div>
          <p class="task-sub" id="taskSub"></p>
        </section>
        <div class="chips">
          ${parts.length ? parts.map((p) => `<span class="chip${p.inherited ? ' inherited' : ''}">P${pad(p.id)}${p.inherited ? ' <small>heredada</small>' : ''}</span>`).join('') : '<span class="small">Sin particiones: sos reserva.</span>'}
        </div>
        ${shown.length ? `<div class="mini">${plotSvg({ pts: shown, colorOf: (_i, p) => nearest(p, state.centroids), centroids: state.centroids })}</div>` : ''}
        <dl class="stats">
          <div><dt>Tareas</dt><dd>${me.stats.tasks}</dd></div>
          <div><dt>Heredadas</dt><dd>${me.stats.inherited}</dd></div>
          <div><dt>Enviado</dt><dd>${fmtBytes(me.stats.bytes)}</dd></div>
        </dl>`;
    },

    summary() {
      const { me } = state;
      return `
        <div class="ident">
          <div class="ident-id"><span>#</span>${pad(me.id)}</div>
          <div class="ident-name">${esc(me.name)}</div>
        </div>
        <h1>Así trabajaste como executor</h1>
        <dl class="stats">
          <div><dt>Tareas</dt><dd>${me.stats.tasks}</dd></div>
          <div><dt>Heredadas</dt><dd>${me.stats.inherited}</dd></div>
          <div><dt>Especulativas</dt><dd>${me.stats.speculative}</dd></div>
        </dl>
        <p class="note">${icon('layers')}<span>Mirá el proyector: ocho líneas de PySpark hacen lo mismo que hicieron entre todos, en miles de máquinas.</span></p>`;
    },

    dead() {
      return `
        <section class="dead">
          ${icon('skull')}
          <h1>Tu nodo se cayó</h1>
          <p>El driver ya reasignó tus particiones a otros executors. No se perdió nada: Spark las recalcula desde el origen usando el <strong>lineage</strong>.</p>
          <p>Esperá: el driver te puede revivir como executor de reserva.</p>
        </section>`;
    },
  };

  // ------------------------------------------------------------ interactions

  screen.addEventListener('submit', (e) => {
    if (e.target.id !== 'joinForm') return;
    e.preventDefault();
    name = $('#name').value.trim().slice(0, 16);
    if (!name) return;
    store.set('worker-name', name);
    store.set('worker-joined', '1');
    joined = true;
    keepAwake();
    render();
    connect();
  });

  screen.addEventListener('click', (e) => {
    const b = e.target.closest('[data-brush]');
    if (b) { brush = Number(b.dataset.brush); render(); return; }

    const p = e.target.closest('[data-i]');
    const i = p ? Number(p.dataset.i) : tappedPoint(e);
    if (i >= 0 && viewKey === 'assign') {
      labels[i] = brush;
      justTapped = i;
      session.set(`labels:${manualKey}`, labels);
      render();
      justTapped = -1;
      if (navigator.vibrate) navigator.vibrate(8);
      return;
    }

    const g = e.target.closest('[data-go]');
    if (g) { step = g.dataset.go; render(); return; }

    if (e.target.closest('[data-send]') && option && socket) {
      socket.emit('manual:submit', { option, labels });
    }
  });

  // Taps on the plot pick the closest point, so two points that sit almost
  // on top of each other never steal each other's tap.
  function tappedPoint(e) {
    const svg = e.target.closest('svg[data-tap]');
    if (!svg || !state.manual || !state.manual.task) return -1;
    const m = svg.getScreenCTM();
    if (!m) return -1;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    let best = -1;
    let bd = 7 ** 2;
    state.manual.task.points.forEach((q, i) => {
      const d = (q.x - pt.x) ** 2 + (100 - q.y - pt.y) ** 2;
      if (d < bd) { bd = d; best = i; }
    });
    return best;
  }

  screen.addEventListener('change', (e) => {
    if (e.target.name === 'opt') { option = e.target.value; render(); }
  });

  // ------------------------------------------------------------ tasks

  const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

  function setStage(kind, extra = {}) {
    stage = { kind, t0: performance.now(), ...extra };
    if (viewKey === 'job') updateTask();
  }

  function updateTask() {
    const el = $('#task');
    if (!el) return;
    const t = stage.task;
    const pid = t ? `P${pad(t.pid)}` : '';
    const map = {
      idle: ['timer', 'Esperando tarea', 'El driver manda una tarea por partición en cada iteración.'],
      read: ['hard-drive', `Leyendo ${pid} del disco`, t && t.mode === 'hadoop' ? 'Hadoop no guarda nada en memoria: relee en cada iteración.' : t && t.speculative ? 'Copia especulativa: leyendo una réplica de la partición.' : 'Primera lectura. Después queda en memoria con cache().'],
      compute: ['cpu', `Calculando ${pid}`, 'Asigno cada punto a su centroide más cercano y sumo Σx, Σy, n.'],
      write: ['hard-drive', 'Escribiendo en disco', 'Hadoop guarda el resultado intermedio antes de la próxima iteración.'],
      sent: ['send', `Resultado de ${pid} enviado`, 'Mandé solo Σx, Σy y n por color: 72 bytes.'],
    }[stage.kind];
    el.dataset.stage = stage.kind;
    const stateEl = $('#taskState');
    const html = `${icon(map[0])}${map[1]}`;
    if (stateEl._html !== html) { stateEl.innerHTML = html; stateEl._html = html; }
    $('#taskSub').textContent = map[2];
    const iter = (t && t.iter) || (state.job && state.job.iter) || 0;
    $('#taskIter').textContent = `${t && t.speculative ? 'especulativa · ' : ''}it ${iter}`;
  }

  (function progressLoop() {
    const bar = $('#taskBar');
    if (bar) {
      let pct = 0;
      if (stage.kind === 'sent') pct = 100;
      else if (stage.ms) pct = Math.min(100, ((performance.now() - stage.t0) / stage.ms) * 100);
      bar.style.width = `${pct}%`;
    }
    requestAnimationFrame(progressLoop);
  }());

  async function pump() {
    if (current || !queue.length) return;
    current = queue.shift();
    try { await runTask(current); } finally {
      current = null;
      pump();
    }
  }

  async function runTask(t) {
    if (t.points) {
      seen.set(t.pid, t.points);
      if (t.cache) cache.set(t.pid, t.points);
      else cache.delete(t.pid);
    }
    const pts = t.points || cache.get(t.pid);
    if (!pts) return; // lost in a reload: the driver will time out and reassign
    if (t.readMs) {
      setStage('read', { task: t, ms: t.readMs, mode: t.mode });
      await sleep(t.readMs);
      if (t.cancelled) return cancelled(t);
    }
    setStage('compute', { task: t, ms: t.computeMs, mode: t.mode });
    const res = partialStats(pts, t.centroids);
    await sleep(t.computeMs);
    if (t.cancelled) return cancelled(t);
    if (t.writeMs) {
      setStage('write', { task: t, ms: t.writeMs, mode: t.mode });
      await sleep(t.writeMs);
      if (t.cancelled) return cancelled(t);
    }
    socket.emit('task:result', { key: t.key, sums: res.sums, cost: res.cost });
    setStage('sent', { task: t, mode: t.mode });
    if (viewKey === 'job') render();
  }

  function cancelled(t) {
    setStage('idle', { mode: t.mode });
    if (t.cancelReason === 'spec') {
      banner('warn', 'zap', `Otra copia de <b class="mono">P${pad(t.pid)}</b> terminó primero: el driver canceló la tuya. Eso es la <b>ejecución especulativa</b>.`);
    }
  }

  // ------------------------------------------------------------ boot

  render();
  if (joined) connect();
})();
