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
