// Bundle de desarrollo: el núcleo más los módulos indicados, sin tocar dist/.
//   node scripts/dev-bundle.mjs <salida.js> features/fps.js features/hitboxes.js ...
// Sin módulos, incluye todos los de src/features.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const [out, ...feats] = process.argv.slice(2);
if (!out) { console.error('Uso: node scripts/dev-bundle.mjs <salida.js> [features/x.js ...]'); process.exit(1); }
const CORE = ['store', 'util', 'hook', 'features', 'keys', 'hud', 'settings'].map((f) => `core/${f}.js`);
const list = feats.length ? feats : readdirSync(join(root, 'src', 'features')).filter((f) => f.endsWith('.js')).sort().map((f) => `features/${f}`);
const body = [...CORE, ...list].map((f) => `// ---- ${f}\n` + readFileSync(join(root, 'src', f), 'utf8').replace(/\r\n/g, '\n').trim()).join('\n\n');
const code = `/*! PokeSurvivor Nexus v0.0.0-dev */
(() => {
'use strict';
if (window.__nexus) return;
// El sitio público bloquea las extensiones a propósito. Nexus solo corre en el
// laboratorio local, así que aquí se queda inactivo.
if (location.hostname === 'pokesurvivor.com' || location.hostname.endsWith('.pokesurvivor.com')) { console.info('[nexus] inactivo en el sitio público; usa el laboratorio local'); return; }
const NX = { version: '0.0.0-dev' };
window.__nexus = { version: NX.version, status: () => NX.featureList(), ns: () => NX.ns, NX };

${body}
})();
`;
writeFileSync(out, code);
execFileSync(process.execPath, ['--check', out], { stdio: 'inherit' });
console.log(`${out} · ${code.length} bytes · ${list.length} módulos`);
