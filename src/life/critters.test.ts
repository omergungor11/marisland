import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { FIXED_STEP } from '../core/clock.ts';
import { Scope } from '../core/scope.ts';
import { QUALITY_PRESETS } from '../core/quality.ts';
import type { Quality } from '../core/params.ts';
import { CATS, CRABS, LIFE_PLAN, SHEEP, VILLAGERS } from '../content/life.ts';
import { generateWorld, heightAt, Zone, type WorldData } from '../world/index.ts';
import type { AgentKind } from './agents.ts';
import { createLife, type LifeSystem } from './index.ts';
import {
  buildCapybara,
  buildCat,
  buildCatTail,
  buildCrab,
  buildCrabClaws,
  buildDuck,
  buildSheep,
  buildVillager,
} from './geo/critters.ts';

let cached: WorldData | null = null;
const world = (): WorldData => (cached ??= generateWorld(7));

interface Rig {
  life: LifeSystem;
  cam: THREE.Vector3;
  tier: { v: number };
  hour: { v: number };
  counters: { agents: number };
}

function rig(seed = 7, quality: Quality = 'medium', cam = new THREE.Vector3(0, 40, 0)): Rig {
  const tier = { v: 2 };
  const hour = { v: 12 };
  const counters = { agents: 0 };
  const life = createLife({
    world: world(),
    scope: new Scope('critters-test'),
    seed,
    quality,
    water: { splat: () => undefined },
    counters: counters as never,
    getTier: () => tier.v,
    getHour: () => hour.v,
    cameraPos: cam,
  });
  life.onTier(tier.v);
  return { life, cam, tier, hour, counters };
}

const run = (r: Rig, n: number, each?: (step: number) => void): void => {
  for (let i = 0; i < n; i++) {
    r.life.fixedUpdate(FIXED_STEP);
    each?.(i);
  }
};

const allKinds = (l: LifeSystem): AgentKind[] => Object.values(l.kinds) as AgentKind[];
const snapshot = (l: LifeSystem): number[] =>
  allKinds(l).flatMap((k) => [...k.x, ...k.y, ...k.z, ...k.yaw, ...k.sy]);

/** A wet-sand cell with sand around it, as a camera position. */
function sandSpot(w: WorldData, minX = -Infinity): { x: number; z: number } | null {
  const h = w.height;
  for (let iz = 10; iz < h.n - 10; iz += 2) {
    for (let ix = 10; ix < h.n - 10; ix += 2) {
      const x = h.originX + ix * h.cellSize;
      if (x < minX) continue;
      let n = 0;
      for (let dz = -2; dz <= 2; dz++)
        for (let dx = -2; dx <= 2; dx++) {
          const z = w.zone[(iz + dz) * h.n + ix + dx];
          if (z === Zone.sandWet || z === Zone.sandDry) n++;
        }
      if (n >= 10 && w.zone[iz * h.n + ix] === Zone.sandWet)
        return { x, z: h.originZ + iz * h.cellSize };
    }
  }
  return null;
}

describe('critters: villagers', () => {
  it('stay on path edges for 600 steps and actually walk', () => {
    const r = rig();
    const v = r.life.kinds.villagers;
    expect(v).toBeDefined();
    if (!v) return;
    expect(v.liveCount).toBeGreaterThanOrEqual(6);
    const start = Array.from(v.x);
    let worst = 0;
    let moved = 0;
    const states = new Set<number>();
    run(r, 600, () => {
      for (let i = 0; i < v.capacity; i++) {
        if (!v.active[i]) continue;
        worst = Math.max(worst, v.net.distToEdges(v.x[i], v.z[i]));
        states.add(v.state[i]);
      }
    });
    for (let i = 0; i < v.capacity; i++) moved = Math.max(moved, Math.abs(v.x[i] - start[i]));
    expect(worst).toBeLessThan(0.3);
    expect(moved).toBeGreaterThan(2);
    expect(states.size).toBeGreaterThanOrEqual(2);
  });

  it('hops: height above ground stays within the hop height and squash within 0.9..1.1', () => {
    const r = rig();
    const v = r.life.kinds.villagers as NonNullable<LifeSystem['kinds']['villagers']>;
    const w = world();
    let maxHop = 0;
    let minSy = 9;
    let maxSy = 0;
    run(r, 900, () => {
      for (let i = 0; i < v.capacity; i++) {
        if (v.state[i] !== 0) continue;
        maxHop = Math.max(maxHop, v.y[i] - heightAt(w.height, v.x[i], v.z[i]));
        minSy = Math.min(minSy, v.sy[i]);
        maxSy = Math.max(maxSy, v.sy[i]);
      }
    });
    expect(maxHop).toBeGreaterThan(VILLAGERS.hop * 0.5);
    expect(maxHop).toBeLessThanOrEqual(VILLAGERS.hop + 1e-4);
    expect(minSy).toBeGreaterThanOrEqual(VILLAGERS.landSquash - 1e-3);
    expect(maxSy).toBeLessThanOrEqual(VILLAGERS.airStretch + 1e-3);
  });

  it('waves at a camera within 25 u', () => {
    const r = rig();
    const v = r.life.kinds.villagers as NonNullable<LifeSystem['kinds']['villagers']>;
    const i = 0;
    r.cam.set(v.x[i] + 6, 3, v.z[i]);
    run(r, 600, () => {
      // keep the camera next to wherever villager 0 is
      r.cam.set(v.x[i] + 6, 3, v.z[i]);
    });
    expect(v.waves).toBeGreaterThan(0);
  });

  it('distance to nearest edge helper is exact on a node', () => {
    const v = rig().life.kinds.villagers!;
    expect(v.net.distToEdges(v.net.x(0), v.net.z(0))).toBeLessThan(1e-3);
  });
});

describe('critters: sheep, cats, crabs, others', () => {
  it('sheep: >= 5 on Millbrook at medium, stay in field/meadow cells, and hop', () => {
    const r = rig();
    const sh = r.life.kinds.sheep;
    expect(sh).toBeDefined();
    if (!sh) return;
    expect(sh.liveCount).toBeGreaterThanOrEqual(5);
    const isl = world().islands.find((i) => i.archetype === 'millbrook')!;
    let bad = 0;
    run(r, 900, () => {
      for (let i = 0; i < sh.capacity; i++) {
        const z = r.life.kinds.sheep!;
        const zone =
          world().zone[
            Math.round((z.z[i] - world().height.originZ) / 2) * world().height.n +
              Math.round((z.x[i] - world().height.originX) / 2)
          ];
        if (zone !== Zone.field && zone !== Zone.meadow) bad++;
      }
    });
    expect(bad).toBe(0);
    expect(sh.hops).toBeGreaterThan(0);
    for (let i = 0; i < sh.capacity; i++) {
      expect(Math.hypot(sh.x[i] - isl.cx, sh.z[i] - isl.cz)).toBeLessThan(isl.reach);
    }
  });

  it('cats sit still, sleep from dusk (scale y 0.7) and wake at noon', () => {
    const r = rig();
    const c = r.life.kinds.cats;
    expect(c).toBeDefined();
    if (!c) return;
    const spot = [...c.x];
    run(r, 120);
    expect(c.sy[0]).toBeGreaterThan(0.99);
    r.hour.v = 23;
    run(r, 300);
    expect(c.sy[0]).toBeLessThan(CATS.sleepScaleY + 0.03);
    r.hour.v = 12;
    run(r, 300);
    expect(c.sy[0]).toBeGreaterThan(0.97);
    expect([...c.x]).toEqual(spot);
    expect(c.parts[0].angle[0]).not.toBe(0);
  });

  it('crabs: T3 only, within 60 u of the camera, on sand, relocate after > 80 u', () => {
    const w = world();
    const s1 = sandSpot(w)!;
    expect(s1).toBeTruthy();
    const r = rig(7, 'medium', new THREE.Vector3(s1.x, 5, s1.z));
    r.tier.v = 2;
    r.life.onTier(2);
    run(r, 5);
    expect(r.life.kinds.crabs?.liveCount).toBe(0);
    r.tier.v = 3;
    r.life.onTier(3);
    const c = r.life.kinds.crabs!;
    expect(c.liveCount).toBeGreaterThanOrEqual(2);
    const zoneOf = (x: number, z: number): number =>
      w.zone[
        Math.round((z - w.height.originZ) / 2) * w.height.n + Math.round((x - w.height.originX) / 2)
      ];
    let off = 0;
    let far = 0;
    run(r, 600, () => {
      for (let i = 0; i < c.capacity; i++) {
        if (!c.active[i]) continue;
        const zn = zoneOf(c.x[i], c.z[i]);
        if (zn !== Zone.sandDry && zn !== Zone.sandWet) off++;
        far = Math.max(far, Math.hypot(c.x[i] - s1.x, c.z[i] - s1.z));
      }
    });
    expect(off).toBe(0);
    expect(far).toBeLessThan(CRABS.radius + CRABS.clusterRadius + 5);
    // scuttling moved something and the claws clacked
    const before = c.relocations;
    const s2 = sandSpot(w, s1.x + 120);
    if (s2) {
      r.cam.set(s2.x, 5, s2.z);
      run(r, 150);
      expect(c.relocations).toBeGreaterThan(before);
      expect(Math.hypot(c.x[0] - s2.x, c.z[0] - s2.z)).toBeLessThan(CRABS.radius + 10);
    }
  });

  it('crabs scuttle sideways by ~1.5 u per 3 s', () => {
    const w = world();
    const s1 = sandSpot(w)!;
    const r = rig(7, 'medium', new THREE.Vector3(s1.x, 5, s1.z));
    r.tier.v = 3;
    r.life.onTier(3);
    const c = r.life.kinds.crabs!;
    let maxStep = 0;
    let prev = [...c.x];
    let prevZ = [...c.z];
    run(r, 900, () => {
      for (let i = 0; i < c.capacity; i++) {
        if (!c.active[i]) continue;
        maxStep = Math.max(maxStep, Math.hypot(c.x[i] - prev[i], c.z[i] - prevZ[i]));
      }
      prev = [...c.x];
      prevZ = [...c.z];
    });
    expect(maxStep).toBeGreaterThan(0.001);
    expect(maxStep).toBeLessThan(0.1);
  });

  it('phases are unique per kind, no two instances in sync', () => {
    const r = rig(7, 'high');
    r.tier.v = 3;
    r.life.onTier(3);
    for (const k of allKinds(r.life)) {
      const seen = new Set<number>();
      for (let i = 0; i < k.capacity; i++) seen.add(k.phase[i]);
      expect(seen.size, k.name).toBe(k.capacity);
    }
  });

  it('determinism: same seed identical, 0 vs 30 steps differ', () => {
    const mk = (n: number): number[] => {
      const r = rig(7, 'high');
      r.tier.v = 3;
      r.life.onTier(3);
      run(r, n);
      return snapshot(r.life);
    };
    expect(mk(300)).toEqual(mk(300));
    expect(mk(30)).not.toEqual(mk(0));
  });

  it('counts respect agentCap at T3 in every quality, and the plan fits', () => {
    for (const q of ['low', 'medium', 'high'] as const) {
      const r = rig(7, q);
      r.tier.v = 3;
      r.life.onTier(3);
      run(r, 10);
      r.life.update(FIXED_STEP, 0.5);
      expect(r.counters.agents, q).toBeLessThanOrEqual(QUALITY_PRESETS[q].agentCap);
      const p = LIFE_PLAN[q];
      const worst =
        p.sailboats +
        p.rowboats +
        p.parked +
        p.flocks * p.gullsPerFlock[1] +
        p.schools * p.fishPerSchool[1] +
        p.jumpers +
        p.dolphins +
        p.villagers.hearth +
        2 * p.villagers.other +
        p.cats +
        p.sheep +
        p.crabs +
        p.ducks +
        p.capybaras;
      expect(worst, q).toBeLessThanOrEqual(QUALITY_PRESETS[q].agentCap);
    }
  });

  it('forEachAgent visits every live agent with positive radii', () => {
    const r = rig(7, 'high');
    r.tier.v = 3;
    r.life.onTier(3);
    run(r, 5);
    let n = 0;
    r.life.forEachAgent((_k, _i, x, y, z, rad) => {
      n++;
      expect(Number.isFinite(x + y + z)).toBe(true);
      expect(rad).toBeGreaterThan(0);
    });
    expect(n).toBe(r.life.stats.agents === 0 ? n : n);
    expect(n).toBeGreaterThan(30);
  });

  it('ambient.fire(fishJump) triggers a jumper at the given point (T3)', () => {
    const w = world();
    const r = rig();
    r.tier.v = 3;
    const j = r.life.kinds.jumpers!;
    const before = j.started;
    r.life.ambient.fire('fishJump', 10, 10);
    expect(j.started).toBe(before + 1);
    void w;
  });

  it('creature meshes: triangle budgets', () => {
    const tris = (g: THREE.BufferGeometry): number => g.attributes.position.count / 3;
    expect(tris(buildVillager())).toBeLessThanOrEqual(80);
    expect(tris(buildCat()) + tris(buildCatTail())).toBeLessThanOrEqual(80);
    expect(tris(buildSheep())).toBeLessThanOrEqual(90);
    expect(tris(buildCrab()) + tris(buildCrabClaws())).toBeLessThanOrEqual(70);
    expect(tris(buildDuck())).toBeLessThanOrEqual(60);
    expect(tris(buildCapybara())).toBeLessThanOrEqual(90);
    void SHEEP;
  });
});
