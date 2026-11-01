// Sincronización entre dispositivos. Solo en la edición y con la sesión de
// Google del juego: los datos de Nexus (NX.store) se guardan en Firestore en
// nexus/{uid}, con la hora de cada clave, y se fusionan por clave con "gana el
// más reciente". Algunas claves se fusionan a su manera: el historial de
// partidas se une por partida, los retos guardan el mejor progreso y los
// récords se quedan con la mejor marca. Lo propio de cada pantalla (posiciones,
// calidad, rendimiento, controles táctiles) no viaja.
//
// Estructura en Firestore:
//   nexus/{uid}            { v, device, updated, updatedMs, count, entries: { clave: { t, v } }, big: { clave: t } }
//   nexus/{uid}/big/{id}   { key, t, v }   para los valores grandes (id = encodeURIComponent(clave))
// v es el valor en JSON y t la hora del cambio en ms. Un valor null es un borrado.
//
// La lógica de fusión no depende de Firebase: el motor recibe un transporte
// con transact(fn), así que se prueba con un transporte en memoria.
(() => {
  const KEY = 'sync';
  const EVERY = 20000;

  // ------------------------------------------------------------- qué no viaja
  const EX_EXACT = new Set(['mapPos', 'mapSize', 'res', 'fps', 'pixel', 'fov', 'panelTab', 'bc:cache',
    'qol:live', 'qol:interrupted', 'modes:snap', 'on:sharp', 'on:fps', 'on:mobile']);
  const EX_PREFIX = ['pos:', 'look:', 'sharp:', 'fps:', 'mobile:', 'prof:', 'perf:', 'sync:', 'hudscale:'];
  const excluded = (k) => EX_EXACT.has(k) || EX_PREFIX.some((p) => k.startsWith(p));

  // ------------------------------------------------------------- fusiones especiales
  // Cada una recibe (más reciente, más antiguo) y devuelve el valor unido.
  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const isEmpty = (v) => v == null || (Array.isArray(v) ? !v.length : isObj(v) && !Object.keys(v).length);
  const byAtDesc = (x, y) => (+y.at || 0) - (+x.at || 0);
  const unionList = (idOf, cap, cmp = byAtDesc) => (n, o) => {
    if (!Array.isArray(n) || !Array.isArray(o)) throw new Error('no es lista');
    const m = new Map();
    for (const x of [...n, ...o]) { if (!x || typeof x !== 'object') continue; const id = idOf(x); if (!m.has(id)) m.set(id, x); }
    const out = [...m.values()].sort(cmp);
    if (cap && out.length > cap) out.length = cap;
    return out;
  };
  const perKey = (pick) => (n, o) => {
    if (!isObj(n) || !isObj(o)) throw new Error('no es objeto');
    const out = Object.assign({}, o);
    for (const [k, v] of Object.entries(n)) out[k] = isObj(v) && isObj(o[k]) ? pick(v, o[k], k) : v;
    return out;
  };
  const num = (v) => +v || 0;
  const MERGERS = {
    'tele:runs': unionList((r) => (r.at || 0) + '|' + (r.dex || ''), 50),
    'endless:hist': unionList((r) => (r.at || 0) + '|' + (r.dex || ''), 10),
    'rush:hist': unionList((r) => (r.at || 0) + '|' + (r.n || ''), 10),
    'secrets:v1': (n, o) => {
      if (!isObj(n) || !isObj(o)) throw new Error('no es objeto');
      const out = Object.assign({}, o, n, { done: Object.assign({}, o.done), best: Object.assign({}, o.best) });
      for (const [id, d] of Object.entries(n.done || {})) {
        const p = out.done[id];
        if (!p || (d && num(d.at) && (!num(p.at) || num(d.at) < num(p.at)))) out.done[id] = d;
      }
      for (const [id, v] of Object.entries(n.best || {})) out.best[id] = Math.max(num(out.best[id]), num(v));
      return out;
    },
    'endless:rec': (n, o) => {
      if (!isObj(n) || !isObj(o)) throw new Error('no es objeto');
      const best = num(n.time) >= num(o.time) ? n : o;
      return Object.assign({}, o, n, {
        time: best.time, dex: best.dex, mon: best.mon, at: best.at,
        level: Math.max(num(n.level), num(o.level)), kills: Math.max(num(n.kills), num(o.kills)), runs: Math.max(num(n.runs), num(o.runs)),
      });
    },
    'rush:best': perKey((x, y) => (num(x.time) <= num(y.time) ? x : y)),
    'maps:best': perKey((x, y, k) => (k === 'dungeon' ? (num(x.rooms) >= num(y.rooms) ? x : y) : (num(x.time) >= num(y.time) ? x : y))),
    'daily:rec': perKey((x, y) => Object.assign({}, num(x.time) >= num(y.time) ? x : y, { tries: Math.max(num(x.tries), num(y.tries)) })),
    'mods:rank': (n, o) => {
      if (!isObj(n) || !isObj(o)) throw new Error('no es objeto');
      const list = unionList((r) => (r.at || 0) + '|' + (r.dex || ''), 10,
        (a, b) => num(b.time) - num(a.time) || num(b.level) - num(a.level) || num(b.kills) - num(a.kills));
      const out = Object.assign({}, o, n);
      for (const k of Object.keys(out)) if (Array.isArray(n[k]) && Array.isArray(o[k])) out[k] = list(n[k], o[k]);
      return out;
    },
    'runcards:stats': (n, o) => {
      if (!isObj(n) || !isObj(o)) throw new Error('no es objeto');
      const out = Object.assign({}, o);
      for (const [k, v] of Object.entries(n)) out[k] = Math.max(num(out[k]), num(v));
      return out;
    },
    'dex:notes': (n, o) => { if (!isObj(n) || !isObj(o)) throw new Error('no es objeto'); return Object.assign({}, o, n); },
    'garden:v1': (n, o) => {
      if (!isObj(n) || !isObj(o)) throw new Error('no es objeto');
      return Object.assign({}, n, { harvested: Math.max(num(n.harvested), num(o.harvested)), planted: Math.max(num(n.planted), num(o.planted)) });
    },
  };

  // JSON con las claves ordenadas: dos objetos iguales en otro orden cuentan como iguales.
  const J = (v) => JSON.stringify(v === undefined ? null : v, (k, x) => (isObj(x) ? Object.keys(x).sort().reduce((o, y) => { o[y] = x[y]; return o; }, {}) : x));
  // Un null sin hora conocida no es un borrado real: se ignora.
  const norm = (e) => (!e || (e.v == null && !e.t) ? null : { t: num(e.t), v: e.v == null ? null : e.v });

  // Fusiona una clave. Empate de horas: gana la nube, así todos convergen.
  function mergeEntry(key, L, R) {
    if (!L) return R;
    if (!R) return L;
    const newer = L.t > R.t ? L : R, older = newer === L ? R : L;
    const fn = MERGERS[key];
    // Si el más reciente quedó vacío (se borró a propósito), manda el borrado.
    if (!fn || isEmpty(newer.v) || isEmpty(older.v)) return newer;
    try { return { t: Math.max(L.t, R.t), v: fn(newer.v, older.v) }; } catch (_) { return newer; }
  }

  // mode: 'merge' (normal), 'pull' (gana la nube en cada choque) o 'push'
  // (gana este dispositivo en cada choque). Las claves que solo existen en un
  // lado se conservan siempre.
  function plan(local, remote, mode = 'merge', now = Date.now()) {
    const keys = new Set([...Object.keys(local), ...Object.keys(remote)]);
    const result = {}, toLocal = [], toRemote = [];
    for (const k of keys) {
      if (excluded(k)) continue;
      const L = norm(local[k]), R = norm(remote[k]);
      let out;
      if (mode === 'pull') out = R || L;
      else if (mode === 'push') out = L ? { t: Math.max(now, L.t, R ? R.t + 1 : 0), v: L.v } : R;
      else out = mergeEntry(k, L, R);
      if (!out) continue;
      result[k] = out;
      const oj = J(out.v);
      if (L ? J(L.v) !== oj || L.t < out.t : out.v !== null) toLocal.push(k);
      if (!R || J(R.v) !== oj || R.t < out.t) toRemote.push(k);
    }
    return { result, toLocal, toRemote };
  }

  // ------------------------------------------------------------- motor
  // store: { keys(deleted), get(k), meta(k), applyRemote(k, v, t) }
  // transport: { transact(fn) } donde fn(remoto) devuelve las entradas a
  // escribir (todas) o null si la nube no cambia; transact resuelve { info }.
  function createEngine({ store, transport }) {
    const st = { busy: false, last: 0, mode: '', err: '', info: null, applied: 0, pushed: 0, keys: 0, skipped: [] };
    let chain = Promise.resolve();
    function snapshot() {
      const snap = {};
      for (const k of store.keys(true)) {
        if (excluded(k)) continue;
        const t = store.meta(k), v = store.get(k);
        if (v == null && !t) continue;
        snap[k] = { t, v: v == null ? null : JSON.parse(JSON.stringify(v)) };
      }
      return snap;
    }
    async function once(mode) {
      st.busy = true;
      st.err = '';
      try {
        const snap = snapshot();
        let p = null;
        const r = await transport.transact((remote) => {
          p = plan(snap, remote || {}, mode);
          return p.toRemote.length ? p.result : null;
        });
        let applied = 0;
        for (const k of p.toLocal) {
          // Si cambió aquí mientras tanto, se respeta y sube en la próxima vuelta.
          if (store.meta(k) !== (snap[k] ? snap[k].t : 0)) continue;
          store.applyRemote(k, p.result[k].v, p.result[k].t);
          applied++;
        }
        Object.assign(st, { last: Date.now(), mode, info: (r && r.info) || null, applied, pushed: p.toRemote.length,
          keys: Object.keys(p.result).length, skipped: (r && r.skipped) || [] });
        return { applied, pushed: p.toRemote.length, keys: st.keys };
      } catch (err) {
        st.err = String((err && (err.code || err.message)) || err).slice(0, 160);
        return { error: st.err };
      } finally {
        st.busy = false;
      }
    }
    // Una vuelta a la vez: las que llegan durante otra esperan su turno.
    function run(mode = 'merge') {
      const p = chain.then(() => once(mode));
      chain = p.catch(() => {});
      return p;
    }
    return { run, st, snapshot };
  }

  function memoryTransport(shared = { entries: {}, writes: 0 }, device = 'memoria') {
    return {
      shared,
      async transact(fn) {
        await Promise.resolve();
        const out = fn(JSON.parse(JSON.stringify(shared.entries)));
        if (out) Object.assign(shared, { entries: JSON.parse(JSON.stringify(out)), writes: shared.writes + 1, device, updated: Date.now() });
        return { info: { device: shared.device || '', updated: shared.updated || 0 } };
      },
    };
  }

  // ------------------------------------------------------------- Firestore
  function firestoreTransport(fb, uid, device) {
    const db = fb.firestore();
    const main = db.collection('nexus').doc(uid);
    const bigRef = (k) => main.collection('big').doc(encodeURIComponent(k));
    const enc = new TextEncoder();
    const parse = (s) => { try { return typeof s === 'string' ? JSON.parse(s) : null; } catch (_) { return null; } };
    const INLINE_MAX = 60000, DOC_BUDGET = 700000, HARD_MAX = 950000;
    return {
      transact(fn) {
        const job = db.runTransaction(async (tx) => {
          const snap = await tx.get(main);
          const d = snap.exists ? (snap.data() || {}) : {};
          const remote = {}, raw = {};
          for (const [k, e] of Object.entries(d.entries || {})) { if (!e) continue; raw[k] = e.v; remote[k] = { t: num(e.t), v: parse(e.v) }; }
          const oldBig = Object.keys(d.big || {});
          const snaps = await Promise.all(oldBig.map((k) => tx.get(bigRef(k))));
          snaps.forEach((s, i) => {
            if (!s.exists) return;
            const b = s.data() || {}, k = b.key || oldBig[i];
            raw[k] = b.v;
            remote[k] = { t: num(b.t), v: parse(b.v) };
          });
          const info = { device: d.device || '', updated: num(d.updatedMs) };
          const out = fn(remote);
          if (!out) return { info };
          // Lo pequeño va dentro del documento principal; lo grande, aparte.
          const items = Object.entries(out).map(([k, e]) => { const s = JSON.stringify(e.v); return { k, t: e.t, s, n: enc.encode(s).length + k.length + 24 }; })
            .sort((a, b) => a.n - b.n);
          const inline = {}, big = {}, skipped = [];
          let total = 0;
          for (const it of items) {
            if (it.n > HARD_MAX) { skipped.push(it.k); continue; }
            if (it.n <= INLINE_MAX && total + it.n <= DOC_BUDGET) { inline[it.k] = { t: it.t, v: it.s }; total += it.n; continue; }
            big[it.k] = it.t;
            if (raw[it.k] !== it.s || !(d.big && d.big[it.k] === it.t)) tx.set(bigRef(it.k), { key: it.k, t: it.t, v: it.s });
          }
          for (const k of oldBig) if (!(k in big)) tx.delete(bigRef(k));
          tx.set(main, { v: 1, device, updatedMs: Date.now(), updated: fb.firestore.FieldValue.serverTimestamp(), count: items.length, entries: inline, big });
          return { info: { device, updated: Date.now() }, skipped };
        });
        const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('la nube no respondió a tiempo')), 25000));
        return Promise.race([job, timeout]);
      },
    };
  }

  // ------------------------------------------------------------- conexión con el juego
  const edition = () => !!(NX.data && NX.data.edition);
  const auto = () => NX.store.get('sync:auto', true) !== false;
  const device = (() => {
    let d = NX.store.get('sync:device', '');
    if (!d) {
      const coarse = typeof matchMedia === 'function' && matchMedia('(pointer:coarse)').matches;
      d = (coarse ? 'Teléfono' : 'PC') + ' ' + Math.random().toString(36).slice(2, 6);
      NX.store.set('sync:device', d);
    }
    return d;
  })();
  let fb = null, user = null, engine = null, pending = false, loopT = 0;

  NX.store.on((k, v, src) => { if (src === 'local' && !excluded(k)) pending = true; });

  async function syncNow(mode = 'merge', why = 'auto') {
    if (!engine) return { error: 'sin sesión' };
    const was = pending;
    pending = false;
    const r = await engine.run(mode);
    if (r.error) pending = pending || was;
    else if (r.applied && why !== 'quiet') NX.toast(`Nube: ${r.applied} dato${r.applied === 1 ? '' : 's'} actualizado${r.applied === 1 ? '' : 's'} · algunos se ven al recargar`);
    if (why === 'manual') {
      if (r.error) NX.toast('No se pudo sincronizar: ' + r.error);
      else if (!r.applied) NX.toast(r.pushed ? `Sincronizado · ${r.pushed} enviado${r.pushed === 1 ? '' : 's'}` : 'Sincronizado · todo al día');
    }
    if (engine && engine.st.skipped.length) console.warn('[nexus] sync: claves demasiado grandes para la nube', engine.st.skipped);
    paint();
    return r;
  }

  function onUser(u) {
    user = u || null;
    engine = user ? createEngine({ store: NX.store, transport: firestoreTransport(fb, user.uid, device) }) : null;
    if (engine && auto()) syncNow('merge');
    paint();
  }

  function connect() {
    const f = window.firebase;
    if (!f || !f.apps || !f.apps.length || typeof f.auth !== 'function' || typeof f.firestore !== 'function') return false;
    fb = f;
    try { fb.auth().onAuthStateChanged(onUser); } catch (err) { NX.fail(KEY, err); }
    return true;
  }

  NX.feature({
    key: KEY,
    label: 'Sincronización',
    early: true,
    setup() {
      if (!edition()) return;
      // El juego carga Firebase cuando lo necesita: se espera sin prisa.
      if (!connect()) { const w = setInterval(() => { if (connect()) clearInterval(w); }, 2000); }
      loopT = setInterval(() => {
        if (engine && pending && auto() && NX.isOn(KEY) && !engine.st.busy && navigator.onLine !== false) syncNow('merge');
      }, EVERY);
      document.addEventListener('visibilitychange', () => {
        if (!engine || !auto() || !NX.isOn(KEY)) return;
        if (document.visibilityState === 'hidden') { if (pending) syncNow('merge'); }
        else if (Date.now() - engine.st.last > 15000) syncNow('merge', 'focus');
      });
      addEventListener('online', () => { if (engine && pending && auto() && NX.isOn(KEY)) syncNow('merge'); });
    },
  });

  // ------------------------------------------------------------- estado y panel
  const ago = (ms) => {
    const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
    if (s < 10) return 'unos segundos';
    if (s < 60) return s + ' s';
    if (s < 3600) return Math.round(s / 60) + ' min';
    return Math.round(s / 3600) + ' h';
  };
  function statusText() {
    if (!edition()) return 'Solo en la edición publicada: aquí no hay nube y los datos quedan en este dispositivo.';
    if (!NX.isOn(KEY)) return 'Apagada: los datos quedan solo en este dispositivo.';
    if (!engine) return 'Sin sesión: solo en este dispositivo. Inicia sesión con Google en el juego para sincronizar.';
    const s = engine.st;
    if (s.busy) return 'Sincronizando…';
    if (s.err) return 'No se pudo sincronizar (' + s.err + '). Se reintenta solo.';
    if (!s.last) return 'Sesión iniciada, todavía sin sincronizar.';
    let t = 'Sincronizado hace ' + ago(s.last) + ' · ' + s.keys + ' datos';
    if (pending) t += ' · cambios pendientes';
    if (s.info && s.info.device && s.info.device !== device) t += ' · último envío desde ' + s.info.device;
    return t;
  }
  let statusEl = null;
  function paint() { if (statusEl && statusEl.isConnected) statusEl.textContent = statusText(); }
  setInterval(paint, 1000);

  NX.sync = {
    status: () => ({ edition: edition(), signedIn: !!engine, device, pending, ...(engine ? engine.st : {}), text: statusText() }),
    now: (mode) => syncNow(mode || 'merge', 'manual'),
    flush: () => (engine && pending ? syncNow('merge', 'quiet') : Promise.resolve({ skipped: true })),
    excluded,
    _t: { plan, mergeEntry, excluded, createEngine, memoryTransport, MERGERS },
  };

  const armed = (label, confirmLabel, fn) => NX.ui.armed(label, confirmLabel, fn);

  NX.settings.section({
    key: KEY,
    tab: 'Datos',
    title: 'Sincronización entre dispositivos',
    keywords: 'nube firebase firestore sincronizar dispositivos teléfono pc móvil cuenta google',
    keys: ['sync:auto'],
    render(el) {
      statusEl = NX.ui.note(statusText());
      statusEl.className = 'nx-note nx-sync-st';
      el.appendChild(statusEl);
      el.appendChild(NX.ui.toggle('Sincronizar automáticamente', 'sync:auto', true, () => paint()));
      const need = (fn) => () => { if (!engine) { NX.toast(edition() ? 'Inicia sesión con Google en el juego primero' : 'La nube solo existe en la edición publicada'); return; } fn(); };
      el.appendChild(NX.ui.button('Sincronizar ahora', need(() => syncNow('merge', 'manual'))));
      el.appendChild(armed('Usar los datos de la nube', '¿Seguro? Toca otra vez', need(() => syncNow('pull', 'manual'))));
      el.appendChild(armed('Subir los de este dispositivo', '¿Seguro? Toca otra vez', need(() => syncNow('push', 'manual'))));
      el.appendChild(NX.ui.note('Este dispositivo: ' + device + '. Sube los cambios cada 20 s y al salir de la pestaña, y baja al iniciar sesión y al volver. ' +
        'No viajan las posiciones, el tamaño del minimapa, el campo de visión, la escala del HUD, la calidad del mapa, la nitidez, los FPS ni los ajustes táctiles.'));
    },
  });
})();
