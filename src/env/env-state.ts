import { ENV_KEYS, type EnvKey } from '../content/palette.ts';
import { hexToLinear, lerpRgb, type Rgb } from './color.ts';
import { createWeather } from './weather.ts';
import { WEATHER_BOOT, WEATHER_HOOK } from './weather-hook.ts';

export { hexToLinear, hexToSrgb, luminance, type Rgb } from './color.ts';
export { WEATHER_BOOT, WEATHER_HOOK } from './weather-hook.ts';

/**
 * EnvState (ARCHITECTURE §7): one sampled object per frame from the bible's
 * time-of-day keys. Colours are linear RGB triplets (no three import so it is
 * testable in Node); render/uniforms.ts copies them into shared uniforms.
 */
export interface EnvState {
  hour: number;
  zenith: Rgb;
  horizon: Rgb;
  sunColor: Rgb;
  sunIntensity: number;
  hemiSky: Rgb;
  hemiGround: Rgb;
  fog: Rgb;
  shadowTint: Rgb;
  /** 0 day → 1 night. */
  night: number;
  /** Unit sun (or moon at night) direction, world space. */
  sunDir: { x: number; y: number; z: number };
  /** Sun elevation in radians (negative below the horizon). */
  sunElevation: number;
  /** Exposure multiplier. */
  exposure: number;
  /** Golden-hour warm overlay 0..1. */
  golden: number;
  // --- weather deltas (TASK-172; neutral values when clear) ---
  /** Grade saturation delta (−0.2 rain … 0 clear) → SHARED.uWeatherSat. */
  saturation: number;
  /** Fog density multiplier (×1.8 rain). Applied by sky.update to SHARED.uFogDensity + scene fog. */
  fogScale: number;
  /** Low mist band strength 0..1 → SHARED.uMist. */
  mist: number;
  /** Rain amount 0..1 → SHARED.uRain (streaks + water ripples). */
  rain: number;
  /** Cloud cover 0..1 (clear 0.35, cloudy 0.75, rain 0.9) — for the clouds system + sun-disc dimming. */
  cloudCover: number;
  /** Wind gust strength multiplier → SHARED.uWind.z. */
  gustScale: number;
  /** Swell amplitude multiplier → SHARED.uSwell.x. */
  swellScale: number;
}

interface LinearKey {
  hour: number;
  zenith: Rgb;
  horizon: Rgb;
  sun: Rgb;
  sunIntensity: number;
  hemiSky: Rgb;
  hemiGround: Rgb;
  fog: Rgb;
  shadowTint: Rgb;
  night: number;
}

const toLinearKey = (k: EnvKey): LinearKey => ({
  hour: k.hour,
  zenith: hexToLinear(k.zenith),
  horizon: hexToLinear(k.horizon),
  sun: hexToLinear(k.sun),
  sunIntensity: k.sunIntensity,
  hemiSky: hexToLinear(k.hemiSky),
  hemiGround: hexToLinear(k.hemiGround),
  fog: hexToLinear(k.fog),
  shadowTint: hexToLinear(k.shadowTint),
  night: k.night,
});

/** Keys in linear space, extended so 24 h wraps (night key at hour 29 = 05:00). */
const KEYS: LinearKey[] = (() => {
  const base = ENV_KEYS.map(toLinearKey);
  // prepend the last key shifted −24 so hours 0–5.5 interpolate night → dawn
  const last = base[base.length - 1];
  return [{ ...last, hour: last.hour - 24 }, ...base];
})();

const smooth = (t: number): number => t * t * (3 - 2 * t);

export function createEnvState(): EnvState {
  return {
    hour: 12,
    zenith: { r: 0, g: 0, b: 0 },
    horizon: { r: 0, g: 0, b: 0 },
    sunColor: { r: 0, g: 0, b: 0 },
    sunIntensity: 1,
    hemiSky: { r: 0, g: 0, b: 0 },
    hemiGround: { r: 0, g: 0, b: 0 },
    fog: { r: 0, g: 0, b: 0 },
    shadowTint: { r: 0, g: 0, b: 0 },
    night: 0,
    sunDir: { x: 0, y: 1, z: 0 },
    sunElevation: 1,
    exposure: 1,
    golden: 0,
    saturation: 0,
    fogScale: 1,
    mist: 0,
    rain: 0,
    cloudCover: 0.35,
    gustScale: 1,
    swellScale: 1,
  };
}

/** Sample the day cycle at `hour` [0,24) into `out`. `windDir` sets the sun azimuth frame. */
export function sampleEnv(hour: number, out: EnvState): EnvState {
  const h = ((hour % 24) + 24) % 24;
  out.hour = h;
  // find bracket (KEYS sorted by hour, covering −?..29)
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1].hour <= h) i++;
  const a = KEYS[i];
  const b = KEYS[i + 1];
  const t = smooth(Math.min(1, Math.max(0, (h - a.hour) / (b.hour - a.hour))));
  lerpRgb(a.zenith, b.zenith, t, out.zenith);
  lerpRgb(a.horizon, b.horizon, t, out.horizon);
  lerpRgb(a.sun, b.sun, t, out.sunColor);
  out.sunIntensity = a.sunIntensity + (b.sunIntensity - a.sunIntensity) * t;
  lerpRgb(a.hemiSky, b.hemiSky, t, out.hemiSky);
  lerpRgb(a.hemiGround, b.hemiGround, t, out.hemiGround);
  lerpRgb(a.fog, b.fog, t, out.fog);
  lerpRgb(a.shadowTint, b.shadowTint, t, out.shadowTint);
  out.night = a.night + (b.night - a.night) * t;

  // Sun path: rises 05:30 in the east (−x), culminates 12:00 at 62°, sets 19:15 in the west.
  // Moon takes over at night on the opposite side at a modest elevation.
  const dayFrac = (h - 5.5) / (19.25 - 5.5);
  if (dayFrac >= 0 && dayFrac <= 1 && out.night < 0.999) {
    const az = (0.5 - dayFrac) * Math.PI; // +90° → −90°
    const el = (Math.sin(dayFrac * Math.PI) * (62 * Math.PI)) / 180 + 0.05;
    out.sunElevation = el;
    out.sunDir.x = -Math.cos(el) * Math.sin(az);
    out.sunDir.y = Math.sin(el);
    out.sunDir.z = -Math.cos(el) * Math.cos(az) * 0.6 + 0.3;
  } else {
    // moon: fixed high-ish in the south-west
    const el = (38 * Math.PI) / 180;
    out.sunElevation = el;
    out.sunDir.x = 0.55 * Math.cos(el);
    out.sunDir.y = Math.sin(el);
    out.sunDir.z = 0.45 * Math.cos(el);
  }
  const len = Math.hypot(out.sunDir.x, out.sunDir.y, out.sunDir.z) || 1;
  out.sunDir.x /= len;
  out.sunDir.y /= len;
  out.sunDir.z /= len;
  // keep the light above the horizon so land never goes black (bible: min L 12 %)
  if (out.sunDir.y < 0.12) {
    const hz = Math.hypot(out.sunDir.x, out.sunDir.z) || 1;
    const s = Math.sqrt(1 - 0.12 * 0.12) / hz;
    out.sunDir.x *= s;
    out.sunDir.z *= s;
    out.sunDir.y = 0.12;
  }
  out.golden =
    h > 16.5 && h < 19.25
      ? Math.sin(((h - 16.5) / (19.25 - 16.5)) * Math.PI)
      : h > 5.5 && h < 7
        ? 1 - (h - 5.5) / 1.5
        : 0;
  out.exposure = 1;
  out.saturation = 0;
  out.fogScale = 1;
  out.mist = 0;
  out.rain = 0;
  out.cloudCover = 0.35;
  out.gustScale = 1;
  out.swellScale = 1;
  if (!WEATHER_HOOK.apply) createWeather(WEATHER_BOOT.seed, WEATHER_BOOT.forced);
  WEATHER_HOOK.apply?.(out);
  return out;
}
