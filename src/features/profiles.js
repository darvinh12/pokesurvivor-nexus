// Perfiles de un toque: "Teléfono / ahorro", "PC", "Mínimo" y "Personalizado".
// Cada perfil fija de golpe ajustes que ya existen en otros módulos (calidad
// del mapa, nitidez y límite de FPS, filtros, efectos, terrenos y módulos
// visuales pesados) y muestra qué cambió. "Personalizado" devuelve los valores
// que tenías antes de aplicar un perfil. La primera vez sugiere uno según el
// dispositivo.
(() => {
  const KEY = 'profiles';
  const S_CUR = 'prof:cur', S_CUSTOM = 'prof:custom', S_LAST = 'prof:last', S_ASKED = 'prof:asked';

  const coarse = (() => { try { return matchMedia('(pointer: coarse)').matches; } catch (_) { return false; } })();
  const yn = (v) => (v ? 'sí' : 'no');
  const onoff = (v) => (v ? 'encendido' : 'apagado');
  const pct = (v) => (+v) + ' %';
  const QTXT = ['Apagado', 'Bajo', 'Medio', 'Alto'];
  const SF = { off: 'Ninguno', gb: 'Game Boy', night: 'Nocturno', vivid: 'Colores vivos' };

  // [clave, etiqueta, valor por defecto del módulo dueño, formato]. Los valores
  // de las listas desplegables se guardan como texto, igual que NX.ui.select.
  const KEYS = [
    ['look:q', 'Calidad del mapa', coarse ? '1' : '2', (v) => QTXT[+v] || v],
    ['look:decor', 'Decoración del suelo', true, yn],
    ['look:liquid', 'Agua y líquidos animados', true, yn],
    ['look:sway', 'Vaivén de hierba y árboles', true, yn],
    ['look:light', 'Luz suave y sombras', true, yn],
    ['look:auto', 'Bajar la calidad sola si caen los FPS', true, yn],
    ['on:sharp', 'Nitidez y rendimiento', true, onoff],
    ['res', 'Resolución', 'game', (v) => (v === 'perf' ? 'Rendimiento (1x)' : 'La del juego')],
    ['fps', 'Límite de FPS', '0', (v) => (+v ? String(v) : 'Sin límite')],
    ['perf:menufps', 'FPS del fondo con una ventana abierta en el menú', '30', (v) => (+v ? String(v) : 'Sin límite')],
    ['sfilter:mode', 'Filtro de color', 'off', (v) => SF[v] || v],
    ['sfilter:crt', 'Efecto CRT', false, yn],
    ['fx:meA', 'Opacidad de tus ataques', 100, pct],
    ['fx:meS', 'Tamaño de tus ataques', 100, pct],
    ['fx:mateA', 'Opacidad de los aliados', 100, pct],
    ['fx:mateS', 'Tamaño de los aliados', 100, pct],
    ['mapint:sway', 'La hierba se mece al pasar', true, yn],
    ['map:terrain', 'Terreno en el minimapa', true, yn],
    ['on:minimap', 'Minimapa', true, onoff],
    ['on:terrains', 'Terrenos con efectos', true, onoff],
  ];
  const BY = new Map(KEYS.map((k) => [k[0], k]));

  // Lo que no aparece en un perfil no se toca.
  const PROFILES = [
    {
      id: 'phone', name: 'Teléfono / ahorro',
      desc: 'Mapa en calidad baja, resolución 1x y 30 FPS. Menos calor y batería sin perder información.',
      set: {
        'look:q': '1', 'look:sway': false, 'look:light': false, 'look:auto': true,
        'on:sharp': true, res: 'perf', fps: '30', 'perf:menufps': '20', 'sfilter:mode': 'off', 'sfilter:crt': false,
        'fx:meA': 100, 'fx:meS': 100, 'fx:mateA': 60, 'fx:mateS': 85,
        'mapint:sway': false, 'map:terrain': false, 'on:minimap': true, 'on:terrains': true,
      },
    },
    {
      id: 'pc', name: 'PC',
      desc: 'Todo el aspecto del mapa en calidad alta, resolución del juego y sin límite de FPS.',
      set: {
        'look:q': '3', 'look:decor': true, 'look:liquid': true, 'look:sway': true, 'look:light': true, 'look:auto': true,
        'on:sharp': true, res: 'game', fps: '0', 'perf:menufps': '30',
        'fx:meA': 100, 'fx:meS': 100, 'fx:mateA': 100, 'fx:mateS': 100,
        'mapint:sway': true, 'map:terrain': true, 'on:minimap': true, 'on:terrains': true,
      },
    },
    {
      id: 'min', name: 'Mínimo',
      desc: 'Lo justo para equipos muy lentos: mapa sin decoración ni animaciones, sin minimapa ni terrenos, 1x y 30 FPS.',
      set: {
        'look:q': '0', 'look:decor': false, 'look:liquid': false, 'look:sway': false, 'look:light': false, 'look:auto': true,
        'on:sharp': true, res: 'perf', fps: '30', 'perf:menufps': '10', 'sfilter:mode': 'off', 'sfilter:crt': false,
        'fx:meA': 80, 'fx:meS': 90, 'fx:mateA': 35, 'fx:mateS': 70,
        'mapint:sway': false, 'map:terrain': false, 'on:minimap': false, 'on:terrains': false,
      },
    },
  ];
  const PBY = new Map(PROFILES.map((p) => [p.id, p]));
  const NAME = (id) => (id === 'custom' ? 'Personalizado' : (PBY.get(id) || {}).name || 'Personalizado');

  const read = (k) => { const d = BY.get(k); return NX.store.get(k, d ? d[2] : null); };
  const same = (a, b) => String(a) === String(b);
  const show = (k, v) => { const d = BY.get(k); return d ? d[3](v) : String(v); };

  // Sugerencia según el dispositivo: pantalla táctil y pequeña, o equipo modesto.
  function suggest() {
    let small = false, weak = false;
    try { small = Math.min(screen.width, screen.height) <= 820; } catch (_) { small = false; }
    const mem = navigator.deviceMemory, cores = navigator.hardwareConcurrency;
    weak = (mem && mem <= 4) || (cores && cores <= 4);
    return (coarse && small) || weak ? 'phone' : 'pc';
  }

  // Perfil actual: el último aplicado, si sus valores siguen intactos.
  function current() {
    const id = NX.store.get(S_CUR, 'custom');
    const p = PBY.get(id);
    if (!p) return 'custom';
    return Object.entries(p.set).every(([k, v]) => same(read(k), v)) ? id : 'custom';
  }

  function snapshot() {
    const o = {};
    for (const [k] of KEYS) o[k] = read(k);
    return o;
  }

  function apply(id) {
    const target = id === 'custom' ? NX.store.get(S_CUSTOM, null) : (PBY.get(id) || {}).set;
    if (!target) { NX.toast('Todavía no hay valores personalizados guardados'); return []; }
    if (id === 'custom' && current() === 'custom') { NX.toast('Ya estás usando tus valores personalizados'); return []; }
    // Al salir de tus valores propios se guardan para poder volver.
    if (id !== 'custom' && current() === 'custom') NX.store.set(S_CUSTOM, snapshot());
    const changes = [];
    for (const [k, v] of Object.entries(target)) {
      if (!BY.has(k)) continue;
      const before = read(k);
      if (same(before, v)) continue;
      NX.store.set(k, v);
      changes.push([BY.get(k)[1], show(k, before), show(k, v)]);
    }
    NX.store.set(S_CUR, id);
    NX.store.set(S_LAST, { id, at: Date.now(), changes });
    NX.store.set(S_ASKED, true);
    // La nitidez y la resolución se aplican con un resize; el resto lo leen los módulos solos.
    if (changes.length) window.dispatchEvent(new Event('resize'));
    NX.toast(`Perfil ${NAME(id)}: ${changes.length ? changes.length + ' cambio' + (changes.length > 1 ? 's' : '') : 'ya estaba aplicado'}`);
    return changes;
  }

  // ---- interfaz
  NX.css(`#nexus-panel .nx-pf-row{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0}
#nexus-panel .nx-pf-row .nx-btn{margin:0}
#nexus-panel .nx-pf-row .nx-btn.on{background:#ffd23f;color:#0b1838;border-color:#ffd23f}
#nexus-panel .nx-pf-ch{margin:4px 0 0;padding-left:18px;font-size:12px}
#nexus-panel .nx-pf-ch li{margin:1px 0}#nexus-panel .nx-pf-ch b{color:#ffd23f;font-weight:400}
#nexus-prof-hint{position:fixed;right:12px;bottom:12px;z-index:9999;max-width:300px;padding:10px 12px;border-radius:9px;
  background:#152a5c;color:#fff;border:2px solid #f4f8ff;outline:2px solid #0b1838;font:13px/1.35 var(--font,'Pixelify',system-ui,sans-serif)}
#nexus-prof-hint.hidden{display:none}#nexus-prof-hint b{color:#ffd23f}
#nexus-prof-hint .nx-ph-b{display:flex;gap:6px;margin-top:8px}
#nexus-prof-hint button{font:inherit;background:#0b1838;color:#fff;border:2px solid #f4f8ff;border-radius:6px;cursor:pointer;padding:4px 10px;min-height:36px}
#nexus-prof-hint button.yes{background:#ffd23f;color:#0b1838;border-color:#ffd23f}`);

  function render(el, compact) {
    const cur = current(), sug = suggest();
    if (!compact) el.appendChild(NX.ui.note('Un toque fija varios ajustes de rendimiento a la vez. Lo que cambies a mano después pasa a "Personalizado", y "Personalizado" devuelve los valores que tenías antes del primer perfil.'));
    const row = document.createElement('div');
    row.className = 'nx-pf-row';
    for (const id of [...PROFILES.map((p) => p.id), 'custom']) {
      const b = NX.ui.button(NAME(id) + (id === sug ? ' (sugerido)' : ''), () => {
        apply(id);
        el.innerHTML = '';
        render(el, compact);
      });
      if (id === cur) b.classList.add('on');
      if (id === 'custom' && !NX.store.get(S_CUSTOM, null)) b.disabled = true;
      row.appendChild(b);
    }
    el.appendChild(row);
    const p = PBY.get(cur);
    el.appendChild(NX.ui.note(p ? 'Activo: ' + p.name + '. ' + p.desc : 'Activo: Personalizado (tus propios valores).'));
    const last = NX.store.get(S_LAST, null);
    if (last && Array.isArray(last.changes)) {
      el.appendChild(NX.ui.note(last.changes.length ? `Último cambio (${NAME(last.id)}):` : `Último perfil aplicado (${NAME(last.id)}): no hizo falta cambiar nada.`));
      if (last.changes.length && !compact) {
        const ul = document.createElement('ul');
        ul.className = 'nx-pf-ch';
        ul.innerHTML = last.changes.map(([l, a, b]) => `<li>${NX.esc(l)}: ${NX.esc(a)} → <b>${NX.esc(b)}</b></li>`).join('');
        el.appendChild(ul);
      } else if (last.changes.length) {
        el.appendChild(NX.ui.note(last.changes.map(([l, , b]) => `${l}: ${b}`).join(' · ')));
      }
    }
  }

  // Sugerencia la primera vez, en el menú principal.
  let hint = null;
  function hintTick(task) {
    if (NX.store.get(S_ASKED, false) || !NX.isOn(KEY)) { if (hint) hint.classList.add('hidden'); if (NX.store.get(S_ASKED, false)) task.stop(); return; }
    const inMenu = NX.ns && NX.ns.Game && NX.ns.Game.state === 'ui' && NX.shown('scr-menu');
    if (!hint) {
      if (!inMenu || !document.body) return;
      const id = suggest(), p = PBY.get(id);
      hint = document.createElement('div');
      hint.id = 'nexus-prof-hint';
      hint.innerHTML = `Parece que juegas en ${id === 'phone' ? 'un teléfono o un equipo modesto' : 'una PC'}. ¿Aplicar el perfil de rendimiento <b>${NX.esc(p.name)}</b>?` +
        '<div class="nx-ph-b"><button type="button" class="yes">Aplicar</button><button type="button" class="no">Ahora no</button></div>' +
        '<div class="nx-note" style="font-size:11px;opacity:.7;margin-top:6px">Puedes cambiarlo cuando quieras en Nexus › Rendimiento.</div>';
      for (const ev of ['pointerdown', 'mousedown', 'touchstart', 'click']) hint.addEventListener(ev, (e) => e.stopPropagation());
      hint.querySelector('.yes').addEventListener('click', () => { apply(id); hint.remove(); hint = null; });
      hint.querySelector('.no').addEventListener('click', () => { NX.store.set(S_ASKED, true); hint.remove(); hint = null; });
      document.body.appendChild(hint);
    }
    hint.classList.toggle('hidden', !inMenu);
  }

  NX.feature({
    key: KEY,
    label: 'Perfiles de rendimiento',
    needs: (ns) => ns.Game,
    setup() {
      if (NX.store.get(S_ASKED, false)) return;
      const task = NX.every(1000, () => hintTick(task), { when: 'menu', key: KEY, name: 'sugerencia', leave: () => { if (hint) hint.classList.add('hidden'); } });
    },
  });

  NX.profiles = { list: () => PROFILES.map((p) => ({ id: p.id, name: p.name, set: Object.assign({}, p.set) })), current, apply, suggest, keys: () => KEYS.map((k) => k[0]) };

  NX.settings.section({
    key: KEY,
    tab: 'Rendimiento',
    title: 'Perfiles de rendimiento',
    keywords: 'perfil perfiles teléfono móvil ahorro batería pc mínimo personalizado calidad fps resolución rendimiento',
    render: (el) => render(el, false),
  });
  NX.settings.section({
    key: KEY,
    tab: 'Rendimiento',
    title: 'Fondo del menú',
    keywords: 'menú fondo pokédex tienda ventana fps lento',
    render(el) {
      el.appendChild(NX.ui.note('Con la Pokédex, la tienda u otra ventana abierta en el menú, el mapa de fondo queda tapado: se dibuja a menos cuadros y sin agua animada, vaivén ni sombras. Necesita "Nitidez y rendimiento" activado.'));
      el.appendChild(NX.ui.select('FPS del fondo tapado', 'perf:menufps', [['0', 'Sin límite'], ['30', '30'], ['20', '20'], ['10', '10']], '30'));
    },
  });
  NX.settings.section({
    key: KEY,
    tab: 'General',
    title: 'Perfil de rendimiento',
    keywords: 'perfil teléfono pc mínimo personalizado',
    render: (el) => render(el, true),
  });
})();
