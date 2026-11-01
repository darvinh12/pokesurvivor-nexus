// Ajustes persistentes en localStorage, con el prefijo nexus:. Los valores se
// cachean en memoria porque varios módulos consultan ajustes en cada cuadro.
//
// Cada escritura anota además la hora (ms) en que cambió esa clave, para que
// la sincronización entre dispositivos (features/sync.js) pueda fusionar por
// clave con "gana el más reciente". Las horas viven en memoria y se guardan
// agrupadas en localStorage['nexus-meta'] (fuera del prefijo, así el respaldo
// y el restablecer no las tocan). Una clave borrada deja su hora como marca de
// borrado para que el borrado también viaje a la nube.
const PFX = 'nexus:', META = 'nexus-meta';
const storeCache = new Map(); // clave -> valor ya interpretado (null si no existe)
const rawCache = new Map();   // clave -> texto JSON tal como está guardado
const storeMeta = new Map();  // clave -> hora del último cambio (ms)
const storeSubs = [];
let metaT = 0;

try {
  const m = JSON.parse(localStorage.getItem(META) || '{}');
  if (m && typeof m === 'object') for (const k of Object.keys(m)) if (+m[k] > 0) storeMeta.set(k, +m[k]);
} catch (_) { /* sin horas previas */ }

// Guarda las horas mezclando con lo que haya escrito otra pestaña.
function saveMeta() {
  metaT = 0;
  try {
    const cur = JSON.parse(localStorage.getItem(META) || '{}') || {};
    for (const [k, t] of storeMeta) if (!(+cur[k] >= t)) cur[k] = t;
    for (const k of Object.keys(cur)) if (+cur[k] > (storeMeta.get(k) || 0)) storeMeta.set(k, +cur[k]);
    localStorage.setItem(META, JSON.stringify(cur));
  } catch (_) { /* almacenamiento lleno o bloqueado */ }
}
const touchMeta = (key, t) => {
  storeMeta.set(key, t);
  if (!metaT) metaT = setTimeout(saveMeta, 1500);
};
const emitChange = (key, value, src) => {
  for (const fn of storeSubs) { try { fn(key, value, src); } catch (err) { console.warn('[nexus] store', err); } }
};

NX.store = {
  get(key, def) {
    if (storeCache.has(key)) { const v = storeCache.get(key); return v == null ? def : v; }
    let v = null, raw = null;
    try {
      raw = localStorage.getItem(PFX + key);
      v = raw == null ? null : JSON.parse(raw);
    } catch (_) { v = null; }
    storeCache.set(key, v);
    if (raw != null) rawCache.set(key, raw);
    return v == null ? def : v;
  },
  set(key, value) {
    if (value === undefined) value = null;
    const raw = JSON.stringify(value);
    if (!rawCache.has(key) && !storeCache.has(key)) NX.store.get(key);
    storeCache.set(key, value);
    // Mismo contenido: no se reescribe ni cuenta como cambio.
    if (rawCache.get(key) === raw) return;
    rawCache.set(key, raw);
    try { localStorage.setItem(PFX + key, raw); } catch (_) { /* almacenamiento lleno o bloqueado */ }
    touchMeta(key, Date.now());
    emitChange(key, value, 'local');
  },
  // Borra la clave (vuelve a su valor por defecto) y deja la marca de borrado.
  remove(key) {
    const had = localStorage.getItem(PFX + key) != null;
    storeCache.set(key, null);
    rawCache.delete(key);
    try { localStorage.removeItem(PFX + key); } catch (_) { /* bloqueado */ }
    if (!had) return;
    touchMeta(key, Date.now());
    emitChange(key, null, 'local');
  },
  // Para el respaldo: olvida la caché tras importar datos externos.
  reset() { storeCache.clear(); rawCache.clear(); },
  // Claves de Nexus guardadas en este dispositivo. Con deleted, suma las que
  // solo quedan como marca de borrado.
  keys(deleted) {
    const out = new Set();
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(PFX)) out.add(k.slice(PFX.length));
      }
    } catch (_) { /* bloqueado */ }
    if (deleted) for (const k of storeMeta.keys()) out.add(k);
    return [...out];
  },
  // Hora (ms) del último cambio local conocido; 0 si es anterior a este registro.
  meta(key) { return storeMeta.get(key) || 0; },
  // Aplica un valor que llegó de otro dispositivo con su hora original, sin
  // marcarlo como cambio local. null borra la clave.
  applyRemote(key, value, t) {
    if (value === undefined) value = null;
    storeCache.set(key, value);
    if (value === null) {
      rawCache.delete(key);
      try { localStorage.removeItem(PFX + key); } catch (_) { /* bloqueado */ }
    } else {
      const raw = JSON.stringify(value);
      rawCache.set(key, raw);
      try { localStorage.setItem(PFX + key, raw); } catch (_) { /* almacenamiento lleno o bloqueado */ }
    }
    touchMeta(key, +t || 0);
    emitChange(key, value, 'remote');
  },
  // Avisos de cambio: fn(clave, valor, origen) con origen 'local', 'remote' o 'tab'.
  on(fn) {
    storeSubs.push(fn);
    return () => { const i = storeSubs.indexOf(fn); if (i >= 0) storeSubs.splice(i, 1); };
  },
  flushMeta() { if (metaT) { clearTimeout(metaT); saveMeta(); } },
};
// Otra pestaña del juego cambió un ajuste.
addEventListener('storage', (e) => {
  if (!e.key) return;
  if (e.key === META) {
    try { const m = JSON.parse(e.newValue || '{}') || {}; for (const k of Object.keys(m)) if (+m[k] > (storeMeta.get(k) || 0)) storeMeta.set(k, +m[k]); } catch (_) { /* nada */ }
    return;
  }
  if (!e.key.startsWith(PFX)) return;
  const k = e.key.slice(PFX.length);
  storeCache.delete(k);
  rawCache.delete(k);
  emitChange(k, undefined, 'tab');
});
addEventListener('pagehide', () => NX.store.flushMeta());
