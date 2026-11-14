【assets 資料夾說明】

assets/
|
|-- filter-sample.jpg       <- Photo 頁「濾鏡提示詞」面板的範例圖（filter.js 的 FILTER_SAMPLE）
|-- luts/                   <- （選用）預設濾鏡的 .cube 檔，需在 filter.js 的 FILTER_PRESETS 登記

【注意】
- 頭像、背景、照片、成員照片、歌曲封面與 MP3 都是在網站裡上傳，存在瀏覽器的
  IndexedDB，不放在這個資料夾。
- 想換範例圖：用同檔名覆蓋 filter-sample.jpg 即可，長邊 480px 左右就夠
  （面板上只顯示 220px 的預覽）。
