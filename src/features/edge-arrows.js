// Flechas en el borde de la pantalla hacia lo que vale la pena y está fuera
// de vista: jefes, legendarios, shinies, dorados y ladrones, cofres grandes y
// grietas. Se dibujan encima del HUD (capa over) con la distancia en metros.
// El juego ya trae flechas simples para shinies, ladrones y grietas; con
// "Reemplazar las flechas del juego" se ocultan esas tres mientras se dibuja
// su HUD, para no ver flechas dobles.
// Basado en el enfoque de PokeSurvivor Plus (MIT).
(() => {
  const KEY = 'edgearrows';
  const TYPES = [
    ['boss', 'Jefes'], ['legend', 'Legendarios y Juicio'], ['shiny', 'Shinies'],
    ['golden', 'Dorados y ladrones'], ['chest', 'Cofres grandes'], ['rift', 'Grietas'],
  ];
  const STYLE = {
    boss: { col: '#ff3048', ring: '#ffd23f', label: 'JEFE', glyph: '!' },
    legend: { col: '#9b5cff', ring: '#d7b8ff', label: 'LEGENDARIO', glyph: '★' },
    shiny: { col: '#2aa7d8', ring: '#bff2ff', label: 'SHINY', glyph: '✦' },
    golden: { col: '#d89a10', ring: '#ffe27a', label: '', glyph: '$' },
    chest: { col: '#b0701c', ring: '#ffd23f', label: 'COFRE GRANDE', glyph: '▣' },
    rift: { col: '#7a4fd8', ring: '#e2d0ff', label: 'GRIETA', glyph: '◆' },
  };
  const INK = '#0b1838';
  const opt = {};
  const readOpts = () => {
    for (const [t] of TYPES) opt[t] = NX.store.get('arrows:' + t, true) !== false;
    opt.replace = NX.store.get('arrows:replace', true) !== false;
    opt.dist = NX.store.get('arrows:dist', true) !== false;
    opt.on = NX.isOn(KEY);
  };
  readOpts();
  setInterval(readOpts, 1000);
  const replacing = (t) => opt.on && opt.replace && opt[t];

  // ---- ocultar las flechas del juego que reemplazamos
  let depth = 0, body = false, thiefWin = false, realRift = null, riftDesc = null, riftHidden = false;
  const offWorld = (C, x, y) => x < C.left() || x > C.left() + C.w || y < C.top() || y > C.top() + C.h;

  function hook(ns) {
    const R = ns.Rift;
    const restoreRift = () => {
      if (riftDesc) { try { Object.defineProperty(R, 'rift', riftDesc); } catch (_) { /* sigue igual */ } riftDesc = null; }
    };
    const d = ns.HUD.draw;
    ns.HUD.draw = function () {
      realRift = R ? R.rift : null;
      depth++;
      try { return d.apply(this, arguments); } finally {
        restoreRift();
        if (--depth <= 0) { depth = 0; body = false; thiefWin = false; }
      }
    };
    const T = ns.Touch, cb = T.clearButtons;
    T.clearButtons = function () {
      if (depth) {
        body = true;
        riftHidden = false;
        // La grieta fuera de vista: el juego no dibuja su flecha. El aviso de
        // apertura (primeros 4.5 s) y el marcador en pantalla se conservan.
        const rf = realRift;
        if (rf && replacing('rift') && !riftDesc && typeof rf.x === 'number' && !(rf.t < 4.5) && offWorld(ns.Camera, rf.x, rf.y - 40)) {
          const desc = Object.getOwnPropertyDescriptor(R, 'rift');
          if (desc && desc.configurable) {
            riftDesc = desc;
            Object.defineProperty(R, 'rift', { configurable: true, enumerable: desc.enumerable, get: () => null, set: () => {} });
            riftHidden = true;
          }
        }
      }
      return cb.apply(this, arguments);
    };
    const E = ns.Events, dh = E.drawHud;
    E.drawHud = function () {
      body = false;
      restoreRift();
      thiefWin = depth > 0 && replacing('golden');
      try { return dh.apply(this, arguments); } finally { thiefWin = false; }
    };
    const M = ns.EnemyMgr;
    const all = M.all;
    M.all = function () {
      const r = all.apply(this, arguments);
      return thiefWin && Array.isArray(r) ? r.filter((e) => e.behavior !== 'thief') : r;
    };
    if (typeof M.shinies === 'function') {
      const sh = M.shinies;
      M.shinies = function () { return body && replacing('shiny') ? [] : sh.apply(this, arguments); };
    }
  }

  // ---- posiciones: sin pisar el minimapa ni otras flechas
  let mapRect = null, mapAt = 0;
  function mapInHud(ctx, w) {
    const now = performance.now();
    if (now - mapAt > 250) {
      mapAt = now;
      mapRect = null;
      const m = document.getElementById('nexus-map');
      if (m && !m.classList.contains('hidden') && ctx.canvas) {
        const cr = ctx.canvas.getBoundingClientRect(), mr = m.getBoundingClientRect();
        if (cr.width > 0 && mr.width > 0) mapRect = { cr, mr };
      }
    }
    if (!mapRect) return null;
    const f = w / mapRect.cr.width, { cr, mr } = mapRect;
    return { x: (mr.left - cr.left) * f, y: (mr.top - cr.top) * f, w: mr.width * f, h: mr.height * f };
  }
  function avoidMap(ex, ey, M, W, H, r) {
    if (!r) return [ex, ey];
    const pad = M * 0.75;
    if (ex < r.x - pad || ex > r.x + r.w + pad || ey < r.y - pad || ey > r.y + r.h + pad) return [ex, ey];
    const opts = [[ex, r.y + r.h + pad], [ex, r.y - pad], [r.x - pad, ey], [r.x + r.w + pad, ey]]
      .filter(([x, y]) => x >= M && x <= W - M && y >= M && y <= H - M);
    if (!opts.length) return [ex, ey];
    opts.sort((p, q) => Math.hypot(p[0] - ex, p[1] - ey) - Math.hypot(q[0] - ex, q[1] - ey));
    return opts[0];
  }
  function spread(spots, ex, ey, M, W, H) {
    const GAP = 58, side = ex <= M + 1 || ex >= W - M - 1;
    for (let i = 0; i < 8; i++) {
      const hit = spots.find(([x, y]) => Math.hypot(x - ex, y - ey) < GAP);
      if (!hit) break;
      if (side) { const dd = ey >= hit[1] ? 1 : -1; ey = hit[1] + dd * GAP; if (ey > H - M - 125 || ey < M + 70) ey = hit[1] - dd * GAP; }
      else { const dd = ex >= hit[0] ? 1 : -1; ex = hit[0] + dd * GAP; if (ex > W - M || ex < M) ex = hit[0] - dd * GAP; }
    }
    spots.push([ex, ey]);
    return [ex, ey];
  }

  // ---- objetivos
  let chests = [], chestAt = 0;
  function targets(ns, pl) {
    const out = [];
    const M = ns.EnemyMgr;
    if (M && M.all) {
      for (const e of M.all()) {
        if (!e || e.dead) continue;
        let t = null;
        if (e.legend || e.judge) t = 'legend';
        else if (e.boss) t = 'boss';
        else if (e.shiny) t = 'shiny';
        else if (e.golden || e.behavior === 'thief') t = 'golden';
        if (t && opt[t]) out.push({ t, x: e.x, y: e.y - (e.bodyH || 30) * 0.5, e });
      }
    }
    if (opt.chest && ns.World && ns.World.specialsNear) {
      const now = performance.now();
      if (now - chestAt > 500) {
        chestAt = now;
        chests = [];
        try { for (const q of ns.World.specialsNear(pl.x, pl.y, 1600) || []) if (q && q.type === 'bigchest') chests.push(q); } catch (_) { chests = []; }
      }
      for (const q of chests) if (!q.used && !q.open && !(q.hp <= 0)) out.push({ t: 'chest', x: q.x, y: q.y - 20 });
    }
    const rf = depth ? realRift : ns.Rift && ns.Rift.rift;
    // Solo cuando el juego no dibujó la suya en este cuadro.
    if (opt.rift && riftHidden && rf && typeof rf.x === 'number') out.push({ t: 'rift', x: rf.x, y: rf.y - 40, rf });
    return out;
  }

  function label(o, metres) {
    const s = STYLE[o.t];
    let txt = s.label;
    if (o.t === 'golden') txt = o.e && o.e.behavior === 'thief' ? String(o.e.name || 'LADRÓN').toUpperCase() : 'DORADO';
    else if (o.t === 'shiny' && o.e && o.e.name) txt = 'SHINY ' + String(o.e.name).toUpperCase();
    if (o.t === 'rift' && o.rf && o.rf.ttl > 0) txt += ' · ' + Math.ceil(o.rf.ttl) + ' s';
    return opt.dist ? txt + ' · ' + metres + ' m' : txt;
  }

  function draw(ctx, W, H, pl, ns) {
    if (!pl) return;
    const list = targets(ns, pl);
    if (!list.length) return;
    const spots = [], map = mapInHud(ctx, W), t = performance.now() / 1000;
    const M = 44;
    for (const o of list) {
      const [sx, sy] = NX.toScreen(o.x, o.y);
      if (sx > 0 && sx < W && sy > 0 && sy < H) continue;
      let ex = NX.clamp(sx, M, W - M), ey = NX.clamp(sy, M + 70, H - M - 125);
      [ex, ey] = avoidMap(ex, ey, M, W, H, map);
      [ex, ey] = spread(spots, ex, ey, M, W, H);
      const a = Math.atan2(sy - ey, sx - ex), ca = Math.cos(a), sa = Math.sin(a);
      const s = STYLE[o.t], big = o.t === 'boss' || o.t === 'legend';
      const beat = 0.5 + 0.5 * Math.sin(t * 6);
      ctx.save();
      ctx.translate(ex, ey);
      if (big || o.t === 'rift') {
        ctx.globalAlpha = 0.18 + beat * 0.22;
        ctx.beginPath(); ctx.arc(0, 0, 24 + beat * 5, 0, Math.PI * 2); ctx.fillStyle = s.col; ctx.fill();
        ctx.globalAlpha = 1;
      }
      // Punta hacia el objetivo (dos para jefes y legendarios).
      const tip = (d, wd) => {
        ctx.beginPath();
        ctx.moveTo(ca * (d + 12), sa * (d + 12));
        ctx.lineTo(ca * d + Math.cos(a + Math.PI / 2) * wd, sa * d + Math.sin(a + Math.PI / 2) * wd);
        ctx.lineTo(ca * (d + 4), sa * (d + 4));
        ctx.lineTo(ca * d + Math.cos(a - Math.PI / 2) * wd, sa * d + Math.sin(a - Math.PI / 2) * wd);
        ctx.closePath();
        ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.strokeStyle = INK; ctx.stroke();
        ctx.fillStyle = s.ring; ctx.fill();
      };
      tip(16, 10);
      if (big) tip(26 + beat * 3, 8);
      // Insignia con el símbolo del tipo.
      ctx.beginPath(); ctx.arc(0, 0, 13, 0, Math.PI * 2);
      ctx.fillStyle = s.col; ctx.fill();
      ctx.lineWidth = 2.5; ctx.strokeStyle = INK; ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, 10.5, 0, Math.PI * 2);
      ctx.lineWidth = 1.5; ctx.strokeStyle = s.ring; ctx.stroke();
      ctx.font = '700 13px Pixelify,"Segoe UI",sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fff';
      ctx.fillText(s.glyph, 0, 1);
      // Texto del lado contrario a la punta.
      const metres = Math.round(Math.hypot(pl.x - o.x, pl.y - o.y) / 32);
      ctx.font = '700 11px Pixelify,"Segoe UI",sans-serif';
      ctx.textBaseline = 'alphabetic';
      const txt = label(o, metres), tw = ctx.measureText(txt).width;
      // Anclado del lado contrario a la punta, sin salirse de la pantalla.
      let lx = -ca * 22 - (ca > 0.3 ? tw : ca < -0.3 ? 0 : tw / 2);
      lx = NX.clamp(ex + lx, 4, Math.max(4, W - 4 - tw)) - ex;
      const ly = -sa * 24 + 4;
      ctx.textAlign = 'left';
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.85)'; ctx.strokeText(txt, lx, ly);
      ctx.fillStyle = s.ring; ctx.fillText(txt, lx, ly);
      ctx.restore();
    }
  }

  NX.feature({
    key: KEY,
    label: 'Flechas en el borde',
    needs: (ns) => ns.HUD && typeof ns.HUD.draw === 'function' && ns.Camera && ns.Camera.left && ns.EnemyMgr && ns.EnemyMgr.all &&
      ns.Touch && typeof ns.Touch.clearButtons === 'function' && ns.Events && typeof ns.Events.drawHud === 'function' &&
      NX.featureList().some((f) => f.key === 'hud' && f.status === 'ok'),
    setup(ns) {
      hook(ns);
      NX.hudLayers.push({ key: KEY, over(ctx, w, h, pl) { draw(ctx, w, h, pl, ns); } });
    },
  });

  NX.settings.section({
    key: KEY,
    title: 'Flechas en el borde',
    tab: 'HUD',
    keywords: 'flecha borde jefe shiny legendario cofre grieta ladrón dorado',
    render(el) {
      el.appendChild(NX.ui.toggle('Activado', 'on:' + KEY, true, readOpts));
      for (const [t, name] of TYPES) el.appendChild(NX.ui.toggle(name, 'arrows:' + t, true, readOpts));
      el.appendChild(NX.ui.toggle('Distancia en metros', 'arrows:dist', true, readOpts));
      el.appendChild(NX.ui.toggle('Reemplazar las flechas del juego', 'arrows:replace', true, readOpts));
      el.appendChild(NX.ui.note('El juego ya marca shinies, ladrones y grietas. Al reemplazarlas se evita ver flechas dobles.'));
    },
  });
})();
