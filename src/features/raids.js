// Raids legendarias. De vez en cuando aparece una guarida cerca del jugador:
// aviso en pantalla, una columna de luz roja durante unos segundos y luego un
// legendario gigante (escala x2 sobre la de jefe) con mucha vida y un tiempo
// límite. Si se vence, además de lo que suelta todo jefe del juego (monedas y
// un objeto), deja monedas extra y un boleto (Pickups.drop 'coin' y 'ticket',
// recogidos como cualquier otro) y, si está la megaevolución, una Megapiedra
// (NX.megaApi.grant). Los caramelos del juego (Game.addCandy) son de Halloween,
// así que no se usan. Si se acaba el tiempo, el legendario huye sin premio.
//
// El jefe se crea igual que los del juego (new Enemy(def, x, y, escala, true)
// con Enemies.bossScale) y entra con EnemyMgr.add. No se marca como
// "legend", para no tocar el registro de legendarios del guardado.
(() => {
  const KEY = 'raids';
  const S_FIRST = 'pkm:raid:first', S_EVERY = 'pkm:raid:every', S_CHANCE = 'pkm:raid:chance', S_HP = 'pkm:raid:hp', S_LIMIT = 'pkm:raid:limit';
  const LEG = [144, 145, 146, 150, 243, 244, 245, 249, 250, 377, 378, 379, 380, 381, 382, 383, 384, 480, 481, 482, 483, 484, 485, 486, 487, 488,
    638, 639, 640, 641, 642, 643, 644, 645, 646, 716, 717, 718, 785, 786, 787, 788, 791, 792, 800, 888, 889, 890, 894, 895, 1001, 1002, 1003, 1004, 1007, 1008];
  const WARN = 5, RED = '#ff3b5c', GOLD = '#ffd23f';
  let ns = null, pm = null, run = null;

  const num = (k, d, lo, hi) => NX.clamp(+NX.store.get(k, d) || d, lo, hi);
  const pool = () => LEG.filter((d) => ns.DEX_BY[d] && ns.SPRITE_META[d]);
  const blocked = () => {
    try { return ns.EnemyMgr.bossAlive() || (ns.Rift && ns.Rift.inArena) || (ns.Judgment && ns.Judgment.active); } catch (_) { return true; }
  };

  function denSpot(p) {
    const W = ns.World;
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * Math.PI * 2, d = 200 + Math.random() * 60;
      const x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d;
      try { if (!W || typeof W.isFree !== 'function' || W.isFree(x, y)) return [x, y]; } catch (_) { return [x, y]; }
    }
    return [p.x + 180, p.y];
  }

  function startWarn(p) {
    const list = pool();
    if (!list.length) return;
    const dex = list[Math.floor(Math.random() * list.length)];
    const [x, y] = denSpot(p);
    run.den = { dex, x, y, t: WARN };
    try { ns.Sprites.preload([dex]); } catch (_) { /* nada */ }
    pm.say('¡Una guarida brilla cerca! Se acerca una raid legendaria', WARN);
    pm.sfx('rift');
  }

  function spawnBoss() {
    const den = run.den, t = pm.time();
    run.den = null;
    const B = ns.Enemies.BOSSES || [];
    const tpl = B.find((b) => b.at >= t) || B[B.length - 1] || { hp: 3000, spd: 80, dmg: 40, xp: 300, behavior: 'chase', shotDmg: 20, shotCd: 1.1, range: 260 };
    const mon = ns.DEX_BY[den.dex] || {};
    const def = Object.assign({}, tpl, { dex: den.dex, name: mon.name || tpl.name, hp: (tpl.hp || 3000) * num(S_HP, 3, 1, 8), xp: (tpl.xp || 300) * 2 });
    delete def.at;
    const sc = Object.assign({ hp: 1, spd: 1, dmg: 1 }, ns.Enemies.bossScale(t) || {});
    const e = new ns.Enemy(def, den.x, den.y, sc, true);
    e.__pkmRaid = true;
    e.scale *= 2;
    if (e.anim) e.anim.scale = e.scale;
    try { e.r = ns.Sprites.bodyRadius(den.dex, e.scale); e.bodyH = ns.Sprites.bodyHeight(den.dex, e.scale); } catch (_) { e.r *= 2; e.bodyH *= 2; }
    ns.EnemyMgr.add(e);
    const limit = num(S_LIMIT, 150, 60, 600);
    run.raid = { e, t: limit, limit };
    run.count++;
    pm.say(`¡Raid legendaria! ¡${e.name} gigante apareció!`, 3.5);
    pm.bigText('¡Raid legendaria!', RED, `${e.name} gigante · ${Math.round(limit)} s para vencerlo`);
    pm.sfx('legend');
    pm.kick(1.3);
    try {
      ns.FX.ring(den.x, den.y, 10, 160, RED, 0.8, 6);
      ns.FX.burst(den.x, den.y - 20, RED, 30, 240);
    } catch (_) { /* nada */ }
  }

  function reward(e) {
    const x = e.x, y = e.y, P = ns.Pickups;
    const n = 12 + 4 * run.count;
    for (let i = 0; i < n; i++) P.drop('coin', x + (Math.random() - 0.5) * 120, y + (Math.random() - 0.5) * 80, 5);
    P.drop('ticket', x + 20, y - 10, 1);
    P.drop('heal', x - 24, y + 6, 1);
    let extra = '';
    try { if (NX.megaApi && NX.isOn('mega')) { NX.megaApi.grant('raid'); extra = ' · Megapiedra'; } } catch (_) { /* nada */ }
    pm.bigText('¡Raid superada!', GOLD, `${n} monedas extra · boleto${extra}`);
    pm.sfx('shinyGet');
  }

  function flee(r) {
    const e = r.e;
    run.raid = null;
    if (!e || e.dead) return;
    try { ns.FX.ring(e.x, e.y, e.r, e.r * 5, RED, 0.6, 5); ns.FX.burst(e.x, e.y - e.bodyH * 0.5, '#ffffff', 20, 200); } catch (_) { /* nada */ }
    e.dead = true;
    e.fade = 0.35;
    pm.say(`${e.name} huyó de la raid`, 3);
  }

  function tick(dt, p) {
    if (!run || run.p !== p) return;
    const t = pm.time();
    if (run.raid) {
      const r = run.raid;
      if (!r.e || r.e.dead) { run.raid = null; return; }
      r.t -= dt;
      if (r.t <= 0) flee(r);
      return;
    }
    if (run.den) {
      run.den.t -= dt;
      if (run.den.t <= 0) { if (blocked()) run.den = null; else spawnBoss(); }
      return;
    }
    if (t >= run.nextAt) {
      run.nextAt = t + num(S_EVERY, 5, 1, 20) * 60;
      if (!blocked() && Math.random() < num(S_CHANCE, 70, 0, 100) / 100) startWarn(p);
    }
  }

  function drawDen(ctx) {
    const d = run.den, now = performance.now() / 1000, f = 1 - d.t / WARN;
    pm.ellipseGlow(ctx, d.x, d.y, 60 + 30 * f, 26 + 12 * f, RED, 0.7);
    ctx.save();
    ctx.globalAlpha = 0.35 + 0.35 * f + 0.1 * Math.sin(now * 8);
    const h = 120 + 260 * f, w = 10 + 18 * f;
    const g = ctx.createLinearGradient(d.x, d.y - h, d.x, d.y);
    g.addColorStop(0, 'rgba(255,59,92,0)');
    g.addColorStop(1, 'rgba(255,90,130,.95)');
    ctx.fillStyle = g;
    ctx.fillRect(d.x - w / 2, d.y - h, w, h);
    ctx.fillStyle = 'rgba(255,255,255,.8)';
    ctx.fillRect(d.x - w / 6, d.y - h, w / 3, h);
    ctx.globalAlpha = 0.8;
    ctx.strokeStyle = RED;
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 6]);
    ctx.lineDashOffset = -now * 30;
    ctx.beginPath();
    ctx.ellipse(d.x, d.y, 70, 30, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  function drawTag(ctx) {
    const r = run.raid, e = r.e;
    if (!e || e.dead) return;
    const now = performance.now() / 1000;
    ctx.save();
    ctx.globalAlpha = 0.5 + 0.2 * Math.sin(now * 5);
    ctx.strokeStyle = RED;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(e.x, e.y, e.r * 1.9, e.r * 0.75, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.font = '800 9px Pixelify,"Segoe UI",system-ui,sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(11,24,56,.9)';
    const txt = 'RAID ' + NX.fmtTime(r.t);
    const ty = e.y - e.bodyH - 10;
    ctx.strokeText(txt, e.x, ty);
    ctx.fillStyle = r.t < 20 ? '#ff8a96' : '#ffd1dc';
    ctx.fillText(txt, e.x, ty);
    ctx.restore();
  }
  function drawables() {
    if (!run || run.p !== NX.me()) return null;
    if (run.den) return [{ y: run.den.y, draw: drawDen }];
    if (run.raid && run.raid.e && !run.raid.e.dead) return [{ y: run.raid.e.y - 1, draw: drawTag }];
    return null;
  }

  NX.feature({
    key: KEY,
    label: 'Raids legendarias',
    needs: (n) => !!NX.pm && NX.featureList().some((f) => f.key === 'pokemech' && f.status === 'ok') && typeof n.Enemy === 'function' &&
      n.Enemies && typeof n.Enemies.bossScale === 'function' && n.EnemyMgr && typeof n.EnemyMgr.add === 'function' && n.Pickups && n.Sprites && typeof n.Sprites.bodyRadius === 'function',
    setup(n) {
      ns = n;
      pm = NX.pm;
      const EP = ns.Enemy.prototype, die = EP.die;
      EP.die = function () {
        const was = this.dead;
        const r = die.apply(this, arguments);
        try {
          if (this.__pkmRaid && !was && this.dead && run && run.raid && run.raid.e === this) { run.raid = null; reward(this); }
        } catch (err) { NX.trip(KEY, err); }
        return r;
      };
      pm.onRun('start', (p) => { run = { p, nextAt: num(S_FIRST, 4, 1, 30) * 60, den: null, raid: null, count: 0 }; });
      pm.onRun('end', () => { run = null; });
      pm.onTick(KEY, tick);
      pm.drawables(KEY, drawables);
      // Apagado a mitad de partida: se cancela la guarida y el legendario huye.
      setInterval(() => {
        if (!run || NX.isOn(KEY)) return;
        run.den = null;
        if (run.raid) flee(run.raid);
      }, 1000);
    },
  });

  // Para probar desde la consola o desde otro módulo.
  NX.raidsApi = { start: () => { const p = run && run.p; if (p && !run.den && !run.raid) startWarn(p); }, state: () => (run ? { den: !!run.den, raid: !!run.raid, nextAt: run.nextAt, count: run.count } : null) };

  NX.settings.section({
    key: KEY,
    tab: 'Partida',
    title: 'Raids legendarias',
    keywords: 'raid raids legendario legendaria jefe gigante guarida evento',
    render(el) {
      el.appendChild(NX.ui.toggle('Activado', 'on:' + KEY, true));
      el.appendChild(NX.ui.range('Primera oportunidad', S_FIRST, 1, 15, 1, 4, (v) => 'min ' + v));
      el.appendChild(NX.ui.range('Luego, cada', S_EVERY, 2, 10, 1, 5, (v) => v + ' min'));
      el.appendChild(NX.ui.range('Probabilidad en cada oportunidad', S_CHANCE, 10, 100, 5, 70, (v) => v + '%'));
      el.appendChild(NX.ui.range('Vida del legendario', S_HP, 1, 6, 0.5, 3, (v) => 'x' + v.toFixed(1)));
      el.appendChild(NX.ui.range('Tiempo para vencerlo', S_LIMIT, 60, 300, 15, 150, (v) => NX.fmtTime(v)));
      el.appendChild(NX.ui.note('Aparece una guarida con aviso y, a los 5 segundos, un legendario gigante (el doble de tamaño de un jefe) con la vida de jefe multiplicada. Vencerlo da lo de todo jefe más monedas extra, un boleto y, si está activa la megaevolución, una Megapiedra. No ocurre con otro jefe en pantalla, en arenas de grieta ni en el Juicio.'));
    },
  });
})();
