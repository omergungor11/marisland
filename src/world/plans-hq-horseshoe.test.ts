import { describe, expect, it } from 'vitest';
import { HARBOURS } from '../content/harbours.ts';
import { MARINA_KIT } from '../content/themes/hq-horseshoe.ts';
import { MARINA_SITE as M } from '../content/themes/hq-horseshoe-site.ts';
import { HQ_MARINA, STAR_FORT } from '../content/themes/hq-marina.ts';
import { landSamples, voyageRoute } from '../life/courier-route.ts';
import { inMarina, marinaKeepOut, stubsOf } from './gen/plans/hq-horseshoe.ts';
import { rectShape, segDist, shapeCorners, shapesOverlap, type Shape } from './gen/sites.ts';
import {
  generateWorld,
  heightAt,
  THEME_IDS,
  type IslandData,
  type WorldData,
  type XZ,
} from './index.ts';

/**
 * TASK-661 (D-170) → TASK-666 (D-171) → TASK-674 (D-173): the HQ harbour town, an open crescent
 * quay along Hearthholm's own bay round the ferry pier. 30 seeds + the shot seeds.
 */
const SEEDS = [1001, 2024, ...Array.from({ length: 30 }, (_, k) => 1000 + k * 263)];
const P = HARBOURS.hq as NonNullable<typeof HARBOURS.hq>;
const cache = new Map<number, WorldData>();
const world = (seed: number): WorldData => {
  let w = cache.get(seed);
  if (!w) cache.set(seed, (w = generateWorld(seed)));
  return w;
};
const list = (isl: IslandData, key: string) => {
  const out: { x: number; z: number; rotY: number; y?: number }[] = [];
  for (let k = 0; isl.anchors[`${key}${k}`]; k++) out.push(isl.anchors[`${key}${k}`]);
  return out;
};
const site = (seed: number) => {
  const w = world(seed);
  const isl = w.islands.find((i) => i.theme === 'hq');
  if (!isl) throw new Error('no HQ island');
  const A = isl.anchors;
  const quay = list(isl, 'marinaQuay');
  const houses = list(isl, 'marinaHouse');
  const kinds = list(isl, 'marinaHouseKind');
  return { w, isl, A, quay, houses, kinds, terraces: list(isl, 'marinaTerrace') };
};
const near = (a: XZ, b: XZ): number => Math.hypot(a.x - b.x, a.z - b.z);
const W = M.ring.width;
/** Unit normal to the water at a quay point (the contract: heading + 90°). */
const water = (q: { rotY: number }): XZ => ({ x: -Math.sin(q.rotY), z: Math.cos(q.rotY) });
/** The ferry pier as a segment, and the approach corridor test. */
const pierOf = (A: IslandData['anchors']) => {
  const b = A.ferryBerth;
  const u = { x: Math.cos(b.rotY), z: Math.sin(b.rotY) };
  const inApproach = (p: XZ, pad: number): boolean => {
    const s = (p.x - b.x) * u.x + (p.z - b.z) * u.z;
    const o = -(p.x - b.x) * u.z + (p.z - b.z) * u.x;
    return (
      s >= -P.berth.out && s <= P.berth.approach.len && Math.abs(o) <= P.berth.approach.half + pad
    );
  };
  return { a: A.harbourPier0, e: A.harbourPier1, inApproach };
};
/** True where the quay has its deck (not the pier root's gap): the centre line stands at deck height. */
const onDeck = (q: { y?: number }): boolean => Math.abs((q.y ?? 0) - M.ring.deckY) < 0.05;

/** Fit tier of a seed: the full row, a shortened one, or none (HQ's plain pier + the comb). */
function tier(seed: number): 'full' | 'short' | 'none' {
  const { A, houses } = site(seed);
  if (!A.marinaQuay0) return 'none';
  return houses.length >= M.fit.fullHouses ? 'full' : 'short';
}

describe('TASK-674 quay: seed fit', () => {
  it('fit table: seeds 1001 / 1 have the full row, 42 a shortened one, the sweep pinned', () => {
    const table = { full: 0, short: 0, none: 0 };
    for (const seed of SEEDS) table[tier(seed)]++;
    for (const seed of [1001, 1]) expect(tier(seed), `seed ${seed}`).toBe('full');
    // (42: the Compass Plaza and two gates' pads stand on its bay's shore)
    expect(tier(42)).toBe('short');
    // (pinned to today's sweep so a regression shows; none never happens on it, the fallback is
    // the next test's seed)
    expect(table).toEqual(FIT_TABLE);
  }, 300_000);

  it('fallback: a seed whose bay takes no quay keeps the plain pier, the comb and the fort', () => {
    const w = world(FALLBACK_SEED);
    const hq = w.islands.find((i) => i.theme === 'hq') as IslandData;
    expect(Object.keys(hq.anchors).filter((k) => k.startsWith('marina'))).toEqual([]);
    expect(hq.anchors.harbourPier1).toBeUndefined();
    expect(w.marina.filter((f) => f.defId === 'marinaPier').length).toBeGreaterThan(0);
    expect(w.marina.filter((f) => f.defId === 'starFort')).toHaveLength(1);
  }, 60_000);

  it('target picture: quay length, the town counts, the stubs, the fort site', () => {
    for (const seed of SEEDS) {
      const { A, isl, quay, houses, terraces, kinds } = site(seed);
      if (!A.marinaQuay0) continue;
      const m = `seed ${seed}`;
      let len = 0;
      for (let k = 1; k < quay.length; k++) len += near(quay[k - 1], quay[k]);
      expect(len, m).toBeGreaterThanOrEqual(M.bay.minArc * 0.5);
      expect(A.marinaQuaySize.x, m).toBe(W);
      // (the tier counts the row's slots; a slot whose ground a pad or a lane took stays empty)
      expect(houses.length, m).toBeGreaterThanOrEqual(M.fit.shortHouses / 2);
      expect(houses.length, m).toBeLessThanOrEqual(M.house.max);
      expect(kinds.length, m).toBe(houses.length);
      // a terrace before every restaurant / café / gelato house, nothing else has one
      const withT = kinds.filter((k) => k.z >= 0);
      expect(withT.length, m).toBe(terraces.length);
      for (const k of kinds) if (k.z >= 0) expect(M.house.restaurant[k.x], m).toBeDefined();
      expect(A.marinaTower, m).toBeDefined();
      expect(A.marinaMouth, m).toBeDefined();
      expect(A.marinaFort, m).toBeDefined();
      expect(A.marinaBasinSize.z, m).toBeGreaterThanOrEqual(A.marinaBasinSize.x);
      expect(stubsOf(isl), m).toHaveLength(2);
      expect(list(isl, 'marinaBerth').length, m).toBeGreaterThanOrEqual(8);
      expect(list(isl, 'marinaPontoon').length, m).toBeGreaterThanOrEqual(1);
    }
  }, 300_000);
});

describe('TASK-674 quay: ground', () => {
  it('the deck is one level along the bay, on this island, the water in front of it', () => {
    for (const seed of SEEDS) {
      const { w, isl, quay } = site(seed);
      if (quay.length === 0) continue;
      // (the pier root's gap and the ramps down to it: quay points off the deck and their reach)
      const off = quay.filter((q) => !onDeck(q));
      const ramp = M.ring.ramp + 2;
      let deck = 0;
      let samples = 0;
      let bad = 0;
      for (let k = 0; k < quay.length; k++) {
        const q = quay[k];
        if (k > 0) expect(near(quay[k - 1], q), `seed ${seed}`).toBeLessThan(M.quayStep * 1.3);
        if (!onDeck(q)) continue;
        deck++;
        if (off.some((o) => near(o, q) < ramp)) continue;
        const n = water(q);
        // the promenade: level from the water edge in (its middle everywhere, its edges nearly so:
        // the 2 u grid)
        for (const o of [
          W / 2 - 0.5,
          W / 2 - M.ring.promenade / 2,
          W / 2 - M.ring.promenade + 0.5,
        ]) {
          const x = q.x + n.x * o;
          const z = q.z + n.z * o;
          const dy = Math.abs(heightAt(w.height, x, z) - M.ring.deckY);
          samples++;
          if (dy > 0.3) bad++;
          if (o === W / 2 - M.ring.promenade / 2)
            expect(dy, `seed ${seed} q${k} promenade middle`).toBeLessThan(0.3);
          const i = Math.round((z + 384) / 2) * 385 + Math.round((x + 384) / 2);
          expect(w.islandMap[i], `seed ${seed}`).toBe(isl.id + 1);
        }
      }
      // (the outer sample, 0.5 u in from the water edge, may meet the face on the 2 u grid)
      expect(bad / samples, `seed ${seed} promenade off level`).toBeLessThan(0.1);
      // most of the centre line is deck (the pier root's own quay, `fit.rootGap`, and the ramps
      // down to it are the rest)
      expect(deck / quay.length, `seed ${seed} deck share`).toBeGreaterThan(0.4);
    }
  }, 300_000);

  it('boats float in the dredged berths; the mouth is water', () => {
    for (const seed of SEEDS) {
      const { w, A, isl } = site(seed);
      if (!A.marinaQuay0) continue;
      for (const b of [...list(isl, 'marinaBerth'), ...list(isl, 'marinaPontoon')]) {
        expect(b.y, `seed ${seed}`).toBe(0);
        expect(heightAt(w.height, b.x, b.z), `seed ${seed} boat`).toBeLessThan(-0.5);
        expect(inMarina(isl, b), `seed ${seed} boat on the quay's water`).toBe(true);
      }
      expect(
        heightAt(w.height, A.marinaMouth.x, A.marinaMouth.z),
        `seed ${seed} mouth`,
      ).toBeLessThan(0);
      expect(heightAt(w.height, A.marinaBasin.x, A.marinaBasin.z), `seed ${seed} bay`).toBeLessThan(
        0,
      );
    }
  }, 300_000);

  it('the ferry pier, its T-head and the approach stay clear of the town', () => {
    for (const seed of SEEDS) {
      const { w, A, isl, houses, terraces } = site(seed);
      if (!A.marinaQuay0) continue;
      // (the T-head pier: HQ's run-out, at least `minSegments`, ending at `harbourPier1`)
      const dock = w.docks.find((d) => d.islandId === isl.id);
      expect(dock?.segments ?? 0, `seed ${seed}`).toBeGreaterThanOrEqual(P.pier.minSegments);
      expect(near(A.harbourPier0, A.harbourPier1), `seed ${seed}`).toBeCloseTo(
        (dock?.segments ?? 0) * 2,
        6,
      );
      const pier = pierOf(A);
      const pieces = [
        ...houses,
        ...terraces,
        ...list(isl, 'marinaBerth'),
        ...list(isl, 'marinaPontoon'),
        A.marinaTower,
      ];
      for (const p of pieces) {
        expect(segDist(p, pier.a, pier.e), `seed ${seed} by the pier`).toBeGreaterThan(
          M.fit.pierGap - 0.5,
        );
        expect(pier.inApproach(p, 0), `seed ${seed} in the approach`).toBe(false);
      }
      for (const q of list(isl, 'marinaQuay').filter(onDeck))
        expect(pier.inApproach(q, -1), `seed ${seed} deck in the approach`).toBe(false);
    }
  }, 300_000);
});

/** Footprint of a planned piece. */
const rect = (p: { x: number; z: number; rotY: number }, w: number, d: number): Shape =>
  rectShape(p.x, p.z, p.rotY, w, d);

describe('TASK-674 quay: the town', () => {
  it('houses stand level on the deck, fronts to the water, footprints never overlap', () => {
    for (const seed of SEEDS) {
      const { w, A, houses, kinds, terraces, isl, quay } = site(seed);
      if (!A.marinaQuay0) continue;
      const shapes: Shape[] = [];
      houses.forEach((h, k) => {
        const kit = MARINA_KIT.house[kinds[k].x];
        const sh = rect(h, kit.w, kit.d);
        for (const q of [{ x: h.x, z: h.z }, ...shapeCorners(sh)]) {
          const y = heightAt(w.height, q.x, q.z);
          expect(Math.abs(y - M.ring.deckY), `seed ${seed} house ${k}`).toBeLessThan(0.3);
        }
        // front (+z) to the water: along the water normal of the nearest quay point
        let qn = quay[0];
        for (const q of quay) if (near(q, h) < near(qn, h)) qn = q;
        const f = { x: Math.cos(h.rotY), z: Math.sin(h.rotY) };
        const n = water(qn);
        expect(f.x * n.x + f.z * n.z, `seed ${seed} house ${k} front`).toBeGreaterThan(0.8);
        shapes.push(sh);
      });
      kinds.forEach((k, j) => {
        if (k.z < 0) return;
        const t = terraces[k.z];
        const kit = MARINA_KIT.terrace[M.house.restaurant[k.x]];
        shapes.push(rect(t, kit.w, kit.d));
        expect(near(t, houses[j]), `seed ${seed} terrace before its house`).toBeLessThan(7);
      });
      const tk = MARINA_KIT.tower;
      shapes.push(rect(A.marinaTower, tk.w, tk.d));
      for (let a = 0; a < shapes.length; a++)
        for (let b = a + 1; b < shapes.length; b++)
          expect(shapesOverlap(shapes[a], shapes[b], 0), `seed ${seed} overlap ${a}/${b}`).toBe(
            false,
          );
      // no scattered prop inside a house
      const store = w.props;
      for (let i = 0; i < store.count; i++) {
        if (!inMarina(isl, { x: store.x[i], z: store.z[i] })) continue;
        for (const sh of shapes.slice(0, houses.length))
          expect(
            Math.abs(-(store.x[i] - sh.x) * sh.s + (store.z[i] - sh.z) * sh.c) > sh.hw ||
              Math.abs((store.x[i] - sh.x) * sh.c + (store.z[i] - sh.z) * sh.s) > sh.hd,
            `seed ${seed} prop in a house`,
          ).toBe(true);
      }
    }
  }, 300_000);

  it('neighbouring houses differ', () => {
    for (const seed of SEEDS) {
      const { A, houses, kinds } = site(seed);
      if (!A.marinaQuay0) continue;
      for (let k = 1; k < houses.length; k++) {
        const a = MARINA_KIT.house[kinds[k - 1].x];
        const b = MARINA_KIT.house[kinds[k].x];
        // shoulder to shoulder: centres closer than the two half widths + an alley
        if (near(houses[k - 1], houses[k]) < (a.w + b.w) / 2 + M.house.alley)
          expect(kinds[k].x, `seed ${seed} house ${k}`).not.toBe(kinds[k - 1].x);
      }
    }
  }, 300_000);

  it('the light and the tower on their stubs at the two ends of the quay', () => {
    for (const seed of SEEDS) {
      const { w, A, isl, quay } = site(seed);
      if (!A.marinaQuay0) continue;
      const [sl, st] = stubsOf(isl);
      expect(near(A.harbourLight, sl.head), `seed ${seed} light`).toBeLessThan(1.5);
      // (on its stub; where the stub's ground will not take it, on the quay's last few u)
      const onStub = segDist(A.marinaTower, st.root, st.head) < 1;
      expect(
        onStub || near(A.marinaTower, quay[quay.length - 1]) < W + 6,
        `seed ${seed} tower`,
      ).toBe(true);
      expect(near(sl.root, quay[0]), `seed ${seed} light end`).toBeLessThan(W);
      expect(near(st.root, quay[quay.length - 1]), `seed ${seed} tower end`).toBeLessThan(W);
      for (const s of [sl, st]) {
        const y = heightAt(w.height, (s.root.x + s.head.x) / 2, (s.root.z + s.head.z) / 2);
        expect(Math.abs(y - M.ring.deckY), `seed ${seed} stub deck`).toBeLessThan(0.2);
      }
      // the island's own pieces on the quay are the town (and the harbour light)
      const fx = w.fixtures.filter((f) => f.islandId === isl.id && inMarina(isl, f));
      expect(fx.length, `seed ${seed}`).toBeGreaterThan(40);
    }
  }, 300_000);

  it('the quay walk joins the island network', () => {
    for (const seed of SEEDS) {
      const { w, A, isl } = site(seed);
      if (!A.marinaQuay0) continue;
      const onQuay = (p: XZ): boolean => inMarina(isl, p) && heightAt(w.height, p.x, p.z) > 1;
      const walk = w.paths.find((p) => p.islandId === isl.id && p.points.filter(onQuay).length > 8);
      expect(walk, `seed ${seed} quay walk`).toBeDefined();
      // a node on the quay reaches the settlement hub
      const g = w.pathGraph;
      const n = g.nodes.length / 2;
      const adj: number[][] = Array.from({ length: n }, () => []);
      for (let i = 0; i < g.edges.length; i += 2) {
        adj[g.edges[i]].push(g.edges[i + 1]);
        adj[g.edges[i + 1]].push(g.edges[i]);
      }
      const hub = w.settlements.find((s) => s.islandId === isl.id)?.hub.node ?? -1;
      const seen = new Uint8Array(n);
      const q = [hub];
      seen[hub] = 1;
      while (q.length)
        for (const m of adj[q.pop() as number])
          if (!seen[m]) {
            seen[m] = 1;
            q.push(m);
          }
      let reached = 0;
      for (let i = 0; i < n; i++)
        if (seen[i] && onQuay({ x: g.nodes[i * 2], z: g.nodes[i * 2 + 1] })) reached++;
      expect(reached, `seed ${seed} quay reaches the hub`).toBeGreaterThan(8);
    }
  }, 300_000);
});

describe('TASK-674 quay: boats keep off it', () => {
  it('boat routes never run over the moored boats, the stubs or the deck', () => {
    for (const seed of SEEDS) {
      const { w, A, isl } = site(seed);
      if (!A.marinaQuay0) continue;
      expect(marinaKeepOut([isl]).length).toBeGreaterThan(10);
      const boats = [...list(isl, 'marinaBerth'), ...list(isl, 'marinaPontoon')];
      const stubs = stubsOf(isl);
      for (const r of w.boatRoutes)
        for (let k = 0; k + 1 < r.points.length; k++) {
          const a = r.points[k];
          const b = r.points[k + 1];
          const n = Math.ceil(near(a, b));
          for (let i = 0; i <= n; i++) {
            const p = { x: a.x + ((b.x - a.x) * i) / n, z: a.z + ((b.z - a.z) * i) / n };
            if (near(p, A.marinaBasin) > A.marinaBasinSize.z / 2 + 30) continue;
            for (const q of boats)
              expect(near(p, q), `seed ${seed} ${r.kind} over a moored boat`).toBeGreaterThan(2.5);
            for (const s of stubs)
              expect(
                segDist(p, s.root, s.head),
                `seed ${seed} ${r.kind} over a stub`,
              ).toBeGreaterThan(M.stub.half);
            expect(heightAt(w.height, p.x, p.z), `seed ${seed} ${r.kind} on land`).toBeLessThan(0);
          }
        }
    }
  }, 300_000);

  it('courier voyages to and from HQ stay on open water, off the moored boats', () => {
    for (const seed of [1001, 2024, 1263]) {
      const { w, isl } = site(seed);
      const boats = list(isl, 'marinaBerth');
      for (const t of THEME_IDS) {
        if (t === 'hq') continue;
        for (const r of [voyageRoute(w, 'hq', t), voyageRoute(w, t, 'hq')]) {
          expect(r, `seed ${seed} ${t}`).not.toBeNull();
          if (!r) continue;
          expect(landSamples(w, r.pts, r.lens), `seed ${seed} ${t} land`).toBe(0);
          for (const p of r.pts)
            for (const q of boats)
              expect(near({ x: p.x, z: p.y }, q), `seed ${seed} ${t} boat`).toBeGreaterThan(1.5);
        }
      }
    }
  }, 300_000);
});

describe("TASK-674 (D-173): HQ's quay, the comb gives way, the fort in the mouth", () => {
  it('marina anchors on HQ only; Marketing is back to its arm harbour', () => {
    for (const seed of SEEDS) {
      const { w, isl } = site(seed);
      for (const o of w.islands) {
        if (o === isl) continue;
        const keys = Object.keys(o.anchors).filter((k) => k.startsWith('marina'));
        expect(keys, `seed ${seed} ${o.theme}`).toEqual([]);
      }
      const mk = w.islands.find((i) => i.theme === 'marketing');
      if (mk?.anchors.harbourPier0) expect(mk.anchors.harbourArm0, `seed ${seed}`).toBeDefined();
    }
  }, 300_000);

  it('no comb beside the quay; the fort on its site in the mouth, clear of the town and the ferry', () => {
    for (const seed of SEEDS) {
      const { w, A, isl, quay } = site(seed);
      if (!A.marinaQuay0) continue;
      const m = `seed ${seed}`;
      expect(
        w.marina.filter((f) => f.defId === 'marinaPier' || f.defId === 'sailboat'),
        m,
      ).toEqual([]);
      const forts = w.marina.filter((f) => f.defId === 'starFort');
      expect(forts.length, m).toBe(1);
      const fort = forts[0];
      const F = HQ_MARINA.fort.ring;
      const R = STAR_FORT.outerR;
      expect(near(fort, A.marinaFort), `${m} on its site`).toBeLessThan(0.01);
      // in the mouth: at most `mouthIn` inside the line between the stub heads
      const out = { x: Math.cos(A.marinaMouth.rotY), z: Math.sin(A.marinaMouth.rotY) };
      const v = (fort.x - A.marinaMouth.x) * out.x + (fort.z - A.marinaMouth.z) * out.z;
      expect(v, `${m} mouth`).toBeGreaterThanOrEqual(-F.mouthIn - 0.01);
      expect(v, `${m} mouth`).toBeLessThanOrEqual(F.out[1] + 0.01);
      for (const q of quay) expect(near(fort, q), m).toBeGreaterThan(W / 2 + R);
      for (const b of [...list(isl, 'marinaBerth'), ...list(isl, 'marinaPontoon')])
        expect(near(fort, b), `${m} boat`).toBeGreaterThan(R + F.boat);
      for (const s of stubsOf(isl))
        expect(segDist(fort, s.root, s.head), `${m} stub`).toBeGreaterThan(R + M.stub.half);
      const pier = pierOf(A);
      expect(segDist(fort, pier.a, pier.e), `${m} pier`).toBeGreaterThan(R + F.pierGap - 0.01);
      expect(pier.inApproach(fort, R), `${m} approach`).toBe(false);
      // the gates still mark the ferry stop
      expect(w.marina.filter((f) => f.defId === 'buoy').length, m).toBeGreaterThan(0);
    }
  }, 300_000);
});

describe('TASK-674 determinism', () => {
  it('same seed, same quay', () => {
    const pick = (w: WorldData) => {
      const isl = w.islands.find((i) => i.theme === 'hq') as IslandData;
      const anchors = Object.entries(isl.anchors).filter(([k]) => k.startsWith('marina'));
      return JSON.stringify([anchors, w.fixtures.filter((f) => inMarina(isl, f))]);
    };
    expect(pick(generateWorld(1001))).toBe(pick(world(1001)));
  });
});

const FIT_TABLE = { full: 13, short: 19, none: 0 };
/** First seed (from 1 up) whose bay takes no quay. */
const FALLBACK_SEED = 57;
