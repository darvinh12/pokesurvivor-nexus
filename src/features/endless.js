// Modo infinito: el Juicio de Arceus no llega a los 30:00, después del último
// jefe sigue llegando uno cada 3 minutos (los de la partida, por turnos y cada
// vuelta más fuertes) y desde el minuto 30 los enemigos se endurecen cada vez
// más rápido. Desde la pausa se puede invocar a Arceus o terminar la partida.
// Fuera del ranking, sin logros y sin tocar las estadísticas del juego;
// monedas y tickets como siempre. Récords propios en NX.store.
// Adaptado de PokeSurvivor Plus (MIT): startEndless, endEndless,
// endlessSnapshot, la curva de tiempo extra y la rotación de Enemies.BOSSES.
(() => {
  const KEY = 'endless';
  const REC_KEY = 'endless:rec';
  const HIST_KEY = 'endless:hist';
  const EXTRA = 200;        // jefes añadidos a la lista de la partida
  const LATE_FROM = 30;     // minuto desde el que crece la curva
  const LATE_K = 0.000374;  // minuto 45 x1.09 · 60 x1.4 · 75 x2.1 · 90 x3.8
  const lateK = (t) => { const m = Math.max(0, t / 60 - LATE_FROM); return Math.exp(Math.min(30, LATE_K * m * m)); };

  const rec = () => NX.store.get(REC_KEY, {}) || {};

  function startEndless(ns, p, c) {
    // Jefes cada 3 minutos tras el último de la partida, rotando los cinco.
    const B = ns.Enemies.BOSSES;
    if (Array.isArray(B) && B.length && !B.__nxEndless) {
      const base = B.slice(0, 5), top = base[base.length - 1];
      const every = (base[1] && base[0] ? base[1].at - base[0].at : 180) || 180;
      const from = top.at;
      for (let i = 0; i < EXTRA; i++) {
        const b = base[i % base.length], cyc = Math.floor(i / base.length);
        const k = 1 + 0.35 * cyc, kd = 1 + 0.12 * cyc;
        B.push(Object.assign({}, b, {
          at: from + every * (i + 1), hp: Math.round(top.hp * k), dmg: top.dmg * kd, xp: top.xp,
          shotDmg: (top.shotDmg || b.shotDmg || 0) * kd,
        }));
      }
      B.__nxEndless = true;
    }
    c.warned = 0;
    c.best = rec().time || 0;
  }

  function endEndless(ns, p, c, info) {
    const beat = [];
    if (info.how !== 'replaced' && info.time >= 10) {
      const r = rec();
      if (info.time > (r.time || 0)) { r.time = Math.floor(info.time); r.dex = info.dex; r.mon = info.mon; r.at = Date.now(); beat.push('tiempo'); }
      if (info.level > (r.level || 0)) { r.level = info.level; beat.push('nivel'); }
      if (info.kills > (r.kills || 0)) { r.kills = info.kills; beat.push('bajas'); }
      r.runs = (r.runs || 0) + 1;
      NX.store.set(REC_KEY, r);
      const h = NX.store.get(HIST_KEY, []) || [];
      h.unshift({ time: Math.floor(info.time), level: info.level, kills: info.kills, dex: info.dex, mon: info.mon, at: Date.now(), arceus: !!c.arceus });
      if (h.length > 10) h.length = 10;
      NX.store.set(HIST_KEY, h);
    }
    return '<b>∞ Partida infinita</b> · fuera del ranking · sin logros · tus estadísticas no cambian' +
      (beat.length ? `<br><b style="color:#ffe27a">Nuevo récord infinito (${beat.join(', ')})</b>` : '');
  }

  function cfg() {
    const useMods = !!NX.store.get('endless:mods', false) && NX.modsApi && NX.isOn('mods');
    return {
      key: KEY,
      label: '∞ Infinito',
      noJudge: true,
      noAch: true,
      restoreStats: true,
      mods: useMods ? NX.modsApi.values() : null,
      onStart: startEndless,
      onEnd: endEndless,
      // La curva de tiempo extra sobre enemigos y jefes.
      scale(o, t) {
        const k = lateK(t || 0);
        return k === 1 ? o : Object.assign({}, o, { hp: o.hp * k, dmg: o.dmg * Math.pow(k, 0.7) });
      },
      // Los legendarios de las grietas se crean sin esa escala.
      onAdd(e, ns) {
        if (!e.legend || e.__nxLate) return;
        e.__nxLate = true;
        const k = lateK((ns.Game.st && ns.Game.st.time) || 0);
        if (k > 1) {
          e.maxHp = Math.round(e.maxHp * k); e.hp = Math.round(e.hp * k);
          const d = Math.pow(k, 0.7); e.dmg *= d; if (e.shotDmg) e.shotDmg *= d;
        }
      },
      onTick(ns, p, c) {
        const t = ns.Game.st.time || 0;
        if (c.warned < 1 && t >= 1800) { c.warned = 1; NX.toast('Sin Juicio: los Pokémon salvajes se hacen cada vez más fuertes'); }
        if (c.warned < 2 && t >= 3600) { c.warned = 2; NX.toast('Minuto 60: la dificultad sube cada vez más rápido'); }
        if (c.best && !c.beatToast && t > c.best) { c.beatToast = true; NX.toast('Nuevo récord infinito: ' + NX.fmtTime(t)); }
      },
      pillExtra: (ns, c) => (c.arceus ? 'Arceus viene en camino' : c.best ? 'Récord ' + NX.fmtTime(c.best) : ''),
      pause: [
        {
          label: 'Invocar a Arceus', confirm: '¿Invocar a Arceus? Termina la partida',
          show: (c, ns) => !c.arceus && !ns.Judgment.active,
          onClick(c) { if (!c) return; c.arceus = true; NX.toast('Has invocado a Arceus · el Juicio empieza al continuar'); NX.modes.resume(); },
        },
        {
          label: 'Terminar partida', confirm: '¿Terminar la partida ahora?',
          onClick(c, ns) { ns.Game.quit(); },
        },
      ],
    };
  }

  function stats(el, h) {
    const r = rec();
    const items = [
      ['Mejor tiempo', r.time ? NX.fmtTime(r.time) : '·'],
      ['Mejor nivel', r.level ? String(r.level) : '·'],
      ['Más bajas', r.kills ? String(r.kills) : '·'],
      ['Partidas', String(r.runs || 0)],
    ];
    if (h) h.cards(el, items);
    else el.appendChild(NX.ui.note(items.map(([k, v]) => k + ': ' + v).join(' · ')));
    if (r.time && r.mon) el.appendChild(NX.ui.note(`Récord con ${r.mon} el ${NX.modes.date(r.at)}.`));
  }

  NX.feature({
    key: KEY,
    label: 'Modo infinito',
    needs: (ns) => !!NX.modes && ns.Enemies && Array.isArray(ns.Enemies.BOSSES) && ns.Judgment && typeof ns.Game.quit === 'function',
    setup() {
      NX.modes.register({
        key: KEY,
        title: '∞ Infinito',
        order: 1,
        render(el, h) {
          h.desc(el, 'Sin Juicio a los 30:00. Tras el último jefe llega otro cada 3 minutos, cada vuelta más fuerte, y desde el minuto 30 los enemigos se endurecen cada vez más rápido. Desde la pausa puedes invocar a Arceus o terminar. Fuera del ranking, sin logros y sin cambiar tus estadísticas; monedas y tickets como siempre.');
          stats(el, h);
          if (NX.isOn('mods')) el.appendChild(NX.ui.toggle('Aplicar mis modificadores', 'endless:mods', false));
          const hist = NX.store.get(HIST_KEY, []) || [];
          h.table(el, ['Tiempo', 'Nivel', 'Bajas', 'Pokémon', 'Fecha'], hist.slice(0, 5).map((e) => [NX.fmtTime(e.time), String(e.level), String(e.kills), e.mon || NX.modes.dexName(e.dex), NX.modes.date(e.at)]), 'Todavía no has jugado una partida infinita.');
          h.foot(el, 'Jugar infinito', () => NX.modes.launch(cfg()));
        },
      });
    },
  });

  NX.settings.section({
    key: KEY,
    tab: 'Modos',
    title: 'Modo infinito',
    keywords: 'infinito endless arceus juicio récord',
    render(el) {
      el.appendChild(NX.ui.toggle('Activado', 'on:' + KEY, true));
      stats(el, null);
      el.appendChild(NX.ui.button('Borrar récords', () => { NX.store.set(REC_KEY, {}); NX.store.set(HIST_KEY, []); NX.toast('Récords del modo infinito borrados'); }));
    },
  });
})();
