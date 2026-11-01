// Enciclopedia (F1 o Alt+I): en partida, tus movimientos, objeto, clima y
// debilidades; fuera de ella, un buscador de movimientos, objetos y Pokémon,
// y la tabla de tipos. Todo se lee de los datos del juego.
(() => {
  const KEY = 'enc';
  const TABS = [['run', 'En partida'], ['moves', 'Movimientos'], ['items', 'Objetos'], ['mons', 'Pokémon'], ['types', 'Tipos']];
  const LIST_MAX = 80;

  NX.css(`#nexus-enc{position:fixed;inset:0;z-index:100002;display:flex;align-items:center;justify-content:center;background:rgba(4,8,20,.55)}
#nexus-enc.hidden{display:none}
#nexus-enc .nx-ebox{width:min(880px,calc(100vw - 24px));height:min(640px,calc(100vh - 40px));box-sizing:border-box;padding:12px 14px;display:flex;flex-direction:column;
  background:linear-gradient(#24407f,#152a5c);color:#fff;border:2px solid #f4f8ff;outline:2px solid #0b1838;border-radius:10px;
  box-shadow:inset 0 0 0 2px #5b83d6,0 6px 0 #0a1430;font:13px/1.35 var(--font,'Pixelify',system-ui,sans-serif)}
#nexus-enc h2{margin:0 0 6px;font-size:19px;color:#ffd23f;display:flex;justify-content:space-between;align-items:center;gap:10px}
#nexus-enc h2 small{font-size:11px;color:#b9cbf0;font-weight:400;margin-left:auto}
#nexus-enc .nx-x{background:#0b1838;color:#fff;border:2px solid #f4f8ff;border-radius:6px;font:inherit;font-size:13px;cursor:pointer;padding:2px 10px}
#nexus-enc .nx-etabs{display:flex;flex-wrap:wrap;gap:5px;margin-bottom:8px}
#nexus-enc .nx-etabs button{font:inherit;font-size:12px;background:#0b1838;color:#cfe0ff;border:1px solid #5b83d6;border-radius:12px;padding:2px 11px;cursor:pointer}
#nexus-enc .nx-etabs button.on{background:#ffd23f;color:#0b1838;border-color:#ffd23f}
#nexus-enc .nx-etabs button:disabled{opacity:.4;cursor:default}
#nexus-enc .nx-ebody{flex:1;min-height:0;display:flex;gap:10px}
#nexus-enc .nx-ecol{display:flex;flex-direction:column;min-height:0;width:42%}
#nexus-enc .nx-eq{font:inherit;background:#0b1838;color:#fff;border:1px solid #5b83d6;border-radius:6px;padding:5px 8px;margin-bottom:6px}
#nexus-enc .nx-elist{flex:1;overflow:auto;display:flex;flex-direction:column;gap:2px;padding-right:4px}
#nexus-enc .nx-elist button{display:flex;align-items:center;gap:6px;text-align:left;font:inherit;font-size:12px;background:rgba(11,24,56,.6);color:#fff;border:1px solid transparent;border-radius:6px;padding:3px 7px;cursor:pointer}
#nexus-enc .nx-elist button:hover{border-color:#5b83d6}
#nexus-enc .nx-elist button.on{border-color:#ffd23f;background:rgba(255,210,63,.12)}
#nexus-enc .nx-elist button .g{margin-left:auto;display:flex;gap:2px;align-items:center}
#nexus-enc .nx-elist .n{color:#b9cbf0;min-width:34px}
#nexus-enc .nx-edet{flex:1;overflow:auto;padding:8px 10px;border-radius:8px;background:rgba(0,0,0,.22)}
#nexus-enc .nx-edet.full{width:100%}
#nexus-enc .nx-sec{margin:0 0 10px}
#nexus-enc .nx-sec>h4{margin:0 0 5px;font-size:13px;color:#9fd0ff}
#nexus-enc .nx-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:8px}
#nexus-enc .nx-grid>.nx-card{padding:7px 9px;border-radius:8px;background:rgba(11,24,56,.7);border:1px solid rgba(91,131,214,.5)}
#nexus-enc .nx-kv2{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:2px 12px;font-size:12px}
#nexus-enc .nx-kv2 span{color:#b9cbf0}
#nexus-enc .nx-mvs{display:flex;flex-wrap:wrap;gap:4px}
#nexus-enc .nx-mvs button{font:inherit;font-size:11px;padding:1px 8px;border-radius:7px;border:0;color:#fff;cursor:pointer;text-shadow:1px 1px 0 #0a1430}
#nexus-enc .nx-note2{font-size:11px;color:#b9cbf0;margin:4px 0}
#nexus-enc .nx-note2 a{color:inherit;text-decoration:underline}
#nexus-enc table.nx-chart{border-collapse:collapse;font-size:10px;margin:0 auto}
#nexus-enc table.nx-chart th,#nexus-enc table.nx-chart td{width:26px;height:20px;text-align:center;padding:0}
#nexus-enc table.nx-chart thead th{writing-mode:vertical-rl;transform:rotate(180deg);height:58px;font-weight:400}
#nexus-enc table.nx-chart tbody th{text-align:right;padding-right:4px;width:auto;white-space:nowrap;font-weight:400}
#nexus-enc table.nx-chart td{border:1px solid rgba(255,255,255,.06)}
#nexus-enc table.nx-chart td.u{background:rgba(70,200,110,.55)}#nexus-enc table.nx-chart td.d{background:rgba(220,70,90,.5)}
#nexus-enc table.nx-chart td.z{background:rgba(20,20,30,.9);color:#ff8a96}`);

  let root = null, tab = NX.store.get('enc:tab', 'moves'), query = '', sel = { moves: null, items: null, mons: null }, runSig = '', pausedByUs = false;

  // ---- piezas de contenido
  function moveCard(G, id, pl) {
    const def = G.moveDef(id);
    if (!def) return '';
    const own = pl && (pl.moves || []).find((m) => m.id === id);
    const m = own || G.instance(id, 1);
    const max = def.maxLvl || 5;
    let extra = '';
    if (!own) {
      const mx = G.instance(id, max);
      if (mx) extra += `<hr><div class="lv">En Nv. ${max}</div><div class="st">${G.rowsHtml(G.moveRows(mx, pl))}</div>`;
    }
    const ev = G.evolvedCopy(own || G.instance(id, max));
    if (ev && !(own && own.evolved)) extra += `<hr><div class="lv">Evolucionado: ${G.esc(G.T(ev.name, 'move'))}</div><div class="st">${G.rowsHtml(G.moveRows(ev, pl))}</div>`;
    const eff = G.effHtml(G.offense(def.type), (v) => (v > 1 ? 'eficaz contra' : v > 0.6 ? 'poco eficaz' : 'muy poco eficaz'));
    if (eff) extra += `<hr><div class="lv">Daño por tipo del rival</div>${eff}`;
    return G.moveTip(m, pl || null, { extra, noNext: !own, lvLabel: own ? null : `Nv. máx. ${max}` });
  }
  function learnedBy(G, id) {
    const ns = NX.ns, P = (ns.Moves && ns.Moves.POOL) || {};
    const types = Object.keys(P).filter((t) => (P[t] || []).includes(id));
    const tm = ns.TM_MOVES && Array.isArray(ns.TM_MOVES[id]) ? ns.TM_MOVES[id].length : 0;
    const parts = [];
    if (types.length) parts.push(types.includes('normal') ? 'cualquier Pokémon (movimiento Normal)' : 'Pokémon de tipo ' + types.map(G.typeName).join(', '));
    if (tm) parts.push(`${tm} Pokémon por MT`);
    return parts.length ? `<div class="nx-note2">Lo aprenden: ${G.esc(parts.join(' · '))}.</div>` : '';
  }
  function monDetail(G, dex) {
    const ns = NX.ns, p = ns.DEX_BY && ns.DEX_BY[dex];
    if (!p) return '';
    const st = [['Vida', p.hp], ['Velocidad', p.spd], ['Ataque', p.pa != null ? '×' + G.num(p.pa, 2) : null], ['At. Esp.', p.sa != null ? '×' + G.num(p.sa, 2) : null],
      ['Defensa', p.df], ['Def. Esp.', p.sd], ['Total base', p.bst], ['Generación', p.gen]].filter(([, v]) => v != null);
    let html = `<div class="nx-card"><div class="hd"><b>${G.esc(G.monName(dex))}</b><span class="lv">Nº ${String(dex).padStart(3, '0')}</span></div>
      <div class="tags">${(p.types || []).map(G.typeChip).join('')}</div>
      <div class="nx-kv2">${st.map(([k, v]) => `<div><span>${k}</span> <b>${G.esc(v)}</b></div>`).join('')}</div></div>`;
    const r = G.tierOf(dex);
    if (r) {
      html += `<div class="nx-sec" style="margin-top:8px"><h4>SurvivorTiers</h4><div>${G.tierBadge(r)} Tier <b>${G.esc(r.tier)}</b> · puesto ${r.rank} de ${G.tiers().total} · build ${G.esc(G.styleName(r.style))}</div>
        <div class="nx-mvs" style="margin-top:4px">${r.moves.map((id) => mvBtn(G, id)).join('')}</div><div class="nx-note2">${G.tierMetaHtml()}</div></div>`;
    }
    html += `<div class="nx-sec"><h4>Daño que recibe por tipo</h4>${G.effHtml(G.defense(p.types), (v) => (v > 1 ? 'débil' : v > 0 ? 'resiste' : 'inmune')) || '<div class="nx-note2">Sin debilidades ni resistencias.</div>'}</div>`;
    let pool = [];
    try { pool = ns.Moves.poolFor(p, true) || []; } catch (_) { pool = []; }
    const start = typeof ns.startMoveOf === 'function' ? ns.startMoveOf(dex) : null;
    let tms = [];
    try { tms = typeof ns.TM_OF === 'function' ? (ns.TM_OF(dex) || []).filter((id) => G.moveDef(id) && !pool.includes(id)) : []; } catch (_) { tms = []; }
    if (start && G.moveDef(start)) html += `<div class="nx-sec"><h4>Movimiento inicial</h4><div class="nx-mvs">${mvBtn(G, start)}</div></div>`;
    if (pool.length) html += `<div class="nx-sec"><h4>Aparecen en sus cartas (${pool.length})</h4><div class="nx-mvs">${pool.map((id) => mvBtn(G, id)).join('')}</div></div>`;
    if (tms.length) html += `<div class="nx-sec"><h4>Por MT (${tms.length})</h4><div class="nx-mvs">${tms.map((id) => mvBtn(G, id)).join('')}</div></div>`;
    return html;
  }
  const mvBtn = (G, id) => { const d = G.moveDef(id); return `<button type="button" data-mv="${G.esc(id)}" style="background:${G.esc(G.typeColor(d && d.type))}">${G.esc(G.moveName(id))}</button>`; };

  function runView(G, ns) {
    const pl = NX.me();
    if (!pl || !NX.inRun()) return '<div class="nx-note2">No estás en una partida. Usa las otras pestañas para buscar.</div>';
    const mon = pl.mon || ns.DEX_BY[pl.dex] || {};
    let html = `<div class="nx-sec"><h4>${G.esc(G.monName(pl.dex))} · Nv. ${pl.level || 1}</h4><div>${(mon.types || []).map(G.typeChip).join('')}</div>
      ${G.effHtml(G.defense(mon.types), (v) => (v > 1 ? 'débil' : v > 0 ? 'resiste' : 'inmune'))}</div>`;
    const moves = pl.moves || [];
    html += `<div class="nx-sec"><h4>Tus movimientos (${moves.length}/${pl.maxMoves || moves.length})</h4><div class="nx-grid">${moves.map((m) => {
      const eff = G.effHtml(G.offense(m.type), (v) => (v > 1 ? 'eficaz contra' : 'poco eficaz'));
      return `<div class="nx-card">${G.moveTip(m, pl, { extra: eff ? '<hr>' + eff : '' })}</div>`;
    }).join('')}</div></div>`;
    const extra = [];
    if (pl.item) extra.push(`<div class="nx-card">${G.itemTip(pl.item)}</div>`);
    if (ns.Weather && ns.Weather.current) extra.push(`<div class="nx-card">${G.weatherTip(ns.Weather.current, pl)}</div>`);
    const r = G.tierOf(pl.dex);
    if (r) {
      const own = new Set(moves.map((m) => m.id));
      extra.push(`<div class="nx-card"><div class="hd"><b style="color:#ffd23f">Build recomendada</b>${G.tierBadge(r)}</div><div class="ds">${G.esc(G.cap(G.styleName(r.style)))} · ${r.moves.filter((id) => own.has(id)).length}/${r.moves.length} en tu partida</div>
        <div class="nx-mvs">${r.moves.map((id) => mvBtn(G, id).replace('<button', `<button title="${own.has(id) ? 'Ya lo llevas' : 'Aún no lo llevas'}"` + (own.has(id) ? '' : ' style="opacity:.6"'))).join('')}</div><div class="nx-note2">${G.tierMetaHtml()}</div></div>`);
    }
    if (extra.length) html += `<div class="nx-sec"><h4>Objeto, clima y build</h4><div class="nx-grid">${extra.join('')}</div></div>`;
    return html;
  }
  function typeChart(G) {
    const ts = G.TYPES();
    let h = '<table class="nx-chart"><thead><tr><th></th>' + ts.map((t) => `<th style="color:${G.esc(G.typeColor(t))}" title="${G.esc(G.typeName(t))}">${G.esc(G.typeName(t))}</th>`).join('') + '</tr></thead><tbody>';
    for (const a of ts) {
      h += `<tr><th style="color:${G.esc(G.typeColor(a))}">${G.esc(G.typeName(a))}</th>`;
      for (const d of ts) {
        const v = G.mult(a, [d]);
        const c = v > 1.01 ? 'u' : v < 0.99 ? (v <= 0.5 ? 'z' : 'd') : '';
        h += `<td class="${c}" title="${G.esc(G.typeName(a))} contra ${G.esc(G.typeName(d))}: ×${G.num(v, 2)}">${c ? G.num(v, 2) : ''}</td>`;
      }
      h += '</tr>';
    }
    return h + '</tbody></table><div class="nx-note2" style="text-align:center">Filas: tipo del ataque · columnas: tipo del rival · multiplicadores del juego.</div>';
  }

  // ---- listas con buscador
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  function listItems(G, ns) {
    const q = norm(query.trim());
    if (tab === 'moves') {
      return (ns.Moves.ALL || Object.values(ns.Moves.BY_ID)).map((d) => ({ id: d.id, label: G.moveName(d.id), key: norm(G.moveName(d.id) + ' ' + d.name + ' ' + d.id + ' ' + G.typeName(d.type)), g: G.typeChip(d.type) }))
        .filter((x) => !q || x.key.includes(q)).sort((a, b) => a.label.localeCompare(b.label, 'es'));
    }
    if (tab === 'items') {
      return ((ns.Items && ns.Items.LIST) || []).map((d) => ({ id: d.id, label: G.tr(d.name), key: norm(G.tr(d.name) + ' ' + d.name + ' ' + d.id) }))
        .filter((x) => !q || x.key.includes(q)).sort((a, b) => a.label.localeCompare(b.label, 'es'));
    }
    if (tab === 'mons') {
      const out = [];
      for (const p of ns.DEX || []) {
        const name = G.monName(p.dex);
        if (q && !norm(name + ' ' + p.dex + ' ' + (p.types || []).map(G.typeName).join(' ')).includes(q) && String(p.dex) !== q.replace('#', '')) continue;
        const r = G.tierOf(p.dex);
        out.push({ id: p.dex, label: name, n: '#' + String(p.dex).padStart(3, '0'), g: (p.types || []).map(G.typeChip).join('') + (r ? G.tierBadge(r) : '') });
      }
      return out;
    }
    return [];
  }

  function render() {
    const G = NX.gd, ns = NX.ns;
    if (!root || !G || !ns) return;
    const inRun = NX.inRun();
    if (tab === 'run' && !inRun) tab = 'moves';
    const box = root.querySelector('.nx-ebox');
    box.innerHTML = `<h2>Enciclopedia <small>F1 o Alt+I abre y cierra · Esc cierra</small><button class="nx-x" type="button">Cerrar</button></h2>
      <div class="nx-etabs">${TABS.map(([k, t]) => `<button type="button" data-tab="${k}" class="${k === tab ? 'on' : ''}" ${k === 'run' && !inRun ? 'disabled title="Solo en partida"' : ''}>${t}</button>`).join('')}</div>
      <div class="nx-ebody"></div>`;
    const body = box.querySelector('.nx-ebody');
    if (tab === 'run' || tab === 'types') {
      body.innerHTML = `<div class="nx-edet full">${tab === 'run' ? runView(G, ns) : typeChart(G)}</div>`;
      runSig = tab === 'run' ? sigOf() : '';
      return;
    }
    body.innerHTML = `<div class="nx-ecol"><input class="nx-eq" type="search" placeholder="Buscar por nombre, tipo o número…" value="${G.esc(query)}"><div class="nx-elist"></div></div><div class="nx-edet"></div>`;
    paintList();
    paintDetail();
  }
  function paintList() {
    const G = NX.gd, ns = NX.ns;
    const list = root.querySelector('.nx-elist');
    if (!list) return;
    const items = listItems(G, ns);
    if (sel[tab] == null && items.length) sel[tab] = items[0].id;
    list.innerHTML = items.slice(0, LIST_MAX).map((x) => `<button type="button" data-id="${G.esc(x.id)}" class="${String(x.id) === String(sel[tab]) ? 'on' : ''}">${x.n ? `<span class="n">${G.esc(x.n)}</span>` : ''}<span>${G.esc(x.label)}</span><span class="g">${x.g || ''}</span></button>`).join('') +
      (items.length > LIST_MAX ? `<div class="nx-note2">${items.length - LIST_MAX} más: afina la búsqueda.</div>` : '') +
      (!items.length ? '<div class="nx-note2">Nada coincide con la búsqueda.</div>' : '');
  }
  function paintDetail() {
    const G = NX.gd;
    const det = root.querySelector('.nx-edet');
    if (!det) return;
    const id = sel[tab];
    const pl = NX.inRun() ? NX.me() : null;
    let html = '';
    if (tab === 'moves' && id != null) html = `<div class="nx-card">${moveCard(G, id, pl)}${learnedBy(G, id)}</div>`;
    else if (tab === 'items' && id != null) html = `<div class="nx-card">${G.itemTip(id)}</div>${pl && pl.item === id ? '<div class="nx-note2">Lo llevas en esta partida.</div>' : ''}`;
    else if (tab === 'mons' && id != null) html = monDetail(G, +id);
    det.innerHTML = html || '<div class="nx-note2">Elige un elemento de la lista.</div>';
  }
  // Firma de la partida, para repintar "En partida" solo si algo cambió.
  function sigOf() {
    const pl = NX.me();
    if (!pl) return '';
    const wx = NX.ns.Weather && NX.ns.Weather.current;
    return [pl.level, pl.item, (pl.moves || []).map((m) => m.id + m.lvl + (m.evolved ? 'e' : '')).join(','), JSON.stringify(pl.statsTaken || {}), wx ? wx.name + Math.ceil((wx.left || 0) / 5) : ''].join('|');
  }

  function isOpen() { return !!root && !root.classList.contains('hidden'); }
  function toggle(force) {
    if (!root || !NX.ns || !NX.gd) return;
    const open = force != null ? force : !isOpen();
    if (open) {
      if (NX.inRun()) tab = 'run';
      // Abrir durante el combate pone la pausa del juego, si está disponible.
      const g = NX.ns.Game;
      if (NX.inRun() && g && g.state === 'playing' && NX.store.get('enc:pause', true) && typeof g.togglePause === 'function') {
        try { g.togglePause(); pausedByUs = g.state === 'paused'; } catch (_) { /* sigue sin pausa */ }
      }
      render();
    } else if (pausedByUs) {
      // Al cerrar, se quita la pausa que puso la enciclopedia.
      pausedByUs = false;
      const g = NX.ns.Game;
      if (g && g.state === 'paused' && typeof g.togglePause === 'function') { try { g.togglePause(); } catch (_) { /* queda en pausa */ } }
    }
    root.classList.toggle('hidden', !open);
    if (open) { const q = root.querySelector('.nx-eq'); if (q && !NX.inRun()) q.focus(); }
  }

  NX.feature({
    key: KEY,
    label: 'Enciclopedia',
    needs: (ns) => ns.Moves && ns.Moves.BY_ID && ns.DEX && ns.DEX_BY && ns.Types && NX.gd,
    setup() {
      NX.onReady(() => {
        root = document.createElement('div');
        root.id = 'nexus-enc';
        root.className = 'hidden';
        root.innerHTML = '<div class="nx-ebox"></div>';
        // Que los clics y teclas de la enciclopedia no lleguen al juego.
        for (const ev of ['pointerdown', 'mousedown', 'touchstart', 'click', 'wheel', 'keyup']) root.addEventListener(ev, (e) => e.stopPropagation());
        root.addEventListener('keydown', (e) => {
          if (e.key === 'Escape' || e.code === 'F1') { e.preventDefault(); e.stopPropagation(); toggle(false); return; }
          e.stopPropagation();
        });
        root.addEventListener('click', (e) => {
          try {
            if (e.target === root) return toggle(false);
            const t = e.target.closest('button');
            if (!t) return;
            if (t.classList.contains('nx-x')) return toggle(false);
            if (t.dataset.tab) { tab = t.dataset.tab; query = ''; NX.store.set('enc:tab', tab); render(); return; }
            if (t.dataset.mv) { tab = 'moves'; query = ''; sel.moves = t.dataset.mv; render(); return; }
            if (t.dataset.id != null && t.closest('.nx-elist')) {
              sel[tab] = t.dataset.id;
              root.querySelectorAll('.nx-elist button.on').forEach((b) => b.classList.remove('on'));
              t.classList.add('on');
              paintDetail();
            }
          } catch (err) { NX.trip(KEY, err); }
        });
        root.addEventListener('input', (e) => {
          if (!e.target.classList.contains('nx-eq')) return;
          query = e.target.value;
          try { paintList(); } catch (err) { NX.trip(KEY, err); }
        });
        document.body.appendChild(root);
        // "En partida" se repinta si cambian tus movimientos, nivel u objeto.
        setInterval(() => {
          if (!isOpen() || tab !== 'run') return;
          try { const s = sigOf(); if (s !== runSig) render(); } catch (err) { NX.trip(KEY, err); }
        }, 1000);
      });
      NX.keys.bind((e) => !e.repeat && (e.code === 'F1' || (e.altKey && !e.ctrlKey && e.code === 'KeyI')), () => {
        if (!NX.isOn(KEY)) return false;
        toggle();
        return true;
      });
      NX.keys.bind((e) => e.key === 'Escape' && isOpen(), () => { toggle(false); return true; });
    },
  });

  NX.settings.section({
    key: KEY,
    tab: 'Datos',
    title: 'Enciclopedia',
    keywords: 'enciclopedia buscador movimientos objetos pokemon tipos f1',
    render(el) {
      el.appendChild(NX.ui.toggle('Activado (F1 o Alt+I)', 'on:' + KEY, true));
      el.appendChild(NX.ui.toggle('Pausar el juego al abrirla en combate', 'enc:pause', true));
      el.appendChild(NX.ui.button('Abrir enciclopedia', () => { if (NX.togglePanel) NX.togglePanel(); toggle(true); }));
    },
  });
})();
