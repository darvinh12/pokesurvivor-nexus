// Genera "PokeSurvivor Nexus Edition": una edición propia del juego con Nexus
// integrado como parte del juego, sin extensión.
//   git clone --depth 1 https://github.com/JPTER78/pokesurvivor.git _ref/game
//   node scripts/build.mjs
//   node scripts/build-edition.mjs [juego] [salida]     (por defecto _ref/game y edition/)
//
// El repositorio original publica el juego ya compilado y ofuscado, así que la
// integración se hace al nivel de las páginas: Nexus se carga como script
// propio antes de app.min.js y se engancha a los módulos internos igual que
// en el laboratorio. Cambios sobre la copia del juego:
//  - js/nexus.js (el mod) y js/nexus-data.js (tiers de SurvivorTiers) en cada
//    página que carga el juego. Los módulos que solo se usan en el menú van
//    aparte, en js/nexus-<parte>.js, y se cargan al primer uso (src/core/lazy.js).
//    Todo va minificado con esbuild (npm ci).
//  - nexus-version.json con el identificador del contenido, para el aviso de
//    versión nueva.
//  - CSP limitada al propio sitio: la edición no usa el Firebase del autor, así
//    que no toca sus cuentas, su ranking ni su co-op. El guardado es local.
//  - Sin el detector de extensiones (en esta edición Nexus es parte del juego).
//  - Título, aviso de edición no oficial, noindex y sin el CNAME del autor.
// Se conservan las licencias y el aviso de autoría que exige PolyForm Noncommercial.
import { cpSync, existsSync, readFileSync, writeFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join, resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { bundle, sizeOf } from './build.mjs';

// Service worker de la edición (ver buildOffline). __V__ y __PRE__ se
// reemplazan al generar.
const SW_SOURCE = `// Service worker de PokeSurvivor Nexus Edition, generado por scripts/build-edition.mjs.
// Código e interfaz: red primero y copia en caché (precacheada al instalar).
// Sprites: caché primero, se guardan al usarlos. Sin red se sirve la caché.
const V = '__V__';
const CODE = 'nx-code-' + V, ART = 'ps-art-v1', EXT = 'nx-ext-v1';
const PRE = __PRE__;
const abs = (p) => new URL(p, self.registration.scope).href;
const keyOf = (url) => { const u = new URL(url); u.search = ''; u.hash = ''; return u.href; };

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CODE);
    await Promise.all(PRE.map(async (p) => {
      const key = keyOf(abs(p));
      try {
        const r = await fetch(new Request(abs(p), { cache: 'reload' }));
        if (r.ok) { await c.put(key, r); return; }
      } catch (_) { /* sin red: se intenta con la versión anterior */ }
      const old = await caches.match(key, { ignoreSearch: true });
      if (old) await c.put(key, old);
    }));
  })());
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((ks) => Promise.all(ks.filter((k) => k !== CODE && k !== ART && k !== EXT).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

const fromCache = async (key, nav) => (await caches.match(key, { ignoreSearch: true })) ||
  (nav ? (await caches.match(abs('./'))) || (await caches.match(abs('index.html'))) : null) || null;

async function netFirst(req, nav) {
  const key = keyOf(req.url);
  if (self.navigator && self.navigator.onLine === false) { const h = await fromCache(key, nav); if (h) return h; }
  const net = fetch(req).then((res) => {
    if (res && res.ok && res.type === 'basic') { const copy = res.clone(); caches.open(CODE).then((c) => c.put(key, copy)).catch(() => {}); }
    return res;
  });
  try {
    if (!nav) return await net;
    // Red muy lenta al abrir la app: tras 7 s, la copia guardada.
    return await new Promise((resolve, reject) => {
      let done = false;
      const t = setTimeout(async () => { const h = await fromCache(key, true); if (h && !done) { done = true; resolve(h); } }, 7000);
      net.then((r) => { clearTimeout(t); if (!done) { done = true; resolve(r); } }, (err) => { clearTimeout(t); if (!done) { done = true; reject(err); } });
    });
  } catch (_) {
    return (await fromCache(key, nav)) || Response.error();
  }
}

async function cacheFirst(req, name, cors) {
  const c = await caches.open(name);
  const key = cors ? req.url : keyOf(req.url);
  const hit = await c.match(key);
  if (hit) return hit;
  const res = await fetch(cors ? new Request(req.url, { mode: 'cors', credentials: 'omit' }) : req).catch(() => (cors ? fetch(req) : Promise.reject(new Error('sin red'))));
  if (res.ok && res.type !== 'opaque') c.put(key, res.clone()).catch(() => {});
  return res;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) {
    // El SDK de Firebase (URLs con versión, no cambian): disponible sin red.
    if (url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/')) e.respondWith(cacheFirst(req, EXT, true));
    return;
  }
  if (url.pathname.endsWith('/sw.js') || url.pathname.endsWith('/nexus-version.json') || url.pathname.startsWith('/__/') || req.headers.has('range')) return;
  if (url.pathname.includes('/assets/pokemon/')) {
    // Los disfraces (k-*) pueden cambiar: red primero, como hacía el juego.
    e.respondWith(/\\/k-[a-z0-9-]+\\//.test(url.pathname) ? netFirst(req, false) : cacheFirst(req, ART, false));
    return;
  }
  e.respondWith(netFirst(req, req.mode === 'navigate'));
});

self.addEventListener('message', (e) => {
  const d = e.data || {}, port = e.ports && e.ports[0];
  if (!port) return;
  if (d.type === 'nx-status') {
    e.waitUntil((async () => {
      const code = await caches.open(CODE), art = await caches.open(ART);
      let have = 0;
      for (const p of PRE) if (await code.match(keyOf(abs(p)))) have++;
      port.postMessage({ v: V, pre: PRE.length, have, art: (await art.keys()).length });
    })());
  } else if (d.type === 'nx-clear-art') {
    e.waitUntil(caches.delete(ART).then(() => port.postMessage({ ok: true })));
  }
});
`;

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const [srcArg, outArg] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const src = resolve(srcArg || join(root, '_ref', 'game'));
const out = resolve(outArg || join(root, 'edition'));
const fail = (msg) => { console.error('[edition] ' + msg); process.exit(1); };

if (!existsSync(join(src, 'index.html')) || !existsSync(join(src, 'js', 'app.min.js'))) fail('no parece el juego: ' + src);
const mod = join(root, 'dist', 'mod.js');
if (!existsSync(mod)) fail('falta dist/mod.js; ejecuta antes node scripts/build.mjs');

// Configuración propia (edition.config.json, fuera de git):
//   { "hosts": ["mi-dominio.vercel.app"], "firebase": { apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId, databaseURL } }
// Con "firebase", la edición usa ese proyecto (guardado en la nube, ranking y co-op propios)
// y los "hosts" se agregan a la lista de dominios donde el juego activa la nube.
// Sin "firebase", la edición queda sin conexión con guardado local.
const cfgFile = join(root, 'edition.config.json');
const cfg = existsSync(cfgFile) ? JSON.parse(readFileSync(cfgFile, 'utf8')) : {};
const fb = cfg.firebase || null;
if (fb) for (const k of ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId', 'databaseURL']) {
  if (!fb[k]) fail('edition.config.json: falta firebase.' + k);
}
const hosts = (cfg.hosts || []).filter((h) => /^[a-z0-9.-]+$/i.test(h));

// Datos de la generación anterior: si SurvivorTiers no cambió se conserva su
// fecha (así una regeneración sin cambios no produce commit) y si no responde
// se reutilizan los tiers anteriores en vez de perderlos.
let prevData = null;
try {
  const m = /^window\.__nexusData=(.*?);\n/s.exec(readFileSync(join(out, 'js', 'nexus-data.js'), 'utf8'));
  if (m) prevData = JSON.parse(m[1]);
} catch (_) { prevData = null; }

// 1. Copia limpia del juego. Se conservan el .git y el .github de la salida
// (el workflow de actualización vive en el repositorio de la edición).
const SKIP = new Set(['.git', '.github', 'CNAME']);
const KEEP = new Set(['.git', '.github']);
if (existsSync(out)) for (const f of readdirSync(out)) if (!KEEP.has(f)) rmSync(join(out, f), { recursive: true, force: true });
cpSync(src, out, { recursive: true, filter: (p) => !SKIP.has(relative(src, p).split(/[\\/]/)[0]) });

// 1b. Archivos propios de la edición (íconos, recursos de estilo...): todo
// edition-assets/ se copia tal cual a la raíz de la salida.
const assets = join(root, 'edition-assets');
if (existsSync(assets)) cpSync(assets, out, { recursive: true });

// 1c. App instalable propia: manifiesto con nombre, id e íconos de la edición,
// para que no se confunda con la app del juego original.
const THEME = '#0b1838';
for (const f of ['nexus-180.png', 'nexus-192.png', 'nexus-512.png', 'nexus-maskable-512.png']) {
  if (!existsSync(join(out, 'icons', f))) fail('falta edition-assets/icons/' + f);
}
const manFile = join(out, 'manifest.webmanifest');
const man = existsSync(manFile) ? JSON.parse(readFileSync(manFile, 'utf8')) : {};
writeFileSync(manFile, JSON.stringify({
  ...man,
  id: 'nexus-edition',
  name: 'PokéSurvivor Nexus Edition',
  short_name: 'Nexus',
  description: 'Edición no oficial y sin fines comerciales de PokéSurvivor, de JPTER78, con PokeSurvivor Nexus integrado.',
  lang: 'es',
  start_url: './?app=nexus',
  scope: './',
  display: man.display || 'fullscreen',
  orientation: man.orientation || 'landscape',
  background_color: '#0a1430',
  theme_color: THEME,
  icons: [
    { src: 'icons/nexus-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: 'icons/nexus-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: 'icons/nexus-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
    { src: 'icons/nexus-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ].filter((i) => existsSync(join(out, i.src))),
}, null, 2) + '\n');

// 2. Nexus y sus datos.
const modCode = readFileSync(mod, 'utf8');
const version = (/^\/\*! PokeSurvivor Nexus v([\d.]+) \*\//.exec(modCode) || [])[1] || '0.0.0';
// Bundle principal sin el código de los módulos diferidos, más una parte por
// grupo (js/nexus-<parte>.js). El sw.js las precachea con el resto de js/.
const split = await bundle({ version, split: true, min: !process.argv.includes('--no-min') });
writeFileSync(join(out, 'js', 'nexus.js'), split.main);
for (const [file, code] of Object.entries(split.parts)) writeFileSync(join(out, 'js', file), code);
const mainSize = sizeOf(split.main), partSize = Object.values(split.parts).map(sizeOf).reduce((a, b) => ({ bytes: a.bytes + b.bytes, gzip: a.gzip + b.gzip }), { bytes: 0, gzip: 0 });
console.log(`[edition] Nexus: carga inicial ${(mainSize.bytes / 1024).toFixed(0)} KB (${(mainSize.gzip / 1024).toFixed(0)} KB con gzip) · diferido ${Object.keys(split.parts).length} partes, ${(partSize.bytes / 1024).toFixed(0)} KB (${(partSize.gzip / 1024).toFixed(0)} KB con gzip)`);
// El juego reescribe el título al arrancar; se le agrega el nombre de la edición.
const TITLE_KEEPER = `(() => {
  const t = document.querySelector('title');
  if (!t) return;
  const fix = () => { if (!/Nexus Edition/.test(document.title)) document.title = document.title.split(/ [\\u2013-] /)[0] + ' \\u00b7 Nexus Edition'; };
  new MutationObserver(fix).observe(t, { childList: true });
  fix();
})();`;
const nexusData = await loadData();
const writeData = (extra) => writeFileSync(join(out, 'js', 'nexus-data.js'), 'window.__nexusData=' + JSON.stringify({ ...nexusData, ...extra }) + ';\n' + TITLE_KEEPER + '\n');
writeData({});

// 3. Páginas que arrancan el juego.
// Sin Firebase propio, la CSP solo deja el propio sitio. Con Firebase propio se
// conserva la CSP original del juego, que ya permite los dominios de Firebase.
const CSP = fb ? null : `<meta http-equiv="Content-Security-Policy" content="script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'">`;
const BADGE = '<div id="nx-edition" style="position:fixed;right:8px;bottom:6px;z-index:9;pointer-events:none;font:11px system-ui,sans-serif;' +
  'color:#fff;opacity:.55;text-shadow:0 1px 2px #000">Nexus Edition · edición no oficial basada en PokéSurvivor de JPTER78</div>';
let pages = 0;
for (const file of walk(out).filter((f) => f.endsWith('.html'))) {
  let s = readFileSync(file, 'utf8');
  // Íconos y color propios en todas las páginas (pestaña, inicio de iOS y barra del sistema).
  const branded = s
    .replace(/(<link rel="(?:apple-touch-icon|icon)"[^>]*href=")([^"]*?)assets\/icons\/icon-(48|96|144|180)\.png"/g, '$1$2icons/nexus-$3.png"')
    .replace(/<meta name="theme-color" content="[^"]*">/g, `<meta name="theme-color" content="${THEME}">`)
    .replace(/<meta name="apple-mobile-web-app-title" content="[^"]*">/g, '<meta name="apple-mobile-web-app-title" content="Nexus">');
  if (branded !== s) { s = branded; writeFileSync(file, s); }
  const app = /<script defer src="([^"]*?)js\/app\.min\.js(\?[^"]*)?"><\/script>/;
  const m = app.exec(s);
  if (!m) continue;
  const base = m[1], bust = '?v=' + version;
  if (CSP) s = s.replace(/<meta http-equiv="Content-Security-Policy" content="[^"]*">/, CSP);
  s = s.replace(m[0], `<script src="${base}js/nexus-data.js${bust}"></script><script src="${base}js/nexus.js${bust}"></script>\n${m[0]}`)
    .replace(/<title>([^<]*)<\/title>/, (_, t) => `<title>${t.split(/ [–-] /)[0]} · Nexus Edition</title>`)
    .replace(/<head>/i, '<head>\n<meta name="robots" content="noindex">')
    .replace(/<\/body>/i, BADGE + '</body>');
  writeFileSync(file, s);
  pages++;
}
if (!pages) fail('ninguna página carga js/app.min.js; el juego cambió su estructura');

// 4. Sin detector de extensiones.
const appFile = join(out, 'js', 'app.min.js');
const app = readFileSync(appFile, 'utf8');
const boot = /_0x[0-9a-f]+\['Hz'\]\['boot'\]\(\),/;
if (!boot.test(app)) console.warn('[edition] no se encontró el arranque del detector; revisa si el juego lo cambió');
let appOut = app.replace(boot, '');

// 4b. Firebase propio y dominios donde el juego activa la nube.
if (fb) {
  const q = (v) => `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  // Cada valor puede venir literal ('...'), como número o, desde b742e43, como
  // llamada ofuscada al diccionario de cadenas (_0x1234(0x9a5)).
  const V = String.raw`(?:'[^']*'|_0x[0-9a-f]+\(0x[0-9a-f]+\)|0x[0-9a-f]+|\d+)`;
  const conf = new RegExp(['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId', 'databaseURL'].map((k) => `'${k}':${V}`).join(','));
  if (!conf.test(appOut)) fail('no se encontró la configuración de Firebase del juego; el juego cambió su estructura');
  appOut = appOut.replace(conf, `'apiKey':${q(fb.apiKey)},'authDomain':${q(fb.authDomain)},'projectId':${q(fb.projectId)},'storageBucket':${q(fb.storageBucket)},'messagingSenderId':${q(fb.messagingSenderId)},'appId':${q(fb.appId)},'databaseURL':${q(fb.databaseURL)}`);
}
if (hosts.length) {
  const list = /\[(?:'pokesurvivor\.com'|_0x[0-9a-f]+\(0x[0-9a-f]+\)),'www\.pokesurvivor\.com',[^\]]*\]/;
  if (!list.test(appOut)) console.warn('[edition] no se encontró la lista de dominios oficiales; la nube puede no activarse en ' + hosts.join(', '));
  appOut = appOut.replace(list, (m) => m.slice(0, -1) + hosts.map((h) => `,'${h}'`).join('') + ']');
}
writeFileSync(appFile, appOut);

// 4c. Modo sin conexión: service worker propio en lugar del sw.js del juego
// (que solo guardaba la portada y la hoja de estilos). Precachea el código y
// la interfaz, guarda cada sprite al usarlo (y los que el panel descargue por
// adelantado) y sirve todo desde la caché sin red. El nombre de la caché de
// código lleva un hash del contenido, así que una regeneración sin cambios
// produce el mismo sw.js. nexus-offline.json lista los tamaños para el panel.
const offline = buildOffline(out);
console.log(`[edition] sin conexión: ${offline.files} archivos de código (${(offline.bytes / 1048576).toFixed(1)} MB), sprites ${(offline.art / 1048576).toFixed(0)} MB`);

// 5. Avisos.
const upstream = gitHead(src);
writeFileSync(join(out, 'NOTICE.md'), `# PokeSurvivor Nexus Edition

Edición no oficial y sin fines comerciales de PokéSurvivor con PokeSurvivor Nexus integrado.

Required Notice: Copyright 2026 JPTER78 (https://github.com/JPTER78/pokesurvivor)

El juego original es obra de JPTER78 y se distribuye bajo PolyForm Noncommercial 1.0.0 (ver LICENSE y LICENSE-NONCOMMERCIAL.md). Los sprites mantienen sus licencias originales (ver CREDITS.md). Pokémon y sus nombres pertenecen a sus dueños.

Nexus (js/nexus.js y js/nexus-*.js) es MIT: https://github.com/darvinh12/pokesurvivor-nexus. Los tiers de js/nexus-data.js vienen de SurvivorTiers (https://survivortiers.pages.dev/), de @fildotai.

Cambios respecto al original: se agregan js/nexus.js, js/nexus-*.js, js/nexus-data.js y nexus-version.json, las páginas del juego los cargan, la edición no usa el Firebase del autor (${fb ? 'usa un proyecto de Firebase propio' : 'guardado local, sin ranking ni co-op en línea'}), se omite el detector de extensiones, se ajustan título, aviso e indexación, la app instalable tiene nombre e íconos propios y un service worker propio (sw.js) permite jugar sin conexión.

Generada desde ${upstream} con Nexus v${version}.
`);
// El README del autor se conserva aparte; la portada explica la edición.
if (existsSync(join(out, 'README.md'))) cpSync(join(out, 'README.md'), join(out, 'README.original.md'));
const FENCE = '```';
writeFileSync(join(out, 'README.md'), readFileSync(join(out, 'NOTICE.md'), 'utf8') + `
## Cómo jugar

Sirve esta carpeta con cualquier servidor estático y abre la página principal, por ejemplo:

${FENCE}bash
npx serve .
${FENCE}

Los ajustes de Nexus se abren con Alt + N o con el botón "Nexus" del menú. En pantallas táctiles, durante la partida, el botón "N" de la esquina superior abre un menú con las acciones que en el teclado van por atajos. El README original del juego está en README.original.md.

La edición se puede instalar como app propia ("PokéSurvivor Nexus Edition") desde el menú del navegador.

Esta carpeta se genera con node scripts/build-edition.mjs desde https://github.com/darvinh12/pokesurvivor-nexus, así que no conviene editarla a mano. El workflow .github/workflows/sync.yml la regenera cada día con la última versión del juego y de Nexus, y solo publica si algo cambió. Necesita el secreto EDITION_CONFIG con el contenido de edition.config.json.
`);
console.log(`Edición lista en ${out} · Nexus v${version} · ${pages} páginas · juego ${upstream}`);

function buildOffline(dir) {
  const rel = (p) => relative(dir, p).split(/[\\/]/).join('/');
  const all = (sub) => (existsSync(join(dir, sub)) ? walkAll(join(dir, sub)) : []);
  const pre = ['index.html', 'manifest.webmanifest', 'favicon.ico', 'version.json']
    .filter((f) => existsSync(join(dir, f)))
    .concat(...['css', 'js', 'icons', 'nexus', 'assets/icons', 'assets/fonts', 'assets/banner'].map((s) => all(s).map(rel)))
    .filter((f) => !/\.(md|txt|map)$/i.test(f));
  // Identificador del contenido para el aviso de versión nueva: todo lo
  // precacheado menos js/nexus-data.js, que lo lleva dentro (se cuentan sus
  // datos). Sin cambios, el identificador y sw.js quedan iguales.
  const idHash = createHash('sha256').update(JSON.stringify(nexusData));
  for (const f of pre.slice().sort()) if (f !== 'js/nexus-data.js') idHash.update(f + '\0').update(readFileSync(join(dir, f)));
  const build = idHash.digest('hex').slice(0, 12);
  writeData({ build });
  writeFileSync(join(dir, 'nexus-version.json'), JSON.stringify({ build, nexus: version }) + '\n');
  const hash = createHash('sha256');
  let bytes = 0;
  for (const f of pre.sort()) {
    const buf = readFileSync(join(dir, f));
    bytes += buf.length;
    hash.update(f + '\0').update(buf);
  }
  // Sprites: por carpeta, bytes normales y shiny, y la lista de animaciones
  // solo si difiere de la habitual. Las variantes k-* (disfraces) no cuentan.
  const ANIMS = ['Attack', 'Charge', 'Faint', 'Hurt', 'Idle', 'Shoot', 'Walk'];
  const art = { bytes: 0, anims: ANIMS, dex: {} };
  const pk = join(dir, 'assets', 'pokemon');
  if (existsSync(pk)) {
    for (const k of readdirSync(pk).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))) {
      const d = join(pk, k);
      if (!statSync(d).isDirectory()) continue;
      const pngs = (p) => (existsSync(p) ? readdirSync(p).filter((f) => f.endsWith('.png')).sort() : []);
      const size = (p, l) => l.reduce((s, f) => s + statSync(join(p, f)).size, 0);
      const n = pngs(d), s = pngs(join(d, 's'));
      if (!n.length) continue;
      const nb = size(d, n), sb = size(join(d, 's'), s);
      const names = (l) => l.map((f) => f.slice(0, -4));
      const same = (l) => names(l).join() === ANIMS.join();
      const e = [nb, sb];
      if (!same(n) || (s.length && !same(s))) { e.push(names(n)); if (s.length) e.push(names(s)); }
      art.dex[k] = e;
      art.bytes += nb + sb;
    }
  }
  const v = hash.digest('hex').slice(0, 12);
  writeFileSync(join(dir, 'nexus-offline.json'), JSON.stringify({ v, code: { files: pre.length + 1, bytes }, art }) + '\n');
  pre.push('nexus-offline.json');
  const list = ['./', ...pre];
  writeFileSync(join(dir, 'sw.js'), SW_SOURCE.replace('__V__', v).replace('__PRE__', JSON.stringify(list)));
  return { files: list.length, bytes, art: art.bytes };
}
function walkAll(d) {
  const acc = [];
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) acc.push(...walkAll(p)); else acc.push(p);
  }
  return acc;
}
function walk(dir) {
  const acc = [];
  for (const f of readdirSync(dir)) {
    if (f === '.git' || f === '.github' || f === 'assets') continue;
    const p = join(dir, f);
    if (statSync(p).isDirectory()) acc.push(...walk(p)); else acc.push(p);
  }
  return acc;
}
function gitHead(dir) {
  try {
    const head = readFileSync(join(dir, '.git', 'HEAD'), 'utf8').trim();
    const ref = head.startsWith('ref: ') ? readFileSync(join(dir, '.git', head.slice(5)), 'utf8').trim() : head;
    return 'JPTER78/pokesurvivor@' + ref.slice(0, 7);
  } catch (_) { return 'JPTER78/pokesurvivor'; }
}
// Tiers de SurvivorTiers con el mismo formato que inyecta el cascarón.
async function loadData() {
  const data = { tiers: null, edition: true };
  try {
    const text = await (await fetch('https://survivortiers.pages.dev/data/ranking.csv')).text();
    const lines = text.split(/\r?\n/).filter((l) => l.trim() && !l.startsWith('#'));
    const parse = (line) => {
      const o = []; let cur = '', q = false;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
        else if (c === '"') q = true; else if (c === ',') { o.push(cur); cur = ''; } else cur += c;
      }
      o.push(cur);
      return o;
    };
    const head = parse(lines.shift()), col = (n) => head.indexOf(n);
    const rows = lines.map(parse).map((r) => ({
      dex: +r[col('dex')], rank: +r[col('rank')], name: r[col('name')], tier: r[col('tier')],
      style: r[col('build')], moves: (r[col('group')] || '').split('+').filter(Boolean),
      score: +r[col('median_score')], otherStyle: r[col('other_build')], otherScore: +r[col('other_score')],
    })).filter((r) => r.dex > 0 && r.tier);
    let patch = '';
    try { patch = ((/parche del (\d{1,2} [a-záéíóú]{3,10}\.? \d{4})/i.exec(await (await fetch('https://survivortiers.pages.dev/')).text()) || [])[1] || '').trim(); } catch (_) { /* opcional */ }
    if (rows.length > 100) data.tiers = { fetchedAt: Date.now(), patch, rows };
  } catch (err) {
    console.warn('[edition] sin tiers de SurvivorTiers: ' + err.message);
  }
  const old = prevData && prevData.tiers;
  if (old && Array.isArray(old.rows)) {
    if (!data.tiers) { data.tiers = old; console.warn('[edition] se conservan los tiers de la generación anterior'); }
    else if (old.patch === data.tiers.patch && JSON.stringify(old.rows) === JSON.stringify(data.tiers.rows)) data.tiers.fetchedAt = old.fetchedAt;
  }
  return data;
}
