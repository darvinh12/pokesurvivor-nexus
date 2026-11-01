// Efectos reducidos: opacidad y tamaño de los efectos de ataque, por separado
// para los tuyos y los de tus aliados. Los proyectiles y orbes saben quién
// los lanzó; los cortes, rayos, anillos y sprites que se crean mientras uno
// de tus ataques (o de un aliado) se ejecuta se marcan al crearse. Luego se
// dibujan por grupos, cada uno con su opacidad y tamaño. Solo cambia el
// aspecto: las áreas de daño se calculan en otro lado.
// Adaptado de PokeSurvivor Plus (MIT).
(() => {
  const KEY = 'fx';
  const set = { me: { a: 1, s: 1 }, mate: { a: 1, s: 1 } };
  let plain = true, on = true;
  const readOpts = () => {
    on = NX.isOn(KEY);
    const g = (k, d) => NX.clamp((+NX.store.get(k, d) || 0) / 100, 0, 2);
    set.me.a = on ? g('fx:meA', 100) : 1;
    set.me.s = on ? g('fx:meS', 100) || 1 : 1;
    set.mate.a = on ? g('fx:mateA', 100) : 1;
    set.mate.s = on ? g('fx:mateS', 100) || 1 : 1;
    plain = set.me.a === 1 && set.me.s === 1 && set.mate.a === 1 && set.mate.s === 1;
  };
  readOpts();
  setInterval(readOpts, 1000);

  const ALPHA = Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, 'globalAlpha');
  // Toda opacidad que el juego ponga mientras dibuja un grupo se multiplica por a.
  function withAlpha(ctx, a, fn) {
    if (a >= 0.999) return fn();
    ctx.save();
    ALPHA.set.call(ctx, a);
    Object.defineProperty(ctx, 'globalAlpha', {
      configurable: true,
      get() { return ALPHA.get.call(this) / a; },
      set(v) { ALPHA.set.call(this, NX.clamp(+v || 0, 0, 1) * a); },
    });
    try { return fn(); } finally { delete ctx.globalAlpha; ctx.restore(); }
  }

  NX.feature({
    key: KEY,
    label: 'Efectos reducidos',
    needs: (ns) => ns.FX && typeof ns.FX.draw === 'function' && ns.VFX && typeof ns.VFX.draw === 'function' &&
      ns.Projectiles && typeof ns.Projectiles.draw === 'function' && typeof ns.Projectiles.all === 'function' &&
      ns.Combat && typeof ns.Combat.tick === 'function',
    setup(ns) {
      const { Combat, FX, VFX, Projectiles } = ns;
      let owner = null, scaleNow = 1;
      const arrays = new Set();
      const push = Array.prototype.push;

      // Quién está atacando ahora.
      const tick = Combat.tick;
      Combat.tick = function (dt, pl) {
        const was = owner;
        owner = pl && pl === NX.me() ? 'me' : was;
        try { return tick.apply(this, arguments); } finally { owner = was; }
      };
      if (typeof Combat.ghostCast === 'function') {
        const ghost = Combat.ghostCast;
        Combat.ghostCast = function () {
          const was = owner;
          owner = 'mate';
          try { return ghost.apply(this, arguments); } finally { owner = was; }
        };
      }

      // Marca lo que crean las funciones de efectos mientras alguien ataca.
      for (const name of ['slash', 'beam', 'ring', 'burst', 'sp']) {
        const f = FX[name];
        if (typeof f !== 'function') continue;
        FX[name] = function () {
          if (!owner || plain) return f.apply(this, arguments);
          const own = owner, sc = set[own].s;
          Array.prototype.push = function (...items) {
            for (const o of items) {
              if (!o || typeof o !== 'object' || o.__nxOwn) continue;
              o.__nxOwn = own;
              if (sc !== 1) {
                if (typeof o.scale === 'number') o.scale *= sc;
                if (typeof o.arc === 'number' && typeof o.radius === 'number') o.radius *= sc;
                if (typeof o.width === 'number' && typeof o.len === 'number') o.width *= sc;
                if (typeof o.r1 === 'number') { o.r1 *= sc; o.r0 *= sc; }
              }
              arrays.add(this);
            }
            return push.apply(this, items);
          };
          try { return f.apply(this, arguments); } finally { Array.prototype.push = push; }
        };
      }

      // Tamaño de proyectiles y orbes.
      const vdraw = VFX.draw;
      VFX.draw = function (ctx, shape, pal, x, y, o) {
        if (scaleNow !== 1 && o) o = Object.assign({}, o, { scale: (o.scale || 1) * scaleNow });
        return vdraw.call(this, ctx, shape, pal, x, y, o);
      };

      // Dibujo por grupos: lo demás, luego lo tuyo, luego lo de aliados.
      const grouped = (lists, ownerOf, drawAll, ctx) => {
        const saved = lists.map((a) => a.slice());
        const fill = (who) => lists.forEach((a, i) => { a.length = 0; for (const o of saved[i]) if (ownerOf(o) === who) push.call(a, o); });
        try {
          fill(null);
          drawAll();
          for (const who of ['me', 'mate']) {
            const st = set[who];
            if (st.a <= 0.01) continue;
            fill(who);
            if (!lists.some((a) => a.length)) continue;
            scaleNow = st.s;
            try { withAlpha(ctx, st.a, drawAll); } finally { scaleNow = 1; }
          }
        } finally {
          lists.forEach((a, i) => { a.length = 0; push.apply(a, saved[i]); });
        }
      };

      const pdraw = Projectiles.draw;
      Projectiles.draw = function (ctx) {
        if (plain) return pdraw.apply(this, arguments);
        const list = Projectiles.all();
        if (!Array.isArray(list)) return pdraw.apply(this, arguments);
        const self = NX.me();
        const ownerOf = (p) => ((!p.friendly && !p.orb) || !p.owner ? null : p.owner === self ? 'me' : 'mate');
        grouped([list], ownerOf, () => pdraw.call(this, ctx), ctx);
      };
      const fdraw = FX.draw;
      FX.draw = function (ctx) {
        if (plain || !arrays.size) return fdraw.apply(this, arguments);
        grouped([...arrays], (o) => o.__nxOwn || null, () => fdraw.call(this, ctx), ctx);
      };
    },
  });

  const pct = (v) => v + ' %';
  NX.settings.section({
    key: KEY,
    title: 'Efectos reducidos',
    tab: 'Rendimiento',
    keywords: 'efectos ataque opacidad tamaño partículas fx reducir',
    render(el) {
      el.appendChild(NX.ui.toggle('Activado', 'on:' + KEY, true, readOpts));
      el.appendChild(NX.ui.range('Opacidad de tus ataques', 'fx:meA', 0, 100, 5, 100, pct, readOpts));
      el.appendChild(NX.ui.range('Tamaño de tus ataques', 'fx:meS', 50, 150, 5, 100, pct, readOpts));
      el.appendChild(NX.ui.range('Opacidad de los aliados', 'fx:mateA', 0, 100, 5, 100, pct, readOpts));
      el.appendChild(NX.ui.range('Tamaño de los aliados', 'fx:mateS', 50, 150, 5, 100, pct, readOpts));
      el.appendChild(NX.ui.button('Restablecer', () => {
        for (const k of ['fx:meA', 'fx:meS', 'fx:mateA', 'fx:mateS']) NX.store.set(k, 100);
        readOpts();
        if (NX.togglePanel) { NX.togglePanel(); NX.togglePanel(); }
      }));
      el.appendChild(NX.ui.note('Solo cambia el aspecto. El área de daño de cada ataque sigue igual.'));
    },
  });
})();
