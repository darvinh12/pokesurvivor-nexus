// Herramientas de la Pokédex. El juego ya trae búsqueda por nombre o número,
// filtro de tipo, Tengo / Me faltan, Shiny, Favoritos, rarezas, regiones y
// orden por número, nombre, rareza y recientes. Aquí se suma lo que falta:
// orden por tipo, por estadísticas y poseídos primero; filtros extra (segundo
// tipo, shiny que faltan, con nota); estrella de favorito en la cuadrícula;
// comparador de dos Pokémon y notas por Pokémon.
// La carga por tandas de la cuadrícula se resuelve como en PokeSurvivor Plus
// (MIT): se guarda el observador que dibuja las siguientes 48 casillas.
(() => {
  const KEY = 'dex';
  const ns = () => NX.ns;
  const $ = (id) => document.getElementById(id);
  const T = (s) => { try { return typeof ns().T === 'function' ? ns().T(s) : s; } catch (_) { return s; } };
  const icon = (name, px) => { try { return ns().Icons.html(name, px); } catch (_) { return ''; } };
  const pad = (n) => String(n).padStart(3, '0');
  const fold = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  const st = Object.assign({ sort: '', type2: '', shinyMiss: false, noted: false }, NX.store.get('dex:state', {}));
  const saveState = () => NX.store.set('dex:state', st);
  let notes = NX.store.get('dex:notes', {}) || {};
  let cmp = NX.store.get('dex:cmp', [null, null]) || [null, null];

  // ---- cuadrícula completa
  let moreIO = null;
  function captureIO() {
    const IO = window.IntersectionObserver;
    if (!IO || IO.__nx) return;
    const W = function (cb, opts) {
      const io = new IO(cb, opts);
      const observe = io.observe;
      io.observe = function (t) {
        if (t && t.classList && t.classList.contains('dex-more')) moreIO = { io, cb };
        return observe.apply(this, arguments);
      };
      return io;
    };
    W.prototype = IO.prototype;
    W.__nx = true;
    window.IntersectionObserver = W;
  }
  function loadAll(grid) {
    for (let i = 0; i < 80; i++) {
      const m = grid.querySelector('.dex-more');
      if (!m || !moreIO) return;
      try { moreIO.cb([{ isIntersecting: true, target: m }], moreIO.io); } catch (_) { return; }
      if (grid.querySelector('.dex-more') === m) return; // no avanzó
    }
  }

  const cellDex = (c) => {
    if (!c.dataset.nxDex) { const no = c.querySelector('.no'); c.dataset.nxDex = no ? parseInt(no.textContent, 10) || 0 : 0; }
    return +c.dataset.nxDex;
  };
  const owns = (dex) => { const s = ns().DB.save; return !!(s && s.owned && s.owned[dex]); };
  const typeOrder = () => Object.keys(ns().U.TYPE_NAME || {});

  function passes(dex) {
    const p = ns().DEX_BY[dex];
    if (!p) return true;
    if (st.type2 && !p.types.includes(st.type2)) return false;
    if (st.shinyMiss) { let has = false; try { has = ns().Sprites.hasShiny(dex); } catch (_) { has = false; } if (!has || ns().DB.ownsShiny(dex)) return false; }
    if (st.noted && !notes[dex]) return false;
    return true;
  }
  function sortKey() {
    const D = ns().DEX_BY, order = typeOrder();
    const ti = (t) => (t ? order.indexOf(t) : -1);
    if (st.sort === 'type') return (a, b) => { const A = D[a] || {}, B = D[b] || {}; const ta = A.types || [], tb = B.types || []; return ti(ta[0]) - ti(tb[0]) || ti(ta[1]) - ti(tb[1]) || a - b; };
    if (st.sort === 'bst') return (a, b) => ((D[b] || {}).bst || 0) - ((D[a] || {}).bst || 0) || a - b;
    if (st.sort === 'own') return (a, b) => (owns(b) ? 1 : 0) - (owns(a) ? 1 : 0);
    return null;
  }

  let mo = null, pending = false;
  const active = () => NX.isOn(KEY) && !!(st.sort || st.type2 || st.shinyMiss || st.noted);
  function apply() {
    pending = false;
    const grid = $('dex-grid');
    if (!grid || !ns().DB.save) return;
    mo.disconnect();
    try {
      const on = active();
      if (on) loadAll(grid);
      const favOn = NX.isOn(KEY) && NX.store.get('dex:favStar', true);
      const cells = [...grid.children].filter((c) => c.classList.contains('cell'));
      let shown = 0;
      for (const c of cells) {
        const dex = cellDex(c);
        const hide = on && !passes(dex);
        c.classList.toggle('nx-hide', hide);
        if (!hide) shown++;
        let star = c.querySelector(':scope > .nx-fav');
        if (favOn && !c.classList.contains('locked') && dex) {
          if (!star) {
            star = document.createElement('button');
            star.type = 'button';
            star.className = 'nx-fav';
            star.dataset.nodrag = '1';
            c.appendChild(star);
          }
          const fav = ns().DB.isFav(dex);
          if (star.dataset.on !== String(fav)) {
            star.dataset.on = String(fav);
            star.innerHTML = icon(fav ? 'star' : 'starDim', 12);
            star.title = fav ? 'Quitar de favoritos' : 'Marcar como favorito';
          }
        } else if (star) star.remove();
      }
      const cmpFn = on && sortKey();
      if (cmpFn) {
        const idx = new Map(cells.map((c, i) => [c, i]));
        const sorted = cells.slice().sort((a, b) => cmpFn(cellDex(a), cellDex(b)) || idx.get(a) - idx.get(b));
        if (sorted.some((c, i) => c !== cells[i])) {
          const more = grid.querySelector('.dex-more');
          for (const c of sorted) grid.insertBefore(c, more);
        }
      }
      const count = $('nx-dex-count');
      if (count) count.textContent = on ? `${shown} con los filtros de Nexus` : '';
      const sortBar = $('dex-sort');
      if (sortBar) sortBar.classList.toggle('nx-dim', on && !!st.sort);
    } finally {
      mo.observe(grid, { childList: true });
    }
  }
  const schedule = () => { if (!pending) { pending = true; requestAnimationFrame(apply); } };

  // ---- barra propia debajo del orden del juego
  function buildBar() {
    const sort = $('dex-sort');
    if (!sort || $('nx-dex-bar')) return;
    const bar = document.createElement('div');
    bar.id = 'nx-dex-bar';
    bar.className = 'filters';
    sort.after(bar);
    const draw = () => {
      const types = ns().U.TYPE_NAME || {};
      const chip = (on, html, act) => `<button type="button" class="chip${on ? ' on' : ''}" data-act="${act}">${html}</button>`;
      bar.innerHTML = '<span class="sub" style="margin:0;align-self:center">Nexus:</span>' +
        chip(st.sort === 'type', 'Por tipo', 'sort:type') + chip(st.sort === 'bst', 'Más estadísticas', 'sort:bst') +
        chip(st.sort === 'own', 'Poseídos primero', 'sort:own') +
        `<select class="nx-type2" title="Que además tenga este tipo"><option value="">Con tipo…</option>${
          Object.keys(types).map((t) => `<option value="${NX.esc(t)}"${st.type2 === t ? ' selected' : ''}>${NX.esc(types[t])}</option>`).join('')}</select>` +
        chip(st.shinyMiss, icon('shiny', 12) + ' Shiny que me faltan', 'shinyMiss') +
        chip(st.noted, 'Con nota', 'noted') +
        chip(false, `Comparar (${cmp.filter(Boolean).length}/2)`, 'cmp') +
        '<span id="nx-dex-count" class="sub" style="margin:0;align-self:center"></span>';
      bar.querySelector('.nx-type2').addEventListener('change', (e) => { st.type2 = e.target.value; saveState(); schedule(); });
    };
    bar.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const a = b.dataset.act;
      if (a.startsWith('sort:')) { const v = a.slice(5); st.sort = st.sort === v ? '' : v; }
      else if (a === 'shinyMiss' || a === 'noted') st[a] = !st[a];
      else if (a === 'cmp') { openCompare(); return; }
      saveState();
      draw();
      schedule();
    });
    // Al elegir un orden del juego, el de Nexus se aparta.
    sort.addEventListener('click', (e) => {
      if (e.target.closest('.chip') && st.sort) { st.sort = ''; saveState(); draw(); }
    }, true);
    bar.nxDraw = draw;
    draw();
  }
  const redrawBar = () => { const b = $('nx-dex-bar'); if (b && b.nxDraw) b.nxDraw(); };

  // ---- ficha: tier, comparador y notas
  function detailDex() {
    const d = $('dex-detail');
    const first = d && d.querySelector('.center > div');
    const m = first && /(\d{1,4})/.exec(first.textContent);
    return m ? +m[1] : 0;
  }
  const tierOf = (dex) => {
    const rows = NX.data && NX.data.tiers && NX.data.tiers.rows;
    return Array.isArray(rows) ? rows.find((r) => r.dex === dex) || null : null;
  };
  let noteT = 0;
  function decorateDetail() {
    const d = $('dex-detail');
    if (!d || !NX.isOn(KEY)) return;
    const dex = detailDex();
    if (!dex) return;
    const old = d.querySelector('.nx-dex-extra');
    if (old && +old.dataset.dex === dex) return;
    if (old) old.remove();
    const box = document.createElement('div');
    box.className = 'mon-extra nx-dex-extra';
    box.dataset.dex = dex;
    const t = tierOf(dex);
    box.innerHTML = (t ? `<div class="mx-row"><span>Tier</span> <b class="gold">${NX.esc(t.tier)}</b> <small>puesto ${t.rank} en SurvivorTiers</small></div>` : '') +
      `<div class="row" style="gap:6px;margin:4px 0"><button type="button" class="btn small" data-slot="0">Comparar como A</button>
      <button type="button" class="btn small" data-slot="1">Como B</button></div>` +
      (NX.store.get('dex:notesOn', true) ? `<textarea class="nx-note-in" maxlength="500" rows="2" placeholder="Nota para este Pokémon…"></textarea>` : '');
    const ta = box.querySelector('textarea');
    if (ta) {
      ta.value = notes[dex] || '';
      ta.addEventListener('keydown', (e) => e.stopPropagation());
      ta.addEventListener('input', () => {
        clearTimeout(noteT);
        noteT = setTimeout(() => {
          const v = ta.value.trim();
          if (v) notes[dex] = v; else delete notes[dex];
          NX.store.set('dex:notes', notes);
        }, 300);
      });
    }
    box.addEventListener('click', (e) => {
      const b = e.target.closest('[data-slot]');
      if (!b) return;
      cmp[+b.dataset.slot] = dex;
      NX.store.set('dex:cmp', cmp);
      redrawBar();
      if (cmp[0] && cmp[1]) openCompare(); else NX.toast('Elige otro Pokémon para comparar');
    });
    d.appendChild(box);
  }

  // ---- comparador
  const STATS = [['hp', 'Vida', 183, (v) => Math.round(v)], ['pa', 'Ataque físico', 1.55, (v) => '×' + v.toFixed(2)],
    ['sa', 'Ataque especial', 1.55, (v) => '×' + v.toFixed(2)], ['df', 'Defensa', 160, (v) => Math.round(v)],
    ['sd', 'Defensa especial', 160, (v) => Math.round(v)], ['spd', 'Velocidad', 137, (v) => Math.round(v)], ['bst', 'Total base', 720, (v) => Math.round(v)]];
  function matchups(types) {
    const { Types, U } = ns();
    const weak = [], res = [];
    for (const t of Object.keys(U.TYPE_NAME || {})) {
      let m = 1;
      try { m = Types.mult(t, types); } catch (_) { m = 1; }
      if (m > 1.05) weak.push(t); else if (m < 0.95) res.push(t);
    }
    return { weak, res };
  }
  function side(dex) {
    const { DEX_BY, Gacha, MenuUI, UI, Stats } = ns();
    const p = DEX_BY[dex];
    if (!p) return '<div class="nx-cmp-empty sub">Sin elegir</div>';
    const t = tierOf(dex);
    const mu = matchups(p.types);
    let chips = '';
    try { chips = UI.typeChips(p.types); } catch (_) { chips = p.types.join(' / '); }
    const tc = (list) => (list.length ? (() => { try { return UI.typeChips(list); } catch (_) { return list.join(', '); } })() : '<small>ninguno</small>');
    let sideTxt = '';
    try { sideTxt = Stats.sideOf(p) === 'special' ? 'especiales' : 'físicos'; } catch (_) { sideTxt = ''; }
    return `<div class="center"><div class="nx-cmp-spr" data-dex="${dex}"></div>
      <div style="color:var(--muted);font-size:13px">Nº ${pad(dex)} · ${NX.esc(T((MenuUI.GEN_NAMES || [])[p.gen - 1] || ''))}</div>
      <h3 style="margin:2px 0">${NX.esc(p.name)}${owns(dex) ? '' : ' <small class="sub">(no lo tienes)</small>'}</h3>
      <div style="color:${Gacha.RARITY_COLOR[p.rarity]}">${(() => { try { return UI.stars(p.rarity, 16); } catch (_) { return ''; } })()} ${NX.esc(Gacha.RARITY_NAME[p.rarity] || '')}</div>
      <div style="margin:6px 0">${chips}</div>${t ? `<div>Tier <b class="gold">${NX.esc(t.tier)}</b> <small class="sub">puesto ${t.rank}</small></div>` : ''}
      ${sideTxt ? `<div class="sub" style="margin:4px 0 0;font-size:13px">Pega mejor con ataques ${sideTxt}</div>` : ''}</div>
      <div class="nx-mu"><span>Débil a</span> ${tc(mu.weak)}</div><div class="nx-mu"><span>Resiste</span> ${tc(mu.res)}</div>`;
  }
  function statRows(a, b) {
    const D = ns().DEX_BY, A = D[a], B = D[b];
    if (!A || !B) return '';
    return STATS.map(([k, label, max, f]) => {
      const va = +A[k] || 0, vb = +B[k] || 0;
      const w = (v) => Math.min(100, (v / max) * 100);
      return `<div class="nx-cmp-row"><b class="${va > vb ? 'gold' : ''}">${f(va)}</b><div class="bar l"><i style="width:${w(va)}%"></i></div>
        <span>${label}</span><div class="bar"><i style="width:${w(vb)}%"></i></div><b class="${vb > va ? 'gold' : ''}">${f(vb)}</b></div>`;
    }).join('');
  }
  let cmpEl = null;
  function closeCompare() { if (cmpEl) { cmpEl.remove(); cmpEl = null; removeEventListener('keydown', cmpKey, true); } }
  const cmpKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); closeCompare(); } };
  function openCompare() {
    closeCompare();
    const { DEX, UI } = ns();
    cmpEl = document.createElement('section');
    cmpEl.className = 'scr dim nx-cmp';
    cmpEl.style.zIndex = 60;
    const opts = DEX.map((p) => `<option value="${pad(p.dex)} ${NX.esc(p.name)}"></option>`).join('');
    const draw = () => {
      const [a, b] = cmp;
      cmpEl.innerHTML = `<div class="box" style="width:min(760px,100%)">
        <div class="row between"><h2>Comparar Pokémon</h2><button class="btn small ghost" data-close type="button">Cerrar</button></div>
        <datalist id="nx-cmp-list">${opts}</datalist>
        <div class="nx-cmp-pick"><input class="field" list="nx-cmp-list" data-slot="0" placeholder="Pokémon A: nombre o número" value="${a ? pad(a) + ' ' + NX.esc((ns().DEX_BY[a] || {}).name || '') : ''}">
        <button class="btn small ghost" data-swap type="button" title="Intercambiar">⇄</button>
        <input class="field" list="nx-cmp-list" data-slot="1" placeholder="Pokémon B: nombre o número" value="${b ? pad(b) + ' ' + NX.esc((ns().DEX_BY[b] || {}).name || '') : ''}"></div>
        <div class="nx-cmp-cols"><div class="panel">${side(a)}</div><div class="panel">${side(b)}</div></div>
        ${a && b ? `<div class="panel nx-cmp-stats"><p class="sub center" style="margin:0 0 6px">Estadísticas base</p>${statRows(a, b)}</div>` : '<p class="note center">Elige dos Pokémon para ver sus estadísticas lado a lado.</p>'}
      </div>`;
      cmpEl.querySelectorAll('.nx-cmp-spr').forEach((s) => {
        try { s.appendChild(UI.spriteCanvas(+s.dataset.dex, 132, 110, { lively: true, scale: 2 })); } catch (_) { /* sin sprite */ }
      });
      cmpEl.querySelectorAll('input[data-slot]').forEach((inp) => {
        inp.addEventListener('keydown', (e) => { if (e.key !== 'Escape') e.stopPropagation(); });
        inp.addEventListener('change', () => {
          const q = fold(inp.value.trim());
          const n = parseInt(q, 10);
          const hit = (n && ns().DEX_BY[n]) || DEX.find((p) => fold(p.name) === q.replace(/^\d+\s*/, '')) || DEX.find((p) => fold(p.name).startsWith(q.replace(/^\d+\s*/, '')));
          if (!hit) { NX.toast('No se encontró ese Pokémon'); return; }
          cmp[+inp.dataset.slot] = hit.dex;
          NX.store.set('dex:cmp', cmp);
          redrawBar();
          draw();
        });
      });
    };
    cmpEl.addEventListener('click', (e) => {
      if (e.target === cmpEl || e.target.closest('[data-close]')) { closeCompare(); return; }
      if (e.target.closest('[data-swap]')) { cmp = [cmp[1], cmp[0]]; NX.store.set('dex:cmp', cmp); draw(); }
    });
    addEventListener('keydown', cmpKey, true);
    draw();
    document.body.appendChild(cmpEl);
  }

  NX.css(`#dex-grid .cell.nx-hide{display:none}
#dex-grid .nx-fav{position:absolute;right:3px;bottom:3px;padding:1px 2px;line-height:0;background:rgba(0,0,0,.35);border:0;border-radius:5px;cursor:pointer;opacity:0;transition:opacity .12s}
#dex-grid .cell:hover .nx-fav,#dex-grid .nx-fav:focus-visible{opacity:1}
#nx-dex-bar{align-items:center}
#nx-dex-bar select{background:rgba(0,0,0,.3);color:inherit;border:2px solid rgba(244,248,255,.25);border-radius:20px;padding:3px 8px;font:inherit;font-size:13px}
#nx-dex-bar select option{background:#14204a}
#dex-sort.nx-dim .chip.on{border-color:rgba(244,248,255,.25);color:inherit}
.nx-dex-extra textarea{width:100%;box-sizing:border-box;resize:vertical;margin-top:4px;background:rgba(0,0,0,.3);color:inherit;border:2px solid rgba(244,248,255,.25);border-radius:8px;padding:5px 8px;font:inherit;font-size:13px}
.nx-cmp .nx-cmp-pick{display:flex;gap:8px;align-items:center;margin:6px 0 10px}
.nx-cmp .nx-cmp-pick .field{flex:1;min-width:0;width:auto}
.nx-cmp .nx-cmp-cols{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.nx-cmp .nx-cmp-spr canvas{display:block;margin:0 auto}
.nx-cmp .nx-mu{font-size:13px;margin-top:6px}.nx-cmp .nx-mu>span{color:var(--muted);margin-right:4px}
.nx-cmp .nx-cmp-stats{margin-top:10px}
.nx-cmp .nx-cmp-row{display:grid;grid-template-columns:52px 1fr 130px 1fr 52px;gap:8px;align-items:center;font-size:14px;margin:5px 0}
.nx-cmp .nx-cmp-row>span{text-align:center;color:var(--muted)}.nx-cmp .nx-cmp-row>b:last-child{text-align:right}
.nx-cmp .bar{height:8px;background:rgba(0,0,0,.35);border-radius:6px;overflow:hidden;display:flex}
.nx-cmp .bar.l{justify-content:flex-end}.nx-cmp .bar i{display:block;height:100%;background:var(--gold,#ffd23f)}
@media (max-width:620px){.nx-cmp .nx-cmp-cols{grid-template-columns:1fr}.nx-cmp .nx-cmp-row{grid-template-columns:44px 1fr 90px 1fr 44px;font-size:12px}}`);

  NX.feature({
    key: KEY,
    label: 'Herramientas de la Pokédex',
    needs: (n) => n.DEX && n.DEX_BY && n.DB && typeof n.DB.isFav === 'function' && typeof n.DB.setFav === 'function' &&
      n.U && n.U.TYPE_NAME && n.Gacha && n.Types && n.MenuUI && !!$('dex-grid') && !!$('dex-sort') && !!$('dex-detail'),
    setup(n) {
      captureIO();
      buildBar();
      const grid = $('dex-grid');
      mo = new MutationObserver(schedule);
      mo.observe(grid, { childList: true });
      // Estrella: marca o quita favorito con la función del juego, sin abrir la ficha.
      grid.addEventListener('click', (e) => {
        const star = e.target.closest('.nx-fav');
        if (!star) return;
        e.stopPropagation();
        e.preventDefault();
        const cell = star.closest('.cell');
        const dex = cellDex(cell);
        if (!dex || !n.DB.save) return;
        const fav = !n.DB.isFav(dex);
        n.DB.setFav(dex, fav);
        const no = cell.querySelector('.no');
        if (no) no.innerHTML = pad(dex) + (fav ? ' ' + icon('star', 10) : '');
        star.dataset.on = '';
        schedule();
      }, true);
      new MutationObserver(() => { try { decorateDetail(); } catch (err) { NX.trip(KEY, err); } }).observe($('dex-detail'), { childList: true });
      const scr = $('scr-dex');
      if (scr) new MutationObserver(() => { if (NX.shown('scr-dex')) { redrawBar(); schedule(); } }).observe(scr, { attributes: true, attributeFilter: ['class'] });
    },
  });

  NX.settings.section({
    key: KEY,
    tab: 'Menús',
    title: 'Herramientas de la Pokédex',
    keywords: 'pokedex buscar ordenar filtros favoritos comparar notas tier',
    render(el) {
      el.appendChild(NX.ui.toggle('Activado', 'on:' + KEY, true, () => schedule()));
      el.appendChild(NX.ui.toggle('Estrella de favorito en la cuadrícula', 'dex:favStar', true, () => schedule()));
      el.appendChild(NX.ui.toggle('Notas en la ficha de cada Pokémon', 'dex:notesOn', true));
      const n = Object.keys(notes).length;
      const tiers = NX.data && NX.data.tiers && Array.isArray(NX.data.tiers.rows);
      el.appendChild(NX.ui.note(`Suma orden por tipo y estadísticas, filtros extra, comparador y notas en Pokémon. Notas guardadas: ${n}. ` +
        (tiers ? 'Tiers de SurvivorTiers disponibles.' : 'Sin datos de SurvivorTiers en este modo: el comparador no muestra tier.')));
      el.appendChild(NX.ui.button('Abrir comparador', () => { if (NX.ns) { NX.togglePanel(); openCompare(); } }));
    },
  });
})();
