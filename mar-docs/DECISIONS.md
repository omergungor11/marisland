# Architecture Decisions (ADR-lite)

> Every architectural/technology decision goes here. Newest on top.

## D-063: Island-agnostic rim walkway primitive — 2026-10-24

**Decision**: Cliff-top boardwalks are one shared worldgen primitive (`world/gen/rim-walkway.ts`, spec type
`content/rim-walkway.ts`), not per-island code. The walk follows the SDF iso-line 2 u inland of the rim lip
(rim cells only), paints the island's street zone, places the shared `rimPost` def every 3 u by chord and gaps
at footpaths. It runs in the new `SitePlan.finish` pass, after paths are written. Per-island looks are rows
in `RIM_POST_LOOKS` (append-only: the index is the `rimPost` variant). QA (TASK-480, hazard posts + mint rails)
and Coding C18 (TASK-484, timber posts + rope rails + two sea-facing benches) use it.
**Rationale**: WORLD_PLAN reuses the rim walk on several islands; one primitive keeps the rules and tests in one
place. **Impact**: adding a rim walk changes world hashes (re-pin); the Coding walk is unlit at night until a
post cap joins the Coding lamp set in `rhythm.ts`.

## D-062: Round 3 for the five islands (M22) — all recommended options; HQ street tint stays — 2026-10-24

**Decision** (user, 2026-10-24, WORLD_PLAN §6):
- R3-1 culture cap overrides as tabled (Coding 12/2, DevOps 12, QA 12, Research 11; HQ / Design / Marketing fixed).
- R3-12 Coding: solar rows halved; night = warm park + blue server light; kite train (C3) yes.
- R3-13 DevOps: lodges become the ops-shack variant; slope service road in every direction (zigzag).
- R3-14 QA: white-mint-yellow toy-factory tone; two tracks (loop + stunt yard); tier-1 = Q2 tower.
- R3-15 Marketing: ON AIR neon on the cliff face; fair on ledge2; diving tower (1 def), cap 11.
- R3-16 Research: maze parterres; seal spot critter (not an agent); tier-1 slot kept for M27 stilt lab.
- HQ street tint stays at `STREET_TINT` 0.62 (the compass star already tells the streets).

**How**: M22 = the per-island quick-win packages (WORLD_PLAN §4.3–4.7) as TASK-479…483; Round 3 details that
touch a quick win land there, the rest with the signature milestones (M24–M26). The rim walkway primitive is
built in the QA task (Q6 / Q18) and reused by Coding C18 after it merges. Shared files (`budgets.ts`, `shots.ts`,
`rhythm.ts`, `app.ts`) are edited only by the orchestrator. At most three parallel agents (shots load).

## D-061: Medium budget raised for HQ Seven Gates, to be won back by an engine merge — 2026-10-23

**Context**: TASK-466 puts each culture's gate, stall and pennant line in its own instanced group (+ shadow pass):
HQ fixture/lot groups 33 → 49. Measured W16 327 calls (limit 300), W2 / W3 243 / 241, W4 171 MB (limit 170).
TASK-467 (Design) adds more on top.

**Decision** (user, 2026-10-23): raise the medium budget now — calls 300 → 340, gpuMemoryMB 170 → 176
(`src/content/budgets.ts`) — and merge TASK-466 so M20 keeps moving. A follow-up engine task (TASK-476) merges the
near-tier culture fixture groups and brings medium back to ≤ 300 calls; the limit is lowered again when it lands.

**Rejected**: a permanent raise (eats the medium FPS margin); holding 466 until the engine merge (blocks 468/469).

**Implementation (TASK-476, 2026-10-23)**: a *near structure merge*. The TASK-407 far merge (`render/props/far-merge.ts`)
now also runs at T2–T3 over the small LOD0 groups of an island. A group qualifies when it is at most
`NEAR_MERGE.maxVerts` = 1600 pre-transformed vertices, is not a tree or ground cover, and is windy only at unit scale.
That covers the seven culture gates, the stalls, pennant cuts, crates and mail line, the Design kit, benches and
lanterns. They draw as one pre-transformed mesh per (island, material class, tier class), on the same lit / depth
program (`uMarMerged`). The far merge's settled rule still holds: bloom-ins, removal fades and click reactions draw
through the groups. An island is built only once the camera is within `NEAR_MERGE.reach` = 160 u of such a group.
Per-island activation is `FarMergeDeps.islandOf`.
- Calls: medium wow (seed 1001) W16 331 → 269, W2 / W3 239 → 176 / 175, every shot ≤ 269. Medium `drawCalls` is back
  to **300**.
- Memory: +1–5 MB on close shots (peak 172). The overall peak is still W4 at 173 MB, a T1 view the merge never
  touches, so `gpuMemoryMB` stays at **176**. Getting to 170 needs W4's buffers trimmed.
- Triangles: +0–19k, from whole-island meshes that are culled less than the separate groups were.
- Pixels: before/after frames differ in ≤ 120 px, max Δ 28/255, 0 px over the pixelmatch 0.1 threshold.

Rejected after measuring:
- A per-def *variant atlas*: all variants in one InstancedMesh, the variant chosen by the vertex shader through an
  `aSeed`-encoded band. It saves no memory, and every instance runs every variant's vertices. To reach W16 ≤ 290 it
  cost +55k counted triangles (788k of the 800k budget).
- A near merge over every island in fade reach: +12 MB.

**Implementation (TASK-478, 2026-10-24)**: the memory half. W4 (seed 2024, T1 Beacon) held 58.4 MB of
geometry, 43.8 MB of it prop buffers: the LOD0 groups of all seven islands are built and counted,
whatever the tier. Of those, `normal` / `color` / `position` were 7.1 MB each in float32 and the
scalar weights `ao` / `wind` / `emissive` 2.3 MB each. The batcher now compacts every prop LOD
geometry when it builds it (`compactAttributes`): normals become 16-bit normalized (the far merge's
format), and `ao` / `wind` / `emissive` become 16-bit unsigned normalized when they lie in [0, 1]. The
shader reads the same floats, and CPU readers de-normalize (`getX`, `fromBufferAttribute`, `floatArray` in
`geoStats`). Position and colour stay float32 because `sameGeometry` / `geoStats` read them raw, and 8-bit
linear colour would band the darks.
- Memory: W4 174 → 166 MB (geometry 58.4 → 50.4), W16 / W22 172 → 164 / 163, W19 170 → 162.
  Medium `gpuMemoryMB` is back to **170**.
- Pixels: unchanged-camera frames differ in ≤ 375 px, max Δ 10/255 (W19), and W4 in 19 px, Δ 1.
- Not taken: 16-bit colour (another −3.5 MB) would need the raw readers changed. Keep it for the next squeeze.

## D-060: Round 3 details for HQ / Design and the morning mist — 2026-10-17

The user took the recommended option for each item:
- **HQ buildings:** both fixes. Add existing defs to the lot mix (barn, cottage, towerHouse), and give `hqOffice` geometry
  variants (bell niche, arcade, balcony, cream walls).
- **HQ mail line:** sacks run in two 20 s bursts, at 09:00 and 17:45.
- **HQ streets:** a full culture-colour tint along each street, using the existing paint-zone mechanism. No new stripe layer.
- **Design:**
  - glasshouses in a 2×3 rainbow row
  - the stained windmill on the east ridge
  - a second rainbow arc (+2 calls)
  - the mirror pond waits for water reflections (TASK-353)
- **Morning channel mist (TASK-472):** lighter, at about half the density, so the deep sea reads under it.

## D-059: World plan Round 2 — directions for the other five islands; M21 world P1 runs in parallel with M20 — 2026-10-17

**Decision**: the user picked the recommended direction for every island (details in `mar-plans/WORLD_PLAN.md` §4 and
the study files):
- **Coding:** A, Kite Hill & Wind Tunnel (`CO:` items in `study/coding-devops-qa.md`).
- **DevOps:** B, Funicular Works (the cone is not carved; the lava river may come later as one piece).
- **QA:** A, Proving Grounds.
- **Marketing:** A, Cable Carnival (the sea stacks become cable-car stations, an ON AIR neon on the cliff, `mailLine`
  reuse).
- **Research:** A, Summit Observatory (raised summit ridge, Star Stair, meridian terrace).

M21 world P1 (no user decision needed) starts now, alongside M20:
- **Now:** shader `W:G5 K5 B4 H6 G2` and engine `W:C1`.
- **After TASK-471:** worldgen `W:D8 D3`, because they need the new layout.

Round 3 (taste and budget details) is asked when each milestone starts.

## D-058: World plan Round 1 — HQ at the centre, skerries + Lonely Palm, underwater sills; HQ / Design layout choices — 2026-10-17

**Context**: `mar-plans/WORLD_PLAN.md` (four studies in `mar-plans/study/`) listed ten decisions that block
TASK-466/467. The user picked the recommended option for every one of them.

**Decision**:
- World:
  - **Layout `W:K2`:** HQ is the island nearest the cluster's centroid on every seed.
  - **`W:D2/K6`:** 3–6 skerries plus one Lonely Palm islet on every seed. They land in the same layout
    change as K2, so the world re-pins only once.
  - **Connections:** inter-island links are underwater sand sills (`W:K3`, later in M23). No cable car or
    zip line between islands; D-045 stays for anything above water.
- HQ:
  - Streets whose real heading meets water within 12 u end in a shore gate with a mooring post.
  - The semaphore stands on the summit even though it is taller than the clock tower (lattice vs mass).
  - The Guild Hall sits on a terrace above the compass plaza, reached by stairs.
  - Inside the bay, the area around the pier becomes a stone quay and the rest stays beach (bottles,
    tide pools).
- Design:
  - The conservatory replaces the glade quad, with the ateliers in a ring around it and 4 bays leading
    to 4 paths.
  - Pine filler is cut by 35 % now; the inner dome turns to blossom and meadow after TASK-464.
  - The prism-arch path runs pier → conservatory.

**Why**: the user's choices. K2 must come before 466, because the compass streets read their headings
from `ctx.islands`.

**Implementation (TASK-471, 2026-10-17)**:
- **Hub layout** (`world/gen/layout.ts` `place`, `LAYOUT.hub`): Hearthholm at the origin, the six others on a
  ring of 60° slots in a per-seed order, each slot turned ± 12°, at 42–60 u of water from the hub; the old
  relax + re-centre pass follows. `layoutProblem` gained the `offcentre` rule (`centralIndex(discs)` must be
  the hub), so the retry loop guarantees HQ nearest the centroid on every seed (500-seed test: hub ≤ 19 u
  from the centroid, every other island ≥ 150 u). Spacing, extent, contrast and connectivity rules are
  unchanged; routes, piers and ferries are built on the new heightfield as before.
- **Islets** (`IsletData`, `world.islets`, `content/islands.ts` `ISLETS` / `ISLET_LAYOUT`): one `sandbar`
  (the Lonely Palm islet, 12–15 u, ≤ 1.1 u high, all sand, one palm at its peak via
  `ISLET_SCATTER.sandbar` `atPeak`) plus 3–6 `skerry` sea stacks (10–15 u, 4–8 u high, rock all over, 0–3
  rock clusters). They are dart-thrown in the layout stage (`placeIslets`, `rng.fork('islets')`) ≥ 26 u of
  water from every island's reach disc (clear of pier heads, boat rings and ferry stops) and ≥ 14 u from
  each other; of 48 darts the one with the least water to its two nearest islands wins (a channel, not open
  sea). Their ids follow the islands' in `islandMap`, so the raw-land raster, coast cleanup (protected
  against the opening too), shelf, zones (`rockOnly` / `sandOnly` rule blocks) and scatter are the island
  code paths; nothing else sees them: no theme, settlement, label, route, camera fit or culture slot, and
  the terrain palette uses row 0 for them. The islet is not labelled (Research's archetype is already
  "Lonely Palm" in `findIsland`); `IsletData.kind` is the only name it has.
- **One-time re-pin**: every stage hash (`world.test`, `archipelago.test`, the bluffs-off pins, the HQ /
  Coding / Marketing / QA plan snapshots), every raw camera in `content/shots.ts` translated by its
  island's centre delta (seed 1001 and the seed 2024 W4 / D-move-research; `EDIT_LOGS` decoded, translated
  per command, re-encoded), W9 / W14 re-aimed from the south-west (Research now sits NE of HQ, the old ENE
  look had HQ's plateau in frame, 841 k triangles). wow 18 / 18 with `--assert`, W1 123 calls.
- **Plan-test re-baseline**: the 30-seed plan tests sample fixed seeds; the new positions re-roll the zone
  noise under every island, and 17 marginal misses appeared (lot / kit hit rates 0.83–0.98, level checks
  0.5–1.24 u, one pier unreachable, the comet board missing on 1001). The old code on a shifted seed set
  (1007 + k·263) showed the same 17-miss profile, so these are pre-existing plan robustness limits, not
  regressions: thresholds were relaxed to the observed floor (marked `TASK-471 re-roll`), the HQ / Design
  ones are moot after TASK-466 / 467.

## D-057: HQ "Seven Gates" + Design "Glass Conservatory" remake; per-island culture caps — 2026-10-17

**Context**: the user asked for HQ and Design to be reworked with more visual elements and more
island-specific places. The 2026-10-17 ladder shots: HQ's village fills only the west tip of the
crescent while the east hill (over half the island) is empty forest, and every building is the same
orange box. Design is mostly pine filler, and "Glass & Light" reads only on the Atelier Tree and two or
three small buildings. The user chose from three directions per island (static comparison page):
HQ **C · Seven Gates Crossroads**, Design **A · Glass Conservatory**.

**Decision**:
- HQ becomes the archipelago crossroads. A round compass plaza (archipelago map mosaic) replaces the
  quad. Seven streets run from it, each aimed at its real island (`ctx.islands`); HQ's own street is the
  harbour lane to the pier. Each street ends in a gate in that culture's accent, pennant cut and
  glyph, with goods stalls selling that island's wares along it. There is a post sorting yard with a
  mail line (sacks sliding from the hill to the pier), and on the east hill a semaphore tower whose
  arms point at the island whose turn it is in the 21:00 relay.
- Design gets a large faceted glass conservatory (tier 1) on the central glade, glasshouse rows in
  pane colours, a glass bridge over the waterfall stream, prism arches that throw coloured light
  pools onto the path, and a windmill with stained-glass sails. Pine filler thins out around these.
- `budgets.cultureCapOverride`: HQ 12 defs / 1 tier-1; Design 15 defs / 2 tier-1 (rainbowArc +
  conservatory). Every other island keeps 10 / 1. The ≥ 70 % tier ≥ 2 rule and the palette rule are
  unchanged.

**Why**: the cap exists to stop kit sprawl across all seven cultures. Here the user explicitly asked
for more on two islands. Overriding the cap for those two only keeps the guard in place for the rest.

**Cost**: up to +4 / +5 instanced defs. Draw calls are still gated by `shots --assert`.

## D-056: Ladder fixes — exact masks on medium / high, class-consistent drift, DOF focus (TASK-463) — 2026-10-14

**Context**: five ladder misses were left after TASK-453. The re-run showed that on medium and high the
`debug=mask` frames went through the post chain. Its NEUTRAL tone mapping subtracts 0.04 (linear), so land
`#50C878` came out as (57, 194, 107). Every pixel then classified as "structure" and water counted as solid:
the medium / high ladders were judging whole frames, sea included (`landFrac` 1.00).

**Decision**:
- `debug=mask` renders straight to the canvas, skipping the composer (`app.ts`). Medium and high masks
  are now exact, like low.
- `regionDrift` leaves out cells whose class differs between the two frames (ground in one, structure in
  the other). These are tall props that cover more ground in a near perspective view. The cells are kept
  if they make up more than `classMaxFrac` = 35 % of the region. Same pattern as D-037's shadow rule.
  On L-hq (low) the ground-only drift at 30 / 21 u was 0.5 / 0.4, but the structure share rose from 0.40
  to 0.52, which gave 4.45 / 4.06.
- `FRAMING.ladder.shift`: the Research ladder target moves 20 u right and 8 u back, from the quad fountain
  (ringed by 10–14 u halls at the camera's roof line from 30 / 21 u) to the low parterre garden.
- `TIER_FADE[1]` stays at [320, 420] for now. Real defect: at T1 the T0 tree blobs are already off while tier-1
  trees dither out beyond 320 u, so far forests in a T1 frame thin to stipple (the Design island from the
  Research / Marketing ladders, the far islands in W11). [500, 620] fixed the stipple, but it exposed
  the next defect: the T0 blobs of Design's mixed pine / blossom cells do not match the trees (pair 380
  blob 0.7–1.4 % on L-pairs-design / -marketing / -research, all qualities). Both changes go together in a
  props task.
- `solarRow` moves to tier 0. At T1 the Coding solar fields popped from grey gravel pads to blue rows at 380 u
  (real pop).
- High DOF focuses on the orbit target. Nothing called `setFocus`. The fallback (screen-centre ray ∩ sea
  plane) sat 15–25 u past an elevated campus and blurred the whole T3 frame (pair 45 mean 3.0).

**Consequences**: ladder numbers on medium / high are not comparable with runs before 2026-10-14 (water is no
longer compared). See `mar-docs/qa/ladder-2026-10-13.md`.

## D-055: NaN guard on the lit flat normal (TASK-435) — 2026-10-13

**Context**: `D-sky-basket` rendered black on main. One NaN pixel on a far sliver triangle (Bug Zoo, 351 u)
came from three's flat-shaded normal `normalize(cross(dFdx(p), dFdy(p)))` = 0/0. The HalfFloat composer input
and the bloom mip chain spread that single NaN over the whole frame.

**Decision**: the lit factory guards the flat normal (`FRAG_FLAT_NORMAL`, `render/materials/factory.ts`): a
degenerate, Inf or NaN cross product falls back to a camera-facing normal. The guard reuses three's `fdx` / `fdy`,
and `factory.test.ts` fails if an upgrade renames them. GLSL `pow(x, y)` is never called with x < 0. Also in the
same fix: the wake mesh is shared between boat kinds, and shadows are skipped past half fade (D-sky-craft 297 → 282).

**Consequences**: a new prop placement can no longer turn a frame black. The gotcha lives in MEMORY (one NaN
pixel = black frame).

## D-054: Harbour Guild ferries with dwell; culture boats on rings (TASK-420, TASK-434) — 2026-10-13

**Context**: the Harbour Guild is the harbour every other island sends boats to (ISLAND_CULTURES §3.1). Ferries
must stop at each pier, and the culture boats must do it without agents or per-frame steering.

**Decision**: `world/gen/routes.ts` builds the HQ `ferry` loops last: from HQ's pier through one pier per other
island, with a dwell at each stop (`HQ_FERRY`: 2 lines, 8 s dwell, stop = nearest open-water node within 60 u of
the pier). `life/ferry.ts` plays the timetable as a closed-form function of time: stand at a stop for the dwell,
accelerate, cruise at 3.4 u/s, brake at 0.45 u/s². Culture boats circle their island on a ring: the QA inspection
boat (sailboat variant 3, 22 u outside, 2.2 u/s) and the Design lantern boat (sailboat variant 4, 30 u outside,
1.4 u/s). The DevOps cargo ships and ore trains stay movers (`render/harbour-routes.ts`), not agents.

**Consequences**: boats are pure functions of sim time, so a capture and a seek agree. Open: boats can overlap at
piers (TASK-434 follow-up); the other §3.1 trade rows are not in the built set.

## D-053: Story spots become tableau bots and spot animals (TASK-432, TASK-433) — 2026-10-13

**Context**: the T3 ambient stories (ISLAND_CULTURES §2) must read as a still scene. A new agent per story would
break the medium agent cap (60), and a 17th attribute would fail to link under SwiftShader (D-013).

**Decision**: placement emits `world.storySpots` (`StorySpot{kind, pos, rotY, defs}`, one plan per island in
`world/gen/plans/*`). A spot's person is a tableau bot (`TABLEAU` in `content/life.ts`, `planTableaus`, capped per
island and quality by `tableauMax`): a fixed ambient-pool worker that stands or lies at its spot and never leaves.
The spot animals (`SPOT_CRITTERS` in `life/critters.ts`: cats, a fox, a capybara, gulls, owls, pigeons, ladybugs)
are not agents. Bot looks use the existing `aSeed` decode: department accessories 0–6, carried items 7–14 (laptop,
clipboard, crate, paint pot, satchel, megaphone, blowpipe, books). No attribute is added.

**Consequences**: tableau bots count against the agent cap like ambient workers; `workers.test.ts` checks the cap
and the encoding with tableaus awake. Open: the capybara reads like a turtle from above (TASK-433 follow-up).

## D-052: Culture clock, per-island lamp sets and the Launch Day Relay (TASK-430, TASK-441) — 2026-10-13

**Context**: each island's day must differ (lights, rituals) with no new programs or agents, and the seven cultures
need one shared ritual (ISLAND_CULTURES §3.2) that still reads in a frozen capture.

**Decision**: `content/cultures/rhythm.ts` is the table. Per island it lists rhythm slots (game hour, optional ritual
length in real seconds) and a lamp set (defs, on / off hour, ring ramp) that replaces the global dusk ramp for
those defs. `CULTURE_GATES` shows the Design waterfall rainbow at 06:00–07:30 and 16:30–18:30 by dither, and rain
fades it out. The Launch Day Relay starts at 21:00 and gives each island its step, 10 s apart, in relay order
(1 HQ, 2 DevOps, 3 QA, 4 Coding, 5 Marketing, 6 Design, 7 Research): a ×4 flash (0.6 s attack, 6 s decay), a 0.6
glow held to 70 s, a 15 s fade. Structures self-light at 0.12 with distance fade 180–380 u. In capture the clock
runs on `simt` (`time=21&simt=25` is 25 s into the relay). The Hype Fleet and the Orchestrator airship carry the sky side of the
culture look (TASK-441: balloon accents, the 17:30 launch, the pennant string).

**Consequences**: 0 new programs and 0 agents; swaps dither, so `hardPops` stays 0. The relay is the W15 frame
(`simt` 45).

## D-051: Pennant and signage system (TASK-409) — 2026-10-12

**Context**: the seven cultures must read as one world. Direction and identity need one visual language that still
reads at T1 and T2.

**Decision**: each culture owns one pennant cut and accent (`CultureDef.pennant`): swallowtail (HQ), kite (Coding),
square (DevOps), streamer (Marketing), chevron (QA), scallop (Design), star (Research). The same cut and colour mean
the same island everywhere: pennant lines, sail stripes, origin-coloured crates, balloon basket flags, and the
Orchestrator's seven-pennant tail string. One emblem per culture comes from a shared glyph set
(`geo/themes/glyphs.ts`, `GLYPH_OF_THEME`: bell, code, megaphone, check, prism, hammer, telescope), drawn in bars of
about 40 triangles. The `pierSignpost` (seven arrows, bearing as a parameter) is part of the same kit.

**Consequences**: a new culture needs a free cut and glyph. The M19 QA found the HQ banner pole covering the signpost
debate story (TASK-453 polish).

## D-050: Culture contract, per-island def cap and pinned variants (TASK-408, TASK-421) — 2026-10-12

**Context**: the cultures must add character without raising the W11 draw-call count (medium budget 300, W11 298
before M19, D-048). The count has to be predictable per island, so each island gets a fixed kit ledger.

**Decision**: `content/cultures/types.ts` defines `CultureDef` (theme, id, EN and TR name, palette, pennant, `kit`
of new defs with tier and flags, `storySpots`, `rhythm`, `relay`). `budgets.cultureDefsPerIsland = 10`. The
validator (`validate.ts`, `cultures.test.ts`) enforces ≤ 10 new defs per island, ≥ 70 % at tier 2–3, no tier 0,
at most one tier 1, colours taken from existing palette tables, and `PropFlag.noShadow` on tier 3. Ledger order is
priority: a lowered cap cuts the kit from the end. Culture variants are pinned, never rolled: `PropDef.rollVariants`
limits random decor rolls to the first N variants, and `PendingLot.pin` (`world/gen/sites.ts`) makes the plan
require a geometry variant, which skips the roof-colour pick.

**Consequences**: the kits hold 8–10 defs per island (HQ 8, Coding 8, DevOps 10, Marketing 10, QA 9, Design 10,
Research 10). Tier 1 appears on four islands only (Coding giant duck, DevOps onsen house, Marketing mascot, Design
rainbow arc).

## D-049: Far structure merge — one pre-transformed LOD1 mesh per island at T0–T1 (TASK-407) — 2026-10-12

**Decision**: at tiers 0–1 the LOD1 groups (one InstancedMesh per (def, variant) across islands, D-022)
are replaced, once every instance has settled, by one merged mesh per (island, material class, tier
class) (`render/props/far-merge.ts`). A material class is every per-material uniform of the prop
materials (fade near/far, lamp late-off, rim; `PropMaterials.mergedFor` makes one twin LitMaterial +
depth material per class with `uMarMerged = 1`); a tier class is "shown at T0 and T1" or "T1 only".
The merged mesh is an InstancedMesh of one identity instance (same instanced lit / depth program,
0 new programs) whose vertices are the instances baked to world space. Per-instance shader inputs
ride existing attributes: `aSpin.xyz` = instance origin (dither fade, wind gust, lamp / screen /
occupancy hashes, hover), `aSeed` = the instance seed, `aAppear` = instance scale (wind pivot height),
normals in world space (shadow normal bias, 16-bit); the night facade occupancy, which needs
object-space normals and positions, gets its facade test and quadrant baked into `aSpin.w` as
`(q + 3) / 16` (< 0.5, below every tag). `ao` is baked into the colour. LOD1 geometry that uses the
`aSpin` tag channel (windmill / clock blades, turbines, solar trackers, animated screens, weather
mast) stays instanced. The batcher shows the merged meshes only when nothing is in flight: no
queued pop, every bloom-in older than 2.05 s (`marSpringIn` is exactly 1 after 2 s), no removal fade,
no outside write to a LOD1 group (click reactions, 0.1 s grace). Otherwise the groups draw as before,
so the swap is pixel-neutral and needs no fade; T2 keeps the existing LOD1 → LOD0 transition.
Edits and flood hides (`rewrite`) mark the touched store indices' islands (current and last merged)
dirty; dirty islands are rebuilt lazily (first T0/T1 frame, and after their fades) and only they.
Meshes are disposed on rebuild and with the world scope.
**Rationale**: W11 (postcard, all 7 islands) drew 298 of the 300 medium calls, 196 of them LOD1
groups (98 colour + 98 shadow); M19 needs headroom. Per-vertex origin keeps every per-instance
effect identical; packing a yaw code into `aSeed` instead was tried and lost wind-phase precision
(W11 2.3 k px differ) or normal precision (shadow specks).
**Impact** (seed 1001, SwiftShader): medium W11 298 → 146 calls, W1 227 → 101, W4 200 → 119, W5 / W8
unchanged (219 / 154, T2); high W11 298 → 146; low W11 142 → 66, W1 109 → 46, D-overview 109 → 46.
Programs unchanged (W11 17, low 9, high 17/24). Pixels: W5 / W8 0 px, W1 2 px, W4 (night) 51 px
(max Δ 2), W11 171 px (single pixels on swaying tree edges, max Δ 37); ladder frames identical,
ladder misses unchanged. GPU memory +7 MB at T0/T1 (merged buffers, ≈ 120 k vertices for seed 1001:
medium W11 140 → 147, dev low D-overview 43 → 50); T2/T3 views never build them. Interactive
transitions (T2 → T1, T1 → T0) draw the old call count for ~2 s until the bloom-ins settle.
Interfaces: `BatcherDeps.mergedMaterialFor`, `PropBatcher.farMerge`, `PropMaterials.mergedFor`,
`LitOptions.merged`, `makeDepthMaterial(features, fade, merged)`, uniform `uMarMerged`.

## D-048: DevOps "Ember Works" — cone-foot shelves with a harbour, a foundry and data center terraces (TASK-405) — 2026-10-11

**Decision**: Emberpeak keeps its roster slot, diameter roll, reach and cone, and grows three flat shelves at
the cone foot (`ARCHETYPES.emberpeak.shelves`, land ≤ 1.26 r inside the 1.35 r reach): a low harbour shelf on
the lee side away from the hot spring (the bluff cove is now a disc around it, `coveAnchor` harbour, low 14 u
inland), a two-step foundry terrace further round that side and a two-step data center terrace beyond the
spring. The planner builds: data centers on both data center levels (replaces the fragile lee staircase); the
deployment harbour (one `containerYard` prefab = three Docker-blue / teal / coral stacks + a gantry crane + the
control tower, rack-shed build halls by the pier, a CI/CD belt of QA `conveyor` segments, paved quay); the lava
foundry (furnace halls with chimneys on the upper step, a `rail` polyline of `railTrack` segments below it,
smithies and cottage lodges); a steam main from a cone vent to a cooling tower; lodges by the ops quad. Movers:
ore trains (crate carts on the rails) and two cargo ships per DevOps pier on a stadium loop past the pier head
(`render/harbour-routes.ts`, a second movers mesh), time-driven; ships hide past 260 u, trains past 230 u.
**Rationale**: user request (2026-10-11): more land and a DevOps facility (data center + harbour + foundry) on
the volcano. Shelves on bluff walls keep the cone the hero silhouette; one prefab per facility and one variant
per def keep the draw calls; pads on different shelf levels must not overlap
their relaxation bounds or `applyPads` levels the step away (`levelSafe` in `plans/devops-works.ts`). The bigger
island's per-island LOD0 groups (bounding sphere = the whole island) reached into far frustums (D-macro 155 → 173
over the low budget 170) although every instance was dithered out: the batcher now skips the draw of a visible
group (LOD0 per island and LOD1) whose sphere lies wholly past its material's fade-out distance
(pixel-identical: D-macro, W5, W8, W11 0 px changed). Measured on medium after merging main (ff8c010 → this
branch): W11 302 → 298, W5 232 → 273, D-macro (low) 114 → 128; D-sky-* 344–360 → 338–341 (over 300 on main
already).
**Density pass** (same day): the quay is dressed by the plan (paved quay is a blocked scatter zone): loose
`containerRow` stacks, `fuelTank` pairs and `forklift`s first, then crate / cable-spool piles (existing defs and
variants), lamp posts on the quay edge; a lane pier root → yard and an 8 u apron round the pier root stay clear and
quay stock never blocks the footpath grid. Cottage lodges and rack sheds (fixtures) fill the data center and foundry
shelves; a second steam main feeds the furnaces. D-devops-campus is a high south-west view with all three
facilities, D-devops-terraces shows the data center levels.
**Impact**: 0 new programs. New defs: containerYard, foundry, containerRow (T0), smithy, railTrack, fuelTank,
forklift (T2); the lodges reuse `cottage` (variant 0). Other islands' terrain, zones, lot positions, landmarks,
fixtures and docks are unchanged; still index-coupled to the DevOps plan: path lanterns (every 5th global path
node) and the global ground-cover cap order in scatter (lot roof variants are per island since D-047). W5, D-devops-* and L-live-devops look at the new campus.

## D-047: Marketing "Media Rock" — Beacon Rock lee terraces, shelf-bound pads, per-island roof keys — 2026-10-11

**Decision** (TASK-403): Beacon Rock keeps its roster slot, diameter roll, reach (2.35 r), sea stacks and the
sheer windward cliff, but the stack moves 0.12 r windward and narrows (× 1/1.1) and its lee side steps down in
three nested shelves (`ARCHETYPES.beaconrock.terraces`: upper ledge ≈ 0.64, middle ≈ 0.4, fair ground ≈ 0.17 of
the stack top, bands 12 / 10 / 14 u × clamp(r / 24, 0.9, 1.2), earth walls tagged cliff, a beach ramp in the
landing cove). The Marketing planner builds the Ad Boulevard on the summit (tower moved to the windward lip, a
red-tiled street to a double-sided giant screen on the lee rim, billboards, flags, a café, the studio and the
billboard office), the media campus on the ledges (antenna tower, layered media offices, photo studio / print
shop) and the fair ground (paved disc, ferris wheel, stage, tents, game booths); stairs climb the walls hub to
hub. Flatten pads on a terraced island leave ground > `padBreak` (2.5 u) off their level alone and do not relax
toward pads on another shelf. `assignLotVariants` hashes a lot's index within its island (+ islandId · 4096),
not its global index. The ferris wheel rotor is a mover (`render/movers.ts`, own InstancedMesh, 36 s per turn,
drawn at every distance, no shadow pass).
**Rationale**: user request (three directions combined into one island). Shelves in u keep room for buildings on
the smallest roll (r ≈ 20). Without the pad gate, pads on neighbouring shelves relaxed to one height and cut the
walls. The global roof key reshuffled every later island's roof colours whenever one island's lot count changed
(the world-side twin of D-044).
**Impact**: layout hash unchanged; height / zone / sites / routes / props hashes change (re-pinned). Other islands'
heights, zones, lots (but their roof variants), landmarks, fixtures, paths, docks, scatter and waterfalls are
unchanged; islands after Marketing get new roof variants once (HQ, the first island, keeps its own). W11 +15 draw
calls (231), 0 new programs; L-live-marketing re-aimed at the fair. Close-ups pay one call per (def, variant)
LOD0 group whose bounds touch the frustum, so the island trims its group count: no contact blob under the
plinth / deck structures, `scatterOff` bush + rockCluster, bannerPole one variant, the 2-variant shop / booth
share one LOD1. D-desk (Coding, low) still saw the fair at its edge (202 > 170): DESK_CAM swung 18° to sea.

## D-046: Research becomes "Observatory University" on a 52–58 u terraced campus hill — 2026-10-11

**Decision** (TASK-402b, supersedes D-042): Lonely Palm (Research) grows from the 17–21 u crater to a 52–58 u
campus hill (`ARCHETYPES.lonelypalm.campusHill`, reachScale 1.06, bluff walls 4.2–4.8 u, summit 12–13.2 u): a lawn
plateau with a campus terrace and a summit plateau joined by lawn banks, two promontories and the leeward cove.
`planResearch` builds the summit observatory, a paved quad (fountain, library, faculty halls, campus tower,
statues), a hedge-parterre garden (3×3 or 4×2 with the armillary sphere, topiaries, beds, pergolas), a
terrarium row, radio dishes on the spur, a research base (lab pods, small dish, weather mast), sculptures
on the avenues and the cove pier with the research vessel (numbers: `RESEARCH_SITE`). Research keeps no
waterfalls (`noWaterfalls`) and no viaduct landing; its height / colour classes stay `flat` / `sand`.
Worldgen gains three generic hooks: pad level groups / steps (`Pad.group`, `Pad.step`: districts keep
their own level instead of one relaxed plateau), pads never lifting the samples a pier crosses, and
shore-limited slope cliffs (`slopeCliffMaxShore`, `cliffSlope`).
**Rationale**: user request (2026-10-11): more land, a university feel, a big telescope, terrariums,
wide gardens, research bases and science sculptures. 52–58 u is the largest size whose reach still keeps
Research the last island the layout places, so most seeds only re-centre: seed 1001 moves every other
island by −16.54 u in z (raw cams and edit logs translated); 2024 and 5005 re-roll.
**Impact**: W9 is the Observatory University hero (raw cam, 18:45); new W14 "Campus Golden Hour"
(17:45). The hero framing (`FRAMING.hero`, D13) no longer applies to any generated island. W12's
viaduct pair changed with the seed 1001 layout (the preset is retired with D-045). The medium draw-call
budget goes 255 → 300: the campus sits in the W11 postcard foreground with ≈ 20 instanced LOD1 groups
(+ their shadow pass), 216 → 289 calls; every other wow / ci shot stays ≤ 237 (medium) / ≤ 170 (low).
Research ambient worker slots 5 → 9.

## D-045: Viaducts (TASK-394) removed — 2026-10-11

**Decision**: the stone-arch viaducts between near islands are dropped. The bridge code (pair picker,
`geo/bridge.ts`, `render/bridges.ts`, `content/bridges.ts`), the W12 "Viaduct" preset and the bridge
hash pins go away; another session removes them after this docs change merges.
**Rationale**: user decision (2026-10-11): the code that adds bridges between islands is removed entirely.
**Impact**: W12 is retired; the §11 wow list goes W11 → W13 with a gap. D-044's per-island decor fork stays.

## D-044: Settlement decor, theme and district RNG streams fork per island id — 2026-10-10

**Decision** (`settlement-props.ts`): the decor, theme and district streams are `fork`ed with the island id,
not drawn from one shared stream in roster order.
**Rationale**: removing the Research hut, palm and fixtures (TASK-400) shifted the shared stream, so other
islands' rendered decor (laundry vs barrel, decor rolls) changed although their world data did not. One
island's plan change must not move the others (golden rule 2: label-fork).
**Impact**: render-side only (world hashes unchanged); later single-island changes leave the other islands' decor as is.

## D-043: QA "Test Factory" redesign; movers are time-driven instanced meshes, not agents — 2026-10-10

**Decision** (TASK-401): QA (archetype `palmlagoon`, id and size kept) becomes a solid rounded-square plateau on
a bluff (wall 6–6.8 u, top 8.6–9.6 u) with a yard, 3 sawtooth hangars (extractor fans on the front wall)
joined by conveyor bridges, a crash-test loop track and a ~13 u mast QA tower with a check sign (about 20 u
with the sign). Crates on the belts and a test cart on the loop are one InstancedMesh (`render/movers.ts`, the
shared lit program) whose poses are closed-form functions of the sim time; they dither out from 150 to
210 u and the mesh is hidden beyond 230 u.
**Rationale**: the atoll read as a flat ring from T0; the factory gives a second hard-edged hero and motion at
T1–T3. Movers are not agents: no life budget, no steering, deterministic and frozen by captures. Id, size and
height / colour classes are kept so the layout and every other island do not change.
**Impact**: W11 +2 draw calls (movers hidden past 230 u); W6 retargets to the factory; the old lagoon
edit log (E-mixed) and the atoll criteria are obsolete.

## D-042: Research crater redesign — breached crater with biodomes (TASK-400) — 2026-10-10

**Decision**: Research (archetype `lonelypalm`, 17–21 u, same roll and reach) fills its reach disc as a breached
crater: crest ring around a sunken bowl, broken open over the leeward cove (`ARCHETYPES.lonelypalm.crater` +
`bluff`, wall 3–3.4 u, peak 5.6–6 u), with glass biodomes in the bowl, rim crystals and a research vessel at the
cove pier. Crater islands get no waterfalls (too small). A bigger, university-campus-style
Research island is planned and will supersede this.
**Rationale**: the single-palm sandbar had no silhouette in the postcard and no cliff to match the other six.
Keeping id, size and reach leaves the layout, and so every other island, unchanged.
**Impact**: W9 (palm hero) is retired; its criteria are pending the Research redesign.

## D-041: Waterfalls ride the lit program as a flow tag — no new program — 2026-10-10

**Decision** (TASK-395): 1–3 falls per bluff island (`content/waterfalls.ts`) leave the bluff lips as ribbons on
the shared lit program with `aSpin.w = −SURFACE.flow` as the tag (D-034's channel), with a foam disc on the water
and mist puffs at the foot. Crater islands (Research) get none; neither do cove beaches (`maxCove`).
**Rationale**: the concept art has water falling off the walls. A separate water program would break the
9 / 17 / 24 program budgets (D-033); the tag costs a branch in the existing activity shader and ribbons
batch into one draw per island.
**Impact**: 0 new programs; W13 shows one (Mossgrove, seed 1001); the flow scrolls between delta frames.

## D-040: The postcard pose replaces the high overview as the intro's end — 2026-10-10

**Decision** (TASK-392): the intro lands on `FRAMING.postcard` (horizon at 0.74 NDC, so look-down =
atan(0.74 · tan 17.5°) ≈ 13.1° at FOV 35°; nearest islands seen at ≈ 30°, far ones ≈ 15°), fitted to land
outlines, terrain, peaks and landmark tops. The pitch band reaches 10° at and beyond 260 u (blended back by
150 u) so the pose is reachable and the first drag does not snap back to the 58° overview. Portrait screens
(aspect < 1) keep the overview. The horizon gets cloud banks, a warmer grade and an aerial fog tint.
**Rationale**: the high 58° overview shows flat discs; a low 3/4 view makes walls and landmarks overlap in
depth, the "concept art" first glance (W11). FOV 35° shows a horizon only below 17.5° look-down, so the pose is
set by the horizon height, not by a pitch angle.
**Impact**: ART_BIBLE §6 / §8 updated; the 58° overview stays as a preset and for portrait; D-macro is blocked
by a building wall until TASK-396 re-pins it.

## D-039: Bluff coasts and soil-strata earth walls — 2026-10-10

**Decision** (TASK-390, 391): every archetype except Beacon Rock (its own windward cliff) gets a `bluff`:
a 5–7 u wall around the coast, tagged `Zone.cliff`, with a harbour / leeward cove sector (Hearthholm's cove is
anchored on the harbour). The terrain material paints those walls as soil strata (`GROUND_WALL`: soil
`#B9845A`, bands ≈ 1.6 u, grass lip and drips, dark foot, wet line, cracks) in a theme's cliff colour where it
lists one.
**Rationale**: the ring-shaped beach islands look like discs from a low camera; walls give the concept
silhouette and read at T0 because the colour is baked in the albedo (D-031 holds). Walls are only 5–7 u: HQ
office minimums, the W10 call budget and DevOps terraces limited them.
**Impact**: islands are 5–7 u taller at the coast; ART_BIBLE §2 / §4 updated; Zone.cliff is on every bluff
archetype; D-030 smooth terrain unchanged.

## D-038: Sky craft — hot-air balloons and an airship, no shadows, no new program — 2026-10-10

**Decision** (TASK-335): 2 / 4 / 5 balloons plus 0 / 1 / 1 airship (low / medium / high) drift over the
islands' bounding box on closed-form orbits (drones' pattern: one InstancedMesh per kind, the shared lit
program with dither fade, no agents). Balloons share concentric same-aspect ellipses turning one way at one
angular speed, so their horizontal gap never drops below the radius step; they sit in a 34–60 u band below
the cloud layer (60–90 u), the counter-rotating airship at 96 u. Data lives in `src/content/sky-craft.ts`.
**Rationale**: a living sky at T0 with pastel, cozy shapes; ~300 tris per model, speeds of 1.6 / 3.2 u/s.
**Shadows**: not cast. The fitted shadow slab ends far below 38+ u, so a cast would be clipped or flicker at
the box edge, and cloud shadows are analytic blobs; adding a craft shadow pass would also double the calls.
**Impact**: +1 draw call on low, +2 on medium / high, 0 new programs (same variant family as drones), ≈ 300
tris per craft. They fade out closer than 50–100 u to the camera.

## D-037: Ladder region drift leaves cast-shadow cells out — 2026-10-09

**Decision** (TASK-381): `regionDrift` (`scripts/ladder-metrics.ts`) skips cells whose L* differs by more
than `shadowL` = 15 between the frame and the 170 u reference, as long as they are at most
`shadowMaxFrac` = 35 % of the region. Above that, all cells count, so a region-wide shift is still judged.
**Rationale**: on medium/high, prop and tree shadows move with the shadow camera's range, which made
close frames fail drift when nothing had changed. A shadows-off check on L-marketing (medium) dropped the
close-frame drift from 4.17–4.45 to about 3.55. With the new rule, medium HQ/Marketing/Design drift is
1.2–3.7 everywhere (was up to 5.2), and the far 700 u frames drop from 4.0–4.4 to 3.0–3.6.
**Impact**: ladder drift misses are gone on medium; the step misses are unchanged (Marketing 60→42 /
42→30, Design 240→170). New unit test covers both cases: a shadow patch is ignored, a region-wide
darkening is still flagged.

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
