// Biomas Nexus: paletas propias que se suman a Tiles.BIOMES (siempre por
// nombre, nunca por índice), con enemigos, jefes y clima de cada bioma.
// Opciones: meterlos en la rotación normal de etapas, empezar en uno y
// quedarse en él toda la partida. Los ganchos (Tiles.runBiome, Enemies.bagAt,
// Enemies.rollRun, Game.startRun) se instalan una sola vez y pasan de largo
// con el módulo apagado o fuera de partida, así que el juego queda intacto.
// Las paletas se quedan al final de BIOMES: el juego nunca llega a esos
// índices por su cuenta.
(() => {
  const KEY = 'biomes';
  const STAGE = 240; // segundos por etapa, igual que el juego

  // Paleta completa en el formato del juego más los datos de Nexus.
  const DEFS = [
    {
      types: ['ground', 'fire', 'rock'], weather: 'sand', theme: 'ground',
      pal: {
        name: 'Dunas del Ocaso', liquid: 'lava',
        floor: ['#d9a06a', '#dea873', '#cf9661'], dirt: ['#c4875a', '#bd8052', '#ca8f62'],
        speck: '#b47548', light: '#f0c08c', flowers: ['#ff7a4a', '#ffd76a', '#fff1d6'],
        wallTop: ['#a8603e', '#b26b47', '#9c5838'], wallLight: '#e09a6e', wallEdge: '#3a1a10',
        wallFace: ['#7a3f28', '#6e3823'], wallFaceDark: '#4a2417',
        liq: '#ff5a1f', liqDeep: '#c93a12', foam: '#ffd08a', shore: '#8a4a2a',
        prop: 'dead', leaf: ['#7a4a2e', '#94603c', '#b07a4c', '#d9a878'], trunk: ['#5e3420', '#7a4a2e'],
        rock: ['#9a5f40', '#b87a55', '#d39c74'], grass: ['#b0763e', '#cf9a52', '#e8c27e'],
      },
    },
    {
      types: ['ice', 'water', 'steel'], weather: 'snow', theme: 'ice',
      pal: {
        name: 'Tundra Boreal', liquid: 'ice',
        floor: ['#dfeef2', '#e6f3f6', '#d4e6eb'], dirt: ['#c2d8de', '#bad2d9', '#c9dde2'],
        speck: '#aac6cf', light: '#f4fbfd', flowers: ['#7ff0c8', '#b4a8ff', '#ffffff'],
        wallTop: ['#6e9fb0', '#78a9ba', '#6496a7'], wallLight: '#a9d4e0', wallEdge: '#1c2e38',
        wallFace: ['#4a7384', '#426878'], wallFaceDark: '#2f4c59',
        liq: '#8ee6f0', liqDeep: '#5fbccc', foam: '#ffffff', shore: '#9cbcc6',
        prop: 'crystal', leaf: ['#3fc9b0', '#6fe6cc', '#a8f7e4', '#e6fff8'], trunk: ['#3d6f86', '#5590aa'],
        rock: ['#86a8b6', '#a3c3cf', '#c4dde5'], grass: ['#9cc9c4', '#bfe3dc', '#e0f5f0'],
      },
    },
    {
      types: ['poison', 'bug', 'ghost'], weather: 'fog', theme: 'poison',
      pal: {
        name: 'Pantano Miasma', liquid: 'poison',
        floor: ['#4a5634', '#515e39', '#44502f'], dirt: ['#3d462a', '#414b2d', '#384127'],
        speck: '#333c23', light: '#6f7e4c', flowers: ['#b4ff4a', '#d07bff', '#f2e36a'],
        wallTop: ['#3b3a2c', '#454434', '#353427'], wallLight: '#77765a', wallEdge: '#121109',
        wallFace: ['#2a291f', '#25241b'], wallFaceDark: '#1a1913',
        liq: '#7fd03a', liqDeep: '#5a9c26', foam: '#d9ff9a', shore: '#36402a',
        prop: 'dead', leaf: ['#3a4228', '#4d5634', '#5f6a40', '#8c9670'], trunk: ['#2c2a1e', '#3d3a2a'],
        rock: ['#4f5440', '#666b52', '#868b70'], grass: ['#4f6a2a', '#6f8f38', '#9cba5a'],
      },
    },
    {
      types: ['electric', 'steel', 'dark'], weather: 'rain', theme: 'electric',
      pal: {
        name: 'Ciudad Neón', liquid: 'spark',
        floor: ['#2c2f45', '#31344c', '#282a3f'], dirt: ['#24263a', '#26283d', '#222436'],
        speck: '#3d4160', light: '#4f5580', flowers: ['#ff4fd8', '#4ff0ff', '#ffe14d'],
        wallTop: ['#3a2d5c', '#443569', '#342852'], wallLight: '#ff5ce1', wallEdge: '#0b0816',
        wallFace: ['#241c3d', '#1f1836'], wallFaceDark: '#150f26',
        liq: '#29e0ff', liqDeep: '#1aa3c4', foam: '#d6fbff', shore: '#22243a',
        prop: 'crystal', leaf: ['#b23cff', '#ff4fd8', '#ff9cf0', '#ffffff'], trunk: ['#2e2a52', '#45407a'],
        rock: ['#3f4366', '#575c85', '#767ca8'], grass: ['#3a3f6a', '#4f5aa0', '#7ad0ff'],
      },
    },
    {
      types: ['ghost', 'psychic', 'dark'], weather: null, theme: 'ghost',
      pal: {
        name: 'Torre Fantasma', liquid: 'water',
        floor: ['#4b4560', '#524b68', '#463f59'], dirt: ['#3e3950', '#423c55', '#3a354b'],
        speck: '#5c5578', light: '#7a71a0', flowers: ['#8affd8', '#c79bff', '#f0eaff'],
        wallTop: ['#2c2640', '#352e4c', '#28223a'], wallLight: '#8f84c0', wallEdge: '#0c0a14',
        wallFace: ['#1f1a30', '#1b172a'], wallFaceDark: '#120f1d',
        liq: '#4fd9c0', liqDeep: '#2f9c8c', foam: '#c9fff2', shore: '#2f2a42',
        prop: 'dead', leaf: ['#3a3352', '#4b4268', '#5d5380', '#9a90c0'], trunk: ['#262035', '#332b47'],
        rock: ['#4f4866', '#655d82', '#8a83a8'], grass: ['#45406a', '#5f588c', '#8f88bb'],
      },
    },
  ];
  const NAMES = DEFS.map((d) => d.pal.name);
  const BY_NAME = new Map(DEFS.map((d) => [d.pal.name, d]));

  let ns = null;
  let run = null;      // { start, list, lock } de la partida en curso
  let starting = false;
  const bagCache = { key: '', bag: null };

  const opt = (k, d) => NX.store.get('biome:' + k, d);
  const on = () => NX.isOn(KEY);
  const idx = (name) => (ns ? ns.Tiles.BIOMES.findIndex((b) => b && b.name === name) : -1);
  const defAt = (i) => { const b = ns && ns.Tiles.BIOMES[i]; return (b && BY_NAME.get(b.name)) || null; };
  const live = () => !!run && on() && (starting || (ns.Game.state !== 'ui'));
  const modeLock = () => { const c = NX.modes && NX.modes.ctx && NX.modes.ctx(); return c && c.biomeLock != null ? c.biomeLock : null; };

  // Agrega (o refresca) las paletas al final de BIOMES.
  function ensure() {
    const B = ns.Tiles.BIOMES;
    for (const d of DEFS) {
      const i = idx(d.pal.name);
      if (i < 0) B.push(JSON.parse(JSON.stringify(d.pal)));
    }
  }

  function planRun(orig) {
    ensure();
    const mine = NAMES.map(idx).filter((i) => i >= 0);
    const o = [0, 1, 2].map((s) => orig(s));
    // Por defecto ('any') cada partida empieza en un mapa al azar entre los del
    // juego y los nuevos, y el resto de la rotación también sale en orden aleatorio.
    const sel = String(opt('start', 'any'));
    let start = null, list = null;
    if (sel === 'any') {
      const pool = [...new Set([...o, ...mine])].filter((v) => v != null && v >= 0);
      for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
      start = pool[0];
      if (opt('rot', true)) list = pool;
    } else {
      if (sel === 'random') start = mine[Math.floor(Math.random() * mine.length)];
      else if (sel) { const i = idx(sel); if (i >= 0) start = i; }
      if (opt('rot', true)) list = [o[0], mine[0], o[1], mine[1], o[2], mine[2], mine[3], mine[4]].filter((v) => v != null && v >= 0);
    }
    return { start, list, lock: !!opt('lock', false) && start != null, k: list && start != null ? Math.max(0, list.indexOf(start)) : 0 };
  }

  // ---------------------------------------------------------------- enemigos
  function tierOf(t) {
    const T = ns.Enemies.TIERS || [];
    let k = 0;
    for (let i = 0; i < T.length; i++) if (t >= T[i].from) k = i;
    return k;
  }
  function biomeBag(d, t) {
    const key = d.pal.name + '|' + tierOf(t) + '|' + Math.floor(t / 90);
    if (bagCache.key === key && bagCache.bag) return bagCache.bag;
    const E = ns.Enemies;
    const [a, b, c] = d.types;
    let bag = [];
    try {
      const A = E.hordeDefs(a, t) || [];
      bag = A.concat(A, E.hordeDefs(b, t) || [], E.hordeDefs(c, t) || []);
    } catch (err) { NX.trip(KEY, err); bag = []; }
    if (bag.length < 6) return null; // tramo sin suficientes Pokémon del tipo: el juego decide
    try { ns.Sprites.preload([...new Set(bag.map((x) => x.dex))]); } catch (_) { /* se cargan al aparecer */ }
    bagCache.key = key;
    bagCache.bag = bag;
    return bag;
  }

  // ---------------------------------------------------------------- jefes
  function bossFor(d, slot, used) {
    const SM = ns.SPRITE_META || {};
    const lo = (slot && slot.bst ? slot.bst[0] : 480) - 40, hi = (slot && slot.bst ? slot.bst[1] : 600) + 60;
    const pool = Object.values(ns.DEX_BY || {}).filter((m) => m && m.types && m.bst >= lo && m.bst <= hi &&
      SM[m.dex] && !used.has(m.dex) && m.types.some((ty) => d.types.includes(ty)));
    if (!pool.length) return null;
    const first = pool.filter((m) => m.types.includes(d.types[0]));
    const src = first.length >= 3 ? first : pool;
    return src[Math.floor(Math.random() * src.length)];
  }
  function mutateBosses() {
    const E = ns.Enemies, B = E.BOSSES;
    if (!Array.isArray(B) || !opt('boss', true)) return;
    const used = new Set(B.map((b) => b.dex));
    const pre = [];
    B.forEach((b, i) => {
      const stage = Math.floor((b.at || 0) / STAGE);
      const d = defAt(ns.Tiles.runBiome(stage));
      if (!d) return;
      const m = bossFor(d, (E.BOSS_SLOTS || [])[i], used);
      if (!m) return;
      used.add(m.dex);
      b.dex = m.dex;
      b.name = m.name;
      b.nxBiome = d.pal.name;
      pre.push(m.dex);
    });
    if (pre.length) { try { ns.Sprites.preload(pre); } catch (_) { /* nada */ } }
  }

  // ---------------------------------------------------------------- ganchos
  function hook() {
    const T = ns.Tiles, E = ns.Enemies, G = ns.Game;
    const rb = T.runBiome;
    const orig = (s) => rb.call(T, s);
    T.runBiome = function (stage) {
      const lock = modeLock();
      if (lock != null) return lock;
      if (!live()) return rb.apply(this, arguments);
      try {
        const s = Math.max(0, stage | 0);
        if (run.start != null && (s === 0 || run.lock)) return run.start;
        if (run.list && run.list.length) return run.list[(s + run.k) % run.list.length];
      } catch (err) { NX.trip(KEY, err); }
      return rb.apply(this, arguments);
    };

    const start = G.startRun;
    G.startRun = function (opts) {
      run = null;
      bagCache.key = '';
      if (on() && !opts && !(ns.Coop && ns.Coop.active)) {
        try { run = planRun(orig); } catch (err) { NX.trip(KEY, err); run = null; }
      }
      starting = true;
      try { return start.apply(this, arguments); } finally { starting = false; }
    };

    const bag = E.bagAt;
    E.bagAt = function (t) {
      if (!live() || !opt('foes', true)) return bag.apply(this, arguments);
      const d = defAt(ns.World.biome);
      if (!d) return bag.apply(this, arguments);
      const ev = ns.Events && ns.Events.bag && ns.Events.bag();
      if (ev) return ev;
      return biomeBag(d, +t || 0) || bag.apply(this, arguments);
    };

    const roll = E.rollRun;
    E.rollRun = function () {
      const r = roll.apply(this, arguments);
      if (live()) { try { mutateBosses(); } catch (err) { NX.trip(KEY, err); } }
      return r;
    };
  }

  // Clima ambiental al entrar en un bioma propio.
  let lastBiome = -1;
  function watch() {
    if (!ns || !on() || !NX.inRun()) { lastBiome = -1; return; }
    const b = ns.World.biome;
    if (b === lastBiome) return;
    lastBiome = b;
    const d = defAt(b);
    if (!d || !d.weather || !opt('weather', true)) return;
    if ((ns.Judgment && ns.Judgment.active) || (ns.Rift && ns.Rift.inArena)) return;
    const W = ns.Weather;
    try { if (W && W.force && !(W.current && W.current.kind === d.weather)) W.force(d.weather, 150); } catch (err) { NX.trip(KEY, err); }
  }

  // API para otros módulos (mapas y mazmorra).
  NX.biomes = {
    names: () => NAMES.slice(),
    index: (name) => { if (ns) ensure(); return idx(name); },
    def: (name) => { const d = BY_NAME.get(name); return d ? { name, types: d.types.slice(), weather: d.weather, theme: d.theme, liquid: d.pal.liquid } : null; },
    active: () => on(),
  };

  NX.feature({
    key: KEY,
    label: 'Biomas Nexus',
    needs: (n) => n.Tiles && Array.isArray(n.Tiles.BIOMES) && typeof n.Tiles.runBiome === 'function' && n.World &&
      typeof n.World.setBiome === 'function' && n.Enemies && typeof n.Enemies.bagAt === 'function' &&
      typeof n.Enemies.hordeDefs === 'function' && typeof n.Enemies.rollRun === 'function' && n.Game && typeof n.Game.startRun === 'function',
    setup(n) {
      ns = n;
      ensure();
      hook();
      NX.runs.on('end', () => { run = null; bagCache.key = ''; bagCache.bag = null; });
      NX.every(500, () => { try { watch(); } catch (err) { NX.trip(KEY, err); } }, { when: 'run', key: KEY, leave: true });
    },
  });

  NX.settings.section({
    key: KEY,
    tab: 'Partida',
    title: 'Biomas Nexus',
    keywords: 'biomas bioma mapa desierto dunas tundra glaciar pantano ciénaga ciudad neón torre fantasma rotación enemigos jefes clima',
    render(el) {
      el.appendChild(NX.ui.toggle('Activado', 'on:' + KEY, true));
      el.appendChild(NX.ui.note('Cinco biomas nuevos: ' + NAMES.join(', ') + '. Cada uno trae sus propios enemigos, jefes y clima.'));
      el.appendChild(NX.ui.toggle('Sumarlos a la rotación de etapas', 'biome:rot', true));
      el.appendChild(NX.ui.select('Empezar en bioma', 'biome:start', [['any', 'Cualquiera al azar'], ['', 'El del juego'], ['random', 'Uno nuevo al azar'], ...NAMES.map((n) => [n, n])], 'any'));
      el.appendChild(NX.ui.toggle('Quedarse en el bioma inicial toda la partida', 'biome:lock', false));
      el.appendChild(NX.ui.toggle('Enemigos propios de cada bioma', 'biome:foes', true));
      el.appendChild(NX.ui.toggle('Jefes del bioma', 'biome:boss', true));
      el.appendChild(NX.ui.toggle('Clima ambiental del bioma', 'biome:weather', true));
      el.appendChild(NX.ui.note('Los cambios se aplican en la siguiente partida. El cooperativo siempre usa los biomas del juego.'));
    },
  });
})();
