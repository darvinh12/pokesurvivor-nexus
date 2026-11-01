// Mapa base, calidad de vida:
//  - Lejanos en el minimapa: el minimapa lee unos 1200 de radio (más lejos
//    obligaría al juego a reconstruir trozos de terreno sin parar). Para
//    cofres, altares y charcos curativos no hace falta el terreno: cada pocos
//    segundos se consultan World.propsInCircle y World.specialsNear con un
//    radio mayor y lo que queda fuera del rango del minimapa se le pasa como
//    marcador en su borde (NX.mapMarkers, capa "Terrenos, objetos y portales").
//  - Aviso discreto del cofre sin abrir más cercano: una flecha pequeña
//    alrededor del jugador con la distancia. Los cofres grandes ya los marca
//    edge-arrows.js, así que aquí van los normales.
//  - Imán de experiencia al terminar una marea de Pokémon: tras el aviso
//    "¡Marea de Pokémon!", cuando quedan menos de la mitad de los enemigos
//    del pico (o pasan 35 s), toda la experiencia del suelo vuela hacia ti.
(() => {
  const KEY = 'qolmap';
  const MAP_RANGE = 1200; // el radio que dibuja minimap.js
  const COL = { chest: '#c98a3c', bigchest: '#ffd23f', altar: '#7fe0ff', spring: '#2fbf6a' };
  const ns = () => NX.ns;
  const opt = (k, d) => NX.store.get('qolmap:' + k, d);
  const on = () => NX.isOn(KEY);
  const alive = (q) => q && !q.used && !q.open && !(q.hp <= 0);

  // ---------------------------------------------------------------- lejanos
  let far = [], farAt = 0, farRun = null;
  function scanFar() {
    const N = ns(), p = NX.me(), W = N && N.World;
    if (!p || !W) { far = []; return; }
    const R = NX.clamp(+opt('far', 2400) || 2400, 1400, 4000);
    const out = [];
    const outside = (q) => Math.max(Math.abs(q.x - p.x), Math.abs(q.y - p.y)) > MAP_RANGE;
    const layer = (k) => NX.store.get('map:' + k, true) !== false;
    if (W.propsInCircle && layer('chests')) for (const q of W.propsInCircle(p.x, p.y, R) || []) if (q.type === 'chest' && alive(q) && outside(q)) out.push(q);
    if (W.specialsNear) {
      for (const q of W.specialsNear(p.x, p.y, R) || []) {
        if (!outside(q)) continue;
        if (q.type === 'bigchest' && alive(q) && layer('chests')) out.push(q);
        else if (q.type === 'altar' && alive(q) && layer('altars')) out.push(q);
        else if (q.type === 'spring' && layer('springs') && (q.charge == null || q.charge >= 0.15)) out.push(q);
      }
    }
    far = out;
  }
  NX.mapMarkers = NX.mapMarkers || [];
  NX.mapMarkers.push({
    key: KEY,
    list() {
      if (!on() || opt('farOn', true) === false || !NX.inRun()) return [];
      const p = NX.me();
      const now = performance.now();
      if (p !== farRun || now - farAt > 3000) {
        farRun = p;
        farAt = now;
        try { scanFar(); } catch (err) { far = []; NX.trip(KEY, err); }
      }
      return far.filter(alive2).map((q) => ({ x: q.x, y: q.y, color: COL[q.type] || '#ffd23f', shape: 'item' }));
    },
  });
  const alive2 = (q) => (q.type === 'spring' ? true : alive(q));

  // ---------------------------------------------------------------- cofre cercano
  let near = null, nearAt = 0;
  function findNear(p) {
    const W = ns().World;
    const R = NX.clamp(+opt('nearR', 700) || 700, 200, 1500);
    let best = null, bd = Infinity;
    for (const q of (W.propsInCircle && W.propsInCircle(p.x, p.y, R)) || []) {
      if (q.type !== 'chest' || !alive(q)) continue;
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d < bd) { bd = d; best = q; }
    }
    return best;
  }
  function drawNear(ctx, w, h, pl) {
    if (!on() || opt('nearOn', true) === false || !pl || !NX.inRun()) return;
    const now = performance.now();
    if (now - nearAt > 400) { nearAt = now; near = findNear(pl); }
    if (!near || !alive(near)) return;
    const [sx, sy] = NX.toScreen(near.x, near.y);
    const [px, py] = NX.toScreen(pl.x, pl.y - (pl.bodyH || 30) * 0.5);
    // A la vista y cerca: no hace falta flecha.
    const d = Math.hypot(near.x - pl.x, near.y - pl.y);
    if (sx > 40 && sx < w - 40 && sy > 40 && sy < h - 40 && d < 260) return;
    const a = Math.atan2(sy - py, sx - px), R = 46;
    const x = px + Math.cos(a) * R, y = py + Math.sin(a) * R;
    ctx.globalAlpha = 0.85;
    ctx.translate(x, y);
    ctx.rotate(a);
    ctx.beginPath();
    ctx.moveTo(9, 0); ctx.lineTo(-4, -6); ctx.lineTo(-1, 0); ctx.lineTo(-4, 6); ctx.closePath();
    ctx.lineWidth = 2.5; ctx.strokeStyle = '#0b1838'; ctx.stroke();
    ctx.fillStyle = COL.chest; ctx.fill();
    ctx.rotate(-a);
    if (opt('nearDist', true) !== false) {
      ctx.font = '700 10px Pixelify,"Segoe UI",system-ui,sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const t = Math.round(d / 32) + ' m';
      const ox = Math.cos(a) * 18, oy = Math.sin(a) * 18;
      ctx.lineWidth = 3; ctx.strokeStyle = '#0b1838'; ctx.strokeText(t, ox, oy);
      ctx.fillStyle = '#ffe2b0'; ctx.fillText(t, ox, oy);
    }
  }

  // ---------------------------------------------------------------- imán al final de la marea
  let wave = null, waveSeen = '';
  function waveTick() {
    const N = ns();
    if (!on() || opt('magnet', true) === false || !NX.inRun() || !N.Spawner || !N.EnemyMgr) { wave = null; return; }
    if (N.Coop && N.Coop.active && !N.Coop.isHost) { wave = null; return; }
    if (N.Game.state !== 'playing') return;
    const b = typeof N.Spawner.banner === 'function' ? N.Spawner.banner() : null;
    const txt = b && b.text ? String(b.text) : '';
    const count = N.EnemyMgr.count || 0;
    const now = performance.now();
    if (/marea/i.test(txt) && !/marea/i.test(waveSeen) && !wave) wave = { t0: now, peak: count };
    waveSeen = txt;
    if (!wave) return;
    const age = now - wave.t0;
    // El pico se mide en los primeros segundos, cuando llega la marea.
    if (age < 4000) wave.peak = Math.max(wave.peak, count);
    if ((age > 6000 && count <= wave.peak * 0.5) || age > 35000) {
      wave = null;
      pullXp(N);
    }
  }
  function pullXp(N) {
    const P = N.Pickups;
    if (!P) return;
    let n = 0;
    if (typeof P.all === 'function') {
      for (const q of P.all()) if (q && (q.kind === 'xp' || q.kind === 'xpBig') && !q.pulled) { q.pulled = true; n++; }
    } else if (typeof P.pullAll === 'function') { P.pullAll(); n = 1; }
    if (n && opt('magnetToast', true) !== false) NX.toast('Marea superada · experiencia atraída');
  }

  NX.feature({
    key: KEY,
    label: 'Mapa base',
    needs: (n) => n.World && typeof n.World.propsInCircle === 'function' && typeof n.World.specialsNear === 'function' &&
      n.Pickups && n.EnemyMgr && n.Spawner && n.Camera && n.Camera.left,
    setup() {
      NX.hudLayers.push({ key: KEY, over: drawNear });
      NX.every(250, () => { try { waveTick(); } catch (err) { NX.trip(KEY, err); } }, { when: 'run', key: KEY, leave: true });
      NX.runs.on('start', () => { wave = null; far = []; farAt = 0; near = null; });
    },
  });

  NX.settings.section({
    key: KEY,
    tab: 'Cámara y mapa',
    title: 'Mapa base',
    keywords: 'cofres altares charcos lejos minimapa aviso imán experiencia marea oleada',
    render(el) {
      el.appendChild(NX.ui.toggle('Activado', 'on:' + KEY, true));
      el.appendChild(NX.ui.toggle('Cofres, altares y charcos lejanos en el borde del minimapa', 'qolmap:farOn', true));
      el.appendChild(NX.ui.range('Distancia de búsqueda', 'qolmap:far', 1400, 4000, 100, 2400, (v) => Math.round(v / 32) + ' m'));
      el.appendChild(NX.ui.note('Necesita el minimapa con la capa "Terrenos, objetos y portales". Respeta las capas Cofres, Altares y Charcos curativos. Se consulta cada 3 s.'));
      el.appendChild(NX.ui.toggle('Flecha al cofre sin abrir más cercano', 'qolmap:nearOn', true));
      el.appendChild(NX.ui.range('Radio del aviso', 'qolmap:nearR', 200, 1500, 50, 700, (v) => Math.round(v / 32) + ' m'));
      el.appendChild(NX.ui.toggle('Distancia junto a la flecha', 'qolmap:nearDist', true));
      el.appendChild(NX.ui.toggle('Imán de experiencia al terminar una marea', 'qolmap:magnet', true));
      el.appendChild(NX.ui.toggle('Aviso al atraer la experiencia', 'qolmap:magnetToast', true));
      el.appendChild(NX.ui.note('La marea se da por terminada cuando quedan menos de la mitad de los enemigos que llegó a haber o a los 35 s. Solo mueve la experiencia, no los objetos.'));
    },
  });
})();
