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
