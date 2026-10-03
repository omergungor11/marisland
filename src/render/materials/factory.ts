import * as THREE from 'three';
import { BLOOM_IN, TREE_SWAY, WINDMILL } from '../../content/anim.ts';
import { SHARED } from '../uniforms.ts';
import { FIELDS_GLSL } from '../shaders/chunks/fields.glsl.ts';
import { SHARED_LIT_GLSL } from '../shaders/chunks/lit.glsl.ts';
import { NIGHT, SHADE } from '../../content/lighting.ts';
import { CLOUD_SHADOW_GLSL } from '../shaders/chunks/cloud-shadow.glsl.ts';
import { NIGHT_GLSL, POOL_GAIN } from '../shaders/chunks/night.glsl.ts';

/**
 * Lit material factory (D-003, ARCHITECTURE §3 "Materials"): MeshLambertMaterial
 * + vertex colours, patched with onBeforeCompile behind fixed defines so there is
 * exactly one program per feature set (customProgramCacheKey = feature key).
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
   * Windmill blades: vertices with `aSpin.w > 0.5` rotate about local +z through
   * `aSpin.xyz` (hub). Orthogonal flag like `smooth` (adds a `:spin` key).
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
 * The only variants the project compiles (prewarm list). Any request resolves to
 * the first variant that is a superset of it; `bloomIn` and `rim` must match
 * exactly (they change the look), while `wind`, `emissive` and `dither` are free
 * no-ops without their attribute/uniform, so they are folded in to keep the
 * program count at 4 (×2 where `smooth` is used).
 */
export const MATERIAL_VARIANTS: readonly {
  id: string;
  features: Required<Pick<LitFeatures, FeatureFlag>>;
}[] = [
  { id: 'lit', features: { wind: true, bloomIn: false, dither: true, emissive: true, rim: false } },
  { id: 'rim', features: { wind: true, bloomIn: false, dither: true, emissive: true, rim: true } },
  {
    id: 'bloom',
    features: { wind: true, bloomIn: true, dither: true, emissive: true, rim: false },
  },
  {
    id: 'bloom-rim',
    features: { wind: true, bloomIn: true, dither: true, emissive: true, rim: true },
  },
];

const FLAGS: readonly FeatureFlag[] = ['wind', 'bloomIn', 'dither', 'emissive', 'rim'];
const EXACT: readonly FeatureFlag[] = ['bloomIn', 'rim'];

const DEFINE: Record<FeatureFlag, string> = {
  wind: 'MAR_WIND',
  bloomIn: 'MAR_BLOOM_IN',
  dither: 'MAR_DITHER',
  emissive: 'MAR_EMISSIVE',
  rim: 'MAR_RIM',
};

export interface ResolvedVariant {
  id: string;
  features: Record<FeatureFlag, boolean>;
  smooth: boolean;
  spin: boolean;
  /** Program cache key (shared by every material of this variant). */
  key: string;
}

export function resolveVariant(req: LitFeatures): ResolvedVariant {
  for (const v of MATERIAL_VARIANTS) {
    let ok = true;
    for (const fl of FLAGS) {
      const want = !!req[fl];
      const has = v.features[fl];
      if (EXACT.includes(fl) ? want !== has : want && !has) {
        ok = false;
        break;
      }
    }
    if (ok) {
      const smooth = !!req.smooth;
      const spin = !!req.spin;
      return {
        id: v.id,
        features: { ...v.features },
        smooth,
        spin,
        key: `mar-lit:${v.id}${smooth ? ':s' : ''}${spin ? ':spin' : ''}`,
      };
    }
  }
  throw new Error(`no material variant covers ${JSON.stringify(req)}`);
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
attribute float wind;
attribute float aSeed;
attribute float aAppear;
#ifdef MAR_SPIN
attribute vec4 aSpin;
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
    transformed *= marSpringIn(uTime - aAppear, ${f(BLOOM_IN.k)}, ${f(BLOOM_IN.c)});
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
`;

const VERTEX_COLOR_PARS = /* glsl */ `
attribute float ao;
#ifdef MAR_EMISSIVE
attribute float emissive;
#endif
varying float vMarEmissive;
varying vec2 vMarCloudXZ;
varying float vMarWorldY;
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
uniform float uTime;
${FIELDS_GLSL}
${SHARED_LIT_GLSL.fragmentPars}
${CLOUD_SHADOW_GLSL}
${NIGHT_GLSL}
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
  ${SHARED_LIT_GLSL.rim}
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

function defineMap(v: ResolvedVariant): Record<string, string> {
  const d: Record<string, string> = {};
  for (const fl of FLAGS) if (v.features[fl]) d[DEFINE[fl]] = '';
  if (v.spin) d.MAR_SPIN = '';
  if (SHADE.enabled) d.MAR_SHADOW_TINT = '';
  return d;
}

export interface FadeUniforms {
  uFadeNear: THREE.IUniform<number>;
  uFadeFar: THREE.IUniform<number>;
}

function sharedVertexUniforms(fade: FadeUniforms): Record<string, THREE.IUniform> {
  return {
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
    const defines = defineMap(variant);
    const uniforms: Record<string, THREE.IUniform> = {
      ...sharedVertexUniforms(this.fade),
      uHorizon: SHARED.uHorizon,
      uShadowTint: SHARED.uShadowTint,
      uNight: SHARED.uNight,
      uDebugMask: SHARED.uDebugMask,
      uLamps: SHARED.uLamps,
      uLampMode: { value: lampMode },
      uPoolTex: SHARED.uPoolTex,
      uPoolMap: SHARED.uPoolMap,
      uPoolColor: SHARED.uPoolColor,
      uCloudShadow: SHARED.uCloudShadow,
      uCloudSun: SHARED.uCloudSun,
      uCloudSeed: SHARED.uCloudSeed,
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
  const defines = defineMap(variant);
  const uniforms = sharedVertexUniforms(fadeU);
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
  const out: string[] = [];
  for (const v of MATERIAL_VARIANTS) {
    out.push(`mar-lit:${v.id}`);
    if (withSmooth) out.push(`mar-lit:${v.id}:s`);
  }
  return out;
}
