# VS04A verification — 2026-10-02

## Automated checks

- 79/79 Vitest tests passed: 63 existing + 16 portrait/cornea/quality tests, five files.
- TypeScript project build passed; Vite production build passed.
- Existing Vite advisory remains: the shared Three.js bundle is just over 500 kB before gzip. No new dependency or external model was added.
- New coverage: layered eyes and material ownership, finite used geometry/normals, all seven direct apertures agreeing with reflection geometry, emitter world transforms, disabled/zero-power radiance, dish size/energy conservation, Grid transmission without aperture change, exposure/independent duplicates, deterministic test preset and legacy quality values.

## Actual browser verification

Tested the running application in the Codex in-app Chromium browser, then its production bundle. Screenshots are browser captures, not generated illustrations. The comparison contact sheet only crops existing captures.

27 recorded browser assertions passed, with no recorded runtime console errors. Raw checks, screenshots and the exported ten-light scene are in `evidence/slice-04a/`.

Visual inspections on fixed Catchlight Test camera/model/exposure:

- Softbox 60×90: rectangular catchlight; Octabox 90: polygonal/near-round; Beauty Dish 55: smaller annulus with deflector; Stripbox 30×120: narrow vertical reflection.
- Beauty Dish 42, 55, 70: increasing visible reflection size at unchanged pose/exposure. Surface brightness changes because total source power is conserved.
- Moving the softbox from Z≈1.10m to Z=2.30m with Auto Aim reduced angular reflection size and direct illumination; moving it to the other side moved the reflected highlight. At larger angles the opposite eye can lose its highlight to the nose visibility approximation.
- Stripbox aimed frontally, then world Z rotated 90°: reflection changed from vertical to horizontal, without a modifier switch.
- Grid retained the aperture shape while changing beam/transmission. Disabling the only light produced a black capture with no surviving catchlight.
- Two lights at different sides produced independent reflections, with nose-side visibility differing between eyes.
- Fit/Face/Eyes inspection modes worked. Exported camera and model were identical before/after zoom; exposure is part of the same camera comparison.
- No Studio gizmos, aiming arrows, fixture visuals or grid appeared in the capture.

Regression checks:

- Ten lights could be duplicated, edited and switched among equipment; Umbrella, Snoot and Bare Reflector were also exercised in the UI. All seven types have automated coverage.
- Actual translate gizmo drag changed the selected light X from 1.05 to 1.22m. Actual rotation-ring drag changed the quaternion by 30° with 15° snap enabled. The other nine lights remained byte-for-byte equal in exported JSON.
- Top/Front/Side/Perspective, Orbit, Shift-drag Pan, wheel Zoom and Reset View responded. Exported capture camera and light transforms were unchanged by navigation.
- Horizontal 37°, vertical 12°, Face/Chest/Center aiming, rotation snap, Reset Scene, Three-Light Preset, focal length, ISO and background were checked.
- Beauty Portrait preserved the previously edited camera/exposure and background.

## Performance observations

At ten lights, Draft completed at one shadow sample per fixture and Standard resumed to 36 samples. Numeric horizontal/vertical UI actions returned in 68ms combined in the browser automation; this is interaction latency, not frame rate. The displayed rolling CPU submission average was 3.3ms after Standard refinement and around 7.4ms after subsequent navigation/gizmo work on this machine. These are CPU measurements, **not GPU timings or a guaranteed FPS**. Initial shader compilation and High refinement can take longer.

Draft uses one pooled shadow light; Standard/High reuse nine shadow lights. Corneas require no cube captures or extra shadow maps, and the model/materials are not reconstructed during ordinary changes. Refinement stops once the selected sample budget is reached.

## Physical and visual limits

Original procedural lighting-study anatomy, not a scanned photorealistic human. Smooth dielectric first-surface reflection; no corneal refraction, tear film, microfacet roughness integration, GI or reflected scene objects. Camera-visible eyelid occlusion uses real depth; incoming nose occlusion is a conservative ellipsoid. Arbitrary external objects/eyelashes are not ray-traced reflection blockers. Generic dish/umbrella surfaces and existing spotlight profiles are uncalibrated approximations. Extreme eye zoom can reveal shadow-map aliasing.

VS04B can next add controlled skin roughness/specular settings and a measured SSS approximation behind the new material baseline. VS04B/VS04C were not started.

