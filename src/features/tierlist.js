// Tier list: pantalla en el menú principal con los Pokémon ordenados en filas
// S, A, B, C y D según tres fuentes: el modelo Nexus (datos del juego),
// SurvivorTiers (simulaciones de @fildotai) y su ranking personal (historial).
// Filtros por tipo, región, estilo y poseídos, buscador, y al tocar un
// Pokémon abre su ficha en el Centro de builds. Los sprites se dibujan solo
// cuando la fila entra en pantalla, para no crear cientos de lienzos de golpe.
(() => {
  const KEY = 'tierlist';
  const TIERS = ['S', 'A', 'B', 'C', 'D'];
  const SRC = [['nexus', 'Nexus'], ['st', 'SurvivorTiers'], ['mine', 'Mi ranking']];
  const st = Object.assign({ src: 'nexus', q: '', type: '', gen: '', style: '', own: false }, NX.store.get('tl:state', {}));
  const save = () => NX.store.set('tl:state', { src: st.src, type: st.type, gen: st.gen, style: st.style, own: st.own });
  const ns = () => NX.ns;
  const $ = (id) => document.getElementById(id);
  let scr = null, io = null, renderT = 0;

  NX.css(`#nexus-tl{z-index:61}
#nexus-tl .box{width:min(980px,calc(100vw - 16px));max-height:calc(100vh - 20px);display:flex;flex-direction:column;box-sizing:border-box}
#nexus-tl .nx-tl-head{display:flex;justify-content:space-between;align-items:center;gap:8px}
#nexus-tl .nx-tl-bar{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:6px 0}
#nexus-tl .nx-tl-bar input:not([type=checkbox]),#nexus-tl .nx-tl-bar select{font:inherit;font-size:14px;background:#0b1838;color:#fff;border:1px solid #5b83d6;border-radius:6px;padding:4px 7px;min-height:32px}
#nexus-tl .nx-tl-bar input:not([type=checkbox]){flex:1;min-width:140px}
#nexus-tl .nx-tl-bar label.chip{display:inline-flex;align-items:center;gap:6px;margin:0;color:inherit;font-size:14px;min-height:32px}
#nexus-tl .nx-tl-bar label.chip input{width:16px;height:16px;margin:0;accent-color:#ffd23f}
#nexus-tl .nx-tl-bar label.chip:has(input:checked){border-color:var(--gold);color:var(--gold)}
#nexus-tl .nx-tl-meta{font-size:13px;color:var(--muted);margin:0 0 6px}
#nexus-tl .nx-tl-body{overflow:auto;flex:1;min-height:0;padding-right:4px}
#nexus-tl .nx-tl-row{display:flex;gap:8px;margin:6px 0;align-items:stretch}
#nexus-tl .nx-tl-t{flex:0 0 46px;display:flex;flex-direction:column;align-items:center;justify-content:center;border-radius:8px;font-size:24px;font-weight:700;color:#1b1528;background:var(--tc)}
#nexus-tl .nx-tl-t small{font-size:10px;font-weight:600}
#nexus-tl .nx-tl-mons{flex:1;display:flex;flex-wrap:wrap;gap:4px;background:rgba(11,24,56,.6);border-radius:8px;padding:5px;min-height:52px}
#nexus-tl .nx-tl-m{width:58px;display:flex;flex-direction:column;align-items:center;cursor:pointer;border-radius:6px;padding:2px 0;position:relative}
#nexus-tl .nx-tl-m:hover{background:rgba(255,255,255,.08)}
#nexus-tl .nx-tl-m .sp{width:44px;height:40px;display:flex;align-items:flex-end;justify-content:center}
#nexus-tl .nx-tl-m canvas{max-width:44px;max-height:40px;image-rendering:pixelated}
#nexus-tl .nx-tl-m span{font-size:11px;line-height:1.1;text-align:center;max-width:56px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#nexus-tl .nx-tl-m.no{opacity:.45}
#nexus-tl .nx-tl-m i{position:absolute;top:1px;right:3px;font-style:normal;font-size:9px;color:#ffd23f}
#nexus-tl .nx-tl-empty{color:var(--muted);font-size:14px;padding:10px}
@media (pointer:coarse){#nexus-tl .nx-tl-bar input:not([type=checkbox]),#nexus-tl .nx-tl-bar select,#nexus-tl .nx-tl-bar label.chip{min-height:44px}#nexus-tl .nx-tl-bar label.chip input{width:22px;height:22px}}
@media (max-height:520px){#nexus-tl .box{padding:8px 10px}#nexus-tl .nx-tl-bar{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none;flex:none}#nexus-tl .nx-tl-bar>*{flex-shrink:0}#nexus-tl .nx-tl-bar input:not([type=checkbox]){min-width:100px}#nexus-tl .nx-tl-bar select{max-width:150px}#nexus-tl .nx-tl-meta{display:none}}
@media (max-width:640px){#nexus-tl .nx-tl-m{width:50px}#nexus-tl .nx-tl-t{flex-basis:38px;font-size:20px}}`);

  const genName = (g) => { const N = ns(); const n = ((N.MenuUI && N.MenuUI.GEN_NAMES) || [])[g - 1]; return n ? (NX.gd ? NX.gd.tr(n) : n) : 'Región ' + g; };
  const owns = (dex) => { try { return !!ns().DB.owns(dex); } catch (_) { return false; } };
  const monName = (dex) => (NX.gd ? NX.gd.monName(dex) : ((ns().DEX_BY[dex] || {}).name || '#' + dex));

  // Filas de la fuente elegida: [{ dex, tier, rank, note }].
  async function rowsFor(src) {
    if (src === 'nexus') {
      if (!NX.buildModel) return { rows: [], note: 'El modelo Nexus no está disponible.' };
      await NX.buildModel.ready();
      return { rows: NX.buildModel.all().map((r) => ({ dex: r.dex, tier: r.tier, rank: r.rank, note: 'puntuación ' + r.score })), note: 'Modelo Nexus: estimación con los datos del juego (daño en grupo, daño a jefes y aguante).' };
    }
    if (src === 'st') {
      const t = NX.gd && NX.gd.tiers();
      if (!t) return { rows: [], note: 'Sin datos de SurvivorTiers en este modo.' };
      let rows = t.rows;
      if (st.style) rows = rows.filter((r) => r.style === st.style);
      return { rows: rows.map((r) => ({ dex: +r.dex, tier: r.tier, rank: r.rank, note: (NX.gd.styleName(r.style) || '') })), note: 'SurvivorTiers de @fildotai · ' + (NX.gd.tierMetaHtml ? NX.gd.tierMetaHtml().replace(/<[^>]+>/g, '') : '') };
    }
    const pr = typeof NX.personalRank === 'function' ? NX.personalRank() : [];
    return { rows: pr.map((r, i) => ({ dex: r.dex, tier: r.tier, rank: i + 1, note: r.runs + ' partida' + (r.runs === 1 ? '' : 's') })), note: pr.length ? 'Mi ranking: calculado con su historial de partidas (60 % tiempo sobrevivido, 40 % DPS).' : 'Aún no hay partidas suficientes para su ranking personal.' };
  }

  function sprite(holder) {
    if (holder.dataset.done) return;
    holder.dataset.done = '1';
    try { holder.appendChild(ns().UI.spriteCanvas(+holder.dataset.dex, 44, 40, { scale: 1 })); } catch (_) { holder.textContent = '?'; }
  }

  async function render() {
    if (!scr) return;
    const N = ns();
    const body = scr.querySelector('.nx-tl-body'), meta = scr.querySelector('.nx-tl-meta');
    body.innerHTML = '<div class="nx-tl-empty">Calculando…</div>';
    const { rows, note } = await rowsFor(st.src);
    meta.textContent = note;
    const q = st.q.trim().toLowerCase();
    const list = rows.filter((r) => {
      const p = N.DEX_BY[r.dex];
      if (!p) return false;
      if (st.type && !(p.types || []).includes(st.type)) return false;
      if (st.gen && String(p.gen) !== st.gen) return false;
      if (st.own && !owns(r.dex)) return false;
      if (q && !(monName(r.dex).toLowerCase().includes(q) || String(r.dex) === q)) return false;
      return true;
    }).sort((a, b) => a.rank - b.rank);
    if (!list.length) { body.innerHTML = '<div class="nx-tl-empty">Ningún Pokémon coincide con los filtros.</div>'; return; }
    const col = (t) => ((NX.gd && NX.gd.TIER_COL) || {})[t] || '#9aa6b5';
    body.innerHTML = TIERS.map((t) => {
      const ms = list.filter((r) => r.tier === t);
      if (!ms.length) return '';
      return `<div class="nx-tl-row"><div class="nx-tl-t" style="--tc:${col(t)}">${t}<small>${ms.length}</small></div><div class="nx-tl-mons">${ms.map((r) =>
        `<div class="nx-tl-m${owns(r.dex) ? '' : ' no'}" data-dex="${r.dex}" title="#${r.dex} ${NX.esc(monName(r.dex))} · puesto ${r.rank}${r.note ? ' · ' + NX.esc(r.note) : ''}${owns(r.dex) ? '' : ' · no lo tienes'}">` +
        `<i>${r.rank}</i><div class="sp" data-dex="${r.dex}"></div><span>${NX.esc(monName(r.dex))}</span></div>`).join('')}</div></div>`;
    }).join('');
    if (io) io.disconnect();
    io = 'IntersectionObserver' in window ? new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting) { sprite(e.target); io.unobserve(e.target); } }, { root: body, rootMargin: '200px' }) : null;
    body.querySelectorAll('.sp').forEach((h) => (io ? io.observe(h) : sprite(h)));
  }

  function build() {
    const N = ns();
    scr = document.createElement('section');
    scr.id = 'nexus-tl';
    scr.className = 'scr dim hidden';
    const types = Object.keys((N.U && N.U.TYPE_NAME) || {});
    const gens = [...new Set((N.DEX || []).map((p) => p && p.gen).filter(Boolean))].sort((a, b) => a - b);
    scr.innerHTML = `<div class="box">
      <div class="nx-tl-head"><h2>Tier list</h2><button type="button" class="btn small ghost" data-x>Cerrar</button></div>
      <div class="nx-tl-bar">${SRC.map(([k, t]) => `<button type="button" class="chip${st.src === k ? ' on' : ''}" data-src="${k}">${t}</button>`).join('')}</div>
      <div class="nx-tl-bar">
        <input type="search" placeholder="Buscar Pokémon o número…" value="${NX.esc(st.q)}">
        <select data-f="type"><option value="">Todos los tipos</option>${types.map((t) => `<option value="${t}">${NX.esc(NX.gd ? NX.gd.typeName(t) : t)}</option>`).join('')}</select>
        <select data-f="gen"><option value="">Todas las regiones</option>${gens.map((g) => `<option value="${g}">${NX.esc(genName(g))}</option>`).join('')}</select>
        <select data-f="style"><option value="">Ambos estilos</option><option value="ranged">A distancia</option><option value="melee">Cuerpo a cuerpo</option></select>
        <label class="chip" style="cursor:pointer"><input type="checkbox" data-f="own" style="margin-right:4px">Solo los míos</label>
      </div>
      <p class="nx-tl-meta"></p>
      <div class="nx-tl-body"></div></div>`;
    document.body.appendChild(scr);
    for (const ev of ['pointerdown', 'mousedown', 'touchstart', 'wheel']) scr.addEventListener(ev, (e) => e.stopPropagation());
    scr.querySelector('[data-x]').addEventListener('click', close);
    scr.addEventListener('click', (e) => { if (e.target === scr) close(); });
    scr.querySelectorAll('[data-src]').forEach((b) => b.addEventListener('click', () => {
      st.src = b.dataset.src; save();
      scr.querySelectorAll('[data-src]').forEach((x) => x.classList.toggle('on', x === b));
      syncStyle(); render();
    }));
    const search = scr.querySelector('input[type=search]');
    search.addEventListener('input', () => { st.q = search.value; clearTimeout(renderT); renderT = setTimeout(render, 200); });
    for (const sel of scr.querySelectorAll('select[data-f]')) {
      sel.value = st[sel.dataset.f] || '';
      sel.addEventListener('change', () => { st[sel.dataset.f] = sel.value; save(); render(); });
    }
    const own = scr.querySelector('input[data-f=own]');
    own.checked = !!st.own;
    own.addEventListener('change', () => { st.own = own.checked; save(); render(); });
    // Tocar un Pokémon abre su ficha en el Centro de builds.
    scr.querySelector('.nx-tl-body').addEventListener('click', (e) => {
      const m = e.target.closest('.nx-tl-m');
      if (!m) return;
      const dex = +m.dataset.dex;
      if (NX.buildCenter && typeof NX.buildCenter.open === 'function') { close(); NX.buildCenter.open(dex); }
    });
    syncStyle();
  }
  // El filtro de estilo solo aplica a SurvivorTiers, que clasifica por estilo.
  function syncStyle() {
    const s = scr && scr.querySelector('select[data-f=style]');
    if (s) s.style.display = st.src === 'st' ? '' : 'none';
  }

  function open() {
    if (!scr) build();
    scr.classList.remove('hidden');
    render();
  }
  function close() { if (scr) scr.classList.add('hidden'); }

  function placeMenu() {
    let b = $('nexus-tl-btn');
    const anchor = $('nexus-bc-btn') || document.querySelector('#scr-menu [data-go="dex"]');
    if (!NX.isOn(KEY)) { if (b) b.remove(); return; }
    if (!anchor) return;
    if (!b) {
      b = document.createElement('button');
      b.type = 'button';
      b.id = 'nexus-tl-btn';
      b.className = 'menu-item';
      b.dataset.sfx = 'confirm';
      b.innerHTML = '<span class="mi-ico" aria-hidden="true">≡</span><span>Tier list</span><small>Los Pokémon por tiers S, A, B, C y D</small>';
      b.addEventListener('click', (e) => { e.stopPropagation(); b.blur(); open(); });
    }
    if (anchor.nextElementSibling !== b) anchor.after(b);
  }

  NX.feature({
    key: KEY,
    label: 'Tier list',
    needs: (n) => n.DEX && n.DEX_BY && n.UI && typeof n.UI.spriteCanvas === 'function' && !!NX.gd,
    setup() {
      NX.onReady(() => {
        placeMenu();
        if (NX.every) NX.every(1000, placeMenu, { when: 'menu', key: KEY });
        else setInterval(() => { try { placeMenu(); } catch (err) { NX.trip(KEY, err); } }, 1000);
      });
      NX.keys.bind((e) => e.key === 'Escape' && scr && !scr.classList.contains('hidden'), () => { close(); return true; });
      NX.runs.on('start', close);
    },
  });
  NX.tierList = { open, close };

  NX.settings.section({
    key: KEY,
    tab: 'Datos',
    title: 'Tier list',
    keywords: 'tier list tierlist ranking s a b c d',
    render(el) {
      el.appendChild(NX.ui.toggle('Activado (botón "Tier list" en el menú)', 'on:' + KEY, true));
      el.appendChild(NX.ui.button('Abrir la tier list', () => { if (NX.togglePanel) NX.togglePanel(); open(); }));
      el.appendChild(NX.ui.note('Tres fuentes: el modelo Nexus con los datos del juego, SurvivorTiers y su ranking personal. Toque un Pokémon para ver su build.'));
    },
  });
})();
