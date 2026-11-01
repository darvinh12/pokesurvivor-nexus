// Personajes secretos: retos concretos que desbloquean un Pokémon. Al
// cumplirlos se usa la función del propio juego para poseerlo
// (DB.grant(dex, 'nexus'), la misma que usan el inicial y los rescates) y se
// guarda con DB.commit. Si ya lo tenías, recibes su versión shiny con
// DB.grantShiny. El progreso (mejor marca de cada reto) vive en NX.store.
// Cuentan las partidas normales, Modificadores e Infinito en solitario.
// Ganchos: Player.heal y Player.hurt, solo para anotar si hubo curación o
// daño en la partida en curso; no cambian nada.
(() => {
  const KEY = 'secrets';
  const P = NX.prog;
  const ST = 'secrets:v1';
  const mmss = (s) => NX.fmtTime(s);
  // goal: meta numérica; val(r, p, t) devuelve el progreso de la partida en curso (o null).
  const DEFS = [
    { id: 'celebi', dex: 251, name: 'Sin una baya', desc: 'Sobrevive 20 minutos sin curarte (bayas, objetos ni habilidades; la regeneración pasiva no cuenta).',
      goal: 1200, fmt: mmss, val: (r, p, t) => (r.healed ? null : t) },
    { id: 'spiritomb', dex: 442, name: 'Un solo tipo', desc: 'Llega a los 15:00 con 4 movimientos del mismo tipo.',
      goal: 900, fmt: mmss, val: (r, p, t) => (monoMoves(p) ? t : null) },
    { id: 'marshadow', dex: 802, name: 'Sombra intocable', desc: 'Vence 3 jefes en una partida sin recibir daño mientras siguen en pie.',
      goal: 3, fmt: (v) => v + ' jefes', val: (r) => r.cleanBosses },
    { id: 'jirachi', dex: 385, name: 'Deseo cumplido', desc: 'Pasa 5 minutos seguidos sin recibir daño.',
      goal: 300, fmt: mmss, val: (r, p, t) => t - r.lastHurt },
    { id: 'lucario', dex: 448, name: 'Puño único', desc: 'Llega a los 10:00 con un solo movimiento en toda la partida.',
      goal: 600, fmt: mmss, val: (r, p, t) => (r.maxMoves <= 1 ? t : null) },
    { id: 'dragapult', dex: 887, name: 'Estampida', desc: 'Derrota a 1500 enemigos en una sola partida.',
      goal: 1500, fmt: (v) => v + ' derrotas', val: (r, p) => p.kills || 0 },
    { id: 'lapras', dex: 131, name: 'Gran travesía', desc: 'Alcanza el nivel 45 en una partida.',
      goal: 45, fmt: (v) => 'Nv. ' + v, val: (r, p) => p.level || 1 },
    { id: 'mew', dex: 151, name: 'Bajo la maldición', desc: 'Llega a los 10:00 con maldiciones de x1,80 o más.',
      goal: 600, fmt: mmss, val: (r, p, t) => (P.curseMul && P.curseMul() >= 1.8 ? t : null) },
    { id: 'mimikyu', dex: 778, name: 'Frágil pero letal', desc: 'Llega a los 12:00 con la carta de partida Cañón de cristal.',
      goal: 720, fmt: mmss, val: (r, p, t) => (P.runCard && P.runCard() === 'cannon' ? t : null) },
    { id: 'snorlax', dex: 143, name: 'Buen provecho', desc: 'Cosecha 10 bayas en el jardín.',
      goal: 10, fmt: (v) => v + ' bayas', garden: true },
  ];
  const BY = Object.fromEntries(DEFS.map((d) => [d.id, d]));
  let ns = null, run = null;
  const act = () => (run && NX.isOn(KEY) && ns.Game.player === run.player ? run : null);

  const load = () => { const s = NX.store.get(ST, null); return s && typeof s === 'object' ? Object.assign({ done: {}, best: {} }, s) : { done: {}, best: {} }; };
  const save = (s) => NX.store.set(ST, s);

  function monoMoves(p) {
    const m = p.moves || [];
    if (m.length < 4) return false;
    const t = m[0] && m[0].type;
    return !!t && m.every((x) => x.type === t);
  }

  // ---------------------------------------------------------------- recompensa
  function grant(d) {
    const D = ns.DB;
    if (!D || !D.save || !D.save.owned) return 'sin guardado';
    let what = '';
    if (!D.owns(d.dex)) { D.grant(d.dex, 'nexus'); what = 'new'; }
    else if (typeof D.grantShiny === 'function' && !D.ownsShiny(d.dex)) { D.grantShiny(d.dex, 'nexus'); what = 'shiny'; }
    else what = 'dup';
    try { D.commit(); } catch (err) { console.warn('[nexus] retos', err); }
    return what;
  }
  function complete(id) {
    const d = BY[id], s = load();
    if (!d || s.done[id]) return false;
    // Fuera de una partida válida solo se completan los retos del jardín.
    const what = grant(d);
    if (what === 'sin guardado') return false;
    s.done[id] = { at: Date.now(), what };
    s.best[id] = Math.max(s.best[id] || 0, d.goal);
    save(s);
    const name = NX.gd ? NX.gd.monName(d.dex) : '#' + d.dex;
    const msg = what === 'new' ? `¡Reto cumplido! ${name} se une a tu equipo` : what === 'shiny' ? `¡Reto cumplido! ${name} shiny se une a tu equipo` : `¡Reto cumplido: ${d.name}!`;
    if (P.live()) P.say(msg, 4); else NX.toast(msg);
    try { if (ns.Audio && ns.Audio.sfx) ns.Audio.sfx('legend'); } catch (_) { /* nada */ }
    P.refresh();
    return true;
  }

  // ---------------------------------------------------------------- partida
  function start(p) {
    run = null;
    if (!NX.isOn(KEY) || !P.runOk()) return;
    run = { player: p, healed: false, lastHurt: 0, maxMoves: (p.moves || []).length, cleanBosses: 0, bosses: p.bosses || 0, bossLive: false, bossHit: false, best: {} };
  }
  function end(p) {
    if (!run || run.player !== p) return;
    flushBest(run);
    run = null;
  }
  function flushBest(r) {
    const s = load();
    let ch = false;
    for (const [id, v] of Object.entries(r.best)) if (v > (s.best[id] || 0)) { s.best[id] = v; ch = true; }
    if (ch) save(s);
  }
  function tick() {
    const r = act();
    if (!r) return;
    const p = r.player, t = P.time();
    if (p.dead) return;
    r.maxMoves = Math.max(r.maxMoves, (p.moves || []).length);
    // Jefes vencidos sin recibir daño mientras estaban en pie.
    const alive = ns.EnemyMgr.bossAlive();
    if (alive && !r.bossLive) r.bossHit = false;
    r.bossLive = alive;
    const b = p.bosses || 0;
    if (b > r.bosses) { if (!r.bossHit) r.cleanBosses += b - r.bosses; r.bosses = b; r.bossHit = false; }
    const s = load();
    for (const d of DEFS) {
      if (d.garden || s.done[d.id]) continue;
      let v = null;
      try { v = d.val(r, p, t); } catch (_) { v = null; }
      if (typeof v !== 'number' || !isFinite(v)) continue;
      if (v > (r.best[d.id] || 0)) r.best[d.id] = Math.floor(v);
      if (v >= d.goal) complete(d.id);
    }
  }

  function hook() {
    const PP = ns.Player.prototype;
    const heal = PP.heal;
    PP.heal = function () {
      const r = act();
      if (!r || this !== r.player) return heal.apply(this, arguments);
      const h0 = this.hp;
      const res = heal.apply(this, arguments);
      if (this.hp - h0 >= 1) r.healed = true;
      return res;
    };
    const hurt = PP.hurt;
    PP.hurt = function () {
      const r = act();
      if (!r || this !== r.player) return hurt.apply(this, arguments);
      const h0 = this.hp;
      const res = hurt.apply(this, arguments);
      if (this.hp < h0 || this.dead) { r.lastHurt = P.time(); if (r.bossLive) r.bossHit = true; }
      return res;
    };
  }

  // ---------------------------------------------------------------- pantalla
  function render(el, h) {
    const s = load();
    const nDone = DEFS.filter((d) => s.done[d.id]).length;
    h.desc(el, `Retos que desbloquean Pokémon. Cuentan las partidas normales, Modificadores e Infinito en solitario. Cumplidos: ${nDone} de ${DEFS.length}.`);
    const list = document.createElement('div');
    list.className = 'nx-pg-list';
    el.appendChild(list);
    const live = act();
    for (const d of DEFS) {
      const done = s.done[d.id];
      const best = Math.max(s.best[d.id] || 0, (live && live.best[d.id]) || 0, d.garden ? gardenCount() : 0);
      const pct = done ? 100 : Math.min(100, Math.round((best / d.goal) * 100));
      const item = document.createElement('div');
      item.className = 'nx-pg-item';
      if (done) item.style.borderColor = '#5fe08a';
      const name = NX.gd ? NX.gd.monName(d.dex) : '#' + d.dex;
      item.innerHTML = `<div class="ico"></div><div class="txt"><div class="nm">${done ? NX.esc(name) : '???'} <span class="tag-chip" style="background:${done ? '#5fe08a' : '#9fb1c9'}">${NX.esc(d.name)}</span></div>
        <div class="ds">${NX.esc(d.desc)}</div>
        <div class="ds">${done ? (done.what === 'shiny' ? 'Recibiste su versión shiny' : done.what === 'dup' ? 'Ya lo tenías' : 'Desbloqueado') + ' el ' + new Date(done.at).toLocaleDateString('es-VE') : 'Mejor marca: ' + NX.esc(d.fmt(best)) + ' de ' + NX.esc(d.fmt(d.goal))}</div>
        <div class="nx-pg-bar"><i style="width:${pct}%"></i></div></div>`;
      try {
        const cv = ns.UI.spriteCanvas(d.dex, 46, 46, {});
        if (!done) cv.style.filter = 'brightness(0) opacity(.55)';
        item.querySelector('.ico').appendChild(cv);
      } catch (_) { item.querySelector('.ico').textContent = '?'; }
      list.appendChild(item);
    }
  }
  const gardenCount = () => (P.gardenHarvested ? P.gardenHarvested() : 0);

  NX.feature({
    key: KEY,
    label: 'Personajes secretos',
    needs: (n) => n.Game && n.DB && typeof n.DB.grant === 'function' && typeof n.DB.owns === 'function' && typeof n.DB.commit === 'function' &&
      n.Player && n.Player.prototype && typeof n.Player.prototype.heal === 'function' && n.EnemyMgr && typeof n.EnemyMgr.bossAlive === 'function',
    setup(n) {
      ns = n;
      hook();
      NX.runs.on('start', (p) => { try { start(p); } catch (err) { NX.trip(KEY, err); } });
      NX.runs.on('end', (p) => { try { end(p); } catch (err) { NX.trip(KEY, err); } });
      setInterval(() => { try { tick(); } catch (err) { NX.trip(KEY, err); } }, 500);
      P.on('harvest', (total) => {
        if (!NX.isOn(KEY)) return;
        const d = BY.snorlax, s = load();
        if (total > (s.best.snorlax || 0)) { s.best.snorlax = total; save(s); }
        if (total >= d.goal) complete('snorlax');
      });
      P.tab({ key: KEY, title: 'Retos', order: 3, render });
      NX.secrets = { list: () => DEFS.map((d) => ({ id: d.id, dex: d.dex, goal: d.goal })), state: load, progress: () => (act() ? Object.assign({}, act().best) : null) };
    },
  });

  NX.settings.section({
    key: KEY,
    tab: 'Menús',
    title: 'Personajes secretos',
    keywords: 'retos secretos desbloquear pokémon mew celebi jirachi lucario progreso',
    render(el) {
      el.appendChild(NX.ui.toggle('Activado', 'on:' + KEY, true));
      el.appendChild(NX.ui.note(`${DEFS.length} retos que desbloquean un Pokémon con la función del propio juego. Pantalla en el menú principal: Progreso Nexus, pestaña Retos.`));
      el.appendChild(NX.ui.button('Abrir retos', () => { if (!P.inMenu()) { NX.toast('Ábrelo desde el menú principal'); return; } NX.togglePanel(); P.open(KEY); }));
      let armed = false;
      const b = NX.ui.button('Reiniciar marcas', () => {
        if (!armed) { armed = true; b.textContent = '¿Seguro? Pulsa otra vez'; setTimeout(() => { armed = false; b.textContent = 'Reiniciar marcas'; }, 3500); return; }
        const s = load();
        save({ done: s.done, best: {} });
        armed = false; b.textContent = 'Reiniciar marcas';
        NX.toast('Marcas reiniciadas (los Pokémon desbloqueados se quedan)');
      });
      el.appendChild(b);
    },
  });
})();
