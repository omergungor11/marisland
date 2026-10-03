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
  /** Smooth noise added to the shore distance before banding (± u) — hides SDF cell steps. */
  bandJitter: 0.8,
  /** Box-blur radius (u, 3 passes) of the leeward ring-scale field (D3: seams between islands'
   *  shelves and across bays blend over ≈ 2× this instead of cutting). */
  ringScaleBlur: 10,
  /** Alpha per band: sand shows through near the beach. */
  alpha: { lagoon: 0.55, shallow: 0.8, deep: 0.97 },
  /** Seabed depth (u) range over which a steep drop forces deep alpha. */
  alphaDepth: [6, 16] as const,
  /** Darkening (× colour) of near-shore bands where the seabed is actually deep. */
  depthDarken: { amount: 0.14, from: 4, to: 20 },
  /** Swell is 0 for shore distance < flatUntil and ramps to full by fullAt. */
  swellShore: { flatUntil: 2, fullAt: 12 },
  /** Shading-only exaggeration of the swell slope (the 0.15 u swell is nearly flat). */
  normalScale: 4,
  /** Scrolling ripple normals (shading + glints). */
  ripple: { scale: 0.35, strength: 0.18, speed: [0.21, 0.13] as const, fadeFrom: 60, fadeTo: 320 },
  /** Fresnel sky reflection: base + grazing weight. */
  fresnel: { base: 0.03, grazing: 0.25, max: 0.2, zenith: 0.35 },
  /** Light on the water: sun colour tint by day; how much of the hemisphere hue survives at night. */
  light: { sunTint: 0.2, nightTint: 0.3 },
  /** View-angle haze exponent: pow(1 − |viewDir.y|, k) toward the fog colour. */
  viewHazePow: 16,
  /**
   * Low-sun (golden/dusk) warm glitter path: active below sun y[1], full below y[0] (and with the
   * golden-hour ramp). Same model as the moon path (`glitter` below); `dayGlintFade` = how much of
   * the scattered high-sun glints the path replaces at full low sun / golden (D7: no confetti).
   */
  lowSun: {
    y: [0.15, 0.35] as const,
    lobe: { across: 520, along: 30 },
    sparkle: { density: 1.0, fraction: 0.5, radius: 0.13, rate: 0.55, gain: 3 },
    glow: 0.18,
    farGlow: 0.45,
    dayGlintFade: 0.9,
  },
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
  /**
   * Moon glitter path (D6; ART_BIBLE §2 night "moon glitter streak"). A pixel can glint when the
   * facet normal needed to mirror the moon into the eye (the moon/view half vector) is close to
   * the swell normal: gaussian lobe on the half vector's tilt, `across` the path (sharp) and
   * `along` it (long) → a narrow streak toward the moon. Inside the lobe, sparse twinkling
   * sparkle cells (`density` cells per u, `fraction` lit at the lobe centre, `radius` in cell
   * units, `rate` twinkles/s, `gain` HDR) over a faint `glow`; once cells shrink below ~2 px the
   * sparkles fold into `farGlow`. `far` = distance fade (u) so the far sea stays calm.
   */
  moon: {
    /** How much of the swell / ripple normal tilts the path (low → a straight streak). */
    normal: [0.35, 0.1] as const,
    lobe: { across: 900, along: 40 },
    sparkle: { density: 1.3, fraction: 0.6, radius: 0.11, rate: 0.6, gain: 2.4 },
    glow: 0.06,
    farGlow: 0.25,
    far: [160, 520] as const,
  },
  trail: { size: 256, extent: 384, decayPerStep: 0.98, stepSec: 1 / 30 },
} as const;
