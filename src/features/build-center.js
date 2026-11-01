// Centro de builds: botón "Builds" en el menú principal (y "Ver build" en la
// ficha de la Pokédex) que abre una pantalla con el ranking de todos los
// Pokémon según el modelo Build Nexus (build-model.js), con buscador y
// filtros, y para cada Pokémon: la Build Nexus con su porqué, la build de
// SurvivorTiers (si el cascarón trajo los datos) y tu mejor build según tu
// historial de partidas. NX.buildModel, NX.gd, NX.telemetry, NX.personalRank
// y NX.buildlab se leen de forma perezosa.
// Carga diferida (src/core/lazy.js): en la edición, lo que sigue a
// //#nexus-lazy va en un archivo aparte que se carga al primer uso; esta
// declaración deja mientras tanto su estado, su sección del panel y sus atajos.
NX.lazy.declare('builds', {
  feats: [['build-center', 'Centro de builds']],
  sections: [{ key: 'build-center', tab: 'Datos', title: 'Centro de builds', keywords: 'build builds mejor movimientos ranking tier modelo nexus survivortiers laboratorio' }],
  screens: ['scr-dex'],
  menu: {
    id: 'nexus-bc-btn', feat: 'build-center', after: '#scr-menu [data-go="dex"]',
    html: (ns) => `<span class="mi-ico" aria-hidden="true">${(ns && ns.Icons && ns.Icons.html('fist', 18)) || '★'}</span><span>Builds</span><small>La mejor build de cada Pokémon</small>`,
    open: () => NX.buildCenter.open(),
  },
});
//#nexus-lazy
(() => {
  const KEY = 'build-center';
  const ns = () => NX.ns;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => NX.esc(s == null ? '' : s);
  const pad = (n) => String(n).padStart(3, '0');
  const fold = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const num = (v, d = 0) => (+v || 0).toLocaleString('es-VE', { maximumFractionDigits: d });

  const st = Object.assign({ q: '', type: '', gen: '', tier: '', own: false, sort: 'nexus', sel: 0, tm: false }, NX.store.get('bc:state', {}));
  const save = () => NX.store.set('bc:state', { type: st.type, gen: st.gen, tier: st.tier, own: st.own, sort: st.sort, sel: st.sel, tm: st.tm, style: st.style });

  NX.css(`#nexus-bc{z-index:61}
#nexus-bc .nx-bc-box{width:min(1120px,100%);max-height:calc(100vh - 60px);max-height:calc(100dvh - 60px);display:flex;flex-direction:column;gap:8px;padding:14px 16px;overflow:hidden;box-sizing:border-box}
#nexus-bc .nx-bc-head{display:flex;justify-content:space-between;align-items:center;gap:10px}
#nexus-bc .nx-bc-head h2{margin:0}
#nexus-bc .nx-bc-cols{display:grid;grid-template-columns:minmax(280px,390px) 1fr;gap:12px;min-height:0;flex:1}
#nexus-bc .nx-bc-left,#nexus-bc .nx-bc-right{min-height:0;display:flex;flex-direction:column;gap:6px}
#nexus-bc .nx-bc-right{overflow:auto;overscroll-behavior:contain;padding-right:4px}
#nexus-bc .field{width:100%;box-sizing:border-box;font-size:15px;padding:7px 10px}
#nexus-bc .nx-bc-fil{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
#nexus-bc select{font:inherit;font-size:13px;background:rgba(0,0,0,.3);color:#fff;border:2px solid rgba(244,248,255,.25);border-radius:20px;padding:4px 8px;text-shadow:none;max-width:100%}
#nexus-bc select option{background:#14204a}
#nexus-bc .chip{color:inherit;font-family:inherit}
#nexus-bc .nx-bc-cnt{font-size:12px;color:var(--muted,#b9cbf0);text-shadow:none}
#nexus-bc .nx-bc-list{flex:1;min-height:160px;overflow:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;touch-action:pan-y;background:rgba(0,0,0,.2);border:2px solid rgba(244,248,255,.2);border-radius:10px}
#nexus-bc .nx-bc-row{display:grid;grid-template-columns:38px 24px minmax(0,1fr) auto 30px;align-items:center;gap:6px;width:100%;min-height:42px;box-sizing:border-box;padding:4px 8px;
  background:transparent;border:0;border-bottom:1px solid rgba(255,255,255,.08);color:inherit;font:inherit;font-size:14px;text-align:left;cursor:pointer;text-shadow:1px 1px 0 var(--shadow,#0a1430)}
#nexus-bc .nx-bc-row:hover,#nexus-bc .nx-bc-row:focus-visible{background:rgba(255,255,255,.07);outline:none}
#nexus-bc .nx-bc-row.on{background:rgba(255,210,63,.16);box-shadow:inset 3px 0 0 var(--gold,#ffd23f)}
#nexus-bc .nx-bc-row .rk{color:var(--muted,#b9cbf0);font-size:12px}
#nexus-bc .nx-bc-row .nm{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#nexus-bc .nx-bc-row .nm small{display:block;line-height:1}
#nexus-bc .nx-bc-row .sc{text-align:right;color:var(--gold,#ffd23f)}
#nexus-bc .nx-bc-row .stb{font-size:11px;color:var(--muted,#b9cbf0);display:flex;align-items:center;gap:3px}
#nexus-bc .nx-bc-row .stb .nx-tier{min-width:15px;height:15px;font-size:10px}
#nexus-bc .nx-tier.big{min-width:30px;height:30px;font-size:20px;border-radius:7px}
#nexus-bc .nx-bc-hd{display:grid;grid-template-columns:auto 1fr auto;gap:12px;align-items:center}
#nexus-bc .nx-bc-spr canvas{display:block}
#nexus-bc .nx-bc-hd h3{margin:0;font-size:22px}
#nexus-bc .nx-bc-hd .sub{margin:0;font-size:13px}
#nexus-bc .nx-bc-sc{text-align:center;display:flex;flex-direction:column;align-items:center;gap:2px}
#nexus-bc .nx-bc-sc b{font-size:20px;color:var(--gold,#ffd23f)}
#nexus-bc .nx-bc-sc small{font-size:11px;color:var(--muted,#b9cbf0);text-shadow:none}
#nexus-bc .panel{padding:10px 12px}
#nexus-bc .nx-bc-sec h4{margin:0 0 6px;font-size:16px;color:var(--gold,#ffd23f);display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between}
#nexus-bc .nx-bc-mv{display:grid;grid-template-columns:minmax(120px,170px) 1fr;gap:8px;align-items:start;margin:5px 0}
#nexus-bc .nx-bc-mv .mn{padding:3px 8px;border-radius:8px;color:#fff;font-size:13px;text-shadow:1px 1px 0 #0a1430;text-align:center}
#nexus-bc .nx-bc-mv .mn i{font-style:normal;font-size:10px;opacity:.9;display:block}
#nexus-bc .nx-bc-mv small{color:#dfe8fb;font-size:12px;line-height:1.35;text-shadow:none}
#nexus-bc .nx-bc-chips{display:flex;flex-wrap:wrap;gap:4px;margin:4px 0}
#nexus-bc .nx-bc-chips span{padding:2px 8px;border-radius:8px;color:#fff;font-size:12px;text-shadow:1px 1px 0 #0a1430}
#nexus-bc .nx-bc-chips span.hit{box-shadow:0 0 0 2px var(--gold,#ffd23f)}
#nexus-bc .nx-bc-bars{display:grid;gap:4px;margin:8px 0 4px}
#nexus-bc .nx-bc-bar{display:grid;grid-template-columns:110px 1fr 38px;gap:8px;align-items:center;font-size:12px;text-shadow:none}
#nexus-bc .nx-bc-bar>span{color:var(--muted,#b9cbf0)}
#nexus-bc .nx-bc-bar .tr{height:8px;background:rgba(0,0,0,.35);border-radius:6px;overflow:hidden}
#nexus-bc .nx-bc-bar .tr i{display:block;height:100%;background:var(--gold,#ffd23f)}
#nexus-bc .nx-bc-bar b{text-align:right}
#nexus-bc .nx-bc-p{margin:4px 0;font-size:12px;color:var(--muted,#b9cbf0);text-shadow:none;line-height:1.4}
#nexus-bc .nx-bc-p a{color:inherit;text-decoration:underline}
#nexus-bc .nx-bc-p b{color:#fff}
#nexus-bc .nx-bc-act{display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end}
#nexus-bc .nx-bc-back{display:none}
#nexus-bc .nx-bc-empty{padding:30px 10px;text-align:center;color:var(--muted,#b9cbf0)}
#nexus-bc .nx-bc-foot{margin:0;font-size:11px;color:var(--muted,#b9cbf0);text-shadow:none}
#dex-detail .nx-bc-dexbtn{margin:6px auto 0;display:inline-flex}
html.nx-bc-open #nexus-fab{visibility:hidden}
@media (max-width:760px),(max-height:520px) and (max-width:1000px){
#nexus-bc{padding:8px 6px calc(6px + env(safe-area-inset-bottom,0px));align-items:stretch}
#nexus-bc .nx-bc-box{max-height:none;height:100%;padding:10px}
#nexus-bc .nx-bc-cols{grid-template-columns:1fr}
#nexus-bc .nx-bc-box.det .nx-bc-left{display:none}
#nexus-bc .nx-bc-box:not(.det) .nx-bc-right{display:none}
#nexus-bc .nx-bc-back{display:inline-flex}
#nexus-bc .btn,#nexus-bc .chip,#nexus-bc select{min-height:40px}
#nexus-bc .field{min-height:42px;font-size:16px}
#nexus-bc .nx-bc-row{min-height:46px}
#nexus-bc .nx-bc-mv{grid-template-columns:1fr}
#nexus-bc .nx-bc-hd{grid-template-columns:auto 1fr}
#nexus-bc .nx-bc-sc{grid-column:1 / -1;flex-direction:row;justify-content:flex-start;gap:8px}
#nexus-bc .nx-bc-bar{grid-template-columns:96px 1fr 36px}
#nexus-bc .nx-bc-fil select{flex:1 1 30%}}
@media (max-height:520px){
#nexus-bc .nx-bc-box{gap:6px;padding:8px 10px}
#nexus-bc .nx-bc-left{display:grid;grid-template-columns:minmax(150px,1fr) minmax(0,1.7fr);grid-template-rows:auto auto minmax(0,1fr);grid-template-areas:"q f" "o n" "l l";gap:6px 8px}
#nexus-bc .nx-bc-left>.nx-bc-q{grid-area:q}
#nexus-bc .nx-bc-left>.nx-bc-fil{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none;min-width:0}
#nexus-bc .nx-bc-left>.nx-bc-fil::-webkit-scrollbar{display:none}
#nexus-bc .nx-bc-left>.nx-bc-fil>*{flex:none}
#nexus-bc .nx-bc-left>.nx-bc-fil:nth-child(2){grid-area:f}
#nexus-bc .nx-bc-left>.nx-bc-fil:nth-child(3){grid-area:o}
#nexus-bc .nx-bc-left>.nx-bc-n{grid-area:n;align-self:center;text-align:right}
#nexus-bc .nx-bc-left>.nx-bc-list{grid-area:l;min-height:0}
#nexus-bc .nx-bc-fil select{flex:none;max-width:170px}
#nexus-bc .nx-bc-foot{display:none}}
@media (pointer:coarse){#nexus-bc .btn,#nexus-bc .chip,#nexus-bc select,#nexus-bc .field{min-height:44px}}
#nexus-bc .nx-bc-cnt{font-size:13px}
#nexus-bc .nx-bc-row .stb{font-size:12px}
#nexus-bc .nx-bc-foot{font-size:12px}`);

  // ---- datos
  const owns = (dex) => {
    const N = ns();
    try { if (N.DB && typeof N.DB.owns === 'function') return !!N.DB.owns(dex); } catch (_) { /* respaldo */ }
    const s = N.DB && N.DB.save;
    return !!(s && s.owned && s.owned[dex]);
  };
  const genName = (g) => { const N = ns(); return NX.gd.tr(((N.MenuUI && N.MenuUI.GEN_NAMES) || [])[g - 1] || 'Región ' + g); };
  const tierBadge = (t, title) => `<span class="nx-tier" style="--tc:${NX.buildModel.tierColor(t)}"${title ? ` title="${esc(title)}"` : ''}>${esc(t)}</span>`;
  const runsOf = (dex) => {
    let all = [];
    try { all = NX.telemetry ? NX.telemetry.history() : (NX.store.get('tele:runs', []) || []); } catch (_) { all = []; }
    return all.filter((r) => r && +r.dex === +dex);
  };

  function filtered() {
    const N = ns(), G = NX.gd, BM = NX.buildModel;
    const tiers = G.tiers();
    const q = fold(st.q.trim());
    const qn = parseInt(q, 10);
    const rows = BM.all().filter((r) => {
      const p = N.DEX_BY[r.dex];
      if (!p) return false;
      if (st.type && !p.types.includes(st.type)) return false;
      if (st.gen && String(p.gen) !== String(st.gen)) return false;
      if (st.tier && r.tier !== st.tier) return false;
      if (st.own && !owns(r.dex)) return false;
      if (q) {
        if (Number.isFinite(qn) && String(qn) === q) return r.dex === qn || pad(r.dex).includes(q);
        if (!fold(G.monName(r.dex)).includes(q) && !fold(p.name).includes(q)) return false;
      }
      return true;
    });
    if (st.sort === 'st' && tiers) rows.sort((a, b) => ((tiers.byDex.get(a.dex) || {}).rank || 1e9) - ((tiers.byDex.get(b.dex) || {}).rank || 1e9));
    else if (st.sort === 'dex') rows.sort((a, b) => a.dex - b.dex);
    else rows.sort((a, b) => a.rank - b.rank);
    return rows;
  }

  // ---- pantalla
  let scr = null, listT = 0;
  function build() {
    if (scr) return scr;
    scr = document.createElement('section');
    scr.id = 'nexus-bc';
    scr.className = 'scr dim hidden';
    scr.innerHTML = '<div class="box nx-bc-box"></div>';
    scr.addEventListener('keydown', (e) => { if (e.key !== 'Escape') e.stopPropagation(); });
    scr.addEventListener('click', (e) => { if (e.target === scr) close(); });
    document.body.appendChild(scr);
    return scr;
  }
  function shell() {
    const N = ns(), G = NX.gd;
    const box = scr.querySelector('.nx-bc-box');
    const types = (N.U && N.U.TYPE_NAME) || {};
    const gens = [...new Set(N.DEX.map((p) => p.gen))].filter(Boolean).sort((a, b) => a - b);
    const tiers = G.tiers();
    const opt = (v, t, cur) => `<option value="${esc(v)}"${String(cur) === String(v) ? ' selected' : ''}>${esc(t)}</option>`;
    box.innerHTML = `<div class="nx-bc-head"><h2>Centro de builds</h2><button type="button" class="btn small ghost" data-x>Cerrar</button></div>
      <div class="nx-bc-cols">
        <div class="nx-bc-left">
          <input class="field nx-bc-q" type="search" placeholder="Buscar por nombre o número" value="${esc(st.q)}" autocomplete="off">
          <div class="nx-bc-fil">
            <select data-f="type" aria-label="Tipo">${opt('', 'Todos los tipos', st.type)}${Object.keys(types).map((t) => opt(t, G.typeName(t), st.type)).join('')}</select>
            <select data-f="gen" aria-label="Región">${opt('', 'Todas las regiones', st.gen)}${gens.map((g) => opt(g, genName(g), st.gen)).join('')}</select>
            <select data-f="tier" aria-label="Tier">${opt('', 'Todos los tiers', st.tier)}${['S', 'A', 'B', 'C', 'D'].map((t) => opt(t, 'Tier ' + t, st.tier)).join('')}</select>
            <button type="button" class="chip${st.own ? ' on' : ''}" data-f="own">Poseídos</button>
          </div>
          <div class="nx-bc-fil"><span class="nx-bc-cnt">Orden:</span>
            <button type="button" class="chip${st.sort === 'nexus' ? ' on' : ''}" data-s="nexus">Puesto Nexus</button>
            ${tiers ? `<button type="button" class="chip${st.sort === 'st' ? ' on' : ''}" data-s="st">SurvivorTiers</button>` : ''}
            <button type="button" class="chip${st.sort === 'dex' ? ' on' : ''}" data-s="dex">Nº</button>
          </div>
          <div class="nx-bc-cnt nx-bc-n"></div>
          <div class="nx-bc-list" role="list"></div>
        </div>
        <div class="nx-bc-right"></div>
      </div>
      <p class="nx-bc-foot"></p>`;
    box.querySelector('[data-x]').addEventListener('click', close);
    const q = box.querySelector('.nx-bc-q');
    q.addEventListener('input', () => { st.q = q.value; clearTimeout(listT); listT = setTimeout(renderList, 120); });
    box.querySelectorAll('select[data-f]').forEach((s) => s.addEventListener('change', () => { st[s.dataset.f] = s.value; save(); renderList(); }));
    box.querySelector('[data-f="own"]').addEventListener('click', (e) => { st.own = !st.own; e.currentTarget.classList.toggle('on', st.own); save(); renderList(); });
    box.querySelectorAll('[data-s]').forEach((b) => b.addEventListener('click', () => {
      st.sort = b.dataset.s; save();
      box.querySelectorAll('[data-s]').forEach((x) => x.classList.toggle('on', x === b));
      renderList();
    }));
    box.querySelector('.nx-bc-list').addEventListener('click', (e) => {
      const r = e.target.closest('.nx-bc-row');
      if (r) select(+r.dataset.dex);
    });
    const info = NX.buildModel.info();
    const foot = box.querySelector('.nx-bc-foot');
    foot.textContent = `Build Nexus: estimación con los datos del juego · ${info ? `${info.total} Pokémon${info.fromCache ? ' · guardado en este navegador' : info.ms ? ` · calculado en ${num(info.ms.busy / 1000, 1)} s` : ''}` : ''} · Alt+N › Datos para el método`;
  }

  function renderList() {
    if (!scr) return;
    const G = NX.gd, N = ns();
    const tiers = G.tiers();
    const rows = filtered();
    const list = scr.querySelector('.nx-bc-list');
    scr.querySelector('.nx-bc-n').textContent = `${rows.length} de ${NX.buildModel.all().length} Pokémon`;
    if (!rows.length) { list.innerHTML = '<div class="nx-bc-empty">Ningún Pokémon coincide con los filtros.</div>'; return; }
    list.innerHTML = rows.map((r) => {
      const p = N.DEX_BY[r.dex];
      const t = tiers && tiers.byDex.get(r.dex);
      return `<button type="button" role="listitem" class="nx-bc-row${r.dex === st.sel ? ' on' : ''}" data-dex="${r.dex}">
        <span class="rk">${st.sort === 'dex' ? pad(r.dex) : '#' + r.rank}</span>${tierBadge(r.tier, 'Tier Nexus ' + r.tier)}
        <span class="nm">${esc(G.monName(r.dex))}<small>${p.types.map(G.typeChip).join('')}</small></span>
        <span class="stb">${t ? `ST ${G.tierBadge(t)}` : ''}</span><b class="sc">${r.score}</b></button>`;
    }).join('');
    const on = list.querySelector('.nx-bc-row.on');
    if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest' });
  }

  function select(dex) {
    st.sel = dex; save();
    scr.querySelectorAll('.nx-bc-row').forEach((r) => r.classList.toggle('on', +r.dataset.dex === dex));
    scr.querySelector('.nx-bc-box').classList.add('det');
    renderDetail();
  }

  function barRow(label, pct, title) {
    return `<div class="nx-bc-bar" title="${esc(title)}"><span>${esc(label)}</span><div class="tr"><i style="width:${NX.clamp(pct, 2, 100)}%"></i></div><b>${pct}</b></div>`;
  }
  const moveChip = (G, id, hit) => { const d = G.moveDef(id); return `<span class="${hit ? 'hit' : ''}" style="background:${esc(G.typeColor(d && d.type))}" title="${esc(d ? G.tr(d.desc) : id)}">${esc(G.moveName(id))}</span>`; };

  function nexusSec(G, r, x) {
    // Como la guía de SurvivorTiers: la mejor build, o la mejor a distancia o cuerpo a cuerpo.
    const styleChips = [['', 'Mejor'], ['ranged', 'A distancia'], ['melee', 'Cuerpo a cuerpo']]
      .map(([k, t]) => `<button type="button" class="chip${(st.style || '') === k ? ' on' : ''}" data-style="${k}">${t}</button>`).join('');
    if (!x) return `<section class="panel nx-bc-sec"><h4><span>Build Nexus</span><span>${styleChips}</span></h4><p class="nx-bc-p">${st.style === 'melee' ? 'Este Pokémon no tiene una build cuerpo a cuerpo posible.' : 'No se pudo calcular.'}</p></section>`;
    const mv = x.moves.map((m) => `<div class="nx-bc-mv"><span class="mn" style="background:${esc(G.typeColor(m.type))}">${esc(m.name)}${m.tm ? ' <i>MT</i>' : ''}${m.evoName ? `<i>evoluciona con ${esc(m.evoName)}</i>` : ''}</span><small>${esc(m.why)}</small></div>`).join('');
    const start = x.start ? (x.startIn ? `Empieza con <b>${esc(x.startName)}</b>, que ya está en la build.` : `Su movimiento inicial es <b>${esc(x.startName)}</b>: con la mejora de inicio del Pokémon puedes empezar con uno de la build.`) : '';
    const evo = x.evoNeeds.length ? `Para evolucionar los movimientos, toma ${esc(x.evoNeeds.join(', '))} cuando estén al nivel máximo.` : '';
    const tmNote = st.tm ? (x.usedTM ? 'Incluye MT que este Pokémon puede aprender.' : 'Con sus MT la mejor build no cambia.') : '';
    return `<section class="panel nx-bc-sec"><h4><span>Build Nexus ${tierBadge(r.tier)} <small class="nx-bc-cnt">puntuación ${r.score} · puesto ${r.rank}</small></span>
        <span>${styleChips}<button type="button" class="chip${st.tm ? ' on' : ''}" data-tm title="Permitir MT en la build">Con MT</button></span></h4>
      ${mv}
      <div class="nx-bc-bars">${barRow('Daño en grupo', r.pct.crowd, 'Percentil frente a todos los Pokémon')}${barRow('Daño a jefes', r.pct.boss, 'Percentil frente a todos los Pokémon')}${barRow('Aguante', r.pct.surv, 'Percentil frente a todos los Pokémon')}</div>
      <p class="nx-bc-p">Al final de la partida: reducción de daño ${Math.round(x.late.red * 100)} %, control ${Math.round(x.late.ctrl * 100)} %, invulnerable ${Math.round(x.late.dodge * 100)} % del tiempo, regeneración ${num(x.late.regen, 1)} PS/s.</p>
      ${[start, evo, tmNote].filter(Boolean).map((t) => `<p class="nx-bc-p">${t}</p>`).join('')}</section>`;
  }
  function tiersSec(G, dex, nexusMoves) {
    const t = G.tiers();
    if (!t) return '<section class="panel nx-bc-sec"><h4>Build SurvivorTiers</h4><p class="nx-bc-p">Sin datos de SurvivorTiers en este modo. Llegan con la edición o con Permitir scripts de usuario.</p></section>';
    const r = t.byDex.get(+dex);
    if (!r) return `<section class="panel nx-bc-sec"><h4>Build SurvivorTiers</h4><p class="nx-bc-p">SurvivorTiers no tiene a este Pokémon.</p><p class="nx-bc-p">${G.tierMetaHtml()}</p></section>`;
    const common = (r.moves || []).filter((m) => nexusMoves.includes(m)).length;
    const other = r.otherStyle && r.otherScore ? ` · ${esc(G.styleName(r.otherStyle))}: ${num(r.otherScore, 1)} s` : '';
    return `<section class="panel nx-bc-sec"><h4><span>Build SurvivorTiers ${G.tierBadge(r)} <small class="nx-bc-cnt">puesto ${r.rank} de ${t.total}</small></span></h4>
      <p class="nx-bc-p">Estilo <b>${esc(G.styleName(r.style))}</b> · mediana de supervivencia ${num(r.score, 1)} s${other}</p>
      <div class="nx-bc-chips">${(r.moves || []).map((id) => moveChip(G, id, nexusMoves.includes(id))).join('')}</div>
      <p class="nx-bc-p">En común con la Build Nexus: <b>${common} de ${(r.moves || []).length}</b> (marcados).</p>
      <p class="nx-bc-p">${G.tierMetaHtml()}</p></section>`;
  }
  function mineSec(G, dex, nexusMoves) {
    const runs = runsOf(dex);
    if (!runs.length) return '<section class="panel nx-bc-sec"><h4>Tu mejor build</h4><p class="nx-bc-p">Aún no tienes partidas guardadas con este Pokémon. El historial guarda las últimas 50.</p></section>';
    const best = runs.slice().sort((a, b) => (b.time || 0) - (a.time || 0) || (b.dps || 0) - (a.dps || 0))[0];
    let pr = null;
    try { pr = (NX.personalRank ? NX.personalRank() : []).find((x) => +x.dex === +dex) || null; } catch (_) { pr = null; }
    const nexusNames = new Set(nexusMoves.map((id) => fold(G.moveName(id))));
    const names = (best.moves || []).map((m) => {
      const nm = G.T(String(m.name || '').replace(/\s*\+$/, ''), 'move');
      const hit = nexusNames.has(fold(nm));
      return `<span class="${hit ? 'hit' : ''}" style="background:#3d67c0">${esc(String(m.name || '').endsWith('+') ? nm + ' +' : nm)}</span>`;
    }).join('');
    const d = new Date(best.at || Date.now());
    return `<section class="panel nx-bc-sec"><h4><span>Tu mejor build${pr ? ` ${tierBadge(pr.tier, 'Tu ranking personal')}` : ''}</span></h4>
      <p class="nx-bc-p">Mejor partida: <b>${NX.fmtTime(best.time)}</b> · Nv. ${best.level || 0} · ${num(best.dps)} de daño por segundo · ${num(best.kills)} bajas · ${esc(d.toLocaleDateString('es-VE'))}</p>
      ${names ? `<div class="nx-bc-chips">${names}</div><p class="nx-bc-p">Movimientos que más daño hicieron (marcados los de la Build Nexus).</p>` : ''}
      ${pr ? `<p class="nx-bc-p">${pr.runs} partida${pr.runs === 1 ? '' : 's'} con este Pokémon · mediana ${NX.fmtTime(pr.medTime)} · tu puntuación ${pr.score}.</p>` : `<p class="nx-bc-p">${runs.length} partida${runs.length === 1 ? '' : 's'} guardada${runs.length === 1 ? '' : 's'}; las de menos de 30 s no cuentan para tu ranking.</p>`}</section>`;
  }

  // Laboratorio de builds (lo aporta otro módulo; el botón solo sale si existe).
  function labApi() {
    const L = NX.buildlab;
    if (!L) return null;
    if (typeof L.open === 'function') return (cfg) => L.open(cfg);
    if (typeof L.load === 'function') return (cfg) => L.load(cfg);
    if (typeof L === 'function') return (cfg) => L(cfg);
    return null;
  }

  function renderDetail() {
    if (!scr) return;
    const right = scr.querySelector('.nx-bc-right');
    const dex = st.sel, r = NX.buildModel.get(dex);
    const N = ns(), G = NX.gd, p = N.DEX_BY[dex];
    if (!r || !p) { right.innerHTML = '<div class="nx-bc-empty">Elige un Pokémon de la lista para ver su mejor build.</div>'; return; }
    let chips = '';
    try { chips = N.UI.typeChips(p.types); } catch (_) { chips = p.types.map(G.typeChip).join(''); }
    let x = null;
    try { x = NX.buildModel.explain(dex, { tm: st.tm, style: st.style || undefined }); } catch (err) { NX.trip(KEY, err); }
    const nexusMoves = x ? x.moves.map((m) => m.id) : r.moves;
    const lab = labApi();
    right.innerHTML = `<button type="button" class="btn small ghost nx-bc-back" data-back>‹ Volver a la lista</button>
      <div class="nx-bc-hd"><div class="nx-bc-spr"></div>
        <div><p class="sub">Nº ${pad(dex)} · ${esc(genName(p.gen))}${owns(dex) ? '' : ' · no lo tienes'}</p><h3>${esc(G.monName(dex))}</h3><div>${chips}</div></div>
        <div class="nx-bc-sc">${tierBadge(r.tier, 'Tier Nexus').replace('nx-tier', 'nx-tier big')}<b>${r.score}</b><small>puesto ${r.rank} de ${NX.buildModel.all().length}</small></div></div>
      ${nexusSec(G, r, x)}${tiersSec(G, dex, nexusMoves)}${mineSec(G, dex, nexusMoves)}
      ${lab ? '<div class="nx-bc-act"><button type="button" class="btn gold" data-lab>Probar en laboratorio</button></div>' : ''}`;
    right.scrollTop = 0;
    const spr = right.querySelector('.nx-bc-spr');
    try { spr.appendChild(N.UI.spriteCanvas(dex, 96, 84, { lively: true, scale: 2 })); } catch (_) { /* sin sprite */ }
    right.querySelector('[data-back]').addEventListener('click', () => scr.querySelector('.nx-bc-box').classList.remove('det'));
    const tm = right.querySelector('[data-tm]');
    if (tm) tm.addEventListener('click', () => { st.tm = !st.tm; save(); renderDetail(); });
    right.querySelectorAll('[data-style]').forEach((b) => b.addEventListener('click', () => { st.style = b.dataset.style; save(); renderDetail(); }));
    const lb = right.querySelector('[data-lab]');
    if (lb) lb.addEventListener('click', () => {
      const fn = labApi();
      if (!fn) return;
      const M = N.Moves;
      const moves = nexusMoves.map((id) => ({ id, lvl: (M.BY_ID[id] && M.BY_ID[id].maxLvl) || 5 }));
      close();
      try { fn({ dex, moves, source: 'build-center' }); } catch (err) { NX.toast('No se pudo abrir el laboratorio: ' + err.message); }
    });
  }

  function open(dex) {
    if (!NX.isOn(KEY) || !NX.ns) return;
    build();
    const box = scr.querySelector('.nx-bc-box');
    if (dex) st.sel = +dex;
    scr.classList.remove('hidden');
    document.documentElement.classList.add('nx-bc-open');
    const BM = NX.buildModel;
    if (BM.status() !== 'ready') box.innerHTML = '<div class="nx-bc-head"><h2>Centro de builds</h2><button type="button" class="btn small ghost" data-x>Cerrar</button></div><div class="nx-bc-empty">Calculando la mejor build de cada Pokémon…</div>';
    const x = box.querySelector('[data-x]');
    if (x) x.addEventListener('click', close);
    BM.ready().then(() => {
      if (!scr || scr.classList.contains('hidden')) return;
      shell();
      renderList();
      if (!st.sel || !BM.get(st.sel)) st.sel = (BM.all()[0] || {}).dex || 0;
      renderDetail();
      if (!dex) scr.querySelector('.nx-bc-box').classList.remove('det');
      else scr.querySelector('.nx-bc-box').classList.add('det');
    }).catch((err) => {
      box.innerHTML = `<div class="nx-bc-head"><h2>Centro de builds</h2><button type="button" class="btn small ghost" data-x>Cerrar</button></div><div class="nx-bc-empty">No se pudo calcular: ${esc(err.message || err)}</div>`;
      box.querySelector('[data-x]').addEventListener('click', close);
      NX.trip(KEY, err);
    });
  }
  function close() { if (scr) scr.classList.add('hidden'); document.documentElement.classList.remove('nx-bc-open'); }
  const isOpen = () => !!scr && !scr.classList.contains('hidden');

  // ---- botones de entrada
  function icon() {
    try { const h = ns().Icons.html('fist', 18); if (h) return h; } catch (_) { /* respaldo */ }
    return '★';
  }
  function placeMenu() {
    let b = $('nexus-bc-btn');
    const anchor = document.querySelector('#scr-menu [data-go="dex"]');
    if (!NX.isOn(KEY)) { if (b) b.remove(); return; }
    if (!anchor) return;
    if (!b) {
      b = document.createElement('button');
      b.type = 'button';
      b.id = 'nexus-bc-btn';
      b.className = 'menu-item';
      b.dataset.sfx = 'confirm';
      b.innerHTML = `<span class="mi-ico" aria-hidden="true">${icon()}</span><span>Builds</span><small>La mejor build de cada Pokémon</small>`;
      b.addEventListener('click', (e) => { e.stopPropagation(); b.blur(); open(); });
    }
    if (anchor.nextElementSibling !== b) anchor.after(b);
  }
  function decorateDex() {
    const det = $('dex-detail');
    if (!det) return;
    let btn = det.querySelector('.nx-bc-dexbtn');
    const m = /(?:Nº|N°|No\.?|#)\s*(\d{1,4})/i.exec(det.textContent || '');
    const dex = m ? +m[1] : 0;
    const want = NX.isOn(KEY) && NX.store.get('bc:dexBtn', true) && dex && ns().DEX_BY[dex];
    if (!want) { if (btn) btn.remove(); return; }
    if (btn && +btn.dataset.dex === dex) return;
    if (!btn) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn small nx-bc-dexbtn';
      btn.textContent = 'Ver build';
      btn.addEventListener('click', (e) => { e.stopPropagation(); open(+btn.dataset.dex); });
      det.appendChild(btn);
    }
    btn.dataset.dex = dex;
  }

  NX.feature({
    key: KEY,
    label: 'Centro de builds',
    needs: (n) => n.DEX && n.DEX_BY && n.Moves && typeof n.Moves.instance === 'function' && typeof n.Moves.evolve === 'function' &&
      typeof n.Moves.poolFor === 'function' && n.Types && typeof n.Types.mult === 'function' && n.Stats && typeof n.Stats.taken === 'function' &&
      n.Enemies && Array.isArray(n.Enemies.TIERS) && n.Game && NX.buildModel && NX.gd && !!$('scr-menu'),
    setup(n) {
      build();
      placeMenu();
      setInterval(() => {
        try {
          placeMenu();
          if (isOpen() && (n.Game.state !== 'ui' || !NX.isOn(KEY))) close();
        } catch (err) { NX.trip(KEY, err); }
      }, 500);
      const det = $('dex-detail');
      if (det) new MutationObserver(() => { try { decorateDex(); } catch (err) { NX.trip(KEY, err); } }).observe(det, { childList: true });
      // Si ya hay un cálculo guardado para esta versión, se carga sin esperar.
      if (NX.store.get('bc:cache', null)) NX.buildModel.ready().catch(() => { /* se reintenta al abrir */ });
      NX.gd.loadGameDate();
    },
  });
  NX.keys.bind((e) => e.key === 'Escape' && isOpen(), () => { close(); return true; });

  NX.buildCenter = { open, close, isOpen };

  NX.settings.section({
    key: KEY,
    tab: 'Datos',
    title: 'Centro de builds',
    keywords: 'build builds mejor movimientos ranking tier modelo nexus survivortiers laboratorio',
    render(el) {
      el.appendChild(NX.ui.toggle('Activado', 'on:' + KEY, true, () => { placeMenu(); decorateDex(); }));
      el.appendChild(NX.ui.toggle('Botón "Ver build" en la ficha de la Pokédex', 'bc:dexBtn', true, () => decorateDex()));
      el.appendChild(NX.ui.note(NX.buildModel ? NX.buildModel.METHOD : ''));
      const info = NX.buildModel && NX.buildModel.info();
      const p = NX.ui.note(info ? `Último cálculo: ${info.total} Pokémon${info.ms ? ` en ${num(info.ms.busy / 1000, 1)} s` : ''}${info.fromCache ? ' (guardado en este navegador)' : ''}. Se recalcula solo cuando cambia la versión del juego.` : 'Se calcula al abrir el centro por primera vez y se guarda para la versión actual del juego.');
      el.appendChild(p);
      el.appendChild(NX.ui.button('Abrir centro de builds', () => { if (NX.ns && NX.ns.Game && NX.ns.Game.state === 'ui') { NX.togglePanel(); open(); } else NX.toast('Abre el centro desde el menú principal'); }));
      el.appendChild(NX.ui.button('Recalcular', () => {
        p.textContent = 'Calculando…';
        NX.buildModel.recompute().then((r) => { p.textContent = `Listo: ${r.total} Pokémon en ${num(r.ms.busy / 1000, 1)} s.`; }).catch((err) => { p.textContent = 'Error: ' + err.message; });
      }));
    },
  });
})();
