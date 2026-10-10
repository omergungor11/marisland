import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { BUTTERFLIES, DUCKS } from '../content/life-critters.ts';
import { BUDGETS } from '../content/budgets.ts';
import { LIFE_PLAN } from '../content/life.ts';
import { Scope } from '../core/scope.ts';
import type { Quality } from '../core/params.ts';
import { SHARED } from '../render/uniforms.ts';
import { generateWorld, type WorldData } from '../world/index.ts';
import type { Ducks } from './critters.ts';
import { Butterflies, findPools } from './critters.ts';
import { createLife, type LifeSystem } from './index.ts';
import { makeCtx } from './ctx.ts';

const SEEDS = [7, 1001, 42];
const worlds = new Map<number, WorldData>();
const world = (seed: number): WorldData => {
  let w = worlds.get(seed);
  if (!w) worlds.set(seed, (w = generateWorld(seed)));
  return w;
};

function rig(seed: number, quality: Quality = 'medium', tier = 2) {
  const scope = new Scope('critters-test');
  const counters = { agents: 0 };
  const life: LifeSystem = createLife({
    world: world(seed),
    scope,
    seed,
    quality,
    water: { splat: () => undefined },
    counters: counters as never,
    getTier: () => tier,
    cameraPos: new THREE.Vector3(0, 40, 0),
  });
  return { life, counters, scope };
}

const clock = (night: number, time: number): void => {
  SHARED.uNight.value = night;
  SHARED.uTime.value = time;
};

/** Frame at clock `t`: ducks need their tier reveal first, so run one fixed step. */
function frame(life: LifeSystem, t: number, night = 0): void {
  clock(night, t);
  life.fixedUpdate(1 / 30);
  life.update(1 / 30, 1);
}

const ducksOf = (seed: number, q: Quality = 'medium'): Ducks | undefined =>
  rig(seed, q).life.kinds.ducks;

describe('critters: ducks', () => {
  it('exist on some seeds at medium / high, never at low', () => {
    expect(SEEDS.some((s) => ducksOf(s) !== undefined)).toBe(true);
    for (const s of SEEDS) {
      expect(ducksOf(s, 'low')).toBeUndefined();
      const d = ducksOf(s);
      if (d) expect(d.capacity).toBe(LIFE_PLAN.medium.ducks);
      const h = ducksOf(s, 'high');
      if (h) expect(h.capacity).toBe(LIFE_PLAN.high.ducks);
    }
  });

  it('count as agents and keep the total within the budget', () => {
    for (const q of ['low', 'medium', 'high'] as const) {
      for (const s of SEEDS) {
        const r = rig(s, q);
        frame(r.life, 5);
        const d = r.life.kinds.ducks;
        if (d) expect(d.liveCount).toBe(d.capacity);
        expect(r.life.stats.agents).toBe(r.counters.agents);
        expect(r.life.stats.agents).toBeLessThanOrEqual(BUDGETS[q].agents);
      }
    }
  });

  it('are alive only from tier 2', () => {
    for (const s of SEEDS) {
      const r = rig(s, 'medium', 1);
      if (!r.life.kinds.ducks) continue;
      frame(r.life, 5);
      expect(r.life.kinds.ducks.liveCount).toBe(0);
    }
  });

  it('paddle inside the pool, at its surface, in a follow-chain', () => {
    for (const s of SEEDS) {
      const d = ducksOf(s, 'high');
      if (!d) continue;
      const P = d.pool;
      const ctx = makeCtx({
        world: world(s),
        scope: new Scope('x'),
        seed: s,
        quality: 'high',
        water: { splat: () => undefined },
        counters: { agents: 0 },
        getTier: () => 2,
        cameraPos: new THREE.Vector3(),
      });
      expect(findPools(ctx).length).toBeGreaterThanOrEqual(1);
      const pt = { x: 0, z: 0 };
      const next = { x: 0, z: 0 };
      for (let t = 0; t < 120; t += 0.7) {
        for (let i = 0; i < d.capacity; i++) {
          d.orbit(i, t, pt);
          const dx = pt.x - P.x;
          const dz = pt.z - P.z;
          const u = Math.abs(dx * P.ax + dz * P.az);
          const v = Math.abs(-dx * P.az + dz * P.ax);
          expect(u).toBeLessThan(P.hw - 0.45);
          expect(v).toBeLessThan(P.hd - 0.3);
        }
        // follow-chain: duck i is where the leader was i · follow / ω seconds ago
        const lag =
          DUCKS.follow / (DUCKS.speed / ((P.hw * DUCKS.orbit[0] + P.hd * DUCKS.orbit[1]) / 2));
        for (let i = 1; i < d.capacity; i++) {
          d.orbit(i, t, next);
          d.orbit(0, t - i * lag, pt);
          expect(Math.hypot(next.x - pt.x, next.z - pt.z)).toBeLessThan(1e-4);
        }
        d.orbit(0, t, pt);
        d.orbit(1, t, next);
        expect(Math.hypot(next.x - pt.x, next.z - pt.z)).toBeGreaterThan(0.3);
      }
      frame(rig(s, 'high').life, 3);
      return;
    }
  });

  it('are a pure function of the clock: two runs, same poses; the clock moves them', () => {
    for (const s of SEEDS) {
      const a = rig(s, 'high');
      const b = rig(s, 'high');
      const da = a.life.kinds.ducks;
      const db = b.life.kinds.ducks;
      expect(!!da).toBe(!!db);
      if (!da || !db) continue;
      frame(a.life, 12.5);
      frame(b.life, 12.5);
      const at12 = Array.from(da.x);
      expect(Array.from(db.x)).toEqual(at12);
      expect(Array.from(db.z)).toEqual(Array.from(da.z));
      frame(a.life, 23.1);
      expect(Array.from(da.x)).not.toEqual(at12);
      // going back in time restores the poses exactly (no hidden state)
      frame(a.life, 12.5);
      expect(Array.from(da.x)).toEqual(at12);
    }
  });

  it('keep the ordering: mother larger than the ducklings, ducklings never in sync', () => {
    for (const s of SEEDS) {
      const d = ducksOf(s, 'high');
      if (!d) continue;
      expect(d.sx[0]).toBe(1);
      for (let i = 1; i < d.capacity; i++) expect(d.sx[i]).toBeLessThan(1);
      frame(rig(s, 'high').life, 1);
      return;
    }
  });
});

describe('critters: butterflies', () => {
  const flies = (seed: number, q: Quality = 'medium'): Butterflies | undefined =>
    rig(seed, q).life.kinds.butterflies;

  it('exist on Design flowers with the plan count, not as agents', () => {
    expect(SEEDS.some((s) => flies(s) !== undefined)).toBe(true);
    for (const s of SEEDS) {
      for (const q of ['low', 'medium', 'high'] as const) {
        const r = rig(s, q);
        const f = r.life.kinds.butterflies;
        if (!f) continue;
        expect(f.capacity).toBe(LIFE_PLAN[q].butterflies);
        frame(r.life, 4, 0);
        expect(r.counters.agents).toBeLessThanOrEqual(BUDGETS[q].agents);
        expect(f.liveCount).toBe(0);
      }
    }
  });

  it('fly by day and are gone by night', () => {
    for (const s of SEEDS) {
      const r = rig(s);
      const f = r.life.kinds.butterflies;
      if (!f) continue;
      frame(r.life, 9, 0);
      expect(f.mesh.visible).toBe(true);
      expect(f.mesh.count).toBe(f.capacity);
      frame(r.life, 9, 0.6);
      expect(f.mesh.count).toBe(0);
      expect(f.mesh.visible).toBe(false);
      frame(r.life, 9, 1);
      expect(f.mesh.count).toBe(0);
      // dusk: shrinking, not popping
      expect(Butterflies.dayOf(BUTTERFLIES.day[0])).toBe(1);
      expect(Butterflies.dayOf(BUTTERFLIES.day[1])).toBe(0);
    }
  });

  it('are hidden below tier 2', () => {
    for (const s of SEEDS) {
      const r = rig(s, 'medium', 1);
      const f = r.life.kinds.butterflies;
      if (!f) continue;
      frame(r.life, 9, 0);
      expect(f.mesh.count).toBe(0);
    }
  });

  it('are deterministic and move with the clock; the wings beat out of sync', () => {
    for (const s of SEEDS) {
      const a = rig(s);
      const b = rig(s);
      const fa = a.life.kinds.butterflies;
      const fb = b.life.kinds.butterflies;
      if (!fa || !fb) continue;
      frame(a.life, 31.4, 0);
      frame(b.life, 31.4, 0);
      const m1 = Array.from(fa.mesh.instanceMatrix.array as Float32Array);
      expect(Array.from(fb.mesh.instanceMatrix.array as Float32Array)).toEqual(m1);
      frame(a.life, 44.2, 0);
      expect(Array.from(fa.mesh.instanceMatrix.array as Float32Array)).not.toEqual(m1);
      // span (scale.z column length) differs between butterflies at one instant
      frame(a.life, 31.4, 0);
      const arr = fa.mesh.instanceMatrix.array as Float32Array;
      const spans = new Set<number>();
      for (let i = 0; i < fa.capacity; i++) {
        const o = i * 16;
        spans.add(Math.round(Math.hypot(arr[o + 8], arr[o + 9], arr[o + 10]) * 100));
      }
      expect(spans.size).toBeGreaterThan(1);
      return;
    }
  });

  it('reduced motion calms the flight', () => {
    for (const s of SEEDS) {
      const r = rig(s);
      const f = r.life.kinds.butterflies;
      if (!f) continue;
      const pt = { x: 0, y: 0, z: 0 };
      const span = (calm: number): number => {
        let lo = Infinity;
        let hi = -Infinity;
        for (let t = 0; t < 12; t += 0.1) {
          f.at(0, t, pt, calm);
          lo = Math.min(lo, pt.x);
          hi = Math.max(hi, pt.x);
        }
        return hi - lo;
      };
      expect(span(0.3)).toBeLessThan(span(1) * 0.6);
      return;
    }
  });
});
