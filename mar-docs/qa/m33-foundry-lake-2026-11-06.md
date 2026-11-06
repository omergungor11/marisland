# M33 Foundry + Data Lake QA (TASK-546), 2026-11-06

Base: main `3a28286`. SwiftShader, medium 960x540 / 1280x720 / 1920x1080 as per preset, seed 1001, deterministic true, selftests 0 failed.
Motion stills were captured by a throwaway script (URL `simt=` per frame, `freeze=1`), not by the harness; load average was 25-108 during the run.

**Verdict: passes, with follow-ups.** All asserts pass. Motion works in stills: the line, the hop, the courier landing and the lake packets read correctly.
Defects are cosmetic or composition; none blocking. Two things were NOT verified (walker shrink, courier 2 rise at the W-morning-shift framing).

## Numbers

| Run | Result |
|---|---|
| `wow --assert` medium, 55 shots | 55 / 55 ok, 0 failed, deterministic. Calls max 298 (W-carnival-noon), tris max 789,857 (W5), memory max 175 MB (W27) against 180. Programs 17. |
| W-morning-shift | 222 calls / 613,567 tris / 164 MB / 60 agents |
| W-data-lake-night | 179 / 573,497 / 167 MB / 60 agents |
| W7 / W16 / W27 / W4 | 280 / 735k / 165; 277 / 778k / 170; 142 / 444k / 175; 146 / 412k / 174 |
| `ladder --assert` low, L-coding + L-pairs-coding | ok. Peak calls 107 (limit 170), tris 285,721 (366k), memory 79 MB at rungs 240 and 170 (limit 80). 1 MB headroom. |
| `ladder --assert --quality=medium`, same two | ok. Peak 196 calls, 572,753 tris, 98-99 MB. |
| Ladder consistency, low | worst blob 0.3 % (170 to 120), worst mean 1.90 (30 to 21), min IoU 0.921. Pairs: blob max 0.2 %, min IoU 0.964. |
| Ladder consistency, medium | worst blob 0.2 %, worst mean 2.23, min IoU 0.953. Pairs: blob 0.1 %. |
| Dev shots (medium 1280x720, not asserted) | line 239 / 687k; **arm 372 / 839k**; hop 204 / 575k; port-park 226 / 602k; track 119 / 408k; lake-day 196 / 564k; **lake-pavilion 373 / 880k**. Memory 111-113 MB each. |

D-foundry-arm 372 calls (was ~371) and D-lake-pavilion 373 (was ~375) are both about 72 over the 300 line; tris 839k and 880k are over 800k too.
Dev shots have no assert. D-lake-pavilion: its frame holds lit islands behind the gazebo (inferred from the image: festival lights, harbour, searchlight).
D-foundry-arm: the frame includes plateau buildings, sea and a second island (inferred). Neither is a wow shot; the wow frames stay under 300.

## Shots

| Shot | Verdict | Observation |
|---|---|---|
| W-morning-shift | PASS with notes | Line with three arms and stations, queue of 6-7 bots walking up the path toward the hub, track props left, port and hangar upper right, tilt-shift on. FAIL: the hero (courier rising) is a speck near the hangar mast (about 1440,255 of 1920), unreadable at this size; light reads neutral noon-like for 07:00 (no long shadows, no haze). |
| W-data-lake-night | PASS with notes | Navy lake, six cyan fibre lines, white packet dots (8 visible), three pods with LED strips and steam, pavilion with core. Land mean L 0.237. FAIL (minor): top 40 % of the frame is empty navy sea; cloud on the left is cut by the frame edge with the tether line showing; far bots on the belt are grey-white boxes (known, D-124 open). |
| D-foundry-line | PASS | Belt, 3 arms, crates, bots at stations, bots standing around. Several walkers look slightly airborne above the lawn (probably mid-step hop, not a floating bug). |
| D-foundry-arm | PASS (calls over 300) | Arm, plinth, crate, bot at station; clear read. 372 calls. |
| D-foundry-hop | PASS | Bot at the ramp end, the line behind, bridge and ramp props at left. |
| D-port-park | PASS with note | H pad, hangar, perches. Pad empty at simt 18 (drones on mast cradles, tiny); no drone readable at this distance. |
| D-track | PASS with notes | Cones, steps, bridge, ramp, bots on lap. Large cream sand wedge fills the bottom-left 35 % of the frame (terrain, not a prop). |
| D-lake-day | PASS | Lake with kerb, fibre lines readable by day, three pods with steam puffs, solar rows behind. Clean. |
| D-lake-pavilion | PASS (calls over 300) | Night, gazebo and string lights. The core is a flat opaque pale-blue disc (about 640,410 of 1280) with no halo; gazebo walls are uniformly pale lavender, brighter than the lit lamps next to it. 373 calls. |

## Motion (seed 1001, medium; `time=10` unless noted)

- **Line cycle (D-foundry-arm cam, simt 0.5 / 1.2 / 2.0 / 2.4 / 3.2 / 4.2):** pick at crate, head lifted over the belt at 1.2 (bare body below), head seated at 2.0, arm still down at 2.4 (release), arm swung back at 3.2, riser down at 4.2. Plausible, no part through the bot.
- **Hop (D-foundry-hop cam, simt 1.7 / 2.0 / 2.2 / 2.4 / 2.6 / 3.0):** crouch on the ramp end at 1.7, airborne past the ramp's end at 2.0, landed at 2.2, squash with wide feet at 2.4, turning at 2.6, walking away at 3.0. Pass. The hop over the track's ramp block was not isolated; the track still at simt 28 shows a bot high on the ramp, probably the hop.
- **Courier landing (dronePort cam, simt 66 / 69.4 / 70.5 / 71.5 / 72.5 / 74):** empty pad at 69.4, drone well above at 70.5 with cyan payload, low at 71.5, down on the H at 72.5, parked at 74. Straight descent, no sideways drift. Pass.
- **Courier 2 rise (foundryYard cam 23,13,17 at `time=7`, simt 48-56):** NOT judged. At this distance the drone is a few pixels; frames show no readable rise. Needs a closer cam on that cradle.
- **Walker shrink at the route end:** NOT seen. Two wide cams (foundry side, then overhead) did not cover the route end; walkers read in the queue but I could not find where they vanish. Do not treat as passing.
- **Track (simt 20 to 60):** bots move along the course between frames; the return lane and cheer hop are not separable at this framing. One bot passes about 1 u from the lens at simt 28 and 44 (cropped giant white box at the right edge): lens clipping.
- **Data Lake night (simt 8 / 10 / 12 / 14):** packet dots shift along lines between every frame, lines steady; steam and LEDs steady. Pass.
- **Low (quality=low):** arm cam shows the bots as plain boxes without faces, flat shading; arm swings and releases at the same phases (1.2 lift, 2.4 seated, 4.2 down). Track at low: the steps station becomes a single teal slab (no steps), bots are tall white-on-blue boxes. Readable, but weaker than medium.

## Defects, by what a viewer notices

1. Courier is unreadable in the hero shot W-morning-shift (a speck at the hangar). Cam is on the line; the port is far. Owner: engine (camera preset in `src/content/shots.ts`), or life (a larger drone).
2. Quantum pavilion core is a flat opaque disc with no bloom halo, walls overlit lavender, D-lake-pavilion and W-data-lake-night. Probably the `pavilionGlowScene` core opacity plus the night hemisphere on pale walls (`src/render/culture-movers.ts`, glow block in `src/content/themes/coding-foundry-motion.ts`). Owner: shader.
3. D-foundry-arm 372 and D-lake-pavilion 373 calls (limit 300, dev set, not asserted). Owner: engine (budget scope or re-aim); not wow shots.
4. D-track lens: a walker passes about 1 u from the camera, and a bare sand wedge fills the lower left. Cam preset in `src/content/shots.ts` (`FOUNDRY_SHOTS`); the sand is terrain (worldgen).
5. W-data-lake-night composition: empty top 40 %, cloud cut by the left edge. Cam preset in `src/content/shots.ts`. Owner: engine.
6. Low: the steps station collapses into one slab and bots lose faces (LOD1 sharing, D-124 item 9). `src/geo/themes/coding-m33.ts`. Owner: props.
7. W-morning-shift lighting does not read as morning at 07:00 (flat). Owner: shader (probably sun elevation or haze at that hour; not measured).
8. Open from D-124, still true: far bots read as white boxes at night; the line runs at night (not tied to the clock).

## Proposed ART_BIBLE section 11 rows

| ID | Shot | Seed, camera, time | Pass criteria |
|---|---|---|---|
| W-morning-shift | **Morning Shift** | 1001 · `site:foundryYard:23,13,17,-1.5,1,1` · 07:00, simt 52 | Belt with 3 arms and bots at stations; queue of at least 5 bots walking the path to the hub; track props left; port and hangar in frame; courier visible at 12 px or more (not a speck); morning light with long shadows; at most 230 calls (now 222) |
| W-data-lake-night | **Data Lake Night** | 1001 · `site:dataLake:22,13,-11,-1,3,-2.5` · 21:30, simt 8 | Navy lake with 6 fibre lines and at least 6 packet dots; 3 pods with LED strips; pavilion core with a visible halo; cloud whole (not cut); land L at least 0.12; at most 200 calls (now 179) |
| D-foundry-line/arm/hop, D-port-park, D-track, D-lake-day, D-lake-pavilion | dev set | per `FOUNDRY_SHOTS` | At most 300 calls each; no bot within 2 u of the lens; track frame without a bare sand wedge over 15 % |
| Motion rule | line | seed 1001, simt 2.4 | Arm releases at 2.4, hop 1.9-2.5 lands on the ground, courier lands on the H with no sideways drift at 69.4-72 |

Global addition: low Coding rungs 240 and 170 must stay at 79 MB or below (80 limit).

## Needs real-GPU check

Bloom halo on packets and the pavilion core, tilt-shift at the edges, the lake's night spill on the quay.

## Not done

Walker shrink, courier 2 rise, track return lane and cheer hop as separate frames, high-quality tier. Wow set was run once, no A/B against the previous contact sheet.
