/**
 * TASK-693: the foundry movers' mesh pools are fixed by the LODs the camera reached, not by the item
 * kinds the line shows at one moment — otherwise a part entering the frame later adds a geometry and the
 * harness regen / edit leak checks at the Coding tier-3 cameras read +1 / +3.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Scope } from '../core/scope.ts';
import { CODING_FOUNDRY_MOTION as M } from '../content/themes/coding-foundry-motion.ts';
import { generateWorld } from '../world/index.ts';
import { createFoundryMovers } from './foundry-movers.ts';

describe('foundry movers pools (TASK-693)', () => {
  it('the live meshes and geometries do not grow with the line phase at a fixed camera', () => {
    const world = generateWorld(1001);
    const isl = world.islands.find((i) => i.theme === 'coding')!;
    const yard = isl.anchors.foundryYard!;
    const scope = new Scope('test');
    const view = createFoundryMovers(world, 'low', scope)!;
    // outside lod0, inside range: one LOD for the whole run
    const d = (M.plan.low.lod0 + M.plan.low.range) / 2;
    const cam = new THREE.Vector3(yard.x + d, yard.y ?? 0, yard.z);
    const names = (): string[] => view.group.children.map((o) => o.name).sort();
    const geos = (): number =>
      new Set(view.group.children.map((o) => (o as THREE.Mesh).geometry)).size;
    view.update(0, cam);
    const first = names();
    const firstGeos = geos();
    expect(first.length).toBeGreaterThan(1);
    for (let t = 0.5; t < M.line.period * 3; t += 0.5) view.update(t, cam);
    expect(names()).toEqual(first);
    expect(geos()).toBe(firstGeos);
    scope.dispose();
  });
});
