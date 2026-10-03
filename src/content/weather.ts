/**
 * Weather (TASK-172, ARCHITECTURE §7 "Weather", ART_BIBLE §2 weather table + §3). Data only:
 * the FSM (`env/weather.ts`) blends these looks into EnvState deltas, the render layer turns the
 * rain / ripple / mist numbers into uniforms and defines.
 *
 * Bible numbers come from `palette.ts` WEATHER_PRESETS (saturation, fog scale, sky / fog colour,
 * cloud cover, gust, mist band); everything else here is tuning on top of them.
 */
import { WEATHER_PRESETS } from './palette.ts';
import type { WeatherName } from '../core/params.ts';

export type { WeatherName };
export const WEATHER_NAMES: readonly WeatherName[] = ['clear', 'cloudy', 'rain', 'fog'];

/**
 * One weather look. `clear` is the identity (every delta neutral) — a fully clear blend leaves
 * EnvState and every uniform bit-identical to the no-weather build.
 */
export interface WeatherLook {
  /** Cloud cover as a fraction of the CLOUDS.cells² candidate cells; the seed's own count is the
   *  floor (clear keeps it). */
  cloudCover: number;
  /** Cloud width × (the projected cloud shadows follow). */
  cloudScale: number;
  /** Cloud colour toward a luminance-kept grey (0..1) and brightness ×. */
  cloudGrey: number;
  cloudDim: number;
  /** Cloud-shadow strength × (base 1 − CLOUDS.shadowMul). */
  cloudShadow: number;
  /** Wind / gust strength (SHARED.uWind.z → foliage sway, windmill, gust fronts). */
  gust: number;
  /** Swell amplitude ×. Boats sample content SWELL on the CPU, so keep this modest. */
  swell: number;
  /** Exponential fog density ×. */
  fog: number;
  /** Low mist band: density at sea level (1/u; 0 = off), e-folding height (u), max amount.
   *  Over the open sea the amount depends on the view pitch only (τ ≈ density × height / sin),
   *  so one density reads the same at every zoom tier. */
  mist: number;
  mistHeight: number;
  mistMax: number;
  /** Sky / fog colour desaturation 0..1 — all quality tiers (the bible's weather saturation is
   *  carried here, on the atmosphere; see D-013). */
  desat: number;
  /** Sky / fog / hemisphere tint: the bible colour by day, luminance-kept at night. */
  tint: string;
  tintMix: number;
  /** Share of `desat` / `tint` that also reaches the light colours (hemisphere, sun) and so the
   *  land: low keeps foliage saturated in the rain (W10: foliage saturation ≥ 40 %). */
  lightTint: number;
  /** Sky / fog / hemisphere brightness ×. */
  bright: number;
  /** Key-light intensity × and tint toward a cooler white. */
  sun: number;
  sunTint: string;
  sunTintMix: number;
  /** Overcast veil 0..1: hides the sun disc, water glints, golden overlay, stars and moon. */
  veil: number;
  /** Windows / lanterns at least this much on (a rainy afternoon lights the houses). */
  lamps: number;
  /** Rain intensity 0..1 (streak count, ripple density). */
  rain: number;
  /** Sky fog band widened by this much (sin elevation). */
  fogBand: number;
  /** Lighthouse beam brightness boost (+, the beam reads in the mist). */
  beam: number;
  /** Post-grade saturation delta (medium / high), whole frame — kept small (D-013). */
  saturation: number;
}

const P = WEATHER_PRESETS;

export const WEATHER_LOOKS: Record<WeatherName, WeatherLook> = {
  clear: {
    cloudCover: 0,
    cloudScale: 1,
    cloudGrey: 0,
    cloudDim: 1,
    cloudShadow: 1,
    gust: P.clear.gust,
    swell: 1,
    fog: P.clear.fogScale,
    mist: 0,
    mistHeight: P.fog.mist.yMax / 2,
    mistMax: 0,
    desat: 0,
    tint: '#FFFFFF',
    tintMix: 0,
    lightTint: 0,
    bright: 1,
    sun: 1,
    sunTint: '#FFFFFF',
    sunTintMix: 0,
    veil: 0,
    lamps: 0,
    rain: 0,
    fogBand: 0,
    beam: 0,
    saturation: P.clear.saturation,
  },
  cloudy: {
    cloudCover: P.cloudy.cloudCover,
    cloudScale: 1.25,
    cloudGrey: 0.3,
    cloudDim: 0.9,
    cloudShadow: 1.8,
    gust: P.cloudy.gust,
    swell: 1.2,
    fog: P.cloudy.fogScale,
    mist: 0,
    mistHeight: P.fog.mist.yMax / 2,
    mistMax: 0,
    desat: -P.cloudy.saturation,
    tint: P.cloudy.sky,
    tintMix: 0.45,
    lightTint: 0.5,
    bright: 0.92,
    sun: 0.72,
    sunTint: '#E6EEFF',
    sunTintMix: 0.45,
    veil: 0.35,
    lamps: 0,
    rain: 0,
    fogBand: 0.02,
    beam: 0,
    saturation: P.cloudy.saturation * 0.3,
  },
  rain: {
    cloudCover: P.rain.cloudCover,
    cloudScale: 1.4,
    cloudGrey: 0.65,
    cloudDim: 0.62,
    cloudShadow: 1.1,
    gust: P.rain.gust,
    swell: 1.4,
    fog: P.rain.fogScale,
    mist: 0.04,
    mistHeight: P.fog.mist.yMax / 2,
    mistMax: 0.45,
    desat: -P.rain.saturation,
    tint: P.rain.fog,
    tintMix: 0.7,
    lightTint: 0.12,
    bright: 0.86,
    sun: 0.62,
    sunTint: '#DCE6FF',
    sunTintMix: 0.35,
    veil: 0.9,
    lamps: 1,
    rain: 1,
    fogBand: 0.05,
    beam: 0.4,
    saturation: 0,
  },
  fog: {
    cloudCover: P.fog.cloudCover,
    cloudScale: 1.15,
    cloudGrey: 0.35,
    cloudDim: 0.95,
    cloudShadow: 0.4,
    gust: P.fog.gust,
    swell: 0.6,
    fog: 2.4,
    mist: 0.08,
    mistHeight: (P.fog.mist.yMax * 2) / 3,
    mistMax: 0.74,
    desat: 0.4,
    tint: P.fog.mist.color,
    tintMix: 0.35,
    lightTint: 0.6,
    bright: 1,
    sun: 0.7,
    sunTint: '#FFF4E4',
    sunTintMix: 0.3,
    veil: 0.6,
    lamps: 0,
    rain: 0,
    fogBand: 0.1,
    beam: 1.2,
    saturation: -0.08,
  },
};

/** FSM timing (seconds of render time, `clock.time`). */
export const WEATHER_FSM = {
  /** Auto cycle starts here unless `?weather=` forces a state. */
  initial: 'clear' as WeatherName,
  /** Preset cross-fade (ARCHITECTURE §7: ≈ 10 s). */
  blendSeconds: 10,
  /** Dwell per state [min, max) s — drawn per transition from `rng.fork('weather', index)`. */
  dwell: {
    clear: [180, 360],
    cloudy: [90, 200],
    rain: [60, 150],
    fog: [60, 140],
  } as Record<WeatherName, readonly [number, number]>,
  /** Markov transition weights (next state | current state); self-transitions are not allowed. */
  next: {
    clear: { cloudy: 0.6, fog: 0.25, rain: 0.15 },
    cloudy: { clear: 0.45, rain: 0.4, fog: 0.15 },
    rain: { cloudy: 0.6, clear: 0.3, fog: 0.1 },
    fog: { clear: 0.6, cloudy: 0.4 },
  } as Record<WeatherName, Partial<Record<WeatherName, number>>>,
} as const;

/** Rain streaks: one camera-local wrapped box of instanced quads (render/weather/rain.ts). */
export const RAIN = {
  /** Streak instances per quality at full intensity (counted against BUDGETS.particles). */
  count: { low: 1200, medium: 2400, high: 4200 },
  /** Box edge = camera ↔ focus distance × k, clamped (the box scales with the zoom, so the
   *  on-screen density is the same at every tier). Height = edge × aspectY. */
  box: { k: 0.9, min: 36, max: 640, aspectY: 0.8 },
  /** The box centre sits this fraction of the edge ahead of the camera (fills the view). */
  ahead: 0.42,
  /** Edge length at which speed / streak length are authored; both scale with the box. */
  refEdge: 100,
  /** Fall speed (u/s at refEdge) and ±fraction per drop. */
  speed: 38,
  speedJitter: 0.18,
  /** Horizontal drift along the wind (u/s per unit wind strength, at refEdge). */
  lean: 7,
  /** Streak length = speed × this (s, motion blur), ±lengthJitter. */
  streakSeconds: 0.045,
  lengthJitter: 0.35,
  /** Streak width as an angle (rad) — resolution independent (≈ 1 px at 540 p, 2 px at 1080 p). */
  widthRad: 0.0011,
  /** Fade in from the camera (u at refEdge) so near drops don't fill the frame. */
  nearFade: [3, 10] as const,
  /** Fraction of the half box where drops fade out toward the wrap edge. */
  edgeFade: 0.6,
  /** Linear-ish streak colour (×  the fog-colour luminance by `lit`). */
  color: '#E4ECF6',
  /** Brightness: streak = color × (base + lit × fog luminance / color luminance). */
  base: 0.08,
  lit: 1.25,
  /** Peak dither coverage of a streak (< 1 keeps the curtain see-through). */
  opacity: 0.85,
} as const;

/** Rain ripple rings in the water shader (hash-placed cells, two layers; ART_BIBLE §7 #30). */
export const RIPPLES = {
  /** Cells per u (one ring per active cell; cells are active with p = rain intensity). */
  density: 0.6,
  /** Bible #30: a ring grows 0 → 0.6 u over 0.8 s, ease-out. */
  seconds: 0.8,
  radius: 0.6,
  /** Ring line width (cell units); widened to ≥ 0.7 px footprint. */
  width: 0.05,
  /** Brightening toward foam and normal perturbation. */
  bright: 0.5,
  normal: 0.9,
  /** Fade out as the pixel footprint grows (u per pixel): the brightening by `brightFootprint`,
   *  the normal by `footprint` (shading-only speckle survives a little further out). */
  brightFootprint: [0.12, 0.45] as const,
  footprint: [0.25, 0.9] as const,
} as const;

/** Mist band noise (soft, drifting thickness variation). */
export const MIST = {
  color: WEATHER_PRESETS.fog.mist.color,
  /** How far the mist hue replaces the fog colour (luminance kept, slightly lifted). */
  colorMix: 0.6,
  lift: 1.06,
  /** Noise frequency (1/u), depth (±), drift speed along the wind (u/s). */
  noiseScale: 0.018,
  noiseAmount: 0.8,
  drift: 2.5,
} as const;
