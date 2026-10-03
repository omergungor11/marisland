import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createPropBatcher } from './batcher.ts';
import { createPropStore, PropFlag } from '../../world/prop-store.ts';
import { PROP_DEF_INDEX } from '../../content/props.ts';
import { Scope } from '../../core/scope.ts';

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
