// Modo sin conexión (panel). La edición publicada trae su propio service
// worker (scripts/build-edition.mjs): precachea el código y la interfaz al
// instalarse, guarda cada sprite la primera vez que se usa y sirve todo desde
// la caché sin red. El guardado local del juego no depende de la red y, con
// Firebase propio, el juego sincroniza al volver la conexión.
// Aquí se ve cuánto ocupa y se pueden descargar por adelantado los sprites
// de tus Pokémon (o todos). La lista y los tamaños salen de
// nexus-offline.json, que genera el mismo script.
(() => {
  const KEY = 'qoloff';
  const MB = (b) => (b / 1048576).toFixed(b >= 10485760 ? 0 : 1).replace('.', ',') + ' MB';
  let manifestP = null, busy = false, progress = '';

  const sw = () => ('serviceWorker' in navigator ? navigator.serviceWorker : null);
  const ctrl = () => { const s = sw(); return s && s.controller; };
  const manifest = () => (manifestP || (manifestP = fetch('nexus-offline.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).catch(() => null)));

  function ask(msg, ms = 3000) {
    const c = ctrl();
    if (!c) return Promise.resolve(null);
    return new Promise((resolve) => {
      const ch = new MessageChannel();
      const t = setTimeout(() => resolve(null), ms);
      ch.port1.onmessage = (e) => { clearTimeout(t); resolve(e.data); };
      try { c.postMessage(msg, [ch.port2]); } catch (_) { clearTimeout(t); resolve(null); }
    });
  }

  // Archivos de sprites de una carpeta del manifiesto.
  function files(m, key, shiny) {
    const e = m.art.dex[key];
    if (!e) return [];
    const base = 'assets/pokemon/' + key + '/';
    const out = (e[2] || m.art.anims).map((a) => base + a + '.png');
    if (shiny && e[1] > 0) for (const a of (e[3] || e[2] || m.art.anims)) out.push(base + 's/' + a + '.png');
    return out;
  }
  // Carpetas de tus Pokémon: el normal, su shiny si lo tienes y sus megas.
  function mine(m) {
    const s = NX.ns && NX.ns.DB && NX.ns.DB.save;
    if (!s) return { urls: [], bytes: 0, n: 0 };
    const keys = Object.keys(m.art.dex);
    const urls = [];
    let bytes = 0, n = 0;
    for (const dex of Object.keys(s.owned || {})) {
      const sh = !!(s.shiny || {})[dex];
      for (const k of keys.filter((k) => k === dex || (k.startsWith(dex) && /^m[xy]?$/.test(k.slice(dex.length))))) {
        const e = m.art.dex[k];
        urls.push(...files(m, k, sh || k !== dex));
        bytes += e[0] + (sh || k !== dex ? e[1] : 0);
      }
      n++;
    }
    return { urls, bytes, n };
  }
  function all(m) {
    const urls = [];
    for (const k of Object.keys(m.art.dex)) urls.push(...files(m, k, true));
    return { urls, bytes: m.art.bytes };
  }

  async function download(list, onStep) {
    if (busy) return;
    busy = true;
    try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch (_) { /* opcional */ }
    let i = 0, ok = 0, fail = 0;
    const next = async () => {
      while (i < list.length) {
        const u = list[i++];
        try { const r = await fetch(u); if (r.ok) { await r.arrayBuffer(); ok++; } else fail++; } catch (_) { fail++; }
        if ((ok + fail) % 25 === 0 || ok + fail === list.length) onStep(ok, fail, list.length);
      }
    };
    await Promise.all(Array.from({ length: 6 }, next));
    busy = false;
    onStep(ok, fail, list.length, true);
  }

  async function render(el) {
    el.appendChild(NX.ui.toggle('Activado', 'on:' + KEY, true));
    if (!NX.isOn(KEY)) return;
    const st = document.createElement('div');
    st.innerHTML = '<p class="nx-note">Revisando…</p>';
    el.appendChild(st);
    const [m, s, est] = await Promise.all([
      manifest(), ask({ type: 'nx-status' }),
      navigator.storage && navigator.storage.estimate ? navigator.storage.estimate().catch(() => null) : null,
    ]);
    st.innerHTML = '';
    if (!ctrl() || !m || !s) {
      st.appendChild(NX.ui.note('El modo sin conexión funciona en la edición publicada e instalada (su service worker propio). En el laboratorio no está disponible.'));
      return;
    }
    const usage = est ? (est.usageDetails && est.usageDetails.caches) || est.usage : 0;
    st.appendChild(NX.ui.note(`Estado: ${s.have >= s.pre ? 'listo para jugar sin red' : `preparando (${s.have} de ${s.pre} archivos)`} · versión ${s.v}.`));
    st.appendChild(NX.ui.note(`Código e interfaz: ${MB(m.code.bytes)} en ${m.code.files} archivos, se guardan solos. Sprites guardados: ${s.art} archivos. Espacio usado por la edición: ${MB(usage || 0)}${est && est.quota ? ' de ' + MB(est.quota) + ' disponibles' : ''}.`));
    st.appendChild(NX.ui.note('Cada sprite se guarda la primera vez que aparece. Sin red, los Pokémon que nunca viste no tienen sprite hasta volver a conectarte.'));
    const own = mine(m), every = all(m);
    const line = NX.ui.note(progress);
    const b1 = NX.ui.button(`Guardar los sprites de tus Pokémon (${own.n}, unos ${MB(own.bytes)})`, () => {
      download(own.urls, (ok, fail, tot, end) => { progress = end ? `Listo: ${ok} sprites guardados${fail ? `, ${fail} fallaron` : ''}.` : `Guardando ${ok + fail} de ${tot}…`; line.textContent = progress; });
    });
    let armed = false;
    const b2 = NX.ui.button(`Guardar todos los sprites (unos ${MB(every.bytes)})`, () => {
      if (!armed) { armed = true; b2.textContent = `¿Seguro? Ocupa unos ${MB(every.bytes)}. Pulsa otra vez`; return; }
      armed = false;
      download(every.urls, (ok, fail, tot, end) => { progress = end ? `Listo: ${ok} sprites guardados${fail ? `, ${fail} fallaron` : ''}.` : `Guardando ${ok + fail} de ${tot}…`; line.textContent = progress; });
    });
    const b3 = NX.ui.button('Borrar los sprites guardados', async () => {
      await ask({ type: 'nx-clear-art' });
      progress = 'Sprites borrados. Se volverán a guardar al usarlos.';
      line.textContent = progress;
    });
    st.append(b1, b2, b3, line);
  }

  // La primera vez que se instala el service worker, lo que la página ya
  // cargó (por ejemplo el sprite del compañero en el menú) no pasó por él. En
  // cuanto toma el control se vuelven a pedir esos sprites para guardarlos.
  try { if (performance.setResourceTimingBufferSize) performance.setResourceTimingBufferSize(3000); } catch (_) { /* opcional */ }
  let warmed = false;
  async function warm() {
    if (warmed || !ctrl() || !NX.isOn(KEY)) return;
    warmed = true;
    const urls = [...new Set(performance.getEntriesByType('resource').map((e) => e.name)
      .filter((u) => u.startsWith(location.origin + '/') && u.includes('/assets/pokemon/') && !/\/k-[a-z0-9-]+\//.test(u)))];
    for (let i = 0; i < urls.length; i += 4) {
      await Promise.all(urls.slice(i, i + 4).map((u) => fetch(u).then((r) => r.arrayBuffer()).catch(() => null)));
    }
  }

  NX.feature({
    key: KEY,
    label: 'Modo sin conexión',
    setup() {
      const s = sw();
      if (!s) return;
      s.addEventListener('controllerchange', () => setTimeout(() => { warm().catch(() => {}); }, 1500));
      setTimeout(() => { warm().catch(() => {}); }, 5000);
    },
  });

  NX.settings.section({
    key: KEY,
    tab: 'Datos',
    title: 'Modo sin conexión',
    keywords: 'sin conexión offline red caché sprites descargar teléfono espacio ocupa service worker',
    render(el) { render(el).catch((err) => el.appendChild(NX.ui.note('No se pudo revisar: ' + err.message))); },
  });
})();
