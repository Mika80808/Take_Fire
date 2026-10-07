'use strict';

/* ══════════════════════════════════════════════════════════
   Story Mode 新手導覽
══════════════════════════════════════════════════════════ */
// 第一次進入時依序框出幾個不容易自己發現的功能。看完或略過後記在 localStorage，
// 不再自動出現；系統設定裡可以重看。手機版左右欄是抽屜，步驟會自動開啟對應的那一側。
const GUIDE_DONE_KEY = 'tak_fire_guide_v1';
const GUIDE_PAD = 6;          // 高亮框比目標外擴的距離
const GUIDE_GAP = 14;         // 說明卡與高亮框的間距
const GUIDE_DRAWER_MS = 320;  // 等抽屜滑入定位後再量位置

const GUIDE_STEPS = [
  { target: '#folder-list',     drawer: 'left',  key: 'folders' },
  { target: '#sort-folder-btn', drawer: 'left',  key: 'sort' },
  { target: '#col-right',       drawer: 'right', key: 'events',
    before: () => { if (S.rightTab !== 'events') switchRightTab('events'); } },
  { target: '#btn-site-mode',   drawer: null,    key: 'work' }
];

let _guideIdx = -1;
let _guideEls = null;
let _guideSeq = 0;

const guideIsMobile = () => window.innerWidth <= 768;

function setGuideDrawer(side) {
  document.body.classList.toggle('mobile-left-open',  side === 'left');
  document.body.classList.toggle('mobile-right-open', side === 'right');
}

function buildGuideEls() {
  const blocker = document.createElement('div');
  blocker.className = 'guide-blocker';

  const spot = document.createElement('div');
  spot.className = 'guide-spot';

  const card = document.createElement('div');
  card.className = 'guide-card';
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-modal', 'true');
  card.setAttribute('aria-labelledby', 'guide-title');
  card.innerHTML = `
    <div class="guide-step" id="guide-step"></div>
    <div class="guide-title" id="guide-title"></div>
    <div class="guide-body" id="guide-body"></div>
    <div class="guide-actions">
      <button type="button" class="guide-skip" id="guide-skip"></button>
      <span class="guide-nav">
        <button type="button" class="modal-btn btn-cancel" id="guide-prev"></button>
        <button type="button" class="modal-btn btn-primary" id="guide-next"></button>
      </span>
    </div>`;

  document.body.append(blocker, spot, card);
  card.querySelector('#guide-skip').addEventListener('click', () => endGuide());
  card.querySelector('#guide-prev').addEventListener('click', () => showGuideStep(_guideIdx - 1));
  card.querySelector('#guide-next').addEventListener('click', () => {
    if (_guideIdx >= GUIDE_STEPS.length - 1) endGuide();
    else showGuideStep(_guideIdx + 1);
  });
  return { blocker, spot, card };
}

function startGuide() {
  if (_guideEls) return;
  if (document.body.classList.contains('site-mode')) switchMode('story');
  _guideEls = buildGuideEls();
  document.addEventListener('keydown', onGuideKey, true);
  window.addEventListener('resize', positionGuide);
  showGuideStep(0);
}

function endGuide() {
  if (!_guideEls) return;
  _guideSeq++;
  lsSet(GUIDE_DONE_KEY, '1');
  document.removeEventListener('keydown', onGuideKey, true);
  window.removeEventListener('resize', positionGuide);
  Object.values(_guideEls).forEach(el => el.remove());
  _guideEls = null;
  _guideIdx = -1;
  if (guideIsMobile()) setGuideDrawer(null);
}

function onGuideKey(e) {
  if (e.key === 'Escape') { e.preventDefault(); endGuide(); }
  else if (e.key === 'ArrowRight') { e.preventDefault(); $('guide-next').click(); }
  else if (e.key === 'ArrowLeft' && _guideIdx > 0) { e.preventDefault(); showGuideStep(_guideIdx - 1); }
}

function showGuideStep(idx) {
  if (!_guideEls || idx < 0 || idx >= GUIDE_STEPS.length) return;
  _guideIdx = idx;
  const step = GUIDE_STEPS[idx];
  const seq = ++_guideSeq;
  step.before?.();

  $('guide-step').textContent  = `${idx + 1} / ${GUIDE_STEPS.length}`;
  $('guide-title').textContent = t(`guide.${step.key}.title`);
  $('guide-body').textContent  = t(`guide.${step.key}.body`);
  $('guide-skip').textContent  = t('guide.skip');
  $('guide-prev').textContent  = t('guide.prev');
  $('guide-prev').style.visibility = idx === 0 ? 'hidden' : '';
  $('guide-next').textContent  = idx === GUIDE_STEPS.length - 1 ? t('guide.done') : t('guide.next');

  // 手機版要先把抽屜拉出來，等它滑到定位才量得到正確位置
  let needsDrawer = false;
  if (guideIsMobile()) {
    const cls = document.body.classList;
    needsDrawer = cls.contains('mobile-left-open')  !== (step.drawer === 'left')
               || cls.contains('mobile-right-open') !== (step.drawer === 'right');
    setGuideDrawer(step.drawer);
  }
  _guideEls.card.style.visibility = 'hidden';
  setTimeout(() => {
    if (seq !== _guideSeq) return;
    positionGuide();
    _guideEls.card.style.visibility = '';
    $('guide-next').focus();
  }, needsDrawer ? GUIDE_DRAWER_MS : 0);
}

function positionGuide() {
  if (!_guideEls || _guideIdx < 0) return;
  const { spot, card } = _guideEls;
  const vw = window.innerWidth, vh = window.innerHeight;
  const target = document.querySelector(GUIDE_STEPS[_guideIdx].target);
  const r = target?.getBoundingClientRect();

  if (!r || (r.width === 0 && r.height === 0)) {
    // 目標不在畫面上（例如欄位被收合）：不框任何東西，說明卡置中
    spot.style.display = 'none';
    card.style.left = `${Math.max(16, (vw - card.offsetWidth) / 2)}px`;
    card.style.top  = `${Math.max(16, (vh - card.offsetHeight) / 2)}px`;
    return;
  }

  // 高亮框夾在視窗內，避免很長的資料夾清單把框推出畫面
  const box = {
    left  : Math.max(4, r.left - GUIDE_PAD),
    top   : Math.max(4, r.top - GUIDE_PAD),
    right : Math.min(vw - 4, r.right + GUIDE_PAD),
    bottom: Math.min(vh - 4, r.bottom + GUIDE_PAD)
  };
  spot.style.display = '';
  spot.style.left   = `${box.left}px`;
  spot.style.top    = `${box.top}px`;
  spot.style.width  = `${box.right - box.left}px`;
  spot.style.height = `${box.bottom - box.top}px`;

  const cw = card.offsetWidth, ch = card.offsetHeight;
  const clampX = x => Math.min(Math.max(16, x), vw - cw - 16);
  const clampY = y => Math.min(Math.max(16, y), vh - ch - 16);
  let left, top;
  if (vw - box.right - GUIDE_GAP >= cw + 16) {          // 右側
    left = box.right + GUIDE_GAP; top = clampY(box.top);
  } else if (box.left - GUIDE_GAP >= cw + 16) {         // 左側
    left = box.left - GUIDE_GAP - cw; top = clampY(box.top);
  } else if (vh - box.bottom - GUIDE_GAP >= ch + 16) {  // 下方
    left = clampX(box.left); top = box.bottom + GUIDE_GAP;
  } else if (box.top - GUIDE_GAP >= ch + 16) {          // 上方
    left = clampX(box.left); top = box.top - GUIDE_GAP - ch;
  } else {                                              // 目標佔滿畫面：貼底
    left = clampX((vw - cw) / 2); top = vh - ch - 16;
  }
  card.style.left = `${left}px`;
  card.style.top  = `${top}px`;
}

$('guide-replay-btn')?.addEventListener('click', () => {
  $('settings-overlay').style.display = 'none';
  startGuide();
});

// 第一次使用：等開機渲染穩定後再開始
if (!lsGet(GUIDE_DONE_KEY)) setTimeout(() => {
  if (!lsGet(GUIDE_DONE_KEY)) startGuide();
}, 800);
