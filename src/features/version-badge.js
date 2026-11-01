// Versión a la vista: una etiqueta junto al botón "Nexus" del menú principal y
// una línea en la pantalla de pausa, con la versión de Nexus y la del juego
// original. Tocarla abre el panel.
(() => {
  const KEY = 'verbadge';
  let gameVer = '';

  NX.css(`#nexus-ver{position:fixed;bottom:14px;z-index:9999;padding:4px 10px;border-radius:8px;cursor:pointer;
  background:rgba(11,24,56,.85);color:#cfe0ff;border:1px solid #5b83d6;font:12px var(--font,'Pixelify',system-ui,sans-serif)}
#nexus-ver b{color:#ffd23f}
#nexus-ver.hidden{display:none}
#nexus-ver-pause{margin-top:8px;font-size:12px;opacity:.75;text-align:center}`);

  const label = () => `<b>Nexus v${NX.esc(NX.version)}</b>${gameVer ? ` · juego ${NX.esc(gameVer)}` : ''}`;

  NX.feature({
    key: KEY,
    label: 'Versión a la vista',
    setup() {
      // Versión del juego original desplegado (version.json del mismo sitio).
      fetch('version.json', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((j) => {
        if (j && j.v) gameVer = String(j.v).slice(0, 7);
      }).catch(() => {});

      NX.onReady(() => {
        const el = document.createElement('div');
        el.id = 'nexus-ver';
        el.className = 'hidden';
        el.title = 'Versión actual · toca para abrir los ajustes de Nexus';
        el.addEventListener('click', (e) => { e.stopPropagation(); if (NX.togglePanel) NX.togglePanel(); });
        document.body.appendChild(el);

        const tick = () => {
          const st = NX.ns && NX.ns.Game && NX.ns.Game.state;
          const show = NX.isOn(KEY) && st === 'ui' && NX.shown('scr-menu');
          el.classList.toggle('hidden', !show);
          if (show) {
            const html = label();
            if (el.innerHTML !== html) el.innerHTML = html;
            // Al lado del botón "Nexus" si está visible; si no, en su lugar.
            const fab = document.getElementById('nexus-fab');
            const fr = fab && !fab.classList.contains('hidden') ? fab.getBoundingClientRect() : null;
            const r = fr && fr.width > 0 ? fr : null;
            const left = (r ? Math.round(r.right + 8) : 12) + 'px';
            if (el.style.left !== left) el.style.left = left;
          }
          // Línea en la pausa.
          const pause = document.getElementById('scr-pause');
          if (pause) {
            let ln = document.getElementById('nexus-ver-pause');
            if (NX.isOn(KEY) && NX.shown('scr-pause')) {
              const box = pause.querySelector('.box') || pause;
              if (!ln) { ln = document.createElement('div'); ln.id = 'nexus-ver-pause'; box.appendChild(ln); }
              const html = label();
              if (ln.innerHTML !== html) ln.innerHTML = html;
            } else if (ln) ln.remove();
          }
        };
        // Corre en el menú y en partida (la pausa ocurre en partida).
        if (NX.every) NX.every(500, tick, { when: 'always', key: KEY }); else setInterval(tick, 500);
      });
    },
  });

  NX.settings.section({
    key: KEY,
    tab: 'General',
    title: 'Versión a la vista',
    keywords: 'versión version actualización número',
    render(el) {
      el.appendChild(NX.ui.toggle('Mostrar la versión en el menú y en la pausa', 'on:' + KEY, true));
      el.appendChild(NX.ui.note(`Versión actual: Nexus v${NX.version}${gameVer ? ' sobre el juego ' + gameVer : ''}.`));
    },
  });
})();
