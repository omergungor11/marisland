import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { FIXED_STEP } from '../core/clock.ts';
import { Scope } from '../core/scope.ts';
import type { Quality } from '../core/params.ts';
import { FIREFLIES, LIFE_PLAN } from '../content/life.ts';
import { SHARED } from '../render/uniforms.ts';
import { generateWorld, Zone, type WorldData } from '../world/index.ts';
import { createLife, type LifeSystem } from './index.ts';
import { Fireflies } from './fireflies.ts';

const worlds = new Map<number, WorldData>();
const world = (seed: number): WorldData => {
  let w = worlds.get(seed);
  if (!w) worlds.set(seed, (w = generateWorld(seed)));
  return w;
};

function rig(seed: number, quality: Quality = 'medium') {
  const tier = { v: 2 };
  const scope = new Scope('fireflies-test');
  const counters = { agents: 0 };
  const life: LifeSystem = createLife({
    world: world(seed),
    scope,
    seed,
    quality,
    water: { splat: () => undefined },
    counters: counters as never,
    getTier: () => tier.v,
    cameraPos: new THREE.Vector3(0, 40, 0),
  });
  return { life, tier, counters, scope };
}

const at = (night: number, time: number): void => {
  SHARED.uNight.value = night;
  SHARED.uTime.value = time;
};

const litCount = (f: Fireflies): number => {
  const a = f.mesh.instanceMatrix.array as Float32Array;
  let n = 0;
  for (let i = 0; i < f.capacity; i++) if (i < f.mesh.count && a[i * 16] > 0.01) n++;
  return n;
};

describe('fireflies', () => {
  it('count 0 by day, lit at night, not an agent', () => {
    for (const seed of [7, 1001, 42]) {
      const r = rig(seed);
      const f = r.life.kinds.fireflies!;
      expect(f).toBeDefined();
      expect(f.capacity).toBe(LIFE_PLAN.medium.fireflies);
      at(0, 10);
      r.life.update(FIXED_STEP, 0.5);
      expect(f.mesh.count).toBe(0);
      expect(f.mesh.visible).toBe(false);
      const agentsDay = r.counters.agents;
      at(1, 10);
      r.life.update(FIXED_STEP, 0.5);
      // blink dims some of them: a good share is lit at any one instant, never more than capacity
      expect(f.shown).toBeGreaterThan(f.capacity / 3);
      expect(f.shown).toBeLessThanOrEqual(f.capacity);
      expect(f.mesh.count).toBe(f.shown);
      expect(r.counters.agents).toBe(agentsDay); // particles, not agents
      at(0, 0);
    }
  });

  it('dusk brings them in one by one; none below night 0.5 or below tier 2', () => {
    const r = rig(1001);
    const f = r.life.kinds.fireflies!;
    at(FIREFLIES.night[0] - 0.01, 3);
    r.life.update(FIXED_STEP, 0.5);
    expect(f.mesh.count).toBe(0);
    const seen: number[] = [];
    for (let k = 0; k <= 10; k++) {
      const night = FIREFLIES.night[0] + ((FIREFLIES.night[1] - FIREFLIES.night[0]) * k) / 10;
      f.render(3, Fireflies.glowOf(night));
      seen.push(litCount(f));
    }
    expect(seen[0]).toBe(0);
    expect(seen[10]).toBeGreaterThan(seen[3]);
    r.tier.v = 1;
    at(1, 3);
    r.life.update(FIXED_STEP, 0.5);
    expect(f.mesh.count).toBe(0);
    at(0, 0);
  });

  it('is a pure function of the clock: same (seed, time) → same matrices; blinks over 2–3 s', () => {
    const a = rig(1001).life.kinds.fireflies!;
    const b = rig(1001).life.kinds.fireflies!;
    at(1, 12.3);
    a.update(0);
    b.update(0);
    expect(Array.from(a.mesh.instanceMatrix.array)).toEqual(
      Array.from(b.mesh.instanceMatrix.array),
    );
    const snap = Array.from(a.mesh.instanceMatrix.array);
    at(1, 12.3 + 1.1);
    a.update(0);
    expect(Array.from(a.mesh.instanceMatrix.array)).not.toEqual(snap);
    // a single firefly goes dark and lit again within a few blink periods
    let on = 0;
    let off = 0;
    for (let t = 0; t < 12; t += 0.25) {
      at(1, t);
      a.update(0);
      if ((a.mesh.instanceMatrix.array as Float32Array)[0] > 0.01) on++;
      else off++;
    }
    expect(on).toBeGreaterThan(0);
    expect(off).toBeGreaterThan(0);
    at(0, 0);
  });

  it('swarms sit on the settlement island, over land', () => {
    for (const seed of [7, 42, 1001, 2024]) {
      const w = world(seed);
      const r = rig(seed);
      const f = r.life.kinds.fireflies!;
      expect(f).toBeDefined();
      at(1, 5);
      r.life.update(0, 0);
      const villages = new Set(
        w.settlements.filter((s) => s.kind === 'village').map((s) => s.islandId),
      );
      const h = w.height;
      let onVillage = 0;
      for (let i = 0; i < f.capacity; i++) {
        const x = f.mesh.instanceMatrix.array[i * 16 + 12];
        const z = f.mesh.instanceMatrix.array[i * 16 + 14];
        const k =
          Math.round((z - h.originZ) / h.cellSize) * h.n + Math.round((x - h.originX) / h.cellSize);
        expect(w.zone[k]).not.toBe(Zone.deep);
        if (villages.has(w.islandMap[k] - 1)) onVillage++;
      }
      expect(onVillage).toBeGreaterThan(f.capacity * 0.6);
    }
    at(0, 0);
  });

  it('reduced motion: smaller paths', () => {
    const r = rig(1001);
    const f = r.life.kinds.fireflies!;
    at(1, 7);
    f.update(0);
    const normal = Array.from(f.mesh.instanceMatrix.array);
    r.life.setMotionScale(0.3);
    f.update(0);
    expect(Array.from(f.mesh.instanceMatrix.array)).not.toEqual(normal);
    at(0, 0);
  });
});
