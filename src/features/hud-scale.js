// Escala del HUD. El juego dibuja su HUD en píxeles CSS con HUD.draw; aquí se
// envuelve con ctx.scale(k) y se le pasa un ancho y alto divididos entre k,
// así el HUD queda más grande sin salirse de la pantalla. Lo que el HUD
// dibuja anclado al mundo usa Camera.scale, que se divide entre k mientras
// dura la llamada. Los botones del HUD (Touch.addButton) se registran en
// coordenadas del HUD y se prueban contra el puntero, así que se escalan
// igual. En pantallas táctiles el HUD conserva su tamaño.
// Adaptado de PokeSurvivor Plus (MIT).
(() => {
  const KEY = 'hudscale';
  const SKEY = 'hudscale:k';
  const read = () => Math.round(NX.clamp(+NX.store.get(SKEY, 1) || 1, 1, 2) * 10) / 10;
  let k = read();
  setInterval(() => { k = read(); }, 1000);
  let touch = false;

  // Escala efectiva, también para otros módulos que quieran acompañarla.
  NX.hudK = () => (NX.isOn(KEY) && !touch ? k : 1);

  NX.feature({
    key: KEY,
    label: 'Escala del HUD',
    // Debe envolver por fuera de la capa de dibujo del núcleo.
    needs: (ns) => ns.HUD && typeof ns.HUD.draw === 'function' && ns.Camera && 'scale' in ns.Camera &&
      NX.featureList().some((f) => f.key === 'hud' && f.status === 'ok'),
    setup(ns) {
      const C = ns.Camera, T = ns.Touch;
      let btnK = 1;
      if (T && typeof T.addButton === 'function') {
        const add = T.addButton;
        T.addButton = function (x, y, w, h, fn, pad) {
          if (btnK === 1) return add.apply(this, arguments);
          return add.call(this, x * btnK, y * btnK, w * btnK, h * btnK, fn, (pad == null ? 6 : pad) * btnK);
        };
      }
      const draw = ns.HUD.draw;
      ns.HUD.draw = function (ctx, w, h) {
        touch = !!(T && T.active);
        const s = NX.hudK();
        if (s === 1 || !ctx || typeof ctx.scale !== 'function') return draw.apply(this, arguments);
        const cs = C.scale;
        const args = Array.prototype.slice.call(arguments);
        args[1] = w / s;
        args[2] = h / s;
        ctx.save();
        ctx.scale(s, s);
        C.scale = cs / s;
        btnK = s;
        try { return draw.apply(this, args); } finally {
          btnK = 1;
          C.scale = cs;
          ctx.restore();
        }
      };
    },
  });

  NX.settings.section({
    key: KEY,
    title: 'Escala del HUD',
    tab: 'HUD',
    keywords: 'tamaño hud grande zoom interfaz',
    render(el) {
      el.appendChild(NX.ui.toggle('Activado', 'on:' + KEY, true));
      el.appendChild(NX.ui.range('Tamaño del HUD', SKEY, 1, 2, 0.1, 1, (v) => v.toFixed(1) + 'x', () => { k = read(); }));
      el.appendChild(NX.ui.note('Agranda vida, ataques, reloj y flechas. En pantallas táctiles el HUD conserva su tamaño.'));
    },
  });
})();
