// Filtros de pantalla sobre el canvas del juego: Game Boy (cuatro verdes),
// nocturno (cálido y con menos brillo) y colores vivos, cada uno con su
// intensidad, más un efecto CRT aparte (líneas de barrido y viñeta curva en
// una capa que no recibe clics). Convive con el modo daltónico: si este
// también filtra #game, las dos cosas se encadenan en la misma propiedad
// filter (primero la corrección de color, luego el estilo) en vez de pisarse.
// Nada se anima por cuadro: son estilos fijos que se recalculan al cambiar un ajuste.
(() => {
  const KEY = 'sfilter';
  const SVG_NS = 'http://www.w3.org/2000/svg';
  // Paleta clásica de la Game Boy, de oscuro a claro.
  const GB = [[15, 56, 15], [48, 98, 48], [139, 172, 15], [155, 188, 15]];

  const mode = () => NX.store.get('sfilter:mode', 'off');
  const k = () => NX.clamp(+NX.store.get('sfilter:k', 70) / 100 || 0, 0, 1);
  const crtOn = () => !!NX.store.get('sfilter:crt', false);
  const crtK = () => NX.clamp(+NX.store.get('sfilter:crtK', 60) / 100 || 0, 0, 1);

  NX.css(`#nexus-crt{position:fixed;inset:0;z-index:15;pointer-events:none;display:none}
html.nx-sf-crt #nexus-crt{display:block}
#nexus-crt::before{content:"";position:absolute;inset:0;
  background:repeating-linear-gradient(to bottom,rgba(0,0,0,var(--nx-crt-line,.25)) 0,rgba(0,0,0,var(--nx-crt-line,.25)) 1px,transparent 1px,transparent 3px)}
#nexus-crt::after{content:"";position:absolute;inset:0;border-radius:var(--nx-crt-r,24px);
  box-shadow:inset 0 0 var(--nx-crt-vig,90px) rgba(0,0,0,var(--nx-crt-dark,.6)),0 0 0 40px #000;
  background:radial-gradient(ellipse at 50% 50%,transparent 62%,rgba(0,0,0,var(--nx-crt-edge,.35)) 100%)}`);

  let sheet = null, sig = '';

  function ensureSvg() {
    let svg = document.getElementById('nexus-sf-svg');
    if (svg) return svg;
    svg = document.createElementNS(SVG_NS, 'svg');
    svg.id = 'nexus-sf-svg';
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('style', 'position:absolute;width:0;height:0;overflow:hidden');
    const col = (i) => GB.map((c) => (c[i] / 255).toFixed(3)).join(' ');
    svg.innerHTML =
      // Game Boy: a gris, cuatro niveles discretos con los verdes y mezcla con el original.
      `<filter id="nexus-sf-gb" color-interpolation-filters="sRGB">
        <feColorMatrix in="SourceGraphic" type="matrix" values="0.299 0.587 0.114 0 0 0.299 0.587 0.114 0 0 0.299 0.587 0.114 0 0 0 0 0 1 0" result="g"/>
        <feComponentTransfer in="g" result="p">
          <feFuncR type="discrete" tableValues="${col(0)}"/><feFuncG type="discrete" tableValues="${col(1)}"/><feFuncB type="discrete" tableValues="${col(2)}"/>
        </feComponentTransfer>
        <feComposite in="p" in2="SourceGraphic" operator="arithmetic" k1="0" k2="1" k3="0" k4="0"/>
      </filter>` +
      // Nocturno: menos azul y menos verde, y menos brillo.
      '<filter id="nexus-sf-night" color-interpolation-filters="sRGB"><feColorMatrix type="matrix"/></filter>';
    document.body.appendChild(svg);
    return svg;
  }

  // Valor de la propiedad filter para el modo elegido, o '' si no hay.
  function filterFor(m, kk, svg) {
    if (m === 'gb') {
      const c = svg.querySelector('#nexus-sf-gb feComposite');
      c.setAttribute('k2', kk.toFixed(3));
      c.setAttribute('k3', (1 - kk).toFixed(3));
      return 'url(#nexus-sf-gb)';
    }
    if (m === 'night') {
      const b = 1 - 0.32 * kk;
      const r = b, g = b * (1 - 0.14 * kk), bl = b * (1 - 0.42 * kk);
      svg.querySelector('#nexus-sf-night feColorMatrix').setAttribute('values',
        `${r.toFixed(3)} 0 0 0 0 0 ${g.toFixed(3)} 0 0 0 0 0 ${bl.toFixed(3)} 0 0 0 0 0 1 0`);
      return 'url(#nexus-sf-night)';
    }
    if (m === 'vivid') return `saturate(${(1 + 0.9 * kk).toFixed(2)}) contrast(${(1 + 0.12 * kk).toFixed(2)})`;
    return '';
  }

  function apply() {
    if (!document.body) { NX.onReady(apply); return; }
    const on = NX.isOn(KEY);
    const m = on ? mode() : 'off', kk = k(), crt = on && crtOn(), ck = crtK();
    sig = [m, kk, crt, ck].join('|');
    const root = document.documentElement;
    const svg = ensureSvg();
    let f = kk > 0 ? filterFor(m, kk, svg) : '';
    // El CRT además realza un poco el contraste de la imagen.
    if (crt && ck > 0) f = (f + ` contrast(${(1 + 0.1 * ck).toFixed(2)}) saturate(${(1 + 0.15 * ck).toFixed(2)})`).trim();
    if (!sheet) { sheet = document.createElement('style'); sheet.id = 'nexus-sf-style'; document.head.appendChild(sheet); }
    // Más específico que la regla del modo daltónico (html.nx-cb-game #game),
    // y con su filtro primero cuando está activo.
    sheet.textContent = f
      ? `html.nx-sf #game{filter:${f}}\nhtml.nx-sf.nx-cb-game #game{filter:url(#nexus-cb) ${f}}`
      : '';
    root.classList.toggle('nx-sf', !!f);

    let ov = document.getElementById('nexus-crt');
    if (crt && ck > 0) {
      if (!ov) { ov = document.createElement('div'); ov.id = 'nexus-crt'; ov.setAttribute('aria-hidden', 'true'); document.body.appendChild(ov); }
      const s = ov.style;
      s.setProperty('--nx-crt-line', (0.08 + 0.32 * ck).toFixed(3));
      s.setProperty('--nx-crt-dark', (0.25 + 0.5 * ck).toFixed(3));
      s.setProperty('--nx-crt-edge', (0.15 + 0.35 * ck).toFixed(3));
      s.setProperty('--nx-crt-vig', Math.round(40 + 90 * ck) + 'px');
      s.setProperty('--nx-crt-r', Math.round(8 + 30 * ck) + 'px');
    }
    root.classList.toggle('nx-sf-crt', crt && ck > 0);
  }

  const MODES = [['off', 'Ninguno'], ['gb', 'Game Boy'], ['night', 'Nocturno'], ['vivid', 'Colores vivos']];
  NX.feature({
    key: KEY,
    label: 'Filtros de pantalla',
    early: true,
    setup() {
      NX.onReady(apply);
      NX.every(1000, () => {
        const now = [NX.isOn(KEY) ? mode() : 'off', k(), NX.isOn(KEY) && crtOn(), crtK()].join('|');
        if (now !== sig) apply();
      }, { key: KEY });
    },
  });

  const pct = (v) => v + ' %';
  NX.settings.section({
    key: KEY,
    title: 'Filtros de pantalla',
    tab: 'Estilo',
    keywords: 'filtro crt scanlines retro game boy verde nocturno noche cálido brillo saturación colores vivos pantalla',
    render(el) {
      el.appendChild(NX.ui.toggle('Activado', 'on:' + KEY, true, apply));
      el.appendChild(NX.ui.select('Filtro de color', 'sfilter:mode', MODES, 'off', apply));
      el.appendChild(NX.ui.range('Intensidad del filtro', 'sfilter:k', 0, 100, 5, 70, pct, apply));
      el.appendChild(NX.ui.toggle('Efecto CRT (líneas y curvatura)', 'sfilter:crt', false, apply));
      el.appendChild(NX.ui.range('Intensidad del CRT', 'sfilter:crtK', 0, 100, 5, 60, pct, apply));
      el.appendChild(NX.ui.note('Se combina con el modo daltónico. En teléfonos modestos los filtros pueden costar algunos FPS; bájalos o apágalos si notas tirones.'));
    },
  });
})();
