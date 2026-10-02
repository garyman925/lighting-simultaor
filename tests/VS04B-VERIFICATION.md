# VS04B verification — 2026-10-02

## Scope and implementation

Continues the existing VS04A Git history at df5e7e9. No new project, external model, image texture, dependency, VS04C or VS05 implementation.

SkinMaterialParameters and presets are centralized in src/domain/skin.ts; the Three.js material interface lives in src/rendering/skin.ts. Seven numbered swatches, Matte / Natural / Glossy, numeric roughness/F0, subsurface amount and region variation are saved in model.skin. Legacy skinColor remains readable. Tone changes diffuse albedo and pigment absorption independently of neutral dielectric F0. Oil-zone/lip/thin-tissue vertex masks follow the model and leave a reserved makeup channel. The existing shared emitter aperture samples, source power, Kelvin, exposure, beam and Grid feed GGX skin shading. Corneal code and its separate reflection layer are unchanged.

SSS approximation combines normalized diffuse wrap and local thin-tissue transmission from existing shadow-map depth. Depth reconstructed with the pooled shadow camera near/far estimates entry-to-visible-surface thickness; RGB exponential absorption attenuates light through thicker areas. This is not physically exact SSS, spectral transport, or a calibrated diffusion model. No screen-space blur or additional shadow pass is introduced.

Draft: one aperture sample, reduced resolution, no wrap/translucency. Standard: 36 aperture samples, one transmission depth tap. High: 72 aperture samples, four transmission taps, higher preview resolution. Interaction temporarily uses Draft, with selected quality returning after 180ms.

## Automated verification

88/88 Vitest tests passed: all 79 existing tests plus 9 skin/material/GPU-timing tests. New tests cover legacy migration and numeric bounds, preset preservation, fixed A/B state, regional masks, complete skin geometry attributes, neutral reflectance across tones, numeric F0/IOR mapping, quality switching, unavailable GPU extension and disjoint/async result handling.

TypeScript and Vite production build passed. Final JS bundle: index-DgRrTD8I.js. Existing Three.js >500kB chunk advisory remains; no runtime failure or new dependency.

## Actual browser verification

28 recorded assertions passed (evidence/slice-04b/browser-checks.json), across development and production preview. Final production console: no runtime errors. Two early development shader compilation errors were found and corrected before release verification; those are not hidden as successful checks.

Visually inspected real browser captures:

- Same Beauty Dish, camera, model and exposure: Matte has broad subdued highlights; Natural has moderate nose/cheek response; Glossy has tighter, stronger nose/cheek/neck highlights. The geometry remains the original teaching mannequin, not photorealistic anatomy.
- Natural Beauty Dish vs 120cm Softbox: source size changes highlight spread and shadow transition/contrast. Total source power is conserved; optical gain and face illuminance are not equalized artificially.
- Tone 01 and Tone 07 preserve camera exposure and neutral highlights. The darkest tone has much darker diffuse response at fixed exposure; no automatic exposure compensation is applied.
- Roughness .35 / F0 .05 numeric edits immediately update sliders; preset switching restores expected values.
- Back/rim at 135 degrees, elevation 0: SSS off leaves the ears mostly silhouettes; Standard/High show modest warm ear transmission and softer local edge response. High completed all 72 samples. No screen-space halo or gross shader corruption was observed. Thin nose/cheek response is more subtle than the ear effect.
- Draft disables the effect and completes at one sample. Returning to Standard restores 36 samples.
- Catchlight Test, Softbox, Octabox and gridded Stripbox retain emitter-shaped corneal reflections at 300/600 percent. Disabling the light makes the capture black, without a surviving skin or eye glow.
- Production A/B exported JSON confirms unchanged model, camera/exposure and light transform.
- Ten independent lights, all seven equipment types, source-power edits, isolated horizontal/vertical edits and refinement recovery were exercised. The other nine transforms remain unchanged.
- Top / Front / Side / Perspective preserve capture data. Actual translate gizmo drag changes the selected light transform. Aim at Chest, Auto Aim, 15-degree snap selection, strobe shutter sync, ISO, aperture, background, 600-percent inspection isolation, delete-last-light and re-add were exercised. Snap arithmetic and other aiming/camera invariants also remain covered by the original automated tests.

Screenshots and exported ten-light scene are under evidence/slice-04b/. Browser crop API returned mismatched regions during an intermediate capture attempt; those crops were discarded. The supplied comparison uses crops of verified full viewport screenshots.

## Performance and measurement limits

Recorded rolling status-bar means during the ten mixed-light interaction/refinement sequence:

- When Standard had settled to 36 samples: 12.7ms CPU submission, 13.1ms GPU elapsed.
- When Draft had settled to one sample: 11.2ms CPU submission, 11.7ms GPU elapsed.
- Two numeric light edits returned in 25.4ms combined through browser automation; this is interaction latency, not rendering FPS.
- A later single-light High backlight check completed 72 samples and displayed 3.3ms CPU / 9.8ms GPU.

These are recent-frame rolling means including both views, shadow work, interaction and refinement, not isolated per-quality benchmarks. Cold shader compilation and browser background scheduling produced much larger temporary values (including roughly 76ms CPU / 195ms GPU). Final code clears both measurement epochs on visibility changes to avoid mixing background-tab query spans. The sample counts are per fixture; total work also depends on light count and preview dimensions.

GPU values come from EXT_disjoint_timer_query_webgl2, asynchronously read without gl.finish or framebuffer readback. Disjoint results are discarded and pending queries are bounded. Unsupported contexts explicitly show GPU unavailable. Neither CPU nor GPU elapsed is presented as FPS; this demand-rendered application stops after refinement, and no sustained GPU FPS guarantee was established.

## Remaining approximations / next recommendation

The head, lips and ears remain procedural geometry. Single-depth thickness is approximate, particularly at intersections and shadow-map boundaries. Finite aperture samples and 512px shadow maps can produce aliasing/banding under extreme magnification; High reduces sampling noise but cannot fix anatomy. There are no scanned normals/pores, multiple-scattering diffusion, GI, tear film, corneal refraction or measured fixture profiles.

VS04C should reuse model.skin and the mask contract, first improving head topology and eyelid/ear detail while keeping the same fixed material/equipment comparisons. Character creation, makeup and hair libraries have not been started.

Deployment is verified after this commit is pushed; the exact commit/run URLs are recorded in the delivered verification copy and chat response.
