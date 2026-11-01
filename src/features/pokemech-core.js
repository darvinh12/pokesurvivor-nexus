// Base común de las mecánicas Pokémon de la edición (megaevolución, Dinamax,
// Teracristalización, movimientos Z, compañero y raids). Expone NX.pm con:
//  - Transformaciones del jugador por capas (pm.setMod / pm.clearMod): cada
//    capa puede cambiar el mon (clon con otros tipos o estadísticas), los
//    multiplicadores de ataque, velocidad y vida, el tamaño, el área de los
//    ataques y el sprite. Todo se aplica por proporción sobre lo que ya tenga
//    el jugador, así que convive con lo que el juego cambie entretanto
//    (subidas de nivel, objetos) y al quitar la última capa queda como estaba.
//  - Un paso por cuadro de juego (pm.onTick), colgado de Combat.tick: solo
//    corre en partida, sin pausa, y solo para el jugador local.
//  - Dibujables del mundo (pm.drawables), que entran en el orden por
//    profundidad del juego a través de Events.drawables.
//  - Botones del HUD (pm.button) con anillo de carga, tecla, toque
//    (Touch.addButton) y clic de mouse. pm.actions() lista las acciones
//    activables para que el menú táctil pueda sumarlas.
//  - Cargas por daño hecho (pm.charge), que se ajustan al daño medio de la
//    partida para que llenar la barra tarde más o menos lo mismo siempre.
// Las envolturas se instalan una vez y pasan de largo sin mecánicas activas.
// Al terminar cada partida se quitan todas las capas del jugador.
(() => {
  const KEY = 'pokemech';
  const pm = (NX.pm = {});
  let ns = null;
  const ALL_TYPES = ['normal', 'fire', 'water', 'grass', 'electric', 'ice', 'fighting', 'poison', 'ground', 'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy'];
  pm.TYPES = ALL_TYPES;
  pm.typeColor = (t) => ((ns && ns.U && ns.U.TYPE_COLOR) || {})[t] || '#c9d6ea';
  pm.typeName = (t) => { try { return NX.gd ? NX.gd.typeName(t) : t; } catch (_) { return t; } };
  pm.allowed = () => !!ns && !(ns.Coop && ns.Coop.active);
  pm.playing = () => !!ns && ns.Game.state === 'playing' && NX.inRun();
  pm.time = () => (ns && ns.Game.st && ns.Game.st.time) || 0;
  pm.sfx = (name) => { try { ns.Audio.sfx(name); } catch (_) { /* sin sonido */ } };
  pm.kick = (k) => { try { ns.Camera.kick(k); } catch (_) { /* sin sacudida */ } };
  pm.say = (text, t) => { try { ns.Spawner.say(text, t || 2.8, true); } catch (_) { NX.toast(text); } };

  // ---------------------------------------------------------------- capas del jugador
  const bodies = new WeakMap();
  const body = (p) => {
    let s = bodies.get(p);
    if (!s) {
      s = { mods: new Map(), orig: p.mon, clone: null, atk: 1, spd: 1, hp: 1, size: 1, anim: p.anim, animK: 1, sprite: null };
      bodies.set(p, s);
    }
    return s;
  };
  const prod = (s, k) => { let v = 1; for (const m of s.mods.values()) if (typeof m[k] === 'number') v *= m[k]; return v; };

  function apply(p) {
    const s = body(p), S = ns.Sprites;
    // Mon: si el juego lo cambió (evolución), ese pasa a ser el original.
    if (p.mon !== s.clone) s.orig = p.mon;
    // Se aplican de menor a mayor prioridad (la Teracristalización va al final).
    const monMods = [...s.mods.values()].filter((m) => typeof m.mon === 'function').sort((a, b) => (a.prio || 0) - (b.prio || 0));
    if (monMods.length && s.orig) {
      const c = Object.assign({}, s.orig);
      c.types = (s.orig.types || []).slice();
      for (const m of monMods) m.mon(c, s.orig);
      s.clone = c;
      p.mon = c;
    } else {
      if (s.clone && p.mon === s.clone) p.mon = s.orig;
      s.clone = null;
    }
    // Ataque, velocidad y vida (la vida conserva la proporción).
    const atk = prod(s, 'atk'), spd = prod(s, 'spd'), hp = prod(s, 'hp');
    if (atk !== s.atk) { p.baseAtk *= atk / s.atk; s.atk = atk; }
    if (spd !== s.spd) { p.baseSpd *= spd / s.spd; s.spd = spd; }
    if (hp !== s.hp) {
      const k = hp / s.hp;
      p.maxHp = Math.max(1, Math.round(p.maxHp * k));
      p.hp = Math.min(p.maxHp, p.hp * k);
      s.hp = hp;
    }
    // Tamaño y sprite. El animador puede ser otro si el juego lo cambió.
    if (p.anim !== s.anim) { s.anim = p.anim; s.animK = 1; s.sprite = null; }
    let sprite = null;
    for (const m of s.mods.values()) if (m.sprite) sprite = m.sprite;
    const size = prod(s, 'size');
    const curDex = s.sprite ? s.sprite.dex : p.dex;
    const newDex = sprite ? sprite.dex : p.dex;
    const spriteK = (d) => (d === p.dex ? 1 : (S.playerScale(d) || 1) / (S.playerScale(p.dex) || 1));
    const animK = size * spriteK(newDex);
    const swap = curDex !== newDex || (s.sprite && sprite && !!s.sprite.shiny !== !!sprite.shiny);
    if (animK !== s.animK || swap) {
      const oldBH = S.bodyHeight(curDex, p.anim.scale);
      p.anim.scale *= animK / s.animK;
      s.animK = animK;
      if (swap) {
        p.anim.dex = newDex;
        p.anim.shiny = sprite ? !!sprite.shiny && S.hasShiny(newDex) : !!p.shiny;
        try { p.anim._start(p.anim.base || 'Idle', false); } catch (_) { p.anim.frame = 0; p.anim.t = 0; }
      }
      const newBH = S.bodyHeight(newDex, p.anim.scale);
      if (oldBH > 0 && newBH > 0) p.bodyH *= newBH / oldBH;
    }
    if (size !== s.size) {
      p.scale *= size / s.size;
      p.r *= size / s.size;
      s.size = size;
    }
    s.sprite = sprite ? { dex: sprite.dex, shiny: !!sprite.shiny } : null;
  }

  // mod: { mon(clone, orig), prio, atk, spd, hp, size, area, sprite: { dex, shiny }, form: true }
  pm.setMod = (p, key, mod) => { const s = body(p); s.mods.delete(key); s.mods.set(key, mod); apply(p); };
  pm.clearMod = (p, key) => { const s = bodies.get(p); if (!s || !s.mods.has(key)) return; s.mods.delete(key); apply(p); };
  pm.clearAll = (p) => { const s = bodies.get(p); if (!s || !s.mods.size) return; s.mods.clear(); apply(p); };
  pm.hasMod = (p, key) => { const s = bodies.get(p); return !!s && s.mods.has(key); };
  // ¿Alguna forma que cambia el tamaño o el sprite (mega, Dinamax) activa?
  pm.formActive = (p) => { const s = bodies.get(p); if (!s) return null; for (const [k, m] of s.mods) if (m.form) return k; return null; };
  pm.areaK = (p) => { const s = bodies.get(p); return s ? prod(s, 'area') : 1; };
  pm.origMon = (p) => { const s = bodies.get(p); return s && p.mon === s.clone ? s.orig : p.mon; };

  // ---------------------------------------------------------------- paso por cuadro y dibujables
  const tickers = [];
  pm.onTick = (key, fn) => tickers.push({ key, fn });
  const drawers = [];
  pm.drawables = (key, fn) => drawers.push({ key, fn });
  const runSubs = { start: [], end: [] };
  pm.onRun = (ev, fn) => runSubs[ev].push(fn);
  const AREA_FIELDS = ['radius', 'size', 'width', 'range'];

  // ---------------------------------------------------------------- cargas
  // sec: segundos de daño medio que hacen falta; min: daño mínimo.
  pm.charge = (sec, min = 250) => ({
    v: 0, need: min, last: null, sec, min,
    reset() { this.v = 0; this.last = null; this.need = this.min; },
    update(p) {
      const d = p.dmgDealt || 0;
      if (this.last == null || d < this.last) this.last = d;
      const gain = d - this.last;
      this.last = d;
      if (this.v >= this.need) return;
      this.need = Math.max(this.min, (this.sec * d) / Math.max(20, pm.time()));
      this.v = Math.min(this.need, this.v + gain);
    },
    get frac() { return this.need > 0 ? NX.clamp(this.v / this.need, 0, 1) : 0; },
    get full() { return this.v >= this.need; },
    fill() { this.v = this.need; },
  });

  // ---------------------------------------------------------------- botones del HUD
  // def: { id, feat, label, key, keyCode, color, state() -> { show, ready, frac, active, text } | null, run() }
  const buttons = [];
  let rects = [], canvasEl = null;
  pm.button = (def) => {
    buttons.push(def);
    if (def.keyCode) {
      NX.keys.bind((e) => !e.altKey && !e.ctrlKey && !e.metaKey && e.code === def.keyCode && NX.isOn(KEY) && NX.isOn(def.feat) && pm.playing(),
        (e) => {
          const st = safeState(def);
          if (!st || !st.show) return false;
          if (!e.repeat) press(def);
          return true;
        });
    }
  };
  // Para pruebas: llena la barra de una mecánica (def.fill).
  pm.debugFill = (id) => { const b = buttons.find((x) => x.id === id); if (b && b.fill) b.fill(); return !!b; };
  const safeState = (b) => { try { return b.state(); } catch (err) { NX.trip(b.feat, err); return null; } };
  const press = (b) => { try { b.run(); } catch (err) { NX.trip(b.feat, err); } };
  // Para el menú táctil (mobile.js) u otros: acciones que se pueden activar ahora.
  pm.actions = () => buttons.filter((b) => NX.isOn(b.feat)).map((b) => {
    const st = safeState(b) || {};
    return { id: 'pm-' + b.id, label: b.title || b.label, feat: b.feat, kind: 'run', show: !!st.show, ready: !!st.ready, run: () => press(b) };
  });

  function drawButtons(ctx, W, H) {
    rects = [];
    if (!NX.store.get('pkm:hudBtns', true)) return;
    const T = ns.Touch, touch = !!(T && T.active);
    const list = [];
    for (const b of buttons) {
      if (!NX.isOn(b.feat)) continue;
      const st = safeState(b);
      if (st && st.show) list.push([b, st]);
    }
    if (!list.length) return;
    const R = touch ? 25 : 21, G = touch ? 14 : 12;
    const side = NX.store.get('pkm:hudSide', 'right');
    const x = side === 'left' ? 16 + R : W - 16 - R;
    const span = (list.length - 1) * (2 * R + G);
    let y = Math.round(H * 0.5 - span / 2) - 20;
    // Debajo del minimapa u otra ventana de Nexus que ocupe ese costado.
    const k = NX.hudK ? NX.hudK() : 1;
    for (const o of obstacles) {
      const ox = o.left / k, ow = o.width / k;
      if (x + R < ox || x - R > ox + ow) continue;
      y = Math.max(y, Math.round(o.bottom / k) + R + 10);
    }
    y = Math.min(y, Math.max(R + 8, H - 150 - span));
    const now = performance.now() / 1000;
    for (const [b, st] of list) {
      const col = st.color || b.color || '#ffd23f';
      ctx.save();
      // Fondo
      ctx.beginPath();
      ctx.arc(x, y, R, 0, Math.PI * 2);
      ctx.fillStyle = st.ready || st.active ? 'rgba(12,20,44,.92)' : 'rgba(12,20,44,.7)';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(232,238,248,.85)';
      ctx.stroke();
      // Anillo: carga, o tiempo restante si está activo.
      const f = st.active != null ? st.active : st.frac || 0;
      if (f > 0) {
        ctx.beginPath();
        ctx.arc(x, y, R - 4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * f);
        ctx.lineWidth = 4;
        ctx.strokeStyle = col;
        ctx.globalAlpha = st.ready ? 0.75 + 0.25 * Math.sin(now * 6) : 0.95;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      if (st.ready) {
        ctx.beginPath();
        ctx.arc(x, y, R + 3 + 2 * Math.sin(now * 5), 0, Math.PI * 2);
        ctx.strokeStyle = col;
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.6;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      ctx.font = `800 ${touch ? 12 : 11}px Pixelify,"Segoe UI",system-ui,sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(11,24,56,.95)';
      const label = st.text || b.label;
      ctx.strokeText(label, x, y);
      ctx.fillStyle = st.ready || st.active ? '#ffffff' : 'rgba(220,230,248,.75)';
      ctx.fillText(label, x, y);
      if (!touch && b.key) {
        ctx.font = '700 10px Pixelify,"Segoe UI",system-ui,sans-serif';
        const kx = side === 'left' ? x + R + 2 : x - R - 2;
        ctx.textAlign = side === 'left' ? 'left' : 'right';
        ctx.strokeText(b.key, kx, y + R - 4);
        ctx.fillStyle = '#ffd23f';
        ctx.fillText(b.key, kx, y + R - 4);
      }
      ctx.restore();
      rects.push({ b, x: x - R, y: y - R, w: 2 * R, h: 2 * R });
      if (T && typeof T.addButton === 'function') { try { T.addButton(x - R, y - R, 2 * R, 2 * R, b.__tap || (b.__tap = () => { if (pm.playing()) press(b); }), 6); } catch (_) { /* sin toque */ } }
      y += 2 * R + G;
    }
  }

  // Ventanas de Nexus en la parte alta (minimapa), relativas al lienzo, a 4 Hz.
  let obstacles = [];
  NX.every(250, () => {
    if (!canvasEl || !NX.inRun()) return;
    const cr = canvasEl.getBoundingClientRect(), list = [];
    for (const id of ['nexus-map']) {
      const e = document.getElementById(id);
      if (!e || e.classList.contains('hidden') || getComputedStyle(e).display === 'none') continue;
      const r = e.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && r.top - cr.top < cr.height * 0.5) list.push({ left: r.left - cr.left, width: r.width, bottom: r.bottom - cr.top });
    }
    obstacles = list;
  }, { when: 'run', key: KEY, name: 'obstáculos' });

  // Clic de mouse sobre los botones (el toque lo maneja Touch.addButton).
  addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0 || !rects.length || !canvasEl || !pm.playing()) return;
    const cr = canvasEl.getBoundingClientRect(), k = NX.hudK ? NX.hudK() : 1;
    const hx = (e.clientX - cr.left) / k, hy = (e.clientY - cr.top) / k;
    for (const r of rects) {
      if (hx >= r.x && hx <= r.x + r.w && hy >= r.y && hy <= r.y + r.h) {
        e.preventDefault();
        e.stopImmediatePropagation();
        press(r.b);
        return;
      }
    }
  }, true);

  // ---------------------------------------------------------------- dibujo compartido
  pm.ellipseGlow = (ctx, x, y, rx, ry, color, alpha) => {
    ctx.save();
    ctx.globalAlpha = alpha;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rx);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  // Destello de pantalla (capa del HUD).
  let flash = null;
  pm.flash = (color, dur = 0.5, alpha = 0.55) => { flash = { color, dur, alpha, t0: performance.now() }; };
  // Texto grande centrado (capa del HUD).
  let bigText = null;
  pm.bigText = (text, color, sub, dur = 2.2) => { bigText = { text, color, sub, dur, t0: performance.now() }; };
  function drawOverlay(ctx, W, H) {
    const now = performance.now();
    if (flash) {
      const t = (now - flash.t0) / 1000 / flash.dur;
      if (t >= 1) flash = null;
      else {
        ctx.save();
        ctx.globalAlpha = flash.alpha * (1 - t);
        ctx.fillStyle = flash.color;
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
      }
    }
    if (bigText) {
      const t = (now - bigText.t0) / 1000;
      if (t >= bigText.dur) bigText = null;
      else {
        const a = Math.min(1, t * 5, (bigText.dur - t) * 3);
        const s = 1 + 0.25 * Math.max(0, 1 - t * 4);
        ctx.save();
        ctx.globalAlpha = a;
        ctx.translate(W / 2, H * 0.32);
        ctx.scale(s, s);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = '800 30px Pixelify,"Segoe UI",system-ui,sans-serif';
        ctx.lineWidth = 6;
        ctx.lineJoin = 'round';
        ctx.strokeStyle = 'rgba(11,24,56,.95)';
        ctx.strokeText(bigText.text, 0, 0);
        ctx.fillStyle = bigText.color || '#ffd23f';
        ctx.fillText(bigText.text, 0, 0);
        if (bigText.sub) {
          ctx.font = '700 15px Pixelify,"Segoe UI",system-ui,sans-serif';
          ctx.lineWidth = 4;
          ctx.strokeText(bigText.sub, 0, 28);
          ctx.fillStyle = '#ffffff';
          ctx.fillText(bigText.sub, 0, 28);
        }
        ctx.restore();
      }
    }
  }

  // ---------------------------------------------------------------- arranque
  NX.feature({
    key: KEY,
    label: 'Mecánicas Pokémon (base)',
    needs: (n) => n.Combat && typeof n.Combat.tick === 'function' && n.Events && typeof n.Events.drawables === 'function' &&
      n.Player && n.Sprites && typeof n.Sprites.playerScale === 'function' && typeof n.Sprites.bodyHeight === 'function' &&
      n.EnemyMgr && typeof n.EnemyMgr.queryCircle === 'function' && n.FX && n.Game,
    setup(n) {
      ns = n;
      const C = ns.Combat, tick = C.tick;
      C.tick = function (dt, pl) {
        const me = NX.me();
        if (!pl || pl !== me || !NX.isOn(KEY) || !pm.allowed()) return tick.apply(this, arguments);
        // Área de los ataques: se agranda solo mientras el juego los lanza.
        const k = pm.areaK(pl);
        let saved = null;
        if (k !== 1 && typeof pl.activeGroup === 'function') {
          saved = [];
          for (const m of pl.activeGroup() || []) {
            if (!m) continue;
            for (const f of AREA_FIELDS) if (typeof m[f] === 'number') { saved.push([m, f, m[f]]); m[f] *= k; }
          }
        }
        let r;
        try { r = tick.apply(this, arguments); } finally { if (saved) for (const [m, f, v] of saved) m[f] = v; }
        for (const t of tickers) {
          if (!NX.isOn(t.key)) continue;
          try { t.fn(dt, pl, ns); } catch (err) { NX.trip(t.key, err); }
        }
        return r;
      };
      const E = ns.Events, ed = E.drawables;
      E.drawables = function () {
        const out = ed.apply(this, arguments);
        if (!NX.isOn(KEY) || !NX.inRun() || !pm.allowed()) return out;
        let extra = null;
        for (const d of drawers) {
          if (!NX.isOn(d.key)) continue;
          let list = null;
          try { list = d.fn(ns); } catch (err) { NX.trip(d.key, err); }
          if (list && list.length) (extra || (extra = [])).push(...list);
        }
        return extra ? (Array.isArray(out) ? out.concat(extra) : extra) : out;
      };
      NX.hudLayers.push({
        key: KEY,
        over(ctx, w, h, pl) {
          canvasEl = ctx.canvas || canvasEl;
          if (!pl || pl !== NX.me() || !pm.allowed()) { rects = []; return; }
          drawOverlay(ctx, w, h);
          drawButtons(ctx, w, h);
        },
      });
      NX.runs.on('start', (p) => { for (const f of runSubs.start) { try { f(p, ns); } catch (err) { console.warn('[nexus] pokemech', err); } } });
      NX.runs.on('end', (p, how) => {
        for (const f of runSubs.end) { try { f(p, ns, how); } catch (err) { console.warn('[nexus] pokemech', err); } }
        try { pm.clearAll(p); } catch (err) { console.warn('[nexus] pokemech', err); }
        flash = null; bigText = null; rects = [];
      });
    },
  });

  NX.settings.section({
    key: KEY,
    tab: 'Partida',
    title: 'Mecánicas Pokémon',
    keywords: 'mega megaevolucion dinamax tera teracristal z compañero raid botones hud',
    render(el) {
      el.appendChild(NX.ui.toggle('Activado (base de megaevolución, Dinamax, Tera, Z, compañero y raids)', 'on:' + KEY, true));
      el.appendChild(NX.ui.toggle('Botones de las mecánicas en el HUD', 'pkm:hudBtns', true));
      el.appendChild(NX.ui.select('Lado de los botones', 'pkm:hudSide', [['right', 'Derecha'], ['left', 'Izquierda']], 'right'));
      el.appendChild(NX.ui.note('Teclas: G megaevolución, H Dinamax, T Teracristalización, Z movimiento Z. Los botones también responden al clic y al toque. Cada mecánica tiene su propia sección y se apaga por separado. En co-op no se activan.'));
    },
  });
})();
