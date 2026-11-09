/**
 * Surface detail of the shared lit program (TASK-594, content/materials.ts): material classes,
 * the bevel edge light and the near grain. Everything scales with uniforms (`uSurface` per quality
 * tier, `uMarSurf` per material, the class table), so the program count never changes and low turns
 * it all off with `uSurface = 0`. No uTime: capture frames stay deterministic.
 */
import * as THREE from 'three';
import { BLINK } from '../../../content/activity.ts';
import {
  CREASE_CODES,
  EMISSIVE_STRIDE,
  MATERIAL_CLASS,
  MATERIAL_CLASS_COUNT,
  MATERIAL_CLASSES,
  NEAR_DETAIL,
  SURFACE_QUALITY,
  type MaterialClass,
} from '../../../content/materials.ts';
import type { Quality } from '../../../core/params.ts';

const f = (v: number): string => v.toFixed(6);
const N = NEAR_DETAIL;

/** Shared uniform objects (one write per quality change). */
export const SURFACE_UNIFORMS = {
  /** x edge light, y grain, z class lobes, w unused (content SURFACE_QUALITY). */
  uSurface: { value: new THREE.Vector4(1, 1, 1, 0) },
  /** Per class: spec, power, fresnel, edge gain. */
  uMarClassA: { value: [] as THREE.Vector4[] },
  /** Per class: grain, stripes, shadow lift, sparkle. */
  uMarClassB: { value: [] as THREE.Vector4[] },
  uEdgeCream: { value: new THREE.Color(N.edgeCream) },
};
for (const name of Object.keys(MATERIAL_CLASS) as MaterialClass[]) {
  const c = MATERIAL_CLASSES[name];
  const i = MATERIAL_CLASS[name];
  SURFACE_UNIFORMS.uMarClassA.value[i] = new THREE.Vector4(c.spec, c.power, c.fresnel, c.edge);
  SURFACE_UNIFORMS.uMarClassB.value[i] = new THREE.Vector4(
    c.grain,
    c.stripes,
    c.shadowLift,
    c.sparkle,
  );
}

export function setSurfaceQuality(q: Quality): void {
  const [e, g, c] = SURFACE_QUALITY[q];
  SURFACE_UNIFORMS.uSurface.value.set(e, g, c, 0);
}

/** Vertex pars (colour program), after the factory's VERTEX_COLOR_PARS. */
export const SURFACE_VERTEX_PARS = /* glsl */ `
uniform vec2 uMarClassDef;
varying vec3 vMarEdge;
flat varying float vMarClass;
varying vec3 vMarObj;
varying vec2 vMarNear;
`;

/**
 * Decode (VERTEX_COLOR_MAIN): emissive = base + STRIDE * (class * CREASE_CODES + crease bits).
 * Untagged vertices (code 0) keep their emissive value bit-for-bit.
 */
export const SURFACE_VERTEX_DECODE = /* glsl */ `
  {
    float marCode = 0.0;
    #ifdef MAR_EMISSIVE
      marCode = floor(emissive * ${f(1 / EMISSIVE_STRIDE)});
      vMarEmissive = emissive - ${f(EMISSIVE_STRIDE)} * marCode;
    #endif
    float marCls = floor(marCode * ${f(1 / CREASE_CODES)});
    float marCr = marCode - ${f(CREASE_CODES)} * marCls;
    if (marCls < 0.5)
      marCls = (vMarEmissive >= 1.5 && vMarEmissive < ${f(BLINK.base)}) ? uMarClassDef.y : uMarClassDef.x;
    vMarClass = marCls;
    // corner of a non-indexed triangle; crease bit k = the edge opposite corner k. ANGLE counts
    // gl_VertexID as a vertex attribute: the creature program (no MAR_SPIN, 15 / 16 attributes,
    // life-material.ts) has no slot left for it, so it gets no edge light.
    #ifdef MAR_SPIN
    int marK = gl_VertexID - 3 * (gl_VertexID / 3);
    vec3 marBc = vec3(marK == 0 ? 1.0 : 0.0, marK == 1 ? 1.0 : 0.0, marK == 2 ? 1.0 : 0.0);
    vec3 marBits = vec3(mod(marCr, 2.0), mod(floor(marCr * 0.5), 2.0), floor(marCr * 0.25));
    vMarEdge = mix(vec3(1.0), marBc, step(0.5, marBits));
    #else
    vMarEdge = vec3(1.0);
    #endif
  }
`;

/** Distance ramps + grain position (VERTEX_CLOUD: needs marOrigin). Tier-independent. */
export const SURFACE_VERTEX_RAMP = /* glsl */ `
  {
    float marDs = distance(uCameraPos, marOrigin);
    vMarNear = vec2(
      1.0 - smoothstep(${f(N.near[0])}, ${f(N.near[1])}, marDs),
      1.0 - smoothstep(${f(N.classes[0])}, ${f(N.classes[1])}, marDs));
    // static props: grain seeded by the instance origin; movers by aSeed (stays on the body)
    vMarObj = position + (uLampMode.x > 0.5 ? marOrigin : vec3(aSeed * 13.1, aSeed * 7.7, aSeed * 3.9));
  }
`;

export const SURFACE_FRAG_PARS = /* glsl */ `
uniform vec4 uSurface;
uniform vec4 uMarClassA[${MATERIAL_CLASS_COUNT}];
uniform vec4 uMarClassB[${MATERIAL_CLASS_COUNT}];
uniform vec3 uEdgeCream;
uniform float uMarSurf;
varying vec3 vMarEdge;
flat varying float vMarClass;
varying vec3 vMarObj;
varying vec2 vMarNear;
float marSHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
// value noise, zero-mean (-0.5 .. 0.5)
float marSNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 u = fract(p);
  u = u * u * (3.0 - 2.0 * u);
  float a = marSHash(i);
  float b = marSHash(i + vec2(1.0, 0.0));
  float c = marSHash(i + vec2(0.0, 1.0));
  float d = marSHash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y) - 0.5;
}
`;

/**
 * Near grain + wood stripes on the albedo (after `color_fragment`). Triplanar by the facet's dominant
 * axis (a flat facet takes one plane, so the switch sits on facet edges); an octave fades out before
 * its cell drops below ~2 px, so nothing shimmers. Derivatives are taken outside the branch.
 */
export const SURFACE_FRAG_GRAIN = /* glsl */ `
  {
    vec3 marP = vMarObj;
    vec3 marDx = dFdx(marP);
    vec3 marDy = dFdy(marP);
    float marPx = max(length(marDx), length(marDy));
    vec3 marFn = abs(cross(marDx, marDy));
    int marCi = int(vMarClass + 0.5);
    vec4 marCb = uMarClassB[marCi];
    float marGk = uSurface.y * uMarSurf * vMarNear.x * (1.0 - uDebugMask);
    if (marGk > 0.0 && (marCb.x > 0.0 || marCb.y > 0.0)) {
      bool marTop = marFn.y >= marFn.x && marFn.y >= marFn.z;
      vec2 marUv = marFn.x > marFn.y && marFn.x > marFn.z ? marP.zy : (marTop ? marP.xz : marP.xy);
      float marG = 0.0;
      float marF0 = ${f(N.grainFreq[0])};
      float marF1 = ${f(N.grainFreq[1])};
      marG += 0.65 * marSNoise(marUv * marF0) * (1.0 - smoothstep(0.25, 0.5, marPx * marF0));
      marG += 0.35 * marSNoise(marUv * marF1 + 17.0) * (1.0 - smoothstep(0.25, 0.5, marPx * marF1));
      float marL = marG * 2.0 * ${f(N.grainL)} * marCb.x;
      if (marCb.y > 0.0) {
        // wood: stripes along the local up axis (top faces: along local x)
        float marSf = ${f(N.stripeFreq)};
        vec2 marSu = marTop
          ? vec2(marP.z * marSf, marP.x * marSf * ${f(N.stripeStretch)})
          : vec2((marUv.x) * marSf, marP.y * marSf * ${f(N.stripeStretch)});
        float marS = marSNoise(marSu) + 0.5 * marSNoise(marSu * 2.3 + 5.0);
        marL += marS * 2.0 * marCb.y * (1.0 - smoothstep(0.25, 0.5, marPx * marSf));
      }
      diffuseColor.rgb *= 1.0 + marL * marGk;
    }
  }
`;

/**
 * Class lobes + bevel edge light (before `opaque_fragment`, after the shadow tint; needs
 * `marSunVis`). Spec / fresnel / shadow lift fade with vMarNear.y (gone before T0), the edge light
 * with vMarNear.x. The edge is light, never dark, and ≤ 2 × edgePx wide.
 */
export const SURFACE_FRAG_LIGHT = /* glsl */ `
  #ifndef MAR_SHADOW_TINT
  float marSunVis = 1.0;
  #endif
  if (uDebugMask < 0.5) {
    int marCi = int(vMarClass + 0.5);
    vec4 marCa = uMarClassA[marCi];
    vec4 marCb = uMarClassB[marCi];
    float marCk = uSurface.z * vMarNear.y;
    vec3 marV = normalize(vViewPosition);
    float marNv = clamp(dot(normal, marV), 0.0, 1.0);
    float marDay = 1.0 - uNight;
    #if NUM_DIR_LIGHTS > 0
    if (marCk > 0.0 && (marCa.x > 0.0 || marCb.w > 0.0)) {
      vec3 marLd = directionalLights[0].direction;
      vec3 marH = normalize(marLd + marV);
      float marNh = max(dot(normal, marH), 0.0);
      float marSp = marCa.x * pow(marNh, marCa.y) + marCb.w * pow(marNh, marCa.y * 6.0);
      outgoingLight += directionalLights[0].color * (marSp * marSunVis * marCk * step(0.0, dot(normal, marLd)));
    }
    #endif
    if (marCk > 0.0 && marCa.z > 0.0) {
      float marF = 1.0 - marNv;
      outgoingLight += uHorizon * (marCa.z * marF * marF * marCk);
    }
    if (marCk > 0.0 && marCb.z > 0.0)
      outgoingLight += diffuseColor.rgb * uSunColor * (marCb.z * (1.0 - marSunVis) * marDay * marCk);
    float marEk = uSurface.x * uMarSurf * vMarNear.x * marCa.w;
    if (marEk > 0.0) {
      vec3 marW = fwidth(vMarEdge);
      vec3 marD = vMarEdge / max(marW, vec3(1e-6));
      float marDm = min(marD.x, min(marD.y, marD.z));
      float marTri = 1.0 / max(max(marW.x, max(marW.y, marW.z)), 1e-6);
      float marLine = (1.0 - smoothstep(0.0, ${f(N.edgePx)}, marDm))
        * smoothstep(${f(N.edgeMinTriPx * 0.5)}, ${f(N.edgeMinTriPx)}, marTri);
      vec3 marEc = mix(uSunColor, uEdgeCream, ${f(N.edgeCreamMix)});
      outgoingLight += marEc * (marLine * marEk * ${f(N.edgeGain)} * (0.35 + 0.65 * marSunVis) * marDay
        * max(marLuma(diffuseColor.rgb), 0.3));
    }
  }
`;
