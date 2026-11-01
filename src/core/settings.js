// Panel de ajustes: Alt+N en cualquier momento, o el botón flotante del menú.
const sections = []; // { key, title, render(el) }
NX.settings = { section(s) { sections.push(s); } };

// Controles reutilizables. Cada uno lee y guarda su valor en NX.store.
NX.ui = {
  toggle(label, key, def, onChange) {
    const row = document.createElement('label');
    row.className = 'nx-row';
    row.innerHTML = `<span>${NX.esc(label)}</span><input type="checkbox">`;
    const inp = row.querySelector('input');
    inp.checked = !!NX.store.get(key, def);
    inp.addEventListener('change', () => { NX.store.set(key, inp.checked); if (onChange) onChange(inp.checked); });
    return row;
  },
  range(label, key, min, max, step, def, fmt, onChange) {
    const row = document.createElement('label');
    row.className = 'nx-row';
    row.innerHTML = `<span>${NX.esc(label)}</span><span class="nx-rng"><input type="range" min="${min}" max="${max}" step="${step}"><b></b></span>`;
    const inp = row.querySelector('input'), out = row.querySelector('b');
    inp.value = NX.store.get(key, def);
    out.textContent = fmt(+inp.value);
    inp.addEventListener('input', () => {
      const v = +inp.value;
      out.textContent = fmt(v);
      NX.store.set(key, v);
      if (onChange) onChange(v);
    });
    return row;
  },
  select(label, key, options, def, onChange) {
    const row = document.createElement('label');
    row.className = 'nx-row';
    row.innerHTML = `<span>${NX.esc(label)}</span><select>${options.map(([v, t]) => `<option value="${NX.esc(v)}">${NX.esc(t)}</option>`).join('')}</select>`;
    const sel = row.querySelector('select');
    sel.value = String(NX.store.get(key, def));
    sel.addEventListener('change', () => { NX.store.set(key, sel.value); if (onChange) onChange(sel.value); });
    return row;
  },
  button(label, onClick) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'nx-btn';
    b.textContent = label;
    b.addEventListener('click', onClick);
    return b;
  },
  note(text) {
    const p = document.createElement('p');
    p.className = 'nx-note';
    p.textContent = text;
    return p;
  },
};

NX.css(`#nexus-panel{position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;background:rgba(4,8,20,.55)}
#nexus-panel.hidden,#nexus-fab.hidden{display:none}
#nexus-panel .nx-box{width:min(560px,calc(100vw - 24px));max-height:calc(100vh - 40px);overflow:auto;box-sizing:border-box;padding:16px 18px;
  background:linear-gradient(#24407f,#152a5c);color:#fff;border:2px solid #f4f8ff;outline:2px solid #0b1838;border-radius:10px;
  box-shadow:inset 0 0 0 2px #5b83d6,0 6px 0 #0a1430;font:14px/1.35 var(--font,'Pixelify',system-ui,sans-serif)}
#nexus-panel h2{margin:0 0 4px;font-size:20px;color:#ffd23f;display:flex;justify-content:space-between;align-items:center}
#nexus-panel h3{margin:14px 0 6px;font-size:15px;color:#9fd0ff;display:flex;justify-content:space-between;align-items:center;gap:8px}
#nexus-panel .nx-close{background:#0b1838;color:#fff;border:2px solid #f4f8ff;border-radius:6px;font:inherit;cursor:pointer;padding:2px 10px}
#nexus-panel .nx-row{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:4px 0;cursor:pointer}
#nexus-panel .nx-rng{display:flex;align-items:center;gap:8px}#nexus-panel .nx-rng b{min-width:44px;text-align:right;color:#ffd23f}
#nexus-panel select{font:inherit;background:#0b1838;color:#fff;border:1px solid #5b83d6;border-radius:5px;padding:2px 6px}
#nexus-panel input[type=checkbox]{width:18px;height:18px;accent-color:#ffd23f}
#nexus-panel .nx-note{margin:2px 0 4px;font-size:12px;opacity:.75}
#nexus-panel .nx-st{font-size:12px;padding:1px 7px;border-radius:9px;background:#2fbf6a}
#nexus-panel .nx-st.pending{background:#5b6b88}#nexus-panel .nx-st.missing{background:#d98a1f}#nexus-panel .nx-st.broken{background:#d8344a}
#nexus-panel .nx-status{margin-top:14px;font-size:12px;opacity:.85}
#nexus-panel .nx-search{width:100%;box-sizing:border-box;margin:6px 0;font:inherit;background:#0b1838;color:#fff;border:1px solid #5b83d6;border-radius:6px;padding:5px 8px}
#nexus-panel .nx-tabs{display:flex;flex-wrap:wrap;gap:5px;margin:4px 0 2px}
#nexus-panel .nx-tabs button{font:inherit;font-size:12px;background:#0b1838;color:#cfe0ff;border:1px solid #5b83d6;border-radius:12px;padding:2px 10px;cursor:pointer}
#nexus-panel .nx-tabs button.on{background:#ffd23f;color:#0b1838;border-color:#ffd23f}
#nexus-panel .nx-btn{font:inherit;font-size:13px;background:#0b1838;color:#fff;border:2px solid #f4f8ff;border-radius:6px;cursor:pointer;padding:3px 10px;margin:4px 6px 4px 0}
#nexus-fab{position:fixed;left:12px;bottom:12px;z-index:9999;padding:6px 12px;border-radius:8px;cursor:pointer;
  background:#152a5c;color:#ffd23f;border:2px solid #f4f8ff;outline:2px solid #0b1838;font:13px var(--font,'Pixelify',system-ui,sans-serif)}`);

let panel = null, fab = null;
const STATUS_TXT = { ok: 'activo', pending: 'esperando', missing: 'falta', broken: 'roto' };

// Pestañas del panel, en orden. Una sección sin tab cae en "General".
const TABS = ['Cámara y mapa', 'HUD', 'Partida', 'Modos', 'Datos', 'Menús', 'Estilo', 'Rendimiento', 'General'];
const TAB_OF = { fov: 'Cámara y mapa', minimap: 'Cámara y mapa', sharp: 'Rendimiento', shortcuts: 'Partida', combat: 'Partida' };
const tabOf = (s) => s.tab || TAB_OF[s.key] || 'General';
let curTab = NX.store.get('panelTab', TABS[0]), query = '';

function renderPanel() {
  const box = panel.querySelector('.nx-box');
  const used = TABS.filter((t) => sections.some((s) => tabOf(s) === t));
  if (!used.includes(curTab)) curTab = used[0];
  box.innerHTML = `<h2>PokeSurvivor Nexus <button class="nx-close" type="button">Cerrar</button></h2>
    <p class="nx-note">v${NX.esc(NX.version)} · Alt+N abre y cierra este panel</p>
    <input class="nx-search" type="search" placeholder="Buscar ajuste…" value="${NX.esc(query)}">
    <div class="nx-tabs">${used.map((t) => `<button type="button" class="${t === curTab && !query ? 'on' : ''}">${NX.esc(t)}</button>`).join('')}</div>`;
  box.querySelector('.nx-close').addEventListener('click', togglePanel);
  box.querySelectorAll('.nx-tabs button').forEach((b) => b.addEventListener('click', () => {
    curTab = b.textContent; query = '';
    NX.store.set('panelTab', curTab);
    renderPanel();
  }));
  const search = box.querySelector('.nx-search');
  search.addEventListener('input', () => {
    query = search.value;
    renderPanel();
    const s2 = panel.querySelector('.nx-search');
    s2.focus();
    s2.setSelectionRange(s2.value.length, s2.value.length);
  });
  const q = query.trim().toLowerCase();
  const feats = new Map(NX.featureList().map((f) => [f.key, f]));
  const visible = sections.filter((s) => (q ? (s.title + ' ' + (s.keywords || '')).toLowerCase().includes(q) : tabOf(s) === curTab));
  if (!visible.length) box.appendChild(NX.ui.note('Ningún ajuste coincide con la búsqueda.'));
  for (const s of visible) {
    const f = feats.get(s.key);
    const h = document.createElement('h3');
    h.innerHTML = `<span>${NX.esc(s.title)}</span>`;
    if (f) {
      const st = document.createElement('span');
      st.className = 'nx-st ' + f.status;
      st.textContent = STATUS_TXT[f.status] || f.status;
      if (f.err) st.title = f.err;
      h.appendChild(st);
    }
    box.appendChild(h);
    const wrap = document.createElement('div');
    if (f && (f.status === 'broken' || f.status === 'missing')) {
      wrap.appendChild(NX.ui.note('Apagado por la red de seguridad: ' + (f.err || 'el juego cambió') + '.'));
    } else {
      try { s.render(wrap); } catch (err) { wrap.appendChild(NX.ui.note('No se pudo mostrar: ' + err.message)); }
    }
    box.appendChild(wrap);
  }
  const core = NX.featureList().filter((f) => !sections.some((s) => s.key === f.key));
  const st = document.createElement('div');
  st.className = 'nx-status';
  st.textContent = 'Núcleo: ' + (NX.ns ? 'enganchado al juego' : 'sin enganchar') + ' · ' +
    core.map((f) => `${f.label} ${STATUS_TXT[f.status] || f.status}`).join(' · ');
  box.appendChild(st);
}

function togglePanel() {
  if (!panel) return;
  const open = panel.classList.contains('hidden');
  if (open) renderPanel();
  panel.classList.toggle('hidden', !open);
}
NX.togglePanel = togglePanel;

NX.onReady(() => {
  panel = document.createElement('div');
  panel.id = 'nexus-panel';
  panel.className = 'hidden';
  panel.innerHTML = '<div class="nx-box"></div>';
  // Que los clics y teclas del panel no lleguen al juego.
  for (const ev of ['pointerdown', 'mousedown', 'touchstart', 'click', 'wheel']) panel.addEventListener(ev, (e) => e.stopPropagation());
  panel.addEventListener('keydown', (e) => { if (e.key !== 'Escape') e.stopPropagation(); });
  panel.addEventListener('click', (e) => { if (e.target === panel) togglePanel(); });
  document.body.appendChild(panel);

  fab = document.createElement('button');
  fab.id = 'nexus-fab';
  fab.type = 'button';
  fab.className = 'hidden';
  fab.textContent = 'Nexus';
  fab.title = 'Ajustes de PokeSurvivor Nexus (Alt+N)';
  fab.addEventListener('click', (e) => { e.stopPropagation(); togglePanel(); });
  document.body.appendChild(fab);
  // El botón solo se ve en el menú principal.
  setInterval(() => {
    const st = NX.ns && NX.ns.Game && NX.ns.Game.state;
    fab.classList.toggle('hidden', !(st === 'ui' && NX.shown('scr-menu')));
  }, 500);
});

NX.keys.bind((e) => e.altKey && e.code === 'KeyN', () => { togglePanel(); return true; });
NX.keys.bind((e) => e.key === 'Escape' && panel && !panel.classList.contains('hidden'), () => { togglePanel(); return true; });
