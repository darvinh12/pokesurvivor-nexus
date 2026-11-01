// Aspecto del mapa: decoración del suelo, agua y lava animadas, vaivén de la
// vegetación, luz suave y sombras, con calidad ajustable.
//
// Técnica:
//  - La decoración del suelo (flores, piedrecitas, grietas, huesos, cristales,
//    sombra al pie de los muros y el resplandor de la lava en la orilla) se
//    pinta una sola vez por trozo: se envuelve Tiles.paintChunk, que el mundo
//    llama al crear cada trozo de 16×16 tiles y devuelve su canvas de 256 px.
//    Coste por cuadro: cero. De paso se guarda la lista de tiles de líquido de
//    cada trozo (con sus orillas) para las animaciones, sin tocar World.kindAt.
//  - Caché: el mundo guarda sus trozos en un Map que World.setBiome sustituye
//    al cambiar de bioma, así que un bioma nuevo se repinta solo con su propia
//    decoración. Cuando cambia algo de este módulo (activado, calidad,
//    decoración, modo rendimiento o la bajada automática) se fuerza el
//    repintado con setBiome(actual + 1, true) y setBiome(actual, true): las dos
//    llamadas son síncronas y solo renuevan el Map de trozos (la segunda deja
//    el mismo bioma, sin fundido).
//  - Lo animado va en map-look-live.js y se dibuja desde tres envolturas:
//    World.drawLiquid (espacio del mundo, bajo props y entidades),
//    World.drawProp (vaivén y sombra de cada prop) y World.drawVignette
//    (espacio de pantalla, antes de la viñeta del juego y del HUD: la luz).
// Con el módulo apagado las envolturas llaman al original sin más y los trozos
// se repintan sin decoración, así que el juego queda intacto.
(() => {
  const KEY = 'maplook';
  const L = NX.mapLook || (NX.mapLook = {});
  const QTXT = ['Apagado', 'Bajo', 'Medio', 'Alto'];
  const coarse = (() => { try { return matchMedia('(pointer: coarse)').matches; } catch (_) { return false; } })();
  const DEF_Q = coarse ? '1' : '2';
  let ns = null;
  let autoCap = 3;      // tope de la bajada automática (solo en esta sesión)
  let autoNote = '';

  L.KEY = KEY;
  L.opt = (k, d = true) => NX.store.get('look:' + k, d) !== false;
  L.userQ = () => NX.clamp(Math.round(+NX.store.get('look:q', DEF_Q) || 0), 0, 3);
  L.perfMode = () => NX.isOn('sharp') && NX.store.get('res', 'game') === 'perf';
  L.level = () => (NX.isOn(KEY) ? Math.min(L.userQ(), L.perfMode() ? 1 : 3, autoCap) : 0);
  L.liq = new Map(); // "cx,cy" -> Int32Array [tx, ty, orillas, ...]

  // ---------------------------------------------------------------- utilidades
  const hash = (x, y, s) => {
    let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 982451653)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
  L.hash = hash;
  const rgb = (c) => {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(c || '').trim());
    if (!m) return [128, 128, 128];
    const n = parseInt(m[1], 16);
    return [n >> 16 & 255, n >> 8 & 255, n & 255];
  };
  L.rgb = rgb;
  const shade = (c, k) => { const [r, g, b] = rgb(c); const f = (v) => Math.round(NX.clamp(v * k, 0, 255)); return `rgb(${f(r)},${f(g)},${f(b)})`; };
  const rgba = (c, a) => { const [r, g, b] = rgb(c); return `rgba(${r},${g},${b},${a})`; };
  L.rgba = rgba;
  const pick = (a, r) => (Array.isArray(a) && a.length ? a[Math.floor(r * a.length) % a.length] : a);

  // Estilo de decoración según el bioma: por nombre y, si no hay coincidencia,
  // por el tipo de líquido y de prop. Cubre los 25 del juego, los 5 de Nexus y
  // las arenas (que usan los biomas de grieta).
  const BY_NAME = [
    [/calabaza/i, 'harvest'],
    [/glaciar|tundra|boreal|hielo|nieve/i, 'ice'],
    [/volc|[íi]gneo|juicio|ceniza|drag[óo]n/i, 'volcano'],
    [/desierto|dunas|cantera|ocaso/i, 'desert'],
    [/ci[ée]naga|pantano|miasma|t[óo]xic/i, 'swamp'],
    [/voltio|ne[óo]n|acero|callej[óo]n/i, 'city'],
    [/cementerio|fantasma|embrujad|tenebroso/i, 'ghost'],
    [/cueva|gruta|templo|cristal/i, 'cave'],
  ];
  const styleCache = new WeakMap();
  L.styleOf = (pal) => {
    if (!pal) return 'forest';
    let s = styleCache.get(pal);
    if (s) return s;
    const hit = BY_NAME.find(([re]) => re.test(pal.name || ''));
    s = hit ? hit[1] : pal.prop === 'crystal' ? 'cave' : pal.prop === 'tree' ? 'forest' : pal.liquid === 'lava' ? 'volcano' : pal.liquid === 'ice' ? 'ice' : 'desert';
    styleCache.set(pal, s);
    return s;
  };

  // ---------------------------------------------------------------- decoración
  // Sprites de pixel art: un carácter es un píxel del trozo (2 px del mundo,
  // igual que Sprites.PX). '.' es transparente; las letras se resuelven con la
  // paleta del bioma en colors().
  const SPR = {
    pebble: ['.LM.', 'LMMD', 'SDDS'],
    gravel: ['L...', '.M.L', 'M..D'],
    crack: ['K....', '.K...', '.KK..', '...K.', '...KK'],
    ember: ['K.....', '.KE...', '..KEK.', '....EK', '.....K'],
    iceCrack: ['H....', '.HK..', '..H..', '..KH.', '....H'],
    flower: ['.A.', 'ACA', '.A.', '.G.'],
    flowers2: ['A..B', 'G..G'],
    tuft: ['g..g.', '.gG.g', '.GGG.'],
    leaf: ['.A...', 'AB...', '...A.', '..BA.'],
    mushroom: ['.RR.', 'RWRR', '.ww.'],
    bone: ['WW...WW', '.WWWWW.', 'WW...WW', '.SSSSS.'],
    skull: ['.WWW.', 'WKWKW', 'WWWWW', '.WKW.'],
    crystal: ['..B.', '.CB.', '.CBC', 'CCBC', 'SSSS'],
    crystalS: ['.B', 'CB', 'SS'],
    snow: ['.LL.', 'LLLL', 'MLLM', '.SS.'],
    ash: ['D.M', '.D.', 'M..'],
    stick: ['DD...', '.MDD.', '...MD'],
    reed: ['T..T', 'g.Tg', 'g.g.', 'GGG.'],
    puddle: ['.AAA.', 'ABBBA', '.AAA.'],
    grate: ['KKKKK', 'KMKMK', 'KKKKK', 'KMKMK', 'KKKKK'],
    cable: ['K.....', '.KK...', '...KKK'],
    neon: ['.N.', 'NWN', '.N.'],
    candle: ['.Y.', '.O.', '.W.', '.W.', 'SWS'],
    grave: ['.MM.', 'MLLM', 'MKLM', 'MLLM', 'DDDD'],
    wisp: ['.P.', 'PWP', '.P.'],
    moss: ['.A.', 'ABA', '.A.'],
    pumpkin: ['..g..', '.OOO.', 'OoOoO', '.OOO.'],
  };
  const COMPILED = {};
  for (const [k, rows] of Object.entries(SPR)) {
    const px = [];
    rows.forEach((row, y) => { for (let x = 0; x < row.length; x++) if (row[x] !== '.') px.push(x, y, row[x]); });
    COMPILED[k] = { w: Math.max(...rows.map((r) => r.length)), h: rows.length, px };
  }

  // Tabla de cada estilo: [sprite, peso].
  const STYLES = {
    forest: [['flower', 3], ['flowers2', 2], ['tuft', 3], ['pebble', 2], ['leaf', 2], ['mushroom', 1], ['crack', 0.4]],
    cave: [['crystal', 3], ['crystalS', 2], ['pebble', 3], ['gravel', 2], ['crack', 2], ['moss', 1]],
    volcano: [['ember', 3], ['ash', 2], ['pebble', 2], ['stick', 1.5], ['bone', 1], ['skull', 0.3]],
    desert: [['pebble', 3], ['gravel', 2], ['crack', 2], ['bone', 1.6], ['skull', 0.4], ['tuft', 2]],
    ice: [['snow', 3], ['crystalS', 2], ['crystal', 1], ['iceCrack', 2], ['pebble', 1]],
    swamp: [['reed', 3], ['mushroom', 2], ['puddle', 1.2], ['leaf', 2], ['tuft', 1.5], ['bone', 0.4]],
    city: [['grate', 1.2], ['crack', 2], ['cable', 1.5], ['neon', 2], ['gravel', 1.5]],
    ghost: [['candle', 0.8], ['grave', 0.6], ['bone', 1.4], ['skull', 0.5], ['crack', 2], ['wisp', 1.2], ['gravel', 1]],
    harvest: [['pumpkin', 1.5], ['leaf', 3], ['tuft', 2], ['bone', 0.6], ['candle', 0.4], ['pebble', 1]],
  };
  const TOTAL = {};
  for (const [k, list] of Object.entries(STYLES)) TOTAL[k] = list.reduce((s, [, w]) => s + w, 0);
  const choose = (style, r) => {
    const list = STYLES[style] || STYLES.forest;
    let x = r * TOTAL[style];
    for (const [k, w] of list) { if ((x -= w) < 0) return k; }
    return list[list.length - 1][0];
  };

  // Colores de cada sprite según la paleta del bioma y el estilo.
  function colors(name, P, style, r) {
    const rock = P.rock || ['#555', '#777', '#999'];
    const grass = P.grass || P.leaf || ['#3a6', '#4b7', '#6c9'];
    const leaf = P.leaf || grass;
    const S = 'rgba(0,0,0,.22)';
    const K = shade((P.dirt || P.floor || ['#444'])[0], 0.62);
    const base = { L: rock[2], M: rock[1], D: rock[0], S, K };
    switch (name) {
      case 'crack': return { K };
      case 'ember': return { K: shade(P.wallEdge || '#300', 1), E: P.liq || '#ff5a1f' };
      case 'iceCrack': return { H: P.light || '#fff', K: shade(P.floor ? P.floor[0] : '#ccd', 0.82) };
      case 'flower': return { A: pick(P.flowers, r), C: P.light || '#fff', G: grass[0] };
      case 'flowers2': return { A: pick(P.flowers, r), B: pick(P.flowers, 1 - r), G: grass[1] || grass[0] };
      case 'tuft': return { g: grass[2] || grass[0], G: grass[1] || grass[0] };
      case 'leaf': return style === 'harvest' ? { A: '#d9782a', B: '#a8501c' } : { A: leaf[1] || leaf[0], B: leaf[2] || leaf[0] };
      case 'mushroom': return style === 'swamp' ? { R: '#9b5ad8', W: '#e9d8ff', w: '#d8cfc0' } : { R: '#d8443a', W: '#fff4e0', w: '#e8dcc4' };
      case 'bone': case 'skull': return { W: '#e8e0cc', K: '#5a5040', S };
      case 'crystal': case 'crystalS': return style === 'ice'
        ? { C: '#9fe4f0', B: '#f2ffff', S }
        : { C: leaf[1] || '#6fe6cc', B: leaf[3] || leaf[2] || '#fff', S };
      case 'snow': return { L: '#f6fbff', M: '#d6e6ee', S: 'rgba(40,70,90,.18)' };
      case 'ash': case 'stick': return { D: '#2a2422', M: '#4a403a' };
      case 'reed': return { T: '#6a4628', g: grass[2] || grass[0], G: grass[1] || grass[0] };
      case 'puddle': return { A: P.liqDeep || '#335', B: P.liq || '#447' };
      case 'grate': return { K: shade(P.floor ? P.floor[0] : '#333', 0.6), M: shade(P.floor ? P.floor[0] : '#333', 1.25) };
      case 'cable': return { K: '#141420' };
      case 'neon': return { N: pick(P.flowers, r), W: '#ffffff' };
      case 'candle': return { Y: '#ffe27a', O: '#ff9a3d', W: '#efe6d2', S };
      case 'grave': return base;
      case 'wisp': return { P: pick(P.flowers, r), W: '#ffffff' };
      case 'moss': return { A: leaf[1] || '#6fe6cc', B: leaf[3] || '#fff' };
      case 'pumpkin': return { O: '#e8781e', o: '#b04e0e', g: '#3f6b2a' };
      default: return base;
    }
  }

  function stamp(g, name, ox, oy, cols, flip) {
    const s = COMPILED[name];
    const p = s.px;
    let last = null;
    for (let i = 0; i < p.length; i += 3) {
      const c = cols[p[i + 2]];
      if (!c) continue;
      if (c !== last) { g.fillStyle = c; last = c; }
      g.fillRect(ox + (flip ? s.w - 1 - p[i] : p[i]), oy + p[i + 1], 1, 1);
    }
  }

  const DENSITY = [0, 0.07, 0.12, 0.17];
  const NB = [[0, -1], [1, 0], [0, 1], [-1, 0]];

  // Se llama justo después del Tiles.paintChunk original.
  function decorate(canvas, cx, cy, N, kindFn, biome, seed) {
    const T = ns.Tiles;
    const P = T.BIOMES[biome];
    const TT = T.T || 16;
    if (!P || !canvas || typeof kindFn !== 'function') return;
    const q = L.level();
    const tx0 = cx * N, ty0 = cy * N;
    const kind = (x, y) => kindFn(x, y);
    // Líquidos con orillas (bit 1 norte, 2 este, 4 sur, 8 oeste = tile vecino sin líquido).
    const liq = [];
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const X = tx0 + i, Y = ty0 + j;
        if (kind(X, Y) !== 'liquid') continue;
        let m = 0;
        for (let d = 0; d < 4; d++) if (kind(X + NB[d][0], Y + NB[d][1]) !== 'liquid') m |= 1 << d;
        liq.push(X, Y, m);
      }
    }
    L.liq.set(cx + ',' + cy, Int32Array.from(liq));
    if (L.liq.size > 160) L.liq.delete(L.liq.keys().next().value);
    if (!q || !L.opt('decor')) return;

    const g = canvas.getContext('2d');
    if (!g) return;
    const style = L.styleOf(P);
    const dens = DENSITY[q];
    const glowLiquid = P.liquid === 'lava' || P.liquid === 'spark' || P.liquid === 'poison';
    const s0 = (seed | 0) ^ 0x5bd1;
    g.save();
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const X = tx0 + i, Y = ty0 + j;
        if (kind(X, Y) !== 'floor') continue;
        const n = kind(X, Y - 1), e = kind(X + 1, Y), s = kind(X, Y + 1), w = kind(X - 1, Y);
        const px = i * TT, py = j * TT;
        if (q >= 2) {
          // Sombra suave al pie de los muros (luz desde arriba a la izquierda).
          if (n === 'wall') {
            g.fillStyle = 'rgba(0,0,0,.20)'; g.fillRect(px, py, TT, 1);
            g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(px, py + 1, TT, 1);
            g.fillStyle = 'rgba(0,0,0,.06)'; g.fillRect(px, py + 2, TT, 1);
          }
          if (w === 'wall') { g.fillStyle = 'rgba(0,0,0,.10)'; g.fillRect(px, py, 1, TT); }
          // Resplandor de la lava, la electricidad o el veneno sobre la orilla.
          if (glowLiquid) {
            const sides = [n, e, s, w];
            for (let d = 0; d < 4; d++) {
              if (sides[d] !== 'liquid') continue;
              for (let k = 0; k < 4; k++) {
                g.fillStyle = rgba(P.liq, [0.16, 0.10, 0.06, 0.03][k]);
                if (d === 0) g.fillRect(px, py + k, TT, 1);
                else if (d === 2) g.fillRect(px, py + TT - 1 - k, TT, 1);
                else if (d === 1) g.fillRect(px + TT - 1 - k, py, 1, TT);
                else g.fillRect(px + k, py, 1, TT);
              }
            }
          }
        }
        // Detalles solo en suelo despejado: lejos de muros y líquidos.
        if (n !== 'floor' || e !== 'floor' || s !== 'floor' || w !== 'floor') continue;
        const r = hash(X, Y, s0);
        if (r >= dens) continue;
        const r2 = hash(X, Y, s0 + 1), r3 = hash(X, Y, s0 + 2), r4 = hash(X, Y, s0 + 3);
        const name = choose(style, r2);
        const sp = COMPILED[name];
        const ox = px + Math.floor(r3 * (TT - sp.w)), oy = py + Math.floor(r4 * (TT - sp.h));
        stamp(g, name, ox, oy, colors(name, P, style, r3), r4 < 0.5);
      }
    }
    g.restore();
  }

  // Repinta los trozos del mundo (ver la nota de caché al inicio).
  L.refresh = () => {
    const W = ns && ns.World;
    if (!W || typeof W.setBiome !== 'function') return;
    const b = W.biome;
    if (typeof b !== 'number') return;
    W.setBiome(b + 1, true);
    W.setBiome(b, true);
  };

  // ---------------------------------------------------------------- medidor de FPS
  // Cuenta los cuadros reales del juego (World.drawVignette se llama una vez
  // por cuadro en partida). Si la media de dos ventanas seguidas de 2 s queda
  // por debajo de 45 (o del 75 % del límite de FPS de Nitidez), baja un nivel.
  let fN = 0, fT = 0, lastF = 0, lowWin = 0;
  L.fps = 0;
  L.tick = (now) => {
    if (ns.Game.state !== 'playing' || document.hidden) { fN = 0; fT = 0; lowWin = 0; return; }
    if (!fT || now - lastF > 250) { fT = now; fN = 0; }
    lastF = now;
    fN++;
    if (now - fT < 2000) return;
    L.fps = (fN * 1000) / (now - fT);
    fN = 0; fT = now;
    if (!L.opt('auto')) { lowWin = 0; return; }
    const cap = NX.isOn('sharp') ? +NX.store.get('fps', 0) || 0 : 0;
    const thr = cap ? Math.min(45, cap * 0.75) : 45;
    if (L.fps >= thr) { lowWin = 0; return; }
    if (++lowWin < 2) return;
    lowWin = 0;
    const cur = L.level();
    if (cur <= 1) return;
    autoCap = cur - 1;
    autoNote = `Bajada automática a ${QTXT[autoCap]} (${Math.round(L.fps)} FPS).`;
    NX.toast(`Aspecto del mapa: calidad ${QTXT[autoCap]} para mantener la fluidez`);
  };

  // ---------------------------------------------------------------- ganchos
  function hook() {
    const T = ns.Tiles, W = ns.World;
    const origPaint = T.paintChunk;
    T.paintChunk = function (cx, cy, N, kindFn, hFn, biome, seed) {
      const cv = origPaint.apply(this, arguments);
      if (NX.isOn(KEY)) {
        try { decorate(cv, cx, cy, N, kindFn, biome, seed); } catch (err) { NX.trip(KEY, err); }
      }
      return cv;
    };

    const origLiquid = W.drawLiquid;
    W.drawLiquid = function (ctx, cam, t) {
      const r = origLiquid.apply(this, arguments);
      // Sin animaciones extra mientras una ventana tapa el fondo del menú.
      L.frameQ = NX.menuCovered && NX.menuCovered() ? 0 : L.level();
      if (L.frameQ && L.liquids) {
        ctx.save();
        try { L.liquids(ctx, cam, t, L.frameQ); } catch (err) { NX.trip(KEY, err); }
        ctx.restore();
      } else if (L.resetFrame) L.resetFrame();
      return r;
    };

    const origProp = W.drawProp;
    W.drawProp = function (ctx, prop, t) {
      if (!L.frameQ || L.frameQ < 2 || !L.prop || !prop || prop.flat) return origProp.apply(this, arguments);
      return L.prop(ctx, prop, t, origProp, this, arguments);
    };

    const origVig = W.drawVignette;
    W.drawVignette = function (ctx, w, h) {
      if (NX.isOn(KEY) && NX.inRun()) {
        const now = performance.now();
        try { L.tick(now); } catch (err) { NX.trip(KEY, err); }
        if (L.frameQ >= 2 && L.light) {
          ctx.save();
          try { L.light(ctx, w, h, L.frameQ, now / 1000); } catch (err) { NX.trip(KEY, err); }
          ctx.restore();
        }
      }
      return origVig.apply(this, arguments);
    };
  }

  // Cualquier cambio que afecte lo pintado en los trozos los repinta.
  let sig = null;
  const sigNow = () => `${L.level()}|${L.opt('decor') ? 1 : 0}`;
  function watch() {
    const s = sigNow();
    if (s === sig) return;
    sig = s;
    L.refresh();
  }

  NX.feature({
    key: KEY,
    label: 'Aspecto del mapa',
    needs: (n) => n.Tiles && typeof n.Tiles.paintChunk === 'function' && Array.isArray(n.Tiles.BIOMES) && n.World &&
      typeof n.World.drawLiquid === 'function' && typeof n.World.drawProp === 'function' &&
      typeof n.World.drawVignette === 'function' && typeof n.World.setBiome === 'function' && n.Camera && n.Game,
    setup(n) {
      ns = n;
      L.ns = n;
      hook();
      watch();
      NX.every(500, () => { try { watch(); } catch (err) { NX.trip(KEY, err); } }, { key: KEY });
    },
  });

  NX.settings.section({
    key: KEY,
    tab: 'Estilo',
    title: 'Aspecto del mapa',
    keywords: 'mapa suelo decoración flores piedras agua lava olas espuma hierba árboles vaivén luz sombras día tarde calidad rendimiento fps',
    render(el) {
      const again = () => { try { watch(); } catch (_) { /* se reintenta en el siguiente sondeo */ } };
      el.appendChild(NX.ui.toggle('Activado', 'on:' + KEY, true, again));
      el.appendChild(NX.ui.select('Calidad', 'look:q', QTXT.map((t, i) => [String(i), t]), DEF_Q, () => { autoCap = 3; autoNote = ''; again(); }));
      el.appendChild(NX.ui.toggle('Decoración del suelo', 'look:decor', true, again));
      el.appendChild(NX.ui.toggle('Agua y líquidos animados', 'look:liquid', true));
      el.appendChild(NX.ui.toggle('Vaivén de hierba y árboles', 'look:sway', true));
      el.appendChild(NX.ui.toggle('Luz suave y sombras', 'look:light', true));
      el.appendChild(NX.ui.toggle('Ciclo sutil de día y tarde', 'look:cycle', false));
      el.appendChild(NX.ui.toggle('Bajar la calidad sola si los FPS caen de 45', 'look:auto', true));
      const lv = L.level();
      const why = !NX.isOn(KEY) ? '' : L.perfMode() && L.userQ() > 1 ? ' Limitada a Bajo por el modo rendimiento de Nitidez.' : autoNote ? ' ' + autoNote : '';
      el.appendChild(NX.ui.note(`En uso: ${QTXT[lv]}.${why} Bajo: decoración y brillo del agua. Medio: suma orillas, lava y burbujas, vaivén, luz y sombras. Alto: más detalle, chispas y luciérnagas.`));
    },
  });
})();
