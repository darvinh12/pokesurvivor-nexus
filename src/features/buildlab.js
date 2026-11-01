// Laboratorio de builds: partida de práctica con el Pokémon, los movimientos
// (y su nivel), el nivel, las cartas extra y el objeto que elijas, contra un
// muñeco de prueba con contador de DPS o contra oleadas desde el minuto que
// quieras. Nada llega al guardado real:
//  - Al entrar se copia el guardado entero y mientras dura el laboratorio
//    DB.commit y DB.saveNow no escriben, y Progress (misiones y logros) no
//    cuenta nada. Ranking.runStarted/submitSolo devuelven null.
//  - "Salir del laboratorio" termina la partida sin el cierre normal del juego
//    (Game.toUI y Flow.goMenu): no se suman monedas, estadísticas ni
//    experiencia de compañero, y se devuelve la copia del guardado.
//  - Si caes (con la inmortalidad apagada) el juego cierra la partida como
//    siempre, pero el motor devuelve la copia del guardado en
//    Judgment.summary, antes de que el juego guarde, y otra vez al terminar.
//    La pantalla final muestra monedas que no se acreditan.
(() => {
  const KEY = 'lab';
  const FAR = 1e9;
  const DUMMY_DEX = 143;
  const S = (k, d) => NX.store.get('lab:' + k, d);

  let hud = null;

  function monList(ns, all) {
    const out = [];
    for (const m of ns.DEX || []) {
      if (!m || !m.dex) continue;
      if (!all && !(ns.DB.owns && ns.DB.owns(m.dex))) continue;
      out.push([String(m.dex), '#' + m.dex + ' ' + m.name]);
    }
    return out;
  }
  function movePool(ns, dex, all) {
    const M = ns.Moves;
    if (all) return M.ALL.map((m) => m.id);
    const mon = ns.DEX_BY[dex];
    const ids = new Set();
    try { const s = ns.startMoveOf && ns.startMoveOf(dex); if (s) ids.add(s); } catch (_) { /* nada */ }
    try { for (const id of M.poolFor(mon) || []) ids.add(id); } catch (_) { /* nada */ }
    // Formas evolucionadas de esos movimientos.
    for (const id of [...ids]) {
      const e = M.EVO && M.EVO[id];
      const to = e && (typeof e === 'string' ? e : e.to || e.into || e.id);
      if (to && M.BY_ID[to]) ids.add(to);
    }
    return [...ids].filter((id) => M.BY_ID[id]);
  }
  const moveName = (ns, id) => { const d = ns.Moves.BY_ID[id]; return (d && d.name) || id; };

  // ---------------------------------------------------------------- montaje
  function build(ns, p, c) {
    const M = ns.Moves;
    const picks = [];
    for (let i = 1; i <= 4; i++) {
      const id = S('m' + i, '');
      if (id && M.BY_ID[id] && !picks.some((x) => x[0] === id)) picks.push([id, Math.max(1, +S('l' + i, 1) || 1)]);
    }
    if (picks.length) {
      p.moves.length = 0;
      p.slots.length = 0;
      p.active = 0;
      for (const [id, lv] of picks) {
        p.addMove(id);
        const m = p.moves.find((x) => x.id === id);
        for (let n = 1; m && n < lv; n++) if (!M.levelUp(m)) break;
      }
      try { p.setActive(0); } catch (_) { /* nada */ }
    }
    const lvl = NX.clamp(+S('level', 1) || 1, 1, 60);
    if (lvl > 1) {
      p.level = lvl;
      p.xp = 0;
      if (typeof ns.Player.xpFor === 'function') p.xpNext = ns.Player.xpFor(lvl);
    }
    const item = S('item', '');
    if (item && ns.Items.BY[item]) { try { p.equip(item); } catch (err) { console.warn('[nexus] lab', err); } }
    const cards = NX.clamp(+S('cards', 0) || 0, 0, 30);
    for (let i = 0; i < cards; i++) { try { ns.Game.debugLevelUp(); } catch (_) { break; } }
  }

  function spawnDummy(ns, p, c) {
    try { if (ns.Sprites && ns.Sprites.preload) ns.Sprites.preload([DUMMY_DEX]); } catch (_) { /* nada */ }
    const x = p.x + 170, y = p.y;
    const e = new ns.Enemy({ dex: DUMMY_DEX, name: 'Muñeco de prueba', hp: 1e9, spd: 0, dmg: 0, xp: 0, behavior: 'chase' }, x, y, { hp: 1, dmg: 1, spd: 1 }, false);
    e.nxDummy = true;
    e.name = 'Muñeco de prueba';
    if (S('neutral', true)) e.types = []; // sin tipo: ningún movimiento es eficaz ni poco eficaz
    e.xp = 0;
    ns.EnemyMgr.add(e);
    c.dummy = e;
    c.dx = x;
    c.dy = y;
  }
  function keepDummy(ns, p, c) {
    const e = c.dummy;
    if (!e || e.dead || !ns.EnemyMgr.all().includes(e)) { spawnDummy(ns, p, c); return; }
    e.hp = e.maxHp;
    e.x = c.dx; e.y = c.dy; e.kx = 0; e.ky = 0;
  }

  // ---------------------------------------------------------------- DPS
  function resetDps(ns, p, c) {
    const t = ns.Game.st.time || 0;
    c.samples = [[t, p.dmgDealt || 0]];
    c.base = p.dmgDealt || 0;
    c.baseT = t;
    c.peak = 0;
    c.mBase = {};
    for (const m of p.moves) c.mBase[m.id] = m.dealt || 0;
  }
  function measure(ns, p, c) {
    const t = ns.Game.st.time || 0, dmg = p.dmgDealt || 0;
    const last = c.samples[c.samples.length - 1];
    if (!last || t > last[0]) c.samples.push([t, dmg]);
    while (c.samples.length > 2 && t - c.samples[0][0] > 5) c.samples.shift();
    const s0 = c.samples[0];
    const span = t - s0[0];
    const dps5 = span > 0.2 ? (dmg - s0[1]) / span : 0;
    if (span >= 4.5) c.peak = Math.max(c.peak, dps5);
    const el = Math.max(0.1, t - c.baseT);
    const total = dmg - c.base;
    const moves = p.moves.map((m) => ({ name: m.name || moveName(ns, m.id), lvl: m.lvl, d: (m.dealt || 0) - (c.mBase[m.id] || 0) }))
      .sort((a, b) => b.d - a.d);
    return { dps5, avg: total / el, total, el, moves };
  }

  NX.css(`#nexus-lab-hud{position:fixed;right:12px;top:120px;z-index:9992;min-width:210px;padding:8px 12px;border-radius:10px;
  background:rgba(12,20,44,.9);color:#fff;border:2px solid #7fe0ff;font:13px/1.35 var(--font,'Pixelify',system-ui,sans-serif);box-shadow:0 4px 0 #0a1430}
#nexus-lab-hud.hidden{display:none}
#nexus-lab-hud h4{margin:0 0 4px;font-size:14px;color:#7fe0ff}
#nexus-lab-hud .r{display:flex;justify-content:space-between;gap:10px}#nexus-lab-hud .r b{color:#ffd23f}
#nexus-lab-hud .mv{font-size:12px;opacity:.9}
#nexus-lab-hud .bt{display:flex;flex-wrap:wrap;gap:4px;margin-top:6px}
#nexus-lab-hud button{font:inherit;font-size:12px;background:#0b1838;color:#fff;border:2px solid #f4f8ff;border-radius:6px;cursor:pointer;padding:2px 8px}`);

  const fmtN = (n) => (n >= 1e6 ? (n / 1e6).toFixed(2) + ' M' : n >= 1e4 ? (n / 1e3).toFixed(1) + ' k' : String(Math.round(n)));

  function showHud(ns, c) {
    if (!hud) {
      hud = document.createElement('div');
      hud.id = 'nexus-lab-hud';
      hud.className = 'hidden';
      for (const ev of ['pointerdown', 'mousedown', 'touchstart', 'click', 'wheel']) hud.addEventListener(ev, (e) => e.stopPropagation());
      document.body.appendChild(hud);
      hud.innerHTML = '<h4>Laboratorio</h4><div class="v"></div><div class="bt"><button type="button" data-a="reset">Reiniciar DPS</button><button type="button" data-a="here">Muñeco aquí</button><button type="button" data-a="exit">Salir</button></div>';
      hud.addEventListener('click', (e) => {
        const a = e.target && e.target.dataset && e.target.dataset.a;
        const cur = NX.modes.ctx();
        if (!a || !cur || cur.key !== KEY) return;
        if (a === 'reset') resetDps(ns, cur.player, cur);
        else if (a === 'here') { const p = cur.player; cur.dx = p.x + 170; cur.dy = p.y; if (cur.dummy) keepDummy(ns, p, cur); }
        else if (a === 'exit') NX.modes.exitToMenu();
      });
      NX.draggable(hud, 'lab:hud', () => ({ x: innerWidth - 240, y: 120 }));
    }
    hud.querySelector('[data-a="here"]').hidden = !c.dummyMode;
    hud.classList.remove('hidden');
  }
  function drawHud(ns, p, c) {
    if (!hud) return;
    const r = measure(ns, p, c);
    let tele = '';
    try {
      const T = NX.telemetry && NX.isOn('tele') && NX.telemetry.current ? NX.telemetry.current() : null;
      if (T && typeof T.dps10 === 'number') tele = `<div class="r"><span>Telemetría (10 s)</span><b>${fmtN(T.dps10)}</b></div>`;
    } catch (_) { /* sin telemetría */ }
    const v = hud.querySelector('.v');
    v.innerHTML = `<div class="r"><span>DPS (5 s)</span><b>${fmtN(r.dps5)}</b></div>
      <div class="r"><span>DPS medio</span><b>${fmtN(r.avg)}</b></div>
      <div class="r"><span>Pico (5 s)</span><b>${fmtN(c.peak)}</b></div>
      <div class="r"><span>Daño total</span><b>${fmtN(r.total)}</b></div>
      <div class="r"><span>Tiempo</span><b>${NX.fmtTime(r.el)}</b></div>${tele}` +
      r.moves.slice(0, 4).map((m) => `<div class="r mv"><span>${NX.esc(m.name)} Nv. ${m.lvl || 1}</span><span>${fmtN(m.d / r.el)}/s</span></div>`).join('');
  }

  function cfg(ns) {
    const dummyMode = S('target', 'dummy') !== 'waves';
    const minute = dummyMode ? 0 : NX.clamp(+S('minute', 0) || 0, 0, 29);
    return {
      key: KEY,
      label: 'Laboratorio',
      tags: [dummyMode ? 'Muñeco de prueba' : 'Oleadas desde ' + minute + ':00'],
      sandbox: true,
      noAch: true,
      noJudge: true,
      noRift: dummyMode,
      noSpawner: dummyMode,
      immortal: !!S('immortal', true),
      partner: +S('dex', 0) || null,
      dummyMode,
      overNote: '<b>Laboratorio</b> · no se guardó ningún progreso ni recompensa',
      onStart(n, p, c) {
        build(n, p, c);
        if (minute > 0) {
          n.Game.debugTime(minute * 60);
          for (const b of n.Enemies.BOSSES) if (b.at <= minute * 60) b.at = FAR; // sin jefes atrasados de golpe
        }
        if (dummyMode) spawnDummy(n, p, c);
        resetDps(n, p, c);
        showHud(n, c);
        c.hudT = 0;
      },
      onTick(n, p, c, dt) {
        if (dummyMode) keepDummy(n, p, c);
        c.hudT += 1;
        if (c.hudT % 3 === 0) drawHud(n, p, c);
      },
      onEnd() { if (hud) hud.classList.add('hidden'); },
      pause: [
        { label: 'Reiniciar DPS', onClick(c, n) { if (c) resetDps(n, c.player, c); } },
        { label: 'Salir del laboratorio', onClick() { NX.modes.exitToMenu(); } },
      ],
    };
  }

  function render(ns, el, h) {
    h.desc(el, 'Prueba builds sin consecuencias: eliges Pokémon, movimientos, niveles y objeto, y practicas contra un muñeco con contador de DPS o contra oleadas. No se guarda progreso ni recompensas. Sal con el botón Salir del laboratorio.');
    const re = () => h.rerender();
    const all = !!S('all', false);
    const mons = monList(ns, all);
    let dex = +S('dex', 0);
    if (!mons.some(([d]) => +d === dex)) { dex = mons.length ? +mons[0][0] : 1; NX.store.set('lab:dex', dex); }
    el.appendChild(NX.ui.select('Pokémon', 'lab:dex', mons.length ? mons : [['1', '#1']], String(dex), (v) => { NX.store.set('lab:dex', +v); re(); }));
    el.appendChild(NX.ui.toggle('Mostrar todos los Pokémon', 'lab:all', false, re));
    const pool = movePool(ns, dex, !!S('allMoves', false));
    const opts = [['', 'Ninguno'], ...pool.map((id) => [id, moveName(ns, id)])];
    for (let i = 1; i <= 4; i++) {
      const id = S('m' + i, '');
      if (id && !pool.includes(id)) NX.store.set('lab:m' + i, '');
      el.appendChild(NX.ui.select('Movimiento ' + i, 'lab:m' + i, opts, '', re));
      const cur = S('m' + i, '');
      if (cur) {
        const max = (ns.Moves.BY_ID[cur] && ns.Moves.BY_ID[cur].maxLvl) || 5;
        const lv = Array.from({ length: max }, (_, k) => [String(k + 1), 'Nv. ' + (k + 1)]);
        if ((+S('l' + i, 1) || 1) > max) NX.store.set('lab:l' + i, max);
        el.appendChild(NX.ui.select('  Nivel del movimiento ' + i, 'lab:l' + i, lv, '1'));
      }
    }
    el.appendChild(NX.ui.note('Sin movimientos elegidos se usa el inicial del Pokémon.'));
    el.appendChild(NX.ui.toggle('Todos los movimientos del juego', 'lab:allMoves', false, re));
    el.appendChild(NX.ui.range('Nivel del Pokémon', 'lab:level', 1, 60, 1, 1, (v) => 'Nv. ' + v));
    el.appendChild(NX.ui.range('Cartas de mejora al empezar', 'lab:cards', 0, 30, 1, 0, (v) => String(v)));
    el.appendChild(NX.ui.select('Objeto', 'lab:item', [['', 'Ninguno'], ...ns.Items.LIST.map((it) => [it.id, it.name])], ''));
    el.appendChild(NX.ui.select('Rival', 'lab:target', [['dummy', 'Muñeco de prueba (DPS)'], ['waves', 'Oleadas']], 'dummy', re));
    if (S('target', 'dummy') === 'waves') el.appendChild(NX.ui.range('Empezar en el minuto', 'lab:minute', 0, 29, 1, 0, (v) => v + ':00'));
    else el.appendChild(NX.ui.toggle('Muñeco sin tipo (daño neutro)', 'lab:neutral', true));
    el.appendChild(NX.ui.toggle('Inmortal', 'lab:immortal', true));
    h.foot(el, 'Entrar al laboratorio', () => NX.modes.launch(cfg(ns)));
  }

  NX.feature({
    key: KEY,
    label: 'Laboratorio de builds',
    needs: (ns) => !!NX.modes && ns.Moves && ns.Moves.BY_ID && typeof ns.Moves.levelUp === 'function' && typeof ns.Moves.poolFor === 'function' &&
      ns.Items && ns.Items.BY && Array.isArray(ns.DEX) && typeof ns.Enemy === 'function' && typeof ns.Game.toUI === 'function' &&
      typeof ns.Game.debugTime === 'function' && typeof ns.Game.debugLevelUp === 'function' && ns.Flow && typeof ns.Flow.goMenu === 'function',
    setup(ns) {
      NX.modes.register({ key: KEY, title: 'Laboratorio', order: 5, render: (el, h) => render(ns, el, h) });
      // Lo usa el Centro de builds: carga una build en el laboratorio y abre su pestaña.
      // cfg = { dex, moves: [{ id, lvl }], source }
      NX.buildlab = {
        open(cfg) {
          if (!cfg || !cfg.dex) return false;
          NX.store.set('lab:dex', +cfg.dex);
          if (!(ns.DB.owns && ns.DB.owns(+cfg.dex))) NX.store.set('lab:all', true);
          const moves = (cfg.moves || []).filter((m) => m && ns.Moves.BY_ID[m.id]).slice(0, 4);
          if (moves.some((m) => !movePool(ns, +cfg.dex, false).includes(m.id))) NX.store.set('lab:allMoves', true);
          for (let i = 1; i <= 4; i++) {
            const m = moves[i - 1];
            NX.store.set('lab:m' + i, m ? m.id : '');
            NX.store.set('lab:l' + i, m ? Math.max(1, +m.lvl || 1) : 1);
          }
          NX.modes.open(KEY);
          return true;
        },
      };
    },
  });

  NX.settings.section({
    key: KEY,
    tab: 'Modos',
    title: 'Laboratorio de builds',
    keywords: 'laboratorio build dps muñeco práctica prueba',
    render(el) {
      el.appendChild(NX.ui.toggle('Activado', 'on:' + KEY, true));
      el.appendChild(NX.ui.note('Se entra desde Modos Nexus en el menú principal. No guarda progreso ni recompensas.'));
      el.appendChild(NX.ui.button('Recolocar el contador de DPS', () => { NX.store.set('pos:lab:hud', null); if (hud) { hud.style.left = (innerWidth - 240) + 'px'; hud.style.top = '120px'; } }));
    },
  });
})();
