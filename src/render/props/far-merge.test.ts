import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ALL_ISLANDS, createPropBatcher, type Group } from './batcher.ts';
import { MERGED_FACADE_BIAS, MERGED_FACADE_SCALE, facadeCode } from './far-merge.ts';
import { createPropStore, PropFlag } from '../../world/prop-store.ts';
import { PROP_DEFS, PROP_DEF_INDEX } from '../../content/props.ts';
import { Scope } from '../../core/scope.ts';
import { createPropMaterials } from '../materials/prop-materials.ts';
import type { LitMaterial } from '../materials/factory.ts';

/**
 * TASK-407 far structure merge: at every tier (TASK-611; T0–T1 before) the LOD1 instances of an island draw as one
 * pre-transformed mesh per (island, material class, tier class); tagged LOD1 geometry (windmill
 * blades) stays instanced; bloom-ins / removal fades / outside writes draw through the groups;
 * an edit rebuilds only its island.
 */
const { grounded, windy, clusterable } = PropFlag;
const counters = () => ({
  hardPops: 0,
  instances: 0,
  groundCover: 0,
  agents: 0,
  particles: 0,
  gpuMemoryMB: 0,
  rebuilds: 0,
});

function makeStore() {
  const s = createPropStore(200);
  for (let isl = 0; isl < 3; isl++)
    for (let k = 0; k < 3; k++) {
      // structure (T0 from size), tree (T1, windy, clusterable), windmill (tagged blades)
      s.push(
        PROP_DEF_INDEX.cottage,
        k % 3,
        isl * 60 + k * 9,
        1,
        0,
        0.4 * k + isl,
        1,
        isl,
        0,
        grounded,
      );
      s.push(
        PROP_DEF_INDEX.pine,
        k % 3,
        isl * 60 + k * 9,
        1,
        12,
        1.1 * k,
        0.8 + 0.2 * k,
        isl,
        0,
        grounded | windy | clusterable,
      );
    }
  s.push(PROP_DEF_INDEX.windmill, 0, 30, 1, 30, 0, 1, 1, 0, grounded);
  return s;
}

function build(opts: { instant?: boolean; closeUp?: boolean } = {}) {
  const store = makeStore();
  const scope = new Scope('t');
  const pm = createPropMaterials(scope);
  const b = createPropBatcher(store, {
    scope,
    seed: 7,
    counters: counters(),
    materialFor: pm.materialFor,
    depthMaterialFor: pm.depthMaterialFor,
    mergedMaterialFor: pm.mergedFor,
    softAppear: true,
    instantEdits: opts.instant ?? false,
    castShadows: true,
    closeUpMerges: opts.closeUp,
  });
  return { store, scope, pm, b };
}

const lod1 = (b: ReturnType<typeof build>['b']): Group[] =>
  b.groups.filter((g) => g.lod === 1 && g.bucket === ALL_ISLANDS && !g.groundCover);
const named = (b: ReturnType<typeof build>['b'], id: string): Group[] =>
  lod1(b).filter((g) => g.def.id === id);
const farMeshes = (b: ReturnType<typeof build>['b']) => b.farMerge!.meshes;

describe('far structure merge (TASK-407)', () => {
  it('replaces the LOD1 groups at T1 with one mesh per island and class', () => {
    const { b } = build();
    b.setTier(1, 0);
    b.update(0, 0, 0);
    const meshes = farMeshes(b);
    // per island: structures (T0 + T1) and trees (T1 only, other fade) → 2 classes
    expect(meshes.length).toBe(6);
    expect(new Set(meshes.map((m) => m.island))).toEqual(new Set([0, 1, 2]));
    for (const m of meshes) expect(m.mesh.visible).toBe(true);
    for (const g of [...named(b, 'cottage'), ...named(b, 'pine')]) {
      expect(g.visible).toBe(true); // logical visibility (picking) unchanged
      expect(g.mesh.visible).toBe(false);
    }
    // tagged blades stay instanced
    for (const g of named(b, 'windmill')) expect(g.mesh.visible).toBe(true);
    // T0: trees are blobs, only the structure class shows
    b.setTier(0, 10);
    for (let t = 10; t < 13; t += 1 / 30) b.update(t, 0, 0); // tree blobs bloom in first
    for (const m of farMeshes(b)) expect(m.mesh.visible).toBe(m.tiers === 0b1111);
    // T2 (TASK-611): LOD1 stays armed behind the LOD0 hand-over; the merged meshes keep drawing
    b.setTier(2, 20);
    for (let t = 20; t < 23; t += 1 / 30) b.update(t, 0, 0); // LOD0 (no camera: blooms in) settles
    for (const m of farMeshes(b)) expect(m.mesh.visible).toBe(true);
  });

  it('bakes each instance exactly: world vertices, origin, scale and yaw code per vertex', () => {
    const { b, store } = build();
    b.setTier(1, 0);
    b.update(0, 0, 0);
    const pines = named(b, 'pine');
    let checked = 0;
    for (const g of pines)
      for (let k = 0; k < g.mesh.count; k++) {
        const i = g.members[k];
        const m = farMeshes(b).find((x) => x.island === store.islandId[i] && x.tiers === 0b1110)!;
        const geo = m.mesh.geometry;
        const spin = geo.getAttribute('aSpin');
        const mat = new THREE.Matrix4();
        g.mesh.getMatrixAt(k, mat);
        const o = new THREE.Vector3().setFromMatrixPosition(mat);
        // the instance's first vertex
        let v = -1;
        for (let j = 0; j < spin.count && v < 0; j++)
          if (spin.getX(j) === Math.fround(o.x) && spin.getZ(j) === Math.fround(o.z)) v = j;
        expect(v).toBeGreaterThanOrEqual(0);
        const base = g.mesh.geometry.getAttribute('position');
        const p = new THREE.Vector3().fromBufferAttribute(base, 0).applyMatrix4(mat);
        const q = new THREE.Vector3().fromBufferAttribute(geo.getAttribute('position'), v);
        expect(q.distanceTo(p)).toBeLessThan(1e-4);
        expect(spin.getW(v)).toBeLessThan(0.5); // never a tag
        expect(geo.getAttribute('aAppear').getX(v)).toBeCloseTo(store.scale[i], 6);
        const own = (g.mesh.geometry.getAttribute('aSeed').array as Float32Array)[k];
        expect(geo.getAttribute('aSeed').getX(v)).toBe(own);
        // world normal (shadow normal bias)
        const n0 = new THREE.Vector3().fromBufferAttribute(
          g.mesh.geometry.getAttribute('normal'),
          0,
        );
        n0.applyMatrix3(new THREE.Matrix3().getNormalMatrix(mat)).normalize();
        const n1 = new THREE.Vector3().fromBufferAttribute(geo.getAttribute('normal'), v);
        expect(n1.distanceTo(n0)).toBeLessThan(1e-4);
        // wind weights travel along (trees sway in the merged mesh too)
        expect(geo.getAttribute('wind')).toBeDefined();
        checked++;
      }
    expect(checked).toBe(9);
  });

  it('bakes the object-space facade test and quadrant of the night occupancy', () => {
    const code = (q: number) => (q + MERGED_FACADE_BIAS) / MERGED_FACADE_SCALE;
    // walls facing +x / +z / −x / −z, far enough out
    expect(facadeCode(2, 0, 1, 0, 0, 0.5)).toBe(code(0));
    expect(facadeCode(0, 2, 0, 0, 1, 0.5)).toBe(code(1));
    expect(facadeCode(0, -2, 0, 0, -1, 0.5)).toBe(code(-1));
    expect(facadeCode(-2, 0, -1, 0, 0, 0.5)).toBe(code(2));
    expect(facadeCode(-2, 0, -1, 0, -0, 0.5)).toBe(code(-2)); // atan2(−0, −1) = −π
    // roofs and inner partitions are not facades
    expect(facadeCode(2, 0, 0, 1, 0, 0.5)).toBe(0);
    expect(facadeCode(0.2, 0, 1, 0, 0, 0.5)).toBe(0);
    for (let q = -2; q <= 2; q++) {
      expect(code(q)).toBeGreaterThan(0.5 / MERGED_FACADE_SCALE);
      expect(code(q)).toBeLessThan(0.5);
    }
  });

  it('uses the same program as the groups: twin materials share the lit cache key', () => {
    const { pm } = build();
    const def = { ...PROP_DEFS[PROP_DEF_INDEX.cottage], tier: 0 as const };
    const twin = pm.mergedFor(def, 1).material as LitMaterial;
    const own = pm.materialFor(def, 1, false) as LitMaterial;
    expect(twin.customProgramCacheKey()).toBe(own.customProgramCacheKey());
    expect(twin.fade.uFadeNear.value).toBe(own.fade.uFadeNear.value);
    expect(twin.fade.uFadeFar.value).toBe(own.fade.uFadeFar.value);
    // the LOD1 hand-over state (TASK-611): drawn behind LOD0, also when merged
    expect(twin.polygonOffset && own.polygonOffset).toBe(true);
    // same uniforms → same twin; the LOD0 twin (near merge) is another class
    expect(pm.mergedFor(def, 1)).toBe(pm.mergedFor(def, 1));
    expect(pm.mergedFor(def, 0)).not.toBe(pm.mergedFor(def, 1));
  });

  it('waits for bloom-ins: the groups draw until every instance has settled', () => {
    const { b } = build();
    b.setTier(0, 0);
    b.update(0, 0, 0);
    b.setTier(1, 1); // soft: the tree LOD1 groups bloom in (no camera: every instance)
    for (let t = 1; t < 1.5; t += 1 / 30) b.update(t, 0, 0);
    for (const g of named(b, 'pine')) expect(g.mesh.visible).toBe(true);
    expect(farMeshes(b).every((m) => !m.mesh.visible)).toBe(true);
    for (let t = 1.5; t < 4; t += 1 / 30) b.update(t, 0, 0);
    for (const g of named(b, 'pine')) expect(g.mesh.visible).toBe(false);
    expect(farMeshes(b).some((m) => m.mesh.visible)).toBe(true);
  });

  it('an edit rebuilds only its island, after the removal fade; removed instances leave', () => {
    const { b, store } = build();
    b.setTier(1, 0);
    b.update(0, 0, 0);
    const before = new Map(farMeshes(b).map((m) => [m.mesh, m.island]));
    const verts = (isl: number) =>
      farMeshes(b)
        .filter((m) => m.island === isl)
        .reduce((a, m) => a + m.mesh.geometry.getAttribute('position').count, 0);
    const v1 = verts(1);
    const i = named(b, 'cottage')[0].members.find((x) => store.islandId[x] === 1)!;
    store.flags[i] |= PropFlag.removed;
    b.rewrite([i], 5);
    b.update(5, 0, 0);
    // fading out through the groups
    for (const g of named(b, 'cottage')) expect(g.mesh.visible).toBe(true);
    for (let t = 5; t < 6; t += 1 / 30) b.update(t, 0, 0);
    const after = farMeshes(b);
    for (const m of after) {
      // islands 0 / 2 keep their meshes, island 1 has new ones
      if (m.island === 1) expect(before.has(m.mesh)).toBe(false);
      else expect(before.get(m.mesh)).toBe(m.island);
      expect(m.mesh.visible).toBe(true);
    }
    expect(verts(1)).toBeLessThan(v1);
    expect(b.farMerge!.stats.rebuilds).toBe(2);
  });

  it('outside instance writes (click reactions) fall back to the groups for a moment', () => {
    const { b } = build();
    b.setTier(1, 0);
    b.update(0, 0, 0);
    const g = named(b, 'cottage')[0];
    g.mesh.instanceMatrix.needsUpdate = true;
    b.update(1, 0, 0);
    expect(g.mesh.visible).toBe(true);
    b.update(1.2, 0, 0);
    expect(g.mesh.visible).toBe(false);
  });

  it('disposes the merged geometry with the world scope', () => {
    const { b, scope } = build();
    b.setTier(1, 0);
    b.update(0, 0, 0);
    let disposed = 0;
    for (const m of farMeshes(b))
      m.mesh.geometry.addEventListener('dispose', () => {
        disposed++;
      });
    const n = farMeshes(b).length;
    scope.dispose();
    expect(disposed).toBe(n);
  });

  it('close up (TASK-611): builds at T2 only with closeUpMerges; LOD1 casts at T0–T1 only', () => {
    const { b } = build();
    b.setTier(2, 0);
    for (let t = 0; t < 3; t += 1 / 30) b.update(t, 0, 0, new THREE.Vector3(0, 400, 0));
    expect(farMeshes(b).length).toBeGreaterThan(0);
    expect(farMeshes(b).some((m) => m.mesh.visible)).toBe(true);
    for (const m of farMeshes(b)) expect(m.mesh.castShadow).toBe(false);
    for (const g of lod1(b)) expect(g.mesh.castShadow).toBe(false);
    const { b: low } = build({ closeUp: false });
    low.setTier(2, 0);
    for (let t = 0; t < 3; t += 1 / 30) low.update(t, 0, 0);
    expect(farMeshes(low)).toHaveLength(0); // no merged copies: LOD1 draws instanced
    low.setTier(1, 3);
    for (let t = 3; t < 6; t += 1 / 30) low.update(t, 0, 0);
    expect(farMeshes(low).length).toBeGreaterThan(0);
  });
});
