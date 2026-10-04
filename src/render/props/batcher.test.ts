import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createPropBatcher } from './batcher.ts';
import { createPropStore, PropFlag } from '../../world/prop-store.ts';
import { PROP_DEF_INDEX } from '../../content/props.ts';
import { Scope } from '../../core/scope.ts';
import { PROP_FLAG_REMOVED } from '../../world/prop-flags-ext.ts';
import { BLOOM_IN } from '../../content/anim.ts';
import { APPEAR_OUT_BELOW, removeFade } from './appear.ts';

function makeStore() {
  const s = createPropStore(500);
  for (let i = 0; i < 120; i++) {
    s.push(
      PROP_DEF_INDEX.roundTree,
      i % 3,
      (i % 12) * 3,
      2,
      Math.floor(i / 12) * 3,
      i,
      1,
      i < 60 ? 0 : 1,
      0,
      PropFlag.grounded | PropFlag.windy | PropFlag.clusterable,
    );
  }
  for (let i = 0; i < 200; i++) {
    s.push(
      PROP_DEF_INDEX.grassTuft,
      i % 2,
      (i % 20) * 0.5,
      0.2,
      Math.floor(i / 20),
      0,
      1,
      0,
      i < 100 ? 5 : 6,
      PropFlag.groundCover | PropFlag.windy,
    );
  }
  return s;
}

const counters = () => ({
  hardPops: 0,
  instances: 0,
  groundCover: 0,
  agents: 0,
  particles: 0,
  gpuMemoryMB: 0,
  rebuilds: 0,
});

describe('PropBatcher', () => {
  it('groups per (def, variant, lod, island) and ground cover per chunk', () => {
    const c = counters();
    const b = createPropBatcher(makeStore(), {
      scope: new Scope('t'),
      seed: 1,
      counters: c,
      materialFor: () => new THREE.MeshLambertMaterial(),
      softAppear: true,
      castShadows: false,
    });
    // trees: 3 variants × 2 islands × 2 lods = 12; grass: 2 variants × 2 chunks × 1 lod = 4; blobs: ≥1
    const trees = b.groups.filter((g) => g.def.id === 'roundTree');
    const grass = b.groups.filter((g) => g.def.id === 'grassTuft');
    const blobs = b.groups.filter((g) => g.def.id === 'treeBlob');
    expect(trees.length).toBe(12);
    expect(grass.length).toBe(4);
    expect(blobs.length).toBeGreaterThan(0);
    expect(b.stats.instances).toBeGreaterThanOrEqual(120);
    expect(b.stats.groundCover).toBe(200);
  });

  it('tier visibility: blobs at T0, trees from T1, ground cover only at T3 near focus', () => {
    const c = counters();
    const b = createPropBatcher(makeStore(), {
      scope: new Scope('t'),
      seed: 1,
      counters: c,
      materialFor: () => new THREE.MeshLambertMaterial(),
      softAppear: true,
      castShadows: false,
    });
    b.setTier(0, 0);
    b.update(0, 0, 0);
    const vis = (id: string) => b.groups.filter((g) => g.def.id === id && g.mesh.visible).length;
    expect(vis('treeBlob')).toBeGreaterThan(0);
    expect(vis('roundTree')).toBe(0);
    expect(vis('grassTuft')).toBe(0);
    b.setTier(1, 1);
    b.update(1, 0, 0);
    expect(vis('treeBlob')).toBe(0);
    expect(
      b.groups.filter((g) => g.def.id === 'roundTree' && g.mesh.visible && g.lod === 1).length,
    ).toBe(6);
    b.setTier(3, 2);
    b.update(2, -384 + 5 * 64 + 32, -384 + 32); // chunk 5 centre
    expect(vis('grassTuft')).toBe(4); // chunks 5 and 6 (64 u apart) both inside 60 + 45 u
    b.update(3, 300, 300); // far focus → none
    expect(vis('grassTuft')).toBe(0);
    expect(c.hardPops).toBe(0);
  });

  it('bloom-in queue drains ≤ 40 per frame with 0–220 ms stagger', () => {
    const c = counters();
    const b = createPropBatcher(makeStore(), {
      scope: new Scope('t'),
      seed: 1,
      counters: c,
      materialFor: () => new THREE.MeshLambertMaterial(),
      softAppear: true,
      castShadows: false,
    });
    b.setTier(0, 0);
    b.update(0, 0, 0);
    b.setTier(2, 10); // trees appear (LOD0 groups: 6 groups × 20 = 120)
    const appear = () =>
      b.groups
        .filter((g) => g.def.id === 'roundTree' && g.lod === 0)
        .flatMap((g) => Array.from(g.appear.array as Float32Array));
    expect(appear().filter((v) => v < 1e8).length).toBe(0);
    b.update(10, 0, 0);
    const after1 = appear().filter((v) => v < 1e8);
    expect(after1.length).toBe(40);
    for (const v of after1) {
      expect(v).toBeGreaterThanOrEqual(10);
      expect(v).toBeLessThanOrEqual(10.22);
    }
    b.update(10.033, 0, 0);
    b.update(10.066, 0, 0);
    expect(appear().filter((v) => v < 1e8).length).toBe(120);
  });

  it('counts hard pops when the material cannot bloom in', () => {
    const c = counters();
    const b = createPropBatcher(makeStore(), {
      scope: new Scope('t'),
      seed: 1,
      counters: c,
      materialFor: () => new THREE.MeshLambertMaterial(),
      softAppear: false,
      castShadows: false,
    });
    b.setTier(0, 0);
    b.setTier(1, 1);
    expect(c.hardPops).toBeGreaterThan(0);
  });
});

describe('PropBatcher.rewrite (TASK-211)', () => {
  const m4 = new THREE.Matrix4();
  const v3 = new THREE.Vector3();
  const setup = (instantEdits = false) => {
    const store = makeStore();
    const c = counters();
    const b = createPropBatcher(store, {
      scope: new Scope('t'),
      seed: 1,
      counters: c,
      materialFor: () => new THREE.MeshLambertMaterial(),
      softAppear: true,
      castShadows: false,
      instantEdits,
    });
    b.setTier(2, 0); // LOD0 trees visible, LOD1 hidden
    for (let f = 0; f < 4; f++) b.update(f * 0.1, 0, 0);
    return { store, b, c };
  };
  type Batcher = ReturnType<typeof setup>['b'];
  const slots = (b: Batcher, i: number) =>
    b.groups
      .filter((g) => !g.groundCover && Array.from(g.members).includes(i))
      .map((g) => ({ g, k: Array.from(g.members).indexOf(i) }))
      .sort((a, z) => a.g.lod - z.g.lod);
  const scaleOf = (mesh: THREE.InstancedMesh, k: number): number => {
    mesh.getMatrixAt(k, m4);
    return v3.setFromMatrixScale(m4).x;
  };
  const yOf = (mesh: THREE.InstancedMesh, k: number): number => {
    mesh.getMatrixAt(k, m4);
    return v3.setFromMatrixPosition(m4).y;
  };
  const tree = (
    store: ReturnType<typeof makeStore>,
    variant: number,
    x: number,
    island: number,
  ): number =>
    store.push(
      PROP_DEF_INDEX.roundTree,
      variant,
      x,
      3,
      50,
      0,
      1,
      island,
      0,
      PropFlag.grounded | PropFlag.windy | PropFlag.clusterable,
    );

  it('re-grounds touched instances in both LODs and their contact blobs', () => {
    const { store, b } = setup();
    store.y[3] = 7.5;
    const st = b.rewrite([3], 1);
    expect(st.updated).toBe(1);
    const sl = slots(b, 3);
    expect(sl).toHaveLength(2);
    for (const { g, k } of sl) {
      expect(yOf(g.mesh, k)).toBeCloseTo(7.5, 5);
      expect(yOf(g.blobs!, k)).toBeCloseTo(7.56, 5);
      expect(g.mesh.instanceMatrix.updateRanges.length).toBeGreaterThan(0);
    }
  });

  it('removal reverses the bloom-in, then zero-scales; restore blooms back in', () => {
    const { store, b, c } = setup();
    store.flags[3] |= PROP_FLAG_REMOVED;
    expect(b.rewrite([3], 5).removed).toBe(1);
    const [lod0, lod1] = slots(b, 3);
    const a = (lod0.g.appear.array as Float32Array)[lod0.k];
    expect(a).toBeLessThan(APPEAR_OUT_BELOW);
    expect(removeFade(a, 5, false)).toBe(1);
    expect(removeFade(a, 5 + BLOOM_IN.outMs / 1000, false)).toBe(0);
    expect(scaleOf(lod0.g.mesh, lod0.k)).toBeCloseTo(1, 5); // still there while it fades
    expect(scaleOf(lod1.g.mesh, lod1.k)).toBe(0); // hidden LOD: instant
    b.update(5.05, 0, 0);
    expect(scaleOf(lod0.g.mesh, lod0.k)).toBeCloseTo(1, 5);
    b.update(5.5, 0, 0);
    expect(scaleOf(lod0.g.mesh, lod0.k)).toBe(0);
    expect(scaleOf(lod0.g.blobs!, lod0.k)).toBe(0);
    // a second rewrite of a removed index is a no-op
    expect(b.rewrite([3], 5.6).removed).toBe(0);
    store.flags[3] &= ~PROP_FLAG_REMOVED;
    expect(b.rewrite([3], 6).restored).toBe(1);
    expect(scaleOf(lod0.g.mesh, lod0.k)).toBeCloseTo(1, 5);
    expect((lod0.g.appear.array as Float32Array)[lod0.k]).toBe(6); // bloom-in from now
    expect(c.hardPops).toBe(0);
  });

  it('capture mode removes and restores instantly', () => {
    const { store, b } = setup(true);
    store.flags[3] |= PROP_FLAG_REMOVED;
    b.rewrite([3], 5);
    for (const { g, k } of slots(b, 3)) expect(scaleOf(g.mesh, k)).toBe(0);
    store.flags[3] &= ~PROP_FLAG_REMOVED;
    b.rewrite([3], 6);
    const [lod0] = slots(b, 3);
    expect(scaleOf(lod0.g.mesh, lod0.k)).toBeCloseTo(1, 5);
    expect((lod0.g.appear.array as Float32Array)[lod0.k]).toBeLessThan(0);
  });

  it('appends edit-added props: grows with headroom, creates missing groups, no pops', () => {
    const { store, b, c } = setup();
    const g0 = b.groups.find(
      (g) => g.def.id === 'roundTree' && g.variant === 0 && g.bucket === 0 && g.lod === 0,
    )!;
    const before = g0.members.length;
    let disposed = 0;
    g0.mesh.geometry.addEventListener('dispose', () => disposed++);
    const added: number[] = [];
    for (let k = 0; k < 30; k++) added.push(tree(store, 0, 50 + k, 0));
    const st = b.rewrite(added, 7);
    expect(st.appended).toBe(30);
    expect(st.grown).toBeGreaterThanOrEqual(2); // both LODs reallocated at least once
    expect(g0.members.length).toBe(before + 30);
    expect(g0.mesh.count).toBe(before + 30);
    expect(g0.capacity).toBeGreaterThanOrEqual(g0.mesh.count);
    expect(g0.blobs!.count).toBe(g0.mesh.count);
    expect(disposed).toBe(1);
    expect(g0.mesh.parent).toBe(b.group);
    const k = g0.members.length - 1;
    expect(yOf(g0.mesh, k)).toBeCloseTo(3, 5);
    expect((g0.appear.array as Float32Array)[k]).toBe(7);
    // a def/variant/island with no group yet
    const groupsBefore = b.groups.length;
    const lone = tree(store, 1, 0, 2);
    expect(b.rewrite([lone], 8).appended).toBe(1);
    expect(b.groups.length).toBe(groupsBefore + 2);
    expect(b.stats.groups).toBe(b.groups.length);
    const made = b.groups.slice(groupsBefore);
    expect(made.find((g) => g.lod === 0)!.mesh.visible).toBe(true);
    expect(made.find((g) => g.lod === 1)!.mesh.visible).toBe(false);
    expect(c.hardPops).toBe(0);
  });
});
