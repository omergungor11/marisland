/**
 * Water tunables (TASK-103). Colours and band distances live in palette.ts
 * (WATER, WATER_BANDS); this file holds the shader's shape/motion numbers.
 * Pure data — the render layer turns these into GLSL #defines.
 */
export const WATER_SHADER = {
  /** Radial grid centred on the camera (ARCHITECTURE §3 "Water"). */
  grid: { rings: 48, segments: 64, innerRadius: 1, outerRadius: 3000, snap: 2 },
  /** ± soft edge of the colour bands in u. */
  bandSoft: 1.5,
  /** Alpha per band: sand shows through near the beach. */
  alpha: { lagoon: 0.55, shallow: 0.8, deep: 0.97 },
  /** Seabed depth (u) range over which a steep drop forces deep alpha. */
  alphaDepth: [6, 16] as const,
  /** Darkening (× colour) of near-shore bands where the seabed is actually deep. */
  depthDarken: { amount: 0.14, from: 2, to: 18 },
  /** Swell is 0 for shore distance < flatUntil and ramps to full by fullAt. */
  swellShore: { flatUntil: 2, fullAt: 12 },
  /** Shading-only exaggeration of the swell slope (the 0.15 u swell is nearly flat). */
  normalScale: 4,
  /** Scrolling ripple normals (shading + glints). */
  ripple: { scale: 0.35, strength: 0.18, speed: [0.21, 0.13] as const, fadeFrom: 60, fadeTo: 320 },
  /** Fresnel sky reflection: base + grazing weight. */
  fresnel: { base: 0.03, grazing: 0.25 },
  foam: {
    /** Shore lap (ART_BIBLE §7 #2): foam advances 0.8 u, 4.5 s, ease-out in / ease-in out. */
    lapPeriod: 4.5,
    lapAdvance: 0.8,
    lapInFraction: 0.4,
    /** Minimum on-screen width of the contact line in pixels (keeps the ring readable at T0). */
    minLinePx: 1.6,
    /** Travelling bands toward the shore. */
    bandSpacing: 3,
    bandPeriod: 4.5,
    bandFadeStart: 4,
    bandFadeEnd: 8,
    bandThreshold: 0.8,
    /** Crest dots in the shallow band: cells per u, fraction of cells lit, dot radius (cell units). */
    dotDensity: 1.2,
    dotFraction: 0.3,
    dotRadius: 0.14,
    /** Wave phase speed for riding the crests (= 28 u / 7 s). */
    dotDrift: 4,
  },
  glint: {
    exponent: 300,
    strength: 2.5,
    goldenBoost: 1.8,
    /** Higher-frequency normal jitter that breaks the sun lobe into sparkles. */
    jitterScale: 1.4,
    jitter: 0.24,
    maskScale: 1.9,
    maskThreshold: [0.67, 0.77] as const,
  },
  moon: {
    strength: 2.2,
    /** Sharpness across the streak (azimuth) and length along it (elevation). */
    lateral: 700,
    vertical: 3,
  },
  trail: { size: 256, extent: 384, decayPerStep: 0.98, stepSec: 1 / 30 },
} as const;
