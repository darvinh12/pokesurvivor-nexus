// Bundle de desarrollo: el núcleo más los módulos indicados, sin tocar dist/.
//   node scripts/dev-bundle.mjs <salida.js> [--min] [features/fps.js features/hitboxes.js ...]
// Sin módulos, incluye todos los de src/features. Con --min sale minificado
// como el de publicación (necesita npm ci).
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { CORE, featureFiles, bundle, sizeOf } from './build.mjs';

const args = process.argv.slice(2);
const min = args.includes('--min');
const [out, ...feats] = args.filter((a) => !a.startsWith('--'));
if (!out) { console.error('Uso: node scripts/dev-bundle.mjs <salida.js> [--min] [features/x.js ...]'); process.exit(1); }
const list = feats.length ? feats : featureFiles();
const { main: code } = await bundle({ version: '0.0.0-dev', files: [...CORE, ...list], min, dev: true });
writeFileSync(out, code);
execFileSync(process.execPath, ['--check', out], { stdio: 'inherit' });
const s = sizeOf(code);
console.log(`${out} · ${s.bytes} bytes (${s.gzip} con gzip) · ${list.length} módulos${min ? ' · minificado' : ''}`);
