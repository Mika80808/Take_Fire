# Take Fire

Take Fire 樂團的故事整理工具與官網原型，純前端、無後端。分成兩個模式：

- **Story Mode** — 匯入 `.txt` 對話紀錄，分資料夾整理、標記事件、掛歌單
- **Official Site** — Photo / Music / Tour / Profile 四個官網頁面

## 資料存在哪裡

> **所有資料只存在你這台電腦的這個瀏覽器裡。** 沒有伺服器、沒有雲端副本。
> 換瀏覽器、換電腦、清除瀏覽資料，資料都會不見。定期匯出備份。

同一份資料綁在「來源（origin）」上。用 `http://localhost:5173` 開跟用
`http://127.0.0.1:5173` 開，瀏覽器視為兩個不同來源，看到的會是兩份不相干的資料。
固定用同一個網址開啟。

### localStorage

| 鍵名 | 內容 | 會被備份 |
|---|---|:--:|
| `tak_fire_v2` | 資料夾結構、事件筆記、歌曲中繼資料、名稱順序、角色標籤、排序與摺疊狀態 | ✅ |
| `tak_fire_v2_sys` | 系統設定：主題、字體、字級、語言 | ✅ |
| `tak_fire_site_v1` | 官網資料：Tour 行程、成員資料（不含照片）、目前分頁 | ✅ |
| `tak_fire_view_v1` | 目前開啟的資料夾與各資料夾的捲動位置 | ❌ |

`tak_fire_view_v1` 不進備份是刻意的——那只是瀏覽狀態，不是內容。

### IndexedDB

資料庫 `tak_fire_db`（版本 5），六個 object store：

| Store | 主鍵 | 內容 | 會被備份 |
|---|---|---|:--:|
| `messages` | `id` | 所有訊息（另有 `fp`、`ts` 兩個索引） | ✅ |
| `posters` | `id` | Photo 頁的 CG 圖片 | ✅ |
| `backgrounds` | `id` | 背景圖庫 | ✅ |
| `app_assets` | `key` | 角色／玩家頭像、成員照片 | ✅ |
| `song_covers` | `songId` | 歌曲封面 | ✅ |
| `song_mp3s` | `songId` | 歌曲 MP3 | ✅ |

圖片與音檔一律存 IndexedDB，不進 localStorage（後者只有約 5MB，塞 base64 會爆）。

## 備份與還原

**備份**：右上角「匯出」。會存成 `take_fire_backup_日期_時分.json`，
內含上表所有標示 ✅ 的項目——三個 localStorage 鍵加六個 IDB store，圖片與音檔以
base64 內嵌。檔案會不小，這是正常的。

**還原**：右上角「匯入」，選那個 `.json`。

> 匯入會**覆蓋現有全部資料**。程式會先在記憶體裡備份現況，任何一步失敗就整批回滾，
> 但仍建議匯入前先匯出一份現況。

## 本機執行

需要用 HTTP 伺服器開啟，**不能直接雙擊 `index.html`**——瀏覽器會把 `file://`
視為不透明來源而停用 IndexedDB，圖片和訊息都會存不進去。

```bash
py -3 -m http.server 5173
# 然後開 http://localhost:5173
```

## 檔案結構

```
index.html   HTML 結構
style.css    全部樣式（開頭是堆疊層級與色彩 token）
core.js      IndexedDB 層、localStorage 包裝、i18n 字典、工具函式、S 狀態、匯出匯入
story.js     Story Mode 的渲染與互動、開機流程
site.js      SS 狀態、官網四個頁面、IG 檢視、行動抽屜
```

三個 js 用一般 `<script>` 標籤依序載入，**不是 ES module**，彼此靠全域變數溝通
（`S`、`SS`、`$`、`t`、`esc` 與各 `idb*` 函式）。因此**載入順序不能調換**，
也不要在 `<script>` 上加 `defer` 或 `type="module"`。

## 已知的未完成處

`site.js` 的 `CG_INDEX_URL` 是預留的擴充點：填入一個 JSON 的網址後，
Photo 頁會把遠端圖片和本機圖片合併顯示。目前是空字串，`fetchRemotePosters()`
會直接回傳空陣列，等於沒有作用。
