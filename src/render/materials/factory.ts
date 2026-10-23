import * as THREE from 'three';
import { ALWAYS_APPEAR, APPEAR_OUT_GLSL } from '../props/appear.ts';
import { BLOOM_IN, TREE_SWAY, WINDMILL } from '../../content/anim.ts';
import { CULTURE_SLOTS, SHARED } from '../uniforms.ts';
import { FIELDS_GLSL } from '../shaders/chunks/fields.glsl.ts';
import { SHARED_LIT_GLSL } from '../shaders/chunks/lit.glsl.ts';
import { NIGHT, SEA_LAMP, SHADE } from '../../content/lighting.ts';
import { RELAY } from '../../content/cultures/rhythm.ts';
import { CLOUD_SHADOW_GLSL } from '../shaders/chunks/cloud-shadow.glsl.ts';
import { NIGHT_GLSL, POOL_GAIN } from '../shaders/chunks/night.glsl.ts';
import { HOVER_RADIUS, HOVER_UNIFORMS } from './hover.ts';
import { MIST_GLSL } from '../shaders/chunks/mist.glsl.ts';
import {
  ACTIVITY_DISPLACE,
  ACTIVITY_FRAG_PARS,
  ACTIVITY_GLOW,
  ACTIVITY_OCCUPANCY,
  ACTIVITY_SURFACE,
  ACTIVITY_VARY,
  ACTIVITY_VARYINGS,
  ACTIVITY_VERTEX_PARS,
} from './activity-glsl.ts';

/**
 * Lit material factory (D-003, ARCHITECTURE §3 "Materials"): MeshLambertMaterial
 * + vertex colours, patched with onBeforeCompile. Every lit material compiles the SAME
 * program (customProgramCacheKey = `mar-lit`, `:s` for smooth normals): the look-changing
 * features `bloomIn` and `rim` are per-material uniform switches, windmill spin keys off
 * the `aSpin` attribute (default 0 = off), and wind / dither / emissive are free no-ops
 * without their attribute / fade distances (D-016: program budget).
 *
 * Geometry attributes read (all optional — `defaultAttributeValues` keeps the
 * neutral value when absent): `wind` (sway weight 0..1), `ao` (×vColor),
 * `aSeed` (hash), `aAppear` (bloom-in start time, s), `emissive` (night glow 0..1; ≥ 1.5 = screen
 * class, mask = emissive − 1, glows dimly by day too — TASK-305).
 *
 * `aSpin.w` is also the living close-up tag channel (TASK-384, content/activity.ts): 1 spin,
 * 2/3 turbine yaw (+ spin), 4 sun tracker, negative = animated surface kind (monitor content,
 * LED blink, billboard slides, pipe pulses; materials/activity-glsl.ts). No new attribute.
 */
export interface LitFeatures {
  /** Informational: instancing is detected by three (USE_INSTANCING); not part of the key. */
  instanced?: boolean;
  wind?: boolean;
  bloomIn?: boolean;
  dither?: boolean;
  emissive?: boolean;
  rim?: boolean;
  /** Smooth normals (creatures, clouds-ish props); default is faceted. */
  smooth?: boolean;
  /**
   * Informational: windmill blades (vertices with `aSpin.w > 0.5`) rotate about local +z
   * through `aSpin.xyz` (hub). Every lit program carries the branch; not part of the key.
   */
  spin?: boolean;
}

export interface LitOptions {
  /** Dither fade distances (camera ↔ instance origin). near > far inverts (fade-in proxies). */
  fadeNear?: number;
  fadeFar?: number;
  side?: THREE.Side;
  name?: string;
  /**
   * Night lamps (TASK-171): `stagger` = static instances switch on one by one inside the
   * lamps ramp (hash of the instance origin); `lateOff` = NIGHT.lateOffFraction of them go dark
   * late. Off for moving meshes (their origin hash would change as they move).
   */
  lamps?: { stagger?: boolean; lateOff?: boolean; culture?: boolean | 'sea' };
  /**
   * Culture gate (TASK-430, render/culture-clock.ts GATES): a shared 0..1 visibility that
   * dither-fades the whole material (colour + depth) in and out with the time of day.
   */
  gate?: THREE.IUniform<number>;
  /**
   * Far structure merge (TASK-407): the geometry is pre-transformed instances (`uMarMerged`;
   * per-vertex origin in `aSpin.xyz`, scale in `aAppear`, yaw code in `floor(aSeed)`).
   */
  merged?: boolean;
}

type FeatureFlag = 'wind' | 'bloomIn' | 'dither' | 'emissive' | 'rim';

/**
 * The one lit program (prewarm list): every feature is compiled in. `bloomIn` and `rim`
 * change the look, so they are uniform switches (`uMarBloomIn` / `uMarRim`, per material);
 * `wind`, `emissive`, `dither` and spin are no-ops without their attribute / fade distances.
 * Before D-016 these were 4 define variants (+ `:spin`), i.e. up to 5 colour + 2 depth programs.
 */
export const PROGRAM_FEATURES: Readonly<Record<FeatureFlag, true>> = {
  wind: true,
  bloomIn: true,
  dither: true,
  emissive: true,
  rim: true,
};

const FLAGS: readonly FeatureFlag[] = ['wind', 'bloomIn', 'dither', 'emissive', 'rim'];

const DEFINE: Record<FeatureFlag, string> = {
  wind: 'MAR_WIND',
  bloomIn: 'MAR_BLOOM_IN',
  dither: 'MAR_DITHER',
  emissive: 'MAR_EMISSIVE',
  rim: 'MAR_RIM',
};

export interface ResolvedVariant {
  /** Requested features: `bloomIn` / `rim` drive the material's uniform switches. */
  features: Record<FeatureFlag, boolean>;
  smooth: boolean;
  spin: boolean;
  /** Program cache key (shared by every material with the same normals mode). */
  key: string;
}

export function resolveVariant(req: LitFeatures): ResolvedVariant {
  const features = {} as Record<FeatureFlag, boolean>;
  for (const fl of FLAGS) features[fl] = !!req[fl];
  const smooth = !!req.smooth;
  return { features, smooth, spin: !!req.spin, key: `mar-lit${smooth ? ':s' : ''}` };
}

/**
 * Fixed vertex-attribute locations for every attribute that may be absent from a geometry and
 * fall back to `defaultAttributeValues` (D-016). three writes those fallbacks with
 * `gl.vertexAttrib*` only when it (re)builds a VAO, but generic attribute values are CONTEXT
 * state, not VAO state: the last program to set location L wins for every later draw. With
 * linker-assigned locations, merging programs reshuffled them and e.g. `ao` read another
 * attribute's 0 (black props) / `aSpin.w` read a float default's implicit w = 1 (spinning
 * houses). Pinning each such attribute to its own location, the same in every program that
 * declares it (lit, depth, creature), means location L only ever holds that attribute's own
 * default. Built-ins (position, normal, color, instanceMatrix ×4, instanceColor = 8) take 0–7.
 */
export const ATTR_LOCATION = {
  wind: 8,
  ao: 9,
  aSeed: 10,
  aAppear: 11,
  emissive: 12,
  aSpin: 13,
  limb: 14,
  aGait: 15,
} as const;

/** `layout(location = N) attribute <type> <name>;` (three defines `attribute` as `in`). */
export function marAttr(type: string, name: keyof typeof ATTR_LOCATION): string {
  return `layout(location = ${ATTR_LOCATION[name]}) attribute ${type} ${name};`;
}

const f = (v: number): string => v.toFixed(6);
/** Gust adds up to this many radians of blade angle as a gust front passes. */
const WINDMILL_GUST_BOOST = 1.5;
const DEG = Math.PI / 180;
const SCREEN = NIGHT.screenFlicker;

/** Vertex pars shared by the colour and depth programs. Insert after `#include <common>`. */
const VERTEX_PARS = /* glsl */ `
uniform float uTime;
uniform vec4 uWind;
uniform float uGustSpeed;
uniform float uMotionScale;
uniform vec3 uCameraPos;
uniform float uFadeNear;
uniform float uFadeFar;
uniform float uMarBloomIn;
uniform float uMarMerged;
uniform float uMarGate;
${ACTIVITY_VERTEX_PARS}
${marAttr('float', 'wind')}
${marAttr('float', 'aSeed')}
${marAttr('float', 'aAppear')}
#ifdef MAR_SPIN
${marAttr('vec4', 'aSpin')}
#endif
varying float vFade;
${FIELDS_GLSL}
${APPEAR_OUT_GLSL}
float marHash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
`;

/**
 * Displacement of `transformed` (object space, pivot at the base). Runs after
 * `#include <begin_vertex>` in both the colour and the depth program.
 */
const VERTEX_DISPLACE = /* glsl */ `
  #ifdef USE_INSTANCING
    mat4 marM = modelMatrix * instanceMatrix;
  #else
    mat4 marM = modelMatrix;
  #endif
  vec3 marOrigin = marM[3].xyz;
  // far structure merge (TASK-407, render/props/far-merge.ts): pre-transformed instances in one
  // mesh carry their instance origin in aSpin.xyz (|w| < 0.5: no tag; the baked facade code of
  // ACTIVITY_OCCUPANCY) and their scale in aAppear (merged meshes only show settled instances).
  // The pivot terms below are identities otherwise.
  vec3 marPivot = vec3(0.0);
  float marScale = 1.0;
  float marAppear = aAppear;
  #ifdef MAR_SPIN
  if (uMarMerged > 0.5) {
    marOrigin = aSpin.xyz;
    marPivot = marOrigin;
    marScale = aAppear;
    marAppear = ${f(ALWAYS_APPEAR)};
  }
  // spin tags: 1 (blades) and 3 (turbine rotor, then yawed below); 2 / 4 / negative do not spin
  if ((aSpin.w > 0.5 && aSpin.w < 1.5) || (aSpin.w > 2.5 && aSpin.w < 3.5)) {
    // ART_BIBLE §7 #18: 6 s/rev × wind (0.5–1.5), extra turn on gusts
    float marSG = marGustAt(marOrigin.xz, uTime, uWind.xy, uGustSpeed, uWind.w, uWind.z);
    float marSA = (uTime * ${f((2 * Math.PI) / WINDMILL.secondsPerRev)} * clamp(uWind.z, 0.5, 1.5)
      + marSG * ${f(WINDMILL_GUST_BOOST)}) * uMotionScale;
    float marSc = cos(marSA);
    float marSs = sin(marSA);
    vec2 marSp = transformed.xy - aSpin.xy;
    transformed.xy = aSpin.xy + vec2(marSc * marSp.x - marSs * marSp.y, marSs * marSp.x + marSc * marSp.y);
  }
  #endif
${ACTIVITY_DISPLACE}  #ifdef MAR_BLOOM_IN
  // reduced motion (uMotionScale < 1): bloom-in becomes a dither fade, no scale spring
  float marBloomD = 1.0;
  if (marIsRemoved(marAppear)) {
    // removed by an edit (TASK-211): the bloom-in reversed (dither out under reduced motion)
    bool marRm = uMotionScale < 0.999;
    float marOut = marRemoveFade(marAppear, uTime, marRm);
    if (marRm) marBloomD = marOut;
    else transformed *= marOut;
  } else if (uMarBloomIn > 0.5) {
    if (uMotionScale < 0.999) {
      marBloomD = smoothstep(0.0, ${f(BLOOM_IN.ditherMs / 1000)}, uTime - marAppear);
    } else {
      transformed *= marSpringIn(uTime - marAppear, ${f(BLOOM_IN.k)}, ${f(BLOOM_IN.c)});
    }
  }
  #endif
  #ifdef MAR_WIND
  {
    float marW = wind * uMotionScale;
    if (marW > 0.0) {
      float marGust = marGustAt(marOrigin.xz, uTime, uWind.xy, uGustSpeed, uWind.w, uWind.z);
      float marPhase = (marHash12(marOrigin.xz * 0.37) + aSeed) * 6.2831853;
      float marIdle = sin(uTime * ${f((2 * Math.PI) / TREE_SWAY.idlePeriod)} + marPhase);
      float marAng = ${f(TREE_SWAY.idleDeg * DEG)} * marIdle + ${f(TREE_SWAY.gustDeg * DEG)} * marGust;
      // world wind direction → object space (rotation + uniform scale)
      mat3 marR = mat3(marM);
      float marS2 = max(dot(marR[0], marR[0]), 1e-6);
      vec3 marDirL = transpose(marR) * vec3(uWind.x, 0.0, uWind.y) / marS2;
      float marH = max((transformed.y - marPivot.y) / marScale, 0.0);
      transformed += marDirL * (marAng * marH * marW);
      // canopy squash at the gust peak: y 0.97, xz 1.03 (about the instance pivot)
      float marSq = ${f(TREE_SWAY.squash)} * marGust * marW;
      transformed.y = marPivot.y + (transformed.y - marPivot.y) * (1.0 - marSq);
      transformed.xz = marPivot.xz + (transformed.xz - marPivot.xz) * (1.0 + marSq);
    }
  }
  #endif
  #ifdef MAR_DITHER
  {
    float marD = distance(uCameraPos, marOrigin);
    vFade = 1.0 - clamp((marD - uFadeNear) / (uFadeFar - uFadeNear), 0.0, 1.0);
  }
  #else
    vFade = 1.0;
  #endif
  #ifdef MAR_BLOOM_IN
    vFade *= marBloomD;
  #endif
  vFade *= uMarGate;
`;

const VERTEX_COLOR_PARS = /* glsl */ `
${marAttr('float', 'ao')}
#ifdef MAR_EMISSIVE
${marAttr('float', 'emissive')}
#endif
varying float vMarEmissive;
varying vec2 vMarCloudXZ;
varying float vMarWorldY;
varying float vMarHover;
${ACTIVITY_VARYINGS}
uniform vec4 uHover;
uniform vec3 uLamps;
uniform vec3 uLampMode;
uniform vec4 uCultureIsle[${CULTURE_SLOTS}];
uniform vec2 uCultureLamps[${CULTURE_SLOTS}];
uniform vec3 uFestival;
uniform float uSeaLamps;
// culture clock (TASK-430): the island whose disc (distance / reach) is nearest → (lamp set,
// relay boost, distance / reach); vec3(0, 0, 1) without islands
vec3 marCulture(vec2 p) {
  vec3 r = vec3(0.0, 0.0, 1.0);
  float best = 1e9;
  for (int i = 0; i < ${CULTURE_SLOTS}; i++) {
    vec4 c = uCultureIsle[i];
    if (c.w < 0.5) continue;
    float d = length(p - c.xy) * c.z;
    if (d < best) {
      best = d;
      r = vec3(uCultureLamps[i], d);
    }
  }
  return r;
}
`;

/**
 * World position for the cloud-shadow / pool lookups and the night lamp switch (colour program
 * only; after VERTEX_DISPLACE so marM / marOrigin exist).
 */
const VERTEX_CLOUD = /* glsl */ `
  {
    vec4 marWp = marM * vec4(transformed, 1.0);
    vMarCloudXZ = marWp.xz;
    vMarWorldY = marWp.y;
  }
  // hover / click flash (TASK-162): the instance whose origin matches uHover.xyz
  vMarHover = (uHover.w > 0.0 && distance(marOrigin, uHover.xyz) < ${f(HOVER_RADIUS)}) ? uHover.w : 0.0;
  #ifdef MAR_EMISSIVE
  // culture clock (TASK-430): static props read their island's lamp set and relay boost
  vec3 marCu = vec3(0.0, 0.0, 1.0);
  bool marFlood = vMarEmissive <= 0.0 && wind <= 0.0;
  if (uLampMode.x > 0.5 && uCultureIsle[0].w > 0.5 && (vMarEmissive > 0.0 || (marFlood && uFestival.z > 0.5)))
    marCu = marCulture(marOrigin.xz);
  if (vMarEmissive >= 1.5) {
    // screen class (TASK-305): mask = emissive − 1; dim by day, full with the lamps ramp (no
    // stagger, never off late) + a slow flicker and a soft band scrolling down the screen.
    // Phase: origin hash for static props (stagger mode), aSeed for movers (worker eyes).
    float marSh = uLampMode.x > 0.5 ? marHash12(marOrigin.xz * 0.731 + 3.7) : fract(aSeed * 7.31 + 0.5);
    float marSm = uMotionScale * (${f(SCREEN.amp)} * sin(uTime * ${f((2 * Math.PI) / SCREEN.period)} + marSh * 37.0)
      + ${f(SCREEN.scrollAmp)} * sin((vMarWorldY + uTime * ${f(SCREEN.scrollSpeed)}) * ${f((2 * Math.PI) / SCREEN.scrollLength)} + marSh * 13.0));
    vMarEmissive = (vMarEmissive - 1.0) * mix(${f(NIGHT.screenDay)}, 1.0, uLamps.x) * (1.0 + marSm);
  } else if (vMarEmissive > 0.0) {
    float marLh = marHash12(marOrigin.xz * 0.731 + 3.7);
    // switch-on: one by one inside the lamps ramp (staggered) or all together
    float marOn = uLampMode.x > 0.5
      ? smoothstep(marLh * 0.85, marLh * 0.85 + 0.15, uLamps.x)
      : uLamps.x;
    // a culture lamp set switches on in rings from its island's centre outward
    float marRing = clamp(marCu.z, 0.0, 1.0) * 0.7;
    // the sea lamp set (channel buoys) glows SEA_LAMP.gain × brighter: a halo per far dot
    if (uLampMode.z > 1.5) marOn = smoothstep(marLh * 0.85, marLh * 0.85 + 0.15, uSeaLamps) * ${f(SEA_LAMP.gain)};
    else if (uLampMode.z > 0.5) marOn = smoothstep(marRing, marRing + 0.3, marCu.x);
    // late night: a fraction of the windows goes dark, staggered over the switch-off ramp
    float marLo = marHash12(marOrigin.xz * 1.37 + 11.1);
    if (uLampMode.y > 0.5 && marLo < ${f(NIGHT.lateOffFraction)}) {
      float marT = marLo / ${f(NIGHT.lateOffFraction)} * 0.8;
      marOn *= 1.0 - smoothstep(marT, marT + 0.2, uLamps.y);
    }
${ACTIVITY_OCCUPANCY}    float marFw1 = ${f((2 * Math.PI) / NIGHT.flickerPeriod[1])} + ${f((2 * Math.PI) / NIGHT.flickerPeriod[0] - (2 * Math.PI) / NIGHT.flickerPeriod[1])} * marLh;
    float marFl = 1.0 + ${f(NIGHT.flickerAmp)} * (0.6 * sin(uTime * marFw1 + marLh * 37.0) + 0.4 * sin(uTime * marFw1 * 1.618 + marLh * 71.0));
    vMarEmissive *= marOn * marFl;
  }
  vMarEmissive *= 1.0 + marCu.y;
  // Launch Day Relay: the island's structures (not foliage) light up warm with its boost
  // (a far read only: close up the windows and culture lamps carry the relay, the night stays dark)
  if (marFlood)
    vMarEmissive = marCu.y * ${f(RELAY.flood)}
      * smoothstep(${f(RELAY.floodFrom[0])}, ${f(RELAY.floodFrom[1])}, distance(uCameraPos, marOrigin));
  #endif
${ACTIVITY_VARY}`;

const VERTEX_COLOR_MAIN = /* glsl */ `
  #if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA ) || defined( USE_INSTANCING_COLOR )
    vColor.rgb *= ao;
  #endif
  #ifdef MAR_EMISSIVE
    vMarEmissive = emissive;
  #else
    vMarEmissive = 0.0;
  #endif
`;

const FRAG_PARS = /* glsl */ `
varying float vFade;
varying float vMarEmissive;
varying vec2 vMarCloudXZ;
varying float vMarWorldY;
varying float vMarHover;
uniform vec3 uHoverCol;
uniform float uTime;
uniform float uMarRim;
${FIELDS_GLSL}
${SHARED_LIT_GLSL.fragmentPars}
${CLOUD_SHADOW_GLSL}
${NIGHT_GLSL}
${MIST_GLSL}
${ACTIVITY_FRAG_PARS}
`;

/**
 * Low mist band (TASK-172): after three's fog, in the same (output) colour space as fogColor.
 * uMist.x == 0 → marMist returns 0 before any math (clear weather is unchanged).
 */
const FRAG_MIST = /* glsl */ `
  #ifdef USE_FOG
  if (uMist.x > 0.0 && uDebugMask < 0.5) {
    float marMi = marMist(vec3(vMarCloudXZ.x, vMarWorldY, vMarCloudXZ.y), cameraPosition);
    gl_FragColor.rgb = mix(gl_FragColor.rgb, linearToOutputTexel(vec4(uMistColor, 1.0)).rgb, marMi);
  }
  #endif
`;

/** Cloud shadows (TASK-153): multiply the lit colour before tint/rim/emissive are added. */
const FRAG_CLOUD = /* glsl */ `
  outgoingLight *= marCloudShadowMul(vMarCloudXZ, uDebugMask);
`;

const FRAG_DITHER = /* glsl */ `
  #ifdef MAR_DITHER
    if (vFade < marBayer4(gl_FragCoord.xy)) discard;
  #endif
`;

/**
 * Flat-shaded normal with a guard (TASK-435): three's `normalize(cross(dFdx(p), dFdy(p)))` is NaN
 * where a 2×2 quad's derivatives degenerate (far sliver triangles at the frustum edge). One NaN
 * pixel in the HDR input blacks out the whole frame through the bloom mip chain; such a pixel
 * faces the camera instead. Insert after `#include <normal_fragment_begin>`.
 */
export const FRAG_FLAT_NORMAL = /* glsl */ `
  #ifdef FLAT_SHADED
  {
    vec3 marFn = cross(fdx, fdy);
    float marL2 = dot(marFn, marFn);
    normal = (marL2 > 1e-30 && marL2 < 1e30) ? marFn * inversesqrt(marL2) : vec3(0.0, 0.0, 1.0);
  }
  #endif
`;

const FRAG_OUTGOING = /* glsl */ `
  #ifdef MAR_SHADOW_TINT
  ${SHARED_LIT_GLSL.sunVisibility}
  ${SHARED_LIT_GLSL.shadowTint}
  #endif
  #ifdef MAR_RIM
  if (uMarRim > 0.5) ${SHARED_LIT_GLSL.rim}
  #endif
  #ifdef MAR_EMISSIVE
    // night glow: mask × lamps (staggered, flickering; vertex) × gain → crosses the bloom threshold
    // TASK-384: animated surfaces weight their glow (dim backgrounds, bright ink)
    outgoingLight += diffuseColor.rgb * marTint * (vMarEmissive * marSG * ${f(NIGHT.emissiveGain)});
  #endif
${ACTIVITY_GLOW}
  {
    // lantern pools (TASK-171): warm light on walls/trunks near lanterns, fading with height
    vec2 marPl = marPool(vMarCloudXZ);
    if (marPl.x > 0.0) {
      float marUp = 1.0 - smoothstep(${POOL_GAIN.fade0}, ${POOL_GAIN.fade1}, vMarWorldY - marPl.y);
      outgoingLight += diffuseColor.rgb * marPoolColor(vMarCloudXZ)
        * (marPl.x * marUp * ${POOL_GAIN.prop} * marPoolFlicker(vMarCloudXZ, uTime) * (1.0 - uDebugMask));
    }
  }
  outgoingLight += uHoverCol * vMarHover;
`;

/** Neutral values for optional attributes (three applies them via vertexAttrib1fv). */
const DEFAULT_ATTRS = {
  wind: [0],
  ao: [1],
  aSeed: [0],
  aAppear: [-1e4],
  aSpin: [0, 0, 0, 0],
  emissive: [0],
};

function replaceOnce(src: string, find: string, insert: string, where: 'after' | 'before'): string {
  const i = src.indexOf(find);
  if (i < 0) throw new Error(`material factory: chunk "${find}" not found (three upgrade?)`);
  return where === 'after'
    ? src.slice(0, i + find.length) + insert + src.slice(i + find.length)
    : src.slice(0, i) + insert + src.slice(i);
}

function defineMap(): Record<string, string> {
  const d: Record<string, string> = {};
  for (const fl of FLAGS) d[DEFINE[fl]] = '';
  // every lit program carries the windmill branch (aSpin.w defaults to 0); the creature
  // material drops it (life-material.ts) to stay inside the 16 vertex attributes
  d.MAR_SPIN = '';
  if (SHADE.enabled) d.MAR_SHADOW_TINT = '';
  return d;
}

export interface FadeUniforms {
  uFadeNear: THREE.IUniform<number>;
  uFadeFar: THREE.IUniform<number>;
  /** Culture gate (TASK-430); absent = always visible. */
  uMarGate?: THREE.IUniform<number>;
}

/** `uMarGate` of ungated materials (never written). */
const GATE_OPEN: THREE.IUniform<number> = { value: 1 };

function sharedVertexUniforms(
  fade: FadeUniforms,
  v: ResolvedVariant,
  merged = false,
): Record<string, THREE.IUniform> {
  return {
    uMarBloomIn: { value: v.features.bloomIn ? 1 : 0 },
    uMarMerged: { value: merged ? 1 : 0 },
    uTime: SHARED.uTime,
    uWind: SHARED.uWind,
    uGustSpeed: SHARED.uGustSpeed,
    uMotionScale: SHARED.uMotionScale,
    uSunSkyDir: SHARED.uSunSkyDir,
    uCameraPos: SHARED.uCameraPos,
    uFadeNear: fade.uFadeNear,
    uFadeFar: fade.uFadeFar,
    uMarGate: fade.uMarGate ?? GATE_OPEN,
  };
}

/** Lambert material with the Marisland feature patch. `fade` uniforms are per material. */
export class LitMaterial extends THREE.MeshLambertMaterial {
  readonly variant: ResolvedVariant;
  readonly fade: FadeUniforms;
  readonly defaultAttributeValues = DEFAULT_ATTRS;

  constructor(features: LitFeatures, opts: LitOptions = {}) {
    super({
      vertexColors: true,
      flatShading: !features.smooth,
      side: opts.side ?? THREE.FrontSide,
    });
    const variant = resolveVariant(features);
    this.variant = variant;
    this.name = opts.name ?? variant.key;
    this.fade = {
      uFadeNear: { value: opts.fadeNear ?? 1e6 },
      uFadeFar: { value: opts.fadeFar ?? 2e6 },
      ...(opts.gate ? { uMarGate: opts.gate } : {}),
    };
    const lampMode = new THREE.Vector3(
      opts.lamps?.stagger ? 1 : 0,
      opts.lamps?.lateOff ? 1 : 0,
      opts.lamps?.culture === 'sea' ? 2 : opts.lamps?.culture ? 1 : 0,
    );
    const defines = defineMap();
    const uniforms: Record<string, THREE.IUniform> = {
      ...sharedVertexUniforms(this.fade, variant, opts.merged),
      uMarRim: { value: variant.features.rim ? 1 : 0 },
      uHorizon: SHARED.uHorizon,
      uShadowTint: SHARED.uShadowTint,
      uNight: SHARED.uNight,
      uDebugMask: SHARED.uDebugMask,
      uSunColor: SHARED.uSunColor,
      uLamps: SHARED.uLamps,
      uLampMode: { value: lampMode },
      uCultureIsle: SHARED.uCultureIsle,
      uCultureLamps: SHARED.uCultureLamps,
      uFestival: SHARED.uFestival,
      uSeaLamps: SHARED.uSeaLamps,
      uPoolTex: SHARED.uPoolTex,
      uPoolMap: SHARED.uPoolMap,
      uPoolColor: SHARED.uPoolColor,
      uHover: HOVER_UNIFORMS.uHover,
      uHoverCol: HOVER_UNIFORMS.uHoverCol,
      uCloudShadow: SHARED.uCloudShadow,
      uCloudSun: SHARED.uCloudSun,
      uCloudSeed: SHARED.uCloudSeed,
      uCloudCover: SHARED.uCloudCover,
      uMist: SHARED.uMist,
      uMistColor: SHARED.uMistColor,
      uMistMax: SHARED.uMistMax,
      uMistChannel: SHARED.uMistChannel,
    };
    this.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.defines = { ...(shader.defines ?? {}), ...defines };
      let vs = shader.vertexShader;
      vs = replaceOnce(vs, '#include <common>', VERTEX_PARS + VERTEX_COLOR_PARS, 'after');
      vs = replaceOnce(
        vs,
        '#include <begin_vertex>',
        VERTEX_COLOR_MAIN + VERTEX_DISPLACE + VERTEX_CLOUD,
        'after',
      );
      shader.vertexShader = vs;
      let fs = shader.fragmentShader;
      fs = replaceOnce(fs, '#include <common>', FRAG_PARS, 'after');
      fs = replaceOnce(fs, '#include <clipping_planes_fragment>', FRAG_DITHER, 'after');
      fs = replaceOnce(fs, '#include <color_fragment>', ACTIVITY_SURFACE, 'after');
      fs = replaceOnce(fs, '#include <normal_fragment_begin>', FRAG_FLAT_NORMAL, 'after');
      fs = replaceOnce(fs, '#include <opaque_fragment>', FRAG_CLOUD, 'before');
      fs = replaceOnce(fs, '#include <opaque_fragment>', FRAG_OUTGOING, 'before');
      fs = replaceOnce(fs, '#include <fog_fragment>', FRAG_MIST, 'after');
      shader.fragmentShader = fs;
    };
  }

  override customProgramCacheKey(): string {
    return this.variant.key;
  }
}

export function makeLitMaterial(features: LitFeatures, opts?: LitOptions): LitMaterial {
  return new LitMaterial(features, opts);
}

/**
 * Shadow-caster depth material with the same vertex displacement (wind sway,
 * bloom-in) and dither fade (hard 50 % cut, no stipple in the shadow map).
 * Pass the colour material's `fade` so both fade together.
 */
export function makeDepthMaterial(
  features: LitFeatures,
  fade?: FadeUniforms,
  merged = false,
): THREE.MeshDepthMaterial {
  const variant = resolveVariant(features);
  const fadeU: FadeUniforms = fade ?? { uFadeNear: { value: 1e6 }, uFadeFar: { value: 2e6 } };
  const mat = new THREE.MeshDepthMaterial();
  mat.name = `${variant.key}:depth`;
  const defines = defineMap();
  const uniforms = sharedVertexUniforms(fadeU, variant, merged);
  (mat as unknown as { defaultAttributeValues: typeof DEFAULT_ATTRS }).defaultAttributeValues =
    DEFAULT_ATTRS;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.defines = { ...(shader.defines ?? {}), ...defines };
    let vs = shader.vertexShader;
    vs = replaceOnce(vs, '#include <common>', VERTEX_PARS, 'after');
    vs = replaceOnce(vs, '#include <begin_vertex>', VERTEX_DISPLACE, 'after');
    shader.vertexShader = vs;
    let fs = shader.fragmentShader;
    fs = replaceOnce(fs, '#include <common>', '\nvarying float vFade;\n', 'after');
    fs = replaceOnce(fs, 'void main() {', '\n  if (vFade < 0.5) discard;\n', 'after');
    shader.fragmentShader = fs;
  };
  mat.customProgramCacheKey = () => `${variant.key}:depth`;
  return mat;
}

/** Every program key the factory can produce (for prewarm / budget accounting). */
export function allVariantKeys(withSmooth = false): string[] {
  return withSmooth ? ['mar-lit', 'mar-lit:s'] : ['mar-lit'];
}
