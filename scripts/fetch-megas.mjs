// Descarga las formas mega de SpriteCollab (PMDCollab/SpriteCollab, CC BY-NC 4.0)
// para la edición y las deja en el formato del juego.
//   node scripts/fetch-megas.mjs [--only 6mx,94m] [--check]
//
// Por cada forma baja, archivo por archivo desde raw.githubusercontent.com (sin
// clonar el repositorio), AnimData.xml, credits.txt y las hojas de las
// animaciones que usa el juego (Idle, Walk, Attack, Hurt, Faint, Shoot, Charge),
// normal y shiny si existe. Escribe:
//   edition-assets/assets/pokemon/<clave>/<Anim>.png   (y s/<Anim>.png para shiny)
//   edition-assets/nexus/megas.json                     (entradas de SPRITE_META y datos de la mega)
//   edition-assets/nexus/CREDITS-megas.md               (créditos de cada forma)
// Conversión a SPRITE_META: w/h = FrameWidth/FrameHeight, d = Durations,
// n = número de duraciones, r = 8 (filas = direcciones), s = ShadowSize, y
// ax/ay = píxel blanco de <Anim>-Shadow.png en el primer cuadro menos 0,5.
// Con --check solo compara la conversión de Charizard (0006) con la del juego.
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = 'https://raw.githubusercontent.com/PMDCollab/SpriteCollab/master/';
const ANIMS = ['Idle', 'Walk', 'Attack', 'Hurt', 'Faint', 'Shoot', 'Charge'];
const OUT_PK = join(root, 'edition-assets', 'assets', 'pokemon');
const OUT_NX = join(root, 'edition-assets', 'nexus');
const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : null; };

// Estadísticas base [PS, Ataque, Defensa, At. Esp., Def. Esp., Velocidad] de la forma normal y de la mega.
const MEGAS = [
  { key: '6mx', dex: 6, form: '0001', name: 'Mega-Charizard X', types: ['fire', 'dragon'], base: [78, 84, 78, 109, 85, 100], mega: [78, 130, 111, 130, 85, 100] },
  { key: '65m', dex: 65, form: '0001', name: 'Mega-Alakazam', types: ['psychic'], base: [55, 50, 45, 135, 95, 120], mega: [55, 50, 65, 175, 105, 150] },
  { key: '94m', dex: 94, form: '0001', name: 'Mega-Gengar', types: ['ghost', 'poison'], base: [60, 65, 60, 130, 75, 110], mega: [60, 65, 80, 170, 95, 130] },
  { key: '115m', dex: 115, form: '0001', name: 'Mega-Kangaskhan', types: ['normal'], base: [105, 95, 80, 40, 80, 90], mega: [105, 125, 100, 60, 100, 100] },
  { key: '142m', dex: 142, form: '0001', name: 'Mega-Aerodactyl', types: ['rock', 'flying'], base: [80, 105, 65, 60, 75, 130], mega: [80, 135, 85, 70, 95, 150] },
  { key: '150my', dex: 150, form: '0002', name: 'Mega-Mewtwo Y', types: ['psychic'], base: [106, 110, 90, 154, 90, 130], mega: [106, 150, 70, 194, 120, 140] },
  { key: '208m', dex: 208, form: '0001', name: 'Mega-Steelix', types: ['steel', 'ground'], base: [75, 85, 200, 55, 65, 30], mega: [75, 125, 230, 55, 95, 30] },
  { key: '229m', dex: 229, form: '0001', name: 'Mega-Houndoom', types: ['dark', 'fire'], base: [75, 90, 50, 110, 80, 95], mega: [75, 90, 90, 140, 90, 115] },
  { key: '248m', dex: 248, form: '0001', name: 'Mega-Tyranitar', types: ['rock', 'dark'], base: [100, 134, 110, 95, 100, 61], mega: [100, 164, 150, 95, 120, 71] },
  { key: '282m', dex: 282, form: '0001', name: 'Mega-Gardevoir', types: ['psychic', 'fairy'], base: [68, 65, 65, 125, 115, 80], mega: [68, 85, 65, 165, 135, 100] },
  { key: '302m', dex: 302, form: '0001', name: 'Mega-Sableye', types: ['dark', 'ghost'], base: [50, 75, 75, 65, 65, 50], mega: [50, 85, 125, 85, 115, 20] },
  { key: '303m', dex: 303, form: '0001', name: 'Mega-Mawile', types: ['steel', 'fairy'], base: [50, 85, 85, 55, 55, 50], mega: [50, 105, 125, 55, 95, 50] },
  { key: '308m', dex: 308, form: '0001', name: 'Mega-Medicham', types: ['fighting', 'psychic'], base: [60, 60, 75, 60, 75, 80], mega: [60, 100, 85, 80, 85, 100] },
  { key: '310m', dex: 310, form: '0001', name: 'Mega-Manectric', types: ['electric'], base: [70, 75, 60, 105, 60, 105], mega: [70, 75, 80, 135, 80, 135] },
  { key: '323m', dex: 323, form: '0001', name: 'Mega-Camerupt', types: ['fire', 'ground'], base: [70, 100, 70, 105, 75, 40], mega: [70, 120, 100, 145, 105, 20] },
  { key: '334m', dex: 334, form: '0001', name: 'Mega-Altaria', types: ['dragon', 'fairy'], base: [75, 70, 90, 70, 105, 80], mega: [75, 110, 110, 110, 105, 80] },
  { key: '354m', dex: 354, form: '0001', name: 'Mega-Banette', types: ['ghost'], base: [64, 115, 65, 83, 63, 65], mega: [64, 165, 75, 93, 83, 75] },
  { key: '359m', dex: 359, form: '0001', name: 'Mega-Absol', types: ['dark'], base: [65, 130, 60, 75, 60, 75], mega: [65, 150, 60, 115, 60, 115] },
  { key: '362m', dex: 362, form: '0001', name: 'Mega-Glalie', types: ['ice'], base: [80, 80, 80, 80, 80, 80], mega: [80, 120, 80, 120, 80, 100] },
  { key: '380m', dex: 380, form: '0001', name: 'Mega-Latias', types: ['dragon', 'psychic'], base: [80, 80, 90, 110, 130, 110], mega: [80, 100, 120, 140, 150, 110] },
  { key: '381m', dex: 381, form: '0001', name: 'Mega-Latios', types: ['dragon', 'psychic'], base: [80, 90, 80, 130, 110, 110], mega: [80, 130, 100, 160, 120, 110] },
  { key: '384m', dex: 384, form: '0001', name: 'Mega-Rayquaza', types: ['dragon', 'flying'], base: [105, 150, 90, 150, 90, 95], mega: [105, 180, 100, 180, 100, 115] },
  { key: '428m', dex: 428, form: '0001', name: 'Mega-Lopunny', types: ['normal', 'fighting'], base: [65, 76, 84, 54, 96, 105], mega: [65, 136, 94, 54, 96, 135] },
  { key: '448m', dex: 448, form: '0001', name: 'Mega-Lucario', types: ['fighting', 'steel'], base: [70, 110, 70, 115, 70, 90], mega: [70, 145, 88, 140, 70, 112] },
  { key: '475m', dex: 475, form: '0001', name: 'Mega-Gallade', types: ['psychic', 'fighting'], base: [68, 125, 65, 65, 115, 80], mega: [68, 165, 95, 65, 115, 110] },
];

// ---------------------------------------------------------------- red
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function get(path, kind = 'buf') {
  for (let i = 0; i < 4; i++) {
    try {
      const res = await fetch(RAW + path);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return kind === 'text' ? await res.text() : Buffer.from(await res.arrayBuffer());
    } catch (err) {
      if (i === 3) throw new Error(path + ': ' + err.message);
      await sleep(600 * (i + 1));
    }
  }
  return null;
}

// ---------------------------------------------------------------- PNG mínimo (8 bits; paleta de 1 a 8 bits)
function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('no es PNG');
  let off = 8, w = 0, h = 0, depth = 0, ctype = 0, plte = null, trns = null;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off), type = buf.toString('ascii', off + 4, off + 8), data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); depth = data[8]; ctype = data[9]; if (data[12]) throw new Error('PNG entrelazado'); }
    else if (type === 'PLTE') plte = data;
    else if (type === 'tRNS') trns = data;
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  const ch = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ctype];
  if (!ch || (ctype !== 3 && depth !== 8)) throw new Error('formato PNG no soportado: tipo ' + ctype + ', ' + depth + ' bits');
  const bpp = Math.max(1, (ch * depth) >> 3), stride = Math.ceil((w * ch * depth) / 8);
  const raw = inflateSync(Buffer.concat(idat));
  const px = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], src = y * (stride + 1) + 1, dst = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[dst + x - bpp] : 0, b = y ? px[dst - stride + x] : 0, c = x >= bpp && y ? px[dst - stride + x - bpp] : 0;
      let v = raw[src + x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      px[dst + x] = v & 255;
    }
  }
  const rgba = (x, y) => {
    const row = y * stride;
    if (ctype === 3) {
      const bit = x * depth, byte = px[row + (bit >> 3)], i = (byte >> (8 - depth - (bit & 7))) & ((1 << depth) - 1);
      return [plte[i * 3], plte[i * 3 + 1], plte[i * 3 + 2], trns && i < trns.length ? trns[i] : 255];
    }
    const o = row + x * ch;
    if (ctype === 6) return [px[o], px[o + 1], px[o + 2], px[o + 3]];
    if (ctype === 2) return [px[o], px[o + 1], px[o + 2], 255];
    if (ctype === 4) return [px[o], px[o], px[o], px[o + 1]];
    return [px[o], px[o], px[o], 255];
  };
  return { w, h, rgba };
}

// Centro del primer cuadro: el píxel blanco de la hoja de sombra.
function anchor(shadowBuf, fw, fh) {
  const img = decodePng(shadowBuf);
  let sx = 0, sy = 0, n = 0;
  for (let y = 0; y < Math.min(fh, img.h); y++) for (let x = 0; x < Math.min(fw, img.w); x++) {
    const [r, g, b, a] = img.rgba(x, y);
    if (a > 0 && r === 255 && g === 255 && b === 255) { sx += x; sy += y; n++; }
  }
  if (!n) return null;
  return [Math.round((sx / n) * 2) / 2 - 0.5, Math.round((sy / n) * 2) / 2 - 0.5];
}
const pngSize = (buf) => (buf && buf.readUInt32BE(0) === 0x89504e47 ? [buf.readUInt32BE(16), buf.readUInt32BE(20)] : null);

// ---------------------------------------------------------------- AnimData.xml
function parseAnimData(xml) {
  const tag = (s, t) => { const m = new RegExp(`<${t}>([^<]*)</${t}>`).exec(s); return m ? m[1].trim() : null; };
  const shadow = +(tag(xml, 'ShadowSize') || 1);
  const anims = {};
  for (const m of xml.matchAll(/<Anim>([\s\S]*?)<\/Anim>/g)) {
    const s = m[1], name = tag(s, 'Name');
    if (!name) continue;
    const copy = tag(s, 'CopyOf');
    anims[name] = copy ? { copy } : { w: +tag(s, 'FrameWidth'), h: +tag(s, 'FrameHeight'), d: [...s.matchAll(/<Duration>(\d+)<\/Duration>/g)].map((x) => +x[1]) };
  }
  return { shadow, anims };
}
const resolveAnim = (anims, name) => { let a = anims[name], src = name, guard = 0; while (a && a.copy && guard++ < 5) { src = a.copy; a = anims[src]; } return a && !a.copy ? { ...a, src } : null; };

// Convierte una carpeta de SpriteCollab. Devuelve { meta: {Anim: {...}}, files: {Anim: Buffer}, shadow, problems[] }.
async function convert(dir, withShadow) {
  const xml = await get(dir + '/AnimData.xml', 'text');
  if (!xml) return null;
  const ad = parseAnimData(xml);
  const meta = {}, files = {}, problems = [];
  await Promise.all(ANIMS.map(async (name) => {
    const a = resolveAnim(ad.anims, name);
    if (!a) return;
    const [sheet, shadow] = await Promise.all([get(`${dir}/${a.src}-Anim.png`), withShadow ? get(`${dir}/${a.src}-Shadow.png`) : null]);
    if (!sheet) { problems.push(name + ': falta la hoja'); return; }
    const sz = pngSize(sheet), n = a.d.length;
    if (!sz || sz[0] !== a.w * n || sz[1] !== a.h * 8) { problems.push(`${name}: ${sz ? sz.join('x') : '?'} no son ${n} columnas x 8 filas de ${a.w}x${a.h}`); return; }
    const m = { w: a.w, h: a.h, n, r: 8, d: a.d };
    if (withShadow) {
      const an = shadow ? anchor(shadow, a.w, a.h) : null;
      if (!an) { problems.push(name + ': sin píxel de centro en la sombra'); return; }
      m.ax = an[0]; m.ay = an[1];
    }
    meta[name] = m;
    files[name] = sheet;
  }));
  return { meta, files, shadow: ad.shadow, problems };
}

// ---------------------------------------------------------------- créditos
let NAMES = null;
async function creditNames() {
  if (NAMES) return NAMES;
  NAMES = new Map();
  const txt = (await get('credit_names.txt', 'text')) || '';
  for (const line of txt.split(/\r?\n/).slice(1)) {
    const [name, id, contact] = line.split('\t');
    if (id) NAMES.set(id.trim(), { name: (name || '').trim(), contact: (contact || '').trim() });
  }
  return NAMES;
}
async function credits(dir) {
  const txt = await get(dir + '/credits.txt', 'text');
  if (!txt) return [];
  const names = await creditNames(), seen = new Map();
  for (const line of txt.split(/\r?\n/)) {
    const [, id, , license, anims] = line.split('\t');
    if (!id) continue;
    const who = names.get(id.trim());
    const label = who && who.name ? who.name : id.trim().replace(/^<@!?(\d+)>$/, 'Discord $1');
    const prev = seen.get(label) || { name: label, contact: who ? who.contact : '', license: license || '', anims: new Set() };
    for (const a of (anims || '').split(',')) if (a.trim()) prev.anims.add(a.trim());
    if (license) prev.license = license;
    seen.set(label, prev);
  }
  return [...seen.values()].map((c) => ({ ...c, anims: [...c.anims] }));
}

// ---------------------------------------------------------------- principal
async function check() {
  const r = await convert('sprite/0006', true);
  console.log('Charizard (0006) convertido:', JSON.stringify({ s: r.shadow, Idle: r.meta.Idle, Attack: r.meta.Attack }));
  console.log('Esperado del juego: Idle 40x48 n4 ax 19.5 ay 27.5 · Attack 80x88 n14 ax 39.5 ay 46.5 · s 2');
}

async function one(m) {
  const dir = `sprite/${String(m.dex).padStart(4, '0')}/${m.form}`;
  const base = await convert(dir, true);
  if (!base) return { key: m.key, ok: false, why: 'sin AnimData.xml en ' + dir };
  if (!base.meta.Idle || !base.meta.Walk) return { key: m.key, ok: false, why: 'sin Idle o Walk utilizables · ' + base.problems.join('; ') };
  const shiny = await convert(dir + '/0001', false);
  const outDir = join(OUT_PK, m.key);
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  for (const [a, buf] of Object.entries(base.files)) writeFileSync(join(outDir, a + '.png'), buf);
  const entry = { s: base.shadow, a: base.meta, sh: 0 };
  const shinyProblems = [];
  if (shiny && Object.keys(shiny.files).length) {
    // El juego usa la entrada normal para el shiny. Si un cuadro difiere va en "sa";
    // las animaciones que el shiny no tenga se descartan de la forma shiny.
    const missing = Object.keys(base.meta).filter((a) => !shiny.meta[a]);
    if (!missing.length) {
      mkdirSync(join(outDir, 's'), { recursive: true });
      for (const [a, buf] of Object.entries(shiny.files)) if (base.meta[a]) writeFileSync(join(outDir, 's', a + '.png'), buf);
      const sa = {};
      for (const a of Object.keys(base.meta)) {
        const b = base.meta[a], s = shiny.meta[a];
        if (s.w !== b.w || s.h !== b.h || s.n !== b.n || s.d.join() !== b.d.join()) sa[a] = { ...s, ax: b.ax + (s.w - b.w) / 2, ay: b.ay + (s.h - b.h) / 2 };
      }
      entry.sh = 1;
      if (Object.keys(sa).length) entry.sa = sa;
    } else shinyProblems.push('shiny incompleto (falta ' + missing.join(', ') + ')');
  }
  if (m.hover) entry.hv = 1;
  const cred = await credits(dir);
  const credS = entry.sh ? await credits(dir + '/0001') : [];
  return {
    key: m.key, ok: true,
    data: {
      key: m.key, dex: m.dex, name: m.name, types: m.types, base: m.base, mega: m.mega, form: dir,
      anims: Object.keys(base.meta), shiny: !!entry.sh, meta: entry, credits: cred, creditsShiny: credS,
    },
    notes: [...base.problems, ...shinyProblems],
  };
}

async function main() {
  if (args.includes('--check')) { await check(); return; }
  const only = (opt('only') || '').split(',').filter(Boolean);
  const list = only.length ? MEGAS.filter((m) => only.includes(m.key)) : MEGAS;
  mkdirSync(OUT_PK, { recursive: true });
  mkdirSync(OUT_NX, { recursive: true });
  const jsonFile = join(OUT_NX, 'megas.json');
  const prev = only.length && existsSync(jsonFile) ? JSON.parse(readFileSync(jsonFile, 'utf8')) : { megas: {} };
  const results = [];
  for (let i = 0; i < list.length; i += 4) {
    const chunk = await Promise.all(list.slice(i, i + 4).map((m) => one(m).catch((err) => ({ key: m.key, ok: false, why: err.message }))));
    for (const r of chunk) {
      results.push(r);
      console.log(r.ok ? `ok   ${r.key}  ${r.data.name} · ${r.data.anims.length}/7 animaciones${r.data.shiny ? ' · shiny' : ''}${r.notes.length ? ' · ' + r.notes.join('; ') : ''}` : `fallo ${r.key}  ${r.why}`);
    }
  }
  const megas = { ...prev.megas };
  for (const r of results) if (r.ok) megas[r.key] = r.data;
  const out = { source: 'PMDCollab/SpriteCollab (CC BY-NC 4.0)', generated: new Date().toISOString().slice(0, 10), megas };
  writeFileSync(jsonFile, JSON.stringify(out) + '\n');

  const fmt = (c) => `${c.name}${c.contact && /^https?:/.test(c.contact) ? ` (${c.contact})` : ''}${c.anims.length ? ': ' + c.anims.join(', ') : ''}${c.license ? ' · ' + c.license.replace(/_/g, ' ') : ''}`;
  const lines = ['# Créditos de las formas mega', '',
    'Sprites de PMDCollab/SpriteCollab (https://sprites.pmdcollab.org), licencia CC BY-NC 4.0 salvo que se indique otra en cada autor.',
    'Se usan sin cambios en esta edición privada y sin fines comerciales de PokeSurvivor Nexus. Pokémon y sus nombres son marcas de Nintendo, Creatures y GAME FREAK.', ''];
  for (const m of Object.values(megas).sort((a, b) => a.dex - b.dex)) {
    lines.push(`## ${m.name} (\`${m.key}\`, ${m.form})`, '');
    for (const c of m.credits) lines.push('- ' + fmt(c));
    if (m.creditsShiny && m.creditsShiny.length) { lines.push('', 'Shiny:', ''); for (const c of m.creditsShiny) lines.push('- ' + fmt(c)); }
    lines.push('');
  }
  writeFileSync(join(OUT_NX, 'CREDITS-megas.md'), lines.join('\n'));
  const bad = results.filter((r) => !r.ok);
  console.log(`\n${results.length - bad.length} formas listas, ${bad.length} fallidas. megas.json con ${Object.keys(megas).length} formas.`);
}

main().catch((err) => { console.error(err); process.exit(1); });
