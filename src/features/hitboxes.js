// Hitboxes: los círculos de colisión que usa el juego. Jugador (r), aliados,
// enemigos (r, jefes en naranja) y proyectiles (r). Solo dibujo: se pintan
// sobre el mundo y debajo del HUD. Alt+B los muestra u oculta.
// Radios tomados de cómo los usa PokeSurvivor Plus (MIT).
(() => {
  const KEY = 'hitboxes';
  const SHOWN = 'hitbox:shown';
  const opt = {};
  const readOpts = () => {
    opt.me = NX.store.get('hitbox:me', true) !== false;
    opt.foe = NX.store.get('hitbox:foe', true) !== false;
    opt.shot = NX.store.get('hitbox:shot', true) !== false;
    opt.mine = !!NX.store.get('hitbox:mine', false);
    opt.lift = NX.store.get('hitbox:lift', true) !== false;
  };
  readOpts();
  setInterval(readOpts, 1000);

  // Un solo trazo por grupo para no pagar un dibujo por enemigo.
  function group(ctx, list, fill, stroke, lw) {
    if (!list.length) return;
    ctx.beginPath();
    for (const [x, y, r] of list) { ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, Math.PI * 2); }
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = lw;
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }

  function draw(ctx, W, H, pl, ns) {
    if (!NX.store.get(SHOWN, false)) return;
    // El juego dibuja los cuerpos LIFT unidades más arriba que su posición;
    // al subir todos los círculos lo mismo, la geometría no cambia.
    const C = ns.Camera, k = C.scale, L = C.left(), T = C.top() + (opt.lift ? +ns.LIFT || 0 : 0);
    const vis = (x, y, r) => x > -r && y > -r && x < W + r && y < H + r;
    const add = (arr, o) => {
      if (!o || o.dead || !(o.r > 0)) return;
      const x = (o.x - L) * k, y = (o.y - T) * k, r = o.r * k;
      if (vis(x, y, r)) arr.push([x, y, r]);
    };
    if (opt.foe && ns.EnemyMgr && ns.EnemyMgr.all) {
      const foes = [], bosses = [];
      for (const e of ns.EnemyMgr.all()) add(e && e.boss ? bosses : foes, e);
      group(ctx, foes, 'rgba(255,90,100,.14)', 'rgba(255,90,100,.8)', 1);
      group(ctx, bosses, 'rgba(255,170,60,.2)', 'rgba(255,170,60,.95)', 2);
    }
    if (opt.shot && ns.Projectiles && ns.Projectiles.all) {
      const bad = [], good = [];
      for (const p of ns.Projectiles.all()) {
        if (!p) continue;
        if (!p.friendly) add(bad, p);
        else if (opt.mine) add(good, p);
      }
      group(ctx, good, 'rgba(127,224,255,.12)', 'rgba(127,224,255,.75)', 1);
      group(ctx, bad, 'rgba(255,79,216,.22)', 'rgba(255,79,216,.95)', 1.5);
    }
    if (opt.me) {
      const mates = [];
      if (ns.Coop && ns.Coop.active && Array.isArray(ns.Coop.mates)) for (const m of ns.Coop.mates) if (m && m.connected) add(mates, m.pl);
      group(ctx, mates, 'rgba(120,200,255,.18)', 'rgba(120,200,255,.95)', 1.5);
      const me = [];
      add(me, pl);
      group(ctx, me, 'rgba(95,224,138,.22)', 'rgba(95,224,138,1)', 2);
      if (me.length) { ctx.fillStyle = '#5fe08a'; ctx.fillRect(Math.round(me[0][0]) - 1, Math.round(me[0][1]) - 1, 2, 2); }
    }
  }

  NX.feature({
    key: KEY,
    label: 'Hitboxes',
    needs: (ns) => ns.Camera && ns.Camera.left && ns.EnemyMgr && ns.EnemyMgr.all && ns.Projectiles && ns.Projectiles.all,
    setup(ns) {
      NX.hudLayers.push({ key: KEY, under(ctx, w, h, pl) { if (pl) draw(ctx, w, h, pl, ns); } });
    },
  });

  NX.keys.bind((e) => e.altKey && e.code === 'KeyB' && !e.ctrlKey && !e.metaKey && NX.isOn(KEY), () => {
    const on = !NX.store.get(SHOWN, false);
    NX.store.set(SHOWN, on);
    NX.toast(on ? 'Hitboxes visibles' : 'Hitboxes ocultas');
    return true;
  });

  NX.settings.section({
    key: KEY,
    title: 'Hitboxes',
    tab: 'Partida',
    keywords: 'hitbox colisión círculo radio depuración',
    render(el) {
      el.appendChild(NX.ui.toggle('Activado', 'on:' + KEY, true));
      el.appendChild(NX.ui.toggle('Visibles (Alt+B)', SHOWN, false));
      el.appendChild(NX.ui.toggle('Tú y tus aliados', 'hitbox:me', true, readOpts));
      el.appendChild(NX.ui.toggle('Enemigos y jefes', 'hitbox:foe', true, readOpts));
      el.appendChild(NX.ui.toggle('Proyectiles enemigos', 'hitbox:shot', true, readOpts));
      el.appendChild(NX.ui.toggle('Tus proyectiles y orbes', 'hitbox:mine', false, readOpts));
      el.appendChild(NX.ui.toggle('Alinear con los sprites', 'hitbox:lift', true, readOpts));
      el.appendChild(NX.ui.note('Verde: tú. Azul: aliados. Rojo: enemigos. Naranja: jefes. Magenta: proyectiles enemigos.'));
    },
  });
})();
