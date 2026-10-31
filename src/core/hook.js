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
