// Une src/ en dist/mod.js, escribe dist/version.json y copia el resultado a
// extension/mod.bundled.js. El resultado va minificado con esbuild (npm ci).
//   node scripts/build.mjs                 build con la versión actual
//   node scripts/build.mjs --release 0.2.0 fija una versión nueva para publicar
//   node scripts/build.mjs --no-min        sin minificar (para depurar)
//
// También exporta bundle(), que usan dev-bundle.mjs y build-edition.mjs. Con
// split, los módulos que llevan la línea //#nexus-lazy se separan: lo que va
// antes de esa línea (su NX.lazy.declare) queda en el bundle principal y el
// resto va a nexus-<parte>.js, que src/core/lazy.js carga al primer uso.
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const at = (...p) => join(root, ...p);

// El núcleo va primero y en este orden. Los módulos de src/features se
// incluyen todos, en orden alfabético, porque no dependen entre sí.
export const CORE = ['store', 'util', 'hook', 'features', 'keys', 'hud', 'settings', 'lazy'].map((f) => `core/${f}.js`);
export const featureFiles = () => readdirSync(at('src', 'features')).filter((f) => f.endsWith('.js')).sort().map((f) => `features/${f}`);
export const ALL = () => [...CORE, ...featureFiles()];

const LAZY_MARK = /^\/\/#nexus-lazy[ \t]*$/m;
const sha = (s) => createHash('sha256').update(s).digest('hex');
const read = (f) => readFileSync(at('src', f), 'utf8').replace(/\r\n/g, '\n').trim();

let esb = null;
async function minify(code) {
  if (!esb) {
    try { esb = await import('esbuild'); } catch (_) {
      throw new Error('falta esbuild: ejecuta "npm ci" en la raíz del repositorio (o usa --no-min)');
    }
  }
  // esnext: no se transforma la sintaxis, el código corre igual que sin minificar.
  return esb.transformSync(code, { minify: true, target: 'esnext', charset: 'utf8', legalComments: 'none' }).code;
}
// La cabecera va sola en la primera línea: la extensión la valida con una regex.
const finish = async (header, code, min) => header + '\n' + (min ? await minify(code) : code);

function mainBody(version, body, parts, dev) {
  return `(() => {
'use strict';
if (window.__nexus) return;
// El sitio público bloquea las extensiones a propósito. Nexus solo corre en el
// laboratorio local, así que aquí se queda inactivo.
if (location.hostname === 'pokesurvivor.com' || location.hostname.endsWith('.pokesurvivor.com')) { console.info('[nexus] inactivo en el sitio público; usa el laboratorio local'); return; }
const NX = { version: '${version}'${parts ? ', parts: ' + JSON.stringify(parts) : ''} };
window.__nexus = {
  version: '${version}',
  status: () => NX.featureList(),
  ns: () => NX.ns,${dev ? '\n  NX,' : ''}
};

${body}
})();
`;
}

// { main, parts: { 'nexus-<parte>.js': código } }. Sin split, parts queda vacío
// y main es el bundle de siempre (laboratorio y extensión).
export async function bundle({ version, files = ALL(), split = false, min = true, dev = false }) {
  const chunks = [], groups = new Map();
  for (const f of files) {
    const src = read(f);
    const m = split ? LAZY_MARK.exec(src) : null;
    if (!m) { chunks.push(`// ---- ${f}\n` + src); continue; }
    const stub = src.slice(0, m.index).trim(), rest = src.slice(m.index + m[0].length).trim();
    const name = (/NX\.lazy\.declare\(\s*'([a-z0-9-]+)'/.exec(stub) || [])[1];
    if (!name) throw new Error(`${f}: //#nexus-lazy sin NX.lazy.declare('<parte>', ...) antes`);
    chunks.push(`// ---- ${f} (el resto va en nexus-${name}.js)\n` + stub);
    if (!groups.has(name)) groups.set(name, []);
    // Cada módulo por separado: si uno falla al evaluarse, los demás siguen.
    groups.get(name).push(`// ---- ${f}\ntry {\n${rest}\n} catch (err) { console.warn('[nexus] ${f}', err); }`);
  }
  const parts = {}, map = {};
  for (const [name, list] of groups) {
    const inner = list.join('\n\n');
    const hash = sha(inner).slice(0, 10);
    const file = `nexus-${name}.js`;
    const code = `(function (def) {
if (typeof def !== 'function') return;
def('${name}', '${hash}', function (NX) {
'use strict';
${inner}
});
})(window.__nexus && window.__nexus.part);
`;
    parts[file] = await finish(`/*! PokeSurvivor Nexus v${version} · ${name} */`, code, min);
    map[name] = [file, hash];
  }
  const main = await finish(`/*! PokeSurvivor Nexus v${version} */`, mainBody(version, chunks.join('\n\n'), groups.size ? map : null, dev), min);
  return { main, parts };
}

export const sizeOf = (code) => {
  const b = Buffer.byteLength(code, 'utf8');
  return { bytes: b, gzip: gzipSync(Buffer.from(code, 'utf8'), { level: 9 }).length };
};

async function main() {
  const verFile = at('dist', 'version.json');
  const prev = existsSync(verFile) ? JSON.parse(readFileSync(verFile, 'utf8')).version : '0.0.0';
  const i = process.argv.indexOf('--release');
  const version = i > 0 ? process.argv[i + 1] : prev;
  if (!/^\d+\.\d+\.\d+$/.test(version || '')) {
    console.error('Versión inválida: ' + version);
    process.exit(1);
  }
  const { main: code } = await bundle({ version, min: !process.argv.includes('--no-min') });

  mkdirSync(at('dist'), { recursive: true });
  writeFileSync(at('dist', 'mod.js'), code);
  writeFileSync(at('extension', 'mod.bundled.js'), code);
  const buf = Buffer.from(code, 'utf8');
  const sha256 = sha(buf);
  writeFileSync(verFile, JSON.stringify({ version, sha256, size: buf.length, at: new Date().toISOString() }, null, 2) + '\n');

  execFileSync(process.execPath, ['--check', at('dist', 'mod.js')], { stdio: 'inherit' });
  const s = sizeOf(code);
  console.log(`dist/mod.js v${version} · ${s.bytes} bytes (${s.gzip} con gzip) · sha256 ${sha256.slice(0, 12)}…`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => { console.error(err.message || err); process.exit(1); });
}
