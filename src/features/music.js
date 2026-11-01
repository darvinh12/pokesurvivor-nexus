// Música: apaga la música original del juego (por defecto) y permite poner
// archivos de audio propios para el menú, cada bioma, los jefes, las grietas
// y el juicio final.
//
// Cómo suena la música del juego: no hay archivos. Audio.music(nombre) la
// sintetiza en vivo con Web Audio a partir de las partituras de MUSIC
// (village es el menú, BIOME_MUSIC son forest, cave y volcano, y además boss,
// rift y judgment). Si el nombre pedido es distinto del actual, funde y
// desconecta la pista anterior y, si el nombre no es vacío, programa la nueva.
// Este módulo envuelve Audio.music: recuerda qué pidió el juego y le pasa
// null cuando la música original está apagada o cuando suena una pista
// propia, así el sintetizador ni siquiera programa notas. Audio.sfx no se
// toca. Las pistas propias suenan en un elemento <audio> con el volumen de
// música del juego (Audio.settings.music y muted).
// La idea de interceptar Audio.music por área viene de setupMusic de
// PokeSurvivor Plus (MIT); el código es propio.
(() => {
  const KEY = 'music';
  const SLOTS = [
    ['menu', 'Menú principal'],
    ['forest', 'Bosque'],
    ['cave', 'Cueva'],
    ['volcano', 'Volcán'],
    ['boss', 'Jefes'],
    ['rift', 'Grietas legendarias'],
    ['judgment', 'Juicio final'],
    ['run', 'Partida (respaldo para todo lo vacío)'],
  ];
  const SLOT_OF = { village: 'menu', forest: 'forest', cave: 'cave', volcano: 'volcano', boss: 'boss', rift: 'rift', judgment: 'judgment' };
  // Si un hueco está vacío, se prueba con el siguiente de su lista.
  const FALLBACK = { forest: ['run'], cave: ['run'], volcano: ['run'], boss: ['run'], rift: ['boss', 'run'], judgment: ['boss', 'run'] };

  // ---------- almacenamiento de archivos (IndexedDB) ----------
  let dbP = null;
  const db = () => dbP || (dbP = new Promise((res, rej) => {
    if (!window.indexedDB) { rej(new Error('Este navegador no tiene IndexedDB')); return; }
    const r = indexedDB.open('nexus-music', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('tracks', { keyPath: 'id' });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  }));
  const tx = async (mode, fn) => {
    const d = await db();
    return new Promise((res, rej) => {
      const t = d.transaction('tracks', mode);
      const req = fn(t.objectStore('tracks'));
      t.oncomplete = () => res(req && req.result);
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error);
    });
  };
  const meta = new Map(); // id -> { id, name, size }
  let metaReady = null;
  const loadMeta = () => metaReady || (metaReady = (async () => {
    try {
      const all = await tx('readonly', (s) => s.getAll());
      for (const t of all || []) meta.set(t.id, { id: t.id, name: t.name, size: t.size });
    } catch (err) { console.warn('[nexus] música:', err); }
  })());

  const slots = () => { const s = NX.store.get('music:slots', null); return s && typeof s === 'object' ? s : {}; };
  const setSlots = (s) => NX.store.set('music:slots', s);
  const listOf = (slot) => (slots()[slot] || []).filter((id) => meta.has(id));
  const gameMusicOn = () => NX.store.get('music:game', 'off') === 'on';

  async function addFiles(slot, files) {
    const s = slots();
    const ids = s[slot] || [];
    let n = 0;
    for (const f of files) {
      if (!f || !/^audio\//.test(f.type || '') && !/\.(mp3|ogg|oga|opus|wav|m4a|aac|flac|webm)$/i.test(f.name)) continue;
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
      const name = f.name.replace(/\.[^.]+$/, '').slice(0, 60) || 'Pista';
      await tx('readwrite', (st) => st.put({ id, name, size: f.size, type: f.type, blob: f, added: Date.now() }));
      meta.set(id, { id, name, size: f.size });
      ids.push(id);
      n++;
    }
    s[slot] = ids;
    setSlots(s);
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (_) { /* opcional */ }
    return n;
  }
  async function removeFrom(slot, id) {
    const s = slots();
    s[slot] = (s[slot] || []).filter((x) => x !== id);
    setSlots(s);
    // Si ningún hueco la usa, se borra el archivo.
    if (!Object.values(s).some((l) => Array.isArray(l) && l.includes(id))) {
      meta.delete(id);
      try { await tx('readwrite', (st) => st.delete(id)); } catch (err) { console.warn('[nexus] música:', err); }
    }
  }
  const getBlob = async (id) => { const r = await tx('readonly', (st) => st.get(id)); return r && r.blob; };

  // ---------- reproducción ----------
  let A = null, orig = null;
  let want = null;         // la pista que pidió el juego
  let curSlot = null, curId = null, curUrl = '', nameNow = '';
  const lastIdx = {};
  let au = null, fade = 0, fadeT = 0, blocked = false, gen = 0;

  const targetVol = () => {
    try {
      const st = A.settings;
      if (st.muted) return 0;
      return NX.clamp((+st.music || 0) * (NX.clamp(+NX.store.get('music:gain', 100) || 0, 0, 100) / 100), 0, 1);
    } catch (_) { return 0.5; }
  };
  const player = () => {
    if (au) return au;
    au = new Audio();
    au.preload = 'auto';
    au.addEventListener('ended', () => { if (curSlot) next(curSlot, true); });
    au.addEventListener('error', () => { if (curSlot && curId) { console.warn('[nexus] música: no se pudo leer', nameNow); setTimeout(() => next(curSlot, true), 1000); } });
    return au;
  };
  const tryPlay = () => {
    if (!au || !curId) return;
    const p = au.play();
    if (p && p.catch) p.then(() => { blocked = false; }, () => { blocked = true; });
  };
  // Los navegadores no dejan sonar audio sin un toque previo: se reintenta en el primero.
  for (const ev of ['pointerdown', 'keydown', 'touchend']) addEventListener(ev, () => { if (blocked && curId && !document.hidden) tryPlay(); }, true);
  document.addEventListener('visibilitychange', () => {
    if (!au || !curId) return;
    if (document.hidden) au.pause(); else tryPlay();
  });

  function setFade(to, ms, done) {
    clearInterval(fadeT);
    const from = fade, t0 = performance.now();
    fadeT = setInterval(() => {
      const t = Math.min(1, (performance.now() - t0) / ms);
      fade = from + (to - from) * t;
      if (au) au.volume = NX.clamp(targetVol() * fade, 0, 1);
      if (t >= 1) { clearInterval(fadeT); if (done) done(); }
    }, 40);
  }

  function resolveList(slot) {
    for (const s of [slot, ...(FALLBACK[slot] || [])]) {
      const l = listOf(s);
      if (l.length) return { slot: s, list: l };
    }
    return null;
  }
  function pickFrom(slot, list) {
    if (list.length === 1) return list[0];
    let i;
    if (NX.store.get('music:shuffle', false)) {
      do { i = Math.floor(Math.random() * list.length); } while (list[i] === curId && list.length > 1);
    } else i = ((lastIdx[slot] ?? -1) + 1) % list.length;
    lastIdx[slot] = i;
    return list[i];
  }

  async function start(slot, id, loop) {
    const my = ++gen;
    const blob = await getBlob(id).catch(() => null);
    if (my !== gen) return;
    if (!blob) { meta.delete(id); next(slot, true); return; }
    const a = player();
    if (curUrl) URL.revokeObjectURL(curUrl);
    curUrl = URL.createObjectURL(blob);
    curId = id;
    nameNow = (meta.get(id) || {}).name || '';
    a.src = curUrl;
    a.loop = !!loop;
    fade = 0;
    a.volume = 0;
    tryPlay();
    setFade(1, 700);
    if (NX.shown('scr-menu') && nameNow) NX.toast('Suena: ' + nameNow);
  }
  function next(slot, force) {
    const r = resolveList(slot);
    if (!r) { stopCustom(); return; }
    curSlot = slot;
    const id = pickFrom(r.slot, r.list);
    if (!force && id === curId && au && !au.paused) return;
    const loop = r.list.length <= 1;
    if (au && curId && !au.paused && fade > 0.05) setFade(0, 350, () => start(slot, id, loop));
    else start(slot, id, loop);
  }
  function stopCustom() {
    curSlot = null;
    gen++;
    if (!au || !curId) { curId = null; return; }
    setFade(0, 400, () => {
      if (curSlot) return;
      au.pause();
      au.removeAttribute('src');
      au.load();
      if (curUrl) { URL.revokeObjectURL(curUrl); curUrl = ''; }
      curId = null;
      nameNow = '';
    });
  }

  const slotFor = (name) => {
    if (!name) return null;
    if (SLOT_OF[name]) return SLOT_OF[name];
    return NX.inRun() ? 'run' : null;
  };

  // Decide qué suena para lo que pidió el juego.
  function route(self) {
    const on = NX.isOn(KEY);
    if (!on) { stopCustom(); return orig.call(self, want); }
    const slot = slotFor(want);
    const r = slot && resolveList(slot);
    if (r) {
      orig.call(self, null);
      if (curSlot !== slot || !curId || !r.list.includes(curId)) next(slot, true);
      else if (au) au.loop = r.list.length <= 1;
      return;
    }
    stopCustom();
    return orig.call(self, gameMusicOn() ? want : null);
  }
  const refresh = () => { if (A && orig) { try { route(A); } catch (err) { NX.trip(KEY, err); } } };

  NX.feature({
    key: KEY,
    label: 'Música',
    needs: (ns) => ns.Audio && typeof ns.Audio.music === 'function' && ns.Audio.settings,
    setup(ns) {
      A = ns.Audio;
      orig = A.music;
      // Lo que el juego haya puesto antes de engancharnos.
      want = A.track || null;
      A.music = function (name) {
        want = name || null;
        try { return route(this); } catch (err) { NX.trip(KEY, err); return orig.call(this, gameMusicOn() || !NX.isOn(KEY) ? name : null); }
      };
      loadMeta().then(refresh);
      refresh();
      NX.every(500, () => {
        try {
          // El juego pide la música del menú una sola vez al abrirlo; si eso
          // pasó antes de engancharnos, se deduce aquí.
          if (!want && ns.Game && ns.Game.state === 'ui' && NX.shown('scr-menu')) { want = 'village'; refresh(); }
          if (au && curId && !au.paused && fade >= 1) au.volume = targetVol();
        } catch (err) { NX.trip(KEY, err); }
      }, { key: KEY });
    },
  });

  // ---------- panel ----------
  const fmtMB = (b) => (b / 1048576).toFixed(1) + ' MB';
  NX.css(`#nexus-panel .nx-mus-slot{margin:6px 0;padding:6px 8px;border:1px solid rgba(255,255,255,.18);border-radius:7px}
#nexus-panel .nx-mus-slot .hd{display:flex;justify-content:space-between;align-items:center;gap:8px}
#nexus-panel .nx-mus-slot .hd b{font-weight:400;color:#ffd23f}
#nexus-panel .nx-mus-slot ul{list-style:none;margin:4px 0 0;padding:0}
#nexus-panel .nx-mus-slot li{display:flex;justify-content:space-between;align-items:center;gap:6px;font-size:12px;padding:1px 0}
#nexus-panel .nx-mus-slot li span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
#nexus-panel .nx-mus-slot li .nx-btn{font-size:11px;padding:1px 7px;margin:0}
#nexus-panel .nx-mus-slot .nx-btn{margin:0}`);

  let preview = null;
  function renderSlots(box) {
    box.innerHTML = '';
    const now = document.createElement('p');
    now.className = 'nx-note';
    now.textContent = curId ? 'Suena ahora: ' + nameNow : (gameMusicOn() ? 'Suena la música del juego.' : 'Sin música sonando.');
    box.appendChild(now);
    let total = 0;
    for (const [slot, label] of SLOTS) {
      const ids = listOf(slot);
      const d = document.createElement('div');
      d.className = 'nx-mus-slot';
      d.innerHTML = `<div class="hd"><span>${NX.esc(label)} <b>${ids.length ? ids.length : ''}</b></span></div><ul></ul>`;
      const inp = document.createElement('input');
      inp.type = 'file';
      inp.accept = 'audio/*';
      inp.multiple = true;
      inp.hidden = true;
      inp.addEventListener('change', async () => {
        const files = [...inp.files];
        if (!files.length) return;
        try {
          const n = await addFiles(slot, files);
          NX.toast(n ? `${n} pista${n > 1 ? 's' : ''} agregada${n > 1 ? 's' : ''}` : 'Ningún archivo era de audio');
        } catch (err) { NX.toast('No se pudo guardar: ' + (err && err.message || err)); }
        refresh();
        renderSlots(box);
        setTimeout(() => { if (box.isConnected) renderSlots(box); }, 400);
      });
      const add = NX.ui.button('Agregar', () => inp.click());
      d.querySelector('.hd').append(add, inp);
      const ul = d.querySelector('ul');
      for (const id of ids) {
        const m = meta.get(id);
        total += m.size || 0;
        const li = document.createElement('li');
        li.innerHTML = `<span title="${NX.esc(m.name)}">${NX.esc(m.name)}</span>`;
        const play = NX.ui.button(preview && preview.dataset.id === id ? 'Parar' : 'Probar', async () => {
          if (preview) { preview.pause(); URL.revokeObjectURL(preview.src); const was = preview.dataset.id; preview = null; if (was === id) { renderSlots(box); return; } }
          const blob = await getBlob(id).catch(() => null);
          if (!blob) return;
          preview = new Audio(URL.createObjectURL(blob));
          preview.dataset.id = id;
          preview.volume = targetVol() || 0.5;
          preview.play().catch(() => {});
          preview.addEventListener('ended', () => { preview = null; renderSlots(box); });
          renderSlots(box);
        });
        const del = NX.ui.button('Quitar', async () => { await removeFrom(slot, id); renderSlots(box); refresh(); });
        li.append(play, del);
        ul.appendChild(li);
      }
      box.appendChild(d);
    }
    if (total) box.appendChild(NX.ui.note('Espacio usado: ' + fmtMB(total) + '. Los archivos se guardan solo en este navegador.'));
  }

  NX.settings.section({
    key: KEY,
    title: 'Música',
    tab: 'Estilo',
    keywords: 'música musica canciones audio mp3 archivos propios bioma jefe menú sonido volumen aleatorio',
    render(el) {
      el.appendChild(NX.ui.toggle('Activado', 'on:' + KEY, true, refresh));
      el.appendChild(NX.ui.select('Música del juego', 'music:game', [['off', 'Apagada'], ['on', 'Encendida']], 'off', () => { refresh(); renderSlots(box); }));
      el.appendChild(NX.ui.toggle('Orden aleatorio', 'music:shuffle', false));
      el.appendChild(NX.ui.range('Volumen de tu música', 'music:gain', 0, 100, 5, 100, (v) => v + ' %', () => { if (au && curId && fade >= 1) au.volume = targetVol(); }));
      el.appendChild(NX.ui.note('Tu música sigue el volumen de música del juego y suena aunque la música original esté apagada. Los efectos de sonido no cambian.'));
      const box = document.createElement('div');
      el.appendChild(box);
      renderSlots(box);
      loadMeta().then(() => { if (box.isConnected) renderSlots(box); });
    },
  });
})();
