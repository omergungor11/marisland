import * as THREE from 'three';
import type { Quality } from '../../core/params.ts';
import type { WorldData } from '../../world/types.ts';
import { heightAt, Zone } from '../../world/types.ts';
import { CRATER_GLOW, TERRAIN_COLORS, TERRAIN_FX, TERRAIN_MASK } from '../../content/terrain.ts';
import { SHARED } from '../uniforms.ts';
import type { WorldTextures } from '../world-textures.ts';
import { CLOUD_SHADOW_GLSL } from '../shaders/chunks/cloud-shadow.glsl.ts';
import { NIGHT_GLSL, POOL_GAIN } from '../shaders/chunks/night.glsl.ts';
import { MIST_GLSL } from '../shaders/chunks/mist.glsl.ts';
import { BRUSH_RING } from '../../content/edit-ui.ts';

/**
 * Editor brush ring (TASK-212), shared by every terrain material like `HOVER_UNIFORMS`:
 * `uBrush` = (centre x, centre z, radius, w) with w = 0 hidden, w > 0 strength (valid),
 * w < 0 invalid (|w| = strength). Written by `edit/cursor.ts`; reset with the world.
 */
export const BRUSH_UNIFORMS = {
  uBrush: { value: new THREE.Vector4(0, 0, 0, 0) },
  uBrushCol: { value: new THREE.Color(BRUSH_RING.color).multiplyScalar(BRUSH_RING.brightness) },
  uBrushBad: { value: new THREE.Color(BRUSH_RING.invalid).multiplyScalar(BRUSH_RING.brightness) },
};

/**
 * Terrain material (D-003): MeshLambertMaterial + vertex colours, patched with
 * onBeforeCompile for
 *  (a) the semantic debug mask (SHARED.uDebugMask) — flat unlit zone colours,
 *  (b) a subtle fresnel rim × horizon colour on grazing land faces (ART_BIBLE §3),
 *  (c) scrolling caustics below y = 0 (define MAR_CAUSTICS; off on low quality),
 *  (d) the wet-sand shore lap (SDF band, 4.5 s period) that the water foam matches,
 *  (f) lantern pools at night (TASK-171, chunks/night.glsl.ts): additive warm light × albedo,
 *  (g) the low weather mist band after three's fog (TASK-172, chunks/mist.glsl.ts),
 *  (h) the Emberpeak crater glow (D5, content CRATER_GLOW): emissive, brightest on the floor,
 *  (i) the editor brush ring (TASK-212, `BRUSH_UNIFORMS`): off (`uBrush.w == 0`) → no-op.
 * One program per quality level; all chunks share one material instance.
 */
export interface TerrainMaterial {
  material: THREE.MeshLambertMaterial;
  uniforms: Record<string, THREE.IUniform>;
}

export function createTerrainMaterial(
  world: WorldData,
  textures: WorldTextures,
  quality: Quality,
): TerrainMaterial {
  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  const h = world.height;
  // crater glow (D5): xy = crater centre, z = floor y, w = rim y (w <= z → off)
  const crater = new THREE.Vector4(0, 0, 0, 0);
  for (const isl of world.islands) {
    const cr = isl.anchors.crater;
    if (isl.archetype !== 'emberpeak' || !cr) continue;
    const floor = heightAt(h, cr.x, cr.z);
    crater.set(cr.x, cr.z, floor, Math.max(floor + 1, isl.peakY));
  }
  const uniforms: Record<string, THREE.IUniform> = {
    uTime: SHARED.uTime,
    uHorizon: SHARED.uHorizon,
    uDebugMask: SHARED.uDebugMask,
    uCloudShadow: SHARED.uCloudShadow,
    uCloudSun: SHARED.uCloudSun,
    uCloudSeed: SHARED.uCloudSeed,
    uCloudCover: SHARED.uCloudCover,
    uLamps: SHARED.uLamps,
    uPoolTex: SHARED.uPoolTex,
    uPoolMap: SHARED.uPoolMap,
    uPoolColor: SHARED.uPoolColor,
    uMist: SHARED.uMist,
    uMistColor: SHARED.uMistColor,
    uMistMax: SHARED.uMistMax,
    uTerrainSdf: { value: textures.sdf },
    uTerrainZone: { value: textures.zone },
    // xy = origin, z = 1 / cellSize, w = samples per side (texel-centre mapping)
    uTerrainGrid: { value: new THREE.Vector4(h.originX, h.originZ, 1 / h.cellSize, h.n) },
    uNight: SHARED.uNight,
    uCrater: { value: crater },
    uCraterColor: { value: new THREE.Color(CRATER_GLOW.color) },
    uSandWet: { value: new THREE.Color(TERRAIN_COLORS.sandWet) },
    uMaskLand: { value: new THREE.Color(TERRAIN_MASK.land) },
    uMaskWet: { value: new THREE.Color(TERRAIN_MASK.wetSand) },
    uMaskRock: { value: new THREE.Color(TERRAIN_MASK.rock) },
    uMaskSeabed: { value: new THREE.Color(TERRAIN_MASK.seabed) },
    uBrush: BRUSH_UNIFORMS.uBrush,
    uBrushCol: BRUSH_UNIFORMS.uBrushCol,
    uBrushBad: BRUSH_UNIFORMS.uBrushBad,
  };
  const caustics = quality !== 'low';
  const f = (v: number): string => v.toFixed(4);
  const F = TERRAIN_FX;

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.defines = shader.defines ?? {};
    if (caustics) shader.defines.MAR_CAUSTICS = '';

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vMarWorld;')
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\n\tvMarWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;',
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
varying vec3 vMarWorld;
uniform float uTime;
uniform float uDebugMask;
uniform vec3 uHorizon;
uniform vec3 uSandWet;
uniform float uNight;
uniform vec4 uCrater;
uniform vec3 uCraterColor;
uniform vec3 uMaskLand, uMaskWet, uMaskRock, uMaskSeabed;
uniform sampler2D uTerrainSdf;
uniform sampler2D uTerrainZone;
uniform vec4 uTerrainGrid;
uniform vec4 uBrush;
uniform vec3 uBrushCol;
uniform vec3 uBrushBad;
${CLOUD_SHADOW_GLSL}
${NIGHT_GLSL}
${MIST_GLSL}
vec2 marTerrainUv(vec2 xz) {
  return ((xz - uTerrainGrid.xy) * uTerrainGrid.z + 0.5) / uTerrainGrid.w;
}
float marCaustic(vec2 p, float t) {
  vec2 q = p * 0.42;
  float a = sin(q.x + 1.7 * sin(q.y * 0.9 + t * 0.9)) * sin(q.y * 1.1 + 1.5 * sin(q.x * 0.8 - t * 0.7));
  vec2 r = p * 0.61 + vec2(13.1, 7.7);
  float b = sin(r.x * 0.9 - 1.6 * sin(r.y * 1.2 - t * 0.8)) * sin(r.y + 1.4 * sin(r.x * 1.1 + t * 1.1));
  float c = 1.0 - abs(a + b) * 0.5;
  return smoothstep(0.72, 0.98, c);
}`,
      )
      .replace(
        '#include <color_fragment>',
        /* glsl */ `#include <color_fragment>
  vec2 marUv = marTerrainUv(vMarWorld.xz);
  float marZone = floor(texture2D(uTerrainZone, marUv).r * 255.0 + 0.5);
  {
    // (d) wet-sand lap: the wet edge advances ${f(F.lapAdvance)} u with the 4.5 s lap
    float sdf = texture2D(uTerrainSdf, marUv).r;
    float lap = 0.5 + 0.5 * sin(uTime * ${f((2 * Math.PI) / F.lapPeriod)});
    float reach = ${f(F.lapBand - F.lapAdvance)} + ${f(F.lapAdvance)} * lap;
    float wet = (1.0 - smoothstep(reach - 0.25, reach + 0.1, sdf)) * step(0.0, vMarWorld.y);
    if (marZone == ${Zone.sandBlack}.0) diffuseColor.rgb *= 1.0 - 0.18 * wet;
    else if (marZone == ${Zone.sandWet}.0 || marZone == ${Zone.sandDry}.0)
      diffuseColor.rgb = mix(diffuseColor.rgb, uSandWet * 0.9, wet * ${f(F.lapWetMix)});
  }
#ifdef MAR_CAUSTICS
  if (vMarWorld.y < 0.0) {
    float depthFade = smoothstep(0.0, 0.6, -vMarWorld.y) * (1.0 - smoothstep(4.0, ${f(F.causticDepth)}, -vMarWorld.y));
    float cst = marCaustic(vMarWorld.xz, uTime) + 0.6 * marCaustic(vMarWorld.zx * 1.37 + 31.0, uTime * 1.3);
    diffuseColor.rgb *= 1.0 + ${f(F.caustic)} * min(cst, 1.4) * depthFade;
  }
#endif`,
      )
      .replace(
        '#include <aomap_fragment>',
        /* glsl */ `#include <aomap_fragment>
  {
    // (b) fresnel rim on grazing land faces (silhouettes separate from the water)
    float ndv = clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
    float rim = pow(1.0 - ndv, ${f(F.rimPower)}) * step(0.0, vMarWorld.y);
    totalEmissiveRadiance += uHorizon * ${f(F.rim)} * rim;
  }
  if (uCrater.w > uCrater.z) {
    // (h) crater glow (D5): warm emissive walls, brightest on the floor, pulsing 0.7–1.0
    float cd = length(vMarWorld.xz - uCrater.xy);
    float cm = (1.0 - smoothstep(${f(CRATER_GLOW.radius * 0.55)}, ${f(CRATER_GLOW.radius)}, cd))
             * (1.0 - smoothstep(uCrater.z, uCrater.w, vMarWorld.y));
    if (cm > 0.0) {
      float pulse = ${f((CRATER_GLOW.pulse[0] + CRATER_GLOW.pulse[1]) / 2)} + ${f((CRATER_GLOW.pulse[1] - CRATER_GLOW.pulse[0]) / 2)} * sin(uTime * ${f((2 * Math.PI) / CRATER_GLOW.period)});
      totalEmissiveRadiance += uCraterColor * (cm * cm * pulse * (${f(CRATER_GLOW.day)} + ${f(CRATER_GLOW.night)} * uNight) * (1.0 - uDebugMask));
    }
  }`,
      )
      .replace(
        '#include <opaque_fragment>',
        // (e) cloud shadows (TASK-153): same field as the clouds, ×0.82 with a 6 u soft edge
        /* glsl */ `	outgoingLight *= marCloudShadowMul(vMarWorld.xz, uDebugMask);
  {
    // (f) lantern pools: warm additive light on the ground around lanterns / doors / stalls
    vec2 marPl = marPool(vMarWorld.xz);
    if (marPl.x > 0.0) {
      float marNear = 1.0 - smoothstep(${POOL_GAIN.fade0}, ${POOL_GAIN.fade1}, abs(vMarWorld.y - marPl.y));
      // D14: the pool follows the ground facets (world normal from three's view-space normal)
      float marFacet = marPoolFacet(vMarWorld.xz, marPl.x, normalize((vec4(normal, 0.0) * viewMatrix).xyz));
      outgoingLight += diffuseColor.rgb * uPoolColor
        * (marPl.x * marNear * marFacet * ${POOL_GAIN.ground} * marPoolFlicker(vMarWorld.xz, uTime));
    }
  }
  if (uBrush.w != 0.0) {
    // (i) editor brush: a soft ~1-cell band at the radius over a faint fill (never < 1.5 px;
    // thinner on small rings so a prop footprint still reads as a ring)
    float marBd = length(vMarWorld.xz - uBrush.xy);
    float marBw = max(min(${f(BRUSH_RING.widthCells)} / uTerrainGrid.z, ${f(BRUSH_RING.maxWidthOfRadius)} * uBrush.z), 1.5 * fwidth(marBd));
    float marRing = 1.0 - smoothstep(0.3 * marBw, 0.6 * marBw, abs(marBd - uBrush.z));
    float marFill = (1.0 - smoothstep(uBrush.z - 0.6 * marBw, uBrush.z - 0.3 * marBw, marBd)) * ${f(BRUSH_RING.fill)};
    float marBa = max(marRing * mix(${f(BRUSH_RING.alpha[0])}, ${f(BRUSH_RING.alpha[1])}, clamp(abs(uBrush.w), 0.0, 1.0)), marFill);
    // soft darker rim either side of the band: reads on pale sand as well as on grass
    float marEdge = max(1.0 - smoothstep(0.6 * marBw, 1.1 * marBw, abs(marBd - uBrush.z)) - marRing, 0.0);
    outgoingLight *= 1.0 - ${f(BRUSH_RING.outline)} * marEdge;
    outgoingLight = mix(outgoingLight, uBrush.w < 0.0 ? uBrushBad : uBrushCol, marBa);
  }
#include <opaque_fragment>`,
      )
      .replace(
        '#include <fog_fragment>',
        /* glsl */ `#include <fog_fragment>
#ifdef USE_FOG
  if (uMist.x > 0.0) {
    // (g) low mist band, same (output) colour space as three's fogColor
    float marMi = marMist(vMarWorld, cameraPosition);
    gl_FragColor.rgb = mix(gl_FragColor.rgb, linearToOutputTexel(vec4(uMistColor, 1.0)).rgb, marMi);
  }
#endif`,
      )
      .replace(
        '#include <dithering_fragment>',
        /* glsl */ `#include <dithering_fragment>
  if (uDebugMask > 0.5) {
    // (a) semantic mask: flat unlit colours, no fog / tone mapping
    vec3 m = uMaskLand;
    if (vMarWorld.y < 0.0) m = uMaskSeabed;
    else if (marZone == ${Zone.sandWet}.0) m = uMaskWet;
    else if (marZone == ${Zone.rock}.0 || marZone == ${Zone.cliff}.0) m = uMaskRock;
    gl_FragColor = vec4(m, 1.0);
    #include <colorspace_fragment>
  }`,
      );
  };
  material.customProgramCacheKey = () => `mar-terrain-v1-${caustics ? 'c' : 'n'}`;
  return { material, uniforms };
}
