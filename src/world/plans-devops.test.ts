import { describe, expect, it } from 'vitest';
import { PROP_DEFS } from '../content/props.ts';
import { FIXTURE_RADIUS, FLATTEN } from '../content/settlements.ts';
import { DEVOPS_CULTURE, DEVOPS_CULTURE_SITE } from '../content/cultures/devops.ts';
import { DEVOPS_SITE, DEVOPS_THEME, FUMAROLE_ZONES } from '../content/themes/devops.ts';
import { leewardness } from './gen/heightfield.ts';
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
import { THEME_IDS } from './types.ts';

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

  it('terraced data center (TASK-405): data centers on two shelf levels, level concrete pads', () => {
    let n = 0;
    let ok = 0;
    let two = 0;
    const T = DEVOPS_SITE.terraces;
    for (const seed of SEEDS) {
      const d = devops(seed);
      if (!d) continue;
      n++;
      const ter = d.districts.filter((x) => x.kind === 'terrace');
      if (ter.length >= 2) ok++;
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
      // the shelf step survives the flatten relaxation: two levels ≥ 2.5 u apart
      if (levels.length >= 2 && Math.max(...levels) - Math.min(...levels) >= 2.5) two++;
    }
    expect(rate(ok, n), 'data centers').toBeGreaterThanOrEqual(0.9);
    expect(rate(two, n), 'two levels').toBeGreaterThanOrEqual(0.8);
  });

  it('pipes: plant → data center, and a steam main from a cone vent to a tower, on land', () => {
    let n = 0;
    let ok = 0;
    let mains = 0;
    for (const seed of SEEDS) {
      const d = devops(seed);
      if (!d) continue;
      n++;
      const pipes = d.fences.filter((f) => f.kind === 'pipe');
      const towers = d.fixtures.filter((f) => f.defId === 'coolingTower');
      const vents = d.fixtures.filter((f) => f.defId === 'steamVent');
      const dcs = d.lots.filter((l) => l.defId === 'dataCenter');
      // plant → data center, the steam main and (density pass) the foundry's steam main
      expect(pipes.length, `seed ${seed}`).toBeLessThanOrEqual(3);
      const nearTower = (p: XZ): boolean =>
        Math.min(...towers.map((t) => dist(t, p))) <= DEVOPS_SITE.plant.radius + 1;
      for (const pipe of pipes) {
        const pts = pipe.points;
        const ctx = `seed ${seed} pipe`;
        expect(pts.length, ctx).toBeGreaterThanOrEqual(2);
        for (const p of pts)
          expect(
            sampleGrid(d.w.height, d.w.shoreSdf, p.x, p.z, -999),
            `${ctx} on land`,
          ).toBeGreaterThan(0.5);
        const a = pts[0];
        const b = pts[pts.length - 1];
        // plant → data center: starts at a tower, ends ≤ 0.8 u past a data center side
        if (
          nearTower(a) &&
          dcs.some((l) => shapeDist(lotShape(l), b.x, b.z) <= 0.8 * Math.SQRT2 + 1e-6)
        )
          ok++;
        // steam main: starts beside a vent high on the cone, ends at a tower
        else if (vents.some((v) => dist(v, a) <= 1.5) && nearTower(b)) {
          mains++;
          const v = vents.find((q) => dist(q, a) <= 1.5) as XZ;
          expect(heightAt(d.w.height, v.x, v.z), `${ctx} vent height`).toBeGreaterThan(
            DEVOPS_SITE.steam.ventY[0] - 3,
          );
        }
      }
    }
    expect(rate(ok, n), 'pipeline').toBeGreaterThanOrEqual(0.85);
    // TASK-471 re-roll: 22 / 30
    expect(rate(mains, n), 'steam main').toBeGreaterThanOrEqual(0.7);
  });

  it('rack yard (build halls) by the dock, on black sand or the paved quay; ops quad is the plaza', () => {
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
      // black sand (or, TASK-405, the paved harbour quay) inside the yard rect
      let black = 0;
      for (let u = -0.5; u <= 0.5; u += 0.1)
        for (let v = -0.5; v <= 0.5; v += 0.1) {
          const c = Math.cos(yard.rotY);
          const sn = Math.sin(yard.rotY);
          const x = yard.x - u * yard.w * sn + v * yard.d * c;
          const z = yard.z + u * yard.w * c + v * yard.d * sn;
          const zn = zoneAt(d.w.height, d.w.zone, x, z);
          if (zn === Zone.sandBlack || zn === Zone.plaza) black++;
        }
      if (sheds.length > 0 && black > 0) yards++;
    }
    expect(rate(yards, n), 'rack yard').toBeGreaterThanOrEqual(0.8);
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
        expect(
          [
            'coolingTower',
            'rackRow',
            'buoy',
            'steamVent',
            'containerYard',
            'conveyor',
            'foundry',
            'smithy',
            'cottage',
            // density pass: quay stock and machinery, village rack sheds
            'containerRow',
            'fuelTank',
            'forklift',
            'crate',
            'cableSpool',
            'lanternPost',
            'rackShed',
            // TASK-422 Ember Smiths kit + imported cargo crates
            ...DEVOPS_CULTURE.kit.map((k) => k.id),
            'cargoCrate',
            // M22 (TASK-482): D11 basalt column clusters
            'basaltBoulder',
          ],
          ctx,
        ).toContain(f.defId);
      for (const f of d.fences) expect(['pipe', 'rail'], ctx).toContain(f.kind);
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

/** TASK-405 "Ember Works": the shelves and the harbour / foundry facilities over 30 seeds. */
describe('DevOps Ember Works (TASK-405) — 30 seeds', () => {
  it('shelf anchors; land stays inside the reach disc', { timeout: 60_000 }, () => {
    for (const seed of SEEDS) {
      const d = devops(seed);
      if (!d) continue;
      for (const k of ['harbour', 'foundry', 'foundryUpper', 'datacenter', 'datacenterUpper'])
        expect(d.isl.anchors[k], `seed ${seed} ${k}`).toBeDefined();
      const { n, cellSize, originX, originZ } = d.w.height;
      for (let i = 0; i < d.w.islandMap.length; i++) {
        if (d.w.islandMap[i] !== d.isl.id + 1) continue;
        const x = originX + (i % n) * cellSize;
        const z = originZ + Math.floor(i / n) * cellSize;
        expect(Math.hypot(x - d.isl.cx, z - d.isl.cz), `seed ${seed}`).toBeLessThanOrEqual(
          d.isl.reach,
        );
      }
    }
  });

  it('harbour: the container yard on the paved quay, the pier and a CI/CD belt beside it', () => {
    let n = 0;
    let yards = 0;
    let belts = 0;
    for (const seed of SEEDS) {
      const d = devops(seed);
      if (!d) continue;
      n++;
      const port = d.isl.anchors.harbour;
      const yard = d.fixtures.find((f) => f.defId === 'containerYard');
      if (!yard) continue;
      yards++;
      const ctx = `seed ${seed} yard`;
      expect(dist(yard, port), ctx).toBeLessThanOrEqual(26);
      expect(zoneAt(d.w.height, d.w.zone, yard.x, yard.z), ctx).toBe(Zone.plaza);
      expect(heightAt(d.w.height, yard.x, yard.z), ctx).toBeLessThanOrEqual(
        DEVOPS_SITE.harbour.maxY,
      );
      const dock = d.w.docks.find((k) => k.islandId === d.isl.id);
      expect(dock, ctx).toBeDefined();
      if (dock) expect(dist(dock, port), `${ctx} pier`).toBeLessThanOrEqual(30);
      if (d.fixtures.some((f) => f.defId === 'conveyor')) belts++;
    }
    expect(rate(yards, n), 'container yard').toBeGreaterThanOrEqual(0.9);
    expect(rate(belts, n), 'CI/CD belt').toBeGreaterThanOrEqual(0.7);
  });

  it('foundry: furnace on the upper step, a level rail below it, smithies and lodges', () => {
    let n = 0;
    let full = 0;
    for (const seed of SEEDS) {
      const d = devops(seed);
      if (!d) continue;
      n++;
      const furnaces = d.fixtures.filter((f) => f.defId === 'foundry');
      const rail = d.fences.find((f) => f.kind === 'rail');
      const smithies = d.fixtures.filter((f) => f.defId === 'smithy');
      const lodges = d.fixtures.filter((f) => f.defId === 'cottage');
      if (!rail || furnaces.length === 0) continue;
      const ctx = `seed ${seed} rail`;
      const [a, b] = [rail.points[0], rail.points[rail.points.length - 1]];
      const L = dist(a, b);
      expect(L, ctx).toBeGreaterThanOrEqual(DEVOPS_SITE.foundry.rail[0] - 1e-6);
      // level along its run (pads every few u), and below the furnace step
      const ys: number[] = [];
      for (let t = 0; t <= 1; t += 0.1)
        ys.push(heightAt(d.w.height, a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t));
      expect(Math.max(...ys) - Math.min(...ys), `${ctx} level`).toBeLessThanOrEqual(1.5);
      const fy = Math.max(...furnaces.map((f) => heightAt(d.w.height, f.x, f.z)));
      expect(fy - ys[5], `${ctx} step`).toBeGreaterThanOrEqual(2.5);
      if (smithies.length >= 1 && lodges.length >= 1) full++;
    }
    expect(rate(full, n), 'foundry village').toBeGreaterThanOrEqual(0.85);
  });
});

/** TASK-422 "Kor Demircileri" (Ember Smiths): the culture kit placed on Ember Works, 30 seeds. */
describe('DevOps Ember Smiths culture (TASK-422) — 30 seeds', () => {
  const C = DEVOPS_CULTURE_SITE;
  const KIT = new Set([...DEVOPS_CULTURE.kit.map((k) => k.id), 'cargoCrate']);
  /** [min, max] per def on one island; `share` = fraction of seeds with at least one. */
  const RANGES: Record<string, { n: [number, number]; share: number }> = {
    onsenDeck: { n: [0, 1], share: 0.95 },
    onsenHouse: { n: [0, 1], share: 0.85 },
    // + the D12 switchback road lanterns on the cone (M22 TASK-482)
    lavaLantern: {
      n: [0, C.lanterns.quayMax + C.lanterns.railMax + DEVOPS_SITE.switchback.maxLanterns],
      share: 0.95,
    },
    ingotStack: { n: [0, C.ingots.count[1]], share: 0.9 },
    anvil: { n: [0, C.anvils.max], share: 0.9 },
    incidentSign: { n: [0, 1], share: 0.9 },
    signalHorn: { n: [0, 2], share: 0.9 },
    serverShrine: { n: [0, 1], share: 0.9 },
    pipeValveWheel: { n: [0, C.valves.max], share: 0.9 },
    pagerRock: { n: [0, 1], share: 0.9 },
    cargoCrate: { n: [0, C.crates.piles.reduce((a, p) => a + p.n, 0)], share: 0.9 },
  };

  it('kit placed: counts per def within range; foundry v1 (forge bell) leads', () => {
    let n = 0;
    const hits: Record<string, number> = {};
    for (const seed of SEEDS) {
      const d = devops(seed);
      if (!d) continue;
      n++;
      for (const [id, R] of Object.entries(RANGES)) {
        const k = d.fixtures.filter((f) => f.defId === id).length;
        expect(k, `seed ${seed} ${id}`).toBeGreaterThanOrEqual(R.n[0]);
        expect(k, `seed ${seed} ${id}`).toBeLessThanOrEqual(R.n[1]);
        if (k > 0) hits[id] = (hits[id] ?? 0) + 1;
      }
      const halls = d.fixtures.filter((f) => f.defId === 'foundry');
      halls.forEach((h, k) =>
        expect(h.variant, `seed ${seed} hall ${k}`).toBe(k === 0 ? C.forgeBellVariant : 0),
      );
      // crates: QA and HQ imports (cargoCrate variant = THEME_IDS index)
      for (const f of d.fixtures.filter((x) => x.defId === 'cargoCrate'))
        expect(['qa', 'hq'], `seed ${seed}`).toContain(THEME_IDS[f.variant ?? -1]);
      // incident sign shows 42 days
      for (const f of d.fixtures.filter((x) => x.defId === 'incidentSign'))
        expect(f.variant, `seed ${seed}`).toBe(C.incident.variant);
    }
    for (const [id, R] of Object.entries(RANGES))
      expect(rate(hits[id] ?? 0, n), id).toBeGreaterThanOrEqual(R.share);
  });

  it('ingots cool away from the furnace mouth; the onsen deck faces its pool', () => {
    for (const seed of SEEDS) {
      const d = devops(seed);
      if (!d) continue;
      const ctx = `seed ${seed}`;
      const ingots = d.fixtures.filter((f) => f.defId === 'ingotStack');
      const halls = d.fixtures.filter((f) => f.defId === 'foundry');
      if (ingots.length > 0) {
        // one row beside one hall: variants never decrease along it (hot v0 → cooled v2)
        const hall = halls.reduce((a, b) => (dist(b, ingots[0]) < dist(a, ingots[0]) ? b : a));
        const vs = ingots.map((f) => f.variant ?? -1);
        expect(vs[0], ctx).toBe(0);
        for (let k = 1; k < vs.length; k++) {
          expect(vs[k], ctx).toBeGreaterThanOrEqual(vs[k - 1]);
          expect(dist(ingots[k], hall), ctx).toBeGreaterThan(dist(ingots[k - 1], hall));
        }
        if (vs.length >= 3) expect(vs[vs.length - 1], ctx).toBe(2);
      }
      const pool = d.landmarks.find((l) => l.kind === 'hotSpring') as XZ;
      for (const f of d.fixtures.filter((x) => x.defId === 'onsenDeck')) {
        expect(dist(f, pool), ctx).toBeLessThanOrEqual(Math.max(...C.onsen.deckOff) + 1e-6);
        // local +z (the water side) points at the pool centre
        const f2 = { x: Math.cos(f.rotY), z: Math.sin(f.rotY) };
        const u = { x: (pool.x - f.x) / dist(f, pool), z: (pool.z - f.z) / dist(f, pool) };
        expect(f2.x * u.x + f2.z * u.z, ctx).toBeGreaterThan(0.99);
      }
      for (const f of d.fixtures.filter((x) => x.defId === 'onsenHouse'))
        expect(dist(f, pool), ctx).toBeLessThanOrEqual(C.onsen.houseRing[1] + 1);
    }
  });

  it('everything on land and level: kit props sit on their own level ground', () => {
    for (const seed of SEEDS) {
      const d = devops(seed);
      if (!d) continue;
      for (const f of d.fixtures) {
        if (!KIT.has(f.defId)) continue;
        const ctx = `seed ${seed} ${f.defId} @${f.x.toFixed(1)},${f.z.toFixed(1)}`;
        const y0 = heightAt(d.w.height, f.x, f.z);
        expect(y0, `${ctx} on land`).toBeGreaterThan(0.3);
        const i = Math.round((f.z - d.w.height.originZ) / d.w.height.cellSize);
        const j = Math.round((f.x - d.w.height.originX) / d.w.height.cellSize);
        expect(d.w.islandMap[i * d.w.height.n + j], `${ctx} island`).toBe(d.isl.id + 1);
        // the onsen deck / house: their pads (rect cores) are flat
        if (f.defId === 'onsenDeck' || f.defId === 'onsenHouse') {
          const [w, dd] = f.defId === 'onsenDeck' ? C.onsen.deck : C.onsen.house;
          for (const p of shapeCorners(rectShape(f.x, f.z, f.rotY, w, dd)))
            expect(Math.abs(heightAt(d.w.height, p.x, p.z) - y0), ctx).toBeLessThanOrEqual(0.5);
          continue;
        }
        // small props: ≤ 0.7 u relief round their footprint (the valve straddles a pipe slope: 1.2)
        const r = FIXTURE_RADIUS[f.defId];
        const ys = [0, 1, 2, 3, 4, 5, 6, 7].map((k) =>
          heightAt(d.w.height, f.x + Math.cos(k * 0.785) * r, f.z + Math.sin(k * 0.785) * r),
        );
        const rel = Math.max(y0, ...ys) - Math.min(y0, ...ys);
        expect(rel, ctx).toBeLessThanOrEqual(f.defId === 'pipeValveWheel' ? 1.25 : 0.7);
      }
    }
  });

  it('story spots: ≥ 5 per island, ledger kinds once each, on the island', () => {
    const kinds = new Set(DEVOPS_CULTURE.storySpots.map((s) => s.kind));
    for (const seed of SEEDS) {
      const d = devops(seed);
      if (!d) continue;
      const st = d.w.storySpots.filter((s) => s.islandId === d.isl.id);
      expect(st.length, `seed ${seed}`).toBeGreaterThanOrEqual(5);
      expect(new Set(st.map((s) => s.kind)).size, `seed ${seed} unique`).toBe(st.length);
      for (const s of st) {
        const ctx = `seed ${seed} ${s.kind}`;
        expect(kinds.has(s.kind), ctx).toBe(true);
        expect(s.defs.length, ctx).toBeGreaterThan(0);
        expect(dist(s.pos, d.isl.anchors.crater ?? s.pos), ctx).toBeLessThanOrEqual(d.isl.reach);
        expect(s.pos.y, ctx).toBeGreaterThanOrEqual(heightAt(d.w.height, s.pos.x, s.pos.z) - 1e-6);
      }
    }
  });
});

/** M22 quick wins (TASK-482, WORLD_PLAN §4.4, D-062 R3-13) over the same 30 seeds. */
describe('DevOps M22 quick wins (TASK-482) — 30 seeds', () => {
  const S = DEVOPS_SITE;

  it('D5: one summit watch tower (antennaMast v2) replaces the rim masts; R3-13: every lodge is an ops shack', () => {
    for (const seed of SEEDS) {
      const d = devops(seed);
      if (!d) continue;
      const ctx = `seed ${seed}`;
      const masts = d.lots.filter((l) => l.defId === 'antennaMast');
      expect(masts.length, ctx).toBe(1);
      expect(masts[0].variant, ctx).toBe(S.ridge.towerVariant);
      expect(heightAt(d.w.height, masts[0].x, masts[0].z), ctx).toBeGreaterThanOrEqual(
        S.ridge.minY,
      );
      const lodges = d.fixtures.filter((f) => f.defId === 'cottage');
      expect(lodges.length, ctx).toBeGreaterThan(0);
      for (const f of lodges) expect(f.variant, ctx).toBe(S.lodgeVariant);
    }
  });

  it('D8: three fumarole pool zones in a salt rim on the cone; D11: windward basalt column clusters', () => {
    let pools = 0;
    let n = 0;
    for (const seed of SEEDS) {
      const d = devops(seed);
      if (!d) continue;
      n++;
      const ctx = `seed ${seed}`;
      const seen = new Set<number>();
      let rim = 0;
      for (let i = 0; i < d.w.islandMap.length; i++) {
        if (d.w.islandMap[i] !== d.isl.id + 1) continue;
        const z = d.w.zone[i];
        if ((FUMAROLE_ZONES.pools as readonly number[]).includes(z)) {
          seen.add(z);
          expect(d.w.height.data[i], `${ctx} pool on land`).toBeGreaterThan(0);
        }
        if (z === FUMAROLE_ZONES.rim) rim++;
      }
      if (seen.size === 3 && rim > 0) pools++;
      const cols = d.fixtures.filter(
        (f) => f.defId === 'basaltBoulder' && f.variant === S.columns.variant,
      );
      expect(cols.length, ctx).toBeGreaterThanOrEqual(3);
      for (const f of cols) {
        expect(heightAt(d.w.height, f.x, f.z), ctx).toBeGreaterThan(0);
        expect(leewardness(d.isl, d.w.windDir, f.x, f.z), ctx).toBeLessThanOrEqual(
          S.columns.maxLee + 0.15,
        );
      }
    }
    expect(rate(pools, n)).toBeGreaterThanOrEqual(0.95);
  });

  it('D12: switchback roads from the tower in >= 2 directions, painted, lantern-lit on the cone', () => {
    for (const seed of SEEDS) {
      const d = devops(seed);
      if (!d) continue;
      const ctx = `seed ${seed}`;
      const tower = d.lots.find((l) => l.defId === 'antennaMast')!;
      const top = heightAt(d.w.height, tower.x, tower.z);
      const stairs = d.w.paths.filter((p) => p.islandId === d.isl.id && p.kind === 'stair');
      // the roads reach down the cone in at least two quadrants round the crater
      const centre = d.isl.anchors.crater ?? { x: d.isl.cx, z: d.isl.cz };
      const heads = new Set<number>();
      for (const p of stairs)
        for (const q of p.points)
          if (heightAt(d.w.height, q.x, q.z) < top - 12)
            heads.add(Math.round((Math.atan2(q.z - centre.z, q.x - centre.x) / Math.PI) * 2));
      expect(heads.size, ctx).toBeGreaterThanOrEqual(2);
      let road = 0;
      for (let i = 0; i < d.w.islandMap.length; i++)
        if (d.w.islandMap[i] === d.isl.id + 1 && d.w.zone[i] === Zone.streetDevops) road++;
      expect(road, ctx).toBeGreaterThan(30);
      const lit = d.fixtures.filter(
        (f) => f.defId === 'lavaLantern' && heightAt(d.w.height, f.x, f.z) >= S.switchback.minY,
      );
      expect(lit.length, ctx).toBeGreaterThanOrEqual(8);
    }
  });
});
