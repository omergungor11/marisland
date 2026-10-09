# Marisland - Task Index

Status flow: PENDING → IN_PROGRESS → REVIEW → COMPLETED (BLOCKED if deps unmet). Details in `phases/phase-N.md`.

## Phase 0: Tooling & harness

| ID | Task | Agent | Complexity | Status | Dependencies |
|----|------|-------|-----------|--------|-------------|
| TASK-001 | Scaffold: Vite, TS, pnpm, ESLint (random ban), Prettier, Vitest, `VITE_BASE` | devops | S | COMPLETED | – |
| TASK-002 | `core/`: clock, loop, scope, params, rng, noise, events, quality | engine | M | COMPLETED | TASK-001 |
| TASK-003 | WebGLBackend, loader, test scene, `__marisland` ready/error | engine | M | COMPLETED | TASK-002 |
| TASK-004 | `shots` harness: sets, manifest, contact sheet, fail checks | qa | M | COMPLETED | TASK-003 |
| TASK-005 | `ci.yml` + `deploy.yml` | devops | S | COMPLETED | TASK-001, TASK-004 |
| TASK-006 | Stats overlay, `debug=` views | engine | S | COMPLETED | TASK-003 |
| TASK-007 | Verify D-001 in container (smoke test); write VISUAL_QA.md; refresh tech-stack/conventions | docs | S | COMPLETED | TASK-003 |

## Phase 1: Living diorama

### M1 — One island
*Overview + shore read as an island*

| ID | Task | Agent | Complexity | Status | Dependencies |
|----|------|-------|-----------|--------|-------------|
| TASK-101 | Single-island heightfield, shelf, zones, SDF, hashes | worldgen | M | COMPLETED | TASK-002 |
| TASK-102 | Terrain mesher: facets, jitter, AO, LOD, skirts | shader | M | COMPLETED | TASK-101, TASK-003 |
| TASK-103 | Water: swell, depth ramp/alpha, SDF foam, glints | shader | L | COMPLETED | TASK-101 |
| TASK-104 | Material factory, sky, fog, lights, fitted shadows, post | shader | M | COMPLETED | TASK-102 |
| TASK-105 | Camera wrapper, presets, pitch curve, bounds | engine | S | COMPLETED | TASK-003 |

### M2 — Archipelago
*3 seeds × 5–7 distinct islands*

| ID | Task | Agent | Complexity | Status | Dependencies |
|----|------|-------|-----------|--------|-------------|
| TASK-111 | Layout, roster rules, names, channels | worldgen | M | COMPLETED | TASK-101 |
| TASK-112 | Archetype profiles, cliffs, black sand | worldgen | L | COMPLETED | TASK-111 |
| TASK-113 | New-seed regen, cloud-curtain, labels, pinned W-seeds | engine | M | COMPLETED | TASK-111, TASK-102 |

### M3 — Vegetation
*Forests, palms, sway*

| ID | Task | Agent | Complexity | Status | Dependencies |
|----|------|-------|-----------|--------|-------------|
| TASK-121 | `geo/` builders for the bible vegetation | props | M | COMPLETED | TASK-003 |
| TASK-122 | PropDefs, rules, Poisson, OccupancyGrid | worldgen | M | COMPLETED | TASK-112 |
| TASK-123 | PropBatcher, ground cover, blobs, cluster proxies | engine | M | COMPLETED | TASK-121, TASK-122 |
| TASK-124 | Wind, bloom-in, dither, depth parity | shader | M | COMPLETED | TASK-123 |

### M4 — Settlements
*Village, dock, landmarks*

| ID | Task | Agent | Complexity | Status | Dependencies |
|----|------|-------|-----------|--------|-------------|
| TASK-131 | Sites, lots, paths, docks, landmark anchors | worldgen | L | COMPLETED | TASK-122 |
| TASK-132 | Buildings, landmarks, micro props, emissive masks | props | L | COMPLETED | TASK-121 |
| TASK-133 | Boat routes | worldgen | S | COMPLETED | TASK-131 |

### M5 — Zoom detail
*5-step zoom ladder*

| ID | Task | Agent | Complexity | Status | Dependencies |
|----|------|-------|-----------|--------|-------------|
| TASK-141 | Tier FSM, fades, LOD swap, pop queue | engine | M | COMPLETED | TASK-124 |
| TASK-142 | `budgets.ts` + `--assert` | qa | S | COMPLETED | TASK-141 |

### M6 — Sea & sky life
*Boats, gulls, clouds*

| ID | Task | Agent | Complexity | Status | Dependencies |
|----|------|-------|-----------|--------|-------------|
| TASK-151 | Agent framework, boats, foam trail | life | M | COMPLETED | TASK-133, TASK-141 |
| TASK-152 | Gulls, fish, ambient scheduler | life | M | COMPLETED | TASK-151 |
| TASK-153 | Clouds + aligned shadows, smoke, steam | shader | M | COMPLETED | TASK-104 |

### M7 — Land life & interaction
*Villagers, reaction frame*

| ID | Task | Agent | Complexity | Status | Dependencies |
|----|------|-------|-----------|--------|-------------|
| TASK-161 | Villagers, cats, sheep, crabs | life | M | COMPLETED | TASK-151, TASK-131 |
| TASK-162 | Picking, hover, reactions, reduced motion | life | M | COMPLETED | TASK-161 |

### M8 — Day/night & weather
*Time ladder × weather*

| ID | Task | Agent | Complexity | Status | Dependencies |
|----|------|-------|-----------|--------|-------------|
| TASK-171 | EnvState, sky bodies, night emissives, beam | shader | M | COMPLETED | TASK-104, TASK-132 |
| TASK-172 | Weather FSM, rain, ripples, mist | shader | M | COMPLETED | TASK-171 |

### M9 — Camera/HUD/photo
*HUD, mobile, photo*

| ID | Task | Agent | Complexity | Status | Dependencies |
|----|------|-------|-----------|--------|-------------|
| TASK-181 | Intro, fly-to, orbit, touch, compass | engine | M | COMPLETED | TASK-105, TASK-113 |
| TASK-182 | HUD dock, time dial, photo mode + PNG export | engine | M | COMPLETED | TASK-181 |

### M10 — Hardening
*W1–W10*

| ID | Task | Agent | Complexity | Status | Dependencies |
|----|------|-------|-----------|--------|-------------|
| TASK-191 | Governor, prewarm, context-loss regen, `perf=1` | engine | M | COMPLETED | all Phase 1 |
| TASK-192 | 10-seed sweep; user checks M1 60 fps / phone 30 fps | qa | M | REVIEW | TASK-191 |
| TASK-193 | README, MEMORY gotchas | docs | S | COMPLETED | TASK-192 |

## Phase 2: Sandbox

Details and the shared contract in `phases/phase-2.md` (`src/world/edit-types.ts`).

### M11 — Edit core
*Commands, inverse, replay, codec, incremental derived data*

| ID | Task | Agent | Complexity | Status | Dependencies |
|----|------|-------|-----------|--------|-------------|
| TASK-201 | Edit commands, inverse, replay, log codec | worldgen | L | COMPLETED | Phase 1 |
| TASK-202 | Incremental derived data (zones, local EDT, chunk flags) | worldgen | M | COMPLETED | TASK-201 |

### M12 — Live rebuild
*Dirty chunks in one frame, brush cursor, ghosts*

| ID | Task | Agent | Complexity | Status | Dependencies |
|----|------|-------|-----------|--------|-------------|
| TASK-211 | Dirty-chunk rebuild: remesh, texSubImage2D, batcher rewrite, `?edit=`, `api.edit` | engine | L | COMPLETED | TASK-201 (contract) |
| TASK-212 | EditSession, stroke sampler, brush cursor, ghost previews | engine | M | COMPLETED | TASK-211, TASK-162 |

### M13 — Editor UI & QA
*Panel, persistence, share, QA*

| ID | Task | Agent | Complexity | Status | Dependencies |
|----|------|-------|-----------|--------|-------------|
| TASK-221 | Edit panel + HUD integration, `edit` shot set, docs | engine | M | COMPLETED | TASK-212 |
| TASK-222 | Phase 2 QA: edit sweep, regression baseline | qa | S | COMPLETED | TASK-221 |


## Phase 3: Agent Islands

Details in `phases/phase-3.md`.

### M14 — Agent Islands
*7 themed campuses with working bots: a visibly themed, populated archipelago*

| ID | Task | Agent | Complexity | Status | Dependencies |
|----|------|-------|-----------|--------|-------------|
| TASK-300 | Phase 3 contract: ThemeId / IslandData.theme / LotKind / LotData.role / SettlementData.theme, `content/themes.ts`, `content/offices.ts`, `world/lot-frame.ts`, PropDef `lod1`/`interior`, `phases/phase-3.md` | engine (orchestrator) | S | COMPLETED | Phase 2 |
| TASK-301 | Roster guarantees 7 themes; theme on IslandData; hashLayout; re-pin | worldgen | M | COMPLETED | TASK-300 |
| TASK-302 | Campus planner on every island (layLanes refactor, planCampus, defSwap, Research outpost) | worldgen | L | COMPLETED | TASK-301 |
| TASK-303 | Themed shells, officeInterior, LOD1 proxies, landmark variants (orchestrator tower, broadcast lighthouse), glyph signs | props | L | COMPLETED | TASK-300 |
| TASK-304 | Render wiring: settlement-props campus decor, interiors, emitters (vents), batcher shared LOD1 groups | engine | M | COMPLETED | TASK-300 |
| TASK-305 | Screen emissive class (day-on monitors/eyes), night-grade hue spare, lantern pools for new lamps | shader | S | COMPLETED | TASK-300 |
| TASK-306 | Worker bot geometry + creature-shader typing pose (mode 7) and accessory mode 8 | life | M | COMPLETED | TASK-300 |
| TASK-307 | Workers kind: walk / desk-work / wave / outpost loop, spawn plan, picking + click emote | life | L | COMPLETED | TASK-300, TASK-306 (API) |
| TASK-308 | Theme labels + icons, camera theme lookup, CameraWorld.theme | engine | M | COMPLETED | TASK-300 |
| TASK-309 | Shot presets (campus ×7, desk macro, night campus), EDIT_LOGS re-record, M14 budget raise | engine | S | COMPLETED | TASK-301…308 |
| TASK-310 | M14 QA: 10-seed sweep, contact sheet M14.jpg, budgets --assert ×3 qualities | qa | S | SUPERSEDED | TASK-309 |
| TASK-311 | Docs: ART_BIBLE §4/§5/§7 theme rows, ARCHITECTURE Phase 3, D-024…D-028, MEMORY, task-index | docs | S | SUPERSEDED | TASK-310 |

### M14b — Theme-first redesign
*Theme-owned islands, smooth material terrain, cross-tier consistency (D-029…D-033)*

| ID | Task | Agent | Complexity | Status | Dependencies |
|----|------|-------|-----------|--------|-------------|
| TASK-360 | M14b contract: per-theme content split + schema, ground tables, `LANDMARK_RENDER`, per-theme prop/geo modules, districts type, terrain vertex/texture contract, ladder preset type | engine (orchestrator) | M | COMPLETED | M14 |
| TASK-361 | Settlement refactor: `sites.ts` primitives + per-theme planner dispatch + theme-gated zones/scatter/patchwork, hash-identical | worldgen | L | COMPLETED | TASK-360 |
| TASK-362 | HQ island plan + content | worldgen | M | COMPLETED | TASK-361 |
| TASK-363 | Coding island plan + content (turbines on knolls, solar districts, tech park) | worldgen | M | COMPLETED | TASK-361 |
| TASK-364 | DevOps island plan + content (terraces, rack yard, plant, pipeline) | worldgen | M | COMPLETED | TASK-361 |
| TASK-365 | Marketing island plan + content (studio ledge, billboards, stage) | worldgen | S | COMPLETED | TASK-361 |
| TASK-366 | QA island plan + content (loop labs, checkpoints, inspection tower, stilt deck spur) | worldgen | M | COMPLETED | TASK-361 |
| TASK-367 | Design island plan + content (atelier glade, sculpture garden, easel walk) | worldgen | M | COMPLETED | TASK-361 |
| TASK-368 | Research outpost plan + content | worldgen | S | COMPLETED | TASK-361 |
| TASK-371 | Smooth terrain mesh: CR surface, distance LOD 4/2/1/0.5 u + geomorph, per-island far merge, rebuild path | shader | L | COMPLETED | TASK-360 |
| TASK-372 | Ground materials: albedo + palette textures, detail `DataArrayTexture`, material shader, smooth colour grid | shader | L | COMPLETED | TASK-360 |
| TASK-373 | Prop cross-tier consistency: structures from T0, blob colours from theme trees, blob group merge, smooth-twin grounding | engine | M | COMPLETED | TASK-360 |
| TASK-374 | Zoom-ladder harness: `ladder` set, `cam=ladder:`, metrics + boundary pairs, `--assert` | engine | M | COMPLETED | TASK-360 |
| TASK-375 | Structures I: HQ, Marketing, Research (ferryOffice, banners, billboard v2, stage, weather mast, observatory) | props | M | COMPLETED | TASK-360 |
| TASK-376 | Structures II: Coding, DevOps (windTurbine, solarRow, hedge, cooling tower, pipe, cable spool, vent, rack yard) | props | M | COMPLETED | TASK-360 |
| TASK-377 | Structures III: QA, Design (barrier gate, cones, checklist board, inspection buoy, sculptures, easel, blossom tree, atelier tree v2) | props | M | COMPLETED | TASK-360 |
| TASK-378 | Faithful LOD1 for office shells + landmarks (LOD0 colours, 1 LOD1 variant, tier 0) | props | M | COMPLETED | TASK-360 |
| TASK-379 | Life by theme: sheep/crab/cat weights, WORK_SPOTS for new structures, stilt-lab deck reachability | life | S | COMPLETED | TASK-360 |
| TASK-380 | Integration: shot presets / W-shots re-themed, EDIT_LOGS re-record, budgets check | engine | S | COMPLETED | TASK-361…379 |
| TASK-381 | M14b QA: ladder ×7 islands × 3 qualities, 10-seed sweep, contact + ladder sheets | qa | M | PENDING | TASK-380 |
| TASK-382 | Docs: ART_BIBLE, DECISIONS backfill D-024…D-027 + D-029…D-033, ARCHITECTURE §3/§4/§10, MEMORY, task-index (mark M14 COMPLETED) | docs | S | COMPLETED | TASK-381 |

### M14c — Living close-up
*Activity rises with proximity*

| ID | Task | Agent | Complexity | Status | Dependencies |
|----|------|-------|-----------|--------|-------------|
| TASK-383 | Living close-up I — activity sim: near-focus ambient workers (pool within agentCap, spawned/retired by camera focus at T2/T3, deterministic by cell hash), purposeful trips (desk → coffee kiosk queue → meeting pavilion → server rack → dock), carried items (laptop / clipboard / crate / paint pot as mode-8 accessory slots), pairs chatting (face + talk bob), per-theme micro-activities (Design painters at easels, QA inspectors walking checkpoints with clipboards, DevOps techs at racks / pipeline, Marketing camera crew on stage, Research reading instruments), workers on ferries | life | L | COMPLETED | TASK-379 |
| TASK-384 | Living close-up II — animated surfaces: monitor content (scrolling code lines / charts / design canvases per theme, procedural in the screen-class shader branch), server LED blink patterns, billboard slideshow, data pulses along pipes and cable trenches, turbine yaw to wind + solar trackers, lit-window occupancy flicker, drone couriers between islands (instanced, packet glow) | shader + props | L | COMPLETED | TASK-372, TASK-376 |

### M15 — Graphics I: terrain & building detail
*High tier: finer terrain, rounder trees, detailed buildings*

| ID | Task | Agent | Complexity | Status | Dependencies |
|----|------|-------|-----------|--------|-------------|
| TASK-321 | Fine terrain LOD (1 u facets, bicubic-clamped + zone-masked micro-noise) near focus on high | shader | L | SUPERSEDED | M14 |
| TASK-322 | Detail pass: rounder trees, window frames/mullions, roof ridges/eaves, steps, interior props | props | L | PENDING | TASK-303 |
| TASK-323 | M15 QA + triangle/memory budget step | qa | S | PENDING | TASK-321, TASK-322 |

### M16 — Living campus
*Commuting bots, more creatures, flood-aware desks*

| ID | Task | Agent | Complexity | Status | Dependencies |
|----|------|-------|-----------|--------|-------------|
| TASK-331 | Boat commute (dock → sailboat → dock handoff), passengers wave | life | M | PENDING | TASK-307 |
| TASK-332 | Creatures: ducks (Coding pond), capybaras (DevOps spring), butterflies (Design), puffins (Marketing); mine 71b2077 (D-023) | life | M | PENDING | M14 |
| TASK-333 | Flood-aware lots: prop-mirror `floodedLots` → `life.setLotsHidden` (workers skip flooded desks); `life/index.ts` hooks for 331/332 | engine | S | PENDING | TASK-331, TASK-332 |

### M17 — Graphics II: decor & nature
*Flower fields, fences, lanterns, benches, signs, rocks*

| ID | Task | Agent | Complexity | Status | Dependencies |
|----|------|-------|-----------|--------|-------------|
| TASK-341 | Decor geometry: flowerPatch, picket fence, stone lantern, bench v2, signpost (glyph), boulders, planter, picnic table, solar panel row, pipe segment | props | M | PENDING | M14 |
| TASK-342 | Placement: flower fields, boulders, theme-gated scatter (`themes`), campus fences, signpost anchors, DevOps pipelines | worldgen | M | PENDING | M14 |
| TASK-343 | Settlement-props emission for fences / pipes / signs; EDIT_PROPS placeables + thumbnails | engine | S | PENDING | TASK-341, TASK-342 |

### M18 — Graphics III: light & post
*AO, softer shadows, water reflections*

| ID | Task | Agent | Complexity | Status | Dependencies |
|----|------|-------|-----------|--------|-------------|
| TASK-351 | SSAO (high) with seeded noise, composer outputBuffer MSAA fix, program audit | shader | M | PENDING | M14 |
| TASK-352 | Softer shadows: per-tier penumbra/PCF radius, tighter T2/T3 fit, contact-blob tune | shader | S | PENDING | M14 |
| TASK-353 | Water reflections: heightfield ray-march land reflection + albedo texture (high), sun glint (W9 debt), lit-window shimmer at night | shader | L | PENDING | M14 |
| TASK-354 | Phase 3 exit QA: wow + dev sets ×3 qualities, budget decision D-028 final, user real-GPU check | qa | M | PENDING | TASK-351…353 |
| TASK-355 | Docs: DECISIONS D-029…D-031, ARCHITECTURE §3/§8, MEMORY gotchas, README | docs | S | PENDING | TASK-354 |
