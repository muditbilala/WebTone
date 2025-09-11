// stats.js — WebTone Dashboard

document.addEventListener('DOMContentLoaded', async () => {
  const statsCards = document.getElementById('statsCards');
  const postsContainer = document.getElementById('postsContainer');
  const selType = document.getElementById('type');
  const fromEl = document.getElementById('from');
  const toEl = document.getElementById('to');
  const applyBtn = document.getElementById('apply');

  let allPosts = [];
  await loadAndRender();

  applyBtn.addEventListener('click', render);

  async function loadAndRender() {
    const { filteredPosts = [] } = await chrome.storage.local.get(['filteredPosts']);
    // Keep at most 500 per content.js design
    allPosts = filteredPosts.slice().sort((a,b)=> b.timestamp - a.timestamp);
    // Pre-fill date range to last 24h
    const now = new Date();
    const earlier = new Date(now.getTime() - 24*60*60*1000);
    fromEl.value = toLocalInput(earlier);
    toEl.value = toLocalInput(now);
    render();
  }

  function render() {
    // read filters
    const type = selType.value || 'all';
    const from = parseLocalInput(fromEl.value) || 0;
    const to = parseLocalInput(toEl.value) || Date.now();

    const list = allPosts.filter(p => {
      const okType = (type === 'all') ? true : p.filterType === type;
      const okTime = p.timestamp >= from && p.timestamp <= to;
      return okType && okTime;
    });

    // stats
    const stats = { total: list.length, cynical:0, sarcastic:0, threatening:0, politics:0, racism:0 };
    list.forEach(p => { if (p.filterType && stats[p.filterType] !== undefined) stats[p.filterType]++; });

    // draw cards
    statsCards.innerHTML = '';
    Object.entries(stats).forEach(([k, v]) => {
      const card = document.createElement('div');
      card.className = 'stat-card';
      card.innerHTML = `
        <div class="stat-number">${v}</div>
        <div class="stat-label">${k === 'total' ? 'Total Blocked' : `${capitalize(k)} Blocked`}</div>
      `;
      statsCards.appendChild(card);
    });

    // posts list
    postsContainer.innerHTML = '';
    if (list.length === 0) {
      postsContainer.innerHTML = `<div class="no-posts">No posts in the selected range.</div>`;
      return;
    }

    list.forEach(post => {
      const el = document.createElement('div');
      el.className = 'post';
      const timeAgo = getTimeAgo(new Date(post.timestamp));
      const scoresHtml = Object.entries(post.scores || {}).map(([key, value]) => `
        <div class="score-item">
          <span>${capitalize(key)}:</span>
          <div class="score-bar"><div class="score-fill" style="width:${Math.round(value*100)}%"></div></div>
          <span>${Math.round(value*100)}%</span>
        </div>
      `).join('');

      const urlHtml = post.url ? `<a class="post-link" href="${post.url}" target="_blank" rel="noopener">open</a>` : '';

      el.innerHTML = `
        <div class="post-meta">
          <span>${timeAgo}</span>
          <span class="post-type">${capitalize(post.filterType || 'unknown')}</span>
        </div>
        <div class="post-content">${escapeHtml(post.text || '')}</div>
        <div class="post-scores">${scoresHtml}</div>
        <div style="margin-top:6px">${urlHtml}</div>
      `;
      postsContainer.appendChild(el);
    });
  }
});

// helpers
function getTimeAgo(date) {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  const intervals = { year:31536000, month:2592000, week:604800, day:86400, hour:3600, minute:60, second:1 };
  for (const [unit, s] of Object.entries(intervals)) {
    const n = Math.floor(seconds / s);
    if (n >= 1) return `${n} ${unit}${n === 1 ? '' : 's'} ago`;
  }
  return 'just now';
}
function escapeHtml(text) {
  const div = document.createElement('div'); div.textContent = text; return div.innerHTML;
}
function capitalize(s){ return (s||'').charAt(0).toUpperCase() + (s||'').slice(1); }
function toLocalInput(d){
  const pad = (n)=> String(n).padStart(2,'0');
  const y=d.getFullYear(), m=pad(d.getMonth()+1), da=pad(d.getDate()), h=pad(d.getHours()), mi=pad(d.getMinutes());
  return `${y}-${m}-${da}T${h}:${mi}`;
}
function parseLocalInput(s){
  if (!s) return 0;
  const t = new Date(s); const ms = t.getTime(); return isNaN(ms)?0:ms;
}
