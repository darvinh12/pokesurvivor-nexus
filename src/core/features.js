// Red de seguridad. Cada módulo declara qué piezas del juego necesita. Si no
// aparecen, si su arranque falla o si falla seguido al dibujar, solo ese
// módulo se apaga y el juego sigue como si el mod no existiera.
const FEATS = new Map(); // key -> { key, label, status: pending|ok|missing|broken, err }
const trips = new Map();
let failNoticeT = 0;

NX.featureList = () => [...FEATS.values()].map((f) => ({ ...f }));
NX.enabled = (key) => NX.store.get('on:' + key, true) !== false;
NX.setEnabled = (key, on) => NX.store.set('on:' + key, !!on);
NX.isOn = (key) => {
  const f = FEATS.get(key);
  return !!f && f.status !== 'broken' && f.status !== 'missing' && NX.enabled(key);
};

function fail(key, err, kind = 'broken') {
  const f = FEATS.get(key);
  if (!f || f.status === 'broken' || f.status === 'missing') return;
  f.status = kind;
  f.err = String((err && err.message) || err || '').slice(0, 200);
  console.warn('[nexus] módulo apagado: ' + f.label, err || '');
  clearTimeout(failNoticeT);
  failNoticeT = setTimeout(() => {
    const off = [...FEATS.values()].filter((x) => x.status === 'broken' || x.status === 'missing').length;
    if (off) NX.toast(`Nexus apagó ${off} módulo${off > 1 ? 's' : ''} · el juego cambió · Alt+N para ver`);
  }, 2500);
}
NX.fail = fail;

// Errores al dibujar: algunos se toleran, 20 en 10 segundos apagan el módulo.
NX.trip = (key, err) => {
  const now = performance.now();
  const t = trips.get(key) || { n: 0, t: now };
  if (now - t.t > 10000) { t.n = 0; t.t = now; }
  t.n++;
  trips.set(key, t);
  if (t.n === 1) console.warn('[nexus] ' + key, err);
  if (t.n >= 20) fail(key, err);
};

// def: { key, label, needs(ns) -> bool, setup(ns) }. Sin needs, arranca de una vez.
NX.feature = (def) => {
  const f = { key: def.key, label: def.label, status: 'pending', err: '' };
  FEATS.set(def.key, f);
  const start = (ns) => {
    const t0 = Date.now();
    const tick = () => {
      let ok = false;
      try { ok = !def.needs || !!def.needs(ns); } catch (_) { ok = false; }
      if (ok) {
        try {
          def.setup(ns);
          if (f.status === 'pending') f.status = 'ok';
        } catch (err) { fail(def.key, err); }
        return;
      }
      const waited = Date.now() - t0;
      if ((waited > 20000 && ns && ns.Game && ns.MenuUI) || waited > 60000) {
        fail(def.key, 'No aparecieron las piezas del juego que necesita', 'missing');
        return;
      }
      setTimeout(tick, 100);
    };
    tick();
  };
  if (def.early) start(null);
  else NX.onNS(start);
};
