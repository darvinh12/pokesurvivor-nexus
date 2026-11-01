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
//    página que carga el juego.
//  - CSP limitada al propio sitio: la edición no usa el Firebase del autor, así
//    que no toca sus cuentas, su ranking ni su co-op. El guardado es local.
//  - Sin el detector de extensiones (en esta edición Nexus es parte del juego).
//  - Título, aviso de edición no oficial, noindex y sin el CNAME del autor.
// Se conservan las licencias y el aviso de autoría que exige PolyForm Noncommercial.
import { cpSync, existsSync, readFileSync, writeFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join, resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

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

// 1. Copia limpia del juego (se conserva el .git de la salida).
const SKIP = new Set(['.git', '.github', 'CNAME']);
if (existsSync(out)) for (const f of readdirSync(out)) if (f !== '.git') rmSync(join(out, f), { recursive: true, force: true });
cpSync(src, out, { recursive: true, filter: (p) => !SKIP.has(relative(src, p).split(/[\\/]/)[0]) });

// 2. Nexus y sus datos.
const modCode = readFileSync(mod, 'utf8');
const version = (/^\/\*! PokeSurvivor Nexus v([\d.]+) \*\//.exec(modCode) || [])[1] || '0.0.0';
writeFileSync(join(out, 'js', 'nexus.js'), modCode);
// El juego reescribe el título al arrancar; se le agrega el nombre de la edición.
const TITLE_KEEPER = `(() => {
  const t = document.querySelector('title');
  if (!t) return;
  const fix = () => { if (!/Nexus Edition/.test(document.title)) document.title = document.title.split(/ [\\u2013-] /)[0] + ' \\u00b7 Nexus Edition'; };
  new MutationObserver(fix).observe(t, { childList: true });
  fix();
})();`;
writeFileSync(join(out, 'js', 'nexus-data.js'), 'window.__nexusData=' + JSON.stringify(await loadData()) + ';\n' + TITLE_KEEPER + '\n');

// 3. Páginas que arrancan el juego.
// Sin Firebase propio, la CSP solo deja el propio sitio. Con Firebase propio se
// conserva la CSP original del juego, que ya permite los dominios de Firebase.
const CSP = fb ? null : `<meta http-equiv="Content-Security-Policy" content="script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'">`;
const BADGE = '<div id="nx-edition" style="position:fixed;right:8px;bottom:6px;z-index:9;pointer-events:none;font:11px system-ui,sans-serif;' +
  'color:#fff;opacity:.55;text-shadow:0 1px 2px #000">Nexus Edition · edición no oficial basada en PokéSurvivor de JPTER78</div>';
let pages = 0;
for (const file of walk(out).filter((f) => f.endsWith('.html'))) {
  let s = readFileSync(file, 'utf8');
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
  const conf = /'apiKey':'[^']*','authDomain':'[^']*','projectId':'[^']*','storageBucket':'[^']*','messagingSenderId':[^,]+,'appId':'[^']*','databaseURL':'[^']*'/;
  if (!conf.test(appOut)) fail('no se encontró la configuración de Firebase del juego; el juego cambió su estructura');
  appOut = appOut.replace(conf, `'apiKey':${q(fb.apiKey)},'authDomain':${q(fb.authDomain)},'projectId':${q(fb.projectId)},'storageBucket':${q(fb.storageBucket)},'messagingSenderId':${q(fb.messagingSenderId)},'appId':${q(fb.appId)},'databaseURL':${q(fb.databaseURL)}`);
}
if (hosts.length) {
  const list = /\['pokesurvivor\.com','www\.pokesurvivor\.com',[^\]]*\]/;
  if (!list.test(appOut)) console.warn('[edition] no se encontró la lista de dominios oficiales; la nube puede no activarse en ' + hosts.join(', '));
  appOut = appOut.replace(list, (m) => m.slice(0, -1) + hosts.map((h) => `,'${h}'`).join('') + ']');
}
writeFileSync(appFile, appOut);

// 5. Avisos.
const upstream = gitHead(src);
writeFileSync(join(out, 'NOTICE.md'), `# PokeSurvivor Nexus Edition

Edición no oficial y sin fines comerciales de PokéSurvivor con PokeSurvivor Nexus integrado.

Required Notice: Copyright 2026 JPTER78 (https://github.com/JPTER78/pokesurvivor)

El juego original es obra de JPTER78 y se distribuye bajo PolyForm Noncommercial 1.0.0 (ver LICENSE y LICENSE-NONCOMMERCIAL.md). Los sprites mantienen sus licencias originales (ver CREDITS.md). Pokémon y sus nombres pertenecen a sus dueños.

Nexus (js/nexus.js) es MIT: https://github.com/darvinh12/pokesurvivor-nexus. Los tiers de js/nexus-data.js vienen de SurvivorTiers (https://survivortiers.pages.dev/), de @fildotai.

Cambios respecto al original: se agregan js/nexus.js y js/nexus-data.js, las páginas del juego los cargan, la edición no usa el Firebase del autor (${fb ? 'usa un proyecto de Firebase propio' : 'guardado local, sin ranking ni co-op en línea'}), se omite el detector de extensiones y se ajustan título, aviso e indexación.

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

Los ajustes de Nexus se abren con Alt + N o con el botón "Nexus" del menú. El README original del juego está en README.original.md.

Esta carpeta se genera con node scripts/build-edition.mjs desde https://github.com/darvinh12/pokesurvivor-nexus, así que no conviene editarla a mano.
`);
console.log(`Edición lista en ${out} · Nexus v${version} · ${pages} páginas · juego ${upstream}`);

function walk(dir) {
  const acc = [];
  for (const f of readdirSync(dir)) {
    if (f === '.git' || f === 'assets') continue;
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
  return data;
}
