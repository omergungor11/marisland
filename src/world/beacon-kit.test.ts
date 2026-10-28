import { describe, expect, it } from 'vitest';
import { MARKETING_ANCHORS as A } from '../content/themes/marketing-anchors.ts';
import { MARKETING_M27 as K } from '../content/themes/marketing-m27.ts';
import {
  MARKETING_M27_SITE as S,
  MARKETING_M27_MOTION as M,
} from '../content/themes/marketing-m27-site.ts';
import { MARKETING_QUICK as Q } from '../content/themes/marketing.ts';
import { cableLoop, gondolaPose, newGondolaPose } from './cable-car.ts';
import { anchorChain } from './gen/plans/devops-growth.ts';
import { guyEyes, squaresApart } from './gen/plans/marketing-anchors.ts';
import { ON_AIR_COLUMN } from './gen/plans/marketing-m27.ts';
import { generateWorld, heightAt, type WorldData } from './index.ts';
import type { FixtureData, IslandData } from './types.ts';

// TASK-518 (M27, D-097): the Beacon Rock kit on the TASK-516 anchors and the cable-car loop.
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
const fx = (w: WorldData, isl: IslandData, defId: string, variant?: number): FixtureData[] =>
  w.fixtures.filter(
    (f) =>
      f.islandId === isl.id &&
      f.defId === defId &&
      (variant === undefined || f.variant === variant),
  );
const near = (f: { x: number; z: number }, a: { x: number; z: number }, d = 1e-6): boolean =>
  Math.hypot(f.x - a.x, f.z - a.z) <= d;
const tops = (isl: IslandData) =>
  Object.keys(isl.anchors)
    .filter((k) => /^stackTop\d+$/.test(k))
    .map((k) => ({ ...isl.anchors[k], r: isl.anchors[`${k}Size`].x }));

describe('Beacon Rock M27 kit placement (TASK-518), 30 seeds', { timeout: 240_000 }, () => {
  it('every anchor carries its piece, pinned variant, the anchor pivot / heading / ground', () => {
    let stats = { pylons: 0, terminals: 0, dive: 0, tx: 0, board: 0, neon: 0 };
    for (const s of SEEDS) {
      const w = world(s);
      const isl = mkt(w);
      const pts = anchorChain(isl, 'cable');
      const line = fx(w, isl, 'mailLine').filter((f) => (f.variant ?? 0) >= K.pylon.variant);
      expect(line, `seed ${s}`).toHaveLength(pts.length >= 2 ? pts.length : 0);
      pts.forEach((p, k) => {
        const a = isl.anchors[`cable${k}`];
        const f = line.find((q) => near(q, p));
        expect(f, `seed ${s} cable${k}`).toBeDefined();
        if (!f) return;
        const end = k === 0 || k === pts.length - 1;
        expect(f.variant).toBe(end ? K.pylon.terminal : K.pylon.variant);
        expect(f.rotY).toBe(a.rotY);
        expect(f.y).toBe(a.y);
        if (end) stats.terminals++;
        else stats.pylons++;
      });
      const dv = isl.anchors.diveTower;
      const dvs = fx(w, isl, 'diveTower');
      expect(dvs, `seed ${s}`).toHaveLength(dv ? 1 : 0);
      if (dv) {
        expect(near(dvs[0], dv)).toBe(true);
        expect(dvs[0].rotY).toBe(dv.rotY);
        expect(dvs[0].scale).toBe(isl.anchors.diveTowerSize.x);
        stats.dive++;
      }
      const tx = isl.anchors.transmitter;
      const txs = fx(w, isl, 'antennaTower', K.guyed.variant);
      expect(txs, `seed ${s}`).toHaveLength(tx ? 1 : 0);
      if (tx) {
        expect(near(txs[0], tx)).toBe(true);
        expect(txs[0].scale).toBe(isl.anchors.transmitterSize.x);
        stats.tx++;
      }
      for (const [key, v] of [
        ['seaBillboard', K.seaBoard.variant],
        ['onAir', K.onAir.variant],
      ] as const) {
        const a = isl.anchors[key];
        const list = fx(w, isl, 'billboardV2', v);
        expect(list, `seed ${s} ${key}`).toHaveLength(a ? 1 : 0);
        if (!a) continue;
        if (key === 'seaBillboard') stats.board++;
        else stats.neon++;
      }
    }
    stats = { ...stats };
    expect(stats.terminals).toBe(60);
    expect(stats.board).toBe(30);
    expect(stats.neon).toBe(30);
    expect(stats.dive).toBeGreaterThanOrEqual(26);
    expect(stats.tx).toBeGreaterThanOrEqual(15);
  });

  it('face signs: scaled to the anchor rect, the rock plane on the anchor plane, centred on it', () => {
    for (const s of SEEDS) {
      const w = world(s);
      const isl = mkt(w);
      for (const [key, v, reach, centre, base] of [
        [
          'seaBillboard',
          K.seaBoard.variant,
          K.seaBoard.reach,
          K.seaBoard.y + K.seaBoard.h / 2,
          [K.seaBoard.w, K.seaBoard.h],
        ],
        [
          'onAir',
          K.onAir.variant,
          K.onAir.reach,
          K.onAir.foot + ON_AIR_COLUMN / 2,
          [K.onAir.plate.w, ON_AIR_COLUMN],
        ],
      ] as const) {
        const a = isl.anchors[key];
        const sz = isl.anchors[`${key}Size`];
        if (!a || !sz) continue;
        const f = fx(w, isl, 'billboardV2', v)[0];
        const sc = f.scale ?? 1;
        // never larger than the anchor's rect (bar the clamp floor)
        const lo = key === 'onAir' ? S.onAir.scale[0] : S.seaBoard.scale[0];
        if (sc > lo + 1e-9) {
          expect(base[0] * sc, `seed ${s} ${key}`).toBeLessThanOrEqual(sz.x + 1e-6);
          expect(base[1] * sc, `seed ${s} ${key}`).toBeLessThanOrEqual(sz.z + 1e-6);
        }
        // the rock plane (local z = −reach) on the anchor plane, the centre at the anchor height
        const back = {
          x: f.x - Math.cos(f.rotY) * reach * sc,
          z: f.z - Math.sin(f.rotY) * reach * sc,
        };
        expect(near(back, a, 1e-6), `seed ${s} ${key}`).toBe(true);
        expect((f.y as number) + centre * sc).toBeCloseTo(a.y as number, 6);
        // nothing pokes through the sign's own plane over its height
        const top = (a.y as number) + (base[1] * sc) / 2;
        for (let yy = (a.y as number) - (base[1] * sc) / 2; yy <= top; yy += 0.5)
          expect(heightAt(w.height, f.x, f.z), `seed ${s} ${key}`).toBeLessThan(
            yy + 0.35 + (top - yy),
          );
      }
    }
  });

  it('the M22 masts left every stack top carrying a piece; the guyed mast stands its eyes on rock', () => {
    for (const s of SEEDS) {
      const w = world(s);
      const isl = mkt(w);
      const carried = tops(isl).filter((t) =>
        [
          ...anchorChain(isl, 'cable').slice(1),
          isl.anchors.diveTower,
          isl.anchors.transmitter,
        ].some((p) => p && Math.hypot(p.x - t.x, p.z - t.z) <= t.r + 0.5),
      );
      for (const m of fx(w, isl, 'antennaTower', Q.transmitter.variant))
        for (const t of carried)
          expect(Math.hypot(m.x - t.x, m.z - t.z), `seed ${s}`).toBeGreaterThan(
            t.r + S.dropAntenna,
          );
      const tx = isl.anchors.transmitter;
      if (!tx) continue;
      const sc = isl.anchors.transmitterSize.x;
      for (const e of guyEyes(tx, tx.rotY, sc)) {
        const y = heightAt(w.height, e.x, e.z);
        expect(y, `seed ${s}`).toBeGreaterThanOrEqual(
          (tx.y as number) - A.transmitter.guy.below - 1e-6,
        );
        expect(y, `seed ${s}`).toBeLessThanOrEqual(
          (tx.y as number) + A.transmitter.guy.above + 1e-6,
        );
      }
    }
  });

  it('the dive tower and its stack pylon: square footprints apart, the pool ahead of the board', () => {
    for (const s of SEEDS) {
      const w = world(s);
      const isl = mkt(w);
      const dv = isl.anchors.diveTower;
      if (!dv) continue;
      const sc = isl.anchors.diveTowerSize.x;
      for (const f of fx(w, isl, 'mailLine').filter((q) => (q.variant ?? 0) >= K.pylon.variant))
        if (Math.hypot(f.x - dv.x, f.z - dv.z) < 6)
          expect(
            squaresApart(
              f,
              A.cable.pylonHalf,
              f.rotY,
              dv,
              A.diveTower.half * sc,
              dv.rotY,
              A.diveTower.gap / 2, // the planner turned the pylon by its stack neighbours, the line by the pylons
            ),
            `seed ${s}`,
          ).toBe(true);
      const pool = isl.anchors.divePool;
      const tip = (K.dive.deck / 2 - K.dive.board.from + K.dive.board.len) * sc;
      expect(Math.hypot(pool.x - dv.x, pool.z - dv.z), `seed ${s}`).toBeGreaterThan(tip + 1);
    }
  });
});

describe('Beacon Rock cable car loop (TASK-518)', { timeout: 240_000 }, () => {
  it('gondolas: on the cable, clear of ground and sea, never meeting, ≤ speed, a dwell per terminal', () => {
    const G = M.gondola;
    const p = newGondolaPose();
    const q = newGondolaPose();
    let minGap = Infinity;
    let minFloor = Infinity;
    for (const s of SEEDS) {
      const w = world(s);
      const isl = mkt(w);
      const L = cableLoop(isl);
      if (!L) continue;
      expect(L.period, `seed ${s}`).toBeGreaterThan(L.length / G.speed + 2 * G.dwell - 1e-6);
      let still = 0;
      let longest = 0;
      const dt = 0.25;
      for (let t = 0; t < L.period; t += dt) {
        const g = [0, 1, 2].map((k) => ({ ...gondolaPose(L, k, t, p) }));
        for (let a = 0; a < g.length; a++)
          for (let b = a + 1; b < g.length; b++)
            minGap = Math.min(
              minGap,
              Math.hypot(g[a].x - g[b].x, g[a].y - g[b].y, g[a].z - g[b].z),
            );
        // gondola 0: speed and clearance under the grip
        gondolaPose(L, 0, t + dt, q);
        const d = Math.hypot(q.x - g[0].x, q.z - g[0].z);
        expect(d / dt, `seed ${s} t ${t}`).toBeLessThanOrEqual(G.speed * 1.02 + 0.05);
        if (d < 1e-3) still += dt;
        else {
          longest = Math.max(longest, still);
          still = 0;
        }
        const ground = heightAt(w.height, g[0].x, g[0].z);
        const floor = g[0].y - K.gondola.grip;
        const pylonNear = anchorChain(isl, 'cable').some(
          (c) => Math.hypot(c.x - g[0].x, c.z - g[0].z) < A.cable.endSkip + A.cable.track,
        );
        if (!pylonNear)
          minFloor = Math.min(
            minFloor,
            ground > 0 ? floor - ground : floor - A.cable.clearWater + 1,
          );
        expect(Number.isFinite(g[0].heading)).toBe(true);
      }
      expect(Math.max(longest, still), `seed ${s} dwell`).toBeGreaterThanOrEqual(G.dwell - 0.5);
      // deterministic, periodic
      gondolaPose(L, 1, 12.3, p);
      gondolaPose(L, 1, 12.3 + L.period, q);
      expect(Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z)).toBeLessThan(1e-6);
    }
    // the cabins never touch: a third of a period apart on one timetable, the out and back tracks
    // pass 2 × track apart (less where they cross inside an angle pylon turn)
    expect(minGap).toBeGreaterThan(K.gondola.w + 0.3);
    // floor over the ground ≥ clearLand, over the sea ≥ clearWater − 1 (the margin offset above)
    expect(minFloor).toBeGreaterThanOrEqual(A.cable.clearLand - 0.05);
  });
});

describe('Beacon Rock M27 kit, seed 2024 (W20 / W21)', { timeout: 120_000 }, () => {
  it('placement snapshot', () => {
    const w = generateWorld(2024);
    const isl = mkt(w);
    const r = (v: number) => Math.round(v * 1000) / 1000;
    const list = w.fixtures
      .filter(
        (f) =>
          f.islandId === isl.id &&
          ((f.defId === 'mailLine' && (f.variant ?? 0) >= 4) ||
            f.defId === 'diveTower' ||
            (f.defId === 'antennaTower' && f.variant !== 0) ||
            (f.defId === 'billboardV2' && (f.variant ?? 0) >= 2)),
      )
      .map((f) => [f.defId, f.variant, r(f.x), r(f.y ?? NaN), r(f.z), r(f.rotY), r(f.scale ?? 1)]);
    expect(list).toMatchSnapshot();
    const L = cableLoop(isl);
    expect(L).not.toBeNull();
    expect(r(L?.period ?? 0)).toMatchSnapshot();
  });
});
