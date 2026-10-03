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
| TASK-162 | Picking, hover, reactions, reduced motion | life | M | IN_PROGRESS | TASK-161 |

### M8 — Day/night & weather
*Time ladder × weather*

| ID | Task | Agent | Complexity | Status | Dependencies |
|----|------|-------|-----------|--------|-------------|
| TASK-171 | EnvState, sky bodies, night emissives, beam | shader | M | COMPLETED | TASK-104, TASK-132 |
| TASK-172 | Weather FSM, rain, ripples, mist | shader | M | IN_PROGRESS | TASK-171 |

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
| TASK-191 | Governor, prewarm, context-loss regen, `perf=1` | engine | M | PENDING | all Phase 1 |
| TASK-192 | 10-seed sweep; user checks M1 60 fps / phone 30 fps | qa | M | PENDING | TASK-191 |
| TASK-193 | README, MEMORY gotchas | docs | S | PENDING | TASK-192 |

## Phase 2: Sandbox (sketch)

- **Edit commands** (`world/edit.ts`): terrain brushes (raise/lower/flatten/smooth/paint) and prop add/remove/move; each has an inverse (undo/redo) and marks dirty chunks.
- **Dirty chunk rebuild** within one frame: remesh the chunk, `texSubImage2D` the height texture, run a local EDT, rewrite the affected PropBatcher groups.
- **Ghost previews**: OccupancyGrid validates placement; previews dither in.
- **Save & share**: seed + versioned edit log (deterministic replay), stored in localStorage and shareable by URL.
