# Phase 5 wave 5 QA re-audit — 2026-11-17

Auditor: `qa` agent (read-only, only this file written). Build: `main` @ 43b4b13 (contains 90f4973; TASK-682…694, 635, 650 merged).
SwiftShader, every run `deterministic: true`, port 4187, tags `qa5dev` / `qa5coast` / `qa5ground` / `qa5wow` / `qa5high`.
Runs: `dev --assert --only='F-bot*'` 14/14 ok, selftests regen / ctxloss / edit / editpick all ok (0 failed); `dev --only='D-coast-*'` 7 frames;
`ground --assert` 24/24; `wow --assert` 61/61 (930 s); `wow-high --assert` 61/61 (1304 s). Frames judged by eye (Read, crops at 2–5x).

## Verdicts

| Task | Verdict | Why (observed) |
|---|---|---|
| TASK-593 (bots) | **PASS** | Line-up now on the open paved lawn E of the Coding pool: no tent / post / drone on any bot (`F-bots`: 15 bots, turbine pole only at the frame edge). Scout vs hauler: in `F-bot-looks` the hauler is clearly broader, short-legged, with dark track blocks standing proud of the body; scout is tall with thin legs. `F-bot-pair`: portrait hauler (wheels + duck badge) matches the 3D hauler's track blocks and duck; the scout / spire portraits match their bodies. `F-bot-eyes`: idle pills, working squares, "?", X X, zigzag all readable. `F-bot-hud`: agents 17 (budget 25), 0 failures. `--assert` incl. selftests green (leak gone, D-192). Minor: in `F-bot-pair` the 3D hauler is half hidden behind the rock cairn and its portrait chip. `F-bot-hud` card text truncates ("5 l devam"). |
| TASK-597 (water) | **PASS** | At island scale (`W23` QA, crop of the shelf ring) the caustic net is now thin, low-contrast, uneven in width and brightness, and fades toward deep water; no pale even-width polygon mesh. `W-horseshoe-day` bay: soft cells only. Programs 17 / 20. Residual: at 2x crop the cell edges still form a visible net on the ring (no longer dominant). |
| TASK-602 (world) | **CONDITIONAL** | Coding: groves now read at T1 (`G-coding-t1-noon` NW forest + scatter; was 0 trees) PASS. QA: `W6` shows ~8 mint palms across the plateau PASS. Design: `W10` shows pines + blossom + the big tree, but I see no palm in this frame (D-191 says 5 on the low shore; shore not in frame) → not confirmed by eye. Research: `G-research-t1-noon` still sparse (D-191 Open: cypress 4); meadows still do not read at T1. Not judged: DevOps close-up, hedges / garden plots, boat gallery. |
| TASK-605 (coast) | **CONDITIONAL** | PASS: arches recoloured to their island strata (`D-coast-arch-marketing` maroon / orange, `-devops` slate-grey on grey-purple strata, no foreign slate-blue); openings show sea, not cliff wall, in all four cams. New Design arch (`D-coast-arch-design`): green-capped arch in front of the fall's plunge pool, reads well. Mesh steps: `G-coding-t1-noon` right wall + fall at 5x is smooth, no staircase (D-198). Wall-foot hatch and orange / beige wedges: none seen in `D-coast-arch-*`, `W23`, `G-coding-t1`. Waterfall foot: Coding ~4 stones, Design ~4, HQ foot stones at frame corners. FAIL remnants: (a) `D-coast-fall-hq` a stone + shrub sit on the waterfall ribbon mid-height (~520,160 of 1280x720); (b) a ledge shrub puffball / a boulder sit mid-wall at Coding (`G-coding-t1-noon` crop, ~355,400 / ~600,370 in the 5x crop) — D-184 says ledge shrubs only just under the wall top; (c) `D-coast-tide-hq` steep dune now reads as a smeared, texture-less sand slab (D-193 Open). Kelp under the HQ arch overlaps its opening (cosmetic). Pale blurry translucent discs on the wall in `D-coast-fall-hq` (probably fall mist) look like stains. |
| TASK-609 (high) | **PASS** | `wow-high --assert` 61 / 61. AO stipple: `W16` high crop of beach / grass is clean (dune grass fades as pale ghost clumps, no black dots). God rays: `W-sky-dusk` high now shows a readable fan from the sun disc through the cloud gap and down to the sea, plus a glitter column; edges crisp as D-189 predicted. Cloud edges: `W4` (medium and high) cumulus bellies are round, no ruler-straight edges. High memory: peak 378 MB (ember-lane-night), `W-fairy-night` 378 / 480, was 480. Caveat: an unexplained yellow-green oval patch on the sea under the sun column (`W-sky-dusk`, ~1000,940 of 1920x1080), muhtemelen the lighthouse beam pool or a glitter sprite; not verified. Real-GPU not run. |

## Budgets

| Set | calls | tris | programs | gpuMemoryMB | agents | particles | hardPops |
|---|---|---|---|---|---|---|---|
| wow medium (930 s) | W16 325 / 350 | W15c 928k / 950k (97.7 %) | 17 / 20 | W3 189 / 200 | W8 54 / 60 | W10 2,812 / 6,000 | 0 |
| wow-high (1304 s) | W16 331 / 350 | W15c 1.160M / 1.6M | 29 / 30 (ember-lane-night) | 378 / 480 (ember-lane-night; fairy-night 378) | W8 99 / 110 | W10 4,666 / 12,000 | 0 |
| dev F-bot* | 84–303 | 777k max | 9–18 | F-bot-hud 76 | F-bot-hud 17 / 25 | — | 0 |
| ground (24 frames) | all within | all within | 17 | — | — | — | 0 |

- High W-fairy-night detail: post 245.9, props 57.7, shadow 32, canvas 15.8, terrain 10.6, textures 6.6, movers 6.6 = 378 MB (wave 4: 480.2).
- Medium tris at W15c is the tightest budget (22 k of headroom).
- Low ladder not re-run in this audit (not requested).

## Observations

- Bots cast a soft contact shadow now in `F-bot-eyes`; in `F-bots` shadows are faint but present.
- `W-sky-dusk`: ray fan edges are straight-sided wedges that extend below the horizon over the sea; reads as a stylised beam, fine for the look.
- `D-coast-arch-hq`: strata cliff wall texture is a strong cellular crackle, visually busier than the arch geometry (existing look, not new).
- `D-coast-arch-devops`: dark basalt column clumps on the cliff top read as rock stacks rather than shrubs; acceptable.
- Not run: real-GPU (`--gpu`) AO / god-ray check, boat and coast galleries, low ladder, `F-puffins` / courier frames.

## Follow-ups (proposed)

1. **TASK-695 Waterfall ribbon and mid-wall props** (owner: worldgen). Ledge shrubs and foot stones must not sit on the fall ribbon or mid-wall. Acceptance: on seed 1001 no `ledgeShrub` / fall stone within 1.2 u of a fall ribbon centreline, no ledge shrub below wall top − 2.2 u; unit test in `coast.test`; `D-coast-fall-hq` and `G-coding-t1-noon` show none on the wall / ribbon; world hashes re-pinned.
2. **TASK-696 Design and Research T1 readability** (owner: worldgen). Confirm and fix Design palms (5 on the low shore) and Research cypress (4) at T1. Acceptance: a new wide cam per island (`G-design-t1`, `G-research-t1` already exists) where palms / cypress are countable (>= 6 Research trees visible); counts in `biome-readability.test.ts` raised; `wow --assert` green.
3. **TASK-697 Steep-dune sand look** (owner: shader). Steep sand in `D-coast-tide-hq` is a smeared slab after D-193. Acceptance: loosen `GROUND_DETAIL.flat` or add a slope-safe ripple so the dune shows fine detail, with no hatch stripes returning at wall feet (`D-coast-arch-*`); wow / wow-high 61 / 61.
4. **TASK-698 Bot pair framing** (owner: life). `F-bot-pair` cam / chip layout hides the hauler behind the cairn. Acceptance: all three bodies fully visible beside their chips, hauler tracks visible; `F-bot-hud` card text no longer truncated at 960x540.
5. **TASK-699 Sea patch under dusk sun (investigate)** (owner: shader). Identify the yellow-green oval in `W-sky-dusk` high. Acceptance: named source; removed or made intentional; frame diff shown.
6. **TASK-700 Medium tri headroom** (owner: engine). W15c is at 97.7 % of 950k. Acceptance: >= 60k tris headroom at W15c via LOD / cull on the worst class, or an explicit budget decision in DECISIONS.md.
