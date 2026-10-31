// Minimapa flotante. Todo se lee de los módulos del juego en cada cuadro:
// World para el terreno, EnemyMgr / Pickups / Rift / Events para marcadores
// y Coop para los aliados. Basado en el enfoque de PokeSurvivor Plus (MIT).
(() => {
  const KEY = 'minimap';
  const SIZE_MIN = 120, SIZE_MAX = 480;
  // Radio en unidades del mundo. El juego guarda pocos trozos de mapa en
  // memoria; leer terreno más lejos lo obliga a reconstruirlos sin parar.
  const RANGE = 1200;
  const CELL = 32, SAMPLE_BUDGET = 1200;
  const LIQUID = { water: '#3f86d8', lava: '#ff6a2b', ice: '#bfe8ff', poison: '#a35ad8', swamp: '#5e8a4a' };
  const LAYERS = [
    ['terrain', 'Terreno'], ['view', 'Área visible'], ['enemies', 'Enemigos'], ['bosses', 'Jefes y legendarios'],
    ['shinies', 'Shinies'], ['golden', 'Dorados y ladrones'], ['chests', 'Cofres'], ['altars', 'Altares'],
    ['springs', 'Charcos curativos'], ['items', 'Objetos'], ['rift', 'Grietas'], ['events', 'Eventos'], ['mates', 'Aliados'],
  ];
  const layer = (k) => NX.store.get('map:' + k, true) !== false;

  let el = null, cv = null, g = null, size = 0, lastDraw = 0;
  let props = [], lastPropScan = 0;
  const terrain = new Map();
  let terrainSig = '', runPlayer = null, runId = 0;

  NX.css(`#nexus-map{position:fixed;z-index:9998;padding:5px;background:linear-gradient(#2c519f,#1a3170);border:2px solid #f4f8ff;
  outline:2px solid #0b1838;border-radius:8px;box-shadow:inset 0 0 0 2px #5b83d6,0 4px 0 #0a1430;cursor:move;touch-action:none;user-select:none}
#nexus-map.hidden{display:none}
#nexus-map canvas{display:block;border-radius:4px;background:#41604f}
#nexus-map i{position:absolute;right:-5px;bottom:-5px;width:14px;height:14px;cursor:nwse-resize;opacity:0;transition:opacity .15s}
#nexus-map:hover i{opacity:1}
#nexus-map i::after{content:'';position:absolute;inset:3px;border:0 solid #ffd23f;border-right-width:3px;border-bottom-width:3px}`);

  function setSize(n) {
    size = Math.round(NX.clamp(+n || 180, SIZE_MIN, SIZE_MAX));
    const dpr = NX.clamp(NX.realDpr(), 1, 3);
    cv.style.width = cv.style.height = size + 'px';
    cv.width = cv.height = Math.round(size * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    lastDraw = 0;
  }

  function place(x, y) {
    const w = el.offsetWidth || size + 14, h = el.offsetHeight || size + 14;
    x = NX.clamp(x, 0, Math.max(0, innerWidth - w));
    y = NX.clamp(y, 0, Math.max(0, innerHeight - h));
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    return [x, y];
  }

  function build() {
    el = document.createElement('div');
    el.id = 'nexus-map';
    el.className = 'hidden';
    el.title = 'Arrastra para mover · esquina para redimensionar · Alt+M para ocultar';
    el.innerHTML = '<canvas></canvas><i></i>';
    document.body.appendChild(el);
    cv = el.querySelector('canvas');
    g = cv.getContext('2d');
    setSize(NX.store.get('mapSize', 180));
    const pos = NX.store.get('mapPos', null);
    if (pos) place(pos[0], pos[1]);
    else place(innerWidth - size - 26, 70);
    addEventListener('resize', () => { const r = el.getBoundingClientRect(); place(r.left, r.top); });
    for (const ev of ['pointerdown', 'mousedown', 'touchstart']) el.addEventListener(ev, (e) => e.stopPropagation());

    // Arrastrar para mover.
    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.target.tagName === 'I') return;
      const r = el.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
      el.setPointerCapture(e.pointerId);
      const move = (ev) => place(ev.clientX - dx, ev.clientY - dy);
      const up = () => {
        el.removeEventListener('pointermove', move);
        el.removeEventListener('pointerup', up);
        const q = el.getBoundingClientRect();
        NX.store.set('mapPos', [Math.round(q.left), Math.round(q.top)]);
      };
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up);
    });
    // Esquina para redimensionar.
    const corner = el.querySelector('i');
    corner.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      corner.setPointerCapture(e.pointerId);
      const move = (ev) => setSize(Math.max(ev.clientX - r.left, ev.clientY - r.top) - 14);
      const up = () => {
        corner.removeEventListener('pointermove', move);
        corner.removeEventListener('pointerup', up);
        NX.store.set('mapSize', size);
      };
      corner.addEventListener('pointermove', move);
      corner.addEventListener('pointerup', up);
    });
    requestAnimationFrame(loop);
  }

  function loop(now) {
    requestAnimationFrame(loop);
    const visible = NX.isOn(KEY) && NX.store.get('mapShown', true) && NX.inRun() && !NX.shown('scr-settings');
    el.classList.toggle('hidden', !visible);
    if (!visible || now - lastDraw < 60) return;
    lastDraw = now;
    try { draw(); } catch (err) { NX.trip(KEY, err); }
  }

  function terrainColor(W, x, y) {
    const k = W.kindAt(x, y);
    if (k === 'wall') return '#16241c';
    if (k === 'liquid') return LIQUID[W.liquidKind ? W.liquidKind(x, y) : ''] || '#4fb4ff';
    return null;
  }

  function draw() {
    const ns = NX.ns, p = NX.me();
    if (!p) return;
    if (p !== runPlayer) { runPlayer = p; runId++; }
    const H = size / 2, s = H / RANGE, cx = p.x, cy = p.y;
    const toX = (x) => H + (x - cx) * s;
    const toY = (y) => H + (y - cy) * s;
    const inside = (x, y) => Math.abs(x - cx) <= RANGE && Math.abs(y - cy) <= RANGE;
    // Proyección al borde para marcadores importantes fuera de rango.
    const edge = (x, y) => {
      const dx = x - cx, dy = y - cy, m = Math.max(Math.abs(dx), Math.abs(dy)) || 1;
      const k = Math.min(1, (RANGE - 6 / s) / m);
      return [H + dx * k * s, H + dy * k * s];
    };
    const dot = (x, y, r, fill, ring) => {
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fillStyle = fill;
      g.fill();
      if (ring) { g.lineWidth = 1.5; g.strokeStyle = ring; g.stroke(); }
    };

    g.clearRect(0, 0, size, size);
    g.fillStyle = layer('terrain') ? '#41604f' : '#26394a';
    g.fillRect(0, 0, size, size);

    // Terreno: World.kindAt es caro, así que se cachea por celda y se
    // completa con un presupuesto fijo de muestras por cuadro.
    const W = ns.World;
    if (layer('terrain') && W && W.kindAt) {
      const sig = `${runId}|${String(W.biome)}|${W.arena ? 1 : 0}`;
      if (sig !== terrainSig) { terrain.clear(); terrainSig = sig; }
      const c0x = Math.floor((cx - RANGE) / CELL), c1x = Math.floor((cx + RANGE) / CELL);
      const c0y = Math.floor((cy - RANGE) / CELL), c1y = Math.floor((cy + RANGE) / CELL);
      const px = Math.ceil(CELL * s) + 0.5;
      let budget = SAMPLE_BUDGET;
      for (let j = c0y; j <= c1y; j++) {
        for (let i = c0x; i <= c1x; i++) {
          const key = i + ',' + j;
          let col = terrain.get(key);
          if (col === undefined) {
            if (budget-- <= 0) continue;
            col = terrainColor(W, i * CELL + CELL / 2, j * CELL + CELL / 2);
            terrain.set(key, col);
          }
          if (col) { g.fillStyle = col; g.fillRect(toX(i * CELL), toY(j * CELL), px, px); }
        }
      }
      if (terrain.size > 60000) terrain.clear();
    }

    const C = ns.Camera;
    if (layer('view') && C && C.left) {
      g.strokeStyle = '#ffffff';
      g.lineWidth = 1;
      g.strokeRect(toX(C.left()) + 0.5, toY(C.top()) + 0.5, C.w * s, C.h * s);
    }

    // Objetos que vale la pena buscar (la experiencia y las monedas serían ruido).
    if (layer('items') && ns.Pickups && ns.Pickups.all) {
      const KIND = ns.Pickups.KIND || {};
      for (const q of ns.Pickups.all()) {
        if (q.kind === 'xp' || q.kind === 'xpBig' || q.kind === 'coin' || !inside(q.x, q.y)) continue;
        const x = toX(q.x), y = toY(q.y);
        g.fillStyle = '#0b1838';
        g.fillRect(x - 3, y - 3, 6, 6);
        g.fillStyle = (KIND[q.kind] && KIND[q.kind].color) || '#ffd23f';
        g.fillRect(x - 2, y - 2, 4, 4);
      }
    }

    // Cofres, altares y charcos: se escanean dos veces por segundo.
    const now = performance.now();
    if (W && now - lastPropScan > 500) {
      lastPropScan = now;
      props = [];
      if (W.propsInCircle) for (const q of W.propsInCircle(cx, cy, RANGE) || []) if (q.type === 'chest') props.push(q);
      if (W.specialsNear) for (const q of W.specialsNear(cx, cy, RANGE) || []) if (q.type === 'bigchest' || q.type === 'altar' || q.type === 'spring') props.push(q);
    }
    for (const q of props) {
      if (!inside(q.x, q.y)) continue;
      const x = toX(q.x), y = toY(q.y);
      if (q.type === 'spring') {
        if (!layer('springs')) continue;
        g.save();
        g.globalAlpha = (q.charge == null ? 1 : q.charge) >= 0.15 ? 1 : 0.4;
        dot(x, y, 5, '#2fbf6a', '#ffffff');
        g.fillStyle = '#ffffff';
        g.fillRect(x - 1, y - 3, 2, 6);
        g.fillRect(x - 3, y - 1, 6, 2);
        g.restore();
        continue;
      }
      if (q.used || q.open || q.hp <= 0) continue;
      if (q.type === 'altar') {
        if (!layer('altars')) continue;
        g.save();
        g.translate(x, y);
        g.rotate(Math.PI / 4);
        g.fillStyle = '#7fe0ff';
        g.strokeStyle = '#0b1838';
        g.lineWidth = 1.5;
        g.fillRect(-3, -3, 6, 6);
        g.strokeRect(-3, -3, 6, 6);
        g.restore();
        continue;
      }
      if (!layer('chests')) continue;
      const h = q.type === 'bigchest' ? 4.5 : 3;
      g.fillStyle = '#0b1838';
      g.fillRect(x - h - 1, y - h - 1, 2 * h + 2, 2 * h + 2);
      g.fillStyle = q.type === 'bigchest' ? '#ffd23f' : '#c98a3c';
      g.fillRect(x - h, y - h, 2 * h, 2 * h);
    }

    // Enemigos comunes como puntos rojos. Los especiales van más grandes y
    // se fijan al borde cuando están fuera de rango.
    const special = [];
    if (ns.EnemyMgr && ns.EnemyMgr.all) {
      g.fillStyle = '#ff5f6d';
      for (const e of ns.EnemyMgr.all()) {
        if (e.dead) continue;
        if (e.boss || e.legend || e.judge || e.shiny || e.golden || e.behavior === 'thief') {
          const l = e.boss || e.legend || e.judge ? 'bosses' : e.shiny ? 'shinies' : 'golden';
          if (layer(l)) special.push(e);
          continue;
        }
        if (layer('enemies') && inside(e.x, e.y)) g.fillRect(toX(e.x) - 1, toY(e.y) - 1, 2.5, 2.5);
      }
    }
    const pulse = 5 + 3 * Math.sin(now / 160);
    for (const e of special) {
      const [x, y] = edge(e.x, e.y);
      if (e.shiny || e.golden) {
        g.beginPath();
        g.arc(x, y, pulse + 3, 0, Math.PI * 2);
        g.lineWidth = 1.5;
        g.strokeStyle = e.shiny ? '#7fe0ff' : '#ffd23f';
        g.stroke();
      }
      if (e.boss || e.legend || e.judge) dot(x, y, 5, e.legend || e.judge ? '#c47bff' : '#ff3048', '#ffffff');
      else if (e.shiny) dot(x, y, 4, '#7fe0ff', '#ffffff');
      else dot(x, y, 3.5, '#ffd23f', '#0b1838');
    }

    const rift = ns.Rift && ns.Rift.rift;
    if (layer('rift') && rift && typeof rift.x === 'number') {
      const [x, y] = edge(rift.x, rift.y);
      g.lineWidth = 2.5;
      g.strokeStyle = '#c47bff';
      g.beginPath();
      g.arc(x, y, 5, 0, Math.PI * 2);
      g.stroke();
    }
    const ev = ns.Events && ns.Events.current;
    if (layer('events') && ev && typeof ev.x === 'number') {
      const [x, y] = edge(ev.x, ev.y);
      g.save();
      g.translate(x, y);
      g.rotate(Math.PI / 4);
      g.fillStyle = '#ffd23f';
      g.strokeStyle = '#0b1838';
      g.lineWidth = 1.5;
      g.fillRect(-4, -4, 8, 8);
      g.strokeRect(-4, -4, 8, 8);
      g.restore();
    }

    if (layer('mates') && ns.Coop && ns.Coop.active && ns.Coop.players) {
      for (const m of ns.Coop.players()) {
        if (m === p) continue;
        const [x, y] = edge(m.x, m.y);
        const down = m.dead || (m.net && m.net.dead);
        if (down) {
          g.beginPath();
          g.arc(x, y, pulse + 4, 0, Math.PI * 2);
          g.lineWidth = 2;
          g.strokeStyle = '#ff5f6d';
          g.stroke();
        }
        dot(x, y, 4.5, down ? '#5b6b88' : m.tagColor || '#5fc8ff', '#0b1838');
      }
    }

    // Tú, como una flecha que apunta hacia donde caminas.
    g.save();
    g.translate(H, H);
    g.rotate(typeof p.moveAngle === 'number' ? p.moveAngle : -Math.PI / 2);
    g.beginPath();
    g.moveTo(7, 0); g.lineTo(-5, -5); g.lineTo(-2, 0); g.lineTo(-5, 5); g.closePath();
    g.fillStyle = '#ffffff';
    g.fill();
    g.lineWidth = 1.5;
    g.strokeStyle = p.tagColor || '#ffd23f';
    g.stroke();
    g.restore();
  }

  NX.feature({
    key: KEY,
    label: 'Minimapa',
    needs: (ns) => ns.World && ns.World.kindAt && ns.EnemyMgr && ns.EnemyMgr.all && ns.Pickups && ns.Pickups.all && ns.Camera && ns.Camera.left,
    setup() { NX.onReady(build); },
  });

  NX.keys.bind((e) => e.code === 'KeyM' && e.altKey && !e.ctrlKey && !e.metaKey && NX.isOn(KEY) && NX.inRun(), () => {
    const on = !NX.store.get('mapShown', true);
    NX.store.set('mapShown', on);
    NX.toast(on ? 'Minimapa visible' : 'Minimapa oculto');
    return true;
  });

  NX.settings.section({
    key: KEY,
    title: 'Minimapa',
    render(box) {
      box.appendChild(NX.ui.toggle('Activado', 'on:' + KEY, true));
      box.appendChild(NX.ui.toggle('Visible en partida (Alt+M)', 'mapShown', true));
      box.appendChild(NX.ui.range('Tamaño', 'mapSize', SIZE_MIN, SIZE_MAX, 10, 180, (v) => v + ' px', (v) => { if (cv) setSize(v); }));
      for (const [k, label] of LAYERS) box.appendChild(NX.ui.toggle(label, 'map:' + k, true));
      const reset = document.createElement('button');
      reset.type = 'button';
      reset.className = 'nx-close';
      reset.textContent = 'Devolver a la esquina';
      reset.addEventListener('click', () => { NX.store.set('mapPos', null); if (el) place(innerWidth - size - 26, 70); });
      box.appendChild(reset);
    },
  });
})();
