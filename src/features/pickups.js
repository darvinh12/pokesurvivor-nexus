// Objetos del mapa: pickups raros que aparecen en el mundo durante la
// partida y se recogen al pasar cerca. Reloj (congela a los enemigos unos
// segundos), Imán (atrae toda la experiencia), Bomba (limpia la pantalla) y
// Baya Zidra (cura). Se dibujan en pixel art bajo el HUD, con una flecha en
// el borde cuando quedan fuera de vista, y se exponen como marcadores en
// NX.mapMarkers. No tocan funciones del juego: solo usan sus efectos
// (applyStun, Pickups.pullAll, hurt, heal). Fuera del cooperativo.
(() => {
  const KEY = 'pickups';
  const LIFE = 60, MAX = 3, FREEZE = 5;
  const PAL = {
    y: '#ffd23f', W: '#ffffff', k: '#0b1838', r: '#b0203a', R: '#ff4a5f', s: '#8a96a8', S: '#e8eef6',
    b: '#2a2f45', B: '#8a93b8', f: '#c98a3c', F: '#ffe27a', g: '#2f8f3a', G: '#5fe08a', z: '#ffcf3a', Z: '#fff1a0', o: '#c98a10',
  };
  const KINDS = {
    clock: {
      name: 'Reloj', note: 'congela a los enemigos', glow: '#7fe0ff', w: 20,
      art: ['...yyyy...', '..yWWWWy..', '.yWWWkWWy.', 'yWWWWkWWWy', 'yWWWWkWWWy', 'yWWWWkkkWy', 'yWWWWWWWWy', '.yWWWWWWy.', '..yWWWWy..', '...yyyy...'],
    },
    magnet: {
      name: 'Imán', note: 'atrae toda la experiencia', glow: '#ff9ed8', w: 25,
      art: ['.ss....ss.', 'sSSs..sSSs', 'rRRr..rRRr', 'rRRr..rRRr', 'rRRr..rRRr', 'rRRr..rRRr', 'rRRRrrRRRr', '.rRRRRRRr.', '..rrrrrr..', '..........'],
    },
    bomb: {
      name: 'Bomba', note: 'limpia la pantalla', glow: '#ff7b3d', w: 20,
      art: ['.......f..', '......f.F.', '.....bb...', '...bbbbb..', '..bBBbbbb.', '.bBbbbbbbb', '.bbbbbbbbb', '.bbbbbbbbb', '..bbbbbbb.', '...bbbbb..'],
    },
    food: {
      name: 'Baya Zidra', note: 'cura un 35 % de la vida', glow: '#5fe08a', w: 35,
      art: ['....gg....', '...gGg....', '..zzzzzz..', '.zZZzzzzz.', 'zZZzzzzzzz', 'zZzzzzzzzz', 'zzzzzzzzzo', '.zzzzzzzo.', '..zzzzoo..', '...oooo...'],
    },
  };
  const ORDER = Object.keys(KINDS);

  let ns = null, items = [], nextT = 0, runP = null, freezeUntil = 0, freezeStart = 0;
  const opt = (k, d) => NX.store.get('pick:' + k, d);
  const on = () => NX.isOn(KEY);
  const kindOn = (k) => opt(k, true) !== false;
  const coop = () => !!(ns && ns.Coop && ns.Coop.active);
  const now = () => (ns && ns.Game.st && ns.Game.st.time) || 0;

  function reset() { items = []; nextT = 0; freezeUntil = 0; }

  function spot(p, dMin, dMax) {
    const W = ns.World, TS = W.TS || 32, A = W.arena;
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * Math.PI * 2, d = dMin + Math.random() * (dMax - dMin);
      const x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d;
      if (A) {
        const cx = A.tx * TS + TS / 2, cy = A.ty * TS + TS / 2;
        if (Math.hypot(x - cx, y - cy) > (A.r - 2) * TS) continue;
      }
      if (W.kindAt(x, y) !== 'floor') continue;
      if (W.isFree && !W.isFree(x, y, 12)) continue;
      return [x, y];
    }
    return null;
  }

  function pickKind() {
    const list = ORDER.filter(kindOn);
    if (!list.length) return null;
    let tot = 0;
    for (const k of list) tot += KINDS[k].w;
    let r = Math.random() * tot;
    for (const k of list) { r -= KINDS[k].w; if (r <= 0) return k; }
    return list[0];
  }

  // Crea un objeto. near=true lo pone junto al jugador (pruebas u otros módulos).
  function spawn(p, kind, near) {
    const k = kind && KINDS[kind] ? kind : pickKind();
    if (!k) return null;
    const at = near ? spot(p, 50, 90) : spot(p, 280, 640);
    if (!at) return null;
    const it = { kind: k, x: at[0], y: at[1], t0: now(), life: LIFE, ph: Math.random() * 6 };
    items.push(it);
    return it;
  }

  function say(text) {
    try { if (ns.Spawner && ns.Spawner.say) ns.Spawner.say(text, 2); else NX.toast(text); } catch (_) { NX.toast(text); }
  }
  const sfx = (n) => { try { ns.Audio.sfx(n); } catch (_) { /* silencio */ } };
  const ring = (x, y, r0, r1, col, d, w) => { try { ns.FX.ring(x, y, r0, r1, col, d, w); } catch (_) { /* nada */ } };

  function collect(it, p) {
    const C = ns.Camera;
    if (it.kind === 'clock') {
      freezeStart = now();
      freezeUntil = freezeStart + FREEZE;
      applyFreeze();
      ring(p.x, p.y, 10, 520, '#7fe0ff', 0.7, 5);
      sfx('confirm');
      say('¡Reloj! Enemigos congelados ' + FREEZE + ' s');
    } else if (it.kind === 'magnet') {
      try { ns.Pickups.pullAll(); } catch (_) { /* nada */ }
      ring(p.x, p.y, 10, 420, '#ff9ed8', 0.6, 4);
      sfx('confirm');
      say('¡Imán! Toda la experiencia viene hacia ti');
    } else if (it.kind === 'bomb') {
      try { C.kick(0.8); } catch (_) { /* nada */ }
      ring(p.x, p.y, 20, C.outerRadius ? C.outerRadius() : 600, '#ff7b3d', 0.5, 6);
      sfx('break');
      const lvl = p.level || 1;
      for (const e of ns.EnemyMgr.all()) {
        if (e.dead || e.remote) continue;
        if (C.sees && !C.sees(e.x, e.y, 0)) continue;
        const big = e.boss || e.legend || e.judge || e.arceus;
        const dmg = big ? 90 + 40 * lvl : (e.maxHp || 100) * 3 + (e.shield || 0) + 50;
        try { e.hurt(dmg, 'normal', e.x - p.x, e.y - p.y, 160); } catch (err) { NX.trip(KEY, err); }
      }
      say('¡Bomba! Pantalla despejada');
    } else if (it.kind === 'food') {
      try { p.heal(p.maxHp * 0.35); } catch (_) { /* nada */ }
      ring(p.x, p.y, 6, 70, '#5fe08a', 0.45, 3);
      sfx('confirm');
      say('¡Baya Zidra! Recuperas vida');
    }
  }

  function applyFreeze() {
    const left = freezeUntil - now();
    if (left <= 0) return;
    for (const e of ns.EnemyMgr.all()) {
      if (e.dead || e.arceus || e.remote || typeof e.applyStun !== 'function') continue;
      const big = e.boss || e.legend || e.judge;
      if (big && now() - freezeStart > 2) continue; // los jefes solo se congelan 2 s
      e.applyStun(Math.min(left, 0.3));
    }
  }

  function tick() {
    if (!ns || !on() || coop()) { if (items.length) reset(); return; }
    const G = ns.Game, p = NX.me();
    if (!NX.inRun() || !p) { if (items.length || freezeUntil) reset(); runP = null; return; }
    if (p !== runP) { runP = p; reset(); }
    if (G.state !== 'playing') return;
    if ((ns.Judgment && ns.Judgment.active) || (ns.Rift && ns.Rift.inArena)) return;
    const t = now();
    items = items.filter((it) => t - it.t0 < it.life);
    if (!nextT) nextT = t + 40 + Math.random() * 20;
    if (t >= nextT) {
      const every = +opt('freq', 55);
      nextT = t + every * (0.75 + Math.random() * 0.5);
      if (items.length < MAX) {
        const it = spawn(p);
        if (it && opt('notify', true)) NX.toast('Apareció un objeto en el mapa: ' + KINDS[it.kind].name);
      }
    }
    if (freezeUntil > t) applyFreeze(); else freezeUntil = 0;
    if (p.dead) return;
    const reach = (p.r || 14) + 20;
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      if (Math.hypot(p.x - it.x, p.y - it.y) > reach) continue;
      items.splice(i, 1);
      try { collect(it, p); } catch (err) { NX.trip(KEY, err); }
    }
  }

  // ---------------------------------------------------------------- dibujo
  function drawArt(g, art, cx, cy, u, flick) {
    const rows = art.length, cols = art[0].length;
    const x0 = Math.round(cx - (cols * u) / 2), y0 = Math.round(cy - (rows * u) / 2);
    g.fillStyle = '#0b1838';
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) if (art[j][i] !== '.') g.fillRect(x0 + i * u - 1, y0 + j * u - 1, u + 2, u + 2);
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        let c = art[j][i];
        if (c === '.') continue;
        if (c === 'F' && flick) c = 'y';
        g.fillStyle = PAL[c] || '#ff00ff';
        g.fillRect(x0 + i * u, y0 + j * u, u, u);
      }
    }
  }

  function draw(g, w, h) {
    if (!ns || !NX.inRun()) return;
    const C = ns.Camera, S = C.scale || 1, ms = performance.now(), t = now();
    if (freezeUntil > t) {
      g.fillStyle = 'rgba(127,224,255,0.08)';
      g.fillRect(0, 0, w, h);
      g.font = `${Math.round(14 * Math.min(1.3, S))}px Pixelify, system-ui, sans-serif`;
      g.textAlign = 'center';
      g.lineWidth = 3; g.strokeStyle = '#0b1838';
      const txt = 'Tiempo detenido · ' + Math.ceil(freezeUntil - t) + ' s';
      g.strokeText(txt, w / 2, 160); g.fillStyle = '#bff2ff'; g.fillText(txt, w / 2, 160);
    }
    if (!items.length) return;
    const u = Math.max(2, Math.round(2.3 * S));
    for (const it of items) {
      const K = KINDS[it.kind];
      const left = it.life - (t - it.t0);
      if (left < 10 && Math.sin(ms / 90) > 0.4) continue; // parpadea antes de irse
      const [sx, sy] = NX.toScreen(it.x, it.y);
      const off = sx < -20 || sy < -20 || sx > w + 20 || sy > h + 20;
      if (off) { edge(g, sx, sy, w, h, K.glow); continue; }
      const bob = Math.sin(ms / 300 + it.ph) * 3 * S;
      g.fillStyle = 'rgba(0,0,0,.28)';
      g.beginPath(); g.ellipse(sx, sy + 6 * S, 12 * S, 4 * S, 0, 0, Math.PI * 2); g.fill();
      g.globalAlpha = 0.35 + 0.2 * Math.sin(ms / 220 + it.ph);
      g.fillStyle = K.glow;
      g.beginPath(); g.arc(sx, sy - 10 * S + bob, 18 * S, 0, Math.PI * 2); g.fill();
      g.globalAlpha = 1;
      drawArt(g, K.art, sx, sy - 10 * S + bob, u, Math.sin(ms / 70) > 0);
    }
  }

  // Flecha pequeña en el borde hacia un objeto fuera de vista.
  function edge(g, sx, sy, w, h, col) {
    const cx = w / 2, cy = h / 2, dx = sx - cx, dy = sy - cy;
    const k = Math.min((w / 2 - 26) / Math.abs(dx || 1e-6), (h / 2 - 26) / Math.abs(dy || 1e-6));
    const x = cx + dx * k, y = cy + dy * k, a = Math.atan2(dy, dx);
    g.save();
    g.translate(Math.round(x), Math.round(y));
    g.rotate(a);
    g.fillStyle = '#0b1838';
    g.beginPath(); g.moveTo(10, 0); g.lineTo(-6, -8); g.lineTo(-6, 8); g.closePath(); g.fill();
    g.fillStyle = col;
    g.beginPath(); g.moveTo(7, 0); g.lineTo(-4, -5.5); g.lineTo(-4, 5.5); g.closePath(); g.fill();
    g.restore();
  }

  NX.mapMarkers = NX.mapMarkers || [];
  NX.mapMarkers.push({
    key: KEY,
    list: () => (on() && NX.inRun() ? items.map((it) => ({ x: it.x, y: it.y, color: KINDS[it.kind].glow, shape: 'item', label: KINDS[it.kind].name })) : []),
  });

  NX.mapPickups = {
    spawn(kind, near = true) { const p = NX.me(); if (!ns || !p) return null; return spawn(p, kind, near); },
    list: () => items.map((it) => ({ ...it })),
    frozen: () => Math.max(0, freezeUntil - now()),
    clear: reset,
  };

  NX.hudLayers.push({ key: KEY, under: draw });

  NX.feature({
    key: KEY,
    label: 'Objetos del mapa',
    needs: (n) => n.World && typeof n.World.kindAt === 'function' && n.Pickups && typeof n.Pickups.pullAll === 'function' &&
      n.EnemyMgr && typeof n.EnemyMgr.all === 'function' && n.Enemy && n.Enemy.prototype && typeof n.Enemy.prototype.applyStun === 'function' &&
      n.Camera && typeof n.Camera.left === 'function' && n.Game && n.Game.st,
    setup(n) {
      ns = n;
      setInterval(() => { try { tick(); } catch (err) { NX.trip(KEY, err); } }, 100);
      NX.runs.on('end', () => { reset(); runP = null; });
    },
  });

  NX.settings.section({
    key: KEY,
    tab: 'Partida',
    title: 'Objetos del mapa',
    keywords: 'objetos pickups reloj imán bomba baya comida congelar experiencia curar mapa',
    render(el) {
      el.appendChild(NX.ui.toggle('Activado', 'on:' + KEY, true));
      el.appendChild(NX.ui.note('Objetos raros que aparecen en el mapa. Se recogen al pasar cerca y desaparecen a los ' + LIFE + ' s. No salen en cooperativo.'));
      for (const k of ORDER) el.appendChild(NX.ui.toggle(`${KINDS[k].name} (${KINDS[k].note})`, 'pick:' + k, true));
      el.appendChild(NX.ui.range('Un objeto nuevo cada', 'pick:freq', 25, 150, 5, 55, (v) => '~' + v + ' s'));
      el.appendChild(NX.ui.toggle('Avisar cuando aparece uno', 'pick:notify', true));
    },
  });
})();
