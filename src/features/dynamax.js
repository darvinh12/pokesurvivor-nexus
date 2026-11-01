// Dinamax. Una vez por partida (o una vez por cada jefe, según el ajuste), la
// tecla H, el botón DMAX del HUD o su toque vuelven gigante al Pokémon por
// 15 segundos: el doble de tamaño y de radio (colisión y anillos), más vida
// (conserva la proporción) y ataques con área ampliada (radio, tamaño,
// ancho y alcance de los movimientos se agrandan mientras el juego los
// lanza, ver pokemech-core.js). Sin sprites Gigamax: es el mismo sprite.
// No se combina con la megaevolución, que también cambia la forma.
(() => {
  const KEY = 'dynamax';
  const S_MODE = 'pkm:dmax:mode', S_DUR = 'pkm:dmax:dur', S_HP = 'pkm:dmax:hp', S_AREA = 'pkm:dmax:area';
  const RED = '#ff2d6f', PINK = '#ff7ab0';
  let ns = null, pm = null, run = null;

  const mode = () => NX.store.get(S_MODE, 'run');
  const bossUp = () => { try { return !!ns.EnemyMgr.bossAlive(); } catch (_) { return false; } };
  const canUse = (p) => {
    if (!run || run.active || p.dead || pm.formActive(p)) return false;
    if (mode() === 'boss') return bossUp() && !run.usedBoss;
    return !run.used;
  };

  function activate() {
    const p = run && run.p;
    if (!p || !canUse(p)) {
      if (p && run && run.active == null && mode() === 'boss' && !bossUp()) NX.toast('El Dinamax se usa contra un jefe');
      return;
    }
    const dur = NX.clamp(+NX.store.get(S_DUR, 15) || 15, 5, 60);
    const hp = NX.clamp(+NX.store.get(S_HP, 1.5) || 1.5, 1, 3);
    const area = NX.clamp(+NX.store.get(S_AREA, 1.6) || 1.6, 1, 3);
    pm.setMod(p, KEY, { form: true, size: 2, hp, area });
    run.active = { t: dur, dur, t0: performance.now() };
    run.used = true;
    run.usedBoss = true;
    p.invuln = Math.max(p.invuln || 0, 1);
    pm.sfx('quake');
    pm.kick(1.2);
    pm.flash(RED, 0.5, 0.4);
    pm.bigText('¡Dinamax!', RED, `${p.mon.name || 'Tu Pokémon'} se volvió gigante`);
    try {
      for (let i = 0; i < 3; i++) ns.FX.ring(p.x, p.y, 8 + i * 10, 90 + i * 40, i % 2 ? PINK : RED, 0.5 + i * 0.15, 5);
      ns.FX.burst(p.x, p.y - p.bodyH * 0.5, RED, 26, 200);
    } catch (_) { /* sin efectos */ }
  }

  function revert(quiet) {
    const p = run && run.p;
    if (!run || !run.active) return;
    run.active = null;
    if (!p) return;
    pm.clearMod(p, KEY);
    if (!quiet) {
      try { ns.FX.ring(p.x, p.y, 10, 70, PINK, 0.45, 4); ns.FX.burst(p.x, p.y - p.bodyH * 0.5, PINK, 14, 120); } catch (_) { /* nada */ }
      NX.toast('El Dinamax terminó');
    }
  }

  function tick(dt, p) {
    if (!run || run.p !== p) return;
    // Modo por jefe: cada jefe nuevo devuelve el uso.
    if (mode() === 'boss') {
      const up = bossUp();
      if (up && !run.bossWas) run.usedBoss = false;
      run.bossWas = up;
    }
    if (!run.active) return;
    run.active.t -= dt;
    if (run.active.t <= 0 || p.dead || !pm.hasMod(p, KEY)) revert();
  }

  // Nubes rojas alrededor y sobre la cabeza, como en Galar.
  function drawAura(ctx, p, front) {
    const a = run.active, now = performance.now() / 1000;
    const k = Math.min(1, (performance.now() - a.t0) / 400) * Math.min(1, a.t / 0.6 + 0.2);
    if (!front) {
      pm.ellipseGlow(ctx, p.x, p.y, p.r * 2.6, p.r * 1.2, 'rgba(255,45,111,.6)', 0.6 * k);
      ctx.save();
      ctx.globalAlpha = 0.5 * k;
      ctx.strokeStyle = RED;
      ctx.lineWidth = 3;
      ctx.setLineDash([10, 8]);
      ctx.lineDashOffset = -now * 40;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, p.r * 2.2, p.r * 0.9, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      return;
    }
    ctx.save();
    const top = p.y - p.bodyH - 6;
    for (let i = 0; i < 7; i++) {
      const ang = now * 0.9 + i * 0.9;
      const x = p.x + Math.cos(ang) * p.r * 1.3, y = top + Math.sin(ang * 1.7) * 4;
      const r = 6 + 3 * Math.sin(now * 2 + i);
      ctx.globalAlpha = 0.45 * k;
      ctx.fillStyle = i % 2 ? PINK : RED;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    // Chispas que suben por el cuerpo.
    for (let i = 0; i < 8; i++) {
      const ph = (now * 0.8 + i / 8) % 1;
      ctx.globalAlpha = (1 - ph) * 0.7 * k;
      ctx.fillStyle = '#ffd1e0';
      ctx.fillRect(p.x + Math.cos(i * 2.4) * p.r * 1.2 - 1, p.y - ph * p.bodyH * 1.2, 2, 4);
    }
    ctx.restore();
  }
  function drawables() {
    const p = run && run.p;
    if (!p || !run.active || p !== NX.me()) return null;
    return [{ y: p.y - 0.5, draw: (ctx) => drawAura(ctx, p, false) }, { y: p.y + 0.5, draw: (ctx) => drawAura(ctx, p, true) }];
  }

  NX.feature({
    key: KEY,
    label: 'Dinamax',
    needs: (n) => !!NX.pm && NX.featureList().some((f) => f.key === 'pokemech' && f.status === 'ok') && n.EnemyMgr && typeof n.EnemyMgr.bossAlive === 'function',
    setup(n) {
      ns = n;
      pm = NX.pm;
      pm.onRun('start', (p) => { run = { p, used: false, usedBoss: false, bossWas: false, active: null }; });
      pm.onRun('end', () => { run = null; });
      pm.onTick(KEY, tick);
      pm.drawables(KEY, drawables);
      pm.button({
        id: KEY, feat: KEY, label: 'DMAX', title: 'Dinamax', key: 'H', keyCode: 'KeyH', color: RED,
        state() {
          const p = run && run.p;
          if (!p || p !== NX.me() || !pm.allowed()) return null;
          if (run.active) return { show: true, active: NX.clamp(run.active.t / run.active.dur, 0, 1) };
          const m = mode();
          const left = m === 'boss' ? !run.usedBoss : !run.used;
          if (!left && m === 'run') return null;
          const ready = canUse(p);
          return { show: true, ready, frac: ready ? 1 : 0 };
        },
        run: activate,
      });
      NX.every(500, () => { if (run && run.active && !NX.isOn(KEY)) revert(true); }, { when: 'run', key: KEY });
    },
  });

  NX.settings.section({
    key: KEY,
    tab: 'Partida',
    title: 'Dinamax',
    keywords: 'dinamax dynamax gigante gigamax tamaño',
    render(el) {
      el.appendChild(NX.ui.toggle('Activado', 'on:' + KEY, true));
      el.appendChild(NX.ui.select('Usos', S_MODE, [['run', 'Una vez por partida'], ['boss', 'Una vez por cada jefe']], 'run'));
      el.appendChild(NX.ui.range('Duración', S_DUR, 5, 30, 1, 15, (v) => v + ' s'));
      el.appendChild(NX.ui.range('Vida durante el Dinamax', S_HP, 1, 2.5, 0.1, 1.5, (v) => 'x' + v.toFixed(1)));
      el.appendChild(NX.ui.range('Área de los ataques', S_AREA, 1, 2.5, 0.1, 1.6, (v) => 'x' + v.toFixed(1)));
      el.appendChild(NX.ui.note('H o el botón DMAX. Duplica tamaño y radio, sube la vida conservando la proporción y agranda el área de los ataques. No se combina con la megaevolución. En modo "por jefe" solo se activa con un jefe en pantalla.'));
    },
  });
})();
