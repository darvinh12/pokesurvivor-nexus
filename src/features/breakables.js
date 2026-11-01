// Romper objetos sin enemigos cerca. El ataque automático del juego apunta
// así: enemigo pegado, jefe a menos de 330 px, el enemigo más cercano a menos
// de 520 px y, solo si no hay ninguno, un objeto rompible a menos de 200 px.
// Con un enemigo lejano en pantalla nunca rompe nada, y los objetos un poco
// lejos tampoco cuentan. Este módulo:
// - amplía el radio de búsqueda de objetos rompibles (World.nearestBreakable);
// - cuando el enemigo más cercano está más lejos que la distancia elegida y
//   hay un objeto rompible más cerca, apunta al objeto. Envuelve la consulta
//   de 520 px de Projectiles.nearest que hace el jugador; las demás consultas
//   quedan igual.
(() => {
  const KEY = 'breakables';
  const PLAYER_QUERY = 520; // radio con el que el jugador busca al enemigo más cercano

  NX.feature({
    key: KEY,
    label: 'Romper objetos sin enemigos cerca',
    needs: (ns) => ns.World && typeof ns.World.nearestBreakable === 'function' && ns.Projectiles && typeof ns.Projectiles.nearest === 'function',
    setup(ns) {
      const W = ns.World, P = ns.Projectiles;
      const origBreak = W.nearestBreakable, origNear = P.nearest;
      const range = () => NX.clamp(+NX.store.get('brk:range', 380) || 380, 120, 600);
      const prefer = () => NX.clamp(+NX.store.get('brk:prefer', 300) || 0, 0, PLAYER_QUERY);

      W.nearestBreakable = function (x, y, r) {
        if (!NX.isOn(KEY)) return origBreak.apply(this, arguments);
        return origBreak.call(this, x, y, Math.max(r || 0, range()));
      };

      P.nearest = function (list, x, y, r) {
        const res = origNear.apply(this, arguments);
        if (r !== PLAYER_QUERY || !NX.isOn(KEY) || !NX.inRun()) return res;
        const me = NX.me();
        if (!me || me.x !== x || me.y !== y) return res; // solo la consulta del jugador local
        const far = !res || Math.hypot(res.x - x, res.y - y) > prefer();
        if (!far) return res;
        let prop = null;
        try { prop = origBreak.call(W, x, y, range()); } catch (_) { prop = null; }
        if (!prop) return res;
        if (res && Math.hypot(res.x - x, res.y - y) <= Math.hypot(prop.x - x, prop.y - y)) return res;
        return prop;
      };
    },
  });

  NX.settings.section({
    key: KEY,
    tab: 'Partida',
    title: 'Romper objetos sin enemigos cerca',
    keywords: 'romper objetos rocas cajas cofres autoataque apuntar',
    render(el) {
      el.appendChild(NX.ui.toggle('Activado', 'on:' + KEY, true));
      el.appendChild(NX.ui.range('Alcance para buscar objetos', 'brk:range', 120, 600, 20, 380, (v) => v + ' px'));
      el.appendChild(NX.ui.range('Prefiere el objeto si el enemigo está a más de', 'brk:prefer', 0, 520, 20, 300, (v) => (v ? v + ' px' : 'solo si está más cerca')));
      el.appendChild(NX.ui.note('El juego solo rompe objetos a menos de 200 px y si no hay ningún enemigo a 520 px. Esto amplía el alcance y apunta al objeto cuando los enemigos están lejos. Los ataques de contacto siguen necesitando acercarse.'));
    },
  });
})();
