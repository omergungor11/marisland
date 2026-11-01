/** TASK-540: QA Thrill Test Park coaster kit (track builder, station, cars, riders, bumper cars, board, cart). */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { cultureCapOverride } from '../../content/budgets.ts';
import { QA_CULTURE } from '../../content/cultures/qa.ts';
import { validateCultures } from '../../content/cultures/validate.ts';
import { PROP_DEFS, PROP_DEF_INDEX } from '../../content/props.ts';
import { QA_COASTER_PROP_DEFS } from '../../content/props-themes/qa-coaster.ts';
import {
  QA_COASTER as F,
  QA_COASTER_BUDGET,
  QA_COASTER_FIXTURE as FX,
} from '../../content/themes/qa-coaster.ts';
import { createRng } from '../../core/rng.ts';
import { isLargeStructure } from '../../render/props/batcher.ts';
import { PropFlag } from '../../world/prop-store.ts';
import { PROP_GEO, buildProp } from '../registry.ts';
import { QA_GEO } from './qa.ts';
import { CULTURE_QA_GEO } from './culture-qa.ts';
import { buildCoasterTrack, fixtureChain, fixtureSpline } from './qa-coaster.ts';

const tris = (g: THREE.BufferGeometry): number => g.getAttribute('position').count / 3;
const size = (g: THREE.BufferGeometry): THREE.Vector3 => {
  g.computeBoundingBox();
  return (g.boundingBox as THREE.Box3).getSize(new THREE.Vector3());
};
const box = (g: THREE.BufferGeometry): THREE.Box3 => {
  g.computeBoundingBox();
  return g.boundingBox as THREE.Box3;
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const hooks = (g: THREE.BufferGeometry): Record<string, any> => g.userData.hooks ?? {};

/** LOD0 triangle budgets per def (every variant). */
const BUDGET: Record<string, number> = {
  coasterStation: 1600,
  coasterCar: 700,
  coasterRider: 700,
  bumperCar: 800,
};
const NEW_VARIANTS: ReadonlyArray<readonly [string, number]> = [
  ['checklistBoard', 2],
  ['inspectionBooth', 1],
];

describe('TASK-540 defs and ledger', () => {
  it('two new defs at the end of PROP_DEFS (after the M33 Coding block), geo and PropDef agree', () => {
    expect(QA_COASTER_PROP_DEFS.map((d) => d.id)).toEqual(['coasterTrack', 'coasterStation']);
    expect(PROP_DEFS.slice(-2).map((d) => d.id)).toEqual(['coasterTrack', 'coasterStation']);
    expect(PROP_DEF_INDEX.coasterTrack).toBeGreaterThan(PROP_DEF_INDEX.quantumPavilion);
    for (const d of QA_COASTER_PROP_DEFS) {
      expect(PROP_GEO[d.geo], d.id).toBeDefined();
      expect(PROP_GEO[d.geo].variants).toBe(d.variants);
    }
    expect(PROP_DEFS[PROP_DEF_INDEX.coasterTrack].tier).toBe(1);
    expect(PROP_DEFS[PROP_DEF_INDEX.coasterStation].tier).toBe(2);
    expect(PROP_DEFS[PROP_DEF_INDEX.coasterStation].flags & PropFlag.grounded).not.toBe(0);
  });

  it('QA ledger: cap 17 / tier-1 2 (the coaster is the second tier-1), valid', () => {
    expect(cultureCapOverride.qa).toEqual({ defs: 17, tier1: 2 });
    expect(QA_CULTURE.kit).toHaveLength(17);
    expect(QA_CULTURE.kit.slice(-2).map((k) => k.id)).toEqual(['coasterTrack', 'coasterStation']);
    expect(QA_CULTURE.kit.filter((k) => k.tier === 1).map((k) => k.id)).toEqual([
      'dropTower',
      'coasterTrack',
    ]);
    expect(validateCultures([QA_CULTURE])).toEqual([]);
  });

  it('cars, riders and bumper cars are geo-only movers (no PropDef, no ledger entry)', () => {
    for (const id of ['coasterCar', 'coasterRider', 'bumperCar']) {
      expect(PROP_GEO[id], id).toBeDefined();
      expect(PROP_DEF_INDEX[id], id).toBeUndefined();
      expect(QA_CULTURE.kit.map((k) => k.id)).not.toContain(id);
    }
    expect(PROP_GEO.coasterCar.variants).toBe(2);
    expect(PROP_GEO.coasterRider.variants).toBe(3);
    expect(PROP_GEO.bumperCar.variants).toBe(3);
  });

  it('the board and the cart are variants of old defs; random rolls stay on the old variants', () => {
    const board = PROP_DEFS[PROP_DEF_INDEX.checklistBoard];
    const booth = PROP_DEFS[PROP_DEF_INDEX.inspectionBooth];
    expect(board.variants).toBe(3);
    expect(board.rollVariants).toBe(2);
    expect(booth.variants).toBe(2);
    expect(booth.rollVariants).toBe(1);
    expect(PROP_GEO.checklistBoard.variants).toBe(3);
    expect(PROP_GEO.inspectionBooth.variants).toBe(2);
    expect(PROP_GEO.checklistBoard.heights).toHaveLength(3);
  });

  it('old variants keep their builders and seeded bytes', () => {
    const raw = [...QA_GEO, ...CULTURE_QA_GEO];
    for (const [id, first] of NEW_VARIANTS) {
      const old = raw.find((d) => d.id === id);
      expect(old, id).toBeDefined();
      for (let v = 0; v < first; v++) {
        const rng = createRng(11).fork('geo', v).fork(id);
        const a = (old as (typeof raw)[number]).build({ rng, lod: 0, variant: v });
        const b = buildProp(id, 11, v, 0);
        expect(Array.from(b.getAttribute('position').array), `${id} v${v}`).toEqual(
          Array.from(a.getAttribute('position').array),
        );
      }
    }
  });

  it('tier hazard (D-096): the track and station are large in every variant, the new old-def variants are not', () => {
    const def = (id: string): (typeof PROP_DEFS)[number] => PROP_DEFS[PROP_DEF_INDEX[id]];
    for (const seed of [1, 2, 3])
      for (const id of ['coasterTrack', 'coasterStation'])
        expect(isLargeStructure(def(id), size(buildProp(id, seed, 0, 0))), id).toBe(true);
    for (const [id, v] of NEW_VARIANTS)
      for (const seed of [1, 2, 3, 4])
        expect(isLargeStructure(def(id), size(buildProp(id, seed, v, 0))), `${id} v${v}`).toBe(
          false,
        );
  });
});

describe('TASK-540 triangle budgets', () => {
  it('every piece within its budget, LOD1 <= 30 % of LOD0, deterministic per seed', () => {
    const ids = [...Object.keys(BUDGET), 'checklistBoard', 'inspectionBooth'];
    for (const id of ids) {
      const first = NEW_VARIANTS.find(([i]) => i === id)?.[1] ?? 0;
      for (let v = first; v < PROP_GEO[id].variants; v++) {
        const a = buildProp(id, 3, v, 0);
        const b = buildProp(id, 3, v, 1);
        const c = buildProp(id, 3, v, 0);
        if (BUDGET[id]) expect(tris(a), `${id} v${v}`).toBeLessThanOrEqual(BUDGET[id]);
        expect(tris(b), `${id} v${v} LOD1`).toBeLessThanOrEqual(tris(a) * 0.3 + 1e-9);
        expect(Array.from(c.getAttribute('position').array)).toEqual(
          Array.from(a.getAttribute('position').array),
        );
        for (const n of ['color', 'ao', 'emissive', 'wind'])
          expect(a.getAttribute(n), `${id} v${v} ${n}`).toBeDefined();
      }
    }
  });

  it('track: tris per metre of the fixture and LOD1 share are pinned', () => {
    const len = fixtureSpline().length;
    const t0 = tris(buildProp('coasterTrack', 5, 0, 0));
    const t1 = tris(buildProp('coasterTrack', 5, 0, 1));
    expect(t0 / len).toBeLessThanOrEqual(QA_COASTER_BUDGET.perMetre);
    expect(t1).toBeLessThanOrEqual(t0 * QA_COASTER_BUDGET.lod1Fraction);
  });
});

describe('TASK-540 track builder', () => {
  const GROUND = 0.5;
  const g0 = buildCoasterTrack({
    points: FX.points,
    closed: true,
    groundY: () => GROUND,
    chain: fixtureChain(),
  });

  it('spans the spline: rails reach its highest point, columns stand on groundY (sunk by the footing)', () => {
    const sp = fixtureSpline();
    let maxY = -Infinity;
    for (let i = 0; i <= sp.n; i++) maxY = Math.max(maxY, sp.pos[i * 3 + 1]);
    const b = box(g0);
    expect(b.max.y).toBeGreaterThan(maxY - 0.1);
    expect(b.max.y).toBeLessThan(maxY + 0.2);
    expect(b.min.y).toBeGreaterThan(GROUND - 0.31);
    expect(b.min.y).toBeLessThan(GROUND - 0.2);
    for (const v of b.min.toArray().concat(b.max.toArray())) expect(Number.isFinite(v)).toBe(true);
  });

  it('follows the ground: columns end lower where the ground is lower', () => {
    const slope = buildCoasterTrack({
      points: FX.points,
      closed: true,
      groundY: (x) => 0.04 * x,
    });
    const flat = buildCoasterTrack({ points: FX.points, closed: true, groundY: () => 0 });
    expect(box(slope).min.y).toBeLessThan(box(flat).min.y - 0.4); // x = -17 -> -0.7
  });

  it('hooks carry what the motion task needs', () => {
    const t = hooks(g0).track;
    expect(t.closed).toBe(true);
    expect(t.length).toBeCloseTo(fixtureSpline().length, 6);
    expect(t.gauge).toBe(F.track.gauge);
    expect(t.chain).toEqual(fixtureChain());
    expect(t.chain[0][1]).toBeGreaterThan(t.chain[0][0] + 10);
  });

  it('a different seed varies the ties and the tones only: same triangles, same bounds, rails on the spline', () => {
    const mkTrack = (seed: number): THREE.BufferGeometry =>
      buildCoasterTrack({
        points: FX.points,
        closed: true,
        groundY: () => 0,
        rng: createRng(seed),
      });
    const a = mkTrack(1);
    const b = mkTrack(2);
    expect(tris(a)).toBe(tris(b));
    expect(Array.from(a.getAttribute('position').array)).not.toEqual(
      Array.from(b.getAttribute('position').array),
    );
    expect(Array.from(a.getAttribute('color').array)).not.toEqual(
      Array.from(b.getAttribute('color').array),
    );
    const sa = size(a);
    const sb = size(b);
    expect(Math.abs(sa.x - sb.x)).toBeLessThan(0.2);
    expect(Math.abs(sa.y - sb.y)).toBeLessThan(0.2);
    expect(Math.abs(sa.z - sb.z)).toBeLessThan(0.2);
    // same seed, same bytes
    expect(Array.from(mkTrack(1).getAttribute('position').array)).toEqual(
      Array.from(a.getAttribute('position').array),
    );
  });

  it('works on an open spline and on a flat oval (no loop, no chain)', () => {
    const oval = Array.from({ length: 16 }, (_, k) => {
      const a = (k / 16) * Math.PI * 2;
      return [12 * Math.cos(a), 3, 7 * Math.sin(a)] as const;
    });
    const closed = buildCoasterTrack({ points: oval, closed: true, groundY: () => 0 });
    const open = buildCoasterTrack({ points: oval.slice(0, 10), closed: false, groundY: () => 0 });
    expect(tris(closed)).toBeGreaterThan(500);
    expect(tris(open)).toBeGreaterThan(200);
    expect(hooks(open).track.closed).toBe(false);
    expect(hooks(closed).track.chain).toEqual([]);
  });

  it('rail faces point away from the rail axis (winding), on a straight run', () => {
    const line = [-12, -4, 4, 12].map((x) => [x, 4, 0] as const);
    const g = buildCoasterTrack({ points: line, closed: false, groundY: () => -50 });
    const p = g.getAttribute('position');
    const n = g.getAttribute('normal');
    let railFaces = 0;
    for (let t = 0; t < p.count; t += 3) {
      const cx = (p.getX(t) + p.getX(t + 1) + p.getX(t + 2)) / 3;
      const cy = (p.getY(t) + p.getY(t + 1) + p.getY(t + 2)) / 3;
      const cz = (p.getZ(t) + p.getZ(t + 1) + p.getZ(t + 2)) / 3;
      for (const sz of [-1, 1]) {
        const dz = cz - sz * F.track.gauge * 0.5;
        const dy = cy - (4 - F.track.railR);
        if (Math.hypot(dz, dy) < F.track.railR * 1.01 && Math.abs(cx) < 8) {
          railFaces++;
          expect(n.getZ(t) * dz + n.getY(t) * dy, `face ${t / 3}`).toBeGreaterThan(0);
        }
      }
    }
    expect(railFaces).toBeGreaterThan(10);
  });
});

describe('TASK-540 station, cars, riders, bumper cars', () => {
  it('station: the track passes along +x at z 0, rail top at railY, platform beside it', () => {
    const g = buildProp('coasterStation', 4, 0, 0);
    const h = hooks(g);
    expect(h.track).toEqual({
      x0: -F.station.length / 2,
      x1: F.station.length / 2,
      z: 0,
      y: F.station.railY,
    });
    expect(h.platform.y).toBeLessThan(F.station.railY);
    expect(h.platform.z0).toBeGreaterThan(F.track.gauge / 2);
    expect(h.lamp.at[1]).toBeGreaterThan(h.platform.y + 1.5);
    const b = box(g);
    expect(b.min.y).toBeGreaterThanOrEqual(-1e-6);
    expect(b.max.y).toBeLessThan(5);
  });

  it('car: origin on the rail top, wheels on it, 1.2 wide, seats hook sits on the cushions', () => {
    for (const v of [0, 1]) {
      const g = buildProp('coasterCar', 2, v, 0);
      const b = box(g);
      expect(b.min.y).toBeCloseTo(0, 2);
      expect(b.max.x - b.min.x).toBeLessThan(F.car.width + 0.1);
      expect(b.max.z - b.min.z).toBeLessThan(F.car.pitch); // fits its slot in the train
      const s = hooks(g).seats;
      expect(s.list).toHaveLength(2);
      expect(s.list[0][0]).toBeCloseTo(-s.list[1][0], 6);
      expect(s.list[0][1]).toBeGreaterThan(0.8);
      expect(hooks(g).headlamp).toBeDefined();
    }
    const mint = Array.from(buildProp('coasterCar', 2, 0, 0).getAttribute('color').array);
    const yellow = Array.from(buildProp('coasterCar', 2, 1, 0).getAttribute('color').array);
    expect(mint).not.toEqual(yellow);
  });

  it('riders: hips on the origin, under 1.3 u tall, the three variants differ', () => {
    const cols = [0, 1, 2].map((v) => {
      const g = buildProp('coasterRider', 2, v, 0);
      const b = box(g);
      expect(b.max.y).toBeLessThan(1.3);
      expect(b.min.y).toBeGreaterThan(-0.4);
      return Array.from(g.getAttribute('color').array).join(',');
    });
    expect(new Set(cols).size).toBe(3);
  });

  it('bumper cars: round, under 1.6 u across, floor at 0', () => {
    for (let v = 0; v < 3; v++) {
      const b = box(buildProp('bumperCar', 2, v, 0));
      expect(b.min.y).toBeCloseTo(0, 2);
      expect(b.max.x - b.min.x).toBeLessThan(1.6);
      expect(b.max.z - b.min.z).toBeLessThan(1.6);
    }
  });

  it('TESTED board v2 has the check lamp slot; the cotton-candy cart is under 3 u', () => {
    const board = buildProp('checklistBoard', 2, 2, 0);
    expect(hooks(board).lamp.r).toBeGreaterThan(0.1);
    expect(size(board).y).toBeLessThan(3);
    const cart = buildProp('inspectionBooth', 2, 1, 0);
    expect(size(cart).y).toBeLessThan(3);
    expect(hooks(cart).drum).toBeDefined();
  });
});
