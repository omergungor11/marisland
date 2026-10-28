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
  CULTURE_SURFACE,
  CULTURE_SURFACE_PRE,
  FLOW_SURFACE,
  LAVA_SURFACE_PRE,
  PULSE_ONLY,
} from './materials/activity-glsl.ts';
import { LAVA } from '../content/lava.ts';
import { PUFF_DELTA, type Puffs } from './particles/puffs.ts';
import { createWaterfalls, lavaFalls } from './waterfalls.ts';

const world = generateWorld(1001);
const sha = (s: string): string => createHash('sha256').update(s).digest('hex').slice(0, 16);

function fakePuffs(): Puffs & { added: number[][] } {
  const added: number[][] = [];
  return {
    added,
    mesh: null as unknown as THREE.InstancedMesh,
    addEmitter: (x, y, z, kind) => added.push([x, y, z, kind]) - 1,
    setEmitter: () => undefined,
    reserve: () => null,
    finalize: () => undefined,
    update: () => undefined,
    stats: () => ({ used: 0, capacity: 0, dropped: 0 }),
  };
}

describe('waterfall flow tag (TASK-395)', () => {
  it('leaves the untagged / kind 1–9 GLSL unchanged when the flow branch is cut out', () => {
    // pre-TASK-395 ACTIVITY_SURFACE / ACTIVITY_VARY: re-pin only for a deliberate surface change
    expect(ACTIVITY_SURFACE.split(FLOW_SURFACE)).toHaveLength(2);
    // (TASK-440's culture kinds are cut out as well: they run in front of the flow branch)
    // (and TASK-509a's lava glow declarations, used only by the flow branch's lava modes)
    const base = ACTIVITY_SURFACE.replace(LAVA_SURFACE_PRE, '')
      .replace(CULTURE_SURFACE_PRE, '')
      .replace(CULTURE_SURFACE, '');
    expect(sha(base.replace(FLOW_SURFACE, ''))).toBe('32236d315ac038b6');
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
      // discs (foam 1, lava delta 3) lie on the water; sheets (water 0, lava 2) hover off the ground
      if (Math.round(spin.getZ(i)) % 2 === 1) {
        expect(y).toBeCloseTo(L.foam.y, 5);
        continue;
      }
      sheet++;
      // never inside the ground (no z-fight with the face / the plateau)
      expect(y - heightAt(world.height, x, z)).toBeGreaterThan(0.05);
    }
    const falls = world.waterfalls.length + lavaFalls(world).length;
    expect(sheet).toBe(falls * (L.rows + 1) * (L.cols + 1));
    scope.dispose();
  });

  it('adds mist emitters per fall by quality tier', () => {
    for (const q of ['low', 'medium', 'high'] as const) {
      const scope = new Scope('test');
      const puffs = fakePuffs();
      createWaterfalls(world, q, scope, puffs);
      const lava = lavaFalls(world).length;
      expect(puffs.added).toHaveLength(
        world.waterfalls.length * L.mistEmitters[q] + lava * LAVA.fall.steamEmitters[q],
      );
      expect(puffs.added.filter((e) => e[3] === PUFF_DELTA)).toHaveLength(
        lava * LAVA.fall.steamEmitters[q],
      );
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

describe('lava fall (TASK-509a)', () => {
  it('seed 1001 has one lava fall off the D-083 lip, reaching the sea', () => {
    const falls = lavaFalls(world);
    expect(falls).toHaveLength(1);
    const f = falls[0];
    const lip = world.islands.find((i) => i.archetype === 'emberpeak')!.anchors.lavaFall;
    expect(f.x).toBe(lip.x);
    expect(f.z).toBe(lip.z);
    expect(heightAt(world.height, f.baseX, f.baseZ)).toBeLessThan(0);
    expect(Math.hypot(f.baseX - f.x, f.baseZ - f.z)).toBeLessThan(16);
  });

  it('tags the lava sheet / delta with flow modes 2 / 3', () => {
    const scope = new Scope('lava');
    const mesh = createWaterfalls(world, 'medium', scope, fakePuffs()).mesh!;
    const spin = mesh.geometry.getAttribute('aSpin');
    const modes = new Set<number>();
    for (let i = 0; i < spin.count; i++) modes.add(Math.round(spin.getZ(i)));
    expect([...modes].sort()).toEqual([0, 1, 2, 3]);
    scope.dispose();
  });
});
