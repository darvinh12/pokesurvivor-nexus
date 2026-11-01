// Captura limpia (Alt+S): guarda un PNG del juego sin HUD. En el siguiente
// cuadro se salta HUD.draw por completo (el HUD del juego y las capas de
// Nexus que van dentro) y se copia el canvas en ese momento, cuando ya está
// dibujado el mundo y todavía no el HUD. Las ventanas de Nexus son DOM y no
// salen en el canvas. Fuera de partida se copia el canvas tal como está.
(() => {
  const KEY = 'cleancap';
  let pending = false, fallbackT = 0, busy = false;

  const stamp = () => {
    const d = new Date(), p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  };

  function save(canvas, clean) {
    busy = true;
    try {
      canvas.toBlob((blob) => {
        busy = false;
        if (!blob) { NX.toast('No se pudo guardar la captura'); return; }
        NX.download(`pokesurvivor-${stamp()}.png`, blob, 'image/png');
        NX.toast(clean ? 'Captura limpia guardada' : 'Captura guardada');
      }, 'image/png');
    } catch (err) {
      busy = false;
      NX.toast('No se pudo guardar la captura');
      NX.trip(KEY, err);
    }
  }

  function request() {
    if (pending || busy) return;
    const cv = document.getElementById('game');
    if (!cv) return;
    pending = true;
    // Si el HUD no se dibuja pronto (menú o pausa), se copia el canvas tal cual.
    clearTimeout(fallbackT);
    fallbackT = setTimeout(() => {
      if (!pending) return;
      pending = false;
      save(cv, false);
    }, 250);
  }

  NX.feature({
    key: KEY,
    label: 'Captura limpia',
    // Debe envolver por fuera de la capa de dibujo del núcleo para saltarla.
    needs: (ns) => ns.HUD && typeof ns.HUD.draw === 'function' && NX.featureList().some((f) => f.key === 'hud' && f.status === 'ok'),
    setup(ns) {
      const d = ns.HUD.draw;
      ns.HUD.draw = function (ctx) {
        if (!pending || !ctx || !ctx.canvas) return d.apply(this, arguments);
        pending = false;
        clearTimeout(fallbackT);
        // toBlob copia el contenido del canvas en el momento de la llamada.
        save(ctx.canvas, true);
        return undefined;
      };
    },
  });

  NX.keys.bind((e) => e.altKey && e.code === 'KeyS' && !e.ctrlKey && !e.metaKey && NX.isOn(KEY), () => { request(); return true; });

  NX.settings.section({
    key: KEY,
    title: 'Captura limpia',
    tab: 'General',
    keywords: 'captura pantalla screenshot png foto sin hud',
    render(el) {
      el.appendChild(NX.ui.toggle('Activado (Alt+S)', 'on:' + KEY, true));
      el.appendChild(NX.ui.button('Tomar captura ahora', () => { NX.togglePanel(); setTimeout(request, 120); }));
      el.appendChild(NX.ui.note('Guarda un PNG del juego sin HUD ni ventanas. En pausa o en el menú se guarda la imagen tal como se ve.'));
    },
  });
})();
