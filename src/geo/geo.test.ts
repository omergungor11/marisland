import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { OFFICE_DEFS, OFFICE_INTERIOR_SHELLS, WORK_SPOTS } from '../content/offices.ts';
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
  clocktower: 1100,
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
  // phase 3 (TASK-303): shell LOD0 <= 3.5k, interior <= 2.5k, proxy <= 150
  hqOffice: 3500,
  hqAnnex: 3500,
  meetingPavilion: 3500,
  coffeeKiosk: 3500,
  devOffice: 3500,
  devPod: 3500,
  serverShed: 3500,
  broadcastStudio: 3500,
  billboard: 3500,
  testLab: 3500,
  inspectionTower: 3500,
  testLabStilt: 3500,
  atelier: 3500,
  galleryPavilion: 3500,
  dataCenter: 3500,
  rackShed: 3500,
  antennaMast: 3500,
  researchHut: 3500,
  telescope: 400,
  officeLod1: 150,
  officeInterior: 2500,
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
  ...Object.keys(OFFICE_DEFS),
  'officeLod1',
]);
/** Phase-3 props whose geometry carries `aSpin` (fans, beacon ring, pinwheel): z-axis spin about a hub. */
const SPINNERS = new Set(['serverShed', 'dataCenter', 'rackShed', 'researchHut']);
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
          if (lod === 0 && (SPINNERS.has(def.id) || (def.id === 'clocktower' && v === 2))) {
            const spin = g.getAttribute('aSpin');
            expect(spin.itemSize).toBe(4);
            expect(spin.count).toBe(n);
            const hubs = g.userData.hubs as number[][];
            expect(hubs.length).toBeGreaterThan(0);
            const sa = spin.array as Float32Array;
            let spun = 0;
            for (let i = 0; i < n; i++) {
              const w4 = sa[i * 4 + 3];
              expect(w4 === 0 || w4 === 1).toBe(true);
              if (w4 === 1) {
                spun++;
                expect(
                  hubs.some(
                    (h) =>
                      Math.abs(h[0] - sa[i * 4]) < 1e-5 && Math.abs(h[1] - sa[i * 4 + 1]) < 1e-5,
                  ),
                ).toBe(true);
                expect(wind[i]).toBe(0);
              }
            }
            expect(spun).toBeGreaterThan(0);
            expect(spun).toBeLessThan(n);
          }
          if (NEW_IDS.has(def.id)) {
            const em = g.getAttribute('emissive');
            expect(em.itemSize).toBe(1);
            expect(em.count).toBe(n);
            const ea = em.array as Float32Array;
            // 0..1 glow, 2 = screen / LED class (TASK-305)
            expect(ea.every((x) => Number.isFinite(x) && x >= 0 && x <= 2)).toBe(true);
            if (lod === 0 && GLOWS.has(def.id)) expect(ea.some((x) => x === 1)).toBe(true);
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

describe('office shells (TASK-303)', () => {
  const bbox = (id: string, v: number): THREE.Box3 => buildProp(id, 7, v, 0).boundingBox!;

  it('every OFFICE_DEFS id has a geo with its variant count', () => {
    for (const [id, def] of Object.entries(OFFICE_DEFS)) {
      expect(PROP_GEO[id], id).toBeDefined();
      expect(PROP_GEO[id].variants, id).toBe(def.variants);
    }
  });

  it('shells stay within their lot footprint (small decor may overhang the door side)', () => {
    for (const [id, def] of Object.entries(OFFICE_DEFS)) {
      for (let v = 0; v < def.variants; v++) {
        const b = bbox(id, v);
        const tol = 0.8;
        expect(b.min.x, `${id} v${v}`).toBeGreaterThanOrEqual(-def.w / 2 - tol);
        expect(b.max.x, `${id} v${v}`).toBeLessThanOrEqual(def.w / 2 + tol);
        expect(b.min.z, `${id} v${v}`).toBeGreaterThanOrEqual(-def.d / 2 - tol);
        expect(b.max.z, `${id} v${v}`).toBeLessThanOrEqual(def.d / 2 + tol);
      }
    }
  });

  it('officeLod1 has 4 size classes, LOD1 <= 45 tris', () => {
    expect(PROP_GEO.officeLod1.variants).toBe(4);
    for (let v = 0; v < 4; v++)
      expect(tris(buildProp('officeLod1', 7, v, 1))).toBeLessThanOrEqual(45);
  });

  it('officeInterior: one variant per interior shell, furniture sits at the WORK_SPOTS', () => {
    expect(PROP_GEO.officeInterior.variants).toBe(OFFICE_INTERIOR_SHELLS.length);
    OFFICE_INTERIOR_SHELLS.forEach((shell, v) => {
      const g = buildProp('officeInterior', 7, v, 0);
      const pos = g.getAttribute('position');
      const em = g.getAttribute('emissive');
      const screens: THREE.Vector3[] = [];
      for (let i = 0; i < pos.count; i++)
        if (em.getX(i) === 2) screens.push(new THREE.Vector3().fromBufferAttribute(pos, i));
      expect(screens.length, shell).toBeGreaterThan(0);
      for (const s of WORK_SPOTS[shell]) {
        if (s.pose !== 'type' && s.pose !== 'rack') continue;
        const fx = Math.sin(s.face);
        const fz = Math.cos(s.face);
        // an emissive-2 screen / LED vertex 0.35..1.3 u ahead of the seat, within 0.7 u sideways
        const ok = screens.some((p) => {
          const dx = p.x - s.x;
          const dz = p.z - s.z;
          const ahead = dx * fx + dz * fz;
          const side = Math.abs(dx * fz - dz * fx);
          return ahead > 0.35 && ahead < 1.3 && side < 0.7;
        });
        expect(ok, `${shell} spot (${s.x}, ${s.z})`).toBe(true);
      }
    });
  });
});
