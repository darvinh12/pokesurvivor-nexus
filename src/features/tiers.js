// Letras de tier y build recomendada de SurvivorTiers (survivortiers.pages.dev,
// de @fildotai) en la Pokédex, la selección de compañero y la ficha de cada
// Pokémon. Los datos los descarga el cascarón y llegan en NX.data.tiers.
// Basado en el enfoque de tiers de PokeSurvivor Plus (MIT).
(() => {
  const KEY = 'tiers';
  const GRIDS = ['dex-grid', 'starter-grid'];

  NX.css(`.nx-tierb{position:absolute;bottom:6px;right:6px;z-index:1;min-width:16px;height:16px;font-size:11px}
#dex-grid .cell,#starter-grid .cell{position:relative}
#dex-detail .nx-tierbox{margin:8px 0 4px;padding:7px 9px;border-radius:8px;background:rgba(0,0,0,.25);text-align:left;font-size:13px}
#dex-detail .nx-tierbox .nx-tl{display:flex;align-items:center;gap:6px;flex-wrap:wrap;color:var(--muted,#b9cbf0)}
#dex-detail .nx-tierbox .nx-tl .nx-tier{min-width:22px;height:22px;font-size:15px;border-radius:6px}
#dex-detail .nx-tierbox .nx-tl b{color:#fff}
#dex-detail .nx-tierbox .nx-bm{display:flex;flex-wrap:wrap;gap:4px;margin:6px 0 4px}
#dex-detail .nx-tierbox .nx-bm span{padding:1px 8px;border-radius:7px;color:#fff;font-size:12px;text-shadow:1px 1px 0 #0a1430}
#dex-detail .nx-tierbox .nx-cr{font-size:11px;color:var(--muted,#b9cbf0)}
#dex-detail .nx-tierbox .nx-cr a{color:inherit;text-decoration:underline}`);

  const noOf = (cell) => {
    const n = cell.querySelector('.no');
    const v = parseInt(n ? n.textContent : cell.dataset.dex || cell.dataset.no, 10);
    return Number.isFinite(v) ? v : 0;
  };

  function applyGrid(G, grid, on) {
    for (const cell of grid.querySelectorAll(':scope > .cell')) {
      const r = on ? G.tierOf(noOf(cell)) : null;
      let b = cell.querySelector(':scope > .nx-tierb');
      if (r && (!b || b.dataset.t !== r.tier)) {
        if (b) b.remove();
        cell.insertAdjacentHTML('beforeend', G.tierBadge(r, 'nx-tierb'));
        b = cell.lastElementChild;
        b.dataset.t = r.tier;
      } else if (!r && b) b.remove();
    }
  }

  // Bloque en la ficha: letra, puesto, estilo y los 4 movimientos.
  function buildBox(G, r) {
    const t = G.tiers();
    const moves = (r.moves || []).map((id) => {
      const d = G.moveDef(id);
      return `<span style="background:${G.esc(G.typeColor(d && d.type))}" title="${G.esc(d ? G.tr(d.desc) : id)}">${G.esc(G.moveName(id))}</span>`;
    }).join('');
    const other = r.otherStyle && r.otherScore ? ` · ${G.esc(G.styleName(r.otherStyle))}: ${G.num(r.otherScore, 1)}` : '';
    return `<div class="nx-tl">${G.tierBadge(r)}<span>Tier <b>${G.esc(r.tier)}</b> · puesto <b>${r.rank}</b> de ${t.total}</span></div>
      <div class="nx-tl" style="margin-top:4px"><span>Build recomendada, <b>${G.esc(G.styleName(r.style))}</b> (${G.num(r.score, 1)}${other})</span></div>
      <div class="nx-bm">${moves}</div>
      <div class="nx-cr">${G.tierMetaHtml()}</div>`;
  }
  function applyDetail(G, on) {
    const det = document.getElementById('dex-detail');
    if (!det) return;
    let box = det.querySelector('.nx-tierbox');
    const m = /(?:Nº|N°|No\.?|#)\s*(\d{1,4})/i.exec(det.textContent || '');
    const r = on && NX.store.get('tiers:detail', true) && m ? G.tierOf(+m[1]) : null;
    if (!r) { if (box) box.remove(); return; }
    const sig = r.dex + '|' + G.tierStale();
    if (box && box.dataset.sig === sig) return;
    if (!box) {
      box = document.createElement('div');
      box.className = 'nx-tierbox';
      const h = det.querySelector('h3');
      const anchor = h && h.parentElement === det ? h : h && h.parentElement;
      if (anchor && anchor !== det) anchor.insertAdjacentElement('afterend', box); else det.appendChild(box);
    }
    box.dataset.sig = sig;
    box.innerHTML = buildBox(G, r);
  }

  NX.feature({
    key: KEY,
    label: 'Tiers de SurvivorTiers',
    needs: (ns) => ns.DEX_BY && ns.Moves && NX.gd,
    setup() {
      const G = NX.gd;
      if (!G.tiers()) return; // sin datos: solo la nota en ajustes
      G.loadGameDate().then(() => { if (NX.isOn(KEY)) run(); });
      let pend = 0;
      const run = () => {
        pend = 0;
        try {
          const on = NX.isOn(KEY);
          for (const id of GRIDS) {
            const g = document.getElementById(id);
            if (g) applyGrid(G, g, on && NX.store.get(id === 'dex-grid' ? 'tiers:dex' : 'tiers:starters', true));
          }
          applyDetail(G, on);
        } catch (err) { NX.trip(KEY, err); }
      };
      const later = () => { if (!pend) pend = setTimeout(run, 60); };
      G.tiersRefresh = later;
      NX.onReady(() => {
        for (const id of [...GRIDS, 'dex-detail']) {
          const el = document.getElementById(id);
          if (el) new MutationObserver(later).observe(el, { childList: true });
        }
        later();
      });
    },
  });

  NX.settings.section({
    key: KEY,
    tab: 'Datos',
    title: 'Tiers de SurvivorTiers',
    keywords: 'tier build recomendada pokedex survivortiers ranking',
    render(el) {
      const G = NX.gd;
      const t = G && G.tiers();
      if (!t) {
        el.appendChild(NX.ui.note('Activa Permitir scripts de usuario para ver los tiers.'));
        return;
      }
      const refresh = () => G.tiersRefresh && G.tiersRefresh();
      el.appendChild(NX.ui.toggle('Activado', 'on:' + KEY, true, refresh));
      el.appendChild(NX.ui.toggle('Letras en la Pokédex', 'tiers:dex', true, refresh));
      el.appendChild(NX.ui.toggle('Letras en la selección de compañero', 'tiers:starters', true, refresh));
      el.appendChild(NX.ui.toggle('Tier y build en la ficha del Pokémon', 'tiers:detail', true, refresh));
      const p = NX.ui.note('');
      const paint = () => { p.innerHTML = `${t.total} Pokémon · ${G.tierMetaHtml()}`; };
      paint();
      G.loadGameDate().then(paint);
      el.appendChild(p);
    },
  });
})();
