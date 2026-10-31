/*! PokeSurvivor Nexus v0.1.0 */
(() => {
'use strict';
if (window.__nexus) return;
const NX = { version: '0.1.0' };
window.__nexus = {
  version: '0.1.0',
  status: () => NX.featureList(),
  ns: () => NX.ns,
};

// ---- core/store.js
// Ajustes persistentes en localStorage, con el prefijo nexus:.
NX.store = {
  get(key, def) {
    try {
      const v = localStorage.getItem('nexus:' + key);
      return v == null ? def : JSON.parse(v);
    } catch (_) { return def; }
  },
  set(key, value) {
    try { localStorage.setItem('nexus:' + key, JSON.stringify(value)); } catch (_) { /* almacenamiento lleno o bloqueado */ }
  },
};

// ---- core/util.js
// Ayudas compartidas. El mod corre a document_start, así que todo lo que
// toque el DOM espera a que exista el body.
NX.onReady = (fn) => {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true });
  else fn();
};
NX.css = (text) => NX.onReady(() => {
  const s = document.createElement('style');
  s.textContent = text;
  document.head.appendChild(s);
});
NX.clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
NX.esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// El devicePixelRatio real, guardado antes de que el módulo de nitidez lo sobrescriba.
NX.realDpr = () => NX._realDpr || window.devicePixelRatio || 1;

NX.me = () => {
  const ns = NX.ns;
  if (!ns || !ns.Game) return null;
  return (ns.Coop && ns.Coop.active ? ns.Coop.local : ns.Game.player) || null;
};
NX.inRun = () => {
  const st = NX.ns && NX.ns.Game && NX.ns.Game.state;
  return !!NX.me() && st !== 'ui' && st !== 'over';
};
NX.shown = (id) => {
  const e = document.getElementById(id);
  return !!e && !e.classList.contains('hidden');
};

// Aviso breve en pantalla.
NX.css(`#nexus-toast{position:fixed;left:50%;top:14px;transform:translateX(-50%);z-index:100001;pointer-events:none;
  padding:7px 14px;border-radius:8px;background:rgba(12,20,44,.92);color:#fff;border:2px solid #ffd23f;
  font:14px/1.3 var(--font,'Pixelify',system-ui,sans-serif);opacity:0;transition:opacity .18s}
#nexus-toast.on{opacity:1}`);
let toastEl = null, toastT = 0;
NX.toast = (msg) => NX.onReady(() => {
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.id = 'nexus-toast';
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = msg;
  toastEl.classList.add('on');
  clearTimeout(toastT);
  toastT = setTimeout(() => toastEl.classList.remove('on'), 1600);
});

// ---- core/hook.js
// Captura del namespace privado del juego. El bundle guarda sus módulos
// (Camera, HUD, Game, EnemyMgr...) en un objeto dentro de un closure y los
// asigna uno por uno. Desde la actualización del 31 de octubre de 2026 ese
// objeto se crea con Object.create(null), así que una trampa en
// Object.prototype ya no lo ve. Ahora envolvemos Object.create mientras se
// ejecuta app.min.js y ponemos una trampa de "Camera" en cada objeto sin
// prototipo que cree. El que recibe Camera y ya tiene LIFT y U es el namespace.
NX.ns = null;
const nsWaiters = [];
NX.onNS = (fn) => {
  if (NX.ns) {
    try { fn(NX.ns); } catch (err) { console.warn('[nexus]', err); }
  } else nsWaiters.push(fn);
};
const isNS = (o) => !!o && typeof o === 'object' && 'LIFT' in o && 'U' in o && !!o.Camera;
function gotNS(ns) {
  if (NX.ns) return;
  NX.ns = ns;
  cleanup();
  for (const fn of nsWaiters.splice(0)) {
    try { fn(ns); } catch (err) { console.warn('[nexus]', err); }
  }
}

const origCreate = Object.create;
const candidates = [];
const trapSet = function (v) {
  Object.defineProperty(this, 'Camera', { value: v, writable: true, configurable: true, enumerable: true });
  if (isNS(this)) gotNS(this);
};
const fromGame = () => {
  const s = document.currentScript;
  return !!s && /\/js\/app\.min\.js(\?|$)/.test(s.src || '');
};
Object.create = function (proto, props) {
  const o = origCreate.apply(Object, arguments);
  if (proto === null && props === undefined && !NX.ns && candidates.length < 2000 && fromGame()) {
    candidates.push(o);
    Object.defineProperty(o, 'Camera', { configurable: true, enumerable: false, get() { return undefined; }, set: trapSet });
  }
  return o;
};

// Las versiones anteriores del juego usaban un objeto normal: se conserva la
// trampa en Object.prototype por si vuelve ese esquema.
const prevTrap = Object.getOwnPropertyDescriptor(Object.prototype, 'Camera');
Object.defineProperty(Object.prototype, 'Camera', {
  configurable: true,
  get() { return undefined; },
  set(v) {
    if (prevTrap && prevTrap.set) prevTrap.set.call(this, v);
    else Object.defineProperty(this, 'Camera', { value: v, writable: true, configurable: true, enumerable: true });
    if (isNS(this)) gotNS(this);
  },
});

// Quita las trampas que sobran y devuelve Object.create a su estado original.
function cleanup() {
  if (Object.create !== origCreate) Object.create = origCreate;
  for (const o of candidates.splice(0)) {
    const d = Object.getOwnPropertyDescriptor(o, 'Camera');
    if (d && d.set === trapSet) delete o.Camera;
  }
  const d = Object.getOwnPropertyDescriptor(Object.prototype, 'Camera');
  if (d && d.get && !d.value) delete Object.prototype.Camera;
}

// Respaldos: un candidato que ya tenga los módulos (si la trampa no saltó), o
// el namespace que deja PokeSurvivor Plus en window.__psmodNS.
const scan = () => {
  if (NX.ns) return true;
  const hit = candidates.find((o) => 'LIFT' in o && 'U' in o && (Object.getOwnPropertyDescriptor(o, 'Camera') || {}).value);
  if (hit) { gotNS(hit); return true; }
  if (isNS(window.__psmodNS)) { gotNS(window.__psmodNS); return true; }
  return false;
};
document.addEventListener('DOMContentLoaded', scan, { once: true });
const nsPoll = setInterval(() => { if (scan()) clearInterval(nsPoll); }, 250);
setTimeout(() => {
  clearInterval(nsPoll);
  if (!NX.ns) { cleanup(); console.warn('[nexus] no se encontró el namespace del juego'); }
}, 60000);

// ---- core/features.js
// Red de seguridad. Cada módulo declara qué piezas del juego necesita. Si no
// aparecen, si su arranque falla o si falla seguido al dibujar, solo ese
// módulo se apaga y el juego sigue como si el mod no existiera.
const FEATS = new Map(); // key -> { key, label, status: pending|ok|missing|broken, err }
const trips = new Map();
let failNoticeT = 0;

NX.featureList = () => [...FEATS.values()].map((f) => ({ ...f }));
NX.enabled = (key) => NX.store.get('on:' + key, true) !== false;
NX.setEnabled = (key, on) => NX.store.set('on:' + key, !!on);
NX.isOn = (key) => {
  const f = FEATS.get(key);
  return !!f && f.status !== 'broken' && f.status !== 'missing' && NX.enabled(key);
};

function fail(key, err, kind = 'broken') {
  const f = FEATS.get(key);
  if (!f || f.status === 'broken' || f.status === 'missing') return;
  f.status = kind;
  f.err = String((err && err.message) || err || '').slice(0, 200);
  console.warn('[nexus] módulo apagado: ' + f.label, err || '');
  clearTimeout(failNoticeT);
  failNoticeT = setTimeout(() => {
    const off = [...FEATS.values()].filter((x) => x.status === 'broken' || x.status === 'missing').length;
    if (off) NX.toast(`Nexus apagó ${off} módulo${off > 1 ? 's' : ''} · el juego cambió · Alt+N para ver`);
  }, 2500);
}
NX.fail = fail;

// Errores al dibujar: algunos se toleran, 20 en 10 segundos apagan el módulo.
NX.trip = (key, err) => {
  const now = performance.now();
  const t = trips.get(key) || { n: 0, t: now };
  if (now - t.t > 10000) { t.n = 0; t.t = now; }
  t.n++;
  trips.set(key, t);
  if (t.n === 1) console.warn('[nexus] ' + key, err);
  if (t.n >= 20) fail(key, err);
};

// def: { key, label, needs(ns) -> bool, setup(ns) }. Sin needs, arranca de una vez.
NX.feature = (def) => {
  const f = { key: def.key, label: def.label, status: 'pending', err: '' };
  FEATS.set(def.key, f);
  const start = (ns) => {
    const t0 = Date.now();
    const tick = () => {
      let ok = false;
      try { ok = !def.needs || !!def.needs(ns); } catch (_) { ok = false; }
      if (ok) {
        try {
          def.setup(ns);
          if (f.status === 'pending') f.status = 'ok';
        } catch (err) { fail(def.key, err); }
        return;
      }
      const waited = Date.now() - t0;
      if ((waited > 20000 && ns && ns.Game && ns.MenuUI) || waited > 60000) {
        fail(def.key, 'No aparecieron las piezas del juego que necesita', 'missing');
        return;
      }
      setTimeout(tick, 100);
    };
    tick();
  };
  if (def.early) start(null);
  else NX.onNS(start);
};

// ---- core/keys.js
// Atajos de teclado. El listener va en fase de captura sobre window y se
// registra antes que los del juego, así que puede quedarse con una tecla.
const binds = [];
NX.keys = {
  // test(e) -> bool; fn(e). Si fn devuelve true, la tecla no llega al juego.
  bind(test, fn) { binds.push([test, fn]); },
};
NX.typing = (el) => !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
window.addEventListener('keydown', (e) => {
  if (NX.typing(e.target)) return;
  for (const [test, fn] of binds) {
    let hit = false;
    try { hit = test(e); } catch (_) { hit = false; }
    if (!hit) continue;
    let swallow = false;
    try { swallow = fn(e) === true; } catch (err) { console.warn('[nexus]', err); }
    if (swallow) {
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }
  }
}, true);

// ---- core/hud.js
// Capa de dibujo. El juego pinta su HUD con HUD.draw(ctx, w, h, player) en
// píxeles CSS, después del mundo. Envolverla permite dibujar sobre el mundo
// pero debajo del HUD (under) o encima de todo (over).
NX.hudLayers = []; // { key, under?(ctx, w, h, pl), over?(ctx, w, h, pl) }

function drawLayers(which, ctx, args) {
  for (const L of NX.hudLayers) {
    if (!L[which] || !NX.isOn(L.key)) continue;
    ctx.save();
    try { L[which](ctx, args[1], args[2], args[3]); } catch (err) { NX.trip(L.key, err); }
    ctx.restore();
  }
}

NX.feature({
  key: 'hud',
  label: 'Capa de dibujo',
  needs: (ns) => ns.HUD && typeof ns.HUD.draw === 'function',
  setup(ns) {
    const orig = ns.HUD.draw;
    ns.HUD.draw = function (ctx) {
      drawLayers('under', ctx, arguments);
      const r = orig.apply(this, arguments);
      drawLayers('over', ctx, arguments);
      return r;
    };
  },
});

// Paso de mundo a pantalla, en píxeles CSS.
NX.toScreen = (x, y) => {
  const C = NX.ns.Camera;
  return [(x - C.left()) * C.scale, (y - C.top()) * C.scale];
};

// ---- core/settings.js
// Panel de ajustes: Alt+N en cualquier momento, o el botón flotante del menú.
const sections = []; // { key, title, render(el) }
NX.settings = { section(s) { sections.push(s); } };

// Controles reutilizables. Cada uno lee y guarda su valor en NX.store.
NX.ui = {
  toggle(label, key, def, onChange) {
    const row = document.createElement('label');
    row.className = 'nx-row';
    row.innerHTML = `<span>${NX.esc(label)}</span><input type="checkbox">`;
    const inp = row.querySelector('input');
    inp.checked = !!NX.store.get(key, def);
    inp.addEventListener('change', () => { NX.store.set(key, inp.checked); if (onChange) onChange(inp.checked); });
    return row;
  },
  range(label, key, min, max, step, def, fmt, onChange) {
    const row = document.createElement('label');
    row.className = 'nx-row';
    row.innerHTML = `<span>${NX.esc(label)}</span><span class="nx-rng"><input type="range" min="${min}" max="${max}" step="${step}"><b></b></span>`;
    const inp = row.querySelector('input'), out = row.querySelector('b');
    inp.value = NX.store.get(key, def);
    out.textContent = fmt(+inp.value);
    inp.addEventListener('input', () => {
      const v = +inp.value;
      out.textContent = fmt(v);
      NX.store.set(key, v);
      if (onChange) onChange(v);
    });
    return row;
  },
  select(label, key, options, def, onChange) {
    const row = document.createElement('label');
    row.className = 'nx-row';
    row.innerHTML = `<span>${NX.esc(label)}</span><select>${options.map(([v, t]) => `<option value="${NX.esc(v)}">${NX.esc(t)}</option>`).join('')}</select>`;
    const sel = row.querySelector('select');
    sel.value = String(NX.store.get(key, def));
    sel.addEventListener('change', () => { NX.store.set(key, sel.value); if (onChange) onChange(sel.value); });
    return row;
  },
  note(text) {
    const p = document.createElement('p');
    p.className = 'nx-note';
    p.textContent = text;
    return p;
  },
};

NX.css(`#nexus-panel{position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;background:rgba(4,8,20,.55)}
#nexus-panel.hidden,#nexus-fab.hidden{display:none}
#nexus-panel .nx-box{width:min(560px,calc(100vw - 24px));max-height:calc(100vh - 40px);overflow:auto;box-sizing:border-box;padding:16px 18px;
  background:linear-gradient(#24407f,#152a5c);color:#fff;border:2px solid #f4f8ff;outline:2px solid #0b1838;border-radius:10px;
  box-shadow:inset 0 0 0 2px #5b83d6,0 6px 0 #0a1430;font:14px/1.35 var(--font,'Pixelify',system-ui,sans-serif)}
#nexus-panel h2{margin:0 0 4px;font-size:20px;color:#ffd23f;display:flex;justify-content:space-between;align-items:center}
#nexus-panel h3{margin:14px 0 6px;font-size:15px;color:#9fd0ff;display:flex;justify-content:space-between;align-items:center;gap:8px}
#nexus-panel .nx-close{background:#0b1838;color:#fff;border:2px solid #f4f8ff;border-radius:6px;font:inherit;cursor:pointer;padding:2px 10px}
#nexus-panel .nx-row{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:4px 0;cursor:pointer}
#nexus-panel .nx-rng{display:flex;align-items:center;gap:8px}#nexus-panel .nx-rng b{min-width:44px;text-align:right;color:#ffd23f}
#nexus-panel select{font:inherit;background:#0b1838;color:#fff;border:1px solid #5b83d6;border-radius:5px;padding:2px 6px}
#nexus-panel input[type=checkbox]{width:18px;height:18px;accent-color:#ffd23f}
#nexus-panel .nx-note{margin:2px 0 4px;font-size:12px;opacity:.75}
#nexus-panel .nx-st{font-size:12px;padding:1px 7px;border-radius:9px;background:#2fbf6a}
#nexus-panel .nx-st.pending{background:#5b6b88}#nexus-panel .nx-st.missing{background:#d98a1f}#nexus-panel .nx-st.broken{background:#d8344a}
#nexus-panel .nx-status{margin-top:14px;font-size:12px;opacity:.85}
#nexus-fab{position:fixed;left:12px;bottom:12px;z-index:9999;padding:6px 12px;border-radius:8px;cursor:pointer;
  background:#152a5c;color:#ffd23f;border:2px solid #f4f8ff;outline:2px solid #0b1838;font:13px var(--font,'Pixelify',system-ui,sans-serif)}`);

let panel = null, fab = null;
const STATUS_TXT = { ok: 'activo', pending: 'esperando', missing: 'falta', broken: 'roto' };

function renderPanel() {
  const box = panel.querySelector('.nx-box');
  box.innerHTML = `<h2>PokeSurvivor Nexus <button class="nx-close" type="button">Cerrar</button></h2>
    <p class="nx-note">v${NX.esc(NX.version)} · Alt+N abre y cierra este panel</p>`;
  box.querySelector('.nx-close').addEventListener('click', togglePanel);
  const feats = new Map(NX.featureList().map((f) => [f.key, f]));
  for (const s of sections) {
    const f = feats.get(s.key);
    const h = document.createElement('h3');
    h.innerHTML = `<span>${NX.esc(s.title)}</span>`;
    if (f) {
      const st = document.createElement('span');
      st.className = 'nx-st ' + f.status;
      st.textContent = STATUS_TXT[f.status] || f.status;
      if (f.err) st.title = f.err;
      h.appendChild(st);
    }
    box.appendChild(h);
    const wrap = document.createElement('div');
    if (f && (f.status === 'broken' || f.status === 'missing')) {
      wrap.appendChild(NX.ui.note('Apagado por la red de seguridad: ' + (f.err || 'el juego cambió') + '.'));
    } else {
      try { s.render(wrap); } catch (err) { wrap.appendChild(NX.ui.note('No se pudo mostrar: ' + err.message)); }
    }
    box.appendChild(wrap);
  }
  const core = NX.featureList().filter((f) => !sections.some((s) => s.key === f.key));
  const st = document.createElement('div');
  st.className = 'nx-status';
  st.textContent = 'Núcleo: ' + (NX.ns ? 'enganchado al juego' : 'sin enganchar') + ' · ' +
    core.map((f) => `${f.label} ${STATUS_TXT[f.status] || f.status}`).join(' · ');
  box.appendChild(st);
}

function togglePanel() {
  if (!panel) return;
  const open = panel.classList.contains('hidden');
  if (open) renderPanel();
  panel.classList.toggle('hidden', !open);
}
NX.togglePanel = togglePanel;

NX.onReady(() => {
  panel = document.createElement('div');
  panel.id = 'nexus-panel';
  panel.className = 'hidden';
  panel.innerHTML = '<div class="nx-box"></div>';
  // Que los clics y teclas del panel no lleguen al juego.
  for (const ev of ['pointerdown', 'mousedown', 'touchstart', 'click', 'wheel']) panel.addEventListener(ev, (e) => e.stopPropagation());
  panel.addEventListener('keydown', (e) => { if (e.key !== 'Escape') e.stopPropagation(); });
  panel.addEventListener('click', (e) => { if (e.target === panel) togglePanel(); });
  document.body.appendChild(panel);

  fab = document.createElement('button');
  fab.id = 'nexus-fab';
  fab.type = 'button';
  fab.className = 'hidden';
  fab.textContent = 'Nexus';
  fab.title = 'Ajustes de PokeSurvivor Nexus (Alt+N)';
  fab.addEventListener('click', (e) => { e.stopPropagation(); togglePanel(); });
  document.body.appendChild(fab);
  // El botón solo se ve en el menú principal.
  setInterval(() => {
    const st = NX.ns && NX.ns.Game && NX.ns.Game.state;
    fab.classList.toggle('hidden', !(st === 'ui' && NX.shown('scr-menu')));
  }, 500);
});

NX.keys.bind((e) => e.altKey && e.code === 'KeyN', () => { togglePanel(); return true; });
NX.keys.bind((e) => e.key === 'Escape' && panel && !panel.classList.contains('hidden'), () => { togglePanel(); return true; });

// ---- features/sharpness.js
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
  const fpsCap = () => (NX.isOn(KEY) ? +NX.store.get('fps', 0) || 0 : 0);

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

// ---- features/fov.js
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

// ---- features/minimap.js
// Minimapa flotante. Todo se lee de los módulos del juego en cada cuadro:
// World para el terreno, EnemyMgr / Pickups / Rift / Events para marcadores
// y Coop para los aliados. Basado en el enfoque de PokeSurvivor Plus (MIT).
(() => {
  const KEY = 'minimap';
  const SIZE_MIN = 120, SIZE_MAX = 480;
  // Radio en unidades del mundo. El juego guarda pocos trozos de mapa en
  // memoria; leer terreno más lejos lo obliga a reconstruirlos sin parar.
  const RANGE = 1200;
  const CELL = 32, SAMPLE_BUDGET = 1200;
  const LIQUID = { water: '#3f86d8', lava: '#ff6a2b', ice: '#bfe8ff', poison: '#a35ad8', swamp: '#5e8a4a' };
  const LAYERS = [
    ['terrain', 'Terreno'], ['view', 'Área visible'], ['enemies', 'Enemigos'], ['bosses', 'Jefes y legendarios'],
    ['shinies', 'Shinies'], ['golden', 'Dorados y ladrones'], ['chests', 'Cofres'], ['altars', 'Altares'],
    ['springs', 'Charcos curativos'], ['items', 'Objetos'], ['rift', 'Grietas'], ['events', 'Eventos'], ['mates', 'Aliados'],
  ];
  const layer = (k) => NX.store.get('map:' + k, true) !== false;

  let el = null, cv = null, g = null, size = 0, lastDraw = 0;
  let props = [], lastPropScan = 0;
  const terrain = new Map();
  let terrainSig = '', runPlayer = null, runId = 0;

  NX.css(`#nexus-map{position:fixed;z-index:9998;padding:5px;background:linear-gradient(#2c519f,#1a3170);border:2px solid #f4f8ff;
  outline:2px solid #0b1838;border-radius:8px;box-shadow:inset 0 0 0 2px #5b83d6,0 4px 0 #0a1430;cursor:move;touch-action:none;user-select:none}
#nexus-map.hidden{display:none}
#nexus-map canvas{display:block;border-radius:4px;background:#41604f}
#nexus-map i{position:absolute;right:-5px;bottom:-5px;width:14px;height:14px;cursor:nwse-resize;opacity:0;transition:opacity .15s}
#nexus-map:hover i{opacity:1}
#nexus-map i::after{content:'';position:absolute;inset:3px;border:0 solid #ffd23f;border-right-width:3px;border-bottom-width:3px}`);

  function setSize(n) {
    size = Math.round(NX.clamp(+n || 180, SIZE_MIN, SIZE_MAX));
    const dpr = NX.clamp(NX.realDpr(), 1, 3);
    cv.style.width = cv.style.height = size + 'px';
    cv.width = cv.height = Math.round(size * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    lastDraw = 0;
  }

  function place(x, y) {
    const w = el.offsetWidth || size + 14, h = el.offsetHeight || size + 14;
    x = NX.clamp(x, 0, Math.max(0, innerWidth - w));
    y = NX.clamp(y, 0, Math.max(0, innerHeight - h));
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    return [x, y];
  }

  function build() {
    el = document.createElement('div');
    el.id = 'nexus-map';
    el.className = 'hidden';
    el.title = 'Arrastra para mover · esquina para redimensionar · Alt+M para ocultar';
    el.innerHTML = '<canvas></canvas><i></i>';
    document.body.appendChild(el);
    cv = el.querySelector('canvas');
    g = cv.getContext('2d');
    setSize(NX.store.get('mapSize', 180));
    const pos = NX.store.get('mapPos', null);
    if (pos) place(pos[0], pos[1]);
    else place(innerWidth - size - 26, 70);
    addEventListener('resize', () => { const r = el.getBoundingClientRect(); place(r.left, r.top); });
    for (const ev of ['pointerdown', 'mousedown', 'touchstart']) el.addEventListener(ev, (e) => e.stopPropagation());

    // Arrastrar para mover.
    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.target.tagName === 'I') return;
      const r = el.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
      el.setPointerCapture(e.pointerId);
      const move = (ev) => place(ev.clientX - dx, ev.clientY - dy);
      const up = () => {
        el.removeEventListener('pointermove', move);
        el.removeEventListener('pointerup', up);
        const q = el.getBoundingClientRect();
        NX.store.set('mapPos', [Math.round(q.left), Math.round(q.top)]);
      };
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up);
    });
    // Esquina para redimensionar.
    const corner = el.querySelector('i');
    corner.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      corner.setPointerCapture(e.pointerId);
      const move = (ev) => setSize(Math.max(ev.clientX - r.left, ev.clientY - r.top) - 14);
      const up = () => {
        corner.removeEventListener('pointermove', move);
        corner.removeEventListener('pointerup', up);
        NX.store.set('mapSize', size);
      };
      corner.addEventListener('pointermove', move);
      corner.addEventListener('pointerup', up);
    });
    requestAnimationFrame(loop);
  }

  function loop(now) {
    requestAnimationFrame(loop);
    const visible = NX.isOn(KEY) && NX.store.get('mapShown', true) && NX.inRun() && !NX.shown('scr-settings');
    el.classList.toggle('hidden', !visible);
    if (!visible || now - lastDraw < 60) return;
    lastDraw = now;
    try { draw(); } catch (err) { NX.trip(KEY, err); }
  }

  function terrainColor(W, x, y) {
    const k = W.kindAt(x, y);
    if (k === 'wall') return '#16241c';
    if (k === 'liquid') return LIQUID[W.liquidKind ? W.liquidKind(x, y) : ''] || '#4fb4ff';
    return null;
  }

  function draw() {
    const ns = NX.ns, p = NX.me();
    if (!p) return;
    if (p !== runPlayer) { runPlayer = p; runId++; }
    const H = size / 2, s = H / RANGE, cx = p.x, cy = p.y;
    const toX = (x) => H + (x - cx) * s;
    const toY = (y) => H + (y - cy) * s;
    const inside = (x, y) => Math.abs(x - cx) <= RANGE && Math.abs(y - cy) <= RANGE;
    // Proyección al borde para marcadores importantes fuera de rango.
    const edge = (x, y) => {
      const dx = x - cx, dy = y - cy, m = Math.max(Math.abs(dx), Math.abs(dy)) || 1;
      const k = Math.min(1, (RANGE - 6 / s) / m);
      return [H + dx * k * s, H + dy * k * s];
    };
    const dot = (x, y, r, fill, ring) => {
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fillStyle = fill;
      g.fill();
      if (ring) { g.lineWidth = 1.5; g.strokeStyle = ring; g.stroke(); }
    };

    g.clearRect(0, 0, size, size);
    g.fillStyle = layer('terrain') ? '#41604f' : '#26394a';
    g.fillRect(0, 0, size, size);

    // Terreno: World.kindAt es caro, así que se cachea por celda y se
    // completa con un presupuesto fijo de muestras por cuadro.
    const W = ns.World;
    if (layer('terrain') && W && W.kindAt) {
      const sig = `${runId}|${String(W.biome)}|${W.arena ? 1 : 0}`;
      if (sig !== terrainSig) { terrain.clear(); terrainSig = sig; }
      const c0x = Math.floor((cx - RANGE) / CELL), c1x = Math.floor((cx + RANGE) / CELL);
      const c0y = Math.floor((cy - RANGE) / CELL), c1y = Math.floor((cy + RANGE) / CELL);
      const px = Math.ceil(CELL * s) + 0.5;
      let budget = SAMPLE_BUDGET;
      for (let j = c0y; j <= c1y; j++) {
        for (let i = c0x; i <= c1x; i++) {
          const key = i + ',' + j;
          let col = terrain.get(key);
          if (col === undefined) {
            if (budget-- <= 0) continue;
            col = terrainColor(W, i * CELL + CELL / 2, j * CELL + CELL / 2);
            terrain.set(key, col);
          }
          if (col) { g.fillStyle = col; g.fillRect(toX(i * CELL), toY(j * CELL), px, px); }
        }
      }
      if (terrain.size > 60000) terrain.clear();
    }

    const C = ns.Camera;
    if (layer('view') && C && C.left) {
      g.strokeStyle = '#ffffff';
      g.lineWidth = 1;
      g.strokeRect(toX(C.left()) + 0.5, toY(C.top()) + 0.5, C.w * s, C.h * s);
    }

    // Objetos que vale la pena buscar (la experiencia y las monedas serían ruido).
    if (layer('items') && ns.Pickups && ns.Pickups.all) {
      const KIND = ns.Pickups.KIND || {};
      for (const q of ns.Pickups.all()) {
        if (q.kind === 'xp' || q.kind === 'xpBig' || q.kind === 'coin' || !inside(q.x, q.y)) continue;
        const x = toX(q.x), y = toY(q.y);
        g.fillStyle = '#0b1838';
        g.fillRect(x - 3, y - 3, 6, 6);
        g.fillStyle = (KIND[q.kind] && KIND[q.kind].color) || '#ffd23f';
        g.fillRect(x - 2, y - 2, 4, 4);
      }
    }

    // Cofres, altares y charcos: se escanean dos veces por segundo.
    const now = performance.now();
    if (W && now - lastPropScan > 500) {
      lastPropScan = now;
      props = [];
      if (W.propsInCircle) for (const q of W.propsInCircle(cx, cy, RANGE) || []) if (q.type === 'chest') props.push(q);
      if (W.specialsNear) for (const q of W.specialsNear(cx, cy, RANGE) || []) if (q.type === 'bigchest' || q.type === 'altar' || q.type === 'spring') props.push(q);
    }
    for (const q of props) {
      if (!inside(q.x, q.y)) continue;
      const x = toX(q.x), y = toY(q.y);
      if (q.type === 'spring') {
        if (!layer('springs')) continue;
        g.save();
        g.globalAlpha = (q.charge == null ? 1 : q.charge) >= 0.15 ? 1 : 0.4;
        dot(x, y, 5, '#2fbf6a', '#ffffff');
        g.fillStyle = '#ffffff';
        g.fillRect(x - 1, y - 3, 2, 6);
        g.fillRect(x - 3, y - 1, 6, 2);
        g.restore();
        continue;
      }
      if (q.used || q.open || q.hp <= 0) continue;
      if (q.type === 'altar') {
        if (!layer('altars')) continue;
        g.save();
        g.translate(x, y);
        g.rotate(Math.PI / 4);
        g.fillStyle = '#7fe0ff';
        g.strokeStyle = '#0b1838';
        g.lineWidth = 1.5;
        g.fillRect(-3, -3, 6, 6);
        g.strokeRect(-3, -3, 6, 6);
        g.restore();
        continue;
      }
      if (!layer('chests')) continue;
      const h = q.type === 'bigchest' ? 4.5 : 3;
      g.fillStyle = '#0b1838';
      g.fillRect(x - h - 1, y - h - 1, 2 * h + 2, 2 * h + 2);
      g.fillStyle = q.type === 'bigchest' ? '#ffd23f' : '#c98a3c';
      g.fillRect(x - h, y - h, 2 * h, 2 * h);
    }

    // Enemigos comunes como puntos rojos. Los especiales van más grandes y
    // se fijan al borde cuando están fuera de rango.
    const special = [];
    if (ns.EnemyMgr && ns.EnemyMgr.all) {
      g.fillStyle = '#ff5f6d';
      for (const e of ns.EnemyMgr.all()) {
        if (e.dead) continue;
        if (e.boss || e.legend || e.judge || e.shiny || e.golden || e.behavior === 'thief') {
          const l = e.boss || e.legend || e.judge ? 'bosses' : e.shiny ? 'shinies' : 'golden';
          if (layer(l)) special.push(e);
          continue;
        }
        if (layer('enemies') && inside(e.x, e.y)) g.fillRect(toX(e.x) - 1, toY(e.y) - 1, 2.5, 2.5);
      }
    }
    const pulse = 5 + 3 * Math.sin(now / 160);
    for (const e of special) {
      const [x, y] = edge(e.x, e.y);
      if (e.shiny || e.golden) {
        g.beginPath();
        g.arc(x, y, pulse + 3, 0, Math.PI * 2);
        g.lineWidth = 1.5;
        g.strokeStyle = e.shiny ? '#7fe0ff' : '#ffd23f';
        g.stroke();
      }
      if (e.boss || e.legend || e.judge) dot(x, y, 5, e.legend || e.judge ? '#c47bff' : '#ff3048', '#ffffff');
      else if (e.shiny) dot(x, y, 4, '#7fe0ff', '#ffffff');
      else dot(x, y, 3.5, '#ffd23f', '#0b1838');
    }

    const rift = ns.Rift && ns.Rift.rift;
    if (layer('rift') && rift && typeof rift.x === 'number') {
      const [x, y] = edge(rift.x, rift.y);
      g.lineWidth = 2.5;
      g.strokeStyle = '#c47bff';
      g.beginPath();
      g.arc(x, y, 5, 0, Math.PI * 2);
      g.stroke();
    }
    const ev = ns.Events && ns.Events.current;
    if (layer('events') && ev && typeof ev.x === 'number') {
      const [x, y] = edge(ev.x, ev.y);
      g.save();
      g.translate(x, y);
      g.rotate(Math.PI / 4);
      g.fillStyle = '#ffd23f';
      g.strokeStyle = '#0b1838';
      g.lineWidth = 1.5;
      g.fillRect(-4, -4, 8, 8);
      g.strokeRect(-4, -4, 8, 8);
      g.restore();
    }

    if (layer('mates') && ns.Coop && ns.Coop.active && ns.Coop.players) {
      for (const m of ns.Coop.players()) {
        if (m === p) continue;
        const [x, y] = edge(m.x, m.y);
        const down = m.dead || (m.net && m.net.dead);
        if (down) {
          g.beginPath();
          g.arc(x, y, pulse + 4, 0, Math.PI * 2);
          g.lineWidth = 2;
          g.strokeStyle = '#ff5f6d';
          g.stroke();
        }
        dot(x, y, 4.5, down ? '#5b6b88' : m.tagColor || '#5fc8ff', '#0b1838');
      }
    }

    // Tú, como una flecha que apunta hacia donde caminas.
    g.save();
    g.translate(H, H);
    g.rotate(typeof p.moveAngle === 'number' ? p.moveAngle : -Math.PI / 2);
    g.beginPath();
    g.moveTo(7, 0); g.lineTo(-5, -5); g.lineTo(-2, 0); g.lineTo(-5, 5); g.closePath();
    g.fillStyle = '#ffffff';
    g.fill();
    g.lineWidth = 1.5;
    g.strokeStyle = p.tagColor || '#ffd23f';
    g.stroke();
    g.restore();
  }

  NX.feature({
    key: KEY,
    label: 'Minimapa',
    needs: (ns) => ns.World && ns.World.kindAt && ns.EnemyMgr && ns.EnemyMgr.all && ns.Pickups && ns.Pickups.all && ns.Camera && ns.Camera.left,
    setup() { NX.onReady(build); },
  });

  NX.keys.bind((e) => e.code === 'KeyM' && e.altKey && !e.ctrlKey && !e.metaKey && NX.isOn(KEY) && NX.inRun(), () => {
    const on = !NX.store.get('mapShown', true);
    NX.store.set('mapShown', on);
    NX.toast(on ? 'Minimapa visible' : 'Minimapa oculto');
    return true;
  });

  NX.settings.section({
    key: KEY,
    title: 'Minimapa',
    render(box) {
      box.appendChild(NX.ui.toggle('Activado', 'on:' + KEY, true));
      box.appendChild(NX.ui.toggle('Visible en partida (Alt+M)', 'mapShown', true));
      box.appendChild(NX.ui.range('Tamaño', 'mapSize', SIZE_MIN, SIZE_MAX, 10, 180, (v) => v + ' px', (v) => { if (cv) setSize(v); }));
      for (const [k, label] of LAYERS) box.appendChild(NX.ui.toggle(label, 'map:' + k, true));
      const reset = document.createElement('button');
      reset.type = 'button';
      reset.className = 'nx-close';
      reset.textContent = 'Devolver a la esquina';
      reset.addEventListener('click', () => { NX.store.set('mapPos', null); if (el) place(innerWidth - size - 26, 70); });
      box.appendChild(reset);
    },
  });
})();

// ---- features/shortcuts.js
// Atajos extra. El juego ya trae 1/2/3 y R al subir de nivel y 1/2 en
// objetos. Aquí se cubren las pantallas que no tienen: el vínculo (1 a 9 y
// Retroceso para "Atrás") y el fin de partida (Enter).
// Como respaldo seguro, la tecla se deja pasar primero al juego y solo se
// actúa si la pantalla sigue igual en el siguiente tick, así nunca se elige
// dos veces aunque una versión futura del juego agregue sus propios atajos.
(() => {
  const KEY = 'shortcuts';
  const visibleCards = (boxId) => {
    const box = document.getElementById(boxId);
    if (!box || box.classList.contains('done')) return [];
    return [...box.querySelectorAll('.card')].filter((c) => c.offsetParent !== null && !c.classList.contains('disabled'));
  };
  const later = (screenId, fn) => {
    const before = document.getElementById(screenId);
    const sig = before ? before.innerHTML.length : -1;
    setTimeout(() => {
      const now = document.getElementById(screenId);
      if (NX.shown(screenId) && now && now.innerHTML.length === sig) fn();
    }, 0);
  };

  NX.feature({
    key: KEY,
    label: 'Atajos extra',
    setup() {
      NX.keys.bind((e) => NX.isOn(KEY) && !e.altKey && !e.ctrlKey && /^Digit[1-9]$/.test(e.code) && NX.shown('scr-bond'), (e) => {
        const n = +e.code.slice(5) - 1;
        later('scr-bond', () => { const c = visibleCards('bond-cards')[n]; if (c) c.click(); });
      });
      NX.keys.bind((e) => NX.isOn(KEY) && e.key === 'Backspace' && NX.shown('scr-bond'), () => {
        later('scr-bond', () => { const b = document.getElementById('bond-back'); if (b && !b.classList.contains('hidden')) b.click(); });
      });
      NX.keys.bind((e) => NX.isOn(KEY) && e.key === 'Enter' && NX.shown('scr-over'), () => {
        const a = document.activeElement;
        if (a && a.tagName === 'BUTTON' && document.getElementById('scr-over').contains(a)) return; // Enter nativo
        later('scr-over', () => { const b = document.getElementById('btn-again'); if (b) b.click(); });
      });
      NX.css('#scr-bond .card{position:relative}#scr-bond .nx-kbd{position:absolute;right:6px;top:4px;font-size:11px;opacity:.7;padding:0 5px;border:1px solid currentColor;border-radius:4px}');
      // Etiqueta 1, 2, 3... en las cartas de vínculo para que el atajo se descubra solo.
      setInterval(() => {
        if (!NX.isOn(KEY) || !NX.shown('scr-bond')) return;
        visibleCards('bond-cards').forEach((c, i) => {
          if (i < 9 && !c.querySelector('.nx-kbd')) c.insertAdjacentHTML('beforeend', `<span class="nx-kbd">${i + 1}</span>`);
        });
      }, 200);
    },
  });

  NX.settings.section({
    key: KEY,
    title: 'Atajos extra',
    render(el) {
      el.appendChild(NX.ui.toggle('Activado', 'on:' + KEY, true));
      el.appendChild(NX.ui.note('Vínculo: 1 a 9 para elegir y Retroceso para volver. Fin de partida: Enter para continuar.'));
    },
  });
})();

// ---- features/combat.js
// Indicadores de combate: radio del imán, viñeta roja con vida baja y cuenta
// regresiva al próximo jefe o al Juicio.
(() => {
  const KEY = 'combat';
  const PLAYING = new Set(['playing', 'held', 'levelup', 'choice']);
  const fmt = (s) => { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

  NX.css(`#nexus-lowhp{position:fixed;inset:0;z-index:9990;pointer-events:none;opacity:0;transition:opacity .25s;
  box-shadow:inset 0 0 22vmin 5vmin rgba(205,15,35,.6),inset 0 0 6vmin 1vmin rgba(160,5,25,.5)}
#nexus-lowhp.on{animation:nxLowHp 1.6s ease-in-out infinite}
@keyframes nxLowHp{0%,100%{filter:brightness(.85)}50%{filter:brightness(1.25)}}
@media (prefers-reduced-motion:reduce){#nexus-lowhp.on{animation:none}}
#nexus-boss{position:fixed;left:50%;top:52px;transform:translateX(-50%);z-index:9991;pointer-events:none;padding:3px 12px;border-radius:12px;
  background:rgba(12,20,44,.82);color:#fff;border:2px solid #ff5f6d;font:13px/1.3 var(--font,'Pixelify',system-ui,sans-serif);white-space:nowrap}
#nexus-boss.judge{border-color:#c47bff}#nexus-boss.soon{color:#ffd23f}#nexus-boss.hidden{display:none}`);

  // Siguiente jefe o Juicio según el reloj de la partida.
  function nextThreat(ns) {
    const t = ns.Game.st && ns.Game.st.time;
    if (typeof t !== 'number') return null;
    let best = null;
    const B = ns.Enemies && ns.Enemies.BOSSES;
    if (Array.isArray(B)) for (const b of B) if (b && typeof b.at === 'number' && b.at > t && (!best || b.at < best.at)) best = { at: b.at, judge: false };
    const J = ns.Judgment && ns.Judgment.AT;
    if (typeof J === 'number' && J > t && J < 1e8 && (!best || J < best.at)) best = { at: J, judge: true };
    return best && { in: best.at - t, judge: best.judge };
  }

  NX.feature({
    key: KEY,
    label: 'Indicadores de combate',
    needs: (ns) => ns.Game && ns.Camera && ns.Camera.left && 'scale' in ns.Camera,
    setup(ns) {
      // Radio del imán, debajo del HUD.
      NX.hudLayers.push({
        key: KEY,
        under(ctx) {
          if (!NX.store.get('magnet', true) || ns.Game.state !== 'playing') return;
          const p = NX.me();
          if (!p || p.dead || !(p.magnet > 0)) return;
          const [x, y] = NX.toScreen(p.x, p.y);
          ctx.beginPath();
          ctx.arc(x, y, p.magnet * ns.Camera.scale, 0, Math.PI * 2);
          ctx.setLineDash([6, 6]);
          ctx.lineWidth = 1.5;
          ctx.strokeStyle = 'rgba(127,224,255,.45)';
          ctx.stroke();
        },
      });

      NX.onReady(() => {
        const glow = document.createElement('div');
        glow.id = 'nexus-lowhp';
        document.body.appendChild(glow);
        const pill = document.createElement('div');
        pill.id = 'nexus-boss';
        pill.className = 'hidden';
        document.body.appendChild(pill);
        let last = 0;
        const loop = (now) => {
          requestAnimationFrame(loop);
          if (now - last < 100) return;
          last = now;
          try {
            const on = NX.isOn(KEY), p = NX.me(), st = ns.Game.state;
            const live = on && p && PLAYING.has(st) && !p.dead;
            // Viñeta con vida baja.
            let o = 0;
            const lim = (+NX.store.get('lowhp', 25) || 0) / 100;
            if (live && lim > 0 && p.maxHp > 0) {
              const f = Math.max(0, p.hp) / p.maxHp;
              if (f < lim) o = 0.7 + 0.3 * (1 - f / lim);
            }
            glow.style.opacity = o ? o.toFixed(2) : '0';
            glow.classList.toggle('on', o > 0);
            // Cuenta regresiva.
            const th = live && NX.store.get('bossTimer', true) ? nextThreat(ns) : null;
            pill.classList.toggle('hidden', !th);
            if (th) {
              pill.textContent = (th.judge ? 'Juicio en ' : 'Jefe en ') + fmt(th.in);
              pill.classList.toggle('judge', th.judge);
              pill.classList.toggle('soon', th.in <= 20);
            }
          } catch (err) { NX.trip(KEY, err); }
        };
        requestAnimationFrame(loop);
      });
    },
  });

  NX.settings.section({
    key: KEY,
    title: 'Indicadores de combate',
    render(el) {
      el.appendChild(NX.ui.toggle('Activado', 'on:' + KEY, true));
      el.appendChild(NX.ui.toggle('Radio del imán de experiencia', 'magnet', true));
      el.appendChild(NX.ui.toggle('Cuenta regresiva al próximo jefe', 'bossTimer', true));
      el.appendChild(NX.ui.range('Alerta de vida baja', 'lowhp', 0, 50, 5, 25, (v) => (v ? v + ' %' : 'apagada')));
    },
  });
})();
})();
