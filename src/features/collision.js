// Choques sin atascos. El juego mueve al jugador (x += v·dt) y llama a
// World.collide(jugador), que lo saca de cada tile de muro (círculo contra
// caja) y de cada objeto sólido del tile (círculo contra círculo) en dos
// pasadas. Eso ya desliza en diagonal, pero de frente contra un árbol, una
// roca o el borde de un muro el avance se queda en cero, y entre dos objetos
// cercanos el jugador tiembla. Este módulo envuelve World.collide solo para el
// jugador local:
// - radio de choque opcionalmente menor que el visual;
// - subpasos si el movimiento del cuadro es largo (teléfonos lentos);
// - rodeo: si el avance queda bloqueado, busca a cada lado un punto libre
//   desde el que se pueda seguir hacia adelante y desplaza al jugador hacia
//   ese lado sin superar su velocidad. Contra un muro recto no hay punto
//   libre adelante, así que no desliza de lado;
// - empuje suave: un solape grande se resuelve en varios cuadros y, si queda
//   encajado, se abre paso hacia el hueco libre más cercano.
// Usa el propio World.collide sobre un objeto de prueba reutilizado, así que
// respeta muros, objetos y arenas de todos los biomas y mapas. Apagado, la
// función original queda intacta.
(() => {
  const KEY = 'collision';
  const ASSIST = { 0: 0, 1: 1.2, 2: 2.1, 3: 3 };
  const DIRS = [];
  for (let i = 0; i < 12; i++) DIRS.push([Math.cos((i / 12) * Math.PI * 2), Math.sin((i / 12) * Math.PI * 2)]);
  const RINGS = [3, 6, 10, 15, 21, 28];

  let ns = null, W = null, orig = null, PlayerCls = null;
  const probe = { x: 0, y: 0, r: 10 };
  const stats = { calls: 0, steers: 0, unwedges: 0, softs: 0 };
  let cfgT = -1e9, kRad = 0.85, reach = 2.1, soft = true;

  function cfg() {
    const t = performance.now();
    if (t - cfgT < 500) return;
    cfgT = t;
    kRad = NX.clamp(+NX.store.get('coll2:radius', 85) || 85, 60, 100) / 100;
    reach = ASSIST[NX.store.get('coll2:assist', 2)] != null ? ASSIST[NX.store.get('coll2:assist', 2)] : 2.1;
    soft = NX.store.get('coll2:soft', true) !== false;
  }

  // true si un círculo en (x, y) de radio r toca muro u objeto sólido.
  function blocked(x, y, r) {
    probe.x = x; probe.y = y; probe.r = r;
    return orig.call(W, probe);
  }

  // Rodeo: busca a los lados un punto libre desde el que se pueda avanzar.
  function steer(o, px, py, ux, uy, len, rc) {
    const ax = o.x - px, ay = o.y - py;
    const got2 = ax * ax + ay * ay;
    if (got2 > len * len * 0.49) return; // ya avanza bastante (deslizamiento normal)
    // Búsqueda fallida hace poco en la misma dirección: no repetir cada cuadro.
    if (o._nxsf > 0 && ux * o._nxsu + uy * o._nxsv > 0.985) { o._nxsf--; return; }
    const lat = -ax * uy + ay * ux;
    const s0 = lat > 0.05 ? 1 : lat < -0.05 ? -1 : (o._nxside || 1);
    const maxShift = rc * reach + 4, stepM = Math.max(4, rc * 0.4);
    const look = rc + 4 + len, tr = rc - 0.5;
    let openA = true, openB = true;
    for (let m = stepM; m <= maxShift + 0.01; m += stepM) {
      for (let k = 0; k < 2; k++) {
        if (k ? !openB : !openA) continue;
        const s = k ? -s0 : s0;
        const qx = o.x - uy * s * m, qy = o.y + ux * s * m;
        if (blocked(qx, qy, tr)) { if (k) openB = false; else openA = false; continue; }
        if (blocked(qx + ux * look, qy + uy * look, tr)) continue;
        const free = Math.sqrt(Math.max(0, len * len - got2));
        const step = Math.min(m, Math.max(len * 0.35, free * 0.95));
        o.x -= uy * s * step;
        o.y += ux * s * step;
        orig.call(W, o);
        o._nxside = s;
        o._nxsf = 0;
        stats.steers++;
        return;
      }
      if (!openA && !openB) break;
    }
    o._nxsf = 15; o._nxsu = ux; o._nxsv = uy;
  }

  // Si sigue encajado (solape real tras resolver), avanza hacia el hueco libre más cercano.
  function unwedge(o, rc) {
    if (!blocked(o.x, o.y, rc - 1.5)) return;
    const tr = rc - 0.5;
    for (const rad of RINGS) {
      for (const [cx, cy] of DIRS) {
        const x = o.x + cx * rad, y = o.y + cy * rad;
        if (blocked(x, y, tr)) continue;
        const mv = Math.min(rad, 2.5 + rad * 0.3);
        o.x += cx * mv; o.y += cy * mv;
        stats.unwedges++;
        return;
      }
    }
  }

  function solve(o) {
    cfg();
    stats.calls++;
    const r0 = o.r, rc = r0 * kRad;
    const ax = o.x, ay = o.y;
    const px = o._nxpx, py = o._nxpy;
    const dx = ax - px, dy = ay - py, len = Math.sqrt(dx * dx + dy * dy);
    const tele = o._nxok !== 1 || !(len <= Math.max(48, r0 * 3));
    let hit = false;
    o.r = rc;
    try {
      if (tele || len < 1e-4) {
        hit = orig.call(W, o);
      } else {
        const n = Math.min(4, Math.ceil(len / Math.max(2, rc * 0.5)));
        if (n > 1) {
          o.x = px; o.y = py;
          for (let i = 0; i < n; i++) { o.x += dx / n; o.y += dy / n; if (orig.call(W, o)) hit = true; }
        } else hit = orig.call(W, o);
        // Empuje suave: un solape grande (objeto que apareció encima, cambio de
        // tamaño) se resuelve en varios cuadros en vez de dar un salto.
        if (soft && hit) {
          const qx = o.x - ax, qy = o.y - ay, ql = Math.sqrt(qx * qx + qy * qy);
          if (ql > len + 8) {
            const f = Math.max(0.35, (len + 6) / ql);
            const nx = ax + qx * f, ny = ay + qy * f;
            if (!W.isWall(nx, ny)) { o.x = nx; o.y = ny; stats.softs++; }
          }
        }
        if (hit && reach > 0) steer(o, px, py, dx / len, dy / len, len, rc);
      }
      if (soft && hit) unwedge(o, rc);
    } finally {
      o.r = r0;
    }
    o._nxpx = o.x; o._nxpy = o.y; o._nxok = 1;
    return hit;
  }

  NX.feature({
    key: KEY,
    label: 'Choques sin atascos',
    needs: (n) => n.World && typeof n.World.collide === 'function' && typeof n.World.isWall === 'function' && typeof n.Player === 'function',
    setup(n) {
      ns = n; W = n.World; orig = W.collide; PlayerCls = n.Player;
      W.collide = function (o) {
        if (!o || !(o instanceof PlayerCls) || o.remote || !NX.isOn(KEY) || (ns.Coop && ns.Coop.active && o !== ns.Coop.local)) {
          if (o && o._nxok) o._nxok = 0;
          return orig.apply(this, arguments);
        }
        try { return solve(o); } catch (err) { NX.trip(KEY, err); o._nxok = 0; return orig.apply(this, arguments); }
      };
      NX.collision = { stats: () => ({ ...stats }), radius: () => kRad, original: (o) => orig.call(W, o) };
    },
  });

  NX.settings.section({
    key: KEY,
    tab: 'Cámara y mapa',
    title: 'Choques sin atascos',
    keywords: 'colisión choques atascos trabar árboles rocas muros esquinas deslizar rodear radio',
    render(el) {
      el.appendChild(NX.ui.toggle('Activado', 'on:' + KEY, true));
      el.appendChild(NX.ui.range('Radio de choque del jugador', 'coll2:radius', 60, 100, 5, 85, (v) => v + ' %', () => { cfgT = -1e9; }));
      el.appendChild(NX.ui.select('Ayuda para rodear obstáculos', 'coll2:assist', [['0', 'Sin ayuda'], ['1', 'Suave'], ['2', 'Normal'], ['3', 'Amplia']], '2', () => { cfgT = -1e9; }));
      el.appendChild(NX.ui.toggle('Empuje suave para salir de solapes', 'coll2:soft', true, () => { cfgT = -1e9; }));
      el.appendChild(NX.ui.note('Al chocar de frente con un árbol, una roca o el borde de un muro, el jugador se desliza hacia el lado libre en vez de quedarse trabado. Contra un muro recto no desliza de lado. Solo afecta al jugador local.'));
    },
  });
})();
