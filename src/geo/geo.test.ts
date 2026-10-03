import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { PROP_GEO, buildProp } from './index.ts';

const TARGET: Record<string, number> = {
  palm: 700,
  roundTree: 500,
  pine: 350,
  giantMushroom: 300,
  bush: 160,
  grassTuft: 24,
  flower: 60,
  reeds: 60,
  rockCluster: 300,
  treeBlob: 60,
};
const tris = (g: THREE.BufferGeometry): number => g.getAttribute('position').count / 3;

describe('prop geometry', () => {
  for (const def of Object.values(PROP_GEO)) {
    for (let v = 0; v < def.variants; v++) {
      for (const lod of [0, 1] as const) {
        it(`${def.id} v${v} lod${lod}`, () => {
          const g = buildProp(def.id, 7, v, lod);
          const n = g.getAttribute('position').count;
          expect(g.index).toBeNull();
          expect(n % 3).toBe(0);
          expect(n).toBeGreaterThan(0);
          for (const [name, size] of [
            ['normal', 3],
            ['color', 3],
            ['wind', 1],
            ['ao', 1],
          ] as const) {
            const a = g.getAttribute(name);
            expect(a.count).toBe(n);
            expect(a.itemSize).toBe(size);
          }
          expect(g.userData.tris).toBe(n / 3);
          for (const name of ['position', 'normal', 'color', 'wind', 'ao']) {
            const arr = g.getAttribute(name).array as Float32Array;
            expect(arr.every((x) => Number.isFinite(x))).toBe(true);
          }
          const col = g.getAttribute('color').array as Float32Array;
          expect(col.every((x) => x >= 0 && x <= 1)).toBe(true);
          const c = new THREE.Color();
          const hsl = { h: 0, s: 0, l: 0 };
          let minL = 1;
          for (let i = 0; i < n; i++) {
            c.fromArray(col, i * 3).getHSL(hsl);
            minL = Math.min(minL, hsl.l);
          }
          expect(minL).toBeGreaterThanOrEqual(0.12);
          const ao = g.getAttribute('ao').array as Float32Array;
          expect(ao.every((x) => x >= 0.75 && x <= 1)).toBe(true);
          const wind = g.getAttribute('wind').array as Float32Array;
          expect(wind.every((x) => x >= 0 && x <= 1)).toBe(true);
          const bb = g.boundingBox!;
          expect(bb.min.y).toBeGreaterThanOrEqual(-0.05);
          const h = def.heights?.[v] ?? def.height;
          expect(bb.max.y).toBeGreaterThanOrEqual(h * 0.65);
          expect(bb.max.y).toBeLessThanOrEqual(h * 1.35);
          if (lod === 0 && TARGET[def.id]) expect(tris(g)).toBeLessThanOrEqual(TARGET[def.id]);
          if (lod === 1)
            expect(tris(g)).toBeLessThanOrEqual(0.3 * tris(buildProp(def.id, 7, v, 0)));
        });
      }
    }
    it(`${def.id} is deterministic and seed-sensitive`, () => {
      const a = buildProp(def.id, 3, 0, 0).getAttribute('position').array as Float32Array;
      const b = buildProp(def.id, 3, 0, 0).getAttribute('position').array as Float32Array;
      const c = buildProp(def.id, 4, 0, 0).getAttribute('position').array as Float32Array;
      expect(Array.from(a)).toEqual(Array.from(b));
      expect(Array.from(a)).not.toEqual(Array.from(c));
    });
  }
});
