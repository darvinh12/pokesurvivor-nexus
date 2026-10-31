// Capa de dibujo. El juego pinta su HUD con HUD.draw(ctx, w, h, player) en
// píxeles CSS, después del mundo. Envolverla permite dibujar sobre el mundo
// pero debajo del HUD (under) o encima de todo (over).
NX.hudLayers = []; // { key, under?(ctx, w, h, pl), over?(ctx, w, h, pl) }

function drawLayers(which, ctx, args) {
  for (const L of NX.hudLayers) {
    if (!L[which] || !NX.isOn(L.key)) continue;
    ctx.save();
    try { L[which](ctx, args[1], args[2], args[3]); } catch (err) { NX.trip(L.key, err); }
    ctx.restore();
  }
}

NX.feature({
  key: 'hud',
  label: 'Capa de dibujo',
  needs: (ns) => ns.HUD && typeof ns.HUD.draw === 'function',
  setup(ns) {
    const orig = ns.HUD.draw;
    ns.HUD.draw = function (ctx) {
      drawLayers('under', ctx, arguments);
      const r = orig.apply(this, arguments);
      drawLayers('over', ctx, arguments);
      return r;
    };
  },
});

// Paso de mundo a pantalla, en píxeles CSS.
NX.toScreen = (x, y) => {
  const C = NX.ns.Camera;
  return [(x - C.left()) * C.scale, (y - C.top()) * C.scale];
};
