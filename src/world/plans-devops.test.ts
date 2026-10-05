import { describe, expect, it } from 'vitest';
import { PROP_DEFS } from '../content/props.ts';
import { FLATTEN } from '../content/settlements.ts';
import { DEVOPS_SITE, DEVOPS_THEME } from '../content/themes/devops.ts';
import {
  generateWorld,
  heightAt,
  sampleGrid,
  zoneAt,
  Zone,
  type WorldData,
  type XZ,
} from './index.ts';
import { lotShape, rectShape, shapeCorners, shapeDist } from './gen/sites.ts';

/** DevOps island plan (M14b §2.3, TASK-364) over 30 seeds. */
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

const dist = (a: XZ, b: XZ): number => Math.hypot(a.x - b.x, a.z - b.z);

/** Per-seed facts of the DevOps island (null when the roster has no Emberpeak). */
function devops(seed: number) {
  const w = world(seed);
  const isl = w.islands.find((i) => i.theme === 'devops');
  if (!isl) return null;
  const on = <T extends { islandId: number }>(a: readonly T[]): T[] =>
    a.filter((x) => x.islandId === isl.id);
  const lots = on(w.lots);
  return {
    w,
    isl,
    lots,
    landmarks: on(w.landmarks),
    fixtures: on(w.fixtures),
    fences: on(w.fences),
    districts: on(w.districts),
    settlement: w.settlements.find((s) => s.islandId === isl.id),
  };
}

const rate = (hits: number, n: number): number => hits / n;

describe('DevOps island plan (TASK-364) — 30 seeds', () => {
  it(
    'landmarks: volcano crater, cooling pool and two cooling towers beside it',
    { timeout: 60_000 },
    () => {
      let n = 0;
      let towers2 = 0;
      for (const seed of SEEDS) {
        const d = devops(seed);
        if (!d) continue;
        n++;
        const kinds = d.landmarks.map((l) => l.kind);
        expect(kinds, `seed ${seed}`).toContain('volcanoCrater');
        expect(kinds, `seed ${seed}`).toContain('hotSpring');
        const pool = d.landmarks.find((l) => l.kind === 'hotSpring') as XZ;
        const towers = d.fixtures.filter((f) => f.defId === 'coolingTower');
        for (const t of towers)
          expect(dist(t, pool), `seed ${seed} tower`).toBeLessThanOrEqual(
            DEVOPS_SITE.plant.ring[1] + 0.5,
          );
        if (towers.length === 2) towers2++;
      }
      expect(n).toBeGreaterThan(20);
      expect(rate(towers2, n), 'two cooling towers').toBeGreaterThanOrEqual(0.9);
      // the T0 landmark defs exist (structures draw from T0)
      expect(PROP_DEFS.find((p) => p.id === 'coolingTower')?.tier).toBe(0);
    },
  );

  it('lots: ≥ 4 in ≥ 90 % of seeds; 2–3 antenna masts; only DevOps defs', () => {
    let n = 0;
    let four = 0;
    let masts = 0;
    for (const seed of SEEDS) {
      const d = devops(seed);
      if (!d) continue;
      n++;
      if (d.lots.length >= 4) four++;
      const m = d.lots.filter((l) => l.defId === 'antennaMast');
      if (m.length >= DEVOPS_SITE.ridge.count[0] && m.length <= DEVOPS_SITE.ridge.count[1]) masts++;
      for (const l of m)
        expect(heightAt(d.w.height, l.x, l.z), `seed ${seed} mast height`).toBeGreaterThan(
          DEVOPS_SITE.ridge.minY - 3,
        );
      for (const l of d.lots)
        expect(['dataCenter', 'rackShed', 'antennaMast'], `seed ${seed}`).toContain(l.defId);
    }
    expect(rate(four, n), 'lot minimum').toBeGreaterThanOrEqual(0.9);
    expect(rate(masts, n), 'antenna ridge').toBeGreaterThanOrEqual(0.9);
  });

  it('terraced data center: ≥ 3 level concrete pads stepping along the flank', () => {
    let n = 0;
    let ok = 0;
    const T = DEVOPS_SITE.terraces;
    for (const seed of SEEDS) {
      const d = devops(seed);
      if (!d) continue;
      n++;
      const ter = d.districts.filter((x) => x.kind === 'terrace');
      if (ter.length >= T.count[0]) ok++;
      const levels: number[] = [];
      for (const t of ter) {
        const ctx = `seed ${seed} terrace @${t.x.toFixed(1)},${t.z.toFixed(1)}`;
        const lot = d.lots.find((l) => l.defId === 'dataCenter' && dist(l, t) < 0.01);
        expect(lot, ctx).toBeDefined();
        if (!lot) continue;
        // the pad is level: the data center footprint (its flat bilinear core) within
        // FLATTEN.maxStep of the centre; the concrete apron around it blends into the falloff
        const y0 = heightAt(d.w.height, t.x, t.z);
        for (const p of shapeCorners(lotShape(lot)))
          expect(Math.abs(heightAt(d.w.height, p.x, p.z) - y0), ctx).toBeLessThanOrEqual(
            FLATTEN.maxStep,
          );
        // the district is the footprint + apron, centred on the lot
        expect(t.w, ctx).toBeCloseTo(lot.w + 2 * T.apron, 5);
        expect(t.d, ctx).toBeCloseTo(lot.d + 2 * T.apron, 5);
        // concrete pad zone written explicitly (lot centre; doors may be path)
        expect(zoneAt(d.w.height, d.w.zone, t.x, t.z), ctx).toBe(Zone.plaza);
        levels.push(y0);
      }
      // top first; each next pad a real step lower (pads never relaxed into one plateau)
      for (let k = 1; k < levels.length; k++)
        expect(levels[k - 1] - levels[k], `seed ${seed} step ${k}`).toBeGreaterThanOrEqual(
          T.rise[0] - 0.5,
        );
    }
    expect(rate(ok, n), 'terraces').toBeGreaterThanOrEqual(0.9);
  });

  it('pipeline: a pipe polyline from a cooling tower to a data center, on land', () => {
    let n = 0;
    let ok = 0;
    for (const seed of SEEDS) {
      const d = devops(seed);
      if (!d) continue;
      n++;
      const pipes = d.fences.filter((f) => f.kind === 'pipe');
      const towers = d.fixtures.filter((f) => f.defId === 'coolingTower');
      const dcs = d.lots.filter((l) => l.defId === 'dataCenter');
      if (pipes.length === 0) continue;
      expect(pipes.length, `seed ${seed}`).toBe(1);
      const pts = pipes[0].points;
      const ctx = `seed ${seed} pipe`;
      expect(pts.length, ctx).toBeGreaterThanOrEqual(2);
      const a = pts[0];
      const b = pts[pts.length - 1];
      expect(Math.min(...towers.map((t) => dist(t, a))), `${ctx} start`).toBeLessThanOrEqual(
        DEVOPS_SITE.plant.radius + 1,
      );
      // ends just outside a data center footprint (≤ 0.8 u past its side)
      expect(
        Math.min(...dcs.map((l) => shapeDist(lotShape(l), b.x, b.z))),
        `${ctx} end`,
      ).toBeLessThanOrEqual(0.8 * Math.SQRT2 + 1e-6);
      for (const p of pts)
        expect(
          sampleGrid(d.w.height, d.w.shoreSdf, p.x, p.z, -999),
          `${ctx} on land`,
        ).toBeGreaterThan(0.5);
      ok++;
    }
    expect(rate(ok, n), 'pipeline').toBeGreaterThanOrEqual(0.9);
  });

  it('rack yard by the dock, on black sand; ops quad is the plaza', () => {
    let n = 0;
    let yards = 0;
    let quads = 0;
    for (const seed of SEEDS) {
      const d = devops(seed);
      if (!d) continue;
      n++;
      const s = d.settlement;
      expect(s, `seed ${seed}`).toBeDefined();
      if (s?.plaza) {
        quads++;
        expect(zoneAt(d.w.height, d.w.zone, s.plaza.x, s.plaza.z), `seed ${seed}`).toBe(Zone.plaza);
      }
      const yard = d.districts.find((x) => x.kind === 'yard');
      if (!yard) continue;
      const sheds = d.lots.filter((l) => l.defId === 'rackShed');
      const racks = d.fixtures.filter((f) => f.defId === 'rackRow');
      const sh = rectShape(yard.x, yard.z, yard.rotY, yard.w, yard.d);
      for (const p of [...sheds, ...racks])
        expect(shapeDist(sh, p.x, p.z), `seed ${seed} yard piece`).toBeLessThanOrEqual(0);
      // black sand inside the yard rect
      let black = 0;
      for (let u = -0.5; u <= 0.5; u += 0.1)
        for (let v = -0.5; v <= 0.5; v += 0.1) {
          const c = Math.cos(yard.rotY);
          const sn = Math.sin(yard.rotY);
          const x = yard.x - u * yard.w * sn + v * yard.d * c;
          const z = yard.z + u * yard.w * c + v * yard.d * sn;
          if (zoneAt(d.w.height, d.w.zone, x, z) === Zone.sandBlack) black++;
        }
      if (sheds.length > 0 && black > 0) yards++;
    }
    expect(rate(yards, n), 'rack yard').toBeGreaterThanOrEqual(0.85);
    expect(rate(quads, n), 'ops quad').toBe(1);
  });

  it('all connected: every lot and the dock reach the hub through the path graph', () => {
    for (const seed of SEEDS) {
      const d = devops(seed);
      if (!d?.settlement) continue;
      const s = d.settlement;
      expect(s.hub.node, `seed ${seed}`).toBeGreaterThanOrEqual(0);
      const seen = reachable(d.w, s.hub.node);
      for (const li of s.lots) {
        const l = d.w.lots[li];
        expect(seen[l.node], `seed ${seed} ${l.defId} unreachable`).toBe(1);
      }
      expect(s.lots.length, `seed ${seed} every island lot is in the settlement`).toBe(
        d.lots.length,
      );
      for (const di of s.docks) expect(seen[d.w.docks[di].node], `seed ${seed} dock`).toBe(1);
    }
  });

  it('leftover audit: no farm / village / spa defs, no fences, no upper forest, no field hues', () => {
    const banned = new Set([
      'palm',
      'roundTree',
      'rockCluster',
      'flower',
      'cropRow',
      'haybale',
      'giantMushroom',
    ]);
    const pineMax = Math.max(
      ...DEVOPS_THEME.scatter.filter((r) => r.def === 'pine').map((r) => r.heights[1]),
    );
    for (const seed of SEEDS) {
      const d = devops(seed);
      if (!d) continue;
      const ctx = `seed ${seed}`;
      for (const l of d.landmarks) expect(['volcanoCrater', 'hotSpring'], ctx).toContain(l.kind);
      for (const f of d.fixtures)
        expect(['coolingTower', 'rackRow', 'buoy'], ctx).toContain(f.defId);
      for (const f of d.fences) expect(f.kind, ctx).toBe('pipe');
      const p = d.w.props;
      for (let i = 0; i < p.count; i++) {
        if (p.islandId[i] !== d.isl.id) continue;
        const id = PROP_DEFS[p.defId[i]].id;
        expect(banned.has(id), `${ctx} ${id}`).toBe(false);
        if (id === 'pine') expect(p.y[i], `${ctx} pine height`).toBeLessThanOrEqual(pineMax);
      }
      for (let i = 0; i < d.w.islandMap.length; i++)
        if (d.w.islandMap[i] === d.isl.id + 1) expect(d.w.fieldColor[i], ctx).toBe(0);
    }
  });
});
