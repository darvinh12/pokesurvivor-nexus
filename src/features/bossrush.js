// Boss Rush: solo jefes, uno tras otro y contra el reloj. Usa los jefes que
// el juego sortea para la partida (5) o dos vueltas (10, la segunda más
// dura). Sin enemigos normales, sin grietas ni Juicio. Empiezas con cartas de
// mejora y ganas más con cada jefe. Mejor tiempo guardado en NX.store.
(() => {
  const KEY = 'rush';
  const BEST_KEY = 'rush:best';
  const HIST_KEY = 'rush:hist';
  const GAP = 3;          // segundos entre un jefe y el siguiente
  const START_CARDS = 8;  // cartas de mejora al empezar
  const PER_BOSS = 2;     // cartas por jefe derrotado
  const FAR = 1e9;

  const best = () => NX.store.get(BEST_KEY, {}) || {};
  const count = () => (+NX.store.get('rush:count', 5) === 10 ? 10 : 5);

  function cfg() {
    const n = count();
    const useMods = !!NX.store.get('rush:mods', false) && NX.modsApi && NX.isOn('mods');
    return {
      key: KEY,
      label: 'Boss Rush',
      noJudge: true,
      noRift: true,
      noAch: true,
      restoreStats: true,
      mods: useMods ? NX.modsApi.values() : null,
      spawnK: 0, // sin enemigos normales: el generador solo saca jefes
      capK: 1,
      onStart(ns, p, c) {
        const B = ns.Enemies.BOSSES;
        const base = B.slice(0, 5);
        const list = n === 10
          ? base.concat(base.map((b) => Object.assign({}, b, { hp: Math.round(b.hp * 1.6), dmg: b.dmg * 1.2, shotDmg: (b.shotDmg || 0) * 1.2 })))
          : base;
        B.length = 0;
        list.forEach((b, i) => B.push(Object.assign({}, b, { at: i === 0 ? 2 : FAR })));
        c.bossLen0 = B.length; // la lista es de esta partida: no se recorta al terminar
        c.total = list.length;
        c.spawned = 0;
        c.cur = null;
        c.tStart = null;
        c.done = false;
        c.best = (best()[n] || {}).time || 0;
        c.n = n;
        for (let i = 0; i < START_CARDS; i++) { try { ns.Game.debugLevelUp(); } catch (_) { break; } }
      },
      onAdd(e, ns, c) {
        if (!e.boss || e.arceus || e.legend || e.nxDummy) return;
        c.spawned++;
        c.cur = e;
        if (c.tStart == null) c.tStart = ns.Game.st.time || 0;
      },
      onTick(ns, p, c) {
        if (c.done || !c.cur) return;
        const alive = !c.cur.dead && ns.EnemyMgr.all().includes(c.cur);
        if (alive) return;
        const t = ns.Game.st.time || 0;
        if (c.spawned >= c.total) {
          c.done = true;
          c.result = t - c.tStart;
          const sec = Math.round(c.result * 10) / 10;
          NX.toast('Boss Rush completado en ' + NX.fmtTime(sec));
          try { ns.Audio.sfx('shinyGet'); } catch (_) { /* silencio */ }
          setTimeout(() => {
            if (ns.Game.player === p && ns.Game.state !== 'over' && ns.Game.state !== 'ui') ns.Game.quit();
          }, 2500);
          return;
        }
        const B = ns.Enemies.BOSSES;
        if (c.armed !== c.spawned && B[c.spawned]) {
          c.armed = c.spawned;
          B[c.spawned].at = t + GAP;
          for (let i = 0; i < PER_BOSS; i++) { try { ns.Game.debugLevelUp(); } catch (_) { break; } }
        }
      },
      pillExtra(ns, c) {
        const t = c.done ? c.result : c.tStart == null ? 0 : (ns.Game.st.time || 0) - c.tStart;
        return `Jefe ${Math.max(1, Math.min(c.spawned, c.total))}/${c.total} · ${NX.fmtTime(t)}${c.best ? ' · récord ' + NX.fmtTime(c.best) : ''}`;
      },
      onEnd(ns, p, c, info) {
        let line = `<b>Boss Rush</b> · ${Math.min(c.spawned, c.total)}/${c.total} jefes · fuera del ranking · sin logros`;
        if (!c.done) return line;
        const b = best(), prev = b[c.n];
        const time = Math.round(c.result * 10) / 10;
        const beat = !prev || time < prev.time;
        if (beat) { b[c.n] = { time, dex: info.dex, mon: info.mon, at: Date.now(), level: info.level }; NX.store.set(BEST_KEY, b); }
        const h = NX.store.get(HIST_KEY, []) || [];
        h.unshift({ n: c.n, time, dex: info.dex, mon: info.mon, level: info.level, at: Date.now() });
        if (h.length > 10) h.length = 10;
        NX.store.set(HIST_KEY, h);
        line += `<br>Completado en <b>${NX.fmtTime(time)}</b>` + (beat ? ' · <b style="color:#ffe27a">¡Nuevo mejor tiempo!</b>' : ` · mejor ${NX.fmtTime(prev.time)}`);
        return line;
      },
    };
  }

  function bests(el, h) {
    const b = best();
    const items = [5, 10].map((n) => [`Mejor tiempo (${n} jefes)`, b[n] ? NX.fmtTime(b[n].time) + (b[n].mon ? ' · ' + b[n].mon : '') : '·']);
    if (h) h.cards(el, items);
    else el.appendChild(NX.ui.note(items.map(([k, v]) => k + ': ' + v).join(' · ')));
  }

  NX.feature({
    key: KEY,
    label: 'Boss Rush',
    needs: (ns) => !!NX.modes && ns.Enemies && Array.isArray(ns.Enemies.BOSSES) && typeof ns.Game.debugLevelUp === 'function' &&
      typeof ns.EnemyMgr.all === 'function' && ns.Coop && typeof ns.Coop.scaleRate === 'function',
    setup() {
      NX.modes.register({
        key: KEY,
        title: 'Boss Rush',
        order: 3,
        render(el, h) {
          h.desc(el, `Solo jefes, uno tras otro, contra el reloj. Empiezas con ${START_CARDS} cartas de mejora y ganas ${PER_BOSS} por cada jefe. Sin enemigos normales, sin grietas ni Juicio. Fuera del ranking, sin logros y sin cambiar tus estadísticas.`);
          bests(el, h);
          el.appendChild(NX.ui.select('Jefes', 'rush:count', [['5', '5 jefes (los de la partida)'], ['10', '10 jefes (dos vueltas)']], '5'));
          if (NX.isOn('mods')) el.appendChild(NX.ui.toggle('Aplicar mis modificadores', 'rush:mods', false));
          const hist = NX.store.get(HIST_KEY, []) || [];
          h.table(el, ['Jefes', 'Tiempo', 'Nivel', 'Pokémon', 'Fecha'], hist.slice(0, 5).map((e) => [String(e.n), NX.fmtTime(e.time), String(e.level), e.mon || NX.modes.dexName(e.dex), NX.modes.date(e.at)]), 'Todavía no has completado un Boss Rush.');
          h.foot(el, 'Jugar Boss Rush', () => NX.modes.launch(cfg()));
        },
      });
    },
  });

  NX.settings.section({
    key: KEY,
    tab: 'Modos',
    title: 'Boss Rush',
    keywords: 'boss rush jefes reloj tiempo',
    render(el) {
      el.appendChild(NX.ui.toggle('Activado', 'on:' + KEY, true));
      bests(el, null);
      el.appendChild(NX.ui.button('Borrar tiempos', () => { NX.store.set(BEST_KEY, {}); NX.store.set(HIST_KEY, []); NX.toast('Tiempos del Boss Rush borrados'); }));
    },
  });
})();
