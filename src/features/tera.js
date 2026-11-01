// Teracristalización. Una vez por partida, la tecla T, el botón TERA del HUD o
// su toque cambian el tipo del Pokémon al tipo Tera elegido (en los ajustes,
// antes de la partida, o en un selector al activarla) con un efecto de
// cristal: fragmentos que lo rodean y la joya Tera sobre la cabeza. Dura toda
// la partida o los segundos que se elijan.
//
// Cómo se aplica: mon.types pasa a ser [tipo Tera] en un clon del mon (ver
// pokemech-core.js) y se devuelve al terminar. Efectos en el juego:
//  - Daño recibido: Types.mult usa el tipo Tera (como en la serie, la defensa
//    pasa a ser la del tipo Tera puro).
//  - Movimientos monoType: Player.monoType da su bono (MONO_K) solo si el mon
//    tiene un único tipo igual al del movimiento. Con Tera, los movimientos
//    del tipo Tera ganan ese bono y los del tipo original lo pierden, salvo
//    que coincidan.
//  - Subidas de nivel: Moves.poolFor lee mon.types, así que las cartas nuevas
//    pueden incluir movimientos del tipo Tera mientras dura.
//  - Clima (Weather.speedFor) y líquidos (World.liquidEffect) también miran
//    los tipos: el tipo Tera decide inmunidades y ralentizaciones.
//  - Upgrades (mejoras permanentes de la tienda) no dependen del tipo: sin cambios.
(() => {
  const KEY = 'tera';
  const S_TYPE = 'pkm:tera:type', S_DUR = 'pkm:tera:dur';
  let ns = null, pm = null, run = null, picker = null, pausedByUs = false;

  NX.css(`#nexus-tera-pick{position:fixed;inset:0;z-index:99990;display:flex;align-items:center;justify-content:center;background:rgba(4,8,20,.55)}
#nexus-tera-pick.hidden{display:none}
#nexus-tera-pick .nx-tp-box{width:min(520px,calc(100vw - 20px));box-sizing:border-box;padding:12px 14px;color:#fff;background:linear-gradient(#24407f,#152a5c);
  border:2px solid #f4f8ff;outline:2px solid #0b1838;border-radius:10px;box-shadow:inset 0 0 0 2px #5b83d6,0 6px 0 #0a1430;font:14px/1.3 var(--font,'Pixelify',system-ui,sans-serif)}
#nexus-tera-pick h3{margin:0 0 8px;color:#bff4ff;font-size:18px;display:flex;justify-content:space-between;align-items:center}
#nexus-tera-pick .nx-tp-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(92px,1fr));gap:6px}
#nexus-tera-pick button{font:inherit;font-size:13px;min-height:40px;border-radius:8px;border:2px solid rgba(255,255,255,.85);color:#fff;cursor:pointer;text-shadow:0 1px 0 rgba(0,0,0,.6)}
#nexus-tera-pick .nx-tp-x{background:#0b1838;min-height:34px;padding:0 12px}`);

  const fixedType = () => { const t = NX.store.get(S_TYPE, 'ask'); return pm && pm.TYPES.includes(t) ? t : null; };

  // ---------------------------------------------------------------- selector
  function pauseGame() {
    const G = ns.Game;
    if (G.state === 'playing' && typeof G.togglePause === 'function') { try { G.togglePause(); pausedByUs = G.state === 'paused'; } catch (_) { pausedByUs = false; } }
  }
  function resumeGame() {
    if (!pausedByUs) return;
    pausedByUs = false;
    const G = ns.Game;
    if (G.state === 'paused' && typeof G.togglePause === 'function') { try { G.togglePause(); } catch (_) { /* queda en pausa */ } }
  }
  function openPicker() {
    if (!picker) {
      picker = document.createElement('div');
      picker.id = 'nexus-tera-pick';
      picker.className = 'hidden';
      for (const ev of ['pointerdown', 'mousedown', 'touchstart', 'click', 'wheel']) picker.addEventListener(ev, (e) => e.stopPropagation());
      picker.addEventListener('click', (e) => {
        const b = e.target.closest('button[data-t]');
        if (b) { const t = b.dataset.t; closePicker(); if (t !== 'x') activate(t); }
        else if (e.target === picker) closePicker();
      });
      document.body.appendChild(picker);
    }
    picker.innerHTML = `<div class="nx-tp-box"><h3><span>Elige el tipo Tera</span><button type="button" class="nx-tp-x" data-t="x">Cancelar</button></h3>
      <div class="nx-tp-grid">${pm.TYPES.map((t) => `<button type="button" data-t="${t}" style="background:${NX.esc(pm.typeColor(t))}">${NX.esc(pm.typeName(t))}</button>`).join('')}</div></div>`;
    pauseGame();
    picker.classList.remove('hidden');
  }
  function closePicker() {
    if (picker) picker.classList.add('hidden');
    resumeGame();
  }
  const pickerOpen = () => !!picker && !picker.classList.contains('hidden');

  // ---------------------------------------------------------------- activación
  function press() {
    const p = run && run.p;
    if (!p || p.dead || run.used) return;
    const t = fixedType();
    if (t) activate(t); else openPicker();
  }
  function activate(type) {
    const p = run && run.p;
    if (!p || p.dead || run.used || !pm.TYPES.includes(type) || NX.me() !== p) return;
    const dur = Math.max(0, +NX.store.get(S_DUR, 0) || 0);
    pm.setMod(p, KEY, { prio: 10, mon(c) { c.types = [type]; c.tera = type; } });
    run.used = true;
    run.active = { type, t: dur || Infinity, dur, t0: performance.now(), col: pm.typeColor(type) };
    const col = run.active.col;
    pm.sfx('shiny');
    pm.kick(0.6);
    pm.flash(col, 0.45, 0.45);
    pm.bigText('¡Teracristalización!', col, 'Tipo Tera: ' + pm.typeName(type));
    try {
      ns.FX.ring(p.x, p.y, 6, 80, '#ffffff', 0.5, 4);
      ns.FX.ring(p.x, p.y, 10, 120, col, 0.7, 5);
      ns.FX.burst(p.x, p.y - p.bodyH * 0.5, col, 24, 180);
      ns.FX.burst(p.x, p.y - p.bodyH * 0.5, '#e8fbff', 14, 140);
    } catch (_) { /* sin efectos */ }
  }
  function revert(quiet) {
    const p = run && run.p;
    if (!run || !run.active) return;
    run.active = null;
    if (!p) return;
    pm.clearMod(p, KEY);
    if (!quiet) {
      try { ns.FX.burst(p.x, p.y - p.bodyH * 0.5, '#e8fbff', 16, 150); } catch (_) { /* nada */ }
      NX.toast('La Teracristalización terminó');
    }
  }
  function tick(dt, p) {
    if (!run || run.p !== p || !run.active) return;
    run.active.t -= dt;
    if (run.active.t <= 0 || !pm.hasMod(p, KEY)) revert();
  }

  // ---------------------------------------------------------------- cristal
  function shard(ctx, x, y, s, rot, col, a) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.globalAlpha = a;
    ctx.beginPath();
    ctx.moveTo(0, -s * 1.6);
    ctx.lineTo(s * 0.7, 0);
    ctx.lineTo(0, s * 1.1);
    ctx.lineTo(-s * 0.7, 0);
    ctx.closePath();
    ctx.fillStyle = col;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255,255,255,.9)';
    ctx.stroke();
    ctx.globalAlpha = a * 0.8;
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    ctx.beginPath();
    ctx.moveTo(0, -s * 1.6);
    ctx.lineTo(s * 0.25, -s * 0.2);
    ctx.lineTo(-s * 0.3, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  function drawCrystal(ctx, p, front) {
    const a = run.active, now = performance.now() / 1000, col = a.col;
    const k = Math.min(1, (performance.now() - a.t0) / 450);
    const N = 8, rx = p.r * 1.7, ry = p.r * 0.75;
    if (!front) pm.ellipseGlow(ctx, p.x, p.y, p.r * 2.2, p.r * 1, col, 0.45 * k);
    for (let i = 0; i < N; i++) {
      const ang = now * 0.8 + (i * Math.PI * 2) / N;
      const isFront = Math.sin(ang) > 0;
      if (isFront !== front) continue;
      const x = p.x + Math.cos(ang) * rx, y = p.y - p.bodyH * (0.25 + 0.35 * ((i % 3) / 2)) + Math.sin(ang) * ry;
      shard(ctx, x, y, 3.2 + (i % 3), Math.cos(ang) * 0.4, col, (front ? 0.75 : 0.5) * k);
    }
    if (!front) return;
    // Joya Tera sobre la cabeza.
    const hx = p.x, hy = p.y - p.bodyH - 13 + Math.sin(now * 2.5) * 1.5;
    ctx.save();
    ctx.globalAlpha = k;
    ctx.translate(hx, hy);
    ctx.beginPath();
    ctx.moveTo(-9, -2); ctx.lineTo(-5, -8); ctx.lineTo(5, -8); ctx.lineTo(9, -2); ctx.lineTo(0, 8); ctx.closePath();
    ctx.fillStyle = col;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(11,24,56,.9)';
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.9)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-9, -2); ctx.lineTo(9, -2); ctx.moveTo(-5, -8); ctx.lineTo(-2, -2); ctx.lineTo(0, 8); ctx.moveTo(5, -8); ctx.lineTo(2, -2); ctx.lineTo(0, 8);
    ctx.stroke();
    ctx.globalAlpha = k * (0.5 + 0.5 * Math.sin(now * 4));
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-4, -6, 2, 2);
    ctx.restore();
  }
  function drawables() {
    const p = run && run.p;
    if (!p || !run.active || p !== NX.me()) return null;
    return [{ y: p.y - 0.4, draw: (ctx) => drawCrystal(ctx, p, false) }, { y: p.y + 0.4, draw: (ctx) => drawCrystal(ctx, p, true) }];
  }

  NX.feature({
    key: KEY,
    label: 'Teracristalización',
    needs: (n) => !!NX.pm && NX.featureList().some((f) => f.key === 'pokemech' && f.status === 'ok') && n.Game && n.Types,
    setup(n) {
      ns = n;
      pm = NX.pm;
      pm.onRun('start', (p) => { run = { p, used: false, active: null }; });
      pm.onRun('end', () => { run = null; if (pickerOpen()) closePicker(); pausedByUs = false; });
      pm.onTick(KEY, tick);
      pm.drawables(KEY, drawables);
      pm.button({
        id: KEY, feat: KEY, label: 'TERA', title: 'Teracristalización', key: 'T', keyCode: 'KeyT', color: '#7fe8ff',
        state() {
          const p = run && run.p;
          if (!p || p !== NX.me() || !pm.allowed()) return null;
          if (run.active) return { show: true, color: run.active.col, active: run.active.dur ? NX.clamp(run.active.t / run.active.dur, 0, 1) : 1 };
          if (run.used) return null;
          const t = fixedType();
          return { show: true, ready: !p.dead, frac: 1, color: t ? pm.typeColor(t) : '#7fe8ff' };
        },
        run: press,
      });
      NX.keys.bind((e) => e.key === 'Escape' && pickerOpen(), () => { closePicker(); return true; });
      NX.every(500, () => { if (run && run.active && !NX.isOn(KEY)) revert(true); }, { when: 'run', key: KEY });
    },
  });

  NX.settings.section({
    key: KEY,
    tab: 'Partida',
    title: 'Teracristalización',
    keywords: 'tera teracristal teracristalizacion tipo cristal joya',
    render(el) {
      el.appendChild(NX.ui.toggle('Activado', 'on:' + KEY, true));
      const types = (NX.pm && NX.pm.TYPES) || [];
      el.appendChild(NX.ui.select('Tipo Tera', S_TYPE, [['ask', 'Elegir al activarla'], ...types.map((t) => [t, NX.pm.typeName(t)])], 'ask'));
      el.appendChild(NX.ui.select('Duración', S_DUR, [['0', 'Toda la partida'], ['30', '30 s'], ['60', '60 s'], ['120', '2 min']], '0'));
      el.appendChild(NX.ui.note('T o el botón TERA, una vez por partida. El Pokémon pasa a ser del tipo Tera puro: cambia el daño que recibe, los movimientos de ese tipo ganan el bono de tipo único (los del tipo original lo pierden si no coinciden) y las cartas de subida de nivel pueden traer movimientos del tipo Tera. Las mejoras permanentes no cambian.'));
    },
  });
})();
