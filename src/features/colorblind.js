// Modo daltónico: corrección de color (daltonización) con un filtro SVG
// feColorMatrix aplicado por CSS al canvas del juego o a toda la página. Lo
// que un tipo de daltonismo no distingue se mueve a colores que sí ve. Las
// matrices de simulación son las de Machado et al. (2009) a severidad total.
// Matrices y reparto adaptados de PokeSurvivor Plus (MIT).
(() => {
  const KEY = 'colorblind';
  const SIM = {
    protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
    deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]],
    tritan: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.303900]],
  };
  // Cómo se reparte lo perdido: en rojo y verde, los rojos se aclaran y los
  // verdes se oscurecen (con un empuje hacia el azul); en azul y amarillo,
  // la diferencia pasa a rojo y verde.
  const SHIFT = {
    protan: [[0, 0, 0], [1.2, 1.2, 0], [1.2, 0, 1.2]],
    deutan: [[0, 0, 0], [1.68, 1.4, 0], [1.12, 0, 1.4]],
    tritan: [[1.4, 0, 0], [0, 1.4, 1.68], [0, 0, 0]],
  };
  const I = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  function matrix(mode, k) {
    const S = SIM[mode], E = SHIFT[mode];
    const D = I.map((r, i) => r.map((v, j) => v - S[i][j]));
    const M = I.map((r, i) => r.map((v, j) => v + E[i].reduce((n, e, t) => n + e * D[t][j], 0)));
    return I.map((r, i) => r.map((v, j) => v + k * (M[i][j] - v)));
  }

  NX.css(`html.nx-cb-game #game{filter:url(#nexus-cb)}
html.nx-cb-page{filter:url(#nexus-cb)}`);

  let sig = '';
  function apply() {
    if (!document.body) { NX.onReady(apply); return; }
    const root = document.documentElement;
    const mode = NX.store.get('cb:mode', 'off');
    const on = NX.isOn(KEY) && !!SIM[mode];
    sig = [on, mode, NX.store.get('cb:k', 1), NX.store.get('cb:scope', 'game')].join('|');
    root.classList.remove('nx-cb-game', 'nx-cb-page');
    if (!on) return;
    let svg = document.getElementById('nexus-cb-svg');
    if (!svg) {
      svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.id = 'nexus-cb-svg';
      svg.setAttribute('aria-hidden', 'true');
      svg.setAttribute('style', 'position:absolute;width:0;height:0;overflow:hidden');
      svg.innerHTML = '<filter id="nexus-cb" color-interpolation-filters="sRGB"><feColorMatrix type="matrix"/></filter>';
      document.body.appendChild(svg);
    }
    const k = NX.clamp(+NX.store.get('cb:k', 1) || 0, 0, 1.5);
    const m = matrix(mode, k);
    svg.querySelector('feColorMatrix').setAttribute('values',
      m.map((r) => r.map((v) => v.toFixed(4)).join(' ') + ' 0 0').join(' ') + ' 0 0 0 1 0');
    root.classList.add(NX.store.get('cb:scope', 'game') === 'page' ? 'nx-cb-page' : 'nx-cb-game');
  }

  NX.feature({
    key: KEY,
    label: 'Modo daltónico',
    early: true,
    setup() {
      NX.onReady(apply);
      // Por si el ajuste cambia desde otra pestaña o desde otro módulo.
      NX.every(1000, () => {
        const now = [NX.isOn(KEY) && !!SIM[NX.store.get('cb:mode', 'off')], NX.store.get('cb:mode', 'off'), NX.store.get('cb:k', 1), NX.store.get('cb:scope', 'game')].join('|');
        if (now !== sig) apply();
      }, { key: KEY });
    },
  });

  NX.settings.section({
    key: KEY,
    title: 'Modo daltónico',
    tab: 'General',
    keywords: 'daltonismo color protanopia deuteranopia tritanopia accesibilidad',
    render(el) {
      el.appendChild(NX.ui.toggle('Activado', 'on:' + KEY, true, apply));
      el.appendChild(NX.ui.select('Tipo', 'cb:mode', [['off', 'Ninguno'], ['protan', 'Protanopia (rojo)'], ['deutan', 'Deuteranopia (verde)'], ['tritan', 'Tritanopia (azul)']], 'off', apply));
      el.appendChild(NX.ui.range('Intensidad', 'cb:k', 0, 1.5, 0.1, 1, (v) => Math.round(v * 100) + ' %', apply));
      el.appendChild(NX.ui.select('Aplicar a', 'cb:scope', [['game', 'Solo el juego'], ['page', 'Toda la página']], 'game', apply));
    },
  });
})();
