# Architecture Decisions (ADR-lite)

> Every architectural/technology decision goes here. Newest on top.

## D-036: Carried items are a second decode term of the worker accessory slot — 2026-10-06

**Decision** (TASK-383): a carrying worker keeps its department accessory and shows its item too.
`life/workers.ts` adds `100 · (CARRIED_ITEM_SLOT[item] − 6)` to `aSeed` (laptop 7, clipboard 8, crate 9,
paintPot 10 → item codes 1…4) while it carries. The mode-8 branch of `life-material.ts` decodes
`floor(aSeed) = acc + 100 · item`: variants below 6.5 are the department accessory, slots 7.. the item,
the rest collapse to a point. Item geometry is tagged `setLimb(slot, …, 8)`; no attribute is added.
**Rationale**: a stride of 100 keeps every `sin(aSeed · 2π)` and `fract(aSeed · 7.31)` term unchanged
(whole turns), so a pickup never twitches the eyes or the antenna. Both slots show together. This
supersedes phase-3.md §3 ("only one slot shows; a carrying bot hides its department accessory"), which
the TASK-383 code no longer follows.
**Impact**: `content/themes/index.ts` (`DEPT_ACCESSORY_COUNT = 7`, `CARRIED_ITEM_SLOT`); no new program
or attribute.

## D-035: Ladder metric calibration: plane mapping, ±1 cell slack, 5 % land floor, regional drift vs 170 u (amends D-031) — 2026-10-06

**Decision** (TASK-374 calibration, `scripts/ladder-metrics.ts`, `content/camera.ts` `ladder`):
- **Mapping**: the near frame is mapped into the far frame through the ground plane at the target
  (`planeMap`: exact dolly at the fixed 48° pitch and 35° FOV), not a centre crop. The crop
  misregistered the top and bottom rows by about 2 cells per 0.7 step.
- **Slack**: each near cell matches its best far-frame neighbour within ±1 cell (`slack: 1`). Tall props
  and relief parallax by one or two cells between steps (Marketing pines 30 → 21 u: p95 29.9 without
  slack, 7.7 with). An element absent in the far frame still has no matching neighbour.
- **Land floor**: `minLandFrac` 0.25 → 0.05. From 170 u the island fills 8–18 % of the grid, so the
  plan's 25 % skipped every far step and with it the T0 → T1 campus pop. Those steps are stable at 5 %.
  Below the floor a step is reported, not judged.
- **Drift**: island drift compares a frame's footprint with the reference frame `driftRef = 170 u` (the
  whole island at T1), not with the ladder median. Far frames use the island footprint, near frames the
  whole frame.
Other thresholds stay as in D-031.
**Rationale**: the crop misregistered rows, the tall props parallax off the target plane, and the 25 % floor
skipped every frame from 170 u up, so the plan's metric judged registration and sampling rather than the
art (TASK-374 calibration; MEMORY 2026-10-05).
**Impact**: `LADDER_THRESHOLDS` in `scripts/ladder-metrics.ts`; `FRAMING.ladder` in `content/camera.ts`.

## D-034: `aSpin.w` is a motion and surface tag channel on the lit program — 2026-10-06

**Decision** (TASK-384, `content/activity.ts`, `render/materials/activity-glsl.ts`): the lit program's
existing `aSpin.w` (no new attribute) carries a tag:
- `0` static (default);
- `1` spin about the hub `aSpin.xyz` (windmill blades, anemometer; unchanged);
- `2` yaw head about the object y axis, into the wind (turbine nacelle);
- `3` yaw + spin (turbine rotor: spin about the hub first, then yaw);
- `4` and above: sun tracker, rotating about the x axis through the pivot `aSpin.xyz` (solar panels);
- negative `−k` (k ≥ 1): animated surface of `SURFACE` kind k (monitor content, LED strips, billboard
  slides, pipe pulses). Screens carry `(u, v, aspect, −k)`, LED strips `cols + seed` in z, pipes the tube
  axis in xyz. Billboard glyphs use a negative aspect and show the brand slide only.
**Rationale**: the creature program is at 15 of 16 attributes (D-013), and a new attribute would be the
17th that fails to link under SwiftShader. Every lit program already carries the `aSpin` branch, so the
channel adds no program key and no draw call.
**Impact**: `factory.ts` and `activity-glsl.ts` read the same vec4; theme geometry writes the tags
(`geo/themes/surface-tags.test.ts`).

## D-033: M14b budgets: programs stay 9 / 17 / 24 — 2026-10-05

**Decision** (phase-3.md M14b §1 D-033, §7): no raise beyond D-028 for draw calls or programs. The
terrain material is replaced in place (one program per quality; low has no detail define); structures
use the lit program; turbine blades reuse the windmill spin branch; workers stay on the creature program.
The one planned increase, SSAO (TASK-351, high ≤ 28), needs its own amendment of this decision.
**Rationale**: high has no program headroom (24 / 24 before M14b). Far-terrain merge saves 25–40 calls at
T0 / T1 (about 2× with shadows on medium); LOD1 structures add about 20 single-variant groups at T0.
**Impact**: triangle and memory targets per plan §7 (high ≈ 0.45 M terrain triangles, low ≈ 0.1 M); the
calls ceiling is D-028's 170 / 255 / 350.

## D-032: Every structure has its own LOD1; the shared office proxy is retired (amends D-027) — 2026-10-05

**Decision**: structures ≥ 3 u (and landmarks) draw their own LOD1 at tier 0, built from the LOD0 colours,
with one LOD1 variant (variants differ only in LOD0 detail). Themed shells no longer share the neutral
`officeLod1` proxy; its geometry stays in code, unused (`content/props-buildings.ts`). The batcher groups
LOD1 by (def, variant) and folds variants with identical LOD1 geometry into variant 0 (`batcher.ts`).
**Rationale**: with a shared neutral proxy, blue roofs existed only at LOD0 and the shells were tier 1, so
the campus was absent at T0 while the windmills (tier 0) were there. The draw-call cost is paid by merging
far terrain chunks per island and the tree-blob groups (D-033).
**Impact**: enforced by `props-buildings.test.ts` ("own LOD1, no shared proxy") and the ladder (D-035).

## D-031: Cross-tier consistency is a hard rule, checked by a zoom-ladder metric — 2026-10-05

**Decision**: every large element (structure ≥ 3 u, landmark, tree mass, district ground) exists from T0
with its final colour and silhouette. Detail adds only zero-mean variation; nothing large appears with a
tier. The rule is enforced by `pnpm shots ladder`: 11 distances 700 → 21 u at a fixed 48° pitch, clear
14:00, `freeze=1`. Each step compares solid cells (land or structure, 48 × 27 grid, ΔE2000 on Lab) of frame
k with frame k+1, and a boundary pair compares both sides of 1.06 b and 0.94 b for b ∈ {380, 250, 140,
45, 300, 120, 40}. Thresholds: step mean ≤ 5, p95 ≤ 12, blob (ΔE > 15 component) ≤ 1.5 %; drift ≤ 4;
pair mean ≤ 2.5, blob ≤ 0.5 %, IoU ≥ 0.92. Calibration: it must fail on the M14 main (Coding) and pass on
identity input. Mapping, slack and land floor were changed after calibration (D-035).
**Rationale**: the M14 zoom ladder showed a patchwork and buildings that appeared with the tier, which an
absolute per-shot check could not catch.
**Impact**: `scripts/ladder-metrics.ts`, `scripts/shots.ts` (`ladder` set), `cam=ladder:<island>:<dist>`
(`camera/controls.ts`), `FRAMING.ladder`.

## D-030: Terrain is smooth and material-based; props stay faceted — 2026-10-05

**Decision** (M14b TASK-371 / 372): the terrain surface is a Catmull-Rom (C1, interpolating) surface over the
unchanged 2 u heightfield (`shared/terrain-sample.ts`), giving smooth normals. Chunks are indexed meshes
(`render/terrain/terrain-mesh.ts`) with distance LOD 4 → 2 → 1 → 0.5 u (`content/terrain.ts`). Each zone has
a procedural ground material: one tileable 256² RGBA8 layer per material in a `DataArrayTexture`
(`render/terrain/ground-detail.ts`), mean-preserving and fading with distance. Props, buildings, trees and
bots stay faceted; the terrain is the only exception to ART_BIBLE P1.
**Rationale**: the terrain was non-indexed 2 u facets with per-face colour jitter baked into vertex colours,
and the LOD flipped globally on tier (T0 4 u, else 2 u): a pop at 380 u and no gain below 2 u.
**Impact**: the world grid stays at 2 u, so generation, the edit codec and the terrain hashes do not change.
Albedo +0.6 MB; detail array +4.7 MB on medium / high.

## D-029: Theme-first islands: the archetype gives the shape, the theme owns the rest — 2026-10-05

**Decision** (M14b, `world/gen/plans/`, `world/gen/sites.ts`): the archetype supplies only the shape
(heightfield profile, coast, shelf, anchors: volcano, atoll, stack, plateau, dome, sandbar, crescent). The
theme owns the ground palette per zone, zone-rule overrides, the landmarks on the archetype anchors,
districts, structures, scatter and decor, and creature weights. Settlements are planned by
`THEME_PLANNERS[isl.theme]`; no archetype-specific prop or colour survives unless the theme lists it.
**Rationale**: M14 bolted the themes onto the archetype planners, so farm logic (windmills on knolls, a
barn, field fences) still decided the island.
**Alternatives**: keep the archetype switch and re-skin the result (rejected).
**Impact**: `content/themes/` tables, `world/gen/plans/*`, hash re-pins.

## D-028: Phase 3 M14 budgets = measured worst case + ~10 % — 2026-10-05

**Decision** (TASK-309): raise only what the ci/dev/edit sets (all three qualities, `pnpm shots <set>
--quality=<q> --assert`) measured above the old budget. drawCalls low 120 → **170** (worst 157,
E-meadow; D-macro 146 — T3 views over the 7-island layout draw ~47 terrain chunks plus the LOD0
groups of 3–4 islands; themed groups are ~5 of those calls), medium 220 → **255** (worst 232; overview
229 vs 205 before Phase 3, shadow depth doubles the campus groups), high 350 kept (243).
gpuMemoryMB low 64 → **70** (63 at E-panel 1280×720). Agents 25/60/110 (set earlier, measured
25/58/93). Triangles, instances, ground cover, jsHeap, newSeed unchanged (well inside).
**Programs stay 9 / 17 / 24**, equal to the pre-Phase-3 baseline (measured at 7b35622^).
**Rationale**: the plan's 135 low estimate assumed the old macro framing; the new layout, not the
campuses, moved the T3 shots. Shrinking far terrain chunk calls is a shader/terrain follow-up.

## D-027: Shared LOD1 proxies and tier-2 interiors (partly superseded by D-032) — 2026-10-05

**Decision** (M14 TASK-303 / 309): (a) LOD1 instances group by the def's shared `lod1` key (`PropDef.lod1 {geo,
variant}`), so about 20 themed building defs do not add about 40 LOD1 groups at T1; the themed shells share
one neutral `officeLod1` proxy. (b) Interiors are a separate tier-2 def (`interior: true`): never placeable,
never clusterable, never shadow-casting on low; `INTERIOR_OF[defId]` maps a shell to its interior. (c) New
tier-2 interior and decor defs bloom in or dither in; no hard pops.
**Status**: (a) is retired by D-032 (every structure has its own LOD1). (b) and (c) stand.
**Rationale**: the draw-call budget (D-028) was the tight one; the interiors must not add calls at T0 / T1.
**Impact**: `content/props.ts`, `content/props-buildings.ts`, `render/props/batcher.ts`,
`render/props/settlement-props.ts`.

## D-026: Department workers replace villagers; pose and accessory ride existing attributes — 2026-10-05

**Decision** (M14 TASK-306, user-approved 2026-10-05 with D-024): workers replace the villagers on every
island, allocated by island theme weight (`content/life.ts`, `THEMES.workers`). All workers and boat
passengers share one `InstancedMesh` (1 draw call, 0 programs). The creature material keeps 15 of 16
attributes: the pose kind is in `aGait.y` (0..1 wave, 2..3 typing amount = y − 2, mode 7 arm pose) and the
accessory in `aSeed` (mode 8: the integer part is the accessory, the fraction is the phase). Accessories:
HQ headset with mic, Coding hood with headphones, Marketing megaphone badge / cap, QA visor with monocle,
Design beret, DevOps hard hat, Research goggles. Villager hats (mode 5) are untouched. Code says "workers"
because `AgentKind` already names the base class.
**Rationale**: a 17th attribute fails to link under SwiftShader (D-013), so the worker needs its pose and
accessory from existing channels.
**Impact**: `life/life-material.ts` (modes 7 and 8), `life/workers.ts`, `life/geo/workers.ts`. Carried items
extend mode 8 (D-036).

## D-025: Every island gets a campus; the seven-island roster is guaranteed (hash re-pin) — 2026-10-05

**Decision** (M14 TASK-300 / 302, user-approved 2026-10-05): `LAYOUT.countWeights` → `[[7, 1]]`, so every
seed has all seven department islands once each. Lonely Palm is forced at count 7 (`lonelyPalmChance` is
unused). A generic campus planner, `planCampus` with `CAMPUS[theme]`, runs after each archetype plan: a quad
on the plaza, lanes and lots from `lotMix`, `defSwap` re-labels the old lots, links to the hub and dock.
Emberpeak and Lonely Palm, which had no lots before, get campuses (Research: one `researchHut` and a
telescope in outpost mode, see D-024). Every seed's layout, hashes and shots change; `EDIT_LOGS` is
re-recorded (TASK-309).
**Rationale**: an org chart with a missing department breaks the fiction. The count-7 rule was already
feasible for about a quarter of seeds.
**Impact**: `content/islands.ts` (`countWeights`; Lonely Palm 17–21 u, TASK-302), `world/gen/settlements.ts`,
the 500-seed layout test (contrast fallback rate), re-pinned hashes.

## D-024: Department themes per archetype; the theme set is a data table — 2026-10-05

**Decision** (M14 TASK-300, user-approved 2026-10-05): each archetype maps to one department, as a data table
(`THEME_BY_ARCHETYPE`): hearthholm → HQ / Orchestrator; millbrook → Coding; emberpeak → DevOps / Infra;
beaconrock → Marketing; palmlagoon → QA / Audit; mossgrove → Design / Art; lonelypalm → Research. The
`ThemeId` contract is in `src/world/types.ts` (`THEME_IDS` order is fixed; the index is the variant /
accessory index). `IslandData.theme` is set in `islandAt` and `hashLayout` adds it.
**Rationale**: the archetype's terrain suggests the department (flat plateau → coding campus, volcano →
data centre, lighthouse → broadcast tower, atoll ring → closed test loop). A swap of two themes is a
one-line change plus re-pinned hashes.
**Alternatives**: Marketing and QA may swap (lighthouse as QA watchtower, atoll as beach resort).
**Impact**: `content/themes/index.ts`, `content/islands-ui.ts` (accent and name), `cam=island:<theme>` in
`camera/controls.ts`. The roster guarantee is D-025.

## D-023: The session-2 branch supersedes main's parallel M7–M10 line — 2026-10-04

**Decision** (user-approved): `claude/inspiring-pascal-19nwjr` becomes `main`. The 11 commits session 1
pushed to `main` on 2026-10-03 15:42–16:13 UTC (9501fbe…71b2077: a second, independent implementation of
TASK-161/162/171/172/181/182/191) are merged with `-s ours`: their history stays reachable, their tree is
not applied.
**Rationale**: both lines implemented the same tasks in parallel. This line was validated by the 10-seed
sweep + polish rounds, runs at 9/17/24 programs within the D-010 budgets and carries Phase 2; main's
line raised the budgets to 22/32/36 and its wow set (27–29 programs) still shows the shelf seams, dim
night lamps and a faint beam. Picking per file would have mixed two incompatible APIs.
**To mine from 71b2077 later**: taller lit steam column (478bc09), ducks + capybaras (c9ffe83), polaroid
photo frame (9501fbe), W8 shell/starfish scatter, ripple rings around moored boats.

## D-022: Flooded settlements hide as units; LOD1 prop groups span all islands; GPU memory is summed from allocations (amends D-010) — 2026-10-04

**Decision** (Phase 2 polish after the edit sweep, defects 1/4/5/6):
- **Flooding**: a ground-following settlement prop whose ground sinks below
  `EDIT_RENDER.floodLevel` (−0.15 u) gets `PropFlag.removed` in the render store (batcher fade-out,
  instant in capture; lantern pools and contact blobs follow the flag) and loses it when the ground
  comes back (undo). Lots (building + side decor) and piers (plank segments + cargo + root lantern)
  are units: a lot floods with the ground under its centre, a pier with the ground at its shore root.
  Only what stood above the level in the *generated* world can flood (`?edit=` worlds are judged
  against a pre-replay copy of the heights, so a shared flooded link starts hidden); the lighthouse,
  crater, hot spring and wreck never do (`floodKeep`: beam / steam emitters). Chimney smoke follows
  its house (re-grounded, off while flooded: `puffs.setEmitter`); `life.setDocksHidden` stops
  villager trips to flooded pier ends and gull landings there (boats keep their moorings).
- **Draw calls**: LOD1 prop groups (tiers 0–1) are one InstancedMesh per (def, variant) across all
  islands (`ALL_ISLANDS` bucket); LOD0 stays per island (close views keep their culling). Seed 42
  `island:Hearthholm`: 129 → 96 calls (low), 260 → 202 (medium); worst of the 10 sweep seeds now
  96 / 202 (budgets 120 / 220); dev frames 0 px. Island views submit +2…+12 k off-screen triangles.
- **GPU memory** (`render/gpu-memory.ts`, replaces the per-object guess): geometry buffers of the
  scene (shared buffers once), uploaded textures, *allocated* render targets (×samples for MSAA),
  shadow maps and the drawing buffer, read lazily (`counters.gpuMemoryMB`, split in
  `timings.gpu{Geometry,Texture,Target,Shadow,Canvas}MB`). Measured: low 960×540 39–44 MB (geometry
  20–26, MSAA canvas 18; 1280×720 panel shot 56); medium 1920×1080 132–140 MB (composer buffers 2 × 23.7, luminance 15.8,
  bloom / tilt 25, shadow 8, canvas 16); high 1920×1080 352 (T1) – 421 (T3 + DOF) MB (MSAA×4
  HalfFloat composer buffers 2 × 118.7, shadow 32). Budgets (D-010 amended, DPR 1, low ≤ 1280×720,
  medium / high 1920×1080): **low 64, medium 170, high 480 MB**, asserted by `shots --assert`.
- **Leak self-tests**: `renderer.info.memory` counts a geometry from its first draw, so a hidden or
  culled life mesh (wake, sailboat) drawn between the two measurements read as ±1 (sweep D4, not a
  leak). Before each measurement the self-tests draw every scene object once (forced visible,
  unculled); `shots` also runs regen / edit at `cam=village`.
- **`worldHash`**: `hashes.world`, plus `:<editHash(world)>` while edits are applied.
**Rationale**: a village standing in the sea broke the diorama; units keep a pier or a house from
losing half its pieces. Per-island LOD1 groups bought little culling at the tiers where most islands
are in frame. The old memory figure double-counted targets and ignored MSAA.
**Open**: high could drop ~95 MB by not multisampling the composer's output buffer (post owner);
villagers / sheep still walk into flooded ground (walk graph and masks are build-time);
ARCHITECTURE §8 budget table still lists 40 / 90 / 160 MB "tex + RTs".

## D-021: Prop thumbnails from a short-lived second context; edit mode holds the governor — 2026-10-04

**Decision** (TASK-221): the edit panel's prop picker renders every placeable def once into a 64 px
atlas with a throw-away second `WebGLRenderer` (same builders + prop material, neutral-daylight
uniform swap by reference), reads it back once, caches PNG data URLs and disposes the context, so the
main renderer's programs/memory stay untouched. It runs 400 ms after the panel first opens (or at
once when Place is picked); in capture only with `panel=edit:prop`, before `ready`. In edit mode the
governor is held (`setDisabled('edit')`) and the tier cap lifted; idle orbit and intro are off.
**Rationale**: a 41-def picker needs real-looking thumbnails without 41 extra draw calls per frame
or a second scene in the main renderer; the governor stepping the tier down mid-stroke would make the
brush target change under the pointer.
**Cost**: 0.4–0.9 s in capture, 2.5–5 s live under SwiftShader (two GPU-process waits), hidden by
the prefetch.

## D-020: Sandbox edit model — in-place commands with byte-exact inverses, incremental SDF, varint log — 2026-10-04

**Decision** (TASK-201/202/211/212): `applyEdit(world, cmd)` mutates `WorldData` in place and returns
`inverse` commands (a private `patch` kind restores grid samples / prop slots verbatim → byte-exact
undo) plus an exact `DirtyRegion`. The shore SDF is NOT recomputed by a windowed EDT: two persistent
nearest-site maps are updated incrementally (error ≤ 0.064 u vs a full EDT, signs exact). The edit
log is base64url of a varint stream on a fixed grid (1/16 u, 1/256 strength, 1/4096 turn), ~2.7 KB
per 200 commands; `?edit=` replays it before the first build (no rebuild path at boot). Live edits
rebuild ≤ 2 chunks per frame (all at once in capture); textures are updated with `gl.texSubImage2D`
sub-rects through `renderer.state` (full `needsUpdate` fallback); removed props fade out through a
reversed `aAppear`; the batcher keeps a mirror of `world.props` so edit-added slots map to render
slots. The interactive `EditSession` owns history (strokes = one step) and autosave
(`marisland.edit.<seed>.v1`); the capture path uses the bare applier. Terrain edits do not touch
`pathGraph` or island metadata (paths may float; documented).
**Rationale**: in-place mutation keeps the Phase 1 pipeline (textures, mesher, batcher) untouched;
verbatim patches make undo exact without replaying; the varint codec keeps share URLs short and sync.
**Known fidelity gaps**: a `village`/`dock` preset is fitted from terrain heights, so a shared link
frames an edited village slightly differently than the editor saw it; the live SDF texture is only
refreshed within `EDIT_RENDER.sdfScanPad` of the edit.
**Addendum (edit sweep polish, 2026-10-04)**: (1) zones are generated BEFORE settlements reshape the
terrain, so stored zones are stale on terraces; `rederiveZones` therefore only applies shore-driven
transitions (sand bands / water classes) to cells whose height and 3×3 neighbourhood did not change —
slope-driven rock/cliff only where the height changed. (2) Raise/lower falloff is modulated by a seeded
8 u noise (`EDIT_BRUSH.noise`, amp 0.15, raise outline stretched up to 1.3×) and tapered above
`softCap` 12 u (×0.5 by 18 u) so stacked strokes build faceted hills, not domes; patches keep undo
exact. (3) Protected ground (`EDIT_BRUSH.protect`: piers ±0.8 u + 1 cell, mooring footprints, plaza
discs) never rises; lowering is allowed. (4) Placement uses the exact disc footprint
(`OccupancyGrid.isFreeDisc`). (5) Render side: ground-following settlement props (lots as one unit with
their decor, piers with cargo + root lantern) hide below `EDIT_RENDER.floodLevel` (−0.15 u) and bloom
back when the ground rises; `floodKeep` defs (lighthouse, crater, hot spring, wreck) never hide.

## D-019: Fitted camera presets; W9 looks down 9°, not 22°; portrait overview may exceed 800 u — 2026-10-03

**Decision** (TASK-192 D1/D2/D13, `camera/framing.ts` + `camera/poses.ts`, numbers in `content/camera.ts`):
- `overview` fits every island's shelf ring (land reach + 22 u) and peak into the safe area — HUD dock
  (96 px) and label row (44 px) excluded when the HUD is on — at the fixed 58° pitch, sliding the target so
  the archipelago is centred in that area; distance ≥ 450 u. A 9:16 phone needs ≈ 1.3–2.2k u to fit the
  width, so the zoom-out limit follows the fitted pose (`controls.maxDistance = max(800, fit)`).
- `village` / `dock` fit the settlement pipeline's own output (all lots + plaza + piers / the first pier,
  its moorings and the lots by its root) from over the water (heading = centroid → harbour bay, or the
  deepest nearby water), on the pitch curve, 72–125 u / 64–110 u. The old target was the harbour↔centre
  midpoint and the heading used `rotY + 180°` as an azimuth, which mixes the xz-angle (cos, sin) and the
  camera-controls azimuth (sin, cos) conventions — the camera sat mirrored about x = z (D1).
  `azimuthToward(rotY)` converts; `shore` / `macro-beach` use it too.
- Tiny islands (land reach ≤ 20 u: Lonely Palm) get a hero framing: look-down 9°, heading −78° (toward the
  evening sun), target fixed on the island, distance searched so the shelf ring and the palm top fit.
  **The bible's W9 "pitch 22°" cannot show a horizon at FOV 35°** (the horizon is in frame only below
  17.5°, in the top third between 6° and 17.5°), and at 22° the camera is above the crown so the palm reads
  against water. W9 now says ≈ 9°.
- The user pitch band's lower edge blends to 8° at ≤ 50 u (back to the curve by 90 u) so the hero pose is
  reachable without a snap on the first drag.
**Rationale**: fixed distances cannot frame settlements whose size and orientation vary per seed; a fit
over the generated points is deterministic and seed-independent.
**Impact**: `CameraWorld.islands[]` gains `reach`, `peakX/Z`, `frames`; `CameraSystem.setSafeInsets()`;
`pitchBand` moved to `camera/poses.ts` (re-exported). Island labels sit above the projected shelf ring.

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
