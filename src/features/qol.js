// Calidad de vida en partida:
//  - Jugar otra vez: botón en el fin de partida y en el menú con el último
//    Pokémon y, si lo hubo, el último Modo Nexus (se vuelve a abrir su pestaña
//    y se pulsa su botón de jugar, así el modo arma una partida nueva).
//  - Pausa automática al cambiar de app o pestaña. El juego ya pausa solo en
//    visibilitychange (comprobado en b742e43); aquí queda un respaldo que solo
//    actúa si tras ocultarse la página la partida sigue corriendo.
//  - Elegir carta automáticamente (apagado por defecto): tras un retardo toma
//    la carta marcada "Mejor opción" (run-builds.js). Cualquier tecla o toque
//    lo cancela.
//  - Recordatorio de descanso tras N minutos o N partidas (apagado por defecto).
//  - Partida interrumpida: guardar y restaurar una partida en curso no es
//    viable de forma fiable. El estado vive en closures del juego sin forma de
//    leerlo ni de escribirlo: temporizadores del generador y de las mareas,
//    índice del próximo jefe, semilla y trozos del mundo, enemigos con su
//    comportamiento, proyectiles, campos de combate, cooldowns internos y el
//    reloj Game.st. Game.startRun reinicia todo eso y no acepta un estado
//    previo, así que una restauración parcial daría una partida distinta y
//    podría dañar el guardado o los logros. En su lugar se guarda un resumen
//    cada pocos segundos; si la pestaña se cierra a mitad de partida, al
//    volver se agrega al historial (Alt+R) como partida abandonada e
//    interrumpida.
(() => {
  const KEY = 'qol';
  const LIVE = 'qol:live', LAST = 'qol:last';
  const ns = () => NX.ns;
  const $ = (id) => document.getElementById(id);
  const opt = (k, d) => NX.store.get('qol:' + k, d);
  const on = () => NX.isOn(KEY);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ---------------------------------------------------------------- partida interrumpida
  // Se hace al cargar el archivo: telemetry.js lee su historial más tarde.
  try {
    const live = NX.store.get(LIVE, null);
    if (live && NX.enabled(KEY) && opt('resume', true) !== false) {
      if ((live.time || 0) >= 30 && Date.now() - (live.saved || 0) < 14 * 864e5) {
        const h = NX.store.get('tele:runs', []) || [];
        if (!h.some((r) => r && r.at === live.at)) {
          h.unshift({
            v: 1, at: live.at, mon: live.mon, dex: live.dex, shiny: !!live.shiny, coop: false,
            time: Math.round(live.time), level: live.level || 1, kills: live.kills || 0,
            dmg: Math.round(live.dmg || 0), dps: Math.round((live.dmg || 0) / Math.max(1, live.time)), taken: 0,
            outcome: 'quit', interrupted: true, mode: live.mode || '', killer: null, killerHow: null,
            moves: live.moves || [], series: { step: 1, dmg: [], hp: [] }, kpm: [],
          });
          if (h.length > 50) h.length = 50;
          NX.store.set('tele:runs', h);
        }
        NX.store.set('qol:interrupted', { at: live.at, mon: live.mon, time: live.time, level: live.level, saved: live.saved });
      }
    }
    NX.store.set(LIVE, null);
  } catch (err) { console.warn('[nexus] qol', err); }

  function liveSnap() {
    const p = NX.me(), N = ns();
    if (!p || !N || !N.Game || (N.Coop && N.Coop.active)) return;
    const c = NX.modes && NX.modes.ctx && NX.modes.ctx();
    if (c && c.sandbox) return; // el laboratorio no cuenta
    const t = N.Game.st && typeof N.Game.st.time === 'number' ? N.Game.st.time : 0;
    let moves = [];
    try { moves = (p.moves || []).slice(0, 5).map((m) => ({ name: (m.def && m.def.name) || m.name || m.id, dmg: Math.round(m.dealt || 0) })); } catch (_) { moves = []; }
    NX.store.set(LIVE, {
      at: runAt || Date.now(), saved: Date.now(),
      mon: (p.mon && p.mon.name) || '#' + p.dex, dex: p.dex, shiny: !!p.shiny,
      time: t, level: p.level || 1, kills: p.kills || 0, dmg: p.dmgDealt || 0, moves, mode: c ? c.label || c.key : '',
    });
  }
  let runAt = 0;

  // ---------------------------------------------------------------- jugar otra vez
  let lastCfg = null, launchTab = null, pendingMode = null;
  function wrapModes() {
    if (!NX.modes || NX.modes.__qolWrapped) return;
    const launch = NX.modes.launch;
    NX.modes.launch = function (cfg) {
      const chip = document.querySelector('#nexus-modes .nx-md-tabs .chip.on');
      pendingMode = { tab: chip ? chip.dataset.k : NX.store.get('modes:tab', ''), cfg };
      try { return launch.apply(this, arguments); } finally { setTimeout(() => { pendingMode = null; }, 1500); }
    };
    NX.modes.__qolWrapped = true;
  }
  function onStart(p) {
    runAt = Date.now();
    const N = ns();
    if (N.Coop && N.Coop.active) return;
    const c = NX.modes && NX.modes.ctx && NX.modes.ctx();
    let mode = null;
    if (c && pendingMode && pendingMode.cfg && c.key === pendingMode.cfg.key) {
      mode = { tab: pendingMode.tab, key: c.key, label: c.label || c.key };
      lastCfg = pendingMode.cfg;
      launchTab = pendingMode.tab;
    }
    pendingMode = null;
    NX.store.set(LAST, { dex: p.dex, shiny: !!p.shiny, mon: (p.mon && p.mon.name) || '', mode, at: Date.now() });
    liveSnap();
  }
  const lastRun = () => NX.store.get(LAST, null);
  const label = (L) => (L ? (L.mon || '#' + L.dex) + (L.mode ? ' · ' + L.mode.label : '') : '');

  function canStart() {
    const N = ns();
    return !!(N && N.Game && N.Game.state === 'ui' && N.DB && N.DB.save && !(N.Social && N.Social.room) && !(N.Coop && N.Coop.active));
  }
  // Menú despejado: solo el menú principal a la vista.
  const menuClear = () => NX.shown('scr-menu') && ![...document.querySelectorAll('.scr:not(.hidden)')].some((e) => e.id !== 'scr-menu');

  async function replay() {
    const L = lastRun();
    if (!L) return;
    const N = ns();
    if (N.Game.state === 'over' || NX.shown('scr-over')) {
      const back = $('btn-again');
      if (back) back.click();
      for (let i = 0; i < 60 && !(canStart() && menuClear()); i++) await sleep(100);
      if (!(canStart() && menuClear())) { NX.toast('Cierra los avisos y usa "Jugar otra vez" en el menú'); return; }
    }
    if (!canStart()) { NX.toast('Vuelve al menú principal para jugar otra vez'); return; }
    if (L.mode && NX.modes && NX.isOn('modes')) {
      // Se abre la pestaña del modo y se pulsa su botón: el modo arma su partida.
      try {
        NX.modes.open(L.mode.tab);
        const chip = document.querySelector('#nexus-modes .nx-md-tabs .chip.on');
        const go = document.querySelector('#nexus-modes .nx-md-foot .btn.gold:last-child');
        if (chip && chip.dataset.k === L.mode.tab && go) { go.click(); return; }
        if (NX.modes.close) NX.modes.close();
      } catch (err) { console.warn('[nexus] qol', err); }
      if (lastCfg && L.mode.key === lastCfg.key && launchTab === L.mode.tab) { NX.modes.launch(Object.assign({}, lastCfg)); return; }
      NX.toast('No se pudo repetir el modo; abre Modos Nexus');
      return;
    }
    const s = N.DB.save;
    if (s.owned && s.owned[L.dex]) {
      s.partner = L.dex;
      s.partnerShiny = !!(L.shiny && s.shiny && s.shiny[L.dex]);
    }
    try { if (N.Audio && N.Audio.sfx) N.Audio.sfx('confirm'); } catch (_) { /* sin sonido */ }
    if (N.Flow && typeof N.Flow.play === 'function') N.Flow.play(); else N.Game.startRun();
  }

  NX.css(`#nx-again{margin-top:8px;width:100%}
#nx-again small,#nx-replay small{display:block;font-size:12px;opacity:.85}
#nx-ap{margin:10px auto 0;max-width:420px;font-size:13px;color:var(--muted,#b9cbf0);text-align:center;text-shadow:none}
#nx-ap b{color:var(--gold,#ffd23f)}
#nx-ap i{display:block;height:4px;margin-top:5px;border-radius:2px;background:rgba(255,255,255,.18);overflow:hidden}
#nx-ap i::after{content:'';display:block;height:100%;width:var(--p,0%);background:#7dff9a}
#nx-break .box{max-width:420px;text-align:center}
#nx-break p{margin:6px 0}`);

  function ensureButtons() {
    const L = lastRun();
    const want = on() && opt('replay', true) !== false && !!L;
    // Fin de partida.
    let a = $('nx-again');
    const back = $('btn-again');
    if (!want || !back) { if (a) a.remove(); } else {
      if (!a) {
        a = document.createElement('button');
        a.id = 'nx-again';
        a.type = 'button';
        a.className = 'btn';
        a.dataset.sfx = 'none';
        a.addEventListener('click', (e) => { e.stopPropagation(); a.blur(); replay(); });
        back.after(a);
      }
      const t = 'Jugar otra vez<small>' + NX.esc(label(L)) + '</small>';
      if (a.innerHTML !== t) a.innerHTML = t;
      const coop = ns().Coop && ns().Coop.active;
      a.classList.toggle('nx-off', !!coop);
    }
    // Menú principal, debajo de Jugar (y de Modos Nexus si está).
    let m = $('nx-replay');
    const play = document.querySelector('#scr-menu [data-go="play"]');
    if (!want || !play) { if (m) m.remove(); return; }
    if (!m) {
      m = document.createElement('button');
      m.id = 'nx-replay';
      m.type = 'button';
      m.className = 'menu-item';
      m.dataset.sfx = 'none';
      m.addEventListener('click', (e) => { e.stopPropagation(); m.blur(); replay(); });
    }
    const anchor = $('nexus-modes-btn') || play;
    if (anchor.nextElementSibling !== m) anchor.after(m);
    const t = '<span>Jugar otra vez</span><small>' + NX.esc(label(L)) + '</small>';
    if (m.innerHTML !== t) m.innerHTML = t;
  }

  // ---------------------------------------------------------------- pausa automática
  let gamePauses = null; // true si el juego pausó solo la última vez
  function onHidden() {
    if (!document.hidden) return;
    const N = ns();
    if (!N || !N.Game || N.Game.state !== 'playing') return;
    liveSnap();
    if (!on() || opt('autopause', true) === false || (N.Coop && N.Coop.active)) return;
    setTimeout(() => {
      if (N.Game.state === 'paused') { gamePauses = true; return; }
      if (N.Game.state === 'playing' && document.hidden && typeof N.Game.togglePause === 'function') {
        gamePauses = false;
        try { N.Game.togglePause(); } catch (_) { /* nada */ }
      }
    }, 60);
  }

  // ---------------------------------------------------------------- carta automática
  let ap = null; // { sig, t0, card, cancelled }
  function apCancel() { if (ap && !ap.cancelled) { ap.cancelled = true; drawAp(); } }
  function drawAp() {
    let el = $('nx-ap');
    const box = document.querySelector('#scr-levelup .box');
    if (!ap || ap.cancelled || !box) { if (el) el.remove(); return; }
    if (!el) { el = document.createElement('div'); el.id = 'nx-ap'; box.appendChild(el); }
    const d = ap.delay, left = Math.max(0, d - (performance.now() - ap.t0));
    const nm = (ap.card.querySelector('.nm') || ap.card).firstChild;
    const name = (nm && nm.textContent ? nm.textContent : '').trim();
    el.innerHTML = `Elección automática: <b>${NX.esc(name || 'Mejor opción')}</b> en ${(left / 1000).toFixed(1).replace('.', ',')} s · pulsa una tecla o toca para cancelar<i style="--p:${Math.round((1 - left / d) * 100)}%"></i>`;
  }
  function apTick() {
    const want = on() && !!opt('autopick', false) && NX.shown('scr-levelup');
    if (!want) { if (ap) { ap = null; drawAp(); } return; }
    const cards = $('cards');
    const best = cards && cards.querySelector(':scope > .card.nx-best');
    const sig = cards ? [...cards.children].map((c) => c.textContent.length).join(',') + '|' + (($('lvl-num') || {}).textContent || '') : '';
    if (!ap || ap.sig !== sig) {
      if (ap && ap.cancelled && ap.sig !== sig && ap.keepCancel) { ap.sig = sig; return; }
      ap = best ? { sig, t0: performance.now(), card: best, cancelled: false, delay: NX.clamp(+opt('autopickDelay', 1.5) || 1.5, 0.8, 6) * 1000 } : null;
      drawAp();
      return;
    }
    if (ap.cancelled || ap.done) return;
    if (best && best !== ap.card) ap.card = best;
    drawAp();
    if (performance.now() - ap.t0 >= ap.delay) {
      ap.done = true;
      const card = ap.card;
      const el = $('nx-ap');
      if (el) el.remove();
      try { card.click(); } catch (_) { /* nada */ }
      // Si la pantalla no cambió (el juego ignora clics muy tempranos), un reintento.
      setTimeout(() => { if (NX.shown('scr-levelup') && card.isConnected && ap && ap.card === card) { try { card.click(); } catch (_) { /* nada */ } } }, 450);
    }
  }

  // ---------------------------------------------------------------- descanso
  const brk = NX.store.get('qol:breakState', null) || { sec: 0, runs: 0, last: Date.now() };
  let brkSaveT = 0;
  function breakTick() {
    if (!on() || !opt('break', false)) return;
    const now = Date.now();
    // Una pausa larga cuenta como descanso.
    if (now - brk.last > 30 * 60000) { brk.sec = 0; brk.runs = 0; }
    brk.last = now;
    const N = ns();
    if (N && N.Game && N.Game.state === 'playing') brk.sec++;
    if (now - brkSaveT > 15000) { brkSaveT = now; NX.store.set('qol:breakState', brk); }
    const due = opt('breakMode', 'min') === 'runs' ? brk.runs >= Math.max(1, +opt('breakRuns', 5) || 5) : brk.sec >= Math.max(5, +opt('breakMin', 60) || 60) * 60;
    // Solo en momentos tranquilos: fin de partida o menú.
    if (due && !$('nx-break') && (NX.shown('scr-over') || (N && N.Game && N.Game.state === 'ui' && NX.shown('scr-menu')))) showBreak();
  }
  function showBreak() {
    const min = Math.round(brk.sec / 60);
    const el = document.createElement('section');
    el.id = 'nx-break';
    el.className = 'scr dim';
    el.style.zIndex = 95;
    el.innerHTML = `<div class="box"><h3>Un descanso</h3><p>Llevas ${min} min de juego y ${brk.runs} partida${brk.runs === 1 ? '' : 's'} en esta sesión.</p>
      <p class="sub">Buen momento para descansar la vista, tomar agua y estirarte.</p>
      <div class="row" style="justify-content:center"><button class="btn gold" type="button">Entendido</button></div></div>`;
    for (const ev of ['pointerdown', 'mousedown', 'touchstart', 'click', 'wheel']) el.addEventListener(ev, (e) => e.stopPropagation());
    el.querySelector('button').addEventListener('click', () => {
      brk.sec = 0; brk.runs = 0; brk.last = Date.now();
      NX.store.set('qol:breakState', brk);
      el.remove();
    });
    document.body.appendChild(el);
  }

  NX.feature({
    key: KEY,
    label: 'Calidad de vida en partida',
    needs: (n) => n.Game && typeof n.Game.startRun === 'function' && typeof n.Game.togglePause === 'function' && n.DB && n.Flow && !!$('btn-again'),
    setup() {
      wrapModes();
      NX.runs.on('start', (p) => { wrapModes(); onStart(p); });
      NX.runs.on('end', () => {
        NX.store.set(LIVE, null);
        if (on() && opt('break', false)) { brk.runs++; NX.store.set('qol:breakState', brk); }
      });
      document.addEventListener('visibilitychange', onHidden);
      addEventListener('pagehide', () => { if (NX.inRun()) liveSnap(); });
      NX.every(5000, () => { if (NX.inRun()) { try { liveSnap(); } catch (err) { NX.trip(KEY, err); } } }, { when: 'run', key: KEY, name: 'guardado en vivo' });
      NX.every(500, () => { try { ensureButtons(); } catch (err) { NX.trip(KEY, err); } }, { when: 'menu', key: KEY, name: 'botones' });
      NX.every(100, () => { try { apTick(); } catch (err) { NX.trip(KEY, err); } }, { when: 'run', key: KEY, name: 'carta automática', leave: true });
      NX.every(1000, () => { try { breakTick(); } catch (err) { NX.trip(KEY, err); } }, { key: KEY, name: 'descanso' });
      // Cancelar la carta automática: cualquier tecla o toque.
      addEventListener('keydown', () => { if (ap) { ap.keepCancel = true; apCancel(); } }, true);
      addEventListener('pointerdown', () => { if (ap) { ap.keepCancel = true; apCancel(); } }, true);
    },
  });

  NX.settings.section({
    key: KEY,
    tab: 'Partida',
    title: 'Calidad de vida en partida',
    keywords: 'jugar otra vez repetir rápido pausa automática carta automática mejor opción descanso recordatorio interrumpida reanudar',
    render(el) {
      el.appendChild(NX.ui.toggle('Activado', 'on:' + KEY, true));
      el.appendChild(NX.ui.toggle('Botón "Jugar otra vez" (fin de partida y menú)', 'qol:replay', true));
      el.appendChild(NX.ui.toggle('Pausa automática al cambiar de app o pestaña', 'qol:autopause', true));
      el.appendChild(NX.ui.note(gamePauses === false
        ? 'La última vez el juego no pausó solo y Nexus lo hizo por él.'
        : 'El juego ya pausa solo al ocultarse la pestaña; Nexus solo actúa si la partida sigue corriendo.'));
      el.appendChild(NX.ui.toggle('Elegir carta automáticamente ("Mejor opción")', 'qol:autopick', false));
      el.appendChild(NX.ui.range('Retardo antes de elegir', 'qol:autopickDelay', 0.8, 6, 0.1, 1.5, (v) => v.toFixed(1).replace('.', ',') + ' s'));
      el.appendChild(NX.ui.note('Necesita "Mejor opción en las cartas". Cualquier tecla o toque cancela la elección de esa subida.'));
      el.appendChild(NX.ui.toggle('Recordatorio de descanso', 'qol:break', false));
      el.appendChild(NX.ui.select('Avisar tras', 'qol:breakMode', [['min', 'Minutos de juego'], ['runs', 'Partidas']], 'min'));
      el.appendChild(NX.ui.range('Minutos', 'qol:breakMin', 15, 180, 5, 60, (v) => v + ' min'));
      el.appendChild(NX.ui.range('Partidas', 'qol:breakRuns', 1, 20, 1, 5, (v) => String(v)));
      el.appendChild(NX.ui.note('El aviso sale al terminar una partida o en el menú, nunca en mitad del combate. Treinta minutos sin jugar reinician la cuenta.'));
      el.appendChild(NX.ui.toggle('Guardar en el historial las partidas interrumpidas', 'qol:resume', true));
      const it = NX.store.get('qol:interrupted', null);
      el.appendChild(NX.ui.note('Reanudar una partida a medias no es viable: el estado del combate vive dentro del juego sin forma de guardarlo ni restaurarlo. Si cierras la pestaña en partida, al volver queda un resumen en el historial (Alt+R).' +
        (it ? ` Última interrumpida: ${it.mon}, ${NX.fmtTime(it.time)}, Nv. ${it.level}.` : '')));
    },
  });
})();
