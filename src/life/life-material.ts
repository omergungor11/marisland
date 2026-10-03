import type * as THREE from 'three';
import { GULLS } from '../content/life.ts';
import { SHARED } from '../render/uniforms.ts';
import { makeLitMaterial, marAttr, type LitMaterial } from '../render/materials/factory.ts';

/**
 * One shared program for every creature that animates in the vertex shader (gulls' wings, the land
 * critters' limbs). Both feed `uTime` / `uMotionScale`, so reduced motion and the capture clock
 * work for free, and the program count stays at one.
 *
 * Per-vertex `limb` (vec4, default w = -1 = gull wing) and per-instance `aGait` (vec3: x = move
 * amount 0..1, y = pose amount 0..1 — wave / graze, z = gait phase rad, integrated on the CPU so
 * feet never slide). Gulls read the same attribute as x = wing spread, z = flap phase 0..1 (the
 * vertex-attribute budget is 16: position, normal, color, 4 × instanceMatrix, instanceColor, the
 * factory's wind/ao/aSeed/aAppear/emissive, limb, aGait = 15). Instance tint: `uTintAll` 1 = every
 * vertex takes `instanceColor`, 0 = only pure-white vertices do (villager shirts).
 */

const FLAP_CYCLE = GULLS.flaps * GULLS.flapPeriod + GULLS.glide;

// fixed locations: gulls rely on limb's default (w = -1), see ATTR_LOCATION
const PARS = /* glsl */ `
${marAttr('vec4', 'limb')}
${marAttr('vec3', 'aGait')}
uniform float uTintAll;
`;

const TINT = /* glsl */ `
  #ifdef USE_INSTANCING_COLOR
    if (uTintAll < 0.5 && min(color.r, min(color.g, color.b)) < 0.995) vColor.rgb = color.rgb;
  #endif
`;

const BODY = /* glsl */ `
  {
    float lMode = limb.w;
    if (lMode < -0.5) {
      // gull wings: flap bursts then a glide; aMode folds them when perched
      float gCyc = ${FLAP_CYCLE.toFixed(4)};
      float gTT = mod(uTime + aGait.z * gCyc, gCyc);
      float gFlapT = ${(GULLS.flaps * GULLS.flapPeriod).toFixed(4)};
      float gFlap = gTT < gFlapT ? sin(6.2831853 * gTT / ${GULLS.flapPeriod.toFixed(4)}) * 0.75 : 0.0;
      float gAng = (gFlap + 0.12) * aGait.x * uMotionScale;
      transformed.y += gAng * abs(position.z);
      transformed.z *= mix(0.25, 1.0, aGait.x);
    } else {
      float lMove = aGait.x * uMotionScale;
      float lPose = aGait.y;
      float lPh = aGait.z + limb.z;
      int lM = int(lMode + 0.5);
      if (lM == 0) {
        transformed.x += limb.x * sin(lPh) * max(limb.y - transformed.y, 0.0) * lMove;
      } else if (lM == 1) {
        transformed.y += limb.x * max(0.0, sin(lPh)) * lMove;
      } else if (lM == 2) {
        float lS = sin(uTime * 2.2 + aSeed * 6.2831853 + limb.z);
        transformed.z += limb.x * lS * max(transformed.y - limb.y, 0.0) * (0.4 + 0.6 * aGait.x) * uMotionScale;
      } else if (lM == 3) {
        // arm: swing while walking, spring up and wave when lPose > 0
        transformed.x += limb.x * sin(lPh + 3.14159) * max(limb.y - transformed.y, 0.0) * lMove * (1.0 - lPose);
        if (lPose > 0.0) {
          float lA = lPose * (2.7 + 0.35 * sin(uTime * 12.0 + aSeed * 6.2831853)) * uMotionScale;
          float lSg = limb.z >= 0.0 ? 1.0 : -1.0;
          vec2 lR = vec2((transformed.z - limb.z) * lSg, transformed.y - limb.y);
          float lC = cos(lA);
          float lSn = sin(lA);
          lR = vec2(lR.x * lC - lR.y * lSn, lR.x * lSn + lR.y * lC);
          transformed.z = limb.z + lR.x * lSg;
          transformed.y = limb.y + lR.y;
        }
      } else if (lM == 4) {
        // head dip about the neck (limb.z = pivot x), nose down
        float lA = lPose * limb.x * uMotionScale;
        vec2 lR = vec2(transformed.x - limb.z, transformed.y - limb.y);
        float lC = cos(lA);
        float lSn = sin(lA);
        transformed.x = limb.z + lR.x * lC + lR.y * lSn;
        transformed.y = limb.y - lR.x * lSn + lR.y * lC;
      } else if (lM == 5) {
        // hat variant: only the villager's own is shown, the others collapse to a point
        float lV = floor(fract(aSeed * 13.7) * 3.0);
        if (abs(lV - limb.x) > 0.5) transformed = vec3(0.0, limb.y, 0.0);
      } else if (lM == 6) {
        // click-burst glyphs (render/particles/bursts.ts): one geometry holds every glyph;
        // collapse all but the instance's own (aGait.y)
        if (abs(limb.x - aGait.y) > 0.5) transformed = vec3(0.0);
      }
    }
  }
`;

const DEFAULTS = {
  wind: [0],
  ao: [1],
  aSeed: [0],
  aAppear: [-1e4],
  aSpin: [0, 0, 0, 0],
  emissive: [0],
  limb: [0, 0, 0, -1],
  aGait: [0, 0, 0],
};

export const LIFE_PROGRAM_KEY = 'mar-lit:life';

export function makeLifeMaterial(name: string, tintAll: boolean): LitMaterial {
  const mat = makeLitMaterial({ instanced: true, rim: true }, { name });
  (mat as unknown as { defaultAttributeValues: Record<string, number[]> }).defaultAttributeValues =
    DEFAULTS;
  const tint = { value: tintAll ? 1 : 0 };
  const orig = mat.onBeforeCompile.bind(mat);
  mat.onBeforeCompile = (shader: THREE.WebGLProgramParametersWithUniforms, renderer) => {
    orig(shader, renderer);
    // no windmill branch: keeps the creature program at 15 of 16 vertex attributes (D-013)
    delete (shader.defines as Record<string, unknown>).MAR_SPIN;
    shader.uniforms.uTime = SHARED.uTime;
    shader.uniforms.uMotionScale = SHARED.uMotionScale;
    shader.uniforms.uTintAll = tint;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>' + PARS)
      .replace('#include <color_vertex>', '#include <color_vertex>' + TINT)
      .replace('#include <begin_vertex>', '#include <begin_vertex>' + BODY);
  };
  mat.customProgramCacheKey = (): string => LIFE_PROGRAM_KEY;
  return mat;
}
