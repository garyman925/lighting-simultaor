# Luma Studio — Studio Lighting Simulator

可執行的 **Vertical Slice 01**。啟動即載入 Portrait Lighting Scene：一名原創程序式 humanoid、一台 full-frame 相機、120 × 120cm Softbox 及無縫背景。無帳戶、後端或外部角色下載。

## 啟動

需求：Node.js **22.12+**、支援 WebGL 2 的桌面瀏覽器。建議視窗 1280 × 720 以上，開啟硬體加速。

```sh
pnpm install --frozen-lockfile
pnpm dev
```

開啟 **http://127.0.0.1:5173**。伺服器只監聽本機。Windows 亦可雙擊 `START.cmd`；它優先使用這台機器的 Codex pnpm，否則使用標準 Node.js 安裝的 npm。若 5173 已有此應用執行，直接開網址即可，不需再次啟動。

沒有 pnpm 也可使用：

```sh
npm install
npm run dev
```

若 Windows 的 npm 指令指向失效的 roaming 安裝，可使用 `"C:\Program Files\nodejs\npm.cmd"` 或 `START.cmd`。

## 第一個實驗

1. 在右側選取 **120cm Softbox**，或直接點擊 Studio View 內的燈具。
2. 拖動彩色軸移動：X/Z 改燈位，綠色 Y 軸升降。按 **E** 切換旋轉環；右側 Transform 亦可輸入精確座標／角度。**Aim at model** 重新對準人物。
3. 用 **Softbox size** 比較 30cm 與 180cm；人物鼻影、身體亮部及背景影緣會改變。預設尺寸 120cm。
4. 改變 Power、Color temperature，或將燈移遠；亮度、色調與光衰減即時改變。
5. 下方選擇 **35 / 50 / 85 / 105mm**，調整 ISO、Aperture、Shutter speed。選取 Camera 可移動及旋轉真正的拍攝相機。
6. 點背景色票、Color Picker 或輸入 HEX；背景及地板同步更新。
7. **Reset Scene** 回到預設。選 Humanoid 可調身高及轉向；沒有複雜 Character Creator。

Studio View 的空白處拖曳是編輯視角 Orbit；右鍵平移、滾輪縮放，**不會移動拍攝相機**。`W` 移動、`E` 旋轉、`F` 還原編輯視角、`Esc` 取消尚未完成的拖動。輸入欄位內不攔截全域快捷鍵。

## 已完成

- 真正的 3D 場景、原創有鼻／眼窩／四肢的人台、受光無縫背景。
- 可選取、拖動、升降、旋轉的 Softbox、Camera 與人物。
- Softbox 尺寸 30–180cm、Power、3200–6500K，平方距離衰減及受遮擋光照。
- 同時顯示 Studio View 和 Camera Preview，拍攝預覽不含 gizmo、grid 或拍攝相機本身。
- 36 × 24mm full-frame、四種焦距、ISO100–6400、f/1.4–f/22、1/15–1/1000s。
- 持續燈與閃燈曝光規則、Color Picker、Reset、預設 Portrait scene。
- Export scene 顯示可複製 JSON 並可要求瀏覽器下載；不是雲端儲存。
- 型別檢查、正式 build、9 個數學／場景單元測試、真實瀏覽器操作及截圖驗證。

## 渲染方式與目前限制

使用九個固定總權重的 shadow-casting SpotLight 樣本近似一個面光源；樣本在 Softbox 實際發光面上移動，並非以全畫面 blur 模擬柔光。停下後 Camera Preview 在 HalfFloat 線性 render targets 累積八批次共 **72 個樣本**，最後才套用 ACES tone mapping 與 sRGB。改場景會重設累積；完成後停止持續 render loop。沒有 float render-target 支援時保留九樣本即時預覽。

Studio View 採九樣本快速顯示，因此可看到較明顯的多重影子；Camera Preview 的 72 樣本較平滑，仍是近似。設備進入拍攝畫面時會實際入鏡，不會偷偷隱藏。

預設選 **continuous**，讓本輪要求的三個曝光控制都能直接看見效果；這是相對原規格「預設 strobe」的有意調整。閃燈模式內，快門不影響閃光曝光，且禁用快於 1/200s 的快門；切入閃燈時會將過快快門調至 1/200s 並提示。

人物為美術人台等級，不是寫實人體。尚未做真實品牌校正、GI、皮膚 SSS、景深、noise、motion blur、白平衡 UI、Undo/Redo、save/load、自動儲存或資產匯入。頁面重整會重設場景。Power 是相對輸出，不可解讀為真實 lux 或測光表讀數。ISO、光圈與快門按規格的相對曝光公式計算。

UI 的 `ms CPU` 是 CPU 提交 render 的耗時，不是 GPU frame time 或 FPS。這輪沒有宣稱達成特定 RTX / Iris Xe 硬體效能基準。shader 首次編譯會較慢。

## Project structure

```text
src/
  domain/scene.ts             SceneDocument、投影、曝光、Transform、seed
  rendering/StudioRenderer.ts renderer adapter、雙視角、gizmo、光源及累積
  rendering/humanoid.ts       原創程序式人物
  components/Controls.tsx     可重用表單元件
  App.tsx                    React UI 與場景狀態
  styles.css                 工作區及響應式版面
fixtures/portrait.scene.json  與 makePortraitScene 相符的預設資料
tests/scene.test.ts           9 個數學及不可變場景測試
tests/evidence/               本輪瀏覽器驗證截圖與比較資料
tests/VERIFICATION.md         功能驗證紀錄
```

React 管理可序列化產品狀態；Three.js 物件只存在 renderer adapter 內。這個小型 slice 直接呼叫 Three.js，暫未加入原規格建議的 R3F/Zustand/Ajv；未來可替換 view/state adapter，而不需改 SceneDocument 的語意。JSON 採原規格的公尺、quaternion XYZW、versioned document 欄位；目前沒有檔案匯入功能，因此不對外宣稱完成 schema importer。

## 測試與 build

```sh
pnpm test
pnpm typecheck
pnpm build
pnpm preview
```

`preview` 預設在 http://127.0.0.1:4173。正式 bundle 不需後端，可由一般靜態 HTTP server 提供；不要以 file:// 開啟 index.html。

單元測試涵蓋曝光比例、flash 快門不變性、FOV、發光樣本權重、look-at、Euler/quaternion round-trip、場景不可變更新與 JSON round-trip。瀏覽器證據不是模擬截圖；來自實際運行的本機應用。相對畫面差異只證明畫面變化，不當作絕對測光校正。

## Git 與資產

專案是獨立 Git repository，分支 `codex/vertical-slice-01`，提交分開記錄骨架、可操作 slice、渲染／互動修正及測試交接。全部人台與設備幾何皆為程式生成，沒有使用 set.a.light 或第三方角色資產。UI 圖示由 lucide-react 提供，其授權隨依賴包提供。

