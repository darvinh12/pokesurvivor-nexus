// Herramientas de la Pokédex. El juego ya trae búsqueda por nombre o número,
// filtro de tipo, Tengo / Me faltan, Shiny, Favoritos, rarezas, regiones y
// orden por número, nombre, rareza y recientes. Aquí se suma lo que falta:
// orden por tipo, por estadísticas y poseídos primero; filtros extra (segundo
// tipo, shiny que faltan, con nota); estrella de favorito en la cuadrícula;
// comparador de dos Pokémon y notas por Pokémon.
// La carga por tandas de la cuadrícula se resuelve como en PokeSurvivor Plus
// (MIT): se guarda el observador que dibuja las siguientes 48 casillas.
// Carga diferida (src/core/lazy.js): en la edición, lo que sigue a
// //#nexus-lazy va en un archivo aparte que se carga al primer uso; esta
// declaración deja mientras tanto su estado, su sección del panel y sus atajos.
NX.lazy.declare('dex', {
  feats: [['dex', 'Herramientas de la Pokédex']],
  sections: [{ key: 'dex', tab: 'Menús', title: 'Herramientas de la Pokédex', keywords: 'pokedex buscar ordenar filtros favoritos comparar notas tier' }],
  screens: ['scr-dex'],
});
// El juego crea una sola vez, al abrir Pokémon, el observador que dibuja las
// siguientes 48 casillas. Se captura desde el inicio (en la edición el resto
// del módulo puede llegar después) y queda en NX.dexMoreIO.
NX.onNS(() => {
  const IO = window.IntersectionObserver;
  if (!IO || IO.__nx) return;
  const W = function (cb, opts) {
    const io = new IO(cb, opts);
    const observe = io.observe;
    io.observe = function (t) {
      if (t && t.classList && t.classList.contains('dex-more')) NX.dexMoreIO = { io, cb };
      return observe.apply(this, arguments);
    };
    return io;
  };
  W.prototype = IO.prototype;
  W.__nx = true;
  window.IntersectionObserver = W;
});
//#nexus-lazy
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
  function loadAll(grid) {
    for (let i = 0; i < 80; i++) {
      const m = grid.querySelector('.dex-more');
      const moreIO = NX.dexMoreIO;
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

  let mo = null, pending = false, lastShown = 0;
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
      lastShown = shown;
      // Estado vacío cuando son los filtros de Nexus los que lo ocultan todo.
      let empty = grid.querySelector(':scope > .nx-dx-empty');
      if (on && cells.length && !shown && nxFilt()) {
        if (!empty) {
          empty = document.createElement('p');
          empty.className = 'sub nx-dx-empty';
          empty.innerHTML = 'Ninguno con estos filtros. <button type="button" class="chip" data-act="clear">Quitar filtros</button>';
          grid.insertBefore(empty, grid.firstChild);
        }
      } else if (empty) empty.remove();
    } finally {
      mo.observe(grid, { childList: true });
    }
    if (NX.isOn(KEY)) { mount(); syncBar(); } else unmount();
  }
  const schedule = () => { if (!pending) { pending = true; requestAnimationFrame(apply); } };

  // ---- una sola barra: buscador, región, orden y "Filtros (N)"
  // El panel de filtros agrupa los del juego y los de Nexus. Los controles del
  // juego siguen en la página (ocultos) y se les hace clic, así el juego filtra
  // como siempre; tras cada cambio el juego los redibuja y aquí se resincroniza.
  const SORTS = [['type', 'Tipo'], ['bst', 'Más estadísticas'], ['own', 'Poseídos primero']];
  const GROUPS = [['col', 'Colección'], ['type', 'Tipo'], ['rar', 'Rareza'], ['esp', 'Especial']];
  let fpOpen = false, bar = null, home = null;
  const nxFilt = () => !!(st.type2 || st.shinyMiss || st.noted);
  const typeName = (t) => (ns().U.TYPE_NAME || {})[t] || t;
  const typeBadge = (t) => { try { return ns().UI.typeChips([t]); } catch (_) { return NX.esc(typeName(t)); } };
  function gameChips() {
    const f = $('dex-filters');
    if (!f) return [];
    let rn = [];
    try { rn = Object.values(ns().Gacha.RARITY_NAME || {}).map(fold); } catch (_) { rn = []; }
    return [...f.querySelectorAll(':scope > .chip')].map((b, i) => {
      const txt = fold(b.textContent.trim());
      const g = i < 3 ? 'status' : rn.includes(txt) ? 'rar' : /fav/.test(txt) ? 'col' : 'esp';
      return { b, i, g, html: b.innerHTML, on: b.classList.contains('on') };
    });
  }
  // Filtros activos (el buscador no cuenta: ya se ve en la barra).
  function activeList(chips) {
    const out = [];
    for (const c of chips) {
      if (!c.on || (c.g === 'status' && c.i === 0)) continue;
      out.push({ html: c.html, clear: () => (c.g === 'status' ? chips[0].b.click() : c.b.click()) });
    }
    const ty = $('dex-type');
    if (ty && ty.value) out.push({ html: typeBadge(ty.value), clear: () => { ty.value = ''; ty.dispatchEvent(new Event('change')); } });
    if (st.type2) out.push({ html: 'También ' + typeBadge(st.type2), nx: () => { st.type2 = ''; } });
    if (st.shinyMiss) out.push({ html: icon('shiny', 12) + ' Shiny que me faltan', nx: () => { st.shinyMiss = false; } });
    if (st.noted) out.push({ html: 'Con nota', nx: () => { st.noted = false; } });
    return out;
  }
  const countText = () => {
    if (nxFilt()) return lastShown === 1 ? '1 Pokémon' : `${lastShown} Pokémon`;
    const c = $('dex-count');
    return c ? c.textContent.trim() : '';
  };
  const nxChanged = () => { saveState(); syncBar(); schedule(); };

  function buildBar() {
    if (bar) return bar;
    const types = ns().U.TYPE_NAME || {};
    bar = {
      reg: document.createElement('select'),
      ord: document.createElement('select'),
      fbtn: document.createElement('button'),
      fp: document.createElement('div'),
      act: document.createElement('div'),
    };
    bar.reg.id = 'nx-dex-reg';
    bar.reg.setAttribute('aria-label', 'Región');
    bar.ord.id = 'nx-dex-ord';
    bar.ord.setAttribute('aria-label', 'Orden');
    bar.fbtn.id = 'nx-dex-fbtn';
    bar.fbtn.type = 'button';
    bar.fbtn.className = 'chip';
    bar.fbtn.setAttribute('aria-expanded', 'false');
    bar.fbtn.setAttribute('aria-controls', 'nx-dex-fp');
    bar.fp.id = 'nx-dex-fp';
    bar.fp.hidden = true;
    bar.fp.innerHTML = `<div class="nx-dx-fph"><b>Filtros</b><span class="nx-dx-n"></span>
      <button type="button" class="chip nx-dx-clear" data-act="clear">Limpiar todo</button>
      <button type="button" class="btn small" data-act="close">Listo</button></div>` +
      GROUPS.map(([g, t]) => `<div class="nx-dx-g"><span class="nx-dx-gl">${t}</span><div class="nx-dx-gc" data-g="${g}"></div></div>`).join('');
    const tg = bar.fp.querySelector('[data-g="type"]');
    tg.innerHTML = `<span class="nx-dx-and">y también</span><select class="nx-type2" aria-label="Que además tenga este tipo"><option value="">Cualquiera</option>${
      Object.keys(types).map((t) => `<option value="${NX.esc(t)}">${NX.esc(types[t])}</option>`).join('')}</select>`;
    bar.type2 = tg.querySelector('.nx-type2');
    bar.type2.addEventListener('change', () => { st.type2 = bar.type2.value; nxChanged(); });
    bar.act.id = 'nx-dex-act';
    bar.act.hidden = true;

    bar.reg.addEventListener('change', () => {
      const tab = document.querySelectorAll('#dex-gens .gen-tab')[+bar.reg.value];
      if (tab) tab.click();
    });
    bar.ord.addEventListener('change', () => {
      const [k, v] = bar.ord.value.split(':');
      if (k === 'n') { st.sort = v; nxChanged(); return; }
      if (st.sort) { st.sort = ''; saveState(); schedule(); }
      const chip = document.querySelectorAll('#dex-sort .chip')[+v];
      if (chip) chip.click();
      syncBar();
    });
    bar.fbtn.addEventListener('click', () => toggleFp(!fpOpen));
    const onAct = (e) => {
      const b = e.target.closest('[data-act],[data-gi],[data-ai]');
      if (!b) return;
      const chips = gameChips();
      if (b.dataset.gi) { const c = chips[+b.dataset.gi]; if (c) c.b.click(); return; }
      if (b.dataset.ai) {
        const a = activeList(chips)[+b.dataset.ai];
        if (a && a.nx) { a.nx(); nxChanged(); } else if (a) a.clear();
        return;
      }
      const a = b.dataset.act;
      if (a === 'close') toggleFp(false);
      else if (a === 'clear') clearFilters();
      else if (a === 'shinyMiss' || a === 'noted') { st[a] = !st[a]; nxChanged(); }
    };
    bar.fp.addEventListener('click', onAct);
    bar.act.addEventListener('click', onAct);
    return bar;
  }

  // Quita los filtros del juego y de Nexus. El "Limpiar" del juego también
  // borra la búsqueda y el orden: esos dos se conservan.
  function clearFilters() {
    st.type2 = ''; st.shinyMiss = false; st.noted = false;
    const q = $('dex-q'), keepQ = q ? q.value : '';
    const sorts = [...document.querySelectorAll('#dex-sort .chip')];
    const sortIdx = sorts.findIndex((c) => c.classList.contains('on'));
    const clr = $('dex-clear');
    if (clr) clr.click();
    if (sortIdx > 0) { const c2 = document.querySelectorAll('#dex-sort .chip')[sortIdx]; if (c2) c2.click(); }
    if (keepQ && q) { q.value = keepQ; q.dispatchEvent(new Event('input')); }
    nxChanged();
  }

  function toggleFp(open) {
    fpOpen = !!open;
    if (!bar) return;
    bar.fp.hidden = !fpOpen;
    bar.fbtn.setAttribute('aria-expanded', String(fpOpen));
    bar.fbtn.classList.toggle('open', fpOpen);
    if (fpOpen) syncBar();
  }

  // Pone la barra en la cabecera y oculta las filas del juego; unmount lo deshace.
  function mount() {
    const s = $('scr-dex');
    const head = s && s.querySelector('.box > .row.between');
    const tools = s && s.querySelector('.dex-tools');
    if (!head || !tools || !$('dex-type') || !$('dex-q')) return;
    if (s.classList.contains('nx-dx') && tools.parentElement === head) return;
    buildBar();
    if (!home) home = { parent: tools.parentElement, next: tools.nextElementSibling };
    const h2 = head.querySelector('h2');
    if (h2) h2.after(tools); else head.prepend(tools);
    const q = $('dex-q');
    if (q.dataset.nxPh == null) q.dataset.nxPh = q.placeholder;
    q.placeholder = 'Nombre o nº';
    q.after(bar.reg, bar.ord, bar.fbtn);
    bar.fp.querySelector('[data-g="type"]').prepend($('dex-type'));
    head.after(bar.fp, bar.act);
    s.classList.add('nx-dx');
  }
  function unmount() {
    const s = $('scr-dex');
    if (!s || !s.classList.contains('nx-dx') || !bar || !home) return;
    const tools = s.querySelector('.dex-tools');
    const q = $('dex-q'), ty = $('dex-type');
    if (q && ty) q.after(ty);
    if (q && q.dataset.nxPh != null) q.placeholder = q.dataset.nxPh;
    for (const el of [bar.reg, bar.ord, bar.fbtn, bar.fp, bar.act]) el.remove();
    if (tools) home.parent.insertBefore(tools, home.next && home.next.parentElement === home.parent ? home.next : home.parent.firstChild);
    toggleFp(false);
    s.classList.remove('nx-dx');
  }

  function syncBar() {
    const s = $('scr-dex');
    if (!bar || !NX.isOn(KEY) || !s || !s.classList.contains('nx-dx')) return;
    // Región: las pestañas del juego, con lo que tienes de cada una.
    const tabs = [...document.querySelectorAll('#dex-gens .gen-tab')];
    const onTab = tabs.findIndex((t) => t.classList.contains('on'));
    const regHtml = (onTab < 0 ? '<option value="" selected>Todas (búsqueda)</option>' : '') + tabs.map((t, i) => {
      const b = t.querySelector('b'), sm = t.querySelector('small');
      return `<option value="${i}"${i === onTab ? ' selected' : ''}>${NX.esc(b ? b.textContent : t.textContent)}${sm ? ' · ' + NX.esc(sm.textContent) : ''}</option>`;
    }).join('');
    if (bar.reg.dataset.h !== regHtml) { bar.reg.innerHTML = regHtml; bar.reg.dataset.h = regHtml; }
    // Orden: los del juego y los de Nexus en una sola lista.
    const sorts = [...document.querySelectorAll('#dex-sort .chip')];
    const gi = sorts.findIndex((c) => c.classList.contains('on'));
    const cur = st.sort ? 'n:' + st.sort : 'g:' + Math.max(0, gi);
    const opts = [...sorts.map((c, i) => ['g:' + i, c.textContent.trim()]), ...SORTS.map(([k, t]) => ['n:' + k, t])];
    const ordHtml = '<optgroup label="Ordenar por">' + opts.map(([v, t]) =>
      `<option value="${v}"${v === cur ? ' selected' : ''}>${v === cur ? 'Orden: ' : ''}${NX.esc(t)}</option>`).join('') + '</optgroup>';
    if (bar.ord.dataset.h !== ordHtml) { bar.ord.innerHTML = ordHtml; bar.ord.dataset.h = ordHtml; }
    // Panel de filtros.
    const chips = gameChips();
    const chip = (on, html, attr) => `<button type="button" class="chip${on ? ' on' : ''}" aria-pressed="${on}" ${attr}>${html}</button>`;
    const by = (g) => chips.filter((c) => c.g === g).map((c) => chip(c.on, c.html, `data-gi="${c.i}"`)).join('');
    const put = (g, html) => {
      const el = bar.fp.querySelector(`[data-g="${g}"]`);
      let box = el.querySelector('.nx-dx-chips');
      if (!box) { box = document.createElement('div'); box.className = 'nx-dx-chips'; el.appendChild(box); }
      if (box.dataset.h !== html) { box.innerHTML = html; box.dataset.h = html; }
    };
    put('col', `<span class="nx-dx-seg">${by('status')}</span>` + by('col') + chip(st.noted, 'Con nota', 'data-act="noted"'));
    put('rar', by('rar'));
    put('esp', by('esp') + chip(st.shinyMiss, icon('shiny', 12) + ' Shiny que me faltan', 'data-act="shinyMiss"'));
    if (bar.type2.value !== st.type2) bar.type2.value = st.type2;
    const list = activeList(chips);
    const n = list.length;
    const fb = n ? `Filtros <b class="nx-dx-badge">${n}</b>` : 'Filtros';
    if (bar.fbtn.innerHTML !== fb) bar.fbtn.innerHTML = fb;
    bar.fbtn.classList.toggle('on', n > 0);
    const count = countText();
    bar.fp.querySelector('.nx-dx-n').textContent = count;
    bar.fp.querySelector('.nx-dx-clear').disabled = !n;
    // Fila de filtros activos, cada uno con su ×.
    const actHtml = n ? `<span class="nx-dx-count">${NX.esc(count)}</span>` +
      list.map((a, i) => `<button type="button" class="chip on nx-dx-x" data-ai="${i}" title="Quitar este filtro">${a.html}<span class="nx-dx-xx" aria-hidden="true">×</span></button>`).join('') +
      '<button type="button" class="chip nx-dx-clear" data-act="clear">Limpiar</button>' : '';
    if (bar.act.dataset.h !== actHtml) { bar.act.innerHTML = actHtml; bar.act.dataset.h = actHtml; }
    bar.act.hidden = !n;
  }
  const redrawBar = () => syncBar();

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
  // Ficha: los añadidos de Nexus (Ver build, acompañante, comparar y nota) van
  // juntos en un solo bloque, justo encima del botón del juego para elegir.
  function cmpLabel(dex) {
    const a = cmp[0], p = a && a !== dex && ns().DEX_BY[a];
    return p ? 'Comparar con ' + NX.esc(p.name) : 'Comparar';
  }
  function decorateDetail() {
    const d = $('dex-detail');
    if (!d || !NX.isOn(KEY)) return;
    const dex = detailDex();
    if (!dex) return;
    let box = d.querySelector('.nx-dex-extra');
    if (box && +box.dataset.dex !== dex) { box.remove(); box = null; }
    if (!box) {
      box = document.createElement('div');
      box.className = 'nx-dex-extra';
      box.dataset.dex = dex;
      const t = !NX.isOn('tiers') && tierOf(dex);
      box.innerHTML = (t ? `<div class="nx-dx-tier">Tier <b class="gold">${NX.esc(t.tier)}</b> <small>puesto ${t.rank} en SurvivorTiers</small></div>` : '') +
        `<div class="nx-dx-acts"><button type="button" class="btn small" data-cmp>${cmpLabel(dex)}</button></div>` +
        (NX.store.get('dex:notesOn', true) ? `<textarea class="nx-note-in" maxlength="500" rows="2" aria-label="Nota" placeholder="Nota para este Pokémon…"></textarea>` : '');
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
      // Un solo botón: el primer toque guarda este Pokémon, el siguiente (en otro) abre el comparador.
      box.addEventListener('click', (e) => {
        const b = e.target.closest('[data-cmp]');
        if (!b) return;
        if (cmp[0] && cmp[0] !== dex) { cmp[1] = dex; NX.store.set('dex:cmp', cmp); openCompare(); return; }
        cmp = [dex, null];
        NX.store.set('dex:cmp', cmp);
        NX.toast('Abre otro Pokémon y toca Comparar');
      });
    }
    // Reúne los botones que agregan otros módulos (Ver build, acompañante).
    const acts = box.querySelector('.nx-dx-acts');
    for (const el of d.querySelectorAll(':scope > .nx-bc-dexbtn, :scope > .nx-comp-pick')) acts.appendChild(el);
    const pick = $('dex-pick');
    if (pick && pick.parentElement === d) { if (box.nextElementSibling !== pick) d.insertBefore(box, pick); }
    else if (box.parentElement !== d) d.appendChild(box);
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
#dex-grid .nx-dx-empty{grid-column:1/-1;display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:6px 4px;font-size:14px}
#scr-dex.nx-dx #dex-grid{align-content:start}
#scr-dex.nx-dx #dex-gens,#scr-dex.nx-dx #dex-filters,#scr-dex.nx-dx #dex-sort,#scr-dex.nx-dx #dex-count,#scr-dex.nx-dx #dex-clear{display:none !important}
#scr-dex.nx-dx .box>.row.between{flex-wrap:nowrap;gap:10px}
#scr-dex.nx-dx .box>.row.between>h2{flex:none;margin:0;white-space:nowrap}
#scr-dex.nx-dx .box>.row.between>.row{flex:none;flex-wrap:nowrap}
#scr-dex.nx-dx .dex-tools{flex:1 1 auto;min-width:0;margin:0;flex-wrap:nowrap;gap:8px}
#scr-dex.nx-dx .dex-tools input{flex:1 1 150px;min-width:80px}
#scr-dex.nx-dx .dex-tools select{flex:0 1 auto;min-width:0;max-width:220px;cursor:pointer}
.nx-dx-and{color:var(--muted);font-size:14px}
#scr-dex.nx-dx .dex-tools input:focus-visible,#scr-dex.nx-dx .dex-tools select:focus-visible,#nx-dex-fp select:focus-visible{outline:none;border-color:var(--edge)}
#nx-dex-fbtn{flex:none;white-space:nowrap;font-size:14px;padding:4px 12px}
#nx-dex-fbtn.on,#nx-dex-fbtn.open{border-color:var(--gold);color:var(--gold)}
#nx-dex-fbtn.open{background:rgba(255,210,63,.14)}
.nx-dx-badge{display:inline-block;min-width:18px;padding:0 5px;margin-left:3px;border-radius:9px;background:var(--gold);color:#241800;text-shadow:none;font-size:12px;line-height:18px;text-align:center}
#nx-dex-fp{margin:10px 0 2px;padding:8px 12px 10px;border-radius:10px;background:rgba(0,0,0,.22);border:2px solid rgba(244,248,255,.2)}
#nx-dex-fp[hidden],#nx-dex-act[hidden]{display:none}
.nx-dx-fph{display:flex;align-items:center;gap:10px;padding-bottom:6px}
.nx-dx-fph>b{font-size:17px;color:var(--gold)}
.nx-dx-fph .nx-dx-n{flex:1;color:var(--muted);font-size:14px}
.nx-dx-fph .btn{margin:0}
.nx-dx-g{display:grid;grid-template-columns:96px 1fr;gap:10px;align-items:center;padding:7px 0;border-top:1px solid rgba(255,255,255,.1)}
.nx-dx-gl{color:var(--muted);font-size:14px}
.nx-dx-gc,.nx-dx-chips{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
#scr-dex #nx-dex-fp .chip,#scr-dex #nx-dex-act .chip{font-size:14px;padding:4px 12px;flex:none}
.nx-dx-seg{display:inline-flex}
#scr-dex .nx-dx-seg .chip{border-radius:0;margin-left:-2px}
#scr-dex .nx-dx-seg .chip:first-child{border-radius:20px 0 0 20px;margin-left:0}
#scr-dex .nx-dx-seg .chip:last-child{border-radius:0 20px 20px 0}
.nx-dx-seg .chip.on{position:relative;z-index:1;background:rgba(255,210,63,.14)}
#nx-dex-fp select{background:rgba(0,0,0,.3);color:inherit;border:2px solid rgba(244,248,255,.3);border-radius:8px;padding:4px 10px;font:inherit;font-size:14px;cursor:pointer}
#nx-dex-fp select option{background:#14204a}
.nx-dx-clear:disabled{opacity:.45;cursor:default}
#nx-dex-act{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:8px 0 0}
.nx-dx-count{color:var(--muted);font-size:14px;margin-right:2px;white-space:nowrap}
.nx-dx-x .nx-dx-xx{margin-left:6px;font-size:16px;line-height:1}
.nx-dx-x .type{margin-right:0}
.nx-dex-extra{margin:10px 0 6px;padding:8px;border-radius:10px;background:rgba(0,0,0,.18)}
.nx-dx-tier{font-size:14px;margin-bottom:6px;text-align:center}.nx-dx-tier small{color:var(--muted)}
.nx-dx-acts{display:flex;flex-wrap:wrap;gap:6px;justify-content:center}
#dex-detail .nx-dx-acts .btn{margin:0;display:inline-flex;align-items:center;justify-content:center}
.nx-dx-acts .nx-comp-pick{display:contents}
.nx-dex-extra textarea{display:block;width:100%;box-sizing:border-box;resize:vertical;margin-top:8px;background:rgba(0,0,0,.3);color:inherit;border:2px solid rgba(244,248,255,.25);border-radius:8px;padding:6px 8px;font:inherit;font-size:14px}
.nx-dex-extra textarea:focus{outline:none;border-color:var(--edge)}
@media (min-height:521px){#scr-dex.nx-dx .box>.row.between{flex-wrap:wrap;row-gap:10px}#scr-dex.nx-dx .dex-tools{order:3;flex-basis:100%}#scr-dex.nx-dx .dex-tools input{flex-basis:260px}#scr-dex.nx-dx .grid{max-height:calc(100vh - 250px);max-height:calc(100dvh - 250px)}#scr-dex.nx-dx #dex-detail{max-height:calc(100vh - 250px);max-height:calc(100dvh - 250px);overflow-y:auto;overscroll-behavior:contain}}
@media (max-height:520px){
#scr-dex.nx-dx{padding:6px 8px;z-index:26}
#scr-dex.nx-dx .box>.row.between>h2{display:none}
#scr-dex.nx-dx .box>.row.between{gap:6px}
#scr-dex.nx-dx .dex-tools{gap:6px}
#scr-dex.nx-dx .dex-tools input,#scr-dex.nx-dx .dex-tools select{font-size:14px;padding:4px 8px}
#scr-dex.nx-dx .dex-tools select{max-width:150px}
#nx-dex-fp{position:absolute;left:8px;right:8px;bottom:8px;z-index:6;margin:6px 0 0;padding:0 12px 10px;overflow-y:auto;overscroll-behavior:contain;
  background:linear-gradient(180deg,var(--box1),var(--box2));border-color:var(--edge);box-shadow:0 0 0 2px var(--edge-out),0 10px 30px rgba(0,0,0,.5)}
.nx-dx-fph{position:sticky;top:0;z-index:1;padding:8px 0 6px;background:var(--box1)}
.nx-dx-g{grid-template-columns:84px 1fr;padding:5px 0}
#nx-dex-act{margin:4px 0 0;flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none}
#nx-dex-act::-webkit-scrollbar{display:none}
#scr-dex.nx-dx .cell b{font-size:12px}
#scr-dex.nx-dx #dex-detail p{font-size:13px !important}
#scr-dex.nx-dx #dex-detail .stat{font-size:13px}
.nx-dex-extra{margin:6px 0}}
@media (pointer:coarse){
#scr-dex.nx-dx .dex-tools input,#scr-dex.nx-dx .dex-tools select,#nx-dex-fbtn,#scr-dex.nx-dx .box>.row.between .btn{min-height:44px}
#scr-dex #nx-dex-fp .chip,#scr-dex #nx-dex-act .chip,#nx-dex-fp select,#nx-dex-fp .btn,.nx-dx-acts .btn,#dex-grid .nx-dx-empty .chip{min-height:44px}
.nx-dex-extra textarea{font-size:16px}}
@media (hover:none){#dex-grid .nx-fav{display:none}}
@media (prefers-reduced-motion:reduce){#dex-grid .nx-fav{transition:none}}
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
      const grid = $('dex-grid');
      mo = new MutationObserver(schedule);
      mo.observe(grid, { childList: true });
      // Cada vez que el juego redibuja sus filtros, la barra se pone al día.
      let syncPend = false;
      const syncSoon = () => { if (!syncPend) { syncPend = true; requestAnimationFrame(() => { syncPend = false; try { syncBar(); } catch (err) { NX.trip(KEY, err); } }); } };
      const gameMo = new MutationObserver(syncSoon);
      for (const id of ['dex-filters', 'dex-sort', 'dex-gens', 'dex-count', 'dex-type']) { const el = $(id); if (el) gameMo.observe(el, { childList: true, subtree: true, characterData: true }); }
      grid.addEventListener('click', (e) => { if (e.target.closest('.nx-dx-empty [data-act="clear"]')) clearFilters(); });
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
      if (scr) new MutationObserver(() => { if (NX.shown('scr-dex')) { redrawBar(); schedule(); } else toggleFp(false); }).observe(scr, { attributes: true, attributeFilter: ['class'] });
      schedule();
    },
  });
  // Escape cierra primero el panel de filtros.
  NX.keys.bind((e) => e.key === 'Escape' && fpOpen && NX.shown('scr-dex'), () => { toggleFp(false); return true; });

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
