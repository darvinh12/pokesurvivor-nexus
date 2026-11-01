// Indicadores de combate: radio del imán, viñeta roja con vida baja y cuenta
// regresiva al próximo jefe o al Juicio.
(() => {
  const KEY = 'combat';
  const PLAYING = new Set(['playing', 'held', 'levelup', 'choice']);
  const fmt = (s) => { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

  NX.css(`#nexus-lowhp{position:fixed;inset:0;z-index:9990;pointer-events:none;opacity:0;transition:opacity .25s;
  box-shadow:inset 0 0 22vmin 5vmin rgba(205,15,35,.6),inset 0 0 6vmin 1vmin rgba(160,5,25,.5)}
#nexus-lowhp.on{animation:nxLowHp 1.6s ease-in-out infinite}
@keyframes nxLowHp{0%,100%{filter:brightness(.85)}50%{filter:brightness(1.25)}}
@media (prefers-reduced-motion:reduce){#nexus-lowhp.on{animation:none}}
#nexus-boss{position:fixed;left:50%;top:52px;transform:translateX(-50%);z-index:9991;pointer-events:none;padding:3px 12px;border-radius:12px;
  background:rgba(12,20,44,.82);color:#fff;border:2px solid #ff5f6d;font:13px/1.3 var(--font,'Pixelify',system-ui,sans-serif);white-space:nowrap}
#nexus-boss.judge{border-color:#c47bff}#nexus-boss.soon{color:#ffd23f}#nexus-boss.hidden{display:none}`);

  // Siguiente jefe o Juicio según el reloj de la partida.
  function nextThreat(ns) {
    const t = ns.Game.st && ns.Game.st.time;
    if (typeof t !== 'number') return null;
    let best = null;
    const B = ns.Enemies && ns.Enemies.BOSSES;
    if (Array.isArray(B)) for (const b of B) if (b && typeof b.at === 'number' && b.at > t && (!best || b.at < best.at)) best = { at: b.at, judge: false };
    const J = ns.Judgment && ns.Judgment.AT;
    if (typeof J === 'number' && J > t && J < 1e8 && (!best || J < best.at)) best = { at: J, judge: true };
    return best && { in: best.at - t, judge: best.judge };
  }

  NX.feature({
    key: KEY,
    label: 'Indicadores de combate',
    needs: (ns) => ns.Game && ns.Camera && ns.Camera.left && 'scale' in ns.Camera,
    setup(ns) {
      // Radio del imán, debajo del HUD.
      NX.hudLayers.push({
        key: KEY,
        under(ctx) {
          if (!NX.store.get('magnet', true) || ns.Game.state !== 'playing') return;
          const p = NX.me();
          if (!p || p.dead || !(p.magnet > 0)) return;
          const [x, y] = NX.toScreen(p.x, p.y);
          ctx.beginPath();
          ctx.arc(x, y, p.magnet * ns.Camera.scale, 0, Math.PI * 2);
          ctx.setLineDash([6, 6]);
          ctx.lineWidth = 1.5;
          ctx.strokeStyle = 'rgba(127,224,255,.45)';
          ctx.stroke();
        },
      });

      NX.onReady(() => {
        const glow = document.createElement('div');
        glow.id = 'nexus-lowhp';
        document.body.appendChild(glow);
        const pill = document.createElement('div');
        pill.id = 'nexus-boss';
        pill.className = 'hidden';
        document.body.appendChild(pill);
        const loop = () => {
          try {
            const on = NX.isOn(KEY), p = NX.me(), st = ns.Game.state;
            const live = on && p && PLAYING.has(st) && !p.dead;
            // Viñeta con vida baja.
            let o = 0;
            const lim = (+NX.store.get('lowhp', 25) || 0) / 100;
            if (live && lim > 0 && p.maxHp > 0) {
              const f = Math.max(0, p.hp) / p.maxHp;
              if (f < lim) o = 0.7 + 0.3 * (1 - f / lim);
            }
            glow.style.opacity = o ? o.toFixed(2) : '0';
            glow.classList.toggle('on', o > 0);
            // Cuenta regresiva.
            const th = live && NX.store.get('bossTimer', true) ? nextThreat(ns) : null;
            pill.classList.toggle('hidden', !th);
            if (th) {
              pill.textContent = (th.judge ? 'Juicio en ' : 'Jefe en ') + fmt(th.in);
              pill.classList.toggle('judge', th.judge);
              pill.classList.toggle('soon', th.in <= 20);
              // Justo debajo del panel de reloj cuando está a la vista (crece con la escala del HUD).
              const clk = document.getElementById('nexus-clock');
              const top = clk && clk.offsetParent !== null ? Math.round(clk.getBoundingClientRect().bottom + 4) + 'px' : '';
              if (pill.style.top !== top) pill.style.top = top;
            }
          } catch (err) { NX.trip(KEY, err); }
        };
        NX.every(100, loop, { when: 'run', key: KEY, leave: true });
      });
    },
  });

  NX.settings.section({
    key: KEY,
    title: 'Indicadores de combate',
    render(el) {
      el.appendChild(NX.ui.toggle('Activado', 'on:' + KEY, true));
      el.appendChild(NX.ui.toggle('Radio del imán de experiencia', 'magnet', true));
      el.appendChild(NX.ui.toggle('Cuenta regresiva al próximo jefe', 'bossTimer', true));
      el.appendChild(NX.ui.range('Alerta de vida baja', 'lowhp', 0, 50, 5, 25, (v) => (v ? v + ' %' : 'apagada')));
    },
  });
})();
