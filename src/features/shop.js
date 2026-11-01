// Tienda entre oleadas: cada X minutos (y al vencer a un jefe) la partida se
// pausa con una tienda de 4 ofertas. Se paga con Fichas Nexus, una moneda
// propia de la partida (1 por cada 8 derrotas y 6 por jefe) que no toca el
// guardado del juego. Ofertas: curación, mejoras de stat, cambio de cartas,
// objetos y potenciadores temporales. Los cambios viven en el jugador de esa
// partida; los temporales se deshacen al vencer su tiempo.
//
// Otros módulos pueden sumar ofertas en cualquier momento:
//   NX.shop.addOffer({ id, name, desc, icon, cost, weight?, when?(p, ns), buy(p, ns) })
// (register es un alias; si en vez de cost llega price en Pokémonedas, se
// convierte a 1 ficha por cada 100). buy puede devolver false para cancelar
// la compra (no se cobra). Si el
// módulo carga antes que este archivo, puede dejar sus ofertas en
// (NX.shop = NX.shop || { _q: [] })._q y se registran al cargar la tienda.
(() => {
  const KEY = 'shop';
  const P = NX.prog;
  const KILLS_PER_CHIP = 8, BOSS_CHIPS = 6;
  let ns = null, run = null;
  const act = () => (run && NX.isOn(KEY) && ns.Game.player === run.player ? run : null);
  const T = () => P.time();

  // Potenciador temporal: aplica ahora y deshace al vencer.
  function timed(r, secs, label, on, off) {
    on(r.player);
    r.timers.push({ until: T() + secs, label, off });
  }
  const BASE = [
    { id: 'oran', name: 'Baya Aranja', icon: 'berry', cost: 6, weight: 3, desc: 'Recupera el 40 % de tu vida.',
      when: (p) => p.hp < p.maxHp * 0.95, buy: (p) => p.heal(p.maxHp * 0.4) },
    { id: 'protein', name: 'Proteína', icon: 'fist', cost: 12, desc: '+8 % de daño para el resto de la partida.', buy: (p) => { p.atkMul *= 1.08; } },
    { id: 'calcium', name: 'Calcio', icon: 'clock', cost: 12, desc: '-6 % de recarga en todos los movimientos.', when: (p) => p.cdMul > 0.35, buy: (p) => { p.cdMul *= 0.94; } },
    { id: 'iron', name: 'Hierro', icon: 'shield', cost: 10, desc: '+5 % de reducción de daño.', when: (p) => p.dmgReduce < 0.65, buy: (p) => { p.dmgReduce = Math.min(0.7, p.dmgReduce + 0.05); } },
    { id: 'hpup', name: 'Más PS', icon: 'heart', cost: 9, desc: '+25 de vida máxima (y la recupera).', buy: (p) => p.addMaxHp(25) },
    { id: 'feather', name: 'Pluma Veloz', icon: 'boot', cost: 9, desc: '+6 % de velocidad de movimiento.', buy: (p) => { p.spdMul *= 1.06; } },
    { id: 'reroll', name: 'Cambio de cartas', icon: 'cards', cost: 7, desc: '+1 cambio de cartas de nivel en esta partida.', buy: (p) => { p.rerollBonus = (p.rerollBonus || 0) + 1; } },
    { id: 'pull', name: 'Imán de experiencia', icon: 'magnet', cost: 3, desc: 'Atrae toda la experiencia y los objetos del mapa.', buy: () => ns.Pickups.pullAll() },
    { id: 'xatk', name: 'Ataque X', icon: 'up', cost: 8, weight: 1.4, desc: '+35 % de daño durante 60 s.',
      buy: (p) => timed(run, 60, 'Ataque X', (q) => { q.atkMul *= 1.35; }, (q) => { q.atkMul /= 1.35; }) },
    { id: 'xdef', name: 'Defensa X', icon: 'shield', cost: 8, weight: 1.2, desc: '+25 % de reducción de daño durante 60 s.',
      buy: (p) => timed(run, 60, 'Defensa X', (q) => { q.dmgReduce += 0.25; }, (q) => { q.dmgReduce -= 0.25; }) },
    { id: 'xspd', name: 'Velocidad X', icon: 'boot', cost: 6, desc: '+30 % de velocidad durante 60 s.',
      buy: (p) => timed(run, 60, 'Velocidad X', (q) => { q.spdMul *= 1.3; }, (q) => { q.spdMul /= 1.3; }) },
    { id: 'loan', name: 'Objeto prestado', icon: 'shop', cost: 10, desc: 'Llevas un objeto al azar durante 90 s (si no tienes ninguno).',
      when: (p) => !p.item, buy: (p) => {
        const id = ns.Items.roll();
        if (!id) return false;
        const name = (ns.Items.BY[id] || {}).name || id;
        timed(run, 90, name, (q) => q.equip(id), (q) => { if (q.item === id) q.equip(null); });
        P.say('Objeto prestado: ' + name, 2.4);
        return true;
      } },
  ];
  const extra = [];
  const pool = () => BASE.concat(extra);

  const prev = NX.shop;
  NX.shop = {
    addOffer(def) {
      if (!def || !def.id || typeof def.buy !== 'function') return false;
      // Acepta price (en Pokémonedas) en lugar de cost: 100 Pokémonedas = 1 ficha.
      const cost = def.cost != null ? +def.cost : def.price != null ? Math.max(1, Math.round(+def.price / 100)) : 10;
      const d = Object.assign({}, def, { cost: Math.max(0, cost || 0), name: def.name || def.id, desc: def.desc || '' });
      const i = extra.findIndex((x) => x.id === d.id);
      if (i >= 0) extra.splice(i, 1, d); else extra.push(d);
      return true;
    },
    register(def) { return NX.shop.addOffer(def); },
    removeOffer(id) { const i = extra.findIndex((d) => d.id === id); if (i >= 0) extra.splice(i, 1); },
    offers: () => pool().map((d) => d.id),
    chips: () => { const r = act(); return r ? r.chips : 0; },
    give(n) { const r = act(); if (r) r.chips += Math.max(0, n | 0); },
    open() { const r = act(); if (r) open(r); },
  };
  if (prev && Array.isArray(prev._q)) for (const d of prev._q) NX.shop.addOffer(d);

  // ---------------------------------------------------------------- ventana
  function eligible(p) {
    return pool().filter((d) => { try { return !d.when || d.when(p, ns); } catch (_) { return false; } });
  }
  function open(r) {
    if (r.open) return;
    r.open = true;
    r.visits++;
    let offers = P.pickW(eligible(r.player), 4, (d) => (d.weight == null ? 1 : d.weight));
    let rerollCost = 2;
    let box = null;
    const draw = () => {
      if (!box) return;
      box.innerHTML = `<h2>Tienda Nexus</h2>
        <p class="sub"><span class="nx-hd-coins">${P.icon('ticket', 18)} ${r.chips} fichas</span> · ganas 1 cada ${KILLS_PER_CHIP} derrotas y ${BOSS_CHIPS} por jefe<span class="kbd-hint"> · <kbd>1</kbd>–<kbd>4</kbd> comprar · <kbd>R</kbd> cambiar · <kbd>Esc</kbd> seguir</span></p>
        <div class="cards">${offers.map((d, i) => {
          const sold = !!d._sold, poor = r.chips < d.cost;
          return `<div class="card${sold || poor ? ' nx-pg-dis' : ''}" data-i="${i}" data-sfx="none" style="border-color:${sold ? '#5fe08a' : poor ? 'rgba(244,248,255,.25)' : '#ffd23f'}">
            <div class="ico" style="background:#ffd23f22">${P.icon(d.icon || 'shop', 32)}</div>
            <div class="txt"><div class="nm">${NX.esc(d.name)} <span class="tag-chip" style="background:${sold ? '#5fe08a' : '#ffd23f'}">${sold ? 'Comprado' : d.cost + ' fichas'}</span></div><div class="ds">${NX.esc(d.desc)}</div></div>
            <div class="key">${i + 1}</div></div>`;
        }).join('')}</div>
        ${r.timers.length ? `<p class="nx-note">Activos: ${r.timers.map((t) => NX.esc(t.label) + ' ' + Math.max(0, Math.ceil(t.until - T())) + ' s').join(' · ')}</p>` : ''}
        <div class="nx-hd-row"><button type="button" class="btn small" data-rr ${r.chips < rerollCost ? 'disabled' : ''}>Cambiar ofertas (${rerollCost} fichas)</button>
        <button type="button" class="btn gold" data-go>Seguir</button></div>`;
      box.querySelectorAll('.card').forEach((el) => el.addEventListener('click', () => buy(+el.dataset.i)));
      box.querySelector('[data-rr]').addEventListener('click', reroll);
      box.querySelector('[data-go]').addEventListener('click', () => P.hold.close());
    };
    const buy = (i) => {
      const d = offers[i];
      if (!d || d._sold) return;
      if (r.chips < d.cost) { try { ns.Audio.sfx('back'); } catch (_) { /* nada */ } return; }
      let ok = true;
      try { ok = d.buy(r.player, ns) !== false; } catch (err) { ok = false; NX.trip(KEY, err); }
      if (!ok) { NX.toast('No se pudo comprar ahora'); return; }
      r.chips -= d.cost;
      r.spent += d.cost;
      r.bought.push(d.id);
      offers = offers.map((o, k) => (k === i ? Object.assign({}, o, { _sold: true }) : o));
      try { ns.Audio.sfx('confirm'); } catch (_) { /* nada */ }
      draw();
    };
    const reroll = () => {
      if (r.chips < rerollCost) return;
      r.chips -= rerollCost;
      r.spent += rerollCost;
      rerollCost++;
      offers = P.pickW(eligible(r.player), 4, (d) => (d.weight == null ? 1 : d.weight));
      try { ns.Audio.sfx('select'); } catch (_) { /* nada */ }
      draw();
    };
    try { ns.Audio.sfx('levelup'); } catch (_) { /* nada */ }
    P.hold.open((b) => { box = b; draw(); }, {
      onClose: () => { r.open = false; box = null; },
      key(e) {
        const n = /^Digit([1-9])$/.exec(e.code) || /^Numpad([1-9])$/.exec(e.code);
        if (n) buy(+n[1] - 1);
        else if (e.code === 'KeyR') reroll();
        else if (e.key === 'Escape' || e.key === 'Enter') P.hold.close();
      },
    });
  }

  // ---------------------------------------------------------------- reloj
  const every = () => { const v = +NX.store.get('shop:every', 4); return v > 0 ? v * 60 : 0; };
  function start(p) {
    run = null;
    if (!NX.isOn(KEY) || !P.runOk()) return;
    const e = every();
    run = { player: p, chips: 0, credited: 0, bosses: p.bosses || 0, nextAt: e || Infinity, bossAt: 0, timers: [], visits: 0, spent: 0, bought: [], open: false };
  }
  function end(p) {
    if (!run || run.player !== p) return;
    const r = run;
    run = null;
    if (r.visits && ns.Game.state === 'over') P.overLine(`Tienda Nexus: ${r.bought.length} compra${r.bought.length === 1 ? '' : 's'} · ${r.spent} fichas gastadas`);
  }
  function tick() {
    const r = act();
    if (!r) return;
    const p = r.player, t = T();
    // Fichas por derrotas y jefes.
    const k = p.kills || 0;
    const due = Math.floor(k / KILLS_PER_CHIP);
    if (due > r.credited) { r.chips += due - r.credited; r.credited = due; }
    const b = p.bosses || 0;
    if (b > r.bosses) {
      r.chips += (b - r.bosses) * BOSS_CHIPS;
      r.bosses = b;
      if (NX.store.get('shop:boss', true)) r.bossAt = t + 1.5;
    }
    // Potenciadores que vencen.
    for (let i = r.timers.length - 1; i >= 0; i--) {
      const tm = r.timers[i];
      if (t >= tm.until) { r.timers.splice(i, 1); try { tm.off(p); } catch (err) { NX.trip(KEY, err); } }
    }
    if (r.open || P.hold.active() || p.dead || ns.Game.state !== 'playing') return;
    if (ns.Judgment && ns.Judgment.active) return;
    const e = every();
    if (r.nextAt === Infinity && e) r.nextAt = Math.ceil((t + 1) / e) * e;
    if (e && t >= r.nextAt) { r.nextAt = (Math.floor(t / e) + 1) * e; r.bossAt = 0; open(r); return; }
    if (r.bossAt && t >= r.bossAt) { r.bossAt = 0; open(r); }
  }

  NX.feature({
    key: KEY,
    label: 'Tienda entre oleadas',
    needs: (n) => n.Game && typeof n.Game.togglePause === 'function' && n.Pickups && typeof n.Pickups.pullAll === 'function' && n.Items && typeof n.Items.roll === 'function' && n.UI,
    setup(n) {
      ns = n;
      NX.runs.on('start', (p) => { try { start(p); } catch (err) { NX.trip(KEY, err); } });
      NX.runs.on('end', (p) => { try { end(p); } catch (err) { NX.trip(KEY, err); } });
      setInterval(() => { try { tick(); } catch (err) { NX.trip(KEY, err); } }, 250);
      P.pill(KEY, () => {
        const r = act();
        if (!r) return '';
        const e = every();
        const left = e && r.nextAt !== Infinity ? Math.max(0, Math.ceil(r.nextAt - T())) : 0;
        return `Fichas ${r.chips}` + (left ? ` · tienda en ${NX.fmtTime(left)}` : '');
      });
    },
  });

  NX.settings.section({
    key: KEY,
    tab: 'Partida',
    title: 'Tienda entre oleadas',
    keywords: 'tienda fichas comprar ofertas curación mejora objeto temporal jefe oleadas progreso',
    render(el) {
      el.appendChild(NX.ui.toggle('Activado', 'on:' + KEY, true));
      el.appendChild(NX.ui.select('Abrir la tienda cada', 'shop:every', [['0', 'Nunca (solo jefes)'], ['3', '3 minutos'], ['4', '4 minutos'], ['5', '5 minutos'], ['6', '6 minutos']], '4'));
      el.appendChild(NX.ui.toggle('Abrir también al vencer a un jefe', 'shop:boss', true));
      el.appendChild(NX.ui.note(`Se paga con Fichas Nexus de la partida: 1 por cada ${KILLS_PER_CHIP} derrotas y ${BOSS_CHIPS} por jefe. No usa ni cambia tus Pokémonedas. Solo en partidas normales, Modificadores e Infinito.`));
    },
  });
})();
