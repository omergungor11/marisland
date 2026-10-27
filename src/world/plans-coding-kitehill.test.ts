/**
 * Coding Kite Hill (TASK-497, `CO:C2`) and the wind tunnel site (`CO:C1`, built by TASK-498): an upwind
 * +4 u knoll in the Millbrook profile with the chime turbine on its summit, 8-12 kites round its foot,
 * a bench on the hill path, and the `windTunnel` anchor on a flattened pad. 30 seeds (same set as the
 * other Coding plan tests).
 */
import { describe, expect, it } from 'vitest';
import { KITE_HILL } from '../content/islands.ts';
import { CODING_CULTURE_SITES as CS } from '../content/cultures/coding.ts';
import { CODING_PLAN } from '../content/themes/coding.ts';
import { rectShape, segDist, shapeCorners, shapeDist } from './gen/sites.ts';
import { generateWorld, heightAt, type IslandData, type WorldData } from './index.ts';

const SEEDS = Array.from({ length: 30 }, (_, i) => 1 + i * 37);
const worlds = new Map<number, WorldData>();
const world = (seed: number): WorldData => {
  let w = worlds.get(seed);
  if (!w) worlds.set(seed, (w = generateWorld(seed)));
  return w;
};
const codingOf = (w: WorldData): IslandData =>
  w.islands.find((i) => i.theme === 'coding') as IslandData;
const hillOf = (isl: IslandData) => {
  const h = isl.anchors.kiteHill;
  if (!h) throw new Error(`no kiteHill anchor on island ${isl.id}`);
  return h;
};
/** Hill kites: kite v0-2 (not the pinwheels, v3, nor the kite stuck in a hedge) within the foot ring. */
const hillKites = (w: WorldData, isl: IslandData) => {
  const h = hillOf(isl);
  const ring = CS.kites.hill.ring;
  const r1 = KITE_HILL.foot + Math.max(...ring) + 0.5;
  const stuck = w.storySpots.filter((s) => s.islandId === isl.id && s.kind === 'stuckKite');
  return w.fixtures.filter(
    (f) =>
      f.islandId === isl.id &&
      f.defId === 'kite' &&
      f.variant !== 3 &&
      Math.hypot(f.x - h.x, f.z - h.z) <= r1 &&
      !stuck.some((s) => Math.hypot(s.pos.x - f.x, s.pos.z - f.z) < 0.01),
  );
};

describe('Coding Kite Hill (TASK-497), 30 seeds', { timeout: 300_000 }, () => {
  it('an upwind knoll ≈ +4 u over the plateau with a level summit, the chime tower on top', () => {
    let upwind = 0;
    let rise = 0;
    for (const seed of SEEDS) {
      const w = world(seed);
      const isl = codingOf(w);
      const h = hillOf(isl);
      const ctx = `seed ${seed}`;
      // upwind half of the island (wind blows toward windDir); crosswind / lee only when the Tech
      // Park fills the upwind half
      const up = -((h.x - isl.cx) * Math.cos(w.windDir) + (h.z - isl.cz) * Math.sin(w.windDir));
      if (up > 0) upwind++;
      const top = heightAt(w.height, h.x, h.z);
      // the plateau round the foot (land samples only)
      let sum = 0;
      let n = 0;
      for (let k = 0; k < 24; k++) {
        const a = (k / 24) * Math.PI * 2;
        const y = heightAt(
          w.height,
          h.x + Math.cos(a) * (KITE_HILL.foot + 8),
          h.z + Math.sin(a) * (KITE_HILL.foot + 8),
        );
        if (y > 3) {
          sum += y;
          n++;
        }
      }
      expect(top - sum / n, ctx).toBeGreaterThan(KITE_HILL.height - 2);
      rise += (top - sum / n) / SEEDS.length;
      // the summit pad is level
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        const y = heightAt(w.height, h.x + Math.cos(a) * 2, h.z + Math.sin(a) * 2);
        expect(Math.abs(y - top), ctx).toBeLessThan(0.3);
      }
      const chime = w.landmarks.filter(
        (m) => m.islandId === isl.id && m.variant === CS.chimeVariant,
      );
      expect(chime.length, ctx).toBe(1);
      expect(Math.hypot(chime[0].x - h.x, chime[0].z - h.z), ctx).toBeLessThan(0.5);
    }
    expect(upwind, 'seeds with the hill on the upwind half').toBeGreaterThanOrEqual(25);
    expect(rise, 'mean rise over the plateau round it').toBeGreaterThan(KITE_HILL.height - 0.5);
  });

  it('smooth slopes: the flank keeps to the smoothstep knoll; a Tech Park pad seam at most', () => {
    // max slope of the profile: height · 1.5 / (foot − top), plus the plateau's own roll
    const maxSlope = (KITE_HILL.height * 1.5) / (KITE_HILL.foot - KITE_HILL.top) + 0.35;
    let n = 0;
    let steep = 0;
    for (const seed of SEEDS) {
      const w = world(seed);
      const isl = codingOf(w);
      const h = hillOf(isl);
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        for (let r = KITE_HILL.top + 3; r < KITE_HILL.foot - 2; r += 1) {
          const x = h.x + Math.cos(a) * r;
          const z = h.z + Math.sin(a) * r;
          // the hill fades into the bluff on the coast side: only inland samples
          const i =
            Math.round((z - w.height.originZ) / w.height.cellSize) * w.height.n +
            Math.round((x - w.height.originX) / w.height.cellSize);
          if (w.shoreSdf[i] < 12) continue;
          const d = Math.abs(
            heightAt(w.height, x - Math.cos(a) * 0.5, z - Math.sin(a) * 0.5) -
              heightAt(w.height, x + Math.cos(a) * 0.5, z + Math.sin(a) * 0.5),
          );
          n++;
          if (d >= maxSlope) steep++;
          // a pad's falloff may meet the foot (the park can shift toward the hill): never a wall
          expect(d, `seed ${seed} a${k} r${r}`).toBeLessThan(1.4);
        }
      }
    }
    expect(steep / n).toBeLessThan(0.02);
  });

  it('kites round the foot: 5-12 every seed, ≥ 8 on most, on land and flying downwind; the Kite Day rack', () => {
    let full = 0;
    let racks = 0;
    for (const seed of SEEDS) {
      const w = world(seed);
      const isl = codingOf(w);
      const h = hillOf(isl);
      const ctx = `seed ${seed}`;
      const kites = hillKites(w, isl);
      expect(kites.length, ctx).toBeGreaterThanOrEqual(5);
      expect(kites.length, ctx).toBeLessThanOrEqual(CS.kites.hill.count[1]);
      if (kites.length >= CS.kites.hill.count[0]) full++;
      for (const k of kites) {
        const r = Math.hypot(k.x - h.x, k.z - h.z);
        expect(r, ctx).toBeGreaterThan(KITE_HILL.foot + Math.min(...CS.kites.hill.ring) - 0.5);
        expect(heightAt(w.height, k.x, k.z), ctx).toBeGreaterThan(0.3);
        expect(Math.cos(k.rotY - (w.windDir + Math.PI / 2)), ctx).toBeGreaterThan(0.95);
      }
      const rack = w.fixtures.find((f) => f.islandId === isl.id && f.defId === 'kiteRack');
      const day = w.storySpots.find((s) => s.islandId === isl.id && s.kind === 'kiteDay');
      if (rack && day) {
        racks++;
        expect(Math.hypot(day.pos.x - rack.x, day.pos.z - rack.z), ctx).toBeLessThan(0.01);
        expect(Math.hypot(rack.x - h.x, rack.z - h.z), ctx).toBeLessThan(KITE_HILL.foot + 6);
      }
    }
    expect(full, 'seeds with ≥ 8 hill kites').toBeGreaterThanOrEqual(26);
    expect(racks, 'seeds with the Kite Day rack').toBeGreaterThanOrEqual(27);
  });

  it('a bench beside the path up the hill, facing away from the summit', () => {
    let benches = 0;
    const B = CS.hillBench;
    for (const seed of SEEDS) {
      const w = world(seed);
      const isl = codingOf(w);
      const h = hillOf(isl);
      const bench = w.fixtures.find(
        (f) =>
          f.islandId === isl.id &&
          f.defId === 'bench' &&
          f.variant === B.variant &&
          Math.hypot(f.x - h.x, f.z - h.z) <= B.r[1] + B.side + 0.5 &&
          w.paths.some(
            (pl) =>
              pl.islandId === isl.id &&
              pl.points.some(
                (q, k) =>
                  k + 1 < pl.points.length && segDist(f, q, pl.points[k + 1]) < B.side + 0.6,
              ),
          ),
      );
      if (!bench) continue;
      benches++;
      const out = Math.atan2(bench.z - h.z, bench.x - h.x);
      expect(Math.cos(bench.rotY - out), `seed ${seed}`).toBeGreaterThan(0.99);
    }
    expect(benches, 'seeds with a hill bench').toBeGreaterThanOrEqual(26);
  });

  it('wind tunnel site: a level pad clear of everything, axis leaning downwind (TASK-498 anchor)', () => {
    const [L, W] = CODING_PLAN.tunnel.size;
    let sites = 0;
    for (const seed of SEEDS) {
      const w = world(seed);
      const isl = codingOf(w);
      const t = isl.anchors.windTunnel;
      if (!t) continue;
      sites++;
      const ctx = `seed ${seed}`;
      expect(Math.cos(t.rotY - w.windDir), ctx).toBeGreaterThanOrEqual(-1e-9);
      const sh = rectShape(t.x, t.z, t.rotY, W, L);
      const y0 = heightAt(w.height, t.x, t.z);
      for (const c of shapeCorners(sh)) {
        expect(Math.abs(heightAt(w.height, c.x, c.z) - y0), ctx).toBeLessThan(0.3);
        expect(heightAt(w.height, c.x, c.z), ctx).toBeGreaterThan(0.3);
      }
      // off the summit: the hill keeps its top (the last-resort tier may come to the foot)
      const h = hillOf(isl);
      expect(shapeDist(sh, h.x, h.z), ctx).toBeGreaterThanOrEqual(
        Math.min(CODING_PLAN.tunnel.fromTop, CODING_PLAN.tunnel.last.fromTop) - 1e-6,
      );
      for (const f of w.fixtures.filter((f) => f.islandId === isl.id))
        expect(shapeDist(sh, f.x, f.z), `${ctx} ${f.defId}`).toBeGreaterThan(0);
      for (const l of w.lots.filter((l) => l.islandId === isl.id))
        expect(shapeDist(sh, l.x, l.z), `${ctx} lot`).toBeGreaterThan(0);
      for (const m of w.landmarks.filter((m) => m.islandId === isl.id))
        expect(shapeDist(sh, m.x, m.z), `${ctx} turbine`).toBeGreaterThan(0);
      for (const pl of w.paths.filter((p) => p.islandId === isl.id))
        for (const p of pl.points)
          // path samples may cut a grid-cell corner of the blocked pad
          expect(shapeDist(sh, p.x, p.z), `${ctx} path`).toBeGreaterThan(-0.5);
    }
    // TASK-498 builds on it: every seed
    expect(sites, 'seeds with a wind tunnel site').toBe(SEEDS.length);
  });
});
