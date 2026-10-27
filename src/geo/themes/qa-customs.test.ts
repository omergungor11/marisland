/** TASK-506: QA Customs Port kit (scanner arch, customs yard, quarantine pontoon, cargo ship): budgets, pivots, hooks, tags. */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { cultureCapOverride } from '../../content/budgets.ts';
import { MOTION_TAG, SURFACE } from '../../content/activity.ts';
import { QA_CULTURE } from '../../content/cultures/qa.ts';
import { PROP_DEFS, PROP_DEF_INDEX } from '../../content/props.ts';
import { QA_CUSTOMS_PROP_DEFS } from '../../content/props-themes/qa-customs.ts';
import { QA_PROVING_PROP_DEFS } from '../../content/props-themes/qa-proving.ts';
import { FLOATING_FIXTURES } from '../../content/settlements.ts';
import {
  CUSTOMS_PAL,
  CUSTOMS_VARIANT as CV,
  QA_CUSTOMS as K,
} from '../../content/themes/qa-customs.ts';
import { PropFlag } from '../../world/prop-store.ts';
import { isLargeStructure } from '../../render/props/batcher.ts';
import { PROP_GEO, buildProp } from '../registry.ts';
import {
  buildQaCargoShip,
  buildQaContainer,
  buildQuayCable,
  buildQuaySpreader,
  buildQuayTrolley,
} from './qa-customs.ts';

const tris = (g: THREE.BufferGeometry): number => g.getAttribute('position').count / 3;
const size = (g: THREE.BufferGeometry): THREE.Vector3 =>
  (g.boundingBox as THREE.Box3).getSize(new THREE.Vector3());
const arr = (g: THREE.BufferGeometry, name: string): number[] =>
  Array.from(g.getAttribute(name).array);
type Hooks = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const hooks = (g: THREE.BufferGeometry): Hooks => g.userData.hooks as Hooks;

/** LOD0 triangle budgets per def (every variant), the far proxy stays under 30 % of its LOD0. */
const BUDGET: Record<string, number> = {
  scannerArch: 1700,
  customsYard: 1300,
  quarantinePontoon: 900,
};
const IDS = QA_CUSTOMS_PROP_DEFS.map((d) => d.id);

describe('TASK-506 defs', () => {
  it('three tier-2 defs, planner-pinned, geo variants match', () => {
    expect(IDS).toEqual(['scannerArch', 'customsYard', 'quarantinePontoon']);
    for (const d of QA_CUSTOMS_PROP_DEFS) {
      expect(d.tier, d.id).toBe(2);
      expect(PROP_GEO[d.id].variants, d.id).toBe(d.variants);
      expect(PROP_DEFS[PROP_DEF_INDEX[d.id]].id).toBe(d.id);
      expect(d.rollVariants ?? d.variants, d.id).toBeLessThanOrEqual(d.variants);
    }
    expect(QA_CUSTOMS_PROP_DEFS[1].variants).toBe(5);
    expect(QA_CUSTOMS_PROP_DEFS[2].variants).toBe(3);
  });

  it('appended at the tail, after the Proving Grounds kit', () => {
    const last = PROP_DEF_INDEX[QA_PROVING_PROP_DEFS[2].id];
    IDS.forEach((id, i) => expect(PROP_DEF_INDEX[id]).toBe(last + 1 + i));
    expect(PROP_DEFS.length).toBeGreaterThanOrEqual(last + 4);
  });

  it('QA ledger: cap override covers the kit, tier-1 still the drop tower only', () => {
    expect(cultureCapOverride.qa).toEqual({ defs: 15, tier1: 1 });
    expect(QA_CULTURE.kit.length).toBeLessThanOrEqual(cultureCapOverride.qa.defs);
    for (const id of IDS) expect(QA_CULTURE.kit.map((k) => k.id)).toContain(id);
    expect(QA_CULTURE.kit.filter((k) => k.tier === 1)).toHaveLength(1);
  });

  it('the pontoon is a floating fixture without a contact blob; the rest is grounded', () => {
    expect(FLOATING_FIXTURES).toContain('quarantinePontoon');
    const byId = Object.fromEntries(QA_CUSTOMS_PROP_DEFS.map((d) => [d.id, d]));
    expect(byId.quarantinePontoon.flags & PropFlag.grounded).toBe(0);
    expect(byId.scannerArch.flags & PropFlag.grounded).not.toBe(0);
    expect(byId.customsYard.flags & PropFlag.grounded).not.toBe(0);
  });

  it('the arch, the crane and the line are structures drawn from T0 by size (> 3 u)', () => {
    const def = (id: string): (typeof PROP_DEFS)[number] => PROP_DEFS[PROP_DEF_INDEX[id]];
    expect(isLargeStructure(def('scannerArch'), size(buildProp('scannerArch', 5, 0, 0)))).toBe(
      true,
    );
    expect(isLargeStructure(def('customsYard'), size(buildProp('customsYard', 5, 0, 0)))).toBe(
      true,
    );
  });
});

describe('TASK-506 geometry', () => {
  for (const id of IDS) {
    const g = PROP_GEO[id];
    for (let v = 0; v < g.variants; v++) {
      for (const seed of [3, 1001]) {
        it(`${id} v${v} seed ${seed}: budget, ground pivot, LOD1 <= 30 %, vertex colours, finite`, () => {
          const g0 = buildProp(id, seed, v, 0);
          const g1 = buildProp(id, seed, v, 1);
          expect(tris(g0)).toBeLessThanOrEqual(BUDGET[id]);
          expect(tris(g1)).toBeLessThanOrEqual(0.3 * tris(g0));
          for (const x of [g0, g1]) {
            expect(x.boundingBox?.min.y ?? 0).toBeGreaterThanOrEqual(-0.05);
            expect(x.boundingBox?.min.y ?? 0).toBeLessThanOrEqual(0.05);
            expect(x.getAttribute('uv')).toBeUndefined();
            expect(x.index).toBeNull();
            expect(arr(x, 'position').every(Number.isFinite)).toBe(true);
            expect(arr(x, 'color').every(Number.isFinite)).toBe(true);
          }
          const h = g.heights?.[v] ?? g.height;
          const s0 = size(g0);
          expect(s0.y).toBeGreaterThan(h * 0.8);
          expect(s0.y).toBeLessThan(h * 1.25);
          // LOD1 keeps the silhouette height
          expect(Math.abs(size(g1).y - s0.y)).toBeLessThan(1.2);
        });
      }
      it(`${id} v${v} is deterministic and seed-sensitive`, () => {
        const a = arr(buildProp(id, 3, v, 0), 'position');
        expect(arr(buildProp(id, 3, v, 0), 'position')).toEqual(a);
        expect(arr(buildProp(id, 4, v, 0), 'position')).not.toEqual(a);
      });
    }
  }

  it('colours stay inside the customs palette (and its 20 % lightened ribs): white / mint / yellow, hazard rubber, lamp lenses', () => {
    const allowed = Object.values(CUSTOMS_PAL).flatMap((h) => [
      new THREE.Color(h),
      new THREE.Color(h).lerp(new THREE.Color('#FFFFFF'), 0.2),
    ]);
    const near = (a: THREE.Color, b: THREE.Color): number =>
      Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
    const gs: THREE.BufferGeometry[] = [
      buildProp('scannerArch', 1001, 0, 0),
      buildProp('customsYard', 1001, 0, 0),
      buildProp('customsYard', 1001, 2, 0),
      buildProp('customsYard', 1001, 4, 0),
      buildProp('quarantinePontoon', 1001, 0, 0),
      buildQaCargoShip(),
    ];
    for (const [gi, g] of gs.entries()) {
      const c = g.getAttribute('color');
      for (let i = 0; i < c.count; i += 5) {
        const col = new THREE.Color(c.getX(i), c.getY(i), c.getZ(i));
        expect(Math.min(...allowed.map((a) => near(col, a))), `g${gi} #${i}`).toBeLessThan(0.14);
      }
    }
  });
});

describe('TASK-506 scanner arch', () => {
  const g = buildProp('scannerArch', 1001, 0, 0);
  const A = K.arch;

  it('lets the cargo ship pass: clear width and height exceed the ship', () => {
    const h = hooks(g).pass;
    expect(h.height).toBe(A.clear);
    expect(h.halfWidth).toBe(A.halfClear);
    const ship = size(buildQaCargoShip());
    expect(h.halfWidth * 2).toBeGreaterThan(ship.x + 2);
    expect(h.height).toBeGreaterThan(ship.y + 1.5);
    // the real girder underside and the scan head leave that clearance
    expect(A.girderY - 0.4).toBeGreaterThanOrEqual(A.clear);
    expect(A.postX - A.chordBase - 0.2).toBeGreaterThanOrEqual(A.halfClear);
  });

  it('the marquee bulbs carry one chase tag each, front L to R then back R to L', () => {
    const spin = g.getAttribute('aSpin');
    const pos = g.getAttribute('position');
    const ks = new Map<number, number[]>();
    for (let i = 0; i < spin.count; i++)
      if (spin.getW(i) === -SURFACE.marquee) {
        expect(spin.getY(i)).toBe(hooks(g).marquee.count);
        ks.set(spin.getX(i), [...(ks.get(spin.getX(i)) ?? []), i]);
      }
    expect(hooks(g).marquee.count).toBe(A.bulbs * 2);
    expect(ks.size).toBe(A.bulbs * 2);
    const mean = (k: number): THREE.Vector3 => {
      const v = new THREE.Vector3();
      for (const i of ks.get(k) ?? []) v.add(new THREE.Vector3().fromBufferAttribute(pos, i));
      return v.divideScalar((ks.get(k) ?? []).length);
    };
    expect(mean(0).z).toBeGreaterThan(0);
    expect(mean(A.bulbs - 1).x).toBeGreaterThan(mean(0).x);
    expect(mean(A.bulbs).z).toBeLessThan(0);
    expect(mean(A.bulbs).x).toBeGreaterThan(mean(2 * A.bulbs - 1).x);
    // the chase is LOD0 only: a tagged LOD1 would split the far merge
    expect(buildProp('scannerArch', 1001, 0, 1).getAttribute('aSpin')).toBeUndefined();
  });

  it('glows: scan strips, prism and lamp are emissive; the lamp hook sits on the crown', () => {
    expect(arr(g, 'emissive').filter((x) => x === 1).length).toBeGreaterThan(100);
    expect(hooks(g).lamp.center[1]).toBeGreaterThan(A.girderY + A.girderH);
    expect(hooks(g).scan.width).toBe(2 * A.halfClear);
  });
});

describe('TASK-506 customs yard', () => {
  const C = K.crane;

  it('crane v0 carries a container on the spreader; v1 is the empty rig for the mover', () => {
    const v0 = buildProp('customsYard', 1001, CV.craneLoaded, 0);
    const v1 = buildProp('customsYard', 1001, CV.craneEmpty, 0);
    expect(tris(v0)).toBeGreaterThan(tris(v1) + 100);
    expect(size(v1).y).toBeGreaterThan(9);
    const h = hooks(v0);
    for (const k of ['spreader', 'trolley', 'cable', 'container']) expect(h[k], k).toBeDefined();
    expect(hooks(v1).spreader).toEqual(h.spreader);
    // lowest spreader pose: the carried container touches the ground; highest: below the girders
    expect(h.spreader.down[1] - 0.24 - K.container.h).toBeGreaterThanOrEqual(0);
    expect(h.spreader.up[1]).toBeLessThan(C.top);
    expect(h.spreader.home[1]).toBeGreaterThan(h.spreader.down[1]);
    expect(h.spreader.home[1]).toBeLessThan(h.spreader.up[1]);
    expect(h.trolley.z[0]).toBeLessThan(h.trolley.z[1]);
    expect(h.trolley.z[1]).toBeLessThanOrEqual(C.boomZ);
    // the boom reaches over the water (+z), the machine house sits behind
    expect(size(v0).z).toBeGreaterThan(12);
    expect(v0.boundingBox!.max.z).toBeGreaterThan(C.boomZ - 0.1);
  });

  it('crane: hazard stripes alternate yellow and rubber on the legs', () => {
    const g = buildProp('customsYard', 1001, CV.craneEmpty, 0);
    const pos = g.getAttribute('position');
    const colA = g.getAttribute('color');
    const seen = new Set<string>();
    for (let i = 0; i < pos.count; i++)
      if (pos.getY(i) > 0.5 && pos.getY(i) < 1.7 && Math.abs(Math.abs(pos.getX(i)) - C.legX) < 0.3)
        seen.add(
          new THREE.Color(colA.getX(i), colA.getY(i), colA.getZ(i)).getHexString().slice(0, 1),
        );
    expect(seen.size).toBeGreaterThan(1);
  });

  it('inspection line v2 / v3: only the lamp of the verdict glows', () => {
    const ok = buildProp('customsYard', 1001, CV.lineOk, 0);
    const bad = buildProp('customsYard', 1001, CV.lineReject, 0);
    expect(tris(ok)).toBe(tris(bad));
    const lampsOf = (g: THREE.BufferGeometry, at: number[]): { n: number; red: boolean } => {
      const pos = g.getAttribute('position');
      const emi = g.getAttribute('emissive');
      const c = g.getAttribute('color');
      let n = 0;
      let r = 0;
      let gr = 0;
      for (let i = 0; i < pos.count; i++) {
        if (emi.getX(i) < 0.5) continue;
        if (Math.hypot(pos.getX(i) - at[0], pos.getY(i) - at[1], pos.getZ(i) - at[2]) > 0.3)
          continue;
        n++;
        r += c.getX(i);
        gr += c.getY(i);
      }
      return { n, red: n > 0 && r > gr };
    };
    for (const [g, lit, dark] of [
      [ok, 'ok', 'bad'],
      [bad, 'bad', 'ok'],
    ] as const) {
      const h = hooks(g).lamps;
      expect(h.lit).toBe(lit);
      expect(lampsOf(g, h[lit]).n, `${lit} lit`).toBeGreaterThan(0);
      expect(lampsOf(g, h[lit]).red).toBe(lit === 'bad');
      expect(lampsOf(g, h[dark]).n, `${dark} dark`).toBe(0);
    }
    expect(hooks(ok).belt.width).toBe(K.line.width);
    // a QA container fits on the belt
    expect(K.container.w).toBeLessThan(K.line.width);
    expect(K.container.l).toBeLessThan(K.line.len / 2);
  });

  it('stack v4: QA tones in three columns, 2 + 2 + 1 containers high', () => {
    const g = buildProp('customsYard', 1001, CV.stack, 0);
    const s = size(g);
    expect(s.y).toBeGreaterThan(2 * K.container.h);
    expect(s.y).toBeLessThan(2 * K.container.h + 0.4);
    expect(s.z).toBeGreaterThan(3 * K.container.w);
  });
});

describe('TASK-506 quarantine pontoon', () => {
  it('three distinct layouts; crates, lamp and deck hooks sit on the raft', () => {
    const sig = new Set<string>();
    for (let v = 0; v < 3; v++) {
      const g = buildProp('quarantinePontoon', 7, v, 0);
      const h = hooks(g);
      sig.add(
        [
          tris(g),
          ...size(g)
            .toArray()
            .map((x) => x.toFixed(1)),
        ].join(':'),
      );
      expect(h.deck.y).toBe(K.pontoon.deck);
      expect(Math.abs(h.lamp.center[0])).toBeLessThan(h.deck.size[0] / 2);
      expect(Math.abs(h.lamp.center[2])).toBeLessThan(h.deck.size[1] / 2);
      expect(h.crates.stacks.length).toBeGreaterThan(0);
      expect(h.lamp.center[1]).toBeGreaterThan(K.pontoon.lampH);
    }
    expect(sig.size).toBe(3);
  });

  it('bobs and blinks at LOD0 only (tags), glows red at the lamp', () => {
    const g = buildProp('quarantinePontoon', 7, 0, 0);
    const spin = g.getAttribute('aSpin');
    let bob = 0;
    let beacon = 0;
    for (let i = 0; i < spin.count; i++) {
      if (spin.getW(i) === MOTION_TAG.bob) bob++;
      if (spin.getW(i) === -SURFACE.beacon) beacon++;
    }
    expect(bob).toBeGreaterThan(0.8 * spin.count);
    expect(beacon).toBeGreaterThan(0);
    expect(arr(g, 'emissive').some((x) => x === 1)).toBe(true);
    expect(buildProp('quarantinePontoon', 7, 0, 1).getAttribute('aSpin')).toBeUndefined();
  });
});

describe('TASK-506 cargo ship and loose builders', () => {
  const S = K.ship;
  const ship = buildQaCargoShip(true);
  const bare = buildQaCargoShip(false);

  it('bow +z, waterline at 0, deterministic, vertex colours', () => {
    expect(ship.boundingBox!.max.z).toBeCloseTo(S.l / 2, 1);
    expect(ship.boundingBox!.min.z).toBeCloseTo(-S.l / 2, 1);
    expect(ship.boundingBox!.min.y).toBeLessThan(0);
    expect(ship.boundingBox!.max.y).toBeGreaterThan(S.deck);
    expect(hooks(ship).bow.at).toEqual([0, S.deck, S.l / 2]);
    expect(arr(buildQaCargoShip(), 'position')).toEqual(arr(ship, 'position'));
    expect(ship.getAttribute('uv')).toBeUndefined();
    expect(tris(ship)).toBeLessThan(1800);
    expect(arr(ship, 'position').every(Number.isFinite)).toBe(true);
  });

  it('slots: 8 container positions on the deck, the bare ship drops only the containers', () => {
    const list = hooks(ship).slots.list as { base: number[]; tier: number; yaw: number }[];
    expect(list).toHaveLength(8);
    expect(hooks(bare).slots.list).toEqual(list);
    expect(tris(bare)).toBeLessThan(0.25 * tris(ship));
    for (const s of list) {
      expect(s.base[1]).toBeGreaterThanOrEqual(S.deck);
      expect(Math.abs(s.base[0]) + K.container.w / 2).toBeLessThan(S.beam / 2 - 0.2);
      expect(Math.abs(s.base[2])).toBeLessThan(S.l / 2 - S.taper);
      expect(s.yaw).toBeCloseTo(Math.PI / 2, 5);
    }
    expect(list.filter((s) => s.tier === 1)).toHaveLength(2 * S.upperBays.length);
    // ship + stacked containers stay under the arch
    expect(size(ship).y + S.deck).toBeLessThan(K.arch.clear);
  });

  it('loose container, trolley, spreader and cable builders match the sizes the hooks quote', () => {
    const c = buildQaContainer(2);
    expect(size(c).x).toBeGreaterThan(K.container.l);
    expect(c.boundingBox!.min.y).toBeCloseTo(0, 1);
    expect(size(c).y).toBeCloseTo(K.container.h, 1);
    expect(hooks(c).container.size).toEqual([K.container.l, K.container.h, K.container.w]);
    const s = buildQuaySpreader();
    expect(s.boundingBox!.max.y).toBeCloseTo(0, 5);
    expect(size(s).x).toBeCloseTo(K.crane.spreaderLen, 1);
    expect(size(s).x).toBeGreaterThan(K.container.l);
    expect(size(buildQuayCable()).y).toBeCloseTo(1, 5);
    expect(buildQuayTrolley().boundingBox!.min.y).toBeCloseTo(0, 5);
    expect(arr(buildQaContainer(1), 'color')).not.toEqual(arr(buildQaContainer(0), 'color'));
  });
});
