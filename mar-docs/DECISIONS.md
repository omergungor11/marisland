# Architecture Decisions (ADR-lite)

> Every architectural/technology decision goes here. Newest on top.

## D-010: High-quality program budget 20 → 24 — 2026-10-03

**Decision**: `BUDGETS.high.programs = 24`. DOF stays at T3 on high (ART_BIBLE §3).
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
