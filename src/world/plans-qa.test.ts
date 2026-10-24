import { describe, expect, it } from 'vitest';
import { QA_CULTURE, QA_CULTURE_SITES } from '../content/cultures/qa.ts';
import { PROP_DEFS, PROP_DEF_INDEX } from '../content/props.ts';
import { FIXTURE_RADIUS } from '../content/settlements.ts';
import { CULTURE_BOATS } from '../content/life.ts';
import { RIM_POST_LOOKS } from '../content/rim-walkway.ts';
import { QA_PLAN, QA_RIM_WALK } from '../content/themes/qa.ts';
import { StageHash } from './gen/hash.ts';
import { generateWorld, heightAt, type WorldData, type XZ } from './index.ts';

// M17b TASK-401: the QA Test Factory plan (Palmlagoon archetype, bluff plateau), 30 seeds.
const SEEDS = Array.from({ length: 30 }, (_, k) => 1000 + k * 263);
const cache = new Map<number, WorldData>();
const world = (seed: number): WorldData => {
  let w = cache.get(seed);
  if (!w) cache.set(seed, (w = generateWorld(seed)));
  return w;
};
const qaOf = (w: WorldData) => {
  const isl = w.islands.find((i) => i.theme === 'qa');
  if (!isl) throw new Error('no QA island');
  const s = w.settlements.find((x) => x.islandId === isl.id);
  return { isl, s, lots: (s?.lots ?? []).map((i) => w.lots[i]) };
};
const segDist = (p: XZ, a: XZ, b: XZ): number => {
  const vx = b.x - a.x;
  const vz = b.z - a.z;
  const l2 = vx * vx + vz * vz;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.z - a.z) * vz) / l2)) : 0;
  return Math.hypot(p.x - a.x - vx * t, p.z - a.z - vz * t);
};
/** BFS over the world path graph. */
function reachable(w: WorldData, start: number): Uint8Array {
  const n = w.pathGraph.nodes.length / 2;
  const adj: number[][] = Array.from({ length: n }, () => []);
  const e = w.pathGraph.edges;
  for (let i = 0; i < e.length; i += 2) {
    adj[e[i]].push(e[i + 1]);
    adj[e[i + 1]].push(e[i]);
  }
  const seen = new Uint8Array(n);
  const q = [start];
  seen[start] = 1;
  while (q.length)
    for (const m of adj[q.pop() as number])
      if (!seen[m]) {
        seen[m] = 1;
        q.push(m);
      }
  return seen;
}
/** Hash of everything the QA plan put on its island (lots, landmarks, fixtures, docks, paths). */
function islandHash(w: WorldData, id: number): string {
  const h = new StageHash();
  for (const l of w.lots.filter((x) => x.islandId === id))
    h.str(l.defId).float(l.x).float(l.z).float(l.rotY).u32(l.variant);
  for (const m of w.landmarks.filter((x) => x.islandId === id)) h.str(m.kind).float(m.x).float(m.z);
  for (const f of w.fixtures.filter((x) => x.islandId === id))
    h.str(f.defId).float(f.x).float(f.z).float(f.rotY);
  for (const d of w.docks.filter((x) => x.islandId === id)) h.float(d.x).float(d.z).u32(d.segments);
  for (const p of w.paths.filter((x) => x.islandId === id))
    for (const q of p.points) h.float(q.x).float(q.z);
  return h.hex();
}
const angDiff = (a: number, b: number): number =>
  Math.abs(((a - b + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);

describe('QA Test Factory plan (TASK-401), 30 seeds', () => {
  it('the QA tower: a T0 landmark on the plateau, off the yard', () => {
    expect(PROP_DEFS[PROP_DEF_INDEX.qaTower].tier).toBe(0);
    for (const seed of SEEDS) {
      const w = world(seed);
      const { isl, s } = qaOf(w);
      const ctx = `seed ${seed}`;
      expect(s, ctx).toBeDefined();
      const towers = w.landmarks.filter((m) => m.islandId === isl.id && m.kind === 'qaTower');
      expect(towers.length, ctx).toBe(1);
      const t = towers[0];
      expect(s?.landmarks.map((i) => w.landmarks[i])).toContain(t);
      // up on the bluff plateau, clear of the yard
      expect(heightAt(w.height, t.x, t.z), ctx).toBeGreaterThan(5);
      if (s?.plaza)
        expect(Math.hypot(t.x - s.plaza.x, t.z - s.plaza.z), ctx).toBeGreaterThanOrEqual(
          QA_PLAN.yardR + QA_PLAN.towerYardGap - 1e-6,
        );
    }
  });

  it('hangars on the yard rim facing it, bridged by straight conveyor rows; one loop track', () => {
    let three = 0;
    let bridged = 0;
    const counts: string[] = [];
    for (const seed of SEEDS) {
      const w = world(seed);
      const { isl, s } = qaOf(w);
      const ctx = `seed ${seed}`;
      const fx = w.fixtures.filter((f) => f.islandId === isl.id);
      const hangars = fx.filter((f) => f.defId === 'testHangar');
      const belts = fx.filter((f) => f.defId === 'conveyor');
      const tracks = fx.filter((f) => f.defId === 'testTrack');
      counts.push(`${hangars.length}/${belts.length}/${tracks.length}`);
      expect(s?.plaza, ctx).not.toBeNull();
      expect(hangars.length, ctx).toBeGreaterThanOrEqual(2);
      if (hangars.length === 3) three++;
      if (belts.length > 0) bridged++;
      expect(tracks.length, ctx).toBe(1);
      const yard = s?.plaza as { x: number; z: number; r: number };
      for (const h of hangars) {
        // door (+z = rotY) toward the yard
        const f = Math.atan2(yard.z - h.z, yard.x - h.x);
        expect(angDiff(f, h.rotY), `${ctx} hangar faces the yard`).toBeLessThan(0.05);
        expect(heightAt(w.height, h.x, h.z), ctx).toBeGreaterThan(3);
      }
      // conveyor segments: on the plateau, every one in a row (a neighbour 2 u away on its axis)
      for (const b of belts) {
        expect(heightAt(w.height, b.x, b.z), ctx).toBeGreaterThan(1);
        const next = belts.some(
          (o) =>
            o !== b &&
            Math.abs(Math.hypot(o.x - b.x, o.z - b.z) - QA_PLAN.beltSeg) < 1e-3 &&
            angDiff(o.rotY, b.rotY) < 1e-6,
        );
        expect(next, `${ctx} belt segment in a row`).toBe(true);
      }
    }
    console.info(`hangars/belts/tracks per seed: ${counts.join(' ')}`);
    expect(three).toBeGreaterThanOrEqual(27);
    expect(bridged).toBeGreaterThanOrEqual(27);
  });

  it('lots: ≥ 3 test labs, all connected to the hub; the lead office is a test lab', () => {
    const counts: number[] = [];
    for (const seed of SEEDS) {
      const w = world(seed);
      const { s, lots } = qaOf(w);
      if (!s) continue;
      counts.push(lots.length);
      expect(
        lots.filter((l) => l.defId === 'testLab').length,
        `seed ${seed}`,
      ).toBeGreaterThanOrEqual(3);
      const seen = reachable(w, s.hub.node);
      for (const l of lots) expect(seen[l.node], `seed ${seed} ${l.defId}`).toBe(1);
      for (const di of s.docks)
        if (w.docks[di].node >= 0) expect(seen[w.docks[di].node], `seed ${seed} dock`).toBe(1);
      expect(lots.find((l) => l.role === 'main')?.defId, `seed ${seed}`).toBe('testLab');
    }
    console.info(`QA lots per seed: ${counts.join(' ')}`);
  });

  it('checkpoints: barrier gates on the lanes, spaced, across the path', () => {
    const counts: number[] = [];
    for (const seed of SEEDS) {
      const w = world(seed);
      const { isl } = qaOf(w);
      const gates = w.fixtures.filter((f) => f.islandId === isl.id && f.defId === 'barrierGate');
      counts.push(gates.length);
      expect(gates.length, `seed ${seed}`).toBeGreaterThanOrEqual(1);
      const paths = w.paths.filter((p) => p.islandId === isl.id && p.kind === 'path');
      for (const g of gates) {
        const ctx = `seed ${seed} gate @${g.x.toFixed(1)},${g.z.toFixed(1)}`;
        let best = Infinity;
        let along = 0;
        for (const p of paths)
          for (let k = 0; k + 1 < p.points.length; k++) {
            const d = segDist(g, p.points[k], p.points[k + 1]);
            if (d < best) {
              best = d;
              const a = p.points[k];
              const b = p.points[k + 1];
              along = Math.abs(
                (Math.cos(g.rotY) * (b.x - a.x) + Math.sin(g.rotY) * (b.z - a.z)) /
                  (Math.hypot(b.x - a.x, b.z - a.z) || 1),
              );
            }
          }
        expect(best, ctx).toBeLessThan(1.6);
        expect(along, ctx).toBeGreaterThan(0.6);
        for (const o of gates)
          if (o !== g)
            expect(Math.hypot(o.x - g.x, o.z - g.z), ctx).toBeGreaterThanOrEqual(
              QA_PLAN.gateSpacing - 1e-6,
            );
      }
    }
    console.info(`barrier gates per seed: ${counts.join(' ')}`);
  });

  it('leftover audit: no atoll leftovers (wreck, inspection buoys, tide pools); one dockside stilt lab', () => {
    let stilt = 0;
    for (const seed of SEEDS) {
      const w = world(seed);
      const { isl } = qaOf(w);
      const ctx = `seed ${seed}`;
      const defs = w.lots.filter((l) => l.islandId === isl.id).map((l) => l.defId);
      for (const d of ['cottage', 'stiltHut', 'inspectionTower', 'logCabin'])
        expect(defs, ctx).not.toContain(d);
      const labs = w.lots.filter((l) => l.islandId === isl.id && l.defId === 'testLabStilt');
      expect(labs.length, ctx).toBeLessThanOrEqual(1);
      for (const l of labs) expect(heightAt(w.height, l.x, l.z), ctx).toBeLessThan(-0.3);
      stilt += labs.length;
      const fx = w.fixtures.filter((f) => f.islandId === isl.id).map((f) => f.defId);
      // inspection buoys are back since TASK-480, but only as the Q10 slalom line (own test)
      for (const d of ['buoy', 'tidePool', 'well']) expect(fx, ctx).not.toContain(d);
      expect(fx.filter((d) => d === 'inspectionBuoy').length, ctx).toBeLessThanOrEqual(
        QA_CULTURE_SITES.slalom.count,
      );
      expect(
        w.landmarks.filter((m) => m.islandId === isl.id).map((m) => m.kind),
        ctx,
      ).not.toContain('sunkenShip');
    }
    expect(stilt).toBeGreaterThanOrEqual(24);
  });

  it('deterministic: per-island snapshot', () => {
    const got = [1, 42, 1337].map((seed) => {
      const w = generateWorld(seed);
      const h = islandHash(w, qaOf(w).isl.id);
      expect(islandHash(generateWorld(seed), qaOf(w).isl.id)).toBe(h);
      return h;
    });
    expect(got).toMatchInlineSnapshot(`
      [
        "a4469af79649fbc8",
        "00e59e155c4d0bd9",
        "38a404a72d2c6d20",
      ]
    `);
  });
});

/** TASK-424 "Müfettişler Adası" (Inspectors' Island): the culture kit on the Test Factory. */
describe("QA Inspectors' Island culture (TASK-424), 30 seeds", () => {
  const C = QA_CULTURE_SITES;
  const KIT = new Set(QA_CULTURE.kit.map((k) => k.id));
  /** [min, max] per def on the island; `share` = fraction of seeds with at least one. */
  const RANGES: Record<string, { n: [number, number]; share: number }> = {
    stampDesk: { n: [0, 1], share: 0.95 },
    clipboardWall: { n: [0, 1], share: 0.8 },
    inspectionBooth: { n: [0, C.booth.max], share: 0.8 },
    flagMast: { n: [0, 1], share: 0.95 },
    scoreboard: { n: [0, 2], share: 1 },
    dummyBench: { n: [0, C.benches.count[1]], share: 0.95 },
    uvLampPost: { n: [0, C.uvLamps.count[1]], share: 0.95 },
    conePyramid: { n: [0, 1], share: 0.9 },
    bugJar: { n: [0, 2 + C.jars.labs], share: 1 },
  };
  const dist = (a: XZ, b: XZ): number => Math.hypot(a.x - b.x, a.z - b.z);

  it('kit placed: counts per def in range; one Hall of Checks; one Bug Zoo (pinned variants)', () => {
    const hits: Record<string, number> = {};
    let zoos = 0;
    for (const seed of SEEDS) {
      const w = world(seed);
      const { isl } = qaOf(w);
      const ctx = `seed ${seed}`;
      const fx = w.fixtures.filter((f) => f.islandId === isl.id);
      for (const [id, R] of Object.entries(RANGES)) {
        // the Q15 grandstand is dummyBench v1 (TASK-480, own test)
        const k = fx.filter(
          (f) => f.defId === id && !(id === 'dummyBench' && f.variant === C.grandstand.variant),
        ).length;
        expect(k, `${ctx} ${id}`).toBeGreaterThanOrEqual(R.n[0]);
        expect(k, `${ctx} ${id}`).toBeLessThanOrEqual(R.n[1]);
        if (k > 0) hits[id] = (hits[id] ?? 0) + 1;
      }
      const halls = fx.filter((f) => f.defId === 'testHangar' && f.variant === C.hallVariant);
      expect(halls.length, ctx).toBe(1);
      const zoo = fx.filter((f) => f.defId === 'terrarium');
      expect(zoo.length, ctx).toBeLessThanOrEqual(1);
      for (const z of zoo) expect(z.variant, ctx).toBe(C.zoo.variant);
      zoos += zoo.length;
      // scoreboards: at most one of each digit
      for (const v of [0, 1])
        expect(
          fx.filter((f) => f.defId === 'scoreboard' && f.variant === v).length,
          ctx,
        ).toBeLessThanOrEqual(1);
      // the stamp desk stands at the hall's door, the flag mast at the tower's foot
      for (const d of fx.filter((f) => f.defId === 'stampDesk'))
        expect(dist(d, halls[0]), ctx).toBeLessThan(QA_PLAN.hangar[1] / 2 + 3);
      const tower = w.landmarks.find((m) => m.islandId === isl.id && m.kind === 'qaTower');
      for (const m of fx.filter((f) => f.defId === 'flagMast'))
        expect(dist(m, tower as XZ), ctx).toBeLessThan(5);
      // booths beside a barrier gate
      const gates = fx.filter((f) => f.defId === 'barrierGate');
      for (const b of fx.filter((f) => f.defId === 'inspectionBooth'))
        expect(Math.min(...gates.map((g) => dist(g, b))), ctx).toBeLessThan(6);
    }
    for (const [id, R] of Object.entries(RANGES))
      expect((hits[id] ?? 0) / SEEDS.length, id).toBeGreaterThanOrEqual(R.share);
    expect(zoos / SEEDS.length, 'bug zoo').toBeGreaterThanOrEqual(0.9);
  });

  it('everything on land and level, nothing in the water', () => {
    for (const seed of SEEDS) {
      const w = world(seed);
      const { isl } = qaOf(w);
      for (const f of w.fixtures) {
        if (f.islandId !== isl.id || !(KIT.has(f.defId) || f.defId === 'terrarium')) continue;
        const ctx = `seed ${seed} ${f.defId} @${f.x.toFixed(1)},${f.z.toFixed(1)}`;
        const y0 = heightAt(w.height, f.x, f.z);
        expect(y0, `${ctx} on land`).toBeGreaterThan(0.4);
        const i = Math.round((f.z - w.height.originZ) / w.height.cellSize);
        const j = Math.round((f.x - w.height.originX) / w.height.cellSize);
        expect(w.islandMap[i * w.height.n + j], `${ctx} island`).toBe(isl.id + 1);
        const r = FIXTURE_RADIUS[f.defId];
        const ys = [0, 1, 2, 3, 4, 5, 6, 7].map((k) =>
          heightAt(w.height, f.x + Math.cos(k * 0.785) * r, f.z + Math.sin(k * 0.785) * r),
        );
        // TASK-471 re-roll: 0.82 on seed 5997 (inspection booth on a shelf edge)
        expect(Math.max(y0, ...ys) - Math.min(y0, ...ys), ctx).toBeLessThanOrEqual(0.85);
      }
    }
  });

  it('story spots: ≥ 5 per island, ledger kinds once each, on the island', () => {
    const kinds = new Set(QA_CULTURE.storySpots.map((s) => s.kind));
    for (const seed of SEEDS) {
      const w = world(seed);
      const { isl } = qaOf(w);
      const st = w.storySpots.filter((s) => s.islandId === isl.id);
      expect(st.length, `seed ${seed}`).toBeGreaterThanOrEqual(5);
      expect(new Set(st.map((s) => s.kind)).size, `seed ${seed} unique`).toBe(st.length);
      for (const s of st) {
        const ctx = `seed ${seed} ${s.kind}`;
        expect(kinds.has(s.kind), ctx).toBe(true);
        expect(s.defs.length, ctx).toBeGreaterThan(0);
        const y = heightAt(w.height, s.pos.x, s.pos.z);
        expect(y, `${ctx} on land`).toBeGreaterThan(0.3);
        expect(s.pos.y, ctx).toBeGreaterThanOrEqual(y - 1e-6);
      }
    }
  });
});

/** TASK-480 (M22 QA quick wins): rim walkway + hazard posts, palm rim, hammocks, slalom, grandstand. */
describe('QA quick wins (TASK-480), 30 seeds', () => {
  const C = QA_CULTURE_SITES;
  const W = QA_RIM_WALK;
  const P = W.posts!;
  const cellOf = (w: WorldData, x: number, z: number): number =>
    Math.round((z - w.height.originZ) / w.height.cellSize) * w.height.n +
    Math.round((x - w.height.originX) / w.height.cellSize);
  const slope = (w: WorldData, x: number, z: number): number =>
    Math.hypot(
      heightAt(w.height, x + 1, z) - heightAt(w.height, x - 1, z),
      heightAt(w.height, x, z + 1) - heightAt(w.height, x, z - 1),
    ) / 2;
  const nearPath = (w: WorldData, id: number, p: XZ, r: number): boolean =>
    w.paths.some(
      (pl) =>
        pl.islandId === id &&
        pl.points.some((q, k) => k + 1 < pl.points.length && segDist(p, q, pl.points[k + 1]) < r),
    );

  it('Q6 rim walkway: a painted band on the plateau rim, hazard posts every 3 u, gaps at paths', () => {
    let walks = 0;
    for (const seed of SEEDS) {
      const w = world(seed);
      const { isl } = qaOf(w);
      const ctx = `seed ${seed}`;
      let painted = 0;
      for (let i = 0; i < w.zone.length; i++) {
        if (w.islandMap[i] !== isl.id + 1 || w.zone[i] !== W.zone) continue;
        painted++;
        // up on the plateau, never on the bluff face
        expect(w.height.data[i], ctx).toBeGreaterThanOrEqual(W.minY - 0.5);
        expect(w.shoreSdf[i], ctx).toBeGreaterThan(3);
      }
      const posts = w.fixtures.filter((f) => f.islandId === isl.id && f.defId === P.def);
      if (painted >= 40 && posts.length >= 15) walks++;
      for (const f of posts) {
        const at = `${ctx} post @${f.x.toFixed(1)},${f.z.toFixed(1)}`;
        expect([P.variant, P.end], at).toContain(f.variant);
        expect(heightAt(w.height, f.x, f.z), at).toBeGreaterThanOrEqual(W.minY);
        expect(slope(w, f.x, f.z), at).toBeLessThanOrEqual(W.maxSlope + 1e-6);
        expect(nearPath(w, isl.id, f, W.pathGap - 0.05), `${at} on a path`).toBe(false);
        // the rail (local +x = (sin, −cos) of rotY) ends at the next post
        if (f.variant === P.variant) {
          const end = {
            x: f.x + Math.sin(f.rotY) * RIM_POST_LOOKS[0].railLen,
            z: f.z - Math.cos(f.rotY) * RIM_POST_LOOKS[0].railLen,
          };
          const next = Math.min(...posts.map((q) => Math.hypot(q.x - end.x, q.z - end.z)));
          expect(next, `${at} rail end`).toBeLessThan(0.05);
        }
      }
    }
    // TASK-480: a rim crowded with lots / hangars can leave a seed too little walk
    expect(walks / SEEDS.length).toBeGreaterThanOrEqual(0.85);
  });

  it('Q18 palm rim: palms inland of the walk, near it; two hammocks on the rim', () => {
    const palm = PROP_DEF_INDEX.palm;
    let rows = 0;
    let hammocks = 0;
    for (const seed of SEEDS) {
      const w = world(seed);
      const { isl } = qaOf(w);
      const ctx = `seed ${seed}`;
      let n = 0;
      for (let i = 0; i < w.props.count; i++) {
        if (w.props.defId[i] !== palm || w.props.islandId[i] !== isl.id) continue;
        n++;
        const c = cellOf(w, w.props.x[i], w.props.z[i]);
        expect(w.shoreSdf[c], `${ctx} palm inland of the walk`).toBeGreaterThan(8.5);
      }
      if (n >= 6) rows++;
      const hs = w.fixtures.filter((f) => f.islandId === isl.id && f.defId === 'hammock');
      expect(hs.length, ctx).toBeLessThanOrEqual(C.hammocks.count);
      for (const f of hs) {
        expect(f.variant, ctx).toBe(C.hammocks.variant);
        expect(heightAt(w.height, f.x, f.z), ctx).toBeGreaterThan(W.minY);
        expect(nearPath(w, isl.id, f, 1.5), `${ctx} hammock on a path`).toBe(false);
      }
      if (hs.length > 1)
        expect(Math.hypot(hs[0].x - hs[1].x, hs[0].z - hs[1].z)).toBeGreaterThan(
          C.hammocks.apart - 1e-6,
        );
      hammocks += hs.length;
    }
    expect(rows / SEEDS.length, 'palm rows').toBeGreaterThanOrEqual(0.7);
    expect(hammocks / SEEDS.length, 'hammocks per island').toBeGreaterThanOrEqual(1.6);
  });

  it('Q10 slalom: eight inspection buoys on the inspection boat ring, in deep water', () => {
    let lines = 0;
    for (const seed of SEEDS) {
      const w = world(seed);
      const { isl } = qaOf(w);
      const bs = w.fixtures.filter((f) => f.islandId === isl.id && f.defId === 'inspectionBuoy');
      if (bs.length === 0) continue;
      lines++;
      expect(bs.length, `seed ${seed}`).toBe(C.slalom.count);
      const R = isl.radius + CULTURE_BOATS.patrol.margin;
      for (const b of bs) {
        expect(Math.hypot(b.x - isl.cx, b.z - isl.cz)).toBeCloseTo(R, 3);
        expect(heightAt(w.height, b.x, b.z), `seed ${seed}`).toBeLessThanOrEqual(-C.slalom.depth);
      }
      for (let k = 1; k < bs.length; k++)
        expect(Math.hypot(bs[k].x - bs[k - 1].x, bs[k].z - bs[k - 1].z)).toBeCloseTo(
          C.slalom.spacing,
          1,
        );
    }
    expect(lines / SEEDS.length).toBeGreaterThanOrEqual(0.9);
  });

  it('Q15 grandstand: one dummyBench v1 beside the loop track, facing it', () => {
    let stands = 0;
    for (const seed of SEEDS) {
      const w = world(seed);
      const { isl } = qaOf(w);
      const fx = w.fixtures.filter((f) => f.islandId === isl.id);
      const gs = fx.filter((f) => f.defId === 'dummyBench' && f.variant === C.grandstand.variant);
      expect(gs.length, `seed ${seed}`).toBeLessThanOrEqual(1);
      const track = fx.find((f) => f.defId === 'testTrack');
      for (const g of gs) {
        expect(track, `seed ${seed}`).toBeDefined();
        const t = track as XZ;
        expect(Math.hypot(g.x - t.x, g.z - t.z), `seed ${seed}`).toBeLessThan(
          QA_PLAN.track[1] / 2 + 4,
        );
        // front (+z = dirOf(rotY)) toward the track
        const fwd = (t.x - g.x) * Math.cos(g.rotY) + (t.z - g.z) * Math.sin(g.rotY);
        expect(fwd, `seed ${seed}`).toBeGreaterThan(0);
      }
      stands += gs.length;
    }
    expect(stands / SEEDS.length).toBeGreaterThanOrEqual(0.8);
  });
});
