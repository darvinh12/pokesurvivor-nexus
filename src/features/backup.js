// Respaldo de Nexus: exporta e importa a un .json todas las claves de
// localStorage que empiezan por "nexus:" (ajustes, posiciones, notas,
// favoritos del comparador...). El guardado del juego no se lee ni se toca.
(() => {
  const KEY = 'backup';
  const FORMAT = 'pokesurvivor-nexus-backup';
  const VERSION = 1;
  const PREFIX = 'nexus:';
  const MAX_BYTES = 5 * 1024 * 1024, MAX_KEYS = 5000;

  function collect() {
    const data = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX)) data[k] = localStorage.getItem(k);
    }
    return data;
  }

  function exportNow() {
    const data = collect();
    const n = Object.keys(data).length;
    const payload = { format: FORMAT, version: VERSION, nexus: NX.version, exportedAt: new Date().toISOString(), count: n, data };
    const d = new Date(), p2 = (x) => String(x).padStart(2, '0');
    NX.download(`nexus-respaldo-${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}.json`, JSON.stringify(payload, null, 2), 'application/json');
    NX.toast(`Respaldo exportado · ${n} dato${n === 1 ? '' : 's'}`);
  }

  // Devuelve { data } o { error }. Rechaza el archivo completo ante cualquier
  // entrada dudosa: nada a medias.
  function validate(text) {
    if (text.length > MAX_BYTES) return { error: 'El archivo es demasiado grande para ser un respaldo de Nexus.' };
    let j;
    try { j = JSON.parse(text); } catch (_) { return { error: 'El archivo no es un JSON válido.' }; }
    if (!j || typeof j !== 'object' || j.format !== FORMAT) return { error: 'El archivo no es un respaldo de PokeSurvivor Nexus.' };
    if (typeof j.version !== 'number' || j.version > VERSION) return { error: 'El respaldo es de una versión más nueva de Nexus. Actualiza la extensión primero.' };
    if (!j.data || typeof j.data !== 'object' || Array.isArray(j.data)) return { error: 'El respaldo no trae datos.' };
    const keys = Object.keys(j.data);
    if (keys.length > MAX_KEYS) return { error: 'El respaldo trae demasiadas entradas.' };
    for (const k of keys) {
      const v = j.data[k];
      if (!k.startsWith(PREFIX) || k.length > 200) return { error: `Clave no permitida: "${k.slice(0, 60)}". Solo se aceptan claves de Nexus.` };
      if (typeof v !== 'string') return { error: `El valor de "${k.slice(0, 60)}" no es válido.` };
      try { JSON.parse(v); } catch (_) { return { error: `El valor de "${k.slice(0, 60)}" está dañado.` }; }
    }
    return { data: j.data, meta: j };
  }

  function confirmBox(title, html, okText) {
    return new Promise((resolve) => {
      const el = document.createElement('section');
      el.className = 'scr dim nx-dlg';
      el.style.zIndex = 100002;
      el.innerHTML = `<div class="box center" style="max-width:460px"><h3>${NX.esc(title)}</h3><p class="sub">${html}</p>
        <div class="row" style="justify-content:center"><button class="btn ghost" data-a="no" type="button">Cancelar</button>
        <button class="btn gold" data-a="yes" type="button">${NX.esc(okText)}</button></div></div>`;
      const key = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); done(false); } };
      const done = (v) => { el.remove(); removeEventListener('keydown', key, true); resolve(v); };
      el.addEventListener('click', (e) => {
        const a = e.target.closest('[data-a]');
        if (a) done(a.dataset.a === 'yes'); else if (e.target === el) done(false);
      });
      addEventListener('keydown', key, true);
      document.body.appendChild(el);
      el.querySelector('[data-a="yes"]').focus();
    });
  }

  async function importFile(file) {
    if (!file) return;
    let text = '';
    try { text = await file.text(); } catch (_) { NX.toast('No se pudo leer el archivo'); return; }
    const r = validate(text);
    if (r.error) { NX.toast(r.error); return; }
    const n = Object.keys(r.data).length, cur = Object.keys(collect()).length;
    const when = r.meta.exportedAt ? new Date(r.meta.exportedAt) : null;
    // El panel de Nexus se cierra para que Escape llegue al diálogo.
    const panel = document.getElementById('nexus-panel');
    if (panel && !panel.classList.contains('hidden') && NX.togglePanel) NX.togglePanel();
    const ok = await confirmBox('Importar respaldo',
      `El archivo trae <b>${n}</b> dato${n === 1 ? '' : 's'} de Nexus` +
      (when && !isNaN(when) ? ` del ${NX.esc(when.toLocaleString('es-VE'))}` : '') +
      (r.meta.nexus ? ` (versión ${NX.esc(String(r.meta.nexus).slice(0, 20))})` : '') +
      `. Reemplazará los ${cur} que tienes ahora. El guardado del juego no se toca. La página se recarga al terminar.`,
      'Importar y recargar');
    if (!ok) return;
    try {
      for (const k of Object.keys(collect())) localStorage.removeItem(k);
      for (const [k, v] of Object.entries(r.data)) localStorage.setItem(k, v);
    } catch (err) {
      NX.toast('No se pudo escribir el respaldo: ' + ((err && err.message) || 'almacenamiento lleno'));
      return;
    }
    NX.toast('Respaldo importado · recargando');
    setTimeout(() => location.reload(), 700);
  }

  NX.feature({ key: KEY, label: 'Respaldo de Nexus', early: true, setup() {} });

  NX.settings.section({
    key: KEY,
    tab: 'Datos',
    title: 'Respaldo de Nexus',
    keywords: 'exportar importar copia seguridad json ajustes backup',
    render(el) {
      const n = Object.keys(collect()).length;
      el.appendChild(NX.ui.note(`Guarda en un archivo todos los ajustes y datos de Nexus (${n} en este navegador) para pasarlos a otro equipo. No incluye tu partida: esa la guarda el juego.`));
      const file = document.createElement('input');
      file.type = 'file';
      file.accept = '.json,application/json';
      file.style.display = 'none';
      file.addEventListener('change', () => { const f = file.files && file.files[0]; file.value = ''; importFile(f); });
      el.appendChild(NX.ui.button('Exportar respaldo', exportNow));
      el.appendChild(NX.ui.button('Importar respaldo', () => file.click()));
      el.appendChild(file);
    },
  });
})();
