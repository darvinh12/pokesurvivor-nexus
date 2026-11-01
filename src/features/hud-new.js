// HUD Nexus: el HUD rediseñado al estilo de PokeSurvivor Plus. Abajo, un
// bloque con el retrato del Pokémon, una barra de vida grande con estela, la
// barra de experiencia a lo ancho, los huecos de movimientos con enfriamiento
// y nivel, el objeto equipado y los estados activos. En co-op, tarjetas del
// equipo arriba a la izquierda. En pantallas táctiles, una variante compacta
// que respeta la posición de la barra del juego y deja libre el joystick.
//
// Cómo convive con el HUD del juego: mientras el juego dibuja su HUD se
// recortan (clip) solo las zonas que este módulo vuelve a dibujar (tira de
// experiencia, bloque de vida arriba a la izquierda con la lista co-op y barra
// de movimientos con el objeto), y sus botones de movimientos se descartan
// porque aquí se registran los propios con Touch.addButton. El reloj y la
// barra del jefe quedan a cargo de boss-plate.js (o del juego si está
// apagado), el clima, los orbes, las flechas y el botón de pausa siguen siendo
// del juego. Todo se dibuja en la capa "over" del núcleo, es decir, dentro de
// la escala de hud-scale.js.
// Adaptado de PokeSurvivor Plus (MIT): setupHud, replacedAreas, drawNewHud,
// drawPortrait, emotionFor, bar, pill y las tarjetas del equipo.
(() => {
  const KEY = 'hudnew';
  const INK = '#0b1838', EDGE = '#e8eef8', BOND = '#ff8ad8', GOLD = '#ffd23f';
  const FONT = (wt, s) => `${wt} ${s}px Pixelify,"Segoe UI",system-ui,sans-serif`;
  const F = new Map(); // fuentes ya armadas, por peso * 100 + tamaño
  const font = (wt, s) => { const k = wt * 100 + s; let f = F.get(k); if (!f) { f = FONT(wt, s); F.set(k, f); } return f; };
  const NUM = Array.from({ length: 100 }, (_, i) => String(i)); // textos de números chicos

  // ---- opciones (en memoria; se releen al cambiar y cada segundo)
  const opt = {};
  const readOpts = () => {
    opt.on = NX.isOn(KEY) && NX.store.get('hudnew:style', 'nexus') !== 'classic';
    opt.hpNum = NX.store.get('hudnew:hpnum', 'values');
    opt.portrait = NX.store.get('hudnew:portrait', true) !== false;
    opt.team = NX.store.get('hudnew:team', true) !== false;
    opt.cdNum = NX.store.get('hudnew:cdnum', true) !== false;
  };
  readOpts();
  NX.every(1000, readOpts, { key: KEY, name: 'opciones' });

  // Colores de "Colores del HUD" (boss-plate.js), si está cargado.
  const pal = () => NX.hudPalette || null;
  const hpCol = (frac) => { const p = pal(); return p ? p.hp(frac) : '#ff5f6d'; };

  // ---- dibujo básico
  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  // Caja con borde oscuro por fuera y borde claro por dentro.
  function frame(ctx, x, y, w, h, r, fill, edge, lw) {
    rr(ctx, x - 1.5, y - 1.5, w + 3, h + 3, r + 1.5);
    ctx.fillStyle = INK; ctx.fill();
    rr(ctx, x, y, w, h, r);
    ctx.fillStyle = fill; ctx.fill();
    ctx.lineWidth = lw || 2; ctx.strokeStyle = edge || EDGE; ctx.stroke();
  }
  function outlined(ctx, text, x, y, fill, lw) {
    ctx.lineWidth = lw || 3; ctx.strokeStyle = 'rgba(11,24,56,.9)'; ctx.lineJoin = 'round';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = fill;
    ctx.fillText(text, x, y);
  }
  // Ancho de texto con caché (los textos del HUD se repiten cuadro a cuadro).
  const widths = new Map(); // fuente -> (texto -> ancho)
  function textW(ctx, text, f) {
    let m = widths.get(f);
    if (!m) { m = new Map(); widths.set(f, m); }
    let w = m.get(text);
    if (w === undefined) {
      if (m.size > 300) m.clear();
      ctx.font = f;
      w = Math.ceil(ctx.measureText(text).width);
      m.set(text, w);
    }
    return w;
  }
  // Etiqueta redondeada; devuelve su ancho.
  function pill(ctx, x, y, text, fg, bg, edge, size) {
    size = size || 8;
    const f = font(700, size);
    const tw = textW(ctx, text, f) + 10, th = size + 5;
    rr(ctx, x, y, tw, th, th / 2);
    ctx.fillStyle = bg || INK; ctx.fill();
    ctx.lineWidth = 1.25; ctx.strokeStyle = edge || EDGE; ctx.stroke();
    ctx.font = f;
    ctx.fillStyle = fg || '#fff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + 5, y + th / 2 + 0.5);
    ctx.textBaseline = 'alphabetic';
    return tw;
  }
  // Barra con marco: fondo, relleno con brillo arriba y estela opcional.
  function bar(ctx, x, y, w, h, frac, col, back, trail) {
    rr(ctx, x - 1.5, y - 1.5, w + 3, h + 3, 3);
    ctx.fillStyle = INK; ctx.fill();
    ctx.fillStyle = back;
    ctx.fillRect(x, y, w, h);
    frac = frac > 0 ? (frac < 1 ? frac : 1) : 0;
    if (trail > frac) {
      ctx.fillStyle = 'rgba(255,236,190,.8)';
      ctx.fillRect(x + w * frac, y, w * (Math.min(1, trail) - frac), h);
    }
    const fw = Math.round(w * frac);
    if (fw > 0) {
      ctx.fillStyle = col;
      ctx.fillRect(x, y, fw, h);
      ctx.fillStyle = 'rgba(255,255,255,.28)';
      ctx.fillRect(x, y, fw, Math.max(1, Math.round(h * 0.28)));
      ctx.fillStyle = 'rgba(0,0,0,.18)';
      ctx.fillRect(x, y + h - Math.max(1, Math.round(h * 0.2)), fw, Math.max(1, Math.round(h * 0.2)));
    }
  }

  // ---- retratos con los sprites del propio juego
  // Primer cuadro de la animación (Idle, o Hurt / Faint para dolor y caído),
  // mirando abajo a la derecha, recortado a la silueta. Se cachea por Pokémon.
  const portraits = new Map();
  function portrait(ns, dex, shiny, skin, anim) {
    if (!dex) return null;
    // Clave numérica (sin crear textos por cuadro); con disfraz, de texto.
    const key = skin ? dex + '|' + (shiny ? 1 : 0) + '|' + skin + '|' + anim : dex * 8 + (shiny ? 4 : 0) + (anim === 'Idle' ? 0 : anim === 'Hurt' ? 1 : 2);
    let p = portraits.get(key);
    const now = performance.now();
    if (p && (p.c || p.bad || now < p.retry)) return p.c;
    if (!p) { p = { c: null, bad: false, retry: 0, tries: 0 }; portraits.set(key, p); }
    p.retry = now + 400;
    try {
      const meta = ns.SPRITE_META && ns.SPRITE_META[dex];
      const m = meta && meta.a && meta.a[anim];
      if (!m) { p.bad = true; return null; }
      const sh = ns.Sprites.sheet(dex, anim, !!shiny, skin || '');
      if (!sh || sh.failed) { if (++p.tries > 20) p.bad = true; return null; }
      const img = sh.img;
      if (!sh.ready || !img || !img.complete || !img.naturalWidth) return null;
      const rows = Math.max(1, Math.round(img.naturalHeight / m.h));
      const row = rows >= 8 ? 1 : 0;
      const col = anim === 'Idle' ? 0 : Math.max(0, (m.n || 1) - 1);
      const c = document.createElement('canvas');
      c.width = m.w; c.height = m.h;
      const g = c.getContext('2d');
      g.drawImage(img, col * m.w, row * m.h, m.w, m.h, 0, 0, m.w, m.h);
      // Recorte a la silueta (si el navegador deja leer los píxeles).
      let x0 = 0, y0 = 0, x1 = m.w - 1, y1 = m.h - 1;
      try {
        const d = g.getImageData(0, 0, m.w, m.h).data;
        x0 = m.w; y0 = m.h; x1 = -1; y1 = -1;
        for (let y = 0; y < m.h; y++) {
          for (let x = 0; x < m.w; x++) {
            if (d[(y * m.w + x) * 4 + 3] > 24) {
              if (x < x0) x0 = x; if (x > x1) x1 = x;
              if (y < y0) y0 = y; if (y > y1) y1 = y;
            }
          }
        }
        if (x1 < 0) { x0 = 0; y0 = 0; x1 = m.w - 1; y1 = m.h - 1; }
      } catch (_) { /* lienzo sin permiso de lectura: cuadro completo */ }
      const out = document.createElement('canvas');
      out.width = x1 - x0 + 1; out.height = y1 - y0 + 1;
      out.getContext('2d').drawImage(c, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
      p.c = out;
    } catch (err) { p.bad = true; }
    if (portraits.size > 80) for (const [k, v] of portraits) { if (k !== key && v.c) { portraits.delete(k); break; } }
    return p.c;
  }

  // Dolor un momento tras un golpe de verdad, desmayo mientras está caído.
  // Adaptado de emotionFor de PokeSurvivor Plus (MIT).
  const emo = new Map();
  function feel(key, hp, maxHp, dead) {
    let s = emo.get(key);
    const now = performance.now();
    if (!s) { s = { last: hp, until: 0 }; emo.set(key, s); }
    if (hp < s.last - Math.max(1, (maxHp || 1) * 0.04)) s.until = now + 550;
    s.last = hp;
    if (dead) return 2;
    return s.until > now ? 1 : 0; // 0 normal, 1 dolor, 2 caído
  }

  function drawPortrait(ctx, ns, x, y, size, mon, tint, state) {
    const down = state === 2, hurt = state === 1;
    const ec = down ? '#ff5f6d' : hurt ? '#ffffff' : EDGE;
    frame(ctx, x, y, size, size, 6, 'rgba(18,34,74,.95)', ec, 2);
    rr(ctx, x + 2, y + 2, size - 4, size - 4, 4);
    ctx.fillStyle = tint || 'rgba(95,200,255,.3)';
    ctx.fill();
    let img = null;
    if (opt.portrait && mon.dex) {
      if (down) img = portrait(ns, mon.dex, mon.shiny, mon.skin, 'Faint');
      else if (hurt) img = portrait(ns, mon.dex, mon.shiny, mon.skin, 'Hurt');
      if (!img) img = portrait(ns, mon.dex, mon.shiny, mon.skin, 'Idle');
    }
    ctx.save();
    rr(ctx, x + 2, y + 2, size - 4, size - 4, 4);
    ctx.clip();
    if (img) {
      const room = size - 8;
      let s = Math.min(room / img.width, room / img.height);
      if (s >= 2) s = Math.floor(s);
      const dw = Math.round(img.width * s), dh = Math.round(img.height * s);
      const jx = hurt ? Math.round(Math.sin(performance.now() / 22) * 1.5) : 0;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, Math.round(x + (size - dw) / 2) + jx, Math.round(y + size - 3 - dh), dw, dh);
    } else {
      ctx.font = font(800, Math.round(size * 0.45));
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fff';
      ctx.fillText(String(mon.name || '?').charAt(0).toUpperCase(), x + size / 2, y + size * 0.66);
    }
    if (down) { ctx.fillStyle = 'rgba(40,10,30,.45)'; ctx.fillRect(x, y, size, size); }
    else if (hurt) { ctx.fillStyle = 'rgba(255,60,80,.28)'; ctx.fillRect(x, y, size, size); }
    ctx.restore();
  }

  // ---- geometría
  // Dónde dibuja el juego su barra de movimientos (copiado de su HUD.draw).
  function gameBar(ns, W, H, pl, touch) {
    const T = ns.Touch;
    const n = Math.max(1, pl.slots.length);
    const tw = n * 54 + 9 * (n - 1);
    let sx = (W - tw) / 2;
    let sy = H - 54 - 18 - (touch ? Math.min(28, T.safeArea().bottom) : 0);
    const spot = touch && typeof T.spot === 'function' && T.spot('bar');
    if (spot) {
      const m = Math.max(n, pl.maxMoves || 0), full = 72 + m * 54 + 9 * (m - 1);
      sx = NX.clamp(spot[0] * W - full / 2, 6, Math.max(6, W - full - 6)) + 54 + 18;
      sy = NX.clamp(spot[1] * H - 27, 24, H - 54 - 6);
    }
    return { sx, sy, tw, spot: !!spot };
  }

  // Zonas del HUD del juego que se reemplazan (unidades del HUD).
  // Adaptado de replacedAreas de PokeSurvivor Plus (MIT).
  function replaced(ns, W, H, pl, touch, out) {
    out.length = 0;
    const safe = ns.Touch.safeArea();
    const x0 = 16 + safe.left, y0 = 20 + safe.top;
    let chips = !!pl.power;
    if (!chips && pl.buffs) for (const k in pl.buffs) { if (pl.buffs[k] && pl.buffs[k].n > 0) { chips = true; break; } }
    let bottom = y0 + (chips ? 52 : 32);
    const C = ns.Coop;
    if (C && C.active && C.mates) {
      let n = 0;
      for (const m of C.mates) if (m.connected) n++;
      bottom = y0 + (chips ? 56 : 40) + n * 15 + 4;
    }
    out.push(0, 0, W, 8);
    out.push(0, 8, Math.max(320, x0 + 300), bottom - 8);
    const g = gameBar(ns, W, H, pl, touch);
    const right = g.sx + g.tw + (pl.bonds > 0 ? 80 : 8);
    out.push(g.sx - 80, g.sy - 26, right - (g.sx - 80), H - (g.sy - 26));
    // Orbes (y su descripción emergente), centrados sobre la barra del juego.
    if (hasOrbs(pl)) {
      const O = ns.Orbs, N = O.SLOTS || 4, ow = N * 40 + (N - 1) * 6, c = g.sx + g.tw / 2;
      let nb = 0;
      const ob = pl.orbBuff || {};
      for (const k in ob) if (ob[k] > 0) nb++;
      const l = c - Math.max(132, ow / 2 + 4), r = Math.max(c + 132, c + ow / 2 + 10 + 30 * nb + 30);
      out.push(l, g.sy - 70 - 100, r - l, 100 + 70 - 26);
    }
    out.push(0, H - 16, W, 16); // indicaciones de los primeros segundos
    return out;
  }

  const hasOrbs = (pl) => {
    if (pl.orbs) for (let i = 0; i < pl.orbs.length; i++) if (pl.orbs[i]) return true;
    const ob = pl.orbBuff;
    if (ob) for (const k in ob) if (ob[k] > 0) return true;
    return false;
  };

  // ---- estado por cuadro
  let armed = false, dropGame = false, selfAdd = false, curPl = null, touchNow = false;
  const zones = [];
  let hpTrail = { v: 1, last: 1, hold: 0, pl: null };
  // Manejadores fijos de los huecos (sin crear funciones en cada cuadro).
  const slotFns = [];
  const slotFn = (ns, i) => slotFns[i] || (slotFns[i] = () => {
    const p = curPl;
    if (!p || ns.Game.state !== 'playing' || p.active === i || !(p.slots[i] && p.slots[i][0])) return;
    p.setActive(i);
    try { ns.Audio.sfx('click'); } catch (_) { /* sin sonido */ }
  });
  const addBtn = (T, x, y, w, h, fn, pad) => { selfAdd = true; try { T.addButton(x, y, w, h, fn, pad); } finally { selfAdd = false; } };

  // Obstáculos del DOM (minimapa y medidor de daño) en píxeles CSS, a 4 Hz.
  let obstacles = [], canvasRect = null, hudCanvas = null;
  NX.every(250, () => {
    if (!opt.on || !NX.inRun()) return;
    const list = [];
    for (const id of ['nexus-map', 'nexus-meter']) {
      const e = document.getElementById(id);
      if (!e || e.classList.contains('hidden') || e.offsetParent === null) continue;
      const r = e.getBoundingClientRect();
      if (r.width > 0) list.push(r);
    }
    obstacles = list;
    canvasRect = hudCanvas ? hudCanvas.getBoundingClientRect() : null;
  }, { when: 'run', key: KEY, name: 'obstáculos' });

  // Puntero (para la descripción de los orbes al pasar el mouse).
  const mouse = { x: -1, y: -1 };
  addEventListener('mousemove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY; }, { passive: true });
  addEventListener('resize', () => { canvasRect = hudCanvas ? hudCanvas.getBoundingClientRect() : null; });

  // ---- orbes: el juego los centra sobre su barra, donde ahora va la vida
  // grande; aquí se dibujan centrados sobre el bloque nuevo, con sus botones,
  // atajos (5-8 o X/Y con mando), enfriamiento y descripción emergente.
  const orbFns = [];
  const orbFn = (ns, i) => orbFns[i] || (orbFns[i] = () => { if (curPl && ns.Game.state === 'playing') ns.Orbs.use(curPl, i); });
  const orbLines = new Map();
  function orbDesc(ctx, ns, id) {
    let L = orbLines.get(id);
    if (L) return L;
    const def = ns.Orbs.BY[id] || {};
    const f = font(600, 11);
    ctx.font = f;
    const lines = [];
    let cur = '';
    for (const w of String(tr(ns, def.desc || '')).split(' ')) {
      const t = cur ? cur + ' ' + w : w;
      if (ctx.measureText(t).width > 240 && cur) { lines.push(cur); cur = w; } else cur = t;
    }
    if (cur) lines.push(cur);
    const name = String(tr(ns, def.name || id));
    let tw = textW(ctx, name, font(800, 12));
    ctx.font = f;
    for (const l of lines) tw = Math.max(tw, Math.ceil(ctx.measureText(l).width));
    L = { name, lines, w: tw + 16, col: def.col || EDGE };
    orbLines.set(id, L);
    return L;
  }
  function drawOrbs(ns, ctx, W, pl, cx, bottom, touch) {
    const O = ns.Orbs;
    if (!O || !O.BY || !hasOrbs(pl)) return;
    const T = ns.Touch, Icons = ns.Icons;
    const orbs = pl.orbs || [];
    const N = O.SLOTS || 4, SZ = 40, G = 6, tw = N * SZ + (N - 1) * G;
    const ox = Math.round(cx - tw / 2), oy = Math.round(bottom - SZ);
    const cd = NX.clamp(+O.cd || 0, 0, 1);
    const padOn = !!(ns.Pad && ns.Pad.name);
    const now = performance.now();
    let hover = -1;
    if (!touch && canvasRect && canvasRect.width && mouse.x >= 0) {
      const k = W / canvasRect.width, hx = (mouse.x - canvasRect.left) * k, hy = (mouse.y - canvasRect.top) * k;
      if (hy >= oy && hy <= oy + SZ) for (let i = 0; i < N; i++) { const x = ox + i * (SZ + G); if (orbs[i] && hx >= x && hx <= x + SZ) hover = i; }
    }
    const fresh = pl.orbNew && now - pl.orbNew.at < 3000 ? pl.orbNew.i : -1;
    for (let i = 0; i < N; i++) {
      const o = orbs[i], x = ox + i * (SZ + G);
      const def = o && O.BY[o.id];
      const sel = !!o && padOn && i === O.sel;
      frame(ctx, x, oy, SZ, SZ, 7, o ? 'rgba(20,24,44,.92)' : 'rgba(10,16,28,.45)', sel ? GOLD : def ? def.col : 'rgba(140,170,210,.25)', sel ? 2.5 : o ? 2 : 1.2);
      if (!o) continue;
      if (T && T.addButton) addBtn(T, x, oy, SZ, SZ, orbFn(ns, i), G / 2 + 2);
      if (Icons) Icons.draw(ctx, 'orb:' + o.id, x + (SZ - 24) / 2, oy + (SZ - 24) / 2, 24);
      if (cd > 0) { ctx.save(); rr(ctx, x, oy, SZ, SZ, 7); ctx.clip(); ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(x, oy, SZ, SZ * cd); ctx.restore(); }
      ctx.font = font(800, 9);
      ctx.textAlign = 'left';
      if (padOn) outlined(ctx, sel ? 'X' : 'Y', x + 3, oy + 10, sel ? GOLD : 'rgba(200,215,240,.8)', 2);
      else if (!touch) outlined(ctx, NUM[i + 5], x + 3, oy + 10, 'rgba(200,215,240,.8)', 2);
      if (o.n > 1) { ctx.textAlign = 'right'; outlined(ctx, '×' + o.n, x + SZ - 3, oy + SZ - 4, '#f4f8ff', 2); }
      if (i === fresh) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - (now - pl.orbNew.at) / 3000);
        rr(ctx, x - 3, oy - 3, SZ + 6, SZ + 6, 9);
        ctx.lineWidth = 3; ctx.strokeStyle = def ? def.col : GOLD; ctx.stroke();
        ctx.restore();
      }
    }
    // Efectos de orbes activos, a la derecha.
    const ob = pl.orbBuff || {};
    let bx = ox + tw + 10;
    for (const k in ob) {
      if (!(ob[k] > 0)) continue;
      if (Icons) Icons.draw(ctx, 'orb:' + k, bx, oy + 2, 24);
      ctx.font = font(800, 10);
      ctx.textAlign = 'center';
      outlined(ctx, NUM[Math.min(99, Math.ceil(ob[k]))] + 's', bx + 12, oy + 38, (O.BY[k] && O.BY[k].col) || '#fff', 2.5);
      bx += 30;
    }
    // Descripción: al pasar el mouse, el orbe elegido con mando o el recién recogido.
    let idx = hover;
    if (idx < 0 && padOn && orbs[O.sel]) idx = O.sel;
    if (idx < 0 && fresh >= 0 && orbs[fresh]) idx = fresh;
    if (idx < 0) return;
    const L = orbDesc(ctx, ns, orbs[idx].id);
    const lines = hover >= 0 ? L.lines.length : 0;
    const th = 20 + 14 * lines;
    const tx = NX.clamp(ox + idx * (SZ + G) + SZ / 2 - L.w / 2, 4, W - L.w - 4), ty = oy - 8 - th;
    rr(ctx, tx, ty, L.w, th, 8);
    ctx.fillStyle = 'rgba(10,14,28,.94)'; ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = L.col; ctx.stroke();
    ctx.textAlign = 'center';
    ctx.font = font(800, 12);
    ctx.fillStyle = L.col;
    ctx.fillText(L.name, tx + L.w / 2, ty + 14);
    ctx.font = font(600, 11);
    ctx.fillStyle = '#e6ecff';
    for (let i = 0; i < lines; i++) ctx.fillText(L.lines[i], tx + L.w / 2, ty + 28 + 14 * i);
  }

  // ---- textos con caché
  const memo = { hpKey: '', hp: '', lvKey: -1, lv: '', moveKey: '', move: '', nameKey: '', name: '', tintKey: null, tint: '' };
  let xpGrad = null;
  const tr = (ns, s) => (typeof ns.T === 'function' ? ns.T(s) : s);

  const BUFF = [
    ['atk', 'ATK', '#ff6b4d', '#5a1620'], ['patk', 'ATK', '#ff6b4d', '#5a1620'], ['satk', 'AT.E', '#c47bff', '#3a1a5a'],
    ['spd', 'VEL', '#7fe0ff', '#16305a'], ['def', 'DEF', '#7fb4ff', '#16305a'], ['regen', 'REG', '#5fe08a', '#163d26'],
  ];
  const chipText = new Map();
  const chip = (label, n) => { const k = label + n; let t = chipText.get(k); if (!t) { t = label + ' ×' + n; chipText.set(k, t); } return t; };

  // ---- dibujo del HUD nuevo
  function drawHud(ns, ctx, W, H, pl) {
    const T = ns.Touch, Icons = ns.Icons, U = ns.U || {};
    const TYPE = U.TYPE_COLOR || {};
    const touch = touchNow;
    const now = performance.now();
    curPl = pl;
    ctx.textBaseline = 'alphabetic';
    const mon = pl.mon || {};
    const me = { dex: pl.dex || mon.dex, shiny: pl.shiny, skin: pl.anim && pl.anim.skin, name: mon.name };
    const ty0 = mon.types && mon.types[0];
    if (memo.tintKey !== ty0) { memo.tintKey = ty0; memo.tint = (TYPE[ty0] || '#5fc8ff') + '55'; }
    const tint = memo.tint;
    const state = feel('me', pl.hp, pl.maxHp, !!pl.dead);
    const n = Math.max(1, pl.slots.length, pl.maxMoves || 0);
    const act = pl.slots[pl.active] || null;

    // Geometría según el modo.
    let S, GAP, PIT, LIFT = 6, XPH, HPH, PS, IS, x0, s0x, rowY, hpY, groupW, itemX, itemY, portX, portY, barX, barW;
    if (!touch) {
      // Medidas de PokeSurvivor Plus con su escala por defecto (1,4x).
      S = 64; GAP = 9; PIT = S + GAP; XPH = 9; HPH = 20; PS = 64; IS = 54;
      groupW = PS + 12 + IS + 14 + n * S + (n - 1) * GAP;
      x0 = Math.round((W - groupW) / 2);
      s0x = x0 + PS + 12 + IS + 14;
      rowY = Math.round(H - XPH - 10 - S);
      hpY = rowY - LIFT - 7 - HPH;
      // tooltips.js busca el objeto 54 px a la izquierda del primer hueco, con 18 de margen.
      itemX = s0x - 14 - IS; itemY = rowY + (S - IS) / 2;
      portX = x0; portY = rowY;
      barX = x0; barW = groupW;
    } else {
      // Compacta: misma posición que la barra del juego (respeta el editor de
      // controles táctiles y el joystick).
      const g = gameBar(ns, W, H, pl, true);
      S = 54; GAP = 9; PIT = 63; XPH = 5; HPH = 13; IS = 54;
      s0x = g.sx; rowY = g.sy;
      itemX = s0x - 72; itemY = rowY;
      x0 = itemX;
      groupW = 72 + n * S + (n - 1) * GAP;
      hpY = rowY - LIFT - 6 - HPH;
      barX = x0; barW = groupW;
      PS = 40;
      portX = itemX - 8 - PS; portY = rowY + S - PS;
      // Sin retrato si invade la zona del joystick.
      let stickX = 0;
      try { const sb = T.stickBase && T.stickBase(); stickX = sb ? sb.x : 0; } catch (_) { stickX = 0; }
      const k = canvasRect && canvasRect.width ? W / canvasRect.width : 1;
      if (portX < stickX * k + 90 || portX < 4) PS = 0;
    }

    // Experiencia a lo ancho del borde inferior.
    const xpF = pl.xpNext ? NX.clamp(pl.xp / pl.xpNext, 0, 1) : 0;
    ctx.fillStyle = INK;
    ctx.fillRect(0, H - XPH - 2, W, XPH + 2);
    ctx.fillStyle = 'rgba(20,40,90,.95)';
    ctx.fillRect(0, H - XPH, W, XPH);
    const p = pal(), xc = p && p.xp();
    if (!xpGrad || xpGrad.w !== W || xpGrad.xc !== xc || xpGrad.ctx !== ctx) {
      const g = ctx.createLinearGradient(0, 0, W, 0);
      g.addColorStop(0, xc ? xc[0] : '#4fd1ff');
      g.addColorStop(1, xc ? xc[1] : '#a98bff');
      xpGrad = { g, w: W, xc, ctx };
    }
    ctx.fillStyle = xpGrad.g;
    ctx.fillRect(0, H - XPH, Math.round(W * xpF), XPH);
    ctx.fillStyle = 'rgba(255,255,255,.3)';
    ctx.fillRect(0, H - XPH, Math.round(W * xpF), Math.max(1, Math.round(XPH * 0.3)));
    ctx.fillStyle = 'rgba(11,24,56,.55)';
    for (let x = 40; x < W; x += 40) ctx.fillRect(x, H - XPH, 1, XPH);
    if (p && p.xpNum() && pl.xpNext) {
      ctx.font = font(800, 8);
      ctx.textAlign = 'right';
      outlined(ctx, 'Nv. ' + (pl.level || 1) + ' · ' + Math.floor(xpF * 100) + ' %', W - 8, H - XPH - 5, '#cfe6ff', 2.5);
    }

    // Vida grande con estela.
    const hpF = NX.clamp(Math.max(0, pl.hp) / (pl.maxHp || 1), 0, 1);
    const tr0 = hpTrail;
    if (tr0.pl !== pl) { tr0.pl = pl; tr0.v = tr0.last = hpF; }
    if (hpF < tr0.last - 0.001) { if (tr0.v <= tr0.last + 0.005) tr0.hold = now + 220; }
    tr0.last = hpF;
    if (now > tr0.hold) tr0.v -= Math.max((tr0.v - hpF) * 0.12, 0.004);
    if (tr0.v < hpF) tr0.v = hpF;
    const low = hpF < 0.25 && !pl.dead;
    if (low) {
      ctx.save();
      ctx.shadowColor = `rgba(255,50,60,${(0.5 + 0.5 * Math.sin(now / 120)).toFixed(2)})`;
      ctx.shadowBlur = 12;
      rr(ctx, barX - 2, hpY - 2, barW + 4, HPH + 4, 4);
      ctx.fillStyle = INK; ctx.fill();
      ctx.restore();
    }
    bar(ctx, barX, hpY, barW, HPH, hpF, hpCol(hpF), 'rgba(60,12,20,.92)', tr0.v);
    // Nombre dentro de la barra a la izquierda y la vida al centro.
    const fIn = font(800, touch ? 9 : 13);
    ctx.font = fIn;
    ctx.textBaseline = 'middle';
    const nameKey = (mon.name || '') + '|' + (touch ? pl.level : '');
    if (memo.nameKey !== nameKey) { memo.nameKey = nameKey; memo.name = touch ? (mon.name || '') + ' · Nv. ' + (pl.level || 1) : (mon.name || ''); }
    ctx.textAlign = 'left';
    outlined(ctx, memo.name, barX + 6, hpY + HPH / 2 + 1, '#ffffff', 2.5);
    if (opt.hpNum !== 'off') {
      const hk = opt.hpNum + Math.ceil(Math.max(0, pl.hp)) + '/' + Math.round(pl.maxHp);
      if (memo.hpKey !== hk) {
        memo.hpKey = hk;
        memo.hp = opt.hpNum === 'percent' ? Math.ceil(hpF * 100) + ' %' : Math.ceil(Math.max(0, pl.hp)) + ' / ' + Math.round(pl.maxHp);
      }
      ctx.textAlign = touch ? 'right' : 'center';
      outlined(ctx, memo.hp, touch ? barX + barW - 6 : barX + barW / 2, hpY + HPH / 2 + 1, '#ffffff', 2.5);
    }
    ctx.textBaseline = 'alphabetic';

    // Nombre del movimiento activo, encima del extremo derecho de la barra.
    const a0 = act && act[0];
    if (a0) {
      const mk = a0.id + '|' + act.length;
      if (memo.moveKey !== mk) { memo.moveKey = mk; memo.move = tr(ns, a0.name) + (act.length > 1 ? ' +' + (act.length - 1) : ''); }
      ctx.font = font(800, touch ? 10 : 12);
      ctx.textAlign = 'right';
      outlined(ctx, memo.move, barX + barW, hpY - 7, act.length > 1 ? BOND : TYPE[a0.type] || '#fff', 3);
    }

    // Estados: subidas (ATK, DEF...), poder del altar, congelado y lento.
    // En PC van en columna a la izquierda del retrato; en táctil, sobre la barra.
    const CH = touch ? 8 : 10;
    let cy = touch ? hpY - 18 : rowY + S - CH - 6, cx = touch ? barX : x0 - 10;
    const putChip = (text, fg, bg, edge) => {
      if (touch) { cx += pill(ctx, cx, cy, text, fg, bg, edge, CH) + 4; return; }
      const w = textW(ctx, text, font(700, CH)) + 10;
      pill(ctx, cx - w, cy, text, fg, bg, edge, CH);
      cy -= CH + 9;
    };
    if (pl.buffs) {
      for (let i = 0; i < BUFF.length; i++) {
        const B = BUFF[i], b = pl.buffs[B[0]];
        if (b && b.n > 0) putChip(chip(B[1], b.n), '#fff', B[3], B[2]);
      }
    }
    if (pl.power && pl.power.def) putChip(String(pl.power.def.name || '').toUpperCase() + ' ' + Math.ceil(pl.power.t || 0) + 's', pl.power.def.color || '#fff', INK, pl.power.def.color || EDGE);
    if (pl.frozen) putChip('CONGELADO', '#bff2ff', '#16305a', '#7fe0ff');
    if (pl.slowT > 0) putChip('LENTO', '#e6d7ff', '#2e2252', '#a98bff');

    // Retrato y nivel.
    if (PS > 0) {
      drawPortrait(ctx, ns, portX, portY, PS, me, tint, state);
      const lv = pl.level || 1;
      if (memo.lvKey !== lv) { memo.lvKey = lv; memo.lv = 'Nv. ' + lv; }
      if (!touch) {
        const lw = textW(ctx, memo.lv, font(700, 10)) + 10;
        pill(ctx, portX + (PS - lw) / 2, portY + PS - 7, memo.lv, '#fff', INK, EDGE, 10);
      }
    }

    // Objeto equipado.
    if (pl.item) {
      frame(ctx, itemX, itemY, IS, IS, 7, 'rgba(40,30,10,.92)', GOLD, 2);
      const iz = IS >= 54 ? 36 : 32;
      if (Icons) Icons.draw(ctx, pl.item, itemX + (IS - iz) / 2, itemY + (IS - iz) / 2, iz);
    } else {
      frame(ctx, itemX, itemY, IS, IS, 7, 'rgba(10,16,32,.5)', 'rgba(232,238,248,.22)', 1.5);
    }

    // Huecos de movimientos: enfriamiento, nivel, fusiones y atajo.
    const cdMul = pl.cdMul || 1;
    const pad = S / 7.2; // misma proporción que el juego (54 / 7.5): tooltips.js los reconoce
    for (let i = 0; i < n; i++) {
      const grp = pl.slots[i];
      const m = grp && grp[0];
      const on = i === pl.active && !!m;
      const x = s0x + i * PIT, y = on ? rowY - LIFT : rowY;
      if (!m) {
        frame(ctx, x, y, S, S, 7, 'rgba(10,16,32,.5)', 'rgba(232,238,248,.25)', 1.5);
        ctx.font = font(800, 9);
        ctx.textAlign = 'left';
        outlined(ctx, NUM[i + 1], x + 4, y + 11, 'rgba(200,215,240,.45)', 2);
        continue;
      }
      if (T && T.addButton) addBtn(T, x, y, S, S, slotFn(ns, i), pad);
      const fused = grp.length > 1;
      const col = TYPE[m.type] || '#8fa3c4';
      frame(ctx, x, y, S, S, 7, on ? 'rgba(22,36,74,.97)' : 'rgba(12,20,40,.92)', fused ? BOND : m.evolved ? GOLD : on ? col : EDGE, on || fused || m.evolved ? 2.5 : 2);
      if (on) {
        ctx.save();
        ctx.globalAlpha = 0.18;
        rr(ctx, x + 2, y + 2, S - 4, S - 4, 5);
        ctx.fillStyle = col; ctx.fill();
        ctx.restore();
      }
      if (fused) {
        const Cc = S >= 64 ? 24 : 20, P = (S - Cc * 2) / 3;
        for (let j = 0; j < grp.length && j < 4; j++) {
          const gm = grp[j];
          const ix = x + P + (j % 2) * (Cc + P), iy = y + P + Math.floor(j / 2) * (Cc + P);
          if (Icons) Icons.draw(ctx, 'move:' + gm.id, ix, iy, Cc);
          const f = gm.kind === 'orbit' ? 0 : NX.clamp(gm.t / ((gm.cd || 1) * cdMul), 0, 1);
          if (f > 0) { ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(ix, iy, Cc, Cc * f); }
          ctx.font = font(800, 7);
          ctx.textAlign = 'right';
          outlined(ctx, gm.evolved ? '★' : NUM[gm.lvl] || '', ix + Cc + 1, iy + Cc, gm.evolved || gm.lvl >= ((gm.def && gm.def.maxLvl) || 5) ? GOLD : '#fff', 2);
        }
      } else {
        const cdT = (m.cd || 1) * cdMul;
        const f = m.kind === 'orbit' ? 0 : NX.clamp(m.t / cdT, 0, 1);
        const isz = S >= 64 ? 40 : 32;
        if (Icons) { ctx.imageSmoothingEnabled = false; Icons.draw(ctx, 'move:' + m.id, x + (S - isz) / 2, y + (S - isz) / 2 - 2, isz); }
        if (f > 0) {
          ctx.save();
          rr(ctx, x, y, S, S, 7); ctx.clip();
          ctx.fillStyle = 'rgba(0,0,0,.58)';
          ctx.fillRect(x, y, S, Math.round(S * f));
          // Borde del barrido.
          ctx.fillStyle = 'rgba(255,255,255,.35)';
          ctx.fillRect(x, y + Math.round(S * f) - 1, S, 1);
          ctx.restore();
          if (opt.cdNum && m.t >= 1 && cdT >= 2) {
            ctx.font = font(800, S >= 64 ? 17 : 14);
            ctx.textAlign = 'center';
            outlined(ctx, NUM[Math.min(99, Math.ceil(m.t))], x + S / 2, y + S / 2 + 4, '#ffffff', 3);
          }
        }
        const fl = 1 - (now - (m.castAt || 0)) / 180;
        if (fl > 0) { ctx.save(); rr(ctx, x, y, S, S, 7); ctx.clip(); ctx.fillStyle = `rgba(255,255,255,${(fl * 0.4).toFixed(2)})`; ctx.fillRect(x, y, S, S); ctx.restore(); }
        // Nivel: número arriba a la derecha y puntos abajo.
        const max = (m.def && m.def.maxLvl) || 5;
        ctx.font = font(800, S >= 64 ? 11 : 9);
        ctx.textAlign = 'right';
        outlined(ctx, m.evolved ? '★' : NUM[m.lvl] || '', x + S - 5, y + (S >= 64 ? 13 : 11), m.evolved || m.lvl >= max ? GOLD : '#fff', 2);
        const dw = S >= 64 ? 6 : 5, dg = 2, tw = max * dw + (max - 1) * dg;
        for (let d = 0; d < max; d++) {
          ctx.fillStyle = d < m.lvl ? col : 'rgba(255,255,255,.18)';
          ctx.fillRect(x + (S - tw) / 2 + d * (dw + dg), y + S - 8, dw, 3);
        }
      }
      ctx.font = font(800, S >= 64 ? 11 : 9);
      ctx.textAlign = 'left';
      outlined(ctx, NUM[i + 1], x + 5, y + (S >= 64 ? 13 : 11), fused ? BOND : on ? col : 'rgba(200,215,240,.85)', 2);
    }

    // Lazos sin usar, después de los movimientos.
    if (pl.bonds > 0 && Icons) {
      const bx = s0x + n * PIT - GAP + 10, by = rowY + S / 2 - 12;
      Icons.draw(ctx, 'bond', bx, by, 24);
      if (pl.bonds > 1) { ctx.font = font(800, 10); ctx.textAlign = 'left'; outlined(ctx, '×' + pl.bonds, bx + 25, by + 20, BOND, 2); }
    }

    // Orbes, centrados sobre la barra de vida (en táctil, sobre los estados).
    drawOrbs(ns, ctx, W, pl, barX + barW / 2, touch ? hpY - 26 : hpY - 24, touch);

    // Indicaciones de los primeros segundos (el juego las pone donde ahora va la barra).
    const t = ns.Game.st && ns.Game.st.time;
    if (t < 14 && !touch && !hasOrbs(pl)) {
      ctx.font = font(600, 11);
      ctx.textAlign = 'center';
      outlined(ctx, 'WASD moverse  ·  1-4 / Q / E o clic en un ataque para cambiarlo  ·  Esc pausa', W / 2, hpY - 28, 'rgba(200,215,240,.85)', 2.5);
    }

    if (opt.team) drawTeam(ns, ctx, W, H, pl, touch);
  }

  // ---- tarjetas del equipo (co-op), arriba a la izquierda
  // Adaptado de las tarjetas de compañeros de PokeSurvivor Plus (MIT).
  function drawTeam(ns, ctx, W, H, pl, touch) {
    const C = ns.Coop;
    if (!C || !C.active || !C.mates) return;
    let live = 0;
    for (const m of C.mates) if (m.connected && m.pl) live++;
    if (!live) return;
    const Icons = ns.Icons, TYPE = (ns.U && ns.U.TYPE_COLOR) || {};
    const compact = touch || live > 3;
    const safe = ns.Touch.safeArea();
    let x = 10 + safe.left, y = 10 + safe.top;
    const colW = compact ? 170 : 220, colH = live * (compact ? 28 : 46);
    // Que no quede debajo del minimapa ni del medidor de daño.
    if (canvasRect && canvasRect.width && obstacles.length) {
      const k = W / canvasRect.width;
      for (const r of obstacles) {
        const ox = (r.left - canvasRect.left) * k, oy = (r.top - canvasRect.top) * k, ow = r.width * k, oh = r.height * k;
        if (ox < x + colW && ox + ow > x && oy < y + colH && oy + oh > y) {
          if (oy > y + 40) continue; // empieza más abajo: solo se encoge la columna si hace falta
          x = Math.ceil(ox + ow + 6);
        }
      }
    }
    const t = performance.now() / 1000;
    for (const m of C.mates) {
      if (!m.connected || !m.pl) continue;
      const o = m.pl, net = o.net || {};
      const dead = !!(net.dead || o.dead);
      const hp = net.hp != null ? net.hp : o.hp, max = net.maxHp || o.maxHp || 1;
      const mon = o.mon || {};
      const st = feel(m.uid || m.name || m, hp, max, dead);
      const who = { dex: o.dex || mon.dex, shiny: o.shiny, skin: o.anim && o.anim.skin, name: mon.name || m.name };
      const col = m.color || '#5fc8ff';
      const frac = dead ? 0 : NX.clamp(hp / max, 0, 1);
      if (compact) {
        drawPortrait(ctx, ns, x, y, 24, who, col + '55', st);
        ctx.font = font(800, 9);
        ctx.textAlign = 'left';
        outlined(ctx, String(m.name || ''), x + 30, y + 9, col, 2.5);
        bar(ctx, x + 30, y + 15, 110, 5, frac, hpCol(frac), 'rgba(60,12,20,.9)');
        if (dead) { ctx.font = font(800, 8); outlined(ctx, 'CAÍDO', x + 146, y + 21, Math.sin(t * 8) > 0 ? '#ff8a96' : '#fff', 2); }
        y += 28;
        continue;
      }
      drawPortrait(ctx, ns, x, y, 36, who, col + '55', st);
      ctx.font = font(800, 10);
      ctx.textAlign = 'left';
      const nm = String(m.name || '');
      outlined(ctx, nm, x + 42, y + 9, col);
      let tx = x + 42 + textW(ctx, nm, font(800, 10)) + 5;
      if (Icons) for (const ty of (mon.types || []).slice(0, 2)) { try { Icons.draw(ctx, 'type:' + ty, tx, y - 4, 16); } catch (_) { /* icono ausente */ } tx += 18; }
      bar(ctx, x + 42, y + 14, 132, 6, frac, hpCol(frac), 'rgba(60,12,20,.9)');
      let px = x + 42;
      px += pill(ctx, px, y + 24, 'Nv. ' + (o.level || pl.level || 1)) + 4;
      if (dead) pill(ctx, px, y + 24, 'CAÍDO', Math.sin(t * 8) > 0 ? '#ff8a96' : '#fff', '#5a1620', '#ff5f6d');
      else if (mon.name) pill(ctx, px, y + 24, String(mon.name), TYPE[(mon.types || [])[0]] ? '#fff' : '#fff');
      y += 46;
    }
  }

  // ---- registro
  NX.feature({
    key: KEY,
    label: 'HUD Nexus',
    needs: (ns) => ns.HUD && typeof ns.HUD.draw === 'function' && ns.Touch && typeof ns.Touch.clearButtons === 'function' &&
      typeof ns.Touch.addButton === 'function' && typeof ns.Touch.safeArea === 'function' && ns.Icons && ns.Sprites &&
      typeof ns.Sprites.sheet === 'function' && ns.SPRITE_META && ns.Game &&
      NX.featureList().some((f) => f.key === 'hud' && f.status === 'ok'),
    setup(ns) {
      const T = ns.Touch;
      // Al empezar el cuerpo del HUD del juego (justo después de su ctx.save),
      // se recortan las zonas que se reemplazan; su ctx.restore final las quita.
      let lastCtx = null, lastW = 0, lastH = 0, lastPl = null;
      const clear = T.clearButtons;
      T.clearButtons = function () {
        const r = clear.apply(this, arguments);
        if (armed && lastCtx) {
          armed = false;
          dropGame = true;
          try {
            replaced(ns, lastW, lastH, lastPl, touchNow, zones);
            for (let i = 0; i < zones.length; i += 4) {
              lastCtx.beginPath();
              lastCtx.rect(0, 0, lastW, lastH);
              lastCtx.rect(zones[i], zones[i + 1], zones[i + 2], zones[i + 3]);
              lastCtx.clip('evenodd');
            }
          } catch (err) { NX.trip(KEY, err); }
        }
        return r;
      };
      // Los botones de movimientos del juego se descartan antes de que los vea
      // otro módulo (tooltips.js los copia): esta envoltura debe quedar por
      // fuera de las demás, así que se vuelve a poner si alguien envuelve después.
      let mine = null;
      const ensureOuter = () => {
        if (T.addButton === mine) return;
        const inner = T.addButton;
        mine = function (x, y, w, h, fn, pad) {
          // Huecos de movimientos (54, margen 7,5) y orbes (40, margen 5, en la mitad de abajo).
          if (dropGame && !selfAdd && ((w === 54 && h === 54 && pad === 7.5) || (w === 40 && h === 40 && pad === 5 && y > lastH * 0.5))) return undefined;
          return inner.apply(this, arguments);
        };
        T.addButton = mine;
      };
      ensureOuter();
      NX.every(1000, ensureOuter, { key: KEY, name: 'toque' });

      NX.hudLayers.push({
        key: KEY,
        under(ctx, w, h, pl) {
          armed = false;
          dropGame = false;
          touchNow = !!T.active;
          const on = opt.on && !!pl && Array.isArray(pl.slots) && !!pl.mon && typeof pl.setActive === 'function';
          NX.hudNewActive = on;
          if (!on) return;
          lastCtx = ctx; lastW = w; lastH = h; lastPl = pl; hudCanvas = ctx.canvas || hudCanvas;
          armed = true;
        },
        over(ctx, w, h, pl) {
          const go = dropGame;
          armed = false;
          dropGame = false;
          if (!go || !NX.hudNewActive || pl !== lastPl) return;
          drawHud(ns, ctx, w, h, pl);
        },
      });
      // Si el HUD nuevo deja de dibujarse (módulo apagado), que no quede marcado.
      NX.every(500, () => { if (!NX.isOn(KEY)) NX.hudNewActive = false; }, { key: KEY, name: 'estado' });
    },
  });

  NX.settings.section({
    key: KEY,
    title: 'HUD Nexus',
    tab: 'HUD',
    keywords: 'estilo hud nuevo clasico plus vida barra retrato movimientos equipo coop',
    render(el) {
      el.appendChild(NX.ui.select('Estilo del HUD', 'hudnew:style', [['nexus', 'Nexus (nuevo)'], ['classic', 'Clásico (el del juego)']], 'nexus', readOpts));
      el.appendChild(NX.ui.select('Números de vida', 'hudnew:hpnum', [['values', 'Vida / máxima'], ['percent', 'Porcentaje'], ['off', 'Sin números']], 'values', readOpts));
      el.appendChild(NX.ui.toggle('Retrato del Pokémon', 'hudnew:portrait', true, readOpts));
      el.appendChild(NX.ui.toggle('Segundos de enfriamiento en los ataques', 'hudnew:cdnum', true, readOpts));
      el.appendChild(NX.ui.toggle('Tarjetas del equipo en co-op', 'hudnew:team', true, readOpts));
      el.appendChild(NX.ui.note('Vida grande, experiencia, ataques y objeto abajo, como en PokeSurvivor Plus. En pantallas táctiles usa una variante compacta que respeta el joystick y la posición de la barra. Los colores salen de "Colores del HUD" y el tamaño de "Escala del HUD".'));
    },
  });
})();
