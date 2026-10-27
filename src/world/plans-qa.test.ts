import { describe, expect, it } from 'vitest';
import { QA_CULTURE, QA_CULTURE_SITES } from '../content/cultures/qa.ts';
import { PROP_DEFS, PROP_DEF_INDEX } from '../content/props.ts';
import { FIXTURE_RADIUS } from '../content/settlements.ts';
import { CULTURE_BOATS } from '../content/life.ts';
import { RIM_POST_LOOKS } from '../content/rim-walkway.ts';
import { QA_PLAN, QA_RIM_WALK } from '../content/themes/qa.ts';
import { QA_PROVING_PLAN } from '../content/themes/qa-proving.ts';
import { StageHash } from './gen/hash.ts';
import { CUSTOMS_PORT } from '../content/themes/qa-customs.ts';
import { frameToWorld, pathAt, portLayout, waterProbes } from './gen/customs-port.ts';
import { generateWorld, heightAt, planWhaleRoute, type WorldData, type XZ } from './index.ts';

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
      const tracks = fx.filter((f) => f.defId === 'testTrack' && !f.variant);
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
        "c6f5261ea443b4fa",
        "c4db94543db85476",
        "18a96c97e476063d",
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
    scoreboard: { n: [0, 2], share: 0.95 },
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
        // the Customs Port pieces (TASK-508) stand on a cut quay / in the water: their own test below
        if (f.islandId !== isl.id || !(KIT.has(f.defId) || f.defId === 'terrarium')) continue;
        if (['customsYard', 'scannerArch', 'quarantinePontoon'].includes(f.defId)) continue;
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
    // (TASK-499: the Proving Grounds stunt yard takes plateau ground too: 0.85 → 0.75;
    // TASK-508: the customs quay's pad and path block take the foot of the bluff: 0.75 → 0.65)
    expect(walks / SEEDS.length).toBeGreaterThanOrEqual(0.65);
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
    // (TASK-499: the palm row follows the walk, which the stunt yard shortens on some seeds: 0.7 → 0.6)
    expect(rows / SEEDS.length, 'palm rows').toBeGreaterThanOrEqual(0.6);
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

/** TASK-499 Proving Grounds: the stunt yard reservation for TASK-501 and the drop tower / fan / course. */
describe('QA Proving Grounds (TASK-499), 30 seeds', () => {
  const stuntOf = (w: WorldData) => {
    const { isl } = qaOf(w);
    const p = isl.anchors.stunt;
    const sz = isl.anchors.stuntSize;
    return p && sz ? { p, rot: p.rotY, w: sz.x, d: sz.z } : null;
  };
  /** Distance outside the rect (negative inside), like the planner's `shapeDist`. */
  const rectDist = (r: NonNullable<ReturnType<typeof stuntOf>>, q: XZ): number => {
    const dx = q.x - r.p.x;
    const dz = q.z - r.p.z;
    const u = Math.abs(-dx * Math.sin(r.rot) + dz * Math.cos(r.rot));
    const v = Math.abs(dx * Math.cos(r.rot) + dz * Math.sin(r.rot));
    const ox = u - r.w / 2;
    const oz = v - r.d / 2;
    return ox > 0 || oz > 0 ? Math.hypot(Math.max(ox, 0), Math.max(oz, 0)) : Math.max(ox, oz);
  };

  it('a flat stunt yard (≈ 2× the loop track) is kept free beside the loop track', () => {
    let found = 0;
    for (const seed of SEEDS) {
      const w = world(seed);
      const { isl } = qaOf(w);
      const r = stuntOf(w);
      if (!r) continue;
      found++;
      const ctx = `seed ${seed}`;
      expect(
        QA_PROVING_PLAN.stunt.some(([a, b]) => a === r.w && b === r.d),
        ctx,
      ).toBe(true);
      const track = w.fixtures.find(
        (f) => f.islandId === isl.id && f.defId === 'testTrack' && !f.variant,
      );
      expect(track, ctx).toBeDefined();
      expect(Math.hypot(r.p.x - (track as XZ).x, r.p.z - (track as XZ).z), ctx).toBeLessThan(
        QA_PROVING_PLAN.stuntSearch,
      );
      expect(heightAt(w.height, r.p.x, r.p.z), ctx).toBeGreaterThan(1);
      // the figure-8 crash track (TASK-501) is the yard's own fixture: it stands exactly on it
      const crash = w.fixtures.filter(
        (f) => f.islandId === isl.id && f.defId === 'testTrack' && f.variant === 1,
      );
      expect(crash.length, ctx).toBe(1);
      expect(Math.hypot(crash[0].x - r.p.x, crash[0].z - r.p.z), ctx).toBeLessThan(1e-6);
      for (const f of w.fixtures.filter((x) => x.islandId === isl.id && !crash.includes(x)))
        expect(rectDist(r, f), `${ctx} ${f.defId}`).toBeGreaterThan(0);
      for (const l of w.lots.filter((x) => x.islandId === isl.id))
        expect(rectDist(r, l), `${ctx} lot ${l.defId}`).toBeGreaterThan(0);
    }
    // TASK-508: the customs quay takes cove ground first: 29 → 25 of 30 seeds keep a yard
    expect(found / SEEDS.length).toBeGreaterThanOrEqual(0.8);
  });

  it('one drop tower, one test fan, a course of obstacle variants beside the yard', () => {
    let towers = 0;
    let fans = 0;
    let pieces = 0;
    for (const seed of SEEDS) {
      const w = world(seed);
      const { isl } = qaOf(w);
      const fx = w.fixtures.filter((f) => f.islandId === isl.id);
      const t = fx.filter((f) => f.defId === 'dropTower');
      const f = fx.filter((x) => x.defId === 'testFan');
      const o = fx.filter((x) => x.defId === 'obstacle');
      const ctx = `seed ${seed}`;
      expect(t.length, ctx).toBeLessThanOrEqual(1);
      expect(f.length, ctx).toBeLessThanOrEqual(1);
      // the empty cradle (v1): the crate rides it as a mover (TASK-501)
      for (const x of t) expect(x.variant, ctx).toBe(1);
      const variants = o.map((x) => x.variant ?? 0);
      expect(new Set(variants).size, ctx).toBe(variants.length);
      for (const v of variants) expect(v, ctx).toBeLessThan(4);
      // all of it within reach of the stunt yard (else of the loop track)
      const track = fx.find((x) => x.defId === 'testTrack' && !x.variant) as XZ;
      const r = stuntOf(w);
      for (const x of [...t, ...f, ...o])
        expect(r ? rectDist(r, x) : Math.hypot(x.x - track.x, x.z - track.z), ctx).toBeLessThan(26);
      towers += t.length;
      fans += f.length;
      pieces += o.length;
    }
    expect(towers / SEEDS.length).toBeGreaterThanOrEqual(0.9);
    expect(fans / SEEDS.length).toBeGreaterThanOrEqual(0.9);
    expect(pieces / SEEDS.length).toBeGreaterThanOrEqual(3);
  });
});

/** TASK-508 Customs Port: the quay on the lee cove, the arch over the ship lane, the pontoons. */
describe('QA Customs Port placement (TASK-508), 30 seeds', () => {
  const portOf = (w: WorldData) => {
    const { isl } = qaOf(w);
    const a = isl.anchors.customs;
    const f = isl.anchors.customsFlip;
    const l = isl.anchors.customsLane;
    if (!a || !f || !l) return null;
    const lay = portLayout({ sl: f.z > 0 ? 1 : -1, lane: l.x });
    const toWorld = (p: XZ): XZ => frameToWorld(a.x, a.z, a.rotY, p.x, p.z);
    return { isl, a, lay, toWorld, pass: l.z };
  };
  const rectDistTo = (
    r: { p: { x: number; z: number }; rot: number; w: number; d: number },
    q: XZ,
  ): number => {
    const dx = q.x - r.p.x;
    const dz = q.z - r.p.z;
    const u = Math.abs(-dx * Math.sin(r.rot) + dz * Math.cos(r.rot)) - r.w / 2;
    const v = Math.abs(dx * Math.cos(r.rot) + dz * Math.sin(r.rot)) - r.d / 2;
    return u > 0 || v > 0 ? Math.hypot(Math.max(u, 0), Math.max(v, 0)) : Math.max(u, v);
  };

  it('every seed gets a port: crane (v1), one inspection line (v2), a stack (v4), the arch, 2-3 pontoons', () => {
    const passes = [0, 0, 0];
    for (const seed of SEEDS) {
      const w = world(seed);
      const p = portOf(w);
      const ctx = `seed ${seed}`;
      expect(p, ctx).not.toBeNull();
      if (!p) continue;
      passes[p.pass]++;
      const fx = w.fixtures.filter((f) => f.islandId === p.isl.id);
      const yard = fx.filter((f) => f.defId === 'customsYard');
      expect(yard.filter((f) => f.variant === 1).length, ctx).toBe(1);
      expect(yard.filter((f) => f.variant === 2).length, ctx).toBe(1);
      expect(yard.filter((f) => f.variant === 4).length, ctx).toBeLessThanOrEqual(1);
      expect(
        yard.every((f) => [1, 2, 4].includes(f.variant ?? -1)),
        ctx,
      ).toBe(true);
      expect(fx.filter((f) => f.defId === 'scannerArch').length, ctx).toBe(1);
      const pon = fx.filter((f) => f.defId === 'quarantinePontoon');
      expect(pon.length, ctx).toBeGreaterThanOrEqual(2);
      expect(pon.length, ctx).toBeLessThanOrEqual(3);
      // the quay stands on level land, the pontoons float, the arch and the lane are open water
      const crane = yard.find((f) => f.variant === 1) as XZ;
      expect(Math.hypot(crane.x - p.a.x, crane.z - p.a.z), ctx).toBeLessThan(1e-6);
      expect(heightAt(w.height, crane.x, crane.z), ctx).toBeGreaterThan(0.3);
      const line = yard.find((f) => f.variant === 2) as XZ;
      expect(heightAt(w.height, line.x, line.z), ctx).toBeGreaterThan(0.3);
      expect(
        Math.abs(heightAt(w.height, line.x, line.z) - heightAt(w.height, crane.x, crane.z)),
        ctx,
      ).toBeLessThan(0.6);
      for (const f of pon) expect(heightAt(w.height, f.x, f.z), ctx).toBeLessThan(-0.15);
      // crane faces the water: local +z (= rotY) points to open sea
      const ahead = { x: crane.x + Math.cos(p.a.rotY) * 6, z: crane.z + Math.sin(p.a.rotY) * 6 };
      expect(heightAt(w.height, ahead.x, ahead.z), ctx).toBeLessThan(0.05);
    }
    // the cove itself takes most seeds; the rest fall back to a rougher pad / a nearer pontoon
    expect(passes[0] + passes[1] + passes[2]).toBe(SEEDS.length);
    expect(passes[0]).toBeGreaterThanOrEqual(8);
  });

  it('the ship water is dredged and open: berth, spin disc and lane, clear of land and the pier', () => {
    for (const seed of SEEDS) {
      const w = world(seed);
      const p = portOf(w);
      if (!p) continue;
      const ctx = `seed ${seed}`;
      const docks = w.docks.filter((d) => d.islandId === p.isl.id);
      for (const pr of waterProbes(p.lay)) {
        const q = p.toWorld(pr);
        expect(heightAt(w.height, q.x, q.z), `${ctx} probe ${pr.kind}`).toBeLessThan(-0.7);
        const near = pr.kind === 'near' || pr.kind === 'ring';
        if (!near)
          expect(-sampleShore(w, q), `${ctx} shore ${pr.kind}`).toBeGreaterThan(pr.r * 0.5);
        for (const d of docks) {
          const L = d.segments * 2;
          const a = { x: d.x, z: d.z };
          const b = { x: d.x + Math.cos(d.rotY) * L, z: d.z + Math.sin(d.rotY) * L };
          expect(segDist(q, a, b), `${ctx} pier ${pr.kind}`).toBeGreaterThan(pr.r * 0.5);
        }
      }
    }
  });

  it('keeps off the Proving Grounds stunt yard, its track and the loop track', () => {
    for (const seed of SEEDS) {
      const w = world(seed);
      const p = portOf(w);
      if (!p) continue;
      const ctx = `seed ${seed}`;
      const sp = p.isl.anchors.stunt;
      const sz = p.isl.anchors.stuntSize;
      const pts = [{ x: p.a.x, z: p.a.z }, ...p.lay.pontoons.map(p.toWorld), p.toWorld(p.lay.ok)];
      if (sp && sz)
        for (const q of pts)
          expect(rectDistTo({ p: sp, rot: sp.rotY, w: sz.x, d: sz.z }, q), ctx).toBeGreaterThan(6);
      for (const f of w.fixtures.filter(
        (x) => x.islandId === p.isl.id && ['dropTower', 'testFan', 'testTrack'].includes(x.defId),
      ))
        expect(Math.hypot(f.x - p.a.x, f.z - p.a.z), `${ctx} ${f.defId}`).toBeGreaterThan(6);
    }
  });

  it('the ship lane stays clear of the ferry and boat routes', () => {
    for (const seed of SEEDS) {
      const w = world(seed);
      const p = portOf(w);
      if (!p) continue;
      const ctx = `seed ${seed}`;
      const o = { x: 0, z: 0, hx: 0, hz: 0 };
      const lane: XZ[] = [];
      for (let d = 0; d <= p.lay.path.length; d += 2)
        lane.push(p.toWorld(pathAt(p.lay.path, d, o)));
      for (const r of w.boatRoutes) {
        let m = Infinity;
        for (const q of lane)
          for (const s of r.points) m = Math.min(m, Math.hypot(q.x - s.x, q.z - s.z));
        expect(m, `${ctx} route`).toBeGreaterThan(CUSTOMS_PORT.keepOut.lane - 2.5); // route smoothing may cut a corner
      }
    }
  });

  it('the whale route keeps off the ship lane', () => {
    for (const seed of SEEDS.slice(0, 12)) {
      const w = world(seed);
      const p = portOf(w);
      const route = planWhaleRoute(w, seed);
      if (!p || !route) continue;
      const o = { x: 0, z: 0, hx: 0, hz: 0 };
      let m = Infinity;
      for (let d = 0; d <= p.lay.path.length; d += 3) {
        const q = p.toWorld(pathAt(p.lay.path, d, o));
        for (let i = 0; i < route.pts.length; i += 2)
          m = Math.min(m, Math.hypot(q.x - route.pts[i], q.z - route.pts[i + 1]));
      }
      expect(m, `seed ${seed}`).toBeGreaterThan(8);
    }
  });

  it('the island plan still has its pier, yard and campus', () => {
    for (const seed of SEEDS) {
      const w = world(seed);
      const { isl, s } = qaOf(w);
      expect(
        w.docks.some((d) => d.islandId === isl.id),
        `seed ${seed}`,
      ).toBe(true);
      expect(s?.plaza, `seed ${seed}`).not.toBeNull();
    }
  });
});

function sampleShore(w: WorldData, q: XZ): number {
  const h = w.height;
  const ix = Math.round((q.x - h.originX) / h.cellSize);
  const iz = Math.round((q.z - h.originZ) / h.cellSize);
  return w.shoreSdf[iz * h.n + ix];
}
