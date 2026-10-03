import { describe, expect, it } from 'vitest';
import { buildWeather, createWeather, morningMist } from './weather.ts';
import { createEnvState, luminance, sampleEnv, WEATHER_HOOK } from './env-state.ts';
import { WEATHER_FSM, WEATHER_STATES } from '../content/weather.ts';
import type { WeatherName } from '../core/params.ts';

const DT = 1 / 30;

/** Run the FSM and return the sequence of settled segments (state, entry time). */
function segments(seed: number, seconds: number): { state: WeatherName; t: number }[] {
  const w = buildWeather(seed, '');
  const out: { state: WeatherName; t: number }[] = [{ state: w.target, t: 0 }];
  const steps = Math.round(seconds / DT);
  for (let i = 0; i < steps; i++) {
    w.fixedUpdate(DT);
    if (w.target !== out[out.length - 1].state) out.push({ state: w.target, t: w.time });
  }
  return out;
}

describe('weather FSM', () => {
  it('is deterministic for a seed over 2000 steps', () => {
    const a = buildWeather(42, '');
    const b = buildWeather(42, '');
    for (let i = 0; i < 2000; i++) {
      a.fixedUpdate(DT);
      b.fixedUpdate(DT);
      expect(a.state).toBe(b.state);
      expect(a.target).toBe(b.target);
      expect(a.blend).toBe(b.blend);
    }
    // and long-run sequences match too
    expect(segments(7, 3000)).toEqual(segments(7, 3000));
  });

  it('different seeds diverge somewhere', () => {
    const seqs = [1, 2, 3, 4, 5].map((s) => JSON.stringify(segments(s, 4000)));
    expect(new Set(seqs).size).toBeGreaterThan(1);
  });

  it('a forced state is constant', () => {
    for (const s of WEATHER_STATES) {
      const w = buildWeather(9, s);
      for (let i = 0; i < 20000; i += 1) {
        w.fixedUpdate(DT);
        if (i % 997 === 0) {
          expect(w.state).toBe(s);
          expect(w.target).toBe(s);
          expect(w.blend).toBe(1);
        }
      }
    }
  });

  it('dwell times stay in range and transitions follow the table', () => {
    for (const seed of [1, 99, 1234]) {
      const seq = segments(seed, 6000);
      expect(seq[0].state).toBe(WEATHER_FSM.initial);
      for (let i = 0; i + 1 < seq.length; i++) {
        const dwell = seq[i + 1].t - seq[i].t;
        const [lo, hi] = WEATHER_FSM.dwell[seq[i].state];
        expect(dwell).toBeGreaterThanOrEqual(lo - DT);
        expect(dwell).toBeLessThanOrEqual(hi + DT);
        expect(WEATHER_FSM.next[seq[i].state][seq[i + 1].state] ?? 0).toBeGreaterThan(0);
      }
      expect(seq.length).toBeGreaterThan(20);
    }
  });

  it('blend is monotonic over the ~10 s cross-fade', () => {
    const w = buildWeather(5, '');
    let prevTarget = w.target;
    let steps = 0;
    while (w.target === prevTarget && steps < 30 * 600) {
      w.fixedUpdate(DT);
      steps++;
    }
    expect(w.target).not.toBe(prevTarget);
    prevTarget = w.target;
    let last = w.blend;
    let n = 0;
    while (w.blend < 1) {
      w.fixedUpdate(DT);
      expect(w.blend).toBeGreaterThanOrEqual(last);
      last = w.blend;
      n++;
    }
    expect(n * DT).toBeGreaterThan(WEATHER_FSM.blend - 0.5);
    expect(n * DT).toBeLessThan(WEATHER_FSM.blend + 0.5);
    expect(w.state).toBe(prevTarget);
  });

  it('weights sum to 1', () => {
    const w = buildWeather(3, '');
    for (let i = 0; i < 9000; i++) {
      w.fixedUpdate(DT);
      const ws = w.weights();
      const sum = WEATHER_STATES.reduce((a, s) => a + ws[s], 0);
      expect(sum).toBeCloseTo(1, 9);
    }
  });
});

describe('weather → EnvState', () => {
  const env = (forced: WeatherName | '', hour = 13) => {
    createWeather(1, forced);
    return sampleEnv(hour, createEnvState());
  };

  it('createWeather is idempotent and registers the hook', () => {
    const a = createWeather(11, 'rain');
    expect(createWeather(11, 'rain')).toBe(a);
    expect(WEATHER_HOOK.apply).toBe(a.apply);
    expect(createWeather(12, 'rain')).not.toBe(a);
  });

  it('clear midday is neutral', () => {
    const e = env('clear');
    expect(e.saturation).toBe(0);
    expect(e.fogScale).toBe(1);
    expect(e.rain).toBe(0);
    expect(e.mist).toBe(0);
    expect(e.gustScale).toBe(1);
    expect(e.sunIntensity).toBeCloseTo(3);
  });

  it('rain deltas are within the bible bounds', () => {
    const c = env('clear');
    const r = env('rain');
    expect(r.saturation).toBeCloseTo(-0.2);
    expect(r.fogScale).toBeCloseTo(1.8);
    expect(r.cloudCover).toBeCloseTo(0.9);
    expect(r.gustScale).toBeCloseTo(1.4);
    expect(r.rain).toBe(1);
    expect(r.sunIntensity).toBeCloseTo(c.sunIntensity * 0.7);
    // sky not neutral grey: zenith keeps blue dominance
    expect(r.zenith.b).toBeGreaterThan(r.zenith.r * 1.3);
    expect(r.horizon.b).toBeGreaterThan(r.horizon.r);
    for (const k of ['zenith', 'horizon', 'fog', 'hemiSky'] as const)
      for (const ch of ['r', 'g', 'b'] as const) {
        expect(r[k][ch]).toBeGreaterThanOrEqual(0);
        expect(r[k][ch]).toBeLessThanOrEqual(1);
      }
  });

  it('cloudy and fog presets', () => {
    const cl = env('cloudy');
    expect(cl.saturation).toBeCloseTo(-0.15);
    expect(cl.fogScale).toBeCloseTo(1.15);
    expect(cl.cloudCover).toBeCloseTo(0.75);
    expect(cl.rain).toBe(0);
    const f = env('fog');
    expect(f.mist).toBe(1);
    expect(f.fogScale).toBeCloseTo(1.3);
    // fog is bright, not murky
    expect(luminance(f.fog)).toBeGreaterThan(luminance(env('clear').fog) * 0.95);
  });

  it('morning mist on clear/cloudy days (W7 06:45), none at noon or in rain', () => {
    expect(morningMist(6.75)).toBe(1);
    expect(morningMist(12)).toBe(0);
    expect(env('clear', 6.75).mist).toBeCloseTo(0.6);
    expect(env('cloudy', 6.75).mist).toBeCloseTo(0.6);
    expect(env('rain', 6.75).mist).toBe(0);
    expect(env('clear', 13).mist).toBe(0);
  });

  it('night keeps the dark sky under rain', () => {
    const n = env('rain', 23);
    const c = env('clear', 23);
    expect(luminance(n.zenith)).toBeLessThan(luminance(c.zenith) * 3 + 0.02);
  });
});
