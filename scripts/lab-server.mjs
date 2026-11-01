// Laboratorio: sirve una copia local de PokéSurvivor para probar Nexus sin
// tocar el sitio público, su ranking ni su servidor.
//   git clone --depth 1 https://github.com/JPTER78/pokesurvivor.git _ref/game
//   node scripts/lab-server.mjs [carpeta del juego] [--port 8080]
//
// La copia se sirve con dos cambios en memoria (los archivos no se tocan):
//  - La CSP de la página deja solo 'self' para scripts y conexiones, así que el
//    SDK de Firebase no carga y el juego corre sin conexión con guardado local. Nada llega a las cuentas
//    ni al ranking del autor.
//  - Se omite el arranque del detector de extensiones (Hz.boot), que en esta
//    copia de prueba no protege nada y taparía la pantalla.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, normalize, extname, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const pi = args.indexOf('--port');
const port = pi >= 0 ? +args[pi + 1] : 8080;
const dirArg = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--port');
const gameDir = resolve(dirArg || join(root, '_ref', 'game'));

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.txt': 'text/plain',
};

const BANNER = '<div style="position:fixed;left:50%;bottom:6px;transform:translateX(-50%);z-index:2147483647;pointer-events:none;' +
  'font:12px system-ui,sans-serif;color:#0b1838;background:#ffd23f;padding:2px 10px;border-radius:10px;opacity:.85">' +
  'Laboratorio local de PokeSurvivor Nexus · sin conexión al servidor del juego</div>';

function patchHtml(s) {
  const csp = /<meta http-equiv="Content-Security-Policy" content="[^"]*">/;
  if (!csp.test(s)) console.warn('[lab] no se encontró la CSP en el HTML');
  return s.replace(csp, `<meta http-equiv="Content-Security-Policy" content="script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'">`)
    .replace(/<\/body>/i, BANNER + '</body>');
}
function patchApp(s) {
  const boot = /_0x[0-9a-f]+\['Hz'\]\['boot'\]\(\),/;
  if (!boot.test(s)) console.warn('[lab] no se encontró el arranque del detector; la copia puede mostrar el aviso de extensiones');
  return s.replace(boot, '');
}

createServer(async (req, res) => {
  try {
    let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (path.endsWith('/')) path += 'index.html';
    const file = normalize(join(gameDir, path));
    if (!file.startsWith(gameDir)) { res.writeHead(403).end(); return; }
    const st = await stat(file).catch(() => null);
    if (!st || !st.isFile()) { res.writeHead(404, { 'content-type': 'text/plain' }).end('404'); return; }
    const ext = extname(file).toLowerCase();
    let body = await readFile(file);
    if (ext === '.html') body = Buffer.from(patchHtml(body.toString('utf8')));
    else if (/[\\/]js[\\/]app\.min\.js$/.test(file)) body = Buffer.from(patchApp(body.toString('utf8')));
    res.writeHead(200, { 'content-type': TYPES[ext] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(body);
  } catch (err) {
    res.writeHead(500, { 'content-type': 'text/plain' }).end(String(err));
  }
}).listen(port, '127.0.0.1', () => {
  console.log(`Laboratorio en http://localhost:${port}  (juego: ${gameDir})`);
});
