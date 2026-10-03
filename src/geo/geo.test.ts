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
  cottage: 400,
  stiltHut: 600,
  windmill: 900,
  lighthouse: 900,
  clocktower: 700,
  giantTree: 1400,
  sunkenShip: 700,
  seaStack: 400,
  sailboat: 500,
  towerHouse: 500,
  barn: 500,
  logCabin: 600,
  marketStall: 450,
  fence: 150,
  lanternPost: 150,
  laundryLine: 150,
  bunting: 150,
  bench: 150,
  barrel: 150,
  crate: 150,
  well: 150,
  steppingStone: 150,
  shell: 150,
  starfish: 150,
  messageBottle: 150,
  dock: 200,
  rowboat: 250,
  buoy: 150,
  driftwood: 150,
  tidePool: 200,
  hotSpring: 300,
  volcanoCrater: 200,
};

/** Props from the buildings/coastal/decor/landmarks families: carry an `emissive` attribute. */
const NEW_IDS = new Set(Object.keys(TARGET).slice(10));
/** Props whose LOD0 must actually glow somewhere (windows, lamps, lava). */
const GLOWS = new Set([
  'cottage',
  'stiltHut',
  'towerHouse',
  'windmill',
  'barn',
  'logCabin',
  'lanternPost',
  'lighthouse',
  'clocktower',
  'giantTree',
  'volcanoCrater',
]);
/** Props with cloth/sail/flag wind weights baked in. */
const WINDY_CLOTH = new Set(['laundryLine', 'bunting', 'sailboat', 'clocktower', 'giantTree']);
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
          const windMax = def.id === 'windmill' ? 2 : 1;
          expect(wind.every((x) => x >= 0 && x <= windMax)).toBe(true);
          if (def.id === 'windmill') {
            // blades (and hub cap) spin via aSpin = (hub, 1) and carry no sway (wind = 0)
            expect(wind.every((x) => x === 0)).toBe(true);
            const hub = g.userData.hub as number[];
            expect(hub).toHaveLength(3);
            expect(hub.every((x) => Number.isFinite(x))).toBe(true);
            expect(hub[1]).toBeGreaterThan(4);
            const spin = g.getAttribute('aSpin');
            expect(spin.itemSize).toBe(4);
            expect(spin.count).toBe(n);
            const sa = spin.array as Float32Array;
            let blades = 0;
            for (let i = 0; i < n; i++) {
              const w = sa[i * 4 + 3];
              expect(w === 0 || w === 1).toBe(true);
              if (w === 1) {
                blades++;
                expect(sa[i * 4]).toBeCloseTo(hub[0], 5);
                expect(sa[i * 4 + 1]).toBeCloseTo(hub[1], 5);
                expect(sa[i * 4 + 2]).toBeCloseTo(hub[2], 5);
              }
            }
            expect(blades).toBeGreaterThan(0);
            expect(blades).toBeLessThan(n);
          } else if (lod === 0 && WINDY_CLOTH.has(def.id)) {
            expect(wind.some((x) => x > 0)).toBe(true);
          }
          if (NEW_IDS.has(def.id)) {
            const em = g.getAttribute('emissive');
            expect(em.itemSize).toBe(1);
            expect(em.count).toBe(n);
            const ea = em.array as Float32Array;
            expect(ea.every((x) => Number.isFinite(x) && x >= 0 && x <= 1)).toBe(true);
            if (lod === 0 && GLOWS.has(def.id)) expect(ea.some((x) => x >= 0.6)).toBe(true);
            // emissive faces are whole triangles
            for (let f = 0; f < n; f += 3)
              expect(ea[f] === ea[f + 1] && ea[f] === ea[f + 2]).toBe(true);
          } else {
            expect(g.getAttribute('emissive')).toBeUndefined();
          }
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
