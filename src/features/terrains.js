// Terrenos con efectos: zonas temporales que aparecen en el mapa durante la
// partida. Campo eléctrico (acelera), niebla (reduce la visión), hierba
// curativa (cura despacio) y campo psíquico (frena proyectiles y enemigos).
// Se dibujan bajo el HUD (hudLayers.under) y su efecto se aplica al jugador
// cada 100 ms con el reloj del juego, así que respetan la pausa. Al terminar
// la partida las zonas desaparecen; los efectos son mejoras breves del juego
// (addBuff, heal, applySlow) que caducan solas.
(() => {
  const KEY = 'terrains';
  const KINDS = {
    electric: { name: 'Campo eléctrico', col: '#ffd23f', dark: '#b8860b', fill: 'rgba(255,210,63,.13)', note: 'acelera' },
    fog: { name: 'Niebla espesa', col: '#d8dde6', dark: '#7d8696', fill: 'rgba(200,206,218,.20)', note: 'reduce la visión' },
    grass: { name: 'Hierba curativa', col: '#5fe08a', dark: '#1f8f4d', fill: 'rgba(95,224,138,.14)', note: 'cura despacio' },
    psychic: { name: 'Campo psíquico', col: '#ff7bd5', dark: '#a03d84', fill: 'rgba(255,123,213,.13)', note: 'frena proyectiles y enemigos' },
  };
  const ORDER = Object.keys(KINDS);
  const MAX = 3;
  const LIFE = 45;

  let ns = null, zones = [], nextT = 0, lastT = null, runP = null, healAcc = 0, inFog = 0;
  const opt = (k, d) => NX.store.get('terrain:' + k, d);
  const on = () => NX.isOn(KEY);
  const kindOn = (k) => opt(k, true) !== false;

  function reset() { zones = []; lastT = null; nextT = 0; healAcc = 0; inFog = 0; }

  // Punto de suelo libre a cierta distancia del jugador (dentro de la arena si la hay).
  function spot(p, dMin, dMax, rad) {
    const W = ns.World, TS = W.TS || 32, A = W.arena;
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * Math.PI * 2, d = dMin + Math.random() * (dMax - dMin);
      const x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d;
      if (A) {
        const cx = A.tx * TS + TS / 2, cy = A.ty * TS + TS / 2;
        if (Math.hypot(x - cx, y - cy) > (A.r - 3) * TS - rad * 0.5) continue;
      }
      if (W.kindAt(x, y) !== 'floor') continue;
      if (W.isFree && !W.isFree(x, y, 14)) continue;
      return [x, y];
    }
    return null;
  }

  function spawn(p, t, kind) {
    const list = ORDER.filter(kindOn);
    if (!list.length) return null;
    const k = kind && KINDS[kind] ? kind : list[Math.floor(Math.random() * list.length)];
    const r = 115 + Math.random() * 45;
    const at = spot(p, kind ? 60 : 240, kind ? 140 : 520, r);
    if (!at) return null;
    const z = { kind: k, x: at[0], y: at[1], r, t0: t, life: LIFE, seed: Math.random() * 1000 };
    zones.push(z);
    return z;
  }

  const inside = (z, x, y) => (x - z.x) * (x - z.x) + (y - z.y) * (y - z.y) <= z.r * z.r;

  function tick() {
    if (!ns || !on() || (ns.Coop && ns.Coop.active)) { if (zones.length) reset(); return; }
    const G = ns.Game, p = NX.me();
    if (!NX.inRun() || !p) { if (zones.length) reset(); runP = null; return; }
    if (p !== runP) { runP = p; reset(); }
    if (G.state !== 'playing') return;
    if ((ns.Judgment && ns.Judgment.active) || (ns.Rift && ns.Rift.inArena)) { zones = []; return; }
    const t = G.st.time || 0;
    const dt = lastT == null ? 0 : Math.max(0, Math.min(0.5, t - lastT));
    lastT = t;
    zones = zones.filter((z) => t - z.t0 < z.life);
    if (!nextT) nextT = t + 25 + Math.random() * 15;
    if (t >= nextT) {
      const every = +opt('freq', 45);
      nextT = t + every * (0.75 + Math.random() * 0.5);
      if (zones.length < MAX) spawn(p, t);
    }
    if (!zones.length || p.dead) { inFog = Math.max(0, inFog - dt * 2); return; }
    let fog = false;
    for (const z of zones) {
      const me = inside(z, p.x, p.y);
      if (z.kind === 'electric' && me && typeof p.addBuff === 'function') p.addBuff('spd', 0.35, 0.35, 1);
      else if (z.kind === 'grass' && me && p.hp < p.maxHp) {
        healAcc += dt;
        if (healAcc >= 1) { healAcc -= 1; try { p.heal(Math.max(1, p.maxHp * 0.02)); } catch (_) { /* nada */ } }
      } else if (z.kind === 'fog' && me) fog = true;
      else if (z.kind === 'psychic') {
        for (const q of ns.Projectiles.all()) {
          if (q.friendly || q.__nxPsy || !inside(z, q.x, q.y)) continue;
          q.__nxPsy = 1;
          if (typeof q.vx === 'number') { q.vx *= 0.4; q.vy *= 0.4; }
        }
        for (const e of ns.EnemyMgr.all()) {
          if (!e.dead && !e.arceus && inside(z, e.x, e.y) && typeof e.applySlow === 'function') e.applySlow(0.35, 0.4);
        }
      }
    }
    inFog = fog ? Math.min(1, inFog + dt * 2.5) : Math.max(0, inFog - dt * 2);
  }

  // ---------------------------------------------------------------- dibujo
  function drawZone(g, z, now, S) {
    const K = KINDS[z.kind];
    const [sx, sy] = NX.toScreen(z.x, z.y);
    const R = z.r * S;
    const G = ns.Game, t = G.st.time || 0;
    const left = z.life - (t - z.t0);
    if (left <= 0) return;
    let a = Math.min(1, (t - z.t0) / 0.6);
    if (left < 6) a *= 0.45 + 0.55 * Math.abs(Math.sin(now / 140));
    g.globalAlpha = a;
    g.fillStyle = K.fill;
    g.beginPath(); g.arc(sx, sy, R, 0, Math.PI * 2); g.fill();
    // Borde en segmentos, al estilo pixel.
    const px = Math.max(2, Math.round(2 * S));
    const n = Math.max(24, Math.round(R / 7));
    const rot = now / (z.kind === 'psychic' ? 1400 : 3000);
    for (let i = 0; i < n; i++) {
      if (i % 2) continue;
      const ang = rot + (i / n) * Math.PI * 2;
      const x = Math.round(sx + Math.cos(ang) * R), y = Math.round(sy + Math.sin(ang) * R);
      g.fillStyle = K.dark; g.fillRect(x - px, y - px, px * 2 + 1, px * 2 + 1);
      g.fillStyle = K.col; g.fillRect(x - px + 1, y - px + 1, px * 2 - 1, px * 2 - 1);
    }
    // Detalles dentro de la zona.
    const m = 9;
    for (let i = 0; i < m; i++) {
      const h = Math.sin(z.seed + i * 12.9898) * 43758.5453;
      const fr = h - Math.floor(h);
      const ang = i * 2.399 + z.seed;
      const rr = R * (0.18 + 0.7 * fr);
      const x = Math.round(sx + Math.cos(ang) * rr), y = Math.round(sy + Math.sin(ang) * rr);
      const ph = now / 260 + i;
      if (z.kind === 'electric') {
        if (Math.sin(ph * 1.7) < 0.2) continue;
        g.fillStyle = K.col;
        g.fillRect(x, y, px, px * 2); g.fillRect(x + px, y + px * 2, px, px * 2); g.fillRect(x, y + px * 4, px, px * 2);
      } else if (z.kind === 'grass') {
        g.fillStyle = K.dark; g.fillRect(x, y, px, px * 3);
        g.fillStyle = K.col; g.fillRect(x - px, y + px, px, px * 2); g.fillRect(x + px, y + px, px, px * 2);
        if (Math.sin(ph) > 0.6) { g.fillStyle = '#ffffff'; g.fillRect(x, y - px * 2 - Math.round((ph % 1) * 4), px, px); }
      } else if (z.kind === 'psychic') {
        const o = Math.sin(ph) * 3 * px;
        g.fillStyle = K.col; g.fillRect(x - px, y + o, px * 2, px * 2);
        g.fillStyle = '#ffffff'; g.fillRect(x - px + 1, y + o + 1, px - 1, px - 1);
      } else {
        const o = Math.sin(ph * 0.6) * 6 * px;
        g.fillStyle = 'rgba(230,234,242,.55)';
        g.fillRect(x - px * 4 + o, y - px, px * 8, px * 2);
        g.fillRect(x - px * 2 + o, y - px * 2, px * 4, px);
      }
    }
    // Nombre corto al estar cerca.
    const p = NX.me();
    if (p && Math.hypot(p.x - z.x, p.y - z.y) < z.r * 1.6) {
      g.font = `${Math.round(11 * Math.min(1.4, S))}px Pixelify, system-ui, sans-serif`;
      g.textAlign = 'center';
      g.lineWidth = 3;
      g.strokeStyle = '#0b1838';
      g.strokeText(K.name, sx, sy - R - 6);
      g.fillStyle = K.col;
      g.fillText(K.name, sx, sy - R - 6);
    }
    g.globalAlpha = 1;
  }

  function draw(g, w, h) {
    if (!ns || !zones.length || !NX.inRun()) return;
    const C = ns.Camera, S = C.scale || 1, now = performance.now();
    const L = C.left(), T = C.top();
    for (const z of zones) {
      if (z.x + z.r < L || z.x - z.r > L + C.w || z.y + z.r < T || z.y - z.r > T + C.h) continue;
      drawZone(g, z, now, S);
    }
    if (inFog > 0.01) {
      const p = NX.me();
      if (!p) return;
      const [px, py] = NX.toScreen(p.x, p.y - (p.bodyH || 30) / 2);
      const r0 = 70 * S, r1 = 190 * S;
      const gr = g.createRadialGradient(px, py, r0, px, py, r1);
      gr.addColorStop(0, 'rgba(196,202,214,0)');
      gr.addColorStop(1, `rgba(196,202,214,${0.93 * inFog})`);
      g.fillStyle = gr;
      g.fillRect(0, 0, w, h);
    }
  }

  // Marcadores para el minimapa u otros módulos (lectura perezosa).
  NX.mapMarkers = NX.mapMarkers || [];
  NX.mapMarkers.push({
    key: KEY,
    list: () => (on() && NX.inRun() ? zones.map((z) => ({ x: z.x, y: z.y, r: z.r, color: KINDS[z.kind].col, shape: 'zone', label: KINDS[z.kind].name })) : []),
  });

  NX.terrains = {
    // Crea una zona junto al jugador (para probar o para otros módulos).
    spawn(kind) { const p = NX.me(); if (!ns || !p) return null; return spawn(p, ns.Game.st.time || 0, kind); },
    list: () => zones.map((z) => ({ ...z })),
    clear: reset,
  };

  NX.hudLayers.push({ key: KEY, under: draw });

  NX.feature({
    key: KEY,
    label: 'Terrenos con efectos',
    needs: (n) => n.World && typeof n.World.kindAt === 'function' && n.Projectiles && typeof n.Projectiles.all === 'function' &&
      n.EnemyMgr && typeof n.EnemyMgr.all === 'function' && n.Camera && typeof n.Camera.left === 'function' && n.Game && n.Game.st,
    setup(n) {
      ns = n;
      NX.every(100, () => { try { tick(); } catch (err) { NX.trip(KEY, err); } }, { when: 'run', key: KEY, leave: true });
      NX.runs.on('end', () => { reset(); runP = null; });
    },
  });

  NX.settings.section({
    key: KEY,
    tab: 'Partida',
    title: 'Terrenos con efectos',
    keywords: 'terreno zona campo eléctrico niebla hierba psíquico velocidad curación visión proyectiles',
    render(el) {
      el.appendChild(NX.ui.toggle('Activado', 'on:' + KEY, true));
      el.appendChild(NX.ui.note('Zonas temporales en el mapa. Duran ' + LIFE + ' s y hay como máximo ' + MAX + ' a la vez.'));
      for (const k of ORDER) el.appendChild(NX.ui.toggle(`${KINDS[k].name} (${KINDS[k].note})`, 'terrain:' + k, true));
      el.appendChild(NX.ui.range('Una zona nueva cada', 'terrain:freq', 20, 120, 5, 45, (v) => '~' + v + ' s'));
    },
  });
})();
