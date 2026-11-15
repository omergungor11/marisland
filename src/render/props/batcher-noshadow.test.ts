import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createPropBatcher } from './batcher.ts';
import { createPropStore, PropFlag } from '../../world/prop-store.ts';
import { PROP_DEF_INDEX, type PropDef } from '../../content/props.ts';
import { Scope } from '../../core/scope.ts';
import { withFakeDefs } from './fake-defs.test-util.ts';

/** TASK-408: `PropFlag.noShadow` defs get no shadow-pass draw even when shadows are on. */
const FAKES: PropDef[] = [
  { id: 'fakeLit', geo: 'barrel', tier: 3, variants: 1, footprint: 0.3, flags: PropFlag.grounded },
  {
    id: 'fakeNoShadow',
    geo: 'barrel',
    tier: 3,
    variants: 1,
    footprint: 0.3,
    flags: PropFlag.grounded | PropFlag.noShadow,
  },
];

describe('PropFlag.noShadow', () => {
  const restore = { fn: (): void => {} };
  beforeAll(() => {
    restore.fn = withFakeDefs(FAKES);
  });
  afterAll(() => restore.fn());

  it('castShadow is off for the flagged def, on for its sibling', () => {
    const store = createPropStore(8);
    for (const id of ['fakeLit', 'fakeNoShadow'])
      store.push(PROP_DEF_INDEX[id], 0, 0, 1, 0, 0, 1, 0, 0, PropFlag.grounded);
    const b = createPropBatcher(store, {
      scope: new Scope('t'),
      seed: 1,
      counters: {
        hardPops: 0,
        instances: 0,
        groundCover: 0,
        agents: 0,
        particles: 0,
        gpuMemoryMB: 0,
        rebuilds: 0,
      },
      materialFor: () => new THREE.MeshLambertMaterial(),
      softAppear: true,
      castShadows: true,
    });
    const shadow = (id: string): boolean[] =>
      b.groups.filter((g) => g.def.id === id).map((g) => g.mesh.castShadow);
    expect(shadow('fakeLit').length).toBeGreaterThan(0);
    expect(shadow('fakeLit').every(Boolean)).toBe(true);
    expect(shadow('fakeNoShadow').length).toBeGreaterThan(0);
    expect(shadow('fakeNoShadow').some(Boolean)).toBe(false);
  });

  it('a group past its half fade casts no shadow (depth pass discards it all, TASK-435)', () => {
    const store = createPropStore(8);
    for (const id of ['fakeLit', 'fakeNoShadow'])
      store.push(PROP_DEF_INDEX[id], 0, 0, 1, 0, 0, 1, 0, 0, PropFlag.grounded);
    const mat = Object.assign(new THREE.MeshLambertMaterial(), {
      fade: { uFadeNear: { value: 100 }, uFadeFar: { value: 200 } },
    });
    const b = createPropBatcher(store, {
      scope: new Scope('t'),
      seed: 1,
      counters: {
        hardPops: 0,
        instances: 0,
        groundCover: 0,
        agents: 0,
        particles: 0,
        gpuMemoryMB: 0,
        rebuilds: 0,
      },
      materialFor: () => mat,
      softAppear: true,
      castShadows: true,
    });
    b.setTier(3, 0);
    const at = (d: number, id: string): { visible: boolean; cast: boolean } => {
      b.update(0, 0, 0, new THREE.Vector3(d, 0, 0));
      const g = b.groups.find((x) => x.def.id === id && x.visible)!;
      return { visible: g.mesh.visible, cast: g.mesh.castShadow };
    };
    expect(at(120, 'fakeLit')).toEqual({ visible: true, cast: true });
    // past the midpoint 150 (+ the group's bounding radius): drawn dithered, no shadow draw
    expect(at(170, 'fakeLit')).toEqual({ visible: true, cast: false });
    expect(at(120, 'fakeLit')).toEqual({ visible: true, cast: true });
    expect(at(120, 'fakeNoShadow').cast).toBe(false);
  });

  it('a group whose sphere reaches its band but no instance does draws nothing (TASK-678)', () => {
    const store = createPropStore(8);
    // two instances 200 u apart: the group sphere (radius ~100) reaches far past the instances
    for (const z of [100, -100])
      store.push(PROP_DEF_INDEX.fakeLit, 0, 0, 0, z, 0, 1, 0, 0, PropFlag.grounded);
    const mat = Object.assign(new THREE.MeshLambertMaterial(), {
      fade: { uFadeNear: { value: 150 }, uFadeFar: { value: 200 } },
    });
    const b = createPropBatcher(store, {
      scope: new Scope('t'),
      seed: 1,
      counters: {
        hardPops: 0,
        instances: 0,
        groundCover: 0,
        agents: 0,
        particles: 0,
        gpuMemoryMB: 0,
        rebuilds: 0,
      },
      materialFor: () => mat,
      softAppear: true,
      castShadows: true,
    });
    b.setTier(3, 0);
    const g = b.groups.find((x) => x.def.id === 'fakeLit' && x.visible)!;
    const at = (d: number): boolean => {
      b.update(0, 0, 0, new THREE.Vector3(d, 0, 0));
      return g.mesh.visible;
    };
    // sphere: 210 − ~100 < 200, but both instances sit at hypot(210, 100) ≈ 233 u
    expect(at(210)).toBe(false);
    // the contact blobs keep the sphere test (unchanged look)
    expect(g.inReach).toBe(true);
    // hypot(150, 100) ≈ 180 u: inside the band
    expect(at(150)).toBe(true);
    expect(at(400)).toBe(false);
  });

  it('a non-casting group with no instance in the view frustum skips its draw (TASK-678)', () => {
    const store = createPropStore(8);
    for (const z of [100, -100])
      store.push(PROP_DEF_INDEX.fakeLit, 0, 0, 0, z, 0, 1, 0, 0, PropFlag.grounded);
    const b = createPropBatcher(store, {
      scope: new Scope('t'),
      seed: 1,
      counters: {
        hardPops: 0,
        instances: 0,
        groundCover: 0,
        agents: 0,
        particles: 0,
        gpuMemoryMB: 0,
        rebuilds: 0,
      },
      materialFor: () => new THREE.MeshLambertMaterial(),
      softAppear: true,
      castShadows: false,
    });
    b.setTier(3, 0);
    const g = b.groups.find((x) => x.def.id === 'fakeLit' && x.visible)!;
    const cam = new THREE.PerspectiveCamera(35, 16 / 9, 0.5, 3000);
    const at = (lookX: number, camX = 60): boolean => {
      cam.position.set(camX, 5, 0);
      cam.lookAt(lookX, 5, 0);
      cam.updateMatrixWorld();
      const view = new THREE.Frustum().setFromProjectionMatrix(
        new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse),
      );
      b.update(0, 0, 0, cam.position, view);
      return g.mesh.visible;
    };
    // facing +x: the group sphere (radius ~100 about the origin) reaches into the view, no instance does
    expect(at(200)).toBe(false);
    expect(g.inReach).toBe(true);
    // facing the instances from 300 u (both within the ±30° horizontal half-angle)
    expect(at(0, 300)).toBe(true);
  });
});
