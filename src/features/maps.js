// Mapas con forma y mazmorra, como modo de NX.modes ("Mapas").
//  - Arena: círculo cerrado con World.setArena (radio de 28 tiles o más) y
//    el tema que elijas.
//  - Islas: arena con charcos muy altos, que deja islas de suelo entre el agua.
//  - Mazmorra por salas: salas de arena sucesivas con otro tema en cada una.
//    Al cumplir la meta de la sala (sobrevivir o derrotar enemigos) se limpia,
//    eliges una recompensa y aparece un portal hacia la siguiente. La última
//    sala de cada piso trae un jefe. Récord de salas y pisos.
// Los enemigos que aparecen o se recolocan fuera del muro vuelven adentro
// (EnemyMgr.add vía onAdd del modo, Spawner.ahead y un barrido periódico).
// Los ganchos propios (Spawner.ahead, Events.update, Tiles.runBiome) se
// instalan una vez y pasan de largo sin una partida de este modo; al terminar
// se suelta la arena y el motor de modos recorta los jefes añadidos.
(() => {
  const KEY = 'maps';
  const FAR = 1e9;
  const BEST_KEY = 'maps:best';
  const ROOM_GAP = 400; // tiles entre salas: cada una genera terreno nuevo
  const KIND_TXT = { arena: 'Arena', islands: 'Islas', dungeon: 'Mazmorra' };
  const REWARDS = {
    heal: { name: 'Curación', note: '50 % de vida', col: '#5fe08a' },
    card: { name: 'Carta de mejora', note: 'sube un nivel', col: '#ffd23f' },
    fury: { name: 'Furia', note: '+25 % ataque 90 s', col: '#ff6a4a' },
    haste: { name: 'Prisa', note: '+20 % velocidad 90 s', col: '#7fe0ff' },
    coins: { name: 'Bolsa de monedas', note: 'monedas extra', col: '#ffb43f' },
  };

  let ns = null;
  const opt = (k, d) => NX.store.get('maps:' + k, d);
  const mine = () => { const c = NX.modes && NX.modes.ctx && NX.modes.ctx(); return c && c.key === KEY ? c : null; };
  const best = () => NX.store.get(BEST_KEY, {}) || {};
  const nowT = () => (ns.Game.st && ns.Game.st.time) || 0;
  const say = (t, d = 2.4) => { try { ns.Spawner.say(t, d, true); } catch (_) { NX.toast(t); } };
  const sfx = (n) => { try { ns.Audio.sfx(n); } catch (_) { /* silencio */ } };

  // ---------------------------------------------------------------- temas
  // Estilo de sala: tipo de arena (forma: charcos, pilares, adornos) y bioma (colores y líquido).
  function styles(filter) {
    const T = ns.Tiles, out = [];
    for (const type of T.ARENA_TYPES) {
      if (type === 'judgment') continue;
      const th = T.ARENA_THEMES[type];
      const bi = T.arenaBiome(type);
      const b = T.BIOMES[bi];
      if (!th || !b) continue;
      out.push({ id: type, name: th.name || type, type, biome: bi, liquid: b.liquid });
    }
    const B = NX.biomes;
    if (B && B.active()) {
      for (const n of B.names()) {
        const d = B.def(n), i = B.index(n);
        if (d && i >= 0 && T.ARENA_THEMES[d.theme]) out.push({ id: 'nx:' + n, name: n, type: d.theme, biome: i, liquid: d.liquid, nx: true });
      }
    }
    return filter ? out.filter(filter) : out;
  }
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  function themeFor(type, over) {
    const T = ns.Tiles;
    const base = T.ARENA_THEMES[type] || T.ARENA_THEMES.normal;
    return Object.assign(JSON.parse(JSON.stringify(base)), over || {});
  }

  // ---------------------------------------------------------------- arena
  const TS = () => ns.World.TS || 32;
  function freeAt(x, y, r = 14) {
    const W = ns.World;
    return W.kindAt(x, y) === 'floor' && (!W.isFree || W.isFree(x, y, r));
  }
  // Suelo libre más cercano a (x, y), en espiral.
  function findFloor(x, y, maxTiles = 12) {
    const s = TS();
    if (freeAt(x, y, 16)) return [x, y];
    for (let d = 1; d <= maxTiles; d++) {
      for (let k = 0; k < 8 * d; k++) {
        const a = (k / (8 * d)) * Math.PI * 2;
        const px = x + Math.cos(a) * d * s, py = y + Math.sin(a) * d * s;
        if (freeAt(px, py, 16)) return [px, py];
      }
    }
    return null;
  }

  function openArena(c, style, r, over) {
    const W = ns.World, s = TS();
    c.roomN = (c.roomN || 0) + 1;
    const tx = c.baseTx + (c.roomN - 1) * ROOM_GAP, ty = c.baseTy;
    const a = { tx, ty, r, type: style.type };
    W.setArena(a);
    a.th = themeFor(style.type, over); // setArena deja el tema en a.th: se sustituye antes de generar terreno
    c.arena = a;
    c.cx = tx * s + s / 2;
    c.cy = ty * s + s / 2;
    c.R = r * s;
    c.style = style;
    c.biomeLock = style.biome;
    W.setBiome(style.biome, true);
    const at = findFloor(c.cx, c.cy + 3 * s) || findFloor(c.cx, c.cy, r - 2) || [c.cx, c.cy];
    const all = typeof ns.Game.everyone === 'function' ? ns.Game.everyone() : [ns.Game.player];
    all.forEach((pl, i) => { pl.x = at[0] + 34 * (i - (all.length - 1) / 2); pl.y = at[1]; });
    ns.Camera.x = at[0];
    ns.Camera.y = at[1];
    const wx = a.th && a.th.weather;
    try { if (ns.Weather && ns.Weather.clear) ns.Weather.clear(); if (wx && opt('weather', true)) ns.Weather.force(wx, 135); } catch (_) { /* nada */ }
  }

  const outside = (c, e, margin = 1.5) => Math.hypot(e.x - c.cx, e.y - c.cy) > c.R - margin * TS();
  // Recoloca un enemigo dentro del muro, lejos del jugador.
  function relocate(c, e) {
    const W = ns.World, p = c.player, s = TS();
    const minD = Math.min(260, c.R * 0.45);
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * Math.PI * 2;
      const rr = c.R * (0.25 + 0.65 * Math.sqrt(Math.random())) - s;
      const x = c.cx + Math.cos(a) * rr, y = c.cy + Math.sin(a) * rr;
      if (p && Math.hypot(x - p.x, y - p.y) < minD) continue;
      const k = W.kindAt(x, y);
      if (k === 'wall' || (k === 'liquid' && !e.flying)) continue;
      if (W.isFree && !W.isFree(x, y, Math.min(20, e.r || 12), !!e.flying)) continue;
      e.x = x; e.y = y;
      e.kx = e.ky = 0;
      if ('jump' in e) e.jump = null;
      if ('jumpLift' in e) e.jumpLift = 0;
      return true;
    }
    return false;
  }

  // ---------------------------------------------------------------- mazmorra
  function roomGoal(c) {
    const f = c.floor - 1, r = c.room;
    return { time: 35 + 5 * r + 5 * f, kills: 14 + 6 * r + 6 * f };
  }
  const bossRoom = (c) => c.room >= c.rooms;

  function scheduleBoss(c) {
    const B = ns.Enemies.BOSSES, L = c.bossList;
    if (!Array.isArray(B) || !L || !L.length) return;
    const i = Math.min(c.floor - 1, L.length - 1);
    const extra = c.floor > L.length ? 1 + 0.6 * (c.floor - L.length) : 1;
    const b = Object.assign({}, L[i], { at: nowT() + 3 });
    b.hp = Math.round(b.hp * extra);
    b.dmg = Math.round(b.dmg * Math.sqrt(extra));
    const k = c.bossSpawned;
    while (B.length < k) B.push(Object.assign({}, L[L.length - 1], { at: 0, nxDone: true })); // huecos ya superados
    B[k] = b;
    c.bossName = b.name || '';
    try { ns.Sprites.preload([b.dex]); } catch (_) { /* nada */ }
  }

  function openRoom(c) {
    try { ns.EnemyMgr.clear(); } catch (_) { /* nada */ }
    try { ns.Projectiles.clear(); } catch (_) { /* nada */ }
    try { if (ns.Hazards) ns.Hazards.clear(); } catch (_) { /* nada */ }
    try { if (ns.Combat && ns.Combat.clearFields) ns.Combat.clearFields(); } catch (_) { /* nada */ }
    try { ns.Pickups.clear(); } catch (_) { /* nada */ }
    try { if (NX.terrains) NX.terrains.clear(); if (NX.mapPickups) NX.mapPickups.clear(); } catch (_) { /* nada */ }
    const pool = styles((st) => st.id !== (c.style && c.style.id) && st.liquid !== 'lava');
    const lava = styles((st) => st.id !== (c.style && c.style.id));
    // Lava solo de vez en cuando: daña al pisarla.
    const style = Math.random() < 0.2 ? pick(lava) : pick(pool.length ? pool : lava);
    const boss = bossRoom(c);
    openArena(c, style, boss ? 30 : 24);
    c.phase = 'fight';
    c.roomT0 = nowT();
    c.kills0 = c.player.kills || 0;
    c.rewards = null;
    c.portal = null;
    c.boss = null;
    c.noSpawner = false;
    c.spawnK = boss ? 0.35 : 1 + 0.12 * (c.floor - 1);
    if (boss) scheduleBoss(c);
    say(`Piso ${c.floor} · Sala ${c.room}/${c.rooms} · ${style.name}${boss ? ' · ¡Jefe!' : ''}`, 2.6);
    sfx('rift');
  }

  function roomCleared(c) {
    c.phase = 'reward';
    c.noSpawner = true;
    c.cleared++;
    const p = c.player;
    // Lo que queda en la sala cae de una vez y la experiencia viene sola.
    for (const e of ns.EnemyMgr.all()) {
      if (e.dead || e.arceus || e.remote) continue;
      try { e.hurt((e.maxHp || 100) * 4 + (e.shield || 0) + 50, 'normal', e.x - p.x, e.y - p.y, 120); } catch (_) { /* nada */ }
    }
    setTimeout(() => { try { if (mine() === c) ns.Pickups.pullAll(); } catch (_) { /* nada */ } }, 300);
    try { ns.FX.ring(p.x, p.y, 10, 600, '#ffd23f', 0.7, 5); } catch (_) { /* nada */ }
    sfx('legend');
    const keys = Object.keys(REWARDS).sort(() => Math.random() - 0.5);
    let three = keys.slice(0, 3);
    if (p.hp < p.maxHp * 0.5 && !three.includes('heal')) three = ['heal', ...three.slice(0, 2)];
    const s = TS();
    c.rewards = three.map((k, i) => {
      const a = Math.PI / 2 + (i - 1) * 0.9;
      const at = findFloor(p.x + Math.cos(a) * 3.4 * s, p.y + Math.sin(a) * 3.4 * s, 5) || [p.x + (i - 1) * 60, p.y - 90];
      return { kind: k, x: at[0], y: at[1] };
    });
    say(bossRoom(c) ? `¡Piso ${c.floor} superado! Elige una recompensa` : '¡Sala superada! Elige una recompensa', 2.8);
  }

  function takeReward(c, rw) {
    const p = c.player;
    if (rw.kind === 'heal') { try { p.heal(p.maxHp * 0.5); } catch (_) { /* nada */ } }
    else if (rw.kind === 'card') { try { ns.Game.debugLevelUp(); } catch (_) { /* nada */ } }
    else if (rw.kind === 'fury') { try { p.addBuff('atk', 0.25, 90, 1); } catch (_) { /* nada */ } }
    else if (rw.kind === 'haste') { try { p.addBuff('spd', 0.2, 90, 1); } catch (_) { /* nada */ } }
    else if (rw.kind === 'coins') { p.coins = (p.coins || 0) + 15 + 10 * c.floor; }
    sfx('confirm');
    NX.toast('Recompensa: ' + REWARDS[rw.kind].name);
    c.rewards = null;
    c.phase = 'portal';
    const at = findFloor(c.cx, c.cy, 10) || findFloor(p.x, p.y - 4 * TS(), 6) || [p.x, p.y - 120];
    if (Math.hypot(at[0] - p.x, at[1] - p.y) < 90) {
      const alt = findFloor(p.x, p.y - 4 * TS(), 6);
      if (alt) { at[0] = alt[0]; at[1] = alt[1]; }
    }
    c.portal = { x: at[0], y: at[1], t0: performance.now() };
    say('Se abrió un portal: entra para seguir', 2.2);
  }

  function enterPortal(c) {
    c.portal = null;
    if (bossRoom(c)) {
      c.floor++;
      c.room = 1;
    } else c.room++;
    openRoom(c);
  }

  function dungeonTick(c, p) {
    const t = nowT();
    if (c.phase === 'fight') {
      if (bossRoom(c)) {
        if (c.boss && (c.boss.dead || !ns.EnemyMgr.all().includes(c.boss))) roomCleared(c);
        return;
      }
      const g = roomGoal(c);
      const kills = (p.kills || 0) - c.kills0;
      if (t - c.roomT0 >= g.time || kills >= g.kills) roomCleared(c);
    } else if (c.phase === 'reward' && c.rewards && !p.dead) {
      for (const rw of c.rewards) {
        if (Math.hypot(p.x - rw.x, p.y - rw.y) <= (p.r || 14) + 18) { takeReward(c, rw); break; }
      }
    } else if (c.phase === 'portal' && c.portal && !p.dead && ns.Game.state === 'playing') {
      if (Math.hypot(p.x - c.portal.x, p.y - c.portal.y) <= (p.r || 14) + 20) enterPortal(c);
    }
  }

  // ---------------------------------------------------------------- configuración de partida
  function cfg(kind) {
    const s = { key: KEY, label: KIND_TXT[kind] || 'Mapas', tags: [], mapKind: kind, noRift: true, noJudge: true, noEvents: true };
    s.onStart = (n, p, c) => {
      const T = TS();
      c.player = p;
      c.baseTx = Math.floor(p.x / T);
      c.baseTy = Math.floor(p.y / T);
      c.cleared = 0;
      if (kind === 'arena') {
        const sel = String(opt('theme', 'random'));
        const all = styles((st) => st.liquid !== 'lava');
        const st = styles().find((x) => x.id === sel) || pick(all);
        const r = NX.clamp(+opt('r', 32) || 32, 28, 44);
        openArena(c, st, r);
        c.tags = [st.name];
      } else if (kind === 'islands') {
        // Temas de agua clara, para que las islas se lean bien.
        const CLEAR = ['water', 'normal', 'grass', 'flying', 'fairy', 'psychic', 'bug', 'nx:Torre Fantasma'];
        const wet = styles((st) => st.liquid === 'water' && CLEAR.includes(st.id));
        const st = pick(wet.length ? wet : styles());
        const r = NX.clamp(+opt('ir', 36) || 36, 30, 48);
        openArena(c, st, r, { pools: 0.55, pillars: 0.008, props: { tree: 0.02, grass: 0.04 } });
        c.tags = [st.name];
      } else {
        c.floor = 1;
        c.room = 1;
        c.rooms = NX.clamp(+opt('rooms', 4) || 4, 3, 6);
        c.bossSpawned = 0;
        const B = ns.Enemies.BOSSES;
        c.bossList = Array.isArray(B) ? B.map((b) => Object.assign({}, b)) : [];
        if (Array.isArray(B)) B.length = 0; // los jefes solo salen en la última sala (la lista es de esta partida)
        c.bossLen0 = 0;
        openRoom(c);
      }
    };
    s.onAdd = (e, n, c) => {
      if (c.arena && outside(c, e, 1)) relocate(c, e);
      if (c.mapKind === 'dungeon' && e.boss && !e.legend && !e.arceus && !e.nxDummy) {
        c.bossSpawned++;
        if (bossRoom(c) && c.phase === 'fight') c.boss = e;
      }
    };
    s.onTick = (n, p, c) => {
      if (!c.arena) return;
      for (const e of ns.EnemyMgr.all()) if (!e.dead && outside(c, e, 0.5)) relocate(c, e);
      if (c.mapKind === 'dungeon') dungeonTick(c, p);
    };
    s.pillExtra = (n, c) => {
      if (c.mapKind !== 'dungeon') return '';
      const head = `Piso ${c.floor} · Sala ${c.room}/${c.rooms}`;
      if (c.phase === 'reward') return head + ' · Elige recompensa';
      if (c.phase === 'portal') return head + ' · Entra al portal';
      if (bossRoom(c)) return head + ' · Jefe' + (c.bossName ? ': ' + c.bossName : '');
      const g = roomGoal(c);
      const left = Math.max(0, g.time - (nowT() - c.roomT0));
      const kills = Math.max(0, (c.player.kills || 0) - c.kills0);
      return `${head} · ${NX.fmtTime(left)} o ${kills}/${g.kills} bajas`;
    };
    s.onEnd = (n, p, c, info) => {
      try { if (ns.World.arena === c.arena) ns.World.setArena(null); } catch (_) { /* nada */ }
      c.rewards = null;
      c.portal = null;
      const b = best();
      let line = `<b>${NX.esc(KIND_TXT[kind])}</b> · fuera del ranking`;
      if (kind === 'dungeon') {
        const prev = b.dungeon;
        const beat = !prev || c.cleared > prev.rooms;
        if (beat && c.cleared > 0) { b.dungeon = { rooms: c.cleared, floor: c.floor, room: c.room, time: info.time, mon: info.mon, at: Date.now() }; NX.store.set(BEST_KEY, b); }
        line += `<br>Piso ${c.floor}, sala ${c.room} · ${c.cleared} salas superadas` +
          (beat && c.cleared > 0 ? ' · <b style="color:#ffe27a">¡Nuevo récord!</b>' : prev ? ` · récord ${prev.rooms} salas` : '');
      } else {
        const prev = b[kind];
        const beat = !prev || info.time > prev.time;
        if (beat) { b[kind] = { time: info.time, level: info.level, mon: info.mon, at: Date.now() }; NX.store.set(BEST_KEY, b); }
        line += `<br>Sobreviviste ${NX.fmtTime(info.time)}` + (beat ? ' · <b style="color:#ffe27a">¡Nuevo récord!</b>' : ` · récord ${NX.fmtTime(prev.time)}`);
      }
      return line;
    };
    return s;
  }

  // ---------------------------------------------------------------- dibujo
  const PORTAL = ['#2a1458', '#5b2fd0', '#8a5cf0', '#c9b8ff', '#ffffff'];
  function drawReward(g, rw, S, ms, i) {
    const R = REWARDS[rw.kind];
    const [x, y] = NX.toScreen(rw.x, rw.y);
    const bob = Math.sin(ms / 260 + i) * 3 * S;
    const u = Math.max(2, Math.round(2 * S));
    g.fillStyle = 'rgba(0,0,0,.3)';
    g.beginPath(); g.ellipse(x, y + 4 * S, 12 * S, 4 * S, 0, 0, Math.PI * 2); g.fill();
    // Pedestal y gema pixelada.
    g.fillStyle = '#0b1838'; g.fillRect(Math.round(x - 7 * u), Math.round(y - u), 14 * u, 3 * u);
    g.fillStyle = '#8a93b8'; g.fillRect(Math.round(x - 6 * u), Math.round(y - u + 1), 12 * u, 2 * u - 1);
    const cy = Math.round(y - 9 * S + bob);
    g.globalAlpha = 0.35 + 0.2 * Math.sin(ms / 200 + i);
    g.fillStyle = R.col; g.beginPath(); g.arc(x, cy, 12 * S, 0, Math.PI * 2); g.fill();
    g.globalAlpha = 1;
    const gem = ['..x..', '.xXx.', 'xXXXx', '.xXx.', '..x..'];
    for (let j = 0; j < 5; j++) for (let k = 0; k < 5; k++) {
      const ch = gem[j][k];
      if (ch === '.') continue;
      g.fillStyle = '#0b1838'; g.fillRect(Math.round(x + (k - 2.5) * u) - 1, cy + (j - 2.5) * u - 1, u + 2, u + 2);
    }
    for (let j = 0; j < 5; j++) for (let k = 0; k < 5; k++) {
      const ch = gem[j][k];
      if (ch === '.') continue;
      g.fillStyle = ch === 'X' ? R.col : '#ffffff';
      g.fillRect(Math.round(x + (k - 2.5) * u), cy + (j - 2.5) * u, u, u);
    }
    g.font = `${Math.round(12 * Math.min(1.35, S))}px Pixelify, system-ui, sans-serif`;
    g.textAlign = 'center';
    g.lineWidth = 3; g.strokeStyle = '#0b1838';
    g.strokeText(R.name, x, cy - 16 * S); g.fillStyle = R.col; g.fillText(R.name, x, cy - 16 * S);
    g.font = `${Math.round(10 * Math.min(1.35, S))}px Pixelify, system-ui, sans-serif`;
    g.strokeText(R.note, x, y + 16 * S); g.fillStyle = '#ffffff'; g.fillText(R.note, x, y + 16 * S);
  }
  function drawPortal(g, pt, S, ms) {
    const [x, y] = NX.toScreen(pt.x, pt.y);
    const grow = Math.min(1, (ms - pt.t0) / 500);
    const u = Math.max(2, Math.round(2 * S));
    const rx = 22 * S * grow, ry = 30 * S * grow;
    for (let k = PORTAL.length - 1; k >= 0; k--) {
      const f = (k + 1) / PORTAL.length;
      g.fillStyle = PORTAL[PORTAL.length - 1 - k];
      const w = Math.round(rx * f), h = Math.round(ry * f);
      for (let yy = -h; yy <= h; yy += u) {
        const half = Math.round(w * Math.sqrt(Math.max(0, 1 - (yy * yy) / (h * h || 1))) / u) * u;
        g.fillRect(Math.round(x - half), Math.round(y - ry + yy), half * 2, u);
      }
    }
    // Chispas que giran.
    for (let i = 0; i < 6; i++) {
      const a = ms / 400 + (i * Math.PI) / 3;
      g.fillStyle = i % 2 ? '#ffd23f' : '#ffffff';
      g.fillRect(Math.round(x + Math.cos(a) * rx * 1.15), Math.round(y - ry + Math.sin(a) * ry * 1.15), u, u);
    }
    g.font = `${Math.round(12 * Math.min(1.35, S))}px Pixelify, system-ui, sans-serif`;
    g.textAlign = 'center';
    g.lineWidth = 3; g.strokeStyle = '#0b1838';
    g.strokeText('Portal', x, y - ry * 2 - 6); g.fillStyle = '#d9c8ff'; g.fillText('Portal', x, y - ry * 2 - 6);
  }
  function edgeArrow(g, sx, sy, w, h, col) {
    const cx = w / 2, cy = h / 2, dx = sx - cx, dy = sy - cy;
    const k = Math.min((w / 2 - 30) / Math.abs(dx || 1e-6), (h / 2 - 30) / Math.abs(dy || 1e-6));
    g.save();
    g.translate(Math.round(cx + dx * k), Math.round(cy + dy * k));
    g.rotate(Math.atan2(dy, dx));
    g.fillStyle = '#0b1838';
    g.beginPath(); g.moveTo(13, 0); g.lineTo(-8, -10); g.lineTo(-8, 10); g.closePath(); g.fill();
    g.fillStyle = col;
    g.beginPath(); g.moveTo(9, 0); g.lineTo(-5, -7); g.lineTo(-5, 7); g.closePath(); g.fill();
    g.restore();
  }
  function draw(g, w, h) {
    const c = mine();
    if (!c || c.mapKind !== 'dungeon' || !NX.inRun()) return;
    const S = ns.Camera.scale || 1, ms = performance.now();
    const off = (x, y) => x < -30 || y < -30 || x > w + 30 || y > h + 30;
    if (c.rewards) c.rewards.forEach((rw, i) => drawReward(g, rw, S, ms, i));
    if (c.portal) {
      const [x, y] = NX.toScreen(c.portal.x, c.portal.y);
      if (off(x, y)) edgeArrow(g, x, y, w, h, '#8a5cf0'); else drawPortal(g, c.portal, S, ms);
    }
  }

  NX.mapMarkers = NX.mapMarkers || [];
  NX.mapMarkers.push({
    key: KEY,
    list: () => {
      const c = mine();
      if (!c || c.mapKind !== 'dungeon') return [];
      const out = [];
      if (c.portal) out.push({ x: c.portal.x, y: c.portal.y, color: '#8a5cf0', shape: 'portal', label: 'Portal' });
      if (c.rewards) for (const rw of c.rewards) out.push({ x: rw.x, y: rw.y, color: REWARDS[rw.kind].col, shape: 'item', label: REWARDS[rw.kind].name });
      return out;
    },
  });

  // ---------------------------------------------------------------- ganchos
  function hook() {
    const SP = ns.Spawner, T = ns.Tiles, EV = ns.Events;
    const ahead = SP.ahead;
    SP.ahead = function (e) {
      const r = ahead.apply(this, arguments);
      const c = mine();
      if (r && c && c.arena && e && outside(c, e, 1)) return relocate(c, e);
      return r;
    };
    const rb = T.runBiome;
    T.runBiome = function () {
      const c = mine();
      if (c && c.biomeLock != null) return c.biomeLock;
      return rb.apply(this, arguments);
    };
    if (EV && typeof EV.update === 'function') {
      const eu = EV.update;
      EV.update = function () {
        const c = mine();
        if (c && c.noEvents) return undefined;
        return eu.apply(this, arguments);
      };
    }
  }

  // ---------------------------------------------------------------- selector
  function records(el, h) {
    const b = best();
    const items = [
      ['Arena', b.arena ? NX.fmtTime(b.arena.time) + (b.arena.mon ? ' · ' + b.arena.mon : '') : '·'],
      ['Islas', b.islands ? NX.fmtTime(b.islands.time) + (b.islands.mon ? ' · ' + b.islands.mon : '') : '·'],
      ['Mazmorra', b.dungeon ? `${b.dungeon.rooms} salas · piso ${b.dungeon.floor}` : '·'],
    ];
    if (h) h.cards(el, items);
    else el.appendChild(NX.ui.note(items.map(([k, v]) => k + ': ' + v).join(' · ')));
  }

  function render(el, h) {
    const kind = String(opt('kind', 'arena'));
    h.desc(el, 'Mapas con forma: una arena cerrada, un archipiélago de islas o una mazmorra de salas con portal, recompensas y jefe al final de cada piso. Sin grietas, sin Juicio y fuera del ranking.');
    records(el, h);
    el.appendChild(NX.ui.select('Mapa', 'maps:kind', [['arena', 'Arena'], ['islands', 'Islas'], ['dungeon', 'Mazmorra por salas']], 'arena', () => h.rerender()));
    if (kind === 'arena') {
      const list = styles((st) => st.liquid !== 'lava');
      el.appendChild(NX.ui.select('Tema', 'maps:theme', [['random', 'Al azar'], ...styles().map((st) => [st.id, st.name])], 'random'));
      el.appendChild(NX.ui.range('Radio', 'maps:r', 28, 44, 1, 32, (v) => v + ' tiles'));
      el.appendChild(NX.ui.note(`Círculo cerrado por un muro. ${list.length} temas disponibles; los enemigos siempre aparecen dentro.`));
    } else if (kind === 'islands') {
      el.appendChild(NX.ui.range('Radio', 'maps:ir', 30, 48, 1, 36, (v) => v + ' tiles'));
      el.appendChild(NX.ui.note('Arena llena de agua con islas de suelo. El agua te frena: elige bien por dónde cruzar.'));
    } else {
      el.appendChild(NX.ui.range('Salas por piso (la última con jefe)', 'maps:rooms', 3, 6, 1, 4, (v) => String(v)));
      el.appendChild(NX.ui.note('Cada sala tiene una meta: sobrevivir el tiempo o derrotar a cierto número de enemigos. Al cumplirla eliges una recompensa y aparece el portal.'));
    }
    el.appendChild(NX.ui.toggle('Clima del tema', 'maps:weather', true));
    h.foot(el, 'Jugar ' + (KIND_TXT[kind] || 'Mapa'), () => NX.modes.launch(cfg(kind)));
  }

  NX.maps = {
    // Atajos de prueba desde la consola: NX.maps.launch('dungeon').
    launch: (kind) => NX.modes.launch(cfg(kind)),
    ctx: () => mine(),
    clearRoom: () => { const c = mine(); if (c && c.mapKind === 'dungeon' && c.phase === 'fight') roomCleared(c); },
  };

  NX.hudLayers.push({ key: KEY, under: draw });

  NX.feature({
    key: KEY,
    label: 'Mapas con forma',
    needs: (n) => !!NX.modes && n.World && typeof n.World.setArena === 'function' && typeof n.World.kindAt === 'function' &&
      n.Tiles && n.Tiles.ARENA_THEMES && Array.isArray(n.Tiles.ARENA_TYPES) && typeof n.Tiles.arenaBiome === 'function' &&
      n.Spawner && typeof n.Spawner.ahead === 'function' && n.EnemyMgr && typeof n.EnemyMgr.clear === 'function' &&
      n.Enemies && Array.isArray(n.Enemies.BOSSES) && n.Camera && typeof n.Game.debugLevelUp === 'function',
    setup(n) {
      ns = n;
      hook();
      NX.modes.register({ key: KEY, title: 'Mapas', order: 6, render });
    },
  });

  NX.settings.section({
    key: KEY,
    tab: 'Modos',
    title: 'Mapas con forma y mazmorra',
    keywords: 'mapas arena islas mazmorra salas portal jefe piso récord',
    render(el) {
      el.appendChild(NX.ui.toggle('Activado', 'on:' + KEY, true));
      el.appendChild(NX.ui.note('Añade la pestaña Mapas en Modos Nexus: Arena, Islas y Mazmorra por salas.'));
      records(el, null);
      el.appendChild(NX.ui.button('Abrir Mapas', () => {
        if (!NX.modes || !NX.modes.canPlay()) { NX.toast('Abre los modos desde el menú principal'); return; }
        NX.togglePanel();
        NX.modes.open(KEY);
      }));
      el.appendChild(NX.ui.button('Borrar récords', () => { NX.store.set(BEST_KEY, {}); NX.toast('Récords de mapas borrados'); }));
    },
  });
})();
