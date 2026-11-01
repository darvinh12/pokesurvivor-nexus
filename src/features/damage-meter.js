// Medidor de daño: mantén Tab en partida para ver el daño total, el DPS y el
// desglose por movimiento del jugador local. Puede quedarse fijo y arrastrable.
// Lee todo de NX.telemetry (telemetry.js), que se evalúa después de este
// archivo, así que se accede a él solo dentro de needs y setup.
// Estilo del panel adaptado de PokeSurvivor Plus (MIT).
(() => {
  const KEY = 'meter';
  const MAX_ROWS = 8;
  let el = null, body = null, held = false, lastHtml = '';

  NX.css(`#nexus-meter{position:fixed;z-index:9997;width:260px;box-sizing:border-box;padding:6px 8px 8px;color:#fff;
  font:13px/1.25 var(--font,'Pixelify',system-ui,sans-serif);background:linear-gradient(#2c519f,#1a3170);border:2px solid #f4f8ff;
  outline:2px solid #0b1838;border-radius:8px;box-shadow:inset 0 0 0 2px #5b83d6,0 4px 0 #0a1430;user-select:none;pointer-events:none}
#nexus-meter.nx-pin{pointer-events:auto}
#nexus-meter.hidden{display:none}
#nexus-meter .nx-mh{display:flex;justify-content:space-between;align-items:baseline;font-weight:700;letter-spacing:.05em}
#nexus-meter .nx-mh b{color:#ffd23f}#nexus-meter .nx-mh span{color:#b9cbf0;font-weight:600}
#nexus-meter .nx-mt{display:grid;grid-template-columns:repeat(3,1fr);gap:4px;margin:5px 0}
#nexus-meter .nx-mt div{background:#0b1838;border-radius:5px;padding:3px 5px}
#nexus-meter .nx-mt small{display:block;font-size:10.5px;color:#b9cbf0}
#nexus-meter .nx-mt b{font-size:14px}
#nexus-meter .nx-mr{position:relative;margin:2px 0;padding:2px 6px;border-radius:4px;background:#0b1838;overflow:hidden}
#nexus-meter .nx-mr i{position:absolute;inset:0 auto 0 0;background:#ffd23f;opacity:.28}
#nexus-meter .nx-mr p{position:relative;margin:0;display:flex;gap:6px;font-size:12px}
#nexus-meter .nx-mr p span:first-child{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#nexus-meter .nx-mr p span:last-child{min-width:34px;text-align:right;color:#b9cbf0}
#nexus-meter .nx-mf{margin-top:5px;font-size:11.5px;color:#b9cbf0;display:flex;justify-content:space-between}
#nexus-meter .nx-me{font-size:12px;color:#b9cbf0;padding:4px 0}`);

  const fmt = (n) => {
    n = +n || 0;
    if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e4) return (n / 1e3).toFixed(1) + 'k';
    return String(Math.round(n));
  };

  function render() {
    const pin = !!NX.store.get('meter:pin', false);
    const vis = NX.isOn(KEY) && (held || pin) && NX.inRun() && !NX.shown('scr-settings') && !NX.shown('nexus-panel') && !NX.shown('nexus-hist');
    el.classList.toggle('hidden', !vis);
    el.classList.toggle('nx-pin', pin);
    if (!vis) return;
    const s = NX.telemetry && NX.telemetry.current();
    let html;
    if (!s) html = '<div class="nx-me">Esperando datos de la partida…</div>';
    else {
      const top = s.moves.length ? s.moves[0].dmg : 1;
      const rows = s.moves.slice(0, MAX_ROWS).map((m) =>
        `<div class="nx-mr"><i style="width:${((m.dmg / Math.max(1, top)) * 100).toFixed(1)}%"></i><p><span>${NX.esc(m.name)}</span><span>${fmt(m.dmg)}</span><span>${Math.round(m.pct * 100)}%</span></p></div>`).join('');
      const foot = NX.store.get('meter:taken', true)
        ? `<div class="nx-mf"><span>Recibido ${fmt(s.taken)}</span><span>Bajas ${fmt(s.kills)}</span></div>` : '';
      html = `<div class="nx-mh"><b>DAÑO</b><span>${NX.fmtTime(s.time)}</span></div>
        <div class="nx-mt"><div><small>Total</small><b>${fmt(s.dmg)}</b></div><div><small>DPS</small><b>${fmt(s.dps)}</b></div><div><small>Últimos 10 s</small><b>${fmt(s.dps10)}</b></div></div>
        ${rows || '<div class="nx-me">Todavía no has hecho daño</div>'}${foot}`;
    }
    if (html !== lastHtml) { body.innerHTML = html; lastHtml = html; }
  }

  NX.feature({
    key: KEY,
    label: 'Medidor de daño',
    needs: () => !!NX.telemetry,
    setup() {
      NX.onReady(() => {
        el = document.createElement('div');
        el.id = 'nexus-meter';
        el.className = 'hidden';
        el.title = 'Arrastra para mover';
        el.innerHTML = '<div></div>';
        body = el.firstChild;
        document.body.appendChild(el);
        for (const ev of ['pointerdown', 'mousedown', 'touchstart', 'click']) el.addEventListener(ev, (e) => e.stopPropagation());
        drag = NX.draggable(el, 'meter', () => ({ x: 12, y: 150 }));
        setInterval(() => { try { render(); } catch (err) { NX.trip(KEY, err); } }, 200);
      });

      // Tab mantenido: se traga la tecla para que el navegador no mueva el foco.
      NX.keys.bind(
        (e) => e.code === 'Tab' && !e.altKey && !e.ctrlKey && !e.metaKey && NX.inRun() && NX.isOn(KEY),
        () => { if (!held) { held = true; if (el) render(); } return true; },
      );
      addEventListener('keyup', (e) => {
        if (e.code !== 'Tab' || !held) return;
        held = false;
        e.preventDefault();
        if (el) render();
      }, true);
      addEventListener('blur', () => { held = false; });
    },
  });
  let drag = null;

  NX.settings.section({
    key: KEY,
    tab: 'HUD',
    title: 'Medidor de daño',
    keywords: 'dps tab daño movimientos',
    render(wrap) {
      wrap.appendChild(NX.ui.toggle('Activado', 'on:' + KEY, true));
      wrap.appendChild(NX.ui.note('Mantén Tab en partida para ver tu daño total, el DPS y el daño de cada movimiento.'));
      wrap.appendChild(NX.ui.toggle('Dejarlo fijo en pantalla (arrastrable)', 'meter:pin', false));
      wrap.appendChild(NX.ui.toggle('Mostrar daño recibido y bajas', 'meter:taken', true));
      wrap.appendChild(NX.ui.button('Restablecer posición', () => { if (drag) drag.reset(); }));
    },
  });
})();
