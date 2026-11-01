// Límite superado: cuando ya no queda nada que mejorar en la subida de nivel
// (los 4 movimientos sin más niveles ni evoluciones pendientes, sin huecos
// para aprender otro y todas las mejoras con tope al máximo), el juego solo
// repite Vigor, Síntesis y Baya Zidra. En ese caso este módulo cambia la
// oferta por mejoras pequeñas e infinitas. Envuelve LevelUp.offer (también lo
// usa el botón de cambiar cartas); cuando no hay límite devuelve la oferta del
// juego tal cual. Vale en cualquier partida en solitario, también en los
// modos de Nexus, porque solo cambia cartas que ya no ofrecían nada.
(() => {
  const KEY = 'limitbreak';
  const P = NX.prog;
  const UNLIMITED = new Set(['hp', 'rgn', 'heal']);
  const LB = [
    { id: 'atk', icon: 'fist', title: 'Furia', desc: '+2 % de daño.', apply: (p) => { p.atkMul *= 1.02; } },
    { id: 'spd', icon: 'boot', title: 'Paso ligero', desc: '+1 % de velocidad.', apply: (p) => { p.spdMul *= 1.01; } },
    { id: 'hp', icon: 'heart', title: 'Robustez', desc: '+5 de vida máxima (y la recupera).', apply: (p) => p.addMaxHp(5) },
    { id: 'cd', icon: 'clock', title: 'Concentración', desc: '-1 % de recarga.', apply: (p) => { p.cdMul = Math.max(0.3, p.cdMul * 0.99); } },
    { id: 'def', icon: 'shield', title: 'Temple', desc: '+0,5 % de reducción de daño.', apply: (p) => { p.dmgReduce = Math.min(0.7, p.dmgReduce + 0.005); } },
    { id: 'crit', icon: 'star', title: 'Instinto', desc: '+1 % de críticos.', apply: (p) => { p.critChance = Math.min(0.6, (p.critChance || 0) + 0.01); } },
    { id: 'xp', icon: 'book', title: 'Sabiduría', desc: '+2 % de experiencia.', apply: (p) => { p.xpMul *= 1.02; } },
    { id: 'rgn', icon: 'sprout', title: 'Raíz', desc: '+0,2 de vida regenerada por segundo.', apply: (p) => { p.regenFlat = (p.regenFlat || 0) + 0.2; } },
    { id: 'mag', icon: 'magnet', title: 'Atracción', desc: '+3 % de radio de recogida.', apply: (p) => { p.magnet *= 1.03; } },
  ];
  let ns = null;
  const count = new WeakMap(); // jugador -> mejoras de límite tomadas

  // ¿Quedan mejoras de verdad? Mira el jugador, no la oferta (que es al azar).
  function atLimit(p, offer) {
    if (!Array.isArray(offer) || !offer.length) return true;
    if (!offer.every((o) => o && o.type === 'stat' && UNLIMITED.has(String(o.key || '').split(':')[1]))) return false;
    const M = ns.Moves;
    for (const m of p.moves || []) {
      try { if (M.nextUpText(m)) return false; } catch (_) { return false; }
      try { const e = M.evoInfo(m, p.statsTaken || {}); if (e && !m.evolved) return false; } catch (_) { /* sin evolución */ }
    }
    if ((p.slots || []).length < (p.maxMoves || 4)) {
      const pool = M.poolFor(p.mon).filter((id) => !p.hasMove(id) && !(p.banned && p.banned.has(id)));
      if (pool.length) return false;
    }
    for (const s of ns.LevelUp.STATS || []) if (s.max && ((p.statsTaken || {})[s.id] || 0) < s.max) return false;
    return true;
  }

  function cards(p, n) {
    return P.pickW(LB, n, () => 1).map((d) => ({
      w: 1, type: 'stat', key: 'lb:' + d.id, icon: d.icon, color: '#ffd23f', tag: 'Límite superado', title: d.title, desc: d.desc,
      apply: (pl) => {
        d.apply(pl);
        count.set(pl, (count.get(pl) || 0) + 1);
        pl.statsTaken = pl.statsTaken || {};
        pl.statsTaken['lb_' + d.id] = (pl.statsTaken['lb_' + d.id] || 0) + 1;
      },
    }));
  }

  NX.feature({
    key: KEY,
    label: 'Límite superado',
    needs: (n) => n.LevelUp && typeof n.LevelUp.offer === 'function' && Array.isArray(n.LevelUp.STATS) && n.Moves &&
      typeof n.Moves.nextUpText === 'function' && typeof n.Moves.poolFor === 'function' && n.Game,
    setup(n) {
      ns = n;
      const offer = n.LevelUp.offer;
      n.LevelUp.offer = function (p, k) {
        const r = offer.apply(this, arguments);
        if (!NX.isOn(KEY) || !p || p !== n.Game.player || !P.solo()) return r;
        try {
          if (atLimit(p, r)) return cards(p, Math.max(3, (Array.isArray(r) && r.length) || +k || 3));
        } catch (err) { NX.trip(KEY, err); }
        return r;
      };
      P.pill(KEY, () => { const p = n.Game.player; const c = p ? count.get(p) || 0 : 0; return c ? 'Límite ×' + c : ''; });
      // Pruebas desde la consola.
      NX.limitbreak = {
        atLimit: (p) => { p = p || n.Game.player; return atLimit(p, offer.call(n.LevelUp, p)); },
        taken: (p) => count.get(p || n.Game.player) || 0,
      };
    },
  });

  NX.settings.section({
    key: KEY,
    tab: 'Partida',
    title: 'Límite superado',
    keywords: 'límite superado cartas nivel máximo mejoras infinitas progreso',
    render(el) {
      el.appendChild(NX.ui.toggle('Activado', 'on:' + KEY, true));
      el.appendChild(NX.ui.note('Cuando ya no queda nada por mejorar en la subida de nivel, ofrece mejoras pequeñas e infinitas (+2 % de daño, +1 % de velocidad, +5 de vida y más) en vez de repetir Vigor, Síntesis y Baya Zidra.'));
    },
  });
})();
