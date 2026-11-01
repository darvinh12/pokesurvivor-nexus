const $ = (id) => document.getElementById(id);

function show(s) {
  $('warn').classList.toggle('hidden', !!s.userScripts);
  $('ver').textContent = (s.running && s.running.version) || 'sin datos';
  $('src').textContent = (s.running && s.running.source) || 'sin datos';
  $('latest').textContent = s.latest || 'sin datos';
  $('checked').textContent = s.checkedAt ? new Date(s.checkedAt).toLocaleString() : 'nunca';
  $('error').textContent = s.lastError ? 'Último error: ' + s.lastError : '';
  $('error').classList.toggle('hidden', !s.lastError);
}

const ask = (type) => chrome.runtime.sendMessage({ type }).then(show);

$('check').addEventListener('click', async () => {
  $('check').disabled = true;
  $('check').textContent = 'Buscando…';
  try { await ask('check'); } finally {
    $('check').disabled = false;
    $('check').textContent = 'Buscar actualización';
  }
});
$('details').addEventListener('click', () => chrome.tabs.create({ url: 'chrome://extensions/?id=' + chrome.runtime.id }));

ask('status');
