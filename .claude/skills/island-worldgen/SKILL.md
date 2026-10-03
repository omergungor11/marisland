---
name: island-worldgen
description: Use when generating or changing Marisland's world data — archipelago layout, island heightfields, coastlines and shallow shelves, biomes, landmark/village/dock placement, paths, prop scatter, seeds. Covers the noise recipes that make land read as islands, placement rules, determinism and the tests that lock it.
---

# Island world generation

World data is **pure data** (typed arrays + plain objects); rendering derives from it. Phase 2
will let the user edit it, so it must be chunk-rebuildable and serialisable. Island themes, prop
lists and zoom tiers come from `mar-docs/ART_BIBLE.md` and live in config tables, not in code.

## Pipeline

```
seed
 → layout          island centres, radii, themes, channels
 → heightfield     per island: mask × elevation × theme shaping, shallow shelf, sea floor
 → masks           slope, coast distance, moisture, biome id per cell
 → POIs            landmark, village centre, dock, beach spots  (+ flatten terrain under them)
 → paths           A* with slope cost, carved slightly, stored as polylines
 → scatter         Poisson disk per prop class, filtered by rule table, clustered by noise
 → spawns          creature anchors (nests, docks, reefs, meadows)
 → serialise
```

## Seeds

- Small fast PRNG (`mulberry32` / `sfc32`) + seedable simplex noise (pass the PRNG into
  `createNoise2D`).
- **Sub-seed per system and island:** `rngFor(seed, 'island', i, 'scatter')`. Changing one system
  must not reshuffle any other — adding a new prop class must not move existing trees.
- No `Math.random`, no `Date`, no iteration over containers whose order depends on timing.

## Layout

- Island count 5–7 with a clear size hierarchy: 1 hero (largest), 2–3 medium, 1–2 small, 1 tiny
  sandbar. Exact sizes/world extent: `mar-plans/ARCHITECTURE.md`.
- Rejection sampling with `minDist = r1 + r2 + channel` (channel 12–30 u) so boats have
  navigable water and the cluster still reads as *one* archipelago; bias toward the centre.
- Themes are assigned by size/role from the art bible roster, each used once.
- Verify the overview camera frames all islands with margin.

## The "reads as an island" recipe

1. **Mask with an irregular coast:** warped radial distance
   `d = length((p - c) / r + warp(p) * 0.25)`, `mask = 1 - smoothstep(0.55, 1.0, d)`.
   Domain-warp with low-frequency noise; add 1–3 secondary lobes for bays and peninsulas.
   Never a perfect circle.
2. **Elevation:** `h = mask * pow(fbm(p * f) * 0.5 + 0.5, 1.3) * peak` (4–5 octaves, low base
   frequency — high frequency looks pimply). Then theme shaping: volcano = subtract a gaussian
   for the crater; mesa = soft terrace quantisation; atoll = ring mask; sandbar = max ≈ 1 u.
3. **Shallow shelf (critical for the turquoise ring):** underwater terrain eases from 0 to about
   −1.5 u over a 6–14 u shelf, then drops to −8…−15 u. Depth-based water colour only works if
   real shallow geometry exists. Make the shelf wider on the sheltered side.
4. **Beach band:** 0–1.2 u above sea level with a gentle slope. **Cliffs** by slope threshold or
   theme rule (e.g. windward faces); a heightfield cannot overhang, so dress cliffs with rock
   props / skirt meshes.
5. **Terraces (cute stepped look), sparingly:** `floor(h / step) * step` blended with a
   smoothstep for soft edges.
6. **Optional thermal erosion,** 2–5 iterations on the grid, for believable slopes.

Store heightfields as `Float32Array` + width/height/cellSize/origin with `heightAt(x, z)`
(bilinear), `normalAt`, `slopeAt`. Biome ids as `Uint8Array`. Colours are applied in the render
layer from the palette, never baked in worldgen.

## POIs

- **Landmark** at a theme-specific spot (lighthouse: highest coastal point facing open sea;
  windmill: gentle hilltop; volcano: centre).
- **Village** on the flattest large area near the coast; **dock** on the sheltered side (facing
  other islands) and must touch water deeper than the boat draft.
- **Flatten** a plateau with smooth falloff under every building, in the heightfield itself.

## Paths

A* on the grid with slope cost: village ↔ landmark ↔ beach. Carve a slight depression and store
the polyline so props (stepping stones, fences, lanterns) can follow it and scatter can avoid it.

## Scatter

Bridson Poisson disk per prop class, then a rule table:

```ts
interface ScatterRule {
  kind: PropKind; biomes: BiomeId[];
  height: [number, number]; slopeMax: number; coastDist: [number, number];
  radius: number; density: number;        // 0–1 acceptance
  cluster?: { freq: number; threshold: number }; // low-freq noise → groves, meadows
  avoid?: ('path' | 'building' | 'dock')[]; tier: ZoomTier;
}
```

Clustering by low-frequency noise threshold is what makes groves and meadows instead of uniform
sprinkle. Each placed prop: stable `id`, `kind`, position, `rotY`, scale ±15 %, `variantSeed`,
`tier`.

## Tests (Vitest)

- Snapshot for seeds `[1, 42, 1337]`: hash of the heightfield (rounded to 1e-4) + prop counts by
  kind.
- Invariants: islands don't overlap; every island has beach cells; buildings sit on flattened
  ground; no land props below sea level (except underwater kinds); every dock touches water;
  same seed twice → identical output.
- Budget: whole world < ~1.5 s on desktop. If a stage exceeds ~300 ms, move generation into a Web
  Worker and transfer typed arrays.

## Debug

`?debug=height|biome|slope|coast|props` colours the terrain by that channel, and a fast 2D
minimap canvas of the layout is useful for quick CI screenshots without full 3D rendering.

## Phase 2 readiness

Heightfield split into chunks with a dirty list; brush ops (`raise`, `lower`, `smooth`, `paint`)
touch chunks; props have stable ids and can be added/removed; world serialises to JSON with
base64 typed arrays.
