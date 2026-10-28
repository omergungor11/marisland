import { describe, expect, it } from 'vitest';
import { MARKETING_ANCHORS as A } from '../content/themes/marketing-anchors.ts';
import { anchorChain } from './gen/plans/devops-growth.ts';
import { beaconCable, beaconSeaKeepOut, spanMargin } from './gen/plans/marketing-anchors.ts';
import { generateWorld, heightAt, zoneAt, Zone, type WorldData, type XZ } from './index.ts';
import type { IslandData } from './types.ts';

// TASK-516 (M27): Beacon Rock anchors — stack tops, the cable-car line, the stack roles
// (transmitter, sea billboard, dive tower + pool) and the ON AIR cliff neon. 30 seeds.
const SEEDS = Array.from({ length: 30 }, (_, k) => 1000 + k * 263);
const cache = new Map<number, WorldData>();
const world = (seed: number): WorldData => {
  let w = cache.get(seed);
  if (!w) cache.set(seed, (w = generateWorld(seed)));
  return w;
};
const mkt = (w: WorldData): IslandData => {
  const isl = w.islands.find((i) => i.theme === 'marketing');
  if (!isl) throw new Error('no Marketing island');
  return isl;
};
const segDist = (p: XZ, a: XZ, b: XZ): number => {
  const vx = b.x - a.x;
  const vz = b.z - a.z;
  const l2 = vx * vx + vz * vz;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.z - a.z) * vz) / l2)) : 0;
  return Math.hypot(p.x - a.x - vx * t, p.z - a.z - vz * t);
};
const turn = (a: number, b: number): number => {
  const d = Math.abs(a - b) % (Math.PI * 2);
  return d > Math.PI ? Math.PI * 2 - d : d;
};
const tops = (isl: IslandData) =>
  Object.keys(isl.anchors)
    .filter((k) => /^stackTop\d+$/.test(k))
    .map((k) => ({ ...isl.anchors[k], r: isl.anchors[`${k}Size`].x }));
/** The stack top whose usable disc holds p (null: none). */
const topAt = (isl: IslandData, p: XZ) =>
  tops(isl).find((t) => Math.hypot(p.x - t.x, p.z - t.z) <= t.r + 1e-6) ?? null;
/** Share of the seeds passing `ok`. */
const rate = (ok: (isl: IslandData, w: WorldData) => boolean): number =>
  SEEDS.filter((s) => ok(mkt(world(s)), world(s))).length / SEEDS.length;

/**
 * Face flatness: for every offset across (± w/2) and height in the extent, the ground right at
 * the plane is below that height (nothing pokes through the board) and the face is reached within
 * `maxGap` (+ tolerance) walking inward. Returns the worst gap (Infinity: a missing face).
 */
function faceGap(w: WorldData, p: XZ, rotY: number, y: number, wd: number, ht: number): number {
  const n = { x: Math.cos(rotY), z: Math.sin(rotY) };
  const tx = { x: -n.z, z: n.x };
  let worst = 0;
  for (let o = -wd / 2; o <= wd / 2 + 1e-6; o += 0.5)
    for (let yy = y - ht / 2; yy <= y + ht / 2 + 1e-6; yy += 0.5) {
      const q = { x: p.x + tx.x * o, z: p.z + tx.z * o };
      if (heightAt(w.height, q.x, q.z) > yy + 0.35) return -1;
      let g = Infinity;
      for (let s = 0; s <= 6; s += 0.05)
        if (heightAt(w.height, q.x - n.x * s, q.z - n.z * s) >= yy) {
          g = s;
          break;
        }
      worst = Math.max(worst, g);
    }
  return worst;
}

describe('Beacon Rock M27 anchors (TASK-516), 30 seeds', { timeout: 240_000 }, () => {
  it('presence: cable, billboard, dive tower, neon on (nearly) every seed; transmitter with 3+ stacks', () => {
    expect(rate((isl) => anchorChain(isl, 'cable').length >= 2)).toBe(1);
    expect(rate((isl) => anchorChain(isl, 'cable').length >= 3)).toBeGreaterThanOrEqual(0.9);
    expect(rate((isl) => !!isl.anchors.seaBillboard)).toBeGreaterThanOrEqual(0.95);
    expect(rate((isl) => !!isl.anchors.diveTower)).toBeGreaterThanOrEqual(0.9);
    expect(rate((isl) => !!isl.anchors.onAir)).toBe(1);
    const three = SEEDS.filter((s) => tops(mkt(world(s))).length >= 3);
    expect(three.length).toBeGreaterThanOrEqual(18);
    const tx = three.filter((s) => !!mkt(world(s)).anchors.transmitter).length;
    expect(tx / three.length).toBeGreaterThanOrEqual(0.9);
    // every profile stack has a usable top on most seeds
    let stacks = 0;
    let withTop = 0;
    for (const s of SEEDS) {
      const isl = mkt(world(s));
      for (let k = 0; isl.anchors[`stack${k}`]; k++) {
        stacks++;
        if (isl.anchors[`stackTop${k}`]) withTop++;
      }
    }
    expect(withTop / stacks).toBeGreaterThanOrEqual(0.95);
  });

  it('stack tops: flat discs at the stack height, inside the island, seaward heading', () => {
    for (const s of SEEDS) {
      const w = world(s);
      const isl = mkt(w);
      for (const t of tops(isl)) {
        expect(t.r, `seed ${s}`).toBeGreaterThanOrEqual(A.stack.minR);
        expect(t.y as number, `seed ${s}`).toBeGreaterThanOrEqual(A.stack.minTop);
        for (let q = 0; q < 12; q++) {
          const a = (q / 12) * Math.PI * 2;
          const y = heightAt(w.height, t.x + Math.cos(a) * t.r, t.z + Math.sin(a) * t.r);
          expect(y, `seed ${s}`).toBeGreaterThanOrEqual((t.y as number) - A.stack.rimTol - 0.05);
        }
      }
    }
  });

  it('cable: pylons on land (summit plateau, stack tops), clearance over sea / ground, turns, tower and mail lines', () => {
    for (const s of SEEDS) {
      const w = world(s);
      const isl = mkt(w);
      const pts = anchorChain(isl, 'cable');
      if (pts.length < 2) continue;
      const lm = w.landmarks.find((l) => l.islandId === isl.id);
      if (!lm) throw new Error('no tower');
      const top = heightAt(w.height, lm.x, lm.z);
      // the summit station on the plateau, the rest on stack tops
      expect(heightAt(w.height, pts[0].x, pts[0].z), `seed ${s}`).toBeGreaterThan(
        top - A.cable.station.drop - 0.5,
      );
      for (const p of pts.slice(1)) {
        expect(heightAt(w.height, p.x, p.z), `seed ${s}`).toBeGreaterThan(A.stack.minTop - 0.5);
        expect(topAt(isl, p), `seed ${s}`).not.toBeNull();
      }
      // farther and farther out is not required, but every span is clear on the final ground
      const seats = beaconCable(isl);
      for (let k = 0; k + 1 < seats.length; k++) {
        expect(
          spanMargin(w.height, seats[k], seats[k + 1]),
          `seed ${s} span ${k}`,
        ).toBeGreaterThanOrEqual(-0.05);
        expect(segDist(lm, seats[k], seats[k + 1]), `seed ${s}`).toBeGreaterThanOrEqual(
          A.cable.towerClear - 1e-6,
        );
        expect(
          Math.hypot(seats[k + 1].x - seats[k].x, seats[k + 1].z - seats[k].z),
        ).toBeLessThanOrEqual(A.cable.maxSpan);
        if (k > 0) {
          const h0 = Math.atan2(seats[k].z - seats[k - 1].z, seats[k].x - seats[k - 1].x);
          const h1 = Math.atan2(seats[k + 1].z - seats[k].z, seats[k + 1].x - seats[k].x);
          expect(turn(h0, h1), `seed ${s}`).toBeLessThanOrEqual(
            (A.cable.maxTurn * Math.PI) / 180 + 1e-6,
          );
        }
      }
      // the ends face along the line
      const n = pts.length;
      const h01 = Math.atan2(pts[1].z - pts[0].z, pts[1].x - pts[0].x);
      expect(turn(isl.anchors.cable0.rotY, h01)).toBeLessThan(1e-6);
      const hb = Math.atan2(pts[n - 2].z - pts[n - 1].z, pts[n - 2].x - pts[n - 1].x);
      expect(turn(isl.anchors[`cable${n - 1}`].rotY, hb)).toBeLessThan(1e-6);
      // no mail line anywhere near (they are on HQ / Emberpeak)
      for (const f of w.fixtures.filter((f) => f.defId === 'mailLine'))
        for (let k = 0; k + 1 < n; k++)
          expect(segDist(f, pts[k], pts[k + 1]), `seed ${s}`).toBeGreaterThan(10);
    }
  });

  it('transmitter and dive tower stand on a stack top, off every span; the pool is deep, off the routes and seamarks', () => {
    for (const s of SEEDS) {
      const w = world(s);
      const isl = mkt(w);
      const pts = anchorChain(isl, 'cable');
      const offSpans = (p: XZ): number =>
        Math.min(Infinity, ...pts.slice(1).map((b, k) => segDist(p, pts[k], b)));
      const tx = isl.anchors.transmitter;
      if (tx) {
        expect(topAt(isl, tx), `seed ${s}`).not.toBeNull();
        expect(offSpans(tx), `seed ${s}`).toBeGreaterThanOrEqual(A.transmitter.clear - 0.3);
      }
      const dv = isl.anchors.diveTower;
      const pool = isl.anchors.divePool;
      const size = isl.anchors.divePoolSize;
      expect(!!dv === !!pool && !!pool === !!size, `seed ${s}`).toBe(true);
      if (!dv || !pool || !size) continue;
      const t = topAt(isl, dv);
      expect(t, `seed ${s}`).not.toBeNull();
      expect(offSpans(dv), `seed ${s}`).toBeGreaterThanOrEqual(A.diveTower.clear - 0.3);
      // three roles on three different stacks
      if (tx) expect(topAt(isl, tx), `seed ${s}`).not.toBe(t);
      // platform faces the pool, the pool within the jump reach
      const d = Math.hypot(pool.x - dv.x, pool.z - dv.z);
      expect(d, `seed ${s}`).toBeGreaterThanOrEqual(A.diveTower.reach[0] - 1e-6);
      expect(d, `seed ${s}`).toBeLessThanOrEqual(A.diveTower.reach[1] + 1e-6);
      expect(turn(Math.atan2(pool.z - dv.z, pool.x - dv.x), dv.rotY)).toBeLessThan(1e-6);
      // depth on the final seabed (the dock carve / reef gaps never shallow it)
      expect(size.x).toBe(A.diveTower.poolR);
      expect(size.z, `seed ${s}`).toBeGreaterThanOrEqual(A.diveTower.depth);
      for (let j = 0; j < 16; j++)
        for (const rr of [0, size.x / 2, size.x]) {
          const a = (j / 16) * Math.PI * 2;
          const y = heightAt(w.height, pool.x + Math.cos(a) * rr, pool.z + Math.sin(a) * rr);
          expect(y, `seed ${s}`).toBeLessThanOrEqual(-A.diveTower.depth + 1e-3);
        }
      expect(offSpans(pool), `seed ${s}`).toBeGreaterThanOrEqual(A.diveTower.poolR);
      // no boat route through the pool, no sea stack / buoy in it
      for (const r of w.boatRoutes)
        for (let k = 0; k + 1 < r.points.length; k++)
          expect(segDist(pool, r.points[k], r.points[k + 1]), `seed ${s}`).toBeGreaterThan(
            size.x + 0.5,
          );
      for (const f of w.seamarks)
        expect(Math.hypot(f.x - pool.x, f.z - pool.z), `seed ${s}`).toBeGreaterThanOrEqual(
          size.x + A.seaKeepOut.pool - 1e-6,
        );
    }
  });

  it('sea billboard: a plane on a stack face, facing out from the summit, the face flat behind it', () => {
    for (const s of SEEDS) {
      const w = world(s);
      const isl = mkt(w);
      const b = isl.anchors.seaBillboard;
      const sz = isl.anchors.seaBillboardSize;
      if (!b || !sz) continue;
      expect(sz.x, `seed ${s}`).toBeGreaterThanOrEqual(A.billboard.minW);
      expect(sz.z, `seed ${s}`).toBeGreaterThanOrEqual(A.billboard.minH);
      // on a stack: its top disc lies just inland of the plane
      const t = tops(isl).find(
        (q) => Math.hypot(b.x - q.x, b.z - q.z) <= q.r + 8 && (q.y as number) >= (b.y as number),
      );
      expect(t, `seed ${s}`).toBeDefined();
      if (!t) continue;
      const sea = Math.atan2(t.z - isl.anchors.lighthouse.z, t.x - isl.anchors.lighthouse.x);
      expect(turn(b.rotY, sea), `seed ${s}`).toBeLessThanOrEqual(
        (A.billboard.arc * Math.PI) / 180 + 1e-6,
      );
      const g = faceGap(w, b, b.rotY, b.y as number, sz.x, sz.z);
      expect(g, `seed ${s}`).toBeGreaterThanOrEqual(0);
      expect(g, `seed ${s}`).toBeLessThanOrEqual(A.billboard.maxGap + 0.3);
      expect((b.y as number) - sz.z / 2, `seed ${s}`).toBeGreaterThanOrEqual(
        A.billboard.yLo - 1e-6,
      );
    }
  });

  it('ON AIR neon: a windward cliff face ≥ 4 letters tall, flat behind the column, mostly Zone.cliff, off the cable', () => {
    const need = A.neon.letters * A.neon.letter + 2 * A.neon.pad;
    for (const s of SEEDS) {
      const w = world(s);
      const isl = mkt(w);
      const n = isl.anchors.onAir;
      const sz = isl.anchors.onAirSize;
      if (!n || !sz) continue;
      expect(sz.z, `seed ${s}`).toBeGreaterThanOrEqual(need);
      expect(sz.x, `seed ${s}`).toBeGreaterThanOrEqual(A.neon.minW);
      const windward = w.windDir + Math.PI;
      expect(turn(n.rotY, windward), `seed ${s}`).toBeLessThanOrEqual(
        (A.neon.arc * Math.PI) / 180 + 1e-6,
      );
      const g = faceGap(w, n, n.rotY, n.y as number, sz.x, sz.z);
      expect(g, `seed ${s}`).toBeGreaterThanOrEqual(0);
      expect(g, `seed ${s}`).toBeLessThanOrEqual(A.neon.maxGap + 0.3);
      // the rock right behind the column is the cliff zone
      const nx = Math.cos(n.rotY);
      const nz = Math.sin(n.rotY);
      let cliff = 0;
      let all = 0;
      for (let yy = (n.y as number) - sz.z / 2; yy <= (n.y as number) + sz.z / 2; yy += 1) {
        for (let s2 = 0; s2 <= 6; s2 += 0.1)
          if (heightAt(w.height, n.x - nx * s2, n.z - nz * s2) >= yy) {
            all++;
            if (zoneAt(w.height, w.zone, n.x - nx * s2, n.z - nz * s2) === Zone.cliff) cliff++;
            break;
          }
      }
      expect(cliff / all, `seed ${s}`).toBeGreaterThanOrEqual(0.5);
      const pts = anchorChain(isl, 'cable');
      if (pts.length >= 2)
        expect(segDist(n, pts[0], pts[1]), `seed ${s}`).toBeGreaterThanOrEqual(
          A.neon.cableClear - 1e-6,
        );
    }
  });

  it('scatter keeps off the stack tops, the summit station and the neon / billboard rects', () => {
    for (const s of SEEDS.slice(0, 10)) {
      const w = world(s);
      const isl = mkt(w);
      const p = w.props;
      const zones: { x: number; z: number; r: number }[] = tops(isl).map((t) => ({ ...t, r: t.r }));
      const c0 = isl.anchors.cable0;
      if (c0) zones.push({ x: c0.x, z: c0.z, r: A.cable.station.r });
      for (let i = 0; i < p.count; i++) {
        if (p.islandId[i] !== isl.id) continue;
        for (const z of zones)
          expect(Math.hypot(p.x[i] - z.x, p.z[i] - z.z), `seed ${s}`).toBeGreaterThan(z.r);
      }
    }
  });

  it('seamarks stay off the spans', () => {
    for (const s of SEEDS) {
      const w = world(s);
      const keep = beaconSeaKeepOut(w.islands);
      for (const f of w.seamarks)
        for (const c of keep)
          expect(Math.hypot(f.x - c.x, f.z - c.z)).toBeGreaterThanOrEqual(c.r - 1e-6);
    }
  });
});

describe('Beacon Rock M27 anchors, seed 2024 (W20 / W21)', { timeout: 120_000 }, () => {
  const M27 =
    /^(stackTop\d+(Size)?|cable\d+|transmitter|seaBillboard(Size)?|diveTower|divePool(Size)?|onAir(Size)?)$/;
  const pick = (isl: IslandData) =>
    Object.fromEntries(
      Object.keys(isl.anchors)
        .filter((k) => M27.test(k))
        .sort()
        .map((k) => {
          const a = isl.anchors[k];
          const r = (v: number) => Math.round(v * 1000) / 1000;
          return [
            k,
            a.y === undefined ? [r(a.x), r(a.z), r(a.rotY)] : [r(a.x), r(a.y), r(a.z), r(a.rotY)],
          ];
        }),
    );

  it('every anchor is there, deterministic, and snapshotted', () => {
    const isl = mkt(generateWorld(2024));
    const again = mkt(generateWorld(2024));
    expect(pick(again)).toEqual(pick(isl));
    expect(anchorChain(isl, 'cable').length).toBe(4);
    for (const k of ['transmitter', 'seaBillboard', 'diveTower', 'divePool', 'onAir'])
      expect(isl.anchors[k], k).toBeDefined();
    expect(pick(isl)).toMatchSnapshot();
  });

  it('the neon faces the W4 camera side', () => {
    const isl = mkt(generateWorld(2024));
    const n = isl.anchors.onAir;
    // W4 raw cam position (content/shots.ts)
    const cam = { x: 108.6, z: 4.27 };
    const to = Math.atan2(cam.z - n.z, cam.x - n.x);
    expect(Math.cos(turn(n.rotY, to))).toBeGreaterThan(0.3);
  });
});
