# Phase 1: Living diorama

> **Skills by role** (read before starting a task): `worldgen` → `island-worldgen` ·
> `shader` / `engine` / `props` → `threejs-stylized` · `life` → `cute-motion` ·
> every task with a visible result → `visual-qa`. Content numbers always come from
> `mar-docs/ART_BIBLE.md` (§2 palette, §4 islands, §5 props, §6 zoom tiers, §7 animation, §11 shots).

## M1 — One island

*Overview + shore read as an island*

### TASK-101: Single-island heightfield, shelf, zones, SDF, hashes

**Agent**: worldgen | **Complexity**: M | **Status**: PENDING | **Dependencies**: TASK-002

### Acceptance Criteria
- [ ] Heightfield generated at 2 u spacing (385² resolution)
- [ ] 3–12 u shelf around coast explicitly added
- [ ] Zone map (deep/mid/shallow/lagoon/sand types/vegetation/terrain types) derived from height and moisture
- [ ] Shore signed-distance field (SDF) computed correctly
- [ ] Hash snapshot captures exact output for determinism test
- [ ] 100% of coastline has shelf (every wet beach and cliff is edge-consistent)

### Notes
See ARCHITECTURE §2 (world model) for heightfield spec and zone definitions. ARCHITECTURE §9 mentions hash snapshots for stage validation. Props later check SDF for placement rules (TASK-122).

---

### TASK-102: Terrain mesher: facets, jitter, AO, LOD, skirts

**Agent**: shader | **Complexity**: M | **Status**: PENDING | **Dependencies**: TASK-101, TASK-003

### Acceptance Criteria
- [ ] Per-chunk (32×32 cells) faceted (non-indexed) triangle mesh generated
- [ ] Per-face seeded jitter applied; AO baked from horizon and crease terms
- [ ] LOD0 at 2 u, LOD1 at 4 u (≤2 levels per tier)
- [ ] Skirts hide seams at chunk boundaries
- [ ] Mesh uploads to GPU with vertex colours (palette indices)
- [ ] No visible cracks on terrain surface in overview shot

### Notes
See ARCHITECTURE §3 (terrain rendering) and §1 (geo/ module). LOD is per-chunk; camera distance determines active level per tier.

---

### TASK-103: Water: swell, depth ramp/alpha, SDF foam, glints

**Agent**: shader | **Complexity**: L | **Status**: PENDING | **Dependencies**: TASK-101

### Acceptance Criteria
- [ ] One smooth radial grid centred on camera, snapped to step size, radius ≈3 km
- [ ] Swell from `shared/fields` function (sine wave trains with time-varying direction)
- [ ] Depth sourced from heightfield texture (R16F); drives colour ramp and alpha
- [ ] 4 distinct depth bands rendered (deep → shallow)
- [ ] SDF foam bands: `sin(sdf·k − t)` × noise over 2 s cycle; contact line 0.4–0.8 u
- [ ] Foam trails texture captures wake and ripple splats
- [ ] Parity test: boats bob on CPU using same swell function; positions match
- [ ] Glints visible on water surface in bright conditions

### Notes
See ARCHITECTURE §3 (water) and §2 (coast, shelf). Depth texture is shared with terrain chunk generation. Parity test ensures boat/water swell sync.

---

### TASK-104: Material factory, sky, fog, lights, fitted shadows, post

**Agent**: shader | **Complexity**: M | **Status**: PENDING | **Dependencies**: TASK-102

### Acceptance Criteria
- [ ] ShaderMaterial factory builds custom materials with shadow/fog/instancing chunks
- [ ] Lighting: warm sun + blue-violet shade, hemisphere term, fresnel rim, emissive mask
- [ ] Features gated by fixed defines (INSTANCED, WIND, BLOOM_IN, DITHER, EMISSIVE, SMOOTH); precompiled
- [ ] Sky gradient dome (sun, moon, stars); exponential fog in horizon colour
- [ ] HemisphereLight + one DirectionalLight configured
- [ ] Shadows: frustum × slab y ∈ [−2, 40] intersected, snapped to texels; contact-blob decals on all tiers
- [ ] Post chain (pmndrs EffectPass): bloom (half-res, emissive only), tilt-shift, grade, vignette, tone map
- [ ] NeutralToneMapping preserves palette saturation
- [ ] Shadow hue/luminance mask metric passes
- [ ] No shadow acne on terrain

### Notes
See ARCHITECTURE §3 (materials, lighting, post). Each tier has different post params (none at T0, full at high). Design is in ART_BIBLE §3 (Lighting & atmosphere).

---

### TASK-105: Camera wrapper, presets, pitch curve, bounds

**Agent**: engine | **Complexity**: S | **Status**: PENDING | **Dependencies**: TASK-003

### Acceptance Criteria
- [ ] `camera-controls` wrapper: damping, dolly-to-cursor, `fitToSphere`, touch support
- [ ] FOV 35° (photo mode: 15–60°)
- [ ] Input: left drag pan, right drag/two-finger rotate, wheel/pinch zoom
- [ ] Distance bounds 12–800 u; polar angle clamped by pitch curve
- [ ] Target clamped to archipelago AABB; camera y ≥ terrain + 3
- [ ] Preset cameras: overview, island:name, village, dock, macro-beach, or raw x,y,z,tx,ty,tz
- [ ] Two identical runs produce byte-identical pixels (determinism check)

### Notes
See ARCHITECTURE §6 (camera). Pitch curve prevents extreme views. Determinism test runs the same camera path twice and compares pixels byte-for-byte.

---

## M2 — Archipelago

*3 seeds × 5–7 distinct islands*

### TASK-111: Layout, roster rules, names, channels

**Agent**: worldgen | **Complexity**: M | **Status**: PENDING | **Dependencies**: TASK-101

### Acceptance Criteria
- [ ] Layout algorithm picks 5–7 archetypes; Hearthholm always in, ≥1 tall island, no repeats
- [ ] Dart-throw with gap = r₁ + r₂ + 40…90 u; relaxation and re-centering applied
- [ ] Neighbour-contrast rule enforced (adjacent islands sufficiently different in profile)
- [ ] Names generated from seeded syllable bank; unique per seed
- [ ] Channels (water between islands) have depth ≥1.5 u for boat routes (TASK-133 validates)
- [ ] 500-seed property tests pass (every seed produces valid islands; no overlaps, all connected)

### Notes
See ARCHITECTURE §2 (layout pipeline step 1) and §4 (roster archetypes in ART_BIBLE). Property tests are deterministic and run in CI.

---

### TASK-112: Archetype profiles, cliffs, black sand

**Agent**: worldgen | **Complexity**: L | **Status**: PENDING | **Dependencies**: TASK-111

### Acceptance Criteria
- [ ] Each archetype has profile function (crescent bay, stack, plateau, cone + crater, atoll, dome, sandbar)
- [ ] Radius modulated by domain-warped fbm; terraces optional per archetype
- [ ] Seabed falls to −40; shelf explicitly 3–12 u deep around coast
- [ ] Islands combine via smooth-max; evaluated only inside bounds
- [ ] Cliffs where slope > 0.9 or archetype forces it
- [ ] Black sand zones placed where wet beach + specific conditions met
- [ ] Each archetype visibly distinct in its `?island:name` shot (no two archetypes look identical)

### Notes
See ARCHITECTURE §2 (heightfield pipeline step 2). Archetype-specific visual rules are in ART_BIBLE §4 (Island roster). Black sand is a special zone variant (ART_BIBLE §2 palette).

---

### TASK-113: New-seed regen, cloud-curtain, labels, pinned W-seeds

**Agent**: engine | **Complexity**: M | **Status**: PENDING | **Dependencies**: TASK-111, TASK-102

### Acceptance Criteria
- [ ] New Seed button triggers `worldScope.dispose()` then regenerate
- [ ] Cloud-curtain (from intro) plays during regen for visual continuity
- [ ] Island labels generated and positioned; no overlap at T3 zoom level
- [ ] Pinned W-seeds (W1–W10) stored in content; double-click "preset name" or camera `?island:name` loads it
- [ ] `?regen` selftest runs 5 cycles; after last, `renderer.info.memory` matches baseline ±margin
- [ ] Labels don't jump between regens; positioned consistently per island name

### Notes
See ARCHITECTURE §6 (focus, intro) and §9 (capture, selftest). Cloud-curtain is both aesthetic and masks the generation pause. W-seeds are in `content/shots.ts`.

---

## M3 — Vegetation

*Forests, palms, sway*

### TASK-121: `geo/` builders for the bible vegetation

**Agent**: props | **Complexity**: M | **Status**: PENDING | **Dependencies**: TASK-003

### Acceptance Criteria
- [ ] Procedural mesh builders for every prop type in ART_BIBLE §5 (Prop catalog)
- [ ] Builders produce geometry with vertex colours, normals, optional LOD variants
- [ ] Palm tree builder: trunk + fronds with wind deformation capability
- [ ] Tree builder: variants (oak, pine, etc.) with branch silhouettes
- [ ] Rock, bush, fence, lantern builders
- [ ] All builders use seeded RNG (label-fork) for reproducibility
- [ ] `?gallery=1` shows every def × every LOD variant in a grid
- [ ] No external mesh files; all generated at runtime

### Notes
See ARCHITECTURE §3 (PropBatcher) and ART_BIBLE §5. Vertex colours encode material IDs for shader variation. LOD variants are authored as mesh factories with explicit detail levels.

---

### TASK-122: PropDefs, rules, Poisson, OccupancyGrid

**Agent**: worldgen | **Complexity**: M | **Status**: PENDING | **Dependencies**: TASK-112

### Acceptance Criteria
- [ ] PropDef schema: `{def, zones, density, minDist, slope, heights, clusterNoise, scale, avoid}`
- [ ] Placement rules loaded from ART_BIBLE §5; each rule specifies which zones accept the prop
- [ ] Bridson Poisson disc sampling per island and layer (priority: landmarks → buildings → trees → rocks → bushes → micro → ground cover)
- [ ] 1 u OccupancyGrid tracks placed props; prevents overlaps
- [ ] Density ±10% of target across 10-seed sweep
- [ ] No overlaps reported in property tests
- [ ] Grid survives into Phase 2 (used for edit validation, TASK-362)

### Notes
See ARCHITECTURE §2 (props pipeline step 7). OccupancyGrid is spatial; resolution chosen to avoid false positives while catching real collisions.

---

### TASK-123: PropBatcher, ground cover, blobs, cluster proxies

**Agent**: engine | **Complexity**: M | **Status**: PENDING | **Dependencies**: TASK-121, TASK-122

### Acceptance Criteria
- [ ] InstancedMesh per (variant, LOD, island group)
- [ ] Per-instance attributes: aSeed, aAppear, aTint
- [ ] Ground cover per-chunk (32×32 cells) as separate InstancedMesh
- [ ] At T0 zoom, forests become cluster-proxy blobs (solid silhouettes cross-dithering with real trees)
- [ ] PropBatcher interface allows backend swaps (InstancedMesh → BatchedMesh later)
- [ ] Draw calls within budget at all tiers (see ARCHITECTURE §8)
- [ ] Instance buffer updated on tier change (LOD swap)

### Notes
See ARCHITECTURE §3 (PropBatcher) and §4 (zoom FSM). Cluster proxies are T0's answer to overdraw; they're solid, opaque silhouettes. BatchedMesh swap is future-proofed.

---

### TASK-124: Wind, bloom-in, dither, depth parity

**Agent**: shader | **Complexity**: M | **Status**: PENDING | **Dependencies**: TASK-123

### Acceptance Criteria
- [ ] Wind field from `shared/fields` gust function; applied in vertex shader to sway vegetation
- [ ] Bloom-in spring: k=180, c=12, solved in closed form from `aAppear` in shader
- [ ] CPU queues start times: 0–220 ms stagger, ≤40 per frame
- [ ] Grass and flowers dither in instead of bloom
- [ ] `counters.hardPops` (instances appearing without bloom-in or dither) = 0
- [ ] Δt frame (motion between two frames) touches only foliage; static terrain unchanged
- [ ] Total active shader programs ≤12

### Notes
See ARCHITECTURE §4 (bloom-in, fades, per-instance fade logic). W8 constraint (hardPops = 0) is checked in CI. Dither prevents jarring pop-in at budget limits.

---

## M4 — Settlements

*Village, dock, landmarks*

### TASK-131: Sites, lots, paths, docks, landmark anchors

**Agent**: worldgen | **Complexity**: L | **Status**: PENDING | **Dependencies**: TASK-122

### Acceptance Criteria
- [ ] Settlement site selection: score flat, sheltered coastal locations
- [ ] Plaza placed at site centre
- [ ] House lots facing paths; each lot linked to nearest plaza
- [ ] Footpaths: A* with slope penalty, joining houses, plaza, dock and landmark
- [ ] Dock placed where water >2 u deep within 8 u of shore
- [ ] Landmark placed at island's profile anchor (visual peak or unique feature)
- [ ] Every house reachable from plaza (path connectivity verified)
- [ ] Docks deeper than 2 u; verified in property tests

### Notes
See ARCHITECTURE §2 (settlements pipeline steps 4–6). Path graph is used by M7 villagers (TASK-161). Dock depth gates boat arrival in M6 (TASK-151).

---

### TASK-132: Buildings, landmarks, micro props, emissive masks

**Agent**: props | **Complexity**: L | **Status**: PENDING | **Dependencies**: TASK-121

### Acceptance Criteria
- [ ] Building meshes (house variants, dock structure, warehouse, market stall) generated procedurally
- [ ] Landmarks (lighthouse, cairn, arch, tower) placed at anchors with visibility check
- [ ] Micro props (crates, barrels, nets, buckets) scattered on lots and dock
- [ ] Emissive masks for night rendering (lanterns, windows, lighthouse beam)
- [ ] Village and dock shots pass visual QA (contact sheet review per VISUAL_QA.md)
- [ ] All buildings LOD-consistent across tiers (no pop-in or lod artifacts)

### Notes
See ARCHITECTURE §2 (settlements, props) and §3 (emissive masks for night). ART_BIBLE §5 defines building styles and proportions. Visual QA checklist (VISUAL_QA.md) from TASK-007.

---

### TASK-133: Boat routes

**Agent**: worldgen | **Complexity**: S | **Status**: PENDING | **Dependencies**: TASK-131

### Acceptance Criteria
- [ ] Boat routes: A* over water deeper than 1.5 u
- [ ] Routes smoothed with Catmull-Rom spline
- [ ] Route depth ≥1.5 u at every point (verified in property tests)
- [ ] Routes connect docks where present; fallback to open water otherwise
- [ ] Routes are deterministic (same seed = same path)

### Notes
See ARCHITECTURE §2 (paths & routes, step 6). Boats (M6, TASK-151) follow these routes using arc-length parameterization.

---

## M5 — Zoom detail

*5-step zoom ladder*

### TASK-141: Tier FSM, fades, LOD swap, pop queue

**Agent**: engine | **Complexity**: M | **Status**: PENDING | **Dependencies**: TASK-124

### Acceptance Criteria
- [ ] Tier FSM (T0, T1, T2, T3) gated on orbit distance with ±10% hysteresis
- [ ] Per-instance fade: fadeNear/fadeFar evaluated in vertex shader from instance origin
- [ ] Bayer-dither discard for fade (everything stays opaque)
- [ ] LOD buffer swap on tier transition (run once per transition)
- [ ] Bloom-in pop queue: queues instances, ≤40 per frame, stagger 0–220 ms
- [ ] `counters.hardPops` stays 0 during dolly-in (W8 constraint); verified in shots
- [ ] Tier change affects only uniforms (materials stay compiled)

### Notes
See ARCHITECTURE §4 (zoom FSM) and §1 (dispose pattern). Hysteresis prevents flickering at tier boundaries. W8 dolly-in is a test pass through all tiers without hard pops.

---

### TASK-142: `budgets.ts` + `--assert`

**Agent**: qa | **Complexity**: S | **Status**: PENDING | **Dependencies**: TASK-141

### Acceptance Criteria
- [ ] `src/content/budgets.ts` defines tier-specific limits (draw calls, tris, instances, agents, particles, GPU/JS heap, main-thread ms)
- [ ] `shots --assert` checks manifest metrics against budgets; fails if breached
- [ ] CI injects a mock budget breach (e.g., set draw call limit to 50); `shots ci --assert` fails as expected
- [ ] All P0 (Phase 0) budgets pass; P1 enforces M1–M3 budgets progressively

### Notes
See ARCHITECTURE §8 (performance budget table). Budgets are worst-case across tiers. Enforcement prevents regress.

---

## M6 — Sea & sky life

*Boats, gulls, clouds*

### TASK-151: Agent framework, boats, foam trail

**Agent**: life | **Complexity**: M | **Status**: PENDING | **Dependencies**: TASK-133, TASK-141

### Acceptance Criteria
- [ ] Agent framework: pooled InstancedMesh per kind, 30 Hz fixed-step simulation
- [ ] Boats move by arc length along routes; heel and bob applied
- [ ] Wake trail splats on foam texture; wake texture updates on trail
- [ ] Determinism: `simt` 0 vs 30 warm-up differ (agents move); both outputs are deterministic
- [ ] Boat bob uses same swell function as water (parity test, TASK-103)
- [ ] Off-screen agents advance at 5 Hz; capture always runs full warm-up

### Notes
See ARCHITECTURE §5 (life & animation) and §1 (loop, sim LOD). Foam trail is a single updatable texture shared by all boats. Arc-length parameterization ensures smooth, deterministic motion.

---

### TASK-152: Gulls, fish, ambient scheduler

**Agent**: life | **Complexity**: M | **Status**: PENDING | **Dependencies**: TASK-151

### Acceptance Criteria
- [ ] Gulls (from T2): boid flock, spawned at beach and peak zones
- [ ] Fish schools (T3): boid flock in shallow water; scatter from cursor hover
- [ ] Ambient events: seeded Poisson scheduler fires fish jumps, splashes, coconut drops
- [ ] All motion is `f(uTime, aSeed, worldPos)` or CPU-driven with deterministic RNG
- [ ] Gulls and fish visible in dock and shore shots (contact sheet review)
- [ ] Ambient events fire predictably at same times across runs

### Notes
See ARCHITECTURE §5 (life animation) and TASK-152 in ARCHITECTURE §10 table. Boid simulation runs at 30 Hz on CPU; motion can be reduced-motion compliant (ARCHITECTURE §5).

---

### TASK-153: Clouds + aligned shadows, smoke, steam

**Agent**: shader | **Complexity**: M | **Status**: PENDING | **Dependencies**: TASK-104

### Acceptance Criteria
- [ ] Clouds: 6–10 opaque puffs spawned at noise field peaks, advected by wind
- [ ] Cloud-shadow mask samples same noise field; shadows line up perfectly
- [ ] Smoke puffs: procedural, advected, visible at settlements and landmarks
- [ ] Steam: visible at geothermal features (if archetype includes them)
- [ ] W1 shot: ≥2 visible cloud shadows on terrain
- [ ] W5 shot: steam at landmark passes visual inspection
- [ ] No overdraw (clouds are opaque, layered back-to-front)

### Notes
See ARCHITECTURE §3 (clouds) and ART_BIBLE §3 (Lighting & atmosphere). Shadow field alignment is key: no pre-baked shadow map needed. W1/W5 are pinned shots (TASK-113).

---

## M7 — Land life & interaction

*Villagers, reaction frame*

### TASK-161: Villagers, cats, sheep, crabs

**Agent**: life | **Complexity**: M | **Status**: PENDING | **Dependencies**: TASK-151, TASK-131

### Acceptance Criteria
- [ ] Villagers: walk path graph, run idle FSM (wave at nearby camera)
- [ ] Cats, sheep: wander inside zone mask (feline roam forest; ovine roam meadow)
- [ ] Crabs: wander on beach and shallow water
- [ ] All agents spawn per island based on settlement presence
- [ ] No synchronized phase (motion is independent per instance via aSeed)
- [ ] W7 sheep check: sheep visible and moving; visual check passes
- [ ] Agents stay in bounds; do not pathfind outside their zone

### Notes
See ARCHITECTURE §5 (critters, agents) and ART_BIBLE §7 (Life & animation catalog). Critters are driven by `f(uTime, aSeed, worldPos)` where possible (GPU), or CPU with label-fork RNG.

---

### TASK-162: Picking, hover, reactions, reduced motion

**Agent**: life | **Complexity**: M | **Status**: PENDING | **Dependencies**: TASK-161

### Acceptance Criteria
- [ ] Picking: ray march & bisect against heightfield; spatial-hash test on props and agents; nearest wins
- [ ] Hover runs at 10 Hz; shows tint on hovered instance
- [ ] Reactions: `squash | hop | spin | wobble | emote` plus particle burst
- [ ] Clicked instance matrix animates (only the picked one)
- [ ] Reduced motion (OS or in-app toggle): reactions become tint, bloom-in becomes dither, wind ×0.3
- [ ] `pick(x,y)` test call returns expected instance id (deterministic)
- [ ] Click only counts if pointer moved <6 px within <300 ms (jitter filter)

### Notes
See ARCHITECTURE §5 (picking, reactions) and §1 (reduced motion). No GPU picking needed; CPU march is fast enough. Reactions are data-driven (ARCHITECTURE §5, anim/).

---

## M8 — Day/night & weather

*Time ladder × weather*

### TASK-171: EnvState, sky bodies, night emissives, beam

**Agent**: shader | **Complexity**: M | **Status**: PENDING | **Dependencies**: TASK-104, TASK-132

### Acceptance Criteria
- [ ] EnvState: sampled from `content/env-keyframes` into one object (sun/moon direction & colour, hemisphere colours, fog, exposure, bloom factor)
- [ ] EnvState written to shared uniform objects; every material references them
- [ ] Sky gradient dome: sun, moon, hashed stars
- [ ] Night: emissive masks × night factor → bloom
- [ ] Lantern pools: additive decal overlays (not point lights)
- [ ] Lighthouse beam: rotating, visible at night
- [ ] W3 (golden hour) and W4 (night) shots pass visual QA
- [ ] Day/night transition smooth over ~10 s

### Notes
See ARCHITECTURE §7 (day/night, EnvState) and ART_BIBLE §3 (Lighting). W3/W4 are pinned shots. Night emissives are the only glow source at night (no point lights).

---

### TASK-172: Weather FSM, rain, ripples, mist

**Agent**: shader | **Complexity**: M | **Status**: PENDING | **Dependencies**: TASK-171

### Acceptance Criteria
- [ ] Weather FSM: {clear, cloudy, rain, fog}; seeded, deterministic
- [ ] Presets blend into EnvState deltas over ~10 s (cloud coverage, gusts, swell, fog, sun tint)
- [ ] Rain: camera-local wrapped box of instanced streaks; procedural ripple rings on water
- [ ] Fog: exponential + low mist band
- [ ] `?weather=` forces a state for testing
- [ ] W10 (rain) and fog shots pass visual QA
- [ ] No overdraw; rain uses dither instead of transparency

### Notes
See ARCHITECTURE §7 (weather) and ART_BIBLE §3. Fog is both atmospheric and performance-relevant (far-plane culling). W10 is a pinned shot.

---

## M9 — Camera/HUD/photo

*HUD, mobile, photo*

### TASK-181: Intro, fly-to, orbit, touch, compass

**Agent**: engine | **Complexity**: M | **Status**: PENDING | **Dependencies**: TASK-105, TASK-113

### Acceptance Criteria
- [ ] Intro: keyframed spline + cloud-curtain (~10 s); any input skips it
- [ ] Intro disabled by `intro=0`, capture mode, reduced motion, or forced by 30 s idle
- [ ] Fly-to: `fitToSphere` on double-click island or tap label
- [ ] Orbit: slow rotation after 30 s idle (camera distance unchanged)
- [ ] Touch: two-finger pan, rotate, pinch-zoom (full `camera-controls` support on mobile)
- [ ] Compass: on-screen orientation indicator (on by default, togglable)
- [ ] Intro frames match bible §8 timing (shot every ~500 ms)
- [ ] No glitches on intro cancel

### Notes
See ARCHITECTURE §6 (camera, interaction) and ART_BIBLE §8 (Opening sequence). Intro reuses cloud-curtain logic (TASK-113).

---

### TASK-182: HUD dock, time dial, photo mode + PNG export

**Agent**: engine | **Complexity**: M | **Status**: PENDING | **Dependencies**: TASK-181

### Acceptance Criteria
- [ ] HUD dock: buttons for settings, photo, compass, reduce motion toggle
- [ ] Time dial: circular UI showing current time (day/night cycle)
- [ ] Photo mode: FOV slider 15–60°, freeze button (no orbit, intro, governor)
- [ ] PNG export: calls `canvas.toBlob()`, triggers browser download
- [ ] No overlap at 390×844 mobile viewport
- [ ] HUD visibility toggle (hide for clean screenshots)
- [ ] All text and buttons visible at low DPR

### Notes
See ARCHITECTURE §9 (UI/HUD) and ART_BIBLE §9. HUD placement optimized for landscape phone (wide, short).

---

## M10 — Hardening

*W1–W10*

### TASK-191: Governor, prewarm, context-loss regen, `perf=1`

**Agent**: engine | **Complexity**: M | **Status**: PENDING | **Dependencies**: All Phase 1 prior

### Acceptance Criteria
- [ ] Governor: if p90 frame time > 20 ms, drop DPR first, then tier; upgrades only once
- [ ] Prewarm: `compileAsync` shaders; warm-up steps (bloom-ins complete instantly) before ready
- [ ] Context loss: on WebGL context lost, rebuild from seed (GPU memory re-upload)
- [ ] `?perf=1`: flies 10 s path, reports p50/p95 frame time (GPU timer on real hardware)
- [ ] All budgets pass at low/medium/high quality
- [ ] New seed completes within budget: ≤1.5 s (low), ≤0.8 s (medium), ≤0.5 s (high)

### Notes
See ARCHITECTURE §8 (auto quality, measurement). Governor is the safety net for budget breaches. Context-loss regen is critical on mobile.

---

### TASK-192: 10-seed sweep; user checks M1 60 fps / phone 30 fps

**Agent**: qa | **Complexity**: M | **Status**: PENDING | **Dependencies**: TASK-191

### Acceptance Criteria
- [ ] Run `shots dev` on 10 different seeds (deterministically chosen)
- [ ] All shots pass visual QA (contact sheet review per VISUAL_QA.md; ART_BIBLE §11 criteria all green)
- [ ] User signs off on real GPU: M1 Air maintains 60 fps at high quality
- [ ] User signs off on phone: 30 fps stable at medium quality (no jank)
- [ ] `shots wow` (W1–W10 at 1920×1080) passes all checks
- [ ] No regressions from earlier milestones

### Notes
See ARCHITECTURE §9 (agent review, visual QA). Contact sheet (contact.jpg) is committed as `mar-docs/shots/M10.jpg`. Wow set is the final asset showcase.

---

### TASK-193: README, MEMORY gotchas

**Agent**: docs | **Complexity**: S | **Status**: PENDING | **Dependencies**: TASK-192

### Acceptance Criteria
- [ ] README.md: project overview, stack, getting started (pnpm install && pnpm dev), feature list, demo link
- [ ] `mar-docs/MEMORY.md`: gotcha list (gotchas discovered during implementation, patterns, performance notes)
- [ ] Links to ARCHITECTURE.md, ART_BIBLE.md, VISUAL_QA.md from README
- [ ] No TODOs or placeholders

### Notes
See ARCHITECTURE §11 (risks & mitigations). MEMORY.md is a live document; update as patterns emerge.

---

## Milestone exit criteria

For each milestone (M1–M10), before marking complete:
- [ ] Run `pnpm shots dev` and review contact sheet
- [ ] Score against `mar-docs/VISUAL_QA.md` (ART_BIBLE §11 + global fails)
- [ ] Commit contact sheet as `mar-docs/shots/M<n>.jpg`
- [ ] Update `mar-tasks/task-index.md` task statuses
- [ ] Push to main (GitHub Pages deploy triggered)
