// Modos Nexus: motor común y selector. Cada modo (infinito, modificadores,
// laboratorio, diario, Boss Rush) se registra aquí con NX.modes.register y
// arranca con NX.modes.launch(cfg). El motor envuelve una sola vez las piezas
// del juego que hacen falta; sin un modo en curso todas pasan de largo, así
// que el juego normal queda intacto. Al terminar cada partida se devuelven
// los valores tocados (Judgment.AT, velocidad, compañero, guardado...).
//
// Una partida de modo (cfg) admite:
//   key, label, tags[], mods{}          nombre en la píldora y modificadores
//   noRank, noAch, restoreStats         fuera del ranking, sin logros, estadísticas del juego intactas
//   sandbox                             nada llega al guardado (laboratorio)
//   noJudge, noRift, noSpawner, spawnK  sin Juicio, sin grietas, sin generador, densidad
//   taken, dealt, speed, noHeal, chaos  multiplicadores y reglas
//   immortal, partner, worldSeed
//   onStart, onTick, onEnd, onAdd, scale, pause[], pillExtra, overNote
(() => {
  const KEY = 'modes';
  const LIVE = new Set(['playing', 'held', 'levelup', 'choice', 'paused']);
  const JUDGE_AT = 1800;
  const SNAP_KEY = 'modes:snap';
  // Partes del guardado que una partida infinita no debe cambiar (idea de PokeSurvivor Plus, MIT).
  const SNAP_PARTS = ['stats', 'legends', 'arenas', 'evoMoves', 'itemsFound'];
  const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  const defs = [];
  let ns = null, ctx = null, pending = null, capScale = 1, modal = null, curTab = NX.store.get('modes:tab', '');

  const on = () => NX.isOn(KEY);
  const act = () => (ctx && on() ? ctx : null);

  NX.css(`#nexus-modes{z-index:60}
#nexus-modes .nx-md-box{width:min(640px,100%);display:flex;flex-direction:column;gap:6px}
#nexus-modes .nx-md-head{display:flex;justify-content:space-between;align-items:center;gap:10px}
#nexus-modes .nx-md-tabs{display:flex;flex-wrap:wrap;gap:6px;margin:2px 0 6px}
#nexus-modes .nx-md-body{min-height:180px}
#nexus-modes .nx-md-desc{color:var(--muted,#b9cbf0);font-size:14px;margin:2px 0 8px;text-shadow:none}
#nexus-modes .nx-row{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:3px 0;font-size:15px;cursor:pointer}
#nexus-modes select{font:inherit;font-size:14px;background:#0b1838;color:#fff;border:1px solid #5b83d6;border-radius:6px;padding:3px 6px;max-width:62%;text-shadow:none}
#nexus-modes .nx-rng{display:flex;align-items:center;gap:8px}#nexus-modes .nx-rng b{min-width:48px;text-align:right;color:var(--gold,#ffd23f)}
#nexus-modes input[type=checkbox]{width:18px;height:18px;accent-color:#ffd23f}
#nexus-modes .nx-note{margin:4px 0;font-size:13px;color:var(--muted,#b9cbf0);text-shadow:none}
#nexus-modes .nx-btn{font:inherit;font-size:13px;background:#0b1838;color:#fff;border:2px solid #f4f8ff;border-radius:6px;cursor:pointer;padding:3px 10px;margin:4px 6px 4px 0}
#nexus-modes .nx-md-foot{display:flex;justify-content:flex-end;gap:10px;margin-top:10px;flex-wrap:wrap}
#nexus-modes .nx-md-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px 14px}
#nexus-modes .nx-md-card{background:rgba(0,0,0,.22);border-radius:9px;padding:6px 10px;font-size:14px}
#nexus-modes .nx-md-card span{display:block;color:var(--muted,#b9cbf0);font-size:12px;text-transform:uppercase}
#nexus-modes .nx-md-card b{font-size:18px}
.nx-md-t{width:100%;border-collapse:collapse;font-size:13px;text-shadow:none}
.nx-md-t th{color:var(--muted,#b9cbf0);font-weight:400;text-align:left;padding:2px 4px}
.nx-md-t td{padding:2px 4px;border-top:1px solid rgba(255,255,255,.08)}
#nexus-modes-btn small{white-space:normal}
#nexus-mode-pill{position:fixed;left:50%;top:84px;transform:translateX(-50%);z-index:9991;pointer-events:none;padding:3px 12px;border-radius:12px;
  background:rgba(12,20,44,.84);color:#fff;border:2px solid #8a5cf0;font:13px/1.3 var(--font,'Pixelify',system-ui,sans-serif);white-space:nowrap;max-width:92vw;overflow:hidden;text-overflow:ellipsis}
#nexus-mode-pill b{color:#d9c8ff}#nexus-mode-pill.hidden{display:none}
#nexus-mode-pause{justify-content:center;margin-top:10px}#nexus-mode-pause[hidden]{display:none}
#nexus-mode-pause .nx-md-tag{width:100%;text-align:center;color:#d9c8ff;font-size:13px}
#over-stats .nx-md-over{grid-column:1/-1;text-align:center;color:#d9c8ff;font-size:13px}`);

  // ---------------------------------------------------------------- guardado
  function snapStats(c) {
    const s = ns.DB && ns.DB.save;
    if (!s) return;
    const snap = { at: Date.now(), runs: (s.stats && s.stats.runs) || 0, d: {} };
    for (const k of SNAP_PARTS) snap.d[k] = s[k] === undefined ? null : clone(s[k]);
    c.statSnap = snap;
    NX.store.set(SNAP_KEY, snap);
  }
  function restoreStats(snap) {
    const s = ns.DB && ns.DB.save;
    if (!snap || !s) return;
    for (const k of SNAP_PARTS) { if (snap.d[k] === null) delete s[k]; else s[k] = clone(snap.d[k]); }
  }
  // Devuelve el guardado entero al estado de la copia, sin cambiar el objeto.
  function restoreSave(snap) {
    const s = ns.DB && ns.DB.save;
    if (!snap || !s) return;
    for (const k of Object.keys(s)) if (!(k in snap)) delete s[k];
    for (const k of Object.keys(snap)) s[k] = clone(snap[k]);
  }

  // ---------------------------------------------------------------- ciclo de partida
  function makeCtx(cfg) {
    const base = { key: 'mode', label: '', tags: [], taken: 1, dealt: 1, spawnK: 1, capK: 1, speed: 1, noHeal: false, chaos: 0,
      noRank: true, noAch: false, restoreStats: false, sandbox: false, noJudge: false, noRift: false, noSpawner: false, immortal: false, pause: [] };
    const fx = cfg.mods && NX.modsApi ? NX.modsApi.effects(cfg.mods) : {};
    const c = Object.assign(base, fx, cfg);
    c.tags = [...(fx.tags || []), ...(cfg.tags || [])];
    return c;
  }
  function autoCtx() {
    const M = NX.modsApi;
    if (!M || !NX.isOn('mods') || !M.enabled()) return null;
    const vals = M.values();
    if (M.neutral(vals)) return null;
    return makeCtx({ key: 'mods', label: 'Modificadores', mods: vals });
  }

  function begin(c) {
    const G = ns.Game, J = ns.Judgment;
    c.player = G.player;
    c.judgeAT0 = J.AT;
    c.bossArr = ns.Enemies.BOSSES;
    c.bossLen0 = c.bossArr ? c.bossArr.length : 0;
    if (c.noJudge) J.AT = 1e9; // las grietas leen este valor y siguen abriéndose
    if (c.speed !== 1 && typeof G.debugSpeed === 'function') { G.debugSpeed(c.speed); c.speedSet = true; }
    c.chaosT = c.chaos ? 6 : 0;
    if (c.onStart) c.onStart(ns, c.player, c);
    renderPause();
  }

  function finish(how) {
    const c = ctx;
    if (!c) return;
    ctx = null;
    const G = ns.Game, J = ns.Judgment, p = c.player;
    try { if (c.speedSet) G.debugSpeed(1); } catch (err) { console.warn('[nexus] modos', err); }
    try { if (c.noJudge && J.AT >= 1e8) J.AT = typeof c.judgeAT0 === 'number' && c.judgeAT0 < 1e8 ? c.judgeAT0 : JUDGE_AT; } catch (_) { /* sin Juicio */ }
    try { if (c.bossArr && ns.Enemies.BOSSES === c.bossArr && c.bossArr.length > c.bossLen0) c.bossArr.length = c.bossLen0; } catch (_) { /* nada */ }
    try { if (c.chaos && ns.Weather.clear && !(J && J.active)) ns.Weather.clear(); } catch (_) { /* nada */ }
    try {
      if (c.sandbox && c.snap) restoreSave(c.snap);
      if (c.restoreStats) {
        if (!c.statsRestored) restoreStats(c.statSnap);
        NX.store.set(SNAP_KEY, null);
      }
    } catch (err) { console.warn('[nexus] modos', err); }
    const st = G.state;
    const t = G.st && typeof G.st.time === 'number' ? G.st.time : (c.lastT || 0);
    const info = { time: t, level: (p && p.level) || 1, kills: (p && p.kills) || 0, bosses: (p && p.bosses) || 0,
      dead: !!(p && p.dead), how: how || st, dex: (p && p.dex) || 0, mon: (p && p.mon && p.mon.name) || '' };
    let note = c.overNote || '';
    try { if (c.onEnd) { const r = c.onEnd(ns, p, c, info); if (typeof r === 'string') note = r; } } catch (err) { console.warn('[nexus] modos', err); }
    try { if (c.key === 'mods' && c.mods && NX.modsApi) { const r = NX.modsApi.record(c.mods, info); if (r) note = (note ? note + '<br>' : '') + r; } } catch (err) { console.warn('[nexus] modos', err); }
    if (note && st === 'over') overNote(c, note);
    renderPause();
    pillOff();
  }

  function overNote(c, html) {
    const box = document.getElementById('over-stats');
    if (!box || box.querySelector('.nx-md-over')) return;
    // El aviso de récord del juego no cuenta en estos modos.
    if (c.restoreStats || c.sandbox) for (const d of box.querySelectorAll(':scope > div.gold')) if (/r[eé]cord/i.test(d.textContent)) d.remove();
    const line = document.createElement('div');
    line.className = 'nx-md-over';
    line.innerHTML = html;
    box.prepend(line);
  }

  // ---------------------------------------------------------------- ganchos
  function hook() {
    const G = ns.Game, J = ns.Judgment, R = ns.Ranking, PP = ns.Player.prototype, EP = ns.Enemy.prototype;

    const start = G.startRun;
    G.startRun = function (opts) {
      if (ctx) finish('replaced');
      const cfg = pending;
      pending = null;
      // El cooperativo (con opciones de sala) nunca entra en un modo.
      if (opts || !on() || (ns.Coop && ns.Coop.active)) return start.apply(this, arguments);
      let c = null;
      try { c = cfg ? makeCtx(cfg) : autoCtx(); } catch (err) { NX.trip(KEY, err); c = null; }
      if (!c) return start.apply(this, arguments);
      const s = ns.DB.save, undo = [];
      let r;
      ctx = c; // antes de arrancar: Ranking.runStarted lo consulta
      try {
        if (c.restoreStats) snapStats(c);
        if (c.sandbox) c.snap = clone(s);
        if (c.partner) {
          const p0 = s.partner, sh0 = s.partnerShiny;
          s.partner = c.partner;
          s.partnerShiny = false;
          undo.push(() => { s.partner = p0; s.partnerShiny = sh0; });
        }
        if (c.worldSeed != null && ns.World && typeof ns.World.reset === 'function') {
          const W = ns.World, wr = W.reset;
          W.reset = function () { return wr.call(this, c.worldSeed); };
          undo.push(() => { W.reset = wr; });
        }
        r = start.apply(this, arguments);
      } catch (err) {
        ctx = null;
        throw err;
      } finally {
        for (const f of undo.reverse()) { try { f(); } catch (_) { /* nada */ } }
      }
      try { begin(c); } catch (err) { NX.trip(KEY, err); }
      return r;
    };

    // Fuera del ranking del juego: ni se registra ni se envía.
    if (R) {
      for (const k of ['runStarted', 'submitSolo', 'submitGroup']) {
        const f = R[k];
        if (typeof f !== 'function') continue;
        R[k] = function () { const c = act(); if (c && c.noRank) return null; return f.apply(this, arguments); };
      }
    }

    // Sin Juicio a los 30:00 (salvo que se invoque a Arceus). Adaptado de PokeSurvivor Plus (MIT).
    const jupd = J.update;
    J.update = function (dt, pl, time) {
      const c = act();
      if (c && c.noJudge && typeof time === 'number') {
        time = c.arceus ? Math.max(time, JUDGE_AT) : Math.min(time, JUDGE_AT - 1);
        return jupd.call(this, dt, pl, time);
      }
      return jupd.apply(this, arguments);
    };
    // El juego lee el resumen del Juicio justo después de sumar la partida a
    // sus estadísticas y antes de guardar: ahí se devuelven a como estaban.
    const jsum = J.summary;
    J.summary = function () {
      const r = jsum.apply(this, arguments);
      const c = act();
      if (c && G.state === 'over') {
        try {
          if (c.restoreStats && !c.statsRestored) { restoreStats(c.statSnap); c.statsRestored = true; }
          if (c.sandbox && c.snap) restoreSave(c.snap);
        } catch (err) { NX.trip(KEY, err); }
      }
      return r;
    };

    // Sin logros mientras dura el modo.
    const A = ns.AchDefs;
    if (A && Array.isArray(A.LIST)) {
      const list = A.LIST;
      Object.defineProperty(A, 'LIST', { configurable: true, enumerable: true, get: () => { const c = act(); return c && (c.noAch || c.sandbox) ? [] : list; } });
    }

    // Laboratorio: nada de misiones, logros ni guardados.
    const P = ns.Progress;
    if (P) for (const k of ['event', 'kill', 'claim', 'checkAch', 'grant']) {
      const f = P[k];
      if (typeof f !== 'function') continue;
      P[k] = function () { const c = act(); if (c && c.sandbox) return undefined; return f.apply(this, arguments); };
    }
    const D = ns.DB;
    if (typeof D.commit === 'function') {
      const commit = D.commit;
      D.commit = function () { const c = act(); if (c && c.sandbox) return false; return commit.apply(this, arguments); };
    }
    if (typeof D.saveNow === 'function') {
      const saveNow = D.saveNow;
      D.saveNow = function () { const c = act(); if (c && c.sandbox) return Promise.resolve({ ok: false, why: 'lab' }); return saveNow.apply(this, arguments); };
    }

    // Daño recibido, inmortalidad y curación.
    const hurt = PP.hurt;
    PP.hurt = function (dmg) {
      const c = act();
      if (c && this === c.player) {
        if (c.immortal) return undefined;
        if (c.taken !== 1 && typeof dmg === 'number') {
          const a = Array.prototype.slice.call(arguments);
          a[0] = dmg * c.taken;
          return hurt.apply(this, a);
        }
      }
      return hurt.apply(this, arguments);
    };
    const heal = PP.heal;
    PP.heal = function () {
      const c = act();
      if (c && c.noHeal && this === c.player) return undefined;
      return heal.apply(this, arguments);
    };
    // Daño infligido.
    const ehurt = EP.hurt;
    EP.hurt = function (dmg) {
      const c = act();
      if (c && c.dealt !== 1 && typeof dmg === 'number' && !this.remote) {
        const a = Array.prototype.slice.call(arguments);
        a[0] = dmg * c.dealt;
        return ehurt.apply(this, a);
      }
      return ehurt.apply(this, arguments);
    };

    // Densidad: el generador multiplica su ritmo por Coop.scaleRate y se
    // detiene en Spawner.CAP enemigos; durante su paso el tope crece igual.
    const C = ns.Coop;
    if (C && typeof C.scaleRate === 'function') {
      const sr = C.scaleRate;
      C.scaleRate = function () {
        const r = sr.apply(this, arguments);
        const c = act();
        return c && c.spawnK !== 1 && !C.active ? r * c.spawnK : r;
      };
    }
    const EM = ns.EnemyMgr;
    const cd = Object.getOwnPropertyDescriptor(EM, 'count');
    if (cd && cd.get && cd.configurable) {
      Object.defineProperty(EM, 'count', {
        configurable: true, enumerable: cd.enumerable,
        get() { const n = cd.get.call(this); return capScale > 1 ? Math.floor(n / capScale) : n; },
      });
    }
    const SP = ns.Spawner, spu = SP.update;
    SP.update = function () {
      const c = act();
      if (c && c.noSpawner) return undefined;
      if (c && c.capK > 1) {
        capScale = c.capK;
        try { return spu.apply(this, arguments); } finally { capScale = 1; }
      }
      return spu.apply(this, arguments);
    };
    // Sin grietas nuevas: el reloj que ve Rift se queda en 0.
    const RF = ns.Rift;
    if (RF && typeof RF.update === 'function') {
      const ru = RF.update;
      RF.update = function (dt, pl) {
        const c = act();
        if (c && c.noRift && !RF.inArena) return ru.call(this, dt, pl, 0);
        return ru.apply(this, arguments);
      };
    }
    // Enemigos y jefes nuevos, y su escala.
    const add = EM.add;
    EM.add = function (e) {
      const c = act();
      if (c && c.onAdd && e) { try { c.onAdd(e, ns, c); } catch (err) { NX.trip(KEY, err); } }
      return add.apply(this, arguments);
    };
    const E = ns.Enemies;
    for (const k of ['scale', 'bossScale']) {
      const f = E[k];
      if (typeof f !== 'function') continue;
      E[k] = function (t) {
        const r = f.apply(this, arguments);
        const c = act();
        if (c && c.scale && r) { try { return c.scale(r, t, k === 'bossScale'); } catch (err) { NX.trip(KEY, err); } }
        return r;
      };
    }
  }

  // ---------------------------------------------------------------- reloj del modo
  function tick() {
    const c = act();
    if (!c) return;
    const G = ns.Game, p = c.player, st = G.state;
    if (G.player !== p || !LIVE.has(st)) return;
    const t = G.st.time || 0;
    const dt = Math.max(0, t - (c.lastT == null ? t : c.lastT));
    c.lastT = t;
    if (c.noHeal && !p.dead) {
      if (c.hpCap != null && p.hp > c.hpCap) p.hp = c.hpCap;
      c.hpCap = p.hp;
    }
    if (c.chaos > 0 && st === 'playing' && !ns.Judgment.active && !ns.Rift.inArena) {
      c.chaosT -= dt;
      if (c.chaosT <= 0) {
        c.chaosT = c.chaos;
        const kinds = Object.keys(ns.Weather.KINDS || {});
        const cur = ns.Weather.current && ns.Weather.current.kind;
        const pool = kinds.filter((k) => k !== cur);
        if (pool.length) ns.Weather.force(pool[Math.floor(Math.random() * pool.length)], c.chaos);
      }
    }
    if (c.onTick) c.onTick(ns, p, c, dt);
  }

  // ---------------------------------------------------------------- píldora y pausa
  let pill = null, pauseRow = null;
  function pillOff() { if (pill) pill.classList.add('hidden'); }
  function pillUpdate() {
    if (!pill) return;
    const c = act();
    const live = c && ns.Game.player === c.player && LIVE.has(ns.Game.state) && ns.Game.state !== 'paused';
    if (!live) { pillOff(); return; }
    let extra = '';
    try { extra = c.pillExtra ? c.pillExtra(ns, c) || '' : ''; } catch (err) { NX.trip(KEY, err); }
    const html = `<b>${NX.esc(c.label)}</b>${c.tags.length ? ' · ' + NX.esc(c.tags.join(' · ')) : ''}${extra ? ' · ' + NX.esc(extra) : ''}`;
    if (pill.innerHTML !== html) pill.innerHTML = html;
    pill.classList.remove('hidden');
  }

  function renderPause() {
    if (!pauseRow) return;
    const c = act();
    pauseRow.innerHTML = '';
    pauseRow.hidden = !c;
    if (!c) return;
    const tag = document.createElement('div');
    tag.className = 'nx-md-tag';
    tag.textContent = 'Modo Nexus: ' + c.label + (c.tags.length ? ' · ' + c.tags.join(' · ') : '');
    pauseRow.appendChild(tag);
    for (const b of c.pause || []) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'btn';
      el.dataset.sfx = 'none';
      el.textContent = b.label;
      el.dataset.nxShow = b.show ? '1' : '';
      el._nxDef = b;
      let armT = 0;
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        el.blur();
        if (b.confirm && !el.classList.contains('armed')) {
          el.classList.add('armed', 'danger');
          el.textContent = b.confirm;
          clearTimeout(armT);
          armT = setTimeout(() => { el.classList.remove('armed', 'danger'); el.textContent = b.label; }, 3500);
          return;
        }
        el.classList.remove('armed', 'danger');
        el.textContent = b.label;
        try { b.onClick(ctx, ns); } catch (err) { NX.trip(KEY, err); }
        syncPause();
      });
      pauseRow.appendChild(el);
    }
    syncPause();
  }
  function syncPause() {
    if (!pauseRow) return;
    const c = act();
    for (const el of pauseRow.querySelectorAll('button')) {
      const b = el._nxDef;
      el.hidden = !!(b && b.show && c && !b.show(c, ns));
    }
  }
  const resume = () => { const r = document.getElementById("btn-resume"); if (r) r.click(); };

  // ---------------------------------------------------------------- selector
  const visibleDefs = () => defs.filter((d) => NX.isOn(d.key));
  function openModal(key) {
    if (!modal || !on()) return;
    const list = visibleDefs();
    if (!list.length) { NX.toast('No hay modos activos · Alt+N para activarlos'); return; }
    if (key) curTab = key;
    if (!list.some((d) => d.key === curTab)) curTab = list[0].key;
    renderModal();
    modal.classList.remove('hidden');
  }
  function closeModal() { if (modal) modal.classList.add('hidden'); }
  function renderModal() {
    const box = modal.querySelector('.nx-md-box');
    const list = visibleDefs();
    box.innerHTML = `<div class="nx-md-head"><h2>Modos Nexus</h2><button type="button" class="btn small ghost" data-x>Cerrar</button></div>
      <div class="nx-md-tabs">${list.map((d) => `<button type="button" class="chip${d.key === curTab ? ' on' : ''}" data-k="${NX.esc(d.key)}">${NX.esc(d.title)}</button>`).join('')}</div>
      <div class="nx-md-body"></div>`;
    box.querySelector('[data-x]').addEventListener('click', closeModal);
    box.querySelectorAll('.nx-md-tabs .chip').forEach((b) => b.addEventListener('click', () => {
      curTab = b.dataset.k;
      NX.store.set('modes:tab', curTab);
      renderModal();
    }));
    const body = box.querySelector('.nx-md-body');
    const d = list.find((x) => x.key === curTab);
    if (!d) return;
    try { d.render(body, helpers); } catch (err) { body.appendChild(NX.ui.note('No se pudo mostrar: ' + err.message)); }
  }
  const canPlay = () => !!(ns && ns.Game && ns.Game.state === 'ui' && ns.DB && ns.DB.save && !(ns.Social && ns.Social.room));
  const helpers = {
    desc(el, text) { const p = document.createElement('p'); p.className = 'nx-md-desc'; p.textContent = text; el.appendChild(p); return p; },
    cards(el, items) {
      const g = document.createElement('div');
      g.className = 'nx-md-grid';
      g.innerHTML = items.map(([k, v]) => `<div class="nx-md-card"><span>${NX.esc(k)}</span><b>${NX.esc(v)}</b></div>`).join('');
      el.appendChild(g);
      return g;
    },
    table(el, head, rows, empty) {
      if (!rows.length) { el.appendChild(NX.ui.note(empty || 'Sin partidas todavía.')); return null; }
      const t = document.createElement('table');
      t.className = 'nx-md-t';
      t.innerHTML = `<tr>${head.map((h) => `<th>${NX.esc(h)}</th>`).join('')}</tr>` +
        rows.map((r) => `<tr>${r.map((v) => `<td>${NX.esc(v)}</td>`).join('')}</tr>`).join('');
      el.appendChild(t);
      return t;
    },
    foot(el, label, onPlay, extra) {
      const f = document.createElement('div');
      f.className = 'nx-md-foot';
      for (const [l, fn] of extra || []) {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'btn small'; b.textContent = l;
        b.addEventListener('click', fn);
        f.appendChild(b);
      }
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'btn gold'; b.textContent = label;
      b.addEventListener('click', () => { try { onPlay(); } catch (err) { NX.toast('No se pudo arrancar: ' + err.message); } });
      f.appendChild(b);
      el.appendChild(f);
      return f;
    },
    rerender: () => renderModal(),
  };

  NX.modes = {
    register(def) { defs.push(def); defs.sort((a, b) => (a.order || 0) - (b.order || 0)); },
    ctx: () => act(),
    canPlay,
    // Arranca una partida con el modo cfg. Solo desde el menú.
    launch(cfg) {
      if (!on()) { NX.toast('Los Modos Nexus están apagados'); return false; }
      if (!canPlay()) { NX.toast('Vuelve al menú principal para empezar un modo'); return false; }
      closeModal();
      pending = cfg;
      try {
        if (ns.Audio && ns.Audio.sfx) ns.Audio.sfx('confirm');
        if (ns.Flow && typeof ns.Flow.play === 'function') ns.Flow.play(); else ns.Game.startRun();
      } catch (err) {
        pending = null;
        if (ctx) finish('error');
        throw err;
      }
      pending = null;
      return true;
    },
    // Termina la partida sin el cierre normal (sin monedas, estadísticas ni
    // guardado) y vuelve al menú. Lo usa el laboratorio.
    exitToMenu() {
      const G = ns.Game;
      try { G.toUI(); } catch (_) { /* nada */ }
      try { ns.EnemyMgr.clear(); ns.Pickups.clear(); ns.Projectiles.clear(); ns.Combat.clearFields(); } catch (_) { /* nada */ }
      finish('ui');
      try { ns.UI.hideAll(); } catch (_) { /* nada */ }
      try { ns.UI.chrome(true); } catch (_) { /* nada */ }
      ns.Flow.goMenu();
    },
    resume,
    // open('lab') abre la ventana directo en la pestaña de ese modo.
    open(tab) {
      if (typeof tab === 'string' && tab) { curTab = tab; NX.store.set('modes:tab', tab); }
      openModal();
    },
    close: closeModal,
    fmt: (s) => NX.fmtTime(s),
    date: (ms) => { const d = new Date(ms); return d.toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit' }); },
    dexName: (dex) => { const m = ns && ns.DEX_BY && ns.DEX_BY[dex]; return (m && m.name) || ('#' + dex); },
    ns: () => ns,
  };

  NX.feature({
    key: KEY,
    label: 'Modos Nexus',
    needs: (n) => n.Game && typeof n.Game.startRun === 'function' && n.Judgment && typeof n.Judgment.update === 'function' &&
      typeof n.Judgment.summary === 'function' && n.Spawner && typeof n.Spawner.update === 'function' && n.EnemyMgr && typeof n.EnemyMgr.add === 'function' &&
      n.Enemies && Array.isArray(n.Enemies.BOSSES) && n.Player && n.Player.prototype && typeof n.Player.prototype.hurt === 'function' &&
      n.Enemy && n.Enemy.prototype && typeof n.Enemy.prototype.hurt === 'function' && n.DB && n.Flow && n.Weather && n.Rift,
    setup(n) {
      ns = n;
      hook();
      NX.runs.on('end', (p) => { if (ctx && p === ctx.player) finish(ns.Game.state); });
      setInterval(() => { try { tick(); pillUpdate(); } catch (err) { NX.trip(KEY, err); } }, 100);

      // Copia de estadísticas de una partida infinita que no terminó (pestaña cerrada).
      const rec = setInterval(() => {
        const s = ns.DB && ns.DB.save;
        if (!s || !s.stats) return;
        clearInterval(rec);
        const snap = NX.store.get(SNAP_KEY, null);
        if (!snap || ctx) return;
        if ((s.stats.runs || 0) === snap.runs && Date.now() - snap.at < 7 * 864e5) {
          restoreStats(snap);
          try { ns.DB.commit(true); } catch (_) { /* sin conexión */ }
        }
        NX.store.set(SNAP_KEY, null);
      }, 1000);

      NX.onReady(() => {
        pill = document.createElement('div');
        pill.id = 'nexus-mode-pill';
        pill.className = 'hidden';
        document.body.appendChild(pill);

        modal = document.createElement('section');
        modal.id = 'nexus-modes';
        modal.className = 'scr dim hidden';
        modal.innerHTML = '<div class="box nx-md-box"></div>';
        for (const ev of ['pointerdown', 'mousedown', 'touchstart', 'click', 'wheel']) modal.addEventListener(ev, (e) => e.stopPropagation());
        modal.addEventListener('keydown', (e) => { if (e.key !== 'Escape') e.stopPropagation(); });
        modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
        document.body.appendChild(modal);

        // Botón en el menú principal, debajo de Jugar.
        const place = () => {
          const play = document.querySelector('#scr-menu [data-go="play"]');
          let b = document.getElementById('nexus-modes-btn');
          if (!on() || !visibleDefs().length) { if (b) b.remove(); return; }
          if (!play) return;
          if (!b) {
            b = document.createElement('button');
            b.type = 'button';
            b.id = 'nexus-modes-btn';
            b.className = 'menu-item';
            b.dataset.sfx = 'confirm';
            b.innerHTML = '<span class="mi-ico" aria-hidden="true">∞</span><span>Modos Nexus</span><small>Infinito, Boss Rush, diario, laboratorio y modificadores</small>';
            b.addEventListener('click', (e) => { e.stopPropagation(); b.blur(); openModal(); });
            play.after(b);
          } else if (play.nextElementSibling !== b) play.after(b);
        };
        place();
        setInterval(() => {
          place();
          if (modal && !modal.classList.contains('hidden') && !(ns.Game.state === 'ui')) closeModal();
          syncPause();
        }, 500);

        const pauseBox = document.querySelector('#scr-pause .box');
        const btnRow = pauseBox && pauseBox.querySelector(':scope > .row');
        if (btnRow) {
          pauseRow = document.createElement('div');
          pauseRow.id = 'nexus-mode-pause';
          pauseRow.className = 'row';
          pauseRow.hidden = true;
          btnRow.after(pauseRow);
        }
      });
    },
  });

  NX.keys.bind((e) => e.key === 'Escape' && modal && !modal.classList.contains('hidden'), () => { closeModal(); return true; });

  NX.settings.section({
    key: KEY,
    tab: 'Modos',
    title: 'Modos Nexus',
    keywords: 'modos infinito boss rush diario laboratorio modificadores menú',
    render(el) {
      el.appendChild(NX.ui.toggle('Activado', 'on:' + KEY, true));
      el.appendChild(NX.ui.note('Añade el botón Modos Nexus debajo de Jugar en el menú principal. Apagado, el juego queda como siempre.'));
      el.appendChild(NX.ui.button('Abrir Modos Nexus', () => {
        if (!canPlay()) { NX.toast('Abre los modos desde el menú principal'); return; }
        NX.togglePanel();
        openModal();
      }));
    },
  });
})();
