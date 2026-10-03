import { describe, expect, it } from 'vitest';
import { poolFalloff, splatPools } from './lantern-pools.ts';
import { buildBeamGeometry } from './beam.ts';
import { BEAM, POOLS } from '../../content/lighting.ts';
import { POOL_HEIGHT_RANGE } from '../shaders/chunks/night.glsl.ts';

describe('lantern pools (TASK-171)', () => {
  it('returns null without sources', () => {
    expect(splatPools([])).toBeNull();
  });

  it('splats a soft pool: bright core, zero outside the rim, height in G', () => {
    const s = splatPools([{ x: 10, z: -4, y: 6.4, r: 4, k: 1 }]);
    expect(s).not.toBeNull();
    if (!s) return;
    const at = (x: number, z: number): [number, number] => {
      const i = Math.floor(((x - s.originX) / s.extent) * s.size);
      const j = Math.floor(((z - s.originZ) / s.extent) * s.size);
      const k = (j * s.size + i) * 2;
      return [s.data[k], s.data[k + 1]];
    };
    const [core, h] = at(10, -4);
    // D14: lower peak than a full-bright disc (the lamp stays brighter than its pool)
    expect(core).toBeGreaterThan(90);
    expect(core).toBeLessThan(235);
    expect((h / 255) * POOL_HEIGHT_RANGE).toBeCloseTo(6.4, 0);
    // small core, long soft tail, nothing beyond the wobbly rim (r × (1 + wobble))
    expect(at(12, -4)[0]).toBeLessThan(core * 0.5);
    expect(at(13, -4)[0]).toBeGreaterThan(0);
    expect(at(10 + 4 * (1 + POOLS.wobble + 0.03), -4)[0]).toBe(0);
  });

  it('falloff: peak < 1, quadratic tail, 0 at the rim (D14)', () => {
    expect(poolFalloff(0)).toBeCloseTo(POOLS.falloff.peak);
    expect(poolFalloff(0)).toBeLessThan(1);
    expect(poolFalloff(1)).toBe(0);
    let prev = poolFalloff(0);
    for (let t = 0.05; t < 1; t += 0.05) {
      const v = poolFalloff(t);
      expect(v).toBeLessThan(prev);
      prev = v;
    }
    // inverse-square-like: at 2× the core radius ≈ 1/5 of the peak
    expect(poolFalloff(2 * POOLS.falloff.core) / poolFalloff(0)).toBeLessThan(0.25);
  });

  it('is deterministic', () => {
    const src = [
      { x: 0, z: 0, y: 1, r: 3, k: 0.5 },
      { x: 2, z: 1, y: 1, r: 4, k: 1 },
    ];
    const a = splatPools(src);
    const b = splatPools(src);
    expect(a?.data).toEqual(b?.data);
  });
});

describe('lighthouse beam geometry (TASK-171)', () => {
  it('builds front + back cones and a flare quad with bounded size', () => {
    const g = buildBeamGeometry();
    const kinds = g.getAttribute('aBeam');
    let front = 0;
    let back = 0;
    let flare = 0;
    for (let i = 0; i < kinds.count; i++) {
      const k = kinds.getY(i);
      if (k === 0) front++;
      else if (k === 1) back++;
      else flare++;
    }
    expect(front).toBe(back);
    expect(flare).toBe(4);
    const pos = g.getAttribute('position');
    let maxX = 0;
    for (let i = 0; i < pos.count; i++) maxX = Math.max(maxX, Math.abs(pos.getX(i)));
    expect(maxX).toBeCloseTo(BEAM.length, 3);
    expect(g.boundingSphere?.radius).toBeGreaterThanOrEqual(BEAM.length);
    g.dispose();
  });
});
