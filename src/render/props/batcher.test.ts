import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ALL_ISLANDS, createPropBatcher, geoStats, type BatcherWorld } from './batcher.ts';
import { createPropStore, PropFlag, type PropStore } from '../../world/prop-store.ts';
import { PROP_DEFS, PROP_DEF_INDEX } from '../../content/props.ts';
import { THEMES } from '../../content/themes/index.ts';
import { buildProp } from '../../geo/index.ts';
import { generateWorld } from '../../world/index.ts';
import { heightAt } from '../../world/types.ts';
import { smoothHeightAt } from '../../shared/terrain-sample.ts';
import { appendSettlementProps } from './settlement-props.ts';
import { Scope } from '../../core/scope.ts';
import { BLOOM_IN } from '../../content/anim.ts';
import { APPEAR_OUT_BELOW, removeFade } from './appear.ts';
import { clusterKey, clusterScale, deltaE, type Rgb } from './clusters.ts';

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
  it('groups per (def, variant, LOD0, island), (def, variant, LOD1) and ground cover per chunk', () => {
    const c = counters();
    const b = createPropBatcher(makeStore(), {
      scope: new Scope('t'),
      seed: 1,
      counters: c,
      materialFor: () => new THREE.MeshLambertMaterial(),
      softAppear: true,
      castShadows: false,
    });
    // trees: 3 variants × 2 islands LOD0 + 3 variants LOD1 (all islands, D5) = 9;
    // grass: 2 variants × 2 chunks × 1 lod = 4; blobs: ≥1
    const trees = b.groups.filter((g) => g.def.id === 'roundTree');
    const grass = b.groups.filter((g) => g.def.id === 'grassTuft');
    const blobs = b.groups.filter((g) => g.def.id === 'treeBlob');
    expect(trees.length).toBe(9);
    const far = trees.filter((g) => g.lod === 1);
    expect(far.map((g) => g.bucket)).toEqual([ALL_ISLANDS, ALL_ISLANDS, ALL_ISLANDS]);
    // every tree is in exactly one LOD0 and one LOD1 group
    expect(far.reduce((a, g) => a + g.members.length, 0)).toBe(120);
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
    ).toBe(3);
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
    store.flags[3] |= PropFlag.removed;
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
    store.flags[3] &= ~PropFlag.removed;
    expect(b.rewrite([3], 6).restored).toBe(1);
    expect(scaleOf(lod0.g.mesh, lod0.k)).toBeCloseTo(1, 5);
    expect((lod0.g.appear.array as Float32Array)[lod0.k]).toBe(6); // bloom-in from now
    expect(c.hardPops).toBe(0);
  });

  it('capture mode removes and restores instantly', () => {
    const { store, b } = setup(true);
    store.flags[3] |= PropFlag.removed;
    b.rewrite([3], 5);
    for (const { g, k } of slots(b, 3)) expect(scaleOf(g.mesh, k)).toBe(0);
    store.flags[3] &= ~PropFlag.removed;
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
    // the island's LOD0 tree group only: LOD1 joins the existing all-islands group of the
    // variant (D5) and its T0 blob the all-islands group of its colour class (TASK-373)
    expect(b.groups.length).toBe(groupsBefore + 1);
    expect(b.stats.groups).toBe(b.groups.length);
    const made = b.groups.slice(groupsBefore).filter((g) => g.def.id === 'roundTree');
    expect(made).toHaveLength(1);
    expect(made[0].lod).toBe(0);
    expect(made[0].mesh.visible).toBe(true);
    const lodFar = slots(b, lone).find((x) => x.g.lod === 1)!;
    expect(lodFar.g.bucket).toBe(ALL_ISLANDS);
    expect(lodFar.g.mesh.visible).toBe(false);
    expect(c.hardPops).toBe(0);
  });

  it('T0 cluster blobs follow removed / added / moved trees (TASK-213)', () => {
    const { store, b } = setup(true);
    b.setTier(0, 1);
    const blobAt = (x: number, z: number): { scale: number; visible: boolean } | null => {
      for (const g of b.groups) {
        if (g.def.id !== 'treeBlob') continue;
        for (let k = 0; k < g.mesh.count; k++) {
          g.mesh.getMatrixAt(k, m4);
          v3.setFromMatrixPosition(m4);
          if (Math.abs(v3.x - x) < 1e-4 && Math.abs(v3.z - z) < 1e-4)
            return { scale: v3.setFromMatrixScale(m4).x, visible: g.mesh.visible };
        }
      }
      return null;
    };
    // empty a cell: its blob is hidden (zero scale), the slot stays
    const key = clusterKey(store.x[0], store.z[0]);
    const cell = b.clusters.cells.get(key)!;
    const [cx, cz] = [cell.x, cell.z];
    expect(blobAt(cx, cz)!.scale).toBeCloseTo(clusterScale(cell.n), 5);
    const members = [...cell.members];
    for (const i of members) store.flags[i] |= PropFlag.removed;
    expect(b.rewrite(members, 2).clusters).toBe(1);
    expect(b.clusters.cells.get(key)!.n).toBe(0);
    expect(blobAt(cx, cz)!.scale).toBe(0);
    // a tree in a new cell appends a visible blob; moving it inside the cell moves the blob
    const blobsBefore = b.groups
      .filter((g) => g.def.id === 'treeBlob')
      .reduce((a, g) => a + g.mesh.count, 0);
    const t = tree(store, 0, 200, 0);
    store.z[t] = 200;
    expect(b.rewrite([t], 3).clusters).toBe(1);
    const added = blobAt(200, 200)!;
    expect(added.scale).toBeCloseTo(clusterScale(1), 5);
    expect(added.visible).toBe(true);
    expect(
      b.groups.filter((g) => g.def.id === 'treeBlob').reduce((a, g) => a + g.mesh.count, 0),
    ).toBe(blobsBefore + 1);
    store.x[t] = 201;
    b.rewrite([t], 4);
    expect(blobAt(200, 200)).toBeNull();
    expect(blobAt(201, 200)!.scale).toBeCloseTo(clusterScale(1), 5);
    // restoring the emptied cell brings its blob back at the original mean
    for (const i of members) store.flags[i] &= ~PropFlag.removed;
    b.rewrite(members, 5);
    expect(blobAt(cx, cz)!.scale).toBeCloseTo(clusterScale(members.length), 5);
  });
});

describe('T0 blobs and grounding (TASK-373)', () => {
  const m4 = new THREE.Matrix4();
  const v3 = new THREE.Vector3();
  const TREE = PropFlag.grounded | PropFlag.windy | PropFlag.clusterable;
  type Store = PropStore;
  const make = (store: Store, world?: BatcherWorld) =>
    createPropBatcher(store, {
      scope: new Scope('t'),
      seed: 1,
      counters: counters(),
      materialFor: () => new THREE.MeshLambertMaterial(),
      softAppear: true,
      castShadows: false,
      instantEdits: true,
      world,
    });
  /** Canopy colour of the trees a cell stands for (area · scale² weighted, LOD0 geometry). */
  const cellColor = (store: Store, members: readonly number[]): Rgb => {
    const rgb: Rgb = [0, 0, 0];
    let a = 0;
    for (const i of members) {
      const st = geoStats(buildProp(PROP_DEFS[store.defId[i]].geo, 1, store.variant[i], 0));
      const w = st.area * store.scale[i] * store.scale[i];
      for (let c = 0; c < 3; c++) rgb[c] += st.rgb[c] * w;
      a += w;
    }
    return [rgb[0] / a, rgb[1] / a, rgb[2] / a];
  };
  /** Every live blob: ΔE of its geometry's canopy colour vs the trees of its cell. */
  const blobErrors = (store: Store, b: ReturnType<typeof make>): number[] => {
    const out: number[] = [];
    for (const g of b.groups) {
      if (g.def.id !== 'treeBlob') continue;
      const own = geoStats(g.mesh.geometry).rgb;
      for (let k = 0; k < g.mesh.count; k++) {
        g.mesh.getMatrixAt(k, m4);
        if (v3.setFromMatrixScale(m4).x === 0) continue;
        v3.setFromMatrixPosition(m4);
        const cell = b.clusters.cells.get(clusterKey(v3.x, v3.z))!;
        out.push(deltaE(own, cellColor(store, cell.members)));
      }
    }
    return out;
  };

  it('one blob group per colour class across islands; ΔE ≤ 4 vs the canopy (seeded worlds)', () => {
    for (const seed of [1, 1001]) {
      const world = generateWorld(seed);
      const { props } = appendSettlementProps(world);
      const b = make(props, world);
      const blobs = b.groups.filter((g) => g.def.id === 'treeBlob');
      expect(blobs.every((g) => g.bucket === ALL_ISLANDS)).toBe(true);
      const err = blobErrors(props, b);
      // 3 pure kinds + a few blends; was one group per island × variant (~18)
      expect(blobs.length).toBeLessThanOrEqual(10);
      expect(err.length).toBe([...b.clusters.cells.values()].filter((c) => c.n).length);
      expect(Math.max(...err), `seed ${seed}`).toBeLessThanOrEqual(4);
    }
  });

  it('a pine cell gets a pine-coloured blob; adding pines to a deciduous cell moves its class', () => {
    const s = createPropStore(64);
    for (let k = 0; k < 4; k++)
      s.push(PROP_DEF_INDEX.roundTree, k % 3, 1 + k, 1, 1, 0, 1, 0, 0, TREE);
    for (let k = 0; k < 4; k++) s.push(PROP_DEF_INDEX.pine, k % 3, 41 + k, 1, 1, 0, 1, 1, 0, TREE);
    const b = make(s);
    b.setTier(0, 0);
    expect(b.groups.filter((g) => g.def.id === 'treeBlob')).toHaveLength(2);
    expect(Math.max(...blobErrors(s, b))).toBeLessThanOrEqual(4);
    const added: number[] = [];
    for (let k = 0; k < 8; k++)
      added.push(s.push(PROP_DEF_INDEX.pine, k % 3, 1.5 + k * 0.5, 1, 2, 0, 1, 0, 0, TREE));
    b.rewrite(added, 1);
    expect(Math.max(...blobErrors(s, b))).toBeLessThanOrEqual(4);
    const blobs = b.groups.filter((g) => g.def.id === 'treeBlob');
    expect(blobs.every((g) => g.mesh.visible)).toBe(true);
    // the old slot stays, hidden: one live blob per cell
    expect(blobErrors(s, b)).toHaveLength(2);
  });

  it('LOD1 contact blobs draw as one merged mesh mirroring the visible LOD1 groups', () => {
    const s = createPropStore(64);
    for (let k = 0; k < 6; k++)
      s.push(PROP_DEF_INDEX.roundTree, k % 3, k * 10, 1, 0, 0, 1, k % 2, 0, TREE);
    const b = make(s);
    const l1 = b.groups.filter((g) => g.lod === 1 && g.blobs);
    expect(l1.length).toBe(3);
    expect(l1.every((g) => g.blobs!.parent === null)).toBe(true);
    const far = () =>
      b.group.children.find((o) => o.name === 'props:L1:blobs') as THREE.InstancedMesh | undefined;
    b.setTier(1, 0);
    b.update(0, 0, 0);
    expect(far()!.visible).toBe(true);
    expect(far()!.count).toBe(6);
    // removal (instant): the merged copy follows the group's zero-scaled blob
    s.flags[2] |= PropFlag.removed;
    b.rewrite([2], 1);
    const g = l1.find((x) => Array.from(x.members).includes(2))!;
    const off = l1.slice(0, l1.indexOf(g)).reduce((a, x) => a + x.blobs!.count, 0);
    far()!.getMatrixAt(off + Array.from(g.members).indexOf(2), m4);
    expect(v3.setFromMatrixScale(m4).x).toBe(0);
    // T2: no LOD1 group visible → hidden
    b.setTier(2, 2);
    b.update(2, 0, 0);
    expect(far()!.visible).toBe(false);
  });

  it('island tree palettes pick the blob class (equal hexes → one group across islands)', () => {
    const s = createPropStore(16);
    s.push(PROP_DEF_INDEX.roundTree, 0, 1, 1, 1, 0, 1, 0, 0, TREE);
    s.push(PROP_DEF_INDEX.roundTree, 0, 41, 1, 1, 0, 1, 1, 0, TREE);
    const height = generateWorld(1).height;
    const b = make(s, { height, islands: [{ theme: 'hq' }, { theme: 'coding' }] });
    const sameHexes =
      JSON.stringify(THEMES.hq.treePalette) === JSON.stringify(THEMES.coding.treePalette);
    expect(b.groups.filter((g) => g.def.id === 'treeBlob')).toHaveLength(sameHexes ? 1 : 2);
  });

  it('smooth-twin grounding: drawn y = smoothHeightAt where it differs > 0.02 u; store y unchanged', () => {
    const world = generateWorld(1);
    const h = world.height;
    let px = 0;
    let pz = 0;
    let found = false;
    for (let x = -150; x < 150 && !found; x += 0.7)
      for (let z = -150; z < 150 && !found; z += 0.7)
        if (heightAt(h, x, z) > 1 && Math.abs(smoothHeightAt(h, x, z) - heightAt(h, x, z)) > 0.05) {
          px = x;
          pz = z;
          found = true;
        }
    expect(found).toBe(true);
    const s = createPropStore(8);
    const yb = heightAt(h, px, pz);
    const a = s.push(PROP_DEF_INDEX.bush, 0, px, yb, pz, 0, 1, 0, 0, PropFlag.grounded);
    // not ground-following (a deck at a fixed height): left alone
    const deck = s.push(PROP_DEF_INDEX.bush, 0, px, yb + 0.5, pz, 0, 1, 0, 0, PropFlag.grounded);
    const b = make(s, { height: h, islands: world.islands });
    const yOf = (i: number): number => {
      const g = b.groups.find((x) => x.lod === 0 && Array.from(x.members).includes(i))!;
      g.mesh.getMatrixAt(Array.from(g.members).indexOf(i), m4);
      return v3.setFromMatrixPosition(m4).y;
    };
    expect(yOf(a)).toBeCloseTo(smoothHeightAt(h, px, pz), 5);
    expect(yOf(deck)).toBeCloseTo(yb + 0.5, 5);
    expect(s.y[a]).toBe(Math.fround(yb));
    // edits re-ground through the same rule
    s.y[a] = 0;
    b.rewrite([a], 1);
    expect(yOf(a)).toBeCloseTo(0, 5);
    s.y[a] = heightAt(h, px, pz);
    b.rewrite([a], 2);
    expect(yOf(a)).toBeCloseTo(smoothHeightAt(h, px, pz), 5);
    // without world context nothing moves
    const plain = make(s);
    const g = plain.groups.find((x) => x.lod === 0 && Array.from(x.members).includes(a))!;
    g.mesh.getMatrixAt(Array.from(g.members).indexOf(a), m4);
    expect(v3.setFromMatrixPosition(m4).y).toBeCloseTo(s.y[a], 5);
  });
});
