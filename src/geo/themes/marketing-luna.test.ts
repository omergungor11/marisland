/** TASK-670 (M53, D-172): the sea-top fun park kit: contract, budgets, pivots, determinism, layout fit. */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { decodeSurface } from '../../content/materials.ts';
import { PROP_DEF_INDEX, PROP_DEFS } from '../../content/props.ts';
import { FLOATING_FIXTURES } from '../../content/settlements.ts';
import { LUNA_KIT, lunaLayout, type LunaRef } from '../../content/themes/marketing-luna.ts';
import { LUNA_LOOK, lunaCoasterPoints } from '../../content/themes/marketing-luna-look.ts';
import { isLargeStructure } from '../../render/props/batcher.ts';
import { createCoasterSpline } from '../../world/coaster-spline.ts';
import { buildProp, PROP_GEO } from '../registry.ts';

const tris = (g: THREE.BufferGeometry): number => g.getAttribute('position').count / 3;
const box = (g: THREE.BufferGeometry): THREE.Box3 => {
  g.computeBoundingBox();
  return g.boundingBox as THREE.Box3;
};

/** [key, ref, LOD0 cap, LOD1 cap]. Large pieces (drawn from T0) keep LOD1 <= 25 %; tier-2 detail <= 60 %. */
const PIECES: ReadonlyArray<readonly [string, LunaRef, number, number]> = [
  ...LUNA_KIT.deck.map((r, i) => [`deck${i}`, r, 4000, 800] as const),
  ['swing', LUNA_KIT.ride.swing.base, 600, 150],
  ['drop', LUNA_KIT.ride.drop.base, 700, 150],
  ['carousel', LUNA_KIT.ride.carousel.base, 800, 200],
  ...LUNA_KIT.coaster.map((r, i) => [`coaster${i}`, r, 4500, 1100] as const),
  ['gate', LUNA_KIT.gate, 1600, 400],
  ['booth', LUNA_KIT.booth, 400, 200],
  ['cart0', LUNA_KIT.cart[0], 650, 300],
  ['cart1', LUNA_KIT.cart[1], 700, 300],
  ['cart2', LUNA_KIT.cart[2], 600, 300],
  ['prize', LUNA_KIT.prize, 2000, 800],
  ['balloons', LUNA_KIT.balloons, 800, 300],
  ['bench', LUNA_KIT.bench, 150, 80],
  ['queueRail', LUNA_KIT.queueRail, 450, 200],
  ['bulbPost', LUNA_KIT.bulbPost, 350, 200],
];

/** The geo-only movers: [key, ref, LOD0 cap, LOD1 cap]. */
const MOVERS: ReadonlyArray<readonly [string, LunaRef, number, number]> = [
  ['swingTop', LUNA_KIT.ride.swing.top, 1000, 250],
  ['dropCar', LUNA_KIT.ride.drop.car, 450, 120],
  ['carouselTop', LUNA_KIT.ride.carousel.top, 1400, 350],
  ['trainHead', LUNA_KIT.train.head, 650, 160],
  ...LUNA_KIT.train.car.map((r, i) => [`trainCar${i}`, r, 350, 40] as const),
  ...LUNA_KIT.boat.map((r, i) => [`boat${i}`, r, 450, 120] as const),
];

const DEF_IDS = ['lunaCoaster', 'lunaDeck', 'lunaDecor', 'lunaGate', 'lunaRide', 'lunaStand'];

describe('TASK-670 fun park kit contract', () => {
  it('keeps the keys and array lengths the plan relies on', () => {
    expect(Object.keys(LUNA_KIT).sort()).toEqual(
      [
        'balloons',
        'bench',
        'boat',
        'booth',
        'bulbPost',
        'cart',
        'coaster',
        'coasterLengths',
        'deck',
        'deckY',
        'entry',
        'gate',
        'landing',
        'prize',
        'queueRail',
        'ride',
        'train',
      ].sort(),
    );
    expect(LUNA_KIT.deck).toHaveLength(3);
    expect(LUNA_KIT.coaster).toHaveLength(3);
    expect(LUNA_KIT.cart).toHaveLength(3);
    expect(LUNA_KIT.boat).toHaveLength(3);
    expect(Object.keys(LUNA_KIT.ride).sort()).toEqual(['carousel', 'drop', 'swing', 'wheel']);
  });

  it('every ref points at a registered def and a variant it has; movers are geo-only', () => {
    for (const [key, r] of PIECES) {
      const def = PROP_DEFS[PROP_DEF_INDEX[r.defId]];
      expect(def, key).toBeDefined();
      expect(r.variant, key).toBeLessThan(def.variants);
      expect(PROP_GEO[r.defId].variants, key).toBe(def.variants);
    }
    for (const [key, r] of MOVERS) {
      expect(PROP_GEO[r.defId], key).toBeDefined();
      expect(r.variant, key).toBeLessThan(PROP_GEO[r.defId].variants);
      expect(PROP_DEF_INDEX[r.defId], `${key} has no PropDef`).toBeUndefined();
    }
    // the wheel is the land fair's def, scaled
    expect(PROP_DEF_INDEX.ferrisWheel).toBeDefined();
  });

  it('six pinned defs (never rolled), the deck floats, nothing else does', () => {
    for (const id of DEF_IDS) expect(PROP_DEFS[PROP_DEF_INDEX[id]].rollVariants, id).toBe(1);
    expect(FLOATING_FIXTURES).toContain('lunaDeck');
    for (const id of DEF_IDS.filter((d) => d !== 'lunaDeck'))
      expect(FLOATING_FIXTURES, id).not.toContain(id);
    expect(LUNA_KIT.deckY).toBe(0.7);
  });

  it('measured sizes match the kit (3 %)', () => {
    for (const [key, r] of [...PIECES, ...MOVERS]) {
      const s = box(buildProp(r.defId, 7, r.variant, 0)).getSize(new THREE.Vector3());
      const b = box(buildProp(r.defId, 7, r.variant, 0));
      const got = [s.x, s.z, b.max.y - (MOVERS.some(([k]) => k === key) ? b.min.y : 0)];
      [r.w, r.d, r.h].forEach((want, k) =>
        expect(Math.abs(got[k] - want) / want, `${key} [${k}] ${got[k]} vs ${want}`).toBeLessThan(
          0.03,
        ),
      );
    }
  });

  it('tier rule: the platform, rides, coaster and gate are structures from T0; stands and decor stay tier-2 detail', () => {
    for (const [key, r] of PIECES) {
      const def = PROP_DEFS[PROP_DEF_INDEX[r.defId]];
      const s = box(buildProp(r.defId, 7, r.variant, 0)).getSize(new THREE.Vector3());
      const large = isLargeStructure(def, s);
      if (r.defId === 'lunaStand' || r.defId === 'lunaDecor')
        expect(large, `${key} must stay under 3 u`).toBe(false);
      else expect(large, key).toBe(true);
    }
  });
});

describe('TASK-670 fun park geometry', () => {
  it('triangle budgets hold at both LODs', () => {
    for (const [key, r, b0, b1] of [...PIECES, ...MOVERS]) {
      const g0 = buildProp(r.defId, 7, r.variant, 0);
      const g1 = buildProp(r.defId, 7, r.variant, 1);
      expect(tris(g0), `${key} LOD0`).toBeLessThanOrEqual(b0);
      expect(tris(g1), `${key} LOD1`).toBeLessThanOrEqual(b1);
      expect(tris(g1), `${key} LOD1 < LOD0`).toBeLessThan(tris(g0));
    }
  });

  it('large pieces: LOD1 is at most 25 % of LOD0 (the far proxy), movers 30 %', () => {
    for (const [key, r] of [...PIECES, ...MOVERS].filter(
      ([, r]) => !['lunaStand', 'lunaDecor'].includes(r.defId),
    )) {
      const t0 = tris(buildProp(r.defId, 7, r.variant, 0));
      const t1 = tris(buildProp(r.defId, 7, r.variant, 1));
      expect(t1 / t0, `${key}`).toBeLessThanOrEqual(MOVERS.some(([k]) => k === key) ? 0.3 : 0.25);
    }
  });

  it('pivots: deck and boats on the water, the rest on the plank top, movers on their axis; no NaN, colours in range', () => {
    for (const [key, r] of [...PIECES, ...MOVERS]) {
      for (const lod of [0, 1] as const) {
        const g = buildProp(r.defId, 7, r.variant, lod);
        const b = box(g);
        expect(Number.isFinite(b.min.x + b.max.y + b.min.z), key).toBe(true);
        if (r.defId === 'lunaDeck') expect(b.min.y, key).toBeGreaterThan(-0.5);
        else if (r.defId === 'lunaCoaster')
          expect(b.min.y, `${key} columns under the water`).toBeLessThan(-1);
        else if (r.defId === 'lunaBoat') {
          expect(b.min.y, key).toBeGreaterThan(-0.3);
          expect(b.min.y, key).toBeLessThan(0);
        } else if (r.defId === 'lunaTrain') {
          // the rail top: the far proxy rides 0.12 above it (no wheels)
          expect(b.min.y, key).toBeGreaterThan(-0.05);
          expect(b.min.y, key).toBeLessThan(0.15);
        } else if (MOVERS.some(([k]) => k === key))
          expect(b.min.y, `${key} hangs / rises about its axis`).toBeLessThan(0.2);
        else expect(Math.abs(b.min.y), `${key} on the ground`).toBeLessThan(0.05);
        const c = g.getAttribute('color');
        for (let i = 0; i < c.count * 3; i++)
          expect(c.array[i] >= 0 && c.array[i] <= 1, key).toBe(true);
      }
    }
  });

  it('round things are centred on their axis; the deck and the boats on their box', () => {
    const round: ReadonlyArray<readonly [string, LunaRef]> = [
      ['swing', LUNA_KIT.ride.swing.base],
      ['swingTop', LUNA_KIT.ride.swing.top],
      ['carouselTop', LUNA_KIT.ride.carousel.top],
      ['dropCar', LUNA_KIT.ride.drop.car],
      ['gate', LUNA_KIT.gate],
      ...LUNA_KIT.deck.map((r, i) => [`deck${i}`, r] as const),
      ...LUNA_KIT.coaster.map((r, i) => [`coaster${i}`, r] as const),
      ...LUNA_KIT.boat.map((r, i) => [`boat${i}`, r] as const),
    ];
    for (const [key, r] of round) {
      const b = box(buildProp(r.defId, 7, r.variant, 0));
      expect(Math.abs((b.min.x + b.max.x) / 2), `${key} x`).toBeLessThan(0.1);
      expect(Math.abs((b.min.z + b.max.z) / 2), `${key} z`).toBeLessThan(0.1);
    }
  });

  it('is deterministic: the same seed gives the same bytes', () => {
    for (const [key, r] of [...PIECES, ...MOVERS]) {
      const a = buildProp(r.defId, 11, r.variant, 0).getAttribute('position').array;
      const b = buildProp(r.defId, 11, r.variant, 0).getAttribute('position').array;
      expect(Array.from(a), key).toEqual(Array.from(b));
    }
  });

  it('night: the platform rail, the rides, the gate and the stalls carry lit (lamp class) vertices', () => {
    const lit = (g: THREE.BufferGeometry): number => {
      const e = g.getAttribute('emissive');
      let n = 0;
      for (let i = 0; i < e.count; i++) if (decodeSurface(e.getX(i)).base === 1) n++;
      return n;
    };
    const need: ReadonlyArray<readonly [string, LunaRef, number]> = [
      ['deck', LUNA_KIT.deck[1], 200],
      ['swing', LUNA_KIT.ride.swing.base, 60],
      ['swingTop', LUNA_KIT.ride.swing.top, 60],
      ['drop', LUNA_KIT.ride.drop.base, 100],
      ['carousel', LUNA_KIT.ride.carousel.base, 60],
      ['carouselTop', LUNA_KIT.ride.carousel.top, 30],
      ['coaster', LUNA_KIT.coaster[1], 30],
      ['gate', LUNA_KIT.gate, 300],
      ['booth', LUNA_KIT.booth, 20],
      ['prize', LUNA_KIT.prize, 40],
      ['boat', LUNA_KIT.boat[0], 8],
    ];
    for (const [key, r, min] of need)
      expect(
        lit(buildProp(r.defId, 7, r.variant, 0)),
        `${key} lit vertices`,
      ).toBeGreaterThanOrEqual(min);
    // far proxies keep the lamps too (the platform rail reads from the far tier)
    expect(lit(buildProp('lunaDeck', 7, 1, 1))).toBeGreaterThanOrEqual(30);
  });

  it('the gate carries the marquee chase at LOD0 only (a tagged LOD1 would keep its group out of the far merge)', () => {
    expect(buildProp('lunaGate', 7, 0, 0).getAttribute('aSpin')).toBeDefined();
    expect(buildProp('lunaGate', 7, 0, 1).getAttribute('aSpin')).toBeUndefined();
  });

  it('every gallery assembly builds', () => {
    for (let v = 0; v < 6; v++)
      for (const lod of [0, 1] as const) {
        const g = buildProp('lunaPose', 7, v, lod);
        expect(tris(g), `pose ${v}`).toBeGreaterThan(100);
        expect(Number.isFinite(box(g).max.y)).toBe(true);
      }
  });
});

describe('TASK-670 coaster path and layout', () => {
  it('the coaster loop is a closed spline of about its stadium length, hills above the valley', () => {
    for (const len of LUNA_KIT.coasterLengths) {
      const pts = lunaCoasterPoints(len);
      const sp = createCoasterSpline(pts, { closed: true });
      const R = LUNA_LOOK.coaster.R;
      const a = len / 2 - R;
      const expected = 4 * a + 2 * Math.PI * R;
      // the hills lengthen the lap a little over the flat stadium
      expect(sp.length).toBeGreaterThan(expected * 0.98);
      expect(sp.length).toBeLessThan(expected * 1.15);
      const ys = pts.map((p) => p[1]);
      expect(Math.min(...ys)).toBeGreaterThanOrEqual(LUNA_LOOK.coaster.base - 0.01);
      expect(Math.max(...ys)).toBeGreaterThan(LUNA_LOOK.coaster.base + 2);
      // the track top never dips under the deck rail / head clearance at the deck straight
      for (const p of pts) if (p[2] > 0.4) expect(p[1]).toBeGreaterThanOrEqual(1.8);
    }
  });

  it('the train fits the loop (cars + gaps shorter than half a lap)', () => {
    const T = LUNA_LOOK.train;
    const len = T.head.len + (T.cars - 1) * T.car.len + (T.cars - 1) * T.gap;
    for (const l of LUNA_KIT.coasterLengths) {
      const sp = createCoasterSpline(lunaCoasterPoints(l), { closed: true });
      expect(len).toBeLessThan(sp.length / 2);
    }
  });

  for (const size of [0, 1, 2] as const) {
    it(`layout ${size}: every piece stands on the ring, the rides do not touch, boats float in the pool`, () => {
      const D = LUNA_KIT.deck[size];
      const hx = D.w / 2;
      const hz = D.d / 2;
      const rw = D.ring;
      const lay = lunaLayout(size);
      const rides = lay.filter((p) => ['swing', 'drop', 'carousel', 'wheel'].includes(p.key));
      expect(rides).toHaveLength(4);
      for (const p of lay) {
        if (p.on === 'water') {
          // boats: inside the pool with a boat's radius to spare
          expect(Math.abs(p.x), p.key).toBeLessThan(D.pool.w / 2 - 1.1);
          expect(Math.abs(p.z), p.key).toBeLessThan(D.pool.d / 2 - 1.1);
          continue;
        }
        if (p.key === 'coaster') continue;
        // on the ring: inside the outer edge, outside the pool (a gap's centre may be on the pool edge)
        expect(Math.abs(p.x), `${p.key} x`).toBeLessThanOrEqual(hx);
        expect(Math.abs(p.z), `${p.key} z`).toBeLessThanOrEqual(hz);
        const inPool = Math.abs(p.x) < hx - rw && Math.abs(p.z) < hz - rw;
        expect(inPool, `${p.key} not in the pool`).toBe(false);
      }
      // rides: the round bases clear each other and stay on their corner pads
      const radius = (k: string): number =>
        k === 'swing' ? 3.15 : k === 'carousel' ? 3.45 : k === 'drop' ? 2 : 3.3;
      for (const a of rides) {
        expect(Math.abs(a.x) + radius(a.key), `${a.key} outer`).toBeLessThanOrEqual(hx + 0.01);
        for (const b of rides)
          if (a.key < b.key)
            expect(Math.hypot(a.x - b.x, a.z - b.z), `${a.key}-${b.key}`).toBeGreaterThan(
              radius(a.key) + radius(b.key),
            );
      }
      // the coaster loop fits between the two shore pads
      const c = LUNA_KIT.coaster[size];
      expect(c.w / 2).toBeLessThanOrEqual((D.w - 2 * rw) / 2);
    });
  }

  it('budget: the whole park on the M deck stays inside the task allowance (25 draw groups, 120k tris)', () => {
    const lay = lunaLayout(1);
    let t = 0;
    const groups = new Set<string>();
    for (const p of lay) {
      if (p.ref.defId === 'ferrisWheel') continue; // the existing wheel (replaces the 0.6 one), not new cost
      t += tris(buildProp(p.ref.defId, 7, p.ref.variant, 0));
      groups.add(`${p.ref.defId}:${p.ref.variant}`);
    }
    for (const [, r] of MOVERS.filter(
      ([k]) => !k.startsWith('trainCar') && !k.startsWith('boat'),
    )) {
      t += tris(buildProp(r.defId, 7, r.variant, 0));
      groups.add(`${r.defId}:${r.variant}`);
    }
    // the train: head + 3 cars of ONE colour; the three bumper boat colours
    t += 3 * tris(buildProp('lunaTrain', 7, 1, 0));
    groups.add('lunaTrain:1');
    expect(t).toBeLessThan(120_000);
    // statics + movers as separate groups (the small ones near-merge into about two on a real island)
    expect(groups.size).toBeLessThanOrEqual(25);
  });
});
