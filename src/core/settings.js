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
  // Botón que pide uno o más toques de confirmación antes de actuar.
  // steps: texto de cada confirmación, en orden.
  armed(label, steps, fn) {
    steps = Array.isArray(steps) ? steps : [steps];
    let stage = 0, t = 0;
    const b = NX.ui.button(label, () => {
      clearTimeout(t);
      if (stage < steps.length) {
        b.textContent = steps[stage++];
        b.classList.add('nx-armed');
        t = setTimeout(() => { stage = 0; b.textContent = label; b.classList.remove('nx-armed'); }, 5000);
        return;
      }
      stage = 0;
      b.textContent = label;
      b.classList.remove('nx-armed');
      fn();
    });
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
#nexus-panel .nx-btn.nx-armed{background:#d8344a;border-color:#ffd23f}
#nexus-panel .nx-btn:disabled{opacity:.45;cursor:default}
#nexus-panel h3 .nx-h3t{flex:1;min-width:0}
#nexus-panel .nx-fav{background:none;border:0;color:#7f9bd8;font:inherit;font-size:18px;line-height:1;cursor:pointer;padding:0 2px}
#nexus-panel .nx-fav.on{color:#ffd23f}
#nexus-panel .nx-reset{font-size:11px;padding:1px 8px;border-width:1px;opacity:.85;margin-top:6px}
#nexus-panel .nx-danger{border-color:#ff8a8a}
#nexus-fab{position:fixed;left:12px;bottom:12px;z-index:9999;padding:6px 12px;border-radius:8px;cursor:pointer;
  background:#152a5c;color:#ffd23f;border:2px solid #f4f8ff;outline:2px solid #0b1838;font:13px var(--font,'Pixelify',system-ui,sans-serif)}
#nexus-panel .nx-box{overscroll-behavior:contain;touch-action:pan-y;-webkit-overflow-scrolling:touch}
body:has(.scr.dim:not(.hidden)) #nexus-fab,body:has(.scr.dim:not(.hidden)) #nexus-ver{display:none}
@media (pointer:coarse),(max-width:700px),(max-height:500px){
#nexus-panel{align-items:flex-start;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)}
#nexus-panel .nx-box{width:min(620px,calc(100vw - 16px));max-height:calc(100vh - 16px);max-height:calc(100dvh - 16px);margin:8px auto;padding:0 12px 12px;font-size:15px}
#nexus-panel h2{position:sticky;top:0;z-index:2;margin:0 -12px 4px;padding:8px 12px;background:#1d3470;border-bottom:2px solid #5b83d6}
#nexus-panel .nx-close{min-height:40px;min-width:76px;font-size:15px}
#nexus-panel .nx-row{min-height:44px;padding:2px 0}
#nexus-panel .nx-row>span:first-child{flex:1;min-width:0}
#nexus-panel input[type=checkbox]{width:26px;height:26px;flex:none}
#nexus-panel input[type=range]{width:min(42vw,200px);min-height:28px}
#nexus-panel select{min-height:40px;max-width:52vw;font-size:15px}
#nexus-panel .nx-search{min-height:42px;font-size:16px}
#nexus-panel .nx-tabs{flex-wrap:nowrap;overflow-x:auto;padding-bottom:4px;scrollbar-width:thin;touch-action:pan-x}
#nexus-panel .nx-tabs button{flex:none;min-height:40px;padding:4px 14px;font-size:14px;border-radius:20px}
#nexus-panel .nx-btn{min-height:40px;padding:6px 14px;font-size:14px}
#nexus-panel h3 .nx-close,#nexus-panel .nx-box button{min-height:40px}
#nexus-panel .nx-fav{min-width:40px;font-size:22px}
#nexus-panel .nx-reset{font-size:13px;padding:4px 12px}
#nexus-panel .nx-note{font-size:13px}
#nexus-fab{min-height:40px;padding:8px 16px;font-size:15px;left:calc(12px + env(safe-area-inset-left,0px));bottom:calc(12px + env(safe-area-inset-bottom,0px))}}`);

// Orden del panel (edición 0.6): cabecera con buscador, pestañas a la izquierda
// en la PC y deslizables arriba en el teléfono, y solo el cuerpo se desplaza.
NX.css(`#nexus-panel .nx-head{display:grid;grid-template-columns:auto minmax(0,1fr) auto;grid-template-areas:"t s c" "v v v";align-items:center;column-gap:12px}
#nexus-panel .nx-head h2{grid-area:t;margin:0;white-space:nowrap;display:block}
#nexus-panel .nx-head .nx-search{grid-area:s;margin:0}
#nexus-panel .nx-head .nx-close{grid-area:c}
#nexus-panel .nx-head .nx-ver{grid-area:v;margin:6px 0 0}
#nexus-panel .nx-note{opacity:1;color:#c3d4f5;font-size:13px}
#nexus-panel .nx-status{opacity:1;color:#c3d4f5}
#nexus-panel .nx-reset{font-size:12px;padding:2px 10px;opacity:1;color:#d6e2fb;border-color:rgba(244,248,255,.5)}
#nexus-panel .nx-reset:disabled{opacity:.5}
#nexus-panel h3{margin-top:16px}
#nexus-panel .nx-sec{padding-bottom:4px}
#nexus-panel .nx-tabs button:focus-visible,#nexus-panel .nx-btn:focus-visible,#nexus-panel .nx-close:focus-visible,#nexus-panel .nx-fav:focus-visible{outline:2px solid #ffd23f;outline-offset:2px}
@media (min-width:900px) and (min-height:521px) and (pointer:fine){
#nexus-panel .nx-box{width:min(900px,calc(100vw - 48px));height:min(820px,calc(100vh - 60px));max-height:none;overflow:hidden;padding:0;
  display:grid;grid-template-columns:180px minmax(0,1fr);grid-template-rows:auto minmax(0,1fr)}
#nexus-panel .nx-head{grid-column:1/-1;padding:14px 18px 10px;border-bottom:2px solid rgba(91,131,214,.55)}
#nexus-panel .nx-tabs{flex-direction:column;flex-wrap:nowrap;gap:4px;margin:0;padding:12px 10px 12px 14px;overflow-y:auto;border-right:2px solid rgba(91,131,214,.35)}
#nexus-panel .nx-tabs button{text-align:left;border-radius:8px;padding:7px 12px;font-size:14px;border-color:transparent;background:transparent}
#nexus-panel .nx-tabs button:hover{background:rgba(255,255,255,.07)}
#nexus-panel .nx-tabs button.on{background:#ffd23f;color:#0b1838;border-color:#ffd23f}
#nexus-panel .nx-body{overflow-y:auto;overscroll-behavior:contain;padding:2px 18px 14px 18px;min-width:0}}
@media (pointer:coarse),(max-width:899px),(max-height:520px){
#nexus-panel .nx-head{position:sticky;top:0;z-index:3;margin:0 -12px;padding:0 12px;height:60px;box-sizing:border-box;background:#1d3470;grid-template-areas:"t s c"}
#nexus-panel .nx-head h2{position:static;margin:0;padding:0;background:none;border:0}
#nexus-panel .nx-head .nx-ver{display:none}
#nexus-panel .nx-tabs{position:sticky;top:60px;z-index:2;margin:0 -12px 2px;padding:4px 12px 6px;background:#1d3470;border-bottom:2px solid #5b83d6}}
@media (max-width:620px){#nexus-panel .nx-ttl-long{display:none}}`);

let panel = null, fab = null;
const STATUS_TXT = { ok: 'activo', pending: 'esperando', missing: 'falta', broken: 'roto' };

// Pestañas del panel, en orden. Una sección sin tab cae en "General".
const FAV_TAB = 'Favoritos';
const TABS = [FAV_TAB, 'Cámara y mapa', 'HUD', 'Partida', 'Modos', 'Datos', 'Menús', 'Estilo', 'Rendimiento', 'General'];
const TAB_OF = { fov: 'Cámara y mapa', minimap: 'Cámara y mapa', sharp: 'Rendimiento', shortcuts: 'Partida', combat: 'Partida' };
const tabOf = (s) => s.tab || TAB_OF[s.key] || 'General';
let curTab = NX.store.get('panelTab', TABS[1]), query = '';

// Favoritos: claves de sección marcadas con la estrella, en el orden en que se marcaron.
const favs = () => { const f = NX.store.get('panelFavs', []); return Array.isArray(f) ? f : []; };
const toggleFav = (key) => {
  const f = favs().slice(), i = f.indexOf(key);
  if (i >= 0) f.splice(i, 1); else f.push(key);
  NX.store.set('panelFavs', f);
};

// Restablecer. Las claves de NX.store de cada sección salen de lo que la
// sección declare (keys: exactas, prefix: prefijos) o de esta tabla; si no
// aparece, del prefijo "clave:" y la clave sola. Siempre suma on:clave.
// En la tabla, "=x" es una clave exacta y "x:" un prefijo. Los datos
// (historial, récords, retos, jardín, notas, instantáneas) no se borran con
// el restablecer de una sección, solo con "Restablecer todo Nexus".
const RESET = {
  alerts: ['alerts:'], biomes: ['biome:'], bossplate: ['bossplate:'], clockpanel: ['clockpanel:'], hudcolors: ['hudcolors:'],
  rush: ['rush:'], breakables: ['brk:'], 'build-center': ['bc:'], build: ['build:'], 'build-evo': [], lab: ['lab:', 'pos:lab:'],
  coll: ['coll:'], collision: ['coll2:'], colorblind: ['cb:'], combat: ['=bossTimer', '=lowhp', '=magnet'], companion: ['pkm:comp:'],
  curses: ['curses:', '=prog:pill'], daily: ['daily:'], meter: ['meter:', '=tabview'], dex: ['dex:'], dynamax: ['pkm:dmax:'],
  edgearrows: ['arrows:'], enc: ['enc:'], endless: ['endless:'], fov: ['=fov'], fps: ['fps:'], fx: ['fx:'], gcalc: ['gcalc:'],
  gacha: ['gacha:'], garden: ['garden:'], hitboxes: ['hitbox:'], hudnew: ['hudnew:'], hudscale: ['hudscale:'], hudth: ['hudth:'],
  mapint: ['mapint:'], maplook: ['look:'], maps: ['maps:'], mega: ['pkm:mega:'], minimap: ['map:', '=mapPos', '=mapShown', '=mapSize'],
  mobile: ['mobile:'], modes: ['=modes:tab'], mods: ['mods:'], music: ['music:'], offclean: ['offclean:'], pickups: ['pick:'],
  pokemech: ['=pkm:hudBtns', '=pkm:hudSide'], qolmap: ['qolmap:'], qol: ['qol:'], raids: ['pkm:raid:'], rebind: ['rebind:'],
  rbuilds: ['rb:', '=pos:rb'], rbcards: [], runcards: ['runcards:'], sfilter: ['sfilter:'], sharp: ['=fps', '=pixel', '=res'],
  shop: ['shop:'], tera: ['pkm:tera:'], terrains: ['terrain:'], theme: ['theme:'], tiers: ['tiers:'], tips: ['tips:'], zmove: ['pkm:z:'],
  hist: ['hist:'], 'hist:autopsy': [], profiles: ['prof:'], perfmon: ['perf:'], tierlist: ['tl:'], tele: [], backup: [], cleancap: [], limitbreak: [], qoloff: [], shortcuts: [], upg: [], verbadge: [],
};
const KEEP_DATA = new Set(['tele:runs', 'secrets:v1', 'garden:v1', 'endless:rec', 'endless:hist', 'rush:best', 'rush:hist', 'maps:best',
  'daily:rec', 'mods:rank', 'dex:notes', 'runcards:stats', 'modes:snap', 'qol:live', 'qol:interrupted', 'qol:last', 'qol:breakState', 'music:slots']);
function resetKeys(s, all = NX.store.keys()) {
  let rules = s.keys || s.prefix ? [...(s.keys || []).map((k) => '=' + k), ...[].concat(s.prefix || [])]
    : RESET[s.key] || [s.key + ':', '=' + s.key];
  rules = rules.concat('=on:' + s.key);
  return all.filter((k) => !KEEP_DATA.has(k) && rules.some((r) => (r[0] === '=' ? k === r.slice(1) : k.startsWith(r))));
}
NX.settings.resetKeys = (key) => { const s = sections.find((x) => x.key === key); return s ? resetKeys(s) : []; };
NX.settings.reset = (key) => { const ks = NX.settings.resetKeys(key); for (const k of ks) NX.store.remove(k); return ks.length; };
// Borra todo lo de Nexus en este dispositivo (no el guardado del juego).
NX.settings.resetAll = async () => {
  const ks = NX.store.keys();
  for (const k of ks) NX.store.remove(k);
  NX.store.reset();
  NX.store.flushMeta();
  // Con la sincronización activa, el borrado sube antes de recargar.
  if (NX.sync && NX.sync.flush) {
    try { await Promise.race([NX.sync.flush(), new Promise((r) => setTimeout(r, 6000))]); } catch (_) { /* se sube en la próxima vuelta */ }
  }
  return ks.length;
};

function renderPanel() {
  const box = panel.querySelector('.nx-box');
  const fv = favs();
  const used = TABS.filter((t) => t === FAV_TAB || sections.some((s) => tabOf(s) === t));
  if (!used.includes(curTab)) curTab = used[0];
  // Al volver a dibujar la misma vista (estrella, restablecer) se conserva el desplazamiento.
  const view = curTab + '|' + query, prevBody = box.querySelector('.nx-body');
  const keepTop = prevBody && box.dataset.view === view ? prevBody.scrollTop : 0, keepBox = box.dataset.view === view ? box.scrollTop : 0;
  box.dataset.view = view;
  box.innerHTML = `<div class="nx-head"><h2><span class="nx-ttl-long">PokeSurvivor </span>Nexus</h2>
    <input class="nx-search" type="search" placeholder="Buscar ajuste…" aria-label="Buscar ajuste" value="${NX.esc(query)}">
    <button class="nx-close" type="button">Cerrar</button>
    <p class="nx-note nx-ver">v${NX.esc(NX.version)} · Alt+N abre y cierra este panel</p></div>
    <div class="nx-tabs" role="tablist">${used.map((t) => `<button type="button" role="tab" aria-selected="${t === curTab && !query}" class="${t === curTab && !query ? 'on' : ''}">${NX.esc(t)}</button>`).join('')}</div>
    <div class="nx-body"></div>`;
  const body = box.querySelector('.nx-body');
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
  const visible = q ? sections.filter((s) => (s.title + ' ' + (s.keywords || '')).toLowerCase().includes(q))
    : curTab === FAV_TAB ? fv.map((k) => sections.find((s) => s.key === k)).filter(Boolean)
      : sections.filter((s) => tabOf(s) === curTab);
  if (!visible.length) {
    body.appendChild(NX.ui.note(q ? 'Ningún ajuste coincide con la búsqueda.'
      : 'Todavía no tienes favoritos. Toca la estrella junto al título de una sección para tenerla aquí.'));
  }
  const allKeys = NX.store.keys();
  for (const s of visible) {
    const f = feats.get(s.key);
    const h = document.createElement('h3');
    const isFav = fv.includes(s.key);
    h.innerHTML = `<button type="button" class="nx-fav${isFav ? ' on' : ''}" aria-pressed="${isFav}" title="${isFav ? 'Quitar de favoritos' : 'Agregar a favoritos'}">${isFav ? '★' : '☆'}</button><span class="nx-h3t">${NX.esc(s.title)}</span>`;
    h.querySelector('.nx-fav').addEventListener('click', () => { toggleFav(s.key); renderPanel(); });
    // El estado solo se muestra cuando algo no va bien.
    if (f && f.status !== 'ok') {
      const st = document.createElement('span');
      st.className = 'nx-st ' + f.status;
      st.textContent = STATUS_TXT[f.status] || f.status;
      if (f.err) st.title = f.err;
      h.appendChild(st);
    }
    body.appendChild(h);
    const wrap = document.createElement('div');
    wrap.className = 'nx-sec';
    if (f && (f.status === 'broken' || f.status === 'missing')) {
      wrap.appendChild(NX.ui.note('Apagado por la red de seguridad: ' + (f.err || 'el juego cambió') + '.'));
    } else {
      try { s.render(wrap); } catch (err) { wrap.appendChild(NX.ui.note('No se pudo mostrar: ' + err.message)); }
    }
    if (!s.noReset) {
      const n = resetKeys(s, allKeys).length;
      const rb = NX.ui.armed('Restablecer', '¿Restablecer esta sección? Toca otra vez', () => {
        const done = NX.settings.reset(s.key);
        NX.toast(done ? `${s.title}: de fábrica (${done} ajuste${done === 1 ? '' : 's'}) · algunos cambios se ven al recargar` : `${s.title} ya estaba de fábrica`);
        renderPanel();
      });
      rb.classList.add('nx-reset');
      rb.dataset.reset = s.key;
      rb.title = n ? `Vuelve a los valores de fábrica (${n} guardado${n === 1 ? '' : 's'}). Los récords y el historial se conservan.` : 'Ya está con los valores de fábrica';
      if (!n) rb.disabled = true;
      wrap.appendChild(rb);
    }
    body.appendChild(wrap);
  }
  const core = NX.featureList().filter((f) => !sections.some((s) => s.key === f.key));
  const st = document.createElement('div');
  st.className = 'nx-status';
  st.textContent = 'Núcleo: ' + (NX.ns ? 'enganchado al juego' : 'sin enganchar') + ' · ' +
    core.map((f) => `${f.label} ${STATUS_TXT[f.status] || f.status}`).join(' · ') + ' · v' + NX.version;
  body.appendChild(st);
  if (keepTop) body.scrollTop = keepTop;
  if (keepBox) box.scrollTop = keepBox;
}

NX.settings.section({
  key: 'nexus-reset',
  tab: 'Datos',
  title: 'Restablecer todo Nexus',
  keywords: 'restablecer borrar todo fábrica limpiar reiniciar datos',
  noReset: true,
  render(el) {
    const n = NX.store.keys().length;
    el.appendChild(NX.ui.note(`Borra los ${n} datos de Nexus de este dispositivo: ajustes, posiciones, historial, récords, retos, jardín y notas. ` +
      'El guardado del juego (Pokémon, monedas, progreso) no se toca. Si la sincronización está activa, el borrado también llega a la nube y a tus otros dispositivos. ' +
      'Conviene exportar un respaldo antes. La página se recarga al terminar.'));
    const b = NX.ui.armed('Restablecer todo Nexus', ['¿Borrar todos los datos de Nexus? Toca otra vez', 'Última confirmación: borrar y recargar'], async () => {
      b.disabled = true;
      const done = await NX.settings.resetAll();
      NX.toast(`Nexus restablecido (${done} datos) · recargando`);
      setTimeout(() => location.reload(), 700);
    });
    b.classList.add('nx-danger', 'nx-reset-all');
    el.appendChild(b);
  },
});

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
