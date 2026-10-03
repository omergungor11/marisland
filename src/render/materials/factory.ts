import * as THREE from 'three';
import { BLOOM_IN, TREE_SWAY, WINDMILL } from '../../content/anim.ts';
import { SHARED } from '../uniforms.ts';
import { FIELDS_GLSL } from '../shaders/chunks/fields.glsl.ts';
import { SHARED_LIT_GLSL } from '../shaders/chunks/lit.glsl.ts';
import { NIGHT, SHADE } from '../../content/lighting.ts';
import { CLOUD_SHADOW_GLSL } from '../shaders/chunks/cloud-shadow.glsl.ts';
import { NIGHT_GLSL, POOL_GAIN } from '../shaders/chunks/night.glsl.ts';
import { HOVER_RADIUS, HOVER_UNIFORMS } from './hover.ts';
import { MIST_GLSL } from '../shaders/chunks/mist.glsl.ts';

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
 * `aSeed` (hash), `aAppear` (bloom-in start time, s), `emissive` (night glow 0..1).
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
  lamps?: { stagger?: boolean; lateOff?: boolean };
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
${marAttr('float', 'wind')}
${marAttr('float', 'aSeed')}
${marAttr('float', 'aAppear')}
#ifdef MAR_SPIN
${marAttr('vec4', 'aSpin')}
#endif
varying float vFade;
${FIELDS_GLSL}
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
  #ifdef MAR_SPIN
  if (aSpin.w > 0.5) {
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
  #ifdef MAR_BLOOM_IN
  // reduced motion (uMotionScale < 1): bloom-in becomes a dither fade, no scale spring
  float marBloomD = 1.0;
  if (uMarBloomIn > 0.5) {
    if (uMotionScale < 0.999) {
      marBloomD = smoothstep(0.0, ${f(BLOOM_IN.ditherMs / 1000)}, uTime - aAppear);
    } else {
      transformed *= marSpringIn(uTime - aAppear, ${f(BLOOM_IN.k)}, ${f(BLOOM_IN.c)});
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
      float marH = max(transformed.y, 0.0);
      transformed += marDirL * (marAng * marH * marW);
      // canopy squash at the gust peak: y 0.97, xz 1.03
      float marSq = ${f(TREE_SWAY.squash)} * marGust * marW;
      transformed.y *= 1.0 - marSq;
      transformed.xz *= 1.0 + marSq;
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
uniform vec4 uHover;
uniform vec3 uLamps;
uniform vec2 uLampMode;
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
  if (vMarEmissive > 0.0) {
    float marLh = marHash12(marOrigin.xz * 0.731 + 3.7);
    // switch-on: one by one inside the lamps ramp (staggered) or all together
    float marOn = uLampMode.x > 0.5
      ? smoothstep(marLh * 0.85, marLh * 0.85 + 0.15, uLamps.x)
      : uLamps.x;
    // late night: a fraction of the windows goes dark, staggered over the switch-off ramp
    float marLo = marHash12(marOrigin.xz * 1.37 + 11.1);
    if (uLampMode.y > 0.5 && marLo < ${f(NIGHT.lateOffFraction)}) {
      float marT = marLo / ${f(NIGHT.lateOffFraction)} * 0.8;
      marOn *= 1.0 - smoothstep(marT, marT + 0.2, uLamps.y);
    }
    float marFw1 = ${f((2 * Math.PI) / NIGHT.flickerPeriod[1])} + ${f((2 * Math.PI) / NIGHT.flickerPeriod[0] - (2 * Math.PI) / NIGHT.flickerPeriod[1])} * marLh;
    float marFl = 1.0 + ${f(NIGHT.flickerAmp)} * (0.6 * sin(uTime * marFw1 + marLh * 37.0) + 0.4 * sin(uTime * marFw1 * 1.618 + marLh * 71.0));
    vMarEmissive *= marOn * marFl;
  }
  #endif
`;

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
    outgoingLight += diffuseColor.rgb * (vMarEmissive * ${f(NIGHT.emissiveGain)});
  #endif
  {
    // lantern pools (TASK-171): warm light on walls/trunks near lanterns, fading with height
    vec2 marPl = marPool(vMarCloudXZ);
    if (marPl.x > 0.0) {
      float marUp = 1.0 - smoothstep(${POOL_GAIN.fade0}, ${POOL_GAIN.fade1}, vMarWorldY - marPl.y);
      outgoingLight += diffuseColor.rgb * uPoolColor
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
}

function sharedVertexUniforms(
  fade: FadeUniforms,
  v: ResolvedVariant,
): Record<string, THREE.IUniform> {
  return {
    uMarBloomIn: { value: v.features.bloomIn ? 1 : 0 },
    uTime: SHARED.uTime,
    uWind: SHARED.uWind,
    uGustSpeed: SHARED.uGustSpeed,
    uMotionScale: SHARED.uMotionScale,
    uCameraPos: SHARED.uCameraPos,
    uFadeNear: fade.uFadeNear,
    uFadeFar: fade.uFadeFar,
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
    };
    const lampMode = new THREE.Vector2(opts.lamps?.stagger ? 1 : 0, opts.lamps?.lateOff ? 1 : 0);
    const defines = defineMap();
    const uniforms: Record<string, THREE.IUniform> = {
      ...sharedVertexUniforms(this.fade, variant),
      uMarRim: { value: variant.features.rim ? 1 : 0 },
      uHorizon: SHARED.uHorizon,
      uShadowTint: SHARED.uShadowTint,
      uNight: SHARED.uNight,
      uDebugMask: SHARED.uDebugMask,
      uLamps: SHARED.uLamps,
      uLampMode: { value: lampMode },
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
): THREE.MeshDepthMaterial {
  const variant = resolveVariant(features);
  const fadeU: FadeUniforms = fade ?? { uFadeNear: { value: 1e6 }, uFadeFar: { value: 2e6 } };
  const mat = new THREE.MeshDepthMaterial();
  mat.name = `${variant.key}:depth`;
  const defines = defineMap();
  const uniforms = sharedVertexUniforms(fadeU, variant);
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
