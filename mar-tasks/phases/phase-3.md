# Phase 3: Agent Islands

Goal: seven themed department islands (HQ, Coding, Marketing, QA, Design, DevOps, Research) with office
campuses and simulated worker bots, then graphics upgrades (terrain/props detail, decor, AO/shadows/reflections).
User-approved 2026-10-05: all 7 themes guaranteed per seed (hash re-pin), villagers → workers, budget raises per §6.

**Shared contract** (TASK-300): `ThemeId` in `src/world/types.ts`, `src/content/themes.ts`, `src/content/offices.ts`,
`src/world/lot-frame.ts`. Changes to it go through the orchestrator.

---

## 0. What the code tells us (constraints the plan is built on)

1. **Only Hearthholm has a real village today.** `buildSettlements` (src/world/gen/settlements.ts:1583) switches per archetype (:1610):
   - `planHearthholm` (:630) builds a plaza, lanes, 10–16 cottages, stalls and stilt huts.
   - Millbrook gets a barn plus 2–4 cottages (:955).
   - Beacon Rock gets 1 keeper hut (:884), Mossgrove 1 cabin (:1135), Palmlagoon 1 stilt hut (:1054).
   - **Emberpeak (:1033) and Lonely Palm (:1186) get no lots at all.**

   So "villages become campuses" needs a generic campus planner that runs on every island, not a re-skin.
2. **Draw calls are the tight budget.**
   - Groups are per (def, variant, island) at LOD0 and per (def, variant) across all islands at LOD1 (D-022, batcher.ts:570).
   - The seed 42 worst case is 96/120 calls on low.
   - About 20 themed building defs would add up to about 40 LOD1 groups at T1. The plan therefore adds shared LOD1 proxies and puts interiors in a separate tier-2 def.
3. **Programs are 9/17/24 against budgets of 12/20/24.** High has no headroom (MEMORY).
   - M14 must add zero programs: buildings use the shared lit program, workers use the shared creature program.
   - SSAO in M18 needs a deliberate raise on high.
4. **Creature program attributes are at 15/16** (D-013, life-material.ts header). Worker bots may not add attributes. New poses must be encoded in the existing `aGait`, accessory variants in the existing `aSeed`.
5. **Geometry is built lazily per used (geo, variant, lod)** (batcher.ts:127). Unused theme variants cost nothing.
6. **`appendSettlementProps.push` returns −1 for an unknown def** (settlement-props.ts:70). Render code can land before the geometry exists without breaking anything. This makes parallel work safe.
7. **pmndrs `SSAOEffect` builds its noise texture with `Math.random`** (node_modules/postprocessing/build/index.js:5969, used at :12294). It breaks pixel determinism unless we replace it.
8. **r186 `PCFShadowMap` already uses a 5-tap Vogel disk driven by `shadow.radius`** (shadowmap_pars_fragment). Softer shadows are a content/fit change. Wiring is already there at shadows.ts:200 with `SHADOW.pcfMin/pcfMax`.

---

## 1. Archetype to theme mapping (decision proposal D-024)

| Archetype | Theme | Why it fits the terrain and landmark |
|---|---|---|
| **hearthholm** (hero, 110–140 u, harbour crescent, plaza, clocktower, always present) | **HQ / Orchestrator** | It is the biggest island and the only one guaranteed. The harbour is the hub of the boat routes, so all ferries pass HQ. The plaza becomes the central quad. The clocktower is re-skinned as the **Orchestrator Tower**: a beacon ring on top that turns through the existing windmill `aSpin` branch. |
| **millbrook** (flat 6–8 u plateau, patchwork fields, windmills) | **Coding** | Coding is the largest team and needs the most flat land, and this plateau is the biggest flat area. The windmills stay (they read as "build turbines"). Some field patches can become solar-panel rows in M17. Long open-plan dev offices sit naturally on the flat plateau. |
| **emberpeak** (35 u volcano, lava glow, steam, hot spring, black sand) | **DevOps / Infra** | The volcano reads as a forge or server furnace. Steam reads as cooling towers, the hot spring as geothermal power and a cooling pool, lava glow as rack LEDs at night. A data center terraced into the lee slope is a strong silhouette. Today it has no settlement at all, so it gains the most. |
| **beaconrock** (25 u sheer stack, lighthouse, beam, tall/dark, small) | **Marketing** | The lighthouse becomes a broadcast tower (dish and antenna on the gallery, beam kept): it sends the message outward and is visible from every island. Marketing is a small team, which fits the small footprint: a studio, billboards on the ledge, megaphone speakers. |
| **palmlagoon** (atoll ring, inner lagoon, sunken ship) | **QA / Audit (denetim)** | The lagoon is literally a sandbox. The ring is a closed test loop that inspectors patrol. The sunken ship is the cautionary "bug that got away". The flat sand takes a test lab plus an inspection watchtower (the island's only vertical, since the wreck is underwater). |
| **mossgrove** (20 u forest dome, giant treehouse, stream, red mushrooms) | **Design / Art** | It is the most colourful, organic island. The treehouse becomes an atelier. Clearings take a sculpture garden, the mushrooms already give a palette accent, and the stream suits easels. W10 (rainy grove, lit treehouse windows) stays intact. |
| **lonelypalm** (10–16 u sandbar) | **Research** | The remote field-station trope (ocean or polar research stations): one tiny lab hut, a telescope, a weather mast, 1–2 researchers, supplied by rowboat. It is the only theme that reads well as an outpost of 1–2 buildings, so the tiny island does not cripple a team that needs a campus. |

**Alternative.** Marketing and QA can swap (lighthouse = QA watchtower, atoll = beach marketing resort). Because the mapping is one data table (`THEME_BY_ARCHETYPE` in src/content/themes.ts), the swap is a one-line change plus re-pinned hashes.

**Roster decision: guarantee all 7 themes in every seed (D-024).**
- Change `LAYOUT.countWeights` (src/content/islands.ts:218) to `[[7, 1]]`. `lonelyPalmChance` (:226) becomes moot: Lonely Palm is always present at count 7 (layout.ts:107).
- Why: the archipelago is an org chart, and a missing department breaks the fiction. The feasibility is already proven, since today about 25 % of seeds roll 7 islands and pass every layout rule.
- The medium rule [2, 3] still holds: four mediums means Palmlagoon is demoted through its existing `demotedDiameter`.
- Cost:
  - Every seed's layout changes, so every hash and shot is re-pinned.
  - The fitted overview is a little wider.
  - The 500-seed layout test must check that the contrast fallback rate stays low (raise `LAYOUT.attempts` if not).
- `?islands=1` (M1 single island) keeps working with theme `hq`.

---

## 2. Theme data schema

### 2.1 Contract (TASK-300, lands first; other tasks code against it)

**`src/world/types.ts`** (pure, no content import):
- `export type ThemeId = 'hq' | 'coding' | 'marketing' | 'qa' | 'design' | 'devops' | 'research';`
- `export const THEME_IDS: readonly ThemeId[]` in fixed order. The index is used as a variant / accessory index.
- `IslandData` (:53) gains `theme: ThemeId`, set in `islandAt` (layout.ts:27) from `THEME_BY_ARCHETYPE`. `hashLayout` (gen/hash.ts:55) adds `.str(isl.theme)`.
- `LotKind` (:191) gains `'office' | 'studio' | 'lab' | 'shed' | 'kiosk' | 'pavilion' | 'outpost'`.
- `LotData` (:197) gains `role: 'main' | 'office' | 'annex' | 'kiosk' | 'pavilion' | 'legacy'`. This is informational and used by life and decor.
- `SettlementData` (:268):
  - gains `theme: ThemeId`;
  - `kind` gains `'campus'`;
  - `plaza` becomes the campus quad on every island that finds one. The type is unchanged, but it is no longer Hearthholm-only. `frames.ts` village framing benefits automatically.

**`src/content/themes.ts`** (new, data only):

```ts
interface ThemeDef {
  id: ThemeId; displayName: string;        // 'Coding'
  short: string;                           // 'CODE' chip text
  icon: ThemeIconKey;                      // ui/theme-icons.ts key
  accent: string;                          // label dot / chip, worker body base
  teamTints: readonly string[];            // 3 worker body tints around the accent
  lotMix: readonly [defId: string, weight: number][]; // campus lane lots
  crown: string | null;                    // highest-lot swap (like towerHouse today)
  defSwap: Readonly<Record<string, string>>;  // legacy archetype lot -> themed def
  landmarkVariant: Readonly<Record<string, number>>; // clocktower->1 (orchestrator), lighthouse->1 (broadcast)
  decor: readonly [defId: string, weight: number][]; // settlement-props campus decor
  workers: { weight: number; cap: number; deskShare: number };
  accessory: number;                       // worker accessory index (shader mode 8)
}
export const THEMES: Record<ThemeId, ThemeDef>;
export const THEME_BY_ARCHETYPE: Record<ArchetypeId, ThemeId>;
```

**`src/content/offices.ts`** (new, single source of truth shared by `geo/` and `life/`):
- `WORK_SPOTS[defId]`: lot-local `{x, z, yaw, pose: 'type'|'stand'|'paint'|'inspect'|'look'|'rack', seat: number}[]`. Desks are exactly where the interior geometry builds them.
- `INTERIOR_OF[defId]`: `{def, variant}`, i.e. the tier-2 interior def for each shell.
- `EMITTERS[defId]`: `{x, y, z, preset: 'chimney'|'vent'}[]`. This generalises the hard-coded chimneys at settlement-props.ts:118.
- Legacy entries for `cottage`, `logCabin`, `stiltHut` (a bench spot at the door), so life works before the themed lots exist.

**`src/world/lot-frame.ts`** (new, pure): `lotYaw(lot)` = `atan2(cos rotY, sin rotY)` (the convention at settlement-props.ts:103), plus `lotLocalToWorld(lot, lx, lz)`. It is used by settlement-props, life and tests, so geometry desks and agent seats can never drift apart.

**`src/content/props.ts` `PropDef`** gains:
- `lod1?: { geo: string; variant: number }`: a shared LOD1 proxy. The batcher groups LOD1 by this key.
- `interior?: true`: a tier-2 interior shell. It is never placeable, never clusterable and never casts shadows on low.

### 2.2 Who reads the theme

| Consumer | Reads |
|---|---|
| worldgen `settlements.ts` | `isl.theme` → `CAMPUS[theme]` (content/settlements.ts), `THEMES[theme].lotMix / crown / defSwap / landmarkVariant` |
| worldgen `scatter.ts` (M17) | `PlacementRule.themes?: ThemeId[]`, filtered next to the archetype gate at scatter.ts:157 |
| render `settlement-props.ts` | `world.settlements[i].theme`, `THEMES.decor`, `INTERIOR_OF`, `EMITTERS`, `landmarkVariant` |
| life `workers-world.ts` | `isl.theme` → `THEMES.workers` + `WORK_SPOTS`; team tint from `teamTints`; accessory from `THEMES.accessory` |
| UI `hud.ts` | `CameraWorld.islands[].theme` → `THEMES.displayName/icon/accent` |
| camera `controls.ts` | `findIsland` (:485) also matches theme id/name, so `cam=island:coding`, `cam=village:devops` work |

---

## 3. Worker bot ("agent") design

**Name.** Use "workers" in code. `life/agents.ts` `AgentKind` is already the base-class name, so "agents" would collide.

**Geometry** (`src/life/geo/workers.ts`, built with `TriBuilder` like `buildVillager` in life/geo/land.ts):
- About 1.0 u tall, scaled 1.7 like villagers (`LAND.size`). Roughly 700–900 triangles, flat-shaded and chunky.
- Body: bevelled capsule-box with white vertices, so it takes the instance tint (team colour); `uTintAll = 0` as for villagers.
- Head: a rounded "monitor" box with a dark face `#2B2B36` and two pale eye dots. The eye vertices carry `emissive = 2` (the screen class from TASK-305), so eyes glow softly by day and brighter at night. The `emissive` attribute slot already exists in the creature program (DEFAULTS in life-material.ts), so this costs no new attribute.
- Antenna plus ball: limb mode 2 (tail sway) gives the antenna its bob.
- Legs: stubby, limb mode 0 swing. Arms: right arm mode 3 (walk swing plus wave), left arm mode 0, and both arms also carry the new mode 7 (typing).
- Accessories: the new **mode 8** collapses every accessory except index `floor(aSeed)`. Workers set `aSeed = accessory + phase01`; phases use `fract` and existing `sin(... + aSeed*2π)` terms are unchanged for integer offsets. Accessories by theme:
  - HQ: headset with mic;
  - Coding: hood with headphones;
  - Marketing: megaphone badge / cap;
  - QA: visor with magnifier monocle;
  - Design: beret;
  - DevOps: hard hat;
  - Research: goggles.

  Mode 5 (villager hats) stays untouched.

**Shader** (`src/life/life-material.ts` BODY at :34). Pose kind is encoded in `aGait.y`: `0..1` means wave (existing), `2..3` means typing amount = y − 2. Concretely:
- Decode at the top of the non-gull branch: `lType = lPose >= 1.5 ? lPose - 2.0 : 0.0; lPose = lPose >= 1.5 ? 0.0 : lPose;`.
- Mode 7: arms pitch forward about 70° times `lType`, alternating ±0.12 rad at about 9 Hz (`uTime`, `aSeed`), scaled by `uMotionScale`.
- Mode 8: the accessory collapse described above.
- Same `customProgramCacheKey`, so the program count does not change.

**Instancing.** One `InstancedMesh` for all workers on all islands, plus boat passengers in the same mesh. That is 1 draw call and 0 new programs. It follows the land-kind pattern: whole re-upload each frame, never `addUpdateRange` (MEMORY).

**Behaviour** (`src/life/workers.ts`, `class Workers extends LandKind`; copy and adapt the `Villagers` walk core at land.ts:218–498). The states:
- `WALK`: path-graph route between door / hub / dock nodes (`walkRoute`).
- `PAUSE`: look around at a node.
- `WAVE`: camera within 25 u at T3, or a click emote.
- `ENTER` → `WORK` → `EXIT`:
  - On reaching a lot door node, the worker reserves a free `WORK_SPOTS` seat (at most 1 worker per seat).
  - It walks the straight line door → entrance (lot-local `(0, d/2 − 0.3)`) → seat, in world coordinates via `lotLocalToWorld`.
  - It sits: y drops by `seat`, it faces the desk yaw, `aGait.y = 2 + type` with a spring-in.
  - It stays `WORKERS.desk` = 20–60 s, with a small stretch beat every 8–15 s, then walks back out.
- `RIDE` (M16): passenger on a sailboat.
- Outpost mode (Lonely Palm, or any island without a graph component): straight-line loop between spot anchors (hut door → telescope → palm), checked with `lineOk` against a sand mask.

**Spawn** (`src/life/workers-world.ts`, pure, vitest-able like `planVillagers` at land-world.ts:343):
- Allocate `LIFE_PLAN[q].workers` over islands by `THEMES[theme].workers.weight`, capped by seats plus walkers.
- At t = 0, `deskShare` (about 0.5) start already seated, with a hashed remaining time, so `simt = 2` captures deterministically show typing agents.
- Every draw goes through `unitHash(seed ^ kindSalt, i, n)`. No `Math.random`; the ESLint ban covers `life/`.

**Visibility at desks.**
- Every themed building has at least 1 seat that is visible from outside: a veranda desk, an open-front pavilion, a patio standing desk, an easel, a telescope or an outdoor rack aisle.
- Interior seats sit behind large window openings: holes in the wall, not glass, so everything stays opaque.
- Interior furniture is a separate tier-2 def (§4.2). At T3 you look into the offices.

**Boats (M16).** The `Sailboats` kind already stops at docks (`ROUTES.dockReach`).
- A worker idling at a dock end with a planned trip to another island hands off: it becomes a `RIDE` slot locked to the boat transform when the boat passes the stop, and alights at the next stop onto that island's graph component.
- The handoff is purely sim-step driven, so it is deterministic.
- Fallback if this slips: each sailboat carries 1–2 seated waving passengers, with no transfer.

**Allocation.** `LIFE_PLAN` (content/life.ts:24):

| Quality | workers | villagers | cats / sheep |
|---|---|---|---|
| low | 6 | 3 → 0 | 1 / 2 (stays ≤ 25 live) |
| medium | 16 | 5 → 0 | unchanged |
| high | 30 | 9 → 0 | unchanged |

`Villagers` code stays (not deleted), so a later "visitors" option is cheap.

---

## 4. Buildings and campus generation

### 4.1 Campus planner (worldgen)

- **Refactor** the lane loop from `planHearthholm` (settlements.ts:691–760) into `layLanes(ctx, isl, quad, spec, rng)`.
- **HQ** = `planHearthholm` with lot defs taken from `THEMES.hq.lotMix`:
  - the crown (highest lot) becomes `hqAnnex`, replacing the tower house;
  - the clocktower gets landmark variant 1;
  - stalls become `coffeeKiosk`;
  - stilt huts are kept (ferry office).
- **Other islands** keep their archetype planner (landmark, dock, buoys, tide pools). Then:
  - `tryLot` applies `THEMES[theme].defSwap`: barn → `devOffice`, cottage → `devPod`/`broadcastStudio`, logCabin → `atelier`, stiltHut → `testLabStilt` or kept.
  - A new `planCampus(ctx, isl, plan, CAMPUS[theme], rng.fork('campus'))` adds:
    1. a quad (`bestSample` near `plan.hub`, scored on relief and distance, radius `spec.quadR`, flatten pad, `Zone.plaza`);
    2. lanes plus lots from `lotMix` until `spec.lots[1]` is reached or land runs out;
    3. links to hub and dock.
- **Per-archetype tuning** (content `CAMPUS`):

| Theme (archetype) | lots | minShore | maxRelief | Notes |
|---|---|---|---|---|
| Coding (millbrook) | 8–12 | — | — | avoid field cells, as the farm logic at :978 does |
| DevOps (emberpeak) | 5–8 | 4 | 2.5 | lee side, stepped pads; `FLATTEN.maxStep` already makes terraces |
| QA (palmlagoon) | 5–7 | 2.5 | — | lanes follow the ring between hub and channel dock |
| Design (mossgrove) | 5–7 | — | — | avoid the stream (reuse `cabinStreamClear`) |
| Marketing (beaconrock) | 2–4 | — | — | landing ledge plus keeper ring |
| Research (lonelypalm) | 1 | — | — | outpost |

- **Lonely Palm (Research)** gets 1 `researchHut` lot (2.5 × 2.5) plus a telescope fixture, at least 4 u from the palm and offset perpendicular to the W9 hero heading (−78°, D-019) so the palm silhouette stays clean. It also gets a 2–3 segment carved dock with 1 rowboat. No path graph is required (outpost mode).
- **Variants.** `assignLotVariants` (:1502) keeps the roof-neighbour rule. Themed defs have 2 sub-variants. Each new def needs `LOT_ROOFS` entries whose count equals its variant count (props-buildings.test.ts checks counts).

### 4.2 Building set (props)

At most 4 themed shells per theme, 2 variants each:

| Theme | Shells | Signature details |
|---|---|---|
| HQ | `hqOffice`, `hqAnnex` (crown), `meetingPavilion`, `coffeeKiosk`; clocktower v1 = Orchestrator Tower | beacon ring (spins via `aSpin`), glass-front lobby, round meeting table under a canopy |
| Coding | `devOffice` (long open-plan, glass front), `devPod`, `serverShed` | monitor-glow window bands, rooftop solar, patio standing desks |
| Marketing | `broadcastStudio`, `billboard` (lot-sized, on posts); lighthouse v1 = broadcast | dish on the roof, "ON AIR" lamp (emissive), megaphone speakers |
| QA | `testLab`, `inspectionTower`, `testLabStilt` | checklist board with check glyphs, traffic cones, barrier gate |
| Design | `atelier` (sawtooth north-light roof), `galleryPavilion` | easels, abstract sculptures (torus, stacked spheres), paint-pot planters |
| DevOps | `dataCenter` (long, low, rack rows behind window strips), `rackShed`, `antennaMast` | roof vents with steam (EMITTERS `vent`), spinning fans (`aSpin`), pipelines |
| Research | `researchHut`, `telescope` | dome cap, weather vane (`aSpin`) |

**Interiors.**
- One `officeInterior` def (tier 2, `interior: true`, fade 120–160 like T2) with about 5 variants: desk rows, meeting table, server racks, easels, lab bench.
- One instance per lot through `INTERIOR_OF`. It costs nothing at T0/T1, and at T2 adds 1 group per island.

**LOD1.**
- Every themed shell sets `lod1: {geo: 'officeLod1', variant: 0..3}`: 4 shared proxy classes (S/M/L/tower), each a closed box plus roof plus an emissive window band.
- The batcher groups LOD1 by that key, so T0/T1 stays at about +4 groups total instead of about 40.

**Glyph signs.** These are 3D extruded theme icons (`prism` of a `Vector2` profile in parts.ts:48). No textures.

---

## 5. Labels and HUD

- `hud.ts:492` builds labels from `CameraWorld.islands`. Change the pill to: `[18 px accent disc with white theme glyph] <Theme name>` plus a muted 12 px Nunito island name (`Velmora`) shown only when the viewport is ≥ 600 px wide; on portrait it goes into `aria-label` and the title.
- Example: "(</>) Coding · Velmora". Hearthholm reads "HQ · Hearthholm".
- Icons, in `src/ui/theme-icons.ts`, 24-viewBox stroke 2.5 with round caps to match the ART_BIBLE §9 icon style:
  - hq: hub nodes / star;
  - coding: `</>`;
  - marketing: megaphone;
  - qa: magnifier with check;
  - design: palette plus brush;
  - devops: gear plus server;
  - research: flask / telescope.
- `ISLAND_ACCENTS` (content/islands-ui.ts) stays as the export name (so app.ts:594/727 need no change) but is derived from `THEMES[THEME_BY_ARCHETYPE[a]].accent`, keyed by archetype display name.
- `CameraWorld.islands[]` (camera/poses.ts:29) gains `theme?: ThemeId`; world-view.ts:338 passes `theme: i.theme`.
- Labels stay T0-only (bible §9). The label-collision nudge must use measured widths (wider pills), and the test at 390 × 844 needs no overlap.
- Loader captions in content/ui.ts: add "Booting agents…", "Spinning up servers…".

---

## 6. Budget changes (record as D-028; raise only to measured + about 10 % headroom)

| Metric | low | medium | high | Step / reason |
|---|---|---|---|---|
| drawCalls | 120 → **135** | 220 → **250** | 350 → **400** | M14: campuses on 7 islands, interior groups at T2 |
| triangles | 350k (keep) | 800k → **1.0M** | 1.6M → **2.4M** | M15: fine terrain (high only), building detail |
| instances | 6k → **7k** | 15k → **18k** | 30k → **38k** | M14/M17: decor, flower fields |
| groundCover | 3k (keep) | 12k → **14k** | 30k → **36k** | M17: flower fields |
| agents | 25 (keep) | 50 → **60** | 90 → **110** | M14: workers |
| programs | 12 (keep) | 20 (keep) | 24 → **28** | M18: SSAO (NormalPass override, SSAO + depth-downsample passes). Amends D-010. |
| gpuMemoryMB | 64 → **72** | 170 → **185** | 480 (**keep**) | M15/M18. On high, fixing the composer outputBuffer MSAA waste (−~95 MB, MEMORY open item) pays for SSAO targets (~15 MB) plus the fine-terrain chunk cache (≤ 16 chunks, ~15 MB). |
| jsHeapMB | 120 → 130 | 180 → 200 | 250 → 280 | M14: lots, spots, worker state |
| newSeedMs | 1500 | 800 → **900** | 500 → **600** | M14: campus A* on 7 islands |

- Mirror `instanceCap` / `agentCap` in `QUALITY_PRESETS` (src/core/quality.ts:17) in the same commit.
- **M14 acceptance: programs stay exactly 9/17/24.**

---

## 7. Milestones and tasks (task-index format)

### M14: Agent Islands
*7 themed campuses with working bots: a visibly themed, populated archipelago*

| ID | Task | Agent | Complexity | Status | Dependencies |
|----|------|-------|-----------|--------|-------------|
| TASK-300 | Phase 3 contract: ThemeId / IslandData.theme / LotKind / LotData.role / SettlementData.theme, `content/themes.ts`, `content/offices.ts`, `world/lot-frame.ts`, PropDef `lod1`/`interior`, `phases/phase-3.md` | engine (orchestrator) | S | PENDING | Phase 2 |
| TASK-301 | Roster guarantees 7 themes; theme on IslandData; hashLayout; re-pin | worldgen | M | PENDING | TASK-300 |
| TASK-302 | Campus planner on every island (layLanes refactor, planCampus, defSwap, Research outpost) | worldgen | L | PENDING | TASK-301 |
| TASK-303 | Themed shells, officeInterior, LOD1 proxies, landmark variants (orchestrator tower, broadcast lighthouse), glyph signs | props | L | PENDING | TASK-300 |
| TASK-304 | Render wiring: settlement-props campus decor, interiors, emitters (vents), batcher shared LOD1 groups | engine | M | PENDING | TASK-300 |
| TASK-305 | Screen emissive class (day-on monitors/eyes), night-grade hue spare, lantern pools for new lamps | shader | S | PENDING | TASK-300 |
| TASK-306 | Worker bot geometry + creature-shader typing pose (mode 7) and accessory mode 8 | life | M | PENDING | TASK-300 |
| TASK-307 | Workers kind: walk / desk-work / wave / outpost loop, spawn plan, picking + click emote | life | L | PENDING | TASK-300, TASK-306 (API) |
| TASK-308 | Theme labels + icons, camera theme lookup, CameraWorld.theme | engine | M | PENDING | TASK-300 |
| TASK-309 | Shot presets (campus ×7, desk macro, night campus), EDIT_LOGS re-record, M14 budget raise | engine | S | PENDING | TASK-301…308 |
| TASK-310 | M14 QA: 10-seed sweep, contact sheet M14.jpg, budgets --assert ×3 qualities | qa | S | PENDING | TASK-309 |
| TASK-311 | Docs: ART_BIBLE §4/§5/§7 theme rows, ARCHITECTURE Phase 3, D-024…D-028, MEMORY, task-index | docs | S | PENDING | TASK-310 |

### M15: Graphics I: terrain & building detail
*High tier: finer terrain, rounder trees, detailed buildings*

| ID | Task | Agent | Complexity | Status | Dependencies |
|----|------|-------|-----------|--------|-------------|
| TASK-321 | Fine terrain LOD (1 u facets, bicubic-clamped + zone-masked micro-noise) near focus on high | shader | L | PENDING | M14 |
| TASK-322 | Detail pass: rounder trees, window frames/mullions, roof ridges/eaves, steps, interior props | props | L | PENDING | TASK-303 |
| TASK-323 | M15 QA + triangle/memory budget step | qa | S | PENDING | TASK-321, TASK-322 |

### M16: Living campus
*Commuting bots, more creatures, flood-aware desks*

| ID | Task | Agent | Complexity | Status | Dependencies |
|----|------|-------|-----------|--------|-------------|
| TASK-331 | Boat commute (dock → sailboat → dock handoff), passengers wave | life | M | PENDING | TASK-307 |
| TASK-332 | Creatures: ducks (Coding pond), capybaras (DevOps spring), butterflies (Design), puffins (Marketing); mine 71b2077 (D-023) | life | M | PENDING | M14 |
| TASK-333 | Flood-aware lots: prop-mirror `floodedLots` → `life.setLotsHidden` (workers skip flooded desks); `life/index.ts` hooks for 331/332 | engine | S | PENDING | TASK-331, TASK-332 |

### M17: Graphics II: decor & nature
*Flower fields, fences, lanterns, benches, signs, rocks*

| ID | Task | Agent | Complexity | Status | Dependencies |
|----|------|-------|-----------|--------|-------------|
| TASK-341 | Decor geometry: flowerPatch, picket fence, stone lantern, bench v2, signpost (glyph), boulders, planter, picnic table, solar panel row, pipe segment | props | M | PENDING | M14 |
| TASK-342 | Placement: flower fields, boulders, theme-gated scatter (`themes`), campus fences, signpost anchors, DevOps pipelines | worldgen | M | PENDING | M14 |
| TASK-343 | Settlement-props emission for fences / pipes / signs; EDIT_PROPS placeables + thumbnails | engine | S | PENDING | TASK-341, TASK-342 |

### M18: Graphics III: light & post
*AO, softer shadows, water reflections*

| ID | Task | Agent | Complexity | Status | Dependencies |
|----|------|-------|-----------|--------|-------------|
| TASK-351 | SSAO (high) with seeded noise, composer outputBuffer MSAA fix, program audit | shader | M | PENDING | M14 |
| TASK-352 | Softer shadows: per-tier penumbra/PCF radius, tighter T2/T3 fit, contact-blob tune | shader | S | PENDING | M14 |
| TASK-353 | Water reflections: heightfield ray-march land reflection + albedo texture (high), sun glint (W9 debt), lit-window shimmer at night | shader | L | PENDING | M14 |
| TASK-354 | Phase 3 exit QA: wow + dev sets ×3 qualities, budget decision D-028 final, user real-GPU check | qa | M | PENDING | TASK-351…353 |
| TASK-355 | Docs: DECISIONS D-029…D-031, ARCHITECTURE §3/§8, MEMORY gotchas, README | docs | S | PENDING | TASK-354 |

---

## 8. Task details

### TASK-300: Phase 3 contract (orchestrator commits it before any parallel agent starts)

**Create:**
- src/content/themes.ts (THEMES with real accents and names, workers weights; lotMix/decor lists may name defs that do not exist yet);
- src/content/offices.ts (WORK_SPOTS incl. legacy cottage / logCabin / stiltHut, INTERIOR_OF, EMITTERS with the current chimney offset for cottage/logCabin/towerHouse);
- src/world/lot-frame.ts (+ lot-frame.test.ts);
- mar-tasks/phases/phase-3.md (this plan's acceptance criteria).

**Modify:**
- src/world/types.ts (:41 add ThemeId + THEME_IDS; :53 `theme`; :191 LotKind; :197 `role`; :268 `theme`, kind comment);
- src/content/props.ts (`PropDef.lod1?`, `interior?`).

**Temporary defaults so the tree compiles and tests stay green:** `islandAt` sets `theme: THEME_BY_ARCHETYPE[archetype]` (layout.ts:27, a 1-line change), `role: 'legacy'` and `theme` are filled in buildSettlements. Hash keys are unchanged in this task.

**Acceptance:** typecheck, lint and test green. World hashes unchanged (theme is not yet hashed). `lotLocalToWorld` agrees with settlement-props' yaw convention (unit test vs the formula at settlement-props.ts:103).

### TASK-301: Roster guarantee + theme hashing (worldgen)

**Modify:**
- src/content/islands.ts (:218 `countWeights: [[7,1]]`; document `lonelyPalmChance` as unused at count 7);
- src/world/gen/layout.ts (`pickRoster` :105, simplify for count 7: the tall-landmark rule is trivially met, and the demotion path covers 4 mediums);
- src/world/gen/hash.ts (:55 add theme);
- src/world/layout.test.ts (counts are always 7; every ThemeId appears exactly once; contrast-fallback rate over 500 seeds < 5 %, otherwise raise `LAYOUT.attempts`);
- src/world/world.test.ts (:37 re-pin seeds 1, 42, 1001);
- src/world/archipelago.test.ts.

**Acceptance:**
- 500 seeds give 7 islands, extent ≤ 300, all layout rules hold (or are reported as fallback).
- Layout test time within `perfLimit`.
- Shots are not required (TASK-309 re-pins presets), but run `pnpm shots ci --tag=t301 --port=<unique>` to see that the overview still frames everything.

### TASK-302: Campus planner (worldgen, L)

**Modify:**
- src/world/gen/settlements.ts:
  - extract `layLanes` from `planHearthholm` :691–760;
  - new `planCampus`, called after each archetype plan in the switch at :1610;
  - `tryLot` (:305) applies `defSwap`;
  - `planLonelyPalm` (:1186) gains the outpost hut + dock;
  - `assignLotVariants` (:1502) is unchanged;
  - set `LotData.role` and `SettlementData.theme`.
- src/content/settlements.ts:
  - `LOT_FOOTPRINT` (:11), `LOT_KIND` (:21), `LOT_ROOFS` (:36) for every themed def id in the contract;
  - `LANDMARKS` (:56) keeps clocktower/lighthouse footprints (variants only);
  - new `CAMPUS: Record<ThemeId, CampusSpec>`.
- src/world/settlements.test.ts, src/world/world.test.ts (re-pin).

**Acceptance (50 seeds):**
- Every island except Research has a settlement with `theme` and a quad (plaza).
- Lot counts: HQ ≥ 8, Coding ≥ 6, DevOps ≥ 4, QA ≥ 4, Design ≥ 4, Marketing ≥ 2, Research = 1. The DevOps / QA / Design / Marketing / Research minimums must hold in ≥ 90 % of seeds. Every failure is logged with its reason.
- Every lot is connected (node ≥ 0), as the existing "every house connected" test requires.
- No lot overlaps a dock basin, stream, field patch centre or landmark.
- The Research hut keeps ≥ 4 u from the palm and lies outside ±25° of the W9 view line.
- Settlement stage time ≤ `perfLimit(…)` (raise the constant with a note if campus A* needs it).

**Shots:** `pnpm shots dev --tag=t302 --port=<p>` with `debug=mask` overview. Lots should read as clusters on all 6 big islands.

### TASK-303: Themed shells, interiors, proxies (props, L)

**Create:**
- src/geo/office-kit.ts: `wallWithOpenings(w, h, d, openings[])` (strip boxes around holes), `glassFrontMullions`, `flatRoofParapet`, `sawtoothRoof`, `domeCap`, `rooftopDish`, `vent`, `solarRow`, `glyph(themeId)` (prism of the icon outline);
- src/geo/offices.ts: the shells in §4.2, LOD0 + LOD1, 2 variants each, plus `officeLod1` with 4 variants;
- src/geo/interiors.ts: `officeInterior`, 5 variants. Desks, chairs, monitors (screen faces `emissive = 2`), racks with LED dots (`emissive = 2`), easels, round table. Desk positions read from `WORK_SPOTS`, never hard-coded.
- src/content/palette-offices.ts.

**Modify:**
- src/geo/registry.ts (register; the `D(...)` list at :105);
- src/content/props-buildings.ts (PropDefs: shells tier 1 with `lod1`, interior tier 2 with `interior: true`, fade [120, 160]; `clocktower` / `lighthouse` variants 2 → 3, adding the orchestrator / broadcast variant);
- src/geo/landmarks.ts (clocktower v2 = orchestrator tower with a beacon ring tagged with `aSpin`; lighthouse v2 = broadcast: dish plus antenna, lamp room at the same height so the beam (render/night/beam.ts) still lines up);
- src/geo/geo.test.ts, src/content/props-buildings.test.ts.

**Do not touch** buildings.ts palette sets: the MEMORY rule mirrors them in LOT_ROOFS.

**Acceptance:**
- Every new def builds for all variants × LOD.
- LOD1 is ≤ 30 % of LOD0 triangles (existing rule).
- Triangle ceilings: shell LOD0 ≤ 3.5k, interior ≤ 2.5k, `officeLod1` ≤ 150.
- Each geometry has the same attribute set as `cottage` (position / normal / color / ao / emissive / wind as used). Check with `MESHES=1 tsx scripts/programs-dump.ts`; no mesh relies on default attributes it should carry.
- `?gallery=1` shows every def.
- Test: every `WORK_SPOTS` seat lies inside the lot footprint and ≥ 0.4 u from walls.

**Shots:** the gallery frame plus a contact sheet.

### TASK-304: Render wiring (engine)

**Modify:**
- src/render/props/settlement-props.ts:
  - lots loop at :97: push `INTERIOR_OF[def]` into the lot's group, so it floods as a unit;
  - emitters from `content/offices.ts EMITTERS` replace the hard-coded chimney at :118, and the emitter type gains `preset`;
  - theme decor: per lot, 1–2 items from `THEMES[theme].decor` beside the building, replacing laundry/barrel on themed lots;
  - plaza decor at :251 runs for every campus quad;
  - lantern posts along paths: drop the hearthholm/millbrook gate at :291 and add a per-theme density;
  - `landmarkVariant` applied at :143.
- src/render/props/batcher.ts:
  - `geometryFor` (:127) and the grouping (`groupKey` :411, bucket :570): when `lod === 1 && def.lod1`, key by `lod1.geo:lod1.variant` and build that geometry;
  - interiors are never clusterable and cast shadows only on high.
- src/render/world-view.ts (owner in M14): the chimney loop at :170 picks `PUFF_CHIMNEY` or a new `PUFF_VENT` by `preset`.
- src/content/weather.ts or wherever PUFF presets live: add `PUFF_VENT`.
- Tests: batcher.test.ts (themed shells at LOD1 collapse to ≤ 4 groups), settlement-props.test.ts (an interior is pushed per themed lot and lies in its group).

**Acceptance:**
- `hardPops = 0` on a W8-style dolly-in over a campus (interiors bloom or dither in).
- `selftest=regen` and `selftest=edit` geometry counts are back at baseline (only the known ±1 at village).
- Seed 42 `island:Hearthholm`: low calls ≤ 135. Overview at T0: calls ≤ baseline + 6.

### TASK-305: Screen emissive class (shader, S)

**Modify:**
- src/render/materials/factory.ts. In the vertex emissive block at :256: `emissive ≥ 1.5` means screen class. `vMarEmissive = (emissive − 2) * mix(NIGHT.screenDay, 1, uLamps.x)` with a slow scroll flicker. It is not subject to the late-night switch-off. Same program, no new define.
- src/content/lighting.ts: `NIGHT.screenDay` (≈ 0.35, below the bloom threshold by day) and the screen flicker; `POOLS.sources` for the new lamp defs (stone lantern, kiosk, ON-AIR lamp).
- src/render/post/grade-effect.ts or the night chunk, where the "spare by hue" rule lives: also spare cyan screen hues, so monitors are not graded to grey-blue at night (MEMORY: night grade spares by r − b).
- src/render/night/night.test.ts.

**Acceptance:**
- Clear-weather day frames of the existing dev set: 0 px diff where no screen class is present (identity rule).
- A night campus shot shows screens bloomed.
- Programs unchanged.

### TASK-306: Worker geometry + shader poses (life)

**Create:** src/life/geo/workers.ts (`buildWorker(): BufferGeometry`, accessories tagged mode 8, arms tagged 3 / 0 / 7, antenna mode 2, eye emissive 2).

**Modify:** src/life/life-material.ts (BODY at :34: the typing decode, mode 7, mode 8; update the header comment; no new attribute, DEFAULTS unchanged).

**Tests:** src/life/life.test.ts. Geometry attribute set = villager's plus `emissive`. The attribute count on the creature program is ≤ 16 when compiled (programs-dump `ATTRS=1`). Triangles ≤ 1000.

**Acceptance:**
- A gallery-like test frame (or `?gallery=1` if the life gallery exists) shows all 7 accessories.
- Villager, gull, sheep and cat pixels unchanged in the dev set (pose-decode identity for y ∈ [0, 1]).

### TASK-307: Workers kind (life, L)

**Create:**
- src/life/workers.ts (`class Workers extends LandKind`; states §3; `wave(i)`, `setLotsHidden()` stub, `positions()`);
- src/life/workers-world.ts (`planWorkers`, `seatsOf(world)` via `lotLocalToWorld` + `WORK_SPOTS`, outpost anchors);
- src/life/workers.test.ts.

**Modify:**
- src/life/index.ts (create after the land kinds at :140; add `kinds.workers`; include it in `landKinds`, recount and `setMotionScale`);
- src/content/life.ts (`LifePlan.workers` at :4/:24, `WORKERS` tunables, `LIFE_PLAN` villagers → 0);
- src/interact/interaction.ts (the click emote at :454 also for `hit.name === 'workers'`; agent pick sources at :242 are generic over kinds).

**Tests:**
- Determinism: same seed gives the same state after 600 steps.
- `simt = 2`: ≥ 40 % of workers seated.
- No two workers share a seat.
- Every seated worker is within 0.05 u of its seat.
- Outpost loop stays on land.
- Agent count ≤ `agentCap` per quality.
- Two workers' gait phases differ (bible global fail "same-type creatures in sync").

**Acceptance shots:** `cam=village:coding` at T2: ≥ 3 workers visible, ≥ 1 typing. T3 desk macro: typing arms differ between frames 0.2 s apart (`+Δt` frame).

### TASK-308: Theme labels and camera lookup (engine)

**Create:** src/ui/theme-icons.ts.

**Modify:**
- src/ui/hud.ts (:492 label markup, aria);
- src/ui/styles.ts (icon disc, chip, ≥ 600 px rule);
- src/ui/hud-math.ts + hud-math.test.ts (width-aware collision);
- src/content/islands-ui.ts (derive accents);
- src/camera/poses.ts (:29 `theme?`);
- src/camera/controls.ts (`findIsland` :485 matches theme id / displayName).

**Orchestrator merge:** world-view.ts:338 `theme: i.theme` (1 line; world-view.ts is owned by TASK-304).

**Acceptance:**
- Overview shots at 1920 × 1080 and 390 × 844 show 7 labels with icons and no overlap (the existing label test).
- `cam=island:qa` frames Palmlagoon.
- The edit panel still avoids the labels.

### TASK-309: Shots, logs, budgets (engine)

**Modify:**
- src/content/shots.ts: add `D-campus-<theme>` ×7 (dev), `D-desk` (T3 over a Coding desk, `cam=village:coding` + distance), `D-campus-night` (22:00); re-check every W preset's seed still shows its island (now guaranteed);
- `EDIT_LOGS` (:44): re-record the logs (the layout changed, so `propRemove` ids and placement spots moved);
- src/content/budgets.ts and src/core/quality.ts: the M14 raises from §6.

**Acceptance:** `pnpm shots ci|dev|edit --assert` green at low/medium/high, programs equal to baseline, contact sheet written.

### TASK-310: M14 QA (qa, no code)

- 10-seed sweep. Every island reads as its theme at T1.
- Workers are visible, nothing floats, no lot sits in water.
- Night: monitors and eyes glow, land L ≥ 12 %.
- Budgets. Report in mar-docs/qa/; commit mar-docs/shots/M14.jpg.

### TASK-311: Docs (docs)

- ART_BIBLE §4: theme column and per-theme props/creatures.
- ART_BIBLE §5: new building / decor rows.
- ART_BIBLE §7: worker anim rows (walk, type 9 Hz, sit, wave, ride).
- ART_BIBLE §11: add a W11 "Agent Campus" shot.
- ARCHITECTURE §10: Phase 3.
- DECISIONS: D-024 themes + roster, D-025 campus everywhere + hash re-pin, D-026 workers replace villagers + aGait.y pose encoding + aSeed accessory, D-027 shared LOD1 proxies + tier-2 interiors, D-028 budgets.
- MEMORY, task-index.

### TASK-321: Fine terrain LOD (shader, L)

**Decision D-029:** a render-only refinement. The world grid stays at 2 u. Changing `CELL_SIZE` to 1 u is rejected: 4× gen time and memory, a new edit codec, every hash and texture.

**Modify:**
- src/content/terrain.ts (`TERRAIN_LOD` :88 gains `fine: { qualities: ['high'], stride: 0.5, radius: 160, maxCached: 16, maxDev: 0.12, noiseAmp: 0.08, noiseZones: [grass, meadow, forest, rock] }`);
- src/render/terrain/terrain-mesh.ts (`buildChunkGeometry` :20): sub-stride path. Heights come from Catmull-Rom bicubic over the grid, clamped to bilinear ± maxDev. Micro-noise uses a seeded cell hash, only in `noiseZones`, and never on path / plaza / sand or within 1 cell of a lot pad. Pads are planar, so bicubic equals bilinear there and props stay exactly grounded.
- src/render/terrain/terrain.ts (3 LOD meshes per chunk; the fine one is built lazily within `radius` of the focus at T1–T3, ≤ 1 chunk per frame at idle, all synchronously in capture; LRU eviction disposes geometry; `rebuildChunk` (TASK-211 path) also remeshes a cached fine LOD);
- src/render/terrain/terrain.test.ts.

**Tests:**
- Max |fine − bilinear| ≤ maxDev on 3 seeds.
- Skirts on fine↔LOD0 edges leave no cracks (existing skirt test pattern).
- Same seed gives identical bytes.

**Acceptance:**
- High `cam=village`: triangles ≤ 2.4M, GPU memory within budget.
- `selftest=regen` leaks nothing (the cache is disposed).
- Low and medium frames 0 px diff.
- Edit rebuild over a fine chunk ≤ 1 frame in capture.

### TASK-322: Detail pass (props, L)

**Modify:**
- src/geo/trees.ts (round tree canopy: icosphere detail 2 at LOD0, 5–6 blobs; pine cone rings with a lip; palm frond segments 3 → 4);
- src/geo/buildings.ts (window frames with mullion cross, sill, shutters; roof ridge cap and eave trim; door step; flower box);
- src/geo/offices.ts, src/geo/interiors.ts (chair backs, cable trays, plants, mugs);
- src/geo/parts.ts (`windowAt` :139 gains `mullions` and `shutters` options with backwards-compatible defaults);
- src/geo/geo.test.ts (raised tri ceilings; LOD1 unchanged).

**Keep:** variant counts and the palette mapping (LOT_ROOFS mirror).

**Acceptance:**
- LOD1 triangles unchanged (T0/T1 budgets untouched).
- High village triangles within the new budget.
- No program change.

### TASK-331: Boat commute (life)

**Modify:**
- src/life/workers.ts (`RIDE`, the handoff);
- src/life/boats.ts (Sailboats expose read-only `stopEvents` per fixed step: boat index, dock index, step);
- src/life/workers.test.ts.

**Acceptance:**
- Over 600 s, ≥ 1 transfer between two islands on seeds 1/42/1001.
- Deterministic.
- A riding worker is within 0.1 u of its boat seat.
- `D-dock` shot shows a passenger.

### TASK-332: Creatures (life)

**Create:**
- src/life/critters.ts: ducks with a follow-chain, capybaras (bible row 29), butterflies (row 16), puffins. Exports `createCritterKinds(base, ctx, plan)`.
- src/content/life-critters.ts.

**Modify:** src/life/geo/creatures.ts.

**Merge:** the orchestrator wires `life/index.ts` (TASK-333).

**Acceptance:**
- Agents ≤ cap.
- The W7 sheep check still passes.
- No synced phases.

### TASK-333: Flood-aware desks + M16 hooks (engine)

**Modify:**
- src/render/props/prop-mirror.ts (expose `floodedLots` next to `floodedDocks`);
- src/render/world-view.ts (`life.setLotsHidden`);
- src/life/index.ts (wire 331/332, `setLotsHidden` passes through to workers).

This also closes part of the MEMORY open item "villagers walk onto flooded ground" for workers.

### TASK-341: Decor geometry (props)

**Create:** src/geo/decor-campus.ts, src/content/props-decor.ts (defs appended last in `PROP_DEFS` in content/props.ts, so existing def indices, scatter and edit logs stay stable).

**Modify:** src/geo/registry.ts, src/content/props.ts (spread the new list at the end), geo.test.ts.

### TASK-342: Placement (worldgen)

**Modify:**
- src/content/placement.ts (`PlacementRule.themes?`; flower-field rules: dense meadow patches via cluster noise, as ground cover; boulders; theme decor scatter);
- src/world/gen/scatter.ts (theme filter next to :157);
- src/world/gen/settlements.ts (campus fences along quads/lanes into `world.fences`; DevOps pipelines as `Polyline` kind 'pipe' from the hot spring to the data center; signpost fixtures at junctions);
- src/world/scatter.test.ts, src/world/world.test.ts (re-pin).

**Acceptance:** density ±10 %, no overlaps (OccupancyGrid), ground cover ≤ the new caps.

### TASK-343: Decor emission (engine)

**Modify:**
- src/render/props/settlement-props.ts (fence loop at :206 also emits `pipe` segments by `kind`; signpost fixtures);
- src/content/edit.ts (`EDIT_PROPS.placeable` gains bench v2, stone lantern, planter, signpost, flowerPatch);
- the edit-thumbs atlas size if needed (src/ui/edit-thumbs.ts).

**Acceptance:** `edit` set green; thumbnails render for the new defs.

### TASK-351: SSAO + MSAA fix (shader)

**Create:**
- src/render/post/seeded-noise.ts (64² RGBA8 `DataTexture` from `createRng(seed).fork('ssao-noise')`);
- src/content/post-fx.ts (SSAO numbers: radius, intensity, distance falloff, off at T0, high only).

**Modify:** src/render/post/composer.ts (`createPostChain` :53).
- Add `NormalPass` + `SSAOEffect` into the main `EffectPass` on high.
- **Replace `ssao.ssaoMaterial.noiseTexture` with the seeded texture and dispose pmndrs' `NoiseTexture`**, which uses `Math.random`.
- Stop multisampling the composer output buffer (`multisampling` only on the input render target).
- Prewarm still compiles against the composer target.

**Acceptance:**
- Two captures of the same URL are byte-identical (the determinism check would fail without the seeded noise).
- High programs ≤ 28, measured with programs-dump.
- High GPU memory ≤ 480 (expect a drop from the MSAA fix).
- Medium and low frames 0 px diff.
- AO visible at building bases and under eaves in `D-campus-*` high shots, with no halos at the horizon.

### TASK-352: Softer shadows (shader)

**Modify:**
- src/content/lighting.ts (`SHADOW` :68: `pcfMax` 3 → 5, per-tier penumbra target, `maxSize` per tier (T2/T3 tighter → smaller texels));
- src/render/shadows.ts (:200 radius from penumbra/texel per tier);
- src/render/props/contact-blobs.ts (opacity/radius tune);
- src/render/shadows.test.ts.

**Acceptance:**
- No acne or peter-panning in the W2 / village / dock shots.
- The shadow hue/L mask metric (bible §3) still passes.
- Penumbra about 0.3 u at T2.

### TASK-353: Water reflections (shader, L)

**Modify:**
- src/render/world-textures.ts: an `albedo` RGBA8 texture at grid resolution (385²): terrain colour from the same colour grid, with alpha = lit-window/lamp mask near lots. Rebuild through the existing `texSubImage2D` path.
- src/render/rebuild.ts: update albedo sub-rects; this path is already prewarmed.
- src/render/water/water.glsl.ts:
  - after the sky fresnel at :327, `if (uReflect > 0.0)`: march 6–8 steps along the reflected view ray in xz against `uHeightTex` (≤ 30 u). On a hit, mix the albedo × fresnel × shoreline fade. At night, alpha lamps add a warm shimmer streak.
  - sun glint highlight for W9.
- src/render/water/water.ts (`uReflect` per quality: high 1, medium 0, low 0);
- src/content/water.ts;
- water.test.ts (TS twin of the march for parity on a few rays).

**Acceptance:**
- `uReflect = 0` frames are 0 px diff (identity).
- Weather identity is kept.
- Programs unchanged (uniform branch).
- W9 shows a sun glint.
- W6 shows the lagoon still lighter than the outer ring.
- High-quality harbour shot shows a land reflection near the shore.

---

## 9. Parallel waves and file ownership

**Shared files:** `app.ts`, `package.json`, `life/index.ts` (M16) and `world-view.ts` (one-line hunks from other tasks) are merged by the orchestrator. No two agents in the same wave edit the same file.

| Wave | Tasks in parallel | Exclusive files |
|---|---|---|
| 0 | TASK-300 alone | world/types.ts, content/props.ts, content/themes.ts, content/offices.ts, world/lot-frame.ts, phase-3.md, the 1-line layout.ts default |
| 1 | **301** | content/islands.ts, world/gen/layout.ts, world/gen/hash.ts, layout/world/archipelago tests |
| 1 | **303** | geo/office-kit.ts, geo/offices.ts, geo/interiors.ts, geo/landmarks.ts, geo/registry.ts, content/props-buildings.ts, content/palette-offices.ts, geo.test.ts, props-buildings.test.ts |
| 1 | **304** | render/props/settlement-props.ts, render/props/batcher.ts, render/world-view.ts, PUFF preset file, their tests |
| 1 | **305** | render/materials/factory.ts, content/lighting.ts, grade/night chunk, render/night/*, night.test.ts |
| 1 | **306** | life/geo/workers.ts, life/life-material.ts, life.test.ts |
| 1 | **308** | ui/hud.ts, ui/theme-icons.ts, ui/styles.ts, ui/hud-math.ts(+test), content/islands-ui.ts, camera/poses.ts, camera/controls.ts |
| 2 | **302** (after 301) | world/gen/settlements.ts, content/settlements.ts, settlements.test.ts, world.test.ts pins |
| 2 | **307** (after 306's API; can start in wave 1 against a stub `buildWorker`) | life/workers.ts, life/workers-world.ts, life/index.ts, content/life.ts, interact/interaction.ts, workers.test.ts |
| 3 | 309, then 310, then 311 | content/shots.ts, content/budgets.ts, core/quality.ts / qa reports / docs |
| M15 | **321** ∥ **322** | terrain/* + content/terrain.ts ∥ geo/trees.ts, geo/buildings.ts, geo/parts.ts, geo/offices.ts, geo/interiors.ts |
| M16 | **331** ∥ **332**, then 333 | life/workers.ts, life/boats.ts ∥ life/critters.ts, life/geo/creatures.ts, content/life-critters.ts; 333 owns prop-mirror.ts, world-view.ts, life/index.ts |
| M17 | **341** ∥ **342**, then 343 | geo/decor-campus.ts, content/props-decor.ts, registry, content/props.ts (append) ∥ content/placement.ts, gen/scatter.ts, gen/settlements.ts, scatter/world tests; 343 owns settlement-props.ts, content/edit.ts, ui/edit-thumbs.ts |
| M18 | **351** ∥ **352** ∥ **353** | post/composer.ts, post/seeded-noise.ts, content/post-fx.ts ∥ shadows.ts, content/lighting.ts, contact-blobs.ts ∥ water/*, world-textures.ts, rebuild.ts, content/water.ts |

**Notes on safe ordering:**
- M15 and M17 can overlap M16, since no files are shared. M18 can start right after M14.
- 304 lands before 303 safely: unknown defs give `push` → −1.
- 307 can land before 302: legacy `WORK_SPOTS` on cottages.
- Hash re-pins are serialised: 301, then 302, then 342.

---

## 10. Risks and gotchas (from MEMORY.md and found in the code)

1. **Attribute limit 16 / creature program at 15.** Workers must not add attributes. Use the `aGait.y` pose encoding and the `aSeed` integer accessory. A 17th attribute fails to link under SwiftShader.
2. **Program key splits.** These each split a program: `instanceColor` present vs absent, a missing `normal`, `transparent`, Mesh vs InstancedMesh. Every new geometry goes through `geo/kit` `put()` and `TriBuilder`, and is verified with programs-dump `MESHES=1`. High has 0 program headroom until D-028.
3. **`compileAsync` compiles hidden meshes.** SSAO's NormalPass override material counts as a program even when disabled at T0.
4. **SSAO noise uses `Math.random`** (pmndrs `getNoise`). Replace it or pixel determinism breaks.
5. **Night grade "spare by hue (r − b)".** Cyan monitors would be greyed at night. Extend the spare rule (TASK-305) or use warm screen tints.
6. **Weather / clear identity rule.** Every new shader term (screen class, reflections, SSAO off-tiers) is gated by `if (uX > 0.)` with 0 px diff when off.
7. **Bloom blends ADD.** Day screen glow must stay under the threshold (`screenDay` ≈ 0.35).
8. **Hard pops.** New tier-2 interior / decor defs must bloom in or dither. The first `setTier` is instant.
9. **Regen leaks.** `InstancedMesh.dispose()` does not free geometry, so dispose worker and fine-terrain geometries yourself. Keep old materials alive until the new `compileAsync` finishes. Leak self-tests draw everything once before counting; ±1 at `cam=village` is pre-existing.
10. **buildings.ts palette ↔ LOT_ROOFS mirror.** Change both together; the variant count must equal LOT_ROOFS length.
11. **Zones are stale on terraces** (generated before settlements). Campus pads on Emberpeak slopes will show stale rock/forest zones under pads unless `planCampus` writes zones for pads. Do not recompute zones globally, which would change every hash.
12. **Angle conventions.** rotY (cos, sin) vs camera azimuth (sin, cos); use `azimuthToward`. The yaw used for lot geometry is `atan2(cos, sin)`. Use `world/lot-frame.ts` everywhere so desks and seats agree.
13. **EDIT_LOGS replay on seed 1001.** Prop ids and spots move with the layout and campus changes, so re-record them (TASK-309) or the `edit` set fails.
14. **Lighthouse beam follows the first lighthouse.** The broadcast variant must keep the lamp-room height and position.
15. **Foam-trail texture is 3 u per texel.** Never splat small worker-boat wakes into it.
16. **Gen-time budgets.** Campus A* on 7 islands. Use `perfLimit` and re-run `pnpm vitest run src/world` alone before calling a regression. Capture runs gen synchronously.
17. **Parallel agents share one tree.**
    - Never `git stash`, never `git add -A src`.
    - Each agent uses `pnpm shots --tag=<task> --port=<unique>` and checks that its port is free.
    - Use a unique scratchpad sub-directory.
    - Worktree agents must `git fetch && git reset --hard <orchestrator-branch>` and check `git log -1`.
18. **Second WebGL context** (edit thumbnails for new placeables) waits on main-context frames. Keep it idle-time and cached.
19. **First `texSubImage2D` stall.** The albedo texture updates through the already-prewarmed rebuild path.
20. **Portrait overview.** 7 islands always means a wider fit (≈ 1.3–2.2k u on 9:16, which may fog pale; existing debt). Label collision must handle wider pills at 390 × 844.
21. **Lonely Palm W9.** Keep the hut and telescope out of the hero view line, or W9 loses its silhouette.
22. **Flooded ground open item.** Workers inherit the build-time walk graph. TASK-333 hides flooded lots; paths over flooded ground remain a known gap.


---

# M14b: Theme-first redesign, smooth terrain, cross-tier consistency (replacement plan)

I read HEAD 5b5161e, the M14 commits (a4cc6c3 … 5b5161e), D-028, the MEMORY handoff and your ladder image, plus the current code. No files were changed.

## 0. Diagnosis: why M14 reads as "insufficient" (from the code, not just the picture)

1. **Themes were bolted on after the archetype planners.**
   - `buildSettlements` (src/world/gen/settlements.ts:2066) still dispatches `switch (isl.archetype)` (:2096) into `planMillbrook` (:1326), `planEmberpeak` (:1396) and the rest.
   - `planCampus` (:935) is then added on top, and `defSwap` re-labels old lots.
   - So the farm logic decides the island: windmills on knolls, a barn site, fences around fields.
2. **Farm leftovers live in four other places.**
   - Profile: `Tag.field` patchwork plus knolls and pond (profiles.ts:244–375).
   - Patchwork colours: `fieldColor` (world/index.ts:137) and terrain-colors.ts:258.
   - Scatter rules gated by archetype (placement.ts: cropRow :168 → `['millbrook','hearthholm']`, haybale :181; the filter is at scatter.ts:157).
   - Sheep and crab weights by archetype (land-world.ts:482, :605).
3. **Buildings change colour and silhouette across tiers.**
   - Themed shells share one neutral `officeLod1` proxy at LOD1 (D-027; batcher.ts:133 `lod1 ? def.lod1 : …`). Blue roofs only appear at LOD0.
   - Shells are tier 1, so at T0 the campus does not exist at all, while windmills (tier 0) do.
4. **Terrain cannot gain detail.**
   - Terrain is non-indexed 2 u facets with per-face colour jitter baked into vertex colours (terrain-mesh.ts, terrain-colors.ts `faceColor` :351).
   - The LOD flips globally on tier (`onTier` terrain.ts:130: T0 → 4 u, else 2 u). That is a pop at 380 u and no gain below 2 u.
5. **Housekeeping gaps.**
   - D-024 … D-027 were never written into DECISIONS.md; they exist only in phase-3.md.
   - The M14 rows in task-index.md are still PENDING.

## 1. Principles (new decisions)

- **D-029 Theme-first.** The archetype supplies only the shape: heightfield profile, coast, shelf and anchors (volcano, atoll, stack, plateau, dome, sandbar, crescent). The theme owns:
  - ground palette per zone;
  - zone-rule overrides;
  - landmarks placed on archetype anchors;
  - districts, structures, scatter and decor;
  - creature weights.

  No archetype-specific prop or colour survives unless the theme lists it.
- **D-030 Terrain is smooth and material-based; props stay stylized.**
  - Terrain gets smooth analytic normals from a Catmull-Rom (C1, interpolating) surface over the 2 u heightfield.
  - Per-zone procedural ground materials: code-built `DataArrayTexture` detail layers, mean-preserving, fading out with distance.
  - Mesh density rises near the focus (4 → 2 → 1 → 0.5 u, by distance, with geomorphing).
  - The world grid stays at 2 u: no change to gen, edit codec or hashes for terrain.
  - Props, buildings, trees and bots stay faceted toy (ART_BIBLE P1 gets a terrain exception).
- **D-031 Cross-tier consistency is a hard requirement.**
  - Every large element (structure ≥ 3 u, landmark, tree mass, district ground) exists from T0 with its final colour and silhouette (proxy or LOD1 built from LOD0 colours).
  - Detail only adds zero-mean variation. Nothing large appears with a tier.
  - Enforced by the zoom-ladder metric (§6).
- **D-032 Amends D-027.** The shared neutral `officeLod1` proxy is retired.
  - Every structure gets its own LOD1 with LOD0 colours, at tier 0, with one variant at LOD1 (variants differ only in LOD0 detail).
  - Draw calls are paid for by merging far terrain chunks per island and merging the tree-blob groups (MEMORY open item, about 18 calls).
- **D-033 Budgets.** No raise beyond D-028 for calls or programs. Programs stay **9/17/24**: the terrain material is replaced in place (still one program per quality), and structures use the lit program (turbine blades reuse the windmill `aSpin` branch). Triangle and memory deltas are in §7.

## 2. Per-island art direction

The archetype shape is kept for all seven islands. Ground hexes are base albedo; detail layers add zero-mean variation only. All accents come from `THEMES`.

### 2.1 HQ / Orchestrator on Hearthholm (harbour crescent)

| Aspect | Direction |
|---|---|
| Ground palette | grass "civic lawn" `#8FCB62`; meadow flowering lawn `#A9D86E` (coral/white speckle layer); forest park grove `#5E9E4A`; sand dry `#F3DDB0` / wet `#DDB884`; rock `#A3A7B2`; path sandstone pavers `#D9C7A4` (paver layer); plaza terracotta/cream paving `#D8B894` (tile layer); field → lawn |
| Signature landmark | **Orchestrator Tower** (clocktower variant 2, kept). Plaza-centred, 13 u, coral crown, beacon ring spinning (`aSpin`), glowing at night. The single dominant vertical. |
| Districts | Central Quad (plaza + tower + 2 coffee kiosks); Harbour Row (hqOffice lots along the harbour lane); Meeting Garden (meetingPavilion + flower beds); Ferry Terminal (stilt hut → `ferryOffice`, pier, moorings); hqAnnex crown on the highest lot |
| Theme scatter | avenue round trees lining lanes (new `avenue` rule: trees at 6 u spacing, offset 3.5 u from lanes); harbour palms (kept); flower beds; benches; lantern posts; coral/cream banners (bunting recoloured) |
| Removed / replaced | cottages, tower house, laundry lines, market stalls (→ kiosks), house-side barrels/crates (a few stay on the pier), chimney smoke (→ none; kiosk steam only) |

### 2.2 Coding on Millbrook (flat plateau)

| Aspect | Direction |
|---|---|
| Ground palette | grass "tech lawn" `#7CC85A` with mow stripes (±4 % L, 3 u, aligned to the district grid); meadow clover `#96D06A`; **field → solar gravel `#B9B4A8`** (pebble layer); forest tidy grove `#5DAE4B`; path light concrete `#D6D3CB`; plaza blue-grey pavers `#C9CED6` (grid layer); pond → reflecting pool |
| Signature landmark | **Wind turbines** (new `windTurbine` def, tier 0) on the profile knolls: white tapered tower, 3 slim blades with blue tips, heights 15 / 12 / 10 u (P2: one dominant), spinning with wind through the `aSpin` branch. Replaces windmills. |
| Districts | Tech Park (devOffice rows facing a central lawn quad + reflecting pool); **Solar Farm** (the profile patch rectangles become `solar` districts: gravel plus `solarRow` props on a lattice, the cropRow `fieldRows` code reused); Server Yard (serverShed cluster + cable-trench path); Hack Garden (outdoor desks: WORK_SPOTS 'type') |
| Theme scatter | round trees in rows, clipped hedge boxes (new `hedge`), bike racks, low solar fences around plots |
| Removed / replaced | patchwork hues (`fieldColor` = 0 on themed islands), cropRow, haybale, barn, windmills, farm fences, farm cottages, sheep (moved to Design) |

### 2.3 DevOps on Emberpeak (volcano)

| Aspect | Direction |
|---|---|
| Ground palette | black sand `#5B5566` (kept); lower-slope grass → dry scrub `#8FA05A`; rock → basalt `#4F4C57` (crack layer; night ember glints within crater radius only); forest → dark pine floor `#3F6B45`; path steel grating / dark gravel `#6E6A72`; plaza concrete pad `#9A979E` with yellow safety-line layer; crater glow kept |
| Signature landmark | The volcano cone plus a **Geothermal Plant**: 2 cooling towers (hyperboloid lathe, 8 u, steam emitters) at the hot-spring anchor. The hot spring becomes the cooling pool. The cone stays dominant. |
| Districts | Terraced Data Center (stepped pads on the lee slope, dataCenter rows); Rack Yard on the black-sand beach (rackShed); Antenna Ridge (antennaMast ×2–3 on rim shoulders, blinking emissive); Pipeline (polyline `pipe` from cooling plant to data center) |
| Theme scatter | sparse dark pines low only, basalt boulders, small steam vents (puffs), cable spools, warning signs |
| Removed / replaced | upper-slope forest, open "spa" look (spring → cooling pool; capybaras stay in M16 as a cute easter egg) |

### 2.4 Marketing on Beacon Rock (sea stack)

| Aspect | Direction |
|---|---|
| Ground palette | top meadow "brand lawn" `#9BD66A` with magenta/coral speckle; rock/cliff warm strata `#D9B48F` / `#C29A74`; path → red-painted stair decking `#C9675E`; plaza stage deck `#E9D3B3` |
| Signature landmark | **Broadcast Tower** (lighthouse variant 2, kept: bands + dish + antenna, beam kept). Plus 2 billboards on ledges, facing the archipelago centre, 4–6 u boards on posts, visible from T0, always below the tower. |
| Districts | Studio Ledge (broadcastStudio + billboard); Landing (dock + megaphone kiosk); Clifftop Stage (small quad with banner poles) |
| Theme scatter | flower clumps, accent banner poles, striped "ad buoys" (buoy recolour) |
| Removed / replaced | keeper hut cottage, rope fence (→ accent railing) |

### 2.5 QA / Audit on Palmlagoon (atoll)

| Aspect | Direction |
|---|---|
| Ground palette | sand dry pale coral `#F6E7C4`; grass seagrass lawn `#A8D670`; path white gravel / boardwalk `#E7E2D5`; plaza lab paving `#E4EFEA` with green grid layer |
| Signature landmark | **Inspection Tower** (existing def promoted to landmark kind: stilted watchtower with magnifier lamp, 12 u, tier 0) on the ring opposite the channel. The sunken ship stays as "the bug wreck", ringed by red/white inspection buoys. |
| Districts | The Loop (testLabs spaced along the ring path); Checkpoints (barrier gates every ~25 u on the ring path = test stages); Sandbox (lagoon with marker buoys); Stilt Lab (testLabStilt; the MEMORY open item on unreachable stilt seats is fixed here with a deck walk-graph spur) |
| Theme scatter | palms (density ×0.6), checklist boards, traffic cones, buoys |
| Removed / replaced | hammock / beach-hut leftovers; tide pools kept (nature) |

### 2.6 Design / Art on Mossgrove (forest dome)

| Aspect | Direction |
|---|---|
| Ground palette | grass wildflower meadow `#8FCF6A` (multi-colour flower speckle layer: pink/yellow/lilac/white); forest moss `#4E8E4A` (leaf-litter layer); path confetti gravel `#E8D6B8`; plaza mosaic tiles `#E6D3C0` (mosaic layer) |
| Signature landmark | **Atelier Tree** (giantTree variant 2): painted treehouse, blossom clusters `#FF8FB1` in the canopy (part of the LOD1 and blob colours), bunting. Dominant vertical kept (W10). |
| Districts | Atelier Glade (atelier + galleryPavilion around a mosaic quad); Sculpture Garden clearing (3–5 u abstract sculptures in primary colours: torus, stacked spheres, arch; tier 0 so they read from far); Easel Walk along the stream; Mushroom Grove (giant mushrooms kept as palette) |
| Theme scatter | blossom round-tree variant, pines, dense flowers, easels, paint-pot planters; sheep moved here (meadow) |
| Removed / replaced | log cabin |

### 2.7 Research on Lonely Palm (sandbar)

| Aspect | Direction |
|---|---|
| Ground palette | sand `#F7E1AE` / wet `#E3BE84` (kept); ripple layer |
| Signature landmark | palm (kept, W9), plus researchHut with observatory dome (white `#F4F2EC`, teal slit) and a weather mast with anemometer (`aSpin`); telescope fixture |
| Districts | single outpost + dock |
| Theme scatter | instrument buoys, starfish, message bottle (kept) |
| Removed / replaced | nothing |

**Ground materials** (global ids, content/ground.ts): `lawn`, `grass`, `meadow`, `forest`, `sand`, `blackSand`, `rock`, `gravel`, `path`, `paving`.
- Each theme maps zone → `{material, base hex, layer params}` (mow stripes, speckle colours, tile pattern).
- The palette texture is 16 zones × 8 islands, so painted zones in edit mode recolour through the same table.

## 3. Terrain redesign (smooth, detail with proximity, far = averaged colour)

**Surface.**
- `shared/terrain-sample.ts` (new, pure): Catmull-Rom bicubic over the 2 u grid, clamped to the 4 central samples' min/max (no overshoot at cliffs), with its analytic gradient.
- It interpolates the samples exactly and is exact on planar pads, so buildings stay grounded.
- Render-side grounding (settlement-props `push` y, batcher matrices) uses the smooth twin where |smooth − bilinear| > 0.02 u. World data, hashes and picking keep bilinear `heightAt`.

**Mesh.**
- Indexed chunk grids. Attributes: position, oct-free normal (from the analytic gradient), `ao`, `aMorph` (fixed `layout(location)` per D-016; no vertex colours).
- LOD strides by camera distance per chunk, not by tier:

| Stride | Distance band | Qualities |
|---|---|---|
| 4 u | ≥ 300 u | all |
| 2 u | 120–300 u | all |
| 1 u | 40–120 u | medium / high |
| 0.5 u | < 40 u, ≤ 9 chunks | high only |

- Bands come from content and have ±10 % hysteresis.
- Geomorph: odd vertices blend toward the coarse-edge interpolation over the band's last 20 %, so silhouettes never pop.
- The 4 u ring is merged into **one mesh per island** (about 7 calls instead of 40–50 chunk calls in far views). That pays for structures at T0.

**Material** (terrain-material.ts, still one program per quality).
- Base colour comes from a new **albedo world texture**: RGBA8, 385², linear filtering. It is built on the CPU from theme palette × zone × smooth height-band ramp × crest tint × strata (smooth versions of terrain-colors.ts) × low-frequency macro noise (8–32 u, seeded). It is identical at every distance.
- Near the camera the shader does the following:
  - (a) 4-tap zone lookup with noise-perturbed bilinear weights → crisp, organic material borders;
  - (b) up to 2 material evaluations;
  - (c) detail layers from a `DataArrayTexture` (10 layers × 256², RGBA = albedo delta, detail normal xy, cover mask). It is built in code with a fixed seed, tileable, with CPU-built box-filter mips so it is deterministic and mean-preserving. Low quality skips the define.
  - (d) amplitude × (1 − smoothstep(fadeNear, fadeFar, dist)), and the mip average of each layer is 0. Far pixels therefore equal the albedo exactly.
- Kept: wet-sand lap, caustics, crater glow, lantern pools, mist, brush ring, debug mask.
- `marPoolFacet` (D14) switches to smooth normals.
- The albedo texture is also what M18 water reflections need (TASK-353 shrinks).

**Edits.** `rebuildChunk` remeshes only the cached LOD levels of dirty chunks. `world-textures.update` also refreshes albedo sub-rects (same `texSubImage2D` path, already prewarmed).

## 4. What happens to M14 work

| M14 item | Status |
|---|---|
| 301 roster (7 themes always), `IslandData.theme`, `THEME_BY_ARCHETYPE`, hashLayout | **Kept** |
| 306/307 worker bots, modes 7/8, Workers kind, seats, outpost loop | **Kept**. 379 adds WORK_SPOTS for new structures (solar tech 'inspect', turbine base 'look', easel 'paint') |
| 308 labels, icons, camera theme lookup | **Kept** |
| 305 screen emissive class, night cool-hue spare, lamp pools | **Kept** |
| 303 office shells + interiors (geo/offices.ts, geo/interiors.ts) | **Kept geometry**. **Changed** LOD1: per-def, coloured, tier 0 (TASK-378) |
| 303 `officeLod1` shared proxy + batcher `lod1` grouping (D-027) | **Removed from use** (code path may stay, unused) |
| 303 orchestrator tower / broadcast lighthouse variants | **Kept** |
| 304 settlement-props wiring, interiors, emitters/vents | **Kept**. **Changed**: `LANDMARK_DEF` (settlement-props.ts:19) moves to content (`LANDMARK_RENDER`) so themes add kinds without editing render code |
| 302 `layLanes` (:763), `planCampus` (:935), `tryLot` (:368), dock/stilt primitives | **Kept as primitives** (moved to world/gen/sites.ts) |
| 302 `defSwap`, the archetype `switch` (:2096), `planMillbrook` farm logic | **Removed** (replaced by per-theme planners) |
| `THEMES` single file (content/themes.ts) | **Changed**: split per theme, schema extended |
| 309 campus shot presets, `--quality` override | **Kept**; presets re-pinned. **D-028** budgets kept as the ceiling |
| Old M15 TASK-321 (faceted fine LOD) | **Removed**, superseded by 371 |
| Old M17 341/342 | **Trimmed** to cross-theme nature decor; theme decor moves into M14b |
| Old M18 353 | **Reduced**: reuses the albedo texture from 372 |

## 5. Tasks: M14b, theme-first redesign + smooth terrain + consistency

| ID | Task | Agent | Complexity | Status | Dependencies |
|----|------|-------|-----------|--------|-------------|
| TASK-360 | M14b contract: per-theme content split + schema, ground tables, `LANDMARK_RENDER`, per-theme prop/geo modules, districts type, terrain vertex/texture contract, ladder preset type | engine (orchestrator) | M | PENDING | M14 |
| TASK-361 | Settlement refactor: `sites.ts` primitives + per-theme planner dispatch + theme-gated zones/scatter/patchwork, hash-identical | worldgen | L | PENDING | TASK-360 |
| TASK-362 | HQ island plan + content | worldgen | M | PENDING | TASK-361 |
| TASK-363 | Coding island plan + content (turbines on knolls, solar districts, tech park) | worldgen | M | PENDING | TASK-361 |
| TASK-364 | DevOps island plan + content (terraces, rack yard, plant, pipeline) | worldgen | M | PENDING | TASK-361 |
| TASK-365 | Marketing island plan + content (studio ledge, billboards, stage) | worldgen | S | PENDING | TASK-361 |
| TASK-366 | QA island plan + content (loop labs, checkpoints, inspection tower, stilt deck spur) | worldgen | M | PENDING | TASK-361 |
| TASK-367 | Design island plan + content (atelier glade, sculpture garden, easel walk) | worldgen | M | PENDING | TASK-361 |
| TASK-368 | Research outpost plan + content | worldgen | S | PENDING | TASK-361 |
| TASK-371 | Smooth terrain mesh: CR surface, distance LOD 4/2/1/0.5 u + geomorph, per-island far merge, rebuild path | shader | L | PENDING | TASK-360 |
| TASK-372 | Ground materials: albedo + palette textures, detail `DataArrayTexture`, material shader, smooth colour grid | shader | L | PENDING | TASK-360 |
| TASK-373 | Prop cross-tier consistency: structures from T0, blob colours from theme trees, blob group merge, smooth-twin grounding | engine | M | PENDING | TASK-360 |
| TASK-374 | Zoom-ladder harness: `ladder` set, `cam=ladder:`, metrics + boundary pairs, `--assert` | engine | M | PENDING | TASK-360 |
| TASK-375 | Structures I: HQ, Marketing, Research (ferryOffice, banners, billboard v2, stage, weather mast, observatory) | props | M | PENDING | TASK-360 |
| TASK-376 | Structures II: Coding, DevOps (windTurbine, solarRow, hedge, cooling tower, pipe, cable spool, vent, rack yard) | props | M | PENDING | TASK-360 |
| TASK-377 | Structures III: QA, Design (barrier gate, cones, checklist board, inspection buoy, sculptures, easel, blossom tree, atelier tree v2) | props | M | PENDING | TASK-360 |
| TASK-378 | Faithful LOD1 for office shells + landmarks (LOD0 colours, 1 LOD1 variant, tier 0) | props | M | PENDING | TASK-360 |
| TASK-379 | Life by theme: sheep/crab/cat weights, WORK_SPOTS for new structures, stilt-lab deck reachability | life | S | PENDING | TASK-360 |
| TASK-380 | Integration: shot presets / W-shots re-themed, EDIT_LOGS re-record, budgets check | engine | S | PENDING | TASK-361…379 |
| TASK-381 | M14b QA: ladder ×7 islands × 3 qualities, 10-seed sweep, contact + ladder sheets | qa | M | PENDING | TASK-380 |
| TASK-382 | Docs: ART_BIBLE, DECISIONS backfill D-024…D-027 + D-029…D-033, ARCHITECTURE §3/§4/§10, MEMORY, task-index (mark M14 COMPLETED) | docs | S | PENDING | TASK-381 |

### TASK-360: Contract (orchestrator commits it before wave B)

**Create:**
- `src/content/themes/index.ts`, which re-exports `THEMES` and `THEME_BY_ARCHETYPE`.
- `src/content/themes/{hq,coding,marketing,qa,design,devops,research}.ts`, with current data moved verbatim. The `ThemeDef` schema (from content/themes.ts:13) is extended with:
  - `ground: Partial<Record<ZoneId, GroundSpec>>`;
  - `zoneRules?: Partial<ZoneRuleParams>`;
  - `patchwork: 'off' | 'districts'`;
  - `landmarks: Record<anchorKey, {kind, variant}>`;
  - `scatter: PlacementRule[]` (with `themes` implied);
  - `scatterOff: string[]` (global rules disabled on this island);
  - `life: {sheep, crabs, cats}`;
  - `treePalette` (canopy hexes for scatter and blobs).
- `src/content/ground.ts`: `GroundMaterial` ids, `GroundSpec {material, base, layer params}`, `DETAIL_LAYERS` params.
- `src/content/props-themes/{hq,…}.ts` (PropDefs, empty arrays). `content/props.ts` appends them after `PROP_DEFS_BUILDINGS`, in fixed theme order.
- `src/geo/themes/index.ts` + 7 modules (empty `PropGeoDef[]`). `geo/registry.ts` concatenates them.
- `src/content/landmark-render.ts` (`LANDMARK_RENDER`, moved from settlement-props.ts:19).
- `src/shared/terrain-sample.ts` (signatures plus a reference implementation and test).
- `src/world/gen/plans/{index,types}.ts` + 7 stubs.

**Modify:**
- `src/content/themes.ts` becomes a shim re-export.
- `src/world/types.ts`: `DistrictData {islandId, kind: 'solar'|'quad'|'yard'|'garden'|…, x, z, rotY, w, d}`, `WorldData.districts`.
- `src/render/props/settlement-props.ts`: read `LANDMARK_RENDER`.
- `src/content/shots.ts`: `ShotSet` gains `'ladder'`; `ShotPreset.ladder?: {island: string, dists: number[], pitch: number, pairs: number[]}`.
- `mar-tasks/phases/phase-3.md`: M14b section.

**Contract notes:**
- Terrain vertex attributes are `position`, `normal`, `ao`, `aMorph`, with no `color`.
- The terrain material reads `textures.albedo`, `textures.palette` and `textures.zone`.

**Acceptance:** all hashes identical, dev frames 0 px diff, programs 9/17/24.

### TASK-361: Settlement refactor (worldgen, L; must be hash-identical)

**Create:**
- `world/gen/sites.ts`: move `tryLot` (:368), `findDock`, `dockWithLink`, `placeStiltHut` (:1195), `layLanes` (:763), `planCampus` (:935, as `campusQuad` + `campusLots`), `ring`, `bestSample`, `linkLot` (:698), `linkLandmark`, buoys, tide pools, stair corridor.
- `world/gen/plans/<theme>.ts`: each initially calls the old archetype planner + `planCampus`, i.e. the current behaviour.

**Modify:**
- `world/gen/settlements.ts`: the switch at :2096 becomes `THEME_PLANNERS[isl.theme]`; `defSwap` stays only inside the stubs.
- `world/gen/zones.ts:138`: rules = `{...ARCHETYPES[a].zones, ...THEMES[theme].zoneRules}`.
- `world/gen/scatter.ts:157`: skip rules listed in `scatterOff`, append `THEMES[theme].scatter`.
- `world/index.ts:137`: `fieldColor` = 0 when `patchwork === 'off'`; patch rectangles go to `world.districts` when `'districts'`.
- `src/life/land-world.ts:482/:605`: weights from `THEMES[theme].life` with archetype fallback.

All defaults reproduce today's output.

**Acceptance:**
- `world.test.ts` hashes unchanged (seeds 1, 42, 1001), settlement tests green, gen time unchanged ±10 %.
- The 7 plan files are the only places island-specific logic lives (grep test: no `archetype ===` in settlements.ts).

### TASK-362 … TASK-368: Island plans (worldgen; run in parallel, one agent may take 2)

Each task owns exactly `world/gen/plans/<theme>.ts` and `content/themes/<theme>.ts`. It implements the §2 table for its island: districts, landmarks on anchors, lot mix, ground table, zoneRules, scatter / scatterOff, life weights. It re-pins its own hash expectations only through a per-theme snapshot. The global `world.test.ts` pins are re-done once in TASK-380.

Common acceptance for each island, on 30 seeds:
- (a) Landmark present at T0.
- (b) Lot minimums met (≥ 90 % of seeds): HQ ≥ 8, Coding ≥ 6, DevOps ≥ 4, QA ≥ 4, Design ≥ 4, Marketing ≥ 2, Research = 1.
- (c) Leftover audit test: zero instances of removed defs on the island, e.g. Coding: windmill, cropRow, haybale, barn, cottage, fence. `fieldColor` = 0 except on Coding solar districts.
- (d) All lots and structures connected.
- (e) Island ladder passes (TASK-374 metric) once 371 / 372 / 373 / 378 have landed.
- (f) `D-campus-<theme>` shot reviewed against the §2 table.

Island-specific acceptance:
- **363 Coding:** turbines take the knoll anchors (profiles.ts:370), heights 15 / 12 / 10 u; solar rows on ≥ 60 % of district cells; the pond becomes a reflecting pool with a quad edge.
- **364 DevOps:** ≥ 3 terrace pads with step ≤ `FLATTEN.maxStep`; pipeline polyline reaches the data center; cooling-tower steam emitters.
- **366 QA:** ≥ 3 checkpoint gates on the ring path; the stilt lab gets a deck spur in the walk graph (with 379).
- **367 Design:** sculpture clearing ≥ 12 u wide with ≥ 3 sculptures; ≥ 3 easels by the stream.

### TASK-371: Smooth terrain mesh (shader, L)

**Modify:**
- `render/terrain/terrain-mesh.ts`: rewrite `buildChunkGeometry` (:20) as an indexed grid at a given stride with skirts, `aMorph` and analytic normals.
- `render/terrain/terrain.ts`: `onTier` (:130) no longer picks the LOD; a new `update(camera)` picks per-chunk strides with hysteresis. Builds are ≤ 2 per frame interactively and synchronous in capture. Per-island merged 4 u mesh; LRU for 0.5 u; `rebuildChunk` covers cached levels; chunks stay 1-instance InstancedMesh for the shared depth program (D-016).
- `render/rebuild.ts`: dirty → cached levels + island merge refresh.
- `content/terrain.ts`: `TERRAIN_LOD` (:88) gains strides, bands, hysteresis, morph fraction, merge rule, quality caps.
- `shared/terrain-sample.ts`: finalise.
- `render/terrain/terrain.test.ts`.

**Tests:**
- Mesh vertices = CR samples.
- Morph endpoints match the coarse level.
- No cracks across stride borders.
- Same URL gives byte-identical output.

**Acceptance:**
- Boundary pairs at every stride band pass the §6 pair metric.
- `selftest=regen` / `selftest=edit` at baseline.
- Calls at overview ≤ D-028 minus 25.
- High village triangles ≤ 1.6M; terrain geometry memory ≤ 25 MB on high.
- Gen + build within `newSeedMs`.

### TASK-372: Ground materials (shader, L)

**Create:** `render/terrain/ground-detail.ts`. It builds the app-scope `DataArrayTexture` (10 layers × 256², CPU mips, fixed-seed periodic noise; layers for blades, mow, speckle, litter, ripples, cracks, pebbles, packed earth, tiles, mosaic) and the matching zero-mean verifier.

**Modify:**
- `render/terrain/terrain-material.ts`: `createTerrainMaterial` (:42) drops `vertexColors`; the `color_fragment` patch at :139 now does albedo + 4-tap noisy zone → material + detail + distance fade, keeping laps / caustics / crater / pools / mist / brush / mask. Defines are per quality only: low = no detail.
- `render/terrain/terrain-colors.ts`: `buildColorGrid` (:135) becomes `buildAlbedoGrid` (theme palette, smooth ramps, no `faceColor` jitter; strata kept as smooth bands). `faceColor` is retired.
- `render/world-textures.ts`: `albedo` RGBA8 and `palette` 16 × 8 RGBA8; `update` writes albedo sub-rects; interface at :203.
- `content/ground.ts`: layer tuning only. Theme hexes live in the theme files.
- Tests: `terrain-colors.test.ts`, a new `ground-detail.test.ts` (|mean of every layer's top mip − 0.5| ≤ 1/255; byte-identical on rebuild).

**Acceptance:**
- Fragment samplers ≤ 10.
- Programs 9/17/24.
- Ladder metric passes on the HQ and Coding islands.
- Night land L ≥ 12 %.
- W4 cliff vs sky ΔL ≥ 0.1 with smooth rock (strata + crack normals).
- `debug=mask` frames unchanged.
- Clear-weather identity rules hold.

### TASK-373: Prop consistency (engine)

**Modify:**
- `render/props/batcher.ts`: the `lod1` grouping at :133 is no longer used by shells. Structures with `tier 0` get LOD1 from T0. Tree-blob groups merge across islands per variant (MEMORY open item). Matrices are grounded with the smooth twin where needed.
- `render/props/clusters.ts`: blob colours from `THEMES[theme].treePalette` (the same hexes scatter trees use).
- `render/props/settlement-props.ts`: `districts` emission (solar rows on a lattice: reuse the fence/lattice loop), pipes from `world.fences` polylines of kind `pipe`.
- Tests: `batcher.test.ts`, `clusters.test.ts`.

**Acceptance:**
- `hardPops = 0` on dolly-ins.
- Every structure ≥ 3 u is drawn at 600 u (test against the batcher's tier tables).
- Blob mean colour within ΔE ≤ 4 of the area-weighted canopy colour of the trees it stands for.
- Calls ≤ D-028.

### TASK-374: Zoom-ladder harness (engine)

**Create:**
- `scripts/ladder-metrics.ts` (pure): crop-and-scale, box downsample to 48 × 27 in linear RGB, CIE Lab, ΔE2000, connected components.
- `scripts/ladder-metrics.test.ts`: synthetic identical images → 0; a shifted hue patch is flagged; an inserted blob is flagged.

**Modify:**
- `scripts/shots.ts`: `ladder` set captures N frames + mask frames per preset. It writes `ladder-<id>.jpg` (strip) and a metrics JSON, fails on `--assert`, and works with `--only` (:37).
- `src/camera/controls.ts`: `cam=ladder:<island>:<dist>`, a fixed-pitch / fixed-azimuth pose aimed at the island hero target, numbers from `content/camera.ts`.
- `src/content/shots.ts`: 7 `L-<theme>` presets on seed 1001 + `L-pairs-<theme>`; clear weather, 14:00, `freeze`.

### TASK-375 / 376 / 377: Theme structures (props; parallel)

Each owns its `geo/themes/<t>.ts` and `content/props-themes/<t>.ts`.

**Acceptance:**
- Every def builds at LOD0 and LOD1.
- LOD1 is built from the same palette and silhouette and stays ≤ 30 % of LOD0 triangles.
- LOD0 triangle ceilings: structures ≤ 3.5k, turbine ≤ 1.5k.
- Same attribute set as `cottage` (programs-dump `MESHES=1`).
- Spinning parts use `aSpin` (windmill branch).
- Visible in `?gallery=1`.

### TASK-378: Faithful LOD1 (props)

**Modify:**
- `geo/offices.ts`: every shell's `lod === 1` path emits a coloured block (roof colour, wall colour, window band) from the LOD0 palette. `officeLod1` (:1485) is left in place but unused.
- `geo/landmarks.ts`: LOD1 of clocktower v2, lighthouse v2, giantTree v2 matches the LOD0 colours.
- `content/props-buildings.ts`: shells `tier 0`, no `lod1`.
- Tests: `geo.test.ts` (per-def LOD0 vs LOD1 area-weighted top-view mean colour ΔE ≤ 3).

### TASK-379: Life by theme (life)

**Modify:**
- `content/life.ts`: weights by theme; sheep to Design meadows, 0 on Coding.
- `content/offices.ts`: WORK_SPOTS for new structures.
- `life/workers-world.ts`: deck spur for `testLabStilt` seats.
- `life/workers.test.ts`.

**Acceptance:** ≥ 1 seated worker inside the stilt lab on 3 seeds; agents within caps 25/60/110.

### TASK-380: Integration (engine)

**Modify:**
- `content/shots.ts`:
  - W5 → "Forge & Steam" (DevOps), W6 → QA lagoon, W7 → **"Turbine Morning"** (Coding: blade angle changes between frames, solar rows, mist band), W10 kept (Design);
  - campus presets re-pinned;
  - `EDIT_LOGS` re-recorded (def indices and spots move).
- `world.test.ts` pins.
- `content/budgets.ts` only if measured above D-028, with a decision note.

### TASK-381: QA (qa)

- Ladder ×7 islands × 3 qualities.
- dev/edit/wow `--assert`.
- 10-seed sweep with leftover audits.
- Report in `mar-docs/qa/m14b-*.md`; sheets `mar-docs/shots/M14b.jpg` and `M14b-ladder.jpg`.

### TASK-382: Docs (docs)

**ART_BIBLE:**
- §1: P1 terrain exception (smooth, material-based); props stay faceted.
- §2: per-theme ground palettes (§2 tables above).
- §4: roster rewritten as theme × archetype-shape.
- §5: new structures.
- §6: the consistency rule plus the ladder metric.
- §11: W5 / W6 / W7 rewritten.

**DECISIONS:** backfill D-024 … D-027; add D-029 … D-033.

**ARCHITECTURE:** §3 terrain and materials, §4 distance LOD, §9 ladder set, §10 Phase 3.

**MEMORY, task-index:** mark M14 COMPLETED, add M14b.

## 6. Consistency metric (TASK-374)

**Ladder.**
- Fixed pitch 48°, fixed azimuth from the island frame, target = island hero target.
- Distances: 700, 480, 340, 240, 170, 120, 85, 60, 42, 30, 21 u (ratio about 0.7).
- Settings: `freeze=1`, clear weather, 14:00, same `simt`.
- Each frame is captured together with its `debug=mask` frame.

**Per step k → k+1.**
1. Crop the centre of frame k by r = D[k+1]/D[k]. Keep pitch and azimuth fixed so the step is a near-pure zoom.
2. Box-downsample both frames to 48 × 27 in linear RGB, then convert to Lab.
3. Compare only cells that are ≥ 80 % land in both masks. Cloud and water pixels are excluded by the mask; at least 25 % of cells must be land.

**Pass criteria:**

| Check | Threshold |
|---|---|
| Ladder step, mean ΔE2000 | ≤ 5.0 |
| Ladder step, p95 ΔE | ≤ 12 |
| "No new large element": largest 8-connected component of cells with ΔE > 15 | ≤ 1.5 % of compared cells |
| Island drift: land mean Lab of every frame vs the ladder median | ΔE ≤ 4 |
| Boundary pairs at 1.06 b and 0.94 b, for b ∈ {380, 250, 140, 45, 300, 120, 40}: mean ΔE | ≤ 2.5 |
| Boundary pairs: largest component | ≤ 0.5 % |
| Silhouette proxy: per-pair land/structure mask IoU of the cropped masks | ≥ 0.92 |

**Calibration.** Run on current main first. It must fail on Coding (the patchwork and appearing-buildings defects in your ladder.jpg) and pass on synthetic identity input. Thresholds are recorded in D-031.

## 7. Budget and program impact

| Item | Impact |
|---|---|
| Programs | **9/17/24, unchanged.** The terrain material is replaced in place, one program per quality (low = no detail define). Structures use the lit program; turbines use the existing spin branch. Workers are unchanged. The ladder adds no programs. |
| Draw calls | Saved: far terrain merge (−25…−40 at T0/T1, ×2 with shadows on medium) and blob merge (−12). Spent: T0 structures (about +20 LOD1 defs, single variant). Target ≤ D-028 (170 / 255 / 350), asserted. |
| Triangles (terrain) | high ≈ 0.45M (0.5 u near), medium ≈ 0.25M, low ≈ 0.1M. Within 350k / 800k / 1.6M. |
| GPU memory | Indexed terrain is smaller than the old non-indexed meshes. Albedo +0.6 MB. Detail array +4.7 MB (medium/high only). Low stays ≤ 70; medium / high stay within 170 / 480. The M18 MSAA output-buffer fix later frees ~95 MB on high. |
| CPU | CR evaluation for 1 u levels ≈ 250k samples; build ≤ 2 chunks per frame. `newSeedMs` stays within budget (headless factor). |

## 8. Revised M15–M18

| ID | Task | Agent | Complexity | Status | Dependencies |
|----|------|-------|-----------|--------|-------------|
| TASK-322 | Prop detail pass (rounder trees, mullions, eaves, steps, interior props); LOD1 colours untouched (378 test must keep passing) | props | L | PENDING | M14b |
| TASK-323 | M15 QA: ladder + triangle/memory step | qa | S | PENDING | TASK-322 |
| TASK-331 | Boat commute | life | M | PENDING | M14b |
| TASK-332 | Creatures by theme: ducks (Coding pool), capybaras (DevOps cooling pool), butterflies + sheep (Design), puffins (Marketing) | life | M | PENDING | M14b |
| TASK-333 | Flood-aware lots, life/index hooks | engine | S | PENDING | TASK-331, TASK-332 |
| TASK-341 | Cross-theme nature decor geometry (flowerPatch, boulders, signpost, picnic table); theme decor already in M14b | props | S | PENDING | M14b |
| TASK-342 | Placement: flower fields via theme `scatter`, boulders, signposts at junctions | worldgen | S | PENDING | TASK-341 (ids) |
| TASK-343 | Emission + EDIT_PROPS placeables + thumbnails | engine | S | PENDING | TASK-341, TASK-342 |
| TASK-351 | SSAO (high, seeded noise replacing pmndrs `NoiseTexture`, which uses `Math.random`), composer outputBuffer MSAA fix; programs high ≤ 28 (needs D-033 amendment) | shader | M | PENDING | M14b |
| TASK-352 | Softer shadows; recheck normal bias on smooth terrain | shader | S | PENDING | M14b |
| TASK-353 | Water reflections: heightfield march + **albedo texture from 372**, sun glint, lamp shimmer | shader | M (was L) | PENDING | TASK-372 |
| TASK-354 / 355 | Exit QA (ladder included), docs | qa / docs | M / S | PENDING | TASK-351…353 |

TASK-321 (faceted fine LOD) is removed.

## 9. Parallel waves and exclusive file ownership

The orchestrator merges `app.ts`, `package.json`, `world.test.ts` pins (TASK-380) and `content/budgets.ts`.

| Wave | Task | Owns exclusively |
|---|---|---|
| A | 360 | content/themes/** (creates), content/ground.ts, content/props-themes/**, geo/themes/**, geo/registry.ts, content/props.ts, content/landmark-render.ts, render/props/settlement-props.ts (one hunk), world/types.ts, world/gen/plans/** stubs, shared/terrain-sample.ts, content/shots.ts (type) |
| A2 | 361 | world/gen/settlements.ts, world/gen/sites.ts, world/gen/zones.ts, world/gen/scatter.ts, world/index.ts, life/land-world.ts, settlements/scatter tests |
| B | 362–368 | each `world/gen/plans/<t>.ts` + `content/themes/<t>.ts` |
| B | 371 | render/terrain/terrain-mesh.ts, render/terrain/terrain.ts, render/rebuild.ts, content/terrain.ts, shared/terrain-sample.ts, terrain.test.ts |
| B | 372 | render/terrain/terrain-material.ts, render/terrain/terrain-colors.ts(+test), render/terrain/ground-detail.ts(+test), render/world-textures.ts(+test), content/ground.ts |
| B | 373 | render/props/batcher.ts, render/props/clusters.ts, render/props/settlement-props.ts, their tests |
| B | 374 | scripts/shots.ts, scripts/ladder-metrics.ts(+test), camera/controls.ts, content/camera.ts, content/shots.ts |
| B | 375 / 376 / 377 | geo/themes/{hq,marketing,research} / {coding,devops} / {qa,design}.ts + matching content/props-themes files |
| B | 378 | geo/offices.ts, geo/landmarks.ts, content/props-buildings.ts, geo.test.ts |
| B | 379 | content/life.ts, content/offices.ts, life/workers-world.ts, life/workers.test.ts |
| C | 380 → 381 → 382 | integration, then QA, then docs |

**Safe-ordering notes:**
- Unknown def ids render as nothing (`push` returns −1), so the island plans (B) and the structure tasks (B) can land in either order.
- Ladder pass criteria are only enforced from TASK-381. Each wave-B task reports its island's ladder numbers.

## 10. Risks and gotchas

1. **Smooth shading on a 2 u grid makes cliffs blobby** (Beacon Rock stack, crater rim). Mitigations: clamped CR, rock crack/strata detail normals, W4 ΔL acceptance. Fallback: keep facet normals on `cliff` only (a material flag).
2. **Hash churn.** 361 must be identity; island plans then change everything once. W-seeds, campus presets and `EDIT_LOGS` are re-pinned only in 380.
3. **The ladder metric must not over-trigger.** Clouds are hidden below T1 (tiers.ts `clouds`) and must be masked out. Tilt-shift and DOF bands are avoided by the centre crop. Workers and boats are too small at 48 × 27, but use `freeze`.
4. **Determinism.** Code-built detail textures need CPU mips (do not rely on `generateMipmap` differences). The pmndrs SSAO noise is `Math.random` (M18). LOD choice depends only on the camera; capture builds every needed chunk synchronously before `ready`.
5. **16-attribute / program-key rules.** Terrain gains `aMorph` and drops `color`. Use a fixed `layout(location)` (D-016) and verify the shared depth program still matches (programs-dump `ATTRS=1`). Structures must carry the same attributes as cottage.
6. **SwiftShader capture time** (R1): limit to ≤ 2 material evaluations and ≤ 3 array samples per fragment. The ladder set runs only at milestones and with `--only` per island.
7. **Grounding.** Bilinear world y vs the CR render surface. Render-side smooth-twin grounding; test max deviation at prop origins ≤ 0.08 u.
8. **Lantern pools / night grade / mask metrics assumed facets** (D14, "spare by hue"). Re-validate W3 and the mask frames.
9. **Edits.** Paint swatches recolour through the palette. Rebuild must refresh albedo and cached LODs. Zones stay stale on terraces (D-020 addendum), now more visible with material borders; plan tasks write pad zones explicitly.
10. **P2 one dominant vertical.** Turbine heights 15 / 12 / 10; billboards below the broadcast tower; inspection tower is the QA landmark.
11. **Draw-call trade relies on the terrain merge landing.** If 371 slips, 373's T0 structures would breach D-028. Gate 373's tier-0 switch behind a content flag until 371 merges.
12. **Process.** Parallel agents in one tree: unique `--tag` / `--port`, never `git stash` or `git add -A src`. Worktree agents must `fetch` + `reset --hard` to the orchestrator branch.
13. **Docs debt.** D-024 … D-027 must be written (TASK-382); otherwise later ADRs reference missing records.


## M14c: Living close-up (user request 2026-10-05: "yaklaştığında yaşayan bir sistem gibi görünmeli")

Approach rule: detail *and activity* rise with proximity. At T0/T1 the campus reads by colour and
silhouette (D-031); at T2/T3 it reads as a working organisation: bots moving with purpose, machines
running, screens alive. Everything deterministic (seeded, sim-step driven), within agent caps and
programs 9/17/24.

| ID | Task | Agent | Complexity | Status | Dependencies |
|----|------|-------|-----------|--------|-------------|
| TASK-383 | Living close-up I — activity sim: near-focus ambient workers (pool within agentCap, spawned/retired by camera focus at T2/T3, deterministic by cell hash), purposeful trips (desk → coffee kiosk queue → meeting pavilion → server rack → dock), carried items (laptop / clipboard / crate / paint pot as mode-8 accessory slots), pairs chatting (face + talk bob), per-theme micro-activities (Design painters at easels, QA inspectors walking checkpoints with clipboards, DevOps techs at racks / pipeline, Marketing camera crew on stage, Research reading instruments), workers on ferries | life | L | PENDING | TASK-379 |
| TASK-384 | Living close-up II — animated surfaces: monitor content (scrolling code lines / charts / design canvases per theme, procedural in the screen-class shader branch), server LED blink patterns, billboard slideshow, data pulses along pipes and cable trenches, turbine yaw to wind + solar trackers, lit-window occupancy flicker, drone couriers between islands (instanced, packet glow) | shader + props | L | PENDING | TASK-372, TASK-376 |

Acceptance (both):
- T3 campus shots (`D-campus-<theme>` close variants, new `L-live-<theme>` presets): in a 0.5 s
  `deltaT` pair, ≥ 3 % of the campus-crop pixels change and ≥ 5 distinct moving clusters are visible;
  same URL → byte-identical.
- At simt = 2 on every themed island at T2: ≥ 6 visible bots on HQ/Coding, ≥ 3 elsewhere, ≥ 2 in
  transit, ≥ 1 carrying an item.
- No program increase; agents ≤ 25/60/110; CPU sim ≤ 0.5 ms/frame at high (headless measured).
- Ladder metric (D-031) unaffected: activity elements are < 1 u and below the 48 × 27 cell scale.
