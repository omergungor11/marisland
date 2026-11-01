import { describe, expect, it } from 'vitest';
import { COASTER_LOOP, COASTER_PARTS, QA_PARK as K } from '../content/themes/qa-park.ts';
import { PATHS } from '../content/settlements.ts';
import { StageHash } from './gen/hash.ts';
import {
  COASTER_PART_RANGE as RANGE,
  coasterToWorld,
  coasterTrackOf,
  sampleCoaster,
  type CoasterTrack,
} from './gen/plans/qa-park.ts';
import { discShape, rectShape, shapeDist, shapesOverlap, type Shape } from './gen/sites.ts';
import { generateWorld, heightAt, slopeAtCell, Zone, type WorldData, type XZ } from './index.ts';

/** QA Thrill Test Park site (TASK-539, D-119): 30 seeds + the wow seed. */
const SEEDS = [...Array.from({ length: 30 }, (_, k) => 1000 + k * 263), 1001];
const cache = new Map<number, WorldData>();
const world = (seed: number): WorldData => {
  let w = cache.get(seed);
  if (!w) cache.set(seed, (w = generateWorld(seed)));
  return w;
};
const qaOf = (w: WorldData) => {
  const isl = w.islands.find((i) => i.theme === 'qa');
  if (!isl) throw new Error('no QA island');
  return isl;
};
const cellOf = (w: WorldData, x: number, z: number): number =>
  Math.round((z - w.height.originZ) / w.height.cellSize) * w.height.n +
  Math.round((x - w.height.originX) / w.height.cellSize);

interface Site {
  w: WorldData;
  isl: ReturnType<typeof qaOf>;
  tr: CoasterTrack;
  /** Samples: local point, world xz, part. */
  pts: { x: number; y: number; z: number; wx: number; wz: number; seg: number; t: number }[];
  stadium: Shape[];
  ctx: string;
}

const STEP = 0.25;
function site(seed: number): Site | null {
  const w = world(seed);
  const isl = qaOf(w);
  const tr = coasterTrackOf(isl);
  if (!tr) return null;
  const sz = isl.anchors.coasterSize;
  const off = (sz.z - sz.x) / 2;
  const at = (z: number): XZ => coasterToWorld(tr.origin, tr.rotY, 0, z);
  const stadium = [
    rectShape(tr.origin.x, tr.origin.z, tr.rotY, sz.x, sz.z - sz.x),
    discShape(at(off).x, at(off).z, sz.x / 2),
    discShape(at(-off).x, at(-off).z, sz.x / 2),
  ];
  const pts = sampleCoaster(tr.points, STEP).map((q) => {
    const p = coasterToWorld(tr.origin, tr.rotY, q.p[0], q.p[2]);
    return { x: q.p[0], y: q.p[1], z: q.p[2], wx: p.x, wz: p.z, seg: q.seg, t: q.t };
  });
  return { w, isl, tr, pts, stadium, ctx: `seed ${seed}` };
}
const sites = (): Site[] => SEEDS.map(site).filter((s): s is Site => !!s);
const inStadium = (s: Site, x: number, z: number, gap = 0): boolean =>
  s.stadium.some((q) => shapeDist(q, x, z) < gap);
const inPart = (seg: number, part: keyof typeof RANGE): boolean =>
  seg >= RANGE[part][0] && seg < RANGE[part][1];
/** Grade (rise / run) over consecutive samples. */
const grades = (pts: Site['pts']): number[] =>
  pts
    .slice(1)
    .map((q, k) => (q.y - pts[k].y) / (Math.hypot(q.x - pts[k].x, q.z - pts[k].z) || 1e-6));

describe('QA Thrill Test Park site (TASK-539), 30 seeds', { timeout: 300_000 }, () => {
  it('fit rate: a site on ≥ 26 / 31 seeds; a missed seed publishes nothing (the fallback)', () => {
    let fit = 0;
    const missed: number[] = [];
    const tiers: Record<string, number> = {};
    for (const seed of SEEDS) {
      const isl = qaOf(world(seed));
      const tr = coasterTrackOf(isl);
      if (!tr) {
        missed.push(seed);
        expect(
          Object.keys(isl.anchors).filter((k) => k.startsWith('coaster')),
          `seed ${seed}`,
        ).toEqual([]);
        continue;
      }
      fit++;
      tiers[tr.scale] = (tiers[tr.scale] ?? 0) + 1;
      expect(
        K.tiers.some((t) => t.scale === tr.scale),
        `seed ${seed}`,
      ).toBe(true);
    }
    console.info(
      `QA park fit ${fit} / ${SEEDS.length}, scale ${JSON.stringify(tiers)}, missed ${missed}`,
    );
    expect(fit).toBeGreaterThanOrEqual(26);
  });

  it('the contract: a closed spline with every part, plain data, in the rect', () => {
    for (const s of sites()) {
      const n = RANGE[COASTER_PARTS[COASTER_PARTS.length - 1]][1] + 1;
      expect(s.tr.points.length, s.ctx).toBe(n);
      for (const p of s.tr.points) expect(p.length, s.ctx).toBe(3);
      // closed: the spline runs back into its first point, no jump anywhere
      for (let k = 0; k < s.pts.length; k++) {
        const a = s.pts[k];
        const b = s.pts[(k + 1) % s.pts.length];
        expect(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z), s.ctx).toBeLessThan(STEP * 2.2);
      }
      for (const q of s.pts) expect(inStadium(s, q.wx, q.wz), s.ctx).toBe(true);
    }
  });

  it('track and supports on land: every sample over this island, off the shore', () => {
    for (const s of sites())
      for (const q of s.pts) {
        const i = cellOf(s.w, q.wx, q.wz);
        expect(s.w.islandMap[i], s.ctx).toBe(s.isl.id + 1);
        expect(s.w.shoreSdf[i], s.ctx).toBeGreaterThan(K.minShore - 1.5);
        expect(heightAt(s.w.height, q.wx, q.wz), s.ctx).toBeGreaterThan(0.3);
      }
  });

  it('rails clear the final ground everywhere; supports stay a sane height', () => {
    let tallest = 0;
    for (const s of sites())
      for (const q of s.pts) {
        const gap = q.y - heightAt(s.w.height, q.wx, q.wz);
        expect(gap, `${s.ctx} seg ${q.seg}`).toBeGreaterThanOrEqual(
          (inPart(q.seg, 'loop') ? K.clearance.loop : K.clearance.track) * s.tr.scale - 0.02,
        );
        tallest = Math.max(tallest, gap);
      }
    console.info(`QA park tallest support ${tallest.toFixed(1)} u`);
    expect(tallest).toBeLessThan(16);
  });

  it('the station stretch is level, over a flat pad', () => {
    for (const s of sites()) {
      const a = RANGE.station[0] + 1;
      const b = RANGE.station[1] - 1;
      const run = s.pts.filter((q) => q.seg >= a && q.seg < b);
      const y0 = s.tr.points[a][1];
      for (const q of run) expect(Math.abs(q.y - y0), s.ctx).toBeLessThan(1e-3);
      const len = Math.abs(s.tr.points[b][2] - s.tr.points[a][2]);
      expect(len, s.ctx).toBeGreaterThanOrEqual(K.station.d * s.tr.scale - 1e-6);
      // the pad under the run: flat within a hair
      const ys = run.map((q) => heightAt(s.w.height, q.wx, q.wz));
      expect(Math.max(...ys) - Math.min(...ys), s.ctx).toBeLessThan(0.05);
      const A = s.isl.anchors.coasterStation;
      expect(A.y as number, s.ctx).toBeCloseTo(y0, 3);
      // the platform stands beside the rails, along their direction
      const dx = Math.cos(A.rotY);
      const dz = Math.sin(A.rotY);
      const q0 = run[0];
      const q1 = run[run.length - 1];
      const dir = Math.hypot(q1.wx - q0.wx, q1.wz - q0.wz) || 1;
      expect(((q1.wx - q0.wx) * dx + (q1.wz - q0.wz) * dz) / dir, s.ctx).toBeGreaterThan(0.999);
    }
  });

  it('the chain lift climbs steadily at a usable grade', () => {
    for (const s of sites()) {
      const a = RANGE.lift[0] + 1;
      const b = RANGE.lift[1] - 1;
      const run = s.pts.filter((q) => q.seg >= a && q.seg < b);
      const g = grades(run);
      for (const v of g) {
        expect(v, s.ctx).toBeGreaterThan(0.3);
        expect(v, s.ctx).toBeLessThan(0.85);
      }
    }
  });

  it('the loop: a real vertical loop with ground clearance, the rails pass beside each other', () => {
    for (const s of sites()) {
      const [a, b] = RANGE.loop;
      const run = s.pts.filter((q) => q.seg >= a && q.seg < b);
      const yMin = Math.min(...run.map((q) => q.y));
      const yMax = Math.max(...run.map((q) => q.y));
      const zs = run.map((q) => q.z);
      const span = Math.max(...zs) - Math.min(...zs);
      const r = COASTER_LOOP.r * s.tr.scale;
      expect(yMax - yMin, s.ctx).toBeGreaterThan(2 * r);
      expect(span, s.ctx).toBeGreaterThan(1.8 * r);
      // over its pad: the foot's clearance, and the crown high over the ground
      const top = run.find((q) => q.y === yMax) as Site['pts'][number];
      expect(top.y - heightAt(s.w.height, top.wx, top.wz), s.ctx).toBeGreaterThan(2 * r);
      // entry and exit: side by side, not through each other
      const p0 = s.tr.points[a];
      const p1 = s.tr.points[b];
      expect(Math.abs(p1[0] - p0[0]), s.ctx).toBeGreaterThanOrEqual(
        COASTER_LOOP.shift * s.tr.scale - 1e-6,
      );
    }
  });

  it('peaks fall in travel order (lift > loop > camelback) so gravity carries the train', () => {
    for (const s of sites()) {
      const peak = (part: keyof typeof RANGE): number => {
        const [a, b] = RANGE[part];
        return Math.max(...s.tr.points.slice(a, b + 1).map((p) => p[1]));
      };
      const lift = Math.max(peak('lift'), peak('turn'));
      expect(lift, s.ctx).toBeGreaterThan(peak('loop') + 0.3);
      expect(peak('loop'), s.ctx).toBeGreaterThan(peak('camel') + 0.3);
      const y0 = s.tr.points[RANGE.station[0]][1];
      expect(peak('camel') - y0, s.ctx).toBeGreaterThan(2);
    }
  });

  it('the track keeps off itself: non-neighbouring samples ≥ a car apart', () => {
    for (const s of sites()) {
      const m = s.pts.length;
      const sep = Math.max(1, Math.ceil(4 / STEP));
      let least = Infinity;
      for (let a = 0; a < m; a += 2)
        for (let b = a + sep; b < m; b += 2) {
          if (m - (b - a) < sep) continue;
          const p = s.pts[a];
          const q = s.pts[b];
          least = Math.min(least, Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z));
        }
      expect(least, s.ctx).toBeGreaterThan(1.2);
    }
  });

  it('no collision: nothing else inside the stadium, paths and lanes keep off', () => {
    for (const s of sites()) {
      const id = s.isl.id;
      for (const f of s.w.fixtures.filter((x) => x.islandId === id))
        expect(inStadium(s, f.x, f.z), `${s.ctx} ${f.defId}`).toBe(false);
      for (const l of s.w.lots.filter((x) => x.islandId === id)) {
        const sh = rectShape(l.x, l.z, l.rotY, l.w, l.d);
        for (const q of s.stadium) expect(shapesOverlap(q, sh, 0), `${s.ctx} lot`).toBe(false);
      }
      for (const m of s.w.landmarks.filter((x) => x.islandId === id))
        expect(inStadium(s, m.x, m.z), `${s.ctx} ${m.kind}`).toBe(false);
      for (const p of s.w.paths.filter((x) => x.islandId === id))
        for (const q of p.points)
          expect(inStadium(s, q.x, q.z, PATHS.halfWidth - 1), `${s.ctx} path`).toBe(false);
    }
  });

  it('keeps off the Proving Grounds: the stunt yard, loop track and their kit', () => {
    for (const s of sites()) {
      const A = s.isl.anchors;
      if (A.stunt) {
        const r = rectShape(A.stunt.x, A.stunt.z, A.stunt.rotY, A.stuntSize.x, A.stuntSize.z);
        for (const q of s.stadium) expect(shapesOverlap(q, r, K.gap - 0.01), s.ctx).toBe(false);
      }
      for (const f of s.w.fixtures.filter(
        (x) =>
          x.islandId === s.isl.id &&
          ['testTrack', 'dropTower', 'testFan', 'obstacle'].includes(x.defId),
      ))
        expect(inStadium(s, f.x, f.z, 0.5), `${s.ctx} ${f.defId}`).toBe(false);
    }
  });

  it('the rink sits on its pad in the infield, no rail over it', () => {
    for (const s of sites()) {
      const A = s.isl.anchors;
      const r = A.coasterRink;
      const sz = A.coasterRinkSize;
      const sh = rectShape(r.x, r.z, r.rotY, sz.x, sz.z);
      for (const q of s.pts)
        expect(shapeDist(sh, q.wx, q.wz), `${s.ctx} rail over the rink`).toBeGreaterThan(0.2);
      const c = [0.48, -0.48];
      const ys: number[] = [];
      for (const u of c)
        for (const v of c) {
          const p = coasterToWorld(r, r.rotY, u * sz.x, v * sz.z);
          ys.push(heightAt(s.w.height, p.x, p.z));
        }
      expect(Math.max(...ys) - Math.min(...ys), s.ctx).toBeLessThan(0.2);
      expect(Math.abs((r.y as number) - ys[0]), s.ctx).toBeLessThan(0.2);
    }
  });

  it('station, board, candy and entry anchors stand on the ground outside the stadium', () => {
    let linked = 0;
    const all = sites();
    for (const s of all) {
      const A = s.isl.anchors;
      for (const k of ['coasterEntry', 'coasterBoard', 'coasterCandy']) {
        const a = A[k];
        expect(a, `${s.ctx} ${k}`).toBeDefined();
        expect(inStadium(s, a.x, a.z), `${s.ctx} ${k}`).toBe(false);
        expect(Math.abs((a.y as number) - heightAt(s.w.height, a.x, a.z)), s.ctx).toBeLessThan(
          1e-3,
        );
        expect(a.y as number, `${s.ctx} ${k}`).toBeGreaterThan(0.3);
      }
      const near = s.w.paths
        .filter((p) => p.islandId === s.isl.id)
        .some((p) =>
          p.points.some((q) => Math.hypot(q.x - A.coasterEntry.x, q.z - A.coasterEntry.z) < 2.5),
        );
      if (near) linked++;
    }
    console.info(`QA park entry on the path network ${linked} / ${all.length}`);
    expect(linked / all.length).toBeGreaterThanOrEqual(0.9);
  });

  it('zones on the final ground: no stale rock under the pads, no steep lawn at their edge', () => {
    for (const s of sites()) {
      const n = s.w.height.n;
      for (const k of ['coasterRink', 'coasterStation']) {
        const a = s.isl.anchors[k];
        const i = cellOf(s.w, a.x, a.z);
        expect([Zone.rock, Zone.cliff], `${s.ctx} ${k}`).not.toContain(s.w.zone[i]);
      }
      const o = s.isl.anchors.coaster;
      const R = Math.hypot(s.isl.anchors.coasterSize.x, s.isl.anchors.coasterSize.z) / 2;
      for (const [ks, name] of [
        [K.pads.deck, 'deck'],
        [K.pads.loop, 'loop'],
      ] as const) {
        const mirror = s.tr.points[0][0] > 0;
        const c = coasterToWorld(
          o,
          o.rotY,
          (mirror ? -ks[0] : ks[0]) * s.tr.scale,
          ks[1] * s.tr.scale,
        );
        const sh = rectShape(c.x, c.z, o.rotY, ks[2] * s.tr.scale, ks[3] * s.tr.scale);
        for (let iz = 1; iz < n - 1; iz++) {
          const z = s.w.height.originZ + iz * s.w.height.cellSize;
          if (Math.abs(z - o.z) > R + K.zones.reach) continue;
          for (let ix = 1; ix < n - 1; ix++) {
            const x = s.w.height.originX + ix * s.w.height.cellSize;
            if (Math.abs(x - o.x) > R + K.zones.reach) continue;
            const i = iz * n + ix;
            if (s.w.islandMap[i] !== s.isl.id + 1 || s.w.shoreSdf[i] <= 0) continue;
            if (shapeDist(sh, x, z) > K.zones.reach) continue;
            const slope = slopeAtCell(s.w.height, ix, iz);
            const zn = s.w.zone[i];
            if (slope > K.zones.steep)
              expect(
                [Zone.grass, Zone.meadow, Zone.forest],
                `${s.ctx} ${name} @${x},${z}`,
              ).not.toContain(zn);
          }
        }
      }
    }
  });

  it('deterministic: track hash locked for seeds 1, 42, 1001', () => {
    const hash = (seed: number): string => {
      const tr = coasterTrackOf(qaOf(generateWorld(seed)));
      const h = new StageHash();
      if (!tr) return h.str('none').hex();
      h.float(tr.origin.x).float(tr.origin.z).float(tr.rotY).float(tr.scale).float(tr.groundY);
      for (const p of tr.points) h.float(p[0]).float(p[1]).float(p[2]);
      return h.hex();
    };
    const got = [1, 42, 1001].map((seed) => {
      const v = hash(seed);
      expect(hash(seed), `seed ${seed}`).toBe(v);
      return v;
    });
    expect(got).toMatchInlineSnapshot(`
      [
        "054040aeb0943e64",
        "100b39f413a922fa",
        "4feca7ce67dd39c7",
      ]
    `);
  });
});
