import { describe, expect, it } from 'vitest';
import { PROP_DEFS } from '../content/props.ts';
import { FIXTURE_RADIUS } from '../content/settlements.ts';
import { RESEARCH_SITE } from '../content/themes/research.ts';
import { generateWorld, heightAt, Zone, type WorldData } from './index.ts';

/** Research "Biodome Lab" plan (TASK-400, M17b) over 30 seeds. */
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
  const fixtures = on(w.fixtures);
  return {
    w,
    isl,
    lots: on(w.lots),
    fixtures,
    hero: fixtures.find((f) => f.defId === 'biodomeHero'),
    small: fixtures.filter((f) => f.defId === 'biodome'),
    vessel: fixtures.find((f) => f.defId === 'researchVessel'),
    landmarks: on(w.landmarks),
    docks: on(w.docks),
    settlement: w.settlements.find((s) => s.islandId === isl.id),
  };
}

describe('Research Biodome Lab plan (TASK-400) — 30 seeds', () => {
  it('hero dome on every crater; 2 small domes in ≥ 80 %; no lots, landmarks or leftovers', () => {
    let n = 0;
    let two = 0;
    for (const seed of SEEDS) {
      const d = research(seed);
      if (!d) continue;
      n++;
      const ctx = `seed ${seed}`;
      expect(d.hero, ctx).toBeDefined();
      expect(d.lots, ctx).toEqual([]);
      expect(d.landmarks, ctx).toEqual([]);
      for (const f of d.fixtures)
        expect(['biodomeHero', 'biodome', 'researchVessel'], ctx).toContain(f.defId);
      if (d.small.length === RESEARCH_SITE.small.count) two++;
    }
    expect(n).toBeGreaterThan(20);
    expect(two / n, 'two small domes').toBeGreaterThanOrEqual(0.8);
    // the hero dome reads from T0
    expect(PROP_DEFS.find((p) => p.id === 'biodomeHero')?.tier).toBe(0);
  });

  it('crater: the hero dome sits in the bowl below the rim; domes on land, apart, off the door line', () => {
    for (const seed of SEEDS) {
      const d = research(seed);
      if (!d?.hero) continue;
      const { w, isl, hero } = d;
      const ctx = `seed ${seed}`;
      const yHero = heightAt(w.height, hero.x, hero.z);
      expect(yHero, `${ctx} bowl above the sea`).toBeGreaterThan(2.5);
      expect(isl.peakY - yHero, `${ctx} rim above the bowl`).toBeGreaterThan(1);
      const domes = [hero, ...d.small];
      for (let a = 0; a < domes.length; a++) {
        const ra = FIXTURE_RADIUS[domes[a].defId];
        expect(heightAt(w.height, domes[a].x, domes[a].z), ctx).toBeGreaterThan(1);
        for (let b = a + 1; b < domes.length; b++) {
          const rb = FIXTURE_RADIUS[domes[b].defId];
          const dd = Math.hypot(domes[a].x - domes[b].x, domes[a].z - domes[b].z);
          expect(dd, `${ctx} domes apart`).toBeGreaterThanOrEqual(ra + rb);
        }
      }
      // the door faces the breach (leeward); small domes keep off its sector
      const lx = Math.cos(w.windDir);
      const lz = Math.sin(w.windDir);
      expect(Math.cos(hero.rotY) * lx + Math.sin(hero.rotY) * lz, ctx).toBeCloseTo(1, 6);
      for (const s of d.small) {
        const dx = s.x - hero.x;
        const dz = s.z - hero.z;
        const c = (dx * lx + dz * lz) / Math.hypot(dx, dz);
        expect(c, `${ctx} small dome off the door sector`).toBeLessThan(RESEARCH_SITE.doorCos);
      }
    }
  });

  it('cove: a leeward pier on low ground, the vessel floating beside it in ≥ 90 %', () => {
    let n = 0;
    let moored = 0;
    for (const seed of SEEDS) {
      const d = research(seed);
      if (!d) continue;
      n++;
      const ctx = `seed ${seed}`;
      expect(d.docks.length, ctx).toBe(1);
      const dk = d.docks[0];
      expect(heightAt(d.w.height, dk.x, dk.z), `${ctx} pier root`).toBeLessThanOrEqual(1.5);
      const lee =
        (dk.x - d.isl.cx) * Math.cos(d.w.windDir) + (dk.z - d.isl.cz) * Math.sin(d.w.windDir);
      expect(lee, `${ctx} pier on the leeward side`).toBeGreaterThan(0);
      if (!d.vessel) continue;
      moored++;
      expect(heightAt(d.w.height, d.vessel.x, d.vessel.z), `${ctx} vessel afloat`).toBeLessThan(
        -RESEARCH_SITE.vessel.minDepth,
      );
      const L = dk.segments * 2;
      expect(
        Math.hypot(d.vessel.x - dk.x, d.vessel.z - dk.z),
        `${ctx} vessel by the pier`,
      ).toBeLessThan(L + 6);
    }
    expect(moored / n, 'vessel moored').toBeGreaterThanOrEqual(0.9);
  });

  it('connected: the hero door hub reaches the pier', () => {
    for (const seed of SEEDS) {
      const d = research(seed);
      if (!d?.settlement) continue;
      const s = d.settlement;
      expect(s.hub.node, `seed ${seed} hub`).toBeGreaterThanOrEqual(0);
      const seen = reachable(d.w, s.hub.node);
      for (const di of s.docks) expect(seen[d.w.docks[di].node], `seed ${seed} dock`).toBe(1);
    }
  });

  it('rim crystals in ≥ 80 %, above the bowl; instrument buoys float off the beach', () => {
    let n = 0;
    let withCrystals = 0;
    let withBuoys = 0;
    for (const seed of SEEDS) {
      const d = research(seed);
      if (!d) continue;
      n++;
      const ctx = `seed ${seed}`;
      const p = d.w.props;
      let crystals = 0;
      let buoys = 0;
      for (let i = 0; i < p.count; i++) {
        if (p.islandId[i] !== d.isl.id) continue;
        const id = PROP_DEFS[p.defId[i]].id;
        if (id === 'crystalCluster') {
          crystals++;
          expect(p.y[i], `${ctx} crystal on the rim`).toBeGreaterThanOrEqual(4);
          const zi =
            Math.round((p.z[i] - d.w.height.originZ) / d.w.height.cellSize) * d.w.height.n +
            Math.round((p.x[i] - d.w.height.originX) / d.w.height.cellSize);
          expect(d.w.zone[zi], ctx).not.toBe(Zone.sandWet);
        }
        if (id === 'instrumentBuoy') {
          buoys++;
          expect(p.y[i], `${ctx} buoy at the waterline`).toBe(0);
          expect(heightAt(d.w.height, p.x[i], p.z[i]), `${ctx} buoy over water`).toBeLessThan(0);
        }
      }
      if (crystals > 0) withCrystals++;
      if (buoys > 0) withBuoys++;
    }
    expect(withCrystals / n, 'crystals').toBeGreaterThanOrEqual(0.8);
    expect(withBuoys / n, 'instrument buoys').toBeGreaterThanOrEqual(0.8);
  });
});
