// Sin videos ni novedades del juego oficial: en la edición no salen el botón
// de Novedades, el del canal de YouTube, el banner de "Novedades importantes"
// del menú, la ventana de novedades, el aviso de "Vídeo nuevo en el canal" ni
// el indicador de directos. Se desactivan las funciones que los abren
// (NewsUI, VideoUI, LiveUI, BannerUI) en cuanto el juego las crea, y además se
// ocultan sus botones y pantallas por si una versión futura los abre por otra vía.
(() => {
  const KEY = 'offclean';
  const PARTS = { NewsUI: ['init', 'open'], VideoUI: ['init', 'preview'], LiveUI: ['init'], BannerUI: ['init', 'preview'] };
  // Activo por defecto solo en la edición.
  const on = () => NX.isOn(KEY) && !!NX.store.get('offclean:on', !!NX.data.edition);

  NX.css(`html.nx-offclean #btn-news,html.nx-offclean #btn-yt,html.nx-offclean #menu-banner,
html.nx-offclean #scr-news,html.nx-offclean #scr-video{display:none!important}`);

  function patch(mod) {
    if (!mod || mod.__nxOff) return mod;
    for (const fn of PARTS[mod.__nxName] || []) {
      const orig = mod[fn];
      if (typeof orig !== 'function') continue;
      mod[fn] = function () { return on() ? undefined : orig.apply(this, arguments); };
    }
    Object.defineProperty(mod, '__nxOff', { value: true });
    return mod;
  }

  // El juego asigna estos módulos al namespace después de la cámara: se
  // parchean al llegar con una trampa en el propio namespace.
  NX.onNS((ns) => {
    for (const name of Object.keys(PARTS)) {
      const tag = (m) => { if (m && typeof m === 'object') { try { Object.defineProperty(m, '__nxName', { value: name }); } catch (_) { /* ya etiquetado */ } } return m; };
      if (ns[name]) { patch(tag(ns[name])); continue; }
      try {
        Object.defineProperty(ns, name, {
          configurable: true, enumerable: true,
          get() { return undefined; },
          set(v) { Object.defineProperty(ns, name, { value: patch(tag(v)), writable: true, configurable: true, enumerable: true }); },
        });
      } catch (_) { /* si no se puede, queda el ocultado por CSS */ }
    }
  });

  NX.feature({
    key: KEY,
    label: 'Sin videos ni novedades del oficial',
    early: true,
    setup() {
      const apply = () => {
        if (!document.documentElement) { NX.onReady(apply); return; }
        document.documentElement.classList.toggle('nx-offclean', !!on());
      };
      apply();
      NX.offclean = { apply };
    },
  });

  NX.settings.section({
    key: KEY,
    tab: 'General',
    title: 'Videos y novedades del juego oficial',
    keywords: 'novedades videos youtube canal banner directo noticias',
    render(el) {
      el.appendChild(NX.ui.toggle('Ocultar videos y novedades del oficial', 'offclean:on', !!NX.data.edition, () => NX.offclean && NX.offclean.apply()));
      el.appendChild(NX.ui.note('Quita el botón de Novedades, el del canal de YouTube, el banner de novedades del menú y los avisos de video nuevo o directo. Si lo vuelve a encender, recargue la página para que el juego los cargue.'));
    },
  });
})();
