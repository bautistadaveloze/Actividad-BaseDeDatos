'use strict';

(() => {
  const $ = (sel, root = document) => root.querySelector(sel);

  const PHASES = [
    { id: 'lobby', label: 'Unirse' },
    { id: 'map', label: 'Map a mano' },
    { id: 'reduce', label: 'Reduce' },
    { id: 'spark', label: 'Modo Spark' },
    { id: 'faults', label: 'Fallos' },
    { id: 'hadoop', label: 'Hadoop vs Spark' },
    { id: 'code', label: 'Código' },
  ];
  const VIEW_OF = { lobby: 'lobby', map: 'plot', reduce: 'plot', spark: 'plot', faults: 'plot', hadoop: 'race', code: 'code' };
  const CLUSTERS = ['violeta', 'cian', 'rosa'];
  const STATUS = {
    idle: 'Libre', busy: 'Trabajando', done: 'Envió', slow: 'Straggler',
    dead: 'Caído', offline: 'Sin conexión', standby: 'Reserva',
  };
  const OPTION_NAME = { A: 'Todos los puntos', B: 'Promedios', C: 'Sumas y cantidad' };

  const icon = (name) => `<svg class="icon" aria-hidden="true"><use href="/icons.svg#${name}"/></svg>`;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = (n) => String(n).padStart(2, '0');
  const nf1 = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const nf0 = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });
  const fmtSec = (ms) => `${nf1.format(ms / 1000)} s`;
  const fmtBytes = (b) => {
    if (b < 1024) return `${nf0.format(b)} B`;
    if (b < 1024 ** 2) return `${nf1.format(b / 1024)} KB`;
    return `${nf1.format(b / 1024 ** 2)} MB`;
  };
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const nearest = (p, cs) => {
    let best = 0;
    let bd = Infinity;
    for (let j = 0; j < cs.length; j++) {
      const d = (p.x - cs[j].x) ** 2 + (p.y - cs[j].y) ** 2;
      if (d < bd) { bd = d; best = j; }
    }
    return best;
  };
  const easeOut = (t) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t));

  let socket = null;
  let state = null;
  let points = null;
  let openMenuId = null;

  // ------------------------------------------------------------ auth

  const params = new URLSearchParams(location.search);
  let key = params.get('key');
  try {
    if (key) sessionStorage.setItem('driver-key', key);
    else key = sessionStorage.getItem('driver-key');
  } catch { /* storage blocked: key only lives in this page */ }
  if (params.has('key')) history.replaceState(null, '', '/driver');

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
    socket.on('data', (p) => { points = p; plot.dirty = true; });
    socket.on('state', (s) => {
      const prev = state;
      state = s;
      onState(prev);
    });
  }

  const send = (event, payload) => socket && socket.emit(event, payload);

  if (key) connect();
  else showAuth();

  // ------------------------------------------------------------ theme & chrome

  function setTheme(theme) {
    document.documentElement.dataset.theme = theme;
    $('#themeBtn').setAttribute('aria-pressed', String(theme === 'contrast'));
    try { localStorage.setItem('driver-theme', theme); } catch { /* ignore */ }
    plot.readColors();
  }
  const toggleTheme = () => setTheme(document.documentElement.dataset.theme === 'contrast' ? 'dark' : 'contrast');
  $('#themeBtn').addEventListener('click', toggleTheme);
  $('#themeBtn').setAttribute('aria-pressed', String(document.documentElement.dataset.theme === 'contrast'));

  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(() => {});
  };
  $('#fullBtn').addEventListener('click', toggleFullscreen);

  const qr = $('#qrOverlay');
  const toggleQr = (show = qr.hidden) => { qr.hidden = !show; };
  $('#joinChip').addEventListener('click', () => toggleQr(true));
  qr.addEventListener('click', (e) => { if (e.target === qr || e.target.closest('[data-close]')) toggleQr(false); });

  function go(delta) {
    if (!state) return;
    const i = PHASES.findIndex((p) => p.id === state.phase);
    const next = PHASES[i + delta];
    if (!next) return;
    if (state.phase === 'map' && next.id === 'reduce') send('manual:reduce');
    else send('phase', { phase: next.id });
  }

  document.addEventListener('keydown', (e) => {
    if (e.target.closest('input, textarea') || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'Escape') { toggleQr(false); closeMenu(); return; }
    if (e.key === 'ArrowRight') go(1);
    else if (e.key === 'ArrowLeft') go(-1);
    else if (e.key === 't' || e.key === 'T') toggleTheme();
    else if (e.key === 'q' || e.key === 'Q') toggleQr();
    else if (e.key === 'f' || e.key === 'F') toggleFullscreen();
    else if (e.key === ' ' && state && (state.phase === 'spark' || state.phase === 'faults')) {
      e.preventDefault();
      send(state.job && state.job.running && !state.job.stopping ? 'job:pause' : 'job:run');
    } else return;
  });

  // ------------------------------------------------------------ state

  function onState(prev) {
    const phaseChanged = !prev || prev.phase !== state.phase;
    if (phaseChanged) closeMenu();

    const target = state.phase === 'reduce' && state.manual && state.manual.result
      ? state.manual.result.after : state.centroids;
    plot.setCentroids(target, !prev);

    if (state.manual) {
      const now = performance.now();
      for (const s of state.manual.submissions) {
        if (!plot.arrivals.has(s.id)) plot.arrivals.set(s.id, prev ? now : 0);
      }
    } else plot.arrivals.clear();

    renderStepper();
    renderView(phaseChanged);
    renderExecutors();
    renderPanel();
    renderLog();
    if (openMenuId != null) renderMenu();
    plot.dirty = true;
  }

  function renderStepper() {
    const nav = $('#stepper');
    const current = PHASES.findIndex((p) => p.id === state.phase);
    if (!nav.children.length) {
      nav.innerHTML = PHASES.map((p) => `<button class="step" type="button" data-phase="${p.id}"><span class="dot"></span>${p.label}</button>`).join('');
      nav.addEventListener('click', (e) => {
        const b = e.target.closest('[data-phase]');
        if (!b) return;
        if (b.dataset.phase === 'reduce' && state.phase === 'map') send('manual:reduce');
        else send('phase', { phase: b.dataset.phase });
      });
    }
    [...nav.children].forEach((b, i) => {
      b.classList.toggle('is-active', i === current);
      b.classList.toggle('is-done', i < current);
      if (i === current) b.setAttribute('aria-current', 'step');
      else b.removeAttribute('aria-current');
    });
    const url = state.publicUrl.replace(/^https?:\/\//, '');
    $('#joinUrl').textContent = url;
    $('#lobbyUrl').textContent = url;
    $('#overlayUrl').textContent = url;
  }

  // ------------------------------------------------------------ views

  function renderView(phaseChanged) {
    const view = VIEW_OF[state.phase];
    if (phaseChanged) {
      document.querySelectorAll('.view').forEach((v) => v.classList.toggle('is-active', v.dataset.view === view));
      if (view === 'plot') requestAnimationFrame(layoutPlot);
    }
    if (view === 'lobby') renderLobby();
    if (view === 'plot') renderPlotView();
    if (view === 'race') renderRace();
    if (view === 'code') renderCode();
  }

  function renderLobby() {
    const list = $('#lobbyNames');
    const present = new Set();
    for (const w of state.workers) {
      if (w.status === 'offline') continue;
      present.add(String(w.id));
      if (!list.querySelector(`[data-id="${w.id}"]`)) {
        const li = document.createElement('li');
        li.dataset.id = w.id;
        list.append(li);
      }
      list.querySelector(`[data-id="${w.id}"]`).innerHTML = `<span class="mono">#${pad(w.id)}</span>${esc(w.name)}`;
    }
    [...list.children].forEach((li) => { if (!present.has(li.dataset.id)) li.remove(); });
  }

  const legendClusters = () => CLUSTERS.map((n, j) => `<span><i class="shape shape-${j}"></i>Centroide ${n}</span>`).join('');

  function renderPlotView() {
    const p = state.phase;
    const m = state.manual;
    const job = state.job;
    const subs = m ? m.submissions : [];
    const r = m && m.result;
    const totalBytes = subs.reduce((a, s) => a + s.bytes, 0);
    const lastCost = state.history.length ? state.history[state.history.length - 1].cost : null;
    const iter = job ? job.iter : state.history.length;
    const deadCount = state.workers.filter((w) => w.status === 'dead' || w.status === 'offline').length;

    let title = '';
    let sub = '';
    let metrics = [];
    let legend = legendClusters();
    let insight = '';

    if (p === 'map') {
      title = 'Iteración 1 · map a mano';
      sub = 'Cada executor asigna sus puntos al centroide más cercano y decide qué le manda al driver.';
      metrics = [['Enviaron', `${subs.length}/${m ? m.owners : 0}`], ['Por la red', fmtBytes(totalBytes)]];
      legend += '<span><i class="legend-ring"></i>Promedio (B)</span><span><i class="shape shape-0" style="opacity:.55"></i>Suma parcial (C)</span>';
      insight = `
        <div class="question">${icon('circle-alert')}<p>¿Qué conviene mandarle al driver: todos los puntos, el promedio de cada grupo, o la suma de cada grupo con su cantidad?</p></div>
        <div class="insight-block">
          <h3>Lo que llegó al driver</h3>
          ${subs.length ? `<ul class="subs">${subs.slice().reverse().slice(0, 9).map((s) => `
            <li><span class="mono">#${pad(s.id)}</span><span class="who">${esc(s.name)}</span><span class="mono">${fmtBytes(s.bytes)}</span><span class="opt opt-${s.option}">${s.option}</span></li>`).join('')}
          </ul>${subs.length > 9 ? `<p class="insight-text">y ${subs.length - 9} más</p>` : ''}`
            : '<p class="insight-text">Todavía nada. Mientras tanto, el driver no tiene ni un solo punto: los datos están repartidos en los celulares.</p>'}
        </div>`;
    } else if (p === 'reduce' && r) {
      title = 'Reduce';
      sub = 'El driver combina lo que recibió y mueve los centroides.';
      const worst = r.error.reduce((bi, e, j, arr) => (e > arr[bi] ? j : bi), 0);
      const sent = r.counts.A + r.counts.B + r.counts.C;
      metrics = [['Mensajes', String(sent)], ['Por la red', fmtBytes(r.bytes.A + r.bytes.B + r.bytes.C)], ['Error máx.', nf1.format(r.error[worst])]];
      legend += '<span><i class="legend-ring"></i>Donde tendría que estar</span>';
      const callout = r.counts.B
        ? `<div class="callout">${icon('circle-alert')}<p>El centroide <strong>${CLUSTERS[worst]}</strong> quedó a <strong class="mono">${nf1.format(r.error[worst])}</strong> de donde debía. ${r.counts.B === 1 ? 'Un executor mandó promedios' : `${r.counts.B} executors mandaron promedios`}: sin la cantidad, el driver no sabe cuánto pesa cada uno y los cuenta como si fueran un solo punto.</p></div>`
        : `<div class="callout ok">${icon('check')}<p>Nadie mandó promedios sueltos: el resultado es exacto.</p></div>`;
      const row = (o, text, scale) => `
        <div class="breakdown-row">
          <span class="opt opt-${o}">${o}</span>
          <h4>${OPTION_NAME[o]}</h4>
          <span class="count">${r.counts[o]}</span>
          <p>${text}</p>
          <div class="scale"><span>Esta ronda <b class="mono">${fmtBytes(r.bytes[o])}</b></span><span>Con 1 M de puntos por partición <b class="mono">${fmtBytes(r.scaled[o])}</b> c/u</span></div>
        </div>`;
      insight = `
        ${callout}
        <div class="insight-block">
          <h3>Qué mandó cada executor</h3>
          <div class="breakdown">
            ${row('A', 'Exacto, pero mueve todo el dato por la red. Es el <strong>shuffle</strong> caro.', true)}
            ${row('B', 'Liviano pero <strong>incorrecto</strong>: un promedio de promedios no pondera.', true)}
            ${row('C', 'Lo que hace Spark: <strong>agregación parcial</strong> (combiner). Liviano y exacto.', true)}
          </div>
        </div>
        ${r.wrong ? `<p class="insight-text">En el map se asignaron mal <strong>${r.wrong}</strong> de ${r.points} puntos. El driver no se entera: confía en lo que le mandan.</p>` : ''}
        ${r.missing ? `<p class="insight-text">Faltaron <strong>${r.missing}</strong> particiones: este reduce usó datos incompletos. Spark esperaría esas tareas o las reintentaría.</p>` : ''}`;
    } else if (p === 'spark' || p === 'faults') {
      const recovered = state.lineage.length;
      title = p === 'spark' ? 'Modo Spark' : 'Tolerancia a fallos';
      sub = p === 'spark'
        ? 'Los executors calculan solos. Mismo algoritmo, iterado hasta que los centroides dejan de moverse.'
        : 'Tirá executors abajo en medio del job. El driver no pierde nada: recalcula lo que falta en otro lado.';
      metrics = [['Iteración', iter ? String(iter) : '–'], ['Tareas', job ? `${job.done}/${job.total}` : '–'], ['Costo', lastCost == null ? '–' : nf0.format(lastCost)]];
      if (p === 'faults') metrics.splice(1, 1, ['Caídos', String(deadCount)], ['Recuperadas', String(recovered)]);
      insight = p === 'spark' ? sparkInsight() : faultsInsight();
    }

    $('#plotTitle').textContent = title;
    $('#plotSub').textContent = sub;
    $('#metrics').innerHTML = metrics.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
    setHtml($('#plotLegend'), legend);
    setHtml($('#insight'), insight);
    $('#plotEmpty').hidden = !(p === 'map' && !subs.length);
  }

  function sparkInsight() {
    const h = state.history;
    let chart = '<p class="insight-text">Todavía no corrió ninguna iteración automática.</p>';
    if (h.length) {
      const W = 320;
      const H = 120;
      const max = Math.max(...h.map((x) => x.cost));
      const min = Math.min(...h.map((x) => x.cost));
      const span = Math.max(1, max - min);
      const xs = (i) => (h.length === 1 ? W / 2 : (i / (h.length - 1)) * W);
      const ys = (c) => 8 + (1 - (c - min) / span) * (H - 16);
      const pts = h.map((x, i) => `${xs(i).toFixed(1)},${ys(x.cost).toFixed(1)}`).join(' ');
      chart = `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Costo por iteración">
        <line class="grid" x1="0" x2="${W}" y1="${H}" y2="${H}"/>
        <polygon class="area" points="0,${H} ${pts} ${xs(h.length - 1)},${H}"/>
        <polyline class="line" points="${pts}"/>
        ${h.map((x, i) => `<circle class="pt" r="3" cx="${xs(i)}" cy="${ys(x.cost)}"/>`).join('')}
      </svg>
      <div class="chart-axis mono"><span>it ${h[0].iter} · ${nf0.format(h[0].cost)}</span><span>it ${h[h.length - 1].iter} · ${nf0.format(h[h.length - 1].cost)}</span></div>`;
    }
    const recent = h.slice(-8);
    const sorted = recent.map((x) => x.ms).sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] || 1;
    const maxMs = Math.max(...recent.map((x) => x.ms), 1);
    const bars = recent.map((x) => {
      const slow = x.ms > median * 1.8;
      return `<div class="bar-row"><span class="mono">it ${x.iter}</span><div class="bar-track"><div class="bar-fill${slow ? ' warn' : ''}" style="transform:scaleX(${x.ms / maxMs})"></div></div><span class="mono">${fmtSec(x.ms)}</span></div>`;
    }).join('');
    const hadStraggler = recent.some((x) => x.ms > median * 1.8);
    return `
      <div class="question">${icon('turtle')}<p>¿Qué pasa con toda la iteración si un solo executor es mucho más lento que el resto?</p></div>
      <div class="insight-block">
        <h3>Costo por iteración (WSSSE)</h3>
        ${chart}
        <p class="insight-text">La suma de distancias al cuadrado de cada punto a su centroide. Cuando deja de bajar, el modelo convergió.</p>
      </div>
      ${recent.length ? `<div class="insight-block">
        <h3>Duración de cada iteración</h3>
        <div class="bars">${bars}</div>
        ${hadStraggler ? '<p class="insight-text">Las barras ámbar esperaron a un <strong>straggler</strong>: la iteración termina cuando llega la última tarea.</p>' : ''}
      </div>` : ''}`;
  }

  function faultsInsight() {
    const events = state.lineage;
    const last = events[events.length - 1];
    const n = state.data ? state.data.partitions.length : 0;
    const arrow = icon('chevron-right');
    const dag = last ? `
      <div class="dag" aria-label="Lineage de la partición P${pad(last.pid)}">
        <span class="dag-node">clientes.csv</span>${arrow}
        <span class="dag-node">read.csv</span>${arrow}
        <span class="dag-node">repartition(${n})</span>${arrow}
        <span class="dag-node lost">P${pad(last.pid)} en #${last.from == null ? '–' : pad(last.from)}</span>${arrow}
        <span class="dag-node new">P${pad(last.pid)} en #${pad(last.to)}</span>
      </div>` : '<p class="insight-text">Todavía no se perdió ninguna partición. Tocá un executor y tiralo abajo, o pedile a alguien que cierre la pestaña.</p>';
    const list = events.slice().reverse().slice(0, 6).map((e) => `
      <li>${icon('git-branch')}<span>P${pad(e.pid)}: #${e.from == null ? '–' : pad(e.from)} → #${pad(e.to)} <span class="mono">(${esc(e.reason)})</span></span></li>`).join('');
    return `
      <div class="question">${icon('skull')}<p>Si se cae un celular en medio del job, ¿se pierden sus datos? ¿Hay que empezar de cero?</p></div>
      <div class="insight-block lineage">
        <h3>Lineage de la última partición recuperada</h3>
        ${dag}
        <p class="insight-text">Spark no copia cada partición por las dudas: guarda la <strong>receta</strong> que la generó. Si se pierde, la vuelve a calcular desde el origen en otro executor.</p>
      </div>
      ${events.length ? `<div class="insight-block"><h3>Recuperaciones</h3><ul class="lineage-list">${list}</ul></div>` : ''}`;
  }

  function renderRace() {
    const cfg = state.config;
    const job = state.job && state.job.race ? state.job : null;
    const lanes = [
      { mode: 'hadoop', title: 'Hadoop MapReduce', desc: 'Cada iteración lee la partición del disco y escribe el resultado de vuelta.' },
      { mode: 'spark', title: 'Spark', desc: 'Lee una sola vez y deja la partición en memoria con cache().' },
    ];
    const live = (mode) => {
      if (job && job.mode === mode) {
        const times = job.iterTimes.slice();
        if (job.roundStartedAt) times.push(Date.now() - job.roundStartedAt);
        return { times, total: times.reduce((a, b) => a + b, 0), running: true };
      }
      const r = state.race[mode];
      return r ? { times: r.iterTimes, total: r.total, running: false } : null;
    };
    const data = lanes.map((l) => ({ ...l, run: live(l.mode) }));
    const scale = Math.max(16000, ...data.map((d) => (d.run ? d.run.total : 0)));
    const html = data.map((d) => {
      const blocks = d.run ? d.run.times.map((ms, i) => {
        const read = d.mode === 'hadoop' || i === 0 ? Math.min(cfg.diskReadMs, ms) : 0;
        const write = d.mode === 'hadoop' ? Math.min(cfg.diskWriteMs, Math.max(0, ms - read)) : 0;
        const pct = (v) => `${(v / Math.max(ms, 1)) * 100}%`;
        return `<div class="iter" style="width:${(ms / scale) * 100}%">
          ${read ? `<span class="seg-read" style="width:${pct(read)}"></span>` : ''}
          <span class="seg-compute"></span>
          ${write ? `<span class="seg-write" style="width:${pct(write)}"></span>` : ''}
          ${ms / scale > 0.035 ? `<b>${i + 1}</b>` : ''}
        </div>`;
      }).join('') : '<div class="lane-empty">Sin correr todavía</div>';
      return `<div class="lane">
        <div class="lane-head">
          <div><h3>${d.title}</h3><p>${d.desc}</p></div>
          <span class="lane-total">${d.run ? fmtSec(d.run.total) : '–'}</span>
        </div>
        <div class="lane-track">${blocks}</div>
      </div>`;
    }).join('');
    $('#race').innerHTML = `${html}
      <div class="race-legend">
        <span><i style="background:var(--warn)"></i>Disco: leer y escribir</span>
        <span><i style="background:var(--accent)"></i>Cómputo en los executors</span>
      </div>`;
    const h = state.race.hadoop;
    const s = state.race.spark;
    setHtml($('#raceVerdict'), h && s ? `
      <p class="speedup">${nf1.format(h.total / s.total)}×<small>más rápido con Spark</small></p>
      <p class="insight-text">El cómputo es el mismo; la diferencia es el disco. Casi todo el ML es iterativo (K-Means, regresión logística, descenso por gradiente), y releer los datos en cada vuelta es justo lo que Spark eliminó al dejarlos en memoria.</p>` : '');
  }

  function renderCode() {
    const n = state.data ? state.data.partitions.length : 30;
    const cs = state.centroids.map((c) => `(${nf1.format(c.x)}, ${nf1.format(c.y)})`).join(' ');
    const last = state.history[state.history.length - 1];
    const lines = [
      [
        'spark = SparkSession.builder.<span class="tok-f">appName</span>(<span class="tok-s">"clientes"</span>).<span class="tok-f">getOrCreate</span>()',
        'El <strong>driver</strong>: este proyector. Coordina, no procesa los datos.',
      ],
      [
        'df = spark.read.<span class="tok-f">csv</span>(<span class="tok-s">"clientes.csv"</span>, header=<span class="tok-k">True</span>, inferSchema=<span class="tok-k">True</span>)',
        `El dataset sintético: <span class="mono">${state.data ? state.data.points : '–'}</span> clientes. Todavía no se leyó nada: Spark es <strong>lazy</strong>.`,
      ],
      [
        `df = df.<span class="tok-f">repartition</span>(<span class="tok-n">${n}</span>).<span class="tok-f">cache</span>()`,
        `Una <strong>partición</strong> por celular, guardada <strong>en memoria</strong>. Eso le ganó a Hadoop.`,
      ],
      [
        'data = <span class="tok-f">VectorAssembler</span>(inputCols=[<span class="tok-s">"gasto"</span>, <span class="tok-s">"visitas"</span>], outputCol=<span class="tok-s">"features"</span>).<span class="tok-f">transform</span>(df)',
        'Cada punto (x, y) que tocaste en tu pantalla.',
      ],
      [
        'kmeans = <span class="tok-f">KMeans</span>(k=<span class="tok-n">3</span>, maxIter=<span class="tok-n">12</span>, seed=<span class="tok-n">1</span>)',
        'Tres centroides: violeta, cian y rosa.',
      ],
      [
        'model = kmeans.<span class="tok-f">fit</span>(data)',
        'Las iteraciones: <strong>map</strong> en cada executor, <strong>combine</strong> local (Σx, Σy, n) y <strong>reduce</strong> en el driver. Con reintentos, ejecución especulativa y lineage incluidos.',
      ],
      [
        'model.<span class="tok-f">clusterCenters</span>()',
        `Los centroides de la clase: <span class="mono">${cs}</span>`,
      ],
      [
        'model.summary.trainingCost',
        `El costo que bajaba en cada iteración${last ? `: <span class="mono">${nf0.format(last.cost)}</span>` : ''}.`,
      ],
    ];
    setHtml($('#code'), `<div class="code-line"><pre><span class="tok-k">from</span> pyspark.ml.clustering <span class="tok-k">import</span> KMeans
<span class="tok-k">from</span> pyspark.ml.feature <span class="tok-k">import</span> VectorAssembler</pre><p>MLlib: la librería de machine learning de Spark.</p></div>
      ${lines.map(([c, t]) => `<div class="code-line"><pre>${c}</pre><p>${t}</p></div>`).join('')}`);
  }

  function setHtml(el, html) {
    if (el._html !== html) { el.innerHTML = html; el._html = html; }
  }

  // ------------------------------------------------------------ executors

  const grid = $('#execGrid');
  grid.addEventListener('click', (e) => {
    const cell = e.target.closest('[data-id]');
    if (!cell) return;
    const id = Number(cell.dataset.id);
    if (openMenuId === id) closeMenu();
    else openMenu(id, cell);
  });

  function renderExecutors() {
    const ws = state.workers;
    const seen = new Set();
    if (!ws.length) {
      setHtml(grid, '<p class="exec-empty">Nadie conectado todavía.</p>');
    } else {
      const empty = grid.querySelector('.exec-empty');
      if (empty) { empty.remove(); grid._html = null; }
    }
    for (const w of ws) {
      seen.add(String(w.id));
      let cell = grid.querySelector(`[data-id="${w.id}"]`);
      if (!cell) {
        cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'exec';
        cell.dataset.id = w.id;
        cell.setAttribute('role', 'listitem');
        grid.append(cell);
      }
      cell.dataset.status = w.status;
      cell.textContent = pad(w.id);
      cell.title = `#${pad(w.id)} ${w.name} · ${STATUS[w.status]}${w.partitions.length ? ` · ${w.partitions.map((p) => `P${pad(p)}`).join(', ')}` : ''}`;
      cell.setAttribute('aria-label', cell.title);
    }
    grid.querySelectorAll('.exec').forEach((c) => { if (!seen.has(c.dataset.id)) c.remove(); });

    const online = ws.filter((w) => w.status !== 'offline' && w.status !== 'dead').length;
    $('#execCount').textContent = `${online} activos`;
    const counts = {};
    ws.forEach((w) => { counts[w.status] = (counts[w.status] || 0) + 1; });
    const order = ['busy', 'done', 'idle', 'slow', 'standby', 'dead', 'offline'];
    setHtml($('#execLegend'), order.filter((s) => counts[s]).map((s) => `<li><span class="swatch" data-s="${s}"></span>${STATUS[s]} <b>${counts[s]}</b></li>`).join(''));
  }

  const menu = $('#workerMenu');
  function openMenu(id, anchor) {
    openMenuId = id;
    grid.querySelectorAll('.exec.is-open').forEach((c) => c.classList.remove('is-open'));
    anchor.classList.add('is-open');
    renderMenu();
    menu.hidden = false;
    const r = anchor.getBoundingClientRect();
    const mw = menu.offsetWidth;
    const mh = menu.offsetHeight;
    let left = Math.min(r.left, window.innerWidth - mw - 12);
    let top = r.bottom + 8;
    if (top + mh > window.innerHeight - 12) top = Math.max(12, r.top - mh - 8);
    left = Math.max(12, left);
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
  }
  function closeMenu() {
    openMenuId = null;
    menu.hidden = true;
    grid.querySelectorAll('.exec.is-open').forEach((c) => c.classList.remove('is-open'));
  }
  function renderMenu() {
    const w = state.workers.find((x) => x.id === openMenuId);
    if (!w) { closeMenu(); return; }
    const alive = w.status !== 'dead';
    setHtml(menu, `
      <div class="menu-head"><strong>${esc(w.name)}</strong><span class="mono">#${pad(w.id)}</span></div>
      <dl>
        <dt>Estado</dt><dd>${STATUS[w.status]}</dd>
        <dt>Particiones</dt><dd>${w.partitions.length ? w.partitions.map((p) => `P${pad(p)}`).join(', ') : '–'}</dd>
        <dt>Tareas</dt><dd>${w.tasks}</dd>
        <dt>Enviado</dt><dd>${fmtBytes(w.bytes)}</dd>
      </dl>
      <div class="menu-actions">
        ${alive ? `
          <button class="btn btn-sm" type="button" data-act="slow">${icon('turtle')}${w.slow ? 'Volver a velocidad normal' : 'Volverlo straggler'}</button>
          <button class="btn btn-sm btn-danger" type="button" data-act="kill">${icon('skull')}Tirarlo abajo</button>`
        : `<button class="btn btn-sm" type="button" data-act="revive">${icon('heart-pulse')}Revivir como reserva</button>`}
      </div>`);
  }
  menu.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b || openMenuId == null) return;
    send(`worker:${b.dataset.act}`, { id: openMenuId });
    closeMenu();
  });
  document.addEventListener('pointerdown', (e) => {
    if (openMenuId == null) return;
    if (!menu.contains(e.target) && !e.target.closest('.exec')) closeMenu();
  });

  // ------------------------------------------------------------ panel

  const panel = $('#panel');
  panel.addEventListener('click', (e) => {
    const b = e.target.closest('[data-action]');
    if (!b || b.disabled) return;
    const a = b.dataset.action;
    if (a === 'prev') go(-1);
    else if (a === 'next') go(1);
    else if (a === 'reduce') send('manual:reduce');
    else if (a === 'run') send('job:run');
    else if (a === 'pause') send('job:pause');
    else if (a === 'reset') send('job:reset');
    else if (a === 'chaos') send('chaos', { n: 3 });
    else if (a === 'new-data') send('data:new');
    else if (a === 'race-hadoop') send('race:run', { mode: 'hadoop' });
    else if (a === 'race-spark') send('race:run', { mode: 'spark' });
    else if (a === 'race-reset') send('race:reset');
  });
  panel.addEventListener('change', (e) => {
    if (e.target.id === 'specSwitch') send('speculative', { on: e.target.checked });
  });

  function renderPanel() {
    const p = state.phase;
    const job = state.job;
    const live = state.workers.filter((w) => w.status !== 'offline' && w.status !== 'dead').length;
    const running = job && job.running && !job.stopping;
    const idx = PHASES.findIndex((x) => x.id === p);
    const nav = (nextLabel = 'Siguiente') => `
      <div class="panel-nav">
        <button class="btn btn-ghost btn-sm" type="button" data-action="prev" ${idx === 0 ? 'disabled' : ''}>${icon('arrow-left')}Anterior</button>
        <button class="btn btn-ghost btn-sm" type="button" data-action="next" ${idx === PHASES.length - 1 ? 'disabled' : ''}>${nextLabel}${icon('arrow-right')}</button>
      </div>`;
    const runControls = `
      <div class="panel-row">
        ${running
          ? `<button class="btn btn-primary" type="button" data-action="pause">${icon('pause')}Pausar</button>`
          : `<button class="btn btn-primary" type="button" data-action="run" ${state.data ? '' : 'disabled'}>${icon('play')}${job ? 'Seguir' : 'Ejecutar'}</button>`}
        <button class="btn" type="button" data-action="reset">${icon('rotate-ccw')}Reiniciar</button>
      </div>`;
    const taskProgress = job ? `
      <div class="progress">
        <div class="progress-top"><span>Iteración ${job.iter}${job.stopping ? ' · pausando' : ''}</span><b>${job.done}/${job.total}</b></div>
        <div class="bar-track"><div class="bar-fill" style="transform:scaleX(${job.total ? job.done / job.total : 0})"></div></div>
      </div>` : '';
    let html = '';

    if (p === 'lobby') {
      html = `
        <h2>Esperando executors</h2>
        <p class="panel-text">Cuando estén todos, empezá. El dataset se reparte entre los conectados; los que entren después quedan de reserva.</p>
        <button class="btn btn-primary btn-lg" type="button" data-action="next" ${live ? '' : 'disabled'}>${icon('play')}Empezar con ${live} executor${live === 1 ? '' : 's'}</button>
        ${nav()}`;
    } else if (p === 'map') {
      const m = state.manual;
      const done = m ? m.submissions.length : 0;
      const total = m ? m.owners : 0;
      html = `
        <h2>Map a mano</h2>
        <div class="progress">
          <div class="progress-top"><span>Enviaron</span><b>${done}/${total}</b></div>
          <div class="bar-track"><div class="bar-fill" style="transform:scaleX(${total ? done / total : 0})"></div></div>
        </div>
        <p class="panel-text">Cada uno asigna sus 8 puntos y elige qué mandar. Podés reducir sin esperar a todos: lo que falte queda afuera.</p>
        <div class="panel-actions">
          <button class="btn btn-primary btn-lg" type="button" data-action="reduce" ${done ? '' : 'disabled'}>${icon('layers')}Reducir ${done ? `${done} mensaje${done === 1 ? '' : 's'}` : ''}</button>
          <button class="btn btn-sm btn-ghost" type="button" data-action="new-data">${icon('shuffle')}Repartir de nuevo con los conectados</button>
        </div>
        ${nav('Reduce')}`;
    } else if (p === 'reduce') {
      html = `
        <h2>Reduce</h2>
        <p class="panel-text">Preguntá quién mandó B y por qué ese centroide quedó corrido. Después, mostrá por qué C pesa lo mismo con 8 puntos que con un millón.</p>
        <button class="btn btn-primary btn-lg" type="button" data-action="next">${icon('zap')}Pasar al modo Spark</button>
        ${nav()}`;
    } else if (p === 'spark') {
      html = `
        <h2>Modo Spark</h2>
        ${runControls}
        ${taskProgress}
        <label class="switch"><input type="checkbox" id="specSwitch" ${state.speculative ? 'checked' : ''}><span class="switch-track"></span>Ejecución especulativa</label>
        <p class="hint">${icon('turtle')}<span>Antes de ejecutar, tocá un executor y volvelo straggler. Probá con y sin ejecución especulativa. Si ya convergió, Reiniciar arranca desde cero.</span></p>
        ${nav()}`;
    } else if (p === 'faults') {
      html = `
        <h2>Fallos</h2>
        ${runControls}
        ${taskProgress}
        <button class="btn btn-danger" type="button" data-action="chaos" ${state.data ? '' : 'disabled'}>${icon('skull')}Tirar 3 al azar</button>
        <p class="hint">${icon('wifi-off')}<span>Tocá un executor para tirarlo abajo. Si alguien cierra la pestaña o se le apaga la pantalla, pasa lo mismo de verdad.</span></p>
        ${nav()}`;
    } else if (p === 'hadoop') {
      const busy = Boolean(job);
      html = `
        <h2>Hadoop vs Spark</h2>
        <p class="panel-text">Corré primero Hadoop y después Spark. Los celulares muestran cuándo leen del disco.</p>
        <div class="panel-actions">
          <button class="btn btn-primary" type="button" data-action="race-hadoop" ${busy || !state.data ? 'disabled' : ''}>${icon('hard-drive')}Correr con Hadoop</button>
          <button class="btn btn-primary" type="button" data-action="race-spark" ${busy || !state.data ? 'disabled' : ''}>${icon('zap')}Correr con Spark</button>
          <button class="btn btn-sm btn-ghost" type="button" data-action="race-reset">${icon('rotate-ccw')}Borrar resultados</button>
        </div>
        ${busy ? taskProgress : ''}
        ${nav()}`;
    } else if (p === 'code') {
      html = `
        <h2>Código</h2>
        <p class="panel-text">Recorré línea por línea y preguntá a quién le tocó cada parte.</p>
        ${nav()}`;
    }
    setHtml(panel, html);
  }

  function renderLog() {
    const fmt = new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
    setHtml($('#log'), state.log.slice().reverse().map((l) => `<li data-kind="${l.kind}"><time>${fmt.format(l.t)}</time><span>${esc(l.text)}</span></li>`).join(''));
  }

  // ------------------------------------------------------------ plot

  const plot = {
    canvas: $('#plot'),
    ctx: $('#plot').getContext('2d'),
    w: 0,
    dpr: 1,
    disp: null,
    from: null,
    to: null,
    t0: 0,
    dur: 900,
    arrivals: new Map(),
    colors: {},
    contrast: false,
    dirty: true,

    readColors() {
      const cs = getComputedStyle(document.documentElement);
      ['c0', 'c1', 'c2', 'c-none', 'line', 'line-strong', 'fg', 'fg-2', 'fg-3', 'bg-raised', 'bad', 'accent'].forEach((k) => {
        this.colors[k] = cs.getPropertyValue(`--${k}`).trim();
      });
      this.contrast = document.documentElement.dataset.theme === 'contrast';
      this.dirty = true;
    },

    setCentroids(cs, instant) {
      const target = cs.map((c) => ({ x: c.x, y: c.y }));
      if (!this.disp || instant) { this.disp = target; this.to = target; return; }
      if (this.to && target.every((c, j) => c.x === this.to[j].x && c.y === this.to[j].y)) return;
      this.from = this.disp.map((c) => ({ ...c }));
      this.to = target;
      this.t0 = performance.now();
    },

    resize() {
      const rect = this.canvas.parentElement.getBoundingClientRect();
      this.dpr = Math.min(2, window.devicePixelRatio || 1);
      this.w = Math.round(rect.width * this.dpr);
      this.canvas.width = this.w;
      this.canvas.height = this.w;
      this.dirty = true;
    },
  };
  plot.readColors();

  function layoutPlot() {
    const view = $('.view-plot');
    const stage = $('#stage');
    if (!view.classList.contains('is-active')) return;
    const cs = getComputedStyle(stage);
    const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
    const head = $('.plot-head').offsetHeight + $('.plot-legend').offsetHeight + 1.75 * rem + 4;
    const availH = stage.clientHeight - padY - head;
    const availW = stage.clientWidth - padX - 19 * rem;
    const narrow = window.innerWidth <= 960;
    const size = narrow ? stage.clientWidth - padX : Math.max(280, Math.min(availH, availW));
    view.style.setProperty('--plot-w', `${Math.floor(size)}px`);
    plot.resize();
  }
  new ResizeObserver(() => layoutPlot()).observe($('#stage'));

  function shapePath(ctx, kind, x, y, r) {
    ctx.beginPath();
    if (kind === 0) ctx.arc(x, y, r, 0, Math.PI * 2);
    else if (kind === 1) { const s = r * 0.9; ctx.rect(x - s, y - s, s * 2, s * 2); }
    else {
      const R = r * 1.25;
      ctx.moveTo(x, y - R);
      ctx.lineTo(x + R * 0.866, y + R * 0.5);
      ctx.lineTo(x - R * 0.866, y + R * 0.5);
      ctx.closePath();
    }
  }

  function drawPlot(now) {
    const { ctx, w, colors: C, contrast } = plot;
    if (!w || !state) return;
    const d = plot.dpr;
    ctx.clearRect(0, 0, w, w);

    const L = w * 0.085;
    const R = w - w * 0.035;
    const T = w * 0.035;
    const B = w - w * 0.085;
    const X = (v) => L + (v / 100) * (R - L);
    const Y = (v) => B - (v / 100) * (B - T);
    const pr = Math.max(3.2 * d, w / 175) * (contrast ? 1.2 : 1);
    const cr = Math.max(9 * d, w / 46);
    const lw = (contrast ? 2 : 1) * d;
    const cc = (j) => C[`c${j}`];

    // grid
    ctx.lineWidth = d;
    ctx.strokeStyle = C.line;
    ctx.fillStyle = C['fg-3'];
    ctx.font = `${11 * d}px "Atkinson Hyperlegible Mono", ui-monospace, monospace`;
    for (let v = 0; v <= 100; v += 25) {
      ctx.beginPath(); ctx.moveTo(X(v), T); ctx.lineTo(X(v), B); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(L, Y(v)); ctx.lineTo(R, Y(v)); ctx.stroke();
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText(String(v), X(v), B + 6 * d);
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText(String(v), L - 8 * d, Y(v));
    }
    ctx.font = `${12 * d}px "Atkinson Hyperlegible Next", ui-sans-serif, sans-serif`;
    ctx.fillStyle = C['fg-2'];
    ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
    ctx.fillText('gasto mensual (miles de $) →', R, w - 8 * d);
    ctx.save();
    ctx.translate(14 * d, T);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'right'; ctx.textBaseline = 'top';
    ctx.fillText('visitas por año →', 0, 0);
    ctx.restore();

    // animate centroids
    let animating = false;
    if (plot.from && plot.to) {
      const t = Math.min(1, (now - plot.t0) / plot.dur);
      const e = easeOut(t);
      plot.disp = plot.to.map((c, j) => ({ x: plot.from[j].x + (c.x - plot.from[j].x) * e, y: plot.from[j].y + (c.y - plot.from[j].y) * e }));
      if (t >= 1) plot.from = null;
      else animating = true;
    }
    const cents = plot.disp;
    const phase = state.phase;

    const dot = (x, y, kind, color, r = pr) => {
      shapePath(ctx, kind, x, y, r);
      ctx.fillStyle = color;
      ctx.fill();
      if (contrast) { ctx.lineWidth = d; ctx.strokeStyle = C.fg; ctx.stroke(); }
    };

    if ((phase === 'map' || phase === 'reduce') && state.manual) {
      const startX = w + 40 * d;
      const startY = w * 0.5;
      for (const s of state.manual.submissions) {
        const t0 = plot.arrivals.get(s.id) || 0;
        const a = easeOut(Math.min(1, (now - t0) / 750));
        if (a < 1) animating = true;
        const at = (x, y) => [startX + (X(x) - startX) * a, startY + (Y(y) - startY) * a];
        ctx.globalAlpha = Math.min(1, a * 1.4);
        if (s.option === 'A' && s.points) {
          for (const pt of s.points) { const [x, y] = at(pt.x, pt.y); dot(x, y, pt.c, cc(pt.c)); }
        } else if (s.option === 'B') {
          s.avgs.forEach((avg, j) => {
            if (!avg) return;
            const [x, y] = at(avg.x, avg.y);
            shapePath(ctx, j, x, y, pr * 1.9);
            ctx.setLineDash([3 * d, 3 * d]);
            ctx.lineWidth = 1.75 * d;
            ctx.strokeStyle = cc(j);
            ctx.stroke();
            ctx.setLineDash([]);
          });
        } else if (s.option === 'C') {
          s.sums.forEach((sum, j) => {
            if (!sum.n) return;
            const [x, y] = at(sum.sx / sum.n, sum.sy / sum.n);
            shapePath(ctx, j, x, y, pr * (0.9 + Math.sqrt(sum.n) * 0.55));
            ctx.globalAlpha = Math.min(1, a * 1.4) * 0.55;
            ctx.fillStyle = cc(j);
            ctx.fill();
            ctx.globalAlpha = Math.min(1, a * 1.4);
            ctx.lineWidth = lw;
            ctx.strokeStyle = cc(j);
            ctx.stroke();
          });
        }
        ctx.globalAlpha = 1;
      }
    } else if (points && (phase === 'spark' || phase === 'faults')) {
      for (const pt of points) {
        const j = nearest(pt, cents);
        dot(X(pt.x), Y(pt.y), j, cc(j));
      }
      // trails
      const trail = state.trail;
      if (trail.length > 1) {
        for (let j = 0; j < cents.length; j++) {
          ctx.beginPath();
          trail.forEach((snap, i) => {
            const x = X(snap[j].x);
            const y = Y(snap[j].y);
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          });
          ctx.lineTo(X(cents[j].x), Y(cents[j].y));
          ctx.strokeStyle = cc(j);
          ctx.globalAlpha = 0.7;
          ctx.lineWidth = 2 * d;
          ctx.lineJoin = 'round';
          ctx.stroke();
          ctx.globalAlpha = 1;
          for (const snap of trail.slice(0, -1)) {
            ctx.beginPath();
            ctx.arc(X(snap[j].x), Y(snap[j].y), 2.5 * d, 0, Math.PI * 2);
            ctx.fillStyle = C['bg-raised'];
            ctx.fill();
            ctx.lineWidth = 1.5 * d;
            ctx.stroke();
          }
        }
      }
    }

    // reduce: where centroids came from and where they should be
    const result = phase === 'reduce' && state.manual && state.manual.result;
    if (result) {
      result.before.forEach((b, j) => {
        const c = cents[j];
        ctx.setLineDash([4 * d, 4 * d]);
        ctx.strokeStyle = C['fg-3'];
        ctx.lineWidth = 1.5 * d;
        ctx.beginPath(); ctx.moveTo(X(b.x), Y(b.y)); ctx.lineTo(X(c.x), Y(c.y)); ctx.stroke();
        ctx.setLineDash([]);
        shapePath(ctx, j, X(b.x), Y(b.y), cr * 0.55);
        ctx.strokeStyle = cc(j);
        ctx.globalAlpha = 0.5;
        ctx.stroke();
        ctx.globalAlpha = 1;
      });
      if (!plot.from) {
        result.correct.forEach((g, j) => {
          if (result.error[j] < 0.75) return;
          const c = cents[j];
          ctx.strokeStyle = C.bad;
          ctx.lineWidth = 2 * d;
          ctx.beginPath(); ctx.moveTo(X(c.x), Y(c.y)); ctx.lineTo(X(g.x), Y(g.y)); ctx.stroke();
          shapePath(ctx, j, X(g.x), Y(g.y), cr);
          ctx.setLineDash([5 * d, 4 * d]);
          ctx.strokeStyle = C.fg;
          ctx.stroke();
          ctx.setLineDash([]);
          const label = `error ${nf1.format(result.error[j])}`;
          ctx.font = `500 ${12 * d}px "Atkinson Hyperlegible Mono", ui-monospace, monospace`;
          const tw = ctx.measureText(label).width;
          const lx = Math.min(X(g.x) + cr + 8 * d, R - tw - 8 * d);
          const ly = Y(g.y) - cr - 6 * d;
          ctx.fillStyle = C.bad;
          ctx.beginPath();
          ctx.roundRect(lx - 6 * d, ly - 10 * d, tw + 12 * d, 20 * d, 5 * d);
          ctx.fill();
          ctx.fillStyle = C['bg-raised'];
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(label, lx, ly + 0.5 * d);
        });
      }
    }

    // centroids
    cents.forEach((c, j) => {
      const x = X(c.x);
      const y = Y(c.y);
      shapePath(ctx, j, x, y, cr + 3 * d);
      ctx.fillStyle = C['bg-raised'];
      ctx.fill();
      shapePath(ctx, j, x, y, cr);
      ctx.fillStyle = cc(j);
      ctx.fill();
      ctx.lineWidth = (contrast ? 2.5 : 1.5) * d;
      ctx.strokeStyle = contrast ? C.fg : C['bg-raised'];
      ctx.stroke();
    });

    return animating;
  }

  let lastRace = 0;
  function frame(now) {
    if (state && VIEW_OF[state.phase] === 'plot') {
      if (plot.dirty || plot.from || plot.animating) {
        plot.dirty = false;
        plot.animating = drawPlot(now);
      }
    }
    if (state && state.phase === 'hadoop' && state.job && state.job.race && now - lastRace > 100) {
      lastRace = now;
      renderRace();
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  document.fonts && document.fonts.ready.then(() => { plot.dirty = true; });
})();
