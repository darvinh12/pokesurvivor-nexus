// Identidad visual de la Nexus Edition: logo propio en pixel art bajo el logo
// original (que se queda como crédito al juego de JPTER78), paletas de acento
// para cajas y botones con variables CSS, pantalla de inicio breve y un texto
// de bienvenida. Por defecto solo se activa en la edición; en el laboratorio
// queda en el estilo original hasta que se elija otro en el panel.
// La idea del logo sobre el título viene de setupLogoPlus y setupSplash de
// PokeSurvivor Plus (MIT); el dibujo y el código son propios.
(() => {
  const KEY = 'theme';
  const ED = () => !!(NX.data && NX.data.edition);
  const WELCOME_V = 1;

  // ---------- logo en pixel art ----------
  // Gema del Nexus, 13x13. g borde dorado, o borde en sombra, w brillo,
  // c cian claro, b cian, d azul profundo, y núcleo.
  const GEM = [
    '......g......',
    '.....gwg.....',
    '....gwccg....',
    '...gwccbbo...',
    '..gwccbbbdo..',
    '.gwccbybbddo.',
    'gwccbyyybbddo',
    '.gccbbybbddo.',
    '..gcbbbbddo..',
    '...gbbbddo...',
    '....gbddo....',
    '.....gdo.....',
    '......o......',
  ];
  // Letras 5x7 para NEXUS y 3x5 (la N de 4) para EDITION.
  const BIG = {
    N: ['X...X', 'XX..X', 'XX..X', 'X.X.X', 'X..XX', 'X..XX', 'X...X'],
    E: ['XXXXX', 'X....', 'X....', 'XXXX.', 'X....', 'X....', 'XXXXX'],
    X: ['X...X', 'X...X', '.X.X.', '..X..', '.X.X.', 'X...X', 'X...X'],
    U: ['X...X', 'X...X', 'X...X', 'X...X', 'X...X', 'X...X', '.XXX.'],
    S: ['.XXXX', 'X....', 'X....', '.XXX.', '....X', '....X', 'XXXX.'],
  };
  const SMALL = {
    E: ['XXX', 'X..', 'XX.', 'X..', 'XXX'],
    D: ['XX.', 'X.X', 'X.X', 'X.X', 'XX.'],
    I: ['XXX', '.X.', '.X.', '.X.', 'XXX'],
    T: ['XXX', '.X.', '.X.', '.X.', '.X.'],
    O: ['XXX', 'X.X', 'X.X', 'X.X', 'XXX'],
    N: ['X..X', 'XX.X', 'X.XX', 'X..X', 'X..X'],
  };
  const COLORS = {
    g: '#ffd23f', o: '#c77a12', w: '#ffffff', c: '#a8f4ff', b: '#3cc4f0', d: '#1d6fc4', y: '#fff3a0',
    n1: '#e2fcff', n2: '#5fe0ff', n3: '#2f9be8', e1: '#fff6b8', e2: '#ffd23f', e3: '#f0a31e',
    k: '#0b1838', s: '#05081a',
  };

  function buildLogo() {
    const W = 48, H = 17;
    const grid = Array.from({ length: H }, () => Array(W).fill(''));
    const put = (x, y, c) => { if (x >= 0 && y >= 0 && x < W && y < H) grid[y][x] = c; };
    GEM.forEach((row, y) => [...row].forEach((ch, x) => { if (ch !== '.') put(1 + x, 1 + y, ch); }));
    const word = (text, font, x0, y0, shade) => {
      let x = x0;
      for (const L of text) {
        const g = font[L];
        g.forEach((row, y) => [...row].forEach((ch, dx) => { if (ch === 'X') put(x + dx, y0 + y, shade(y, g.length)); }));
        x += g[0].length + 1;
      }
    };
    word('NEXUS', BIG, 17, 1, (y) => (y < 2 ? 'n1' : y < 5 ? 'n2' : 'n3'));
    word('EDITION', SMALL, 18, 10, (y) => (y < 2 ? 'e1' : y < 4 ? 'e2' : 'e3'));
    // Contorno oscuro de un píxel y sombra desplazada, como el título del juego.
    const filled = (x, y) => y >= 0 && x >= 0 && y < H && x < W && grid[y][x] && grid[y][x] !== 'k' && grid[y][x] !== 's';
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (grid[y][x]) continue;
      for (let dy = -1; dy <= 1 && !grid[y][x]; dy++) for (let dx = -1; dx <= 1; dx++) if (filled(x + dx, y + dy)) { grid[y][x] = 'k'; break; }
    }
    const solid = grid.map((r) => r.map((c) => !!c));
    for (let y = H - 1; y >= 1; y--) for (let x = W - 1; x >= 1; x--) if (!grid[y][x] && solid[y - 1][x - 1]) grid[y][x] = 's';
    // Un rectángulo por cada tramo horizontal del mismo color.
    let rects = '';
    for (let y = 0; y < H; y++) {
      let x = 0;
      while (x < W) {
        const c = grid[y][x];
        if (!c) { x++; continue; }
        let e = x + 1;
        while (e < W && grid[y][e] === c) e++;
        rects += `<rect x="${x}" y="${y}" width="${e - x}" height="1" fill="${COLORS[c]}"/>`;
        x = e;
      }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" shape-rendering="crispEdges" role="img" aria-label="Nexus Edition">${rects}</svg>`;
  }
  let logoSvg = '';
  const logo = () => logoSvg || (logoSvg = buildLogo());

  // ---------- paletas ----------
  const PALETTES = {
    nexus: { name: 'Nexus (violeta y cian)', box1: '#3a3396', box2: '#1c1758', edge: '#f2f0ff', edgeIn: '#7d70f2', edgeOut: '#0c0a2e', shadow: '#0b0a26', muted: '#c9c3f5', btn1: '#5b50d4', btn2: '#342b98', hover: 'rgba(95,224,255,.14)', accent: '#5fe0ff' },
    esmeralda: { name: 'Esmeralda', box1: '#1f6b5a', box2: '#0f3b33', edge: '#effff9', edgeIn: '#46b894', edgeOut: '#06201b', shadow: '#04150f', muted: '#bfe8da', btn1: '#2f8f76', btn2: '#1c5f4f', hover: 'rgba(120,255,200,.12)', accent: '#7dffcf' },
    carmesi: { name: 'Carmesí', box1: '#8a2a3e', box2: '#4a1222', edge: '#fff2f4', edgeIn: '#d05a72', edgeOut: '#250610', shadow: '#1a040b', muted: '#f1c4cd', btn1: '#b03a52', btn2: '#7a2236', hover: 'rgba(255,160,180,.13)', accent: '#ffb3c1' },
    noche: { name: 'Noche (gris azulado)', box1: '#2f3a4f', box2: '#161c2a', edge: '#eef3fb', edgeIn: '#6a7d9e', edgeOut: '#070a12', shadow: '#05070d', muted: '#bac6da', btn1: '#4a5a78', btn2: '#2b3549', hover: 'rgba(200,220,255,.10)', accent: '#9fd0ff' },
  };
  const paletteCss = Object.entries(PALETTES).map(([id, p]) => `html.nx-th-${id}{--box1:${p.box1};--box2:${p.box2};--edge:${p.edge};--edge-in:${p.edgeIn};--edge-out:${p.edgeOut};--shadow:${p.shadow};--muted:${p.muted};--nx-btn1:${p.btn1};--nx-btn2:${p.btn2};--nx-hover:${p.hover};--nx-accent:${p.accent}}`).join('\n');

  NX.css(`${paletteCss}
html.nx-th .btn:not(.gold):not(.ghost):not(.google):not(.danger){background:linear-gradient(180deg,var(--nx-btn1),var(--nx-btn2))}
html.nx-th .menu-item:hover,html.nx-th .menu-item:focus-visible{background:var(--nx-hover)}
html.nx-th #nexus-panel .nx-box{background:linear-gradient(var(--box1),var(--box2));border-color:var(--edge);outline-color:var(--edge-out);box-shadow:inset 0 0 0 2px var(--edge-in),0 6px 0 var(--edge-out)}
html.nx-th #nexus-panel h3{color:var(--nx-accent)}
html.nx-th #nexus-panel select,html.nx-th #nexus-panel .nx-search,html.nx-th #nexus-panel .nx-btn,html.nx-th #nexus-panel .nx-close,html.nx-th #nexus-panel .nx-tabs button:not(.on){background:var(--edge-out);border-color:var(--edge-in)}
html.nx-th #nexus-fab{background:var(--box2);outline-color:var(--edge-out)}
#nx-logo{display:flex;justify-content:center;margin:10px auto 0;line-height:0;pointer-events:none}
#nx-logo svg{height:clamp(36px,7.5vh,64px);width:auto;filter:drop-shadow(0 0 10px rgba(95,224,255,.25))}
@media (max-height:660px){#nx-logo{margin-top:6px}#nx-logo svg{height:clamp(30px,6.5vh,44px)}}
@media (max-height:520px){#nx-logo{margin-top:3px}#nx-logo svg{height:24px}}
@media (max-height:400px){#nx-logo svg{height:21px}}
.boot-in .nx-boot-logo{display:flex;justify-content:center;line-height:0;margin:14px 0 4px}
.boot-in .nx-boot-logo svg{height:clamp(44px,10vh,84px);width:auto}
#nx-splash{position:fixed;inset:0;z-index:100002;display:flex;align-items:center;justify-content:center;cursor:pointer;
  background:radial-gradient(ellipse at 50% 45%,#231d63 0%,#0d0b2c 55%,#04050f 100%);transition:opacity .45s ease}
#nx-splash.out{opacity:0;pointer-events:none}
#nx-splash .in{text-align:center;padding:20px;font:16px/1.35 var(--font,'Pixelify',system-ui,sans-serif);color:#dfe4ff;text-shadow:2px 2px 0 #000}
#nx-splash .lg{line-height:0;display:flex;justify-content:center}
#nx-splash .lg svg{height:min(30vh,170px);max-width:88vw;width:auto;animation:nxSplashIn .7s cubic-bezier(.2,.9,.3,1.15) both}
#nx-splash .t{margin-top:16px;font-size:clamp(15px,2.6vh,20px);color:#ffd23f;letter-spacing:1px;animation:nxSplashFade .6s .25s both}
#nx-splash .s{margin-top:4px;font-size:clamp(11px,1.8vh,14px);color:#a9b3e6;animation:nxSplashFade .6s .35s both}
@keyframes nxSplashIn{from{transform:scale(.82);opacity:0}to{transform:none;opacity:1}}
@keyframes nxSplashFade{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){#nx-splash .lg svg,#nx-splash .t,#nx-splash .s{animation:none}}
#nx-welcome{position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(3,6,16,.6)}
#nx-welcome .box{width:min(440px,100%);text-align:left}
#nx-welcome .lg{line-height:0;display:flex;justify-content:center;margin-bottom:10px}
#nx-welcome .lg svg{height:52px;width:auto}
#nx-welcome h2{font-size:22px;color:var(--gold,#ffd23f);text-align:center}
#nx-welcome p{margin:6px 0;font-size:15px;line-height:1.4}
#nx-welcome .note{font-size:12px;color:var(--muted,#b9cbf0)}
#nx-welcome .btn{display:block;width:100%;margin:12px 0 0}
@media (max-height:520px){#nx-welcome .lg{display:none}#nx-welcome h2{font-size:18px}#nx-welcome p{font-size:13px;margin:4px 0}}`);

  const style = () => {
    const v = NX.store.get('theme:style', ED() ? 'nexus' : 'original');
    return PALETTES[v] ? v : 'original';
  };
  const opt = (k) => !!NX.store.get('theme:' + k, ED());

  // ---------- aplicar ----------
  function applyPalette() {
    const root = document.documentElement;
    if (!root) { NX.onReady(applyPalette); return; }
    const on = NX.isOn(KEY);
    const st = on ? style() : 'original';
    for (const id of Object.keys(PALETTES)) root.classList.toggle('nx-th-' + id, st === id);
    root.classList.toggle('nx-th', st !== 'original');
  }

  function ensureLogo() {
    const want = NX.isOn(KEY) && opt('logo');
    const cur = document.getElementById('nx-logo');
    if (!want) { if (cur) cur.remove(); return; }
    if (cur && cur.isConnected) return;
    const t1 = document.querySelector('#scr-menu .logo .t1');
    if (!t1) return;
    const d = document.createElement('div');
    d.id = 'nx-logo';
    d.setAttribute('translate', 'no');
    d.title = 'Nexus Edition · edición privada de PokéSurvivor, juego original de JPTER78';
    d.innerHTML = logo();
    t1.insertAdjacentElement('afterend', d);
  }

  function ensureBoot() {
    if (!NX.isOn(KEY) || !opt('logo')) return;
    for (const id of ['boot', 'tap-start']) {
      const box = document.querySelector('#' + id + ' .boot-in');
      if (!box || box.querySelector('.nx-boot-logo')) continue;
      const d = document.createElement('div');
      d.className = 'nx-boot-logo';
      d.innerHTML = logo();
      const h1 = box.querySelector('h1');
      if (h1) h1.insertAdjacentElement('afterend', d); else box.prepend(d);
    }
  }

  let splashDone = false;
  function splash() {
    if (splashDone || !NX.isOn(KEY) || !opt('splash')) return;
    splashDone = true;
    const el = document.createElement('div');
    el.id = 'nx-splash';
    el.setAttribute('translate', 'no');
    el.innerHTML = `<div class="in"><div class="lg">${logo()}</div><div class="t">PokéSurvivor · Nexus Edition</div><div class="s">Edición privada sin fines comerciales · juego original de JPTER78</div></div>`;
    let gone = false;
    const close = () => {
      if (gone) return;
      gone = true;
      el.classList.add('out');
      setTimeout(() => el.remove(), 500);
    };
    el.addEventListener('pointerdown', (e) => { e.stopPropagation(); close(); });
    document.body.appendChild(el);
    setTimeout(close, 1700);
  }

  function nick() {
    try { const s = NX.ns && NX.ns.DB && NX.ns.DB.save; return (s && s.name && String(s.name).slice(0, 20)) || ''; } catch (_) { return ''; }
  }
  function showWelcome(force) {
    if (document.getElementById('nx-welcome')) return;
    const n = nick();
    const el = document.createElement('div');
    el.id = 'nx-welcome';
    el.innerHTML = `<div class="box"><div class="lg">${logo()}</div>
      <h2>${n ? 'Bienvenido, ' + NX.esc(n) : 'Bienvenido'}</h2>
      <p>Esta es PokeSurvivor Nexus Edition, una edición privada del juego con el mod Nexus integrado.</p>
      <p>Pulsa el botón Nexus o Alt+N para ver los ajustes: estilo, filtros de pantalla, música propia y mucho más.</p>
      <p class="note">PokéSurvivor es un juego de JPTER78. Esta edición no tiene fines comerciales.</p>
      <button class="btn gold" type="button">Entendido</button></div>`;
    for (const ev of ['pointerdown', 'mousedown', 'touchstart', 'click', 'wheel']) el.addEventListener(ev, (e) => e.stopPropagation());
    el.querySelector('button').addEventListener('click', () => {
      NX.store.set('theme:welcomed', WELCOME_V);
      el.remove();
    });
    document.body.appendChild(el);
    if (force) NX.store.set('theme:welcomed', 0);
  }
  function maybeWelcome() {
    if (!NX.isOn(KEY) || !opt('welcome') || NX.store.get('theme:welcomed', 0) >= WELCOME_V) return;
    const st = NX.ns && NX.ns.Game && NX.ns.Game.state;
    if (st !== 'ui' || !NX.shown('scr-menu')) return;
    // Solo con el menú despejado: sin otra ventana del juego encima.
    const other = [...document.querySelectorAll('.scr:not(.hidden)')].some((e) => e.id !== 'scr-menu');
    if (other || NX.shown('nexus-panel') || document.getElementById('nx-splash')) return;
    showWelcome(false);
  }

  function applyAll() {
    if (!document.body) { NX.onReady(applyAll); return; }
    applyPalette();
    ensureLogo();
    ensureBoot();
  }

  NX.feature({
    key: KEY,
    label: 'Identidad Nexus Edition',
    early: true,
    setup() {
      // La paleta va lo antes posible para que la pantalla de carga no parpadee.
      applyPalette();
      NX.onReady(() => {
        applyAll();
        splash();
        // El menú puede rehacerse y otra pestaña puede cambiar el estilo.
        setInterval(() => {
          try { applyAll(); maybeWelcome(); } catch (err) { NX.trip(KEY, err); }
        }, 1000);
      });
    },
  });

  NX.settings.section({
    key: KEY,
    title: 'Identidad Nexus Edition',
    tab: 'Estilo',
    keywords: 'tema estilo logo paleta colores bienvenida pantalla de inicio splash nexus edition',
    render(el) {
      el.appendChild(NX.ui.toggle('Activado', 'on:' + KEY, true, applyAll));
      el.appendChild(NX.ui.select('Estilo de menús', 'theme:style',
        [...Object.entries(PALETTES).map(([id, p]) => [id, p.name]), ['original', 'Original del juego']],
        ED() ? 'nexus' : 'original', applyAll));
      el.appendChild(NX.ui.toggle('Logo Nexus Edition', 'theme:logo', ED(), applyAll));
      el.appendChild(NX.ui.toggle('Pantalla de inicio al cargar', 'theme:splash', ED()));
      el.appendChild(NX.ui.toggle('Bienvenida en el menú', 'theme:welcome', ED()));
      el.appendChild(NX.ui.button('Ver la bienvenida', () => { if (NX.togglePanel) NX.togglePanel(); showWelcome(true); }));
      el.appendChild(NX.ui.note('El logo original del juego se queda siempre como crédito a su autor.'));
    },
  });
})();
