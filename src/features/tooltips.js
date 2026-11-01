// Tooltips de datos: al pasar el mouse por los huecos de movimientos del HUD,
// el objeto equipado o el clima, y números en las cartas de subida de nivel
// (daño, recarga, área y qué cambia de un nivel al siguiente).
// Adaptado de PokeSurvivor Plus (MIT): setupTips, lvlCardStats y tagLvlCards.
(() => {
  const KEY = 'tips';
  const SLOT = 54, ITEM_GAP = 18;

  NX.css(`#cards .card .nx-cstat{display:flex;flex-wrap:wrap;gap:4px 6px;margin-top:5px}
#cards .card .nx-cstat span{font-size:12px;line-height:1.25;padding:1px 7px;border-radius:6px;background:rgba(0,0,0,.25);color:#fff;white-space:nowrap}
#cards .card .nx-cstat small{font-size:11px;color:var(--muted,#b9cbf0)}
#cards .card .nx-cstat .lv{background:rgba(255,210,63,.16);color:var(--gold,#ffd23f)}
#cards .card .nx-cstat b.up{color:#7dff9a}`);

  // Qué da una carta de movimiento: los números de uno nuevo, o solo lo que
  // cambia al subirlo (antes → después).
  function cardStats(G, type, id, pl) {
    if (!id || !(type === 'new' || type === 'up' || type === 'evo')) return '';
    const cur = pl && (pl.moves || []).find((m) => m.id === id);
    const chip = (k, v) => `<span><small>${G.esc(k)}</small> ${v}</span>`;
    const diff = (a, b, head) => {
      const old = new Map(G.moveRows(a, pl)), out = head ? [head] : [];
      for (const [k, v] of G.moveRows(b, pl)) {
        const o = old.get(k);
        if (o === undefined) out.push(chip(k, `<b class="up">${G.esc(v)}</b>`));
        else if (String(o) !== String(v)) out.push(chip(k, `${G.esc(o)} → <b class="up">${G.esc(v)}</b>`));
      }
      return out.length > (head ? 1 : 0) ? out.join('') : '';
    };
    if (type === 'new' || !cur) {
      const m = G.instance(id, 1);
      return m ? G.moveRows(m, pl).map(([k, v]) => chip(k, G.esc(v))).join('') : '';
    }
    if (type === 'evo') {
      const ev = G.evolvedCopy(cur);
      return ev ? diff(cur, ev, '<span class="lv">Evolución</span>') : '';
    }
    if (cur.evolved || !cur.def || cur.lvl >= (cur.def.maxLvl || 5)) return '';
    const nxt = G.instance(id, cur.lvl + 1);
    return nxt ? diff(cur, nxt, `<span class="lv">Nv. ${cur.lvl} → ${cur.lvl + 1}</span>`) : '';
  }

  NX.feature({
    key: KEY,
    label: 'Tooltips de datos',
    needs: (ns) => ns.Moves && ns.Moves.BY_ID && ns.HUD && typeof ns.HUD.draw === 'function' && ns.Touch && typeof ns.Touch.addButton === 'function' &&
      typeof ns.Touch.clearButtons === 'function' && ns.LevelUp && ns.RunUI && NX.gd,
    setup(ns) {
      const G = NX.gd;
      // Los huecos de movimientos se registran como botones táctiles dentro de
      // HUD.draw (54 × 54, margen 7,5). Se copian sus rectángulos por cuadro,
      // en unidades del HUD, junto con la escala del contexto en ese momento
      // (otro módulo puede agrandar el HUD con ctx.scale).
      let frame = [], frameF = 1, slots = [], hud = null, hctx = null, baseA = 1;
      const T = ns.Touch;
      const scaleNow = () => { try { return hctx && hctx.getTransform ? hctx.getTransform().a / baseA || 1 : 1; } catch (_) { return 1; } };
      // Se envuelve un poco después del arranque para quedar por fuera de los
      // demás módulos que tocan el HUD y recibir las coordenadas originales.
      setTimeout(() => {
        try { wrap(); } catch (err) { NX.fail(KEY, err); }
      }, 2000);
      const wrap = () => {
        const clear = T.clearButtons, add = T.addButton;
        T.clearButtons = function () { frame = []; return clear.apply(this, arguments); };
        T.addButton = function (x, y, w, h, fn, pad) {
          if (w === h && w > 0 && pad > 0 && Math.abs(w / pad - SLOT / 7.5) < 0.05) {
            if (!frame.length) frameF = scaleNow();
            frame.push({ x, y, w, h });
          }
          return add.apply(this, arguments);
        };
        const draw = ns.HUD.draw;
        ns.HUD.draw = function (ctx, w, h) {
          hctx = ctx;
          try { baseA = (ctx && ctx.getTransform && ctx.getTransform().a) || 1; } catch (_) { baseA = 1; }
          frameF = 1;
          const r = draw.apply(this, arguments);
          slots = frame;
          hud = { canvas: ctx && ctx.canvas, w, h, f: frameF };
          hctx = null;
          return r;
        };
      };

      // Medida del letrero del clima (arriba a la derecha).
      const mctx = document.createElement('canvas').getContext('2d');
      let wxKey = '', wxW = 0;
      const weatherRect = (wx, W) => {
        const txt = String(G.tr(wx.name)).toUpperCase() + ' · ' + Math.ceil(wx.left || 0) + 's';
        if (txt.length !== wxKey.length) {
          wxKey = txt;
          mctx.font = `800 11px ${getComputedStyle(document.body).getPropertyValue('--font') || 'sans-serif'}`;
          wxW = mctx.measureText(txt).width + 40;
        }
        return { x: W - wxW - 16 - 6, y: 14 - 4, w: wxW + 12, h: 26 + 8 };
      };

      let lastKey = '';
      const hide = () => { if (lastKey) { lastKey = ''; G.tip.hide(); } };
      const inR = (r, x, y) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
      addEventListener('mousemove', (e) => {
        try {
          if (!NX.isOn(KEY) || !NX.store.get('tips:hud', true)) return hide();
          const pl = NX.me();
          if (!pl || !hud || !hud.canvas || e.target !== hud.canvas || ns.Game.state !== 'playing' || (ns.Touch && ns.Touch.active)) return hide();
          const r = hud.canvas.getBoundingClientRect();
          if (!r.width || !hud.w) return hide();
          // k: píxeles de pantalla por unidad del HUD (con su escala).
          const k = (r.width / hud.w) * (hud.f || 1), W = hud.w / (hud.f || 1);
          const hx = (e.clientX - r.left) / k, hy = (e.clientY - r.top) / k;
          let html = '', key = '', ax = 0, ay = 0, below = false;
          const si = slots.findIndex((s) => inR(s, hx, hy));
          if (si >= 0) {
            const grp = (pl.slots && pl.slots[si]) || [];
            key = 'm' + si + ':' + grp.map((m) => m.id + m.lvl + (m.evolved ? 'e' : '')).join(',') + JSON.stringify(pl.statsTaken || {});
            if (key !== lastKey) html = grp.map((m) => G.moveTip(m, pl)).join('<hr>');
            ax = slots[si].x + slots[si].w / 2; ay = slots[si].y;
          } else if (pl.item && slots.length) {
            const s0 = slots[0];
            const base = s0.y + (pl.active === 0 ? 6 : 0);
            const ir = { x: s0.x - SLOT - ITEM_GAP, y: base - 14, w: SLOT, h: SLOT + 14 };
            if (inR(ir, hx, hy)) {
              key = 'i' + pl.item;
              if (key !== lastKey) html = G.itemTip(pl.item);
              ax = ir.x + SLOT / 2; ay = ir.y;
            }
          }
          if (!key && ns.Weather && ns.Weather.current) {
            const wx = ns.Weather.current, wr = weatherRect(wx, W);
            if (inR(wr, hx, hy)) {
              key = 'w' + (wx.kind || wx.name) + Math.ceil(wx.left || 0);
              if (key !== lastKey) html = G.weatherTip(wx, pl);
              ax = wr.x + wr.w / 2; ay = wr.y + wr.h; below = true;
            }
          }
          if (!key) return hide();
          if (key === lastKey) return;
          lastKey = key;
          if (!html) return G.tip.hide();
          G.tip.show(html, r.left + ax * k, r.top + ay * k + (below ? 6 : 0), below);
        } catch (err) { NX.trip(KEY, err); }
      }, { passive: true });
      addEventListener('blur', hide);
      setInterval(() => { if (lastKey && (!NX.inRun() || ns.Game.state !== 'playing')) hide(); }, 300);

      // Números en las cartas de subida de nivel.
      G.lvl.on(KEY, (el, o, pl, on) => {
        const old = el.querySelector('.nx-cstat');
        const want = on && NX.store.get('tips:cards', true);
        const sig = want ? o.offer.key + '|' + (pl ? pl.level : '') : '';
        if (old && old.dataset.sig === sig) return;
        if (old) old.remove();
        if (!want) return;
        const html = cardStats(G, o.type, o.id, pl);
        const txt = el.querySelector('.txt');
        if (!html || !txt) return;
        const d = document.createElement('div');
        d.className = 'nx-cstat';
        d.dataset.sig = sig;
        d.innerHTML = html;
        txt.appendChild(d);
      });
    },
  });

  NX.settings.section({
    key: KEY,
    tab: 'Datos',
    title: 'Tooltips de datos',
    keywords: 'movimientos objetos clima daño recarga cartas nivel',
    render(el) {
      el.appendChild(NX.ui.toggle('Activado', 'on:' + KEY, true));
      el.appendChild(NX.ui.toggle('Tooltips en el HUD (movimientos, objeto y clima)', 'tips:hud', true));
      el.appendChild(NX.ui.toggle('Números en las cartas de subida de nivel', 'tips:cards', true, () => NX.gd && NX.gd.lvl.refresh()));
    },
  });
})();
