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

// Medición de costo. Cada fuente (tareas de NX.every, capas del HUD, funciones
// del juego envueltas) suma milisegundos por clave; cada segundo se cierra
// una ventana y se guardan los últimos 10 segundos.
NX.perf = (() => {
  const rows = new Map(); // id -> { id, key, kind, name, acc, n, max, hist: [], peak }
  let winT = performance.now(), frames = 0, fps = 0;
  const row = (key, kind, name) => {
    const id = kind + '|' + key + '|' + (name || '');
    let r = rows.get(id);
    if (!r) { r = { id, key, kind, name: name || '', acc: 0, n: 0, max: 0, hist: [], calls: 0 }; rows.set(id, r); }
    return r;
  };
  const roll = (now) => {
    const dt = now - winT;
    if (dt < 1000) return;
    // Una ventana mucho más larga (pestaña oculta, depurador) no cuenta.
    const scale = dt > 3000 ? 0 : 1000 / dt;
    for (const r of rows.values()) {
      if (scale) { r.hist.push(r.acc * scale); if (r.hist.length > 10) r.hist.shift(); r.calls = r.n * scale; }
      r.acc = 0; r.n = 0;
    }
    fps = scale ? Math.round(frames * scale) : fps;
    frames = 0;
    winT = now;
  };
  return {
    row,
    add(key, kind, ms, name) { const r = row(key, kind, name); r.acc += ms; r.n++; if (ms > r.max) r.max = ms; },
    frame() { frames++; },
    roll,
    fps: () => fps,
    // [{ key, kind, name, avg, peak, max, calls }] en ms por segundo.
    stats() {
      return [...rows.values()].map((r) => {
        const h = r.hist;
        const avg = h.length ? h.reduce((s, v) => s + v, 0) / h.length : 0;
        return { key: r.key, kind: r.kind, name: r.name, avg, peak: h.length ? Math.max(...h) : 0, max: r.max, calls: r.calls };
      });
    },
    reset() { for (const r of rows.values()) { r.hist.length = 0; r.max = 0; r.acc = 0; r.n = 0; } },
  };
})();

// Planificador común. Todas las tareas periódicas del mod comparten un solo
// bucle de requestAnimationFrame, que se detiene con la pestaña oculta.
//   NX.every(ms, fn, { when, key, name, leave })
//   ms: milisegundos entre ejecuciones, o 'frame' para cada cuadro.
//   when: 'run' (solo en partida), 'menu' (fuera de partida) o 'always'.
//   key: módulo dueño; sus errores pasan por NX.trip(key) y su costo se mide.
//   leave: función (o true para repetir fn) que corre una vez al salir del contexto.
// Al entrar en su contexto la tarea corre en el siguiente cuadro. Devuelve { stop() }.
NX.every = (() => {
  const tasks = [];
  let rafOn = false, lastRun = null;
  const ctxOn = { always: () => true, run: () => lastRun, menu: () => !lastRun };
  const exec = (t, fn, now) => {
    const t0 = performance.now();
    try { fn(now); } catch (err) {
      if (t.key) { if (NX.trip) NX.trip(t.key, err); } else console.warn('[nexus] tarea', err);
    }
    NX.perf.add(t.key || 'nexus', 'task', performance.now() - t0, t.name);
  };
  const master = (now) => {
    rafOn = false;
    if (document.hidden) return;
    schedule();
    NX.perf.frame();
    lastRun = NX.inRun();
    for (let i = 0; i < tasks.length; i++) {
      const t = tasks[i];
      if (t.dead) continue;
      const on = ctxOn[t.when]();
      if (!on) {
        if (t.active) { t.active = false; if (t.leave) exec(t, t.leave === true ? t.fn : t.leave, now); }
        continue;
      }
      if (!t.active) { t.active = true; t.due = 0; }
      if (t.frame || now >= t.due) {
        // Sin acumular atrasos: la siguiente vez cuenta desde ahora.
        t.due = now + t.ms - 4;
        exec(t, t.fn, now);
      }
    }
    if (tasks.some((t) => t.dead)) for (let i = tasks.length - 1; i >= 0; i--) if (tasks[i].dead) tasks.splice(i, 1);
    NX.perf.roll(now);
  };
  // Se pide el cuadro cada vez a window.requestAnimationFrame, así respeta el
  // límite de FPS del módulo de nitidez.
  const schedule = () => { if (!rafOn && !document.hidden) { rafOn = true; window.requestAnimationFrame(master); } };
  document.addEventListener('visibilitychange', schedule);
  const every = (ms, fn, opts = {}) => {
    const frame = ms === 'frame' || !(+ms > 0);
    const when = ctxOn[opts.when] ? opts.when : 'always';
    // Como setInterval: la primera ejecución llega tras ms, salvo al entrar en contexto.
    const t = { ms: frame ? 0 : +ms, fn, when, key: opts.key || '', name: opts.name || '', leave: opts.leave || null,
      frame, active: true, dead: false, due: performance.now() + (frame ? 0 : +ms) };
    if (when !== 'always') t.active = ctxOn[when]();
    tasks.push(t);
    schedule();
    return { stop() { t.dead = true; } };
  };
  every.list = () => tasks.filter((t) => !t.dead).map((t) => ({ key: t.key, name: t.name, ms: t.ms, when: t.when, frame: t.frame, active: t.active }));
  return every;
})();

// Fuera de partida, ¿una ventana (Pokédex, tienda, panel de Nexus...) tapa el
// fondo animado del menú? Lo usan la nitidez (FPS del fondo) y el aspecto del mapa.
NX.menuCovered = (() => {
  let v = false;
  NX.every(250, () => {
    const st = NX.ns && NX.ns.Game && NX.ns.Game.state;
    v = st === 'ui' && !!document.querySelector('.scr.dim:not(.hidden),#nexus-panel:not(.hidden)');
  }, { when: 'menu', name: 'fondo del menú', leave: () => { v = false; } });
  return () => v;
})();

// Ciclo de partidas: 'start' (player) cuando aparece un jugador nuevo en
// partida y 'end' (player, state) cuando la partida termina o se abandona.
NX.runs = (() => {
  const subs = { start: [], end: [] };
  let cur = null;
  const emit = (ev, ...a) => { for (const fn of subs[ev]) { try { fn(...a); } catch (err) { console.warn('[nexus] runs.' + ev, err); } } };
  NX.every(250, () => {
    const ns = NX.ns;
    if (!ns || !ns.Game) return;
    const p = NX.me(), st = ns.Game.state;
    const live = !!p && st !== 'ui' && st !== 'over';
    if (live && p !== cur) { if (cur) emit('end', cur, 'replaced'); cur = p; emit('start', p); }
    else if (cur && !live) { const was = cur; cur = null; emit('end', was, st); }
  }, { name: 'ciclo de partidas' });
  return { on(ev, fn) { subs[ev].push(fn); }, current: () => cur };
})();
