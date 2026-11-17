import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Scope } from '../core/scope.ts';
import { FIXED_STEP } from '../core/clock.ts';
import { FLEET } from '../content/fleet.ts';
import { mockChain } from '../fleet/mock.ts';
import { generateWorld } from '../world/index.ts';
import { makeCtx } from './ctx.ts';
import { Couriers } from './couriers.ts';

/** TASK-650: a returning ship carries its report scroll on deck (its own spot, beside a waiting crate). */
describe('courier cargo', () => {
  it('returned chain, 5 s into the return leg: one scroll instance + one crate', () => {
    const world = generateWorld(1001);
    const scope = new Scope('courier-scroll');
    const cam = new THREE.Vector3(0, 40, 0);
    const ctx = makeCtx({
      world,
      scope,
      seed: 1001,
      quality: 'low',
      water: { splat: () => {} },
      counters: { agents: 0 },
      getTier: () => 3,
      cameraPos: cam,
    });
    const chain = mockChain(FLEET.captureNow, 'returned');
    const sessions = new Map(chain.sessions.map((s) => [s.id, s]));
    const group = new THREE.Group();
    const c = new Couriers({ seed: 1001, scope, group, cameraPos: cam }, ctx, world, {
      gates: () => chain.gates,
      sessions: () => sessions,
      clockMs: (t) => FLEET.captureNow + (14 + t) * 1000,
    });
    for (let i = 0; i < 4; i++) c.fixedUpdate(FIXED_STEP);
    c.update(1);
    expect(c.plans[2].phase).toBe('returning');
    expect(c.plans[2].scroll).toBe('ok');
    const bins = group.children.filter((m) => m.name.startsWith('life:courier-scroll'));
    const shown = bins.map((m) => (m as THREE.InstancedMesh).count);
    expect(shown.reduce((a, b) => a + b, 0)).toBe(1);
  });
});
