/**
 * Coding island plan (M14b TASK-363): turbines on the knolls, solar districts, Tech Park with the
 * pond as reflecting pools, zero farm leftovers, lot floor and connectivity over 30 seeds, and a
 * per-theme snapshot of the Coding site data.
 */
import { describe, expect, it } from 'vitest';
import { PROP_DEFS } from '../content/props.ts';
import { FIXTURE_RADIUS } from '../content/settlements.ts';
import { CODING_CULTURE_SITES as CS } from '../content/cultures/coding.ts';
import { CODING_CULTURE_PROP_DEFS, TURBINE_HEIGHTS } from '../content/props-themes/coding.ts';
import { appendSettlementProps } from '../render/props/settlement-props.ts';
import { PINWHEEL_VARIANT } from '../geo/themes/culture-coding-m22.ts';
import { generateWorld, heightAt, Zone, type IslandData, type WorldData } from './index.ts';
import { discShape, rectShape, shapeCorners, shapeDist, type Shape } from './gen/sites.ts';

const SEEDS = Array.from({ length: 30 }, (_, i) => 1 + i * 37);
const worlds = new Map<number, WorldData>();
const world = (seed: number): WorldData => {
  let w = worlds.get(seed);
  if (!w) {
    w = generateWorld(seed);
    worlds.set(seed, w);
  }
  return w;
};
const codingOf = (w: WorldData): IslandData => {
  const isl = w.islands.find((i) => i.theme === 'coding');
  if (!isl) throw new Error(`seed ${w.seed}: no coding island`);
  return isl;
};
const LEFTOVER_DEFS = ['windmill', 'cropRow', 'haybale', 'barn', 'cottage', 'fence', 'towerHouse'];

/** Path-graph nodes reachable from `start`. */
function reach(w: WorldData, start: number): Uint8Array {
  const g = w.pathGraph;
  const nNodes = g.nodes.length / 2;
  const adj: number[][] = Array.from({ length: nNodes }, () => []);
  for (let e = 0; e < g.edges.length; e += 2) {
    adj[g.edges[e]].push(g.edges[e + 1]);
    adj[g.edges[e + 1]].push(g.edges[e]);
  }
  const seen = new Uint8Array(nNodes);
  const stack = [start];
  seen[start] = 1;
  while (stack.length) {
    const a = stack.pop() as number;
    for (const b of adj[a])
      if (!seen[b]) {
        seen[b] = 1;
        stack.push(b);
      }
  }
  return seen;
}

describe('Coding island plan (TASK-363)', { timeout: 120_000 }, () => {
  it('leftover audit: no farm defs, fences or patch hues on the Coding island (30 seeds)', () => {
    for (const seed of SEEDS) {
      const w = world(seed);
      const isl = codingOf(w);
      const id = isl.id;
      const ctx = `seed ${seed}`;
      for (const l of w.lots.filter((x) => x.islandId === id))
        expect(LEFTOVER_DEFS, `${ctx} lot ${l.defId}`).not.toContain(l.defId);
      for (const m of w.landmarks.filter((x) => x.islandId === id))
        expect(m.kind, ctx).toBe('windTurbine');
      for (const f of w.fixtures.filter((x) => x.islandId === id))
        expect(LEFTOVER_DEFS, `${ctx} fixture ${f.defId}`).not.toContain(f.defId);
      expect(w.fences.filter((f) => f.islandId === id).length, ctx).toBe(0);
      const p = w.props;
      for (let i = 0; i < p.count; i++)
        if (p.islandId[i] === id)
          expect(LEFTOVER_DEFS, `${ctx} prop`).not.toContain(PROP_DEFS[p.defId[i]].id);
      expect(w.settlements.find((s) => s.islandId === id)?.kind, ctx).toBe('campus');
      // patch hues: none outside the solar districts (none inside either: gravel, not crops)
      const solar = w.districts
        .filter((d) => d.islandId === id && d.kind === 'solar')
        .map((d) => rectShape(d.x, d.z, d.rotY, d.w, d.d));
      const n = w.height.n;
      for (let i = 0; i < w.fieldColor.length; i++) {
        if (w.islandMap[i] !== id + 1 || w.fieldColor[i] === 0) continue;
        const x = w.height.originX + (i % n) * w.height.cellSize;
        const z = w.height.originZ + Math.floor(i / n) * w.height.cellSize;
        expect(
          solar.some((s) => shapeDist(s, x, z) <= 1),
          `${ctx} fieldColor at ${x},${z}`,
        ).toBe(true);
      }
    }
  });

  it('wind turbines take the knoll anchors, one dominant (15 / 12 / 10 u by height rank)', () => {
    let three = 0;
    for (const seed of SEEDS) {
      const w = world(seed);
      const isl = codingOf(w);
      const ctx = `seed ${seed}`;
      const tb = w.landmarks.filter((m) => m.islandId === isl.id && m.kind === 'windTurbine');
      expect(tb.length, ctx).toBeGreaterThanOrEqual(2);
      if (tb.length === 3) three++;
      for (const key of Object.keys(isl.anchors).filter((k) => k.startsWith('knoll'))) {
        const k = isl.anchors[key];
        expect(
          tb.some((m) => Math.hypot(m.x - k.x, m.z - k.z) < 0.01),
          `${ctx} ${key}`,
        ).toBe(true);
      }
      // heights by knoll rank (ranked on the planner's ground, before the pads): distinct, one 15 u
      // (the tallest wears the chime pagoda: variant 3, the variant-0 tower)
      const hs = tb
        .map((m) => TURBINE_HEIGHTS[m.variant === CS.chimeVariant ? 0 : (m.variant ?? -1)])
        .sort((a, b) => b - a);
      expect(tb.filter((m) => m.variant === CS.chimeVariant).length, ctx).toBe(1);
      expect(hs, ctx).toEqual(TURBINE_HEIGHTS.slice(0, hs.length));
    }
    expect(three / SEEDS.length).toBeGreaterThanOrEqual(0.9);
  });

  it('lot minimum ≥ 6 in ≥ 90 % of seeds; lots, dock and turbines connected to the hub', () => {
    let ok = 0;
    for (const seed of SEEDS) {
      const w = world(seed);
      const isl = codingOf(w);
      const ctx = `seed ${seed}`;
      const s = w.settlements.find((x) => x.islandId === isl.id);
      expect(s, ctx).toBeDefined();
      if (!s) continue;
      if (s.lots.length >= 6) ok++;
      expect(s.hub.node, ctx).toBeGreaterThanOrEqual(0);
      const seen = reach(w, s.hub.node);
      for (const li of s.lots) expect(seen[w.lots[li].node], `${ctx} lot ${li}`).toBe(1);
      for (const di of s.docks) expect(seen[w.docks[di].node], `${ctx} dock`).toBe(1);
      const nodes = w.pathGraph.nodes;
      for (const li of s.landmarks) {
        const m = w.landmarks[li];
        let near = false;
        for (let k = 0; k < nodes.length / 2 && !near; k++)
          if (seen[k] && Math.hypot(nodes[2 * k] - m.x, nodes[2 * k + 1] - m.z) < 4.5) near = true;
        expect(near, `${ctx} turbine ${li} linked`).toBe(true);
      }
    }
    expect(ok / SEEDS.length).toBeGreaterThanOrEqual(0.9);
  });

  it('pond → twin reflecting pools on the quad (kerbs), solar districts on gravel', () => {
    for (const seed of SEEDS.slice(0, 10)) {
      const w = world(seed);
      const isl = codingOf(w);
      const ctx = `seed ${seed}`;
      let pool = 0;
      for (let i = 0; i < w.zone.length; i++)
        if (w.islandMap[i] === isl.id + 1 && w.zone[i] === Zone.crater) pool++;
      expect(pool, ctx).toBeGreaterThanOrEqual(4);
      const kerbs = w.fixtures.filter(
        (f) => f.islandId === isl.id && f.defId === 'reflectingPoolEdge',
      );
      expect(kerbs.length, ctx).toBeGreaterThanOrEqual(8);
      expect(kerbs.filter((k) => k.variant === 1).length, ctx).toBe(8); // 4 corners per pool
      const quad = w.districts.find((d) => d.islandId === isl.id && d.kind === 'quad');
      expect(quad, ctx).toBeDefined();
      const solar = w.districts.filter((d) => d.islandId === isl.id && d.kind === 'solar');
      expect(solar.length, ctx).toBeGreaterThanOrEqual(1);
    }
  });

  it('solar rows cover ≥ 60 % of the solar district area', () => {
    for (const seed of SEEDS.slice(0, 6)) {
      const w = world(seed);
      const isl = codingOf(w);
      const { props } = appendSettlementProps(w);
      const solarRow = PROP_DEFS.findIndex((d) => d.id === 'solarRow');
      let area = 0;
      let rows = 0;
      for (const d of w.districts.filter((x) => x.islandId === isl.id && x.kind === 'solar')) {
        area += d.w * d.d;
        const sh = rectShape(d.x, d.z, d.rotY, d.w, d.d);
        for (let i = 0; i < props.count; i++)
          if (props.defId[i] === solarRow && shapeDist(sh, props.x[i], props.z[i]) <= 0) rows++;
      }
      // one lattice segment stands for a 5 u × 3 u cell (render DISTRICT_LATTICE)
      expect((rows * 15) / area, `seed ${seed}`).toBeGreaterThanOrEqual(0.6);
    }
  });

  it('per-theme snapshot: Coding site data for seeds 1, 42, 1001', () => {
    const snap = [1, 42, 1001].map((seed) => {
      const w = generateWorld(seed);
      const id = codingOf(w).id;
      const r = (v: number): number => Math.round(v * 100) / 100;
      return {
        seed,
        lots: w.lots.filter((l) => l.islandId === id).map((l) => `${l.defId}@${r(l.x)},${r(l.z)}`),
        turbines: w.landmarks
          .filter((m) => m.islandId === id)
          .map((m) => `${m.variant}@${r(m.x)},${r(m.z)}`),
        districts: w.districts
          .filter((d) => d.islandId === id)
          .map((d) => `${d.kind}@${r(d.x)},${r(d.z)} ${r(d.w)}x${r(d.d)}`),
        fixtures: w.fixtures.filter((f) => f.islandId === id).length,
      };
    });
    expect(snap).toMatchSnapshot();
  });
});

/** Count range per culture def on the Coding island (30 seeds). */
const KIT_COUNTS: Record<string, readonly [number, number]> = {
  // TASK-485: a desk on a story spot's stage (the duck crossing's route) yields
  pergolaDesk: [3, 4],
  whiteboardA: [2, 2],
  // + the M22 nap grove (TASK-479): up to 3 mugs and 6 hammocks beside the turbine-foot ones
  mugStack: [3, 6],
  giantDuck: [1, 1],
  rubberDuck: [2, 4],
  hammock: [1, 9],
  kite: [0, 6],
  kiteRack: [0, 1],
};
const CULTURE_DEFS = new Set(CODING_CULTURE_PROP_DEFS.map((d) => d.id));

describe('Coding Wind Gardens culture (TASK-421)', { timeout: 120_000 }, () => {
  it('kit placed in range, ≥ 5 story spots, every piece on levelled land clear of lots', () => {
    let kites = 0;
    for (const seed of SEEDS) {
      const w = world(seed);
      const isl = codingOf(w);
      const ctx = `seed ${seed}`;
      // the M22 pinwheels (kite variant 3) are not kites of the field
      const fx = w.fixtures.filter(
        (f) =>
          f.islandId === isl.id &&
          CULTURE_DEFS.has(f.defId) &&
          !(f.defId === 'kite' && f.variant === PINWHEEL_VARIANT),
      );
      for (const [def, [lo, hi]] of Object.entries(KIT_COUNTS)) {
        const n = fx.filter((f) => f.defId === def).length;
        expect(n, `${ctx} ${def}`).toBeGreaterThanOrEqual(lo);
        expect(n, `${ctx} ${def}`).toBeLessThanOrEqual(hi);
      }
      if (fx.some((f) => f.defId === 'kiteRack')) kites++;
      // story spots: ≥ 5 distinct kinds, on this island's land
      const st = w.storySpots.filter((s) => s.islandId === isl.id);
      expect(st.length, ctx).toBeGreaterThanOrEqual(5);
      // one spot per kind, except the M22 nap grove's extra hammockNap tableaux (TASK-479, up to 3)
      const once = st.filter((s) => s.kind !== 'hammockNap');
      expect(new Set(once.map((s) => s.kind)).size, ctx).toBe(once.length);
      expect(st.length - once.length, ctx).toBeLessThanOrEqual(4);
      for (const s of st) expect(s.pos.y, `${ctx} ${s.kind}`).toBeGreaterThan(0.3);
      // on land, level (posts and poles never float or sink), clear of every building
      const lots = w.lots
        .filter((l) => l.islandId === isl.id)
        .map((l) => rectShape(l.x, l.z, l.rotY, l.w, l.d));
      const rects = CS.rect as Record<string, readonly [number, number]>;
      for (const f of fx) {
        const r = rects[f.defId];
        const sh: Shape = r
          ? rectShape(f.x, f.z, f.rotY, r[0], r[1])
          : discShape(f.x, f.z, FIXTURE_RADIUS[f.defId]);
        const pts = r
          ? [{ x: f.x, z: f.z }, ...shapeCorners(sh)]
          : [0, 1, 2, 3, 4, 5].map((k) => ({
              x: f.x + Math.cos(k * 1.047) * sh.r,
              z: f.z + Math.sin(k * 1.047) * sh.r,
            }));
        const ys = pts.map((p) => heightAt(w.height, p.x, p.z));
        const at = `${ctx} ${f.defId}@${f.x.toFixed(1)},${f.z.toFixed(1)}`;
        expect(Math.min(...ys), at).toBeGreaterThan(0.3);
        expect(Math.max(...ys) - Math.min(...ys), at).toBeLessThanOrEqual(r ? 0.45 : 0.6);
        for (const l of lots)
          for (const p of pts) expect(shapeDist(l, p.x, p.z), at).toBeGreaterThan(0);
      }
      // bracket hedges (v2) only on the Hack Garden of this island
      for (const f of w.fixtures)
        if (f.defId === 'hedge' && f.variant === CS.garden.bracketVariant)
          expect(f.islandId, ctx).toBe(isl.id);
    }
    expect(kites / SEEDS.length).toBeGreaterThanOrEqual(0.9);
  });

  it('culture defs stay on the Coding island; hedge rolls never pick the bracket', () => {
    for (const seed of SEEDS.slice(0, 6)) {
      const w = world(seed);
      const id = codingOf(w).id;
      // cross-island reuse (TASK-480): the QA palm rim slings two Coding hammocks
      const qa = w.islands.find((i) => i.theme === 'qa')?.id;
      for (const f of w.fixtures)
        if (CULTURE_DEFS.has(f.defId) && !(f.defId === 'hammock' && f.islandId === qa))
          expect(f.islandId, `seed ${seed}`).toBe(id);
      const { props } = appendSettlementProps(w);
      const hedge = PROP_DEFS.findIndex((d) => d.id === 'hedge');
      const brackets = w.fixtures.filter(
        (f) => f.defId === 'hedge' && f.variant === CS.garden.bracketVariant,
      ).length;
      let n = 0;
      for (let i = 0; i < props.count; i++)
        if (props.defId[i] === hedge && props.variant[i] === CS.garden.bracketVariant) n++;
      expect(n, `seed ${seed}`).toBe(brackets);
    }
  });
});
