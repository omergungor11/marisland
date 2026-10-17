import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { COMET, METEORS } from '../../content/lighting.ts';
import { cometAt, meteorAt } from './sky.ts';

const DEG = Math.PI / 180;

describe('comet (TASK-472 G2)', () => {
  const sun = { x: 0.59, y: -0.45, z: 0.7 }; // the 22:00 sky sun, below the horizon
  it('rises over the ritual phase, tail away from the sun and perpendicular to the head', () => {
    const head = new THREE.Vector3();
    const tail = new THREE.Vector3();
    expect(cometAt(-1, sun, head, tail)).toBe(0);
    expect(cometAt(0, sun, head, tail)).toBe(0);
    const k = cometAt(0.5, sun, head, tail);
    expect(k).toBe(1);
    const el = Math.asin(head.y) / DEG;
    expect(el).toBeGreaterThan(COMET.elevation[0]);
    expect(el).toBeLessThan(COMET.elevation[1]);
    expect(Math.abs(head.dot(tail))).toBeLessThan(1e-6);
    expect(tail.y).toBeGreaterThan(0); // streams upward
    expect(tail.dot(new THREE.Vector3(sun.x, sun.y, sun.z))).toBeLessThan(0);
    expect(cometAt(1, sun, head, tail)).toBe(0);
    expect(Math.asin(head.y) / DEG).toBeCloseTo(COMET.elevation[1], 5);
  });
});

describe('shooting stars (TASK-472 G2)', () => {
  it('are seeded, 40–90 s apart, 0.6 s long, within the elevation band', () => {
    const start = new THREE.Vector3();
    const dir = new THREE.Vector3();
    const starts: number[] = [];
    let last = -1;
    for (let t = 0; t < 1200; t += 0.05) {
      const m = meteorAt(t, 1001, start, dir);
      if (m.progress >= 0 && last < 0) {
        starts.push(t);
        const el = Math.asin(start.y) / DEG;
        expect(el).toBeGreaterThanOrEqual(METEORS.elevation[0] - 1e-6);
        expect(el).toBeLessThanOrEqual(METEORS.elevation[1] + 1e-6);
        expect(Math.abs(start.dot(dir))).toBeLessThan(1e-6);
        expect(dir.y).toBeLessThan(0); // slants down
        expect(m.length / DEG).toBeGreaterThanOrEqual(METEORS.lengthDeg[0] - 1e-6);
      }
      last = m.progress;
    }
    expect(starts.length).toBeGreaterThan(10);
    for (let i = 1; i < starts.length; i++) {
      const gap = starts[i] - starts[i - 1];
      expect(gap).toBeGreaterThanOrEqual(METEORS.interval[0] - 0.1);
      expect(gap).toBeLessThanOrEqual(METEORS.interval[1] + 0.1);
    }
    // same clock + seed → same meteor; another seed → a different one
    const a = meteorAt(starts[3] + 0.3, 1001, start, dir).progress;
    const b = meteorAt(starts[3] + 0.3, 1001, new THREE.Vector3(), new THREE.Vector3()).progress;
    expect(a).toBe(b);
    const s2 = new THREE.Vector3();
    let differs = false;
    for (let t = 0; t < 400 && !differs; t += 0.1)
      if (meteorAt(t, 7, s2, dir).progress >= 0 && meteorAt(t, 1001, start, dir).progress < 0)
        differs = true;
    expect(differs).toBe(true);
  });
});
