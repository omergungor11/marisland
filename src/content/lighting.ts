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

/** Fog density multiplier at T0 map distance (≥ 650 u), lerped from 1 at 300 u (D-009). */
export const FOG_T0_SCALE = 0.45;

export const FOG = {
  /** FogExp2 density; also written to SHARED.uFogDensity for manually fogged shaders. */
  density: fitFogExp2(LIGHTING.fogAt) * 0.78,
} as const;

/** Light rig numbers. */
export const LIGHT_RIG = {
  /** HemisphereLight intensity by day / at night (lerped by EnvState.night). */
  hemiDay: 1.1,
  /** Night hemisphere: high enough that shaded land stays ≥ L 12 % (bible §2 rule);
   * only lit materials see it, so sky and water stay deep blue. */
  hemiNight: 2.8,
  /** Multiplier on EnvState.sunIntensity (keys are authored for this rig). */
  sunScale: 1,
  /** Moon (night) light multiplier on the night key's intensity. */
  moonScale: 1.3,
  /** Golden hour (EnvState.golden): extra sun and sky fill so the low sun reads warm and bright. */
  goldenSun: 1.3,
  goldenHemi: 1.25,
  /** Key light dims by this much at the middle of the sun ↔ moon handover (hides the swing). */
  handoverDip: 0.6,
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
  pcfMax: 5,
} as const;

/** Sky dome (TASK-171): gradient + sun disc + moon + hashed stars, one draw call. */
export const SKY = {
  radius: 2500,
  /** Sun disc angular diameter (deg) and HDR brightness (> 1 so bloom catches it). */
  sunDiscDeg: 2.5,
  sunDiscIntensity: 2.4,
  /** Near the horizon the disc grows by this factor (eased in below `sunGrowBelow` elevation sin). */
  sunHorizonScale: 1.7,
  sunGrowBelow: 0.3,
  /** Soft-edge width as a fraction of the disc radius. */
  sunEdge: 0.45,
  /** Soft halo around the sun, multiplies sun colour. */
  sunGlow: 0.35,
  sunGlowPower: 24,
  moonDiscDeg: 3.4,
  moonIntensity: 1.7,
  moonColor: '#F4F1FF',
  /** Moon soft limb (fraction of the radius) — never a hard pixel edge. */
  moonEdge: 0.12,
  /** Crescent: shadow-disc offset in moon radii toward the anti-sun side (0 = new, ≥ 2 = full). */
  moonPhase: 0.62,
  /** Unlit part of the disc: fraction of the moon colour (earthshine) — still hides stars. */
  moonEarthshine: 0.06,
  /** Halo: tight glow (strength, power) + wide bluish glow (strength, power). */
  moonHalo: [0.22, 900, 0.1, 60] as const,
  moonHaloColor: '#9FB4FF',
  /** Stars: grid cells per radian, fraction of lit cells, peak brightness. */
  starCells: 70,
  starDensity: 0.06,
  starBrightness: 1.4,
  /** Max star radius in cells (min = 55 %); ≈ 1.5–2.5 px at 540p, never sub-pixel. */
  starSize: 0.2,
  /** Twinkle: relative depth (±) and base rate (rad/s, varied per star). */
  starTwinkle: 0.22,
  starTwinkleRate: 1.6,
  /** Stars fade in over this elevation band (sin) above the fog band. */
  starHorizonFade: [0.1, 0.32] as const,
  /** Elevation (sin) where the fog colour hands over to the horizon colour, and horizon → zenith. */
  fogBand: 0.06,
  horizonBand: 0.45,
} as const;

/**
 * Moon path (TASK-171). The moon rises in the east (−x) at `rise`, culminates at the midpoint
 * on the −z side (low sun sits on +z, so the moon is opposite-ish), sets in the west at `set`.
 * Hours wrap past midnight. The sky disc and the water's glitter streak follow it; the night
 * key light is `nightKey`. `yawDeg` is tuned so that at 21:30–22:00 the moon sits ahead of the
 * pinned W3/W4 cameras at ≈ their pitch → the moon glitter streak lands on the harbour water.
 */
export const MOON = {
  rise: 17.5,
  set: 6.5,
  peakDeg: 50,
  /** Azimuth yaw of the whole path (deg, about +y). */
  yawDeg: 45,
  /**
   * Night key light ("moonlight") direction, toward the light. Art-directed rather than the sky
   * moon's exact position: from the camera side so village fronts and cliff faces stay readable
   * (land ≥ L 12 %) while the sky moon sits ahead of the W3/W4 cameras for the glitter streak.
   */
  nightKey: [0.55, 0.78, 0.45] as const,
  /** Key light: sun → night key handover hours at dusk and back at dawn (slerp, smoothstep). */
  keyDusk: [19.0, 20.6] as const,
  keyDawn: [4.4, 5.6] as const,
  /** The key light (sun or moon) never drops below this elevation (sin) — land ≥ L 12 %. */
  keyMinY: 0.12,
} as const;

/**
 * Night lights (TASK-171, ART_BIBLE §2 night, §7 #19/#25). Everything that glows at night is
 * an emissive mask × `lamps` (no point lights). Hours are game hours.
 */
export const NIGHT = {
  /** Windows/lanterns switch on one by one over [on0, on1] and off at dawn over [off0, off1]. */
  lampsOn: [18.75, 19.5] as const,
  lampsOff: [5.75, 6.5] as const,
  /** Fraction of windows that go dark late, switching over [lateOff0, lateOff1]. */
  lateOffFraction: 0.3,
  lateOff: [23.0, 23.4] as const,
  /** Prop geos whose lights never go dark late (street/landmark lights). */
  alwaysOn: ['lanternPost', 'lighthouse', 'clocktower', 'stoneLantern'] as readonly string[],
  /**
   * Screen class (TASK-305): vertices with `emissive ≥ 1.5` (monitors, bot eyes; mask = emissive − 1,
   * so 2 → 1) glow by day at `screenDay` × the night glow (× emissiveGain on the albedo: stays
   * under the bloom threshold) and ramp to full glow with `lamps`. All screens switch together
   * (no stagger) and never go dark late.
   */
  screenDay: 0.35,
  /** Screen shimmer (× uMotionScale): a slow per-screen flicker ±`amp` over `period` s plus a soft
   * band ±`scrollAmp` scrolling down the screen at `scrollSpeed` u/s with wavelength `scrollLength` u. */
  screenFlicker: { amp: 0.05, period: 3.5, scrollAmp: 0.08, scrollLength: 1.6, scrollSpeed: 0.5 },
  /** Emissive gain on the mask (> 1 so windows cross the bloom threshold). */
  emissiveGain: 2.6,
  /** Flicker ±amp, periods 0.2–0.5 s (ART_BIBLE §7 #25). */
  flickerAmp: 0.08,
  flickerPeriod: [0.2, 0.5] as const,
  /** Bloom at night: intensity × `bloomBoost`, threshold lowered to `bloomThreshold` (moonlit
   * land stays far below it, so only emissives / moon / beam bloom). Ramp follows `lamps`. */
  bloomBoost: 1.6,
  bloomThreshold: 0.92,
} as const;

/**
 * Lantern pools (TASK-171): additive warm light baked into a small world-space texture
 * (soft falloff, wobbly rim so they never read as discs) and added by terrain, props and water
 * at night. `sources` maps prop geo → pool radius (u), intensity and a door-side offset (u).
 */
export const POOLS = {
  color: '#FFB347',
  /** Texels per u (0.75 → 1.33 u per texel). */
  texelsPerUnit: 0.75,
  /** Ground gain (× albedo × lamps) and the prop / water gains. */
  gain: 1.15,
  propGain: 0.75,
  waterGain: 0.5,
  /** Props: light fades out between these heights above the pool's ground (u). */
  propFade: [1.2, 4.5] as const,
  /** Rim wobble: ± fraction of the radius, angular frequency. */
  wobble: 0.06,
  wobbleFreq: 5,
  /**
   * Falloff (D14: pools read as flat discs before): `peak` / (1 + (t / core)²) × (1 − t²)^window,
   * t = distance / radius — a small bright core, a long quadratic (inverse-square-like) tail that
   * reaches 0 at the rim; peak < 1 so the lamp itself stays brighter than its pool.
   */
  falloff: { core: 0.24, peak: 0.7, window: 1.5 },
  /** Ground facets: pool × (base + (1 − base) · max(N · toLamp, 0)), lamp `lampHeight` u above
   * the pool's ground — the light sits on the faceted ground instead of a flat sticker. */
  facet: { base: 0.3, lampHeight: 2.2 },
  sources: {
    lanternPost: { radius: 5.4, intensity: 1, offset: 0 },
    marketStall: { radius: 4.2, intensity: 0.6, offset: 0.6 },
    cottage: { radius: 3.4, intensity: 0.45, offset: 1.9 },
    logCabin: { radius: 3.4, intensity: 0.45, offset: 1.9 },
    towerHouse: { radius: 3.6, intensity: 0.45, offset: 2.1 },
    stiltHut: { radius: 3.2, intensity: 0.4, offset: 1.5 },
    lighthouse: { radius: 5.4, intensity: 0.5, offset: 0 },
    clocktower: { radius: 4.2, intensity: 0.45, offset: 0 },
    // Phase 3 lamps (TASK-305; geos land in TASK-303 / TASK-341 — unknown geos never match)
    stoneLantern: { radius: 4.2, intensity: 0.7, offset: 0 },
    coffeeKiosk: { radius: 4, intensity: 0.6, offset: 0.7 },
    broadcastStudio: { radius: 3.6, intensity: 0.5, offset: 1.9 },
  } as Record<string, { radius: number; intensity: number; offset: number }>,
} as const;

/**
 * Lighthouse beam (TASK-171, ART_BIBLE §7 #19: 18:30–06:30, 8 s/rev, 40 u cone, opacity 0.35).
 * `lampY` = lamp-room centre above the lighthouse pivot (geo/landmarks.ts: H 9.4 + 0.24 + 0.75).
 */
export const BEAM = {
  color: '#FFE3A6',
  secondsPerRev: 8,
  length: 40,
  /** Half-angle of the cone (deg) and its radius at the lamp (u). */
  halfAngleDeg: 7,
  startRadius: 0.45,
  /** Downward tilt (deg) so the beam grazes the fog over the sea. */
  tiltDeg: 3,
  opacity: 0.35,
  /** Second, fainter beam opposite the first (rotating double lamp), × opacity. */
  backOpacity: 0.45,
  /** Soft edges: power on |N·V| (higher → thinner, softer silhouette). */
  edgePower: 1.6,
  /** Along-axis fade-in from the lamp and fade-out toward the tip (fractions of length). */
  fadeIn: 0.04,
  fadeOut: [0.35, 1.0] as const,
  /** Lamp flare billboard: radius (u), HDR intensity, extra when the beam faces the camera. */
  flareRadius: 2.6,
  flareIntensity: 2.2,
  flareFacing: 6,
  /** The flare quad is pulled this far toward the camera so the lamp-room glass doesn't clip it. */
  flarePull: 1.6,
  lampY: 10.39,
  /** Visible hours: fades in over [on0, on1], out over [off0, off1]. */
  on: [18.5, 18.9] as const,
  off: [6.1, 6.5] as const,
  radialSegments: 16,
  lengthSegments: 6,
} as const;

/** Post-processing (pmndrs) numbers beyond the bible ones in LIGHTING. */
export const POST = {
  goldenColor: '#FFB866',
  /** Night grade: darks/mids shift toward this hue (luminance kept) by night × mix;
   * bright pixels (emissives, moon) are spared so windows stay warm. */
  nightTint: '#7484E0',
  nightMix: 0.5,
  /** Screen spare (TASK-305): luminance ramp [l0, l1] × chroma ramp [c0, c1] with chroma =
   * 1 − r / max(g, b); cyan/blue screens above it keep their hue under the night shift. */
  nightScreenSpare: [0.3, 0.6, 0.6, 0.85] as const,
  /** Night shift ramps in over night ∈ [nightFrom, 1] so dusk keeps its colours. */
  nightFrom: 0.5,
  /** Extra linear lift for the darkest pixels at night (× night tint), keeps land ≥ L 12 %. */
  nightLift: 0.016,
  /** Golden-hour midtone exposure lift (× golden). */
  goldenLift: 0.18,
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
