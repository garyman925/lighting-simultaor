# Luma Studio — Studio Lighting Simulator

可執行的 **VS03.1 — Light Positioning & Aiming UX**（保留先前 editor 與七類器材）。啟動即載入 Portrait Lighting Scene：一名原創程序式 humanoid、一台 full-frame 相機、120 × 120cm Softbox 及無縫背景。無帳戶、後端或外部角色下載。

## 第一個實驗

1. 在右側選取 **Key light**（120cm Softbox），或直接點擊 Studio View 內的燈具。
2. 拖動彩色軸移動：X/Z 改燈位，綠色 Y 軸升降。按 **E** 切換旋轉環；右側 Transform 亦可輸入精確座標／角度。燈具使用 **Aim at Face / Chest / Model Center** 重新對準人物。
3. 用 **Softbox size** 比較 30cm 與 180cm；人物鼻影、身體亮部及背景影緣會改變。預設尺寸 120cm。
4. 改變 Power、Color temperature，或將燈移遠；亮度、色調與光衰減即時改變。
5. 下方選擇 **35 / 50 / 85 / 105mm**，調整 ISO、Aperture、Shutter speed。選取 Camera 可移動及旋轉真正的拍攝相機。
6. 點背景色票、Color Picker 或輸入 HEX；背景及地板同步更新。
7. **Reset Scene** 回到預設。選 Model 可調身高及轉向；沒有複雜 Character Creator。

Studio View 的空白處拖曳是編輯視角 Orbit；中／右鍵或 Shift + 左鍵平移、滾輪縮放，**不會移動拍攝相機**。`W` 移動、`E` 旋轉、`F` 還原編輯視角、`Esc` 取消尚未完成的拖動。輸入欄位內不攔截全域快捷鍵。

## 已完成

- 真正的 3D 場景、原創有鼻／眼窩／四肢的人台、受光無縫背景。
- 可選取、拖動、升降、旋轉的 Softbox、Camera 與人物。
- Softbox 尺寸 30–180cm、Power、3200–6500K，平方距離衰減及受遮擋光照。
- 同時顯示 Studio View 和 Camera Preview，拍攝預覽不含 gizmo、grid 或拍攝相機本身。
- 36 × 24mm full-frame、四種焦距、ISO100–6400、f/1.4–f/22、1/15–1/1000s。
- 持續燈與閃燈曝光規則、Color Picker、Reset、預設 Portrait scene。
- Export scene 顯示可複製 JSON 並可要求瀏覽器下載；不是雲端儲存。
- 型別檢查、正式 build、17 個數學／場景／多燈單元測試、真實瀏覽器操作及截圖驗證。

## Studio Editor 操作

- **Add Light**：新增獨立 Light ID；Scene Objects 的 LIGHTS 群組同步增加。
- 選取燈具後可修改名稱、Enabled、Continuous / Strobe、Power、色溫、Softbox size，以及 Position / Rotation。複製按鈕保留參數並略為移開；垃圾桶刪除該燈，選取會回到 Model。
- **Three-Light Preset** 載入 Key（120cm / 70%）、Fill（120cm / 22%）、Rim（60cm / 45%）。**Reset Scene** 保留原有單燈 Portrait 預設。
- **Perspective** 可自由 Orbit；**Top / Front / Side** 使用 Orthographic 投影並鎖定旋轉軸向，仍可 Pan / Zoom。**Reset View / F** 還原目前視角。
- 左鍵拖曳空白處 Orbit；中鍵、右鍵或 Shift + 左鍵 Pan；滾輪 Zoom。點燈具本體或物件列表選取，金色外框和 Move / Rotate gizmo 會同步。
- Studio 相機、拍攝相機為不同實例；切換編輯視角不會寫入 SceneDocument，也不重算已收斂的拍攝影像。
- 沒有三盞或其他人為燈數上限；實際上限取決於裝置。已測試十盞燈、刪除至零盞，以及空場景重新加燈。
- 混用持續燈與閃燈時，曝光逐燈計算；只要有啟用的閃燈，快門上限為 1/200s。關掉全部閃燈後可選更快快門。

燈具使用 ID → Three.js rig 的 Map 增量更新；變更 slider 不會重建場景或光源池。固定重用九個 SpotLight 及九張 shadow maps，逐燈累加直接光至線性 HDR target，然後做時間累積與一次 tone mapping。後續燈的 pass 使用 equal-depth 加色，避免重複繪製被遮擋表面。此方法適用於本輪不透明人台；未來透明／透射材質需另行處理。Studio render cache 只在編輯視角或場景改動時更新；Preview 在八批次後停止 render loop。

## 渲染方式與目前限制

使用九個固定總權重的 shadow-casting SpotLight 樣本近似一個面光源；樣本在 Softbox 實際發光面上移動，並非以全畫面 blur 模擬柔光。停下後 Camera Preview 在 HalfFloat 線性 render targets 累積八批次共 **72 個樣本**，最後才套用 ACES tone mapping 與 sRGB。改場景會重設累積；完成後停止持續 render loop。沒有 float render-target 支援時使用 RGBA8 累積，強光可能截斷；正式光影比較建議使用支援 float targets 的 GPU。

Studio View 採九樣本快速顯示，因此可看到較明顯的多重影子；Camera Preview 的 72 樣本較平滑，仍是近似。Slice 02 的 Camera Preview 隱藏燈架及設備幾何，專注人物佈光；Studio View 保留所有設備，並加入僅供編輯的弱環境光及格線，方便在全關燈時操作。編輯環境光不會進入 Camera Preview。

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
tests/editor.test.ts          8 個多燈編輯／預設／邊界情境測試
src/editor.css               Caption / Body / Label / Section Title / Numeric Value tokens
tests/evidence/               本輪瀏覽器驗證截圖與比較資料
tests/VERIFICATION.md         功能驗證紀錄
```

React 管理可序列化產品狀態；Three.js 物件只存在 renderer adapter 內。這個小型 slice 直接呼叫 Three.js，暫未加入原規格建議的 R3F/Zustand/Ajv；未來可替換 view/state adapter，而不需改 SceneDocument 的語意。JSON 採原規格的公尺、quaternion XYZW、versioned document 欄位；目前沒有檔案匯入功能，因此不對外宣稱完成 schema importer。

## 測試與 build

```sh
npm test
npm run typecheck
npm run build
npm run preview
```

`preview` 預設在 http://127.0.0.1:4173/lighting-simultaor/。正式 bundle 不需後端，可由一般靜態 HTTP server 提供；不要以 file:// 開啟 index.html。

單元測試涵蓋曝光比例、flash 快門不變性、FOV、發光樣本權重、look-at、Euler/quaternion round-trip、場景不可變更新與 JSON round-trip。瀏覽器證據不是模擬截圖；來自實際運行的本機應用。相對畫面差異只證明畫面變化，不當作絕對測光校正。

## Git 與資產

專案是獨立 Git repository，目前分支 `main`（既有 GitHub Pages workflow 監聽此分支），提交分開記錄骨架、可操作 slice、渲染／互動修正及測試交接。全部人台與設備幾何皆為程式生成，沒有使用 set.a.light 或第三方角色資產。UI 圖示由 lucide-react 提供，其授權隨依賴包提供。



## GitHub Pages 部署

公開 Demo：[Luma Studio](https://garyman925.github.io/lighting-simultaor/)（首次 Actions 部署成功後可用）。

Repository：https://github.com/garyman925/lighting-simultaor

- 正式分支為 `main`；原來四個 Vertical Slice commits 及 `codex/vertical-slice-01` 本地分支保留。
- Vite `base` 固定為 `/lighting-simultaor/`，包含 repository 原有拼法。
- 首次在 GitHub **Settings → Pages → Build and deployment → Source** 選 **GitHub Actions**。
- 每次 push 到 `main`，`.github/workflows/deploy.yml` 會用 Node 22、`npm ci`、`npm test`、`npm run build`，然後部署 `dist`。PR 只執行驗證；也可在 Actions 手動 Run workflow。
- npm 和 `package-lock.json` 是本地與 CI 的依賴來源；新增或更新依賴後請提交 lockfile。
- Actions 成功後打開 Demo，確認雙視角、燈光、背景色、焦距與曝光。若需核對部署，檢查 Actions 的 deploy job 及 github-pages environment。
- 本程式只有一個頁面，沒有 history-based 子路由；在 Demo 根路徑重整即可。所有 JS/CSS 由 Vite 加上 base path，人台和燈具由程式生成，不需外部模型。將來新增子路由時請使用 hash router 或另設 GitHub Pages fallback。
- `dist`、`node_modules`、cache、`.env`／`.env.*` 及本機憑證不提交。任何 `VITE_*` 變數都會成為公開前端內容，不可放 secrets。部署使用 GitHub 提供的短效 token/OIDC，不需另存 API key。

本地正式版本驗證：

```sh
npm ci
npm test
npm run build
npm run preview
```


## Vertical Slice 03 — Equipment Library

Seven generic modifiers are available through **Add Light → Modifier / Size → Add to Studio** and the selected light's Inspector: Bare Reflector, Rectangular Softbox, Octabox, Stripbox, Beauty Dish, Umbrella and Snoot. Beauty Dish supports 42/55/70cm. The hierarchy shows the selected equipment, physical dimensions and Grid accessory. Original light lifecycle controls, transforms, navigation, exposure and the Three-Light Preset remain available.

`src/domain/equipment.ts` owns definitions, size presets, optical parameters, accessory compatibility and reserved manufacturer/model/calibration metadata. All definitions are generic and uncalibrated. Grid is an accessory; incompatible equipment removes it when switching. Schema v2 records equipment IDs, dimensions and accessories. `migrateScene` upgrades the existing v1 softbox documents while preserving exposure, transforms and custom dimensions. Export emits v2; interactive file import/save is still outside this slice.

Rendering reuses the nine-light shadow pool and accumulates eight aperture passes (72 samples per fixture) in linear HDR. Rectangle/strip samples span their physical width and height; octagonal samples follow polygon boundaries; Beauty Dish uses an annular aperture around the deflector; umbrella samples use a shallow curved surface; reflector/snoot use smaller circular apertures. Each definition supplies a beam angle, penumbra and relative gain. Grid multiplies beam width by 0.4 and transmission by 0.78. Physical size changes sample separation and therefore actual occlusion/penumbrae. Studio equipment geometry is generated separately and updated only when modifier data changes.

**Soft Portrait**, **Beauty Portrait** and **Dramatic Strip / Rim** replace only the lights, preserving the current camera, exposure, model and background. They are intentionally distinct lighting arrangements, not a calibrated same-power comparison. Change the Inspector modifier on a single unchanged light for a controlled optical comparison.

Limitations: geometric direct-light approximation, not measured lux, spectral transport or a commercial product match. Angular profiles use spotlight cones/penumbrae; no measured IES profiles, interreflection, transmission or detailed umbrella fabric scattering. Fixed sample counts can leave grain/banding, especially in the nine-sample Studio view. Equipment remains hidden in Camera Preview and does not occlude other lights. Equal-depth light accumulation currently targets opaque materials. Ten mixed lights were interactively checked on this machine; CPU submission time is not a GPU FPS claim.

**Historical VS03 boundary:** corneal reflections were not implemented in VS03. VS04A below replaces that limitation.


## VS03.1 — Photography-oriented aiming

- Selected light 的 **Light Position & Aim** 提供 Horizontal −90/−45/0/+45/+90/135/180°、Vertical −45/−30/0/+30/+45°，也可輸入 37° 或小數角度。
- 0° 是模特兒朝向拍攝相機的位置方向；正值是 Camera Right、負值是 Camera Left；135° 後側、180° 背光。使用 camera-to-model 的水平投影，不受 Studio orbit 或 camera roll 影響。
- 角度控制繞選定 landmark 移動燈具，保留三維距離與另一個角度，然後將 modifier 的 local −Z 發光面對準目標。數值表示燈位方位／高低，並非自由旋轉後的 Euler 方向。
- Face / Chest / Model Center 按人物高度、位置與旋轉計算；Aim 只改朝向。Auto Aim 預設 Off，逐燈保存；開啟後移燈、移人物或改人物高度均跟隨目標。自由旋轉或 numeric WORLD rotation 關閉該燈 Auto Aim；取消拖曳恢復原設定。
- Transform 的 Rotation snap：Off / 5 / 15 / 45°，作用於旋轉 gizmo（world-space）；numeric angles 不受 snap 限制。
- Studio 的青色箭頭是真實出光方向，金點是選定目標。兩者屬 editor overlay，Camera Preview 不渲染；選取 Model/Camera 時隱藏。
- Portrait、Three-Light 及三個 comparison presets 使用 semantic positioning。Comparison presets 按當前 Camera/Model 重算燈位並保留相機、人物、曝光及背景。
- Optional per-light `aiming: {target, auto}` 隨 JSON 匯出；v1/v2 舊場景無此欄位仍可使用，預設 face / Auto Off。

限制：landmarks 為現有人台的近似解剖位置。角度控制維持精確半徑，不做器材碰撞／地板限制；低於 0.25m 會提示。Vertical numeric 限制 ±89° 避免極點方位不定。相機位於人物正上方時以相機方向的水平投影作 fallback，仍退化則使用 +Z。移動相機只改變角度基準，不會自動繞移已放好的燈；Auto Aim 跟隨目標而非保持方位角。光影仍是 VS03 的近似模型，無 GI／皮膚 SSS。

驗證：63 項 automated tests（31 項 aiming + 32 項既有測試），TypeScript 與 production build；真實瀏覽器記錄見 `tests/VS03.1-VERIFICATION.md`。


## VS04A — Portrait Head, Eyes & Physical Catchlight

Original procedural head geometry now has narrower anatomical proportions, orbital hollows, cheek planes, a nose bridge/tip, shaped lips and chin. No third-party model or texture was introduced. Sclera, curved pigmented iris, pupil, eyelid skin and a separate curved corneal cap form each eye. Skin has a small `MeshPhysicalMaterial` baseline/interface for a later VS04B; no SSS, makeup, skin-tone creator or hair library was added.

**Catchlight Test** installs a fixed 85mm camera, subject and exposure. Change the selected light’s Modifier/Size for A/B comparisons. **Preview Zoom** offers Fit 100%, Face 300% and Eyes 600%; these are sensor crops on a copied inspection camera and never mutate the capture camera, lens, exposure or scene document. Ordinary lighting presets retain their existing behavior.

`emitterSurface` is shared by VS03 aperture sampling and the new corneal renderer. Each corneal fragment reflects the actual camera viewing ray about its curved surface normal, transforms that ray into each enabled emitter’s local coordinates, then intersects the rectangle, octagon, annular dish, circular aperture or shallow umbrella paraboloid. This is analytic geometry reflection, without a white-dot sprite, screen overlay, name-selected texture, cube camera or per-eye environment map. Translation, distance, arbitrary rotation, custom dimensions and model transforms therefore affect the result geometrically.

Reflected radiance shares source power, exposure mode, temperature, optical gain, beam cutoff, penumbra and Grid transmission with direct illumination. Radiance is normalized by aperture area; distance reduces apparent area, not surface radiance. Disabled sources contribute zero. Each light is accumulated separately in linear HDR, then tone mapped once. Corneas render in a separate additive layer after opaque lighting, with the same depth buffer, so they do not enter the opaque equal-depth accumulation. Camera Preview excludes Studio helpers and equipment visuals.

Render Quality: **Draft** uses one shadow sample per fixture and one reduced-resolution batch; **Standard** uses four batches of nine (36 samples); **High** uses eight batches of nine (72 samples), with higher preview resolution. Pointer interaction and changing numeric light controls temporarily select Draft; 180ms after settling, selected quality resumes. Render targets, the shadow-light pool and corneal material are reused; changing lights does not rebuild the model or whole scene. Corneal work scales with visible eye pixels and enabled sources and needs no additional shadow maps. Legacy `low` / `balanced` scene settings map to Draft / Standard.

Physical/visual limits: this remains a procedural lighting-study head, not a scanned photorealistic face. Reflection is a smooth dielectric first-surface approximation (2.5% normal-incidence Fresnel), without corneal refraction, tear film, rough microfacet integration or indirect scene reflections. Eyelids use scene depth for camera visibility; incoming-ray nose occlusion uses a conservative head-local ellipsoid, not full scene ray tracing. Hands, other equipment, lashes and arbitrary objects are not traced as reflection blockers. Dish uses an annulus and umbrella a uniform shallow paraboloid, not measured reflector/fabric scattering. Existing 512px shadow maps can alias at extreme eye zoom; profiles are generic, uncalibrated and not lux predictions. Skin SSS and material customization remain VS04B work.

Validation and browser evidence: `tests/VS04A-VERIFICATION.md`.
