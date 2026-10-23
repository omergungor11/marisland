# Project Memory

## Project Info
- Marisland: procedurally generated cute/cozy stylized archipelago in three.js (WebGL2), 5–7
  islands, zoom-revealed detail, living ambient life. Phase 1 diorama, Phase 2 sandbox building.

## Project Status
- **Planning**: COMPLETED 2026-10-03 — ARCHITECTURE.md, ART_BIBLE.md, skills, agents, PROMPT.md
- **Phase 0**: COMPLETED 2026-10-03 — CI + Pages deploy green on first push
- **Phase 1**: M1 in progress (terrain, water done; lighting/post landing), M2 worldgen in progress, M3 batcher/scatter done early

## Where I left off
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
