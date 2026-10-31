// PokeSurvivor Nexus, cascarón.
// Descarga el mod desde GitHub, lo valida y lo registra con chrome.userScripts
// para que corra en la página del juego a document_start. Si los scripts de
// usuario están apagados, registra la copia empaquetada como content script:
// funciona igual, pero sin actualizarse solo.
const CHANNEL = 'https://raw.githubusercontent.com/darvinh12/pokesurvivor-nexus/main/dist/';
const MATCHES = ['https://pokesurvivor.com/*', 'https://www.pokesurvivor.com/*'];
const SCRIPT_ID = 'nexus';
const HEADER = '/*! PokeSurvivor Nexus v';
const CHECK_MINUTES = 30;

const verOf = (code) => {
  const m = typeof code === 'string' && code.startsWith(HEADER) && /^\/\*! PokeSurvivor Nexus v(\d+\.\d+\.\d+) \*\//.exec(code);
  return m ? m[1] : null;
};
const cmpVer = (a, b) => {
  const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0);
  return 0;
};
const sha256 = async (text) => {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
};

async function userScriptsOn() {
  try { await chrome.userScripts.getScripts(); return true; } catch (_) { return false; }
}

async function bundled() {
  const code = await (await fetch(chrome.runtime.getURL('mod.bundled.js'))).text();
  return { code, version: verOf(code) || '0.0.0' };
}

// La versión que debe correr: la remota guardada si es más nueva que la empaquetada.
async function active() {
  const b = await bundled();
  const { remote } = await chrome.storage.local.get('remote');
  if (remote && remote.code && verOf(remote.code) === remote.version && cmpVer(remote.version, b.version) > 0) {
    return { code: remote.code, version: remote.version, source: 'remota' };
  }
  return { code: b.code, version: b.version, source: 'empaquetada' };
}

async function install() {
  const a = await active();
  const us = await userScriptsOn();
  const fallback = await chrome.scripting.getRegisteredContentScripts({ ids: [SCRIPT_ID] });
  if (us) {
    if (fallback.length) await chrome.scripting.unregisterContentScripts({ ids: [SCRIPT_ID] });
    const def = { id: SCRIPT_ID, matches: MATCHES, js: [{ code: a.code }], runAt: 'document_start', world: 'MAIN' };
    const have = await chrome.userScripts.getScripts({ ids: [SCRIPT_ID] });
    if (have.length) await chrome.userScripts.update([def]);
    else await chrome.userScripts.register([def]);
    await chrome.storage.local.set({ mode: 'userScripts', running: { version: a.version, source: a.source } });
  } else {
    if (!fallback.length) {
      await chrome.scripting.registerContentScripts([{
        id: SCRIPT_ID, matches: MATCHES, js: ['mod.bundled.js'], runAt: 'document_start', world: 'MAIN', persistAcrossSessions: true,
      }]);
    }
    const b = await bundled();
    await chrome.storage.local.set({ mode: 'fallback', running: { version: b.version, source: 'empaquetada' } });
  }
}

async function check() {
  const now = new Date().toISOString();
  try {
    const meta = await (await fetch(CHANNEL + 'version.json?t=' + Date.now(), { cache: 'no-store' })).json();
    const cur = await active();
    if (!meta || !/^\d+\.\d+\.\d+$/.test(meta.version || '')) throw new Error('version.json inválido');
    if (cmpVer(meta.version, cur.version) > 0) {
      const res = await fetch(CHANNEL + 'mod.js?v=' + meta.sha256, { cache: 'no-store' });
      if (!res.ok) throw new Error('mod.js respondió ' + res.status);
      const code = await res.text();
      if (verOf(code) !== meta.version) throw new Error('la cabecera de mod.js no coincide con ' + meta.version);
      if (new TextEncoder().encode(code).length !== meta.size) throw new Error('el tamaño de mod.js no coincide');
      if ((await sha256(code)) !== meta.sha256) throw new Error('el hash de mod.js no coincide');
      await chrome.storage.local.set({ remote: { version: meta.version, code, at: now } });
    }
    await chrome.storage.local.set({ checkedAt: now, lastError: '', latest: meta.version });
  } catch (err) {
    await chrome.storage.local.set({ checkedAt: now, lastError: String((err && err.message) || err) });
  }
  await install();
}

async function boot() {
  await chrome.alarms.create('check', { periodInMinutes: CHECK_MINUTES });
  try { await install(); } catch (err) { console.warn('[nexus] install', err); }
  await check();
}

chrome.runtime.onInstalled.addListener(boot);
chrome.runtime.onStartup.addListener(boot);
chrome.alarms.onAlarm.addListener((a) => { if (a.name === 'check') check(); });

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  (async () => {
    if (msg && msg.type === 'check') await check();
    else await install();
    const s = await chrome.storage.local.get(['mode', 'running', 'checkedAt', 'lastError', 'latest']);
    reply({ ...s, userScripts: await userScriptsOn() });
  })().catch((err) => reply({ lastError: String(err && err.message || err) }));
  return true;
});
