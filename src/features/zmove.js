// Movimientos Z. Un ataque definitivo por partida (o recargable, según el
// ajuste) que se carga con el daño hecho. Al llenarse, la tecla Z, el botón Z
// del HUD o su toque lo lanzan: el Pokémon se carga un instante (invulnerable),
// aparece el nombre del movimiento Z del tipo de su movimiento principal y
// estalla en una gran área alrededor con un efecto propio por tipo (onda,
// vórtice o impactos). El daño sale del ataque del jugador con ese movimiento
// (Player.atkFor) multiplicado por la potencia Z y por la tabla de tipos.
(() => {
  const KEY = 'zmove';
  const S_USES = 'pkm:z:uses', S_POW = 'pkm:z:pow';
  // tipo -> [nombre, radio, forma]
  const Z = {
    normal: ['Carrera Arrolladora', 250, 'nova'], fire: ['Hecatombe Pírica', 280, 'nova'], water: ['Hidrovórtice Abisal', 270, 'vortex'],
    grass: ['Megatón Floral', 260, 'strikes'], electric: ['Gigavoltio Destructor', 270, 'strikes'], ice: ['Crioaliento Despiadado', 260, 'vortex'],
    fighting: ['Ráfaga Demoledora', 240, 'nova'], poison: ['Diluvio Ácido', 260, 'strikes'], ground: ['Barrena Telúrica', 290, 'nova'],
    flying: ['Picado Supersónico', 260, 'vortex'], psychic: ['Disruptor Psíquico', 270, 'strikes'], bug: ['Guadaña Sedosa', 250, 'vortex'],
    rock: ['Aplastamiento Gigalítico', 280, 'strikes'], ghost: ['Presa Espectral', 260, 'vortex'], dragon: ['Dracoaliento Devastador', 280, 'vortex'],
    dark: ['Agujero Negro Aniquilador', 270, 'vortex'], steel: ['Hiperembestida Metálica', 250, 'nova'], fairy: ['Arrumaco Sideral', 260, 'strikes'],
  };
  let ns = null, pm = null, run = null;

  const mainMove = (p) => {
    try { const m = p.activeMove && p.activeMove(); if (m) return m; } catch (_) { /* nada */ }
    return (p.slots && p.slots[0] && p.slots[0][0]) || null;
  };

  function activate() {
    const p = run && run.p;
    if (!p || p.dead || run.cast || run.spent) return;
    if (!run.charge.full) { NX.toast('La barra Z aún no está llena'); return; }
    const mv = mainMove(p);
    const type = (mv && Z[mv.type] ? mv.type : (p.mon.types || [])[0]) || 'normal';
    const [name, radius, shape] = Z[type] || Z.normal;
    const col = pm.typeColor(type);
    run.cast = { t: 0, type, name, radius, shape, col, mv, x: p.x, y: p.y, hit: false, seeds: [] };
    for (let i = 0; i < 9; i++) run.cast.seeds.push([Math.random() * Math.PI * 2, 0.25 + Math.random() * 0.7, Math.random() * 0.35]);
    run.charge.reset();
    if (NX.store.get(S_USES, 'once') === 'once') run.spent = true;
    p.invuln = Math.max(p.invuln || 0, 1.6);
    pm.sfx('reveal');
    pm.bigText(name, col, 'Movimiento Z · ' + pm.typeName(type), 2.4);
  }

  function impact(p, c) {
    c.hit = true;
    c.x = p.x; c.y = p.y;
    const pow = NX.clamp(+NX.store.get(S_POW, 12) || 12, 4, 40);
    const mv = c.mv || { dmg: 20, cat: 'special', type: c.type };
    let base = 20;
    try { base = (p.atkFor ? p.atkFor(mv) : p.atk) * (mv.dmg || 20); } catch (_) { base = 20; }
    const targets = ns.EnemyMgr.queryCircle(c.x, c.y, c.radius);
    for (const e of targets) {
      if (!e || e.dead || e.remote) continue;
      let k = 1;
      try { k = ns.Types.mult(c.type, e.types); } catch (_) { k = 1; }
      const dx = e.x - c.x, dy = e.y - c.y;
      try { e.hurt(base * pow * k, c.col, dx, dy, 160); } catch (err) { NX.trip(KEY, err); }
    }
    pm.sfx('quake');
    pm.kick(1.4);
    pm.flash(c.col, 0.6, 0.5);
    try {
      ns.FX.ring(c.x, c.y, 10, c.radius, c.col, 0.7, 7);
      ns.FX.ring(c.x, c.y, 6, c.radius * 0.7, '#ffffff', 0.5, 4);
      ns.FX.burst(c.x, c.y - 10, c.col, 40, 320);
      ns.FX.burst(c.x, c.y - 10, '#ffffff', 18, 220);
      ns.FX.dmgText(c.x, c.y - p.bodyH - 18, c.name, c.col, true);
    } catch (_) { /* sin efectos */ }
  }

  function tick(dt, p) {
    if (!run || run.p !== p) return;
    const c = run.cast;
    if (!c) { if (!run.spent) run.charge.update(p); return; }
    c.t += dt;
    if (!c.hit && c.t >= 0.7) impact(p, c);
    if (c.t >= 1.8) run.cast = null;
  }

  // ---------------------------------------------------------------- dibujo
  function drawZ(ctx, x, y, s, col, a) {
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(x, y);
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(-s, -s); ctx.lineTo(s, -s); ctx.lineTo(-s * 0.6, s * 0.75); ctx.lineTo(s, s * 0.75); ctx.lineTo(s, s); ctx.lineTo(-s, s); ctx.lineTo(s * 0.6, -s * 0.75); ctx.lineTo(-s, -s * 0.75); ctx.closePath();
    ctx.fillStyle = col;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
    ctx.restore();
  }
  function drawCast(ctx, p) {
    const c = run.cast, now = performance.now() / 1000;
    if (!c.hit) {
      // Carga: líneas de energía que convergen y la Z sobre la cabeza.
      const f = c.t / 0.7;
      pm.ellipseGlow(ctx, p.x, p.y - p.bodyH * 0.5, 30 + 50 * f, 30 + 50 * f, c.col, 0.6);
      ctx.save();
      ctx.strokeStyle = c.col;
      ctx.lineWidth = 2;
      for (let i = 0; i < 12; i++) {
        const ang = i * 0.5236 + now * 2, r0 = 140 * (1 - f) + 20, r1 = r0 + 26;
        ctx.globalAlpha = 0.4 + 0.6 * f;
        ctx.beginPath();
        ctx.moveTo(p.x + Math.cos(ang) * r1, p.y - p.bodyH * 0.5 + Math.sin(ang) * r1 * 0.6);
        ctx.lineTo(p.x + Math.cos(ang) * r0, p.y - p.bodyH * 0.5 + Math.sin(ang) * r0 * 0.6);
        ctx.stroke();
      }
      ctx.restore();
      drawZ(ctx, p.x, p.y - p.bodyH - 18, 7 + 3 * f, c.col, 1);
      return;
    }
    const f = Math.min(1, (c.t - 0.7) / 1.1), R = c.radius, a = 1 - f;
    // Suelo: onda que se expande.
    ctx.save();
    ctx.globalAlpha = 0.5 * a;
    const g = ctx.createRadialGradient(c.x, c.y, R * f * 0.2, c.x, c.y, R * (0.3 + 0.7 * f));
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.75, c.col);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, R * (0.3 + 0.7 * f), R * (0.3 + 0.7 * f) * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.save();
    if (c.shape === 'vortex') {
      ctx.strokeStyle = c.col;
      ctx.lineWidth = 5 * a + 1;
      for (let arm = 0; arm < 4; arm++) {
        ctx.globalAlpha = 0.8 * a;
        ctx.beginPath();
        for (let s = 0; s <= 24; s++) {
          const q = s / 24, ang = arm * 1.5708 + q * 4 + now * 5, rr = R * q * (0.4 + 0.6 * f);
          const x = c.x + Math.cos(ang) * rr, y = c.y - 8 + Math.sin(ang) * rr * 0.55;
          if (s) ctx.lineTo(x, y); else ctx.moveTo(x, y);
        }
        ctx.stroke();
      }
    } else if (c.shape === 'strikes') {
      for (const [ang, d, delay] of c.seeds) {
        const q = NX.clamp((f - delay) / 0.4, 0, 1);
        if (q <= 0 || q >= 1) continue;
        const x = c.x + Math.cos(ang) * R * d, y = c.y + Math.sin(ang) * R * d * 0.55;
        ctx.globalAlpha = 1 - q;
        ctx.fillStyle = c.col;
        ctx.fillRect(x - 5, y - 220, 10, 220);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x - 2, y - 220, 4, 220);
        pm.ellipseGlow(ctx, x, y, 34, 18, c.col, 0.9 * (1 - q));
      }
    } else {
      for (let i = 0; i < 3; i++) {
        const q = NX.clamp(f * 1.3 - i * 0.15, 0, 1);
        ctx.globalAlpha = (1 - q) * 0.9;
        ctx.strokeStyle = i === 1 ? '#ffffff' : c.col;
        ctx.lineWidth = 8 * (1 - q) + 1;
        ctx.beginPath();
        ctx.ellipse(c.x, c.y, R * q, R * q * 0.55, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.restore();
    if (f < 0.5) drawZ(ctx, c.x, c.y - p.bodyH - 18 - f * 40, 10, c.col, 1 - f * 2);
  }
  function drawables() {
    const p = run && run.p;
    if (!p || !run.cast || p !== NX.me()) return null;
    return [{ y: p.y + 1, draw: (ctx) => drawCast(ctx, p) }];
  }

  NX.feature({
    key: KEY,
    label: 'Movimientos Z',
    needs: (n) => !!NX.pm && NX.featureList().some((f) => f.key === 'pokemech' && f.status === 'ok') && n.Types && typeof n.Types.mult === 'function',
    setup(n) {
      ns = n;
      pm = NX.pm;
      pm.onRun('start', (p) => { run = { p, charge: pm.charge(60, 600), cast: null, spent: false }; });
      pm.onRun('end', () => { run = null; });
      pm.onTick(KEY, tick);
      pm.drawables(KEY, drawables);
      pm.button({
        id: KEY, feat: KEY, label: 'Z', title: 'Movimiento Z', key: 'Z', keyCode: 'KeyZ', color: '#ffe066',
        state() {
          const p = run && run.p;
          if (!p || p !== NX.me() || !pm.allowed()) return null;
          if (run.cast) return { show: true, active: 1, color: run.cast.col };
          if (run.spent) return null;
          const mv = mainMove(p);
          const col = pm.typeColor(mv && mv.type);
          return { show: true, ready: run.charge.full && !p.dead, frac: run.charge.frac, color: col };
        },
        run: activate,
        fill: () => run && run.charge.fill(),
      });
    },
  });

  NX.settings.section({
    key: KEY,
    tab: 'Partida',
    title: 'Movimientos Z',
    keywords: 'z movimiento definitivo ataque area carga cristal',
    render(el) {
      el.appendChild(NX.ui.toggle('Activado', 'on:' + KEY, true));
      el.appendChild(NX.ui.select('Usos', S_USES, [['once', 'Uno por partida'], ['recharge', 'Se recarga con el daño']], 'once'));
      el.appendChild(NX.ui.range('Potencia', S_POW, 4, 30, 1, 12, (v) => 'x' + v));
      el.appendChild(NX.ui.note('Z o el botón Z cuando la barra está llena (se carga con el daño hecho, más o menos un minuto de combate). Usa el tipo del movimiento activo: estalla en una gran área alrededor y su daño sale del ataque del jugador con ese movimiento por la potencia elegida y la tabla de tipos.'));
    },
  });
})();
