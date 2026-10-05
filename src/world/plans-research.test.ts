import { describe, expect, it } from 'vitest';
import { heroAzimuth } from '../camera/poses.ts';
import { PROP_DEFS } from '../content/props.ts';
import { RESEARCH_OUTPOST } from '../content/settlements.ts';
import { generateWorld, heightAt, type WorldData, type XZ } from './index.ts';

/** Research outpost plan (M14b §2.7, TASK-368) over 30 seeds. */
const SEEDS = Array.from({ length: 30 }, (_, k) => 1000 + k * 263);
const cache = new Map<number, WorldData>();
const world = (seed: number): WorldData => {
  let w = cache.get(seed);
  if (!w) {
    w = generateWorld(seed);
    cache.set(seed, w);
  }
  return w;
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
  if (start < 0) return seen;
  const q = [start];
  seen[start] = 1;
  while (q.length > 0) {
    const c = q.pop() as number;
    for (const m of adj[c])
      if (!seen[m]) {
        seen[m] = 1;
        q.push(m);
      }
  }
  return seen;
}

function research(seed: number) {
  const w = world(seed);
  const isl = w.islands.find((i) => i.theme === 'research');
  if (!isl) return null;
  const on = <T extends { islandId: number }>(a: readonly T[]): T[] =>
    a.filter((x) => x.islandId === isl.id);
  return {
    w,
    isl,
    lots: on(w.lots),
    fixtures: on(w.fixtures),
    landmarks: on(w.landmarks),
    fences: on(w.fences),
    settlement: w.settlements.find((s) => s.islandId === isl.id),
  };
}

describe('Research outpost plan (TASK-368) — 30 seeds', () => {
  it(
    'palm landmark; one researchHut in ≥ 90 %; observatory + weather mast beside it',
    { timeout: 60_000 },
    () => {
      let n = 0;
      let one = 0;
      let extras = 0;
      for (const seed of SEEDS) {
        const d = research(seed);
        if (!d) continue;
        n++;
        expect(
          d.landmarks.map((l) => l.kind),
          `seed ${seed}`,
        ).toEqual(['lonelyPalm']);
        if (d.lots.length === 1 && d.lots[0].defId === 'researchHut') one++;
        const defs = d.fixtures.map((f) => f.defId);
        if (defs.includes('observatory') && defs.includes('weatherMast')) extras++;
      }
      expect(n).toBeGreaterThan(20);
      expect(one / n, 'one hut').toBeGreaterThanOrEqual(0.9);
      expect(extras / n, 'observatory + weather mast').toBeGreaterThanOrEqual(0.9);
      // the observatory reads from T0
      expect(PROP_DEFS.find((p) => p.id === 'observatory')?.tier).toBe(0);
    },
  );

  it('W9: hut, telescope, observatory and mast keep off the palm and its hero line', () => {
    for (const seed of SEEDS) {
      const d = research(seed);
      if (!d) continue;
      const palm = d.isl.anchors.palm;
      const az = heroAzimuth(d.isl, d.w.islands);
      const vx = -Math.sin((az * Math.PI) / 180);
      const vz = -Math.cos((az * Math.PI) / 180);
      const things: (XZ & { defId: string })[] = [
        ...d.lots,
        ...d.fixtures.filter((f) => f.defId !== 'messageBottle'),
      ];
      for (const p of things) {
        const ctx = `seed ${seed} ${p.defId}`;
        const dx = p.x - palm.x;
        const dz = p.z - palm.z;
        const dd = Math.hypot(dx, dz);
        expect(dd, ctx).toBeGreaterThanOrEqual(RESEARCH_OUTPOST.palmClear - 1e-6);
        const off = (Math.acos(Math.abs((dx * vx + dz * vz) / dd)) * 180) / Math.PI;
        expect(off, `${ctx} off the hero line`).toBeGreaterThanOrEqual(
          RESEARCH_OUTPOST.viewClearDeg,
        );
        expect(heightAt(d.w.height, p.x, p.z), `${ctx} on land`).toBeGreaterThan(0);
      }
    }
  });

  it('connected: hut and dock reach the hub', () => {
    for (const seed of SEEDS) {
      const d = research(seed);
      if (!d?.settlement) continue;
      const s = d.settlement;
      const seen = reachable(d.w, s.hub.node);
      for (const li of s.lots) expect(seen[d.w.lots[li].node], `seed ${seed} hut`).toBe(1);
      for (const di of s.docks) expect(seen[d.w.docks[di].node], `seed ${seed} dock`).toBe(1);
    }
  });

  it('instrument buoys float off the beach; leftover audit (outpost defs only, no fences)', () => {
    let n = 0;
    let withBuoys = 0;
    for (const seed of SEEDS) {
      const d = research(seed);
      if (!d) continue;
      n++;
      const ctx = `seed ${seed}`;
      for (const l of d.lots) expect(l.defId, ctx).toBe('researchHut');
      for (const f of d.fixtures)
        expect(['messageBottle', 'telescope', 'observatory', 'weatherMast'], ctx).toContain(
          f.defId,
        );
      expect(d.fences, ctx).toEqual([]);
      const p = d.w.props;
      let buoys = 0;
      for (let i = 0; i < p.count; i++) {
        if (p.islandId[i] !== d.isl.id || PROP_DEFS[p.defId[i]].id !== 'instrumentBuoy') continue;
        buoys++;
        expect(p.y[i], `${ctx} buoy at the waterline`).toBe(0);
        expect(heightAt(d.w.height, p.x[i], p.z[i]), `${ctx} buoy over water`).toBeLessThan(0);
      }
      if (buoys > 0) withBuoys++;
    }
    expect(withBuoys / n, 'instrument buoys').toBeGreaterThanOrEqual(0.8);
  });
});
