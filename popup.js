// popup.js — WebTone

async function pokeActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) chrome.tabs.sendMessage(tab.id, { type: 'WEBTONE_SETTINGS_UPDATED' });
}
function $(id){ return document.getElementById(id); }

async function loadUI() {
  const s = await chrome.storage.local.get([
    'isEnabled','blurMode','filterSettings','sensitivity',
    'allowHandles','allowKeywords','debugMode',
    'qhEnabled','qhStart','qhEnd','filteredToday','perThresholds'
  ]);

  // toggles
  $('enabled').checked = s.isEnabled !== false;
  $('blur-mode').checked = !!s.blurMode;
  $('debug-mode').checked = !!s.debugMode;

  // global sensitivity
  const sens = typeof s.sensitivity === 'number' ? s.sensitivity : 0.65;
  $('threshold').value = sens; $('thVal').textContent = sens.toFixed(2);

  // filters
  const fs = s.filterSettings || { cynical:true, sarcastic:false, threatening:false, politics:false, racism:false };
  $('filter-cynical').checked = !!fs.cynical;
  $('filter-sarcastic').checked = !!fs.sarcastic;
  $('filter-threatening').checked = !!fs.threatening;
  $('filter-politics').checked = !!fs.politics;
  $('filter-racism').checked = !!fs.racism;

  // per-category thresholds (0..100; 0 means "use global")
  const pt = s.perThresholds || {};
  const setPT = (k)=> {
    const v = Math.max(0, Math.min(100, Math.round((pt[k] || 0) * 100)));
    $(`thresh-${k}`).value = v;
    $(`thresh-${k}-val`).textContent = String(v);
  };
  ['cynical','sarcastic','threatening','politics','racism'].forEach(setPT);

  // allowlist
  $('allow-handles').value = (s.allowHandles || []).join('\n');
  $('allow-keywords').value = (s.allowKeywords || []).join('\n');

  // quiet hours
  $('qh-enabled').checked = !!s.qhEnabled;
  $('qh-start').value = Number.isFinite(s.qhStart) ? s.qhStart : 22;
  $('qh-end').value = Number.isFinite(s.qhEnd) ? s.qhEnd : 7;

  // filtered today (badge mirror)
  const todayKey = (()=>{ const d=new Date(); return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`; })();
  const count = (s.filteredToday && s.filteredToday[todayKey]) || 0;
  $('filteredCount').textContent = count;
}

document.addEventListener('DOMContentLoaded', async () => {
  await loadUI();

  // View stats
  $('viewStats').addEventListener('click', ()=> chrome.tabs.create({ url: chrome.runtime.getURL('stats.html') }));

  // Master enable
  $('enabled').addEventListener('change', async (e)=>{
    await chrome.runtime.sendMessage({ type:'toggleWebtone:set', value: e.target.checked });
    await pokeActiveTab();
  });

  // Blur mode
  $('blur-mode').addEventListener('change', async (e)=>{
    await chrome.runtime.sendMessage({ type:'blurMode:set', value: e.target.checked });
    await pokeActiveTab();
  });

  // Debug
  $('debug-mode').addEventListener('change', async (e)=>{
    await chrome.runtime.sendMessage({ type:'updateDebugMode', value: e.target.checked });
    await pokeActiveTab();
  });

  // Sensitivity
  $('threshold').addEventListener('input', (e)=> $('thVal').textContent = Number(e.target.value).toFixed(2));
  $('threshold').addEventListener('change', async (e)=>{
    await chrome.runtime.sendMessage({ type:'storage:set', obj: { sensitivity: Number(e.target.value) } });
    await pokeActiveTab();
  });

  // Filter switches -> send one merged payload
  const filterIds = ['filter-cynical','filter-sarcastic','filter-threatening','filter-politics','filter-racism'];
  filterIds.forEach(id => {
    $(id).addEventListener('change', async ()=>{
      const value = {
        cynical: $('filter-cynical').checked,
        sarcastic: $('filter-sarcastic').checked,
        threatening: $('filter-threatening').checked,
        politics: $('filter-politics').checked,
        racism: $('filter-racism').checked
      };
      await chrome.runtime.sendMessage({ type:'filterSettings:set', value });
      await pokeActiveTab();
    });
  });

  // Per-category thresholds (convert 0..100 to 0..1; 0 = unset/use global)
  const ptIds = ['cynical','sarcastic','threatening','politics','racism'];
  ptIds.forEach(k => {
    const slider = $(`thresh-${k}`);
    const label  = $(`thresh-${k}-val`);
    slider.addEventListener('input', (e)=> label.textContent = String(e.target.value));
    slider.addEventListener('change', async (e)=>{
      const current = {};
      ptIds.forEach(kk => {
        current[kk] = Number($(`thresh-${kk}`).value) / 100;
      });
      await chrome.runtime.sendMessage({ type:'perThresholds:set', value: current });
      await pokeActiveTab();
    });
  });

  // Allowlist save on change
  async function saveAllowlist() {
    const allowHandles = $('allow-handles').value.split('\n').map(s=>s.trim()).filter(Boolean);
    const allowKeywords = $('allow-keywords').value.split('\n').map(s=>s.trim()).filter(Boolean);
    await chrome.runtime.sendMessage({ type:'allowlist:set', value: { allowHandles, allowKeywords } });
    await pokeActiveTab();
  }
  $('allow-handles').addEventListener('change', saveAllowlist);
  $('allow-keywords').addEventListener('change', saveAllowlist);

  // Quiet hours
  $('qh-enabled').addEventListener('change', async (e)=>{
    await chrome.runtime.sendMessage({ type:'storage:set', obj: { qhEnabled: e.target.checked } });
    await pokeActiveTab();
  });
  $('qh-start').addEventListener('change', async (e)=>{
    await chrome.runtime.sendMessage({ type:'storage:set', obj: { qhStart: Number(e.target.value) } });
    await pokeActiveTab();
  });
  $('qh-end').addEventListener('change', async (e)=>{
    await chrome.runtime.sendMessage({ type:'storage:set', obj: { qhEnd: Number(e.target.value) } });
    await pokeActiveTab();
  });

  // Tools
  $('revealLast').addEventListener('click', ()=> chrome.runtime.sendMessage({ type:'revealLast' }));
  $('showFiltered').addEventListener('click', ()=> chrome.tabs.create({ url: chrome.runtime.getURL('stats.html') }));
  $('clearCache').addEventListener('click', async ()=>{
    await chrome.runtime.sendMessage({ type:'storage:set', obj: { processedPosts: {}, filteredPosts: [] }});
    await pokeActiveTab();
    $('filteredCount').textContent = '0';
  });

  // Export/Import
  $('export-settings').addEventListener('click', async ()=>{
    const obj = await chrome.storage.local.get(null);
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'webtone-settings.json'; a.click();
    URL.revokeObjectURL(url);
  });
  $('import-settings').addEventListener('change', async (e)=>{
    const f = e.target.files?.[0]; if (!f) return;
    const text = await f.text().catch(()=>null); if (!text) return;
    let json = null; try { json = JSON.parse(text); } catch {}
    if (!json) return;
    await chrome.runtime.sendMessage({ type:'storage:set', obj: json });
    await pokeActiveTab();
    await loadUI();
  });
});
