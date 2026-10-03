# Research notes (2026-10-03)

Condensed from the planning research. Decisions derived from it are in `DECISIONS.md`; how-to in
`.claude/skills/threejs-stylized/SKILL.md`. Verify anything version-sensitive before relying on it.

## Headless rendering
- Playwright 1.63 (Chromium 153) appends `--enable-unsafe-swiftshader`; WebGL2 works headless out
  of the box. Chromium ≥ 137 dropped automatic SwiftShader fallback for manually launched Chrome.
  ([playwright chromium.ts](https://github.com/microsoft/playwright/blob/main/packages/playwright-core/src/server/chromium/chromium.ts),
  [Chromium SwiftShader doc](https://chromium.googlesource.com/chromium/src/+/main/docs/gpu/swiftshader.md))
- SwiftShader is slow (≈ 4× slower than llvmpipe via `--use-angle=gl` in one report — switching
  rasterizers changes baselines). ([microlink](https://microlink.io/blog/webgl-without-a-gpu))
- Headless WebGPU needs mesa Vulkan (lavapipe) + Xvfb + headed Chrome (three.js's own CI); default
  `headless: true` uses `chromium-headless-shell`. Not used in Phase 1.
- three.js determinism helper worth copying ideas from:
  [deterministic-injection.js](https://github.com/mrdoob/three.js/blob/r186/test/e2e/deterministic-injection.js).

## Water
- Bake a coast-distance field; sine foam bands from the shore, noise-broken; thin bands in coves —
  [hex-map-wfc article](https://felixturner.github.io/hex-map-wfc/article/).
- Toon water / depth foam: [Tuts+ toon water](https://code.tutsplus.com/creating-toon-water-for-the-web-part-2--cms-30485t),
  [Roystan](https://roystan.net/articles/toon-water/), [Ameye](https://ameye.dev/notes/stylized-water-shader/).
- Gerstner math: [sbcode](https://sbcode.net/tsl/gerstner-water). Caustics:
  [Maxime Heckel](https://blog.maximeheckel.com/posts/caustics-in-webgl),
  [Evan Wallace](https://madebyevan.com/webgl-water/).

## Terrain, vegetation, AO
- Islands from noise: [Red Blob terrain-from-noise](https://www.redblobgames.com/maps/terrain-from-noise/#islands),
  [mapgen4](https://www.redblobgames.com/maps/mapgen4/),
  [polygon map generation](http://www-cs-students.stanford.edu/~amitp/game-programming/polygon-map-generation/).
- Vertex AO: [0fps](https://0fps.net/2013/07/03/ambient-occlusion-for-minecraft-like-worlds/).
- Grass/wind: [al-ro grass](https://al-ro.github.io/projects/grass/),
  [Codrops fluffy grass](https://tympanus.net/codrops/?p=83092). Rough budget (unsourced):
  desktop 150–300k blades at 3–7 tris, mobile 30–60k; use clumps rather than single blades.

## Detail / LOD
- Key tiers to camera-target distance, drive one detail uniform; scale-in in the vertex shader
  beats alpha blending. Call `computeBoundingSphere()` after moving instances.
- Large-instance reference: [webgl_batch_lod_bvh](https://github.com/mrdoob/three.js/blob/r186/examples/webgl_batch_lod_bvh.html).

## Look & feel
- Neutral tone mapping preserves palette hues ([Khronos PBR Neutral](https://github.com/KhronosGroup/ToneMapping/tree/main/PBR_Neutral));
  ACES shifts hues, AgX desaturates.
- pmndrs: renderer `NoToneMapping`, HalfFloat buffers, `ToneMappingEffect` last
  ([README](https://github.com/pmndrs/postprocessing)).
- Day cycle reference: Bruno Simon [folio-2025](https://github.com/brunosimon/folio-2025)
  (`DayCycles.js`, camera-controls, grass, wind — WebGPU/TSL, so read for ideas, don't copy code).

## Inspiration (closest first)
1. [hex-map-wfc](https://github.com/felixturner/hex-map-wfc) (MIT) — tilt-shift, fitted shadows, coast-mask waves
2. [folio-2025](https://github.com/brunosimon/folio-2025) (MIT) — game structure, wind, day cycle
3. [al-ro grass](https://al-ro.github.io/projects/grass/) — instanced blades + wind
4. [Townscaper write-up](https://www.gamedeveloper.com/game-platforms/how-townscaper-works-a-story-four-games-in-the-making),
   [Bad North WFC dioramas](https://80.lv/articles/using-wave-function-collapse-algorithm-for-dioramas/)
5. [Three.js Journey Raging Sea](https://threejs-journey.com/lessons/raging-sea) — wave shader basics
