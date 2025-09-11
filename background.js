// background.js — WebTone (MV3 service worker, "type": "module")

let debugMode = false;
const dlog = (...a) => { if (debugMode) console.log('[WebTone/bg]', ...a); };
const derr = (...a) => { if (debugMode) console.error('[WebTone/bg]', ...a); };

const PROXY_URL = 'https://webtone-proxy.webtone-mudit.workers.dev/score';
const FEEDBACK_URL = 'https://webtone-proxy.webtone-mudit.workers.dev/feedback';

let CLIENT_ID = null;
chrome.storage.sync.get(['webtone_client_id']).then(({ webtone_client_id }) => {
  if (!webtone_client_id) {
    webtone_client_id = crypto.getRandomValues(new Uint32Array(4)).join('-');
    chrome.storage.sync.set({ webtone_client_id });
  }
  CLIENT_ID = webtone_client_id;
});
chrome.storage.local.get(['debugMode']).then(({ debugMode: d }) => { debugMode = !!d; });

function notifyAllTabs(msg) {
  chrome.tabs.query({}, tabs => tabs.forEach(t => t.id && chrome.tabs.sendMessage(t.id, msg)));
}
async function flashBadge(text = '✓', ms = 900) {
  try {
    await chrome.action.setBadgeText({ text });
    await chrome.action.setBadgeBackgroundColor({ color: '#10b981' });
    setTimeout(() => chrome.action.setBadgeText({ text: '' }), ms);
  } catch {}
}

const ERR_RING = [];
function pushErr(e){ ERR_RING.unshift({ts:Date.now(), err:String(e)}); if (ERR_RING.length>50) ERR_RING.pop(); }

// ---------- Today counter (badge) ----------
async function getTodayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;
}
async function bumpTodayFiltered(by = 1) {
  const key = await getTodayKey();
  const { filteredToday = {} } = await chrome.storage.local.get(['filteredToday']);
  const day = filteredToday[key] || 0;
  filteredToday[key] = Math.max(0, day + by);
  await chrome.storage.local.set({ filteredToday });
  const c = filteredToday[key];
  const text = c > 999 ? '999+' : String(c);
  await chrome.action.setBadgeText({ text });
  await chrome.action.setBadgeBackgroundColor({ color: '#111827' });
}
chrome.runtime.onStartup?.addListener(async ()=>{
  const key = await getTodayKey();
  const { filteredToday = {} } = await chrome.storage.local.get(['filteredToday']);
  const next = { [key]: filteredToday[key] || 0 };
  await chrome.storage.local.set({ filteredToday: next });
  const text = next[key] ? String(next[key]) : '';
  await chrome.action.setBadgeText({ text });
});

// ---------- Scoring proxy ----------
async function scoreTextViaProxy(text, opts = {}) {
  const { sensitivity = 0.65, lang = 'en', proKey = '' } =
    await chrome.storage.local.get(['sensitivity','lang','proKey']);
  const res = await fetch(PROXY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-WebTone-Client': CLIENT_ID || 'anon',
      ...(proKey ? { Authorization: `Bearer ${proKey}` } : {})
    },
    body: JSON.stringify({ text, threshold: opts.sensitivity ?? sensitivity, lang: opts.lang || lang })
  });
  if (!res.ok) throw new Error(`proxy ${res.status} ${res.statusText}: ${await res.text().catch(()=> '')}`);
  const out = await res.json().catch(()=>null);
  if (out?.scores) return out;
  if (typeof out?.score === 'number') {
    const s = out.score;
    return { scores: { cynical:s, sarcastic:s, threatening:s, politics:s, racism:s }, decided: out.decided ?? true };
  }
  throw new Error('Unexpected proxy response');
}

// ---------- Message router ----------
chrome.runtime.onMessage.addListener((msg,_sender,sendResponse)=>{
  try {
    // storage proxy
    if (msg?.type === 'storage:get') { chrome.storage.local.get(msg.keys||[]).then(sendResponse); return true; }
    if (msg?.type === 'storage:set') { chrome.storage.local.set(msg.obj||{}).then(()=>sendResponse({ok:true})); return true; }

    // toggles & settings
    if (msg?.type === 'toggleWebtone:set') {
      (async ()=>{ try {
        const next = !!msg.value; await chrome.storage.local.set({isEnabled:next});
        notifyAllTabs({type:'WEBTONE_TOGGLE', isEnabled: next}); flashBadge(next?'ON':'OFF'); sendResponse({ok:true});
      } catch(e){ pushErr(e); sendResponse({ok:false, error:String(e)}); } })(); return true;
    }
    if (msg?.type === 'blurMode:set') {
      (async ()=>{ try {
        await chrome.storage.local.set({ blurMode: !!msg.value });
        notifyAllTabs({type:'WEBTONE_SETTINGS_UPDATED'}); sendResponse({ok:true});
      } catch(e){ pushErr(e); sendResponse({ok:false, error:String(e)}); } })(); return true;
    }
    if (msg?.type === 'filterSettings:set') {
      (async ()=>{ try {
        const next = (msg.value && typeof msg.value==='object') ? msg.value : null;
        if (!next) throw new Error('invalid filterSettings payload');
        await chrome.storage.local.set({ filterSettings: next });
        notifyAllTabs({type:'WEBTONE_SETTINGS_UPDATED'}); sendResponse({ok:true});
      } catch(e){ pushErr(e); sendResponse({ok:false, error:String(e)}); } })(); return true;
    }

    // per-category thresholds writer (NEW)
    if (msg?.type === 'perThresholds:set') {
      (async ()=>{ try {
        const next = (msg.value && typeof msg.value==='object') ? msg.value : {};
        await chrome.storage.local.set({ perThresholds: next });
        chrome.tabs.query({}, tabs => tabs.forEach(t => t.id && chrome.tabs.sendMessage(t.id, { type:'WEBTONE_SETTINGS_UPDATED' })));
        sendResponse({ ok: true });
      } catch(e){ pushErr(e); sendResponse({ ok:false, error:String(e) }); } })();
      return true;
    }

    // allowlist writer
    if (msg?.type === 'allowlist:set') {
      (async ()=>{ try {
        const { allowHandles = [], allowKeywords = [] } = msg.value || {};
        await chrome.storage.local.set({ allowHandles, allowKeywords });
        notifyAllTabs({type:'WEBTONE_SETTINGS_UPDATED'}); sendResponse({ok:true});
      } catch(e){ pushErr(e); sendResponse({ok:false, error:String(e)}); } })(); return true;
    }

    // debug flag
    if (msg?.type === 'updateDebugMode') { debugMode = !!msg.value; chrome.storage.local.set({debugMode}); sendResponse({ok:true}); return; }

    // scoring
    if (msg?.type === 'analyzeContent') {
      (async ()=>{ try {
        const { text, lang } = msg;
        const out = await scoreTextViaProxy(text, { lang });
        dlog('scores', out?.scores); sendResponse({success:true, scores: out.scores, decided: out.decided ?? true});
      } catch(e){ pushErr(e); derr('analyzeContent error', e); sendResponse({success:false, error:String(e)}); } })();
      return true;
    }

    // feedback passthrough
    if (msg?.type === 'feedback:send') {
      (async ()=>{ try {
        const { payload } = msg; const { proKey = '' } = await chrome.storage.local.get(['proKey']);
        await fetch(FEEDBACK_URL,{
          method:'POST',
          headers:{'Content-Type':'application/json','X-WebTone-Client':CLIENT_ID||'anon', ...(proKey?{Authorization:`Bearer ${proKey}`}:{})},
          body: JSON.stringify(payload||{})
        });
        sendResponse({ok:true});
      } catch(e){ pushErr(e); sendResponse({ok:false, error:String(e)}); } })();
      return true;
    }

    // filtered counter bump
    if (msg?.type === 'filtered:increment') {
      bumpTodayFiltered(1).then(()=>sendResponse({ ok:true }));
      return true;
    }

    // utilities
    if (msg?.type === 'revealLast') { notifyAllTabs({type:'WEBTONE_REVEAL_LAST'}); flashBadge('RV'); sendResponse({ok:true}); return; }
    if (msg?.type === 'webtone:ping') { sendResponse({ok:true, worker:'alive', lastErrors: ERR_RING.slice(0,5)}); return; }
  } catch(e){ pushErr(e); try{ sendResponse?.({success:false, error:String(e)});}catch{} }
});

// ---------- Commands ----------
if (chrome.commands?.onCommand) {
  chrome.commands.onCommand.addListener(async (cmd)=>{
    try {
      if (cmd==='toggle-webtone') {
        const { isEnabled = true } = await chrome.storage.local.get('isEnabled');
        const next = !isEnabled; await chrome.storage.local.set({isEnabled:next});
        notifyAllTabs({type:'WEBTONE_TOGGLE', isEnabled: next}); flashBadge(next?'ON':'OFF');
      } else if (cmd==='snooze-10-mins') {
        const until = Date.now()+10*60*1000; await chrome.storage.local.set({snoozeUntil:until});
        notifyAllTabs({type:'WEBTONE_SNOOZE', until}); flashBadge('SZ');
      } else if (cmd==='reveal-last') {
        notifyAllTabs({type:'WEBTONE_REVEAL_LAST'}); flashBadge('RV');
      }
    } catch(e){ pushErr(e); derr('commands error', e); }
  });
}

// ---------- Seed defaults ----------
chrome.runtime.onInstalled.addListener(()=>{
  chrome.storage.local.get(['isEnabled','sensitivity','filterSettings','allowHandles','allowKeywords']).then(s=>{
    const seed = {};
    if (s.isEnabled === undefined) seed.isEnabled = true;
    if (s.sensitivity === undefined) seed.sensitivity = 0.65;
    if (!s.filterSettings) seed.filterSettings = { cynical:true, sarcastic:false, threatening:false, politics:false, racism:false };
    if (!Array.isArray(s.allowHandles)) seed.allowHandles = [];
    if (!Array.isArray(s.allowKeywords)) seed.allowKeywords = [];
    if (Object.keys(seed).length) chrome.storage.local.set(seed);
  });
});
