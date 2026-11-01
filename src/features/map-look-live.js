// Aspecto del mapa, parte animada (la usa map-look.js desde sus envolturas):
//  - liquids: brillo que se desplaza sobre el agua, espuma que respira en las
//    orillas, pulsos y chispas de lava, burbujas de veneno y pantano, arcos de
//    la electricidad y destellos del hielo. Lee las listas de líquidos que
//    map-look.js guarda por trozo al pintarlo; si falta alguna, la calcula con
//    World.kindAt con un presupuesto de un trozo por cuadro.
//  - prop: vaivén de hierba alta y copas (inclinación desde la base del prop)
//    y sombra de contacto más definida, desplazada según la luz.
//  - light: capa de penumbra de baja resolución con huecos de luz alrededor
//    del jugador y de las fuentes (lava, electricidad, veneno, cristales,
//    calabazas), brillos aditivos, ciclo sutil de día y tarde opcional y
//    luciérnagas o motas en Alto. No se activa con la noche del menú de
//    Halloween (World.drawNight), que solo se dibuja fuera de partida.
(() => {
  const L = NX.mapLook || (NX.mapLook = {});
  const TAU = Math.PI * 2;
  const lights = [];       // x, y, color (mundo), por cuadro
  let lightN = 0;
  const MAX_LIGHTS = [0, 0, 24, 60];

  L.resetFrame = () => { lightN = 0; };
  const addLight = (x, y, col, r) => {
    const i = lightN * 4;
    lights[i] = x; lights[i + 1] = y; lights[i + 2] = col; lights[i + 3] = r;
    lightN++;
  };

  // Lista de líquidos del trozo; si map-look.js no la tiene, se calcula aquí.
  let budget = 0;
  function chunkLiq(W, cx, cy) {
    const k = cx + ',' + cy;
    let a = L.liq.get(k);
    if (a || budget <= 0) return a || null;
    budget--;
    const TS = W.TS || 32, N = 16, out = [];
    const isL = (X, Y) => W.kindAt(X * TS + TS / 2, Y * TS + TS / 2) === 'liquid';
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const X = cx * N + i, Y = cy * N + j;
        if (!isL(X, Y)) continue;
        const m = (isL(X, Y - 1) ? 0 : 1) | (isL(X + 1, Y) ? 0 : 2) | (isL(X, Y + 1) ? 0 : 4) | (isL(X - 1, Y) ? 0 : 8);
        out.push(X, Y, m);
      }
    }
    a = Int32Array.from(out);
    L.liq.set(k, a);
    return a;
  }

  const GLOW = { lava: 1, spark: 1, poison: 0.55 };

  // ---------------------------------------------------------------- líquidos
  L.liquids = (ctx, cam, t, q) => {
    lightN = 0;
    budget = 1;
    const ns = L.ns, W = ns.World;
    const P = ns.Tiles.BIOMES[W.biome];
    if (!P) return;
    const TS = W.TS || 32, CW = W.CW || TS * 16;
    const kind = P.liquid;
    const draw = L.opt('liquid');
    const wantLight = q >= 2 && L.opt('light') && GLOW[kind];
    if (!draw && !wantLight) return;
    const x0 = cam.left(), y0 = cam.top(), x1 = x0 + cam.w, y1 = y0 + cam.h;
    const foam = P.foam || '#ffffff', liqCol = P.liq || '#3f86d8';
    const hot = kind === 'lava' || kind === 'spark' || kind === 'poison';
    const maxL = MAX_LIGHTS[q];
    const hash = L.hash;
    for (let cy = Math.floor(y0 / CW); cy <= Math.floor(y1 / CW); cy++) {
      for (let cx = Math.floor(x0 / CW); cx <= Math.floor(x1 / CW); cx++) {
        const a = chunkLiq(W, cx, cy);
        if (!a || !a.length) continue;
        for (let i = 0; i < a.length; i += 3) {
          const X = a[i], Y = a[i + 1], m = a[i + 2];
          const px = X * TS, py = Y * TS;
          if (px + TS < x0 || px > x1 || py + TS < y0 || py > y1) continue;
          const h = hash(X, Y, 77);
          if (wantLight && lightN < maxL && !(X & 1) && !(Y & 1)) addLight(px + TS, py + TS, liqCol, GLOW[kind]);
          if (!draw) continue;
          // Brillo que viaja en diagonal sobre el cuerpo de líquido.
          const band = Math.sin(X * 0.9 + Y * 0.45 - t * (hot ? 1.1 : 1.6));
          if (band > 0.25) {
            ctx.globalAlpha = (band - 0.25) * (kind === 'ice' ? 0.45 : hot ? 0.45 : 0.8);
            ctx.fillStyle = foam;
            const dx = Math.round(Math.sin(t * 0.8 + h * TAU) * 1.5) * 2;
            ctx.fillRect(px + 4 + Math.floor(h * 6) * 2 + dx, py + 8 + Math.floor(hash(X, Y, 78) * 7) * 2, 12, 2);
            if (q >= 2 && band > 0.7) ctx.fillRect(px + 4 + Math.floor(hash(X, Y, 79) * 8) * 2 - dx, py + 4 + Math.floor(h * 4) * 2, 6, 2);
          }
          if (q < 2) continue;
          // Espuma de orilla que avanza y retrocede.
          if (m) {
            const breath = Math.sin(t * 1.4 + h * TAU);
            const ins = breath > 0.3 ? 2 : 0;
            ctx.globalAlpha = 0.28 + 0.22 * (breath + 1) / 2;
            ctx.fillStyle = foam;
            const off = Math.floor(h * 4) * 2;
            if (m & 1) for (let s = off; s < TS; s += 10) ctx.fillRect(px + s, py + ins, 6, 2);
            if (m & 4) for (let s = off; s < TS; s += 10) ctx.fillRect(px + s, py + TS - 2 - ins, 6, 2);
            if (m & 2) for (let s = off; s < TS; s += 10) ctx.fillRect(px + TS - 2 - ins, py + s, 2, 6);
            if (m & 8) for (let s = off; s < TS; s += 10) ctx.fillRect(px + ins, py + s, 2, 6);
          }
          if (kind === 'lava') {
            // Pulso en ondas lentas que cruzan el lago, no tile por tile.
            const pulse = (Math.sin(t * 1.6 - X * 0.55 - Y * 0.35) + 1) / 2;
            ctx.globalAlpha = 0.03 + 0.09 * pulse * pulse;
            ctx.fillStyle = '#ffd08a';
            ctx.fillRect(px, py, TS, TS);
            if (q >= 3 && h < 0.14) {
              const p = (t * 0.5 + h * 7) % 1;
              ctx.globalAlpha = 1 - p;
              ctx.fillStyle = p < 0.5 ? '#fff2a0' : '#ff9a3d';
              ctx.fillRect(px + 8 + Math.floor(hash(X, Y, 80) * 8) * 2 + Math.round(Math.sin(p * 6) * 2) * 2, py + 20 - Math.floor(p * 20) * 2, 2, 2);
            }
          } else if (kind === 'poison' || kind === 'swamp') {
            if (h < 0.3) {
              const p = (t * 0.45 + h * 5) % 1;
              const bx = px + 8 + Math.floor(hash(X, Y, 81) * 8) * 2, by = py + 8 + Math.floor(hash(X, Y, 82) * 8) * 2;
              ctx.fillStyle = foam;
              if (p < 0.8) {
                const r = 1 + Math.floor(p * 3);
                ctx.globalAlpha = 0.55 * (1 - p * 0.6);
                ctx.fillRect(bx - r * 2, by, 2, 2); ctx.fillRect(bx + r * 2, by, 2, 2);
                ctx.fillRect(bx, by - r * 2, 2, 2); ctx.fillRect(bx, by + r * 2, 2, 2);
              } else {
                ctx.globalAlpha = (1 - p) * 3;
                ctx.fillRect(bx - 6, by - 6, 2, 2); ctx.fillRect(bx + 6, by - 6, 2, 2);
                ctx.fillRect(bx - 6, by + 6, 2, 2); ctx.fillRect(bx + 6, by + 6, 2, 2);
              }
            }
          } else if (kind === 'spark') {
            const f = Math.floor(t * 10 + h * 97);
            if (f % 17 === 0) {
              ctx.globalAlpha = 0.9;
              ctx.strokeStyle = foam;
              ctx.lineWidth = 2;
              ctx.beginPath();
              let yy = py + 4 + hash(f, X, Y) * 24;
              ctx.moveTo(px, yy);
              for (let s = 1; s <= 4; s++) { yy = py + 4 + hash(f + s, X, Y) * 24; ctx.lineTo(px + s * 8, yy); }
              ctx.stroke();
            }
          } else if (kind === 'ice' && q >= 3) {
            const g = Math.sin(X * 0.5 - Y * 0.8 + t * 0.9);
            if (g > 0.95) {
              ctx.globalAlpha = (g - 0.95) * 20;
              ctx.fillStyle = '#ffffff';
              const gx = px + 12 + Math.floor(h * 4) * 2, gy = py + 12;
              ctx.fillRect(gx - 4, gy, 10, 2); ctx.fillRect(gx, gy - 4, 2, 10);
            }
          }
        }
      }
    }
    ctx.globalAlpha = 1;
  };

  // ---------------------------------------------------------------- props
  let shadowSpr = null;
  function shadowSprite() {
    if (shadowSpr) return shadowSpr;
    const c = document.createElement('canvas');
    c.width = 64; c.height = 32;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 16, 0, 32, 16, 32);
    gr.addColorStop(0, 'rgba(0,0,0,0.42)');
    gr.addColorStop(0.55, 'rgba(0,0,0,0.30)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.setTransform(1, 0, 0, 0.5, 0, 8);
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    shadowSpr = c;
    return c;
  }
  const SHADOW = { tree: 1.5, rock: 1.25, pumpkin: 1.1, chest: 1.1, altar: 1.2, crate: 1.1, barrel: 1.0 };

  L.prop = (ctx, prop, t, orig, self, args) => {
    const ns = L.ns;
    const P = ns.Tiles.BIOMES[ns.World.biome] || {};
    const type = prop.type;
    // Fuentes de luz para la capa de iluminación.
    if (L.opt('light')) {
      if (type === 'tree' && P.prop === 'crystal' && lightN < MAX_LIGHTS[L.frameQ]) addLight(prop.x, prop.y - 24, (P.leaf && P.leaf[2]) || '#a8f7e4', 0.7);
      else if (type === 'pumpkin' && lightN < MAX_LIGHTS[L.frameQ]) addLight(prop.x, prop.y - 14, '#ff9a3d', 0.8);
      const sk = SHADOW[type];
      if (sk) {
        const r = Math.max(9, (prop.r || 12) * sk);
        ctx.drawImage(shadowSprite(), Math.round(prop.x - r + 3), Math.round(prop.y - r * 0.38), Math.round(r * 2), Math.round(r * 0.9));
      }
    }
    const sway = L.opt('sway') && (type === 'grass' || (type === 'tree' && P.prop !== 'crystal'));
    if (!sway) return orig.apply(self, args);
    const grass = type === 'grass';
    const amp = grass ? 0.11 : 0.035;
    const gust = 0.5 + 0.5 * Math.sin(t * 0.37 + prop.x * 0.0021 + prop.y * 0.0013);
    const k = Math.sin(t * (grass ? 2.2 : 1.15) + (prop.wiggle || 0) * 3 + prop.x * 0.013) * amp * (0.55 + 0.45 * gust);
    ctx.save();
    ctx.transform(1, 0, k, 1, -k * prop.y, 0);
    try { return orig.apply(self, args); } finally { ctx.restore(); }
  };

  // ---------------------------------------------------------------- luz
  const glowCache = new Map();
  function glowSprite(col) {
    let c = glowCache.get(col);
    if (c) return c;
    c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const [r, gg, b] = L.rgb(col);
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, `rgba(${r},${gg},${b},1)`);
    gr.addColorStop(0.4, `rgba(${r},${gg},${b},.45)`);
    gr.addColorStop(1, `rgba(${r},${gg},${b},0)`);
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    glowCache.set(col, c);
    return c;
  }
  let mask = null, mg = null;
  const lumCache = new WeakMap();
  const darkFor = (P) => {
    let d = lumCache.get(P);
    if (d != null) return d;
    const [r, g, b] = L.rgb(P.floor && P.floor[0]);
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    d = NX.clamp(0.07 + lum * 0.16, 0.08, 0.2);
    lumCache.set(P, d);
    return d;
  };
  const MOTES = { forest: '#d8ff6a', swamp: '#b4ff4a', harvest: '#ffb347', volcano: '#ffb04a', cave: '#a8f7e4', ice: '#ffffff', city: '#7ff0ff', ghost: '#c79bff', desert: '#ffe2a8' };

  L.light = (ctx, w, h, q, t) => {
    if (!L.opt('light')) return;
    const ns = L.ns, C = ns.Camera, W = ns.World;
    const P = ns.Tiles.BIOMES[W.biome];
    const me = NX.me();
    if (!P || !me) return;
    const sc = C.scale || 1, left = C.left(), top = C.top();
    const halloween = !!(ns.Halloween && ns.Halloween.on);
    // Tarde: un ciclo de 6 minutos con el reloj de la partida, nunca de noche.
    let eve = 0;
    if (L.opt('cycle', false) && !halloween) {
      const gt = (ns.Game.st && ns.Game.st.time) || 0;
      eve = (1 - Math.cos((gt / 360) * TAU)) / 2;
    }
    const dark = darkFor(P) + eve * 0.09;
    const MW = Math.ceil(w / 4), MH = Math.ceil(h / 4);
    if (!mask) { mask = document.createElement('canvas'); mg = mask.getContext('2d'); }
    if (mask.width !== MW || mask.height !== MH) { mask.width = MW; mask.height = MH; }
    mg.globalCompositeOperation = 'source-over';
    mg.clearRect(0, 0, MW, MH);
    mg.fillStyle = `rgba(10,12,32,${dark.toFixed(3)})`;
    mg.fillRect(0, 0, MW, MH);
    mg.globalCompositeOperation = 'destination-out';
    const hole = glowSprite('#000000');
    const [mx, my] = [(me.x - left) * sc / 4, (me.y - 18 - top) * sc / 4];
    const pr = Math.min(w, h) * 0.5 / 4;
    mg.globalAlpha = 1;
    mg.drawImage(hole, mx - pr, my - pr, pr * 2, pr * 2);
    for (let i = 0; i < lightN; i++) {
      const j = i * 4;
      const sx = (lights[j] - left) * sc / 4, sy = (lights[j + 1] - top) * sc / 4, rr = 80 * sc * lights[j + 3] / 4;
      if (sx < -rr || sy < -rr || sx > MW + rr || sy > MH + rr) continue;
      mg.globalAlpha = 0.8;
      mg.drawImage(hole, sx - rr, sy - rr, rr * 2, rr * 2);
    }
    mg.globalAlpha = 1;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(mask, 0, 0, w, h);
    if (eve > 0.02) {
      ctx.globalCompositeOperation = 'soft-light';
      ctx.globalAlpha = eve * 0.28;
      ctx.fillStyle = '#ff9a4a';
      ctx.fillRect(0, 0, w, h);
    }
    // Brillos de color sobre las fuentes y un halo cálido muy tenue en el jugador.
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.05;
    const pg = glowSprite('#ffe2b0'), PR = pr * 4 * 0.5;
    ctx.drawImage(pg, mx * 4 - PR, my * 4 - PR, PR * 2, PR * 2);
    const pulse = 0.85 + 0.15 * Math.sin(t * 2.1);
    for (let i = 0; i < lightN; i++) {
      const j = i * 4;
      const sx = (lights[j] - left) * sc, sy = (lights[j + 1] - top) * sc, rr = 70 * sc * lights[j + 3];
      if (sx < -rr || sy < -rr || sx > w + rr || sy > h + rr) continue;
      ctx.globalAlpha = 0.16 * pulse * lights[j + 3];
      ctx.drawImage(glowSprite(lights[j + 2]), sx - rr, sy - rr, rr * 2, rr * 2);
    }
    // Alto: luciérnagas, brasas o motas según el bioma, fijas al mundo.
    if (q >= 3) {
      const col = MOTES[L.styleOf(P)] || '#ffffff';
      const spr = glowSprite(col);
      const CELL = 170, hash = L.hash;
      const c0x = Math.floor(left / CELL), c1x = Math.floor((left + w / sc) / CELL);
      const c0y = Math.floor(top / CELL), c1y = Math.floor((top + h / sc) / CELL);
      for (let cy = c0y; cy <= c1y; cy++) {
        for (let cx = c0x; cx <= c1x; cx++) {
          const r = hash(cx, cy, 991);
          if (r > 0.55) continue;
          const ph = r * 40;
          const wx = cx * CELL + hash(cx, cy, 992) * CELL + Math.sin(t * 0.6 + ph) * 22;
          const wy = cy * CELL + hash(cx, cy, 993) * CELL + Math.cos(t * 0.45 + ph) * 16;
          const sx = (wx - left) * sc, sy = (wy - top) * sc;
          const blink = (Math.sin(t * 2.3 + ph * 3) + 1) / 2;
          ctx.globalAlpha = 0.25 + 0.55 * blink;
          ctx.drawImage(spr, sx - 6, sy - 6, 12, 12);
          ctx.globalAlpha = 0.9 * blink;
          ctx.fillStyle = col;
          ctx.fillRect(Math.round(sx) - 1, Math.round(sy) - 1, 2, 2);
        }
      }
    }
  };
})();
