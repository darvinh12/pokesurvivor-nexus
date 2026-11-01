// Gacha rápido: usar todos los tickets de una vez, saltar la animación de la
// tragamonedas y ver qué falta en cada región.
// Adaptado de PokeSurvivor Plus (MIT).
//
// "Usar todos" dispara el botón ×100 (o ×10) del propio juego, así que guarda,
// revisa logros y muestra las cartas como siempre. Solo durante esa llamada
// Gacha.pull gasta todos los tickets en tandas de diez: primero los ×10, luego
// los normales de cien en cien y de diez en diez. Cada tanda de diez conserva
// la épica garantizada. Los tickets normales que no llegan a diez se quedan.
(() => {
  const KEY = 'gacha';
  let armed = false, forceSkip = false;

  const ns = () => NX.ns;
  const $ = (id) => document.getElementById(id);
  const T = (s) => { try { return typeof ns().T === 'function' ? ns().T(s) : s; } catch (_) { return s; } };
  const fmt = (n) => (+n || 0).toLocaleString((ns().I18n && ns().I18n.locale) || 'es');
  const icon = (name, px) => { try { return ns().Icons.html(name, px); } catch (_) { return ''; } };
  const save = () => ns().DB && ns().DB.save;
  const skipOn = () => NX.isOn(KEY) && NX.store.get('gacha:skip', false);

  // Cuántas tiradas salen con los tickets actuales sin romper la regla ×10.
  function plan() {
    const t = (save() && save().tickets) || {};
    const t10 = Math.max(0, +t.t10 || 0), raw = Math.max(0, +t.t1 || 0);
    const t1 = raw - (raw % 10);
    return { t10, t1, pulls: t10 * 10 + t1, left: raw % 10 };
  }

  // Confirmación con el estilo de los diálogos del juego.
  function confirmBox(title, html, okText) {
    return new Promise((resolve) => {
      const el = document.createElement('section');
      el.className = 'scr dim nx-dlg';
      el.style.zIndex = 90;
      el.innerHTML = `<div class="box center" style="max-width:440px"><h3>${NX.esc(title)}</h3><p class="sub">${html}</p>
        <div class="row" style="justify-content:center"><button class="btn ghost" data-a="no" type="button">Cancelar</button>
        <button class="btn gold" data-a="yes" type="button">${NX.esc(okText)}</button></div></div>`;
      const key = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); done(false); } };
      const done = (v) => { el.remove(); removeEventListener('keydown', key, true); resolve(v); };
      el.addEventListener('click', (e) => {
        const a = e.target.closest('[data-a]');
        if (a) done(a.dataset.a === 'yes'); else if (e.target === el) done(false);
      });
      addEventListener('keydown', key, true);
      document.body.appendChild(el);
      el.querySelector('[data-a="yes"]').focus();
    });
  }

  function wrapGame() {
    const { Gacha, Slots } = ns();
    const pull = Gacha.pull;
    Gacha.pull = function (sv, n, gen) {
      if (!armed) return pull.apply(this, arguments);
      armed = false;
      const t = sv.tickets || {};
      const out = [];
      let iris = 0;
      const take = (count, kind) => {
        const r = pull.call(this, sv, count, gen, kind);
        if (!r) return false;
        out.push(...r);
        if (r.iris) iris = r.iris;
        return true;
      };
      while ((t.t10 || 0) >= 10 && take(100, 't10'));
      while ((t.t10 || 0) >= 1 && take(10, 't10'));
      while ((t.t1 || 0) >= 100 && take(100, 't1'));
      while ((t.t1 || 0) >= 10 && take(10, 't1'));
      if (!out.length) return null;
      out.iris = iris;
      return out;
    };

    // Saltar: la tirada ya está hecha y guardada cuando empieza la animación,
    // así que basta con resolver al instante y pulsar el "Saltar" del juego
    // para que las cartas salgan todas juntas.
    const play = Slots.play;
    Slots.play = function () {
      if (forceSkip || skipOn()) {
        forceSkip = false;
        const b = $('pull-skip');
        try { if (b && typeof b.onclick === 'function') b.onclick(); } catch (_) { /* del juego */ }
        return Promise.resolve();
      }
      return play.apply(this, arguments);
    };
  }

  async function pullAll() {
    const p = plan();
    if (!p.pulls) return;
    const name = ($('banner-title') && $('banner-title').textContent.trim()) || 'este banner';
    const parts = [];
    if (p.t10) parts.push(`${icon('ticket10', 14)} ${fmt(p.t10)} ticket${p.t10 > 1 ? 's' : ''} ×10`);
    if (p.t1) parts.push(`${icon('ticket', 14)} ${fmt(p.t1)} tickets normales`);
    const ok = await confirmBox('Usar todos los tickets',
      `Vas a gastar ${parts.join(' y ')} en <b>${NX.esc(name)}</b>: <b class="gold">${fmt(p.pulls)} tiradas</b>, siempre de diez en diez, así que cada tanda conserva su épica garantizada.` +
      (p.left ? ` Te quedan ${p.left} ticket${p.left > 1 ? 's' : ''} suelto${p.left > 1 ? 's' : ''}, que no alcanzan para un ×10.` : ''),
      `Tirar ×${fmt(p.pulls)}`);
    if (!ok) return;
    const q = plan(); // se vuelve a leer: el guardado pudo cambiar
    if (!q.pulls) return;
    // El ×100 del juego arma el resumen y ordena las cartas; con menos de
    // cien tiradas se usa el ×10, que no agrupa por decenas.
    const btn = $(q.pulls >= 100 ? 'pull-100' : 'pull-10');
    if (!btn || typeof btn.onclick !== 'function') { NX.toast('No se encontró el botón de tirada del juego'); return; }
    armed = true;
    forceSkip = true;
    try { btn.onclick(); } finally {
      // Si sigue armado, el juego no llegó a tirar (otra tirada en curso).
      armed = false;
      forceSkip = false;
    }
  }

  // ---- faltantes por región
  let openGen = null, lastSig = '';
  function regionRows() {
    const { Gacha, DEX, Sprites } = ns();
    const sv = save();
    const owned = sv.owned || {}, shiny = sv.shiny || {}, pity = sv.pity || {};
    const banners = [...Gacha.BANNERS];
    if (Gacha.SPOOKY && Gacha.isOpen(Gacha.SPOOKY.gen)) banners.unshift(Gacha.SPOOKY);
    return banners.map((b) => {
      const pool = b.event ? DEX.filter((p) => p.types.includes('ghost')) : DEX.filter((p) => p.gen === b.gen);
      const missing = pool.filter((p) => !owned[p.dex]);
      const shinyPool = pool.filter((p) => { try { return Sprites.hasShiny(p.dex); } catch (_) { return false; } });
      return {
        gen: b.gen, name: T(b.name), total: pool.length, have: pool.length - missing.length, missing,
        shTotal: shinyPool.length, shHave: shinyPool.filter((p) => shiny[p.dex]).length,
        left: (Gacha.PITY_5 || 70) - (pity[b.gen] || 0),
      };
    });
  }
  function drawRegions(box) {
    if (!save()) return;
    const rows = regionRows();
    const sig = JSON.stringify(rows.map((r) => [r.have, r.shHave, r.left])) + openGen + box.open;
    if (sig === lastSig) return;
    lastSig = sig;
    const total = rows.reduce((n, r) => n + (r.gen === (ns().Gacha.SPOOKY || {}).gen ? 0 : r.missing.length), 0);
    const most = rows.reduce((a, r) => (r.missing.length > a.missing.length ? r : a), rows[0]);
    box.innerHTML = `<summary>Faltantes por región (${fmt(total)})</summary>
      <table><thead><tr><th>Región</th><th class="n">Tienes</th><th class="n">Faltan</th><th class="n">${icon('shiny', 10)} Shiny</th><th class="n">Legendaria garantizada en</th><th></th></tr></thead><tbody>${
      rows.map((r) => `<tr${r === most && r.missing.length ? ' class="most" title="El banner donde más te falta"' : ''}>
        <td>${NX.esc(r.name)}</td><td class="n">${r.have}/${r.total}</td><td class="n">${r.missing.length}</td>
        <td class="n">${r.shHave}/${r.shTotal}</td><td class="n">${r.left} tiradas</td>
        <td>${r.missing.length ? `<button type="button" data-gen="${r.gen}">${openGen === r.gen ? 'Ocultar' : 'Ver'}</button>` : 'Completa'}</td></tr>${
        openGen === r.gen ? `<tr><td colspan="6" class="miss">${r.missing.map((p) => `#${String(p.dex).padStart(3, '0')} ${NX.esc(p.name)}`).join(' · ')}</td></tr>` : ''}`).join('')
    }</tbody></table>`;
  }

  NX.css(`#nx-pull-all{margin-top:10px;width:100%}
#nx-pull-all .nx-c{margin-left:6px;opacity:.9}
.nx-gacha-skip{display:flex;align-items:center;gap:8px;cursor:pointer;margin-top:8px}
.nx-gacha-skip input{width:18px;height:18px;margin:0;cursor:pointer;accent-color:#ffd23f}
#nx-regions{margin-top:8px}
#nx-regions summary{cursor:pointer;font-weight:700}
#nx-regions table{width:100%;border-collapse:collapse;margin-top:6px;font-size:13px}
#nx-regions th,#nx-regions td{text-align:left;padding:4px 6px;border-bottom:1px solid rgba(255,255,255,.15)}
#nx-regions .n{text-align:right;font-variant-numeric:tabular-nums}
#nx-regions tr.most td{color:var(--gold,#ffd23f)}
#nx-regions button{font:inherit;font-size:12px;font-weight:700;color:inherit;background:none;border:1px solid currentColor;border-radius:4px;padding:1px 6px;cursor:pointer}
#nx-regions .miss{font-size:12.5px;line-height:1.5;padding:4px 6px 8px}
.nx-off{display:none!important}`);

  function buildUi() {
    const pity = $('gacha-pity'), ten = $('pull-10');
    if (!pity || !ten || $('nx-pull-all')) return;
    const all = document.createElement('button');
    all.id = 'nx-pull-all';
    all.type = 'button';
    all.className = 'btn';
    all.dataset.sfx = 'none';
    ten.parentElement.after(all);
    all.addEventListener('click', () => { all.blur(); pullAll(); });

    const skip = document.createElement('label');
    skip.className = 'note nx-gacha-skip';
    skip.innerHTML = '<input type="checkbox"> Saltar siempre la animación de las tiradas';
    const box = skip.querySelector('input');
    box.addEventListener('change', () => NX.store.set('gacha:skip', box.checked));
    pity.after(skip);

    const regions = document.createElement('details');
    regions.id = 'nx-regions';
    regions.className = 'note';
    regions.open = NX.store.get('gacha:regionsOpen', false);
    regions.addEventListener('toggle', () => { NX.store.set('gacha:regionsOpen', regions.open); lastSig = ''; drawRegions(regions); });
    regions.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-gen]');
      if (!b) return;
      e.preventDefault();
      openGen = openGen === +b.dataset.gen ? null : +b.dataset.gen;
      lastSig = '';
      drawRegions(regions);
    });
    skip.after(regions);

    const refresh = () => {
      const on = NX.isOn(KEY) && !!save();
      all.classList.toggle('nx-off', !on);
      skip.classList.toggle('nx-off', !on);
      regions.classList.toggle('nx-off', !on || !NX.store.get('gacha:regions', true));
      if (!on) return;
      box.checked = NX.store.get('gacha:skip', false);
      const p = plan();
      all.innerHTML = `<b>Usar todos los tickets</b><span class="nx-c">${p.t10 ? `${icon('ticket10', 16)} ×${fmt(p.t10)} ` : ''}${icon('ticket', 16)} ×${fmt(p.t1 + p.left)} · ${fmt(p.pulls)} tiradas</span>`;
      all.disabled = p.pulls <= 0;
      all.title = p.pulls ? 'Gasta todos tus tickets en el banner abierto, de diez en diez' : 'Necesitas al menos 10 tickets o un ticket ×10';
      try { drawRegions(regions); } catch (err) { NX.trip(KEY, err); }
    };
    setInterval(() => { if (NX.shown('scr-gacha')) refresh(); }, 600);
    refresh();
  }

  NX.feature({
    key: KEY,
    label: 'Gacha rápido',
    needs: (n) => n.Gacha && typeof n.Gacha.pull === 'function' && n.Slots && typeof n.Slots.play === 'function' &&
      n.DB && n.DEX && n.Sprites && Array.isArray(n.Gacha.BANNERS) && !!$('pull-10') && !!$('gacha-pity'),
    setup() {
      wrapGame();
      buildUi();
    },
  });

  NX.settings.section({
    key: KEY,
    tab: 'Menús',
    title: 'Gacha rápido',
    keywords: 'tickets tirar todos animación saltar región faltan legendaria',
    render(el) {
      el.appendChild(NX.ui.toggle('Activado', 'on:' + KEY, true));
      el.appendChild(NX.ui.toggle('Saltar siempre la animación de las tiradas', 'gacha:skip', false));
      el.appendChild(NX.ui.toggle('Mostrar faltantes por región', 'gacha:regions', true));
      el.appendChild(NX.ui.note('Agrega "Usar todos los tickets" en el Gacha. Tira de diez en diez con las funciones del juego y pide confirmación antes de gastar.'));
    },
  });
})();
