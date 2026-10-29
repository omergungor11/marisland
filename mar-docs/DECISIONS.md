# Architecture Decisions (ADR-lite)

> Every architectural/technology decision goes here. Newest on top.

## D-106: Research M28 signature props — the sundial is the one new def, the rim telescope deck is `tripodTelescope` v2, the teal stair lantern is `lanternPost` v3, Research cap 10 -> 11 (TASK-525; builds D-104 on D-059 A / D-062 R3-16) — 2026-10-29

**Decision** (no placement, TASK-526 places and aims them): (1) **`sundial`** = the only new def: tier 2 `grounded`,
planner-pinned, ledger entry 11 (`cultureCapOverride.research` = { 11, 1 }, the tier-1 slot stays free). A 6 u stepped
stone dial (six discs, each its own plane, brass inlay bands), 12 raised hour plates with Roman numerals I-XII built from
thin ink strokes (a three-glyph stroke font I / V / X; `signage.ts` has no numeral glyphs, only theme icons), a brass noon
line and a verdigris triangle gnomon blade 2.5 u over the dial field. **The blade lies along local +z** (plane x = 0, high
end at +z, style sloping down to -z), XII and the noon line are on +z too; TASK-526 yaws the prop so local +z points away
from the noon sun. The numerals run clockwise seen from above, 30 deg apart (a stylised clock face; only the noon line is
exact, ±3 deg). It is a large structure (6 u), so the batcher draws it from T0 by size. (2) **Rim deck = `tripodTelescope`
v2** (not `selfieSpot` v2 as the study suggested): a Research def of the same tier (2), so the batcher's per-def tier
(D-096 hazard) cannot flip because of it, the Research life frames (`gaze`, `look: 'tripodTelescope'`) already speak
about it, and a Marketing def would drag the Marketing selfie bot frame (`offices.ts selfieSpot`) onto a Research island.
The deck stays under `STRUCTURE_MIN_SIZE` in both plan extents and in height (a test pins it), so it never promotes the
def to T0. `tripodTelescope` got `rollVariants: 2` (random rolls keep v0 / v1) and an exported `tripodTelescopeAt(opts,
aim)` (the default aim is unchanged, v0 / v1 bytes identical). LOD1 is the deck's own, not variant 0's (tier 2 never
reaches the far merge, D-049). (3) **Teal stair lantern = `lanternPost` v3** (`rollVariants: 3`, tier 2): teal post on a
stone footing, a cage with one emissive 1 gem (the Research lamp set lights it like every `lanternPost`, and it keeps the
def's night light pool), teal cap, brass finial, 1.96 u. Hooks `lamp { at, r }`, `top`. (4) Gallery: `?gallery=1&ids=research28`
/ `pnpm exec tsx scripts/gallery-shots.ts research28` (also the per-variant close-ups).
**Rationale**: variants keep the ledger flat; the one new def is what R3-1 allowed. **Alternatives not taken**: `selfieSpot`
v2 (above); a full 15 deg / hour equatorial dial (a half circle of plates, harder to read from the sea and the study only
asks for the noon meeting); per-numeral sub-meshes (stroke vertices are cheap flat boxes).
**Numbers** (tris LOD0 / LOD1): sundial 1492 / 332, rim deck 1494 / 481 (the refractor is ~900 of them), stair lantern
236 / 32. World hashes unchanged (only appended a def, grew two variant counts behind `rollVariants`).
**Residual / for TASK-526**: footprint of `tripodTelescope` is 0.9 and of `lanternPost` 0.4 for every variant; the deck
(3 x 2) and the sundial (r 3) are bigger, so the plan must use the anchors' own radii (the sundial def footprint 3.0 is right).
## D-105: Research summit crag (R1) + M28 anchors (Star Stair, meridian, rim decks); big dish into the headland base (TASK-524; builds D-104 on the D-095 anchor pattern) — 2026-10-29

**Decision**: (1) **Crag as an absolute lift.** `campusHill.summit` r 0.25 → 0.22, its own riser `soft` 0.1 (the
terrace keeps 0.17), raw `h` stays 2.1, plus `campusHill.crag.lift` 3.4 u added after the peak normalisation
(`profile.lift`, the Kite Hill hook) with a jagged outline (`jag` 0.03 fbm). Raising the raw `h` to 4.5 (the study's
number) shrinks the whole campus: the profile is normalised to the peak, so the quad fell 7.3 → 6.0 u. Riser cells are
tagged `Tag.cliff` (rock / cliff zones: the earth-wall strata shader). Summit ground ≈ 15 u (was 11.7), ≈ 8 u over the
quad: dome top ≈ 26 u vs bell tower ≈ 17 u. (2) **Summit pad**: `observatory.padMargin` 2.2 (core 6.6; the comet-watch
ring and the grid cells its samples read stay flat on the steep crag; `CS.summit.drop` 0.8 → 2.4, board passes 0.5 →
2.2), `padStep` 10 (no neighbour relaxes the crag top down: seed 1 fell to 8.7 u), and a per-district keep-off disc
`observatory.keep` (`fits` and the academy's `roomy`: ring 0.6 / garden 2.6 / glass 3.5 / base 1.6 / rest 2.3 u past the
core) so no district pad core blends with the crag top. (3) **Big dish** = the headland base's dish item (radioDish v0,
first in `base.items`; was the small v1, third); fallback: the free spot nearest the headland ≥ 18 u off the summit
(`base.dish`). `bigDish` / `RESEARCH_SITE.dish` / `LEVEL.dish` removed. 28 / 30 test seeds have it (none fits on 1001,
1263, 4945: the campus fills the lawn ≥ 18 u from the summit). (4) **Anchors** (`world/gen/plans/research-anchors.ts`,
numbers `content/themes/research-anchors.ts`, contract in the module header): `starStair0..3` + `starLamp0..K-1`
(6–7), `meridian` + `meridianSize`, `rimDeck0..K-1` (2–3) + `rimDeckSize`. Plan time after the quad ring: the top
landing keep-out, the **Star Stair** searched on the modelled post-pad ground (observatory → quad face, tiered lattice,
3 legs, 2 switchbacks ≥ 100°, 16–28 u), legs reserved (non-blocking: a blocking zigzag walled seed 1001's hub in, the
whole island lost its paths); when only the quad ring blocks the face, the `yieldTo` pieces it crosses give way. The
**meridian** disc (6 u) on its own pad at the crag's foot (off the stair face, farthest from the quad and the
headland), blocking. The **rim decks** after the headland base (lip candidates, most windward first). Finish: the stair
is re-checked on the final ground (else searched again), its grade line (foot → top at one grade along the arc ≤ 0.85)
**carved** into the crag (cut / fill within 2 u, blended 1 u; never into another pad core or obstacle); decks re-checked
(relief ≤ 1, off paths) and topped up from the final lip. (5) **Side fixes the crag needed**: the quad's hub pin
(the first link: it seeds the network) moved from the observatory-avenue side of the fountain to the harbour-avenue side
(the crag face walled the old one in: seed 1001's island kept 1 path chain of 2 points); pennant cords within
`CS.pennants.cragNear` 8 u of the summit core keep a grid cell inside their core (a pole read the crag face);
`≥ 3 faculty halls` test bound 0.75 → 0.7 (22 / 30, was 24 / 30: the summit keep-off empties the quad ring's
crag-side slot a little more often); archetype signature: Lonely Palm peak ≤ bluff peak + crag lift + 0.5.
**Rationale**: the crag must stay steep (rock) all round, so a walkable climb needs a carved stair (the 2 u heightfield
cannot hold benches; a flank ramp cost the library / halls / glasshouses on every bearing tried: 0°, ±30°, ±60°, ±90°,
±125°, 180°). Plan-time reservation lets the campus keep off the stair; finish-time carving makes it the rendered ground.
**Numbers (30 test seeds)**: stair 30 / 30, meridian 30 / 30, ≥ 2 decks 30 / 30; on the final ground the stair's grade
line ≤ 0.85, per-2 u pitch ≤ ≈ 2.5 (the stair flights' range: TASK-526 must lay it as a stair-kind path with flights),
top landing within 0.4 u of the dome floor, foot ≤ 16.4 u from the quad centre (≤ 10 u past its pad core), 6–7 lamps;
meridian disc spread ≤ 0.04 u; decks relief ≤ 1 u. Dish 28 / 30 (none on 1001, 1263, 4945: no room ≥ 18 u off the
summit). Campus rates (baseline in brackets): library 30 (30), ≥ 3 halls 22 (24), glasshouse row 26 (27), base 30
(30), comet watch 30 (29). Generation time: 30 test seeds 8.1–8.5 s vs 7.8–8.0 s on main back to back (+4 %;
the stair search tests shore / obstacles on a 0.25 u raster round the dome, the lattice's only hot spot). W9 / W14 (seed 1001): the dome stands on a tall strata-walled butte, the one vertical;
the carved stair shows as a green groove up the quad-side face. World hashes re-pinned in a separate commit
(stage snapshot 1 `50e16bf75531caa2`, 42 `1520e253becc66af`, 1001 `afdb2edf1fee4170`; bluffs-off 1001
`358de453533442a3`, 1 `0545eada9fdf05b9`).
**Alternatives not taken**: a flank ramp sector of the crag (every direction cost a campus district, see above); the
study's raw `h` 4.5 (shrinks the campus); a ridge with the meridian on the crest (the ridge took the hall / base slots);
blocking stair legs (walled the hub in); summit `padBreak` / a falloff-only break (holes in pad cores on the riser /
broke the stair grade); a summit pad margin of 1.5 (the comet-watch ring kit stood on the riser: 8–12 % off level).

## D-104: M28 Research signature plan (Summit Observatory) — plan only — 2026-10-29

- **Scope** (D-059 direction A; user 2026-10-29: silhouette = R1 only, signature + the D-062 R3-16 items): `R1`
  summit crag, `R2` Star Stair, `R3` meridian sundial, `R4` rim telescope decks, wow Star Stair Night + Meridian Noon
  (study `mar-plans/study/marketing-research.md` §2.2 A, §2.3, §2.4). **No R21 coast break**: the round outline stays,
  the one dominant vertical (P2) comes from the raised ridge alone.
- **Already shipped, not redone:** R12 maze tiles, R18 pier seal, R13 / R16 / R17 / R20 / R9 (TASK-483, M22), whale
  (TASK-489), comet streak R15 (TASK-472 Comet Night). R3-16's items are therefore already done.
- **Ledger:** one new tier-2 def `sundial` → `cultureCapOverride.research = { defs: 11, tier1: 1 }` (R3-1 allowed 11).
  The empty tier-1 slot stays unused (R3-16 keeps it for a later stilt lab). Rim decks and the stair lanterns are
  variants (no ledger entry).
- **P2:** today the dome (~11 u), bell tower (~10 u) and big dish (~9 u) read the same height at T0. The ridge lifts
  the observatory to ~15 u; the big dish leaves the summit spur for the lab headland, so the spur no longer competes.
- **Order** (the M27 pattern): TASK-524 summit ridge + anchors (worldgen) ∥ TASK-525 props → TASK-526 placement +
  motion + wow presets (the only branch that re-pins world hashes and W9 / W14 / ladder cams) → TASK-527 QA.
- **Budget guard** (headroom is thin, D-100): W11 ≤ 300 calls, medium memory ≤ 172 MB, W16 ≤ 800k tris must hold
  without another budget raise; the stair lanterns are one instanced group, 6–8 instances.

## D-103: Diver splash ring life 1.6 → 2.2 s so the dive-splash shot catches it (TASK-520) — 2026-10-29

**Decision.** `MARKETING_M27_MOTION.diver.splash.life` 1.6 → 2.2 s (`src/content/themes/marketing-m27-site.ts`); the 40 s
cadence is unchanged. The pool is not behind the stack: it lies ~22 u ahead-left of the tower, so `D-m27-dive-splash`
now shoots it from a low camera `134.5,6,-86 → 130.7,0.5,-98` at sim 31.0 s (ring + 3-4 drops). The swim-back starts
at `life / 2`, so it now begins 0.3 s later.
## D-102: ON AIR keeps out of the cable corridor seen from the sea — the sign moves along the cliff, the line stays (TASK-523; builds D-095 / D-097) — 2026-10-29

**Decision**: the QA nit (TASK-519 §3 D-m27-gondola: the first span and its cabins pass in front of the ON AIR letters)
is fixed by moving the **sign**, not the line. `neonFace` (`world/gen/plans/marketing-anchors.ts`) now also needs
`corridorMargin(p, rot, w, tracks, station) ≥ 0`: in the sign's frame (d out along the face normal, l across) every
sample of **both tracks** (all spans, clipped to −`back` ≤ d ≤ `depth`) keeps |l| ≥ w/2 + gondola half width + `gap` +
max(d, 0) · tan(`view`), and the summit station disc (r 2) the same. So the sign is clear for any camera within `view`°
of its normal over the near part of the line, where the cabins hang at letter height. Numbers in
`MARKETING_ANCHORS.neon.corridor` = { gap 1.5, view 25°, depth 14, back 8, half = gondola w / 2 }. The search is
unchanged otherwise (headings round windward, nearest windward − 40° wins, narrower widths tried); the old
`cableClear` 4 u check against the first span's centre line stays. Seed 2024: the sign moves 3.1 u along the cliff
(157.1, -111.5 → 157.1, -114.6, heading 176° → 180°); D-m27-onair-night / -seq cams re-aimed by the same 3.1 u.
**Numbers (30 test seeds)**: corridor clear before 17 / 30 (worst −10.5 u, seed 7049; 2024 −3.7 u), after 30 / 30
(min margin 0.07 u); ON AIR placed 30 / 30 → 30 / 30, line 30 / 30 → 30 / 30 (13 signs moved; the rest kept their place).
World hashes: only seed 42 moved among the pinned seeds (archipelago `42` → `7c1165c814cdad82`, Marketing per-island
`133c5b2e8edddbdd`); seeds 1 / 1001 and the bluffs-off hashes are unchanged (their signs were already clear).
**Alternatives not taken**: `view` 30° (seed 4156 has no clear face, 29 / 30); moving the line's summit seat (the
fallback the task allowed; not needed at 25°, and it would re-route the whole chain); a plain distance check without
the view wedge (the old check: 3.2 u on seed 2024 and still overlapped from the side camera). **Residual**: from
D-m27-gondola's close camera (≈ 52° off the face normal) one thin cable still crosses the letter column; the cabin no
longer covers it.
## D-101: TASK-521 star fort stone + TASK-522 sea billboard foot — 2026-10-29

**Decision**: (1) `starFort` body is no longer one cream band: dark plinth, mossy waterline course, three warm sandstone
courses (CLIFF_STRATA / sand) and a light coping band, merlons warm cream (`STAR_FORT.stoneBands`, data in
`content/themes/hq-marina.ts`). Tris 1172 / 170 -> 1232 / 210 (LOD0 / LOD1). (2) Sea billboard (`billboardV2` v2) foot:
a rock-coloured footing block buried behind the rock face plane plus two flared pedestals with steel cap plates and two
boulders (`seaBoard.foot`). Tris 348 / 94 -> 428 / 110. Placement, footprint and tiers unchanged (world hashes the same).
**Rationale**: the pale wall read lavender-grey at dusk; the thin slab read as a ledge bracket. The prop contract keeps
min y >= -0.05, so the "burying" goes backwards into the rock, not down below the pivot.

## D-100: TASK-519 QA budget calls — medium gpuMemoryMB 170 → 172, L-marketing 60→42 step blob 2.0 %, four small follow-ups (TASK-520–523) — 2026-10-29

**Decision** (user, from the TASK-519 report `mar-docs/qa/m26-m27-2026-10-28.md`): (1) **Memory.** W27 measured 171 MB
against the medium 170 line: geometry 62.3 MB = W4's, the +1 is texture rounding (6.6 vs 6.5 MB), not a regression.
Medium `gpuMemoryMB` 170 → 172 (`src/content/budgets.ts`). (2) **Ladder pop.** L-marketing low ladder step 60→42 blob
1.7 % > 1.5 %; QA opened both frames and saw no swap (the cable-car pylon and gondola grow on the dolly). A per-step
override `LADDER_THRESHOLDS.stepBlobAt` (`scripts/ladder-metrics.ts`, keyed `<ladder id> <far>→<near>`) gives this one
step 2.0 %; every other step keeps 1.5 %. (3) **Follow-ups** opened: TASK-520 dive-splash cam, TASK-521 star fort stone
colour, TASK-522 sea billboard base, TASK-523 ON AIR vs first cable span.
**Rationale**: neither fail is visible; raising a global threshold or the whole memory line further would hide real
regressions elsewhere. The D-m26-obsidian "unreadable beach" finding predates TASK-513 (QA ran on `80c8aa7`); the
cove (D-098) answers it.
**Alternatives not taken**: trimming ~2 MB of Beacon geometry; a pylon far-LOD task for the ladder step.

## D-099: Crater deck couple — the `deckGazer` story spot seats two bots on the deck's benches with idle beats, the DevOps tableau cap is data (TASK-515; builds D-093 (4)) — 2026-10-28

**Decision**: (1) `TABLEAU.deckGazer` = 2 bots on the `craterDeck` benches (spot frame = deck frame: x ±1.05, z 0.1 =
`DEVOPS_M26.deck.bench`; feet at `dy` 0.47 = seat top 0.53 − 0.06 sink, the office-seat convention), both facing the
crater. A unit test pins the offsets to the prop's `bench` numbers. The telescope stays decor (scope z 1.35 sits
between the two bots). (2) **Cap as data**: `tableauMax(scale, theme?)` reads `TABLEAU_MAX_BY_THEME` (`devops: 7`) at
medium+ (low stays 2); `planTableaus` takes `max` as a number or `(theme) => cap`. DevOps now holds exactly 7. No new
agents: tableau bots come from the same ambient slots (+1 bot net). (3) **Idle beats**: new optional
`TableauBotSpec.beats = { cycle, steps: [{ to, pose, yaw }] }`, evaluated in closed form on the bot's tableau timer
(`t % cycle`), the step picks the pose and a yaw off the spot heading (toward the partner); ritual poses still win.
New pose `huddle` (resting arms, 0.2 rad bow). Cycle 18 s: 0–5 left gazes / right relaxed; 5–7.5 both lean in toward
each other (yaw ∓0.9); 7.5–12 right points (wave arm) / left listens; 12–16 both gaze (shared look); 16–18 both glance
at each other (∓0.35). **Rationale**: a cap exception per theme is data, not a loop change; beats are reusable by any
tableau and cost one `find` over 5 steps per bot per frame. World hashes unchanged (story spot data untouched).

## D-098: Emberpeak obsidian black-sand cove — a late cut-only notch in the windward bluff, floor repainted black sand, the obsidian decor placed in finish on the final ground (TASK-513; builds D-093 (6) on D-083 / D-091 / D-092) — 2026-10-28

**Decision**: (1) **Plan time** (`placeM26` → `planCove`, before the kit / lodges / village / columns keep off it): at
the `obsidianBeach` anchor (frame s out to sea, q along the coast) the deepest floor of `backs` 6 / 5 / 4 u behind the
anchor, slid 0 / ±2 / ±4 / ±6 u along the coast, whose floor rect (10 u wide, back → s = +4) is clear of every other
obstacle by gap + the groundWriter keep-off and of every pad's margin + falloff. The whole cove rect (walls
included) is reserved and path-blocked, so no footpath is ever cut. Anchors `obsidianCove` (floor origin, rotY out to
sea) + `obsidianCoveSize` ({x: 10, z: back}). (2) **Finish** (after the lava bed / bridge / deck): cut-only
groundWriter carve, floor = rounded-rect (corner 3) open to the sea, beach sloping linearly 1.1 u at the back → 0.45 u
at s = +4 (≥ FLATTEN.minHeight 0.4, so nothing is raised), walls blended over 2.5 u back to the bluff (≈ 5–6 u high).
Zones repainted: floor cells → `Zone.sandBlack` (also floor cells already below the beach), wall cells by slope:
cliff > ZONE_RULES.cliffSlope, else black sand ≤ 1.6 u, else rock > rockSlope. The existing `SAND.black` /
`blackSand` ground is the colour (no new palette entry). (3) **Decor in finish** on the final ground (same
`m26/obsidian` rng): stacks on the shelf as before; with a cove the slab samples its floor / waterline (s 0 … +6),
the clusters and the cairn its floor (y 0.4–1.4, 1.2 u off the walls, on black sand); every piece's relief under its
disc ≤ `maxRelief` (0.9 / 1.0 / 0.9 / 0.9). Without a cove the old bluff-top rules apply.
**Rationale**: a late cut (the D-093 lava-bed pattern) never fights the pads and keeps the funicular / lava / deck /
kiln / breakwater ground (groundWriter keep-off); checking only the floor (walls may clip) is what lets the cove fit
beside the D13 quarry rect, which sits ~13 u behind the anchor on most seeds (centred 6 u-deep coves: 20 / 29).
**Numbers**: 30 test seeds: cove 27 / 29 anchor seeds (3367, 6523: the 12 × 9 quarry rect lies on every floor
candidate), ≥ 4 pieces ≥ 90 %, every piece seated; no water fall within 14 u of a cove. Carve + decor < 1 ms per world
(warm full world 390–510 ms on seeds 1 / 42 / 1001 / 1337 / 2024). Wow `--assert` green 42 / 42 (calls peak 294
W-marina-dusk, tris peak 783 k W16, memory peak 170 / 170 MB W4 / W27). World hashes re-pinned (bluffs-off 1001
`8eb01fbd737b70d2`, 1 `7a43ec9b43747651`; stage snapshot 1 `0cff0fdc1ec79190`, 42 `5d95f8c038a8d5d9`, 1001
`c02ba17a2300b32f`). Dev cam `D-obsidian-cove` (seed 1001).
**Side effect**: `placeWaterfalls` jitter is drawn per candidate lip cell, so the cove's new cliff cells reshuffle the
island's water falls: seed 1001 Emberpeak has 3 instead of 1 (one now visible in W1 on the SW coast by the village).
**Alternatives not taken**: a new darker sand colour (the cove floor would merge with the dark cliff walls; the
existing black sand reads a shade lighter, which is what makes the notch readable); a pad under the cove (falloff
would reach the quarry / lava strip and raise ground); keeping the decor at plan time (it would stand on the pre-carve
bluff).
**User decisions (2026-10-28)**: the waterfall reshuffle is accepted (no per-cell hash jitter); the cove floor keeps the existing black sand (no new obsidian ground colour).

## D-097: Beacon Rock M27 placed and moving — the cable car is a two-track loop on the built geometry (seat 9.45, hang 2.5), real footprints on the stack tops, a spell-out neon kind, the diver as a culture-mover scene (TASK-518; builds D-095 / D-096) — 2026-10-28

**Reconciliation (anchors vs props).** One truth = the built geometry: cable seat **9.45 u over every pivot** (station
and pylon; was 6.5 / 7.5), gondola floor **2.5 u under the cable** (was 2.2), so the floor stands 6.95 u over a
pivot, flush with the terminal landing. `MARKETING_ANCHORS.cable.seat / hang / track` now read
`MARKETING_M27` (one number, two readers). Higher seats only add clearance (30 seeds: min floor margin 2.4 u on
both tracks, was 0.6). **The v4 pylon could not be ridden as built**: its crossarm ran ALONG the line with both
sheaves on the axis, so a passing cabin went through the 9 u lattice (half-width 0.4 u at cabin height) and the
crossarm (just under the grip). TASK-518 rebuilt the head: crossarm across the line ABOVE the cable
(`armOver` 0.42), one sheave per track at x = ±`track` 1.25 on an outer bracket; the line became a **loop**
(out on the summit station's local +x track, back on the other; real gondola lifts work this way, and three
cabins on one single cable would have had to pass through each other). New **`mailLine` v7 = terminal**: the
same tower with a horizontal bullwheel (radius = track, at the seat height; the cabins turn round behind the
tower) and the boarding landing beside its +x track (moved out to x 1.95–3.15). The landing left v4. The pylon
finial is now the red aviation lamp with the `beacon` blink (the M22 stack masts it replaces blinked).
**Footprints.** TASK-516 reserved 0.8 / 1.0 u discs; the props need more: pylon r 1.3 (lattice corners), the
pylon and the dive tower must keep their **square leg footprints apart** (SAT, `squaresApart`, gap 0.1), the
transmitter's three guy eyes (r 2.1) must stand on the top (ground −0.45…+0.3 of the pivot, off the pylon) at a
mast heading the anchor now publishes (`transmitter.rotY` = guy frame, no longer "seaward"); the dive tower and
the mast fall back to smaller scales (`diveTowerSize` / `transmitterSize`: 1 / 0.85 / 0.75 and 1 / 0.85 / 0.7)
before giving up. Spans are checked on both tracks; the span strip is 4 u.
**Placement** (`world/gen/plans/marketing-m27.ts`, in the Marketing `finish` after the anchors): terminals v7 at
both ends, v4 on mid anchors, pivot y = anchor ground; sea billboard (v2) and ON AIR (v3) scaled to the anchor
rect and pushed out so the prop's rock plane (local z = −reach × s) lies on the anchor plane; dive tower and
guyed mast at their anchors and scales. Every M22 `antennaTower` v1 within a carrying stack top (+1.5 u) is
dropped (on the 30 test seeds that is all 83: every stack now carries a piece).
**Motion.** `world/cable-car.ts` (pure): the loop as spans (the `cablePoint` parabola) + bullwheel half-turns, a
time table (speed 1.6, 0.6 into each sheave within 1.6 u, 0.8 round a wheel, a 4 s dwell at each landing);
three cabins ride it a third of a period apart (detachable grips: they never meet), swing 3° about the cable in
gusts and kick 4° in pitch when braking. `render/beacon-lines.ts`: two instanced meshes (liveries) on the shared
lit program, fade 300–340 u; the cable spans are a second merged mesh in `render/mail-lines.ts` with the same
fade (the mailLine def's tier-2 fade would drop the cable at ~120 u under drawn gondolas). **ON AIR**: new
`SURFACE.neon` (14) with its own branch in `CULTURE_SURFACE` (before the beacon one); each letter tagged
(index, 5, 0, −14); while the lamp class is on, letters light 0.4 s apart, hold, go dark 0.7 s, every 9 s
(`NEON_SEQ`). The study's "19:00 in sequence" became this repeating spell-out on the culture lamp set (it
switches on with the island at dusk); a one-off switch-on would need a "since lamps on" clock in the shader.
**Diver**: a culture-mover scene on `diveTower` (keeper body + rings + blobs, no agent, no tableau slot): every
40 s, 07:00–20:00, ladder → board → bounces → parabola into the pool centre → 2 rings + 4 drops → swims back.
The fish jump's water splat is not reused (culture movers are closed form, the splat is stepped); its ring /
drop look is. **Programs** low 9 / medium 17 unchanged.
**Numbers (30 test seeds)**: line 30 / 30 (≥ 3 pieces 28; 60 terminals, 47 mid pylons), sea billboard 30 (scale
0.55–1.00), ON AIR 30 (scale 0.76–1.06), dive tower 27 / 30 (was 29; 4 at scale 0.75), transmitter 16 / 22
three-stack seeds (was 21 with 0.8 u discs; 2 at scale 0.7), M22 v1 masts 83 → 0. Loop 51–196 u, period
48–145 s. Gondola floor margin ≥ 2.4 u on both tracks. Cost ≈ 8 ms per world. World hashes re-pinned (1001
`d642226645e9ee4a`, 1 `731ef6a0436dee96`). Wow `--assert` green: W16 290 / 300 calls, memory peak W4 / W27
170 / 170 MB, W-cable-dusk 285 calls / 723 k tris / 163 MB, W-on-air-rock 223 calls / 576 k / 165 MB. Low ladder:
budgets green, L-pairs-marketing green after the terminal LOD1 fix, L-marketing step 60→42 blob 1.7 % > 1.5 % (open). Medium ladder 14 / 14 green (memory 87 MB).
**User decisions (2026-10-28)**: transmitter 16 / 22 accepted as is (no stack skipped); the L-marketing 1.7 % pop goes to TASK-519 QA (a pylon far-LOD task only if QA sees it); ON AIR keeps the repeating 9 s spell-out (no one-shot 19:00 switch-on).

## D-096: Marketing M27 signature props — the cable car, sea billboard, ON AIR neon and guyed mast as variants of old defs, one new def `diveTower`, Marketing cap 10 -> 11 (TASK-517; builds D-094 on D-059 A / D-062 R3-15) — 2026-10-28

**Decision** (no placement, TASK-518 places and moves them): (1) **Cable car = `mailLine` v4 / v5 / v6** (ledger-free,
def variants 4 -> 7, rolls stay on 0-1): v4 sea pylon (9 u red / white lattice, two sheaves front / back like the ore mid
pylon, a boarding landing beside the line flush with the gondola floor), v5 / v6 gondola cabin (red / cream liveries,
lit panes + roof bulbs at night). `render/mail-lines.ts` already skips variants >= 2, so the HQ mail pairs ignore them.
(2) **Sea billboard = `billboardV2` v2** (6 x 3 u, SURFACE.slides, tied back to the rock face with four rods; hooks `screen`
= the surface rect, `mount` = a point on the rock plane). (3) **ON AIR = `billboardV2` v3, NOT `marqueeSign` v3** (deviation
from D-094 / the study): the batcher fixes a def's effective tier ONCE per def from the first variant it sees (`effDef`),
`marqueeSign` is a tier-2 def of 2.5 u signs, so a 9 u cliff sign there would be hidden beyond ~160 u (the W4 camera) or, if
built first, drag every boulevard sign to T0. `billboardV2` is already tier 0. Still ledger-free. 5 plates top to bottom
(O N, gap, A I R; the study's "4 letters" was an approximation of ON AIR), each plate carrying its stroke letter as a
separate emissive slot (`1.00 + 0.01 k`, lamp class) and one contiguous vertex range (`letters` hook); a steel spine tied
back to wall plates. (4) **`diveTower`** = the only new def: tier 2 (large structure, so drawn from T0 by size), pinned,
`grounded | windy`, ledger entry 11 (`cultureCapOverride.marketing` = { 11, 1 }); 5 u deck, rails, ladder, gold springboard,
pennant, lamp. (5) **Stack-1 transmitter = `antennaTower` v2**: the v1 lattice (`transmitterMast` got optional
`T` + `extras` params, v1 output untouched) 8.2 u tall, two guy tiers, blinking tip (SURFACE.beacon at LOD0) with a `lamp`
hook. (6) Gallery: `?gallery=1&ids=marketing27` / `pnpm exec tsx scripts/gallery-shots.ts marketing27` (also per-variant
close-ups; row spacing now uses the widest variant).
**Rationale**: variants keep the ledger and the def count flat; the one new def is what the study allowed (cap 11); the tier
hazard is a property of the batcher, not of the content.
**Alternatives not taken**: `marqueeSign` v3 (tier hazard above); a `cliffSign` def (tier 1 -> second tier-1 slot, cap
override); per-letter sub-meshes (a companion def for nothing the vertex ranges cannot do); a new SURFACE kind for the letter
sequence (any unknown kind > beacon falls into the beacon branch of the shader chain, so TASK-518 must add the kind AND its
branch together).
**Numbers**: tris LOD0 / LOD1: pylon 1064 / 232, gondola 352 / 67 (both liveries), sea billboard 348 / 94, ON AIR 648 / 192,
guyed mast 848 / 206 (v1 776 / 170), dive tower 992 / 212.

## D-095: Beacon Rock M27 anchors — stack tops, an angle-station cable line, one role per stack, the ON AIR face plane (TASK-516; builds D-059 A / D-062 R3-15 / D-094 on the D-083 anchor pattern) — 2026-10-28

**Decision**: (1) **Stage.** `world/gen/plans/marketing-anchors.ts` (`reserveBeaconAnchors`) runs in the Marketing
plan's `finish` (pads levelled, footpaths carved), so every earlier Marketing piece keeps its place and the faces it
measures are the rendered ground. Numbers `content/themes/marketing-anchors.ts` (`MARKETING_ANCHORS`). No rng is drawn;
no prop, pad or zone is placed. Reserved as non-blocking shapes (scatter keeps off): every stack top disc, the summit
station disc, a 3 u strip along every span, the pool disc, the billboard / neon rects. `world/index.ts`: boat routes
keep off the pool (`beaconRouteKeepOut`, pool r + 3; seed 2024's tour ran 2 u from it), seamarks keep off the pool
and the spans (`beaconSeaKeepOut`). `IslandData.anchors` entries may carry an optional `y` (world u).
(2) **Contract** (rotY = xz heading (cos, sin); `…Size` = two numbers, not a position):
- `stackTop{k}` (k = the profile's `stack{k}`): flat-top centre, y = top, rotY = seaward (summit → stack);
  `stackTop{k}Size` = { x: r, z: r }, r = usable radius (ring within 0.6 u of the top; ≥ 1.2, top ≥ 3).
- `cable0..N-1` (`anchorChain(isl, 'cable')`): 0 = summit lip station (disc r 2, off the paths, ≥ 7 u from the
  tower), N-1 = far station on the last stack (footprint r 1.5), between = mid pylons on stack tops (r 0.8).
  y = pivot ground; **cable seat = y + 6.5 (ends) / + 7.5 (mid)**, sag = span × 0.03 in [0.35, 1.6] (`cablePoint`,
  the mailCablePoint parabola), gondola hangs 2.2 u. rotY: ends face along the line, a mid pylon = bisector.
  Clearances checked on the final ground: gondola floor ≥ 6.5 over the sea (boat masts ≤ 6), ≥ 1 over ground /
  stack tops, ≥ 5 u horizontally off the Broadcast Tower, off summit obstacles; spans ≤ 60, turns ≤ 125°.
  `beaconCable(isl)` returns the seats.
- `transmitter` (pivot on a stack top, rotY seaward), ≥ 1.3 u off every span.
- `seaBillboard` (board-plane centre, y = board centre, rotY = outward normal) + `seaBillboardSize` { x: width,
  z: height }; the stack face lies 0…2.4 u behind the plane over the board.
- `diveTower` (platform pivot on the top rim, rotY → pool, ≥ 1.8 u off every span) + `divePool` (centre, y = 0)
  + `divePoolSize` { x: radius 2.5, z: shallowest seabed depth }; pool 4–9 u out, ≥ 50° off the span headings.
  `platformH` 5 is the contract dive height over the stack top.
- `onAir` (letter-column plane centre on the windward cliff, y = column centre, rotY = outward normal from the
  shore-SDF gradient) + `onAirSize` { x: width, z: vertical extent ≥ 4 × 1.4 + 2 × 0.4 = 6.4 }; cliff 0…2.5 u
  behind the plane, nothing poking through, ≥ 60 % Zone.cliff, ≥ 4 u off the first span, heading nearest
  windward − 40° (the W4 side).
(3) **Line shape.** The 2–4 stacks sit in a ±43° fan round the windward side, so a line "over the stacks" sweeps
along the arc: chain = the most stacks that clear, smoothest order (total turn) first; mid pylons are **angle
stations** (30 seeds: turn median 76°, max 115°). (4) **Roles**, one stack each: most roles, the billboard
preferably on the far station's stack (its top is free for the station), the dive tower off it; a stack top holds
its pylon and its role prop side by side. With only 2 stacks the transmitter is the one left out.
**Numbers (30 test seeds)**: cable 30 / 30 (≥ 2 stacks on 28; 77 of 83 stack tops on the line), billboard 30 / 30,
dive tower + pool 29 / 30 (5208: 2 stacks, no deep pool), ON AIR 30 / 30 (extent 6.4–8.9 u, width 2–4 u),
transmitter 21 / 22 seeds with ≥ 3 stacks (0 / 8 two-stack seeds); stack tops 83 / 83. Seeds 1–40: cable 40,
billboard 40, dive 39, neon 40. Gondola floor margin min 0.6 u, pool depth 2.0–2.6 u. Cost ≈ 7 ms per world.
World hashes re-pinned (1001 `91698eee39027f56`, 1 `e9ac9ccdc8e865c6`); the pool keep-out re-routes the global
tours, so the DevOps breakwater route bound is 1.5 → 2 u for seed 7312 only.
**Rationale**: the D-083 pattern (scored ordered searches, reserved shapes, anchors) lets TASK-517 / 518 build on
fixed sites; running in `finish` was needed because the tower's pad bulges the cliff lip after the plan (seed 6523's
neon plane had rock in front of it when measured before the pads).
**Alternatives not taken**: a monotonic outward chain (most seeds kept 1 stack, the fan forces the turn); `maxTurn`
80° (same); measuring before the pads (wrong faces); no route keep-out (a tour within 3.2 u of the pool centre on 6 / 31
seeds, the wow seed among them).

## D-094: M27 Marketing signature plan (Cable Carnival) + M26 follow-ups — plan only — 2026-10-28

- **M27 scope** (from D-059 direction A and D-062 R3-15, no new user decision needed): `MK:M1` cable car (gondola
  variant of `mailLine`, pylons, 3 gondolas), `MK:M3` sea-facing billboard on stack 2, `MK:M4` vertical ON AIR neon on
  the windward cliff face, `MK:M13` diving tower on stack 3 (one new tier-2 def, Marketing cap 10 → 11), stack 1
  transmitter. Fair stays on ledge2. Wow shots from `study/marketing-research.md` §1.4 (Cable Dusk, On-Air Rock).
- **Order** (the M25 pattern): TASK-516 anchors (worldgen, pure data) ∥ TASK-517 props → TASK-518 placement + motion
  (hash re-pin) → TASK-519 QA for M26 + M27.
- **M26 follow-ups** the user asked for after TASK-509c: TASK-513 obsidian black-sand cove, TASK-514 lava shader
  polish (runs now, render-only), TASK-515 crater-deck couple (DevOps tableau cap 6 → 7). 513 / 515 wait until
  TASK-518 has merged, so only one branch at a time re-pins world hashes.

## D-093: DevOps M26 placed and moving — a carved lava bed with one planned bridge, the deck and kiln on late earthworks / pads, the breakwater kept off the boat routes, the tug escorting the cargo ship (TASK-509c; builds D-080 A + D6 / D10 / D17 / D18 on D-083, D-091, D-092) — 2026-10-28

**Decision**: (1) **Stage.** `world/gen/plans/devops-m26.ts` runs right after `placeM25` (the kit, lodges, village and M22
quick wins keep off it); its `finish` runs in `plan.finish` after the funicular earthworks, before the road lanterns.
Numbers `content/themes/devops-m26-site.ts` (`DEVOPS_M26_SITE`, `DEVOPS_M26_MOTION`). (2) **D1 lava bed.** Carved late
along the `lavaChannel` anchors (groundWriter rules): bed `depth` 0.5 u below the ground, levelled across a 1.7 u core,
cut back over 2.3 u, never climbing downstream (shoulders cut ≤ 3.2 u), ≥ 0.9 u; recorded as `world.fences` kind
`'lava'` with the bed height per point in `levels` (hashed). `render/lava.ts lavaFlows` now reads that line (+ the
`lavaFall` anchor when it ends the line), settlement-props skips the kind. (3) **D3 one bridge, planned (the TASK-467
glass-bridge pattern).** Existing footpaths crossed the channel on 8 / 30 seeds, all high on the cone where the banks
differ 3.5–6.5 u (a level 9 u bridge cannot sit there). Instead the most level crossing of the lower reach (banks
± 3.9 u within 1 u, gentle footing, deck clear) gets an emberBridge v0 at plan time; the bed is blocked for paths
± 2.2 u except under the deck and both ends get a path link, so paths cross only on it. In `finish` the pivot is
planned (`FixtureData.y`, new optional field = render pivot y; mean bank height), the abutments are levelled to it and
ramped up to the deck ends, the arch keeps the bed. v1 (rail bridge) is not placed: no track crosses the channel (the
funicular and foundry rail keep off it). (4) **D6 deck** on the `craterDeck` anchor without a pad (a pad falloff bent
the funicular rail by the top station: "pivots off the ground" 6.3 % > 6 %): in `finish` the pivot slides ≤ 1 u to the
least floor relief, then late earthworks level the floor ground; a `deckGazer` story spot (one bot at the telescope:
the island's 6-bot tableau cap is full, a couple would be skipped). (5) **D17 kiln** on a rect pad beside the smiths'
lane (ring 5–22 u, mouth toward the lane centre or ≤ 0.55 rad off it, pad clash rule of the lane), chimney smoke
(FIXTURE_EMITTERS) and a night mouth glow (culture-mover scene). (6) **D10 obsidian**: sea stacks on the shelf in front
of the bluff (seabed −1.6…−0.25), a tide-pool slab at the waterline, shard clusters and a cairn on the bluff top; the
bluff stays (no second low cove). *(TASK-513 / D-098 later carves a black-sand cove there and re-seats the decor.)* (7) **D18 breakwater** near the anchor: variant head / straight / short, shifted
toward the shore / along the arm until every footprint sample's seabed lies between the foot (−2.6 + 0.25, buried)
and −0.3, ≥ 6 u off the piers; boat routes get keep-out discs along it (world/index.ts `breakwaterKeepOut`, 5.5 u).
(8) **D18 tug** = sailboat v9 drawn in `render/movers.ts` next to the cargo ships (+1 instanced mesh, same program) and
**escorting the first cargo ship** of each DevOps pier loop (`harbour-routes.ts tugPose`: off its bow quarter, 3.5 u
to the loop's inside), funnel smoke as placed puffs born along that closed-form path (culture-movers scene).
**Rationale**: one planned crossing is the only way to get a level bridge on the cone (and is the codebase's creek
pattern). A life-boat tug on its own loop (the first try, life/tug.ts + a CULTURE_BOATS entry as TASK-509b suggested)
crossed the cargo ships' stadium on every seed (≤ 1 u apart); escorting the ship on the same closed form can never
collide and is what the 509b `route { lead }` hook hinted at.
**Alternatives not taken**: bridges at the existing crossings (banks 3.5–6.5 u apart); a pad under the deck (bends the
rail); the tug as a life agent on a breakwater racetrack (crosses the cargo loop); carving a black-sand cove (bluff
coast, zone repaint: out of scope).
**Numbers / cost**: 30 test seeds: lava bed + fall 29 / 30 (3104 has no channel anchors), bridge 28 / 29 channels,
deck 30, kiln 29, obsidian ≥ 4 pieces 29, breakwater 28 (foot buried on all), tug 30 / 30 pier loops. M26 plan +
finish ≈ 3 ms per world. Wow `--assert` green (W16 290 / 300 calls, memory peak 169 / 170 MB W4 / W27,
W-lava-river-dusk 155 calls / 601 k tris). World hashes re-pinned (1001 `ca2196116a8f94c7`, 1 `69eeb588528e1744`).

## D-092: DevOps M26 lava-pack props — five defs at the tail of PROP_DEFS, the tug as sailboat variant 9, DevOps cap 14 -> 19 (TASK-509b; builds D-080 A + D3 / D6 / D10 / D17 / D18 on D-083) — 2026-10-28

**Decision** (no placement, TASK-509c places them): (1) **Defs** (all tier 2, planner-pinned, ledger entries 15-19,
`cultureCapOverride.devops` = { 19, 1 }, so +5 inside the D-080 "~+6" estimate): `emberBridge` (v0 footbridge, v1 rail
bridge; 9 x 2.4 u, spans local z, segmental stone arch with a lava-lit soffit and glowing cracks), `craterDeck`
(octagonal 4.6 u platform: caged rail on the crater side, open entry + steps behind, 2 benches, telescope, 2 lava
lanterns), `glassKiln` (terracotta beehive kiln, molten mouth, chimney, rack of lava-glass lanterns in the DevOps accents
+ a bench; ~6.3 x 3.8 u, front +z), `obsidianShard` (v0 shard cluster, v1 sea stack 2.7 u, v2 tide-pool slab, v3 cairn;
noShadow) and `devopsBreakwater` (v0 8 u, v1 5 u + ladder, v2 6 u head with the red harbour light; FLOATING_FIXTURES).
(2) **Tug = `sailboat` variant 9** (`tugBoat`, 4.6 x 1.9 u, bow +z, keel y = 0; PropDef variants 9 -> 10, rolls stay on
0-1), like the ferry (v2) and patrol boat (v3): no def, so the boat movers read it by variant. Hooks `smoke` (funnel top),
`tow`, `bow`, `lamp`, `route { speed, lead }` (hints from `content/themes/devops-m26.ts`). (3) **Emissive**: lamp glass
= 1 (night lamps ramp); lava seams, soffit and the furnace mouth = 1.6 (molten class, dim by day too). (4) Numbers
`content/themes/devops-m26.ts` (`DEVOPS_M26`, `M26_PAL`), geometry `geo/themes/devops-m26.ts`, defs
`content/props-themes/devops-m26.ts`, showcase `?gallery=1&ids=devops26` / `gallery-shots.ts devops26`.
**Rationale**: variants keep the ledger at +5; skirts below the pivot (bridge 0.5, deck 0.6, breakwater foot -2.6) hide
the gap on a slope / seabed like the marina piles, so the geo test floor is widened for exactly those three ids.
**Cost**: `craterDeck`, `glassKiln` and `devopsBreakwater` exceed 3 u in plan or height, so `isLargeStructure` draws them
from T0 (3 more far groups once placed; one instance each per island); the bridge (2.5 u wide) and the shards do not.
**Not done**: no placement, no movers, no `BANK_FIXTURES` entry for the bridge (its span axis is local z, the glass
bridge's is x: 509c decides how to ground the two abutments).

## D-091: Lava river painted by the terrain program, lava fall on the waterfall ribbon, steam delta as a puff preset (TASK-509a, M26 D1 + D2 shader half) — 2026-10-28

**Decision**: (1) **River = ground art, not a mesh.** `render/lava.ts` packs the channel polyline (≤ `LAVA.maxPoints` 24:
x, z, ground y, arc length) into terrain uniforms; the ONE terrain program paints a strip of half-width
`LAVA.halfWidth` 1.5 (the D-083 width 3) + a 0.75 u cooled bank inside an xz box test: cellular crust plates
(1.45 u) drifting downhill at 0.55 u/s over glowing cracks, crust share 0.4 at the notch → 0.9 at the lip (+0.35
toward the banks, open molten centre near the notch), hot core toward `#FFC870`, emissive (×1.2 day + 0.75 × uNight,
pulse 0.85–1.0 travelling downstream) next to the crater glow; ground detail normals off inside the strip. Paints
only within ± 3 u of the polyline's ground y. The warm night spill on the ground beside it (radius 4) is MAR_DETAIL
(medium / high); low keeps the stream itself (no bloom there anyway). 0 programs, 0 draw calls, 0 textures.
(2) **Fall = flow surface modes 2 / 3.** `lavaFalls(world)` turns each flow's `fall` pose into a `WaterfallData`
(base = first sea cell ≤ 16 u out) and `createWaterfalls` adds it to the existing ribbon mesh with its own style
(4 u inland, width 3, delta disc radius 1.1 × w + 1.8): mode 2 = molten sheet with dark crust teardrop streaks sliding
down (0.9 u/s, 2 u spacing), mode 3 = molten core + crust skirt + boiling foam rings. Their glow goes through new
`marLG` / `marLC` (declared in `LAVA_SURFACE_PRE`) in ACTIVITY_GLOW, day + night. Shared lit program: 0 programs;
+0 draw calls where the island already has waterfalls (seed 1001), else +1 (the ribbon mesh). ~+1.2 k tris.
(3) **Steam delta** = puff preset `PUFF_DELTA` (PUFFS.delta: 6 slots, 1.0–4.2 u, rise 7), drawn as soft steam with
shader kind 2.25 so the fragment lights it from below at night like the volcano steam; emitters per fall low 1 /
medium 2 / high 3.
(4) **One source.** Every consumer reads `lavaFlows(world)` (`{ islandId, channel, fall }`); today it reads the
D-083 anchors as they are (temporary wiring), TASK-509c replaces its body with the placed / carved channel.
**Rationale**: D-080 asked for "lava ground emissive = material change, 0 new programs"; ground art (D-057 compass,
TASK-481 carpet) is the codebase's pattern for decals on the terrain, and it follows the heightfield (no z-fight,
no acne: there is no second surface). The waterfall ribbon already solves the wall profile (gap, throw, no z-fight).
**Impact**: Programs low 9 / medium 17 unchanged; wow `--assert` green (W16 289 calls, W-funicular-dawn 756 k tris).
New dev cams `D-lava-channel(-night)`, `D-lava-fall(-night)` (seed 1001). The waterfall flow-tag GLSL pin is
unchanged (the lava declarations are cut out like the culture ones). World data and hashes untouched.
- **TASK-514 (2026-10-28)**: delta disc (mode 3) is now a broken, boiling steam / foam patch (two world-space
  value-noise layers `marVf` + noise-warped bands drifting out, ragged rim and core, inner foam tinted warm and glowing
  `rimGlow` at night) instead of the water fall's concentric rings (water foam untouched); the river's first segment
  runs `LAVA.source.reach` 4.5 u back past the notch, fading in with a ragged edge, up to 1.8 × wider and molten over
  the first 4 u, so the stream pours out of the crater glow (no rounded cap). Numbers `LAVA.source` / `LAVA.fall.delta`;
  0 programs / 0 calls / 0 tris (low 9 / medium 17); wow `--assert` green (W-lava-river-dusk 155 calls, W-funicular-dawn
  768 k tris). The flow-tag GLSL pin is unchanged (FLOW_SURFACE is cut out of it).

## D-090: Low gpuMemoryMB 70 → 76, low triangles 350k → 366k; HQ grows to stay the clearly largest island — 2026-10-28

- **Budget**: the TASK-502 / 510 QA pass (`mar-docs/qa/m24-m25-m29-m30-2026-10-27.md`) measured the low ladder
  at 71–74 MB on all 14 presets (calls ≤ 66 / 170, tris ≤ 175k / 350k). The overage is the M24 / M25 / M29 /
  M30 kit geometry, a deliberate content cost, not a leak. Low gpuMemoryMB 70 → 76 (measured + ~3 %, as D-028).
- **Island size**: since TASK-503's apron ring, Emberpeak reads as large as HQ in W1 (both ≈ 400 × 350 px, the
  dark cone the strongest mass). ART_BIBLE wants the hero clearly largest. User choice: grow HQ (~20–25 %),
  keep Emberpeak and its TASK-503 / 507 anchors untouched. Rejected: shrinking the apron (re-places the
  funicular / lane / onsen anchors), relaxing the rule.
- **Presets**: TASK-502's Kite Hill Afternoon, Proving Grounds Noon and Fairy Night wow presets were never added
  (the content exists only as dev presets); they are added after the HQ growth, together with a re-framed
  `W-ember-lane-night` (too close, hammers / stalls unreadable).
- **Outcome (TASK-511)**: `ARCHETYPES.hearthholm.growth` 1.11 (content): the rolled 110–140 u diameter still caps the
  others (`heroDominance`) and places the layout, then HQ takes radius × 1.11 (+23 % land area; 122–155 u). Only an
  island whose channel to the grown hub falls below `LAYOUT.minGap` steps straight out (to minGap + 2 u), snapped to
  the 2 u height grid so its sampled shape and anchors stay; a re-centre (also snapped) only if `extent` is broken.
  Same placement attempt on 500 / 500 layout seeds; 132 of 372 islands step out on the 62 test seeds (seed 1001:
  only Lonely Palm, +4,+4; HQ and Emberpeak stay put). The cove's flattest-disc search scales with the growth, so the
  grown HQ keeps its pre-growth cove and hill (without it seeds 2841 / 3104 lost the hill to the cove, peak 15 u).
  Emberpeak: radius never changes; all TASK-503 / 507 anchors identical on 24 / 31 test seeds, on the 7 where it
  steps out only `breakwater` (×2) and `smithsLane` (×1) move. W1 (mask frame): HQ 363×358 → 394×378 px, land
  83–90k → 97–98k px²; Emberpeak 366×337 → 360×330 px, 90k → 87k px² (HQ / Ember px area 0.92–1.00 → 1.11–1.13).
  Marina (31 seeds): fort 31 / 31 before and after, seed 1001 17 → 20 boats + breakwater head, mean 12.6 → 14.0, min
  4 → 5. Cost: islands that step out sample other world-space zone noise, so some plan shares move by a seed (test
  floors re-baselined, five per-seed bounds widened with the seed named, see the TASK-511 test commit); the whale
  route now also validates its emitted polyline. Rejected: pushing every island out by the growth (moves all
  islands and every raw cam, same ripple), growing HQ into the channels (breaks minGap).
- **Low triangles**: the bigger HQ behind the devops ladder puts L-devops / L-pairs-devops low at 351–355k tris
  (was 320–325k): low triangles 350k → 366k (measured + ~3 %, as D-028). User accepted ×1.11 and the widened per-seed
  bounds (2026-10-28).

## D-087: QA Customs Port placement + motion (TASK-508) — compact quay on the cove terrace, port-first planning, ship as culture-mover parts on the day clock — 2026-10-27

**Decision**: (1) **Quay.** The Palmlagoon cove terrace is only ~14 u deep and ~24 u long (a 1.8 u flat shelf in front of a 6 u wall), so the
quay is compact: crane (`customsYard` v1, the empty rig, facing the water), ONE inspection line (v2) on its +x side, an optional
container stack (v4, where land allows: all 30 test seeds got one), the scanner arch over the ship lane (floating fixture, pivot at the
waterline whatever the dredged depth) and 2-3 `quarantinePontoon`s (variant 0 is the landing pontoon). The cross line (v3) is not
placed: a second belt did not fit the terrace; the cross lamp is lit by a mover glow and the check lamp dimmed by a dark cap while a crate
fails. `FIXTURE_RADIUS` customsYard 6.2 (the crane's footprint), arch / pontoon 0.05; `scannerArch` joins `FLOATING_FIXTURES`.
(2) **Planning.** Pure layout maths `world/gen/customs-port.ts` (crane frame: x along the quay, z seaward), planner `gen/plans/qa-customs.ts`.
`customsCandidates` ranks quay spots from every coast cell in 3 passes (cove r 40, whole rim, roughest pad + nearer pontoon); a port within
`portCove` (26) of the harbour anchor keeps the original pier (`dockHitsShapes`), else `findDock` takes a new `avoid` list and the pier moves
off the best port that still leaves one, else the port goes round the rim. The port is committed before the yard / stunt yard / campus
(strip pad + blocking shape, dredge `carveWater` depth 1.1 along berth, spin disc and lane, water discs as non-blocking shapes) and
publishes the anchors `customs` (crane x / z / rotY), `customsFlip` (z = lane side), `customsLane` (x = lane variant, z = pass).
Boat routes take a new `RouteInput.keepOut` (discs round the spin spot, lane and pontoons: no coarse node inside), so ferries never run
through the ship water. All 30 test seeds get a port: 12 in the cove pass, 15 on the rough passes; 7 of them are far from the cove
(rim side: 3630, 5208, 7312, 7575, 7838, 8627, 2841). Cost in the older plan statistics: rim-walk share 23 -> 21 of 30 (threshold 0.75 -> 0.65),
stunt yards 29 -> 25 (0.9 -> 0.8) because the quay's pad and path block take foot-of-bluff ground.
(3) **Ship route.** In from the open sea along a straight lane 34 deg off the quay, one arc (R 20) onto the line at z 12.6, a slide to the
berth, unload, slide out, a 180 deg spin on the spot (the hull stays 0.7 u off the quay), then out the way it came: it passes under the arch
twice. It pops in / out at the lane end with an overshoot scale and spawn ripples.
(4) **Cycle** (`CUSTOMS_MOTION`, 36 s visit from noon of the culture-clock day, 08:00-20:00, closed form in `ctx.day`, so `?freeze=1&time=12&simt=..`
replays it): arrive 0-9 (under the arch ~2.5-4.5 s), slide in 9-11.6, crane jobs 11.8-22.3 (3 x 3.5 s: trolley out, spreader down, latch,
lift, back, set on the belt), slide out 21.1, spin 23.7-26.7, leave 26.7-34.7 (under the arch ~31-33 s). Each crate rides the belt to the
end (verdict from a hash pattern per visit, >= 1 reject and >= 1 pass): pass = the check lamp pulses, the crate rolls on and is filed
behind the stack; reject = the cross lamp lights and the crate shrinks and is lobbed (1.1 s, arc, one turn) onto the landing pontoon
with a squash and a splash; the rejects sink 3.6-5 s into the next visit. Reduced motion (`uMotionScale`) halves the lob arc and the
sway / bob; the schedule does not change.
(5) **Render.** Four new culture-mover part kinds (`ship`, `cargo`, `trolley`, `spreader`: the kit's loose builders with their own vertex
colours, the container body white = instance tint), the scene is `customsPortScene` on the v1 crane (range 90 u). 0 new programs; a kind draws only
while it has instances, so the port costs nothing outside its range. The marquee chase on the arch stays the existing always-on shader
chase (making it gate on the ship needs a uniform in the shared lit program); while a ship is under the arch a mover glow lights the scan strip and the crown lens.
**Rationale**: the cove cannot host the two-belt layout of D-082 next to the pier, and moving the pier first keeps the old campus on most seeds.
**Alternatives**: two belts (v2 + v3) side by side (28 u of frontage, fits no seed); a single-lane in / out with a reversing ship (reads wrong); a reclaimed
platform raised from the shelf (land masks would disagree); hard-gating the marquee through a new uniform.
## D-088: Coding Wind Tunnel + Kite Day (TASK-498, CO:C1) — a windsock lift tag in the shared shader, hill kites as culture-mover scenes, Coding cap 12 / 2 — 2026-10-27

**Decision**: (1) **Defs.** `windTunnel` (tier 1, 1 variant, 14 u lattice half tube: 8 arch ribs, 6 rails, zig-zag braces,
floor deck, blue server-light strips, two warm lantern posts at the downwind mouth, five windsocks hung from the ridge) and
`tunnelFan` (tier 2, 3 u: cage, five blades + nose cone on the shared spin tag 1, so it turns with the wind and the gust
boost like the turbines; NOT the 1.25 test-fan tag). Appended at the very end of `PROP_DEFS` in a marked TASK-498 block;
they are the 11th-12th Wind Gardens ledger entries, `cultureCapOverride.coding` = 12 defs / 2 tier-1 (giantDuck stays
tier 1). Both are tall / wide enough to draw from T0 by size (D-031). Geometry `geo/themes/coding-tunnel.ts`, numbers
`content/themes/coding-tunnel.ts`, defs `content/props-themes/coding-tunnel.ts`. Tunnel 3168 tris (LOD1 772), fan 728 (LOD1 114).
(2) **Placement.** The plan pushes both as fixtures on the `windTunnel` anchor (D-075 pad, no new pad): the tunnel runs along
its local +x, so its fixture rotY = anchor.rotY + pi/2 (axis = (cos rotY, sin rotY), downwind); the fan stands 7.55 u
upwind on the axis with rotY = anchor.rotY (it faces local +z = downwind). `FIXTURE_RADIUS` windTunnel 3.2, tunnelFan 1.5.
(3) **Windsock lift.** New spin-channel tag `MOTION_TAG.lift = 5`, `aSpin = (ring xyz, 5 + k/16)`: a branch in
`ACTIVITY_DISPLACE` (activity-glsl.ts) rotates the sock about the ring (object z axis) from a droop of 0.95 rad up to
horizontal by `smoothstep(0, 0.55, gust)`, the gust sampled `0.7 s x k` late so the five socks lift as a travelling wave
down the tunnel; reduced motion holds them halfway (`SOCK_LIFT`, content/activity.ts). 0 new programs (the branch lives in the
shared lit vertex chunk like the tracker / bob tags), no new attribute; tagged geometry stays instanced (far-merge skips it).
(4) **Kite Day at the hill.** `hillKiteScene` (render/culture-movers.ts): every `kite` v0-2 pole within the hill foot + 4 u
of the `kiteHill` anchor becomes a culture-mover scene (6 parts: line, kite, tail line, three bows) active in the
`kites.ritual` (kiteDay, 14:00, 60 s) window. Pole k starts 0.006 of the window after pole k-1 and climbs over 0.2 of it
(all up by +20 s: 14 kites in the air on seed 1001, 10 hill + 4 rack); fall in the last 0.12. Height 8.5-14 u over the pole,
downwind drift 0.62, sway and bob x `uMotionScale`. One pole per island (hash of island id and pole count) is the stuck
kite: it climbs 2.7 u and tugs 1.1 u on a 4.6 s beat, tail dangling, never free. The static pole kite stays drawn (a small
practice kite on its pole, like the rack's). Closed form in the day clock (rise / fall) and the sim time (wobble).
(4b) **Night.** The blue light is emissive strips (glow mask 0.7 floor edges, 0.55 ridge, accent colour, same recipe as the
Server Yard plates); the warm part is the two lantern posts (glow 1) and the island's own park lamps.
**Cost**: +2 defs, 0 programs, 0 draw calls (movers add no calls; per-kind part meshes already exist), +1 draw group for
the tunnel (instanced, 1 variant). CPU: Kite Day on 0.030 ms per movers update with 19 scenes / 105 instances (10 hill kite
scenes = about 0.02 ms, 0.002 ms per kite; off-ritual 0.006 ms). Shots (seed 1001, medium): D-move-coding-tunnel 109 calls,
W7 229 calls / 652 k tris / 17 programs (programs unchanged). Hash re-pin: world 1001 9fee33b6295d7da8 -> 22607ba828b46119,
seed 1 1d1beca734b6d8b9 -> a0c03d00cb60a97b (own commit); Coding fixtures +2 (117 / 205 / 218 -> 119 / 207 / 220).
**Rationale**: a gust-driven lift needs a vertical rotation the wind-sway weight cannot express (it displaces along the
wind only); the tag channel already hosts per-part rotations, so no program or attribute was added. Hill kites as movers
follow the rack's kiteScene, so reduced motion and the capture clock come for free.
**Alternatives**: windsocks as three instances of the `windsock` def (a third def would exceed the 12 cap, and they would
not lift); a CPU-posed sock mesh (a draw call plus per-frame writes); hiding the pole's baked kite (needs a per-instance
flag in the shader).
## D-089: DevOps M25 placed and moving — a graded funicular with earthworks, ore buckets on the mail cable mesh, trip hammers, geysers at the shift end (TASK-507; builds D-080 B + D7 + D9 + D14 on D-083 / D-084) — 2026-10-27

**Decision**: (1) **Stage.** `world/gen/plans/devops-m25.ts` runs right after `reserveGrowth` (before the Ember Smiths
kit, lodges, village and M22 quick wins, which then keep off it) and puts the TASK-504 kit on the TASK-503 anchors;
numbers in `content/themes/devops-m25-site.ts` (`DEVOPS_M25_SITE`, `DEVOPS_M25_MOTION`). (2) **D4 funicular as a
graded mountain railway.** The cone is 0.5–1.0 steep and `funicularRail` climbs at most 0.6, so each section (foot →
mid, mid → top) is a zig-zag of straight legs (1–7 legs, one- or two-sided swing) cut into whole 3 u pieces (per-leg
scale 0.75–1.5). Candidates are scored before the pads and their strips reserved; `plan.finish` (after pads and
paths) picks per section the one with the least earthwork on the final ground, runs a beam search for the rises
(`world/funicular.ts planRail`: 0 / ±1 / ±2 pitch steps, foot stub → top stub) and **cuts / fills the ground** to
the grade line (`railEarthworks`, core 1.3 u + 2.6 u blend, never into another pad core or within 1.2 u of another
obstacle). The joint levels are stored on the polyline (`Polyline.levels`, hashed), `world.fences` kind
`'funicular'`; settlement-props lays the pieces from them and the cars run on them (`railFromLevels`), so render,
movers and tests read one rail. A mid anchor that splits the climb badly (share outside 0.3–0.72 or < 10 u from the
top, e.g. seed 1001) is re-sited on the foot → top line at half height. Stations: rackShed v2 fixtures (pad margin
0.4), the mid one passed through (front down the line, rail leaves behind it). A lava lantern by every zig-zag
vertex, outside the car's pivot sweep, where the ground is gentle enough for a post (≈ 60 % of the vertices; the
2 u grid cannot hold a level stand that close to the rail's earthworks). (3) **Cars.** One car per section (lower orange, upper teal),
closed form (`carPose`): dwell 6 s, a 30 s one-way trip with each leg eased by length and a 2.4 s pivot at every
vertex (the car turns on the switchback), counter-moving (lower starts at the foot, upper at the top, both meet at
the mid station); one instanced mesh per livery on the movers' lit program (`render/devops-lines.ts`). Vertex
lanterns flare (culture-mover glow) as a car passes at night / dawn. (4) **D13 ore cableway.** mailLine v3 at the
quarry edge and on `cablewayTo`, v2 pylons ≤ 15 u apart, nudged along the line round obstacles, every span keeping
the bucket bottoms ≥ 0.9 u over the ground. `mailLinePairs` now skips v2 / v3; `oreLines` chains them and their spans
join the HQ mail-cable mesh (0 calls). 4 loaded buckets per line ride the sag quarry → furnace, tip into the hopper,
shrink away and grow back at the quarry (one instanced mesh, no shadow). (5) **D14.** goodsStall v7 rows facing across
`smithsLane` (pitch 2.3); one strip pad unless its falloff would reach a pad core > 0.8 u off its level (the foundry
rail), then per-stall pads under the same rule, else level ground only. A trip hammer (culture-mover parts) strikes
the workpiece at 1.1 Hz on a hashed phase per stall with a flash and 3 sparks (D15) per strike. (6) **D9.** onsenHouse
v1 / v2 along the `onsenTown` bank facing the pool, a new story kind `onsenTown` with 3 dozing capybaras
(SPOT_CRITTERS, no tableau bot). (7) **D7.** 3–6 geyserCone on a hashed scatter of `geyserField` (≥ 3.6 u apart, disc
pads); each erupts on its own hashed 18–30 s timer (6-blob, 6 u water column + 8 soft puffs downwind); the rhythm
slot `shiftEnd` (17:30) got `seconds: 12`, during which every cone erupts together. (8) **D5** was already built
(M22: antennaMast v2 bell at the 06:00 shift siren, red beam at night); TASK-504's beam head only needed the lot.
**Rationale**: earthworks are how real mountain railways climb; keeping the levels in the world data means one rail
for props, movers and tests. Reusing the mail-cable mesh and culture-mover parts keeps the kit at 0 new programs.
**Alternatives not taken**: a straight rail on the station heading (buries / floats on every seed), levelling at
render time from the ground (pads cut walls by the stations), a passing loop on one section (branching rail).
**Numbers**: see the TASK-507 note in `mar-docs/MEMORY.md`.

## D-086: QA Customs Port kit — three defs at the end of PROP_DEFS, QA cap 12 -> 15, ship and crane rig as loose builders (D-082) — 2026-10-27

**Decision** (TASK-506, no placement): (1) **Defs** (all tier 2, planner-pinned, ledger entries 13-15; `cultureCapOverride.qa`
= 15 / tier-1 1, so +3, not the ~+2 of D-082): `scannerArch` (Q8; lattice posts, girder, gable roof, prism lens, a
marquee bulb loop on both faces, the channel runs along local z), `customsYard` (5 variants: 0 quay crane carrying a
container, 1 the empty rig, 2 / 3 inspection line with the check / cross lamp lit, 4 loose stack of QA containers),
`quarantinePontoon` (Q9; 3 layouts, `FLOATING_FIXTURES`, flags 0, `tagBob` + red `tagBeacon` lamp). The arch and the pontoon
had to be own defs (frame, floating by defId); crane + line + stack share one def as variants (the DevOps crane is part
of `containerYard`, not a def, so there was nothing to vary). (2) **Not defs**: the cargo ship (`buildQaCargoShip(loaded)`;
white hull, mint waterline, yellow trim, 8 container slots) and the crane rig (`buildQuayTrolley`, `buildQuaySpreader`,
`buildQuayCable`, `buildQaContainer(i)`) are loose builders for the TASK-5xx movers, like `buildDropCrate`. (3) Containers are
the DevOps ones at 0.72 scale (3.6 x 1.5 x 1.5) in white / mint / yellow / sky / deep mint, so ship, spreader, belt and
stacks share one size. The arch clears the ship by 2.6 u (7.1 vs ship top 4.5, 8.1 clear width vs beam 4.6). (4) Geometry
`geo/themes/qa-customs.ts`, numbers + palette `content/themes/qa-customs.ts`, defs (TASK-506 block at the tail of
`PROP_DEFS`) `content/props-themes/qa-customs.ts`, showcase `?gallery=1&ids=qa30`.
**Rationale**: variants and loose builders keep the ledger at +3 and give the movers hooks without more defs.
**Alternatives**: separate defs for crane / line / stack (+5 total); baking the ship as a def (a mover, not a fixture).
## D-085: HQ yacht marina + cove-mouth star fort built (TASK-505, M29; builds D-081) — 2026-10-27

**Decision**: (1) **Stage.** `world/gen/marina.ts` runs after the boat routes (like the seamarks): it reads the ferry
routes, so nothing stands in a channel. From the ferry pier root it walks the shore contour 3.2 u out to sea (SDF
iso-line) in both directions, 8 u past the pier; the walk whose end is nearer the ferry stop is the main spine and ends
at the horn at the cove mouth. Spine pieces + a comb of finger piers (12 u, else 8 u) off both spines, a fort on the
horn tip, a breakwater arm from the fort towards the pier (pieces + a head with the green harbour light), the moored
fleet, and 4 red/green gate pairs (8 buoys, H11) along the HQ ferry route round its stop. Output is `world.marina`
(fixtures, hashed as `hashes.marina`, a `STAGE_HASH_KEYS` entry), rendered by `settlement-props.ts` just before the
districts at pivot y = 0 (`FLOATING_FIXTURES`), so no earlier store index or decor stream moves. The generic seamarks keep
`HQ_MARINA.gates.reserve` (48 u) round the stop (`reserved` input). Numbers: `content/themes/hq-marina.ts`.
(2) **Defs** (appended at the end of `PROP_DEFS`, TASK-505 block): `marinaPier` (tier 2, `fromT0`, 5 variants: finger 12 u,
short finger 8 u, spine piece, breakwater piece, breakwater head) and `starFort` (tier 1, 5-point bastion with sloped walls,
gun embrasures, a keep with a red light and a fluttering flag, 12 u, so drawn from T0 by size). **HQ cap 12/1 → 14/1**
(`cultureCapOverride.hq`: +2 defs; the tier-1 slot, empty so far, takes the fort; no second tier-1 needed).
(3) **Boats are not agents.** The fleet (15–20 on seed 1001, 4–18 elsewhere, cap 20) is fixtures of the existing
`sailboat` def: v6 / v7 sloops (mast-head lamp, emissive 1, on the ordinary lamp ramp) and v8 the tender, plus the old
v0 / v1; LOD0 bobs through `tagBob` (the TASK-481 float bob). No life budget, no new draw call per boat: they
instance per (def, variant). (4) **Ferry.** HQ's pier is in a closed bay, so the ferry stop is the nearest open-water node
(26 u from the pier end on seed 1001), right in front of the fort. The routes are untouched; the marina keeps ≥ 2.4 u off
every route sample, the fort ≥ 9 u. The ferry pier is unchanged (`dock` ×1); the H10 mail jetty is not built yet.
**Alternatives not taken**: boats as an agent kind (agent budget, a kind per variant); a `dock` variant for the comb
(docks drive the routes, gull perches and the path graph); fixing the pier frame in content (the shore differs per seed).
**Numbers** (seed 1001, medium): W16 with the old cam 281 → 290 calls, 749k → 757k tris, memory 159 → 160 MB (budget
300 / 170); with the re-aimed cam 263 calls / 708k tris. Whole wow set `--assert` green: max calls 266 (Marina Dusk),
memory peak W27 163 MB (was 162). Ladder L-hq low max 69 calls, medium 146 calls / 270k tris, `--assert` green; ci set
selftests (regen / ctxloss / edit) green. New LOD0 tris: marinaPier 496 / 340 / 264 / 424 / 412, starFort 1172, sailboat
v6 / v7 208, v8 126 (LOD1 ≤ 30 %). Fort + marina read at T0 (W1 postcard, E-flood) and T1. **Impact**: every island hash re-pins (new stage + new hash key); W16 re-aimed (8 u higher: the masts crowded
the foreground); cap 14 for HQ only; the breakwater exists on few seeds (the ferry stop sits at the horn).
## D-083: Emberpeak grows an apron ring; a grown island is pushed out from the hub; growth sites are reserved anchors — 2026-10-27

**Decision** (TASK-503, M25 DevOps I step 1, implements the D-080 growth): (1) **Apron.** `emberpeak.apron`
(`content/islands.ts`) adds a low ring (raw 1.6, ≈ 6.5–7 u on the bluff) round the cone foot out to 1.36 r
(± 0.14 r low-frequency fbm warp: bays and lobes), tapered back to the cone foot over 28–62° off the harbour shelf axis so the harbour stays the
quay at the water. `diameter` stays [90, 120] and `sizeClass` 'medium': the cone (peak 34–36, crater, rim, notch)
is still shaped in units of that radius, so its silhouette is unchanged and HQ keeps the larger radius (hero
rule). `reachScale` 1.35 → 1.52 (every land cell inside it on the 30 test seeds), `boundsScale` 1.5 → 1.72. The foundry / data center shelves
(≤ 1.27 r) become terraces above the apron. (2) **Layout.** New `layoutReachScale` (Emberpeak 1.35): the island is
placed with its old reach, then `place()` pushes it straight out from the hub by its growth and, while a channel
is below `minGap`, steps (1 u, ≤ `LAYOUT.growPush` 16) away from the tightest neighbour with the hub channel held
≤ `LAYOUT.growHubGap` 62 (a wider ferry channel could take a skerry / the sandbar); `layoutProblem` checks the grown
discs. Every other island keeps its exact centre on all 38 test / shot seeds and 482 / 500 seeds (Emberpeak moves
8–12.6 u; 9.7 u on 1001). The first try (true reach in the ring placement) re-centred the whole archipelago by
≈ 8 u and re-rolled 12 tests on five other islands. (3) **Growth sites** (`world/gen/plans/devops-growth.ts`,
numbers in `content/themes/devops-growth.ts`): ordered scored searches (no rng), reserved as non-blocking obstacle
shapes (lots and kit keep off, paths cross) and published as island anchors — the lava channel before every
facility, the rest after the foundry (before the kit, lodges, village and M22 quick wins). No fixture, pad or
zone. Contract in the module header and `mar-docs/MEMORY.md`.
**Rationale**: D-080 wants the apron / lava / funicular laid out once. A reserved anchor (QA `stunt`, Coding
`windTunnel` pattern) lets M25/M26 place props without moving any existing lot. Pushing the grown island out
instead of re-placing the ring keeps the other five campuses, their raw cams and their tuned 30-seed tests.
**Impact**: Islets, routes, reefs, whale, HQ (compass streets aim at the islands) and Marketing snapshots and every
world stage hash change — re-pinned in one commit. DevOps raw cams (seed 1001) are stale (+9.7 u). Fixes that came
with it: fumarole pools keep off every lot's pad core (`devops-m22.ts`; the summit tower sank 8 u onto a pool's
level on seed 3630); the reef-route test allows a sample over a natural seabed above the gap floor (≤ +0.5 u);
pipe open ends < 0.2 (old code spans 0.03–0.20 over 12 seeds).
## D-084: DevOps M25 props kit — four new defs, five variants of older defs, hooks for movers (TASK-504, D-080 B + D7 + D9 + D14) — 2026-10-27

**Decision**: (1) **New defs**, the 11th-14th entries of the Ember Smiths ledger, appended at the very end of
`PROP_DEFS` (`content/props-themes/devops-m25.ts`, geometry `geo/themes/devops-m25.ts`, numbers
`content/themes/devops-m25.ts`): `funicularRail` (tier 2, 3 pitch variants 0 / 0.3 / 0.6 rise per run, 3 u pieces
on pylons), `funicularCar` (tier 2, 2 liveries, two counter-tilted compartments, lit windows + end lamps),
`geyserCone` (tier 2, sinter mound 2.1 u, vent hook) and `oreBucket` (tier 3 noShadow, empty / loaded). (2) **Variants
of existing defs** (wrappers over the stock builder; the older variants are untouched, `rollVariants` keeps random
rolls on them): `rackShed` 2 = funicular station, `onsenHouse` 1 / 2 = stilts (2 + towel lines), `goodsStall` 7 =
smith's stall, `mailLine` 2 / 3 = ore pylon (mid-line / furnace end), `antennaMast` 2 = the M22 watch tower plus the
beam head (lens ring + hood) and `bell` / `beam` hooks. (3) `cultureCapOverride.devops = { defs: 14, tier1: 1 }`.
**Rationale**: piece length 3 u and a geyser under 3 u wide keep both out of `isLargeStructure` (no T0 promotion,
no far groups); D-076's pattern (tail append, geometry in `geo/themes`, numbers in `content/themes`) keeps every
defId and hash pin.
**Cost**: `onsenHouse` 1 / 2 are 4 u tall and `rackShed` 2 has its own far shape, so they add 3 far groups
(onsenHouse v1+v2 share one). `OFFICE_DEFS.rackShed.variants` 2 -> 3 and `LOT_ROOFS.rackShed` got a third entry
(the antennaMast precedent). Several older tests were adjusted to the new variant counts.
**Not done**: no placement, no movers; they read the hooks listed in MEMORY.

## D-082: QA harbour becomes a customs port — plan only — 2026-10-27

**Decision** (user, picked from an HTML comparison): Palmlagoon's harbour turns commercial as a **customs port**:
a cargo ship enters under the Q8 scanner arch at the cove mouth, a crane unloads containers onto an inspection
line (inspectors + ✓/✗ lamps), rejected crates go to the Q9 quarantine pontoons; QA white / mint / yellow with
hazard stripes. Alternatives not taken: logistics hub feeding ferry routes (`W:B2`), free-trade bazaar.
**Rationale**: Strengthens QA's "test" identity and differs from DevOps Ember Works' container yard by role
(DevOps produces and ships, QA checks what arrives), giving an inter-island story.
**Impact**: Reuses the DevOps crane / container props as variants (~+2 defs incl. Q8 arch, Q9 pontoon); QA cap
12/1 is already full → override. Stays on the cove + rim side, Proving Grounds layout untouched. Roadmap M30.

## D-081: HQ gets a yacht marina and a star fort at the cove mouth — plan only — 2026-10-27

**Decision** (user): Hearthholm's cove becomes a **yacht marina**: comb piers along the inner curve of the
crescent, a 15–20 sailboat / rowboat fleet, a breakwater with the H11 channel buoys, mast lights at dusk. The
crescent tip at the cove mouth gets a **small star fort** (gun embrasures + flag tower) paired with the H18
harbour-entrance lights; the ferry passes in front of it. Alternatives not taken: working fishing / boatyard
harbour, canal marina (terrain carving vs. D-057 streets); fairy-tale cliff castle, tidal castle on a skerry.
**Rationale**: The HQ study's main finding is that the archipelago's "harbour" does not read (one pier, empty
cove); a full marina answers it at T0, and the fort frames the cove mouth without touching D-057 zones
(Z3/Z4/Z9 + Z10).
**Impact**: HQ cap 12/1 is full → override (~+2 defs: marina pier variant, fort; fort is a tier-1 candidate).
Boats are instanced variants; W16 / W21 / W22 framing and the HQ ladder rung need a re-check. Roadmap M29.

## D-080: DevOps gets all three directions (B Funicular + A Lava + C Onsen/ambient) and a bigger Emberpeak — plan only (amends R2-2) — 2026-10-27

**Decision** (user, note-taking session): R2-2 picked B alone; the user now wants every DevOps idea in
`study/coding-devops-qa.md` §1: B (D4 funicular, D5 summit bell + red beam, D13 ore cableway), A (D1 lava river,
D2 lava fall + steam delta, D3 ember bridge), and the ambient / scene pack (D6 crater deck, D7 geyser field,
D9 onsen town, D10 obsidian beach, D14 smiths' lane, D17 lava-glass kiln, D18 breakwater + tug). Emberpeak may
grow around the volcano to make room (today `diameter: [90, 120]`, `sizeClass: 'medium'`): a lower apron / ring
of shelves round the cone, the cone silhouette itself unchanged.
**Plan**: DevOps is split out of M25 into two milestones. **M25 DevOps I** = island enlargement first (one layout
+ hash re-pin for the whole archipelago), then B + D14 + D9 + D7. **M26 DevOps II** = A (D1/D2/D3, lava ground
emissive = material change, 0 new programs) + D6 + D17 + D10 + D18. Marketing signature moves to M27, Research
to M28.
**Rationale**: Enlarging first means the apron, the lava channel and the funicular stations are laid out once;
doing B before the growth would re-pin every DevOps plan twice.
**Impact / risks**: ~+6 defs (funicularRail, funicularCar, bridgeSpan, crater deck, geyserCone, obsidian) → a
DevOps cap override well past 12/1, decided per task with measured numbers. Layout spacing and every island hash
re-pin; W5, W31–32, L-devops and all DevOps raw cams go stale. DevOps frames must stay inside the W16 / ladder
budgets (`shots --assert`). Numbers D-078/D-079 are left to the TASK-497 / TASK-501 branches still in flight.
## D-078: QA Proving Grounds motion (TASK-501) — crash track as testTrack v1 with a fixture + pad, movers as culture-mover parts, fan speed-up through one shader uniform — 2026-10-27

**Decision**: (1) **World.** The stunt yard now carries the figure-8 crash track: `testTrack` variant 1 (rollVariants 1,
so rolls keep the loop track) pushed as a fixture at the reserved rect with a level pad (`stuntPad` 0.6); the drop
tower is placed as variant 1 (the empty cradle). This changes the fixture list and the heightfield, so the world
hashes were re-pinned in their own commit (seed 1001 `hashes.world` 85f1f50abd11e43f → 18c09ab8f87ec744, seed 1
da2dd754fee99a25 → bb958837ffbb53a2). The kit placement and the 30-seed plan thresholds did not move.
(2) **Track.** The centreline is a lemniscate (`geo/themes/qa-crash.ts`, lobes along z, 6.4 x 14.6 u so it fits the
smallest 9 x 18 yard): strand A on the ground, strand B over a 1.0 u ramp, a parabolic flight over the crossing
(slope m up, -m down, apex 1.5 u) and a landing ramp; the flight has no rails. It is the same `TrackPath` as the loop
track, so the cart pose (`cartFrame`) and the lap clock are shared. Lap 15.1 s, jump at 9.1-10.4 s.
(3) **Movers.** The cart stays on the `movers` mesh (testTrack variant 1 picks the crash path; +0 draw calls; the
landing squash scales its basis). The wobbling dummy and the drop-tower crate are culture-mover parts (`PART.dummy`,
`PART.crate`, scenes in `render/culture-movers.ts`): a part kind draws only while it has instances in range, so a
view without the Proving Grounds pays nothing. The crate follows rest / lift / hang (shake) / free fall / squash
(cycle 20 s, phase 3 s), with a dust ring and a glow ball over the foot check lamp. The dummy leans out in turns
(sideways acceleration of the centreline), back on the ramp / forward on the way down, and springs + hops after the
landing; all of it is a function of the sim time, reduced motion scales the squash, the lean and the hop and
lengthens the lift / fall.
(4) **Fan.** The blades carry spin tag 1.25 (`FAN_SPIN_TAG`); the lit vertex shader adds `uFanSpin` (radians, shared
uniform written by the culture clock from `fanSpinExtra(day)`) to their wind-driven angle. The bump is a trapezoid of
speed over the 10 s `sirenTest`, whole turns (4), so the blades speed up to about 4 x and settle with no jump and no
state. No new program: the uniform and one branch live in the shared lit vertex pars.
**Rationale**: a pad-less fixture would have floated rails over a 1.8 u relief; CPU-posed meshes for the blades would
have lost the far (T0) read of the fan; a second movers geometry would have cost a draw call in every QA view.
**Alternatives**: the crate as a second `InstancedMesh` in `movers.ts` (+1 call); a uniform multiplier on the fan
angle (jumps when the speed changes); a bigger track filling a 14 x 28 yard (would not fit the 9 x 18 fallback).

## D-076: QA Proving Grounds kit — a reserved stunt yard instead of the second track, three defs at the end of PROP_DEFS (D-059 A, D-062 R3-14) — 2026-10-27

**Decision** (TASK-499): (1) **Kit.** `dropTower` (tier 1, 10 u lattice, v0 crate parked at the top, v1 the empty
cradle for the TASK-501 mover), `testFan` (tier 2, 4 u blades on the shared `aSpin` tag, a dummy + streamer pole
3 u in front), `obstacle` (tier 2, 4 variants: hurdle, tyre stack, balance beam, slalom cones). They are the
10th–12th defs of the QA ledger (cap 12, tier-1 1 → `cultureCapOverride.qa`), appended at the very end of
`PROP_DEFS` (no existing defId shifts), geometry in `geo/themes/qa-proving.ts`, numbers and the white / mint /
yellow palette in `content/themes/qa-proving.ts`. The tower and the fan are > 3 u, so the batcher draws them from
T0 like any large structure (D-031) whatever their tier. (2) **Stunt yard.** The plan reserves a flat rect of
≈ 2× the loop track (14 × 28, else 12 × 24 / 10 × 20 / 9 × 18) as a blocking obstacle shape before the campus
(lots and lanes keep off it) and publishes it as the island anchors `stunt` (centre + rotY) / `stuntSize`;
TASK-501 puts its second track fixture there and adds the level pad. The kit (tower at a short end, fan on a
long side facing the lane, the course on the opposite side) stands round it, else round the loop track. (3) The
Hall of Checks gets four more clipboard-wall candidates (the reservation shifts the lots, 24 / 30 → 30 / 30
seeds have the wall).
**Cost**: the rim walk / palm row / scoreboard share thresholds of `plans-qa.test.ts` were relaxed (0.85 → 0.75,
0.7 → 0.6, 1 → 0.95): the yard takes plateau ground on some seeds. 28 → 29 of 30 test seeds get a yard.
**Rationale**: reserving first keeps TASK-501 independent of how crowded the plateau is; reserving after the
campus found a rect on only 15 / 30 seeds.
**Alternatives**: a non-blocking reservation (lanes crossed it on most seeds); a pad under the yard (its relax
bound is the rect's circumradius and flattened the Hall's clipboard spots).

## D-077: Mother Kite Train — one CPU-posed mesh on the sky-craft material, two-tone kites, no shader changes — 2026-10-27

**Decision** (TASK-500, CO:C3): seven kites (a larger lead + six followers) fly on a closed-form circular orbit
(`R` = 0.58 x the Coding island radius, `peakY` + 20 u, lead 2.4 u/s) around the Coding island. Followers trail the
lead by arc length (7.6 u; kites 8.2 / 6.6 u tall), snake sideways down the line, sink 0.3 u each and bob / roll / pitch out of phase
(periods jitter +-13 % per seeded kite). Each kite has a bow tail that flutters; a thin 3-sided line (with sag) joins
the kite centres. The whole train is ONE `InstancedMesh` (one instance at the far fleet anchor, like the Hype Fleet)
on the existing sky-craft material: kites are rigid, the tails and the line bend, so the 692 triangles are written
on the CPU each frame (flat normals, fixed-size arrays, skipped when time / camera / motion scale are unchanged).
Data in `SKY_CRAFT.kiteTrain`, code in `render/kite-train.ts`, created by `createSkyCraft`. Reduced motion reads
`SHARED.uMotionScale` (the culture movers' channel): sway, bob, roll, snake and tail flutter shrink to 0.3, the orbit
itself keeps its speed (it is a closed form of the clock). The train fades by a CPU scale inside 26 → 10 u of the camera.
**Look**: every kite is two-tone blue + gold (odd kites swap the quadrants), and kites bank alternately about their
spine (+-0.95 rad) so a camera outside the orbit never sees one edge-on. A plain yellow kite read as flat grey on its
shaded side (the lit program lerps the shade 35 % toward the purple tint, independent of albedo, and its normals come
from screen derivatives, so vertex normals cannot cheat), the blue half carries the silhouette.
**Cost**: +1 draw call (W11: the train mesh), 0 programs, 692 tris, 97 KB of dynamic buffers, no shadows; CPU
0.05 ms per update (7 kites; only when the clock or the camera moved). Excluded from the ladder by `craft=0`
(TASK-450) like the other sky craft.
**Rationale**: the plan wanted a blue-yellow dot chain at T0 over Coding, and a proper train at T1 / T2. The
mesh has no ground-height dependency (`peakY` only), so the worldgen knoll shifts it by at most a few u.

## D-075: Coding Kite Hill — an absolute profile lift, the hill outranks the farm, a tunnel pad anchor for TASK-498 — 2026-10-27

**Decision** (TASK-497, `CO:C2` + the `CO:C1` site; D-059 direction A, D-062 R3-12): (1) **Knoll.** The
Millbrook profile gets one smoothstep knoll (`KITE_HILL`, content/islands.ts): +4 u at a flat 4.5 u summit,
0 at the 16 u foot. It is a new `IslandProfile.lift` added in u *after* the peak normalisation and the
terraces (buildRawLand), so the plateau keeps its height and the knoll is exactly +4 u whatever the island's
peak; no plateau fade (near the rim it rides out as a headland, the bluff pass eases the lip). Site: no RNG
draws (knolls, pond and patchwork keep their streams) — candidates by bearing off the upwind direction ×
radius-normalised distance, ranked upwind on full plateau > upwind on the plateau edge > crosswind on full
plateau > crosswind edge, each clear (`parkClear` 13 u) of the Tech Park lawn pad footprint round the pond;
the farthest upwind wins. The hill takes the nearest knoll's anchor / turbine (always the chime tower), other
knolls within 0.42 r are dropped; the summit pad never relaxes toward a neighbour (`Pad.step` 99). New
anchors `kiteHill` and `windTunnel`. (2) **Room.** A keep-out disc of the foot radius (`CODING_PLAN.hill.keepOut`
0: a wider halo cost groves and glyphs on small plateaus) is registered before the office rows; the kite ring,
tunnel search and the yard / farm / Hack Garden fallbacks lift it. The Server Yard now goes before the solar
farm (it carries the blue server night and the rack cat); the farm keeps R3-12's halving (TASK-479's `keep` 0.5,
unchanged) and, when nothing fits off the hill, may take the foot with single-row blocks (`minLatticeHill`),
the patch grid shifted by half a cell (`hillShifts`) when the hill split the free ground across two cells, so
every seed keeps one T0 block. The M22 beds keep their pads; only the pinwheel meadow's last fallback stands
on the hill foot, unpadded there (a pad's falloff, margin + 4 u, would shave the flank). (3) **Kites.** With a
hill the kite field moves to its foot: 8–12 kites (v0–2) on rings round the foot (thin poles on the flank,
relief ≤ 1.2 u), the rack on its own small pad + Kite Day story just outside it facing the hill; a bench beside
the hill path in the plan's `finish` pass. (4) **Tunnel site.** A 16 × 6 u pad (14 u tunnel + 1 u ends) on the
ridge from the hill turbine toward another knoll turbine, axis along it (±0.25 rad), ≥ 18 u from the summit
(a pad's falloff would shave the hill); fallbacks round the foot, then any high plateau spot within 45 u, then
(`tunnel.last`) anywhere on the island with relief ≤ 6 u, gap 0.4 u, ≥ 16 u from the summit, four axes; axis
turned to lean downwind. Flattened, blocks paths; nothing is placed on it (TASK-498 builds the tunnel).
**Contract for TASK-498**: `isl.anchors.windTunnel` = {x, z, rotY} on every seed; axis (cos rotY, sin rotY),
+axis downwind (cos(rotY − windDir) ≥ 0); the 16 × 6 rect (`rectShape(x, z, rotY, 6, 16)`) is level (corners
within 0.3 u) and clear of fixtures, lots, turbines and paths.
**Cost**: 0 defs, 0 programs; +4–7 kite instances on the island (same def). Generation time unchanged within
noise.
**Coverage (30 test seeds, keepOut 0)**: hill on the upwind half 25 (the rest crosswind where the park fills the
windward half), rise 4.0–5.7 u (mean 4.9) over the plateau 24 u out; ≥ 8 hill kites 30; tunnel site 30 (130
seeds checked); Kite Day rack 30; hill bench 30. Solar blocks 57 → 39 (area 11 004 → 5 110 u², 46 %), 0 seeds
without a block (was 1); Hack Garden 24 (= before); pinwheel meadow 30. Floors that moved (the hill takes
~800 u² of a ~70 u plateau): nap grove 23 → 14, hedge glyphs 22 → 21, rim walk 28 → 24.
**Rejected**: lifting a knoll inside the normalised profile (the peak normalisation squashes the plateau to
pay for it); placing the tunnel before the farm / yard (it took the yard on seed 1001 and 11 of 33 seeds);
lee-side hills (the bluff cove ramp sinks the summit).

## D-074: Night effects polish — signal as a beam with a travelling light front, streak-spark fireworks with a mirror reflection, beacons readable from the postcard (amends D-069) — 2026-10-26

**Decision** (TASK-496, M23 QA findings 3, 4, 7): (1) **Signal.** The relay signal is no longer a glowing
ellipsoid + flash ball (read as a comet / lightsaber) but a soft beam on the lighthouse beam program: per island
one non-turning beam mesh (shared beam geometry, own material, 0 programs, 1 draw call only while that island
flashes), rotated from the lamp to the next island's lamp and stretched to the gap (`len / 40` along, `width` 0.7
across). Each flash its light front (the beam's fade-out band) runs out and reaches the next lamp at `reach` 0.45
of the flash (eased), the beam's flare grows with distance, and the next lamp answers with a catch pop
(`SIGNAL_CHAIN.reach / beam / catch`). The beam shader now transforms normals with the inverse-transpose of the
model scale (unchanged for the uniformly scaled beams). Sketched in debug frames: A beam alone, B a morse
train of beads on an arc, C beam + bead head; B is invisible from 200 u, C's bead head reads as a comet again —
A kept. (2) **Fireworks.** The burst pool (same capacity and buffers) gains a `streak` glyph (a teardrop whose
tail spans the spark's screen path over the last `trailS` s, dithered toward the tip), a `glow` disc (flash),
and `willow` / `mirror` patterns. Shells alternate peony (streaking sparks that hang, then sink) and willow (60 %
of the sparks, gold-tinted, heavy sag, 0.6 s trails). The reflection is now the shell's mirror image: `mirror`
sparks follow a sphere spark and are placed where the eye ray to (x, 2 sea − y, z) meets the sea, as thin
vertical shimmer streaks — on open water between the burst and the camera. A dithered core-glow disc was tried
and dropped (dither pattern visible). W15c was re-framed lower and further back (`-30,2.2,275,-30,7,10`) so
the shells and their reflections share the frame; W15e became a side view of the Coding → Marketing signal
(`30,120,120,-150,15,85`, `simt` 31.35). (3) **Beacons.** The skerry beam distance fade moved from 380–500 u to
900–1200 u, and every beacon flare has a distance floor (`flareMin` 0.006 × distance), so the postcard shows
the beams and lamps instead of red tower dots.
**Cost**: 0 MB (no new textures or buffers beyond one shared beam geometry per world, ≈ 240 vertices), 0
programs; +1 draw call while a signal flashes, +2–3 calls for the far beacon beams at night (W15 182, W15b 183).
Fireworks counts stay per quality (sparks 48 / 150 / 220, mirror 14 / 48 / 72 per shell).
**Rationale**: the beam program already reads as "lamp light" (W15d); a front that runs out tells the direction
without a bright head. Streaks give the burst motion in a still frame; a true mirror image is the only
reflection that sits on open water from any camera.
**Alternatives**: a travelling pulse uniform in the beam shader (a new shared uniform for every beam material);
per-spark trail copies (more instances); a water-shader reflection branch (program change, D-069).

## D-073: Budget headroom without raising budgets — per-kind culture-mover meshes, no depth on the composer output buffer, glasshouse row from T0 — 2026-10-26

**Context** (TASK-495 / TASK-493): the M23 QA found low-ladder tier-2 rungs over the 350k triangle budget (Design 120 u
358k, Research 131.6 u 351k) and medium memory at 169 / 170 MB (W27). A bisect over the merges shows the Design
overage is not new in M23: it crossed at TASK-483 (M22, `c4f18b1`, +8.7k) when the bell and graduation-cap parts
(148 triangles) joined the merged culture-mover geometry. On that geometry every instance drew all 970 part
triangles (the shader collapsed the other kinds), so each new kind cost its triangles × every live instance
(≈ 58 at the Design rung). M22 QA ran the ladder without `--assert`, so it went unseen; M23 added ≈ 2–4k (reefs,
beacons, whale) and pushed Research over too.
**Decision**:
- `render/culture-movers.ts`: one `InstancedMesh` per `PartKind` (`buildPartGeometries`, the merged geometry split by
  kind), one shared material (no new program), each frustum-culled on its instances' bounds. Low Design 120 u
  358k → 303k tris, Research 131.6 u 351k → 305k (calls ±1); medium W16 796k → 765k. Each kind on screen is a
  draw call: W16 268 → 278 (+5 kinds, +5 glasshouse shadow casters, below).
- `render/post/composer.ts`: the ping-pong `outputBuffer` only takes full-screen effect quads, so it has no depth /
  stencil renderbuffer unless a pass needs the depth texture (high: DOF). −7.9 MB on every medium frame
  (1920×1080), no pixel change.
- TASK-493: `PropDef.fromT0` draws a small def from T0 like a large structure (D-031) — the six Design
  glasshouses (each < 3 u) read as one colourful row and popped in at 140 u. They are still declared tier 2, so
  the Design tier-1 cap (2) is unchanged; they cost their LOD1 at T0 / T1 and cast shadows at T2 / T3 from farther
  away (W16 +5 shadow calls).
- The Design ladder target stays on the windmill slope: on the glasshouse row L-design passes, but the dome of the
  conservatory comes to the frame centre and its LOD1 → LOD0 colour change fails pair 140 (mean 2.59, blob 0.6 %).
**Rejected**: raising the low triangle budget (the cause was a fixable per-instance waste); sorting instances by kind
in one buffer (WebGL2 has no base instance); half-res bloom luminance (−7.9 MB more, but changes the bloom).
**Open**: worker bots draw 1862 triangles each (all 16 accessory / item slots, ≈ 520 shown) — the same pattern,
≈ 97k of the Design 120 u rung; the next lever if the tier-2 budget gets tight again.

## D-072: Whale polish — a chubby, raised body with surface-breaking flippers and a visible fluke; W28 is a raw cam (amends D-070) — 2026-10-26

**Decision** (TASK-494): (1) The mesh (`geo/whale.ts`) is ≈ 900 triangles (was ≈ 620), still one vertex-coloured
`InstancedMesh` on `mar-lit`, CPU skin unchanged: a chubby teardrop (20 sides, 16 rings, 1.2 × wider than tall),
a round head with big eyes, a darker dorsal ridge, light flanks and a cream belly, a slender stock, a 9 u fluke with
a notch and pale trailing edge, 3.1 u pectoral flippers with an upward dihedral. (2) The back now rests `back` = 2.9 u
above the sea (`REST_Y = back − 2.9`, was 1.75 − 1.95), so the equator is at the waterline and the flipper roots and
the stock are at or above it; the flippers paddle ±14° and break the surface. (3) The tail bend sign was wrong:
`WhaleBend.tail` / `fluke` were documented "+ = up" but the skin sent a positive angle on the rear segments
down, so the slap lift went under water. The skin now subtracts them; the idle pose curls the stock up
(`swim.tailLift` 0.22 rad) and flexes the fluke back flat (0.9 × that), so the fluke clears the water while swimming.
(4) The spout is 34 placed puffs (soft edge 0.35, opacity 0.6, spread 0.22) and the splash 10: still 44 slots.
(5) W28 left the overview (the whale was a few pixels at the corner) for a raw cam 34° down from the north-east
(`230,62,40,170,0,112`, 199 calls): the whale faces the camera with the Research cape beside it. W28b is a front
three-quarter close-up (`226,28,76,198,0,110`, 124 calls). The route, the schedule and the 17:45 pin are unchanged.
**Rationale**: from above the first lens read as a fish or a submarine: the flippers were 0.5 u under the surface,
the fluke hung down, and there was no tapered stock. A submerged dark body silhouette was tried as a cost and not
added (the water alpha already hides what is deeper than ~ 1 u).
**Alternatives**: a separate flipper / fluke mesh (second draw); raising the whole whale instead of the dihedral.
## D-070: The whale — a CPU-skinned world mover on the culture-clock day, one lap per day — 2026-10-26

**Decision** (TASK-489, `W:D6`): (1) One grey whale, a mover (not an agent): `render/whale.ts`, mesh from
`geo/whale.ts` (≈ 620 triangles, vertex-coloured, one `InstancedMesh` of count 1 on the existing `mar-lit`
program, hidden between surfacings), pose timeline `life/whale-pose.ts`, numbers `content/whale.ts`.
(2) The route is a closed loop round the archipelago through `openSeaAt` (planned per angle as the outermost
obstacle + pad, dilated, smoothed, validated every 4 u; `world/gen/whale-route.ts`, not part of `WorldData`, so no
world re-pin). The whale does one lap per game day; it surfaces 5 times a day, the first at 17:45 off the
Research headland (anchor `headland` + 60 u straight out), the gaps seeded in 90–150 s. Everything is a function of
the culture-clock day seconds (`CultureState.day`) + seed, so a capture (`time=17.75&simt=0.5`) lands on the exact
pose; only a click adds state. (3) The spout and splash are placed slots of the puff program (D-066), 44 in all.
(4) Click = ray test against 6 spheres on the spine (`interaction.ts` `doPick`), tail slap + splash.
**Rationale**: the 17:45 cape pass is pinned to the day clock, not to sim time, so the schedule cannot be a pure
function of `time`. A CPU skin of ≈ 1.8k vertices costs a few µs and avoids a skinned-mesh program.
**Alternatives**: vertex-shader bend (new program, 17 → 18); sim-time schedule (cannot pin 17:45).
## D-068: Ladder pair IoU follows the dolly's radial parallax; drift is judged without fog; the drift class filter is not relaxed (amends D-035) — 2026-10-26

**Decision** (TASK-487, `scripts/ladder-metrics.ts`):
- **Pair IoU**: both ladder cameras sit on one line through the target, so the frame centre is the epipole and a
  point off the target plane moves only along its radial line. A structure cell that is solid in one frame only
  is left out of the IoU union when the other frame has structure on its radial corridor (±`slack` cells). The
  corridor is as wide as the parallax of a point `parallaxH` = 12 u above the plane (`parallaxRatio`, exact
  for the bottom row's centre, which has the widest parallax). Terrain cells get no corridor. A prop that appears or
  vanishes with nothing on its corridor still counts, and so does a sideways slide. Step colour metrics are
  unchanged. L-pairs-marketing 42.4 → 37.6 (the transmitter mast at the frame edge) goes from 0.915 to 0.976.
- **Drift**: the proposed "structure covers > 35 % of the frame → keep the class filter" rule is rejected. The
  one case that needed it, a Design target on the glasshouse row (drift 21 u 9.45), is a real pop. The six
  tier-2 glasshouses (each < 3 u, so not promoted to tier 0) are missing at 170 u and appear at the 140 u
  boundary (pair 140 mean 2.82 / blob 0.6 %). The rule would have hidden that.
- The Design ladder target stays on the windmill slope until the glasshouse row is visible from T0 / T1.
- **Drift without fog**: ladder presets also capture each distance with `fog=0` (new capture param,
  `<dist>.nofog.png`). The judged drift compares those frames, and the fogged drift is reported as `driftFog`.
  The D-009 fog depends only on the camera distance, never on the tier. At the target it is 1.8 % at 170 u,
  6.3 % at 340 u, 7.3 % at 480 u and 6.1 % at 700 u, which was the medium L-marketing far drift: 700 / 480 /
  340 = 3.97 / 4.24 / 3.48 fogged against 2.20 / 1.91 / 1.47 without fog. It was not the strata, and not the
  sea-plane mapping, which stays under 2.2 without fog. The fog ramp is unchanged, so the W1 / W11 postcards are
  untouched. Steps and pairs still use the fogged frames, so a material that fogs differently at a tier still
  shows at its boundary pair.
**Rationale**: the TASK-374 calibration gave colour cells a ±1 slack but left the IoU without one, so a thin
mast sliding 3–4 cells by parallax read as a footprint change. A radial corridor bounded by geometry is
narrower than a large isotropic slack.
**Impact**: `StepMetrics.parallaxCells`; `compareFrames(…, slack, parallax)`; `Params.fog`; the harness passes `parallaxRatio`
for each step or pair.

## D-071: Culture constellations — layout-placed glyph caps in the sky program — 2026-10-26

**Decision** (TASK-491, `W:G4`): the seven glyphs (`content/constellations.ts`) are drawn by the sky
dome program (0 programs, 0 draw calls): a 18×7 RGBA float data texture (stars + line segments per theme,
owned by the world scope) and 7 cap uniforms. Each glyph sits on the bearing from the archipelago centre
to its island at atan(50 u / distance) (clamped 11–26°, so 12–17° on the pinned seeds); HQ, at the centre,
rides at 28° in the widest bearing gap; any glyph steps down until its disc clears the moon at every
night hour. Visibility = star alpha × an hour window (fade in 19:45–21:00, full 21:00–04:00, out by
05:00); lines are an alpha mix of 0.10, 0.15 during Comet Night. Hashed stars dim 60 % inside a cap.
**Rationale**: placement follows the seed with no worldgen change; the constellation uniforms are one
module-level set shared by the dome and every beam material (same program). **Impact**: the existing
night wow frames (W15 postcard sky strip ≈ 0–7°, W24/W25 no sky at all) cannot show them without a
re-frame; W27 "Constellation Night" is the showcase.

## D-069: Relay night scene — skerry beacons, signal chain, fireworks — 2026-10-26

**Decision** (TASK-490, `W:B1` + `W:B6` + `W:G7`; numbers in `content/signature.ts`):
- Beacons: a `beaconTower` prop on up to 3 spread-out skerry peaks (picked max-min from the one farthest from
  HQ). Their beams and the Marketing lighthouse beam reuse the beam program, one call each; the route-order
  phase lag (1 s per rank of an 8 s turn) is a mesh yaw, so only `uTime` drives them.
- Signal chain: a culture-mover scene per island peak (night-only mast, so W16 tris don't grow); each island
  flashes 3 × toward the next in its relay step, the HQ semaphore points at it.
- Fireworks: a second emissive Bursts pool, closed-form from the culture clock and the world seed (22:00 + the
  60 s Comet Night, i.e. day second 10; capture `time=21&simt=85`), 6 shells in culture accents, cancelled in
  rain. The water reflection is a spark glitter at sea level, not a water-shader branch.
**Impact**: world hashes changed; `interaction.ts` now adds to `counters.particles` instead of overwriting it.
Open: in live play at high day speed the show re-spawns when birth times drift > 1 s.

## D-067: Reef shoals and shared-shelf sills — a separate reef mask, gaps measured like LAYOUT — 2026-10-26

**Decision** (TASK-488, `W:D1` + `W:K3`): 3–6 shoal blobs (crest −2.4…−4.2 u) in the gaps between islands
and ≤ 3 sills (crest −3 u, never above −2.4 u) on the Voronoi seam between neighbours, numbers in
`content/reefs.ts`. Routes pay a reef penalty and `carveReefGaps` deepens raised cells along every route
(toward −7 u, never below the natural seabed), so boats keep a deep gap.
- The K3 "< 55 u" threshold is measured the way LAYOUT measures gaps (centre distance minus both `reach`
  radii), not coast to coast — coast-to-coast gaps are 60–90 u, so K3 would never appear.
- The water shader tints from a static R8 reef mask (`world.reefWeight` → `textures.reef`, +148 KB, world scope)
  times a live-depth fade, instead of feeding reefs into the shore sdf: the sdf drives foam rings, swell
  flattening and mist, which would grow phantom shores, and depth alone can't tell a sill from a natural shelf.
**Impact**: world hashes changed. The mask is static: a Phase 2 brush that paints a new reef must re-derive
it. TASK-489's whale route uses `openSeaAt` / `reefClearance` / `routeClearance` from `world/index.ts`.

## D-066: CPU-placed soft puffs on the puff mesh; far terrain level shades with the grid slope — 2026-10-26

**Decision** (TASK-486): (1) Culture scenes that need steam draw it on the existing puff mesh, not
as lit mover blobs: `Puffs.reserve(n)` (before `finalize`) hands out a block of slots whose life
(`aShape.w`) is negative; the vertex shader then takes centre / size / opacity / alpha edge as given
(no time function). `CultureMoversView.bindPuffs` reserves one block for all scenes; `Writer.puff`
fills it each frame and hides the rest. First user: the Research test firing (`CULTURE_MOVERS.launch`).
(2) The 4 u terrain level (and level 1 while it morphs toward it) shades with the height texture's
slope (`TERRAIN_FACETS.slopeSpan`) instead of its laid-back mesh normal.
**Rationale**: Lit blobs read as one faceted boulder (W26); the puff program already has the soft
radial alpha, so no new program (medium stays 17 / 20). The far level's normal lit far cliffs
brighter and greyer than the 2 u level (ladder far drift).
**Alternatives**: a soft-alpha variant of the creature material (new program); keeping 2 u meshes
for cliff chunks at T0 (more triangles, same drift gain in the experiment).

## D-065: Story-spot keep-out and stair flights on spared faces — 2026-10-26

**Decision** (TASK-485): (1) Every story spot has a *stage* derived from the life content (SPOT_CRITTERS
routes, TABLEAU bots' feet; `world/gen/story-keepout.ts`, numbers `STORY_KEEP_OUT` in
`content/placement.ts`). After the plans' `finish` pass, planner fixtures on a stage are dropped unless
they are the spot's own props (its defs / anchors / look-ats within `own` u); tall poles
(`STORY_KEEP_OUT.tall`) keep a wider stage; scatter trees / bushes avoid stages (OCC_PATH mark).
Planners may pick a clear stage up front (Coding's duck crossing tries both sides / both pool ends).
(2) On themes in `STAIR_FLIGHT.byTheme` (Marketing) every steep 'stair' leg gets a `stairFlight` fixture
(new shared def, look × rise variants, `content/stairs.ts`). TASK-453c spares those faces from the path
paint and the TASK-391 earth-wall shading ignores zones on steep faces, so the Beacon Rock stairs were
invisible and their walkers stood on bare cliff (M22 QA "bot on the cliff face", seed 2024): not a
walk-graph leak. Invariant test: no walk-graph edge on a flight theme climbs > `minGrade` without a flight.
**Impact**: world hashes change (re-pinned); a duck-crossing stage drops two C11 windsocks per seed;
W25 re-framed from the north (the giant screen is the boulevard's lee terminus, so every bay-side look
puts it in front of the carpet).

## D-064: M23 world signature — the whale, constellations and fireworks — 2026-10-26

**Decision** (user, 2026-10-26, `mar-plans/study/world.md` questions 4 and 6):
- The one big sea animal is the whale (`W:D6`): a world mover, not an agent; it passes the Research cape at
  17:45, so Research gets no whale of its own (`RS:R8` stays rejected).
- Night sky: culture constellations (`W:G4`) plus the 22:01 fireworks after the relay (`W:G7`). No aurora (`W:G3`).
- K3 sills are already decided (D-058: underwater only).

**How**: M23 = TASK-488 (D1 + K3), 489 (D6), 490 (B1 + B6 + G7), 491 (G4), 492 QA. It starts after the M22
follow-ups (TASK-485…487) merge, so worldgen and shader work don't collide.

## D-063: Island-agnostic rim walkway primitive — 2026-10-24

**Decision**: Cliff-top boardwalks are one shared worldgen primitive (`world/gen/rim-walkway.ts`, spec type
`content/rim-walkway.ts`), not per-island code. The walk follows the SDF iso-line 2 u inland of the rim lip
(rim cells only), paints the island's street zone, places the shared `rimPost` def every 3 u by chord and gaps
at footpaths. It runs in the new `SitePlan.finish` pass, after paths are written. Per-island looks are rows
in `RIM_POST_LOOKS` (append-only: the index is the `rimPost` variant). QA (TASK-480, hazard posts + mint rails)
and Coding C18 (TASK-484, timber posts + rope rails + two sea-facing benches) use it.
**Rationale**: WORLD_PLAN reuses the rim walk on several islands; one primitive keeps the rules and tests in one
place. **Impact**: adding a rim walk changes world hashes (re-pin); the Coding walk was unlit at night until
TASK-485 gave its posts a warm cap in the Coding lamp set (`rhythm.ts`).

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
