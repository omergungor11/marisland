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

