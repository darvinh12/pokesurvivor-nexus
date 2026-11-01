// Maximizar mejoras: compra de una vez todos los niveles que le faltan al
// Pokémon elegido en Mejoras. Adaptado de PokeSurvivor Plus (MIT).
// Cada nivel se compra pulsando el botón del propio juego, así que el juego
// valida el precio, descuenta, guarda y redibuja como en una compra a mano.
// Si no alcanzan las Pokémonedas, se compran primero los niveles más baratos.
(() => {
  const KEY = 'upg';
  let quiet = false;

  const ns = () => NX.ns;
  const $ = (id) => document.getElementById(id);
  const fmt = (n) => (+n || 0).toLocaleString((ns().I18n && ns().I18n.locale) || 'es');
  const coin = (n) => `<span class="coin"></span> ${fmt(n)}`;
  // Lectura sin efectos: DB.upgradesOf crea la entrada si no existe.
  const levels = (dex) => { const s = ns().DB.save; return (s && s.pupg && s.pupg[dex]) || {}; };

  function plan(dex, coins) {
    const U = ns().Upgrades;
    const now = levels(dex);
    let total = 0, left = 0, have = 0, max = 0;
    for (const u of U.LIST) {
      const l = Math.min(u.max, +now[u.id] || 0);
      have += l;
      max += u.max;
      for (let k = l; k < u.max; k++) { total += U.cost(u.id, k); left++; }
    }
    // Lo que alcanza: siempre el siguiente nivel más barato disponible.
    const cur = { ...now }, buy = [];
    let budget = coins;
    for (;;) {
      let best = null;
      for (const u of U.LIST) {
        const l = +cur[u.id] || 0;
        if (l >= u.max || (u.needs && !(+cur[u.needs] > 0))) continue;
        const c = U.cost(u.id, l);
        if (c <= budget && (!best || c < best.cost)) best = { id: u.id, lvl: l, cost: c };
      }
      if (!best) break;
      buy.push(best);
      budget -= best.cost;
      cur[best.id] = best.lvl + 1;
    }
    return { total, left, have, max, buy, spend: coins - budget };
  }

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

  // Botones de compra del juego, en el orden de Upgrades.LIST.
  const buyButtons = () => [...document.querySelectorAll('#upg-list > .upg-item')]
    .map((it) => it.querySelector('[data-buy]')).filter(Boolean);

  function run(dex, steps) {
    const { Upgrades, Audio, UI, DEX_BY } = ns();
    let n = 0;
    quiet = true;
    try {
      for (const s of steps) {
        if (+$('upg-mon').value !== dex) break;
        const btns = buyButtons();
        if (btns.length !== Upgrades.LIST.length) break; // la pantalla cambió
        const b = btns[Upgrades.LIST.findIndex((u) => u.id === s.id)];
        const before = +levels(dex)[s.id] || 0;
        if (!b || b.disabled || before !== s.lvl) break;
        b.click(); // el juego compra, guarda y redibuja la lista
        if ((+levels(dex)[s.id] || 0) !== before + 1) break;
        n++;
      }
    } finally { quiet = false; }
    if (n) {
      try { Audio.sfx('buy'); } catch (_) { /* sin sonido */ }
      const mon = (DEX_BY && DEX_BY[dex]) || {};
      try { UI.toast(`${mon.name || 'Pokémon'} · +${n} nivel${n === 1 ? '' : 'es'} de mejora`); } catch (_) { NX.toast(`+${n} niveles de mejora`); }
    } else NX.toast('No se pudo comprar ninguna mejora');
  }

  NX.css(`#nx-upg-max{white-space:nowrap}
#nx-upg-note{font-size:13px;color:var(--muted,#b9cbf0)}
.nx-off{display:none!important}`);

  function buildUi() {
    const sel = $('upg-mon'), list = $('upg-list');
    if (!sel || !list || $('nx-upg-max')) return;
    const btn = document.createElement('button');
    btn.id = 'nx-upg-max';
    btn.type = 'button';
    btn.className = 'btn small gold';
    btn.dataset.sfx = 'none';
    const note = document.createElement('span');
    note.id = 'nx-upg-note';
    sel.after(btn, note);

    let sig = '';
    const update = () => {
      const sv = ns().DB.save, dex = +sel.value;
      const on = NX.isOn(KEY) && !!sv && !!dex;
      btn.classList.toggle('nx-off', !on);
      note.classList.toggle('nx-off', !on);
      if (!on) { sig = ''; return; }
      const p = plan(dex, sv.coins || 0);
      const s = [dex, sv.coins, p.have, p.buy.length].join('|');
      if (s === sig) return;
      sig = s;
      note.textContent = `Nivel ${p.have} de ${p.max}`;
      if (!p.left) { btn.disabled = true; btn.textContent = 'Todo al máximo'; btn.title = ''; return; }
      const full = p.buy.length === p.left;
      btn.disabled = !p.buy.length;
      if (full || !p.buy.length) btn.innerHTML = `Maximizar · ${coin(p.total)}`;
      else btn.innerHTML = `Comprar ${p.buy.length} nivel${p.buy.length === 1 ? '' : 'es'} · ${coin(p.spend)}`;
      btn.title = full ? `Compra los ${p.left} niveles que faltan`
        : p.buy.length ? `Maximizar cuesta ${fmt(p.total)}. Te alcanza para los ${p.buy.length} niveles más baratos.`
          : `Maximizar cuesta ${fmt(p.total)} Pokémonedas`;
    };

    btn.addEventListener('click', async () => {
      btn.blur();
      const sv = ns().DB.save, dex = +sel.value;
      if (!sv || !dex) return;
      const p = plan(dex, sv.coins || 0);
      if (!p.buy.length) return;
      const mon = (ns().DEX_BY[dex] || {}).name || 'este Pokémon';
      const full = p.buy.length === p.left;
      const ok = await confirmBox('Maximizar mejoras',
        `Vas a gastar <b class="gold">${coin(p.spend)}</b> de tus ${coin(sv.coins)} en <b>${p.buy.length} nivel${p.buy.length === 1 ? '' : 'es'}</b> de mejora para <b>${NX.esc(mon)}</b>.` +
        (full ? '' : ` Dejarlo todo al máximo cuesta ${coin(p.total)}; con lo que tienes se compran primero los niveles más baratos.`),
        'Comprar');
      if (!ok) return;
      // Se recalcula con el guardado de este momento.
      const q = plan(+sel.value, (ns().DB.save || {}).coins || 0);
      if (+sel.value === dex && q.buy.length) run(dex, q.buy);
      sig = '';
      update();
    });

    sel.addEventListener('change', () => { sig = ''; update(); });
    new MutationObserver(update).observe(list, { childList: true });
    setInterval(() => { if (NX.shown('scr-upgrades')) update(); }, 700);
    update();
  }

  NX.feature({
    key: KEY,
    label: 'Maximizar mejoras',
    needs: (n) => n.Upgrades && Array.isArray(n.Upgrades.LIST) && typeof n.Upgrades.cost === 'function' &&
      n.DB && n.Audio && n.UI && !!$('upg-mon') && !!$('upg-list'),
    setup(n) {
      // Durante una compra en lote, un solo sonido y un solo aviso al final.
      const sfx = n.Audio.sfx;
      n.Audio.sfx = function (name) { if (quiet && name === 'buy') return; return sfx.apply(this, arguments); };
      const toast = n.UI.toast;
      n.UI.toast = function () { if (quiet) return; return toast.apply(this, arguments); };
      buildUi();
    },
  });

  NX.settings.section({
    key: KEY,
    tab: 'Menús',
    title: 'Maximizar mejoras',
    keywords: 'mejoras comprar todas pokémonedas costo',
    render(el) {
      el.appendChild(NX.ui.toggle('Activado', 'on:' + KEY, true));
      el.appendChild(NX.ui.note('Agrega un botón junto al selector de Pokémon en Mejoras. Muestra el costo total y pide confirmación antes de comprar.'));
    },
  });
})();
