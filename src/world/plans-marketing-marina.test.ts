import { describe, expect, it } from 'vitest';
import { HARBOURS } from '../content/harbours.ts';
import { MARINA_KIT } from '../content/themes/marketing-marina.ts';
import { MARINA_SITE as M } from '../content/themes/marketing-marina-site.ts';
import { landSamples, voyageRoute } from '../life/courier-route.ts';
import { inMarina, marinaKeepOut } from './gen/plans/marketing-marina.ts';
import { rectShape, shapeCorners, shapesOverlap, type Shape } from './gen/sites.ts';
import {
  generateWorld,
  heightAt,
  THEME_IDS,
  type IslandData,
  type WorldData,
  type XZ,
} from './index.ts';

/** TASK-661 (D-170): the Horseshoe Harbour marina town on the Marketing Rock, 30 seeds + the shot seeds. */
const SEEDS = [1001, 2024, ...Array.from({ length: 30 }, (_, k) => 1000 + k * 263)];
const P = HARBOURS.marketing as NonNullable<typeof HARBOURS.marketing>;
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
  const isl = w.islands.find((i) => i.theme === 'marketing');
  if (!isl) throw new Error('no Marketing island');
  const A = isl.anchors;
  const quay = list(isl, 'marinaQuay');
  const houses = list(isl, 'marinaHouse');
  const kinds = list(isl, 'marinaHouseKind');
  return { w, isl, A, quay, houses, kinds, terraces: list(isl, 'marinaTerrace') };
};
const near = (a: XZ, b: XZ): number => Math.hypot(a.x - b.x, a.z - b.z);
const W = M.ring.width;

/** Fit tier of a seed: full ring, fewer houses, shortened tower mole (wider mouth), or none. */
function tier(seed: number): 'full' | 'reduced' | 'short' | 'none' {
  const { A, quay, houses } = site(seed);
  if (!A.marinaBasin) return 'none';
  const mouth = near(quay[0], quay[quay.length - 1]) - W;
  if (mouth > M.ring.mouth + 1) return 'short';
  return houses.length >= 15 ? 'full' : 'reduced';
}

describe('TASK-661 marina: seed fit', () => {
  it('fit table: seed 1001 has the full town, the sweep pinned', () => {
    const table = { full: 0, reduced: 0, short: 0, none: 0 };
    for (const seed of SEEDS) table[tier(seed)]++;
    expect(tier(1001)).toBe('full');
    // (pinned to today's sweep: 32 / 32 full, so a regression shows)
    expect(table.full).toBeGreaterThanOrEqual(FULL_MIN);
    expect(table.full + table.reduced + table.short + table.none).toBe(SEEDS.length);
  }, 300_000);

  it('target picture: basin, ring, mouth and the town counts', () => {
    for (const seed of SEEDS) {
      const { A, quay, houses, terraces, kinds } = site(seed);
      if (!A.marinaBasin) continue;
      const m = `seed ${seed}`;
      expect(A.marinaBasinSize.x, m).toBeGreaterThanOrEqual(26);
      expect(A.marinaBasinSize.x, m).toBeLessThanOrEqual(34);
      expect(A.marinaQuaySize.x, m).toBeGreaterThanOrEqual(7);
      const mouth = near(quay[0], quay[quay.length - 1]) - W;
      expect(mouth, m).toBeGreaterThanOrEqual(6);
      if (tier(seed) === 'full') {
        expect(mouth, m).toBeLessThanOrEqual(9);
        expect(houses.length, m).toBeGreaterThanOrEqual(15);
        expect(houses.length, m).toBeLessThanOrEqual(18);
      }
      expect(kinds.length, m).toBe(houses.length);
      // a terrace before every restaurant / café / gelato house, nothing else has one
      const withT = kinds.filter((k) => k.z >= 0);
      expect(withT.length, m).toBe(terraces.length);
      for (const k of kinds) if (k.z >= 0) expect(M.house.restaurant[k.x], m).toBeDefined();
      expect(A.marinaTower, m).toBeDefined();
      expect(A.marinaMouth, m).toBeDefined();
      expect(list(site(seed).isl, 'marinaBerth').length, m).toBeGreaterThanOrEqual(8);
      expect(list(site(seed).isl, 'marinaPontoon').length, m).toBeGreaterThanOrEqual(1);
    }
  }, 300_000);
});

describe('TASK-661 marina: ground', () => {
  it('the ring is one flat deck all the way round, on this island', () => {
    for (const seed of SEEDS) {
      const { w, isl, quay } = site(seed);
      if (quay.length === 0) continue;
      for (let k = 0; k < quay.length; k++) {
        expect(Math.abs((quay[k].y ?? 0) - M.ring.deckY), `seed ${seed} q${k}`).toBeLessThan(0.05);
        if (k === 0) continue;
        const a = quay[k - 1];
        const b = quay[k];
        expect(near(a, b), `seed ${seed}`).toBeLessThan(M.quayStep * 1.3);
        for (let t = 0; t <= 1; t += 0.25) {
          const x = a.x + (b.x - a.x) * t;
          const z = a.z + (b.z - a.z) * t;
          const y = heightAt(w.height, x, z);
          expect(Math.abs(y - M.ring.deckY), `seed ${seed} q${k} t${t}`).toBeLessThan(0.2);
          const i = Math.round((z + 384) / 2) * 385 + Math.round((x + 384) / 2);
          expect(w.islandMap[i], `seed ${seed}`).toBe(isl.id + 1);
        }
      }
    }
  }, 300_000);

  it('the basin is water, the mouth opens on the sea', () => {
    for (const seed of SEEDS) {
      const { w, A } = site(seed);
      if (!A.marinaBasin) continue;
      const c = A.marinaBasin;
      const R = A.marinaBasinSize.x / 2;
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 12)
        for (const f of [0, 0.4, 0.75]) {
          const y = heightAt(w.height, c.x + Math.cos(a) * R * f, c.z + Math.sin(a) * R * f);
          expect(y, `seed ${seed} basin`).toBeLessThan(-1);
        }
      const m = A.marinaMouth;
      for (let t = 0; t <= 14; t += 1) {
        const y = heightAt(w.height, m.x + Math.cos(m.rotY) * t, m.z + Math.sin(m.rotY) * t);
        expect(y, `seed ${seed} mouth +${t}`).toBeLessThan(-0.5);
      }
    }
  }, 300_000);

  it('the ferry pier, its T-head and the approach stay clear of the ring', () => {
    for (const seed of SEEDS) {
      const { w, A, isl } = site(seed);
      if (!A.marinaBasin) continue;
      expect(w.docks.find((d) => d.islandId === isl.id)?.segments, `seed ${seed}`).toBe(
        P.pier.segments,
      );
      const b = A.ferryBerth;
      const u = { x: Math.cos(b.rotY), z: Math.sin(b.rotY) };
      const v = { x: -u.z, z: u.x };
      const { len, half } = P.berth.approach;
      for (let s = -P.berth.out; s <= len; s += 1)
        for (let o = -half; o <= half; o += 1) {
          const x = b.x + u.x * s + v.x * o;
          const z = b.z + u.z * s + v.z * o;
          expect(inMarina(isl, { x, z }), `seed ${seed} approach`).toBe(false);
        }
    }
  }, 300_000);
});

/** Footprint of a planned piece. */
const rect = (p: { x: number; z: number; rotY: number }, w: number, d: number): Shape =>
  rectShape(p.x, p.z, p.rotY, w, d);

describe('TASK-661 marina: the town', () => {
  it('houses stand level on the deck, fronts to the basin, footprints never overlap', () => {
    for (const seed of SEEDS) {
      const { w, A, houses, kinds, terraces, isl } = site(seed);
      if (!A.marinaBasin) continue;
      const c = A.marinaBasin;
      const shapes: Shape[] = [];
      houses.forEach((h, k) => {
        const kit = MARINA_KIT.house[kinds[k].x];
        const sh = rect(h, kit.w, kit.d);
        for (const q of [{ x: h.x, z: h.z }, ...shapeCorners(sh)]) {
          const y = heightAt(w.height, q.x, q.z);
          expect(Math.abs(y - M.ring.deckY), `seed ${seed} house ${k}`).toBeLessThan(0.3);
        }
        // front (+z) toward the basin centre
        const f = { x: Math.cos(h.rotY), z: Math.sin(h.rotY) };
        expect(f.x * (c.x - h.x) + f.z * (c.z - h.z), `seed ${seed}`).toBeGreaterThan(0);
        shapes.push(sh);
      });
      kinds.forEach((k, j) => {
        if (k.z < 0) return;
        const t = terraces[k.z];
        const kit = MARINA_KIT.terrace[M.house.restaurant[k.x]];
        shapes.push(rect(t, kit.w, kit.d));
        expect(near(t, houses[j]), `seed ${seed} terrace before its house`).toBeLessThan(6);
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

  it('neighbouring houses differ; restaurants keep their terrace on the water', () => {
    for (const seed of SEEDS) {
      const { A, houses, kinds } = site(seed);
      if (!A.marinaBasin) continue;
      for (let k = 1; k < houses.length; k++) {
        const a = MARINA_KIT.house[kinds[k - 1].x];
        const b = MARINA_KIT.house[kinds[k].x];
        // shoulder to shoulder: centres closer than the two half widths + an alley
        if (near(houses[k - 1], houses[k]) < (a.w + b.w) / 2 + M.house.alley)
          expect(kinds[k].x, `seed ${seed} house ${k}`).not.toBe(kinds[k - 1].x);
      }
    }
  }, 300_000);

  it('boats float in the basin, the tower on its mole head, the light on the other', () => {
    for (const seed of SEEDS) {
      const { w, A, isl, quay } = site(seed);
      if (!A.marinaBasin) continue;
      const c = A.marinaBasin;
      const Rb = A.marinaBasinSize.x / 2;
      for (const b of [...list(isl, 'marinaBerth'), ...list(isl, 'marinaPontoon')]) {
        expect(b.y, `seed ${seed}`).toBe(0);
        expect(heightAt(w.height, b.x, b.z), `seed ${seed} boat`).toBeLessThan(-0.5);
        expect(near(b, c), `seed ${seed}`).toBeLessThan(Rb);
      }
      expect(near(A.marinaTower, quay[quay.length - 1]), `seed ${seed} tower`).toBeLessThan(1);
      expect(near(A.harbourLight, quay[0]), `seed ${seed} light`).toBeLessThan(2);
      // the island's own pieces on the ring are only the town (and the harbour light)
      const fx = w.fixtures.filter((f) => f.islandId === isl.id && inMarina(isl, f));
      expect(fx.length, `seed ${seed}`).toBeGreaterThan(40);
    }
  }, 300_000);

  it('the quay walk joins the island network', () => {
    for (const seed of SEEDS) {
      const { w, A, isl } = site(seed);
      if (!A.marinaBasin) continue;
      const c = A.marinaBasin;
      const Rb = A.marinaBasinSize.x / 2;
      const onQuay = (p: XZ): boolean => near(p, c) > Rb && near(p, c) < Rb + W;
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
      let reached = false;
      for (let i = 0; i < n && !reached; i++)
        if (seen[i] && onQuay({ x: g.nodes[i * 2], z: g.nodes[i * 2 + 1] })) reached = true;
      expect(reached, `seed ${seed} quay reaches the hub`).toBe(true);
    }
  }, 300_000);
});

describe('TASK-661 marina: boats keep off it', () => {
  it('boat routes never cross the moles, the quay or the basin', () => {
    for (const seed of SEEDS) {
      const { w, A, isl, quay } = site(seed);
      if (!A.marinaBasin) continue;
      expect(marinaKeepOut([isl]).length).toBeGreaterThan(10);
      const c = A.marinaBasin;
      const Rc = A.marinaBasinSize.x / 2 + W / 2;
      for (const r of w.boatRoutes)
        for (let k = 0; k + 1 < r.points.length; k++) {
          const a = r.points[k];
          const b = r.points[k + 1];
          const n = Math.ceil(near(a, b));
          for (let i = 0; i <= n; i++) {
            const p = { x: a.x + ((b.x - a.x) * i) / n, z: a.z + ((b.z - a.z) * i) / n };
            if (near(p, c) > Rc + W + 6) continue;
            expect(near(p, c), `seed ${seed} ${r.kind} in the basin`).toBeGreaterThan(Rc);
            for (const q of quay)
              expect(near(p, q), `seed ${seed} ${r.kind} over the quay`).toBeGreaterThan(W / 2 + 1);
          }
        }
    }
  }, 300_000);

  it('courier voyages to and from the Rock stay on open water', () => {
    for (const seed of [1001, 2024, 1263]) {
      const { w, A } = site(seed);
      const c = A.marinaBasin;
      const Rc = A.marinaBasinSize.x / 2 + W / 2;
      for (const t of THEME_IDS) {
        if (t === 'marketing') continue;
        for (const r of [voyageRoute(w, 'marketing', t), voyageRoute(w, t, 'marketing')]) {
          expect(r, `seed ${seed} ${t}`).not.toBeNull();
          if (!r) continue;
          expect(landSamples(w, r.pts, r.lens), `seed ${seed} ${t} land`).toBe(0);
          for (const p of r.pts)
            expect(near({ x: p.x, z: p.y }, c), `seed ${seed} ${t} basin`).toBeGreaterThan(Rc);
        }
      }
    }
  }, 300_000);
});

describe('TASK-661 determinism', () => {
  it('same seed, same marina', () => {
    const pick = (w: WorldData) => {
      const isl = w.islands.find((i) => i.theme === 'marketing') as IslandData;
      const anchors = Object.entries(isl.anchors).filter(([k]) => k.startsWith('marina'));
      return JSON.stringify([anchors, w.fixtures.filter((f) => inMarina(isl, f))]);
    };
    expect(pick(generateWorld(1001))).toBe(pick(world(1001)));
  });
});

const FULL_MIN = 32;
