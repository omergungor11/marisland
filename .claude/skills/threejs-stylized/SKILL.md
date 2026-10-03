---
name: threejs-stylized
description: Use for any three.js work in Marisland — renderer setup, colour management, materials and shaders (terrain, props, water, sky, clouds), lights and shadows, procedural prop geometry, instancing, zoom-tier fades and bloom-in, post-processing, disposal and performance. Pinned to three r186 + WebGLRenderer + pmndrs postprocessing; lists the r186 API changes and the gotchas that make stylized scenes look wrong.
---

# Stylized three.js (r186, WebGL2)

Target look and numbers come from `mar-docs/ART_BIBLE.md`; system boundaries from
`mar-plans/ARCHITECTURE.md`. This skill is the *how-to* for the rendering side.

## Stack facts (verified 2026-10-03)

- `three@0.186.1` **pinned exactly**. `postprocessing@6.39.5` requires three `<0.187` — never bump
  three without checking the pmndrs peer range.
- **WebGLRenderer (WebGL2) only** (DECISIONS D-001). Do not import `three/webgpu` or `three/tsl`,
  and do not copy `webgpu_*` examples. All GLSL lives in `src/render/` so a later TSL port is
  contained.
- r186 changes old tutorials get wrong: `PCFSoftShadowMap` is **removed** (use `PCFShadowMap`);
  `THREE.Clock` is deprecated (we use `core/clock`); `PostProcessing` → `RenderPipeline` is a
  WebGPU-only rename and irrelevant here.
- When unsure about an API, check the r186 source/examples (GitHub tag `r186`) or context7 docs
  rather than memory.

## Renderer and colour

```ts
const renderer = new THREE.WebGLRenderer({
  antialias: !useComposer,                 // composer does its own AA
  powerPreference: 'high-performance',
  preserveDrawingBuffer: captureMode,      // needed for reliable screenshots
});
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = useComposer ? THREE.NoToneMapping : THREE.NeutralToneMapping;
renderer.shadowMap.enabled = quality !== 'low';
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.setPixelRatio(Math.min(window.devicePixelRatio, dprCap));
```

- **Tone mapping: Neutral** (keeps palette hues; ACES shifts them, AgX desaturates). With pmndrs:
  renderer `NoToneMapping`, composer `frameBufferType: THREE.HalfFloatType`, and
  `ToneMappingEffect({ mode: ToneMappingMode.NEUTRAL })` as the last colour effect. Never tone-map
  twice.
- **Palette → vertex colours:** `const c = new THREE.Color(hex)` is linear (ColorManagement is on);
  write `c.r, c.g, c.b` into the attribute. Never write raw sRGB bytes.
- **Data textures** (heightfield, SDF, masks, noise): `colorSpace = THREE.NoColorSpace`. Use R16F
  (`HalfFloatType` + `RedFormat`) — filterable in WebGL2 core; avoid relying on R32F linear
  filtering (extension, may be missing under SwiftShader).
- A custom `ShaderMaterial` drawn **outside** the composer must end with
  `#include <tonemapping_fragment>` and `#include <colorspace_fragment>`; inside the composer it
  outputs linear.

## Materials (D-003)

**Land and props: extend `MeshLambertMaterial`, don't rewrite lighting.** One factory
`makeLitMaterial(features)` builds `MeshLambertMaterial({ vertexColors: true })` and patches it
with `onBeforeCompile` (switch to `three-custom-shader-material` if string patching gets
fragile). This keeps three's lights, shadows, fog and instancing for free.

- Facets: non-indexed geometry (`toNonIndexed()` + `computeVertexNormals()`) or `flatShading`.
- Features that are no-ops without their attribute (`WIND`, `DITHER`, `EMISSIVE`, spin) are always
  compiled; look switches (`BLOOM_IN`, `RIM`) are per-material uniforms, so every lit material
  shares ONE program (`customProgramCacheKey`); prewarm it; stay within the program budget
  (≤ 12 / 20 / 24 by quality tier, D-010/D-016). Anything that changes three's program
  parameters (instancing, `instanceColor`, flatShading, `transparent`, a missing `normal`) is a
  new program even with the same key.
- Optional attributes that fall back to `defaultAttributeValues` need a fixed
  `layout(location = N)`: three sets the fallback only when it builds a VAO, and generic attribute
  values are context state — another program's default at the same location leaks in (D-016).
- Shadow casters that move in the vertex shader need a matching `mesh.customDepthMaterial` with the
  same patch, or their shadows won't sway/pop.
- **Warm light, cool shade via lights first:** warm sun (`#FFF6E5`, intensity per EnvState) +
  `HemisphereLight` with blue-violet sky / grass-tinted ground. In Lambert, shadowed areas get only
  the hemisphere term, so shade turns blue-violet naturally. Add an explicit shadow-tint injection
  only if the mask metric (shadow hue 220–280°, L ≥ 25 %) still fails.
- Inject in the vertex shader after `#include <begin_vertex>` (modify `transformed`). With
  instancing, the instance origin is `instanceMatrix[3].xyz` (use it for wind phase, fade distance
  and bloom-in). Verify chunk names against r186 `ShaderLib/meshlambert.glsl.js` before patching.
- **Dedicated `ShaderMaterial`s only for:** water, sky dome, clouds, particles/rain, contact blobs.
  Keep them few and isolated.

## Procedural geometry

- Build parts from primitives, colour each part's vertices, merge with
  `BufferGeometryUtils.mergeGeometries`. Pivot at the base, 1 u = 1 m.
- Segment counts per the bible: cylinders 8–12 radial, icospheres detail 1–2. Bevels via the
  `RoundedBoxGeometry` addon or `ExtrudeGeometry` bevel options.
- Seeded variation: scale ±15 %, per-face hue ±4° / lightness ±3 %, baked AO (darker at bases and
  creases) — all in vertex colours.
- One geometry per variant per LOD; never per instance.

## Instancing (D-004)

- `InstancedMesh` per (variant, LOD, island group); custom `InstancedBufferAttribute`s for
  `aSeed`, `aAppear`, `aTint`.
- After writing matrices: `mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere();`
  — stale bounds make instances vanish at certain angles. Grouping by island keeps frustum culling
  useful.
- Partial updates (click reactions): `attr.addUpdateRange(offset, count); attr.needsUpdate = true;`
- No `BatchedMesh` (no custom per-instance attributes; `WEBGL_multi_draw` uncertain on iOS).

## Zoom fades and bloom-in

- Fade per instance in the vertex shader: distance camera ↔ instance origin against the category's
  `fadeNear/fadeFar` uniforms → `vFade`; the fragment shader does ordered-dither discard
  (`if (vFade < bayer4(gl_FragCoord.xy)) discard;`). Opaque, no sorting, no overdraw.
- Bloom-in = closed-form underdamped spring from `t = uTime - aAppear` (mass 1, bible k/c):

```glsl
float springIn(float t, float k, float c) {
  if (t <= 0.0) return 0.0;
  float w0 = sqrt(k), z = c / (2.0 * w0), wd = w0 * sqrt(1.0 - z * z);
  float s = 1.0 - exp(-z * w0 * t) * (cos(wd * t) + (z * w0 / wd) * sin(wd * t));
  return t > 2.0 ? 1.0 : s;
}
```

  Keep a TS twin of every shader formula that the CPU also needs (spring, swell, gusts) and a parity
  test.

## Water

- Depth comes from the heightfield texture (not the depth buffer) → lagoon → deep colour ramp and
  alpha so shallow sand, the sunken ship and fish show through.
- Transparent **with `depthWrite: true`**, drawn after opaques (`renderOrder`), so fog, tilt-shift
  and DOF see the surface.
- Foam lives **inside** the water shader from the shore SDF: bands `sin(sdf * k - t * speed)` ×
  noise + a 0.4–0.8 u contact line. No separate foam mesh → no z-fighting.
- Swell: 2–3 summed sines/Gerstner waves from `shared/fields` with a GLSL twin; CPU boats sample
  the same function.
- Glints: thresholded noise × specular, output > 1.0 so bloom picks them up.
- Caustics belong to the terrain material below y = 0 (scrolling, pre-generated tileable pattern).

## Shadows

- One `DirectionalLight`. Each frame fit its orthographic camera to the view frustum ∩ slab
  y ∈ [−2, 40] in light space and snap to texel size (prevents shimmering while panning).
- Start with `shadow.bias ≈ -0.0005`, `shadow.normalBias ≈ 0.02–0.05`, then tune with shots:
  stripes = acne (more bias), floating objects = peter-panning (less).
- Instanced contact blobs under grounded props on every tier; the only shadows on low.

## Post-processing (pmndrs)

Order: Bloom (`luminanceThreshold ≈ 0.9`, `mipmapBlur`) → TiltShift (per tier) → DOF (high/photo)
→ grade (HueSaturation / BrightnessContrast) → Vignette → ToneMapping(NEUTRAL) → SMAA or FXAA.
Merge compatible effects into one `EffectPass`; pmndrs throws if two convolution effects share a
pass — split them as the error says. Low quality: no composer.

## Performance habits

- Zero allocations in per-frame code; module-level scratch `Vector3`/`Matrix4`.
- Shared materials; environment uniforms are shared objects referenced by every material (one write
  per frame).
- `await renderer.compileAsync(scene, camera)` before signalling ready.
- Counts, not fps: `renderer.info.render.calls/triangles`, `renderer.info.programs.length`,
  `renderer.info.memory`. With multiple passes set `renderer.info.autoReset = false` and call
  `renderer.info.reset()` once at frame start.
- Every geometry/material/texture/render target registered in a scope and disposed on regen.

## Gotchas

1. Washed-out frame → colour space or double tone mapping (see above).
2. Instances vanish at angles → bounding sphere not recomputed.
3. Swaying trees with static shadows → missing `customDepthMaterial`.
4. Shoreline flicker → foam as a separate coplanar mesh; move it into the water shader.
5. Program count explodes → features as runtime branches or uncached variants; use defines +
   `customProgramCacheKey`.
6. First-frame hitch → shaders compiled lazily; use `compileAsync`.
7. Blurry or soft UI text in screenshots → canvas DPR vs CSS size mismatch.
8. Hard horizon line → fog colour ≠ horizon colour, or the water grid ends inside the view.
9. Black canvas in Playwright → read console; check the renderer string mentions SwiftShader.
10. `Math.random` inside render code breaks pixel determinism — use seeded hashes.
