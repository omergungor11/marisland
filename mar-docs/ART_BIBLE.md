# Marisland — Art Bible v1

> Scope: **what it looks like and how it moves**. The architect owns how (systems, LOD, perf). Tables are meant to become config.
> **1 u = 1 m**, sea level y=0, cottage ≈ 3.5 u tall. Springs: `k` stiffness / `c` damping, mass 1. Tiers **T0 Map · T1 Island · T2 Village · T3 Macro** (§6).

## 1. Style pillars

| # | Pillar | Do | Don't |
|---|---|---|---|
| P1 | **Toy-chunky** | Min thickness 0.12 u; bevel boxes 8–15 % of smallest side; roofs/canopies/heads 1.2–1.4× realistic | Wire-thin poles, paper planes, spikes |
| P2 | **Silhouette first** | Landmark identifiable as a black shape at T0; one dominant vertical per island | Two equal-height landmarks on one island |
| P3 | **Islands are rings** | Every coast: deep → turquoise ring → foam → sand → green | Land meeting deep water with no shallow band (only exception: Beacon Rock's windward cliff) |
| P4 | **Warm light, cool shade** | Shadows tinted blue-violet; sunlit faces warm | Black/grey shadows, neutral white light |
| P5 | **Everything breathes** | Everything at the current tier moves, or has a neighbour that moves; phases are per-instance | Frozen frames; instances moving in sync |
| P6 | **Detail blooms** | New detail scale-pops with overshoot or dithers in | Hard pops, ghostly alpha fades |

**Shape language:** capsules, domes, teardrops, rounded boxes. Oversized details: doors 0.9×1.6 u, windows 0.6×0.7 u, chimneys 0.5 u. Trees are top-heavy (canopy ≥ 55 % of height). Max lean 12° (palms 25°).

**Faceting: flat-shaded low-poly with bevels ("faceted toy"), not smooth toon.**
- Smooth-shaded noise terrain reads as mush; facets read as carved, and each facet catches light differently, so islands keep micro-contrast at T0.
- Toon shading needs outlines, which shimmer at distance and cost an extra pass.
- Per-face vertex colour enforces the palette with no textures.
- Cuteness up close comes from segment counts: cylinders 8–12 radial segments, icospheres detail 1–2, terrain facets 1.5–3 u, prop facets ≈ 5–8 % of prop size.
- **Smooth-shaded exceptions:** water, clouds, smoke/steam, eyes (black sphere + 0.3× white highlight), terrain (Catmull-Rom smooth normals with material detail, D-030). Props, buildings, trees and bots stay faceted: the terrain is the only P1 exception.
- Seeded per-face jitter: L ±3 %, hue ±4°.
- Baked vertex AO: −15 to −25 % L at prop bases and terrain creases.
- Contact-shadow blob under every grounded prop: radius 0.6× footprint, opacity 0.25.

## 2. Palette

**Water** (band = distance from shore; the shallow ring is **1.5× wider on the leeward side** of the seeded global wind)

| Band | Distance | Hex |
|---|---|---|
| Deep | > 35 u | `#1E5FA8` |
| Mid | 12–35 u | `#2A8FC9` |
| Shallow ring | 3–12 u | `#4FD1D9` |
| Lagoon | 0–3 u | `#8EEBE0` |
| Foam | 0.4–0.8 u line | `#F4FFFC` |

**Land & props**

| Material | Hex |
|---|---|
| Sand dry / wet / black (Emberpeak) | `#F7E1AE` / `#E3BE84` / `#5B5566` |
| Grass (tips → shade) | `#C9E86F` `#A6DB5E` `#7BC950` `#5FAE45` |
| Flowers | `#FF8FB1` `#FFE45C` `#FFFFFF` `#B39DFF` `#FF7A5C` |
| Rock / warm cliff strata | `#A9AEB8` `#8A909C` `#666C7A` / `#D9B48F` `#C29A74` |
| Earth wall (bluff soil, `GROUND_WALL`; strata tones ×1.2 … ×0.7, grass lip, dark foot, wet line) | `#B9845A` |
| DevOps basalt (rock base; cracks `#958FA0` / `#5A5664`) | `#7A7584` (lifted from `#4F4C57`, D-030 theme) |
| Foliage: deciduous / pine / palm | `#8FD16A` `#5DBB63` `#3E9A52` / `#3C8F68` `#2F7D5B` / `#7FD34E` `#5DB33C` |
| Wood: planks / logs / dark / dock | `#D2A679` / `#A8754F` / `#8A5A3B` / `#B59B7E` |
| Walls | `#FFF4E0` `#FAFAF5` `#FFD9D2` `#FFF0B8` |
| Roofs | `#E8735A` `#E35D6A` `#3FB8AF` `#F5C84C` `#9C8CE0` `#5DA9E9` `#7FD8B3` |
| Emissive: window / lantern / lava / firefly | `#FFC870` / `#FFB347` / `#FF6A3D` / `#E8FF8A` |
| UI muted (secondary labels, island name under the theme pill) | `#B8B3C9` |

**Time of day** (lerp between keys; 1 game day = 600 s real, 1 game hour = 25 s)

| Key | Time | Zenith | Horizon | Sun / intensity | Hemi sky / ground | Fog | Shadow tint |
|---|---|---|---|---|---|---|---|
| Dawn | 05:30 | `#7C8FD6` | `#FFC2A8` | `#FFD2A1` / 1.6 | `#B9C3F0` / `#C9A98E` | `#F2C9C0` | `#6B5BA8` |
| Day | 07:00–16:30 | `#5CB8F2` | `#CDEFFF` | `#FFF6E5` / 3.0 | `#CFEAFF` / `#B9D08A` | `#D6EEF7` | `#5A6FB0` |
| Golden | 17:30 | `#6FA6E0` | `#FFD08A` | `#FFB866` / 2.4 | `#C9D6F0` / `#D9B27A` | `#F6DDB0` | `#6A58A6` |
| Dusk | 19:15 | `#3E4C9A` | `#FF9A8B` | `#FF8A70` / 1.0 | `#8E8FD0` / `#A07A8A` | `#C792A8` | `#4C3F8C` |
| Night | 20:30–05:00 | `#141C3D` | `#2E3A6E` | moon `#BFD4FF` / 0.6 | `#4A5A9A` / `#2E3350` | `#26305A` | `#2A2A5E` |

Night stays cozy:
- Land never drops below 12 % luminance.
- All windows glow `#FFC870`; lanterns `#FFB347`.
- Fireflies are on.
- Moon glitter streak on the water.

**Rules**
- Large areas ≤ 75 % HSL saturation. Accents covering < 2 % of the screen may go up to 90 %.
- No pure black (min L 12 %). Pure white only on foam, clouds and highlights.
- Islands are always brighter than the surrounding water: luminance gap ≥ 0.15 by day, ≥ 0.06 at night.
- Weather:

| Weather | Saturation | Other |
|---|---|---|
| Overcast | −15 % | sky `#A9C3D9` |
| Rain | −20 % | fog `#9FB4C7`, fog density ×1.3 (D-013) |
| Mist | — | fog band y 0–6 u, `#F2EFEA` |

Weather saturation applies to the sky and fog (and only partly to the light on the land), so
foliage keeps W10's ≥ 40 % in the rain (D-013).

## 3. Lighting & atmosphere

- **Shadows:** one sun/moon directional light, soft PCF, ~0.3 u penumbra at T2. Shadowed colour = lit × 0.6, lerped 35 % toward the shadow tint. Never below L 25 % by day.
- **Sky/rim:** hemisphere light, plus a fresnel rim of 0.15 × horizon colour on foliage and roofs so silhouettes separate from the water.
- **Fog:** exponential, colour = horizon. ≈ 10 % at 200 u, 45 % at 700 u, 75 % at 1200 u. Far islands go pastel; they never vanish.
- **Clouds:** 6–10 clouds, each 5–9 smooth icospheres with the bottom 30 % flattened. Top `#FFFFFF`, belly `#DDE6F5` (night `#3A4577`). Altitude 60–90 u, width 22–44 u (D-011), drift 1.5 u/s with the wind. They cast soft moving shadows (multiply 0.82, 6 u edge blur). Hidden below T1.
- **Tilt-shift/DOF:**

| Tier | Effect |
|---|---|
| T0 | Off |
| T1 | Top/bottom 15 % bands, max 2 px blur |
| T2 | Top/bottom 20 % bands, max 4 px blur |
| T3 | DOF focused on screen centre, max 6 px blur |

- **Bloom:** threshold 0.9, strength 0.6, radius 0.4. Applies only to emissives, the sun disc and water glints. Land and foam never bloom.
- **Vignette:** intensity 0.22, softness 0.6, colour `#2A2350`.
- **Grade:** +4 % midtone saturation, lifted blacks. Golden hour adds a 6 % warm overlay.

## 4. Island roster

The seed picks 5–7 islands.
- **Hearthholm is always present.**
- At least one tall island (Beacon Rock or Emberpeak).
- Each island at most once.
- Map ≈ 600×600 u, with 40–90 u of water between coasts.
- Neighbouring islands must differ in height class (flat/mid/tall) or dominant colour (green/sand/dark).

| Island | Theme · size | Silhouette | Landmark | Key props | Creatures | Accent |
|---|---|---|---|---|---|---|
| **Hearthholm** | Fishing village · 110–140 u | Crescent around a harbour bay, 12 u hill | Clocktower + harbour wall with docks | Cottages, stilt huts, stalls, boats, laundry, lanterns | Villagers, cats, gulls | `#E8735A` |
| **Beacon Rock** (Marketing "Media Rock", TASK-403) | Media rock · 40–60 u | 25 u sheer stack (windward cliff + sea stacks), three lee shelves on earth walls down to the landing cove | Red/white broadcast lighthouse on the windward lip | Ad Boulevard (red street, giant double-sided screen, billboards, café), campus ledges (antenna tower, layered offices, photo studio, print shop), fair ground (ferris wheel, striped tents, game booths, stage) | Ferris wheel rotor (mover, not an agent) | `#E35D6A` |
| **Millbrook** | Windmill farm · 80–110 u | Flat rolling plateau 6–8 u | 2–3 windmills on knolls | Patchwork fields, barn, haybales, pond, fences | Sheep, ducks | `#F5C84C` |
| **Emberpeak** (DevOps "Ember Works", TASK-405) | Volcano · 90–120 u | 35 u notched cone + steam plume over three cone-foot shelves on bluff walls (harbour quay, two-step foundry and data center terraces) | Glowing crater; hot spring with cooling towers | Container yard (Docker-blue / teal / coral stacks, gantry crane, control tower), CI/CD belt, furnace halls with chimneys (lava glow at night), smithies, rail line, cottage lodges, black sand, vents | Ore trains on the rails, cargo ships at the pier (movers) | `#FF7A5C` |
| **Palmlagoon** (QA "Test Factory", TASK-401) | Factory plateau · 70–100 u | Rounded-square plateau on a 6–6.8 u bluff, top 8.6–9.6 u | Check tower (~20 u with the sign) | Sawtooth hangars with extractor fans, conveyor bridges, crash-test loop track | Crates on the belts, test cart on the loop (movers, not agents) | `#7FD8B3` |
| **Mossgrove** | Forest · 80–110 u | 20 u green dome + 18 u giant tree | Treehouse with rope ladder | Pines, giant mushrooms, log cabin, stream | Foxes, squirrels, owl, fireflies | `#3E9A52` |
| **Lonely Palm** (Research "Observatory University", TASK-402b, D-046) | Terraced campus hill · 52–58 u | 4.2–4.8 u bluff walls, a lawn plateau with a campus terrace and a summit plateau (12–13.2 u), a dish spur, a base headland, the leeward cove | Summit observatory (~11 u) with a big radio dish | Quad of faculty halls round the library and fountain, campus tower, hedge-parterre garden with topiaries and pergolas, terrarium row, lab pods + weather mast, atom / DNA / rocket / armillary sculptures, research vessel at the cove pier | Campus bots | `#F7E1AE` |

**Bluff coasts (TASK-390).** Every archetype except Beacon Rock (its own windward cliff) stands on a 5–7 u
bluff wall with a harbour / leeward cove sector, tagged `Zone.cliff` and painted as earth wall (§2). The
Research campus (4.2–4.8 u walls) gets no waterfalls (`noWaterfalls`, D-046).

**Waterfalls (TASK-395).** 1–3 per bluff island, 2.6–3.6 u wide ribbons off a bluff lip into a foam disc and
mist at the foot; the flow scrolls along the sheet. None on cove beaches or on the Research campus.

**Hero landmarks (TASK-393)** are 1.6–2× taller than the table's first-pass sizes so they read from the T0
postcard: lighthouse shaft 15.5 u, wind turbines 24 / 19 / 16 u, cooling towers 13 / 11.5 u, clocktower body
+6.5 u. Hearthholm's clocktower above reads 11 u only as the original size.

## 5. Prop catalog

Tier = the first tier at which the prop appears.

**Vegetation**

| Prop | Recipe | Size | Tier |
|---|---|---|---|
| Palm | Curved trunk of 6 tapered cylinder rings (alternating `#A8754F`/`#8A5A3B`); 7 drooping 3-segment leaf fans; 2–3 coconuts | 5–7 u | T1 |
| Round tree | Trunk + 3–5 overlapping icospheres, ±15 % scale jitter | 4–6 u | T1 |
| Blossom tree | Round tree with `#FF8FB1` blossom clusters on the canopy shell; its own canopy kind, so far blobs stay pink (D-031) | as round tree | T1 |
| Pine | Trunk + 3 stacked cones, each 70 % of the one below | 5–9 u | T1 |
| Giant mushroom | Lathe stem + squashed dome `#E35D6A` with 5–7 white disc spots | 2 u | T1 |
| Bush | 2–3 merged icospheres, optional flower dots | 1 u | T2 |
| Crop row | Rows of small spheres/cones, field tint | 0.4 u | T2 |
| Haybale | Beveled cylinder on its side, `#F2C46B` | 1.2 u | T2 |
| Reeds | 5–7 thin boxes + brown capsule tips | 0.9 u | T3 |
| Lily pad | Disc with a wedge notch, optional flower | 0.4 u | T3 |
| Grass tuft | 3–5 flattened tapered cones | 0.3 u | T3 |
| Flower | Stem + 5 petal spheres around a yellow centre | 0.25 u | T3 |

**Buildings**

| Prop | Recipe | Size | Tier |
|---|---|---|---|
| Cottage | Beveled box + extruded gable roof (0.25 u overhang), door, 2–4 inset windows, chimney | 3×3×3.5 | T1 |
| Stilt hut | Cottage on 4–6 log stilts over water + ladder | 3×3×4.5 | T1 |
| Tower house | Narrow box, cone roof, balcony ring | 2.5×2.5×6 | T1 |
| Windmill | Tapered octagonal lathe body, dome cap, 4 box-frame lattice blades | 9 u, 7 u blades | T0 |
| Barn | Box + gambrel extrude roof, X doors | 6×4×4.5 | T1 |
| Log cabin | Stacked horizontal cylinders + roof | 4×3×3.5 | T1 |
| Market stall | 4 posts + striped extruded canopy + crate counter | 2×1.5×2.4 | T2 |

**Coastal**

| Prop | Recipe | Size | Tier |
|---|---|---|---|
| Dock | Plank boxes (0.2 u gaps) on cylinder piles, bollards | 2×1.2 segments | T1 |
| Rowboat | Lathe half-bowl hull, 2 benches, oars | 2.4×1 | T1 |
| Sailboat | Extruded hull, mast, curved 0.05 u-thick sail, flag | 5 u long | T0 (dot) |
| Sea stack | Noise-displaced column, strata colours, grass cap | 6–15 u | T0 |
| Rock cluster | 2–5 noise-displaced icospheres | 0.5–4 u | T1 |
| Buoy | Red/white banded capsule + bell | 0.6 u | T2 |
| Driftwood | Bent cylinder + stubs | 1.5 u | T2 |
| Tide pool | Rock ring + `#8EEBE0` disc + starfish | 1.5 u | T3 |
| Shell / starfish | Lathe spiral cone / extruded 5-arm star | 0.15 u | T3 |
| Footprints | Paired oval sand decals, fade after 20 s | 0.2 u | T3 |

**Decor**

| Prop | Recipe | Size | Tier |
|---|---|---|---|
| Fence | Posts + 2 rails, random tilt ±4° | 1.5×0.8 | T2 |
| Lantern post | Post + cube lamp (emissive core) + hat | 2.2 u | T2 |
| Laundry line | 2 posts, sagging catenary rope, 3–5 cloth quads in roof colours | 4 u | T2 |
| Bunting | Catenary rope + 8–12 triangles | 6 u | T2 |
| Bench | Planks + 2 legs | 1.4 u | T2 |
| Barrel / crate | Lathe barrel with rings / beveled box with cross planks | 0.6 u | T2 |
| Well | Ring of stone boxes, roof, bucket | 1.6 u | T2 |
| Stepping path | Beveled discs along a spline | 0.5 u | T3 |
| Message bottle | Light-green lathe bottle + cork | 0.3 u | T3 |

**Landmarks**

| Prop | Recipe | Size | Tier |
|---|---|---|---|
| Lighthouse | Tapered lathe tower, 5 red/white bands, gallery + railing, glass lamp room, dome | 14 u | T0 |
| Clocktower | Box tower, 4 clock faces (disc + 2 hands), pyramid roof, flag | 11 u | T0 |
| Volcano | Terrain cone, crater ring, emissive lava disc, strata | 35 u | T0 |
| Giant tree + treehouse | Fat trunk with 3 root flares, 5 canopy blobs, platform + mini cottage + ladder | 18 u | T0 |
| Sunken ship | Tilted hull + broken mast at −2 u, seaweed strips | 12 u | T1 |
| Hot spring | Rock ring + `#9FE6E0` disc + steam | 6 u | T1 |

## 6. Zoom tiers

The camera pitch flattens as you zoom in. FOV is a constant 35°. Use ±10 % distance hysteresis at every tier boundary.

| Tier | Distance | Pitch | Appears | Starts animating |
|---|---|---|---|---|
| **T0 Map** | 380–800 u | 58–70° | Terrain + rings, landmarks, tree clusters as blobs, clouds + shadows, boats as dots with 2 u wakes, island labels | Swell, foam pulse, clouds, gull flocks as specks, windmills, beam, volcano steam |
| **T1 Island** | 140–380 u | 45–58° | Trees, houses, docks, rowboats, rocks | Tree sway, boat bob, chimney smoke, dolphins |
| **T2 Village** | 45–140 u | 35–45° | Bushes, fences, lanterns, laundry, barrels, villagers, sheep, stalls | Walking, laundry, gull landings, fish jumps, flicker, butterflies |
| **T3 Macro** | 12–45 u | 20–35° | Grass, flowers, shells, crabs, reeds, footprints, fish under water, ripples | Crabs, grass wiggle, fish schools, close-up fireflies |

**Bloom-in:**
- Scale 0 → 1 on spring `k=180, c=17` (≈ 8 % overshoot, ~300 ms; D-008).
- Stagger 0–220 ms by hashed position, radiating outward from the screen centre.
- Grass and flowers use a 250 ms dither instead.
- At most 40 pops start per frame.

**Bloom-out:** 140 ms ease-in scale to 0, or a 200 ms dither.

**Cross-tier consistency (D-031, D-032):** every structure ≥ 3 u, landmark, tree mass and district ground
exists from T0 with its final colour and silhouette (its own LOD1 built from the LOD0 colours). Detail adds
only zero-mean variation; nothing large appears with a tier. Checked by the zoom ladder (`pnpm shots ladder`):
11 distances 700 → 21 u at a fixed 48° pitch, step mean ΔE2000 ≤ 5, p95 ≤ 12, drift vs the 170 u reference
≤ 4, and boundary pairs at 1.06 b / 0.94 b (D-035 for the mapping, slack and land floor).

**Postcard pose (D-040).** The intro and the default hero view end on a fitted low 3/4 look instead of the
high overview. Horizon at 0.74 NDC, so the look-down is atan(0.74 · tan 17.5°) ≈ 13° at FOV 35° (nearest
islands ≈ 30°, far ones ≈ 15°); heading −10° so the 15:00 sun lights the islands from the right. The pitch band
reaches 10° at and beyond 260 u (blended back by 150 u), so the pose is reachable. Portrait screens keep the
58° overview.

## 7. Life & animation catalog

Each instance's phase is `hash(id) × period`. Gust waves cross the map at 6 u/s (wavelength 40 u, strength 0–1) along the seeded wind direction.

| # | What · where | Period | Amplitude | Easing | Cute touch |
|---|---|---|---|---|---|
| 1 | Swell · all water | 7 s | y ±0.15 u, 2 octaves | sine | Facet glints at crests |
| 2 | Shore lap · beaches | 4.5 s | Foam advances 0.8 u | ease-out in / ease-in out | Wet sand trails the retreat by 0.6 s |
| 3 | Boat bob · moored | 3.2 s | y 0.12 u, roll 6°, pitch 3° | sine, roll +0.8 s | Rope tugs taut on gusts |
| 4 | Sailing · 2–4 boats | 90–180 s route | 3 u/s, heel 8° | Catmull-Rom | Foam-dot V-wake; sail puffs on gusts |
| 5 | Tree sway | gust + 4 s idle | 2° idle, +6° gust | `k=40, c=4` | Canopy squash 0.97/1.03 at peak |
| 6 | Palm sway | 5 s | Trunk 4°, fronds 10° (0.3 s lag) | sine + gust | 1 % chance of a coconut drop per gust |
| 7 | Grass/flowers · T3 | 2.5 s | 8° | sine, phase = world x | Visible gust ripples |
| 8 | Villager walk · paths | step 0.45 s | Hop 0.12 u, squash 0.9/1.1 | ease-out/in | Stops at stalls, looks around 1.5 s |
| 9 | Villager idle · doors/docks | 6–12 s | Wave, stretch, fishing cast | `k=200, c=16` | Waves at a camera within 25 u |
| 10 | Cat · roofs/steps | 20 s | Tail curl 30° | sine | Sleeps curled dusk → dawn |
| 11 | Gull flock | circle 12 s | Radius 15–25 u, bank 20° | constant | 3 flaps, 2 s glide |
| 12 | Gull landing · posts/masts | every 15–40 s | Flare + hop | `k=250, c=14` | Feather-ruffle scale pulse 1.08 |
| 13 | Fish jump · coasts | every 6–14 s | Arc 1.2 u high, 2 u long | parabola, 360° spin | Splash ring + 4 droplets |
| 14 | Fish school · shallows | continuous | 6–10 boids | 90°/s turn | Scatters from cursor, regroups after 2 s |
| 15 | Crab · beaches | scuttle 3 s, pause 2–5 s | 1.5 u sideways | 8 Hz leg tick | Claws clack while moving |
| 16 | Butterflies · flowers, day | flap 0.25 s | Figure-8, 2 u | sine | Rests on a flower 3 s |
| 17 | Fireflies · 19:30–04:00 | blink 1.5–3 s | Drift 0.5 u, glow 0 → 1 → 0 | smoothstep | Swarm to the clicked point |
| 18 | Windmill blades | 6 s/rev × wind (0.5–1.5) | — | linear | Extra spin on gusts |
| 19 | Lighthouse beam · 18:30–06:30 | 8 s/rev | 40 u cone, opacity 0.35 | linear | Lights the fog it crosses |
| 20 | Chimney smoke | spawn 1.2 s | Puff 0.2 → 0.9 u, rise 4 u | ease-out, fade last 40 % | Leans with the wind |
| 21 | Volcano steam | spawn 0.6 s | Puff 2 → 8 u, rise 25 u | ease-out | Ring-puff "burp" every 40 s |
| 22 | Lava glow | 3 s | Emissive 0.7–1.0 | sine | Lights the crater rim at night |
| 23 | Laundry/bunting | 1.8 s | 15° flutter | sine + gust | Cloths flip on gusts |
| 24 | Clouds | continuous | 1.5 u/s | linear | Ground shadows follow |
| 25 | Windows/lanterns | flicker 0.2–0.5 s | ±8 % | noise | Windows turn on one by one 18:45–19:30; 30 % go off at 23:00 |
| 26 | Sheep · fields | graze 8 s, hop 0.35 s | 0.2 u | squash 0.85/1.15 | Wool jiggle `k=120, c=6` |
| 27 | Ducks · pond | paddle 1 s | Follow-chain | spring follow | Ducklings bob 0.25 s out of phase |
| 28 | Dolphins · open water | every 30–60 s | 3 arcs, 2 u | parabola | Pair arcs in sync |
| 29 | Capybaras · hot spring | blink 4 s | Head bob 0.03 u | sine | Orange `#FFA13D` sphere on head |
| 30 | Rain ripples · rain only | 0.8 s | Ring 0 → 0.6 u | ease-out | Villagers open cone umbrellas |
| 31 | QA movers · conveyor bridges, loop track | belt 1.1 u/s; cart 3 u/s, 1.2 s dwell at the gate | Crates one per belt segment; cart slows to 50 % at the loop top | linear | Time-driven instances, fade 150–210 u, hidden > 230 u |
| 32 | QA hangar fans · front walls | with the wind, like the windmill | r 0.42 u | linear | — |
| 33 | Waterfall flow · bluff lips | 3.2 u/s along the sheet | White streaks, 6 lanes | linear | Foam rings expand 0.9 u/s; mist puffs at the foot |

**Click reactions.** Every click starts with a squash of 0.85/1.15 on `k=300, c=14`, then a ring of 6 sparkles in `#FFF6C2`. Then, per target:

| Target | Reaction |
|---|---|
| Tree | Shakes 0.6 s; 3–5 leaves drift down; 20 % chance a bird bursts out |
| House | Door opens and a villager peeks out for 1.5 s; heart-shaped chimney puff |
| Villager | Jumps 0.5 u, "!" bubble, waves |
| Boat | Rocks 15° (`k=60, c=3`); toot ring |
| Bird | Takes off, loops, lands elsewhere |
| Crab | Buries itself in a sand puff, pops back up after 4 s |
| Volcano | Camera shake 0.15 u for 0.4 s; steam burp + 6 embers |
| Water | Splash ring; 30 % chance of a fish jump |
| Windmill | Blades spin 4× for 3 s, then spring back |
| Lighthouse | Lamp flashes 3× |
| Sheep | "Baa" bubble, double hop |
| Cloud | Splits into 3 clouds that re-merge over 10 s |
| Lonely Palm | Coconut drops and bounces 3×; the crab runs to it |

## 8. Opening sequence (10 s)

The sequence starts at game time 15:00, so golden hour arrives about 62 s later as a second wow moment.

| t (s) | Shot |
|---|---|
| 0–1.5 | Camera at y=180 u, pitch 80°, inside cream clouds (`#FFF3DA`), slow descent. "Marisland" scale-pops in (Fredoka 700, 64 px, `#3B3A5A`). |
| 1.5–3 | Clouds slide radially outward (ease-out, 1.2 s), revealing the archipelago from 900 u. **By 3 s, every turquoise ring is visible.** |
| 3–6.5 | Spline swoop down to 420 u, yaw +40°, pitch 80 → 58° (easeInOutCubic). A gull flock crosses the foreground at 3.8 s. Island labels pop in at 5.5 s, staggered 120 ms. |
| 6.5–8.5 | Push toward Hearthholm to 300 u, passing a sailboat's wake. A fish jumps at 7.2 s. |
| 8.5–10 | Settle on the postcard pose (§6, D-040; the 450 u / 58° overview on portrait screens) with 2 % overshoot, the horizon and cloud banks rising into frame. Idle orbit starts at 0.6°/s. HUD buttons pop in, staggered 60 ms. |

Any click or key jumps to the final pose with a 400 ms ease.

**Loading screen**
- Background: gradient `#BFE9F2` → `#FFF3DA`.
- Centre: a canvas-drawn noise-blob island (sand + green) with a turquoise ring.
- A tiny boat circles the island; its lap is the progress bar.
- Captions in Nunito 700 18 px, rotating every 1.2 s: "Raising islands…", "Planting palms…", "Teaching crabs to walk sideways…".
- Exit: the blob scales to 1.15 and fades over 400 ms into the cream cloud of shot 1.

## 9. UI / HUD

- **Fonts:** Fredoka 600/700 for titles and labels; Nunito 700/800 for small text.
- **Tokens:** surface `#FFF8EC`, ink `#3B3A5A`, primary `#FF8A65`, secondary `#4FC3C9`, muted `#B8B3C9`. Button lip `0 4px 0 #3B3A5A22`. Radius 16 px (pills 999 px).
- **Layout:** wordmark top-left, compass top-right, dock at bottom centre with Time, Weather, New Seed, Photo, Sound. 16 px margins; the dock wraps on narrow screens.
- **Buttons:** 52 px circles with 24 px inline-SVG line icons (stroke 2.5, round caps).
  - Hover: −2 px lift, scale 1.06, 120 ms.
  - Press: scale 0.9 on `k=400, c=18`.
  - Tooltip pill after 400 ms.
- **Island labels (T0 only):** Fredoka 600 16 px pill on `#FFF8ECDD`, with an 8 px dot in the island's accent colour. Sits just above the island's projected shelf ring (and never below 8 u above the peak), off the land. 250 ms pop-in; screen-space collision nudge (upward first).
- **Default view:** the postcard pose (§6); the view-reset control returns to it (the 58° overview on portrait).
- **Compass:** 64 px disc, coral N, rotates with camera yaw. Click springs the view back to north.
- **Time dial:** 120 px arc filled with the live sky gradient; a sun/moon icon rides the arc. Drag to scrub; double-click returns to live time.
- **New Seed:** dice wobbles for 0.4 s → clouds close (0.8 s) → world regenerates → clouds part (1.2 s).
- **Photo mode:**
  - HUD fades out over 200 ms.
  - Bottom bar: 72 px shutter, plus sliders for time, tilt-shift, DOF (tap to focus), FOV 15–60°, filter (Original/Warm/Pastel/Film) and a polaroid-frame toggle.
  - Shutter: 120 ms white flash, then a polaroid thumbnail drops in rotated −4° and the PNG downloads.
  - Esc exits.

## 10. Audio (procedural, muted by default)

| Layer | Recipe |
|---|---|
| Waves | Pink noise → low-pass 600 Hz, amplitude LFO 0.14 Hz synced to shore lap, panned toward the nearest shore |
| Gulls | FM chirps 1.2 → 2.4 kHz over 180 ms, every 6–14 s, scaled by how many gulls are visible |
| Wind | Band-pass noise 300–900 Hz, following gust strength |
| Chimes | Pentatonic C5–A5 sines, 2 s decay, triggered by gusts at T2–T3 |
| Night | Crickets: 4.2 kHz pulses in 18 Hz bursts |
| Clicks | Soft pluck, pitched per object type |
| Tier mix | T0 = ocean bed + wind; T3 = local lap + nearby creatures |

## 11. Wow checklist (automated screenshot targets)

**Capture setup:**
- URL: `?seed=<n>&shot=<id>`, at 1920×1080.
- Settle 3 s before capturing.
- The seeds below are placeholders. The architect pins real seeds that contain the named island.

| ID | Shot | Seed · camera · time | Pass criteria |
|---|---|---|---|
| W1 | **Postcard** | 1001 · T0 ≥ 450 u (fitted to the rings), pitch 58° · 15:00 | ≥ 5 islands fully in frame; every island has a continuous ring within `#4FD1D9` ±10 %; ≥ 3 height classes; ≥ 2 cloud shadows; no overlapping labels |
| W2 | **Golden Harbor** | 1001 · T2 70 u Hearthholm harbour, pitch 38° · 17:45 | ≥ 3 boats with ripple rings; sunlit roof hue 10–40°; shadow hue 220–280° with L ≥ 25 %; tilt-shift blur in top/bottom bands |
| W3 | **Lantern Night** | 1001 · T2 80 u Hearthholm · 22:00 | ≥ 8 bloomed warm emissives; ≥ 10 fireflies; mean land luminance ≥ 0.12; moon glitter streak on water |
| W4 | **Beacon** | 2024 · T1 160 u, Beacon Rock in the left third · 21:30 | Beam cone visible in fog; cliff vs sky ΔL ≥ 0.1; ≥ 2 sea stacks; foam at the cliff base |
| W5 | **Steam & Spring** | 3003 · T1 140 u Emberpeak · 10:00 | Steam column continuous for ≥ 15 u; black sand contrasts with the turquoise ring; crater glow visible; no land pixel < L 12 % |
| W6 | **QA Test Factory** | 4004 · village view of the QA plateau (`village:qa`) · 12:00 | Earth walls and the plateau read against the sea; ≥ 2 sawtooth hangars with a conveyor bridge; loop track and check tower visible; crates on the belt |
| W7 | **Turbine Morning** | 1001 · raw `45,20,3.46,95,13,23.46` (over Coding toward the turbines and solar rows) · 06:45, frames 0.5 s apart | Blade angle differs between the two frames; ≥ 2 turbines (yaw + spin tags) and ≥ 1 solar row in frame; morning haze behind the tech park; land never below L 12 % |
| W8 | **Macro Shore** | 1001 · T3 18 u, Hearthholm beach · 14:00 | Foam line moves between frames 2 s apart; crab + ≥ 3 shells + grass tufts visible; during a 3 s dolly-in from 60 u, nothing appears without a bloom-in |
| W9 | **Observatory University** | 1001 · raw cam low from the east, ≈ 60 u · 18:45 | The observatory dome and telescope stand against the evening sky above the horizon; walls, lawn and ≥ 3 other campus pieces (halls, dish, pods, glasshouses) read in front; no other island behind it |
| W10 | **Rainy Grove** | 6006 · T1 120 u Mossgrove, rain · 13:00 | Ripples on water; treehouse windows lit; foliage saturation ≥ 40 %; sky not neutral grey |
| W11 | **Concept** | 1001 · `postcard` pose (§6) · 15:30 | Horizon at ≈ 0.74 NDC with cloud banks; all 7 islands in frame, walls and landmarks overlapping in depth; earth walls with strata and grass lip visible; no island clipped |
| W13 | **Falls** | 1001 · raw cam from the sea at a Mossgrove waterfall, ≈ 40 u · 10:30 | Ribbon reads from lip to water; foam disc and mist at the foot; flow streaks move between frames 0.5 s apart |
| W14 | **Campus Golden Hour** | 1001 · raw cam from the east, ≈ 85 u · 17:45 | Observatory, quad (fountain, ≥ 2 halls, library) and the parterre garden all in frame; terrariums and lab pods read; nothing floating or on a slope; no other island in frame (calls) |
| W15 | **Relay Night** | 1001 · `postcard` pose (W11 frame) · 21:00 +105 s | ≥ 5 of 7 islands show lit windows or festival light, Marketing's marquee / searchlights brightest; no island clipped; sky craft lit, not cut by the top edge more than half; land L ≥ 0.12 |
| W16 | **Harbour Guild Morning** | 1001 · raw `100,14,-150,86,9,-186` · 09:00 +15 s | Clear sky and saturated sea (fog gone); pier root with awning, timetable, crates and ≥ 3 banners / bunting lines is the subject; clock tower whole behind it; ≤ 230 calls |
| W17 | **Jewel Tree Night** | 1001 · raw `-168,52,98,-142,33,88` · 21:00 +4 s | Atelier Tree canopy whole in frame with ≥ 6 lit vitray panels in ≥ 4 hues; treehouse windows lit; ≥ 3 warm lantern pools on the glade; canopy against the night sky (no island behind) |
| W18 | **UV Bug Hunt** | 1001 · raw `-174,27,-190,-160,7,-208` · 21:30 +4 s | Violet UV pools under ≥ 3 lamp posts on the track/yard; scoreboard digit and Hall of Checks tick badges lit and readable; dummy bench + clipboard wall visible; no prop clipping the lens |
| W19 | **Prism Hour** | 1001 · raw `-134,50,-94,-112,26,-160` (from the NNW, re-framed TASK-470) · 17:30 +4 s | Glass Conservatory whole, not hidden by the Atelier Tree; tree canopy whole with ≥ 4 lit panes; spray rainbow arc ≥ 4 bands left of the conservatory; glasshouse row in pane colours; warm light, no sky craft cut by the frame edge; ≤ 270 calls |
| W20 | **Compass Star** | 1001 · raw `-35,82,-8,-34,1.4,-31` (HQ plaza from above) · 15:30 +4 s | Compass mosaic whole and near the frame centre, seven rays in ≥ 5 distinct culture hues; ≥ 5 culture gates at the street mouths; clock tower and goods stalls read; bay sand + turquoise ring on one side |
| W21 | **Conservatory Prism Hour** | 6006 · raw `94,52,-116,126,16,-168` · 17:45 +4 s | Faceted conservatory dome in front, ≥ 8 pane hues; ≥ 2 prism arches, ≥ 1 with its rainbow pool on the path; glasshouse row in pane colours; Atelier Tree whole; ≥ 1 spray rainbow; open sea behind; ≤ 220 calls |
| W22 | **Seven Gates Night** | 1001 · raw `-36,55,25,-20,4,-25` · 21:00 +5 s | Compass plaza lit warm with the rays readable; ≥ 5 culture gates at the street mouths (gate lanterns lit); clock-tower windows and dial lit; ≥ 8 warm lamp pools on the streets; land L ≥ 0.12 |

**Global fail (any shot):**
- Land pixel with L < 12 %.
- Foam-line z-fighting.
- Any island without a visible shallow ring.
- Two same-type creatures animating in perfect sync.
- A zoom-ladder step or boundary pair over its threshold (§6, D-031 / D-035), for a judged step.

## 12. Cultures (M19 "Seven Cultures")

Every island is a profession micro-culture (`mar-plans/ISLAND_CULTURES.md`). Five layers per island:
silhouette and colour (T0), architecture (T1), kit, rhythm and ritual (T2), ambient stories (T3).
Code: `src/content/cultures/` (contract, kit ledger, rhythm, movers, boats), `src/geo/themes/culture-<theme>.ts`
(kit geometry), `src/world/gen/plans/*` (placement). Decisions: D-049 (far merge), D-050 … D-055.

**Rules**
- ≤ 10 new defs per island (`budgets.cultureDefsPerIsland`), ≥ 70 % at tier 2–3, no tier 0, at most one tier 1.
  Variants of existing defs are not ledger entries.
- Colours come from the existing palette tables only (checked by the culture validator).
- A culture's accent is its pennant and label colour. The §4 accent column predates the cultures and differs
  for DevOps (`#FF9F43` here, `#FF7A5C` in §4), Design, QA and Research; the table below wins.

### 12.1 Islands

**Identity** (accent, pennant cut and glyph are the same everywhere in the world, D-051)

| Island (theme) | Culture (TR / EN) | Accent | Pennant cut | Glyph | Relay step |
|---|---|---|---|---|---|
| HQ · Hearthholm (`hq`) | Liman Loncası / Harbour Guild | `#E8735A` | swallowtail | bell | 1 · ferryFanfare |
| Coding · Millbrook (`coding`) | Rüzgâr Bahçeleri / Wind Gardens | `#5B9BE6` | kite | code `</>` | 4 · kiteDay |
| DevOps · Emberpeak (`devops`) | Kor Demircileri / Ember Smiths | `#FF9F43` | square | hammer | 2 · releaseNight |
| Marketing · Beacon Rock (`marketing`) | Karnaval Yayıncıları / Carnival Broadcasters | `#E35D6A` | streamer | megaphone | 5 · goldenHourShow |
| QA · Palmlagoon (`qa`) | Müfettişler Adası / Inspectors' Island | `#3FBF8F` | chevron | check | 3 · greenLightCeremony |
| Design · Mossgrove (`design`) | Cam ve Işık Stüdyosu / Glass & Light Studio | `#B07CE0` | scallop | prism | 6 · lanternNight |
| Research · Lonely Palm (`research`) | Yıldız Akademisi / Star Academy | `#4FC3C9` | star | telescope | 7 · cometNight |

**Signature kit** (new defs, by tier; `noShadow` on every tier-3 micro prop)

| Island | Tier 1 | Tier 2 | Tier 3 |
|---|---|---|---|
| HQ | — | timetableBoard, ferryAwning, guildNoticeBoard, bellPost, harbourCrane, coffeeCart | gullPerch, mailbag |
| Coding | giantDuck | kite, pergolaDesk, hammock, kiteRack | rubberDuck, whiteboardA, mugStack |
| DevOps | onsenHouse | lavaLantern, onsenDeck, ingotStack, incidentSign, pipeValveWheel, signalHorn, serverShrine | anvil, pagerRock |
| Marketing | mascotStatue | marqueeSign, popcornCart, balloonMast, confettiCannon, searchlightPair, prizeBooth, selfieSpot | posterRoll, megaphoneStand |
| QA | — | dummyBench, inspectionBooth, uvLampPost, scoreboard, flagMast | bugJar, conePyramid, stampDesk, clipboardWall |
| Design | rainbowArc (time-gated) | hotShop, prismSculpture, stainedScreen, gatherRing | causticDecal, glassOrb, culletCrate, sampleShelf, blowpipeRack |
| Research | — | tripodTelescope, chalkboard, orrery, lectureSteps, teaTrolley, weatherBalloonCart, owlBox | pigeonPerch, bookCart, miniVolcanoTerrarium |

**Rhythm and ritual** (game hours; ritual length in real seconds; lamp set = the island's own lights)

| Island | Daily slots | Rituals | Lamp set (on → off) |
|---|---|---|---|
| HQ | 12:00 coffee queue · 17:45 ferries home · 20:00 pier lanterns | Ferry Fanfare 06:00 and 18:00 (40 s) | timetable board 20:00 → 06:00 |
| Coding | 06:30 ducks out · 17:30 hammock hour · 19:30 fairy lights | Kite Day 14:00 (60 s, wind-gated) | pergola desks 19:30 → 05:30 |
| DevOps | 10:00 hammer hours · 17:30 shift end | Shift siren 06:00 (10 s) · Release Night 21:00 (40 s) | lava lanterns 18:30 → 06:00 |
| Marketing | 09:00 poster crew · 12:00 fair opens · 19:30 neon night | Golden Hour Launch Show 17:30 (60 s) | marquee 17:24 → 01:00 |
| QA | 08:00 hangars open · 20:30 bug hunt | Siren test 12:00 (10 s) · Green light 16:00 (30 s) | UV posts + bug jars 20:30 → 05:00 |
| Design | 06:00 dawn glass · 09:00 hot shop · 16:30 prism hour | Light Night 20:00 (60 s) | stained screens + glass orbs 20:00 → 06:00 |
| Research | 09:00 lectures · 17:45 golden reading | Weather balloon 06:00 (60 s) · Comet night 22:00 (60 s) | chalkboard + owl box 21:45 → 05:00 |

Design's rainbow arc is gated to 06:00–07:30 and 16:30–18:30 (dither, rain fades it out).

**Ambient stories** (T3; a fixed tableau bot or a spot animal at each story spot, D-053)

| Island | Stories |
|---|---|
| HQ | cat asleep on the timetable; gull fed on the perch; umbrella forgotten under the ferry awning; two bots arguing at the pier signpost; bottle shelf; kitten in the mail sack; coffee queue; bell post |
| Coding | warm-rack cat; hammock nap beside a mug crate; kite caught in the hedge; duck crossing by the bike rack; bug doodle on the whiteboard; gull on the giant duck |
| DevOps | capybara in the onsen beside a hard-hat bot; container nap; crane-cab cat; flower in an ore cart; incident sign watchers; pager crab; anvil and smithy |
| Marketing | mascot crab waves; popcorn gulls; selfie by the lighthouse; ferris-wheel operator asleep; balloon snagged on the antenna; prize duck; poster crew; balloon launch |
| QA | dummy with coffee on the bench; gull on the cone pyramid; ant trail with a magnifier bot; scoreboard drop with an escaped ladybug; sleepy stamp desk; crab inspected by cones |
| Design | annealer cat on the warm oven; gaffer turning a blowpipe; gull on the seconds shelf; rainbow from broken cullet; vase held to the sun; fox looking into an orb; prism rainbow; critique ring |
| Research | owl at night; tea time; lecture steps; balloon cart; pigeon on the statue; volcano terrarium steam; comet watch; book step gazer |

**What reads at each tier, and the M19 QA result** (`mar-docs/qa/`, TASK-451; P present, W weak)

| Island | T0 silhouette | T1 architecture | T2 kit and rhythm | T3 stories | QA 451 |
|---|---|---|---|---|---|
| HQ | coral hilal, clock tower, white ferry wakes | bell-gable roofs, awnings, seven pennant lines | timetable, queue, perches | cat, signpost debate, bottles | rhythm W (06:00 fanfare unframed); signpost debate hidden by the banner pole |
| Coding | pale green plateau, three white turbines, blue pool | flat roofs, pergola rows, giant duck | kites, hammocks, bikes | nap, stuck kite, duck crossing | all P |
| DevOps | black cone, steam plume, orange glow, cooling tower | steel roofs, crane, train, ship | lanterns, ingots, onsen | capybara onsen, container nap | T2 W (pipe segments float on the slope) |
| Marketing | red/white stack, ferris wheel, screen glow | striped tents, marquee, mascot | popcorn, confetti, balloon mast | mascot wave, selfie, snagged balloon | all P (searchlight beams wash the night frame) |
| QA | mint plateau, check tower | hazard stripes, flag mast | booths, dummy bench, UV lamps | dummy coffee, ant trail, scoreboard | rhythm W (UV pools faint) |
| Design | pink-green dome, purple giant tree | faceted glass roofs, hot-shop chimney, rainbow arc | prisms, screens, glass ring, caustics | annealer cat, glass fox, rainbow shards | all P (golden caustics read as slabs) |
| Research | white dome, green parterre, dish | domes, bell tower, amphitheatre | tripods, orrery, tea, balloon cart | owl, comet watch, tea | rhythm W (balloon reads as a lollipop); 0–3 pennant lines |

M19 QA: every island has P on at least four of the five layers; the checklist for a new island is the same five rows.

### 12.2 Launch Day Relay

Every game day at 21:00 the seven islands take their turn in relay order (table above), 10 s apart. Each
island flashes (×4 emissive, 0.6 s attack, 6 s decay), holds a 0.6 glow for 70 s in total, then fades over 15 s.
Structures self-light at 0.12 between 180 and 380 u so the relay reads at T0 / T1. Live, the relay runs on day
seconds; in a frozen capture it is `time=21` with `simt` 0–110 (W15 at `simt` 105). No new programs or agents (D-052).

### 12.3 Sky: Hype Fleet and the Orchestrator

| Craft (count low / medium / high) | Culture | Look | Behaviour |
|---|---|---|---|
| Hype Fleet balloons (2 / 4 / 5) | Marketing's fleet: one balloon per department | gores in the culture's accent (dominant), cream and the next member's accent; basket pennant (cut + accent + glyph) on two spars | orbit in the 34–60 u band; the launch balloon lifts off the Marketing mast at the 17:30 Launch Show (80 s approach, 10 s inflate, 70 s lift) and joins the orbit |
| Orchestrator airship (0 / 1 / 1) | HQ | cream and orange hull, seven culture pennants on a 16 u tail string, bell emblem on both flanks | slows down where its orbit passes over HQ |

### 12.4 Trade and ferry routes

| Route | Boat | Built as | Carries |
|---|---|---|---|
| HQ ↔ every island | Ferry (sailboat variant 2) | HQ `ferry` loops through one pier per island; 8 s dwell at each stop; 3.4 u/s cruise, 0.45 u/s² braking (D-054) | passengers, mail sacks |
| Around QA | Inspection boat (sailboat variant 3) | ring 22 u outside the island, 2.2 u/s | inspection |
| Around Design | Lantern boat (sailboat variant 4) | ring 30 u outside the island, 1.4 u/s | glass lanterns (lit at night) |
| DevOps → HQ, Marketing, QA | Cargo ships and ore trains | movers on the harbour loop (`render/harbour-routes.ts`), not agents | containers (orange = deploy), ore |
| Other plan §3.1 rows (Coding → QA, QA → DevOps, Design → HQ / Marketing / Research, Research → Design / Coding) | — | not in the built set (TASK-434) | — |
