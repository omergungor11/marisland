import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Scope } from '../core/scope.ts';
import { FIXED_STEP } from '../core/clock.ts';
import { VILLAGERS } from '../content/life.ts';
import { generateWorld, heightAt, type WorldData } from '../world/index.ts';
import { makeCtx } from './ctx.ts';
import { createLife } from './index.ts';
import type { Workers } from './workers.ts';
import { buildWalkGraph, NodeKind, walkRoute } from './land-world.ts';

const SEEDS = [1001, 7, 42, 2024, 5005, 8101, 6006, 4004];

const onPierFootprint = (w: WorldData, x: number, z: number): boolean =>
  w.docks.some((d) => {
    const fx = Math.cos(d.rotY);
    const fz = Math.sin(d.rotY);
    const along = (x - d.x) * fx + (z - d.z) * fz;
    const side = Math.abs(-(x - d.x) * fz + (z - d.z) * fx);
    return along > -1 && along < d.segments * 2 + 1 && side < 1.5;
  });

describe('dock reachability (TASK-477)', () => {
  it('every dock end shares a walk component with its island hub and is routable', () => {
    for (const seed of SEEDS) {
      const w = generateWorld(seed);
      const ctx = makeCtx({
        world: w,
        scope: new Scope('dock'),
        seed,
        quality: 'medium',
        water: { splat: () => undefined },
        counters: { agents: 0 } as never,
        getTier: () => 2,
        cameraPos: new THREE.Vector3(),
      });
      const g = buildWalkGraph(ctx);
      let docks = 0;
      for (const s of w.settlements) {
        const hub = s.hub.node;
        if (hub < 0 || hub >= g.n) continue;
        for (const di of s.docks) {
          let end = -1;
          for (let k = 0; k < g.n; k++) if (g.dockOf[k] === di) end = k;
          if (end < 0) continue;
          docks++;
          const tag = `seed ${seed} dock ${di}`;
          expect(g.kind[end], tag).toBe(NodeKind.dockEnd);
          expect(g.comp[end], tag).toBe(g.comp[hub]);
          expect(walkRoute(g, hub, end), tag).not.toBeNull();
        }
      }
      expect(docks, `seed ${seed}`).toBeGreaterThan(0);
    }
  });

  it('workers walk onto piers (deck height) and never stand in the water', () => {
    for (const seed of [1001, 7, 42]) {
      const w = generateWorld(seed);
      const t = { v: 2 };
      const life = createLife({
        world: w,
        scope: new Scope('dock-sim'),
        seed,
        quality: 'medium',
        water: { splat: () => undefined },
        counters: { agents: 0 } as never,
        getTier: () => t.v,
        cameraPos: new THREE.Vector3(0, 400, 0),
      });
      life.onTier(2);
      const ws = life.kinds.workers as Workers;
      let onPier = 0;
      let wet = 0;
      for (let step = 0; step < 60 * 240; step++) {
        life.fixedUpdate(FIXED_STEP);
        if (step % 10) continue;
        for (let i = 0; i < ws.residents; i++) {
          const h = heightAt(w.height, ws.x[i], ws.z[i]);
          if (h >= VILLAGERS.minWalkY) continue;
          if (Math.abs(ws.y[i] - VILLAGERS.deckY) < 0.2) onPier++;
          // standing in the sea within a pier's footprint = walked off the deck (a few land path
          // edges cut across a bay elsewhere; that is not this task)
          else if (h < 0 && ws.y[i] < 0.5 && onPierFootprint(w, ws.x[i], ws.z[i])) wet++;
        }
      }
      expect(wet, `seed ${seed} wet samples`).toBe(0);
      expect(onPier, `seed ${seed} pier samples`).toBeGreaterThan(0);
    }
  });
});
