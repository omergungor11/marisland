import * as THREE from 'three';
import type { Quality } from '../../core/params.ts';
import type { WorldData } from '../../world/types.ts';
import { heightAt, Zone } from '../../world/types.ts';
import {
  CRATER_GLOW,
  TERRAIN_COLORS,
  TERRAIN_FX,
  TERRAIN_MASK,
  TERRAIN_SHAPE,
} from '../../content/terrain.ts';
import {
  DETAIL_LAYER_IDS,
  DETAIL_LAYERS,
  GROUND_DETAIL,
  GROUND_STRATA,
} from '../../content/ground.ts';
import { PALETTE_SCALE, PALETTE_TEXELS, PATTERN_LAYERS } from './terrain-colors.ts';
import { groundDetailData } from './ground-detail.ts';
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
  // No vertex colours (M14b contract): colour comes from the albedo / palette textures.
  const material = new THREE.MeshLambertMaterial();
  if (!textures.albedo || !textures.palette || !textures.groundDetail)
    throw new Error('terrain material needs the TASK-372 world textures');
  const detail = quality !== 'low';
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
    uAlbedo: { value: textures.albedo },
    uPalette: { value: textures.palette },
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
  if (detail) {
    const meanA = groundDetailData().meanA;
    uniforms.uDetail = { value: textures.groundDetail() };
    uniforms.uGLayer = {
      value: DETAIL_LAYER_IDS.map((id) => {
        const L = DETAIL_LAYERS[id];
        return new THREE.Vector4(1 / L.tile, L.amplitude, L.normal, L.accent ?? 0);
      }),
    };
    uniforms.uGLayer2 = {
      value: DETAIL_LAYER_IDS.map((id, l) => {
        // non-pattern layers are rotated off-axis so their repeats do not line up with the grid
        const pattern = PATTERN_LAYERS.includes(id);
        const a = pattern ? 0 : 0.47 + 1.13 * l;
        return new THREE.Vector4(meanA[l], pattern ? 1 : 0, Math.cos(a), Math.sin(a));
      }),
    };
  }
  const f = (v: number): string => v.toFixed(4);
  const F = TERRAIN_FX;

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.defines = shader.defines ?? {};
    if (caustics) shader.defines.MAR_CAUSTICS = '';
    if (detail) shader.defines.MAR_DETAIL = '';

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
${groundGlsl()}
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
${GROUND_COLOR_GLSL}
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
        '#include <normal_fragment_maps>',
        /* glsl */ `#include <normal_fragment_maps>
  if (dot(marNP, marNP) > 0.0) {
    // detail normals: world tilt (tangent part only) → view space
    vec3 marT = marNP - marWN * dot(marNP, marWN);
    normal = normalize(normal + (viewMatrix * vec4(marT, 0.0)).xyz);
  }`,
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
  // reachable for the GPU-memory walk (the patched uniforms otherwise live only in this closure)
  material.userData.uniforms = uniforms;
  material.customProgramCacheKey = () =>
    `mar-terrain-v2-${caustics ? 'c' : 'n'}${detail ? 'd' : ''}`;
  return { material, uniforms };
}

const g = (v: number): string => v.toFixed(5);
const GD = GROUND_DETAIL;
const LAYERS = DETAIL_LAYER_IDS.length;

/**
 * Ground pars (TASK-372, D-030): hash / value noise for organic zone borders and accent patches,
 * palette access and cliff strata; with MAR_DETAIL the detail-layer sampler and the per-material
 * evaluation (≤ 2 layers for the primary material, its first layer triplanar on steep ground; 1
 * layer for the border material). Every texture read in a branch uses textureGrad / texelFetch
 * with derivatives taken in uniform control flow.
 */
function groundGlsl(): string {
  const P = PALETTE_SCALE;
  return /* glsl */ `
uniform sampler2D uAlbedo;
uniform sampler2D uPalette;
float marHash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float marVNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(marHash12(i), marHash12(i + vec2(1.0, 0.0)), f.x),
             mix(marHash12(i + vec2(0.0, 1.0)), marHash12(i + vec2(1.0, 1.0)), f.x), f.y);
}
vec3 marSrgbDecode(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));
}
ivec2 marTexel(ivec2 t) {
  int m = int(uTerrainGrid.w) - 1;
  return clamp(t, ivec2(0), ivec2(m));
}
vec4 marPal(float zone, float isl, int c) {
  return texelFetch(uPalette, ivec2(int(zone) * ${PALETTE_TEXELS} + c, int(isl)), 0);
}
/** Strata band in [−1, 1]; aa = band-function change per pixel (bands fade to 0 when dense). */
float marStrata(vec3 p, float halfPeriod, float wob, float aa) {
  float w = wob * (${g(TERRAIN_SHAPE.strataWobble)} * sin(p.x * 0.07 + p.z * 0.05) + 0.3 * sin(p.z * 0.13 - p.x * 0.04));
  float s = sin(3.14159265 * (p.y + w) / halfPeriod);
  return clamp(s / max(aa, 0.3), -1.0, 1.0) * (1.0 - smoothstep(0.6, 1.6, aa));
}
#ifdef MAR_DETAIL
uniform sampler2DArray uDetail;
uniform vec4 uGLayer[${LAYERS}];
uniform vec4 uGLayer2[${LAYERS}];
mat2 marLayerRot(int l) {
  vec4 b = uGLayer2[l];
  return mat2(b.z, b.w, -b.w, b.z);
}
vec4 marLayerTex(int l, vec2 p, vec2 gx, vec2 gy, float ps) {
  float inv = uGLayer[l].x / (uGLayer2[l].y > 0.5 ? ps : 1.0);
  mat2 R = marLayerRot(l);
  return textureGrad(uDetail, vec3(R * p * inv, float(l)), R * gx * inv, R * gy * inv);
}
/** Detail tilt of texel s in the plane's (u, v) axes (undo the layer rotation). */
vec2 marTilt(int l, vec4 s) {
  return (s.gb * 2.0 - 1.0) * marLayerRot(l) * uGLayer[l].z;
}
void marApply(int l, vec4 s, float amp, vec3 acc, inout vec3 col) {
  vec4 a = uGLayer[l];
  col *= 1.0 + a.y * amp * (s.r * 2.0 - 1.0);
  // accent: mean-compensated pull toward the accent colour (flowers, grout, leaves, lichen)
  col += a.w * amp * (s.a - uGLayer2[l].x) * (acc - col);
}
/**
 * One ground material on top of col: p0 / p1 = palette texels 0 / 1, acc = accent colour,
 * primary = full evaluation (2 layers, triplanar first layer) else first layer on flat ground.
 * Adds the world-space normal tilt to np.
 */
vec3 marMaterial(vec4 p0, vec4 p1, vec3 acc, vec3 col, vec3 wp, vec3 wn, vec3 dpx, vec3 dpy,
                 float fade, bool primary, inout vec3 np) {
  float amp = fade * p0.b * ${g(255 / P.amp)};
  float ps = max(p1.r * ${g(255 / P.pattern)}, 0.05);
  float flatW = smoothstep(${g(GD.steep[0])}, ${g(GD.steep[1])}, abs(wn.y));
  int l0 = int(p0.r * 255.0 + 0.5);
  int l1 = int(p0.g * 255.0 + 0.5);
  if (l0 < ${LAYERS}) {
    if (primary && flatW < 0.999) {
      // triplanar: top plane by flatness, the sides by |n.x|^4 : |n.z|^4; side planes squash v
      // (world y) so plates / cracks read as horizontal layers on cliffs
      const vec2 marSq = vec2(1.0, 2.2);
      vec2 sw = pow(abs(wn.xz) + 1e-4, vec2(4.0));
      sw = sw / (sw.x + sw.y) * (1.0 - flatW);
      vec4 s = vec4(0.0);
      vec3 t = vec3(0.0);
      float ws = 0.0;
      if (flatW > 0.01) {
        vec4 sy = marLayerTex(l0, wp.xz, dpx.xz, dpy.xz, ps);
        vec2 ty = marTilt(l0, sy);
        s += sy * flatW;
        t += vec3(ty.x, 0.0, ty.y) * flatW;
        ws += flatW;
      }
      if (sw.x > 0.01) {
        vec4 sx = marLayerTex(l0, wp.zy * marSq, dpx.zy * marSq, dpy.zy * marSq, ps);
        vec2 tx = marTilt(l0, sx);
        s += sx * sw.x;
        t += vec3(0.0, tx.y, tx.x) * sw.x;
        ws += sw.x;
      }
      if (sw.y > 0.01) {
        vec4 sz = marLayerTex(l0, wp.xy * marSq, dpx.xy * marSq, dpy.xy * marSq, ps);
        vec2 tz = marTilt(l0, sz);
        s += sz * sw.y;
        t += vec3(tz.x, tz.y, 0.0) * sw.y;
        ws += sw.y;
      }
      s /= max(ws, 1e-4);
      marApply(l0, s, amp, acc, col);
      np += t / max(ws, 1e-4) * amp;
    } else {
      float a0 = amp * (primary ? 1.0 : flatW);
      vec4 s = marLayerTex(l0, wp.xz, dpx.xz, dpy.xz, ps);
      marApply(l0, s, a0, acc, col);
      vec2 t = marTilt(l0, s);
      np += vec3(t.x, 0.0, t.y) * a0;
    }
  }
  if (primary && l1 < ${LAYERS} && flatW > 0.0) {
    float a1 = amp * flatW * p1.g * ${g(255 / P.amp)};
    vec4 s = marLayerTex(l1, wp.xz, dpx.xz, dpy.xz, ps);
    marApply(l1, s, a1, acc, col);
    vec2 t = marTilt(l1, s);
    np += vec3(t.x, 0.0, t.y) * a1;
  }
  return col;
}
#endif
`;
}

/** Ground colour (TASK-372): albedo → (near) crisp noisy zone borders + detail → strata. */
const GROUND_COLOR_GLSL = /* glsl */ `
  vec3 marDPx = dFdx(vMarWorld);
  vec3 marDPy = dFdy(vMarWorld);
  // grid cells per pixel (border antialiasing) and world-y change per pixel (strata)
  float marGw = max(length(vec2(marDPx.x, marDPy.x)), length(vec2(marDPx.z, marDPy.z))) * uTerrainGrid.z;
  float marYw = abs(marDPx.y) + abs(marDPy.y);
  vec2 marG = (vMarWorld.xz - uTerrainGrid.xy) * uTerrainGrid.z;
  vec3 marWN = normalize((vec4(vNormal, 0.0) * viewMatrix).xyz);
  vec3 marNP = vec3(0.0);
  float marFade = 0.0;
#ifdef MAR_DETAIL
  // far colour: the albedo texture, identical at every distance
  diffuseColor.rgb = texture2D(uAlbedo, marUv).rgb;
#else
  {
    // low (no detail): one albedo tap at warped, sharpened texel coordinates — organic, crisper
    // zone edges than plain bilinear (fades to plain bilinear once a cell is under ~1 px)
    vec2 marQ = vMarWorld.xz / ${g(GD.borderWarpScale)};
    vec2 marGp = marG + (vec2(marVNoise(marQ), marVNoise(marQ + 37.0)) * 2.0 - 1.0) * ${g(GD.borderWarp)};
    vec2 marF = fract(marGp);
    float marK = 1.0 - smoothstep(0.3, 1.0, marGw);
    marF = mix(marF, smoothstep(0.2, 0.8, marF), marK);
    diffuseColor.rgb = texture2D(uAlbedo, (floor(marGp) + marF + 0.5) / uTerrainGrid.w).rgb;
  }
#endif
#ifdef MAR_DETAIL
  marFade = 1.0 - smoothstep(${g(GD.fadeNear)}, ${g(GD.fadeFar)}, length(vMarWorld - cameraPosition));
  if (marFade > 0.0) {
    // (a) 4-tap zone lookup at noise-warped grid coordinates → organic, crisp material borders
    vec2 marQ = vMarWorld.xz / ${g(GD.borderWarpScale)};
    vec2 marWarp = vec2(marVNoise(marQ) + 0.5 * marVNoise(marQ * 2.3 + 11.0),
                        marVNoise(marQ + 37.0) + 0.5 * marVNoise(marQ * 2.3 + 59.0)) * ${g(2 / 1.5)} - 1.0;
    vec2 marGp = marG + marWarp * ${g(GD.borderWarp)};
    ivec2 marI0 = ivec2(floor(marGp));
    vec2 marF = marGp - floor(marGp);
    float marW[4];
    marW[0] = (1.0 - marF.x) * (1.0 - marF.y);
    marW[1] = marF.x * (1.0 - marF.y);
    marW[2] = (1.0 - marF.x) * marF.y;
    marW[3] = marF.x * marF.y;
    vec4 marKey[4];
    vec3 marAlb[4];
    float marZn[4];
    float marIl[4];
    for (int k = 0; k < 4; k++) {
      ivec2 t = marTexel(marI0 + ivec2(k - 2 * (k / 2), k / 2));
      vec4 a = texelFetch(uAlbedo, t, 0);
      marAlb[k] = a.rgb;
      marIl[k] = floor(a.a * 255.0 + 0.5);
      marZn[k] = floor(texelFetch(uTerrainZone, t, 0).r * 255.0 + 0.5);
      marKey[k] = marPal(marZn[k], marIl[k], 0);
    }
    // pool corners of the same material; A = dominant material, B = runner-up
    float marPw[4];
    for (int k = 0; k < 4; k++) {
      marPw[k] = 0.0;
      for (int j = 0; j < 4; j++) if (marKey[j] == marKey[k]) marPw[k] += marW[j];
    }
    int marA = 0;
    for (int k = 1; k < 4; k++) if (marPw[k] > marPw[marA]) marA = k;
    int marB = -1;
    for (int k = 0; k < 4; k++)
      if (marKey[k] != marKey[marA] && (marB < 0 || marPw[k] > marPw[marB])) marB = k;
    vec3 marCA = vec3(0.0);
    vec3 marCB = vec3(0.0);
    for (int k = 0; k < 4; k++) {
      if (marKey[k] == marKey[marA]) marCA += marW[k] * marAlb[k];
      else if (marB >= 0 && marKey[k] == marKey[marB]) marCB += marW[k] * marAlb[k];
    }
    marCA /= marPw[marA];
    float marTB = 0.0;
    if (marB >= 0) {
      // a corner on the cell edge has weight 0 (f = 0 / 1 exactly): guard the 0 / 0
      marCB /= max(marPw[marB], 1e-6);
      float e = clamp(0.75 * marGw, ${g(GD.borderSoft)}, 0.5);
      marTB = smoothstep(0.5 - e, 0.5 + e, marPw[marB] / (marPw[marA] + marPw[marB]));
    }
    vec3 marCrisp = mix(marCA, marCB, marTB);
    // (b, c) material detail: accent 1 / 2 picked per patch
    float marSel = smoothstep(0.35, 0.65, marVNoise(vMarWorld.xz / ${g(GD.accentPatch)} + 5.1));
    vec3 marAcc = mix(marSrgbDecode(marPal(marZn[marA], marIl[marA], 2).rgb),
                      marSrgbDecode(marPal(marZn[marA], marIl[marA], 3).rgb), marSel);
    vec3 marNA = vec3(0.0);
    vec3 marCol = marMaterial(marKey[marA], marPal(marZn[marA], marIl[marA], 1), marAcc, marCrisp,
                              vMarWorld, marWN, marDPx, marDPy, marFade, true, marNA);
    marNP = marNA;
    if (marTB > 0.004) {
      vec3 marAccB = mix(marSrgbDecode(marPal(marZn[marB], marIl[marB], 2).rgb),
                         marSrgbDecode(marPal(marZn[marB], marIl[marB], 3).rgb), marSel);
      vec3 marNB = vec3(0.0);
      vec3 marColB = marMaterial(marKey[marB], marPal(marZn[marB], marIl[marB], 1), marAccB, marCrisp,
                                 vMarWorld, marWN, marDPx, marDPy, marFade, false, marNB);
      marCol = mix(marCol, marColB, marTB);
      marNP = mix(marNA, marNB, marTB);
    }
    // (d) far pixels equal the albedo exactly: the near colour fades in with the detail
    diffuseColor.rgb = mix(diffuseColor.rgb, marCol, marFade);
  }
#endif
  {
    // cliff strata on steep rock / cliff faces (nearest sample's palette; every distance)
    float marIsl = floor(texelFetch(uAlbedo, marTexel(ivec2(floor(marG + 0.5))), 0).a * 255.0 + 0.5);
    vec4 marP1 = marPal(marZone, marIsl, 1);
    float marAmt = marP1.b * ${g(255 / PALETTE_SCALE.strata)} * (1.0 - smoothstep(0.5, 0.85, marWN.y))
                 * step(0.0, vMarWorld.y);
    if (marAmt > 0.0) {
      float marH = ${g(TERRAIN_SHAPE.strataBand)};
      float marBand = marStrata(vMarWorld, marH, 1.0, 3.14159265 / marH * marYw * 1.5);
      float marFine = marStrata(vMarWorld + vec3(0.0, 0.37, 0.0), marH * 0.31, 0.6, 3.14159265 / (marH * 0.31) * marYw * 1.5);
      float marC = marP1.a * ${g(255 / PALETTE_SCALE.contrast)};
      diffuseColor.rgb *= 1.0 + marAmt * marC * (marBand + ${g(GROUND_STRATA.fine)} * marFade * marFine);
    }
  }
`;
