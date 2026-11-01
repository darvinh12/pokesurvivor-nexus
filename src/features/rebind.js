// Reasignar teclas de Nexus sin tocar los módulos que las escuchan.
//
// Cada módulo registra su atajo con NX.keys.bind y lo compara con e.code y
// e.altKey. El listener de NX.keys va en captura sobre window y se registra
// antes que cualquier módulo, así que nadie puede ponerse delante. Lo primero
// que hace con cada tecla es preguntar NX.typing(e.target): aquí se envuelve
// esa función y, con window.event (la tecla en curso), se traduce:
//  - La tecla nueva de una acción se traga (ni Nexus ni el juego la ven) y se
//    reemite en window como un KeyboardEvent sintético con la combinación
//    original, que es la que esperan los módulos. Es el mismo camino que usa
//    el menú táctil (mobile.js).
//  - La combinación original de una acción reasignada deja de llegar a
//    Nexus si así se elige (solo las teclas reales; los eventos sintéticos
//    del menú táctil siguen funcionando).
// Si el navegador no tuviera window.event, un listener propio hace la
// reemisión (sin poder desactivar la original).
(() => {
  const KEY = 'rebind';
  const MAP = 'rebind:map';
  const ACTIONS = [
    { id: 'panel', label: 'Panel de Nexus', orig: ['Alt+KeyN'] },
    { id: 'map', label: 'Minimapa', feat: 'minimap', orig: ['Alt+KeyM'] },
    { id: 'fovUp', label: 'Campo de visión: alejar', feat: 'fov', orig: ['Alt+Equal', 'Alt+NumpadAdd', 'Alt+BracketRight'], repeat: true },
    { id: 'fovDown', label: 'Campo de visión: acercar', feat: 'fov', orig: ['Alt+Minus', 'Alt+NumpadSubtract', 'Alt+Slash'], repeat: true },
    { id: 'fovReset', label: 'Campo de visión: normal', feat: 'fov', orig: ['Alt+Digit0', 'Alt+Numpad0'] },
    { id: 'shot', label: 'Captura limpia', feat: 'cleancap', orig: ['Alt+KeyS'] },
    { id: 'hitbox', label: 'Hitboxes', feat: 'hitboxes', orig: ['Alt+KeyB'] },
    { id: 'fps', label: 'Contador de FPS', feat: 'fps', orig: ['Alt+KeyF'] },
    { id: 'enc', label: 'Enciclopedia', feat: 'enc', orig: ['F1', 'Alt+KeyI'] },
    { id: 'hist', label: 'Historial', feat: 'hist', orig: ['Alt+KeyR'] },
    { id: 'mega', label: 'Megaevolución', feat: 'mega', orig: ['KeyG'] },
    { id: 'dmax', label: 'Dinamax', feat: 'dynamax', orig: ['KeyH'] },
    { id: 'tera', label: 'Teracristalización', feat: 'tera', orig: ['KeyT'] },
    { id: 'z', label: 'Movimiento Z', feat: 'zmove', orig: ['KeyZ'] },
  ];
  // Teclas sin modificador que usa el juego (o Nexus fuera de esta lista).
  const RESERVED = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyQ', 'KeyE', 'KeyR', 'KeyP',
    'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Space', 'Tab', 'Enter', 'Escape', 'Backspace', 'NumpadEnter']);
  const MODS = new Set(['AltLeft', 'AltRight', 'ControlLeft', 'ControlRight', 'ShiftLeft', 'ShiftRight', 'MetaLeft', 'MetaRight', 'CapsLock', 'ContextMenu', 'Fn']);

  const comboOf = (e) => (e.ctrlKey ? 'Ctrl+' : '') + (e.altKey ? 'Alt+' : '') + (e.shiftKey ? 'Shift+' : '') + (e.metaKey ? 'Meta+' : '') + e.code;
  const parse = (c) => {
    const parts = String(c).split('+');
    const code = parts.pop();
    return { code, ctrl: parts.includes('Ctrl'), alt: parts.includes('Alt'), shift: parts.includes('Shift'), meta: parts.includes('Meta') };
  };
  const KEYNAME = { Equal: '=', Minus: '-', Slash: '/', BracketRight: ']', BracketLeft: '[', Backquote: '`', Comma: ',', Period: '.', Semicolon: ';', Quote: "'", Backslash: '\\', NumpadAdd: '+', NumpadSubtract: '-' };
  const keyOf = (code) => {
    if (/^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase();
    if (/^(Digit|Numpad)\d$/.test(code)) return code.slice(-1);
    return KEYNAME[code] || code;
  };
  const SHOW = { Equal: '=', Minus: '−', Slash: '/', BracketRight: ']', BracketLeft: '[', Backquote: '`', Comma: ',', Period: '.', Semicolon: 'Ñ', Quote: "'", Backslash: '\\',
    NumpadAdd: 'Num +', NumpadSubtract: 'Num −', Space: 'Espacio' };
  const nice = (c) => {
    const p = parse(c);
    let k = p.code;
    if (/^Key[A-Z]$/.test(k)) k = k.slice(3);
    else if (/^Digit\d$/.test(k)) k = k.slice(5);
    else if (/^Numpad\d$/.test(k)) k = 'Num ' + k.slice(6);
    else k = SHOW[k] || k;
    return [p.ctrl && 'Ctrl', p.alt && 'Alt', p.shift && 'Mayús', p.meta && 'Meta', k].filter(Boolean).join(' + ');
  };

  const map = () => NX.store.get(MAP, {}) || {};
  const custom = (id) => map()[id] || null;
  const current = (a) => custom(a.id) || a.orig[0];

  // ¿Esta tecla es la nueva de alguna acción?
  function actionFor(e) {
    const c = comboOf(e), m = map();
    for (const a of ACTIONS) if (m[a.id] && m[a.id] === c) return a;
    return null;
  }
  // ¿Es la combinación original de una acción reasignada? (Mayús no cuenta.)
  function isBlockedOrig(e) {
    if (!NX.store.get('rebind:block', true)) return false;
    const m = map();
    for (const a of ACTIONS) {
      if (!m[a.id]) continue;
      for (const o of a.orig) {
        const p = parse(o);
        if (p.code === e.code && p.alt === e.altKey && p.ctrl === e.ctrlKey && p.meta === e.metaKey && (p.shift ? e.shiftKey : true)) return true;
      }
    }
    return false;
  }

  const synth = new WeakSet();
  let emitting = false;
  function emit(a) {
    const p = parse(a.orig[0]);
    const init = { code: p.code, key: keyOf(p.code), altKey: p.alt, ctrlKey: p.ctrl, shiftKey: p.shift, metaKey: p.meta, bubbles: true, cancelable: true };
    const down = new KeyboardEvent('keydown', init), up = new KeyboardEvent('keyup', init);
    synth.add(down); synth.add(up);
    emitting = true;
    try { window.dispatchEvent(down); window.dispatchEvent(up); } finally { emitting = false; }
  }
  NX.rebind = { actions: () => ACTIONS.map((a) => ({ id: a.id, label: a.label, key: current(a), custom: !!custom(a.id) })), emit: (id) => { const a = ACTIONS.find((x) => x.id === id); if (a) emit(a); } };

  // ---- traductor
  let viaTyping = false;
  function install() {
    const orig = NX.typing;
    if (typeof orig !== 'function' || orig.__nxRebind) return;
    const wrapped = function (el) {
      let e = null;
      try { e = window.event; } catch (_) { e = null; }
      // Capturando una tecla nueva: se atiende aquí, antes que el juego (que en
      // algunas pantallas mueve el foco a sus propios campos al teclear).
      if (cap && e && e.type === 'keydown' && e.target === cap.el) {
        cap.fn(e);
        e.preventDefault();
        e.stopImmediatePropagation();
        return true;
      }
      const r = orig.apply(this, arguments);
      if (r) return r;
      if (!e || e.type !== 'keydown' || typeof e.code !== 'string' || emitting || synth.has(e) || !NX.isOn(KEY)) return r;
      viaTyping = true;
      const a = actionFor(e);
      if (a) {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (!e.repeat || a.repeat) emit(a);
        return true;
      }
      // Antes el módulo se quedaba con esta tecla y el juego no la veía: se mantiene así.
      if (e.isTrusted && isBlockedOrig(e)) { e.preventDefault(); e.stopImmediatePropagation(); return true; }
      return r;
    };
    wrapped.__nxRebind = true;
    NX.typing = wrapped;
    // Respaldo sin window.event: reemite después de NX.keys.
    addEventListener('keydown', (e) => {
      if (viaTyping || emitting || synth.has(e) || !NX.isOn(KEY) || NX.typing(e.target)) return;
      const a = actionFor(e);
      if (!a) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (!e.repeat || a.repeat) emit(a);
    }, true);
  }

  // ---- captura de la tecla nueva
  let cap = null; // { el, fn } mientras se espera la tecla nueva
  NX.css(`#nexus-panel .nx-rb{display:grid;grid-template-columns:1fr auto auto auto;gap:4px 8px;align-items:center;margin:4px 0}
#nexus-panel .nx-rb kbd{font:inherit;font-size:12px;padding:1px 7px;border-radius:5px;background:#0b1838;border:1px solid #5b83d6;white-space:nowrap}
#nexus-panel .nx-rb kbd.nx-cu{border-color:#ffd23f;color:#ffd23f}
#nexus-panel .nx-rb .nx-btn{margin:0;padding:1px 8px;font-size:12px}
#nexus-panel .nx-rb input{font:inherit;font-size:12px;width:150px;background:#ffd23f;color:#0b1838;border:0;border-radius:5px;padding:3px 6px;text-align:center}
#nexus-panel .nx-rb-msg{min-height:16px;font-size:12px;color:#ffb3c1}`);

  function renderList(box) {
    box.innerHTML = '';
    const grid = document.createElement('div');
    grid.className = 'nx-rb';
    const msg = document.createElement('p');
    msg.className = 'nx-rb-msg';
    for (const a of ACTIONS) {
      const cu = custom(a.id);
      const lab = document.createElement('span');
      lab.textContent = a.label + (a.feat && !NX.isOn(a.feat) ? ' (módulo apagado)' : '');
      const kb = document.createElement('kbd');
      kb.className = cu ? 'nx-cu' : '';
      kb.textContent = nice(current(a));
      kb.title = cu ? 'Original: ' + a.orig.map(nice).join(' o ') : 'Tecla original';
      const ch = NX.ui.button('Cambiar', () => capture(a, kb, ch, msg, box));
      const rs = NX.ui.button('Original', () => { setKey(a, null); renderList(box); });
      rs.disabled = !cu;
      grid.append(lab, kb, ch, rs);
    }
    box.append(grid, msg);
  }
  function setKey(a, combo) {
    const m = Object.assign({}, map());
    if (combo && combo !== a.orig[0]) m[a.id] = combo; else delete m[a.id];
    NX.store.set(MAP, m);
  }
  function problem(a, combo) {
    const p = parse(combo);
    if (p.code === 'Escape') return 'Esc está reservada para cerrar ventanas.';
    if (!p.alt && !p.ctrl && !p.meta && RESERVED.has(p.code)) return nice(combo) + ' la usa el juego. Prueba con Alt + una tecla.';
    for (const b of ACTIONS) {
      if (b === a) continue;
      if (current(b) === combo) return nice(combo) + ' ya es "' + b.label + '".';
      if (!custom(b.id) && b.orig.includes(combo)) return nice(combo) + ' ya es "' + b.label + '".';
    }
    if (a.orig.includes(combo)) return null;
    if (p.ctrl && ['KeyW', 'KeyT', 'KeyN', 'Tab', 'KeyQ'].includes(p.code)) return 'El navegador no deja usar ' + nice(combo) + '.';
    return null;
  }
  function capture(a, kb, btn, msg, box) {
    const inp = document.createElement('input');
    inp.readOnly = true;
    inp.value = 'Pulsa la tecla nueva';
    inp.setAttribute('aria-label', 'Pulsa la tecla nueva para ' + a.label);
    kb.replaceWith(inp);
    btn.disabled = true;
    msg.textContent = 'Esc cancela · Retroceso vuelve a la original';
    const done = () => { if (cap && cap.el === inp) cap = null; renderList(box); };
    const seen = new WeakSet();
    const handle = (e) => {
      if (seen.has(e)) return;
      seen.add(e);
      if (MODS.has(e.code)) return;
      if (e.code === 'Escape') { done(); return; }
      if ((e.code === 'Backspace' || e.code === 'Delete') && !e.altKey && !e.ctrlKey) { setKey(a, null); done(); return; }
      const c = comboOf(e);
      const bad = problem(a, c);
      if (bad) { msg.textContent = bad; return; }
      setKey(a, c);
      done();
      NX.toast(a.label + ': ' + nice(c));
    };
    cap = { el: inp, fn: handle };
    // Respaldo por si la tecla no pasó por NX.keys.
    inp.addEventListener('keydown', (e) => { e.preventDefault(); e.stopPropagation(); handle(e); });
    inp.addEventListener('blur', () => setTimeout(() => { if (inp.isConnected) done(); }, 150));
    inp.focus();
  }

  NX.feature({
    key: KEY,
    label: 'Reasignar teclas',
    early: true,
    setup() { install(); },
  });

  NX.settings.section({
    key: KEY,
    tab: 'General',
    title: 'Reasignar teclas',
    keywords: 'teclas atajos reasignar cambiar tecla mega dinamax tera z minimapa panel fov captura hitboxes fps enciclopedia historial',
    render(el) {
      el.appendChild(NX.ui.toggle('Activado', 'on:' + KEY, true));
      el.appendChild(NX.ui.toggle('La tecla original deja de funcionar al reasignarla', 'rebind:block', true));
      const box = document.createElement('div');
      el.appendChild(box);
      renderList(box);
      el.appendChild(NX.ui.button('Restablecer todas', () => { NX.store.set(MAP, {}); renderList(box); }));
      el.appendChild(NX.ui.note('Las teclas en dorado están cambiadas. El menú táctil sigue funcionando igual. Los textos de ayuda de otros módulos muestran la tecla original.'));
    },
  });
})();
