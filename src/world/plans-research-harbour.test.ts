import { describe, expect, it } from 'vitest';
import { HARBOURS } from '../content/harbours.ts';
import { DOCK, ROUTES } from '../content/settlements.ts';
import { RESEARCH_HARBOUR as R } from '../content/themes/research-harbour.ts';
import { RESEARCH_SITE } from '../content/themes/research.ts';
import { anchorPoints } from './gen/plans/research-anchors.ts';
import { RUIN_KINDS } from './gen/plans/research-harbour.ts';
import { rectShape, shapeDist } from './gen/sites.ts';
import {
  generateWorld,
  heightAt,
  planWhaleRoute,
  sampleGrid,
  Zone,
  type WorldData,
  type XZ,
} from './index.ts';

/** Research Tide-Lab harbour on the harbour skeleton (TASK-532, D-113) — 30 seeds. */
const SEEDS = Array.from({ length: 30 }, (_, k) => 1000 + k * 263);
const P = HARBOURS.research as NonNullable<typeof HARBOURS.research>;
const C = R.city;
const cache = new Map<number, WorldData>();
const world = (seed: number): WorldData => {
  let w = cache.get(seed);
  if (!w) {
    w = generateWorld(seed);
    cache.set(seed, w);
  }
  return w;
};

const segDist = (p: XZ, a: XZ, b: XZ): number => {
  const vx = b.x - a.x;
  const vz = b.z - a.z;
  const l2 = vx * vx + vz * vz;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.z - a.z) * vz) / l2)) : 0;
  return Math.hypot(p.x - a.x - vx * t, p.z - a.z - vz * t);
};
const lineDist = (p: XZ, line: readonly XZ[]): number => {
  let d = Infinity;
  for (let k = 0; k + 1 < line.length; k++) d = Math.min(d, segDist(p, line[k], line[k + 1]));
  return d;
};

function harbour(seed: number) {
  const w = world(seed);
  const isl = w.islands.find((i) => i.theme === 'research');
  if (!isl) throw new Error(`seed ${seed}: no Research island`);
  const A = isl.anchors;
  const H = (p: XZ): number => heightAt(w.height, p.x, p.z);
  const sdf = (p: XZ): number => sampleGrid(w.height, w.shoreSdf, p.x, p.z, -999);
  const cell = (p: XZ): number =>
    Math.round((p.z - w.height.originZ) / w.height.cellSize) * w.height.n +
    Math.round((p.x - w.height.originX) / w.height.cellSize);
  const arm = anchorPoints(isl, 'harbourArm');
  const slots = RUIN_KINDS.flatMap((k) => anchorPoints(isl, k).map((p) => ({ ...p, kind: k })));
  const di = w.docks.findIndex((d) => d.islandId === isl.id);
  const routes = w.boatRoutes.flatMap((r) => r.points);
  return { w, isl, A, H, sdf, cell, arm, slots, di, routes };
}

const KEYS = [
  'harbourPier0',
  'harbourPier1',
  'harbourHeadSize',
  'ferryBerth',
  'harbourArmSize',
  'harbourLight',
  'harbourBasin',
  'harbourBasinSize',
  'harbourShelter',
  'harbourBooth',
  'harbourBoard',
  'tideLab',
  'tideLabSize',
  'tideLabPier0',
  'tideLabPier1',
  'subMooring',
  'subDive',
  'tideGauge',
  'sunkenCity',
  'sunkenCitySize',
] as const;

describe('Research harbour (TASK-532)', { timeout: 120_000 }, () => {
  it('every seed has the skeleton and Tide-Lab anchors', () => {
    for (const seed of SEEDS) {
      const { A, arm } = harbour(seed);
      for (const k of KEYS) expect(A[k], `seed ${seed} ${k}`).toBeDefined();
      expect(arm.length, `seed ${seed} arm points`).toBeGreaterThanOrEqual(10);
    }
  });

  it('the ferry pier is the island dock, the HQ ferry dwells at its T-head berth', () => {
    for (const seed of SEEDS) {
      const { w, A, di, H } = harbour(seed);
      const ctx = `seed ${seed}`;
      expect(di, ctx).toBeGreaterThanOrEqual(0);
      const d = w.docks[di];
      expect(Math.hypot(d.x - A.harbourPier0.x, d.z - A.harbourPier0.z), ctx).toBeLessThan(1e-6);
      expect(d.segments, ctx).toBeGreaterThanOrEqual(P.pier.minSegments);
      const L = d.segments * DOCK.segment;
      const end = { x: d.x + Math.cos(d.rotY) * L, z: d.z + Math.sin(d.rotY) * L };
      expect(Math.hypot(end.x - A.harbourPier1.x, end.z - A.harbourPier1.z), ctx).toBeLessThan(
        1e-6,
      );
      const ferries = w.boatRoutes.filter((r) => r.kind === 'ferry' && r.stops?.includes(di));
      expect(ferries.length, ctx).toBeGreaterThanOrEqual(1);
      for (const r of ferries) {
        const near = Math.min(
          ...r.points.map((p) => Math.hypot(p.x - A.ferryBerth.x, p.z - A.ferryBerth.z)),
        );
        expect(near, `${ctx} ferry → berth`).toBeLessThanOrEqual(4);
        const atEnd = Math.min(...r.points.map((p) => Math.hypot(p.x - end.x, p.z - end.z)));
        expect(atEnd, `${ctx} ferry → pier end`).toBeLessThanOrEqual(ROUTES.dockReach);
      }
      expect(H(A.ferryBerth), `${ctx} berth depth`).toBeLessThanOrEqual(-ROUTES.nodeDepth);
    }
  });

  it('the breakwater arm is land of the island, painted on the final ground, joined to the coast', () => {
    for (const seed of SEEDS) {
      const { w, isl, arm, H, cell, A } = harbour(seed);
      const ctx = `seed ${seed}`;
      // (the last point is the root on the coast)
      for (const p of arm.slice(0, -1)) {
        expect(H(p), `${ctx} crest`).toBeGreaterThan(0.6);
        expect(w.islandMap[cell(p)], `${ctx} crest island`).toBe(isl.id + 1);
      }
      // the crest line from the tip reaches the main body over land (4-connected flood)
      const n = w.height.n;
      const seen = new Uint8Array(n * n);
      const stack = [cell(arm[0])];
      seen[stack[0]] = 1;
      let reached = false;
      while (stack.length > 0 && !reached) {
        const c = stack.pop() as number;
        if (w.shoreSdf[c] > 6) reached = true;
        for (const j of [c - 1, c + 1, c - n, c + n])
          if (!seen[j] && w.islandMap[j] === isl.id + 1) {
            seen[j] = 1;
            stack.push(j);
          }
      }
      expect(reached, `${ctx} arm joined to the island`).toBe(true);
      // repainted on the final ground: rock armour / dry sand on the crest, the mole head rock
      // (the root's last points may lie on the old coast: its bluff keeps its cliff)
      const painted = arm.filter((p) => [Zone.rock, Zone.sandDry].includes(w.zone[cell(p)] as 11));
      expect(painted.length, `${ctx} crest zones`).toBeGreaterThanOrEqual(arm.length * 0.8);
      expect(w.zone[cell(arm[0])], `${ctx} mole head`).toBe(Zone.rock);
      // the light on the crest near the tip
      expect(H(A.harbourLight), ctx).toBeGreaterThan(0.6);
      expect(
        Math.hypot(A.harbourLight.x - arm[0].x, A.harbourLight.z - arm[0].z),
        ctx,
      ).toBeLessThan(2);
      // the arm keeps the T-head clear (the basin mouth)
      const headEnd = rectShape(
        A.harbourPier1.x,
        A.harbourPier1.z,
        A.harbourPier1.rotY,
        P.pier.head.w,
        P.pier.head.d,
      );
      expect(Math.min(...arm.map((p) => shapeDist(headEnd, p.x, p.z))), ctx).toBeGreaterThan(
        P.arm.mouth,
      );
    }
  });

  it('the basin and the berth are open water, the routes keep off pier, head and basin', () => {
    for (const seed of SEEDS) {
      const { A, H, routes } = harbour(seed);
      const ctx = `seed ${seed}`;
      const basin = rectShape(
        A.harbourBasin.x,
        A.harbourBasin.z,
        A.harbourBasin.rotY,
        A.harbourBasinSize.x,
        A.harbourBasinSize.z,
      );
      const head = rectShape(
        A.harbourPier1.x,
        A.harbourPier1.z,
        A.harbourPier1.rotY,
        P.pier.head.w,
        P.pier.head.d,
      );
      expect(H(basin), `${ctx} basin depth`).toBeLessThan(-1);
      for (const q of routes) {
        expect(shapeDist(basin, q.x, q.z), `${ctx} route in the basin`).toBeGreaterThan(0);
        expect(shapeDist(head, q.x, q.z), `${ctx} route over the T-head`).toBeGreaterThan(0);
        expect(
          segDist(q, A.harbourPier0, A.harbourPier1),
          `${ctx} route over the pier`,
        ).toBeGreaterThan(1);
      }
    }
  });

  it('kiosks stand on the cove land by the pier root, the gauge at the waterline', () => {
    for (const seed of SEEDS) {
      const { A, H, sdf } = harbour(seed);
      const ctx = `seed ${seed}`;
      for (const k of ['harbourShelter', 'harbourBooth', 'harbourBoard'] as const) {
        expect(sdf(A[k]), `${ctx} ${k} on land`).toBeGreaterThan(0.5);
        expect(
          Math.hypot(A[k].x - A.harbourPier0.x, A[k].z - A.harbourPier0.z),
          `${ctx} ${k}`,
        ).toBeLessThan(12);
      }
      expect(H(A.tideGauge), `${ctx} gauge`).toBeGreaterThan(0);
      expect(sdf(A.tideGauge), `${ctx} gauge`).toBeLessThanOrEqual(R.gauge.shore[1] + 0.3);
    }
  });

  it('the stilt lab stands over 1–2 u of water off the ferry approach, its pier from the coast', () => {
    for (const seed of SEEDS) {
      const { A, H, sdf, routes } = harbour(seed);
      const ctx = `seed ${seed}`;
      const lab = rectShape(
        A.tideLab.x,
        A.tideLab.z,
        A.tideLab.rotY,
        A.tideLabSize.x,
        A.tideLabSize.z,
      );
      expect(A.tideLabSize.x * A.tideLabSize.z, ctx).toBeGreaterThanOrEqual(28);
      for (let a = -2; a <= 2; a++)
        for (let b = -2; b <= 2; b++) {
          const u = (a / 2) * lab.hw;
          const v = (b / 2) * lab.hd;
          const p = { x: lab.x - u * lab.s + v * lab.c, z: lab.z + u * lab.c + v * lab.s };
          expect(-H(p), `${ctx} lab depth`).toBeGreaterThanOrEqual(R.lab.depth[0] - 0.05);
          expect(-H(p), `${ctx} lab depth`).toBeLessThanOrEqual(R.lab.depth[1] + 0.05);
        }
      expect(sdf(A.tideLabPier0), `${ctx} lab pier root`).toBeGreaterThan(0);
      for (const q of routes)
        expect(shapeDist(lab, q.x, q.z), `${ctx} route by the lab`).toBeGreaterThan(1.5);
    }
  });

  it('the submersible moors beside the vessel in the basin and dives over deep water', () => {
    for (const seed of SEEDS) {
      const { w, isl, A, H, routes } = harbour(seed);
      const ctx = `seed ${seed}`;
      const vessel = w.fixtures.find(
        (f) => f.islandId === isl.id && f.defId === RESEARCH_SITE.vessel.def,
      );
      expect(vessel, ctx).toBeDefined();
      const gap = Math.hypot(A.subMooring.x - (vessel?.x ?? 0), A.subMooring.z - (vessel?.z ?? 0));
      expect(gap, `${ctx} sub beside the vessel`).toBeLessThan(5);
      expect(H(A.subMooring), `${ctx} sub depth`).toBeLessThanOrEqual(-R.sub.minDepth);
      expect(H(A.subDive), `${ctx} dive depth`).toBeLessThanOrEqual(-R.dive.minDepth);
      for (const q of routes)
        expect(
          Math.hypot(q.x - A.subDive.x, q.z - A.subDive.z),
          `${ctx} route over the dive`,
        ).toBeGreaterThan(R.dive.keepOut - 3);
    }
  });

  it('the sunken city lies in the lagoon band on a levelled shelf, 2–4 tops, off every way', () => {
    let fewest = Infinity;
    for (const seed of SEEDS) {
      const { w, A, H, sdf, cell, slots, routes, arm } = harbour(seed);
      const ctx = `seed ${seed}`;
      fewest = Math.min(fewest, slots.length);
      expect(slots.length, `${ctx} slots`).toBeGreaterThanOrEqual(C.minSlots);
      const tops = slots.filter((s) => s.kind === 'ruinTop');
      expect(tops.length, ctx).toBeGreaterThanOrEqual(C.tops[0]);
      expect(tops.length, ctx).toBeLessThanOrEqual(C.tops[1]);
      expect(slots.filter((s) => s.kind === 'ruinColumn').length, ctx).toBeGreaterThanOrEqual(1);
      expect(slots.filter((s) => s.kind === 'ruinPaving').length, ctx).toBeGreaterThanOrEqual(4);
      const basin = rectShape(
        A.harbourBasin.x,
        A.harbourBasin.z,
        A.harbourBasin.rotY,
        A.harbourBasinSize.x,
        A.harbourBasinSize.z,
      );
      const lab = rectShape(
        A.tideLab.x,
        A.tideLab.z,
        A.tideLab.rotY,
        A.tideLabSize.x,
        A.tideLabSize.z,
      );
      const whale = planWhaleRoute(w, w.seed);
      for (const s of slots) {
        expect(w.zone[cell(s)], `${ctx} ${s.kind} zone`).toBe(Zone.lagoon);
        expect(-H(s), `${ctx} ${s.kind} depth`).toBeGreaterThanOrEqual(0.6);
        expect(-H(s), `${ctx} ${s.kind} depth`).toBeLessThanOrEqual(1.5);
        expect(Math.abs(s.y - H(s)), ctx).toBeLessThan(1e-4);
        expect(sdf(s), `${ctx} off the coast`).toBeLessThan(-0.6);
        expect(shapeDist(basin, s.x, s.z), `${ctx} off the basin`).toBeGreaterThan(1);
        expect(shapeDist(lab, s.x, s.z), `${ctx} off the lab`).toBeGreaterThan(1);
        expect(segDist(s, A.harbourPier0, A.harbourPier1), `${ctx} off the pier`).toBeGreaterThan(
          3,
        );
        expect(
          Math.hypot(s.x - A.ferryBerth.x, s.z - A.ferryBerth.z),
          `${ctx} off the berth`,
        ).toBeGreaterThan(8);
        expect(lineDist(s, arm), `${ctx} inside the arm`).toBeLessThan(P.arm.offset);
        for (const q of routes)
          expect(Math.hypot(q.x - s.x, q.z - s.z), `${ctx} route over the city`).toBeGreaterThan(3);
        if (whale) {
          let d = Infinity;
          for (let k = 0; k < whale.pts.length; k += 2)
            d = Math.min(d, Math.hypot(whale.pts[k] - s.x, whale.pts[k + 1] - s.z));
          expect(d, `${ctx} whale`).toBeGreaterThan(10);
        }
      }
    }
    console.info(`sunken city: fewest slots over 30 seeds ${fewest}`);
  });

  it('is deterministic', () => {
    const a = generateWorld(1001).islands.find((i) => i.theme === 'research')?.anchors;
    const b = generateWorld(1001).islands.find((i) => i.theme === 'research')?.anchors;
    expect(a).toEqual(b);
  });
});
