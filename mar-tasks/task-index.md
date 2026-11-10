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
| TASK-381 | M14b QA: ladder ×7 islands × 3 qualities, 10-seed sweep, contact + ladder sheets | qa | M | COMPLETED | TASK-380 |
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
| TASK-332 | Creatures: ducks (Coding pond), capybaras (DevOps spring), butterflies (Design), puffins (Marketing); mine 71b2077 (D-023) | life | M | IN_PROGRESS (ducks + butterflies done 995e942; capybaras, puffins next) | M14 |
| TASK-333 | Flood-aware lots: prop-mirror `floodedLots` → `life.setLotsHidden` (workers skip flooded desks); `life/index.ts` hooks for 331/332 | engine | S | PENDING | TASK-331, TASK-332 |
| TASK-335 | Sky craft: hot-air balloons + airship (drones pattern) | props | M | COMPLETED | M14 |

### M17b — Concept Archipelago (first-glance wow)
*Bluff coasts, earth walls, postcard camera, hero landmarks, viaducts, waterfalls — 0 new programs, 0 new agents. Preset: W11 "Concept".*

| ID | Task | Agent | Complexity | Status | Dependencies |
|----|------|-------|------------|--------|--------------|
| TASK-390 | Bluff coasts + hero heights: per-archetype `bluff` flag, 5–7 u walls tagged Zone.cliff, harbour/dock coves | worldgen | L | COMPLETED (73d9ac2) | — |
| TASK-391 | Earth walls: soil strata, grass lip + drips, dark foot, wet line in the terrain material | shader | M | COMPLETED (7736849) | — |
| TASK-392 | Postcard pose (intro ends on it), horizon cloud banks, warmer grade, aerial fog tint | engine | M | COMPLETED (7431bdc) | — |
| TASK-393 | Hero landmark per theme ×1.6–2 height, LOD1 faithful | props | M | COMPLETED | TASK-390 |
| TASK-394 | Stone-arch viaducts between near islands (pair picker + geo + InstancedMesh), preset W12 (removed 2026-10-11, D-045) | worldgen → props | M | COMPLETED | TASK-390 |
| TASK-395 | Waterfalls off bluff lips: lit flow tag, foam, mist puffs | shader | M | COMPLETED | TASK-390 |
| TASK-400 | Research → "Biodome Lab": breached crater, glass biodomes, rim crystals, research vessel | worldgen | L | COMPLETED | TASK-390 |
| TASK-401 | QA → "Test Factory": plateau, sawtooth hangars, conveyor bridges, loop track, check tower, movers | worldgen | L | COMPLETED | TASK-390 |
| TASK-403 | Marketing → "Media Rock": lee terraces, Ad Boulevard + giant screen, media campus ledges (antenna, layered offices, photo / print shops), fair ground (ferris wheel mover, tents, booths, stage) | worldgen | L | COMPLETED | TASK-390 |
| TASK-405 | DevOps → "Ember Works": cone-foot shelves (harbour, foundry, data center terraces), container yard + crane + control tower, CI/CD belt, quay machinery, furnaces + rail + smithies, lodges, cargo ships / ore trains (movers), batcher far-group skip (D-048) | worldgen | L | COMPLETED | TASK-390 |
| TASK-406 | Draw-call budget for the D-sky-* close shots: LOD0 contact blobs merged into one mesh (`props:L0:blobs`, like LOD1); D-sky-craft/basket/balloon-night 341/338/339 → 277/276/275 | engine | S | COMPLETED | TASK-405 |
| TASK-396 | Re-pin cams (D-macro blocked by a wall), DESK_CAM, live cams; `--assert` ×3 qualities | engine | S | COMPLETED | 393–395 |
| TASK-397 | QA: wow before/after sheet, ladder ×3, 10-seed sweep — wow 13/13, ladder fails on Marketing T2–T3 ground tone (→ TASK-440), seed 3003 W11 302 (→ TASK-407), gulls + orphan rotors (→ TASK-399) | qa | M | COMPLETED | TASK-396 |
| TASK-399 | Fix QA defects: seagulls drawn as stretched planks (W2/W3), orphan rotors beside turbines (W7) | engine | S | COMPLETED | TASK-397 |
| TASK-398 | Docs: ART_BIBLE §2/§4/§6/§8/§11 (soil #B9845A, postcard pitch band), DECISIONS D-039…D-045, MEMORY | docs | S | COMPLETED | TASK-397 |
| TASK-402a | Observatory University prop kit: observatory, faculty halls, library rotunda, campus tower, terrarium, sculptures, radio dish, lab pod, garden kit | props | L | COMPLETED (3d2b414) | TASK-400 |
| TASK-402b | Research → "Observatory University": 52–58 u terraced campus hill, quad, gardens, glasshouses, research base, dishes, sculptures; W9 re-framed, W14 "Campus Golden Hour" (D-046) | worldgen | L | COMPLETED | TASK-402a |

### M19 — Seven Cultures
*Every island a profession-themed micro-culture (plan: `mar-plans/ISLAND_CULTURES.md`). Chosen: HQ Harbour Guild, Coding Wind Gardens, DevOps Ember Smiths, Marketing Carnival Broadcasters, QA Inspectors, Design Glass & Light, Research Star Academy. Budget gate first (W11 298/300); culture kits mostly tier 2–3, ≤ 10 new defs per island, 0 new programs.*

| ID | Task | Agent | Complexity | Status | Dependencies |
|----|------|-------|------------|--------|--------------|
| TASK-407 | Far structure merge: one merged mesh per island at T0–T1, swap to instanced groups at T2; W11 ≤ 230 (cut-off point) — W11 298 → 146, W1 227 → 101, low W11 142 → 66 | engine | L | COMPLETED | TASK-406 |
| TASK-408 | Culture contract: `content/cultures/*` types + 7 stubs, `noShadow` prop flag, `cultureDefsPerIsland`, `StorySpot`, ledger test | engine | S | COMPLETED | — |
| TASK-409 | Pennant & signage kit: 7 pennant cuts, pier signpost, cargo crate ×7, sail stripe, emblem glyphs | props | M | COMPLETED | — |
| TASK-410 | HQ Harbour Guild kit (timetable board, bell post, ferry awning, guild hall variant, ferry hull …) | props | M | COMPLETED | 408, 409 |
| TASK-411 | Coding Wind Gardens kit (pergola desks, hammocks, kites, rubber ducks, giant duck …) | props | M | COMPLETED | 408 |
| TASK-412 | DevOps Ember Smiths kit (lava lanterns, ingots, anvil, onsen deck, server shrine, forge bell …) | props | M | COMPLETED | 408 |
| TASK-413 | Marketing Carnival kit (popcorn cart, confetti cannon, marquee, balloon mast, mascot statue …) | props | M | COMPLETED | 408 |
| TASK-414 | QA Inspectors kit (bug jars, stamp desk, cone pyramid, scoreboard, inspection booth, UV lamps …) | props | M | COMPLETED | 408, 410 |
| TASK-415 | Design Glass & Light kit (hot shop, prism sculpture, stained screen, glass orbs, rainbow arc, canopy vitray …) | props | M | COMPLETED | 408, 414 |
| TASK-416 | Research Star Academy kit (chalkboards, tea trolley, tripod telescopes, orrery, owl box, observatory slit …) | props | M | COMPLETED | 408 |
| TASK-420…426 | Culture placement per island (fixtures, story spots, routes): 420 HQ (ferry routes with dwell, guild hall), 421 Coding (rollVariants, story-spot plumbing, per-island lanterns), 422 DevOps (onsen, forge-bell foundry), 423 Marketing (fair, mascot, SHOW fix), 424 QA (Hall of Checks, Bug Zoo, UV track), 425 Design (hot shop, prisms, vitray tree, rainbow in the shallows), 426 Research (comet-night observatory, orrery, tea, pennants). Follow-ups: Emberpeak steam-main pipes float over the cone slope; Research only 0–3 pennant lines and lecture on 1/3 of seeds (seed 1001 lacks lecture/comet board/balloon cart); Design hot-shop smoke shows 0 particles; life Sailboats must put ferries on 'ferry' routes | worldgen | M ×7 | COMPLETED | 410…416 |
| TASK-430 | Culture clock + Launch Day Relay (rhythm table, lamp sets, variant swaps, festival) | engine | M | COMPLETED | 420…426 |
| TASK-431 | Culture movers (bell, crane lift, kites, confetti, caustics, weather balloon …) | life | M | COMPLETED | 420…426 |
| TASK-432 | Bot culture: carried items, accessories, poses, itineraries, tableau bots | life | M | COMPLETED | 420…426 |
| TASK-433 | Critter culture: ladybug, owl, pigeon, cats, capybara, mascot crab ; follow-up: capybara reads like a turtle from above| life | M | COMPLETED | 432 |
| TASK-434 | Culture boats: HQ ferries on 'ferry' routes with dwell (life/ferry.ts), QA inspection boat + Design lantern boat on island rings, sailboat variants 5 (rollVariants 2); follow-up: boats can overlap each other at piers (seen in D-ferry-dock) | life | M | COMPLETED | TASK-420 |
| TASK-435 | Regression fix: D-sky-basket black frame = one NaN pixel from FLAT_SHADED derivative normals on a far sliver triangle (Bug Zoo at 351 u), spread by bloom → guarded flat normal (factory.ts), pow(d<0) fix; shared wake mesh, shadows skipped past half fade (D-sky-craft 297 → 282) | engine | S | COMPLETED | TASK-424 |
| TASK-440 | Culture ground + light: stripe layer, terrazzo, `marquee`/`stained` surface kinds, emissive hues; fix Marketing ladder ground-tone step 120→21 u and Research 30→21 (TASK-397) ; done: marquee + stained surfaces, UV pools, terrazzo; skipped: stripe layer (needs edge-aware ground); ladder misses are parallax of the Marketing broadcast tower + sky craft, not ground tone → add tower to FRAMING.ladder.avoid in TASK-450 | shader | M | COMPLETED | 430…433 |
| TASK-441 | Sky culture: balloon accents + pennants, HQ airship livery, Launch Show take-off | props | S | COMPLETED | 423, 431 |
| TASK-450 | Presets: W15 Relay Night, W16 Harbour Guild Morning, W17 Jewel Tree Night, W18 UV Bug Hunt (the green-light framing never read), W19 Prism Hour; ladder: Marketing tower in FRAMING.ladder.avoid + `craft=0` for ladder shots (5 borderline misses left: L-hq drift, L-design drift 480, L-research 30→21, L-pairs-research, L-pairs-marketing 380); TASK-441 fix: Hype Fleet pennants lost their wind weight (far anchor smeared them into sky-long streaks) | engine | S | COMPLETED | 440, 441 |
| TASK-451 | M19 QA: 10 seeds, ladder ×7, culture checklist. Done: wow 18/18 and dev 100/100 `--assert` ok, 10-seed sweep clean, ladder 7 misses (L-hq, L-design, L-research, L-pairs-research, L-pairs-marketing); 3 HIGH (W18 roof at the lens, W15 airship cut at the top, HQ signpost debate under the banner pole), rest → TASK-453 | qa | M | COMPLETED | 450 |
| TASK-452 | Docs: ART_BIBLE §12 Cultures (+ §11 W7 / W17 / W19 fixed to shots.ts), DECISIONS D-050…D-055 (D-049 already present), MEMORY, task-index | docs | S | COMPLETED | 451 |
| TASK-453 | M19 polish from QA 451: (a) shots framing: W18 roof at the lens, W15 airship cut, W7 reads as midday, `D-story-signpostDebate` banner pole; (b) shader: W19 panes unlit at golden hour, W13 beige slabs on the cliff, W14 / W16 water wedge, golden caustic strips, Marketing searchlights in `D-culture-marketing-night`, balloon stipple; (c) world: W2 needs ≥ 3 boats, W3 ≥ 10 fireflies, DevOps pipe segments float on the slope, Research ladder 30 → 21, L-hq drift, L-design 480 drift | (a) engine, (b) shader, (c) life / worldgen | M | COMPLETED | 451 |

### M19b — Culture polish
*Open defects left after TASK-453 (MEMORY "where I left off" 2026-10-13). 460–462 parallel, 463 after them; 464 found by 463.*

| ID | Task | Agent | Complexity | Status | Dependencies |
|----|------|-------|------------|--------|--------------|
| TASK-460 | Life polish: W2 ≥ 3 boats, W3 ≥ 10 fireflies, boats don't overlap at piers, capybara reads as a capybara from above | life | M | COMPLETED (6e86fa5) | — |
| TASK-461 | World polish: DevOps steam main as a real pitched run on slopes (no steps), Research ≥ 4 pennant lines + lecture on every seed; medium tableau cap 4 → 5 so tea time keeps its bots | worldgen | M | COMPLETED (89bbae9, d7abd62) | — |
| TASK-462 | Balloon shadow dither stipple — really the Bayer-dithered steam under the balloons: blended puffs + near-camera fade | shader | S | COMPLETED (537fb7c) | — |
| TASK-463 | Ladder misses: exact masks on medium/high (composer skipped), class-consistent drift, Research ladder shift, DOF focus on the orbit target, solar rows T0 — low 6→0, medium 4→0, high 10→1 (D-056) | engine | M | COMPLETED (27bfa82, 9c55f1c) | 460–462 |
| TASK-464 | T1 far forests stipple out (`TIER_FADE[1]` 320–420 u, blobs off at T1) + per-species / blossom T0 blobs so a wider fade doesn't break pair 380 (high L-pairs-design blob 0.7 %) | props → engine | M | COMPLETED (26206bf) | TASK-463 |

### M20 — HQ Seven Gates + Design Glass Conservatory
*User-chosen remake (D-057, D-058, 2026-10-17; master plan `mar-plans/WORLD_PLAN.md`). CLOSED 2026-10-24: wow 21/21 `--assert`, QA report `mar-docs/qa/m20-2026-10-23.md`; follow-ups → TASK-478.*

| ID | Task | Agent | Complexity | Status | Dependencies |
|----|------|-------|------------|--------|--------------|
| TASK-465 | New defs, both islands: HQ `cultureGate` (7 culture variants), `goodsStall` (7 goods variants), `semaphoreTower` (arm hooks), `mailLine` (pylon + cable); Design `conservatory` (T1), `glasshouse` (pane variants), `glassBridge`, `prismArch`, `stainedWindmill` (rotor hook); LOD1, FIXTURE_RADIUS, culture ledgers | props | L | COMPLETED (9598fcb) | — |
| TASK-471 | M20-pre (D-058): HQ = island nearest the cluster centroid on every seed (`W:K2`); 3–6 skerries + one Lonely Palm islet (`W:D2/K6`) in the same layout change; one-time re-pin of seeds, raw cams, wow / ladder | worldgen | M | COMPLETED (245d348) | — |
| TASK-466 | HQ plan rewrite (D-057/D-058, `hq-design.md` §1.2 zones): compass plaza, 7 streets aimed at real islands (own = harbour lane; water-bound streets end in a shore gate + mooring post), gates, stalls, post yard + mail line, Guild Terrace above the plaza, semaphore on the summit, quay around the pier + beach rest of the bay | worldgen | L | COMPLETED (3a6cf43) | TASK-465, TASK-471 |
| TASK-467 | Design plan (D-057/D-058, `hq-design.md` §2.2 zones): conservatory replaces the glade quad (ateliers ring it, 4 bays → 4 paths), glasshouse rows, glass bridge on the waterfall stream, prism-arch path pier → conservatory, windmill ridge; pine filler −35 % | worldgen | M | COMPLETED (e49ee29) | TASK-465, TASK-471 |
| TASK-468 | Shader: HQ compass mosaic ground surface kind + street tints; Design prism-arch light pools, conservatory glass | shader | M | COMPLETED (371227d) | TASK-466, TASK-467 |
| TASK-469 | Life: semaphore arms follow the 21:00 relay, gates light up in relay order, mail sacks slide down the line, stall keepers; windmill rotor | life | M | COMPLETED (16ba5e3) | TASK-466, TASK-467 |
| TASK-470 | QA + framing: new wow shots (HQ compass star from above, conservatory prism hour), ladder L-hq / L-design, wow `--assert` | qa | S | COMPLETED (caf0f9d, dbe91dd) | TASK-468, TASK-469 |
| TASK-476 | Engine: merge near-tier culture fixture groups (HQ gates / stalls / pennants, Design kit) so medium is back to ≤ 300 calls; lower the D-061 budget raise (340 → 300, 176 MB → 170) | engine | M | COMPLETED (5d09e59; calls 300, MB stays 176 — W4 173 MB is a T1 view) | TASK-466, TASK-467 |
| TASK-477 | Life fixes: dock roots below `VILLAGERS.minWalkY` drop out of the walk graph so piers are unreachable on ~6/7 islands (every `dock` itinerary goal silently fails) — keep dock roots walkable at h ≥ 0; find the white soft balls floating over HQ in W2/W16 (idle too) and fix or ground them | life | S | COMPLETED (5a708b3) | TASK-469 |
| TASK-478 | M20 follow-ups (`mar-docs/qa/m20-2026-10-23.md`): W16 re-frame (pier root out of frame, balloon on the clock-tower crown); W22 gate lanterns faint; tour W19 stop still uses the old NE angle (`content/tour.ts`); `birds=0` URL flag for ladder frames (gulls → L-pairs-hq pair 40); L-marketing medium far drift (cliff strata flat at T0 / far T1, far sea stacks lose caps); L-design near rungs can't show the conservatory (metric/engine decision); W4 Beacon/Design buffers trim so medium MB 176 → 170 | engine / shader / props | M | COMPLETED (01e6fe5; medium MB 170; L-marketing drift + L-design rung proposal still open) | TASK-470, TASK-476 |

### M21 — World P1 (quick wins)
*D-059, `mar-plans/WORLD_PLAN.md` §4.8 / `study/world.md`. 472 ∥ 473 now (parallel to M20); 474 after TASK-471.*

| ID | Task | Agent | Complexity | Status | Dependencies |
|----|------|-------|------------|--------|--------------|
| TASK-472 | Sky + sea shader quick wins: night sky fix (stars, moon height; `W:G5`), deep-band texture ≤ 8 % L (`W:K5`), lingering ferry wakes (`W:B4`), morning channel mist (`W:H6`), comet on Comet Night + seeded meteors (`W:G2`) | shader | M | COMPLETED (81a963b) | — |
| TASK-473 | Tour mode (`W:C1`): idle → wow-preset chain with eased flights and time scrub, HUD toggle, any input stops it | engine | S | COMPLETED (257f171) | — |
| TASK-474 | Channel buoys along ferry routes with night lamps (`W:D8`); sea-stack fields + one arch (`W:D3`) | worldgen | S | COMPLETED (77408cf) | TASK-471 |
| TASK-475 | Seamark polish: sea-stack arch lintel reads as one span from afar (not two rocks); buoy night lamps readable at W15 | worldgen | S | COMPLETED (9dd7199) | TASK-474 |

### M22 — Five-island quick wins (CLOSED 2026-10-24)
*D-059 directions, D-062 Round 3 (all recommended). WORLD_PLAN §4.3–4.7 quick-win rows; item codes defined in `mar-plans/study/coding-devops-qa.md` / `marketing-research.md`. Wave 1: 479 ∥ 480 ∥ 481; wave 2: 482 ∥ 483 (+ TASK-478); then 484 + QA.*

| ID | Task | Agent | Complexity | Status | Dependencies |
|----|------|-------|------------|--------|--------------|
| TASK-479 | Coding quick wins: C4 pinwheel meadow, C9 hedge glyphs, C11 windsock avenue, C13 fairy-light grove, C14 turbine tip lights, C15 nap grove; R3-12 solar halved + warm park / blue server night lights; Coding lamp set | props | M | COMPLETED (924d7a5) | M20 |
| TASK-480 | QA quick wins: Q16 hangar repaint (white-mint-yellow tone, R3-14), Q6 rim walkway primitive + hazard posts, Q18 palm rim, Q17 bug-hunt night, Q10 buoy slalom, Q15 grandstand; QA lamp set | worldgen | M | COMPLETED (9659926) | M20 |
| TASK-481 | Marketing quick wins: M11 carnival gate (`cultureGate` marketing), M5 marquee bulb strings, M2 transmitter stacks, M17 lit buoy chain, M8 party pontoon, M7 straight red-carpet boulevard; Marketing lamp set | props | M | COMPLETED (dbf4bd5) | M20 |
| TASK-482 | DevOps quick wins: D8 fumarole pools, D11 basalt columns, D12 switchback lantern path (R3-13 every direction), D15 ember sparks, D16 deploy night, D5 summit watch tower; R3-13 lodges → ops-shack variant; DevOps lamp set | worldgen | M | COMPLETED (a763b5c) | M20 |
| TASK-483 | Research quick wins: R12 hedge maze parterres (R3-16), R20 weather roof, R13 launch gantry, R17 bell hour, R16 cap toss, R9 arboretum; seal spot critter; Research lamp set | props | M | COMPLETED (81bc1f5) | M20 |
| TASK-484 | Coding C18 rim walkway (reuses the TASK-480 primitive) + M22 QA: wow / ladder `--assert`, new or re-framed wow shots per island, QA report | engine | S | COMPLETED (4cc2343, d3b700a; W23–W26, W6 re-frame; `mar-docs/qa/m22-2026-10-24.md`) | TASK-479…483 |
| TASK-485 | M22 follow-ups (worldgen): story-spot keep-out (C11 windsock on the Coding duck crossing), Marketing bot on the cliff face (walk-graph leak?), W25 billboard hides the carpet, C18 boardwalk night lamp caps (Coding lamp set), W2 gate on grass, W20 mail cable, bigger slalom buoys | worldgen | M | COMPLETED (5a8e7bd; D-065; W2 Research gate tint open) | TASK-484 |
| TASK-486 | M22 follow-ups (shader): W26 test-firing steam as soft puffs, medium far drift on Marketing / DevOps (far-wall strata), DevOps switchbacks pale by day | shader | S | COMPLETED (b25dce5; D-066; L-devops medium passes, L-marketing 480 → TASK-487, DevOps day bands open) | TASK-484 |
| TASK-487 | Ladder metric: L-design near rungs keep measuring structure cells (> 35 % of frame), L-pairs-marketing transmitter parallax; a real pop must still fail | engine | S | COMPLETED (d8dcff4; D-068; ladder low + medium 0 miss; glasshouse T2 pop found → TASK-493) | TASK-484 |

### M23 — Dünya İmza (world signature) (CLOSED 2026-10-27)
*D-064 (whale; constellations + fireworks), D-058 (K3 underwater sills). WORLD_PLAN §5 row 3, items in `mar-plans/study/world.md`. Starts after TASK-485…487 merge. Wave 1: 488 ∥ 489 ∥ 490; wave 2: 491; then 492 QA.*

| ID | Task | Agent | Complexity | Status | Dependencies |
|----|------|-------|------------|--------|--------------|
| TASK-488 | Reef shoals + shared shelves (`W:D1` + `W:K3`): 3–6 seabed patches at −2…−6 u in the deep gaps, sills (−3 u, never above water) between neighbours < 55 u with a deep boat gap; shoal tint + foam on the water shader (sdf contribution or separate depth tint, 0 programs) | worldgen | M | COMPLETED (1f1f371; D-067; shoal edges a bit crenellated at T0) | TASK-485 |
| TASK-489 | Whale (`W:D6`): 14 u grey whale mover (not an agent) in a deep channel, closed-form surfacing every 90–150 s (seeded phase): back + spout puffs 6 s, tail slap, dive; passes the Research cape at 17:45; click = tail + splash; ≥ 20 u from boat polylines, outside the reefs; `fadeNear` at T2 | life | M | COMPLETED (dea87ce; D-070; W28, W28b; T0 read weak — cape pass at overview bottom edge, body reads lens-like from above) | TASK-488 (route) |
| TASK-490 | Relay night scene (`W:B1` + `W:B6` + `W:G7`): 2–3 mini beacons on skerries + Marketing lighthouse sweep in route order (1 s offsets) 18:30–06:30; signal lamps on each island's top relay the 21:00 flashes to the next island; 22:01 fireworks from HQ harbour (6 bursts, culture accents, water reflection; off in rain) | props | M | COMPLETED (b4a9a95, 104962b; D-069; W15b–W15e) | TASK-469, TASK-472 |
| TASK-491 | Culture constellations (`W:G4`): 7 glyph constellations (6–9 bright stars, lines alpha ≤ 0.15) in the sky above each island, 21:00–04:00, lines brighten on Comet Night | shader | S | COMPLETED (d7b0a13; D-071; W27; glyphs not in existing night frames — no sky in them) | TASK-486 |
| TASK-492 | M23 QA: wow `--assert` + new shots (whale postcard, relay wave W15b, fireworks), ladder low + medium, QA report | qa | S | COMPLETED (a793421; `mar-docs/qa/m23-world-signature.md`; wow 32/32, ladder medium 0 miss, low 0 metric miss but 350k tri budget missed at Design/Research T2 rungs) | TASK-488…491 |
| TASK-493 | Glasshouse row pop: the six tier-2 glasshouses (`props-themes/m20.ts`, each < 3 u) are absent at 170 u and appear together at the 140 u boundary — move the row to T1 or give the group effective tier 0 (D-031), within the tier-1 cap and budget; then the Design ladder target can move to the row (−8, −28) | props | S | COMPLETED (33b69af; `PropDef.fromT0`; row visible at 170 u; Design ladder target not moved — conservatory dome fails pair 140, see D-073) | TASK-487 |
| TASK-494 | Whale polish: reads as a cute whale from above (flippers, fluke at the surface, tapered stock, countershading), spout one soft column, W28 reads at T0 (≥ 60 px, an island for scale); memory ~0, no new program | life | S | COMPLETED (bed7728; D-072; W28 raw cam, ~900 tris; tail/fluke sign bug from TASK-489 fixed; side-on view still fishy) | TASK-489 |
| TASK-495 | Budget headroom: low-tier ladder 350k tri budget missed at tier-2 rungs (L-design 120 u 358k, L-pairs-design 112.8–131.6 u, L-pairs-research 131.6 u — new in M23, find the cause); win back ≥ 5 MB of medium memory (peak W27 169 / 170); with TASK-493 the glasshouse row must fit the same budget | engine | S | COMPLETED (9088213; D-073; cause: uber culture-mover geometry × instances, Design over since TASK-483; low max 305k; memory peak W27 169 → 162 MB) | TASK-492 |
| TASK-496 | Night effects polish (M23 QA 3/4/7): fireworks read as bursts (filled, short trails, glow) not star-sprite rings, reflection on open water; signal ray reads as a beam toward the next island, not a comet/lightsaber; skerry beams readable in the postcard. Memory and programs must not grow | shader | M | COMPLETED (70b82dc; D-074; W15b/c/e/W15 weak → PASS; memory 0, programs 0, +1–3 calls at night) | TASK-492 |

### M24 — Coding + QA signature
*D-059 (Coding A Kite Hill & Wind Tunnel, QA A Proving Grounds), D-062 (R3-12, R3-14: cap overrides Coding 12/2, QA 12; Coding solar halved, night warm park + blue server, kite train yes; QA toy-factory tone, two tracks, tier-1 = Q2 tower). WORLD_PLAN §4.3/§4.5/§5 row 4, items in `mar-plans/study/coding-devops-qa.md`. Wave 1: 497 ∥ 499 ∥ 500; wave 2: 498 ∥ 501; then 502 shots + QA.*

| ID | Task | Agent | Complexity | Status | Dependencies |
|----|------|-------|------------|--------|--------------|
| TASK-497 | Coding Kite Hill (`CO:C2`): upwind +4 u knoll in the island profile (hash re-pin), bell turbine on top, 8–12 kite masts round its foot, a bench on the hill path; ridge site anchor for the wind tunnel (`CO:C1`) between the turbines; solar rows halved (R3-12) | worldgen | M | COMPLETED f85dadf | — |
| TASK-498 | Coding Wind Tunnel + Kite Day (`CO:C1` + `kiteScene`): 14 u lattice half-tube, 3 u fan spinning with the wind, 5 windsocks inside (gusts lift them); Kite Day 14:00 all kites rise, one stuck on the hill; second tier-1 slot (cap 12/2); night = warm park + blue server light | props + life | M | COMPLETED 10c0bff | TASK-497 |
| TASK-499 | QA Proving Grounds kit (`QA:Q2` + `Q4` + `Q5`): 10 u lattice drop tower (tier-1, R3-14) with crate, 4 u test fan + cage + streamer dummy pole, obstacle course (hurdle, tyre stack, balance beam, cones: one def, 4 variants); toy-factory white-mint-yellow tone | props | M | COMPLETED f8770bb | — |
| TASK-500 | Mother Kite Train (`CO:C3`): 7-kite train 20 u above Coding on the sky-craft orbit pattern (D-038), reads as a blue-yellow dot chain at T0; W11 +1 call max | life | M | COMPLETED a9a8918 | — |
| TASK-501 | QA Figure-8 Crash Track + motion (`QA:Q1`, R3-14 two tracks): ramped crash track (testTrack variant ×2) on the SE meadow beside the existing loop, closed-form cart with a ramp parabola and wobbling dummy; drop-tower lift/drop every 20 s with landing squash + ✓ lamp; fan speeds up at the 12:00 siren test | props + life | L | COMPLETED 98da9b4…754b4d6 | TASK-499 |
| TASK-502 | M24 shots + QA: wow presets Kite Hill Afternoon (14:00 +20 s, ≥ 6 kites), Proving Grounds Noon (12:00 +3 s), Fairy Night / Bug Hunt Night refresh; ladder low + medium `--assert`; QA report | qa | S | COMPLETED 187eefb (3 wow presets missing → added by TASK-512: W-kite-hill-afternoon, W-proving-grounds-noon, W-fairy-night) | TASK-497…501 |

### M25/M26 DevOps I–II · M29 HQ Marina · M30 QA Customs Port
*D-080, D-081, D-082 (user, 2026-10-27). Run in parallel with M24 at the user's request ("paralel hızlı"); every branch keeps its hash re-pins in one separate commit and appends defs in a marked block at the end of `PROP_DEFS`, the orchestrator reorders at merge. Placement tasks follow once their props + anchors are merged.*

| ID | Task | Agent | Complexity | Status | Dependencies |
|----|------|-------|-----------|--------|-------------|
| TASK-503 | Emberpeak growth: lower apron / shelf ring round the cone (silhouette unchanged), layout still fits; anchors for funicular stations, cableway, smiths' lane, onsen town, geyser field, lava channel, obsidian beach, breakwater | worldgen | L | COMPLETED 7c3fcd3 | — |
| TASK-504 | DevOps M25 props: `funicularRail` + `funicularCar`, ore cableway (mailLine reuse), summit bell + red beam variant, `geyserCone`, onsen house + smiths' lane variants; hooks for movers | props | M | COMPLETED 45eac0d | — |
| TASK-505 | HQ yacht marina (comb piers, 15–20 moored boats, breakwater, H11 buoys, mast lights) + cove-mouth star fort with H18 lights; placed; Marina Dusk preset | props + worldgen | L | COMPLETED abeb108 | — |
| TASK-506 | QA customs port props: Q8 scanner arch, QA cargo ship, quay crane, inspection line + ✓/✗ lamps, Q9 quarantine pontoon (variants of DevOps cargo kit) | props | M | COMPLETED c96fe0c | — |
| TASK-507 | DevOps M25 placement + motion: funicular line + 2 cars, ore buckets, bell 06:00 + beam, smiths' lane, onsen town, geyser bursts 17:30; Funicular Dawn / Ember Lane Night presets | worldgen + life | L | COMPLETED (D-089) | TASK-503, TASK-504 |
| TASK-508 | QA customs port placement + motion: ship route under the arch, crane unload, inspection ✓/✗, rejects to pontoons; Customs Noon preset | worldgen + life | L | COMPLETED (D-087) | TASK-501, TASK-506 |
| TASK-509 | M26 DevOps II: lava river (ground emissive), lava fall + steam delta, ember bridge, crater deck, lava-glass kiln, obsidian beach, breakwater + tug | shader + props + worldgen | L | COMPLETED (509a/b/c; D-091–D-093) | TASK-507, TASK-511 |
| TASK-509a | M26 shader: lava river ground (emissive channel along the `lavaChannel` strip, crust + flow), lava fall + steam delta at `lavaFall` | shader | M | COMPLETED (D-091) | TASK-511 |
| TASK-509b | M26 props: ember bridge, crater deck, lava-glass kiln, obsidian beach decor, breakwater + tug; hooks for movers | props | M | COMPLETED (D-092) | TASK-511 |
| TASK-509c | M26 placement + motion on the D-083 anchors (earthworks per `groundWriter`, rail via `railFromLevels`), tug route, kiln glow; wow preset(s); hash re-pin | worldgen + life | L | COMPLETED (D-093) | TASK-509a, TASK-509b |
| TASK-510 | Shots + QA for M25 / M29 / M30: wow presets, ladder low + medium `--assert`, QA report | qa | S | COMPLETED 187eefb (D-090) | TASK-505, TASK-507, TASK-508 |
| TASK-511 | HQ grows ~20–25 % so it reads clearly largest in W1 (Emberpeak + TASK-503/507 anchors untouched); layout fit, re-pin hashes, re-aim raw cams that moved (D-090) | worldgen | M | COMPLETED | TASK-510 |
| TASK-512 | Wow presets Kite Hill Afternoon, Proving Grounds Noon, Fairy Night; re-frame W-ember-lane-night (D-090) | life | S | COMPLETED | TASK-511 |
| TASK-513 | M26 follow-up: obsidian beach as a low black-sand cove (heightfield notch + zone repaint at `obsidianBeach`, decor re-seated), hash re-pin | worldgen | M | COMPLETED (D-098) | TASK-509c |
| TASK-514 | M26 follow-up: lava shader polish — soften the bullseye delta foam rings, blend the channel start into the crater glow at the notch | shader | S | COMPLETED | TASK-509c |
| TASK-515 | M26 follow-up: crater-deck couple (2-bot tableau on the two seats; DevOps tableau cap 6 → 7) | life | S | COMPLETED | TASK-509c |

### M27 — Marketing signature (Cable Carnival)
*D-094: D-059 direction A + D-062 R3-15 (ON AIR neon, fair stays on ledge2, diving tower 1 def, cap 11). Study `mar-plans/study/marketing-research.md` §1 (M1, M3, M4, M13, wow §1.4).*

| ID | Task | Agent | Complexity | Status | Dependencies |
|----|------|-------|-----------|--------|-------------|
| TASK-516 | Beacon Rock anchors (pure data): the three sea stacks as stations (stack 1 transmitter top, stack 2 sea-facing billboard face, stack 3 dive platform + splash pool), cable-car line summit lip → stacks with pylon sites, windward cliff-face neon anchor (normal from `Zone.cliff` + SDF gradient); 30-seed anchor tests | worldgen | M | COMPLETED (D-095) | — |
| TASK-517 | Marketing M27 props: gondola cars + pylon (`mailLine` gondola variant, red / cream), sea-facing `billboardV2` variant (slides surface), vertical ON AIR letters (`billboardV2` v3 instead of `marqueeSign` v3, tier hazard, D-096), `diveTower` def (tier 2, cap 10 → 11), stack-top transmitter (`antennaTower` variant); hooks for movers | props | M | COMPLETED (D-096) | — |
| TASK-518 | M27 placement + motion: cable line + 3 gondolas (1.6 u/s, 3° gust sway), billboard slides, ON AIR letters light in sequence at 19:00 (0.4 s), diver every 40 s (parabola + splash ring); wow Cable Dusk + On-Air Rock (study §1.4); hash re-pin | worldgen + life | L | COMPLETED (D-097) | TASK-516, TASK-517 |
| TASK-519 | Shots + QA for M26 / M27: wow + ladder low / medium `--assert`, QA report | qa | S | COMPLETED (see mar-docs/qa/m26-m27-2026-10-28.md) | TASK-518 |
| TASK-520 | QA follow-up: D-m27-dive-splash camera + sim time so the shot catches the splash ring and the pool (today the stack / pylon hides it) | life | S | COMPLETED | TASK-519 |
| TASK-521 | QA follow-up: HQ star fort stone colour variation (reads pale lavender-grey, near white, in W-marina-dusk) | props | S | COMPLETED | TASK-519 |
| TASK-522 | QA follow-up: sea billboard base on the stack face reads as a ledge bracket; bury the foot in the rock or give it a post | props | S | COMPLETED | TASK-519 |
| TASK-523 | QA follow-up: keep the first cable span from crossing in front of the ON AIR letters (shift the sign along the cliff face or the line's summit seat); hash re-pin | worldgen | S | COMPLETED | TASK-519 |

### M28 — Research signature (Summit Observatory)
*D-104: D-059 direction A, silhouette R1 only (no R21), R3-16 items already shipped in M22. Study `mar-plans/study/marketing-research.md` §2 (R1–R4, wow §2.4). Wave 1: 524 ∥ 525; then 526; then 527.*

| ID | Task | Agent | Complexity | Status | Dependencies |
|----|------|-------|-----------|--------|-------------|
| TASK-524 | Summit crag (`R1`): `campusHill.summit` h 2.1 → 4.5, r 0.25 → 0.22, soft 0.17 → 0.1, rock rim + strata paint; observatory pad on the ridge (~15 u top); big dish off the summit spur onto the lab headland; anchors (pure data): Star Stair polyline quad → summit (2 switchbacks, lantern stations every ~3 u), meridian terrace (6 u disc beside the summit, open to the south), 2–3 rim deck sites on the wall edge; 30-seed anchor tests | worldgen | M | COMPLETED (D-105) | — |
| TASK-525 | M28 props: new def `sundial` (tier 2: 6 u disc, 2.5 u gnomon, I–XII glyph plates, brass noon line; Research cap 10 → 11), rim telescope deck (railed 3 × 2 u platform, `selfieSpot` variant + `tripodTelescope`), teal stair lantern variant; gallery shots | props | M | COMPLETED (D-106) | — |
| TASK-526 | M28 placement + motion on the anchors: Star Stair path (stair kind) + 6–8 lanterns lit with the Research lamp set, sundial gnomon aimed so the real sun shadow meets the noon line at 12:00 (±3°), deck bots in `gaze` pose (look up every 8 s); wow W-star-stair-night (W9 cam, 22:05) + W-meridian-noon (12:00); re-pin W9 / W14 cams, `FRAMING.ladder.shift.research`, world hashes | worldgen + life | L | COMPLETED (D-107) | TASK-524, TASK-525 |
| TASK-527 | M28 shots + QA: wow + ladder L-research low / medium `--assert`, W11 ≤ 300 calls, medium memory ≤ 172 MB, W16 ≤ 800k tris; QA report | qa | S | COMPLETED (see mar-docs/qa/m28-research-2026-10-29.md) | TASK-526 |
| TASK-528 | QA follow-up: Star Stair lantern night light pool too strong / orange (reads as lava on the crag face); tone radius, intensity, hue; re-shoot W-star-stair-night + D-m28-stair-night (D-108) | shader | S | COMPLETED (D-108) | TASK-527 |
| TASK-529 | QA follow-up: lawn-colour halo bleeds up the steep crag round the rim deck, sundial and quad-side pads (W14, W-meridian-noon, D-m28-deck / sundial); hash re-pin (D-109) | worldgen | S | COMPLETED (D-109) | TASK-527 |
| TASK-530 | QA follow-up: sundial XII plate reads "IIX" from the usual views; numerals readable from the usual camera side, check all 12 (D-110) | props | XS | COMPLETED (D-110) | TASK-527 |
| TASK-531 | QA follow-up: W-star-stair-night has no comet / stars in frame; camera or simt so the Comet Night streak is in frame (D-111) | engine | XS | COMPLETED (D-111) | TASK-527 |

### M31 — Ferry harbours (Research pilot, then Marketing + Design)
*D-112 (user 2026-10-30): one shared harbour skeleton, islands may grow at the harbour sector; Research = Tide-Lab + half-sunken lagoon city; Marketing = Carnival Pier; Design = Colour Wharf. Study `mar-plans/study/harbours.html`. Wave 1: 532 ∥ 533; then 534; 535; then 536 ∥ 537; 538.*

| ID | Task | Agent | Complexity | Status | Dependencies |
|----|------|-------|-----------|--------|-------------|
| TASK-532 | Harbour skeleton (pure data, reusable for any island): breakwater arm grown from the cove (heightfield + coast in that sector only), basin, T-head ferry pier + berth, anchors for shelter / booth / timetable / harbour light; Research instance + Tide-Lab anchors (stilt lab second pier, sub mooring, tide gauge) + half-sunken city site in the lagoon band (ruin grid, tops-above-water cells); HQ ferry route retarget; 30-seed tests; hash re-pin | worldgen | L | COMPLETED (D-113) | — |
| TASK-533 | Harbour kit props: shared (harbour light, waiting shelter, ticket booth, timetable board, bollards; variants where possible) + Research theme: stilt marine lab (tier-1) with glass tide tank, yellow submersible, sunken city kit (columns, arches, paving slabs, broken tower tops: one def, variants), tide gauge; Research cap override; gallery | props | M | COMPLETED (D-114) | — |
| TASK-534 | Research harbour placement + motion: kit on the anchors, sunken city in the lagoon (tops above water), fish schools round the ruins, sub dives 09:00 / surfaces 16:00 with bubbles, lab + tank glow, ferry arrival ritual; wow Sunken Noon + Tide-Lab Dusk; hash re-pin | worldgen + life | L | COMPLETED (D-118) | — |
| TASK-535 | M31 Research shots + QA: wow + ladder L-research low / medium `--assert`, budgets, QA report | qa | S | COMPLETED (`mar-docs/qa/m31-research-2026-11-01.md`) | — |
| TASK-548 | Pier-neck bot queue: spacing against the moored vessel, three bots stack in W-tide-lab-dusk | life | S | COMPLETED (D-136) | — |
| TASK-549 | Harbour beam over land: olive wash on rock and green in W-tide-lab-dusk | shader | S | COMPLETED (D-137) | — |
| TASK-550 | Sunken city paving: flush slabs on a lattice instead of loose tiles; sand wedge on the arm rock face | props + worldgen | S | COMPLETED (D-139) | — |
| TASK-551 | Re-frame W26 (gantry, steam, §11); wire `detail` into `measureGpuMemory` so memory splits are visible; D-culture-research 916k / 800k; low memory reference comment vs 960x540 | engine | S | COMPLETED (D-140) | — |
| TASK-552 | CI green again: red since 2026-10-12 (last green `c3b0561`). `pnpm test` fails on runner timeouts and generation-time limits, so `shots ci --assert` never runs. Seed 1 stage hash differs on Linux CI (`ce41…` vs local `f5d5…` at `d55b02b`, seeds 42 and 1001 match): find the determinism cause first | devops + worldgen | M | COMPLETED (D-132, D-134; CI run 42365776387 green 2026-11-07, first since c3b0561) | — |
| TASK-553 | Profile world generation: the warm `settlements` bound went 400 → 500 ms (D-128) after the M31 harbours and M33 kit (440–471 ms solo); find the stages that grew (sites / routes / props timings), win back what is cheap, then tighten the bound | worldgen | S | COMPLETED (D-138) | — |
| TASK-554 | Re-frame from the 2026-11-06 QA: W-colour-wharf-arrival FAIL (ferry cropped, `WHARF_CAMS.arrival`); W-carnival-arrival (wheel rim over WELCOME, pontoon corner); W-carnival-noon (empty right half); W-thrill-noon (station roof ~40 %, rink hidden); D-coaster-loop / -lift (cam inside the lattice); W-morning-shift (courier a speck, ≥ 12 px); D-track (walker 1 u from the lens); W-data-lake-night (empty top 40 %, cloud cut). Dev set over 300 calls: D-foundry-arm 372, D-lake-pavilion 373, D-wharf-row-dusk 402 / 993k, D-wharf-row 328, D-wharf-pavilion 311, D-coaster-loop-in 297 / 860k: fix and decide whether to assert the dev set | engine | M | COMPLETED (D-129) | — |
| TASK-555 | Light / glow from the 2026-11-06 QA: quantum pavilion core flat opaque disc, no halo, walls over-lavender (`pavilionGlowScene`); WELCOME flash blanks the board white ~2 s then a damaged "WFLCOME" (`welcomeFlashScene`, `PART.panel`); paint streaks read as blobs (`boathouseStreakScene`); coaster siren ring reads as a roof hoop (`coasterLampScene`, `QCM.lamp.sirenRing`); 07:00 W-morning-shift light flat noon-like. Within W27 175 / 180 MB | shader | M | COMPLETED (D-130) | — |
| TASK-556 | Placement from the 2026-11-06 QA: bunting arch pole in front of WELCOME (`plans/marketing-harbour.ts`); cream pontoon in every carnival cam (`carnivalKeepOut`); dark speckled gravel patches by the coaster station (`plans/qa-park.ts` apron / pad splat); bare sand wedge in D-track; hash re-pin | worldgen | S | COMPLETED (D-131) | — |
| TASK-557 | Props / life from the 2026-11-06 QA: low Coding steps station collapses into one slab and bots lose faces (LOD1, `geo/themes/coding-m33.ts`); far bots at night read as white boxes, the line runs at night (D-124); flat green firefly diamond beside the coaster track; lantern boat hull a plain box. Also: `budget agents 62 > 60` at D-carnival-5 (sim 60) and D-wharf-call-1 (sim 126) (D-129); agents and foundry movers have `castShadow = false`, so W-morning-shift gets no long shadows (D-130): decide who casts within budget. Low memory stays ≤ 79 MB | props + life | S | COMPLETED (D-133) | — |
| TASK-558 | Fine-step motion QA (≤ 0.25 s stills or a real-GPU video) for what the 2026-11-06 QA could not judge: wheel boost, marquee chase, walker shrink at route end, courier 2 rise, track return lane, cheer hop, ratchet click, arrival nod, boarding pop, station brake, low 2-car train; plus a real-GPU bloom / MSAA look | qa | S | COMPLETED (`mar-docs/qa/motion-2026-11-06.md`) | TASK-554, TASK-555 |
| TASK-559 | Motion polish from `mar-docs/qa/motion-2026-11-06.md`: chain click ring invisible at the lift cams (`coasterClickScene`, `click.ring` steel on grey rails); parked train + riders frozen during the dwell, arms stay up (`coaster-movers.ts`); arrival nod 0.05 rad reads as a settle (`nod.amp`); confetti ends with no fade (`confettiBurst`); D-track bot within 1.5 u of the lens sim 28-31 hides the cheer hop and the top siren ring is cropped in `D-coaster-lamp-*` (`shots.ts`); make the `Loop.step` clamp to `MAX_FRAME_DT` 0.1 s loud (warn or doc in visual-qa) | life + engine | S | COMPLETED (D-135) | — |
| TASK-560 | Perf calibration for the CI runner (D-138): every generation stage runs 2.7-4.8× slower on the runner against a 1.9× kernel scale. Either a world-shaped kernel (385² Float64 passes incl. a strided column pass like `edtImpl`, small-object allocation; re-measure `REF_KERNEL_MS`, confirm the runner scale ≈ 3.3 on one CI run) or a CI-only world factor ≈ 1.75 next to `MAR_PERF_SCALE`; then drop `continue-on-error` from the `perf` job (undo D-134). Optional hash-neutral: transposed `edtImpl` column pass | devops + worldgen | S | PENDING | TASK-553 |
| TASK-561 | Low `gpuMemoryMB` 80 is a 960×540 number (D-140): E-panel (edit set, 1280×720) reads 90 > 80 (canvas 31.6 MB). User's call: shoot E-panel at 960×540, or make the low budget size-aware (80 + the 36 B/px canvas delta); then run `shots edit --assert` | engine | XS | PENDING (decision) | TASK-551 |
| TASK-536 | Marketing Carnival Pier on the skeleton: lit boardwalk on piles, small Ferris wheel, WELCOME big screen (billboard variant), megaphone kiosk = ticket booth, confetti cannon + screen flash on ferry arrival; keep clear of the cable car / ON AIR corridor; wow preset | worldgen + props + life | L | COMPLETED (D-126) | TASK-535 |
| TASK-537 | Design Colour Wharf on the skeleton: pastel boathouse row at the stream mouth, glass waiting pavilion (conservatory variant), paint-pot buoys, lantern boat moors here, pavilion prism colour shift + buoys light in turn on ferry arrival; wow preset | worldgen + props + life | L | COMPLETED (D-127) | TASK-535 |
| TASK-538 | M31 Marketing + Design shots + QA | qa | S | COMPLETED (`mar-docs/qa/m31-marketing-design-2026-11-06.md`) | TASK-536, TASK-537 |

### M32 — QA Thrill Test Park (roller coaster)
*D-115 (user 2026-10-30): direction A, starts after TASK-535. 539 ∥ 540 → 541 → 542.*

| ID | Task | Agent | Complexity | Status | Dependencies |
|----|------|-------|-----------|--------|-------------|
| TASK-539 | QA park site (pure data): coaster footprint beside the Proving Grounds, closed spline (station, chain lift, camelback, loop) fitted to the terrain with clearances, bumper-car rink, station / board anchors; terrain pads; 30-seed tests; hash re-pin | worldgen | L | COMPLETED (D-119) | — |
| TASK-540 | Coaster props: track builder from a spline (rails, ties, supports to the ground, loop), station, cars (mover meshes, mint / yellow), dummy + capped riders, bumper cars, cotton-candy cart, TESTED ✓ board; QA tier-1 override; gallery | props | L | COMPLETED (D-120) | — |
| TASK-541 | Placement + motion: coaster cycle (dummy run → ✓ lamp → bot run), chain-lift click, closed-form speed along the spline, bumper cars, wow preset (noon siren, car on the loop) | worldgen + life | L | COMPLETED (D-122) | — |
| TASK-542 | M32 shots + QA | qa | S | COMPLETED (`mar-docs/qa/m32-qa-park-2026-11-06.md`) | TASK-541 |

### M33 — Coding Bot Foundry + Drone Port + Data Lake
*D-116 (user 2026-10-30): directions B + C. 543 now (props only); 544 ∥ 547 after TASK-535; then 545; 546.*

| ID | Task | Agent | Complexity | Status | Dependencies |
|----|------|-------|-----------|--------|-------------|
| TASK-543 | Foundry props: conveyor line segments, assembly arms / gantries, part crates, bot body / head / antenna stages, drone pad (H) + charging masts + drone hangar, test-track obstacles; Data Lake kit: steam-cooled server pods, tethered cloud balloon, glass quantum pavilion with a gold chandelier computer; Coding cap override; gallery | props | M | COMPLETED (D-117) | — |
| TASK-544 | Foundry + lake site (pure data): line strip + pad + test track on the empty west / south-west lawns, the Data Lake carve (east shore or a free lawn; shore anchors for pods, pavilion, cloud tether), paths to the Tech Park, anchors; drone routes re-hub to the Coding pad; 30-seed tests; hash re-pin | worldgen | M | COMPLETED (D-121) | — |
| TASK-545 | Placement + motion: line cycle (parts move, arms swing, a bot hops off and walks into the agent pool, closed-form), drones lift off / land at the pad, first-step bots on the test track, cloud sway, pod steam, pavilion glow; wow presets (morning shift, Data Lake night) | worldgen + life | L | COMPLETED (D-124) | TASK-543, TASK-544 |
| TASK-547 | Data Lake surface: navy water with fibre light lines flowing under the surface and packet dots crossing at night, on the existing water / pool path (no new program), tier-gated | shader | M | COMPLETED (D-125) | TASK-544 |
| TASK-546 | M33 shots + QA | qa | S | COMPLETED (`mar-docs/qa/m33-foundry-lake-2026-11-06.md`) | TASK-545, TASK-547 |

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
| TASK-352 | Softer shadows: per-tier penumbra/PCF radius, tighter T2/T3 fit, contact-blob tune | shader | S | COMPLETED | M14 |
| TASK-353 | Water reflections: heightfield ray-march land reflection + albedo texture (high), sun glint (W9 debt), lit-window shimmer at night | shader | L | PENDING | M14 |
| TASK-354 | Phase 3 exit QA: wow + dev sets ×3 qualities, budget decision D-028 final, user real-GPU check | qa | M | PENDING | TASK-351…353 |
| TASK-355 | Docs: DECISIONS D-029…D-031, ARCHITECTURE §3/§8, MEMORY gotchas, README | docs | S | PENDING | TASK-354 |

## Phase 4: Fleet — control room for a self-improving agent fleet

Plan `mar-plans/FLEET.md`, details `phases/phase-4.md`, contract `src/fleet/protocol.ts` (D-141).

### M40 — Fleet Bridge + Island Panel
*D-141 (user 2026-11-07): CLI runtime, gated hand-offs, start with bridge + panel. 562 ∥ 563 ∥ 565; 567 after 562 (same agent); 564 after 563; 566 last. Island layout = fleet/CLAUDE.md + schema + the `coding` example (user 2026-11-07: per-island CLAUDE.md + memory, HQ-controllable).*

| ID | Task | Agent | Complexity | Status | Dependencies |
|----|------|-------|-----------|--------|-------------|
| TASK-562 | Bridge server: `pnpm bridge` (ws + http :5174), `claude -p` stream-json spawn per island cwd, `FleetLine` reducer, `fleet/runs/*.jsonl` + `index.json`, haiku titles, `fleet/fleet.config.json`, 7 island `CLAUDE.md` skeletons, reducer / index tests | devops | M | COMPLETED (D-142) | — |
| TASK-563 | Fleet client (WS store, reconnect, `?fleet=mock` deterministic feed) + island panel (left dock: status dot, agent, title, live duration, last line; shows at tier ≥ 1 for the focused island), `src/content/fleet.ts`, `F-panel` dev shot | engine | M | COMPLETED (D-143) | — |
| TASK-564 | Session ↔ bot binding: a live session seats a department bot with a marker, hover title, deterministic mapping | life | S | COMPLETED (D-144) | TASK-563 |
| TASK-565 | Keyboard camera: WASD / arrows truck + forward, Q/E azimuth rotate, distance-scaled speed, `CAMERA_MOVE.keys`, ignores text inputs / capture / modifiers, stops the tour | engine | S | COMPLETED (D-142; Sandbox key E → B) | — |
| TASK-567 | `scripts/fleet-lint.ts` + `pnpm fleet:lint` + vitest wrapper: island layout (required files, `island.json` vs `schema/island.schema.json`, dir name = theme = ThemeId, CLAUDE.md ≤ 120 lines, memory frontmatter, settings deny block intact, agent name prefix); the six remaining island skeletons cloned from `coding` with department text | devops | S | COMPLETED (D-142) | TASK-562 |
| TASK-566 | M40 shots + QA: F-panel at two sizes, bound bot at T2, HUD overlap, budgets | qa | S | COMPLETED (`mar-docs/qa/m40-fleet-2026-11-07.md`: wow 51 / 55, beacon tris; → TASK-571 / 572) | TASK-563, TASK-564, TASK-565 |

### M41 — Detail + fleet view
*Opened 2026-11-07 after M40 merged. 568 ∥ 569; 570 after both.*

| ID | Task | Agent | Complexity | Status | Dependencies |
|----|------|-------|-----------|--------|-------------|
| TASK-568 | Bridge M41: `send` = `claude -p --resume <id>` with the island flags re-passed (session back to `running`, `seq` continues, same jsonl), `tail` from disk beyond the memory cap, `lastSeq` on every `session` event, request title follows the root session's haiku title, `GET /api/sessions?q=` search over title / agent / island / status, `stop` for a resumed run; tests on the pure parts | devops | S | COMPLETED (D-145) | TASK-562 |
| TASK-569 | Panel M41: row click → terminal view (line stream with kind styling, autoscroll, tail on open / reconnect, follow-up prompt box → `send`, Stop button), bot click → prompt box → `start` on that island, Esc / back; fleet view when no island is focused (tier 0): all sessions grouped by island with live counts, search box (title / agent / island / status, local filter), click → fly to the island + select; row-diff renderer (no innerHTML rebuild); mock supports `start` / `send` so it all works offline; `F-terminal`, `F-fleet` dev shots | engine | M | COMPLETED (D-146) | TASK-563, TASK-564 |
| TASK-571 | Beacon budget + visibility (QA 566 FAIL): beacons move to their own instanced mesh with `count` = bound bots (0 → no call), the 7 variants leave the shared bot mesh (W5 807k / W26 816k / W-funicular-dawn 801k / W-star-stair-night 806k > 800k tris), bot-geometry test limits restored; `FLEET_BOTS.openDesks` gets outdoor stops for every department (beacon invisible outside Coding today); re-shoot wow + island close-ups | life | S | COMPLETED (D-148) | TASK-564 |
| TASK-572 | Panel polish from QA 566 WARNs: "+N daha" footer under the fade, hide / shrink at T3, fleet-view card vs the Marketing / Coding labels at the overview (label-avoid box or narrower card), status palette vs accents (QA running ≈ done green, Marketing / HQ ≈ error red, DevOps ≈ waiting amber: distinct glyphs, not just colour), department-specific mock last lines, Gönder contrast on the QA yellow | engine | S | COMPLETED (D-147) | TASK-569 |
| TASK-570 | M41 QA: terminal legibility at 960×540, prompt box focus / key capture vs WASD, fleet view at 20+ sessions, search, live check against the bridge with one real resume | qa | S | COMPLETED (`mar-docs/qa/m41-fleet-2026-11-07.md`; bridge stale-close race fixed in D-151) | TASK-571, TASK-572 |
| TASK-579 | M41 QA follow-ups (engine): overview label pills dodge the fleet card but land far from their island (hide when no spot near the anchor, or shift the camera frame); Esc in the prompt blurs, second Esc closes the terminal; Turkish result bar ("tamamlandı · 13 tur · $0.41 · 59 dk"), top line clipped on a line boundary; fleet-view sticky header peeks under the next block; gem rim light for same-hue roofs (props) | engine (+ props) | S | COMPLETED (gem rim light deferred to TASK-580) | TASK-575 |
| TASK-573 | Research has 0 resident workers at low / medium (weight 0.3, cap 2 → quota 0 on every seed tried), so a Research session binds no bot and shows no beacon (D-148 Open). Options: raise the research `workers` weight / cap (moves bot counts and shot hashes) or let a visitor bot be pinned. User decision | life + worldgen | XS | PENDING (decision) | TASK-571 |

### M42 — Request chains + approval gates
*D-149 (user 2026-11-07): report-line hand-offs `## → <ada>: <istek>` → gate → child session → parent resumed with the child's Özet. 574 ∥ 575 ∥ 576; 577 last. **Closed 2026-11-08 (D-154)**; follow-ups 580 / 581.*

| ID | Task | Agent | Complexity | Status | Dependencies |
|----|------|-------|-----------|--------|-------------|
| TASK-574 | Bridge chains: `parseHandoffs` on the final assistant text, `FleetGate` lifecycle (pending → allow → child start with `parentId` / `requestId`; child done → parent `send` with the report; deny / error → parent resumed with the reason), caps (`maxChildren`, depth 3, ≤ 2 hand-offs per message / HQ 7, one resume per round), gates persisted + in `snapshot`; one real marketing → design chain for acceptance | devops | M | COMPLETED (D-150) | TASK-568 |
| TASK-575 | Panel chains: gate cards (İzin ver / Reddet) in island list + fleet view, "N kapı" badge, request header + chain strip in the terminal, request grouping in the fleet view, mock chain + pending gate, `F-gate` / `F-chain` dev shots | engine | M | COMPLETED | TASK-569, TASK-572 |
| TASK-576 | Fleet docs: hand-off syntax + mandatory Özet in `fleet/CLAUDE.md`, per-island "kime devreder" lines, FLEET.md "İstek zinciri" | docs | XS | COMPLETED | — |
| TASK-578 | Protocol: `FleetGate` gains optional `round`, `childId`, `report` (the bridge keeps them internal today) so the panel can group a round and open the child from a card; bridge publishes them; `send` on a `waiting` parent → the terminal footer shows "kapı bekliyor" | devops + engine | XS | COMPLETED | TASK-574, TASK-575 |
| TASK-577 | M42 scenario QA: "5 sosyal medya gönderisi" marketing → design (→ coding) end to end on a scratch bridge, panel chain views, budgets / determinism | qa | S | COMPLETED | TASK-574, TASK-575, TASK-576 |
| TASK-580 | M42 QA follow-ups (engine + props): gate cards at 960×540 (cap the gates block to ~45 % of the card and scroll inside, or one collapsed row per extra gate); prompt clamp 3 → full text on hover / expand before deciding; collapsed gate line stays until the parent ends (not 300 s from `answeredAt`); panel `lastLine` Turkish; Esc closes only the topmost of Settings / terminal; gem rim light for same-hue roofs (props) | engine (+ props) | S | COMPLETED (gem rim light → TASK-582) | TASK-577 |
| TASK-581 | Island policy after the first live chain (devops / HQ): per-island `maxTurns` and `allowedTools` review (Design child 21 turns / $0.56, no image because it cannot run shots: give Design a cheap `pnpm shots dev --only=` path or forbid visual deliverables); `;`-chained Bash is denied, say so in `fleet/CLAUDE.md`; a `noGates` flag / `maxChildren: 0` for child sessions that should finish alone; font-load check on dev-server scratch pages (Helvetica instead of Fredoka) | devops | S | COMPLETED | TASK-577 |
| TASK-582 | Beacon gem on same-hue backgrounds (shader): a fresnel / per-instance `uRimLift` term in the life material lifts the gem toward cream at grazing angles (vertex tint multiplies the accent, so geometry alone cannot lighten it; D-155); add a Marketing beacon framing preset to judge red-on-red; wow W5 / W26 stay under 800k tris | shader | S | PENDING | TASK-580 |
| TASK-583 | New-session entry in the panel (engine): a "+" button in the island header and on each fleet-view island block opens the new-session prompt box (before: only a click on a session-less bot figure in 3D did; the user could not find it); empty text points at it | engine | XS | COMPLETED | TASK-569 |
| TASK-584 | M43 admin data (devops): bridge serves the knowledge base read-only over HTTP (`/api/kb/tree`, `/api/kb/file`, `/api/kb/search`; sources `island:<theme>`, `fleet`, `mar-docs`, `hq-memory` from `fleet.config.json → hqMemoryDir`), registered projects in `fleet/projects.json` (`GET/POST /api/projects`, snapshot `projects`, `project` event), `start.project` adds the project dir with `--add-dir` and a "Proje:" prompt header; contract in `src/fleet/protocol.ts` | devops | M | COMPLETED | TASK-583 |
| TASK-585 | M43 admin window (engine): draggable / resizable in-scene window (dock button, `?panel=admin`, Esc precedence), tabs Projeler (project cards with their live / finished sessions, "+ proje" form, "bu projede başlat" → `start.project`), Hafıza / Bilgi / Raporlar (source tree → file list with frontmatter chips and 30-day stale badge → rendered markdown with clickable `[[links]]`), search across all files; mock kb for `?fleet=mock`, shot preset `F-admin`; tiny markdown renderer with tests | engine | L | COMPLETED | TASK-584 |
| TASK-586 | Zoom-in blur (shader): tilt-shift band / blur and the high-tier DOF snap per zoom tier (`setTier` on `uTier`, 10 % hysteresis), so flying in past 80 u / 20 u blurs the focused island; make blur continuous in orbit distance, scale the DOF focus range with distance, keep W1–W4 identical; tunables in `content/lighting.ts` | shader | S | IN PROGRESS (peer session; also carries the user's 2026-11-09 'sharp where you look' requirement from TASK-611) | — |
| TASK-619 | M43 admin follow-ups (devops): `KbHit.line` defined against the body (or `KbDoc.bodyLine0`), search case-fold İ/ı/I, `DELETE /api/projects/:id` + `removed` on the `project` event, gate children inherit the parent's `project`, writable check for project dirs (outside the repo `git status`) | devops | S | PENDING | TASK-585 |
| TASK-630 | Admin window Session'lar tab (engine): every fleet session, filters (status group, island multi-select, project, period, root-only), title-bar search over title / lastLine / agent / island / project / request, sort chips, 60-row pages, click opens the terminal; `admin=sessionlar[:query]`, preset `F-admin-sessions` | engine | M | COMPLETED | TASK-585 |
| TASK-631 | Island pnpm proxy + hook noise (HQ/devops): per-island `package.json` proxies the root scripts (`pnpm typecheck / lint / test / vitest`, `shots` on devops / qa, `fleet:lint` on HQ) so sessions never need `cd` / `pnpm --dir` (the Coding child of the Design tree task was denied both); the cancelled claude-mem SessionEnd hook line is kept in the raw log but hidden from the panel (`isHookNoise`); `fleet/CLAUDE.md` rule | devops | XS | COMPLETED | TASK-581 |
| TASK-632 | Bridge done gate (devops): a session that ends without `## Özet` after ≥ `doneGate.minTurns` turns is sent back once (`--resume`, `nudgeMaxTurns`) for the summary; `system` line in the stream; hand-off parsing and parent resume run once on the final text (Research survey suggestion 2) | devops | S | COMPLETED | TASK-581 |
| TASK-633 | "Seni bekliyor" signal (engine + life): `waiting` sessions pinned to the top of the island / fleet lists with a badge and elapsed counter, bot look-up / amber pulse while a gate is pending (Research suggestion 1; after Phase 5 TASK-591 merges, fleet-panel.ts) | engine | S | PENDING | TASK-591 |
| TASK-634 | Island cost / time counters in the admin window (engine): per-island today / 7-day USD, turns, longest session, long-session warning; a strip on the Session'lar tab (Research suggestion 3; after TASK-630) | engine | S | PENDING | TASK-630 |
| TASK-635 | M50 polish (worldgen): Coding waterfalls lost to the rim delta (before 2, after 0 at T1 — re-score waterfall sites on the final wall height or keep the pre-rim lip for scoring), Coding right-edge mesh steps (`G-coding-t1` x 930–1000), DevOps switchback roads painted 2 cells wide with soft corners (the "camouflage" patches) | worldgen | S | PENDING | TASK-615 |
| TASK-636 | M50 polish (shader): Research lip "smoky" shade band + olive underwater band (blue lean on wet darkening), W-sunken top-left grass teeth, terrain rim visible at T1 (0.32 → tune), Coding wall one step warmer at T0 (reads "charcoal"), per-zone crisp-border weight (streetDevops ↔ rock low); golden-hour water moiré (`G-hq-t2-gold`, `G-research-t2-gold`) → water | shader | S | PENDING | TASK-617 |
| TASK-637 | T0 program count: `G-*-t0-*` frames 15 → 17 programs and +3–4 calls after the 2026-11-09 merges while W1 / W11 stay 15; find the two programs (Phase 5 590 / 591 / 594 / 611 or M51 couriers), decide if the ci / wow budgets need a note | devops | XS | PENDING | — |

### M43 — Knowledge base + HQ review (admin window, fleet/kb, projects, island CLAUDE.md, agent / skill self-generation gated by HQ) — IN PROGRESS (opened 2026-11-09)
### M44 — Reports (daily / weekly / monthly / all-time per island; top topics, long sessions, lessons) — PLANNED
### M50 — Ground Look: ada gövdesi (üst yüzey, bluff duvarları, kıyı) görünüm yükseltmesi — plan `mar-plans/GROUND.md` — CLOSED 2026-11-10 (D-162; polish 635–637 open)

| ID | Task | Agent | Size | Status | Depends |
|---|---|---|---|---|---|
| TASK-612 | M50 referans seti: 4 ada × T0/T1/T2 × öğle/altın `G-*` presetleri, G1–G6 kriter taslağı, "önce" kontak sayfası | qa | S | COMPLETED | — |
| TASK-613 | M50 duvar paleti ve tabakalar (peer Phase 5 TASK-595 strata / scree buraya katlandı): tema başına 3–4 strata tonu, band yüksekliği duvarla ölçeklenir, dudak gölgesi + etek koyuluğu albedo'ya, çatlak tekrarını kıran ikinci ölçek | shader | M | COMPLETED (D-162) | TASK-612 |
| TASK-614 | M50 üst yüzey makro varyasyon: çim yükseklik gradyanı, nem/yıpranma lekeleri, yol kenarı aşınması, çim→kum 4–6 u geçiş | shader | M | PENDING | TASK-612 |
| TASK-615 | M50 silüet ve kenar: kıyı boyunca duvar yüksekliği ±25 %, plato kenarı kaya çıkıntıları, teras basamağı, SDF çim dudağı, etek talus scatter ≤ 2k tris/ada | worldgen | M | COMPLETED (rim delta after sites, outcrops = Zone.rock, talus ≤ 1.4k tris; G5 lip recipe → 614/616) | TASK-612 |
| TASK-616 | M50 kıyı şeridi: ıslak kaya bandı, kum dalgacıkları, şelf devamı, köpük temas hizası + G5 dudak maskesi | shader | S | COMPLETED (wet band 0.9 u + salt line, 2.5 u wet rock below, `seabedShelf`, beach drying; lip = zone flag bit, mask byte-identical) | TASK-613 |
| TASK-617 | M50 ışık ve AO: `TERRAIN_AO` güçlenir (`sandScale` ayrı), terrain rim terimi, duvar gölge tonu, altın saat L ≥ %15, DevOps kül şeritleri, Design çim S | shader | S | COMPLETED (sun rim 0.32, daytime shade floor, rock × 0.5 / bluff-foot AO split, DevOps road colour, Design grass S 57; ash streaks = D12 switchback roads × crisp border → 2-cell soft roads later) | TASK-614 |
| TASK-618 | M50 kapanış QA + belge: "sonra" kontak sayfası, G kriter puanı, ART_BIBLE / ARCHITECTURE / D-162 | qa + docs | S | COMPLETED (4/6 PASS: G2, G5 WEAK → polish 635/636/637) | TASK-613…617 |


### M51 — Kurye gemileri: ada → ada devirler limandan gemiyle gider, ada başına özgün gemi, tıkla → bilgi kartı — DONE (conditional, 2026-11-09, D-164; follow-ups TASK-650)

| ID | Task | Agent | Size | Status | Depends |
|---|---|---|---|---|---|
| TASK-620 | Courier ship factories + content (props): 7 theme ships + crate + report scroll in `src/geo/courier.ts`, specs in `src/content/fleet-ships.ts`, `P-couriers` preset, tri / determinism tests | props | M | COMPLETED (gallery showcase `pnpm exec tsx scripts/gallery-shots.ts couriers`, no `P-couriers` preset in shots.ts) | — |
| TASK-621 | Courier agent kind + voyage FSM (life): one ship per island at its berth, land-safe route (ferry loop or tested Bezier), pure `courierState(gates, sessions, now)` (pending → load, allowed → sail, child done → return with scroll, denied → unload), mock voyage | life | M | COMPLETED (7 ships as 7 InstancedMesh, routes: ferry loop / Bezier / grid A*, F-courier-* dev presets; budgets ok, deterministic) | TASK-620 |
| TASK-622 | Ship picking + info card (engine): click → `mar-fcard` (from → to, request title, prompt, status, İzin ver / Reddet, open child), hover tip, Esc precedence, `F-courier` / `F-courier-card` presets | engine | M | COMPLETED (card follows the ship, Esc via capture listener, `fleetCard` preset field; F-courier-card / -wide) | TASK-621 |
| TASK-623 | M51 QA + docs: shots, budgets, determinism, one real gate on the bridge; ART_BIBLE / ARCHITECTURE / FLEET.md | qa + docs | S | COMPLETED (`mar-docs/qa/m51-couriers-2026-11-09.md`: conditional pass — card / greyscale / determinism / budgets PASS; wake tail, night lantern, deck close-up, pick automation → TASK-650; ART_BIBLE entry pending, file held by a peer) | TASK-622 |
| TASK-650 | M51 follow-ups: wake tail length = sailboats' (life); deck close-up presets `F-courier-deck-*` at ~ladder:40 for loading / outbound / returning so crate + scroll are verified (engine); night mast-lantern halo visible at ~25 px (shader); `?pick=` capture param so the card opens from a ship pick in headless QA (engine); P-couriers gallery sheet black bands + empty 8th cell; ART_BIBLE fleet entry | life + engine + shader | S | PENDING | TASK-623 |


### M52 — Marketing at nalı liman şehri: iki mendirek, rıhtım halkası, restoranlar / dükkânlar, yat marinası (user 2026-11-10: "limanda restorantlar dükkanlar olmalı, marinanın etrafı bir şehir gibi olmalı"; yön B, karnaval iskelesi kanat olarak kalır) — DONE (2026-11-10, D-170; follow-ups TASK-665, wow budget issue from TASK-611 open)

| ID | Task | Agent | Size | Status | Depends |
|---|---|---|---|---|---|
| TASK-660 | Marina town kit (props): quay houses × 6 (restaurant / café / bakery / gelato / souvenir / chandlery, awning + sign + lit windows), terraces × 3, stalls × 3, moored boats × 4, finger pontoon, mole tower; values of `content/themes/marketing-marina.ts` (`MARINA_KIT`), gallery sheet, tri / determinism tests | props | M | COMPLETED (3 defs: `quayHouse` × 7 incl. tower, `quayFurnish` × 6, `quayBoat` × 5 incl. pontoon; gallery `pnpm exec tsx scripts/gallery-shots.ts quay`; open: worst case +36 calls, furnish is tier 2, LOD1 houses lose the sign, night windows unseen) | — |
| TASK-661 | Horseshoe harbour plan (worldgen): second mole, quay ring at one level around the basin, house rows on the ring facing the water, terraces on the edge, boats stern-to, pontoons, tower on the second mole head; Carnival Pier, ferry berth and courier berth anchors kept; `marina*` anchors; 32-seed fit test; world hash re-pin | worldgen | L | COMPLETED (seed 1001: 28 u basin, 8 u ring, 16 houses, 8 terraces, 3 stalls, 10 boats, mouth 7.5 u; 32 / 32 seeds full; hashes re-pinned; `wow --assert` 55 / 55; Carnival deck moved to the pier's other side → cams in TASK-663; open: fallback branches untested by the sweep) | — (reads `MARINA_KIT` keys) |
| TASK-662 | Marina life + night (life): quay strollers / diners at the terraces, lit windows and lantern pools on the ring, moored-boat bob | life | S | COMPLETED (medium: 5 strollers, 9 diners at the terraces, 2 vendors; night lantern pools for `quayHouse` / `quayFurnish`; 0 draw calls added in the marina cams; `content/life-marina.ts`) | TASK-660, TASK-661 |
| TASK-663 | M52 shots + QA + docs: `W-marina-day` / `-dusk` / `-night` + `D-marina-*` presets, budgets, determinism, ART_BIBLE island row + wow rows, D-170 | qa + docs | S | COMPLETED (presets `W-horseshoe-*` / `D-horseshoe-*` + Carnival cams re-framed; presets reviewed by the orchestrator, no separate `qa` agent run; `W-marina-*` is HQ's; wow budget failure from TASK-611 open) | TASK-661 |
| TASK-664 | Quay reads as stone, not sand (paved deck, coping band, stone face) + `harbourCalmMask` covers the `marinaBasin` disc (no foam V in the basin) | shader | S | COMPLETED (ground-art `MARINA_QUAY` in the terrain program, no new program / texture / draw call; `harbourCalmMask` 0–255 over the basin, fading through the mouth; hashes unchanged) | TASK-661 |
| TASK-665 | M52 follow-ups: basin face as a 2–3 u sloped bank (needs geometry on a 2 u grid), mole outline sawtooth from low sea views, dev frames with the Rock campus behind over budget (`D-horseshoe-row` 369, `D-carnival-deck` 367), `quayFurnish` tier 2, diners 1.7× bot size beside 0.74 u tables, no mast-head lights on moored boats, house windows dark 23:00–23:40 (`quayHouse` not in `NIGHT.alwaysOn`), stall-front anchors for a browsing pose, fallback branches of the fit untested by the sweep, low quality shows at most 4 town bots | props + worldgen + life | S | PENDING | TASK-660, TASK-661, TASK-662 |


| TASK-666 | M52 düzeltmesi: Horseshoe Harbour Marketing'den HQ adasına taşınır (HQ koyundaki M29 tarak iskeleleri / yatları / tarak mendireği kalkar, yıldız kale ve kanal şamandıraları kalır); Marketing M52 öncesi kollu limana + Carnival Pier'e döner; 32 seed fit tablosu HQ için; world hash re-pin (user 2026-11-10: "hq adasına bu tasarımı uyguladığımızı sanıyordum", D-171) | worldgen | L | COMPLETED (seed 1001: ring 37 u west of the pier root beside the Compass Plaza, 16 houses / 8 terraces / 3 stalls / 10 boats; fit 31 / 32, seed 1526 falls back to the comb marina; fort re-sited at the cove mouth; hashes re-pinned; Marketing hashes equal pre-TASK-661) | TASK-661 |
| TASK-667 | Horseshoe kit'i ve rıhtım zemini HQ paletinde (`MARINA_LOOK`, `MARINA_QUAY`); geometri / sayılar aynı (D-171) | props | S | COMPLETED (`WALL_STRATA.hq`, HQ coral / salmon roofs, harbour blue kept; calls unchanged) | TASK-660, TASK-664 |
| TASK-668 | Taşıma sonrası: dosya adları `marketing-marina*` → `hq-horseshoe*`, `W-marina-*` / `D-marina-*` / `W-horseshoe-*` kadrajları, yaşam sayıları kontrolü, `wow --assert`, ART_BIBLE HQ + Beacon Rock satırları, D-171 | orchestrator + docs | S | COMPLETED (files `hq-horseshoe*`; Carnival cams back to pre-TASK-663; `W-marina-dusk` retired; open: `D-marina-*` dev cams, HQ town life check) | TASK-666, TASK-667 |
| TASK-674 | HQ limanı yeniden: batıdaki halka yarımadası kalkar, kasaba adanın kendi hilal koyuna "açık hilal rıhtım" olarak oturur (mendirek ve kapalı havuz yok; rıhtım + ev sırası doğal kıyıyı izler, feribot iskelesi yerinde, fener kuzey boynuzda, kule güney boynuzda, kale koy ağzında); yeni `marina*` anchor kontratı; 32 seed tablosu; hash re-pin (user 2026-11-10: "zaten adanın aynı şekilde bir hilal kıyısı var o kıyıya gelmeli", çizim B, D-173) | worldgen | L | IN PROGRESS | TASK-666 |
| TASK-675 | Açık hilal rıhtımın zemin boyası (ground-art halka yerine kıyı çizgisinden), koy için calm mask | shader | S | PENDING | TASK-674 |
| TASK-676 | Kasaba yaşamı + çekimler yeni kontrata: `marina-world` gezinti hattı, `W-horseshoe-*` / `D-marina-*` kadrajları, `wow --assert`, ART_BIBLE, D-173 | life + orchestrator | S | PENDING | TASK-674 |

### M53 — Marketing "Deniz Üstü Lunapark": Carnival Pier genişler (user 2026-11-10: "marketing adasının limanını lunapark olanı genişletelim ve detaylar ekleyelim"; yön B: kazıklar üstünde halka platform, dört alet, mini coaster, iç havuzda çarpışan tekneler; D-172)

| ID | Task | Agent | Complexity | Status | Dependencies |
|---|---|---|---|---|---|
| TASK-670 | Lunapark kit'i (props): halka platform güvertesi, zincirli salıncak, düşüş kulesi, atlıkarınca, büyük dönme dolap, mini coaster rayı + tren, çarpışan tekneler, neon kapı, bilet gişesi, yiyecek arabaları × 3, ödül standı, küçük mobilya; kontrat `content/themes/marketing-luna.ts` (`LUNA_KIT`); hareketli parçalar ayrı pivotlu; hedef ≤ +25 call / +120k tri | props | L | COMPLETED (6 defs + 5 mover geos, `lunaLayout`; ≈ 21k tris, ≈ 20–26 calls by accounting, unmeasured in a world; gallery `pnpm exec tsx scripts/gallery-shots.ts luna [--night]`) | — |
| TASK-671 | Lunapark yerleşimi (worldgen): feribot iskelesi yanında halka platform, alet köşeleri, coaster halkası, iç havuz, tekne rotası keep-out; WELCOME panosu / kemerler / konfeti topları korunur; `luna*` anchor'ları; hash re-pin | worldgen | M | COMPLETED (32 / 32 seed M platform 36 × 26 u, T-baştan 4–8 u geçit; `carnivalDeck` = platform merkezi; parti pontonu 4 / 32 seed; platform altı −1 u dolgu, kurye testi ≤ 8 sığ örnek; S ve küçük güverte dalları dünyada denenmedi) | TASK-666, TASK-670 |
| TASK-672 | Lunapark hareketi + yaşam: salıncak / atlıkarınca / kule / tren mover'ları, çarpışan tekneler, gezen botlar, gece ampul ve neon | life | M | COMPLETED (`content/life-luna.ts`, `life/luna-motion.ts`, `render/luna-movers.ts`; 10 instanced mover, gölgesiz, +10 call; ziyaretçi 4 / 8 / 12 Workers tableau slot'u; aletler gece de döner, ziyaretçiler 10:00–01:30) | TASK-670, TASK-671 |
| TASK-673 | M53 çekimleri + QA + belgeler: `W-luna-*` / `D-luna-*` preset'leri, Carnival kadrajları, bütçe, ART_BIBLE, D-172 | qa + docs | S | COMPLETED (Carnival kadrajları tüm parka: noon 300 call / 691k, dusk 327 / 748k, arrival 232 / 650k; ayrı `qa` agent koşusu ve tam `wow --assert` yapılmadı; açık: dusk 330 sınırına 3 call, salıncak koltukları / atlıkarınca atları ayrı geo, `lunaDeck` aynalanamıyor) | TASK-672 |

## Phase 5: Visual upgrade — richer surfaces, prop variety, agent identity, high tier (plan `mar-plans/VISUAL_UPGRADE.md`, details `phases/phase-5.md`, budget D-156)

### M45 — Agent identity and portrait

| ID | Task | Agent | Complexity | Status | Dependencies |
|----|------|-------|-----------|--------|-------------|
| TASK-590 | Bot chassis (scout / hauler / spire) + head (monitor / visor / cam) variants, each chassis its own InstancedMesh, role → carried item, eye states (idle / working / gate / error / done) from `botLook(seed)`; `F-bots` dev shot | life | M | COMPLETED (D-157; open: line-up shot, swap pop) | — |
| TASK-591 | Panel portraits: `botPortraitSvg(look)` on session rows, terminal header, fleet chips, hover tip; mock covers 3 × 3 looks × 5 states; `F-portraits` dev shot | engine | S | COMPLETED (D-158; open: tip gate flag in app.ts, 20 px head legibility) | — (reads `content/bot-look.ts`) |
| TASK-592 | Bot motion variety: per-chassis gait, four idle beats, gate look-up + amber gem pulse, done hop + sparkles; FIRST a deterministic bot line-up (`F-bot-lineup`: all 9 looks × 5 eye states on the Coding plaza, `?bots=lineup`) so QA can see them; chassis swap squash / poof | life | S | PENDING | TASK-590 |
| TASK-611 | Detail reveal: earlier and continuous (user 2026-11-09: "çok yaklaşmam gerekiyor detayların netleşmesi için, o kısım smooth olmalı"). Tier-2 / tier-3 prop reveal moves out (`TIER_FADE` 2: 120–160 → ~200–260 u, 3: 40–55 → ~70–95 u) with wide dither cross-fades instead of a band pop; the tilt-shift sharp band follows the orbit target and widens so the focused island is never blurred at T1–T2; high DOF focus range scales with distance; budgets re-measured (more LOD0 in view). Composer / tilt-shift side moved to TASK-586 (peer session); 611 = prop reveal bands + cross-fade + flip-book only | engine | S | COMPLETED (D-161; bands T2 200–260, T3 70–95, LOD hand-over 200–260; low budgets 176 / 390k / 82 MB; open: dither `1 - bayer` cross-fade, camera.ts ladder pairs 260 / 200 / 95 / 55, W16 327 / 330, W27 QA) | — |
| TASK-652 | wow budgets green after TASK-611 (W15c 423, W15e 343, W16 341, W-marina-dusk 337 calls vs 330): per-frame shadow-pass skip for prop / terrain meshes whose swept shadow misses the view (`render/shadow-skip.ts`, `SHADOW_CULL`), LOD0 groups past 187.5 u leave their shadow to LOD1 at T0–T1 (`lod1CastsPast`), `NEAR_MERGE.maxVertsShadowed` 2000 on medium / high; budgets and fade bands unchanged | engine | M | COMPLETED (D-165; wow 59 / 59, peak 320 calls W15c / W16, 850k tris, 189 MB; ci 4 / 4; open: low ladder L-pairs-hq / -marketing 83–84 MB > 82 on main before and after, qa to judge LOD1-shaped far shadows in D-reveal-260 / -200) | TASK-611 |
| TASK-651 | Land life follows the reveal band (user 2026-11-10: "adanın detaylarını görebilmem için çok yaklaşmam gerekiyor"): the orbit tier only arms a land kind one tier ahead, each villager / cat / sheep / duck appears by camera distance on `TIER_FADE[2]` (none past 260 u, all by 200 u; crabs on the tier-3 band), `LAND.revealHysteresis` 6 u; workers wake at T1 (`ACTIVITY.focus.minTier` 1). Sim state stays camera-independent. The first attempt (FSM boundaries 140 → 210 / 45 → 68) was dropped: it stacks on TASK-611 | life | S | COMPLETED (D-165 addendum; medium drawCalls 330 → 350, low gpuMemoryMB 82 → 86 by user decision; wow subset 10 / 10, peak W15e 340 calls; low L-pairs hq / devops / research pass; open: L-pairs-marketing low 189 / 184 calls > 176 and pair-45 blob 0.6 %, same on main before the merge, from M53) | TASK-652 |
| TASK-593 | M45 QA: portraits vs 3D bots, F-* shots, wow budgets W5 / W26 / W-morning-shift / W-funicular-dawn, low ladder | qa | S | PENDING | TASK-590, TASK-591, TASK-592 |

### M46 — Surface quality

| ID | Task | Agent | Complexity | Status | Dependencies |
|----|------|-------|-----------|--------|-------------|
| TASK-594 | Material classes (matte / wood / metal / glass / fabric) in the free `emissive` code range, per-class specular / fresnel / edge light, `fwidth` bevel edge light + triplanar near grain (60 → 140 u fade), same programs | shader | M | COMPLETED (D-159; crease bake instead of fwidth; buildings untagged) | — |
| TASK-595 | Terrain detail: cliff strata bands, scree speckles, moss creep, wet sand glint, path edge wear (terrain program) | shader | S | FOLDED INTO TASK-613 / 614 (M50 Ground Look, peer session) | TASK-594 |
| TASK-596 | Water: shallow caustics (terrain underwater term, day-gated), sun glitter sparkle, second foam band | shader | S | PENDING | TASK-594 |
| TASK-597 | M46 QA: before / after on 8 wow ids, ladder, low ladder, programs, `wow --assert` | qa | S | PENDING | TASK-595, TASK-596 |

### M47 — Prop variety

| ID | Task | Agent | Complexity | Status | Dependencies |
|----|------|-------|-----------|--------|-------------|
| TASK-598 | Building variants v2: roof style × window layout × door × trims, `variants` 3 → 8, LOD1 silhouette kept, LOD0 tris ≤ ×1.25; gallery `buildings` | props | M | COMPLETED (D-160) | — |
| TASK-599 | Vegetation + rock v2: 3 canopy silhouettes, per-island colour sets (`content/biomes.ts`), palm variants, 5 rock silhouettes + moss / strata, driftwood, kelp; far blobs follow the biome colour | props | M | PENDING | — |
| TASK-600 | Biome scatter rules: per-island variant weights, rock fields, flower meadow patches, path edges, lot hedges, garden plots; one world hash re-pin | worldgen | M | PENDING | TASK-598, TASK-599 |
| TASK-601 | Boats + dock dressing v2: 3 hulls, per-island sail / hull sets, net / lobster pot / rope / ladder, buoy variants | props | S | PENDING | TASK-598 |
| TASK-602 | M47 QA | qa | S | PENDING | TASK-600, TASK-601 |

### M48 — Island detail layer

| ID | Task | Agent | Complexity | Status | Dependencies |
|----|------|-------|-----------|--------|-------------|
| TASK-603 | Coast micro-landscapes per archetype: arch / stack clusters, tide-pool fields, dune ridges, kelp beds, cliff ledges, waterfall foot pools; one hash re-pin | worldgen | M | PENDING | TASK-600 |
| TASK-604 | Coast kit geometry: rockArch, tidePoolField, duneGrass, kelp (wind + water tint), ledgeShrub | props + shader | S | PENDING | — |
| TASK-605 | M48 QA | qa | S | PENDING | TASK-603, TASK-604 |

### M49 — High tier render

| ID | Task | Agent | Complexity | Status | Dependencies |
|----|------|-------|-----------|--------|-------------|
| TASK-606 | High only: SSAO / GTAO pass + PCF soft shadows; medium wow pixel-identical; high programs ≤ 30 | shader | M | PENDING | TASK-594 |
| TASK-607 | `wow-high` set (`--quality=high --tag=high`) with `BUDGETS.high` assert, tier in the stats overlay, CI report-only | devops + engine | S | PENDING | TASK-606 |
| TASK-608 | Sky + clouds v2: 3 cloud archetypes two-tone + rim (medium +≤ 2 calls), sun disc + halo, moon phases, star density, dusk god rays (high) | shader | M | PENDING | TASK-606 |
| TASK-609 | M49 QA | qa | S | PENDING | TASK-607, TASK-608 |
| TASK-610 | Docs: ART_BIBLE §5 / §7 / §11 rows, ARCHITECTURE §8 table, FLEET.md bot identity, MEMORY handoff | docs | XS | PENDING | per milestone |
