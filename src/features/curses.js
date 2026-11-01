// Bloque de progresión (cartas de partida, maldiciones, tienda, personajes
// secretos, jardín y límite superado). Este archivo es el primero del bloque
// en orden alfabético, así que aquí vive la infraestructura que comparten:
// NX.prog con el centro "Progreso Nexus" del menú, la ventana que pausa la
// partida, la píldora del HUD y el aviso en la pantalla final. No es un
// módulo con interruptor; cada pieza del bloque tiene el suyo.
//
// Dónde se aplica el bloque: partidas normales, Modificadores e Infinito.
// Nada en el laboratorio (sandbox), en Boss Rush (tiene su propio reparto de
// cartas) ni en el desafío diario (tiene que ser igual para todos los
// intentos del día), y nunca en cooperativo. El límite superado es la
// excepción: solo cambia cartas que ya no ofrecían nada y vale en todo modo
// en solitario.
(() => {
  if (NX.prog) return;
  const P = (NX.prog = {});
  const LIVE = new Set(['playing', 'held', 'levelup', 'choice', 'paused']);

  // ---------------------------------------------------------------- reglas comunes
  P.modeCtx = () => (NX.modes && NX.isOn('modes') && typeof NX.modes.ctx === 'function' ? NX.modes.ctx() : null);
  P.modeOk = () => { const c = P.modeCtx(); return !c || !(c.sandbox || c.key === 'rush' || c.key === 'daily'); };
  P.solo = () => { const ns = NX.ns; return !!ns && !!ns.Game && !(ns.Coop && ns.Coop.active); };
  P.runOk = () => P.solo() && P.modeOk();
  P.time = () => { const G = NX.ns && NX.ns.Game; return (G && G.st && typeof G.st.time === 'number' && G.st.time) || 0; };
  P.live = () => { const G = NX.ns && NX.ns.Game; return !!G && !!G.player && LIVE.has(G.state); };
  P.pct = (v) => Math.round(v * 100) + ' %';
  P.x = (v) => 'x' + (+v).toFixed(2).replace('.', ',');
  P.icon = (name, size = 32) => { try { return NX.ns.Icons.html(name, size); } catch (_) { return ''; } };
  P.pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  // Elige n elementos distintos con peso w(x).
  P.pickW = (arr, n, w) => {
    const pool = arr.slice(), out = [];
    while (out.length < n && pool.length) {
      const tot = pool.reduce((s, x) => s + Math.max(0, w(x)), 0);
      let r = Math.random() * tot, i = 0;
      for (; i < pool.length - 1; i++) { r -= Math.max(0, w(pool[i])); if (r <= 0) break; }
      out.push(pool.splice(i, 1)[0]);
    }
    return out;
  };
  P.say = (txt, t = 2.6) => { try { NX.ns.Spawner.say(txt, t, true); } catch (_) { NX.toast(txt); } };

  // Bus de eventos entre piezas del bloque (por ejemplo, el jardín avisa a los retos).
  const subs = {};
  P.on = (ev, fn) => { (subs[ev] = subs[ev] || []).push(fn); };
  P.emit = (ev, ...a) => { for (const fn of subs[ev] || []) { try { fn(...a); } catch (err) { console.warn('[nexus] prog.' + ev, err); } } };

  // ---------------------------------------------------------------- estilos
  NX.css(`#nexus-prog,#nexus-hold{z-index:9995}
#nexus-prog .nx-pg-box{width:min(680px,100%);display:flex;flex-direction:column;gap:6px;max-height:calc(100vh - 70px);max-height:calc(100dvh - 70px);overflow:auto;overscroll-behavior:contain}
#nexus-prog .nx-pg-head{display:flex;justify-content:space-between;align-items:center;gap:10px}
#nexus-prog .nx-pg-tabs{display:flex;flex-wrap:wrap;gap:6px;margin:2px 0 6px}
#nexus-prog .nx-pg-body{min-height:200px}
.nx-pg-desc{color:var(--muted,#b9cbf0);font-size:14px;margin:2px 0 8px;text-shadow:none}
#nexus-prog .nx-row,#nexus-hold .nx-row{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:3px 0;font-size:15px;cursor:pointer}
#nexus-prog select{font:inherit;font-size:14px;background:#0b1838;color:#fff;border:1px solid #5b83d6;border-radius:6px;padding:3px 6px;max-width:62%;text-shadow:none}
#nexus-prog .nx-rng{display:flex;align-items:center;gap:8px}#nexus-prog .nx-rng b{min-width:48px;text-align:right;color:var(--gold,#ffd23f)}
#nexus-prog input[type=checkbox]{width:18px;height:18px;accent-color:#ffd23f}
#nexus-prog .nx-note,#nexus-hold .nx-note{margin:4px 0;font-size:13px;color:var(--muted,#b9cbf0);text-shadow:none}
#nexus-prog .nx-btn{font:inherit;font-size:13px;background:#0b1838;color:#fff;border:2px solid #f4f8ff;border-radius:6px;cursor:pointer;padding:3px 10px;margin:4px 6px 4px 0}
.nx-pg-foot{display:flex;justify-content:flex-end;gap:10px;margin-top:10px;flex-wrap:wrap}
.nx-pg-list{display:flex;flex-direction:column;gap:8px}
.nx-pg-item{display:flex;align-items:center;gap:10px;background:rgba(0,0,0,.22);border:2px solid rgba(244,248,255,.14);border-radius:10px;padding:6px 10px}
.nx-pg-item .ico{flex:0 0 46px;height:46px;border-radius:10px;display:grid;place-items:center;background:rgba(255,255,255,.06)}
.nx-pg-item .txt{flex:1;min-width:0}.nx-pg-item .nm{font-weight:700;font-size:16px;display:flex;gap:6px;align-items:center;flex-wrap:wrap}
.nx-pg-item .ds{color:var(--muted,#b9cbf0);font-size:13px}
.nx-pg-bar{height:7px;border-radius:4px;background:rgba(0,0,0,.4);overflow:hidden;margin-top:4px}.nx-pg-bar i{display:block;height:100%;background:linear-gradient(90deg,#5fe08a,#ffd23f)}
#nexus-prog-btn small{white-space:normal}
#nexus-hold .nx-hd-box{width:min(600px,100%);max-height:calc(100vh - 60px);max-height:calc(100dvh - 60px);overflow:auto;overscroll-behavior:contain}
#nexus-hold .cards{margin:0 auto}
#nexus-hold .card{cursor:pointer;border-width:2px;border-style:solid}
#nexus-hold .card.nx-pg-dis{opacity:.45;filter:saturate(.5);cursor:not-allowed}
#nexus-hold .card.nx-pg-dis:hover{transform:none}
#nexus-hold .nx-hd-row{display:flex;justify-content:center;gap:10px;flex-wrap:wrap;margin-top:12px}
#nexus-hold .nx-hd-coins{display:inline-flex;align-items:center;gap:6px;color:var(--gold,#ffd23f);font-weight:700}
@media (max-height:520px){
#nexus-prog .box{padding:8px 12px}
#nexus-prog .nx-pg-tabs{flex:none;flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none;margin:0 0 4px;padding-bottom:2px}
#nexus-prog .nx-pg-tabs::-webkit-scrollbar{display:none}
#nexus-prog .nx-pg-tabs>*{flex:none}
#nexus-prog .nx-pg-foot{position:sticky;bottom:-8px;z-index:2;margin:8px -12px -8px;padding:8px 12px;background:linear-gradient(rgba(26,49,112,.75),var(--box2,#1a3170) 40%)}}
@media (pointer:coarse){#nexus-prog .nx-pg-tabs .chip,#nexus-prog .btn,#nexus-prog select{min-height:44px}#nexus-prog input[type=checkbox]{width:24px;height:24px}#nexus-prog .nx-row{min-height:44px}}
#nexus-prog-pill{position:fixed;left:50%;top:84px;transform:translateX(-50%);z-index:9990;pointer-events:none;padding:2px 10px;border-radius:12px;
  background:rgba(12,20,44,.8);color:#fff;border:2px solid #c0607a;font:12px/1.3 var(--font,'Pixelify',system-ui,sans-serif);white-space:nowrap;max-width:92vw;overflow:hidden;text-overflow:ellipsis}
#nexus-prog-pill.hidden{display:none}
#over-stats .nx-pg-over{grid-column:1/-1;text-align:center;color:#ffc2d1;font-size:13px;line-height:1.35}
#over-stats .nx-pg-over b{font-size:inherit;color:#ffe27a}
@media (pointer:coarse),(max-width:700px),(max-height:500px){
#nexus-prog .nx-row{min-height:42px}
#nexus-prog input[type=checkbox]{width:24px;height:24px}
#nexus-prog input[type=range]{width:min(42vw,200px);min-height:28px}
#nexus-prog .nx-btn,#nexus-prog .btn,#nexus-hold .btn{min-height:40px}
#nexus-hold .card{padding:8px 10px}
#nexus-prog-pill{font-size:11px;padding:1px 8px}}`);

  // ---------------------------------------------------------------- centro "Progreso Nexus"
  const tabs = [];
  let hub = null, curTab = NX.store.get('prog:tab', '');
  P.tab = (def) => { tabs.push(def); tabs.sort((a, b) => (a.order || 0) - (b.order || 0)); };
  const visibleTabs = () => tabs.filter((t) => NX.isOn(t.key));
  P.inMenu = () => { const ns = NX.ns; return !!ns && !!ns.Game && ns.Game.state === 'ui'; };
  function renderHub() {
    const box = hub.querySelector('.nx-pg-box');
    const list = visibleTabs();
    if (!list.some((t) => t.key === curTab)) curTab = list.length ? list[0].key : '';
    box.innerHTML = `<div class="nx-pg-head"><h2>Progreso Nexus</h2><button type="button" class="btn small ghost" data-x>Cerrar</button></div>
      <div class="nx-pg-tabs">${list.map((t) => `<button type="button" class="chip${t.key === curTab ? ' on' : ''}" data-k="${NX.esc(t.key)}">${NX.esc(t.title)}</button>`).join('')}</div>
      <div class="nx-pg-body"></div>`;
    box.querySelector('[data-x]').addEventListener('click', P.close);
    box.querySelectorAll('.nx-pg-tabs .chip').forEach((b) => b.addEventListener('click', () => {
      curTab = b.dataset.k;
      NX.store.set('prog:tab', curTab);
      renderHub();
    }));
    const body = box.querySelector('.nx-pg-body');
    const t = list.find((x) => x.key === curTab);
    if (!t) { body.appendChild(NX.ui.note('No hay piezas de progresión activas. Actívalas con Alt+N.')); return; }
    try { t.render(body, helpers); } catch (err) { body.appendChild(NX.ui.note('No se pudo mostrar: ' + err.message)); }
  }
  const helpers = {
    desc(el, text) { const p = document.createElement('p'); p.className = 'nx-pg-desc'; p.textContent = text; el.appendChild(p); return p; },
    foot(el, buttons) {
      const f = document.createElement('div');
      f.className = 'nx-pg-foot';
      for (const [label, fn, cls] of buttons) {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'btn ' + (cls || 'small'); b.textContent = label;
        b.addEventListener('click', fn);
        f.appendChild(b);
      }
      el.appendChild(f);
      return f;
    },
    rerender: () => { if (hub && !hub.classList.contains('hidden')) renderHub(); },
  };
  P.helpers = helpers;
  P.open = (key) => {
    if (!hub) return;
    if (!visibleTabs().length) { NX.toast('No hay piezas de progresión activas · Alt+N'); return; }
    if (typeof key === 'string' && key) { curTab = key; NX.store.set('prog:tab', key); }
    renderHub();
    hub.classList.remove('hidden');
  };
  P.close = () => { if (hub) hub.classList.add('hidden'); };
  P.refresh = () => helpers.rerender();

  // ---------------------------------------------------------------- ventana que pausa la partida
  // open(build, opts): build(box, close) llena la caja. La partida se pausa
  // con el propio Game.togglePause (estado 'paused') y se esconde la pantalla
  // de pausa del juego; al cerrar se reanuda igual. opts.key(e) recibe las
  // teclas mientras la ventana está abierta (devuelve true si la usó).
  let holdEl = null, holdCur = null;
  const queue = [];
  function pauseGame() {
    const ns = NX.ns, G = ns.Game;
    if (G.state === 'playing') G.togglePause();
    if (G.state !== 'paused') return false;
    try { ns.UI.hide('scr-pause'); } catch (_) { /* nada */ }
    return true;
  }
  function resumeGame() {
    const G = NX.ns.Game;
    if (G.state === 'paused') G.togglePause();
  }
  P.hold = {
    active: () => !!holdCur,
    // Abre ahora si se puede; si no, queda en cola y se abre cuando la partida esté en juego.
    open(build, opts = {}) {
      const item = { build, opts, player: NX.ns && NX.ns.Game.player };
      queue.push(item);
      pump();
      return item;
    },
    close() { closeHold(true); },
  };
  function pump() {
    if (holdCur || !queue.length || !holdEl) return;
    const ns = NX.ns;
    const it = queue[0];
    if (!ns || ns.Game.player !== it.player || !P.live()) { queue.shift(); pump(); return; }
    if (ns.Game.state !== 'playing') return; // espera a que termine la subida de nivel u otra elección
    if (!pauseGame()) return;
    queue.shift();
    holdCur = it;
    const box = holdEl.querySelector('.nx-hd-box');
    box.innerHTML = '';
    try { it.build(box, () => closeHold(true)); } catch (err) { console.warn('[nexus] prog.hold', err); closeHold(true); return; }
    holdEl.classList.remove('hidden');
  }
  function closeHold(resume) {
    const it = holdCur;
    holdCur = null;
    if (holdEl) { holdEl.classList.add('hidden'); holdEl.querySelector('.nx-hd-box').innerHTML = ''; }
    if (it && it.opts.onClose) { try { it.opts.onClose(); } catch (_) { /* nada */ } }
    if (resume && NX.ns && NX.ns.Game.player === (it && it.player)) resumeGame();
    setTimeout(pump, 400);
  }
  // Vigila: si la partida terminó, cierra sin reanudar; si alguien la
  // reanudó por fuera, vuelve a pausarla; la pausa del juego queda oculta.
  NX.every(200, () => {
    const ns = NX.ns;
    if (!ns || !ns.Game) return;
    if (holdCur) {
      const G = ns.Game;
      if (G.player !== holdCur.player || G.state === 'over' || G.state === 'ui') { closeHold(false); queue.length = 0; return; }
      if (G.state === 'playing') pauseGame();
      else if (G.state === 'paused') { try { if (ns.UI.isOpen('scr-pause')) ns.UI.hide('scr-pause'); } catch (_) { /* nada */ } }
    } else pump();
  }, { key: 'prog', name: 'ventana retenida' });
  NX.keys.bind(() => !!holdCur, (e) => {
    if (e.altKey && e.code === 'KeyN') return false;
    const fn = holdCur && holdCur.opts.key;
    if (fn) { try { fn(e); } catch (err) { console.warn('[nexus] prog.hold', err); } }
    return true; // ninguna tecla llega al juego mientras la ventana está abierta
  });
  NX.keys.bind((e) => e.key === 'Escape' && hub && !hub.classList.contains('hidden'), () => { P.close(); return true; });

  // ---------------------------------------------------------------- píldora y pantalla final
  const pills = []; // [key, fn]
  P.pill = (key, fn) => pills.push([key, fn]);
  let pillEl = null;
  function pillTick() {
    if (!pillEl) return;
    const ns = NX.ns;
    const st = ns && ns.Game && ns.Game.state;
    if (!P.live() || st === 'paused' || !NX.store.get('prog:pill', true)) { pillEl.classList.add('hidden'); return; }
    const parts = [];
    for (const [k, fn] of pills) {
      if (!NX.isOn(k)) continue;
      try { const t = fn(); if (t) parts.push(t); } catch (err) { NX.trip(k, err); }
    }
    if (!parts.length) { pillEl.classList.add('hidden'); return; }
    const txt = parts.join(' · ');
    if (pillEl.textContent !== txt) pillEl.textContent = txt;
    // Debajo de la píldora de Modos Nexus si está a la vista.
    const mp = document.getElementById('nexus-mode-pill');
    const top = mp && !mp.classList.contains('hidden') ? Math.round(mp.getBoundingClientRect().bottom + 4) + 'px' : '';
    if (pillEl.style.top !== top) pillEl.style.top = top;
    pillEl.classList.remove('hidden');
  }
  // Agrega una línea a la pantalla final del juego (reintenta mientras se arma).
  P.overLine = (html, tries = 12) => {
    const box = document.getElementById('over-stats');
    const ns = NX.ns;
    if (!box || !ns || ns.Game.state !== 'over' || !box.children.length) { if (tries > 0) setTimeout(() => P.overLine(html, tries - 1), 250); return; }
    const d = document.createElement('div');
    d.className = 'nx-pg-over';
    d.innerHTML = html;
    box.appendChild(d);
  };

  NX.onReady(() => {
    hub = document.createElement('section');
    hub.id = 'nexus-prog';
    hub.className = 'scr dim hidden';
    hub.innerHTML = '<div class="box nx-pg-box"></div>';
    holdEl = document.createElement('section');
    holdEl.id = 'nexus-hold';
    holdEl.className = 'scr dim hidden';
    holdEl.innerHTML = '<div class="box center nx-hd-box"></div>';
    for (const el of [hub, holdEl]) {
      for (const ev of ['pointerdown', 'mousedown', 'touchstart', 'click', 'wheel']) el.addEventListener(ev, (e) => e.stopPropagation());
      el.addEventListener('keydown', (e) => { if (e.key !== 'Escape') e.stopPropagation(); });
      document.body.appendChild(el);
    }
    hub.addEventListener('click', (e) => { if (e.target === hub) P.close(); });
    pillEl = document.createElement('div');
    pillEl.id = 'nexus-prog-pill';
    pillEl.className = 'hidden';
    document.body.appendChild(pillEl);
    NX.every(250, pillTick, { when: 'run', key: 'prog', name: 'píldora', leave: true });

    // Botón del menú principal, debajo de Modos Nexus (o de Jugar).
    const place = () => {
      let b = document.getElementById('nexus-prog-btn');
      const play = document.querySelector('#scr-menu [data-go="play"]');
      if (!visibleTabs().length) { if (b) b.remove(); return; }
      if (!play) return;
      const after = document.getElementById('nexus-modes-btn') || play;
      if (!b) {
        b = document.createElement('button');
        b.type = 'button';
        b.id = 'nexus-prog-btn';
        b.className = 'menu-item';
        b.dataset.sfx = 'confirm';
        b.innerHTML = '<span class="mi-ico" aria-hidden="true">✦</span><span>Progreso Nexus</span><small>Maldiciones, jardín de bayas, retos secretos y cartas</small>';
        b.addEventListener('click', (e) => { e.stopPropagation(); b.blur(); P.open(); });
      }
      if (after.nextElementSibling !== b) after.after(b);
    };
    NX.every(500, () => {
      place();
      if (hub && !hub.classList.contains('hidden') && !P.inMenu()) P.close();
    }, { when: 'menu', key: 'prog', name: 'botón del menú', leave: true });
  });
})();

// ---------------------------------------------------------------- Maldiciones
// Dificultad voluntaria y acumulable. Cada maldición tiene nivel 0 a 3 y suma
// a un multiplicador que se ve en el menú y en la partida. El premio: las
// Pokémonedas del final se multiplican por él (vía coinMul del jugador, que
// el juego usa al cerrar la partida) y la experiencia gana la mitad de ese
// extra. Todo lo tocado vive en el jugador de esa partida, que el juego
// descarta al terminar; los tiempos de los jefes se devuelven al cerrar.
(() => {
  const KEY = 'curses';
  const P = NX.prog;
  const CURSES = [
    { id: 'horde', name: 'Horda', icon: 'fist', per: '+25 % de enemigos', reward: 0.15 },
    { id: 'haste', name: 'Prisa', icon: 'boot', per: '+10 % de velocidad enemiga', reward: 0.12 },
    { id: 'wound', name: 'Herida', icon: 'heart', per: '-25 % de curación y regeneración', reward: 0.12 },
    { id: 'boss', name: 'Jefes impacientes', icon: 'clock', per: 'Los jefes llegan un 15 % antes', reward: 0.1 },
    { id: 'tough', name: 'Piel dura', icon: 'shield', per: '+20 % de vida enemiga', reward: 0.12 },
    { id: 'pain', name: 'Golpes duros', icon: 'bomb', per: '+15 % de daño recibido', reward: 0.12 },
  ];
  const MAX = 3;
  const lv = (id) => NX.clamp(Math.round(+NX.store.get('curses:lv:' + id, 0) || 0), 0, MAX);
  const levels = () => Object.fromEntries(CURSES.map((c) => [c.id, lv(c.id)]));
  const mulOf = (L) => 1 + CURSES.reduce((s, c) => s + (L[c.id] || 0) * c.reward, 0);
  let ns = null, run = null;
  const act = () => (run && NX.isOn(KEY) && ns.Game.player === run.player ? run : null);

  // Para otras piezas (retos secretos): multiplicador de la partida en curso.
  P.curseMul = () => { const r = act(); return r ? r.mul : 1; };
  P.curseSetup = () => mulOf(levels());

  function start(p) {
    if (!NX.isOn(KEY) || !P.runOk()) return;
    const L = levels(), mul = mulOf(L);
    if (mul <= 1) return;
    run = { player: p, lv: L, mul };
    p.coinMul = (p.coinMul || 1) * mul;
    p.xpMul = (p.xpMul || 1) * (1 + (mul - 1) / 2);
    const B = ns.Enemies && ns.Enemies.BOSSES;
    if (L.boss && Array.isArray(B)) {
      run.bossArr = B;
      run.bossAt = B.map((b) => b.at);
      const k = 1 - 0.15 * L.boss;
      for (const b of B) if (typeof b.at === 'number') b.at = Math.max(30, Math.round(b.at * k));
    }
    P.say('Maldiciones activas ' + P.x(mul), 3);
  }
  function end(p) {
    if (!run || run.player !== p) return;
    const r = run;
    run = null;
    try { if (r.bossArr && r.bossAt) r.bossArr.forEach((b, i) => { if (b && r.bossAt[i] != null) b.at = r.bossAt[i]; }); } catch (_) { /* nada */ }
    if (ns.Game.state === 'over') P.overLine(`<b>Maldiciones ${P.x(r.mul)}</b>: +${Math.round((r.mul - 1) * 100)} % de Pokémonedas y +${Math.round((r.mul - 1) * 50)} % de experiencia`);
  }

  function hook() {
    const PP = ns.Player.prototype, E = ns.Enemies, C = ns.Coop;
    if (C && typeof C.scaleRate === 'function') {
      const sr = C.scaleRate;
      C.scaleRate = function () {
        const v = sr.apply(this, arguments);
        const r = act();
        return r && r.lv.horde && !C.active ? v * (1 + 0.25 * r.lv.horde) : v;
      };
    }
    for (const k of ['scale', 'bossScale']) {
      const f = E[k];
      if (typeof f !== 'function') continue;
      E[k] = function () {
        const v = f.apply(this, arguments);
        const r = act();
        if (!r || !v || typeof v !== 'object') return v;
        const o = Object.assign({}, v);
        if (r.lv.tough && typeof o.hp === 'number') o.hp *= 1 + 0.2 * r.lv.tough;
        if (r.lv.haste && k === 'scale' && typeof o.spd === 'number') o.spd *= 1 + 0.1 * r.lv.haste;
        return o;
      };
    }
    const heal = PP.heal;
    PP.heal = function (n) {
      const r = act();
      if (r && r.lv.wound && this === r.player && typeof n === 'number') {
        const a = Array.prototype.slice.call(arguments);
        a[0] = n * (1 - 0.25 * r.lv.wound);
        return heal.apply(this, a);
      }
      return heal.apply(this, arguments);
    };
    const rd = Object.getOwnPropertyDescriptor(PP, 'regen');
    if (rd && rd.get && rd.configurable) {
      Object.defineProperty(PP, 'regen', {
        configurable: true, enumerable: rd.enumerable,
        get() { const v = rd.get.call(this); const r = act(); return r && r.lv.wound && this === r.player ? v * (1 - 0.25 * r.lv.wound) : v; },
      });
    }
    const hurt = PP.hurt;
    PP.hurt = function (dmg) {
      const r = act();
      if (r && r.lv.pain && this === r.player && typeof dmg === 'number') {
        const a = Array.prototype.slice.call(arguments);
        a[0] = dmg * (1 + 0.15 * r.lv.pain);
        return hurt.apply(this, a);
      }
      return hurt.apply(this, arguments);
    };
  }

  function controls(el, onChange) {
    const sum = document.createElement('p');
    sum.className = 'nx-note';
    const upd = () => {
      const m = mulOf(levels());
      sum.innerHTML = m > 1
        ? `Multiplicador <b style="color:#ffc2d1">${P.x(m)}</b>: +${Math.round((m - 1) * 100)} % de Pokémonedas al final y +${Math.round((m - 1) * 50)} % de experiencia.`
        : 'Sin maldiciones: la partida es la de siempre.';
    };
    for (const c of CURSES) {
      el.appendChild(NX.ui.range(`${c.name} · ${c.per} por nivel (+${Math.round(c.reward * 100)} %)`, 'curses:lv:' + c.id, 0, MAX, 1, 0,
        (v) => (v ? 'Nv. ' + v : 'No'), () => { upd(); if (onChange) onChange(); }));
    }
    upd();
    el.appendChild(sum);
    return upd;
  }

  NX.feature({
    key: KEY,
    label: 'Maldiciones',
    needs: (n) => n.Game && n.Player && n.Player.prototype && typeof n.Player.prototype.heal === 'function' &&
      typeof n.Player.prototype.hurt === 'function' && n.Enemies && typeof n.Enemies.scale === 'function' && n.Coop && typeof n.Coop.scaleRate === 'function',
    setup(n) {
      ns = n;
      hook();
      NX.runs.on('start', (p) => { try { start(p); } catch (err) { NX.trip(KEY, err); } });
      NX.runs.on('end', (p) => { try { end(p); } catch (err) { NX.trip(KEY, err); } });
      P.pill(KEY, () => { const r = act(); return r ? 'Maldición ' + P.x(r.mul) : ''; });
      P.tab({
        key: KEY, title: 'Maldiciones', order: 1,
        render(el, h) {
          h.desc(el, 'Dificultad voluntaria y acumulable para las partidas normales, Modificadores e Infinito. Cuanto más alto el multiplicador, más Pokémonedas al final y más experiencia. No se aplica en el laboratorio, Boss Rush, el desafío diario ni el cooperativo.');
          controls(el);
          h.foot(el, [['Quitar todas', () => { for (const c of CURSES) NX.store.set('curses:lv:' + c.id, 0); h.rerender(); }]]);
        },
      });
    },
  });

  NX.settings.section({
    key: KEY,
    tab: 'Modos',
    title: 'Maldiciones',
    keywords: 'maldiciones dificultad horda prisa herida jefes piel dura golpes multiplicador monedas experiencia progreso',
    render(el) {
      el.appendChild(NX.ui.toggle('Activado', 'on:' + KEY, true));
      el.appendChild(NX.ui.toggle('Píldora del bloque de progresión en la partida', 'prog:pill', true));
      controls(el);
      el.appendChild(NX.ui.button('Abrir Progreso Nexus', () => { if (!P.inMenu()) { NX.toast('Ábrelo desde el menú principal'); return; } NX.togglePanel(); P.open(KEY); }));
    },
  });
})();
