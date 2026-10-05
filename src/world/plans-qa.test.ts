import { describe, expect, it } from 'vitest';
import { Scope } from '../core/scope.ts';
import { PROP_DEFS, PROP_DEF_INDEX } from '../content/props.ts';
import { LANDMARKS } from '../content/settlements.ts';
import { QA_PLAN } from '../content/themes/qa.ts';
import { RAISED_FLOOR } from '../content/offices.ts';
import { makeCtx } from '../life/ctx.ts';
import { buildWalkGraph, walkRoute } from '../life/land-world.ts';
import { attachDeckSpurs } from '../life/workers-world.ts';
import { StageHash } from './gen/hash.ts';
import { generateWorld, heightAt, type WorldData, type XZ } from './index.ts';

// M14b TASK-366: the QA island plan (Palmlagoon atoll), 30 seeds.
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

describe('QA island plan (TASK-366), 30 seeds', () => {
  it('landmarks at T0: the bug wreck and the inspection tower opposite the channel', () => {
    const towerTier = PROP_DEFS[PROP_DEF_INDEX.inspectionTower].tier;
    expect(towerTier).toBe(0);
    let opposite = 0;
    for (const seed of SEEDS) {
      const w = world(seed);
      const { isl, s, lots } = qaOf(w);
      const ctx = `seed ${seed}`;
      expect(s, ctx).toBeDefined();
      expect(
        s?.landmarks.map((i) => w.landmarks[i].kind),
        ctx,
      ).toContain('sunkenShip');
      const tower = lots.find((l) => l.defId === 'inspectionTower');
      expect(tower, `${ctx} inspection tower`).toBeDefined();
      const ch = isl.anchors.channel0;
      const c = isl.anchors.lagoon;
      if (tower && ch && c) {
        const want = Math.atan2(ch.z - c.z, ch.x - c.x) + Math.PI;
        if (angDiff(Math.atan2(tower.z - c.z, tower.x - c.x), want) <= Math.PI / 4) opposite++;
      }
    }
    console.info(`inspection tower within 45° of opposite the channel: ${opposite}/30`);
    expect(opposite).toBeGreaterThanOrEqual(27);
  });

  it('lots: ≥ 4 (test labs + tower + stilt lab) in ≥ 90 % of seeds, all connected to the hub', () => {
    let ok = 0;
    const counts: number[] = [];
    for (const seed of SEEDS) {
      const w = world(seed);
      const { s, lots } = qaOf(w);
      if (!s) continue;
      counts.push(lots.length);
      if (lots.length >= 4) ok++;
      expect(s.plaza, `seed ${seed} lab quad`).not.toBeNull();
      expect(lots.filter((l) => l.defId === 'testLab').length, `seed ${seed}`).toBeGreaterThan(0);
      const seen = reachable(w, s.hub.node);
      for (const l of lots) expect(seen[l.node], `seed ${seed} ${l.defId}`).toBe(1);
      for (const di of s.docks)
        if (w.docks[di].node >= 0) expect(seen[w.docks[di].node], `seed ${seed} dock`).toBe(1);
      // the lead office is a test lab
      expect(lots.find((l) => l.role === 'main')?.defId, `seed ${seed}`).toBe('testLab');
    }
    console.info(`QA lots per seed: ${counts.join(' ')}`);
    expect(ok / SEEDS.length).toBeGreaterThanOrEqual(0.9);
  });

  it('checkpoints: ≥ 3 barrier gates on the Loop, spaced, across the path', () => {
    const counts: number[] = [];
    for (const seed of SEEDS) {
      const w = world(seed);
      const { isl } = qaOf(w);
      const gates = w.fixtures.filter((f) => f.islandId === isl.id && f.defId === 'barrierGate');
      counts.push(gates.length);
      expect(gates.length, `seed ${seed}`).toBeGreaterThanOrEqual(3);
      const paths = w.paths.filter((p) => p.islandId === isl.id && p.kind === 'path');
      for (const g of gates) {
        const ctx = `seed ${seed} gate @${g.x.toFixed(1)},${g.z.toFixed(1)}`;
        // on the built footpath, and the gate's front (+z = rotY) runs along it
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
        expect(heightAt(w.height, g.x, g.z), ctx).toBeGreaterThan(0.3);
        for (const o of gates)
          if (o !== g)
            expect(Math.hypot(o.x - g.x, o.z - g.z), ctx).toBeGreaterThanOrEqual(
              QA_PLAN.gateSpacing - 1e-6,
            );
      }
    }
    console.info(`barrier gates per seed: ${counts.join(' ')}`);
  });

  it('the stilt lab is reached over its boardwalk: walk graph route from the hub, spur on the planks', () => {
    for (const seed of SEEDS) {
      const w = world(seed);
      const { isl, s, lots } = qaOf(w);
      const lab = lots.find((l) => l.defId === 'testLabStilt');
      const ctx = `seed ${seed}`;
      expect(lab, `${ctx} stilt lab`).toBeDefined();
      if (!lab || !s) continue;
      expect(RAISED_FLOOR[lab.defId]).toBeGreaterThan(0);
      expect(heightAt(w.height, lab.x, lab.z), ctx).toBeLessThan(-0.3);
      // world data: a straight 'boardwalk' path from the door to the shore
      const bw = w.paths.find(
        (p) =>
          p.islandId === isl.id &&
          p.kind === 'boardwalk' &&
          p.points.some((q) => Math.hypot(q.x - lab.x, q.z - lab.z) < 3),
      );
      expect(bw, `${ctx} boardwalk`).toBeDefined();
      if (!bw) continue;
      const a = bw.points[0];
      const b = bw.points[bw.points.length - 1];
      // life: the door joins the hub's walk component; the deck spur runs along the boardwalk
      const lc = makeCtx({
        world: w,
        scope: new Scope('qa-plan'),
        seed,
        quality: 'medium',
        water: { splat: () => undefined },
        counters: { agents: 0 } as never,
        getTier: () => 2,
        // the walk graph never reads the camera
        cameraPos: { x: 0, y: 0, z: 0 } as never,
      });
      const g = buildWalkGraph(lc);
      const n0 = g.n;
      attachDeckSpurs(lc, g);
      expect(g.comp[lab.node], ctx).toBeGreaterThanOrEqual(0);
      expect(g.comp[lab.node], ctx).toBe(g.comp[s.hub.node]);
      expect(walkRoute(g, s.hub.node, lab.node), ctx).not.toBeNull();
      for (let i = n0; i < g.n; i++) {
        const p = { x: g.x[i], z: g.z[i] };
        if (Math.hypot(p.x - lab.x, p.z - lab.z) > 12) continue;
        expect(segDist(p, a, b), `${ctx} spur node off the boardwalk`).toBeLessThan(1.2);
      }
    }
  });

  it('the wreck is ringed by inspection buoys', () => {
    for (const seed of SEEDS) {
      const w = world(seed);
      const { isl } = qaOf(w);
      const wreck = w.landmarks.find((m) => m.islandId === isl.id && m.kind === 'sunkenShip');
      if (!wreck) continue;
      const r = (LANDMARKS.sunkenShip.radius ?? 6) + QA_PLAN.wreckBuoyGap;
      const buoys = w.fixtures.filter(
        (f) =>
          f.islandId === isl.id &&
          f.defId === 'inspectionBuoy' &&
          Math.abs(Math.hypot(f.x - wreck.x, f.z - wreck.z) - r) < 0.01,
      );
      expect(buoys.length, `seed ${seed}`).toBeGreaterThanOrEqual(4);
      for (const b of buoys) expect(heightAt(w.height, b.x, b.z)).toBeLessThan(0);
    }
  });

  it('leftover audit: no cottage / beach-hut / keeper leftovers, palms ×0.6', () => {
    const palmDef = PROP_DEF_INDEX.palm;
    for (const seed of SEEDS) {
      const w = world(seed);
      const { isl } = qaOf(w);
      const ctx = `seed ${seed}`;
      const defs = w.lots.filter((l) => l.islandId === isl.id).map((l) => l.defId);
      for (const d of ['cottage', 'stiltHut', 'logCabin', 'towerHouse', 'barn', 'marketStall'])
        expect(defs, ctx).not.toContain(d);
      const fx = w.fixtures.filter((f) => f.islandId === isl.id).map((f) => f.defId);
      expect(fx, ctx).not.toContain('buoy');
      expect(fx, ctx).not.toContain('well');
      let palms = 0;
      for (let i = 0; i < w.props.count; i++)
        if (w.props.islandId[i] === isl.id && w.props.defId[i] === palmDef) palms++;
      expect(palms, ctx).toBeLessThanOrEqual(48);
    }
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
        "90dadf38d818a3de",
        "d3e50216ff553f30",
        "0919a39347571761",
      ]
    `);
  });
});
