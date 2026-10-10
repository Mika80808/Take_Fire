'use strict';

/* ══════════════════════════════════════════════════════════
   OFFICIAL SITE
══════════════════════════════════════════════════════════ */

/* ── State ── */
const SS = {
  currentPage : 'poster',
  posters     : [],        // { id, src, label, isLocal }
  lightboxIdx : 0,
  editingSongIdx : null,
  editingTourId  : null,
  tourEvents  : [],        // { id, date, time, title, location, body, folderId }
  members     : [
    { id: 'member_a', name: t('member.unnamed'), role: 'Vocal', height: '', mbti: '', zodiac: '', bio: t('member.bio'), photo: null },
    { id: 'kazo',     name: 'KAZO', role: 'Leader / Bass', height: '185cm', mbti: 'ESTJ', zodiac: 'Libra 10/10', bio: '', photo: null },
    { id: 'javy',     name: 'Javy', role: 'Guitar',        height: '182cm', mbti: 'ESFP', zodiac: 'Gemini 6/6',  bio: '', photo: null },
    { id: 'ace',      name: 'ACE',  role: 'Drums',         height: '184cm', mbti: 'ISTP', zodiac: 'Aries 4/1',   bio: '', photo: null },
  ]
};

const LS_SITE = 'tak_fire_site_v1';
const SITE_PAGES = new Set(['poster', 'music', 'tour', 'about']);

function saveSite() {
  try {
    // photo 欄位儲存於 IDB，此處排除以免 base64 塞爆 localStorage
    const membersNoPhoto = SS.members.map(({ photo, ...rest }) => rest);
    lsSet(LS_SITE, JSON.stringify({
      tourEvents : SS.tourEvents,
      members    : membersNoPhoto,
      currentPage: SS.currentPage,
    }));
  } catch(e) {
    console.warn('saveSite:', e);
    notifyStorageError(e);
  }
}

function loadSite() {
  try {
    const d = JSON.parse(lsGet(LS_SITE) || '{}');
    SS.tourEvents = Array.isArray(d.tourEvents) ? d.tourEvents : [];
    // photo 不從 localStorage 讀取，由 loadAllMemberPhotos() 從 IDB 補回
    SS.members = Array.isArray(d.members) && d.members.length
      ? d.members.map((m, i) => ({ ...m, id: m?.id || SS.members[i]?.id || uid(), photo: null, cgNote: typeof m?.cgNote === 'string' ? m.cgNote : '' }))
      : SS.members;
    SS.currentPage = SITE_PAGES.has(d.currentPage) ? d.currentPage : 'poster';
  } catch(e) {}
}

/* ── Mode Switch ── */
$('btn-story-mode').addEventListener('click', () => switchMode('story'));
$('btn-site-mode').addEventListener('click', () => {
  switchMode('site');
  renderSitePage(SS.currentPage);
});

function switchMode(mode) {
  if (mode === 'site') {
    document.body.classList.add('site-mode');
    $('btn-site-mode').classList.add('active');
    $('btn-story-mode').classList.remove('active');
    // 在 Official Site 模式下隱藏 Story Mode 的背景圖片
    document.body.style.backgroundImage = '';
    document.body.style.backgroundSize = '';
    document.body.style.backgroundPosition = '';
  } else {
    document.body.classList.remove('site-mode');
    $('btn-story-mode').classList.add('active');
    $('btn-site-mode').classList.remove('active');
    // 回到 Story Mode 時還原背景圖片
    if (S.bgImage) {
      document.body.style.backgroundImage = `url('${S.bgImage}')`;
      document.body.style.backgroundSize = 'cover';
      document.body.style.backgroundPosition = 'center';
    }
  }
}

/* ── Site Nav ── */
document.querySelectorAll('.site-nav-item').forEach(el => {
  el.addEventListener('click', () => renderSitePage(el.dataset.page));
  addKeyActivation(el);
});

function renderSitePage(page) {
  const nextPage = SITE_PAGES.has(page) ? page : 'poster';
  SS.currentPage = nextPage;
  document.querySelectorAll('.site-page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.site-nav-item').forEach(i => i.classList.toggle('active', i.dataset.page === nextPage));
  const pageEl = $(`page-${nextPage}`);
  if (!pageEl) return;
  pageEl.classList.add('active');
  if (nextPage === 'poster') renderPoster();
  if (nextPage === 'music')  renderMusicPage();
  if (nextPage === 'tour')   renderTourPage();
  if (nextPage === 'about')  renderAbout();
  const fab = $('cg-nb-fab');
  if (fab) fab.style.display = (nextPage === 'poster') ? 'flex' : 'none';
  if (nextPage !== 'poster') closeCGNotebook();
  saveSite();
}

/* ══════════════════════════════════════════════════════════
   CG Notebook — 每個角色一組設定文字
══════════════════════════════════════════════════════════ */
let _cgNbIdx = 0;
let _cgNbTimer = null;

function openCGNotebook() {
  const d = $('cg-nb-drawer'); if (!d) return;
  if (_cgNbIdx >= SS.members.length) _cgNbIdx = 0;
  buildCGNbTabs();
  cgNbSelect(_cgNbIdx);
  d.classList.add('open');
  d.setAttribute('aria-hidden', 'false');
  $('cg-nb-overlay')?.classList.add('open');
  $('cg-nb-fab')?.classList.add('cg-nb-hidden');
  setTimeout(() => $('cg-nb-text')?.focus(), 280);
}

function closeCGNotebook() {
  const d = $('cg-nb-drawer'); if (!d) return;
  flushCGNbSave();
  d.classList.remove('open');
  d.setAttribute('aria-hidden', 'true');
  $('cg-nb-overlay')?.classList.remove('open');
  $('cg-nb-fab')?.classList.remove('cg-nb-hidden');
}

function buildCGNbTabs() {
  const wrap = $('cg-nb-tabs'); if (!wrap) return;
  wrap.innerHTML = '';
  SS.members.forEach((m, i) => {
    const b = document.createElement('div');
    b.className = 'cg-nb-tab' + (i === _cgNbIdx ? ' active' : '');
    b.textContent = m.name || t('member.unnamed');
    b.title = b.textContent;
    b.addEventListener('click', () => cgNbSelect(i));
    wrap.appendChild(b);
  });
}

function cgNbSelect(i) {
  if (i !== _cgNbIdx) flushCGNbSave();
  _cgNbIdx = i;
  $('cg-nb-tabs')?.querySelectorAll('.cg-nb-tab').forEach((b, idx) => b.classList.toggle('active', idx === i));
  const ta = $('cg-nb-text');
  if (ta) ta.value = SS.members[i]?.cgNote || '';
  updateCGNbCount();
}

function updateCGNbCount() {
  const ta = $('cg-nb-text'), out = $('cg-nb-count');
  if (ta && out) out.textContent = ta.value.length + ' ' + t('nb.chars');
}

function scheduleCGNbSave() {
  clearTimeout(_cgNbTimer);
  _cgNbTimer = setTimeout(flushCGNbSave, 500);
}

function flushCGNbSave() {
  clearTimeout(_cgNbTimer); _cgNbTimer = null;
  const ta = $('cg-nb-text'); if (!ta) return;
  const m = SS.members[_cgNbIdx]; if (!m) return;
  if (m.cgNote === ta.value) return;
  m.cgNote = ta.value;
  saveSite();
  flashCGNbSaved();
}

function flashCGNbSaved() {
  const el = $('cg-nb-saved'); if (!el) return;
  el.style.opacity = '1';
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.style.opacity = '0'; }, 1200);
}

(function initCGNotebook() {
  $('cg-nb-fab')?.addEventListener('click', openCGNotebook);
  $('cg-nb-close')?.addEventListener('click', closeCGNotebook);
  $('cg-nb-overlay')?.addEventListener('click', closeCGNotebook);
  $('cg-nb-text')?.addEventListener('input', () => { updateCGNbCount(); scheduleCGNbSave(); });
  $('cg-nb-copy')?.addEventListener('click', () => {
    const ta = $('cg-nb-text'); if (!ta) return;
    copyTextToClipboard(ta.value, () => {
      const lbl = document.querySelector('#cg-nb-copy .cg-nb-copy-lbl');
      if (!lbl) return;
      const orig = lbl.textContent;
      lbl.textContent = t('nb.copied');
      setTimeout(() => { lbl.textContent = orig; }, 1500);
    });
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && $('cg-nb-drawer')?.classList.contains('open')) closeCGNotebook();
  });
})();

/* ══════════════════════════════════════════════════════════
   POSTER — IndexedDB storage
══════════════════════════════════════════════════════════ */
const CG_INDEX_URL = ''; // 填入 GitHub raw URL，例如 https://raw.githubusercontent.com/yourname/repo/main/cg-index.json

/* ── IndexedDB helpers ── */
async function fetchRemotePosters() {
  if (!CG_INDEX_URL) return [];
  try {
    const res = await fetch(CG_INDEX_URL);
    if (!res.ok) return [];
    const list = await res.json();
    return list.map(item => ({ ...item, id: 'remote_' + item.src, isLocal: false }));
  } catch(e) { return []; }
}

function buildPosterGrid(posters) {
  const grid = $('poster-grid');
  grid.innerHTML = '';

  posters.forEach((poster, idx) => {
    const cell = document.createElement('div');
    cell.className = 'poster-cell';

    const img = document.createElement('img');
    img.src = poster.src;
    img.alt = poster.label || '';
    img.draggable = false; // 避免瀏覽器原生的拖曳圖片搶走排序拖曳

    const overlay = document.createElement('div');
    overlay.className = 'poster-cell-overlay';

    // 刪除按鈕（hover 時顯示，僅本機圖片）
    const editBtn = document.createElement('button');
    editBtn.className = 'poster-edit-btn';
    editBtn.textContent = '✎';
    setBtnLabel(editBtn, t('poster.edit'));
    editBtn.addEventListener('click', e => { e.stopPropagation(); openLightbox(idx); });
    cell.appendChild(editBtn);

    cell.appendChild(img);
    cell.appendChild(overlay);
    cell.addEventListener('click', () => { if (!_posterSuppressClick) openLightbox(idx); });
    if (poster.isLocal) {
      cell.dataset.idx = idx;
      cell.addEventListener('mousedown', e => onPosterMouseDown(e, idx));
    }
    grid.appendChild(cell);
  });

  const addCell = document.createElement('div');
  addCell.className = 'poster-add-cell';
  addCell.innerHTML = `<div class="poster-add-icon">＋</div><div>${esc(t('poster.uploadCG'))}</div>`;
  addCell.addEventListener('click', () => openPosterModal(null));
  grid.appendChild(addCell);
}

/* ── Photo 排序 ──
   ts 兼作排序鍵（由小到大顯示）。手動調整順序時改寫本機照片的 ts，新上傳的照片
   用 Date.now()，一定比既有的大，所以會接在最後面。遠端照片固定排在前面、不參與排序。 */
let _posterOrderSave = Promise.resolve();

function persistPosterOrder() {
  const local = SS.posters.filter(p => p.isLocal);
  if (!local.length) return;
  const base = Math.min(...local.map(p => (typeof p.ts === 'number' ? p.ts : Date.now())));
  local.forEach((p, i) => { p.ts = base + i; });
  const wanted = new Map(local.map(p => [p.id, p.ts]));
  // 串成一條佇列，連續快速調整時後一次的寫入一定蓋在前一次之後
  _posterOrderSave = _posterOrderSave.then(async () => {
    const records = await idbGetAllPosters();
    await Promise.all(records
      .filter(rec => wanted.has(rec.id) && rec.ts !== wanted.get(rec.id))
      .map(rec => idbPutPoster({ ...rec, ts: wanted.get(rec.id) })));
  }).catch(err => { console.warn('poster order save:', err); notifyStorageError(err, 'media'); });
}

// 把 from 位置的照片移到 target 照片的前面或後面
function movePosterTo(from, target, pos) {
  const [moved] = SS.posters.splice(from, 1);
  const ti = SS.posters.indexOf(target) + (pos === 'after' ? 1 : 0);
  SS.posters.splice(ti, 0, moved);
  persistPosterOrder();
  buildPosterGrid(SS.posters);
}

// 滑鼠按住照片拖曳：移動超過幾像素才算拖曳，否則仍是點開照片
const POSTER_DRAG_THRESHOLD = 6;
let _posterDrag = null;          // { idx, x, y, dragging, target, pos }
let _posterSuppressClick = false;

function onPosterMouseDown(e, idx) {
  if (e.button !== 0 || e.target.closest('button')) return;
  e.preventDefault();
  _posterDrag = { idx, x: e.clientX, y: e.clientY, dragging: false, target: null, pos: null };
}

function clearPosterDropMarks() {
  document.querySelectorAll('#poster-grid .poster-cell').forEach(el =>
    el.classList.remove('dragging', 'drop-before', 'drop-after'));
}

document.addEventListener('mousemove', e => {
  const d = _posterDrag;
  if (!d) return;
  if (!d.dragging) {
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < POSTER_DRAG_THRESHOLD) return;
    d.dragging = true;
    document.body.classList.add('poster-dragging');
    document.querySelector(`#poster-grid .poster-cell[data-idx="${d.idx}"]`)?.classList.add('dragging');
  }
  const cell = document.elementFromPoint(e.clientX, e.clientY)?.closest('#poster-grid .poster-cell[data-idx]');
  const ti = cell ? Number(cell.dataset.idx) : -1;
  let pos = null;
  if (cell && ti !== d.idx) {
    const r = cell.getBoundingClientRect();
    pos = e.clientX < r.left + r.width / 2 ? 'before' : 'after';
  }
  d.target = pos ? SS.posters[ti] : null;
  d.pos = pos;
  document.querySelectorAll('#poster-grid .poster-cell').forEach(el => {
    el.classList.toggle('drop-before', pos === 'before' && el === cell);
    el.classList.toggle('drop-after',  pos === 'after'  && el === cell);
  });
});

document.addEventListener('mouseup', () => {
  const d = _posterDrag;
  _posterDrag = null;
  if (!d?.dragging) return;
  document.body.classList.remove('poster-dragging');
  clearPosterDropMarks();
  // 放開後瀏覽器可能還會送出一次 click，別讓它把照片打開
  _posterSuppressClick = true;
  setTimeout(() => { _posterSuppressClick = false; }, 0);
  if (d.target) movePosterTo(d.idx, d.target, d.pos);
});

// 照片檢視視窗裡的「往前移／往後移」：觸控裝置無法拖曳，用這兩顆鍵調整
function igModalMove(delta) {
  const i = SS.lightboxIdx;
  const j = i + delta;
  const a = SS.posters[i], b = SS.posters[j];
  if (!a?.isLocal || !b?.isLocal) return;
  [SS.posters[i], SS.posters[j]] = [b, a];
  SS.lightboxIdx = j;
  persistPosterOrder();
  buildPosterGrid(SS.posters);
  igModalUpdateMoveBtns();
}

function igModalUpdateMoveBtns() {
  const i = SS.lightboxIdx;
  const cur = SS.posters[i];
  const canMove = d => !!(cur?.isLocal && SS.posters[i + d]?.isLocal);
  $('ig-modal-move-prev').disabled = !canMove(-1);
  $('ig-modal-move-next').disabled = !canMove(1);
  $('ig-modal-move').style.visibility = cur?.isLocal ? '' : 'hidden';
}

$('ig-modal-move-prev').addEventListener('click', () => igModalMove(-1));
$('ig-modal-move-next').addEventListener('click', () => igModalMove(1));

// 舊版沒有記錄上傳時間：改用圖片檔本身的時間（壓縮過的圖片就是上傳當下），
// 並寫回 IDB，之後匯出備份再匯入也不會遺失（匯入後的 Blob 不帶檔案時間）。
function posterTs(rec) {
  if (typeof rec.ts === 'number') return rec.ts;
  const ts = typeof rec.blob.lastModified === 'number' ? rec.blob.lastModified : 0;
  idbPutPoster({ ...rec, ts }).catch(err => console.warn('poster ts backfill:', err));
  return ts;
}

async function renderPoster() {
  const grid = $('poster-grid');
  grid.innerHTML = `<div style="padding:40px;color:var(--c-hint);text-align:center;grid-column:1/-1">${esc(t('msg.loading'))}</div>`;

  const [remote, localRecords] = await Promise.all([
    fetchRemotePosters(),
    idbGetAllPosters(),
  ]);

  // 本機圖片：從 blob 建立 objectURL（跳過 blob 遺失的記錄），依上傳時間 ts 由舊到新排。
  // IDB 的 getAll 是照主鍵排，而主鍵是隨機 UUID，不排序的話每次重新整理順序都不一樣。
  const local = localRecords
    .filter(rec => rec.blob instanceof Blob)
    .map(rec => ({ rec, ts: posterTs(rec) }))
    .sort((a, b) => a.ts - b.ts || (a.rec.id < b.rec.id ? -1 : 1))
    .map(({ rec, ts }) => ({
      id      : rec.id,
      src     : getPosterObjectUrl(rec),
      label   : rec.label || '',
      title   : rec.title || '',
      caption : rec.caption || '',
      noteId  : rec.noteId || rec.folderId || '',
      ts,
      isLocal : true,
    }));

  const remoteIds = new Set(remote.map(p => p.id));
  const merged = [...remote, ...local.filter(p => !remoteIds.has(p.id))];
  SS.posters = merged;

  buildPosterGrid(merged);
}

// 將資料夾以階層樹狀填入 select（共用：海報 / IG / 巡演 modal）
function fillFolderSelect(sel, placeholderText) {
  sel.innerHTML = `<option value="">${esc(placeholderText)}</option>`;
  const append = (parentId, depth) => {
    S.folders
      .filter(f => (f.parentId || null) === (parentId || null))
      .forEach(f => {
        const opt = document.createElement('option');
        opt.value = f.id;
        opt.textContent = depth === 0 ? f.name : '　'.repeat(depth - 1) + '　| ' + f.name;
        sel.appendChild(opt);
        append(f.id, depth + 1);
      });
  };
  append(null, 0);
}

/* ── Poster Modal ── */
let _pmFile = null;
let _pmPosterId = null;

function openPosterModal(posterId) {
  _pmPosterId = posterId;
  _pmFile = null;
  const isEdit = posterId !== null;
  const poster = isEdit ? SS.posters.find(p => p.id === posterId) : null;

  $('pm-caption').value = poster?.caption || '';

  const preview = $('pm-preview');
  const placeholder = $('pm-placeholder');
  if (poster?.src) {
    preview.src = poster.src;
    preview.style.display = 'block';
    placeholder.style.display = 'none';
  } else {
    preview.src = '';
    preview.style.display = 'none';
    placeholder.style.display = 'flex';
  }

  const sel = $('pm-folder');
  fillFolderSelect(sel, t('poster.linkChapterOpt'));
  sel.value = poster?.noteId || '';

  $('pm-del').style.display = isEdit ? 'block' : 'none';
  const _initFolder = _pmGetFolder(poster?.noteId || '');
  _pmShowChip(_initFolder, poster?.noteId || '');
  $('poster-modal-overlay').classList.add('open');
}

/* ── 圖片壓縮：長邊縮至 1600px、轉存 WebP（不支援則退回 JPEG/PNG），
   手機拍照動輒 5–10MB，壓縮後通常只剩十分之一，大幅節省 IndexedDB 空間 ── */
const IMG_MAX_EDGE  = 1600;
const IMG_QUALITY   = 0.82;
const IMG_SKIP_SIZE = 400 * 1024; // 小檔且不需縮邊就直接存原檔
const COVER_MAX_EDGE        = 800;  // 封面最大只以方形卡片顯示
const MEMBER_PHOTO_MAX_EDGE = 1200; // Profile 頁的直式大頭照

async function compressImage(file, maxEdge = IMG_MAX_EDGE, quality = IMG_QUALITY) {
  // GIF（動畫）、SVG（向量）等格式不重壓，避免破壞內容
  if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) return file;
  let bmp;
  try { bmp = await createImageBitmap(file); } catch { return file; } // 解碼失敗就存原檔
  const scale = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height));
  if (scale === 1 && file.size <= IMG_SKIP_SIZE) { bmp.close(); return file; }
  const canvas = document.createElement('canvas');
  canvas.width  = Math.max(1, Math.round(bmp.width  * scale));
  canvas.height = Math.max(1, Math.round(bmp.height * scale));
  canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  const toBlob = type => new Promise(res => canvas.toBlob(res, type, quality));
  let out = await toBlob('image/webp');
  if (!out || out.type !== 'image/webp') {
    // 舊瀏覽器不支援 WebP 編碼：PNG 保留透明度，其餘轉 JPEG
    out = await toBlob(file.type === 'image/png' ? 'image/png' : 'image/jpeg');
  }
  if (!out || out.size >= file.size) return file; // 沒有變小就不採用
  const ext = { 'image/webp': '.webp', 'image/jpeg': '.jpg', 'image/png': '.png' }[out.type] || '';
  return new File([out], file.name.replace(/\.[^.]+$/, '') + ext, { type: out.type });
}

$('pm-upload-area').addEventListener('click', () => $('pm-file-input').click());
let _pmPickSeq = 0;
$('pm-file-input').addEventListener('change', async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  const seq = ++_pmPickSeq;
  const stored = await compressImage(file);
  if (seq !== _pmPickSeq) return; // 使用者已改選其他圖片
  _pmFile = stored;
  const url = URL.createObjectURL(stored);
  const preview = $('pm-preview');
  preview.src = url;
  preview.style.display = 'block';
  $('pm-placeholder').style.display = 'none';
});

$('pm-save').addEventListener('click', async () => {
  const caption = $('pm-caption').value.trim();
  const title   = '';
  const noteId  = $('pm-folder').value;

  if (_pmPosterId === null) {
    if (!_pmFile) return;
    const id  = uid();
    const src = URL.createObjectURL(_pmFile);
    _posterUrlCache.set(id, src);
    const ts  = Date.now();
    SS.posters.push({ id, src, title, caption, noteId, label: _pmFile.name, ts, isLocal: true });
    idbPutPoster({ id, blob: _pmFile, title, caption, noteId, label: _pmFile.name, ts }).catch(err => { console.warn('IDB write:', err); notifyStorageError(err, 'media'); });
  } else {
    const idx = SS.posters.findIndex(p => p.id === _pmPosterId);
    if (idx !== -1) {
      SS.posters[idx] = { ...SS.posters[idx], title, caption, noteId };
      if (_pmFile) {
        if (_posterUrlCache.has(_pmPosterId)) URL.revokeObjectURL(_posterUrlCache.get(_pmPosterId));
        const src = URL.createObjectURL(_pmFile);
        _posterUrlCache.set(_pmPosterId, src);
        SS.posters[idx].src = src;
        // 換圖不換位置：沿用原本的 ts
        idbPutPoster({ id: _pmPosterId, blob: _pmFile, title, caption, noteId, label: _pmFile.name, ts: SS.posters[idx].ts ?? Date.now() }).catch(err => { console.warn('IDB write:', err); notifyStorageError(err, 'media'); });
      } else {
        const records = await idbGetAllPosters();
        const rec = records.find(r => r.id === _pmPosterId);
        if (rec) idbPutPoster({ ...rec, title, caption, noteId }).catch(err => { console.warn('IDB write:', err); notifyStorageError(err, 'media'); });
      }
    }
  }

  $('poster-modal-overlay').classList.remove('open');
  buildPosterGrid(SS.posters);
});

$('pm-del').addEventListener('click', async () => {
  if (_pmPosterId === null) return;
  if (_posterUrlCache.has(_pmPosterId)) {
    URL.revokeObjectURL(_posterUrlCache.get(_pmPosterId));
    _posterUrlCache.delete(_pmPosterId);
  }
  await idbDeletePoster(_pmPosterId);
  const idx = SS.posters.findIndex(p => p.id === _pmPosterId);
  if (idx !== -1) SS.posters.splice(idx, 1);
  $('poster-modal-overlay').classList.remove('open');
  buildPosterGrid(SS.posters);
});

// 顯示/隱藏「已連結章節」chip（海報 modal 與 IG modal 共用）
function showChapterChip(ids, folder, selValue) {
  const tag = $(ids.tag);
  const sel = $(ids.sel);
  if (folder) {
    $(ids.link).textContent = '→ ' + folder.name;
    tag.style.display = 'inline-flex';
    sel.style.display = 'none';
    sel.value = selValue || folder.id;
  } else {
    tag.style.display = 'none';
    sel.style.display = '';
    sel.value = '';
  }
}

function _pmShowChip(folder, folderId) {
  showChapterChip({ tag: 'pm-chapter-tag', sel: 'pm-folder', link: 'pm-folder-link' }, folder, folderId);
}

$('pm-folder').addEventListener('change', () => {
  const folderId = $('pm-folder').value;
  _pmShowChip(_pmGetFolder(folderId), folderId);
});

$('pm-chapter-remove').addEventListener('click', () => {
  _pmShowChip(null, '');
});

function _pmGetFolder(evtId) {
  if (!evtId) return null;
  // 直接 folder ID（新格式）
  const direct = S.folders.find(f => f.id === evtId);
  if (direct) return direct;
  // 舊格式：note_ 前綴
  if (evtId.startsWith('note_')) {
    const noteId = evtId.slice(5);
    for (const f of S.folders) {
      if ((f.notes || []).some(n => n.id === noteId)) return f;
    }
  }
  // 舊格式：tourEvent folderId
  const evt = SS.tourEvents.find(t => t.id === evtId);
  return evt?.folderId ? S.folders.find(f => f.id === evt.folderId) || null : null;
}

$('pm-folder-link').addEventListener('click', () => {
  const folder = _pmGetFolder($('pm-folder').value);
  if (!folder) return;
  $('poster-modal-overlay').classList.remove('open');
  switchMode('story');
  switchView(folder.id, folder.name);
});

$('pm-cancel').addEventListener('click', () => $('poster-modal-overlay').classList.remove('open'));
$('poster-modal-overlay').addEventListener('click', e => {
  if (e.target === $('poster-modal-overlay')) $('poster-modal-overlay').classList.remove('open');
});

/* ── IG Detail Modal ── */
function _igFolderById(id) {
  if (!id) return null;
  // 直接 folder ID
  const f = S.folders.find(f => f.id === id);
  if (f) return f;
  // 舊格式：note ID → 找所屬 folder
  for (const f of S.folders) {
    if ((f.notes || []).some(n => n.id === id)) return f;
  }
  return null;
}

function igModalFillFolders(selectedFolderId) {
  const sel = $('ig-modal-folder');
  fillFolderSelect(sel, t('igm.chapterPh'));
  // 支援舊格式：noteId → 轉成 folderId
  const folder = _igFolderById(selectedFolderId);
  sel.value = folder ? folder.id : '';
}

function igModalUpdateChapterBtn(folderId) {
  // 支援舊格式：noteId → 轉成 folder
  showChapterChip({ tag: 'ig-chapter-tag', sel: 'ig-modal-folder', link: 'ig-modal-chapter' }, _igFolderById(folderId));
}

function openLightbox(idx) {
  SS.lightboxIdx = idx;
  const poster = SS.posters[idx];
  $('ig-modal-img').src = poster.src;
  $('ig-modal-caption').value = poster.caption || '';
  igModalFillFolders(poster.noteId || '');
  igModalUpdateChapterBtn(poster.noteId || '');

  // 翻頁箭頭：只有超過一張才顯示
  const total = SS.posters.length;
  $('ig-modal-nav-prev').classList.toggle('hidden', total <= 1);
  $('ig-modal-nav-next').classList.toggle('hidden', total <= 1);
  igModalUpdateMoveBtns();

  $('ig-modal-overlay').classList.add('open');
}

function igModalNav(delta) {
  SS.lightboxIdx = (SS.lightboxIdx + delta + SS.posters.length) % SS.posters.length;
  const poster = SS.posters[SS.lightboxIdx];
  $('ig-modal-img').src = poster.src;
  $('ig-modal-caption').value = poster.caption || '';
  igModalFillFolders(poster.noteId || '');
  igModalUpdateChapterBtn(poster.noteId || '');
  igModalUpdateMoveBtns();
}

function closeIgModal() {
  $('ig-modal-overlay').classList.remove('open');
}

$('ig-modal-overlay').addEventListener('click', e => {
  if (e.target === $('ig-modal-overlay')) closeIgModal();
});
$('ig-modal-close').addEventListener('click', closeIgModal);
$('ig-modal-cancel').addEventListener('click', closeIgModal);

$('ig-modal-folder').addEventListener('change', () => {
  igModalUpdateChapterBtn($('ig-modal-folder').value);
});

$('ig-chapter-remove').addEventListener('click', () => {
  igModalUpdateChapterBtn('');
});

$('ig-modal-chapter').addEventListener('click', () => {
  const folder = _igFolderById($('ig-modal-folder').value);
  if (!folder) return;
  closeIgModal();
  switchMode('story');
  switchView(folder.id, folder.name);
});

$('ig-modal-nav-prev').addEventListener('click', e => { e.stopPropagation(); igModalNav(-1); });
$('ig-modal-nav-next').addEventListener('click', e => { e.stopPropagation(); igModalNav(1); });

$('ig-modal-save').addEventListener('click', async () => {
  const idx = SS.lightboxIdx;
  const poster = SS.posters[idx];
  if (!poster) return;
  const caption = $('ig-modal-caption').value.trim();
  const noteId  = $('ig-modal-folder').value;  // 現在存的是 folderId
  SS.posters[idx] = { ...poster, caption, noteId };
  if (poster.isLocal) {
    const records = await idbGetAllPosters();
    const rec = records.find(r => r.id === poster.id);
    if (rec) idbPutPoster({ ...rec, caption, noteId }).catch(err => { console.warn('IDB write:', err); notifyStorageError(err, 'media'); });
  }
  closeIgModal();
  buildPosterGrid(SS.posters);
});

$('ig-modal-del').addEventListener('click', async () => {
  const idx = SS.lightboxIdx;
  const poster = SS.posters[idx];
  if (!poster) return;
  if (_posterUrlCache.has(poster.id)) {
    URL.revokeObjectURL(_posterUrlCache.get(poster.id));
    _posterUrlCache.delete(poster.id);
  }
  if (poster.isLocal) await idbDeletePoster(poster.id);
  SS.posters.splice(idx, 1);
  closeIgModal();
  buildPosterGrid(SS.posters);
});

document.addEventListener('keydown', e => {
  if (!$('ig-modal-overlay').classList.contains('open')) return;
  // 焦點在輸入欄位（如 caption textarea）時，方向鍵是移動游標，不可翻頁蓋掉未儲存的輸入
  const typing = e.target.matches('input, textarea, select');
  if (!typing) {
    if (e.key === 'ArrowLeft')  igModalNav(-1);
    if (e.key === 'ArrowRight') igModalNav(1);
  }
  if (e.key === 'Escape') closeIgModal();
});

/* ══════════════════════════════════════════════════════════
   MUSIC PAGE
══════════════════════════════════════════════════════════ */
// 用 song.id（而非 index）記錄待匯入目標，避免選檔期間列表重排/刪除導致套錯歌
let _pendingCoverSongId = null;
let _pendingMp3SongId   = null;
// 正在播放的 MP3。audio 與 btn 永遠同進同出，先前是兩個平行全域、在六處
// 各自同步；合成一個物件後只剩 set/clear 兩個入口。
// card 是衍生值而非獨立欄位，從 btn 反查，不會有第二份可能過期的資料。
//
// 注意：這跟「哪張卡片是展開的」是兩件事。播放鈕在展開面板裡，實務上兩者
// 常常重合，但語意不同（可以展開卻沒在播），所以 _openMusicCard 獨立維護。
const musicNowPlaying = {
  audio: null,
  btn: null,
  get card() { return this.btn ? this.btn.closest('.music-card') : null; },
  set(audio, btn) { this.audio = audio; this.btn = btn; },
  clear() { this.audio = null; this.btn = null; }
};
let _openMusicCard = null;   // 目前展開的卡片（與播放狀態無關）
const MUSIC_PLAY_ICON_SVG  = `<svg viewBox="0 0 24 24" width="16" height="16" fill="#fff"><path d="M8 5v14l11-7z"/></svg>`;
const MUSIC_PAUSE_ICON_SVG = `<svg viewBox="0 0 24 24" width="16" height="16" fill="#fff"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;

const ICON_LOOP     = `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/></svg>`;
const ICON_VOL_ON   = `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/></svg>`;
const ICON_VOL_MUTE = `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zM4.27 3 3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06a8.94 8.94 0 0 0 3.69-1.81L19.73 21 21 19.73 4.27 3zM12 4 9.91 6.09 12 8.18V4z"/></svg>`;

// 音量是全站共用的偏好（存在 tak_fire_v2_sys），不是每首歌各自的設定：
// 使用者調的是「這個播放器多大聲」，切歌不該又要重調一次。
let _lastNonZeroVolume = 1;

function getMusicVolume() {
  const v = Number(S.settings?.musicVolume);
  return isFinite(v) ? Math.min(1, Math.max(0, v)) : 1;
}

// 即時套用到所有已建立的卡片播放器並同步各卡片的 UI（不寫入 localStorage）
function applyMusicVolume(v) {
  const vol = Math.min(1, Math.max(0, Number(v) || 0));
  if (vol > 0) _lastNonZeroVolume = vol;
  if (S.settings) S.settings.musicVolume = vol;
  document.querySelectorAll('.music-card').forEach(c => {
    c._musicAudio?.applyVolume();
    c._musicSyncVol?.();
  });
}

function toggleMusicMute() {
  applyMusicVolume(getMusicVolume() === 0 ? (_lastNonZeroVolume || 1) : 0);
}

// 拖曳過程中不寫檔，放開（change）時才存一次
function persistMusicVolume() {
  try { saveSettings(); } catch (e) { console.warn('saveSettings:', e); }
}

// 播放狀態的視覺呈現一律走這裡。按鈕圖示與卡片的 is-playing 必須同進同出，
// 先前分散在六處各寫一次，只要漏掉一邊，圖示就會跟實際播放狀態脫節。
// 兩個參數都容許 null，呼叫端不必各自做存在性檢查。
function setMusicPlayState(btn, card, playing) {
  if (btn)  btn.innerHTML = playing ? MUSIC_PAUSE_ICON_SVG : MUSIC_PLAY_ICON_SVG;
  if (card) card.classList.toggle('is-playing', playing);
}

function stopEmbeddedIframes(selector, exceptIframe = null) {
  document.querySelectorAll(selector).forEach(iframe => {
    if (iframe === exceptIframe) return;
    const sourceUrl = iframe.dataset.sourceUrl || '';
    const size = iframe.dataset.embedSize || 'large';
    const kind = iframe.dataset.singlePlaybackKind || 'story';
    const embedSrc = iframe.dataset.origSrc || iframe.src || '';
    if (!sourceUrl) {
      if (iframe.src && iframe.src !== 'about:blank') iframe.src = 'about:blank';
      return;
    }
    if (isSunoEmbedSrc(embedSrc)) {
      const placeholder = createStoppedEmbedPlaceholder(sourceUrl, kind, size);
      if (iframe.parentNode) iframe.parentNode.replaceChild(placeholder, iframe);
      return;
    }
    const html = buildEmbedHtml(sourceUrl, size);
    if (!html) {
      iframe.src = 'about:blank';
      return;
    }
    const host = document.createElement('div');
    host.innerHTML = html;
    const nextIframe = host.querySelector('iframe');
    if (!nextIframe || !iframe.parentNode) return;
    armSinglePlaybackIframe(nextIframe, kind, sourceUrl, size);
    iframe.parentNode.replaceChild(nextIframe, iframe);
  });
}

function isSunoEmbedSrc(src) {
  try {
    const url = new URL(src);
    return url.hostname.toLowerCase().replace(/^www\./, '') === 'suno.com'
      && url.pathname.startsWith('/embed/');
  } catch (_) {
    return false;
  }
}

function createStoppedEmbedPlaceholder(sourceUrl, kind, size = 'large') {
  const holder = document.createElement('button');
  holder.type = 'button';
  holder.style.width = '100%';
  holder.style.height = `${size === 'small' ? 80 : 120}px`;
  holder.style.border = 'none';
  holder.style.borderRadius = 'inherit';
  holder.style.background = 'rgb(var(--c-primary-rgb) / 0.10)';
  holder.style.color = 'var(--c-text)';
  holder.style.cursor = 'pointer';
  holder.style.font = 'inherit';
  holder.style.fontSize = '12px';
  holder.style.letterSpacing = '0.4px';
  holder.textContent = document.documentElement.lang === 'zh-TW' ? '重新載入播放器' : 'Reload player';
  holder.addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
    const html = buildEmbedHtml(sourceUrl, size);
    if (!html) return;
    const host = document.createElement('div');
    host.innerHTML = html;
    const iframe = host.querySelector('iframe');
    if (!iframe || !holder.parentNode) return;
    armSinglePlaybackIframe(iframe, kind, sourceUrl, size);
    holder.parentNode.replaceChild(iframe, holder);
  });
  return holder;
}

// 被 stopCardEmbed／stopEmbeddedIframes 清成 about:blank 之後，把 iframe 還原回
// 原始 src。armSinglePlaybackIframe 與 openCard 原本各寫一次，而且條件不一致
// （一個比對 about:blank、一個比對 origSrc）；統一成「目前不是原始 src 就還原」，
// 兩處的實際情境都涵蓋得到。src 屬性只有我們自己會改，iframe 內部導覽不影響它。
function restoreIframeSrc(iframe) {
  if (!iframe) return;
  const orig = iframe.dataset.origSrc;
  if (orig && iframe.src !== orig) iframe.src = orig;
}

function armSinglePlaybackIframe(iframe, kind, sourceUrl = '', size = 'large') {
  if (!iframe) return;
  if (!iframe.dataset.origSrc) iframe.dataset.origSrc = iframe.src;
  iframe.dataset.singlePlaybackKind = kind;
  iframe.dataset.sourceUrl = sourceUrl || iframe.dataset.sourceUrl || '';
  iframe.dataset.embedSize = size;
  const handler = () => {
    restoreIframeSrc(iframe);
    if (kind === 'story') enforceSingleSongPlayback({ exceptStoryIframe: iframe });
    else enforceSingleSongPlayback({ exceptOfficialIframe: iframe });
  };
  iframe.addEventListener('pointerdown', handler);
  iframe.addEventListener('focus', handler);
}

function stopStorySongPlayback(exceptAudio = null, exceptIframe = null) {
  document.querySelectorAll('.song-embed-wrap audio').forEach(audio => {
    if (audio === exceptAudio) return;
    try { audio.pause(); } catch (_) {}
  });
  stopEmbeddedIframes('.song-embed-wrap iframe', exceptIframe);
}

function stopOfficialMusicPlayback(exceptAudio = null, exceptIframe = null) {
  if (musicNowPlaying.audio && musicNowPlaying.audio !== exceptAudio) {
    try { musicNowPlaying.audio.pause(); } catch (_) {}
    setMusicPlayState(musicNowPlaying.btn, musicNowPlaying.card, false);
    musicNowPlaying.clear();
  }
  stopEmbeddedIframes('.music-embed-wrap iframe', exceptIframe);
}

function enforceSingleSongPlayback(opts = {}) {
  stopStorySongPlayback(opts.exceptStoryAudio || null, opts.exceptStoryIframe || null);
  stopOfficialMusicPlayback(opts.exceptOfficialAudio || null, opts.exceptOfficialIframe || null);
}

function renderMusicPage() {
  const grid = $('music-grid');

  // 清空 grid 只會丟掉 DOM，正在播的 Audio 物件不會跟著消失——它會脫離畫面
  // 繼續播到整首結束，而使用者眼前已經沒有任何播放器可以停它（實測切到 Photo
  // 頁、切回 Story Mode 都停不下來）。所以重建前一律 dispose。
  // iframe 不必特別處理：從文件移除時瀏覽器會直接銷毀其瀏覽環境。
  //
  // 但這頁的重繪多半是「上傳封面／MP3 之後」觸發的，直接停掉等於打斷使用者
  // 正在聽的歌，所以先記下位置，重建完再接回去。
  const resume = musicNowPlaying.audio ? {
    songId: musicNowPlaying.card?.dataset.songId || null,
    time  : musicNowPlaying.audio.currentTime,
    loop  : !!musicNowPlaying.card?._musicAudio?.loop
  } : null;

  grid.querySelectorAll('.music-card').forEach(c => c._musicAudio?.dispose());
  if (musicNowPlaying.audio) {          // 保險：不屬於任何現存卡片的殘留
    try { musicNowPlaying.audio.pause(); } catch (_) {}
    setMusicPlayState(musicNowPlaying.btn, musicNowPlaying.card, false);
    musicNowPlaying.clear();
  }

  grid.innerHTML = '';
  const frag = document.createDocumentFragment();
  _openMusicCard = null;

  const makeCoverPlaceholder = () => {
    const ph = document.createElement('div');
    ph.className = 'music-cover-placeholder';
    ph.innerHTML = `<svg viewBox="0 0 24 24" width="48" height="48" fill="currentColor"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>`;
    return ph;
  };

  if (!S.songs.length) {
    const em = document.createElement('div');
    em.className = 'music-empty-state';
    em.textContent = t('song.empty');
    grid.appendChild(em);
    return;
  }

  S.songs.forEach((song, idx) => {
    const card = document.createElement('div');
    card.className = 'music-card';

    /* ── 預設佔位（提前宣告，封面取色時需要引用） ── */
    const defaultSpace = document.createElement('div');
    defaultSpace.className = 'music-default-space';

    /* ── 封面 ── */
    const coverDiv = document.createElement('div');
    coverDiv.className = 'music-cover';

    const coverSrc = normalizeCoverSrc(song.cover || '');
    if (coverSrc) {
      const img = document.createElement('img');
      // 遠端圖片需 CORS 才能讀 pixel 取色；blob:/data: 不受影響
      if (/^https?:/i.test(coverSrc)) img.crossOrigin = 'anonymous';
      img.src = coverSrc;
      img.loading = 'lazy';
      img.onload  = () => extractCoverColor(img, card);
      img.onerror = () => { img.remove(); coverDiv.appendChild(makeCoverPlaceholder()); };
      coverDiv.appendChild(img);
    } else {
      coverDiv.appendChild(makeCoverPlaceholder());
    }

    const coverUpload = document.createElement('div');
    coverUpload.className = 'music-cover-upload';
    coverUpload.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M5 20h14v-2H5v2zm7-16-5 5h3v7h4V9h3l-5-5z"/></svg><span style="font-size:11px;letter-spacing:1px">${esc(t('song.changeCover'))}</span>`;
    coverUpload.addEventListener('click', e => { e.stopPropagation(); _pendingCoverSongId = song.id; $('music-cover-input').click(); });
    coverDiv.appendChild(coverUpload);

    const coverTitle = document.createElement('div');
    coverTitle.className = 'music-cover-title';
    coverTitle.textContent = song.title || t('song.unnamedSingle');
    coverDiv.appendChild(coverTitle);

    /* ── 黑膠唱片 ── */
    const vinylWrapper = document.createElement('div');
    vinylWrapper.className = 'music-vinyl-wrapper';
    vinylWrapper.title = t('song.vinylTip');
    const vinylDisc = document.createElement('div');
    vinylDisc.className = 'music-vinyl-disc';
    vinylWrapper.appendChild(vinylDisc);

    /* ── 展開面板 ── */
    const expandWrap = document.createElement('div');
    expandWrap.className = 'music-expand-wrap';

    /* 播放器欄 */
    const playerPanel = document.createElement('div');
    playerPanel.className = 'music-player-panel';

    const hasEmbed = !song.mp3Url && !!song.url;
    // 宣告於 if/else 之外：closeCard 與重繪後的還原都會用到，嵌入式卡片維持 null
    let cardAudio = null;

    if (hasEmbed) {
      const embedHtml = buildEmbedHtml(song.url, 'large');
      if (embedHtml) {
        const ew = document.createElement('div');
        ew.className = 'music-embed-wrap';
        ew.innerHTML = embedHtml;
        // 記住原始 src，以便關閉後重新開啟時還原
        const iframe = ew.querySelector('iframe');
        if (iframe) {
          iframe.dataset.origSrc = iframe.src;
          armSinglePlaybackIframe(iframe, 'official', song.url, 'large');
          const stopOthers = () => enforceSingleSongPlayback({ exceptOfficialIframe: iframe });
          ew.addEventListener('pointerdown', stopOthers, true);
          ew.addEventListener('click', stopOthers, true);
        }
        playerPanel.appendChild(ew);
      }
    } else {
      /* MP3 播放器 */
      const playBtn = document.createElement('button');
      playBtn.className = 'play-btn';
      playBtn.innerHTML = MUSIC_PLAY_ICON_SVG;

      const mp3Bar = document.createElement('div');
      mp3Bar.className = 'music-mp3-bar';
      // 卡片高度固定 160px，內容原本就只剩幾 px 餘裕，所以時間、進度、循環、
      // 音量全部擠在同一列；音量滑桿平時收合成 0 寬，按下喇叭鍵才展開。
      const ctrlRow = document.createElement('div');
      ctrlRow.className = 'music-mp3-time';

      // 起訖時間合併成一個 0:04 / 0:30 標籤，省下一組間距與一個節點
      const clock = document.createElement('span');
      clock.className = 'music-mp3-clock';
      const curEl = document.createElement('span'); curEl.textContent = '0:00';
      const durEl = document.createElement('span'); durEl.textContent = '0:00';
      clock.appendChild(curEl);
      clock.appendChild(document.createTextNode(' / '));
      clock.appendChild(durEl);

      const seek = document.createElement('input');
      seek.type = 'range'; seek.className = 'music-mp3-seek';
      seek.value = '0'; seek.min = '0'; seek.max = '100';

      const loopBtn = document.createElement('button');
      loopBtn.type = 'button';
      loopBtn.className = 'music-mp3-iconbtn';
      loopBtn.innerHTML = ICON_LOOP;
      // cardAudio 在這段之後才建立，所以一律 null-safe 存取：
      // 初次同步時控制器還不存在，而此時循環必定是關閉狀態。
      const syncLoopUI = () => {
        const on = !!cardAudio?.loop;
        loopBtn.classList.toggle('is-on', on);
        loopBtn.setAttribute('aria-pressed', String(on));
        setBtnLabel(loopBtn, on ? t('song.loopOn') : t('song.loop'));
      };
      card._musicSyncLoop = syncLoopUI;
      syncLoopUI();
      loopBtn.addEventListener('click', e => {
        e.stopPropagation();
        if (!cardAudio) return;
        cardAudio.setLoop(!cardAudio.loop);
        syncLoopUI();
      });

      // 滑桿改成往上彈出的浮層：絕對定位，完全不佔該列的寬度，
      // 所以進度條與時間標籤都不會因為展開而位移。
      const volWrap = document.createElement('div');
      volWrap.className = 'music-mp3-volwrap';

      const volBtn = document.createElement('button');
      volBtn.type = 'button';
      volBtn.className = 'music-mp3-iconbtn';

      const volSlider = document.createElement('input');
      volSlider.type = 'range';
      volSlider.className = 'music-mp3-volume';
      volSlider.min = '0'; volSlider.max = '100'; volSlider.step = '1';
      volSlider.setAttribute('aria-label', t('song.volume'));
      volSlider.title = t('song.volume');

      // 音量是全站共用的，任何一張卡片調整都要讓其他卡片的 UI 跟著走
      const syncVolUI = () => {
        const v = getMusicVolume();
        volSlider.value = String(Math.round(v * 100));
        volBtn.innerHTML = v === 0 ? ICON_VOL_MUTE : ICON_VOL_ON;
        volBtn.classList.toggle('is-muted', v === 0);
        setBtnLabel(volBtn, v === 0 ? t('song.unmute') : t('song.mute'));
      };
      card._musicSyncVol = syncVolUI;

      volSlider.addEventListener('input', e => { e.stopPropagation(); applyMusicVolume(Number(volSlider.value) / 100); });
      volSlider.addEventListener('change', persistMusicVolume);
      volSlider.addEventListener('click', e => e.stopPropagation());

      const volPop = document.createElement('div');
      volPop.className = 'music-mp3-volpop';
      volPop.appendChild(volSlider);

      // 展開期間才掛 outside-click 監聽，收合時立刻移除，不會隨卡片重繪累積
      let _volOutside = null;
      const setVolOpen = (open) => {
        volWrap.classList.toggle('is-open', open);
        volBtn.setAttribute('aria-expanded', String(open));
        if (open) {
          volSlider.focus();
          _volOutside = ev => { if (!volWrap.contains(ev.target)) setVolOpen(false); };
          document.addEventListener('pointerdown', _volOutside, true);
        } else if (_volOutside) {
          document.removeEventListener('pointerdown', _volOutside, true);
          _volOutside = null;
        }
      };
      // 按喇叭鍵是展開／收合滑桿。靜音改成把滑桿拉到 0（圖示仍會變成靜音樣式），
      // 不再一鍵靜音——因為同一顆鍵不該既是開關又是切換。
      volBtn.addEventListener('click', e => {
        e.stopPropagation();
        setVolOpen(!volWrap.classList.contains('is-open'));
      });
      volBtn.setAttribute('aria-expanded', 'false');
      syncVolUI();

      volWrap.appendChild(volBtn);
      volWrap.appendChild(volPop);

      ctrlRow.appendChild(clock);
      ctrlRow.appendChild(seek);
      ctrlRow.appendChild(loopBtn);
      ctrlRow.appendChild(volWrap);
      mp3Bar.appendChild(ctrlRow);

      const mp3UpBtn = document.createElement('button');
      mp3UpBtn.className = 'music-upload-mp3';
      mp3UpBtn.innerHTML = song.mp3Url
        ? `<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg> ${esc(t('song.uploadedMp3'))}`
        : `<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M5 20h14v-2H5v2zm7-16-5 5h3v7h4V9h3l-5-5z"/></svg> ${esc(t('song.uploadMp3'))}`;
      mp3UpBtn.addEventListener('click', e => { e.stopPropagation(); _pendingMp3SongId = song.id; $('music-mp3-input').click(); });

      const fmtTime = s => {
        const m = Math.floor(s / 60), sec = Math.floor(s % 60);
        return `${m}:${sec.toString().padStart(2, '0')}`;
      };

      // ── 這張卡片的 Audio 生命週期 ──────────────────────────
      // 對外只有 ensure / play / pause / dispose 四個入口，卡片其餘程式
      // （openCard、closeCard、播放鈕、重繪後的還原）不再直接碰 Audio 物件。
      cardAudio = {
        el: null,
        loop: false,          // 循環意向。el 還沒建立時也要記住，建立時再套上去

        // 建立 Audio 實例。song.mp3Url 沒有時才回 IDB 撈，撈不到回 false。
        async ensure() {
          if (this.el) return true;
          let url = song.mp3Url;
          if (!url) {
            try {
              const rec = await idbGet('song_mp3s', song.id);
              if (!rec?.blob) return false;
              revokeMp3Url(song.id);
              url = URL.createObjectURL(rec.blob);
              _mp3UrlCache.set(song.id, url);
              song.mp3Url = url;
              song.mp3FileName = rec.fileName || '';
              mp3Bar.style.display = '';
            } catch (_) { return false; }
          }
          // 回呼一律綁定 player 這個區域變數而非 this.el：dispose() 之後
          // 仍可能有排隊中的事件送達，讀 this.el 會拿到 null 而拋 TypeError。
          const player = new Audio(url);
          player.volume = getMusicVolume();
          player.loop = this.loop;
          this.el = player;
          player.addEventListener('timeupdate', () => {
            if (!player.duration) return;
            seek.value = (player.currentTime / player.duration) * 100;
            curEl.textContent = fmtTime(player.currentTime);
          });
          player.addEventListener('loadedmetadata', () => { durEl.textContent = fmtTime(player.duration); });
          player.addEventListener('ended', () => {
            setMusicPlayState(playBtn, card, false);
            seek.value = 0; curEl.textContent = '0:00';
            if (musicNowPlaying.audio === player) musicNowPlaying.clear();
          });
          return true;
        },

        // atSeconds 供重繪後接續播放使用；metadata 還沒到就等 loadedmetadata
        async play(atSeconds) {
          if (!await this.ensure()) return false;
          const el = this.el;
          enforceSingleSongPlayback({ exceptOfficialAudio: el });
          if (typeof atSeconds === 'number' && isFinite(atSeconds) && atSeconds > 0) {
            const applySeek = () => { try { el.currentTime = atSeconds; } catch (_) {} };
            if (el.readyState >= 1) applySeek();
            else el.addEventListener('loadedmetadata', applySeek, { once: true });
          }
          el.play().catch(() => {});
          setMusicPlayState(playBtn, card, true);
          musicNowPlaying.set(el, playBtn);
          return true;
        },

        pause() {
          if (!this.el) return;
          try { this.el.pause(); } catch (_) {}
          setMusicPlayState(playBtn, card, false);
          if (musicNowPlaying.audio === this.el) musicNowPlaying.clear();
        },

        // 釋放已解碼的緩衝，避免反覆切換卡片時記憶體累積
        dispose() {
          const player = this.el;
          if (!player) return;
          this.el = null;
          try { player.pause(); player.removeAttribute('src'); player.load(); } catch (_) {}
          setMusicPlayState(playBtn, card, false);
          if (musicNowPlaying.audio === player) musicNowPlaying.clear();
        },

        seekToPercent(pct) {
          if (!this.el || !this.el.duration) return;
          this.el.currentTime = (pct / 100) * this.el.duration;
        },

        applyVolume() { if (this.el) this.el.volume = getMusicVolume(); },

        setLoop(on) {
          this.loop = !!on;
          if (this.el) this.el.loop = this.loop;
        },

        get playing() { return !!this.el && !this.el.paused; },
        get currentTime() { return this.el ? this.el.currentTime : 0; }
      };

      playBtn.addEventListener('click', async e => {
        e.stopPropagation();
        if (cardAudio.playing) cardAudio.pause();
        else await cardAudio.play();
      });

      seek.addEventListener('input', () => cardAudio.seekToPercent(seek.value));

      playerPanel.appendChild(playBtn);
      if (!song.mp3Url) mp3Bar.style.display = 'none';
      playerPanel.appendChild(mp3Bar);
      playerPanel.appendChild(mp3UpBtn);
    }

    expandWrap.appendChild(playerPanel);

    /* 歌詞欄 */
    let lyricsPanel = null;
    if (song.lyrics) {
      lyricsPanel = document.createElement('div');
      lyricsPanel.className = 'music-lyrics-panel';
      const lbl = document.createElement('div');
      lbl.className = 'music-lyrics-label';
      lbl.textContent = 'Lyrics';
      const lyrTxt = document.createElement('div');
      lyrTxt.className = 'music-lyrics-text';
      lyrTxt.textContent = song.lyrics;
      lyricsPanel.appendChild(lbl);
      lyricsPanel.appendChild(lyrTxt);
      expandWrap.appendChild(lyricsPanel);
    }

    const calcExpandWidth = () => { let w = 320; if (lyricsPanel) w += 420; return w; };

    // 停止指定卡片內的嵌入式 iframe（清空 src 以中斷播放）
    const stopCardEmbed = (targetCard) => {
      const iframe = targetCard.querySelector('.music-embed-wrap iframe');
      if (iframe) iframe.src = 'about:blank';
    };

    const openCard = () => {
      if (_openMusicCard && _openMusicCard !== card) {
        // 收起前一張卡片：嵌入式停播、MP3 交給它自己的控制器暫停
        stopCardEmbed(_openMusicCard);
        _openMusicCard._musicAudio?.pause();
        const prevWrap = _openMusicCard.querySelector('.music-expand-wrap');
        if (prevWrap) prevWrap.style.width = '0';
        _openMusicCard.classList.remove('is-open');
      }
      expandWrap.style.width = calcExpandWidth() + 'px';
      card.classList.add('is-open');
      _openMusicCard = card;
      if (hasEmbed) {
        const iframe = card.querySelector('.music-embed-wrap iframe');
        enforceSingleSongPlayback({ exceptOfficialIframe: iframe });
        restoreIframeSrc(iframe);   // 上次關閉時被清成 about:blank
      }
    };
    const closeCard = () => {
      expandWrap.style.width = '0';
      card.classList.remove('is-open');
      if (_openMusicCard === card) _openMusicCard = null;
      stopCardEmbed(card);
      // dispose 已包含 pause、圖示還原、清空 musicNowPlaying、釋放緩衝
      if (cardAudio) cardAudio.dispose();
      card.classList.remove('is-playing');
    };

    vinylWrapper.addEventListener('click', () => {
      card.classList.contains('is-open') ? closeCard() : openCard();
    });

    // 供重繪後還原播放位置用（見 renderMusicPage 開頭與結尾）
    card.dataset.songId = song.id;
    card._musicAudio = cardAudio;
    card._musicOpen  = openCard;

    card.appendChild(vinylWrapper);
    card.appendChild(coverDiv);
    card.appendChild(defaultSpace);
    card.appendChild(expandWrap);
    frag.appendChild(card);
  });
  grid.appendChild(frag);

  // 接回重繪前正在播的那首（展開卡片並從原本的秒數續播）
  if (resume?.songId) {
    const target = grid.querySelector(`.music-card[data-song-id="${CSS.escape(resume.songId)}"]`);
    if (target?._musicAudio) {
      target._musicOpen();
      target._musicAudio.setLoop(resume.loop);
      target._musicSyncLoop?.();
      target._musicAudio.play(resume.time);
    }
  }
}

$('music-cover-input').addEventListener('change', async e => {
  const rawFile = e.target.files[0];
  if (!rawFile || _pendingCoverSongId === null) return;
  if (!String(rawFile.type || '').startsWith('image/')) {
    e.target.value = '';
    _pendingCoverSongId = null;
    return;
  }
  const song = S.songs.find(s => s.id === _pendingCoverSongId);
  if (!song) { e.target.value = ''; _pendingCoverSongId = null; return; }
  e.target.value = '';
  _pendingCoverSongId = null;
  const file = await compressImage(rawFile, COVER_MAX_EDGE);
  // 釋放舊的 objectURL
  revokeCoverUrl(song.id);
  // 建立新的 objectURL
  const objectUrl = URL.createObjectURL(file);
  _coverUrlCache.set(song.id, objectUrl);
  song.cover = objectUrl;
  // 非同步存入 IDB
  idbPutCover({ songId: song.id, blob: file, fileName: file.name || '' })
    .catch(err => { console.warn('IDB cover write:', err); notifyStorageError(err, 'media'); });
  save();
  renderMusicPage();
  // 更新歌單編輯表單內的封面狀態文字（若正在編輯中），不再重新渲染整個列表以保留輸入內容
  const statusEl = document.getElementById(`cover-status-${song.id}`);
  if (statusEl) statusEl.textContent = t('song.uploadedCover');
});

$('music-mp3-input').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file || _pendingMp3SongId === null) return;
  const song = S.songs.find(s => s.id === _pendingMp3SongId);
  if (!song) { e.target.value = ''; _pendingMp3SongId = null; return; }
  revokeMp3Url(song.id);
  if (song.mp3Url && String(song.mp3Url).startsWith('blob:')) URL.revokeObjectURL(song.mp3Url);
  const objectUrl = URL.createObjectURL(file);
  _mp3UrlCache.set(song.id, objectUrl);
  song.mp3Url = objectUrl;
  song.mp3FileName = file.name || '';
  idbPutMp3({ songId: song.id, blob: file, fileName: song.mp3FileName }).catch(err => { console.warn('IDB mp3 write:', err); notifyStorageError(err, 'media'); });
  save();
  renderMusicPage();
  
  // 更新歌單編輯表單內的狀態與鎖定邏輯，不再重新渲染整個列表以保留輸入內容
  const statusEl = document.getElementById(`mp3-status-${song.id}`);
  if (statusEl) statusEl.textContent = tf('song.uploadedAs', song.mp3FileName || t('song.mp3File'));
  
  const linkIn = document.getElementById(`url-input-${song.id}`);
  if (linkIn) {
    linkIn.disabled = true;
    linkIn.style.opacity = '0.5';
  }
  const clearUrlBtn = document.getElementById(`clear-url-${song.id}`);
  if (clearUrlBtn) clearUrlBtn.style.display = 'none';

  const mp3Btn = document.getElementById(`mp3-btn-${song.id}`);
  if (mp3Btn) mp3Btn.style.display = 'none';
  
  const mp3Clear = document.getElementById(`mp3-clear-${song.id}`);
  if (mp3Clear) mp3Clear.style.display = 'inline-flex';

  e.target.value = '';
  _pendingMp3SongId = null;
});

// 開啟「新增歌曲」編輯卡；若已有編輯中的卡片則捲動聚焦（右欄與官網 MUSIC 頁共用）
function startNewSong() {
  const existingNewIdx = S.songs.findIndex(s => s._isNew || s._isEditing);
  if (existingNewIdx !== -1) {
    const existingCard = document.querySelector(`.song-card[data-idx="${existingNewIdx}"]`);
    if (existingCard) {
      existingCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
      const firstInput = existingCard.querySelector('input.song-input, textarea.song-input');
      if (firstInput) firstInput.focus();
    }
    return;
  }
  S.songs.unshift({ id: uid(), title: '', url: '', lyrics: '', _isNew: true });
  renderSongsList();
  const newCard = document.querySelector('.song-card[data-idx="0"]');
  if (newCard) {
    const firstInput = newCard.querySelector('input.song-input, textarea.song-input');
    if (firstInput) firstInput.focus();
  }
}

$('music-add-btn').addEventListener('click', () => {
  // 切換到 Story Mode 歌單並打開新增表單
  switchMode('story');
  switchRightTab('songs');
  startNewSong();
});

/* ══════════════════════════════════════════════════════════
   TOUR PAGE
══════════════════════════════════════════════════════════ */
function renderTourPage() {
  const list = $('tour-list');
  list.innerHTML = '';

  // 合併 tourEvents（獨立新增）與 folder notes（cat=work）
  const workNotes = [];
  S.folders.forEach(f => {
    f.notes.forEach(n => {
      if (n.cat === 'work') {
        workNotes.push({
          id       : 'note_' + n.id,
          date     : n.date || '',
          time     : n.time     || '',
          title    : n.title    || t('tour.unnamedWork'),
          location : n.location || '',
          body     : n.body     || '',
          folderId : f.id,
          folderName: f.name,
          _fromNote: true,
        });
      }
    });
  });

  // 排序：有日期的先依日期升冪 + 時間升冪；無日期（TBD）排到最後
  const parseTimeKey = t => {
    if (!t) return 99999;
    const m = String(t).match(/(\d{1,2})\s*[:：]\s*(\d{1,2})/);
    if (m) return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
    return 99998; // 「全天」之類字串排在有時間之後、TBD 之前
  };
  const all = [...SS.tourEvents, ...workNotes].sort((a, b) => {
    const aEmpty = !a.date, bEmpty = !b.date;
    if (aEmpty && !bEmpty) return 1;
    if (!aEmpty && bEmpty) return -1;
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return parseTimeKey(a.time) - parseTimeKey(b.time);
  });

  if (all.length === 0) {
    list.innerHTML = `<div class="tour-empty">${esc(t('tour.empty'))}<br><small>${esc(t('tour.emptyHint'))}</small></div>`;
    return;
  }

  // 今天（YYYY-MM-DD）— 用本地時區計算，避免時區位移
  const todayStr = toDateStr(new Date());

  all.forEach(evt => {
    const row = document.createElement('div');
    row.className = 'tour-row';

    // 日期
    const dateCell = document.createElement('div');
    dateCell.className = 'tour-date-cell';
    if (evt.date) {
      dateCell.innerHTML = `<div class="tour-date-main">${esc(evt.date)}</div>`;
    } else {
      dateCell.innerHTML = `<div class="tour-date-main">TBD</div>`;
    }

    // 工作內容（body 預覽：去換行、超過 50 字加 …）
    const titleCell = document.createElement('div');
    titleCell.className = 'tour-title-cell';
    let preview = '';
    if (evt.body) {
      const flat = evt.body.replace(/\s+/g, ' ').trim();
      preview = flat.length > 50 ? flat.slice(0, 50) + '…' : flat;
    }
    titleCell.innerHTML = `<div class="tour-title-main">${esc(evt.title)}</div>${preview ? `<div class="tour-body-preview">${esc(preview)}</div>` : ''}`;

    // 地點（唯讀顯示）
    const locCell = document.createElement('div');
    locCell.className = 'tour-location';
    locCell.textContent = evt.location || '—';

    // 時間（唯讀顯示）
    const timeCell = document.createElement('div');
    timeCell.className = 'tour-time-cell';
    timeCell.textContent = evt.time || '—';

    // 狀態 + 連結
    const linkCell = document.createElement('div');
    linkCell.className = 'tour-link-cell';

    // 狀態以「日期 vs 今天」判斷；無日期視為待定
    let status; // 'done' | 'upcoming' | 'tbd'
    if (!evt.date) status = 'tbd';
    else if (evt.date < todayStr) status = 'done';
    else status = 'upcoming';

    const folder = evt.folderId ? S.folders.find(f => f.id === evt.folderId) : null;
    const hasValidFolder = !!folder; // 防孤立 folderId

    const badge = document.createElement('span');
    badge.className = `tour-badge ${status}`;
    badge.textContent = status === 'done' ? t('tour.done') : status === 'tbd' ? t('tour.tbd') : t('tour.upcoming');
    linkCell.appendChild(badge);

    // 章節連結插槽（永遠保留位置以避免 ✎ 漂移）
    const chapterSlot = document.createElement('span');
    chapterSlot.className = 'tour-chapter-slot';
    if (hasValidFolder) {
      const chapterBtn = document.createElement('button');
      chapterBtn.className = 'tour-chapter-link';
      chapterBtn.textContent = `→ ${folder.name}`;
      chapterBtn.addEventListener('click', () => {
        switchMode('story');
        switchView(folder.id, folder.name);
      });
      chapterSlot.appendChild(chapterBtn);
    }
    linkCell.appendChild(chapterSlot);

    // ✎ 獨立為第 6 欄，固定在最右
    const editBtn = document.createElement('button');
    editBtn.className = 'tour-row-edit-btn';
    editBtn.textContent = '✎';
    setBtnLabel(editBtn, t('poster.edit'));
    editBtn.addEventListener('click', () => openTourModal(evt.id));

    row.appendChild(dateCell);
    row.appendChild(titleCell);
    row.appendChild(locCell);
    row.appendChild(timeCell);
    row.appendChild(linkCell);
    row.appendChild(editBtn);
    list.appendChild(row);
  });
}

/* ── Tour Modal ── */
$('tour-add-btn').addEventListener('click', () => openTourModal(null));
$('tm-cancel').addEventListener('click', () => $('tour-modal-overlay').classList.remove('open'));
$('tour-modal-overlay').addEventListener('click', e => { if (e.target === $('tour-modal-overlay')) $('tour-modal-overlay').classList.remove('open'); });

function openTourModal(tourId) {
  SS.editingTourId = tourId;
  const isEdit = tourId !== null;

  // 判斷來源：note_ 前綴 → 從 folder notes 取資料
  let evt = null;
  let isFromNote = false;
  if (isEdit && String(tourId).startsWith('note_')) {
    isFromNote = true;
    const noteId = tourId.replace(/^note_/, '');
    for (const f of S.folders) {
      const n = f.notes.find(n => n.id === noteId);
      if (n) { evt = { ...n, folderId: f.id }; break; }
    }
  } else if (isEdit) {
    evt = SS.tourEvents.find(t => t.id === tourId) || null;
  }

  $('tour-modal-title').textContent = isEdit ? t('tm.titleEdit') : t('tm.titleAdd');
  $('tm-date').value     = evt?.date     || '';
  $('tm-time').value     = evt?.time     || '';
  $('tm-title').value    = evt?.title    || '';
  $('tm-location').value = evt?.location || '';
  $('tm-body').value     = evt?.body     || '';
  // 編輯模式才顯示刪除；_fromNote 的按鈕文字改為「前往章節」
  if (isEdit) {
    const delBtn = $('tm-del');
    delBtn.style.display = 'block';
    delBtn.textContent = isFromNote ? t('tour.toChapter') : t('modal.delete');
    delBtn.title = isFromNote ? t('tour.delNeedChapter') : '';
    delBtn.dataset.fromNote = isFromNote ? '1' : '';
  } else {
    $('tm-del').style.display = 'none';
  }

  // 填充資料夾選項：階層樹狀顯示（主資料夾 → 縮排子資料夾）
  const sel = $('tm-folder');
  fillFolderSelect(sel, t('tm.notLinked'));

  // 若 folderId 指到已刪除的 folder，補一個 placeholder option
  if (evt?.folderId && !S.folders.some(f => f.id === evt.folderId)) {
    const opt = document.createElement('option');
    opt.value = evt.folderId;
    opt.textContent = t('tm.deleted');
    sel.appendChild(opt);
  }
  sel.value = evt?.folderId || '';

  $('tour-modal-overlay').classList.add('open');
  setTimeout(() => $('tm-title').focus(), 50);
}

$('tm-save').addEventListener('click', () => {
  const data = {
    date     : $('tm-date').value,
    time     : $('tm-time').value.trim(),
    title    : $('tm-title').value.trim(),
    location : $('tm-location').value.trim(),
    body     : $('tm-body').value.trim(),
    folderId : $('tm-folder').value,
  };
  if (!data.title) {
    // 給使用者明確回饋：標題必填
    const inp = $('tm-title');
    inp.focus();
    inp.classList.add('tm-input-error');
    setTimeout(() => inp.classList.remove('tm-input-error'), 1200);
    return;
  }

  const now = Date.now();
  if (SS.editingTourId !== null && String(SS.editingTourId).startsWith('note_')) {
    // 寫回 folder note（保留 cat 等欄位，只更新工作行程相關欄位）
    const noteId = SS.editingTourId.replace(/^note_/, '');
    let saved = false;
    for (const f of S.folders) {
      const n = f.notes.find(n => n.id === noteId);
      if (n) {
        n.title    = data.title;
        n.date     = data.date;
        n.time     = data.time;
        n.location = data.location;
        n.body     = data.body;
        saved = true;
        break;
      }
    }
    if (!saved) return; // 找不到對應 note，中止
    save(); // S.folders → tak_fire_v2
  } else if (SS.editingTourId !== null) {
    const idx = SS.tourEvents.findIndex(t => t.id === SS.editingTourId);
    if (idx !== -1) SS.tourEvents[idx] = { ...SS.tourEvents[idx], ...data, updatedAt: now };
    saveSite();
  } else {
    SS.tourEvents.push({ id: uid(), ...data, createdAt: now, updatedAt: now });
    saveSite();
  }
  $('tour-modal-overlay').classList.remove('open');
  renderTourPage();
});

$('tm-del').addEventListener('click', () => {
  if (!SS.editingTourId) return;
  $('tour-modal-overlay').classList.remove('open');
  if ($('tm-del').dataset.fromNote === '1') {
    // 跳回對應章節，讓使用者在那邊操作
    const noteId = String(SS.editingTourId).replace(/^note_/, '');
    let targetFolder = null;
    for (const f of S.folders) {
      if (f.notes.find(n => n.id === noteId)) { targetFolder = f; break; }
    }
    if (targetFolder) {
      switchMode('story');
      switchView(targetFolder.id, targetFolder.name);
    }
  } else {
    SS.tourEvents = SS.tourEvents.filter(t => t.id !== SS.editingTourId);
    saveSite();
    renderTourPage();
  }
});

/* ══════════════════════════════════════════════════════════
   ABOUT PAGE
══════════════════════════════════════════════════════════ */
// 將元素變成可編輯欄位：blur 提交（trim 後傳給 onCommit）、單行時 Enter 結束、貼上強制純文字
function makeEditable(el, onCommit, { singleLine = true } = {}) {
  el.contentEditable = 'true';
  el.addEventListener('blur', () => onCommit(el.textContent.trim()));
  if (singleLine) el.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); el.blur(); } });
  el.addEventListener('paste', e => { e.preventDefault(); document.execCommand('insertText', false, e.clipboardData.getData('text/plain')); });
}

function renderAbout() {
  const grid = $('members-grid');
  grid.innerHTML = '';
  SS.members.forEach((m, idx) => {
    const card = document.createElement('div');
    card.className = 'member-card';
    card.style.animationDelay = `${idx * 0.1}s`;

    const photo = document.createElement('div');
    photo.className = 'member-photo';
    if (m.photo) {
      const img = document.createElement('img');
      img.src = m.photo;
      photo.appendChild(img);
    } else {
      photo.textContent = '♪';
    }
    photo.title = t('member.photoTip');
    photo.style.cursor = 'pointer';
    photo.addEventListener('click', () => {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = 'image/*';
      inp.onchange = async e => {
        const rawFile = e.target.files[0];
        if (!rawFile) return;
        const file = await compressImage(rawFile, MEMBER_PHOTO_MAX_EDGE);
        if (!SS.members[idx].id) SS.members[idx].id = uid();
        const key = `member_photo_${SS.members[idx].id}`;
        // 釋放舊的 objectURL
        if (m.photo && m.photo.startsWith('blob:')) URL.revokeObjectURL(m.photo);
        // 存入 IDB
        await idbPutAsset(key, file).catch(err => { console.warn('IDB member photo write:', err); notifyStorageError(err, 'media'); });
        // 建立新的 objectURL
        const objectUrl = URL.createObjectURL(file);
        SS.members[idx].photo = objectUrl;
        saveSite();
        renderAbout();
      };
      inp.click();
    });

    const info = document.createElement('div');
    info.className = 'member-info';

    const nameEl = document.createElement('div');
    nameEl.className = 'member-name';
    nameEl.textContent = m.name;
    nameEl.title = t('member.nameTip');
    makeEditable(nameEl, val => { SS.members[idx].name = val || m.name; saveSite(); });

    const roleEl = document.createElement('div');
    roleEl.className = 'member-role';
    roleEl.textContent = m.role;
    roleEl.title = t('member.roleTip');
    makeEditable(roleEl, val => { SS.members[idx].role = val || m.role; saveSite(); });

    const statsEl = document.createElement('div');
    statsEl.className = 'member-stats';
    ['height', 'mbti', 'zodiac'].forEach(key => {
      const row = document.createElement('div');
      row.className = 'member-stat';
      row.textContent = m[key] || '';
      makeEditable(row, val => { SS.members[idx][key] = val; saveSite(); });
      statsEl.appendChild(row);
    });

    const bioEl = document.createElement('div');
    bioEl.className = 'member-bio';
    bioEl.textContent = m.bio;
    bioEl.title = t('member.bioTip');
    makeEditable(bioEl, val => { SS.members[idx].bio = val || m.bio; saveSite(); }, { singleLine: false });

    info.appendChild(nameEl);
    info.appendChild(roleEl);
    info.appendChild(bioEl);
    info.appendChild(statsEl);

    card.appendChild(photo);
    card.appendChild(info);
    grid.appendChild(card);
  });
}

/* ── Mobile Drawers ── */
(function initMobileDrawers() {
  const isMobile = () => window.innerWidth <= 768;
  const closeDrawers = () => document.body.classList.remove('mobile-left-open', 'mobile-right-open');

  $('mobile-left-btn').addEventListener('click', () => {
    document.body.classList.remove('mobile-right-open');
    document.body.classList.toggle('mobile-left-open');
  });
  $('mobile-right-btn').addEventListener('click', () => {
    document.body.classList.remove('mobile-left-open');
    document.body.classList.toggle('mobile-right-open');
  });
  $('mobile-drawer-overlay').addEventListener('click', closeDrawers);

  // 選好資料夾後自動收起左抽屜，直接看故事內容
  $('folder-list').addEventListener('click', e => {
    if (isMobile() && e.target.closest('.folder-item')) closeDrawers();
  });
  // 切到官網模式時收起抽屜
  $('btn-site-mode').addEventListener('click', closeDrawers);

  // 手機上不套用桌面的欄位收合／全螢幕狀態，避免主畫面被藏住
  const resetDesktopColumnStates = () => {
    if (!isMobile()) return;
    $('col-mid')?.classList.remove('collapsed');
    $('col-right')?.classList.remove('collapsed');
    document.body.classList.remove('mid-fullscreen', 'right-fullscreen');
  };
  resetDesktopColumnStates();
  window.addEventListener('resize', () => {
    if (!isMobile()) closeDrawers();
    else resetDesktopColumnStates();
  });
})();

/* ── Boot ── */
loadSite();
// 從 IDB 補回成員照片（非同步），完成後若正在 about 頁則補刷
loadAllMemberPhotos().then(() => {
  if (document.body.classList.contains('site-mode') && SS.currentPage === 'about') renderAbout();
}).catch(() => {});
// 清除舊版 localStorage 海報快取（已移至 IndexedDB）
try { lsRemove('tak_fire_posters'); } catch(e) {}

