import { describe, expect, it } from 'vitest';
import type * as THREE from 'three';
import { LAVA } from '../content/lava.ts';
import { generateWorld, heightAt } from '../world/index.ts';
import { lavaFlows, lavaUniforms } from './lava.ts';

describe('lava river uniforms (TASK-509a)', () => {
  const world = generateWorld(1001);

  it('packs the Emberpeak channel: points, ground y, arc length, bounds', () => {
    const flows = lavaFlows(world);
    expect(flows).toHaveLength(1);
    const ch = flows[0].channel;
    expect(ch.length).toBeGreaterThanOrEqual(3);
    expect(ch.length).toBeLessThanOrEqual(LAVA.maxPoints);
    expect(flows[0].fall).not.toBeNull();
    const u = lavaUniforms(world);
    const pts = u.uLavaPt.value as THREE.Vector4[];
    const info = u.uLavaInfo.value as THREE.Vector4;
    const box = u.uLavaBox.value as THREE.Vector4;
    expect(pts).toHaveLength(LAVA.maxPoints);
    expect(info.x).toBe(ch.length);
    let s = 0;
    for (let k = 0; k < ch.length; k++) {
      if (k > 0) s += Math.hypot(ch[k].x - ch[k - 1].x, ch[k].z - ch[k - 1].z);
      expect(pts[k].x).toBe(ch[k].x);
      expect(pts[k].y).toBe(ch[k].z);
      expect(pts[k].z).toBe(heightAt(world.height, ch[k].x, ch[k].z));
      expect(pts[k].w).toBeCloseTo(s, 4);
      expect(ch[k].x).toBeGreaterThan(box.x);
      expect(ch[k].z).toBeGreaterThan(box.y);
      expect(ch[k].x).toBeLessThan(box.z);
      expect(ch[k].z).toBeLessThan(box.w);
    }
    expect(info.y).toBeCloseTo(s, 4);
    // downhill from the notch to the lip
    expect(pts[ch.length - 1].z).toBeLessThan(pts[0].z);
  });
});
