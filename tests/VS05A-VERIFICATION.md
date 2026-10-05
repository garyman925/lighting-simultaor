# VS05A — Project workflow verification

2026-10-05, Windows / Chromium in-app browser. The user-approved local VS04C work was preserved on top of upstream main `9a9fabd`; its original working directory was not modified.

## Implementation

- `src/project/schema.ts`: projectVersion 1 envelope (ID, name, notes, creation/update timestamps, optimistic revision token) wrapping scene schema 2. Explicit field whitelist excludes renderer instances, helpers, selection, navigation and other transient state. Model/head pose, skin, hair, camera/exposure, environment, modifiers/Grid, light IDs/order/aim and render quality are persisted. Semantic angles are derived from the saved world transforms and camera/model basis, avoiding conflicting redundant coordinates.
- Legacy scene v1/v2 adapters feed the same validation boundary as project v1. Unknown project/scene versions are rejected without modifying the current document. Missing optional fields receive defaults; invalid numbers are replaced/clamped, quaternions are normalized only when necessary, duplicate/invalid light IDs are repaired. Malformed core structures and unknown equipment are rejected. Input limits: 5 MB JSON, 100 lights, 20,000 note characters. Future versions should add explicit sequential adapters before the current validator; never reinterpret an unknown version as current.
- `src/project/repository.ts`: IndexedDB database `luma-studio-projects`, database version 1, `projects` and `settings` stores. Save success is reported only after transaction completion. Project save and last-project pointer are atomic. A revision comparison inside the same read/write transaction prevents stale-tab overwrite or resurrecting a project deleted in another tab. Upgrade blocking, version changes, transaction aborts and unavailable storage are handled. Invalid records are retained and omitted from the usable list with a visible warning.
- `src/project/controller.ts`: centralized domain state, 900ms debounced autosave, serialized in-flight saves, snapshot fingerprint comparison, save-before-switch, load boundaries, last-project recovery and explicit Save As conflict recovery. Auto-save does not clear history. Errors leave current edits available for JSON export. Visibility change requests save; beforeunload warns when not yet Saved. No guarantee is made for a forced process termination before a pending IndexedDB transaction commits.
- `src/project/history.ts`: bounded 100-entry domain snapshots and explicit gesture transactions. Transactions have control/gizmo ownership so unrelated focus loss cannot split a drag. Text edits coalesce until blur; slider pointer/key gestures and gizmo mouse down/up bracket changes. Snapshots preserve complete light IDs/settings/order. Undo/Redo at the saved fingerprint is recognized as Saved. History is session-only.
- Native Project dialog contains project list, notes, backup/restore and deletion confirmation. Native dialog focus containment keeps controls out of the Studio viewport. Keyboard shortcuts skip text inputs, textareas, selects and contenteditable fields.

## Automated verification

`npm test`: 123 tests passed across 8 files. Existing 88 tests plus 28 project tests and 7 model preservation tests.

Coverage includes full ten-light serialization round-trip, every supported hair/pose combination, malformed/unknown versions, v1 scene migration, optional defaults, nonfinite/clamped numbers, zero quaternion, invalid/duplicate light IDs, foreign-field removal, import size limits, IndexedDB CRUD/reopen, atomic revision conflict, unavailable storage, retained damaged records, 200-frame coalescing, cancelled/no-op history, redo invalidation, bounded history, unrelated blur regression, actual debounce expiry, saved-revision undo, cross-project boundaries, quota failure, in-flight save/edit race, Save As conflict recovery and invalid-import preservation.

`npm run build`: TypeScript and Vite production build passed. Existing Three.js chunk-size advisory remains.

## Actual browser verification

Local dev and production builds were exercised via visible controls, with exported JSON read through the application's export textarea (no private state injection).

- Named project, changed hair/body pose, modifier/Grid/Auto Aim/angle, saved, refreshed, then deep-compared the entire exported project: identical.
- Add/duplicate/delete light Undo/Redo; undo-delete restored exact light ID, settings and ordering.
- Equipment switch, model pose, Reset Model, lighting preset and Reset Scene undo restored complete prior scene.
- Physical multi-point gizmo drag and physical Power slider drag each undid/redid in one step. The initial gizmo test caught a focus-loss transaction bug; ownership fix was implemented, regression-tested and rechecked in browser.
- Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y; textarea Ctrl+Z left scene history untouched.
- Autosave without manual Save survived refresh; separate projects switched without contamination; Open/New/reload history boundaries verified.
- Save As, rename, delete cancellation and confirmed deletion of a disposable QA project.
- Malformed JSON and unknown project version showed readable errors without crashing or replacing the current scene.
- Exported JSON imported with identical scene/notes and a different project ID.
- Ten lights saved and refreshed with exact scene equality.
- Production build imported a backup, refreshed and restored exact scene state.
- Native JSON file chooser import produced identical scene state with a new ID. Closing and reopening the production tab restored the entire project exactly. The in-app automation download-event bridge timed out; the visible JSON-copy fallback was used to prepare the file for this check.
- Browser console had no runtime errors during these checks.

## Limits / next stage

Browser-local storage is origin/device/profile-specific and can be cleared or evicted; JSON is the portable backup. History does not survive a page reload. There is no collaborative merge: concurrent edits produce a conflict and require Save As or reopening the saved version. GPU/render startup speed remains device-dependent. VS05B/C are not implemented. A future VS05B can consume the validated scene and Shoot Notes to generate a top-view lighting diagram and equipment list.
