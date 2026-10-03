/**
 * Weather tunables (TASK-172, ARCHITECTURE §7 "Weather", ART_BIBLE §2 "Weather", §7 #30).
 * Preset colours / saturation / fog scale / cloud cover / gusts come from
 * palette.ts WEATHER_PRESETS; this file holds the FSM table and the look/motion
 * numbers of the weather systems. Pure data.
 */
import type { WeatherName } from '../core/params.ts';

export const WEATHER_STATES: readonly WeatherName[] = ['clear', 'cloudy', 'rain', 'fog'];

export const WEATHER_FSM = {
  /** First state of an unforced run. */
  initial: 'clear' as WeatherName,
  /** Dwell time range (s) per state — clear lingers longest. */
  dwell: {
    clear: [150, 240],
    cloudy: [90, 180],
    rain: [90, 150],
    fog: [90, 140],
  } as Record<WeatherName, readonly [number, number]>,
  /** Markov transition weights: clear → cloudy → rain/fog → clear. */
  next: {
    clear: { cloudy: 1 },
    cloudy: { rain: 0.45, fog: 0.25, clear: 0.3 },
    rain: { clear: 0.6, cloudy: 0.4 },
    fog: { clear: 0.8, cloudy: 0.2 },
  } as Record<WeatherName, Partial<Record<WeatherName, number>>>,
  /** Preset cross-fade (s), smoothstep-eased. */
  blend: 10,
};

/** Per-state EnvState deltas that are not palette values. */
export const WEATHER_DELTAS: Record<
  WeatherName,
  {
    /** How far zenith/horizon move toward the preset sky colour. */
    skyMix: number;
    /** How far the fog colour moves toward the preset fog/sky/mist colour. */
    fogMix: number;
    sunScale: number;
    /** Hemisphere sky mix toward the preset sky (cooler shade). */
    hemiMix: number;
    swell: number;
    /** Golden-hour overlay kept (overcast kills the warm cast). */
    golden: number;
    rain: number;
    mist: number;
  }
> = {
  clear: { skyMix: 0, fogMix: 0, sunScale: 1, hemiMix: 0, swell: 1, golden: 1, rain: 0, mist: 0 },
  cloudy: {
    skyMix: 0.5,
    fogMix: 0.45,
    sunScale: 0.85,
    hemiMix: 0.1,
    swell: 1.1,
    golden: 0.6,
    rain: 0,
    mist: 0,
  },
  rain: {
    skyMix: 0.62,
    fogMix: 0.7,
    sunScale: 0.7,
    hemiMix: 0.12,
    swell: 1.3,
    golden: 0.3,
    rain: 1,
    mist: 0,
  },
  fog: {
    skyMix: 0.25,
    fogMix: 0.55,
    sunScale: 0.85,
    hemiMix: 0.15,
    swell: 0.8,
    golden: 0.7,
    rain: 0,
    mist: 1,
  },
};

/** Early-morning mist band (ART_BIBLE W7): clear/cloudy mornings get a low mist. */
export const MORNING_MIST = { from: 5.5, full: [6.0, 7.0] as const, to: 7.5, amount: 0.6 };

/** Rain streaks (ARCHITECTURE R5: opaque-dithered, camera-wrapped box). */
export const RAIN = {
  count: { low: 800, medium: 2000, high: 4000 },
  /** Wrapped box around the camera (u): x, y, z. Centre is shifted down by `boxDrop`. */
  box: [60, 40, 60] as const,
  boxDrop: 8,
  /** Box centre pushed along the view direction (u) so most streaks are in front of the lens. */
  ahead: 22,
  speed: 18,
  /** Horizontal drift per u of fall, along uWind.xy. */
  lean: 0.18,
  length: 0.6,
  width: 0.03,
  /** Minimum on-screen width as a fraction of distance (≈ 1.3 px at 1080p, 50° fov). */
  minWidthPerU: 0.0011,
  color: '#DCE6F0',
  alpha: 0.5,
  /** Streaks closer than this fade out (no giant near-plane bars). */
  nearFade: [1.0, 3.0] as const,
};

/** Rain ripple rings on the water (ART_BIBLE §7 #30). */
export const RIPPLES = {
  cell: 1.5,
  period: 0.8,
  radius: 0.6,
  /** Fraction of cells active at uRain = 1. */
  density: 0.3,
  /** Ring brightness × WATER.foam. */
  strength: 0.6,
  /** Ring line width (u), widened to ≥ 0.75 px. */
  width: 0.05,
};

/** Low mist band (ART_BIBLE §2: y 0–6 u). */
export const MIST = {
  /** Stacked layer heights per quality (u). */
  layers: { low: [2], medium: [1.5, 4], high: [1.2, 3, 4.8] } as Record<string, number[]>,
  size: 1600,
  /** Full below yFull, zero at yMax. */
  yFull: 1,
  /** Fade toward the slab edge, distance from its centre (the camera's ground focus) (u). */
  far: [450, 780] as const,
  /** Soft intersection with the terrain (u above ground for full alpha). */
  soft: 1.6,
  alpha: 0.55,
  /** Noise scale (1/u) and drift speed (u/s along the wind). */
  noiseScale: 0.018,
  drift: 1.2,
  /** Night tint factor (× uNight). */
  night: 0.7,
};

/** Sky under cloud cover: sun disc + glow × (1 − sunDim · cover′), cover′ from coverFrom → 1. */
export const WEATHER_SKY = { sunDim: 0.85, coverFrom: 0.4 };

/**
 * Grade: how much of the weather desaturation green foliage is spared. > 1 turns it into a small
 * boost for green (1.25 → +5 % in rain): wet leaves read lush, and W10 wants foliage sat ≥ 40 %.
 */
export const WEATHER_GRADE = { foliageKeep: 1.25 };
