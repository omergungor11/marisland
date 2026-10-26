import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { Scope } from '../core/scope.ts';
import { CULTURE_CLOCK } from '../content/cultures/rhythm.ts';
import { WHALE } from '../content/whale.ts';
import { generateWorld, type WorldData } from '../world/index.ts';
import { SHARED } from './uniforms.ts';
import { createWhale, type WhaleView } from './whale.ts';
import type { PlacedPuffs } from './particles/puffs.ts';

const SPH = CULTURE_CLOCK.secondsPerHour;
const CAPE = WHALE.capeHour * SPH;

describe('whale view (TASK-489)', () => {
  let world: WorldData;
  const scope = new Scope('whale-test');
  let view: WhaleView;
  const slots = new Float32Array(80 * 4);
  const placed: PlacedPuffs = {
    count: 80,
    set(i, x, y, z, size) {
      slots.set([x, y, z, size], i * 4);
    },
    upload() {},
  };
  const cam = new THREE.Vector3(0, 400, 600);
  const shown = (): number => {
    let n = 0;
    for (let i = 0; i < 80; i++) if (slots[i * 4 + 3] > 0) n++;
    return n;
  };

  beforeAll(() => {
    world = generateWorld(1001);
    view = createWhale(world, 1001, scope)!;
    view.bindPuffs({ reserve: () => placed });
  });

  it('exists and is hidden between surfacings', () => {
    expect(view).not.toBeNull();
    view.update(view.events[0].t - 40, 0, cam);
    expect(view.mesh.visible).toBe(false);
    expect(view.stats().event).toBe(-1);
  });

  it('at the cape hour the back is up with a spout, and the pose is a function of the day only', () => {
    SHARED.uMotionScale.value = 1;
    view.update(CAPE, 1, cam);
    expect(view.mesh.visible).toBe(true);
    expect(view.stats().event).toBe(0);
    expect(shown()).toBeGreaterThan(5);
    const a = Array.from(view.mesh.instanceMatrix.array);
    const pos = Array.from(view.mesh.geometry.getAttribute('position').array.slice(0, 600));
    view.update(CAPE + 40, 2, cam);
    view.update(CAPE, 99, cam);
    expect(Array.from(view.mesh.instanceMatrix.array)).toEqual(a);
    expect(Array.from(view.mesh.geometry.getAttribute('position').array.slice(0, 600))).toEqual(
      pos,
    );
  });

  it('hides inside the near fade distance (T2 dives do not clip the lens)', () => {
    const c = new THREE.Vector3().setFromMatrixPosition(
      new THREE.Matrix4().fromArray(view.mesh.instanceMatrix.array),
    );
    view.update(CAPE, 0, c.clone().add(new THREE.Vector3(5, 3, 0)));
    expect(view.mesh.visible).toBe(false);
    view.update(CAPE, 0, c.clone().add(new THREE.Vector3(WHALE.fade.near + 5, 3, 0)));
    expect(view.mesh.visible).toBe(true);
  });

  it('click: a ray at the back hits, a miss does not, poke slaps once and splashes', () => {
    SHARED.uMotionScale.value = 1;
    const at = CAPE - 3; // 5 s into the surfacing
    view.update(at, 10, cam);
    const m = new THREE.Matrix4().fromArray(view.mesh.instanceMatrix.array);
    const c = new THREE.Vector3().setFromMatrixPosition(m).add(new THREE.Vector3(0, 0.8, 0));
    const from = c.clone().add(new THREE.Vector3(0, 60, 40));
    const dir = c.clone().sub(from).normalize();
    expect(view.hit(from.x, from.y, from.z, dir.x, dir.y, dir.z)).toBeGreaterThan(0);
    const miss = c
      .clone()
      .add(new THREE.Vector3(0, 0, 80))
      .sub(from)
      .normalize();
    expect(view.hit(from.x, from.y, from.z, miss.x, miss.y, miss.z)).toBe(-1);
    expect(view.poke(10)).toBe(true);
    expect(view.poke(10.5)).toBe(false);
    // 1.4 s later the tail has landed: a splash crown stands on the water
    view.update(at + 1.4, 11.4, cam);
    expect(shown()).toBeGreaterThan(10);
    view.update(at + 4, 14, cam);
    expect(view.poke(14)).toBe(true);
  });

  it('reduced motion: no click slap', () => {
    SHARED.uMotionScale.value = 0.2;
    view.update(CAPE - 3, 100, cam);
    expect(view.poke(100)).toBe(false);
    SHARED.uMotionScale.value = 1;
  });

  it('is owned by the scope: dispose frees the geometry', () => {
    let freed = 0;
    view.mesh.geometry.addEventListener('dispose', () => freed++);
    scope.dispose();
    expect(freed).toBe(1);
  });
});
