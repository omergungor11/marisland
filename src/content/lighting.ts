/**
 * Render-side lighting/atmosphere tuning (ART_BIBLE §3), data only. Bible-facing
 * constants (bloom, vignette, tilt-shift bands, rim, fog curve) live in
 * `palette.ts` → `LIGHTING`; this file holds the derived/tuned numbers the
 * render layer needs on top of them.
 */
import { LIGHTING } from './palette.ts';

/**
 * Fit a FogExp2 density (f = 1 − exp(−(d·x)²)) to the bible's fog curve,
 * least squares on √(−ln(1 − f)) = d·x, weighted by distance. With the bible
 * points (200 u 10 %, 700 u 45 %, 1200 u 75 %) this gives
 * 200 u ≈ 4 %, 700 u ≈ 40 %, 1200 u ≈ 78 % (d ≈ 0.00103), then × 0.78 (D-009: the T0 postcard at
 * 450–650 u was turning grey; 0.0008 keeps deep water blue and far islands pastel) — near views stay crisp, far
 * islands go pastel but never vanish.
 */
export function fitFogExp2(points: readonly (readonly [number, number])[]): number {
  let num = 0;
  let den = 0;
  for (const [x, f] of points) {
    const y = Math.sqrt(-Math.log(1 - f));
    num += x * y;
    den += x * x;
  }
  return num / den;
}

export const FOG = {
  /** FogExp2 density; also written to SHARED.uFogDensity for manually fogged shaders. */
  density: fitFogExp2(LIGHTING.fogAt) * 0.78,
} as const;

/** Light rig numbers. */
export const LIGHT_RIG = {
  /** HemisphereLight intensity by day / at night (lerped by EnvState.night). */
  hemiDay: 1.1,
  hemiNight: 0.75,
  /** Multiplier on EnvState.sunIntensity (keys are authored for this rig). */
  sunScale: 1,
  /** Moon (night) light multiplier on the night key's intensity. */
  moonScale: 1,
} as const;

/**
 * Explicit shade tint (lit materials + terrain via SHARED_LIT_GLSL). Measured on
 * 2026-10-03: hemisphere light alone leaves cast shadows grey-brown (sand shade
 * hue 76°, wall shade 42°) → P4 fails, so the tint is on. Mix is 0.40 instead of
 * the bible's 0.35 so shaded sand lands inside the W2 window (hue ≥ 220°).
 */
export const SHADE = {
  enabled: true,
  tintMix: 0.4,
  /** N·L below which a face counts as form shade (smooth ramp from 0). */
  formNdl: 0.35,
} as const;

/** Fitted directional shadow (ARCHITECTURE §3 "Shadows"). */
export const SHADOW = {
  /** World-space slab the receivers/casters live in. */
  slabMinY: -2,
  slabMaxY: 40,
  /** Constant depth bias (shadow-map depth units). */
  bias: -0.0005,
  /** normalBias = clamp(texel × perTexel, min, max) in world units. */
  normalBiasPerTexel: 1.2,
  normalBiasMin: 0.02,
  normalBiasMax: 0.6,
  /** Truncate the view frustum at `focusDist × farK` (clamped) before fitting. */
  farK: 2.2,
  farMin: 80,
  farMax: 1400,
  /** Light-space box side caps per quality (T0 accepts softer shadows). */
  maxSize: { low: 0, medium: 760, high: 900 } as Record<string, number>,
  /** Box side is quantised to this step (u) so it does not breathe while panning. */
  sizeStep: 16,
  /** Extra depth range toward the light for off-screen casters (u, divided by sin(elev)). */
  casterReach: 46,
  /** PCF radius in texels = penumbra / texel, clamped. */
  pcfMin: 1,
  pcfMax: 3,
} as const;

/** Sky dome. */
export const SKY = {
  radius: 2500,
  /** Sun disc angular diameter (deg) and HDR brightness (> 1 so bloom catches it). */
  sunDiscDeg: 2.5,
  sunDiscIntensity: 6,
  /** Soft halo around the sun, multiplies sun colour. */
  sunGlow: 0.35,
  sunGlowPower: 24,
  moonDiscDeg: 3.2,
  moonIntensity: 1.6,
  moonColor: '#F4F1FF',
  /** Stars: grid cells per radian, fraction of lit cells, peak brightness. */
  starCells: 90,
  starDensity: 0.07,
  starBrightness: 1.4,
  /** Elevation (sin) where the fog colour hands over to the horizon colour, and horizon → zenith. */
  fogBand: 0.06,
  horizonBand: 0.45,
} as const;

/** Post-processing (pmndrs) numbers beyond the bible ones in LIGHTING. */
export const POST = {
  goldenColor: '#FFB866',
  /** Night grade: darks/mids shift toward this hue (luminance kept) by night × mix;
   * bright pixels (emissives, moon) are spared so windows stay warm. */
  nightTint: '#7484E0',
  nightMix: 0.5,
  /** Linear lift added to blacks (lifted blacks, bible §3 "Grade"). */
  lift: 0.004,
  /** Kawase SMALL kernel at half res ≈ this many full-res px of blur per unit scale. */
  tiltPxPerScale: 4.4,
  /** Feather (in the effect's −1..1 vertical units) between sharp centre and blurred band. */
  tiltFeather: 0.25,
  /** DOF (high quality, T3): focus range in u and bokeh px. */
  dofFocusRange: 18,
  /** Bloom threshold actually used: bible 0.9 is measured on tone-mapped output; in linear
   * HDR sunlit sand reaches ≈ 0.95, so we gate at 1.0 to keep land out of bloom. */
  bloomThreshold: Math.max(LIGHTING.bloom.threshold, 1.0),
  bloomSmoothing: 0.08,
} as const;
