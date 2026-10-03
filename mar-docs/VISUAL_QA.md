# Visual QA — Screenshot Acceptance Criteria

> Built from ART_BIBLE §11 and ARCHITECTURE §9. Automated after milestone feature completion.

## How to look (5-step procedure)

1. **Thumbnail test.** Imagine at 25 % size. Count islands, identify them, find focal point. Read as islands-in-sea in <1 s?
2. **Rings test.** Every coast: deep → turquoise ring → foam → sand → green (bible P3)?
3. **Light test.** Warm lit faces, blue-violet shade, no pure black, islands brighter than water?
4. **Density test.** Clusters + clearings, size variety, nothing floating or buried?
5. **Edge test.** Zoom 100 %: seams, acne, z-fighting, thin-geometry flicker?

## Wow shots (W1–W10, 1920×1080, bible §11)

| ID | Title | How | Criteria |
|----|-------|-----|----------|
| **W1** | Postcard | eyes + mask | ≥5 islands fully in frame; every island continuous turquoise ring (±10% `#4FD1D9`); ≥3 height classes; ≥2 cloud shadows; no overlapping labels |
| **W2** | Golden Harbor | eyes + metrics | ≥3 boats with ripple rings; sunlit roof hue 10–40°; shadow hue 220–280°, L≥25%; tilt-shift blur in top/bottom bands |
| **W3** | Lantern Night | eyes + mask | ≥8 bloomed warm emissives visible; ≥10 fireflies; mean land L≥0.12; moon glitter streak on water |
| **W4** | Beacon | eyes + mask | Beam cone visible in fog; cliff vs sky ΔL≥0.1; ≥2 sea stacks; foam at cliff base |
| **W5** | Steam & Spring | eyes + mask | Steam column ≥15 u continuous; black sand contrasts turquoise ring; crater glow visible; no land pixel L<12% |
| **W6** | Lagoon | eyes + mask | Sunken hull readable through water; lagoon lighter than outer ring; ≥1 turtle visible; ring ≤2 channel breaks |
| **W7** | Mill Morning | metrics + eyes | Blade angle differs ≥0.5 s apart (deltaT); ≥4 field colours; mist band below 6 u; ≥5 sheep visible |
| **W8** | Macro Shore | metrics + eyes | Foam line motion ≥2 s apart (deltaT); crab + ≥3 shells + grass tufts; 60→18 u dolly-in: all blooms-in, hardPops=0 |
| **W9** | Lonely Palm | eyes | Whole sandbar + ring in frame; palm silhouetted vs sky gradient; sun glint bloom on water; horizon blends to fog (no hard line) |
| **W10** | Rainy Grove | eyes + mask | Ripples on water visible; treehouse windows lit; foliage saturation ≥40%; sky not neutral grey |

**Global fail (any shot):** land pixel L<12% | foam z-fighting | island without visible shallow ring | two creatures in perfect sync phase

## Dev shots (D-*, 960×540 or custom resolution)

| ID | Title | Res | What for | 2–4 key criteria |
|----|----|-----|-----------|-----------|
| D-overview | Overview 1001 | 960×540 | Thumbnail + rings + light + density | islands distinct; rings continuous; ≥2 cloud shadows |
| D-overview2 | Overview 42 | 960×540 | Thumbnail + determinism | same as D-overview (different seed) |
| D-island | Island (Hearthholm) | 960×540 | Shore foam + shallow + cliffs + detail | foam moves; turquoise ring 3–12 u; no acne seams |
| D-village | Village T2 | 960×540 | Buildings + HUD fit + lanterns + NPCs | roofs readable hue; lanterns visible; HUD not overlapped |
| D-dock | Dock T2 | 960×540 | Boats + docks + ripples | ≥1 boat with ripple ring; dock on deep water; no floating |
| D-shore | Shore T3 + motion | 960×540 | Foam + crabs + shells (deltaT=2 s) | foam line moves; crabs animate; shells not floating |
| D-macro | Macro T3 | 960×540 | Ground cover + grass + flowers + detail | grass visible; no hard pops; tufts cluster realistically |
| D-golden | Golden Hour T2 | 960×540 | Warm light + shadows + warm fog | sunset hue 30–60°; shadow tint blue; fog `#F6DDB0` tone |
| D-night | Night T2 | 960×540 | Night luminance + emissive bloom + stars | land L≥0.12; ≥8 window glows; stars visible overhead |
| D-rain | Rain T1 | 960×540 | Ripples + weather state + no grey sky | rain ripples visible; sky not neutral; foliage still green |
| D-fog | Fog T0 | 960×540 | Mist band + saturation loss + far islands | mist y 0–6 u; saturation −15% OK; distant islands still readable |
| D-mobile | Mobile HUD | 390×844 | Bottom dock wrap + button fit + text readability | dock buttons fit in 390 w; no text overflow; 72 px shutter readable |

## Capture harness

**Command:** `pnpm shots [ci|dev|wow] [--assert] [--gpu]`

**Sets:**
- `ci` — 4 shots, 640×360, low quality; PR checks
- `dev` — 12 shots, 960×540 (or custom), low quality; milestone review
- `wow` — W1–W10 at 1920×1080, medium quality; slow under SwiftShader

**Outputs** in `shots/<set>/`:
- `manifest.json` — timings, `renderer.info`, counters (hardPops, calls, tris, programs), hash
- `contact.jpg` — labelled sheet of all shots
- Per-shot: `<id>.png`, optional `<id>_mask.png` (semantic), optional `<id>_plus_dt.png` (motion)

**Ready sequence:** fonts → gen → build → `compileAsync` → warm-up steps → 3 frames → `window.__marisland.ready = true`

## Milestone exit checklist

1. Run `pnpm shots dev` (not `wow` until M10)
2. Read `contact.jpg` as one image first
3. Score each shot: PASS/FAIL + 1-line observation vs criteria
4. Compare 3+ visible differences vs previous `M<n-1>.jpg`
5. If all pass: commit `mar-docs/shots/M<n>.jpg` (copy contact sheet)
6. User sign-off on real GPU at M2, M5, M8

## Report format

```
Shot       Verdict  Observation
W1         PASS     6 islands, rings continuous, 2 cloud shadows
D-village  FAIL     shadows under eaves L≈8% → shader: shadow tint too low
…

vs previous:  1) clouds more detailed  2) rock clustering tighter  3) bloom falloff smoother
Budgets:      calls 143/220, tris 612k/800k, programs 11/16, hardPops 0
Needs GPU:    bloom halo size under MSAA, faint star shimmer
Top issues:   …
```

**Determinism check:** same shot captured twice → byte-identical PNG. Two captures with `deltaT` must differ only in foliage/water/creatures, not terrain/buildings.
