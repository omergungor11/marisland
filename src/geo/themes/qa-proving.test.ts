/** TASK-499: QA Proving Grounds kit (drop tower, test fan, obstacle course): budgets, pivots, hooks, spin. */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { PROP_DEFS, PROP_DEF_INDEX } from '../../content/props.ts';
import { QA_PROVING_PROP_DEFS } from '../../content/props-themes/qa-proving.ts';
import { PROVING_PAL, QA_PROVING } from '../../content/themes/qa-proving.ts';
import { PropFlag } from '../../world/prop-store.ts';
import { isLargeStructure } from '../../render/props/batcher.ts';
import { PROP_GEO, buildProp } from '../registry.ts';
import { FAN_SPIN_TAG, buildDropCrate } from './qa-proving.ts';

const tris = (g: THREE.BufferGeometry): number => g.getAttribute('position').count / 3;
const size = (g: THREE.BufferGeometry): THREE.Vector3 =>
  (g.boundingBox as THREE.Box3).getSize(new THREE.Vector3());
const arr = (g: THREE.BufferGeometry, name: string): number[] =>
  Array.from(g.getAttribute(name).array);

/** Triangle budgets (LOD0), the far proxy must stay under 30 % of it. */
const BUDGET: Record<string, number> = { dropTower: 1100, testFan: 1300, obstacle: 800 };

describe('TASK-499 Proving Grounds defs', () => {
  it('three defs, planner-pinned, in PROP_DEFS with matching geo variants', () => {
    expect(QA_PROVING_PROP_DEFS.map((d) => d.id)).toEqual(['dropTower', 'testFan', 'obstacle']);
    for (const d of QA_PROVING_PROP_DEFS) {
      expect(PROP_GEO[d.id].variants, d.id).toBe(d.variants);
      expect(PROP_DEFS[PROP_DEF_INDEX[d.id]].id).toBe(d.id);
      expect(d.rollVariants ?? d.variants, d.id).toBeLessThanOrEqual(d.variants);
    }
    const byId = Object.fromEntries(QA_PROVING_PROP_DEFS.map((d) => [d.id, d]));
    expect(byId.dropTower.tier).toBe(1);
    expect(byId.testFan.tier).toBe(2);
    expect(byId.obstacle.tier).toBe(2);
    expect(byId.obstacle.variants).toBe(4);
    expect((byId.testFan.flags & PropFlag.windy) !== 0).toBe(true);
  });

  it('appended after every older def, so no existing defId shifts', () => {
    const first = PROP_DEF_INDEX.dropTower;
    expect(PROP_DEF_INDEX.testFan).toBe(first + 1);
    expect(PROP_DEF_INDEX.obstacle).toBe(first + 2);
    expect(PROP_DEFS.length).toBeGreaterThanOrEqual(first + 3);
    // the kit sits at the tail with the M23 beacon before it
    expect(PROP_DEF_INDEX.skerryBeacon ?? first - 1).toBeLessThan(first);
  });

  it('the tower and the fan are structures drawn from T0 by size (> 3 u), the obstacles are not', () => {
    for (const id of ['dropTower', 'testFan'])
      expect(
        isLargeStructure(PROP_DEFS[PROP_DEF_INDEX[id]], size(buildProp(id, 5, 0, 0))),
        id,
      ).toBe(true);
    for (let v = 0; v < 4; v++)
      expect(
        isLargeStructure(PROP_DEFS[PROP_DEF_INDEX.obstacle], size(buildProp('obstacle', 5, v, 0))),
      ).toBe(false);
  });
});

describe('TASK-499 Proving Grounds geometry', () => {
  for (const geo of QA_PROVING_PROP_DEFS) {
    const g = PROP_GEO[geo.id];
    for (let v = 0; v < g.variants; v++) {
      for (const seed of [3, 1001]) {
        it(`${geo.id} v${v} seed ${seed}: budget, ground pivot, LOD1 <= 30 %, vertex colours`, () => {
          const g0 = buildProp(geo.id, seed, v, 0);
          const g1 = buildProp(geo.id, seed, v, 1);
          expect(tris(g0)).toBeLessThanOrEqual(BUDGET[geo.id]);
          expect(tris(g1)).toBeLessThanOrEqual(0.3 * tris(g0));
          for (const x of [g0, g1]) {
            expect(x.boundingBox?.min.y ?? 0).toBeGreaterThanOrEqual(-0.05);
            expect(x.boundingBox?.min.y ?? 0).toBeLessThanOrEqual(0.05);
            expect(x.getAttribute('uv')).toBeUndefined();
            expect(x.index).toBeNull();
            expect(arr(x, 'position').every(Number.isFinite)).toBe(true);
          }
          const h = g.heights?.[v] ?? g.height;
          const s0 = size(g0);
          expect(s0.y).toBeGreaterThan(h * 0.8);
          expect(s0.y).toBeLessThan(h * 1.25);
          expect(Math.max(s0.x, s0.z) / 2).toBeLessThanOrEqual(geo.footprint * 1.8);
        });
      }
    }
    it(`${geo.id} is deterministic and seed-sensitive`, () => {
      const a = arr(buildProp(geo.id, 3, 0, 0), 'position');
      expect(arr(buildProp(geo.id, 3, 0, 0), 'position')).toEqual(a);
      expect(arr(buildProp(geo.id, 4, 0, 0), 'position')).not.toEqual(a);
    });
  }

  it('drop tower: 10 u, crate anchors on the axis inside the lattice, ✓ lamp glows', () => {
    const T = QA_PROVING.tower;
    const full = buildProp('dropTower', 1001, 0, 0);
    expect(size(full).y).toBeGreaterThan(10);
    expect(size(full).y).toBeLessThan(11);
    const hooks = full.userData.hooks as {
      crate: { top: number[]; rest: number[]; size: number };
      lamp: { center: number[] };
    };
    expect(hooks.crate.top).toEqual([0, T.crate.top, 0]);
    expect(hooks.crate.rest).toEqual([0, T.crate.rest, 0]);
    expect(hooks.crate.size).toBe(T.crate.size);
    // rest sits on the landing pad, the top hangs under the head: a ≥ 6 u drop
    expect(hooks.crate.top[1] - hooks.crate.rest[1]).toBeGreaterThan(6);
    expect(hooks.crate.top[1] + T.crate.size / 2).toBeLessThan(T.plinth + T.h + 0.2);
    expect(arr(full, 'emissive').some((x) => x === 1)).toBe(true);
    expect(hooks.lamp.center[1]).toBeGreaterThan(0.5);
  });

  it('drop tower v1 is the empty cradle: v0 minus the crate, same envelope', () => {
    const v0 = buildProp('dropTower', 1001, 0, 0);
    const v1 = buildProp('dropTower', 1001, 1, 0);
    expect(tris(v0)).toBeGreaterThan(tris(v1));
    expect(size(v1).y).toBeCloseTo(size(v0).y, 1);
    expect(v1.userData.hooks.crate.top).toEqual(v0.userData.hooks.crate.top);
    // the loose crate mesh for the mover: centred on its origin, one cube + yoke + cable
    const c = buildDropCrate();
    const sz = size(c);
    expect(c.boundingBox?.min.y).toBeLessThan(-QA_PROVING.tower.crate.size / 2 + 0.01);
    expect(sz.x).toBeGreaterThan(QA_PROVING.tower.crate.size);
    expect(tris(c)).toBeLessThan(200);
  });

  it('test fan: blades are aSpin parts about one z-axis hub, the streamers sway, the rest is rigid', () => {
    const g = buildProp('testFan', 1001, 0, 0);
    const hub = g.userData.hub as number[];
    expect(hub[1]).toBeCloseTo(QA_PROVING.fan.hubY, 5);
    expect(g.userData.spinAxis).toEqual([0, 0, 1]);
    const spin = g.getAttribute('aSpin');
    const wind = arr(g, 'wind');
    const n = g.getAttribute('position').count;
    let spun = 0;
    let swaying = 0;
    for (let i = 0; i < n; i++) {
      // tag 1.25 = the fan (TASK-501: the siren test adds turns, shader uFanSpin)
      if (spin.getW(i) === FAN_SPIN_TAG) {
        spun++;
        expect(spin.getY(i)).toBeCloseTo(hub[1], 4);
        expect(wind[i]).toBe(0);
      } else if (wind[i] > 0) swaying++;
    }
    // five blades + the nose cone turn: a minority of the triangles, a real one
    expect(spun).toBeGreaterThan(0.04 * n);
    expect(spun).toBeLessThan(0.3 * n);
    expect(swaying).toBeGreaterThan(0);
    // the blade disc is 4 u across, inside the cage
    expect(QA_PROVING.fan.bladeR * 2).toBe(4);
    expect(QA_PROVING.fan.cageR).toBeGreaterThan(QA_PROVING.fan.bladeR);
    const far = buildProp('testFan', 1001, 0, 1);
    expect(far.getAttribute('aSpin')).toBeDefined();
  });

  it('obstacle: four distinct variants, each its own silhouette, all under 1.3 u tall', () => {
    const sig = new Set<string>();
    for (let v = 0; v < 4; v++) {
      const g = buildProp('obstacle', 7, v, 0);
      expect(size(g).y, `v${v}`).toBeLessThan(1.3);
      sig.add(
        [
          tris(g),
          ...size(g)
            .toArray()
            .map((x) => x.toFixed(1)),
        ].join(':'),
      );
    }
    expect(sig.size).toBe(4);
  });

  it('colours stay inside the toy-factory palette (white / mint / yellow + wood, rubber, red)', () => {
    const allowed = Object.values(PROVING_PAL).map((h) => new THREE.Color(h));
    const near = (a: THREE.Color, b: THREE.Color): number =>
      Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
    for (const id of ['dropTower', 'testFan', 'obstacle']) {
      const g = buildProp(id, 1001, 0, 0);
      const c = g.getAttribute('color');
      for (let i = 0; i < c.count; i += 7) {
        const col = new THREE.Color(c.getX(i), c.getY(i), c.getZ(i));
        // the per-face jitter shifts hue a few degrees and lightness a few percent
        expect(Math.min(...allowed.map((a) => near(col, a))), `${id} #${i}`).toBeLessThan(0.14);
      }
    }
  });
});
