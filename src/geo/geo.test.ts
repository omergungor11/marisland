import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { OFFICE_DEFS, OFFICE_INTERIOR_SHELLS, WORK_SPOTS } from '../content/offices.ts';
import { PROP_GEO, buildProp } from './index.ts';
import { THEME_GEO } from './themes/index.ts';

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
const NEW_IDS = new Set([...Object.keys(TARGET).slice(10), ...THEME_GEO.map((d) => d.id)]);
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

/* ------------------------- LOD0 vs LOD1 colour fidelity (TASK-378, D-031) ------------------------- */

/** Camera looks towards -axis: 'top' = down -y, 'front' = from +z, 'side' = from +x. */
type View = 'top' | 'front' | 'side';

/** Linear RGB -> CIE Lab (D65). */
function lab(r: number, g: number, b: number): [number, number, number] {
  const X = 0.4124564 * r + 0.3575761 * g + 0.1804375 * b;
  const Y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
  const Z = 0.0193339 * r + 0.119192 * g + 0.9503041 * b;
  const f = (t: number): number => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);
  const fx = f(X / 0.95047);
  const fy = f(Y);
  const fz = f(Z / 1.08883);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/**
 * Occlusion-aware mean colour of a view: every triangle is rasterised into a depth buffer (nearest
 * wins), then the visible vertex colours are averaged in Lab. Returns [L, a, b, covered area u2].
 */
function viewMean(
  g: THREE.BufferGeometry,
  view: View,
  cell = 0.1,
): [number, number, number, number] {
  const pos = g.getAttribute('position');
  const colA = g.getAttribute('color');
  // (u, v) = image axes, w = towards the camera
  const pick = (i: number): [number, number, number] => {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    return view === 'top' ? [x, z, y] : view === 'front' ? [x, y, z] : [-z, y, x];
  };
  const min = -8;
  const W = Math.round(16 / cell);
  const depth = new Float32Array(W * W).fill(-Infinity);
  const rgb = new Float32Array(W * W * 3);
  const clampI = (x: number): number => Math.max(0, Math.min(W - 1, x));
  for (let t = 0; t < pos.count; t += 3) {
    const p = [pick(t), pick(t + 1), pick(t + 2)];
    const den =
      (p[1][1] - p[2][1]) * (p[0][0] - p[2][0]) + (p[2][0] - p[1][0]) * (p[0][1] - p[2][1]);
    if (Math.abs(den) < 1e-9) continue;
    const c = [0, 0, 0];
    c[0] = (colA.getX(t) + colA.getX(t + 1) + colA.getX(t + 2)) / 3;
    c[1] = (colA.getY(t) + colA.getY(t + 1) + colA.getY(t + 2)) / 3;
    c[2] = (colA.getZ(t) + colA.getZ(t + 1) + colA.getZ(t + 2)) / 3;
    const iu0 = clampI(Math.floor((Math.min(p[0][0], p[1][0], p[2][0]) - min) / cell));
    const iu1 = clampI(Math.floor((Math.max(p[0][0], p[1][0], p[2][0]) - min) / cell));
    const iv0 = clampI(Math.floor((Math.min(p[0][1], p[1][1], p[2][1]) - min) / cell));
    const iv1 = clampI(Math.floor((Math.max(p[0][1], p[1][1], p[2][1]) - min) / cell));
    for (let iu = iu0; iu <= iu1; iu++)
      for (let iv = iv0; iv <= iv1; iv++) {
        const cu = min + (iu + 0.5) * cell;
        const cv = min + (iv + 0.5) * cell;
        const l1 =
          ((p[1][1] - p[2][1]) * (cu - p[2][0]) + (p[2][0] - p[1][0]) * (cv - p[2][1])) / den;
        const l2 =
          ((p[2][1] - p[0][1]) * (cu - p[2][0]) + (p[0][0] - p[2][0]) * (cv - p[2][1])) / den;
        const l3 = 1 - l1 - l2;
        if (l1 < 0 || l2 < 0 || l3 < 0) continue;
        const w = l1 * p[0][2] + l2 * p[1][2] + l3 * p[2][2];
        const k = iv * W + iu;
        if (w > depth[k]) {
          depth[k] = w;
          rgb[k * 3] = c[0];
          rgb[k * 3 + 1] = c[1];
          rgb[k * 3 + 2] = c[2];
        }
      }
  }
  let sl = 0;
  let sa = 0;
  let sb = 0;
  let cnt = 0;
  for (let k = 0; k < W * W; k++) {
    if (depth[k] === -Infinity) continue;
    const [L, A, B] = lab(rgb[k * 3], rgb[k * 3 + 1], rgb[k * 3 + 2]);
    sl += L;
    sa += A;
    sb += B;
    cnt++;
  }
  return [sl / cnt, sa / cnt, sb / cnt, cnt * cell * cell];
}

const deltaE = (a: number[], b: number[]): number =>
  Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** Lab mean over several seeds: the per-face colour jitter is seed noise, the bias between LODs is what we test. */
function seedMean(id: string, v: number, lod: 0 | 1, view: View): number[] {
  const acc = [0, 0, 0, 0];
  const seeds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  for (const seed of seeds) {
    const m = viewMean(buildProp(id, seed, v, lod), view);
    for (let k = 0; k < 4; k++) acc[k] += m[k] / seeds.length;
  }
  return acc;
}

describe('LOD1 keeps the LOD0 colours (TASK-378, D-031)', () => {
  const IDS = [...Object.keys(OFFICE_DEFS), 'lighthouse', 'clocktower', 'giantTree'];
  for (const id of IDS) {
    for (let v = 0; v < PROP_GEO[id].variants; v++) {
      it(`${id} v${v}: top-view mean ΔE <= 3, side views <= 12`, () => {
        // top = what the T0 camera (pitch 48 deg) mostly sees; the facade views are looser: LOD0
        // facades carry signs, pipes and frames that LOD1 only averages into its window quads
        expect(deltaE(seedMean(id, v, 0, 'top'), seedMean(id, v, 1, 'top'))).toBeLessThanOrEqual(3);
        for (const view of ['front', 'side'] as const)
          expect(
            deltaE(seedMean(id, v, 0, view), seedMean(id, v, 1, view)),
            view,
          ).toBeLessThanOrEqual(12);
      });
    }
  }
});
