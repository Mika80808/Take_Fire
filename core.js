'use strict';

/* ══════════════════════════════════════════════════════════
   Global Error Trap
══════════════════════════════════════════════════════════ */
// 資料只存在使用者這台裝置上，沒有伺服器端副本。程式一旦出錯，
// 後續的儲存可能已經停擺而畫面上看不出來，所以出錯時第一件事是
// 提醒使用者先匯出備份。註冊在 core.js 最前面，才涵蓋得到
// story.js / site.js 的載入與執行期錯誤。
let _fatalWarned = false;
function notifyFatalError(source, detail) {
  console.error(`[${source}]`, detail);
  if (_fatalWarned) return;          // 一個 session 只擾民一次
  _fatalWarned = true;
  const title = typeof t === 'function' ? t('err.title') : '發生未預期的錯誤';
  const desc  = typeof t === 'function' ? t('err.desc')  : '建議先匯出備份再重新整理頁面。';
  try {
    if (typeof showModal === 'function') {
      showModal({ title, desc, confirmText: typeof t === 'function' ? t('msg.gotIt') : '知道了' });
      return;
    }
  } catch (_) { /* showModal 自己也壞了就退到下面的純 DOM 提示 */ }
  try {
    const bar = document.createElement('div');
    bar.setAttribute('role', 'alert');
    bar.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:2147483647;' +
      'padding:12px 16px;background:#7f1d1d;color:#fff;font:14px/1.5 system-ui,sans-serif;';
    bar.textContent = `${title}　${desc}`;
    document.body.appendChild(bar);
  } catch (_) { /* 連 DOM 都不可用時只能留在 console */ }
}

window.addEventListener('error', e => {
  // 圖片／指令碼載入失敗會冒泡成 error 事件但沒有 error 物件，不必驚動使用者
  if (!e.error && e.target !== window) return;
  notifyFatalError('window.error', e.error || e.message);
});
window.addEventListener('unhandledrejection', e => {
  notifyFatalError('unhandledrejection', e.reason);
});

/* ══════════════════════════════════════════════════════════
   IndexedDB — Posters & Song Covers
══════════════════════════════════════════════════════════ */
let _idb = null;

let _idbPromise = null;

function openDB() {
  if (_idb) return Promise.resolve(_idb);
  if (_idbPromise) return _idbPromise;
  _idbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open('tak_fire_db', 5);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('posters')) {
        db.createObjectStore('posters', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('backgrounds')) {
        db.createObjectStore('backgrounds', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('song_covers')) {
        db.createObjectStore('song_covers', { keyPath: 'songId' });
      }
      if (!db.objectStoreNames.contains('app_assets')) {
        db.createObjectStore('app_assets', { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains('song_mp3s')) {
        db.createObjectStore('song_mp3s', { keyPath: 'songId' });
      }
      if (!db.objectStoreNames.contains('messages')) {
        const ms = db.createObjectStore('messages', { keyPath: 'id' });
        ms.createIndex('fp', 'fp', { unique: false });
        ms.createIndex('ts', 'ts', { unique: false });
      }
    };
    req.onsuccess = e => {
      _idb = e.target.result;
      _idbPromise = null;
      _idb.onversionchange = () => { _idb.close(); _idb = null; _idbPromise = null; };
      _idb.onclose = () => { _idb = null; _idbPromise = null; };
      resolve(_idb);
    };
    req.onerror = e => { _idbPromise = null; reject(e.target.error); };
    req.onblocked = () => { _idb = null; _idbPromise = null; };
  });
  return _idbPromise;
}

/* ── 泛用 IDB CRUD（單一 store 的 getAll / get / put / delete 樣板） ── */
async function idbGetAll(store) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, 'readonly').objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror   = e => reject(e.target.error);
  });
}

async function idbGet(store, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, 'readonly').objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror   = e => reject(e.target.error);
  });
}

async function idbPut(store, record) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(record);
    tx.oncomplete = resolve;
    tx.onerror    = e => reject(e.target.error);
  });
}

async function idbDelete(store, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).delete(key);
    tx.oncomplete = resolve;
    tx.onerror    = e => reject(e.target.error);
  });
}

const idbGetAllPosters = () => idbGetAll('posters');
const idbPutPoster     = (record) => idbPut('posters', record);
const idbDeletePoster  = (id) => idbDelete('posters', id);

/* ── Poster objectURL cache ── */
const _posterUrlCache = new Map(); // id → objectURL

function getPosterObjectUrl(record) {
  if (_posterUrlCache.has(record.id)) return _posterUrlCache.get(record.id);
  const url = URL.createObjectURL(record.blob);
  _posterUrlCache.set(record.id, url);
  return url;
}

/* ── App Asset IDB helpers ── */
const _assetUrlCache = new Map(); // key → objectURL

const idbGetAsset = (key) => idbGet('app_assets', key);
const idbPutAsset = (key, blob) => idbPut('app_assets', { key, blob });

function setAssetUrl(key, blob) {
  if (_assetUrlCache.has(key)) {
    URL.revokeObjectURL(_assetUrlCache.get(key));
    _assetUrlCache.delete(key);
  }
  const objectUrl = URL.createObjectURL(blob);
  _assetUrlCache.set(key, objectUrl);
  S[key] = objectUrl;
}

// 回傳實際載入成功的 key 陣列，讓 boot 判斷是否需要補刷 UI
async function loadAllAssets() {
  const keys = ['avatarChar', 'avatarPlayer'];
  const loaded = [];
  await Promise.all(keys.map(async key => {
    try {
      const rec = await idbGetAsset(key);
      if (rec?.blob instanceof Blob) { setAssetUrl(key, rec.blob); loaded.push(key); }
    } catch (e) {
      console.warn('loadAllAssets:', key, e);
    }
  }));
  try {
    if (await loadActiveBackground()) loaded.push('bgImage');
  } catch (e) {
    console.warn('loadAllAssets: bgImage', e);
  }
  return loaded;
}

// 套用中的背景直接從圖庫（backgrounds store）以 S.bgActiveId 讀取。
// 舊版另在 app_assets.bgImage 存了一份副本：圖庫裡讀得到時就刪掉它，
// 讀不到（尚未遷移進圖庫的舊資料）才退回用它。
async function loadActiveBackground() {
  if (S.bgActiveId) {
    const rec = await idbGet('backgrounds', S.bgActiveId);
    if (rec?.blob instanceof Blob) {
      setAssetUrl('bgImage', rec.blob);
      idbDelete('app_assets', 'bgImage').catch(() => {});
      return true;
    }
  }
  const legacy = await idbGetAsset('bgImage');
  if (legacy?.blob instanceof Blob) { setAssetUrl('bgImage', legacy.blob); return true; }
  return false;
}

/* ── Background Gallery IDB helpers（多張背景圖庫，record: { id, blob, name, ts }） ── */
const idbGetAllBackgrounds = () => idbGetAll('backgrounds');
const idbPutBackground     = (record) => idbPut('backgrounds', record);
const idbDeleteBackground  = (id) => idbDelete('backgrounds', id);

const _bgUrlCache = new Map(); // id → objectURL

function getBgObjectUrl(record) {
  if (_bgUrlCache.has(record.id)) return _bgUrlCache.get(record.id);
  const url = URL.createObjectURL(record.blob);
  _bgUrlCache.set(record.id, url);
  return url;
}

/* ── Song Cover IDB helpers ── */
const idbGetAllCovers = () => idbGetAll('song_covers');
const idbPutCover     = (record) => idbPut('song_covers', record); // { songId, blob, fileName }
const idbDeleteCover  = (songId) => idbDelete('song_covers', songId);

/* ── Cover objectURL cache ── */
const _coverUrlCache = new Map(); // songId → objectURL

function getCoverObjectUrl(songId, blob) {
  if (_coverUrlCache.has(songId)) return _coverUrlCache.get(songId);
  const url = URL.createObjectURL(blob);
  _coverUrlCache.set(songId, url);
  return url;
}

function revokeCoverUrl(songId) {
  if (_coverUrlCache.has(songId)) {
    URL.revokeObjectURL(_coverUrlCache.get(songId));
    _coverUrlCache.delete(songId);
  }
}

/* ── Song MP3 IDB helpers ── */
const _mp3UrlCache = new Map(); // songId → objectURL

function revokeMp3Url(songId) {
  if (_mp3UrlCache.has(songId)) {
    URL.revokeObjectURL(_mp3UrlCache.get(songId));
    _mp3UrlCache.delete(songId);
  }
}

const idbGetAllMp3s = () => idbGetAll('song_mp3s');
const idbPutMp3     = (record) => idbPut('song_mp3s', record); // { songId, blob, fileName }
const idbDeleteMp3  = (songId) => idbDelete('song_mp3s', songId);

/* ── Messages IDB helpers ── */
function msgFingerprint(m) {
  return m.type === 'msg'
    ? `${m.tsStr}|${m.name}|${(m.lines[0] || '').slice(0, 40)}`
    : `sep:${m.ts}`;
}

async function idbPutMessages(records) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('messages', 'readwrite');
    const store = tx.objectStore('messages');
    records.forEach(r => store.put(r));
    tx.oncomplete = resolve;
    tx.onerror = e => reject(e.target.error);
  });
}

// 低於此筆數一律走逐筆主鍵查詢。store.count() 本身要花數毫秒，比小量查詢還貴，
// 所以常見情境（開一般資料夾）連探測都不做。
const BULK_FETCH_MIN = 2000;
// 超過上述筆數後，取用比例還要高於此值才划算改走 getAll
const BULK_FETCH_RATIO = 0.6;

// 依 id 取訊息。回傳順序不保證，呼叫端一律自行重新排序。
async function idbGetMessagesByIds(ids) {
  if (!ids || ids.length === 0) return [];
  const db = await openDB();
  const wanted = new Set(ids);   // 順便去重，避免父子資料夾重複引用同一則時渲染出兩筆
  return new Promise((resolve, reject) => {
    const tx = db.transaction('messages', 'readonly');
    const store = tx.objectStore('messages');

    // 逐筆主鍵查詢：B-tree lookup，不必反序列化無關的訊息
    const keyedGet = () => {
      const results = [];
      let pending = wanted.size;
      wanted.forEach(id => {
        const req = store.get(id);
        req.onsuccess = () => {
          if (req.result) results.push(req.result);
          if (--pending === 0) resolve(results);
        };
        req.onerror = () => { if (--pending === 0) resolve(results); };
      });
    };

    if (wanted.size < BULK_FETCH_MIN) { keyedGet(); return; }

    // 量大才值得探測：若幾乎整個 store 都要用，一次 getAll 可省下數千次請求的事件派發
    const countReq = store.count();
    countReq.onsuccess = () => {
      if (wanted.size < countReq.result * BULK_FETCH_RATIO) { keyedGet(); return; }
      const req = store.getAll();
      req.onsuccess = () => resolve((req.result || []).filter(m => wanted.has(m.id)));
      req.onerror = () => resolve([]);
    };
    countReq.onerror = e => reject(e.target.error);
  });
}

async function idbGetAllMessageIds() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('messages', 'readonly');
    const req = tx.objectStore('messages').getAllKeys();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = e => reject(e.target.error);
  });
}

async function idbGetUnclassifiedMessages(classifiedSet) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('messages', 'readonly');
    const results = [];
    const req = tx.objectStore('messages').openCursor();
    req.onsuccess = e => {
      const cursor = e.target.result;
      if (!cursor) {
        results.sort((a, b) => (a.ts - b.ts) || (a.seq ?? 0) - (b.seq ?? 0));
        resolve(results);
        return;
      }
      if (!classifiedSet.has(cursor.value.id)) results.push(cursor.value);
      cursor.continue();
    };
    req.onerror = e => reject(e.target.error);
  });
}

async function idbDeleteMessages(ids) {
  if (!ids || ids.length === 0) return;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('messages', 'readwrite');
    const store = tx.objectStore('messages');
    ids.forEach(id => store.delete(id));
    tx.oncomplete = resolve;
    tx.onerror = e => reject(e.target.error);
  });
}

async function idbGetAllFingerprints() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('messages', 'readonly');
    const req = tx.objectStore('messages').index('fp').getAllKeys();
    req.onsuccess = () => resolve(new Set(req.result || []));
    req.onerror = e => reject(e.target.error);
  });
}

async function idbUpdateMessage(msg) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('messages', 'readwrite');
    tx.objectStore('messages').put(msg);
    tx.oncomplete = resolve;
    tx.onerror = e => reject(e.target.error);
  });
}

/* ── 啟動時從 IDB 讀取所有封面，填回 song.cover ── */
async function loadAllCoverUrls() {
  try {
    const records = await idbGetAllCovers();
    records.forEach(rec => {
      if (!(rec.blob instanceof Blob)) return;
      const song = S.songs.find(s => s.id === rec.songId);
      if (song) {
        song.cover = getCoverObjectUrl(rec.songId, rec.blob);
      }
    });
  } catch(e) { console.warn('loadAllCoverUrls:', e); }
}

async function loadAllMp3Urls() {
  try {
    const records = await idbGetAllMp3s();
    records.forEach(rec => {
      if (!(rec.blob instanceof Blob)) return;
      const song = S.songs.find(s => s.id === rec.songId);
      if (!song) return;
      revokeMp3Url(song.id);
      const objectUrl = URL.createObjectURL(rec.blob);
      _mp3UrlCache.set(song.id, objectUrl);
      song.mp3Url = objectUrl;
      song.mp3FileName = rec.fileName || '';
    });
  } catch(e) { console.warn('loadAllMp3Urls:', e); }
}

async function loadAllMemberPhotos() {
  try {
    await Promise.all(SS.members.map(async (m, idx) => {
      const keyById = m?.id ? `member_photo_${m.id}` : null;
      const legacyKey = `member_photo_${idx}`;
      let rec = null;
      if (keyById) rec = await idbGetAsset(keyById).catch(() => null);
      if (!rec) rec = await idbGetAsset(legacyKey).catch(() => null);
      if (!rec?.blob || !(rec.blob instanceof Blob)) return;
      // 釋放舊的 objectURL（若有）
      if (m.photo && m.photo.startsWith('blob:')) URL.revokeObjectURL(m.photo);
      SS.members[idx].photo = URL.createObjectURL(rec.blob);
      // 舊版索引 key 讀到後，遷移到穩定 id key
      if (keyById && !await idbGetAsset(keyById).catch(() => null)) {
        await idbPutAsset(keyById, rec.blob).catch(() => {});
      }
    }));
  } catch(e) { console.warn('loadAllMemberPhotos:', e); }
}

/* ── 備份檔格式（zip） ──
   備份存成 zip：manifest.json 放文字資料與每筆紀錄，圖片與 MP3 以原始二進位另存成檔案。
   舊版把媒體轉 base64 塞進單一 JSON，檔案大三分之一，匯出匯入時還得在記憶體裡組出
   一條巨大字串，MP3 一多手機分頁就會撐不住。媒體本身已是壓縮格式，zip 只打包不壓縮
   （STORE），讀取時可直接切出檔案片段，不必整包載入記憶體。舊的 .json 備份仍可匯入。 */
const BACKUP_MANIFEST = 'manifest.json';
const ZIP_MAX_U32 = 0xFFFFFFFF;
const ZIP_MAX_ENTRIES = 0xFFFF;

const _crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = _crcTable[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

// entries: [{ name, blob }] → zip Blob。Blob 片段直接當 parts，不複製進記憶體；
// 只為了算 CRC 逐檔讀一次。不支援 zip64，總量超過 4GB 或檔案數超過 65535 會丟錯。
async function buildZip(entries) {
  const enc = new TextEncoder();
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  if (entries.length > ZIP_MAX_ENTRIES) throw new Error(t('imp.zipTooLarge'));

  const parts = [];
  const central = [];
  let offset = 0;
  for (const { name, blob } of entries) {
    const nameBytes = enc.encode(name);
    const size = blob.size;
    if (offset + 30 + nameBytes.length + size > ZIP_MAX_U32) throw new Error(t('imp.zipTooLarge'));
    const crc = crc32(new Uint8Array(await blob.arrayBuffer()));
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true);   // local file header
    h.setUint16(4, 20, true);           // version needed
    h.setUint16(6, 0x0800, true);       // 檔名為 UTF-8
    h.setUint16(8, 0, true);            // STORE
    h.setUint16(10, dosTime, true);
    h.setUint16(12, dosDate, true);
    h.setUint32(14, crc, true);
    h.setUint32(18, size, true);
    h.setUint32(22, size, true);
    h.setUint16(26, nameBytes.length, true);
    parts.push(h.buffer, nameBytes, blob);
    central.push({ nameBytes, crc, size, offset });
    offset += 30 + nameBytes.length + size;
  }

  const cdStart = offset;
  for (const e of central) {
    const h = new DataView(new ArrayBuffer(46));
    h.setUint32(0, 0x02014b50, true);   // central directory header
    h.setUint16(4, 20, true);           // version made by
    h.setUint16(6, 20, true);           // version needed
    h.setUint16(8, 0x0800, true);
    h.setUint16(10, 0, true);
    h.setUint16(12, dosTime, true);
    h.setUint16(14, dosDate, true);
    h.setUint32(16, e.crc, true);
    h.setUint32(20, e.size, true);
    h.setUint32(24, e.size, true);
    h.setUint16(28, e.nameBytes.length, true);
    h.setUint32(42, e.offset, true);
    parts.push(h.buffer, e.nameBytes);
    offset += 46 + e.nameBytes.length;
  }
  if (offset > ZIP_MAX_U32) throw new Error(t('imp.zipTooLarge'));

  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);   // end of central directory
  end.setUint16(8, central.length, true);
  end.setUint16(10, central.length, true);
  end.setUint32(12, offset - cdStart, true);
  end.setUint32(16, cdStart, true);
  parts.push(end.buffer);
  return new Blob(parts, { type: 'application/zip' });
}

// 讀取 zip 目錄，回傳 (name, type) → Blob 的取檔函式。取出的是原檔的切片，
// 寫進 IDB 時才由瀏覽器實際讀取，不會整包載入記憶體。只支援本程式寫出的 STORE 格式。
async function openZip(file) {
  const fail = detail => new Error(`${t('msg.parseFail')} (${detail})`);
  const tailLen = Math.min(file.size, 22 + 0xFFFF);
  const tailBuf = await file.slice(file.size - tailLen).arrayBuffer();
  const tail = new DataView(tailBuf);
  let eocd = -1;
  for (let i = tailLen - 22; i >= 0; i--) {
    if (tail.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw fail('zip end record not found');
  const count    = tail.getUint16(eocd + 10, true);
  const cdSize   = tail.getUint32(eocd + 12, true);
  const cdOffset = tail.getUint32(eocd + 16, true);
  const cdBuf = await file.slice(cdOffset, cdOffset + cdSize).arrayBuffer();
  const cd = new DataView(cdBuf);
  const dec = new TextDecoder();
  const entries = new Map();
  let p = 0;
  for (let i = 0; i < count; i++) {
    if (p + 46 > cdSize || cd.getUint32(p, true) !== 0x02014b50) throw fail('bad zip directory');
    const nameLen = cd.getUint16(p + 28, true);
    const name = dec.decode(new Uint8Array(cdBuf, p + 46, nameLen));
    entries.set(name, {
      method     : cd.getUint16(p + 10, true),
      size       : cd.getUint32(p + 20, true),
      localOffset: cd.getUint32(p + 42, true)
    });
    p += 46 + nameLen + cd.getUint16(p + 30, true) + cd.getUint16(p + 32, true);
  }

  return async (name, type = '') => {
    const e = entries.get(name);
    if (!e) throw fail(`missing ${name}`);
    // 解壓縮後用其他工具重新壓縮過的 zip 會是 DEFLATE，這裡不支援
    if (e.method !== 0) throw new Error(t('imp.zipCompressed'));
    const h = new DataView(await file.slice(e.localOffset, e.localOffset + 30).arrayBuffer());
    if (h.getUint32(0, true) !== 0x04034b50) throw fail(`bad entry ${name}`);
    const start = e.localOffset + 30 + h.getUint16(26, true) + h.getUint16(28, true);
    return file.slice(start, start + e.size, type);
  };
}

async function isZipFile(file) {
  if (file.size < 4) return false;
  const sig = new DataView(await file.slice(0, 4).arrayBuffer()).getUint32(0, true);
  return sig === 0x04034b50;
}

const MEDIA_EXT = {
  'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif',
  'image/svg+xml': 'svg', 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3'
};

function base64ToBlob(base64, type) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let j = 0; j < binary.length; j++) bytes[j] = binary.charCodeAt(j);
  return new Blob([bytes], { type: type || 'application/octet-stream' });
}

/* ══════════════════════════════════════════════════════════
   Backup Reminder
══════════════════════════════════════════════════════════ */
// 資料只存在本機，使用者不主動匯出就沒有任何副本。距上次備份滿七天、
// 且期間確實有改動時，於頂部顯示一條可關閉的橫幅。沒改過就不打擾。
const BACKUP_STATE_KEY = 'tak_fire_backup_v1';
const BACKUP_REMIND_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

let _backupState = null;
let _backupReminderSnoozed = false;   // 按過「稍後」：本次啟動不再出現

function persistBackupState() {
  try { lsSet(BACKUP_STATE_KEY, JSON.stringify(_backupState)); } catch (_) {}
}

function getBackupState() {
  if (_backupState) return _backupState;
  try {
    const d = JSON.parse(lsGet(BACKUP_STATE_KEY) || 'null');
    if (d && typeof d.lastBackupAt === 'number') {
      _backupState = { lastBackupAt: d.lastBackupAt, dirty: !!d.dirty };
      return _backupState;
    }
  } catch (_) {}
  // 首次啟用此功能：把計時起點設為現在。既有使用者的資料可能放了很久，
  // 若從 0 起算會在更新後立刻跳出提醒，那不是他造成的，也不該由他承擔。
  _backupState = { lastBackupAt: Date.now(), dirty: false };
  persistBackupState();
  return _backupState;
}

// 由 saveNow() 呼叫。只在「乾淨 → 有改動」那一次寫入 localStorage，
// 不會讓每次存檔都多付一次寫入成本。
function markDataChanged() {
  const st = getBackupState();
  if (st.dirty) return;
  st.dirty = true;
  persistBackupState();
}

function markBackupDone() {
  const st = getBackupState();
  st.lastBackupAt = Date.now();
  st.dirty = false;
  persistBackupState();
  hideBackupReminder();
}

function backupReminderDue() {
  const st = getBackupState();
  if (!st.dirty) return false;                 // 沒有新改動就不需要再備份
  return Date.now() - st.lastBackupAt >= BACKUP_REMIND_AFTER_MS;
}

let _backupBannerRO = null;
function showBackupReminderIfDue() {
  if (_backupReminderSnoozed || !backupReminderDue()) return;
  const bar = $('backup-reminder');
  if (!bar) return;
  const days = Math.max(1, Math.floor((Date.now() - getBackupState().lastBackupAt) / DAY_MS));
  $('backup-reminder-text').textContent = tf('backup.remindText', days);
  if (bar.classList.contains('show')) return;   // 已在顯示：只更新文字（例如切換語言）
  bar.classList.add('show');
  // 橫幅高度會隨文字換行改變（窄螢幕、切英文），用 ResizeObserver 讓
  // body 的上內距跟著走，內容才不會被蓋住
  const sync = () => { document.body.style.paddingTop = `calc(44px + ${bar.offsetHeight}px)`; };
  sync();
  if (typeof ResizeObserver === 'function') {
    _backupBannerRO = new ResizeObserver(sync);
    _backupBannerRO.observe(bar);
  }
}

function hideBackupReminder() {
  const bar = $('backup-reminder');
  if (!bar) return;
  bar.classList.remove('show');
  if (_backupBannerRO) { _backupBannerRO.disconnect(); _backupBannerRO = null; }
  document.body.style.paddingTop = '';   // 交還給 CSS 的 44px
}

function snoozeBackupReminder() {
  _backupReminderSnoozed = true;
  hideBackupReminder();
}

async function exportAllData() {
  saveNow();
  // 紀錄裡的 Blob 換成 { file, type, size } 指向 zip 內的媒體檔
  const idb = {};
  const media = [];
  for (const name of IMPORT_STORES) {
    const records = await idbGetAll(name);
    idb[name] = records.map((rec, i) => {
      if (!(rec?.blob instanceof Blob)) return rec;
      const type = rec.blob.type || 'application/octet-stream';
      const file = `media/${name}/${i}.${MEDIA_EXT[type] || 'bin'}`;
      media.push({ name: file, blob: rec.blob });
      return { ...rec, blob: { file, type, size: rec.blob.size } };
    });
  }
  const payload = {
    app: 'take_fire',
    version: 3,
    exportedAt: new Date().toISOString(),
    localStorage: {
      tak_fire_v2: lsGet('tak_fire_v2'),
      tak_fire_v2_sys: lsGet('tak_fire_v2_sys'),
      tak_fire_site_v1: lsGet('tak_fire_site_v1')
    },
    idb
  };
  const _d = new Date();
  const stamp = `${toDateStr(_d)}_${String(_d.getHours()).padStart(2,'0')}-${String(_d.getMinutes()).padStart(2,'0')}`;
  const fileName = `take_fire_backup_${stamp}.zip`;
  const manifest = new Blob([JSON.stringify(payload)], { type: 'application/json' });
  const blob = await buildZip([{ name: BACKUP_MANIFEST, blob: manifest }, ...media]);

  const fallbackDownload = () => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 30000);
    // 走瀏覽器下載時無法確認使用者最後是否真的存檔，但這已是可得的最佳訊號
    markBackupDone();
    showModal({
      title: t('msg.exportDone'),
      desc: tf('msg.exportedFile', fileName),
      confirmText: t('msg.ok')
    });
  };

  // 優先使用 File System Access API（可選擇儲存位置）
  if (typeof window.showSaveFilePicker === 'function') {
    let handle;
    try {
      handle = await window.showSaveFilePicker({
        suggestedName: fileName,
        types: [{ description: t('backupDesc'), accept: { 'application/zip': ['.zip'] } }]
      });
    } catch (e) {
      if (e.name === 'AbortError') return; // 使用者取消
      // 沙箱／iframe／權限政策不允許時，退回 blob 下載
      if (e.name === 'NotAllowedError' || e.name === 'SecurityError') { fallbackDownload(); return; }
      throw e;
    }
    try {
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      markBackupDone();
      showModal({
        title: t('msg.exportDone'),
        desc: t('msg.exportSavedToPath'),
        confirmText: t('msg.ok')
      });
    } catch (e) {
      if (e.name === 'NotAllowedError' || e.name === 'SecurityError') { fallbackDownload(); return; }
      throw e;
    }
  } else {
    fallbackDownload();
  }
}

const IMPORT_STORES = ['posters', 'song_covers', 'app_assets', 'song_mp3s', 'messages', 'backgrounds'];

// 把各 store 的紀錄整理成可直接寫入 IDB 的形式（媒體還原成 Blob）。
// 舊 JSON 備份的媒體是 { base64 }，zip 備份是 { file }，由 resolveFile 從 zip 取出。
// 一定要在清空任何資料「之前」跑完：有任何一筆壞掉就在這裡丟錯，現有資料完全不動。
async function prepareStoreRecords(idbData, stores, resolveFile) {
  const prepared = {};
  for (const name of stores) {
    const records = idbData[name] ?? [];
    if (!Array.isArray(records)) throw new Error(`${t('msg.parseFail')} (${name})`);
    const out = [];
    for (const rec of records) {
      const b = rec?.blob;
      if (!b || b instanceof Blob || typeof b !== 'object') { out.push(rec); continue; }
      try {
        if (typeof b.base64 === 'string') {
          out.push({ ...rec, blob: base64ToBlob(b.base64, b.type) });
        } else if (typeof b.file === 'string' && resolveFile) {
          const blob = await resolveFile(b.file, b.type || 'application/octet-stream');
          if (typeof b.size === 'number' && blob.size !== b.size) throw new Error(`size mismatch: ${b.file}`);
          out.push({ ...rec, blob });
        } else {
          out.push(rec);
        }
      } catch (e) {
        throw new Error(`${t('msg.parseFail')} (${name}: ${e?.message || e})`);
      }
    }
    prepared[name] = out;
  }
  return prepared;
}

// 匯入前的現況快照，供失敗時回滾。媒體複製成記憶體中的 Blob：
// 回滾時原本的 IDB 紀錄已被清空，不能指望從 IDB 讀出的 Blob 參照在每個瀏覽器都還有效。
async function snapshotStores(stores) {
  const snap = {};
  for (const name of stores) {
    const records = await idbGetAll(name);
    for (let i = 0; i < records.length; i++) {
      const b = records[i]?.blob;
      if (b instanceof Blob) records[i] = { ...records[i], blob: new Blob([await b.arrayBuffer()], { type: b.type }) };
    }
    snap[name] = records;
  }
  return snap;
}

// 清空並寫入已整理好的紀錄（prepareStoreRecords 或 snapshotStores 的輸出）。
// 正式匯入與失敗後的回滾共用，確保兩者行為一致。
async function writeStoresFromRecords(prepared, stores) {
  const db = await openDB();

  await new Promise((resolve, reject) => {
    const tx = db.transaction(stores, 'readwrite');
    stores.forEach(name => tx.objectStore(name).clear());
    tx.oncomplete = resolve;
    tx.onerror = e => reject(e.target.error);
    tx.onabort = e => reject(e.target.error || new Error('tx aborted'));
  });

  for (const storeName of stores) {
    const records = prepared[storeName] || [];
    const BATCH = 50;
    for (let i = 0; i < records.length; i += BATCH) {
      const batch = records.slice(i, i + BATCH);
      await new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        batch.forEach(rec => store.put(rec));
        tx.oncomplete = resolve;
        tx.onerror = e => reject(e.target.error);
        tx.onabort = e => reject(e.target.error || new Error('tx aborted'));
      });
    }
  }
}

async function readBackupPayload(file) {
  if (await isZipFile(file)) {
    const getFile = await openZip(file);
    let payload;
    try {
      payload = JSON.parse(await (await getFile(BACKUP_MANIFEST)).text());
    } catch (e) {
      console.error('importAllData manifest parse failed:', e);
      throw new Error(`${t('msg.parseFail')} (${e?.name || ''}: ${e?.message || e})`);
    }
    return { payload, resolveFile: getFile };
  }
  // 舊版 .json 備份
  try {
    let text = await file.text();
    // 去除 UTF-8 BOM（部分編輯器另存會加上，會讓 JSON.parse 在第一個字元失敗）
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    return { payload: JSON.parse(text), resolveFile: null };
  } catch(e) {
    console.error('importAllData parse failed:', e);
    throw new Error(`${t('msg.parseFail')} (${e?.name || ''}: ${e?.message || e})`);
  }
}

async function importAllData(file) {
  if (file && file.size === 0) {
    throw new Error(t('msg.emptyFile'));
  }
  const { payload, resolveFile } = await readBackupPayload(file);

  if (payload?.app !== 'take_fire') {
    throw new Error(t('msg.notTakeFire'));
  }

  // 先把備份內容全部整理、驗證完，才開始動現有資料
  const prepared = await prepareStoreRecords(payload.idb || {}, IMPORT_STORES, resolveFile);

  const lsKeys = ['tak_fire_v2', 'tak_fire_v2_sys', 'tak_fire_site_v1'];

  // 匯入前先備份目前的 localStorage 與 IDB 內容，若寫入中途失敗就整批還原，
  // 避免出現「部分 store 已被新資料覆蓋、部分還沒寫入」的半新半舊毀損狀態。
  const lsBackup = {};
  lsKeys.forEach(k => { lsBackup[k] = lsGet(k); });
  const idbBackup = await snapshotStores(IMPORT_STORES);

  try {
    // 1. 清空並寫回 localStorage
    lsKeys.forEach(k => lsRemove(k));
    const ls = payload.localStorage || {};
    if (ls.tak_fire_v2)      lsSet('tak_fire_v2',      ls.tak_fire_v2);
    if (ls.tak_fire_v2_sys)  lsSet('tak_fire_v2_sys',  ls.tak_fire_v2_sys);
    if (ls.tak_fire_site_v1) lsSet('tak_fire_site_v1', ls.tak_fire_site_v1);

    // 2. 清空並還原 IDB
    await writeStoresFromRecords(prepared, IMPORT_STORES);
  } catch (e) {
    console.error('importAllData failed, rolling back to pre-import data:', e);
    try {
      lsKeys.forEach(k => { if (lsBackup[k] == null) lsRemove(k); else lsSet(k, lsBackup[k]); });
      await writeStoresFromRecords(idbBackup, IMPORT_STORES);
      e.message = `${e.message}\n${t('imp.rolledBack')}`;
    } catch (rollbackErr) {
      console.error('importAllData: rollback also failed, data may be inconsistent', rollbackErr);
      e.message = `${e.message}\n${t('imp.rollbackFailed')}`;
    }
    throw e;
  }
}

/* ══════════════════════════════════════════════════════════
   Utilities
══════════════════════════════════════════════════════════ */
const $ = id => document.getElementById(id);

/* ══════════════════════════════════════════════════════════
   i18n — Interface Language
══════════════════════════════════════════════════════════ */
const I18N = {
  'zh-TW': {
    'settings.title': '系統設定',
    'settings.language': '介面語言',
    'settings.theme': '主題曲風',
    'settings.font': '介面字型',
    'settings.font.system': '系統無襯線 (預設)',
    'settings.font.serif': '明體 / 襯線',
    'settings.font.rounded': '圓體',
    'settings.fontSize': '字體大小',
    'settings.done': '完成',
    'theme.jazz': 'Jazz (深色)',
    'theme.love': 'Love song (粉色)',
    'theme.white': 'White Noise (淺色)',
    'theme.punk': 'Punk (霓虹)',
    'topbar.import': '匯入',
    'topbar.export': '匯出',
    'topbar.importTip': '匯入備份',
    'topbar.exportTip': '匯出全部備份',
    'topbar.settingsTip': '系統設定',
    'left.upload': '匯入 .txt 檔案',
    'left.avatarChar': '樂團',
    'left.avatarPlayer': '玩家',
    'left.bg': '背景',
    'left.avatarCharTip': '點擊更換樂團頭像',
    'left.avatarPlayerTip': '點擊更換玩家頭像',
    'left.bgTip': '點擊管理對話背景',
    'bg.title': '對話背景圖庫',
    'bg.desc': '可儲存多張背景圖，點擊縮圖即可切換',
    'bg.none': '無背景',
    'bg.add': '新增背景',
    'bg.deleteTip': '刪除此背景',
    'left.addFolder': '新增資料夾',
    'left.sortToggle': '切換排序',
    'left.trash': '拖曳至此刪除',
    'mid.fullscreenTip': 'Fullscreen 中間欄',
    'mid.defaultTitle': '未歸類故事',
    'mid.scrollTop': '回到頂部',
    'mid.scrollBottom': '回到底部',
    'right.fullscreenTip': 'Fullscreen 右欄',
    'right.tabEvents': '事件',
    'right.tabSongs': '樂團歌單',
    'cal.toggleTip': '點擊展開/收起行事曆',
    'cal.sun': '日',
    'cal.mon': '一',
    'cal.tue': '二',
    'cal.wed': '三',
    'cal.thu': '四',
    'cal.fri': '五',
    'cal.sat': '六',
    'modal.confirm': '確認',
    'modal.cancel': '取消',
    'modal.save': '儲存',
    'modal.delete': '刪除',
    'menu.rename': '重新命名',
    'menu.icon': '更改圖示',
    'menu.exportTxt': '匯出 TXT',
    'menu.deleteFolder': '刪除資料夾',
    'iconPicker.title': '更改子資料夾圖示',
    'site.photo': 'Photo',
    'site.music': 'MUSIC',
    'site.tour': 'Tour',
    'site.about': 'Profile',
    'site.addSingle': '上架單曲',
    'site.addTour': '新增工作行程',
    'nb.title': 'CG 設定筆記',
    'nb.placeholder': '輸入此角色的 CG 圖片設定…',
    'nb.copy': '複製',
    'nb.copied': '已複製',
    'nb.saved': '已自動儲存',
    'nb.chars': '字',
    'tour.date': '日期',
    'tour.work': '工作內容',
    'tour.place': '地點',
    'tour.time': '時間',
    'tour.status': '狀態',
    'igm.captionPh': '新增說明文字…',
    'igm.chapterPh': '— 選擇章節 —',
    'pm.captionPh': '說明文字…',
    'pm.uploadHint': '點擊上傳圖片',
    'tm.titleAdd': '新增工作行程',
    'tm.titleEdit': '編輯工作行程',
    'tm.timePh': '例：19:00 或全天',
    'tm.titlePh': 'MV 拍攝、錄音、演出…',
    'tm.locPh': '錄音室、場地名稱…',
    'tm.notePh': '其他細節…',
    'tm.note': '備註',
    'tm.linkChapter': '連結故事章節（選填）',
    'tm.notDone': '— 尚未完成 —',
    'tm.notLinked': '— 尚未連結章節 —',
    'tm.titleAddOpt': '＋ 新增歌曲',
    'tm.deleted': '（已刪除的章節）',
    'msg.ok': '確定',
    'msg.edited': '編輯內容',
    'msg.editingFor': '正在編輯 %s 的對話：',
    'msg.confirmDelete': '確認刪除',
    'msg.deleteN': '確定要刪除選取的 %s 則訊息嗎？\n此操作無法復原。',
    'msg.exportDone': '匯出完成',
    'msg.exportSavedToPath': '備份已儲存至您選擇的位置。\n包含文字資料、圖片與 MP3。',
    'msg.exportedFile': '已匯出備份檔：%s\n包含文字資料、圖片與 MP3。',
    'msg.parseFail': '無法解析備份檔，請確認檔案格式正確。',
    'msg.notTakeFire': '這不是 Take Fire 的備份檔。',
    'msg.storageFull': '儲存空間已滿',
    'msg.storageFullDesc': '本機儲存空間（localStorage）已達上限，最近的變更未能寫入。\n建議：刪除部分資料夾、清除舊筆記，或匯出備份後重啟。',
    'msg.mediaStorageFull': '媒體儲存空間已滿',
    'msg.mediaStorageFullDesc': '瀏覽器儲存空間（IndexedDB）已達上限，剛才上傳的照片、封面或 MP3 可能未能存檔，重新整理後會消失。\n建議：\n1. 立即匯出備份，確認目前資料已保存；\n2. 刪除部分舊照片、封面或音檔以騰出空間；\n3. 確認硬碟未滿，且未使用無痕／隱私瀏覽模式（該模式的儲存空間通常小很多）。',
    'msg.gotIt': '我知道了',
    'msg.openExtMusic': '開啟外部音樂連結',
    'msg.loading': '載入中…',
    'msg.parsing': '正在解析並寫入資料，請稍候…',
    'msg.uploadEmpty': '請點擊左側「上傳 .txt 檔案」開始整理',
    'msg.moveFolder': '📖 移動「%s」...',
    'msg.moveMsgs': '💬 移動 %s 則訊息',
    'msg.deleteMsgsN': '刪除 %s 則訊息',
    'cat.life': '日常',
    'cat.date': '約會',
    'cat.work': '工作',
    'cat.plot': '其他',
    'folderIcon.file': '預設',
    'folderIcon.work': '工作',
    'folder.expand': '展開',
    'folder.collapse': '摺疊',
    'folder.more': '更多選項',
    'folder.exportOrOrg': '匯出或整理',
    'folder.rename': '重新命名',
    'folder.renamePrompt': '請輸入新的資料夾名稱：',
    'folder.cannotExport': '無法匯出',
    'folder.noContent': '該資料夾沒有任何對話可供匯出。',
    'folder.exportSeparate': '個別匯出（每個資料夾各自產生一個 TXT 檔）',
    'folder.delete': '刪除資料夾',
    'folder.deleteConfirm': '確定要刪除「%s」嗎？\n資料夾內的訊息將回到未歸類。',
    'folder.uncategorized': '未歸類故事',
    'folder.withChildren': '含子章節',
    'folder.namePh': '名稱…',
    'folder.enterEsc': 'Enter 確認 / Esc 取消',
    'right.calendar': '行事曆',
    'right.selectFolder': '請先選擇左側資料夾<br>以新增專屬事件筆記',
    'right.eventSuffix': '事件',
    'right.addEvent': '新增事件紀錄',
    'event.namePh': '事件名稱…',
    'event.copyEvent': '複製事件',
    'event.unnamed': '未命名事件',
    'event.dateLabel': '日期',
    'event.catLabel': '分類',
    'event.endDate': '結束日期 (選填)',
    'event.bodyPh': '記錄細節、想法……',
    'event.editTitle': '編輯內容',
    'event.deleteTip': '刪除事件',
    'event.moreN': '還有 %s 個事件',
    'cal.yearMonth': '%s年 %s月',
    'song.addSong': '＋ 新增歌曲',
    'song.move': '🎵 移動「%s」...',
    'song.unnamed': '未命名歌曲',
    'song.unnamedSingle': '未命名單曲',
    'song.editSong': '編輯歌曲',
    'song.newSong': '新增歌曲',
    'song.audioSource': 'AUDIO SOURCE (擇一輸入)',
    'song.urlPh': '輸入音樂連結...',
    'song.clearUrl': '✕ 清除網址',
    'song.importMp3': '匯入 MP3',
    'song.clearMp3': '✕ 清除 MP3',
    'song.importedAs': '已匯入：%s',
    'song.mp3File': 'MP3 檔案',
    'song.notImportedMp3': '尚未匯入 MP3',
    'song.importCover': '匯入封面圖',
    'song.importedCover': '已匯入封面',
    'song.notImportedCover': '尚未匯入封面',
    'song.titlePh': '輸入曲名',
    'song.collapse': '摺疊',
    'song.lyricPh': '在此貼上或輸入歌詞...',
    'song.expandLyric': '展開歌詞',
    'song.collapseLyric': '收起歌詞',
    'song.delete': '刪除歌曲',
    'song.editTip': '編輯歌曲',
    'song.delTip': '刪除歌曲',
    'song.dblToEdit': '雙擊可編輯歌曲',
    'song.empty': '尚無歌曲，點擊右上角 [+] 新增',
    'song.changeCover': '更換封面',
    'song.vinylTip': '點擊黑膠展開／收合面板',
    'song.uploadedMp3': '已上傳 MP3',
    'song.uploadMp3': '上傳 MP3',
    'song.loop': '循環播放',
    'song.loopOn': '循環播放：開',
    'song.volume': '音量',
    'song.mute': '靜音',
    'song.unmute': '取消靜音',
    'song.uploadedCover': '已上傳封面',
    'song.uploadedAs': '已上傳：%s',
    'imp.exportFail': '匯出失敗',
    'imp.exportFailDesc': '備份匯出失敗：%s',
    'imp.importBackup': '匯入備份',
    'imp.importWarn': '匯入備份將完整覆蓋現有所有資料（對話、歌曲、圖片等），此操作無法復原。\n\n確定要繼續嗎？',
    'imp.pickFile': '選擇備份檔',
    'imp.importing': '匯入中…',
    'imp.importDone': '匯入完成',
    'imp.importDoneDesc': '備份已成功還原。即將重新載入應用程式。',
    'imp.importFail': '匯入失敗',
    'imp.importFailDesc': '還原失敗：%s',
    'imp.rolledBack': '（原本的資料已自動還原，未受影響。）',
    'imp.rollbackFailed': '（警告：自動還原也失敗，網頁內目前的資料可能不完整。你的備份檔案本身不受影響，請重新整理頁面確認資料狀況，並可用同一份備份檔案重新匯入。）',
    'imp.import': '匯入',
    'mid.restoreMid': '還原中間欄',
    'mid.restoreRight': '還原右欄',
    'role.character': '角色',
    'role.player': '玩家',
    'role.modify': '修改%s名稱',
    'role.modifyDesc': '輸入新的%s顯示名稱',
    'poster.edit': '編輯',
    'poster.uploadCG': '上傳 CG',
    'poster.linkChapterOpt': '— 連結故事章節（選填）—',
    'backup.remindText': '距上次備份已 %s 天，期間有新的改動。資料只存在這台裝置，建議現在匯出一份。',
    'backup.exportNow': '立即匯出',
    'backup.later': '稍後',
    'search.open': '搜尋訊息',
    'search.title': '全文搜尋',
    'search.placeholder': '搜尋訊息內容…',
    'search.currentOnly': '只搜尋目前資料夾',
    'search.hint': '輸入關鍵字開始搜尋。以空格分隔多個關鍵字，會找出全部都出現的訊息。',
    'search.searching': '搜尋中…',
    'search.noResult': '找不到符合的訊息',
    'search.resultCount': '找到 %s 則',
    'search.truncated': '結果過多，僅顯示前 %s 則',
    'search.scopeEmpty': '目前沒有選取資料夾，已改為搜尋全部',
    'err.title': '發生未預期的錯誤',
    'err.desc': '程式剛才出錯了，接下來的自動儲存可能不會生效。建議先用右上角的「匯出」備份一份資料，再重新整理頁面。',
    // 純符號／純圖示控制項的可存取名稱（畫面上不顯示，供螢幕閱讀器朗讀）
    'a11y.close': '關閉',
    'a11y.prevImage': '上一張',
    'a11y.nextImage': '下一張',
    'a11y.removeChapter': '移除章節連結',
    'a11y.openChapter': '開啟連結的章節',
    'tour.unnamedWork': '未命名工作',
    'tour.empty': '尚無工作行程',
    'tour.emptyHint': '點擊「新增工作行程」開始記錄',
    'tour.done': '已完成',
    'tour.tbd': '待定',
    'tour.upcoming': '即將到來',
    'tour.edit': '編輯',
    'tour.toChapter': '前往章節',
    'tour.delNeedChapter': '刪除需前往章節',
    'member.unnamed': '成員 A',
    'member.bio': '待填入簡介文字',
    'member.photoTip': '點擊更換照片',
    'member.nameTip': '點擊編輯名稱',
    'member.roleTip': '點擊編輯職位',
    'member.bioTip': '點擊編輯簡介',
    'backupDesc': 'Take Fire 備份檔（zip）',
    'imp.zipTooLarge': '資料總量超過 4GB，無法打包成單一備份檔。',
    'imp.zipCompressed': '這個 zip 被其他工具重新壓縮過，無法直接匯入。請使用原本匯出的備份檔。',
    'msg.emptyFile': '備份檔是空的（0 bytes），可能是先前以「另存新檔」覆蓋既有檔案但寫入被擋下所造成。請改選另一份備份檔。',
  },
  'en': {
    'settings.title': 'Settings',
    'settings.language': 'Language',
    'settings.theme': 'Theme',
    'settings.font': 'Font',
    'settings.font.system': 'System Sans (default)',
    'settings.font.serif': 'Serif',
    'settings.font.rounded': 'Rounded',
    'settings.fontSize': 'Font Size',
    'settings.done': 'Done',
    'theme.jazz': 'Jazz (Dark)',
    'theme.love': 'Love Song (Pink)',
    'theme.white': 'White Noise (Light)',
    'theme.punk': 'Punk (Neon)',
    'topbar.import': 'Import',
    'topbar.export': 'Export',
    'topbar.importTip': 'Import backup',
    'topbar.exportTip': 'Export all backups',
    'topbar.settingsTip': 'Settings',
    'left.upload': 'Import .txt file',
    'left.avatarChar': 'Band',
    'left.avatarPlayer': 'Player',
    'left.bg': 'Background',
    'left.avatarCharTip': 'Click to change band avatar',
    'left.avatarPlayerTip': 'Click to change player avatar',
    'left.bgTip': 'Click to manage chat backgrounds',
    'bg.title': 'Chat Backgrounds',
    'bg.desc': 'Save multiple background images and tap a thumbnail to switch.',
    'bg.none': 'None',
    'bg.add': 'Add',
    'bg.deleteTip': 'Delete this background',
    'left.addFolder': 'New folder',
    'left.sortToggle': 'Toggle sort',
    'left.trash': 'Drag here to delete',
    'mid.fullscreenTip': 'Fullscreen middle column',
    'mid.defaultTitle': 'Uncategorized stories',
    'mid.scrollTop': 'Scroll to top',
    'mid.scrollBottom': 'Scroll to bottom',
    'right.fullscreenTip': 'Fullscreen right column',
    'right.tabEvents': 'Events',
    'right.tabSongs': 'Setlist',
    'cal.toggleTip': 'Click to expand/collapse calendar',
    'cal.sun': 'Sun',
    'cal.mon': 'Mon',
    'cal.tue': 'Tue',
    'cal.wed': 'Wed',
    'cal.thu': 'Thu',
    'cal.fri': 'Fri',
    'cal.sat': 'Sat',
    'modal.confirm': 'Confirm',
    'modal.cancel': 'Cancel',
    'modal.save': 'Save',
    'modal.delete': 'Delete',
    'menu.rename': 'Rename',
    'menu.icon': 'Change icon',
    'menu.exportTxt': 'Export TXT',
    'menu.deleteFolder': 'Delete folder',
    'iconPicker.title': 'Change subfolder icon',
    'site.photo': 'Photo',
    'site.music': 'MUSIC',
    'site.tour': 'Tour',
    'site.about': 'Profile',
    'site.addSingle': 'Add single',
    'site.addTour': 'Add tour date',
    'nb.title': 'CG settings notes',
    'nb.placeholder': 'CG image settings for this character…',
    'nb.copy': 'Copy',
    'nb.copied': 'Copied',
    'nb.saved': 'Auto-saved',
    'nb.chars': 'chars',
    'tour.date': 'Date',
    'tour.work': 'Event',
    'tour.place': 'Venue',
    'tour.time': 'Time',
    'tour.status': 'Status',
    'igm.captionPh': 'Add a caption…',
    'igm.chapterPh': '— Select chapter —',
    'pm.captionPh': 'Caption…',
    'pm.uploadHint': 'Click to upload image',
    'tm.titleAdd': 'Add tour date',
    'tm.titleEdit': 'Edit tour date',
    'tm.timePh': 'e.g. 19:00 or All day',
    'tm.titlePh': 'MV shoot, recording, show…',
    'tm.locPh': 'Studio, venue name…',
    'tm.notePh': 'Other details…',
    'tm.note': 'Notes',
    'tm.linkChapter': 'Link story chapter (optional)',
    'tm.notDone': '— Not yet linked —',
    'tm.notLinked': '— No chapter linked —',
    'tm.titleAddOpt': '＋ Add song',
    'tm.deleted': '(Deleted chapter)',
    'msg.ok': 'OK',
    'msg.edited': 'Edit content',
    'msg.editingFor': 'Editing %s’s message:',
    'msg.confirmDelete': 'Confirm delete',
    'msg.deleteN': 'Delete %s selected message(s)?\nThis cannot be undone.',
    'msg.exportDone': 'Export complete',
    'msg.exportSavedToPath': 'Backup saved to your chosen location.\nIncludes text data, images and MP3s.',
    'msg.exportedFile': 'Exported backup: %s\nIncludes text data, images and MP3s.',
    'msg.parseFail': 'Could not parse backup; please check the file format.',
    'msg.notTakeFire': 'This is not a Take Fire backup file.',
    'msg.storageFull': 'Storage full',
    'msg.storageFullDesc': 'Local storage (localStorage) is full; recent changes were not saved.\nSuggestion: delete some folders, clear old notes, or export a backup and restart.',
    'msg.mediaStorageFull': 'Media storage full',
    'msg.mediaStorageFullDesc': "Browser storage (IndexedDB) is full; the photo, cover, or MP3 you just uploaded may not have been saved and could disappear after a reload.\nSuggestions:\n1. Export a backup now to make sure your current data is preserved;\n2. Delete some old photos, covers, or audio files to free up space;\n3. Make sure your disk isn't full, and avoid private/incognito browsing (which usually has a much smaller storage limit).",
    'msg.gotIt': 'Got it',
    'msg.openExtMusic': 'Open external music link',
    'msg.loading': 'Loading…',
    'msg.parsing': 'Parsing and saving data, please wait…',
    'msg.uploadEmpty': 'Click “Import .txt file” on the left to begin',
    'msg.moveFolder': '📖 Moving “%s”…',
    'msg.moveMsgs': '💬 Moving %s messages',
    'msg.deleteMsgsN': 'Delete %s messages',
    'cat.life': 'Daily',
    'cat.date': 'Date',
    'cat.work': 'Work',
    'cat.plot': 'Other',
    'folderIcon.file': 'Default',
    'folderIcon.work': 'Work',
    'folder.expand': 'Expand',
    'folder.collapse': 'Collapse',
    'folder.more': 'More',
    'folder.exportOrOrg': 'Export or organize',
    'folder.rename': 'Rename',
    'folder.renamePrompt': 'Enter a new folder name:',
    'folder.cannotExport': 'Cannot export',
    'folder.noContent': 'This folder has no conversations to export.',
    'folder.exportSeparate': 'Export separately (one TXT file per folder)',
    'folder.delete': 'Delete folder',
    'folder.deleteConfirm': 'Delete “%s”?\nMessages will return to Uncategorized.',
    'folder.uncategorized': 'Uncategorized',
    'folder.withChildren': 'incl. sub-chapters',
    'folder.namePh': 'Name…',
    'folder.enterEsc': 'Enter to confirm / Esc to cancel',
    'right.calendar': 'Calendar',
    'right.selectFolder': 'Select a folder on the left<br>to add event notes',
    'right.eventSuffix': 'Events',
    'right.addEvent': 'Add event',
    'event.namePh': 'Event name…',
    'event.copyEvent': 'Copy event',
    'event.unnamed': 'Untitled event',
    'event.dateLabel': 'Date',
    'event.catLabel': 'Category',
    'event.endDate': 'End date (optional)',
    'event.bodyPh': 'Details, thoughts……',
    'event.editTitle': 'Edit content',
    'event.deleteTip': 'Delete event',
    'event.moreN': '+%s more',
    'cal.yearMonth': '%s %s',
    'song.addSong': '＋ Add song',
    'song.move': '🎵 Moving “%s”…',
    'song.unnamed': 'Untitled',
    'song.unnamedSingle': 'Untitled single',
    'song.editSong': 'Edit song',
    'song.newSong': 'New song',
    'song.audioSource': 'AUDIO SOURCE (pick one)',
    'song.urlPh': 'Enter music URL…',
    'song.clearUrl': '✕ Clear URL',
    'song.importMp3': 'Import MP3',
    'song.clearMp3': '✕ Clear MP3',
    'song.importedAs': 'Imported: %s',
    'song.mp3File': 'MP3 file',
    'song.notImportedMp3': 'No MP3 imported',
    'song.importCover': 'Import cover',
    'song.importedCover': 'Cover imported',
    'song.notImportedCover': 'No cover imported',
    'song.titlePh': 'Song title',
    'song.collapse': 'Collapse',
    'song.lyricPh': 'Paste or type lyrics here…',
    'song.expandLyric': 'Show lyrics',
    'song.collapseLyric': 'Hide lyrics',
    'song.delete': 'Delete song',
    'song.editTip': 'Edit song',
    'song.delTip': 'Delete song',
    'song.dblToEdit': 'Double-click to edit',
    'song.empty': 'No songs — click [+] in the top right to add',
    'song.changeCover': 'Change cover',
    'song.vinylTip': 'Click vinyl to expand/collapse',
    'song.uploadedMp3': 'MP3 uploaded',
    'song.uploadMp3': 'Upload MP3',
    'song.loop': 'Loop',
    'song.loopOn': 'Loop: on',
    'song.volume': 'Volume',
    'song.mute': 'Mute',
    'song.unmute': 'Unmute',
    'song.uploadedCover': 'Cover uploaded',
    'song.uploadedAs': 'Uploaded: %s',
    'imp.exportFail': 'Export failed',
    'imp.exportFailDesc': 'Backup export failed: %s',
    'imp.importBackup': 'Import backup',
    'imp.importWarn': 'Importing a backup will overwrite ALL existing data (messages, songs, images, etc). This cannot be undone.\n\nContinue?',
    'imp.pickFile': 'Choose backup',
    'imp.importing': 'Importing…',
    'imp.importDone': 'Import complete',
    'imp.importDoneDesc': 'Backup restored. The app will reload.',
    'imp.importFail': 'Import failed',
    'imp.importFailDesc': 'Restore failed: %s',
    'imp.rolledBack': '(Your previous data was automatically restored and is unaffected.)',
    'imp.rollbackFailed': "(Warning: automatic restore also failed, so the data saved by this app may be incomplete. Your backup file itself is unaffected — reload the page to check the current state, then re-import the same backup file if needed.)",
    'imp.import': 'Import',
    'mid.restoreMid': 'Restore middle column',
    'mid.restoreRight': 'Restore right column',
    'role.character': 'Character',
    'role.player': 'Player',
    'role.modify': 'Edit %s name',
    'role.modifyDesc': 'Enter new display name for %s',
    'poster.edit': 'Edit',
    'poster.uploadCG': 'Upload CG',
    'poster.linkChapterOpt': '— Link story chapter (optional) —',
    'backup.remindText': 'Last backup was %s days ago and there have been changes since. Your data lives only on this device — export a copy now.',
    'backup.exportNow': 'Export now',
    'backup.later': 'Later',
    'search.open': 'Search messages',
    'search.title': 'Search',
    'search.placeholder': 'Search message text…',
    'search.currentOnly': 'Current folder only',
    'search.hint': 'Type to search. Separate multiple keywords with spaces to find messages containing all of them.',
    'search.searching': 'Searching…',
    'search.noResult': 'No matching messages',
    'search.resultCount': '%s results',
    'search.truncated': 'Too many results — showing the first %s',
    'search.scopeEmpty': 'No folder selected; searching all folders instead',
    'err.title': 'Something went wrong',
    'err.desc': 'An unexpected error occurred and autosave may no longer be working. Please use “Export” in the top right to back up your data, then reload the page.',
    // Accessible names for icon-only controls (not rendered visually)
    'a11y.close': 'Close',
    'a11y.prevImage': 'Previous image',
    'a11y.nextImage': 'Next image',
    'a11y.removeChapter': 'Remove chapter link',
    'a11y.openChapter': 'Open linked chapter',
    'tour.unnamedWork': 'Untitled event',
    'tour.empty': 'No tour dates yet',
    'tour.emptyHint': 'Click “Add tour date” to begin',
    'tour.done': 'Done',
    'tour.tbd': 'TBD',
    'tour.upcoming': 'Upcoming',
    'tour.edit': 'Edit',
    'tour.toChapter': 'Go to chapter',
    'tour.delNeedChapter': 'Delete from chapter',
    'member.unnamed': 'Member A',
    'member.bio': 'Bio placeholder',
    'member.photoTip': 'Click to change photo',
    'member.nameTip': 'Click to edit name',
    'member.roleTip': 'Click to edit role',
    'member.bioTip': 'Click to edit bio',
    'backupDesc': 'Take Fire backup (zip)',
    'imp.zipTooLarge': 'Total data exceeds 4GB and cannot be packed into a single backup file.',
    'imp.zipCompressed': 'This zip was re-compressed by another tool and cannot be imported. Use the originally exported backup.',
    'msg.emptyFile': 'The backup file is empty (0 bytes). This usually means a previous “Save As” overwrote the file but the write was blocked. Pick a different backup.',
  }
};

let _curLang = 'zh-TW';

function t(key, fallback) {
  const dict = I18N[_curLang] || I18N['zh-TW'];
  if (dict && Object.prototype.hasOwnProperty.call(dict, key)) return dict[key];
  if (I18N['zh-TW'] && Object.prototype.hasOwnProperty.call(I18N['zh-TW'], key)) return I18N['zh-TW'][key];
  return fallback != null ? fallback : key;
}

function tf(key, ...args) {
  let s = t(key, null);
  if (s == null) s = key;
  let i = 0;
  return s.replace(/%s/g, () => (i < args.length ? String(args[i++]) : '%s'));
}

function applyI18n(root) {
  const scope = root || document;
  scope.querySelectorAll('[data-i18n]').forEach(el => {
    const k = el.getAttribute('data-i18n');
    const v = t(k, null);
    if (v != null) el.textContent = v;
  });
  scope.querySelectorAll('[data-i18n-title]').forEach(el => {
    const k = el.getAttribute('data-i18n-title');
    const v = t(k, null);
    if (v != null) el.setAttribute('title', v);
  });
  scope.querySelectorAll('[data-i18n-aria]').forEach(el => {
    const k = el.getAttribute('data-i18n-aria');
    const v = t(k, null);
    if (v != null) el.setAttribute('aria-label', v);
  });
  scope.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const k = el.getAttribute('data-i18n-placeholder');
    const v = t(k, null);
    if (v != null) el.setAttribute('placeholder', v);
  });
  try { document.documentElement.setAttribute('lang', _curLang); } catch(_) {}
}

function setLanguage(lang) {
  if (!I18N[lang]) lang = 'zh-TW';
  _curLang = lang;
  applyI18n();
}

const _memStorageFallback = new Map();
let _lsAvailable = null;
function getSafeLocalStorage() {
  if (_lsAvailable === false) return null;
  try {
    const s = window.localStorage;
    const probeKey = '__tf_ls_probe__';
    s.setItem(probeKey, '1');
    s.removeItem(probeKey);
    _lsAvailable = true;
    return s;
  } catch (_) {
    _lsAvailable = false;
    return null;
  }
}
function lsGet(key) {
  const s = getSafeLocalStorage();
  if (s) {
    try { return s.getItem(key); } catch (_) {}
  }
  return _memStorageFallback.has(key) ? _memStorageFallback.get(key) : null;
}
function lsSet(key, value) {
  const s = getSafeLocalStorage();
  if (s) {
    s.setItem(key, value);
    return true;
  }
  _memStorageFallback.set(key, String(value));
  return false;
}
function lsRemove(key) {
  const s = getSafeLocalStorage();
  if (s) {
    try { s.removeItem(key); } catch (_) {}
  }
  _memStorageFallback.delete(key);
}

function uid() {
  // 優先使用 crypto.randomUUID（現代瀏覽器都支援），避免批次匯入時碰撞
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback：時間戳 + 12 字元 random
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9) + Math.random().toString(36).slice(2, 7);
}

// 本地時區的 YYYY-MM-DD（不可用 toISOString，會有 UTC 時區位移）
function toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// 純符號（⋯ ＋ ✎ ✕）或純圖示的按鈕，畫面上的字元對螢幕閱讀器沒有意義。
// title 雖然會被當成可存取名稱的備援，但觸控裝置上不會顯示、各家螢幕閱讀器
// 處理也不一致，所以一律同時補上 aria-label。
function setBtnLabel(el, label) {
  el.title = label;
  el.setAttribute('aria-label', label);
}

// 讓可點擊的非 button 元素支援鍵盤操作（Tab 聚焦、Enter / Space 觸發 click）
function addKeyActivation(el) {
  el.setAttribute('role', 'button');
  el.tabIndex = 0;
  el.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.click(); }
  });
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escAttr(s) {
  return esc(s).replace(/"/g, '&quot;');
}

// 白名單檢查：僅允許 http/https/mailto 與 blob:/data: 影音 URL
// 任何 javascript:、vbscript:、file: 等 schema 一律改回 # 以避免 XSS
function safeUrl(s) {
  if (typeof s !== 'string') return '#';
  const trimmed = s.trim();
  if (!trimmed) return '#';
  // 相對路徑（不含 schema）視為安全
  if (!/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed;
  if (/^(https?|mailto|blob|data):/i.test(trimmed)) return trimmed;
  return '#';
}

/* ══════════════════════════════════════════════════════════
   State
══════════════════════════════════════════════════════════ */
const S = {
  allMessages : [],   // 當前 view 的訊息快取（不再是全域資料源）
  msgCount    : 0,    // 未歸類訊息數量（async 更新）
  folders     : [],   
  songs       : [],   
  nameOrder   : [],   
  view : null,        
  folderSort : 'desc', 
  collapsedFolders : new Set(),
  rightTab: 'events', 
  calDate : new Date(), 
  calendarCollapsed: false,
  noteEditId  : null, // 當前正在展開編輯的 note id
  selAnchor : null,   
  selEnd    : null,   
  selSet    : new Set(),
  isDragging   : false,
  dragTimer    : null,
  dragType     : 'msg',      
  dragFolderId : null,       
  dragSongIdx  : null,
  mx : 0, my : 0,
  avatarChar   : null,
  avatarPlayer : null,
  bgImage      : null,
  bgActiveId   : null,   // 目前套用中的背景圖庫 id（圖庫本體存 IDB backgrounds store）
  roleLabels   : { character: '', player: '' },
  settings: { theme: 'jazz', font: 'system' }
};

const CAT_INFO = {
  life: { get label(){ return t('cat.life'); }, class: 'life' },
  date: { get label(){ return t('cat.date'); }, class: 'date' },
  work: { get label(){ return t('cat.work'); }, class: 'work' },
  plot: { get label(){ return t('cat.plot'); }, class: 'plot' }
};

/* ══════════════════════════════════════════════════════════
   Persistence
══════════════════════════════════════════════════════════ */
const LS = 'tak_fire_v2';
const SAVE_DEBOUNCE_MS = 220;
let _saveTimer = null;
let _savePending = false;

function saveNow() {
  _savePending = false;
  try {
    const songsToSave = S.songs.map(s => {
      // cover 為 objectURL 不可持久化；_isNew / _isEditing 為 UI 暫時狀態，一併剝除
      const { cover, _isNew, _isEditing, ...rest } = s;
      return rest;
    });
    const persisted = lsSet(LS, JSON.stringify({
      folders     : S.folders,
      songs       : songsToSave,
      nameOrder   : S.nameOrder,
      folderSort  : S.folderSort,
      rightTab    : S.rightTab,
      calendarCollapsed: S.calendarCollapsed,
      collapsedFolders: [...S.collapsedFolders],
      roleLabels  : S.roleLabels,
      bgActiveId  : S.bgActiveId
    }));
    if (!persisted) {
      notifyStorageError(new Error('localStorage unavailable'));
      console.warn('localStorage unavailable; data stored in memory fallback only.');
    }
    markDataChanged();   // 供備份提醒判斷「距上次備份後是否有改動」
  } catch(e) {
    console.warn('localStorage:', e);
    notifyStorageError(e);
  }
}

// 對儲存空間錯誤只彈一次 modal，避免反覆打擾（localStorage 與 IndexedDB 媒體檔案分開節流）
let _quotaWarned = false;
let _mediaQuotaWarned = false;
function notifyStorageError(err, kind = 'local') {
  const isQuota = err && (
    err.name === 'QuotaExceededError' ||
    err.code === 22 || err.code === 1014 ||
    /quota/i.test(err.message || '')
  );
  const isUnavailable = err && /localstorage unavailable/i.test(err.message || '');
  if (!isQuota && !isUnavailable) return;

  if (kind === 'media') {
    if (_mediaQuotaWarned) return;
    _mediaQuotaWarned = true;
    try {
      showModal({
        title: t('msg.mediaStorageFull'),
        desc: t('msg.mediaStorageFullDesc'),
        confirmText: t('msg.gotIt'),
        onConfirm: () => { _mediaQuotaWarned = false; }
      });
    } catch { _mediaQuotaWarned = false; }
    return;
  }

  if (_quotaWarned) return;
  _quotaWarned = true;
  try {
    showModal({
      title: t('msg.storageFull'),
      desc: t('msg.storageFullDesc'),
      confirmText: t('msg.gotIt'),
      onConfirm: () => { _quotaWarned = false; }
    });
  } catch { _quotaWarned = false; }
}

function save() {
  _savePending = true;
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    _saveTimer = null;
    if (_savePending) saveNow();
  }, SAVE_DEBOUNCE_MS);
}

window.addEventListener('beforeunload', () => {
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = null;
  if (_savePending) saveNow();
});

// 行動裝置上 beforeunload 不可靠；分頁隱藏（切換 App、鎖屏）時也 flush 一次
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'hidden') return;
  if (_saveTimer) { clearTimeout(_saveTimer); _saveTimer = null; }
  if (_savePending) saveNow();
});

function load() {
  try {
    const d = JSON.parse(lsGet(LS) || 'null');
    if (!d) return;
    // 舊版資料遷移：若 localStorage 仍有 allMessages，遷移至 IDB 後刪除
    if (Array.isArray(d.allMessages) && d.allMessages.length > 0) {
      const toMigrate = d.allMessages.map(m => ({ ...m, fp: msgFingerprint(m) }));
      idbPutMessages(toMigrate).then(() => {
        // 遷移成功後清除舊 localStorage 鍵值，重新存回
        const cleaned = { ...d };
        delete cleaned.allMessages;
        try { lsSet(LS, JSON.stringify(cleaned)); } catch(e) {}
        // 補充 nameOrder
        toMigrate.forEach(m => { if (m.type === 'msg') registerName(m.name); });
        refreshUnclassifiedCount();
      }).catch(err => console.warn('migrate allMessages:', err));
    }
    S.songs = (d.songs || []).map(song => {
      if (!song) return song;
      const next = { ...song };
      const mp3 = String(next.mp3Url || '');
      if (mp3.startsWith('blob:') || mp3.startsWith('data:audio/')) {
        next.mp3Url = '';
      }
      delete next.cover;
      // 舊版曾誤將 UI 暫時狀態持久化，載入時清除
      delete next._isNew;
      delete next._isEditing;
      return next;
    });
    S.folders = (d.folders || []).map((f, i) => {
      const upgradedNotes = (f.notes || []).map(n => ({
        date: '', endDate: '', cat: 'life', ...n
      }));
      return { parentId: null, createdAt: Date.now() + i, ...f, notes: upgradedNotes };
    });
    S.nameOrder   = d.nameOrder   || [];
    S.folderSort  = d.folderSort  || 'desc';
    S.rightTab    = d.rightTab    || 'events';
    S.calendarCollapsed = !!d.calendarCollapsed;
    S.collapsedFolders = new Set(Array.isArray(d.collapsedFolders) ? d.collapsedFolders : []);
    S.roleLabels  = { character: '', player: '', ...(d.roleLabels || {}) };
    S.bgActiveId  = typeof d.bgActiveId === 'string' ? d.bgActiveId : null;
    S.avatarChar  = null;
    S.avatarPlayer= null;
    S.bgImage     = null;
  } catch(e) {
    console.error('load() failed — localStorage 資料可能毀損：', e);
    // 保留原始字串到備份 key 以便後續手動還原
    try {
      const raw = lsGet(LS);
      if (raw) lsSet(LS + '_corrupted_' + Date.now(), raw);
    } catch {}
  }
}

