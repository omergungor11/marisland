# Project Memory

## Project Info
- Marisland: procedurally generated cute/cozy stylized archipelago in three.js (WebGL2), 5–7
  islands, zoom-revealed detail, living ambient life. Phase 1 diorama, Phase 2 sandbox building.

## Project Status
- **Planning**: COMPLETED 2026-10-03 — ARCHITECTURE.md, ART_BIBLE.md, skills, agents, PROMPT.md
- **Phase 0**: COMPLETED 2026-10-03 — CI + Pages deploy green on first push
- **Phase 1**: M1 in progress (terrain, water done; lighting/post landing), M2 worldgen in progress, M3 batcher/scatter done early

## Where I left off
- **2026-10-28 (TASK-513, obsidian black-sand cove; D-098)**: `planCove` / `carveCove` / `placeObsidian` in
  `world/gen/plans/devops-m26.ts` (plan time: reserve + path block; `finish`: carve, repaint, decor), numbers
  `DEVOPS_M26_SITE.obsidian.cove`. Anchors `obsidianCove` (floor origin, rotY out to sea) + `obsidianCoveSize`
  ({x: width, z: back depth}). Shots (seed 1001): `pnpm shots dev --only=D-obsidian-cove,D-m26-obsidian,D-lava-fall`.
  Cove 27 / 29 anchor seeds (3367, 6523: the D13 quarry rect sits on the floor at every slide / depth).
- **2026-10-28 (TASK-518, M27 placed + moving; D-097)**: kit on the anchors in `world/gen/plans/marketing-m27.ts`
  (Marketing `finish`, after `reserveBeaconAnchors`), loop model `world/cable-car.ts`, gondolas
  `render/beacon-lines.ts` (via `createMovers().beacon`), cable spans = `createMailCables(..., loops).beacon`,
  diver = `diverScene` in `render/culture-movers.ts`, ON AIR = `SURFACE.neon` + `NEON_SEQ`. Numbers
  `content/themes/marketing-m27-site.ts`. Shots (seed 2024): `pnpm shots dev --only=D-m27-cable,D-m27-gondola,
  D-m27-onair-night,D-m27-onair-seq,D-m27-dive,D-m27-dive-splash,D-m27-billboard`, wow `W-cable-dusk`, `W-on-air-rock`.
  - **Reconciled:** seat 9.45 over every pivot, hang 2.5 (the built pylon / gondola); `MARKETING_ANCHORS` reads
    `MARKETING_M27`. The v4 pylon was rebuilt (crossarm over the cable, sheaves at ±1.25): as built a cabin went
    through the lattice. Line = loop of two tracks (`beaconTracks`), v7 = terminal (bullwheel + landing).
  - **Gotchas:** the diver phase is `phaseAt(x, z, 0x0d17)`: seed 2024's diver stands on the board tip at simt
    ~27.5, flies at ~29, splashes at ~30.9 (frames 0.5 s off miss it). Stack tops are 2–3.8 u: a real pylon +
    a guyed mast rarely fit together (transmitter 16 / 22 three-stack seeds, was 21 with 0.8 u discs), the dive
    tower drops to 0.75 scale on 4 / 27. All M22 v1 stack masts are gone (every stack carries a piece); the
    pylon finials blink instead. A separate merged cable mesh is needed for any mailLine-variant cable seen
    past ~120 u (the def is tier 2). The culture-movers keeper test now ignores keepers within 12 u of a dive tower.
- **2026-10-28 (TASK-517, M27 Marketing props; D-096)**: geometry `geo/themes/marketing-m27.ts`, numbers
  `content/themes/marketing-m27.ts` (`MARKETING_M27`), def `content/props-themes/marketing-m27.ts`. Gallery:
  `pnpm exec tsx scripts/gallery-shots.ts marketing27` (shots/gallery-marketing27, per-variant `*-vN-close`). **For TASK-518:**
  - **Defs / variants** (all pinned, never rolled): `mailLine` v4 sea pylon, v5 gondola red, v6 gondola cream; `billboardV2`
    v2 sea billboard, v3 ON AIR neon (NOT `marqueeSign` v3: the batcher fixes a def's tier once from the first variant it
    builds, so a 9 u sign on tier-2 `marqueeSign` would vanish beyond ~160 u or drag every boulevard sign to T0);
    `antennaTower` v2 guyed transmitter; new def `diveTower` (tier 2, drawn from T0 by size, last in PROP_DEFS, Marketing
    ledger 11 / cap override 11; add its radius in `FIXTURE_RADIUS` = 1.6, already there).
  - **Frames** (local, front = +z, rotY as the other fixtures): pylon crossarm along z, cable `anchor` front (z +0.8) /
    `back` (z -0.8) at y 9.45, boarding `landing { at, size, y 6.95 }` on +x beside the line (gondola floor = anchorY -
    grip = 6.95); gondola pivot = cabin floor, `gondola { grip [0,2.5,0] (wheel centre on the cable), pivot [0,2.32,0]
    (hanger pin: swing about it), axis [0,0,1] (the cable), swingDeg 3, floor [0,0,0] }`, `lamps.list` roof bulbs; sea
    billboard stands at z 0, rock face plane z = -1.15 (`mount { face, normal, reach }`, `screen` = the SURFACE.slides rect,
    6 x 3 at y 3.05); ON AIR rock plane z = -1.0, `letters.list` = [{ index 0..4 top to bottom, char, first, count (vertex
    range of the lit strokes), center, size, slot }], `glow { slotBase 1, slotStep 0.01 }`, `size`, `mount`; dive tower:
    deck y 5, board runs +z, `board { tip [0,5.39,3], from, len }`, `ladder { foot (on the ground, z -1.28), top }`,
    `splash { dir [0,0,1], ahead 3.2 }` (add the stack height + deck for the drop), `deck`, `flag`, `lamps`; guyed mast:
    `lamp { at [0,9.75,0], r }` (beacon-tagged at LOD0, SURFACE.beacon), `guys { eyes, radius 2.1 }` (3 eye blocks, keep
    2.5 u of rock around the pivot, or the guys hang over the sea).
  - **Letter sequence**: letters are separate vertex ranges and separate emissive values (1.00, 1.01 ... 1.04), but the lit
    shader stagger is per INSTANCE (origin hash), so sequenced switch-on needs shader / tag work: a new `SURFACE` kind must
    be added with its branch in `CULTURE_SURFACE` (kinds above `beacon` currently fall into the beacon branch). Option
    without new tags: `tagRange(g, {first, count}, [k, 5, 0, -kind])` per letter.
  - **Gotchas**: `mailLinePairs` skips variants >= 2 (the cable car never pairs as an HQ mail line); `oreLines` only takes
    v2 / v3; `buildOreCable` / `buildMailCable` work for sea spans (parabola, sag clamp 1.6 u; the cable car needs a
    rope-free steel cable: `buildOreCable` is the one without flags). The gallery row spacing now uses the widest variant.
    `transmitterMast(o, T?, extras?)` is the shared builder of antennaTower v1 / v2.
  - **Gondolas are movers, never store props**: `mailLine`'s effective tier comes from its first-seen variant (pylons are
    large, so the def is T0); a 2.65 u gondola in the PropStore seen first would turn the whole def tier 2. Build the mover
    mesh with `buildProp('mailLine', seed, 5 | 6, lod)` (culture-m20.test pins v5 / v6 as not large).
- **2026-10-28 (TASK-516, M27 Beacon Rock anchors; D-095)**: `world/gen/plans/marketing-anchors.ts` runs in the
  Marketing plan's `finish`; numbers `content/themes/marketing-anchors.ts`. Contract in D-095 / the module header.
  **For TASK-517 (props):** the line assumes cable seats 6.5 u over the station pivots and 7.5 u over a mid pylon
  (pivot = ground), gondola floor 2.2 u under the cable; footprints: summit station r 2, far station r 1.5, mid pylon
  r 0.8, transmitter r 0.8, dive platform r 1.0 (top 5 u over the stack top). Mid pylons are **angle stations** (the
  line turns 1–115°, median 76°): the head must read from any side. The billboard hangs on a stack face (width 3–7,
  height 3–6, face up to 2.4 u behind the plane: give it struts / a back frame); the neon column is 2–4 u wide.
  **For TASK-518 (placement):** read the anchors, never re-search; `beaconCable(isl)` = seats, `cablePoint` = curve
  (same parabola as mailCablePoint), turns at mid pylons need a pause / corner like the funicular zig-zags. The
  M22 quick-win transmitter (`antennaTower` v1) still stands on EVERY stack's highest cell: drop it on stacks that
  carry an M27 pylon / station / dive tower and put the M27 transmitter on the `transmitter` anchor (2-stack seeds
  have none). If the diver / gondolas need more clearance, change `MARKETING_ANCHORS` (tests read it). Anchors may
  carry `y` now (optional field on `IslandData.anchors`).
  - **Gotchas:** measuring cliff faces before `applyPads` is wrong (the tower pad bulges the lip). A boat-route
    keep-out anywhere re-routes the global tours (seed 7312's breakwater bound widened). The minimap
    (`world/debug/minimap.ts`) is the only anchor overlay (no 3D one), so no dev shot was added.
- **2026-10-28 (TASK-509c, M26 placed + moving; D-093; TASK-509 done)**: `world/gen/plans/devops-m26.ts` (after `placeM25`;
  `finish` after the funicular, before the road lanterns), numbers `content/themes/devops-m26-site.ts`. Lava bed =
  `world.fences` kind `'lava'` + `levels` (render reads it through `lavaFlows`); ONE emberBridge per island, planned
  (bed blocked for paths except under the deck, both ends linked), pivot in the new `FixtureData.y`; deck slides ≤ 1 u
  + late earthworks (no pad); kiln rect pad by the lane; obsidian decor on the shelf / bluff; breakwater where its foot
  is buried, boat routes kept 5.5 u off it (`breakwaterKeepOut`); tug drawn in `render/movers.ts`, escorting cargo ship
  0 (`harbour-routes.ts tugPose`), smoke + kiln glow in `render/culture-movers.ts`. Shots:
  `pnpm shots dev --only=D-m26-bridge,D-m26-bridge-night,D-m26-deck,D-m26-kiln-night,D-m26-obsidian,D-m26-tug` (seed
  1001 raw cams), wow `W-lava-river-dusk`; the 509a lava cams did not need re-aiming (anchors unchanged).
  - **Gotchas:** existing paths crossed the channel only high on the cone with banks 3.5–6.5 u apart: a level bridge only
    fits on the apron, so plan it and block the bed (never bridge where a path happens to cross). The groundWriter skips
    cells within 1.2 u of any non-own shape: the bridge rect must be "own" for the lava carve or the bed stays unscooped
    under the arch. A pad near the funicular top station bends its rail (test "pivots off the ground" ≤ 6 %): the deck has
    late earthworks only. The DevOps cargo-ship stadium (`pierLoop`, 40 × 18 u off the pier head) owns the harbour water:
    any other boat path there crosses it; escort on the same closed form instead. The DevOps island's tableau cap (6
    bots) is full: a 2-bot story spot appended last is skipped, so the deck has one stargazer.
  - **Open (509a nits, content-only tuning partly done):** delta steam puffs made smaller (`PUFFS.delta` size 0.8–3.0,
    rise 6); the delta bullseye and the abrupt channel start were fixed in TASK-514 (D-091 bullet). The
    obsidian "beach" is still the bluff (no cove carve).
- **2026-10-28 (TASK-509b, M26 props; D-092)**: defs at the tail of `PROP_DEFS` (`content/props-themes/devops-m26.ts`,
  geometry `geo/themes/devops-m26.ts`, numbers `content/themes/devops-m26.ts`): `emberBridge` v0 foot / v1 rail,
  `craterDeck`, `glassKiln`, `obsidianShard` v0 cluster / v1 stack / v2 pool slab / v3 cairn, `devopsBreakwater` v0 8 u /
  v1 5 u / v2 head; tug = `sailboat` v9. Gallery: `pnpm exec tsx scripts/gallery-shots.ts devops26`. **For TASK-509c:**
  - **Frames** (rotY = the anchor heading, apply as the other fixtures do): bridge spans local **z** (9 u long, clear
    span 3.6 u, deck top y 1.0 + 0.1 over the bank; the lava runs along x under the arch; body skirt 0.5 below the pivot;
    v1 carries a track along z, gauge 1.1 = `railTrack`, hook `track { from, to, y, gauge }`); deck front (crater side)
    = **+z**, entry steps at -z, floor y 0.62, r 2.3 (fits the 2.5 disc), skirt 0.6; kiln front (mouth) = **+z**, pivot
    between kiln and rack (x -3.2..+3.2), 3.8 u deep; breakwater runs along **z**, pivot at the waterline, centred, foot
    -2.6, v2's round end + light at +z; shards / stack are rotationally free.
  - **Hooks** (`g.userData.hooks`): bridge `span`, `channel { halfWidth 1.5 }`, `lamps.list`, v1 `track`; deck `view`,
    `seats.list` (two seat tops: the "couple looking in"), `scope { at, dir }`, `lamps.list`, `entry`, `floor`; kiln
    `mouth { at, size }`, `smoke` = `chimney { at }`, `lamps.list` (6 hung rack lanterns, flare at night), `front`;
    obsidian v2 `pool`; breakwater `crest`, v2 `light { at }` / `end`; tug `smoke`, `tow`, `bow`, `lamp`,
    `route { speed 1.8, lead 7 }`.
  - **Tug route**: sailboat variant 9 (`DEVOPS_M26.tug.variant`), no CULTURE_BOATS entry yet: add one next to
    `ferry` / `patrol` (`content/life.ts`) and a leading / escorting lane in front of the cargo ship; `sailboatGeometry`
    (`life/boats.ts`) already builds any sailboat variant, `sailboat` stays in FLOATING_FIXTURES.
  - **Placement**: bridge has no `BANK_FIXTURES` entry (glassBridge's axis is x, this one z); ground both abutments
    yourself. Lava strip 3 + 2 x 1.5 u (`devops-growth.ts`) vs the 9 u bridge: the bridge reaches 3 u past the strip on
    both sides, the abutments need a level pad. `craterDeck` / `glassKiln` / `devopsBreakwater` are large structures
    (T0 draw, +3 far groups); bridge / shards are not.
  - **Not covered**: no night-time render of the new props (the gallery has no lamps ramp); judge the 1.6 seams / mouth glow
    in the placed night shot.
- **2026-10-28 (TASK-509a, lava shader; D-091)**: river painted by the terrain program, fall on the waterfall ribbon.
  - **API for TASK-509c:** everything reads `lavaFlows(world)` in `render/lava.ts` → `{ islandId, channel: XZ[]
    (notch → lip), fall: { x, z, rotY } | null }[]`. Today it reads the D-083 anchors; 509c replaces only that body
    (e.g. from its placed / carved channel). The terrain packs the FIRST flow (≤ 24 points, ground y sampled from
    the heightfield when the material is built, so a carve before render is picked up); `lavaFalls(world)`
    (`render/waterfalls.ts`) makes the ribbon (base = first sea cell ≤ 16 u along rotY, else no fall). Numbers:
    `content/lava.ts` (`LAVA`), steam `PUFFS.delta`. Shots: `pnpm shots dev --only=D-lava-channel,D-lava-channel-night,D-lava-fall,D-lava-fall-night`.
  - **Gotchas:** the strip paints only within ± 3 u of the polyline's ground y (`heightBand`), so a deep carve
    must keep the samples on the bed. The lip anchor sits ON the wall face (y ≈ 3, top ≈ 6.5), hence the 4 u
    `fall.inland`. Sheet modes: 0 water, 1 foam disc, 2 lava sheet, 3 lava delta (`aSpin.z`). Puff shader kind 2.25 =
    soft steam lit by the lava at night. The waterfall GLSL pin cuts out `LAVA_SURFACE_PRE` like the culture pre.
- **2026-10-28 (TASK-512, wow presets)**: `W-kite-hill-afternoon` (14:00 +20 s), `W-proving-grounds-noon` (12:00 +3 s),
  `W-fairy-night` (22:00 +4 s; the Coding fairy-light grove + hammock nappers: there is no separate "fairy" creature
  content, only the TASK-479 wreaths) are in `shots.ts`; `W-ember-lane-night` re-framed from high over the lane
  (the two stall rows face each other; low cams from either aisle end hit the mine cart / terrain). Raw cams, seed 1001.
- **2026-10-28 (TASK-511, HQ growth; D-090)**: `ARCHETYPES.hearthholm.growth` 1.11; `place()` in `gen/layout.ts`
  steps out only islands whose hub channel falls below minGap, grid-snapped. Seed 1001: only Lonely Palm moved
  (+4,+4). 36 raw cams re-aimed in `content/shots.ts`; W-funicular-dawn steeper (tris), W15d on the new beacon skerry.
  - **Gotchas:** zone noise (`zones.ts`) is sampled in WORLD coords, so an island moved even by whole grid cells
    gets other forest / meadow patches and its planners re-roll (grid-snapping only keeps the heightfield and
    anchors). Islets are dart-thrown off the island discs: any layout change moves the skerries (and the
    beacon skerry W15d frames). The cove's `flattest` search is in absolute u: scale it with any HQ size change or
    the cove eats the hill. Re-aim tool idea: match the old / new HQ features (fixtures, lots, landmarks) near
    each cam target and move the cam by their median shift; non-HQ islands move by their centre delta.
  - **Watch:** TASK-511 widened five per-seed test bounds (seeds 186, 334, 593, 4682, 7312, 6523 named in the
    tests): planner robustness follow-up if the user wants them back. Medium memory peak now 169 / 170 MB (W4, W27).
- **2026-10-27 SESSION HANDOVER (orchestrator)**: merged to `main` this session, in order: 501, 506, 505, 497, 503,
  504, 508, 498, 507. M24 dev tasks (497–501) are all done; M25 DevOps I (503, 504, 507), M29 HQ marina (505) and
  M30 QA customs port (506, 508) are built and placed. Plan decisions D-080 (DevOps all directions + growth),
  D-081 (HQ marina + star fort), D-082 (QA customs port).
  - **Next**: one combined QA pass TASK-502 + TASK-510 on a QUIET machine (full 14-preset ladder low + medium
    `--assert`, wow set, perf). Then TASK-509 (M26 DevOps II lava pack; read rail `levels` via `railFromLevels`,
    never re-level from the ground). Then M27 Marketing, M28 Research.
  - **Open user decision**: since TASK-503 Emberpeak looks about as big as HQ from above; ART_BIBLE wants the hero
    clearly largest. Options: shrink the apron ring, or grow HQ. Not decided.
  - **Watch**: warm "full world generation time" perf tests sit near the 600 ms limit (seed 1001 ~650 ms under
    load, pre- and post-merge alike); 126/126 green on a quiet run after 507. W16 medium 272/300 calls, memory peak
    166/170 MB (W4), W-funicular-dawn 786k/800k tris — budget headroom is nearly gone.
  - **Nits**: star fort stone reads pale grey; Kite Hill solar rows staggered on the slope; scanner-arch marquee
    always on (not gated to the ship); pontoons tier 2 vanish at mid range while lobbed crates show; Coding tunnel
    night strips dim; funicular cars read cream at dawn; breakwater only on 2 seeds; H10 mail jetty not built.
  - **Merge recipe used** (parallel worktree branches): keep both sides of append-only conflicts (PROP_DEFS tail,
    FLOATING_FIXTURES, gallery ids, DECISIONS/MEMORY), take HEAD for hash pins with placeholders, then
    `vitest -u -t "stage hashes are locked"` for the inline snapshot and read "Received" from
    `-t "TASK-390 bluffs off"` for the literal pins; full suite with `--maxWorkers=4 --testTimeout=240000`; A/B
    perf against the pre-merge commit in a scratch worktree before blaming a branch.
- **2026-10-27 (TASK-507, M25 DevOps I placed + moving; D-089)**: `world/gen/plans/devops-m25.ts` (after
  `reserveGrowth`; `finish` runs before the road lanterns), `world/funicular.ts` (grade line, earthworks, `carPose`),
  `render/devops-lines.ts` (cars + buckets, via `createMovers().lines`), scenes in `render/culture-movers.ts`
  (`smithScene`, `geyserScene`, `switchbackScene`), numbers `content/themes/devops-m25-site.ts`. Shots:
  `pnpm shots dev --only=D-devops-m25-east,D-devops-funicular,D-devops-funicular-turn,D-devops-smiths-night,D-devops-smiths-close,D-devops-onsen-town,D-devops-geysers`,
  wow `W-funicular-dawn`, `W-ember-lane-night`.
  - **Numbers** (30 test seeds): two funicular sections 28/30 (1000: lower only, its top station has no rail;
    6523: none), cableway 25/30, lane ≥ 3 stalls 30/30, onsen town 29/30, ≥ 4 geysers 27/30. Wow `--assert` green:
    W16 272 calls / 161 MB, W-funicular-dawn 273 calls / 786 k tris (close to 300 / 800 k: keep its cam high),
    W-ember-lane-night 114 calls, memory peak W4 166 MB (was 163). Ladder L-devops low 65 / medium 138 calls, pass.
  - **For TASK-509 (M26):** the lava / crater / obsidian / breakwater anchors are untouched. The funicular owns
    `world.fences` kind `'funicular'` (points + `levels`; read with `railFromLevels`, never re-level from the ground)
    and has cut / filled the cone along its legs (± 3.9 u) in `plan.finish`: anything M26 places on the cone after
    the pads should run its own earthworks the same way (`groundWriter` rules) or stay off the rail strips (the
    candidate strips are reserved shapes). The heightfield grid is 2 u: an earthwork narrower than ~3 u round a
    point does not flatten what bilinear sampling sees there. The ember bridge / lava channel never cross it (the heading keeps off).
  - **For TASK-510 (QA):** seed 1001 lower car turns at its first switchback at sim 5 s (`car.phase` 0.125 is tuned
    for that); geysers all erupt 17:30–17:30:12 (`shiftEnd` now has `seconds: 12`); hammers 1.1 Hz on hashed phases.
    Re-aimed: `D-story-containerNap`, `D-culture-devops-onsen`, `D-critter-capybara-onsen`.
  - **Gotchas:** pads cut walls at the stations and the cone is steeper (0.5–1.0) than the rail (0.6): never level
    the rail from the raw ground — plan it in `finish` and carve. Earthworks skip other pad cores and cells within
    1.2 u of other obstacles (the ingot rows, the foundry rail). A lane pad on another level than
    the foundry rail bends the rail end (falloff 4 u): `placeSmiths` checks `clash` first. `mailLinePairs` must skip
    v2 / v3 or the ore pylons pair up as HQ mail lines. Duplicate keys in an `as const` content object silently win
    (a `keep` collision made the beam width 1).
- **2026-10-27 (M29 TASK-505, HQ yacht marina + star fort; D-085)**: `world/gen/marina.ts` (post-route stage,
  `world.marina`, `hashes.marina`) + defs `marinaPier` / `starFort` + sailboat v6–v8 (`geo/themes/hq-marina.ts`,
  numbers `content/themes/hq-marina.ts`). Shots: `pnpm shots dev --only=D-marina-top,D-marina-t1,D-marina-fort,D-marina-dusk,D-marina-top-night`,
  wow `W-marina-dusk`, `pnpm exec tsx scripts/gallery-shots.ts marina`.
  - **Gotchas:**
    - HQ's pier is in a closed bay, so the ferry stop (nearest open-water node) is 26 u from the pier end, at the
      horn — the fort, breakwater and gates all key off it. The breakwater fits on few seeds (stop / route clearance).
    - The shore contour is walked on the SDF (3.2 u out); summing |turn| inflates with grid noise, use the signed
      turn plus a "back to the cove" test (the seaward normal vs the pier end).
    - Moored boats are fixtures (floating, `tagBob`), not agents: no life budget, instanced per (def, variant).
    - `settlement-props` pushes `world.marina` just before the districts (the district test wants them last).
    - Fort: the star outline is concave, so caps are fans from the centre and wall bands use `addPoly` with an outward
      hint; merlon / slot yaw is `atan2(-e.z, e.x)` (local x along the edge).
    - geo tests: `marinaPier` / `starFort` reach 5 u below the pivot (pile feet, plinth) — exception in geo.test.
- **2026-10-27 (TASK-503, M25 step 1; D-083)**: Emberpeak apron ring + growth anchors. Anchor contract
  (`world/gen/plans/devops-growth.ts`, sizes in `content/themes/devops-growth.ts`; rotY = xz heading;
  `…Size` = {x: w, z: d} of a rect whose depth axis is rotY):
  - `lavaChannel0..N` polyline notch → windward lip (`anchorChain(isl, 'lavaChannel')`), `lavaFall` = last point
    (rotY out to sea), strip `lava.width` 3 + 2 × 1.5 reserved; `obsidianBeach` coast point beside it.
  - `funicular0..2` foot / mid / below-rim stations (rotY uphill, disc r 2.5).
  - `cablewayFrom` (quarry, + `quarrySize`) → `cablewayTo` (disc on the foundry upper step).
  - `onsenTown` + `onsenTownSize` (pool bank, rotY → pool), `geyserField` + `geyserFieldSize`,
    `smithsLane` + `smithsLaneSize` (foundry lower shelf, w along it), `craterDeck` (rim, rotY → crater),
    `breakwater` (water point off the harbour mouth, rotY = arm heading).
  - Each may be missing on ≤ 1 / 30 seeds (test: ≤ 2). Reservations are non-blocking shapes, no pads: the
    M25/M26 task adds the fixture + its own pad. The obsidian beach is still bluff wall (a second low cove is
    M26 work, `coveness` takes one anchor).
  - **Gotchas:** an island whose `reachScale` > `layoutReachScale` is pushed out from the hub after placement
    (other islands keep their centres); Emberpeak's raw cams are stale (+9.7 u on 1001). Fumarole pads now keep
    off lot pad cores (a pool next to the summit tower averaged it 8 u down).
- **2026-10-27 (M24 wave 1; TASK-500 merged)**: Mother Kite Train (`render/kite-train.ts`, built inside
  `createSkyCraft`, +1 call / +692 tris; `kiteTrainCentre(world, seed, simt)` gives its position for presets).
  The lit program forces flat normals from screen derivatives and mixes 35 % shade tint regardless of albedo, so
  a saturated yellow goes grey in shade: use two-tone with blue, or `lift()` like the balloons. A raw-cam
  oblique frame over open water costs 400+ calls; look down ≥ 30°. Per-frame CPU-written meshes copy the Hype
  Fleet anchor trick. Session handover: TASK-497 (worldgen) and TASK-499 (props) were asked to commit WIP on
  their `worktree-agent-*` branches. Check `git worktree list` and the branch tip before resuming; then wave 2
  (498 ∥ 501) and 502 QA.
- **TASK-508 (Customs Port placement + motion; D-087)**:
  - **For TASK-510 QA:** presets `W-customs-noon` (12:00 +3 s, ship under the arch) and dev `D-qa-customs-unload` (+14.6 s crane carrying),
    `-lob` (+23.7 s reject in the air), `-spin` (+25.2 s ship turning), seed 1001 raw cams (crane 69.2,-143.0). The cams are crane-frame points
    converted with `frameToWorld` (see `world/gen/customs-port.ts`); other seeds need their own (`isl.anchors.customs`). Visit = 36 s from noon.
  - **Gotchas:** the port is committed BEFORE the yard (the stunt yard / rim walk share dropped, see D-087); crane frame x = (sin rotY, -cos rotY), z = (cos, sin);
    `customsFlip.z` is the lane side; tier-2 props (pontoons) draw only close in, the ship / crates draw from 90 u; a mover item needs a
    `FIXTURE`-consistent layout, so change `CUSTOMS_PORT` and the motion together. Never `open(p,'w').write(open(p).read())` (truncates).
  - **Cost:** customsFrame 0.5 us + ~14 parts ~ 6 us per frame in range, 0 agents, 0 outside; +4 part kinds (ship 272 tris, container 168).
- **TASK-501 merged (Proving Grounds motion; D-078)**:
  - **For TASK-502:** presets `D-qa-proving-siren` (12:00 +3 s), `-drop` (+8.95 s, crate in free fall, cart at the ramp
    crest), `-jump` (+9.7 s, cart over the crossing, crate just landed with dust + lit lamp) use raw cam
    `124,16,-112,100,9.5,-137` (seed 1001; the yard is 10 x 20 at (100, -136), tower on its north end). From the
    south / east the testLab roofs block the view. A wow preset can reuse that cam; tower cycle 20 s with `phase` 3
    (lift 3.5-9.5 s, fall 11.3 s into the cycle), cart lap 15.08 s (launch 9.12, land 10.37).
  - **Gotchas:** the stunt yard fixture is `testTrack` variant 1 (loop track = variant 0; tests filter on it). The
    fan's `aSpin.w` is 1.25, not 1 (shader branch for `uFanSpin`); a test that counts spinners must use `FAN_SPIN_TAG`.
    Culture-mover parts now have 18 kinds (`crate`, `dummy`); `buildDropCrate()` is not used by the mover (the part
    is built from the same QA_PROVING numbers). `harness --only=` wipes the other frames of the set dir.
  - **Cost:** culture scenes (tower + dummy) + cart pose ≈ 6 us/frame in range, 0 outside; 0 agents.
- **TASK-506 merged (QA Customs Port kit, D-086; no placement yet)**:
  - **Defs** (QA ledger 15 / 15, `cultureCapOverride.qa`; all tier 2): `scannerArch` (1 variant, ship passes along
    local z, T0 by size), `customsYard` (v0 crane + container, v1 empty rig, v2 / v3 inspection line with check /
    cross lamp lit, v4 container stack; `rollVariants` 1, pin the rest), `quarantinePontoon` (3 layouts,
    `FLOATING_FIXTURES`, bob + red beacon lamp). Geometry `geo/themes/qa-customs.ts`, numbers `content/themes/qa-customs.ts`.
  - **Loose builders for the placement / life task**: `buildQaCargoShip(loaded)` (bow +z, waterline 0, hook
    `slots.list` of 8 container base centres, yaw pi / 2), `buildQaContainer(i)`, `buildQuayTrolley()` (origin = base),
    `buildQuaySpreader()` (origin = frame top), `buildQuayCable()` (unit height, scale y).
  - **Hooks** (`userData.hooks`): arch `pass` / `scan` / `marquee` {count 36} / `lamp`; crane `spreader` {home, up, down, size},
    `trolley` {home, z, y}, `cable`, `container`; line `belt` {from, to, width}, `lamps` {ok, bad, lit}, `booth`; pontoon
    `lamp`, `deck`, `crates.stacks`.
  - **Gotchas**: variants of `customsYard` differ in size (crane 5.5 x 12.8, line 13 x 6, stack 3.8 x 4.9), so the planner
    needs per-variant rects (the def footprint 6.2 is the crane's). The pontoon is the only fixture needing the waterline
    pivot; the quay crane boom reaches +z, so face +z at the water. `tagBob` period is the shared FLOAT_BOB (1.3 s), not
    3.2 s. Worktree has no `node_modules`: symlink the main checkout's.
- **TASK-504 (DevOps M25 props kit, D-084)**: props only, no placement. For the worldgen / life tasks:
  - **Defs** (end of `PROP_DEFS`): `funicularRail` v0-2 (pitch 0 / .3 / .6, 3 u horizontal run, pivot = low end, a
    fall = same piece rotY + pi at the low end), `funicularCar` v0 orange / v1 teal (rail frame, +z along the track,
    y 0 = rail top), `geyserCone`, `oreBucket` v0 empty / v1 glowing ore (pivot on the ground, grip above).
  - **Variants:** `rackShed` 2 (station), `onsenHouse` 1 / 2 (stilts / + towels), `goodsStall` 7 (smith), `mailLine`
    2 / 3 (ore pylon mid / furnace end), `antennaMast` 2 (watch tower + beam head). Pin them by variant; random
    rolls stay on the old ones (`rollVariants`).
  - **Hooks** (`userData.hooks`, local frame): `funicularRail.rail {length, pitch, startY, endY, railX}`;
    `funicularCar.car {length, pitchRef, cabins, lamps, grip}` (mover pitches the mesh about x by atan(slope));
    `oreBucket.bucket {grip, axis}`; `mailLine` v2/v3 `cable {anchor, back?}` (v3 also `ore {at}`), anchors also in
    `DEVOPS_M25.ore.anchor`; cable mesh: `buildOreCable(rng, a, b, lod)`; `geyserCone.spout {at, radius, column}` +
    `emitter`; `antennaMast` v2 `bell {at}`, `beam {at}`; `rackShed` v2 `track {start, end, pitch}`, `wheel
    {center, axis, r}`; `onsenHouse` `emitter` follows the stilt height.
  - **Gotchas:** `mailAnchorWorld` indexes `MAIL_LINE.anchor[variant % 2]`, wrong for v2 / v3 (use the hook or
    `DEVOPS_M25.ore.anchor`). Station stub ends at z 2.0, inside the rackShed lot's 0.8 tolerance. A worktree has no
    `node_modules`: symlink the main checkout's. The full `pnpm test` times out in the world tests when other agents
    load the machine; rerun those files alone (`--no-file-parallelism`).
  - **Showcase:** `?gallery=1&ids=devops25`, `pnpm exec tsx scripts/gallery-shots.ts devops25`.
- **TASK-499 merged** (QA kit; `cultureCapOverride.qa` 12/1):
  - **For TASK-501:**
    - `dropTower` `userData.hooks.crate` {top, rest, size}; `buildDropCrate()` in `geo/themes/qa-proving.ts`.
    - Animate on variant 1, the empty cradle.
    - Free ground is `isl.anchors.stunt` + `stuntSize` (no pad).
  - **Proving Grounds preset:** raw cam ~`120,16,-118,101,14,-128` (seed 1001). The QA plateau is at y ≈ 8.6.
  - **Gotchas:**
    - Props over 3 u tall draw from T0 regardless of tier.
    - A blocking reservation placed before `campusLots` moves the lots and paths.
- **TASK-498 done (Wind Tunnel + Kite Day; D-088)**, branch `worktree-agent-af63de4db6501b14b`; re-pins are their own
  last commit (`test(worldgen): re-pin hashes ...`), redo them at merge if a parallel branch re-pinned too:
  - **For TASK-502:** presets `D-move-coding-hill` (14:00 +20 s, cam `-80,26,150,-106,13,183`, 14 kites up, the tunnel in the
    corner), `-tunnel` (day, +20 s) and `-tunnel-night` (21:00 +6 s, cam `-112,9,166,-123.5,10.5,184.7`),
    `-socks-a/b/c` (sim 4 / 11 / 19 s, cam `-122,15,176.5,-123.5,10.2,185`: the socks visibly change pitch). W7 shows the
    tunnel at the right edge. The tunnel's axis runs about -x on seed 1001, the fan is at its +x end.
  - **Gotchas:** the tunnel fixture is rotY = anchor.rotY + pi/2 (local +x = axis), the fan rotY = anchor.rotY (local +z).
    A windsock-lift vertex carries `aSpin.w` = 5 + k/16 and `wind` 0 (a test counting spinners should expect w = 1 only on
    the fan blades). `harness --only=` wipes the other frames of the set dir (take all frames you need in one run).
    The `cultures.test` negative cases now build on the Marketing ledger (Coding has an override).
- **TASK-497 merge-ready** (`worktree-agent-a24e64327cede359d`, D-075; main merged in). The hash re-pins are a
  commit of their own (`test(worldgen): re-pin …`); redo them at merge if TASK-501 re-pinned too:
  - **For TASK-498 (anchor contract):** `isl.anchors.windTunnel` {x, z, rotY} stands on every seed (30 test
    seeds + 100 more checked).
    - Axis is `(cos rotY, sin rotY)`; +axis is downwind (`cos(rotY − windDir) ≥ 0`).
    - The pad is `rectShape(x, z, rotY, 6, 16)`: level (corners within 0.3 u), clear of fixtures, lots,
      turbines and paths, ≥ 16 u from the summit (≥ 18 u except the `tunnel.last` tier).
    - The Kite Day rack + `kiteDay` story sit just outside the hill foot facing the summit.
    - On seed 1001 the hill is at (−97.9, 180.2) and the tunnel at (−123.5, 184.7), rotY 2.97.
  - **Cams:** `D-move-coding` (Kite Day) and `D-story-hammockNap` are re-aimed. `D-culture-coding` and W7
    still frame the hill well.
  - **Gotchas:**
    - A pad's falloff (margin + 4 u) shaves a knoll flank, so keep padded beds off the hill. Only the
      pinwheel meadow's last fallback stands on the hill foot, unpadded there.
    - Planner `relief()` reads heights before the pads level them, so a fixture beside a pad's falloff can
      end up tilted (the hill rack got its own pad for that).
    - The hill costs room on ~70 u plateaus: grove 23 → 14 of 30, rim walk 28 → 24, glyphs 22 → 21.
- **2026-10-27 (M23 closed; TASK-495/493 merged)**: M23 world signature is done — reefs, relay night, constellations,
  whale, night-effects polish; QA in `mar-docs/qa/m23-world-signature.md`. Budgets now: medium memory peak W27
  162 / 170 MB, W16 278 calls / 765k tris, low ladder max 305k. An "uber geometry + shader collapse" mesh costs
  every slot's tris on every instance — worker bots still do (1862 tris/bot, ~97k at the Design 120 u rung): the
  next lever if tier 2 gets tight. The composer `outputBuffer` has no depth unless a pass needs the depth
  texture. `PropDef.fromT0` defs never fade → extra shadow calls from far islands. Run the ladder with
  `--assert` at milestone QA (M22 missed the Design overage without it). Open nits: whale has no waterline
  ring; W25 blank screen panel; W26 lower slope; DevOps day bands; W2 gate tint.
- **2026-10-27 (TASK-496 merged)**: beam-program meshes may be stretched non-uniformly now; animate a travelling
  front with `uBeamFx.xy` per frame (`signalFlash()`). A fireworks reflection on open water is the mirror image
  (eye ray to (x, 2·sea − y, z)); to see shells and reflection in one frame the camera must sit ~2 u high and
  ≥ 200 u from the shells. A dithered soft disc in the shared life material shows its dither at large sizes —
  use bloom for glow. Skerry beam fade is 900–1200 u (was 380–500) so beams read in the postcard.
- **2026-10-26 (TASK-494 merged)**: `WhaleBend.tail`/`fluke` + = up only since TASK-494 (the skin sent them down
  before). The whale heads along its route, so a camera behind it sees only its back — frame it from in front
  (17:45 heading ≈ (0.37, −0.93)). Water alpha hides anything deeper than ~1 u, so a submerged silhouette is not
  worth it. `pnpm shots --tag=<x>` writes to `shots/wow-<x>` so parallel agents don't collide.
- **2026-10-26 (TASK-489 merged)**: the whale (D-070) runs on the culture-clock day, not sim time — one lap per
  day, 5 surfacings, the first pinned to 17:45 off the Research headland. Its route loop is not in `WorldData` (no
  re-pin). The lit dither fade inverts when near > far; a mesh meant to be seen must stay outside `fade.near`. A
  frame with draw calls but zero visible pixels is a NaN vertex. Raw-cam oblique frames over open sea cost
  330–380 calls — look down at least 25°.
- **2026-10-26 (TASK-487 merged)**: ladder `drift` is now judged on `fog=0` frames (`<dist>.nofog.png`); the fogged
  value is `driftFog` — compare both before blaming a tier for far drift. Fog depends only on camera distance
  (1.8 % at 170 u, 7.3 % at 480 u on target). Pair IoU forgives structure cells inside their radial parallax
  corridor (`parallaxCells`); terrain gets no corridor. The tier-2 glasshouse row is a real pop at 140 u
  (TASK-493) — the Design ladder stays on the windmill slope until it is fixed. Old vs new metric needs no
  recapture: import both modules over saved `shots/ladder-*/L-*/<d>.png`.
- **2026-10-26 (TASK-491 merged)**: the sky program is shared by the dome and every beam material — any new sky
  uniform must be one shared object for all of them (`CONST_U` pattern in `sky.ts`). A raw `cam` target's
  distance picks the tier: an upward shot with a 100 u target hit 850k tris, the same view with a 300 u target
  is tier 1 (439k). Existing night wow frames show almost no sky (W24/W25 look down, W15 has 0–7° of sky, mostly
  fog), so constellations only read in W27. Give shot logs unique names — parallel agents overwrite shared
  scratchpad logs; read results from `shots/<set>/manifest.json`.
- **2026-10-26 (TASK-490 merged)**: the culture clock day is 600 s, so 22:00 + 60 s wraps to second 10 of the
  next day. A culture-mover scene's `max` instance count must cover every part it can write at once.
  `interaction.ts` runs after the world view and owns the final particle counter. Oblique night shots of the
  signal lamps blew the budget at first (351 calls / 862k tris) — look down steeper. `generateWorld` via
  `pnpm tsx` scripts is a quick probe for geometry/world questions.
- **2026-10-26 (TASK-488 merged)**: reefs run right after `finalizeHeight` (`root.fork('reefs')`); routes then
  `carveReefGaps` before seamarks. Don't derive "raised" cells from `h.data - natural` after settlements (it
  catches land pads) — use `ReefField.raised` / `weight`. W4 now 168 / 170 MB medium — little memory headroom.
  Single-island mode has no reefs (per-theme snapshots unaffected).
- **2026-10-26 (TASK-486 merged)**: test-firing steam draws on the puff program via placed slots
  (`Puffs.reserve(n)`, life `aShape.w` < 0 = CPU-driven); any puff alpha change must keep `vEdge = uSoft.x` for
  the emitters. Far terrain (4 u level) lights from height-texture slope normals (`TERRAIN_FACETS.slopeSpan`) —
  the coarse mesh laid cliffs back and they read pale far away. Strata are NOT the far-drift cause; the T0 fog
  ramp in `world-view.ts` is the suspect for L-marketing 480 (→ TASK-487). DevOps switchbacks: colour alone can't
  fix the pale day bands (darker paint lost the road at night and worsened drift) — needs width/edge in worldgen.
  `pnpm shots --tag=x` builds from `src` at start: don't edit `src` between chained runs; the same tag with a
  different `--only` wipes earlier PNGs.
- **2026-10-26 (TASK-485 merged)**: story-spot keep-out (D-065, `world/gen/story-keepout.ts`, `STORY_KEEP_OUT`)
  drops planner fixtures on a story stage after `finish` (shifts rolled decor variants); new tall avenue defs go in
  `STORY_KEEP_OUT.tall.defs`. Zones don't render on steep faces (earth-wall shading ignores them) — make stairs
  or paths on walls visible with geometry (`stairFlight`, Marketing only via `STAIR_FLIGHT.byTheme`). A def may sit
  in several `CULTURE_RHYTHM` lamp sets (clock = nearest island; `cultureLampTheme` is only a boolean). Open: W2
  Research gate street reads as grass in golden-hour shade (D-062 tint, left as is). Agents in worktrees: Bash
  refuses some compound/loop commands and then runs none of it — keep edits in separate commands.
- **2026-10-24 (M22 closed)**: TASK-478…484 on main; wow 25/25 `--assert` (new W23 Rim Walk Afternoon, W24
  Lantern Zigzag, W25 Carpet Night seed 2024, W26 Test Firing Noon; W6 re-framed from the east). Medium 300 calls /
  170 MB: W16 270 calls / 788k of 800k tris (don't add kit visible from the W16 cam), W4 167 MB. Rim walkway =
  D-063 (QA + Coding C18). QA report `mar-docs/qa/m22-2026-10-24.md` lists the open items: C11 windsock on the
  Coding duck-crossing spot (needs a story-spot keep-out), W26 steam reads as one faceted ball, W25 billboard hides
  half the carpet + a bot on the cliff by the transmitter (walk-graph leak?), L-pairs-marketing transmitter
  parallax (only new ladder miss), medium far drift Marketing/DevOps (far-wall strata), small slalom buoys, C18
  unlit at night (needs a post cap in the Coding lamp set, `rhythm.ts`), M20 leftovers (W2 gate on grass, W20 mail
  cable, L-design near rungs). Next: M23 "Dünya İmza" — ask the user first.
  Gotchas: framing loop = `pnpm dev --port=NNNN` + `pnpm shots <set> --only=… --base=http://localhost:NNNN/
  --no-selftest --tag=x` (shots.ts edits live, ~10 s/frame). Oblique QA/Marketing frames that take in the horizon
  cost 330–380 calls; look down ≥ 25°. `git merge main` fails while `shots.ts` is dirty — commit WIP first. Ladder
  drift misses only show as "N ladder misses" in the log; read `ladder-L-*.json`. Culture lamp sets live in
  `CULTURE_RHYTHM[theme].lamps.defs` (`rhythm.ts`, orchestrator-only); each M22 island added its set at merge.
- **2026-10-24 (M20 closed)**: TASK-464…477 all on main; wow 21/21 `--assert` (new W20 Compass Star, W21
  Conservatory Prism Hour seed 6006, W22 Seven Gates Night; W19 re-framed NNW), 2433 tests, medium 300 calls /
  176 MB (W16 269 calls, W4 173 MB). QA report `mar-docs/qa/m20-2026-10-23.md`; open items → TASK-478. Next: M22
  five-island quick wins (WORLD_PLAN §5 row 2; ask Round 3 details per island first), TASK-478 in parallel.
  Ladder misses depend on quality (default low; L-marketing / L-pairs-hq only on medium) — always state it.
  `pnpm shots` silently reuses a port another agent serves ("already served (not ours)") — grep the log; give
  each parallel agent its own port. Framing can be iterated against a running dist with
  `--base=http://localhost:<port>/ --no-selftest`. Full low ladder: 25 min at load ~4, 99 min at load ~14.
- **2026-10-23 (M20 466/467 merged, 475 done)**: TASK-466 HQ Seven Gates, TASK-467 Design Glass Conservatory and
  TASK-475 (one-span sea arch, SEA_LAMP buoy lamps) on main; wow 18/18 `--assert` (W16 331 calls, W4 ≤ 176 MB).
  D-061: medium budget 340 calls / 176 MB for now, TASK-476 (engine) merges near-tier culture fixture groups and
  lowers it back to 300 / 170. TASK-464 (T0 per-species blobs) running in a worktree. Next: TASK-468 shader ∥ 469
  life (the mail-sack mover with the 09:00 / 17:45 bursts already exists from 466; Design bridge `hooks.walk`
  unused until 469) → 470 QA (W19 re-frame: the tree hides the conservatory) → M22. Open: HQ compass read is
  subtle at eye level (468), W2 one gate on grass without a path, low mail pylon sits on plaza paving; Design
  small domes (~120 u) miss glasshouses / garden on some seeds (thresholds relaxed with TASK-467 notes); far
  sea stacks read as flat stumps (no grass cap on LOD1). Full `pnpm test` flakes on timeouts while parallel
  shots run (load > 30): use `--no-file-parallelism` + `MAR_PERF_SCALE=0`, then perf tests alone.
  TASK-468 merged: ground art (`render/terrain/ground-art.ts`, `content/ground-art.ts`) paints the compass + prism
  pools in the terrain shader — no derivatives inside branches (use `marDPx/marDPy`). Glasshouses don't carry the
  `stained` tag (unchanged look); street tints > 0.62 look garish from above; seed 6006 has 3 prism arches.
  TASK-469 merged: semaphore arms are mover parts now (`PART.arm`, tower gallery view is armless); gate halos
  flare in relay order over an always-on static lantern; stall keepers are closed-form mover parts, not agents;
  glass-bridge deck nodes join the walk graph (`glassBridgeDeckY`), Design itineraries changed. Dock reachability
  bug fixed in TASK-477 (dock roots below `minWalkY` forced to `deckY`;
  `dock-reach.test.ts`). Chimney puff kind 0 now shares the steam soft alpha in `cloud.glsl.ts` — any puff alpha
  change must cover kind 0. Seed 1001 has a land path edge crossing water near (67, −133) (pre-existing, open).
  TASK-464 merged: T0 blobs per canopy kind (`ClusterIndex` 8 u × kind), `TREE_FADE` 500–620 for clusterable trees,
  `BLOB_KIND_SCALE` (blossom 1.5 so pair-380 passes); pine blobs still round; `mixLattice` now unused. Ladder misses
  not from 464 (already on main): L-marketing drift 700/480/340 ≈ 4.4–4.9, L-devops 30→21 blob 1.8 % → TASK-470.
  `pnpm shots --port 4186` (space) silently falls back to 4173 — always `--port=NNNN`; `--tag=x` isolates outputs.
  TASK-476 merged: near structure merge (`NEAR_MERGE` maxVerts 1600, reach 160) in `far-merge.ts` / batcher — W16
  331 → 269 calls, medium back to 300. `gpu-memory` counts hidden meshes, so any merge keeping fallback groups must be
  lazy/capped; TIER_FADE[0] is infinite, so cap reach; all 16 vertex attribute slots in the lit program are used
  (encode new per-vertex data into existing attributes). Memory 170 needs W4 Beacon/Design buffers trimmed. New worktrees have no `node_modules` (`pnpm install --offline --frozen-lockfile`).
- **2026-10-18 (TASK-466, worldgen)**: HQ Seven Gates plan (`world/gen/plans/hq.ts`, numbers in
  `content/themes/hq.ts` HQ_PLAN + `content/cultures/hq.ts` HQ_CULTURE_SITE): R 10 compass plaza
  (district kind 'compass'), seven streets aimed at the real islands (A* rays in a 4 u corridor, other
  streets' cells cost extra), `cultureGate` per street (rim / shore gates + `gullPerch` mooring post),
  goods stalls + crates + pennants per culture, lots from the new mix (cottage / barn / towerHouse),
  Guild Terrace (earthed up to plaza + 3.5 u, stair link), post yard + `mailLine` pair (cable mesh
  `render/mail-lines.ts`, sacks `CULTURE_MOVERS.mail` at the `mailHour` 09:00 / 17:45 bursts), summit
  semaphore, 3 ridge lookouts, quay paving, bottle-beach scatter. Street tints = 7 new zones
  (`Zone.streetHq…streetResearch`, ZONE_COUNT 23) painted by the plan and kept by `writePaths`.
  `hqOffice` v2 arcade / v3 bell niche + balcony (v3 far proxy = v1). Left for TASK-468: the compass
  mosaic over the 'compass' district (rays = the `cultureGate` fixtures' bearings from its centre);
  for TASK-469: semaphore arms + gate lamps in relay order (the sack mover is in).
  Finish pass (2026-10-23): the plaza search prefers low, roomy ground (`maxY` first pass,
  `highCost`, `roomCost`; minShore 12.5 so the pad's falloff never lifts the pier root); the post
  yard + mail line are placed BEFORE the street lots and reserve a `tag: 'cable'` corridor under the
  span (lots / kit / trees keep off it); plaza-ring lots fill short-street seeds; any culture gate
  ≤ 5 u from the shore gets a mooring post. 50 seeds: lots ≥ 8 on 49 (1526, a narrow tip: 6–7),
  mail line on 48, all seven gates on 44.
- **2026-10-18 (M20/M21 in progress, paused to save quota)**: plan = `mar-plans/WORLD_PLAN.md` (+ `mar-plans/study/`),
  user decisions D-057…D-060 (all recommended options). Done on main: TASK-465 M20 props, 471 HQ at the centre +
  skerries + Lonely Palm islet (one-time re-pin), 472 night sky / deep sea / wakes / mist / comet, 473 tour mode,
  474 channel buoys + sea stacks + arch, lighter mist. wow 18/18 `--assert`.
  **Paused mid-work (uncommitted, in worktrees):**
  - TASK-466 HQ Seven Gates: worktree `.claude/worktrees/agent-ae0803b8bf255d7b4` (28 files), was writing street
    zones / content / geometry / plan; not yet verified.
  - TASK-467 Design conservatory: worktree `.claude/worktrees/agent-a8b0826a5966d6199` (13 files), plan written,
    writing tests.
  - Backups: `shots/wip/TASK-466.patch`, `TASK-467.patch` (gitignored; `git apply` on 71566fd).
  To resume: SendMessage the stopped agents (Claude Code session `595d4a41…`) or start fresh agents in those
  worktrees with the original briefs (TASK-466/467 rows + D-057/058/060 + `study/hq-design.md`).
  Next after them: TASK-468 shader (compass mosaic, prism pools, conservatory glass) ∥ 469 life (semaphore relay,
  gate lights, mail bursts 09:00/17:45, windmill) → 470 QA + new wow shots; then M22 five-island quick wins (Round 2
  directions in D-059; Round 3 details per island in WORLD_PLAN §6). Follow-ups: stack arch lintel reads weak
  (two rocks from afar), buoy lamps faint at W15; no Research dish/telescope → comet hook yet; shots `--port`
  4190 is fetch-blocked (use 4185–4188); subagents run on fable (user request) but it hits session limits fast.
- **2026-10-18 (TASK-467, worldgen)**: Design "Glass Conservatory" plan (`world/gen/plans/design.ts`): pier in
  the lee cove beside the stream mouth, Conservatory Square (R 10 terrazzo disc near the dome top, octagon
  blocked, bay 0 toward the pier, hub at bay 0's pin), four bay lanes (corridor A* round the plaza ring),
  the Prism Walk arches on straight runs of the pier lane, the glass bridge over a tidal creek cut into the
  stream's beach reach (`passable` deck cells), the 2 × 3 glasshouse block (split rows fallback), the
  stained windmill meadow, lots in a ring, the old kit re-homed, two rainbows, pine 0.85 → 0.55. Numbers in
  `content/themes/design.ts` (`square`, `dock`, `cut`) and `content/cultures/design.ts` (`glasshouses`,
  `prismWalk`, `bridge`, `windmill`, `rainbows`). Order: pier → square → bridge → bay lanes → arches →
  ring lots (3–4, before the other sites, else a ≈ 120 u dome loses them) → glasshouses → garden →
  windmill (fallback passes) → easels → grove → kit. 30 seeds: lots ≥ 3 29/30, six glasshouses 24/30
  (2 × 3 block 19, seed 1789 none), garden 21/30, bridge 23/30, ≥ 1 arch 27/30, windmill 30/30; the
  thresholds carry `TASK-467` notes. Left for later (Design+1):
  the waterfall balcony (Z11), the chime walk (Z12), the mirror pond (after TASK-353); the sea-glass
  beach speckle (Z9) is in the theme ground table for every Design beach, not only the NE sand. Hooks:
  the arch fixture position is the TASK-468 light-pool centre (`hooks.pool.at` = local origin); bots
  crossing the creek path walk at terrain height until TASK-469 reads `glassBridge` `hooks.walk`.
- **2026-10-17 (TASK-471, worldgen)**: hub layout (HQ nearest the centroid, six on a 60° ring, `LAYOUT.hub`,
  `layoutProblem` 'offcentre') + islets (`world.islets`: 3–6 skerries + one Lonely Palm sandbar, `ISLETS` /
  `ISLET_LAYOUT` / `ISLET_SCATTER`), D-058 implementation note. One-time re-pin: every raw cam in `shots.ts`
  translated by its island's centre delta (seed 1001 + W4 2024), W9 / W14 re-aimed from the SW, EDIT_LOGS
  re-encoded, stage hashes + plan snapshots re-pinned, 17 marginal 30-seed plan thresholds relaxed (the old
  code on a shifted seed set missed the same way; see D-058). wow 18/18 `--assert`, L-hq ladder 0 misses.
  Seed 1001 HQ headings from the plaza (−46, −20): marketing 176°, coding 111°, devops −4°, qa −43°,
  design −111°, research 39°; shore along the heading at 20 / 30 / 104 / 68 / 20 / 15 u, so the research
  street (and on other seeds 2–3 streets at 12–17 u) ends in a D-058 shore gate. Not re-checked by eye:
  the dev / edit / live sets (translated cams only); `D-sky-*` cams aim at craft orbits that moved with the
  island bounds (re-pin if D-sky frames are empty).
- **2026-10-14 (M19b culture polish closed, TASK-460…463)**: W2 3 rowboats (sheep 8 → 6 for the 60-agent cap),
  fireflies 9/swarm, sailboats kept `SAILBOAT.berthClear` 12 u off pier-end stops, boxy capybara (ellipsoid
  rounding read as a shell again — leave it). Pipes = `world/pipe-run.ts` (pitched pieces + risers). Research
  always has ≥ 4 pennant lines + lecture + comet board + cart; medium `tableauMax` 5. The "balloon stipple" was
  Bayer-dithered steam: puffs are now blended (`depthWrite` off, renderOrder 12) with `PUFFS.soft.nearFade`;
  rain keeps its own dithered material clone. Ladder: mask frames skip the composer (medium/high numbers before
  2026-10-14 are not comparable), class-consistent drift, `FRAMING.ladder.shift.research`, DOF focuses the orbit
  target, solar rows T0 (D-056, `mar-docs/qa/ladder-2026-10-13.md`). Ladder misses low 0 / medium 0 / high 1.
  Open (→ TASK-464): T1 far forests stipple out (`TIER_FADE[1]` 320–420 u, T0 blobs off at T1); widening to
  500–620 costs +4 calls but exposes mixed pine/blossom T0 blobs averaging to pale green (high L-pairs-design 380
  blob 0.7 %). Boats-per-shot depends on the seed's pier berths.
- **2026-10-13 (M19 "Seven Cultures" closed, TASK-453 done)**: polish merged — 453a framing (W18 cam
  `-174,27,-190,-160,7,-208`, W15 simt 105, signpost debate + D-move-hq re-aimed), 453b shader (water wedge,
  near searchlight fade, vitray shells, caustics, cliff normals, moon glitter), 453c world (pipe posts,
  `pathSparesSlopes`, duck / ladybug offsets). wow 18/18 `--assert` ok. Open: ladder misses L-hq drift,
  L-design 480, L-research 30 → 21, pairs-research / pairs-marketing 380; W2 has 1 boat (≥ 3), W3 6 fireflies
  (≥ 10); pipes still stepped on slopes (needs a real pitched run); boats overlap at piers; capybara reads as
  a turtle from above; Research 0–3 pennant lines, lecture on ~1/3 of seeds; balloon shadow dither stipple.
  §4 accent column differs from `CULTURES` (§12 table wins). Culture plan: `mar-plans/ISLAND_CULTURES.md`;
  ART_BIBLE §12, DECISIONS D-050…D-055.
- **2026-10-11 (TASK-402b, worldgen)**: Research is "Observatory University" (D-046): 52–58 u campus hill,
  `campusHill` profile + `planResearch` (RESEARCH_SITE). Seed 1001's other islands moved −16.539 u in z
  (raw cams, LIVE_CAMS, EDIT_LOGS translated; the mixed log's removed bush re-mapped, two removals dropped);
  seed 2024 / 5005 layouts re-rolled (W4 cam re-pinned by the Beacon Rock delta). Space on the island is the
  binding constraint: districts are placed garden → glasshouses (beside the garden) → dishes → base, each
  with fallbacks; moving an anchor or the order re-balances which district shrinks (`scripts` probes were
  temporary). Viaducts are gone (D-045, W12 removed). Medium call budget 300; W11 is at 298 after
  TASK-403/405, so a Research polish must not add draw groups visible in W11. Next (proposed, not
  started): break the round "cake" silhouette (coves/headlands), clean the merged paving blobs between
  quad and garden, guarantee scholarStatue / rocketMonument / a few trees per seed. Also open: the library
  often hides behind the observatory from the east; pergolas ~45 % of seeds; seed 8101 Coding has no solar.
- **2026-10-10 evening**: M17b wave 2 + island redesigns merged (TASK-393/394/395/400/401).
  Research = crater + biodomes (`ARCHETYPES.lonelypalm.crater`), QA = factory plateau (palmlagoon
  bluff). Crater islands get no waterfalls and no viaduct ends (too small). Seed 1001's only viaduct
  is now DevOps → QA; W12 looks at it from ≈ 170 u NW (closer = both campuses at T2, 310–530 calls).
  Settlement decor/theme/district streams fork per island id (`settlement-props.ts`): one island's
  plan change no longer reshuffles the others' decor. Movers (crates, test cart) in
  `render/movers.ts`, time-driven, hidden > 230 u. Under load the 30-seed plan tests time out at
  20 s; run them alone. Docs done (TASK-398, D-039…D-045). 2026-10-11: viaducts are being removed (D-045);
  Research will be redesigned as a bigger campus (W9 criteria pending). Open: E-mixed edit log targets the old lagoon; W4 cuts the tall lighthouse; D-macro faces a wall.
- **2026-10-10 later**: M17b wave 1 merged + pushed (TASK-390/391/392, balloons scaled 1.1–1.4).
  W11 "Concept" is the reference frame. Parallel agents MUST pass distinct `--port=` to
  `pnpm shots`: it reuses any server already on 4173 ("not ours") and can shoot another
  worktree's build. Postcard: FOV 35° means horizon only when look-down < 17.5°, so the pose
  sets the horizon at 0.74 and fits height (bottom edge ≈30°). Walls only 5–7 u (HQ office mins,
  W10 call budget, DevOps terraces limited them). D-macro is now blocked by a building wall.
  Wave 2 next: TASK-393 landmarks, 394 viaducts, 395 waterfalls.
- **2026-10-10**: TASK-352 softer shadows (pcfMax 5). TASK-335 sky craft done (balloons + airship,
  D-038). TASK-332 first wave: ducks on ONE Coding reflecting pool (rng picks; seed 1001 → pool B
  at 110.4, 21.1; the twin pool is empty on purpose) + day butterflies over Design flowers. Ducks
  are 0 on low and the dev set defaults to low → only `D-pool-ducks` (quality high) shows them.
  Medium agent cap: crabs 3→2, gulls [3,5] to fit ducks; seed 3 medium T3 peak still 61 > 60 (test
  seeds green). Pool water is a terrain-painted blob that does not fill its kerb rectangle
  (pre-existing). **Next**: TASK-332 capybaras + puffins, then ART reference items (thick island
  rims, viaduct).
- **2026-10-09 (short session, weekly limit ~4 %)**: TASK-382 partly done (haiku docs agent):
  DECISIONS backfill D-024…D-027, D-029…D-033 + new D-034 (aSpin.w tag channel), D-035 (ladder
  metric calibration), D-036 (carried-item two-slot decode — code wins over phase-3 §3); ART_BIBLE
  §1/2/4/5/6/11 touched (also fixed bloom-in c=12→17, W9 D-017→D-019). **Left**: ARCHITECTURE
  §3/§4/§10 — DONE in a follow-up (TASK-382 COMPLETED; §8 program row synced to budgets.ts 12/20/24).
  Still stale: ART_BIBLE §4 roster/W5–W7 archetype-era, ARCHITECTURE §5 "villagers", §6/§8 cite
  D-017 where D-019 is meant, §9 ladder text pre-M14b; "blob p95 4.5" not written (no source).
  D-034…D-036 dates approximate. Fixed: fixtures added live in edit mode now get their steam
  (`fixtureEmitters` + `addChimney` in world-view `after`; not covered by a shot — check by hand).
  Moved fixtures still steam at their old x/z (emitters only follow re-grounding). Full `pnpm test`
  can flake the two world/ timing tests under parallel load; they pass alone.
  TASK-381 started: ladder ×3 qualities + live set run, numbers in `mar-docs/qa/ladder-2026-10-09.md`
  (live 7/7 pass; Marketing/Design medium misses are mostly region drift > 4; drift fixed by D-037 (shadow cells out of regionDrift); medium HQ 0, Marketing 3, Design 1 step misses left).
  Pipes stepping on climbs needs a pitch channel / sloped variant (PropStore has rotY only).
  High after D-037: 12 misses (was 21); the remaining Marketing/DevOps/HQ step blobs are tall near-camera
  props sliding by parallax (lattice mast, cone), not pops — fix in the ladder camera or registration.
  10-seed sweep done 2026-10-10 (`--seed=N` added to shots; 30/30 ok, qa/sweep-2026-10-10.md).
  TASK-381 COMPLETED 2026-10-10 (dev 32/32 + 6 self-tests, wow 10/10). **Next**: M15–M18 (phase-3 §8);
  ladder follow-up: keep tall props out of the T3 ladder foreground or depth-aware registration.
  TASK-352 done: `SHADOW.pcfMax` 3 → 5 (r186 PCF = 5 Vogel taps + IGN, so a wider radius dithers, no
  banding). Penumbra 0.3 u now holds from 85 u (high) / 42 u (medium) outward; closer it is
  0.12–0.24 u. The T2/T3 box is already frustum-tight (48–96 u), so `maxSize` per tier was not needed;
  contact blobs untouched. Full `pnpm test` flakes up to 4 timing tests under load (archipelago,
  plans-marketing/qa, ground-detail); they pass alone.
- **2026-10-06 (session close, orchestrator)**: Phase 3 M14 + M14b (theme-first redesign) + M14c (living
  close-up) are merged on `main` and pushed (Pages deployed). 1208 tests green; shots ci/dev/edit/wow
  green with `--assert`; new `live` set (`pnpm shots live --assert`): all 7 `L-live-<theme>` pass
  (3.2–7.2 % changed, 17–76 clusters; Coding/QA close to the 3 % line). Programs 9/17/24, D-028 budgets.
  What landed after TASK-380: TASK-383 activity sim (ambient workers by camera *target* focus, kiosk
  queues, chat pairs, carried items via two-slot mode-8 decode `aSeed = acc + 100·(slot−6) + phase`,
  theme micro-activities at fixture WORK_SPOTS; low plan workers 8), TASK-384 living surfaces (`aSpin.w`
  tag channel: 1 spin, 2/3 turbine yaw, 4+ solar tracker, negative = screen kinds; per-theme monitor
  content, rack LEDs, billboard slides, pipe pulses, window occupancy, drones in `render/drones.ts`),
  monitors angled to the windows + wall dashboards, ground polish (relief/zone-gated cliff facets,
  class-crisp borders, carved cliffs, `GroundSpec.ramp`), Design ladder target avoids the Atelier Tree.
  **Next**: TASK-381 QA (ladder ×7 × 3 qualities, 10-seed sweep, live set), TASK-382 docs (ART_BIBLE §1/2/4/5/6/11,
  DECISIONS backfill D-024…D-027 + D-029…D-033 + aSpin.w tag channel + ladder metric changes: plane
  mapping, ±1 cell slack, minLandFrac 0.05, regional drift vs 170 u; Lonely Palm 17–21 u; muted label
  colour; DevOps basalt #7A7584; blossom canopy kind; blob p95 4.5), then M15–M18 (phase-3 §8).
  **Open**: ladder misses — DevOps drift 30 u ≈ 4.9 / 21 u 4.06 (parallax on the 35 u cone, not the
  material: unlit-albedo test still 3.87), Design drift 30 u 5.34 and far 700/480 u ≈ 5.9/5.1,
  Marketing pair 250 blob 0.7 %, Research tiny-land pairs; QA inner-shore saw-tooth silhouette
  (heightfield); pipes step on steep climbs; inspection
  tower is a lot, not a landmark kind; front-row bots partly hide their angled screens; Design live
  frame shifted off the foreground pine onto the studio (2026-10-09); Research live re-aimed from the west 2026-10-09 (3 of its 4 outpost bots in frame; the hut dome hid them).
  **Git**: history rewritten 2026-10-06 so every commit is `omergungor11 <omergungor99@gmail.com>`
  (user asked to remove Claude from GitHub contributors). The cloud session's parallel 24-commit line
  (app.ts → boot/ split, QA sweep) was dropped from `main`; it is kept LOCALLY only as
  `archive/cloud-phase3` (+ `archive/claude-inspiring-pascal`, `backup/main-before-rewrite`) — never
  push those. Before any push: `git fetch` and check divergence + `%an <%ae>` of origin/main.
  Stale agent worktrees live under `.claude/worktrees/` (all merged; safe to `git worktree remove`).
- 2026-10-05 (TASK-380 M14b integration, engine): tests green on the theme-first world (hash pins
  re-done, layout hash unchanged); shots ci/dev/edit/wow green with `--assert`. W5 = Forge & Steam
  (village:devops, seed 1001), W6 = QA Lagoon (village:qa, 4004), W7 = Turbine Morning (raw cam over
  Coding, 1001), W10 = Atelier Tree in the rain (village:design, 6006). DESK_CAM on devPod lot 12.
  New content hooks: `ThemeDef.plazaDecor`, `FIXTURE_EMITTERS` (per-variant, prop render index →
  emitter `prop`), `FLOATING_FIXTURES`, `FRAMING.village.tall`, `LANDMARKS.windTurbine`. Open: a low
  horizon W5 look costs 281–373 calls on medium (> D-028 255); DevOps basalt reads as grey blotches;
  QA ring ridge shows stepped facets; T0 blob p95 4.42 (Design pine + blossom residue).
  Ladder (seed 1001, low): HQ / Coding / QA pairs pass; misses are Design 42→21 u (the ladder camera
  dollies into the Atelier Tree canopy), Research (tiny land, 480→340 p95 13.4 / pair 380), DevOps
  (drift 30 u 4.74, blob 1.9 % at 42→30, pair 380 IoU 0.908), QA drift 21 u 4.07, Marketing pair 250
  blob 0.7 %. Sheets: `mar-docs/shots/M14b.jpg`, `M14b-ladder.jpg`.
- 2026-10-05 (TASK-309 + M14 integration, engine): shots ci/dev/edit/wow green with `--assert` on
  low/medium/high (`pnpm shots <set> --quality=<q>`), programs 9/17/24, budgets D-028. Seats stand on
  `Seat.floor` (lot pivot + `floorOf(def)`), desk sit drop 0.06; LOD1 office proxies scale by
  `PropDef.lod1.size`. Open: stilt-lab seats are unreachable (door node over water, boardwalks are not
  walk-graph decks) so its interior stays empty; D-desk shows 1 typing bot (low has 6 workers); a
  scatter tree stands at the Coding devOffice door; D-campus-qa village frame crops the campus at the
  bottom; night screens read faint at T2.
- 2026-10-04: Phase 2 (sandbox) M11–M13 implemented on `claude/inspiring-pascal-19nwjr` and polished
  after the edit sweep (`mar-docs/qa/edit-sweep-2026-10-04.md`); sets ci/dev/edit/wow green with
  `--assert` (incl. gpuMemoryMB, now real and asserted — D-022), 6 self-tests. Sheets:
  `mar-docs/shots/M13-edit.jpg`, `M13-sweep.jpg`.
- Merged to `main` 2026-10-04 with the user's approval (D-023: main's parallel session-1 line superseded,
  kept in history). Still owed by the user: real-GPU checks (M1 60 fps high, phone 30 fps medium, `?perf=1`).
- Open items: villagers/sheep/crabs still walk onto flooded ground (walk graph built once); the lighthouse
  beam does not follow a reshaped lighthouse; high-quality composer `outputBuffer` carries MSAA×4 for
  nothing (~95 MB at 1080p); T0 tree-blob groups per island × variant (~18 calls); landmarks are not in
  `EDIT_BRUSH.protect`; no "edited" hint outside edit mode; rejected-brush reasons (`dock`/`plaza`) have
  no UI text; Phase 1 debts still listed in the 2026-10-03 note below are unchanged.
- Phase 1 debts (2026-10-03): D10 stepped beach/cliff bands; W5 camera looks along the steam plume;
  portrait overview ~1700 u fogs pale; W9 no sun glint; `marGridUv` ±1 u at the world edge; boats sample
  content SWELL on CPU (rain float ~0.06 u); high quality has no program headroom (24/24).

## Important Patterns
- Pixel determinism: same URL → byte-identical PNG under SwiftShader
- Shader formulas shared with CPU have TS twins + parity tests
- Shot presets are data in `src/content/shots.ts`; both the harness (`scripts/shots.ts`) and the app read them — keep them in sync

## Known Issues / Gotchas
- **Any coast zone / height edit on a bluff island reshuffles its water falls** (TASK-513): `placeWaterfalls`
  draws `r.next()` jitter per candidate lip cell (cells next to `Zone.cliff`) and the fall count after them, so new
  cliff cells (the obsidian cove walls) shift every pick and the count: seed 1001 Emberpeak went 1 → 3 water falls
  (none near the cove on 30 seeds). Expect it in shots, not a bug of the edit; a per-cell hash jitter would fix it
  but reshuffles every island once.
- **Late carves in `plan.finish` and zones**: zones are built before the sites, so a late cut keeps the old
  zone (green / cliff) unless the carve repaints it; a cut-only `groundWriter` skips cells already below the
  target, so repaint by region (the floor), not only by "cells written". `groundWriter` also clamps to
  `FLATTEN.minHeight` 0.4: a beach target under 0.4 would RAISE the cells between 0 and 0.4.
- **Two pads at different levels dip the ground between them** (TASK-466): a padded prop whose core
  overlaps another pad's core (the plaza, a lot) with `step` set is NOT relaxed to it, and
  `applyPads` blends the two plateaus by weight: a gate pad inside the plaza rim made a 1 u dip under
  its posts. Pad a kit piece only when no foreign core is within its core (`padOk` / `padFree`), and
  give a lot that must hold a district level BOTH `group` and `step` (a lot pad with the default
  0.2 u step is dragged to its neighbours' level, and the whole group follows).
- **Keep-out shapes must cover a pad's falloff** (TASK-466): a lot whose corner sits in another
  pad's margin (FLATTEN.discMargin) tilts 0.3–0.7 u; register the terrace / yard shape at
  radius + discMargin so `clear()` keeps the lots off it.
- **The plan runs before `applyPads`**: relief tests inside the plaza disc see the pre-pad ground
  (rough); furniture on the plaza needs `S.padRelief`, not `wideRelief`. A cable / cord checked
  against pre-pad heights must add `padLift` over pad cores (lot pads rise ≈ 1–1.6 u) away from
  its own ends.
- **Streets through the plaza**: kiosks / plaza furniture must be placed AFTER the street lanes
  (a kiosk lot on a street's rim exit blocks `nearestPathCell` → no street); plaza furniture keeps
  only `plazaLaneGap` off the lane centrelines (the plaza is one paved disc).
- Fixture `rotY` is the heading of local **+z** (render yaw = π/2 − rotY), not +x — the TASK-474 stack arch
  first came out rotated 90°.
- Sea marks (channel buoys, sea stacks) live in `world.seamarks`, hashed as `hashes.seamarks`, not in
  `world.fixtures`, so per-island plan snapshots don't move; `settlement-props.ts` renders both.
- **The Mossgrove stream carve does not reach the heightfield** (TASK-467): the profile's 1.1 u dent is
  swallowed by the dome's cross-slope and the 2 u grid; `world.streams` is a polyline over plain ground
  (easels / screens still read it). The only water a bridge can span is the sea, so the Design creek is
  cut below sea level in the planner (`glassBridge`), and every cut cell gets a NEGATIVE shore SDF: the
  settlements test holds `h > 0 ⇔ shoreSdf > 0`, `applyPads` skips sdf ≤ 0 cells (else the end pads refill
  the creek), and `pathStep` refuses sdf < minShore unless `ctx.passable[i]` (the deck cells).
- **A deep pad near the bluff band steepens the coast face** (TASK-467): the archipelago face test
  (p95 ≤ 68° over the first 6 u inland) fails when a site levelled over > 3 u has its pad reach
  (shape + margin + FLATTEN.falloff) inside the band; `onLand` only checks the CENTRE sdf. Design uses
  `cutOk` (`DESIGN_SITES.cut`) for the garden, glasshouses and windmill. Raising the relaxation sweeps
  (12 → 48) fixes the lot-corner bumps below but moves every island's pads (QA / DevOps tests): use
  keep-offs instead (`lotKeepOff` for the kit, `glasshouses.lotGap`, `prismWalk.keepOff`), and kit
  clutter on another pad's plateau gets no pad of its own (hot shop rack / shelf / crates).
- **Pad relaxation does not converge in a crowded chain** (12 pairwise sweeps): two overlapping cores
  with different `T` mix by distance weight and leave a 0.5–0.9 u bump under a prop corner (a glasshouse
  3.9 u from the windmill pad, a lot pad beside the block). Give a pad that must stay level a non-blocking
  "keep-off" shape = its core + the neighbour's margin (`glasshouses.keepOff` 4.5 u for lot cores, the
  windmill / bridge pads + 2 × discMargin), and use `FLATTEN.lotMargin` for rect pads whose corners are
  checked (the 2 u cells' bilinear phase eats 1.5 u on a slope).
- **A* lanes traverse steep flanks** (the slope cost is along-path only): a prop astride a lane needs a
  cross-step check at its posts (the Design pier lane crosses 2–2.6 u over 2 u on small domes, seeds
  1789 / 4419 / 7312: no arch fits). Put lane props mid-way in ≥ 5 collinear cells: the Catmull-Rom chain
  smoothing keeps a straight run, so the final path still passes under them after later links split the
  chain and re-phase the spline (3-cell runs drift up to 1.5 u). Do not smooth the lane yourself —
  the chains are cut at junctions that do not exist yet.
- **Islets own `islandMap` ids past the islands** (TASK-471): `world.islands[world.islandMap[i] - 1]` is
  undefined on a skerry / sandbar cell. Guard with `id > islands.length` (done in terrain-colors' palette
  row, settlements' `pathSparesSlopes`, the archipelago / edit tests) or use `coastBody(islands, islets, id)`
  in gen code. `cleanCoast` fill cells next to an islet must be owned by the islet (`nearestIsland` over
  islands + islets), or a DevOps-owned cell ends up 110 u from DevOps.
- **A layout change re-rolls the 30-seed plan tests**: zone / moisture noise is in world coordinates, so a
  translated island gets new forests and lot picks; thresholds tuned to 30/30 on the old seeds then miss
  1–2 seeds. Before touching a plan, run the OLD code on a shifted seed set (`1007 + k·263` in a worktree)
  to see the same misses; relax the threshold with a `TASK-xxx re-roll` note, don't chase seeds.
- **Re-pin recipe for raw cams**: dump old / new island centres per shot seed, translate every
  `'x,y,z,tx,ty,tz'` string by the delta of the island nearest its target (regex over `shots.ts`; the
  MOVE rows carry their seed inline), decode / translate / encode `EDIT_LOGS`; re-aim only the cams that
  then see another campus (budget) — W9 / W14 after the hub layout.
- `pnpm shots --tag=<t>` serves `dist-<t>/`: it needs its own build (no `--no-build`). Plan tests time out
  at 20 s when the machine's load average is > ~10 (other sessions); rerun the file alone.
- **Shore SDF sign differs by consumer** (TASK-472): the water shader's `sdfRing.x` is NEGATIVE into the
  sea (`d = -sdf` is the shore distance), the terrain's `uTerrainSdf` is positive inland — a "channel"
  mask (`MORNING_MIST.channelSdf`) needs `-sdf` on both; the first try masked the mist to 0 everywhere.
- The night wow frames (postcard / Beacon, pitch ≈ 13°, FOV 35°) see only the 0–4.5° strip of sky above
  the horizon: stars must survive into the fog band (`SKY.stars[q].horizonFade` 0.7°–2.9°) and the moon
  (33–40° high at 21–22 h) can never be in those frames — check it with a raw cam looking up.
- Foam-trail texture is RGBA (R profile, G age, B gain; `foam-trail.ts`), 512² over 768 u = 1.5 u texels:
  stamps closer than a texel (`SAILBOAT.trail.spacing` 0.5) keep the fresh line continuous, the shader
  widens by threshold with age. `splat` no longer uploads per call — once per `step`. Aged stamps fade
  out close up (`trail.nearFade`); the foam-dot V-wake is the T2/T3 wake.
- GLSL in template literals: a backtick inside a shader comment ends the TS string (TS1005 ',' expected).
- `((h % 24) + 24) % 24` leaves a float residue (5.3 → 5.300000000000001) that breaks `h <= edge` tests at
  non-integer window edges — use `h - 24 * Math.floor(h / 24)`.
- **One NaN pixel = black frame** (TASK-435, D-sky-basket): the composer input is HalfFloat and the
  bloom mip chain spreads a single NaN over the whole image (harness: `blank frame (sigma 0)`, no console
  error). Source was three's flat-shaded normal `normalize(cross(dFdx(p), dFdy(p)))` = 0/0 on a far L0
  sliver (Bug Zoo, 351 u) at the frustum edge — any new prop placement can trigger it; the lit factory
  now guards it (`FRAG_FLAT_NORMAL`). Also avoid `pow(x, y)` with x < 0 (undefined in GLSL). To find the
  culprit: read the composer `inputBuffer` with `readRenderTargetPixels` (Uint16, exponent 31 = NaN/Inf)
  and hide meshes one by one (temporary `window.__DBG = { scene, backend, ctx }` in app.ts + dev server).
  Hide with `o.layers.set(31)` + `__marisland.step()`: LOD/fade code rewrites `visible` every frame.
- **Shot artefacts that were not what QA named** (TASK-453b): the W14/W16 "water wedge" was ONE meshed
  deep-seabed chunk seen through the shallow ring's 0.8 alpha (its neighbours are skipped below
  `skipBelow`, so the rest shows sky) — water now goes opaque by the view ray's underwater run
  (`alphaRun`). The W15 "boat wake loops" were the moon glitter's sharp across-lobe tracing swell-normal
  contours far off (swell share now fades with footprint; the foam trail only gets fish-arc splats).
  The W13 "beige slabs" were mid-cliff terrain vertices with an UP normal: `sampleSurface` zeroed the
  gradient where the Catmull-Rom clamp is active, the wall shader gates strata on the smooth normal → the
  plain albedo showed through; clamped samples now carry the cell's bilinear gradient (`clamped` flag).
  A failed program just drops its mesh (water gone, no black frame): grep the page console for
  `Shader Error` after every GLSL edit.
- Canopy vitray panes sit on the giantTree blobs' DISPLACED, faceted shells (`GIANT_CANOPY` in
  landmarks.ts, ray cast per vertex + front-face subdivision): flat panes at 0.99 × the nominal radius
  were buried where the ±10 % noise bulged and stood off (silhouette slivers) where it dipped.
- Shadow pass: prop groups wholly past their half fade cast nothing (depth material discards
  `vFade < 0.5`), so `batcher.update(cam)` turns their `castShadow` off (`Group.casts` keeps the base).
  Boat kinds share ONE `WakeFoam` (life/index.ts, slot offsets) — a mesh per kind cost a call each.
- Gulls are sized for T0 specks but now fly through T2 cams (TASK-399): the TASK-151 model (3.4 u
  span of near-rectangular 1.5 u wing slabs) read as long planks when the flock passes 10–25 u from the
  camera heading toward it (chord foreshortened), and the old flap SHEARED (`y += a·|z|`, wing 33 %
  longer at the stroke peak). Now 2.2 u span, inner arm + swept dark-tipped hand (M silhouette), flap
  is a hinge rotation at |z| 0.12. Shader inputs were all nominal (limb w −1, aGait, matrices unit).
- "Orphan rotors" beside wind turbines (W7) were gulls, not a prop/LOD bug: flock altitude 12–25 u
  is turbine hub height, white raised wings next to a tower read as small rotors. Identify unknown
  shapes by projecting every InstancedMesh instance to screen (hook `__THREE_DEVTOOLS__` for the
  scene/renderer, catch the camera in `renderer.render`) before suspecting the batcher.
- Island size changes move the archipelago: `place()` attaches islands by decreasing reach, so an island
  that stays the smallest keeps every other dart, and the layout only re-centres (all islands translate
  by one delta) unless a gap / extent check fails. Check with a layout probe before picking a size
  (TASK-402b: Research ≤ ~28.6 u reach keeps seed 1001 a pure translation). Translations are not
  grid-aligned (2 u cells), so plans on the moved islands re-sample: positions shift by the delta ± a cell
  and world-aligned patch lattices (Coding solar) reshuffle.
- Pads relax every overlapping pair to FLATTEN.maxStep (0.2 u) through chains of neighbours: one dense
  campus becomes one plateau. Use `addPad(…, step, group)` to keep district levels (Research).
- Paths overwrite zones (Zone.path); a path along a bluff rim makes steep non-cliff cells
  (archipelago bluff test): keep links off the rim (Research blocks steep rim cells outside the cove).
- Picking/reactions (TASK-162): `src/interact/` (pure `picking.ts`, per-world `interaction.ts`), `src/anim/` (pose maths +
  matrix writer), bursts in `src/render/particles/bursts.ts`. `api.pick/hover/click(x, y)` (canvas CSS px) are the capture
  hooks. Reaction matrices must be written after `life.update` (interaction runs after the world view); prop reactions
  use partial `addUpdateRange`, agent meshes are re-uploaded whole every frame so never add ranges to them
- Shot cams / EDIT_LOGS are absolute world coords: any layout change (roster, campus) moves them —
  re-record (translate by the island-centre delta, drop rejected placements) and re-check E-* and D-desk
- `pkill -f` from an agent shell matches the shell itself (exit 144) — kill preview servers by pid
- Two angle conventions: anchors / `rotY` are xz angles (cos, sin); camera-controls azimuth puts the camera at
  (sin az, cos az). `rotY + 180°` is NOT an azimuth (mirrors about x = z, D1) — use `azimuthToward(rotY)`
  (`camera/framing.ts`). Camera presets are fits over generated points (`camera/poses.ts`, D-017); the pure
  pose maths runs in vitest against generated worlds (`poses.test.ts`)
- FOV 35°: a horizon is in frame only when the camera looks down < 17.5° (top third: 6–17.5°)
- Never `git stash` in the shared tree (even for a quick baseline): it removes other agents' WIP files until
  `stash pop`. Baseline via a worktree instead
- Prewarm compiles against the composer target (fixed in app.ts): `programs` at ready == after 60 frames (checked
  in the D-016 audit). Program inventory: `tsx scripts/programs-dump.ts <url> "<query>"` (FULL=1 keys,
  ATTRS=1 attribute locations + generic values, MESHES=1 meshes relying on default attributes)
- three `defaultAttributeValues` are applied only at VAO build and generic attribute values are context state →
  any attribute that may be missing from a geometry needs a fixed `layout(location)` (`ATTR_LOCATION`, D-016),
  otherwise another program's default leaks in (fish were black for that reason)
- Program key gotchas: `instanceColor` present/absent, `transparent` (opaque flag), Mesh vs InstancedMesh and a
  missing `normal` each split a program even with the same `customProgramCacheKey`
- The session scratchpad is shared by all agents: use a unique sub-dir (e.g. `prog-base-wow/`), not `base-wow/`
- NEVER `git add -A src` (or `git add src/render`) while agents are active — it sweeps their half-done files
  into HEAD and turns CI red (happened twice). Stage explicit paths; agents never commit
- Parallel agents share ONE working tree: `pnpm shots --tag=<name> --port=<n>` gives each its own `dist-<tag>/` and
  `shots/<set>-<tag>/`; `git add src/render` can sweep up another agent's half-done files — add paths explicitly
- `.claude/worktrees/` (Agent isolation=worktree) sits inside the repo: ignored in eslint/prettier/git. The
  harness may create the worktree from an OLD commit (not the orchestrator's HEAD) → tell every worktree agent
  to `git merge <orchestrator-branch>` before editing, and verify with `git log -1`
- Agent worktrees were created from `origin/main` (not the orchestrator's HEAD) on 2026-10-04: every
  worktree agent must `git fetch` + `git reset --hard <orchestrator-branch>` (not merge) when its base has
  unrelated history, then verify `git log -1`
- Worktree agents can't commit as-is: the pre-commit hook needs `node_modules`. `ln -s <main>/node_modules
  node_modules` in a separate command, commit, then remove the link (2026-10-13). The `docs` agent has no Bash:
  it writes files, the orchestrator commits them.
- `pnpm shots --assert` only checks budgets and blank frames; it passed with pennant lines across the sky and a
  roof at the lens. Always open contact.jpg and the full PNGs of changed shots (2026-10-13).
- `renderer.info.memory.geometries` counts a geometry from its FIRST DRAW: leak checks must draw every
  scene object once (forced visible, culling off) before counting, or hidden/culled life meshes read ±1
- Zones are generated before settlements terrace lots / carve docks, so `world.zone` is stale there (20–80
  samples per world); recomputing after settlements would change every hash and shot — edits re-derive
  shore-driven changes only (D-020 addendum)
- Stale `vite preview` servers from other agents can hold a port for an hour: pick a port, check it is
  free (`curl -s localhost:<p>` fails), never reuse another agent's
- A second WebGL context's synchronous calls (context creation, `readPixels`) wait for the main context's
  queued frames (0.9–2.5 s under SwiftShader) — do such work at idle time, once, and cache
- Swap textures in shared uniforms by reference, never `texture.clone()` (a clone is a second GPU texture
  that survives regen → `selftest=regen` leaks 5→6)
- `selftest=regen` / `selftest=edit` report a ±1 geometry delta with `cam=village` (pre-existing, not with
  `cam=overview` where the harness runs them) — open item
- The first `gl.texSubImage2D` of a session stalls until the in-flight frame finishes (50–950 ms under
  SwiftShader) → the rebuild path is prewarmed at idle time after `ready` (interactive mode only)
- `PickHit.id` for props is the edit-model id (scatter index / ≥ 2²⁰ for edit-added / −1 settlement);
  the render-store slot is `instanceIndex`
- `freeze=1` + `api.edit` steps the loop once per command: compare frames only at equal step counts
  (`step(1/30, n)`), never "before" vs "after" directly
- Vertex attribute limit: a 17th attribute fails to link under SwiftShader/ANGLE — pack per-instance data
  into vec4s (`aGait`) and share materials (D-013)
- CSS: a second `animation` on an element replaces a `forwards`-filled pop animation → element vanishes / inline
  transform ignored. Animate an inner span, or add a `.shown` class that sets final styles after the pop
- PropBatcher: the first `setTier`/ground-cover reveal must be instant (before the first frame) or `hardPops` > 0
- SwiftShader leaves sub-pixel cracks even on bit-identical shared chunk edges → terrain skirts 0.15 u below edge
- Water fogs itself with the FogExp2 curve (`1-exp(-(d·dist)²)`); keep `SHARED.uFogDensity` = scene.fog.density
- Spring k=180,c=12 overshoots 21 %; bible's "8 %/300 ms" needs c=17 (D-008)
- `InstancedMesh.dispose()` frees the instance matrix only — dispose `.geometry` yourself (the regen leak
  99→130 geometries was contact-blob `InstancedBufferGeometry`s)
- Regen: keep the OLD world's materials alive until the new world's `compileAsync` finished, then dispose
  them — otherwise three re-links every program (1218 → 144 ms over 3 regens)
- Context loss: dispose the world WHILE the context is lost (after restore it spams "object does not belong
  to this context"); `restoreContext()` must not be called from a microtask inside the lost event (wait a
  `setTimeout(0)`); `gl.finish` does not sync under SwiftShader (use a 1-px `readPixels`)
- `scripts/shots.ts` runs `selftest=regen` + `selftest=ctxloss` on the first preset of ci/dev (~15 s);
  `--no-selftest` skips
- Water foam-trail texture is 256 texels over 384 u (3 u/texel): never splat anything < 2 u wide into it
  (the sailboat wake became a 10 u smear) — fine foam goes through instanced discs on the creature program
- `geo/buildings.ts` keeps its own per-variant palette; `content/settlements.ts` `LOT_ROOFS` mirrors it (a
  test checks counts, not colours) — change both together
- three r186: `PCFSoftShadowMap` removed; `THREE.Clock` deprecated
- pmndrs `postprocessing@6.39.5` needs three `<0.187` — don't bump three
- pmndrs `BloomEffect` defaults to `BlendFunction.SCREEN` → rings around HDR sources; use ADD (D-012)
- Sky stars on an (az·cos el, el) grid shear into streaks; use per-row cells with an integer count
  around the sky; stars < ~1.5 px alias into diagonal dashes under FXAA
- Night grade + flat-shaded facets: a luminance-only "spare highlights" test flips facets of lamp-lit
  ground between warm and blue → spare by hue (r − b) too
- `renderer.compileAsync(scene)` compiles EVERY mesh's material (`scene.traverse`, not
  `traverseVisible`): a hidden mesh still costs a program in `info.programs`
- Sharing one ShaderMaterial between meshes only shares the program if the geometries agree on
  program-keyed attributes: a missing `normal` (`vertexNormals`) compiled a 2nd program (rain on
  the puff material, TASK-172)
- Weather: a fully clear blend must stay the exact identity (clear shots 0 px diff vs pre-weather);
  guard new weather terms with `if (uX > 0.0)` / identity multipliers, not approximations
- SwiftShader fps is meaningless; assert counts from `renderer.info`
- Art bible W-shot seeds (1001, 2024, …) are placeholders until TASK-113 pins real ones
- **SMOKE-001 (2026-10-03):** Chromium 141 + Playwright 1.56 + SwiftShader: HalfFloat + MSAA render through pmndrs EffectComposer identical to low-quality path; 30 frames ≈9 ms CPU; determinism OK (same frame byte-identical); ready time ≈200 ms; KHR_parallel_shader_compile not supported (warning only)
- Playwright CDN unreachable from container; 1.56 stays pinned; cannot upgrade to 1.63
- `pnpm shots --port=<n>` reuses a port that is already served by *another* agent's preview ("already served
  (not ours)") → wrong build gets captured. Every parallel agent needs a unique port
- Camera: a pose set via `setLookAt` is not clamped, but the next rotate is → preset poses must sit inside
  `pitchBand()` or the first input snaps the pitch
- CSS: unitless `0` inside `calc()` in `translate()` invalidates the whole transform — use `0vmax`
- Wall-clock perf tests use `perfLimit()` (`src/test/perf.ts`): ×2 under `CI` (2-core runners), ×1 locally,
  `MAR_PERF_SCALE=0` disables them; on a loaded container re-run `pnpm vitest run src/world` alone before
  calling a failure a regression (best-of-N already filters worker contention)

- Draw calls: a per-group `InstancedMesh` costs 1 call; contact blobs are merged per LOD in the batcher (`blobMerge`).
  A new per-(def, island) mesh type needs the same treatment; sky craft are only 2 calls, island groups dominate
- Far structure merge (D-049): at T0–T1 LOD1 draws through `props:far:*` meshes where `uMarMerged` = 1 means
  `aSpin.xyz` = instance origin, `aAppear` = scale, `aSpin.w` (< 0.5) = baked facade code. A new per-instance
  term in the lit shader (anything reading `marOrigin`, `marM`, `objectNormal`, `aAppear` or object-space
  `transformed`) needs a merged twin, or its LOD1 geometry must carry an `aSpin` tag (stays instanced).
  Don't pack data into `aSeed`: its fraction is the wind phase (1024 yaw codes → visible sway diffs)

> Rules: read at session start; update gotchas/patterns as discovered; delete stale info; keep it
> short. Architecture decisions go to DECISIONS.md, not here.
