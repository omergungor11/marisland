# Phase 5 — Visual Upgrade (M45–M49)

Plan: `mar-plans/VISUAL_UPGRADE.md`. Budget decision: D-156. Every task below ends with
`pnpm typecheck && pnpm lint && pnpm test` green, the named shots taken and looked at, and a short
report (what changed, numbers before / after, open nits). Agents do NOT edit DECISIONS / MEMORY /
task-index: the orchestrator writes those at merge.

Common rules: no `Math.random` / `Date.now` in world / life / sim; every number in `src/content/`;
no new shader program unless the task says so; zoom ladder (`pnpm shots ladder`) must still pass;
a visual task compares before / after on the same wow ids.

---

## M45 — Agent identity and portrait

### TASK-590 — Bot chassis / head variants + eye states (life)

Files: `src/life/geo/workers.ts`, `src/life/workers.ts`, `src/life/life-material.ts`,
`src/life/fleet-bots.ts`, `src/content/life.ts` (bot section), reads `src/content/bot-look.ts`.

- Three chassis geometries (`scout` = today, `hauler`: 0.9 u, wide shoulders, tread feet, short
  antenna; `spire`: 1.15 u, slim, long antenna with a ring), three heads (monitor = today, dome visor,
  round single-eye camera). Each chassis is its own InstancedMesh with its own geometry (all three
  heads + the 7 accessories + carried items baked in, decoded as today); the `workers-geo` 1900-tri
  cap holds per geometry. No new vertex attribute (15 / 16 used): head variant and eye state ride in
  the existing codes (`aSeed` integer part / `aGait.y` 4..8); document the packing in the module header.
- Resident (non-session) bots roll chassis / head from the island RNG (label `bot-look`), fleet-bound
  bots take `botLook(sessionId)`; a bot bound to a session morphs by swapping its instance to the right
  mesh at the desk (not mid-walk).
- Role item: `agent` → carried item map in `src/content/bot-look.ts` (`ROLE_ITEM`); add missing items
  (wrench, map roll, hammer, magnifier, book) to the carried-item slots.
- Eye states on the screen / visor: idle, working (3 dots cycling), waiting gate (`?`), error (`×_×`),
  done (`^^`), driven by `FleetSession.status` (+ pending gate) through `life/fleet-bots.ts`.
- Shots: new dev preset `F-bots` (seed 1001, Coding pergola row at T2, `?fleet=mock` with the mock
  producing every chassis × head × state at least once). Budgets: `agents` 60 / 25 unchanged, medium
  draw calls +≤ 4 on any wow shot (W5, W26, W-morning-shift, W-funicular-dawn reported before / after).
- Tests: geometry caps per chassis, decode round-trip (look → attributes → look), fleet binding picks
  the mesh of the look.

### TASK-591 — Panel portraits (engine)

Files: `src/ui/fleet-panel.ts`, `src/ui/fleet-term.ts`, `src/ui/fleet-tip.ts`, `src/fleet/mock.ts`,
new `src/ui/bot-portrait.ts`; reads `src/content/bot-look.ts` only (no life imports).

- `botPortraitSvg(look: BotLook, size): string` — inline SVG (no external asset): chassis silhouette,
  head kind, department accent fill, role item glyph, eye state. Deterministic string for a look.
- Shown on: session rows (left of the status glyph, 24 px), terminal header (40 px), fleet-view
  agent chips (20 px), hover tip (48 px). Rows diff-render as today (no innerHTML rebuild).
- Mock: sessions cover all 3 × 3 looks and 5 states; `F-panel` / `F-fleet` / `F-terminal` re-shot;
  new `F-portraits` dev shot (fleet view with ≥ 9 distinct portraits).
- Tests: SVG is stable for a look, differs across chassis / head / state, escapes nothing unsafe.

### TASK-592 — Bot motion variety (life) — after 590

- Per-chassis gait (hauler waddle: roll 6°, step 0.55 s; spire glide: hop 0.04 u, lean 4°), four
  idle beats (stretch, look around, foot tap, wrist check) on `hash(id)` phase; waiting gate: bot looks
  up at the gem, gem pulses amber (`FLEET_BOTS.beaconMotion`); done: one hop + 6 sparkles.
- Numbers in `src/content/anim.ts` / `life.ts`; cute-motion skill timings; capture clock only.
- Shots: `F-bots` at `simt` 2 / 6 / 10; motion QA via `__marisland.step(0.1, n)`.

### TASK-593 — M45 QA (qa)

- `F-bots`, `F-portraits`, `F-panel`, `F-fleet`, `F-terminal`; portrait vs 3D bot side by side for
  five sessions; wow W5 / W26 / W-morning-shift / W-funicular-dawn budgets; low ladder L-coding memory.
- Report `mar-docs/qa/m45-bots-<date>.md`, follow-ups as task rows.

---

## M46 — Surface quality

### TASK-594 — Material classes, edge light, near grain (shader)

Files: `src/render/materials/factory.ts`, `src/render/shaders/chunks/*`, `src/render/materials/prop-materials.ts`,
`src/geo/*` (class tags per part), `src/content/` (new `materials.ts` table).

- Material class per vertex in the free code range of the 16-bit `emissive` attribute (classes 0–2
  are taken): matte, wood, metal, glass, fabric. `geo/kit.ts` / `parts.ts` helpers tag parts; existing
  builders tag the obvious ones (roofs = matte, planks / trunks = wood, rails / crane / bots' metal =
  metal, windows / conservatory / orbs = glass, awnings / sails / laundry = fabric).
- Per class (uniform table, no new program): specular lobe strength + power, fresnel lift, edge-light
  gain. Edge light = `fwidth(vNormal)`-based thin highlight on bevels, full at ≤ 60 u, 0 at 140 u.
  Near grain = triplanar hash ±2–3 % L, same fade, zero-mean.
- Life program gets the same class table (bots' metal / screen glass).
- Acceptance: programs medium 17 / high 24 unchanged; `pnpm shots ladder` passes (ΔE bounds); wow
  deterministic; W8 / W16 / W-morning-shift / W-carnival-noon before / after contact; low untouched
  (feature off at low via uniform).

### TASK-595 — Terrain detail (shader) — after 594

- Steep faces: height-hash strata bands (2 tones, 1.5–3 u pitch); cliff feet: scree speckles in
  `ground-detail`; north-facing slopes: moss creep tint at T2–T3; wet sand specular glint; path edges
  worn 0.4 u. All in the terrain program; `debug=mask` unchanged; `D-lake-pools*` pixel-identical.
- Shots: W13 Falls, W5, W-funicular-dawn, D-overview; ladder.

### TASK-596 — Water caustics + glitter (shader) — after 594

- Shallow caustics: 2-octave animated voronoi projected on underwater terrain (depth 0–3 u, day-gated by
  `uNight`), terrain program term; sun glitter sparkle on the water (`water.glsl.ts`); second foam band.
- Shots: W8, W1 postcard, W-tide-lab-dusk, W-sunken-noon; water tests; capture clock drives the
  animation.

### TASK-597 — M46 QA (qa)

- Before / after on 8 wow ids, ladder, low ladder, programs count, `wow --assert`. Report.

---

## M47 — Prop variety

### TASK-598 — Building variants v2 (props)

Files: `src/geo/buildings.ts`, `src/content/props-buildings.ts`, `src/content/palette.ts` (roof sets),
tests `src/geo/geo.test.ts`, `src/content/props-buildings.test.ts`.

- Modular roll per building def (cottage, towerHouse, barn, logCabin, stiltHut): roof style (gable /
  hip / dormer / mansard where it fits), window layout (3), door (3), trims (shutters, flower box,
  awning, chimney kind, two-tone plinth). `variants` 3 → 8 (`rollVariants` 8). Roll from the def
  variant index only (deterministic).
- LOD1 silhouette per variant stays the current one (ladder); LOD0 tris ≤ today × 1.25 per variant
  (test). Vertex colours stay palette hues (±4° hue, ±3 % L jitter rule).
- Gallery: `pnpm exec tsx scripts/gallery-shots.ts buildings` shows all variants; W16, W2, W10 before / after.

### TASK-599 — Vegetation + rock v2 (props) — parallel with 598

Files: `src/geo/trees.ts`, `src/geo/coastal.ts` (rocks), `src/content/props.ts`, `src/content/palette.ts`,
new `src/content/biomes.ts` (per-island colour sets).

- Three new canopy silhouettes (tall oval, umbrella, layered) as variants of `roundTree` / `pine`;
  per-island colour sets (table in the plan); palm leaning / twin trunk variants; bush flower colour by
  biome; rocks: 5 silhouettes + moss / lichen cap + strata line; `driftwood`, `kelp` defs (tier 3).
- Far blobs (`treeBlob`, cluster proxies) take the biome colour so T0 matches (D-031).
- Gallery `vegetation`; W1, W11, W20 before / after; def count stays within caps (`cultureDefsPerIsland`).

### TASK-600 — Biome scatter rules + one hash re-pin (worldgen) — after 598 / 599

Files: `src/world/gen/*` scatter / placement, `src/content/placement.ts`, world hash pins.

- Per-island variant weights (biome table), rock field clusters, Poisson flower meadow patches,
  path edges (tufts + stones), lot hedges / fences, garden plots behind cottages.
- One hash re-pin for seeds 1 / 42 / 1001; `pnpm vitest run src/world` green; generation time bounds
  judged on a quiet machine (D-132).

### TASK-601 — Boats + dock dressing v2 (props) — after 598

- Hulls: dinghy, cabin fishing boat, sloop; sail / hull colour sets per island; dock dressing defs
  (net, lobster pot, rope coil, ladder); buoy variants. Boat routes unchanged (`life/boats.ts` reads
  the variant). W16, W-marina-dusk, W-colour-wharf-day.

### TASK-602 — M47 QA (qa)

---

## M48 — Island detail layer

### TASK-603 — Coast micro-landscapes (worldgen) — after 600

- Per archetype: rock arch / sea-stack cluster (rocky), tide-pool field + starfish (rocky shallow),
  dune ridge + crest grass (sandy), kelp bed (turquoise shelf); cliff ledges with vegetation; waterfall
  foot pool + mist; stream-mouth gravel. Placement rules + anchors; one hash re-pin.

### TASK-604 — Coast kit geometry (props + shader) — parallel with 603

- `rockArch`, `tidePoolField`, `duneGrass`, `kelp` (wind-animated, water-tinted), `ledgeShrub`.

### TASK-605 — M48 QA (qa)

---

## M49 — High tier render

### TASK-606 — SSAO + soft shadows (shader)

- High only: SSAO / GTAO pass (pmndrs or N8AO), PCF soft shadows with a wider radius at 2048;
  medium wow set pixel-identical (passes absent, not disabled). Programs high ≤ 30 (D-156).

### TASK-607 — `wow-high` set + budgets (devops + engine)

- `pnpm shots wow --quality=high --tag=high` as a named set with `BUDGETS.high` assert; stats overlay
  shows the tier; CI runs it report-only (SwiftShader). Governor interplay documented.

### TASK-608 — Sky + clouds v2 (shader) — after 606

- Cloud archetypes (cumulus, stratus sheet, wisps) with two-tone + rim (medium too, +≤ 2 calls); sun
  disc + halo + lens glint, moon phases, star density by altitude (high); dusk / dawn god rays (high).

### TASK-609 — M49 QA (qa)

### TASK-610 — Docs (docs, haiku)

- ART_BIBLE §5 / §7 / §11 rows for the new variants and shots; ARCHITECTURE §8 budget table; FLEET.md
  bot identity paragraph; MEMORY handoff.

---

## Cross-cutting (opened 2026-11-09 from user feedback)

### TASK-611 — Detail reveal: earlier and continuous (engine)

User: "çok yaklaşmam gerekiyor detayların netleşmesi için, o kısım smooth olmalı" — detail only becomes
clear very close to the ground, and the way it arrives is not smooth. Two causes: tier-2 / tier-3 props
dither in late (`TIER_FADE` 2: 120–160 u, 3: 40–55 u) and the T1–T2 tilt-shift band blurs the island
until the camera is well inside T2.

- `TIER_FADE` 2 → about 200–260 u, 3 → about 70–95 u (numbers in `src/content/props.ts`, tunable),
  with the dither cross-fade wide enough that no instance pops: LOD1 fades out while LOD0 fades in over
  the same band (check `prop-materials.ts` fade uniforms and the LOD1 / near-merge hand-over).
- Tilt-shift (`render/post/composer.ts`, `LIGHTING.tiltShift`, `POST.tilt*`): the sharp band follows
  the orbit target's screen position and widens with distance so the focused island is sharp from T1;
  blur strength is continuous in orbit distance (not a per-tier step); high-tier DOF focus range scales
  with distance (absorbs TASK-586). W1–W4 stay practically identical (T0 unchanged).
- Budgets: more LOD0 in view at 200 u — re-measure `pnpm shots wow --assert` on the heavy frames (W5,
  W26, W-cable-dusk, W27, W-morning-shift, W-funicular-dawn) against D-156; if a frame exceeds, narrow
  the band for tier 3 before tier 2 and report the numbers.
- Zoom ladder must pass (the ladder measures exactly this hand-over); add `D-reveal-{260,200,140,90,60}`
  dev shots on seed 1001 Coding at a fixed heading for a 5-frame flip-book.
