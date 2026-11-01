// Calculadora de gacha: probabilidad de conseguir un Pokémon concreto, una
// legendaria que falte o cualquiera que falte en un banner con N tiradas,
// cuántas tiradas hacen falta para el 50 %, 90 % y 99 %, y cuántos nuevos se
// esperan. No gasta nada: solo lee el guardado.
//
// Reproduce Gacha.pull del juego (versión b742e43):
//  - Cada tirada suma 1 a save.pity[banner]. Al llegar a PITY_5 (70) sale
//    legendaria segura y la piedad vuelve a 0 (también con una legendaria
//    natural).
//  - En una tanda de diez, la décima tirada sortea solo entre épica y
//    legendaria si en la tanda aún no salió nada de rareza 4 o más.
//  - La rareza sale de Gacha.RATES; si el banner no tiene Pokémon de esa
//    rareza se usa la más cercana (0, -1, +1, -2, +2...).
//  - Dentro de la rareza, uniforme. Si sale shiny (Gacha.shinyRate) de uno
//    cuyo shiny ya tienes, se cambia por otro con shiny que te falte.
// El cálculo es exacto por programación dinámica sobre (piedad, épica ya
// vista en la tanda). Los nuevos esperados suman la probabilidad de cada
// faltante (linealidad de la esperanza).
(() => {
  const KEY = 'gcalc';
  const MAX_PULLS = 3000;
  const ns = () => NX.ns;
  const $ = (id) => document.getElementById(id);
  const T = (s) => { try { return typeof ns().T === 'function' ? ns().T(s) : s; } catch (_) { return s; } };
  const save = () => ns() && ns().DB && ns().DB.save;
  const pct = (p) => {
    if (!(p > 0)) return '0 %';
    if (p >= 0.9995) return p >= 1 ? '100 %' : '> 99,9 %';
    const v = p * 100;
    return (v < 0.1 ? v.toFixed(3) : v < 10 ? v.toFixed(2) : v.toFixed(1)).replace('.', ',') + ' %';
  };
  const fmtN = (n) => (+n || 0).toLocaleString('es-VE');

  // ---- modelo
  function banners() {
    const G = ns().Gacha;
    const list = [...G.BANNERS];
    if (G.SPOOKY && G.isOpen(G.SPOOKY.gen)) list.push(G.SPOOKY);
    return list;
  }
  // Datos del banner: pools por rareza, tasas, piedad y estado del guardado.
  function model(gen) {
    const N = ns(), G = N.Gacha, sv = save() || {};
    const owned = sv.owned || {}, shinyOwned = sv.shiny || {};
    const pools = {};
    for (let r = 1; r <= 5; r++) pools[r] = G.pool(r, gen) || [];
    // Rareza sorteada -> rareza real (la más cercana con Pokémon).
    const eff = {};
    for (let r = 1; r <= 5; r++) {
      eff[r] = r;
      for (const d of [0, -1, 1, -2, 2, -3, 3, -4, 4]) {
        const x = r + d;
        if (x >= 1 && x <= 5 && pools[x].length) { eff[r] = x; break; }
      }
    }
    const hasShiny = (dex) => { try { return !!N.Sprites.hasShiny(dex); } catch (_) { return false; } };
    let sr = 0.01;
    try { sr = G.shinyRate(sv, gen); } catch (_) { sr = 0.01; }
    // Probabilidad de que una tirada de rareza r termine en cada Pokémon.
    const single = {};
    for (let r = 1; r <= 5; r++) {
      const L = pools[r], n = L.length;
      const S = L.filter((p) => hasShiny(p.dex));
      const Os = S.filter((p) => shinyOwned[p.dex]);
      const A = S.length - Os.length;
      const m = new Map();
      for (const p of L) {
        const inS = hasShiny(p.dex), inOs = inS && !!shinyOwned[p.dex];
        let q = (1 / n) * (1 - (inOs && A > 0 ? sr : 0));
        if (inS && !inOs && A > 0) q += (Os.length / n) * sr / A;
        m.set(p.dex, q);
      }
      single[r] = m;
    }
    const rates = G.RATES.map(([r, w]) => [r, +w]);
    const p0 = Math.max(0, Math.min(G.PITY_5 || 70, +((sv.pity || {})[gen]) || 0));
    return { gen, G, pools, eff, single, rates, pity5: G.PITY_5 || 70, p0, owned, sr };
  }
  // Distribución de rareza real para un sorteo con rareza mínima "min".
  function rollDist(M, min) {
    const list = M.rates.filter(([r]) => r >= min);
    const tot = list.reduce((s, [, w]) => s + w, 0);
    const out = [0, 0, 0, 0, 0, 0];
    for (const [r, w] of list) out[M.eff[r]] += w / tot;
    return out;
  }
  // q[r]: probabilidad de que una tirada de rareza real r dé el objetivo.
  function qFor(M, dexes) {
    const q = [0, 0, 0, 0, 0, 0];
    for (let r = 1; r <= 5; r++) for (const d of dexes) q[r] += M.single[r].get(d) || 0;
    return q;
  }
  // Curva acumulada: cdf[i] = probabilidad de haberlo conseguido en i tiradas.
  function curve(M, q, pulls, batch) {
    const P5 = M.pity5;
    const base = rollDist(M, 1), epic = rollDist(M, 4), leg = [0, 0, 0, 0, 0, 1];
    let cur = new Float64Array((P5 + 1) * 2), nxt = new Float64Array((P5 + 1) * 2);
    cur[M.p0 * 2] = 1;
    const cdf = new Float64Array(pulls + 1);
    let hit = 0;
    for (let i = 0; i < pulls; i++) {
      nxt.fill(0);
      const last = batch && i % 10 === 9;
      for (let p = 0; p <= P5; p++) {
        for (let s = 0; s < 2; s++) {
          const m = cur[p * 2 + s];
          if (m < 1e-300) continue;
          const p1 = Math.min(P5, p + 1);
          const dist = p1 >= P5 ? leg : last && !s ? epic : base;
          for (let r = 1; r <= 5; r++) {
            const a = dist[r];
            if (!a) continue;
            const mass = m * a;
            hit += mass * q[r];
            const np = r === 5 ? 0 : p1;
            const ns2 = !batch || last ? 0 : (s || r >= 4 ? 1 : 0);
            nxt[np * 2 + ns2] += mass * (1 - q[r]);
          }
        }
      }
      [cur, nxt] = [nxt, cur];
      cdf[i + 1] = hit;
    }
    return cdf;
  }
  const need = (cdf, p, step) => {
    for (let i = step; i < cdf.length; i += step) if (cdf[i] >= p) return i;
    return null;
  };

  // Tiradas que dan los tickets actuales: los ×10 son tandas; los normales,
  // tandas de diez y el resto sueltas.
  function ticketPulls() {
    const t = (save() && save().tickets) || {};
    const t10 = Math.max(0, +t.t10 || 0), t1 = Math.max(0, +t.t1 || 0);
    return { t10, t1, pulls: t10 * 10 + t1 };
  }

  // target: 'miss' | 'leg' | número de Pokédex
  function compute(gen, target, pulls, batch) {
    const M = model(gen);
    const all = [];
    for (let r = 1; r <= 5; r++) for (const p of M.pools[r]) all.push(p);
    const missing = all.filter((p) => !M.owned[p.dex]);
    let dexes;
    if (target === 'miss') dexes = missing.map((p) => p.dex);
    else if (target === 'leg') dexes = missing.filter((p) => p.rarity === 5 || M.pools[5].includes(p)).map((p) => p.dex);
    else dexes = [+target];
    const res = { M, missing, total: all.length, dexes, pulls };
    const span = Math.max(pulls, 10);
    const step = batch ? 10 : 1;
    const q = qFor(M, dexes);
    // Curva larga para los umbrales; la tirada pedida sale de la misma curva.
    const cdf = dexes.length && q.some((x) => x > 0) ? curve(M, q, Math.max(span, MAX_PULLS), batch) : null;
    res.p = cdf ? cdf[Math.min(pulls, cdf.length - 1)] : 0;
    res.need = cdf ? [0.5, 0.9, 0.99].map((x) => need(cdf, x, step)) : [null, null, null];
    // Nuevos esperados: un faltante representativo por grupo de q idéntica.
    const groups = new Map();
    for (const p of missing) {
      const qq = qFor(M, [p.dex]);
      const k = qq.map((x) => x.toPrecision(12)).join('|');
      const g = groups.get(k) || { q: qq, n: 0 };
      g.n++;
      groups.set(k, g);
    }
    let ev = 0;
    for (const g of groups.values()) {
      if (!g.q.some((x) => x > 0)) continue;
      const c = curve(M, g.q, pulls, batch);
      ev += g.n * c[pulls];
    }
    res.expectedNew = ev;
    return res;
  }

  // ---- interfaz
  NX.css(`.nx-gcalc{margin-top:8px}
.nx-gcalc summary{cursor:pointer;font-weight:700}
.nx-gcalc .gc-f{display:grid;grid-template-columns:auto 1fr;gap:6px 10px;align-items:center;margin:8px 0 6px;font-size:13px}
.nx-gcalc select,.nx-gcalc input{font:inherit;font-size:13px;background:#0b1838;color:#fff;border:1px solid #5b83d6;border-radius:5px;padding:3px 6px;min-width:0;max-width:100%;text-shadow:none}
.nx-gcalc input[type=number]{width:110px}
.nx-gcalc .gc-big{font-size:18px;color:var(--gold,#ffd23f);font-weight:700}
.nx-gcalc .gc-r{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin:6px 0}
.nx-gcalc .gc-r div{background:rgba(0,0,0,.25);border-radius:6px;padding:4px 6px;text-align:center;font-size:12px}
.nx-gcalc .gc-r b{display:block;font-size:15px;color:#fff}
.nx-gcalc .gc-n{font-size:12px;opacity:.85;margin:3px 0}
.nx-gcalc .gc-btns{display:flex;gap:6px;flex-wrap:wrap}
.nx-gcalc .gc-btns button{font:inherit;font-size:12px;color:inherit;background:none;border:1px solid currentColor;border-radius:4px;padding:1px 7px;cursor:pointer}
@media (pointer:coarse){.nx-gcalc select,.nx-gcalc input{min-height:36px;font-size:15px}.nx-gcalc .gc-btns button{min-height:34px}}`);

  // Monta la calculadora en "box". getGen() devuelve el banner (o null para
  // mostrar un selector propio). Devuelve { refresh }.
  function mount(box, getGen) {
    const st = { gen: null, target: NX.store.get('gcalc:target', 'miss'), pulls: null, batch: NX.store.get('gcalc:batch', true) !== false, sig: '' };
    box.innerHTML = `<div class="gc-f">
      ${getGen ? '' : '<span>Banner</span><select data-k="gen"></select>'}
      <span>Objetivo</span><select data-k="target"></select>
      <span>Tiradas</span><span><input type="number" min="1" max="${MAX_PULLS}" step="1" data-k="pulls"> <span class="gc-btns" style="display:inline-flex"><button type="button" data-p="t">Mis tickets</button><button type="button" data-p="10">10</button><button type="button" data-p="100">100</button></span></span>
      <span>Modo</span><select data-k="batch"><option value="1">De diez en diez (épica garantizada)</option><option value="0">Sueltas</option></select>
    </div><div class="gc-out"></div>`;
    const sel = (k) => box.querySelector(`[data-k="${k}"]`);
    const out = box.querySelector('.gc-out');
    for (const ev of ['keydown', 'keyup', 'keypress']) box.addEventListener(ev, (e) => e.stopPropagation());

    function fillGens() {
      const g = sel('gen');
      if (!g) return;
      const list = banners();
      const keep = st.gen != null ? st.gen : +NX.store.get('gcalc:gen', list[0].gen);
      g.innerHTML = list.map((b) => `<option value="${b.gen}">${NX.esc(T(b.name))}</option>`).join('');
      g.value = String(list.some((b) => b.gen === keep) ? keep : list[0].gen);
      st.gen = +g.value;
    }
    function fillTargets() {
      const M = model(st.gen), sv = save() || {};
      const all = [];
      for (let r = 5; r >= 1; r--) for (const p of M.pools[r]) all.push(p);
      const miss = all.filter((p) => !(sv.owned || {})[p.dex]);
      const have = all.filter((p) => (sv.owned || {})[p.dex]);
      const RN = M.G.RARITY_NAME || {};
      const opt = (p) => `<option value="${p.dex}">#${String(p.dex).padStart(3, '0')} ${NX.esc(p.name)} · ${NX.esc(RN[p.rarity] || '')}</option>`;
      const legMiss = miss.filter((p) => M.pools[5].includes(p)).length;
      const t = sel('target');
      t.innerHTML = `<option value="miss">Cualquiera que me falte (${miss.length})</option>
        <option value="leg">Cualquier legendaria que me falte (${legMiss})</option>
        ${miss.length ? `<optgroup label="Me faltan">${miss.map(opt).join('')}</optgroup>` : ''}
        ${have.length ? `<optgroup label="Ya los tengo">${have.map(opt).join('')}</optgroup>` : ''}`;
      const valid = [...t.options].some((o) => o.value === String(st.target));
      t.value = valid ? String(st.target) : 'miss';
      st.target = t.value;
    }
    function run() {
      if (!save()) { out.innerHTML = '<p class="gc-n">Entra al juego para usar la calculadora.</p>'; return; }
      const tk = ticketPulls();
      if (st.pulls == null) st.pulls = Math.max(10, Math.min(MAX_PULLS, tk.pulls || 10));
      sel('pulls').value = st.pulls;
      sel('batch').value = st.batch ? '1' : '0';
      let r;
      try { r = compute(st.gen, st.target === 'miss' || st.target === 'leg' ? st.target : +st.target, st.pulls, st.batch); } catch (err) { NX.trip(KEY, err); out.innerHTML = '<p class="gc-n">No se pudo calcular.</p>'; return; }
      const M = r.M;
      const left = M.pity5 - M.p0;
      const n = (v) => (v == null ? `más de ${fmtN(MAX_PULLS)}` : fmtN(v));
      const noTarget = !r.dexes.length;
      const tName = st.target === 'miss' ? 'uno nuevo' : st.target === 'leg' ? 'una legendaria nueva' : ((ns().DEX_BY || {})[+st.target] || {}).name || '#' + st.target;
      const had = st.target !== 'miss' && st.target !== 'leg' && M.owned[+st.target];
      out.innerHTML = noTarget
        ? `<p class="gc-n">No te falta ningún Pokémon de ese tipo en este banner.</p>`
        : `<div>Con <b>${fmtN(st.pulls)}</b> tiradas, probabilidad de conseguir ${NX.esc(tName)}: <span class="gc-big">${pct(r.p)}</span></div>
          ${had ? '<p class="gc-n">Ya lo tienes: una copia repetida se convierte en monedas.</p>' : ''}
          <div class="gc-r"><div>50 %<b>${n(r.need[0])}</b></div><div>90 %<b>${n(r.need[1])}</b></div><div>99 %<b>${n(r.need[2])}</b></div></div>`;
      out.insertAdjacentHTML('beforeend', `<p class="gc-n">Nuevos esperados con ${fmtN(st.pulls)} tiradas: <b>${r.expectedNew.toFixed(2).replace('.', ',')}</b> de ${r.missing.length} que te faltan (${r.total} en el banner).</p>
        <p class="gc-n">Tus tickets: ${fmtN(tk.t10)} ×10 y ${fmtN(tk.t1)} normales = ${fmtN(tk.pulls)} tiradas. Piedad ${M.p0}/${M.pity5}: legendaria garantizada en ${left} tiradas. Shiny ${(M.sr * 100).toFixed(0)} %.</p>
        <p class="gc-n">Cálculo exacto con las tasas del juego (${M.rates.slice().reverse().map(([rr, w]) => (M.G.RARITY_NAME || {})[rr] + ' ' + String(w).replace('.', ',') + ' %').join(' · ')}). No gasta nada.</p>`);
    }
    function refresh(force) {
      if (!ns() || !ns().Gacha) return;
      const g = getGen ? getGen() : null;
      if (getGen) { if (g == null) return; st.gen = g; } else if (st.gen == null) fillGens();
      const sv = save() || {};
      const tk = ticketPulls();
      const sig = [st.gen, Object.keys(sv.owned || {}).length, Object.keys(sv.shiny || {}).length, (sv.pity || {})[st.gen] || 0, tk.t10, tk.t1].join('|');
      if (!force && sig === st.sig) return;
      const genChanged = st.sig.split('|')[0] !== String(st.gen);
      st.sig = sig;
      if (genChanged || force) fillTargets();
      run();
    }

    box.addEventListener('change', (e) => {
      const k = e.target.dataset.k;
      if (k === 'gen') { st.gen = +e.target.value; NX.store.set('gcalc:gen', st.gen); st.sig = ''; refresh(true); return; }
      if (k === 'target') { st.target = e.target.value; NX.store.set('gcalc:target', st.target); }
      if (k === 'batch') { st.batch = e.target.value === '1'; NX.store.set('gcalc:batch', st.batch); }
      if (k === 'pulls') st.pulls = Math.round(NX.clamp(+e.target.value || 1, 1, MAX_PULLS));
      run();
    });
    box.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-p]');
      if (!b) return;
      e.preventDefault();
      st.pulls = b.dataset.p === 't' ? Math.max(1, Math.min(MAX_PULLS, ticketPulls().pulls || 1)) : +b.dataset.p;
      run();
    });
    return { refresh };
  }

  // Banner abierto en la pantalla del gacha, por el título.
  function openGen() {
    const t = ($('banner-title') && $('banner-title').textContent.trim()) || '';
    if (!t) return null;
    const list = banners();
    const b = list.find((x) => t === T(x.name)) || list.find((x) => t.includes(T(x.name)) || t.includes(x.name));
    return b ? b.gen : null;
  }

  function buildScreen() {
    const pity = $('gacha-pity');
    if (!pity || $('nx-gcalc')) return;
    const d = document.createElement('details');
    d.id = 'nx-gcalc';
    d.className = 'note nx-gcalc';
    d.open = NX.store.get('gcalc:open', false);
    d.innerHTML = '<summary>Calculadora de probabilidades</summary><div></div>';
    const anchor = $('nx-regions') || pity;
    anchor.after(d);
    const calc = mount(d.lastChild, openGen);
    d.addEventListener('toggle', () => { NX.store.set('gcalc:open', d.open); if (d.open) calc.refresh(true); });
    setInterval(() => {
      const on = NX.isOn(KEY);
      d.classList.toggle('nx-off', !on);
      if (!on || !NX.shown('scr-gacha')) return;
      // Que quede justo debajo de los faltantes por región si aparecen después.
      const reg = $('nx-regions');
      if (reg && d.previousElementSibling !== reg) reg.after(d);
      if (d.open) { try { calc.refresh(false); } catch (err) { NX.trip(KEY, err); } }
    }, 700);
  }

  NX.gachaCalc = { compute, model, ticketPulls };

  NX.feature({
    key: KEY,
    label: 'Calculadora de gacha',
    needs: (n) => n.Gacha && typeof n.Gacha.pool === 'function' && Array.isArray(n.Gacha.RATES) && Array.isArray(n.Gacha.BANNERS) &&
      n.DB && n.Sprites && typeof n.Sprites.hasShiny === 'function' && !!$('gacha-pity'),
    setup() {
      NX.css('.nx-off{display:none!important}');
      buildScreen();
    },
  });

  NX.settings.section({
    key: KEY,
    tab: 'Menús',
    title: 'Calculadora de gacha',
    keywords: 'gacha probabilidad tiradas piedad legendaria calculadora tickets faltan esperado',
    render(el) {
      el.appendChild(NX.ui.toggle('Activado (también dentro del Gacha)', 'on:' + KEY, true));
      if (!NX.isOn(KEY)) return;
      if (!save()) { el.appendChild(NX.ui.note('Entra al juego para usar la calculadora.')); return; }
      const box = document.createElement('div');
      box.className = 'nx-gcalc';
      el.appendChild(box);
      try { mount(box, null).refresh(true); } catch (err) { el.appendChild(NX.ui.note('No se pudo mostrar: ' + err.message)); }
    },
  });
})();
