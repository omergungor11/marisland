import { describe, expect, it } from 'vitest';
import { PROP_DEFS, PROP_DEF_INDEX } from '../content/props.ts';
import { THEMES } from '../content/themes/index.ts';
import { MARKETING_PLAN } from '../content/themes/marketing.ts';
import { StageHash } from './gen/hash.ts';
import { generateWorld, heightAt, zoneAt, Zone, type WorldData } from './index.ts';

// M14b TASK-365: the Marketing island plan (Beacon Rock sea stack), 30 seeds.
const SEEDS = Array.from({ length: 30 }, (_, k) => 1000 + k * 263);
const cache = new Map<number, WorldData>();
const world = (seed: number): WorldData => {
  let w = cache.get(seed);
  if (!w) cache.set(seed, (w = generateWorld(seed)));
  return w;
};
const mktOf = (w: WorldData) => {
  const isl = w.islands.find((i) => i.theme === 'marketing');
  if (!isl) throw new Error('no Marketing island');
  const s = w.settlements.find((x) => x.islandId === isl.id);
  return {
    isl,
    s,
    lots: (s?.lots ?? []).map((i) => w.lots[i]),
    fx: w.fixtures.filter((f) => f.islandId === isl.id),
  };
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

describe('Marketing island plan (TASK-365), 30 seeds', () => {
  it('the Broadcast Tower (lighthouse variant 2) is the landmark, drawn from T0', () => {
    expect(THEMES.marketing.landmarkVariant.lighthouse).toBe(2);
    expect(PROP_DEFS[PROP_DEF_INDEX.lighthouse].tier).toBe(0);
    for (const seed of SEEDS) {
      const w = world(seed);
      const { s } = mktOf(w);
      expect(
        s?.landmarks.map((i) => w.landmarks[i].kind),
        `seed ${seed}`,
      ).toEqual(['lighthouse']);
    }
  });

  it('Studio Ledge: ≥ 2 lots (broadcastStudio + billboard office) in ≥ 90 %, all connected', () => {
    let ok = 0;
    const counts: number[] = [];
    for (const seed of SEEDS) {
      const w = world(seed);
      const { s, lots } = mktOf(w);
      if (!s) continue;
      counts.push(lots.length);
      const defs = lots.map((l) => l.defId);
      if (lots.length >= 2 && defs.includes('broadcastStudio') && defs.includes('billboard')) ok++;
      const seen = reachable(w, s.hub.node);
      for (const l of lots) expect(seen[l.node], `seed ${seed} ${l.defId}`).toBe(1);
      for (const di of s.docks)
        if (w.docks[di].node >= 0) expect(seen[w.docks[di].node], `seed ${seed} dock`).toBe(1);
    }
    console.info(`Marketing lots per seed: ${counts.join(' ')}`);
    expect(ok / SEEDS.length).toBeGreaterThanOrEqual(0.9);
  });

  it('Clifftop Stage: quad (plaza) with the stage facing it and banner poles; Landing kiosk', () => {
    let stages = 0;
    for (const seed of SEEDS) {
      const w = world(seed);
      const { s, fx } = mktOf(w);
      const ctx = `seed ${seed}`;
      expect(s?.plaza, ctx).not.toBeNull();
      if (!s?.plaza) continue;
      expect(zoneAt(w.height, w.zone, s.plaza.x, s.plaza.z), ctx).toBe(Zone.plaza);
      const stage = fx.find((f) => f.defId === 'stage');
      if (stage) {
        stages++;
        // front (+z = rotY) toward the quad centre
        const dx = s.plaza.x - stage.x;
        const dz = s.plaza.z - stage.z;
        const d = Math.hypot(dx, dz);
        expect((Math.cos(stage.rotY) * dx + Math.sin(stage.rotY) * dz) / d, ctx).toBeGreaterThan(
          0.99,
        );
        expect(fx.filter((f) => f.defId === 'bannerPole').length, ctx).toBeGreaterThanOrEqual(1);
      }
      const kiosk = fx.find((f) => f.defId === 'megaphoneKiosk');
      expect(kiosk, `${ctx} kiosk`).toBeDefined();
      if (kiosk) expect(heightAt(w.height, kiosk.x, kiosk.z), ctx).toBeGreaterThan(0.3);
      expect(s.docks.length, ctx).toBe(1);
    }
    expect(stages / SEEDS.length).toBeGreaterThanOrEqual(0.9);
  });

  it('two billboards on ledges face the archipelago centre, tops below the tower', () => {
    let two = 0;
    for (const seed of SEEDS) {
      const w = world(seed);
      const { isl, fx } = mktOf(w);
      const lh = w.landmarks.find((m) => m.islandId === isl.id && m.kind === 'lighthouse');
      if (!lh) continue;
      const top = heightAt(w.height, lh.x, lh.z) + MARKETING_PLAN.towerHeight;
      const cx = w.islands.reduce((a, o) => a + o.cx, 0) / w.islands.length;
      const cz = w.islands.reduce((a, o) => a + o.cz, 0) / w.islands.length;
      const bbs = fx.filter((f) => f.defId === 'billboardV2');
      if (bbs.length === MARKETING_PLAN.billboard.count) two++;
      for (const b of bbs) {
        const ctx = `seed ${seed} billboard @${b.x.toFixed(1)},${b.z.toFixed(1)}`;
        const y = heightAt(w.height, b.x, b.z);
        expect(y, ctx).toBeGreaterThan(0.3);
        expect(y + MARKETING_PLAN.billboard.height, ctx).toBeLessThan(top);
        const d = Math.hypot(cx - b.x, cz - b.z);
        const facing = (Math.cos(b.rotY) * (cx - b.x) + Math.sin(b.rotY) * (cz - b.z)) / d;
        expect(facing, ctx).toBeGreaterThan(0.999);
      }
    }
    expect(two / SEEDS.length).toBeGreaterThanOrEqual(0.9);
  });

  it('leftover audit: no keeper cottage, ad buoys instead of plain buoys, lawn on the summit', () => {
    for (const seed of SEEDS) {
      const w = world(seed);
      const { isl, fx } = mktOf(w);
      const ctx = `seed ${seed}`;
      const defs = w.lots.filter((l) => l.islandId === isl.id).map((l) => l.defId);
      for (const d of ['cottage', 'stiltHut', 'logCabin', 'towerHouse', 'barn'])
        expect(defs, ctx).not.toContain(d);
      expect(
        fx.map((f) => f.defId),
        ctx,
      ).not.toContain('buoy');
      expect(fx.filter((f) => f.defId === 'adBuoy').length, ctx).toBeGreaterThanOrEqual(1);
      // the stack top reads as brand lawn, not bare rock
      let lawn = 0;
      let top = 0;
      const n = w.height.n;
      for (let i = 0; i < n * n; i++) {
        if (w.islandMap[i] !== isl.id + 1 || w.height.data[i] < isl.peakY * 0.8) continue;
        top++;
        if (w.zone[i] === Zone.grass || w.zone[i] === Zone.meadow) lawn++;
      }
      expect(lawn / Math.max(1, top), ctx).toBeGreaterThan(0.4);
    }
  });

  it('deterministic: per-island snapshot', () => {
    const got = [1, 42, 1337].map((seed) => {
      const w = generateWorld(seed);
      const h = islandHash(w, mktOf(w).isl.id);
      expect(islandHash(generateWorld(seed), mktOf(w).isl.id)).toBe(h);
      return h;
    });
    expect(got).toMatchInlineSnapshot(`
      [
        "fbda65e4b23eeca8",
        "7587e739b19cd86f",
        "6154e1793c892e69",
      ]
    `);
  });
});
