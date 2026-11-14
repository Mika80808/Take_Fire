/* ══════════════════════════════════════════════════════════
   Filter Prompt — Photo 頁右下角相機按鈕
   讀 .cube LUT → 套在預覽底圖上 → 點預覽圖把 LUT 換算成的色調數據
   組成英文提示詞複製到剪貼簿，貼到 GPT 讓生成圖套用相同濾鏡。

   濾鏡來源：
   - FILTER_PRESETS：預設 LUT，檔案放 assets/luts/，執行時 fetch 解析
   - 使用者在面板內匯入的 .cube：降取樣成 17³ 存 localStorage（不進備份）
══════════════════════════════════════════════════════════ */
const FILTER_PRESETS = [
  // { name: 'Kodak Portra', file: 'assets/luts/portra.cube' },
];
const FILTER_LS_KEY   = 'tak_fire_filters_v1';
const FILTER_LUT_SIZE = 17;      // 儲存與分析用的 LUT 網格大小
const FILTER_THUMB    = 220;     // 濾鏡庫預覽圖長邊 px
const FILTER_SAMPLE   = 'assets/photo-1.png';   // 濾鏡庫固定用這張當範例

Object.assign(I18N['zh-TW'], {
  'flt.title'      : '濾鏡提示詞',
  'flt.import'     : '匯入 LUT',
  'flt.toggle'     : '濾鏡',
  'flt.original'   : '原圖',
  'flt.hint'       : '點濾鏡預覽圖即複製 GPT 提示詞。要直接替 CG 套色，請點開照片大圖選濾鏡。',
  'flt.empty'      : '還沒有濾鏡。點右上「匯入 LUT」選擇 .cube 檔。',
  'flt.copied'     : '已複製',
  'flt.delete'     : '刪除濾鏡',
  'flt.deleteConfirm': '確定刪除「%s」？',
  'flt.preset'     : '預設',
  'flt.promptLabel': '最近複製的提示詞',
  'flt.badFile'    : '無法讀取「%s」：%s',
  'flt.loading'    : '處理中…',
  'flt.deleteInUse': '確定刪除「%s」？有 %s 張照片正在使用，刪除後會回到原圖。',
  'flt.none'       : '原圖',
  'flt.label'      : '濾鏡',
  'flt.holdHint'   : '按住圖片看原圖',
  'flt.noFilters'  : '點 Photo 頁右下角相機按鈕匯入 LUT',
  'flt.copyImg'    : '複製圖片',
  'flt.copyFail'   : '無法複製圖片：%s',
});
Object.assign(I18N['en'], {
  'flt.title'      : 'Filter prompts',
  'flt.import'     : 'Import LUT',
  'flt.toggle'     : 'Filters',
  'flt.original'   : 'Original',
  'flt.hint'       : 'Click a filter preview to copy a GPT prompt. To grade a CG directly, open the photo and pick a filter.',
  'flt.empty'      : 'No filters yet. Use “Import LUT” to add a .cube file.',
  'flt.copied'     : 'Copied',
  'flt.delete'     : 'Delete filter',
  'flt.deleteConfirm': 'Delete “%s”?',
  'flt.preset'     : 'Preset',
  'flt.promptLabel': 'Last copied prompt',
  'flt.badFile'    : 'Could not read “%s”: %s',
  'flt.loading'    : 'Processing…',
  'flt.deleteInUse': 'Delete “%s”? %s photo(s) use it and will go back to the original.',
  'flt.none'       : 'Original',
  'flt.label'      : 'Filter',
  'flt.holdHint'   : 'Hold the image to see the original',
  'flt.noFilters'  : 'Import a LUT with the camera button on the Photo page',
  'flt.copyImg'    : 'Copy image',
  'flt.copyFail'   : 'Could not copy the image: %s',
});

/* ── .cube 解析 ── */
function parseCubeLUT(text) {
  let size = 0, title = '', dMin = [0, 0, 0], dMax = [1, 1, 1];
  const vals = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line[0] === '#') continue;
    const c = line.charCodeAt(0);
    if ((c >= 48 && c <= 57) || c === 45 || c === 46) {      // 數字、負號、小數點開頭 = 資料列
      const p = line.split(/\s+/);
      vals.push(+p[0], +p[1], +p[2]);
      continue;
    }
    const [kw, ...rest] = line.split(/\s+/);
    const key = kw.toUpperCase();
    if (key === 'TITLE') title = line.slice(5).trim().replace(/^"|"$/g, '');
    else if (key === 'LUT_3D_SIZE') size = parseInt(rest[0], 10);
    else if (key === 'LUT_1D_SIZE') throw new Error('1D LUT not supported');
    else if (key === 'DOMAIN_MIN') dMin = rest.slice(0, 3).map(Number);
    else if (key === 'DOMAIN_MAX') dMax = rest.slice(0, 3).map(Number);
  }
  if (!(size >= 2 && size <= 256)) throw new Error('missing LUT_3D_SIZE');
  if (vals.length !== size * size * size * 3) throw new Error(`expected ${size ** 3} rows, got ${vals.length / 3}`);
  if (vals.some(v => !Number.isFinite(v))) throw new Error('invalid number');
  // 把 DOMAIN 正規化到 0–1
  for (let i = 0; i < vals.length; i++) {
    const ch = i % 3, span = (dMax[ch] - dMin[ch]) || 1;
    vals[i] = (vals[i] - dMin[ch]) / span;
  }
  return { title, size, data: Float32Array.from(vals) };
}

// LUT 物件：{ size, data(Float32Array, R 變化最快) }，sample 回傳 0–1 的 [r,g,b]
function lutSample(lut, r, g, b, out) {
  const n = lut.size - 1, d = lut.data;
  const fr = Math.min(Math.max(r, 0), 1) * n, fg = Math.min(Math.max(g, 0), 1) * n, fb = Math.min(Math.max(b, 0), 1) * n;
  const r0 = Math.min(fr | 0, n - 1), g0 = Math.min(fg | 0, n - 1), b0 = Math.min(fb | 0, n - 1);
  const tr = fr - r0, tg = fg - g0, tb = fb - b0;
  const s = lut.size, s2 = s * s;
  const i000 = (r0 + g0 * s + b0 * s2) * 3;
  const i100 = i000 + 3, i010 = i000 + s * 3, i110 = i010 + 3;
  const i001 = i000 + s2 * 3, i101 = i001 + 3, i011 = i001 + s * 3, i111 = i011 + 3;
  for (let c = 0; c < 3; c++) {
    const c00 = d[i000 + c] + (d[i100 + c] - d[i000 + c]) * tr;
    const c10 = d[i010 + c] + (d[i110 + c] - d[i010 + c]) * tr;
    const c01 = d[i001 + c] + (d[i101 + c] - d[i001 + c]) * tr;
    const c11 = d[i011 + c] + (d[i111 + c] - d[i011 + c]) * tr;
    const c0 = c00 + (c10 - c00) * tg, c1 = c01 + (c11 - c01) * tg;
    out[c] = c0 + (c1 - c0) * tb;
  }
  return out;
}

function lutResample(lut, size) {
  if (lut.size === size) return lut;
  const data = new Float32Array(size ** 3 * 3), o = [0, 0, 0], n = size - 1;
  let i = 0;
  for (let b = 0; b < size; b++) for (let g = 0; g < size; g++) for (let r = 0; r < size; r++) {
    lutSample(lut, r / n, g / n, b / n, o);
    data[i++] = o[0]; data[i++] = o[1]; data[i++] = o[2];
  }
  return { size, data };
}

// 存 localStorage：0–1 量化成 8-bit 再 base64
function lutEncode(lut) {
  let s = '';
  for (let i = 0; i < lut.data.length; i++) s += String.fromCharCode(Math.round(Math.min(Math.max(lut.data[i], 0), 1) * 255));
  return btoa(s);
}
function lutDecode(b64, size) {
  const s = atob(b64), data = new Float32Array(s.length);
  for (let i = 0; i < s.length; i++) data[i] = s.charCodeAt(i) / 255;
  if (data.length !== size ** 3 * 3) throw new Error('bad LUT data');
  return { size, data };
}

/* ── LUT → 色調數據 ── */
const _fltHex = (r, g, b) => '#' + [r, g, b].map(v => Math.round(Math.min(Math.max(v, 0), 1) * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
const _fltLuma = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const _fltR255 = v => Math.round(v * 255);

function _fltHsv(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), c = mx - mn;
  let h = 0;
  if (c > 1e-6) {
    if (mx === r) h = ((g - b) / c) % 6;
    else if (mx === g) h = (b - r) / c + 2;
    else h = (r - g) / c + 4;
    h *= 60; if (h < 0) h += 360;
  }
  return { h, s: mx > 0 ? c / mx : 0, v: mx, c };
}
function _fltFromHsv(h, s, v) {
  const f = n => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
  return [f(5), f(3), f(1)];
}
function _fltHueName(h) {
  if (h < 15 || h >= 340) return 'red';
  if (h < 42)  return 'orange/amber';
  if (h < 68)  return 'yellow';
  if (h < 155) return 'green';
  if (h < 200) return 'teal/cyan';
  if (h < 250) return 'blue';
  if (h < 290) return 'purple';
  return 'magenta';
}
const _fltDh = (a, b) => { let d = b - a; while (d > 180) d -= 360; while (d < -180) d += 360; return d; };
const _fltSign = (v, digits = 0) => (v >= 0 ? '+' : '') + v.toFixed(digits);

function analyzeLUT(lut) {
  const o = [0, 0, 0];
  const f = (r, g, b) => lutSample(lut, r, g, b, o).slice();

  // 中性灰軸的色調曲線
  const tone = [0, 32, 64, 128, 191, 223, 255].map(x => {
    const v = f(x / 255, x / 255, x / 255);
    return { x, rgb: v, y: _fltLuma(...v) };
  });
  const yAt = x => { const v = f(x, x, x); return _fltLuma(...v); };
  const contrast = (yAt(0.75) - yAt(0.25)) / 0.5;
  const black = tone[0].y * 255, white = tone[tone.length - 1].y * 255;
  const midShift = (yAt(0.5) - 0.5) * 255;

  // 暗部／中間調／亮部的偏色（灰階輸入後的色偏）
  const zones = [['shadows', 0.15], ['midtones', 0.5], ['highlights', 0.85]].map(([name, x]) => {
    const v = f(x, x, x), hsv = _fltHsv(...v);
    return { name, x, rgb: v, hue: hsv.h, chroma: hsv.c * 255, warm: (v[0] - v[2]) * 255, green: (v[1] - (v[0] + v[2]) / 2) * 255 };
  });
  const warm  = zones.reduce((s, z) => s + z.warm, 0) / zones.length;
  const green = zones.reduce((s, z) => s + z.green, 0) / zones.length;

  // 飽和度：12 個色相 × 低／高飽和
  const satRatio = sIn => {
    let sum = 0;
    for (let h = 0; h < 360; h += 30) {
      const v = f(..._fltFromHsv(h, sIn, 0.75));
      sum += _fltHsv(...v).s / sIn;
    }
    return sum / 12;
  };
  const satLow = satRatio(0.3), satHigh = satRatio(0.85), sat = (satLow + satHigh) / 2;

  // 代表色的前後對照
  const colors = [
    ['skin tone',      [224, 172, 140]],
    ['red',            [200, 50, 45]],
    ['orange',         [230, 135, 40]],
    ['yellow',         [235, 210, 60]],
    ['foliage green',  [85, 130, 60]],
    ['sky blue',       [110, 165, 220]],
    ['deep blue',      [40, 60, 150]],
    ['purple/magenta', [160, 60, 150]],
  ].map(([name, c]) => {
    const i = c.map(v => v / 255), v = f(...i);
    const a = _fltHsv(...i), b = _fltHsv(...v);
    return {
      name, inHex: _fltHex(...i), outHex: _fltHex(...v),
      dh: _fltDh(a.h, b.h), ds: (b.s - a.s) * 100, dl: (_fltLuma(...v) - _fltLuma(...i)) * 100,
    };
  });

  return { tone, contrast, black, white, midShift, zones, warm, green, sat, satLow, satHigh, colors };
}

// 從數據歸納出風格標籤：zh 給卡片，en 給提示詞
function lutTags(a) {
  const tags = [];
  const add = (zh, en) => tags.push({ zh, en });
  const mono = a.sat < 0.1;
  if (mono) add('黑白', 'black and white');
  else if (a.sat < 0.45) add('近單色', 'nearly monochrome');
  else if (a.sat < 0.88) add('低飽和', 'muted, desaturated colors');
  else if (a.sat > 1.12) add('高飽和', 'vivid, saturated colors');
  if (!mono) {
    if (a.warm > 6) add('暖調', 'warm white balance');
    else if (a.warm < -6) add('冷調', 'cool white balance');
    if (a.green > 5) add('偏綠', 'green tint');
    else if (a.green < -5) add('偏洋紅', 'magenta tint');
  }
  if (a.contrast > 1.1) add('高對比', 'high contrast');
  else if (a.contrast < 0.9) add('低對比', 'low contrast');
  if (a.black > 12) add('褪色黑', 'lifted, faded blacks (matte look)');
  else if (a.black < 1 && a.contrast > 1.05) add('深黑', 'deep, crushed blacks');
  if (a.white < 238) add('柔和亮部', 'soft, rolled-off highlights');
  if (a.midShift > 8) add('提亮', 'brighter midtones');
  else if (a.midShift < -8) add('壓暗', 'darker midtones');
  const sh = a.zones[0], hi = a.zones[2];
  if (!mono && sh.chroma >= 8 && hi.chroma >= 8 && Math.abs(_fltDh(sh.hue, hi.hue)) > 90) {
    add('分離色調', `split toning: ${_fltHueName(sh.hue)} shadows, ${_fltHueName(hi.hue)} highlights`);
  }
  if (!tags.length) add('自然', 'subtle, natural grade');
  return tags;
}

function _fltZoneLine(z) {
  const hex = _fltHex(...z.rgb), input = _fltR255(z.x);
  if (z.chroma < 4) return `- ${z.name}: neutral (gray ${input} → ${hex})`;
  const strength = z.chroma < 10 ? 'subtle' : z.chroma < 22 ? 'moderate' : 'strong';
  return `- ${z.name}: ${strength} ${_fltHueName(z.hue)} tint (gray ${input} → ${hex})`;
}

function buildFilterPrompt(name, a) {
  const tags = lutTags(a);
  const L = [];
  L.push(`Apply the color grade "${name}" to the attached image, like a photo LUT.`);
  L.push('Keep the composition, subject, pose, lighting direction, textures and all details exactly the same — only change color and tone.');
  L.push('');
  L.push(`Overall look: ${tags.map(t => t.en).join(', ')}.`);
  L.push('');
  L.push('Tone curve (neutral gray input → output, 0–255):');
  a.tone.forEach(p => {
    const [r, g, b] = p.rgb.map(_fltR255);
    L.push(`- ${p.x} → ${_fltR255(p.y)}  (R${r} G${g} B${b})`);
  });
  L.push(`Contrast: ${a.contrast.toFixed(2)}× of original. Black point: ${Math.round(a.black)}. White point: ${Math.round(a.white)}.`);
  L.push('');
  L.push('Color balance:');
  a.zones.forEach(z => L.push(_fltZoneLine(z)));
  L.push('');
  if (a.sat < 0.1) {
    L.push('Saturation: remove all color (black and white).');
  } else {
    L.push(`Saturation: ${Math.round(a.sat * 100)}% of original (muted colors ${Math.round(a.satLow * 100)}%, vivid colors ${Math.round(a.satHigh * 100)}%).`);
    L.push('');
    L.push('Color mapping (original → graded):');
    a.colors.forEach(c => {
      L.push(`- ${c.name}: ${c.inHex} → ${c.outHex} (hue ${_fltSign(c.dh)}°, saturation ${_fltSign(c.ds)}%, lightness ${_fltSign(c.dl)}%)`);
    });
  }
  L.push('');
  L.push('Do not add grain, vignette, light leaks, borders, text or new objects.');
  return L.join('\n');
}

/* ── 狀態 ── */
const FLT = {
  filters: [],        // { id, name, lut, analysis, prompt, tags, isPreset }
  presetsLoaded: false,
  baseImg: null,      // 目前預覽底圖縮小後的 ImageData
  lastPrompt: '',
};

function fltMakeFilter(id, name, lut, isPreset) {
  const analysis = analyzeLUT(lut);
  return { id, name, lut, analysis, tags: lutTags(analysis), prompt: buildFilterPrompt(name, analysis), isPreset };
}

function fltLoadSaved() {
  let list = [];
  try { list = JSON.parse(lsGet(FILTER_LS_KEY) || '[]'); } catch (_) {}
  if (!Array.isArray(list)) return [];
  const out = [];
  list.forEach(rec => {
    try { out.push(fltMakeFilter(rec.id, rec.name, lutDecode(rec.data, rec.size), false)); }
    catch (err) { console.warn('filter decode:', err); }
  });
  return out;
}

function fltSave() {
  const list = FLT.filters.filter(x => !x.isPreset).map(x => ({ id: x.id, name: x.name, size: x.lut.size, data: lutEncode(x.lut) }));
  try { lsSet(FILTER_LS_KEY, JSON.stringify(list)); }
  catch (err) { console.warn('filter save:', err); notifyStorageError(err); }
}

async function fltLoadPresets() {
  if (FLT.presetsLoaded) return;
  FLT.presetsLoaded = true;
  const loaded = await Promise.all(FILTER_PRESETS.map(async p => {
    try {
      const res = await fetch(p.file);
      if (!res.ok) throw new Error(res.status);
      const lut = lutResample(parseCubeLUT(await res.text()), FILTER_LUT_SIZE);
      return fltMakeFilter('preset_' + p.file, p.name, lut, true);
    } catch (err) { console.warn('preset LUT', p.file, err); return null; }
  }));
  FLT.filters = [...loaded.filter(Boolean), ...FLT.filters.filter(x => !x.isPreset)];
}

/* ── 預覽底圖 ── */
async function fltLoadBase() {
  if (!FLT.baseImg) FLT.baseImg = await fltImageData(FILTER_SAMPLE, FILTER_THUMB);
}

function fltApplyPixels(src, lut, out) {
  const s = src.data, d = out.data, o = [0, 0, 0];
  for (let i = 0; i < s.length; i += 4) {
    lutSample(lut, s[i] / 255, s[i + 1] / 255, s[i + 2] / 255, o);
    d[i] = o[0] * 255; d[i + 1] = o[1] * 255; d[i + 2] = o[2] * 255; d[i + 3] = s[i + 3];
  }
}

function fltRenderInto(canvas, lut, base = FLT.baseImg) {
  if (!base) return;
  canvas.width = base.width; canvas.height = base.height;
  const ctx = canvas.getContext('2d');
  if (!lut) { ctx.putImageData(base, 0, 0); return; }
  const out = ctx.createImageData(base.width, base.height);
  fltApplyPixels(base, lut, out);
  ctx.putImageData(out, 0, 0);
}

// 圖片 → 縮到 maxEdge 以內的 ImageData
async function fltImageData(src, maxEdge = Infinity) {
  const img = new Image();
  img.src = src;
  await img.decode();
  const k = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.round(img.naturalWidth * k));
  cv.height = Math.max(1, Math.round(img.naturalHeight * k));
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, cv.width, cv.height);
  return ctx.getImageData(0, 0, cv.width, cv.height);
}

async function fltRenderBlob(src, lut, maxEdge = Infinity, type = 'image/webp', quality = 0.92) {
  const base = await fltImageData(src, maxEdge);
  const cv = document.createElement('canvas');
  fltRenderInto(cv, lut, base);
  const blob = await new Promise(res => cv.toBlob(res, type, quality));
  if (!blob) throw new Error('encode failed');
  return blob;
}

/* ── 套在 Photo 頁照片上：原圖不動，只記 filterId，顯示時即時算並快取在記憶體 ── */
const FILTER_GRID_EDGE = 800;
const _fltUrlCache = new Map();   // `${src}|${filterId}|${edge}` → Promise<objectURL>
let _fltQueue = Promise.resolve(); // 一張一張算，避免同時開很多張時整頁卡住

function fltById(id) {
  return id ? FLT.filters.find(f => f.id === id) || null : null;
}

// 回傳套好濾鏡的圖片網址；沒有濾鏡（或濾鏡已刪除）就回傳原圖
function fltFilteredUrl(src, filterId, edge = Infinity) {
  const flt = fltById(filterId);
  if (!flt || !src) return Promise.resolve(src);
  const key = `${src}|${filterId}|${edge}`;
  if (_fltUrlCache.has(key)) return _fltUrlCache.get(key);
  const p = (_fltQueue = _fltQueue.catch(() => {}).then(async () => {
    await new Promise(r => setTimeout(r, 0));   // 讓出主執行緒給畫面更新
    return URL.createObjectURL(await fltRenderBlob(src, flt.lut, edge));
  }));
  p.catch(err => { console.warn('filter render:', err); _fltUrlCache.delete(key); });
  _fltUrlCache.set(key, p);
  return p;
}

function fltDropCache(filterId) {
  for (const [key, p] of _fltUrlCache) {
    if (!key.includes(`|${filterId}|`)) continue;
    _fltUrlCache.delete(key);
    p.then(u => URL.revokeObjectURL(u)).catch(() => {});
  }
}

/* ── IG 大圖視窗：濾鏡縮圖列、按住看原圖、複製圖片 ── */
let _igFltPoster = null;
let _igFltSel = '';
let _igFltSeq = 0;
let _igFltOpen = false;   // 濾鏡列平時收起，按鏡頭圖示才展開

function fltIgShow(poster) {
  _igFltPoster = poster;
  _igFltSel = fltById(poster?.filterId) ? poster.filterId : '';
  _igFltOpen = false;
  fltIgUpdateImage();
  fltIgBuildStrip();
}

function fltIgToggle() {
  _igFltOpen = !_igFltOpen;
  fltIgBuildStrip();
}

function fltIgSyncToggle() {
  const btn = $('ig-flt-toggle'); if (!btn) return;
  btn.hidden = !_igFltPoster?.isLocal;
  btn.classList.toggle('open', _igFltOpen);
  btn.classList.toggle('has-filter', !!_igFltSel);
  btn.setAttribute('aria-expanded', String(_igFltOpen));
  const name = fltById(_igFltSel)?.name;
  setBtnLabel(btn, name ? `${t('flt.toggle')}：${name}` : t('flt.toggle'));
}

function fltIgSelected() { return _igFltSel; }

function fltIgUpdateImage() {
  const img = $('ig-modal-img'), poster = _igFltPoster;
  if (!img || !poster) return;
  const seq = ++_igFltSeq;
  if (!_igFltSel) { img.src = poster.src; return; }
  fltFilteredUrl(poster.src, _igFltSel).then(u => { if (seq === _igFltSeq) img.src = u; });
}

async function fltIgBuildStrip() {
  const wrap = $('ig-flt'), strip = $('ig-flt-strip'), poster = _igFltPoster;
  if (!wrap || !strip) return;
  fltIgSyncToggle();
  wrap.hidden = !(poster?.isLocal && _igFltOpen);
  if (wrap.hidden) { strip.innerHTML = ''; return; }
  strip.innerHTML = '';
  $('ig-flt-hint').textContent = FLT.filters.length ? t('flt.holdHint') : t('flt.noFilters');
  if (!FLT.filters.length) return;
  let base = null;
  try { base = await fltImageData(poster.src, 120); } catch (err) { console.warn('filter strip:', err); }
  if (_igFltPoster !== poster) return;   // 等待期間已翻到別張
  strip.innerHTML = '';
  [{ id: '', name: t('flt.none'), lut: null }, ...FLT.filters].forEach(flt => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'ig-flt-item' + (flt.id === _igFltSel ? ' active' : '');
    b.dataset.id = flt.id;
    b.title = flt.name;
    const cv = document.createElement('canvas');
    if (base) fltRenderInto(cv, flt.lut, base);
    b.appendChild(cv);
    const lbl = document.createElement('span');
    lbl.textContent = flt.name;
    b.appendChild(lbl);
    b.addEventListener('click', () => {
      _igFltSel = flt.id;
      strip.querySelectorAll('.ig-flt-item').forEach(x => x.classList.toggle('active', x.dataset.id === flt.id));
      fltIgSyncToggle();
      fltIgUpdateImage();
    });
    strip.appendChild(b);
  });
  strip.querySelector('.ig-flt-item.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function fltIgCopyImage() {
  const poster = _igFltPoster;
  if (!poster) return;
  const lut = fltById(_igFltSel)?.lut || null;
  const btn = $('ig-modal-copy');
  const fail = err => showModal({ title: t('flt.copyImg'), desc: tf('flt.copyFail', err?.message || err) });
  if (!navigator.clipboard?.write || typeof ClipboardItem !== 'function') { fail(new Error('clipboard unavailable')); return; }
  // ClipboardItem 直接收 Promise：Safari 要求在點擊當下就呼叫 write
  const blob = fltRenderBlob(poster.src, lut, Infinity, 'image/png');
  navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]).then(() => {
    btn?.classList.add('done');
    clearTimeout(btn?._t);
    if (btn) btn._t = setTimeout(() => btn.classList.remove('done'), 1400);
  }).catch(fail);
}

/* ── 面板 ── */
function buildFilterGrid() {
  const grid = $('flt-grid'); if (!grid) return;
  grid.innerHTML = '';

  const orig = document.createElement('div');
  orig.className = 'flt-card flt-card-orig';
  const ocv = document.createElement('canvas');
  fltRenderInto(ocv, null);
  orig.appendChild(ocv);
  orig.insertAdjacentHTML('beforeend', `<div class="flt-card-name">${esc(t('flt.original'))}</div>`);
  grid.appendChild(orig);

  FLT.filters.forEach(flt => {
    const card = document.createElement('div');
    card.className = 'flt-card';
    card.title = flt.name + '\n' + flt.tags.map(x => x.zh).join(' · ');
    const cv = document.createElement('canvas');
    fltRenderInto(cv, flt.lut);
    card.appendChild(cv);
    card.insertAdjacentHTML('beforeend',
      `<div class="flt-card-name">${esc(flt.name)}${flt.isPreset ? ` <span class="flt-badge">${esc(t('flt.preset'))}</span>` : ''}</div>` +
      `<div class="flt-card-tags">${esc(flt.tags.map(x => x.zh).join(' · '))}</div>` +
      `<div class="flt-card-done">${esc(t('flt.copied'))}</div>`);
    card.addEventListener('click', () => fltCopy(flt, card));
    addKeyActivation(card);
    if (!flt.isPreset) {
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'flt-card-del';
      del.innerHTML = '&times;';
      setBtnLabel(del, t('flt.delete'));
      del.addEventListener('click', e => { e.stopPropagation(); fltDelete(flt); });
      card.appendChild(del);
    }
    grid.appendChild(card);
  });

  $('flt-empty').hidden = FLT.filters.length > 0;
}

function fltCopy(flt, card) {
  copyTextToClipboard(flt.prompt, () => {
    card.classList.add('copied');
    clearTimeout(card._t);
    card._t = setTimeout(() => card.classList.remove('copied'), 1400);
  });
  FLT.lastPrompt = flt.prompt;
  const ta = $('flt-prompt');
  if (ta) { ta.value = flt.prompt; $('flt-prompt-wrap').hidden = false; }
}

function fltDelete(flt) {
  const inUse = (SS.posters || []).filter(p => p.filterId === flt.id).length;
  showModal({
    title: t('flt.delete'),
    desc: inUse ? tf('flt.deleteInUse', flt.name, inUse) : tf('flt.deleteConfirm', flt.name),
    confirmClass: 'btn-danger',
    confirmText: t('modal.delete'),
    onConfirm: () => {
      FLT.filters = FLT.filters.filter(x => x !== flt);
      fltDropCache(flt.id);
      fltSave();
      buildFilterGrid();
      if (inUse) buildPosterGrid(SS.posters);
    }
  });
}

async function fltImportFiles(files) {
  const errors = [];
  for (const file of files) {
    try {
      const parsed = parseCubeLUT(await file.text());
      const name = (parsed.title || file.name.replace(/\.cube$/i, '')).trim() || file.name;
      FLT.filters.push(fltMakeFilter(uid(), name, lutResample(parsed, FILTER_LUT_SIZE), false));
    } catch (err) {
      errors.push(tf('flt.badFile', file.name, err.message || err));
    }
  }
  fltSave();
  buildFilterGrid();
  if (errors.length) showModal({ title: t('flt.import'), desc: errors.join('\n') });
}

async function openFilterPanel() {
  const ov = $('flt-overlay'); if (!ov) return;
  ov.classList.add('open');
  ov.setAttribute('aria-hidden', 'false');
  $('flt-grid').innerHTML = `<div class="flt-loading">${esc(t('flt.loading'))}</div>`;
  try {
    await Promise.all([fltLoadPresets(), fltLoadBase()]);
  } catch (err) { console.warn('filter panel:', err); }
  buildFilterGrid();
}

function closeFilterPanel() {
  const ov = $('flt-overlay'); if (!ov) return;
  ov.classList.remove('open');
  ov.setAttribute('aria-hidden', 'true');
}

(function initFilterPanel() {
  FLT.filters = fltLoadSaved();
  // 預設 LUT 要 fetch，載完後若 Photo 頁已顯示就重畫，讓用到預設濾鏡的照片套上色
  if (FILTER_PRESETS.length) fltLoadPresets().then(() => {
    if ((SS.posters || []).some(p => p.filterId) && SS.currentPage === 'poster') buildPosterGrid(SS.posters);
  });
  $('ig-modal-copy')?.addEventListener('click', fltIgCopyImage);
  $('ig-flt-toggle')?.addEventListener('click', fltIgToggle);
  const igImg = $('ig-modal-img');
  if (igImg) {
    // 按住看原圖
    const showOrig = e => { if (_igFltSel && _igFltPoster && (e.button ?? 0) === 0) { _igFltSeq++; igImg.src = _igFltPoster.src; } };
    const restore = () => { if (_igFltSel) fltIgUpdateImage(); };
    igImg.addEventListener('pointerdown', showOrig);
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => igImg.addEventListener(ev, restore));
    igImg.addEventListener('contextmenu', e => { if (e.pointerType !== 'mouse') e.preventDefault(); });
  }
  applyI18n($('flt-overlay'));
  applyI18n($('flt-fab')?.parentNode);
  applyI18n($('ig-modal-overlay'));
  if (SS.currentPage === 'poster' && (SS.posters || []).some(p => p.filterId)) buildPosterGrid(SS.posters);
  $('flt-fab')?.addEventListener('click', openFilterPanel);
  $('flt-close')?.addEventListener('click', closeFilterPanel);
  $('flt-overlay')?.addEventListener('click', e => { if (e.target === e.currentTarget) closeFilterPanel(); });
  $('flt-import')?.addEventListener('click', () => $('flt-input')?.click());
  $('flt-input')?.addEventListener('change', e => {
    const files = [...e.target.files];
    e.target.value = '';
    if (files.length) fltImportFiles(files);
  });
  $('flt-prompt-copy')?.addEventListener('click', () => {
    if (!FLT.lastPrompt) return;
    copyTextToClipboard(FLT.lastPrompt, () => {
      const b = $('flt-prompt-copy'), orig = b.textContent;
      b.textContent = t('flt.copied');
      setTimeout(() => { b.textContent = orig; }, 1400);
    });
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !e.defaultPrevented && $('flt-overlay')?.classList.contains('open')) closeFilterPanel();
  });
})();
