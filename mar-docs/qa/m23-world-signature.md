# M23 QA — 2026-10-26 (TASK-492)

Branch base: main `f89bad5` (TASK-485…491 merged). SwiftShader (ANGLE Vulkan / SwiftShader), deterministic:
true on every run, no "already served (not ours)" in any log (ports 4186 wow, 4187 ladder low, 4188 ladder
medium). Read from `shots/wow/manifest.json`, `shots/ladder-low/` and `shots/ladder-med/`.

## Wow set — `pnpm shots wow --assert --port=4186` → 32 / 32 ok

Budgets (medium: 300 calls / 800k tris / 170 MB): max calls 268 (W16), max tris **795,654 (W16, 99.5 % of
800k)**, programs 15–17 / 20, hardPops 0 on every shot.

Top memory: **W27 169 MB**, W4 168 MB, W15c and W8 167 MB (W16 166). Headroom is 1 MB — any new GPU resource
breaks the 170 MB budget.

| Shot | Verdict | Calls / tris / MB | Observation |
|---|---|---|---|
| W1 Postcard | PASS | 142 / 285k / 150 | 7 islands, rings continuous. Reef shoals (TASK-488) read as soft pale-turquoise blobs and sills in the gaps (between the NW and N islands, left of Research, south of HQ); K3 sills look like submerged bridges (right of the centre island). Edges are soft at 1080p, not crenellated |
| W2 Golden Harbor | PASS | 177 / 587k / 165 | Unchanged. Research gate in the top middle still sits on a grey-green patch (open since M20) |
| W3 Lantern Night | PASS | 174 / 685k / 165 | Unchanged |
| W4 Beacon | PASS | 127 / 452k / 168 | Lighthouse beam plus the lit stacks; the skerry beacon masts show bottom left |
| W5 Forge & Steam | PASS (weak) | 214 / 672k / 161 | DevOps switchbacks still read as pale olive bands on the dark cone by day |
| W6–W10, W13, W14 | PASS | 131–223 / 511–667k / 160–167 | No change seen against M22 |
| W11 Concept | PASS | 179 / 318k / 151 | Shoals visible as darker/teal patches mid-sea |
| W15 Relay Night | PASS (weak) | 180 / 331k / 151 | Skerry beacons are tiny red dots, their beams are not visible. Constellations not visible (sky strip only) |
| W16 Harbour Guild Morning | PASS | 268 / **796k** / 166 | Highest in the set, 4k tris below the limit |
| W17–W22 | PASS | 137–234 / 550–774k / 160–165 | No change seen |
| W23 Rim Walk | PASS | 217 / 750k / 159 | |
| W24 Lantern Zigzag | PASS | 194 / 739k / 164 | Lantern pools along the switchbacks; sky not in frame, so no constellation |
| W25 Carpet Night | PASS | 160 / 518k / 162 | Re-framed from the north (D-065): billboard no longer covers the carpet; the lee-side giant screen reads as a blank grey/white panel at the carpet's end |
| W26 Test Firing Noon | PASS | 236 / 712k / 164 | Steam is now soft puffs (M22 issue closed). Lower third is still a blurred dirt slope with flat green blobs |
| W15b Relay Wave | PASS (weak) | 180 / 333k / 151 | The DevOps signal flash is a bright-headed tapered streak from the lamp: reads like a comet, not a beam. Skerry and Marketing beams are faint |
| W15c Harbour Fireworks | PASS (weak) | 220 / 602k / 167 | Two shells only in frame; each is a hollow ring of 4-point star sprites (confetti, not a burst); no trails or glow. Water reflection is a band of star sprites on the shore line, not on open water |
| W15d Skerry Beacon | PASS | 173 / 724k / 164 | Two-lobed beam, tower, rock, ripples all read; the best M23 frame |
| W15e Signal Lamp | PASS (weak) | 240 / 702k / 160 | Lamp ball on the mast with a straight bright ray that ends abruptly at the frame edge; the mast is a pole behind a gazebo. Ray looks like a lightsaber |
| W27 Constellation Night | PASS | 122 / 458k / **169** | The Telescope glyph reads: 7 stars, thin lines, clear on the dark sky. Only one glyph in frame; memory peak of the set |
| W28 Whale Surfacing | FAIL | 143 / 285k / 150 | Overview at 17:45: the whale is a ~25 px pale comma at the bottom right corner (about 1390,1040) with no readable spout. The frame has no focal point for the whale (TASK-494 is reframing) |
| W28b Whale Blow | FAIL (weak) | 176 / 683k / 159 | Whale is a smooth grey faceted capsule with one eye: no flippers, no fluke, no belly/back colour split; the spout is a beige sausage of overlapping puffs that does not connect to the body. Reads as a submarine/blimp (TASK-494 is working on the silhouette) |

## Ladder (seed 1001, 14 presets)

Commands: `pnpm shots ladder --assert --port=4187 --tag=low --quality=low` and
`--port=4188 --tag=med --quality=medium`. Drift is the `fog=0` value (`driftFog` also reported).

| Tier | Result | Notes |
|---|---|---|
| Low | **0 metric misses, 3 presets fail the 350k triangle budget** | max drift 2.43 (Marketing, fogged 3.43), min pair IoU 0.919 (Marketing ladder step) but all within thresholds. Budget misses: L-design 120 u = 358,169; L-pairs-design 131.6 / 127.2 / 112.8 u = 357,141 / 357,813 / 358,169; L-pairs-research 131.6 u = 350,829 |
| Medium | **0 misses** (14 / 14 ok) | max drift 3.14 (Marketing; fogged 4.21), DevOps 2.91 (fogged 3.84), min IoU 0.911 (Marketing ladder). The M22 medium drift misses (Marketing 700/480, DevOps 480) and the L-pairs-marketing IoU miss are gone (TASK-486/487) |

Low tier budget misses are new (M22 had none). They sit at the tier-2 rungs (120–131 u) of Design and Research;
the cause was not isolated (probably culture content or reef geometry added in M23; not verified). Owner: engine
(tier-2 triangle budget) or props.

## Findings

| # | Frame | Problem | Severity | Owner |
|---|---|---|---|---|
| 1 | W28 / W28b | Whale not readable: ~25 px comma at the frame corner in the overview; the close frame shows a capsule with an eye, no flippers/fluke, spout detached | should-fix (TASK-494 open) | life / props |
| 2 | Ladder low | Triangle budget 350k exceeded at tier-2 rungs: L-design 120, L-pairs-design 112.8–131.6, L-pairs-research 131.6 (max 358k) | should-fix | engine |
| 3 | W15c | Fireworks are star-sprite rings (hollow, no trails or glow); two shells only; the "reflection" is a band of sprites at the shore, not on water | should-fix | shader / life |
| 4 | W15b / W15e | Signal ray is a tapered bright-headed streak (comet) or a straight capsule ending abruptly; does not point readably at the next island | should-fix | shader |
| 5 | Memory | Peak 169 MB (W27) against 170 MB; headroom ~1 MB | should-fix | engine |
| 6 | W16 | 796k of 800k tris; no kit can be added in this view | nit (watch) | engine |
| 7 | W15 | Skerry beacon beams and constellations not visible in the postcard (sky strip 0–7°); beacons are tiny red dots. W24/W25 have no sky | nit | shader |
| 8 | W25 | Lee-side giant screen reads as a blank grey panel at the carpet end | nit | props |
| 9 | W26 | Lower third is a blurred dirt slope with flat green blobs (decal-like) | nit | shader |
| 10 | W5 | DevOps switchbacks pale olive bands by day (still open) | nit | worldgen |
| 11 | W2 | Research gate tint reads like grass (still open) | nit | shader |
| 12 | W1 | Shoal edges: soft at 1080p, the "crenellated" note could not be reproduced here (probably a closer view is needed) | nit | worldgen |

Closed since M22: W26 steam (soft puffs), W25 billboard covering the carpet, L-pairs-marketing IoU, medium far
drift Marketing/DevOps.

## Top 3

1. Whale (W28/W28b) is not a wow element yet: tiny in the overview, a capsule in the close frame.
2. Low-tier ladder triangle budget (350k) is exceeded at Design and Research tier-2 rungs (new in M23).
3. Night effects are weaker than the plan promises: fireworks as sprite rings, comet-like signal rays, faint
   beams in the postcard; plus memory at 169 / 170 MB.
