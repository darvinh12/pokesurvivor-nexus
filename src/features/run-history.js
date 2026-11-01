// Historial de partidas, ranking personal y autopsia.
// Alt+R abre una ventana con las últimas partidas (gráfica de daño en el
// tiempo) y tu propia tier list por Pokémon. Al morir, un panel junto a la
// pantalla de fin explica qué te derrotó. Los datos vienen de NX.telemetry,
// que se evalúa después de este archivo: se accede a él de forma perezosa.
// Ventana inspirada en la de PokeSurvivor Plus (MIT).
(() => {
  const KEY = 'hist';
  const AKEY = 'hist:autopsy';
  const MIN_TIME = 30; // partidas más cortas no cuentan para el ranking

  const runs = () => (NX.telemetry ? NX.telemetry.history() : (NX.store.get('tele:runs', []) || []));
  const fmt = (n) => {
    n = +n || 0;
    if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e4) return (n / 1e3).toFixed(1) + 'k';
    return String(Math.round(n));
  };
  const median = (a) => {
    if (!a.length) return 0;
    const s = a.slice().sort((x, y) => x - y), m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };
  const fmtDate = (t) => {
    const d = new Date(t);
    return d.toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' });
  };
  const OUTCOME = { death: 'Derrota', over: 'Fin de partida', quit: 'Abandonada' };

  // ---- ranking personal
  // Puntaje de 0 a 100: 60 % mediana de tiempo sobrevivido y 40 % mediana de
  // DPS, cada una frente a tu mejor Pokémon. Con pocas partidas se acerca a
  // la mediana general (equivale a sumar 2 partidas promedio).
  const METHOD = 'Puntaje: 60 % mediana de tiempo y 40 % mediana de DPS frente a tu mejor Pokémon; con pocas partidas se acerca al promedio.';
  NX.personalRank = () => {
    const all = runs().filter((r) => r && r.dex && (r.time || 0) >= MIN_TIME);
    if (!all.length) return [];
    const by = new Map();
    for (const r of all) {
      const g = by.get(r.dex) || { dex: r.dex, name: r.mon || '?', t: [], d: [] };
      g.t.push(r.time || 0);
      g.d.push(r.dps || 0);
      by.set(r.dex, g);
    }
    const gT = median(all.map((r) => r.time || 0)), gD = median(all.map((r) => r.dps || 0)), K = 2;
    const rows = [...by.values()].map((g) => {
      const n = g.t.length, mt = median(g.t), md = median(g.d);
      return { dex: g.dex, name: g.name, runs: n, medTime: mt, medDps: md, adjT: (n * mt + K * gT) / (n + K), adjD: (n * md + K * gD) / (n + K) };
    });
    const maxT = Math.max(1, ...rows.map((r) => r.adjT)), maxD = Math.max(1, ...rows.map((r) => r.adjD));
    for (const r of rows) {
      r.score = Math.round(100 * (0.6 * (r.adjT / maxT) + 0.4 * (r.adjD / maxD)));
      r.tier = r.score >= 85 ? 'S' : r.score >= 70 ? 'A' : r.score >= 55 ? 'B' : r.score >= 40 ? 'C' : 'D';
      delete r.adjT; delete r.adjD;
    }
    return rows.sort((a, b) => b.score - a.score);
  };

  // ---- gráficas en canvas
  function canvas(w, h) {
    const c = document.createElement('canvas');
    const dpr = NX.clamp(NX.realDpr(), 1, 3);
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
    c.style.width = w + 'px';
    c.style.height = h + 'px';
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    return [c, g];
  }
  // Línea con relleno. pts: números; max: tope del eje vertical.
  function line(g, w, h, pts, max, color, fill) {
    if (!pts || pts.length < 2) return;
    const top = Math.max(1e-9, max || Math.max(...pts));
    g.beginPath();
    pts.forEach((v, i) => {
      const x = (i / (pts.length - 1)) * (w - 4) + 2, y = h - 3 - (Math.max(0, v) / top) * (h - 8);
      if (i) g.lineTo(x, y); else g.moveTo(x, y);
    });
    g.lineWidth = 2;
    g.strokeStyle = color;
    g.stroke();
    if (fill) {
      g.lineTo(w - 2, h - 3);
      g.lineTo(2, h - 3);
      g.closePath();
      g.fillStyle = fill;
      g.fill();
    }
  }
  function bars(g, w, h, vals, color) {
    if (!vals || !vals.length) return;
    const top = Math.max(1, ...vals), bw = (w - 4) / vals.length;
    g.fillStyle = color;
    vals.forEach((v, i) => {
      const bh = (Math.max(0, v) / top) * (h - 8);
      g.fillRect(2 + i * bw + 1, h - 3 - bh, Math.max(1, bw - 2), bh);
    });
  }
  function grid(g, w, h) {
    g.fillStyle = 'rgba(0,0,0,.28)';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,.08)';
    g.lineWidth = 1;
    for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(0, (h * i) / 4 + 0.5); g.lineTo(w, (h * i) / 4 + 0.5); g.stroke(); }
  }

  // ---- ventana de historial y ranking
  NX.css(`#nexus-hist{position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;background:rgba(4,8,20,.6)}
#nexus-hist.hidden{display:none}
#nexus-hist .nx-hw{width:min(760px,calc(100vw - 24px));max-height:calc(100vh - 40px);overflow:auto;box-sizing:border-box;padding:14px 16px;color:#fff;
  background:linear-gradient(#24407f,#152a5c);border:2px solid #f4f8ff;outline:2px solid #0b1838;border-radius:10px;
  box-shadow:inset 0 0 0 2px #5b83d6,0 6px 0 #0a1430;font:13px/1.35 var(--font,'Pixelify',system-ui,sans-serif)}
#nexus-hist h2{margin:0 0 6px;font-size:19px;color:#ffd23f;display:flex;justify-content:space-between;align-items:center;gap:8px}
#nexus-hist h4{margin:10px 0 4px;font-size:13px;color:#9fd0ff}
#nexus-hist button{font:inherit;font-size:12px;background:#0b1838;color:#fff;border:2px solid #5b83d6;border-radius:6px;cursor:pointer;padding:2px 10px}
#nexus-hist button.on,#nexus-hist button:hover{border-color:#ffd23f}
#nexus-hist .nx-tabs{display:flex;gap:6px;margin-bottom:8px}
#nexus-hist .nx-cols{display:grid;grid-template-columns:230px 1fr;gap:12px}
@media (max-width:640px){#nexus-hist .nx-cols{grid-template-columns:1fr}}
#nexus-hist .nx-list{display:grid;gap:3px;max-height:440px;overflow:auto;padding-right:2px}
#nexus-hist .nx-it{text-align:left;display:grid;grid-template-columns:1fr auto;gap:0 6px;padding:4px 7px;border-width:1px}
#nexus-hist .nx-it small{color:#b9cbf0}
#nexus-hist .nx-it.death b{color:#ffb3b3}
#nexus-hist .nx-tiles{display:grid;grid-template-columns:repeat(3,1fr);gap:5px}
#nexus-hist .nx-tiles div{background:rgba(0,0,0,.25);border-radius:7px;padding:4px 8px}
#nexus-hist .nx-tiles small{display:block;color:#b9cbf0;font-size:11px}
#nexus-hist .nx-tiles b{font-size:15px}
#nexus-hist .nx-mv{display:grid;grid-template-columns:1fr auto;gap:2px 8px;font-size:12px}
#nexus-hist .nx-leg{font-size:11px;color:#b9cbf0;margin-top:2px}
#nexus-hist .nx-leg i{display:inline-block;width:10px;height:3px;margin:0 4px 2px 8px;vertical-align:middle}
#nexus-hist table{width:100%;border-collapse:collapse;font-size:12.5px}
#nexus-hist th{text-align:left;color:#9fd0ff;font-weight:600;padding:3px 6px}
#nexus-hist td{padding:3px 6px;border-top:1px solid rgba(255,255,255,.08)}
#nexus-hist .nx-tier{display:inline-block;min-width:22px;text-align:center;border-radius:5px;font-weight:700;color:#0b1838}
#nexus-hist .nx-note{font-size:12px;opacity:.8;margin:4px 0}
#nexus-hist .nx-foot{display:flex;gap:6px;justify-content:flex-end;margin-top:10px}`);
  const TIER_COL = { S: '#ff7b7b', A: '#ffb36b', B: '#ffe66b', C: '#9be37b', D: '#7fc8ff' };

  let win = null, view = 'runs', pick = 0;

  function tiles(r) {
    const t = [['Tiempo', NX.fmtTime(r.time)], ['Nivel', r.level], ['Bajas', fmt(r.kills)], ['Daño', fmt(r.dmg)], ['DPS', fmt(r.dps)], ['Recibido', fmt(r.taken)]];
    return `<div class="nx-tiles">${t.map(([k, v]) => `<div><small>${k}</small><b>${NX.esc(v)}</b></div>`).join('')}</div>`;
  }

  function renderRuns(box) {
    const list = runs();
    if (!list.length) {
      box.insertAdjacentHTML('beforeend', '<p class="nx-note">Aún no hay partidas guardadas. Se guardan al terminar una partida o al salir de una que duró más de un minuto.</p>');
      return;
    }
    pick = NX.clamp(pick, 0, list.length - 1);
    const r = list[pick];
    const cols = document.createElement('div');
    cols.className = 'nx-cols';
    cols.innerHTML = `<div class="nx-list">${list.map((h, i) =>
      `<button type="button" data-i="${i}" class="nx-it ${h.outcome === 'death' ? 'death' : ''} ${i === pick ? 'on' : ''}"><b>${NX.esc(h.mon)}${h.shiny ? ' ★' : ''}</b><span>${NX.fmtTime(h.time)}</span><small>${fmtDate(h.at)}</small><small>Nv ${h.level}${h.coop ? ' · co-op' : ''}</small></button>`).join('')}</div>
      <div class="nx-det"></div>`;
    box.appendChild(cols);
    cols.querySelector('.nx-list').addEventListener('click', (e) => {
      const b = e.target.closest('[data-i]');
      if (!b) return;
      pick = +b.dataset.i;
      render();
    });
    const det = cols.querySelector('.nx-det');
    const cause = r.outcome === 'death' && r.killer ? ` · ${NX.esc(r.killer)}${r.killerHow ? ' (' + NX.esc(r.killerHow) + ')' : ''}` : '';
    det.innerHTML = `<h4 style="margin-top:0">${NX.esc(r.mon)}${r.shiny ? ' ★' : ''} · ${fmtDate(r.at)}</h4>
      <p class="nx-note">${r.interrupted ? 'Interrumpida (se cerró la pestaña)' : OUTCOME[r.outcome] || 'Partida'}${cause}</p>${tiles(r)}
      <h4>Daño en el tiempo</h4><div class="nx-chart"></div>
      <div class="nx-leg"><i style="background:#ffd23f"></i>daño acumulado<i style="background:#5be08a"></i>vida</div>
      <h4>Movimientos con más daño</h4>
      <div class="nx-mv">${(r.moves || []).map((m) => `<span>${NX.esc(m.name)}</span><span>${fmt(m.dmg)}</span>`).join('') || '<span>Sin datos</span>'}</div>`;
    const W = Math.max(260, Math.min(470, (win.querySelector('.nx-hw').clientWidth || 700) - 280)), H = 120;
    const [c, g] = canvas(W, H);
    grid(g, W, H);
    const s = r.series || {};
    line(g, W, H, s.hp, 1, '#5be08a', null);
    line(g, W, H, s.dmg, 0, '#ffd23f', 'rgba(255,210,63,.18)');
    det.querySelector('.nx-chart').appendChild(c);
  }

  function renderRank(box) {
    const rank = NX.personalRank();
    box.insertAdjacentHTML('beforeend', `<p class="nx-note">${NX.esc(METHOD)} Cuentan partidas de ${MIN_TIME} s o más.</p>`);
    if (!rank.length) { box.insertAdjacentHTML('beforeend', '<p class="nx-note">Juega algunas partidas para ver tu ranking.</p>'); return; }
    box.insertAdjacentHTML('beforeend', `<table><thead><tr><th>Tier</th><th>Pokémon</th><th>Partidas</th><th>Tiempo (mediana)</th><th>DPS (mediana)</th><th>Puntaje</th></tr></thead><tbody>${
      rank.map((r) => `<tr><td><span class="nx-tier" style="background:${TIER_COL[r.tier]}">${r.tier}</span></td><td>${NX.esc(r.name)}</td><td>${r.runs}</td><td>${NX.fmtTime(r.medTime)}</td><td>${fmt(r.medDps)}</td><td>${r.score}</td></tr>`).join('')}</tbody></table>`);
  }

  function render() {
    const box = win.querySelector('.nx-hw');
    box.innerHTML = `<h2>Historial de partidas <button type="button" data-act="close">Cerrar</button></h2>
      <div class="nx-tabs"><button type="button" data-v="runs" class="${view === 'runs' ? 'on' : ''}">Partidas</button><button type="button" data-v="rank" class="${view === 'rank' ? 'on' : ''}">Ranking personal</button></div>`;
    if (view === 'rank') renderRank(box); else renderRuns(box);
    box.insertAdjacentHTML('beforeend', `<div class="nx-foot"><span class="nx-note" style="margin-right:auto">Alt+R abre y cierra · la partida no se pausa</span>
      <button type="button" data-act="export">Exportar JSON</button><button type="button" data-act="clear">Borrar historial</button></div>`);
  }

  function toggle(force) {
    if (!win) return;
    const open = force != null ? force : win.classList.contains('hidden');
    if (open) { pick = 0; render(); }
    win.classList.toggle('hidden', !open);
  }

  // ---- autopsia
  NX.css(`#nexus-autopsy{position:fixed;right:16px;top:70px;z-index:99990;width:300px;max-height:calc(100vh - 90px);overflow:auto;box-sizing:border-box;
  padding:10px 12px;color:#fff;font:12.5px/1.3 var(--font,'Pixelify',system-ui,sans-serif);background:linear-gradient(#3a1f3f,#22122e);
  border:2px solid #f4f8ff;outline:2px solid #0b1838;border-radius:9px;box-shadow:inset 0 0 0 2px #b0476a,0 4px 0 #0a1430}
#nexus-autopsy.hidden{display:none}
#nexus-autopsy h3{margin:0 0 4px;font-size:16px;color:#ff9aa8;display:flex;justify-content:space-between;align-items:center}
#nexus-autopsy h4{margin:8px 0 3px;font-size:12px;color:#ffc7d0}
#nexus-autopsy button{font:inherit;font-size:11px;background:#0b1838;color:#fff;border:2px solid #b0476a;border-radius:5px;cursor:pointer;padding:1px 8px}
#nexus-autopsy .nx-kb{background:rgba(0,0,0,.3);border-radius:6px;padding:5px 8px}
#nexus-autopsy .nx-kb b{color:#ffd23f}
#nexus-autopsy .nx-hits{display:grid;grid-template-columns:auto 1fr auto auto;gap:1px 6px;font-size:11.5px}
#nexus-autopsy .nx-hits span:nth-child(4n+1),#nexus-autopsy .nx-hits span:nth-child(4n){color:#c9b3c9}
#nexus-autopsy .nx-hits span:nth-child(4n+3){color:#ff8a96;text-align:right}
#nexus-autopsy small{color:#c9b3c9}`);
  let aut = null, autShownFor = 0, autClosed = 0;

  function renderAutopsy(r) {
    const k = r.killerInfo;
    const hits = (r.hits || []).slice().reverse();
    const killTxt = k
      ? `<b>${NX.esc(k.name)}</b>${k.how ? ' · ' + NX.esc(k.how) : ''}${k.boss ? ' · jefe' : ''}${k.legend ? ' · legendario' : ''}<br><small>Golpe de ${fmt(k.dmg)} en el ${NX.fmtTime(k.t)}</small>`
      : 'No se pudo identificar el golpe final.';
    aut.innerHTML = `<h3>Autopsia <button type="button" data-act="close">Cerrar</button></h3>
      <div class="nx-kb">${killTxt}</div>
      <h4>Últimos golpes recibidos</h4>
      <div class="nx-hits">${hits.map((h) => `<span>${NX.fmtTime(h.t)}</span><span>${NX.esc(h.name)}${h.how ? ' <small>(' + NX.esc(h.how) + ')</small>' : ''}</span><span>-${fmt(h.dmg)}</span><span>${fmt(h.hp)}</span>`).join('') || '<span></span><span>Sin golpes registrados</span><span></span><span></span>'}</div>
      ${(r.sources || []).length ? `<h4>Daño recibido por fuente</h4><div class="nx-hits">${r.sources.slice(0, 4).map((s) => `<span></span><span>${NX.esc(s.name)}</span><span>-${fmt(s.dmg)}</span><span></span>`).join('')}</div>` : ''}
      <h4>Vida en los últimos ${Math.max(1, (r.recentHp || []).length)} s</h4><div class="nx-c1"></div>
      <h4>Bajas por minuto</h4><div class="nx-c2"></div>`;
    const W = 272;
    {
      const [c, g] = canvas(W, 64);
      grid(g, W, 64);
      line(g, W, 64, r.recentHp, 1, '#5be08a', 'rgba(91,224,138,.18)');
      aut.querySelector('.nx-c1').appendChild(c);
    }
    {
      const [c, g] = canvas(W, 56);
      grid(g, W, 56);
      if ((r.kpm || []).length) bars(g, W, 56, r.kpm, '#ff9aa8');
      aut.querySelector('.nx-c2').appendChild(c);
      if (!(r.kpm || []).length) aut.querySelector('.nx-c2').insertAdjacentHTML('beforeend', '<small>Partida de menos de un minuto.</small>');
    }
  }

  function autopsyTick() {
    if (!aut) return;
    const r = NX.telemetry && NX.telemetry.last();
    const want = NX.isOn(AKEY) && r && r.outcome === 'death' && NX.shown('scr-over') && !NX.inRun() &&
      Date.now() - r.endedAt < 10 * 60 * 1000 && autClosed !== r.endedAt;
    if (want && autShownFor !== r.endedAt) { autShownFor = r.endedAt; renderAutopsy(r); }
    aut.classList.toggle('hidden', !want);
  }

  const stopAll = (el) => {
    for (const ev of ['pointerdown', 'mousedown', 'touchstart', 'click', 'wheel']) el.addEventListener(ev, (e) => e.stopPropagation());
    el.addEventListener('keydown', (e) => { if (e.key !== 'Escape') e.stopPropagation(); });
  };

  NX.feature({
    key: KEY,
    label: 'Historial y ranking',
    needs: () => !!NX.telemetry,
    setup() {
      NX.onReady(() => {
        win = document.createElement('div');
        win.id = 'nexus-hist';
        win.className = 'hidden';
        win.innerHTML = '<div class="nx-hw"></div>';
        stopAll(win);
        win.addEventListener('click', (e) => {
          if (e.target === win) { toggle(false); return; }
          const b = e.target.closest('button');
          if (!b) return;
          if (b.dataset.v) { view = b.dataset.v; render(); return; }
          const act = b.dataset.act;
          if (act === 'close') toggle(false);
          else if (act === 'export') NX.download('nexus-historial.json', JSON.stringify(runs(), null, 1), 'application/json');
          else if (act === 'clear') {
            if (!b.dataset.armed) { b.dataset.armed = '1'; b.textContent = 'Pulsa otra vez para confirmar'; return; }
            NX.telemetry.clearHistory();
            pick = 0;
            render();
          }
        });
        document.body.appendChild(win);
      });
      NX.keys.bind((e) => e.altKey && e.code === 'KeyR' && !e.ctrlKey && !e.metaKey && NX.isOn(KEY), () => { toggle(); return true; });
      NX.keys.bind((e) => e.key === 'Escape' && win && !win.classList.contains('hidden'), () => { toggle(false); return true; });
    },
  });

  NX.feature({
    key: AKEY,
    label: 'Autopsia',
    needs: () => !!NX.telemetry,
    setup() {
      NX.onReady(() => {
        aut = document.createElement('div');
        aut.id = 'nexus-autopsy';
        aut.className = 'hidden';
        stopAll(aut);
        aut.addEventListener('click', (e) => {
          if (e.target.closest('[data-act="close"]')) { const r = NX.telemetry.last(); autClosed = r ? r.endedAt : 0; autopsyTick(); }
        });
        document.body.appendChild(aut);
        setInterval(() => { try { autopsyTick(); } catch (err) { NX.trip(AKEY, err); } }, 250);
      });
    },
  });

  NX.settings.section({
    key: KEY,
    tab: 'Datos',
    title: 'Historial y ranking personal',
    keywords: 'partidas tier list ranking alt+r',
    render(el) {
      el.appendChild(NX.ui.toggle('Activado', 'on:' + KEY, true));
      el.appendChild(NX.ui.note('Alt+R abre tus últimas partidas y tu tier list personal por Pokémon. ' + METHOD));
      el.appendChild(NX.ui.button('Abrir historial', () => { if (NX.togglePanel) NX.togglePanel(); toggle(true); }));
    },
  });
  NX.settings.section({
    key: AKEY,
    tab: 'Datos',
    title: 'Autopsia',
    keywords: 'muerte derrota golpe final',
    render(el) {
      el.appendChild(NX.ui.toggle('Activado', 'on:' + AKEY, true));
      el.appendChild(NX.ui.note('Al morir, muestra junto a la pantalla de fin qué te dio el golpe final, los últimos golpes, la vida y las bajas por minuto.'));
    },
  });
})();
