// content.js — WebTone (multi-site with X/Twitter focus)

/* ===== Debug ===== */
let debugMode = false;
const d = (...a)=>{ if (debugMode) console.log('[WebTone]', ...a); };
const w = (...a)=>{ if (debugMode) console.warn('[WebTone]', ...a); };

chrome.runtime.onMessage.addListener((m)=>{
  if (!m || !m.type) return;
  if (m.type === 'updateDebugMode') debugMode = !!m.value;
  if (m.type === 'WEBTONE_TOGGLE' || m.type === 'WEBTONE_SETTINGS_UPDATED' || m.type === 'WEBTONE_SNOOZE') {
    loadSettingsFresh().then(()=>{
      document.querySelectorAll(S_POST).forEach(el=>el.removeAttribute('data-wt-processed'));
      scan();
    });
  }
  if (m.type === 'WEBTONE_REVEAL_LAST') revealLastFiltered();
});

/* ===== Storage proxy ===== */
function storageGet(keys){ return new Promise(res=>chrome.runtime.sendMessage({type:'storage:get', keys}, res)); }
function storageSet(obj){  return new Promise(res=>chrome.runtime.sendMessage({type:'storage:set', obj}, res)); }

/* ===== Settings cache ===== */
let WT_SETTINGS = null;
let WT_SETTINGS_TS = 0;

async function loadSettingsFresh() {
  const raw = await storageGet([
    'isEnabled','blurMode','filterSettings','sensitivity',
    'allowHandles','allowKeywords','snoozeUntil','perThresholds',
    'qhEnabled','qhStart','qhEnd'
  ]);
  WT_SETTINGS = {
    isEnabled: raw.isEnabled !== undefined ? !!raw.isEnabled : true,
    blurMode: !!raw.blurMode,
    sensitivity: typeof raw.sensitivity === 'number' ? raw.sensitivity : 0.65,
    filterSettings: (raw.filterSettings && typeof raw.filterSettings==='object')
      ? raw.filterSettings
      : { cynical:true, sarcastic:false, threatening:false, politics:false, racism:false },
    allowHandles: Array.isArray(raw.allowHandles) ? raw.allowHandles : [],
    allowKeywords: Array.isArray(raw.allowKeywords) ? raw.allowKeywords : [],
    snoozeUntil: Number(raw.snoozeUntil || 0),
    perThresholds: (raw.perThresholds && typeof raw.perThresholds==='object') ? raw.perThresholds : {},
    qhEnabled: !!raw.qhEnabled,
    qhStart: Number.isFinite(raw.qhStart) ? raw.qhStart : 22,
    qhEnd: Number.isFinite(raw.qhEnd) ? raw.qhEnd : 7,
  };
  WT_SETTINGS_TS = Date.now();
  return WT_SETTINGS;
}
async function getSettingsCached() {
  if (!WT_SETTINGS || (Date.now() - WT_SETTINGS_TS) > 1500) return await loadSettingsFresh();
  return WT_SETTINGS;
}

/* ===== Analyze via BG ===== */
function analyze(text, lang){
  return new Promise((resolve)=>chrome.runtime.sendMessage({type:'analyzeContent', text, lang}, (res)=>{
    if (res?.success) resolve(res.scores); else { w('analyze failed', res?.error); resolve(null); }
  }));
}

/* ===== Site adapters & helpers ===== */
const SITE = (()=> {
  const h = location.hostname;
  if (/x\.com|twitter\.com/i.test(h)) return 'x';
  if (/youtube\.com/i.test(h)) return 'yt';
  if (/reddit\.com/i.test(h)) return 'rd';
  return 'other';
})();

const SELECTORS = {
  x:  { post: 'article[data-testid="tweet"]', text: '[data-testid="tweetText"]' },
  yt: { post: 'ytd-comment-thread-renderer',   text: '#content-text' },
  rd: { post: 'div[data-testid="post-container"], div[data-testid="comment"]', text: 'h1, h2, p, span' }
};

const S_POST = (SELECTORS[SITE]?.post) || 'article[data-testid="tweet"]';
const S_TEXT = (SELECTORS[SITE]?.text) || '[data-testid="tweetText"]';

const onX = ()=> /(^|\.)x\.com$/i.test(location.hostname) || /(^|\.)twitter\.com$/i.test(location.hostname);
const textFrom = (el)=> el.querySelector(S_TEXT)?.textContent?.trim() || el.textContent?.trim() || '';

function tweetId(el){
  if (!onX()) return null;
  const m = (el.querySelector('a[href*="/status/"]')?.href.match(/\/status\/(\d+)/)||[]);
  return m[1] || null;
}
function tweetPermalink(el){ return el.querySelector('a[href*="/status/"]')?.href || location.href; }
function tweetAuthorHandle(el){
  if (!onX()) return null;
  const a = el.querySelector('a[href^="/"][role="link"]') || el.querySelector('a[href^="/"]');
  const href = a?.getAttribute('href') || '';
  const m = href.match(/^\/([A-Za-z0-9_]+)/);
  return m ? m[1].toLowerCase() : null;
}

/* ===== Simple language guess (very rough) ===== */
function detectLangSimple(text) {
  if (/[اآء-ي]/.test(text)) return 'ar';
  if (/[א-ת]/.test(text)) return 'he';
  if (/[آ-ی]/.test(text)) return 'fa';
  if (/[а-яА-Я]/.test(text)) return 'ru';
  if (/[ぁ-ゟ゠-ヿ一-龯]/.test(text)) return 'ja';
  if (/[ㄱ-ㅎ|가-힣]/.test(text)) return 'ko';
  if (/[áéíóúñ¿¡]/i.test(text)) return 'es';
  return 'en';
}

/* ===== Cache ===== */
const CACHE_MS = 24*60*60*1000;
async function cacheGet(id){ if (!id) return null;
  const { processedPosts = {} } = await storageGet(['processedPosts']);
  const v = processedPosts[id]; if (!v) return null;
  if (Date.now() - (v.timestamp||0) > CACHE_MS) return null; return v.scores || null;
}
async function cachePut(id,scores){ if (!id) return;
  const { processedPosts = {} } = await storageGet(['processedPosts']);
  processedPosts[id] = { timestamp: Date.now(), scores };
  const now = Date.now();
  for (const [k,v] of Object.entries(processedPosts)) if (!v || now - (v.timestamp||0) > CACHE_MS) delete processedPosts[k];
  await storageSet({ processedPosts });
}

/* ===== Styles ===== */
const style = document.createElement('style');
style.textContent = `
  .wt-hidden { display:none !important; }
  .wt-blur { filter: blur(10px) !important; user-select:none !important; cursor:pointer !important; transition:filter .2s; position:relative; }
  .wt-blur:hover { filter: blur(8px) !important; }
  .wt-blur.wt-revealed { filter:none !important; user-select:auto !important; }

  .wt-chip {
    position:absolute; left:8px; top:8px; z-index:2;
    background:rgba(0,0,0,.65); color:#fff; border:1px solid rgba(255,255,255,.2);
    padding:6px 8px; border-radius:10px; font:600 12px/1.1 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;
    display:flex; gap:8px; align-items:center;
  }
  .wt-chip button {
    background:transparent; color:#c7f9e5; border:1px solid rgba(255,255,255,.25);
    padding:3px 6px; border-radius:6px; cursor:pointer; font:600 11px/1 system-ui;
  }
  .wt-chip button:hover { background: rgba(255,255,255,.08); }

  /* profile age badge */
  .wt-age-badge {
    display:inline-flex; align-items:center; gap:6px; margin-left:8px; padding:2px 6px;
    border-radius:999px; font:600 12px/1; background:rgba(20,184,166,.15); color:#0b766e; border:1px solid rgba(20,184,166,.35);
  }
  .wt-age-badge .wt-age-dot { width:6px; height:6px; border-radius:50%; background:#14b8a6; }
`;
document.documentElement.appendChild(style);

/* ===== Stats log ===== */
async function logFiltered({ id, text, scores, filterType, url }){
  const { filteredPosts = [] } = await storageGet(['filteredPosts']);
  filteredPosts.unshift({ id, text, scores, filterType, url, timestamp: Date.now() });
  if (filteredPosts.length > 500) filteredPosts.length = 500;
  await storageSet({ filteredPosts });
}

/* ===== Allowlist ===== */
function isAllowlisted({ handle, text }, settings){
  const handles = (settings.allowHandles || []).map(s=>String(s).toLowerCase()).filter(Boolean);
  const kws     = (settings.allowKeywords || []).map(s=>String(s).toLowerCase()).filter(Boolean);
  if (handle && handles.includes(handle.toLowerCase())) return true;
  if (kws.length && text) {
    const hay = text.toLowerCase();
    for (const kw of kws) if (kw && hay.includes(kw)) return true;
  }
  return false;
}

/* ===== Tooltip + reveal ===== */
function ensureChip(el, type, score) {
  if (el.querySelector('.wt-chip')) return;
  const chip = document.createElement('div');
  chip.className = 'wt-chip';
  chip.innerHTML = `
    <span>Why hidden: <b>${type}</b> · ${(score*100|0)}%</span>
    <button data-act="show">Show anyway</button>
    <button data-act="nof">Not offensive?</button>
  `;
  chip.addEventListener('click', (ev)=>{
    ev.stopPropagation();
    const act = ev.target?.getAttribute?.('data-act');
    if (act === 'show') {
      el.classList.add('wt-revealed');
    } else if (act === 'nof') {
      chrome.runtime.sendMessage({ type:'feedback:send', payload:{ kind:'not_offensive', url: tweetPermalink(el), scores: el.__wt_scores||{} } }, ()=>{});
      ev.target.textContent = 'Thanks!'; ev.target.disabled = true;
      setTimeout(()=>{ ev.target.textContent='Not offensive?'; ev.target.disabled=false; }, 1500);
    }
  }, true);
  el.style.position = 'relative';
  el.appendChild(chip);

  // Re-blur when scrolled away
  const io = new IntersectionObserver((entries)=>{
    entries.forEach(ent=>{ if (!ent.isIntersecting) el.classList.remove('wt-revealed'); });
  }, { threshold: 0 });
  io.observe(el);
}

let lastFilteredEl = null;
function revealLastFiltered(){
  const last = lastFilteredEl || [...document.querySelectorAll('.wt-blur:not(.wt-revealed), .wt-hidden')].pop();
  if (!last) return;
  if (last.classList.contains('wt-hidden')) last.classList.remove('wt-hidden');
  last.classList.add('wt-revealed'); last.scrollIntoView({behavior:'smooth', block:'center'});
}

/* ===== Quiet hours toast ===== */
let WT_TOAST_SHOWN = false;
function inQuietHours({ qhEnabled, qhStart, qhEnd }) {
  if (!qhEnabled) return false;
  const h = new Date().getHours();
  return (qhStart <= qhEnd) ? (h >= qhStart && h < qhEnd) : (h >= qhStart || h < qhEnd);
}
function showQuietToast(settings) {
  if (WT_TOAST_SHOWN) return;
  WT_TOAST_SHOWN = true;
  const toast = document.createElement('div');
  toast.style.cssText = `
    position:fixed; z-index:2147483647; left:16px; bottom:16px; max-width:90vw;
    background:rgba(17,24,39,.96); color:#e5e7eb; border:1px solid rgba(255,255,255,.12);
    padding:10px 12px; border-radius:10px; font:600 13px/1.3 system-ui;
    box-shadow:0 10px 30px rgba(0,0,0,.35);
    display:flex; align-items:center; gap:10px;
  `;
  toast.innerHTML = `
    <span>🌿 Calm mode is auto-on ${settings.qhStart}:00–${settings.qhEnd}:00. Tap to override.</span>
    <button id="wt-override" style="
      margin-left:6px; background:transparent; color:#a7f3d0; border:1px solid rgba(167,243,208,.5);
      padding:4px 8px; border-radius:8px; cursor:pointer; font:600 12px/1;
    ">Override</button>
  `;
  toast.addEventListener('click', (ev)=>{
    if ((ev.target.id || '') === 'wt-override') {
      const until = Date.now() - 1;
      storageSet({ snoozeUntil: until }).then(()=>{
        document.body.removeChild(toast);
        WT_TOAST_SHOWN = false;
        document.querySelectorAll(S_POST).forEach(el => el.removeAttribute('data-wt-processed'));
        scan();
      });
    } else {
      document.getElementById('wt-override').click();
    }
  });
  document.body.appendChild(toast);
}
async function applyQuietHoursToast() {
  const s = await getSettingsCached();
  if (inQuietHours(s)) showQuietToast(s);
}

/* ===== Main processing ===== */
async function processPost(el){
  if (el.hasAttribute('data-wt-processed')) return;
  const txt = textFrom(el); if (!txt) return;

  const settings = await getSettingsCached();
  if (!settings.isEnabled) return;
  if (settings.snoozeUntil && Date.now() < settings.snoozeUntil) return;

  // allowlist first (X only — others: handle is null, so only keywords take effect)
  const handle = tweetAuthorHandle(el);
  if (isAllowlisted({ handle, text: txt }, settings)) {
    el.setAttribute('data-wt-processed','1'); return;
  }

  // cache key (X => status id, others => null)
  const id = tweetId(el);
  const lang = detectLangSimple(txt);
  let scores = id ? await cacheGet(id) : null;
  if (!scores) { scores = await analyze(txt, lang); if (!scores) return; if (id) await cachePut(id, scores); }

  // decide — use per-category threshold if set (>0), otherwise global sensitivity
  let hit = null, hitScore = 0;
  for (const [name, on] of Object.entries(settings.filterSettings)) {
    if (!on) continue;
    const s = Number(scores[name] ?? 0);
    const cat = Number(settings.perThresholds?.[name] ?? 0); // 0 => unset
    const th = cat > 0 ? cat : settings.sensitivity;
    if (s > th && s > hitScore) { hit = name; hitScore = s; }
  }
  if (!hit) { el.setAttribute('data-wt-processed','1'); return; }

  if (settings.blurMode) {
    el.classList.add('wt-blur'); el.__wt_scores = scores;
    ensureChip(el, hit, hitScore);
    el.addEventListener('click', function ev(ev){
      if (!this.classList.contains('wt-blur')) return;
      ev.preventDefault(); ev.stopPropagation(); this.classList.add('wt-revealed');
    }, true);
  } else {
    el.classList.add('wt-hidden');
  }

  lastFilteredEl = el;
  await logFiltered({ id, text: txt, scores, filterType: hit, url: tweetPermalink(el) }).catch(()=>{});
  chrome.runtime.sendMessage({ type: 'filtered:increment' }, ()=>{});
  el.setAttribute('data-wt-processed','1');
}

/* ===== Account Menu to Top (X) ===== */
function moveAccountMenuToTop() {
  if (!onX()) return;
  const candidates = [
    'div[data-testid="SideNav_AccountSwitcher_Button"]',
    'div[aria-label="Account menu"]',
    'a[aria-label="Profile"]',
    'div[data-testid="AppTabBar_More_Menu"]'
  ];
  const primaryNav = document.querySelector('nav[aria-label="Primary"]') || document.querySelector('header nav');
  if (!primaryNav) return;
  let menuBtn = null;
  for (const sel of candidates) { const el = document.querySelector(sel); if (el) { menuBtn = el; break; } }
  if (!menuBtn) return;
  if (primaryNav.querySelector('.wt-menu-pinned')) return;
  const clone = menuBtn.cloneNode(true);
  clone.classList.add('wt-menu-pinned');
  clone.style.margin = '8px 0';
  clone.style.order = '-1';
  primaryNav.insertBefore(clone, primaryNav.firstChild);
}

/* ===== Account Age badge (X) ===== */
function enhanceProfileAge() {
  if (!onX()) return;
  const path = location.pathname.replace(/\/+/g,'/');
  if (!/^\/[A-Za-z0-9_]+\/?$/.test(path)) return;

  const container = document.querySelector('[data-testid="UserJoinDate"]') ||
                    [...document.querySelectorAll('span')].find(s => /Joined/i.test(s.textContent||''));
  if (!container) return;
  if (container.parentElement?.querySelector('.wt-age-badge')) return;

  const text = container.textContent || '';
  const m = text.match(/Joined\s+([A-Za-zéûäöåÄÖÅÉÛÈÍÓáéíóúñüçÇÄÖÜ]+)\s+(\d{4})/i);
  if (!m) return;

  const dateStr = `${m[1]} 1, ${m[2]}`;
  const joined = new Date(dateStr);
  if (isNaN(joined.getTime())) return;

  const now = new Date();
  const diffMs = now - joined;
  const days = Math.max(1, Math.floor(diffMs / (24*3600*1000)));
  const months = Math.max(1, Math.floor(days / 30.4375));
  const years = Math.floor(months / 12);

  let label = '';
  if (years >= 1) label = `${years}y ${months%12}m`;
  else if (months >= 1) label = `${months}m`;
  else label = `${days}d`;

  const badge = document.createElement('span');
  badge.className = 'wt-age-badge';
  badge.title = `~${days} days (${months} months)`;
  badge.innerHTML = `<span class="wt-age-dot"></span> ${label} old`;
  container.parentElement.appendChild(badge);
}

/* ===== Scan & Observe ===== */
function scan(){
  document.querySelectorAll(S_POST).forEach(processPost);
  moveAccountMenuToTop();
  enhanceProfileAge();
  applyQuietHoursToast();
}
const obs = new MutationObserver((muts)=>{
  for (const m of muts){
    for (const n of m.addedNodes){
      if (n.nodeType === 1) {
        if (n.matches?.(S_POST) || n.querySelector?.(S_POST)) { scan(); return; }
        if (n.querySelector?.('nav[aria-label="Primary"]') || n.querySelector?.('[data-testid="UserJoinDate"]')) { scan(); return; }
      }
    }
  }
});
const boot = ()=>{ if (!document.body) return setTimeout(boot, 50); obs.observe(document.body,{childList:true,subtree:true}); loadSettingsFresh().then(scan); };
boot();
