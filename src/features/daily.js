// Desafío diario: la fecha local es la semilla. Cada día sortea el Pokémon
// inicial (entre los iniciales del juego), dos o tres modificadores y el mapa.
// Guarda el récord personal de cada día y muestra el historial reciente.
(() => {
  const KEY = 'daily';
  const REC_KEY = 'daily:rec';
  const KEEP_DAYS = 30;

  const dayKey = (d = new Date()) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  // FNV-1a y mulberry32: mismo día, mismo sorteo.
  const hash = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; };
  const rng = (seed) => () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  // Cada entrada fija un modificador; nunca dos del mismo tipo.
  const POOL = [
    ['density', 1.5], ['density', 2], ['taken', 1.5], ['taken', 2], ['dealt', 0.75], ['dealt', 1.25],
    ['speed', 1.25], ['speed', 1.5], ['noHeal', true], ['chaos', true],
  ];

  function roll(ns, key) {
    const r = rng(hash('nexus-daily:' + key));
    const starters = (ns.STARTERS || []).map((s) => s.dex).filter((d) => ns.DEX_BY && ns.DEX_BY[d]);
    const dex = starters.length ? starters[Math.floor(r() * starters.length)] : 1;
    const n = 2 + (r() < 0.4 ? 1 : 0);
    const mods = { density: 1, taken: 1, dealt: 1, speed: 1, noHeal: false, chaos: false };
    const used = new Set();
    for (let guard = 0; used.size < n && guard < 50; guard++) {
      const [k, v] = POOL[Math.floor(r() * POOL.length)];
      if (used.has(k)) continue;
      used.add(k);
      mods[k] = v;
    }
    return { key, dex, mods, seed: Math.floor(r() * 1e6) };
  }

  const loadRec = () => { const r = NX.store.get(REC_KEY, {}); return r && typeof r === 'object' ? r : {}; };

  function record(key, info, d) {
    const r = loadRec();
    const e = r[key] || { tries: 0 };
    e.tries = (e.tries || 0) + 1;
    e.dex = d.dex;
    const beat = !e.time || info.time > e.time;
    if (beat) { e.time = Math.floor(info.time); e.level = info.level; e.kills = info.kills; e.at = Date.now(); }
    r[key] = e;
    const keys = Object.keys(r).sort().reverse();
    for (const k of keys.slice(KEEP_DAYS)) delete r[k];
    NX.store.set(REC_KEY, r);
    return beat;
  }

  function cfg(ns, d) {
    return {
      key: KEY,
      label: 'Desafío ' + d.key.slice(8) + '/' + d.key.slice(5, 7),
      partner: d.dex,
      worldSeed: d.seed,
      mods: d.mods,
      onStart(n, p, c) { c.best = (loadRec()[d.key] || {}).time || 0; },
      pillExtra: (n, c) => (c.best ? 'Récord del día ' + NX.fmtTime(c.best) : ''),
      onEnd(n, p, c, info) {
        if (info.how === 'replaced' || info.time < 5) return '';
        const beat = record(d.key, info, d);
        return `<b>Desafío diario ${NX.esc(d.key)}</b> · fuera del ranking` + (beat ? '<br><b style="color:#ffe27a">Nuevo récord del día</b>' : '');
      },
    };
  }

  NX.feature({
    key: KEY,
    label: 'Desafío diario',
    needs: (ns) => !!NX.modes && Array.isArray(ns.STARTERS) && ns.DEX_BY && ns.World && typeof ns.World.reset === 'function',
    setup(ns) {
      NX.modes.register({
        key: KEY,
        title: 'Desafío diario',
        order: 4,
        render(el, h) {
          const d = roll(ns, dayKey());
          const tags = NX.modsApi ? NX.modsApi.tags(d.mods) : [];
          h.desc(el, 'Cada día, un Pokémon, unas reglas y un mapa iguales para todo el día. Supera tu récord. Fuera del ranking del juego.');
          const r = loadRec(), today = r[d.key] || {};
          h.cards(el, [
            ['Hoy', d.key.split('-').reverse().join('/')],
            ['Pokémon', NX.modes.dexName(d.dex)],
            ['Reglas', tags.join(' · ') || 'Sin modificadores'],
            ['Tu récord de hoy', today.time ? NX.fmtTime(today.time) + ' · Nv. ' + today.level + ' · ' + today.tries + ' intento' + (today.tries > 1 ? 's' : '') : '·'],
          ]);
          if (!NX.isOn('mods')) el.appendChild(NX.ui.note('Los modificadores están apagados: el desafío usa solo el Pokémon y el mapa del día.'));
          const days = [];
          for (let i = 1; i <= 7; i++) { const x = new Date(); x.setDate(x.getDate() - i); days.push(dayKey(x)); }
          const rows = days.map((k) => { const e = r[k]; if (!e) return null; return [k.split('-').reverse().slice(0, 2).join('/'), NX.modes.dexName(e.dex), NX.fmtTime(e.time || 0), 'Nv. ' + (e.level || 1), String(e.tries || 1)]; }).filter(Boolean);
          el.appendChild(NX.ui.note('Últimos 7 días'));
          h.table(el, ['Día', 'Pokémon', 'Récord', 'Nivel', 'Intentos'], rows, 'Sin desafíos jugados en los últimos días.');
          h.foot(el, 'Jugar el desafío', () => {
            const c = cfg(ns, d);
            if (!NX.isOn('mods')) c.mods = null;
            NX.modes.launch(c);
          });
        },
      });
    },
  });

  NX.settings.section({
    key: KEY,
    tab: 'Modos',
    title: 'Desafío diario',
    keywords: 'desafío diario semilla fecha récord historial',
    render(el) {
      el.appendChild(NX.ui.toggle('Activado', 'on:' + KEY, true));
      const r = loadRec(), today = r[dayKey()];
      el.appendChild(NX.ui.note(today && today.time ? `Récord de hoy: ${NX.fmtTime(today.time)} (${today.tries} intento${today.tries > 1 ? 's' : ''}).` : 'Todavía no has jugado el desafío de hoy.'));
      el.appendChild(NX.ui.button('Borrar historial', () => { NX.store.set(REC_KEY, {}); NX.toast('Historial del desafío diario borrado'); }));
    },
  });
})();
