// Compañero. Un segundo Pokémon, elegido entre los que tiene el jugador, lo
// sigue durante la partida y ataca solo con un movimiento básico de su tipo:
// un disparo al enemigo más cercano a su alcance. No tiene vida propia ni
// puede recibir daño (no entra en la lista de enemigos ni en las colisiones
// del juego). Usa el sprite del juego (Sprites.Animator) y sus disparos son
// propios del módulo: golpean con Enemy.hurt y la tabla de tipos, sin pasar
// por los proyectiles del juego (no cuentan para las estadísticas de los
// movimientos ni cargan las barras de mega y Z).
(() => {
  const KEY = 'companion';
  const S_DEX = 'pkm:comp:dex', S_POW = 'pkm:comp:pow';
  const BASIC = {
    normal: 'Rapidez', fire: 'Ascuas', water: 'Pistola Agua', grass: 'Hoja Afilada', electric: 'Impactrueno', ice: 'Canto Helado',
    fighting: 'Onda Vacío', poison: 'Ácido', ground: 'Bofetón Lodo', flying: 'Tornado', psychic: 'Confusión', bug: 'Estoicismo',
    rock: 'Lanzarrocas', ghost: 'Impresionar', dragon: 'Dracoaliento', dark: 'Mordisco', steel: 'Garra Metal', fairy: 'Viento Feérico',
  };
  const RANGE = 320, SPEED = 320, CD = 1.05;
  let ns = null, pm = null, comp = null;

  const owned = () => {
    try {
      const o = (ns && ns.DB.save && ns.DB.save.owned) || {};
      const list = (Array.isArray(o) ? o : Object.keys(o)).map(Number).filter((d) => d > 0 && ns.DEX_BY[d] && ns.SPRITE_META[d]);
      return [...new Set(list)].sort((a, b) => a - b);
    } catch (_) { return []; }
  };
  function pickDex(p) {
    const want = +NX.store.get(S_DEX, 0) || 0;
    const mine = owned().filter((d) => d !== p.dex);
    if (want && want !== p.dex && ns.DEX_BY[want] && ns.SPRITE_META[want] && (mine.includes(want) || !mine.length)) return want;
    if (mine.length) return mine[Math.floor(Math.random() * mine.length)];
    // Sin otros Pokémon propios (invitado nuevo): uno de los iniciales.
    const st = (ns.STARTERS || []).map((s) => (typeof s === 'object' ? s.dex : s)).filter((d) => d && d !== p.dex && ns.SPRITE_META[d]);
    return st.length ? st[Math.floor(Math.random() * st.length)] : 25;
  }

  async function spawn(p) {
    const dex = pickDex(p);
    const shiny = (() => { try { return !!ns.DB.ownsShiny(dex) && ns.Sprites.hasShiny(dex); } catch (_) { return false; } })();
    try { await ns.Sprites.preload([dex], 3000, shiny); } catch (_) { /* se dibuja al cargar */ }
    if (!NX.runs.current() || NX.me() !== p) return;
    const mon = ns.DEX_BY[dex] || {};
    const type = (mon.types || ['normal'])[0];
    const scale = (ns.Sprites.playerScale(dex) || 1) * 0.85;
    comp = {
      p, dex, shiny, type, name: mon.name || '', col: pm.typeColor(type), scale,
      anim: new ns.Sprites.Animator(dex, scale, shiny),
      x: p.x - 30, y: p.y + 10, cd: 1.5, shots: [], walk: false, face: Math.PI / 2,
    };
    try { ns.FX.ring(comp.x, comp.y, 4, 30, comp.col, 0.4, 3); } catch (_) { /* nada */ }
  }

  function tick(dt, p) {
    const c = comp;
    if (!c || c.p !== p) return;
    // Seguir al jugador, un poco detrás según hacia dónde camina.
    const back = p.moveAngle != null ? p.moveAngle : Math.PI / 2;
    const tx = p.x - Math.cos(back) * (p.r + 26) + Math.cos(back + Math.PI / 2) * 14;
    const ty = p.y - Math.sin(back) * (p.r + 26) + Math.sin(back + Math.PI / 2) * 14;
    const dx = tx - c.x, dy = ty - c.y, d = Math.hypot(dx, dy);
    if (d > 520) { c.x = tx; c.y = ty; }
    else if (d > 3) {
      const sp = Math.min(d * 5, Math.max(120, (p.spd || 100) * 1.5));
      c.x += (dx / d) * sp * dt;
      c.y += (dy / d) * sp * dt;
      c.face = Math.atan2(dy, dx);
    }
    const walking = d > 8;
    if (walking !== c.walk) { c.walk = walking; try { c.anim.loop(walking ? 'Walk' : 'Idle'); } catch (_) { /* nada */ } }
    // Atacar al más cercano.
    c.cd -= dt;
    if (c.cd <= 0 && !p.dead) {
      let best = null, bd = Infinity;
      for (const e of ns.EnemyMgr.queryCircle(c.x, c.y, RANGE)) {
        if (!e || e.dead || e.remote || e.arceus) continue;
        const q = (e.x - c.x) ** 2 + (e.y - c.y) ** 2;
        if (q < bd) { bd = q; best = e; }
      }
      if (best) {
        const ang = Math.atan2(best.y - c.y, best.x - c.x);
        c.face = ang;
        const pow = NX.clamp(+NX.store.get(S_POW, 1) || 1, 0.25, 3);
        const dmg = (10 + 1.6 * (p.level || 1)) * (p.atk || 1) * pow;
        c.shots.push({ x: c.x, y: c.y - 10, vx: Math.cos(ang) * SPEED, vy: Math.sin(ang) * SPEED, life: 1.25, dmg, r: 6 });
        try { c.anim.play(ns.Sprites.animMeta(c.dex, 'Shoot') ? 'Shoot' : 'Attack', { speed: 1.4 }); } catch (_) { /* nada */ }
        c.cd = CD;
        c.fired = (c.fired || 0) + 1;
      } else c.cd = 0.25;
    }
    try { c.anim.dir = ns.Sprites.dirFromAngle(c.face); } catch (_) { /* nada */ }
    try { c.anim.update(dt); } catch (_) { /* nada */ }
    // Disparos.
    for (let i = c.shots.length - 1; i >= 0; i--) {
      const s = c.shots[i];
      s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
      let hit = null;
      if (s.life > 0) for (const e of ns.EnemyMgr.queryCircle(s.x, s.y + 10, s.r)) { if (e && !e.dead && !e.remote && !e.arceus) { hit = e; break; } }
      if (hit) {
        let k = 1;
        try { k = ns.Types.mult(c.type, hit.types); } catch (_) { k = 1; }
        try { hit.hurt(s.dmg * k, c.col, s.vx, s.vy, 30); c.hits = (c.hits || 0) + 1; } catch (err) { NX.trip(KEY, err); }
        try { ns.FX.burst(s.x, s.y, c.col, 6, 80); } catch (_) { /* nada */ }
      }
      if (hit || s.life <= 0) c.shots.splice(i, 1);
    }
  }

  function drawables() {
    const c = comp;
    if (!c || c.p !== NX.me()) return null;
    const out = [{
      y: c.y,
      draw: (ctx) => {
        try { ns.Sprites.drawShadow(ctx, c.dex, c.x, c.y, c.scale); } catch (_) { /* nada */ }
        c.anim.draw(ctx, c.x, c.y, {});
        // Marca de compañero: un punto del color del tipo sobre la cabeza.
        ctx.save();
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = c.col;
        ctx.strokeStyle = 'rgba(11,24,56,.9)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(c.x, c.y - (ns.Sprites.bodyHeight(c.dex, c.scale) || 30) - 6, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      },
    }];
    for (const s of c.shots) {
      out.push({
        y: s.y + 10,
        draw: (ctx) => {
          pm.ellipseGlow(ctx, s.x, s.y, 12, 12, c.col, 0.8);
          ctx.save();
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(s.x, s.y, 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        },
      });
    }
    return out;
  }

  NX.feature({
    key: KEY,
    label: 'Compañero',
    needs: (n) => !!NX.pm && NX.featureList().some((f) => f.key === 'pokemech' && f.status === 'ok') && n.Sprites && typeof n.Sprites.Animator === 'function' &&
      typeof n.Sprites.dirFromAngle === 'function' && n.DB && n.DEX_BY,
    setup(n) {
      ns = n;
      pm = NX.pm;
      pm.onRun('start', (p) => { comp = null; if (NX.isOn(KEY) && pm.allowed()) { p.__pkmCompTried = true; spawn(p); } });
      pm.onRun('end', () => { comp = null; });
      pm.onTick(KEY, tick);
      pm.drawables(KEY, drawables);
      // Botón "Usar como compañero" en la ficha de la Pokédex.
      NX.onReady(() => {
        const det = document.getElementById('dex-detail');
        if (!det) return;
        const dexOfDetail = () => {
          const first = det.querySelector('.center > div');
          const m = first && /(\d{1,4})/.exec(first.textContent);
          return m ? +m[1] : 0;
        };
        const paint = () => {
          let box = det.querySelector('.nx-comp-pick');
          const dex = dexOfDetail();
          if (!NX.isOn(KEY) || !dex || !owned().includes(dex)) { if (box) box.remove(); return; }
          const cur = +NX.store.get(S_DEX, 0) || 0;
          const sig = dex + '|' + cur;
          if (box && box.dataset.sig === sig) return;
          if (!box) { box = document.createElement('div'); box.className = 'row nx-comp-pick'; box.style.cssText = 'gap:6px;margin:6px 0;justify-content:center'; det.appendChild(box); }
          box.dataset.sig = sig;
          box.innerHTML = cur === dex
            ? '<button type="button" class="btn small gold" disabled>Es tu compañero</button><button type="button" class="btn small ghost" data-x>Quitar (al azar)</button>'
            : '<button type="button" class="btn small" data-use>Usar como compañero</button>';
          const use = box.querySelector('[data-use]'), x = box.querySelector('[data-x]');
          if (use) use.addEventListener('click', () => { NX.store.set(S_DEX, dex); NX.toast('Compañero elegido para la próxima partida'); paint(); });
          if (x) x.addEventListener('click', () => { NX.store.set(S_DEX, 0); NX.toast('Compañero al azar entre los tuyos'); paint(); });
        };
        new MutationObserver(() => { try { paint(); } catch (err) { NX.trip(KEY, err); } }).observe(det, { childList: true });
      });
      // Apagado a mitad de partida: desaparece; encendido: aparece.
      setInterval(() => {
        const p = NX.runs.current();
        if (!NX.isOn(KEY)) comp = null;
        else if (p && !comp && pm.allowed() && !p.__pkmCompTried) { p.__pkmCompTried = true; spawn(p); }
      }, 1000);
    },
  });

  // Para pruebas desde la consola.
  NX.companionApi = { state: () => (comp ? { same: comp.p === NX.me(), dex: comp.dex, name: comp.name, type: comp.type, x: Math.round(comp.x), y: Math.round(comp.y), shots: comp.shots.length, fired: comp.fired || 0, hits: comp.hits || 0 } : null) };

  NX.settings.section({
    key: KEY,
    tab: 'Partida',
    title: 'Compañero',
    keywords: 'compañero companero segundo pokemon seguidor aliado',
    render(el) {
      el.appendChild(NX.ui.toggle('Activado', 'on:' + KEY, true));
      const list = ns ? owned() : [];
      const name = (d) => (NX.gd ? NX.gd.monName(d) : (ns && ns.DEX_BY[d] && ns.DEX_BY[d].name) || '#' + d);
      el.appendChild(NX.ui.select('Pokémon compañero', S_DEX, [['0', 'Al azar entre los míos'], ...list.map((d) => [String(d), `#${d} ${name(d)}`])], '0'));
      el.appendChild(NX.ui.range('Fuerza del compañero', S_POW, 0.25, 3, 0.25, 1, (v) => 'x' + v.toFixed(2)));
      el.appendChild(NX.ui.note('Te sigue y dispara solo un movimiento básico de su tipo (' + Object.values(BASIC).slice(0, 4).join(', ') + '...) al enemigo más cercano. No tiene vida ni recibe daño. Si eliges el mismo Pokémon con el que juegas, sale otro al azar. El cambio se aplica en la próxima partida.'));
    },
  });
})();
