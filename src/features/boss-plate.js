// HUD rediseñado por piezas: placa de vida del jefe con estela, panel de
// reloj (tiempo, bioma, derrotados, monedas, tickets) y colores de las barras
// de vida, jefe y experiencia. No se reescribe el HUD del juego: se ocultan
// solo las piezas que se reemplazan, dentro de la llamada a HUD.draw.
//
// Cómo se ocultan sin depender de coordenadas ni de la escala del HUD:
// HUD.draw empieza llamando a Touch.clearButtons y, ya cerca del final, a
// Events.drawHud. Entre esas dos llamadas está todo lo que interesa: la tira
// de experiencia, la barra de vida, el reloj, la línea de bioma y la barra
// del jefe. En esa ventana, la primera llamada a EnemyMgr.all() es la que
// busca al jefe (se le quita el jefe para que no dibuje su barra) y los
// fillText / fillRect del contexto se filtran por posición en el HUD.
(() => {
  const PLAYING = new Set(['playing', 'held', 'levelup', 'choice']);
  const P = CanvasRenderingContext2D.prototype;
  const HP_W = 168; // ancho de la barra de vida del juego, en px del HUD

  // Opciones en memoria: se releen al cambiar y cada segundo.
  const opt = {};
  const readOpts = () => {
    opt.plate = NX.isOn('bossplate');
    opt.hideBar = opt.plate && NX.store.get('bossplate:hide', true) !== false;
    opt.nums = NX.store.get('bossplate:nums', true) !== false;
    opt.clock = NX.isOn('clockpanel');
    opt.hideClock = opt.clock && NX.store.get('clockpanel:hide', true) !== false;
    opt.colors = NX.isOn('hudcolors');
    opt.hp = opt.colors ? NX.store.get('hudcolors:hp', 'game') : 'game';
    opt.boss = opt.colors ? NX.store.get('hudcolors:boss', 'game') : 'game';
    opt.xp = opt.colors ? NX.store.get('hudcolors:xp', 'game') : 'game';
    opt.xpNum = opt.colors && !!NX.store.get('hudcolors:xpnum', false);
  };
  readOpts();
  setInterval(readOpts, 1000);

  const BOSS_COL = { game: '#ffcb3d', red: '#ff3048', purple: '#b06bff', cyan: '#4fd1ff' };
  const XP_COL = { green: ['#7dffb0', '#2fbf6a'], gold: ['#fff1a6', '#f0a020'], white: ['#ffffff', '#b9cbf0'] };
  const hpColor = (frac) => {
    if (opt.hp === 'green') return '#4fd17a';
    if (opt.hp === 'blue') return '#4f9dff';
    // Degradado según la vida: verde lleno, amarillo a la mitad, rojo al final.
    return `hsl(${Math.round(NX.clamp(frac, 0, 1) * 120)},78%,52%)`;
  };

  // ---- ventana del cuerpo del HUD del juego
  let hooked = false, depth = 0, body = false, bossFind = false, plateShown = false, clockShown = false;
  const patched = new WeakSet();

  function patchCtx(ctx) {
    if (patched.has(ctx)) return;
    patched.add(ctx);
    Object.defineProperty(ctx, 'fillRect', {
      configurable: true, writable: true,
      value: function (x, y, w, h) {
        if (body && opt.colors) {
          const fs = this.fillStyle;
          let c = null;
          if (h === 11 && fs === '#ff5f6d' && opt.hp !== 'game') c = hpColor(w / HP_W);
          else if (h === 12 && fs === '#ffcb3d' && opt.boss !== 'game') c = BOSS_COL[opt.boss];
          else if (y === 0 && h === 7 && typeof fs !== 'string' && XP_COL[opt.xp]) {
            const g = P.createLinearGradient.call(this, 0, 0, Math.max(1, w), 0);
            g.addColorStop(0, XP_COL[opt.xp][0]);
            g.addColorStop(1, XP_COL[opt.xp][1]);
            c = g;
          }
          if (c) {
            this.fillStyle = c;
            try { return P.fillRect.call(this, x, y, w, h); } finally { this.fillStyle = fs; }
          }
        }
        return P.fillRect.call(this, x, y, w, h);
      },
    });
    Object.defineProperty(ctx, 'fillText', {
      configurable: true, writable: true,
      value: function (s, x, y) {
        // Reloj (y = 42) y línea de bioma, derrotados y monedas (y = 58).
        if (body && opt.hideClock && clockShown && this.textAlign === 'center' &&
          ((y === 42 && /^\d+:\d\d(:\d\d)?$/.test(s)) || (y === 58 && String(s).indexOf('·') >= 0))) return;
        return P.fillText.apply(this, arguments);
      },
    });
  }
  function hook(ns) {
    if (hooked) return;
    hooked = true;
    const d = ns.HUD.draw;
    ns.HUD.draw = function (ctx) {
      if (ctx && typeof ctx.fillRect === 'function') patchCtx(ctx);
      depth++;
      try { return d.apply(this, arguments); } finally {
        if (--depth <= 0) { depth = 0; body = false; bossFind = false; }
      }
    };
    const T = ns.Touch, cb = T.clearButtons;
    T.clearButtons = function () {
      if (depth) { body = true; bossFind = true; }
      return cb.apply(this, arguments);
    };
    const E = ns.Events, dh = E.drawHud;
    E.drawHud = function () {
      body = false;
      bossFind = false;
      return dh.apply(this, arguments);
    };
    const M = ns.EnemyMgr, all = M.all;
    M.all = function () {
      const r = all.apply(this, arguments);
      if (bossFind) {
        bossFind = false;
        if (opt.hideBar && plateShown && Array.isArray(r)) return r.filter((e) => !e.boss);
      }
      return r;
    };
  }

  const needs = (ns) => ns.HUD && typeof ns.HUD.draw === 'function' && ns.Touch && typeof ns.Touch.clearButtons === 'function' &&
    ns.Events && typeof ns.Events.drawHud === 'function' && ns.EnemyMgr && typeof ns.EnemyMgr.all === 'function' &&
    ns.Game && NX.featureList().some((f) => f.key === 'hud' && f.status === 'ok');

  NX.css(`.nx-hudcard{position:fixed;left:50%;z-index:15;pointer-events:none;transform-origin:50% 0;
  font:13px/1.25 var(--font,'Pixelify',system-ui,sans-serif);color:#f4f8ff;text-shadow:1px 1px 0 #0a1430}
.nx-hudcard.hidden{display:none}
#nexus-bossplate{width:min(440px,72vw);padding:5px 10px 7px;border-radius:10px;background:linear-gradient(rgba(36,20,24,.9),rgba(16,10,18,.9));
  border:2px solid #f4f8ff;outline:2px solid #0b1838;box-shadow:inset 0 0 0 2px var(--nx-bc,#ffcb3d),0 4px 0 rgba(10,20,48,.8)}
#nexus-bossplate .nx-bp-top{display:flex;align-items:baseline;gap:8px;margin-bottom:4px;white-space:nowrap}
#nexus-bossplate .nx-bp-tag{font-size:10px;padding:0 6px;border-radius:7px;background:var(--nx-bc,#ffcb3d);color:#1a0f08;text-shadow:none}
#nexus-bossplate .nx-bp-name{font-size:15px;color:#fff;overflow:hidden;text-overflow:ellipsis}
#nexus-bossplate .nx-bp-num{margin-left:auto;font-size:11px;color:#ffe9b0}
#nexus-bossplate .nx-bp-bar{position:relative;height:12px;border-radius:6px;background:rgba(0,0,0,.6);overflow:hidden;box-shadow:inset 0 0 0 1px rgba(255,255,255,.18)}
#nexus-bossplate .nx-bp-bar i{position:absolute;left:0;top:0;bottom:0;border-radius:6px}
#nexus-bossplate .nx-bp-trail{background:#fff3d6;transition:width .1s linear}
#nexus-bossplate .nx-bp-fill{background:linear-gradient(#fff6c2,var(--nx-bc,#ffcb3d) 45%,var(--nx-bc2,#e09a10));transition:width .1s linear}
#nexus-bossplate.reset .nx-bp-trail,#nexus-bossplate.reset .nx-bp-fill{transition:none}
#nexus-clock{top:6px;min-width:190px;padding:3px 14px 5px;border-radius:10px;text-align:center;background:linear-gradient(rgba(36,64,127,.88),rgba(21,42,92,.88));
  border:2px solid #f4f8ff;outline:2px solid #0b1838;box-shadow:inset 0 0 0 2px #5b83d6,0 4px 0 rgba(10,20,48,.8)}
#nexus-clock .nx-ck-t{font-size:22px;line-height:1.1;color:#fff}
#nexus-clock .nx-ck-s{font-size:11px;color:#cfe0ff;white-space:nowrap}
#nexus-clock .nx-ck-s b{color:#ffd23f;font-weight:inherit}
#nexus-clock .nx-ck-xp{height:3px;margin-top:3px;border-radius:2px;background:rgba(0,0,0,.45);overflow:hidden}
#nexus-clock .nx-ck-xp i{display:block;height:100%;background:linear-gradient(90deg,#4fd1ff,#a98bff)}`);

  // ---- placa del jefe y panel de reloj (DOM, a 10 Hz)
  let plate = null, clock = null, built = false, lastBits = '';
  let curBoss = null, trailPct = 100, lastDrop = 0, lastPct = 100;
  const set = (el, prop, v) => { if (el[prop] !== v) el[prop] = v; };
  const style = (el, prop, v) => { if (el.style[prop] !== v) el.style[prop] = v; };
  const num = (n) => Math.max(0, Math.round(+n || 0)).toLocaleString('es-VE');

  function build(ns) {
    if (built) return;
    built = true;
    NX.onReady(() => {
      plate = document.createElement('div');
      plate.id = 'nexus-bossplate';
      plate.className = 'nx-hudcard hidden';
      plate.innerHTML = '<div class="nx-bp-top"><span class="nx-bp-tag"></span><span class="nx-bp-name"></span><span class="nx-bp-num"></span></div>' +
        '<div class="nx-bp-bar"><i class="nx-bp-trail"></i><i class="nx-bp-fill"></i></div>';
      document.body.appendChild(plate);
      clock = document.createElement('div');
      clock.id = 'nexus-clock';
      clock.className = 'nx-hudcard hidden';
      clock.innerHTML = '<div class="nx-ck-t"></div><div class="nx-ck-s"></div><div class="nx-ck-xp"><i></i></div>';
      document.body.appendChild(clock);
      let last = 0;
      const loop = (now) => {
        requestAnimationFrame(loop);
        if (now - last < 100) return;
        last = now;
        try { update(ns); } catch (err) { NX.trip(opt.plate ? 'bossplate' : 'clockpanel', err); }
      };
      requestAnimationFrame(loop);
    });
  }

  function update(ns) {
    const p = NX.me(), st = ns.Game.state;
    const live = !!p && PLAYING.has(st);
    const k = NX.hudK ? NX.hudK() : 1;

    // Panel de reloj.
    const showClock = live && opt.clock;
    clockShown = showClock;
    clock.classList.toggle('hidden', !showClock);
    if (showClock) {
      style(clock, 'transform', `translateX(-50%) scale(${k})`);
      const t = ns.Game.st && ns.Game.st.time;
      set(clock.firstChild, 'textContent', ns.U && ns.U.mmss ? ns.U.mmss(t || 0) : NX.fmtTime(t));
      let biome = '';
      try { biome = ns.World && ns.World.biomeName ? String(ns.World.biomeName()) : ''; } catch (_) { biome = ''; }
      const bits = [];
      if (biome) bits.push(NX.esc(biome));
      bits.push(`Nv. <b>${num(p.level)}</b>`);
      bits.push(`<b>${num(p.kills)}</b> derrotados`);
      bits.push(`<b>${num(p.coins)}</b> monedas`);
      if (p.t1 > 0) bits.push(`<b>${num(p.t1)}</b> ticket${p.t1 === 1 ? '' : 's'}`);
      if (p.t10 > 0) bits.push(`<b>${num(p.t10)}</b> x10`);
      if (p.candy > 0) bits.push(`<b>${num(p.candy)}</b> caramelos`);
      const html = bits.join(' · ');
      if (html !== lastBits) { lastBits = html; clock.children[1].innerHTML = html; }
      const xp = p.xpNext > 0 ? NX.clamp(p.xp / p.xpNext, 0, 1) : 0;
      style(clock.children[2].firstChild, 'width', (xp * 100).toFixed(1) + '%');
    }

    // Placa del jefe.
    let boss = null, extra = 0;
    if (live && opt.plate && ns.EnemyMgr && ns.EnemyMgr.all) {
      for (const e of ns.EnemyMgr.all()) {
        if (!e || !e.boss || e.dead) continue;
        if (!boss) boss = e; else extra++;
      }
    }
    plateShown = !!boss;
    plate.classList.toggle('hidden', !boss);
    if (!boss) { curBoss = null; return; }
    const frac = boss.maxHp > 0 ? NX.clamp(boss.hp / boss.maxHp, 0, 1) : 0;
    const pct = frac * 100;
    const fresh = boss !== curBoss;
    // Estela: guarda la vida previa un momento tras cada golpe y luego baja.
    const now = performance.now();
    if (fresh) { curBoss = boss; trailPct = lastPct = pct; plate.classList.add('reset'); }
    if (pct < lastPct - 0.01) lastDrop = now;
    lastPct = pct;
    if (pct >= trailPct) trailPct = pct;
    else if (now - lastDrop > 350) trailPct = Math.max(pct, trailPct - Math.max(1.2, (trailPct - pct) * 0.3));
    const col = BOSS_COL[opt.boss] || BOSS_COL.game;
    plate.style.setProperty('--nx-bc', col);
    // Debajo del reloj, del aviso de próximo jefe y del texto de la arena.
    let top = 64 * k;
    if (clockShown) top = Math.max(top, clock.getBoundingClientRect().bottom + 6);
    const pill = document.getElementById('nexus-boss');
    if (pill && !pill.classList.contains('hidden')) top = Math.max(top, pill.getBoundingClientRect().bottom + 6);
    if (ns.Rift && ns.Rift.inArena) top += 22 * k;
    style(plate, 'top', Math.round(top) + 'px');
    style(plate, 'transform', `translateX(-50%) scale(${k})`);
    const tag = boss.judge ? 'JUICIO' : boss.legend ? 'LEGENDARIO' : 'JEFE';
    set(plate.querySelector('.nx-bp-tag'), 'textContent', tag);
    set(plate.querySelector('.nx-bp-name'), 'textContent', String(boss.name || '¿?') + (boss.shiny ? ' (shiny)' : '') + (extra ? ` +${extra}` : ''));
    set(plate.querySelector('.nx-bp-num'), 'textContent', opt.nums ? `${num(boss.hp)} / ${num(boss.maxHp)} · ${Math.ceil(pct)} %` : `${Math.ceil(pct)} %`);
    style(plate.querySelector('.nx-bp-fill'), 'width', pct.toFixed(2) + '%');
    style(plate.querySelector('.nx-bp-trail'), 'width', trailPct.toFixed(2) + '%');
    if (fresh) requestAnimationFrame(() => plate.classList.remove('reset'));
  }

  // ---- registro
  NX.feature({
    key: 'bossplate',
    label: 'Placa del jefe',
    needs,
    setup(ns) { hook(ns); build(ns); },
  });
  NX.feature({
    key: 'clockpanel',
    label: 'Panel de reloj',
    needs: (ns) => needs(ns) && ns.World,
    setup(ns) { hook(ns); build(ns); },
  });
  NX.feature({
    key: 'hudcolors',
    label: 'Colores del HUD',
    needs,
    setup(ns) {
      hook(ns);
      // Nivel y porcentaje de experiencia sobre la tira del juego, cuando el
      // panel de reloj no lo muestra ya.
      NX.hudLayers.push({
        key: 'hudcolors',
        over(ctx, w, h, pl) {
          if (!opt.xpNum || clockShown || !pl || !(pl.xpNext > 0)) return;
          const t = `Nv. ${pl.level} · ${Math.floor(NX.clamp(pl.xp / pl.xpNext, 0, 1) * 100)} %`;
          ctx.font = '700 10px Pixelify,"Segoe UI",sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'alphabetic';
          ctx.lineWidth = 3;
          ctx.strokeStyle = 'rgba(0,0,0,.8)';
          ctx.strokeText(t, w / 2, 18);
          ctx.fillStyle = '#e6f3ff';
          ctx.fillText(t, w / 2, 18);
        },
      });
    },
  });

  NX.settings.section({
    key: 'bossplate',
    title: 'Placa del jefe',
    tab: 'HUD',
    keywords: 'jefe vida barra boss legendario',
    render(el) {
      el.appendChild(NX.ui.toggle('Activado', 'on:bossplate', true, readOpts));
      el.appendChild(NX.ui.toggle('Ocultar la barra del jefe del juego', 'bossplate:hide', true, readOpts));
      el.appendChild(NX.ui.toggle('Vida en números', 'bossplate:nums', true, readOpts));
    },
  });
  NX.settings.section({
    key: 'clockpanel',
    title: 'Panel de reloj',
    tab: 'HUD',
    keywords: 'reloj tiempo bioma monedas tickets derrotados',
    render(el) {
      el.appendChild(NX.ui.toggle('Activado', 'on:clockpanel', true, readOpts));
      el.appendChild(NX.ui.toggle('Ocultar el reloj del juego', 'clockpanel:hide', true, readOpts));
      el.appendChild(NX.ui.note('Tiempo, bioma, nivel, derrotados, monedas y tickets en una tarjeta arriba al centro.'));
    },
  });
  NX.settings.section({
    key: 'hudcolors',
    title: 'Colores del HUD',
    tab: 'HUD',
    keywords: 'color barra vida experiencia jefe',
    render(el) {
      el.appendChild(NX.ui.toggle('Activado', 'on:hudcolors', true, readOpts));
      el.appendChild(NX.ui.select('Barra de vida', 'hudcolors:hp', [['game', 'Roja (juego)'], ['grad', 'Según la vida'], ['green', 'Verde'], ['blue', 'Azul']], 'game', readOpts));
      el.appendChild(NX.ui.select('Barra del jefe', 'hudcolors:boss', [['game', 'Dorada (juego)'], ['red', 'Roja'], ['purple', 'Morada'], ['cyan', 'Celeste']], 'game', readOpts));
      el.appendChild(NX.ui.select('Barra de experiencia', 'hudcolors:xp', [['game', 'Azul y violeta (juego)'], ['green', 'Verde'], ['gold', 'Dorada'], ['white', 'Blanca']], 'game', readOpts));
      el.appendChild(NX.ui.toggle('Nivel y porcentaje de experiencia', 'hudcolors:xpnum', false, readOpts));
    },
  });
})();
