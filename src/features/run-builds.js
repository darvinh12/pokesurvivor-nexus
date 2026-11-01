// Builds en partida, al estilo de la guía de SurvivorTiers:
// - Con Tab (o fijo) un panel con las dos builds del Pokémon actual según el
//   modelo de Nexus, a distancia y cuerpo a cuerpo, marcando qué movimientos
//   ya llevas, en qué nivel, qué falta y cuál es el siguiente paso. Debajo,
//   la build de SurvivorTiers si hay datos.
// - En la subida de nivel, la carta que más acerca tu build lleva la marca
//   "Mejor opción" con el motivo. Solo aconseja: tú eliges.
// Usa NX.buildModel (build-model.js) y NX.gd (gamedata.js) de forma perezosa.
(() => {
  const KEY = 'rbuilds', CARDS = 'rbcards';
  let el = null, body = null, lastHtml = '', drag = null;
  let cacheDex = null, cacheStyles = null;

  NX.css(`#nexus-rb{position:fixed;z-index:9997;width:330px;max-width:calc(100vw - 16px);box-sizing:border-box;padding:7px 9px 9px;color:#fff;
  font:13px/1.3 var(--font,'Pixelify',system-ui,sans-serif);background:linear-gradient(#2c519f,#1a3170);border:2px solid #f4f8ff;
  outline:2px solid #0b1838;border-radius:8px;box-shadow:inset 0 0 0 2px #5b83d6,0 4px 0 #0a1430;user-select:none;pointer-events:none}
#nexus-rb.nx-pin{pointer-events:auto}
#nexus-rb.hidden{display:none}
#nexus-rb .rb-h{display:flex;justify-content:space-between;align-items:baseline;gap:8px;font-weight:700;letter-spacing:.04em;margin-bottom:5px}
#nexus-rb .rb-h b{color:#ffd23f}#nexus-rb .rb-h span{color:#b9cbf0;font-weight:600;font-size:12px}
#nexus-rb .rb-c{background:#0b1838;border-radius:6px;padding:5px 7px;margin:5px 0;border:1px solid transparent}
#nexus-rb .rb-c.pick{border-color:#ffd23f}
#nexus-rb .rb-t{display:flex;justify-content:space-between;align-items:baseline;font-weight:700;font-size:12.5px;margin-bottom:3px}
#nexus-rb .rb-t em{font-style:normal;font-size:10.5px;color:#1b1528;background:#ffd23f;border-radius:7px;padding:0 6px;margin-left:5px}
#nexus-rb .rb-t small{color:#b9cbf0;font-weight:600}
#nexus-rb .rb-m{display:flex;align-items:center;gap:6px;font-size:12px;margin:2px 0}
#nexus-rb .rb-m i{width:9px;height:9px;border-radius:50%;flex:0 0 9px;box-shadow:0 0 0 1px rgba(255,255,255,.35)}
#nexus-rb .rb-m span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#nexus-rb .rb-m b{font-weight:600;font-size:11px;color:#7dff9a}
#nexus-rb .rb-m.miss span{opacity:.55}#nexus-rb .rb-m.miss b{color:#b9cbf0}
#nexus-rb .rb-n{font-size:11.5px;color:#9fe8ff;margin-top:3px}
#nexus-rb .rb-s{font-size:11.5px;color:#b9cbf0;margin-top:4px}
#nexus-rb .rb-next{margin-top:6px;padding:5px 7px;border-radius:6px;background:rgba(255,210,63,.14);font-size:12px}
#nexus-rb .rb-next b{color:#ffd23f}
#cards .card.nx-best{box-shadow:0 0 0 3px #7dff9a,0 0 16px rgba(125,255,154,.55)}
#cards .card .nx-bo{display:inline-block;margin-left:6px;padding:0 6px;border-radius:7px;background:#7dff9a;color:#10241a;font-size:11px;text-shadow:none;vertical-align:middle}
#cards .card .nx-bow{margin-top:3px;font-size:12px;color:#c9ffd8}
#nexus-rbline{margin:0 auto 6px;font-size:12px;color:var(--muted,#b9cbf0);text-align:center}
#nexus-rbline b{color:#ffd23f}`);

  const dexOf = (p) => (p && (p.dex || (p.mon && p.mon.dex))) || null;
  const stylesFor = (dex) => {
    if (dex !== cacheDex) { cacheDex = dex; cacheStyles = null; }
    if (!cacheStyles && NX.buildModel && NX.buildModel.styles) cacheStyles = NX.buildModel.styles(dex);
    return cacheStyles;
  };

  // Una build como tarjeta: movimientos con su estado y lo que falta.
  function card(G, title, b, own, pick, p) {
    if (!b) return `<div class="rb-c"><div class="rb-t">${title}</div><div class="rb-s">No hay una build ${title.toLowerCase()} posible con lo que aprende.</div></div>`;
    const have = b.moves.filter((m) => own.has(m.id)).length;
    const rows = b.moves.map((m) => {
      const o = own.get(m.id);
      const max = (G.moveDef(m.id) || {}).maxLvl || 5;
      const st = o ? (o.evolved ? 'evolucionado' : `Nv. ${o.lvl || 1}/${max}`) : 'falta';
      return `<div class="rb-m${o ? '' : ' miss'}"><i style="background:${G.esc(G.typeColor(m.type))}"></i><span>${G.esc(m.name)}${m.buff ? ' (potenciador)' : ''}</span><b>${o ? '✓ ' : ''}${st}</b></div>`;
    }).join('');
    const evo = b.evoNeeds && b.evoNeeds.length ? `<div class="rb-n">Evoluciones: ${G.esc(b.evoNeeds.join(', '))}</div>` : '';
    return `<div class="rb-c${pick ? ' pick' : ''}"><div class="rb-t"><span>${title}${pick ? '<em>recomendada</em>' : ''}</span><small>${have}/${b.moves.length}</small></div>${rows}${evo}</div>`;
  }

  // Qué hacer ahora con la build recomendada.
  function nextStep(G, b, own, p) {
    if (!b) return '';
    const missing = b.moves.filter((m) => !own.has(m.id));
    const slots = 4 - own.size;
    if (missing.length && slots > 0) return `Busca <b>${G.esc(missing.slice(0, slots).map((m) => m.name).join(', '))}</b> en las cartas de nivel.`;
    if (missing.length) return `Tus 4 huecos están llenos; la build pedía <b>${G.esc(missing.map((m) => m.name).join(', '))}</b>. Sube lo que más daño hace.`;
    const low = b.moves.map((m) => ({ m, o: own.get(m.id) })).filter(({ m, o }) => o && !o.evolved && (o.lvl || 1) < ((G.moveDef(m.id) || {}).maxLvl || 5));
    if (low.length) return `Sube al máximo <b>${G.esc(low.map(({ m }) => m.name).join(', '))}</b>.`;
    const needs = [];
    for (const m of b.moves) {
      const e = G.evo && G.evo(m.id, p);
      if (e && !e.have && !(own.get(m.id) || {}).evolved) needs.push(e.needName);
    }
    if (needs.length) return `Toma <b>${G.esc([...new Set(needs)].join(', '))}</b> para evolucionar.`;
    return 'Build completa. A sobrevivir.';
  }

  function render() {
    const pin = !!NX.store.get('rb:pin', false);
    const mode = NX.store.get('tabview', 'builds');
    const held = !!(NX.tabHeld && NX.tabHeld()) && mode !== 'damage';
    const vis = NX.isOn(KEY) && (held || pin) && NX.inRun() && !NX.shown('scr-settings') && !NX.shown('nexus-panel') && !NX.shown('nexus-hist');
    el.classList.toggle('hidden', !vis);
    el.classList.toggle('nx-pin', pin);
    if (!vis) return;
    // Con "Ambos", al lado del medidor de daño si no se movió a mano.
    if (!NX.store.get('pos:rb', null)) {
      const m = document.getElementById('nexus-meter');
      const beside = mode === 'both' && m && !m.classList.contains('hidden');
      el.style.left = (beside ? Math.round(m.getBoundingClientRect().right + 8) : 12) + 'px';
      el.style.top = '150px';
    }
    const G = NX.gd, p = NX.me(), dex = dexOf(p);
    let html;
    if (!G || !NX.buildModel || !dex) html = '<div class="rb-s">Esperando datos de la partida…</div>';
    else {
      const s = stylesFor(dex);
      const own = new Map((p.moves || []).map((m) => [m.id, m]));
      const pick = NX.buildModel.pickStyle(dex, [...own.keys()]);
      const mon = (NX.ns.DEX_BY || {})[dex];
      const st = G.tierOf && G.tierOf(dex);
      const stLine = st && st.moves && st.moves.length
        ? `<div class="rb-s">SurvivorTiers: ${G.tierBadge(st)} ${G.esc(G.styleName(st.style))} · ${st.moves.map((id) => (own.has(id) ? '✓ ' : '') + G.esc(G.moveName(id))).join(', ')}</div>` : '';
      html = `<div class="rb-h"><b>BUILDS</b><span>${G.esc(mon ? mon.name : '#' + dex)}</span></div>
        ${card(G, 'A distancia', s && s.ranged, own, pick === 'ranged', p)}
        ${card(G, 'Cuerpo a cuerpo', s && s.melee, own, pick === 'melee', p)}
        <div class="rb-next">${nextStep(G, s && s[pick], own, p)}</div>${stLine}`;
    }
    if (html !== lastHtml) { body.innerHTML = html; lastHtml = html; }
  }

  NX.feature({
    key: KEY,
    label: 'Builds en partida',
    needs: () => !!NX.buildModel && !!NX.gd,
    setup() {
      NX.onReady(() => {
        el = document.createElement('div');
        el.id = 'nexus-rb';
        el.className = 'hidden';
        el.innerHTML = '<div></div>';
        body = el.firstChild;
        document.body.appendChild(el);
        for (const ev of ['pointerdown', 'mousedown', 'touchstart', 'click']) el.addEventListener(ev, (e) => e.stopPropagation());
        // Sin posición guardada la decide render(); al arrastrarlo queda donde lo dejes.
        drag = NX.draggable(el, 'rb', () => ({ x: 12, y: 150 }));
        NX.every(200, () => { try { render(); } catch (err) { NX.trip(KEY, err); } }, { when: 'run', key: KEY, leave: true });
      });
      NX.runs.on('start', () => { cacheDex = null; cacheStyles = null; });
    },
  });

  // ---- "Mejor opción" en las cartas de subida de nivel
  NX.feature({
    key: CARDS,
    label: 'Mejor opción en las cartas',
    needs: (ns) => !!NX.buildModel && !!NX.gd && NX.gd.lvl && ns.LevelUp,
    setup() {
      const G = NX.gd;
      let adv = null;
      G.lvl.on(CARDS, (card, o, pl, on) => {
        if (o.index === 0) {
          adv = null;
          const dex = dexOf(pl);
          if (on && dex) {
            const offers = G.lvl.offers().map((x) => { const [type, id] = String(x.key || '').split(':'); return { type, id }; });
            try { adv = NX.buildModel.advise(dex, pl.moves || [], offers); } catch (err) { NX.trip(CARDS, err); }
          }
          line(adv, pl, on);
        }
        const best = adv && adv.best && adv.best.type === o.type && adv.best.id === o.id;
        card.classList.toggle('nx-best', !!best);
        let tag = card.querySelector('.nx-bo'), why = card.querySelector('.nx-bow');
        if (best) {
          const nm = card.querySelector('.nm'), txt = card.querySelector('.txt');
          if (!tag && nm) { tag = document.createElement('span'); tag.className = 'nx-bo'; tag.textContent = 'Mejor opción'; nm.appendChild(tag); }
          if (!why && txt) { why = document.createElement('div'); why.className = 'nx-bow'; txt.appendChild(why); }
          if (why) why.textContent = G.cap ? G.cap(adv.best.why) : adv.best.why;
        } else {
          if (tag) tag.remove();
          if (why) why.remove();
        }
      });
      // Línea sobre las cartas: estilo recomendado y progreso de las dos builds.
      function line(a, pl, on) {
        const cards = document.getElementById('cards');
        if (!cards) return;
        let ln = document.getElementById('nexus-rbline');
        if (!a || !on) { if (ln) ln.remove(); return; }
        const s = NX.buildModel.styles(dexOf(pl));
        const own = new Set((pl.moves || []).map((m) => m.id));
        const prog = (b) => (b ? `${b.moves.filter((m) => own.has(m.id)).length}/${b.moves.length}` : 'no disponible');
        if (!ln) { ln = document.createElement('div'); ln.id = 'nexus-rbline'; cards.insertAdjacentElement('beforebegin', ln); }
        ln.innerHTML = `Build Nexus recomendada: <b>${a.styleName}</b> · a distancia ${prog(s.ranged)} · cuerpo a cuerpo ${prog(s.melee)}`;
      }
    },
  });

  NX.settings.section({
    key: KEY,
    tab: 'Partida',
    title: 'Builds en partida',
    keywords: 'build tab distancia cuerpo melee ranged mejor opción cartas',
    render(wrap) {
      wrap.appendChild(NX.ui.toggle('Activado', 'on:' + KEY, true));
      wrap.appendChild(NX.ui.note('Mantén Tab en partida para ver las dos builds de tu Pokémon (a distancia y cuerpo a cuerpo), lo que ya llevas y el siguiente paso. Calculadas con los datos del juego.'));
      wrap.appendChild(NX.ui.select('Qué muestra Tab', 'tabview', [['builds', 'Builds'], ['damage', 'Daño'], ['both', 'Ambos']], 'builds'));
      wrap.appendChild(NX.ui.toggle('Dejarlo fijo en pantalla (arrastrable)', 'rb:pin', false));
      wrap.appendChild(NX.ui.button('Restablecer posición', () => { if (drag) drag.reset(); }));
    },
  });
  NX.settings.section({
    key: CARDS,
    tab: 'Partida',
    title: 'Mejor opción en las cartas',
    keywords: 'cartas subida nivel recomendación build',
    render(wrap) {
      wrap.appendChild(NX.ui.toggle('Activado', 'on:' + CARDS, true, () => NX.gd && NX.gd.lvl.refresh()));
      wrap.appendChild(NX.ui.note('Marca la carta que más acerca la build que te conviene con lo que ya llevas, y dice por qué. Solo aconseja.'));
    },
  });
})();
