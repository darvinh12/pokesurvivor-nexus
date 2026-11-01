// Interacción con el mapa:
// - Botín extra al romper objetos. World.damageProp devuelve true cuando el
//   objeto se rompe; el juego ya suelta cosas en ese momento (hierba: curación
//   5 % o moneda 6 %; roca: experiencia 40 %, monedas 25 %, curación 6 %;
//   calabaza y cofre siempre). Solo si el juego no soltó nada se tira un dado
//   propio: experiencia, una moneda, una ficha de la tienda (si la tienda de
//   Nexus está en la partida), una baya pequeña que cura un poco o, rara vez,
//   un objeto de NX.mapPickups. Los cofres y trampas (World.breakProp) quedan
//   como están.
// - Hierba y árboles que se mecen al pasar: envuelve World.drawProp, que el
//   juego llama ordenado por profundidad, y aplica un sesgo anclado en la base
//   con una oscilación amortiguada. Sin asignaciones por cuadro.
// - Puentes: el terreno sale de una función de closure (0 suelo, 1 muro, 2
//   líquido) y el líquido no bloquea, solo frena (agua, pantano), hace
//   resbalar (hielo) o quema (lava, veneno, chispas). Donde una franja de
//   líquido de 1 a 4 tiles corta el paso entre dos tiles de suelo se tiende un
//   puente de tablones (o de piedra sobre líquidos dañinos, opcional). Se
//   dibuja justo después del líquido (World.drawLiquid, debajo de objetos y
//   Pokémon) y World.isLiquid devuelve false sobre sus tiles, así que el
//   jugador cruza sin frenarse ni quemarse. Se calcula por trozos de 16×16
//   tiles alrededor del jugador y vale para todos los biomas, arenas, islas y
//   mazmorra; se recalcula al cambiar la semilla o la arena.
(() => {
  const KEY = 'mapint';
  const TS = 32, CH = 16;
  const BERRY_LIFE = 30, BERRY_MAX = 10;
  const CHANCE = { grass: 0.08, rock: 0.3, pumpkin: 0.2, chest: 0, bigchest: 0, trap: 0 };
  const SPACING = { 1: 12, 2: 8, 3: 5 };
  const HARM_LIQ = { lava: 1, poison: 1, spark: 1 };

  let ns = null, W = null;
  const opt = (k, d) => NX.store.get('mapint:' + k, d);
  const on = () => NX.isOn(KEY);
  const coop = () => !!(ns && ns.Coop && ns.Coop.active);
  const now = () => (ns && ns.Game && ns.Game.st && ns.Game.st.time) || 0;
  const fx = (fn, ...a) => { try { const f = ns.FX && ns.FX[fn]; if (f) f.apply(ns.FX, a); } catch (_) { /* nada */ } };
  const sfx = (n) => { try { ns.Audio.sfx(n); } catch (_) { /* silencio */ } };

  // Estado cacheado cada 100 ms para no consultar ajustes en cada cuadro.
  let swayOn = false, bridgesOn = false, curMe = null;

  // ------------------------------------------------------------------ botín
  let gameDrops = 0;
  const berries = [];
  const stats = { breaks: 0, gameDropped: 0, bonus: {} };

  function bonus(prop) {
    if (!NX.inRun() || coop() || opt('drops', true) === false) return;
    const base = CHANCE[prop.type] != null ? CHANCE[prop.type] : 0.18;
    const ch = base * NX.clamp(+opt('dropmul', 1) || 0, 0, 3);
    if (!ch || Math.random() >= ch) return;
    const shop = NX.shop && typeof NX.shop.give === 'function' && NX.isOn('shop') && NX.shop.chips;
    const rare = NX.mapPickups && typeof NX.mapPickups.spawn === 'function' && NX.isOn('pickups') && NX.mapPickups.list().length < 3;
    let tot = 40 + 24 + 16 + (shop ? 12 : 0) + (rare ? 3 : 0);
    let r = Math.random() * tot, kind;
    if ((r -= 40) < 0) kind = 'xp';
    else if ((r -= 24) < 0) kind = 'coin';
    else if ((r -= 16) < 0) kind = 'berry';
    else if (shop && (r -= 12) < 0) kind = 'chip';
    else kind = rare ? 'rare' : 'xp';
    const x = prop.x, y = prop.y;
    if (kind === 'xp') ns.Pickups.dropXp(x, y, Math.max(3, Math.round(4 + now() / 120)));
    else if (kind === 'coin') ns.Pickups.drop('coin', x, y, 1);
    else if (kind === 'chip') { NX.shop.give(1); fx('dmgText', x, y - 16, '+1 ficha', '#ffd23f'); }
    else if (kind === 'berry') {
      if (berries.length >= BERRY_MAX) berries.shift();
      berries.push({ x, y: y - 2, t0: now(), ph: Math.random() * 6 });
    } else if (kind === 'rare') {
      const it = NX.mapPickups.spawn(null, true);
      if (it) fx('dmgText', x, y - 16, '¡Objeto!', '#7fe0ff'); else ns.Pickups.drop('coin', x, y, 1);
    }
    stats.bonus[kind] = (stats.bonus[kind] || 0) + 1;
  }

  function tickBerries(p) {
    if (!berries.length) return;
    const t = now();
    for (let i = berries.length - 1; i >= 0; i--) {
      const b = berries[i];
      if (t - b.t0 > BERRY_LIFE || t < b.t0) { berries.splice(i, 1); continue; }
      if (!p || p.dead) continue;
      const reach = (p.r || 14) + 14;
      if ((p.x - b.x) ** 2 + (p.y - b.y) ** 2 > reach * reach) continue;
      berries.splice(i, 1);
      const pct = NX.clamp(+opt('berry', 8) || 8, 2, 20) / 100;
      const before = p.hp;
      try { p.heal(p.maxHp * pct); } catch (_) { /* nada */ }
      const got = Math.round((p.hp || 0) - (before || 0));
      fx('ring', b.x, b.y, 4, 34, '#5fe08a', 0.35, 2);
      if (got > 0) fx('dmgText', b.x, b.y - 14, '+' + got, '#5fe08a');
      sfx('select');
    }
  }

  const BERRY_ART = ['..gg..', '.gG...', 'rrrrr.', 'rRrrrr', 'rrrrrr', '.rrrr.'];
  const BERRY_PAL = { g: '#2f8f3a', G: '#5fe08a', r: '#c8324e', R: '#ff9aa8' };
  function drawBerries(g, w, h) {
    if (!berries.length || !NX.inRun()) return;
    const S = ns.Camera.scale || 1, u = Math.max(2, Math.round(1.6 * S)), t = now(), ms = performance.now();
    for (const b of berries) {
      if (BERRY_LIFE - (t - b.t0) < 6 && Math.sin(ms / 90) > 0.4) continue;
      const [sx, sy] = NX.toScreen(b.x, b.y);
      if (sx < -20 || sy < -20 || sx > w + 20 || sy > h + 20) continue;
      const bob = Math.sin(ms / 260 + b.ph) * 2 * S;
      g.fillStyle = 'rgba(0,0,0,.25)';
      g.beginPath(); g.ellipse(sx, sy + 3 * S, 6 * S, 2.2 * S, 0, 0, Math.PI * 2); g.fill();
      const x0 = Math.round(sx - 3 * u), y0 = Math.round(sy - 9 * S - 3 * u + bob);
      g.fillStyle = '#0b1838';
      for (let j = 0; j < 6; j++) for (let i = 0; i < 6; i++) if (BERRY_ART[j][i] !== '.') g.fillRect(x0 + i * u - 1, y0 + j * u - 1, u + 2, u + 2);
      for (let j = 0; j < 6; j++) for (let i = 0; i < 6; i++) { const c = BERRY_ART[j][i]; if (c !== '.') { g.fillStyle = BERRY_PAL[c]; g.fillRect(x0 + i * u, y0 + j * u, u, u); } }
    }
  }

  // ----------------------------------------------------------------- mecerse
  function swayDraw(od, self, args) {
    const ctx = args[0], prop = args[1], t = args[2];
    const grass = prop.type === 'grass';
    const p = curMe;
    if (p && p.walking) {
      const dx = prop.x - p.x, dy = prop.y - p.y, R = prop.r + (p.r || 14) + (grass ? 2 : 5);
      if (dx * dx + dy * dy < R * R && (!prop._nxsa || t - prop._nxst > 0.35 || t < prop._nxst)) {
        prop._nxst = t;
        prop._nxsa = grass ? 1 : 0.28;
        const vx = p.svx || 0;
        prop._nxsd = (Math.abs(vx) > 5 ? vx : dx) >= 0 ? 1 : -1;
      }
    }
    const a = prop._nxsa;
    if (!a) return od.apply(self, args);
    const e = t - prop._nxst;
    const amp = a * Math.exp(-e * 3.2);
    if (amp < 0.02 || e < 0) { prop._nxsa = 0; return od.apply(self, args); }
    const k = prop._nxsd * amp * 0.42 * Math.cos(e * 13);
    ctx.save();
    ctx.translate(prop.x, prop.y);
    ctx.transform(1, 0, -k, 1, 0, 0);
    ctx.translate(-prop.x, -prop.y);
    try { return od.apply(self, args); } finally { ctx.restore(); }
  }

  // ----------------------------------------------------------------- puentes
  const bridges = [];          // { h, tx, ty, len, stone }
  const bset = new Set();      // tiles de puente (clave numérica)
  const scanned = new Set();   // trozos ya revisados ('cx,cy')
  const tkey = (tx, ty) => tx * 2097152 + ty;
  let harmful = false;

  function clearBridges() { bridges.length = 0; bset.clear(); scanned.clear(); }

  const kindT = (tx, ty) => W.kindAt(tx * TS + 16, ty * TS + 16);
  const hash = (a, b, c) => {
    let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  function walkT(tx, ty) {
    if (kindT(tx, ty) !== 'floor') return false;
    try { return typeof W.walkable !== 'function' || W.walkable(tx, ty); } catch (_) { return true; }
  }

  function tryBridge(h, tx, ty, maxLen, spacing) {
    const sx = h ? 1 : 0, sy = h ? 0 : 1;
    if (!walkT(tx - sx, ty - sy)) return;
    let L = 0;
    while (L <= maxLen && kindT(tx + sx * L, ty + sy * L) === 'liquid') L++;
    if (L < 1 || L > maxLen || !walkT(tx + sx * L, ty + sy * L)) return;
    // Que corte un canal o charco de verdad: el líquido sigue a ambos lados.
    const mx = tx + sx * (L >> 1), my = ty + sy * (L >> 1);
    let sa = 0, sb = 0;
    for (let i = 1; i <= 2; i++) {
      if (kindT(mx + sy * i, my + sx * i) === 'liquid') sa++;
      if (kindT(mx - sy * i, my - sx * i) === 'liquid') sb++;
    }
    if (!sa || !sb || sa + sb < 3) return;
    if (hash(tx, ty, h ? 1 : 2) > 0.6) return;
    const cx = tx + sx * L / 2, cy = ty + sy * L / 2;
    for (const b of bridges) {
      const bx = b.tx + (b.h ? b.len / 2 : 0), by = b.ty + (b.h ? 0 : b.len / 2);
      if (Math.max(Math.abs(bx - cx), Math.abs(by - cy)) < spacing) return;
    }
    bridges.push({ h, tx, ty, len: L });
    for (let i = 0; i < L; i++) bset.add(tkey(tx + sx * i, ty + sy * i));
  }

  function scanChunk(cx, cy) {
    const maxLen = NX.clamp(+opt('blen', 4) || 4, 1, 6);
    const spacing = SPACING[opt('bfreq', 2)] || 8;
    for (let ty = cy * CH; ty < cy * CH + CH; ty++) {
      for (let tx = cx * CH; tx < cx * CH + CH; tx++) {
        if (kindT(tx, ty) !== 'liquid') continue;
        if (kindT(tx - 1, ty) === 'floor') tryBridge(true, tx, ty, maxLen, spacing);
        if (kindT(tx, ty - 1) === 'floor') tryBridge(false, tx, ty, maxLen, spacing);
      }
    }
  }

  function tickBridges(p) {
    if (!p) return;
    const ccx = Math.floor(p.x / (TS * CH)), ccy = Math.floor(p.y / (TS * CH));
    let budget = 2;
    for (let dy = -1; dy <= 1 && budget; dy++) {
      for (let dx = -1; dx <= 1 && budget; dx++) {
        const k = (ccx + dx) + ',' + (ccy + dy);
        if (scanned.has(k)) continue;
        scanned.add(k);
        scanChunk(ccx + dx, ccy + dy);
        budget--;
      }
    }
  }

  function liquidHarm() {
    try {
      const eff = W.liquidEffect([]) || {};
      const kind = typeof W.liquidKind === 'function' ? W.liquidKind() : '';
      return !!(eff.dmg || eff.flat || HARM_LIQ[kind]);
    } catch (_) { return false; }
  }

  // Tablones (o piedra) en coordenadas del mundo, después del líquido.
  const WOOD = { base: '#4a2e16', a: '#9a6a3a', b: '#b47e48', hi: '#e0b070', rail: '#3a2210' };
  const STONE = { base: '#3a3a46', a: '#7c7c8a', b: '#93939f', hi: '#c8c8d2', rail: '#2a2a34' };
  function drawBridges(ctx, cam) {
    if (!bridgesOn || !bridges.length) return;
    const L = cam.left(), T = cam.top(), R = L + cam.w, B = T + cam.h;
    const C = harmful ? STONE : WOOD;
    for (const br of bridges) {
      const len = br.len * TS;
      const x0 = br.h ? br.tx * TS - 6 : br.tx * TS + 4;
      const y0 = br.h ? br.ty * TS + 4 : br.ty * TS - 6;
      const w = br.h ? len + 12 : 24, hh = br.h ? 24 : len + 12;
      if (x0 > R + 8 || y0 > B + 8 || x0 + w < L - 8 || y0 + hh < T - 8) continue;
      ctx.fillStyle = 'rgba(0,0,0,.28)';
      ctx.fillRect(x0 + 2, y0 + 4, w, hh);
      ctx.fillStyle = C.base;
      ctx.fillRect(x0, y0, w, hh);
      if (br.h) {
        for (let x = x0 + 1, i = 0; x < x0 + w - 1; x += 8, i++) {
          ctx.fillStyle = i & 1 ? C.a : C.b;
          ctx.fillRect(x, y0 + 3, Math.min(6, x0 + w - 1 - x), hh - 6);
          ctx.fillStyle = C.hi;
          ctx.fillRect(x, y0 + 3, Math.min(6, x0 + w - 1 - x), 2);
        }
        ctx.fillStyle = C.rail;
        ctx.fillRect(x0, y0, w, 3); ctx.fillRect(x0, y0 + hh - 3, w, 3);
        ctx.fillRect(x0 - 2, y0 - 4, 6, 8); ctx.fillRect(x0 + w - 4, y0 - 4, 6, 8);
        ctx.fillRect(x0 - 2, y0 + hh - 4, 6, 8); ctx.fillRect(x0 + w - 4, y0 + hh - 4, 6, 8);
      } else {
        for (let y = y0 + 1, i = 0; y < y0 + hh - 1; y += 8, i++) {
          ctx.fillStyle = i & 1 ? C.a : C.b;
          ctx.fillRect(x0 + 3, y, w - 6, Math.min(6, y0 + hh - 1 - y));
          ctx.fillStyle = C.hi;
          ctx.fillRect(x0 + 3, y, w - 6, 2);
        }
        ctx.fillStyle = C.rail;
        ctx.fillRect(x0, y0, 3, hh); ctx.fillRect(x0 + w - 3, y0, 3, hh);
        ctx.fillRect(x0 - 4, y0 - 2, 8, 6); ctx.fillRect(x0 + w - 4, y0 - 2, 8, 6);
        ctx.fillRect(x0 - 4, y0 + hh - 4, 8, 6); ctx.fillRect(x0 + w - 4, y0 + hh - 4, 8, 6);
      }
    }
  }

  // ------------------------------------------------------------------- reloj
  let tickN = 0;
  function tick() {
    tickN++;
    const live = !!ns && on() && NX.inRun() && !coop();
    const p = live ? NX.me() : null;
    curMe = p;
    swayOn = live && opt('sway', true) !== false;
    if (!live) {
      bridgesOn = false;
      if (berries.length) berries.length = 0;
      return;
    }
    harmful = liquidHarm();
    bridgesOn = opt('bridges', true) !== false && (!harmful || opt('bharm', false) === true);
    if (opt('bridges', true) !== false && tickN % 3 === 0) tickBridges(p);
    tickBerries(p);
  }

  NX.hudLayers.push({ key: KEY, under: drawBerries });

  NX.mapInteract = {
    stats: () => JSON.parse(JSON.stringify(stats)),
    bridges: () => bridges.map((b) => ({ ...b })),
    bridgesActive: () => bridgesOn,
    berries: () => berries.map((b) => ({ ...b })),
    rescan: clearBridges,
  };

  NX.feature({
    key: KEY,
    label: 'Interacción con el mapa',
    needs: (n) => n.World && typeof n.World.damageProp === 'function' && typeof n.World.drawProp === 'function' &&
      typeof n.World.drawLiquid === 'function' && typeof n.World.isLiquid === 'function' && typeof n.World.kindAt === 'function' &&
      n.Pickups && typeof n.Pickups.drop === 'function' && typeof n.Pickups.dropXp === 'function' && n.Camera && n.Game && n.Game.st,
    setup(n) {
      ns = n; W = n.World;
      const PK = n.Pickups;
      const oDrop = PK.drop, oXp = PK.dropXp;
      PK.drop = function () { gameDrops++; return oDrop.apply(this, arguments); };
      PK.dropXp = function () { gameDrops++; return oXp.apply(this, arguments); };

      const oDmg = W.damageProp;
      W.damageProp = function (prop) {
        if (!on() || !prop || prop._nxbr) return oDmg.apply(this, arguments);
        const before = gameDrops;
        const res = oDmg.apply(this, arguments);
        if (res === true) {
          prop._nxbr = 1;
          stats.breaks++;
          if (gameDrops !== before) stats.gameDropped++;
          else { try { bonus(prop); } catch (err) { NX.trip(KEY, err); } }
        }
        return res;
      };

      const oProp = W.drawProp;
      W.drawProp = function (ctx, prop) {
        if (!swayOn || !prop || prop.flat || (prop.type !== 'grass' && prop.type !== 'tree')) return oProp.apply(this, arguments);
        try { return swayDraw(oProp, this, arguments); } catch (err) { NX.trip(KEY, err); prop._nxsa = 0; return oProp.apply(this, arguments); }
      };

      const oLiq = W.drawLiquid;
      W.drawLiquid = function (ctx, cam) {
        const r = oLiq.apply(this, arguments);
        if (bridgesOn) {
          ctx.save();
          try { drawBridges(ctx, cam || ns.Camera); } catch (err) { NX.trip(KEY, err); }
          ctx.restore();
        }
        return r;
      };

      const oIs = W.isLiquid;
      W.isLiquid = function (x, y) {
        const r = oIs.apply(this, arguments);
        if (!r || !bridgesOn || !bset.size) return r;
        return !bset.has(tkey(Math.floor(x / TS), Math.floor(y / TS)));
      };

      // Semilla o arena nuevas: el terreno cambia y los puentes se recalculan.
      const oReset = W.reset;
      if (typeof oReset === 'function') W.reset = function () { clearBridges(); return oReset.apply(this, arguments); };
      const oArena = W.setArena;
      if (typeof oArena === 'function') W.setArena = function () { clearBridges(); return oArena.apply(this, arguments); };

      NX.runs.on('start', () => { berries.length = 0; clearBridges(); });
      NX.runs.on('end', () => { berries.length = 0; });
      setInterval(() => { try { tick(); } catch (err) { NX.trip(KEY, err); } }, 100);
    },
  });

  NX.settings.section({
    key: KEY,
    tab: 'Cámara y mapa',
    title: 'Interacción con el mapa',
    keywords: 'mapa romper objetos botín drops baya fichas monedas hierba mecer arbustos puentes agua lava cruzar',
    render(el) {
      el.appendChild(NX.ui.toggle('Activado', 'on:' + KEY, true));
      el.appendChild(NX.ui.toggle('Botín extra al romper objetos', 'mapint:drops', true));
      el.appendChild(NX.ui.range('Probabilidad del botín extra', 'mapint:dropmul', 0, 3, 0.25, 1, (v) => '×' + v));
      el.appendChild(NX.ui.range('Curación de la baya pequeña', 'mapint:berry', 2, 20, 1, 8, (v) => v + ' %'));
      el.appendChild(NX.ui.note('Solo cuando el juego no soltó nada: experiencia, una moneda, una ficha de la tienda, una baya pequeña o, rara vez, un objeto del mapa. Los cofres no cambian.'));
      el.appendChild(NX.ui.toggle('La hierba y los árboles se mecen al pasar', 'mapint:sway', true));
      el.appendChild(NX.ui.toggle('Puentes sobre franjas estrechas de líquido', 'mapint:bridges', true));
      el.appendChild(NX.ui.toggle('Puentes de piedra también sobre lava, veneno y chispas', 'mapint:bharm', false));
      el.appendChild(NX.ui.range('Largo máximo del puente', 'mapint:blen', 1, 6, 1, 4, (v) => v + (v > 1 ? ' tiles' : ' tile'), clearBridges));
      el.appendChild(NX.ui.select('Cantidad de puentes', 'mapint:bfreq', [['1', 'Pocos'], ['2', 'Normal'], ['3', 'Muchos']], '2', clearBridges));
      el.appendChild(NX.ui.note('Sobre un puente no se aplica el efecto del líquido (frenar, resbalar o quemar). Valen en todos los biomas, arenas, islas y mazmorra.'));
    },
  });
})();
