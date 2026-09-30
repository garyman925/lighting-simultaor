# Vertical Slice 01 實測紀錄

日期：2026-09-30。執行環境：本機 Windows 開發伺服器、Codex 內建 Chromium 瀏覽器，1280 × 720 視窗。此紀錄描述已完成的實際操作，不是未執行的驗收計畫。

## Build 與自動測試

- `pnpm test`：9 / 9 通過。
- `pnpm build`：TypeScript strict 檢查及 Vite production build 通過。
- 瀏覽器初始化、完整互動流程及最終版本：console error / warn 皆為空。
- 鎖定 Three.js 0.180.0、React 19.1.1、Vite 7.1.7；無外部網路角色／貼圖依賴。

## 實際功能驗證

1. 啟動後出現 humanoid、Camera、120cm Softbox、cyclorama 及雙視角：通過。
2. 直接拖曳 Softbox 紅色 X 軸：位置由 -1.25m 改至約 +0.16m，人物光影與器材入鏡情況即時變化。證據 `softbox-drag.png`。
3. 位置欄位 Z=3.5m：人物與背景變暗；Y=3m：高角度陰影改變；Rotation Y=130°：光束轉離人物。證據 `softbox-far/raised/turned-away.png`。
4. Size 30cm 與 180cm：光源實體／採樣分布改變，30cm 的影緣較硬，180cm 的影緣較柔。證據 `softbox-30.png`、`softbox-180.png`。
5. Power 0%：Camera Preview 所量測場景區域 RGB 全為零；100% 重新照亮。證據 `power-0/100.png`。
6. 色溫 3200K 與 6500K：暖冷色變化可見。證據 `kelvin-3200/6500.png`。
7. 35 / 50 / 85 / 105mm：逐一選取並確認選取值與拍攝畫角改變。證據 `lens-*.png`。
8. ISO200→800：亮度提高；f/4→f/8、1/125→1/500：亮度降低。後兩種等效曝光在固定畫面 ROI 的像素完全相同。證據 `iso-800.png`、`aperture-8.png`、`shutter-500.png`。
9. 原生 Color Picker 與 HEX 各自更改顏色，背景及地板同步。修正原生 color input 需監聽 `input` 才能即時更新的問題。證據 `native-color-picker.png`、`background-blue.png`。
10. Camera Position X=0.6m 並 Aim at model；再改 Rotation Y=18°：預覽構圖相應改變。直接拖曳旋轉環亦會更新 rotation 值。證據 `camera-moved/rotated/ring-drag.png`。
11. 編輯視角空白處 Orbit：Studio View 改變，Camera Preview 的固定 ROI 像素差為零。證據 `orbit-before/after.png`。
12. Model 身高 200cm、轉向 80°：人物尺度與方向改變且 Preview 同步。證據 `model-height-turn.png`。
13. Reset Scene：恢復 120cm、50mm、f/4、ISO200、1/125s、70% continuous、5600K、原背景及物件位置。
14. Strobe 模式下 1/125 與 1/60 的 Preview ROI 像素相同；1/250、1/500、1/1000 的選項皆 disabled。證據 `strobe-125/60.png`。
15. Export scene 的可複製 JSON 已由介面讀回並 JSON.parse；schemaVersion=1、單燈、size=1.2、focalLength=50。證據 `exported.scene.json`。瀏覽器下載路徑未由工具確認；以可見 JSON 作為可靠備份出口。

## 視覺與量測界線

`evidence/image-checks.json` 使用 screenshot ROI [545,210,950,440]，檢查畫面確實變化、編輯視角隔離與兩種等效曝光。這些是顯示後的 sRGB 像素比較，不作為 HDR 光量或真實相機測光精度證據。

Camera Preview 支援時以 72 樣本收斂；Studio View 為 9 樣本。暖機後介面顯示的 CPU render submission 約 1–數 ms，但沒有測量 GPU p95 frame time，因此不宣稱通過原規格的指定硬體效能 gate。首次 shader 編譯可能明顯較慢。

未驗證：其他 GPU／瀏覽器版本、長時間記憶體壓力、GPU context lost 的真實恢復，以及真實照相器材校正。未實作部分列於 README；本次僅交付 Vertical Slice 01。

## Vertical Slice 02 — Studio Editor（2026-09-30）

本輪在既有 repository 實作；使用 production build 的本機 preview server 驗證。截圖與讀回的 scene JSON 位於 `evidence/slice-02/`。

1. Orbit：實際左鍵拖曳，編輯視角明顯改變。
2. Pan：實際 Shift + 左鍵拖曳；中／右鍵亦已設定為 Pan，但瀏覽器工具未直接模擬右鍵連續拖曳。
3. Zoom：Studio View 內滾輪縮放。
4. Top / Front / Side / Perspective：逐一切換，前三者為正交投影；Reset View 可還原目前視角。
5. 逐次 Add Light 新增第二與第三盞；另外實際增加至十盞，仍可渲染，無燈數 hard limit。
6. 三盞燈分別修改 Position X 為 -1.8 / 1.8 / 0.6m，讀回 JSON 確認獨立保存。
7. 分別修改三盞燈 Rotation Y；JSON quaternion 不同。Top View 直接拖動 Fill Light 的紅軸後 X=1.96m；拖旋轉環後 Y 從 44.36° 變為 -67.14°。
8. 分別調整 Power 至 65 / 25 / 40%，讀回值符合操作。
9. 每盞燈 Enable / Disable 獨立作用；全關時 Preview ROI 的 RGB 均為零。
10. Rename 為 Rim Custom，Duplicate 產生獨立 ID / Rim Custom copy。
11. Delete copy 後列表移除；單燈刪除至零盞後可再 Add Light；Reset 復原單燈 Portrait。
12. Three-Light Preset 建立 Key / Fill / Rim，同時照亮人物。逐盞關閉的 Preview 差異均非零。
13. Orbit、Pan、Zoom、四種視角的固定 Preview ROI 像素差全部為零；經 UI 匯出前後 JSON，Camera 與 Lights 完全相同。
14. 1280×720 / 1366×900 / 1920×1080 版面檢查；文字依角色使用 12 / 14 / 15 / 16px tokens。Light name 實測 15px、38px 高；1366 視窗沒有水平溢出。筆電需要垂直捲動；Inspector 獨立捲動。
15. Regression：35 / 50 / 85 / 105mm、ISO800、f/8、1/500s、原生背景色、Camera 位移及 Aim、Model 身高／轉向、Softbox 30 / 180cm、3200 / 6500K、Reset 都已操作及截圖。混合場景啟用 strobe 時限制快門；關閉 strobe 後可選 1/500，重新啟用會回到 1/200。
16. TypeScript strict 檢查 + Vite production build 成功（`--configLoader runner`）。
17. Vitest：原有 9 + 新增 8，共 **17/17** 通過；新增測試涵蓋多燈 ID、獨立更新、重排後 transform、深複製、零燈重建、閃燈開關、預設隔離及 stale ID。
18. 最終正式 bundle 的 browser console errors / warnings：**0**。

影像量測 ROI 為 [620,300,940,570]，原始完整截圖為工具產生，未修改。資料在 `image-checks.json`；單燈關閉的平均 RGB 差異約為 Key [64.13,54.99,46.99]、Fill [18.64,16.29,14.32]、Rim [1.45,1.36,1.44]。這只證明各燈參與可見光影，並非物理校正。

效能：固定九個 SpotLight / shadow map 池，逐燈線性加色；slider 不重建 scene。十燈測試暖機後介面曾顯示 5.3ms CPU submission；三燈約 1.7–5.1ms。不是 GPU FPS 或 p95 數據；首次 shader 編譯更慢。停下後八批次收斂即停止 render loop。未做跨 GPU 長時間壓力測試；RGBA8 fallback 未在真實不支援 float targets 的硬體上測試。

已知界線：透明／透射材質尚不適用目前 equal-depth 加色策略。設備只顯示於 Studio View；Preview 聚焦人物與背景。Save/load、Undo/Redo、寫實人體、真實器材校正保持後續範圍。
