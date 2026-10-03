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
- **Smooth-shaded exceptions:** water, clouds, smoke/steam, eyes (black sphere + 0.3× white highlight).
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
| Foliage: deciduous / pine / palm | `#8FD16A` `#5DBB63` `#3E9A52` / `#3C8F68` `#2F7D5B` / `#7FD34E` `#5DB33C` |
| Wood: planks / logs / dark / dock | `#D2A679` / `#A8754F` / `#8A5A3B` / `#B59B7E` |
| Walls | `#FFF4E0` `#FAFAF5` `#FFD9D2` `#FFF0B8` |
| Roofs | `#E8735A` `#E35D6A` `#3FB8AF` `#F5C84C` `#9C8CE0` `#5DA9E9` `#7FD8B3` |
| Emissive: window / lantern / lava / firefly | `#FFC870` / `#FFB347` / `#FF6A3D` / `#E8FF8A` |

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
| **Beacon Rock** | Lighthouse · 40–60 u | 25 u sheer stack, zig-zag stair path | Red/white lighthouse | Sea stacks, keeper hut, buoys, rope fence | Puffins, seals | `#E35D6A` |
| **Millbrook** | Windmill farm · 80–110 u | Flat rolling plateau 6–8 u | 2–3 windmills on knolls | Patchwork fields, barn, haybales, pond, fences | Sheep, ducks | `#F5C84C` |
| **Emberpeak** | Volcano · 90–120 u | 35 u notched cone + steam plume | Glowing crater; hot spring | Black sand, basalt columns, vents | Capybaras in spring | `#FF7A5C` |
| **Palmlagoon** | Atoll · 70–100 u | 8–15 u land ring around a lagoon | Sunken ship in the lagoon | Palms, hammock, beach hut, tide pools | Turtles, crabs, fish, dolphins | `#7FD8B3` |
| **Mossgrove** | Forest · 80–110 u | 20 u green dome + 18 u giant tree | Treehouse with rope ladder | Pines, giant mushrooms, log cabin, stream | Foxes, squirrels, owl, fireflies | `#3E9A52` |
| **Lonely Palm** | Sandbar · 10–16 u | Flat sand oval, 0.6 u high | Single leaning palm | Message bottle, starfish, 1 rock | 1 crab, 1 gull | `#F7E1AE` |

## 5. Prop catalog

Tier = the first tier at which the prop appears.

**Vegetation**

| Prop | Recipe | Size | Tier |
|---|---|---|---|
| Palm | Curved trunk of 6 tapered cylinder rings (alternating `#A8754F`/`#8A5A3B`); 7 drooping 3-segment leaf fans; 2–3 coconuts | 5–7 u | T1 |
| Round tree | Trunk + 3–5 overlapping icospheres, ±15 % scale jitter | 4–6 u | T1 |
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
- Scale 0 → 1 on spring `k=180, c=12` (≈ 8 % overshoot, ~300 ms).
- Stagger 0–220 ms by hashed position, radiating outward from the screen centre.
- Grass and flowers use a 250 ms dither instead.
- At most 40 pops start per frame.

**Bloom-out:** 140 ms ease-in scale to 0, or a 200 ms dither.

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
| 8.5–10 | Settle at the T0 default (450 u, pitch 58°) with 2 % overshoot. Idle orbit starts at 0.6°/s. HUD buttons pop in, staggered 60 ms. |

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
| W6 | **Lagoon** | 4004 · T1 110 u, pitch 70° over Palmlagoon · 12:00 | Sunken hull readable through water; lagoon lighter than the outer ring; ≥ 1 turtle; land ring has ≤ 2 channel breaks |
| W7 | **Mill Morning** | 5005 · T2 90 u Millbrook · 06:45 | Blade angle differs between frames 0.5 s apart; ≥ 4 field colours; mist band below 6 u; ≥ 5 sheep |
| W8 | **Macro Shore** | 1001 · T3 18 u, Hearthholm beach · 14:00 | Foam line moves between frames 2 s apart; crab + ≥ 3 shells + grass tufts visible; during a 3 s dolly-in from 60 u, nothing appears without a bloom-in |
| W9 | **Lonely Palm** | any seed with it · T3 ≈ 40 u, look-down ≈ 9° toward the evening sun (D-017: 22° hides the horizon at FOV 35°) · 18:45 | Whole sandbar + ring in frame; palm silhouetted against the sky gradient; sun glint bloom on water; horizon blends into fog (no hard line) |
| W10 | **Rainy Grove** | 6006 · T1 120 u Mossgrove, rain · 13:00 | Ripples on water; treehouse windows lit; foliage saturation ≥ 40 %; sky not neutral grey |

**Global fail (any shot):**
- Land pixel with L < 12 %.
- Foam-line z-fighting.
- Any island without a visible shallow ring.
- Two same-type creatures animating in perfect sync.
