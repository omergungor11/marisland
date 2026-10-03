import {
  MIST,
  WEATHER_FSM,
  WEATHER_LOOKS,
  WEATHER_NAMES,
  type WeatherLook,
  type WeatherName,
} from '../content/weather.ts';
import { createRng } from '../core/rng.ts';
import { hexToLinear, luminance, type EnvState, type Rgb } from './env-state.ts';

/**
 * Weather FSM (TASK-172, ARCHITECTURE §7). Pure TS — no three — so it runs in Node tests.
 *
 * States {clear, cloudy, rain, fog}. The auto cycle is a seeded Markov chain over render time:
 * transition `i` draws its next state and dwell from `createRng(seed).fork('weather', i)` only,
 * so the sequence never depends on frame rate or on how often `update` is called. Every change
 * cross-fades the per-state looks (`content/weather.ts`) over WEATHER_FSM.blendSeconds.
 *
 *  - `forced` (`?weather=`): that state, instantly, forever (no auto cycle). `set()` still
 *    switches it (HUD) and it stays forced.
 *  - `set(w, t)` (HUD): blend to `w`, hold it for one dwell, then resume the auto cycle.
 *  - `instant` (capture `freeze=1`): set() skips the cross-fade.
 *
 * `fx()` folds the blend weights into one `WeatherFx` (weighted average of the looks); a fully
 * clear blend is exactly the identity look, and `applyWeather` then returns without touching
 * EnvState, so clear frames stay bit-identical to the no-weather renderer.
 */
export type { WeatherName };
export type Weights = Record<WeatherName, number>;

export interface WeatherFx extends Omit<WeatherLook, 'tint' | 'sunTint'> {
  weights: Weights;
  /** Linear tint colours (weighted by each look's mix). */
  tint: Rgb;
  sunTint: Rgb;
  /** Linear mist hue (luminance comes from the fog colour). */
  mistColor: Rgb;
}

export interface WeatherOptions {
  seed: number;
  /** Render time at creation (s). */
  t0?: number;
  /** `?weather=`: fixed state, applied instantly, no auto cycle. */
  forced?: WeatherName | null;
  /** Initial auto state (default WEATHER_FSM.initial). Applied instantly. */
  initial?: WeatherName;
  /** Capture: `set()` applies instantly (no cross-fade). */
  instant?: boolean;
  /** Called when the auto cycle (not `set`) changes the target state. */
  onChange?: (w: WeatherName) => void;
}

const smooth = (t: number): number => t * t * (3 - 2 * t);
const clamp01 = (t: number): number => Math.min(1, Math.max(0, t));

export function oneHot(w: WeatherName, out: Weights = emptyWeights()): Weights {
  for (const n of WEATHER_NAMES) out[n] = n === w ? 1 : 0;
  return out;
}

export function emptyWeights(): Weights {
  return { clear: 0, cloudy: 0, rain: 0, fog: 0 };
}

/** Deterministic dwell (s) for transition `index` into state `w`. */
export function dwellFor(seed: number, index: number, w: WeatherName): number {
  const [a, b] = WEATHER_FSM.dwell[w];
  return createRng(seed).fork('weather', index).fork('dwell').range(a, b);
}

/** Deterministic next state after `w` for transition `index` (Markov table, no self-loops). */
export function nextState(seed: number, index: number, w: WeatherName): WeatherName {
  const table = WEATHER_FSM.next[w];
  let total = 0;
  for (const n of WEATHER_NAMES) if (n !== w) total += table[n] ?? 0;
  if (total <= 0) return w;
  let u = createRng(seed).fork('weather', index).fork('next').next() * total;
  let last: WeatherName = w;
  for (const n of WEATHER_NAMES) {
    const p = n === w ? 0 : (table[n] ?? 0);
    if (p <= 0) continue;
    last = n;
    if (u < p) return n;
    u -= p;
  }
  return last;
}

export class WeatherFsm {
  /** Target state (what the HUD shows). */
  state: WeatherName;
  /** Fixed by `?weather=` (no auto cycle). */
  readonly forced: boolean;
  private readonly seed: number;
  private readonly instant: boolean;
  private readonly onChange?: (w: WeatherName) => void;
  /** Weights at the start of the current cross-fade. */
  private from: Weights;
  private tStart: number;
  /** End of the current dwell (next auto transition); Infinity when forced. */
  private tEnd: number;
  /** Transitions taken so far (fork index for the next draw). */
  private index = 0;
  private readonly cur: Weights = emptyWeights();
  private readonly target: Weights = emptyWeights();

  constructor(opts: WeatherOptions) {
    this.seed = opts.seed >>> 0;
    this.instant = !!opts.instant;
    this.onChange = opts.onChange;
    this.forced = !!opts.forced;
    const t0 = opts.t0 ?? 0;
    this.state = opts.forced ?? opts.initial ?? WEATHER_FSM.initial;
    this.from = oneHot(this.state);
    this.tStart = t0 - WEATHER_FSM.blendSeconds;
    this.tEnd = this.forced ? Infinity : t0 + dwellFor(this.seed, this.index++, this.state);
    this.weightsAt(t0, this.cur);
  }

  /** Transitions taken (auto + set). */
  get transitions(): number {
    return this.index;
  }

  /** End of the current dwell (s); Infinity when forced. */
  get dwellEnd(): number {
    return this.tEnd;
  }

  /** HUD / API: switch to `w` at time `t`; holds it for one dwell before the auto cycle resumes. */
  set(w: WeatherName, t: number, instant = this.instant): void {
    this.from = instant ? oneHot(w) : { ...this.weightsAt(t, this.cur) };
    this.tStart = instant ? t - WEATHER_FSM.blendSeconds : t;
    this.state = w;
    this.tEnd = this.forced ? Infinity : t + dwellFor(this.seed, this.index, w);
    this.index++;
    this.weightsAt(t, this.cur);
  }

  /** Advance to render time `t` (s). Returns the live blend weights (sum 1). */
  update(t: number): Weights {
    while (t >= this.tEnd) {
      const tt = this.tEnd;
      this.from = { ...this.weightsAt(tt, this.cur) };
      this.tStart = tt;
      this.state = nextState(this.seed, this.index, this.state);
      this.tEnd = tt + dwellFor(this.seed, this.index, this.state);
      this.index++;
      this.onChange?.(this.state);
    }
    return this.weightsAt(t, this.cur);
  }

  /** Current weights (as of the last update/set). */
  get weights(): Weights {
    return this.cur;
  }

  private weightsAt(t: number, out: Weights): Weights {
    const b = smooth(clamp01((t - this.tStart) / WEATHER_FSM.blendSeconds));
    oneHot(this.state, this.target);
    for (const n of WEATHER_NAMES) out[n] = this.from[n] + (this.target[n] - this.from[n]) * b;
    // exact endpoints (identity look when fully clear)
    if (b >= 1) oneHot(this.state, out);
    return out;
  }
}

// ---------------------------------------------------------------- looks → fx

type NumKey = Exclude<keyof WeatherLook, 'tint' | 'sunTint'>;
const NUM_KEYS = Object.keys(WEATHER_LOOKS.clear).filter(
  (k) => k !== 'tint' && k !== 'sunTint',
) as NumKey[];
const TINTS = Object.fromEntries(
  WEATHER_NAMES.map((n) => [
    n,
    { tint: hexToLinear(WEATHER_LOOKS[n].tint), sun: hexToLinear(WEATHER_LOOKS[n].sunTint) },
  ]),
) as Record<WeatherName, { tint: Rgb; sun: Rgb }>;
const MIST_RGB = hexToLinear(MIST.color);

export function createWeatherFx(): WeatherFx {
  const fx = {
    ...WEATHER_LOOKS.clear,
    weights: oneHot('clear'),
    tint: { r: 1, g: 1, b: 1 },
    sunTint: { r: 1, g: 1, b: 1 },
    mistColor: { ...MIST_RGB },
  } as WeatherFx;
  return fx;
}

/** Weighted average of the looks (tints weighted by weight × mix). */
export function blendFx(w: Weights, out: WeatherFx = createWeatherFx()): WeatherFx {
  for (const k of NUM_KEYS) {
    let v = 0;
    for (const n of WEATHER_NAMES) v += w[n] * WEATHER_LOOKS[n][k];
    out[k] = v;
  }
  // exact identity when fully clear (no float residue from the weighted sum)
  if (w.clear >= 1) for (const k of NUM_KEYS) out[k] = WEATHER_LOOKS.clear[k];
  let tw = 0;
  let sw = 0;
  out.tint.r = out.tint.g = out.tint.b = 0;
  out.sunTint.r = out.sunTint.g = out.sunTint.b = 0;
  for (const n of WEATHER_NAMES) {
    const a = w[n] * WEATHER_LOOKS[n].tintMix;
    const s = w[n] * WEATHER_LOOKS[n].sunTintMix;
    tw += a;
    sw += s;
    out.tint.r += a * TINTS[n].tint.r;
    out.tint.g += a * TINTS[n].tint.g;
    out.tint.b += a * TINTS[n].tint.b;
    out.sunTint.r += s * TINTS[n].sun.r;
    out.sunTint.g += s * TINTS[n].sun.g;
    out.sunTint.b += s * TINTS[n].sun.b;
  }
  if (tw > 0) {
    out.tint.r /= tw;
    out.tint.g /= tw;
    out.tint.b /= tw;
  } else out.tint.r = out.tint.g = out.tint.b = 1;
  if (sw > 0) {
    out.sunTint.r /= sw;
    out.sunTint.g /= sw;
    out.sunTint.b /= sw;
  } else out.sunTint.r = out.sunTint.g = out.sunTint.b = 1;
  for (const n of WEATHER_NAMES) out.weights[n] = w[n];
  return out;
}

/** True when the blend is fully clear (every delta is the identity). */
export const isClear = (fx: WeatherFx): boolean => fx.weights.clear >= 1;

// ---------------------------------------------------------------- EnvState deltas

function desaturate(c: Rgb, k: number): void {
  if (k <= 0) return;
  const l = luminance(c);
  c.r += (l - c.r) * k;
  c.g += (l - c.g) * k;
  c.b += (l - c.b) * k;
}

/**
 * Toward `tint`: the tint colour itself by day, the tint hue at the colour's own luminance by
 * night (so a rainy night stays dark).
 */
function tintTo(c: Rgb, tint: Rgb, k: number, night: number): void {
  if (k <= 0) return;
  const lt = Math.max(luminance(tint), 1e-5);
  const s = 1 + (luminance(c) / lt - 1) * night;
  c.r += (tint.r * s - c.r) * k;
  c.g += (tint.g * s - c.g) * k;
  c.b += (tint.b * s - c.b) * k;
}

function tintLum(c: Rgb, tint: Rgb, k: number): void {
  if (k <= 0) return;
  const s = luminance(c) / Math.max(luminance(tint), 1e-5);
  c.r += (tint.r * s - c.r) * k;
  c.g += (tint.g * s - c.g) * k;
  c.b += (tint.b * s - c.b) * k;
}

function scale(c: Rgb, k: number): void {
  c.r *= k;
  c.g *= k;
  c.b *= k;
}

/**
 * Apply the blended weather to a sampled EnvState (after `sampleEnv`, before
 * `writeEnvUniforms`). No-op when fully clear.
 */
export function applyWeather(env: EnvState, fx: WeatherFx): EnvState {
  if (isClear(fx)) return env;
  const night = env.night;
  for (const c of [env.zenith, env.horizon, env.fog]) {
    desaturate(c, fx.desat);
    tintTo(c, fx.tint, fx.tintMix, night);
    scale(c, fx.bright);
  }
  // light colours (→ land): only `lightTint` of the atmosphere's grey-out (W10 foliage, D-013)
  const lt = fx.lightTint;
  desaturate(env.hemiSky, fx.desat * lt);
  tintTo(env.hemiSky, fx.tint, fx.tintMix * lt, night);
  scale(env.hemiSky, fx.bright);
  desaturate(env.hemiGround, fx.desat * lt);
  scale(env.hemiGround, fx.bright);
  desaturate(env.sunColor, fx.desat * lt);
  tintLum(env.sunColor, fx.sunTint, fx.sunTintMix);
  env.sunIntensity *= fx.sun;
  const clearSky = 1 - fx.veil;
  env.moonVis *= clearSky;
  env.starAlpha *= clearSky;
  env.golden *= clearSky;
  env.lamps = Math.max(env.lamps, fx.lamps);
  // no late switch-off while the weather keeps the lamps on by day
  if (fx.lamps > 0 && env.night < 0.5) env.lampsLateOff *= 1 - fx.lamps;
  return env;
}

/** Mist colour: the mist hue at the fog colour's luminance (no horizon line), slightly lifted. */
export function mistColor(env: EnvState, out: Rgb): Rgb {
  out.r = env.fog.r;
  out.g = env.fog.g;
  out.b = env.fog.b;
  tintLum(out, MIST_RGB, MIST.colorMix);
  scale(out, MIST.lift);
  return out;
}

/**
 * CPU twin of the mist chunk (`shaders/chunks/mist.glsl.ts`, without the noise term):
 * optical depth of an exponential height layer (density `d` at y = 0, 1/height `k`) along the
 * segment camera → point; returns min(1 − e^−τ, max).
 */
export function mistAmount(
  cam: { x: number; y: number; z: number },
  p: { x: number; y: number; z: number },
  d: number,
  k: number,
  max: number,
): number {
  if (d <= 0) return 0;
  const y0 = Math.max(cam.y, 0) * k;
  const y1 = Math.max(p.y, 0) * k;
  const dy = y1 - y0;
  const e0 = Math.exp(-y0);
  const e1 = Math.exp(-y1);
  const mean = Math.abs(dy) > 1e-3 ? (e0 - e1) / dy : e0;
  const tau = d * Math.hypot(p.x - cam.x, p.y - cam.y, p.z - cam.z) * mean;
  return Math.min(1 - Math.exp(-tau), max);
}
