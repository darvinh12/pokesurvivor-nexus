// Lecturas compartidas de datos del juego para los módulos de datos
// (tooltips, tiers, build recomendada, evoluciones y enciclopedia). No es un
// módulo con interruptor: solo expone NX.gd. Todo se lee de forma perezosa
// desde NX.ns, así que puede cargarse en cualquier orden.
// Partes adaptadas de PokeSurvivor Plus (MIT): filas de stats de movimientos,
// tooltips de objeto y clima, y el enganche a las cartas de subida de nivel.
(() => {
  const G = (NX.gd = {});
  const esc = (s) => NX.esc(s == null ? '' : s);
  G.esc = esc;
  const ns = () => NX.ns || {};

  // ---- textos localizados (el juego guarda sus nombres en español y los
  // traduce con I18n según el idioma elegido)
  G.tr = (s) => { try { const I = ns().I18n; return I && I.t ? I.t(s) : s; } catch (_) { return s; } };
  G.T = (s, cat) => { try { return typeof ns().T === 'function' ? ns().T(s, cat) : G.tr(s); } catch (_) { return s; } };
  G.cap = (s) => String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1);
  G.typeName = (t) => { const N = (ns().U && ns().U.TYPE_NAME) || {}; return G.tr(N[t] || G.cap(t)); };
  G.typeColor = (t) => ((ns().U && ns().U.TYPE_COLOR) || {})[t] || '#8fa3c4';
  G.typeChip = (t) => `<span class="nx-tchip" style="background:${esc(G.typeColor(t))}">${esc(G.typeName(t))}</span>`;
  G.moveDef = (id) => { const M = ns().Moves; return (M && M.BY_ID && M.BY_ID[id]) || null; };
  G.moveName = (id) => { const d = G.moveDef(id); return d ? G.T(d.name, 'move') : String(id); };
  G.itemDef = (id) => { const I = ns().Items; return (I && I.BY && I.BY[id]) || null; };
  G.itemName = (id) => { const d = G.itemDef(id); return d ? G.tr(d.name) : String(id); };
  G.monName = (dex) => {
    const p = ns().DEX_BY && ns().DEX_BY[dex];
    return p ? G.tr(p.name) : '#' + dex;
  };
  G.catName = (m) => {
    const N = (ns().Stats && ns().Stats.NAME) || {};
    const c = m.cat || (m.stat === 'patk' ? 'physical' : m.stat === 'satk' ? 'special' : '');
    return c && N[c] ? G.tr(N[c]) : '';
  };
  const KIND = {
    projectile: 'Proyectil', melee: 'Cuerpo a cuerpo', beam: 'Rayo', orbit: 'Órbita', nova: 'Onda', aura: 'Aura', buff: 'Mejora',
    boomerang: 'Bumerán', chain: 'Cadena', mine: 'Minas', meteor: 'Meteoro', turret: 'Torreta', dash: 'Embestida', trail: 'Rastro',
    cone: 'Cono', charge: 'Carga', spin: 'Giro', vortex: 'Vórtice', bounce: 'Rebote', homing: 'Teledirigido', stun: 'Aturdir',
    shove: 'Empujón', quake: 'Temblor',
  };
  G.kindName = (k) => KIND[k] || G.cap(k);
  const num = (v, d = 0) => (+v).toLocaleString('es-VE', { maximumFractionDigits: d, minimumFractionDigits: 0 });
  G.num = num;

  // ---- números de un movimiento (adaptado de moveRows de PokeSurvivor Plus)
  // Los físicos pegan con Ataque y los especiales con At. Esp.
  G.atkOf = (pl, m) => {
    if (!pl) return 1;
    try { if (typeof pl.atkFor === 'function') return +pl.atkFor(m) || 1; } catch (_) { /* respaldo */ }
    if (typeof pl.atk === 'number') return pl.atk || 1;
    return (pl.baseAtk || 1) * (pl.atkMul || 1);
  };
  G.moveRows = (m, pl) => {
    const atk = pl ? G.atkOf(pl, m) : 1, cdm = (pl && pl.cdMul) || 1;
    const rows = [];
    const row = (k, v) => rows.push([k, v]);
    if (m.kind === 'buff') {
      if (m.amount != null) row('Potencia', `+${Math.round(m.amount * 100)} %`);
      if (m.dur) row('Dura', `${num(m.dur, 1)} s`);
      if (m.stacks) row('Acumulaciones', m.stacks);
    } else if (m.dmg != null) {
      row('Daño', `${Math.round(m.dmg * atk)}${m.count > 1 ? ` × ${m.count}` : ''}`);
    }
    if (m.cd && m.kind !== 'orbit') row('Recarga', `${num(m.cd * cdm, 2)} s`);
    if (m.count > 1 && m.kind === 'orbit') row('Orbes', m.count);
    if (m.pierce > 0) row('Perforación', m.pierce);
    if (m.radius) row(m.kind === 'aura' || m.kind === 'orbit' ? 'Radio' : 'Alcance', Math.round(m.radius));
    if (m.dur && m.kind !== 'buff') row('Duración', `${num(m.dur, 1)} s`);
    if (m.burn) row('Efecto', 'Quema');
    if (m.poison) row('Efecto', 'Envenena');
    if (m.slow) row('Ralentiza', `${Math.round(m.slow * 100)} %`);
    if (m.homing) row('Teledirigido', 'Sí');
    if (m.knock) row('Empuje', Math.round(m.knock));
    return rows;
  };
  G.instance = (id, lvl = 1) => {
    const M = ns().Moves;
    if (M && typeof M.instance === 'function') return M.instance(id, lvl);
    const d = G.moveDef(id);
    return d ? Object.assign({ lvl, def: d }, d) : null;
  };

  // ---- evoluciones de movimientos. Un movimiento evoluciona cuando está en
  // su nivel máximo y ya tomaste la mejora de stat que pide (Moves.EVO).
  G.statTitle = (sid) => {
    const S = (ns().LevelUp && ns().LevelUp.STATS) || [];
    const s = S.find((x) => x.id === sid);
    const N = (ns().Moves && ns().Moves.NEED_NAME) || {};
    return G.tr((s && s.title) || N[sid] || sid);
  };
  G.evo = (id, pl) => {
    const M = ns().Moves, d = G.moveDef(id);
    if (!M || !M.EVO || !d) return null;
    const need = M.EVO[id];
    if (!need) return null;
    const max = d.maxLvl || 5;
    let info = null;
    try {
      const fake = Object.assign(G.instance(id, max), { evolved: false });
      info = typeof M.evoInfo === 'function' ? M.evoInfo(fake, (pl && pl.statsTaken) || {}) : null;
    } catch (_) { info = null; }
    if (!info) return null;
    const have = !!(pl && pl.statsTaken && pl.statsTaken[need] > 0);
    return { need, needName: G.statTitle(need), name: G.T(info.name, 'move'), text: G.tr(info.text || ''), max, have };
  };
  // Copia evolucionada de un movimiento, sin tocar el original.
  G.evolvedCopy = (m) => {
    const M = ns().Moves;
    if (!M || typeof M.evolve !== 'function' || !m || m.evolved) return null;
    try { const c = Object.assign({}, m); return M.evolve(c) ? c : null; } catch (_) { return null; }
  };

  // ---- efectividad de tipos con los multiplicadores reales del juego
  G.TYPES = () => Object.keys((ns().U && ns().U.TYPE_NAME) || (ns().Types && ns().Types.CHART) || {});
  G.mult = (atk, defTypes) => {
    const T = ns().Types;
    try { return T && typeof T.mult === 'function' ? T.mult(atk, defTypes) : 1; } catch (_) { return 1; }
  };
  // Ataque de un tipo contra cada tipo: grupos por multiplicador.
  G.offense = (type) => groupBy(G.TYPES().map((t) => [t, G.mult(type, [t])]));
  // Defensa de un Pokémon: cada tipo atacante contra sus tipos.
  G.defense = (types) => groupBy(G.TYPES().map((t) => [t, G.mult(t, types || [])]));
  function groupBy(pairs) {
    const by = new Map();
    for (const [t, v] of pairs) {
      if (Math.abs(v - 1) < 0.01) continue;
      const k = Math.round(v * 100) / 100;
      if (!by.has(k)) by.set(k, []);
      by.get(k).push(t);
    }
    return [...by.entries()].sort((a, b) => b[0] - a[0]);
  }
  G.effHtml = (groups, label) => {
    if (!groups.length) return '';
    return groups.map(([v, ts]) => `<div class="nx-eff"><b class="${v > 1 ? 'up' : 'dn'}">×${num(v, 2)}</b>${label ? `<small>${esc(label(v))}</small>` : ''}<span>${ts.map(G.typeChip).join('')}</span></div>`).join('');
  };

  // ---- tarjetas HTML para tooltips y la enciclopedia
  G.rowsHtml = (rows) => rows.map(([k, v]) => `<div class="kv"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('');
  G.moveTip = (m, pl, opts = {}) => {
    const col = G.typeColor(m.type);
    const max = (m.def && m.def.maxLvl) || m.maxLvl || 5;
    const cat = G.catName(m);
    const desc = m.desc || (m.def && m.def.desc);
    let next = '';
    if (!opts.noNext) {
      try {
        const M = ns().Moves, nx = M && typeof M.nextUpText === 'function' && m.def && m.lvl ? M.nextUpText(m) : null;
        if (nx) next = `<div class="nx">Siguiente nivel: ${esc(G.tr(nx))}</div>`;
      } catch (_) { /* sin siguiente nivel */ }
    }
    let evo = '';
    if (!opts.noEvo && !m.evolved) {
      const e = G.evo(m.id, pl);
      if (e) {
        const left = Math.max(0, e.max - (m.lvl || 1));
        const miss = [left ? `${left} nivel${left > 1 ? 'es' : ''}` : '', e.have || !pl ? '' : e.needName].filter(Boolean);
        evo = `<div class="nx ev">Evoluciona a ${esc(e.name)} con ${esc(e.needName)} en Nv. ${e.max}${pl ? (miss.length ? ` · falta: ${esc(miss.join(' y '))}` : ' · lista') : ''}</div>`;
      }
    }
    const lv = opts.lvLabel != null ? opts.lvLabel : `Nv. ${m.lvl || 1}/${max}`;
    return `<div class="hd"><b style="color:${esc(col)}">${esc(G.T(m.name, 'move'))}${m.evolved ? ' ★' : ''}</b><span class="lv">${esc(lv)}</span></div>
      <div class="tags">${G.typeChip(m.type)}${cat ? `<span>${esc(cat)}</span>` : ''}<span>${esc(G.kindName(m.kind))}</span></div>
      ${desc ? `<div class="ds">${esc(G.tr(desc))}</div>` : ''}
      <div class="st">${G.rowsHtml(G.moveRows(m, pl))}</div>${next}${evo}${opts.extra || ''}`;
  };
  G.itemTip = (id) => {
    const d = G.itemDef(id);
    if (!d) return '';
    return `<div class="hd"><b style="color:#ffd23f">${esc(G.tr(d.name))}</b><span class="lv">Objeto</span></div>${d.desc ? `<div class="ds">${esc(G.tr(d.desc))}</div>` : ''}`;
  };
  G.weatherTip = (wx, pl) => {
    const rows = Object.entries(wx.mult || {}).map(([t, m]) => `<div class="kv"><span>${G.typeChip(t)} ataques</span><b style="color:${m >= 1 ? '#7dff9a' : '#ff8a96'}">×${num(m, 2)} daño</b></div>`);
    const mine = (pl && pl.mon && pl.mon.types) || [];
    const notes = [];
    if (wx.safe) notes.push(`Quien no sea ${wx.safe.map(G.typeName).join(', ')} pierde vida poco a poco${wx.slow ? ' y va más lento' : ''}.`);
    else if (wx.slow) notes.push('Todos se mueven un poco más lento.');
    notes.push('Afecta igual a ti, a tus aliados y a los enemigos.');
    let you = '';
    if (mine.length && wx.safe) {
      const hurt = !mine.some((t) => wx.safe.includes(t));
      you = hurt ? 'Tu Pokémon sufre este clima: cuida tu vida.' : 'Tu Pokémon está a salvo de este clima.';
    }
    return `<div class="hd"><b style="color:${esc(wx.color || '#fff')}">${esc(G.tr(wx.name))}</b><span class="lv">${Math.ceil(wx.left || 0)} s</span></div>
      <div class="st" style="margin-top:4px">${rows.join('')}</div>
      ${notes.map((n) => `<div class="ds" style="margin:4px 0 0">${esc(n)}</div>`).join('')}${you ? `<div class="nx">${esc(you)}</div>` : ''}`;
  };

  // Estilo común de tarjetas (tooltip flotante y fichas de la enciclopedia).
  NX.css(`.nx-card{font:12px/1.3 var(--font,'Pixelify',system-ui,sans-serif);color:#fff;text-shadow:1px 1px 0 #0a1430}
.nx-card .hd{display:flex;gap:10px;align-items:baseline;justify-content:space-between}
.nx-card .hd b{font-size:13px}
.nx-card .lv{color:#b9cbf0;font-size:11px;white-space:nowrap}
.nx-card .tags{display:flex;flex-wrap:wrap;gap:4px;margin:3px 0 4px}
.nx-card .tags span{font-size:10px;padding:0 6px;border-radius:8px;background:#0b1838;text-shadow:none}
.nx-card .ds{color:#dfe8fb;font-size:11px;margin-bottom:4px}
.nx-card .st{display:grid;gap:1px}
.nx-card .kv{display:flex;gap:12px;font-size:11px}
.nx-card .kv span{flex:1;color:#b9cbf0}
.nx-card .nx{margin-top:4px;color:#ffd23f;font-size:11px}
.nx-card .nx.ev{color:#9fe8ff}
.nx-card hr{border:0;border-top:1px solid rgba(255,255,255,.15);margin:6px 0}
.nx-tchip{display:inline-block;padding:0 6px;border-radius:7px;color:#fff;font-size:10px;text-shadow:1px 1px 0 #0a1430;margin:0 2px 2px 0}
.nx-eff{display:flex;align-items:baseline;gap:6px;font-size:11px;margin:2px 0}
.nx-eff b{min-width:38px}.nx-eff b.up{color:#7dff9a}.nx-eff b.dn{color:#ff8a96}.nx-eff small{color:#b9cbf0;min-width:70px}
#nexus-tip{position:fixed;z-index:100004;pointer-events:none;width:max-content;max-width:260px;padding:7px 9px 8px;
  background:linear-gradient(#2c519f,#1a3170);border:2px solid #f4f8ff;outline:2px solid #0b1838;border-radius:8px;box-shadow:inset 0 0 0 2px #5b83d6,0 4px 0 #0a1430}
#nexus-tip[hidden]{display:none}`);

  // Tooltip flotante compartido.
  let tipEl = null;
  G.tip = {
    show(html, x, y, below) {
      if (!tipEl) {
        tipEl = document.createElement('div');
        tipEl.id = 'nexus-tip';
        tipEl.className = 'nx-card';
        tipEl.hidden = true;
        document.body.appendChild(tipEl);
      }
      if (tipEl.dataset.k !== html) { tipEl.innerHTML = html; tipEl.dataset.k = html; }
      tipEl.hidden = false;
      const w = tipEl.offsetWidth, h = tipEl.offsetHeight;
      tipEl.style.left = NX.clamp(x - w / 2, 6, Math.max(6, innerWidth - w - 6)) + 'px';
      tipEl.style.top = NX.clamp(below ? y : y - h - 10, 6, Math.max(6, innerHeight - h - 6)) + 'px';
    },
    hide() { if (tipEl && !tipEl.hidden) tipEl.hidden = true; },
  };

  // ---- SurvivorTiers (lo inyecta el cascarón en NX.data.tiers)
  let tierCache = null;
  G.tiers = () => {
    const t = NX.data && NX.data.tiers;
    if (!t || !Array.isArray(t.rows) || !t.rows.length) return null;
    if (tierCache && tierCache.src === t) return tierCache;
    const byDex = new Map();
    for (const r of t.rows) if (r && r.dex) byDex.set(+r.dex, r);
    tierCache = { src: t, rows: t.rows, byDex, total: t.rows.length, patch: t.patch || '', patchDate: parseDate(t.patch), fetchedAt: t.fetchedAt || 0 };
    return tierCache;
  };
  G.tierOf = (dex) => { const t = G.tiers(); return (t && t.byDex.get(+dex)) || null; };
  G.TIER_COL = { S: '#ff5c5c', A: '#ff9f43', B: '#ffd93d', C: '#6bcb77', D: '#4d96ff', E: '#9aa6b5', F: '#9aa6b5' };
  G.styleName = (s) => (s === 'melee' ? 'cuerpo a cuerpo' : s === 'ranged' ? 'a distancia' : String(s || ''));
  G.TIER_SITE = 'https://survivortiers.pages.dev/';
  G.credit = () => `Datos: <a href="${G.TIER_SITE}" target="_blank" rel="noopener">SurvivorTiers</a> de @fildotai`;
  const MONTHS = { ene: 0, jan: 0, feb: 1, mar: 2, abr: 3, apr: 3, may: 4, jun: 5, jul: 6, ago: 7, aug: 7, sep: 8, set: 8, oct: 9, nov: 10, dic: 11, dec: 11 };
  function parseDate(s) {
    if (!s) return null;
    const m = /(\d{1,2})\s+(?:de\s+)?([a-záéíóú]{3})[a-záéíóú.]*\s+(?:de\s+)?(\d{4})/i.exec(String(s));
    if (m && MONTHS[m[2].toLowerCase().slice(0, 3)] !== undefined) return new Date(+m[3], MONTHS[m[2].toLowerCase().slice(0, 3)], +m[1]);
    const d = new Date(s);
    return isNaN(d) ? null : d;
  }
  G.fmtDate = (d) => (d ? d.toLocaleDateString('es-VE', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
  // Fecha de la última actualización del juego (version.json, mismo origen).
  let gameDateP = null;
  G.gameDate = null;
  G.loadGameDate = () => {
    if (!gameDateP) {
      gameDateP = fetch('/version.json', { cache: 'no-store' }).then((r) => r.json()).then((j) => {
        const d = j && j.at ? new Date(j.at) : null;
        G.gameDate = d && !isNaN(d) ? d : null;
        return G.gameDate;
      }).catch(() => null);
    }
    return gameDateP;
  };
  // true si el parche de SurvivorTiers es anterior a la última versión del juego.
  G.tierStale = () => {
    const t = G.tiers();
    if (!t || !G.gameDate) return false;
    const ref = t.patchDate || (t.fetchedAt ? new Date(t.fetchedAt) : null);
    if (!ref) return false;
    const day = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    return day(ref) < day(G.gameDate);
  };
  G.tierMetaHtml = () => {
    const t = G.tiers();
    if (!t) return '';
    const when = t.patch ? 'parche del ' + esc(t.patch) : t.fetchedAt ? 'descargado el ' + esc(G.fmtDate(new Date(t.fetchedAt))) : '';
    const stale = G.tierStale() ? ` <span class="nx-stale" title="El juego se actualizó el ${esc(G.fmtDate(G.gameDate))}">posiblemente desactualizado</span>` : '';
    return `${G.credit()}${when ? ' · ' + when : ''}${stale}`;
  };
  NX.css(`.nx-stale{display:inline-block;padding:0 6px;border-radius:7px;background:#d98a1f;color:#1b1528;font-size:10px;text-shadow:none}
.nx-tier{display:inline-grid;place-items:center;min-width:17px;height:17px;padding:0 3px;box-sizing:border-box;border-radius:5px;background:var(--tc);color:#1b1528;
  font:700 12px/1 var(--font,'Pixelify',system-ui,sans-serif);text-shadow:none;box-shadow:0 0 0 2px #0b1838;vertical-align:middle}`);
  G.tierBadge = (r, cls = '') => {
    const t = G.tiers();
    return `<span class="nx-tier ${cls}" style="--tc:${G.TIER_COL[r.tier] || '#9aa6b5'}" title="Tier ${esc(r.tier)} · puesto ${r.rank} de ${t ? t.total : '?'} en SurvivorTiers">${esc(r.tier)}</span>`;
  };

  // ---- cartas de subida de nivel. Un solo enganche a LevelUp.offer y
  // RunUI.showLevelUp guarda las ofertas; cada módulo registra una función
  // que decora las cartas (debe poder repetirse sin duplicar nada).
  const decos = [];
  let offers = [], hooked = false, pend = 0;
  G.lvl = {
    offers: () => offers,
    on(key, fn) { decos.push({ key, fn }); G.lvl.hook(); },
    refresh() { schedule(); },
    hook() {
      if (hooked) return;
      const N = ns();
      if (!N.LevelUp || typeof N.LevelUp.offer !== 'function' || !N.RunUI || typeof N.RunUI.showLevelUp !== 'function') throw new Error('Faltan LevelUp.offer o RunUI.showLevelUp');
      hooked = true;
      const offer = N.LevelUp.offer, showLv = N.RunUI.showLevelUp;
      N.LevelUp.offer = function () {
        const r = offer.apply(this, arguments);
        if (Array.isArray(r)) { offers = r; schedule(); }
        return r;
      };
      N.RunUI.showLevelUp = function (level, list) {
        if (Array.isArray(list)) offers = list;
        const r = showLv.apply(this, arguments);
        decorate();
        return r;
      };
      NX.onReady(() => {
        const box = document.getElementById('cards');
        if (box) new MutationObserver(schedule).observe(box, { childList: true });
      });
    },
  };
  function schedule() {
    if (pend) return;
    pend = setTimeout(() => { pend = 0; decorate(); }, 0);
  }
  function decorate() {
    const box = document.getElementById('cards');
    if (!box) return;
    const cards = box.querySelectorAll(':scope > .card');
    if (!cards.length || cards.length !== offers.length) return;
    const pl = NX.me();
    cards.forEach((el, i) => {
      const o = offers[i];
      if (!o) return;
      // Seguridad: la carta debe mostrar el título de su oferta.
      const nm = el.querySelector('.nm');
      const title = String(o.title || '').split(' ')[0];
      if (nm && title && !nm.textContent.includes(title)) return;
      const [type, id] = String(o.key || '').split(':');
      for (const d of decos) {
        try { d.fn(el, { type, id, offer: o, index: i }, pl, NX.isOn(d.key)); } catch (err) { NX.trip(d.key, err); }
      }
    });
  }
})();
