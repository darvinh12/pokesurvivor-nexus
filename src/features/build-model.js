// Modelo "Build Nexus": la mejor build de cada Pokémon calculada con los datos
// del propio juego (Moves, Stats, Types, Enemies, DEX). No simula partidas:
// es una cuenta explicable que el Centro de builds muestra con su porqué.
// Expone NX.buildModel. Lee NX.ns y NX.gd de forma perezosa.
//
// ---- Reglas del juego que usa (leídas del código del juego)
// - 4 huecos (Player.maxMoves). Con los Lazos todos disparan a la vez; se
//   supone la build completa y enlazada.
// - Daño por golpe = dmg × At. o At. Esp. del Pokémon según la categoría
//   (Player.atkFor con Stats.fit) × 1,2 si es de tipo único y el movimiento
//   es de su tipo (MONO_K; el juego no da STAB a los de dos tipos)
//   × Types.mult contra el enemigo × Stats.taken según su Defensa o Def. Esp.
// - Niveles y evolución con Moves.instance y Moves.evolve. Evolucionar pide
//   el nivel máximo y una mejora de stat (Moves.EVO).
// - Potenciadores: Danza Espada y Danza Dragón comparten el buff de ataque
//   físico (solo cuenta el mejor), Maquinación el especial, Agilidad la
//   velocidad, Fortaleza la reducción de daño (tope 80 %) y Acua Aro la
//   regeneración. El juego no ofrece más de 2 potenciadores.
// - Recibir un golpe da 0,45 s de invulnerabilidad, las embestidas (dash)
//   0,3 s por uso y llevar un movimiento cuerpo a cuerpo reduce el daño
//   recibido un 25 %.
// - Enemigos: candidatos de cada tramo de Enemies.TIERS (rareza < 5 y total
//   base en su rango) pesados por el tiempo que dura el tramo. Jefes:
//   Enemies.BOSSES pesados por su vida.
//
// ---- Fórmula
// Dos momentos de la partida, cada uno con su puntuación:
//   Inicio (40 %): movimientos a nivel 2 sin evolucionar, enemigos y jefe de
//     los primeros 4:20 min, sin mejoras de stat.
//   Final (60 %): nivel máximo y evolucionados, enemigos de 4:20 a 15:00.
// En cada momento:
//   Golpes por segundo de cada movimiento en una multitud de densidad fija
//   según su forma (arco, línea, círculo, proyectiles con perforación y
//   rebotes, órbitas, campos con tics...; ver rates()), en multitud y contra
//   un solo objetivo grande (jefe).
//   Daño en grupo  C = Σ golpes/s × daño × buff de su categoría × eficacia
//                      media (75 %) y contra el peor tipo de horda (25 %),
//                      más quemadura y veneno.
//   Daño a jefes   B = igual con un objetivo y la eficacia contra los jefes.
//   Aguante        A = segundos que dura la vida frente al daño por golpe del
//                      momento (como mucho un golpe cada 0,45 s) × daño
//                      recibido por tipos y defensas × (1 − reducción) ×
//                      (1 − control) × (1 − invulnerabilidad) ÷ ventaja de
//                      velocidad × presión, que baja si matas más rápido de lo
//                      que llega vida enemiga y sube hasta un 60 % si el daño
//                      sale de movimientos de corto alcance (< 200 px); menos
//                      regeneración. Tope 1800 s.
//   Puntuación     0,5·ln C + 0,2·ln B + 0,3·ln A.
// Total = 0,4 × inicio + 0,6 × final. Se prueban todas las combinaciones de
// hasta 2 potenciadores con los 9 mejores ataques del Pokémon y gana la de
// mayor total. Tier por puesto con los cortes de SurvivorTiers: S 3 %, A 9 %,
// B 21 %, C 31 % y D el resto.
//
// ---- Supuestos (no están en el juego o no se pueden leer con certeza)
// Densidad de la multitud, vida enemiga que llega por segundo, cadencia de
// charcos y minas, daño de quemadura y veneno a nivel 40, recarga ×0,8 y
// reducción base de 25 % al final por mejoras de stat. No cuenta objetos,
// habilidades, naturalezas, clima ni terreno. Es una estimación para
// comparar, no una simulación.
(() => {
  const MODEL_V = 5;
  const STORE = 'bc:cache';
  const ns = () => NX.ns || {};

  const R_EN = 14;       // radio típico de un enemigo
  const R_BOSS = 30;     // radio típico de un jefe
  const IFRAME = 0.45;   // invulnerabilidad tras recibir un golpe
  const RED_CAP = 0.8, SURV_CAP = 1800;
  const W_C = 0.5, W_B = 0.2, W_A = 0.3;
  const TOPK = 9;
  const TIER_CUTS = [['S', 30], ['A', 120], ['B', 320], ['C', 620]]; // de 966, como SurvivorTiers

  // Los dos momentos de la partida.
  const STAGES = [
    { key: 'early', w: 0.4, lvl: 2, evo: false, from: 0, to: 260, rho: 1 / 6000, cap: 12, cdm: 1,
      hit: 14, flow: 150, pressure: 0.5, baseRed: 0, baseRegen: 0.5, hpBonus: 0, uptime: 0.75 },
    { key: 'late', w: 0.6, lvl: 99, evo: true, from: 260, to: 900, rho: 1 / 3500, cap: 20, cdm: 0.8,
      hit: 68, flow: 5000, pressure: 0.5, baseRed: 0.25, baseRegen: 1.5, hpBonus: 60, uptime: 0.9 },
  ];

  // ---- golpes por segundo de un movimiento en un momento dado
  function rates(f, S) {
    const RHO = S.rho, CAP = S.cap;
    const n = (a) => Math.min(CAP, Math.max(1, RHO * a));
    const circ = (r) => Math.PI * (r + R_EN) * (r + R_EN);
    const k = f.kind, cd = Math.max(0.05, (f.cd || 1) * S.cdm);
    const cnt = Math.max(1, f.count | 0);
    const strip = 2 * (f.size || 6) + 2 * R_EN;
    let c = 1, s = 1, per = true, dodge = 0;
    switch (k) {
      case 'melee': c = n(0.5 * Math.min(f.arc || 1, 2 * Math.PI) * (f.radius + R_EN) ** 2); break;
      case 'dash': c = n(f.radius * ((f.width || 34) + 2 * R_EN)); dodge = 0.3 / cd; break;
      case 'projectile': case 'homing': case 'bounce': {
        const L = (f.speed || 300) * (f.life || 1.5);
        const perP = 1 + (f.bounce | 0) + Math.min(f.pierce || 0, RHO * L * strip);
        c = Math.min(CAP * 1.5, cnt * perP * (f.homing ? 0.95 : 0.8));
        s = cnt * (f.homing ? 0.95 : cnt > 1 ? 0.75 : 0.85);
        break;
      }
      case 'cone': {
        const L = (f.speed || 300) * (f.life || 0.5);
        c = Math.min(CAP * 1.5, cnt * Math.min(1 + (f.pierce || 0), Math.max(1, RHO * L * strip)) * 0.85);
        s = cnt * 0.6;
        break;
      }
      case 'nova': {
        const L = (f.speed || 230) * (f.life || 1), x = RHO * L * strip;
        c = Math.min(CAP * 1.5, cnt * (1 - Math.exp(-x)) * (1 + Math.min(f.pierce || 0, x)));
        s = 1 + cnt * 0.06;
        break;
      }
      case 'beam': case 'charge': c = n(f.radius * ((f.width || 30) + 2 * R_EN)); break;
      case 'boomerang': c = Math.min(CAP * 1.5, cnt * n(f.radius * strip) * 1.6); s = cnt * 1.5; break;
      case 'aura': case 'stun': case 'shove': c = n(circ(f.radius)); break;
      case 'chain': {
        let t = 0;
        for (let i = 0; i < cnt; i++) t += Math.pow(0.85, i);
        const hex = f.hex ? 1 + (f.hex - 1) * 0.35 : 1;
        c = t * hex; s = hex;
        break;
      }
      case 'mine': c = cnt * n(circ(f.radius)) * 0.85; s = cnt * 0.25; break;
      case 'meteor': c = cnt * n(circ(f.radius)); s = 1 + (cnt - 1) * 0.35; break;
      case 'spin': c = cnt * n(circ(f.radius)); s = cnt; break;
      case 'quake': c = cnt * n(circ(f.radius)) * 0.6; s = Math.min(cnt, (2 * (f.radius + R_BOSS)) / 34); break;
      case 'vortex': {
        const ticks = (f.dur || 2.6) / 0.4;
        c = ticks * Math.min(CAP, Math.max(1, RHO * 1.5 * circ(f.radius)));
        s = ticks * 0.8;
        break;
      }
      case 'orbit': {
        const ring = Math.max(0.6, RHO * 2 * Math.PI * f.radius * strip) * 1.3;
        const passes = cnt * (f.speed || 2.5) / (2 * Math.PI);
        c = ring * passes; s = passes * 0.6; per = false;
        break;
      }
      case 'trail': {
        const alive = Math.min(18, ((f.dur || 3) * 120) / (0.9 * f.radius));
        c = (alive * n(circ(f.radius)) * 0.35) / 0.5; s = 0.5; per = false;
        break;
      }
      case 'turret': {
        const active = Math.min(cnt, (f.dur || 6) / cd);
        c = s = (active * 0.9) / (f.rate || 0.5); per = false;
        break;
      }
      default: break;
    }
    const cH = per ? c / cd : c, sH = per ? s / cd : s;
    // Control: enemigos frenados, aturdidos o empujados llegan menos a ti.
    let keep = 1;
    const reach = Math.min(1, cH / 6);
    if (f.slow) keep *= 1 - 0.35 * Math.min(0.8, f.slow) * reach;
    if (f.stun) keep *= 1 - 0.5 * Math.min(1, (cH * f.stun) / 12);
    if (f.knock) keep *= 1 - (k === 'shove' || f.knock >= 250 ? 0.3 * Math.min(1, f.knock / 500) : 0.05 * Math.min(1, f.knock / 150)) * reach;
    if (f.pull) keep *= 0.88;
    // Quemadura y veneno: daño fijo por tic que no escala con el ataque.
    let dotC = 0, dotS = 0;
    if (f.burn) { dotC += Math.min(CAP * 0.7, cH * 3) * 11; dotS += 11; }
    if (f.poison) { dotC += Math.min(CAP * 0.7, cH * 4) * 8 * f.poison; dotS += 16; }
    const drain = f.drain ? Math.min(6, cH * f.drain) : 0;
    // Alcance con el que dispara (como el juego) o radio en el que hace daño.
    const reachPx = k === 'melee' ? f.radius + 30 : k === 'dash' ? f.radius + 60 : k === 'spin' || k === 'shove' ? f.radius + 20
      : k === 'aura' || k === 'orbit' || k === 'trail' ? f.radius : k === 'cone' ? (f.speed || 300) * (f.life || 0.5) + 30 : 300;
    return { cH, sH, ctrl: 1 - keep, dodge: Math.min(0.85, dodge), dotC, dotS, drain, close: reachPx < 200 };
  }

  // ---- tabla de movimientos: una fila por movimiento y momento
  let MT = null;
  function moveTable() {
    const M = ns().Moves;
    if (MT && MT.n === M.ALL.length) return MT;
    const by = {};
    for (const d of M.ALL) {
      const max = d.maxLvl || 5;
      const hasEvo = !!(M.EVO && M.EVO[d.id]);
      const row = { id: d.id, kind: d.kind, type: d.type, cat: d.cat || null, evoNeed: hasEvo ? M.EVO[d.id] : null, st: [] };
      for (const S of STAGES) {
        let f = M.instance(d.id, Math.min(S.lvl, max));
        let evolved = false;
        if (S.evo && hasEvo) {
          const c = Object.assign({}, f);
          try { evolved = !!M.evolve(c); } catch (_) { evolved = false; }
          if (evolved) f = c;
        }
        const e = { f, evolved };
        if (d.kind === 'buff') e.buff = { stat: f.stat, total: (f.amount || 0) * (f.stacks || 1) * S.uptime };
        else { e.dmg = f.dmg || 0; Object.assign(e, rates(f, S)); }
        row.st.push(e);
      }
      row.buff = d.kind === 'buff';
      row.melee = d.kind === 'melee';
      by[d.id] = row;
    }
    MT = { n: M.ALL.length, by };
    return MT;
  }

  // ---- enemigos y jefes de cada momento
  let EN = null;
  function enemyTables() {
    if (EN) return EN;
    const N = ns(), E = N.Enemies, T = N.Types, St = N.Stats;
    const TYPES = Object.keys((N.U && N.U.TYPE_NAME) || T.CHART || {});
    const gi = new Map(TYPES.map((t, i) => [t, i])), G = TYPES.length;
    const cands = (tier) => {
      try { if (typeof E.candidates === 'function') return E.candidates(tier) || []; } catch (_) { /* respaldo */ }
      return N.DEX.filter((p) => p.rarity < 5 && p.bst >= tier.bst[0] && p.bst <= tier.bst[1]);
    };
    const pools = E.TIERS.map((tier) => cands(tier));
    let total = 0;
    const out = STAGES.map((S) => {
      const list = [];
      E.TIERS.forEach((tier, i) => {
        const end = i + 1 < E.TIERS.length ? E.TIERS[i + 1].from : 900;
        const dur = Math.max(0, Math.min(end, S.to) - Math.max(tier.from, S.from));
        const cs = pools[i];
        if (!dur || !cs.length) return;
        for (const p of cs) list.push({ types: p.types, mon: p, w: dur / cs.length });
      });
      total += list.length;
      const gw = new Float64Array(G);
      for (const e of list) for (const t of e.types) if (gi.has(t)) gw[gi.get(t)] += e.w / e.types.length;
      const gwSum = gw.reduce((a, b) => a + b, 0) || 1;
      const groupsMin = [];
      for (let g = 0; g < G; g++) if (gw[g] / gwSum >= 0.03) groupsMin.push(g);
      const eff = {};
      for (const t of TYPES) {
        eff[t] = {};
        for (const cat of ['physical', 'special']) {
          const g = new Float64Array(G), gs = new Float64Array(G);
          let sum = 0, ws = 0;
          for (const e of list) {
            const v = T.mult(t, e.types) * St.taken(e.mon, cat);
            sum += v * e.w; ws += e.w;
            for (const et of e.types) { const k = gi.get(et); if (k != null) { g[k] += v * e.w; gs[k] += e.w; } }
          }
          for (let k = 0; k < G; k++) g[k] = gs[k] ? g[k] / gs[k] : 1;
          eff[t][cat] = { mean: ws ? sum / ws : 1, g };
        }
      }
      const bosses = (E.BOSSES || []).filter((b) => (b.at || 0) >= S.from && (b.at || 0) < Math.max(S.to, 901))
        .map((b) => ({ mon: N.DEX_BY[b.dex], hp: b.hp || 1 })).filter((b) => b.mon);
      const bossEff = {};
      for (const t of TYPES) {
        bossEff[t] = {};
        for (const cat of ['physical', 'special']) {
          let s = 0, w = 0;
          for (const b of bosses) { s += T.mult(t, b.mon.types) * St.taken(b.mon, cat) * b.hp; w += b.hp; }
          bossEff[t][cat] = w ? s / w : 1;
        }
      }
      // Daño que recibe el jugador: cubetas por (tipo de ataque, categoría).
      const inB = new Map();
      for (const e of list) {
        const cat = typeof St.sideOf === 'function' ? St.sideOf(e.mon) : 'physical';
        const key = e.types[0] + '|' + cat;
        inB.set(key, (inB.get(key) || 0) + e.w);
      }
      const inSum = [...inB.values()].reduce((a, b) => a + b, 0) || 1;
      const incoming = [...inB.entries()].map(([k, w]) => { const [t, c] = k.split('|'); return { t, c, w: w / inSum }; });
      return { G, groupsMin, eff, bossEff, incoming, bosses: bosses.map((b) => b.mon.dex) };
    });
    EN = { TYPES, stages: out, nEnemies: total };
    return EN;
  }

  // ---- evaluación de un Pokémon
  function monCtx(mon) {
    const N = ns(), St = N.Stats, T = N.Types, en = enemyTables();
    const inMult = en.stages.map((s) => s.incoming.reduce((a, b) => a + b.w * St.taken(mon, b.c) * T.mult(b.t, mon.types), 0));
    return { mon, inMult, mono: mon.types.length === 1 ? mon.types[0] : null };
  }
  // Valores de un ataque para este Pokémon en cada momento (sin potenciadores).
  function attackVals(ctx, row) {
    const en = enemyTables();
    const cat = row.cat === 'special' ? 'special' : 'physical';
    const stab = !!ctx.mono && row.type === ctx.mono;
    const scale = (cat === 'special' ? ctx.mon.sa : ctx.mon.pa) * (stab ? 1.2 : 1);
    const st = row.st.map((e, i) => {
      const E = en.stages[i];
      const ef = (E.eff[row.type] || {})[cat] || { mean: 1, g: null };
      const dpsC = e.dmg * scale * e.cH, dpsS = e.dmg * scale * e.sH;
      const g = new Float64Array(E.G);
      for (let k = 0; k < E.G; k++) g[k] = dpsC * (ef.g ? ef.g[k] : 1);
      return { e, meanC: dpsC * ef.mean, g, boss: dpsS * ((E.bossEff[row.type] || {})[cat] || 1), effMean: ef.mean };
    });
    return { row, cat, stab, st };
  }

  function evalStage(ctx, i, atks, buffs) {
    const S = STAGES[i], E = enemyTables().stages[i];
    let patk = 0, sm = 1, red = S.baseRed, regen = S.baseRegen, spd = 1;
    for (const b of buffs) {
      const bf = b.st[i].buff, v = bf.total;
      if (bf.stat === 'patk') patk = Math.max(patk, v);
      else if (bf.stat === 'satk') sm = 1 + v;
      else if (bf.stat === 'def') red += v;
      else if (bf.stat === 'regen') regen += v;
      else if (bf.stat === 'spd') spd += v;
    }
    const pm = 1 + patk;
    red = Math.min(RED_CAP, red);
    const vec = new Float64Array(E.G);
    let mean = 0, boss = 0, dot = 0, dotB = 0, keep = 1, open = 1, drain = 0, melee = false, near = 0;
    for (const a of atks) {
      const s = a.st[i], m = a.cat === 'special' ? sm : pm;
      mean += s.meanC * m; boss += s.boss * m; dot += s.e.dotC; dotB += s.e.dotS;
      if (s.e.close) near += s.meanC * m + s.e.dotC;
      for (let k = 0; k < E.G; k++) vec[k] += s.g[k] * m;
      keep *= 1 - s.e.ctrl;
      open *= 1 - s.e.dodge;
      drain += s.e.drain;
      if (a.row.melee) melee = true;
    }
    let low = Infinity;
    for (const k of E.groupsMin) if (vec[k] < low) low = vec[k];
    if (!isFinite(low)) low = mean;
    const crowd = Math.max(1, 0.75 * mean + 0.25 * low + dot);
    const bossD = Math.max(1, boss + dotB);
    const ctrl = Math.min(0.6, 1 - keep), dodge = Math.min(0.85, 1 - open);
    const kite = Math.sqrt(NX.clamp(((ctx.mon.spd || 90) * spd) / 90, 0.6, 3));
    // Pegar de cerca obliga a dejar que los enemigos lleguen: más presión.
    const nearShare = near / Math.max(1, mean + dot);
    const press = S.pressure * NX.clamp(Math.sqrt(S.flow / crowd), 0.25, 1.5) * (1 + 0.6 * nearShare);
    const incoming = (S.hit * ctx.inMult[i] * (1 - red) * (melee ? 0.75 : 1) * press * (1 - ctrl) * (1 - dodge)) / kite / IFRAME;
    const heal = regen + Math.min(6, drain);
    const net = Math.max(incoming - heal, incoming * 0.05, 0.5);
    const surv = Math.min(SURV_CAP, ((ctx.mon.hp || 80) + S.hpBonus) / net);
    const score = W_C * Math.log(crowd) + W_B * Math.log(bossD) + W_A * Math.log(surv);
    return { score, crowd, boss: bossD, surv, pm, sm, red, regen: heal, spd, ctrl, dodge, melee, nearShare };
  }
  function evalCombo(ctx, atks, buffs) {
    const st = STAGES.map((S, i) => evalStage(ctx, i, atks, buffs));
    return { score: st.reduce((a, r, i) => a + STAGES[i].w * r.score, 0), st };
  }

  const comboCache = new Map();
  function idxCombos(nItems, k) {
    const key = nItems + ':' + k;
    if (comboCache.has(key)) return comboCache.get(key);
    const out = [], cur = [];
    const rec = (start) => {
      if (cur.length === k) { out.push(cur.slice()); return; }
      for (let i = start; i <= nItems - (k - cur.length); i++) { cur.push(i); rec(i + 1); cur.pop(); }
    };
    rec(0);
    comboCache.set(key, out);
    return out;
  }

  // Movimientos que puede conseguir: pool de cartas (normal y sus tipos), el
  // inicial y, si se pide, sus MT.
  function candidates(dex, withTM) {
    const N = ns(), M = N.Moves, mon = N.DEX_BY[dex];
    const ids = new Set();
    try { for (const id of M.poolFor(mon, true)) ids.add(id); } catch (_) { /* nada */ }
    let start = null;
    try { start = N.baseStartOf ? N.baseStartOf(dex) : M.startFor(mon); } catch (_) { start = null; }
    if (start && M.BY_ID[start]) ids.add(start);
    const tm = [];
    if (withTM) {
      try { for (const id of N.TM_OF(dex) || []) if (M.BY_ID[id] && !ids.has(id)) { ids.add(id); tm.push(id); } } catch (_) { /* nada */ }
    }
    return { ids: [...ids], start, tm };
  }

  function bestFor(dex, withTM) {
    const N = ns(), mon = N.DEX_BY[dex];
    if (!mon) return null;
    const mt = moveTable().by;
    const ctx = monCtx(mon);
    const { ids, start, tm } = candidates(dex, withTM);
    const atkAll = [], buffAll = [];
    for (const id of ids) {
      const row = mt[id];
      if (!row) continue;
      if (row.buff) buffAll.push(row); else if (row.st[1].dmg > 0) atkAll.push(attackVals(ctx, row));
    }
    // Danza Dragón y Danza Espada comparten buff: basta con la más fuerte.
    const bestP = buffAll.filter((b) => b.st[1].buff.stat === 'patk').sort((a, b) => b.st[1].buff.total - a.st[1].buff.total)[0];
    const buffs = buffAll.filter((b) => b.st[1].buff.stat !== 'patk' || b === bestP);
    // Preselección: los mejores ataques por separado, con su potenciador ideal.
    const bm = (stat, i) => { const b = buffs.find((x) => x.st[i].buff.stat === stat); return b ? 1 + b.st[i].buff.total : 1; };
    const proxy = (a) => STAGES.reduce((acc, S, i) => {
      const s = a.st[i], m = bm(a.cat === 'special' ? 'satk' : 'patk', i);
      return acc + S.w * Math.log(1 + ((s.meanC * m + s.e.dotC) * (1 + 1.5 * s.e.ctrl + 3 * s.e.dodge) + 0.3 * s.boss * m));
    }, 0);
    for (const a of atkAll) a.px = proxy(a);
    atkAll.sort((a, b) => b.px - a.px);
    const atks = atkAll.slice(0, TOPK);
    const buffSets = [[]];
    for (let i = 0; i < buffs.length; i++) { buffSets.push([buffs[i]]); for (let j = i + 1; j < buffs.length; j++) buffSets.push([buffs[i], buffs[j]]); }
    let best = null;
    for (const bs of buffSets) {
      const k = Math.min(4 - bs.length, atks.length);
      if (k < 1) continue;
      for (const ix of idxCombos(atks.length, k)) {
        const sel = ix.map((i) => atks[i]);
        const r = evalCombo(ctx, sel, bs);
        if (!best || r.score > best.r.score) best = { r, atks: sel, buffs: bs };
      }
    }
    if (!best) return null;
    return { dex, ctx, start, tm, best, pool: ids };
  }

  // ---- cálculo de todos, por tandas, con caché en memoria y en NX.store
  let state = 'idle', result = null, promise = null, lastErr = '';
  const verKey = async () => {
    let v = 'nov';
    try { const j = await (await fetch('/version.json', { cache: 'no-store' })).json(); v = (j && (j.v || j.at)) || 'nov'; } catch (_) { v = 'nov'; }
    const N = ns();
    return `${v}|${N.Moves.ALL.length}|${N.DEX.length}|m${MODEL_V}`;
  };
  function finish(rows, ms, fromCache, key) {
    rows.sort((a, b) => b.raw - a.raw);
    const N = rows.length, lo = rows[N - 1].raw, hi = rows[0].raw;
    const cuts = TIER_CUTS.map(([t, r]) => [t, Math.max(1, Math.round((r / 966) * N))]);
    const pct = (k) => {
      const s = rows.map((r) => r[k]).sort((a, b) => a - b);
      return (v) => { let a = 0, b = s.length; while (a < b) { const m = (a + b) >> 1; if (s[m] < v) a = m + 1; else b = m; } return Math.round((100 * a) / Math.max(1, s.length - 1)); };
    };
    const pc = pct('crowd'), pb = pct('boss'), ps = pct('surv');
    rows.forEach((r, i) => {
      r.rank = i + 1;
      r.score = Math.round((100 * (r.raw - lo)) / Math.max(1e-9, hi - lo));
      r.tier = (cuts.find(([, c]) => r.rank <= c) || ['D'])[0];
      r.pct = { crowd: pc(r.crowd), boss: pb(r.boss), surv: ps(r.surv) };
    });
    result = { rows, byDex: new Map(rows.map((r) => [r.dex, r])), ms, fromCache, key, total: N, at: Date.now() };
    state = 'ready';
    return result;
  }
  // Para los porcentajes de la ficha: media ponderada de los dos momentos en escala log.
  const mix = (r, k) => Math.exp(r.st.reduce((a, s, i) => a + STAGES[i].w * Math.log(Math.max(1e-6, s[k])), 0));
  function computeAll(key) {
    return new Promise((resolve, reject) => {
      const list = ns().DEX.map((p) => p.dex);
      const rows = [];
      let i = 0, busy = 0;
      const t0 = performance.now();
      try { moveTable(); enemyTables(); } catch (err) { reject(err); return; }
      const step = () => {
        const s0 = performance.now();
        try {
          while (i < list.length && performance.now() - s0 < 40) {
            const b = bestFor(list[i], false);
            if (b) {
              const r = b.best.r;
              rows.push({ dex: b.dex, raw: r.score, moves: [...b.best.atks.map((a) => a.row.id), ...b.best.buffs.map((x) => x.id)], crowd: mix(r, 'crowd'), boss: mix(r, 'boss'), surv: mix(r, 'surv') });
            }
            i++;
          }
        } catch (err) { reject(err); return; }
        busy += performance.now() - s0;
        if (i < list.length) { setTimeout(step, 0); return; }
        const out = finish(rows, { busy: Math.round(busy), wall: Math.round(performance.now() - t0) }, false, key);
        try {
          NX.store.set(STORE, { key, ms: out.ms, at: out.at, rows: rows.map((r) => [r.dex, +r.raw.toFixed(5), r.moves, +r.crowd.toFixed(1), +r.boss.toFixed(1), +r.surv.toFixed(2)]) });
        } catch (_) { /* almacenamiento lleno */ }
        resolve(out);
      };
      step();
    });
  }
  function ready(force) {
    if (state === 'ready' && result && !force) return Promise.resolve(result);
    if (promise && !force) return promise;
    state = 'running';
    promise = (async () => {
      const key = await verKey();
      const saved = !force && NX.store.get(STORE, null);
      if (saved && saved.key === key && Array.isArray(saved.rows) && saved.rows.length) {
        const rows = saved.rows.map(([dex, raw, moves, crowd, boss, surv]) => ({ dex, raw, moves, crowd, boss, surv }));
        return finish(rows, saved.ms || null, true, key);
      }
      return computeAll(key);
    })().catch((err) => { state = 'error'; lastErr = String((err && err.message) || err); promise = null; throw err; });
    return promise;
  }

  // ---- explicación de una build (para la ficha)
  const fmt = (v) => Math.round(+v || 0).toLocaleString('es-VE');
  const pctTxt = (v) => Math.round(v * 100) + ' %';
  const dec = (v, d = 2) => (+v).toFixed(d).replace('.', ',');
  function explain(dex, opts = {}) {
    const G = NX.gd;
    const b = bestFor(dex, !!opts.tm);
    if (!b) return null;
    const { r, atks, buffs } = b.best;
    const L = r.st[1], E0 = r.st[0];
    const dmgOf = (a, i) => { const s = a.st[i], rr = r.st[i]; return s.meanC * (a.cat === 'special' ? rr.sm : rr.pm) + s.e.dotC; };
    const totalL = atks.reduce((s, a) => s + dmgOf(a, 1), 0) || 1;
    const physN = atks.filter((a) => a.cat !== 'special').length, specN = atks.length - physN;
    const moves = [];
    for (const a of atks) {
      const sL = a.st[1], mult = a.cat === 'special' ? L.sm : L.pm;
      const share = dmgOf(a, 1) / totalL;
      const f = sL.e.f;
      const bits = [`${fmt(dmgOf(a, 1))} daño/s en grupo al final (${pctTxt(share)} de la build)`, `${fmt(sL.boss * mult + sL.e.dotS)}/s a jefes`, `${fmt(dmgOf(a, 0))}/s al inicio`];
      bits.push(a.cat === 'special' ? 'usa At. Esp.' : 'usa Ataque');
      if (a.stab) bits.push('tipo propio ×1,2');
      if (sL.effMean >= 1.05) bits.push(`eficaz de media (×${dec(sL.effMean)})`);
      else if (sL.effMean <= 0.95) bits.push(`poco eficaz de media (×${dec(sL.effMean)})`);
      if (sL.e.dodge > 0.05) bits.push(`invulnerable ${pctTxt(sL.e.dodge)} del tiempo`);
      if (a.row.melee) bits.push('cuerpo a cuerpo: −25 % de daño recibido');
      if (sL.e.close) bits.push('pega de cerca');
      if (f.slow) bits.push('ralentiza');
      if (f.stun) bits.push('aturde');
      if (f.knock >= 250) bits.push('empuja');
      if (f.pull) bits.push('atrae');
      if (f.burn) bits.push('quema');
      if (f.poison) bits.push('envenena');
      if (f.drain) bits.push('drena vida');
      moves.push({ id: a.row.id, kind: a.row.kind, type: a.row.type, name: G.moveName(a.row.id), share, evoNeed: sL.evolved ? a.row.evoNeed : null,
        evoName: sL.evolved && a.row.evoNeed ? G.statTitle(a.row.evoNeed) : '', why: bits.join(' · '), tm: b.tm.includes(a.row.id) });
    }
    for (const x of buffs) {
      const bf = x.st[1].buff, v = bf.total;
      let why = '';
      if (bf.stat === 'patk') why = `+${pctTxt(v)} de daño físico a ${physN} movimiento${physN === 1 ? '' : 's'}`;
      else if (bf.stat === 'satk') why = `+${pctTxt(v)} de daño especial a ${specN} movimiento${specN === 1 ? '' : 's'}`;
      else if (bf.stat === 'def') why = `reducción de daño de ${pctTxt(L.red)} al final y ${pctTxt(E0.red)} al inicio (tope 80 %)`;
      else if (bf.stat === 'regen') why = `+${dec(v, 1)} PS por segundo`;
      else if (bf.stat === 'spd') why = `+${pctTxt(v)} de velocidad para esquivar`;
      why += ' · con todas sus acumulaciones';
      moves.push({ id: x.id, kind: 'buff', type: x.type, name: G.moveName(x.id), share: 0, evoNeed: null, evoName: '', why, tm: b.tm.includes(x.id), buff: true });
    }
    const evoNeeds = [...new Set(moves.filter((m) => m.evoNeed).map((m) => m.evoName))];
    return {
      dex, moves, evoNeeds, start: b.start, startName: b.start ? G.moveName(b.start) : '',
      startIn: moves.some((m) => m.id === b.start),
      crowd: mix(r, 'crowd'), boss: mix(r, 'boss'), surv: mix(r, 'surv'), raw: r.score,
      early: { crowd: E0.crowd, surv: E0.surv }, late: { crowd: L.crowd, surv: L.surv, red: L.red, ctrl: L.ctrl, dodge: L.dodge, regen: L.regen },
      usedTM: moves.some((m) => m.tm), poolSize: b.pool.length, tmCount: b.tm.length,
    };
  }

  NX.buildModel = {
    version: MODEL_V,
    METHOD: 'Build Nexus: estimación con los datos del juego, no una simulación. Cada movimiento se valora al inicio (nivel 2) y al final (nivel máximo y evolucionado) con el ataque físico o especial del Pokémon, tipo propio ×1,2 si es de un solo tipo, y la eficacia y defensas de los enemigos y jefes de ese momento. Puntúa daño en grupo (50 %), daño a jefes (20 %) y aguante (30 %): vida, defensas, reducción, control, invulnerabilidad de las embestidas, velocidad, regeneración y lo rápido que matas. Prueba todas las combinaciones con hasta 2 potenciadores. No cuenta objetos, habilidades ni naturalezas.',
    status: () => state,
    error: () => lastErr,
    ready,
    recompute: () => { NX.store.set(STORE, null); state = 'idle'; result = null; promise = null; return ready(true); },
    get: (dex) => (result ? result.byDex.get(+dex) || null : null),
    all: () => (result ? result.rows : []),
    info: () => (result ? { ms: result.ms, fromCache: result.fromCache, total: result.total, key: result.key, enemies: EN ? EN.nEnemies : 0 } : null),
    explain,
    // Tabla de candidatos de un Pokémon, para revisar el modelo desde la consola.
    debug(dex) {
      const mon = ns().DEX_BY[dex];
      if (!mon) return null;
      const ctx = monCtx(mon), mt = moveTable().by;
      return candidates(dex, false).ids.map((id) => mt[id]).filter((row) => row && !row.buff).map((row) => {
        const a = attackVals(ctx, row);
        return { id: row.id, kind: row.kind, cat: a.cat, early: Math.round(a.st[0].meanC + a.st[0].e.dotC), late: Math.round(a.st[1].meanC + a.st[1].e.dotC), boss: Math.round(a.st[1].boss), dodge: +a.st[1].e.dodge.toFixed(2) };
      }).sort((x, y) => y.late - x.late);
    },
    tierColor: (t) => ((NX.gd && NX.gd.TIER_COL) || {})[t] || '#9aa6b5',
  };
})();
