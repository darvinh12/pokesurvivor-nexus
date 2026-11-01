// Modificadores de partida: densidad de enemigos, daño recibido, daño
// infligido, velocidad del juego, sin curación y clima caótico. Se eligen en
// Modos Nexus o en el panel (Alt+N) y pueden aplicarse a las partidas
// normales. El motor de modes.js los aplica; aquí viven los valores, la
// píldora (sus etiquetas) y el ranking local por combinación.
(() => {
  const KEY = 'mods';
  const RANK_KEY = 'mods:rank';
  const KEEP = 10;
  const CHAOS_EVERY = 45; // segundos entre cambios de clima
  const DEF = { density: 1, taken: 1, dealt: 1, speed: 1, noHeal: false, chaos: false };
  const x = (v) => 'x' + (+v).toFixed(2).replace(/0$/, '').replace(/\.0$/, '');

  const values = () => ({
    density: +NX.store.get('mods:density', 1) || 1,
    taken: +NX.store.get('mods:taken', 1) || 1,
    dealt: +NX.store.get('mods:dealt', 1) || 1,
    speed: NX.clamp(+NX.store.get('mods:speed', 1) || 1, 0.75, 1.5),
    noHeal: !!NX.store.get('mods:noHeal', false),
    chaos: !!NX.store.get('mods:chaos', false),
  });
  const norm = (v) => Object.assign({}, DEF, v || {});
  const neutral = (v) => { v = norm(v); return v.density === 1 && v.taken === 1 && v.dealt === 1 && v.speed === 1 && !v.noHeal && !v.chaos; };
  const tags = (v) => {
    v = norm(v);
    const t = [];
    if (v.density !== 1) t.push('Enemigos ' + x(v.density));
    if (v.taken !== 1) t.push('Daño recibido ' + x(v.taken));
    if (v.dealt !== 1) t.push('Tu daño ' + x(v.dealt));
    if (v.speed !== 1) t.push('Velocidad ' + x(v.speed));
    if (v.noHeal) t.push('Sin curación');
    if (v.chaos) t.push('Clima caótico');
    return t;
  };
  const sig = (v) => { v = norm(v); return [v.density, v.taken, v.dealt, v.speed, v.noHeal ? 1 : 0, v.chaos ? 1 : 0].join('|'); };
  const sigText = (s) => {
    const [d, t, dl, sp, nh, ch] = String(s).split('|');
    const txt = tags({ density: +d, taken: +t, dealt: +dl, speed: +sp, noHeal: nh === '1', chaos: ch === '1' });
    return txt.length ? txt.join(' · ') : 'Sin modificadores';
  };

  const loadRank = () => { const r = NX.store.get(RANK_KEY, {}); return r && typeof r === 'object' ? r : {}; };

  NX.modsApi = {
    values,
    neutral,
    tags,
    sig,
    sigText,
    enabled: () => !!NX.store.get('mods:on', false),
    // Efectos para el motor de modos.
    effects(v) {
      v = norm(v);
      return {
        spawnK: v.density, capK: Math.max(1, v.density), taken: v.taken, dealt: v.dealt,
        speed: NX.clamp(v.speed, 0.75, 1.5), noHeal: !!v.noHeal, chaos: v.chaos ? CHAOS_EVERY : 0, tags: tags(v),
      };
    },
    // Guarda la partida en el ranking local de su combinación.
    record(v, info) {
      if (!info || info.how === 'replaced' || info.time < 5) return '';
      const r = loadRank(), k = sig(v);
      const list = Array.isArray(r[k]) ? r[k] : [];
      const e = { time: Math.floor(info.time), level: info.level, kills: info.kills, dex: info.dex, mon: info.mon, at: Date.now(), dead: info.dead };
      list.push(e);
      list.sort((a, b) => b.time - a.time || b.level - a.level || b.kills - a.kills);
      if (list.length > KEEP) list.length = KEEP;
      r[k] = list;
      NX.store.set(RANK_KEY, r);
      const pos = list.indexOf(e);
      return pos === 0 && list.length > 1 ? '<b style="color:#ffe27a">Nuevo récord con estos modificadores</b>' : (pos >= 0 ? `Puesto ${pos + 1} con estos modificadores` : '');
    },
    board: (v) => { const l = loadRank()[sig(v)]; return Array.isArray(l) ? l : []; },
  };

  const fmtX = (v) => x(v);
  function controls(el, onChange) {
    const ch = () => { if (onChange) onChange(); };
    el.appendChild(NX.ui.range('Densidad de enemigos', 'mods:density', 0.5, 2, 0.25, 1, fmtX, ch));
    el.appendChild(NX.ui.range('Daño recibido', 'mods:taken', 0.5, 2, 0.25, 1, fmtX, ch));
    el.appendChild(NX.ui.range('Daño infligido', 'mods:dealt', 0.5, 2, 0.25, 1, fmtX, ch));
    el.appendChild(NX.ui.range('Velocidad del juego', 'mods:speed', 0.75, 1.5, 0.25, 1, fmtX, ch));
    el.appendChild(NX.ui.toggle('Sin curación', 'mods:noHeal', false, ch));
    el.appendChild(NX.ui.toggle('Clima caótico (cambia cada 45 s)', 'mods:chaos', false, ch));
  }
  function board(el, h) {
    const wrap = document.createElement('div');
    const draw = () => {
      wrap.innerHTML = '';
      const v = values();
      const t = document.createElement('p');
      t.className = 'nx-note';
      t.textContent = 'Ranking local · ' + sigText(sig(v));
      wrap.appendChild(t);
      const rows = NX.modsApi.board(v).map((e, i) => [String(i + 1), NX.fmtTime(e.time), 'Nv. ' + e.level, String(e.kills), e.mon || NX.modes.dexName(e.dex), NX.modes.date(e.at)]);
      if (h) h.table(wrap, ['#', 'Tiempo', 'Nivel', 'Bajas', 'Pokémon', 'Fecha'], rows, 'Sin partidas con esta combinación.');
      else if (!rows.length) wrap.appendChild(NX.ui.note('Sin partidas con esta combinación.'));
      else wrap.appendChild(NX.ui.note(rows.slice(0, 5).map((r) => `${r[0]}. ${r[1]} · ${r[2]} · ${r[4]}`).join('  |  ')));
    };
    draw();
    el.appendChild(wrap);
    return draw;
  }

  NX.feature({
    key: KEY,
    label: 'Modificadores de partida',
    needs: () => !!NX.modes,
    setup() {
      NX.modes.register({
        key: KEY,
        title: 'Modificadores',
        order: 2,
        render(el, h) {
          h.desc(el, 'Cambia las reglas de la partida. Fuera del ranking del juego; cada combinación tiene su propio ranking local. La velocidad por encima de x1 también marca la partida como de prueba para el juego.');
          let draw = null;
          controls(el, () => draw && draw());
          el.appendChild(NX.ui.toggle('Aplicar también al pulsar Jugar', 'mods:on', false));
          draw = board(el, h);
          h.foot(el, 'Jugar con modificadores', () => {
            const v = values();
            if (neutral(v)) { NX.toast('Elige al menos un modificador'); return; }
            NX.modes.launch({ key: KEY, label: 'Modificadores', mods: v });
          }, [['Restablecer', () => {
            for (const k of Object.keys(DEF)) NX.store.set('mods:' + k, DEF[k]);
            h.rerender();
          }]]);
        },
      });
    },
  });

  NX.settings.section({
    key: KEY,
    tab: 'Modos',
    title: 'Modificadores de partida',
    keywords: 'modificadores densidad daño velocidad curación clima caótico ranking',
    render(el) {
      el.appendChild(NX.ui.toggle('Activado', 'on:' + KEY, true));
      el.appendChild(NX.ui.toggle('Aplicar al pulsar Jugar', 'mods:on', false));
      let draw = null;
      controls(el, () => draw && draw());
      draw = board(el, null);
      el.appendChild(NX.ui.button('Borrar ranking local', () => { NX.store.set(RANK_KEY, {}); draw(); NX.toast('Ranking de modificadores borrado'); }));
    },
  });
})();
