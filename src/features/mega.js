// Megaevolución. Con una Megapiedra en la partida y un Pokémon que tenga mega,
// el daño hecho carga una barra; al llenarse, la tecla G, el botón MEGA del HUD
// o su toque lo transforman durante unos segundos: sprite mega, estadísticas
// de la mega (las de la serie, por proporción sobre las del juego), tipos de
// la mega, aura y efecto de transformación. Al terminar vuelve a su forma.
//
// Megapiedra: la sueltan los jefes (probabilidad ajustable), a veces sale de
// un objeto de cofre, la da la raid legendaria (raids.js), aparece a veces en
// la tienda entre oleadas (shop.js, NX.shop.addOffer) y se guarda en reserva
// para otra partida si sale sin un Pokémon compatible (NX.megaApi.addStock).
//
// Sprites: la edición trae las formas de SpriteCollab en assets/pokemon/<clave>/
// y su SPRITE_META en nexus/megas.json (scripts/fetch-megas.mjs). Sin esos
// archivos (laboratorio) usa el sprite normal agrandado, o se desactiva si
// así se elige en los ajustes.
(() => {
  const KEY = 'mega';
  const S_DUR = 'pkm:mega:dur', S_BOSS = 'pkm:mega:boss', S_CHEST = 'pkm:mega:chest', S_START = 'pkm:mega:start';
  const S_FALL = 'pkm:mega:fallback', S_USES = 'pkm:mega:uses', S_STOCK = 'pkm:mega:stock';
  // dex -> [clave, nombre, tipos, base [PS, Atq, Def, AtE, DfE, Vel], mega]
  const TABLE = {
    6: ['6mx', 'Mega-Charizard X', ['fire', 'dragon'], [78, 84, 78, 109, 85, 100], [78, 130, 111, 130, 85, 100]],
    65: ['65m', 'Mega-Alakazam', ['psychic'], [55, 50, 45, 135, 95, 120], [55, 50, 65, 175, 105, 150]],
    94: ['94m', 'Mega-Gengar', ['ghost', 'poison'], [60, 65, 60, 130, 75, 110], [60, 65, 80, 170, 95, 130]],
    115: ['115m', 'Mega-Kangaskhan', ['normal'], [105, 95, 80, 40, 80, 90], [105, 125, 100, 60, 100, 100]],
    142: ['142m', 'Mega-Aerodactyl', ['rock', 'flying'], [80, 105, 65, 60, 75, 130], [80, 135, 85, 70, 95, 150]],
    150: ['150my', 'Mega-Mewtwo Y', ['psychic'], [106, 110, 90, 154, 90, 130], [106, 150, 70, 194, 120, 140]],
    208: ['208m', 'Mega-Steelix', ['steel', 'ground'], [75, 85, 200, 55, 65, 30], [75, 125, 230, 55, 95, 30]],
    229: ['229m', 'Mega-Houndoom', ['dark', 'fire'], [75, 90, 50, 110, 80, 95], [75, 90, 90, 140, 90, 115]],
    248: ['248m', 'Mega-Tyranitar', ['rock', 'dark'], [100, 134, 110, 95, 100, 61], [100, 164, 150, 95, 120, 71]],
    282: ['282m', 'Mega-Gardevoir', ['psychic', 'fairy'], [68, 65, 65, 125, 115, 80], [68, 85, 65, 165, 135, 100]],
    302: ['302m', 'Mega-Sableye', ['dark', 'ghost'], [50, 75, 75, 65, 65, 50], [50, 85, 125, 85, 115, 20]],
    303: ['303m', 'Mega-Mawile', ['steel', 'fairy'], [50, 85, 85, 55, 55, 50], [50, 105, 125, 55, 95, 50]],
    308: ['308m', 'Mega-Medicham', ['fighting', 'psychic'], [60, 60, 75, 60, 75, 80], [60, 100, 85, 80, 85, 100]],
    310: ['310m', 'Mega-Manectric', ['electric'], [70, 75, 60, 105, 60, 105], [70, 75, 80, 135, 80, 135]],
    323: ['323m', 'Mega-Camerupt', ['fire', 'ground'], [70, 100, 70, 105, 75, 40], [70, 120, 100, 145, 105, 20]],
    334: ['334m', 'Mega-Altaria', ['dragon', 'fairy'], [75, 70, 90, 70, 105, 80], [75, 110, 110, 110, 105, 80]],
    354: ['354m', 'Mega-Banette', ['ghost'], [64, 115, 65, 83, 63, 65], [64, 165, 75, 93, 83, 75]],
    359: ['359m', 'Mega-Absol', ['dark'], [65, 130, 60, 75, 60, 75], [65, 150, 60, 115, 60, 115]],
    362: ['362m', 'Mega-Glalie', ['ice'], [80, 80, 80, 80, 80, 80], [80, 120, 80, 120, 80, 100]],
    380: ['380m', 'Mega-Latias', ['dragon', 'psychic'], [80, 80, 90, 110, 130, 110], [80, 100, 120, 140, 150, 110]],
    381: ['381m', 'Mega-Latios', ['dragon', 'psychic'], [80, 90, 80, 130, 110, 110], [80, 130, 100, 160, 120, 110]],
    384: ['384m', 'Mega-Rayquaza', ['dragon', 'flying'], [105, 150, 90, 150, 90, 95], [105, 180, 100, 180, 100, 115]],
    428: ['428m', 'Mega-Lopunny', ['normal', 'fighting'], [65, 76, 84, 54, 96, 105], [65, 136, 94, 54, 96, 135]],
    448: ['448m', 'Mega-Lucario', ['fighting', 'steel'], [70, 110, 70, 115, 70, 90], [70, 145, 88, 140, 70, 112]],
    475: ['475m', 'Mega-Gallade', ['psychic', 'fighting'], [68, 125, 65, 65, 115, 80], [68, 165, 95, 65, 115, 110]],
  };
  const COLORS = ['#b678ff', '#ff7ad9', '#ffb347', '#6fe3ff'];
  let ns = null, pm = null;
  let sprites = null; // null: cargando · true: hay sprites mega · false: no hay
  let spriteKeys = new Set();
  let run = null;

  const megaOf = (dex) => TABLE[dex] || null;
  const fallbackOn = () => NX.store.get(S_FALL, true) !== false;
  // ¿Este Pokémon puede megaevolucionar en esta edición?
  const canMega = (dex) => {
    const m = megaOf(dex);
    if (!m) return false;
    if (spriteKeys.has(m[0])) return true;
    return sprites !== null && fallbackOn();
  };
  const stock = () => Math.max(0, NX.store.get(S_STOCK, 0) | 0);
  const addStock = (n) => NX.store.set(S_STOCK, stock() + (n | 0));

  // ---------------------------------------------------------------- sprites de la edición
  function assetBase() {
    const s = document.querySelector('script[src*="js/app.min.js"]');
    return s && s.src ? s.src.replace(/js\/app\.min\.js.*$/, '') : location.origin + '/';
  }
  async function loadSprites() {
    try {
      const res = await fetch(assetBase() + 'nexus/megas.json', { cache: 'no-cache' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const j = await res.json();
      const META = ns.SPRITE_META;
      for (const m of Object.values((j && j.megas) || {})) {
        if (!m || !m.key || !m.meta || !m.meta.a || !m.meta.a.Idle) continue;
        const baseMeta = META[m.dex] || {};
        META[m.key] = Object.assign({}, m.meta, baseMeta.hv ? { hv: 1 } : {});
        spriteKeys.add(m.key);
        if (!TABLE[m.dex] && Array.isArray(m.base) && Array.isArray(m.mega)) TABLE[m.dex] = [m.key, m.name, m.types || [], m.base, m.mega];
      }
      sprites = spriteKeys.size > 0;
    } catch (_) {
      sprites = false;
    }
  }

  // ---------------------------------------------------------------- Megapiedra
  function grant(reason) {
    if (!run || !NX.isOn(KEY)) { addStock(1); return; }
    const p = run.p;
    if (run.stone || !p || !canMega(p.dex)) {
      addStock(1);
      NX.toast(`Megapiedra guardada en la reserva (${stock()})`);
      return;
    }
    run.stone = true;
    run.charge.reset();
    pm.sfx('shinyGet');
    try {
      ns.FX.ring(p.x, p.y, 6, 60, '#ff7ad9', 0.6, 4);
      ns.FX.burst(p.x, p.y - p.bodyH * 0.5, '#ffb347', 18, 120);
    } catch (_) { /* sin efectos */ }
    pm.say('¡Obtuviste una Megapiedra!' + (reason ? ' (' + reason + ')' : ''), 3);
  }

  // Tienda entre oleadas (shop.js): la Megapiedra es una oferta rara que solo
  // sale si el Pokémon de la partida tiene mega y aún no lleva piedra. Si la
  // tienda carga después, la oferta espera en NX.shop._q.
  const OFFER = {
    id: 'pkm-megastone', name: 'Megapiedra', icon: 'up', cost: 14, weight: 0.6,
    desc: 'Permite megaevolucionar en esta partida (barra MEGA, tecla G).',
    when: (p) => NX.isOn(KEY) && !!run && run.p === p && !run.stone && canMega(p.dex),
    buy: (p) => { if (!run || run.p !== p || run.stone) return false; grant('tienda'); return true; },
  };
  if (NX.shop && typeof NX.shop.addOffer === 'function') NX.shop.addOffer(OFFER);
  else (NX.shop = NX.shop || { _q: [] })._q && NX.shop._q.push(OFFER);

  // ---------------------------------------------------------------- transformación
  function megaMod(p, m) {
    const [key, name, types, b, g] = m;
    const r = (i) => (b[i] > 0 ? g[i] / b[i] : 1);
    const mod = {
      form: true,
      spd: NX.clamp(r(5), 0.6, 1.4),
      mon(c, o) {
        c.name = name;
        c.types = types.slice();
        if (typeof o.pa === 'number') c.pa = o.pa * r(1);
        if (typeof o.sa === 'number') c.sa = o.sa * r(3);
        if (typeof o.df === 'number') c.df = o.df * r(2);
        if (typeof o.sd === 'number') c.sd = o.sd * r(4);
        c.bst = (o.bst || 0) + 100;
        c.mega = key;
      },
    };
    if (spriteKeys.has(key)) mod.sprite = { dex: key, shiny: !!p.shiny && ns.Sprites.hasShiny(key) };
    else mod.size = 1.25;
    return mod;
  }

  async function activate() {
    const p = run && run.p;
    if (!p || p.dead || run.active || run.pending || !run.stone || !run.charge.full || !canMega(p.dex) || pm.formActive(p)) {
      if (run && run.stone && !run.charge.full) NX.toast('La barra de megaevolución aún no está llena');
      return;
    }
    const m = megaOf(p.dex);
    run.pending = true;
    try {
      if (spriteKeys.has(m[0])) await ns.Sprites.preload([m[0]], 3000, !!p.shiny);
    } catch (_) { /* se dibuja al cargar */ }
    run.pending = false;
    if (!run || run.p !== p || p.dead || NX.me() !== p) return;
    const baseName = (pm.origMon(p) || {}).name || 'Tu Pokémon';
    pm.setMod(p, KEY, megaMod(p, m));
    const dur = NX.clamp(+NX.store.get(S_DUR, 25) || 25, 5, 120);
    run.active = { t: dur, dur, key: m[0], t0: performance.now() };
    run.uses++;
    run.charge.reset();
    p.invuln = Math.max(p.invuln || 0, 1);
    pm.sfx('legend');
    pm.kick(0.8);
    pm.flash('#ffffff', 0.45, 0.6);
    pm.bigText('¡Megaevolución!', '#ff9ed8', `${baseName} megaevolucionó en ${m[1]}`);
    try {
      for (let i = 0; i < 4; i++) ns.FX.ring(p.x, p.y, 4 + i * 6, 70 + i * 28, COLORS[i], 0.45 + i * 0.12, 4);
      for (const c of COLORS) ns.FX.burst(p.x, p.y - p.bodyH * 0.5, c, 14, 170);
    } catch (_) { /* sin efectos */ }
  }

  function revert(quiet) {
    const p = run && run.p;
    if (!run || !run.active) return;
    run.active = null;
    if (p) {
      pm.clearMod(p, KEY);
      if (!quiet) {
        try { ns.FX.ring(p.x, p.y, 6, 54, '#b678ff', 0.4, 3); ns.FX.burst(p.x, p.y - p.bodyH * 0.5, '#ffffff', 10, 90); } catch (_) { /* nada */ }
        NX.toast('La megaevolución terminó');
      }
    }
    if (NX.store.get(S_USES, 'recharge') === 'once') run.stone = false;
  }

  function tick(dt, p) {
    if (!run || run.p !== p) return;
    if (run.active) {
      run.active.t -= dt;
      if (run.active.t <= 0 || p.dead || !pm.hasMod(p, KEY)) revert();
      else if (Math.random() < dt * 10) { try { ns.FX.twinkle(p.x + (Math.random() - 0.5) * p.r * 3, p.y - Math.random() * p.bodyH); } catch (_) { /* nada */ } }
    } else if (run.stone && canMega(p.dex)) run.charge.update(p);
  }

  // ---------------------------------------------------------------- dibujo (mundo)
  function drawAura(ctx, p, front) {
    const a = run.active, now = performance.now() / 1000;
    const k = Math.min(1, (performance.now() - a.t0) / 500);
    const rx = p.r * 2.1, ry = p.r * 0.85;
    if (!front) {
      pm.ellipseGlow(ctx, p.x, p.y, rx * 1.5, ry * 1.6, 'rgba(182,120,255,.55)', 0.55 * k);
      ctx.save();
      ctx.lineWidth = 3;
      for (let i = 0; i < 4; i++) {
        const s = now * 2.4 + (i * Math.PI) / 2;
        ctx.strokeStyle = COLORS[i];
        ctx.globalAlpha = 0.75 * k;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, rx, ry, 0, s, s + 1.1);
        ctx.stroke();
      }
      ctx.restore();
      return;
    }
    // Delante: llamas de energía que suben y el símbolo mega sobre la cabeza.
    ctx.save();
    for (let i = 0; i < 6; i++) {
      const ph = (now * 1.3 + i / 6) % 1, ang = i * 1.047 + now;
      const x = p.x + Math.cos(ang) * rx * 0.8, y = p.y - ph * p.bodyH * 1.1;
      ctx.globalAlpha = (1 - ph) * 0.8 * k;
      ctx.fillStyle = COLORS[i % 4];
      ctx.beginPath();
      ctx.ellipse(x, y, 2.2, 4.5 * (1 - ph) + 1, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    const hx = p.x, hy = p.y - p.bodyH - 12 + Math.sin(now * 3) * 2, R = 6;
    ctx.globalAlpha = k;
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = COLORS[i];
      ctx.beginPath();
      ctx.moveTo(hx, hy);
      ctx.arc(hx, hy, R, now * 3 + (i * Math.PI) / 2, now * 3 + ((i + 1) * Math.PI) / 2);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(hx, hy, R * 0.42, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(11,24,56,.85)';
    ctx.beginPath();
    ctx.arc(hx, hy, R, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  function drawables() {
    const p = run && run.p;
    if (!p || !run.active || p !== NX.me()) return null;
    return [
      { y: p.y - 0.5, draw: (ctx) => drawAura(ctx, p, false) },
      { y: p.y + 0.5, draw: (ctx) => drawAura(ctx, p, true) },
    ];
  }

  // ---------------------------------------------------------------- arranque
  NX.feature({
    key: KEY,
    label: 'Megaevolución',
    needs: (n) => !!NX.pm && NX.featureList().some((f) => f.key === 'pokemech' && f.status === 'ok') && n.SPRITE_META && n.Enemy && n.Pickups && typeof n.Pickups.drop === 'function',
    setup(n) {
      ns = n;
      pm = NX.pm;
      loadSprites();
      // Jefes derrotados y objetos de cofre.
      let inBossDie = false;
      const EP = ns.Enemy.prototype, die = EP.die;
      EP.die = function () {
        const was = this.dead, boss = this.boss && !this.remote && !this.judge;
        inBossDie = !!boss;
        let r;
        try { r = die.apply(this, arguments); } finally { inBossDie = false; }
        try {
          if (boss && !was && this.dead && run && NX.isOn(KEY) && pm.allowed() && !this.__pkmRaid) {
            const ch = NX.clamp(+NX.store.get(S_BOSS, 35) || 0, 0, 100) / 100;
            if (Math.random() < ch) grant('jefe');
          }
        } catch (err) { NX.trip(KEY, err); }
        return r;
      };
      const P = ns.Pickups, drop = P.drop;
      P.drop = function (kind) {
        const r = drop.apply(this, arguments);
        try {
          if (kind === 'item' && !inBossDie && run && NX.isOn(KEY) && pm.allowed()) {
            const ch = NX.clamp(+NX.store.get(S_CHEST, 6) || 0, 0, 100) / 100;
            if (Math.random() < ch) grant('cofre');
          }
        } catch (err) { NX.trip(KEY, err); }
        return r;
      };
      pm.onRun('start', (p) => {
        run = { p, stone: false, charge: pm.charge(40, 300), active: null, pending: false, uses: 0 };
        if (!NX.isOn(KEY) || !pm.allowed()) return;
        if (NX.store.get(S_START, false)) run.stone = true;
        else if (stock() > 0 && canMega(p.dex)) {
          addStock(-1);
          run.stone = true;
          setTimeout(() => NX.toast(`Megapiedra de la reserva lista (quedan ${stock()})`), 1200);
        }
      });
      pm.onRun('end', () => { if (run) run.active = null; run = null; });
      pm.onTick(KEY, tick);
      pm.drawables(KEY, drawables);
      pm.button({
        id: KEY, feat: KEY, label: 'MEGA', title: 'Megaevolución', key: 'G', keyCode: 'KeyG', color: '#ff7ad9',
        state() {
          const p = run && run.p;
          if (!p || p !== NX.me() || !pm.allowed() || !run.stone || !canMega(p.dex)) return null;
          if (run.active) return { show: true, active: NX.clamp(run.active.t / run.active.dur, 0, 1) };
          return { show: true, ready: run.charge.full && !pm.formActive(p), frac: run.charge.frac };
        },
        run: activate,
        fill: () => run && run.charge.fill(),
      });
      // Si el módulo se apaga a mitad de partida, la forma se deshace.
      NX.every(500, () => { if (run && run.active && !NX.isOn(KEY)) revert(true); }, { when: 'run', key: KEY });
    },
  });

  NX.megaApi = {
    grant, addStock, stock,
    available: (dex) => canMega(dex),
    list: () => Object.entries(TABLE).map(([dex, m]) => ({ dex: +dex, key: m[0], name: m[1], sprite: spriteKeys.has(m[0]) })),
  };

  NX.settings.section({
    key: KEY,
    tab: 'Partida',
    title: 'Megaevolución',
    keywords: 'mega megaevolucion megapiedra piedra transformacion charizard gengar lucario',
    render(el) {
      el.appendChild(NX.ui.toggle('Activado', 'on:' + KEY, true));
      el.appendChild(NX.ui.range('Duración', S_DUR, 10, 60, 5, 25, (v) => v + ' s'));
      el.appendChild(NX.ui.select('Usos por Megapiedra', S_USES, [['recharge', 'Se recarga con el daño'], ['once', 'Uno por partida']], 'recharge'));
      el.appendChild(NX.ui.range('Probabilidad de Megapiedra al vencer un jefe', S_BOSS, 0, 100, 5, 35, (v) => v + '%'));
      el.appendChild(NX.ui.range('Probabilidad con cada objeto de cofre', S_CHEST, 0, 30, 1, 6, (v) => v + '%'));
      el.appendChild(NX.ui.toggle('Empezar cada partida con la Megapiedra', S_START, false));
      el.appendChild(NX.ui.toggle('Sin sprites mega, usar el sprite normal agrandado', S_FALL, true));
      const st = sprites === null ? 'cargando' : sprites ? `${spriteKeys.size} formas con sprite` : 'sin sprites mega (laboratorio)';
      el.appendChild(NX.ui.note(`Megapiedras en reserva: ${stock()} · Sprites: ${st}. Con Megapiedra, el daño carga la barra MEGA; al llenarse, G o el botón transforman al Pokémon. Mientras dura cambia de sprite, tipos y estadísticas (las de la serie, unos +100 puntos en total). La reserva guarda las piedras que salen sin un Pokémon compatible y se gasta sola al empezar con uno que sí tenga mega.`));
      el.appendChild(NX.ui.note('Megas: ' + Object.values(TABLE).map((m) => m[1].replace('Mega-', '')).join(', ') + '.'));
    },
  });
})();
