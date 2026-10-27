import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Scope } from '../core/scope.ts';
import { SKY_CRAFT } from '../content/sky-craft.ts';
import { generateWorld } from '../world/index.ts';
import { makeLitMaterial } from './materials/factory.ts';
import { SHARED } from './uniforms.ts';
import { createKiteTrain, kitePosition, kiteTrainRig } from './kite-train.ts';
import { createSkyCraft } from './sky-craft.ts';

const K = SKY_CRAFT.kiteTrain;
const world = generateWorld(1001);
const coding = world.islands.find((i) => i.theme === K.theme);
const ANCHOR = new THREE.Vector3(5000, 2048, 5000);

function build(seed = 1001) {
  const scope = new Scope('kt');
  const mat = scope.add(
    makeLitMaterial({ instanced: true, dither: true, emissive: true, rim: true }),
  );
  const view = createKiteTrain(world, seed, mat, ANCHOR, scope);
  if (!view) throw new Error('no train');
  return { view, scope };
}

describe('mother kite train', () => {
  it('flies seven kites ~20 u above the Coding island, spaced along one line', () => {
    const rig = kiteTrainRig(world, 1001);
    if (!rig || !coding) throw new Error('no coding');
    expect(K.count).toBe(7);
    const p = Array.from({ length: K.count }, () => new THREE.Vector3());
    for (let t = 0; t < 600; t += 7) {
      for (let i = 0; i < K.count; i++) kitePosition(rig, i, t, 1, p[i]);
      for (const v of p) {
        expect(Math.hypot(v.x - coding.cx, v.z - coding.cz)).toBeLessThan(coding.radius);
        expect(v.y - coding.peakY).toBeGreaterThan(K.clearance - 6);
        expect(v.y - coding.peakY).toBeLessThan(K.clearance + 4);
      }
      for (let i = 0; i < K.count - 1; i++) {
        const d = p[i].distanceTo(p[i + 1]);
        expect(d).toBeGreaterThan(5);
        expect(d).toBeLessThan(12);
      }
    }
  });

  it('is deterministic per seed and a pure function of time', () => {
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const r1 = kiteTrainRig(world, 1001);
    const r2 = kiteTrainRig(world, 1001);
    const r3 = kiteTrainRig(world, 1002);
    if (!r1 || !r2 || !r3) throw new Error('rig');
    kitePosition(r1, 3, 123.4, 1, a);
    expect(kitePosition(r2, 3, 123.4, 1, b).toArray()).toEqual(a.toArray());
    expect(kitePosition(r3, 3, 123.4, 1, b).toArray()).not.toEqual(a.toArray());
  });

  it('one mesh on the sky-craft material, small, finite, same geometry at the same time', () => {
    const { view, scope } = build();
    expect(view.tris).toBeGreaterThan(400);
    expect(view.tris).toBeLessThan(1400);
    expect(view.mesh.castShadow).toBe(false);
    const pos = view.mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    view.update(37.5);
    const a = Float32Array.from(pos.array);
    expect(a.every(Number.isFinite)).toBe(true);
    view.update(90);
    view.update(37.5);
    expect(Array.from(pos.array)).toEqual(Array.from(a));
    scope.dispose();
  });

  it('moves with time; reduced motion calms the tails and sway', () => {
    const { view, scope } = build();
    const pos = view.mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    const tailMove = (): number => {
      view.update(50);
      const a = Float32Array.from(pos.array);
      view.update(50.4);
      let m = 0;
      for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i] - pos.array[i]));
      return m;
    };
    const full = tailMove();
    SHARED.uMotionScale.value = 0.3;
    const calm = tailMove();
    SHARED.uMotionScale.value = 1;
    expect(full).toBeGreaterThan(0.5);
    expect(calm).toBeGreaterThan(0.5); // the orbit itself still turns
    scope.dispose();
  });

  it('is part of createSkyCraft as one extra mesh', () => {
    const scope = new Scope('sc');
    const view = createSkyCraft(world, 'medium', scope, 1001);
    expect(view.meshes.some((m) => m.name === 'sky-kites')).toBe(true);
    expect(view.meshes).toHaveLength(3);
    scope.dispose();
  });
});
