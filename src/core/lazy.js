// Carga diferida y aviso de versión nueva (los dos solo actúan en la edición).
//
// Los módulos que casi solo se usan en el menú (centro de builds, historial,
// enciclopedia, Pokédex, checklist y gacha) empiezan con NX.lazy.declare y
// siguen, tras la línea //#nexus-lazy, con su código de siempre.
//  - Laboratorio y extensión: todo va en un solo archivo, NX.parts no existe,
//    declare no hace nada y el módulo se registra como siempre.
//  - Edición: scripts/build-edition.mjs deja en js/nexus.js solo las
//    declaraciones y mueve el código a js/nexus-<parte>.js. Aquí quedan los
//    sustitutos (estado del módulo, sección del panel con "Cargando…", atajos,
//    botón del menú y pantallas que lo piden) y la parte se carga con un
//    <script src> del mismo origen al primer uso, o sola cuando el navegador
//    queda ocioso en el menú.
const LAZY = new Map(); // parte -> { name, url, hash, done, promise, feats, sections, menus, screens }
const lazyBase = (() => { try { return (document.currentScript && document.currentScript.src) || location.href; } catch (_) { return location.href; } })();
const lazyMenus = [], lazyScreens = [];
let lazyTimer = 0, lazyIdle = false;

function lazyEntry(name) {
  let p = LAZY.get(name);
  if (!p) {
    const [file, hash] = NX.parts[name];
    p = { name, url: new URL(file + '?h=' + hash, lazyBase).href, hash, done: false, promise: null, failed: false, feats: [], sections: [] };
    LAZY.set(name, p);
  }
  return p;
}

function lazyLoad(p) {
  if (p.done) return Promise.resolve();
  if (p.promise) return p.promise;
  p.promise = new Promise((resolve, reject) => {
    p.resolve = resolve;
    const s = document.createElement('script');
    s.src = p.url;
    s.async = true;
    const fail = (msg) => { s.remove(); if (p.done) return; p.promise = null; p.failed = true; reject(new Error(msg)); };
    s.onload = () => fail('la parte ' + p.name + ' no se registró');
    s.onerror = () => fail('no se pudo descargar ' + p.name);
    (document.head || document.documentElement).appendChild(s);
  });
  return p.promise;
}

// Espera a que los módulos de la parte terminen de arrancar (o fallen).
const lazySettle = (p) => new Promise((resolve) => {
  const t0 = Date.now();
  const check = () => {
    const st = new Map(NX.featureList().map((f) => [f.key, f.status]));
    if (!p.feats.some((k) => st.get(k) === 'pending') || Date.now() - t0 > 5000) resolve();
    else setTimeout(check, 50);
  };
  check();
});

// Carga pedida por el jugador: aviso si tarda y si falla.
function lazyUse(p) {
  const slow = p.done ? 0 : setTimeout(() => NX.toast('Cargando…'), 250);
  return lazyLoad(p).then(() => lazySettle(p)).then(() => { clearTimeout(slow); }, (err) => {
    clearTimeout(slow);
    NX.toast('No se pudo cargar esta parte de Nexus · revisa la conexión');
    throw err;
  });
}

function lazyTick() {
  for (const [m, p] of lazyMenus) {
    let b = document.getElementById(m.id);
    if (p.done) continue;
    const anchor = document.querySelector(m.after);
    if (!NX.isOn(m.feat) || !anchor) { if (b && !NX.isOn(m.feat)) b.remove(); continue; }
    if (!b) {
      b = document.createElement('button');
      b.type = 'button';
      b.id = m.id;
      b.className = 'menu-item';
      b.dataset.sfx = 'confirm';
      b.dataset.nxStub = p.name;
      let html = '';
      try { html = m.html(NX.ns); } catch (_) { html = ''; }
      b.innerHTML = html;
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        b.blur();
        lazyUse(p).then(() => { try { m.open(); } catch (err) { console.warn('[nexus]', err); } }, () => {});
      });
    }
    if (anchor.nextElementSibling !== b) anchor.after(b);
  }
  for (const [id, p] of lazyScreens) if (!p.done && !p.promise && NX.shown(id)) lazyUse(p).catch(() => {});
  // Carga en segundo plano: en el menú, con el juego ya cargado.
  const g = NX.ns && NX.ns.Game;
  if (!lazyIdle && g && g.state === 'ui' && document.readyState === 'complete') {
    lazyIdle = true;
    setTimeout(lazyIdleNext, 2500);
  }
  if ([...LAZY.values()].every((p) => p.done)) { clearInterval(lazyTimer); lazyTimer = 0; }
}

function lazyIdleNext() {
  const p = [...LAZY.values()].find((x) => !x.done && !x.promise && !x.failed);
  if (!p) return;
  if (NX.inRun() || document.hidden) { setTimeout(lazyIdleNext, 4000); return; }
  const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 300));
  idle(() => { lazyLoad(p).catch(() => {}).then(() => setTimeout(lazyIdleNext, 400)); }, { timeout: 4000 });
}

NX.lazy = {
  // d: { feats: [[key, label]], sections: [{ key, tab, title, keywords }],
  //      keys: [{ feat, test(e) }], screens: ['scr-...'],
  //      menu: { id, feat, after, html(ns), open() } }
  declare(name, d) {
    if (!NX.parts || !NX.parts[name]) return;
    const p = lazyEntry(name);
    for (const [key, label] of d.feats || []) {
      p.feats.push(key);
      NX.feature({ key, label, setup() { /* el módulo real se registra al cargar su parte */ } });
    }
    for (const s of d.sections || []) {
      const stub = { key: s.key, tab: s.tab, title: s.title, keywords: s.keywords };
      const stubRender = (el) => {
        el.appendChild(NX.ui.note('Cargando…'));
        lazyUse(p).then(() => {
          if (!el.isConnected || stub.render === stubRender) return;
          el.textContent = '';
          try { stub.render(el); } catch (err) { el.appendChild(NX.ui.note('No se pudo mostrar: ' + err.message)); }
        }, () => {
          el.textContent = '';
          el.appendChild(NX.ui.note('No se pudo cargar. Revisa la conexión y vuelve a abrir esta pestaña.'));
        });
      };
      stub.render = stubRender;
      p.sections.push(stub);
      NX.settings.section(stub);
    }
    // Atajo antes de cargar: se carga la parte y se repite la tecla, que ya
    // atiende el módulo real.
    for (const k of d.keys || []) {
      NX.keys.bind((e) => !p.done && NX.enabled(k.feat) && k.test(e), (e) => {
        const init = { code: e.code, key: e.key, altKey: e.altKey, ctrlKey: e.ctrlKey, shiftKey: e.shiftKey, metaKey: e.metaKey, bubbles: true, cancelable: true };
        lazyUse(p).then(() => { window.dispatchEvent(new KeyboardEvent('keydown', init)); window.dispatchEvent(new KeyboardEvent('keyup', init)); }, () => {});
        return true;
      });
    }
    for (const id of d.screens || []) lazyScreens.push([id, p]);
    if (d.menu) lazyMenus.push([d.menu, p]);
    if (!lazyTimer) lazyTimer = setInterval(lazyTick, 400);
  },
  status: () => [...LAZY.values()].map((p) => ({ part: p.name, loaded: p.done, loading: !!p.promise && !p.done, failed: p.failed })),
  load: (name) => (LAZY.has(name) ? lazyUse(LAZY.get(name)) : Promise.resolve()),
};

if (NX.parts) {
  window.__nexus.lazy = NX.lazy.status;
  // Cada js/nexus-<parte>.js llama aquí con su código.
  window.__nexus.part = (name, hash, fn) => {
    const p = LAZY.get(name);
    if (!p || p.done || typeof fn !== 'function') return;
    p.done = true;
    p.failed = false;
    if (hash !== p.hash) {
      console.warn('[nexus] la parte ' + name + ' es de otra versión; conviene recargar');
      if (NX.update) NX.update.flag();
    }
    for (const [m, q] of lazyMenus) if (q === p) { const b = document.getElementById(m.id); if (b && b.dataset.nxStub) b.remove(); }
    // Las secciones reales ocupan el lugar de sus sustitutos en el panel.
    const settings = NX.settings, orig = settings.section, used = new Set();
    settings.section = function (s) {
      const stub = s && p.sections.find((x) => x.key === s.key && !used.has(x));
      if (!stub) return orig.apply(this, arguments);
      used.add(stub);
      for (const k of Object.keys(stub)) delete stub[k];
      Object.assign(stub, s);
      return undefined;
    };
    try { fn(NX); } catch (err) { console.warn('[nexus] parte ' + name, err); } finally { settings.section = orig; }
    p.promise = Promise.resolve();
    if (p.resolve) p.resolve();
  };
}

// ---- Aviso de versión nueva
// build-edition.mjs pone en NX.data.build un identificador del contenido de
// la edición y lo publica en nexus-version.json. Si el desplegado cambia, se
// ofrece recargar, pero nunca en medio de una partida: el aviso espera al menú
// o al fin de partida.
NX.update = (() => {
  const mine = NX.data && NX.data.edition === true && typeof NX.data.build === 'string' ? NX.data.build : '';
  let found = false, closed = false, el = null, last = 0;
  const flag = () => {
    if (found) return;
    found = true;
    // Que el service worker baje ya la versión nueva para que recargar sea rápido.
    try { if (navigator.serviceWorker) navigator.serviceWorker.getRegistration().then((r) => r && r.update()).catch(() => {}); } catch (_) { /* sin service worker */ }
  };
  const check = () => {
    if (!mine || found || navigator.onLine === false) return;
    last = Date.now();
    fetch(new URL('../nexus-version.json', lazyBase).href, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((v) => { if (v && typeof v.build === 'string' && v.build && v.build !== mine) flag(); })
      .catch(() => { /* sin red: se reintenta más tarde */ });
  };
  if (!mine) return { flag, check, state: () => ({ build: '', found }) };

  NX.css(`#nexus-upd{position:fixed;left:50%;bottom:calc(14px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:99998;display:flex;align-items:center;gap:10px;
  max-width:calc(100vw - 24px);box-sizing:border-box;padding:7px 8px 7px 14px;border-radius:10px;background:rgba(12,20,44,.95);color:#fff;border:2px solid #ffd23f;
  box-shadow:0 4px 0 #0a1430;font:14px/1.3 var(--font,'Pixelify',system-ui,sans-serif)}
#nexus-upd.hidden{display:none}
#nexus-upd button{font:inherit;cursor:pointer;border-radius:6px;padding:3px 12px;min-height:32px}
#nexus-upd .nx-upd-go{background:#ffd23f;color:#0b1838;border:2px solid #ffd23f}
#nexus-upd .nx-upd-x{background:transparent;color:#cfe0ff;border:2px solid transparent;padding:3px 8px}
@media (pointer:coarse){#nexus-upd button{min-height:40px}}`);
  const paint = () => {
    const want = found && !closed && !!NX.ns && !NX.inRun();
    if (!want) { if (el) el.classList.add('hidden'); return; }
    if (!el) {
      el = document.createElement('div');
      el.id = 'nexus-upd';
      el.setAttribute('role', 'status');
      el.innerHTML = '<span>Hay una versión nueva de Nexus Edition</span><button type="button" class="nx-upd-go">Recargar</button><button type="button" class="nx-upd-x" aria-label="Cerrar aviso">✕</button>';
      for (const ev of ['pointerdown', 'mousedown', 'touchstart', 'click']) el.addEventListener(ev, (e) => e.stopPropagation());
      el.querySelector('.nx-upd-go').addEventListener('click', () => location.reload());
      el.querySelector('.nx-upd-x').addEventListener('click', () => { closed = true; el.classList.add('hidden'); });
      document.body.appendChild(el);
    }
    el.classList.remove('hidden');
  };
  window.__nexus.update = () => ({ build: mine, found, closed, shown: !!el && !el.classList.contains('hidden') });
  NX.onReady(() => {
    setTimeout(check, 20000);
    setInterval(check, 10 * 60 * 1000);
    setInterval(paint, 1000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - last > 60000) check(); });
    // Un service worker nuevo tomó el control: casi seguro hay despliegue nuevo.
    try { if (navigator.serviceWorker) navigator.serviceWorker.addEventListener('controllerchange', () => setTimeout(check, 1500)); } catch (_) { /* sin service worker */ }
  });
  return { flag, check, state: () => ({ build: mine, found, closed }) };
})();
