// Asistentes de la subida de nivel, sin elegir por ti:
// - Build recomendada: resalta las cartas de los movimientos que SurvivorTiers
//   recomienda para tu Pokémon y muestra cuántos llevas.
// - Evoluciones: el juego evoluciona un movimiento cuando llega a su nivel
//   máximo y ya tomaste la mejora de stat que pide (Moves.EVO). Cada carta
//   dice si completa o acerca una evolución y qué falta.
(() => {
  const KEY = 'build', EVO = 'build-evo';

  NX.css(`#cards .card.nx-build{box-shadow:0 0 0 3px #ffd23f,0 0 14px rgba(255,210,63,.55)}
#cards .card .nx-bt{display:inline-block;margin-left:6px;padding:0 6px;border-radius:7px;background:#ffd23f;color:#1b1528;font-size:11px;text-shadow:none;vertical-align:middle}
#cards .card .nx-evl{margin-top:4px;font-size:12px;line-height:1.25;color:#9fe8ff}
#cards .card .nx-evl.done{color:#7dff9a}
#cards .card.nx-evodone{outline:2px dashed #7dff9a;outline-offset:2px}
#nexus-build{margin:0 auto 8px;max-width:100%;font-size:12px;color:var(--muted,#b9cbf0);display:flex;flex-wrap:wrap;gap:4px;justify-content:center;align-items:center}
#nexus-build span.m{padding:1px 7px;border-radius:7px;color:#fff;text-shadow:1px 1px 0 #0a1430;opacity:.6}
#nexus-build span.m.own{opacity:1;box-shadow:0 0 0 2px #7dff9a}
#nexus-build .nx-tier{margin-right:2px}`);

  // ---- build recomendada en vivo
  NX.feature({
    key: KEY,
    label: 'Build recomendada en vivo',
    needs: (ns) => ns.LevelUp && ns.RunUI && ns.Moves && NX.gd,
    setup() {
      const G = NX.gd;
      if (!G.tiers()) return; // sin datos de SurvivorTiers no hay nada que resaltar
      const buildOf = (pl) => { const r = pl && G.tierOf(pl.dex || (pl.mon && pl.mon.dex)); return r && r.moves && r.moves.length ? r : null; };

      G.lvl.on(KEY, (el, o, pl, on) => {
        const r = on && NX.store.get('build:hl', true) ? buildOf(pl) : null;
        const hit = !!r && !!o.id && (o.type === 'new' || o.type === 'up' || o.type === 'evo') && r.moves.includes(o.id);
        el.classList.toggle('nx-build', hit);
        let tag = el.querySelector('.nx-bt');
        if (hit && !tag) {
          const nm = el.querySelector('.nm');
          if (nm) {
            tag = document.createElement('span');
            tag.className = 'nx-bt';
            tag.textContent = 'Build';
            tag.title = 'Movimiento de la build recomendada por SurvivorTiers';
            nm.appendChild(tag);
          }
        } else if (!hit && tag) tag.remove();
        if (o.index === 0) summary(r, pl, on);
      });

      // Línea sobre las cartas con los 4 movimientos y cuáles ya llevas.
      function summary(r, pl, on) {
        const box = document.querySelector('#scr-levelup .box');
        const cards = document.getElementById('cards');
        if (!box || !cards) return;
        let line = document.getElementById('nexus-build');
        if (!r || !on || !NX.store.get('build:summary', true)) { if (line) line.remove(); return; }
        const own = new Set((pl.moves || []).map((m) => m.id));
        const sig = r.dex + '|' + [...own].join(',');
        if (line && line.dataset.sig === sig) return;
        if (!line) {
          line = document.createElement('div');
          line.id = 'nexus-build';
          cards.insertAdjacentElement('beforebegin', line);
        }
        line.dataset.sig = sig;
        const n = r.moves.filter((id) => own.has(id)).length;
        line.innerHTML = `${G.tierBadge(r)}<span>Build ${G.esc(G.styleName(r.style))} (${n}/${r.moves.length}):</span>` +
          r.moves.map((id) => { const d = G.moveDef(id); return `<span class="m${own.has(id) ? ' own' : ''}" style="background:${G.esc(G.typeColor(d && d.type))}">${G.esc(G.moveName(id))}</span>`; }).join('') +
          (G.tierStale() ? '<span class="nx-stale">posiblemente desactualizado</span>' : '');
        line.title = 'SurvivorTiers de @fildotai' + (G.tiers().patch ? ' · parche del ' + G.tiers().patch : '');
      }
      G.loadGameDate();
    },
  });

  // ---- asistente de evoluciones
  function evoLine(G, o, pl) {
    if (!pl) return null;
    const moves = pl.moves || [];
    const lv = (n) => `${n} nivel${n > 1 ? 'es' : ''}`;
    if (o.type === 'up') {
      const m = moves.find((x) => x.id === o.id);
      if (!m || m.evolved) return null;
      const e = G.evo(m.id, pl);
      if (!e) return null;
      const after = (m.lvl || 1) + 1, left = Math.max(0, e.max - after);
      if (!left) {
        return e.have ? { done: true, text: `Completa la evolución: en la próxima subida podrás evolucionar a ${G.esc(e.name)}` }
          : { text: `Llega al máximo. Falta ${G.esc(e.needName)} para evolucionar a ${G.esc(e.name)}` };
      }
      return { text: `Evolución a ${G.esc(e.name)}: faltan ${lv(left)}${e.have ? '' : ' y ' + G.esc(e.needName)}` };
    }
    if (o.type === 'stat') {
      const parts = [];
      let done = false;
      for (const m of moves) {
        if (m.evolved) continue;
        const e = G.evo(m.id, pl);
        if (!e || e.need !== o.id || e.have) continue;
        const left = Math.max(0, e.max - (m.lvl || 1));
        if (!left) { done = true; parts.push(`completa la evolución de ${G.esc(G.T(m.name, 'move'))}`); }
        else parts.push(`acerca la evolución de ${G.esc(G.T(m.name, 'move'))} (faltan ${lv(left)})`);
      }
      return parts.length ? { done, text: G.cap(parts.join(' · ')) } : null;
    }
    if (o.type === 'new') {
      const e = G.evo(o.id, pl);
      return e ? { text: `Evoluciona a ${G.esc(e.name)} en Nv. ${e.max} con ${G.esc(e.needName)}${e.have ? ' (ya la tienes)' : ''}` } : null;
    }
    return null;
  }

  NX.feature({
    key: EVO,
    label: 'Asistente de evoluciones',
    needs: (ns) => ns.LevelUp && ns.RunUI && ns.Moves && ns.Moves.EVO && typeof ns.Moves.evoInfo === 'function' && NX.gd,
    setup() {
      const G = NX.gd;
      G.lvl.on(EVO, (el, o, pl, on) => {
        let line = el.querySelector('.nx-evl');
        const r = on ? evoLine(G, o, pl) : null;
        el.classList.toggle('nx-evodone', !!(r && r.done));
        if (!r) { if (line) line.remove(); return; }
        if (!line) {
          const txt = el.querySelector('.txt');
          if (!txt) return;
          line = document.createElement('div');
          line.className = 'nx-evl';
          txt.appendChild(line);
        }
        line.classList.toggle('done', !!r.done);
        if (line.innerHTML !== r.text) line.innerHTML = r.text;
      });
    },
  });

  NX.settings.section({
    key: KEY,
    tab: 'Datos',
    title: 'Build recomendada en vivo',
    keywords: 'build survivortiers cartas subida nivel resaltar',
    render(el) {
      if (!NX.gd || !NX.gd.tiers()) {
        el.appendChild(NX.ui.note('Activa Permitir scripts de usuario para ver los tiers.'));
        return;
      }
      el.appendChild(NX.ui.toggle('Activado', 'on:' + KEY, true, () => NX.gd.lvl.refresh()));
      el.appendChild(NX.ui.toggle('Resaltar las cartas de la build', 'build:hl', true, () => NX.gd.lvl.refresh()));
      el.appendChild(NX.ui.toggle('Resumen de la build sobre las cartas', 'build:summary', true, () => NX.gd.lvl.refresh()));
      el.appendChild(NX.ui.note('Según SurvivorTiers de @fildotai. Solo resalta: tú eliges.'));
    },
  });
  NX.settings.section({
    key: EVO,
    tab: 'Datos',
    title: 'Asistente de evoluciones',
    keywords: 'evolución movimiento cartas nivel máximo',
    render(el) {
      el.appendChild(NX.ui.toggle('Activado', 'on:' + EVO, true, () => NX.gd && NX.gd.lvl.refresh()));
      el.appendChild(NX.ui.note('Marca la carta que completa o acerca la evolución de un movimiento y dice qué falta.'));
    },
  });
})();
