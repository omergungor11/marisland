# Architecture Decisions (ADR-lite)

> Every architectural/technology decision goes here. Newest on top.

## D-018: Worldgen owns building variants, field patches and pier reach — 2026-10-03

**Decision** (sweep polish): `LotData.variant` (→ roof/wall colour) is chosen in `world/gen/settlements.ts`
so no two lots within `VILLAGE.roofNeighbour` share a roof colour; `WorldData.fields` (patch rectangles)
+ `fieldColor` (per sample, 5 bible hues, no two neighbouring patches alike) drive the terrain colour
step and fence/crop-row placement; piers extend until `DOCK.endDepth` (3.5 u) / the mid colour band
along the ±4 u shore normal; land pieces < `COAST.minIsletCells` are dropped after coast cleanup.
**Rationale**: the render step picking variants at random produced rows of identical houses; one hay
tint made Millbrook flat; piers ended in the turquoise band; a 9-cell islet sat in seed 1000's bay.
**Impact**: world hashes changed (tests re-pinned); `settlement-props.ts` reads `lot.variant`.

## D-017: One lit program, one depth program; optional attributes on fixed locations — 2026-10-03

**Decision** (TASK-191 program audit):
- The lit factory compiles ONE program (`mar-lit`; `:s` smooth): `bloomIn` / `rim` are per-material
  uniforms (`uMarBloomIn`, `uMarRim`), windmill spin is a branch on `aSpin.w` in every lit / depth
  program (the creature material drops it: 15 of 16 attributes). Was lit / rim / bloom / bloom-rim /
  bloom-rim:spin + 2 depth variants. Clear frames bit-identical.
- Terrain chunks are 1-instance `InstancedMesh`es (identity instance matrix — exact) with the
  factory depth material, so terrain shadows share the props' instanced depth program.
- `wind, ao, aSeed, aAppear, emissive, aSpin, limb, aGait` are declared `layout(location = 8…15)`
  (`ATTR_LOCATION`). three writes `defaultAttributeValues` with `gl.vertexAttrib*` only when it builds
  a VAO, but generic attribute values are context state: with linker-assigned locations another
  program's default leaked in. Before this fix fish read `ao = 0` (sailboat/prop `emissive` default at
  the same location) and rendered black; they now show their content colours (W8/W9 fish pixels
  differ — intended).
- Result (programs): low 12 → 9, medium 20–22 → 15–17, high (T3 + DOF) 28 → 24.
**Rationale**: D-010 budgets (12 / 20 / 24) were exceeded on medium and high; a uniform branch costs
nothing measurable, a program costs a compile + a prewarm stall.
**Alternatives**: raising the budgets; merging the high tilt-shift pass into the bloom pass (changes
bloom input in tilt bands); sailboats with a white `instanceColor` would merge the fish program too
(-1, life/ owner).
**Impact**: ARCHITECTURE §3 Materials, threejs-stylized skill.

## D-016: Governor = DPR steps, then a tier cap; one upgrade per session — 2026-10-03

**Decision** (TASK-191): `core/governor.ts` watches a 1 s rolling p90 (checked every 0.25 s). p90 > 20 ms
for ≥ 2 s steps one level down: DPR ×0.85 per step down to a per-quality floor (low 0.75, medium 1.0,
high 1.25), then the detail tier is capped at 2 (world, tilt-shift and DOF render ≤ T2 while the camera
can still zoom). Steps back up only after ≥ 10 s of p90 < 12 ms and at most once per session. Frames
> 1000 ms are ignored; 1.5 s settle after boot / regen / restore / any step. Off in capture, `perf=1`,
the gallery and frozen photo mode; `?dpr=` pins DPR so only the tier step remains.
**Rationale**: a quality change needs a reload (composer, MSAA, shadows); a tier cap is instant and
keeps the look. One upgrade avoids oscillation.
**Impact**: `governorChanged` event; `debug=stats` shows the level.

## D-015: Weather = seeded FSM → EnvState deltas; mist is a height-fog term; rain fog ×1.3 — 2026-10-03

**Decision** (TASK-172):
- `env/weather.ts`: a seeded Markov FSM {clear, cloudy, rain, fog} over render time. Transition `i`
  draws its next state and dwell from `rng.fork('weather', i)` only (frame-rate independent).
  `?weather=` forces a state (instant, no auto cycle); the HUD button blends to a state over 10 s
  and holds it one dwell; capture (`freeze=1`) applies changes instantly. The blend weights fold
  the per-state looks (`content/weather.ts`) into one `WeatherFx`, applied to EnvState after
  `sampleEnv` and to the shared uniforms. A fully clear blend is the exact identity, so clear
  frames are bit-identical to the pre-weather renderer (checked: every clear dev/wow shot 0 px diff).
- Low mist band = analytic exponential height fog (density at sea level, e-folding 3–4 u)
  integrated camera → fragment in the terrain / prop / water / contact-blob programs
  (`chunks/mist.glsl.ts`, CPU twin `mistAmount`). No mesh, no program; over open sea the amount
  depends only on the view pitch, so one density reads the same at every zoom tier.
- Rain = one InstancedMesh of dithered streak quads in a camera-local wrapped box, drawn with the
  puff material (the puff program got a rain branch, `aKind` 4) → +1 draw call while it rains,
  0 programs (low was exactly at its 12-program budget). Ripples are a procedural term in the
  water shader.
- Weather cloud cover switches extra cells of the periodic cloud field on (one fading in at a
  time; `uCloudCover`), so cloud meshes and their shadows stay aligned.
- Bible weather saturation (−15 % / −20 %) is applied to the sky and fog colours; the light on the
  land only takes `lightTint` of it and the post grade a small delta. Rain fog density ×1.8 → ×1.3:
  with ×1.8 the W10 foliage measured 34 % HSL saturation (criterion ≥ 40 %); with ×1.3 it is 42 %.
**Rationale**: ARCHITECTURE §7; W10 is a pinned shot; program budget on medium is already over.
**Impact**: ART_BIBLE §2 weather table (fog ×1.3, saturation note); +1 draw call in rain, no new
program on any tier.

## D-014: Click bursts ride the creature program; hover is a uniform; reduced motion keys off uMotionScale — 2026-10-03

**Decision**: (1) Click-reaction particles (hearts, sparkles, leaves, "!", puffs) are flat glyph
meshes merged into one geometry drawn with the shared creature material (`limb.w = 6` + per-instance
`aGait.y` pick the glyph; billboarded and animated on the CPU as a closed-form function of the engine
clock) — zero new programs, one draw call (none while nothing is alive). (2) Hover and the
reduced-motion click flash are one `uHover` uniform (instance origin + strength) read by the lit
factory — no per-instance attribute, no extra program. (3) Reduced motion is `SHARED.uMotionScale < 1`
(set from `reducedMotionChanged`): wind/swell ×0.3 and bloom-in becomes a dither fade in the factory
and the contact blobs; nothing else needs a new switch.
**Rationale**: `programs` is at its low-quality budget (12) and the creature material is at the
16-attribute limit (D-013). Before this, nothing wrote `SHARED.uMotionScale`, so reduced motion never
reached the shaders.
**Alternatives**: a dedicated particle `ShaderMaterial` (+1 program, bumps the budget); per-instance
hover colour (`instanceColor` on prop meshes changes the program parameters).

## D-013: One shared creature material for gulls and land life — 2026-10-03

**Decision**: Gulls, villagers, sheep, cats and crabs share a single `ShaderMaterial`
(`src/life/life-material.ts`): per-vertex `limb` id + per-instance `aGait` (x = wing spread /
gait amplitude, z = phase) + `instanceColor`. Creatures cast no shadows.
**Rationale**: A separate material per kind failed to link at the 17th vertex attribute and would
have added programs on a medium budget that is already at 20–22/20; a depth program for creature
shadows would add one more. Limb animation stays closed-form on the GPU.
**Alternatives**: per-kind materials (more programs), CPU skinning (per-frame uploads).

## D-012: Night lights without point lights; bloom blends ADD — 2026-10-03

**Decision** (TASK-171):
- Lantern pools are a per-world RG8 texture (light, ground height) splatted on the CPU from prop
  instances (`content/lighting.ts` POOLS) and added by the terrain, prop and water shaders
  (`render/shaders/chunks/night.glsl.ts`) — no decal mesh, no extra program, no draw call.
- The lighthouse beam is one additive mesh (double cone + lamp flare), one program, hidden by day.
- pmndrs `BloomEffect` uses `BlendFunction.ADD` (default SCREEN computes a + b − ab, which darkens
  HDR pixels > 1 and drew a saturated/rainbow ring around the sun disc). Sun disc HDR 6 → 2.4.
- Night bloom: intensity × 1.6, threshold 1.0 → 0.92, ramped by EnvState.bloom.
- The night grade spares warm lamp-lit pixels by hue (r − b), not only bright ones, so pools fade
  warm → dark instead of flipping per facet.
- The sky moon has its own path (`MOON`, opposite-ish the sun); the sky disc and the water's
  glitter streak follow it. The night key light is an art-directed `MOON.nightKey` (camera-side, so
  village fronts / cliff faces stay ≥ L 12 %), slerped from the sun over 19:00–20:36 and back over
  04:24–05:36 with a 60 % intensity dip. `MOON.yawDeg` is tuned so the pinned W3/W4 cameras see
  the glitter streak. Moon-as-key-light was tried: it back-lit the W4 cliff (L* 0.145 → 0.095).
**Rationale**: ARCHITECTURE §7 ("lantern pools are additive decals, not point lights"); the program
budget is already at its limit on medium (21–22 / 20), so pools must not cost a program.
**Impact**: +1 program (beam) on every quality; ≈ 0.5–1 MB pool texture per world.

## D-011: Cloud width 22–44 u (bible said 12–30 u) — 2026-10-03

**Decision**: `CLOUDS.width = [22, 44]` (TASK-153). Count 6–10, altitude 60–90 u, shadow ×0.82 with a
6 u soft edge unchanged.
**Rationale**: At T0 (450–800 u) a 12–30 u cloud is 15–30 px in the 960 px dev frame and its 0.82
shadow on deep water is barely readable; W1 needs ≥ 2 clearly visible cloud shadows. 22–44 u keeps the
chunky-cute cumulus look at T0 and makes the shadows legible (checked in W1/D-overview shots).
**Impact**: `src/content/anim.ts` (one number pair); ART_BIBLE §3 updated.

## D-010: High-quality program budget 20 → 24 — 2026-10-03

**Decision**: `BUDGETS.high.programs = 24`, `BUDGETS.medium.programs = 20` (was 16; 4 lit prop variants +
their depth variants + terrain/water/sky/post measure 17). DOF stays at T3 on high (ART_BIBLE §3).
**Rationale**: pmndrs `DepthOfFieldEffect` alone compiles 8 programs (CoC, blur, bokeh, mask passes).
With sky, terrain, water, 4 lit variants + depth variants and the post chain, high at T3 measures 22.
Dropping DOF to photo mode only would lose the bible's T3 look; 4 extra programs cost nothing at runtime.
**Impact**: `src/content/budgets.ts`; `shots --assert` thresholds.

## D-009: Fog density 0.00103 (bible curve is not reachable with FogExp2) — 2026-10-03

**Decision**: `FogExp2` density = 0.78 × the fitted 0.00103 ≈ 0.0008 (`content/lighting.ts` FOG), the same
value in `SHARED.uFogDensity` so the water shader fogs identically. (The raw fit turned the T0 postcard grey.)
**Rationale**: three's FogExp2 is `1 − exp(−(d·dist)²)`. The bible asks 10 % @ 200 u, 45 % @ 700 u,
75 % @ 1200 u — no single d satisfies all three; the fit gives ≈ 4 % / 40 % / 78 %. Far islands still
go pastel and never vanish, which is the intent.
**Impact**: W1 ring-colour criterion (#4FD1D9 ±10 %) is evaluated on the `mask` frame, not the fogged
beauty frame.

## D-008: Bloom-in spring damping c=17 (bible says 12) — 2026-10-03

**Decision**: `content/anim.ts` stores the bloom-in spring as `k=180, c=17` (mass 1).
**Rationale**: ART_BIBLE §6 asks for "k=180, c=12 (≈8 % overshoot, ~300 ms)". With c=12 the
closed-form overshoot is 21 % (ζ=0.45). c=17 gives ζ=0.63 → 7.6 % overshoot and first peak at
0.30 s, i.e. exactly the described look. The *look* numbers win over the raw constant.
**Impact**: `springIn` TS/GLSL twins use the content value; spring.test.ts locks the overshoot.

## D-007: Phase 1 = living diorama, building tools in Phase 2 — 2026-10-03

**Decision**: Phase 1 delivers exploration, zoom detail, ambient life, day/night, weather, click
reactions, new seed and photo mode. Building (terrain brush, place/remove props) is Phase 2.
**Rationale**: The user chose this so visual polish gets the most time.
**Impact**: World is data from day 1 (D-005) so Phase 2 does not need a rewrite.

## D-006: Public repo, GitHub Pages deploy, English UI — 2026-10-03

**Decision**: Public `omergungor11/marisland`; every push to `main` deploys to Pages; UI text in
English.
**Rationale**: User choice — live demo link reachable from any device, portfolio-friendly.
**Impact**: Vite `base` from `VITE_BASE`; runtime URLs via `import.meta.env.BASE_URL`.

## D-005: World as pure data, chunked, deterministic — 2026-10-03

**Decision**: Generation produces typed arrays + plain objects with no three.js imports; rendering
derives per 64 u chunk; RNG forks by label.
**Rationale**: Testable in Node, can run in a Worker, Phase 2 edits rebuild only dirty chunks,
screenshots are reproducible.
**Alternatives**: Generating meshes directly — rejected (not editable, not testable headless).

## D-004: InstancedMesh, not BatchedMesh — 2026-10-03

**Decision**: One `InstancedMesh` per (variant, LOD, island group) with custom instanced
attributes.
**Rationale**: BatchedMesh can't carry custom per-instance attributes (`aSeed`, `aAppear`) and
degrades without `WEBGL_multi_draw` (uncertain on iOS).
**Impact**: More draw calls than BatchedMesh; kept within budget by grouping per island.

## D-003: Extend MeshLambertMaterial instead of custom lighting — 2026-10-03

**Decision**: Land and prop materials are `MeshLambertMaterial` + `onBeforeCompile` patches
(wind, bloom-in, dither, rim, emissive). Warm-light/cool-shade comes from light colours (warm sun,
blue-violet hemisphere). Dedicated `ShaderMaterial` only for water, sky, clouds, particles, blobs.
**Rationale**: Keeps three's shadows/fog/instancing working with far less code; research found
this is the standard stylized approach. The architecture draft proposed fully custom lighting.
**Alternatives**: Custom `ShaderMaterial` with three chunks (more control, more breakage);
`three-custom-shader-material` (fallback if string patching gets fragile).

## D-002: Everything procedural, no external assets — 2026-10-03

**Decision**: All geometry and textures are generated in code. Only self-hosted fonts
(`@fontsource`) are bundled.
**Rationale**: The user asked for graphics "produced with three.js"; also no licensing issues and
fully deterministic captures.

## D-001: WebGLRenderer (WebGL2) + pmndrs postprocessing; three pinned 0.186.1 — 2026-10-03

**Decision**: `WebGLRenderer`, GLSL, pmndrs `postprocessing@6.39.5`; `three@0.186.1` exact pin.
**Rationale**: Development happens in a GPU-less cloud container. Playwright Chromium renders
WebGL2 via SwiftShader out of the box; headless WebGPU needs Vulkan drivers + Xvfb + headed Chrome
and WebGPURenderer silently falls back to WebGL2, so tests could pass on the wrong backend. pmndrs
does not work with WebGPURenderer and needs three `<0.187`.
**Alternatives**: WebGPURenderer + TSL (better long-term, GPU compute) — revisit after Phase 1;
GLSL kept inside `src/render/` to contain a future port.
**Impact**: r186 notes — `PCFSoftShadowMap` removed (use `PCFShadowMap`), `THREE.Clock`
deprecated.
