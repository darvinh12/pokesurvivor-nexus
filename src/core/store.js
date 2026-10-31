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
