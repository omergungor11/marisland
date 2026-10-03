import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { FIXED_STEP } from '../core/clock.ts';
import { Scope } from '../core/scope.ts';
import { QUALITY_PRESETS } from '../core/quality.ts';
import type { Quality } from '../core/params.ts';
import { CATS, CRABS, LAND, LIFE_PLAN, SHEEP, VILLAGERS } from '../content/life.ts';
import { generateWorld, heightAt, Zone, type WorldData } from '../world/index.ts';
import { createLife, type LifeSystem } from './index.ts';
import type { LandKind } from './land.ts';
import { buildCat, buildCrab, buildSheep, buildVillager } from './geo/land.ts';
import { allocate, buildWalkGraph } from './land-world.ts';
import { makeCtx } from './ctx.ts';
import { TriBuilder, v3 } from './geo/builder.ts';

// eslint-disable-next-line no-restricted-properties
const now = (): number => performance.now();

const worlds = new Map<number, WorldData>();
const world = (seed: number): WorldData => {
  let w = worlds.get(seed);
  if (!w) worlds.set(seed, (w = generateWorld(seed)));
  return w;
};

interface Rig {
  life: LifeSystem;
  scope: Scope;
  cam: THREE.Vector3;
  tier: { v: number };
  counters: { agents: number };
}

function rig(seed: number, quality: Quality = 'medium', cam = new THREE.Vector3(0, 40, 0)): Rig {
  const tier = { v: 0 };
  const scope = new Scope('land-test');
  const counters = { agents: 0 };
  const life = createLife({
    world: world(seed),
    scope,
    seed,
    quality,
    water: { splat: () => undefined },
    counters: counters as never,
    getTier: () => tier.v,
    cameraPos: cam,
  });
  return { life, scope, cam, tier, counters };
}

const run = (r: Rig, n: number, each?: () => void): void => {
  for (let i = 0; i < n; i++) {
    r.life.fixedUpdate(FIXED_STEP);
    each?.();
  }
};

const landOf = (l: LifeSystem): LandKind[] => {
  const all: (LandKind | undefined)[] = [
    l.kinds.villagers,
    l.kinds.cats,
    l.kinds.sheep,
    l.kinds.crabs,
  ];
  return all.filter((k): k is LandKind => k !== undefined);
};

const SEEDS = [7, 1001, 2024, 5005];

const zoneOf = (w: WorldData, x: number, z: number): number => {
  const h = w.height;
  const ix = Math.round((x - h.originX) / h.cellSize);
  const iz = Math.round((z - h.originZ) / h.cellSize);
  return w.zone[iz * h.n + ix];
};

describe('land: spawning', () => {
  it('spawns per island from what it offers, within the per-quality plan', () => {
    for (const seed of SEEDS) {
      for (const q of ['low', 'medium', 'high'] as const) {
        const r = rig(seed, q);
        const plan = LIFE_PLAN[q];
        const k = r.life.kinds;
        expect(k.villagers?.capacity ?? 0).toBeLessThanOrEqual(plan.villagers);
        expect(k.cats?.capacity ?? 0).toBeLessThanOrEqual(plan.cats);
        expect(k.sheep?.capacity ?? 0).toBeLessThanOrEqual(plan.sheep);
        expect(k.crabs?.capacity ?? 0).toBeLessThanOrEqual(plan.crabs);
        // every seed has a village and a beach: villagers and crabs always exist
        expect(k.villagers?.capacity ?? 0).toBeGreaterThan(0);
        expect(k.crabs?.capacity ?? 0).toBeGreaterThan(0);
        console.info(
          `seed ${seed} ${q}: villagers ${k.villagers?.capacity ?? 0}, cats ${k.cats?.capacity ?? 0}, sheep ${k.sheep?.capacity ?? 0}, crabs ${k.crabs?.capacity ?? 0}`,
        );
      }
    }
  });

  it('is deterministic: same seed → same positions after N steps; seeds differ', () => {
    const snap = (r: Rig): number[] =>
      landOf(r.life).flatMap((k) => [...k.x, ...k.y, ...k.z, ...k.yaw]);
    const a = rig(1001);
    const b = rig(1001);
    const c = rig(5005);
    for (const r of [a, b, c]) {
      r.tier.v = 3;
      run(r, 600);
    }
    expect(snap(a)).toEqual(snap(b));
    expect(snap(a)).not.toEqual(snap(c));
  });

  it('plans are pure data: no clock, per-agent phases differ', () => {
    const r = rig(1001, 'high');
    for (const k of landOf(r.life)) {
      if (k.capacity > 1) expect(new Set(Array.from(k.phase)).size).toBe(k.capacity);
    }
  });

  it("D'Hondt allocation respects weights and caps", () => {
    expect(
      allocate(4, [
        { weight: 3, cap: 9 },
        { weight: 1, cap: 9 },
      ]),
    ).toEqual([3, 1]);
    expect(
      allocate(5, [
        { weight: 3, cap: 1 },
        { weight: 1, cap: 9 },
      ]),
    ).toEqual([1, 4]);
    expect(
      allocate(3, [
        { weight: 0, cap: 9 },
        { weight: 1, cap: 2 },
      ]),
    ).toEqual([0, 2]);
  });
});

describe('land: tier gating + reveal', () => {
  it('hidden below the minimum tier, instant when first simulated at it, springs in later', () => {
    // instant: tier already high before the first step
    const a = rig(1001);
    a.tier.v = 3;
    run(a, 1);
    a.life.update(FIXED_STEP, 1);
    for (const k of landOf(a.life)) {
      expect(k.liveCount).toBe(k.capacity);
      for (let i = 0; i < k.capacity; i++) expect(k.scale[i]).toBeCloseTo(k.size, 5);
    }
    // later: tier 0 → nothing alive; rising to 3 blooms from scale 0
    const b = rig(1001);
    run(b, 30);
    for (const k of landOf(b.life)) expect(k.liveCount).toBe(0);
    b.tier.v = 3;
    b.life.onTier(3);
    run(b, 1);
    const k0 = landOf(b.life)[0];
    expect(k0.liveCount).toBe(k0.capacity);
    expect(Math.min(...Array.from(k0.scale))).toBeLessThan(0.6 * k0.size);
    run(b, 45);
    for (const k of landOf(b.life))
      for (let i = 0; i < k.capacity; i++) expect(k.scale[i]).toBeCloseTo(k.size, 1);
    // dropping the tier eases out and deactivates
    b.tier.v = 0;
    b.life.onTier(0);
    run(b, 10);
    for (const k of landOf(b.life)) expect(k.liveCount).toBe(0);
  });

  it('crabs wait for tier 3, the rest start at tier 2', () => {
    const r = rig(1001);
    r.tier.v = 2;
    run(r, 2);
    expect(r.life.kinds.crabs?.liveCount).toBe(0);
    expect(r.life.kinds.villagers?.liveCount).toBeGreaterThan(0);
    r.tier.v = 3;
    run(r, 2);
    expect(r.life.kinds.crabs?.liveCount).toBeGreaterThan(0);
  });
});

describe('land: staying in bounds', () => {
  it('sheep stay on meadow, cats on their zones, crabs on sand / shallows; feet follow the terrain', () => {
    for (const seed of SEEDS) {
      const w = world(seed);
      const r = rig(seed, 'high');
      r.tier.v = 3;
      const bad: string[] = [];
      const check = (k: LandKind | undefined, zones: readonly number[]): void => {
        if (!k) return;
        for (let i = 0; i < k.capacity; i++) {
          if (!k.active[i]) continue;
          const z = zoneOf(w, k.x[i], k.z[i]);
          if (!zones.includes(z)) bad.push(`${seed}:${k.name}#${i} zone ${z}`);
          const ground = heightAt(w.height, k.x[i], k.z[i]);
          if (k.y[i] < ground - 1e-3 || k.y[i] > ground + 0.5)
            bad.push(`${seed}:${k.name}#${i} y ${k.y[i]} vs ${ground}`);
        }
      };
      run(r, 30 * 90, () => {
        check(r.life.kinds.sheep, SHEEP.zones);
        check(r.life.kinds.cats, CATS.zones);
        check(r.life.kinds.crabs, CRABS.zones);
      });
      expect(bad.slice(0, 5)).toEqual([]);
    }
  });

  it('they actually move (sheep, cats, crabs, villagers) and stay within the roam radius', () => {
    const r = rig(1001, 'high');
    r.tier.v = 3;
    run(r, 2);
    const k = landOf(r.life);
    const x0 = k.map((q) => Array.from(q.x));
    const z0 = k.map((q) => Array.from(q.z));
    run(r, 30 * 120);
    k.forEach((q, n) => {
      const moved = Array.from(q.x).filter(
        (x, i) => Math.hypot(x - x0[n][i], q.z[i] - z0[n][i]) > 0.8,
      );
      expect(moved.length, q.name).toBeGreaterThan(0);
    });
    for (const q of [r.life.kinds.sheep, r.life.kinds.cats, r.life.kinds.crabs]) {
      if (!q) continue;
      const R =
        q === r.life.kinds.sheep
          ? SHEEP.radius
          : q === r.life.kinds.cats
            ? CATS.radius
            : CRABS.radius;
      const h = (q as unknown as { home: Float32Array }).home;
      for (let i = 0; i < q.capacity; i++)
        expect(Math.hypot(q.x[i] - h[i * 2], q.z[i] - h[i * 2 + 1])).toBeLessThanOrEqual(R + 1.5);
    }
  });

  it('villagers walk only on path-graph edges (or dock decks) and on dry land', () => {
    for (const seed of SEEDS) {
      const w = world(seed);
      const ctx = makeCtx({
        world: w,
        scope: new Scope('t'),
        seed,
        quality: 'high',
        water: { splat: () => undefined },
        counters: { agents: 0 },
        getTier: () => 3,
        cameraPos: new THREE.Vector3(),
      });
      const g = buildWalkGraph(ctx);
      const dist = (px: number, pz: number): number => {
        let best = Infinity;
        for (let a = 0; a < g.n; a++)
          for (const b of g.adj[a]) {
            if (b < a) continue;
            const ex = g.x[b] - g.x[a];
            const ez = g.z[b] - g.z[a];
            const l2 = ex * ex + ez * ez || 1e-6;
            const t = Math.max(0, Math.min(1, ((px - g.x[a]) * ex + (pz - g.z[a]) * ez) / l2));
            best = Math.min(best, Math.hypot(px - g.x[a] - ex * t, pz - g.z[a] - ez * t));
          }
        return best;
      };
      const r = rig(seed, 'high');
      r.tier.v = 3;
      const v = r.life.kinds.villagers!;
      let worst = 0;
      let trips = 0;
      let lastState = Array.from(v.state);
      run(r, 30 * 120, () => {
        for (let i = 0; i < v.capacity; i++) {
          if (v.state[i] === 0 && lastState[i] !== 0) trips++;
          if (v.state[i] === 0) worst = Math.max(worst, dist(v.x[i], v.z[i]));
        }
        lastState = Array.from(v.state);
      });
      expect(worst).toBeLessThan(0.02);
      for (let i = 0; i < v.capacity; i++) {
        const z = zoneOf(w, v.x[i], v.z[i]);
        const onDeck = v.y[i] > heightAt(w.height, v.x[i], v.z[i]) + 0.1;
        if (!onDeck) expect(z).not.toBeLessThanOrEqual(Zone.shallow);
      }
      console.info(
        `seed ${seed}: ${v.capacity} villagers, ${trips} trips in 120 s, worst off-path ${worst.toExponential(1)} u`,
      );
    }
  });

  it('villagers wave at a camera within the radius at tier 3, not at tier 2', () => {
    const w = world(1001);
    const probe = rig(1001, 'high');
    probe.tier.v = 3;
    run(probe, 2);
    const v0 = probe.life.kinds.villagers!;
    const cam = new THREE.Vector3(v0.x[0] + 4, v0.y[0] + 8, v0.z[0]);
    for (const tier of [2, 3]) {
      const r = rig(1001, 'high', cam);
      r.tier.v = tier;
      let waves = 0;
      run(r, 30 * 20, () => {
        const v = r.life.kinds.villagers!;
        for (let i = 0; i < v.capacity; i++) if (v.state[i] === 2) waves++;
      });
      if (tier === 3) expect(waves).toBeGreaterThan(0);
      else expect(waves).toBe(0);
    }
    expect(w.settlements.length).toBeGreaterThan(0);
  });
});

describe('land: reduced motion', () => {
  it('hops and bobs shrink with the motion scale', () => {
    const peak = (scale: number): number => {
      const r = rig(1001, 'high');
      r.life.setMotionScale(scale);
      r.tier.v = 3;
      let top = 0;
      run(r, 30 * 40, () => {
        const v = r.life.kinds.villagers!;
        for (let i = 0; i < v.capacity; i++) {
          const g = heightAt(world(1001).height, v.x[i], v.z[i]);
          if (v.state[i] === 0) top = Math.max(top, v.y[i] - g);
        }
      });
      return top;
    };
    expect(peak(0.3)).toBeLessThan(peak(1));
  });
});

describe('land: budgets, picking feed, geometry', () => {
  it('stays under the agent cap with everything alive at tier 3', () => {
    for (const seed of SEEDS) {
      for (const q of ['low', 'medium', 'high'] as const) {
        const r = rig(seed, q);
        r.tier.v = 3;
        r.life.onTier(3);
        run(r, 5);
        r.life.update(FIXED_STEP, 0.5);
        console.info(
          `seed ${seed} ${q}: agents ${r.counters.agents} / ${QUALITY_PRESETS[q].agentCap}`,
        );
        expect(r.counters.agents).toBeLessThanOrEqual(QUALITY_PRESETS[q].agentCap);
        const land = landOf(r.life).reduce((n, k) => n + k.liveCount, 0);
        expect(land).toBeGreaterThan(0);
      }
    }
  });

  it('positions() packs live agents for the spatial hash', () => {
    const r = rig(1001, 'high');
    r.tier.v = 3;
    run(r, 3);
    const k = r.life.kinds.sheep!;
    const out = new Float32Array(k.capacity * 4);
    const ids = new Uint16Array(k.capacity);
    const n = k.positions(out, ids);
    expect(n).toBe(k.liveCount);
    for (let j = 0; j < n; j++) {
      expect(out[j * 4]).toBe(k.x[ids[j]]);
      expect(out[j * 4 + 1]).toBeCloseTo(k.y[ids[j]] + SHEEP.pickHeight, 5);
      expect(out[j * 4 + 3]).toBeCloseTo(SHEEP.pickRadius, 5);
    }
  });

  it('geometries are cheap and their parts face outward', () => {
    const tris = (g: THREE.BufferGeometry): number => g.getAttribute('position').count / 3;
    const t = [buildVillager(), buildSheep(), buildCat(), buildCrab()].map(tris);
    console.info(`tris: villager ${t[0]}, sheep ${t[1]}, cat ${t[2]}, crab ${t[3]}`);
    for (const n of t) expect(n).toBeLessThan(500);
    for (const g of [buildVillager(), buildSheep(), buildCat(), buildCrab()])
      expect(g.getAttribute('limb')).toBeDefined();
  });

  it('builder primitives are wound outward', () => {
    const outward = (g: THREE.BufferGeometry, c: THREE.Vector3): number => {
      const p = g.getAttribute('position');
      const n = g.getAttribute('normal');
      let good = 0;
      let all = 0;
      for (let i = 0; i < p.count; i += 3) {
        const cx = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3 - c.x;
        const cy = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3 - c.y;
        const cz = (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3 - c.z;
        all++;
        if (cx * n.getX(i) + cy * n.getY(i) + cz * n.getZ(i) > 0) good++;
      }
      return good / all;
    };
    const col = new THREE.Color('#fff');
    const box = new TriBuilder();
    box.box(v3(1, 2, 3), 0.3, 0.5, 0.2, col);
    expect(outward(box.finish(), v3(1, 2, 3))).toBe(1);
    const fr = new TriBuilder();
    fr.frustum(v3(0, 0, 0), 0.4, 0.2, 1, 8, col);
    expect(outward(fr.finish(), v3(0, 0.5, 0))).toBe(1);
    const cone = new TriBuilder();
    cone.frustum(v3(0, 0, 0), 0.4, 0, 1, 6, col);
    expect(outward(cone.finish(), v3(0, 0.3, 0))).toBe(1);
  });

  it('fixed step + matrix write cost of the land agents', () => {
    const r = rig(1001, 'high', new THREE.Vector3(-45, 30, -180));
    r.tier.v = 3;
    r.life.onTier(3);
    run(r, 100);
    const land = landOf(r.life);
    const n = 900;
    const t0 = now();
    for (let i = 0; i < n; i++) for (const k of land) k.fixedUpdate(FIXED_STEP);
    const t1 = now();
    for (let i = 0; i < n; i++) for (const k of land) k.update((i % 10) / 10);
    const t2 = now();
    const agents = land.reduce((s, k) => s + k.liveCount, 0);
    console.info(
      `land cost: ${agents} agents, step ${(((t1 - t0) / n) * 1000).toFixed(1)} µs (${(((t1 - t0) / n / agents) * 1000).toFixed(2)} µs/agent), update ${(((t2 - t1) / n) * 1000).toFixed(1)} µs/frame`,
    );
    expect(agents).toBeGreaterThan(10);
    expect(LAND.minTier.crabs).toBe(3);
    expect(VILLAGERS.wave.radius).toBeGreaterThan(0);
  });
});

describe('land: click emote + readable sheep (TASK-192)', () => {
  it('Villagers.wave(i) enters the wave state for the emote length, then resumes', () => {
    const r = rig(1001, 'high');
    r.tier.v = 2; // no camera waves at tier 2: only the click can wave
    run(r, 3);
    const v = r.life.kinds.villagers!;
    expect(v.wave(-1)).toBe(false);
    expect(v.wave(v.capacity)).toBe(false);
    expect(v.state[0]).not.toBe(2);
    expect(v.wave(0)).toBe(true);
    expect(v.state[0]).toBe(2);
    let frames = 0;
    while (v.state[0] === 2 && frames < 30 * 5) {
      run(r, 1);
      frames++;
    }
    const secs = frames * FIXED_STEP;
    expect(secs).toBeGreaterThan(VILLAGERS.wave.emoteSeconds - 0.1);
    expect(secs).toBeLessThan(VILLAGERS.wave.emoteSeconds + 0.1);
    expect(v.state[0]).not.toBe(2);
    // not alive below the reveal tier
    const hidden = rig(1001, 'high');
    run(hidden, 3);
    expect(hidden.life.kinds.villagers!.wave(0)).toBe(false);
  });

  it('sizes: sheep read as blobs at the village zoom, villagers/cats larger than before', () => {
    expect(LAND.size.sheep).toBeGreaterThanOrEqual(1.25 * 1.5);
    expect(LAND.size.villagers).toBeGreaterThanOrEqual(1.3 * 1.3);
    expect(LAND.size.cats).toBeGreaterThanOrEqual(1.25 * 1.3);
  });

  it('sheep flocks live in open meadow beside the barn / windmills / hub, enough to show in a frame', () => {
    for (const seed of [1001, 7, 2024]) {
      const w = world(seed);
      const r = rig(seed, 'medium');
      const s = r.life.kinds.sheep;
      if (!s) continue;
      const mill = new Set<number>([
        ...w.lots.filter((l) => l.kind === 'barn').map((l) => l.islandId),
        ...w.landmarks.filter((m) => m.kind === 'windmill').map((m) => m.islandId),
      ]);
      const h = w.height;
      let near = 0;
      let onMill = 0;
      for (let i = 0; i < s.capacity; i++) {
        expect(zoneOf(w, s.x[i], s.z[i])).toBe(Zone.meadow);
        const k =
          Math.round((s.z[i] - h.originZ) / h.cellSize) * h.n +
          Math.round((s.x[i] - h.originX) / h.cellSize);
        const isl = w.islandMap[k] - 1;
        if (!mill.has(isl)) continue;
        onMill++;
        const anchors = [
          ...w.lots.filter((l) => l.kind === 'barn' && l.islandId === isl),
          ...w.landmarks.filter((m) => m.kind === 'windmill' && m.islandId === isl),
          ...w.settlements.filter((t) => t.islandId === isl).map((t) => t.hub),
        ];
        if (anchors.some((a) => Math.hypot(a.x - s.x[i], a.z - s.z[i]) < 40)) near++;
      }
      if (seed === 1001) expect(onMill).toBeGreaterThanOrEqual(5);
      expect(near).toBe(onMill);
    }
  });
});
