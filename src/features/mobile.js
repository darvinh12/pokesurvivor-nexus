// Nexus en pantallas táctiles. Varios módulos se manejan con atajos de teclado
// (Tab, F1, Alt+M, Alt+R...), que en un teléfono no existen. En partida aparece
// un botón pequeño "N" junto al botón de pausa del juego que abre un menú con
// esas acciones. Cada acción usa lo mismo que su atajo: NX.togglePanel para el
// panel y, para lo que no está expuesto, el mismo evento de teclado que
// escuchan los módulos (NX.keys escucha en window, así que basta con despachar
// el KeyboardEvent ahí). El medidor de daño, que en teclado va con Tab
// mantenido, se fija en pantalla con su propio ajuste "meter:pin".
// El botón va arriba a la derecha porque el joystick del juego se dibuja abajo
// a la izquierda (Touch.STICK_DEF) y la barra de ataques abajo al centro. Se
// puede arrastrar y recuerda su posición.
(() => {
  const KEY = 'mobile';
  const POS = 'mobile:fabPos';
  let fab = null, menu = null, veil = null, pausedByUs = false;

  NX.css(`#nexus-mfab{position:fixed;z-index:99996;top:calc(12px + env(safe-area-inset-top,0px));right:calc(62px + env(safe-area-inset-right,0px));
  width:40px;height:40px;box-sizing:border-box;padding:0;border-radius:9px;cursor:pointer;touch-action:none;user-select:none;-webkit-user-select:none;
  background:rgba(21,42,92,.82);color:#ffd23f;border:2px solid #f4f8ff;outline:2px solid #0b1838;font:700 18px/1 var(--font,'Pixelify',system-ui,sans-serif);
  box-shadow:0 3px 0 #0a1430;-webkit-tap-highlight-color:transparent}
#nexus-mfab.nx-open{background:#ffd23f;color:#0b1838}
#nexus-mfab.hidden,#nexus-mmenu.hidden,#nexus-mveil.hidden{display:none}
@media (orientation:portrait){#nexus-mfab{top:calc(62px + env(safe-area-inset-top,0px));right:calc(12px + env(safe-area-inset-right,0px))}}
#nexus-mveil{position:fixed;inset:0;z-index:99994;background:rgba(4,8,20,.25)}
#nexus-mmenu{position:fixed;z-index:99995;width:min(300px,calc(100vw - 16px));max-height:calc(100vh - 16px);max-height:calc(100dvh - 16px);overflow:auto;
  box-sizing:border-box;padding:8px 10px 10px;color:#fff;background:linear-gradient(#24407f,#152a5c);border:2px solid #f4f8ff;outline:2px solid #0b1838;
  border-radius:10px;box-shadow:inset 0 0 0 2px #5b83d6,0 6px 0 #0a1430;font:14px/1.2 var(--font,'Pixelify',system-ui,sans-serif);
  touch-action:pan-y;overscroll-behavior:contain;user-select:none;-webkit-user-select:none}
#nexus-mmenu .nx-mmh{display:flex;justify-content:space-between;align-items:center;margin:0 0 6px;color:#ffd23f;font-size:16px}
#nexus-mmenu .nx-mmg{display:grid;grid-template-columns:1fr 1fr;gap:6px}
#nexus-mmenu button{font:inherit;font-size:13px;min-height:44px;box-sizing:border-box;padding:4px 8px;border-radius:7px;cursor:pointer;color:#fff;
  background:#0b1838;border:2px solid #5b83d6;text-align:left;display:flex;align-items:center;justify-content:space-between;gap:6px;-webkit-tap-highlight-color:transparent}
#nexus-mmenu button:active{background:#1d3470}
#nexus-mmenu button.nx-wide{grid-column:1 / -1}
#nexus-mmenu button i{font-style:normal;font-size:11px;padding:1px 6px;border-radius:8px;background:#5b6b88}
#nexus-mmenu button i.on{background:#2fbf6a}
#nexus-mmenu .nx-mmx{min-height:40px;min-width:40px;justify-content:center;text-align:center;border-color:#f4f8ff}
#nexus-mmenu .nx-mmf{grid-column:1 / -1;display:grid;grid-template-columns:44px 1fr 44px;gap:6px;align-items:center}
#nexus-mmenu .nx-mmf button{justify-content:center;font-size:20px;padding:0}
#nexus-mmenu .nx-mmf span{text-align:center;font-size:13px}
#nexus-mmenu .nx-mmf b{display:block;color:#ffd23f;font-size:15px}`);

  // ¿Pantalla táctil? El ajuste permite forzarlo para probar en escritorio.
  const touchMode = () => {
    const mode = NX.store.get('mobile:show', 'auto');
    if (mode === 'on') return true;
    if (mode === 'off') return false;
    return matchMedia('(pointer: coarse)').matches || !!(NX.ns && NX.ns.Touch && NX.ns.Touch.active);
  };
  const isMenuOpen = () => !!menu && !menu.classList.contains('hidden');
  // Ventanas de Nexus que el menú abre y que mantienen la pausa mientras estén abiertas.
  const holding = () => NX.shown('nexus-panel') || NX.shown('nexus-hist');
  const busy = () => holding() || NX.shown('nexus-enc');

  // El mismo evento que produce el atajo de teclado.
  const press = (code, key, alt) => {
    const init = { code, key, altKey: !!alt, bubbles: true, cancelable: true };
    window.dispatchEvent(new KeyboardEvent('keydown', init));
    window.dispatchEvent(new KeyboardEvent('keyup', init));
  };

  // Pausa del juego mientras el menú (o lo que abrió) está a la vista.
  const game = () => NX.ns && NX.ns.Game;
  function pause() {
    const g = game();
    if (pausedByUs || !NX.store.get('mobile:pause', true) || !g || g.state !== 'playing' || typeof g.togglePause !== 'function') return;
    try { g.togglePause(); pausedByUs = g.state === 'paused'; } catch (_) { pausedByUs = false; }
  }
  function resume() {
    if (!pausedByUs) return;
    pausedByUs = false;
    const g = game();
    if (g && g.state === 'paused' && typeof g.togglePause === 'function') { try { g.togglePause(); } catch (_) { /* queda en pausa */ } }
  }

  // Acciones. kind: 'toggle' deja el menú abierto y muestra el estado,
  // 'open' cierra el menú y deja la pausa mientras la ventana siga abierta,
  // 'run' cierra el menú y quita la pausa antes de actuar.
  const ACTIONS = [
    { id: 'panel', label: 'Ajustes de Nexus', kind: 'open', wide: true, run: () => { if (NX.togglePanel && !NX.shown('nexus-panel')) NX.togglePanel(); } },
    { id: 'map', label: 'Minimapa', feat: 'minimap', kind: 'toggle', state: () => NX.store.get('mapShown', true), run: () => press('KeyM', 'm', true) },
    { id: 'rbuilds', label: 'Builds', feat: 'rbuilds', kind: 'toggle', state: () => !!NX.store.get('rb:pin', false),
      run: () => { const on = !NX.store.get('rb:pin', false); NX.store.set('rb:pin', on); NX.toast(on ? 'Builds visibles' : 'Builds ocultas'); } },
    { id: 'meter', label: 'Medidor de daño', feat: 'meter', kind: 'toggle', state: () => !!NX.store.get('meter:pin', false),
      run: () => { const on = !NX.store.get('meter:pin', false); NX.store.set('meter:pin', on); NX.toast(on ? 'Medidor de daño visible' : 'Medidor de daño oculto'); } },
    { id: 'hitbox', label: 'Hitboxes', feat: 'hitboxes', kind: 'toggle', state: () => !!NX.store.get('hitbox:shown', false), run: () => press('KeyB', 'b', true) },
    { id: 'fps', label: 'Contador de FPS', feat: 'fps', kind: 'toggle', state: () => !!NX.store.get('fps:shown', false), run: () => press('KeyF', 'f', true) },
    { id: 'enc', label: 'Enciclopedia', feat: 'enc', kind: 'run', run: () => press('F1', 'F1') },
    { id: 'hist', label: 'Historial', feat: 'hist', kind: 'open', run: () => { if (!NX.shown('nexus-hist')) press('KeyR', 'r', true); } },
    { id: 'shot', label: 'Captura limpia', feat: 'cleancap', kind: 'run', wide: true, delay: 150, run: () => press('KeyS', 's', true) },
  ];
  // Las mecánicas Pokémon (Mega, Dinamax, Tera, Z) aportan sus propias acciones en NX.pm.actions().
  const allActions = () => {
    let extra = [];
    try { extra = (NX.pm && typeof NX.pm.actions === 'function' && NX.pm.actions()) || []; } catch (_) { extra = []; }
    return ACTIONS.concat(extra);
  };
  const avail = (a) => (!a.feat || NX.isOn(a.feat)) && (typeof a.show !== 'function' || a.show());

  function renderMenu() {
    const fovOn = NX.isOn('fov');
    const fov = Number(NX.store.get('fov', 1.3)) || 1;
    menu.innerHTML = `<div class="nx-mmh"><span>Nexus</span><button type="button" class="nx-mmx" data-a="close" aria-label="Cerrar">X</button></div>
      <div class="nx-mmg">${allActions().filter(avail).map((a) => {
        const st = a.kind === 'toggle' ? `<i class="${a.state() ? 'on' : ''}">${a.state() ? 'Sí' : 'No'}</i>` : '';
        return `<button type="button" data-a="${a.id}"${a.wide ? ' class="nx-wide"' : ''}><span>${NX.esc(a.label)}</span>${st}</button>`;
      }).join('')}
      ${fovOn ? `<div class="nx-mmf"><button type="button" data-a="fov-" aria-label="Acercar">&minus;</button><span>Campo de visión<b>${fov.toFixed(1)}x</b></span><button type="button" data-a="fov+" aria-label="Alejar">+</button></div>` : ''}
      </div>`;
  }

  function openMenu() {
    if (!menu) return;
    pause();
    renderMenu();
    menu.classList.remove('hidden');
    veil.classList.remove('hidden');
    fab.classList.add('nx-open');
    placeMenu();
  }
  // keep: true si lo que se abrió debe conservar la pausa.
  function closeMenu(keep) {
    if (!menu) return;
    menu.classList.add('hidden');
    veil.classList.add('hidden');
    fab.classList.remove('nx-open');
    if (!keep) resume();
  }
  // El menú se abre pegado al botón sin taparlo: debajo, encima o, si no cabe
  // en vertical (teléfono en horizontal), al costado con más espacio.
  function placeMenu() {
    const r = fab.getBoundingClientRect(), mw = menu.offsetWidth, mh = menu.offsetHeight;
    const left = r.left + r.width / 2 < innerWidth / 2;
    let x = left ? r.left : r.right - mw, y;
    if (r.bottom + 8 + mh <= innerHeight - 8) y = r.bottom + 8;
    else if (r.top - 8 - mh >= 8) y = r.top - 8 - mh;
    else { x = left ? r.right + 8 : r.left - 8 - mw; y = r.top; }
    menu.style.left = NX.clamp(x, 8, Math.max(8, innerWidth - mw - 8)) + 'px';
    menu.style.top = NX.clamp(y, 8, Math.max(8, innerHeight - mh - 8)) + 'px';
  }

  function act(id) {
    if (id === 'close') { closeMenu(); return; }
    if (id === 'fov+' || id === 'fov-') {
      press(id === 'fov+' ? 'Equal' : 'Minus', id === 'fov+' ? '=' : '-', true);
      renderMenu();
      return;
    }
    const a = allActions().find((x) => x.id === id);
    if (!a || !avail(a)) return;
    if (a.kind === 'toggle') { a.run(); renderMenu(); return; }
    if (a.kind === 'open') { closeMenu(true); a.run(); return; }
    closeMenu();
    if (a.delay) setTimeout(a.run, a.delay); else a.run();
  }

  // Posición propia (arrastrable). Un toque abre el menú; arrastrar más de
  // 8 px mueve el botón.
  function placeFab(x, y) {
    x = NX.clamp(x, 0, Math.max(0, innerWidth - fab.offsetWidth));
    y = NX.clamp(y, 0, Math.max(0, innerHeight - fab.offsetHeight));
    fab.style.left = x + 'px';
    fab.style.top = y + 'px';
    fab.style.right = 'auto';
  }
  function restoreFab() {
    const p = NX.store.get(POS, null);
    if (Array.isArray(p)) placeFab(p[0], p[1]);
    else fab.style.left = fab.style.top = fab.style.right = '';
  }

  function build() {
    veil = document.createElement('div');
    veil.id = 'nexus-mveil';
    veil.className = 'hidden';
    menu = document.createElement('div');
    menu.id = 'nexus-mmenu';
    menu.className = 'hidden';
    menu.setAttribute('role', 'menu');
    fab = document.createElement('button');
    fab.id = 'nexus-mfab';
    fab.type = 'button';
    fab.className = 'hidden';
    fab.textContent = 'N';
    fab.setAttribute('aria-label', 'Menú de Nexus');
    // Que los toques en el botón y el menú no lleguen al juego.
    for (const el of [veil, menu, fab]) {
      for (const ev of ['pointerdown', 'mousedown', 'touchstart', 'click', 'wheel']) el.addEventListener(ev, (e) => e.stopPropagation());
    }
    veil.addEventListener('click', () => closeMenu());
    menu.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-a]');
      if (b) act(b.dataset.a);
    });

    let drag = null;
    fab.addEventListener('pointerdown', (e) => {
      if (e.button > 0) return;
      const r = fab.getBoundingClientRect();
      drag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, dx: e.clientX - r.left, dy: e.clientY - r.top, moved: false };
      try { fab.setPointerCapture(e.pointerId); } catch (_) { /* sin captura */ }
    });
    fab.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 8) return;
      drag.moved = true;
      placeFab(e.clientX - drag.dx, e.clientY - drag.dy);
      if (isMenuOpen()) placeMenu();
    });
    const end = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const d = drag;
      drag = null;
      if (d.moved) {
        const r = fab.getBoundingClientRect();
        NX.store.set(POS, [Math.round(r.left), Math.round(r.top)]);
      } else if (e.type === 'pointerup') {
        if (isMenuOpen()) closeMenu(); else openMenu();
      }
    };
    fab.addEventListener('pointerup', end);
    fab.addEventListener('pointercancel', end);
    // El clic sintético del navegador después del toque no hace nada más.
    fab.addEventListener('click', (e) => e.preventDefault());

    document.body.append(veil, menu, fab);
    restoreFab();
    addEventListener('resize', () => { if (NX.store.get(POS, null)) restoreFab(); if (isMenuOpen()) placeMenu(); });

    setInterval(() => {
      try {
        const g = game(), st = g && g.state;
        const show = NX.isOn(KEY) && touchMode() && NX.inRun() && (st === 'playing' || pausedByUs) && !busy();
        if (!show && isMenuOpen()) closeMenu(holding());
        fab.classList.toggle('hidden', !show);
        // La pausa que puso el menú se quita al cerrar lo que se abrió desde él.
        if (pausedByUs && !isMenuOpen() && !holding()) resume();
        if (pausedByUs && !NX.inRun()) pausedByUs = false;
      } catch (err) { NX.trip(KEY, err); }
    }, 250);
  }

  NX.feature({
    key: KEY,
    label: 'Controles táctiles de Nexus',
    needs: (ns) => !!ns.Game,
    setup() { NX.onReady(build); },
  });

  NX.settings.section({
    key: KEY,
    tab: 'General',
    title: 'Controles táctiles',
    keywords: 'móvil movil teléfono tablet táctil tactil botón menú celular',
    render(el) {
      el.appendChild(NX.ui.toggle('Activado', 'on:' + KEY, true));
      el.appendChild(NX.ui.select('Mostrar el botón N en partida', 'mobile:show', [['auto', 'Solo en pantallas táctiles'], ['on', 'Siempre'], ['off', 'Nunca']], 'auto'));
      el.appendChild(NX.ui.toggle('Pausar el juego mientras el menú está abierto', 'mobile:pause', true));
      el.appendChild(NX.ui.note('El botón N abre un menú con lo que en el teclado va por atajos: este panel, minimapa, medidor de daño, hitboxes, FPS, enciclopedia, historial, captura y campo de visión. Se puede arrastrar a otro lugar.'));
      el.appendChild(NX.ui.button('Devolver el botón a su lugar', () => { NX.store.set(POS, null); if (fab) restoreFab(); }));
    },
  });
})();
