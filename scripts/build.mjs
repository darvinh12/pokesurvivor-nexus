// Une src/ en dist/mod.js, escribe dist/version.json y copia el resultado a
// extension/mod.bundled.js.
//   node scripts/build.mjs                 build con la versión actual
//   node scripts/build.mjs --release 0.2.0 fija una versión nueva para publicar
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const at = (...p) => join(root, ...p);

// El orden importa: el núcleo primero, los módulos después.
const FILES = [
  'core/store.js',
  'core/util.js',
  'core/hook.js',
  'core/features.js',
  'core/keys.js',
  'core/hud.js',
  'core/settings.js',
  'features/sharpness.js',
  'features/fov.js',
  'features/minimap.js',
  'features/shortcuts.js',
  'features/combat.js',
];

const verFile = at('dist', 'version.json');
const prev = existsSync(verFile) ? JSON.parse(readFileSync(verFile, 'utf8')).version : '0.0.0';
const i = process.argv.indexOf('--release');
const version = i > 0 ? process.argv[i + 1] : prev;
if (!/^\d+\.\d+\.\d+$/.test(version || '')) {
  console.error('Versión inválida: ' + version);
  process.exit(1);
}

const body = FILES.map((f) => `// ---- ${f}\n` + readFileSync(at('src', f), 'utf8').replace(/\r\n/g, '\n').trim()).join('\n\n');
const code = `/*! PokeSurvivor Nexus v${version} */
(() => {
'use strict';
if (window.__nexus) return;
const NX = { version: '${version}' };
window.__nexus = {
  version: '${version}',
  status: () => NX.featureList(),
  ns: () => NX.ns,
};

${body}
})();
`;

mkdirSync(at('dist'), { recursive: true });
writeFileSync(at('dist', 'mod.js'), code);
writeFileSync(at('extension', 'mod.bundled.js'), code);
const buf = Buffer.from(code, 'utf8');
const sha256 = createHash('sha256').update(buf).digest('hex');
writeFileSync(verFile, JSON.stringify({ version, sha256, size: buf.length, at: new Date().toISOString() }, null, 2) + '\n');

execFileSync(process.execPath, ['--check', at('dist', 'mod.js')], { stdio: 'inherit' });
console.log(`dist/mod.js v${version} · ${buf.length} bytes · sha256 ${sha256.slice(0, 12)}…`);
