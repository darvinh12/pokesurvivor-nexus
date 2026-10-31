// Atajos extra. El juego ya trae 1/2/3 y R al subir de nivel y 1/2 en
// objetos. Aquí se cubren las pantallas que no tienen: el vínculo (1 a 9 y
// Retroceso para "Atrás") y el fin de partida (Enter).
// Como respaldo seguro, la tecla se deja pasar primero al juego y solo se
// actúa si la pantalla sigue igual en el siguiente tick, así nunca se elige
// dos veces aunque una versión futura del juego agregue sus propios atajos.
(() => {
  const KEY = 'shortcuts';
  const visibleCards = (boxId) => {
    const box = document.getElementById(boxId);
    if (!box || box.classList.contains('done')) return [];
    return [...box.querySelectorAll('.card')].filter((c) => c.offsetParent !== null && !c.classList.contains('disabled'));
  };
  const later = (screenId, fn) => {
    const before = document.getElementById(screenId);
    const sig = before ? before.innerHTML.length : -1;
    setTimeout(() => {
      const now = document.getElementById(screenId);
      if (NX.shown(screenId) && now && now.innerHTML.length === sig) fn();
    }, 0);
  };

  NX.feature({
    key: KEY,
    label: 'Atajos extra',
    setup() {
      NX.keys.bind((e) => NX.isOn(KEY) && !e.altKey && !e.ctrlKey && /^Digit[1-9]$/.test(e.code) && NX.shown('scr-bond'), (e) => {
        const n = +e.code.slice(5) - 1;
        later('scr-bond', () => { const c = visibleCards('bond-cards')[n]; if (c) c.click(); });
      });
      NX.keys.bind((e) => NX.isOn(KEY) && e.key === 'Backspace' && NX.shown('scr-bond'), () => {
        later('scr-bond', () => { const b = document.getElementById('bond-back'); if (b && !b.classList.contains('hidden')) b.click(); });
      });
      NX.keys.bind((e) => NX.isOn(KEY) && e.key === 'Enter' && NX.shown('scr-over'), () => {
        const a = document.activeElement;
        if (a && a.tagName === 'BUTTON' && document.getElementById('scr-over').contains(a)) return; // Enter nativo
        later('scr-over', () => { const b = document.getElementById('btn-again'); if (b) b.click(); });
      });
      NX.css('#scr-bond .card{position:relative}#scr-bond .nx-kbd{position:absolute;right:6px;top:4px;font-size:11px;opacity:.7;padding:0 5px;border:1px solid currentColor;border-radius:4px}');
      // Etiqueta 1, 2, 3... en las cartas de vínculo para que el atajo se descubra solo.
      setInterval(() => {
        if (!NX.isOn(KEY) || !NX.shown('scr-bond')) return;
        visibleCards('bond-cards').forEach((c, i) => {
          if (i < 9 && !c.querySelector('.nx-kbd')) c.insertAdjacentHTML('beforeend', `<span class="nx-kbd">${i + 1}</span>`);
        });
      }, 200);
    },
  });

  NX.settings.section({
    key: KEY,
    title: 'Atajos extra',
    render(el) {
      el.appendChild(NX.ui.toggle('Activado', 'on:' + KEY, true));
      el.appendChild(NX.ui.note('Vínculo: 1 a 9 para elegir y Retroceso para volver. Fin de partida: Enter para continuar.'));
    },
  });
})();
