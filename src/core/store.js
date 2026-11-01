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
