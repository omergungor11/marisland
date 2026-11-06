# M31 Marketing + Design QA (TASK-538), 2026-11-06

Base: main 3a28286 (TASK-536 Carnival Pier D-126, TASK-537 Colour Wharf D-127, budgets D-128). SwiftShader, deterministic: true,
selftests 0 failed. Shots read from shots/{wow,dev,ladder}-q538/ (own tag and port; not committed).

**Verdict: passes, with follow-ups.** Every budget assert passes (wow 55 / 55, four ladders at low and medium). The ferry ritual works on
both islands in time-stepped stills. Nothing blocks the merge. The weak spots are the headroom (memory 175 / 180 medium, 79 / 80 low;
W-carnival-noon 298 / 300 calls), three visible art defects (arch pole across WELCOME, a blank white flash, the ferry out of frame in the
Colour Wharf call shots) and the dev-set call counts at Colour Wharf.

## Numbers

| Run | Result | Limit |
|---|---|---|
| wow --assert medium, 55 shots | 55 / 55 ok, 0 failures, programs 17, hardPops 0 | |
| Peak calls | W-carnival-noon **298** (W-marina-dusk 285) | 300 |
| Peak tris | W-funicular-dawn 783,454 | 800k |
| Peak memory | W27 **175**, W4 174, W16 170 | 180 |
| W-carnival-noon / -dusk / -arrival | 298 / 722,220 / 163 MB; 281 / 645,116 / 163; 251 / 609,354 / 163 | 300 / 800k / 180 |
| W-colour-wharf-day / -dusk / -arrival | 166 / 601,952 / 166 MB; 238 / 721,969 / 164; 229 / 769,502 / 164 | 300 / 800k / 180 |
| ladder --assert low (L-marketing, L-pairs-marketing, L-design, L-pairs-design) | ok. Calls / tris 67 / 187,803; 62 / 162,025; 63 / 184,489; 55 / 161,933. Memory 73-79 MB, peak **79** at 170 u (240 u 78, 340 u 77) on both ladders | 170 / 366k / **80** |
| ladder --assert --quality=medium, same four | ok. 144 / 305,740; 142 / 263,416; 135 / 301,726; 145 / 279,108. Memory 91-99 MB | 300 / 800k / 180 |

Ladder consistency (limits blob 1.5 %, mean dE 5): low worst blob 1.7 % at L-marketing 60 -> 42 (the stepBlobAt override is 2 %, passes),
min IoU 0.774 at L-marketing 42 -> 30, max mean 2.86. Medium worst blob 0.6 % (same step), max mean 3.35, min IoU 0.778 at the same step.
Design is clean: worst blob 0.5 %, min IoU 0.931 (low) / 0.928 (medium).

Dev set (960x540 medium, 25 shots, not asserted): carnival 225-298 calls, 583k-697k tris, 110-111 MB. Wharf: D-wharf-harbour 113,
-pot 106, -call-* 226-229 (~768k), -boat-* 138-239, but **D-wharf-row 328 / 848k, D-wharf-row-dusk 402 / 993k, D-wharf-pavilion 311 / 791k**
are over 300 calls (row-dusk also over 800k tris).

Margins: low has 1 MB left on the 170-240 u rungs, medium 5 MB at W27, W-carnival-noon 2 calls.

## Wow shots against §11

Criteria used (ART_BIBLE §11 spirit plus the project pattern): focal point readable at 25 % size, shore rings, light test (warm lit faces,
blue-violet shade, nothing black), kit reads as designed, ritual visible, nothing floating or clipped, budget.

| Shot | Result | Observation |
|---|---|---|
| W-carnival-noon | PASS (weak) | Wheel, WELCOME board, lanterns, cannons and the lighthouse read; turquoise, foam and sand rings right. Composition is left-heavy: the right 55 % is sea and plain sky. Bulbs tiny by day. 298 / 300 calls. |
| W-carnival-dusk | PASS | Best of the set: warm bulbs, lit board, searchlights, lit lighthouse, rose sky. Sub-criterion FAIL: a white arch pole cuts "L/C" of WELCOME (board at about 380-640 x 540-700 of 1920x1080). Yellow beam wash over the hill (480-780, 400-540). |
| W-carnival-arrival | PASS (weak) | Ferry stopped with ripple rings, about 35 confetti quads over the bay. FAIL: wheel rim hides the left end of WELCOME (600-680, 540-660); cream pontoon block clips the bottom-left corner (0-230, 840-1000). |
| W-colour-wharf-day | PASS | Pavilion with colour panes, three pastel houses on piles, paint pots down the breakwater, moored lantern boat, bridge. Reads at thumbnail size. Boat is a plain box hull. |
| W-colour-wharf-dusk | PASS (weak) | Lantern boat leaving with a dotted wake, lit pavilion, house colour on the water. FAIL: beam yellow wash drawn over hill and bridge (1050-1400, 330-430); the three paint streaks read as soft blobs (1400-1750, 610-690). |
| W-colour-wharf-arrival | FAIL | The ferry, the subject of the ritual, is cropped in the bottom-left corner (0-340, 860-1080). Prism hue walk on the pavilion and rings on the pots are visible, pots read well. The moored boat reads as an unadorned box from above. |

Differences visible against the previous contact sheet: a boardwalk on piles with wheel, billboard and cannons; a pastel row, pots and glass
pavilion; the lantern boat; the purple second harbour livery; confetti and flash on arrival.

## Motion (seed 1001, medium, 960x540, time-stepped stills)

Carnival (time=13, D-carnival-in/0..5, plus extra frames at sim 30 / 41 / 45 / 49 / 54 / 58):
- Ferry: approaching at 36, stopped with ripple rings at 40.2, still moored at 46.5, leaving at 49-52, wake at 54. Matches sim ~40 s, dwell 8. Pass.
- Confetti: burst over the bay at 40.2 (about 35 quads), drifting right at 40.85, thin at 43, gone by 46.5. Pass. Quads are flat, opaque, darker at dusk, as D-126 says.
- Flash: the screen is a full white rectangle at 40.2, 40.85 and 41, text partly back at 43, a damaged "WFLCOME" at 45, full at 46.5. Reads as a blank panel rather than a rhythm (defect 4).
- A bot appears on the T-head beside the cannon at 54-58 (boarding slot). Pass.
- Wheel boost: **not judged by eye.** Cabins sit in different places across stills, but the stills are 4-6 s apart. carnival-wheel.test.ts covers monotony and +1 turn in 18 s.
- Marquee chase: **not judged**; bulbs are tiny by day and a still cannot show the chase direction. Needs frames 0.2 s apart.

Colour Wharf (time=18.5 / 19):
- Ferry call 124.55: ferry in the corner of the frame at 122-131, gone at 141 (frame is cropped, defect 3).
- Pavilion prism: panels change hue between 126 and 131 (pale yellow / light blue at 126, saturated at 131). Pots: pink rings round the buoys at 126-131, none at 122 and 141. Pass.
- Lantern boat leaves at 150: moored at 148 and 150, moving away and turning at 153-156, dotted wake at 156-160. Pass.
- Return (extra frames on the top-down harbour cam; boat cycle 528.9 s, from a throwaway test probe): enters from the sea at 514, bow up at 518, turning in place at 522-524 about 40 px above its mooring, bow to the sea and on the mooring by 528. At 529.5, 540 and 150 the hull sits at the same pixel (within 3 px), so no snap at the cycle wrap. U-turn and brake: pass at 4 s resolution; the deceleration curve needs a finer step.
- Seen and unidentified: a pink torpedo with a red nose beside the boat at 514-518 (probably a dolphin), a five-dot dark cluster near the boat at 490, 500 and 540 (probably a fish school).

## Defects, by what a viewer notices

1. **White arch pole across WELCOME** (W-carnival-dusk, D-carnival-deck, D-carnival-dusk): bunting v5 arch pole stands in front of the screen. Suspect src/world/gen/plans/marketing-harbour.ts (arch slots / screen yaw). Owner: worldgen.
2. **Wheel rim covers the left of the billboard** at the arrival frame (W-carnival-arrival): CARNIVAL_CAMS.arrival in src/content/shots.ts, or wheel placement in the plan. Owner: engine (cam) / worldgen.
3. **Ferry out of frame at Colour Wharf arrival** (W-colour-wharf-arrival, D-wharf-call-0..4): WHARF_CAMS.arrival in src/content/shots.ts. Owner: engine.
4. **Flash blanks the board to pure white** for about 2 s, then a damaged "WFLCOME" for about 1 s (D-carnival-0 / 1 / 3 / 4): welcomeFlashScene, PART.panel in src/render/culture-movers.ts (flash curve, blend over the glyph). Owner: shader / life.
5. **Beam yellow wash on hill and bridge** (W-carnival-dusk, W-colour-wharf-dusk): additive cone over land, already TASK-549 (harbour-beam mesh in src/render/). Owner: shader.
6. **Paint streaks are soft blobs** (W-colour-wharf-dusk, D-wharf-row-dusk): boathouseStreakScene. Owner: shader.
7. **Dev call counts above 300** at D-wharf-row 328, -row-dusk 402 (993k tris), -pavilion 311, not asserted, no baseline. Cost drivers probably lamps, pots, streak scenes and low-sun shadow draws (inferred). Owner: engine.
8. **Headroom**: W-carnival-noon 298 / 300 calls; W27 175 / 180 MB; low 79 / 80 at 170 u. Any harbour or culture change trips one of them. Owner: engine.
9. Cream pontoon block clips the frame corner in every carnival cam (W-carnival-arrival, D-carnival-*): carnivalKeepOut / pontoon placement in plans/marketing-harbour.ts. Owner: worldgen.
10. Lantern boat hull is a plain box; confetti flat and dark at dusk (quads not emissive). Known in D-126 / D-127. Owner: props / life.
11. W-carnival-noon composition: right half empty, bulbs small by day: CARNIVAL_CAMS.front. Owner: engine.

Dismissed: dark interior of the pavilion's open bays (reads as a bench), the second wheel behind (the fair's wheel on the Rock).

## Proposed §11 rows

| ID | Shot | Seed · camera · time | Pass criteria |
|---|---|---|---|
| W-carnival-noon | **Carnival Pier Noon** | 1001 · site:carnivalDeck:-15,3.5,20,13,3.5,0 · 12:00 +8 s | Boardwalk on piles with the wheel, the red WELCOME board fully readable (no pole across it), two confetti cannons on the T-head, lantern posts, lighthouse behind; turquoise ring and foam; ≤ 300 calls |
| W-carnival-dusk | **Carnival Pier Dusk** | 1001 · same cam · 19:45 +8 s | ≥ 20 bloomed bulbs on wheel and arches, board lit, searchlights in the sky, lit lighthouse; no yellow wash over land |
| W-carnival-arrival | **Carnival Pier Arrival** | 1001 · site:carnivalDeck:-20,3,14,10,3.5,0 · 13:00 +41.35 s | Ferry stopped at the pier head with ripple rings; ≥ 20 confetti quads in the air; board readable and not hidden by the wheel; pontoon out of frame |
| W-colour-wharf-day | **Colour Wharf Day** | 1001 · site:harbourPier1@design:38,19,12,13,0.5,-13 · 11:00 +6 s | Three pastel houses on piles, ≥ 5 paint pots down the breakwater, glass pavilion on the pier, lantern boat moored, bridge; sand, green, rock and foam rings |
| W-colour-wharf-dusk | **Colour Wharf Dusk** | 1001 · site:harbourPier1@design:38,17,17,11,0.5,-12 · 19:00 +159 s | Pavilion lit, lighthouse beam without a wash over the hill, ≥ 3 paint streaks on the water, lantern boat leaving with a wake |
| W-colour-wharf-arrival | **Colour Wharf Arrival** | 1001 · site:harbourPier1@design:9,15,21,10,0.5,-9 · 18:30 +128 s | Ferry **inside** the frame at its pier; pavilion panes in different hues; ≥ 3 paint pots with glow rings; ≤ 300 calls |

## Not done

- Wheel boost and marquee chase were not judged (frame step too wide).
- pnpm test was not run (not asked; the box was loaded by the shot runs).
- No GPU run: bloom on the lit pavilion and the searchlights is unverified on a real GPU.
- Low contact strips were not opened frame by frame; low is judged from the asserts only.
