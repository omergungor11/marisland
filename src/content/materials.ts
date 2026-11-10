/**
 * Material classes (TASK-594, M46 "surface quality"): per-vertex class tag + per-class response
 * of the shared lit program, the bevel edge light and the near grain. Numbers only; the GLSL lives
 * in render/shaders/chunks/surface.glsl.ts and reads this table as uniforms.
 *
 * Packing (no new attribute): the class rides in the free code range of the per-vertex `emissive`
 * float. Every existing code is < EMISSIVE_STRIDE (0 lit, 0..1 lamp mask, 1.5..2 screen,
 * BLINK.base 3 + mask ≤ 4), so
 *
 *   emissive = base + EMISSIVE_STRIDE × code,   code = class × CREASE_CODES + crease bits (0..7)
 *
 * and a vertex without a tag (code 0) keeps its value bit-for-bit. Crease bits are the triangle's
 * sharp edges (bit k = the edge opposite corner k), baked on LOD0 prop geometry by
 * render/props/creases.ts and read with gl_VertexID % 3 for the edge light.
 */
import { WALLS } from './palette.ts';

export const MATERIAL_CLASS = { matte: 0, wood: 1, metal: 2, glass: 3, fabric: 4 } as const;
export type MaterialClass = keyof typeof MATERIAL_CLASS;
export const MATERIAL_CLASS_COUNT = 5;

/** Every emissive code in use today is below this (BLINK.base 3 + mask 1 = 4). */
export const EMISSIVE_STRIDE = 8;
/** 3 crease bits per class. */
export const CREASE_CODES = 8;

export interface ClassResponse {
  /** Sun specular lobe strength (× sun colour × sun visibility). */
  spec: number;
  /** Blinn-Phong exponent. */
  power: number;
  /** Fresnel lift (× horizon colour, on top of the shared rim). */
  fresnel: number;
  /** Bevel edge-light gain. */
  edge: number;
  /** Near grain amount (× NEAR_DETAIL.grainL). */
  grain: number;
  /** Wood stripes (± L along the local up axis). */
  stripes: number;
  /** Shadow-side lift (fabric: soft cloth reads lighter in shade), share of albedo. */
  shadowLift: number;
  /** Glass sparkle: a second, much tighter lobe per facet. */
  sparkle: number;
}

/** Index = MATERIAL_CLASS value. matte = today's look (no lobes). */
export const MATERIAL_CLASSES: Readonly<Record<MaterialClass, ClassResponse>> = {
  matte: {
    spec: 0,
    power: 1,
    fresnel: 0,
    edge: 1,
    grain: 1,
    stripes: 0,
    shadowLift: 0,
    sparkle: 0,
  },
  wood: {
    spec: 0.05,
    power: 6,
    fresnel: 0,
    edge: 0.9,
    grain: 0.8,
    stripes: 0.05,
    shadowLift: 0,
    sparkle: 0,
  },
  metal: {
    spec: 0.35,
    power: 40,
    fresnel: 0.12,
    edge: 1.3,
    grain: 0.4,
    stripes: 0,
    shadowLift: 0,
    sparkle: 0,
  },
  glass: {
    spec: 0.3,
    power: 60,
    fresnel: 0.16,
    edge: 1.1,
    grain: 0,
    stripes: 0,
    shadowLift: 0,
    sparkle: 0.35,
  },
  fabric: {
    spec: 0,
    power: 1,
    fresnel: 0.06,
    edge: 0.35,
    grain: 1.2,
    stripes: 0,
    shadowLift: 0.06,
    sparkle: 0,
  },
};

/**
 * Distance ramps (camera ↔ instance origin, u; smoothstep, tier-independent: the reveal distances in
 * content/props TIER_FADE may move without touching these). `near` drives the edge light and the
 * grain (full ≤ near[0], 0 at near[1]); `classes` drives the class lobes, gone before T0.
 */
export const NEAR_DETAIL = {
  near: [100, 220] as const,
  classes: [220, 380] as const,
  /** Grain: ± this share of L (zero-mean value noise, two octaves). */
  grainL: 0.025,
  /** Grain cell frequencies (1/u); an octave fades out when its cell gets below ~2 px. */
  grainFreq: [2.6, 7.5] as const,
  /** Wood stripe frequency across the grain (1/u) and stretch along it. */
  stripeFreq: 9,
  stripeStretch: 0.06,
  /** Edge line half-width in px (each side of a crease; ≤ 0.75 keeps the pair ≤ 1.5 px). */
  edgePx: 0.7,
  /** Edge light strength (× class edge gain) and the cream the sun tint is lifted toward. */
  edgeGain: 0.3,
  edgeCream: WALLS[0],
  edgeCreamMix: 0.5,
  /** Triangles narrower than this many px get no edge line (no wireframe on small facets). */
  edgeMinTriPx: 6,
  /** Crease threshold: neighbour facets bent more than this (deg) light their shared edge. */
  creaseDeg: 32,
} as const;

/** Global switch per quality tier: x edge light, y grain, z class lobes (low = off, D-156). */
export const SURFACE_QUALITY = {
  low: [0, 0, 0],
  medium: [1, 1, 1],
  high: [1, 1, 1],
} as const;

/**
 * Life program defaults (TASK-594), by life material name: the class of untagged vertices,
 * [lit parts, screen-class parts]. Unlisted materials stay matte. Bots: metal chassis, glass screens.
 */
export const LIFE_CLASS_DEFAULT: Readonly<Record<string, readonly [number, number]>> = {
  'life:workers': [MATERIAL_CLASS.metal, MATERIAL_CLASS.glass],
};

/** Encode: emissive base (< EMISSIVE_STRIDE) + class + crease bits → one float. */
export function encodeSurface(base: number, cls: number, crease = 0): number {
  return base + EMISSIVE_STRIDE * (cls * CREASE_CODES + crease);
}

export interface DecodedSurface {
  base: number;
  cls: number;
  crease: number;
}

export function decodeSurface(e: number): DecodedSurface {
  const code = Math.floor(e / EMISSIVE_STRIDE);
  const cls = Math.floor(code / CREASE_CODES);
  return { base: e - EMISSIVE_STRIDE * code, cls, crease: code - cls * CREASE_CODES };
}

/** The emissive meaning (lamp / screen / blink code) of an encoded value. */
export function emissiveBase(e: number): number {
  return e - EMISSIVE_STRIDE * Math.floor(e / EMISSIVE_STRIDE);
}
