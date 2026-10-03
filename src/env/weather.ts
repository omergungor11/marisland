import type { WeatherName } from '../core/params.ts';
import { createRng, type Rng } from '../core/rng.ts';
import { WEATHER_PRESETS } from '../content/palette.ts';
import { MORNING_MIST, WEATHER_DELTAS, WEATHER_FSM, WEATHER_STATES } from '../content/weather.ts';
import { hexToLinear, type Rgb } from './color.ts';
import type { EnvState } from './env-state.ts';
import { WEATHER_HOOK } from './weather-hook.ts';

/**
 * TASK-172 — weather FSM (ARCHITECTURE §7 "Weather"). A seeded Markov chain
 * clear → cloudy → rain/fog → clear with per-state dwell times; a forced state
 * (`?weather=`) is constant. The schedule is a pure function of the seed and the
 * fixed-step clock (segments are drawn lazily from `rng.fork('weather')`), so
 * captures are deterministic. `apply(env)` blends the preset deltas into an
 * already-sampled EnvState with a 10 s smoothstep cross-fade.
 */
export interface Weather {
  readonly seed: number;
  readonly forced: WeatherName | '';
  /** State being blended away from (== target once the blend is done). */
  readonly state: WeatherName;
  /** State being blended toward. */
  readonly target: WeatherName;
  /** 0..1 smoothstep-eased cross-fade progress. */
  readonly blend: number;
  /** Sim seconds since creation (fixed-step accumulated). */
  readonly time: number;
  fixedUpdate(dt: number): void;
  apply(env: EnvState): void;
  /** Per-state weights (sum 1), for debug/tests. */
  weights(out?: Record<WeatherName, number>): Record<WeatherName, number>;
}

interface Segment {
  state: WeatherName;
  start: number;
  end: number;
}

const smooth = (t: number): number => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
};

function pickNext(rng: Rng, from: WeatherName): WeatherName {
  const table = WEATHER_FSM.next[from];
  let total = 0;
  for (const s of WEATHER_STATES) total += table[s] ?? 0;
  let r = rng.next() * total;
  for (const s of WEATHER_STATES) {
    const w = table[s] ?? 0;
    if (w <= 0) continue;
    if (r < w) return s;
    r -= w;
  }
  return WEATHER_STATES.find((s) => (table[s] ?? 0) > 0) ?? 'clear';
}

/** Linear target colours per state (sky, fog). '' sky → mist colour for fog, none for clear. */
const MIST_COLOR = hexToLinear(WEATHER_PRESETS.fog.mist.color);
const SKY_COL: Record<WeatherName, Rgb | null> = {
  clear: null,
  cloudy: hexToLinear(WEATHER_PRESETS.cloudy.sky),
  rain: hexToLinear(WEATHER_PRESETS.rain.sky),
  fog: MIST_COLOR,
};
const FOG_COL: Record<WeatherName, Rgb | null> = {
  clear: null,
  cloudy: hexToLinear(WEATHER_PRESETS.cloudy.sky),
  rain: hexToLinear(WEATHER_PRESETS.rain.fog),
  fog: MIST_COLOR,
};

const _acc = { zen: zero(), hor: zero(), fog: zero(), hemi: zero() };
function zero(): Rgb {
  return { r: 0, g: 0, b: 0 };
}
function addMix(acc: Rgb, base: Rgb, col: Rgb | null, k: number, w: number): void {
  const c = col ?? base;
  acc.r += w * (base.r + (c.r - base.r) * k);
  acc.g += w * (base.g + (c.g - base.g) * k);
  acc.b += w * (base.b + (c.b - base.b) * k);
}
function copyRgb(src: Rgb, dst: Rgb): void {
  dst.r = src.r;
  dst.g = src.g;
  dst.b = src.b;
}

/** Morning mist window 0..1 (05:30 → 06:00 full … 07:00 full → 07:30). */
export function morningMist(hour: number): number {
  const m = MORNING_MIST;
  if (hour <= m.from || hour >= m.to) return 0;
  if (hour < m.full[0]) return smooth((hour - m.from) / (m.full[0] - m.from));
  if (hour > m.full[1]) return smooth((m.to - hour) / (m.to - m.full[1]));
  return 1;
}

let last: Weather | null = null;

/**
 * Create (or return the existing, if seed + forced match) weather FSM and register it as
 * the EnvState hook so `sampleEnv` applies it.
 */
export function createWeather(seed: number, forced: WeatherName | ''): Weather {
  if (last && last.seed === seed && last.forced === forced) {
    WEATHER_HOOK.apply = last.apply;
    return last;
  }
  const w = buildWeather(seed, forced);
  last = w;
  WEATHER_HOOK.apply = w.apply;
  return w;
}

/** Non-registering constructor (tests, previews). */
export function buildWeather(seed: number, forced: WeatherName | ''): Weather {
  const rng = createRng(seed).fork('weather');
  const segs: Segment[] = [];
  const dwell = (s: WeatherName): number => {
    const [a, b] = WEATHER_FSM.dwell[s];
    return rng.range(a, b);
  };
  if (!forced) {
    const s0 = WEATHER_FSM.initial;
    segs.push({ state: s0, start: 0, end: dwell(s0) });
  }
  const ensure = (t: number): void => {
    while (segs[segs.length - 1].end <= t) {
      const prev = segs[segs.length - 1];
      const s = pickNext(rng, prev.state);
      segs.push({ state: s, start: prev.end, end: prev.end + dwell(s) });
    }
  };

  let time = 0;
  let segIdx = 0;
  let state: WeatherName = forced || WEATHER_FSM.initial;
  let target: WeatherName = state;
  let blend = 1;

  const resolve = (): void => {
    if (forced) return;
    ensure(time);
    while (segs[segIdx].end <= time) segIdx++;
    const seg = segs[segIdx];
    target = seg.state;
    if (segIdx === 0) {
      state = target;
      blend = 1;
      return;
    }
    blend = smooth((time - seg.start) / WEATHER_FSM.blend);
    state = blend >= 1 ? target : segs[segIdx - 1].state;
  };

  const weights = (
    out: Record<WeatherName, number> = { clear: 0, cloudy: 0, rain: 0, fog: 0 },
  ): Record<WeatherName, number> => {
    out.clear = out.cloudy = out.rain = out.fog = 0;
    out[state] += 1 - blend;
    out[target] += blend;
    return out;
  };
  const _w = { clear: 0, cloudy: 0, rain: 0, fog: 0 };

  const apply = (env: EnvState): void => {
    weights(_w);
    // overcast colours are daytime colours: fade the colour shift out at night
    const dayK = 1 - 0.8 * env.night;
    for (const a of [_acc.zen, _acc.hor, _acc.fog, _acc.hemi]) a.r = a.g = a.b = 0;
    let sat = 0;
    let fogScale = 0;
    let cover = 0;
    let gust = 0;
    let sun = 0;
    let swell = 0;
    let golden = 0;
    let rain = 0;
    let mist = 0;
    for (const s of WEATHER_STATES) {
      const w = _w[s];
      if (w <= 0) continue;
      const p = WEATHER_PRESETS[s];
      const d = WEATHER_DELTAS[s];
      // zenith keeps more of its blue than the horizon (W10: sky never neutral grey)
      addMix(_acc.zen, env.zenith, SKY_COL[s], d.skyMix * 0.8 * dayK, w);
      addMix(_acc.hor, env.horizon, SKY_COL[s], d.skyMix * dayK, w);
      addMix(_acc.fog, env.fog, FOG_COL[s], d.fogMix * dayK, w);
      addMix(_acc.hemi, env.hemiSky, SKY_COL[s], d.hemiMix * dayK, w);
      sat += w * p.saturation;
      fogScale += w * p.fogScale;
      cover += w * p.cloudCover;
      gust += w * p.gust;
      sun += w * d.sunScale;
      swell += w * d.swell;
      golden += w * d.golden;
      rain += w * d.rain;
      mist += w * d.mist;
    }
    copyRgb(_acc.zen, env.zenith);
    copyRgb(_acc.hor, env.horizon);
    copyRgb(_acc.fog, env.fog);
    copyRgb(_acc.hemi, env.hemiSky);
    env.saturation = sat;
    env.fogScale = fogScale;
    env.cloudCover = cover;
    env.gustScale = gust;
    env.sunIntensity *= sun;
    env.swellScale = swell;
    env.golden *= golden;
    env.rain = rain;
    const morning = MORNING_MIST.amount * morningMist(env.hour) * (_w.clear + _w.cloudy);
    env.mist = Math.max(mist, morning);
  };

  return {
    seed,
    forced,
    get state() {
      return state;
    },
    get target() {
      return target;
    },
    get blend() {
      return blend;
    },
    get time() {
      return time;
    },
    fixedUpdate(dt: number) {
      time += dt;
      resolve();
    },
    apply,
    weights,
  };
}
