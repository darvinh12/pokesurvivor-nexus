// Telemetría de partida: núcleo del medidor de daño, las alertas, el historial
// y la autopsia. El daño infligido sale de los contadores que el juego ya
// lleva (player.dmgDealt y move.dealt de cada movimiento), así que no hay
// hooks por golpe. El daño recibido sí se engancha en Player.hurt, que se
// llama pocas veces, para saber qué enemigo o ataque lo causó.
// Idea de muestreo e historial adaptada de PokeSurvivor Plus (MIT).
(() => {
  const KEY = 'tele';
  const RUNS_KEY = 'tele:runs';
  const MAX_RUNS = 50, MAX_PTS = 60, HITS_KEEP = 12, TICK_MS = 250, RING = 44;
  const TYPES = {
    normal: 'Normal', fire: 'Fuego', water: 'Agua', grass: 'Planta', electric: 'Eléctrico', ice: 'Hielo',
    fighting: 'Lucha', poison: 'Veneno', ground: 'Tierra', flying: 'Volador', psychic: 'Psíquico', bug: 'Bicho',
    rock: 'Roca', ghost: 'Fantasma', dragon: 'Dragón', dark: 'Siniestro', steel: 'Acero', fairy: 'Hada',
  };

  const subs = { runStart: [], runEnd: [], hit: [], death: [] };
  const emit = (ev, a) => {
    for (const fn of subs[ev]) { try { fn(a); } catch (err) { console.warn('[nexus] telemetry.' + ev, err); } }
  };

  let on = true;       // copia de NX.isOn(KEY), se refresca en cada tick
  let run = null;      // partida en curso
  let last = null;     // resumen de la última partida terminada, con detalle para la autopsia
  let hist = null;     // historial en memoria (se carga una vez)

  // Contexto del cuadro actual para atribuir el daño recibido.
  let curEnemy = null, striker = null, strikeT = 0, zone = null;

  const loadHist = () => {
    if (!hist) { const h = NX.store.get(RUNS_KEY, []); hist = Array.isArray(h) ? h : []; }
    return hist;
  };

  function newRun(p) {
    const ns = NX.ns;
    run = {
      player: p,
      at: Date.now(),
      time: 0,
      ownClock: 0,
      mon: (p.mon && p.mon.name) || '?',
      dex: (p.mon && p.mon.dex) || 0,
      shiny: !!p.shiny,
      coop: !!(ns.Coop && ns.Coop.active),
      moveDmg: new Map(),        // id -> { name, dmg }
      taken: 0,
      bySrc: new Map(),          // nombre -> daño recibido
      hits: [],                  // últimos golpes recibidos
      killer: null,
      step: 5, sDmg: [], sHp: [], sKills: [],
      recentHp: [], lastHpS: -1, // vida por segundo, últimos 60 s
      kpm: [], kpmMin: 0, kpmBase: 0,
      ringT: new Float64Array(RING), ringD: new Float64Array(RING), ringI: 0, ringN: 0,
      peakLevel: p.level || 1,
    };
    emit('runStart', current());
  }

  const enemyName = (e) => {
    const ns = NX.ns;
    return (e && (e.name || (ns.DEX_BY && ns.DEX_BY[e.dex] && ns.DEX_BY[e.dex].name))) || 'Pokémon salvaje';
  };
  const enemySrc = (e, how) => ({ name: enemyName(e), how, dex: e.dex || 0, boss: !!e.boss, legend: !!e.legend, shiny: !!e.shiny });

  // Proyectil enemigo que acaba de dar al jugador: mismo daño y tipo, el más cercano.
  function projSrc(p, dmg, type, looseOk) {
    const P = NX.ns.Projectiles;
    const arr = P && P.all && P.all();
    if (!arr || !arr.length) return null;
    let best = null, bd = Infinity, loose = null, ld = Infinity;
    for (let i = 0; i < arr.length; i++) {
      const o = arr[i];
      if (!o || o.friendly || !o.__nxs) continue;
      const d = (o.x - p.x) * (o.x - p.x) + (o.y - p.y) * (o.y - p.y);
      if (o.dmg === dmg && (type == null || o.mtype === type)) { if (d < bd) { bd = d; best = o; } }
      else if (d < ld) { ld = d; loose = o; }
    }
    if (best) return best.__nxs;
    return looseOk && loose && ld < 4900 ? loose.__nxs : null;
  }
  // Área de ataque que acaba de estallar.
  function hazardSrc(p) {
    const H = NX.ns.Hazards;
    // Según la versión del juego, Hazards.all es una función o la lista misma.
    const arr = H && (typeof H.all === 'function' ? H.all() : Array.isArray(H.all) ? H.all : null);
    if (!arr || !arr.length) return null;
    let best = null, bd = Infinity;
    for (let i = 0; i < arr.length; i++) {
      const h = arr[i];
      if (!h || !h.__nxs || !h.hit) continue;
      const d = (h.x - p.x) * (h.x - p.x) + (h.y - p.y) * (h.y - p.y);
      if (d < bd) { bd = d; best = h; }
    }
    return best && best.__nxs;
  }

  function sourceOf(p, st, dmg, type) {
    if (st) return enemySrc(st, 'contacto');
    if (curEnemy) return enemySrc(curEnemy, 'ataque');
    if (zone === 'haz') {
      const e = hazardSrc(p);
      return e ? enemySrc(e, 'ataque en área') : { name: 'Ataque en área', how: '' };
    }
    if (zone && zone !== 'Terreno') return { name: zone, how: '' };
    // El update del jugador puede contener otros pasos: primero se busca un
    // proyectil que coincida exacto y solo sin zona se acepta uno cercano.
    const e = projSrc(p, dmg, type, !zone);
    if (e) return enemySrc(e, 'proyectil');
    if (zone) return { name: zone, how: '' };
    return { name: type ? 'Ataque de tipo ' + (TYPES[type] || type) : 'Entorno', how: '' };
  }

  function record(p, lost, st, dmg, type, wasDead) {
    const src = sourceOf(p, st, dmg, type);
    const n = Math.round(lost);
    run.taken += lost;
    run.bySrc.set(src.name, (run.bySrc.get(src.name) || 0) + lost);
    const gt = NX.ns.Game.st && NX.ns.Game.st.time;
    const hit = { t: Math.round((typeof gt === 'number' ? gt : run.time) * 10) / 10, name: src.name, how: src.how, dmg: n, hp: Math.max(0, Math.round(p.hp)), max: Math.round(p.maxHp || 0), type: type || '' };
    run.hits.push(hit);
    if (run.hits.length > HITS_KEEP) run.hits.shift();
    emit('hit', hit);
    if (p.dead && !wasDead) {
      run.killer = Object.assign({}, src, { dmg: n, t: hit.t });
      emit('death', run.killer);
    }
  }

  // Envuelve un método para marcar qué enemigo está actuando.
  function wrapEnemy(P, name, isStrike) {
    const f = P && P[name];
    if (typeof f !== 'function') return;
    P[name] = function () {
      const prev = curEnemy;
      curEnemy = this;
      if (isStrike) { striker = this; strikeT = performance.now(); }
      try { return f.apply(this, arguments); } finally { curEnemy = prev; }
    };
  }
  // Envuelve el update de un módulo para etiquetar el daño que cause.
  function wrapZone(obj, name, label) {
    const f = obj && obj[name];
    if (typeof f !== 'function') return;
    obj[name] = function () {
      const prev = zone;
      zone = label;
      try { return f.apply(this, arguments); } finally { zone = prev; }
    };
  }
  // Marca con su autor lo que crea un enemigo (proyectiles y áreas).
  function wrapTag(obj, name) {
    const f = obj && obj[name];
    if (typeof f !== 'function') return;
    obj[name] = function (o) {
      const e = curEnemy;
      const out = f.apply(this, arguments);
      if (e && on) {
        if (o && typeof o === 'object' && !o.friendly) o.__nxs = e;
        if (out && typeof out === 'object' && !out.friendly) out.__nxs = e;
      }
      return out;
    };
  }

  function readMoves(p) {
    const list = Array.isArray(p.moves) ? p.moves : [];
    for (let i = 0; i < list.length; i++) {
      const m = list[i];
      if (!m || !(m.dealt > 0)) continue;
      const k = m.id || m.name;
      const cur = run.moveDmg.get(k);
      if (!cur) run.moveDmg.set(k, { name: m.name || String(k), dmg: m.dealt });
      else if (m.dealt > cur.dmg) cur.dmg = m.dealt;
    }
  }

  function halve(a) { const o = []; for (let i = 1; i < a.length; i += 2) o.push(a[i]); return o; }

  function sample(p) {
    run.sDmg.push(Math.round(p.dmgDealt || 0));
    run.sHp.push(p.maxHp > 0 ? Math.round((Math.max(0, p.hp) / p.maxHp) * 100) / 100 : 0);
    run.sKills.push(p.kills || 0);
    if (run.sDmg.length > MAX_PTS) {
      run.sDmg = halve(run.sDmg); run.sHp = halve(run.sHp); run.sKills = halve(run.sKills);
      run.step *= 2;
    }
  }

  function tick() {
    on = NX.isOn(KEY);
    if (!run) return;
    const ns = NX.ns, p = run.player;
    const t = ns.Game.st && ns.Game.st.time;
    if (typeof t === 'number') run.time = t;
    else if (ns.Game.state === 'playing') run.time += TICK_MS / 1000;
    readMoves(p);
    if ((p.level || 0) > run.peakLevel) run.peakLevel = p.level;
    // Ventana móvil para el DPS de los últimos 10 s.
    run.ringT[run.ringI] = run.time;
    run.ringD[run.ringI] = p.dmgDealt || 0;
    run.ringI = (run.ringI + 1) % RING;
    if (run.ringN < RING) run.ringN++;
    // Series acotadas.
    while (run.time >= (run.sDmg.length + 1) * run.step) sample(p);
    const s = Math.floor(run.time);
    if (s !== run.lastHpS) {
      run.lastHpS = s;
      run.recentHp.push(p.maxHp > 0 ? Math.round((Math.max(0, p.hp) / p.maxHp) * 100) / 100 : 0);
      if (run.recentHp.length > 60) run.recentHp.shift();
    }
    // Bajas por minuto.
    const min = Math.floor(run.time / 60);
    if (min > run.kpmMin && run.kpm.length < 60) {
      run.kpm.push((p.kills || 0) - run.kpmBase);
      run.kpmBase = p.kills || 0;
      run.kpmMin = min;
    }
  }

  function moveList() {
    if (!run) return [];
    const total = (run.player.dmgDealt || 0);
    let sum = 0;
    const out = [];
    for (const [id, m] of run.moveDmg) { sum += m.dmg; out.push({ id, name: m.name, dmg: m.dmg, pct: 0 }); }
    const other = total - sum;
    if (other > Math.max(1, total * 0.002)) out.push({ id: 'other', name: 'Otros (estados y habilidades)', dmg: other, pct: 0 });
    const den = Math.max(total, sum, 1);
    for (const m of out) m.pct = m.dmg / den;
    return out.sort((a, b) => b.dmg - a.dmg);
  }

  function dps10() {
    if (!run || run.ringN < 2) return 0;
    const newest = (run.ringI - 1 + RING) % RING;
    const tNow = run.ringT[newest], dNow = run.ringD[newest];
    let oi = newest;
    for (let k = 1; k < run.ringN; k++) {
      const j = (newest - k + RING) % RING;
      oi = j;
      if (tNow - run.ringT[j] >= 10) break;
    }
    const dt = tNow - run.ringT[oi];
    return dt > 0.5 ? (dNow - run.ringD[oi]) / dt : 0;
  }

  // Foto de la partida en curso (null si no hay partida).
  function current() {
    if (!run) return null;
    const p = run.player, dmg = p.dmgDealt || 0;
    return {
      active: true,
      at: run.at,
      time: run.time,
      mon: run.mon, dex: run.dex, shiny: run.shiny, coop: run.coop,
      level: p.level || 0,
      kills: p.kills || 0,
      hp: p.hp, maxHp: p.maxHp, dead: !!p.dead,
      dmg,
      dps: dmg / Math.max(1, run.time),
      dps10: dps10(),
      moves: moveList(),
      taken: run.taken,
      sources: [...run.bySrc].map(([name, d]) => ({ name, dmg: d })).sort((a, b) => b.dmg - a.dmg),
      hits: run.hits.slice(),
      killer: run.killer,
      series: { step: run.step, dmg: run.sDmg.slice(), hp: run.sHp.slice(), kills: run.sKills.slice() },
      recentHp: run.recentHp.slice(),
      kpm: run.kpm.slice(),
    };
  }

  function endRun(p, st) {
    if (!run || run.player !== p) return;
    try {
      tick();
      sample(p);
      const snap = current();
      const outcome = p.dead || run.killer ? 'death' : st === 'over' ? 'over' : 'quit';
      // Último minuto incompleto, escalado a bajas por minuto.
      const kpm = snap.kpm.slice();
      const restSec = run.time - run.kpmMin * 60;
      if (restSec >= 15 && kpm.length < 60) kpm.push(Math.round(((p.kills || 0) - run.kpmBase) * 60 / restSec));
      const summary = {
        v: 1,
        at: run.at,
        mon: run.mon, dex: run.dex, shiny: run.shiny, coop: run.coop,
        time: Math.round(run.time),
        level: Math.max(run.peakLevel, p.level || 0),
        kills: p.kills || 0,
        dmg: Math.round(snap.dmg),
        dps: Math.round(snap.dmg / Math.max(1, run.time)),
        taken: Math.round(run.taken),
        outcome,
        killer: run.killer ? run.killer.name : null,
        killerHow: run.killer ? run.killer.how : null,
        moves: snap.moves.slice(0, 5).map((m) => ({ name: m.name, dmg: Math.round(m.dmg) })),
        series: { step: snap.series.step, dmg: snap.series.dmg, hp: snap.series.hp },
        kpm,
      };
      const keep = outcome !== 'quit' || run.time >= 60;
      if (keep) {
        const h = loadHist();
        h.unshift(summary);
        if (h.length > MAX_RUNS) h.length = MAX_RUNS;
        NX.store.set(RUNS_KEY, h);
      }
      last = Object.assign({}, summary, {
        saved: keep,
        endedAt: Date.now(),
        hits: snap.hits,
        sources: snap.sources.slice(0, 6),
        recentHp: snap.recentHp,
        killerInfo: run.killer,
      });
      run = null;
      emit('runEnd', last);
    } catch (err) {
      run = null;
      NX.trip(KEY, err);
    }
  }

  NX.telemetry = {
    on(ev, fn) { if (subs[ev] && typeof fn === 'function') subs[ev].push(fn); },
    off(ev, fn) { if (subs[ev]) { const i = subs[ev].indexOf(fn); if (i >= 0) subs[ev].splice(i, 1); } },
    current,
    history: () => loadHist().slice(),
    last: () => last,
    clearHistory() { hist = []; NX.store.set(RUNS_KEY, []); },
    typeName: (t) => TYPES[t] || t || '',
  };

  NX.feature({
    key: KEY,
    label: 'Telemetría de partida',
    needs: (ns) => ns.Game && ns.Player && ns.Player.prototype && typeof ns.Player.prototype.hurt === 'function' &&
      ns.Enemy && ns.Enemy.prototype && typeof ns.Enemy.prototype.update === 'function' && ns.Projectiles && typeof ns.Projectiles.spawn === 'function',
    setup(ns) {
      const PP = ns.Player.prototype, EP = ns.Enemy.prototype;

      // Daño recibido: vida antes y después, así cuentan defensas, esquivas y bandas.
      const hurt = PP.hurt;
      PP.hurt = function (dmg, type) {
        if (!on || !run || this !== run.player) return hurt.apply(this, arguments);
        const st = striker && performance.now() - strikeT < 4 ? striker : null;
        striker = null;
        const before = this.hp, wasDead = !!this.dead;
        const r = hurt.apply(this, arguments);
        try {
          const lost = before - this.hp;
          if (lost > 0) record(this, lost, st, dmg, type, wasDead);
        } catch (err) { NX.trip(KEY, err); }
        return r;
      };

      // Quién actúa: cada enemigo durante su update y sus ataques.
      for (const m of ['update', 'shoot', 'bossCast', 'special', 'hazard', 'summon']) wrapEnemy(EP, m, false);
      wrapEnemy(EP, 'strike', true);
      // Lo que crean los enemigos queda marcado con su autor.
      wrapTag(ns.Projectiles, 'spawn');
      wrapTag(ns.Hazards, 'add');
      // Daño que no viene de un enemigo concreto.
      wrapZone(ns.Hazards, 'update', 'haz');
      wrapZone(ns.Interact, 'update', 'Trampa');
      wrapZone(ns.Judgment, 'update', 'El Juicio');
      wrapZone(ns.Events, 'update', 'Evento');
      wrapZone(ns.Rift, 'update', 'Grieta');
      wrapZone(PP, 'update', 'Terreno');

      NX.runs.on('start', (p) => { if (NX.isOn(KEY)) { try { newRun(p); } catch (err) { NX.trip(KEY, err); } } });
      NX.runs.on('end', endRun);
      // Si el módulo arrancó con una partida ya en marcha.
      const cur = NX.runs.current();
      if (cur && NX.isOn(KEY)) newRun(cur);

      setInterval(() => { try { tick(); } catch (err) { NX.trip(KEY, err); } }, TICK_MS);
    },
  });

  NX.settings.section({
    key: KEY,
    tab: 'Datos',
    title: 'Telemetría de partida',
    keywords: 'historial daño estadísticas exportar',
    render(el) {
      el.appendChild(NX.ui.toggle('Activado', 'on:' + KEY, true));
      el.appendChild(NX.ui.note('Registra daño, bajas y golpes recibidos de cada partida. Lo usan el medidor, el historial y la autopsia. Guarda las últimas 50 partidas en este navegador.'));
      el.appendChild(NX.ui.button('Exportar historial (JSON)', () => {
        NX.download('nexus-historial.json', JSON.stringify(loadHist(), null, 1), 'application/json');
      }));
      const del = NX.ui.button('Borrar historial', () => {
        if (del.dataset.armed) { NX.telemetry.clearHistory(); del.textContent = 'Historial borrado'; delete del.dataset.armed; return; }
        del.dataset.armed = '1';
        del.textContent = 'Pulsa otra vez para confirmar';
      });
      el.appendChild(del);
    },
  });
})();
