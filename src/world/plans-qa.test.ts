import { describe, expect, it } from 'vitest';
import { PROP_DEFS, PROP_DEF_INDEX } from '../content/props.ts';
import { QA_PLAN } from '../content/themes/qa.ts';
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
      for (const d of ['buoy', 'inspectionBuoy', 'tidePool', 'well'])
        expect(fx, ctx).not.toContain(d);
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
        "0d6eb4f708e3c0df",
        "66e1cb20b0808662",
        "b050a5f651194303",
      ]
    `);
  });
});
