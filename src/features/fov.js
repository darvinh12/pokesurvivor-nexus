// Campo de visión. Camera.fit() calcula scale = min(ancho / VIEW_W, alto / MIN_VIEW_H),
// así que escalar ambas referencias muestra proporcionalmente más mapa.
(() => {
  const KEY = 'fov', MIN = 1, MAX = 1.7, STEP = 0.1;
  const clampFov = (f) => Math.round(NX.clamp(+f || 1, MIN, MAX) * 10) / 10;
  let apply = () => {};

  NX.feature({
    key: KEY,
    label: 'Campo de visión',
    needs: (ns) => ns.Camera && typeof ns.Camera.resize === 'function' && ns.Camera.VIEW_W > 0 && ns.Camera.MIN_VIEW_H > 0,
    setup(ns) {
      const C = ns.Camera, baseW = C.VIEW_W, baseH = C.MIN_VIEW_H;
      let lastArgs = null;
      const orig = C.resize;
      C.resize = function () { lastArgs = arguments; return orig.apply(this, arguments); };
      apply = () => {
        const f = NX.isOn(KEY) ? clampFov(NX.store.get('fov', 1.3)) : 1;
        C.VIEW_W = baseW * f;
        C.MIN_VIEW_H = baseH * f;
        // Si el juego ya dimensionó la cámara antes de que llegáramos, fit()
        // recalcula la escala con el tamaño que guardó.
        if (lastArgs) C.resize.apply(C, lastArgs);
        else if (typeof C.fit === 'function' && C._cw) C.fit();
      };
      apply();
    },
  });

  const setFov = (f) => {
    f = clampFov(f);
    NX.store.set('fov', f);
    apply();
    NX.toast(`Campo de visión ${f.toFixed(1)}x`);
  };
  NX.keys.bind((e) => e.altKey && NX.isOn(KEY) && ['Equal', 'NumpadAdd', 'BracketRight'].includes(e.code),
    () => { setFov(clampFov(NX.store.get('fov', 1.3)) + STEP); return true; });
  NX.keys.bind((e) => e.altKey && NX.isOn(KEY) && ['Minus', 'NumpadSubtract', 'Slash'].includes(e.code),
    () => { setFov(clampFov(NX.store.get('fov', 1.3)) - STEP); return true; });
  NX.keys.bind((e) => e.altKey && NX.isOn(KEY) && ['Digit0', 'Numpad0'].includes(e.code),
    () => { setFov(1); return true; });

  NX.settings.section({
    key: KEY,
    title: 'Campo de visión',
    render(el) {
      el.appendChild(NX.ui.toggle('Activado', 'on:' + KEY, true, () => apply()));
      el.appendChild(NX.ui.range('Alejamiento', 'fov', MIN, MAX, STEP, 1.3, (v) => v.toFixed(1) + 'x', () => apply()));
      el.appendChild(NX.ui.note('Atajos: Alt + / Alt − / Alt 0. A partir de 1.5x algunos equipos pueden notar más carga.'));
    },
  });
})();
