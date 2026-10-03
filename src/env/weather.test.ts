import { describe, expect, it } from 'vitest';
import {
  WeatherFsm,
  applyWeather,
  blendFx,
  createWeatherFx,
  dwellFor,
  mistAmount,
  nextState,
  oneHot,
  type WeatherName,
} from './weather.ts';
import { createEnvState, luminance, sampleEnv } from './env-state.ts';
import { WEATHER_FSM, WEATHER_LOOKS, WEATHER_NAMES } from '../content/weather.ts';
import { MIST_GLSL } from '../render/shaders/chunks/mist.glsl.ts';

/** Run the FSM from 0 to `until` with step `dt`; record (time, state) at every state change. */
function trace(fsm: WeatherFsm, until: number, dt: number): [number, WeatherName][] {
  const out: [number, WeatherName][] = [[0, fsm.state]];
  for (let t = 0; t <= until; t += dt) {
    const prev = fsm.state;
    fsm.update(t);
    if (fsm.state !== prev) out.push([t, fsm.state]);
  }
  return out;
}

const sum = (w: Record<WeatherName, number>): number => WEATHER_NAMES.reduce((a, n) => a + w[n], 0);

describe('weather FSM', () => {
  it('same seed → same sequence, independent of the update step', () => {
    const a = trace(new WeatherFsm({ seed: 1001 }), 4000, 1 / 30);
    const b = trace(new WeatherFsm({ seed: 1001 }), 4000, 1 / 30);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(8);
    // coarser stepping sees the same states in the same order (times quantised to the step)
    const c = trace(new WeatherFsm({ seed: 1001 }), 4000, 0.5);
    expect(c.map((e) => e[1])).toEqual(a.map((e) => e[1]));
    // a jump straight to the end lands on the same state
    const j = new WeatherFsm({ seed: 1001 });
    j.update(4000);
    expect(j.state).toBe(a[a.length - 1][1]);
  });

  it('different seeds give different sequences; every state shows up', () => {
    const a = trace(new WeatherFsm({ seed: 1 }), 20000, 1);
    const b = trace(new WeatherFsm({ seed: 2 }), 20000, 1);
    expect(a.map((e) => e[1])).not.toEqual(b.map((e) => e[1]));
    for (const n of WEATHER_NAMES) expect(a.some((e) => e[1] === n)).toBe(true);
  });

  it('respects the dwell ranges and never self-transitions', () => {
    for (const seed of [7, 1001, 6006]) {
      const tr = trace(new WeatherFsm({ seed }), 6000, 1 / 8);
      for (let i = 1; i < tr.length - 1; i++) {
        const [t0, s] = tr[i];
        const dwell = tr[i + 1][0] - t0;
        const [lo, hi] = WEATHER_FSM.dwell[s];
        expect(dwell).toBeGreaterThanOrEqual(lo - 0.2);
        expect(dwell).toBeLessThanOrEqual(hi + 0.2);
        expect(tr[i + 1][1]).not.toBe(s);
      }
    }
    expect(nextState(5, 3, 'fog')).not.toBe('fog');
    const d = dwellFor(5, 3, 'rain');
    expect(d).toBeGreaterThanOrEqual(WEATHER_FSM.dwell.rain[0]);
    expect(d).toBeLessThan(WEATHER_FSM.dwell.rain[1]);
  });

  it('a forced state holds forever and is applied instantly', () => {
    const fsm = new WeatherFsm({ seed: 3, forced: 'fog', t0: 12 });
    expect(fsm.weights.fog).toBe(1);
    for (let t = 12; t < 5000; t += 7) {
      const w = fsm.update(t);
      expect(fsm.state).toBe('fog');
      expect(w.fog).toBe(1);
    }
    expect(fsm.dwellEnd).toBe(Infinity);
  });

  it('set() blends to the target over ~blendSeconds, holds one dwell, then auto-cycles', () => {
    const fsm = new WeatherFsm({ seed: 11, t0: 0 });
    fsm.update(5);
    expect(fsm.state).toBe('clear');
    fsm.set('rain', 5);
    const B = WEATHER_FSM.blendSeconds;
    const mid = fsm.update(5 + B / 2);
    expect(mid.rain).toBeGreaterThan(0.3);
    expect(mid.rain).toBeLessThan(0.7);
    expect(sum(mid)).toBeCloseTo(1, 9);
    const end = fsm.update(5 + B);
    expect(end.rain).toBe(1);
    expect(end.clear).toBe(0);
    // holds for one dwell
    const hold = fsm.dwellEnd - 5;
    expect(hold).toBeGreaterThanOrEqual(WEATHER_FSM.dwell.rain[0]);
    fsm.update(5 + hold - 0.01);
    expect(fsm.state).toBe('rain');
    fsm.update(5 + hold + 0.01);
    expect(fsm.state).not.toBe('rain');
  });

  it('capture: set() applies instantly; weights always sum to 1', () => {
    const fsm = new WeatherFsm({ seed: 9, instant: true });
    fsm.set('cloudy', 2);
    expect(fsm.update(2).cloudy).toBe(1);
    const auto = new WeatherFsm({ seed: 9 });
    for (let t = 0; t < 3000; t += 0.37) expect(sum(auto.update(t))).toBeCloseTo(1, 9);
  });

  it('reports auto changes through onChange (not set())', () => {
    const seen: WeatherName[] = [];
    const fsm = new WeatherFsm({ seed: 4, onChange: (w) => seen.push(w) });
    fsm.set('fog', 1);
    expect(seen).toEqual([]);
    fsm.update(1000);
    expect(seen.length).toBeGreaterThan(0);
    expect(seen[seen.length - 1]).toBe(fsm.state);
  });
});

describe('weather looks', () => {
  it('fully clear is the exact identity on EnvState', () => {
    const fx = blendFx(oneHot('clear'), createWeatherFx());
    for (const h of [3, 9.5, 13, 18.2, 22]) {
      const a = sampleEnv(h, createEnvState());
      const b = applyWeather(sampleEnv(h, createEnvState()), fx);
      expect(b).toEqual(a);
    }
    expect(fx.fog).toBe(1);
    expect(fx.mist).toBe(0);
    expect(fx.rain).toBe(0);
    expect(fx.gust).toBe(1);
  });

  it('blends numeric deltas linearly between two looks', () => {
    const fx = blendFx({ clear: 0.25, cloudy: 0, rain: 0.75, fog: 0 });
    expect(fx.fog).toBeCloseTo(0.25 * WEATHER_LOOKS.clear.fog + 0.75 * WEATHER_LOOKS.rain.fog);
    expect(fx.rain).toBeCloseTo(0.75);
  });

  it('rain at 13:00: dimmer sun, lamps on, no sun disc veil leak, sky keeps a blue hue', () => {
    const fx = blendFx(oneHot('rain'));
    const clear = sampleEnv(13, createEnvState());
    const rain = applyWeather(sampleEnv(13, createEnvState()), fx);
    expect(rain.sunIntensity).toBeLessThan(clear.sunIntensity * 0.75);
    expect(rain.lamps).toBe(1);
    expect(rain.starAlpha).toBe(0);
    // W10: sky not neutral grey
    expect(rain.zenith.b - rain.zenith.r).toBeGreaterThan(0.03);
    // night rain stays dark
    const n = applyWeather(sampleEnv(23, createEnvState()), fx);
    expect(luminance(n.zenith)).toBeLessThan(0.05);
    expect(n.moonVis).toBeLessThan(0.15);
  });

  it('fog thickens fog and mist and calms the wind', () => {
    const fx = blendFx(oneHot('fog'));
    expect(fx.fog).toBeGreaterThan(2);
    expect(fx.mist).toBeGreaterThan(0);
    expect(fx.gust).toBeLessThan(1);
    expect(fx.beam).toBeGreaterThan(0);
  });
});

describe('mist band (CPU twin of chunks/mist.glsl.ts)', () => {
  const cam = { x: 0, y: 120, z: 0 };
  it('is thick over the sea, thin on hill tops, capped', () => {
    const fx = blendFx(oneHot('fog'));
    const k = 1 / fx.mistHeight;
    const sea = mistAmount(cam, { x: 0, y: 0, z: -400 }, fx.mist, k, fx.mistMax);
    const hill = mistAmount(cam, { x: 0, y: 25, z: -400 }, fx.mist, k, fx.mistMax);
    expect(sea).toBeGreaterThan(0.3);
    expect(hill).toBeLessThan(sea * 0.25);
    expect(mistAmount(cam, { x: 0, y: 0, z: -3000 }, fx.mist, k, fx.mistMax)).toBe(fx.mistMax);
    expect(mistAmount(cam, { x: 0, y: 0, z: -400 }, 0, k, 1)).toBe(0);
  });
  it('is continuous where the ray turns horizontal (dy → 0 branch)', () => {
    const k = 1 / 3;
    const a = mistAmount({ x: 0, y: 2, z: 0 }, { x: 0, y: 2.0001, z: -50 }, 0.01, k, 1);
    const b = mistAmount({ x: 0, y: 2, z: 0 }, { x: 0, y: 2.01, z: -50 }, 0.01, k, 1);
    expect(Math.abs(a - b)).toBeLessThan(1e-3);
  });
  it('the GLSL chunk uses the same optical-depth form', () => {
    expect(MIST_GLSL).toContain('(e0 - e1) / dy');
    expect(MIST_GLSL).toContain('max(cam.y, 0.0) * uMist.y');
    expect(MIST_GLSL).toContain('min(1.0 - exp(-tau), uMistMax)');
  });
});
