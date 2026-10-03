import { describe, expect, it } from 'vitest';
import { gustAt, swellY } from './fields.ts';
import { FIELDS_GLSL } from '../render/shaders/chunks/fields.glsl.ts';

/**
 * Hand port of the GLSL `marSwellY` (fields.glsl.ts): dir as a unit vector, the second
 * train rotated by a 2×2 matrix — i.e. the GPU's arithmetic, not the CPU's cos(dir + 0.65).
 */
function glslSwellY(
  px: number,
  pz: number,
  t: number,
  dx: number,
  dz: number,
  amp: number,
  period: number,
): number {
  const w = 6.283185307 / period;
  const k1 = 6.283185307 / 28.0;
  const k2 = 6.283185307 / 11.0;
  const ca = Math.cos(0.65);
  const sa = Math.sin(0.65);
  const d2x = dx * ca - dz * sa;
  const d2z = dx * sa + dz * ca;
  const a = Math.sin((px * dx + pz * dz) * k1 - t * w);
  const b = Math.sin((px * d2x + pz * d2z) * k2 - t * w * 1.7 + 1.3);
  return amp * (a * 0.7 + b * 0.3);
}

describe('shared fields', () => {
  it('swell is bounded and time-varying', () => {
    const p = { amplitude: 0.15, period: 7, dir: 0.4 };
    let max = 0;
    for (let i = 0; i < 500; i++)
      max = Math.max(max, Math.abs(swellY(i * 1.3, i * 0.7, i * 0.1, p)));
    expect(max).toBeLessThanOrEqual(0.15 + 1e-6);
    expect(max).toBeGreaterThan(0.1);
    expect(swellY(10, 10, 0, p)).not.toBeCloseTo(swellY(10, 10, 2, p), 3);
  });
  it('gust is in [0,1]', () => {
    const p = { dir: 1, speed: 6, wavelength: 40, strength: 1 };
    for (let i = 0; i < 500; i++) {
      const g = gustAt(i * 2.1, -i, i * 0.3, p);
      expect(g).toBeGreaterThanOrEqual(0);
      expect(g).toBeLessThanOrEqual(1);
    }
  });
  it('swell matches the GLSL twin (boats bob on the same water)', () => {
    expect(FIELDS_GLSL).toContain('float marSwellY(');
    for (const c of ['28.0', '11.0', '0.65', '1.7', '1.3', 'a * 0.7 + b * 0.3'])
      expect(FIELDS_GLSL).toContain(c);
    let s = 12345;
    const rnd = (): number => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let i = 0; i < 50; i++) {
      const dir = rnd() * Math.PI * 2;
      const x = (rnd() - 0.5) * 800;
      const z = (rnd() - 0.5) * 800;
      const t = rnd() * 600;
      const p = { amplitude: 0.05 + rnd() * 0.3, period: 4 + rnd() * 6, dir };
      const gpu = glslSwellY(x, z, t, Math.cos(dir), Math.sin(dir), p.amplitude, p.period);
      expect(Math.abs(swellY(x, z, t, p) - gpu)).toBeLessThan(1e-6);
    }
  });
});
