import { describe, expect, it } from 'vitest';
import type * as THREE from 'three';
import { DATA_LAKE } from '../content/data-lake.ts';
import { dataLakeOf, generateWorld, lakePoint } from '../world/index.ts';
import { LAKE_COLOR_GLSL, LAKE_EMISSIVE_GLSL, lakeOf, lakeUniforms } from './lake.ts';

const parts = (world: Parameters<typeof lakeUniforms>[0]) => {
  const u = lakeUniforms(world);
  return {
    frame: u.uLakeFrame.value as THREE.Vector4,
    size: u.uLakeSize.value as THREE.Vector4,
    info: u.uLakeInfo.value as THREE.Vector2,
  };
};

describe('Data Lake uniforms (TASK-547)', () => {
  it('packs the one lake, with a reach that holds the outline and the spill', () => {
    const world = generateWorld(1001);
    const lakes = world.islands.map(dataLakeOf).filter((l) => l !== null);
    expect(lakes).toHaveLength(1);
    const l = lakes[0];
    expect(lakeOf(world)).toEqual(l);
    const { frame, size, info } = parts(world);
    expect([frame.x, frame.y]).toEqual([l.x, l.z]);
    expect(frame.z).toBeCloseTo(Math.cos(l.rotY), 6);
    expect(frame.w).toBeCloseTo(Math.sin(l.rotY), 6);
    expect([size.x, size.y, size.z, size.w]).toEqual([l.a, l.b, l.wobble, l.phase]);
    expect(info.x).toBe(l.level);
    for (let k = 0; k < 64; k++) {
      const p = lakePoint(l, (k / 64) * Math.PI * 2, DATA_LAKE.spill.radius);
      expect(Math.hypot(p.x - l.x, p.z - l.z) ** 2).toBeLessThan(info.y);
    }
  });

  it('is off without a lake: reach 0, so no fragment passes the gate', () => {
    const world = generateWorld(186);
    expect(lakeOf(world)).toBeNull();
    expect(parts(world).info.y).toBe(0);
  });

  it('keeps flow, packets and the spill behind MAR_DETAIL (low: static lines)', () => {
    const lowOnly = (glsl: string): string =>
      glsl.replace(/#ifdef MAR_DETAIL[\s\S]*?(#else|#endif)/g, '');
    expect(LAKE_COLOR_GLSL).toContain('uTime');
    expect(lowOnly(LAKE_COLOR_GLSL)).not.toContain('uTime');
    expect(lowOnly(LAKE_COLOR_GLSL)).not.toContain('marLakeK +=');
    expect(lowOnly(LAKE_EMISSIVE_GLSL)).not.toContain('marLakeK');
  });
});
