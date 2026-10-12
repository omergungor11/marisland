import { describe, expect, it } from 'vitest';
import { PROP_DEFS } from '../content/props.ts';
import { FIXTURE_RADIUS } from '../content/settlements.ts';
import { RESEARCH_SITE } from '../content/themes/research.ts';
import { generateWorld, heightAt, Zone, type FixtureData, type WorldData } from './index.ts';

/** Research "Observatory University" plan (TASK-402b) over 30 seeds. */
const SEEDS = Array.from({ length: 30 }, (_, k) => 1000 + k * 263);
const cache = new Map<number, WorldData>();
const world = (seed: number): WorldData => {
  let w = cache.get(seed);
  if (!w) {
    w = generateWorld(seed);
    cache.set(seed, w);
  }
  return w;
};

function reachable(w: WorldData, start: number): Uint8Array {
  const n = w.pathGraph.nodes.length / 2;
  const adj: number[][] = Array.from({ length: n }, () => []);
  const e = w.pathGraph.edges;
  for (let i = 0; i < e.length; i += 2) {
    adj[e[i]].push(e[i + 1]);
    adj[e[i + 1]].push(e[i]);
  }
  const seen = new Uint8Array(n);
  if (start < 0) return seen;
  const q = [start];
  seen[start] = 1;
  while (q.length > 0) {
    const c = q.pop() as number;
    for (const m of adj[c])
      if (!seen[m]) {
        seen[m] = 1;
        q.push(m);
      }
  }
  return seen;
}

function research(seed: number) {
  const w = world(seed);
  const isl = w.islands.find((i) => i.theme === 'research');
  if (!isl) return null;
  const on = <T extends { islandId: number }>(a: readonly T[]): T[] =>
    a.filter((x) => x.islandId === isl.id);
  const fixtures = on(w.fixtures);
  const of = (id: string): FixtureData[] => fixtures.filter((f) => f.defId === id);
  return {
    w,
    isl,
    lots: on(w.lots),
    fixtures,
    of,
    observatory: of('observatory')[0],
    vessel: of('researchVessel')[0],
    landmarks: on(w.landmarks),
    docks: on(w.docks),
    settlement: w.settlements.find((s) => s.islandId === isl.id),
  };
}

/** The defs the planner may place (+ the vessel). */
const PLAN_DEFS = [
  'observatory',
  'fountain',
  'libraryRotunda',
  'facultyHall',
  'campusTower',
  'scholarStatue',
  'bench',
  'lanternPost',
  'hedgeParterre',
  'armillarySphere',
  'topiary',
  'flowerBed',
  'pergola',
  'terrarium',
  'biodomeHero',
  'labPod',
  'radioDish',
  'weatherMast',
  'atomSculpture',
  'dnaHelix',
  'rocketMonument',
  'researchVessel',
];

/** Buildings and big kit: must stand on level ground (their pads). */
const LEVEL = [
  'observatory',
  'libraryRotunda',
  'facultyHall',
  'campusTower',
  'terrarium',
  'biodomeHero',
  'labPod',
  'hedgeParterre',
  'fountain',
];

/** Height spread over a disc (centre, two rings of 12). */
function spread(w: WorldData, x: number, z: number, r: number): number {
  let lo = Infinity;
  let hi = -Infinity;
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    for (const s of [0, 0.5, 1]) {
      const y = heightAt(w.height, x + Math.cos(a) * r * s, z + Math.sin(a) * r * s);
      lo = Math.min(lo, y);
      hi = Math.max(hi, y);
    }
  }
  return hi - lo;
}

describe('Research Observatory University plan (TASK-402b) — 30 seeds', () => {
  it('every campus: observatory, quad + fountain, library, ≥ 2 faculty halls, a parterre garden; no lots or landmarks', () => {
    let n = 0;
    let halls3 = 0;
    let gardens8 = 0;
    let glass = 0;
    let base = 0;
    let sculptures = 0;
    for (const seed of SEEDS) {
      const d = research(seed);
      if (!d) continue;
      n++;
      const ctx = `seed ${seed}`;
      expect(d.lots, ctx).toEqual([]);
      expect(d.landmarks, ctx).toEqual([]);
      for (const f of d.fixtures) expect(PLAN_DEFS, ctx).toContain(f.defId);
      expect(d.observatory, ctx).toBeDefined();
      expect(d.of('fountain').length, ctx).toBe(1);
      expect(d.of('libraryRotunda').length, ctx).toBe(1);
      expect(d.of('facultyHall').length, ctx).toBeGreaterThanOrEqual(1);
      expect(d.of('hedgeParterre').length, ctx).toBeGreaterThanOrEqual(4);
      expect(d.of('topiary').length, ctx).toBeGreaterThanOrEqual(6);
      expect(d.settlement?.plaza, `${ctx} paved quad`).toBeTruthy();
      if (d.of('facultyHall').length >= 3) halls3++;
      if (d.of('hedgeParterre').length >= 8) gardens8++;
      if (d.of('terrarium').length >= 2) glass++;
      if (d.of('labPod').length >= 1 && d.of('weatherMast').length === 1) base++;
      const sc = ['atomSculpture', 'dnaHelix', 'rocketMonument', 'armillarySphere'];
      if (sc.filter((id) => d.of(id).length > 0).length >= 3) sculptures++;
    }
    expect(n).toBeGreaterThan(20);
    expect(halls3 / n, '≥ 3 faculty halls').toBeGreaterThanOrEqual(0.75);
    expect(gardens8 / n, 'the full 3 × 3 garden').toBeGreaterThanOrEqual(0.75);
    expect(glass / n, 'glasshouse row').toBeGreaterThanOrEqual(0.75);
    expect(base / n, 'research base').toBeGreaterThanOrEqual(0.75);
    expect(sculptures / n, '≥ 3 kinds of sculpture').toBeGreaterThanOrEqual(0.75);
    // the observatory and the campus buildings read from T0
    for (const id of ['observatory', 'facultyHall', 'libraryRotunda'])
      expect(PROP_DEFS.find((p) => p.id === id)?.tier, id).toBe(0);
  });

  it('observatory on the summit above the quad, door toward the quad; buildings on level pads', () => {
    for (const seed of SEEDS) {
      const d = research(seed);
      if (!d?.observatory) continue;
      const { w, observatory: o } = d;
      const ctx = `seed ${seed}`;
      const quad = d.settlement?.plaza;
      if (!quad) continue;
      expect(heightAt(w.height, o.x, o.z), `${ctx} summit above the quad`).toBeGreaterThan(
        heightAt(w.height, quad.x, quad.z) + 0.5,
      );
      const len = Math.hypot(quad.x - o.x, quad.z - o.z);
      const c = (Math.cos(o.rotY) * (quad.x - o.x) + Math.sin(o.rotY) * (quad.z - o.z)) / len;
      expect(c, `${ctx} observatory door faces the quad`).toBeGreaterThan(0.99);
      // pads: a level footprint under every building (nothing on a slope, floating or buried)
      for (const f of d.fixtures) {
        if (!LEVEL.includes(f.defId)) continue;
        // inside the footprint: halls are 5 × 4 u rects, the rest round
        const r =
          f.defId === 'facultyHall' ? 1.9 : Math.min(FIXTURE_RADIUS[f.defId] ?? 1, 3.2) * 0.75;
        expect(spread(w, f.x, f.z, r), `${ctx} ${f.defId} level`).toBeLessThan(0.45);
      }
      for (const f of d.fixtures)
        if (f.defId !== 'researchVessel')
          expect(heightAt(w.height, f.x, f.z), `${ctx} ${f.defId} on land`).toBeGreaterThan(0.3);
    }
  });

  it('no two buildings overlap (footprint discs at 80 %)', () => {
    const BIG = [...LEVEL, 'radioDish', 'scholarStatue', 'rocketMonument', 'atomSculpture'];
    for (const seed of SEEDS) {
      const d = research(seed);
      if (!d) continue;
      const fs = d.fixtures.filter((f) => BIG.includes(f.defId));
      for (let a = 0; a < fs.length; a++)
        for (let b = a + 1; b < fs.length; b++) {
          const ra = (FIXTURE_RADIUS[fs[a].defId] ?? 1) * 0.8;
          const rb = (FIXTURE_RADIUS[fs[b].defId] ?? 1) * 0.8;
          const dd = Math.hypot(fs[a].x - fs[b].x, fs[a].z - fs[b].z);
          // garden tiles sit edge to edge on a 4.9 u pitch: their discs (2.4 u) may touch
          const slack = fs[a].defId === 'hedgeParterre' && fs[b].defId === 'hedgeParterre' ? 1 : 0;
          expect(dd + slack, `seed ${seed} ${fs[a].defId} × ${fs[b].defId}`).toBeGreaterThanOrEqual(
            ra + rb - (fs[a].defId === 'radioDish' || fs[b].defId === 'radioDish' ? 0.8 : 0),
          );
        }
    }
  });

  it('cove: a leeward pier on low ground, the vessel floating beside it in ≥ 90 %', () => {
    let n = 0;
    let moored = 0;
    for (const seed of SEEDS) {
      const d = research(seed);
      if (!d) continue;
      n++;
      const ctx = `seed ${seed}`;
      expect(d.docks.length, ctx).toBe(1);
      const dk = d.docks[0];
      expect(heightAt(d.w.height, dk.x, dk.z), `${ctx} pier root`).toBeLessThanOrEqual(1.5);
      const lee =
        (dk.x - d.isl.cx) * Math.cos(d.w.windDir) + (dk.z - d.isl.cz) * Math.sin(d.w.windDir);
      expect(lee, `${ctx} pier on the leeward side`).toBeGreaterThan(0);
      if (!d.vessel) continue;
      moored++;
      expect(heightAt(d.w.height, d.vessel.x, d.vessel.z), `${ctx} vessel afloat`).toBeLessThan(
        -RESEARCH_SITE.vessel.minDepth,
      );
      const L = dk.segments * 2;
      expect(
        Math.hypot(d.vessel.x - dk.x, d.vessel.z - dk.z),
        `${ctx} vessel by the pier`,
      ).toBeLessThan(L + 6);
    }
    expect(moored / n, 'vessel moored').toBeGreaterThanOrEqual(0.9);
  });

  it('connected: the quad hub reaches the pier; the quad is paved', () => {
    for (const seed of SEEDS) {
      const d = research(seed);
      if (!d?.settlement) continue;
      const s = d.settlement;
      expect(s.hub.node, `seed ${seed} hub`).toBeGreaterThanOrEqual(0);
      const seen = reachable(d.w, s.hub.node);
      for (const di of s.docks) expect(seen[d.w.docks[di].node], `seed ${seed} dock`).toBe(1);
      const p = s.plaza;
      if (!p) continue;
      const h = d.w.height;
      const zi =
        Math.round((p.z - h.originZ) / h.cellSize) * h.n +
        Math.round((p.x - h.originX) / h.cellSize);
      expect(d.w.zone[zi], `seed ${seed} quad paving`).toBe(Zone.plaza);
    }
  });

  it('lush but readable: park trees in every campus, crystals only on the walls, buoys afloat', () => {
    let n = 0;
    let withBuoys = 0;
    let allTrees = 0;
    for (const seed of SEEDS) {
      const d = research(seed);
      if (!d) continue;
      n++;
      const ctx = `seed ${seed}`;
      const p = d.w.props;
      let trees = 0;
      let buoys = 0;
      for (let i = 0; i < p.count; i++) {
        if (p.islandId[i] !== d.isl.id) continue;
        const id = PROP_DEFS[p.defId[i]].id;
        if (id === 'roundTree' || id === 'pine' || id === 'palm') trees++;
        if (id === 'crystalCluster') {
          const h = d.w.height;
          const zi =
            Math.round((p.z[i] - h.originZ) / h.cellSize) * h.n +
            Math.round((p.x[i] - h.originX) / h.cellSize);
          expect([Zone.rock, Zone.cliff], `${ctx} crystal on a wall`).toContain(d.w.zone[zi]);
        }
        if (id === 'instrumentBuoy') {
          buoys++;
          expect(p.y[i], `${ctx} buoy at the waterline`).toBe(0);
          expect(heightAt(d.w.height, p.x[i], p.z[i]), `${ctx} buoy over water`).toBeLessThan(0);
        }
      }
      expect(trees, `${ctx} park trees`).toBeGreaterThanOrEqual(2);
      allTrees += trees;
      if (buoys > 0) withBuoys++;
    }
    expect(allTrees / n, 'park trees on average').toBeGreaterThanOrEqual(5);
    expect(withBuoys / n, 'instrument buoys').toBeGreaterThanOrEqual(0.8);
  });
});
