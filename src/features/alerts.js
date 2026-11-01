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
      NX.every(250, () => {
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
      }, { when: 'run', key: KEY });
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
