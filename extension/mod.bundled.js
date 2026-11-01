/*! PokeSurvivor Nexus v0.3.0 */
(() => {
'use strict';
if (window.__nexus) return;
// El sitio público bloquea las extensiones a propósito. Nexus solo corre en el
// laboratorio local, así que aquí se queda inactivo.
if (location.hostname === 'pokesurvivor.com' || location.hostname.endsWith('.pokesurvivor.com')) { console.info('[nexus] inactivo en el sitio público; usa el laboratorio local'); return; }
const NX = { version: '0.3.0' };
window.__nexus = {
  version: '0.3.0',
  status: () => NX.featureList(),
  ns: () => NX.ns,
};

// ---- core/store.js
// Ajustes persistentes en localStorage, con el prefijo nexus:. Los valores se
// cachean en memoria porque varios módulos consultan ajustes en cada cuadro.
const storeCache = new Map();
NX.store = {
  get(key, def) {
    if (storeCache.has(key)) { const v = storeCache.get(key); return v == null ? def : v; }
    let v = null;
    try {
      const raw = localStorage.getItem('nexus:' + key);
      v = raw == null ? null : JSON.parse(raw);
    } catch (_) { v = null; }
    storeCache.set(key, v);
    return v == null ? def : v;
  },
  set(key, value) {
    storeCache.set(key, value == null ? null : value);
    try { localStorage.setItem('nexus:' + key, JSON.stringify(value)); } catch (_) { /* almacenamiento lleno o bloqueado */ }
  },
  // Para el respaldo: olvida la caché tras importar datos externos.
  reset() { storeCache.clear(); },
};
// Otra pestaña del juego cambió un ajuste.
addEventListener('storage', (e) => { if (e.key && e.key.startsWith('nexus:')) storeCache.delete(e.key.slice(6)); });

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

NX.fmtTime = (s) => { s = Math.max(0, Math.floor(s || 0)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

// Datos que el cascarón inyecta antes del mod (por ejemplo, SurvivorTiers).
// Solo existen en modo scripts de usuario; en modo empaquetado queda vacío.
NX.data = (window.__nexusData && typeof window.__nexusData === 'object') ? window.__nexusData : {};

// Descarga un archivo generado en la página.
NX.download = (name, data, type = 'application/octet-stream') => {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
};

// Hace arrastrable un elemento fixed y recuerda su posición en NX.store.
// def() devuelve { x, y } en píxeles para la primera vez.
NX.draggable = (el, key, def) => {
  const place = (x, y) => {
    const w = el.offsetWidth || 100, h = el.offsetHeight || 40;
    x = NX.clamp(x, 0, Math.max(0, innerWidth - w));
    y = NX.clamp(y, 0, Math.max(0, innerHeight - h));
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    el.style.right = el.style.bottom = 'auto';
  };
  const reset = () => { const d = def(); place(d.x, d.y); };
  const saved = NX.store.get('pos:' + key, null);
  if (saved) place(saved[0], saved[1]); else reset();
  addEventListener('resize', () => { const r = el.getBoundingClientRect(); place(r.left, r.top); });
  el.style.cursor = 'move';
  el.style.touchAction = 'none';
  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.target.closest('button,input,select,a,[data-nodrag]')) return;
    e.stopPropagation();
    const r = el.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
    el.setPointerCapture(e.pointerId);
    const move = (ev) => place(ev.clientX - dx, ev.clientY - dy);
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      const q = el.getBoundingClientRect();
      NX.store.set('pos:' + key, [Math.round(q.left), Math.round(q.top)]);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  });
  return { reset: () => { NX.store.set('pos:' + key, null); reset(); } };
};

// Ciclo de partidas: 'start' (player) cuando aparece un jugador nuevo en
// partida y 'end' (player, state) cuando la partida termina o se abandona.
NX.runs = (() => {
  const subs = { start: [], end: [] };
  let cur = null;
  const emit = (ev, ...a) => { for (const fn of subs[ev]) { try { fn(...a); } catch (err) { console.warn('[nexus] runs.' + ev, err); } } };
  setInterval(() => {
    const ns = NX.ns;
    if (!ns || !ns.Game) return;
    const p = NX.me(), st = ns.Game.state;
    const live = !!p && st !== 'ui' && st !== 'over';
    if (live && p !== cur) { if (cur) emit('end', cur, 'replaced'); cur = p; emit('start', p); }
    else if (cur && !live) { const was = cur; cur = null; emit('end', was, st); }
  }, 250);
  return { on(ev, fn) { subs[ev].push(fn); }, current: () => cur };
})();

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
  button(label, onClick) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'nx-btn';
    b.textContent = label;
    b.addEventListener('click', onClick);
    return b;
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
#nexus-panel .nx-search{width:100%;box-sizing:border-box;margin:6px 0;font:inherit;background:#0b1838;color:#fff;border:1px solid #5b83d6;border-radius:6px;padding:5px 8px}
#nexus-panel .nx-tabs{display:flex;flex-wrap:wrap;gap:5px;margin:4px 0 2px}
#nexus-panel .nx-tabs button{font:inherit;font-size:12px;background:#0b1838;color:#cfe0ff;border:1px solid #5b83d6;border-radius:12px;padding:2px 10px;cursor:pointer}
#nexus-panel .nx-tabs button.on{background:#ffd23f;color:#0b1838;border-color:#ffd23f}
#nexus-panel .nx-btn{font:inherit;font-size:13px;background:#0b1838;color:#fff;border:2px solid #f4f8ff;border-radius:6px;cursor:pointer;padding:3px 10px;margin:4px 6px 4px 0}
#nexus-fab{position:fixed;left:12px;bottom:12px;z-index:9999;padding:6px 12px;border-radius:8px;cursor:pointer;
  background:#152a5c;color:#ffd23f;border:2px solid #f4f8ff;outline:2px solid #0b1838;font:13px var(--font,'Pixelify',system-ui,sans-serif)}
#nexus-panel .nx-box{overscroll-behavior:contain;touch-action:pan-y;-webkit-overflow-scrolling:touch}
@media (pointer:coarse),(max-width:700px),(max-height:500px){
#nexus-panel{align-items:flex-start;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)}
#nexus-panel .nx-box{width:min(620px,calc(100vw - 16px));max-height:calc(100vh - 16px);max-height:calc(100dvh - 16px);margin:8px auto;padding:0 12px 12px;font-size:15px}
#nexus-panel h2{position:sticky;top:0;z-index:2;margin:0 -12px 4px;padding:8px 12px;background:#1d3470;border-bottom:2px solid #5b83d6}
#nexus-panel .nx-close{min-height:40px;min-width:76px;font-size:15px}
#nexus-panel .nx-row{min-height:44px;padding:2px 0}
#nexus-panel .nx-row>span:first-child{flex:1;min-width:0}
#nexus-panel input[type=checkbox]{width:26px;height:26px;flex:none}
#nexus-panel input[type=range]{width:min(42vw,200px);min-height:28px}
#nexus-panel select{min-height:40px;max-width:52vw;font-size:15px}
#nexus-panel .nx-search{min-height:42px;font-size:16px}
#nexus-panel .nx-tabs{flex-wrap:nowrap;overflow-x:auto;padding-bottom:4px;scrollbar-width:thin;touch-action:pan-x}
#nexus-panel .nx-tabs button{flex:none;min-height:40px;padding:4px 14px;font-size:14px;border-radius:20px}
#nexus-panel .nx-btn{min-height:40px;padding:6px 14px;font-size:14px}
#nexus-panel h3 .nx-close,#nexus-panel .nx-box button{min-height:40px}
#nexus-panel .nx-note{font-size:13px}
#nexus-fab{min-height:40px;padding:8px 16px;font-size:15px;left:calc(12px + env(safe-area-inset-left,0px));bottom:calc(12px + env(safe-area-inset-bottom,0px))}}`);

let panel = null, fab = null;
const STATUS_TXT = { ok: 'activo', pending: 'esperando', missing: 'falta', broken: 'roto' };

// Pestañas del panel, en orden. Una sección sin tab cae en "General".
const TABS = ['Cámara y mapa', 'HUD', 'Partida', 'Modos', 'Datos', 'Menús', 'Estilo', 'Rendimiento', 'General'];
const TAB_OF = { fov: 'Cámara y mapa', minimap: 'Cámara y mapa', sharp: 'Rendimiento', shortcuts: 'Partida', combat: 'Partida' };
const tabOf = (s) => s.tab || TAB_OF[s.key] || 'General';
let curTab = NX.store.get('panelTab', TABS[0]), query = '';

function renderPanel() {
  const box = panel.querySelector('.nx-box');
  const used = TABS.filter((t) => sections.some((s) => tabOf(s) === t));
  if (!used.includes(curTab)) curTab = used[0];
  box.innerHTML = `<h2>PokeSurvivor Nexus <button class="nx-close" type="button">Cerrar</button></h2>
    <p class="nx-note">v${NX.esc(NX.version)} · Alt+N abre y cierra este panel</p>
    <input class="nx-search" type="search" placeholder="Buscar ajuste…" value="${NX.esc(query)}">
    <div class="nx-tabs">${used.map((t) => `<button type="button" class="${t === curTab && !query ? 'on' : ''}">${NX.esc(t)}</button>`).join('')}</div>`;
  box.querySelector('.nx-close').addEventListener('click', togglePanel);
  box.querySelectorAll('.nx-tabs button').forEach((b) => b.addEventListener('click', () => {
    curTab = b.textContent; query = '';
    NX.store.set('panelTab', curTab);
    renderPanel();
  }));
  const search = box.querySelector('.nx-search');
  search.addEventListener('input', () => {
    query = search.value;
    renderPanel();
    const s2 = panel.querySelector('.nx-search');
    s2.focus();
    s2.setSelectionRange(s2.value.length, s2.value.length);
  });
  const q = query.trim().toLowerCase();
  const feats = new Map(NX.featureList().map((f) => [f.key, f]));
  const visible = sections.filter((s) => (q ? (s.title + ' ' + (s.keywords || '')).toLowerCase().includes(q) : tabOf(s) === curTab));
  if (!visible.length) box.appendChild(NX.ui.note('Ningún ajuste coincide con la búsqueda.'));
  for (const s of visible) {
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

// ---- features/alerts.js
// Alertas de partida: aviso en pantalla y sonido opcional cuando aparece un
// shiny, un legendario, un jefe, un dorado o ladrón, o se abre una grieta.
// Recorre EnemyMgr.all() cuatro veces por segundo; no engancha nada del juego.
// Sonidos sintetizados con WebAudio, adaptados de PokeSurvivor Plus (MIT).
(() => {
  const KEY = 'alerts';
  const KINDS = [
    // bit, clave, etiqueta en ajustes, color
    [1, 'shiny', 'Shiny', '#7fe0ff'],
    [2, 'legend', 'Legendario', '#c47bff'],
    [4, 'boss', 'Jefe', '#ff5f6d'],
    [8, 'golden', 'Dorado o ladrón', '#ffd23f'],
    [16, 'rift', 'Grieta', '#9f8bff'],
  ];
  const ARROWS = ['→', '↘', '↓', '↙', '←', '↖', '↑', '↗'];
  const kindOn = (k) => NX.store.get('alerts:' + k, true) !== false;

  let box = null, ac = null;
  const seen = new WeakMap(); // enemigo -> bits ya avisados
  const recent = new Map();   // texto -> último aviso, evita repetir en co-op
  let lastRift = null;

  NX.css(`#nexus-alerts{position:fixed;left:50%;top:84px;transform:translateX(-50%);z-index:100000;display:grid;gap:6px;justify-items:center;
  pointer-events:none;font:14px/1.25 var(--font,'Pixelify',system-ui,sans-serif)}
#nexus-alerts div{background:#0b1838;color:#fff;border:2px solid var(--c,#f4f8ff);border-radius:8px;padding:6px 12px;box-shadow:0 3px 0 #0a1430;
  font-weight:700;width:max-content;max-width:min(92vw,520px);text-align:center}
#nexus-alerts small{display:block;font-weight:600;color:#b9cbf0;font-size:12px}
@media (prefers-reduced-motion:no-preference){#nexus-alerts div{animation:nxAlertIn .18s ease-out}}
@keyframes nxAlertIn{from{transform:translateY(-8px);opacity:0}to{transform:none;opacity:1}}`);

  function show(text, sub, color) {
    if (!box) return;
    const d = document.createElement('div');
    d.style.setProperty('--c', color);
    d.innerHTML = NX.esc(text) + (sub ? `<small>${NX.esc(sub)}</small>` : '');
    box.appendChild(d);
    while (box.children.length > 4) box.firstChild.remove();
    setTimeout(() => d.remove(), 4500);
  }

  function where(p, x, y) {
    if (!p || typeof x !== 'number' || typeof y !== 'number') return '';
    const dx = x - p.x, dy = y - p.y;
    const tiles = Math.round(Math.hypot(dx, dy) / 32);
    const a = ARROWS[(Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) + 8) % 8];
    return `${a} a ${tiles} casillas`;
  }

  // ---- sonido
  function gameMuted() {
    try {
      const s = NX.ns.Audio && typeof NX.ns.Audio.settings === 'function' ? NX.ns.Audio.settings() : null;
      return !!(s && s.muted);
    } catch (_) { return false; }
  }
  function play(kind, force) {
    if (!force && (!NX.store.get('alerts:sound', true) || gameMuted())) return;
    const vol = NX.clamp(+NX.store.get('alerts:vol', 60) || 0, 0, 100) / 100;
    if (vol <= 0) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!ac) ac = new AC();
      if (ac.state === 'suspended') ac.resume();
      const out = ac.createGain();
      out.gain.value = 0.3 * vol;
      out.connect(ac.destination);
      const now = ac.currentTime + 0.02;
      const note = (t, f, len, type, g, f2) => {
        const o = ac.createOscillator(), e = ac.createGain();
        o.type = type || 'triangle';
        o.frequency.setValueAtTime(f, now + t);
        if (f2 && f2 !== f) o.frequency.exponentialRampToValueAtTime(f2, now + t + len);
        e.gain.setValueAtTime(0.0001, now + t);
        e.gain.exponentialRampToValueAtTime(g || 0.5, now + t + 0.008);
        e.gain.exponentialRampToValueAtTime(0.0001, now + t + len);
        o.connect(e).connect(out);
        o.start(now + t);
        o.stop(now + t + len + 0.02);
      };
      if (kind === 'shiny') {
        // Dos destellos de campanitas, el segundo un tono más arriba.
        const RUN = [2093, 2637, 3136, 3951, 4699];
        RUN.forEach((f, i) => { note(i * 0.035, f, 0.28, 'triangle', 0.5, f * 1.015); note(i * 0.035, f * 2.01, 0.2, 'sine', 0.15); });
        RUN.forEach((f, i) => note(0.3 + i * 0.035, f * 1.122, 0.36, 'triangle', 0.38, f * 1.14));
      } else if (kind === 'legend') {
        [392, 494, 587, 784].forEach((f, i) => note(i * 0.09, f, 0.55, 'triangle', 0.4));
        note(0, 98, 0.8, 'sine', 0.35);
      } else if (kind === 'boss') {
        note(0, 220, 0.3, 'sawtooth', 0.25, 150);
        note(0.02, 659, 0.2, 'triangle', 0.4);
        note(0.28, 196, 0.35, 'sawtooth', 0.22, 130);
      } else if (kind === 'golden') {
        [1047, 1319, 1568, 2093].forEach((f, i) => note(i * 0.05, f, 0.14, 'square', 0.16));
      } else {
        note(0, 300, 0.6, 'sine', 0.35, 1200);
        note(0.1, 600, 0.5, 'triangle', 0.2, 1800);
      }
      setTimeout(() => out.disconnect(), 1500);
    } catch (_) { /* sin sonido */ }
  }

  function fire(kind, text, sub, color) {
    const now = performance.now();
    if (now - (recent.get(text) || 0) < 15000) return;
    recent.set(text, now);
    if (recent.size > 40) recent.clear();
    show(text, sub, color);
    play(kind);
  }

  function bitsOf(e) {
    let b = 0;
    if (e.shiny) b |= 1;
    if (e.legend && !e.judge) b |= 2;
    if (e.boss && !e.legend && !e.judge) b |= 4;
    if (e.golden || e.behavior === 'thief') b |= 8;
    return b;
  }

  function scan(ns) {
    const p = NX.me();
    const list = ns.EnemyMgr.all();
    if (Array.isArray(list)) {
      for (let i = 0; i < list.length; i++) {
        const e = list[i];
        if (!e || e.dead) continue;
        const b = bitsOf(e);
        if (!b) continue;
        const prev = seen.get(e) || 0;
        const fresh = b & ~prev;
        if (!fresh) continue;
        seen.set(e, prev | b);
        const name = e.name || 'Pokémon';
        const sub = where(p, e.x, e.y);
        // Un solo aviso por enemigo, el de mayor prioridad.
        if (fresh & 1 && kindOn('shiny')) fire('shiny', `¡${name} shiny!`, sub, '#7fe0ff');
        else if (fresh & 2 && kindOn('legend')) fire('legend', `Legendario: ${name}`, sub, '#c47bff');
        else if (fresh & 4 && kindOn('boss')) fire('boss', `Jefe: ${name}`, sub, '#ff5f6d');
        else if (fresh & 8 && kindOn('golden')) fire('golden', e.behavior === 'thief' ? `Ladrón: ${name}` : `${name} dorado`, sub, '#ffd23f');
      }
    }
    // Grieta: el juego expone la activa en Rift.rift.
    const r = ns.Rift && ns.Rift.rift;
    if (r && r !== lastRift && kindOn('rift')) fire('rift', 'Se abrió una grieta', where(p, r.x, r.y), '#9f8bff');
    lastRift = r || null;
  }

  NX.feature({
    key: KEY,
    label: 'Alertas de partida',
    needs: (ns) => ns.EnemyMgr && typeof ns.EnemyMgr.all === 'function' && ns.Game,
    setup(ns) {
      NX.onReady(() => {
        box = document.createElement('div');
        box.id = 'nexus-alerts';
        box.setAttribute('role', 'status');
        document.body.appendChild(box);
      });
      NX.runs.on('start', () => { recent.clear(); lastRift = null; });
      setInterval(() => {
        if (!NX.inRun() || !NX.isOn(KEY)) return;
        try { scan(ns); } catch (err) { NX.trip(KEY, err); }
        // Los avisos van debajo del reloj, del próximo jefe y de la placa del jefe.
        if (box && box.childElementCount) {
          let top = 84;
          for (const id of ['nexus-clock', 'nexus-boss', 'nexus-bossplate']) {
            const e = document.getElementById(id);
            if (e && e.offsetParent !== null && !e.classList.contains('hidden')) top = Math.max(top, e.getBoundingClientRect().bottom + 8);
          }
          box.style.top = Math.round(top) + 'px';
        }
      }, 250);
    },
  });

  NX.settings.section({
    key: KEY,
    tab: 'Partida',
    title: 'Alertas',
    keywords: 'shiny legendario jefe dorado ladrón grieta sonido aviso',
    render(el) {
      el.appendChild(NX.ui.toggle('Activado', 'on:' + KEY, true));
      for (const [, k, label] of KINDS) el.appendChild(NX.ui.toggle('Avisar: ' + label, 'alerts:' + k, true));
      el.appendChild(NX.ui.toggle('Sonido', 'alerts:sound', true));
      el.appendChild(NX.ui.range('Volumen', 'alerts:vol', 0, 100, 5, 60, (v) => v + ' %'));
      el.appendChild(NX.ui.note('El sonido se calla si silencias el juego.'));
      const sel = NX.ui.select('Probar', 'alerts:test', KINDS.map(([, k, label]) => [k, label]), 'shiny');
      el.appendChild(sel);
      el.appendChild(NX.ui.button('Reproducir sonido', () => play(String(NX.store.get('alerts:test', 'shiny')), true)));
    },
  });
})();

// ---- features/backup.js
// Respaldo de Nexus: exporta e importa a un .json todas las claves de
// localStorage que empiezan por "nexus:" (ajustes, posiciones, notas,
// favoritos del comparador...). El guardado del juego no se lee ni se toca.
(() => {
  const KEY = 'backup';
  const FORMAT = 'pokesurvivor-nexus-backup';
  const VERSION = 1;
  const PREFIX = 'nexus:';
  const MAX_BYTES = 5 * 1024 * 1024, MAX_KEYS = 5000;

  function collect() {
    const data = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX)) data[k] = localStorage.getItem(k);
    }
    return data;
  }

  function exportNow() {
    const data = collect();
    const n = Object.keys(data).length;
    const payload = { format: FORMAT, version: VERSION, nexus: NX.version, exportedAt: new Date().toISOString(), count: n, data };
    const d = new Date(), p2 = (x) => String(x).padStart(2, '0');
    NX.download(`nexus-respaldo-${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}.json`, JSON.stringify(payload, null, 2), 'application/json');
    NX.toast(`Respaldo exportado · ${n} dato${n === 1 ? '' : 's'}`);
  }

  // Devuelve { data } o { error }. Rechaza el archivo completo ante cualquier
  // entrada dudosa: nada a medias.
  function validate(text) {
    if (text.length > MAX_BYTES) return { error: 'El archivo es demasiado grande para ser un respaldo de Nexus.' };
    let j;
    try { j = JSON.parse(text); } catch (_) { return { error: 'El archivo no es un JSON válido.' }; }
    if (!j || typeof j !== 'object' || j.format !== FORMAT) return { error: 'El archivo no es un respaldo de PokeSurvivor Nexus.' };
    if (typeof j.version !== 'number' || j.version > VERSION) return { error: 'El respaldo es de una versión más nueva de Nexus. Actualiza la extensión primero.' };
    if (!j.data || typeof j.data !== 'object' || Array.isArray(j.data)) return { error: 'El respaldo no trae datos.' };
    const keys = Object.keys(j.data);
    if (keys.length > MAX_KEYS) return { error: 'El respaldo trae demasiadas entradas.' };
    for (const k of keys) {
      const v = j.data[k];
      if (!k.startsWith(PREFIX) || k.length > 200) return { error: `Clave no permitida: "${k.slice(0, 60)}". Solo se aceptan claves de Nexus.` };
      if (typeof v !== 'string') return { error: `El valor de "${k.slice(0, 60)}" no es válido.` };
      try { JSON.parse(v); } catch (_) { return { error: `El valor de "${k.slice(0, 60)}" está dañado.` }; }
    }
    return { data: j.data, meta: j };
  }

  function confirmBox(title, html, okText) {
    return new Promise((resolve) => {
      const el = document.createElement('section');
      el.className = 'scr dim nx-dlg';
      el.style.zIndex = 100002;
      el.innerHTML = `<div class="box center" style="max-width:460px"><h3>${NX.esc(title)}</h3><p class="sub">${html}</p>
        <div class="row" style="justify-content:center"><button class="btn ghost" data-a="no" type="button">Cancelar</button>
        <button class="btn gold" data-a="yes" type="button">${NX.esc(okText)}</button></div></div>`;
      const key = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); done(false); } };
      const done = (v) => { el.remove(); removeEventListener('keydown', key, true); resolve(v); };
      el.addEventListener('click', (e) => {
        const a = e.target.closest('[data-a]');
        if (a) done(a.dataset.a === 'yes'); else if (e.target === el) done(false);
      });
      addEventListener('keydown', key, true);
      document.body.appendChild(el);
      el.querySelector('[data-a="yes"]').focus();
    });
  }

  async function importFile(file) {
    if (!file) return;
    let text = '';
    try { text = await file.text(); } catch (_) { NX.toast('No se pudo leer el archivo'); return; }
    const r = validate(text);
    if (r.error) { NX.toast(r.error); return; }
    const n = Object.keys(r.data).length, cur = Object.keys(collect()).length;
    const when = r.meta.exportedAt ? new Date(r.meta.exportedAt) : null;
    // El panel de Nexus se cierra para que Escape llegue al diálogo.
    const panel = document.getElementById('nexus-panel');
    if (panel && !panel.classList.contains('hidden') && NX.togglePanel) NX.togglePanel();
    const ok = await confirmBox('Importar respaldo',
      `El archivo trae <b>${n}</b> dato${n === 1 ? '' : 's'} de Nexus` +
      (when && !isNaN(when) ? ` del ${NX.esc(when.toLocaleString('es-VE'))}` : '') +
      (r.meta.nexus ? ` (versión ${NX.esc(String(r.meta.nexus).slice(0, 20))})` : '') +
      `. Reemplazará los ${cur} que tienes ahora. El guardado del juego no se toca. La página se recarga al terminar.`,
      'Importar y recargar');
    if (!ok) return;
    try {
      for (const k of Object.keys(collect())) localStorage.removeItem(k);
      for (const [k, v] of Object.entries(r.data)) localStorage.setItem(k, v);
    } catch (err) {
      NX.toast('No se pudo escribir el respaldo: ' + ((err && err.message) || 'almacenamiento lleno'));
      return;
    }
    NX.toast('Respaldo importado · recargando');
    setTimeout(() => location.reload(), 700);
  }

  NX.feature({ key: KEY, label: 'Respaldo de Nexus', early: true, setup() {} });

  NX.settings.section({
    key: KEY,
    tab: 'Datos',
    title: 'Respaldo de Nexus',
    keywords: 'exportar importar copia seguridad json ajustes backup',
    render(el) {
      const n = Object.keys(collect()).length;
      el.appendChild(NX.ui.note(`Guarda en un archivo todos los ajustes y datos de Nexus (${n} en este navegador) para pasarlos a otro equipo. No incluye tu partida: esa la guarda el juego.`));
      const file = document.createElement('input');
      file.type = 'file';
      file.accept = '.json,application/json';
      file.style.display = 'none';
      file.addEventListener('change', () => { const f = file.files && file.files[0]; file.value = ''; importFile(f); });
      el.appendChild(NX.ui.button('Exportar respaldo', exportNow));
      el.appendChild(NX.ui.button('Importar respaldo', () => file.click()));
      el.appendChild(file);
    },
  });
})();

// ---- features/boss-plate.js
// HUD rediseñado por piezas: placa de vida del jefe con estela, panel de
// reloj (tiempo, bioma, derrotados, monedas, tickets) y colores de las barras
// de vida, jefe y experiencia. No se reescribe el HUD del juego: se ocultan
// solo las piezas que se reemplazan, dentro de la llamada a HUD.draw.
//
// Cómo se ocultan sin depender de coordenadas ni de la escala del HUD:
// HUD.draw empieza llamando a Touch.clearButtons y, ya cerca del final, a
// Events.drawHud. Entre esas dos llamadas está todo lo que interesa: la tira
// de experiencia, la barra de vida, el reloj, la línea de bioma y la barra
// del jefe. En esa ventana, la primera llamada a EnemyMgr.all() es la que
// busca al jefe (se le quita el jefe para que no dibuje su barra) y los
// fillText / fillRect del contexto se filtran por posición en el HUD.
(() => {
  const PLAYING = new Set(['playing', 'held', 'levelup', 'choice']);
  const P = CanvasRenderingContext2D.prototype;
  const HP_W = 168; // ancho de la barra de vida del juego, en px del HUD

  // Opciones en memoria: se releen al cambiar y cada segundo.
  const opt = {};
  const readOpts = () => {
    opt.plate = NX.isOn('bossplate');
    opt.hideBar = opt.plate && NX.store.get('bossplate:hide', true) !== false;
    opt.nums = NX.store.get('bossplate:nums', true) !== false;
    opt.clock = NX.isOn('clockpanel');
    opt.hideClock = opt.clock && NX.store.get('clockpanel:hide', true) !== false;
    opt.colors = NX.isOn('hudcolors');
    opt.hp = opt.colors ? NX.store.get('hudcolors:hp', 'game') : 'game';
    opt.boss = opt.colors ? NX.store.get('hudcolors:boss', 'game') : 'game';
    opt.xp = opt.colors ? NX.store.get('hudcolors:xp', 'game') : 'game';
    opt.xpNum = opt.colors && !!NX.store.get('hudcolors:xpnum', false);
  };
  readOpts();
  setInterval(readOpts, 1000);

  const BOSS_COL = { game: '#ffcb3d', red: '#ff3048', purple: '#b06bff', cyan: '#4fd1ff' };
  const XP_COL = { green: ['#7dffb0', '#2fbf6a'], gold: ['#fff1a6', '#f0a020'], white: ['#ffffff', '#b9cbf0'] };
  const hpColor = (frac) => {
    if (opt.hp === 'green') return '#4fd17a';
    if (opt.hp === 'blue') return '#4f9dff';
    // Degradado según la vida: verde lleno, amarillo a la mitad, rojo al final.
    return `hsl(${Math.round(NX.clamp(frac, 0, 1) * 120)},78%,52%)`;
  };
  // Para el HUD Nexus (hud-new.js): los mismos colores en sus barras.
  NX.hudPalette = {
    hp: (frac) => (opt.hp === 'game' ? '#ff5f6d' : hpColor(frac)),
    xp: () => XP_COL[opt.xp] || null,
    xpNum: () => opt.xpNum,
  };

  // ---- ventana del cuerpo del HUD del juego
  let hooked = false, depth = 0, body = false, bossFind = false, plateShown = false, clockShown = false;
  const patched = new WeakSet();

  function patchCtx(ctx) {
    if (patched.has(ctx)) return;
    patched.add(ctx);
    Object.defineProperty(ctx, 'fillRect', {
      configurable: true, writable: true,
      value: function (x, y, w, h) {
        if (body && opt.colors) {
          const fs = this.fillStyle;
          let c = null;
          if (h === 11 && fs === '#ff5f6d' && opt.hp !== 'game') c = hpColor(w / HP_W);
          else if (h === 12 && fs === '#ffcb3d' && opt.boss !== 'game') c = BOSS_COL[opt.boss];
          else if (y === 0 && h === 7 && typeof fs !== 'string' && XP_COL[opt.xp]) {
            const g = P.createLinearGradient.call(this, 0, 0, Math.max(1, w), 0);
            g.addColorStop(0, XP_COL[opt.xp][0]);
            g.addColorStop(1, XP_COL[opt.xp][1]);
            c = g;
          }
          if (c) {
            this.fillStyle = c;
            try { return P.fillRect.call(this, x, y, w, h); } finally { this.fillStyle = fs; }
          }
        }
        return P.fillRect.call(this, x, y, w, h);
      },
    });
    Object.defineProperty(ctx, 'fillText', {
      configurable: true, writable: true,
      value: function (s, x, y) {
        // Reloj (y = 42) y línea de bioma, derrotados y monedas (y = 58).
        if (body && opt.hideClock && clockShown && this.textAlign === 'center' &&
          ((y === 42 && /^\d+:\d\d(:\d\d)?$/.test(s)) || (y === 58 && String(s).indexOf('·') >= 0))) return;
        return P.fillText.apply(this, arguments);
      },
    });
  }
  function hook(ns) {
    if (hooked) return;
    hooked = true;
    const d = ns.HUD.draw;
    ns.HUD.draw = function (ctx) {
      if (ctx && typeof ctx.fillRect === 'function') patchCtx(ctx);
      depth++;
      try { return d.apply(this, arguments); } finally {
        if (--depth <= 0) { depth = 0; body = false; bossFind = false; }
      }
    };
    const T = ns.Touch, cb = T.clearButtons;
    T.clearButtons = function () {
      if (depth) { body = true; bossFind = true; }
      return cb.apply(this, arguments);
    };
    const E = ns.Events, dh = E.drawHud;
    E.drawHud = function () {
      body = false;
      bossFind = false;
      return dh.apply(this, arguments);
    };
    const M = ns.EnemyMgr, all = M.all;
    M.all = function () {
      const r = all.apply(this, arguments);
      if (bossFind) {
        bossFind = false;
        if (opt.hideBar && plateShown && Array.isArray(r)) return r.filter((e) => !e.boss);
      }
      return r;
    };
  }

  const needs = (ns) => ns.HUD && typeof ns.HUD.draw === 'function' && ns.Touch && typeof ns.Touch.clearButtons === 'function' &&
    ns.Events && typeof ns.Events.drawHud === 'function' && ns.EnemyMgr && typeof ns.EnemyMgr.all === 'function' &&
    ns.Game && NX.featureList().some((f) => f.key === 'hud' && f.status === 'ok');

  NX.css(`.nx-hudcard{position:fixed;left:50%;z-index:15;pointer-events:none;transform-origin:50% 0;
  font:13px/1.25 var(--font,'Pixelify',system-ui,sans-serif);color:#f4f8ff;text-shadow:1px 1px 0 #0a1430}
.nx-hudcard.hidden{display:none}
#nexus-bossplate{width:min(440px,72vw);padding:5px 10px 7px;border-radius:10px;background:linear-gradient(rgba(36,20,24,.9),rgba(16,10,18,.9));
  border:2px solid #f4f8ff;outline:2px solid #0b1838;box-shadow:inset 0 0 0 2px var(--nx-bc,#ffcb3d),0 4px 0 rgba(10,20,48,.8)}
#nexus-bossplate .nx-bp-top{display:flex;align-items:baseline;gap:8px;margin-bottom:4px;white-space:nowrap}
#nexus-bossplate .nx-bp-tag{font-size:10px;padding:0 6px;border-radius:7px;background:var(--nx-bc,#ffcb3d);color:#1a0f08;text-shadow:none}
#nexus-bossplate .nx-bp-name{font-size:15px;color:#fff;overflow:hidden;text-overflow:ellipsis}
#nexus-bossplate .nx-bp-num{margin-left:auto;font-size:11px;color:#ffe9b0}
#nexus-bossplate .nx-bp-bar{position:relative;height:12px;border-radius:6px;background:rgba(0,0,0,.6);overflow:hidden;box-shadow:inset 0 0 0 1px rgba(255,255,255,.18)}
#nexus-bossplate .nx-bp-bar i{position:absolute;left:0;top:0;bottom:0;border-radius:6px}
#nexus-bossplate .nx-bp-trail{background:#fff3d6;transition:width .1s linear}
#nexus-bossplate .nx-bp-fill{background:linear-gradient(#fff6c2,var(--nx-bc,#ffcb3d) 45%,var(--nx-bc2,#e09a10));transition:width .1s linear}
#nexus-bossplate.reset .nx-bp-trail,#nexus-bossplate.reset .nx-bp-fill{transition:none}
#nexus-clock{top:6px;min-width:190px;padding:3px 14px 5px;border-radius:10px;text-align:center;background:linear-gradient(rgba(36,64,127,.88),rgba(21,42,92,.88));
  border:2px solid #f4f8ff;outline:2px solid #0b1838;box-shadow:inset 0 0 0 2px #5b83d6,0 4px 0 rgba(10,20,48,.8)}
#nexus-clock .nx-ck-t{font-size:22px;line-height:1.1;color:#fff}
#nexus-clock .nx-ck-s{font-size:11px;color:#cfe0ff;white-space:nowrap}
#nexus-clock .nx-ck-s b{color:#ffd23f;font-weight:inherit}
#nexus-clock .nx-ck-xp{height:3px;margin-top:3px;border-radius:2px;background:rgba(0,0,0,.45);overflow:hidden}
#nexus-clock .nx-ck-xp i{display:block;height:100%;background:linear-gradient(90deg,#4fd1ff,#a98bff)}`);

  // ---- placa del jefe y panel de reloj (DOM, a 10 Hz)
  let plate = null, clock = null, built = false, lastBits = '';
  let curBoss = null, trailPct = 100, lastDrop = 0, lastPct = 100;
  const set = (el, prop, v) => { if (el[prop] !== v) el[prop] = v; };
  const style = (el, prop, v) => { if (el.style[prop] !== v) el.style[prop] = v; };
  const num = (n) => Math.max(0, Math.round(+n || 0)).toLocaleString('es-VE');

  function build(ns) {
    if (built) return;
    built = true;
    NX.onReady(() => {
      plate = document.createElement('div');
      plate.id = 'nexus-bossplate';
      plate.className = 'nx-hudcard hidden';
      plate.innerHTML = '<div class="nx-bp-top"><span class="nx-bp-tag"></span><span class="nx-bp-name"></span><span class="nx-bp-num"></span></div>' +
        '<div class="nx-bp-bar"><i class="nx-bp-trail"></i><i class="nx-bp-fill"></i></div>';
      document.body.appendChild(plate);
      clock = document.createElement('div');
      clock.id = 'nexus-clock';
      clock.className = 'nx-hudcard hidden';
      clock.innerHTML = '<div class="nx-ck-t"></div><div class="nx-ck-s"></div><div class="nx-ck-xp"><i></i></div>';
      document.body.appendChild(clock);
      let last = 0;
      const loop = (now) => {
        requestAnimationFrame(loop);
        if (now - last < 100) return;
        last = now;
        try { update(ns); } catch (err) { NX.trip(opt.plate ? 'bossplate' : 'clockpanel', err); }
      };
      requestAnimationFrame(loop);
    });
  }

  function update(ns) {
    const p = NX.me(), st = ns.Game.state;
    const live = !!p && PLAYING.has(st);
    const k = NX.hudK ? NX.hudK() : 1;

    // Panel de reloj.
    const showClock = live && opt.clock;
    clockShown = showClock;
    clock.classList.toggle('hidden', !showClock);
    if (showClock) {
      style(clock, 'transform', `translateX(-50%) scale(${k})`);
      const t = ns.Game.st && ns.Game.st.time;
      set(clock.firstChild, 'textContent', ns.U && ns.U.mmss ? ns.U.mmss(t || 0) : NX.fmtTime(t));
      let biome = '';
      try { biome = ns.World && ns.World.biomeName ? String(ns.World.biomeName()) : ''; } catch (_) { biome = ''; }
      const bits = [];
      if (biome) bits.push(NX.esc(biome));
      bits.push(`Nv. <b>${num(p.level)}</b>`);
      bits.push(`<b>${num(p.kills)}</b> derrotados`);
      bits.push(`<b>${num(p.coins)}</b> monedas`);
      if (p.t1 > 0) bits.push(`<b>${num(p.t1)}</b> ticket${p.t1 === 1 ? '' : 's'}`);
      if (p.t10 > 0) bits.push(`<b>${num(p.t10)}</b> x10`);
      if (p.candy > 0) bits.push(`<b>${num(p.candy)}</b> caramelos`);
      const html = bits.join(' · ');
      if (html !== lastBits) { lastBits = html; clock.children[1].innerHTML = html; }
      const xp = p.xpNext > 0 ? NX.clamp(p.xp / p.xpNext, 0, 1) : 0;
      style(clock.children[2].firstChild, 'width', (xp * 100).toFixed(1) + '%');
    }

    // Placa del jefe.
    let boss = null, extra = 0;
    if (live && opt.plate && ns.EnemyMgr && ns.EnemyMgr.all) {
      for (const e of ns.EnemyMgr.all()) {
        if (!e || !e.boss || e.dead) continue;
        if (!boss) boss = e; else extra++;
      }
    }
    plateShown = !!boss;
    plate.classList.toggle('hidden', !boss);
    if (!boss) { curBoss = null; return; }
    const frac = boss.maxHp > 0 ? NX.clamp(boss.hp / boss.maxHp, 0, 1) : 0;
    const pct = frac * 100;
    const fresh = boss !== curBoss;
    // Estela: guarda la vida previa un momento tras cada golpe y luego baja.
    const now = performance.now();
    if (fresh) { curBoss = boss; trailPct = lastPct = pct; plate.classList.add('reset'); }
    if (pct < lastPct - 0.01) lastDrop = now;
    lastPct = pct;
    if (pct >= trailPct) trailPct = pct;
    else if (now - lastDrop > 350) trailPct = Math.max(pct, trailPct - Math.max(1.2, (trailPct - pct) * 0.3));
    const col = BOSS_COL[opt.boss] || BOSS_COL.game;
    plate.style.setProperty('--nx-bc', col);
    // Debajo del reloj, del aviso de próximo jefe y del texto de la arena.
    let top = 64 * k;
    if (clockShown) top = Math.max(top, clock.getBoundingClientRect().bottom + 6);
    const pill = document.getElementById('nexus-boss');
    if (pill && !pill.classList.contains('hidden')) top = Math.max(top, pill.getBoundingClientRect().bottom + 6);
    if (ns.Rift && ns.Rift.inArena) top += 22 * k;
    style(plate, 'top', Math.round(top) + 'px');
    style(plate, 'transform', `translateX(-50%) scale(${k})`);
    const tag = boss.judge ? 'JUICIO' : boss.legend ? 'LEGENDARIO' : 'JEFE';
    set(plate.querySelector('.nx-bp-tag'), 'textContent', tag);
    set(plate.querySelector('.nx-bp-name'), 'textContent', String(boss.name || '¿?') + (boss.shiny ? ' (shiny)' : '') + (extra ? ` +${extra}` : ''));
    set(plate.querySelector('.nx-bp-num'), 'textContent', opt.nums ? `${num(boss.hp)} / ${num(boss.maxHp)} · ${Math.ceil(pct)} %` : `${Math.ceil(pct)} %`);
    style(plate.querySelector('.nx-bp-fill'), 'width', pct.toFixed(2) + '%');
    style(plate.querySelector('.nx-bp-trail'), 'width', trailPct.toFixed(2) + '%');
    if (fresh) requestAnimationFrame(() => plate.classList.remove('reset'));
  }

  // ---- registro
  NX.feature({
    key: 'bossplate',
    label: 'Placa del jefe',
    needs,
    setup(ns) { hook(ns); build(ns); },
  });
  NX.feature({
    key: 'clockpanel',
    label: 'Panel de reloj',
    needs: (ns) => needs(ns) && ns.World,
    setup(ns) { hook(ns); build(ns); },
  });
  NX.feature({
    key: 'hudcolors',
    label: 'Colores del HUD',
    needs,
    setup(ns) {
      hook(ns);
      // Nivel y porcentaje de experiencia sobre la tira del juego, cuando el
      // panel de reloj no lo muestra ya.
      NX.hudLayers.push({
        key: 'hudcolors',
        over(ctx, w, h, pl) {
          // Con el HUD Nexus la experiencia va abajo y él mismo pone el número.
          if (!opt.xpNum || clockShown || NX.hudNewActive || !pl || !(pl.xpNext > 0)) return;
          const t = `Nv. ${pl.level} · ${Math.floor(NX.clamp(pl.xp / pl.xpNext, 0, 1) * 100)} %`;
          ctx.font = '700 10px Pixelify,"Segoe UI",sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'alphabetic';
          ctx.lineWidth = 3;
          ctx.strokeStyle = 'rgba(0,0,0,.8)';
          ctx.strokeText(t, w / 2, 18);
          ctx.fillStyle = '#e6f3ff';
          ctx.fillText(t, w / 2, 18);
        },
      });
    },
  });

  NX.settings.section({
    key: 'bossplate',
    title: 'Placa del jefe',
    tab: 'HUD',
    keywords: 'jefe vida barra boss legendario',
    render(el) {
      el.appendChild(NX.ui.toggle('Activado', 'on:bossplate', true, readOpts));
      el.appendChild(NX.ui.toggle('Ocultar la barra del jefe del juego', 'bossplate:hide', true, readOpts));
      el.appendChild(NX.ui.toggle('Vida en números', 'bossplate:nums', true, readOpts));
    },
  });
  NX.settings.section({
    key: 'clockpanel',
    title: 'Panel de reloj',
    tab: 'HUD',
    keywords: 'reloj tiempo bioma monedas tickets derrotados',
    render(el) {
      el.appendChild(NX.ui.toggle('Activado', 'on:clockpanel', true, readOpts));
      el.appendChild(NX.ui.toggle('Ocultar el reloj del juego', 'clockpanel:hide', true, readOpts));
      el.appendChild(NX.ui.note('Tiempo, bioma, nivel, derrotados, monedas y tickets en una tarjeta arriba al centro.'));
    },
  });
  NX.settings.section({
    key: 'hudcolors',
    title: 'Colores del HUD',
    tab: 'HUD',
    keywords: 'color barra vida experiencia jefe',
    render(el) {
      el.appendChild(NX.ui.toggle('Activado', 'on:hudcolors', true, readOpts));
      el.appendChild(NX.ui.select('Barra de vida', 'hudcolors:hp', [['game', 'Roja (juego)'], ['grad', 'Según la vida'], ['green', 'Verde'], ['blue', 'Azul']], 'game', readOpts));
      el.appendChild(NX.ui.select('Barra del jefe', 'hudcolors:boss', [['game', 'Dorada (juego)'], ['red', 'Roja'], ['purple', 'Morada'], ['cyan', 'Celeste']], 'game', readOpts));
      el.appendChild(NX.ui.select('Barra de experiencia', 'hudcolors:xp', [['game', 'Azul y violeta (juego)'], ['green', 'Verde'], ['gold', 'Dorada'], ['white', 'Blanca']], 'game', readOpts));
      el.appendChild(NX.ui.toggle('Nivel y porcentaje de experiencia', 'hudcolors:xpnum', false, readOpts));
    },
  });
})();

// ---- features/bossrush.js
// Boss Rush: solo jefes, uno tras otro y contra el reloj. Usa los jefes que
// el juego sortea para la partida (5) o dos vueltas (10, la segunda más
// dura). Sin enemigos normales, sin grietas ni Juicio. Empiezas con cartas de
// mejora y ganas más con cada jefe. Mejor tiempo guardado en NX.store.
(() => {
  const KEY = 'rush';
  const BEST_KEY = 'rush:best';
  const HIST_KEY = 'rush:hist';
  const GAP = 3;          // segundos entre un jefe y el siguiente
  const START_CARDS = 8;  // cartas de mejora al empezar
  const PER_BOSS = 2;     // cartas por jefe derrotado
  const FAR = 1e9;

  const best = () => NX.store.get(BEST_KEY, {}) || {};
  const count = () => (+NX.store.get('rush:count', 5) === 10 ? 10 : 5);

  function cfg() {
    const n = count();
    const useMods = !!NX.store.get('rush:mods', false) && NX.modsApi && NX.isOn('mods');
    return {
      key: KEY,
      label: 'Boss Rush',
      noJudge: true,
      noRift: true,
      noAch: true,
      restoreStats: true,
      mods: useMods ? NX.modsApi.values() : null,
      spawnK: 0, // sin enemigos normales: el generador solo saca jefes
      capK: 1,
      onStart(ns, p, c) {
        const B = ns.Enemies.BOSSES;
        const base = B.slice(0, 5);
        const list = n === 10
          ? base.concat(base.map((b) => Object.assign({}, b, { hp: Math.round(b.hp * 1.6), dmg: b.dmg * 1.2, shotDmg: (b.shotDmg || 0) * 1.2 })))
          : base;
        B.length = 0;
        list.forEach((b, i) => B.push(Object.assign({}, b, { at: i === 0 ? 2 : FAR })));
        c.bossLen0 = B.length; // la lista es de esta partida: no se recorta al terminar
        c.total = list.length;
        c.spawned = 0;
        c.cur = null;
        c.tStart = null;
        c.done = false;
        c.best = (best()[n] || {}).time || 0;
        c.n = n;
        for (let i = 0; i < START_CARDS; i++) { try { ns.Game.debugLevelUp(); } catch (_) { break; } }
      },
      onAdd(e, ns, c) {
        if (!e.boss || e.arceus || e.legend || e.nxDummy) return;
        c.spawned++;
        c.cur = e;
        if (c.tStart == null) c.tStart = ns.Game.st.time || 0;
      },
      onTick(ns, p, c) {
        if (c.done || !c.cur) return;
        const alive = !c.cur.dead && ns.EnemyMgr.all().includes(c.cur);
        if (alive) return;
        const t = ns.Game.st.time || 0;
        if (c.spawned >= c.total) {
          c.done = true;
          c.result = t - c.tStart;
          const sec = Math.round(c.result * 10) / 10;
          NX.toast('Boss Rush completado en ' + NX.fmtTime(sec));
          try { ns.Audio.sfx('shinyGet'); } catch (_) { /* silencio */ }
          setTimeout(() => {
            if (ns.Game.player === p && ns.Game.state !== 'over' && ns.Game.state !== 'ui') ns.Game.quit();
          }, 2500);
          return;
        }
        const B = ns.Enemies.BOSSES;
        if (c.armed !== c.spawned && B[c.spawned]) {
          c.armed = c.spawned;
          B[c.spawned].at = t + GAP;
          for (let i = 0; i < PER_BOSS; i++) { try { ns.Game.debugLevelUp(); } catch (_) { break; } }
        }
      },
      pillExtra(ns, c) {
        const t = c.done ? c.result : c.tStart == null ? 0 : (ns.Game.st.time || 0) - c.tStart;
        return `Jefe ${Math.max(1, Math.min(c.spawned, c.total))}/${c.total} · ${NX.fmtTime(t)}${c.best ? ' · récord ' + NX.fmtTime(c.best) : ''}`;
      },
      onEnd(ns, p, c, info) {
        let line = `<b>Boss Rush</b> · ${Math.min(c.spawned, c.total)}/${c.total} jefes · fuera del ranking · sin logros`;
        if (!c.done) return line;
        const b = best(), prev = b[c.n];
        const time = Math.round(c.result * 10) / 10;
        const beat = !prev || time < prev.time;
        if (beat) { b[c.n] = { time, dex: info.dex, mon: info.mon, at: Date.now(), level: info.level }; NX.store.set(BEST_KEY, b); }
        const h = NX.store.get(HIST_KEY, []) || [];
        h.unshift({ n: c.n, time, dex: info.dex, mon: info.mon, level: info.level, at: Date.now() });
        if (h.length > 10) h.length = 10;
        NX.store.set(HIST_KEY, h);
        line += `<br>Completado en <b>${NX.fmtTime(time)}</b>` + (beat ? ' · <b style="color:#ffe27a">¡Nuevo mejor tiempo!</b>' : ` · mejor ${NX.fmtTime(prev.time)}`);
        return line;
      },
    };
  }

  function bests(el, h) {
    const b = best();
    const items = [5, 10].map((n) => [`Mejor tiempo (${n} jefes)`, b[n] ? NX.fmtTime(b[n].time) + (b[n].mon ? ' · ' + b[n].mon : '') : '·']);
    if (h) h.cards(el, items);
    else el.appendChild(NX.ui.note(items.map(([k, v]) => k + ': ' + v).join(' · ')));
  }

  NX.feature({
    key: KEY,
    label: 'Boss Rush',
    needs: (ns) => !!NX.modes && ns.Enemies && Array.isArray(ns.Enemies.BOSSES) && typeof ns.Game.debugLevelUp === 'function' &&
      typeof ns.EnemyMgr.all === 'function' && ns.Coop && typeof ns.Coop.scaleRate === 'function',
    setup() {
      NX.modes.register({
        key: KEY,
        title: 'Boss Rush',
        order: 3,
        render(el, h) {
          h.desc(el, `Solo jefes, uno tras otro, contra el reloj. Empiezas con ${START_CARDS} cartas de mejora y ganas ${PER_BOSS} por cada jefe. Sin enemigos normales, sin grietas ni Juicio. Fuera del ranking, sin logros y sin cambiar tus estadísticas.`);
          bests(el, h);
          el.appendChild(NX.ui.select('Jefes', 'rush:count', [['5', '5 jefes (los de la partida)'], ['10', '10 jefes (dos vueltas)']], '5'));
          if (NX.isOn('mods')) el.appendChild(NX.ui.toggle('Aplicar mis modificadores', 'rush:mods', false));
          const hist = NX.store.get(HIST_KEY, []) || [];
          h.table(el, ['Jefes', 'Tiempo', 'Nivel', 'Pokémon', 'Fecha'], hist.slice(0, 5).map((e) => [String(e.n), NX.fmtTime(e.time), String(e.level), e.mon || NX.modes.dexName(e.dex), NX.modes.date(e.at)]), 'Todavía no has completado un Boss Rush.');
          h.foot(el, 'Jugar Boss Rush', () => NX.modes.launch(cfg()));
        },
      });
    },
  });

  NX.settings.section({
    key: KEY,
    tab: 'Modos',
    title: 'Boss Rush',
    keywords: 'boss rush jefes reloj tiempo',
    render(el) {
      el.appendChild(NX.ui.toggle('Activado', 'on:' + KEY, true));
      bests(el, null);
      el.appendChild(NX.ui.button('Borrar tiempos', () => { NX.store.set(BEST_KEY, {}); NX.store.set(HIST_KEY, []); NX.toast('Tiempos del Boss Rush borrados'); }));
    },
  });
})();

// ---- features/build-center.js
// Centro de builds: botón "Builds" en el menú principal (y "Ver build" en la
// ficha de la Pokédex) que abre una pantalla con el ranking de todos los
// Pokémon según el modelo Build Nexus (build-model.js), con buscador y
// filtros, y para cada Pokémon: la Build Nexus con su porqué, la build de
// SurvivorTiers (si el cascarón trajo los datos) y tu mejor build según tu
// historial de partidas. NX.buildModel, NX.gd, NX.telemetry, NX.personalRank
// y NX.buildlab se leen de forma perezosa.
(() => {
  const KEY = 'build-center';
  const ns = () => NX.ns;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => NX.esc(s == null ? '' : s);
  const pad = (n) => String(n).padStart(3, '0');
  const fold = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const num = (v, d = 0) => (+v || 0).toLocaleString('es-VE', { maximumFractionDigits: d });

  const st = Object.assign({ q: '', type: '', gen: '', tier: '', own: false, sort: 'nexus', sel: 0, tm: false }, NX.store.get('bc:state', {}));
  const save = () => NX.store.set('bc:state', { type: st.type, gen: st.gen, tier: st.tier, own: st.own, sort: st.sort, sel: st.sel, tm: st.tm });

  NX.css(`#nexus-bc{z-index:61}
#nexus-bc .nx-bc-box{width:min(1120px,100%);max-height:calc(100vh - 60px);max-height:calc(100dvh - 60px);display:flex;flex-direction:column;gap:8px;padding:14px 16px;overflow:hidden;box-sizing:border-box}
#nexus-bc .nx-bc-head{display:flex;justify-content:space-between;align-items:center;gap:10px}
#nexus-bc .nx-bc-head h2{margin:0}
#nexus-bc .nx-bc-cols{display:grid;grid-template-columns:minmax(280px,390px) 1fr;gap:12px;min-height:0;flex:1}
#nexus-bc .nx-bc-left,#nexus-bc .nx-bc-right{min-height:0;display:flex;flex-direction:column;gap:6px}
#nexus-bc .nx-bc-right{overflow:auto;overscroll-behavior:contain;padding-right:4px}
#nexus-bc .field{width:100%;box-sizing:border-box;font-size:15px;padding:7px 10px}
#nexus-bc .nx-bc-fil{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
#nexus-bc select{font:inherit;font-size:13px;background:rgba(0,0,0,.3);color:#fff;border:2px solid rgba(244,248,255,.25);border-radius:20px;padding:4px 8px;text-shadow:none;max-width:100%}
#nexus-bc select option{background:#14204a}
#nexus-bc .chip{color:inherit;font-family:inherit}
#nexus-bc .nx-bc-cnt{font-size:12px;color:var(--muted,#b9cbf0);text-shadow:none}
#nexus-bc .nx-bc-list{flex:1;min-height:160px;overflow:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;touch-action:pan-y;background:rgba(0,0,0,.2);border:2px solid rgba(244,248,255,.2);border-radius:10px}
#nexus-bc .nx-bc-row{display:grid;grid-template-columns:38px 24px minmax(0,1fr) auto 30px;align-items:center;gap:6px;width:100%;min-height:42px;box-sizing:border-box;padding:4px 8px;
  background:transparent;border:0;border-bottom:1px solid rgba(255,255,255,.08);color:inherit;font:inherit;font-size:14px;text-align:left;cursor:pointer;text-shadow:1px 1px 0 var(--shadow,#0a1430)}
#nexus-bc .nx-bc-row:hover,#nexus-bc .nx-bc-row:focus-visible{background:rgba(255,255,255,.07);outline:none}
#nexus-bc .nx-bc-row.on{background:rgba(255,210,63,.16);box-shadow:inset 3px 0 0 var(--gold,#ffd23f)}
#nexus-bc .nx-bc-row .rk{color:var(--muted,#b9cbf0);font-size:12px}
#nexus-bc .nx-bc-row .nm{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#nexus-bc .nx-bc-row .nm small{display:block;line-height:1}
#nexus-bc .nx-bc-row .sc{text-align:right;color:var(--gold,#ffd23f)}
#nexus-bc .nx-bc-row .stb{font-size:11px;color:var(--muted,#b9cbf0);display:flex;align-items:center;gap:3px}
#nexus-bc .nx-bc-row .stb .nx-tier{min-width:15px;height:15px;font-size:10px}
#nexus-bc .nx-tier.big{min-width:30px;height:30px;font-size:20px;border-radius:7px}
#nexus-bc .nx-bc-hd{display:grid;grid-template-columns:auto 1fr auto;gap:12px;align-items:center}
#nexus-bc .nx-bc-spr canvas{display:block}
#nexus-bc .nx-bc-hd h3{margin:0;font-size:22px}
#nexus-bc .nx-bc-hd .sub{margin:0;font-size:13px}
#nexus-bc .nx-bc-sc{text-align:center;display:flex;flex-direction:column;align-items:center;gap:2px}
#nexus-bc .nx-bc-sc b{font-size:20px;color:var(--gold,#ffd23f)}
#nexus-bc .nx-bc-sc small{font-size:11px;color:var(--muted,#b9cbf0);text-shadow:none}
#nexus-bc .panel{padding:10px 12px}
#nexus-bc .nx-bc-sec h4{margin:0 0 6px;font-size:16px;color:var(--gold,#ffd23f);display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between}
#nexus-bc .nx-bc-mv{display:grid;grid-template-columns:minmax(120px,170px) 1fr;gap:8px;align-items:start;margin:5px 0}
#nexus-bc .nx-bc-mv .mn{padding:3px 8px;border-radius:8px;color:#fff;font-size:13px;text-shadow:1px 1px 0 #0a1430;text-align:center}
#nexus-bc .nx-bc-mv .mn i{font-style:normal;font-size:10px;opacity:.9;display:block}
#nexus-bc .nx-bc-mv small{color:#dfe8fb;font-size:12px;line-height:1.35;text-shadow:none}
#nexus-bc .nx-bc-chips{display:flex;flex-wrap:wrap;gap:4px;margin:4px 0}
#nexus-bc .nx-bc-chips span{padding:2px 8px;border-radius:8px;color:#fff;font-size:12px;text-shadow:1px 1px 0 #0a1430}
#nexus-bc .nx-bc-chips span.hit{box-shadow:0 0 0 2px var(--gold,#ffd23f)}
#nexus-bc .nx-bc-bars{display:grid;gap:4px;margin:8px 0 4px}
#nexus-bc .nx-bc-bar{display:grid;grid-template-columns:110px 1fr 38px;gap:8px;align-items:center;font-size:12px;text-shadow:none}
#nexus-bc .nx-bc-bar>span{color:var(--muted,#b9cbf0)}
#nexus-bc .nx-bc-bar .tr{height:8px;background:rgba(0,0,0,.35);border-radius:6px;overflow:hidden}
#nexus-bc .nx-bc-bar .tr i{display:block;height:100%;background:var(--gold,#ffd23f)}
#nexus-bc .nx-bc-bar b{text-align:right}
#nexus-bc .nx-bc-p{margin:4px 0;font-size:12px;color:var(--muted,#b9cbf0);text-shadow:none;line-height:1.4}
#nexus-bc .nx-bc-p a{color:inherit;text-decoration:underline}
#nexus-bc .nx-bc-p b{color:#fff}
#nexus-bc .nx-bc-act{display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end}
#nexus-bc .nx-bc-back{display:none}
#nexus-bc .nx-bc-empty{padding:30px 10px;text-align:center;color:var(--muted,#b9cbf0)}
#nexus-bc .nx-bc-foot{margin:0;font-size:11px;color:var(--muted,#b9cbf0);text-shadow:none}
#dex-detail .nx-bc-dexbtn{margin:6px auto 0;display:inline-flex}
html.nx-bc-open #nexus-fab{visibility:hidden}
@media (max-width:760px),(max-height:520px) and (max-width:1000px){
#nexus-bc{padding:8px 6px calc(6px + env(safe-area-inset-bottom,0px));align-items:stretch}
#nexus-bc .nx-bc-box{max-height:none;height:100%;padding:10px}
#nexus-bc .nx-bc-cols{grid-template-columns:1fr}
#nexus-bc .nx-bc-box.det .nx-bc-left{display:none}
#nexus-bc .nx-bc-box:not(.det) .nx-bc-right{display:none}
#nexus-bc .nx-bc-back{display:inline-flex}
#nexus-bc .btn,#nexus-bc .chip,#nexus-bc select{min-height:40px}
#nexus-bc .field{min-height:42px;font-size:16px}
#nexus-bc .nx-bc-row{min-height:46px}
#nexus-bc .nx-bc-mv{grid-template-columns:1fr}
#nexus-bc .nx-bc-hd{grid-template-columns:auto 1fr}
#nexus-bc .nx-bc-sc{grid-column:1 / -1;flex-direction:row;justify-content:flex-start;gap:8px}
#nexus-bc .nx-bc-bar{grid-template-columns:96px 1fr 36px}
#nexus-bc .nx-bc-fil select{flex:1 1 30%}}`);

  // ---- datos
  const owns = (dex) => {
    const N = ns();
    try { if (N.DB && typeof N.DB.owns === 'function') return !!N.DB.owns(dex); } catch (_) { /* respaldo */ }
    const s = N.DB && N.DB.save;
    return !!(s && s.owned && s.owned[dex]);
  };
  const genName = (g) => { const N = ns(); return NX.gd.tr(((N.MenuUI && N.MenuUI.GEN_NAMES) || [])[g - 1] || 'Región ' + g); };
  const tierBadge = (t, title) => `<span class="nx-tier" style="--tc:${NX.buildModel.tierColor(t)}"${title ? ` title="${esc(title)}"` : ''}>${esc(t)}</span>`;
  const runsOf = (dex) => {
    let all = [];
    try { all = NX.telemetry ? NX.telemetry.history() : (NX.store.get('tele:runs', []) || []); } catch (_) { all = []; }
    return all.filter((r) => r && +r.dex === +dex);
  };

  function filtered() {
    const N = ns(), G = NX.gd, BM = NX.buildModel;
    const tiers = G.tiers();
    const q = fold(st.q.trim());
    const qn = parseInt(q, 10);
    const rows = BM.all().filter((r) => {
      const p = N.DEX_BY[r.dex];
      if (!p) return false;
      if (st.type && !p.types.includes(st.type)) return false;
      if (st.gen && String(p.gen) !== String(st.gen)) return false;
      if (st.tier && r.tier !== st.tier) return false;
      if (st.own && !owns(r.dex)) return false;
      if (q) {
        if (Number.isFinite(qn) && String(qn) === q) return r.dex === qn || pad(r.dex).includes(q);
        if (!fold(G.monName(r.dex)).includes(q) && !fold(p.name).includes(q)) return false;
      }
      return true;
    });
    if (st.sort === 'st' && tiers) rows.sort((a, b) => ((tiers.byDex.get(a.dex) || {}).rank || 1e9) - ((tiers.byDex.get(b.dex) || {}).rank || 1e9));
    else if (st.sort === 'dex') rows.sort((a, b) => a.dex - b.dex);
    else rows.sort((a, b) => a.rank - b.rank);
    return rows;
  }

  // ---- pantalla
  let scr = null, listT = 0;
  function build() {
    if (scr) return scr;
    scr = document.createElement('section');
    scr.id = 'nexus-bc';
    scr.className = 'scr dim hidden';
    scr.innerHTML = '<div class="box nx-bc-box"></div>';
    scr.addEventListener('keydown', (e) => { if (e.key !== 'Escape') e.stopPropagation(); });
    scr.addEventListener('click', (e) => { if (e.target === scr) close(); });
    document.body.appendChild(scr);
    return scr;
  }
  function shell() {
    const N = ns(), G = NX.gd;
    const box = scr.querySelector('.nx-bc-box');
    const types = (N.U && N.U.TYPE_NAME) || {};
    const gens = [...new Set(N.DEX.map((p) => p.gen))].filter(Boolean).sort((a, b) => a - b);
    const tiers = G.tiers();
    const opt = (v, t, cur) => `<option value="${esc(v)}"${String(cur) === String(v) ? ' selected' : ''}>${esc(t)}</option>`;
    box.innerHTML = `<div class="nx-bc-head"><h2>Centro de builds</h2><button type="button" class="btn small ghost" data-x>Cerrar</button></div>
      <div class="nx-bc-cols">
        <div class="nx-bc-left">
          <input class="field nx-bc-q" type="search" placeholder="Buscar por nombre o número" value="${esc(st.q)}" autocomplete="off">
          <div class="nx-bc-fil">
            <select data-f="type" aria-label="Tipo">${opt('', 'Todos los tipos', st.type)}${Object.keys(types).map((t) => opt(t, G.typeName(t), st.type)).join('')}</select>
            <select data-f="gen" aria-label="Región">${opt('', 'Todas las regiones', st.gen)}${gens.map((g) => opt(g, genName(g), st.gen)).join('')}</select>
            <select data-f="tier" aria-label="Tier">${opt('', 'Todos los tiers', st.tier)}${['S', 'A', 'B', 'C', 'D'].map((t) => opt(t, 'Tier ' + t, st.tier)).join('')}</select>
            <button type="button" class="chip${st.own ? ' on' : ''}" data-f="own">Poseídos</button>
          </div>
          <div class="nx-bc-fil"><span class="nx-bc-cnt">Orden:</span>
            <button type="button" class="chip${st.sort === 'nexus' ? ' on' : ''}" data-s="nexus">Puesto Nexus</button>
            ${tiers ? `<button type="button" class="chip${st.sort === 'st' ? ' on' : ''}" data-s="st">SurvivorTiers</button>` : ''}
            <button type="button" class="chip${st.sort === 'dex' ? ' on' : ''}" data-s="dex">Nº</button>
          </div>
          <div class="nx-bc-cnt nx-bc-n"></div>
          <div class="nx-bc-list" role="list"></div>
        </div>
        <div class="nx-bc-right"></div>
      </div>
      <p class="nx-bc-foot"></p>`;
    box.querySelector('[data-x]').addEventListener('click', close);
    const q = box.querySelector('.nx-bc-q');
    q.addEventListener('input', () => { st.q = q.value; clearTimeout(listT); listT = setTimeout(renderList, 120); });
    box.querySelectorAll('select[data-f]').forEach((s) => s.addEventListener('change', () => { st[s.dataset.f] = s.value; save(); renderList(); }));
    box.querySelector('[data-f="own"]').addEventListener('click', (e) => { st.own = !st.own; e.currentTarget.classList.toggle('on', st.own); save(); renderList(); });
    box.querySelectorAll('[data-s]').forEach((b) => b.addEventListener('click', () => {
      st.sort = b.dataset.s; save();
      box.querySelectorAll('[data-s]').forEach((x) => x.classList.toggle('on', x === b));
      renderList();
    }));
    box.querySelector('.nx-bc-list').addEventListener('click', (e) => {
      const r = e.target.closest('.nx-bc-row');
      if (r) select(+r.dataset.dex);
    });
    const info = NX.buildModel.info();
    const foot = box.querySelector('.nx-bc-foot');
    foot.textContent = `Build Nexus: estimación con los datos del juego · ${info ? `${info.total} Pokémon${info.fromCache ? ' · guardado en este navegador' : info.ms ? ` · calculado en ${num(info.ms.busy / 1000, 1)} s` : ''}` : ''} · Alt+N › Datos para el método`;
  }

  function renderList() {
    if (!scr) return;
    const G = NX.gd, N = ns();
    const tiers = G.tiers();
    const rows = filtered();
    const list = scr.querySelector('.nx-bc-list');
    scr.querySelector('.nx-bc-n').textContent = `${rows.length} de ${NX.buildModel.all().length} Pokémon`;
    if (!rows.length) { list.innerHTML = '<div class="nx-bc-empty">Ningún Pokémon coincide con los filtros.</div>'; return; }
    list.innerHTML = rows.map((r) => {
      const p = N.DEX_BY[r.dex];
      const t = tiers && tiers.byDex.get(r.dex);
      return `<button type="button" role="listitem" class="nx-bc-row${r.dex === st.sel ? ' on' : ''}" data-dex="${r.dex}">
        <span class="rk">${st.sort === 'dex' ? pad(r.dex) : '#' + r.rank}</span>${tierBadge(r.tier, 'Tier Nexus ' + r.tier)}
        <span class="nm">${esc(G.monName(r.dex))}<small>${p.types.map(G.typeChip).join('')}</small></span>
        <span class="stb">${t ? `ST ${G.tierBadge(t)}` : ''}</span><b class="sc">${r.score}</b></button>`;
    }).join('');
    const on = list.querySelector('.nx-bc-row.on');
    if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest' });
  }

  function select(dex) {
    st.sel = dex; save();
    scr.querySelectorAll('.nx-bc-row').forEach((r) => r.classList.toggle('on', +r.dataset.dex === dex));
    scr.querySelector('.nx-bc-box').classList.add('det');
    renderDetail();
  }

  function barRow(label, pct, title) {
    return `<div class="nx-bc-bar" title="${esc(title)}"><span>${esc(label)}</span><div class="tr"><i style="width:${NX.clamp(pct, 2, 100)}%"></i></div><b>${pct}</b></div>`;
  }
  const moveChip = (G, id, hit) => { const d = G.moveDef(id); return `<span class="${hit ? 'hit' : ''}" style="background:${esc(G.typeColor(d && d.type))}" title="${esc(d ? G.tr(d.desc) : id)}">${esc(G.moveName(id))}</span>`; };

  function nexusSec(G, r, x) {
    if (!x) return '<section class="panel nx-bc-sec"><h4>Build Nexus</h4><p class="nx-bc-p">No se pudo calcular.</p></section>';
    const mv = x.moves.map((m) => `<div class="nx-bc-mv"><span class="mn" style="background:${esc(G.typeColor(m.type))}">${esc(m.name)}${m.tm ? ' <i>MT</i>' : ''}${m.evoName ? `<i>evoluciona con ${esc(m.evoName)}</i>` : ''}</span><small>${esc(m.why)}</small></div>`).join('');
    const start = x.start ? (x.startIn ? `Empieza con <b>${esc(x.startName)}</b>, que ya está en la build.` : `Su movimiento inicial es <b>${esc(x.startName)}</b>: con la mejora de inicio del Pokémon puedes empezar con uno de la build.`) : '';
    const evo = x.evoNeeds.length ? `Para evolucionar los movimientos, toma ${esc(x.evoNeeds.join(', '))} cuando estén al nivel máximo.` : '';
    const tmNote = st.tm ? (x.usedTM ? 'Incluye MT que este Pokémon puede aprender.' : 'Con sus MT la mejor build no cambia.') : '';
    return `<section class="panel nx-bc-sec"><h4><span>Build Nexus ${tierBadge(r.tier)} <small class="nx-bc-cnt">puntuación ${r.score} · puesto ${r.rank}</small></span>
        <button type="button" class="chip${st.tm ? ' on' : ''}" data-tm title="Permitir MT en la build">Con MT</button></h4>
      ${mv}
      <div class="nx-bc-bars">${barRow('Daño en grupo', r.pct.crowd, 'Percentil frente a todos los Pokémon')}${barRow('Daño a jefes', r.pct.boss, 'Percentil frente a todos los Pokémon')}${barRow('Aguante', r.pct.surv, 'Percentil frente a todos los Pokémon')}</div>
      <p class="nx-bc-p">Al final de la partida: reducción de daño ${Math.round(x.late.red * 100)} %, control ${Math.round(x.late.ctrl * 100)} %, invulnerable ${Math.round(x.late.dodge * 100)} % del tiempo, regeneración ${num(x.late.regen, 1)} PS/s.</p>
      ${[start, evo, tmNote].filter(Boolean).map((t) => `<p class="nx-bc-p">${t}</p>`).join('')}</section>`;
  }
  function tiersSec(G, dex, nexusMoves) {
    const t = G.tiers();
    if (!t) return '<section class="panel nx-bc-sec"><h4>Build SurvivorTiers</h4><p class="nx-bc-p">Sin datos de SurvivorTiers en este modo. Llegan con la edición o con Permitir scripts de usuario.</p></section>';
    const r = t.byDex.get(+dex);
    if (!r) return `<section class="panel nx-bc-sec"><h4>Build SurvivorTiers</h4><p class="nx-bc-p">SurvivorTiers no tiene a este Pokémon.</p><p class="nx-bc-p">${G.tierMetaHtml()}</p></section>`;
    const common = (r.moves || []).filter((m) => nexusMoves.includes(m)).length;
    const other = r.otherStyle && r.otherScore ? ` · ${esc(G.styleName(r.otherStyle))}: ${num(r.otherScore, 1)} s` : '';
    return `<section class="panel nx-bc-sec"><h4><span>Build SurvivorTiers ${G.tierBadge(r)} <small class="nx-bc-cnt">puesto ${r.rank} de ${t.total}</small></span></h4>
      <p class="nx-bc-p">Estilo <b>${esc(G.styleName(r.style))}</b> · mediana de supervivencia ${num(r.score, 1)} s${other}</p>
      <div class="nx-bc-chips">${(r.moves || []).map((id) => moveChip(G, id, nexusMoves.includes(id))).join('')}</div>
      <p class="nx-bc-p">En común con la Build Nexus: <b>${common} de ${(r.moves || []).length}</b> (marcados).</p>
      <p class="nx-bc-p">${G.tierMetaHtml()}</p></section>`;
  }
  function mineSec(G, dex, nexusMoves) {
    const runs = runsOf(dex);
    if (!runs.length) return '<section class="panel nx-bc-sec"><h4>Tu mejor build</h4><p class="nx-bc-p">Aún no tienes partidas guardadas con este Pokémon. El historial guarda las últimas 50.</p></section>';
    const best = runs.slice().sort((a, b) => (b.time || 0) - (a.time || 0) || (b.dps || 0) - (a.dps || 0))[0];
    let pr = null;
    try { pr = (NX.personalRank ? NX.personalRank() : []).find((x) => +x.dex === +dex) || null; } catch (_) { pr = null; }
    const nexusNames = new Set(nexusMoves.map((id) => fold(G.moveName(id))));
    const names = (best.moves || []).map((m) => {
      const nm = G.T(String(m.name || '').replace(/\s*\+$/, ''), 'move');
      const hit = nexusNames.has(fold(nm));
      return `<span class="${hit ? 'hit' : ''}" style="background:#3d67c0">${esc(String(m.name || '').endsWith('+') ? nm + ' +' : nm)}</span>`;
    }).join('');
    const d = new Date(best.at || Date.now());
    return `<section class="panel nx-bc-sec"><h4><span>Tu mejor build${pr ? ` ${tierBadge(pr.tier, 'Tu ranking personal')}` : ''}</span></h4>
      <p class="nx-bc-p">Mejor partida: <b>${NX.fmtTime(best.time)}</b> · Nv. ${best.level || 0} · ${num(best.dps)} de daño por segundo · ${num(best.kills)} bajas · ${esc(d.toLocaleDateString('es-VE'))}</p>
      ${names ? `<div class="nx-bc-chips">${names}</div><p class="nx-bc-p">Movimientos que más daño hicieron (marcados los de la Build Nexus).</p>` : ''}
      ${pr ? `<p class="nx-bc-p">${pr.runs} partida${pr.runs === 1 ? '' : 's'} con este Pokémon · mediana ${NX.fmtTime(pr.medTime)} · tu puntuación ${pr.score}.</p>` : `<p class="nx-bc-p">${runs.length} partida${runs.length === 1 ? '' : 's'} guardada${runs.length === 1 ? '' : 's'}; las de menos de 30 s no cuentan para tu ranking.</p>`}</section>`;
  }

  // Laboratorio de builds (lo aporta otro módulo; el botón solo sale si existe).
  function labApi() {
    const L = NX.buildlab;
    if (!L) return null;
    if (typeof L.open === 'function') return (cfg) => L.open(cfg);
    if (typeof L.load === 'function') return (cfg) => L.load(cfg);
    if (typeof L === 'function') return (cfg) => L(cfg);
    return null;
  }

  function renderDetail() {
    if (!scr) return;
    const right = scr.querySelector('.nx-bc-right');
    const dex = st.sel, r = NX.buildModel.get(dex);
    const N = ns(), G = NX.gd, p = N.DEX_BY[dex];
    if (!r || !p) { right.innerHTML = '<div class="nx-bc-empty">Elige un Pokémon de la lista para ver su mejor build.</div>'; return; }
    let chips = '';
    try { chips = N.UI.typeChips(p.types); } catch (_) { chips = p.types.map(G.typeChip).join(''); }
    let x = null;
    try { x = NX.buildModel.explain(dex, { tm: st.tm }); } catch (err) { NX.trip(KEY, err); }
    const nexusMoves = x ? x.moves.map((m) => m.id) : r.moves;
    const lab = labApi();
    right.innerHTML = `<button type="button" class="btn small ghost nx-bc-back" data-back>‹ Volver a la lista</button>
      <div class="nx-bc-hd"><div class="nx-bc-spr"></div>
        <div><p class="sub">Nº ${pad(dex)} · ${esc(genName(p.gen))}${owns(dex) ? '' : ' · no lo tienes'}</p><h3>${esc(G.monName(dex))}</h3><div>${chips}</div></div>
        <div class="nx-bc-sc">${tierBadge(r.tier, 'Tier Nexus').replace('nx-tier', 'nx-tier big')}<b>${r.score}</b><small>puesto ${r.rank} de ${NX.buildModel.all().length}</small></div></div>
      ${nexusSec(G, r, x)}${tiersSec(G, dex, nexusMoves)}${mineSec(G, dex, nexusMoves)}
      ${lab ? '<div class="nx-bc-act"><button type="button" class="btn gold" data-lab>Probar en laboratorio</button></div>' : ''}`;
    right.scrollTop = 0;
    const spr = right.querySelector('.nx-bc-spr');
    try { spr.appendChild(N.UI.spriteCanvas(dex, 96, 84, { lively: true, scale: 2 })); } catch (_) { /* sin sprite */ }
    right.querySelector('[data-back]').addEventListener('click', () => scr.querySelector('.nx-bc-box').classList.remove('det'));
    const tm = right.querySelector('[data-tm]');
    if (tm) tm.addEventListener('click', () => { st.tm = !st.tm; save(); renderDetail(); });
    const lb = right.querySelector('[data-lab]');
    if (lb) lb.addEventListener('click', () => {
      const fn = labApi();
      if (!fn) return;
      const M = N.Moves;
      const moves = nexusMoves.map((id) => ({ id, lvl: (M.BY_ID[id] && M.BY_ID[id].maxLvl) || 5 }));
      close();
      try { fn({ dex, moves, source: 'build-center' }); } catch (err) { NX.toast('No se pudo abrir el laboratorio: ' + err.message); }
    });
  }

  function open(dex) {
    if (!NX.isOn(KEY) || !NX.ns) return;
    build();
    const box = scr.querySelector('.nx-bc-box');
    if (dex) st.sel = +dex;
    scr.classList.remove('hidden');
    document.documentElement.classList.add('nx-bc-open');
    const BM = NX.buildModel;
    if (BM.status() !== 'ready') box.innerHTML = '<div class="nx-bc-head"><h2>Centro de builds</h2><button type="button" class="btn small ghost" data-x>Cerrar</button></div><div class="nx-bc-empty">Calculando la mejor build de cada Pokémon…</div>';
    const x = box.querySelector('[data-x]');
    if (x) x.addEventListener('click', close);
    BM.ready().then(() => {
      if (!scr || scr.classList.contains('hidden')) return;
      shell();
      renderList();
      if (!st.sel || !BM.get(st.sel)) st.sel = (BM.all()[0] || {}).dex || 0;
      renderDetail();
      if (!dex) scr.querySelector('.nx-bc-box').classList.remove('det');
      else scr.querySelector('.nx-bc-box').classList.add('det');
    }).catch((err) => {
      box.innerHTML = `<div class="nx-bc-head"><h2>Centro de builds</h2><button type="button" class="btn small ghost" data-x>Cerrar</button></div><div class="nx-bc-empty">No se pudo calcular: ${esc(err.message || err)}</div>`;
      box.querySelector('[data-x]').addEventListener('click', close);
      NX.trip(KEY, err);
    });
  }
  function close() { if (scr) scr.classList.add('hidden'); document.documentElement.classList.remove('nx-bc-open'); }
  const isOpen = () => !!scr && !scr.classList.contains('hidden');

  // ---- botones de entrada
  function icon() {
    try { const h = ns().Icons.html('fist', 18); if (h) return h; } catch (_) { /* respaldo */ }
    return '★';
  }
  function placeMenu() {
    let b = $('nexus-bc-btn');
    const anchor = document.querySelector('#scr-menu [data-go="dex"]');
    if (!NX.isOn(KEY)) { if (b) b.remove(); return; }
    if (!anchor) return;
    if (!b) {
      b = document.createElement('button');
      b.type = 'button';
      b.id = 'nexus-bc-btn';
      b.className = 'menu-item';
      b.dataset.sfx = 'confirm';
      b.innerHTML = `<span class="mi-ico" aria-hidden="true">${icon()}</span><span>Builds</span><small>La mejor build de cada Pokémon</small>`;
      b.addEventListener('click', (e) => { e.stopPropagation(); b.blur(); open(); });
    }
    if (anchor.nextElementSibling !== b) anchor.after(b);
  }
  function decorateDex() {
    const det = $('dex-detail');
    if (!det) return;
    let btn = det.querySelector('.nx-bc-dexbtn');
    const m = /(?:Nº|N°|No\.?|#)\s*(\d{1,4})/i.exec(det.textContent || '');
    const dex = m ? +m[1] : 0;
    const want = NX.isOn(KEY) && NX.store.get('bc:dexBtn', true) && dex && ns().DEX_BY[dex];
    if (!want) { if (btn) btn.remove(); return; }
    if (btn && +btn.dataset.dex === dex) return;
    if (!btn) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn small nx-bc-dexbtn';
      btn.textContent = 'Ver build';
      btn.addEventListener('click', (e) => { e.stopPropagation(); open(+btn.dataset.dex); });
      det.appendChild(btn);
    }
    btn.dataset.dex = dex;
  }

  NX.feature({
    key: KEY,
    label: 'Centro de builds',
    needs: (n) => n.DEX && n.DEX_BY && n.Moves && typeof n.Moves.instance === 'function' && typeof n.Moves.evolve === 'function' &&
      typeof n.Moves.poolFor === 'function' && n.Types && typeof n.Types.mult === 'function' && n.Stats && typeof n.Stats.taken === 'function' &&
      n.Enemies && Array.isArray(n.Enemies.TIERS) && n.Game && NX.buildModel && NX.gd && !!$('scr-menu'),
    setup(n) {
      build();
      placeMenu();
      setInterval(() => {
        try {
          placeMenu();
          if (isOpen() && (n.Game.state !== 'ui' || !NX.isOn(KEY))) close();
        } catch (err) { NX.trip(KEY, err); }
      }, 500);
      const det = $('dex-detail');
      if (det) new MutationObserver(() => { try { decorateDex(); } catch (err) { NX.trip(KEY, err); } }).observe(det, { childList: true });
      // Si ya hay un cálculo guardado para esta versión, se carga sin esperar.
      if (NX.store.get('bc:cache', null)) NX.buildModel.ready().catch(() => { /* se reintenta al abrir */ });
      NX.gd.loadGameDate();
    },
  });
  NX.keys.bind((e) => e.key === 'Escape' && isOpen(), () => { close(); return true; });

  NX.buildCenter = { open, close, isOpen };

  NX.settings.section({
    key: KEY,
    tab: 'Datos',
    title: 'Centro de builds',
    keywords: 'build builds mejor movimientos ranking tier modelo nexus survivortiers laboratorio',
    render(el) {
      el.appendChild(NX.ui.toggle('Activado', 'on:' + KEY, true, () => { placeMenu(); decorateDex(); }));
      el.appendChild(NX.ui.toggle('Botón "Ver build" en la ficha de la Pokédex', 'bc:dexBtn', true, () => decorateDex()));
      el.appendChild(NX.ui.note(NX.buildModel ? NX.buildModel.METHOD : ''));
      const info = NX.buildModel && NX.buildModel.info();
      const p = NX.ui.note(info ? `Último cálculo: ${info.total} Pokémon${info.ms ? ` en ${num(info.ms.busy / 1000, 1)} s` : ''}${info.fromCache ? ' (guardado en este navegador)' : ''}. Se recalcula solo cuando cambia la versión del juego.` : 'Se calcula al abrir el centro por primera vez y se guarda para la versión actual del juego.');
      el.appendChild(p);
      el.appendChild(NX.ui.button('Abrir centro de builds', () => { if (NX.ns && NX.ns.Game && NX.ns.Game.state === 'ui') { NX.togglePanel(); open(); } else NX.toast('Abre el centro desde el menú principal'); }));
      el.appendChild(NX.ui.button('Recalcular', () => {
        p.textContent = 'Calculando…';
        NX.buildModel.recompute().then((r) => { p.textContent = `Listo: ${r.total} Pokémon en ${num(r.ms.busy / 1000, 1)} s.`; }).catch((err) => { p.textContent = 'Error: ' + err.message; });
      }));
    },
  });
})();

// ---- features/build-helper.js
// Asistentes de la subida de nivel, sin elegir por ti:
// - Build recomendada: resalta las cartas de los movimientos que SurvivorTiers
//   recomienda para tu Pokémon y muestra cuántos llevas.
// - Evoluciones: el juego evoluciona un movimiento cuando llega a su nivel
//   máximo y ya tomaste la mejora de stat que pide (Moves.EVO). Cada carta
//   dice si completa o acerca una evolución y qué falta.
(() => {
  const KEY = 'build', EVO = 'build-evo';

  NX.css(`#cards .card.nx-build{box-shadow:0 0 0 3px #ffd23f,0 0 14px rgba(255,210,63,.55)}
#cards .card .nx-bt{display:inline-block;margin-left:6px;padding:0 6px;border-radius:7px;background:#ffd23f;color:#1b1528;font-size:11px;text-shadow:none;vertical-align:middle}
#cards .card .nx-evl{margin-top:4px;font-size:12px;line-height:1.25;color:#9fe8ff}
#cards .card .nx-evl.done{color:#7dff9a}
#cards .card.nx-evodone{outline:2px dashed #7dff9a;outline-offset:2px}
#nexus-build{margin:0 auto 8px;max-width:100%;font-size:12px;color:var(--muted,#b9cbf0);display:flex;flex-wrap:wrap;gap:4px;justify-content:center;align-items:center}
#nexus-build span.m{padding:1px 7px;border-radius:7px;color:#fff;text-shadow:1px 1px 0 #0a1430;opacity:.6}
#nexus-build span.m.own{opacity:1;box-shadow:0 0 0 2px #7dff9a}
#nexus-build .nx-tier{margin-right:2px}`);

  // ---- build recomendada en vivo
  NX.feature({
    key: KEY,
    label: 'Build recomendada en vivo',
    needs: (ns) => ns.LevelUp && ns.RunUI && ns.Moves && NX.gd,
    setup() {
      const G = NX.gd;
      if (!G.tiers()) return; // sin datos de SurvivorTiers no hay nada que resaltar
      const buildOf = (pl) => { const r = pl && G.tierOf(pl.dex || (pl.mon && pl.mon.dex)); return r && r.moves && r.moves.length ? r : null; };

      G.lvl.on(KEY, (el, o, pl, on) => {
        const r = on && NX.store.get('build:hl', true) ? buildOf(pl) : null;
        const hit = !!r && !!o.id && (o.type === 'new' || o.type === 'up' || o.type === 'evo') && r.moves.includes(o.id);
        el.classList.toggle('nx-build', hit);
        let tag = el.querySelector('.nx-bt');
        if (hit && !tag) {
          const nm = el.querySelector('.nm');
          if (nm) {
            tag = document.createElement('span');
            tag.className = 'nx-bt';
            tag.textContent = 'Build';
            tag.title = 'Movimiento de la build recomendada por SurvivorTiers';
            nm.appendChild(tag);
          }
        } else if (!hit && tag) tag.remove();
        if (o.index === 0) summary(r, pl, on);
      });

      // Línea sobre las cartas con los 4 movimientos y cuáles ya llevas.
      function summary(r, pl, on) {
        const box = document.querySelector('#scr-levelup .box');
        const cards = document.getElementById('cards');
        if (!box || !cards) return;
        let line = document.getElementById('nexus-build');
        if (!r || !on || !NX.store.get('build:summary', true)) { if (line) line.remove(); return; }
        const own = new Set((pl.moves || []).map((m) => m.id));
        const sig = r.dex + '|' + [...own].join(',');
        if (line && line.dataset.sig === sig) return;
        if (!line) {
          line = document.createElement('div');
          line.id = 'nexus-build';
          cards.insertAdjacentElement('beforebegin', line);
        }
        line.dataset.sig = sig;
        const n = r.moves.filter((id) => own.has(id)).length;
        line.innerHTML = `${G.tierBadge(r)}<span>Build ${G.esc(G.styleName(r.style))} (${n}/${r.moves.length}):</span>` +
          r.moves.map((id) => { const d = G.moveDef(id); return `<span class="m${own.has(id) ? ' own' : ''}" style="background:${G.esc(G.typeColor(d && d.type))}">${G.esc(G.moveName(id))}</span>`; }).join('') +
          (G.tierStale() ? '<span class="nx-stale">posiblemente desactualizado</span>' : '');
        line.title = 'SurvivorTiers de @fildotai' + (G.tiers().patch ? ' · parche del ' + G.tiers().patch : '');
      }
      G.loadGameDate();
    },
  });

  // ---- asistente de evoluciones
  function evoLine(G, o, pl) {
    if (!pl) return null;
    const moves = pl.moves || [];
    const lv = (n) => `${n} nivel${n > 1 ? 'es' : ''}`;
    if (o.type === 'up') {
      const m = moves.find((x) => x.id === o.id);
      if (!m || m.evolved) return null;
      const e = G.evo(m.id, pl);
      if (!e) return null;
      const after = (m.lvl || 1) + 1, left = Math.max(0, e.max - after);
      if (!left) {
        return e.have ? { done: true, text: `Completa la evolución: en la próxima subida podrás evolucionar a ${G.esc(e.name)}` }
          : { text: `Llega al máximo. Falta ${G.esc(e.needName)} para evolucionar a ${G.esc(e.name)}` };
      }
      return { text: `Evolución a ${G.esc(e.name)}: faltan ${lv(left)}${e.have ? '' : ' y ' + G.esc(e.needName)}` };
    }
    if (o.type === 'stat') {
      const parts = [];
      let done = false;
      for (const m of moves) {
        if (m.evolved) continue;
        const e = G.evo(m.id, pl);
        if (!e || e.need !== o.id || e.have) continue;
        const left = Math.max(0, e.max - (m.lvl || 1));
        if (!left) { done = true; parts.push(`completa la evolución de ${G.esc(G.T(m.name, 'move'))}`); }
        else parts.push(`acerca la evolución de ${G.esc(G.T(m.name, 'move'))} (faltan ${lv(left)})`);
      }
      return parts.length ? { done, text: G.cap(parts.join(' · ')) } : null;
    }
    if (o.type === 'new') {
      const e = G.evo(o.id, pl);
      return e ? { text: `Evoluciona a ${G.esc(e.name)} en Nv. ${e.max} con ${G.esc(e.needName)}${e.have ? ' (ya la tienes)' : ''}` } : null;
    }
    return null;
  }

  NX.feature({
    key: EVO,
    label: 'Asistente de evoluciones',
    needs: (ns) => ns.LevelUp && ns.RunUI && ns.Moves && ns.Moves.EVO && typeof ns.Moves.evoInfo === 'function' && NX.gd,
    setup() {
      const G = NX.gd;
      G.lvl.on(EVO, (el, o, pl, on) => {
        let line = el.querySelector('.nx-evl');
        const r = on ? evoLine(G, o, pl) : null;
        el.classList.toggle('nx-evodone', !!(r && r.done));
        if (!r) { if (line) line.remove(); return; }
        if (!line) {
          const txt = el.querySelector('.txt');
          if (!txt) return;
          line = document.createElement('div');
          line.className = 'nx-evl';
          txt.appendChild(line);
        }
        line.classList.toggle('done', !!r.done);
        if (line.innerHTML !== r.text) line.innerHTML = r.text;
      });
    },
  });

  NX.settings.section({
    key: KEY,
    tab: 'Datos',
    title: 'Build recomendada en vivo',
    keywords: 'build survivortiers cartas subida nivel resaltar',
    render(el) {
      if (!NX.gd || !NX.gd.tiers()) {
        el.appendChild(NX.ui.note('Activa Permitir scripts de usuario para ver los tiers.'));
        return;
      }
      el.appendChild(NX.ui.toggle('Activado', 'on:' + KEY, true, () => NX.gd.lvl.refresh()));
      el.appendChild(NX.ui.toggle('Resaltar las cartas de la build', 'build:hl', true, () => NX.gd.lvl.refresh()));
      el.appendChild(NX.ui.toggle('Resumen de la build sobre las cartas', 'build:summary', true, () => NX.gd.lvl.refresh()));
      el.appendChild(NX.ui.note('Según SurvivorTiers de @fildotai. Solo resalta: tú eliges.'));
    },
  });
  NX.settings.section({
    key: EVO,
    tab: 'Datos',
    title: 'Asistente de evoluciones',
    keywords: 'evolución movimiento cartas nivel máximo',
    render(el) {
      el.appendChild(NX.ui.toggle('Activado', 'on:' + EVO, true, () => NX.gd && NX.gd.lvl.refresh()));
      el.appendChild(NX.ui.note('Marca la carta que completa o acerca la evolución de un movimiento y dice qué falta.'));
    },
  });
})();

// ---- features/build-model.js
// Modelo "Build Nexus": la mejor build de cada Pokémon calculada con los datos
// del propio juego (Moves, Stats, Types, Enemies, DEX). No simula partidas:
// es una cuenta explicable que el Centro de builds muestra con su porqué.
// Expone NX.buildModel. Lee NX.ns y NX.gd de forma perezosa.
//
// ---- Reglas del juego que usa (leídas del código del juego)
// - 4 huecos (Player.maxMoves). Con los Lazos todos disparan a la vez; se
//   supone la build completa y enlazada.
// - Daño por golpe = dmg × At. o At. Esp. del Pokémon según la categoría
//   (Player.atkFor con Stats.fit) × 1,2 si es de tipo único y el movimiento
//   es de su tipo (MONO_K; el juego no da STAB a los de dos tipos)
//   × Types.mult contra el enemigo × Stats.taken según su Defensa o Def. Esp.
// - Niveles y evolución con Moves.instance y Moves.evolve. Evolucionar pide
//   el nivel máximo y una mejora de stat (Moves.EVO).
// - Potenciadores: Danza Espada y Danza Dragón comparten el buff de ataque
//   físico (solo cuenta el mejor), Maquinación el especial, Agilidad la
//   velocidad, Fortaleza la reducción de daño (tope 80 %) y Acua Aro la
//   regeneración. El juego no ofrece más de 2 potenciadores.
// - Recibir un golpe da 0,45 s de invulnerabilidad, las embestidas (dash)
//   0,3 s por uso y llevar un movimiento cuerpo a cuerpo reduce el daño
//   recibido un 25 %.
// - Enemigos: candidatos de cada tramo de Enemies.TIERS (rareza < 5 y total
//   base en su rango) pesados por el tiempo que dura el tramo. Jefes:
//   Enemies.BOSSES pesados por su vida.
//
// ---- Fórmula
// Dos momentos de la partida, cada uno con su puntuación:
//   Inicio (40 %): movimientos a nivel 2 sin evolucionar, enemigos y jefe de
//     los primeros 4:20 min, sin mejoras de stat.
//   Final (60 %): nivel máximo y evolucionados, enemigos de 4:20 a 15:00.
// En cada momento:
//   Golpes por segundo de cada movimiento en una multitud de densidad fija
//   según su forma (arco, línea, círculo, proyectiles con perforación y
//   rebotes, órbitas, campos con tics...; ver rates()), en multitud y contra
//   un solo objetivo grande (jefe).
//   Daño en grupo  C = Σ golpes/s × daño × buff de su categoría × eficacia
//                      media (75 %) y contra el peor tipo de horda (25 %),
//                      más quemadura y veneno.
//   Daño a jefes   B = igual con un objetivo y la eficacia contra los jefes.
//   Aguante        A = segundos que dura la vida frente al daño por golpe del
//                      momento (como mucho un golpe cada 0,45 s) × daño
//                      recibido por tipos y defensas × (1 − reducción) ×
//                      (1 − control) × (1 − invulnerabilidad) ÷ ventaja de
//                      velocidad × presión, que baja si matas más rápido de lo
//                      que llega vida enemiga y sube hasta un 60 % si el daño
//                      sale de movimientos de corto alcance (< 200 px); menos
//                      regeneración. Tope 1800 s.
//   Puntuación     0,5·ln C + 0,2·ln B + 0,3·ln A.
// Total = 0,4 × inicio + 0,6 × final. Se prueban todas las combinaciones de
// hasta 2 potenciadores con los 9 mejores ataques del Pokémon y gana la de
// mayor total. Tier por puesto con los cortes de SurvivorTiers: S 3 %, A 9 %,
// B 21 %, C 31 % y D el resto.
//
// ---- Supuestos (no están en el juego o no se pueden leer con certeza)
// Densidad de la multitud, vida enemiga que llega por segundo, cadencia de
// charcos y minas, daño de quemadura y veneno a nivel 40, recarga ×0,8 y
// reducción base de 25 % al final por mejoras de stat. No cuenta objetos,
// habilidades, naturalezas, clima ni terreno. Es una estimación para
// comparar, no una simulación.
(() => {
  const MODEL_V = 5;
  const STORE = 'bc:cache';
  const ns = () => NX.ns || {};

  const R_EN = 14;       // radio típico de un enemigo
  const R_BOSS = 30;     // radio típico de un jefe
  const IFRAME = 0.45;   // invulnerabilidad tras recibir un golpe
  const RED_CAP = 0.8, SURV_CAP = 1800;
  const W_C = 0.5, W_B = 0.2, W_A = 0.3;
  const TOPK = 9;
  const TIER_CUTS = [['S', 30], ['A', 120], ['B', 320], ['C', 620]]; // de 966, como SurvivorTiers

  // Los dos momentos de la partida.
  const STAGES = [
    { key: 'early', w: 0.4, lvl: 2, evo: false, from: 0, to: 260, rho: 1 / 6000, cap: 12, cdm: 1,
      hit: 14, flow: 150, pressure: 0.5, baseRed: 0, baseRegen: 0.5, hpBonus: 0, uptime: 0.75 },
    { key: 'late', w: 0.6, lvl: 99, evo: true, from: 260, to: 900, rho: 1 / 3500, cap: 20, cdm: 0.8,
      hit: 68, flow: 5000, pressure: 0.5, baseRed: 0.25, baseRegen: 1.5, hpBonus: 60, uptime: 0.9 },
  ];

  // ---- golpes por segundo de un movimiento en un momento dado
  function rates(f, S) {
    const RHO = S.rho, CAP = S.cap;
    const n = (a) => Math.min(CAP, Math.max(1, RHO * a));
    const circ = (r) => Math.PI * (r + R_EN) * (r + R_EN);
    const k = f.kind, cd = Math.max(0.05, (f.cd || 1) * S.cdm);
    const cnt = Math.max(1, f.count | 0);
    const strip = 2 * (f.size || 6) + 2 * R_EN;
    let c = 1, s = 1, per = true, dodge = 0;
    switch (k) {
      case 'melee': c = n(0.5 * Math.min(f.arc || 1, 2 * Math.PI) * (f.radius + R_EN) ** 2); break;
      case 'dash': c = n(f.radius * ((f.width || 34) + 2 * R_EN)); dodge = 0.3 / cd; break;
      case 'projectile': case 'homing': case 'bounce': {
        const L = (f.speed || 300) * (f.life || 1.5);
        const perP = 1 + (f.bounce | 0) + Math.min(f.pierce || 0, RHO * L * strip);
        c = Math.min(CAP * 1.5, cnt * perP * (f.homing ? 0.95 : 0.8));
        s = cnt * (f.homing ? 0.95 : cnt > 1 ? 0.75 : 0.85);
        break;
      }
      case 'cone': {
        const L = (f.speed || 300) * (f.life || 0.5);
        c = Math.min(CAP * 1.5, cnt * Math.min(1 + (f.pierce || 0), Math.max(1, RHO * L * strip)) * 0.85);
        s = cnt * 0.6;
        break;
      }
      case 'nova': {
        const L = (f.speed || 230) * (f.life || 1), x = RHO * L * strip;
        c = Math.min(CAP * 1.5, cnt * (1 - Math.exp(-x)) * (1 + Math.min(f.pierce || 0, x)));
        s = 1 + cnt * 0.06;
        break;
      }
      case 'beam': case 'charge': c = n(f.radius * ((f.width || 30) + 2 * R_EN)); break;
      case 'boomerang': c = Math.min(CAP * 1.5, cnt * n(f.radius * strip) * 1.6); s = cnt * 1.5; break;
      case 'aura': case 'stun': case 'shove': c = n(circ(f.radius)); break;
      case 'chain': {
        let t = 0;
        for (let i = 0; i < cnt; i++) t += Math.pow(0.85, i);
        const hex = f.hex ? 1 + (f.hex - 1) * 0.35 : 1;
        c = t * hex; s = hex;
        break;
      }
      case 'mine': c = cnt * n(circ(f.radius)) * 0.85; s = cnt * 0.25; break;
      case 'meteor': c = cnt * n(circ(f.radius)); s = 1 + (cnt - 1) * 0.35; break;
      case 'spin': c = cnt * n(circ(f.radius)); s = cnt; break;
      case 'quake': c = cnt * n(circ(f.radius)) * 0.6; s = Math.min(cnt, (2 * (f.radius + R_BOSS)) / 34); break;
      case 'vortex': {
        const ticks = (f.dur || 2.6) / 0.4;
        c = ticks * Math.min(CAP, Math.max(1, RHO * 1.5 * circ(f.radius)));
        s = ticks * 0.8;
        break;
      }
      case 'orbit': {
        const ring = Math.max(0.6, RHO * 2 * Math.PI * f.radius * strip) * 1.3;
        const passes = cnt * (f.speed || 2.5) / (2 * Math.PI);
        c = ring * passes; s = passes * 0.6; per = false;
        break;
      }
      case 'trail': {
        const alive = Math.min(18, ((f.dur || 3) * 120) / (0.9 * f.radius));
        c = (alive * n(circ(f.radius)) * 0.35) / 0.5; s = 0.5; per = false;
        break;
      }
      case 'turret': {
        const active = Math.min(cnt, (f.dur || 6) / cd);
        c = s = (active * 0.9) / (f.rate || 0.5); per = false;
        break;
      }
      default: break;
    }
    const cH = per ? c / cd : c, sH = per ? s / cd : s;
    // Control: enemigos frenados, aturdidos o empujados llegan menos a ti.
    let keep = 1;
    const reach = Math.min(1, cH / 6);
    if (f.slow) keep *= 1 - 0.35 * Math.min(0.8, f.slow) * reach;
    if (f.stun) keep *= 1 - 0.5 * Math.min(1, (cH * f.stun) / 12);
    if (f.knock) keep *= 1 - (k === 'shove' || f.knock >= 250 ? 0.3 * Math.min(1, f.knock / 500) : 0.05 * Math.min(1, f.knock / 150)) * reach;
    if (f.pull) keep *= 0.88;
    // Quemadura y veneno: daño fijo por tic que no escala con el ataque.
    let dotC = 0, dotS = 0;
    if (f.burn) { dotC += Math.min(CAP * 0.7, cH * 3) * 11; dotS += 11; }
    if (f.poison) { dotC += Math.min(CAP * 0.7, cH * 4) * 8 * f.poison; dotS += 16; }
    const drain = f.drain ? Math.min(6, cH * f.drain) : 0;
    // Alcance con el que dispara (como el juego) o radio en el que hace daño.
    const reachPx = k === 'melee' ? f.radius + 30 : k === 'dash' ? f.radius + 60 : k === 'spin' || k === 'shove' ? f.radius + 20
      : k === 'aura' || k === 'orbit' || k === 'trail' ? f.radius : k === 'cone' ? (f.speed || 300) * (f.life || 0.5) + 30 : 300;
    return { cH, sH, ctrl: 1 - keep, dodge: Math.min(0.85, dodge), dotC, dotS, drain, close: reachPx < 200 };
  }

  // ---- tabla de movimientos: una fila por movimiento y momento
  let MT = null;
  function moveTable() {
    const M = ns().Moves;
    if (MT && MT.n === M.ALL.length) return MT;
    const by = {};
    for (const d of M.ALL) {
      const max = d.maxLvl || 5;
      const hasEvo = !!(M.EVO && M.EVO[d.id]);
      const row = { id: d.id, kind: d.kind, type: d.type, cat: d.cat || null, evoNeed: hasEvo ? M.EVO[d.id] : null, st: [] };
      for (const S of STAGES) {
        let f = M.instance(d.id, Math.min(S.lvl, max));
        let evolved = false;
        if (S.evo && hasEvo) {
          const c = Object.assign({}, f);
          try { evolved = !!M.evolve(c); } catch (_) { evolved = false; }
          if (evolved) f = c;
        }
        const e = { f, evolved };
        if (d.kind === 'buff') e.buff = { stat: f.stat, total: (f.amount || 0) * (f.stacks || 1) * S.uptime };
        else { e.dmg = f.dmg || 0; Object.assign(e, rates(f, S)); }
        row.st.push(e);
      }
      row.buff = d.kind === 'buff';
      row.melee = d.kind === 'melee';
      by[d.id] = row;
    }
    MT = { n: M.ALL.length, by };
    return MT;
  }

  // ---- enemigos y jefes de cada momento
  let EN = null;
  function enemyTables() {
    if (EN) return EN;
    const N = ns(), E = N.Enemies, T = N.Types, St = N.Stats;
    const TYPES = Object.keys((N.U && N.U.TYPE_NAME) || T.CHART || {});
    const gi = new Map(TYPES.map((t, i) => [t, i])), G = TYPES.length;
    const cands = (tier) => {
      try { if (typeof E.candidates === 'function') return E.candidates(tier) || []; } catch (_) { /* respaldo */ }
      return N.DEX.filter((p) => p.rarity < 5 && p.bst >= tier.bst[0] && p.bst <= tier.bst[1]);
    };
    const pools = E.TIERS.map((tier) => cands(tier));
    let total = 0;
    const out = STAGES.map((S) => {
      const list = [];
      E.TIERS.forEach((tier, i) => {
        const end = i + 1 < E.TIERS.length ? E.TIERS[i + 1].from : 900;
        const dur = Math.max(0, Math.min(end, S.to) - Math.max(tier.from, S.from));
        const cs = pools[i];
        if (!dur || !cs.length) return;
        for (const p of cs) list.push({ types: p.types, mon: p, w: dur / cs.length });
      });
      total += list.length;
      const gw = new Float64Array(G);
      for (const e of list) for (const t of e.types) if (gi.has(t)) gw[gi.get(t)] += e.w / e.types.length;
      const gwSum = gw.reduce((a, b) => a + b, 0) || 1;
      const groupsMin = [];
      for (let g = 0; g < G; g++) if (gw[g] / gwSum >= 0.03) groupsMin.push(g);
      const eff = {};
      for (const t of TYPES) {
        eff[t] = {};
        for (const cat of ['physical', 'special']) {
          const g = new Float64Array(G), gs = new Float64Array(G);
          let sum = 0, ws = 0;
          for (const e of list) {
            const v = T.mult(t, e.types) * St.taken(e.mon, cat);
            sum += v * e.w; ws += e.w;
            for (const et of e.types) { const k = gi.get(et); if (k != null) { g[k] += v * e.w; gs[k] += e.w; } }
          }
          for (let k = 0; k < G; k++) g[k] = gs[k] ? g[k] / gs[k] : 1;
          eff[t][cat] = { mean: ws ? sum / ws : 1, g };
        }
      }
      const bosses = (E.BOSSES || []).filter((b) => (b.at || 0) >= S.from && (b.at || 0) < Math.max(S.to, 901))
        .map((b) => ({ mon: N.DEX_BY[b.dex], hp: b.hp || 1 })).filter((b) => b.mon);
      const bossEff = {};
      for (const t of TYPES) {
        bossEff[t] = {};
        for (const cat of ['physical', 'special']) {
          let s = 0, w = 0;
          for (const b of bosses) { s += T.mult(t, b.mon.types) * St.taken(b.mon, cat) * b.hp; w += b.hp; }
          bossEff[t][cat] = w ? s / w : 1;
        }
      }
      // Daño que recibe el jugador: cubetas por (tipo de ataque, categoría).
      const inB = new Map();
      for (const e of list) {
        const cat = typeof St.sideOf === 'function' ? St.sideOf(e.mon) : 'physical';
        const key = e.types[0] + '|' + cat;
        inB.set(key, (inB.get(key) || 0) + e.w);
      }
      const inSum = [...inB.values()].reduce((a, b) => a + b, 0) || 1;
      const incoming = [...inB.entries()].map(([k, w]) => { const [t, c] = k.split('|'); return { t, c, w: w / inSum }; });
      return { G, groupsMin, eff, bossEff, incoming, bosses: bosses.map((b) => b.mon.dex) };
    });
    EN = { TYPES, stages: out, nEnemies: total };
    return EN;
  }

  // ---- evaluación de un Pokémon
  function monCtx(mon) {
    const N = ns(), St = N.Stats, T = N.Types, en = enemyTables();
    const inMult = en.stages.map((s) => s.incoming.reduce((a, b) => a + b.w * St.taken(mon, b.c) * T.mult(b.t, mon.types), 0));
    return { mon, inMult, mono: mon.types.length === 1 ? mon.types[0] : null };
  }
  // Valores de un ataque para este Pokémon en cada momento (sin potenciadores).
  function attackVals(ctx, row) {
    const en = enemyTables();
    const cat = row.cat === 'special' ? 'special' : 'physical';
    const stab = !!ctx.mono && row.type === ctx.mono;
    const scale = (cat === 'special' ? ctx.mon.sa : ctx.mon.pa) * (stab ? 1.2 : 1);
    const st = row.st.map((e, i) => {
      const E = en.stages[i];
      const ef = (E.eff[row.type] || {})[cat] || { mean: 1, g: null };
      const dpsC = e.dmg * scale * e.cH, dpsS = e.dmg * scale * e.sH;
      const g = new Float64Array(E.G);
      for (let k = 0; k < E.G; k++) g[k] = dpsC * (ef.g ? ef.g[k] : 1);
      return { e, meanC: dpsC * ef.mean, g, boss: dpsS * ((E.bossEff[row.type] || {})[cat] || 1), effMean: ef.mean };
    });
    return { row, cat, stab, st };
  }

  function evalStage(ctx, i, atks, buffs) {
    const S = STAGES[i], E = enemyTables().stages[i];
    let patk = 0, sm = 1, red = S.baseRed, regen = S.baseRegen, spd = 1;
    for (const b of buffs) {
      const bf = b.st[i].buff, v = bf.total;
      if (bf.stat === 'patk') patk = Math.max(patk, v);
      else if (bf.stat === 'satk') sm = 1 + v;
      else if (bf.stat === 'def') red += v;
      else if (bf.stat === 'regen') regen += v;
      else if (bf.stat === 'spd') spd += v;
    }
    const pm = 1 + patk;
    red = Math.min(RED_CAP, red);
    const vec = new Float64Array(E.G);
    let mean = 0, boss = 0, dot = 0, dotB = 0, keep = 1, open = 1, drain = 0, melee = false, near = 0;
    for (const a of atks) {
      const s = a.st[i], m = a.cat === 'special' ? sm : pm;
      mean += s.meanC * m; boss += s.boss * m; dot += s.e.dotC; dotB += s.e.dotS;
      if (s.e.close) near += s.meanC * m + s.e.dotC;
      for (let k = 0; k < E.G; k++) vec[k] += s.g[k] * m;
      keep *= 1 - s.e.ctrl;
      open *= 1 - s.e.dodge;
      drain += s.e.drain;
      if (a.row.melee) melee = true;
    }
    let low = Infinity;
    for (const k of E.groupsMin) if (vec[k] < low) low = vec[k];
    if (!isFinite(low)) low = mean;
    const crowd = Math.max(1, 0.75 * mean + 0.25 * low + dot);
    const bossD = Math.max(1, boss + dotB);
    const ctrl = Math.min(0.6, 1 - keep), dodge = Math.min(0.85, 1 - open);
    const kite = Math.sqrt(NX.clamp(((ctx.mon.spd || 90) * spd) / 90, 0.6, 3));
    // Pegar de cerca obliga a dejar que los enemigos lleguen: más presión.
    const nearShare = near / Math.max(1, mean + dot);
    const press = S.pressure * NX.clamp(Math.sqrt(S.flow / crowd), 0.25, 1.5) * (1 + 0.6 * nearShare);
    const incoming = (S.hit * ctx.inMult[i] * (1 - red) * (melee ? 0.75 : 1) * press * (1 - ctrl) * (1 - dodge)) / kite / IFRAME;
    const heal = regen + Math.min(6, drain);
    const net = Math.max(incoming - heal, incoming * 0.05, 0.5);
    const surv = Math.min(SURV_CAP, ((ctx.mon.hp || 80) + S.hpBonus) / net);
    const score = W_C * Math.log(crowd) + W_B * Math.log(bossD) + W_A * Math.log(surv);
    return { score, crowd, boss: bossD, surv, pm, sm, red, regen: heal, spd, ctrl, dodge, melee, nearShare };
  }
  function evalCombo(ctx, atks, buffs) {
    const st = STAGES.map((S, i) => evalStage(ctx, i, atks, buffs));
    return { score: st.reduce((a, r, i) => a + STAGES[i].w * r.score, 0), st };
  }

  const comboCache = new Map();
  function idxCombos(nItems, k) {
    const key = nItems + ':' + k;
    if (comboCache.has(key)) return comboCache.get(key);
    const out = [], cur = [];
    const rec = (start) => {
      if (cur.length === k) { out.push(cur.slice()); return; }
      for (let i = start; i <= nItems - (k - cur.length); i++) { cur.push(i); rec(i + 1); cur.pop(); }
    };
    rec(0);
    comboCache.set(key, out);
    return out;
  }

  // Movimientos que puede conseguir: pool de cartas (normal y sus tipos), el
  // inicial y, si se pide, sus MT.
  function candidates(dex, withTM) {
    const N = ns(), M = N.Moves, mon = N.DEX_BY[dex];
    const ids = new Set();
    try { for (const id of M.poolFor(mon, true)) ids.add(id); } catch (_) { /* nada */ }
    let start = null;
    try { start = N.baseStartOf ? N.baseStartOf(dex) : M.startFor(mon); } catch (_) { start = null; }
    if (start && M.BY_ID[start]) ids.add(start);
    const tm = [];
    if (withTM) {
      try { for (const id of N.TM_OF(dex) || []) if (M.BY_ID[id] && !ids.has(id)) { ids.add(id); tm.push(id); } } catch (_) { /* nada */ }
    }
    return { ids: [...ids], start, tm };
  }

  function bestFor(dex, withTM) {
    const N = ns(), mon = N.DEX_BY[dex];
    if (!mon) return null;
    const mt = moveTable().by;
    const ctx = monCtx(mon);
    const { ids, start, tm } = candidates(dex, withTM);
    const atkAll = [], buffAll = [];
    for (const id of ids) {
      const row = mt[id];
      if (!row) continue;
      if (row.buff) buffAll.push(row); else if (row.st[1].dmg > 0) atkAll.push(attackVals(ctx, row));
    }
    // Danza Dragón y Danza Espada comparten buff: basta con la más fuerte.
    const bestP = buffAll.filter((b) => b.st[1].buff.stat === 'patk').sort((a, b) => b.st[1].buff.total - a.st[1].buff.total)[0];
    const buffs = buffAll.filter((b) => b.st[1].buff.stat !== 'patk' || b === bestP);
    // Preselección: los mejores ataques por separado, con su potenciador ideal.
    const bm = (stat, i) => { const b = buffs.find((x) => x.st[i].buff.stat === stat); return b ? 1 + b.st[i].buff.total : 1; };
    const proxy = (a) => STAGES.reduce((acc, S, i) => {
      const s = a.st[i], m = bm(a.cat === 'special' ? 'satk' : 'patk', i);
      return acc + S.w * Math.log(1 + ((s.meanC * m + s.e.dotC) * (1 + 1.5 * s.e.ctrl + 3 * s.e.dodge) + 0.3 * s.boss * m));
    }, 0);
    for (const a of atkAll) a.px = proxy(a);
    atkAll.sort((a, b) => b.px - a.px);
    const atks = atkAll.slice(0, TOPK);
    const buffSets = [[]];
    for (let i = 0; i < buffs.length; i++) { buffSets.push([buffs[i]]); for (let j = i + 1; j < buffs.length; j++) buffSets.push([buffs[i], buffs[j]]); }
    let best = null;
    for (const bs of buffSets) {
      const k = Math.min(4 - bs.length, atks.length);
      if (k < 1) continue;
      for (const ix of idxCombos(atks.length, k)) {
        const sel = ix.map((i) => atks[i]);
        const r = evalCombo(ctx, sel, bs);
        if (!best || r.score > best.r.score) best = { r, atks: sel, buffs: bs };
      }
    }
    if (!best) return null;
    return { dex, ctx, start, tm, best, pool: ids };
  }

  // ---- cálculo de todos, por tandas, con caché en memoria y en NX.store
  let state = 'idle', result = null, promise = null, lastErr = '';
  const verKey = async () => {
    let v = 'nov';
    try { const j = await (await fetch('/version.json', { cache: 'no-store' })).json(); v = (j && (j.v || j.at)) || 'nov'; } catch (_) { v = 'nov'; }
    const N = ns();
    return `${v}|${N.Moves.ALL.length}|${N.DEX.length}|m${MODEL_V}`;
  };
  function finish(rows, ms, fromCache, key) {
    rows.sort((a, b) => b.raw - a.raw);
    const N = rows.length, lo = rows[N - 1].raw, hi = rows[0].raw;
    const cuts = TIER_CUTS.map(([t, r]) => [t, Math.max(1, Math.round((r / 966) * N))]);
    const pct = (k) => {
      const s = rows.map((r) => r[k]).sort((a, b) => a - b);
      return (v) => { let a = 0, b = s.length; while (a < b) { const m = (a + b) >> 1; if (s[m] < v) a = m + 1; else b = m; } return Math.round((100 * a) / Math.max(1, s.length - 1)); };
    };
    const pc = pct('crowd'), pb = pct('boss'), ps = pct('surv');
    rows.forEach((r, i) => {
      r.rank = i + 1;
      r.score = Math.round((100 * (r.raw - lo)) / Math.max(1e-9, hi - lo));
      r.tier = (cuts.find(([, c]) => r.rank <= c) || ['D'])[0];
      r.pct = { crowd: pc(r.crowd), boss: pb(r.boss), surv: ps(r.surv) };
    });
    result = { rows, byDex: new Map(rows.map((r) => [r.dex, r])), ms, fromCache, key, total: N, at: Date.now() };
    state = 'ready';
    return result;
  }
  // Para los porcentajes de la ficha: media ponderada de los dos momentos en escala log.
  const mix = (r, k) => Math.exp(r.st.reduce((a, s, i) => a + STAGES[i].w * Math.log(Math.max(1e-6, s[k])), 0));
  function computeAll(key) {
    return new Promise((resolve, reject) => {
      const list = ns().DEX.map((p) => p.dex);
      const rows = [];
      let i = 0, busy = 0;
      const t0 = performance.now();
      try { moveTable(); enemyTables(); } catch (err) { reject(err); return; }
      const step = () => {
        const s0 = performance.now();
        try {
          while (i < list.length && performance.now() - s0 < 40) {
            const b = bestFor(list[i], false);
            if (b) {
              const r = b.best.r;
              rows.push({ dex: b.dex, raw: r.score, moves: [...b.best.atks.map((a) => a.row.id), ...b.best.buffs.map((x) => x.id)], crowd: mix(r, 'crowd'), boss: mix(r, 'boss'), surv: mix(r, 'surv') });
            }
            i++;
          }
        } catch (err) { reject(err); return; }
        busy += performance.now() - s0;
        if (i < list.length) { setTimeout(step, 0); return; }
        const out = finish(rows, { busy: Math.round(busy), wall: Math.round(performance.now() - t0) }, false, key);
        try {
          NX.store.set(STORE, { key, ms: out.ms, at: out.at, rows: rows.map((r) => [r.dex, +r.raw.toFixed(5), r.moves, +r.crowd.toFixed(1), +r.boss.toFixed(1), +r.surv.toFixed(2)]) });
        } catch (_) { /* almacenamiento lleno */ }
        resolve(out);
      };
      step();
    });
  }
  function ready(force) {
    if (state === 'ready' && result && !force) return Promise.resolve(result);
    if (promise && !force) return promise;
    state = 'running';
    promise = (async () => {
      const key = await verKey();
      const saved = !force && NX.store.get(STORE, null);
      if (saved && saved.key === key && Array.isArray(saved.rows) && saved.rows.length) {
        const rows = saved.rows.map(([dex, raw, moves, crowd, boss, surv]) => ({ dex, raw, moves, crowd, boss, surv }));
        return finish(rows, saved.ms || null, true, key);
      }
      return computeAll(key);
    })().catch((err) => { state = 'error'; lastErr = String((err && err.message) || err); promise = null; throw err; });
    return promise;
  }

  // ---- explicación de una build (para la ficha)
  const fmt = (v) => Math.round(+v || 0).toLocaleString('es-VE');
  const pctTxt = (v) => Math.round(v * 100) + ' %';
  const dec = (v, d = 2) => (+v).toFixed(d).replace('.', ',');
  function explain(dex, opts = {}) {
    const G = NX.gd;
    const b = bestFor(dex, !!opts.tm);
    if (!b) return null;
    const { r, atks, buffs } = b.best;
    const L = r.st[1], E0 = r.st[0];
    const dmgOf = (a, i) => { const s = a.st[i], rr = r.st[i]; return s.meanC * (a.cat === 'special' ? rr.sm : rr.pm) + s.e.dotC; };
    const totalL = atks.reduce((s, a) => s + dmgOf(a, 1), 0) || 1;
    const physN = atks.filter((a) => a.cat !== 'special').length, specN = atks.length - physN;
    const moves = [];
    for (const a of atks) {
      const sL = a.st[1], mult = a.cat === 'special' ? L.sm : L.pm;
      const share = dmgOf(a, 1) / totalL;
      const f = sL.e.f;
      const bits = [`${fmt(dmgOf(a, 1))} daño/s en grupo al final (${pctTxt(share)} de la build)`, `${fmt(sL.boss * mult + sL.e.dotS)}/s a jefes`, `${fmt(dmgOf(a, 0))}/s al inicio`];
      bits.push(a.cat === 'special' ? 'usa At. Esp.' : 'usa Ataque');
      if (a.stab) bits.push('tipo propio ×1,2');
      if (sL.effMean >= 1.05) bits.push(`eficaz de media (×${dec(sL.effMean)})`);
      else if (sL.effMean <= 0.95) bits.push(`poco eficaz de media (×${dec(sL.effMean)})`);
      if (sL.e.dodge > 0.05) bits.push(`invulnerable ${pctTxt(sL.e.dodge)} del tiempo`);
      if (a.row.melee) bits.push('cuerpo a cuerpo: −25 % de daño recibido');
      if (sL.e.close) bits.push('pega de cerca');
      if (f.slow) bits.push('ralentiza');
      if (f.stun) bits.push('aturde');
      if (f.knock >= 250) bits.push('empuja');
      if (f.pull) bits.push('atrae');
      if (f.burn) bits.push('quema');
      if (f.poison) bits.push('envenena');
      if (f.drain) bits.push('drena vida');
      moves.push({ id: a.row.id, kind: a.row.kind, type: a.row.type, name: G.moveName(a.row.id), share, evoNeed: sL.evolved ? a.row.evoNeed : null,
        evoName: sL.evolved && a.row.evoNeed ? G.statTitle(a.row.evoNeed) : '', why: bits.join(' · '), tm: b.tm.includes(a.row.id) });
    }
    for (const x of buffs) {
      const bf = x.st[1].buff, v = bf.total;
      let why = '';
      if (bf.stat === 'patk') why = `+${pctTxt(v)} de daño físico a ${physN} movimiento${physN === 1 ? '' : 's'}`;
      else if (bf.stat === 'satk') why = `+${pctTxt(v)} de daño especial a ${specN} movimiento${specN === 1 ? '' : 's'}`;
      else if (bf.stat === 'def') why = `reducción de daño de ${pctTxt(L.red)} al final y ${pctTxt(E0.red)} al inicio (tope 80 %)`;
      else if (bf.stat === 'regen') why = `+${dec(v, 1)} PS por segundo`;
      else if (bf.stat === 'spd') why = `+${pctTxt(v)} de velocidad para esquivar`;
      why += ' · con todas sus acumulaciones';
      moves.push({ id: x.id, kind: 'buff', type: x.type, name: G.moveName(x.id), share: 0, evoNeed: null, evoName: '', why, tm: b.tm.includes(x.id), buff: true });
    }
    const evoNeeds = [...new Set(moves.filter((m) => m.evoNeed).map((m) => m.evoName))];
    return {
      dex, moves, evoNeeds, start: b.start, startName: b.start ? G.moveName(b.start) : '',
      startIn: moves.some((m) => m.id === b.start),
      crowd: mix(r, 'crowd'), boss: mix(r, 'boss'), surv: mix(r, 'surv'), raw: r.score,
      early: { crowd: E0.crowd, surv: E0.surv }, late: { crowd: L.crowd, surv: L.surv, red: L.red, ctrl: L.ctrl, dodge: L.dodge, regen: L.regen },
      usedTM: moves.some((m) => m.tm), poolSize: b.pool.length, tmCount: b.tm.length,
    };
  }

  NX.buildModel = {
    version: MODEL_V,
    METHOD: 'Build Nexus: estimación con los datos del juego, no una simulación. Cada movimiento se valora al inicio (nivel 2) y al final (nivel máximo y evolucionado) con el ataque físico o especial del Pokémon, tipo propio ×1,2 si es de un solo tipo, y la eficacia y defensas de los enemigos y jefes de ese momento. Puntúa daño en grupo (50 %), daño a jefes (20 %) y aguante (30 %): vida, defensas, reducción, control, invulnerabilidad de las embestidas, velocidad, regeneración y lo rápido que matas. Prueba todas las combinaciones con hasta 2 potenciadores. No cuenta objetos, habilidades ni naturalezas.',
    status: () => state,
    error: () => lastErr,
    ready,
    recompute: () => { NX.store.set(STORE, null); state = 'idle'; result = null; promise = null; return ready(true); },
    get: (dex) => (result ? result.byDex.get(+dex) || null : null),
    all: () => (result ? result.rows : []),
    info: () => (result ? { ms: result.ms, fromCache: result.fromCache, total: result.total, key: result.key, enemies: EN ? EN.nEnemies : 0 } : null),
    explain,
    // Tabla de candidatos de un Pokémon, para revisar el modelo desde la consola.
    debug(dex) {
      const mon = ns().DEX_BY[dex];
      if (!mon) return null;
      const ctx = monCtx(mon), mt = moveTable().by;
      return candidates(dex, false).ids.map((id) => mt[id]).filter((row) => row && !row.buff).map((row) => {
        const a = attackVals(ctx, row);
        return { id: row.id, kind: row.kind, cat: a.cat, early: Math.round(a.st[0].meanC + a.st[0].e.dotC), late: Math.round(a.st[1].meanC + a.st[1].e.dotC), boss: Math.round(a.st[1].boss), dodge: +a.st[1].e.dodge.toFixed(2) };
      }).sort((x, y) => y.late - x.late);
    },
    tierColor: (t) => ((NX.gd && NX.gd.TIER_COL) || {})[t] || '#9aa6b5',
  };
})();

// ---- features/buildlab.js
// Laboratorio de builds: partida de práctica con el Pokémon, los movimientos
// (y su nivel), el nivel, las cartas extra y el objeto que elijas, contra un
// muñeco de prueba con contador de DPS o contra oleadas desde el minuto que
// quieras. Nada llega al guardado real:
//  - Al entrar se copia el guardado entero y mientras dura el laboratorio
//    DB.commit y DB.saveNow no escriben, y Progress (misiones y logros) no
//    cuenta nada. Ranking.runStarted/submitSolo devuelven null.
//  - "Salir del laboratorio" termina la partida sin el cierre normal del juego
//    (Game.toUI y Flow.goMenu): no se suman monedas, estadísticas ni
//    experiencia de compañero, y se devuelve la copia del guardado.
//  - Si caes (con la inmortalidad apagada) el juego cierra la partida como
//    siempre, pero el motor devuelve la copia del guardado en
//    Judgment.summary, antes de que el juego guarde, y otra vez al terminar.
//    La pantalla final muestra monedas que no se acreditan.
(() => {
  const KEY = 'lab';
  const FAR = 1e9;
  const DUMMY_DEX = 143;
  const S = (k, d) => NX.store.get('lab:' + k, d);

  let hud = null;

  function monList(ns, all) {
    const out = [];
    for (const m of ns.DEX || []) {
      if (!m || !m.dex) continue;
      if (!all && !(ns.DB.owns && ns.DB.owns(m.dex))) continue;
      out.push([String(m.dex), '#' + m.dex + ' ' + m.name]);
    }
    return out;
  }
  function movePool(ns, dex, all) {
    const M = ns.Moves;
    if (all) return M.ALL.map((m) => m.id);
    const mon = ns.DEX_BY[dex];
    const ids = new Set();
    try { const s = ns.startMoveOf && ns.startMoveOf(dex); if (s) ids.add(s); } catch (_) { /* nada */ }
    try { for (const id of M.poolFor(mon) || []) ids.add(id); } catch (_) { /* nada */ }
    // Formas evolucionadas de esos movimientos.
    for (const id of [...ids]) {
      const e = M.EVO && M.EVO[id];
      const to = e && (typeof e === 'string' ? e : e.to || e.into || e.id);
      if (to && M.BY_ID[to]) ids.add(to);
    }
    return [...ids].filter((id) => M.BY_ID[id]);
  }
  const moveName = (ns, id) => { const d = ns.Moves.BY_ID[id]; return (d && d.name) || id; };

  // ---------------------------------------------------------------- montaje
  function build(ns, p, c) {
    const M = ns.Moves;
    const picks = [];
    for (let i = 1; i <= 4; i++) {
      const id = S('m' + i, '');
      if (id && M.BY_ID[id] && !picks.some((x) => x[0] === id)) picks.push([id, Math.max(1, +S('l' + i, 1) || 1)]);
    }
    if (picks.length) {
      p.moves.length = 0;
      p.slots.length = 0;
      p.active = 0;
      for (const [id, lv] of picks) {
        p.addMove(id);
        const m = p.moves.find((x) => x.id === id);
        for (let n = 1; m && n < lv; n++) if (!M.levelUp(m)) break;
      }
      try { p.setActive(0); } catch (_) { /* nada */ }
    }
    const lvl = NX.clamp(+S('level', 1) || 1, 1, 60);
    if (lvl > 1) {
      p.level = lvl;
      p.xp = 0;
      if (typeof ns.Player.xpFor === 'function') p.xpNext = ns.Player.xpFor(lvl);
    }
    const item = S('item', '');
    if (item && ns.Items.BY[item]) { try { p.equip(item); } catch (err) { console.warn('[nexus] lab', err); } }
    const cards = NX.clamp(+S('cards', 0) || 0, 0, 30);
    for (let i = 0; i < cards; i++) { try { ns.Game.debugLevelUp(); } catch (_) { break; } }
  }

  function spawnDummy(ns, p, c) {
    try { if (ns.Sprites && ns.Sprites.preload) ns.Sprites.preload([DUMMY_DEX]); } catch (_) { /* nada */ }
    const x = p.x + 170, y = p.y;
    const e = new ns.Enemy({ dex: DUMMY_DEX, name: 'Muñeco de prueba', hp: 1e9, spd: 0, dmg: 0, xp: 0, behavior: 'chase' }, x, y, { hp: 1, dmg: 1, spd: 1 }, false);
    e.nxDummy = true;
    e.name = 'Muñeco de prueba';
    if (S('neutral', true)) e.types = []; // sin tipo: ningún movimiento es eficaz ni poco eficaz
    e.xp = 0;
    ns.EnemyMgr.add(e);
    c.dummy = e;
    c.dx = x;
    c.dy = y;
  }
  function keepDummy(ns, p, c) {
    const e = c.dummy;
    if (!e || e.dead || !ns.EnemyMgr.all().includes(e)) { spawnDummy(ns, p, c); return; }
    e.hp = e.maxHp;
    e.x = c.dx; e.y = c.dy; e.kx = 0; e.ky = 0;
  }

  // ---------------------------------------------------------------- DPS
  function resetDps(ns, p, c) {
    const t = ns.Game.st.time || 0;
    c.samples = [[t, p.dmgDealt || 0]];
    c.base = p.dmgDealt || 0;
    c.baseT = t;
    c.peak = 0;
    c.mBase = {};
    for (const m of p.moves) c.mBase[m.id] = m.dealt || 0;
  }
  function measure(ns, p, c) {
    const t = ns.Game.st.time || 0, dmg = p.dmgDealt || 0;
    const last = c.samples[c.samples.length - 1];
    if (!last || t > last[0]) c.samples.push([t, dmg]);
    while (c.samples.length > 2 && t - c.samples[0][0] > 5) c.samples.shift();
    const s0 = c.samples[0];
    const span = t - s0[0];
    const dps5 = span > 0.2 ? (dmg - s0[1]) / span : 0;
    if (span >= 4.5) c.peak = Math.max(c.peak, dps5);
    const el = Math.max(0.1, t - c.baseT);
    const total = dmg - c.base;
    const moves = p.moves.map((m) => ({ name: m.name || moveName(ns, m.id), lvl: m.lvl, d: (m.dealt || 0) - (c.mBase[m.id] || 0) }))
      .sort((a, b) => b.d - a.d);
    return { dps5, avg: total / el, total, el, moves };
  }

  NX.css(`#nexus-lab-hud{position:fixed;right:12px;top:120px;z-index:9992;min-width:210px;padding:8px 12px;border-radius:10px;
  background:rgba(12,20,44,.9);color:#fff;border:2px solid #7fe0ff;font:13px/1.35 var(--font,'Pixelify',system-ui,sans-serif);box-shadow:0 4px 0 #0a1430}
#nexus-lab-hud.hidden{display:none}
#nexus-lab-hud h4{margin:0 0 4px;font-size:14px;color:#7fe0ff}
#nexus-lab-hud .r{display:flex;justify-content:space-between;gap:10px}#nexus-lab-hud .r b{color:#ffd23f}
#nexus-lab-hud .mv{font-size:12px;opacity:.9}
#nexus-lab-hud .bt{display:flex;flex-wrap:wrap;gap:4px;margin-top:6px}
#nexus-lab-hud button{font:inherit;font-size:12px;background:#0b1838;color:#fff;border:2px solid #f4f8ff;border-radius:6px;cursor:pointer;padding:2px 8px}`);

  const fmtN = (n) => (n >= 1e6 ? (n / 1e6).toFixed(2) + ' M' : n >= 1e4 ? (n / 1e3).toFixed(1) + ' k' : String(Math.round(n)));

  function showHud(ns, c) {
    if (!hud) {
      hud = document.createElement('div');
      hud.id = 'nexus-lab-hud';
      hud.className = 'hidden';
      for (const ev of ['pointerdown', 'mousedown', 'touchstart', 'click', 'wheel']) hud.addEventListener(ev, (e) => e.stopPropagation());
      document.body.appendChild(hud);
      hud.innerHTML = '<h4>Laboratorio</h4><div class="v"></div><div class="bt"><button type="button" data-a="reset">Reiniciar DPS</button><button type="button" data-a="here">Muñeco aquí</button><button type="button" data-a="exit">Salir</button></div>';
      hud.addEventListener('click', (e) => {
        const a = e.target && e.target.dataset && e.target.dataset.a;
        const cur = NX.modes.ctx();
        if (!a || !cur || cur.key !== KEY) return;
        if (a === 'reset') resetDps(ns, cur.player, cur);
        else if (a === 'here') { const p = cur.player; cur.dx = p.x + 170; cur.dy = p.y; if (cur.dummy) keepDummy(ns, p, cur); }
        else if (a === 'exit') NX.modes.exitToMenu();
      });
      NX.draggable(hud, 'lab:hud', () => ({ x: innerWidth - 240, y: 120 }));
    }
    hud.querySelector('[data-a="here"]').hidden = !c.dummyMode;
    hud.classList.remove('hidden');
  }
  function drawHud(ns, p, c) {
    if (!hud) return;
    const r = measure(ns, p, c);
    let tele = '';
    try {
      const T = NX.telemetry && NX.isOn('tele') && NX.telemetry.current ? NX.telemetry.current() : null;
      if (T && typeof T.dps10 === 'number') tele = `<div class="r"><span>Telemetría (10 s)</span><b>${fmtN(T.dps10)}</b></div>`;
    } catch (_) { /* sin telemetría */ }
    const v = hud.querySelector('.v');
    v.innerHTML = `<div class="r"><span>DPS (5 s)</span><b>${fmtN(r.dps5)}</b></div>
      <div class="r"><span>DPS medio</span><b>${fmtN(r.avg)}</b></div>
      <div class="r"><span>Pico (5 s)</span><b>${fmtN(c.peak)}</b></div>
      <div class="r"><span>Daño total</span><b>${fmtN(r.total)}</b></div>
      <div class="r"><span>Tiempo</span><b>${NX.fmtTime(r.el)}</b></div>${tele}` +
      r.moves.slice(0, 4).map((m) => `<div class="r mv"><span>${NX.esc(m.name)} Nv. ${m.lvl || 1}</span><span>${fmtN(m.d / r.el)}/s</span></div>`).join('');
  }

  function cfg(ns) {
    const dummyMode = S('target', 'dummy') !== 'waves';
    const minute = dummyMode ? 0 : NX.clamp(+S('minute', 0) || 0, 0, 29);
    return {
      key: KEY,
      label: 'Laboratorio',
      tags: [dummyMode ? 'Muñeco de prueba' : 'Oleadas desde ' + minute + ':00'],
      sandbox: true,
      noAch: true,
      noJudge: true,
      noRift: dummyMode,
      noSpawner: dummyMode,
      immortal: !!S('immortal', true),
      partner: +S('dex', 0) || null,
      dummyMode,
      overNote: '<b>Laboratorio</b> · no se guardó ningún progreso ni recompensa',
      onStart(n, p, c) {
        build(n, p, c);
        if (minute > 0) {
          n.Game.debugTime(minute * 60);
          for (const b of n.Enemies.BOSSES) if (b.at <= minute * 60) b.at = FAR; // sin jefes atrasados de golpe
        }
        if (dummyMode) spawnDummy(n, p, c);
        resetDps(n, p, c);
        showHud(n, c);
        c.hudT = 0;
      },
      onTick(n, p, c, dt) {
        if (dummyMode) keepDummy(n, p, c);
        c.hudT += 1;
        if (c.hudT % 3 === 0) drawHud(n, p, c);
      },
      onEnd() { if (hud) hud.classList.add('hidden'); },
      pause: [
        { label: 'Reiniciar DPS', onClick(c, n) { if (c) resetDps(n, c.player, c); } },
        { label: 'Salir del laboratorio', onClick() { NX.modes.exitToMenu(); } },
      ],
    };
  }

  function render(ns, el, h) {
    h.desc(el, 'Prueba builds sin consecuencias: eliges Pokémon, movimientos, niveles y objeto, y practicas contra un muñeco con contador de DPS o contra oleadas. No se guarda progreso ni recompensas. Sal con el botón Salir del laboratorio.');
    const re = () => h.rerender();
    const all = !!S('all', false);
    const mons = monList(ns, all);
    let dex = +S('dex', 0);
    if (!mons.some(([d]) => +d === dex)) { dex = mons.length ? +mons[0][0] : 1; NX.store.set('lab:dex', dex); }
    el.appendChild(NX.ui.select('Pokémon', 'lab:dex', mons.length ? mons : [['1', '#1']], String(dex), (v) => { NX.store.set('lab:dex', +v); re(); }));
    el.appendChild(NX.ui.toggle('Mostrar todos los Pokémon', 'lab:all', false, re));
    const pool = movePool(ns, dex, !!S('allMoves', false));
    const opts = [['', 'Ninguno'], ...pool.map((id) => [id, moveName(ns, id)])];
    for (let i = 1; i <= 4; i++) {
      const id = S('m' + i, '');
      if (id && !pool.includes(id)) NX.store.set('lab:m' + i, '');
      el.appendChild(NX.ui.select('Movimiento ' + i, 'lab:m' + i, opts, '', re));
      const cur = S('m' + i, '');
      if (cur) {
        const max = (ns.Moves.BY_ID[cur] && ns.Moves.BY_ID[cur].maxLvl) || 5;
        const lv = Array.from({ length: max }, (_, k) => [String(k + 1), 'Nv. ' + (k + 1)]);
        if ((+S('l' + i, 1) || 1) > max) NX.store.set('lab:l' + i, max);
        el.appendChild(NX.ui.select('  Nivel del movimiento ' + i, 'lab:l' + i, lv, '1'));
      }
    }
    el.appendChild(NX.ui.note('Sin movimientos elegidos se usa el inicial del Pokémon.'));
    el.appendChild(NX.ui.toggle('Todos los movimientos del juego', 'lab:allMoves', false, re));
    el.appendChild(NX.ui.range('Nivel del Pokémon', 'lab:level', 1, 60, 1, 1, (v) => 'Nv. ' + v));
    el.appendChild(NX.ui.range('Cartas de mejora al empezar', 'lab:cards', 0, 30, 1, 0, (v) => String(v)));
    el.appendChild(NX.ui.select('Objeto', 'lab:item', [['', 'Ninguno'], ...ns.Items.LIST.map((it) => [it.id, it.name])], ''));
    el.appendChild(NX.ui.select('Rival', 'lab:target', [['dummy', 'Muñeco de prueba (DPS)'], ['waves', 'Oleadas']], 'dummy', re));
    if (S('target', 'dummy') === 'waves') el.appendChild(NX.ui.range('Empezar en el minuto', 'lab:minute', 0, 29, 1, 0, (v) => v + ':00'));
    else el.appendChild(NX.ui.toggle('Muñeco sin tipo (daño neutro)', 'lab:neutral', true));
    el.appendChild(NX.ui.toggle('Inmortal', 'lab:immortal', true));
    h.foot(el, 'Entrar al laboratorio', () => NX.modes.launch(cfg(ns)));
  }

  NX.feature({
    key: KEY,
    label: 'Laboratorio de builds',
    needs: (ns) => !!NX.modes && ns.Moves && ns.Moves.BY_ID && typeof ns.Moves.levelUp === 'function' && typeof ns.Moves.poolFor === 'function' &&
      ns.Items && ns.Items.BY && Array.isArray(ns.DEX) && typeof ns.Enemy === 'function' && typeof ns.Game.toUI === 'function' &&
      typeof ns.Game.debugTime === 'function' && typeof ns.Game.debugLevelUp === 'function' && ns.Flow && typeof ns.Flow.goMenu === 'function',
    setup(ns) {
      NX.modes.register({ key: KEY, title: 'Laboratorio', order: 5, render: (el, h) => render(ns, el, h) });
      // Lo usa el Centro de builds: carga una build en el laboratorio y abre su pestaña.
      // cfg = { dex, moves: [{ id, lvl }], source }
      NX.buildlab = {
        open(cfg) {
          if (!cfg || !cfg.dex) return false;
          NX.store.set('lab:dex', +cfg.dex);
          if (!(ns.DB.owns && ns.DB.owns(+cfg.dex))) NX.store.set('lab:all', true);
          const moves = (cfg.moves || []).filter((m) => m && ns.Moves.BY_ID[m.id]).slice(0, 4);
          if (moves.some((m) => !movePool(ns, +cfg.dex, false).includes(m.id))) NX.store.set('lab:allMoves', true);
          for (let i = 1; i <= 4; i++) {
            const m = moves[i - 1];
            NX.store.set('lab:m' + i, m ? m.id : '');
            NX.store.set('lab:l' + i, m ? Math.max(1, +m.lvl || 1) : 1);
          }
          NX.modes.open(KEY);
          return true;
        },
      };
    },
  });

  NX.settings.section({
    key: KEY,
    tab: 'Modos',
    title: 'Laboratorio de builds',
    keywords: 'laboratorio build dps muñeco práctica prueba',
    render(el) {
      el.appendChild(NX.ui.toggle('Activado', 'on:' + KEY, true));
      el.appendChild(NX.ui.note('Se entra desde Modos Nexus en el menú principal. No guarda progreso ni recompensas.'));
      el.appendChild(NX.ui.button('Recolocar el contador de DPS', () => { NX.store.set('pos:lab:hud', null); if (hud) { hud.style.left = (innerWidth - 240) + 'px'; hud.style.top = '120px'; } }));
    },
  });
})();

// ---- features/clean-capture.js
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

// ---- features/collection.js
// Checklist de colección: Pokémon, shinies y logros que faltan, agrupados por
// región (los logros, por categoría), con su progreso y cómo se consiguen
// según los datos del propio juego (probabilidades del gacha, garantía de
// legendaria, Amuleto Iris, banner de evento y descripción de cada logro).
// Solo lee el guardado; no cambia nada.
(() => {
  const KEY = 'coll';
  const ns = () => NX.ns;
  const $ = (id) => document.getElementById(id);
  const T = (s) => { try { return typeof ns().T === 'function' ? ns().T(s) : s; } catch (_) { return s; } };
  const icon = (name, px) => { try { return ns().Icons.html(name, px); } catch (_) { return ''; } };
  const fmt = (n) => (+n || 0).toLocaleString((ns().I18n && ns().I18n.locale) || 'es');
  const pct = (x) => (x >= 0.1 ? x.toFixed(1) : x >= 0.01 ? x.toFixed(2) : x.toFixed(3)).replace('.', ',') + ' %';
  const pad = (n) => String(n).padStart(3, '0');
  const fold = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  let el = null, tab = NX.store.get('coll:tab', 'mon'), query = '', showDone = false;
  const openGroups = new Set(NX.store.get('coll:open', []));

  const bar = (have, total) => `<div class="bar"><i style="width:${total ? Math.round((have / total) * 100) : 0}%"></i></div>`;
  const hasShiny = (dex) => { try { return ns().Sprites.hasShiny(dex); } catch (_) { return false; } };

  // Probabilidad de que una tirada del banner gen dé justo este Pokémon.
  function pullChance(p, gen) {
    const { Gacha } = ns();
    const rate = (Gacha.RATES.find((r) => r[0] === p.rarity) || [0, 0])[1];
    let n = 0;
    try { n = Gacha.pool(p.rarity, gen).length; } catch (_) { n = 0; }
    return n ? rate / n : 0;
  }

  function regions() {
    const { Gacha, MenuUI } = ns();
    return Gacha.BANNERS.map((b) => ({ gen: b.gen, name: T(b.name || (MenuUI.GEN_NAMES || [])[b.gen - 1]) }));
  }

  function monHow(p, sv) {
    const { Gacha } = ns();
    const reg = regions().find((r) => r.gen === p.gen);
    const parts = [`Gacha de ${NX.esc(reg ? reg.name : 'su región')}: ${pct(pullChance(p, p.gen))} por tirada`];
    if (p.rarity === 5) {
      const left = (Gacha.PITY_5 || 70) - ((sv.pity || {})[p.gen] || 0);
      parts.push(`legendaria garantizada en ${left} tiradas`);
    }
    if (p.starter) parts.push('también puede ser tu inicial');
    if (Gacha.SPOOKY && Gacha.isOpen(Gacha.SPOOKY.gen) && p.types.includes('ghost')) parts.push(`o en ${NX.esc(T(Gacha.SPOOKY.name))}`);
    return parts.join(' · ');
  }

  function group(id, title, have, total, body, extra) {
    const open = openGroups.has(id) || !!query;
    return `<details class="nx-coll-g" data-g="${NX.esc(id)}"${open ? ' open' : ''}><summary><b>${title}</b>
      <span class="nx-coll-n">${fmt(have)} / ${fmt(total)}</span>${bar(have, total)}</summary>
      ${extra ? `<p class="note" style="margin:4px 0 6px">${extra}</p>` : ''}${body || '<p class="note" style="margin:4px 0">Nada pendiente aquí.</p>'}</details>`;
  }

  function renderMon(sv, shiny) {
    const { DEX, Gacha } = ns();
    const owned = shiny ? sv.shiny || {} : sv.owned || {};
    const q = fold(query);
    let allHave = 0, allTotal = 0, html = '';
    for (const r of regions()) {
      const pool = DEX.filter((p) => p.gen === r.gen && (!shiny || hasShiny(p.dex)));
      const have = pool.filter((p) => owned[p.dex]).length;
      allHave += have;
      allTotal += pool.length;
      const list = pool.filter((p) => (showDone || !owned[p.dex]) && (!q || fold(p.name).includes(q) || pad(p.dex).includes(q)))
        .sort((a, b) => b.rarity - a.rarity || a.dex - b.dex);
      if (q && !list.length) continue;
      const rows = list.map((p) => `<div class="nx-coll-i${owned[p.dex] ? ' done' : ''}"><span class="nx-coll-no">#${pad(p.dex)}</span>
        <b>${shiny ? icon('shiny', 10) + ' ' : ''}${NX.esc(p.name)}</b> <small style="color:${Gacha.RARITY_COLOR[p.rarity]}">${NX.esc(Gacha.RARITY_NAME[p.rarity] || '')}</small>
        ${owned[p.dex] ? '<small class="gold">conseguido</small>' : shiny ? '' : `<small>${monHow(p, sv)}</small>`}</div>`).join('');
      let extra = '';
      if (shiny) {
        let rate = 0.01;
        try { rate = Gacha.shinyRate(sv, r.gen); } catch (_) { rate = Gacha.SHINY_RATE || 0.01; }
        extra = `En el gacha de ${NX.esc(r.name)} cada Pokémon sale shiny con ${pct(rate * 100)}` +
          (rate < 0.02 ? ' (2 % con el Amuleto Iris, que se gana al completar la región)' : '') +
          '; si ya tienes ese shiny, el juego lo cambia por uno que te falte. También aparecen shinies en partida.';
      }
      html += group((shiny ? 's' : 'm') + r.gen, NX.esc(r.name), have, pool.length, rows, extra);
    }
    const head = `<div class="nx-coll-sum"><b>${shiny ? 'Shinies' : 'Pokémon'}</b> ${fmt(allHave)} / ${fmt(allTotal)}${bar(allHave, allTotal)}</div>`;
    return head + (html || '<p class="note">Ningún resultado.</p>');
  }

  function renderAch(sv) {
    const { AchDefs, Progress } = ns();
    const done = sv.ach || {};
    const q = fold(query);
    const list = AchDefs.LIST;
    const allHave = list.filter((a) => done[a.id]).length;
    let html = '';
    for (const [cat, catName] of AchDefs.CATS) {
      const items = list.filter((a) => a.cat === cat);
      const have = items.filter((a) => done[a.id]).length;
      const shown = items.filter((a) => (showDone || !done[a.id]) && (!q || fold(T(a.name) + ' ' + T(a.desc)).includes(q)));
      if (q && !shown.length) continue;
      const rows = shown.map((a) => {
        let v = 0;
        try { v = Math.max(0, +a.value(sv) || 0); } catch (_) { v = 0; }
        const ok = !!done[a.id];
        let rw = '';
        try { rw = Progress.rewardText(a.reward || {}); } catch (_) { rw = ''; }
        return `<div class="nx-coll-i ach${ok ? ' done' : ''}"><div><b>${NX.esc(T(a.name))}</b>${a.title ? ` <small class="gold">título: ${NX.esc(T(a.title))}</small>` : ''}
          <small>${NX.esc(T(a.desc))}</small>${ok ? '' : `${bar(Math.min(v, a.goal), a.goal)}<small>${fmt(Math.min(v, a.goal))} / ${fmt(a.goal)}</small>`}</div>
          <span class="a-rw">${ok ? '<small class="gold">conseguido</small>' : rw}</span></div>`;
      }).join('');
      html += group('a' + cat, NX.esc(T(catName)), have, items.length, rows);
    }
    const head = `<div class="nx-coll-sum"><b>Logros</b> ${fmt(allHave)} / ${fmt(list.length)}${bar(allHave, list.length)}</div>`;
    return head + (html || '<p class="note">Ningún resultado.</p>');
  }

  function render() {
    if (!el) return;
    const body = el.querySelector('.nx-coll-body');
    const sv = ns().DB && ns().DB.save;
    el.querySelectorAll('.tab').forEach((t) => t.classList.toggle('on', t.dataset.tab === tab));
    if (!sv) { body.innerHTML = '<p class="note">Inicia sesión o juega como invitado para ver tu colección.</p>'; return; }
    const top = body.scrollTop;
    try {
      body.innerHTML = tab === 'ach' ? renderAch(sv) : renderMon(sv, tab === 'shiny');
    } catch (err) {
      body.innerHTML = '<p class="note">No se pudo armar la lista: el juego cambió.</p>';
      NX.trip(KEY, err);
    }
    body.scrollTop = top;
  }

  const onKey = (e) => { if (e.key === 'Escape' && el) { e.preventDefault(); e.stopImmediatePropagation(); close(); } };
  function close() { if (el) { el.remove(); el = null; removeEventListener('keydown', onKey, true); } }
  function open() {
    if (!NX.ns || !NX.isOn(KEY)) return;
    close();
    el = document.createElement('section');
    el.className = 'scr dim nx-coll';
    el.style.zIndex = 60;
    el.innerHTML = `<div class="box wide">
      <div class="row between"><h2>Checklist de colección</h2><button class="btn small ghost" data-close type="button">Cerrar</button></div>
      <div class="tabs"><div class="tab" data-tab="mon">Pokémon</div><div class="tab" data-tab="shiny">${icon('shiny', 12)} Shiny</div><div class="tab" data-tab="ach">Logros</div></div>
      <div class="row" style="gap:10px;margin-bottom:8px"><input class="field nx-coll-q" type="search" placeholder="Buscar por nombre o número" style="flex:1;min-width:160px;width:auto">
      <label class="nx-coll-done"><input type="checkbox"> Mostrar conseguidos</label></div>
      <div class="goals-body nx-coll-body"></div></div>`;
    el.addEventListener('click', (e) => {
      if (e.target === el || e.target.closest('[data-close]')) { close(); return; }
      const t = e.target.closest('.tab[data-tab]');
      if (t) { tab = t.dataset.tab; NX.store.set('coll:tab', tab); el.querySelector('.nx-coll-body').scrollTop = 0; render(); }
    });
    el.addEventListener('toggle', (e) => {
      const g = e.target.closest && e.target.closest('details[data-g]');
      if (!g || query) return;
      if (g.open) openGroups.add(g.dataset.g); else openGroups.delete(g.dataset.g);
      NX.store.set('coll:open', [...openGroups]);
    }, true);
    const q = el.querySelector('.nx-coll-q');
    q.value = query;
    let qt = 0;
    q.addEventListener('keydown', (e) => { if (e.key !== 'Escape') e.stopPropagation(); });
    q.addEventListener('input', () => { clearTimeout(qt); qt = setTimeout(() => { query = q.value.trim(); render(); }, 150); });
    const cb = el.querySelector('.nx-coll-done input');
    cb.checked = showDone;
    cb.addEventListener('change', () => { showDone = cb.checked; render(); });
    addEventListener('keydown', onKey, true);
    document.body.appendChild(el);
    render();
  }

  // Botón "Checklist" en la cabecera de Pokémon y de Misiones.
  function addButton(scrId) {
    const scr = $(scrId);
    const back = scr && scr.querySelector('.row.between [data-back]');
    if (!back || scr.querySelector('.nx-coll-btn')) return;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn small nx-coll-btn';
    b.textContent = 'Checklist';
    b.title = 'Lo que te falta: Pokémon, shinies y logros';
    b.addEventListener('click', open);
    const wrap = document.createElement('div');
    wrap.className = 'row';
    wrap.style.gap = '8px';
    back.replaceWith(wrap);
    wrap.append(b, back);
  }

  NX.css(`.nx-coll .box{width:min(900px,100%)}
.nx-coll .tab{cursor:pointer}
.nx-coll-done{display:flex;align-items:center;gap:6px;margin:0;cursor:pointer}
.nx-coll-done input{width:16px;height:16px;margin:0;accent-color:#ffd23f}
.nx-coll .bar{height:7px;background:rgba(0,0,0,.4);border-radius:6px;overflow:hidden;margin:4px 0 2px}
.nx-coll .bar i{display:block;height:100%;background:var(--gold,#ffd23f)}
.nx-coll-sum{margin:2px 0 10px;font-size:15px}
.nx-coll-g{margin-bottom:6px;padding:8px 12px;border-radius:8px;background:rgba(0,0,0,.22);border:2px solid rgba(244,248,255,.14)}
.nx-coll-g summary{cursor:pointer;display:grid;grid-template-columns:1fr auto;gap:2px 10px;align-items:center}
.nx-coll-g summary .bar{grid-column:1/-1}
.nx-coll-n{font-variant-numeric:tabular-nums;color:var(--muted)}
.nx-coll-i{padding:5px 2px;border-top:1px solid rgba(255,255,255,.08);font-size:14px}
.nx-coll-i small{color:var(--muted);font-size:12px;margin-left:4px}
.nx-coll-i.done{opacity:.6}
.nx-coll-i.ach{display:grid;grid-template-columns:1fr auto;gap:10px;align-items:center}
.nx-coll-i.ach small{display:block;margin-left:0}
.nx-coll-no{color:var(--muted);font-size:12px;margin-right:4px;font-variant-numeric:tabular-nums}
.nx-coll-btn.nx-off{display:none}`);

  NX.feature({
    key: KEY,
    label: 'Checklist de colección',
    needs: (n) => n.DEX && n.DB && n.Gacha && Array.isArray(n.Gacha.BANNERS) && Array.isArray(n.Gacha.RATES) &&
      n.AchDefs && Array.isArray(n.AchDefs.LIST) && Array.isArray(n.AchDefs.CATS) && n.Sprites && !!$('scr-dex'),
    setup() {
      addButton('scr-dex');
      addButton('scr-goals');
      setInterval(() => {
        const on = NX.isOn(KEY);
        document.querySelectorAll('.nx-coll-btn').forEach((b) => b.classList.toggle('nx-off', !on));
        if (!on) close();
      }, 1000);
    },
  });

  NX.settings.section({
    key: KEY,
    tab: 'Menús',
    title: 'Checklist de colección',
    keywords: 'colección faltan pokémon shiny logros región progreso checklist',
    render(sec) {
      sec.appendChild(NX.ui.toggle('Activado', 'on:' + KEY, true));
      sec.appendChild(NX.ui.note('Botón "Checklist" en Pokémon y en Misiones: lo que te falta por región, con progreso y cómo conseguirlo.'));
      sec.appendChild(NX.ui.button('Abrir checklist', () => { if (NX.ns) { NX.togglePanel(); open(); } }));
    },
  });
})();

// ---- features/colorblind.js
// Modo daltónico: corrección de color (daltonización) con un filtro SVG
// feColorMatrix aplicado por CSS al canvas del juego o a toda la página. Lo
// que un tipo de daltonismo no distingue se mueve a colores que sí ve. Las
// matrices de simulación son las de Machado et al. (2009) a severidad total.
// Matrices y reparto adaptados de PokeSurvivor Plus (MIT).
(() => {
  const KEY = 'colorblind';
  const SIM = {
    protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
    deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]],
    tritan: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.303900]],
  };
  // Cómo se reparte lo perdido: en rojo y verde, los rojos se aclaran y los
  // verdes se oscurecen (con un empuje hacia el azul); en azul y amarillo,
  // la diferencia pasa a rojo y verde.
  const SHIFT = {
    protan: [[0, 0, 0], [1.2, 1.2, 0], [1.2, 0, 1.2]],
    deutan: [[0, 0, 0], [1.68, 1.4, 0], [1.12, 0, 1.4]],
    tritan: [[1.4, 0, 0], [0, 1.4, 1.68], [0, 0, 0]],
  };
  const I = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  function matrix(mode, k) {
    const S = SIM[mode], E = SHIFT[mode];
    const D = I.map((r, i) => r.map((v, j) => v - S[i][j]));
    const M = I.map((r, i) => r.map((v, j) => v + E[i].reduce((n, e, t) => n + e * D[t][j], 0)));
    return I.map((r, i) => r.map((v, j) => v + k * (M[i][j] - v)));
  }

  NX.css(`html.nx-cb-game #game{filter:url(#nexus-cb)}
html.nx-cb-page{filter:url(#nexus-cb)}`);

  let sig = '';
  function apply() {
    if (!document.body) { NX.onReady(apply); return; }
    const root = document.documentElement;
    const mode = NX.store.get('cb:mode', 'off');
    const on = NX.isOn(KEY) && !!SIM[mode];
    sig = [on, mode, NX.store.get('cb:k', 1), NX.store.get('cb:scope', 'game')].join('|');
    root.classList.remove('nx-cb-game', 'nx-cb-page');
    if (!on) return;
    let svg = document.getElementById('nexus-cb-svg');
    if (!svg) {
      svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.id = 'nexus-cb-svg';
      svg.setAttribute('aria-hidden', 'true');
      svg.setAttribute('style', 'position:absolute;width:0;height:0;overflow:hidden');
      svg.innerHTML = '<filter id="nexus-cb" color-interpolation-filters="sRGB"><feColorMatrix type="matrix"/></filter>';
      document.body.appendChild(svg);
    }
    const k = NX.clamp(+NX.store.get('cb:k', 1) || 0, 0, 1.5);
    const m = matrix(mode, k);
    svg.querySelector('feColorMatrix').setAttribute('values',
      m.map((r) => r.map((v) => v.toFixed(4)).join(' ') + ' 0 0').join(' ') + ' 0 0 0 1 0');
    root.classList.add(NX.store.get('cb:scope', 'game') === 'page' ? 'nx-cb-page' : 'nx-cb-game');
  }

  NX.feature({
    key: KEY,
    label: 'Modo daltónico',
    early: true,
    setup() {
      NX.onReady(apply);
      // Por si el ajuste cambia desde otra pestaña o desde otro módulo.
      setInterval(() => {
        const now = [NX.isOn(KEY) && !!SIM[NX.store.get('cb:mode', 'off')], NX.store.get('cb:mode', 'off'), NX.store.get('cb:k', 1), NX.store.get('cb:scope', 'game')].join('|');
        if (now !== sig) apply();
      }, 1000);
    },
  });

  NX.settings.section({
    key: KEY,
    title: 'Modo daltónico',
    tab: 'General',
    keywords: 'daltonismo color protanopia deuteranopia tritanopia accesibilidad',
    render(el) {
      el.appendChild(NX.ui.toggle('Activado', 'on:' + KEY, true, apply));
      el.appendChild(NX.ui.select('Tipo', 'cb:mode', [['off', 'Ninguno'], ['protan', 'Protanopia (rojo)'], ['deutan', 'Deuteranopia (verde)'], ['tritan', 'Tritanopia (azul)']], 'off', apply));
      el.appendChild(NX.ui.range('Intensidad', 'cb:k', 0, 1.5, 0.1, 1, (v) => Math.round(v * 100) + ' %', apply));
      el.appendChild(NX.ui.select('Aplicar a', 'cb:scope', [['game', 'Solo el juego'], ['page', 'Toda la página']], 'game', apply));
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
              // Justo debajo del panel de reloj cuando está a la vista (crece con la escala del HUD).
              const clk = document.getElementById('nexus-clock');
              const top = clk && clk.offsetParent !== null ? Math.round(clk.getBoundingClientRect().bottom + 4) + 'px' : '';
              if (pill.style.top !== top) pill.style.top = top;
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

// ---- features/daily.js
// Desafío diario: la fecha local es la semilla. Cada día sortea el Pokémon
// inicial (entre los iniciales del juego), dos o tres modificadores y el mapa.
// Guarda el récord personal de cada día y muestra el historial reciente.
(() => {
  const KEY = 'daily';
  const REC_KEY = 'daily:rec';
  const KEEP_DAYS = 30;

  const dayKey = (d = new Date()) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  // FNV-1a y mulberry32: mismo día, mismo sorteo.
  const hash = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; };
  const rng = (seed) => () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  // Cada entrada fija un modificador; nunca dos del mismo tipo.
  const POOL = [
    ['density', 1.5], ['density', 2], ['taken', 1.5], ['taken', 2], ['dealt', 0.75], ['dealt', 1.25],
    ['speed', 1.25], ['speed', 1.5], ['noHeal', true], ['chaos', true],
  ];

  function roll(ns, key) {
    const r = rng(hash('nexus-daily:' + key));
    const starters = (ns.STARTERS || []).map((s) => s.dex).filter((d) => ns.DEX_BY && ns.DEX_BY[d]);
    const dex = starters.length ? starters[Math.floor(r() * starters.length)] : 1;
    const n = 2 + (r() < 0.4 ? 1 : 0);
    const mods = { density: 1, taken: 1, dealt: 1, speed: 1, noHeal: false, chaos: false };
    const used = new Set();
    for (let guard = 0; used.size < n && guard < 50; guard++) {
      const [k, v] = POOL[Math.floor(r() * POOL.length)];
      if (used.has(k)) continue;
      used.add(k);
      mods[k] = v;
    }
    return { key, dex, mods, seed: Math.floor(r() * 1e6) };
  }

  const loadRec = () => { const r = NX.store.get(REC_KEY, {}); return r && typeof r === 'object' ? r : {}; };

  function record(key, info, d) {
    const r = loadRec();
    const e = r[key] || { tries: 0 };
    e.tries = (e.tries || 0) + 1;
    e.dex = d.dex;
    const beat = !e.time || info.time > e.time;
    if (beat) { e.time = Math.floor(info.time); e.level = info.level; e.kills = info.kills; e.at = Date.now(); }
    r[key] = e;
    const keys = Object.keys(r).sort().reverse();
    for (const k of keys.slice(KEEP_DAYS)) delete r[k];
    NX.store.set(REC_KEY, r);
    return beat;
  }

  function cfg(ns, d) {
    return {
      key: KEY,
      label: 'Desafío ' + d.key.slice(8) + '/' + d.key.slice(5, 7),
      partner: d.dex,
      worldSeed: d.seed,
      mods: d.mods,
      onStart(n, p, c) { c.best = (loadRec()[d.key] || {}).time || 0; },
      pillExtra: (n, c) => (c.best ? 'Récord del día ' + NX.fmtTime(c.best) : ''),
      onEnd(n, p, c, info) {
        if (info.how === 'replaced' || info.time < 5) return '';
        const beat = record(d.key, info, d);
        return `<b>Desafío diario ${NX.esc(d.key)}</b> · fuera del ranking` + (beat ? '<br><b style="color:#ffe27a">Nuevo récord del día</b>' : '');
      },
    };
  }

  NX.feature({
    key: KEY,
    label: 'Desafío diario',
    needs: (ns) => !!NX.modes && Array.isArray(ns.STARTERS) && ns.DEX_BY && ns.World && typeof ns.World.reset === 'function',
    setup(ns) {
      NX.modes.register({
        key: KEY,
        title: 'Desafío diario',
        order: 4,
        render(el, h) {
          const d = roll(ns, dayKey());
          const tags = NX.modsApi ? NX.modsApi.tags(d.mods) : [];
          h.desc(el, 'Cada día, un Pokémon, unas reglas y un mapa iguales para todo el día. Supera tu récord. Fuera del ranking del juego.');
          const r = loadRec(), today = r[d.key] || {};
          h.cards(el, [
            ['Hoy', d.key.split('-').reverse().join('/')],
            ['Pokémon', NX.modes.dexName(d.dex)],
            ['Reglas', tags.join(' · ') || 'Sin modificadores'],
            ['Tu récord de hoy', today.time ? NX.fmtTime(today.time) + ' · Nv. ' + today.level + ' · ' + today.tries + ' intento' + (today.tries > 1 ? 's' : '') : '·'],
          ]);
          if (!NX.isOn('mods')) el.appendChild(NX.ui.note('Los modificadores están apagados: el desafío usa solo el Pokémon y el mapa del día.'));
          const days = [];
          for (let i = 1; i <= 7; i++) { const x = new Date(); x.setDate(x.getDate() - i); days.push(dayKey(x)); }
          const rows = days.map((k) => { const e = r[k]; if (!e) return null; return [k.split('-').reverse().slice(0, 2).join('/'), NX.modes.dexName(e.dex), NX.fmtTime(e.time || 0), 'Nv. ' + (e.level || 1), String(e.tries || 1)]; }).filter(Boolean);
          el.appendChild(NX.ui.note('Últimos 7 días'));
          h.table(el, ['Día', 'Pokémon', 'Récord', 'Nivel', 'Intentos'], rows, 'Sin desafíos jugados en los últimos días.');
          h.foot(el, 'Jugar el desafío', () => {
            const c = cfg(ns, d);
            if (!NX.isOn('mods')) c.mods = null;
            NX.modes.launch(c);
          });
        },
      });
    },
  });

  NX.settings.section({
    key: KEY,
    tab: 'Modos',
    title: 'Desafío diario',
    keywords: 'desafío diario semilla fecha récord historial',
    render(el) {
      el.appendChild(NX.ui.toggle('Activado', 'on:' + KEY, true));
      const r = loadRec(), today = r[dayKey()];
      el.appendChild(NX.ui.note(today && today.time ? `Récord de hoy: ${NX.fmtTime(today.time)} (${today.tries} intento${today.tries > 1 ? 's' : ''}).` : 'Todavía no has jugado el desafío de hoy.'));
      el.appendChild(NX.ui.button('Borrar historial', () => { NX.store.set(REC_KEY, {}); NX.toast('Historial del desafío diario borrado'); }));
    },
  });
})();

// ---- features/damage-meter.js
// Medidor de daño: mantén Tab en partida para ver el daño total, el DPS y el
// desglose por movimiento del jugador local. Puede quedarse fijo y arrastrable.
// Lee todo de NX.telemetry (telemetry.js), que se evalúa después de este
// archivo, así que se accede a él solo dentro de needs y setup.
// Estilo del panel adaptado de PokeSurvivor Plus (MIT).
(() => {
  const KEY = 'meter';
  const MAX_ROWS = 8;
  let el = null, body = null, held = false, lastHtml = '';

  NX.css(`#nexus-meter{position:fixed;z-index:9997;width:260px;box-sizing:border-box;padding:6px 8px 8px;color:#fff;
  font:13px/1.25 var(--font,'Pixelify',system-ui,sans-serif);background:linear-gradient(#2c519f,#1a3170);border:2px solid #f4f8ff;
  outline:2px solid #0b1838;border-radius:8px;box-shadow:inset 0 0 0 2px #5b83d6,0 4px 0 #0a1430;user-select:none;pointer-events:none}
#nexus-meter.nx-pin{pointer-events:auto}
#nexus-meter.hidden{display:none}
#nexus-meter .nx-mh{display:flex;justify-content:space-between;align-items:baseline;font-weight:700;letter-spacing:.05em}
#nexus-meter .nx-mh b{color:#ffd23f}#nexus-meter .nx-mh span{color:#b9cbf0;font-weight:600}
#nexus-meter .nx-mt{display:grid;grid-template-columns:repeat(3,1fr);gap:4px;margin:5px 0}
#nexus-meter .nx-mt div{background:#0b1838;border-radius:5px;padding:3px 5px}
#nexus-meter .nx-mt small{display:block;font-size:10.5px;color:#b9cbf0}
#nexus-meter .nx-mt b{font-size:14px}
#nexus-meter .nx-mr{position:relative;margin:2px 0;padding:2px 6px;border-radius:4px;background:#0b1838;overflow:hidden}
#nexus-meter .nx-mr i{position:absolute;inset:0 auto 0 0;background:#ffd23f;opacity:.28}
#nexus-meter .nx-mr p{position:relative;margin:0;display:flex;gap:6px;font-size:12px}
#nexus-meter .nx-mr p span:first-child{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#nexus-meter .nx-mr p span:last-child{min-width:34px;text-align:right;color:#b9cbf0}
#nexus-meter .nx-mf{margin-top:5px;font-size:11.5px;color:#b9cbf0;display:flex;justify-content:space-between}
#nexus-meter .nx-me{font-size:12px;color:#b9cbf0;padding:4px 0}`);

  const fmt = (n) => {
    n = +n || 0;
    if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e4) return (n / 1e3).toFixed(1) + 'k';
    return String(Math.round(n));
  };

  function render() {
    const pin = !!NX.store.get('meter:pin', false);
    const vis = NX.isOn(KEY) && (held || pin) && NX.inRun() && !NX.shown('scr-settings') && !NX.shown('nexus-panel') && !NX.shown('nexus-hist');
    el.classList.toggle('hidden', !vis);
    el.classList.toggle('nx-pin', pin);
    if (!vis) return;
    const s = NX.telemetry && NX.telemetry.current();
    let html;
    if (!s) html = '<div class="nx-me">Esperando datos de la partida…</div>';
    else {
      const top = s.moves.length ? s.moves[0].dmg : 1;
      const rows = s.moves.slice(0, MAX_ROWS).map((m) =>
        `<div class="nx-mr"><i style="width:${((m.dmg / Math.max(1, top)) * 100).toFixed(1)}%"></i><p><span>${NX.esc(m.name)}</span><span>${fmt(m.dmg)}</span><span>${Math.round(m.pct * 100)}%</span></p></div>`).join('');
      const foot = NX.store.get('meter:taken', true)
        ? `<div class="nx-mf"><span>Recibido ${fmt(s.taken)}</span><span>Bajas ${fmt(s.kills)}</span></div>` : '';
      html = `<div class="nx-mh"><b>DAÑO</b><span>${NX.fmtTime(s.time)}</span></div>
        <div class="nx-mt"><div><small>Total</small><b>${fmt(s.dmg)}</b></div><div><small>DPS</small><b>${fmt(s.dps)}</b></div><div><small>Últimos 10 s</small><b>${fmt(s.dps10)}</b></div></div>
        ${rows || '<div class="nx-me">Todavía no has hecho daño</div>'}${foot}`;
    }
    if (html !== lastHtml) { body.innerHTML = html; lastHtml = html; }
  }

  NX.feature({
    key: KEY,
    label: 'Medidor de daño',
    needs: () => !!NX.telemetry,
    setup() {
      NX.onReady(() => {
        el = document.createElement('div');
        el.id = 'nexus-meter';
        el.className = 'hidden';
        el.title = 'Arrastra para mover';
        el.innerHTML = '<div></div>';
        body = el.firstChild;
        document.body.appendChild(el);
        for (const ev of ['pointerdown', 'mousedown', 'touchstart', 'click']) el.addEventListener(ev, (e) => e.stopPropagation());
        drag = NX.draggable(el, 'meter', () => ({ x: 12, y: 150 }));
        setInterval(() => { try { render(); } catch (err) { NX.trip(KEY, err); } }, 200);
      });

      // Tab mantenido: se traga la tecla para que el navegador no mueva el foco.
      NX.keys.bind(
        (e) => e.code === 'Tab' && !e.altKey && !e.ctrlKey && !e.metaKey && NX.inRun() && NX.isOn(KEY),
        () => { if (!held) { held = true; if (el) render(); } return true; },
      );
      addEventListener('keyup', (e) => {
        if (e.code !== 'Tab' || !held) return;
        held = false;
        e.preventDefault();
        if (el) render();
      }, true);
      addEventListener('blur', () => { held = false; });
    },
  });
  let drag = null;

  NX.settings.section({
    key: KEY,
    tab: 'HUD',
    title: 'Medidor de daño',
    keywords: 'dps tab daño movimientos',
    render(wrap) {
      wrap.appendChild(NX.ui.toggle('Activado', 'on:' + KEY, true));
      wrap.appendChild(NX.ui.note('Mantén Tab en partida para ver tu daño total, el DPS y el daño de cada movimiento.'));
      wrap.appendChild(NX.ui.toggle('Dejarlo fijo en pantalla (arrastrable)', 'meter:pin', false));
      wrap.appendChild(NX.ui.toggle('Mostrar daño recibido y bajas', 'meter:taken', true));
      wrap.appendChild(NX.ui.button('Restablecer posición', () => { if (drag) drag.reset(); }));
    },
  });
})();

// ---- features/dex-tools.js
// Herramientas de la Pokédex. El juego ya trae búsqueda por nombre o número,
// filtro de tipo, Tengo / Me faltan, Shiny, Favoritos, rarezas, regiones y
// orden por número, nombre, rareza y recientes. Aquí se suma lo que falta:
// orden por tipo, por estadísticas y poseídos primero; filtros extra (segundo
// tipo, shiny que faltan, con nota); estrella de favorito en la cuadrícula;
// comparador de dos Pokémon y notas por Pokémon.
// La carga por tandas de la cuadrícula se resuelve como en PokeSurvivor Plus
// (MIT): se guarda el observador que dibuja las siguientes 48 casillas.
(() => {
  const KEY = 'dex';
  const ns = () => NX.ns;
  const $ = (id) => document.getElementById(id);
  const T = (s) => { try { return typeof ns().T === 'function' ? ns().T(s) : s; } catch (_) { return s; } };
  const icon = (name, px) => { try { return ns().Icons.html(name, px); } catch (_) { return ''; } };
  const pad = (n) => String(n).padStart(3, '0');
  const fold = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  const st = Object.assign({ sort: '', type2: '', shinyMiss: false, noted: false }, NX.store.get('dex:state', {}));
  const saveState = () => NX.store.set('dex:state', st);
  let notes = NX.store.get('dex:notes', {}) || {};
  let cmp = NX.store.get('dex:cmp', [null, null]) || [null, null];

  // ---- cuadrícula completa
  let moreIO = null;
  function captureIO() {
    const IO = window.IntersectionObserver;
    if (!IO || IO.__nx) return;
    const W = function (cb, opts) {
      const io = new IO(cb, opts);
      const observe = io.observe;
      io.observe = function (t) {
        if (t && t.classList && t.classList.contains('dex-more')) moreIO = { io, cb };
        return observe.apply(this, arguments);
      };
      return io;
    };
    W.prototype = IO.prototype;
    W.__nx = true;
    window.IntersectionObserver = W;
  }
  function loadAll(grid) {
    for (let i = 0; i < 80; i++) {
      const m = grid.querySelector('.dex-more');
      if (!m || !moreIO) return;
      try { moreIO.cb([{ isIntersecting: true, target: m }], moreIO.io); } catch (_) { return; }
      if (grid.querySelector('.dex-more') === m) return; // no avanzó
    }
  }

  const cellDex = (c) => {
    if (!c.dataset.nxDex) { const no = c.querySelector('.no'); c.dataset.nxDex = no ? parseInt(no.textContent, 10) || 0 : 0; }
    return +c.dataset.nxDex;
  };
  const owns = (dex) => { const s = ns().DB.save; return !!(s && s.owned && s.owned[dex]); };
  const typeOrder = () => Object.keys(ns().U.TYPE_NAME || {});

  function passes(dex) {
    const p = ns().DEX_BY[dex];
    if (!p) return true;
    if (st.type2 && !p.types.includes(st.type2)) return false;
    if (st.shinyMiss) { let has = false; try { has = ns().Sprites.hasShiny(dex); } catch (_) { has = false; } if (!has || ns().DB.ownsShiny(dex)) return false; }
    if (st.noted && !notes[dex]) return false;
    return true;
  }
  function sortKey() {
    const D = ns().DEX_BY, order = typeOrder();
    const ti = (t) => (t ? order.indexOf(t) : -1);
    if (st.sort === 'type') return (a, b) => { const A = D[a] || {}, B = D[b] || {}; const ta = A.types || [], tb = B.types || []; return ti(ta[0]) - ti(tb[0]) || ti(ta[1]) - ti(tb[1]) || a - b; };
    if (st.sort === 'bst') return (a, b) => ((D[b] || {}).bst || 0) - ((D[a] || {}).bst || 0) || a - b;
    if (st.sort === 'own') return (a, b) => (owns(b) ? 1 : 0) - (owns(a) ? 1 : 0);
    return null;
  }

  let mo = null, pending = false;
  const active = () => NX.isOn(KEY) && !!(st.sort || st.type2 || st.shinyMiss || st.noted);
  function apply() {
    pending = false;
    const grid = $('dex-grid');
    if (!grid || !ns().DB.save) return;
    mo.disconnect();
    try {
      const on = active();
      if (on) loadAll(grid);
      const favOn = NX.isOn(KEY) && NX.store.get('dex:favStar', true);
      const cells = [...grid.children].filter((c) => c.classList.contains('cell'));
      let shown = 0;
      for (const c of cells) {
        const dex = cellDex(c);
        const hide = on && !passes(dex);
        c.classList.toggle('nx-hide', hide);
        if (!hide) shown++;
        let star = c.querySelector(':scope > .nx-fav');
        if (favOn && !c.classList.contains('locked') && dex) {
          if (!star) {
            star = document.createElement('button');
            star.type = 'button';
            star.className = 'nx-fav';
            star.dataset.nodrag = '1';
            c.appendChild(star);
          }
          const fav = ns().DB.isFav(dex);
          if (star.dataset.on !== String(fav)) {
            star.dataset.on = String(fav);
            star.innerHTML = icon(fav ? 'star' : 'starDim', 12);
            star.title = fav ? 'Quitar de favoritos' : 'Marcar como favorito';
          }
        } else if (star) star.remove();
      }
      const cmpFn = on && sortKey();
      if (cmpFn) {
        const idx = new Map(cells.map((c, i) => [c, i]));
        const sorted = cells.slice().sort((a, b) => cmpFn(cellDex(a), cellDex(b)) || idx.get(a) - idx.get(b));
        if (sorted.some((c, i) => c !== cells[i])) {
          const more = grid.querySelector('.dex-more');
          for (const c of sorted) grid.insertBefore(c, more);
        }
      }
      const count = $('nx-dex-count');
      if (count) count.textContent = on ? `${shown} con los filtros de Nexus` : '';
      const sortBar = $('dex-sort');
      if (sortBar) sortBar.classList.toggle('nx-dim', on && !!st.sort);
    } finally {
      mo.observe(grid, { childList: true });
    }
  }
  const schedule = () => { if (!pending) { pending = true; requestAnimationFrame(apply); } };

  // ---- barra propia debajo del orden del juego
  function buildBar() {
    const sort = $('dex-sort');
    if (!sort || $('nx-dex-bar')) return;
    const bar = document.createElement('div');
    bar.id = 'nx-dex-bar';
    bar.className = 'filters';
    sort.after(bar);
    const draw = () => {
      const types = ns().U.TYPE_NAME || {};
      const chip = (on, html, act) => `<button type="button" class="chip${on ? ' on' : ''}" data-act="${act}">${html}</button>`;
      bar.innerHTML = '<span class="sub" style="margin:0;align-self:center">Nexus:</span>' +
        chip(st.sort === 'type', 'Por tipo', 'sort:type') + chip(st.sort === 'bst', 'Más estadísticas', 'sort:bst') +
        chip(st.sort === 'own', 'Poseídos primero', 'sort:own') +
        `<select class="nx-type2" title="Que además tenga este tipo"><option value="">Con tipo…</option>${
          Object.keys(types).map((t) => `<option value="${NX.esc(t)}"${st.type2 === t ? ' selected' : ''}>${NX.esc(types[t])}</option>`).join('')}</select>` +
        chip(st.shinyMiss, icon('shiny', 12) + ' Shiny que me faltan', 'shinyMiss') +
        chip(st.noted, 'Con nota', 'noted') +
        chip(false, `Comparar (${cmp.filter(Boolean).length}/2)`, 'cmp') +
        '<span id="nx-dex-count" class="sub" style="margin:0;align-self:center"></span>';
      bar.querySelector('.nx-type2').addEventListener('change', (e) => { st.type2 = e.target.value; saveState(); schedule(); });
    };
    bar.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const a = b.dataset.act;
      if (a.startsWith('sort:')) { const v = a.slice(5); st.sort = st.sort === v ? '' : v; }
      else if (a === 'shinyMiss' || a === 'noted') st[a] = !st[a];
      else if (a === 'cmp') { openCompare(); return; }
      saveState();
      draw();
      schedule();
    });
    // Al elegir un orden del juego, el de Nexus se aparta.
    sort.addEventListener('click', (e) => {
      if (e.target.closest('.chip') && st.sort) { st.sort = ''; saveState(); draw(); }
    }, true);
    bar.nxDraw = draw;
    draw();
  }
  const redrawBar = () => { const b = $('nx-dex-bar'); if (b && b.nxDraw) b.nxDraw(); };

  // ---- ficha: tier, comparador y notas
  function detailDex() {
    const d = $('dex-detail');
    const first = d && d.querySelector('.center > div');
    const m = first && /(\d{1,4})/.exec(first.textContent);
    return m ? +m[1] : 0;
  }
  const tierOf = (dex) => {
    const rows = NX.data && NX.data.tiers && NX.data.tiers.rows;
    return Array.isArray(rows) ? rows.find((r) => r.dex === dex) || null : null;
  };
  let noteT = 0;
  function decorateDetail() {
    const d = $('dex-detail');
    if (!d || !NX.isOn(KEY)) return;
    const dex = detailDex();
    if (!dex) return;
    const old = d.querySelector('.nx-dex-extra');
    if (old && +old.dataset.dex === dex) return;
    if (old) old.remove();
    const box = document.createElement('div');
    box.className = 'mon-extra nx-dex-extra';
    box.dataset.dex = dex;
    const t = tierOf(dex);
    box.innerHTML = (t ? `<div class="mx-row"><span>Tier</span> <b class="gold">${NX.esc(t.tier)}</b> <small>puesto ${t.rank} en SurvivorTiers</small></div>` : '') +
      `<div class="row" style="gap:6px;margin:4px 0"><button type="button" class="btn small" data-slot="0">Comparar como A</button>
      <button type="button" class="btn small" data-slot="1">Como B</button></div>` +
      (NX.store.get('dex:notesOn', true) ? `<textarea class="nx-note-in" maxlength="500" rows="2" placeholder="Nota para este Pokémon…"></textarea>` : '');
    const ta = box.querySelector('textarea');
    if (ta) {
      ta.value = notes[dex] || '';
      ta.addEventListener('keydown', (e) => e.stopPropagation());
      ta.addEventListener('input', () => {
        clearTimeout(noteT);
        noteT = setTimeout(() => {
          const v = ta.value.trim();
          if (v) notes[dex] = v; else delete notes[dex];
          NX.store.set('dex:notes', notes);
        }, 300);
      });
    }
    box.addEventListener('click', (e) => {
      const b = e.target.closest('[data-slot]');
      if (!b) return;
      cmp[+b.dataset.slot] = dex;
      NX.store.set('dex:cmp', cmp);
      redrawBar();
      if (cmp[0] && cmp[1]) openCompare(); else NX.toast('Elige otro Pokémon para comparar');
    });
    d.appendChild(box);
  }

  // ---- comparador
  const STATS = [['hp', 'Vida', 183, (v) => Math.round(v)], ['pa', 'Ataque físico', 1.55, (v) => '×' + v.toFixed(2)],
    ['sa', 'Ataque especial', 1.55, (v) => '×' + v.toFixed(2)], ['df', 'Defensa', 160, (v) => Math.round(v)],
    ['sd', 'Defensa especial', 160, (v) => Math.round(v)], ['spd', 'Velocidad', 137, (v) => Math.round(v)], ['bst', 'Total base', 720, (v) => Math.round(v)]];
  function matchups(types) {
    const { Types, U } = ns();
    const weak = [], res = [];
    for (const t of Object.keys(U.TYPE_NAME || {})) {
      let m = 1;
      try { m = Types.mult(t, types); } catch (_) { m = 1; }
      if (m > 1.05) weak.push(t); else if (m < 0.95) res.push(t);
    }
    return { weak, res };
  }
  function side(dex) {
    const { DEX_BY, Gacha, MenuUI, UI, Stats } = ns();
    const p = DEX_BY[dex];
    if (!p) return '<div class="nx-cmp-empty sub">Sin elegir</div>';
    const t = tierOf(dex);
    const mu = matchups(p.types);
    let chips = '';
    try { chips = UI.typeChips(p.types); } catch (_) { chips = p.types.join(' / '); }
    const tc = (list) => (list.length ? (() => { try { return UI.typeChips(list); } catch (_) { return list.join(', '); } })() : '<small>ninguno</small>');
    let sideTxt = '';
    try { sideTxt = Stats.sideOf(p) === 'special' ? 'especiales' : 'físicos'; } catch (_) { sideTxt = ''; }
    return `<div class="center"><div class="nx-cmp-spr" data-dex="${dex}"></div>
      <div style="color:var(--muted);font-size:13px">Nº ${pad(dex)} · ${NX.esc(T((MenuUI.GEN_NAMES || [])[p.gen - 1] || ''))}</div>
      <h3 style="margin:2px 0">${NX.esc(p.name)}${owns(dex) ? '' : ' <small class="sub">(no lo tienes)</small>'}</h3>
      <div style="color:${Gacha.RARITY_COLOR[p.rarity]}">${(() => { try { return UI.stars(p.rarity, 16); } catch (_) { return ''; } })()} ${NX.esc(Gacha.RARITY_NAME[p.rarity] || '')}</div>
      <div style="margin:6px 0">${chips}</div>${t ? `<div>Tier <b class="gold">${NX.esc(t.tier)}</b> <small class="sub">puesto ${t.rank}</small></div>` : ''}
      ${sideTxt ? `<div class="sub" style="margin:4px 0 0;font-size:13px">Pega mejor con ataques ${sideTxt}</div>` : ''}</div>
      <div class="nx-mu"><span>Débil a</span> ${tc(mu.weak)}</div><div class="nx-mu"><span>Resiste</span> ${tc(mu.res)}</div>`;
  }
  function statRows(a, b) {
    const D = ns().DEX_BY, A = D[a], B = D[b];
    if (!A || !B) return '';
    return STATS.map(([k, label, max, f]) => {
      const va = +A[k] || 0, vb = +B[k] || 0;
      const w = (v) => Math.min(100, (v / max) * 100);
      return `<div class="nx-cmp-row"><b class="${va > vb ? 'gold' : ''}">${f(va)}</b><div class="bar l"><i style="width:${w(va)}%"></i></div>
        <span>${label}</span><div class="bar"><i style="width:${w(vb)}%"></i></div><b class="${vb > va ? 'gold' : ''}">${f(vb)}</b></div>`;
    }).join('');
  }
  let cmpEl = null;
  function closeCompare() { if (cmpEl) { cmpEl.remove(); cmpEl = null; removeEventListener('keydown', cmpKey, true); } }
  const cmpKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); closeCompare(); } };
  function openCompare() {
    closeCompare();
    const { DEX, UI } = ns();
    cmpEl = document.createElement('section');
    cmpEl.className = 'scr dim nx-cmp';
    cmpEl.style.zIndex = 60;
    const opts = DEX.map((p) => `<option value="${pad(p.dex)} ${NX.esc(p.name)}"></option>`).join('');
    const draw = () => {
      const [a, b] = cmp;
      cmpEl.innerHTML = `<div class="box" style="width:min(760px,100%)">
        <div class="row between"><h2>Comparar Pokémon</h2><button class="btn small ghost" data-close type="button">Cerrar</button></div>
        <datalist id="nx-cmp-list">${opts}</datalist>
        <div class="nx-cmp-pick"><input class="field" list="nx-cmp-list" data-slot="0" placeholder="Pokémon A: nombre o número" value="${a ? pad(a) + ' ' + NX.esc((ns().DEX_BY[a] || {}).name || '') : ''}">
        <button class="btn small ghost" data-swap type="button" title="Intercambiar">⇄</button>
        <input class="field" list="nx-cmp-list" data-slot="1" placeholder="Pokémon B: nombre o número" value="${b ? pad(b) + ' ' + NX.esc((ns().DEX_BY[b] || {}).name || '') : ''}"></div>
        <div class="nx-cmp-cols"><div class="panel">${side(a)}</div><div class="panel">${side(b)}</div></div>
        ${a && b ? `<div class="panel nx-cmp-stats"><p class="sub center" style="margin:0 0 6px">Estadísticas base</p>${statRows(a, b)}</div>` : '<p class="note center">Elige dos Pokémon para ver sus estadísticas lado a lado.</p>'}
      </div>`;
      cmpEl.querySelectorAll('.nx-cmp-spr').forEach((s) => {
        try { s.appendChild(UI.spriteCanvas(+s.dataset.dex, 132, 110, { lively: true, scale: 2 })); } catch (_) { /* sin sprite */ }
      });
      cmpEl.querySelectorAll('input[data-slot]').forEach((inp) => {
        inp.addEventListener('keydown', (e) => { if (e.key !== 'Escape') e.stopPropagation(); });
        inp.addEventListener('change', () => {
          const q = fold(inp.value.trim());
          const n = parseInt(q, 10);
          const hit = (n && ns().DEX_BY[n]) || DEX.find((p) => fold(p.name) === q.replace(/^\d+\s*/, '')) || DEX.find((p) => fold(p.name).startsWith(q.replace(/^\d+\s*/, '')));
          if (!hit) { NX.toast('No se encontró ese Pokémon'); return; }
          cmp[+inp.dataset.slot] = hit.dex;
          NX.store.set('dex:cmp', cmp);
          redrawBar();
          draw();
        });
      });
    };
    cmpEl.addEventListener('click', (e) => {
      if (e.target === cmpEl || e.target.closest('[data-close]')) { closeCompare(); return; }
      if (e.target.closest('[data-swap]')) { cmp = [cmp[1], cmp[0]]; NX.store.set('dex:cmp', cmp); draw(); }
    });
    addEventListener('keydown', cmpKey, true);
    draw();
    document.body.appendChild(cmpEl);
  }

  NX.css(`#dex-grid .cell.nx-hide{display:none}
#dex-grid .nx-fav{position:absolute;right:3px;bottom:3px;padding:1px 2px;line-height:0;background:rgba(0,0,0,.35);border:0;border-radius:5px;cursor:pointer;opacity:0;transition:opacity .12s}
#dex-grid .cell:hover .nx-fav,#dex-grid .nx-fav:focus-visible{opacity:1}
#nx-dex-bar{align-items:center}
#nx-dex-bar select{background:rgba(0,0,0,.3);color:inherit;border:2px solid rgba(244,248,255,.25);border-radius:20px;padding:3px 8px;font:inherit;font-size:13px}
#nx-dex-bar select option{background:#14204a}
#dex-sort.nx-dim .chip.on{border-color:rgba(244,248,255,.25);color:inherit}
.nx-dex-extra textarea{width:100%;box-sizing:border-box;resize:vertical;margin-top:4px;background:rgba(0,0,0,.3);color:inherit;border:2px solid rgba(244,248,255,.25);border-radius:8px;padding:5px 8px;font:inherit;font-size:13px}
.nx-cmp .nx-cmp-pick{display:flex;gap:8px;align-items:center;margin:6px 0 10px}
.nx-cmp .nx-cmp-pick .field{flex:1;min-width:0;width:auto}
.nx-cmp .nx-cmp-cols{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.nx-cmp .nx-cmp-spr canvas{display:block;margin:0 auto}
.nx-cmp .nx-mu{font-size:13px;margin-top:6px}.nx-cmp .nx-mu>span{color:var(--muted);margin-right:4px}
.nx-cmp .nx-cmp-stats{margin-top:10px}
.nx-cmp .nx-cmp-row{display:grid;grid-template-columns:52px 1fr 130px 1fr 52px;gap:8px;align-items:center;font-size:14px;margin:5px 0}
.nx-cmp .nx-cmp-row>span{text-align:center;color:var(--muted)}.nx-cmp .nx-cmp-row>b:last-child{text-align:right}
.nx-cmp .bar{height:8px;background:rgba(0,0,0,.35);border-radius:6px;overflow:hidden;display:flex}
.nx-cmp .bar.l{justify-content:flex-end}.nx-cmp .bar i{display:block;height:100%;background:var(--gold,#ffd23f)}
@media (max-width:620px){.nx-cmp .nx-cmp-cols{grid-template-columns:1fr}.nx-cmp .nx-cmp-row{grid-template-columns:44px 1fr 90px 1fr 44px;font-size:12px}}`);

  NX.feature({
    key: KEY,
    label: 'Herramientas de la Pokédex',
    needs: (n) => n.DEX && n.DEX_BY && n.DB && typeof n.DB.isFav === 'function' && typeof n.DB.setFav === 'function' &&
      n.U && n.U.TYPE_NAME && n.Gacha && n.Types && n.MenuUI && !!$('dex-grid') && !!$('dex-sort') && !!$('dex-detail'),
    setup(n) {
      captureIO();
      buildBar();
      const grid = $('dex-grid');
      mo = new MutationObserver(schedule);
      mo.observe(grid, { childList: true });
      // Estrella: marca o quita favorito con la función del juego, sin abrir la ficha.
      grid.addEventListener('click', (e) => {
        const star = e.target.closest('.nx-fav');
        if (!star) return;
        e.stopPropagation();
        e.preventDefault();
        const cell = star.closest('.cell');
        const dex = cellDex(cell);
        if (!dex || !n.DB.save) return;
        const fav = !n.DB.isFav(dex);
        n.DB.setFav(dex, fav);
        const no = cell.querySelector('.no');
        if (no) no.innerHTML = pad(dex) + (fav ? ' ' + icon('star', 10) : '');
        star.dataset.on = '';
        schedule();
      }, true);
      new MutationObserver(() => { try { decorateDetail(); } catch (err) { NX.trip(KEY, err); } }).observe($('dex-detail'), { childList: true });
      const scr = $('scr-dex');
      if (scr) new MutationObserver(() => { if (NX.shown('scr-dex')) { redrawBar(); schedule(); } }).observe(scr, { attributes: true, attributeFilter: ['class'] });
    },
  });

  NX.settings.section({
    key: KEY,
    tab: 'Menús',
    title: 'Herramientas de la Pokédex',
    keywords: 'pokedex buscar ordenar filtros favoritos comparar notas tier',
    render(el) {
      el.appendChild(NX.ui.toggle('Activado', 'on:' + KEY, true, () => schedule()));
      el.appendChild(NX.ui.toggle('Estrella de favorito en la cuadrícula', 'dex:favStar', true, () => schedule()));
      el.appendChild(NX.ui.toggle('Notas en la ficha de cada Pokémon', 'dex:notesOn', true));
      const n = Object.keys(notes).length;
      const tiers = NX.data && NX.data.tiers && Array.isArray(NX.data.tiers.rows);
      el.appendChild(NX.ui.note(`Suma orden por tipo y estadísticas, filtros extra, comparador y notas en Pokémon. Notas guardadas: ${n}. ` +
        (tiers ? 'Tiers de SurvivorTiers disponibles.' : 'Sin datos de SurvivorTiers en este modo: el comparador no muestra tier.')));
      el.appendChild(NX.ui.button('Abrir comparador', () => { if (NX.ns) { NX.togglePanel(); openCompare(); } }));
    },
  });
})();

// ---- features/edge-arrows.js
// Flechas en el borde de la pantalla hacia lo que vale la pena y está fuera
// de vista: jefes, legendarios, shinies, dorados y ladrones, cofres grandes y
// grietas. Se dibujan encima del HUD (capa over) con la distancia en metros.
// El juego ya trae flechas simples para shinies, ladrones y grietas; con
// "Reemplazar las flechas del juego" se ocultan esas tres mientras se dibuja
// su HUD, para no ver flechas dobles.
// Basado en el enfoque de PokeSurvivor Plus (MIT).
(() => {
  const KEY = 'edgearrows';
  const TYPES = [
    ['boss', 'Jefes'], ['legend', 'Legendarios y Juicio'], ['shiny', 'Shinies'],
    ['golden', 'Dorados y ladrones'], ['chest', 'Cofres grandes'], ['rift', 'Grietas'],
  ];
  const STYLE = {
    boss: { col: '#ff3048', ring: '#ffd23f', label: 'JEFE', glyph: '!' },
    legend: { col: '#9b5cff', ring: '#d7b8ff', label: 'LEGENDARIO', glyph: '★' },
    shiny: { col: '#2aa7d8', ring: '#bff2ff', label: 'SHINY', glyph: '✦' },
    golden: { col: '#d89a10', ring: '#ffe27a', label: '', glyph: '$' },
    chest: { col: '#b0701c', ring: '#ffd23f', label: 'COFRE GRANDE', glyph: '▣' },
    rift: { col: '#7a4fd8', ring: '#e2d0ff', label: 'GRIETA', glyph: '◆' },
  };
  const INK = '#0b1838';
  const opt = {};
  const readOpts = () => {
    for (const [t] of TYPES) opt[t] = NX.store.get('arrows:' + t, true) !== false;
    opt.replace = NX.store.get('arrows:replace', true) !== false;
    opt.dist = NX.store.get('arrows:dist', true) !== false;
    opt.on = NX.isOn(KEY);
  };
  readOpts();
  setInterval(readOpts, 1000);
  const replacing = (t) => opt.on && opt.replace && opt[t];

  // ---- ocultar las flechas del juego que reemplazamos
  let depth = 0, body = false, thiefWin = false, realRift = null, riftDesc = null, riftHidden = false;
  const offWorld = (C, x, y) => x < C.left() || x > C.left() + C.w || y < C.top() || y > C.top() + C.h;

  function hook(ns) {
    const R = ns.Rift;
    const restoreRift = () => {
      if (riftDesc) { try { Object.defineProperty(R, 'rift', riftDesc); } catch (_) { /* sigue igual */ } riftDesc = null; }
    };
    const d = ns.HUD.draw;
    ns.HUD.draw = function () {
      realRift = R ? R.rift : null;
      depth++;
      try { return d.apply(this, arguments); } finally {
        restoreRift();
        if (--depth <= 0) { depth = 0; body = false; thiefWin = false; }
      }
    };
    const T = ns.Touch, cb = T.clearButtons;
    T.clearButtons = function () {
      if (depth) {
        body = true;
        riftHidden = false;
        // La grieta fuera de vista: el juego no dibuja su flecha. El aviso de
        // apertura (primeros 4.5 s) y el marcador en pantalla se conservan.
        const rf = realRift;
        if (rf && replacing('rift') && !riftDesc && typeof rf.x === 'number' && !(rf.t < 4.5) && offWorld(ns.Camera, rf.x, rf.y - 40)) {
          const desc = Object.getOwnPropertyDescriptor(R, 'rift');
          if (desc && desc.configurable) {
            riftDesc = desc;
            Object.defineProperty(R, 'rift', { configurable: true, enumerable: desc.enumerable, get: () => null, set: () => {} });
            riftHidden = true;
          }
        }
      }
      return cb.apply(this, arguments);
    };
    const E = ns.Events, dh = E.drawHud;
    E.drawHud = function () {
      body = false;
      restoreRift();
      thiefWin = depth > 0 && replacing('golden');
      try { return dh.apply(this, arguments); } finally { thiefWin = false; }
    };
    const M = ns.EnemyMgr;
    const all = M.all;
    M.all = function () {
      const r = all.apply(this, arguments);
      return thiefWin && Array.isArray(r) ? r.filter((e) => e.behavior !== 'thief') : r;
    };
    if (typeof M.shinies === 'function') {
      const sh = M.shinies;
      M.shinies = function () { return body && replacing('shiny') ? [] : sh.apply(this, arguments); };
    }
  }

  // ---- posiciones: sin pisar el minimapa ni otras flechas
  let mapRect = null, mapAt = 0;
  function mapInHud(ctx, w) {
    const now = performance.now();
    if (now - mapAt > 250) {
      mapAt = now;
      mapRect = null;
      const m = document.getElementById('nexus-map');
      if (m && !m.classList.contains('hidden') && ctx.canvas) {
        const cr = ctx.canvas.getBoundingClientRect(), mr = m.getBoundingClientRect();
        if (cr.width > 0 && mr.width > 0) mapRect = { cr, mr };
      }
    }
    if (!mapRect) return null;
    const f = w / mapRect.cr.width, { cr, mr } = mapRect;
    return { x: (mr.left - cr.left) * f, y: (mr.top - cr.top) * f, w: mr.width * f, h: mr.height * f };
  }
  function avoidMap(ex, ey, M, W, H, r) {
    if (!r) return [ex, ey];
    const pad = M * 0.75;
    if (ex < r.x - pad || ex > r.x + r.w + pad || ey < r.y - pad || ey > r.y + r.h + pad) return [ex, ey];
    const opts = [[ex, r.y + r.h + pad], [ex, r.y - pad], [r.x - pad, ey], [r.x + r.w + pad, ey]]
      .filter(([x, y]) => x >= M && x <= W - M && y >= M && y <= H - M);
    if (!opts.length) return [ex, ey];
    opts.sort((p, q) => Math.hypot(p[0] - ex, p[1] - ey) - Math.hypot(q[0] - ex, q[1] - ey));
    return opts[0];
  }
  function spread(spots, ex, ey, M, W, H) {
    const GAP = 58, side = ex <= M + 1 || ex >= W - M - 1;
    for (let i = 0; i < 8; i++) {
      const hit = spots.find(([x, y]) => Math.hypot(x - ex, y - ey) < GAP);
      if (!hit) break;
      if (side) { const dd = ey >= hit[1] ? 1 : -1; ey = hit[1] + dd * GAP; if (ey > H - M - 125 || ey < M + 70) ey = hit[1] - dd * GAP; }
      else { const dd = ex >= hit[0] ? 1 : -1; ex = hit[0] + dd * GAP; if (ex > W - M || ex < M) ex = hit[0] - dd * GAP; }
    }
    spots.push([ex, ey]);
    return [ex, ey];
  }

  // ---- objetivos
  let chests = [], chestAt = 0;
  function targets(ns, pl) {
    const out = [];
    const M = ns.EnemyMgr;
    if (M && M.all) {
      for (const e of M.all()) {
        if (!e || e.dead) continue;
        let t = null;
        if (e.legend || e.judge) t = 'legend';
        else if (e.boss) t = 'boss';
        else if (e.shiny) t = 'shiny';
        else if (e.golden || e.behavior === 'thief') t = 'golden';
        if (t && opt[t]) out.push({ t, x: e.x, y: e.y - (e.bodyH || 30) * 0.5, e });
      }
    }
    if (opt.chest && ns.World && ns.World.specialsNear) {
      const now = performance.now();
      if (now - chestAt > 500) {
        chestAt = now;
        chests = [];
        try { for (const q of ns.World.specialsNear(pl.x, pl.y, 1600) || []) if (q && q.type === 'bigchest') chests.push(q); } catch (_) { chests = []; }
      }
      for (const q of chests) if (!q.used && !q.open && !(q.hp <= 0)) out.push({ t: 'chest', x: q.x, y: q.y - 20 });
    }
    const rf = depth ? realRift : ns.Rift && ns.Rift.rift;
    // Solo cuando el juego no dibujó la suya en este cuadro.
    if (opt.rift && riftHidden && rf && typeof rf.x === 'number') out.push({ t: 'rift', x: rf.x, y: rf.y - 40, rf });
    return out;
  }

  function label(o, metres) {
    const s = STYLE[o.t];
    let txt = s.label;
    if (o.t === 'golden') txt = o.e && o.e.behavior === 'thief' ? String(o.e.name || 'LADRÓN').toUpperCase() : 'DORADO';
    else if (o.t === 'shiny' && o.e && o.e.name) txt = 'SHINY ' + String(o.e.name).toUpperCase();
    if (o.t === 'rift' && o.rf && o.rf.ttl > 0) txt += ' · ' + Math.ceil(o.rf.ttl) + ' s';
    return opt.dist ? txt + ' · ' + metres + ' m' : txt;
  }

  function draw(ctx, W, H, pl, ns) {
    if (!pl) return;
    const list = targets(ns, pl);
    if (!list.length) return;
    const spots = [], map = mapInHud(ctx, W), t = performance.now() / 1000;
    const M = 44;
    for (const o of list) {
      const [sx, sy] = NX.toScreen(o.x, o.y);
      if (sx > 0 && sx < W && sy > 0 && sy < H) continue;
      let ex = NX.clamp(sx, M, W - M), ey = NX.clamp(sy, M + 70, H - M - 125);
      [ex, ey] = avoidMap(ex, ey, M, W, H, map);
      [ex, ey] = spread(spots, ex, ey, M, W, H);
      const a = Math.atan2(sy - ey, sx - ex), ca = Math.cos(a), sa = Math.sin(a);
      const s = STYLE[o.t], big = o.t === 'boss' || o.t === 'legend';
      const beat = 0.5 + 0.5 * Math.sin(t * 6);
      ctx.save();
      ctx.translate(ex, ey);
      if (big || o.t === 'rift') {
        ctx.globalAlpha = 0.18 + beat * 0.22;
        ctx.beginPath(); ctx.arc(0, 0, 24 + beat * 5, 0, Math.PI * 2); ctx.fillStyle = s.col; ctx.fill();
        ctx.globalAlpha = 1;
      }
      // Punta hacia el objetivo (dos para jefes y legendarios).
      const tip = (d, wd) => {
        ctx.beginPath();
        ctx.moveTo(ca * (d + 12), sa * (d + 12));
        ctx.lineTo(ca * d + Math.cos(a + Math.PI / 2) * wd, sa * d + Math.sin(a + Math.PI / 2) * wd);
        ctx.lineTo(ca * (d + 4), sa * (d + 4));
        ctx.lineTo(ca * d + Math.cos(a - Math.PI / 2) * wd, sa * d + Math.sin(a - Math.PI / 2) * wd);
        ctx.closePath();
        ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.strokeStyle = INK; ctx.stroke();
        ctx.fillStyle = s.ring; ctx.fill();
      };
      tip(16, 10);
      if (big) tip(26 + beat * 3, 8);
      // Insignia con el símbolo del tipo.
      ctx.beginPath(); ctx.arc(0, 0, 13, 0, Math.PI * 2);
      ctx.fillStyle = s.col; ctx.fill();
      ctx.lineWidth = 2.5; ctx.strokeStyle = INK; ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, 10.5, 0, Math.PI * 2);
      ctx.lineWidth = 1.5; ctx.strokeStyle = s.ring; ctx.stroke();
      ctx.font = '700 13px Pixelify,"Segoe UI",sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fff';
      ctx.fillText(s.glyph, 0, 1);
      // Texto del lado contrario a la punta.
      const metres = Math.round(Math.hypot(pl.x - o.x, pl.y - o.y) / 32);
      ctx.font = '700 11px Pixelify,"Segoe UI",sans-serif';
      ctx.textBaseline = 'alphabetic';
      const txt = label(o, metres), tw = ctx.measureText(txt).width;
      // Anclado del lado contrario a la punta, sin salirse de la pantalla.
      let lx = -ca * 22 - (ca > 0.3 ? tw : ca < -0.3 ? 0 : tw / 2);
      lx = NX.clamp(ex + lx, 4, Math.max(4, W - 4 - tw)) - ex;
      const ly = -sa * 24 + 4;
      ctx.textAlign = 'left';
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.85)'; ctx.strokeText(txt, lx, ly);
      ctx.fillStyle = s.ring; ctx.fillText(txt, lx, ly);
      ctx.restore();
    }
  }

  NX.feature({
    key: KEY,
    label: 'Flechas en el borde',
    needs: (ns) => ns.HUD && typeof ns.HUD.draw === 'function' && ns.Camera && ns.Camera.left && ns.EnemyMgr && ns.EnemyMgr.all &&
      ns.Touch && typeof ns.Touch.clearButtons === 'function' && ns.Events && typeof ns.Events.drawHud === 'function' &&
      NX.featureList().some((f) => f.key === 'hud' && f.status === 'ok'),
    setup(ns) {
      hook(ns);
      NX.hudLayers.push({ key: KEY, over(ctx, w, h, pl) { draw(ctx, w, h, pl, ns); } });
    },
  });

  NX.settings.section({
    key: KEY,
    title: 'Flechas en el borde',
    tab: 'HUD',
    keywords: 'flecha borde jefe shiny legendario cofre grieta ladrón dorado',
    render(el) {
      el.appendChild(NX.ui.toggle('Activado', 'on:' + KEY, true, readOpts));
      for (const [t, name] of TYPES) el.appendChild(NX.ui.toggle(name, 'arrows:' + t, true, readOpts));
      el.appendChild(NX.ui.toggle('Distancia en metros', 'arrows:dist', true, readOpts));
      el.appendChild(NX.ui.toggle('Reemplazar las flechas del juego', 'arrows:replace', true, readOpts));
      el.appendChild(NX.ui.note('El juego ya marca shinies, ladrones y grietas. Al reemplazarlas se evita ver flechas dobles.'));
    },
  });
})();

// ---- features/encyclopedia.js
// Enciclopedia (F1 o Alt+I): en partida, tus movimientos, objeto, clima y
// debilidades; fuera de ella, un buscador de movimientos, objetos y Pokémon,
// y la tabla de tipos. Todo se lee de los datos del juego.
(() => {
  const KEY = 'enc';
  const TABS = [['run', 'En partida'], ['moves', 'Movimientos'], ['items', 'Objetos'], ['mons', 'Pokémon'], ['types', 'Tipos']];
  const LIST_MAX = 80;

  NX.css(`#nexus-enc{position:fixed;inset:0;z-index:100002;display:flex;align-items:center;justify-content:center;background:rgba(4,8,20,.55)}
#nexus-enc.hidden{display:none}
#nexus-enc .nx-ebox{width:min(880px,calc(100vw - 24px));height:min(640px,calc(100vh - 40px));box-sizing:border-box;padding:12px 14px;display:flex;flex-direction:column;
  background:linear-gradient(#24407f,#152a5c);color:#fff;border:2px solid #f4f8ff;outline:2px solid #0b1838;border-radius:10px;
  box-shadow:inset 0 0 0 2px #5b83d6,0 6px 0 #0a1430;font:13px/1.35 var(--font,'Pixelify',system-ui,sans-serif)}
#nexus-enc h2{margin:0 0 6px;font-size:19px;color:#ffd23f;display:flex;justify-content:space-between;align-items:center;gap:10px}
#nexus-enc h2 small{font-size:11px;color:#b9cbf0;font-weight:400;margin-left:auto}
#nexus-enc .nx-x{background:#0b1838;color:#fff;border:2px solid #f4f8ff;border-radius:6px;font:inherit;font-size:13px;cursor:pointer;padding:2px 10px}
#nexus-enc .nx-etabs{display:flex;flex-wrap:wrap;gap:5px;margin-bottom:8px}
#nexus-enc .nx-etabs button{font:inherit;font-size:12px;background:#0b1838;color:#cfe0ff;border:1px solid #5b83d6;border-radius:12px;padding:2px 11px;cursor:pointer}
#nexus-enc .nx-etabs button.on{background:#ffd23f;color:#0b1838;border-color:#ffd23f}
#nexus-enc .nx-etabs button:disabled{opacity:.4;cursor:default}
#nexus-enc .nx-ebody{flex:1;min-height:0;display:flex;gap:10px}
#nexus-enc .nx-ecol{display:flex;flex-direction:column;min-height:0;width:42%}
#nexus-enc .nx-eq{font:inherit;background:#0b1838;color:#fff;border:1px solid #5b83d6;border-radius:6px;padding:5px 8px;margin-bottom:6px}
#nexus-enc .nx-elist{flex:1;overflow:auto;display:flex;flex-direction:column;gap:2px;padding-right:4px}
#nexus-enc .nx-elist button{display:flex;align-items:center;gap:6px;text-align:left;font:inherit;font-size:12px;background:rgba(11,24,56,.6);color:#fff;border:1px solid transparent;border-radius:6px;padding:3px 7px;cursor:pointer}
#nexus-enc .nx-elist button:hover{border-color:#5b83d6}
#nexus-enc .nx-elist button.on{border-color:#ffd23f;background:rgba(255,210,63,.12)}
#nexus-enc .nx-elist button .g{margin-left:auto;display:flex;gap:2px;align-items:center}
#nexus-enc .nx-elist .n{color:#b9cbf0;min-width:34px}
#nexus-enc .nx-edet{flex:1;overflow:auto;padding:8px 10px;border-radius:8px;background:rgba(0,0,0,.22)}
#nexus-enc .nx-edet.full{width:100%}
#nexus-enc .nx-sec{margin:0 0 10px}
#nexus-enc .nx-sec>h4{margin:0 0 5px;font-size:13px;color:#9fd0ff}
#nexus-enc .nx-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:8px}
#nexus-enc .nx-grid>.nx-card{padding:7px 9px;border-radius:8px;background:rgba(11,24,56,.7);border:1px solid rgba(91,131,214,.5)}
#nexus-enc .nx-kv2{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:2px 12px;font-size:12px}
#nexus-enc .nx-kv2 span{color:#b9cbf0}
#nexus-enc .nx-mvs{display:flex;flex-wrap:wrap;gap:4px}
#nexus-enc .nx-mvs button{font:inherit;font-size:11px;padding:1px 8px;border-radius:7px;border:0;color:#fff;cursor:pointer;text-shadow:1px 1px 0 #0a1430}
#nexus-enc .nx-note2{font-size:11px;color:#b9cbf0;margin:4px 0}
#nexus-enc .nx-note2 a{color:inherit;text-decoration:underline}
#nexus-enc table.nx-chart{border-collapse:collapse;font-size:10px;margin:0 auto}
#nexus-enc table.nx-chart th,#nexus-enc table.nx-chart td{width:26px;height:20px;text-align:center;padding:0}
#nexus-enc table.nx-chart thead th{writing-mode:vertical-rl;transform:rotate(180deg);height:58px;font-weight:400}
#nexus-enc table.nx-chart tbody th{text-align:right;padding-right:4px;width:auto;white-space:nowrap;font-weight:400}
#nexus-enc table.nx-chart td{border:1px solid rgba(255,255,255,.06)}
#nexus-enc table.nx-chart td.u{background:rgba(70,200,110,.55)}#nexus-enc table.nx-chart td.d{background:rgba(220,70,90,.5)}
#nexus-enc table.nx-chart td.z{background:rgba(20,20,30,.9);color:#ff8a96}`);

  let root = null, tab = NX.store.get('enc:tab', 'moves'), query = '', sel = { moves: null, items: null, mons: null }, runSig = '', pausedByUs = false;

  // ---- piezas de contenido
  function moveCard(G, id, pl) {
    const def = G.moveDef(id);
    if (!def) return '';
    const own = pl && (pl.moves || []).find((m) => m.id === id);
    const m = own || G.instance(id, 1);
    const max = def.maxLvl || 5;
    let extra = '';
    if (!own) {
      const mx = G.instance(id, max);
      if (mx) extra += `<hr><div class="lv">En Nv. ${max}</div><div class="st">${G.rowsHtml(G.moveRows(mx, pl))}</div>`;
    }
    const ev = G.evolvedCopy(own || G.instance(id, max));
    if (ev && !(own && own.evolved)) extra += `<hr><div class="lv">Evolucionado: ${G.esc(G.T(ev.name, 'move'))}</div><div class="st">${G.rowsHtml(G.moveRows(ev, pl))}</div>`;
    const eff = G.effHtml(G.offense(def.type), (v) => (v > 1 ? 'eficaz contra' : v > 0.6 ? 'poco eficaz' : 'muy poco eficaz'));
    if (eff) extra += `<hr><div class="lv">Daño por tipo del rival</div>${eff}`;
    return G.moveTip(m, pl || null, { extra, noNext: !own, lvLabel: own ? null : `Nv. máx. ${max}` });
  }
  function learnedBy(G, id) {
    const ns = NX.ns, P = (ns.Moves && ns.Moves.POOL) || {};
    const types = Object.keys(P).filter((t) => (P[t] || []).includes(id));
    const tm = ns.TM_MOVES && Array.isArray(ns.TM_MOVES[id]) ? ns.TM_MOVES[id].length : 0;
    const parts = [];
    if (types.length) parts.push(types.includes('normal') ? 'cualquier Pokémon (movimiento Normal)' : 'Pokémon de tipo ' + types.map(G.typeName).join(', '));
    if (tm) parts.push(`${tm} Pokémon por MT`);
    return parts.length ? `<div class="nx-note2">Lo aprenden: ${G.esc(parts.join(' · '))}.</div>` : '';
  }
  function monDetail(G, dex) {
    const ns = NX.ns, p = ns.DEX_BY && ns.DEX_BY[dex];
    if (!p) return '';
    const st = [['Vida', p.hp], ['Velocidad', p.spd], ['Ataque', p.pa != null ? '×' + G.num(p.pa, 2) : null], ['At. Esp.', p.sa != null ? '×' + G.num(p.sa, 2) : null],
      ['Defensa', p.df], ['Def. Esp.', p.sd], ['Total base', p.bst], ['Generación', p.gen]].filter(([, v]) => v != null);
    let html = `<div class="nx-card"><div class="hd"><b>${G.esc(G.monName(dex))}</b><span class="lv">Nº ${String(dex).padStart(3, '0')}</span></div>
      <div class="tags">${(p.types || []).map(G.typeChip).join('')}</div>
      <div class="nx-kv2">${st.map(([k, v]) => `<div><span>${k}</span> <b>${G.esc(v)}</b></div>`).join('')}</div></div>`;
    const r = G.tierOf(dex);
    if (r) {
      html += `<div class="nx-sec" style="margin-top:8px"><h4>SurvivorTiers</h4><div>${G.tierBadge(r)} Tier <b>${G.esc(r.tier)}</b> · puesto ${r.rank} de ${G.tiers().total} · build ${G.esc(G.styleName(r.style))}</div>
        <div class="nx-mvs" style="margin-top:4px">${r.moves.map((id) => mvBtn(G, id)).join('')}</div><div class="nx-note2">${G.tierMetaHtml()}</div></div>`;
    }
    html += `<div class="nx-sec"><h4>Daño que recibe por tipo</h4>${G.effHtml(G.defense(p.types), (v) => (v > 1 ? 'débil' : v > 0 ? 'resiste' : 'inmune')) || '<div class="nx-note2">Sin debilidades ni resistencias.</div>'}</div>`;
    let pool = [];
    try { pool = ns.Moves.poolFor(p, true) || []; } catch (_) { pool = []; }
    const start = typeof ns.startMoveOf === 'function' ? ns.startMoveOf(dex) : null;
    let tms = [];
    try { tms = typeof ns.TM_OF === 'function' ? (ns.TM_OF(dex) || []).filter((id) => G.moveDef(id) && !pool.includes(id)) : []; } catch (_) { tms = []; }
    if (start && G.moveDef(start)) html += `<div class="nx-sec"><h4>Movimiento inicial</h4><div class="nx-mvs">${mvBtn(G, start)}</div></div>`;
    if (pool.length) html += `<div class="nx-sec"><h4>Aparecen en sus cartas (${pool.length})</h4><div class="nx-mvs">${pool.map((id) => mvBtn(G, id)).join('')}</div></div>`;
    if (tms.length) html += `<div class="nx-sec"><h4>Por MT (${tms.length})</h4><div class="nx-mvs">${tms.map((id) => mvBtn(G, id)).join('')}</div></div>`;
    return html;
  }
  const mvBtn = (G, id) => { const d = G.moveDef(id); return `<button type="button" data-mv="${G.esc(id)}" style="background:${G.esc(G.typeColor(d && d.type))}">${G.esc(G.moveName(id))}</button>`; };

  function runView(G, ns) {
    const pl = NX.me();
    if (!pl || !NX.inRun()) return '<div class="nx-note2">No estás en una partida. Usa las otras pestañas para buscar.</div>';
    const mon = pl.mon || ns.DEX_BY[pl.dex] || {};
    let html = `<div class="nx-sec"><h4>${G.esc(G.monName(pl.dex))} · Nv. ${pl.level || 1}</h4><div>${(mon.types || []).map(G.typeChip).join('')}</div>
      ${G.effHtml(G.defense(mon.types), (v) => (v > 1 ? 'débil' : v > 0 ? 'resiste' : 'inmune'))}</div>`;
    const moves = pl.moves || [];
    html += `<div class="nx-sec"><h4>Tus movimientos (${moves.length}/${pl.maxMoves || moves.length})</h4><div class="nx-grid">${moves.map((m) => {
      const eff = G.effHtml(G.offense(m.type), (v) => (v > 1 ? 'eficaz contra' : 'poco eficaz'));
      return `<div class="nx-card">${G.moveTip(m, pl, { extra: eff ? '<hr>' + eff : '' })}</div>`;
    }).join('')}</div></div>`;
    const extra = [];
    if (pl.item) extra.push(`<div class="nx-card">${G.itemTip(pl.item)}</div>`);
    if (ns.Weather && ns.Weather.current) extra.push(`<div class="nx-card">${G.weatherTip(ns.Weather.current, pl)}</div>`);
    const r = G.tierOf(pl.dex);
    if (r) {
      const own = new Set(moves.map((m) => m.id));
      extra.push(`<div class="nx-card"><div class="hd"><b style="color:#ffd23f">Build recomendada</b>${G.tierBadge(r)}</div><div class="ds">${G.esc(G.cap(G.styleName(r.style)))} · ${r.moves.filter((id) => own.has(id)).length}/${r.moves.length} en tu partida</div>
        <div class="nx-mvs">${r.moves.map((id) => mvBtn(G, id).replace('<button', `<button title="${own.has(id) ? 'Ya lo llevas' : 'Aún no lo llevas'}"` + (own.has(id) ? '' : ' style="opacity:.6"'))).join('')}</div><div class="nx-note2">${G.tierMetaHtml()}</div></div>`);
    }
    if (extra.length) html += `<div class="nx-sec"><h4>Objeto, clima y build</h4><div class="nx-grid">${extra.join('')}</div></div>`;
    return html;
  }
  function typeChart(G) {
    const ts = G.TYPES();
    let h = '<table class="nx-chart"><thead><tr><th></th>' + ts.map((t) => `<th style="color:${G.esc(G.typeColor(t))}" title="${G.esc(G.typeName(t))}">${G.esc(G.typeName(t))}</th>`).join('') + '</tr></thead><tbody>';
    for (const a of ts) {
      h += `<tr><th style="color:${G.esc(G.typeColor(a))}">${G.esc(G.typeName(a))}</th>`;
      for (const d of ts) {
        const v = G.mult(a, [d]);
        const c = v > 1.01 ? 'u' : v < 0.99 ? (v <= 0.5 ? 'z' : 'd') : '';
        h += `<td class="${c}" title="${G.esc(G.typeName(a))} contra ${G.esc(G.typeName(d))}: ×${G.num(v, 2)}">${c ? G.num(v, 2) : ''}</td>`;
      }
      h += '</tr>';
    }
    return h + '</tbody></table><div class="nx-note2" style="text-align:center">Filas: tipo del ataque · columnas: tipo del rival · multiplicadores del juego.</div>';
  }

  // ---- listas con buscador
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  function listItems(G, ns) {
    const q = norm(query.trim());
    if (tab === 'moves') {
      return (ns.Moves.ALL || Object.values(ns.Moves.BY_ID)).map((d) => ({ id: d.id, label: G.moveName(d.id), key: norm(G.moveName(d.id) + ' ' + d.name + ' ' + d.id + ' ' + G.typeName(d.type)), g: G.typeChip(d.type) }))
        .filter((x) => !q || x.key.includes(q)).sort((a, b) => a.label.localeCompare(b.label, 'es'));
    }
    if (tab === 'items') {
      return ((ns.Items && ns.Items.LIST) || []).map((d) => ({ id: d.id, label: G.tr(d.name), key: norm(G.tr(d.name) + ' ' + d.name + ' ' + d.id) }))
        .filter((x) => !q || x.key.includes(q)).sort((a, b) => a.label.localeCompare(b.label, 'es'));
    }
    if (tab === 'mons') {
      const out = [];
      for (const p of ns.DEX || []) {
        const name = G.monName(p.dex);
        if (q && !norm(name + ' ' + p.dex + ' ' + (p.types || []).map(G.typeName).join(' ')).includes(q) && String(p.dex) !== q.replace('#', '')) continue;
        const r = G.tierOf(p.dex);
        out.push({ id: p.dex, label: name, n: '#' + String(p.dex).padStart(3, '0'), g: (p.types || []).map(G.typeChip).join('') + (r ? G.tierBadge(r) : '') });
      }
      return out;
    }
    return [];
  }

  function render() {
    const G = NX.gd, ns = NX.ns;
    if (!root || !G || !ns) return;
    const inRun = NX.inRun();
    if (tab === 'run' && !inRun) tab = 'moves';
    const box = root.querySelector('.nx-ebox');
    box.innerHTML = `<h2>Enciclopedia <small>F1 o Alt+I abre y cierra · Esc cierra</small><button class="nx-x" type="button">Cerrar</button></h2>
      <div class="nx-etabs">${TABS.map(([k, t]) => `<button type="button" data-tab="${k}" class="${k === tab ? 'on' : ''}" ${k === 'run' && !inRun ? 'disabled title="Solo en partida"' : ''}>${t}</button>`).join('')}</div>
      <div class="nx-ebody"></div>`;
    const body = box.querySelector('.nx-ebody');
    if (tab === 'run' || tab === 'types') {
      body.innerHTML = `<div class="nx-edet full">${tab === 'run' ? runView(G, ns) : typeChart(G)}</div>`;
      runSig = tab === 'run' ? sigOf() : '';
      return;
    }
    body.innerHTML = `<div class="nx-ecol"><input class="nx-eq" type="search" placeholder="Buscar por nombre, tipo o número…" value="${G.esc(query)}"><div class="nx-elist"></div></div><div class="nx-edet"></div>`;
    paintList();
    paintDetail();
  }
  function paintList() {
    const G = NX.gd, ns = NX.ns;
    const list = root.querySelector('.nx-elist');
    if (!list) return;
    const items = listItems(G, ns);
    if (sel[tab] == null && items.length) sel[tab] = items[0].id;
    list.innerHTML = items.slice(0, LIST_MAX).map((x) => `<button type="button" data-id="${G.esc(x.id)}" class="${String(x.id) === String(sel[tab]) ? 'on' : ''}">${x.n ? `<span class="n">${G.esc(x.n)}</span>` : ''}<span>${G.esc(x.label)}</span><span class="g">${x.g || ''}</span></button>`).join('') +
      (items.length > LIST_MAX ? `<div class="nx-note2">${items.length - LIST_MAX} más: afina la búsqueda.</div>` : '') +
      (!items.length ? '<div class="nx-note2">Nada coincide con la búsqueda.</div>' : '');
  }
  function paintDetail() {
    const G = NX.gd;
    const det = root.querySelector('.nx-edet');
    if (!det) return;
    const id = sel[tab];
    const pl = NX.inRun() ? NX.me() : null;
    let html = '';
    if (tab === 'moves' && id != null) html = `<div class="nx-card">${moveCard(G, id, pl)}${learnedBy(G, id)}</div>`;
    else if (tab === 'items' && id != null) html = `<div class="nx-card">${G.itemTip(id)}</div>${pl && pl.item === id ? '<div class="nx-note2">Lo llevas en esta partida.</div>' : ''}`;
    else if (tab === 'mons' && id != null) html = monDetail(G, +id);
    det.innerHTML = html || '<div class="nx-note2">Elige un elemento de la lista.</div>';
  }
  // Firma de la partida, para repintar "En partida" solo si algo cambió.
  function sigOf() {
    const pl = NX.me();
    if (!pl) return '';
    const wx = NX.ns.Weather && NX.ns.Weather.current;
    return [pl.level, pl.item, (pl.moves || []).map((m) => m.id + m.lvl + (m.evolved ? 'e' : '')).join(','), JSON.stringify(pl.statsTaken || {}), wx ? wx.name + Math.ceil((wx.left || 0) / 5) : ''].join('|');
  }

  function isOpen() { return !!root && !root.classList.contains('hidden'); }
  function toggle(force) {
    if (!root || !NX.ns || !NX.gd) return;
    const open = force != null ? force : !isOpen();
    if (open) {
      if (NX.inRun()) tab = 'run';
      // Abrir durante el combate pone la pausa del juego, si está disponible.
      const g = NX.ns.Game;
      if (NX.inRun() && g && g.state === 'playing' && NX.store.get('enc:pause', true) && typeof g.togglePause === 'function') {
        try { g.togglePause(); pausedByUs = g.state === 'paused'; } catch (_) { /* sigue sin pausa */ }
      }
      render();
    } else if (pausedByUs) {
      // Al cerrar, se quita la pausa que puso la enciclopedia.
      pausedByUs = false;
      const g = NX.ns.Game;
      if (g && g.state === 'paused' && typeof g.togglePause === 'function') { try { g.togglePause(); } catch (_) { /* queda en pausa */ } }
    }
    root.classList.toggle('hidden', !open);
    if (open) { const q = root.querySelector('.nx-eq'); if (q && !NX.inRun()) q.focus(); }
  }

  NX.feature({
    key: KEY,
    label: 'Enciclopedia',
    needs: (ns) => ns.Moves && ns.Moves.BY_ID && ns.DEX && ns.DEX_BY && ns.Types && NX.gd,
    setup() {
      NX.onReady(() => {
        root = document.createElement('div');
        root.id = 'nexus-enc';
        root.className = 'hidden';
        root.innerHTML = '<div class="nx-ebox"></div>';
        // Que los clics y teclas de la enciclopedia no lleguen al juego.
        for (const ev of ['pointerdown', 'mousedown', 'touchstart', 'click', 'wheel', 'keyup']) root.addEventListener(ev, (e) => e.stopPropagation());
        root.addEventListener('keydown', (e) => {
          if (e.key === 'Escape' || e.code === 'F1') { e.preventDefault(); e.stopPropagation(); toggle(false); return; }
          e.stopPropagation();
        });
        root.addEventListener('click', (e) => {
          try {
            if (e.target === root) return toggle(false);
            const t = e.target.closest('button');
            if (!t) return;
            if (t.classList.contains('nx-x')) return toggle(false);
            if (t.dataset.tab) { tab = t.dataset.tab; query = ''; NX.store.set('enc:tab', tab); render(); return; }
            if (t.dataset.mv) { tab = 'moves'; query = ''; sel.moves = t.dataset.mv; render(); return; }
            if (t.dataset.id != null && t.closest('.nx-elist')) {
              sel[tab] = t.dataset.id;
              root.querySelectorAll('.nx-elist button.on').forEach((b) => b.classList.remove('on'));
              t.classList.add('on');
              paintDetail();
            }
          } catch (err) { NX.trip(KEY, err); }
        });
        root.addEventListener('input', (e) => {
          if (!e.target.classList.contains('nx-eq')) return;
          query = e.target.value;
          try { paintList(); } catch (err) { NX.trip(KEY, err); }
        });
        document.body.appendChild(root);
        // "En partida" se repinta si cambian tus movimientos, nivel u objeto.
        setInterval(() => {
          if (!isOpen() || tab !== 'run') return;
          try { const s = sigOf(); if (s !== runSig) render(); } catch (err) { NX.trip(KEY, err); }
        }, 1000);
      });
      NX.keys.bind((e) => !e.repeat && (e.code === 'F1' || (e.altKey && !e.ctrlKey && e.code === 'KeyI')), () => {
        if (!NX.isOn(KEY)) return false;
        toggle();
        return true;
      });
      NX.keys.bind((e) => e.key === 'Escape' && isOpen(), () => { toggle(false); return true; });
    },
  });

  NX.settings.section({
    key: KEY,
    tab: 'Datos',
    title: 'Enciclopedia',
    keywords: 'enciclopedia buscador movimientos objetos pokemon tipos f1',
    render(el) {
      el.appendChild(NX.ui.toggle('Activado (F1 o Alt+I)', 'on:' + KEY, true));
      el.appendChild(NX.ui.toggle('Pausar el juego al abrirla en combate', 'enc:pause', true));
      el.appendChild(NX.ui.button('Abrir enciclopedia', () => { if (NX.togglePanel) NX.togglePanel(); toggle(true); }));
    },
  });
})();

// ---- features/endless.js
// Modo infinito: el Juicio de Arceus no llega a los 30:00, después del último
// jefe sigue llegando uno cada 3 minutos (los de la partida, por turnos y cada
// vuelta más fuertes) y desde el minuto 30 los enemigos se endurecen cada vez
// más rápido. Desde la pausa se puede invocar a Arceus o terminar la partida.
// Fuera del ranking, sin logros y sin tocar las estadísticas del juego;
// monedas y tickets como siempre. Récords propios en NX.store.
// Adaptado de PokeSurvivor Plus (MIT): startEndless, endEndless,
// endlessSnapshot, la curva de tiempo extra y la rotación de Enemies.BOSSES.
(() => {
  const KEY = 'endless';
  const REC_KEY = 'endless:rec';
  const HIST_KEY = 'endless:hist';
  const EXTRA = 200;        // jefes añadidos a la lista de la partida
  const LATE_FROM = 30;     // minuto desde el que crece la curva
  const LATE_K = 0.000374;  // minuto 45 x1.09 · 60 x1.4 · 75 x2.1 · 90 x3.8
  const lateK = (t) => { const m = Math.max(0, t / 60 - LATE_FROM); return Math.exp(Math.min(30, LATE_K * m * m)); };

  const rec = () => NX.store.get(REC_KEY, {}) || {};

  function startEndless(ns, p, c) {
    // Jefes cada 3 minutos tras el último de la partida, rotando los cinco.
    const B = ns.Enemies.BOSSES;
    if (Array.isArray(B) && B.length && !B.__nxEndless) {
      const base = B.slice(0, 5), top = base[base.length - 1];
      const every = (base[1] && base[0] ? base[1].at - base[0].at : 180) || 180;
      const from = top.at;
      for (let i = 0; i < EXTRA; i++) {
        const b = base[i % base.length], cyc = Math.floor(i / base.length);
        const k = 1 + 0.35 * cyc, kd = 1 + 0.12 * cyc;
        B.push(Object.assign({}, b, {
          at: from + every * (i + 1), hp: Math.round(top.hp * k), dmg: top.dmg * kd, xp: top.xp,
          shotDmg: (top.shotDmg || b.shotDmg || 0) * kd,
        }));
      }
      B.__nxEndless = true;
    }
    c.warned = 0;
    c.best = rec().time || 0;
  }

  function endEndless(ns, p, c, info) {
    const beat = [];
    if (info.how !== 'replaced' && info.time >= 10) {
      const r = rec();
      if (info.time > (r.time || 0)) { r.time = Math.floor(info.time); r.dex = info.dex; r.mon = info.mon; r.at = Date.now(); beat.push('tiempo'); }
      if (info.level > (r.level || 0)) { r.level = info.level; beat.push('nivel'); }
      if (info.kills > (r.kills || 0)) { r.kills = info.kills; beat.push('bajas'); }
      r.runs = (r.runs || 0) + 1;
      NX.store.set(REC_KEY, r);
      const h = NX.store.get(HIST_KEY, []) || [];
      h.unshift({ time: Math.floor(info.time), level: info.level, kills: info.kills, dex: info.dex, mon: info.mon, at: Date.now(), arceus: !!c.arceus });
      if (h.length > 10) h.length = 10;
      NX.store.set(HIST_KEY, h);
    }
    return '<b>∞ Partida infinita</b> · fuera del ranking · sin logros · tus estadísticas no cambian' +
      (beat.length ? `<br><b style="color:#ffe27a">Nuevo récord infinito (${beat.join(', ')})</b>` : '');
  }

  function cfg() {
    const useMods = !!NX.store.get('endless:mods', false) && NX.modsApi && NX.isOn('mods');
    return {
      key: KEY,
      label: '∞ Infinito',
      noJudge: true,
      noAch: true,
      restoreStats: true,
      mods: useMods ? NX.modsApi.values() : null,
      onStart: startEndless,
      onEnd: endEndless,
      // La curva de tiempo extra sobre enemigos y jefes.
      scale(o, t) {
        const k = lateK(t || 0);
        return k === 1 ? o : Object.assign({}, o, { hp: o.hp * k, dmg: o.dmg * Math.pow(k, 0.7) });
      },
      // Los legendarios de las grietas se crean sin esa escala.
      onAdd(e, ns) {
        if (!e.legend || e.__nxLate) return;
        e.__nxLate = true;
        const k = lateK((ns.Game.st && ns.Game.st.time) || 0);
        if (k > 1) {
          e.maxHp = Math.round(e.maxHp * k); e.hp = Math.round(e.hp * k);
          const d = Math.pow(k, 0.7); e.dmg *= d; if (e.shotDmg) e.shotDmg *= d;
        }
      },
      onTick(ns, p, c) {
        const t = ns.Game.st.time || 0;
        if (c.warned < 1 && t >= 1800) { c.warned = 1; NX.toast('Sin Juicio: los Pokémon salvajes se hacen cada vez más fuertes'); }
        if (c.warned < 2 && t >= 3600) { c.warned = 2; NX.toast('Minuto 60: la dificultad sube cada vez más rápido'); }
        if (c.best && !c.beatToast && t > c.best) { c.beatToast = true; NX.toast('Nuevo récord infinito: ' + NX.fmtTime(t)); }
      },
      pillExtra: (ns, c) => (c.arceus ? 'Arceus viene en camino' : c.best ? 'Récord ' + NX.fmtTime(c.best) : ''),
      pause: [
        {
          label: 'Invocar a Arceus', confirm: '¿Invocar a Arceus? Termina la partida',
          show: (c, ns) => !c.arceus && !ns.Judgment.active,
          onClick(c) { if (!c) return; c.arceus = true; NX.toast('Has invocado a Arceus · el Juicio empieza al continuar'); NX.modes.resume(); },
        },
        {
          label: 'Terminar partida', confirm: '¿Terminar la partida ahora?',
          onClick(c, ns) { ns.Game.quit(); },
        },
      ],
    };
  }

  function stats(el, h) {
    const r = rec();
    const items = [
      ['Mejor tiempo', r.time ? NX.fmtTime(r.time) : '·'],
      ['Mejor nivel', r.level ? String(r.level) : '·'],
      ['Más bajas', r.kills ? String(r.kills) : '·'],
      ['Partidas', String(r.runs || 0)],
    ];
    if (h) h.cards(el, items);
    else el.appendChild(NX.ui.note(items.map(([k, v]) => k + ': ' + v).join(' · ')));
    if (r.time && r.mon) el.appendChild(NX.ui.note(`Récord con ${r.mon} el ${NX.modes.date(r.at)}.`));
  }

  NX.feature({
    key: KEY,
    label: 'Modo infinito',
    needs: (ns) => !!NX.modes && ns.Enemies && Array.isArray(ns.Enemies.BOSSES) && ns.Judgment && typeof ns.Game.quit === 'function',
    setup() {
      NX.modes.register({
        key: KEY,
        title: '∞ Infinito',
        order: 1,
        render(el, h) {
          h.desc(el, 'Sin Juicio a los 30:00. Tras el último jefe llega otro cada 3 minutos, cada vuelta más fuerte, y desde el minuto 30 los enemigos se endurecen cada vez más rápido. Desde la pausa puedes invocar a Arceus o terminar. Fuera del ranking, sin logros y sin cambiar tus estadísticas; monedas y tickets como siempre.');
          stats(el, h);
          if (NX.isOn('mods')) el.appendChild(NX.ui.toggle('Aplicar mis modificadores', 'endless:mods', false));
          const hist = NX.store.get(HIST_KEY, []) || [];
          h.table(el, ['Tiempo', 'Nivel', 'Bajas', 'Pokémon', 'Fecha'], hist.slice(0, 5).map((e) => [NX.fmtTime(e.time), String(e.level), String(e.kills), e.mon || NX.modes.dexName(e.dex), NX.modes.date(e.at)]), 'Todavía no has jugado una partida infinita.');
          h.foot(el, 'Jugar infinito', () => NX.modes.launch(cfg()));
        },
      });
    },
  });

  NX.settings.section({
    key: KEY,
    tab: 'Modos',
    title: 'Modo infinito',
    keywords: 'infinito endless arceus juicio récord',
    render(el) {
      el.appendChild(NX.ui.toggle('Activado', 'on:' + KEY, true));
      stats(el, null);
      el.appendChild(NX.ui.button('Borrar récords', () => { NX.store.set(REC_KEY, {}); NX.store.set(HIST_KEY, []); NX.toast('Récords del modo infinito borrados'); }));
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

// ---- features/fps.js
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
      requestAnimationFrame(tick);
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
    requestAnimationFrame(tick);
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

// ---- features/fx.js
// Efectos reducidos: opacidad y tamaño de los efectos de ataque, por separado
// para los tuyos y los de tus aliados. Los proyectiles y orbes saben quién
// los lanzó; los cortes, rayos, anillos y sprites que se crean mientras uno
// de tus ataques (o de un aliado) se ejecuta se marcan al crearse. Luego se
// dibujan por grupos, cada uno con su opacidad y tamaño. Solo cambia el
// aspecto: las áreas de daño se calculan en otro lado.
// Adaptado de PokeSurvivor Plus (MIT).
(() => {
  const KEY = 'fx';
  const set = { me: { a: 1, s: 1 }, mate: { a: 1, s: 1 } };
  let plain = true, on = true;
  const readOpts = () => {
    on = NX.isOn(KEY);
    const g = (k, d) => NX.clamp((+NX.store.get(k, d) || 0) / 100, 0, 2);
    set.me.a = on ? g('fx:meA', 100) : 1;
    set.me.s = on ? g('fx:meS', 100) || 1 : 1;
    set.mate.a = on ? g('fx:mateA', 100) : 1;
    set.mate.s = on ? g('fx:mateS', 100) || 1 : 1;
    plain = set.me.a === 1 && set.me.s === 1 && set.mate.a === 1 && set.mate.s === 1;
  };
  readOpts();
  setInterval(readOpts, 1000);

  const ALPHA = Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, 'globalAlpha');
  // Toda opacidad que el juego ponga mientras dibuja un grupo se multiplica por a.
  function withAlpha(ctx, a, fn) {
    if (a >= 0.999) return fn();
    ctx.save();
    ALPHA.set.call(ctx, a);
    Object.defineProperty(ctx, 'globalAlpha', {
      configurable: true,
      get() { return ALPHA.get.call(this) / a; },
      set(v) { ALPHA.set.call(this, NX.clamp(+v || 0, 0, 1) * a); },
    });
    try { return fn(); } finally { delete ctx.globalAlpha; ctx.restore(); }
  }

  NX.feature({
    key: KEY,
    label: 'Efectos reducidos',
    needs: (ns) => ns.FX && typeof ns.FX.draw === 'function' && ns.VFX && typeof ns.VFX.draw === 'function' &&
      ns.Projectiles && typeof ns.Projectiles.draw === 'function' && typeof ns.Projectiles.all === 'function' &&
      ns.Combat && typeof ns.Combat.tick === 'function',
    setup(ns) {
      const { Combat, FX, VFX, Projectiles } = ns;
      let owner = null, scaleNow = 1;
      const arrays = new Set();
      const push = Array.prototype.push;

      // Quién está atacando ahora.
      const tick = Combat.tick;
      Combat.tick = function (dt, pl) {
        const was = owner;
        owner = pl && pl === NX.me() ? 'me' : was;
        try { return tick.apply(this, arguments); } finally { owner = was; }
      };
      if (typeof Combat.ghostCast === 'function') {
        const ghost = Combat.ghostCast;
        Combat.ghostCast = function () {
          const was = owner;
          owner = 'mate';
          try { return ghost.apply(this, arguments); } finally { owner = was; }
        };
      }

      // Marca lo que crean las funciones de efectos mientras alguien ataca.
      for (const name of ['slash', 'beam', 'ring', 'burst', 'sp']) {
        const f = FX[name];
        if (typeof f !== 'function') continue;
        FX[name] = function () {
          if (!owner || plain) return f.apply(this, arguments);
          const own = owner, sc = set[own].s;
          Array.prototype.push = function (...items) {
            for (const o of items) {
              if (!o || typeof o !== 'object' || o.__nxOwn) continue;
              o.__nxOwn = own;
              if (sc !== 1) {
                if (typeof o.scale === 'number') o.scale *= sc;
                if (typeof o.arc === 'number' && typeof o.radius === 'number') o.radius *= sc;
                if (typeof o.width === 'number' && typeof o.len === 'number') o.width *= sc;
                if (typeof o.r1 === 'number') { o.r1 *= sc; o.r0 *= sc; }
              }
              arrays.add(this);
            }
            return push.apply(this, items);
          };
          try { return f.apply(this, arguments); } finally { Array.prototype.push = push; }
        };
      }

      // Tamaño de proyectiles y orbes.
      const vdraw = VFX.draw;
      VFX.draw = function (ctx, shape, pal, x, y, o) {
        if (scaleNow !== 1 && o) o = Object.assign({}, o, { scale: (o.scale || 1) * scaleNow });
        return vdraw.call(this, ctx, shape, pal, x, y, o);
      };

      // Dibujo por grupos: lo demás, luego lo tuyo, luego lo de aliados.
      const grouped = (lists, ownerOf, drawAll, ctx) => {
        const saved = lists.map((a) => a.slice());
        const fill = (who) => lists.forEach((a, i) => { a.length = 0; for (const o of saved[i]) if (ownerOf(o) === who) push.call(a, o); });
        try {
          fill(null);
          drawAll();
          for (const who of ['me', 'mate']) {
            const st = set[who];
            if (st.a <= 0.01) continue;
            fill(who);
            if (!lists.some((a) => a.length)) continue;
            scaleNow = st.s;
            try { withAlpha(ctx, st.a, drawAll); } finally { scaleNow = 1; }
          }
        } finally {
          lists.forEach((a, i) => { a.length = 0; push.apply(a, saved[i]); });
        }
      };

      const pdraw = Projectiles.draw;
      Projectiles.draw = function (ctx) {
        if (plain) return pdraw.apply(this, arguments);
        const list = Projectiles.all();
        if (!Array.isArray(list)) return pdraw.apply(this, arguments);
        const self = NX.me();
        const ownerOf = (p) => ((!p.friendly && !p.orb) || !p.owner ? null : p.owner === self ? 'me' : 'mate');
        grouped([list], ownerOf, () => pdraw.call(this, ctx), ctx);
      };
      const fdraw = FX.draw;
      FX.draw = function (ctx) {
        if (plain || !arrays.size) return fdraw.apply(this, arguments);
        grouped([...arrays], (o) => o.__nxOwn || null, () => fdraw.call(this, ctx), ctx);
      };
    },
  });

  const pct = (v) => v + ' %';
  NX.settings.section({
    key: KEY,
    title: 'Efectos reducidos',
    tab: 'Rendimiento',
    keywords: 'efectos ataque opacidad tamaño partículas fx reducir',
    render(el) {
      el.appendChild(NX.ui.toggle('Activado', 'on:' + KEY, true, readOpts));
      el.appendChild(NX.ui.range('Opacidad de tus ataques', 'fx:meA', 0, 100, 5, 100, pct, readOpts));
      el.appendChild(NX.ui.range('Tamaño de tus ataques', 'fx:meS', 50, 150, 5, 100, pct, readOpts));
      el.appendChild(NX.ui.range('Opacidad de los aliados', 'fx:mateA', 0, 100, 5, 100, pct, readOpts));
      el.appendChild(NX.ui.range('Tamaño de los aliados', 'fx:mateS', 50, 150, 5, 100, pct, readOpts));
      el.appendChild(NX.ui.button('Restablecer', () => {
        for (const k of ['fx:meA', 'fx:meS', 'fx:mateA', 'fx:mateS']) NX.store.set(k, 100);
        readOpts();
        if (NX.togglePanel) { NX.togglePanel(); NX.togglePanel(); }
      }));
      el.appendChild(NX.ui.note('Solo cambia el aspecto. El área de daño de cada ataque sigue igual.'));
    },
  });
})();

// ---- features/gacha.js
// Gacha rápido: usar todos los tickets de una vez, saltar la animación de la
// tragamonedas y ver qué falta en cada región.
// Adaptado de PokeSurvivor Plus (MIT).
//
// "Usar todos" dispara el botón ×100 (o ×10) del propio juego, así que guarda,
// revisa logros y muestra las cartas como siempre. Solo durante esa llamada
// Gacha.pull gasta todos los tickets en tandas de diez: primero los ×10, luego
// los normales de cien en cien y de diez en diez. Cada tanda de diez conserva
// la épica garantizada. Los tickets normales que no llegan a diez se quedan.
(() => {
  const KEY = 'gacha';
  let armed = false, forceSkip = false;

  const ns = () => NX.ns;
  const $ = (id) => document.getElementById(id);
  const T = (s) => { try { return typeof ns().T === 'function' ? ns().T(s) : s; } catch (_) { return s; } };
  const fmt = (n) => (+n || 0).toLocaleString((ns().I18n && ns().I18n.locale) || 'es');
  const icon = (name, px) => { try { return ns().Icons.html(name, px); } catch (_) { return ''; } };
  const save = () => ns().DB && ns().DB.save;
  const skipOn = () => NX.isOn(KEY) && NX.store.get('gacha:skip', false);

  // Cuántas tiradas salen con los tickets actuales sin romper la regla ×10.
  function plan() {
    const t = (save() && save().tickets) || {};
    const t10 = Math.max(0, +t.t10 || 0), raw = Math.max(0, +t.t1 || 0);
    const t1 = raw - (raw % 10);
    return { t10, t1, pulls: t10 * 10 + t1, left: raw % 10 };
  }

  // Confirmación con el estilo de los diálogos del juego.
  function confirmBox(title, html, okText) {
    return new Promise((resolve) => {
      const el = document.createElement('section');
      el.className = 'scr dim nx-dlg';
      el.style.zIndex = 90;
      el.innerHTML = `<div class="box center" style="max-width:440px"><h3>${NX.esc(title)}</h3><p class="sub">${html}</p>
        <div class="row" style="justify-content:center"><button class="btn ghost" data-a="no" type="button">Cancelar</button>
        <button class="btn gold" data-a="yes" type="button">${NX.esc(okText)}</button></div></div>`;
      const key = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); done(false); } };
      const done = (v) => { el.remove(); removeEventListener('keydown', key, true); resolve(v); };
      el.addEventListener('click', (e) => {
        const a = e.target.closest('[data-a]');
        if (a) done(a.dataset.a === 'yes'); else if (e.target === el) done(false);
      });
      addEventListener('keydown', key, true);
      document.body.appendChild(el);
      el.querySelector('[data-a="yes"]').focus();
    });
  }

  function wrapGame() {
    const { Gacha, Slots } = ns();
    const pull = Gacha.pull;
    Gacha.pull = function (sv, n, gen) {
      if (!armed) return pull.apply(this, arguments);
      armed = false;
      const t = sv.tickets || {};
      const out = [];
      let iris = 0;
      const take = (count, kind) => {
        const r = pull.call(this, sv, count, gen, kind);
        if (!r) return false;
        out.push(...r);
        if (r.iris) iris = r.iris;
        return true;
      };
      while ((t.t10 || 0) >= 10 && take(100, 't10'));
      while ((t.t10 || 0) >= 1 && take(10, 't10'));
      while ((t.t1 || 0) >= 100 && take(100, 't1'));
      while ((t.t1 || 0) >= 10 && take(10, 't1'));
      if (!out.length) return null;
      out.iris = iris;
      return out;
    };

    // Saltar: la tirada ya está hecha y guardada cuando empieza la animación,
    // así que basta con resolver al instante y pulsar el "Saltar" del juego
    // para que las cartas salgan todas juntas.
    const play = Slots.play;
    Slots.play = function () {
      if (forceSkip || skipOn()) {
        forceSkip = false;
        const b = $('pull-skip');
        try { if (b && typeof b.onclick === 'function') b.onclick(); } catch (_) { /* del juego */ }
        return Promise.resolve();
      }
      return play.apply(this, arguments);
    };
  }

  async function pullAll() {
    const p = plan();
    if (!p.pulls) return;
    const name = ($('banner-title') && $('banner-title').textContent.trim()) || 'este banner';
    const parts = [];
    if (p.t10) parts.push(`${icon('ticket10', 14)} ${fmt(p.t10)} ticket${p.t10 > 1 ? 's' : ''} ×10`);
    if (p.t1) parts.push(`${icon('ticket', 14)} ${fmt(p.t1)} tickets normales`);
    const ok = await confirmBox('Usar todos los tickets',
      `Vas a gastar ${parts.join(' y ')} en <b>${NX.esc(name)}</b>: <b class="gold">${fmt(p.pulls)} tiradas</b>, siempre de diez en diez, así que cada tanda conserva su épica garantizada.` +
      (p.left ? ` Te quedan ${p.left} ticket${p.left > 1 ? 's' : ''} suelto${p.left > 1 ? 's' : ''}, que no alcanzan para un ×10.` : ''),
      `Tirar ×${fmt(p.pulls)}`);
    if (!ok) return;
    const q = plan(); // se vuelve a leer: el guardado pudo cambiar
    if (!q.pulls) return;
    // El ×100 del juego arma el resumen y ordena las cartas; con menos de
    // cien tiradas se usa el ×10, que no agrupa por decenas.
    const btn = $(q.pulls >= 100 ? 'pull-100' : 'pull-10');
    if (!btn || typeof btn.onclick !== 'function') { NX.toast('No se encontró el botón de tirada del juego'); return; }
    armed = true;
    forceSkip = true;
    try { btn.onclick(); } finally {
      // Si sigue armado, el juego no llegó a tirar (otra tirada en curso).
      armed = false;
      forceSkip = false;
    }
  }

  // ---- faltantes por región
  let openGen = null, lastSig = '';
  function regionRows() {
    const { Gacha, DEX, Sprites } = ns();
    const sv = save();
    const owned = sv.owned || {}, shiny = sv.shiny || {}, pity = sv.pity || {};
    const banners = [...Gacha.BANNERS];
    if (Gacha.SPOOKY && Gacha.isOpen(Gacha.SPOOKY.gen)) banners.unshift(Gacha.SPOOKY);
    return banners.map((b) => {
      const pool = b.event ? DEX.filter((p) => p.types.includes('ghost')) : DEX.filter((p) => p.gen === b.gen);
      const missing = pool.filter((p) => !owned[p.dex]);
      const shinyPool = pool.filter((p) => { try { return Sprites.hasShiny(p.dex); } catch (_) { return false; } });
      return {
        gen: b.gen, name: T(b.name), total: pool.length, have: pool.length - missing.length, missing,
        shTotal: shinyPool.length, shHave: shinyPool.filter((p) => shiny[p.dex]).length,
        left: (Gacha.PITY_5 || 70) - (pity[b.gen] || 0),
      };
    });
  }
  function drawRegions(box) {
    if (!save()) return;
    const rows = regionRows();
    const sig = JSON.stringify(rows.map((r) => [r.have, r.shHave, r.left])) + openGen + box.open;
    if (sig === lastSig) return;
    lastSig = sig;
    const total = rows.reduce((n, r) => n + (r.gen === (ns().Gacha.SPOOKY || {}).gen ? 0 : r.missing.length), 0);
    const most = rows.reduce((a, r) => (r.missing.length > a.missing.length ? r : a), rows[0]);
    box.innerHTML = `<summary>Faltantes por región (${fmt(total)})</summary>
      <table><thead><tr><th>Región</th><th class="n">Tienes</th><th class="n">Faltan</th><th class="n">${icon('shiny', 10)} Shiny</th><th class="n">Legendaria garantizada en</th><th></th></tr></thead><tbody>${
      rows.map((r) => `<tr${r === most && r.missing.length ? ' class="most" title="El banner donde más te falta"' : ''}>
        <td>${NX.esc(r.name)}</td><td class="n">${r.have}/${r.total}</td><td class="n">${r.missing.length}</td>
        <td class="n">${r.shHave}/${r.shTotal}</td><td class="n">${r.left} tiradas</td>
        <td>${r.missing.length ? `<button type="button" data-gen="${r.gen}">${openGen === r.gen ? 'Ocultar' : 'Ver'}</button>` : 'Completa'}</td></tr>${
        openGen === r.gen ? `<tr><td colspan="6" class="miss">${r.missing.map((p) => `#${String(p.dex).padStart(3, '0')} ${NX.esc(p.name)}`).join(' · ')}</td></tr>` : ''}`).join('')
    }</tbody></table>`;
  }

  NX.css(`#nx-pull-all{margin-top:10px;width:100%}
#nx-pull-all .nx-c{margin-left:6px;opacity:.9}
.nx-gacha-skip{display:flex;align-items:center;gap:8px;cursor:pointer;margin-top:8px}
.nx-gacha-skip input{width:18px;height:18px;margin:0;cursor:pointer;accent-color:#ffd23f}
#nx-regions{margin-top:8px}
#nx-regions summary{cursor:pointer;font-weight:700}
#nx-regions table{width:100%;border-collapse:collapse;margin-top:6px;font-size:13px}
#nx-regions th,#nx-regions td{text-align:left;padding:4px 6px;border-bottom:1px solid rgba(255,255,255,.15)}
#nx-regions .n{text-align:right;font-variant-numeric:tabular-nums}
#nx-regions tr.most td{color:var(--gold,#ffd23f)}
#nx-regions button{font:inherit;font-size:12px;font-weight:700;color:inherit;background:none;border:1px solid currentColor;border-radius:4px;padding:1px 6px;cursor:pointer}
#nx-regions .miss{font-size:12.5px;line-height:1.5;padding:4px 6px 8px}
.nx-off{display:none!important}`);

  function buildUi() {
    const pity = $('gacha-pity'), ten = $('pull-10');
    if (!pity || !ten || $('nx-pull-all')) return;
    const all = document.createElement('button');
    all.id = 'nx-pull-all';
    all.type = 'button';
    all.className = 'btn';
    all.dataset.sfx = 'none';
    ten.parentElement.after(all);
    all.addEventListener('click', () => { all.blur(); pullAll(); });

    const skip = document.createElement('label');
    skip.className = 'note nx-gacha-skip';
    skip.innerHTML = '<input type="checkbox"> Saltar siempre la animación de las tiradas';
    const box = skip.querySelector('input');
    box.addEventListener('change', () => NX.store.set('gacha:skip', box.checked));
    pity.after(skip);

    const regions = document.createElement('details');
    regions.id = 'nx-regions';
    regions.className = 'note';
    regions.open = NX.store.get('gacha:regionsOpen', false);
    regions.addEventListener('toggle', () => { NX.store.set('gacha:regionsOpen', regions.open); lastSig = ''; drawRegions(regions); });
    regions.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-gen]');
      if (!b) return;
      e.preventDefault();
      openGen = openGen === +b.dataset.gen ? null : +b.dataset.gen;
      lastSig = '';
      drawRegions(regions);
    });
    skip.after(regions);

    const refresh = () => {
      const on = NX.isOn(KEY) && !!save();
      all.classList.toggle('nx-off', !on);
      skip.classList.toggle('nx-off', !on);
      regions.classList.toggle('nx-off', !on || !NX.store.get('gacha:regions', true));
      if (!on) return;
      box.checked = NX.store.get('gacha:skip', false);
      const p = plan();
      all.innerHTML = `<b>Usar todos los tickets</b><span class="nx-c">${p.t10 ? `${icon('ticket10', 16)} ×${fmt(p.t10)} ` : ''}${icon('ticket', 16)} ×${fmt(p.t1 + p.left)} · ${fmt(p.pulls)} tiradas</span>`;
      all.disabled = p.pulls <= 0;
      all.title = p.pulls ? 'Gasta todos tus tickets en el banner abierto, de diez en diez' : 'Necesitas al menos 10 tickets o un ticket ×10';
      try { drawRegions(regions); } catch (err) { NX.trip(KEY, err); }
    };
    setInterval(() => { if (NX.shown('scr-gacha')) refresh(); }, 600);
    refresh();
  }

  NX.feature({
    key: KEY,
    label: 'Gacha rápido',
    needs: (n) => n.Gacha && typeof n.Gacha.pull === 'function' && n.Slots && typeof n.Slots.play === 'function' &&
      n.DB && n.DEX && n.Sprites && Array.isArray(n.Gacha.BANNERS) && !!$('pull-10') && !!$('gacha-pity'),
    setup() {
      wrapGame();
      buildUi();
    },
  });

  NX.settings.section({
    key: KEY,
    tab: 'Menús',
    title: 'Gacha rápido',
    keywords: 'tickets tirar todos animación saltar región faltan legendaria',
    render(el) {
      el.appendChild(NX.ui.toggle('Activado', 'on:' + KEY, true));
      el.appendChild(NX.ui.toggle('Saltar siempre la animación de las tiradas', 'gacha:skip', false));
      el.appendChild(NX.ui.toggle('Mostrar faltantes por región', 'gacha:regions', true));
      el.appendChild(NX.ui.note('Agrega "Usar todos los tickets" en el Gacha. Tira de diez en diez con las funciones del juego y pide confirmación antes de gastar.'));
    },
  });
})();

// ---- features/gamedata.js
// Lecturas compartidas de datos del juego para los módulos de datos
// (tooltips, tiers, build recomendada, evoluciones y enciclopedia). No es un
// módulo con interruptor: solo expone NX.gd. Todo se lee de forma perezosa
// desde NX.ns, así que puede cargarse en cualquier orden.
// Partes adaptadas de PokeSurvivor Plus (MIT): filas de stats de movimientos,
// tooltips de objeto y clima, y el enganche a las cartas de subida de nivel.
(() => {
  const G = (NX.gd = {});
  const esc = (s) => NX.esc(s == null ? '' : s);
  G.esc = esc;
  const ns = () => NX.ns || {};

  // ---- textos localizados (el juego guarda sus nombres en español y los
  // traduce con I18n según el idioma elegido)
  G.tr = (s) => { try { const I = ns().I18n; return I && I.t ? I.t(s) : s; } catch (_) { return s; } };
  G.T = (s, cat) => { try { return typeof ns().T === 'function' ? ns().T(s, cat) : G.tr(s); } catch (_) { return s; } };
  G.cap = (s) => String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1);
  G.typeName = (t) => { const N = (ns().U && ns().U.TYPE_NAME) || {}; return G.tr(N[t] || G.cap(t)); };
  G.typeColor = (t) => ((ns().U && ns().U.TYPE_COLOR) || {})[t] || '#8fa3c4';
  G.typeChip = (t) => `<span class="nx-tchip" style="background:${esc(G.typeColor(t))}">${esc(G.typeName(t))}</span>`;
  G.moveDef = (id) => { const M = ns().Moves; return (M && M.BY_ID && M.BY_ID[id]) || null; };
  G.moveName = (id) => { const d = G.moveDef(id); return d ? G.T(d.name, 'move') : String(id); };
  G.itemDef = (id) => { const I = ns().Items; return (I && I.BY && I.BY[id]) || null; };
  G.itemName = (id) => { const d = G.itemDef(id); return d ? G.tr(d.name) : String(id); };
  G.monName = (dex) => {
    const p = ns().DEX_BY && ns().DEX_BY[dex];
    return p ? G.tr(p.name) : '#' + dex;
  };
  G.catName = (m) => {
    const N = (ns().Stats && ns().Stats.NAME) || {};
    const c = m.cat || (m.stat === 'patk' ? 'physical' : m.stat === 'satk' ? 'special' : '');
    return c && N[c] ? G.tr(N[c]) : '';
  };
  const KIND = {
    projectile: 'Proyectil', melee: 'Cuerpo a cuerpo', beam: 'Rayo', orbit: 'Órbita', nova: 'Onda', aura: 'Aura', buff: 'Mejora',
    boomerang: 'Bumerán', chain: 'Cadena', mine: 'Minas', meteor: 'Meteoro', turret: 'Torreta', dash: 'Embestida', trail: 'Rastro',
    cone: 'Cono', charge: 'Carga', spin: 'Giro', vortex: 'Vórtice', bounce: 'Rebote', homing: 'Teledirigido', stun: 'Aturdir',
    shove: 'Empujón', quake: 'Temblor',
  };
  G.kindName = (k) => KIND[k] || G.cap(k);
  const num = (v, d = 0) => (+v).toLocaleString('es-VE', { maximumFractionDigits: d, minimumFractionDigits: 0 });
  G.num = num;

  // ---- números de un movimiento (adaptado de moveRows de PokeSurvivor Plus)
  // Los físicos pegan con Ataque y los especiales con At. Esp.
  G.atkOf = (pl, m) => {
    if (!pl) return 1;
    try { if (typeof pl.atkFor === 'function') return +pl.atkFor(m) || 1; } catch (_) { /* respaldo */ }
    if (typeof pl.atk === 'number') return pl.atk || 1;
    return (pl.baseAtk || 1) * (pl.atkMul || 1);
  };
  G.moveRows = (m, pl) => {
    const atk = pl ? G.atkOf(pl, m) : 1, cdm = (pl && pl.cdMul) || 1;
    const rows = [];
    const row = (k, v) => rows.push([k, v]);
    if (m.kind === 'buff') {
      if (m.amount != null) row('Potencia', `+${Math.round(m.amount * 100)} %`);
      if (m.dur) row('Dura', `${num(m.dur, 1)} s`);
      if (m.stacks) row('Acumulaciones', m.stacks);
    } else if (m.dmg != null) {
      row('Daño', `${Math.round(m.dmg * atk)}${m.count > 1 ? ` × ${m.count}` : ''}`);
    }
    if (m.cd && m.kind !== 'orbit') row('Recarga', `${num(m.cd * cdm, 2)} s`);
    if (m.count > 1 && m.kind === 'orbit') row('Orbes', m.count);
    if (m.pierce > 0) row('Perforación', m.pierce);
    if (m.radius) row(m.kind === 'aura' || m.kind === 'orbit' ? 'Radio' : 'Alcance', Math.round(m.radius));
    if (m.dur && m.kind !== 'buff') row('Duración', `${num(m.dur, 1)} s`);
    if (m.burn) row('Efecto', 'Quema');
    if (m.poison) row('Efecto', 'Envenena');
    if (m.slow) row('Ralentiza', `${Math.round(m.slow * 100)} %`);
    if (m.homing) row('Teledirigido', 'Sí');
    if (m.knock) row('Empuje', Math.round(m.knock));
    return rows;
  };
  G.instance = (id, lvl = 1) => {
    const M = ns().Moves;
    if (M && typeof M.instance === 'function') return M.instance(id, lvl);
    const d = G.moveDef(id);
    return d ? Object.assign({ lvl, def: d }, d) : null;
  };

  // ---- evoluciones de movimientos. Un movimiento evoluciona cuando está en
  // su nivel máximo y ya tomaste la mejora de stat que pide (Moves.EVO).
  G.statTitle = (sid) => {
    const S = (ns().LevelUp && ns().LevelUp.STATS) || [];
    const s = S.find((x) => x.id === sid);
    const N = (ns().Moves && ns().Moves.NEED_NAME) || {};
    return G.tr((s && s.title) || N[sid] || sid);
  };
  G.evo = (id, pl) => {
    const M = ns().Moves, d = G.moveDef(id);
    if (!M || !M.EVO || !d) return null;
    const need = M.EVO[id];
    if (!need) return null;
    const max = d.maxLvl || 5;
    let info = null;
    try {
      const fake = Object.assign(G.instance(id, max), { evolved: false });
      info = typeof M.evoInfo === 'function' ? M.evoInfo(fake, (pl && pl.statsTaken) || {}) : null;
    } catch (_) { info = null; }
    if (!info) return null;
    const have = !!(pl && pl.statsTaken && pl.statsTaken[need] > 0);
    return { need, needName: G.statTitle(need), name: G.T(info.name, 'move'), text: G.tr(info.text || ''), max, have };
  };
  // Copia evolucionada de un movimiento, sin tocar el original.
  G.evolvedCopy = (m) => {
    const M = ns().Moves;
    if (!M || typeof M.evolve !== 'function' || !m || m.evolved) return null;
    try { const c = Object.assign({}, m); return M.evolve(c) ? c : null; } catch (_) { return null; }
  };

  // ---- efectividad de tipos con los multiplicadores reales del juego
  G.TYPES = () => Object.keys((ns().U && ns().U.TYPE_NAME) || (ns().Types && ns().Types.CHART) || {});
  G.mult = (atk, defTypes) => {
    const T = ns().Types;
    try { return T && typeof T.mult === 'function' ? T.mult(atk, defTypes) : 1; } catch (_) { return 1; }
  };
  // Ataque de un tipo contra cada tipo: grupos por multiplicador.
  G.offense = (type) => groupBy(G.TYPES().map((t) => [t, G.mult(type, [t])]));
  // Defensa de un Pokémon: cada tipo atacante contra sus tipos.
  G.defense = (types) => groupBy(G.TYPES().map((t) => [t, G.mult(t, types || [])]));
  function groupBy(pairs) {
    const by = new Map();
    for (const [t, v] of pairs) {
      if (Math.abs(v - 1) < 0.01) continue;
      const k = Math.round(v * 100) / 100;
      if (!by.has(k)) by.set(k, []);
      by.get(k).push(t);
    }
    return [...by.entries()].sort((a, b) => b[0] - a[0]);
  }
  G.effHtml = (groups, label) => {
    if (!groups.length) return '';
    return groups.map(([v, ts]) => `<div class="nx-eff"><b class="${v > 1 ? 'up' : 'dn'}">×${num(v, 2)}</b>${label ? `<small>${esc(label(v))}</small>` : ''}<span>${ts.map(G.typeChip).join('')}</span></div>`).join('');
  };

  // ---- tarjetas HTML para tooltips y la enciclopedia
  G.rowsHtml = (rows) => rows.map(([k, v]) => `<div class="kv"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('');
  G.moveTip = (m, pl, opts = {}) => {
    const col = G.typeColor(m.type);
    const max = (m.def && m.def.maxLvl) || m.maxLvl || 5;
    const cat = G.catName(m);
    const desc = m.desc || (m.def && m.def.desc);
    let next = '';
    if (!opts.noNext) {
      try {
        const M = ns().Moves, nx = M && typeof M.nextUpText === 'function' && m.def && m.lvl ? M.nextUpText(m) : null;
        if (nx) next = `<div class="nx">Siguiente nivel: ${esc(G.tr(nx))}</div>`;
      } catch (_) { /* sin siguiente nivel */ }
    }
    let evo = '';
    if (!opts.noEvo && !m.evolved) {
      const e = G.evo(m.id, pl);
      if (e) {
        const left = Math.max(0, e.max - (m.lvl || 1));
        const miss = [left ? `${left} nivel${left > 1 ? 'es' : ''}` : '', e.have || !pl ? '' : e.needName].filter(Boolean);
        evo = `<div class="nx ev">Evoluciona a ${esc(e.name)} con ${esc(e.needName)} en Nv. ${e.max}${pl ? (miss.length ? ` · falta: ${esc(miss.join(' y '))}` : ' · lista') : ''}</div>`;
      }
    }
    const lv = opts.lvLabel != null ? opts.lvLabel : `Nv. ${m.lvl || 1}/${max}`;
    return `<div class="hd"><b style="color:${esc(col)}">${esc(G.T(m.name, 'move'))}${m.evolved ? ' ★' : ''}</b><span class="lv">${esc(lv)}</span></div>
      <div class="tags">${G.typeChip(m.type)}${cat ? `<span>${esc(cat)}</span>` : ''}<span>${esc(G.kindName(m.kind))}</span></div>
      ${desc ? `<div class="ds">${esc(G.tr(desc))}</div>` : ''}
      <div class="st">${G.rowsHtml(G.moveRows(m, pl))}</div>${next}${evo}${opts.extra || ''}`;
  };
  G.itemTip = (id) => {
    const d = G.itemDef(id);
    if (!d) return '';
    return `<div class="hd"><b style="color:#ffd23f">${esc(G.tr(d.name))}</b><span class="lv">Objeto</span></div>${d.desc ? `<div class="ds">${esc(G.tr(d.desc))}</div>` : ''}`;
  };
  G.weatherTip = (wx, pl) => {
    const rows = Object.entries(wx.mult || {}).map(([t, m]) => `<div class="kv"><span>${G.typeChip(t)} ataques</span><b style="color:${m >= 1 ? '#7dff9a' : '#ff8a96'}">×${num(m, 2)} daño</b></div>`);
    const mine = (pl && pl.mon && pl.mon.types) || [];
    const notes = [];
    if (wx.safe) notes.push(`Quien no sea ${wx.safe.map(G.typeName).join(', ')} pierde vida poco a poco${wx.slow ? ' y va más lento' : ''}.`);
    else if (wx.slow) notes.push('Todos se mueven un poco más lento.');
    notes.push('Afecta igual a ti, a tus aliados y a los enemigos.');
    let you = '';
    if (mine.length && wx.safe) {
      const hurt = !mine.some((t) => wx.safe.includes(t));
      you = hurt ? 'Tu Pokémon sufre este clima: cuida tu vida.' : 'Tu Pokémon está a salvo de este clima.';
    }
    return `<div class="hd"><b style="color:${esc(wx.color || '#fff')}">${esc(G.tr(wx.name))}</b><span class="lv">${Math.ceil(wx.left || 0)} s</span></div>
      <div class="st" style="margin-top:4px">${rows.join('')}</div>
      ${notes.map((n) => `<div class="ds" style="margin:4px 0 0">${esc(n)}</div>`).join('')}${you ? `<div class="nx">${esc(you)}</div>` : ''}`;
  };

  // Estilo común de tarjetas (tooltip flotante y fichas de la enciclopedia).
  NX.css(`.nx-card{font:12px/1.3 var(--font,'Pixelify',system-ui,sans-serif);color:#fff;text-shadow:1px 1px 0 #0a1430}
.nx-card .hd{display:flex;gap:10px;align-items:baseline;justify-content:space-between}
.nx-card .hd b{font-size:13px}
.nx-card .lv{color:#b9cbf0;font-size:11px;white-space:nowrap}
.nx-card .tags{display:flex;flex-wrap:wrap;gap:4px;margin:3px 0 4px}
.nx-card .tags span{font-size:10px;padding:0 6px;border-radius:8px;background:#0b1838;text-shadow:none}
.nx-card .ds{color:#dfe8fb;font-size:11px;margin-bottom:4px}
.nx-card .st{display:grid;gap:1px}
.nx-card .kv{display:flex;gap:12px;font-size:11px}
.nx-card .kv span{flex:1;color:#b9cbf0}
.nx-card .nx{margin-top:4px;color:#ffd23f;font-size:11px}
.nx-card .nx.ev{color:#9fe8ff}
.nx-card hr{border:0;border-top:1px solid rgba(255,255,255,.15);margin:6px 0}
.nx-tchip{display:inline-block;padding:0 6px;border-radius:7px;color:#fff;font-size:10px;text-shadow:1px 1px 0 #0a1430;margin:0 2px 2px 0}
.nx-eff{display:flex;align-items:baseline;gap:6px;font-size:11px;margin:2px 0}
.nx-eff b{min-width:38px}.nx-eff b.up{color:#7dff9a}.nx-eff b.dn{color:#ff8a96}.nx-eff small{color:#b9cbf0;min-width:70px}
#nexus-tip{position:fixed;z-index:100004;pointer-events:none;width:max-content;max-width:260px;padding:7px 9px 8px;
  background:linear-gradient(#2c519f,#1a3170);border:2px solid #f4f8ff;outline:2px solid #0b1838;border-radius:8px;box-shadow:inset 0 0 0 2px #5b83d6,0 4px 0 #0a1430}
#nexus-tip[hidden]{display:none}`);

  // Tooltip flotante compartido.
  let tipEl = null;
  G.tip = {
    show(html, x, y, below) {
      if (!tipEl) {
        tipEl = document.createElement('div');
        tipEl.id = 'nexus-tip';
        tipEl.className = 'nx-card';
        tipEl.hidden = true;
        document.body.appendChild(tipEl);
      }
      if (tipEl.dataset.k !== html) { tipEl.innerHTML = html; tipEl.dataset.k = html; }
      tipEl.hidden = false;
      const w = tipEl.offsetWidth, h = tipEl.offsetHeight;
      tipEl.style.left = NX.clamp(x - w / 2, 6, Math.max(6, innerWidth - w - 6)) + 'px';
      tipEl.style.top = NX.clamp(below ? y : y - h - 10, 6, Math.max(6, innerHeight - h - 6)) + 'px';
    },
    hide() { if (tipEl && !tipEl.hidden) tipEl.hidden = true; },
  };

  // ---- SurvivorTiers (lo inyecta el cascarón en NX.data.tiers)
  let tierCache = null;
  G.tiers = () => {
    const t = NX.data && NX.data.tiers;
    if (!t || !Array.isArray(t.rows) || !t.rows.length) return null;
    if (tierCache && tierCache.src === t) return tierCache;
    const byDex = new Map();
    for (const r of t.rows) if (r && r.dex) byDex.set(+r.dex, r);
    tierCache = { src: t, rows: t.rows, byDex, total: t.rows.length, patch: t.patch || '', patchDate: parseDate(t.patch), fetchedAt: t.fetchedAt || 0 };
    return tierCache;
  };
  G.tierOf = (dex) => { const t = G.tiers(); return (t && t.byDex.get(+dex)) || null; };
  G.TIER_COL = { S: '#ff5c5c', A: '#ff9f43', B: '#ffd93d', C: '#6bcb77', D: '#4d96ff', E: '#9aa6b5', F: '#9aa6b5' };
  G.styleName = (s) => (s === 'melee' ? 'cuerpo a cuerpo' : s === 'ranged' ? 'a distancia' : String(s || ''));
  G.TIER_SITE = 'https://survivortiers.pages.dev/';
  G.credit = () => `Datos: <a href="${G.TIER_SITE}" target="_blank" rel="noopener">SurvivorTiers</a> de @fildotai`;
  const MONTHS = { ene: 0, jan: 0, feb: 1, mar: 2, abr: 3, apr: 3, may: 4, jun: 5, jul: 6, ago: 7, aug: 7, sep: 8, set: 8, oct: 9, nov: 10, dic: 11, dec: 11 };
  function parseDate(s) {
    if (!s) return null;
    const m = /(\d{1,2})\s+(?:de\s+)?([a-záéíóú]{3})[a-záéíóú.]*\s+(?:de\s+)?(\d{4})/i.exec(String(s));
    if (m && MONTHS[m[2].toLowerCase().slice(0, 3)] !== undefined) return new Date(+m[3], MONTHS[m[2].toLowerCase().slice(0, 3)], +m[1]);
    const d = new Date(s);
    return isNaN(d) ? null : d;
  }
  G.fmtDate = (d) => (d ? d.toLocaleDateString('es-VE', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
  // Fecha de la última actualización del juego (version.json, mismo origen).
  let gameDateP = null;
  G.gameDate = null;
  G.loadGameDate = () => {
    if (!gameDateP) {
      gameDateP = fetch('/version.json', { cache: 'no-store' }).then((r) => r.json()).then((j) => {
        const d = j && j.at ? new Date(j.at) : null;
        G.gameDate = d && !isNaN(d) ? d : null;
        return G.gameDate;
      }).catch(() => null);
    }
    return gameDateP;
  };
  // true si el parche de SurvivorTiers es anterior a la última versión del juego.
  G.tierStale = () => {
    const t = G.tiers();
    if (!t || !G.gameDate) return false;
    const ref = t.patchDate || (t.fetchedAt ? new Date(t.fetchedAt) : null);
    if (!ref) return false;
    const day = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    return day(ref) < day(G.gameDate);
  };
  G.tierMetaHtml = () => {
    const t = G.tiers();
    if (!t) return '';
    const when = t.patch ? 'parche del ' + esc(t.patch) : t.fetchedAt ? 'descargado el ' + esc(G.fmtDate(new Date(t.fetchedAt))) : '';
    const stale = G.tierStale() ? ` <span class="nx-stale" title="El juego se actualizó el ${esc(G.fmtDate(G.gameDate))}">posiblemente desactualizado</span>` : '';
    return `${G.credit()}${when ? ' · ' + when : ''}${stale}`;
  };
  NX.css(`.nx-stale{display:inline-block;padding:0 6px;border-radius:7px;background:#d98a1f;color:#1b1528;font-size:10px;text-shadow:none}
.nx-tier{display:inline-grid;place-items:center;min-width:17px;height:17px;padding:0 3px;box-sizing:border-box;border-radius:5px;background:var(--tc);color:#1b1528;
  font:700 12px/1 var(--font,'Pixelify',system-ui,sans-serif);text-shadow:none;box-shadow:0 0 0 2px #0b1838;vertical-align:middle}`);
  G.tierBadge = (r, cls = '') => {
    const t = G.tiers();
    return `<span class="nx-tier ${cls}" style="--tc:${G.TIER_COL[r.tier] || '#9aa6b5'}" title="Tier ${esc(r.tier)} · puesto ${r.rank} de ${t ? t.total : '?'} en SurvivorTiers">${esc(r.tier)}</span>`;
  };

  // ---- cartas de subida de nivel. Un solo enganche a LevelUp.offer y
  // RunUI.showLevelUp guarda las ofertas; cada módulo registra una función
  // que decora las cartas (debe poder repetirse sin duplicar nada).
  const decos = [];
  let offers = [], hooked = false, pend = 0;
  G.lvl = {
    offers: () => offers,
    on(key, fn) { decos.push({ key, fn }); G.lvl.hook(); },
    refresh() { schedule(); },
    hook() {
      if (hooked) return;
      const N = ns();
      if (!N.LevelUp || typeof N.LevelUp.offer !== 'function' || !N.RunUI || typeof N.RunUI.showLevelUp !== 'function') throw new Error('Faltan LevelUp.offer o RunUI.showLevelUp');
      hooked = true;
      const offer = N.LevelUp.offer, showLv = N.RunUI.showLevelUp;
      N.LevelUp.offer = function () {
        const r = offer.apply(this, arguments);
        if (Array.isArray(r)) { offers = r; schedule(); }
        return r;
      };
      N.RunUI.showLevelUp = function (level, list) {
        if (Array.isArray(list)) offers = list;
        const r = showLv.apply(this, arguments);
        decorate();
        return r;
      };
      NX.onReady(() => {
        const box = document.getElementById('cards');
        if (box) new MutationObserver(schedule).observe(box, { childList: true });
      });
    },
  };
  function schedule() {
    if (pend) return;
    pend = setTimeout(() => { pend = 0; decorate(); }, 0);
  }
  function decorate() {
    const box = document.getElementById('cards');
    if (!box) return;
    const cards = box.querySelectorAll(':scope > .card');
    if (!cards.length || cards.length !== offers.length) return;
    const pl = NX.me();
    cards.forEach((el, i) => {
      const o = offers[i];
      if (!o) return;
      // Seguridad: la carta debe mostrar el título de su oferta.
      const nm = el.querySelector('.nm');
      const title = String(o.title || '').split(' ')[0];
      if (nm && title && !nm.textContent.includes(title)) return;
      const [type, id] = String(o.key || '').split(':');
      for (const d of decos) {
        try { d.fn(el, { type, id, offer: o, index: i }, pl, NX.isOn(d.key)); } catch (err) { NX.trip(d.key, err); }
      }
    });
  }
})();

// ---- features/hitboxes.js
// Hitboxes: los círculos de colisión que usa el juego. Jugador (r), aliados,
// enemigos (r, jefes en naranja) y proyectiles (r). Solo dibujo: se pintan
// sobre el mundo y debajo del HUD. Alt+B los muestra u oculta.
// Radios tomados de cómo los usa PokeSurvivor Plus (MIT).
(() => {
  const KEY = 'hitboxes';
  const SHOWN = 'hitbox:shown';
  const opt = {};
  const readOpts = () => {
    opt.me = NX.store.get('hitbox:me', true) !== false;
    opt.foe = NX.store.get('hitbox:foe', true) !== false;
    opt.shot = NX.store.get('hitbox:shot', true) !== false;
    opt.mine = !!NX.store.get('hitbox:mine', false);
    opt.lift = NX.store.get('hitbox:lift', true) !== false;
  };
  readOpts();
  setInterval(readOpts, 1000);

  // Un solo trazo por grupo para no pagar un dibujo por enemigo.
  function group(ctx, list, fill, stroke, lw) {
    if (!list.length) return;
    ctx.beginPath();
    for (const [x, y, r] of list) { ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, Math.PI * 2); }
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = lw;
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }

  function draw(ctx, W, H, pl, ns) {
    if (!NX.store.get(SHOWN, false)) return;
    // El juego dibuja los cuerpos LIFT unidades más arriba que su posición;
    // al subir todos los círculos lo mismo, la geometría no cambia.
    const C = ns.Camera, k = C.scale, L = C.left(), T = C.top() + (opt.lift ? +ns.LIFT || 0 : 0);
    const vis = (x, y, r) => x > -r && y > -r && x < W + r && y < H + r;
    const add = (arr, o) => {
      if (!o || o.dead || !(o.r > 0)) return;
      const x = (o.x - L) * k, y = (o.y - T) * k, r = o.r * k;
      if (vis(x, y, r)) arr.push([x, y, r]);
    };
    if (opt.foe && ns.EnemyMgr && ns.EnemyMgr.all) {
      const foes = [], bosses = [];
      for (const e of ns.EnemyMgr.all()) add(e && e.boss ? bosses : foes, e);
      group(ctx, foes, 'rgba(255,90,100,.14)', 'rgba(255,90,100,.8)', 1);
      group(ctx, bosses, 'rgba(255,170,60,.2)', 'rgba(255,170,60,.95)', 2);
    }
    if (opt.shot && ns.Projectiles && ns.Projectiles.all) {
      const bad = [], good = [];
      for (const p of ns.Projectiles.all()) {
        if (!p) continue;
        if (!p.friendly) add(bad, p);
        else if (opt.mine) add(good, p);
      }
      group(ctx, good, 'rgba(127,224,255,.12)', 'rgba(127,224,255,.75)', 1);
      group(ctx, bad, 'rgba(255,79,216,.22)', 'rgba(255,79,216,.95)', 1.5);
    }
    if (opt.me) {
      const mates = [];
      if (ns.Coop && ns.Coop.active && Array.isArray(ns.Coop.mates)) for (const m of ns.Coop.mates) if (m && m.connected) add(mates, m.pl);
      group(ctx, mates, 'rgba(120,200,255,.18)', 'rgba(120,200,255,.95)', 1.5);
      const me = [];
      add(me, pl);
      group(ctx, me, 'rgba(95,224,138,.22)', 'rgba(95,224,138,1)', 2);
      if (me.length) { ctx.fillStyle = '#5fe08a'; ctx.fillRect(Math.round(me[0][0]) - 1, Math.round(me[0][1]) - 1, 2, 2); }
    }
  }

  NX.feature({
    key: KEY,
    label: 'Hitboxes',
    needs: (ns) => ns.Camera && ns.Camera.left && ns.EnemyMgr && ns.EnemyMgr.all && ns.Projectiles && ns.Projectiles.all,
    setup(ns) {
      NX.hudLayers.push({ key: KEY, under(ctx, w, h, pl) { if (pl) draw(ctx, w, h, pl, ns); } });
    },
  });

  NX.keys.bind((e) => e.altKey && e.code === 'KeyB' && !e.ctrlKey && !e.metaKey && NX.isOn(KEY), () => {
    const on = !NX.store.get(SHOWN, false);
    NX.store.set(SHOWN, on);
    NX.toast(on ? 'Hitboxes visibles' : 'Hitboxes ocultas');
    return true;
  });

  NX.settings.section({
    key: KEY,
    title: 'Hitboxes',
    tab: 'Partida',
    keywords: 'hitbox colisión círculo radio depuración',
    render(el) {
      el.appendChild(NX.ui.toggle('Activado', 'on:' + KEY, true));
      el.appendChild(NX.ui.toggle('Visibles (Alt+B)', SHOWN, false));
      el.appendChild(NX.ui.toggle('Tú y tus aliados', 'hitbox:me', true, readOpts));
      el.appendChild(NX.ui.toggle('Enemigos y jefes', 'hitbox:foe', true, readOpts));
      el.appendChild(NX.ui.toggle('Proyectiles enemigos', 'hitbox:shot', true, readOpts));
      el.appendChild(NX.ui.toggle('Tus proyectiles y orbes', 'hitbox:mine', false, readOpts));
      el.appendChild(NX.ui.toggle('Alinear con los sprites', 'hitbox:lift', true, readOpts));
      el.appendChild(NX.ui.note('Verde: tú. Azul: aliados. Rojo: enemigos. Naranja: jefes. Magenta: proyectiles enemigos.'));
    },
  });
})();

// ---- features/hud-new.js
// HUD Nexus: el HUD rediseñado al estilo de PokeSurvivor Plus. Abajo, un
// bloque con el retrato del Pokémon, una barra de vida grande con estela, la
// barra de experiencia a lo ancho, los huecos de movimientos con enfriamiento
// y nivel, el objeto equipado y los estados activos. En co-op, tarjetas del
// equipo arriba a la izquierda. En pantallas táctiles, una variante compacta
// que respeta la posición de la barra del juego y deja libre el joystick.
//
// Cómo convive con el HUD del juego: mientras el juego dibuja su HUD se
// recortan (clip) solo las zonas que este módulo vuelve a dibujar (tira de
// experiencia, bloque de vida arriba a la izquierda con la lista co-op y barra
// de movimientos con el objeto), y sus botones de movimientos se descartan
// porque aquí se registran los propios con Touch.addButton. El reloj y la
// barra del jefe quedan a cargo de boss-plate.js (o del juego si está
// apagado), el clima, los orbes, las flechas y el botón de pausa siguen siendo
// del juego. Todo se dibuja en la capa "over" del núcleo, es decir, dentro de
// la escala de hud-scale.js.
// Adaptado de PokeSurvivor Plus (MIT): setupHud, replacedAreas, drawNewHud,
// drawPortrait, emotionFor, bar, pill y las tarjetas del equipo.
(() => {
  const KEY = 'hudnew';
  const INK = '#0b1838', EDGE = '#e8eef8', BOND = '#ff8ad8', GOLD = '#ffd23f';
  const FONT = (wt, s) => `${wt} ${s}px Pixelify,"Segoe UI",system-ui,sans-serif`;
  const F = new Map(); // fuentes ya armadas, por peso * 100 + tamaño
  const font = (wt, s) => { const k = wt * 100 + s; let f = F.get(k); if (!f) { f = FONT(wt, s); F.set(k, f); } return f; };
  const NUM = Array.from({ length: 100 }, (_, i) => String(i)); // textos de números chicos

  // ---- opciones (en memoria; se releen al cambiar y cada segundo)
  const opt = {};
  const readOpts = () => {
    opt.on = NX.isOn(KEY) && NX.store.get('hudnew:style', 'nexus') !== 'classic';
    opt.hpNum = NX.store.get('hudnew:hpnum', 'values');
    opt.portrait = NX.store.get('hudnew:portrait', true) !== false;
    opt.team = NX.store.get('hudnew:team', true) !== false;
    opt.cdNum = NX.store.get('hudnew:cdnum', true) !== false;
  };
  readOpts();
  setInterval(readOpts, 1000);

  // Colores de "Colores del HUD" (boss-plate.js), si está cargado.
  const pal = () => NX.hudPalette || null;
  const hpCol = (frac) => { const p = pal(); return p ? p.hp(frac) : '#ff5f6d'; };

  // ---- dibujo básico
  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  // Caja con borde oscuro por fuera y borde claro por dentro.
  function frame(ctx, x, y, w, h, r, fill, edge, lw) {
    rr(ctx, x - 1.5, y - 1.5, w + 3, h + 3, r + 1.5);
    ctx.fillStyle = INK; ctx.fill();
    rr(ctx, x, y, w, h, r);
    ctx.fillStyle = fill; ctx.fill();
    ctx.lineWidth = lw || 2; ctx.strokeStyle = edge || EDGE; ctx.stroke();
  }
  function outlined(ctx, text, x, y, fill, lw) {
    ctx.lineWidth = lw || 3; ctx.strokeStyle = 'rgba(11,24,56,.9)'; ctx.lineJoin = 'round';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = fill;
    ctx.fillText(text, x, y);
  }
  // Ancho de texto con caché (los textos del HUD se repiten cuadro a cuadro).
  const widths = new Map(); // fuente -> (texto -> ancho)
  function textW(ctx, text, f) {
    let m = widths.get(f);
    if (!m) { m = new Map(); widths.set(f, m); }
    let w = m.get(text);
    if (w === undefined) {
      if (m.size > 300) m.clear();
      ctx.font = f;
      w = Math.ceil(ctx.measureText(text).width);
      m.set(text, w);
    }
    return w;
  }
  // Etiqueta redondeada; devuelve su ancho.
  function pill(ctx, x, y, text, fg, bg, edge, size) {
    size = size || 8;
    const f = font(700, size);
    const tw = textW(ctx, text, f) + 10, th = size + 5;
    rr(ctx, x, y, tw, th, th / 2);
    ctx.fillStyle = bg || INK; ctx.fill();
    ctx.lineWidth = 1.25; ctx.strokeStyle = edge || EDGE; ctx.stroke();
    ctx.font = f;
    ctx.fillStyle = fg || '#fff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + 5, y + th / 2 + 0.5);
    ctx.textBaseline = 'alphabetic';
    return tw;
  }
  // Barra con marco: fondo, relleno con brillo arriba y estela opcional.
  function bar(ctx, x, y, w, h, frac, col, back, trail) {
    rr(ctx, x - 1.5, y - 1.5, w + 3, h + 3, 3);
    ctx.fillStyle = INK; ctx.fill();
    ctx.fillStyle = back;
    ctx.fillRect(x, y, w, h);
    frac = frac > 0 ? (frac < 1 ? frac : 1) : 0;
    if (trail > frac) {
      ctx.fillStyle = 'rgba(255,236,190,.8)';
      ctx.fillRect(x + w * frac, y, w * (Math.min(1, trail) - frac), h);
    }
    const fw = Math.round(w * frac);
    if (fw > 0) {
      ctx.fillStyle = col;
      ctx.fillRect(x, y, fw, h);
      ctx.fillStyle = 'rgba(255,255,255,.28)';
      ctx.fillRect(x, y, fw, Math.max(1, Math.round(h * 0.28)));
      ctx.fillStyle = 'rgba(0,0,0,.18)';
      ctx.fillRect(x, y + h - Math.max(1, Math.round(h * 0.2)), fw, Math.max(1, Math.round(h * 0.2)));
    }
  }

  // ---- retratos con los sprites del propio juego
  // Primer cuadro de la animación (Idle, o Hurt / Faint para dolor y caído),
  // mirando abajo a la derecha, recortado a la silueta. Se cachea por Pokémon.
  const portraits = new Map();
  function portrait(ns, dex, shiny, skin, anim) {
    if (!dex) return null;
    // Clave numérica (sin crear textos por cuadro); con disfraz, de texto.
    const key = skin ? dex + '|' + (shiny ? 1 : 0) + '|' + skin + '|' + anim : dex * 8 + (shiny ? 4 : 0) + (anim === 'Idle' ? 0 : anim === 'Hurt' ? 1 : 2);
    let p = portraits.get(key);
    const now = performance.now();
    if (p && (p.c || p.bad || now < p.retry)) return p.c;
    if (!p) { p = { c: null, bad: false, retry: 0, tries: 0 }; portraits.set(key, p); }
    p.retry = now + 400;
    try {
      const meta = ns.SPRITE_META && ns.SPRITE_META[dex];
      const m = meta && meta.a && meta.a[anim];
      if (!m) { p.bad = true; return null; }
      const sh = ns.Sprites.sheet(dex, anim, !!shiny, skin || '');
      if (!sh || sh.failed) { if (++p.tries > 20) p.bad = true; return null; }
      const img = sh.img;
      if (!sh.ready || !img || !img.complete || !img.naturalWidth) return null;
      const rows = Math.max(1, Math.round(img.naturalHeight / m.h));
      const row = rows >= 8 ? 1 : 0;
      const col = anim === 'Idle' ? 0 : Math.max(0, (m.n || 1) - 1);
      const c = document.createElement('canvas');
      c.width = m.w; c.height = m.h;
      const g = c.getContext('2d');
      g.drawImage(img, col * m.w, row * m.h, m.w, m.h, 0, 0, m.w, m.h);
      // Recorte a la silueta (si el navegador deja leer los píxeles).
      let x0 = 0, y0 = 0, x1 = m.w - 1, y1 = m.h - 1;
      try {
        const d = g.getImageData(0, 0, m.w, m.h).data;
        x0 = m.w; y0 = m.h; x1 = -1; y1 = -1;
        for (let y = 0; y < m.h; y++) {
          for (let x = 0; x < m.w; x++) {
            if (d[(y * m.w + x) * 4 + 3] > 24) {
              if (x < x0) x0 = x; if (x > x1) x1 = x;
              if (y < y0) y0 = y; if (y > y1) y1 = y;
            }
          }
        }
        if (x1 < 0) { x0 = 0; y0 = 0; x1 = m.w - 1; y1 = m.h - 1; }
      } catch (_) { /* lienzo sin permiso de lectura: cuadro completo */ }
      const out = document.createElement('canvas');
      out.width = x1 - x0 + 1; out.height = y1 - y0 + 1;
      out.getContext('2d').drawImage(c, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
      p.c = out;
    } catch (err) { p.bad = true; }
    if (portraits.size > 80) for (const [k, v] of portraits) { if (k !== key && v.c) { portraits.delete(k); break; } }
    return p.c;
  }

  // Dolor un momento tras un golpe de verdad, desmayo mientras está caído.
  // Adaptado de emotionFor de PokeSurvivor Plus (MIT).
  const emo = new Map();
  function feel(key, hp, maxHp, dead) {
    let s = emo.get(key);
    const now = performance.now();
    if (!s) { s = { last: hp, until: 0 }; emo.set(key, s); }
    if (hp < s.last - Math.max(1, (maxHp || 1) * 0.04)) s.until = now + 550;
    s.last = hp;
    if (dead) return 2;
    return s.until > now ? 1 : 0; // 0 normal, 1 dolor, 2 caído
  }

  function drawPortrait(ctx, ns, x, y, size, mon, tint, state) {
    const down = state === 2, hurt = state === 1;
    const ec = down ? '#ff5f6d' : hurt ? '#ffffff' : EDGE;
    frame(ctx, x, y, size, size, 6, 'rgba(18,34,74,.95)', ec, 2);
    rr(ctx, x + 2, y + 2, size - 4, size - 4, 4);
    ctx.fillStyle = tint || 'rgba(95,200,255,.3)';
    ctx.fill();
    let img = null;
    if (opt.portrait && mon.dex) {
      if (down) img = portrait(ns, mon.dex, mon.shiny, mon.skin, 'Faint');
      else if (hurt) img = portrait(ns, mon.dex, mon.shiny, mon.skin, 'Hurt');
      if (!img) img = portrait(ns, mon.dex, mon.shiny, mon.skin, 'Idle');
    }
    ctx.save();
    rr(ctx, x + 2, y + 2, size - 4, size - 4, 4);
    ctx.clip();
    if (img) {
      const room = size - 8;
      let s = Math.min(room / img.width, room / img.height);
      if (s >= 2) s = Math.floor(s);
      const dw = Math.round(img.width * s), dh = Math.round(img.height * s);
      const jx = hurt ? Math.round(Math.sin(performance.now() / 22) * 1.5) : 0;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, Math.round(x + (size - dw) / 2) + jx, Math.round(y + size - 3 - dh), dw, dh);
    } else {
      ctx.font = font(800, Math.round(size * 0.45));
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fff';
      ctx.fillText(String(mon.name || '?').charAt(0).toUpperCase(), x + size / 2, y + size * 0.66);
    }
    if (down) { ctx.fillStyle = 'rgba(40,10,30,.45)'; ctx.fillRect(x, y, size, size); }
    else if (hurt) { ctx.fillStyle = 'rgba(255,60,80,.28)'; ctx.fillRect(x, y, size, size); }
    ctx.restore();
  }

  // ---- geometría
  // Dónde dibuja el juego su barra de movimientos (copiado de su HUD.draw).
  function gameBar(ns, W, H, pl, touch) {
    const T = ns.Touch;
    const n = Math.max(1, pl.slots.length);
    const tw = n * 54 + 9 * (n - 1);
    let sx = (W - tw) / 2;
    let sy = H - 54 - 18 - (touch ? Math.min(28, T.safeArea().bottom) : 0);
    const spot = touch && typeof T.spot === 'function' && T.spot('bar');
    if (spot) {
      const m = Math.max(n, pl.maxMoves || 0), full = 72 + m * 54 + 9 * (m - 1);
      sx = NX.clamp(spot[0] * W - full / 2, 6, Math.max(6, W - full - 6)) + 54 + 18;
      sy = NX.clamp(spot[1] * H - 27, 24, H - 54 - 6);
    }
    return { sx, sy, tw, spot: !!spot };
  }

  // Zonas del HUD del juego que se reemplazan (unidades del HUD).
  // Adaptado de replacedAreas de PokeSurvivor Plus (MIT).
  function replaced(ns, W, H, pl, touch, out) {
    out.length = 0;
    const safe = ns.Touch.safeArea();
    const x0 = 16 + safe.left, y0 = 20 + safe.top;
    let chips = !!pl.power;
    if (!chips && pl.buffs) for (const k in pl.buffs) { if (pl.buffs[k] && pl.buffs[k].n > 0) { chips = true; break; } }
    let bottom = y0 + (chips ? 52 : 32);
    const C = ns.Coop;
    if (C && C.active && C.mates) {
      let n = 0;
      for (const m of C.mates) if (m.connected) n++;
      bottom = y0 + (chips ? 56 : 40) + n * 15 + 4;
    }
    out.push(0, 0, W, 8);
    out.push(0, 8, Math.max(320, x0 + 300), bottom - 8);
    const g = gameBar(ns, W, H, pl, touch);
    const right = g.sx + g.tw + (pl.bonds > 0 ? 80 : 8);
    out.push(g.sx - 80, g.sy - 26, right - (g.sx - 80), H - (g.sy - 26));
    // Orbes (y su descripción emergente), centrados sobre la barra del juego.
    if (hasOrbs(pl)) {
      const O = ns.Orbs, N = O.SLOTS || 4, ow = N * 40 + (N - 1) * 6, c = g.sx + g.tw / 2;
      let nb = 0;
      const ob = pl.orbBuff || {};
      for (const k in ob) if (ob[k] > 0) nb++;
      const l = c - Math.max(132, ow / 2 + 4), r = Math.max(c + 132, c + ow / 2 + 10 + 30 * nb + 30);
      out.push(l, g.sy - 70 - 100, r - l, 100 + 70 - 26);
    }
    out.push(0, H - 16, W, 16); // indicaciones de los primeros segundos
    return out;
  }

  const hasOrbs = (pl) => {
    if (pl.orbs) for (let i = 0; i < pl.orbs.length; i++) if (pl.orbs[i]) return true;
    const ob = pl.orbBuff;
    if (ob) for (const k in ob) if (ob[k] > 0) return true;
    return false;
  };

  // ---- estado por cuadro
  let armed = false, dropGame = false, selfAdd = false, curPl = null, touchNow = false;
  const zones = [];
  let hpTrail = { v: 1, last: 1, hold: 0, pl: null };
  // Manejadores fijos de los huecos (sin crear funciones en cada cuadro).
  const slotFns = [];
  const slotFn = (ns, i) => slotFns[i] || (slotFns[i] = () => {
    const p = curPl;
    if (!p || ns.Game.state !== 'playing' || p.active === i || !(p.slots[i] && p.slots[i][0])) return;
    p.setActive(i);
    try { ns.Audio.sfx('click'); } catch (_) { /* sin sonido */ }
  });
  const addBtn = (T, x, y, w, h, fn, pad) => { selfAdd = true; try { T.addButton(x, y, w, h, fn, pad); } finally { selfAdd = false; } };

  // Obstáculos del DOM (minimapa y medidor de daño) en píxeles CSS, a 4 Hz.
  let obstacles = [], canvasRect = null, hudCanvas = null;
  setInterval(() => {
    if (!opt.on || !NX.inRun()) return;
    const list = [];
    for (const id of ['nexus-map', 'nexus-meter']) {
      const e = document.getElementById(id);
      if (!e || e.classList.contains('hidden') || e.offsetParent === null) continue;
      const r = e.getBoundingClientRect();
      if (r.width > 0) list.push(r);
    }
    obstacles = list;
    canvasRect = hudCanvas ? hudCanvas.getBoundingClientRect() : null;
  }, 250);

  // Puntero (para la descripción de los orbes al pasar el mouse).
  const mouse = { x: -1, y: -1 };
  addEventListener('mousemove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY; }, { passive: true });
  addEventListener('resize', () => { canvasRect = hudCanvas ? hudCanvas.getBoundingClientRect() : null; });

  // ---- orbes: el juego los centra sobre su barra, donde ahora va la vida
  // grande; aquí se dibujan centrados sobre el bloque nuevo, con sus botones,
  // atajos (5-8 o X/Y con mando), enfriamiento y descripción emergente.
  const orbFns = [];
  const orbFn = (ns, i) => orbFns[i] || (orbFns[i] = () => { if (curPl && ns.Game.state === 'playing') ns.Orbs.use(curPl, i); });
  const orbLines = new Map();
  function orbDesc(ctx, ns, id) {
    let L = orbLines.get(id);
    if (L) return L;
    const def = ns.Orbs.BY[id] || {};
    const f = font(600, 11);
    ctx.font = f;
    const lines = [];
    let cur = '';
    for (const w of String(tr(ns, def.desc || '')).split(' ')) {
      const t = cur ? cur + ' ' + w : w;
      if (ctx.measureText(t).width > 240 && cur) { lines.push(cur); cur = w; } else cur = t;
    }
    if (cur) lines.push(cur);
    const name = String(tr(ns, def.name || id));
    let tw = textW(ctx, name, font(800, 12));
    ctx.font = f;
    for (const l of lines) tw = Math.max(tw, Math.ceil(ctx.measureText(l).width));
    L = { name, lines, w: tw + 16, col: def.col || EDGE };
    orbLines.set(id, L);
    return L;
  }
  function drawOrbs(ns, ctx, W, pl, cx, bottom, touch) {
    const O = ns.Orbs;
    if (!O || !O.BY || !hasOrbs(pl)) return;
    const T = ns.Touch, Icons = ns.Icons;
    const orbs = pl.orbs || [];
    const N = O.SLOTS || 4, SZ = 40, G = 6, tw = N * SZ + (N - 1) * G;
    const ox = Math.round(cx - tw / 2), oy = Math.round(bottom - SZ);
    const cd = NX.clamp(+O.cd || 0, 0, 1);
    const padOn = !!(ns.Pad && ns.Pad.name);
    const now = performance.now();
    let hover = -1;
    if (!touch && canvasRect && canvasRect.width && mouse.x >= 0) {
      const k = W / canvasRect.width, hx = (mouse.x - canvasRect.left) * k, hy = (mouse.y - canvasRect.top) * k;
      if (hy >= oy && hy <= oy + SZ) for (let i = 0; i < N; i++) { const x = ox + i * (SZ + G); if (orbs[i] && hx >= x && hx <= x + SZ) hover = i; }
    }
    const fresh = pl.orbNew && now - pl.orbNew.at < 3000 ? pl.orbNew.i : -1;
    for (let i = 0; i < N; i++) {
      const o = orbs[i], x = ox + i * (SZ + G);
      const def = o && O.BY[o.id];
      const sel = !!o && padOn && i === O.sel;
      frame(ctx, x, oy, SZ, SZ, 7, o ? 'rgba(20,24,44,.92)' : 'rgba(10,16,28,.45)', sel ? GOLD : def ? def.col : 'rgba(140,170,210,.25)', sel ? 2.5 : o ? 2 : 1.2);
      if (!o) continue;
      if (T && T.addButton) addBtn(T, x, oy, SZ, SZ, orbFn(ns, i), G / 2 + 2);
      if (Icons) Icons.draw(ctx, 'orb:' + o.id, x + (SZ - 24) / 2, oy + (SZ - 24) / 2, 24);
      if (cd > 0) { ctx.save(); rr(ctx, x, oy, SZ, SZ, 7); ctx.clip(); ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(x, oy, SZ, SZ * cd); ctx.restore(); }
      ctx.font = font(800, 9);
      ctx.textAlign = 'left';
      if (padOn) outlined(ctx, sel ? 'X' : 'Y', x + 3, oy + 10, sel ? GOLD : 'rgba(200,215,240,.8)', 2);
      else if (!touch) outlined(ctx, NUM[i + 5], x + 3, oy + 10, 'rgba(200,215,240,.8)', 2);
      if (o.n > 1) { ctx.textAlign = 'right'; outlined(ctx, '×' + o.n, x + SZ - 3, oy + SZ - 4, '#f4f8ff', 2); }
      if (i === fresh) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - (now - pl.orbNew.at) / 3000);
        rr(ctx, x - 3, oy - 3, SZ + 6, SZ + 6, 9);
        ctx.lineWidth = 3; ctx.strokeStyle = def ? def.col : GOLD; ctx.stroke();
        ctx.restore();
      }
    }
    // Efectos de orbes activos, a la derecha.
    const ob = pl.orbBuff || {};
    let bx = ox + tw + 10;
    for (const k in ob) {
      if (!(ob[k] > 0)) continue;
      if (Icons) Icons.draw(ctx, 'orb:' + k, bx, oy + 2, 24);
      ctx.font = font(800, 10);
      ctx.textAlign = 'center';
      outlined(ctx, NUM[Math.min(99, Math.ceil(ob[k]))] + 's', bx + 12, oy + 38, (O.BY[k] && O.BY[k].col) || '#fff', 2.5);
      bx += 30;
    }
    // Descripción: al pasar el mouse, el orbe elegido con mando o el recién recogido.
    let idx = hover;
    if (idx < 0 && padOn && orbs[O.sel]) idx = O.sel;
    if (idx < 0 && fresh >= 0 && orbs[fresh]) idx = fresh;
    if (idx < 0) return;
    const L = orbDesc(ctx, ns, orbs[idx].id);
    const lines = hover >= 0 ? L.lines.length : 0;
    const th = 20 + 14 * lines;
    const tx = NX.clamp(ox + idx * (SZ + G) + SZ / 2 - L.w / 2, 4, W - L.w - 4), ty = oy - 8 - th;
    rr(ctx, tx, ty, L.w, th, 8);
    ctx.fillStyle = 'rgba(10,14,28,.94)'; ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = L.col; ctx.stroke();
    ctx.textAlign = 'center';
    ctx.font = font(800, 12);
    ctx.fillStyle = L.col;
    ctx.fillText(L.name, tx + L.w / 2, ty + 14);
    ctx.font = font(600, 11);
    ctx.fillStyle = '#e6ecff';
    for (let i = 0; i < lines; i++) ctx.fillText(L.lines[i], tx + L.w / 2, ty + 28 + 14 * i);
  }

  // ---- textos con caché
  const memo = { hpKey: '', hp: '', lvKey: -1, lv: '', moveKey: '', move: '', nameKey: '', name: '', tintKey: null, tint: '' };
  let xpGrad = null;
  const tr = (ns, s) => (typeof ns.T === 'function' ? ns.T(s) : s);

  const BUFF = [
    ['atk', 'ATK', '#ff6b4d', '#5a1620'], ['patk', 'ATK', '#ff6b4d', '#5a1620'], ['satk', 'AT.E', '#c47bff', '#3a1a5a'],
    ['spd', 'VEL', '#7fe0ff', '#16305a'], ['def', 'DEF', '#7fb4ff', '#16305a'], ['regen', 'REG', '#5fe08a', '#163d26'],
  ];
  const chipText = new Map();
  const chip = (label, n) => { const k = label + n; let t = chipText.get(k); if (!t) { t = label + ' ×' + n; chipText.set(k, t); } return t; };

  // ---- dibujo del HUD nuevo
  function drawHud(ns, ctx, W, H, pl) {
    const T = ns.Touch, Icons = ns.Icons, U = ns.U || {};
    const TYPE = U.TYPE_COLOR || {};
    const touch = touchNow;
    const now = performance.now();
    curPl = pl;
    ctx.textBaseline = 'alphabetic';
    const mon = pl.mon || {};
    const me = { dex: pl.dex || mon.dex, shiny: pl.shiny, skin: pl.anim && pl.anim.skin, name: mon.name };
    const ty0 = mon.types && mon.types[0];
    if (memo.tintKey !== ty0) { memo.tintKey = ty0; memo.tint = (TYPE[ty0] || '#5fc8ff') + '55'; }
    const tint = memo.tint;
    const state = feel('me', pl.hp, pl.maxHp, !!pl.dead);
    const n = Math.max(1, pl.slots.length, pl.maxMoves || 0);
    const act = pl.slots[pl.active] || null;

    // Geometría según el modo.
    let S, GAP, PIT, LIFT = 6, XPH, HPH, PS, IS, x0, s0x, rowY, hpY, groupW, itemX, itemY, portX, portY, barX, barW;
    if (!touch) {
      // Medidas de PokeSurvivor Plus con su escala por defecto (1,4x).
      S = 64; GAP = 9; PIT = S + GAP; XPH = 9; HPH = 20; PS = 64; IS = 54;
      groupW = PS + 12 + IS + 14 + n * S + (n - 1) * GAP;
      x0 = Math.round((W - groupW) / 2);
      s0x = x0 + PS + 12 + IS + 14;
      rowY = Math.round(H - XPH - 10 - S);
      hpY = rowY - LIFT - 7 - HPH;
      // tooltips.js busca el objeto 54 px a la izquierda del primer hueco, con 18 de margen.
      itemX = s0x - 14 - IS; itemY = rowY + (S - IS) / 2;
      portX = x0; portY = rowY;
      barX = x0; barW = groupW;
    } else {
      // Compacta: misma posición que la barra del juego (respeta el editor de
      // controles táctiles y el joystick).
      const g = gameBar(ns, W, H, pl, true);
      S = 54; GAP = 9; PIT = 63; XPH = 5; HPH = 13; IS = 54;
      s0x = g.sx; rowY = g.sy;
      itemX = s0x - 72; itemY = rowY;
      x0 = itemX;
      groupW = 72 + n * S + (n - 1) * GAP;
      hpY = rowY - LIFT - 6 - HPH;
      barX = x0; barW = groupW;
      PS = 40;
      portX = itemX - 8 - PS; portY = rowY + S - PS;
      // Sin retrato si invade la zona del joystick.
      let stickX = 0;
      try { const sb = T.stickBase && T.stickBase(); stickX = sb ? sb.x : 0; } catch (_) { stickX = 0; }
      const k = canvasRect && canvasRect.width ? W / canvasRect.width : 1;
      if (portX < stickX * k + 90 || portX < 4) PS = 0;
    }

    // Experiencia a lo ancho del borde inferior.
    const xpF = pl.xpNext ? NX.clamp(pl.xp / pl.xpNext, 0, 1) : 0;
    ctx.fillStyle = INK;
    ctx.fillRect(0, H - XPH - 2, W, XPH + 2);
    ctx.fillStyle = 'rgba(20,40,90,.95)';
    ctx.fillRect(0, H - XPH, W, XPH);
    const p = pal(), xc = p && p.xp();
    if (!xpGrad || xpGrad.w !== W || xpGrad.xc !== xc || xpGrad.ctx !== ctx) {
      const g = ctx.createLinearGradient(0, 0, W, 0);
      g.addColorStop(0, xc ? xc[0] : '#4fd1ff');
      g.addColorStop(1, xc ? xc[1] : '#a98bff');
      xpGrad = { g, w: W, xc, ctx };
    }
    ctx.fillStyle = xpGrad.g;
    ctx.fillRect(0, H - XPH, Math.round(W * xpF), XPH);
    ctx.fillStyle = 'rgba(255,255,255,.3)';
    ctx.fillRect(0, H - XPH, Math.round(W * xpF), Math.max(1, Math.round(XPH * 0.3)));
    ctx.fillStyle = 'rgba(11,24,56,.55)';
    for (let x = 40; x < W; x += 40) ctx.fillRect(x, H - XPH, 1, XPH);
    if (p && p.xpNum() && pl.xpNext) {
      ctx.font = font(800, 8);
      ctx.textAlign = 'right';
      outlined(ctx, 'Nv. ' + (pl.level || 1) + ' · ' + Math.floor(xpF * 100) + ' %', W - 8, H - XPH - 5, '#cfe6ff', 2.5);
    }

    // Vida grande con estela.
    const hpF = NX.clamp(Math.max(0, pl.hp) / (pl.maxHp || 1), 0, 1);
    const tr0 = hpTrail;
    if (tr0.pl !== pl) { tr0.pl = pl; tr0.v = tr0.last = hpF; }
    if (hpF < tr0.last - 0.001) { if (tr0.v <= tr0.last + 0.005) tr0.hold = now + 220; }
    tr0.last = hpF;
    if (now > tr0.hold) tr0.v -= Math.max((tr0.v - hpF) * 0.12, 0.004);
    if (tr0.v < hpF) tr0.v = hpF;
    const low = hpF < 0.25 && !pl.dead;
    if (low) {
      ctx.save();
      ctx.shadowColor = `rgba(255,50,60,${(0.5 + 0.5 * Math.sin(now / 120)).toFixed(2)})`;
      ctx.shadowBlur = 12;
      rr(ctx, barX - 2, hpY - 2, barW + 4, HPH + 4, 4);
      ctx.fillStyle = INK; ctx.fill();
      ctx.restore();
    }
    bar(ctx, barX, hpY, barW, HPH, hpF, hpCol(hpF), 'rgba(60,12,20,.92)', tr0.v);
    // Nombre dentro de la barra a la izquierda y la vida al centro.
    const fIn = font(800, touch ? 9 : 13);
    ctx.font = fIn;
    ctx.textBaseline = 'middle';
    const nameKey = (mon.name || '') + '|' + (touch ? pl.level : '');
    if (memo.nameKey !== nameKey) { memo.nameKey = nameKey; memo.name = touch ? (mon.name || '') + ' · Nv. ' + (pl.level || 1) : (mon.name || ''); }
    ctx.textAlign = 'left';
    outlined(ctx, memo.name, barX + 6, hpY + HPH / 2 + 1, '#ffffff', 2.5);
    if (opt.hpNum !== 'off') {
      const hk = opt.hpNum + Math.ceil(Math.max(0, pl.hp)) + '/' + Math.round(pl.maxHp);
      if (memo.hpKey !== hk) {
        memo.hpKey = hk;
        memo.hp = opt.hpNum === 'percent' ? Math.ceil(hpF * 100) + ' %' : Math.ceil(Math.max(0, pl.hp)) + ' / ' + Math.round(pl.maxHp);
      }
      ctx.textAlign = touch ? 'right' : 'center';
      outlined(ctx, memo.hp, touch ? barX + barW - 6 : barX + barW / 2, hpY + HPH / 2 + 1, '#ffffff', 2.5);
    }
    ctx.textBaseline = 'alphabetic';

    // Nombre del movimiento activo, encima del extremo derecho de la barra.
    const a0 = act && act[0];
    if (a0) {
      const mk = a0.id + '|' + act.length;
      if (memo.moveKey !== mk) { memo.moveKey = mk; memo.move = tr(ns, a0.name) + (act.length > 1 ? ' +' + (act.length - 1) : ''); }
      ctx.font = font(800, touch ? 10 : 12);
      ctx.textAlign = 'right';
      outlined(ctx, memo.move, barX + barW, hpY - 7, act.length > 1 ? BOND : TYPE[a0.type] || '#fff', 3);
    }

    // Estados: subidas (ATK, DEF...), poder del altar, congelado y lento.
    // En PC van en columna a la izquierda del retrato; en táctil, sobre la barra.
    const CH = touch ? 8 : 10;
    let cy = touch ? hpY - 18 : rowY + S - CH - 6, cx = touch ? barX : x0 - 10;
    const putChip = (text, fg, bg, edge) => {
      if (touch) { cx += pill(ctx, cx, cy, text, fg, bg, edge, CH) + 4; return; }
      const w = textW(ctx, text, font(700, CH)) + 10;
      pill(ctx, cx - w, cy, text, fg, bg, edge, CH);
      cy -= CH + 9;
    };
    if (pl.buffs) {
      for (let i = 0; i < BUFF.length; i++) {
        const B = BUFF[i], b = pl.buffs[B[0]];
        if (b && b.n > 0) putChip(chip(B[1], b.n), '#fff', B[3], B[2]);
      }
    }
    if (pl.power && pl.power.def) putChip(String(pl.power.def.name || '').toUpperCase() + ' ' + Math.ceil(pl.power.t || 0) + 's', pl.power.def.color || '#fff', INK, pl.power.def.color || EDGE);
    if (pl.frozen) putChip('CONGELADO', '#bff2ff', '#16305a', '#7fe0ff');
    if (pl.slowT > 0) putChip('LENTO', '#e6d7ff', '#2e2252', '#a98bff');

    // Retrato y nivel.
    if (PS > 0) {
      drawPortrait(ctx, ns, portX, portY, PS, me, tint, state);
      const lv = pl.level || 1;
      if (memo.lvKey !== lv) { memo.lvKey = lv; memo.lv = 'Nv. ' + lv; }
      if (!touch) {
        const lw = textW(ctx, memo.lv, font(700, 10)) + 10;
        pill(ctx, portX + (PS - lw) / 2, portY + PS - 7, memo.lv, '#fff', INK, EDGE, 10);
      }
    }

    // Objeto equipado.
    if (pl.item) {
      frame(ctx, itemX, itemY, IS, IS, 7, 'rgba(40,30,10,.92)', GOLD, 2);
      const iz = IS >= 54 ? 36 : 32;
      if (Icons) Icons.draw(ctx, pl.item, itemX + (IS - iz) / 2, itemY + (IS - iz) / 2, iz);
    } else {
      frame(ctx, itemX, itemY, IS, IS, 7, 'rgba(10,16,32,.5)', 'rgba(232,238,248,.22)', 1.5);
    }

    // Huecos de movimientos: enfriamiento, nivel, fusiones y atajo.
    const cdMul = pl.cdMul || 1;
    const pad = S / 7.2; // misma proporción que el juego (54 / 7.5): tooltips.js los reconoce
    for (let i = 0; i < n; i++) {
      const grp = pl.slots[i];
      const m = grp && grp[0];
      const on = i === pl.active && !!m;
      const x = s0x + i * PIT, y = on ? rowY - LIFT : rowY;
      if (!m) {
        frame(ctx, x, y, S, S, 7, 'rgba(10,16,32,.5)', 'rgba(232,238,248,.25)', 1.5);
        ctx.font = font(800, 9);
        ctx.textAlign = 'left';
        outlined(ctx, NUM[i + 1], x + 4, y + 11, 'rgba(200,215,240,.45)', 2);
        continue;
      }
      if (T && T.addButton) addBtn(T, x, y, S, S, slotFn(ns, i), pad);
      const fused = grp.length > 1;
      const col = TYPE[m.type] || '#8fa3c4';
      frame(ctx, x, y, S, S, 7, on ? 'rgba(22,36,74,.97)' : 'rgba(12,20,40,.92)', fused ? BOND : m.evolved ? GOLD : on ? col : EDGE, on || fused || m.evolved ? 2.5 : 2);
      if (on) {
        ctx.save();
        ctx.globalAlpha = 0.18;
        rr(ctx, x + 2, y + 2, S - 4, S - 4, 5);
        ctx.fillStyle = col; ctx.fill();
        ctx.restore();
      }
      if (fused) {
        const Cc = S >= 64 ? 24 : 20, P = (S - Cc * 2) / 3;
        for (let j = 0; j < grp.length && j < 4; j++) {
          const gm = grp[j];
          const ix = x + P + (j % 2) * (Cc + P), iy = y + P + Math.floor(j / 2) * (Cc + P);
          if (Icons) Icons.draw(ctx, 'move:' + gm.id, ix, iy, Cc);
          const f = gm.kind === 'orbit' ? 0 : NX.clamp(gm.t / ((gm.cd || 1) * cdMul), 0, 1);
          if (f > 0) { ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(ix, iy, Cc, Cc * f); }
          ctx.font = font(800, 7);
          ctx.textAlign = 'right';
          outlined(ctx, gm.evolved ? '★' : NUM[gm.lvl] || '', ix + Cc + 1, iy + Cc, gm.evolved || gm.lvl >= ((gm.def && gm.def.maxLvl) || 5) ? GOLD : '#fff', 2);
        }
      } else {
        const cdT = (m.cd || 1) * cdMul;
        const f = m.kind === 'orbit' ? 0 : NX.clamp(m.t / cdT, 0, 1);
        const isz = S >= 64 ? 40 : 32;
        if (Icons) { ctx.imageSmoothingEnabled = false; Icons.draw(ctx, 'move:' + m.id, x + (S - isz) / 2, y + (S - isz) / 2 - 2, isz); }
        if (f > 0) {
          ctx.save();
          rr(ctx, x, y, S, S, 7); ctx.clip();
          ctx.fillStyle = 'rgba(0,0,0,.58)';
          ctx.fillRect(x, y, S, Math.round(S * f));
          // Borde del barrido.
          ctx.fillStyle = 'rgba(255,255,255,.35)';
          ctx.fillRect(x, y + Math.round(S * f) - 1, S, 1);
          ctx.restore();
          if (opt.cdNum && m.t >= 1 && cdT >= 2) {
            ctx.font = font(800, S >= 64 ? 17 : 14);
            ctx.textAlign = 'center';
            outlined(ctx, NUM[Math.min(99, Math.ceil(m.t))], x + S / 2, y + S / 2 + 4, '#ffffff', 3);
          }
        }
        const fl = 1 - (now - (m.castAt || 0)) / 180;
        if (fl > 0) { ctx.save(); rr(ctx, x, y, S, S, 7); ctx.clip(); ctx.fillStyle = `rgba(255,255,255,${(fl * 0.4).toFixed(2)})`; ctx.fillRect(x, y, S, S); ctx.restore(); }
        // Nivel: número arriba a la derecha y puntos abajo.
        const max = (m.def && m.def.maxLvl) || 5;
        ctx.font = font(800, S >= 64 ? 11 : 9);
        ctx.textAlign = 'right';
        outlined(ctx, m.evolved ? '★' : NUM[m.lvl] || '', x + S - 5, y + (S >= 64 ? 13 : 11), m.evolved || m.lvl >= max ? GOLD : '#fff', 2);
        const dw = S >= 64 ? 6 : 5, dg = 2, tw = max * dw + (max - 1) * dg;
        for (let d = 0; d < max; d++) {
          ctx.fillStyle = d < m.lvl ? col : 'rgba(255,255,255,.18)';
          ctx.fillRect(x + (S - tw) / 2 + d * (dw + dg), y + S - 8, dw, 3);
        }
      }
      ctx.font = font(800, S >= 64 ? 11 : 9);
      ctx.textAlign = 'left';
      outlined(ctx, NUM[i + 1], x + 5, y + (S >= 64 ? 13 : 11), fused ? BOND : on ? col : 'rgba(200,215,240,.85)', 2);
    }

    // Lazos sin usar, después de los movimientos.
    if (pl.bonds > 0 && Icons) {
      const bx = s0x + n * PIT - GAP + 10, by = rowY + S / 2 - 12;
      Icons.draw(ctx, 'bond', bx, by, 24);
      if (pl.bonds > 1) { ctx.font = font(800, 10); ctx.textAlign = 'left'; outlined(ctx, '×' + pl.bonds, bx + 25, by + 20, BOND, 2); }
    }

    // Orbes, centrados sobre la barra de vida (en táctil, sobre los estados).
    drawOrbs(ns, ctx, W, pl, barX + barW / 2, touch ? hpY - 26 : hpY - 24, touch);

    // Indicaciones de los primeros segundos (el juego las pone donde ahora va la barra).
    const t = ns.Game.st && ns.Game.st.time;
    if (t < 14 && !touch && !hasOrbs(pl)) {
      ctx.font = font(600, 11);
      ctx.textAlign = 'center';
      outlined(ctx, 'WASD moverse  ·  1-4 / Q / E o clic en un ataque para cambiarlo  ·  Esc pausa', W / 2, hpY - 28, 'rgba(200,215,240,.85)', 2.5);
    }

    if (opt.team) drawTeam(ns, ctx, W, H, pl, touch);
  }

  // ---- tarjetas del equipo (co-op), arriba a la izquierda
  // Adaptado de las tarjetas de compañeros de PokeSurvivor Plus (MIT).
  function drawTeam(ns, ctx, W, H, pl, touch) {
    const C = ns.Coop;
    if (!C || !C.active || !C.mates) return;
    let live = 0;
    for (const m of C.mates) if (m.connected && m.pl) live++;
    if (!live) return;
    const Icons = ns.Icons, TYPE = (ns.U && ns.U.TYPE_COLOR) || {};
    const compact = touch || live > 3;
    const safe = ns.Touch.safeArea();
    let x = 10 + safe.left, y = 10 + safe.top;
    const colW = compact ? 170 : 220, colH = live * (compact ? 28 : 46);
    // Que no quede debajo del minimapa ni del medidor de daño.
    if (canvasRect && canvasRect.width && obstacles.length) {
      const k = W / canvasRect.width;
      for (const r of obstacles) {
        const ox = (r.left - canvasRect.left) * k, oy = (r.top - canvasRect.top) * k, ow = r.width * k, oh = r.height * k;
        if (ox < x + colW && ox + ow > x && oy < y + colH && oy + oh > y) {
          if (oy > y + 40) continue; // empieza más abajo: solo se encoge la columna si hace falta
          x = Math.ceil(ox + ow + 6);
        }
      }
    }
    const t = performance.now() / 1000;
    for (const m of C.mates) {
      if (!m.connected || !m.pl) continue;
      const o = m.pl, net = o.net || {};
      const dead = !!(net.dead || o.dead);
      const hp = net.hp != null ? net.hp : o.hp, max = net.maxHp || o.maxHp || 1;
      const mon = o.mon || {};
      const st = feel(m.uid || m.name || m, hp, max, dead);
      const who = { dex: o.dex || mon.dex, shiny: o.shiny, skin: o.anim && o.anim.skin, name: mon.name || m.name };
      const col = m.color || '#5fc8ff';
      const frac = dead ? 0 : NX.clamp(hp / max, 0, 1);
      if (compact) {
        drawPortrait(ctx, ns, x, y, 24, who, col + '55', st);
        ctx.font = font(800, 9);
        ctx.textAlign = 'left';
        outlined(ctx, String(m.name || ''), x + 30, y + 9, col, 2.5);
        bar(ctx, x + 30, y + 15, 110, 5, frac, hpCol(frac), 'rgba(60,12,20,.9)');
        if (dead) { ctx.font = font(800, 8); outlined(ctx, 'CAÍDO', x + 146, y + 21, Math.sin(t * 8) > 0 ? '#ff8a96' : '#fff', 2); }
        y += 28;
        continue;
      }
      drawPortrait(ctx, ns, x, y, 36, who, col + '55', st);
      ctx.font = font(800, 10);
      ctx.textAlign = 'left';
      const nm = String(m.name || '');
      outlined(ctx, nm, x + 42, y + 9, col);
      let tx = x + 42 + textW(ctx, nm, font(800, 10)) + 5;
      if (Icons) for (const ty of (mon.types || []).slice(0, 2)) { try { Icons.draw(ctx, 'type:' + ty, tx, y - 4, 16); } catch (_) { /* icono ausente */ } tx += 18; }
      bar(ctx, x + 42, y + 14, 132, 6, frac, hpCol(frac), 'rgba(60,12,20,.9)');
      let px = x + 42;
      px += pill(ctx, px, y + 24, 'Nv. ' + (o.level || pl.level || 1)) + 4;
      if (dead) pill(ctx, px, y + 24, 'CAÍDO', Math.sin(t * 8) > 0 ? '#ff8a96' : '#fff', '#5a1620', '#ff5f6d');
      else if (mon.name) pill(ctx, px, y + 24, String(mon.name), TYPE[(mon.types || [])[0]] ? '#fff' : '#fff');
      y += 46;
    }
  }

  // ---- registro
  NX.feature({
    key: KEY,
    label: 'HUD Nexus',
    needs: (ns) => ns.HUD && typeof ns.HUD.draw === 'function' && ns.Touch && typeof ns.Touch.clearButtons === 'function' &&
      typeof ns.Touch.addButton === 'function' && typeof ns.Touch.safeArea === 'function' && ns.Icons && ns.Sprites &&
      typeof ns.Sprites.sheet === 'function' && ns.SPRITE_META && ns.Game &&
      NX.featureList().some((f) => f.key === 'hud' && f.status === 'ok'),
    setup(ns) {
      const T = ns.Touch;
      // Al empezar el cuerpo del HUD del juego (justo después de su ctx.save),
      // se recortan las zonas que se reemplazan; su ctx.restore final las quita.
      let lastCtx = null, lastW = 0, lastH = 0, lastPl = null;
      const clear = T.clearButtons;
      T.clearButtons = function () {
        const r = clear.apply(this, arguments);
        if (armed && lastCtx) {
          armed = false;
          dropGame = true;
          try {
            replaced(ns, lastW, lastH, lastPl, touchNow, zones);
            for (let i = 0; i < zones.length; i += 4) {
              lastCtx.beginPath();
              lastCtx.rect(0, 0, lastW, lastH);
              lastCtx.rect(zones[i], zones[i + 1], zones[i + 2], zones[i + 3]);
              lastCtx.clip('evenodd');
            }
          } catch (err) { NX.trip(KEY, err); }
        }
        return r;
      };
      // Los botones de movimientos del juego se descartan antes de que los vea
      // otro módulo (tooltips.js los copia): esta envoltura debe quedar por
      // fuera de las demás, así que se vuelve a poner si alguien envuelve después.
      let mine = null;
      const ensureOuter = () => {
        if (T.addButton === mine) return;
        const inner = T.addButton;
        mine = function (x, y, w, h, fn, pad) {
          // Huecos de movimientos (54, margen 7,5) y orbes (40, margen 5, en la mitad de abajo).
          if (dropGame && !selfAdd && ((w === 54 && h === 54 && pad === 7.5) || (w === 40 && h === 40 && pad === 5 && y > lastH * 0.5))) return undefined;
          return inner.apply(this, arguments);
        };
        T.addButton = mine;
      };
      ensureOuter();
      setInterval(ensureOuter, 1000);

      NX.hudLayers.push({
        key: KEY,
        under(ctx, w, h, pl) {
          armed = false;
          dropGame = false;
          touchNow = !!T.active;
          const on = opt.on && !!pl && Array.isArray(pl.slots) && !!pl.mon && typeof pl.setActive === 'function';
          NX.hudNewActive = on;
          if (!on) return;
          lastCtx = ctx; lastW = w; lastH = h; lastPl = pl; hudCanvas = ctx.canvas || hudCanvas;
          armed = true;
        },
        over(ctx, w, h, pl) {
          const go = dropGame;
          armed = false;
          dropGame = false;
          if (!go || !NX.hudNewActive || pl !== lastPl) return;
          drawHud(ns, ctx, w, h, pl);
        },
      });
      // Si el HUD nuevo deja de dibujarse (módulo apagado), que no quede marcado.
      setInterval(() => { if (!NX.isOn(KEY)) NX.hudNewActive = false; }, 500);
    },
  });

  NX.settings.section({
    key: KEY,
    title: 'HUD Nexus',
    tab: 'HUD',
    keywords: 'estilo hud nuevo clasico plus vida barra retrato movimientos equipo coop',
    render(el) {
      el.appendChild(NX.ui.select('Estilo del HUD', 'hudnew:style', [['nexus', 'Nexus (nuevo)'], ['classic', 'Clásico (el del juego)']], 'nexus', readOpts));
      el.appendChild(NX.ui.select('Números de vida', 'hudnew:hpnum', [['values', 'Vida / máxima'], ['percent', 'Porcentaje'], ['off', 'Sin números']], 'values', readOpts));
      el.appendChild(NX.ui.toggle('Retrato del Pokémon', 'hudnew:portrait', true, readOpts));
      el.appendChild(NX.ui.toggle('Segundos de enfriamiento en los ataques', 'hudnew:cdnum', true, readOpts));
      el.appendChild(NX.ui.toggle('Tarjetas del equipo en co-op', 'hudnew:team', true, readOpts));
      el.appendChild(NX.ui.note('Vida grande, experiencia, ataques y objeto abajo, como en PokeSurvivor Plus. En pantallas táctiles usa una variante compacta que respeta el joystick y la posición de la barra. Los colores salen de "Colores del HUD" y el tamaño de "Escala del HUD".'));
    },
  });
})();

// ---- features/hud-scale.js
// Escala del HUD. El juego dibuja su HUD en píxeles CSS con HUD.draw; aquí se
// envuelve con ctx.scale(k) y se le pasa un ancho y alto divididos entre k,
// así el HUD queda más grande sin salirse de la pantalla. Lo que el HUD
// dibuja anclado al mundo usa Camera.scale, que se divide entre k mientras
// dura la llamada. Los botones del HUD (Touch.addButton) se registran en
// coordenadas del HUD y se prueban contra el puntero, así que se escalan
// igual. En pantallas táctiles el HUD conserva su tamaño.
// Adaptado de PokeSurvivor Plus (MIT).
(() => {
  const KEY = 'hudscale';
  const SKEY = 'hudscale:k';
  const read = () => Math.round(NX.clamp(+NX.store.get(SKEY, 1) || 1, 1, 2) * 10) / 10;
  let k = read();
  setInterval(() => { k = read(); }, 1000);
  let touch = false;

  // Escala efectiva, también para otros módulos que quieran acompañarla.
  NX.hudK = () => (NX.isOn(KEY) && !touch ? k : 1);

  NX.feature({
    key: KEY,
    label: 'Escala del HUD',
    // Debe envolver por fuera de la capa de dibujo del núcleo.
    needs: (ns) => ns.HUD && typeof ns.HUD.draw === 'function' && ns.Camera && 'scale' in ns.Camera &&
      NX.featureList().some((f) => f.key === 'hud' && f.status === 'ok'),
    setup(ns) {
      const C = ns.Camera, T = ns.Touch;
      let btnK = 1;
      if (T && typeof T.addButton === 'function') {
        const add = T.addButton;
        T.addButton = function (x, y, w, h, fn, pad) {
          if (btnK === 1) return add.apply(this, arguments);
          return add.call(this, x * btnK, y * btnK, w * btnK, h * btnK, fn, (pad == null ? 6 : pad) * btnK);
        };
      }
      const draw = ns.HUD.draw;
      ns.HUD.draw = function (ctx, w, h) {
        touch = !!(T && T.active);
        const s = NX.hudK();
        if (s === 1 || !ctx || typeof ctx.scale !== 'function') return draw.apply(this, arguments);
        const cs = C.scale;
        const args = Array.prototype.slice.call(arguments);
        args[1] = w / s;
        args[2] = h / s;
        ctx.save();
        ctx.scale(s, s);
        C.scale = cs / s;
        btnK = s;
        try { return draw.apply(this, args); } finally {
          btnK = 1;
          C.scale = cs;
          ctx.restore();
        }
      };
    },
  });

  NX.settings.section({
    key: KEY,
    title: 'Escala del HUD',
    tab: 'HUD',
    keywords: 'tamaño hud grande zoom interfaz',
    render(el) {
      el.appendChild(NX.ui.toggle('Activado', 'on:' + KEY, true));
      el.appendChild(NX.ui.range('Tamaño del HUD', SKEY, 1, 2, 0.1, 1, (v) => v.toFixed(1) + 'x', () => { k = read(); }));
      el.appendChild(NX.ui.note('Agranda vida, ataques, reloj y flechas. En pantallas táctiles el HUD conserva su tamaño.'));
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

// ---- features/mobile.js
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
    { id: 'meter', label: 'Medidor de daño', feat: 'meter', kind: 'toggle', state: () => !!NX.store.get('meter:pin', false),
      run: () => { const on = !NX.store.get('meter:pin', false); NX.store.set('meter:pin', on); NX.toast(on ? 'Medidor de daño visible' : 'Medidor de daño oculto'); } },
    { id: 'hitbox', label: 'Hitboxes', feat: 'hitboxes', kind: 'toggle', state: () => !!NX.store.get('hitbox:shown', false), run: () => press('KeyB', 'b', true) },
    { id: 'fps', label: 'Contador de FPS', feat: 'fps', kind: 'toggle', state: () => !!NX.store.get('fps:shown', false), run: () => press('KeyF', 'f', true) },
    { id: 'enc', label: 'Enciclopedia', feat: 'enc', kind: 'run', run: () => press('F1', 'F1') },
    { id: 'hist', label: 'Historial', feat: 'hist', kind: 'open', run: () => { if (!NX.shown('nexus-hist')) press('KeyR', 'r', true); } },
    { id: 'shot', label: 'Captura limpia', feat: 'cleancap', kind: 'run', wide: true, delay: 150, run: () => press('KeyS', 's', true) },
  ];
  const avail = (a) => !a.feat || NX.isOn(a.feat);

  function renderMenu() {
    const fovOn = NX.isOn('fov');
    const fov = Number(NX.store.get('fov', 1.3)) || 1;
    menu.innerHTML = `<div class="nx-mmh"><span>Nexus</span><button type="button" class="nx-mmx" data-a="close" aria-label="Cerrar">X</button></div>
      <div class="nx-mmg">${ACTIONS.filter(avail).map((a) => {
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
    const a = ACTIONS.find((x) => x.id === id);
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

// ---- features/modes.js
// Modos Nexus: motor común y selector. Cada modo (infinito, modificadores,
// laboratorio, diario, Boss Rush) se registra aquí con NX.modes.register y
// arranca con NX.modes.launch(cfg). El motor envuelve una sola vez las piezas
// del juego que hacen falta; sin un modo en curso todas pasan de largo, así
// que el juego normal queda intacto. Al terminar cada partida se devuelven
// los valores tocados (Judgment.AT, velocidad, compañero, guardado...).
//
// Una partida de modo (cfg) admite:
//   key, label, tags[], mods{}          nombre en la píldora y modificadores
//   noRank, noAch, restoreStats         fuera del ranking, sin logros, estadísticas del juego intactas
//   sandbox                             nada llega al guardado (laboratorio)
//   noJudge, noRift, noSpawner, spawnK  sin Juicio, sin grietas, sin generador, densidad
//   taken, dealt, speed, noHeal, chaos  multiplicadores y reglas
//   immortal, partner, worldSeed
//   onStart, onTick, onEnd, onAdd, scale, pause[], pillExtra, overNote
(() => {
  const KEY = 'modes';
  const LIVE = new Set(['playing', 'held', 'levelup', 'choice', 'paused']);
  const JUDGE_AT = 1800;
  const SNAP_KEY = 'modes:snap';
  // Partes del guardado que una partida infinita no debe cambiar (idea de PokeSurvivor Plus, MIT).
  const SNAP_PARTS = ['stats', 'legends', 'arenas', 'evoMoves', 'itemsFound'];
  const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  const defs = [];
  let ns = null, ctx = null, pending = null, capScale = 1, modal = null, curTab = NX.store.get('modes:tab', '');

  const on = () => NX.isOn(KEY);
  const act = () => (ctx && on() ? ctx : null);

  NX.css(`#nexus-modes{z-index:60}
#nexus-modes .nx-md-box{width:min(640px,100%);display:flex;flex-direction:column;gap:6px}
#nexus-modes .nx-md-head{display:flex;justify-content:space-between;align-items:center;gap:10px}
#nexus-modes .nx-md-tabs{display:flex;flex-wrap:wrap;gap:6px;margin:2px 0 6px}
#nexus-modes .nx-md-body{min-height:180px}
#nexus-modes .nx-md-desc{color:var(--muted,#b9cbf0);font-size:14px;margin:2px 0 8px;text-shadow:none}
#nexus-modes .nx-row{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:3px 0;font-size:15px;cursor:pointer}
#nexus-modes select{font:inherit;font-size:14px;background:#0b1838;color:#fff;border:1px solid #5b83d6;border-radius:6px;padding:3px 6px;max-width:62%;text-shadow:none}
#nexus-modes .nx-rng{display:flex;align-items:center;gap:8px}#nexus-modes .nx-rng b{min-width:48px;text-align:right;color:var(--gold,#ffd23f)}
#nexus-modes input[type=checkbox]{width:18px;height:18px;accent-color:#ffd23f}
#nexus-modes .nx-note{margin:4px 0;font-size:13px;color:var(--muted,#b9cbf0);text-shadow:none}
#nexus-modes .nx-btn{font:inherit;font-size:13px;background:#0b1838;color:#fff;border:2px solid #f4f8ff;border-radius:6px;cursor:pointer;padding:3px 10px;margin:4px 6px 4px 0}
#nexus-modes .nx-md-foot{display:flex;justify-content:flex-end;gap:10px;margin-top:10px;flex-wrap:wrap}
#nexus-modes .nx-md-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px 14px}
#nexus-modes .nx-md-card{background:rgba(0,0,0,.22);border-radius:9px;padding:6px 10px;font-size:14px}
#nexus-modes .nx-md-card span{display:block;color:var(--muted,#b9cbf0);font-size:12px;text-transform:uppercase}
#nexus-modes .nx-md-card b{font-size:18px}
.nx-md-t{width:100%;border-collapse:collapse;font-size:13px;text-shadow:none}
.nx-md-t th{color:var(--muted,#b9cbf0);font-weight:400;text-align:left;padding:2px 4px}
.nx-md-t td{padding:2px 4px;border-top:1px solid rgba(255,255,255,.08)}
#nexus-modes-btn small{white-space:normal}
#nexus-mode-pill{position:fixed;left:50%;top:84px;transform:translateX(-50%);z-index:9991;pointer-events:none;padding:3px 12px;border-radius:12px;
  background:rgba(12,20,44,.84);color:#fff;border:2px solid #8a5cf0;font:13px/1.3 var(--font,'Pixelify',system-ui,sans-serif);white-space:nowrap;max-width:92vw;overflow:hidden;text-overflow:ellipsis}
#nexus-mode-pill b{color:#d9c8ff}#nexus-mode-pill.hidden{display:none}
#nexus-mode-pause{justify-content:center;margin-top:10px}#nexus-mode-pause[hidden]{display:none}
#nexus-mode-pause .nx-md-tag{width:100%;text-align:center;color:#d9c8ff;font-size:13px}
#over-stats .nx-md-over{grid-column:1/-1;text-align:center;color:#d9c8ff;font-size:13px}`);

  // ---------------------------------------------------------------- guardado
  function snapStats(c) {
    const s = ns.DB && ns.DB.save;
    if (!s) return;
    const snap = { at: Date.now(), runs: (s.stats && s.stats.runs) || 0, d: {} };
    for (const k of SNAP_PARTS) snap.d[k] = s[k] === undefined ? null : clone(s[k]);
    c.statSnap = snap;
    NX.store.set(SNAP_KEY, snap);
  }
  function restoreStats(snap) {
    const s = ns.DB && ns.DB.save;
    if (!snap || !s) return;
    for (const k of SNAP_PARTS) { if (snap.d[k] === null) delete s[k]; else s[k] = clone(snap.d[k]); }
  }
  // Devuelve el guardado entero al estado de la copia, sin cambiar el objeto.
  function restoreSave(snap) {
    const s = ns.DB && ns.DB.save;
    if (!snap || !s) return;
    for (const k of Object.keys(s)) if (!(k in snap)) delete s[k];
    for (const k of Object.keys(snap)) s[k] = clone(snap[k]);
  }

  // ---------------------------------------------------------------- ciclo de partida
  function makeCtx(cfg) {
    const base = { key: 'mode', label: '', tags: [], taken: 1, dealt: 1, spawnK: 1, capK: 1, speed: 1, noHeal: false, chaos: 0,
      noRank: true, noAch: false, restoreStats: false, sandbox: false, noJudge: false, noRift: false, noSpawner: false, immortal: false, pause: [] };
    const fx = cfg.mods && NX.modsApi ? NX.modsApi.effects(cfg.mods) : {};
    const c = Object.assign(base, fx, cfg);
    c.tags = [...(fx.tags || []), ...(cfg.tags || [])];
    return c;
  }
  function autoCtx() {
    const M = NX.modsApi;
    if (!M || !NX.isOn('mods') || !M.enabled()) return null;
    const vals = M.values();
    if (M.neutral(vals)) return null;
    return makeCtx({ key: 'mods', label: 'Modificadores', mods: vals });
  }

  function begin(c) {
    const G = ns.Game, J = ns.Judgment;
    c.player = G.player;
    c.judgeAT0 = J.AT;
    c.bossArr = ns.Enemies.BOSSES;
    c.bossLen0 = c.bossArr ? c.bossArr.length : 0;
    if (c.noJudge) J.AT = 1e9; // las grietas leen este valor y siguen abriéndose
    if (c.speed !== 1 && typeof G.debugSpeed === 'function') { G.debugSpeed(c.speed); c.speedSet = true; }
    c.chaosT = c.chaos ? 6 : 0;
    if (c.onStart) c.onStart(ns, c.player, c);
    renderPause();
  }

  function finish(how) {
    const c = ctx;
    if (!c) return;
    ctx = null;
    const G = ns.Game, J = ns.Judgment, p = c.player;
    try { if (c.speedSet) G.debugSpeed(1); } catch (err) { console.warn('[nexus] modos', err); }
    try { if (c.noJudge && J.AT >= 1e8) J.AT = typeof c.judgeAT0 === 'number' && c.judgeAT0 < 1e8 ? c.judgeAT0 : JUDGE_AT; } catch (_) { /* sin Juicio */ }
    try { if (c.bossArr && ns.Enemies.BOSSES === c.bossArr && c.bossArr.length > c.bossLen0) c.bossArr.length = c.bossLen0; } catch (_) { /* nada */ }
    try { if (c.chaos && ns.Weather.clear && !(J && J.active)) ns.Weather.clear(); } catch (_) { /* nada */ }
    try {
      if (c.sandbox && c.snap) restoreSave(c.snap);
      if (c.restoreStats) {
        if (!c.statsRestored) restoreStats(c.statSnap);
        NX.store.set(SNAP_KEY, null);
      }
    } catch (err) { console.warn('[nexus] modos', err); }
    const st = G.state;
    const t = G.st && typeof G.st.time === 'number' ? G.st.time : (c.lastT || 0);
    const info = { time: t, level: (p && p.level) || 1, kills: (p && p.kills) || 0, bosses: (p && p.bosses) || 0,
      dead: !!(p && p.dead), how: how || st, dex: (p && p.dex) || 0, mon: (p && p.mon && p.mon.name) || '' };
    let note = c.overNote || '';
    try { if (c.onEnd) { const r = c.onEnd(ns, p, c, info); if (typeof r === 'string') note = r; } } catch (err) { console.warn('[nexus] modos', err); }
    try { if (c.key === 'mods' && c.mods && NX.modsApi) { const r = NX.modsApi.record(c.mods, info); if (r) note = (note ? note + '<br>' : '') + r; } } catch (err) { console.warn('[nexus] modos', err); }
    if (note && st === 'over') overNote(c, note);
    renderPause();
    pillOff();
  }

  function overNote(c, html) {
    const box = document.getElementById('over-stats');
    if (!box || box.querySelector('.nx-md-over')) return;
    // El aviso de récord del juego no cuenta en estos modos.
    if (c.restoreStats || c.sandbox) for (const d of box.querySelectorAll(':scope > div.gold')) if (/r[eé]cord/i.test(d.textContent)) d.remove();
    const line = document.createElement('div');
    line.className = 'nx-md-over';
    line.innerHTML = html;
    box.prepend(line);
  }

  // ---------------------------------------------------------------- ganchos
  function hook() {
    const G = ns.Game, J = ns.Judgment, R = ns.Ranking, PP = ns.Player.prototype, EP = ns.Enemy.prototype;

    const start = G.startRun;
    G.startRun = function (opts) {
      if (ctx) finish('replaced');
      const cfg = pending;
      pending = null;
      // El cooperativo (con opciones de sala) nunca entra en un modo.
      if (opts || !on() || (ns.Coop && ns.Coop.active)) return start.apply(this, arguments);
      let c = null;
      try { c = cfg ? makeCtx(cfg) : autoCtx(); } catch (err) { NX.trip(KEY, err); c = null; }
      if (!c) return start.apply(this, arguments);
      const s = ns.DB.save, undo = [];
      let r;
      ctx = c; // antes de arrancar: Ranking.runStarted lo consulta
      try {
        if (c.restoreStats) snapStats(c);
        if (c.sandbox) c.snap = clone(s);
        if (c.partner) {
          const p0 = s.partner, sh0 = s.partnerShiny;
          s.partner = c.partner;
          s.partnerShiny = false;
          undo.push(() => { s.partner = p0; s.partnerShiny = sh0; });
        }
        if (c.worldSeed != null && ns.World && typeof ns.World.reset === 'function') {
          const W = ns.World, wr = W.reset;
          W.reset = function () { return wr.call(this, c.worldSeed); };
          undo.push(() => { W.reset = wr; });
        }
        r = start.apply(this, arguments);
      } catch (err) {
        ctx = null;
        throw err;
      } finally {
        for (const f of undo.reverse()) { try { f(); } catch (_) { /* nada */ } }
      }
      try { begin(c); } catch (err) { NX.trip(KEY, err); }
      return r;
    };

    // Fuera del ranking del juego: ni se registra ni se envía.
    if (R) {
      for (const k of ['runStarted', 'submitSolo', 'submitGroup']) {
        const f = R[k];
        if (typeof f !== 'function') continue;
        R[k] = function () { const c = act(); if (c && c.noRank) return null; return f.apply(this, arguments); };
      }
    }

    // Sin Juicio a los 30:00 (salvo que se invoque a Arceus). Adaptado de PokeSurvivor Plus (MIT).
    const jupd = J.update;
    J.update = function (dt, pl, time) {
      const c = act();
      if (c && c.noJudge && typeof time === 'number') {
        time = c.arceus ? Math.max(time, JUDGE_AT) : Math.min(time, JUDGE_AT - 1);
        return jupd.call(this, dt, pl, time);
      }
      return jupd.apply(this, arguments);
    };
    // El juego lee el resumen del Juicio justo después de sumar la partida a
    // sus estadísticas y antes de guardar: ahí se devuelven a como estaban.
    const jsum = J.summary;
    J.summary = function () {
      const r = jsum.apply(this, arguments);
      const c = act();
      if (c && G.state === 'over') {
        try {
          if (c.restoreStats && !c.statsRestored) { restoreStats(c.statSnap); c.statsRestored = true; }
          if (c.sandbox && c.snap) restoreSave(c.snap);
        } catch (err) { NX.trip(KEY, err); }
      }
      return r;
    };

    // Sin logros mientras dura el modo.
    const A = ns.AchDefs;
    if (A && Array.isArray(A.LIST)) {
      const list = A.LIST;
      Object.defineProperty(A, 'LIST', { configurable: true, enumerable: true, get: () => { const c = act(); return c && (c.noAch || c.sandbox) ? [] : list; } });
    }

    // Laboratorio: nada de misiones, logros ni guardados.
    const P = ns.Progress;
    if (P) for (const k of ['event', 'kill', 'claim', 'checkAch', 'grant']) {
      const f = P[k];
      if (typeof f !== 'function') continue;
      P[k] = function () { const c = act(); if (c && c.sandbox) return undefined; return f.apply(this, arguments); };
    }
    const D = ns.DB;
    if (typeof D.commit === 'function') {
      const commit = D.commit;
      D.commit = function () { const c = act(); if (c && c.sandbox) return false; return commit.apply(this, arguments); };
    }
    if (typeof D.saveNow === 'function') {
      const saveNow = D.saveNow;
      D.saveNow = function () { const c = act(); if (c && c.sandbox) return Promise.resolve({ ok: false, why: 'lab' }); return saveNow.apply(this, arguments); };
    }

    // Daño recibido, inmortalidad y curación.
    const hurt = PP.hurt;
    PP.hurt = function (dmg) {
      const c = act();
      if (c && this === c.player) {
        if (c.immortal) return undefined;
        if (c.taken !== 1 && typeof dmg === 'number') {
          const a = Array.prototype.slice.call(arguments);
          a[0] = dmg * c.taken;
          return hurt.apply(this, a);
        }
      }
      return hurt.apply(this, arguments);
    };
    const heal = PP.heal;
    PP.heal = function () {
      const c = act();
      if (c && c.noHeal && this === c.player) return undefined;
      return heal.apply(this, arguments);
    };
    // Daño infligido.
    const ehurt = EP.hurt;
    EP.hurt = function (dmg) {
      const c = act();
      if (c && c.dealt !== 1 && typeof dmg === 'number' && !this.remote) {
        const a = Array.prototype.slice.call(arguments);
        a[0] = dmg * c.dealt;
        return ehurt.apply(this, a);
      }
      return ehurt.apply(this, arguments);
    };

    // Densidad: el generador multiplica su ritmo por Coop.scaleRate y se
    // detiene en Spawner.CAP enemigos; durante su paso el tope crece igual.
    const C = ns.Coop;
    if (C && typeof C.scaleRate === 'function') {
      const sr = C.scaleRate;
      C.scaleRate = function () {
        const r = sr.apply(this, arguments);
        const c = act();
        return c && c.spawnK !== 1 && !C.active ? r * c.spawnK : r;
      };
    }
    const EM = ns.EnemyMgr;
    const cd = Object.getOwnPropertyDescriptor(EM, 'count');
    if (cd && cd.get && cd.configurable) {
      Object.defineProperty(EM, 'count', {
        configurable: true, enumerable: cd.enumerable,
        get() { const n = cd.get.call(this); return capScale > 1 ? Math.floor(n / capScale) : n; },
      });
    }
    const SP = ns.Spawner, spu = SP.update;
    SP.update = function () {
      const c = act();
      if (c && c.noSpawner) return undefined;
      if (c && c.capK > 1) {
        capScale = c.capK;
        try { return spu.apply(this, arguments); } finally { capScale = 1; }
      }
      return spu.apply(this, arguments);
    };
    // Sin grietas nuevas: el reloj que ve Rift se queda en 0.
    const RF = ns.Rift;
    if (RF && typeof RF.update === 'function') {
      const ru = RF.update;
      RF.update = function (dt, pl) {
        const c = act();
        if (c && c.noRift && !RF.inArena) return ru.call(this, dt, pl, 0);
        return ru.apply(this, arguments);
      };
    }
    // Enemigos y jefes nuevos, y su escala.
    const add = EM.add;
    EM.add = function (e) {
      const c = act();
      if (c && c.onAdd && e) { try { c.onAdd(e, ns, c); } catch (err) { NX.trip(KEY, err); } }
      return add.apply(this, arguments);
    };
    const E = ns.Enemies;
    for (const k of ['scale', 'bossScale']) {
      const f = E[k];
      if (typeof f !== 'function') continue;
      E[k] = function (t) {
        const r = f.apply(this, arguments);
        const c = act();
        if (c && c.scale && r) { try { return c.scale(r, t, k === 'bossScale'); } catch (err) { NX.trip(KEY, err); } }
        return r;
      };
    }
  }

  // ---------------------------------------------------------------- reloj del modo
  function tick() {
    const c = act();
    if (!c) return;
    const G = ns.Game, p = c.player, st = G.state;
    if (G.player !== p || !LIVE.has(st)) return;
    const t = G.st.time || 0;
    const dt = Math.max(0, t - (c.lastT == null ? t : c.lastT));
    c.lastT = t;
    if (c.noHeal && !p.dead) {
      if (c.hpCap != null && p.hp > c.hpCap) p.hp = c.hpCap;
      c.hpCap = p.hp;
    }
    if (c.chaos > 0 && st === 'playing' && !ns.Judgment.active && !ns.Rift.inArena) {
      c.chaosT -= dt;
      if (c.chaosT <= 0) {
        c.chaosT = c.chaos;
        const kinds = Object.keys(ns.Weather.KINDS || {});
        const cur = ns.Weather.current && ns.Weather.current.kind;
        const pool = kinds.filter((k) => k !== cur);
        if (pool.length) ns.Weather.force(pool[Math.floor(Math.random() * pool.length)], c.chaos);
      }
    }
    if (c.onTick) c.onTick(ns, p, c, dt);
  }

  // ---------------------------------------------------------------- píldora y pausa
  let pill = null, pauseRow = null;
  function pillOff() { if (pill) pill.classList.add('hidden'); }
  function pillUpdate() {
    if (!pill) return;
    const c = act();
    const live = c && ns.Game.player === c.player && LIVE.has(ns.Game.state) && ns.Game.state !== 'paused';
    if (!live) { pillOff(); return; }
    let extra = '';
    try { extra = c.pillExtra ? c.pillExtra(ns, c) || '' : ''; } catch (err) { NX.trip(KEY, err); }
    const html = `<b>${NX.esc(c.label)}</b>${c.tags.length ? ' · ' + NX.esc(c.tags.join(' · ')) : ''}${extra ? ' · ' + NX.esc(extra) : ''}`;
    if (pill.innerHTML !== html) pill.innerHTML = html;
    pill.classList.remove('hidden');
  }

  function renderPause() {
    if (!pauseRow) return;
    const c = act();
    pauseRow.innerHTML = '';
    pauseRow.hidden = !c;
    if (!c) return;
    const tag = document.createElement('div');
    tag.className = 'nx-md-tag';
    tag.textContent = 'Modo Nexus: ' + c.label + (c.tags.length ? ' · ' + c.tags.join(' · ') : '');
    pauseRow.appendChild(tag);
    for (const b of c.pause || []) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'btn';
      el.dataset.sfx = 'none';
      el.textContent = b.label;
      el.dataset.nxShow = b.show ? '1' : '';
      el._nxDef = b;
      let armT = 0;
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        el.blur();
        if (b.confirm && !el.classList.contains('armed')) {
          el.classList.add('armed', 'danger');
          el.textContent = b.confirm;
          clearTimeout(armT);
          armT = setTimeout(() => { el.classList.remove('armed', 'danger'); el.textContent = b.label; }, 3500);
          return;
        }
        el.classList.remove('armed', 'danger');
        el.textContent = b.label;
        try { b.onClick(ctx, ns); } catch (err) { NX.trip(KEY, err); }
        syncPause();
      });
      pauseRow.appendChild(el);
    }
    syncPause();
  }
  function syncPause() {
    if (!pauseRow) return;
    const c = act();
    for (const el of pauseRow.querySelectorAll('button')) {
      const b = el._nxDef;
      el.hidden = !!(b && b.show && c && !b.show(c, ns));
    }
  }
  const resume = () => { const r = document.getElementById("btn-resume"); if (r) r.click(); };

  // ---------------------------------------------------------------- selector
  const visibleDefs = () => defs.filter((d) => NX.isOn(d.key));
  function openModal(key) {
    if (!modal || !on()) return;
    const list = visibleDefs();
    if (!list.length) { NX.toast('No hay modos activos · Alt+N para activarlos'); return; }
    if (key) curTab = key;
    if (!list.some((d) => d.key === curTab)) curTab = list[0].key;
    renderModal();
    modal.classList.remove('hidden');
  }
  function closeModal() { if (modal) modal.classList.add('hidden'); }
  function renderModal() {
    const box = modal.querySelector('.nx-md-box');
    const list = visibleDefs();
    box.innerHTML = `<div class="nx-md-head"><h2>Modos Nexus</h2><button type="button" class="btn small ghost" data-x>Cerrar</button></div>
      <div class="nx-md-tabs">${list.map((d) => `<button type="button" class="chip${d.key === curTab ? ' on' : ''}" data-k="${NX.esc(d.key)}">${NX.esc(d.title)}</button>`).join('')}</div>
      <div class="nx-md-body"></div>`;
    box.querySelector('[data-x]').addEventListener('click', closeModal);
    box.querySelectorAll('.nx-md-tabs .chip').forEach((b) => b.addEventListener('click', () => {
      curTab = b.dataset.k;
      NX.store.set('modes:tab', curTab);
      renderModal();
    }));
    const body = box.querySelector('.nx-md-body');
    const d = list.find((x) => x.key === curTab);
    if (!d) return;
    try { d.render(body, helpers); } catch (err) { body.appendChild(NX.ui.note('No se pudo mostrar: ' + err.message)); }
  }
  const canPlay = () => !!(ns && ns.Game && ns.Game.state === 'ui' && ns.DB && ns.DB.save && !(ns.Social && ns.Social.room));
  const helpers = {
    desc(el, text) { const p = document.createElement('p'); p.className = 'nx-md-desc'; p.textContent = text; el.appendChild(p); return p; },
    cards(el, items) {
      const g = document.createElement('div');
      g.className = 'nx-md-grid';
      g.innerHTML = items.map(([k, v]) => `<div class="nx-md-card"><span>${NX.esc(k)}</span><b>${NX.esc(v)}</b></div>`).join('');
      el.appendChild(g);
      return g;
    },
    table(el, head, rows, empty) {
      if (!rows.length) { el.appendChild(NX.ui.note(empty || 'Sin partidas todavía.')); return null; }
      const t = document.createElement('table');
      t.className = 'nx-md-t';
      t.innerHTML = `<tr>${head.map((h) => `<th>${NX.esc(h)}</th>`).join('')}</tr>` +
        rows.map((r) => `<tr>${r.map((v) => `<td>${NX.esc(v)}</td>`).join('')}</tr>`).join('');
      el.appendChild(t);
      return t;
    },
    foot(el, label, onPlay, extra) {
      const f = document.createElement('div');
      f.className = 'nx-md-foot';
      for (const [l, fn] of extra || []) {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'btn small'; b.textContent = l;
        b.addEventListener('click', fn);
        f.appendChild(b);
      }
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'btn gold'; b.textContent = label;
      b.addEventListener('click', () => { try { onPlay(); } catch (err) { NX.toast('No se pudo arrancar: ' + err.message); } });
      f.appendChild(b);
      el.appendChild(f);
      return f;
    },
    rerender: () => renderModal(),
  };

  NX.modes = {
    register(def) { defs.push(def); defs.sort((a, b) => (a.order || 0) - (b.order || 0)); },
    ctx: () => act(),
    canPlay,
    // Arranca una partida con el modo cfg. Solo desde el menú.
    launch(cfg) {
      if (!on()) { NX.toast('Los Modos Nexus están apagados'); return false; }
      if (!canPlay()) { NX.toast('Vuelve al menú principal para empezar un modo'); return false; }
      closeModal();
      pending = cfg;
      try {
        if (ns.Audio && ns.Audio.sfx) ns.Audio.sfx('confirm');
        if (ns.Flow && typeof ns.Flow.play === 'function') ns.Flow.play(); else ns.Game.startRun();
      } catch (err) {
        pending = null;
        if (ctx) finish('error');
        throw err;
      }
      pending = null;
      return true;
    },
    // Termina la partida sin el cierre normal (sin monedas, estadísticas ni
    // guardado) y vuelve al menú. Lo usa el laboratorio.
    exitToMenu() {
      const G = ns.Game;
      try { G.toUI(); } catch (_) { /* nada */ }
      try { ns.EnemyMgr.clear(); ns.Pickups.clear(); ns.Projectiles.clear(); ns.Combat.clearFields(); } catch (_) { /* nada */ }
      finish('ui');
      try { ns.UI.hideAll(); } catch (_) { /* nada */ }
      try { ns.UI.chrome(true); } catch (_) { /* nada */ }
      ns.Flow.goMenu();
    },
    resume,
    // open('lab') abre la ventana directo en la pestaña de ese modo.
    open(tab) {
      if (typeof tab === 'string' && tab) { curTab = tab; NX.store.set('modes:tab', tab); }
      openModal();
    },
    close: closeModal,
    fmt: (s) => NX.fmtTime(s),
    date: (ms) => { const d = new Date(ms); return d.toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit' }); },
    dexName: (dex) => { const m = ns && ns.DEX_BY && ns.DEX_BY[dex]; return (m && m.name) || ('#' + dex); },
    ns: () => ns,
  };

  NX.feature({
    key: KEY,
    label: 'Modos Nexus',
    needs: (n) => n.Game && typeof n.Game.startRun === 'function' && n.Judgment && typeof n.Judgment.update === 'function' &&
      typeof n.Judgment.summary === 'function' && n.Spawner && typeof n.Spawner.update === 'function' && n.EnemyMgr && typeof n.EnemyMgr.add === 'function' &&
      n.Enemies && Array.isArray(n.Enemies.BOSSES) && n.Player && n.Player.prototype && typeof n.Player.prototype.hurt === 'function' &&
      n.Enemy && n.Enemy.prototype && typeof n.Enemy.prototype.hurt === 'function' && n.DB && n.Flow && n.Weather && n.Rift,
    setup(n) {
      ns = n;
      hook();
      NX.runs.on('end', (p) => { if (ctx && p === ctx.player) finish(ns.Game.state); });
      setInterval(() => { try { tick(); pillUpdate(); } catch (err) { NX.trip(KEY, err); } }, 100);

      // Copia de estadísticas de una partida infinita que no terminó (pestaña cerrada).
      const rec = setInterval(() => {
        const s = ns.DB && ns.DB.save;
        if (!s || !s.stats) return;
        clearInterval(rec);
        const snap = NX.store.get(SNAP_KEY, null);
        if (!snap || ctx) return;
        if ((s.stats.runs || 0) === snap.runs && Date.now() - snap.at < 7 * 864e5) {
          restoreStats(snap);
          try { ns.DB.commit(true); } catch (_) { /* sin conexión */ }
        }
        NX.store.set(SNAP_KEY, null);
      }, 1000);

      NX.onReady(() => {
        pill = document.createElement('div');
        pill.id = 'nexus-mode-pill';
        pill.className = 'hidden';
        document.body.appendChild(pill);

        modal = document.createElement('section');
        modal.id = 'nexus-modes';
        modal.className = 'scr dim hidden';
        modal.innerHTML = '<div class="box nx-md-box"></div>';
        for (const ev of ['pointerdown', 'mousedown', 'touchstart', 'click', 'wheel']) modal.addEventListener(ev, (e) => e.stopPropagation());
        modal.addEventListener('keydown', (e) => { if (e.key !== 'Escape') e.stopPropagation(); });
        modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
        document.body.appendChild(modal);

        // Botón en el menú principal, debajo de Jugar.
        const place = () => {
          const play = document.querySelector('#scr-menu [data-go="play"]');
          let b = document.getElementById('nexus-modes-btn');
          if (!on() || !visibleDefs().length) { if (b) b.remove(); return; }
          if (!play) return;
          if (!b) {
            b = document.createElement('button');
            b.type = 'button';
            b.id = 'nexus-modes-btn';
            b.className = 'menu-item';
            b.dataset.sfx = 'confirm';
            b.innerHTML = '<span class="mi-ico" aria-hidden="true">∞</span><span>Modos Nexus</span><small>Infinito, Boss Rush, diario, laboratorio y modificadores</small>';
            b.addEventListener('click', (e) => { e.stopPropagation(); b.blur(); openModal(); });
            play.after(b);
          } else if (play.nextElementSibling !== b) play.after(b);
        };
        place();
        setInterval(() => {
          place();
          if (modal && !modal.classList.contains('hidden') && !(ns.Game.state === 'ui')) closeModal();
          syncPause();
        }, 500);

        const pauseBox = document.querySelector('#scr-pause .box');
        const btnRow = pauseBox && pauseBox.querySelector(':scope > .row');
        if (btnRow) {
          pauseRow = document.createElement('div');
          pauseRow.id = 'nexus-mode-pause';
          pauseRow.className = 'row';
          pauseRow.hidden = true;
          btnRow.after(pauseRow);
        }
      });
    },
  });

  NX.keys.bind((e) => e.key === 'Escape' && modal && !modal.classList.contains('hidden'), () => { closeModal(); return true; });

  NX.settings.section({
    key: KEY,
    tab: 'Modos',
    title: 'Modos Nexus',
    keywords: 'modos infinito boss rush diario laboratorio modificadores menú',
    render(el) {
      el.appendChild(NX.ui.toggle('Activado', 'on:' + KEY, true));
      el.appendChild(NX.ui.note('Añade el botón Modos Nexus debajo de Jugar en el menú principal. Apagado, el juego queda como siempre.'));
      el.appendChild(NX.ui.button('Abrir Modos Nexus', () => {
        if (!canPlay()) { NX.toast('Abre los modos desde el menú principal'); return; }
        NX.togglePanel();
        openModal();
      }));
    },
  });
})();

// ---- features/modifiers.js
// Modificadores de partida: densidad de enemigos, daño recibido, daño
// infligido, velocidad del juego, sin curación y clima caótico. Se eligen en
// Modos Nexus o en el panel (Alt+N) y pueden aplicarse a las partidas
// normales. El motor de modes.js los aplica; aquí viven los valores, la
// píldora (sus etiquetas) y el ranking local por combinación.
(() => {
  const KEY = 'mods';
  const RANK_KEY = 'mods:rank';
  const KEEP = 10;
  const CHAOS_EVERY = 45; // segundos entre cambios de clima
  const DEF = { density: 1, taken: 1, dealt: 1, speed: 1, noHeal: false, chaos: false };
  const x = (v) => 'x' + (+v).toFixed(2).replace(/0$/, '').replace(/\.0$/, '');

  const values = () => ({
    density: +NX.store.get('mods:density', 1) || 1,
    taken: +NX.store.get('mods:taken', 1) || 1,
    dealt: +NX.store.get('mods:dealt', 1) || 1,
    speed: NX.clamp(+NX.store.get('mods:speed', 1) || 1, 0.75, 1.5),
    noHeal: !!NX.store.get('mods:noHeal', false),
    chaos: !!NX.store.get('mods:chaos', false),
  });
  const norm = (v) => Object.assign({}, DEF, v || {});
  const neutral = (v) => { v = norm(v); return v.density === 1 && v.taken === 1 && v.dealt === 1 && v.speed === 1 && !v.noHeal && !v.chaos; };
  const tags = (v) => {
    v = norm(v);
    const t = [];
    if (v.density !== 1) t.push('Enemigos ' + x(v.density));
    if (v.taken !== 1) t.push('Daño recibido ' + x(v.taken));
    if (v.dealt !== 1) t.push('Tu daño ' + x(v.dealt));
    if (v.speed !== 1) t.push('Velocidad ' + x(v.speed));
    if (v.noHeal) t.push('Sin curación');
    if (v.chaos) t.push('Clima caótico');
    return t;
  };
  const sig = (v) => { v = norm(v); return [v.density, v.taken, v.dealt, v.speed, v.noHeal ? 1 : 0, v.chaos ? 1 : 0].join('|'); };
  const sigText = (s) => {
    const [d, t, dl, sp, nh, ch] = String(s).split('|');
    const txt = tags({ density: +d, taken: +t, dealt: +dl, speed: +sp, noHeal: nh === '1', chaos: ch === '1' });
    return txt.length ? txt.join(' · ') : 'Sin modificadores';
  };

  const loadRank = () => { const r = NX.store.get(RANK_KEY, {}); return r && typeof r === 'object' ? r : {}; };

  NX.modsApi = {
    values,
    neutral,
    tags,
    sig,
    sigText,
    enabled: () => !!NX.store.get('mods:on', false),
    // Efectos para el motor de modos.
    effects(v) {
      v = norm(v);
      return {
        spawnK: v.density, capK: Math.max(1, v.density), taken: v.taken, dealt: v.dealt,
        speed: NX.clamp(v.speed, 0.75, 1.5), noHeal: !!v.noHeal, chaos: v.chaos ? CHAOS_EVERY : 0, tags: tags(v),
      };
    },
    // Guarda la partida en el ranking local de su combinación.
    record(v, info) {
      if (!info || info.how === 'replaced' || info.time < 5) return '';
      const r = loadRank(), k = sig(v);
      const list = Array.isArray(r[k]) ? r[k] : [];
      const e = { time: Math.floor(info.time), level: info.level, kills: info.kills, dex: info.dex, mon: info.mon, at: Date.now(), dead: info.dead };
      list.push(e);
      list.sort((a, b) => b.time - a.time || b.level - a.level || b.kills - a.kills);
      if (list.length > KEEP) list.length = KEEP;
      r[k] = list;
      NX.store.set(RANK_KEY, r);
      const pos = list.indexOf(e);
      return pos === 0 && list.length > 1 ? '<b style="color:#ffe27a">Nuevo récord con estos modificadores</b>' : (pos >= 0 ? `Puesto ${pos + 1} con estos modificadores` : '');
    },
    board: (v) => { const l = loadRank()[sig(v)]; return Array.isArray(l) ? l : []; },
  };

  const fmtX = (v) => x(v);
  function controls(el, onChange) {
    const ch = () => { if (onChange) onChange(); };
    el.appendChild(NX.ui.range('Densidad de enemigos', 'mods:density', 0.5, 2, 0.25, 1, fmtX, ch));
    el.appendChild(NX.ui.range('Daño recibido', 'mods:taken', 0.5, 2, 0.25, 1, fmtX, ch));
    el.appendChild(NX.ui.range('Daño infligido', 'mods:dealt', 0.5, 2, 0.25, 1, fmtX, ch));
    el.appendChild(NX.ui.range('Velocidad del juego', 'mods:speed', 0.75, 1.5, 0.25, 1, fmtX, ch));
    el.appendChild(NX.ui.toggle('Sin curación', 'mods:noHeal', false, ch));
    el.appendChild(NX.ui.toggle('Clima caótico (cambia cada 45 s)', 'mods:chaos', false, ch));
  }
  function board(el, h) {
    const wrap = document.createElement('div');
    const draw = () => {
      wrap.innerHTML = '';
      const v = values();
      const t = document.createElement('p');
      t.className = 'nx-note';
      t.textContent = 'Ranking local · ' + sigText(sig(v));
      wrap.appendChild(t);
      const rows = NX.modsApi.board(v).map((e, i) => [String(i + 1), NX.fmtTime(e.time), 'Nv. ' + e.level, String(e.kills), e.mon || NX.modes.dexName(e.dex), NX.modes.date(e.at)]);
      if (h) h.table(wrap, ['#', 'Tiempo', 'Nivel', 'Bajas', 'Pokémon', 'Fecha'], rows, 'Sin partidas con esta combinación.');
      else if (!rows.length) wrap.appendChild(NX.ui.note('Sin partidas con esta combinación.'));
      else wrap.appendChild(NX.ui.note(rows.slice(0, 5).map((r) => `${r[0]}. ${r[1]} · ${r[2]} · ${r[4]}`).join('  |  ')));
    };
    draw();
    el.appendChild(wrap);
    return draw;
  }

  NX.feature({
    key: KEY,
    label: 'Modificadores de partida',
    needs: () => !!NX.modes,
    setup() {
      NX.modes.register({
        key: KEY,
        title: 'Modificadores',
        order: 2,
        render(el, h) {
          h.desc(el, 'Cambia las reglas de la partida. Fuera del ranking del juego; cada combinación tiene su propio ranking local. La velocidad por encima de x1 también marca la partida como de prueba para el juego.');
          let draw = null;
          controls(el, () => draw && draw());
          el.appendChild(NX.ui.toggle('Aplicar también al pulsar Jugar', 'mods:on', false));
          draw = board(el, h);
          h.foot(el, 'Jugar con modificadores', () => {
            const v = values();
            if (neutral(v)) { NX.toast('Elige al menos un modificador'); return; }
            NX.modes.launch({ key: KEY, label: 'Modificadores', mods: v });
          }, [['Restablecer', () => {
            for (const k of Object.keys(DEF)) NX.store.set('mods:' + k, DEF[k]);
            h.rerender();
          }]]);
        },
      });
    },
  });

  NX.settings.section({
    key: KEY,
    tab: 'Modos',
    title: 'Modificadores de partida',
    keywords: 'modificadores densidad daño velocidad curación clima caótico ranking',
    render(el) {
      el.appendChild(NX.ui.toggle('Activado', 'on:' + KEY, true));
      el.appendChild(NX.ui.toggle('Aplicar al pulsar Jugar', 'mods:on', false));
      let draw = null;
      controls(el, () => draw && draw());
      draw = board(el, null);
      el.appendChild(NX.ui.button('Borrar ranking local', () => { NX.store.set(RANK_KEY, {}); draw(); NX.toast('Ranking de modificadores borrado'); }));
    },
  });
})();

// ---- features/music.js
// Música: apaga la música original del juego (por defecto) y permite poner
// archivos de audio propios para el menú, cada bioma, los jefes, las grietas
// y el juicio final.
//
// Cómo suena la música del juego: no hay archivos. Audio.music(nombre) la
// sintetiza en vivo con Web Audio a partir de las partituras de MUSIC
// (village es el menú, BIOME_MUSIC son forest, cave y volcano, y además boss,
// rift y judgment). Si el nombre pedido es distinto del actual, funde y
// desconecta la pista anterior y, si el nombre no es vacío, programa la nueva.
// Este módulo envuelve Audio.music: recuerda qué pidió el juego y le pasa
// null cuando la música original está apagada o cuando suena una pista
// propia, así el sintetizador ni siquiera programa notas. Audio.sfx no se
// toca. Las pistas propias suenan en un elemento <audio> con el volumen de
// música del juego (Audio.settings.music y muted).
// La idea de interceptar Audio.music por área viene de setupMusic de
// PokeSurvivor Plus (MIT); el código es propio.
(() => {
  const KEY = 'music';
  const SLOTS = [
    ['menu', 'Menú principal'],
    ['forest', 'Bosque'],
    ['cave', 'Cueva'],
    ['volcano', 'Volcán'],
    ['boss', 'Jefes'],
    ['rift', 'Grietas legendarias'],
    ['judgment', 'Juicio final'],
    ['run', 'Partida (respaldo para todo lo vacío)'],
  ];
  const SLOT_OF = { village: 'menu', forest: 'forest', cave: 'cave', volcano: 'volcano', boss: 'boss', rift: 'rift', judgment: 'judgment' };
  // Si un hueco está vacío, se prueba con el siguiente de su lista.
  const FALLBACK = { forest: ['run'], cave: ['run'], volcano: ['run'], boss: ['run'], rift: ['boss', 'run'], judgment: ['boss', 'run'] };

  // ---------- almacenamiento de archivos (IndexedDB) ----------
  let dbP = null;
  const db = () => dbP || (dbP = new Promise((res, rej) => {
    if (!window.indexedDB) { rej(new Error('Este navegador no tiene IndexedDB')); return; }
    const r = indexedDB.open('nexus-music', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('tracks', { keyPath: 'id' });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  }));
  const tx = async (mode, fn) => {
    const d = await db();
    return new Promise((res, rej) => {
      const t = d.transaction('tracks', mode);
      const req = fn(t.objectStore('tracks'));
      t.oncomplete = () => res(req && req.result);
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error);
    });
  };
  const meta = new Map(); // id -> { id, name, size }
  let metaReady = null;
  const loadMeta = () => metaReady || (metaReady = (async () => {
    try {
      const all = await tx('readonly', (s) => s.getAll());
      for (const t of all || []) meta.set(t.id, { id: t.id, name: t.name, size: t.size });
    } catch (err) { console.warn('[nexus] música:', err); }
  })());

  const slots = () => { const s = NX.store.get('music:slots', null); return s && typeof s === 'object' ? s : {}; };
  const setSlots = (s) => NX.store.set('music:slots', s);
  const listOf = (slot) => (slots()[slot] || []).filter((id) => meta.has(id));
  const gameMusicOn = () => NX.store.get('music:game', 'off') === 'on';

  async function addFiles(slot, files) {
    const s = slots();
    const ids = s[slot] || [];
    let n = 0;
    for (const f of files) {
      if (!f || !/^audio\//.test(f.type || '') && !/\.(mp3|ogg|oga|opus|wav|m4a|aac|flac|webm)$/i.test(f.name)) continue;
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
      const name = f.name.replace(/\.[^.]+$/, '').slice(0, 60) || 'Pista';
      await tx('readwrite', (st) => st.put({ id, name, size: f.size, type: f.type, blob: f, added: Date.now() }));
      meta.set(id, { id, name, size: f.size });
      ids.push(id);
      n++;
    }
    s[slot] = ids;
    setSlots(s);
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (_) { /* opcional */ }
    return n;
  }
  async function removeFrom(slot, id) {
    const s = slots();
    s[slot] = (s[slot] || []).filter((x) => x !== id);
    setSlots(s);
    // Si ningún hueco la usa, se borra el archivo.
    if (!Object.values(s).some((l) => Array.isArray(l) && l.includes(id))) {
      meta.delete(id);
      try { await tx('readwrite', (st) => st.delete(id)); } catch (err) { console.warn('[nexus] música:', err); }
    }
  }
  const getBlob = async (id) => { const r = await tx('readonly', (st) => st.get(id)); return r && r.blob; };

  // ---------- reproducción ----------
  let A = null, orig = null;
  let want = null;         // la pista que pidió el juego
  let curSlot = null, curId = null, curUrl = '', nameNow = '';
  const lastIdx = {};
  let au = null, fade = 0, fadeT = 0, blocked = false, gen = 0;

  const targetVol = () => {
    try {
      const st = A.settings;
      if (st.muted) return 0;
      return NX.clamp((+st.music || 0) * (NX.clamp(+NX.store.get('music:gain', 100) || 0, 0, 100) / 100), 0, 1);
    } catch (_) { return 0.5; }
  };
  const player = () => {
    if (au) return au;
    au = new Audio();
    au.preload = 'auto';
    au.addEventListener('ended', () => { if (curSlot) next(curSlot, true); });
    au.addEventListener('error', () => { if (curSlot && curId) { console.warn('[nexus] música: no se pudo leer', nameNow); setTimeout(() => next(curSlot, true), 1000); } });
    return au;
  };
  const tryPlay = () => {
    if (!au || !curId) return;
    const p = au.play();
    if (p && p.catch) p.then(() => { blocked = false; }, () => { blocked = true; });
  };
  // Los navegadores no dejan sonar audio sin un toque previo: se reintenta en el primero.
  for (const ev of ['pointerdown', 'keydown', 'touchend']) addEventListener(ev, () => { if (blocked && curId && !document.hidden) tryPlay(); }, true);
  document.addEventListener('visibilitychange', () => {
    if (!au || !curId) return;
    if (document.hidden) au.pause(); else tryPlay();
  });

  function setFade(to, ms, done) {
    clearInterval(fadeT);
    const from = fade, t0 = performance.now();
    fadeT = setInterval(() => {
      const t = Math.min(1, (performance.now() - t0) / ms);
      fade = from + (to - from) * t;
      if (au) au.volume = NX.clamp(targetVol() * fade, 0, 1);
      if (t >= 1) { clearInterval(fadeT); if (done) done(); }
    }, 40);
  }

  function resolveList(slot) {
    for (const s of [slot, ...(FALLBACK[slot] || [])]) {
      const l = listOf(s);
      if (l.length) return { slot: s, list: l };
    }
    return null;
  }
  function pickFrom(slot, list) {
    if (list.length === 1) return list[0];
    let i;
    if (NX.store.get('music:shuffle', false)) {
      do { i = Math.floor(Math.random() * list.length); } while (list[i] === curId && list.length > 1);
    } else i = ((lastIdx[slot] ?? -1) + 1) % list.length;
    lastIdx[slot] = i;
    return list[i];
  }

  async function start(slot, id, loop) {
    const my = ++gen;
    const blob = await getBlob(id).catch(() => null);
    if (my !== gen) return;
    if (!blob) { meta.delete(id); next(slot, true); return; }
    const a = player();
    if (curUrl) URL.revokeObjectURL(curUrl);
    curUrl = URL.createObjectURL(blob);
    curId = id;
    nameNow = (meta.get(id) || {}).name || '';
    a.src = curUrl;
    a.loop = !!loop;
    fade = 0;
    a.volume = 0;
    tryPlay();
    setFade(1, 700);
    if (NX.shown('scr-menu') && nameNow) NX.toast('Suena: ' + nameNow);
  }
  function next(slot, force) {
    const r = resolveList(slot);
    if (!r) { stopCustom(); return; }
    curSlot = slot;
    const id = pickFrom(r.slot, r.list);
    if (!force && id === curId && au && !au.paused) return;
    const loop = r.list.length <= 1;
    if (au && curId && !au.paused && fade > 0.05) setFade(0, 350, () => start(slot, id, loop));
    else start(slot, id, loop);
  }
  function stopCustom() {
    curSlot = null;
    gen++;
    if (!au || !curId) { curId = null; return; }
    setFade(0, 400, () => {
      if (curSlot) return;
      au.pause();
      au.removeAttribute('src');
      au.load();
      if (curUrl) { URL.revokeObjectURL(curUrl); curUrl = ''; }
      curId = null;
      nameNow = '';
    });
  }

  const slotFor = (name) => {
    if (!name) return null;
    if (SLOT_OF[name]) return SLOT_OF[name];
    return NX.inRun() ? 'run' : null;
  };

  // Decide qué suena para lo que pidió el juego.
  function route(self) {
    const on = NX.isOn(KEY);
    if (!on) { stopCustom(); return orig.call(self, want); }
    const slot = slotFor(want);
    const r = slot && resolveList(slot);
    if (r) {
      orig.call(self, null);
      if (curSlot !== slot || !curId || !r.list.includes(curId)) next(slot, true);
      else if (au) au.loop = r.list.length <= 1;
      return;
    }
    stopCustom();
    return orig.call(self, gameMusicOn() ? want : null);
  }
  const refresh = () => { if (A && orig) { try { route(A); } catch (err) { NX.trip(KEY, err); } } };

  NX.feature({
    key: KEY,
    label: 'Música',
    needs: (ns) => ns.Audio && typeof ns.Audio.music === 'function' && ns.Audio.settings,
    setup(ns) {
      A = ns.Audio;
      orig = A.music;
      // Lo que el juego haya puesto antes de engancharnos.
      want = A.track || null;
      A.music = function (name) {
        want = name || null;
        try { return route(this); } catch (err) { NX.trip(KEY, err); return orig.call(this, gameMusicOn() || !NX.isOn(KEY) ? name : null); }
      };
      loadMeta().then(refresh);
      refresh();
      setInterval(() => {
        try {
          // El juego pide la música del menú una sola vez al abrirlo; si eso
          // pasó antes de engancharnos, se deduce aquí.
          if (!want && ns.Game && ns.Game.state === 'ui' && NX.shown('scr-menu')) { want = 'village'; refresh(); }
          if (au && curId && !au.paused && fade >= 1) au.volume = targetVol();
        } catch (err) { NX.trip(KEY, err); }
      }, 500);
    },
  });

  // ---------- panel ----------
  const fmtMB = (b) => (b / 1048576).toFixed(1) + ' MB';
  NX.css(`#nexus-panel .nx-mus-slot{margin:6px 0;padding:6px 8px;border:1px solid rgba(255,255,255,.18);border-radius:7px}
#nexus-panel .nx-mus-slot .hd{display:flex;justify-content:space-between;align-items:center;gap:8px}
#nexus-panel .nx-mus-slot .hd b{font-weight:400;color:#ffd23f}
#nexus-panel .nx-mus-slot ul{list-style:none;margin:4px 0 0;padding:0}
#nexus-panel .nx-mus-slot li{display:flex;justify-content:space-between;align-items:center;gap:6px;font-size:12px;padding:1px 0}
#nexus-panel .nx-mus-slot li span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
#nexus-panel .nx-mus-slot li .nx-btn{font-size:11px;padding:1px 7px;margin:0}
#nexus-panel .nx-mus-slot .nx-btn{margin:0}`);

  let preview = null;
  function renderSlots(box) {
    box.innerHTML = '';
    const now = document.createElement('p');
    now.className = 'nx-note';
    now.textContent = curId ? 'Suena ahora: ' + nameNow : (gameMusicOn() ? 'Suena la música del juego.' : 'Sin música sonando.');
    box.appendChild(now);
    let total = 0;
    for (const [slot, label] of SLOTS) {
      const ids = listOf(slot);
      const d = document.createElement('div');
      d.className = 'nx-mus-slot';
      d.innerHTML = `<div class="hd"><span>${NX.esc(label)} <b>${ids.length ? ids.length : ''}</b></span></div><ul></ul>`;
      const inp = document.createElement('input');
      inp.type = 'file';
      inp.accept = 'audio/*';
      inp.multiple = true;
      inp.hidden = true;
      inp.addEventListener('change', async () => {
        const files = [...inp.files];
        if (!files.length) return;
        try {
          const n = await addFiles(slot, files);
          NX.toast(n ? `${n} pista${n > 1 ? 's' : ''} agregada${n > 1 ? 's' : ''}` : 'Ningún archivo era de audio');
        } catch (err) { NX.toast('No se pudo guardar: ' + (err && err.message || err)); }
        refresh();
        renderSlots(box);
        setTimeout(() => { if (box.isConnected) renderSlots(box); }, 400);
      });
      const add = NX.ui.button('Agregar', () => inp.click());
      d.querySelector('.hd').append(add, inp);
      const ul = d.querySelector('ul');
      for (const id of ids) {
        const m = meta.get(id);
        total += m.size || 0;
        const li = document.createElement('li');
        li.innerHTML = `<span title="${NX.esc(m.name)}">${NX.esc(m.name)}</span>`;
        const play = NX.ui.button(preview && preview.dataset.id === id ? 'Parar' : 'Probar', async () => {
          if (preview) { preview.pause(); URL.revokeObjectURL(preview.src); const was = preview.dataset.id; preview = null; if (was === id) { renderSlots(box); return; } }
          const blob = await getBlob(id).catch(() => null);
          if (!blob) return;
          preview = new Audio(URL.createObjectURL(blob));
          preview.dataset.id = id;
          preview.volume = targetVol() || 0.5;
          preview.play().catch(() => {});
          preview.addEventListener('ended', () => { preview = null; renderSlots(box); });
          renderSlots(box);
        });
        const del = NX.ui.button('Quitar', async () => { await removeFrom(slot, id); renderSlots(box); refresh(); });
        li.append(play, del);
        ul.appendChild(li);
      }
      box.appendChild(d);
    }
    if (total) box.appendChild(NX.ui.note('Espacio usado: ' + fmtMB(total) + '. Los archivos se guardan solo en este navegador.'));
  }

  NX.settings.section({
    key: KEY,
    title: 'Música',
    tab: 'Estilo',
    keywords: 'música musica canciones audio mp3 archivos propios bioma jefe menú sonido volumen aleatorio',
    render(el) {
      el.appendChild(NX.ui.toggle('Activado', 'on:' + KEY, true, refresh));
      el.appendChild(NX.ui.select('Música del juego', 'music:game', [['off', 'Apagada'], ['on', 'Encendida']], 'off', () => { refresh(); renderSlots(box); }));
      el.appendChild(NX.ui.toggle('Orden aleatorio', 'music:shuffle', false));
      el.appendChild(NX.ui.range('Volumen de tu música', 'music:gain', 0, 100, 5, 100, (v) => v + ' %', () => { if (au && curId && fade >= 1) au.volume = targetVol(); }));
      el.appendChild(NX.ui.note('Tu música sigue el volumen de música del juego y suena aunque la música original esté apagada. Los efectos de sonido no cambian.'));
      const box = document.createElement('div');
      el.appendChild(box);
      renderSlots(box);
      loadMeta().then(() => { if (box.isConnected) renderSlots(box); });
    },
  });
})();

// ---- features/run-history.js
// Historial de partidas, ranking personal y autopsia.
// Alt+R abre una ventana con las últimas partidas (gráfica de daño en el
// tiempo) y tu propia tier list por Pokémon. Al morir, un panel junto a la
// pantalla de fin explica qué te derrotó. Los datos vienen de NX.telemetry,
// que se evalúa después de este archivo: se accede a él de forma perezosa.
// Ventana inspirada en la de PokeSurvivor Plus (MIT).
(() => {
  const KEY = 'hist';
  const AKEY = 'hist:autopsy';
  const MIN_TIME = 30; // partidas más cortas no cuentan para el ranking

  const runs = () => (NX.telemetry ? NX.telemetry.history() : (NX.store.get('tele:runs', []) || []));
  const fmt = (n) => {
    n = +n || 0;
    if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e4) return (n / 1e3).toFixed(1) + 'k';
    return String(Math.round(n));
  };
  const median = (a) => {
    if (!a.length) return 0;
    const s = a.slice().sort((x, y) => x - y), m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };
  const fmtDate = (t) => {
    const d = new Date(t);
    return d.toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' });
  };
  const OUTCOME = { death: 'Derrota', over: 'Fin de partida', quit: 'Abandonada' };

  // ---- ranking personal
  // Puntaje de 0 a 100: 60 % mediana de tiempo sobrevivido y 40 % mediana de
  // DPS, cada una frente a tu mejor Pokémon. Con pocas partidas se acerca a
  // la mediana general (equivale a sumar 2 partidas promedio).
  const METHOD = 'Puntaje: 60 % mediana de tiempo y 40 % mediana de DPS frente a tu mejor Pokémon; con pocas partidas se acerca al promedio.';
  NX.personalRank = () => {
    const all = runs().filter((r) => r && r.dex && (r.time || 0) >= MIN_TIME);
    if (!all.length) return [];
    const by = new Map();
    for (const r of all) {
      const g = by.get(r.dex) || { dex: r.dex, name: r.mon || '?', t: [], d: [] };
      g.t.push(r.time || 0);
      g.d.push(r.dps || 0);
      by.set(r.dex, g);
    }
    const gT = median(all.map((r) => r.time || 0)), gD = median(all.map((r) => r.dps || 0)), K = 2;
    const rows = [...by.values()].map((g) => {
      const n = g.t.length, mt = median(g.t), md = median(g.d);
      return { dex: g.dex, name: g.name, runs: n, medTime: mt, medDps: md, adjT: (n * mt + K * gT) / (n + K), adjD: (n * md + K * gD) / (n + K) };
    });
    const maxT = Math.max(1, ...rows.map((r) => r.adjT)), maxD = Math.max(1, ...rows.map((r) => r.adjD));
    for (const r of rows) {
      r.score = Math.round(100 * (0.6 * (r.adjT / maxT) + 0.4 * (r.adjD / maxD)));
      r.tier = r.score >= 85 ? 'S' : r.score >= 70 ? 'A' : r.score >= 55 ? 'B' : r.score >= 40 ? 'C' : 'D';
      delete r.adjT; delete r.adjD;
    }
    return rows.sort((a, b) => b.score - a.score);
  };

  // ---- gráficas en canvas
  function canvas(w, h) {
    const c = document.createElement('canvas');
    const dpr = NX.clamp(NX.realDpr(), 1, 3);
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
    c.style.width = w + 'px';
    c.style.height = h + 'px';
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    return [c, g];
  }
  // Línea con relleno. pts: números; max: tope del eje vertical.
  function line(g, w, h, pts, max, color, fill) {
    if (!pts || pts.length < 2) return;
    const top = Math.max(1e-9, max || Math.max(...pts));
    g.beginPath();
    pts.forEach((v, i) => {
      const x = (i / (pts.length - 1)) * (w - 4) + 2, y = h - 3 - (Math.max(0, v) / top) * (h - 8);
      if (i) g.lineTo(x, y); else g.moveTo(x, y);
    });
    g.lineWidth = 2;
    g.strokeStyle = color;
    g.stroke();
    if (fill) {
      g.lineTo(w - 2, h - 3);
      g.lineTo(2, h - 3);
      g.closePath();
      g.fillStyle = fill;
      g.fill();
    }
  }
  function bars(g, w, h, vals, color) {
    if (!vals || !vals.length) return;
    const top = Math.max(1, ...vals), bw = (w - 4) / vals.length;
    g.fillStyle = color;
    vals.forEach((v, i) => {
      const bh = (Math.max(0, v) / top) * (h - 8);
      g.fillRect(2 + i * bw + 1, h - 3 - bh, Math.max(1, bw - 2), bh);
    });
  }
  function grid(g, w, h) {
    g.fillStyle = 'rgba(0,0,0,.28)';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,.08)';
    g.lineWidth = 1;
    for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(0, (h * i) / 4 + 0.5); g.lineTo(w, (h * i) / 4 + 0.5); g.stroke(); }
  }

  // ---- ventana de historial y ranking
  NX.css(`#nexus-hist{position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;background:rgba(4,8,20,.6)}
#nexus-hist.hidden{display:none}
#nexus-hist .nx-hw{width:min(760px,calc(100vw - 24px));max-height:calc(100vh - 40px);overflow:auto;box-sizing:border-box;padding:14px 16px;color:#fff;
  background:linear-gradient(#24407f,#152a5c);border:2px solid #f4f8ff;outline:2px solid #0b1838;border-radius:10px;
  box-shadow:inset 0 0 0 2px #5b83d6,0 6px 0 #0a1430;font:13px/1.35 var(--font,'Pixelify',system-ui,sans-serif)}
#nexus-hist h2{margin:0 0 6px;font-size:19px;color:#ffd23f;display:flex;justify-content:space-between;align-items:center;gap:8px}
#nexus-hist h4{margin:10px 0 4px;font-size:13px;color:#9fd0ff}
#nexus-hist button{font:inherit;font-size:12px;background:#0b1838;color:#fff;border:2px solid #5b83d6;border-radius:6px;cursor:pointer;padding:2px 10px}
#nexus-hist button.on,#nexus-hist button:hover{border-color:#ffd23f}
#nexus-hist .nx-tabs{display:flex;gap:6px;margin-bottom:8px}
#nexus-hist .nx-cols{display:grid;grid-template-columns:230px 1fr;gap:12px}
@media (max-width:640px){#nexus-hist .nx-cols{grid-template-columns:1fr}}
#nexus-hist .nx-list{display:grid;gap:3px;max-height:440px;overflow:auto;padding-right:2px}
#nexus-hist .nx-it{text-align:left;display:grid;grid-template-columns:1fr auto;gap:0 6px;padding:4px 7px;border-width:1px}
#nexus-hist .nx-it small{color:#b9cbf0}
#nexus-hist .nx-it.death b{color:#ffb3b3}
#nexus-hist .nx-tiles{display:grid;grid-template-columns:repeat(3,1fr);gap:5px}
#nexus-hist .nx-tiles div{background:rgba(0,0,0,.25);border-radius:7px;padding:4px 8px}
#nexus-hist .nx-tiles small{display:block;color:#b9cbf0;font-size:11px}
#nexus-hist .nx-tiles b{font-size:15px}
#nexus-hist .nx-mv{display:grid;grid-template-columns:1fr auto;gap:2px 8px;font-size:12px}
#nexus-hist .nx-leg{font-size:11px;color:#b9cbf0;margin-top:2px}
#nexus-hist .nx-leg i{display:inline-block;width:10px;height:3px;margin:0 4px 2px 8px;vertical-align:middle}
#nexus-hist table{width:100%;border-collapse:collapse;font-size:12.5px}
#nexus-hist th{text-align:left;color:#9fd0ff;font-weight:600;padding:3px 6px}
#nexus-hist td{padding:3px 6px;border-top:1px solid rgba(255,255,255,.08)}
#nexus-hist .nx-tier{display:inline-block;min-width:22px;text-align:center;border-radius:5px;font-weight:700;color:#0b1838}
#nexus-hist .nx-note{font-size:12px;opacity:.8;margin:4px 0}
#nexus-hist .nx-foot{display:flex;gap:6px;justify-content:flex-end;margin-top:10px}`);
  const TIER_COL = { S: '#ff7b7b', A: '#ffb36b', B: '#ffe66b', C: '#9be37b', D: '#7fc8ff' };

  let win = null, view = 'runs', pick = 0;

  function tiles(r) {
    const t = [['Tiempo', NX.fmtTime(r.time)], ['Nivel', r.level], ['Bajas', fmt(r.kills)], ['Daño', fmt(r.dmg)], ['DPS', fmt(r.dps)], ['Recibido', fmt(r.taken)]];
    return `<div class="nx-tiles">${t.map(([k, v]) => `<div><small>${k}</small><b>${NX.esc(v)}</b></div>`).join('')}</div>`;
  }

  function renderRuns(box) {
    const list = runs();
    if (!list.length) {
      box.insertAdjacentHTML('beforeend', '<p class="nx-note">Aún no hay partidas guardadas. Se guardan al terminar una partida o al salir de una que duró más de un minuto.</p>');
      return;
    }
    pick = NX.clamp(pick, 0, list.length - 1);
    const r = list[pick];
    const cols = document.createElement('div');
    cols.className = 'nx-cols';
    cols.innerHTML = `<div class="nx-list">${list.map((h, i) =>
      `<button type="button" data-i="${i}" class="nx-it ${h.outcome === 'death' ? 'death' : ''} ${i === pick ? 'on' : ''}"><b>${NX.esc(h.mon)}${h.shiny ? ' ★' : ''}</b><span>${NX.fmtTime(h.time)}</span><small>${fmtDate(h.at)}</small><small>Nv ${h.level}${h.coop ? ' · co-op' : ''}</small></button>`).join('')}</div>
      <div class="nx-det"></div>`;
    box.appendChild(cols);
    cols.querySelector('.nx-list').addEventListener('click', (e) => {
      const b = e.target.closest('[data-i]');
      if (!b) return;
      pick = +b.dataset.i;
      render();
    });
    const det = cols.querySelector('.nx-det');
    const cause = r.outcome === 'death' && r.killer ? ` · ${NX.esc(r.killer)}${r.killerHow ? ' (' + NX.esc(r.killerHow) + ')' : ''}` : '';
    det.innerHTML = `<h4 style="margin-top:0">${NX.esc(r.mon)}${r.shiny ? ' ★' : ''} · ${fmtDate(r.at)}</h4>
      <p class="nx-note">${OUTCOME[r.outcome] || 'Partida'}${cause}</p>${tiles(r)}
      <h4>Daño en el tiempo</h4><div class="nx-chart"></div>
      <div class="nx-leg"><i style="background:#ffd23f"></i>daño acumulado<i style="background:#5be08a"></i>vida</div>
      <h4>Movimientos con más daño</h4>
      <div class="nx-mv">${(r.moves || []).map((m) => `<span>${NX.esc(m.name)}</span><span>${fmt(m.dmg)}</span>`).join('') || '<span>Sin datos</span>'}</div>`;
    const W = Math.max(260, Math.min(470, (win.querySelector('.nx-hw').clientWidth || 700) - 280)), H = 120;
    const [c, g] = canvas(W, H);
    grid(g, W, H);
    const s = r.series || {};
    line(g, W, H, s.hp, 1, '#5be08a', null);
    line(g, W, H, s.dmg, 0, '#ffd23f', 'rgba(255,210,63,.18)');
    det.querySelector('.nx-chart').appendChild(c);
  }

  function renderRank(box) {
    const rank = NX.personalRank();
    box.insertAdjacentHTML('beforeend', `<p class="nx-note">${NX.esc(METHOD)} Cuentan partidas de ${MIN_TIME} s o más.</p>`);
    if (!rank.length) { box.insertAdjacentHTML('beforeend', '<p class="nx-note">Juega algunas partidas para ver tu ranking.</p>'); return; }
    box.insertAdjacentHTML('beforeend', `<table><thead><tr><th>Tier</th><th>Pokémon</th><th>Partidas</th><th>Tiempo (mediana)</th><th>DPS (mediana)</th><th>Puntaje</th></tr></thead><tbody>${
      rank.map((r) => `<tr><td><span class="nx-tier" style="background:${TIER_COL[r.tier]}">${r.tier}</span></td><td>${NX.esc(r.name)}</td><td>${r.runs}</td><td>${NX.fmtTime(r.medTime)}</td><td>${fmt(r.medDps)}</td><td>${r.score}</td></tr>`).join('')}</tbody></table>`);
  }

  function render() {
    const box = win.querySelector('.nx-hw');
    box.innerHTML = `<h2>Historial de partidas <button type="button" data-act="close">Cerrar</button></h2>
      <div class="nx-tabs"><button type="button" data-v="runs" class="${view === 'runs' ? 'on' : ''}">Partidas</button><button type="button" data-v="rank" class="${view === 'rank' ? 'on' : ''}">Ranking personal</button></div>`;
    if (view === 'rank') renderRank(box); else renderRuns(box);
    box.insertAdjacentHTML('beforeend', `<div class="nx-foot"><span class="nx-note" style="margin-right:auto">Alt+R abre y cierra · la partida no se pausa</span>
      <button type="button" data-act="export">Exportar JSON</button><button type="button" data-act="clear">Borrar historial</button></div>`);
  }

  function toggle(force) {
    if (!win) return;
    const open = force != null ? force : win.classList.contains('hidden');
    if (open) { pick = 0; render(); }
    win.classList.toggle('hidden', !open);
  }

  // ---- autopsia
  NX.css(`#nexus-autopsy{position:fixed;right:16px;top:70px;z-index:99990;width:300px;max-height:calc(100vh - 90px);overflow:auto;box-sizing:border-box;
  padding:10px 12px;color:#fff;font:12.5px/1.3 var(--font,'Pixelify',system-ui,sans-serif);background:linear-gradient(#3a1f3f,#22122e);
  border:2px solid #f4f8ff;outline:2px solid #0b1838;border-radius:9px;box-shadow:inset 0 0 0 2px #b0476a,0 4px 0 #0a1430}
#nexus-autopsy.hidden{display:none}
#nexus-autopsy h3{margin:0 0 4px;font-size:16px;color:#ff9aa8;display:flex;justify-content:space-between;align-items:center}
#nexus-autopsy h4{margin:8px 0 3px;font-size:12px;color:#ffc7d0}
#nexus-autopsy button{font:inherit;font-size:11px;background:#0b1838;color:#fff;border:2px solid #b0476a;border-radius:5px;cursor:pointer;padding:1px 8px}
#nexus-autopsy .nx-kb{background:rgba(0,0,0,.3);border-radius:6px;padding:5px 8px}
#nexus-autopsy .nx-kb b{color:#ffd23f}
#nexus-autopsy .nx-hits{display:grid;grid-template-columns:auto 1fr auto auto;gap:1px 6px;font-size:11.5px}
#nexus-autopsy .nx-hits span:nth-child(4n+1),#nexus-autopsy .nx-hits span:nth-child(4n){color:#c9b3c9}
#nexus-autopsy .nx-hits span:nth-child(4n+3){color:#ff8a96;text-align:right}
#nexus-autopsy small{color:#c9b3c9}`);
  let aut = null, autShownFor = 0, autClosed = 0;

  function renderAutopsy(r) {
    const k = r.killerInfo;
    const hits = (r.hits || []).slice().reverse();
    const killTxt = k
      ? `<b>${NX.esc(k.name)}</b>${k.how ? ' · ' + NX.esc(k.how) : ''}${k.boss ? ' · jefe' : ''}${k.legend ? ' · legendario' : ''}<br><small>Golpe de ${fmt(k.dmg)} en el ${NX.fmtTime(k.t)}</small>`
      : 'No se pudo identificar el golpe final.';
    aut.innerHTML = `<h3>Autopsia <button type="button" data-act="close">Cerrar</button></h3>
      <div class="nx-kb">${killTxt}</div>
      <h4>Últimos golpes recibidos</h4>
      <div class="nx-hits">${hits.map((h) => `<span>${NX.fmtTime(h.t)}</span><span>${NX.esc(h.name)}${h.how ? ' <small>(' + NX.esc(h.how) + ')</small>' : ''}</span><span>-${fmt(h.dmg)}</span><span>${fmt(h.hp)}</span>`).join('') || '<span></span><span>Sin golpes registrados</span><span></span><span></span>'}</div>
      ${(r.sources || []).length ? `<h4>Daño recibido por fuente</h4><div class="nx-hits">${r.sources.slice(0, 4).map((s) => `<span></span><span>${NX.esc(s.name)}</span><span>-${fmt(s.dmg)}</span><span></span>`).join('')}</div>` : ''}
      <h4>Vida en los últimos ${Math.max(1, (r.recentHp || []).length)} s</h4><div class="nx-c1"></div>
      <h4>Bajas por minuto</h4><div class="nx-c2"></div>`;
    const W = 272;
    {
      const [c, g] = canvas(W, 64);
      grid(g, W, 64);
      line(g, W, 64, r.recentHp, 1, '#5be08a', 'rgba(91,224,138,.18)');
      aut.querySelector('.nx-c1').appendChild(c);
    }
    {
      const [c, g] = canvas(W, 56);
      grid(g, W, 56);
      if ((r.kpm || []).length) bars(g, W, 56, r.kpm, '#ff9aa8');
      aut.querySelector('.nx-c2').appendChild(c);
      if (!(r.kpm || []).length) aut.querySelector('.nx-c2').insertAdjacentHTML('beforeend', '<small>Partida de menos de un minuto.</small>');
    }
  }

  function autopsyTick() {
    if (!aut) return;
    const r = NX.telemetry && NX.telemetry.last();
    const want = NX.isOn(AKEY) && r && r.outcome === 'death' && NX.shown('scr-over') && !NX.inRun() &&
      Date.now() - r.endedAt < 10 * 60 * 1000 && autClosed !== r.endedAt;
    if (want && autShownFor !== r.endedAt) { autShownFor = r.endedAt; renderAutopsy(r); }
    aut.classList.toggle('hidden', !want);
  }

  const stopAll = (el) => {
    for (const ev of ['pointerdown', 'mousedown', 'touchstart', 'click', 'wheel']) el.addEventListener(ev, (e) => e.stopPropagation());
    el.addEventListener('keydown', (e) => { if (e.key !== 'Escape') e.stopPropagation(); });
  };

  NX.feature({
    key: KEY,
    label: 'Historial y ranking',
    needs: () => !!NX.telemetry,
    setup() {
      NX.onReady(() => {
        win = document.createElement('div');
        win.id = 'nexus-hist';
        win.className = 'hidden';
        win.innerHTML = '<div class="nx-hw"></div>';
        stopAll(win);
        win.addEventListener('click', (e) => {
          if (e.target === win) { toggle(false); return; }
          const b = e.target.closest('button');
          if (!b) return;
          if (b.dataset.v) { view = b.dataset.v; render(); return; }
          const act = b.dataset.act;
          if (act === 'close') toggle(false);
          else if (act === 'export') NX.download('nexus-historial.json', JSON.stringify(runs(), null, 1), 'application/json');
          else if (act === 'clear') {
            if (!b.dataset.armed) { b.dataset.armed = '1'; b.textContent = 'Pulsa otra vez para confirmar'; return; }
            NX.telemetry.clearHistory();
            pick = 0;
            render();
          }
        });
        document.body.appendChild(win);
      });
      NX.keys.bind((e) => e.altKey && e.code === 'KeyR' && !e.ctrlKey && !e.metaKey && NX.isOn(KEY), () => { toggle(); return true; });
      NX.keys.bind((e) => e.key === 'Escape' && win && !win.classList.contains('hidden'), () => { toggle(false); return true; });
    },
  });

  NX.feature({
    key: AKEY,
    label: 'Autopsia',
    needs: () => !!NX.telemetry,
    setup() {
      NX.onReady(() => {
        aut = document.createElement('div');
        aut.id = 'nexus-autopsy';
        aut.className = 'hidden';
        stopAll(aut);
        aut.addEventListener('click', (e) => {
          if (e.target.closest('[data-act="close"]')) { const r = NX.telemetry.last(); autClosed = r ? r.endedAt : 0; autopsyTick(); }
        });
        document.body.appendChild(aut);
        setInterval(() => { try { autopsyTick(); } catch (err) { NX.trip(AKEY, err); } }, 250);
      });
    },
  });

  NX.settings.section({
    key: KEY,
    tab: 'Datos',
    title: 'Historial y ranking personal',
    keywords: 'partidas tier list ranking alt+r',
    render(el) {
      el.appendChild(NX.ui.toggle('Activado', 'on:' + KEY, true));
      el.appendChild(NX.ui.note('Alt+R abre tus últimas partidas y tu tier list personal por Pokémon. ' + METHOD));
      el.appendChild(NX.ui.button('Abrir historial', () => { if (NX.togglePanel) NX.togglePanel(); toggle(true); }));
    },
  });
  NX.settings.section({
    key: AKEY,
    tab: 'Datos',
    title: 'Autopsia',
    keywords: 'muerte derrota golpe final',
    render(el) {
      el.appendChild(NX.ui.toggle('Activado', 'on:' + AKEY, true));
      el.appendChild(NX.ui.note('Al morir, muestra junto a la pantalla de fin qué te dio el golpe final, los últimos golpes, la vida y las bajas por minuto.'));
    },
  });
})();

// ---- features/screen-filters.js
// Filtros de pantalla sobre el canvas del juego: Game Boy (cuatro verdes),
// nocturno (cálido y con menos brillo) y colores vivos, cada uno con su
// intensidad, más un efecto CRT aparte (líneas de barrido y viñeta curva en
// una capa que no recibe clics). Convive con el modo daltónico: si este
// también filtra #game, las dos cosas se encadenan en la misma propiedad
// filter (primero la corrección de color, luego el estilo) en vez de pisarse.
// Nada se anima por cuadro: son estilos fijos que se recalculan al cambiar un ajuste.
(() => {
  const KEY = 'sfilter';
  const SVG_NS = 'http://www.w3.org/2000/svg';
  // Paleta clásica de la Game Boy, de oscuro a claro.
  const GB = [[15, 56, 15], [48, 98, 48], [139, 172, 15], [155, 188, 15]];

  const mode = () => NX.store.get('sfilter:mode', 'off');
  const k = () => NX.clamp(+NX.store.get('sfilter:k', 70) / 100 || 0, 0, 1);
  const crtOn = () => !!NX.store.get('sfilter:crt', false);
  const crtK = () => NX.clamp(+NX.store.get('sfilter:crtK', 60) / 100 || 0, 0, 1);

  NX.css(`#nexus-crt{position:fixed;inset:0;z-index:15;pointer-events:none;display:none}
html.nx-sf-crt #nexus-crt{display:block}
#nexus-crt::before{content:"";position:absolute;inset:0;
  background:repeating-linear-gradient(to bottom,rgba(0,0,0,var(--nx-crt-line,.25)) 0,rgba(0,0,0,var(--nx-crt-line,.25)) 1px,transparent 1px,transparent 3px)}
#nexus-crt::after{content:"";position:absolute;inset:0;border-radius:var(--nx-crt-r,24px);
  box-shadow:inset 0 0 var(--nx-crt-vig,90px) rgba(0,0,0,var(--nx-crt-dark,.6)),0 0 0 40px #000;
  background:radial-gradient(ellipse at 50% 50%,transparent 62%,rgba(0,0,0,var(--nx-crt-edge,.35)) 100%)}`);

  let sheet = null, sig = '';

  function ensureSvg() {
    let svg = document.getElementById('nexus-sf-svg');
    if (svg) return svg;
    svg = document.createElementNS(SVG_NS, 'svg');
    svg.id = 'nexus-sf-svg';
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('style', 'position:absolute;width:0;height:0;overflow:hidden');
    const col = (i) => GB.map((c) => (c[i] / 255).toFixed(3)).join(' ');
    svg.innerHTML =
      // Game Boy: a gris, cuatro niveles discretos con los verdes y mezcla con el original.
      `<filter id="nexus-sf-gb" color-interpolation-filters="sRGB">
        <feColorMatrix in="SourceGraphic" type="matrix" values="0.299 0.587 0.114 0 0 0.299 0.587 0.114 0 0 0.299 0.587 0.114 0 0 0 0 0 1 0" result="g"/>
        <feComponentTransfer in="g" result="p">
          <feFuncR type="discrete" tableValues="${col(0)}"/><feFuncG type="discrete" tableValues="${col(1)}"/><feFuncB type="discrete" tableValues="${col(2)}"/>
        </feComponentTransfer>
        <feComposite in="p" in2="SourceGraphic" operator="arithmetic" k1="0" k2="1" k3="0" k4="0"/>
      </filter>` +
      // Nocturno: menos azul y menos verde, y menos brillo.
      '<filter id="nexus-sf-night" color-interpolation-filters="sRGB"><feColorMatrix type="matrix"/></filter>';
    document.body.appendChild(svg);
    return svg;
  }

  // Valor de la propiedad filter para el modo elegido, o '' si no hay.
  function filterFor(m, kk, svg) {
    if (m === 'gb') {
      const c = svg.querySelector('#nexus-sf-gb feComposite');
      c.setAttribute('k2', kk.toFixed(3));
      c.setAttribute('k3', (1 - kk).toFixed(3));
      return 'url(#nexus-sf-gb)';
    }
    if (m === 'night') {
      const b = 1 - 0.32 * kk;
      const r = b, g = b * (1 - 0.14 * kk), bl = b * (1 - 0.42 * kk);
      svg.querySelector('#nexus-sf-night feColorMatrix').setAttribute('values',
        `${r.toFixed(3)} 0 0 0 0 0 ${g.toFixed(3)} 0 0 0 0 0 ${bl.toFixed(3)} 0 0 0 0 0 1 0`);
      return 'url(#nexus-sf-night)';
    }
    if (m === 'vivid') return `saturate(${(1 + 0.9 * kk).toFixed(2)}) contrast(${(1 + 0.12 * kk).toFixed(2)})`;
    return '';
  }

  function apply() {
    if (!document.body) { NX.onReady(apply); return; }
    const on = NX.isOn(KEY);
    const m = on ? mode() : 'off', kk = k(), crt = on && crtOn(), ck = crtK();
    sig = [m, kk, crt, ck].join('|');
    const root = document.documentElement;
    const svg = ensureSvg();
    let f = kk > 0 ? filterFor(m, kk, svg) : '';
    // El CRT además realza un poco el contraste de la imagen.
    if (crt && ck > 0) f = (f + ` contrast(${(1 + 0.1 * ck).toFixed(2)}) saturate(${(1 + 0.15 * ck).toFixed(2)})`).trim();
    if (!sheet) { sheet = document.createElement('style'); sheet.id = 'nexus-sf-style'; document.head.appendChild(sheet); }
    // Más específico que la regla del modo daltónico (html.nx-cb-game #game),
    // y con su filtro primero cuando está activo.
    sheet.textContent = f
      ? `html.nx-sf #game{filter:${f}}\nhtml.nx-sf.nx-cb-game #game{filter:url(#nexus-cb) ${f}}`
      : '';
    root.classList.toggle('nx-sf', !!f);

    let ov = document.getElementById('nexus-crt');
    if (crt && ck > 0) {
      if (!ov) { ov = document.createElement('div'); ov.id = 'nexus-crt'; ov.setAttribute('aria-hidden', 'true'); document.body.appendChild(ov); }
      const s = ov.style;
      s.setProperty('--nx-crt-line', (0.08 + 0.32 * ck).toFixed(3));
      s.setProperty('--nx-crt-dark', (0.25 + 0.5 * ck).toFixed(3));
      s.setProperty('--nx-crt-edge', (0.15 + 0.35 * ck).toFixed(3));
      s.setProperty('--nx-crt-vig', Math.round(40 + 90 * ck) + 'px');
      s.setProperty('--nx-crt-r', Math.round(8 + 30 * ck) + 'px');
    }
    root.classList.toggle('nx-sf-crt', crt && ck > 0);
  }

  const MODES = [['off', 'Ninguno'], ['gb', 'Game Boy'], ['night', 'Nocturno'], ['vivid', 'Colores vivos']];
  NX.feature({
    key: KEY,
    label: 'Filtros de pantalla',
    early: true,
    setup() {
      NX.onReady(apply);
      setInterval(() => {
        const now = [NX.isOn(KEY) ? mode() : 'off', k(), NX.isOn(KEY) && crtOn(), crtK()].join('|');
        if (now !== sig) apply();
      }, 1000);
    },
  });

  const pct = (v) => v + ' %';
  NX.settings.section({
    key: KEY,
    title: 'Filtros de pantalla',
    tab: 'Estilo',
    keywords: 'filtro crt scanlines retro game boy verde nocturno noche cálido brillo saturación colores vivos pantalla',
    render(el) {
      el.appendChild(NX.ui.toggle('Activado', 'on:' + KEY, true, apply));
      el.appendChild(NX.ui.select('Filtro de color', 'sfilter:mode', MODES, 'off', apply));
      el.appendChild(NX.ui.range('Intensidad del filtro', 'sfilter:k', 0, 100, 5, 70, pct, apply));
      el.appendChild(NX.ui.toggle('Efecto CRT (líneas y curvatura)', 'sfilter:crt', false, apply));
      el.appendChild(NX.ui.range('Intensidad del CRT', 'sfilter:crtK', 0, 100, 5, 60, pct, apply));
      el.appendChild(NX.ui.note('Se combina con el modo daltónico. En teléfonos modestos los filtros pueden costar algunos FPS; bájalos o apágalos si notas tirones.'));
    },
  });
})();

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

// ---- features/telemetry.js
// Telemetría de partida: núcleo del medidor de daño, las alertas, el historial
// y la autopsia. El daño infligido sale de los contadores que el juego ya
// lleva (player.dmgDealt y move.dealt de cada movimiento), así que no hay
// hooks por golpe. El daño recibido sí se engancha en Player.hurt, que se
// llama pocas veces, para saber qué enemigo o ataque lo causó.
// Idea de muestreo e historial adaptada de PokeSurvivor Plus (MIT).
(() => {
  const KEY = 'tele';
  const RUNS_KEY = 'tele:runs';
  const MAX_RUNS = 50, MAX_PTS = 60, HITS_KEEP = 12, TICK_MS = 250, RING = 44;
  const TYPES = {
    normal: 'Normal', fire: 'Fuego', water: 'Agua', grass: 'Planta', electric: 'Eléctrico', ice: 'Hielo',
    fighting: 'Lucha', poison: 'Veneno', ground: 'Tierra', flying: 'Volador', psychic: 'Psíquico', bug: 'Bicho',
    rock: 'Roca', ghost: 'Fantasma', dragon: 'Dragón', dark: 'Siniestro', steel: 'Acero', fairy: 'Hada',
  };

  const subs = { runStart: [], runEnd: [], hit: [], death: [] };
  const emit = (ev, a) => {
    for (const fn of subs[ev]) { try { fn(a); } catch (err) { console.warn('[nexus] telemetry.' + ev, err); } }
  };

  let on = true;       // copia de NX.isOn(KEY), se refresca en cada tick
  let run = null;      // partida en curso
  let last = null;     // resumen de la última partida terminada, con detalle para la autopsia
  let hist = null;     // historial en memoria (se carga una vez)

  // Contexto del cuadro actual para atribuir el daño recibido.
  let curEnemy = null, striker = null, strikeT = 0, zone = null;

  const loadHist = () => {
    if (!hist) { const h = NX.store.get(RUNS_KEY, []); hist = Array.isArray(h) ? h : []; }
    return hist;
  };

  function newRun(p) {
    const ns = NX.ns;
    run = {
      player: p,
      at: Date.now(),
      time: 0,
      ownClock: 0,
      mon: (p.mon && p.mon.name) || '?',
      dex: (p.mon && p.mon.dex) || 0,
      shiny: !!p.shiny,
      coop: !!(ns.Coop && ns.Coop.active),
      moveDmg: new Map(),        // id -> { name, dmg }
      taken: 0,
      bySrc: new Map(),          // nombre -> daño recibido
      hits: [],                  // últimos golpes recibidos
      killer: null,
      step: 5, sDmg: [], sHp: [], sKills: [],
      recentHp: [], lastHpS: -1, // vida por segundo, últimos 60 s
      kpm: [], kpmMin: 0, kpmBase: 0,
      ringT: new Float64Array(RING), ringD: new Float64Array(RING), ringI: 0, ringN: 0,
      peakLevel: p.level || 1,
    };
    emit('runStart', current());
  }

  const enemyName = (e) => {
    const ns = NX.ns;
    return (e && (e.name || (ns.DEX_BY && ns.DEX_BY[e.dex] && ns.DEX_BY[e.dex].name))) || 'Pokémon salvaje';
  };
  const enemySrc = (e, how) => ({ name: enemyName(e), how, dex: e.dex || 0, boss: !!e.boss, legend: !!e.legend, shiny: !!e.shiny });

  // Proyectil enemigo que acaba de dar al jugador: mismo daño y tipo, el más cercano.
  function projSrc(p, dmg, type, looseOk) {
    const P = NX.ns.Projectiles;
    const arr = P && P.all && P.all();
    if (!arr || !arr.length) return null;
    let best = null, bd = Infinity, loose = null, ld = Infinity;
    for (let i = 0; i < arr.length; i++) {
      const o = arr[i];
      if (!o || o.friendly || !o.__nxs) continue;
      const d = (o.x - p.x) * (o.x - p.x) + (o.y - p.y) * (o.y - p.y);
      if (o.dmg === dmg && (type == null || o.mtype === type)) { if (d < bd) { bd = d; best = o; } }
      else if (d < ld) { ld = d; loose = o; }
    }
    if (best) return best.__nxs;
    return looseOk && loose && ld < 4900 ? loose.__nxs : null;
  }
  // Área de ataque que acaba de estallar.
  function hazardSrc(p) {
    const H = NX.ns.Hazards;
    // Según la versión del juego, Hazards.all es una función o la lista misma.
    const arr = H && (typeof H.all === 'function' ? H.all() : Array.isArray(H.all) ? H.all : null);
    if (!arr || !arr.length) return null;
    let best = null, bd = Infinity;
    for (let i = 0; i < arr.length; i++) {
      const h = arr[i];
      if (!h || !h.__nxs || !h.hit) continue;
      const d = (h.x - p.x) * (h.x - p.x) + (h.y - p.y) * (h.y - p.y);
      if (d < bd) { bd = d; best = h; }
    }
    return best && best.__nxs;
  }

  function sourceOf(p, st, dmg, type) {
    if (st) return enemySrc(st, 'contacto');
    if (curEnemy) return enemySrc(curEnemy, 'ataque');
    if (zone === 'haz') {
      const e = hazardSrc(p);
      return e ? enemySrc(e, 'ataque en área') : { name: 'Ataque en área', how: '' };
    }
    if (zone && zone !== 'Terreno') return { name: zone, how: '' };
    // El update del jugador puede contener otros pasos: primero se busca un
    // proyectil que coincida exacto y solo sin zona se acepta uno cercano.
    const e = projSrc(p, dmg, type, !zone);
    if (e) return enemySrc(e, 'proyectil');
    if (zone) return { name: zone, how: '' };
    return { name: type ? 'Ataque de tipo ' + (TYPES[type] || type) : 'Entorno', how: '' };
  }

  function record(p, lost, st, dmg, type, wasDead) {
    const src = sourceOf(p, st, dmg, type);
    const n = Math.round(lost);
    run.taken += lost;
    run.bySrc.set(src.name, (run.bySrc.get(src.name) || 0) + lost);
    const gt = NX.ns.Game.st && NX.ns.Game.st.time;
    const hit = { t: Math.round((typeof gt === 'number' ? gt : run.time) * 10) / 10, name: src.name, how: src.how, dmg: n, hp: Math.max(0, Math.round(p.hp)), max: Math.round(p.maxHp || 0), type: type || '' };
    run.hits.push(hit);
    if (run.hits.length > HITS_KEEP) run.hits.shift();
    emit('hit', hit);
    if (p.dead && !wasDead) {
      run.killer = Object.assign({}, src, { dmg: n, t: hit.t });
      emit('death', run.killer);
    }
  }

  // Envuelve un método para marcar qué enemigo está actuando.
  function wrapEnemy(P, name, isStrike) {
    const f = P && P[name];
    if (typeof f !== 'function') return;
    P[name] = function () {
      const prev = curEnemy;
      curEnemy = this;
      if (isStrike) { striker = this; strikeT = performance.now(); }
      try { return f.apply(this, arguments); } finally { curEnemy = prev; }
    };
  }
  // Envuelve el update de un módulo para etiquetar el daño que cause.
  function wrapZone(obj, name, label) {
    const f = obj && obj[name];
    if (typeof f !== 'function') return;
    obj[name] = function () {
      const prev = zone;
      zone = label;
      try { return f.apply(this, arguments); } finally { zone = prev; }
    };
  }
  // Marca con su autor lo que crea un enemigo (proyectiles y áreas).
  function wrapTag(obj, name) {
    const f = obj && obj[name];
    if (typeof f !== 'function') return;
    obj[name] = function (o) {
      const e = curEnemy;
      const out = f.apply(this, arguments);
      if (e && on) {
        if (o && typeof o === 'object' && !o.friendly) o.__nxs = e;
        if (out && typeof out === 'object' && !out.friendly) out.__nxs = e;
      }
      return out;
    };
  }

  function readMoves(p) {
    const list = Array.isArray(p.moves) ? p.moves : [];
    for (let i = 0; i < list.length; i++) {
      const m = list[i];
      if (!m || !(m.dealt > 0)) continue;
      const k = m.id || m.name;
      const cur = run.moveDmg.get(k);
      if (!cur) run.moveDmg.set(k, { name: m.name || String(k), dmg: m.dealt });
      else if (m.dealt > cur.dmg) cur.dmg = m.dealt;
    }
  }

  function halve(a) { const o = []; for (let i = 1; i < a.length; i += 2) o.push(a[i]); return o; }

  function sample(p) {
    run.sDmg.push(Math.round(p.dmgDealt || 0));
    run.sHp.push(p.maxHp > 0 ? Math.round((Math.max(0, p.hp) / p.maxHp) * 100) / 100 : 0);
    run.sKills.push(p.kills || 0);
    if (run.sDmg.length > MAX_PTS) {
      run.sDmg = halve(run.sDmg); run.sHp = halve(run.sHp); run.sKills = halve(run.sKills);
      run.step *= 2;
    }
  }

  function tick() {
    on = NX.isOn(KEY);
    if (!run) return;
    const ns = NX.ns, p = run.player;
    const t = ns.Game.st && ns.Game.st.time;
    if (typeof t === 'number') run.time = t;
    else if (ns.Game.state === 'playing') run.time += TICK_MS / 1000;
    readMoves(p);
    if ((p.level || 0) > run.peakLevel) run.peakLevel = p.level;
    // Ventana móvil para el DPS de los últimos 10 s.
    run.ringT[run.ringI] = run.time;
    run.ringD[run.ringI] = p.dmgDealt || 0;
    run.ringI = (run.ringI + 1) % RING;
    if (run.ringN < RING) run.ringN++;
    // Series acotadas.
    while (run.time >= (run.sDmg.length + 1) * run.step) sample(p);
    const s = Math.floor(run.time);
    if (s !== run.lastHpS) {
      run.lastHpS = s;
      run.recentHp.push(p.maxHp > 0 ? Math.round((Math.max(0, p.hp) / p.maxHp) * 100) / 100 : 0);
      if (run.recentHp.length > 60) run.recentHp.shift();
    }
    // Bajas por minuto.
    const min = Math.floor(run.time / 60);
    if (min > run.kpmMin && run.kpm.length < 60) {
      run.kpm.push((p.kills || 0) - run.kpmBase);
      run.kpmBase = p.kills || 0;
      run.kpmMin = min;
    }
  }

  function moveList() {
    if (!run) return [];
    const total = (run.player.dmgDealt || 0);
    let sum = 0;
    const out = [];
    for (const [id, m] of run.moveDmg) { sum += m.dmg; out.push({ id, name: m.name, dmg: m.dmg, pct: 0 }); }
    const other = total - sum;
    if (other > Math.max(1, total * 0.002)) out.push({ id: 'other', name: 'Otros (estados y habilidades)', dmg: other, pct: 0 });
    const den = Math.max(total, sum, 1);
    for (const m of out) m.pct = m.dmg / den;
    return out.sort((a, b) => b.dmg - a.dmg);
  }

  function dps10() {
    if (!run || run.ringN < 2) return 0;
    const newest = (run.ringI - 1 + RING) % RING;
    const tNow = run.ringT[newest], dNow = run.ringD[newest];
    let oi = newest;
    for (let k = 1; k < run.ringN; k++) {
      const j = (newest - k + RING) % RING;
      oi = j;
      if (tNow - run.ringT[j] >= 10) break;
    }
    const dt = tNow - run.ringT[oi];
    return dt > 0.5 ? (dNow - run.ringD[oi]) / dt : 0;
  }

  // Foto de la partida en curso (null si no hay partida).
  function current() {
    if (!run) return null;
    const p = run.player, dmg = p.dmgDealt || 0;
    return {
      active: true,
      at: run.at,
      time: run.time,
      mon: run.mon, dex: run.dex, shiny: run.shiny, coop: run.coop,
      level: p.level || 0,
      kills: p.kills || 0,
      hp: p.hp, maxHp: p.maxHp, dead: !!p.dead,
      dmg,
      dps: dmg / Math.max(1, run.time),
      dps10: dps10(),
      moves: moveList(),
      taken: run.taken,
      sources: [...run.bySrc].map(([name, d]) => ({ name, dmg: d })).sort((a, b) => b.dmg - a.dmg),
      hits: run.hits.slice(),
      killer: run.killer,
      series: { step: run.step, dmg: run.sDmg.slice(), hp: run.sHp.slice(), kills: run.sKills.slice() },
      recentHp: run.recentHp.slice(),
      kpm: run.kpm.slice(),
    };
  }

  function endRun(p, st) {
    if (!run || run.player !== p) return;
    try {
      tick();
      sample(p);
      const snap = current();
      const outcome = p.dead || run.killer ? 'death' : st === 'over' ? 'over' : 'quit';
      // Último minuto incompleto, escalado a bajas por minuto.
      const kpm = snap.kpm.slice();
      const restSec = run.time - run.kpmMin * 60;
      if (restSec >= 15 && kpm.length < 60) kpm.push(Math.round(((p.kills || 0) - run.kpmBase) * 60 / restSec));
      const summary = {
        v: 1,
        at: run.at,
        mon: run.mon, dex: run.dex, shiny: run.shiny, coop: run.coop,
        time: Math.round(run.time),
        level: Math.max(run.peakLevel, p.level || 0),
        kills: p.kills || 0,
        dmg: Math.round(snap.dmg),
        dps: Math.round(snap.dmg / Math.max(1, run.time)),
        taken: Math.round(run.taken),
        outcome,
        killer: run.killer ? run.killer.name : null,
        killerHow: run.killer ? run.killer.how : null,
        moves: snap.moves.slice(0, 5).map((m) => ({ name: m.name, dmg: Math.round(m.dmg) })),
        series: { step: snap.series.step, dmg: snap.series.dmg, hp: snap.series.hp },
        kpm,
      };
      const keep = outcome !== 'quit' || run.time >= 60;
      if (keep) {
        const h = loadHist();
        h.unshift(summary);
        if (h.length > MAX_RUNS) h.length = MAX_RUNS;
        NX.store.set(RUNS_KEY, h);
      }
      last = Object.assign({}, summary, {
        saved: keep,
        endedAt: Date.now(),
        hits: snap.hits,
        sources: snap.sources.slice(0, 6),
        recentHp: snap.recentHp,
        killerInfo: run.killer,
      });
      run = null;
      emit('runEnd', last);
    } catch (err) {
      run = null;
      NX.trip(KEY, err);
    }
  }

  NX.telemetry = {
    on(ev, fn) { if (subs[ev] && typeof fn === 'function') subs[ev].push(fn); },
    off(ev, fn) { if (subs[ev]) { const i = subs[ev].indexOf(fn); if (i >= 0) subs[ev].splice(i, 1); } },
    current,
    history: () => loadHist().slice(),
    last: () => last,
    clearHistory() { hist = []; NX.store.set(RUNS_KEY, []); },
    typeName: (t) => TYPES[t] || t || '',
  };

  NX.feature({
    key: KEY,
    label: 'Telemetría de partida',
    needs: (ns) => ns.Game && ns.Player && ns.Player.prototype && typeof ns.Player.prototype.hurt === 'function' &&
      ns.Enemy && ns.Enemy.prototype && typeof ns.Enemy.prototype.update === 'function' && ns.Projectiles && typeof ns.Projectiles.spawn === 'function',
    setup(ns) {
      const PP = ns.Player.prototype, EP = ns.Enemy.prototype;

      // Daño recibido: vida antes y después, así cuentan defensas, esquivas y bandas.
      const hurt = PP.hurt;
      PP.hurt = function (dmg, type) {
        if (!on || !run || this !== run.player) return hurt.apply(this, arguments);
        const st = striker && performance.now() - strikeT < 4 ? striker : null;
        striker = null;
        const before = this.hp, wasDead = !!this.dead;
        const r = hurt.apply(this, arguments);
        try {
          const lost = before - this.hp;
          if (lost > 0) record(this, lost, st, dmg, type, wasDead);
        } catch (err) { NX.trip(KEY, err); }
        return r;
      };

      // Quién actúa: cada enemigo durante su update y sus ataques.
      for (const m of ['update', 'shoot', 'bossCast', 'special', 'hazard', 'summon']) wrapEnemy(EP, m, false);
      wrapEnemy(EP, 'strike', true);
      // Lo que crean los enemigos queda marcado con su autor.
      wrapTag(ns.Projectiles, 'spawn');
      wrapTag(ns.Hazards, 'add');
      // Daño que no viene de un enemigo concreto.
      wrapZone(ns.Hazards, 'update', 'haz');
      wrapZone(ns.Interact, 'update', 'Trampa');
      wrapZone(ns.Judgment, 'update', 'El Juicio');
      wrapZone(ns.Events, 'update', 'Evento');
      wrapZone(ns.Rift, 'update', 'Grieta');
      wrapZone(PP, 'update', 'Terreno');

      NX.runs.on('start', (p) => { if (NX.isOn(KEY)) { try { newRun(p); } catch (err) { NX.trip(KEY, err); } } });
      NX.runs.on('end', endRun);
      // Si el módulo arrancó con una partida ya en marcha.
      const cur = NX.runs.current();
      if (cur && NX.isOn(KEY)) newRun(cur);

      setInterval(() => { try { tick(); } catch (err) { NX.trip(KEY, err); } }, TICK_MS);
    },
  });

  NX.settings.section({
    key: KEY,
    tab: 'Datos',
    title: 'Telemetría de partida',
    keywords: 'historial daño estadísticas exportar',
    render(el) {
      el.appendChild(NX.ui.toggle('Activado', 'on:' + KEY, true));
      el.appendChild(NX.ui.note('Registra daño, bajas y golpes recibidos de cada partida. Lo usan el medidor, el historial y la autopsia. Guarda las últimas 50 partidas en este navegador.'));
      el.appendChild(NX.ui.button('Exportar historial (JSON)', () => {
        NX.download('nexus-historial.json', JSON.stringify(loadHist(), null, 1), 'application/json');
      }));
      const del = NX.ui.button('Borrar historial', () => {
        if (del.dataset.armed) { NX.telemetry.clearHistory(); del.textContent = 'Historial borrado'; delete del.dataset.armed; return; }
        del.dataset.armed = '1';
        del.textContent = 'Pulsa otra vez para confirmar';
      });
      el.appendChild(del);
    },
  });
})();

// ---- features/theme.js
// Identidad visual de la Nexus Edition: logo propio en pixel art bajo el logo
// original (que se queda como crédito al juego de JPTER78), paletas de acento
// para cajas y botones con variables CSS, pantalla de inicio breve y un texto
// de bienvenida. Por defecto solo se activa en la edición; en el laboratorio
// queda en el estilo original hasta que se elija otro en el panel.
// La idea del logo sobre el título viene de setupLogoPlus y setupSplash de
// PokeSurvivor Plus (MIT); el dibujo y el código son propios.
(() => {
  const KEY = 'theme';
  const ED = () => !!(NX.data && NX.data.edition);
  const WELCOME_V = 1;

  // ---------- logo en pixel art ----------
  // Gema del Nexus, 13x13. g borde dorado, o borde en sombra, w brillo,
  // c cian claro, b cian, d azul profundo, y núcleo.
  const GEM = [
    '......g......',
    '.....gwg.....',
    '....gwccg....',
    '...gwccbbo...',
    '..gwccbbbdo..',
    '.gwccbybbddo.',
    'gwccbyyybbddo',
    '.gccbbybbddo.',
    '..gcbbbbddo..',
    '...gbbbddo...',
    '....gbddo....',
    '.....gdo.....',
    '......o......',
  ];
  // Letras 5x7 para NEXUS y 3x5 (la N de 4) para EDITION.
  const BIG = {
    N: ['X...X', 'XX..X', 'XX..X', 'X.X.X', 'X..XX', 'X..XX', 'X...X'],
    E: ['XXXXX', 'X....', 'X....', 'XXXX.', 'X....', 'X....', 'XXXXX'],
    X: ['X...X', 'X...X', '.X.X.', '..X..', '.X.X.', 'X...X', 'X...X'],
    U: ['X...X', 'X...X', 'X...X', 'X...X', 'X...X', 'X...X', '.XXX.'],
    S: ['.XXXX', 'X....', 'X....', '.XXX.', '....X', '....X', 'XXXX.'],
  };
  const SMALL = {
    E: ['XXX', 'X..', 'XX.', 'X..', 'XXX'],
    D: ['XX.', 'X.X', 'X.X', 'X.X', 'XX.'],
    I: ['XXX', '.X.', '.X.', '.X.', 'XXX'],
    T: ['XXX', '.X.', '.X.', '.X.', '.X.'],
    O: ['XXX', 'X.X', 'X.X', 'X.X', 'XXX'],
    N: ['X..X', 'XX.X', 'X.XX', 'X..X', 'X..X'],
  };
  const COLORS = {
    g: '#ffd23f', o: '#c77a12', w: '#ffffff', c: '#a8f4ff', b: '#3cc4f0', d: '#1d6fc4', y: '#fff3a0',
    n1: '#e2fcff', n2: '#5fe0ff', n3: '#2f9be8', e1: '#fff6b8', e2: '#ffd23f', e3: '#f0a31e',
    k: '#0b1838', s: '#05081a',
  };

  function buildLogo() {
    const W = 48, H = 17;
    const grid = Array.from({ length: H }, () => Array(W).fill(''));
    const put = (x, y, c) => { if (x >= 0 && y >= 0 && x < W && y < H) grid[y][x] = c; };
    GEM.forEach((row, y) => [...row].forEach((ch, x) => { if (ch !== '.') put(1 + x, 1 + y, ch); }));
    const word = (text, font, x0, y0, shade) => {
      let x = x0;
      for (const L of text) {
        const g = font[L];
        g.forEach((row, y) => [...row].forEach((ch, dx) => { if (ch === 'X') put(x + dx, y0 + y, shade(y, g.length)); }));
        x += g[0].length + 1;
      }
    };
    word('NEXUS', BIG, 17, 1, (y) => (y < 2 ? 'n1' : y < 5 ? 'n2' : 'n3'));
    word('EDITION', SMALL, 18, 10, (y) => (y < 2 ? 'e1' : y < 4 ? 'e2' : 'e3'));
    // Contorno oscuro de un píxel y sombra desplazada, como el título del juego.
    const filled = (x, y) => y >= 0 && x >= 0 && y < H && x < W && grid[y][x] && grid[y][x] !== 'k' && grid[y][x] !== 's';
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (grid[y][x]) continue;
      for (let dy = -1; dy <= 1 && !grid[y][x]; dy++) for (let dx = -1; dx <= 1; dx++) if (filled(x + dx, y + dy)) { grid[y][x] = 'k'; break; }
    }
    const solid = grid.map((r) => r.map((c) => !!c));
    for (let y = H - 1; y >= 1; y--) for (let x = W - 1; x >= 1; x--) if (!grid[y][x] && solid[y - 1][x - 1]) grid[y][x] = 's';
    // Un rectángulo por cada tramo horizontal del mismo color.
    let rects = '';
    for (let y = 0; y < H; y++) {
      let x = 0;
      while (x < W) {
        const c = grid[y][x];
        if (!c) { x++; continue; }
        let e = x + 1;
        while (e < W && grid[y][e] === c) e++;
        rects += `<rect x="${x}" y="${y}" width="${e - x}" height="1" fill="${COLORS[c]}"/>`;
        x = e;
      }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" shape-rendering="crispEdges" role="img" aria-label="Nexus Edition">${rects}</svg>`;
  }
  let logoSvg = '';
  const logo = () => logoSvg || (logoSvg = buildLogo());

  // ---------- paletas ----------
  const PALETTES = {
    nexus: { name: 'Nexus (violeta y cian)', box1: '#3a3396', box2: '#1c1758', edge: '#f2f0ff', edgeIn: '#7d70f2', edgeOut: '#0c0a2e', shadow: '#0b0a26', muted: '#c9c3f5', btn1: '#5b50d4', btn2: '#342b98', hover: 'rgba(95,224,255,.14)', accent: '#5fe0ff' },
    esmeralda: { name: 'Esmeralda', box1: '#1f6b5a', box2: '#0f3b33', edge: '#effff9', edgeIn: '#46b894', edgeOut: '#06201b', shadow: '#04150f', muted: '#bfe8da', btn1: '#2f8f76', btn2: '#1c5f4f', hover: 'rgba(120,255,200,.12)', accent: '#7dffcf' },
    carmesi: { name: 'Carmesí', box1: '#8a2a3e', box2: '#4a1222', edge: '#fff2f4', edgeIn: '#d05a72', edgeOut: '#250610', shadow: '#1a040b', muted: '#f1c4cd', btn1: '#b03a52', btn2: '#7a2236', hover: 'rgba(255,160,180,.13)', accent: '#ffb3c1' },
    noche: { name: 'Noche (gris azulado)', box1: '#2f3a4f', box2: '#161c2a', edge: '#eef3fb', edgeIn: '#6a7d9e', edgeOut: '#070a12', shadow: '#05070d', muted: '#bac6da', btn1: '#4a5a78', btn2: '#2b3549', hover: 'rgba(200,220,255,.10)', accent: '#9fd0ff' },
  };
  const paletteCss = Object.entries(PALETTES).map(([id, p]) => `html.nx-th-${id}{--box1:${p.box1};--box2:${p.box2};--edge:${p.edge};--edge-in:${p.edgeIn};--edge-out:${p.edgeOut};--shadow:${p.shadow};--muted:${p.muted};--nx-btn1:${p.btn1};--nx-btn2:${p.btn2};--nx-hover:${p.hover};--nx-accent:${p.accent}}`).join('\n');

  NX.css(`${paletteCss}
html.nx-th .btn:not(.gold):not(.ghost):not(.google):not(.danger){background:linear-gradient(180deg,var(--nx-btn1),var(--nx-btn2))}
html.nx-th .menu-item:hover,html.nx-th .menu-item:focus-visible{background:var(--nx-hover)}
html.nx-th #nexus-panel .nx-box{background:linear-gradient(var(--box1),var(--box2));border-color:var(--edge);outline-color:var(--edge-out);box-shadow:inset 0 0 0 2px var(--edge-in),0 6px 0 var(--edge-out)}
html.nx-th #nexus-panel h3{color:var(--nx-accent)}
html.nx-th #nexus-panel select,html.nx-th #nexus-panel .nx-search,html.nx-th #nexus-panel .nx-btn,html.nx-th #nexus-panel .nx-close,html.nx-th #nexus-panel .nx-tabs button:not(.on){background:var(--edge-out);border-color:var(--edge-in)}
html.nx-th #nexus-fab{background:var(--box2);outline-color:var(--edge-out)}
#nx-logo{display:flex;justify-content:center;margin:10px auto 0;line-height:0;pointer-events:none}
#nx-logo svg{height:clamp(36px,7.5vh,64px);width:auto;filter:drop-shadow(0 0 10px rgba(95,224,255,.25))}
@media (max-height:660px){#nx-logo{margin-top:6px}#nx-logo svg{height:clamp(30px,6.5vh,44px)}}
@media (max-height:520px){#nx-logo{margin-top:3px}#nx-logo svg{height:24px}}
@media (max-height:400px){#nx-logo svg{height:21px}}
.boot-in .nx-boot-logo{display:flex;justify-content:center;line-height:0;margin:14px 0 4px}
.boot-in .nx-boot-logo svg{height:clamp(44px,10vh,84px);width:auto}
#nx-splash{position:fixed;inset:0;z-index:100002;display:flex;align-items:center;justify-content:center;cursor:pointer;
  background:radial-gradient(ellipse at 50% 45%,#231d63 0%,#0d0b2c 55%,#04050f 100%);transition:opacity .45s ease}
#nx-splash.out{opacity:0;pointer-events:none}
#nx-splash .in{text-align:center;padding:20px;font:16px/1.35 var(--font,'Pixelify',system-ui,sans-serif);color:#dfe4ff;text-shadow:2px 2px 0 #000}
#nx-splash .lg{line-height:0;display:flex;justify-content:center}
#nx-splash .lg svg{height:min(30vh,170px);max-width:88vw;width:auto;animation:nxSplashIn .7s cubic-bezier(.2,.9,.3,1.15) both}
#nx-splash .t{margin-top:16px;font-size:clamp(15px,2.6vh,20px);color:#ffd23f;letter-spacing:1px;animation:nxSplashFade .6s .25s both}
#nx-splash .s{margin-top:4px;font-size:clamp(11px,1.8vh,14px);color:#a9b3e6;animation:nxSplashFade .6s .35s both}
@keyframes nxSplashIn{from{transform:scale(.82);opacity:0}to{transform:none;opacity:1}}
@keyframes nxSplashFade{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){#nx-splash .lg svg,#nx-splash .t,#nx-splash .s{animation:none}}
#nx-welcome{position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(3,6,16,.6)}
#nx-welcome .box{width:min(440px,100%);text-align:left}
#nx-welcome .lg{line-height:0;display:flex;justify-content:center;margin-bottom:10px}
#nx-welcome .lg svg{height:52px;width:auto}
#nx-welcome h2{font-size:22px;color:var(--gold,#ffd23f);text-align:center}
#nx-welcome p{margin:6px 0;font-size:15px;line-height:1.4}
#nx-welcome .note{font-size:12px;color:var(--muted,#b9cbf0)}
#nx-welcome .btn{display:block;width:100%;margin:12px 0 0}
@media (max-height:520px){#nx-welcome .lg{display:none}#nx-welcome h2{font-size:18px}#nx-welcome p{font-size:13px;margin:4px 0}}`);

  const style = () => {
    const v = NX.store.get('theme:style', ED() ? 'nexus' : 'original');
    return PALETTES[v] ? v : 'original';
  };
  const opt = (k) => !!NX.store.get('theme:' + k, ED());

  // ---------- aplicar ----------
  function applyPalette() {
    const root = document.documentElement;
    if (!root) { NX.onReady(applyPalette); return; }
    const on = NX.isOn(KEY);
    const st = on ? style() : 'original';
    for (const id of Object.keys(PALETTES)) root.classList.toggle('nx-th-' + id, st === id);
    root.classList.toggle('nx-th', st !== 'original');
  }

  function ensureLogo() {
    const want = NX.isOn(KEY) && opt('logo');
    const cur = document.getElementById('nx-logo');
    if (!want) { if (cur) cur.remove(); return; }
    if (cur && cur.isConnected) return;
    const t1 = document.querySelector('#scr-menu .logo .t1');
    if (!t1) return;
    const d = document.createElement('div');
    d.id = 'nx-logo';
    d.setAttribute('translate', 'no');
    d.title = 'Nexus Edition · edición privada de PokéSurvivor, juego original de JPTER78';
    d.innerHTML = logo();
    t1.insertAdjacentElement('afterend', d);
  }

  function ensureBoot() {
    if (!NX.isOn(KEY) || !opt('logo')) return;
    for (const id of ['boot', 'tap-start']) {
      const box = document.querySelector('#' + id + ' .boot-in');
      if (!box || box.querySelector('.nx-boot-logo')) continue;
      const d = document.createElement('div');
      d.className = 'nx-boot-logo';
      d.innerHTML = logo();
      const h1 = box.querySelector('h1');
      if (h1) h1.insertAdjacentElement('afterend', d); else box.prepend(d);
    }
  }

  let splashDone = false;
  function splash() {
    if (splashDone || !NX.isOn(KEY) || !opt('splash')) return;
    splashDone = true;
    const el = document.createElement('div');
    el.id = 'nx-splash';
    el.setAttribute('translate', 'no');
    el.innerHTML = `<div class="in"><div class="lg">${logo()}</div><div class="t">PokéSurvivor · Nexus Edition</div><div class="s">Edición privada sin fines comerciales · juego original de JPTER78</div></div>`;
    let gone = false;
    const close = () => {
      if (gone) return;
      gone = true;
      el.classList.add('out');
      setTimeout(() => el.remove(), 500);
    };
    el.addEventListener('pointerdown', (e) => { e.stopPropagation(); close(); });
    document.body.appendChild(el);
    setTimeout(close, 1700);
  }

  function nick() {
    try { const s = NX.ns && NX.ns.DB && NX.ns.DB.save; return (s && s.name && String(s.name).slice(0, 20)) || ''; } catch (_) { return ''; }
  }
  function showWelcome(force) {
    if (document.getElementById('nx-welcome')) return;
    const n = nick();
    const el = document.createElement('div');
    el.id = 'nx-welcome';
    el.innerHTML = `<div class="box"><div class="lg">${logo()}</div>
      <h2>${n ? 'Bienvenido, ' + NX.esc(n) : 'Bienvenido'}</h2>
      <p>Esta es PokeSurvivor Nexus Edition, una edición privada del juego con el mod Nexus integrado.</p>
      <p>Pulsa el botón Nexus o Alt+N para ver los ajustes: estilo, filtros de pantalla, música propia y mucho más.</p>
      <p class="note">PokéSurvivor es un juego de JPTER78. Esta edición no tiene fines comerciales.</p>
      <button class="btn gold" type="button">Entendido</button></div>`;
    for (const ev of ['pointerdown', 'mousedown', 'touchstart', 'click', 'wheel']) el.addEventListener(ev, (e) => e.stopPropagation());
    el.querySelector('button').addEventListener('click', () => {
      NX.store.set('theme:welcomed', WELCOME_V);
      el.remove();
    });
    document.body.appendChild(el);
    if (force) NX.store.set('theme:welcomed', 0);
  }
  function maybeWelcome() {
    if (!NX.isOn(KEY) || !opt('welcome') || NX.store.get('theme:welcomed', 0) >= WELCOME_V) return;
    const st = NX.ns && NX.ns.Game && NX.ns.Game.state;
    if (st !== 'ui' || !NX.shown('scr-menu')) return;
    // Solo con el menú despejado: sin otra ventana del juego encima.
    const other = [...document.querySelectorAll('.scr:not(.hidden)')].some((e) => e.id !== 'scr-menu');
    if (other || NX.shown('nexus-panel') || document.getElementById('nx-splash')) return;
    showWelcome(false);
  }

  function applyAll() {
    if (!document.body) { NX.onReady(applyAll); return; }
    applyPalette();
    ensureLogo();
    ensureBoot();
  }

  NX.feature({
    key: KEY,
    label: 'Identidad Nexus Edition',
    early: true,
    setup() {
      // La paleta va lo antes posible para que la pantalla de carga no parpadee.
      applyPalette();
      NX.onReady(() => {
        applyAll();
        splash();
        // El menú puede rehacerse y otra pestaña puede cambiar el estilo.
        setInterval(() => {
          try { applyAll(); maybeWelcome(); } catch (err) { NX.trip(KEY, err); }
        }, 1000);
      });
    },
  });

  NX.settings.section({
    key: KEY,
    title: 'Identidad Nexus Edition',
    tab: 'Estilo',
    keywords: 'tema estilo logo paleta colores bienvenida pantalla de inicio splash nexus edition',
    render(el) {
      el.appendChild(NX.ui.toggle('Activado', 'on:' + KEY, true, applyAll));
      el.appendChild(NX.ui.select('Estilo de menús', 'theme:style',
        [...Object.entries(PALETTES).map(([id, p]) => [id, p.name]), ['original', 'Original del juego']],
        ED() ? 'nexus' : 'original', applyAll));
      el.appendChild(NX.ui.toggle('Logo Nexus Edition', 'theme:logo', ED(), applyAll));
      el.appendChild(NX.ui.toggle('Pantalla de inicio al cargar', 'theme:splash', ED()));
      el.appendChild(NX.ui.toggle('Bienvenida en el menú', 'theme:welcome', ED()));
      el.appendChild(NX.ui.button('Ver la bienvenida', () => { if (NX.togglePanel) NX.togglePanel(); showWelcome(true); }));
      el.appendChild(NX.ui.note('El logo original del juego se queda siempre como crédito a su autor.'));
    },
  });
})();

// ---- features/tiers.js
// Letras de tier y build recomendada de SurvivorTiers (survivortiers.pages.dev,
// de @fildotai) en la Pokédex, la selección de compañero y la ficha de cada
// Pokémon. Los datos los descarga el cascarón y llegan en NX.data.tiers.
// Basado en el enfoque de tiers de PokeSurvivor Plus (MIT).
(() => {
  const KEY = 'tiers';
  const GRIDS = ['dex-grid', 'starter-grid'];

  NX.css(`.nx-tierb{position:absolute;bottom:6px;right:6px;z-index:1;min-width:16px;height:16px;font-size:11px}
#dex-grid .cell,#starter-grid .cell{position:relative}
#dex-detail .nx-tierbox{margin:8px 0 4px;padding:7px 9px;border-radius:8px;background:rgba(0,0,0,.25);text-align:left;font-size:13px}
#dex-detail .nx-tierbox .nx-tl{display:flex;align-items:center;gap:6px;flex-wrap:wrap;color:var(--muted,#b9cbf0)}
#dex-detail .nx-tierbox .nx-tl .nx-tier{min-width:22px;height:22px;font-size:15px;border-radius:6px}
#dex-detail .nx-tierbox .nx-tl b{color:#fff}
#dex-detail .nx-tierbox .nx-bm{display:flex;flex-wrap:wrap;gap:4px;margin:6px 0 4px}
#dex-detail .nx-tierbox .nx-bm span{padding:1px 8px;border-radius:7px;color:#fff;font-size:12px;text-shadow:1px 1px 0 #0a1430}
#dex-detail .nx-tierbox .nx-cr{font-size:11px;color:var(--muted,#b9cbf0)}
#dex-detail .nx-tierbox .nx-cr a{color:inherit;text-decoration:underline}`);

  const noOf = (cell) => {
    const n = cell.querySelector('.no');
    const v = parseInt(n ? n.textContent : cell.dataset.dex || cell.dataset.no, 10);
    return Number.isFinite(v) ? v : 0;
  };

  function applyGrid(G, grid, on) {
    for (const cell of grid.querySelectorAll(':scope > .cell')) {
      const r = on ? G.tierOf(noOf(cell)) : null;
      let b = cell.querySelector(':scope > .nx-tierb');
      if (r && (!b || b.dataset.t !== r.tier)) {
        if (b) b.remove();
        cell.insertAdjacentHTML('beforeend', G.tierBadge(r, 'nx-tierb'));
        b = cell.lastElementChild;
        b.dataset.t = r.tier;
      } else if (!r && b) b.remove();
    }
  }

  // Bloque en la ficha: letra, puesto, estilo y los 4 movimientos.
  function buildBox(G, r) {
    const t = G.tiers();
    const moves = (r.moves || []).map((id) => {
      const d = G.moveDef(id);
      return `<span style="background:${G.esc(G.typeColor(d && d.type))}" title="${G.esc(d ? G.tr(d.desc) : id)}">${G.esc(G.moveName(id))}</span>`;
    }).join('');
    const other = r.otherStyle && r.otherScore ? ` · ${G.esc(G.styleName(r.otherStyle))}: ${G.num(r.otherScore, 1)}` : '';
    return `<div class="nx-tl">${G.tierBadge(r)}<span>Tier <b>${G.esc(r.tier)}</b> · puesto <b>${r.rank}</b> de ${t.total}</span></div>
      <div class="nx-tl" style="margin-top:4px"><span>Build recomendada, <b>${G.esc(G.styleName(r.style))}</b> (${G.num(r.score, 1)}${other})</span></div>
      <div class="nx-bm">${moves}</div>
      <div class="nx-cr">${G.tierMetaHtml()}</div>`;
  }
  function applyDetail(G, on) {
    const det = document.getElementById('dex-detail');
    if (!det) return;
    let box = det.querySelector('.nx-tierbox');
    const m = /(?:Nº|N°|No\.?|#)\s*(\d{1,4})/i.exec(det.textContent || '');
    const r = on && NX.store.get('tiers:detail', true) && m ? G.tierOf(+m[1]) : null;
    if (!r) { if (box) box.remove(); return; }
    const sig = r.dex + '|' + G.tierStale();
    if (box && box.dataset.sig === sig) return;
    if (!box) {
      box = document.createElement('div');
      box.className = 'nx-tierbox';
      const h = det.querySelector('h3');
      const anchor = h && h.parentElement === det ? h : h && h.parentElement;
      if (anchor && anchor !== det) anchor.insertAdjacentElement('afterend', box); else det.appendChild(box);
    }
    box.dataset.sig = sig;
    box.innerHTML = buildBox(G, r);
  }

  NX.feature({
    key: KEY,
    label: 'Tiers de SurvivorTiers',
    needs: (ns) => ns.DEX_BY && ns.Moves && NX.gd,
    setup() {
      const G = NX.gd;
      if (!G.tiers()) return; // sin datos: solo la nota en ajustes
      G.loadGameDate().then(() => { if (NX.isOn(KEY)) run(); });
      let pend = 0;
      const run = () => {
        pend = 0;
        try {
          const on = NX.isOn(KEY);
          for (const id of GRIDS) {
            const g = document.getElementById(id);
            if (g) applyGrid(G, g, on && NX.store.get(id === 'dex-grid' ? 'tiers:dex' : 'tiers:starters', true));
          }
          applyDetail(G, on);
        } catch (err) { NX.trip(KEY, err); }
      };
      const later = () => { if (!pend) pend = setTimeout(run, 60); };
      G.tiersRefresh = later;
      NX.onReady(() => {
        for (const id of [...GRIDS, 'dex-detail']) {
          const el = document.getElementById(id);
          if (el) new MutationObserver(later).observe(el, { childList: true });
        }
        later();
      });
    },
  });

  NX.settings.section({
    key: KEY,
    tab: 'Datos',
    title: 'Tiers de SurvivorTiers',
    keywords: 'tier build recomendada pokedex survivortiers ranking',
    render(el) {
      const G = NX.gd;
      const t = G && G.tiers();
      if (!t) {
        el.appendChild(NX.ui.note('Activa Permitir scripts de usuario para ver los tiers.'));
        return;
      }
      const refresh = () => G.tiersRefresh && G.tiersRefresh();
      el.appendChild(NX.ui.toggle('Activado', 'on:' + KEY, true, refresh));
      el.appendChild(NX.ui.toggle('Letras en la Pokédex', 'tiers:dex', true, refresh));
      el.appendChild(NX.ui.toggle('Letras en la selección de compañero', 'tiers:starters', true, refresh));
      el.appendChild(NX.ui.toggle('Tier y build en la ficha del Pokémon', 'tiers:detail', true, refresh));
      const p = NX.ui.note('');
      const paint = () => { p.innerHTML = `${t.total} Pokémon · ${G.tierMetaHtml()}`; };
      paint();
      G.loadGameDate().then(paint);
      el.appendChild(p);
    },
  });
})();

// ---- features/tooltips.js
// Tooltips de datos: al pasar el mouse por los huecos de movimientos del HUD,
// el objeto equipado o el clima, y números en las cartas de subida de nivel
// (daño, recarga, área y qué cambia de un nivel al siguiente).
// Adaptado de PokeSurvivor Plus (MIT): setupTips, lvlCardStats y tagLvlCards.
(() => {
  const KEY = 'tips';
  const SLOT = 54, ITEM_GAP = 18;

  NX.css(`#cards .card .nx-cstat{display:flex;flex-wrap:wrap;gap:4px 6px;margin-top:5px}
#cards .card .nx-cstat span{font-size:12px;line-height:1.25;padding:1px 7px;border-radius:6px;background:rgba(0,0,0,.25);color:#fff;white-space:nowrap}
#cards .card .nx-cstat small{font-size:11px;color:var(--muted,#b9cbf0)}
#cards .card .nx-cstat .lv{background:rgba(255,210,63,.16);color:var(--gold,#ffd23f)}
#cards .card .nx-cstat b.up{color:#7dff9a}`);

  // Qué da una carta de movimiento: los números de uno nuevo, o solo lo que
  // cambia al subirlo (antes → después).
  function cardStats(G, type, id, pl) {
    if (!id || !(type === 'new' || type === 'up' || type === 'evo')) return '';
    const cur = pl && (pl.moves || []).find((m) => m.id === id);
    const chip = (k, v) => `<span><small>${G.esc(k)}</small> ${v}</span>`;
    const diff = (a, b, head) => {
      const old = new Map(G.moveRows(a, pl)), out = head ? [head] : [];
      for (const [k, v] of G.moveRows(b, pl)) {
        const o = old.get(k);
        if (o === undefined) out.push(chip(k, `<b class="up">${G.esc(v)}</b>`));
        else if (String(o) !== String(v)) out.push(chip(k, `${G.esc(o)} → <b class="up">${G.esc(v)}</b>`));
      }
      return out.length > (head ? 1 : 0) ? out.join('') : '';
    };
    if (type === 'new' || !cur) {
      const m = G.instance(id, 1);
      return m ? G.moveRows(m, pl).map(([k, v]) => chip(k, G.esc(v))).join('') : '';
    }
    if (type === 'evo') {
      const ev = G.evolvedCopy(cur);
      return ev ? diff(cur, ev, '<span class="lv">Evolución</span>') : '';
    }
    if (cur.evolved || !cur.def || cur.lvl >= (cur.def.maxLvl || 5)) return '';
    const nxt = G.instance(id, cur.lvl + 1);
    return nxt ? diff(cur, nxt, `<span class="lv">Nv. ${cur.lvl} → ${cur.lvl + 1}</span>`) : '';
  }

  NX.feature({
    key: KEY,
    label: 'Tooltips de datos',
    needs: (ns) => ns.Moves && ns.Moves.BY_ID && ns.HUD && typeof ns.HUD.draw === 'function' && ns.Touch && typeof ns.Touch.addButton === 'function' &&
      typeof ns.Touch.clearButtons === 'function' && ns.LevelUp && ns.RunUI && NX.gd,
    setup(ns) {
      const G = NX.gd;
      // Los huecos de movimientos se registran como botones táctiles dentro de
      // HUD.draw (54 × 54, margen 7,5). Se copian sus rectángulos por cuadro,
      // en unidades del HUD, junto con la escala del contexto en ese momento
      // (otro módulo puede agrandar el HUD con ctx.scale).
      let frame = [], frameF = 1, slots = [], hud = null, hctx = null, baseA = 1;
      const T = ns.Touch;
      const scaleNow = () => { try { return hctx && hctx.getTransform ? hctx.getTransform().a / baseA || 1 : 1; } catch (_) { return 1; } };
      // Se envuelve un poco después del arranque para quedar por fuera de los
      // demás módulos que tocan el HUD y recibir las coordenadas originales.
      setTimeout(() => {
        try { wrap(); } catch (err) { NX.fail(KEY, err); }
      }, 2000);
      const wrap = () => {
        const clear = T.clearButtons, add = T.addButton;
        T.clearButtons = function () { frame = []; return clear.apply(this, arguments); };
        T.addButton = function (x, y, w, h, fn, pad) {
          if (w === h && w > 0 && pad > 0 && Math.abs(w / pad - SLOT / 7.5) < 0.05) {
            if (!frame.length) frameF = scaleNow();
            frame.push({ x, y, w, h });
          }
          return add.apply(this, arguments);
        };
        const draw = ns.HUD.draw;
        ns.HUD.draw = function (ctx, w, h) {
          hctx = ctx;
          try { baseA = (ctx && ctx.getTransform && ctx.getTransform().a) || 1; } catch (_) { baseA = 1; }
          frameF = 1;
          const r = draw.apply(this, arguments);
          slots = frame;
          hud = { canvas: ctx && ctx.canvas, w, h, f: frameF };
          hctx = null;
          return r;
        };
      };

      // Medida del letrero del clima (arriba a la derecha).
      const mctx = document.createElement('canvas').getContext('2d');
      let wxKey = '', wxW = 0;
      const weatherRect = (wx, W) => {
        const txt = String(G.tr(wx.name)).toUpperCase() + ' · ' + Math.ceil(wx.left || 0) + 's';
        if (txt.length !== wxKey.length) {
          wxKey = txt;
          mctx.font = `800 11px ${getComputedStyle(document.body).getPropertyValue('--font') || 'sans-serif'}`;
          wxW = mctx.measureText(txt).width + 40;
        }
        return { x: W - wxW - 16 - 6, y: 14 - 4, w: wxW + 12, h: 26 + 8 };
      };

      let lastKey = '';
      const hide = () => { if (lastKey) { lastKey = ''; G.tip.hide(); } };
      const inR = (r, x, y) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
      addEventListener('mousemove', (e) => {
        try {
          if (!NX.isOn(KEY) || !NX.store.get('tips:hud', true)) return hide();
          const pl = NX.me();
          if (!pl || !hud || !hud.canvas || e.target !== hud.canvas || ns.Game.state !== 'playing' || (ns.Touch && ns.Touch.active)) return hide();
          const r = hud.canvas.getBoundingClientRect();
          if (!r.width || !hud.w) return hide();
          // k: píxeles de pantalla por unidad del HUD (con su escala).
          const k = (r.width / hud.w) * (hud.f || 1), W = hud.w / (hud.f || 1);
          const hx = (e.clientX - r.left) / k, hy = (e.clientY - r.top) / k;
          let html = '', key = '', ax = 0, ay = 0, below = false;
          const si = slots.findIndex((s) => inR(s, hx, hy));
          if (si >= 0) {
            const grp = (pl.slots && pl.slots[si]) || [];
            key = 'm' + si + ':' + grp.map((m) => m.id + m.lvl + (m.evolved ? 'e' : '')).join(',') + JSON.stringify(pl.statsTaken || {});
            if (key !== lastKey) html = grp.map((m) => G.moveTip(m, pl)).join('<hr>');
            ax = slots[si].x + slots[si].w / 2; ay = slots[si].y;
          } else if (pl.item && slots.length) {
            const s0 = slots[0];
            const base = s0.y + (pl.active === 0 ? 6 : 0);
            const ir = { x: s0.x - SLOT - ITEM_GAP, y: base - 14, w: SLOT, h: SLOT + 14 };
            if (inR(ir, hx, hy)) {
              key = 'i' + pl.item;
              if (key !== lastKey) html = G.itemTip(pl.item);
              ax = ir.x + SLOT / 2; ay = ir.y;
            }
          }
          if (!key && ns.Weather && ns.Weather.current) {
            const wx = ns.Weather.current, wr = weatherRect(wx, W);
            if (inR(wr, hx, hy)) {
              key = 'w' + (wx.kind || wx.name) + Math.ceil(wx.left || 0);
              if (key !== lastKey) html = G.weatherTip(wx, pl);
              ax = wr.x + wr.w / 2; ay = wr.y + wr.h; below = true;
            }
          }
          if (!key) return hide();
          if (key === lastKey) return;
          lastKey = key;
          if (!html) return G.tip.hide();
          G.tip.show(html, r.left + ax * k, r.top + ay * k + (below ? 6 : 0), below);
        } catch (err) { NX.trip(KEY, err); }
      }, { passive: true });
      addEventListener('blur', hide);
      setInterval(() => { if (lastKey && (!NX.inRun() || ns.Game.state !== 'playing')) hide(); }, 300);

      // Números en las cartas de subida de nivel.
      G.lvl.on(KEY, (el, o, pl, on) => {
        const old = el.querySelector('.nx-cstat');
        const want = on && NX.store.get('tips:cards', true);
        const sig = want ? o.offer.key + '|' + (pl ? pl.level : '') : '';
        if (old && old.dataset.sig === sig) return;
        if (old) old.remove();
        if (!want) return;
        const html = cardStats(G, o.type, o.id, pl);
        const txt = el.querySelector('.txt');
        if (!html || !txt) return;
        const d = document.createElement('div');
        d.className = 'nx-cstat';
        d.dataset.sig = sig;
        d.innerHTML = html;
        txt.appendChild(d);
      });
    },
  });

  NX.settings.section({
    key: KEY,
    tab: 'Datos',
    title: 'Tooltips de datos',
    keywords: 'movimientos objetos clima daño recarga cartas nivel',
    render(el) {
      el.appendChild(NX.ui.toggle('Activado', 'on:' + KEY, true));
      el.appendChild(NX.ui.toggle('Tooltips en el HUD (movimientos, objeto y clima)', 'tips:hud', true));
      el.appendChild(NX.ui.toggle('Números en las cartas de subida de nivel', 'tips:cards', true, () => NX.gd && NX.gd.lvl.refresh()));
    },
  });
})();

// ---- features/upgrades.js
// Maximizar mejoras: compra de una vez todos los niveles que le faltan al
// Pokémon elegido en Mejoras. Adaptado de PokeSurvivor Plus (MIT).
// Cada nivel se compra pulsando el botón del propio juego, así que el juego
// valida el precio, descuenta, guarda y redibuja como en una compra a mano.
// Si no alcanzan las Pokémonedas, se compran primero los niveles más baratos.
(() => {
  const KEY = 'upg';
  let quiet = false;

  const ns = () => NX.ns;
  const $ = (id) => document.getElementById(id);
  const fmt = (n) => (+n || 0).toLocaleString((ns().I18n && ns().I18n.locale) || 'es');
  const coin = (n) => `<span class="coin"></span> ${fmt(n)}`;
  // Lectura sin efectos: DB.upgradesOf crea la entrada si no existe.
  const levels = (dex) => { const s = ns().DB.save; return (s && s.pupg && s.pupg[dex]) || {}; };

  function plan(dex, coins) {
    const U = ns().Upgrades;
    const now = levels(dex);
    let total = 0, left = 0, have = 0, max = 0;
    for (const u of U.LIST) {
      const l = Math.min(u.max, +now[u.id] || 0);
      have += l;
      max += u.max;
      for (let k = l; k < u.max; k++) { total += U.cost(u.id, k); left++; }
    }
    // Lo que alcanza: siempre el siguiente nivel más barato disponible.
    const cur = { ...now }, buy = [];
    let budget = coins;
    for (;;) {
      let best = null;
      for (const u of U.LIST) {
        const l = +cur[u.id] || 0;
        if (l >= u.max || (u.needs && !(+cur[u.needs] > 0))) continue;
        const c = U.cost(u.id, l);
        if (c <= budget && (!best || c < best.cost)) best = { id: u.id, lvl: l, cost: c };
      }
      if (!best) break;
      buy.push(best);
      budget -= best.cost;
      cur[best.id] = best.lvl + 1;
    }
    return { total, left, have, max, buy, spend: coins - budget };
  }

  function confirmBox(title, html, okText) {
    return new Promise((resolve) => {
      const el = document.createElement('section');
      el.className = 'scr dim nx-dlg';
      el.style.zIndex = 90;
      el.innerHTML = `<div class="box center" style="max-width:440px"><h3>${NX.esc(title)}</h3><p class="sub">${html}</p>
        <div class="row" style="justify-content:center"><button class="btn ghost" data-a="no" type="button">Cancelar</button>
        <button class="btn gold" data-a="yes" type="button">${NX.esc(okText)}</button></div></div>`;
      const key = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); done(false); } };
      const done = (v) => { el.remove(); removeEventListener('keydown', key, true); resolve(v); };
      el.addEventListener('click', (e) => {
        const a = e.target.closest('[data-a]');
        if (a) done(a.dataset.a === 'yes'); else if (e.target === el) done(false);
      });
      addEventListener('keydown', key, true);
      document.body.appendChild(el);
      el.querySelector('[data-a="yes"]').focus();
    });
  }

  // Botones de compra del juego, en el orden de Upgrades.LIST.
  const buyButtons = () => [...document.querySelectorAll('#upg-list > .upg-item')]
    .map((it) => it.querySelector('[data-buy]')).filter(Boolean);

  function run(dex, steps) {
    const { Upgrades, Audio, UI, DEX_BY } = ns();
    let n = 0;
    quiet = true;
    try {
      for (const s of steps) {
        if (+$('upg-mon').value !== dex) break;
        const btns = buyButtons();
        if (btns.length !== Upgrades.LIST.length) break; // la pantalla cambió
        const b = btns[Upgrades.LIST.findIndex((u) => u.id === s.id)];
        const before = +levels(dex)[s.id] || 0;
        if (!b || b.disabled || before !== s.lvl) break;
        b.click(); // el juego compra, guarda y redibuja la lista
        if ((+levels(dex)[s.id] || 0) !== before + 1) break;
        n++;
      }
    } finally { quiet = false; }
    if (n) {
      try { Audio.sfx('buy'); } catch (_) { /* sin sonido */ }
      const mon = (DEX_BY && DEX_BY[dex]) || {};
      try { UI.toast(`${mon.name || 'Pokémon'} · +${n} nivel${n === 1 ? '' : 'es'} de mejora`); } catch (_) { NX.toast(`+${n} niveles de mejora`); }
    } else NX.toast('No se pudo comprar ninguna mejora');
  }

  NX.css(`#nx-upg-max{white-space:nowrap}
#nx-upg-note{font-size:13px;color:var(--muted,#b9cbf0)}
.nx-off{display:none!important}`);

  function buildUi() {
    const sel = $('upg-mon'), list = $('upg-list');
    if (!sel || !list || $('nx-upg-max')) return;
    const btn = document.createElement('button');
    btn.id = 'nx-upg-max';
    btn.type = 'button';
    btn.className = 'btn small gold';
    btn.dataset.sfx = 'none';
    const note = document.createElement('span');
    note.id = 'nx-upg-note';
    sel.after(btn, note);

    let sig = '';
    const update = () => {
      const sv = ns().DB.save, dex = +sel.value;
      const on = NX.isOn(KEY) && !!sv && !!dex;
      btn.classList.toggle('nx-off', !on);
      note.classList.toggle('nx-off', !on);
      if (!on) { sig = ''; return; }
      const p = plan(dex, sv.coins || 0);
      const s = [dex, sv.coins, p.have, p.buy.length].join('|');
      if (s === sig) return;
      sig = s;
      note.textContent = `Nivel ${p.have} de ${p.max}`;
      if (!p.left) { btn.disabled = true; btn.textContent = 'Todo al máximo'; btn.title = ''; return; }
      const full = p.buy.length === p.left;
      btn.disabled = !p.buy.length;
      if (full || !p.buy.length) btn.innerHTML = `Maximizar · ${coin(p.total)}`;
      else btn.innerHTML = `Comprar ${p.buy.length} nivel${p.buy.length === 1 ? '' : 'es'} · ${coin(p.spend)}`;
      btn.title = full ? `Compra los ${p.left} niveles que faltan`
        : p.buy.length ? `Maximizar cuesta ${fmt(p.total)}. Te alcanza para los ${p.buy.length} niveles más baratos.`
          : `Maximizar cuesta ${fmt(p.total)} Pokémonedas`;
    };

    btn.addEventListener('click', async () => {
      btn.blur();
      const sv = ns().DB.save, dex = +sel.value;
      if (!sv || !dex) return;
      const p = plan(dex, sv.coins || 0);
      if (!p.buy.length) return;
      const mon = (ns().DEX_BY[dex] || {}).name || 'este Pokémon';
      const full = p.buy.length === p.left;
      const ok = await confirmBox('Maximizar mejoras',
        `Vas a gastar <b class="gold">${coin(p.spend)}</b> de tus ${coin(sv.coins)} en <b>${p.buy.length} nivel${p.buy.length === 1 ? '' : 'es'}</b> de mejora para <b>${NX.esc(mon)}</b>.` +
        (full ? '' : ` Dejarlo todo al máximo cuesta ${coin(p.total)}; con lo que tienes se compran primero los niveles más baratos.`),
        'Comprar');
      if (!ok) return;
      // Se recalcula con el guardado de este momento.
      const q = plan(+sel.value, (ns().DB.save || {}).coins || 0);
      if (+sel.value === dex && q.buy.length) run(dex, q.buy);
      sig = '';
      update();
    });

    sel.addEventListener('change', () => { sig = ''; update(); });
    new MutationObserver(update).observe(list, { childList: true });
    setInterval(() => { if (NX.shown('scr-upgrades')) update(); }, 700);
    update();
  }

  NX.feature({
    key: KEY,
    label: 'Maximizar mejoras',
    needs: (n) => n.Upgrades && Array.isArray(n.Upgrades.LIST) && typeof n.Upgrades.cost === 'function' &&
      n.DB && n.Audio && n.UI && !!$('upg-mon') && !!$('upg-list'),
    setup(n) {
      // Durante una compra en lote, un solo sonido y un solo aviso al final.
      const sfx = n.Audio.sfx;
      n.Audio.sfx = function (name) { if (quiet && name === 'buy') return; return sfx.apply(this, arguments); };
      const toast = n.UI.toast;
      n.UI.toast = function () { if (quiet) return; return toast.apply(this, arguments); };
      buildUi();
    },
  });

  NX.settings.section({
    key: KEY,
    tab: 'Menús',
    title: 'Maximizar mejoras',
    keywords: 'mejoras comprar todas pokémonedas costo',
    render(el) {
      el.appendChild(NX.ui.toggle('Activado', 'on:' + KEY, true));
      el.appendChild(NX.ui.note('Agrega un botón junto al selector de Pokémon en Mejoras. Muestra el costo total y pide confirmación antes de comprar.'));
    },
  });
})();
})();
