'use strict';

/* ══════════════════════════════════════════════════════════
   Date Extraction Helper
══════════════════════════════════════════════════════════ */
function extractDateFromMsg(msg) {
  // sep 型訊息沒有 lines 欄位，直接視為無日期
  if (!msg || !Array.isArray(msg.lines)) return '';
  
  // 1. 優先從「對話內容」抓取 RP 時間 (例如：2月14日)
  const contentText = msg.lines.slice(0, 3).join(' ');
  
  // 找尋 YYYY年MM月DD日 或 YYYY-MM-DD
  let m = contentText.match(/(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})[日]?/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  
  // 找尋 MM月DD日
  m = contentText.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
  if (m) {
    // 若只有月日，則嘗試抓取系統發送時間的年份，若無則用當前年份
    let year = new Date().getFullYear();
    if (msg.tsStr) {
      const tsMatch = msg.tsStr.match(/^(\d{4})/);
      if (tsMatch) year = tsMatch[1];
    }
    return `${year}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  }

  // 2. 如果內容沒有提到時間，才退回到系統的發送時間 (msg.tsStr)
  if (msg.tsStr) {
    m = msg.tsStr.match(/(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})[日]?/);
    if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  }
  
  return '';
}

function extractEmbedUrl(input) {
  if (!input) return '';
  const iframeMatch = input.match(/src=["'](.*?)["']/i);
  if (iframeMatch) return iframeMatch[1];
  return input.trim();
}

function normalizeEmbedUrl(input) {
  const raw = extractEmbedUrl(input);
  if (!raw) return '';
  let src = raw.trim();
  if (!/^https?:\/\//i.test(src)) src = `https://${src.replace(/^\/+/, '')}`;

  let url;
  try {
    url = new URL(src);
  } catch (e) {
    return raw.trim();
  }

  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  const pathname = url.pathname || '';

  if (host === 'open.spotify.com') {
    const m = pathname.match(/^\/(track|album|playlist|episode|show)\/([^/?#]+)/);
    if (m) return `https://open.spotify.com/embed/${m[1]}/${m[2]}`;
  }

  if (host === 'soundcloud.com' || host === 'm.soundcloud.com' || host === 'on.soundcloud.com') {
    return `https://w.soundcloud.com/player/?url=${encodeURIComponent(url.toString())}&color=%23a58bff&auto_play=false&hide_related=false&show_comments=false&show_user=true&show_reposts=false&show_teaser=true`;
  }

  const sunoSong = url.toString().match(/(?:suno\.com|app\.suno\.ai)\/(?:song|s)\/([^/?]+)/);
  const sunoPlaylist = url.toString().match(/suno\.com\/playlist\/([^/?]+)/);
  if (sunoSong) {
    if (sunoSong[1].length < 30) return '';
    return `https://suno.com/embed/${sunoSong[1]}`;
  }
  if (sunoPlaylist) return `https://suno.com/embed/playlist/${sunoPlaylist[1]}`;

  if (host === 'youtu.be') {
    const vid = pathname.split('/').filter(Boolean)[0];
    if (vid) return `https://www.youtube.com/embed/${vid}`;
  }
  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
    if (pathname === '/watch') {
      const vid = url.searchParams.get('v');
      if (vid) return `https://www.youtube.com/embed/${vid}`;
    }
    const embedded = pathname.match(/^\/embed\/([^/?#]+)/);
    if (embedded) return `https://www.youtube.com/embed/${embedded[1]}`;
  }

  return url.toString();
}

function extractCoverColor(imgEl, cardEl) {
  try {
    const c = document.createElement('canvas');
    c.width = c.height = 4;
    const ctx = c.getContext('2d');
    ctx.drawImage(imgEl, 0, 0, 4, 4);
    const d = ctx.getImageData(1, 1, 2, 2).data; // 中心 2×2，避開純黑邊角
    const r = Math.round((d[0] + d[4] + d[8]  + d[12]) / 4);
    const g = Math.round((d[1] + d[5] + d[9]  + d[13]) / 4);
    const b = Math.round((d[2] + d[6] + d[10] + d[14]) / 4);
    cardEl.style.setProperty('--cover-rgb', `${r} ${g} ${b}`);
  } catch {}
}

function normalizeCoverSrc(input) {
  const raw = String(input || '').trim();
  if (!raw) return '';
  if (/^(data:image\/|blob:|https?:\/\/|file:\/\/)/i.test(raw)) return raw;
  if (/^[A-Za-z]:[\\/]/.test(raw)) {
    const p = raw.replace(/\\/g, '/');
    return encodeURI(`file:///${p}`);
  }
  if (raw.startsWith('/')) return encodeURI(raw);
  return encodeURI(raw);
}

function isEmbeddableMediaUrl(input) {
  if (!input) return false;
  let u;
  try {
    u = new URL(input);
  } catch (e) {
    return false;
  }
  const host = u.hostname.toLowerCase().replace(/^www\./, '');
  const path = u.pathname || '';
  if (host === 'youtube.com' || host === 'm.youtube.com') return path.startsWith('/embed/');
  if (host === 'open.spotify.com') return path.startsWith('/embed/');
  if (host === 'w.soundcloud.com') return path.startsWith('/player/');
  if (host === 'suno.com') return path.startsWith('/embed/');
  return false;
}

function buildEmbedHtml(url, size = 'large') {
  if (!url) return '';
  const src = normalizeEmbedUrl(url);
  if (src && isEmbeddableMediaUrl(src)) {
    const h = size === 'small' ? 80 : 120;
    return `<iframe src="${escAttr(src)}" height="${h}" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" sandbox="allow-scripts allow-same-origin allow-popups allow-forms" referrerpolicy="no-referrer-when-downgrade"></iframe>`;
  }
  const pad    = size === 'small' ? '10px' : '14px';
  const linkP  = size === 'small' ? '6px 11px' : '7px 12px';
  return `<div style="padding:${pad};text-align:center;font-size:12px;color:var(--c-hint);"><a href="${escAttr(safeUrl(url))}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:${linkP};border-radius:6px;background:rgb(var(--c-primary-rgb)/0.16);color:var(--c-text);text-decoration:none;">${t('msg.openExtMusic')}</a></div>`;
}

/* ══════════════════════════════════════════════════════════
   Parser
══════════════════════════════════════════════════════════ */
const HEADER = /^\[([^\]]+)\]\s+(.+?):\s*(.*)/;

function parseTs(str) {
  if (!str) return 0;
  // 優先用 regex 解析 YYYY[/-]M[/-]D [HH:mm[:ss]] 格式以避開 Safari 對非 ISO 字串的 NaN
  const m = String(str).match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) {
    const t = new Date(+m[1], +m[2] - 1, +m[3], +(m[4]||0), +(m[5]||0), +(m[6]||0)).getTime();
    if (!isNaN(t)) return t;
  }
  const d = new Date(String(str).replace(/\//g, '-'));
  return isNaN(d.getTime()) ? 0 : d.getTime();
}

function parseTxt(text) {
  const lines  = text.split(/\r?\n/);
  const result = [];
  let cur = null;
  let lastTs = 0;
  let seq = 0;

  function flush() {
    if (!cur) return;
    while (cur.lines.length && cur.lines[cur.lines.length - 1].trim() === '') cur.lines.pop();
    if (cur.lines.length) result.push(cur);
    cur = null;
  }

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (/^\[\*{3}\]\s*$/.test(line)) {
      if (cur) cur.lines.push('***');
      continue;
    }
    const m = HEADER.exec(line);
    if (m) {
      flush();
      const [, tsStr, name, rest] = m;
      const ts = parseTs(tsStr.trim());
      lastTs = ts || lastTs;
      cur = {
        id      : uid(),
        type    : 'msg',
        ts,
        seq     : seq++,
        tsStr   : tsStr.trim(),
        name    : name.trim(),
        lines   : [],
        folderId: null,
      };
      if (rest.trim()) cur.lines.push(rest);
      continue;
    }
    if (line.trim() === '***') {
      if (cur) cur.lines.push('***');
      continue;
    }
    if (cur) cur.lines.push(line);
  }
  flush();
  return result;
}

function registerName(name) {
  if (!S.nameOrder.includes(name)) S.nameOrder.push(name);
}

function roleOf(name) {
  const n = String(name || '').trim();
  if (/^Environment\s*\(system\)$/i.test(n)) return 'character';
  if (S.nameOrder.length === 0) return 'character';
  return S.nameOrder[0] === name ? 'character' : 'player';
}

function displayNameOf(name) {
  const role = roleOf(name);
  if (role === 'character') return getRoleLabel('character');
  if (role === 'player') return getRoleLabel('player');
  return name || '';
}

function isSystemDividerMsg(name) {
  return /^Environment\s*\(system\)$/i.test(String(name || '').trim());
}

/* ══════════════════════════════════════════════════════════
   Inline rendering
══════════════════════════════════════════════════════════ */
function renderLines(lines) {
  const parts = [];
  for (const line of lines) {
    if (line.trim() === '---' || line.trim() === '***' || /^\[\*{3}\]$/.test(line.trim())) {
      parts.push('<hr class="bubble-divider">');
      continue;
    }
    if (line.trim() === '') {
      parts.push('<span class="bubble-line bubble-blank"><br></span>');
      continue;
    }
    parts.push('<span class="bubble-line">' + renderInline(line) + '</span>');
  }
  return parts.join('\n');
}

function renderInline(text) {
  // 只配對 *內容* 格式 *）
  return text.split(/(\*[^*]+\*)/g).map(seg => {
    if (seg.length > 2 && seg[0] === '*' && seg[seg.length - 1] === '*') {
      return `<span class="t-action">${esc(seg.slice(1, -1))}</span>`;
    }
    return seg ? `<span class="t-speech">${esc(seg)}</span>` : '';
  }).join('');
}

/* ══════════════════════════════════════════════════════════
   Data helpers
══════════════════════════════════════════════════════════ */
function classifiedIds() {
  const set = new Set();
  S.folders.forEach(f => f.msgIds.forEach(id => set.add(id)));
  return set;
}

// visibleMsgs 現在直接回傳 S.allMessages（已是當前 view 的快取）
function visibleMsgs() {
  return S.allMessages;
}

function unclassifiedCount() {
  return S.msgCount;
}

// 從 IDB 重算未歸類計數（只在 boot 和 import 後呼叫）
async function refreshUnclassifiedCount() {
  try {
    const cls = classifiedIds();
    const allIds = await idbGetAllMessageIds();
    S.msgCount = allIds.filter(id => !cls.has(id)).length;
    renderFolders();
  } catch(e) {}
}

// 同步調整計數（不需 IDB，用於 delete / dropIntoFolder / 移回未歸類）
function adjustUnclassifiedCount(delta) {
  S.msgCount = Math.max(0, S.msgCount + delta);
  renderFolders();
}

/* ══════════════════════════════════════════════════════════
   View / Scroll Anchor Persistence
   - S.view: 當前資料夾 id；存進 localStorage 讓 reload 回到原資料夾
   - _viewScrollMap: 每個資料夾的最後可見訊息 id；切換 / reload 後回到該則
══════════════════════════════════════════════════════════ */
const LS_VIEW_STATE = 'tak_fire_view_v1';
const _viewScrollMap = new Map();
const VIEW_KEY_UNC = '__unc__';
const _viewKey = () => S.view === null ? VIEW_KEY_UNC : S.view;

function saveViewState() {
  try {
    lsSet(LS_VIEW_STATE, JSON.stringify({
      view: S.view,
      anchors: Object.fromEntries(_viewScrollMap),
    }));
  } catch(e) {}
}

function loadViewState() {
  try {
    const raw = lsGet(LS_VIEW_STATE);
    if (!raw) return;
    const d = JSON.parse(raw);
    // 還原 view（驗證 folder 仍存在）
    if (d.view === null) S.view = null;
    else if (typeof d.view === 'string' && S.folders.some(f => f.id === d.view)) S.view = d.view;
    // 還原 anchor map
    if (d.anchors && typeof d.anchors === 'object') {
      for (const [k, v] of Object.entries(d.anchors)) _viewScrollMap.set(k, v);
    }
  } catch(e) {}
}

// 抓 #message-list 視窗頂端第一則可見訊息的 id，存到當前 view 的 anchor
function captureCurrentScrollAnchor() {
  const list = $('message-list');
  if (!list) return;
  const topThreshold = list.getBoundingClientRect().top + 8;
  const els = list.querySelectorAll('[data-id]');
  for (const el of els) {
    if (el.getBoundingClientRect().bottom > topThreshold) {
      _viewScrollMap.set(_viewKey(), el.dataset.id);
      saveViewState();
      return;
    }
  }
}

// 由搜尋跳轉觸發的 switchView 會設下此旗標：該次不要還原上次的捲動位置，
// 否則會蓋掉「捲到搜尋命中的那則訊息」。只作用一次。
let _skipNextAnchorRestore = false;

// 等 renderMsgs 完成後，捲到 anchor 位置；找不到該訊息時不動
async function restoreScrollAnchor() {
  await _renderDonePromise;
  if (_skipNextAnchorRestore) { _skipNextAnchorRestore = false; return; }
  const id = _viewScrollMap.get(_viewKey());
  if (!id) return;
  const el = $('message-list').querySelector(`[data-id="${CSS.escape(id)}"]`);
  if (el) el.scrollIntoView({ block: 'start' });
}

let _scrollSaveTimer = null;
function scheduleScrollCapture() {
  clearTimeout(_scrollSaveTimer);
  _scrollSaveTimer = setTimeout(captureCurrentScrollAnchor, 250);
}

// 清掉 folder.msgIds 中已不存在於 IDB 的孤立 ID（歷史遺留的失效引用）
// 在 boot 時呼叫一次；有清掉就 save 並 renderFolders 重算計數
async function pruneOrphanMsgIds() {
  try {
    const allIds = await idbGetAllMessageIds();
    const valid = new Set(allIds);
    let removed = 0;
    for (const f of S.folders) {
      const before = f.msgIds.length;
      f.msgIds = f.msgIds.filter(id => valid.has(id));
      removed += before - f.msgIds.length;
    }
    if (removed > 0) {
      save();
      renderFolders();
      console.info(`pruneOrphanMsgIds: removed ${removed} orphan id(s)`);
    }
  } catch(e) {
    console.warn('pruneOrphanMsgIds:', e);
  }
}

// 非同步載入當前 view 的訊息到 S.allMessages
async function loadViewMessages() {
  try {
    if (S.view === null) {
      const cls = classifiedIds();
      S.allMessages = await idbGetUnclassifiedMessages(cls);
    } else {
      const folder = S.folders.find(f => f.id === S.view);
      if (!folder) {
        // S.view 指向已被刪除的資料夾 — reset 回未歸類視圖以避免後續操作基於失效狀態
        S.view = null;
        const cls = classifiedIds();
        S.allMessages = await idbGetUnclassifiedMessages(cls);
        return;
      }
      // 父資料夾：合併自身 + 所有子資料夾的訊息，按 ts/seq 時序排
      const children = S.folders.filter(f => f.parentId === folder.id);
      if (children.length > 0) {
        const allIds = [...folder.msgIds, ...children.flatMap(c => c.msgIds)];
        const msgs = await idbGetMessagesByIds(allIds);
        msgs.sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0) || (a.seq ?? 0) - (b.seq ?? 0));
        S.allMessages = msgs;
      } else {
        const msgs = await idbGetMessagesByIds(folder.msgIds);
        // 純子資料夾 / 無子的父資料夾：保持 msgIds 既有順序
        const orderMap = new Map(folder.msgIds.map((id, i) => [id, i]));
        msgs.sort((a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0));
        S.allMessages = msgs;
      }
    }
  } catch(e) { S.allMessages = []; }
}

/* ══════════════════════════════════════════════════════════
   Render — Messages
══════════════════════════════════════════════════════════ */
// Cancel token：每次新的 renderMsgs 呼叫都會讓上一次的批次失效
let _renderGeneration = 0;

// 當前 renderMsgs 完成後 resolve 的 Promise（供 jumpToEvent 等待）
let _renderDonePromise = Promise.resolve();

function buildMsgElement(msg, idx, msgs) {
  if (msg.type === 'sep') {
    const el = document.createElement('div');
    el.className = 'msg-separator';
    el.dataset.id = msg.id;
    el.textContent = '· · ·';
    return el;
  }

  if (isSystemDividerMsg(msg.name)) {
    const sys = document.createElement('div');
    sys.className = 'msg-system-divider';
    sys.dataset.id = msg.id;
    sys.dataset.idx = idx;
    const text = document.createElement('div');
    text.className = 'msg-system-text';
    text.innerHTML = renderLines(msg.lines);
    sys.appendChild(text);
    // 事件透過 #message-list 委派處理（見 initMessageListDelegation）
    return sys;
  }

  const role = roleOf(msg.name);
  const displayName = displayNameOf(msg.name);
  const row = document.createElement('div');
  row.className = `msg-row ${role}`;
  row.dataset.id  = msg.id;
  row.dataset.idx = idx;

  if (S.selSet.has(msg.id)) {
    row.classList.add(msg.id === S.selAnchor ? 'sel-anchor' : 'sel-range');
  }

  const avatar = document.createElement('div');
  avatar.className = 'msg-avatar';
  const avatarKey = role === 'character' ? 'avatarChar' : 'avatarPlayer';
  if (S[avatarKey]) {
    const img = document.createElement('img');
    img.src = S[avatarKey];
    avatar.appendChild(img);
  } else {
    avatar.textContent = (displayName[0] || '?');
  }

  const col = document.createElement('div');
  col.className = 'msg-col';

  const nameEl = document.createElement('div');
  nameEl.className = 'msg-name';
  nameEl.textContent = displayName;

  const wrap = document.createElement('div');
  wrap.className = 'msg-wrap';

  const timeEl = document.createElement('div');
  timeEl.className = 'msg-time';
  timeEl.textContent = formatTime(msg.tsStr);

  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';
  bubble.innerHTML = renderLines(msg.lines);

  wrap.appendChild(bubble);
  wrap.appendChild(timeEl);

  col.appendChild(nameEl);
  col.appendChild(wrap);

  row.appendChild(avatar);
  row.appendChild(col);
  // 事件透過 #message-list 委派處理（見 initMessageListDelegation）

  return row;
}

/* ──────────────────────────────────────────────────────────
   訊息事件委派 — 把原本每筆訊息 3 個 listener 壓成 list 上 3 個
   靠 closest('[data-id]') 找回對應節點，idx 從 dataset.idx 讀
────────────────────────────────────────────────────────── */
function initMessageListDelegation() {
  const list = $('message-list');
  if (!list || list._delegationBound) return;
  list._delegationBound = true;

  // 捲動時 debounced 記錄當前 view 的可見訊息錨點
  list.addEventListener('scroll', scheduleScrollCapture, { passive: true });
  // 關閉 / 重新整理前最後一次保存（捕捉到還沒 debounce 觸發的位置）
  window.addEventListener('beforeunload', captureCurrentScrollAnchor);

  const findTarget = e => e.target.closest('.msg-row, .msg-system-divider');

  list.addEventListener('click', e => {
    const el = findTarget(e);
    if (!el) return;
    const msgId = el.dataset.id;
    const idx = +el.dataset.idx;
    handleClick(msgId, idx, S.allMessages);
  });

  list.addEventListener('dblclick', e => {
    const el = findTarget(e);
    if (!el) return;
    e.preventDefault();
    window.getSelection().removeAllRanges();
    editMessage(el.dataset.id);
  });

  list.addEventListener('mousedown', e => {
    const el = findTarget(e);
    if (!el) return;
    handleMouseDown(e, el.dataset.id);
  });
}

const RENDER_BATCH_SIZE = 40;
const _ric = typeof requestIdleCallback === 'function'
  ? (cb) => requestIdleCallback(cb, { timeout: 300 })
  : (cb) => setTimeout(cb, 0);

async function renderMsgs() {
  const gen = ++_renderGeneration;
  // 同步換上新的 promise，讓呼叫後立即 await _renderDonePromise 的程式
  // （如 jumpToEvent）等到的是「這一次」render 的完成
  let done;
  _renderDonePromise = new Promise(resolve => { done = resolve; });
  const list = $('message-list');
  list.innerHTML = `<div class="empty-state"><small>${t('msg.loading')}</small></div>`;
  await loadViewMessages();
  if (gen !== _renderGeneration) { done(); return; } // 已被新的呼叫取代

  const msgs = visibleMsgs();
  list.innerHTML = '';

  if (msgs.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <small>${t('msg.uploadEmpty')}</small>
      </div>`;
    done();
    return;
  }

  // 第一批同步渲染，避免空白感
  const firstBatch = msgs.slice(0, RENDER_BATCH_SIZE);
  const frag = document.createDocumentFragment();
  firstBatch.forEach((msg, i) => frag.appendChild(buildMsgElement(msg, i, msgs)));
  list.appendChild(frag);

  if (msgs.length <= RENDER_BATCH_SIZE) {
    done();
    return;
  }

  // 剩餘批次用 idle callback 分批追加
  let offset = RENDER_BATCH_SIZE;
  function appendNext() {
    if (gen !== _renderGeneration) { done(); return; }
    const batch = msgs.slice(offset, offset + RENDER_BATCH_SIZE);
    if (batch.length === 0) { done(); return; }
    const f = document.createDocumentFragment();
    batch.forEach((msg, i) => f.appendChild(buildMsgElement(msg, offset + i, msgs)));
    list.appendChild(f);
    offset += RENDER_BATCH_SIZE;
    if (offset < msgs.length) _ric(appendNext);
    else done();
  }
  _ric(appendNext);
}

function formatTime(tsStr) {
  if (!tsStr) return '';
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(tsStr)) return tsStr;
  const m = tsStr.match(/(\d{1,2}:\d{2})/);
  return m ? m[1] : '';
}

// 剪貼簿輔助函式
function copyTextToClipboard(text, callback) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(callback).catch(() => fallbackCopy(text, callback));
  } else {
    fallbackCopy(text, callback);
  }
}
function fallbackCopy(text, callback) {
  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.style.position = "fixed";
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  try { document.execCommand('copy'); if(callback) callback(); } catch (err) {}
  document.body.removeChild(textArea);
}

/* ══════════════════════════════════════════════════════════
   Selection logic
══════════════════════════════════════════════════════════ */
function handleClick(msgId, idx, msgs) {
  if (S.isDragging) return;
  if (!S.selAnchor) {
    S.selAnchor = msgId;
    S.selEnd    = null;
    S.selSet    = new Set([msgId]);
  } else if (!S.selEnd) {
    if (msgId === S.selAnchor) {
      clearSel();
    } else {
      S.selEnd = msgId;
      // 不使用傳入的 idx（dataset.idx 在就地刪除訊息後會過期），改由陣列即時查找
      const ai = msgs.findIndex(m => m.id === S.selAnchor);
      const ci = msgs.findIndex(m => m.id === msgId);
      const lo = Math.min(ai, ci);
      const hi = Math.max(ai, ci);
      S.selSet = new Set();
      for (let i = lo; i <= hi; i++) {
        if (msgs[i]?.type === 'msg') S.selSet.add(msgs[i].id);
      }
    }
  } else {
    clearSel();
  }
  applySelectionDOM();
}

// 只更新選取狀態的 DOM class，不重新渲染整個列表
function applySelectionDOM() {
  const list = $('message-list');
  list.querySelectorAll('.msg-row, .msg-system-divider').forEach(el => {
    const id = el.dataset.id;
    el.classList.remove('sel-anchor', 'sel-range');
    if (S.selSet.has(id)) {
      el.classList.add(id === S.selAnchor ? 'sel-anchor' : 'sel-range');
    }
  });
}

function clearSel() {
  S.selAnchor = null;
  S.selEnd    = null;
  S.selSet    = new Set();
  const list = $('message-list');
  if (list) {
    list.querySelectorAll('.sel-anchor, .sel-range').forEach(el => {
      el.classList.remove('sel-anchor', 'sel-range');
    });
  }
}

/* ══════════════════════════════════════════════════════════
   Drag
══════════════════════════════════════════════════════════ */
function handleMouseDown(e, msgId) {
  if (!S.selSet.has(msgId)) return;
  if (e.detail > 1) return;
  e.preventDefault();
  S.mx = e.clientX;
  S.my = e.clientY;
  S.dragType = 'msg';
  S.dragTimer = setTimeout(() => startDrag(), 400);
}

// 拖曳期間共用的 folder rect 快取，避免每次 mousemove 都 reflow
let _dragFolderRects = [];
let _songDragCards = [];
let _songDragCardMap = new Map();
let _songDragHoverIdx = -1;
let _songDragHoverPos = '';
let _songDragRaf = 0;
let _songRenderCleanups = [];
function snapshotFolderRects() {
  _dragFolderRects = [...document.querySelectorAll('.folder-item[data-folder-id]')].map(el => ({
    el,
    fid: el.dataset.folderId,
    rect: el.getBoundingClientRect()
  }));
}

function snapshotSongDragRects() {
  _songDragCards = [...document.querySelectorAll('.song-card')].map(el => {
    const card = {
      el,
      idx: parseInt(el.dataset.idx, 10),
      rect: el.getBoundingClientRect()
    };
    return card;
  });
  _songDragCardMap = new Map(_songDragCards.map(card => [card.idx, card]));
}

function clearSongDragIndicators() {
  _songDragCards.forEach(({ el }) => el.classList.remove('drag-over-top', 'drag-over-bottom', 'dragging'));
  _songDragHoverIdx = -1;
  _songDragHoverPos = '';
}

function cleanupSongRenderResources() {
  _songRenderCleanups.forEach(fn => {
    try { fn(); } catch (_) {}
  });
  _songRenderCleanups = [];
}

function updateSongDragHover(clientX, clientY) {
  let nextIdx = -1;
  let nextPos = '';

  for (const { idx, rect: r } of _songDragCards) {
    if (idx === S.dragSongIdx) continue;
    if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) {
      nextIdx = idx;
      nextPos = clientY > r.top + r.height / 2 ? 'bottom' : 'top';
      break;
    }
  }

  if (nextIdx === _songDragHoverIdx && nextPos === _songDragHoverPos) return;

  if (_songDragHoverIdx !== -1) {
    const prev = _songDragCardMap.get(_songDragHoverIdx);
    prev?.el.classList.remove('drag-over-top', 'drag-over-bottom');
  }

  _songDragHoverIdx = nextIdx;
  _songDragHoverPos = nextPos;

  if (nextIdx !== -1) {
    const next = _songDragCardMap.get(nextIdx);
    next?.el.classList.add(nextPos === 'bottom' ? 'drag-over-bottom' : 'drag-over-top');
  }
}

function startFolderDrag(folderId) {
  S.isDragging   = true;
  S.dragType     = 'folder';
  S.dragFolderId = folderId;
  snapshotFolderRects();
  const folder   = S.folders.find(f => f.id === folderId);
  const ghost    = $('drag-ghost');
  ghost.textContent = tf('msg.moveFolder', folder?.name || '');
  ghost.style.display = 'block';
  ghost.style.left = (S.mx + 14) + 'px';
  ghost.style.top  = (S.my + 14) + 'px';
}

function startDrag() {
  S.isDragging = true;
  snapshotFolderRects();
  const ghost = $('drag-ghost');
  ghost.textContent = tf('msg.moveMsgs', S.selSet.size);
  ghost.style.display = 'block';
  ghost.style.left = (S.mx + 14) + 'px';
  ghost.style.top  = (S.my + 14) + 'px';
}

document.addEventListener('mousemove', e => {
  S.mx = e.clientX;
  S.my = e.clientY;

  // 火焰特效只在官網模式顯示，Story Mode 下不必每次 mousemove 都寫 CSS 變數
  if (document.body.classList.contains('site-mode')) {
    const bgLayer = document.getElementById('bg-layer');
    if (bgLayer) {
      bgLayer.style.setProperty('--mouse-x', e.clientX + 'px');
      bgLayer.style.setProperty('--mouse-y', e.clientY + 'px');
    }
  }

  if (!S.isDragging) return;

  const ghost = $('drag-ghost');
  ghost.style.left = (e.clientX + 14) + 'px';
  ghost.style.top  = (e.clientY + 14) + 'px';

  if (S.dragType === 'msg') {
    _dragFolderRects.forEach(({ el, rect: r }) => {
      const over = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      el.classList.toggle('drag-over', over);
    });

    const tr = $('trash-drop').getBoundingClientRect();
    const overTrash = e.clientX >= tr.left && e.clientX <= tr.right && e.clientY >= tr.top && e.clientY <= tr.bottom;
    $('trash-drop').classList.toggle('drag-over', overTrash);
    $('trash-label').textContent = overTrash ? tf('msg.deleteMsgsN', S.selSet.size) : t('left.trash');
  } else if (S.dragType === 'folder') {
    _dragFolderRects.forEach(({ el, fid, rect: r }) => {
      if (fid === '__unc__' || fid === S.dragFolderId) { el.classList.remove('drag-over'); return; }
      const target = S.folders.find(f => f.id === fid);
      if (target?.parentId) { el.classList.remove('drag-over'); return; }
      const over = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      el.classList.toggle('drag-over', over);
    });
  } else if (S.dragType === 'song') {
    if (!_songDragRaf) {
      const { clientX, clientY } = e;
      _songDragRaf = requestAnimationFrame(() => {
        _songDragRaf = 0;
        updateSongDragHover(clientX, clientY);
      });
    }
  }
});

document.addEventListener('mouseup', e => {
  clearTimeout(S.dragTimer);
  if (!S.isDragging) return;
  S.isDragging = false;
  $('drag-ghost').style.display = 'none';

  if (S.dragType === 'song') {
    if (_songDragRaf) {
      cancelAnimationFrame(_songDragRaf);
      _songDragRaf = 0;
    }
    let targetIdx = _songDragHoverIdx === -1
      ? -1
      : _songDragHoverPos === 'bottom'
        ? _songDragHoverIdx + 1
        : _songDragHoverIdx;
    clearSongDragIndicators();

    if (targetIdx !== -1) {
      if (S.dragSongIdx < targetIdx) targetIdx--;
      if (targetIdx !== S.dragSongIdx) {
        const [moved] = S.songs.splice(S.dragSongIdx, 1);
        S.songs.splice(targetIdx, 0, moved);
        save();
        renderSongsList();
      }
    }
    _songDragCards = [];
    _songDragCardMap = new Map();
    S.dragSongIdx = null;
    S.dragType = 'msg';
    return;
  }

  $('trash-drop').classList.remove('drag-over');
  $('trash-label').textContent = t('left.trash');
  document.querySelectorAll('.folder-item').forEach(el => el.classList.remove('drag-over'));

  if (S.dragType === 'folder') {
    let target = null;
    document.querySelectorAll('.folder-item[data-folder-id]').forEach(el => {
      const fid = el.dataset.folderId;
      if (fid === '__unc__' || fid === S.dragFolderId) return;
      const tf = S.folders.find(f => f.id === fid);
      if (tf?.parentId) return;
      const r = el.getBoundingClientRect();
      if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
        target = fid;
      }
    });
    if (target) {
      const dragged = S.folders.find(f => f.id === S.dragFolderId);
      if (dragged) {
        let p = target;
        let hasCycle = false;
        while (p) {
          if (p === dragged.id) { hasCycle = true; break; }
          p = S.folders.find(f => f.id === p)?.parentId || null;
        }
        if (!hasCycle) {
          dragged.parentId = target;
          renderFolders();
          save();
        }
      }
    }
    S.dragFolderId = null;
    S.dragType = 'msg';
    return;
  }

  const tr = $('trash-drop').getBoundingClientRect();
  if (e.clientX >= tr.left && e.clientX <= tr.right && e.clientY >= tr.top && e.clientY <= tr.bottom) {
    confirmDelete();
    return;
  }

  let target = null;
  document.querySelectorAll('.folder-item[data-folder-id]').forEach(el => {
    const r = el.getBoundingClientRect();
    if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
      target = el.dataset.folderId;
    }
  });

  if (target) {
    if (target === '__unc__') {
      // 計算「目前有分類」的訊息數 — 這些訊息將被移回未歸類，故未歸類計數要 +restoredCount
      // 注意：必須在 mutation 之前計算，否則 some() 會找不到分類
      const restoredCount = [...S.selSet].filter(id => {
        return S.folders.some(f => f.msgIds.includes(id));
      }).length;
      S.folders.forEach(f => { f.msgIds = f.msgIds.filter(id => !S.selSet.has(id)); });
      clearSel();
      renderFolders();
      renderMsgs();
      renderRight();
      adjustUnclassifiedCount(restoredCount);
      save();
    } else {
      dropIntoFolder(target);
    }
  }
});

function dropIntoFolder(folderId) {
  const folder = S.folders.find(f => f.id === folderId);
  if (!folder) return;
  const cls = classifiedIds();
  const wasUnclassified = [...S.selSet].filter(id => !cls.has(id)).length;
  S.folders.forEach(f => { f.msgIds = f.msgIds.filter(id => !S.selSet.has(id)); });
  const have = new Set(folder.msgIds);
  S.selSet.forEach(id => { if (!have.has(id)) folder.msgIds.push(id); });
  const orderMap = new Map(S.allMessages.map((m, i) => [m.id, i]));
  folder.msgIds.sort((a, b) => (orderMap.get(a) ?? 0) - (orderMap.get(b) ?? 0));
  clearSel();
  renderFolders();
  renderMsgs();
  renderRight();
  adjustUnclassifiedCount(-wasUnclassified);
  save();
}

/* ══════════════════════════════════════════════════════════
   Modal System
══════════════════════════════════════════════════════════ */
let modalConfirmCallback = null;
let modalCancelCallback = null;

function showModal(opts) {
  $('modal-title').textContent = opts.title;
  const descEl = $('modal-desc');
  descEl.textContent = opts.desc || '';
  descEl.style.display = opts.desc ? '' : 'none';
  // 沒有 desc 時，標題底部要補回相當於上方 padding 的間距，避免標題偏上、上下留白不對稱
  $('modal-box').classList.toggle('no-desc', !opts.desc);
  $('modal-overlay').style.display = 'flex';
  
  const input = $('modal-input-field');
  const textarea = $('modal-textarea-field');
  const customBody = $('modal-custom-body');
  input.style.display = 'none';
  textarea.style.display = 'none';
  customBody.style.display = 'none';
  customBody.innerHTML = '';

  let activeField = null;
  if (opts.showInput) {
    input.style.display = 'block';
    input.value = opts.inputValue || '';
    activeField = input;
  } else if (opts.showTextarea) {
    textarea.style.display = 'block';
    textarea.value = opts.inputValue || '';
    activeField = textarea;
  } else if (opts.customHtml) {
    customBody.style.display = 'block';
    customBody.innerHTML = opts.customHtml;
    if (typeof opts.onOpen === 'function') opts.onOpen(customBody);
  }
  
  if (activeField) setTimeout(() => activeField.focus(), 50);
  
  const confirmBtn = $('modal-confirm');
  confirmBtn.className = 'modal-btn ' + (opts.confirmClass || 'btn-primary');
  confirmBtn.textContent = opts.confirmText || t('modal.confirm');
  $('modal-cancel').textContent = opts.cancelText || t('modal.cancel');

  modalConfirmCallback = () => {
    const val = typeof opts.valueResolver === 'function'
      ? opts.valueResolver(customBody)
      : (activeField ? activeField.value : null);
    if (opts.onConfirm) opts.onConfirm(val);
  };
  modalCancelCallback = () => {
    if (opts.onCancel) opts.onCancel();
  };
}

$('modal-cancel').addEventListener('click', () => {
  $('modal-overlay').style.display = 'none';
  if (modalCancelCallback) modalCancelCallback();
  modalConfirmCallback = null;
  modalCancelCallback = null;
});
$('modal-confirm').addEventListener('click', () => {
  $('modal-overlay').style.display = 'none';
  if (modalConfirmCallback) modalConfirmCallback();
  modalConfirmCallback = null;
  modalCancelCallback = null;
});

// Modal 鍵盤操作：Esc 取消、Enter 確認
// - textarea 中 Enter 是換行，不攔截
// - 焦點在按鈕上時交給瀏覽器原生行為（Enter 觸發該按鈕），避免蓋掉「取消」
document.addEventListener('keydown', e => {
  if ($('modal-overlay').style.display !== 'flex') return;
  if (e.key === 'Escape') { e.preventDefault(); $('modal-cancel').click(); return; }
  if (e.key !== 'Enter') return;
  if (e.target === $('modal-textarea-field') || e.target.tagName === 'BUTTON') return;
  e.preventDefault();
  $('modal-confirm').click();
});

/* ══════════════════════════════════════════════════════════
   Edit / Delete Messages
══════════════════════════════════════════════════════════ */
function editMessage(msgId) {
  const msg = S.allMessages.find(m => m.id === msgId);
  if (!msg || msg.type !== 'msg') return;
  showModal({
    title: t('msg.edited'),
    desc: tf('msg.editingFor', msg.name),
    showTextarea: true,
    inputValue: msg.lines.join('\n'),
    confirmText: t('modal.save'),
    onConfirm: (val) => {
      if (val !== null) {
        const newLines = val.split(/\r?\n/);
        while (newLines.length && newLines[newLines.length - 1].trim() === '') newLines.pop();
        msg.lines = newLines;
        idbUpdateMessage(msg).catch(err => console.warn('idbUpdateMessage:', err));
        // 就地更新 bubble，避免重載整個訊息列表
        const eid = CSS.escape(msg.id);
        const row = document.querySelector(`.msg-row[data-id="${eid}"], .msg-system-divider[data-id="${eid}"]`);
        if (row) {
          const bubble = row.querySelector('.msg-bubble') || row.querySelector('.msg-system-text');
          if (bubble) bubble.innerHTML = renderLines(msg.lines);
        }
        save();
      }
    }
  });
}

function confirmDelete() {
  const count = S.selSet.size;
  showModal({
    title: t('msg.confirmDelete'),
    desc: tf('msg.deleteN', count),
    confirmClass: 'btn-danger',
    confirmText: t('modal.delete'),
    onConfirm: () => {
      const ids = [...S.selSet];
      const cls = classifiedIds();
      const wasUnclassified = ids.filter(id => !cls.has(id)).length;
      idbDeleteMessages(ids).catch(err => console.warn('idbDeleteMessages:', err));
      const idSet = new Set(ids);
      S.allMessages = S.allMessages.filter(m => !idSet.has(m.id));
      S.folders.forEach(f => { f.msgIds = f.msgIds.filter(id => !S.selSet.has(id)); });
      // 直接從 DOM 移除，避免重繪導致捲動位置跳回頂部
      const list = $('message-list');
      ids.forEach(id => {
        list.querySelector(`[data-id="${CSS.escape(id)}"]`)?.remove();
      });
      clearSel();
      renderFolders();
      renderRight();
      adjustUnclassifiedCount(-wasUnclassified);
      save();
    }
  });
}

/* ══════════════════════════════════════════════════════════
   Render — Folders
══════════════════════════════════════════════════════════ */

const FOLDER_ICONS = {
  file: `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M6 2c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6H6zm7 7V3.5L18.5 9H13z"/></svg>`,
  work: `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>`,
  love: `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>`,
  hot:  `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M13.5 0.67s.74 2.65.74 4.8c0 2.06-1.35 3.73-3.41 3.73-2.07 0-3.63-1.67-3.63-3.73l.03-.36C5.21 7.51 4 10.62 4 14c0 4.42 3.58 8 8 8s8-3.58 8-8C20 8.61 17.41 3.8 13.5 0.67zM11.71 19c-1.78 0-3.22-1.4-3.22-3.14 0-1.62 1.05-2.76 2.81-3.12 1.77-.36 3.6-1.21 4.62-2.58.39 1.29.59 2.65.59 4.04 0 2.65-2.15 4.8-4.8 4.8z"/></svg>`,
  sad:  `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z"/><circle cx="8.5" cy="10.5" r="1.5"/><circle cx="15.5" cy="10.5" r="1.5"/><path d="M15.53 16.5c-.77-1.54-2.3-2.5-3.53-2.5s-2.76.96-3.53 2.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" fill="none"/><path d="M9.5 15 Q8.5 17.5 8.8 19.2" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" fill="none"/></svg>`,
  bookmark: `<svg viewBox="0 -960 960 960" width="16" height="16" fill="currentColor"><path d="m668-380 152-130 120 10-176 153 52 227-102-62-46-198Zm-94-292-42-98 46-110 92 217-96-9ZM294-287l126-76 126 77-33-144 111-96-146-13-58-136-58 135-146 13 111 97-33 143ZM173-120l65-281L20-590l288-25 112-265 112 265 288 25-218 189 65 281-247-149-247 149Zm247-340Z"/></svg>`,
};

const FOLDER_ICON_LABELS = new Proxy({}, { get(_, k){
  if (k === 'file') return t('folderIcon.file');
  if (k === 'work') return t('folderIcon.work');
  if (k === 'bookmark') return _curLang === 'en' ? 'Bookmark' : '書籤';
  return ({ love:'Love', hot:'Hot', sad:'SAD' })[k];
} });

const FOLDER_ICON_PARENT = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" width="16" height="16" fill="currentColor"><path d="M480-160q-48-38-104-59t-116-21q-42 0-82.5 11T100-198q-21 11-40.5-1T40-234v-482q0-11 5.5-21T62-752q46-24 96-36t102-12q58 0 113.5 15T480-740v484q51-32 107-48t113-16q36 0 70.5 6t69.5 18v-480q15 5 29.5 10.5T898-752q11 5 16.5 15t5.5 21v482q0 23-19.5 35t-40.5 1q-37-20-77.5-31T700-240q-60 0-116 21t-104 59Zm80-200v-380l200-200v400L560-360Zm-160 65v-396q-33-14-68.5-21.5T260-720q-37 0-72 7t-68 21v397q35-13 69.5-19t70.5-6q36 0 70.5 6t69.5 19Zm0 0v-396 396Z"/></svg>`;

function getFolderIcon(folder, isChild) {
  if (isChild) {
    const key = folder.icon || 'file';
    return FOLDER_ICONS[key] || FOLDER_ICONS.file;
  }
  return FOLDER_ICON_PARENT;
}

function makeFolderEl(folder, isChild) {
  const el = document.createElement('div');
  // 摺疊按鈕（只有父資料夾且有子資料夾才顯示）
  const hasChildren = !isChild && S.folders.some(f => f.parentId === folder.id);
  const isExpanded = hasChildren && !S.collapsedFolders.has(folder.id);

  el.className = 'folder-item' + (S.view === folder.id ? ' active' : '') + (isChild ? ' subfolder' : '') + (isExpanded ? ' expanded-parent' : '');
  el.dataset.folderId = folder.id;

  if (hasChildren) {
    const isCollapsed = S.collapsedFolders.has(folder.id);
    const collapseBtn = document.createElement('button');
    collapseBtn.className = 'folder-collapse-btn' + (isCollapsed ? ' collapsed' : '');
    setBtnLabel(collapseBtn, isCollapsed ? t('folder.expand') : t('folder.collapse'));
    collapseBtn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M7 10l5 5 5-5z"/></svg>`;
    collapseBtn.addEventListener('mousedown', e => e.stopPropagation());
    collapseBtn.addEventListener('click', e => {
      e.stopPropagation();
      if (S.collapsedFolders.has(folder.id)) {
        S.collapsedFolders.delete(folder.id);
      } else {
        S.collapsedFolders.add(folder.id);
      }
      save();
      renderFolders();
    });
    el.appendChild(collapseBtn);
  }

  const iconSpan = document.createElement('span');
  iconSpan.className = 'folder-icon';
  iconSpan.innerHTML = getFolderIcon(folder, isChild);
  el.appendChild(iconSpan);

  const labelSpan = document.createElement('span');
  labelSpan.className = 'folder-label';
  labelSpan.textContent = folder.name;
  el.appendChild(labelSpan);

  const countSpan = document.createElement('span');
  countSpan.className = 'folder-count';
  if (!isChild) {
    const childTotal = _childTotalMap.get(folder.id) || 0;
    countSpan.textContent = folder.msgIds.length + childTotal;
  } else {
    countSpan.textContent = folder.msgIds.length;
  }
  el.appendChild(countSpan);

  const btns = document.createElement('div');
  btns.className = 'folder-btns';
  const moreBtn = document.createElement('button');
  moreBtn.className = 'icon-btn';
  setBtnLabel(moreBtn, t('folder.more'));
  moreBtn.textContent = '⋯';
  moreBtn.addEventListener('click', e => showFolderMenu(e, folder.id));
  btns.appendChild(moreBtn);
  el.appendChild(btns);

  el.addEventListener('click', () => switchView(folder.id, folder.name));
  addKeyActivation(el);
  el.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    if (e.target.closest('button')) return;
    S.mx = e.clientX;
    S.my = e.clientY;
    S.dragTimer = setTimeout(() => startFolderDrag(folder.id), 400);
  });
  return el;
}

// 預先計算每個父資料夾的子資料夾訊息總和，避免在 makeFolderEl 中 O(n²)
let _childTotalMap = new Map();
function buildChildTotalMap() {
  _childTotalMap = new Map();
  for (const f of S.folders) {
    if (f.parentId) {
      _childTotalMap.set(f.parentId, (_childTotalMap.get(f.parentId) || 0) + f.msgIds.length);
    }
  }
}

function renderFolders() {
  buildChildTotalMap();
  const list = $('folder-list');
  // 先組在 fragment 裡，最後一次換掉整份子節點，避免逐一 appendChild 反覆觸發版面重算
  const frag = document.createDocumentFragment();

  const SVG_BOOK = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" width="16" height="16" fill="currentColor"><path d="M280-280h280v-80H280v80Zm0-160h400v-80H280v80Zm0-160h400v-80H280v80Zm-80 480q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Zm0-80h560v-560H200v560Zm0-560v560-560Z"/></svg>`;

  const unc = document.createElement('div');
  unc.className = 'folder-item' + (S.view === null ? ' active' : '');
  unc.dataset.folderId = '__unc__';
  unc.innerHTML = `
    <span class="folder-icon">${SVG_BOOK}</span>
    <span class="folder-label">${esc(t('folder.uncategorized'))}</span>
    <span class="folder-count">${unclassifiedCount()}</span>`;
    
  const uncBtns = document.createElement('div');
  uncBtns.className = 'folder-btns';
  const uncMore = document.createElement('button');
  uncMore.className = 'icon-btn';
  setBtnLabel(uncMore, t('folder.exportOrOrg'));
  uncMore.textContent = '⋯';
  uncMore.addEventListener('click', e => showFolderMenu(e, '__unc__'));
  uncBtns.appendChild(uncMore);
  unc.appendChild(uncBtns);

  unc.addEventListener('click', () => switchView(null, t('folder.uncategorized')));
  addKeyActivation(unc);
  frag.appendChild(unc);

  const topFolders = S.folders.filter(f => !f.parentId);
  topFolders.sort((a, b) => S.folderSort === 'desc' ? b.createdAt - a.createdAt : a.createdAt - b.createdAt);

  topFolders.forEach(folder => {
    frag.appendChild(makeFolderEl(folder, false));
    if (!S.collapsedFolders.has(folder.id)) {
      const children = S.folders.filter(f => f.parentId === folder.id);
      children.sort((a, b) => S.folderSort === 'desc' ? b.createdAt - a.createdAt : a.createdAt - b.createdAt);
      children.forEach(child => frag.appendChild(makeFolderEl(child, true)));
    }
  });

  list.replaceChildren(frag);
}

$('sort-folder-btn').addEventListener('click', () => {
  S.folderSort = S.folderSort === 'asc' ? 'desc' : 'asc';
  $('sort-folder-btn').textContent = S.folderSort === 'asc' ? '▲' : '▼';
  renderFolders();
  save();
});

// 依當前 view 更新中欄標題；父資料夾若有子章節，附註「含子章節」表示目前是合併視圖
function updateMidHeaderTitle(title) {
  const folder = S.view === null ? null : S.folders.find(f => f.id === S.view);
  const name = title !== undefined
    ? title
    : (S.view === null ? t('folder.uncategorized') : (folder?.name || ''));
  const hasChildren = folder && !folder.parentId && S.folders.some(f => f.parentId === folder.id);
  $('mid-header-title').textContent = hasChildren ? `${name} · ${t('folder.withChildren')}` : name;
}

async function switchView(id, title) {
  // 切換前先記住當前 view 的捲動位置
  captureCurrentScrollAnchor();
  S.view = id;
  saveViewState();
  clearSel();
  const folder = S.folders.find(f => f.id === id);
  updateMidHeaderTitle(title);

  if (folder) {
    let targetDateStr = null;
    // 優先跳到此檢視（含子資料夾）最早的事件日期，與右側事件清單一致；
    // 子資料夾的事件不會被父資料夾自身的訊息日期蓋掉
    const eventDates = getEventFoldersForCurrentView()
      .flatMap(f => f.notes || [])
      .map(n => n.date)
      .filter(Boolean)
      .sort();
    if (eventDates.length > 0) targetDateStr = eventDates[0];
    else {
      await loadViewMessages();
      const msgs = visibleMsgs();
      if (msgs.length > 0) targetDateStr = extractDateFromMsg(msgs[0]);
    }
    const d = targetDateStr ? new Date(targetDateStr) : null;
    if (d && !isNaN(d.getTime())) {
      S.calDate = new Date(d.getFullYear(), d.getMonth(), 1);
    } else {
      // 無事件也無訊息日期可依據時，回到本月，避免停留在上一個資料夾的月份
      const now = new Date();
      S.calDate = new Date(now.getFullYear(), now.getMonth(), 1);
    }
  }

  renderFolders();
  renderMsgs().then(restoreScrollAnchor);
  renderRight();
}

/* ══════════════════════════════════════════════════════════
   Folder Context Menu Actions
══════════════════════════════════════════════════════════ */
let activeFolderIdForMenu = null;

function showFolderMenu(e, folderId) {
  e.stopPropagation();
  activeFolderIdForMenu = folderId;
  const menu = $('folder-menu');

  const isUnc = (folderId === '__unc__');
  const folder = S.folders.find(f => f.id === folderId);
  const isChild = !!(folder?.parentId);

  // 先決定項目可見性（影響選單高度），再顯示量尺寸並夾進視窗，
  // 避免對底部資料夾操作時選單被截掉
  $('menu-item-ren').style.display  = isUnc ? 'none' : 'flex';
  $('menu-item-icon').style.display = isChild ? 'flex' : 'none';
  $('menu-item-div').style.display  = isUnc ? 'none' : 'block';
  $('menu-item-del').style.display  = isUnc ? 'none' : 'flex';

  menu.style.visibility = 'hidden';
  menu.style.display = 'flex';
  const mw = menu.offsetWidth, mh = menu.offsetHeight;
  let left = e.clientX + 10;
  let top  = e.clientY;
  if (left + mw > window.innerWidth - 8) left = e.clientX - mw - 10;
  if (left < 8) left = 8;
  if (top + mh > window.innerHeight - 8) top = window.innerHeight - mh - 8;
  if (top < 8) top = 8;
  menu.style.left = left + 'px';
  menu.style.top = top + 'px';
  menu.style.visibility = 'visible';
}

document.addEventListener('click', () => {
  const menu = $('folder-menu');
  if (menu) menu.style.display = 'none';
});

$('menu-item-ren').addEventListener('click', () => {
  if (!activeFolderIdForMenu || activeFolderIdForMenu === '__unc__') return;
  const folder = S.folders.find(f => f.id === activeFolderIdForMenu);
  if (!folder) return;
  showModal({
    title: t('folder.rename'),
    desc: t('folder.renamePrompt'),
    showInput: true,
    inputValue: folder.name,
    confirmText: t('modal.save'),
    onConfirm: (val) => {
      if (val?.trim()) { folder.name = val.trim(); renderFolders(); renderRight(); save(); }
    }
  });
});

/* ── Icon Picker ── */
let _iconPickerSelected = 'file';

$('menu-item-icon').addEventListener('click', () => {
  if (!activeFolderIdForMenu) return;
  const folder = S.folders.find(f => f.id === activeFolderIdForMenu);
  if (!folder) return;

  _iconPickerSelected = folder.icon || 'file';

  const grid = $('icon-picker-grid');
  grid.innerHTML = '';
  const ICON_ORDER = ['file', 'work', 'bookmark', 'sad', 'love', 'hot'];
  ICON_ORDER.forEach(key => { const svg = FOLDER_ICONS[key]; if (!svg) return;
    const cell = document.createElement('div');
    cell.className = 'icon-picker-cell' + (key === _iconPickerSelected ? ' selected' : '');
    cell.innerHTML = `<span style="display:flex;align-items:center;color:var(--c-text);">${svg}</span><span style="font-size:10px;color:var(--c-text-mute);">${FOLDER_ICON_LABELS[key]}</span>`;
    cell.dataset.key = key;
    cell.addEventListener('click', () => {
      _iconPickerSelected = key;
      grid.querySelectorAll('[data-key]').forEach(c => c.classList.toggle('selected', c.dataset.key === key));
    });
    grid.appendChild(cell);
  });

  $('icon-picker-overlay').style.display = 'flex';
});

$('icon-picker-cancel').addEventListener('click', () => {
  $('icon-picker-overlay').style.display = 'none';
});

$('icon-picker-save').addEventListener('click', () => {
  const folder = S.folders.find(f => f.id === activeFolderIdForMenu);
  if (folder) {
    folder.icon = _iconPickerSelected;
    renderFolders();
    save();
  }
  $('icon-picker-overlay').style.display = 'none';
});

$('icon-picker-overlay').addEventListener('click', e => {
  if (e.target === $('icon-picker-overlay')) $('icon-picker-overlay').style.display = 'none';
});

async function getOrderedFolderMessages(folder) {
  const msgs = await idbGetMessagesByIds(folder.msgIds);
  const orderMap = new Map(folder.msgIds.map((id, i) => [id, i]));
  msgs.sort((a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0));
  return msgs;
}

$('menu-item-exp').addEventListener('click', async () => {
  if (!activeFolderIdForMenu) return;
  let folderExports = [];
  let folderName = '';
  let separateExport = false;

  if (activeFolderIdForMenu === '__unc__') {
    const cls = classifiedIds();
    const msgs = await idbGetUnclassifiedMessages(cls);
    folderExports = [{ name: t('folder.uncategorized'), msgs }];
    folderName = t('folder.uncategorized');
  } else {
    const folder = S.folders.find(f => f.id === activeFolderIdForMenu);
    if (!folder) return;
    folderName = folder.name;
    const children = S.folders
      .filter(f => f.parentId === folder.id)
      .sort((a, b) => S.folderSort === 'desc' ? b.createdAt - a.createdAt : a.createdAt - b.createdAt);

    if (!folder.parentId && children.length > 0) {
      const selectedResult = await new Promise(resolve => {
        showModal({
          title: t('menu.exportTxt'),
          customHtml: `
            <div class="modal-checklist">
              <label class="modal-check-item modal-check-item-main">
                <input type="checkbox" data-export-folder-id="${escAttr(folder.id)}" checked>
                <span>${esc(folder.name)}</span>
              </label>
              ${children.map(child => `
                <label class="modal-check-item modal-check-item-sub">
                  <input type="checkbox" data-export-folder-id="${escAttr(child.id)}" checked>
                  <span>${esc(child.name)}</span>
                </label>
              `).join('')}
            </div>
            <label class="modal-check-item modal-check-separate">
              <input type="checkbox" data-export-separate>
              <span>${esc(t('folder.exportSeparate'))}</span>
            </label>
          `,
          onOpen: body => {
            // 主資料夾的勾選框身兼「全選 / 全不選」：勾選/取消會連動所有子資料夾；
            // 子資料夾被個別調整時，主資料夾維持自身勾選狀態，僅顯示 indeterminate 視覺提示
            const mainCb = body.querySelector('.modal-check-item-main input[data-export-folder-id]');
            const childCbs = [...body.querySelectorAll('.modal-check-item-sub input[data-export-folder-id]')];
            const syncMainIndeterminate = () => {
              const checkedCount = childCbs.filter(el => el.checked).length;
              mainCb.indeterminate = checkedCount > 0 && checkedCount < childCbs.length;
            };
            mainCb.addEventListener('change', () => {
              childCbs.forEach(el => { el.checked = mainCb.checked; });
              mainCb.indeterminate = false;
            });
            childCbs.forEach(el => el.addEventListener('change', syncMainIndeterminate));
          },
          confirmText: t('menu.exportTxt'),
          valueResolver: body => ({
            ids: [...body.querySelectorAll('[data-export-folder-id]:checked')].map(el => el.dataset.exportFolderId),
            separate: body.querySelector('[data-export-separate]').checked
          }),
          onConfirm: resolve,
          onCancel: () => resolve(null)
        });
      });

      if (!selectedResult || selectedResult.ids.length === 0) return;
      separateExport = selectedResult.separate;

      // 匯出順序一律依建立時間由舊到新（時間軸正確），不受側欄排序方向 S.folderSort 影響
      const selectedFolders = [folder, ...children]
        .filter(f => selectedResult.ids.includes(f.id))
        .sort((a, b) => a.createdAt - b.createdAt);
      folderExports = await Promise.all(selectedFolders.map(async f => ({
        name: f.name,
        msgs: await getOrderedFolderMessages(f)
      })));
    } else {
      const msgs = await getOrderedFolderMessages(folder);
      folderExports = [{ name: folder.name, msgs }];
    }
  }

  const nonEmptyExports = folderExports
    .map(item => ({ ...item, msgs: item.msgs.filter(msg => msg.type === 'msg') }))
    .filter(item => item.msgs.length > 0);

  if (nonEmptyExports.length === 0) {
    showModal({ title: t('folder.cannotExport'), desc: t('folder.noContent'), confirmText: t('msg.ok') });
    return;
  }

  const msgsToTxt = msgs => msgs.map(msg =>
    `[${msg.tsStr}] ${displayNameOf(msg.name)}:\n${msg.lines.join('\n')}\n`
  ).join('\n');

  const downloadTxt = (name, content) => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (separateExport && nonEmptyExports.length > 1) {
    // 個別匯出：每個資料夾各自產生一個 TXT 檔（瀏覽器連續多次下載時稍微錯開，避免被視為多重下載而擋下）
    nonEmptyExports.forEach((item, idx) => {
      const firstDate = extractDateFromMsg(item.msgs[0] || null);
      const fileName = `${firstDate ? `${firstDate}_` : ''}${item.name}.txt`;
      setTimeout(() => downloadTxt(fileName, msgsToTxt(item.msgs)), idx * 200);
    });
    return;
  }

  let txtContent = '';
  const multipleFolders = nonEmptyExports.length > 1;
  nonEmptyExports.forEach((item, idx) => {
    if (multipleFolders) txtContent += `=== ${item.name} ===\n\n`;
    txtContent += msgsToTxt(item.msgs) + '\n';
    if (multipleFolders && idx < nonEmptyExports.length - 1) txtContent += '\n';
  });

  const firstExportMsg = nonEmptyExports[0]?.msgs?.[0] || null;
  const firstDate = extractDateFromMsg(firstExportMsg);
  downloadTxt(`${firstDate ? `${firstDate}_` : ''}${folderName}.txt`, txtContent);
});

$('menu-item-del').addEventListener('click', () => {
  if (!activeFolderIdForMenu || activeFolderIdForMenu === '__unc__') return;
  const folder = S.folders.find(f => f.id === activeFolderIdForMenu);
  if (!folder) return;
  showModal({
    title: t('folder.delete'),
    desc: tf('folder.deleteConfirm', folder.name),
    confirmClass: 'btn-danger',
    confirmText: t('modal.delete'),
    onConfirm: () => {
      S.folders.forEach(f => { if (f.parentId === folder.id) f.parentId = null; });
      S.folders = S.folders.filter(f => f.id !== folder.id);
      // 該資料夾自身的訊息回到未歸類（子資料夾僅升級為頂層，msgIds 不受影響）
      adjustUnclassifiedCount(folder.msgIds.length);
      if (S.view === folder.id) { switchView(null, t('folder.uncategorized')); save(); }
      else { renderFolders(); renderRight(); save(); }
    }
  });
});

/* ══════════════════════════════════════════════════════════
   Jump To Event Helper
══════════════════════════════════════════════════════════ */
// 顯示某一天的所有事件清單（點擊行事曆日期時），可從中選擇要跳轉的事件
let _calPopupCleanup = null;
function closeDayEventsPopup() {
  const pop = $('cal-day-popup');
  if (pop) pop.style.display = 'none';
  if (_calPopupCleanup) { _calPopupCleanup(); _calPopupCleanup = null; }
}
function showDayEventsPopup(dayEvents, cellDateStr, anchorEl) {
  let pop = $('cal-day-popup');
  if (!pop) {
    pop = document.createElement('div');
    pop.id = 'cal-day-popup';
    document.body.appendChild(pop);
  }
  // 只有一筆事件時直接跳轉，不需要再選
  if (dayEvents.length === 1) { closeDayEventsPopup(); jumpToEvent(dayEvents[0], cellDateStr); return; }

  pop.innerHTML = '';
  const header = document.createElement('div');
  header.className = 'cal-popup-date';
  const d = new Date(cellDateStr);
  header.textContent = _curLang === 'en'
    ? d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
    : `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
  pop.appendChild(header);

  const ordered = [...dayEvents].sort((a, b) => (a._slot ?? 0) - (b._slot ?? 0));
  ordered.forEach(evt => {
    const item = document.createElement('div');
    item.className = 'cal-popup-item';
    const dot = document.createElement('span');
    dot.className = 'cal-popup-dot';
    dot.style.background = `var(--c-cat-${evt.cat})`;
    const textWrap = document.createElement('div');
    textWrap.className = 'cal-popup-text';
    const title = document.createElement('div');
    title.className = 'cal-popup-title';
    title.textContent = evt.title || t('event.unnamed');
    const folder = document.createElement('div');
    folder.className = 'cal-popup-folder';
    folder.textContent = evt.folderName || '';
    textWrap.appendChild(title);
    textWrap.appendChild(folder);
    item.appendChild(dot);
    item.appendChild(textWrap);
    item.addEventListener('click', (e) => { e.stopPropagation(); closeDayEventsPopup(); jumpToEvent(evt, cellDateStr); });
    pop.appendChild(item);
  });

  // 先顯示以取得尺寸，再定位於日期格旁，避免超出視窗
  pop.style.visibility = 'hidden';
  pop.style.display = 'flex';
  const rect = anchorEl.getBoundingClientRect();
  const pw = pop.offsetWidth, ph = pop.offsetHeight;
  let left = rect.left;
  let top = rect.bottom + 4;
  if (left + pw > window.innerWidth - 8) left = window.innerWidth - pw - 8;
  if (left < 8) left = 8;
  if (top + ph > window.innerHeight - 8) top = rect.top - ph - 4;
  if (top < 8) top = 8;
  pop.style.left = left + 'px';
  pop.style.top = top + 'px';
  pop.style.visibility = 'visible';

  // 點擊他處或捲動、按 Esc 時關閉
  const onOutside = (e) => { if (!pop.contains(e.target) && e.target !== anchorEl) closeDayEventsPopup(); };
  const onKey = (e) => { if (e.key === 'Escape') closeDayEventsPopup(); };
  setTimeout(() => document.addEventListener('mousedown', onOutside), 0);
  document.addEventListener('keydown', onKey);
  window.addEventListener('scroll', closeDayEventsPopup, { once: true, capture: true });
  _calPopupCleanup = () => {
    document.removeEventListener('mousedown', onOutside);
    document.removeEventListener('keydown', onKey);
  };
}

async function jumpToEvent(evt, cellDateStr) {
  if (S.view !== evt.folderId) await switchView(evt.folderId, evt.folderName);
  await _renderDonePromise;
  const card = $(`note-card-${evt.id}`);
  if (card) {
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    card.style.boxShadow = '0 0 0 3px var(--c-primary)';
    setTimeout(() => card.style.boxShadow = '', 1500);
  }
  const msgs = visibleMsgs();
  const targetMsg = msgs.find(m => extractDateFromMsg(m) === cellDateStr);
  if (targetMsg) {
    const row = document.querySelector(`.msg-row[data-id="${CSS.escape(targetMsg.id)}"]`);
    if (row) {
      row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const bubble = row.querySelector('.msg-bubble');
      if (bubble) {
        bubble.style.boxShadow = '0 0 0 3px var(--c-primary)';
        setTimeout(() => bubble.style.boxShadow = '', 1500);
      }
    }
  }
}

/* ══════════════════════════════════════════════════════════
   Render — Right panel Switcher
══════════════════════════════════════════════════════════ */
$('tab-events').addEventListener('click', () => switchRightTab('events'));
$('tab-songs').addEventListener('click', () => switchRightTab('songs'));

$('cal-prev').addEventListener('click', (e) => { e.stopPropagation(); S.calDate.setMonth(S.calDate.getMonth() - 1); renderCalendarGrid(); });
$('cal-next').addEventListener('click', (e) => { e.stopPropagation(); S.calDate.setMonth(S.calDate.getMonth() + 1); renderCalendarGrid(); });

$('cal-header-toggle').addEventListener('click', () => {
  S.calendarCollapsed = !S.calendarCollapsed;
  applyCalendarToggle();
  save();
});

function applyCalendarToggle() {
  const container = $('cal-body-container');
  const icon = $('cal-toggle-icon');
  if (S.calendarCollapsed) {
    container.classList.add('collapsed');
    icon.style.transform = 'rotate(-90deg)';
  } else {
    container.classList.remove('collapsed');
    icon.style.transform = 'rotate(0deg)';
  }
}

function switchRightTab(tab) {
  if (tab !== 'songs') cleanupSongRenderResources();
  S.rightTab = tab;
  $('col-right').dataset.tab = tab;
  $('tab-events').classList.toggle('active', tab === 'events');
  $('tab-songs').classList.toggle('active', tab === 'songs');
  if (tab === 'songs') {
    renderSongsList();
  } else {
    renderRight(); 
  }
  save();
}

function getEventFoldersForCurrentView() {
  if (S.view === null) return [];
  const folder = S.folders.find(f => f.id === S.view);
  if (!folder) return [];
  if (folder.parentId) return [folder];
  const children = S.folders
    .filter(f => f.parentId === folder.id)
    .sort((a, b) => S.folderSort === 'desc' ? b.createdAt - a.createdAt : a.createdAt - b.createdAt);
  return [folder, ...children];
}

function renderRight() {
  const noteList   = $('note-list');
  const rightTitle = $('right-header');
  noteList.innerHTML = '';
  renderCalendarGrid();

  if (S.view === null) {
    if (S.rightTab === 'events') rightTitle.textContent = t('right.calendar');
    noteList.innerHTML = `<div class="right-empty">${t('right.selectFolder')}</div>`;
    return;
  }

  const folder = S.folders.find(f => f.id === S.view);
  if (!folder) return;
  const eventFolders = getEventFoldersForCurrentView();
  const scopedNotes = eventFolders.flatMap(f => (f.notes || []).map((note, ni) => ({
    note,
    noteIndex: ni,
    sourceFolder: f
  })));

  if (S.rightTab === 'events') {
    rightTitle.innerHTML = `<span>${esc(folder.name)} · ${esc(t('right.eventSuffix'))}</span>`;
    const addBtn = document.createElement('button');
    addBtn.className = 'icon-btn';
    setBtnLabel(addBtn, t('right.addEvent'));
    addBtn.textContent = '＋';
    addBtn.style.fontSize = '16px';
    addBtn.addEventListener('click', () => {
      let defaultDate = '';
      const msgs = visibleMsgs();
      if (msgs.length > 0) defaultDate = extractDateFromMsg(msgs[0]);
      if (!defaultDate) defaultDate = toDateStr(new Date());
      folder.notes.push({ id: uid(), title: '', body: '', date: defaultDate, endDate: '', cat: 'life' });
      S.noteEditId = folder.notes[folder.notes.length - 1].id;
      renderRight();
      save();
    });
    rightTitle.appendChild(addBtn);
  }

  scopedNotes.forEach(({ note, noteIndex: ni, sourceFolder }) => {
    const isEditingBody = S.noteEditId === note.id;
    const card = document.createElement('div');
    card.className = 'note-card';
    card.id = `note-card-${note.id}`;

    // 依據分類設定色彩變數
    const catClass = CAT_INFO[note.cat || 'life'].class;
    card.style.setProperty('--note-color', `var(--c-cat-${catClass})`);

    const colorBar = document.createElement('div');
    colorBar.className = 'note-color-bar';
    card.appendChild(colorBar);

    // ── 1. 標題與操作按鈕列 ──
    const headerRow = document.createElement('div');
    headerRow.className = 'note-header';

    const titleIn = document.createElement('input');
    titleIn.className = 'note-title-inline';
    titleIn.placeholder = t('event.namePh');
    titleIn.value = note.title || '';
    titleIn.addEventListener('input', () => { note.title = titleIn.value; save(); renderCalendarGridDebounced(); });

    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'note-actions';

    const copyBtn = document.createElement('button');
    copyBtn.className = 'note-action-btn';
    setBtnLabel(copyBtn, t('event.copyEvent'));
    copyBtn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>';
    copyBtn.addEventListener('click', () => {
      const textToCopy = `【${note.title || t('event.unnamed')}】\n${t('event.dateLabel')}：${note.date}${note.endDate ? ' ~ ' + note.endDate : ''}\n${t('event.catLabel')}：${CAT_INFO[note.cat || 'life'].label}\n\n${note.body}`;
      copyTextToClipboard(textToCopy, () => {
        const orig = copyBtn.innerHTML;
        copyBtn.innerHTML = '✓';
        setTimeout(() => copyBtn.innerHTML = orig, 1500);
      });
    });

    const editBtn = document.createElement('button');
    editBtn.className = 'note-action-btn';
    setBtnLabel(editBtn, t('event.editTitle'));
    editBtn.innerHTML = '✎';
    editBtn.addEventListener('click', () => openEditor());

    const delBtn = document.createElement('button');
    delBtn.className = 'note-action-btn danger';
    delBtn.innerHTML = '✕';
    setBtnLabel(delBtn, t('event.deleteTip'));
    delBtn.addEventListener('click', () => {
      // 用 note.id 比對而非 index，避免外部 mutation 造成索引錯位
      if (note.id) sourceFolder.notes = sourceFolder.notes.filter(n => n.id !== note.id);
      else sourceFolder.notes.splice(ni, 1);
      renderRight(); save();
    });

    actionsDiv.appendChild(copyBtn);
    actionsDiv.appendChild(editBtn);
    actionsDiv.appendChild(delBtn);

    headerRow.appendChild(titleIn);
    headerRow.appendChild(actionsDiv);
    card.appendChild(headerRow);

    // ── 2. 日期與分類列 ──
    const metaRow = document.createElement('div');
    metaRow.className = 'note-meta-row';

    const dateIn = document.createElement('input');
    dateIn.type = 'date';
    dateIn.className = 'note-date-inline';
    dateIn.value = note.date || '';
    dateIn.addEventListener('change', () => {
      note.date = dateIn.value;
      // 未設定結束日時，讓結束日輸入框跟隨起始日（日期選擇器會從起始日開啟，而非今天）
      if (!note.endDate) endDateIn.value = note.date || '';
      renderCalendarGrid(); save();
    });
    metaRow.appendChild(dateIn);

    const sepArrow = document.createElement('span');
    sepArrow.textContent = '~';
    sepArrow.style.opacity = '0.5';

    const endDateIn = document.createElement('input');
    endDateIn.type = 'date';
    endDateIn.className = 'note-date-inline';
    endDateIn.value = note.endDate || note.date || '';
    endDateIn.title = t('event.endDate');
    endDateIn.style.opacity = note.endDate ? '1' : '0.5';
    endDateIn.addEventListener('change', () => {
      note.endDate = endDateIn.value;
      endDateIn.style.opacity = note.endDate ? '1' : '0.5';
      renderCalendarGrid();
      save();
    });
    metaRow.appendChild(sepArrow);
    metaRow.appendChild(endDateIn);

    const sepDot = document.createElement('span');
    sepDot.textContent = '·';
    sepDot.style.opacity = '0.5';
    sepDot.style.margin = '0 4px';
    metaRow.appendChild(sepDot);

    const catIn = document.createElement('select');
    catIn.className = 'note-cat-inline';
    Object.keys(CAT_INFO).forEach(key => {
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = CAT_INFO[key].label;
      catIn.appendChild(opt);
    });
    catIn.value = note.cat || 'life';
    catIn.addEventListener('change', () => {
      note.cat = catIn.value;
      const newCatClass = CAT_INFO[note.cat].class;
      card.style.setProperty('--note-color', `var(--c-cat-${newCatClass})`);
      renderCalendarGrid();
      save();
    });
    metaRow.appendChild(catIn);

    card.appendChild(metaRow);

    // ── 3. 內文區塊（預設兩行預覽，點擊展開編輯，失焦摺疊） ──
    const preview = document.createElement('div');
    preview.className = 'note-body-preview';
    const updatePreview = () => {
      if (note.body && note.body.trim()) {
        preview.textContent = note.body;
        preview.classList.remove('empty');
      } else {
        preview.textContent = t('event.bodyPh');
        preview.classList.add('empty');
      }
    };
    updatePreview();

    const bodyIn = document.createElement('textarea');
    bodyIn.className = 'note-body-inline';
    bodyIn.id = `note-body-inline-${note.id}`;
    bodyIn.placeholder = t('event.bodyPh');
    bodyIn.value = note.body || '';

    const openEditor = () => {
      preview.style.display = 'none';
      bodyIn.style.display = 'block';
      bodyIn.style.height = 'auto';
      bodyIn.style.height = bodyIn.scrollHeight + 'px';
      bodyIn.focus();
    };

    const closeEditor = () => {
      updatePreview();
      bodyIn.style.display = 'none';
      preview.style.display = '';   // 清除 inline style，讓 CSS 的 display:-webkit-box 生效
      if (S.noteEditId === note.id) S.noteEditId = null;
    };

    // 新增後自動開啟編輯
    if (isEditingBody) {
      preview.style.display = 'none';
      bodyIn.style.display = 'block';
      setTimeout(() => {
        bodyIn.style.height = 'auto';
        bodyIn.style.height = bodyIn.scrollHeight + 'px';
        bodyIn.focus();
      }, 0);
    } else {
      bodyIn.style.display = 'none';
    }

    preview.addEventListener('click', openEditor);

    bodyIn.addEventListener('input', function() {
      note.body = this.value;
      this.style.height = 'auto';
      this.style.height = this.scrollHeight + 'px';
      save();
    });

    // 整張卡片失焦時才收起（避免卡片內部元素互相切換時誤收）
    card.addEventListener('focusout', (e) => {
      if (bodyIn.style.display === 'none') return;
      const next = e.relatedTarget;
      if (next && card.contains(next)) return;
      closeEditor();
    });

    card.appendChild(preview);
    card.appendChild(bodyIn);

    noteList.appendChild(card);
  });
}

/* ══════════════════════════════════════════════════════════
   Render — Calendar Events
══════════════════════════════════════════════════════════ */
// 避免 input 事件每打一字就觸發整個日曆重繪
let _calRedrawTimer = null;
function renderCalendarGridDebounced() {
  if (_calRedrawTimer) return;
  _calRedrawTimer = setTimeout(() => { _calRedrawTimer = null; renderCalendarGrid(); }, 200);
}

function renderCalendarGrid() {
  const wrap = $('right-calendar-wrap');
  wrap.style.display = 'block';

  const year = S.calDate.getFullYear();
  const month = S.calDate.getMonth();
  $('cal-title').textContent = _curLang === 'en'
    ? new Date(year, month, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' })
    : `${year}年 ${month + 1}月`;

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevMonthDays = new Date(year, month, 0).getDate();

  const grid = $('cal-grid');
  grid.innerHTML = '';

  let allMonthEvents = [];
  // 行事曆亮點顯示「所有」資料夾的事件，而非僅限目前檢視的資料夾
  const eventFolders = S.folders;
  eventFolders.forEach(f => {
    (f.notes || []).forEach(n => {
      if (n.date) {
        const startStr = n.date;
        const endStr = (n.endDate && n.endDate >= n.date) ? n.endDate : n.date;
        allMonthEvents.push({ ...n, startStr, endStr, folderId: f.id, folderName: f.name });
      }
    });
  });
  allMonthEvents.sort((a, b) => {
    if (a.startStr !== b.startStr) return a.startStr.localeCompare(b.startStr);
    return b.endStr.localeCompare(a.endStr);
  });

  const activeSlots = [];
  allMonthEvents.forEach(evt => {
    let slot = 0;
    while (activeSlots[slot] && activeSlots[slot] >= evt.startStr) slot++;
    activeSlots[slot] = evt.endStr;
    evt._slot = slot;
  });

  let totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7;
  
  for (let i = 0; i < totalCells; i++) {
    const cell = document.createElement('div');
    cell.className = 'cal-day';
    let cellDateStr = '';
    
    if (i < firstDay) {
      const num = document.createElement('span');
      num.textContent = prevMonthDays - firstDay + i + 1;
      cell.appendChild(num);
      cell.classList.add('muted');
    } else if (i >= firstDay + daysInMonth) {
      const num = document.createElement('span');
      num.textContent = i - firstDay - daysInMonth + 1;
      cell.appendChild(num);
      cell.classList.add('muted');
    } else {
      const day = i - firstDay + 1;
      const num = document.createElement('span');
      num.textContent = day;
      cell.appendChild(num);
      cellDateStr = toDateStr(new Date(year, month, day));
      if (cellDateStr === toDateStr(new Date())) cell.classList.add('today');

      const dayEvents = allMonthEvents.filter(evt => cellDateStr >= evt.startStr && cellDateStr <= evt.endStr);
      if (dayEvents.length > 0) {
        cell.classList.add('has-event');
        const eventsContainer = document.createElement('div');
        eventsContainer.className = 'cal-events';
        const maxVisible = 3;
        const maxSlot = Math.max(...dayEvents.map(e => e._slot));
        const visibleSlots = Math.min(maxVisible, maxSlot + 1);
        for(let s = 0; s < visibleSlots; s++) {
          const evt = dayEvents.find(e => e._slot === s);
          const bar = document.createElement('div');
          if (evt) {
            let type = 'mid';
            if (evt.startStr === evt.endStr) type = 'single';
            else if (cellDateStr === evt.startStr) type = 'start';
            else if (cellDateStr === evt.endStr) type = 'end';
            bar.className = `cal-bar bar-${evt.cat} ${type}`;
            bar.title = evt.title || t('event.unnamed');
            if (i % 7 === 6 && (type === 'start' || type === 'mid')) { bar.style.marginRight = '4px'; bar.style.borderTopRightRadius = '3px'; bar.style.borderBottomRightRadius = '3px'; }
            if (i % 7 === 0 && (type === 'end' || type === 'mid')) { bar.style.marginLeft = '4px'; bar.style.borderTopLeftRadius = '3px'; bar.style.borderBottomLeftRadius = '3px'; }
            bar.addEventListener('click', (e) => { e.stopPropagation(); jumpToEvent(evt, cellDateStr); });
          } else bar.className = 'cal-bar empty';
          eventsContainer.appendChild(bar);
        }
        const hiddenCount = dayEvents.filter(e => e._slot >= maxVisible).length;
        if (hiddenCount > 0) {
          const more = document.createElement('div');
          more.className = 'cal-more';
          more.textContent = `+${hiddenCount}`;
          more.title = tf('event.moreN', hiddenCount);
          more.addEventListener('click', (e) => { e.stopPropagation(); showDayEventsPopup(dayEvents, cellDateStr, cell); });
          eventsContainer.appendChild(more);
        }
        cell.appendChild(eventsContainer);
      }
      cell.addEventListener('click', () => { if (dayEvents.length > 0) showDayEventsPopup(dayEvents, cellDateStr, cell); });
      if (dayEvents.length > 0) addKeyActivation(cell);
    }
    grid.appendChild(cell);
  }
}

/* ══════════════════════════════════════════════════════════
   Render — Songs
══════════════════════════════════════════════════════════ */
// 刪除歌曲並清理其 objectURL 與 IDB 資源
function deleteSong(song) {
  revokeMp3Url(song.id);
  revokeCoverUrl(song.id);
  idbDeleteMp3(song.id).catch(() => {});
  idbDeleteCover(song.id).catch(() => {});
  const i = S.songs.findIndex(s => s.id === song.id);
  if (i !== -1) S.songs.splice(i, 1);
  save();
  renderSongsList();
}

function renderSongsList() {
  const songList = $('song-list');
  cleanupSongRenderResources();
  songList.querySelectorAll('.song-embed-wrap audio').forEach(a => {
    try { a.pause(); a.removeAttribute('src'); a.load(); } catch (_) {}
  });
  stopEmbeddedIframes('.song-embed-wrap iframe');
  songList.innerHTML = '';
  const rightTitle = $('right-header');
  const frag = document.createDocumentFragment();

  if (S.rightTab === 'songs') {
    rightTitle.innerHTML = ''; // 清空原本內容，重新排版標題區
    
    const titleSpan = document.createElement('span');
    titleSpan.className = 'songs-panel-title';
    titleSpan.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg> Songs`;
    
    const addBtn = document.createElement('button');
    addBtn.className = 'btn-pill-solid';
    addBtn.innerHTML = esc(t('song.addSong'));
    addBtn.addEventListener('click', startNewSong);
    
    rightTitle.appendChild(titleSpan);
    rightTitle.appendChild(addBtn);
  }

  S.songs.forEach((song, idx) => {
    const isEditState = song._isNew || song._isEditing;
    const card = document.createElement('div');
    card.className = 'song-card';
    if (isEditState) card.classList.add('is-editing');
    card.dataset.idx = idx;

    card.addEventListener('mousedown', e => {
      if (isEditState) return;
      if (e.button !== 0) return;
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.closest('button') || e.target.closest('.song-lyrics-display') || e.target.closest('.song-embed-wrap')) return;
      
      S.mx = e.clientX;
      S.my = e.clientY;
      S.dragType = 'song';
    S.dragSongIdx = idx;
    S.dragTimer = setTimeout(() => {
      if (S.dragType !== 'song') return;
      S.isDragging = true;
      snapshotSongDragRects();
      const ghost = $('drag-ghost');
      ghost.textContent = tf('song.move', song.title || t('song.unnamed'));
      ghost.style.display = 'block';
      ghost.style.left = (S.mx + 14) + 'px';
        ghost.style.top  = (S.my + 14) + 'px';
        card.classList.add('dragging');
      }, 400);
    });

    // ── EDIT MODE ──
    const editMode = document.createElement('div');
    editMode.className = 'song-edit-form';
    editMode.style.display = isEditState ? 'flex' : 'none';

    const formTitle = document.createElement('div');
    formTitle.className = 'song-form-title';
    formTitle.textContent = song.title ? t('song.editSong') : t('song.newSong');
    editMode.appendChild(formTitle);

    // Audio Source Field (Mutually Exclusive Logic)
    const audioSourceField = document.createElement('div');
    audioSourceField.className = 'song-field';

    const sourceLabelWrap = document.createElement('div');
    sourceLabelWrap.className = 'song-label';
    sourceLabelWrap.textContent = t('song.audioSource');
    
    // 1. URL Container
    const urlContainer = document.createElement('div');
    urlContainer.style.display = 'flex';
    urlContainer.style.gap = '8px';
    urlContainer.style.alignItems = 'center';
    urlContainer.style.marginBottom = '8px';

    const linkIn = document.createElement('input');
    linkIn.className = 'song-input';
    linkIn.id = `url-input-${song.id}`;
    linkIn.placeholder = t('song.urlPh');
    linkIn.value = song.url || '';
    linkIn.style.flex = '1';
    linkIn.style.transition = 'opacity 0.2s';

    const clearUrlBtn = document.createElement('button');
    clearUrlBtn.type = 'button';
    clearUrlBtn.id = `clear-url-${song.id}`;
    clearUrlBtn.innerHTML = esc(t('song.clearUrl'));
    clearUrlBtn.className = 'song-url-clear';

    urlContainer.appendChild(linkIn);
    urlContainer.appendChild(clearUrlBtn);

    // 2. MP3 Container
    const mp3Container = document.createElement('div');
    mp3Container.className = 'song-upload-row';

    const mp3UploadBtn = document.createElement('button');
    mp3UploadBtn.type = 'button';
    mp3UploadBtn.id = `mp3-btn-${song.id}`;
    mp3UploadBtn.className = 'song-mp3-upload-btn';
    mp3UploadBtn.innerHTML = `<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>${esc(t('song.importMp3'))}`;

    const mp3ClearBtn = document.createElement('button');
    mp3ClearBtn.type = 'button';
    mp3ClearBtn.id = `mp3-clear-${song.id}`;
    mp3ClearBtn.className = 'song-mp3-upload-btn';
    mp3ClearBtn.style.background = 'rgb(var(--c-danger-rgb) / 0.1)';
    mp3ClearBtn.style.color = 'var(--c-danger)';
    mp3ClearBtn.style.borderColor = 'transparent';
    mp3ClearBtn.innerHTML = esc(t('song.clearMp3'));

    const mp3Status = document.createElement('div');
    mp3Status.className = 'song-mp3-status';
    mp3Status.id = `mp3-status-${song.id}`;
    mp3Status.textContent = song.mp3Url ? tf('song.importedAs', song.mp3FileName || t('song.mp3File')) : t('song.notImportedMp3');

    mp3Container.appendChild(mp3UploadBtn);
    mp3Container.appendChild(mp3ClearBtn);
    mp3Container.appendChild(mp3Status);

    audioSourceField.appendChild(sourceLabelWrap);
    audioSourceField.appendChild(urlContainer);
    audioSourceField.appendChild(mp3Container);
    editMode.appendChild(audioSourceField);

    // Mutual Exclusion Logic (互斥鎖定邏輯)
    function updateSourceLock() {
      const hasUrl = !!linkIn.value.trim();
      const hasMp3 = !!song.mp3Url;

      if (hasMp3) {
        // Locked by MP3 (若有 MP3，鎖定並淡化網址輸入)
        linkIn.disabled = true;
        linkIn.style.opacity = '0.5';
        clearUrlBtn.style.display = 'none';

        mp3UploadBtn.style.display = 'none';
        mp3ClearBtn.style.display = 'inline-flex';
      } else if (hasUrl) {
        // Locked by URL (若有網址，鎖定並淡化 MP3 上傳)
        linkIn.disabled = false;
        linkIn.style.opacity = '1';
        clearUrlBtn.style.display = 'block';

        mp3UploadBtn.style.display = 'inline-flex';
        mp3UploadBtn.disabled = true;
        mp3UploadBtn.style.opacity = '0.5';
        mp3UploadBtn.style.cursor = 'not-allowed';
        mp3ClearBtn.style.display = 'none';
      } else {
        // Both empty (皆為空，開放選擇)
        linkIn.disabled = false;
        linkIn.style.opacity = '1';
        clearUrlBtn.style.display = 'none';

        mp3UploadBtn.style.display = 'inline-flex';
        mp3UploadBtn.disabled = false;
        mp3UploadBtn.style.opacity = '1';
        mp3UploadBtn.style.cursor = 'pointer';
        mp3ClearBtn.style.display = 'none';
      }
    }

    linkIn.addEventListener('input', updateSourceLock);

    clearUrlBtn.addEventListener('click', () => {
      linkIn.value = '';
      song.url = '';
      updateSourceLock();
    });

    mp3UploadBtn.addEventListener('click', () => {
      if (mp3UploadBtn.disabled) return;
      _pendingMp3SongId = song.id;
      $('music-mp3-input').click();
    });

    mp3ClearBtn.addEventListener('click', () => {
      revokeMp3Url(song.id);
      if (song.mp3Url && String(song.mp3Url).startsWith('blob:')) URL.revokeObjectURL(song.mp3Url);
      song.mp3Url = '';
      song.mp3FileName = '';
      idbDeleteMp3(song.id).catch(() => {});
      mp3Status.textContent = t('song.notImportedMp3');
      updateSourceLock();
      save();
    });

    // 初始化狀態
    updateSourceLock();

    // Cover Upload Field
    const coverField = document.createElement('div');
    coverField.className = 'song-field';
    const coverLabel = document.createElement('div');
    coverLabel.className = 'song-label';
    coverLabel.textContent = 'COVER IMAGE';
    const coverUploadRow = document.createElement('div');
    coverUploadRow.className = 'song-upload-row';
    const coverUploadBtn = document.createElement('button');
    coverUploadBtn.type = 'button';
    coverUploadBtn.className = 'song-mp3-upload-btn';
    coverUploadBtn.innerHTML = `<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>${esc(t('song.importCover'))}`;
    coverUploadBtn.addEventListener('click', () => { _pendingCoverSongId = song.id; $('music-cover-input').click(); });
    const coverStatus = document.createElement('div');
    coverStatus.className = 'song-mp3-status';
    coverStatus.id = `cover-status-${song.id}`;
    coverStatus.textContent = song.cover ? t('song.importedCover') : t('song.notImportedCover');
    coverUploadRow.appendChild(coverUploadBtn);
    coverUploadRow.appendChild(coverStatus);
    coverField.appendChild(coverLabel);
    coverField.appendChild(coverUploadRow);
    editMode.appendChild(coverField);

    // Title Field
    const titleField = document.createElement('div');
    titleField.className = 'song-field';
    const titleLabel = document.createElement('div');
    titleLabel.className = 'song-label';
    titleLabel.textContent = 'SONG TITLE';
    const titleIn = document.createElement('input');
    titleIn.className = 'song-input';
    titleIn.placeholder = t('song.titlePh');
    titleIn.value = song.title || '';
    titleField.appendChild(titleLabel);
    titleField.appendChild(titleIn);
    editMode.appendChild(titleField);

    // Lyrics Field
    const lyricField = document.createElement('div');
    lyricField.className = 'song-field lyric-field';
    const lyricLabel = document.createElement('div');
    lyricLabel.className = 'song-label';
    lyricLabel.innerHTML = `<span>LYRICS</span><span class="lyric-form-toggle" style="color: var(--c-primary); cursor: pointer; text-transform: none; font-size: 11px;">${esc(t('song.collapse'))} <span style="font-size: 9px;">▲</span></span>`;
    const lyricIn = document.createElement('textarea');
    lyricIn.className = 'song-input song-textarea';
    lyricIn.placeholder = t('song.lyricPh');
    lyricIn.value = song.lyrics || '';
    lyricField.appendChild(lyricLabel);
    lyricField.appendChild(lyricIn);
    editMode.appendChild(lyricField);

    lyricLabel.querySelector('.lyric-form-toggle').addEventListener('click', function() {
      const isHidden = lyricIn.style.display === 'none';
      lyricIn.style.display = isHidden ? 'block' : 'none';
      this.innerHTML = isHidden ? `${esc(t('song.collapse'))} <span style="font-size: 9px;">▲</span>` : `${esc(t('folder.expand'))} <span style="font-size: 9px;">▼</span>`;
    });

    // Actions
    const actionsRow = document.createElement('div');
    actionsRow.className = 'song-actions';
    
    const delFormBtn = document.createElement('button');
    delFormBtn.className = 'song-btn-del';
    delFormBtn.textContent = t('song.delete');
    
    const rightGroup = document.createElement('div');
    rightGroup.className = 'song-actions-right';
    
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'song-btn-cancel';
    cancelBtn.textContent = t('modal.cancel');
    
    const saveBtn = document.createElement('button');
    saveBtn.className = 'song-btn-save';
    saveBtn.textContent = t('modal.save');
    
    rightGroup.appendChild(cancelBtn);
    rightGroup.appendChild(saveBtn);

    actionsRow.appendChild(delFormBtn);
    actionsRow.appendChild(rightGroup);
    editMode.appendChild(actionsRow);

    delFormBtn.addEventListener('click', () => deleteSong(song));

    saveBtn.addEventListener('click', () => {
      // 根據互斥鎖定狀態儲存：有 MP3 就清空網址，反之保留網址
      if (song.mp3Url) {
        song.url = ''; 
      } else {
        song.url = linkIn.value;
      }
      song.title = titleIn.value;
      song.lyrics = lyricIn.value;
      delete song._isNew;
      delete song._isEditing;
      save();
      renderSongsList();
    });

    cancelBtn.addEventListener('click', () => {
      if (song._isNew) {
        deleteSong(song);
      } else {
        delete song._isEditing;
        save();
        renderSongsList();
      }
    });

    // ── VIEW MODE ──
    const viewMode = document.createElement('div');
    viewMode.style.display = isEditState ? 'none' : 'flex';
    viewMode.style.flexDirection = 'column';
    viewMode.style.gap = '12px';

    const headerRow = document.createElement('div');
    headerRow.style.display = 'flex';
    headerRow.style.justifyContent = 'space-between';
    headerRow.style.alignItems = 'flex-start';

    const viewTitle = document.createElement('div');
    viewTitle.style.fontSize = '16px';
    viewTitle.style.fontWeight = '700';
    viewTitle.style.color = 'var(--c-text)';
    viewTitle.textContent = song.title || t('song.unnamed');

    const viewActions = document.createElement('div');
    viewActions.style.display = 'flex';
    viewActions.style.gap = '4px';

    const btnEdit = document.createElement('button');
    btnEdit.className = 'icon-btn';
    btnEdit.innerHTML = '✎';
    setBtnLabel(btnEdit, t('song.editTip'));
    btnEdit.addEventListener('click', () => {
      song._isEditing = true;
      renderSongsList();
    });

    const btnDel = document.createElement('button');
    btnDel.className = 'icon-btn';
    btnDel.innerHTML = '✕';
    setBtnLabel(btnDel, t('song.delTip'));
    btnDel.addEventListener('click', () => deleteSong(song));

    viewActions.appendChild(btnEdit);
    viewActions.appendChild(btnDel);
    headerRow.appendChild(viewTitle);
    headerRow.appendChild(viewActions);
    viewMode.appendChild(headerRow);

    // 檢視模式版面：封面+播放器（左）與歌詞（右）
    const viewBody = document.createElement('div');
    viewBody.className = 'song-view-body';
    const mediaCol = document.createElement('div');
    mediaCol.className = 'song-media';
    viewBody.appendChild(mediaCol);
    viewMode.appendChild(viewBody);

    // Cover（與 Official Site MUSIC 同一張封面，從 IDB 載入後存於 song.cover）
    if (song.cover) {
      const coverWrap = document.createElement('div');
      coverWrap.className = 'song-view-cover';
      const img = document.createElement('img');
      img.src = normalizeCoverSrc(song.cover);
      img.loading = 'lazy';
      coverWrap.appendChild(img);
      mediaCol.appendChild(coverWrap);
    }

    // Embed Wrap
    const embedWrap = document.createElement('div');
    embedWrap.className = 'song-embed-wrap';
    const updateEmbed = () => {
       if (song.mp3Url) {
         embedWrap.style.display = 'block';
         embedWrap.style.background = 'transparent';
         embedWrap.innerHTML = `<audio controls src="${escAttr(song.mp3Url)}" style="width: 100%; height: 40px; outline: none; border-radius: 4px;"></audio>`;
         const audioEl = embedWrap.querySelector('audio');
         if (audioEl) {
           audioEl.addEventListener('play', () => {
             document.querySelectorAll('.song-embed-wrap audio').forEach(a => {
               if (a !== audioEl) try { a.pause(); } catch (_) {}
             });
             stopOfficialMusicPlayback();
           });
         }
       } else {
         embedWrap.style.background = 'var(--c-primary-char)';
         const html = buildEmbedHtml(song.url, 'large');
         embedWrap.style.display = html ? 'block' : 'none';
         embedWrap.innerHTML = html;
         const iframeEl = embedWrap.querySelector('iframe');
         if (iframeEl) {
           armSinglePlaybackIframe(iframeEl, 'story', song.url, 'large');
           const stopOthers = () => enforceSingleSongPlayback({ exceptStoryIframe: iframeEl });
           embedWrap.addEventListener('pointerdown', stopOthers, true);
           embedWrap.addEventListener('click', stopOthers, true);
         }
        }
    };
    updateEmbed();
    mediaCol.appendChild(embedWrap);

    // Lyrics View
    if (song.lyrics) {
      const lyricWrapper = document.createElement('div');
      lyricWrapper.className = 'lyric-wrapper';
      const toggleBtn = document.createElement('button');
      toggleBtn.className = 'lyric-toggle';
      toggleBtn.type = 'button';
      toggleBtn.innerHTML = `<span>${esc(t('song.expandLyric'))}</span><span class="lyric-icon" style="transition: transform 0.3s; font-size: 10px;">▼</span>`;

      const contentDiv = document.createElement('div');
      contentDiv.className = 'lyric-content';
      const innerDiv = document.createElement('div');
      innerDiv.className = 'lyric-inner';

      const displayDiv = document.createElement('div');
      displayDiv.className = 'song-lyrics-display';
      displayDiv.textContent = song.lyrics;
      displayDiv.title = t('song.dblToEdit');
      displayDiv.addEventListener('dblclick', () => {
        song._isEditing = true;
        renderSongsList();
      });

      innerDiv.appendChild(displayDiv);
      contentDiv.appendChild(innerDiv);

      // 左右分欄展開時，讓歌詞可視高度與「封面＋播放器」欄切齊，超過則於欄內捲動
      const syncLyricHeight = () => {
        const isRow = viewBody.classList.contains('lyrics-open')
          && getComputedStyle(viewBody).flexDirection === 'row';
        if (isRow) {
          const mediaH = mediaCol.getBoundingClientRect().height;
          const toggleH = toggleBtn.getBoundingClientRect().height;
          innerDiv.style.maxHeight = Math.max(160, mediaH - toggleH - 8) + 'px';
          innerDiv.style.overflowY = 'auto';
        } else {
          innerDiv.style.maxHeight = '';
          innerDiv.style.overflowY = '';
        }
      };
      // 封面圖片載入或面板寬度變化會改變左欄高度，需同步重算
      let mediaRO = null;
      const ensureLyricObserver = () => {
        if (mediaRO) return;
        mediaRO = new ResizeObserver(syncLyricHeight);
        mediaRO.observe(mediaCol);
      };
      const releaseLyricObserver = () => {
        if (!mediaRO) return;
        mediaRO.disconnect();
        mediaRO = null;
      };
      _songRenderCleanups.push(releaseLyricObserver);

      toggleBtn.addEventListener('click', () => {
        const isExpanded = contentDiv.classList.toggle('expanded');
        viewBody.classList.toggle('lyrics-open', isExpanded);
        toggleBtn.querySelector('span').textContent = isExpanded ? t('song.collapseLyric') : t('song.expandLyric');
        toggleBtn.querySelector('.lyric-icon').style.transform = isExpanded ? 'rotate(180deg)' : 'rotate(0deg)';
        if (isExpanded) ensureLyricObserver();
        else releaseLyricObserver();
        syncLyricHeight();
      });

      lyricWrapper.appendChild(toggleBtn);
      lyricWrapper.appendChild(contentDiv);
      viewBody.appendChild(lyricWrapper);
    }

    card.appendChild(viewMode);
    card.appendChild(editMode);
    frag.appendChild(card);
  });
  songList.appendChild(frag);
}

/* ══════════════════════════════════════════════════════════
   File upload
══════════════════════════════════════════════════════════ */
$('upload-btn').addEventListener('click', () => $('file-input').click());
$('export-all-btn').addEventListener('click', async () => {
  try {
    await exportAllData();
  } catch (e) {
    console.error(e);
    showModal({
      title: t('imp.exportFail'),
      desc: tf('imp.exportFailDesc', e?.message || e),
      confirmText: t('msg.ok')
    });
  }
});

$('import-all-btn').addEventListener('click', () => {
  showModal({
    title: t('imp.importBackup'),
    desc: t('imp.importWarn'),
    confirmText: t('imp.pickFile'),
    cancelText: t('modal.cancel'),
    onConfirm: () => {
      $('import-backup-input').value = '';
      $('import-backup-input').click();
    }
  });
});

$('import-backup-input').addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file) return;

  const btn = $('import-all-btn');
  btn.disabled = true;
  btn.querySelector('span').textContent = t('imp.importing');

  try {
    await importAllData(file);
    // 取消尚未觸發的 debounce 存檔，避免 beforeunload 時舊的記憶體狀態覆蓋剛匯入的資料
    if (_saveTimer) clearTimeout(_saveTimer);
    _saveTimer = null;
    _savePending = false;
    showModal({
      title: t('imp.importDone'),
      desc: t('imp.importDoneDesc'),
      confirmText: t('msg.ok'),
      onConfirm: () => location.reload(),
      // 匯入已完成、localStorage 與 IDB 都是新資料，取消也必須 reload，
      // 否則繼續操作時任何 save() 都會用舊的記憶體狀態覆蓋掉匯入結果
      onCancel: () => location.reload()
    });
  } catch(err) {
    console.error(err);
    btn.disabled = false;
    btn.querySelector('span').textContent = t('imp.import');
    showModal({
      title: t('imp.importFail'),
      desc: tf('imp.importFailDesc', err?.message || err),
      confirmText: t('msg.ok')
    });
  }
});

$('file-input').addEventListener('change', async e => {
  const files = Array.from(e.target.files);
  if (!files.length) return;

  // 顯示 loading
  $('mid-header-title').textContent = t('imp.importing');
  $('message-list').innerHTML = `<div class="empty-state"><small>${esc(t('msg.parsing'))}</small></div>`;

  // 取得已存在的 fingerprints（去重用）
  const existingFps = await idbGetAllFingerprints();

  let hasNew = false;

  for (const file of files) {
    const text = await file.text();

    // 從標題區塊擷取角色名稱
    const headerMatch = text.match(/^={10,}\r?\n(.+?)\s*-\s*.+?\r?\n/);
    if (headerMatch && headerMatch[1]) {
      const charName = headerMatch[1].trim();
      if (charName) {
        S.nameOrder = S.nameOrder.filter(n => n !== charName);
        S.nameOrder.unshift(charName);
      }
    }

    const parsed = parseTxt(text);
    parsed.forEach(m => { if (m.type === 'msg') registerName(m.name); });

    // 過濾重複，加上 fp
    const toInsert = [];
    for (const msg of parsed) {
      const fp = msgFingerprint(msg);
      if (!existingFps.has(fp)) {
        existingFps.add(fp);
        toInsert.push({ ...msg, fp });
        hasNew = true;
      }
    }

    // 分批寫入 IDB（每批 500 則，讓 UI 保持回應）
    const BATCH = 500;
    for (let i = 0; i < toInsert.length; i += BATCH) {
      await idbPutMessages(toInsert.slice(i, i + BATCH));
      await new Promise(r => setTimeout(r, 0));
    }
    // 即時更新計數（不需重掃 IDB）
    if (toInsert.length > 0) adjustUnclassifiedCount(toInsert.length);
  }

  if (hasNew) S.view = null;

  updateMidHeaderTitle();

  renderFolders();
  await renderMsgs();
  renderRight();
  save();
  updateAvatarSlotUI();
  e.target.value = '';
});

/* ══════════════════════════════════════════════════════════
   Add folder
══════════════════════════════════════════════════════════ */
$('add-folder-btn').addEventListener('click', () => {
  // 若已有輸入框則不重複建立
  if ($('new-folder-form')) return;

  const SVG_FOLDER = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" width="16" height="16" fill="currentColor"><path d="M480-160q-48-38-104-59t-116-21q-42 0-82.5 11T100-198q-21 11-40.5-1T40-234v-482q0-11 5.5-21T62-752q46-24 96-36t102-12q58 0 113.5 15T480-740v484q51-32 107-48t113-16q36 0 70.5 6t69.5 18v-480q15 5 29.5 10.5T898-752q11 5 16.5 15t5.5 21v482q0 23-19.5 35t-40.5 1q-37-20-77.5-31T700-240q-60 0-116 21t-104 59Zm80-200v-380l200-200v400L560-360Zm-160 65v-396q-33-14-68.5-21.5T260-720q-37 0-72 7t-68 21v397q35-13 69.5-19t70.5-6q36 0 70.5 6t69.5 19Zm0 0v-396 396Z"/></svg>`;

  const form = document.createElement('div');
  form.id = 'new-folder-form';
  form.style.cssText = 'margin-bottom:4px;';
  form.innerHTML = `
    <div class="new-folder-input-wrap">
      <span class="folder-icon" style="opacity:0.7;">${SVG_FOLDER}</span>
      <input id="new-folder-input" class="new-folder-input" placeholder="${escAttr(t('folder.namePh'))}" maxlength="40">
    </div>
    <div class="new-folder-hint">${esc(t('folder.enterEsc'))}</div>`;

  const list = $('folder-list');
  list.insertBefore(form, list.firstChild);
  $('folder-list').scrollTop = 0;

  const input = $('new-folder-input');
  input.focus();

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); commitNewFolder(); }
    if (e.key === 'Escape') { form.remove(); }
  });
  input.addEventListener('blur', () => {
    setTimeout(() => { if ($('new-folder-form')) commitNewFolder(); }, 150);
  });
});

function commitNewFolder() {
  const form = $('new-folder-form');
  if (!form) return;
  const name = $('new-folder-input').value.trim();
  form.remove();
  if (!name) return;
  S.folders.unshift({ id: uid(), name, msgIds: [], notes: [], parentId: null, createdAt: Date.now() });
  renderFolders();
  $('folder-list').scrollTop = 0;
  save();
}

/* ══════════════════════════════════════════════════════════
   Avatar & Background
══════════════════════════════════════════════════════════ */
const ICON_CAMERA = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 15.2A3.2 3.2 0 1 0 12 8.8a3.2 3.2 0 0 0 0 6.4zm0 1.8a5 5 0 1 1 0-10 5 5 0 0 1 0 10z"/><path d="M9 2 7.17 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2h-3.17L15 2H9zm3 15a5 5 0 1 1 0-10 5 5 0 0 1 0 10z"/></svg>`;

function getRoleLabel(roleKey) {
  const custom = String(S.roleLabels?.[roleKey] || '').trim();
  if (custom) return custom;
  if (roleKey === 'character') return S.nameOrder[0] || t('role.character');
  if (roleKey === 'player') return S.nameOrder[1] || t('role.player');
  return '';
}

function renameRoleLabel(roleKey) {
  const roleText = roleKey === 'character' ? t('role.character') : t('role.player');
  showModal({
    title: tf('role.modify', roleText),
    desc: tf('role.modifyDesc', roleText),
    showInput: true,
    inputValue: getRoleLabel(roleKey),
    confirmText: t('modal.save'),
    onConfirm: (val) => {
      if (val === null) return;
      const next = String(val).trim().slice(0, 40);
      if (!next) return;
      S.roleLabels[roleKey] = next;
      updateAvatarSlotUI();
      renderMsgs();
      save();
    }
  });
}

function updateAvatarSlotUI() {
  const charImg = $('avatar-char-img');
  charImg.innerHTML = '';
  if (S.avatarChar) {
    const img = document.createElement('img');
    img.src = S.avatarChar;
    charImg.appendChild(img);
    const overlay = document.createElement('div');
    overlay.className = 'avatar-hover-overlay';
    overlay.innerHTML = ICON_CAMERA;
    charImg.appendChild(overlay);
  } else {
    charImg.innerHTML = ICON_CAMERA;
  }

  const playerImg = $('avatar-player-img');
  playerImg.innerHTML = '';
  if (S.avatarPlayer) {
    const img = document.createElement('img');
    img.src = S.avatarPlayer;
    playerImg.appendChild(img);
    const overlay = document.createElement('div');
    overlay.className = 'avatar-hover-overlay';
    overlay.innerHTML = ICON_CAMERA;
    playerImg.appendChild(overlay);
  } else {
    playerImg.innerHTML = ICON_CAMERA;
  }

  $('avatar-char-name').textContent   = getRoleLabel('character');
  $('avatar-player-name').textContent = getRoleLabel('player');
}

const ICON_IMAGE = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>`;

function updateBgUI() {
  const slotImg = $('bg-slot-img');
  if (S.bgImage) {
    slotImg.innerHTML = '';
    const img = document.createElement('img');
    img.src = S.bgImage;
    slotImg.appendChild(img);
    const overlay = document.createElement('div');
    overlay.className = 'avatar-hover-overlay';
    overlay.innerHTML = ICON_IMAGE;
    slotImg.appendChild(overlay);
    $('mid-bg').style.backgroundImage = `url('${S.bgImage}')`;
    document.body.style.backgroundImage = `url('${S.bgImage}')`;
    document.body.style.backgroundSize = 'cover';
    document.body.style.backgroundPosition = 'center';
    document.body.classList.add('has-bg');
  } else {
    slotImg.innerHTML = ICON_IMAGE;
    $('mid-bg').style.backgroundImage = '';
    document.body.style.backgroundImage = '';
    document.body.classList.remove('has-bg');
  }
}

$('avatar-char-slot').addEventListener('click', () => $('avatar-char-input').click());
$('avatar-player-slot').addEventListener('click', () => $('avatar-player-input').click());
$('bg-slot').addEventListener('click', () => openBgPicker());

/* ══════════════════════════════════════════════════════════
   Background Gallery — 多張背景圖庫（IDB backgrounds store）
══════════════════════════════════════════════════════════ */
let _bgPickerRecords = [];

async function setActiveBackground(record) {
  if (record) {
    setAssetUrl('bgImage', record.blob);
    S.bgActiveId = record.id;
    // 套用中的背景同步寫回 app_assets.bgImage，開機載入路徑（loadAllAssets）維持不變
    idbPutAsset('bgImage', record.blob).catch(err => { console.warn('IDB asset write:', err); notifyStorageError(err, 'media'); });
  } else {
    if (_assetUrlCache.has('bgImage')) {
      URL.revokeObjectURL(_assetUrlCache.get('bgImage'));
      _assetUrlCache.delete('bgImage');
    }
    S.bgImage = null;
    S.bgActiveId = null;
    idbDelete('app_assets', 'bgImage').catch(err => console.warn('IDB asset delete:', err));
  }
  updateBgUI();
  save();
}

async function deleteBackgroundRecord(id) {
  try { await idbDeleteBackground(id); } catch (e) { console.warn('idbDeleteBackground:', e); }
  if (_bgUrlCache.has(id)) {
    URL.revokeObjectURL(_bgUrlCache.get(id));
    _bgUrlCache.delete(id);
  }
  _bgPickerRecords = _bgPickerRecords.filter(r => r.id !== id);
  if (S.bgActiveId === id) setActiveBackground(null);
  renderBgGrid();
}

function renderBgGrid() {
  const grid = $('bg-picker-grid');
  if (!grid) return;
  grid.innerHTML = '';
  _bgPickerRecords.sort((a, b) => (a.ts || 0) - (b.ts || 0));

  const noneTile = document.createElement('div');
  noneTile.className = 'bg-tile bg-tile-none' + (S.bgActiveId || S.bgImage ? '' : ' selected');
  const noneLabel = document.createElement('span');
  noneLabel.textContent = t('bg.none');
  noneTile.appendChild(noneLabel);
  noneTile.addEventListener('click', () => { setActiveBackground(null); renderBgGrid(); });
  grid.appendChild(noneTile);

  _bgPickerRecords.forEach(rec => {
    const tile = document.createElement('div');
    tile.className = 'bg-tile' + (rec.id === S.bgActiveId ? ' selected' : '');
    const img = document.createElement('img');
    img.src = getBgObjectUrl(rec);
    img.alt = rec.name || '';
    tile.appendChild(img);
    const del = document.createElement('button');
    del.className = 'bg-tile-del';
    setBtnLabel(del, t('bg.deleteTip'));
    del.textContent = '×';
    del.addEventListener('click', e => { e.stopPropagation(); deleteBackgroundRecord(rec.id); });
    tile.appendChild(del);
    tile.addEventListener('click', () => { setActiveBackground(rec); renderBgGrid(); });
    grid.appendChild(tile);
  });

  const addTile = document.createElement('div');
  addTile.className = 'bg-tile bg-tile-add';
  const plus = document.createElement('span');
  plus.className = 'bg-add-plus';
  plus.textContent = '＋';
  const addLabel = document.createElement('span');
  addLabel.textContent = t('bg.add');
  addTile.appendChild(plus);
  addTile.appendChild(addLabel);
  addTile.addEventListener('click', () => $('bg-input').click());
  grid.appendChild(addTile);
}

async function openBgPicker() {
  let records = [];
  try { records = await idbGetAllBackgrounds(); } catch (e) { console.warn('idbGetAllBackgrounds:', e); }
  // 舊版只有單張背景（app_assets.bgImage）：首次開啟圖庫時將它搬進來，之後即可多張管理
  if (!records.length && S.bgImage) {
    try {
      const rec = await idbGetAsset('bgImage');
      if (rec?.blob instanceof Blob) {
        const migrated = { id: uid(), blob: rec.blob, name: '', ts: Date.now() };
        await idbPutBackground(migrated);
        S.bgActiveId = migrated.id;
        save();
        records = [migrated];
      }
    } catch (e) { console.warn('bg migrate:', e); }
  }
  _bgPickerRecords = records;
  showModal({
    title: t('bg.title'),
    desc: t('bg.desc'),
    customHtml: '<div class="bg-picker-grid" id="bg-picker-grid"></div>',
    confirmText: t('msg.ok'),
    // 點選縮圖即時套用，modal 只需一顆「確定」；隱藏取消鍵並於關閉時還原
    onOpen: () => { $('modal-cancel').style.display = 'none'; renderBgGrid(); },
    onConfirm: () => { $('modal-cancel').style.display = ''; },
    onCancel: () => { $('modal-cancel').style.display = ''; }
  });
}

$('avatar-char-name').addEventListener('click', e => {
  e.stopPropagation();
  renameRoleLabel('character');
});
$('avatar-player-name').addEventListener('click', e => {
  e.stopPropagation();
  renameRoleLabel('player');
});

function handleImageUpload(e, stateKey, callback) {
  const file = e.target.files[0];
  if (!file) return;
  setAssetUrl(stateKey, file);
  idbPutAsset(stateKey, file).catch(err => { console.warn('IDB asset write:', err); notifyStorageError(err, 'media'); });
  callback();
  save();
  e.target.value = '';
}

$('avatar-char-input').addEventListener('change', e => handleImageUpload(e, 'avatarChar', () => { updateAvatarSlotUI(); renderMsgs(); }));
$('avatar-player-input').addEventListener('change', e => handleImageUpload(e, 'avatarPlayer', () => { updateAvatarSlotUI(); renderMsgs(); }));

// 背景改走圖庫：可一次選多張，全部存入 backgrounds store，最後一張直接套用
let _bgUploadSeq = 0;
$('bg-input').addEventListener('change', async e => {
  const files = Array.from(e.target.files || []).filter(f => /^image\//i.test(f.type));
  e.target.value = '';
  if (!files.length) return;
  let lastRec = null;
  for (const file of files) {
    const stored = await compressImage(file, 1920); // 背景鋪滿全螢幕，長邊放寬到 1920
    const rec = { id: uid(), blob: stored, name: file.name || '', ts: Date.now() + (_bgUploadSeq++) };
    try {
      await idbPutBackground(rec);
    } catch (err) { console.warn('IDB bg write:', err); notifyStorageError(err, 'media'); }
    _bgPickerRecords.push(rec);
    lastRec = rec;
  }
  if (lastRec) setActiveBackground(lastRec);
  renderBgGrid();
});

/* ══════════════════════════════════════════════════════════
   Column Resizers
══════════════════════════════════════════════════════════ */
(function() {
  function initResizer(resizerId, targetId, side) {
    const resizer = $(resizerId);
    const target  = $(targetId);
    let startX, startW;
    resizer.addEventListener('mousedown', e => {
      e.preventDefault();
      startX = e.clientX;
      startW = target.getBoundingClientRect().width;
      resizer.classList.add('resizing');
      function onMove(e) {
        const delta = side === 'left' ? e.clientX - startX : startX - e.clientX;
        target.style.width = Math.max(100, startW + delta) + 'px';
      }
      function onUp() {
        resizer.classList.remove('resizing');
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }
  initResizer('resizer-left',  'col-left',  'left');
  initResizer('resizer-right', 'col-right', 'right');

  const btnMid = $('toggle-mid-col');
  const btnRight = $('toggle-right-col');
  const ICON_FULLSCREEN = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" aria-hidden="true"><path d="M120-120v-200h80v120h120v80H120Zm520 0v-80h120v-120h80v200H640ZM120-640v-200h200v80H200v120h-80Zm640 0v-120H640v-80h200v200h-80Z"/></svg>`;
  const ICON_CLOSE_FULLSCREEN = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" aria-hidden="true"><path d="m136-80-56-56 264-264H160v-80h320v320h-80v-184L136-80Zm344-400v-320h80v184l264-264 56 56-264 264h184v80H480Z"/></svg>`;
  let fullscreenTarget = '';

  function refreshColumnToggleUI() {
    const isMidFull = fullscreenTarget === 'mid';
    const isRightFull = fullscreenTarget === 'right';
    btnMid.innerHTML = isMidFull ? ICON_CLOSE_FULLSCREEN : ICON_FULLSCREEN;
    btnRight.innerHTML = isRightFull ? ICON_CLOSE_FULLSCREEN : ICON_FULLSCREEN;
    btnMid.title = isMidFull ? t('mid.restoreMid') : t('mid.fullscreenTip');
    btnRight.title = isRightFull ? t('mid.restoreRight') : t('right.fullscreenTip');
    document.body.classList.toggle('mid-fullscreen', isMidFull);
    document.body.classList.toggle('right-fullscreen', isRightFull);
  }

  btnMid.addEventListener('click', () => {
    fullscreenTarget = fullscreenTarget === 'mid' ? '' : 'mid';
    refreshColumnToggleUI();
  });

  btnRight.addEventListener('click', () => {
    fullscreenTarget = fullscreenTarget === 'right' ? '' : 'right';
    refreshColumnToggleUI();
  });

  refreshColumnToggleUI();

  // 點擊外部自動摺疊歌詞
  document.addEventListener('click', (e) => {
    if (S.rightTab === 'songs') {
      document.querySelectorAll('.lyric-wrapper').forEach(wrapper => {
        const content = wrapper.querySelector('.lyric-content');
        if (content && content.classList.contains('expanded') && !wrapper.contains(e.target)) {
           content.classList.remove('expanded');
           const btnSpan = wrapper.querySelector('.lyric-toggle span');
           const btnIcon = wrapper.querySelector('.lyric-icon');
           if (btnSpan) btnSpan.textContent = t('song.expandLyric');
           if (btnIcon) btnIcon.style.transform = 'rotate(0deg)';
        }
      });
    }
  });
})();

/* ══════════════════════════════════════════════════════════
   Scroll Actions
══════════════════════════════════════════════════════════ */
$('btn-scroll-top').addEventListener('click', () => {
  $('message-list').scrollTo({ top: 0, behavior: 'smooth' });
});
$('btn-scroll-bottom').addEventListener('click', () => {
  const list = $('message-list');
  list.scrollTo({ top: list.scrollHeight, behavior: 'smooth' });
  // .msg-row uses content-visibility:auto, so off-screen rows only report their
  // real height once they're revealed near the viewport. As the scroll moves
  // down, more rows get revealed and scrollHeight keeps growing, so a single
  // snap-to-bottom can still undershoot. Keep chasing the bottom each frame
  // until scrollHeight stops changing.
  let lastHeight = -1, stableFrames = 0, ticks = 0;
  (function chase() {
    list.scrollTop = list.scrollHeight;
    stableFrames = list.scrollHeight === lastHeight ? stableFrames + 1 : 0;
    lastHeight = list.scrollHeight;
    ticks++;
    if (stableFrames < 3 && ticks < 90) requestAnimationFrame(chase);
  })();
});

/* ══════════════════════════════════════════════════════════
   Full-text Search
══════════════════════════════════════════════════════════ */
const SEARCH_MAX_RESULTS  = 300;
const SEARCH_DEBOUNCE_MS  = 220;
const SEARCH_SNIPPET_BACK = 40;   // 命中位置往前保留的字元數
const SEARCH_SNIPPET_FWD  = 120;  // 往後保留的字元數

// 語料只在面板開啟期間持有。七千多則訊息的文字有數 MB，關閉就丟掉，
// 不長期佔記憶體；面板是 modal，開著時不可能有訊息被增刪，
// 因此也不需要額外的快取失效機制。
let _searchCorpus = null;
let _searchTimer  = null;
let _searchSeq    = 0;   // 避免較慢的舊查詢蓋掉新結果

async function buildSearchCorpus() {
  const db = await openDB();
  const all = await new Promise((resolve, reject) => {
    const req = db.transaction('messages', 'readonly').objectStore('messages').getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror   = e => reject(e.target.error);
  });
  // 分隔線沒有文字內容，先濾掉；只留搜尋與顯示用得到的欄位
  return all
    .filter(m => m && m.type === 'msg')
    .map(m => ({
      id    : m.id,
      tsStr : m.tsStr || '',
      name  : m.name || '',
      text  : Array.isArray(m.lines) ? m.lines.join('\n') : ''
    }));
}

// msgId → 所屬資料夾。以 folder.msgIds 為準（訊息自身的 folderId 是舊欄位，
// 搬移資料夾後不保證同步），這樣結果顯示的位置才跟左欄看到的一致。
function buildMsgFolderMap() {
  const map = new Map();
  for (const f of S.folders) {
    for (const id of (f.msgIds || [])) map.set(id, f);
  }
  return map;
}

function searchFolderLabel(folder) {
  if (!folder) return t('folder.uncategorized');
  if (!folder.parentId) return folder.name;
  const parent = S.folders.find(f => f.id === folder.parentId);
  return parent ? `${parent.name} / ${folder.name}` : folder.name;
}

// 目前檢視涵蓋的訊息 id（父資料夾含其子資料夾），與中欄顯示的範圍一致
function currentViewMsgIds() {
  const folder = S.folders.find(f => f.id === S.view);
  if (!folder) return null;
  const ids = new Set(folder.msgIds || []);
  S.folders.filter(f => f.parentId === folder.id)
           .forEach(c => (c.msgIds || []).forEach(id => ids.add(id)));
  return ids;
}

function setSearchStatus(text) {
  $('msg-search-status').textContent = text || '';
}

// 找出所有關鍵字的命中區間並合併重疊，再以文字節點與 <mark> 組出內容。
// 全程使用 textContent，不碰 innerHTML，訊息內容含 < > & 也不會出事。
function appendHighlighted(el, text, terms) {
  const lower = text.toLowerCase();
  const ranges = [];
  for (const term of terms) {
    let i = lower.indexOf(term);
    while (i >= 0) {
      ranges.push([i, i + term.length]);
      i = lower.indexOf(term, i + term.length);
    }
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([r[0], r[1]]);
  }
  let pos = 0;
  for (const [s, e] of merged) {
    if (s > pos) el.appendChild(document.createTextNode(text.slice(pos, s)));
    const mark = document.createElement('mark');
    mark.textContent = text.slice(s, e);
    el.appendChild(mark);
    pos = e;
  }
  if (pos < text.length) el.appendChild(document.createTextNode(text.slice(pos)));
}

function buildSnippet(text, terms) {
  const lower = text.toLowerCase();
  let first = -1;
  for (const term of terms) {
    const i = lower.indexOf(term);
    if (i >= 0 && (first < 0 || i < first)) first = i;
  }
  if (first < 0) first = 0;
  const start = Math.max(0, first - SEARCH_SNIPPET_BACK);
  const end   = Math.min(text.length, first + SEARCH_SNIPPET_FWD);
  return (start > 0 ? '…' : '') + text.slice(start, end).replace(/\s+/g, ' ')
       + (end < text.length ? '…' : '');
}

function performSearch() {
  const seq   = ++_searchSeq;
  const raw   = $('msg-search-input').value.trim();
  const list  = $('msg-search-results');
  const terms = raw.toLowerCase().split(/\s+/).filter(Boolean);

  if (terms.length === 0) {
    list.replaceChildren();
    setSearchStatus(t('search.hint'));
    return;
  }
  if (!_searchCorpus) { setSearchStatus(t('search.searching')); return; }

  const folderMap   = buildMsgFolderMap();
  const currentOnly = $('msg-search-scope').checked;
  let scopeIds = null;              // null 代表不限制
  let scopeNote = '';
  if (currentOnly) {
    if (S.view === null) scopeIds = 'unclassified';
    else {
      scopeIds = currentViewMsgIds();
      if (!scopeIds) { scopeIds = null; scopeNote = t('search.scopeEmpty'); }
    }
  }

  const hits = [];
  let total = 0;
  for (const m of _searchCorpus) {
    if (scopeIds === 'unclassified') { if (folderMap.has(m.id)) continue; }
    else if (scopeIds && !scopeIds.has(m.id)) continue;

    const lower = m.text.toLowerCase();
    let ok = true;
    for (const term of terms) { if (!lower.includes(term)) { ok = false; break; } }
    if (!ok) continue;

    total++;
    if (hits.length < SEARCH_MAX_RESULTS) hits.push(m);
  }
  if (seq !== _searchSeq) return;   // 已有更新的查詢

  const frag = document.createDocumentFragment();
  for (const m of hits) {
    const folder = folderMap.get(m.id) || null;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'msg-search-hit';

    const meta = document.createElement('div');
    meta.className = 'msg-search-hit-meta';
    const fEl = document.createElement('span');
    fEl.className = 'msg-search-hit-folder';
    fEl.textContent = searchFolderLabel(folder);
    const tEl = document.createElement('span');
    tEl.textContent = `${m.tsStr}${m.name ? ' · ' + m.name : ''}`;
    meta.appendChild(fEl);
    meta.appendChild(tEl);

    const body = document.createElement('div');
    body.className = 'msg-search-hit-text';
    appendHighlighted(body, buildSnippet(m.text, terms), terms);

    btn.appendChild(meta);
    btn.appendChild(body);
    btn.addEventListener('click', () => jumpToMessage(m.id, folder));
    frag.appendChild(btn);
  }
  list.replaceChildren(frag);

  if (total === 0) setSearchStatus(t('search.noResult'));
  else {
    const parts = [tf('search.resultCount', total)];
    if (total > SEARCH_MAX_RESULTS) parts.push(tf('search.truncated', SEARCH_MAX_RESULTS));
    if (scopeNote) parts.push(scopeNote);
    setSearchStatus(parts.join('　'));
  }
}

function scheduleSearch() {
  if (_searchTimer) clearTimeout(_searchTimer);
  _searchTimer = setTimeout(() => { _searchTimer = null; performSearch(); }, SEARCH_DEBOUNCE_MS);
}

async function jumpToMessage(msgId, folder) {
  closeSearchPanel();
  const sel = `.msg-row[data-id="${CSS.escape(msgId)}"]`;
  // 已經在畫面上（例如正看著父資料夾的合併檢視）就不必切換，避免畫面白跳一下
  let row = document.querySelector(sel);
  if (!row) {
    const targetView = folder ? folder.id : null;
    if (S.view !== targetView) {
      _skipNextAnchorRestore = true;   // 這次別還原舊捲動位置，我們要捲到命中的訊息
      await switchView(targetView, folder ? folder.name : t('folder.uncategorized'));
    }
    await _renderDonePromise;      // 分批渲染全部結束後才保證找得到節點
    row = document.querySelector(sel);
  }
  if (!row) return;
  const bubble = row.querySelector('.msg-bubble') || row;
  bubble.classList.add('msg-search-flash');
  scrollRowIntoViewStable(row, () => {
    setTimeout(() => bubble.classList.remove('msg-search-flash'), 1800);
  });
}

// 訊息載入後頭像等資源會陸續改變版面高度，目標的位置也跟著位移。
// 平滑捲動會追著移動中的目標跑，最後停在錯誤的地方（實測會差六千多 px）。
// 因此改用瞬間定位並反覆校正，直到連續數幀位置都不再變動為止。
function scrollRowIntoViewStable(row, onSettled) {
  const list = $('message-list');
  let stableFrames = 0, lastTop = NaN, ticks = 0;
  (function chase() {
    const r = row.getBoundingClientRect();
    const c = list.getBoundingClientRect();
    const offCenter = Math.abs((r.top + r.height / 2) - (c.top + c.height / 2));
    if (offCenter > 4) row.scrollIntoView({ block: 'center' });

    stableFrames = (row.offsetTop === lastTop && offCenter <= 4) ? stableFrames + 1 : 0;
    lastTop = row.offsetTop;
    ticks++;
    if (stableFrames < 3 && ticks < 90) requestAnimationFrame(chase);
    else if (onSettled) onSettled();
  })();
}

async function openSearchPanel() {
  const overlay = $('msg-search-overlay');
  if (overlay.classList.contains('open')) return;
  overlay.classList.add('open');
  const input = $('msg-search-input');
  input.focus();
  input.select();

  if (!_searchCorpus) {
    setSearchStatus(t('search.searching'));
    try {
      _searchCorpus = await buildSearchCorpus();
    } catch (e) {
      console.warn('buildSearchCorpus:', e);
      setSearchStatus(t('search.noResult'));
      return;
    }
  }
  performSearch();
}

function closeSearchPanel() {
  const overlay = $('msg-search-overlay');
  if (!overlay.classList.contains('open')) return;
  overlay.classList.remove('open');
  if (_searchTimer) { clearTimeout(_searchTimer); _searchTimer = null; }
  $('msg-search-results').replaceChildren();
  _searchCorpus = null;            // 釋放語料佔用的記憶體
}

$('backup-reminder-export').addEventListener('click', async () => {
  try { await exportAllData(); }        // 成功時 markBackupDone() 會收起橫幅
  catch (e) { console.warn('exportAllData:', e); notifyFatalError('export', e); }
});
$('backup-reminder-later').addEventListener('click', snoozeBackupReminder);

$('msg-search-btn').addEventListener('click', openSearchPanel);
$('msg-search-close').addEventListener('click', closeSearchPanel);
$('msg-search-overlay').addEventListener('click', e => {
  if (e.target === $('msg-search-overlay')) closeSearchPanel();
});
$('msg-search-input').addEventListener('input', scheduleSearch);
$('msg-search-scope').addEventListener('change', performSearch);
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && $('msg-search-overlay').classList.contains('open')) {
    closeSearchPanel();
    return;
  }
  // Ctrl / Cmd + K：不搶瀏覽器原生的 Ctrl+F
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k') {
    if (document.body.classList.contains('site-mode')) return;
    e.preventDefault();
    openSearchPanel();
  }
});

/* ══════════════════════════════════════════════════════════
   Boot
══════════════════════════════════════════════════════════ */
const SETTINGS_KEY = 'tak_fire_v2_sys';
const FONT_SCALE_MIN = 90;
const FONT_SCALE_MAX = 130;
const FONT_SCALE_STEP = 10;

function clampFontScale(v) {
  const n = Math.round(Number(v) || 100);
  return Math.min(FONT_SCALE_MAX, Math.max(FONT_SCALE_MIN, n));
}

function updateFontScaleLabel() {
  $('set-font-scale-label').textContent = `${clampFontScale(S.settings.fontScale)}%`;
}

function loadSettings() {
  try {
    const d = JSON.parse(lsGet(SETTINGS_KEY) || '{}');
    S.settings = { theme: 'jazz', font: 'system', fontScale: 100, lang: 'zh-TW', musicVolume: 1, ...d };
  } catch(e) { S.settings = { theme: 'jazz', font: 'system', fontScale: 100, lang: 'zh-TW', musicVolume: 1 }; }
  S.settings.fontScale = clampFontScale(S.settings.fontScale);
  if (!I18N[S.settings.lang]) S.settings.lang = 'zh-TW';
  applySettings();
}
function saveSettings() {
  try { lsSet(SETTINGS_KEY, JSON.stringify(S.settings)); }
  catch(e) { console.warn('saveSettings:', e); notifyStorageError(e); }
  applySettings();
}
function applySettings() {
  document.body.dataset.theme = S.settings.theme;
  document.body.dataset.font = S.settings.font;
  // 內文字體大小以 CSS 變數提供，供閱讀內容用 calc() 套用（全站皆為 px，根字級無法縮放）
  document.documentElement.style.setProperty('--font-scale', clampFontScale(S.settings.fontScale) / 100);
  setLanguage(S.settings.lang || 'zh-TW');
}

$('sys-settings-btn').addEventListener('click', () => {
  $('set-theme').value = S.settings.theme;
  $('set-font').value = S.settings.font;
  $('set-lang').value = S.settings.lang || 'zh-TW';
  updateFontScaleLabel();
  $('settings-overlay').style.display = 'flex';
});
$('settings-close-btn').addEventListener('click', () => $('settings-overlay').style.display = 'none');
// 與 icon picker 行為一致：點擊視窗外部也可關閉
$('settings-overlay').addEventListener('click', e => {
  if (e.target === $('settings-overlay')) $('settings-overlay').style.display = 'none';
});
$('set-theme').addEventListener('change', e => { S.settings.theme = e.target.value; saveSettings(); });
$('set-font').addEventListener('change', e => { S.settings.font = e.target.value; saveSettings(); });
$('set-lang').addEventListener('change', e => {
  S.settings.lang = e.target.value;
  saveSettings();
  // applyI18n 只處理靜態 data-i18n 節點，動態渲染的內容需重繪才會換語言
  renderFolders();
  updateMidHeaderTitle();
  updateAvatarSlotUI();
  if (S.rightTab === 'songs') renderSongsList(); else renderRight();
  if (document.body.classList.contains('site-mode')) renderSitePage(SS.currentPage);
  showBackupReminderIfDue();   // 橫幅文字含天數，非靜態 data-i18n 節點
});
$('set-font-dec').addEventListener('click', () => {
  S.settings.fontScale = clampFontScale((S.settings.fontScale || 100) - FONT_SCALE_STEP);
  updateFontScaleLabel();
  saveSettings();
});
$('set-font-inc').addEventListener('click', () => {
  S.settings.fontScale = clampFontScale((S.settings.fontScale || 100) + FONT_SCALE_STEP);
  updateFontScaleLabel();
  saveSettings();
});

loadSettings();
load();

$('col-right').dataset.tab = S.rightTab || 'events';
if (S.rightTab === 'songs') {
   $('tab-events').classList.remove('active');
   $('tab-songs').classList.add('active');
}
$('sort-folder-btn').textContent = S.folderSort === 'asc' ? '▲' : '▼';

applyCalendarToggle();
loadViewState();
renderFolders();
updateAvatarSlotUI();
updateBgUI();
initMessageListDelegation();
showBackupReminderIfDue();

// 若 reload 後 S.view 指向某資料夾，同步 mid-header-title（不用 await loadViewMessages 因 boot 之後會 renderMsgs）
if (S.view !== null) {
  const cur = S.folders.find(f => f.id === S.view);
  if (cur) updateMidHeaderTitle(cur.name);
}

// Skeleton：IDB 還沒就緒前先顯示佔位，避免空白閃爍
$('message-list').innerHTML = `<div class="empty-state"><small>${esc(t('msg.loading'))}</small></div>`;

// 先開啟 IDB，再平行執行：
//   - assets / covers（不阻塞訊息渲染）
//   - 訊息渲染（最高優先）
openDB().then(async () => {
  // 訊息與計數優先，不等 covers / mp3
  const [,] = await Promise.all([
    renderMsgs(),
    refreshUnclassifiedCount(),
  ]);
  // 還原捲動位置到 reload 前的訊息
  restoreScrollAnchor();
  // 清理 folder.msgIds 中失效引用（歷史遺留的孤立 ID）
  await pruneOrphanMsgIds();
  renderFolders(); // 計數更新後刷新資料夾

  // 接著載入 assets（頭像、背景），有載到才補刷，避免無資產時多做一次全量重繪
  loadAllAssets().then(loadedKeys => {
    if (loadedKeys.length === 0) return;
    updateAvatarSlotUI();
    updateBgUI();
    // 訊息列表只用到頭像；僅有背景圖時不需重繪訊息
    if (loadedKeys.some(k => k !== 'bgImage')) renderMsgs().then(restoreScrollAnchor);
  }).catch(() => {});

  // 封面懶載入（不阻塞主流程）
  loadAllCoverUrls().then(() => {
    if (S.rightTab === 'songs') renderSongsList();
    if (document.body.classList.contains('site-mode') && SS.currentPage === 'music') renderMusicPage();
  }).catch(() => {});

  // MP3 懶載入：還原 blob URL，讓播放器時間軸正常顯示
  loadAllMp3Urls().then(() => {
    if (S.rightTab === 'songs') renderSongsList();
    if (document.body.classList.contains('site-mode') && SS.currentPage === 'music') renderMusicPage();
  }).catch(() => {});

  // 右欄渲染（不需要 IDB）
  if (S.rightTab === 'events') renderRight();
  if (S.rightTab === 'songs') renderSongsList();

}).catch(err => {
  console.warn('Boot IDB init:', err);
  renderMsgs();
  if (S.rightTab === 'events') renderRight();
  if (S.rightTab === 'songs') renderSongsList();
});

