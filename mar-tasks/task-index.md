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

### M23 — Dünya İmza (world signature)
*D-064 (whale; constellations + fireworks), D-058 (K3 underwater sills). WORLD_PLAN §5 row 3, items in `mar-plans/study/world.md`. Starts after TASK-485…487 merge. Wave 1: 488 ∥ 489 ∥ 490; wave 2: 491; then 492 QA.*

| ID | Task | Agent | Complexity | Status | Dependencies |
|----|------|-------|------------|--------|--------------|
| TASK-488 | Reef shoals + shared shelves (`W:D1` + `W:K3`): 3–6 seabed patches at −2…−6 u in the deep gaps, sills (−3 u, never above water) between neighbours < 55 u with a deep boat gap; shoal tint + foam on the water shader (sdf contribution or separate depth tint, 0 programs) | worldgen | M | COMPLETED (1f1f371; D-067; shoal edges a bit crenellated at T0) | TASK-485 |
| TASK-489 | Whale (`W:D6`): 14 u grey whale mover (not an agent) in a deep channel, closed-form surfacing every 90–150 s (seeded phase): back + spout puffs 6 s, tail slap, dive; passes the Research cape at 17:45; click = tail + splash; ≥ 20 u from boat polylines, outside the reefs; `fadeNear` at T2 | life | M | COMPLETED (dea87ce; D-070; W28, W28b; T0 read weak — cape pass at overview bottom edge, body reads lens-like from above) | TASK-488 (route) |
| TASK-490 | Relay night scene (`W:B1` + `W:B6` + `W:G7`): 2–3 mini beacons on skerries + Marketing lighthouse sweep in route order (1 s offsets) 18:30–06:30; signal lamps on each island's top relay the 21:00 flashes to the next island; 22:01 fireworks from HQ harbour (6 bursts, culture accents, water reflection; off in rain) | props | M | COMPLETED (b4a9a95, 104962b; D-069; W15b–W15e) | TASK-469, TASK-472 |
| TASK-491 | Culture constellations (`W:G4`): 7 glyph constellations (6–9 bright stars, lines alpha ≤ 0.15) in the sky above each island, 21:00–04:00, lines brighten on Comet Night | shader | S | COMPLETED (d7b0a13; D-071; W27; glyphs not in existing night frames — no sky in them) | TASK-486 |
| TASK-492 | M23 QA: wow `--assert` + new shots (whale postcard, relay wave W15b, fireworks), ladder low + medium, QA report | qa | S | TODO | TASK-488…491 |
| TASK-493 | Glasshouse row pop: the six tier-2 glasshouses (`props-themes/m20.ts`, each < 3 u) are absent at 170 u and appear together at the 140 u boundary — move the row to T1 or give the group effective tier 0 (D-031), within the tier-1 cap and budget; then the Design ladder target can move to the row (−8, −28) | props | S | TODO | TASK-487 |

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
