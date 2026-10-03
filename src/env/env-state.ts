import { ENV_KEYS, type EnvKey } from '../content/palette.ts';
import { BEAM, MOON, NIGHT } from '../content/lighting.ts';

/**
 * EnvState (ARCHITECTURE §7): one sampled object per frame from the bible's
 * time-of-day keys. Colours are linear RGB triplets (no three import so it is
 * testable in Node); render/uniforms.ts copies them into shared uniforms.
 */
export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

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
  /**
   * Unit key-light direction, world space: the sun by day, the art-directed moonlight
   * (MOON.nightKey) at night, slerped over MOON.keyDusk / keyDawn; never below MOON.keyMinY.
   * Lights, water shading, cloud shadows. The sky moon is `moonDir`.
   */
  sunDir: Vec3;
  /** Key-light elevation in radians. */
  sunElevation: number;
  /** Sun → moon key-light handover 0..1 (the rig dips the light mid-swap). */
  keyBlend: number;
  /** True sun direction for the sky disc (may be below the horizon). */
  sunSkyDir: Vec3;
  /** True moon direction (sky disc; may be below the horizon). */
  moonDir: Vec3;
  /** Moon disc visibility 0..1 (above the horizon × night). */
  moonVis: number;
  /** Star alpha 0..1 (0 by day). */
  starAlpha: number;
  /** Windows/lanterns/pools on 0..1 (instances stagger their switch-on inside this ramp). */
  lamps: number;
  /** Late-night switch-off progress 0..1 (NIGHT.lateOffFraction of windows go dark). */
  lampsLateOff: number;
  /** Lighthouse beam visibility 0..1. */
  beam: number;
  /** Night bloom ramp 0..1 (post: intensity × boost, lowered threshold). */
  bloom: number;
  /** Exposure multiplier. */
  exposure: number;
  /** Golden-hour warm overlay 0..1. */
  golden: number;
}

const srgbToLinear = (c: number): number =>
  c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;

export function hexToLinear(hex: string, out: Rgb = { r: 0, g: 0, b: 0 }): Rgb {
  const n = parseInt(hex.replace('#', ''), 16);
  out.r = srgbToLinear(((n >> 16) & 255) / 255);
  out.g = srgbToLinear(((n >> 8) & 255) / 255);
  out.b = srgbToLinear((n & 255) / 255);
  return out;
}

export function hexToSrgb(hex: string, out: Rgb = { r: 0, g: 0, b: 0 }): Rgb {
  const n = parseInt(hex.replace('#', ''), 16);
  out.r = ((n >> 16) & 255) / 255;
  out.g = ((n >> 8) & 255) / 255;
  out.b = (n & 255) / 255;
  return out;
}

/** Relative luminance of a linear rgb. */
export const luminance = (c: Rgb): number => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;

const lerpRgb = (a: Rgb, b: Rgb, t: number, out: Rgb): Rgb => {
  out.r = a.r + (b.r - a.r) * t;
  out.g = a.g + (b.g - a.g) * t;
  out.b = a.b + (b.b - a.b) * t;
  return out;
};

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
const clamp01 = (t: number): number => Math.min(1, Math.max(0, t));
const ramp = (x: number, a: number, b: number): number => clamp01((x - a) / (b - a));
const smoothstep = (a: number, b: number, x: number): number => smooth(ramp(x, a, b));

const DEG = Math.PI / 180;
/** Sunrise / sunset hours (dawn and dusk keys). */
const SUNRISE = 5.5;
const SUNSET = 19.25;

const vec = (): Vec3 => ({ x: 0, y: 1, z: 0 });
const normalize = (v: Vec3): Vec3 => {
  const l = Math.hypot(v.x, v.y, v.z) || 1;
  v.x /= l;
  v.y /= l;
  v.z /= l;
  return v;
};
/** Lift a unit direction to at least elevation sin `minY`, keeping its azimuth. */
const clampUp = (v: Vec3, minY: number, out: Vec3): Vec3 => {
  out.x = v.x;
  out.y = v.y;
  out.z = v.z;
  if (out.y < minY) {
    const hz = Math.hypot(out.x, out.z) || 1;
    const s = Math.sqrt(1 - minY * minY) / hz;
    out.x *= s;
    out.z *= s;
    out.y = minY;
  }
  return out;
};

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
    sunDir: vec(),
    sunElevation: 1,
    keyBlend: 0,
    sunSkyDir: vec(),
    moonDir: vec(),
    moonVis: 0,
    starAlpha: 0,
    lamps: 0,
    lampsLateOff: 0,
    beam: 0,
    bloom: 0,
    exposure: 1,
    golden: 0,
  };
}

/**
 * True sun direction over the full day: rises 05:30 in the east (−x), culminates 12:00 at 62°,
 * sets 19:15 in the west, then continues below the horizon (hidden by the fog band).
 */
export function sunSkyDir(h: number, out: Vec3): Vec3 {
  let az: number;
  let el: number;
  const dayFrac = (h - SUNRISE) / (SUNSET - SUNRISE);
  if (dayFrac >= 0 && dayFrac <= 1) {
    az = (0.5 - dayFrac) * Math.PI; // +90° → −90°
    el = Math.sin(dayFrac * Math.PI) * 62 * DEG + 0.05;
  } else {
    const nf = ((((h - SUNSET) % 24) + 24) % 24) / (24 - (SUNSET - SUNRISE));
    az = -0.5 * Math.PI - nf * Math.PI;
    el = 0.05 - Math.sin(nf * Math.PI) * 40 * DEG;
  }
  out.x = -Math.cos(el) * Math.sin(az);
  out.y = Math.sin(el);
  out.z = -Math.cos(el) * Math.cos(az) * 0.6 + 0.3;
  return normalize(out);
}

/** Moon direction (content MOON path): east → culmination toward +z → west, wraps midnight. */
export function moonDir(h: number, out: Vec3): Vec3 {
  const span = (((MOON.set - MOON.rise) % 24) + 24) % 24;
  const mf = ((((h - MOON.rise) % 24) + 24) % 24) / span;
  const az = (0.5 - mf) * Math.PI;
  const el =
    mf <= 1
      ? Math.sin(mf * Math.PI) * MOON.peakDeg * DEG
      : -Math.sin(((mf - 1) / (24 / span - 1)) * Math.PI) * MOON.peakDeg * 0.5 * DEG;
  const x = -Math.cos(el) * Math.sin(az);
  const z = -Math.cos(el) * Math.cos(az);
  const yaw = MOON.yawDeg * DEG;
  out.x = x * Math.cos(yaw) - z * Math.sin(yaw);
  out.z = x * Math.sin(yaw) + z * Math.cos(yaw);
  out.y = Math.sin(el);
  return normalize(out);
}

/** Night-light schedule: `lamps` on ramp, late switch-off and beam (content NIGHT / BEAM). */
export function nightLights(
  h: number,
  out: Pick<EnvState, 'lamps' | 'lampsLateOff' | 'beam'>,
): void {
  const evening = h >= 12;
  out.lamps = evening
    ? ramp(h, NIGHT.lampsOn[0], NIGHT.lampsOn[1])
    : 1 - ramp(h, NIGHT.lampsOff[0], NIGHT.lampsOff[1]);
  out.lampsLateOff = evening ? ramp(h, NIGHT.lateOff[0], NIGHT.lateOff[1]) : 1;
  out.beam = evening
    ? smoothstep(BEAM.on[0], BEAM.on[1], h)
    : 1 - smoothstep(BEAM.off[0], BEAM.off[1], h);
}

/** 0 = sun is the key light, 1 = moon (smoothstep over MOON.keyDusk / keyDawn hours). */
export function keyBlend(h: number): number {
  return h >= 12
    ? smoothstep(MOON.keyDusk[0], MOON.keyDusk[1], h)
    : 1 - smoothstep(MOON.keyDawn[0], MOON.keyDawn[1], h);
}

/** Spherical interpolation of unit vectors (falls back to nlerp when nearly parallel). */
function slerp(a: Vec3, b: Vec3, t: number, out: Vec3): Vec3 {
  const d = Math.min(1, Math.max(-1, a.x * b.x + a.y * b.y + a.z * b.z));
  const om = Math.acos(d);
  const so = Math.sin(om);
  let ka = 1 - t;
  let kb = t;
  if (so > 1e-4) {
    ka = Math.sin((1 - t) * om) / so;
    kb = Math.sin(t * om) / so;
  }
  out.x = a.x * ka + b.x * kb;
  out.y = a.y * ka + b.y * kb;
  out.z = a.z * ka + b.z * kb;
  return normalize(out);
}

const _sunKey = vec();
const _moonKey = vec();

/** Sample the day cycle at `hour` [0,24) into `out`. */
export function sampleEnv(hour: number, out: EnvState): EnvState {
  const h = ((hour % 24) + 24) % 24;
  out.hour = h;
  // find bracket (KEYS sorted by hour, covering −?..29)
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1].hour <= h) i++;
  const a = KEYS[i];
  const b = KEYS[i + 1];
  const t = smooth(clamp01((h - a.hour) / (b.hour - a.hour)));
  lerpRgb(a.zenith, b.zenith, t, out.zenith);
  lerpRgb(a.horizon, b.horizon, t, out.horizon);
  lerpRgb(a.sun, b.sun, t, out.sunColor);
  out.sunIntensity = a.sunIntensity + (b.sunIntensity - a.sunIntensity) * t;
  lerpRgb(a.hemiSky, b.hemiSky, t, out.hemiSky);
  lerpRgb(a.hemiGround, b.hemiGround, t, out.hemiGround);
  lerpRgb(a.fog, b.fog, t, out.fog);
  lerpRgb(a.shadowTint, b.shadowTint, t, out.shadowTint);
  out.night = a.night + (b.night - a.night) * t;

  // sky bodies
  sunSkyDir(h, out.sunSkyDir);
  moonDir(h, out.moonDir);
  out.moonVis = smoothstep(-0.02, 0.06, out.moonDir.y) * smoothstep(0.25, 0.7, out.night);
  out.starAlpha = smoothstep(0.55, 1, out.night);

  // key light: sun → moonlight over dusk, back at dawn (slerp); lifted to keyMinY (land ≥ L 12 %)
  clampUp(out.sunSkyDir, MOON.keyMinY, _sunKey);
  _moonKey.x = MOON.nightKey[0];
  _moonKey.y = MOON.nightKey[1];
  _moonKey.z = MOON.nightKey[2];
  normalize(_moonKey);
  const w = keyBlend(h);
  out.keyBlend = w;
  slerp(_sunKey, _moonKey, w, out.sunDir);
  clampUp(out.sunDir, MOON.keyMinY, out.sunDir);
  out.sunElevation = Math.asin(out.sunDir.y);

  nightLights(h, out);
  out.bloom = smoothstep(0.4, 1, out.night);

  out.golden =
    h > 16.5 && h < 19.25
      ? Math.sin(((h - 16.5) / (19.25 - 16.5)) * Math.PI)
      : h > 5.5 && h < 7
        ? 1 - (h - 5.5) / 1.5
        : 0;
  out.exposure = 1;
  return out;
}
