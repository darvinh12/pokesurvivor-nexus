/*! PokeSurvivor Nexus v0.2.0 */
(() => {
'use strict';
if (window.__nexus) return;
// El sitio público bloquea las extensiones a propósito. Nexus solo corre en el
// laboratorio local, así que aquí se queda inactivo.
if (location.hostname === 'pokesurvivor.com' || location.hostname.endsWith('.pokesurvivor.com')) { console.info('[nexus] inactivo en el sitio público; usa el laboratorio local'); return; }
const NX = { version: '0.2.0' };
window.__nexus = {
  version: '0.2.0',
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
  background:#152a5c;color:#ffd23f;border:2px solid #f4f8ff;outline:2px solid #0b1838;font:13px var(--font,'Pixelify',system-ui,sans-serif)}`);

let panel = null, fab = null;
const STATUS_TXT = { ok: 'activo', pending: 'esperando', missing: 'falta', broken: 'roto' };

// Pestañas del panel, en orden. Una sección sin tab cae en "General".
const TABS = ['Cámara y mapa', 'HUD', 'Partida', 'Datos', 'Menús', 'Rendimiento', 'General'];
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
          if (!opt.xpNum || clockShown || !pl || !(pl.xpNext > 0)) return;
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
    const arr = H && H.all && H.all();
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
