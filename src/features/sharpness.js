// Nitidez y rendimiento. El juego calcula su resolución como
// Math.min(1.5, devicePixelRatio) y guarda esa escala en una variable privada
// que también usa el HUD, así que no se puede subir sin romper el dibujo.
// Lo que sí se puede: bajarla a 1x (modo rendimiento), escalar el pixel art
// sin suavizado y limitar los FPS. Todo se instala antes de que cargue el
// juego, por eso este módulo no espera al namespace.
(() => {
  const KEY = 'sharp';
  const desc = Object.getOwnPropertyDescriptor(window, 'devicePixelRatio') ||
    Object.getOwnPropertyDescriptor(Window.prototype, 'devicePixelRatio');
  const readDpr = () => (desc && desc.get ? desc.get.call(window) : 1) || 1;
  NX._realDpr = readDpr();

  const perf = () => NX.isOn(KEY) && NX.store.get('res', 'game') === 'perf';
  // Con una ventana tapando el fondo del menú, el mundo de fondo se dibuja a
  // menos cuadros (perf:menufps, lo ajustan los perfiles de rendimiento).
  const fpsCap = () => {
    if (!NX.isOn(KEY)) return 0;
    const cap = +NX.store.get('fps', 0) || 0;
    const m = NX.menuCovered && NX.menuCovered() ? +NX.store.get('perf:menufps', 30) || 0 : 0;
    return m && (!cap || m < cap) ? m : cap;
  };

  NX.feature({
    key: KEY,
    label: 'Nitidez y rendimiento',
    early: true,
    setup() {
      // Modo rendimiento: el juego lee devicePixelRatio = 1.
      Object.defineProperty(window, 'devicePixelRatio', {
        configurable: true,
        get() { const real = readDpr(); NX._realDpr = real; return perf() ? 1 : real; },
      });

      // Límite de FPS: se deja pasar un cuadro solo cuando transcurrió el
      // intervalo. Todas las llamadas del mismo cuadro comparten la decisión.
      const raf = window.requestAnimationFrame.bind(window);
      const caf = window.cancelAnimationFrame.bind(window);
      const live = new Map(); // id propio -> id real vigente
      let nextId = 1, gateT = -1, gateOpen = true;
      window.requestAnimationFrame = function (cb) {
        if (!fpsCap()) return raf(cb);
        const id = nextId++;
        const step = (t) => {
          if (t !== gateT) {
            const min = 1000 / fpsCap();
            gateOpen = gateT < 0 || t - gateT >= min - 2;
            if (gateOpen) gateT = t;
          }
          if (gateOpen || !fpsCap()) { live.delete(id); cb(t); } else live.set(id, raf(step));
        };
        live.set(id, raf(step));
        return -id; // negativo para no chocar con los ids nativos
      };
      window.cancelAnimationFrame = function (id) {
        if (id < 0 && live.has(-id)) { caf(live.get(-id)); live.delete(-id); return; }
        return caf(id);
      };

      NX.css('html.nx-pixel #game{image-rendering:pixelated}');
      applyPixel();
    },
  });

  function applyPixel() {
    // A document_start todavía puede no existir el elemento raíz.
    if (!document.documentElement) { NX.onReady(applyPixel); return; }
    document.documentElement.classList.toggle('nx-pixel', NX.isOn(KEY) && !!NX.store.get('pixel', false));
  }
  // El juego recalcula su canvas con el evento resize.
  const refresh = () => { applyPixel(); window.dispatchEvent(new Event('resize')); };

  NX.settings.section({
    key: KEY,
    title: 'Nitidez y rendimiento',
    render(el) {
      el.appendChild(NX.ui.toggle('Activado', 'on:' + KEY, true, refresh));
      el.appendChild(NX.ui.select('Resolución', 'res', [['game', 'La del juego (hasta 1.5x)'], ['perf', 'Rendimiento (1x)']], 'game', refresh));
      el.appendChild(NX.ui.toggle('Escalado nítido de pixel art', 'pixel', false, refresh));
      el.appendChild(NX.ui.select('Límite de FPS', 'fps', [['0', 'Sin límite'], ['60', '60'], ['30', '30']], '0'));
      el.appendChild(NX.ui.note(`Tu pantalla: ${NX.realDpr().toFixed(2)}x. El juego dibuja a ${Math.min(1.5, NX.realDpr()).toFixed(2)}x como máximo.`));
    },
  });
})();
