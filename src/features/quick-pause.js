// Ajustes rápidos en la pausa: una fila de botones a un toque en la pantalla
// de pausa del juego (#scr-pause) para lo más usado. Cada botón se puede
// quitar desde el panel. Funciona con mouse y con toques.
(() => {
  const KEY = 'qpause';
  const QTXT = ['Apagado', 'Bajo', 'Medio', 'Alto'];
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer:coarse)').matches;
  let ns = null, row = null, lastWant = null;

  // Algunos módulos solo exponen su atajo de teclado: se simula Alt+tecla.
  const press = (code, key) => {
    const init = { code, key, altKey: true, bubbles: true, cancelable: true };
    window.dispatchEvent(new KeyboardEvent('keydown', init));
    window.dispatchEvent(new KeyboardEvent('keyup', init));
  };
  const flip = (k, d) => { const v = !NX.store.get(k, d); NX.store.set(k, v); return v; };
  const fovNow = () => NX.clamp(+NX.store.get('fov', 1.3) || 1, 1, 1.7);
  const mapQ = () => NX.clamp(Math.round(+NX.store.get('look:q', coarse ? '1' : '2') || 0), 0, 3);
  const alive = (key) => { const f = NX.featureList().find((x) => x.key === key); return !!f && f.status !== 'broken' && f.status !== 'missing'; };
  const dec = (v) => v.toFixed(1).replace('.', ',');

  // Vuelve a pedir la pista actual para que el cambio de música se oiga ya.
  function rerouteMusic() {
    const A = ns && ns.Audio;
    if (!A || typeof A.music !== 'function') return;
    try { A.music(lastWant); } catch (err) { console.warn('[nexus] pausa rápida', err); }
  }

  const ITEMS = [
    { id: 'map', label: 'Minimapa', feat: 'minimap', on: () => NX.store.get('mapShown', true) !== false,
      run: () => NX.toast(flip('mapShown', true) ? 'Minimapa visible' : 'Minimapa oculto') },
    { id: 'rb', label: 'Builds fijas', feat: 'rbuilds', on: () => !!NX.store.get('rb:pin', false),
      run: () => NX.toast(flip('rb:pin', false) ? 'Builds fijas en pantalla' : 'Builds solo con Tab') },
    { id: 'fov', label: 'Campo de visión', feat: 'fov', pair: true, text: () => 'FOV ' + dec(fovNow()) + 'x',
      minus: () => press('Minus', '-'), plus: () => press('Equal', '=') },
    { id: 'q', label: 'Calidad del mapa', feat: 'maplook', on: () => mapQ() > 0, text: () => 'Mapa: ' + QTXT[mapQ()],
      run: () => { const n = (mapQ() + 1) % 4; NX.store.set('look:q', String(n)); NX.toast('Calidad del mapa: ' + QTXT[n]); } },
    { id: 'auto', label: 'Carta automática', feat: 'qol', on: () => !!NX.store.get('qol:autopick', false),
      run: () => NX.toast(flip('qol:autopick', false) ? 'Carta automática encendida' : 'Carta automática apagada') },
    // La música propia se muestra aunque esté apagada: este botón la enciende.
    { id: 'music', label: 'Música propia', feat: 'music', any: true, on: () => NX.enabled('music'),
      run: () => { const on = !NX.enabled('music'); NX.setEnabled('music', on); rerouteMusic(); NX.toast(on ? 'Tu música encendida' : 'Tu música apagada'); } },
  ];
  const wanted = (it) => NX.store.get('qp:' + it.id, true) !== false && (it.any ? alive(it.feat) : NX.isOn(it.feat));

  NX.css(`#nexus-qp{display:flex;flex-wrap:wrap;justify-content:center;gap:6px;margin:10px 0 4px}
#nexus-qp.hidden{display:none}
#nexus-qp .nx-qp-b{font:13px/1.2 var(--font,'Pixelify',system-ui,sans-serif);background:#0b1838;color:#cfe0ff;border:2px solid #5b83d6;
  border-radius:8px;padding:4px 10px;min-height:32px;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
#nexus-qp .nx-qp-b.on{background:#ffd23f;color:#0b1838;border-color:#fff}
#nexus-qp .nx-qp-b:active{transform:translateY(1px)}
#nexus-qp .nx-qp-pair{display:inline-flex;align-items:stretch}
#nexus-qp .nx-qp-pair .nx-qp-b{border-radius:0;min-width:34px}
#nexus-qp .nx-qp-pair .nx-qp-b:first-child{border-radius:8px 0 0 8px}
#nexus-qp .nx-qp-pair .nx-qp-b:last-child{border-radius:0 8px 8px 0}
#nexus-qp .nx-qp-v{display:flex;align-items:center;padding:0 8px;background:#152a5c;color:#fff;border-top:2px solid #5b83d6;border-bottom:2px solid #5b83d6;
  font:13px var(--font,'Pixelify',system-ui,sans-serif);white-space:nowrap}
@media (pointer:coarse){#nexus-qp{gap:8px}#nexus-qp .nx-qp-b{min-height:44px;min-width:44px;font-size:15px;padding:6px 12px}#nexus-qp .nx-qp-v{font-size:15px}}`);

  function button(text, fn) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'nx-qp-b';
    b.textContent = text;
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      try { fn(); } catch (err) { NX.trip(KEY, err); }
      refresh(true);
    });
    return b;
  }

  function build() {
    row = document.createElement('div');
    row.id = 'nexus-qp';
    row.className = 'hidden';
    row.setAttribute('role', 'group');
    row.setAttribute('aria-label', 'Ajustes rápidos de Nexus');
    for (const ev of ['pointerdown', 'mousedown', 'touchstart']) row.addEventListener(ev, (e) => e.stopPropagation(), { passive: true });
    for (const it of ITEMS) {
      let el;
      if (it.pair) {
        el = document.createElement('span');
        el.className = 'nx-qp-pair';
        const minus = button('−', it.minus), plus = button('+', it.plus);
        minus.setAttribute('aria-label', it.label + ': menos');
        plus.setAttribute('aria-label', it.label + ': más');
        const v = document.createElement('span');
        v.className = 'nx-qp-v';
        el.append(minus, v, plus);
        it.paint = () => { const t = it.text(); if (v.textContent !== t) v.textContent = t; };
      } else {
        el = button(it.label, it.run);
        it.paint = () => {
          const on = !!it.on(), t = it.text ? it.text() : it.label;
          if (el.textContent !== t) el.textContent = t;
          el.classList.toggle('on', on);
          el.setAttribute('aria-pressed', String(on));
        };
      }
      el.dataset.qp = it.id;
      it.el = el;
      row.appendChild(el);
    }
    place();
  }

  // Debajo de los botones de la pausa (Continuar, Ajustes, Abandonar).
  function place() {
    const scr = document.getElementById('scr-pause');
    if (!scr || !row) return;
    const box = scr.querySelector('.box') || scr;
    if (row.parentNode === box) return;
    const sum = box.querySelector('#pause-sum');
    if (sum) box.insertBefore(row, sum); else box.appendChild(row);
  }

  let sig = '';
  function refresh(force) {
    if (!row) return;
    const show = NX.isOn(KEY) && NX.shown('scr-pause');
    row.classList.toggle('hidden', !show);
    if (!show) { sig = ''; return; }
    place();
    const vis = ITEMS.map((it) => (wanted(it) ? '1' : '0')).join('');
    if (force || vis !== sig) { ITEMS.forEach((it, i) => { it.el.hidden = vis[i] !== '1'; }); sig = vis; }
    for (const it of ITEMS) if (!it.el.hidden) it.paint();
  }

  NX.feature({
    key: KEY,
    label: 'Ajustes rápidos en la pausa',
    needs: (n) => !!document.getElementById('scr-pause') && n.Game,
    setup(n) {
      ns = n;
      build();
      setInterval(() => { try { refresh(); } catch (err) { NX.trip(KEY, err); } }, 300);
      // Recuerda la última pista que pidió el juego, por encima del módulo de
      // música, para poder repetirla al cambiar el interruptor.
      const t0 = Date.now();
      const hook = setInterval(() => {
        const A = ns.Audio;
        const m = NX.featureList().find((x) => x.key === 'music');
        if ((m && m.status === 'pending' && Date.now() - t0 < 70000) || !A || typeof A.music !== 'function') return;
        clearInterval(hook);
        lastWant = A.track || null;
        const inner = A.music;
        A.music = function (name) { lastWant = name || null; return inner.apply(this, arguments); };
      }, 500);
    },
  });

  NX.settings.section({
    key: KEY,
    tab: 'Partida',
    title: 'Ajustes rápidos en la pausa',
    keywords: 'pausa rápido atajos botones minimapa builds fov campo de visión calidad mapa carta automática música',
    prefix: ['qp:'],
    render(el) {
      el.appendChild(NX.ui.toggle('Activado', 'on:' + KEY, true, () => refresh(true)));
      el.appendChild(NX.ui.note('Botones a un toque debajo de Continuar en la pausa. Elige cuáles aparecen:'));
      for (const it of ITEMS) {
        const txt = it.id === 'fov' ? 'Campo de visión − / +' : it.id === 'q' ? 'Calidad del mapa (cambia entre Apagado, Bajo, Medio y Alto)' : it.label;
        el.appendChild(NX.ui.toggle(txt, 'qp:' + it.id, true, () => refresh(true)));
      }
    },
  });
})();
