// Cartas de partida: al empezar una partida (normal, Modificadores o
// Infinito) eliges 1 de 3 cartas que cambian las reglas de esa partida. Las
// cartas tienen rareza y se muestran como las cartas de subida de nivel del
// juego. Los efectos usan ganchos reales: Enemy.hurt (críticos explosivos),
// Enemy.die (lluvia de monedas), Player.hurt (cañón de cristal y último
// aliento), Player.onDealt (vampirismo), Projectiles.spawn/update (rebote) y
// Pickups.dropXp (botín). Los ganchos solo actúan con una carta en curso y
// sobre el jugador de esa partida; los cambios de stats viven en ese jugador,
// que el juego descarta al terminar, así que no queda nada que devolver.
(() => {
  const KEY = 'runcards';
  const P = NX.prog;
  const RAR = {
    c: { name: 'Común', col: '#9fb1c9', w: 50 },
    r: { name: 'Rara', col: '#4fb4ff', w: 30 },
    e: { name: 'Épica', col: '#c77dff', w: 14 },
    l: { name: 'Legendaria', col: '#ffd23f', w: 6 },
  };
  const scaleHp = (p, k) => { const r = p.maxHp ? p.hp / p.maxHp : 1; p.maxHp = Math.max(10, Math.round(p.maxHp * k)); p.hp = Math.max(1, Math.round(p.maxHp * r)); };
  const CARDS = [
    { id: 'critboom', rar: 'r', icon: 'star', name: 'Críticos explosivos', desc: '+5 % de críticos y cada crítico explota: 40 % del golpe a los enemigos cercanos.',
      apply(p, fx) { p.critChance = (p.critChance || 0) + 0.05; fx.critBoom = true; } },
    { id: 'fragile', rar: 'c', icon: 'book', name: 'Aprendiz frágil', desc: '+40 % de experiencia, pero -30 % de vida máxima.',
      apply(p) { p.xpMul *= 1.4; scaleHp(p, 0.7); } },
    { id: 'bounce', rar: 'r', icon: 'up', name: 'Rebote', desc: 'Tus proyectiles atraviesan 2 enemigos más y rebotan hacia el siguiente.',
      apply(p, fx) { fx.bounce = true; } },
    { id: 'extramove', rar: 'r', icon: 'cards', name: 'Repertorio prestado', desc: 'Empiezas con un movimiento extra al azar de tu Pokémon.',
      apply(p, fx, ns) {
        const pool = ns.Moves.poolFor(p.mon).filter((id) => !p.hasMove(id) && !(p.banned && p.banned.has(id)) && ns.Moves.BY_ID[id] && ns.Moves.BY_ID[id].kind !== 'buff');
        if (pool.length) { p.addMove(P.pick(pool)); fx.note = 'Nuevo movimiento: ' + (NX.gd ? NX.gd.moveName(p.moves[p.moves.length - 1].id) : ''); }
      } },
    { id: 'loot', rar: 'c', icon: 'berry', name: 'Botín generoso', desc: 'Los enemigos sueltan bayas, imanes, bombas y esferas el doble de seguido.',
      apply(p, fx) { fx.loot = true; } },
    { id: 'cannon', rar: 'e', icon: 'bomb', name: 'Cañón de cristal', desc: '+50 % de daño, pero recibes un 50 % más de daño.',
      apply(p, fx) { p.atkMul *= 1.5; fx.taken = 1.5; } },
    { id: 'runner', rar: 'c', icon: 'boot', name: 'Velocista', desc: '+20 % de velocidad, pero -10 % de daño.',
      apply(p) { p.spdMul *= 1.2; p.atkMul *= 0.9; } },
    { id: 'vamp', rar: 'e', icon: 'heart', name: 'Colmillo vampiro', desc: 'Recuperas el 2 % del daño que haces (hasta un 3 % de tu vida por segundo).',
      apply(p, fx) { fx.vamp = true; } },
    { id: 'fortune', rar: 'c', icon: 'coin', name: 'Fortuna', desc: '+40 % de Pokémonedas al final, pero -15 % de experiencia.',
      apply(p) { p.coinMul = (p.coinMul || 1) * 1.4; p.xpMul *= 0.85; } },
    { id: 'giant', rar: 'r', icon: 'shield', name: 'Coloso', desc: '+60 de vida máxima, pero -10 % de velocidad.',
      apply(p) { p.addMaxHp(60); p.spdMul *= 0.9; } },
    { id: 'magnet', rar: 'c', icon: 'magnet', name: 'Imán total', desc: 'Duplica el radio de recogida de experiencia.',
      apply(p) { p.magnet *= 2; } },
    { id: 'reflex', rar: 'r', icon: 'clock', name: 'Reflejos de acero', desc: '-20 % de recarga en todos los movimientos, pero -15 % de vida máxima.',
      apply(p) { p.cdMul *= 0.8; scaleHp(p, 0.85); } },
    { id: 'strategist', rar: 'e', icon: 'cards', name: 'Estratega', desc: '+3 cambios de cartas de nivel en esta partida.',
      apply(p) { p.rerollBonus = (p.rerollBonus || 0) + 3; } },
    { id: 'lastbreath', rar: 'l', icon: 'heart', name: 'Último aliento', desc: 'Una vez por partida, un golpe mortal te deja en pie con el 35 % de vida.',
      apply(p, fx) { fx.lastBreath = 1; } },
    { id: 'coinrain', rar: 'c', icon: 'coin', name: 'Lluvia de monedas', desc: 'Cada enemigo derrotado tiene un 10 % de soltar Pokémonedas.',
      apply(p, fx) { fx.coinRain = true; } },
    { id: 'blessing', rar: 'l', icon: 'star', name: 'Bendición', desc: '+15 % de daño, +10 % de velocidad, -10 % de recarga y +30 de vida máxima.',
      apply(p) { p.atkMul *= 1.15; p.spdMul *= 1.1; p.cdMul *= 0.9; p.addMaxHp(30); } },
  ];
  const BY = Object.fromEntries(CARDS.map((c) => [c.id, c]));
  let ns = null, run = null, boomGuard = false;
  const act = () => (run && run.card && NX.isOn(KEY) && ns.Game.player === run.player ? run : null);
  P.runCard = () => { const r = act(); return r ? r.card.id : ''; };

  const stats = () => { const s = NX.store.get('runcards:stats', {}); return s && typeof s === 'object' ? s : {}; };
  function bump(id) { const s = stats(); s[id] = (s[id] || 0) + 1; NX.store.set('runcards:stats', s); }

  // ---------------------------------------------------------------- ventana de elección
  function cardHtml(c, i) {
    const r = RAR[c.rar];
    return `<div class="card" data-i="${i}" data-sfx="none" style="border-color:${r.col}">
      <div class="ico" style="background:${r.col}33">${P.icon(c.icon, 32)}</div>
      <div class="txt"><div class="nm">${NX.esc(c.name)} <span class="tag-chip" style="background:${r.col}">${r.name}</span></div><div class="ds">${NX.esc(c.desc)}</div></div>
      <div class="key">${i + 1}</div></div>`;
  }
  function offer(p) {
    const list = P.pickW(CARDS, 3, (c) => RAR[c.rar].w);
    let done = false;
    const choose = (c) => {
      if (done) return;
      done = true;
      if (c) {
        try { if (ns.Audio && ns.Audio.sfx) ns.Audio.sfx('confirm'); } catch (_) { /* nada */ }
        const fx = {};
        try { c.apply(p, fx, ns); } catch (err) { NX.trip(KEY, err); }
        run = { player: p, card: c, fx, vampPool: 0 };
        bump(c.id);
        setTimeout(() => P.say('Carta: ' + c.name + (fx.note ? ' · ' + fx.note : ''), 3), 300);
      }
      P.hold.close();
    };
    P.hold.open((box) => {
      box.innerHTML = `<h2>Carta de partida</h2><p class="sub">Elige una regla para esta partida<span class="kbd-hint"> · <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd></span></p>
        <div class="cards">${list.map(cardHtml).join('')}</div>
        <div class="nx-hd-row"><button type="button" class="btn small ghost" data-skip>Jugar sin carta</button></div>`;
      box.querySelectorAll('.card').forEach((el) => el.addEventListener('click', () => choose(list[+el.dataset.i])));
      box.querySelector('[data-skip]').addEventListener('click', () => choose(null));
    }, {
      key(e) {
        const n = /^Digit([1-9])$/.exec(e.code) || /^Numpad([1-9])$/.exec(e.code);
        if (n && list[+n[1] - 1]) choose(list[+n[1] - 1]);
      },
    });
  }

  // ---------------------------------------------------------------- ganchos
  function hook() {
    const EP = ns.Enemy.prototype, PP = ns.Player.prototype, PR = ns.Projectiles, PK = ns.Pickups, EM = ns.EnemyMgr;

    const ehurt = EP.hurt;
    EP.hurt = function (dmg, color, vx, vy, knock, label) {
      const res = ehurt.apply(this, arguments);
      const r = act();
      if (r && r.fx.critBoom && label === 'crit' && !boomGuard && !this.remote && typeof dmg === 'number') {
        boomGuard = true;
        try {
          const x = this.x, y = this.y, rad = 72;
          for (const e of EM.queryCircle(x, y, rad)) if (e !== this && !e.dead && !e.remote) e.hurt(dmg * 0.4, '#ffb347', e.x - x, e.y - y, 40, null);
          ns.FX.ring(x, y, 8, rad, '#ffb347', 0.35, 4);
        } catch (err) { NX.trip(KEY, err); } finally { boomGuard = false; }
      }
      return res;
    };

    const die = EP.die;
    EP.die = function () {
      const was = this.dead;
      const res = die.apply(this, arguments);
      const r = act();
      if (r && r.fx.coinRain && !was && !this.remote && !this.judge && Math.random() < 0.1) {
        try { PK.drop('coin', this.x + 6, this.y - 4, 2); } catch (_) { /* nada */ }
      }
      return res;
    };

    const phurt = PP.hurt;
    PP.hurt = function (dmg) {
      const r = act();
      let res;
      if (r && this === r.player && r.fx.taken && typeof dmg === 'number') {
        const a = Array.prototype.slice.call(arguments);
        a[0] = dmg * r.fx.taken;
        res = phurt.apply(this, a);
      } else res = phurt.apply(this, arguments);
      if (r && this === r.player && r.fx.lastBreath && this.dead) {
        r.fx.lastBreath = 0;
        try { this.revive(0.35); P.say('¡Último aliento!', 2.4); } catch (err) { NX.trip(KEY, err); }
      }
      return res;
    };

    const dealt = PP.onDealt;
    if (typeof dealt === 'function') {
      PP.onDealt = function (n) {
        const r = act();
        if (r && r.fx.vamp && this === r.player && typeof n === 'number' && n > 0) r.vampPool += n * 0.02;
        return dealt.apply(this, arguments);
      };
    }

    const spawn = PR.spawn;
    PR.spawn = function () {
      const pr = spawn.apply(this, arguments);
      const r = act();
      if (r && r.fx.bounce && pr && pr.friendly && !pr.orb && !pr.boom && Number.isFinite(pr.pierce) && (!pr.owner || pr.owner === r.player)) {
        pr.pierce += 2;
        pr._nxb = 2;
      }
      return pr;
    };
    const pupd = PR.update;
    PR.update = function () {
      const res = pupd.apply(this, arguments);
      const r = act();
      if (r && r.fx.bounce) { try { bounceTick(); } catch (err) { NX.trip(KEY, err); } }
      return res;
    };

    const dx = PK.dropXp;
    PK.dropXp = function (x, y, xp, boss) {
      const res = dx.apply(this, arguments);
      const r = act();
      if (r && r.fx.loot && !boss) {
        try {
          const q = Math.random(), rx = () => (Math.random() - 0.5) * 16;
          if (q < 0.012) PK.drop('heal', x + rx(), y, 0);
          else if (q < 0.02) PK.drop('magnet', x, y, 0);
          else if (q < 0.026) PK.drop('bomb', x, y, 0);
          if (Math.random() < 0.004 && ns.Orbs && typeof ns.Orbs.roll === 'function') PK.drop('sphere', x + rx(), y, ns.Orbs.roll());
        } catch (err) { NX.trip(KEY, err); }
      }
      return res;
    };
  }

  // Un proyectil marcado que acaba de golpear cambia de rumbo hacia el enemigo
  // más cercano que todavía no tocó.
  function bounceTick() {
    const all = ns.Projectiles.all(), foes = ns.EnemyMgr.all();
    for (const pr of all) {
      if (!pr._nxb || !pr.hits || typeof pr.hits.size !== 'number') continue;
      const n = pr.hits.size;
      if (pr._nxh == null) { pr._nxh = n; continue; }
      if (n <= pr._nxh) continue;
      pr._nxh = n;
      pr._nxb--;
      let best = null, bd = 320 * 320;
      for (const e of foes) {
        if (e.dead || e.arceus || pr.hits.has(e.id)) continue;
        const ex = e.x - pr.x, ey = (typeof e.cy === 'function' ? e.cy() : e.y) - pr.y, d = ex * ex + ey * ey;
        if (d < bd) { bd = d; best = e; }
      }
      if (!best) continue;
      const sp = Math.hypot(pr.vx, pr.vy) || 300;
      const ex = best.x - pr.x, ey = (typeof best.cy === 'function' ? best.cy() : best.y) - pr.y, L = Math.hypot(ex, ey) || 1;
      pr.vx = (ex / L) * sp;
      pr.vy = (ey / L) * sp;
      pr.t = Math.max(0, pr.t - 0.35);
    }
  }

  function tick() {
    const r = act();
    if (!r || !r.fx.vamp || r.vampPool <= 0) return;
    const p = r.player;
    const amt = Math.min(r.vampPool, p.maxHp * 0.0075);
    r.vampPool = 0;
    if (!p.dead && p.hp < p.maxHp && amt > 0) p.heal(amt);
  }

  function start(p) {
    run = null;
    if (!NX.isOn(KEY) || !NX.store.get('runcards:offer', true) || !P.runOk()) return;
    offer(p);
  }
  function end(p) {
    if (!run || run.player !== p) return;
    const c = run.card;
    run = null;
    if (c && ns.Game.state === 'over') P.overLine(`Carta de partida: <b>${NX.esc(c.name)}</b>`);
  }

  function catalog(el) {
    const s = stats();
    const list = document.createElement('div');
    list.className = 'nx-pg-list';
    list.innerHTML = ['l', 'e', 'r', 'c'].flatMap((k) => CARDS.filter((c) => c.rar === k)).map((c) => {
      const r = RAR[c.rar];
      return `<div class="nx-pg-item" style="border-color:${r.col}66"><div class="ico" style="background:${r.col}33">${P.icon(c.icon, 28)}</div>
        <div class="txt"><div class="nm">${NX.esc(c.name)} <span class="tag-chip" style="background:${r.col}">${r.name}</span></div><div class="ds">${NX.esc(c.desc)}</div></div>
        <div class="ds" title="Veces elegida">×${s[c.id] || 0}</div></div>`;
    }).join('');
    el.appendChild(list);
  }

  NX.feature({
    key: KEY,
    label: 'Cartas de partida',
    needs: (n) => n.Game && n.Player && n.Player.prototype && typeof n.Player.prototype.hurt === 'function' && n.Enemy && n.Enemy.prototype &&
      typeof n.Enemy.prototype.hurt === 'function' && typeof n.Enemy.prototype.die === 'function' && n.Projectiles && typeof n.Projectiles.spawn === 'function' &&
      typeof n.Projectiles.update === 'function' && n.Pickups && typeof n.Pickups.dropXp === 'function' && n.EnemyMgr && typeof n.EnemyMgr.queryCircle === 'function' &&
      n.Moves && typeof n.Moves.poolFor === 'function' && typeof n.Game.togglePause === 'function' && n.UI && n.FX,
    setup(n) {
      ns = n;
      hook();
      NX.runs.on('start', (p) => { try { start(p); } catch (err) { NX.trip(KEY, err); } });
      NX.runs.on('end', (p) => { try { end(p); } catch (err) { NX.trip(KEY, err); } });
      NX.every(250, () => { try { tick(); } catch (err) { NX.trip(KEY, err); } }, { when: 'run', key: KEY });
      P.pill(KEY, () => { const r = act(); return r ? 'Carta: ' + r.card.name + (r.card.id === 'lastbreath' ? (r.fx.lastBreath ? ' (lista)' : ' (usada)') : '') : ''; });
      P.tab({
        key: KEY, title: 'Cartas', order: 4,
        render(el, h) {
          h.desc(el, `Al empezar una partida normal, de Modificadores o Infinito eliges 1 de 3 cartas. ${CARDS.length} cartas en total; las raras salen menos. No aparecen en el laboratorio, Boss Rush, el desafío diario ni el cooperativo.`);
          el.appendChild(NX.ui.toggle('Ofrecer una carta al empezar la partida', 'runcards:offer', true));
          catalog(el);
        },
      });
      // Pruebas desde la consola.
      NX.runcards = {
        list: () => CARDS.map((c) => c.id),
        current: () => P.runCard(),
        offer: () => { const p = ns.Game.player; if (p && P.runOk()) offer(p); },
        // Aplica una carta concreta a la partida en curso si todavía no tiene una.
        pick(id) {
          const p = ns.Game.player, c = BY[id];
          if (!p || !c || act() || !P.runOk()) return false;
          const fx = {};
          c.apply(p, fx, ns);
          run = { player: p, card: c, fx, vampPool: 0 };
          return true;
        },
      };
    },
  });

  NX.settings.section({
    key: KEY,
    tab: 'Partida',
    title: 'Cartas de partida',
    keywords: 'cartas partida reglas rareza críticos rebote botín cañón cristal vampiro fortuna progreso',
    render(el) {
      el.appendChild(NX.ui.toggle('Activado', 'on:' + KEY, true));
      el.appendChild(NX.ui.toggle('Ofrecer una carta al empezar la partida', 'runcards:offer', true));
      el.appendChild(NX.ui.note(`Elige 1 de 3 cartas al empezar (${CARDS.length} cartas con rareza). Solo en partidas normales, Modificadores e Infinito.`));
    },
  });
})();
