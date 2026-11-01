// Checklist de colección: Pokémon, shinies y logros que faltan, agrupados por
// región (los logros, por categoría), con su progreso y cómo se consiguen
// según los datos del propio juego (probabilidades del gacha, garantía de
// legendaria, Amuleto Iris, banner de evento y descripción de cada logro).
// Solo lee el guardado; no cambia nada.
// Carga diferida (src/core/lazy.js): en la edición, lo que sigue a
// //#nexus-lazy va en un archivo aparte que se carga al primer uso; esta
// declaración deja mientras tanto su estado, su sección del panel y sus atajos.
NX.lazy.declare('dex', {
  feats: [['coll', 'Checklist de colección']],
  sections: [{ key: 'coll', tab: 'Menús', title: 'Checklist de colección', keywords: 'colección faltan pokémon shiny logros región progreso checklist' }],
  screens: ['scr-dex', 'scr-goals'],
});
//#nexus-lazy
(() => {
  const KEY = 'coll';
  const ns = () => NX.ns;
  const $ = (id) => document.getElementById(id);
  const T = (s) => { try { return typeof ns().T === 'function' ? ns().T(s) : s; } catch (_) { return s; } };
  const icon = (name, px) => { try { return ns().Icons.html(name, px); } catch (_) { return ''; } };
  const fmt = (n) => (+n || 0).toLocaleString((ns().I18n && ns().I18n.locale) || 'es');
  const pct = (x) => (x >= 0.1 ? x.toFixed(1) : x >= 0.01 ? x.toFixed(2) : x.toFixed(3)).replace('.', ',') + ' %';
  const pad = (n) => String(n).padStart(3, '0');
  const fold = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  let el = null, tab = NX.store.get('coll:tab', 'mon'), query = '', showDone = false;
  const openGroups = new Set(NX.store.get('coll:open', []));

  const bar = (have, total) => `<div class="bar"><i style="width:${total ? Math.round((have / total) * 100) : 0}%"></i></div>`;
  const hasShiny = (dex) => { try { return ns().Sprites.hasShiny(dex); } catch (_) { return false; } };

  // Probabilidad de que una tirada del banner gen dé justo este Pokémon.
  function pullChance(p, gen) {
    const { Gacha } = ns();
    const rate = (Gacha.RATES.find((r) => r[0] === p.rarity) || [0, 0])[1];
    let n = 0;
    try { n = Gacha.pool(p.rarity, gen).length; } catch (_) { n = 0; }
    return n ? rate / n : 0;
  }

  function regions() {
    const { Gacha, MenuUI } = ns();
    return Gacha.BANNERS.map((b) => ({ gen: b.gen, name: T(b.name || (MenuUI.GEN_NAMES || [])[b.gen - 1]) }));
  }

  function monHow(p, sv) {
    const { Gacha } = ns();
    const reg = regions().find((r) => r.gen === p.gen);
    const parts = [`Gacha de ${NX.esc(reg ? reg.name : 'su región')}: ${pct(pullChance(p, p.gen))} por tirada`];
    if (p.rarity === 5) {
      const left = (Gacha.PITY_5 || 70) - ((sv.pity || {})[p.gen] || 0);
      parts.push(`legendaria garantizada en ${left} tiradas`);
    }
    if (p.starter) parts.push('también puede ser tu inicial');
    if (Gacha.SPOOKY && Gacha.isOpen(Gacha.SPOOKY.gen) && p.types.includes('ghost')) parts.push(`o en ${NX.esc(T(Gacha.SPOOKY.name))}`);
    return parts.join(' · ');
  }

  function group(id, title, have, total, body, extra) {
    const open = openGroups.has(id) || !!query;
    return `<details class="nx-coll-g" data-g="${NX.esc(id)}"${open ? ' open' : ''}><summary><b>${title}</b>
      <span class="nx-coll-n">${fmt(have)} / ${fmt(total)}</span>${bar(have, total)}</summary>
      ${extra ? `<p class="note" style="margin:4px 0 6px">${extra}</p>` : ''}${body || '<p class="note" style="margin:4px 0">Nada pendiente aquí.</p>'}</details>`;
  }

  function renderMon(sv, shiny) {
    const { DEX, Gacha } = ns();
    const owned = shiny ? sv.shiny || {} : sv.owned || {};
    const q = fold(query);
    let allHave = 0, allTotal = 0, html = '';
    for (const r of regions()) {
      const pool = DEX.filter((p) => p.gen === r.gen && (!shiny || hasShiny(p.dex)));
      const have = pool.filter((p) => owned[p.dex]).length;
      allHave += have;
      allTotal += pool.length;
      const list = pool.filter((p) => (showDone || !owned[p.dex]) && (!q || fold(p.name).includes(q) || pad(p.dex).includes(q)))
        .sort((a, b) => b.rarity - a.rarity || a.dex - b.dex);
      if (q && !list.length) continue;
      const rows = list.map((p) => `<div class="nx-coll-i${owned[p.dex] ? ' done' : ''}"><span class="nx-coll-no">#${pad(p.dex)}</span>
        <b>${shiny ? icon('shiny', 10) + ' ' : ''}${NX.esc(p.name)}</b> <small style="color:${Gacha.RARITY_COLOR[p.rarity]}">${NX.esc(Gacha.RARITY_NAME[p.rarity] || '')}</small>
        ${owned[p.dex] ? '<small class="gold">conseguido</small>' : shiny ? '' : `<small>${monHow(p, sv)}</small>`}</div>`).join('');
      let extra = '';
      if (shiny) {
        let rate = 0.01;
        try { rate = Gacha.shinyRate(sv, r.gen); } catch (_) { rate = Gacha.SHINY_RATE || 0.01; }
        extra = `En el gacha de ${NX.esc(r.name)} cada Pokémon sale shiny con ${pct(rate * 100)}` +
          (rate < 0.02 ? ' (2 % con el Amuleto Iris, que se gana al completar la región)' : '') +
          '; si ya tienes ese shiny, el juego lo cambia por uno que te falte. También aparecen shinies en partida.';
      }
      html += group((shiny ? 's' : 'm') + r.gen, NX.esc(r.name), have, pool.length, rows, extra);
    }
    const head = `<div class="nx-coll-sum"><b>${shiny ? 'Shinies' : 'Pokémon'}</b> ${fmt(allHave)} / ${fmt(allTotal)}${bar(allHave, allTotal)}</div>`;
    return head + (html || '<p class="note">Ningún resultado.</p>');
  }

  function renderAch(sv) {
    const { AchDefs, Progress } = ns();
    const done = sv.ach || {};
    const q = fold(query);
    const list = AchDefs.LIST;
    const allHave = list.filter((a) => done[a.id]).length;
    let html = '';
    for (const [cat, catName] of AchDefs.CATS) {
      const items = list.filter((a) => a.cat === cat);
      const have = items.filter((a) => done[a.id]).length;
      const shown = items.filter((a) => (showDone || !done[a.id]) && (!q || fold(T(a.name) + ' ' + T(a.desc)).includes(q)));
      if (q && !shown.length) continue;
      const rows = shown.map((a) => {
        let v = 0;
        try { v = Math.max(0, +a.value(sv) || 0); } catch (_) { v = 0; }
        const ok = !!done[a.id];
        let rw = '';
        try { rw = Progress.rewardText(a.reward || {}); } catch (_) { rw = ''; }
        return `<div class="nx-coll-i ach${ok ? ' done' : ''}"><div><b>${NX.esc(T(a.name))}</b>${a.title ? ` <small class="gold">título: ${NX.esc(T(a.title))}</small>` : ''}
          <small>${NX.esc(T(a.desc))}</small>${ok ? '' : `${bar(Math.min(v, a.goal), a.goal)}<small>${fmt(Math.min(v, a.goal))} / ${fmt(a.goal)}</small>`}</div>
          <span class="a-rw">${ok ? '<small class="gold">conseguido</small>' : rw}</span></div>`;
      }).join('');
      html += group('a' + cat, NX.esc(T(catName)), have, items.length, rows);
    }
    const head = `<div class="nx-coll-sum"><b>Logros</b> ${fmt(allHave)} / ${fmt(list.length)}${bar(allHave, list.length)}</div>`;
    return head + (html || '<p class="note">Ningún resultado.</p>');
  }

  function render() {
    if (!el) return;
    const body = el.querySelector('.nx-coll-body');
    const sv = ns().DB && ns().DB.save;
    el.querySelectorAll('.tab').forEach((t) => t.classList.toggle('on', t.dataset.tab === tab));
    if (!sv) { body.innerHTML = '<p class="note">Inicia sesión o juega como invitado para ver tu colección.</p>'; return; }
    const top = body.scrollTop;
    try {
      body.innerHTML = tab === 'ach' ? renderAch(sv) : renderMon(sv, tab === 'shiny');
    } catch (err) {
      body.innerHTML = '<p class="note">No se pudo armar la lista: el juego cambió.</p>';
      NX.trip(KEY, err);
    }
    body.scrollTop = top;
  }

  const onKey = (e) => { if (e.key === 'Escape' && el) { e.preventDefault(); e.stopImmediatePropagation(); close(); } };
  function close() { if (el) { el.remove(); el = null; removeEventListener('keydown', onKey, true); } }
  function open() {
    if (!NX.ns || !NX.isOn(KEY)) return;
    close();
    el = document.createElement('section');
    el.className = 'scr dim nx-coll';
    el.style.zIndex = 60;
    el.innerHTML = `<div class="box wide">
      <div class="row between"><h2>Checklist de colección</h2><button class="btn small ghost" data-close type="button">Cerrar</button></div>
      <div class="tabs"><div class="tab" data-tab="mon">Pokémon</div><div class="tab" data-tab="shiny">${icon('shiny', 12)} Shiny</div><div class="tab" data-tab="ach">Logros</div></div>
      <div class="row" style="gap:10px;margin-bottom:8px"><input class="field nx-coll-q" type="search" placeholder="Buscar por nombre o número" style="flex:1;min-width:160px;width:auto">
      <label class="nx-coll-done"><input type="checkbox"> Mostrar conseguidos</label></div>
      <div class="goals-body nx-coll-body"></div></div>`;
    el.addEventListener('click', (e) => {
      if (e.target === el || e.target.closest('[data-close]')) { close(); return; }
      const t = e.target.closest('.tab[data-tab]');
      if (t) { tab = t.dataset.tab; NX.store.set('coll:tab', tab); el.querySelector('.nx-coll-body').scrollTop = 0; render(); }
    });
    el.addEventListener('toggle', (e) => {
      const g = e.target.closest && e.target.closest('details[data-g]');
      if (!g || query) return;
      if (g.open) openGroups.add(g.dataset.g); else openGroups.delete(g.dataset.g);
      NX.store.set('coll:open', [...openGroups]);
    }, true);
    const q = el.querySelector('.nx-coll-q');
    q.value = query;
    let qt = 0;
    q.addEventListener('keydown', (e) => { if (e.key !== 'Escape') e.stopPropagation(); });
    q.addEventListener('input', () => { clearTimeout(qt); qt = setTimeout(() => { query = q.value.trim(); render(); }, 150); });
    const cb = el.querySelector('.nx-coll-done input');
    cb.checked = showDone;
    cb.addEventListener('change', () => { showDone = cb.checked; render(); });
    addEventListener('keydown', onKey, true);
    document.body.appendChild(el);
    render();
  }

  // Botón "Checklist" en la cabecera de Pokémon y de Misiones.
  function addButton(scrId) {
    const scr = $(scrId);
    const back = scr && scr.querySelector('.row.between [data-back]');
    if (!back || scr.querySelector('.nx-coll-btn')) return;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn small nx-coll-btn';
    b.textContent = 'Checklist';
    b.title = 'Lo que te falta: Pokémon, shinies y logros';
    b.addEventListener('click', open);
    const wrap = document.createElement('div');
    wrap.className = 'row';
    wrap.style.gap = '8px';
    back.replaceWith(wrap);
    wrap.append(b, back);
  }

  NX.css(`.nx-coll .box{width:min(900px,100%)}
.nx-coll .tab{cursor:pointer}
.nx-coll-done{display:flex;align-items:center;gap:6px;margin:0;cursor:pointer}
.nx-coll-done input{width:16px;height:16px;margin:0;accent-color:#ffd23f}
.nx-coll .bar{height:7px;background:rgba(0,0,0,.4);border-radius:6px;overflow:hidden;margin:4px 0 2px}
.nx-coll .bar i{display:block;height:100%;background:var(--gold,#ffd23f)}
.nx-coll-sum{margin:2px 0 10px;font-size:15px}
.nx-coll-g{margin-bottom:6px;padding:8px 12px;border-radius:8px;background:rgba(0,0,0,.22);border:2px solid rgba(244,248,255,.14)}
.nx-coll-g summary{cursor:pointer;display:grid;grid-template-columns:1fr auto;gap:2px 10px;align-items:center}
.nx-coll-g summary .bar{grid-column:1/-1}
.nx-coll-n{font-variant-numeric:tabular-nums;color:var(--muted)}
.nx-coll-i{padding:5px 2px;border-top:1px solid rgba(255,255,255,.08);font-size:14px}
.nx-coll-i small{color:var(--muted);font-size:12px;margin-left:4px}
.nx-coll-i.done{opacity:.6}
.nx-coll-i.ach{display:grid;grid-template-columns:1fr auto;gap:10px;align-items:center}
.nx-coll-i.ach small{display:block;margin-left:0}
.nx-coll-no{color:var(--muted);font-size:12px;margin-right:4px;font-variant-numeric:tabular-nums}
.nx-coll-btn.nx-off{display:none}`);

  NX.feature({
    key: KEY,
    label: 'Checklist de colección',
    needs: (n) => n.DEX && n.DB && n.Gacha && Array.isArray(n.Gacha.BANNERS) && Array.isArray(n.Gacha.RATES) &&
      n.AchDefs && Array.isArray(n.AchDefs.LIST) && Array.isArray(n.AchDefs.CATS) && n.Sprites && !!$('scr-dex'),
    setup() {
      addButton('scr-dex');
      addButton('scr-goals');
      setInterval(() => {
        const on = NX.isOn(KEY);
        document.querySelectorAll('.nx-coll-btn').forEach((b) => b.classList.toggle('nx-off', !on));
        if (!on) close();
      }, 1000);
    },
  });

  NX.settings.section({
    key: KEY,
    tab: 'Menús',
    title: 'Checklist de colección',
    keywords: 'colección faltan pokémon shiny logros región progreso checklist',
    render(sec) {
      sec.appendChild(NX.ui.toggle('Activado', 'on:' + KEY, true));
      sec.appendChild(NX.ui.note('Botón "Checklist" en Pokémon y en Misiones: lo que te falta por región, con progreso y cómo conseguirlo.'));
      sec.appendChild(NX.ui.button('Abrir checklist', () => { if (NX.ns) { NX.togglePanel(); open(); } }));
    },
  });
})();
