import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Scope } from '../core/scope.ts';
import { SURFACE } from '../content/activity.ts';
import { WATERFALL_LOOK as L } from '../content/waterfalls.ts';
import { generateWorld, heightAt } from '../world/index.ts';
import {
  ACTIVITY_SURFACE,
  ACTIVITY_VARY,
  FLOW_SURFACE,
  PULSE_ONLY,
} from './materials/activity-glsl.ts';
import type { Puffs } from './particles/puffs.ts';
import { createWaterfalls } from './waterfalls.ts';

const world = generateWorld(1001);
const sha = (s: string): string => createHash('sha256').update(s).digest('hex').slice(0, 16);

function fakePuffs(): Puffs & { added: number[][] } {
  const added: number[][] = [];
  return {
    added,
    mesh: null as unknown as THREE.InstancedMesh,
    addEmitter: (x, y, z, kind) => added.push([x, y, z, kind]) - 1,
    setEmitter: () => undefined,
    finalize: () => undefined,
    update: () => undefined,
    stats: () => ({ used: 0, capacity: 0, dropped: 0 }),
  };
}

describe('waterfall flow tag (TASK-395)', () => {
  it('leaves the untagged / kind 1–9 GLSL unchanged when the flow branch is cut out', () => {
    // pre-TASK-395 ACTIVITY_SURFACE / ACTIVITY_VARY: re-pin only for a deliberate surface change
    expect(ACTIVITY_SURFACE.split(FLOW_SURFACE)).toHaveLength(2);
    expect(sha(ACTIVITY_SURFACE.replace(FLOW_SURFACE, ''))).toBe('32236d315ac038b6');
    expect(ACTIVITY_VARY.split(PULSE_ONLY)).toHaveLength(2);
    expect(sha(ACTIVITY_VARY.replace(PULSE_ONLY, ''))).toBe('e285bbfd2d54f04f');
    // the flow branch only runs for its own kind
    expect(FLOW_SURFACE.startsWith(`if (marK > ${(SURFACE.flow - 0.5).toFixed(6)})`)).toBe(true);
  });
});

describe('waterfall renderer (TASK-395)', () => {
  it('builds one mesh tagged with the flow kind, hovering off the wall', () => {
    const scope = new Scope('test');
    const puffs = fakePuffs();
    const view = createWaterfalls(world, 'medium', scope, puffs);
    expect(world.waterfalls.length).toBeGreaterThan(0);
    const mesh = view.mesh!;
    expect(mesh).toBeInstanceOf(THREE.InstancedMesh);
    expect(mesh.count).toBe(1);
    expect(mesh.castShadow).toBe(false);
    const geo = mesh.geometry;
    const pos = geo.getAttribute('position');
    const spin = geo.getAttribute('aSpin');
    let sheet = 0;
    for (let i = 0; i < pos.count; i++) {
      expect(spin.getW(i)).toBe(-SURFACE.flow);
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      if (spin.getZ(i) > 0.5) {
        expect(y).toBeCloseTo(L.foam.y, 5);
        continue;
      }
      sheet++;
      // never inside the ground (no z-fight with the face / the plateau)
      expect(y - heightAt(world.height, x, z)).toBeGreaterThan(0.05);
    }
    expect(sheet).toBe(world.waterfalls.length * (L.rows + 1) * (L.cols + 1));
    scope.dispose();
  });

  it('adds mist emitters per fall by quality tier', () => {
    for (const q of ['low', 'medium', 'high'] as const) {
      const scope = new Scope('test');
      const puffs = fakePuffs();
      createWaterfalls(world, q, scope, puffs);
      expect(puffs.added).toHaveLength(world.waterfalls.length * L.mistEmitters[q]);
      scope.dispose();
    }
  });

  it('is a pure function of the world data', () => {
    const a = createWaterfalls(world, 'high', new Scope('a'), fakePuffs()).mesh!;
    const b = createWaterfalls(world, 'high', new Scope('b'), fakePuffs()).mesh!;
    const pa = a.geometry.getAttribute('position').array;
    const pb = b.geometry.getAttribute('position').array;
    expect(Array.from(pa)).toEqual(Array.from(pb));
  });
});
