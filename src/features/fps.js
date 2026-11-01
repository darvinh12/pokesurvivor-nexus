// Contador de FPS: una cajita arrastrable con los cuadros por segundo y,
// opcionalmente, el peor cuadro del último medio segundo. Cuenta los cuadros
// de requestAnimationFrame, así que respeta el límite de FPS si está activo.
// Alt+F la muestra u oculta.
(() => {
  const KEY = 'fps';
  const SHOWN = 'fps:shown';
  let el = null, drag = null, wantMs = false, onlyRun = false;
  const readOpts = () => { wantMs = !!NX.store.get('fps:ms', false); onlyRun = !!NX.store.get('fps:run', false); };
  readOpts();

  NX.css(`#nexus-fps{position:fixed;z-index:9997;padding:2px 8px;border-radius:7px;min-width:48px;text-align:center;user-select:none;
  font:700 12px/1.3 var(--font,'Pixelify',monospace);color:#5fe08a;background:rgba(8,16,40,.72);border:1px solid rgba(244,248,255,.3);
  text-shadow:1px 1px 0 #0a1430;white-space:nowrap}
#nexus-fps.hidden{display:none}`);

  function build() {
    el = document.createElement('div');
    el.id = 'nexus-fps';
    el.className = 'hidden';
    el.title = 'Arrastra para mover · Alt+F para ocultar';
    el.textContent = '-- FPS';
    document.body.appendChild(el);
    for (const ev of ['mousedown', 'touchstart', 'click']) el.addEventListener(ev, (e) => e.stopPropagation());
    el.classList.remove('hidden');
    drag = NX.draggable(el, 'fps', () => ({ x: innerWidth - (el.offsetWidth || 70) - 12, y: innerHeight - (el.offsetHeight || 22) - 10 }));
    let n = 0, t0 = performance.now(), prev = t0, worst = 0, lastVis = 0;
    const tick = (now) => {
      n++;
      worst = Math.max(worst, now - prev);
      prev = now;
      // Visibilidad a 5 Hz, texto a 2 Hz.
      if (now - lastVis > 200) {
        lastVis = now;
        const vis = NX.isOn(KEY) && NX.store.get(SHOWN, false) && (!onlyRun || NX.inRun());
        el.classList.toggle('hidden', !vis);
      }
      if (now - t0 >= 500) {
        const fps = Math.round((n * 1000) / (now - t0));
        if (!el.classList.contains('hidden')) {
          el.textContent = wantMs ? `${fps} FPS · ${worst.toFixed(0)} ms` : `${fps} FPS`;
          el.style.color = fps >= 50 ? '#5fe08a' : fps >= 30 ? '#ffd23f' : '#ff5f6d';
        }
        n = 0; t0 = now; worst = 0;
      }
    };
    NX.every('frame', tick, { key: KEY });
  }

  NX.feature({
    key: KEY,
    label: 'Contador de FPS',
    early: true,
    setup() { NX.onReady(build); },
  });

  NX.keys.bind((e) => e.altKey && e.code === 'KeyF' && !e.ctrlKey && !e.metaKey && NX.isOn(KEY), () => {
    const on = !NX.store.get(SHOWN, false);
    NX.store.set(SHOWN, on);
    NX.toast(on ? 'Contador de FPS visible' : 'Contador de FPS oculto');
    return true;
  });

  NX.settings.section({
    key: KEY,
    title: 'Contador de FPS',
    tab: 'Rendimiento',
    keywords: 'fps cuadros rendimiento contador',
    render(box) {
      box.appendChild(NX.ui.toggle('Activado', 'on:' + KEY, true));
      box.appendChild(NX.ui.toggle('Visible (Alt+F)', SHOWN, false));
      box.appendChild(NX.ui.toggle('Peor cuadro en milisegundos', 'fps:ms', false, readOpts));
      box.appendChild(NX.ui.toggle('Solo en partida', 'fps:run', false, readOpts));
      box.appendChild(NX.ui.button('Devolver a la esquina', () => { if (drag) drag.reset(); }));
    },
  });
})();
