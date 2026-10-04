# Marisland — Architecture & Phase Plan v1

> This doc covers HOW the engine is built (systems). WHAT it looks like lives in `mar-docs/ART_BIBLE.md`, whose tables become `src/content/*` config. Engine code hardcodes no colours, sizes, tier inventories or animation params. Status: proposed, 2026-10-03.

**Assumptions**
- **A1 – Renderer.** Baseline is `WebGLRenderer` on WebGL2. WebGPU/TSL is not assumed to work headless. GPU-specific code lives only in `render/`, behind a `RendererBackend` interface, plus its GLSL chunks. **Resolved 2026-10-03 (D-001):** WebGLRenderer confirmed — headless SwiftShader works with Playwright out of the box, WebGPU does not reliably; three pinned to 0.186.1 for pmndrs `postprocessing@6.39.5`.
- **A2 – Units.** 1 u = 1 m, sea level y = 0. The archipelago is ≈600×600 u inside a 768 u world. Zoom tiers are the bible's T0–T3.
- **A3 – Determinism.** SwiftShader is CPU-deterministic, so the same URL produces a byte-identical PNG.

**Stack: Vite + TS strict + vanilla three.js (agreed, no React).**
- Why: we own the frame loop (fixed step + manual capture stepping), no reconciler overhead on thousands of instances, fewer layers for agents.
- Pushback: don't hand-roll controls or post. Use `camera-controls` (damping, dolly-to-cursor, `fitToSphere`, touch) and pmndrs `postprocessing` (merges effects into one pass).
- Also: `simplex-noise` (seeded), `@fontsource` Fredoka/Nunito (self-hosted so offline captures are deterministic), `lil-gui` (dev only). Exact versions pinned.

## 1. Module tree & core loop

```
src/
  main.ts, app.ts  boot · composition root (scopes, systems, loop)
  core/            clock, loop, rng (sfc32 + fork(label)), noise, events, scope, params, quality,
                   math/ (spatial-hash, poisson, astar, catmull-rom, EDT, closed-form spring)
  shared/fields.ts swell + gust functions (GLSL twin: render/shaders/fields.glsl)
  world/           PURE TS, no three import — runs in Node/Worker/browser
    gen/           layout, heightfield, coast, zones, settlements, paths, routes, props, ao
    types.ts query.ts (heightAt, depthAt, raycast) edit.ts (Phase 2) hash.ts
  content/         data from the bible: palette, archetypes, prop-defs, placement-rules,
                   detail-tiers, anim-catalog, env-keyframes, weather, budgets, shots
  geo/             procedural mesh builders (bevelled, faceted, vertex-coloured, LOD param)
  render/          backend, materials/ (factory + shared uniforms), shaders/, textures,
                   terrain/, water/, sky/, clouds/, props/ (PropBatcher), shadows, post/
  detail/          zoom-tier FSM, fade/pop scheduler, LOD swap
  life/            agents/ (boats, villagers, critters, gulls, fish), gpu/ (swarms, smoke, rain),
                   ambient-events, reactions
  edit/            Phase 2 editor: session (undo/redo, autosave, share), tools, cursor, ghost
  anim/ env/ camera/ interact/ ui/ (HUD, edit panel) capture/ debug/
```

**Loop: one `Clock`, one RAF.**
- The sim runs at a fixed 30 Hz: agents, boids, weather, ambient events.
- Each frame, in order: controls → detail FSM → EnvState → interpolated agent writes → `uTime = simTime + α·step` → render.
- All GPU motion is a function of `uTime`, so `freeze` also freezes the shaders.
- In capture mode the loop advances only through `step()`.

**Events.** A typed emitter carries low-frequency signals only (`seedChanged`, `tierChanged`, `picked`, `qualityChanged`). Per-frame data is passed by direct references through `Ctx`.

**Dispose.** Each system implements `{init, fixedUpdate?, update?, onTier?, dispose}`.
- Every GPU resource registers in a scope: **app** (renderer, shared materials) or **world** (anything seed-derived).
- New seed = `worldScope.dispose()` then regenerate.
- Check: `?selftest=regen` runs 5 cycles, after which `renderer.info.memory` must be back at baseline.

## 2. World data model & generation

**Model.** Typed arrays, transferable and serialisable.

| Field | Contents |
|---|---|
| `Heightfield` | Float32, 385², **2 u spacing** (the bible's facet edge) |
| `ZoneMap` | Uint8: deep, mid, shallow, lagoon, wet/dry/black sand, grass, meadow, forest, field, rock, cliff, path, plaza, crater |
| `ShoreSDF` | Float32 signed distance to the coastline |
| `PropStore` | SoA: `defId, x, y, z, rotY, scale, variant, islandId, chunkId, flags` |
| Graphs & lists | `islands`, `settlements`, `pathGraph`, `boatRoutes` |

Rendering derives everything **per chunk** (32×32 cells = 64 u). Only chunks with land or water shallower than 35 u get a mesh.

**Pipeline.** Each stage is pure and hashed.
1. **Layout.**
   - Pick 5–7 archetypes. Hearthholm is always in, at least one island is tall, none repeats.
   - Dart-throw with `gap = r₁ + r₂ + 40…90 u`, relax, re-centre.
   - Enforce the neighbour-contrast rule. Names come from a seeded syllable generator.
2. **Heightfield.**
   - Each archetype has a profile function (crescent bay, stack, plateau, cone + crater, atoll, dome, sandbar). Its radius is modulated by domain-warped fbm. Terraces are optional.
   - The seabed falls to −40, with an explicit 3–12 u-deep **shelf** around every coast (this is P3, "islands are rings").
   - Islands combine by smooth-max and are only evaluated inside their bounds.
3. **Coast.** EDT over the land mask → `ShoreSDF`. Wet beach = SDF 0–3 u; dry beach = height < 1.2; cliff where slope > 0.9 or the archetype forces it.
4. **Zones.** Height band × slope × moisture noise × archetype and settlement overrides.
5. **Settlements.** Score flat, sheltered coastal sites; place plaza, then house lots facing paths; dock where water is >2 u deep within 8 u of shore; landmark at its profile anchor.
6. **Paths & routes.**
   - Footpaths: A* with a slope penalty, joining houses, plaza, dock and landmark.
   - Boat routes: A* over water deeper than 1.5 u, smoothed with Catmull-Rom.
7. **Props.**
   - Rules: `{def, zones, density, minDist, slope, heights, clusterNoise, scale, avoid}`.
   - Bridson Poisson per island and layer, in priority order: landmarks → buildings → trees → rocks → bushes → micro → ground cover.
   - A 1 u `OccupancyGrid` blocks overlaps. Phase 2 reuses it.
8. **Bake.** Vertex AO from horizon + crease terms, contact darkening, per-face jitter seeds.

**Determinism.**
- RNG streams fork by **label** (`rng.fork("props:3:pine")`), not by call order. Adding a system never shifts the others.
- ESLint bans `Math.random` and `Date.now` in sim/gen dirs. No iteration over Map/Set.
- Hashes quantise to 1e-4.
- Gen moves to a Worker if it exceeds 150 ms. Capture always runs it synchronously.

## 3. Rendering pipeline

**Materials.**
- One factory extends `MeshLambertMaterial` via `onBeforeCompile` (D-003), keeping three's lights, shadows, fog and instancing.
- Bible §3 lighting comes from light colours first (warm sun, blue-violet hemisphere → cool shade), plus injected fresnel rim and emissive mask; an explicit shadow-tint patch only if the mask metric fails. Dedicated `ShaderMaterial`s only for water, sky, clouds, particles, blobs.
- One lit program (`mar-lit`, `:s` for smooth normals) + one instanced depth program shared by props and terrain (D-016): `WIND, DITHER, EMISSIVE`, windmill spin are always compiled (no-ops without their attribute); look switches `BLOOM_IN` / `RIM` are per-material uniforms. Optional attributes sit on fixed `layout(location)`s. Prewarmed with `compileAsync`; tier changes touch uniforms only.

**Terrain.**
- Non-indexed faceted triangles. Each face gets its palette colour plus seeded jitter and AO. No splat textures.
- LOD0 = 2 u, LOD1 = 4 u (T0 / low tier). Skirts hide seams.
- Shader adds: wet sand that trails the shore lap, caustics under water, a cloud-shadow mask, T3 colour jitter.

**Water.**
- One smooth radial grid, centred on the camera and snapped to its step, radius ≈3 km.
- Swell comes from `shared/fields`. Boats bob on the CPU using the same function, with a parity test.
- **Depth comes from the heightfield texture (R16F), not the depth buffer.** It drives:
  - the lagoon→deep colour ramp, plus alpha (shallow water shows the real seabed)
  - SDF foam bands (`sin(sdf·k − t)` × noise) and a 0.4–0.8 u contact line
  - glints
- A 256² foam-trail texture takes wake and ripple splats.
- Water is the only large transparent pass, with `depthWrite: true` and drawn after opaques so fog/tilt-shift/DOF see the surface. No refraction render target.

**Sky & lights.** Gradient dome (sun, moon, hashed stars); exponential fog in horizon colour; `HemisphereLight` + one `DirectionalLight`.

**Shadows: fitted to the view.**
- Intersect the camera frustum with the slab y ∈ [−2, 40], take its light-space AABB, and snap to texels.
- Casters use a `customDepthMaterial` with the same wind and bloom-in displacement.
- Instanced contact-blob decals on every tier. They are the only shadows on low.

**PropBatcher.**
- `InstancedMesh` per *(variant, LOD, island group)*, plus per-chunk ground cover.
- Per-instance attributes: `aSeed`, `aAppear`, `aTint`.
- Not BatchedMesh: no custom per-instance attributes, and without `WEBGL_multi_draw` (uncertain on iOS) it degrades to one draw per instance. Swappable behind the same interface.
- At T0, forests become per-island **cluster-proxy** blobs that cross-dither with the real trees.

**Post** (pmndrs, a single `EffectPass`)

| Tier | Chain |
|---|---|
| Low | none; canvas `antialias`; renderer tone mapping |
| Medium | half-res bloom (emissive/sun/glints only), tilt-shift per tier, grade, vignette, tone map, FXAA |
| High | Medium + MSAA×4 render target, DOF at T3 and in photo mode |

**Colour.** `ColorManagement` on, sRGB output, palette hex → linear in vertex colours. **`NeutralToneMapping`** keeps palette saturation (AgX desaturates); exposure from EnvState.

## 4. Zoom-dependent detail system

Tiers mirror bible §6 and are evaluated on orbit distance *d*, with **±10% hysteresis**.

| Tier | d (u) | Turned on | Budget focus |
|---|---|---|---|
| T0 | 380–800 | terrain, water, landmarks, cluster proxies, clouds, boat dots, labels | ≤1.5k prop instances |
| T1 | 140–380 | real trees, houses, docks, rocks (LOD1 beyond 250 u), smoke, boat bob | ≤10k instances |
| T2 | 45–140 | bushes, fences, lanterns, villagers, sheep, fish jumps; clouds off | ≤40 agents |
| T3 | 12–45 | ground cover within 60 u of focus, shells, crabs, reeds, underwater fish | §8 cap |

**Mechanics.**
- **Tier FSM.** Gates CPU-side work: spawning, ground-cover chunks, LOD buffer swaps (once per transition), labels, post params.
- **Per-instance fade.** Each category has `fadeNear`/`fadeFar`, evaluated in the vertex shader from the instance origin, and fades by Bayer-dither `discard`. Everything stays opaque.
- **Bloom-in.** The spring (k=180, c=12) is solved **in closed form in the shader** from `aAppear`. The CPU only queues start times: 0–220 ms stagger, ≤40 per frame. Grass and flowers dither in instead.
- **`counters.hardPops`.** Counts instances that appear with neither bloom-in nor dither. Must stay 0 (W8).

## 5. Life & animation

**GPU, stateless.** Everything here is `f(uTime, aSeed, worldPos)`:
- gust field + idle sway + canopy squash
- grass, fronds, laundry
- windmill blades (vertex-group rotation), lighthouse beam
- gull specks, T2 fish shoals, smoke puffs, fireflies, rain

**CPU agents.** Run at 30 Hz, pooled into one `InstancedMesh` per kind.
- **Boats:** move by arc length along their routes, with heel, bob and wake splats.
- **Villagers:** walk the path graph and run an idle FSM (they wave at a nearby camera).
- **Critters** (crabs, sheep, cats): wander inside a zone mask.
- **Gulls** (from T2) and **fish schools** (T3): boids. Fish scatter from the cursor.
- **Ambient events:** a seeded Poisson scheduler fires fish jumps, splashes and coconut drops.

**Sim LOD.** Off-screen or off-tier agents advance analytically, or at 5 Hz. Capture runs `simt` worth of fixed warm-up steps, so agent state is deterministic.

**Anim.** `anim/` provides easings, a tween pool, and a spring that takes the bible's `k, c`.
- Reactions are data: `squash | hop | spin | wobble | emote`, plus a particle burst.
- Only the clicked instance's matrix animates.

**Picking.** No GPU picking, no mesh raycasts.
1. March and bisect the ray against the heightfield.
2. Take spatial-hash candidates near the ray.
3. Test their PropDef proxies (cylinder or sphere) and agent spheres. Nearest wins.

Hover runs at 10 Hz and shows as a tint.

**Reduced motion** (OS setting or in-app toggle): wind/swell ×0.3, no intro or orbit, reactions become a tint, bloom-in becomes a dither.

## 6. Camera & interaction

`camera-controls`, perspective camera, FOV 35° (photo mode: 15–60°).

**Input.**
- Left drag: pan.
- Right drag / two-finger twist: rotate.
- Wheel / pinch: zoom with `dollyToCursor`.
- A click counts only if the pointer moved <6 px within <300 ms.

**Bounds.** Distance 12–800 u (the zoom-out limit grows to the fitted overview on portrait screens). Polar angle is clamped by the pitch curve ± slack (down to 8° at ≤ 50 u for horizon views, D-017). Target is clamped to the archipelago AABB. Camera y ≥ terrain + 3.

**Presets** (D-017). `overview`, `village`, `dock` and the hero `island:` framing fit generated points (shelf rings, lots, piers) into the safe area (HUD dock + label row excluded when the HUD is on) — `camera/poses.ts`, numbers in `content/camera.ts`.

**Focus.**
- Double-clicking an island or tapping its label calls `fitToSphere`.
- The intro (bible §8) is a keyframed spline plus a cloud-curtain, which New Seed reuses. Any input, `intro=0`, capture mode or reduced motion skips it.
- After 30 s idle, the camera slowly orbits.

## 7. Day/night & weather

**EnvState.** `env-keyframes` are sampled into one `EnvState`:
- sun/moon direction and colour
- hemisphere colours and fog
- sky gradient and water tint
- exposure, bloom, night emissive factor, star alpha

EnvState is written to **shared uniform objects** that every material references, so it costs one write per frame.

**Night.** Emissive masks × night factor → bloom. Lantern pools are additive decals, not point lights.

**Weather.**
- A seeded FSM {clear, cloudy, rain, fog}; `?weather=` forces a state.
- Presets blend into EnvState deltas over ≈10 s: cloud coverage, gusts, swell, fog, sun.
- **Rain:** a camera-local wrapped box of instanced streaks, plus procedural ripple rings.
- **Clouds:** 6–10 opaque puffs spawned at the peaks of a noise field and advected by wind. The cloud-shadow mask samples the *same* field, so shadows line up without a shadow map.
- **Fog:** exponential plus a low mist band.

## 8. Performance budget

These are worst case across tiers. CI enforces them **as counts**, because fps under SwiftShader is meaningless.

| Metric | Low (phone) | Medium | High (M1 Air) |
|---|---|---|---|
| DPR cap | 1.0 | 1.5 | 1.75 (governor → 1.5) |
| Draw calls incl. shadow | ≤120 | ≤220 | ≤350 |
| Triangles | ≤350k | ≤800k | ≤1.6M |
| Prop instances in view | ≤6k | ≤15k | ≤30k |
| Ground cover | ≤3k | ≤12k | ≤30k |
| CPU agents | ≤25 | ≤50 | ≤90 |
| Particles | ≤2k | ≤6k | ≤12k |
| Shadow map | blobs | 1024² | 2048² |
| Shader programs | ≤12 | ≤16 | ≤20 |
| GPU memory (tex + RTs) | ≤40 MB | ≤90 MB | ≤160 MB |
| JS heap | ≤120 MB | ≤180 MB | ≤250 MB |
| Main thread per frame | ≤8 ms | ≤6 ms | ≤5 ms |
| New seed (gen + build) | ≤1.5 s | ≤0.8 s | ≤0.5 s |

**Measurement.** Stats overlay (fps, CPU ms, `renderer.info`, tiers). Every capture manifest stores `renderer.info`; `shots --assert` checks it against `content/budgets.ts`. `?perf=1` flies a 10 s path and reports p50/p95 frame time (GPU timer where available) — real GPUs only.

**Auto quality.**
- Initial pick from: the renderer string (SwiftShader → low), `deviceMemory`, core count, touch support, screen size.
- **Governor:** if p90 frame time > 20 ms, drop DPR first, then the tier. Upgrades happen at most once.
- `?quality=` or Settings overrides it. The result persists in localStorage, wrapped in try/catch.

## 9. Testing & visual QA

**Capture params.**

| Param | Values |
|---|---|
| `seed` | world seed |
| `shot` | bible W1–W10 or a dev `D*` preset |
| `cam` | `overview`, `island:<name>`, `village`, `dock`, `macro-beach`, or raw `x,y,z,tx,ty,tz` |
| `time` | `0.35` or `15:00` |
| `weather` | weather state |
| `simt` | sim warm-up time |
| `freeze=1` | no intro, governor or orbit; RAF stops once ready |
| `quality`, `dpr`, `hud` | overrides |
| `debug` | `stats`, `mask`, `overdraw`, `wire` |
| `perf` | perf sample run |
| `selftest` | `regen` or `rebuild` |

**Ready sequence:** fonts → gen → build → `compileAsync` → warm-up steps (bloom-ins complete instantly) → 3 frames → `window.__marisland.ready = true`.

`__marisland` exposes `{ready, error, worldHash, tier, info, timings, counters, step(dt,n), setCamera, pick(x,y), perf}`.

**`pnpm shots [ci|dev|wow] [--assert] [--gpu]`**
- Builds the app, serves it with `vite preview`, and opens Playwright Chromium with `--use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist`. `--gpu` drops those flags for runs on the Mac.
- Waits up to 180 s for ready, then captures:
  - the PNG
  - an optional **`mask` frame**: flat semantic colours that make bible §11 checks computable (ring hue coverage, min land luminance, shadow hue)
  - an optional `+Δt` frame for motion checks
- Writes `manifest.json` (timings, info, metrics, hash) and a labelled `contact.jpg`.
- Shot sets:
  - `ci`: 4 shots, 640×360, low
  - `dev`: ≈12 shots, 960×540 (2 seeds overview, island, village, dock, shore, macro, golden hour, night, rain, fog, mobile 390×844)
  - `wow`: W1–W10 at 1920×1080
- Fails on: a blank frame (luminance σ < 0.02), shader-error magenta, `__marisland.error`, a budget breach, or `hardPops > 0`.

**Agent review, every milestone.**
1. Run `shots dev`.
2. Read `contact.jpg` (one image). Open single PNGs only when something looks off.
3. Score against `mar-docs/VISUAL_QA.md` (bible §11 + global fails) and log the verdict.
4. Commit the contact sheet as `mar-docs/shots/M<n>.jpg`.

The user signs off on a real GPU at M2, M5 and M8.

**Vitest (Node):** fork independence; stage-hash snapshots (seeds 1, 42, 1001); 500-seed property tests (roster rules, channel depth >12 u, rings, reachable docks, no overlaps); `shared/fields` parity; FSM hysteresis; spring overshoot; gen-time budget. **Pixel determinism:** the same shot captured twice must be byte-identical.

**CI (`ci.yml`, PR + push).** install (frozen lockfile) → typecheck → lint (eslint + prettier) → test → build → `shots ci --assert` → upload artifact.

**Deploy (`deploy.yml`, push to main).**
- `VITE_BASE=/marisland/` feeds `base: process.env.VITE_BASE ?? '/'`. Runtime URLs go through `import.meta.env.BASE_URL`.
- Then `upload-pages-artifact` → `deploy-pages`.

**TS.** `strict`, with `noUncheckedIndexedAccess` off because of typed-array hot loops.

## 10. Phase plan

A milestone is done when `shots dev` passes review and is visibly better than the last one.

### Phase 0 — Tooling & harness
These replace the template's TASK-001..007 placeholders.

| ID | Task | Role | Size | Deps | Acceptance |
|---|---|---|---|---|---|
| TASK-001 | Scaffold: Vite, TS, pnpm, ESLint (random ban), Prettier, Vitest, `VITE_BASE` | devops | S | – | typecheck, lint, test and build all green; preview works under `/marisland/` |
| TASK-002 | `core/`: clock, loop, scope, params, rng, noise, events, quality | engine | M | 001 | Fork-independence test passes; fixed-step count is exact |
| TASK-003 | WebGLBackend, loader, test scene, `__marisland` ready/error | engine | M | 002 | Ready in ≤5 s; a thrown error sets `error` |
| TASK-004 | `shots` harness: sets, manifest, contact sheet, fail checks | qa | M | 003 | Runs in the cloud container; non-zero exit on a blank frame |
| TASK-005 | `ci.yml` + `deploy.yml` | devops | S | 001,004 | PR gets the shots artifact; main deploys to Pages |
| TASK-006 | Stats overlay, `debug=` views | engine | S | 003 | Calls, tris and programs show in the overlay and the manifest |
| TASK-007 | Verify D-001 in the container (renderer string, HalfFloat+MSAA through pmndrs); write VISUAL_QA.md; refresh tech-stack/conventions | docs | S | 003 | Smoke result in MEMORY; VISUAL_QA.md exists |

### Phase 1 — Living diorama

| ID | Task | Role | Size | Deps | Acceptance |
|---|---|---|---|---|---|
| **M1 One island** | | | | | *Overview + shore read as an island* |
| TASK-101 | Single-island heightfield, shelf, zones, SDF, hashes | worldgen | M | 002 | Hash snapshot; shelf on 100% of the coast |
| TASK-102 | Terrain mesher: facets, jitter, AO, LOD, skirts | shader | M | 101,003 | No seam cracks |
| TASK-103 | Water: swell, depth ramp/alpha, SDF foam, glints | shader | L | 101 | 4 depth bands; foam moves over 2 s; parity test |
| TASK-104 | Material factory, sky, fog, lights, fitted shadows, post | shader | M | 102 | Shadow hue/L mask metric passes; no acne |
| TASK-105 | Camera wrapper, presets, pitch curve, bounds | engine | S | 003 | Two runs give identical pixels |
| **M2 Archipelago** | | | | | *3 seeds × 5–7 distinct islands* |
| TASK-111 | Layout, roster rules, names, channels | worldgen | M | 101 | 500-seed property tests pass |
| TASK-112 | Archetype profiles, cliffs, black sand | worldgen | L | 111 | Each archetype distinct in its `island:` shot |
| TASK-113 | New-seed regen, cloud-curtain, labels, pinned W-seeds | engine | M | 111,102 | `regen` returns to baseline; labels don't overlap |
| **M3 Vegetation** | | | | | *Forests, palms, sway* |
| TASK-121 | `geo/` builders for the bible vegetation | props | M | 003 | `?gallery=1` shows every def × LOD |
| TASK-122 | PropDefs, rules, Poisson, OccupancyGrid | worldgen | M | 112 | No overlaps; density within ±10% |
| TASK-123 | PropBatcher, ground cover, blobs, cluster proxies | engine | M | 121,122 | Draw calls within budget |
| TASK-124 | Wind, bloom-in, dither, depth parity | shader | M | 123 | ≤12 programs; Δt diff touches foliage only |
| **M4 Settlements** | | | | | *Village, dock, landmarks* |
| TASK-131 | Sites, lots, paths, docks, landmark anchors | worldgen | L | 122 | Every house connected; docks deeper than 2 u |
| TASK-132 | Buildings, landmarks, micro props, emissive masks | props | L | 121 | Village and dock shots pass QA |
| TASK-133 | Boat routes | worldgen | S | 131 | Route depth ≥1.5 u |
| **M5 Zoom detail** | | | | | *5-step zoom ladder* |
| TASK-141 | Tier FSM, fades, LOD swap, pop queue | engine | M | 124 | W8 dolly-in: `hardPops` = 0 |
| TASK-142 | `budgets.ts` + `--assert` | qa | S | 141 | CI fails on an injected breach |
| **M6 Sea & sky life** | | | | | *Boats, gulls, clouds* |
| TASK-151 | Agent framework, boats, foam trail | life | M | 133,141 | `simt` 0 vs 30 differ, both deterministic |
| TASK-152 | Gulls, fish, ambient scheduler | life | M | 151 | Visible in the dock and shore shots |
| TASK-153 | Clouds + aligned shadows, smoke, steam | shader | M | 104 | W1 ≥2 cloud shadows; W5 steam passes |
| **M7 Land life & interaction** | | | | | *Villagers, reaction frame* |
| TASK-161 | Villagers, cats, sheep, crabs | life | M | 151,131 | W7 sheep check passes; no synced phases |
| TASK-162 | Picking, hover, reactions, reduced motion | life | M | 161 | `pick(x,y)` returns the expected id |
| **M8 Day/night & weather** | | | | | *Time ladder × weather* |
| TASK-171 | EnvState, sky bodies, night emissives, beam | shader | M | 104,132 | W3 and W4 pass |
| TASK-172 | Weather FSM, rain, ripples, mist | shader | M | 171 | W10 and the fog shot pass |
| **M9 Camera/HUD/photo** | | | | | *HUD, mobile, photo* |
| TASK-181 | Intro, fly-to, orbit, touch, compass | engine | M | 105,113 | Intro frames match bible §8 |
| TASK-182 | HUD dock, time dial, photo mode + PNG export | engine | M | 181 | No overlap at 390×844 |
| **M10 Hardening** | | | | | *W1–W10* |
| TASK-191 | Governor, prewarm, context-loss regen, `perf=1` | engine | M | all | All budgets pass |
| TASK-192 | 10-seed sweep; user checks M1 60 fps / phone 30 fps | qa | M | 191 | VISUAL_QA all green |
| TASK-193 | README, MEMORY gotchas | docs | S | 192 | Merged |

### Phase 2 — Sandbox (built: M11–M13, D-020)
What was built (the sketch it replaces: commands with inverses, dirty-chunk rebuild, OccupancyGrid
validation, ghost previews, seed + versioned edit log in localStorage / the URL — all kept):

- **Model** (`world/edit.ts`, `world/edit-derive.ts`, contract `world/edit-types.ts`): `applyEdit(world,
  cmd)` mutates `WorldData` in place for raise / lower / flatten / smooth / paint / propAdd / propRemove /
  propMove and returns byte-exact inverses (a private `patch` kind restores samples and prop slots
  verbatim) plus an exact `DirtyRegion`. Zones are re-derived locally (painted cells win until their
  height changes); the shore SDF is maintained incrementally through nearest-site maps, not a windowed
  EDT. `canPlace` validates placement against the OccupancyGrid, water and slope. `pathGraph` and island
  metadata are not rebuilt (paths may float).
- **Log** (`encodeLog` / `decodeLog`): sync base64url of a varint stream on a fixed grid (1/16 u,
  1/256 strength, 1/4096 turn), versioned, ~2.7 KB per 200 commands. `?edit=` is replayed right after
  `generateWorld`, before the first build (no rebuild path at boot).
- **Live rebuild** (`render/rebuild.ts`, `WorldView.rebuildDirty`): ≤ 2 chunks remeshed per frame (all
  at once in capture), height / SDF textures updated by `texSubImage2D` sub-rects, the PropBatcher rewrites
  touched instances and grows groups with headroom; removed props fade out through a reversed `aAppear`.
- **Editor** (`edit/`): `EditSession` (apply → rebuild → log → debounced autosave
  `marisland.edit.<seed>.v1`, undo/redo where a stroke is one step, share URL), tools + stroke sampler,
  brush ring (terrain `uBrush`), ghost prop through the shared lit program, input routing (`E`, Esc,
  `Ctrl/⌘+Z`, `[` `]`; left / one-finger drag edits, two fingers navigate). Capture never creates it.
- **Panel** (`ui/edit-panel.ts`, TASK-221): the HUD dock's brush button (or `E`) folds the dock into the
  panel — tool row, size / strength sliders, zone swatches, a prop picker with thumbnails, undo / redo,
  share (clipboard + toast), two-tap reset, an "edited · N changes" tab. Desktop card / portrait bottom
  sheet / landscape side sheet; labels avoid whichever box it is. `editModeChanged` ↔ `hud.openPanel`
  keep the key, the button, Done, Esc and photo mode (which leaves edit mode) in step. While editing the
  governor holds and the detail-tier cap is lifted; idle orbit and the intro stop.
- **Thumbnails** (`ui/edit-thumbs.ts`): each placeable def is built like a batcher instance and rendered
  once through the prop material by a short-lived second `WebGLRenderer` into a 64 px atlas (neutral
  daylight: the shared night / lamp / cloud / mist / pool / hover uniforms are swapped for the synchronous
  render and restored), read back once and cached as PNG data URLs; the renderer, its context and every
  geometry / material are disposed right after, so the main renderer's programs and memory counters are
  untouched. Lazy: shortly after the first panel open (at once when the place tool is picked).
- **Capture**: `panel=edit[:tool]` shows a static panel (no edit mode under `freeze=1`); the `edit` shot
  set (`content/shots.ts` `EDIT_LOGS`) replays encoded logs on seed 1001.

## 11. Risks & mitigations

| # | Risk | Mitigation |
|---|---|---|
| R1 | SwiftShader is slow and times out | Small dev/CI resolutions; ≤20 programs; 3 settle frames; 180 s timeout; `wow` set only at milestones |
| R2 | SwiftShader output differs from real GPUs | R16F textures only; no reliance on multi_draw or float-linear filtering; `--gpu` runs plus user gates |
| R3 | Shader compile hitches | Fixed define set; `compileAsync` behind the loader; tier changes are uniform-only |
| R4 | Mobile memory and context loss | DPR 1 and no post on low; free CPU copies of geometry after upload; rebuild from seed on context loss |
| R5 | Overdraw (foliage, foam, clouds, rain) | Opaque geometric foliage; foam inside the water pass; opaque clouds; dither instead of blend; capped rain; `debug=overdraw` checked at M3 and M8 |
| R6 | Determinism drift | Lint ban, label-forked RNG, stage hashes, pixel-identical CI check |
| R7 | "Wow" falls short, or the agent misjudges it | Mask-metric checks; contact-sheet reviews; tunables live in `content/` + lil-gui; user gates |
| R8 | Phase 2 retrofit pain | World-as-data from day 1; per-chunk derivation; `regen`/`rebuild` self-tests in CI |
