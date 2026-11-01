// Jardín de bayas: en las partidas ganas semillas (1 cada 3 minutos y 1 por
// jefe). Entre partidas las siembras en 4 parcelas; crecen con tiempo real y
// al cosecharlas pasan a la cesta. La siguiente partida válida (normal,
// Modificadores o Infinito) toma una baya de cada tipo que haya en la cesta y
// aplica su bonificación al jugador de esa partida. Todo vive en NX.store.
(() => {
  const KEY = 'garden';
  const P = NX.prog;
  const ST = 'garden:v1';
  const PLOTS = 4;
  const MIN = 60000;
  const BERRIES = [
    { id: 'aranja', name: 'Baya Aranja', col: '#4fb4ff', grow: 15, w: 30, bonus: '+25 de vida máxima', apply: (p) => p.addMaxHp(25) },
    { id: 'aslac', name: 'Baya Aslac', col: '#5fe08a', grow: 30, w: 25, bonus: '+8 % de velocidad', apply: (p) => { p.spdMul *= 1.08; } },
    { id: 'zanama', name: 'Baya Zanama', col: '#ff9a3d', grow: 30, w: 20, bonus: '+15 % de experiencia', apply: (p) => { p.xpMul *= 1.15; } },
    { id: 'lichi', name: 'Baya Lichi', col: '#ff5f6d', grow: 45, w: 15, bonus: '+8 % de daño', apply: (p) => { p.atkMul *= 1.08; } },
    { id: 'arabol', name: 'Baya Arabol', col: '#ffd23f', grow: 60, w: 10, bonus: 'Suerte: +5 % de críticos y +10 % de Pokémonedas', apply: (p) => { p.critChance = (p.critChance || 0) + 0.05; p.coinMul = (p.coinMul || 1) * 1.1; } },
  ];
  const BY = Object.fromEntries(BERRIES.map((b) => [b.id, b]));
  let ns = null, run = null, sel = '';

  function load() {
    const s = NX.store.get(ST, null) || {};
    const plots = Array.isArray(s.plots) ? s.plots.slice(0, PLOTS) : [];
    while (plots.length < PLOTS) plots.push(null);
    return { seeds: s.seeds || {}, basket: s.basket || {}, plots, harvested: s.harvested || 0, planted: s.planted || 0 };
  }
  const save = (s) => NX.store.set(ST, s);
  P.gardenHarvested = () => load().harvested;
  const ready = (pl) => !!pl && Date.now() - pl.at >= BY[pl.b].grow * MIN;
  const left = (pl) => Math.max(0, BY[pl.b].grow * MIN - (Date.now() - pl.at));
  const fmtLeft = (ms) => { const m = Math.ceil(ms / MIN); return m >= 60 ? Math.floor(m / 60) + ' h ' + (m % 60) + ' min' : m + ' min'; };
  const berryIco = (b, size = 30) => `<svg width="${size}" height="${size}" viewBox="0 0 12 12" aria-hidden="true" style="image-rendering:pixelated"><path d="M5 1h2v2H5z" fill="#3c8a3a"/><path d="M3 3h6v1h1v4H9v1H8v1H4V9H3V8H2V4h1z" fill="${b.col}"/><path d="M4 4h1v2H4z" fill="#fff" opacity=".7"/></svg>`;

  // ---------------------------------------------------------------- acciones
  function plant(i, b) {
    const s = load();
    if (s.plots[i] || !(s.seeds[b] > 0)) return false;
    s.seeds[b]--;
    s.plots[i] = { b, at: Date.now() };
    s.planted++;
    save(s);
    return true;
  }
  function harvest(i) {
    const s = load(), pl = s.plots[i];
    if (!ready(pl)) return false;
    s.plots[i] = null;
    s.basket[pl.b] = (s.basket[pl.b] || 0) + 1;
    s.harvested++;
    save(s);
    P.emit('harvest', s.harvested);
    return true;
  }
  function harvestAll() { let n = 0; for (let i = 0; i < PLOTS; i++) if (harvest(i)) n++; return n; }
  function giveSeeds(n) {
    const s = load(), got = {};
    for (let k = 0; k < n; k++) {
      const b = P.pickW(BERRIES, 1, (x) => x.w)[0];
      s.seeds[b.id] = (s.seeds[b.id] || 0) + 1;
      got[b.id] = (got[b.id] || 0) + 1;
    }
    save(s);
    return got;
  }

  // ---------------------------------------------------------------- partida
  function start(p) {
    run = null;
    if (!NX.isOn(KEY) || !P.runOk()) return;
    run = { player: p };
    if (!NX.store.get('garden:auto', true)) return;
    const s = load(), used = [];
    for (const b of BERRIES) {
      if (!(s.basket[b.id] > 0)) continue;
      try { b.apply(p); s.basket[b.id]--; used.push(b); } catch (err) { NX.trip(KEY, err); }
    }
    if (!used.length) return;
    save(s);
    run.used = used.map((b) => b.id);
    setTimeout(() => P.say('Bayas del jardín: ' + used.map((b) => b.bonus).join(', '), 3.5), 3800);
  }
  function end(p, how) {
    if (!run || run.player !== p) return;
    run = null;
    if (how === 'replaced') return;
    const t = P.time();
    if (t < 60) return;
    const n = Math.min(8, Math.floor(t / 180) + (p.bosses || 0));
    if (n <= 0) return;
    const got = giveSeeds(n);
    const txt = Object.entries(got).map(([id, k]) => `${k} ${BY[id].name.replace('Baya ', '')}`).join(', ');
    if (ns.Game.state === 'over') P.overLine(`Jardín: ${n} semilla${n === 1 ? '' : 's'} (${NX.esc(txt)})`);
    else NX.toast(`Jardín: ${n} semillas nuevas`);
  }

  // ---------------------------------------------------------------- pantalla
  NX.css(`.nx-gd-plots{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:6px 0 10px}
.nx-gd-plot{position:relative;min-height:112px;border-radius:10px;border:2px solid rgba(244,248,255,.2);background:linear-gradient(#6b4a2b,#4a321c);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;padding:6px;cursor:pointer;text-align:center;font-size:12px;color:#fff}
.nx-gd-plot.empty{background:repeating-linear-gradient(0deg,#5a3d22 0 8px,#4d331c 8px 16px)}
.nx-gd-plot.ready{border-color:#ffd23f;box-shadow:0 0 0 2px rgba(255,210,63,.35)}
.nx-gd-plot.target{border-color:#5fe08a;border-style:dashed}
.nx-gd-plot .nx-pg-bar{width:85%}
.nx-gd-sprout{font-size:22px;line-height:1}
.nx-gd-seeds{display:flex;flex-wrap:wrap;gap:6px;margin:4px 0 8px}
.nx-gd-seeds .chip{cursor:pointer}
.nx-gd-basket{display:flex;flex-wrap:wrap;gap:8px}
.nx-gd-basket span{display:inline-flex;align-items:center;gap:4px;background:rgba(0,0,0,.25);padding:2px 8px;border-radius:8px;font-size:13px}
@media (max-width:560px){.nx-gd-plots{grid-template-columns:repeat(2,1fr)}}`);
  function render(el, h) {
    const s = load();
    h.desc(el, 'Siembra las semillas que ganas en las partidas (1 cada 3 minutos y 1 por jefe). Crecen con el tiempo real aunque cierres el juego. Al cosecharlas van a la cesta y la siguiente partida usa una baya de cada tipo.');
    const seedsBox = document.createElement('div');
    seedsBox.className = 'nx-gd-seeds';
    const have = BERRIES.filter((b) => s.seeds[b.id] > 0);
    if (sel && !(s.seeds[sel] > 0)) sel = '';
    seedsBox.innerHTML = have.length
      ? '<span class="nx-note" style="margin:0 4px 0 0">Semillas:</span>' + have.map((b) => `<button type="button" class="chip${sel === b.id ? ' on' : ''}" data-b="${b.id}" title="${NX.esc(b.bonus)} · ${b.grow} min">${berryIco(b, 14)} ${NX.esc(b.name.replace('Baya ', ''))} ×${s.seeds[b.id]}</button>`).join('')
      : '<span class="nx-note">Sin semillas. Juega una partida de al menos 3 minutos para conseguir.</span>';
    el.appendChild(seedsBox);
    seedsBox.querySelectorAll('[data-b]').forEach((b) => b.addEventListener('click', () => { sel = sel === b.dataset.b ? '' : b.dataset.b; h.rerender(); }));
    if (sel) el.appendChild(NX.ui.note('Toca una parcela vacía para sembrar ' + BY[sel].name + '.'));

    const plots = document.createElement('div');
    plots.className = 'nx-gd-plots';
    s.plots.forEach((pl, i) => {
      const d = document.createElement('div');
      if (!pl) {
        d.className = 'nx-gd-plot empty' + (sel ? ' target' : '');
        d.innerHTML = `<span>Parcela ${i + 1}</span><span class="nx-note" style="margin:0">${sel ? 'Sembrar aquí' : 'Vacía'}</span>`;
        d.addEventListener('click', () => { if (sel && plant(i, sel)) { NX.toast(BY[sel].name + ' sembrada'); h.rerender(); } else if (!sel) NX.toast('Elige primero una semilla'); });
      } else {
        const b = BY[pl.b], ok = ready(pl);
        const pct = Math.min(100, Math.round(((Date.now() - pl.at) / (b.grow * MIN)) * 100));
        d.className = 'nx-gd-plot' + (ok ? ' ready' : '');
        d.innerHTML = `${ok ? berryIco(b, 34) : `<span class="nx-gd-sprout">${pct < 50 ? '🌱' : '🌿'}</span>`}<b>${NX.esc(b.name)}</b>
          <span>${ok ? 'Lista: toca para cosechar' : 'Faltan ' + fmtLeft(left(pl))}</span><div class="nx-pg-bar"><i style="width:${pct}%"></i></div>`;
        d.addEventListener('click', () => { if (ok && harvest(i)) { NX.toast(b.name + ' a la cesta'); h.rerender(); } });
      }
      plots.appendChild(d);
    });
    el.appendChild(plots);

    const bk = BERRIES.filter((b) => s.basket[b.id] > 0);
    const basket = document.createElement('div');
    basket.innerHTML = `<p class="nx-note">Cesta (se usa una de cada tipo en la siguiente partida):</p>` + (bk.length
      ? `<div class="nx-gd-basket">${bk.map((b) => `<span title="${NX.esc(b.bonus)}">${berryIco(b, 16)} ${NX.esc(b.name)} ×${s.basket[b.id]} · ${NX.esc(b.bonus)}</span>`).join('')}</div>`
      : '<p class="nx-note">Vacía.</p>');
    el.appendChild(basket);
    const list = document.createElement('p');
    list.className = 'nx-note';
    list.textContent = 'Bayas: ' + BERRIES.map((b) => `${b.name.replace('Baya ', '')} (${b.bonus}, ${b.grow} min)`).join(' · ') + `. Cosechadas en total: ${s.harvested}.`;
    el.appendChild(list);
    h.foot(el, [['Cosechar todo', () => { const n = harvestAll(); NX.toast(n ? `${n} baya${n > 1 ? 's' : ''} a la cesta` : 'Nada listo todavía'); h.rerender(); }]]);
  }

  NX.feature({
    key: KEY,
    label: 'Jardín de bayas',
    needs: (n) => n.Game && n.Player,
    setup(n) {
      ns = n;
      NX.runs.on('start', (p) => { try { start(p); } catch (err) { NX.trip(KEY, err); } });
      NX.runs.on('end', (p, how) => { try { end(p, how); } catch (err) { NX.trip(KEY, err); } });
      P.tab({ key: KEY, title: 'Jardín', order: 2, render });
      // Refresca la pantalla del jardín mientras está abierta (barras de crecimiento).
      NX.every(15000, () => {
        const box = document.querySelector('#nexus-prog:not(.hidden) .nx-gd-plots');
        if (box && NX.store.get('prog:tab', '') === KEY) P.refresh();
      }, { when: 'menu', key: KEY });
      // Pruebas y depuración desde la consola: advance(ms) adelanta el reloj de las parcelas.
      NX.garden = {
        state: load, seeds: giveSeeds, plant, harvest, harvestAll,
        advance(ms) { const s = load(); for (const pl of s.plots) if (pl) pl.at -= ms; save(s); P.refresh(); },
        berries: () => BERRIES.map((b) => b.id),
      };
    },
  });

  NX.settings.section({
    key: KEY,
    tab: 'Menús',
    title: 'Jardín de bayas',
    keywords: 'jardín bayas semillas sembrar cosechar cesta bonificación progreso',
    render(el) {
      el.appendChild(NX.ui.toggle('Activado', 'on:' + KEY, true));
      el.appendChild(NX.ui.toggle('Usar las bayas de la cesta al empezar la partida', 'garden:auto', true));
      const s = load();
      el.appendChild(NX.ui.note(`Semillas: ${Object.values(s.seeds).reduce((a, b) => a + b, 0)} · parcelas ocupadas: ${s.plots.filter(Boolean).length}/${PLOTS} · en la cesta: ${Object.values(s.basket).reduce((a, b) => a + b, 0)}.`));
      el.appendChild(NX.ui.button('Abrir el jardín', () => { if (!P.inMenu()) { NX.toast('Ábrelo desde el menú principal'); return; } NX.togglePanel(); P.open(KEY); }));
    },
  });
})();
