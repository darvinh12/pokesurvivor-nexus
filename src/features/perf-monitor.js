// Monitor de rendimiento: costo medio y máximo de cada módulo en milisegundos
// por segundo. Suma las tareas del planificador común (NX.every), las capas de
// dibujo (NX.hudLayers) y, mientras el monitor está a la vista, las funciones
// del juego más calientes envueltas desde fuera. Permite apagar un módulo desde
// la tabla y trae una superposición pequeña opcional para la partida.
(() => {
  const KEY = 'perfmon';
  const S_OVERLAY = 'perf:overlay';
  // Funciones del juego que se miden. Su costo incluye lo que Nexus añade dentro.
  const HOT = [['HUD', 'draw'], ['World', 'drawGround'], ['World', 'drawLiquid'], ['World', 'drawProp'], ['World', 'drawVignette'],
    ['World', 'collide'], ['Tiles', 'paintChunk'], ['Combat', 'tick'], ['EnemyMgr', 'update'], ['Projectiles', 'update']];
  const S_DEEP = 'perf:deep';
  const CORE_LABEL = { nexus: 'Núcleo de Nexus', prog: 'Progreso Nexus (ventanas y píldora)' };

  let tableBox = null, overlay = null, live = false;
  const fmt = (v) => (v >= 10 ? v.toFixed(0) : v >= 1 ? v.toFixed(1) : v.toFixed(2));

  // Medir capas y funciones del juego solo con el monitor a la vista.
  const panelOpen = () => !!tableBox && document.body.contains(tableBox) && NX.shown('nexus-panel');
  const refreshLive = () => { live = NX.isOn(KEY) && (panelOpen() || !!NX.store.get(S_OVERLAY, false) || !!NX.store.get(S_DEEP, false)); };

  // ---- capas del HUD
  function wrapLayers() {
    for (const L of NX.hudLayers) {
      for (const which of ['under', 'over']) {
        const f = L[which];
        if (typeof f !== 'function' || f.__nxPerf) continue;
        const name = 'capa ' + (which === 'under' ? 'inferior' : 'superior');
        // Si otro módulo envuelve esta capa después, solo mide el envoltorio de fuera.
        const w = function () {
          if (!live || L.__nxPerfBusy) return f.apply(this, arguments);
          L.__nxPerfBusy = true;
          const t0 = performance.now();
          try { return f.apply(this, arguments); } finally { L.__nxPerfBusy = false; NX.perf.add(L.key, 'layer', performance.now() - t0, name); }
        };
        w.__nxPerf = true;
        L[which] = w;
      }
    }
  }

  // ---- funciones del juego
  function wrapHot(ns) {
    for (const [mod, fn] of HOT) {
      const M = ns[mod];
      if (!M || typeof M[fn] !== 'function' || M[fn].__nxPerf) continue;
      const orig = M[fn], id = mod + '.' + fn;
      let depth = 0;
      const w = function () {
        if (!live || depth) return orig.apply(this, arguments);
        depth++;
        const t0 = performance.now();
        try { return orig.apply(this, arguments); } finally { depth--; NX.perf.add(id, 'game', performance.now() - t0); }
      };
      w.__nxPerf = true;
      M[fn] = w;
    }
  }

  // ---- datos agregados por módulo
  function modules() {
    const feats = new Map(NX.featureList().map((f) => [f.key, f]));
    const by = new Map();
    for (const s of NX.perf.stats()) {
      if (s.kind === 'game') continue;
      let m = by.get(s.key);
      if (!m) {
        const f = feats.get(s.key);
        m = { key: s.key, label: (f && f.label) || CORE_LABEL[s.key] || s.key, feature: !!f, on: f ? NX.isOn(s.key) : true, avg: 0, peak: 0, max: 0, parts: [] };
        by.set(s.key, m);
      }
      m.avg += s.avg;
      m.peak += s.peak;
      m.max = Math.max(m.max, s.max);
      m.parts.push((s.kind === 'task' ? 'tarea ' : '') + (s.name || (s.kind === 'task' ? 'periódica' : 'capa')));
    }
    return [...by.values()].sort((a, b) => b.avg - a.avg);
  }
  const gameRows = () => NX.perf.stats().filter((s) => s.kind === 'game').sort((a, b) => b.avg - a.avg);
  const totalNexus = (list) => list.reduce((s, m) => s + m.avg, 0);

  // ---- tabla del panel
  NX.css(`#nexus-panel .nx-pm-head{display:flex;flex-wrap:wrap;gap:6px 14px;margin:4px 0 6px;font-size:13px}
#nexus-panel .nx-pm-head b{color:#ffd23f}
#nexus-panel .nx-pm-t{width:100%;border-collapse:collapse;font-size:12px}
#nexus-panel .nx-pm-t th{text-align:left;color:#9fd0ff;font-weight:400;border-bottom:1px solid #5b83d6;padding:3px 4px}
#nexus-panel .nx-pm-t td{padding:3px 4px;border-bottom:1px solid rgba(91,131,214,.25);vertical-align:middle}
#nexus-panel .nx-pm-t td.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
#nexus-panel .nx-pm-t small{display:block;opacity:.6;font-size:11px}
#nexus-panel .nx-pm-t tr.off td{opacity:.5}
#nexus-panel .nx-pm-t .hot{color:#ff8a5f}#nexus-panel .nx-pm-t .warm{color:#ffd23f}
#nexus-panel .nx-pm-t button{font:inherit;font-size:11px;background:#0b1838;color:#fff;border:1px solid #f4f8ff;border-radius:5px;cursor:pointer;padding:1px 7px;min-height:0}
@media (pointer:coarse){#nexus-panel .nx-pm-t button{min-height:34px;padding:2px 10px}}
#nexus-perf{position:fixed;left:8px;top:50%;transform:translateY(-50%);z-index:9996;pointer-events:none;padding:4px 8px;border-radius:7px;
  font:11px/1.35 var(--font,'Pixelify',monospace);color:#e8f0ff;background:rgba(8,16,40,.72);border:1px solid rgba(244,248,255,.3);white-space:nowrap}
#nexus-perf.hidden{display:none}#nexus-perf b{color:#ffd23f}`);

  const heat = (v) => (v >= 3 ? 'hot' : v >= 1 ? 'warm' : '');

  function renderTable() {
    if (!tableBox) return;
    const list = modules(), games = gameRows();
    const tasks = NX.every.list();
    const activeTasks = tasks.filter((t) => t.active).length;
    let html = `<div class="nx-pm-head"><span>FPS <b>${NX.perf.fps() || '--'}</b></span><span>Nexus <b>${fmt(totalNexus(list))} ms/s</b></span>` +
      `<span>Tareas activas <b>${activeTasks}</b> de ${tasks.length}</span><span>${NX.inRun() ? 'En partida' : 'Fuera de partida'}</span></div>`;
    html += '<table class="nx-pm-t"><tr><th>Módulo</th><th class="n">Media</th><th class="n">Máximo</th><th></th></tr>';
    const shown = list.filter((m) => m.avg >= 0.005 || m.peak >= 0.01).slice(0, 40);
    if (!shown.length) html += '<tr><td colspan="4">Midiendo… vuelve en un par de segundos.</td></tr>';
    for (const m of shown) {
      const parts = [...new Set(m.parts)].join(', ');
      const btn = m.feature ? `<button type="button" data-k="${NX.esc(m.key)}" data-on="${m.on ? 0 : 1}">${m.on ? 'Apagar' : 'Encender'}</button>` : '';
      html += `<tr class="${m.on ? '' : 'off'}"><td>${NX.esc(m.label)}<small>${NX.esc(parts)}</small></td>` +
        `<td class="n ${heat(m.avg)}">${fmt(m.avg)}</td><td class="n ${heat(m.peak)}">${fmt(m.peak)}</td><td class="n">${btn}</td></tr>`;
    }
    html += '</table>';
    if (games.length) {
      html += '<table class="nx-pm-t" style="margin-top:8px"><tr><th>Función del juego (con lo que Nexus añade)</th><th class="n">Media</th><th class="n">Máximo</th><th class="n">Llamadas/s</th></tr>';
      for (const g of games) html += `<tr><td>${NX.esc(g.key)}</td><td class="n ${heat(g.avg)}">${fmt(g.avg)}</td><td class="n">${fmt(g.peak)}</td><td class="n">${Math.round(g.calls)}</td></tr>`;
      html += '</table>';
    }
    tableBox.innerHTML = html;
    tableBox.querySelectorAll('button[data-k]').forEach((b) => b.addEventListener('click', () => {
      const k = b.dataset.k, on = b.dataset.on === '1';
      NX.setEnabled(k, on);
      const f = NX.featureList().find((x) => x.key === k);
      NX.toast(`${f ? f.label : k}: ${on ? 'encendido' : 'apagado'}`);
      renderTable();
    }));
  }

  // ---- superposición en partida
  function renderOverlay() {
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'nexus-perf';
      overlay.className = 'hidden';
      document.body.appendChild(overlay);
    }
    const want = NX.isOn(KEY) && !!NX.store.get(S_OVERLAY, false);
    overlay.classList.toggle('hidden', !want);
    if (!want) return;
    const list = modules();
    const top = list.slice(0, 3).filter((m) => m.avg >= 0.05).map((m) => `${NX.esc(m.label)} ${fmt(m.avg)}`).join('<br>');
    overlay.innerHTML = `<b>${NX.perf.fps() || '--'}</b> FPS · Nexus <b>${fmt(totalNexus(list))}</b> ms/s${top ? '<br>' + top : ''}`;
  }

  NX.feature({
    key: KEY,
    label: 'Monitor de rendimiento',
    needs: (ns) => ns.HUD && typeof ns.HUD.draw === 'function',
    setup(ns) {
      // Se envuelve tarde para quedar por fuera de los demás módulos.
      setTimeout(() => { try { wrapHot(ns); } catch (err) { NX.trip(KEY, err); } }, 4000);
      NX.every(2000, () => { wrapLayers(); refreshLive(); }, { key: KEY, name: 'enganche' });
      NX.every(1000, () => { refreshLive(); if (panelOpen()) renderTable(); }, { key: KEY, name: 'tabla' });
      NX.every(1000, () => { if (overlay || NX.store.get(S_OVERLAY, false)) NX.onReady(renderOverlay); }, { key: KEY, name: 'superposición' });
      NX.perfMonitor = { modules, games: gameRows, render: renderTable };
    },
  });

  NX.settings.section({
    key: KEY,
    tab: 'Rendimiento',
    title: 'Monitor de rendimiento',
    keywords: 'rendimiento monitor costo cpu ms fps lento módulos tareas apagar',
    render(el) {
      el.appendChild(NX.ui.note('Costo de cada módulo en milisegundos de CPU por segundo (media y máximo de los últimos 10 s). Las capas de dibujo y las funciones del juego solo se miden con esta tabla abierta, con la superposición activa o con la medición permanente.'));
      el.appendChild(NX.ui.toggle('Superposición pequeña (partida y menú)', S_OVERLAY, false, () => { refreshLive(); renderOverlay(); }));
      el.appendChild(NX.ui.toggle('Medir capas y funciones del juego siempre', S_DEEP, false, refreshLive));
      const row = document.createElement('div');
      row.appendChild(NX.ui.button('Reiniciar medición', () => { NX.perf.reset(); renderTable(); }));
      el.appendChild(row);
      tableBox = document.createElement('div');
      el.appendChild(tableBox);
      live = NX.isOn(KEY);
      wrapLayers();
      renderTable();
    },
  });
})();
