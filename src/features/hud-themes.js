// Temas del HUD: variantes de color y de grosor de bordes para el HUD Nexus
// (hud-new.js) y para el panel y las ventanas de Nexus, coordinadas con las
// paletas de "Identidad Nexus Edition" (theme.js).
//
// hud-new.js dibuja en canvas con colores fijos dentro de su closure (INK
// #0b1838, EDGE #e8eef8, GOLD #ffd23f y una docena de fondos rgba) y no los
// expone. Sin editarlo, aquí se envuelve su capa "over" en NX.hudLayers y,
// solo mientras dibuja, se traducen esos colores exactos al asignarse a
// fillStyle y strokeStyle (y se escala lineWidth para el grosor de bordes).
// Fuera de esa llamada el contexto se comporta igual que siempre. Lo que
// faltaría en hud-new.js para hacerlo sin interceptar: un objeto público
// (por ejemplo NX.hudNewPalette = { ink, edge, gold, panel, slot }) leído en
// cada cuadro en lugar de las constantes, y un factor de grosor de borde.
// El panel y las ventanas usan variables CSS propias (--nx-h-*).
(() => {
  const KEY = 'hudth';
  const opt = (k, d) => NX.store.get('hudth:' + k, d);

  // Paletas: box1/box2 fondo, edge borde claro, edgeIn borde interior,
  // edgeOut contorno oscuro, accent acento (sustituye al dorado del HUD).
  const PALETTES = {
    nexus: { name: 'Nexus (violeta y cian)', box1: '#3a3396', box2: '#1c1758', edge: '#f2f0ff', edgeIn: '#7d70f2', edgeOut: '#0c0a2e', accent: '#5fe0ff' },
    esmeralda: { name: 'Esmeralda', box1: '#1f6b5a', box2: '#0f3b33', edge: '#effff9', edgeIn: '#46b894', edgeOut: '#06201b', accent: '#7dffcf' },
    carmesi: { name: 'Carmesí', box1: '#8a2a3e', box2: '#4a1222', edge: '#fff2f4', edgeIn: '#d05a72', edgeOut: '#250610', accent: '#ffb3c1' },
    noche: { name: 'Noche (gris azulado)', box1: '#2f3a4f', box2: '#161c2a', edge: '#eef3fb', edgeIn: '#6a7d9e', edgeOut: '#070a12', accent: '#9fd0ff' },
    oro: { name: 'Oro', box1: '#6a4a12', box2: '#3a2808', edge: '#fff4d6', edgeIn: '#c9962e', edgeOut: '#1d1405', accent: '#ffd23f' },
    contraste: { name: 'Alto contraste', box1: '#1a1a1a', box2: '#000000', edge: '#ffffff', edgeIn: '#bdbdbd', edgeOut: '#000000', accent: '#ffee00' },
  };
  const VARS = { box1: '--box1', box2: '--box2', edge: '--edge', edgeIn: '--edge-in', edgeOut: '--edge-out', accent: '--nx-accent' };

  const hex = (h) => {
    h = String(h || '').trim();
    const m = /^#?([0-9a-f]{6})$/i.exec(h) || /^#?([0-9a-f]{3})$/i.exec(h);
    if (!m) return null;
    let s = m[1];
    if (s.length === 3) s = s.split('').map((c) => c + c).join('');
    return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
  };
  const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

  // Paleta elegida, o la de theme.js si se pide coordinar con los menús.
  function palette() {
    const v = opt('style', 'original');
    if (v === 'original') return null;
    if (v === 'menus') {
      const root = document.documentElement;
      if (!root || !root.classList.contains('nx-th')) return null;
      const cs = getComputedStyle(root), p = {};
      for (const [k, css] of Object.entries(VARS)) p[k] = cs.getPropertyValue(css).trim();
      return hex(p.box2) && hex(p.edge) ? p : null;
    }
    return PALETTES[v] || null;
  }

  // Colores exactos de hud-new.js -> colores del tema.
  let colorMap = null, mapSig = '';
  function buildMap(p) {
    const b2 = hex(p.box2), b1 = hex(p.box1) || b2, ink = hex(p.edgeOut) || [11, 24, 56], edge = hex(p.edge) || [232, 238, 248];
    const inner = hex(p.edgeIn) || edge, acc = p.accent || '#ffd23f';
    const dark = mix(b2, [0, 0, 0], 0.35), mid = mix(b2, b1, 0.35);
    const m = new Map();
    m.set('#0b1838', p.edgeOut);
    m.set('#e8eef8', p.edge);
    m.set('#ffd23f', acc);
    for (const [s, a] of [['rgba(12,20,40,.92)', 0.92], ['rgba(20,24,44,.92)', 0.92], ['rgba(10,14,28,.94)', 0.94], ['rgba(10,16,32,.5)', 0.5],
      ['rgba(10,16,28,.45)', 0.45], ['rgba(11,24,56,.9)', 0.9], ['rgba(11,24,56,.55)', 0.55]]) m.set(s, rgba(dark, a));
    for (const [s, a] of [['rgba(22,36,74,.97)', 0.97], ['rgba(18,34,74,.95)', 0.95], ['rgba(20,40,90,.95)', 0.95]]) m.set(s, rgba(mid, a));
    m.set('rgba(140,170,210,.25)', rgba(inner, 0.25));
    m.set('rgba(232,238,248,.25)', rgba(edge, 0.25));
    m.set('rgba(232,238,248,.22)', rgba(edge, 0.22));
    m.set('rgba(200,215,240,.8)', rgba(mix(edge, inner, 0.3), 0.8));
    m.set('rgba(200,215,240,.85)', rgba(mix(edge, inner, 0.3), 0.85));
    return m;
  }
  let border = 1;
  function refresh() {
    const p = NX.isOn(KEY) ? palette() : null;
    border = NX.isOn(KEY) ? NX.clamp(+opt('border', 1) || 1, 0.5, 2) : 1;
    const sig = p ? JSON.stringify(p) : '';
    if (sig !== mapSig) { mapSig = sig; colorMap = p ? buildMap(p) : null; }
    applyCss(p);
  }

  // ---- canvas: traducción de colores solo durante el dibujo de hud-new.js
  let cur = null, curBorder = 1;
  const patched = new WeakSet();
  function patchCtx(ctx) {
    if (patched.has(ctx)) return;
    patched.add(ctx);
    const P = Object.getPrototypeOf(ctx);
    const desc = (k) => { let o = P; while (o && !Object.getOwnPropertyDescriptor(o, k)) o = Object.getPrototypeOf(o); return o && Object.getOwnPropertyDescriptor(o, k); };
    const fd = desc('fillStyle'), sd = desc('strokeStyle'), ld = desc('lineWidth');
    if (!fd || !sd || !ld) return;
    Object.defineProperty(ctx, 'fillStyle', {
      configurable: true,
      get() { return fd.get.call(this); },
      set(v) { fd.set.call(this, cur && typeof v === 'string' ? (cur.get(v) || v) : v); },
    });
    Object.defineProperty(ctx, 'strokeStyle', {
      configurable: true,
      get() { return sd.get.call(this); },
      set(v) { sd.set.call(this, cur && typeof v === 'string' ? (cur.get(v) || v) : v); },
    });
    Object.defineProperty(ctx, 'lineWidth', {
      configurable: true,
      get() { return ld.get.call(this); },
      set(v) { ld.set.call(this, curBorder !== 1 && typeof v === 'number' ? v * curBorder : v); },
    });
  }
  function wrapLayer() {
    const L = NX.hudLayers.find((l) => l && l.key === 'hudnew');
    if (!L) return false;
    if (L.__nxHudth) return true;
    const orig = L.over;
    if (typeof orig !== 'function') return false;
    L.over = function (ctx) {
      if (!colorMap && border === 1) return orig.apply(this, arguments);
      try { patchCtx(ctx); } catch (_) { return orig.apply(this, arguments); }
      cur = colorMap; curBorder = border;
      try { return orig.apply(this, arguments); } finally { cur = null; curBorder = 1; }
    };
    L.__nxHudth = true;
    return true;
  }

  // ---- panel y ventanas de Nexus
  NX.css(`html.nx-hudth #nexus-panel .nx-box,html.nx-hudth #nexus-rb,html.nx-hudth #nexus-map,html.nx-hudth #nexus-mmenu,html.nx-hudth #nexus-meter{
  background:linear-gradient(var(--nx-h-box1),var(--nx-h-box2))!important;border-color:var(--nx-h-edge)!important;outline-color:var(--nx-h-out)!important;
  box-shadow:inset 0 0 0 2px var(--nx-h-in),0 5px 0 var(--nx-h-out)!important;border-width:var(--nx-h-bw,2px)!important}
html.nx-hudth #nexus-panel h3,html.nx-hudth #nexus-rb .rb-h b,html.nx-hudth #nexus-mmenu .nx-mmh{color:var(--nx-h-acc)!important}
html.nx-hudth #nexus-panel select,html.nx-hudth #nexus-panel .nx-search,html.nx-hudth #nexus-panel .nx-btn,html.nx-hudth #nexus-panel .nx-close,
html.nx-hudth #nexus-panel .nx-tabs button:not(.on),html.nx-hudth #nexus-mmenu button,html.nx-hudth #nexus-rb .rb-c{background:var(--nx-h-out)!important;border-color:var(--nx-h-in)!important}
html.nx-hudth #nexus-panel .nx-tabs button.on{background:var(--nx-h-acc)!important;border-color:var(--nx-h-acc)!important;color:var(--nx-h-out)!important}
html.nx-hudth #nexus-panel .nx-rng b{color:var(--nx-h-acc)!important}
html.nx-hudth #nexus-panel input[type=checkbox]{accent-color:var(--nx-h-acc)}
#nexus-panel .nx-hth-sw{display:flex;gap:4px;margin:2px 0 6px}#nexus-panel .nx-hth-sw i{width:22px;height:14px;border-radius:3px;border:1px solid #fff}`);

  function applyCss(p) {
    const root = document.documentElement;
    if (!root) return;
    const want = !!p && opt('panel', true) !== false && opt('style', 'original') !== 'menus';
    root.classList.toggle('nx-hudth', want);
    if (!want) return;
    const s = root.style;
    s.setProperty('--nx-h-box1', p.box1);
    s.setProperty('--nx-h-box2', p.box2);
    s.setProperty('--nx-h-edge', p.edge);
    s.setProperty('--nx-h-in', p.edgeIn);
    s.setProperty('--nx-h-out', p.edgeOut);
    s.setProperty('--nx-h-acc', p.accent);
    s.setProperty('--nx-h-bw', Math.max(1, Math.round(2 * border)) + 'px');
  }

  NX.feature({
    key: KEY,
    label: 'Temas del HUD',
    needs: () => !!document.documentElement,
    setup() {
      refresh();
      NX.onReady(refresh);
      // hud-new.js registra su capa al arrancar; se envuelve cuando aparezca.
      const t = setInterval(() => { if (wrapLayer()) clearInterval(t); }, 300);
      setTimeout(() => clearInterval(t), 90000);
      setInterval(() => { try { refresh(); } catch (err) { NX.trip(KEY, err); } }, 1000);
    },
  });

  NX.settings.section({
    key: KEY,
    tab: 'Estilo',
    title: 'Temas del HUD',
    keywords: 'tema hud colores bordes paleta panel ventanas contraste oro esmeralda carmesí noche',
    render(el) {
      el.appendChild(NX.ui.toggle('Activado', 'on:' + KEY, true, refresh));
      el.appendChild(NX.ui.select('Tema', 'hudth:style', [
        ['original', 'Original (sin cambios)'], ['menus', 'Igual que el estilo de menús'],
        ...Object.entries(PALETTES).map(([id, p]) => [id, p.name]),
      ], 'original', () => { refresh(); if (NX.togglePanel) { NX.togglePanel(); NX.togglePanel(); } }));
      const p = palette();
      if (p) {
        const sw = document.createElement('div');
        sw.className = 'nx-hth-sw';
        sw.innerHTML = [p.box1, p.box2, p.edgeIn, p.accent, p.edge].map((c) => `<i style="background:${NX.esc(c)}"></i>`).join('');
        el.appendChild(sw);
      }
      el.appendChild(NX.ui.select('Grosor de bordes del HUD', 'hudth:border', [['0.6', 'Fino'], ['1', 'Normal'], ['1.5', 'Grueso']], '1', refresh));
      el.appendChild(NX.ui.toggle('Aplicar también al panel y las ventanas de Nexus', 'hudth:panel', true, refresh));
      el.appendChild(NX.ui.note('Cambia los colores del HUD Nexus (cajas, bordes y acentos; la vida y la experiencia siguen "Colores del HUD"). "Igual que el estilo de menús" toma la paleta de Identidad Nexus Edition; con el estilo original del juego no cambia nada.'));
    },
  });
})();
