import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createPropBatcher, type Group } from './batcher.ts';
import { createPropStore, PropFlag } from '../../world/prop-store.ts';
import { PROP_DEF_INDEX } from '../../content/props.ts';
import { NEAR_MERGE } from '../../content/budgets.ts';
import { Scope } from '../../core/scope.ts';
import { createPropMaterials } from '../materials/prop-materials.ts';

/**
 * TASK-476 near structure merge: at T2–T3 the small LOD0 groups of an island (HQ's seven culture
 * gates, one group per culture variant) draw as one pre-transformed mesh per (island, material
 * class, tier class); big / tree / scaled-windy groups stay instanced; an island is built only
 * once the camera comes within NEAR_MERGE.reach.
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

/** Island 0 at x ≈ 0, island 1 at x ≈ 1000 (far apart). */
function makeStore() {
  const s = createPropStore(64);
  for (const [isl, x0] of [
    [0, 0],
    [1, 1000],
  ] as const) {
    // seven culture gates: seven LOD0 groups (one instance each)
    for (let v = 0; v < 7; v++)
      s.push(PROP_DEF_INDEX.cultureGate, v, x0 + v * 6, 0, 0, 0, 1, isl, 0, windy);
    // trees stay instanced (clusterable)
    s.push(PROP_DEF_INDEX.pine, 0, x0, 0, 20, 0, 1, isl, 0, grounded | windy | clusterable);
  }
  // a windy group at non-unit scale stays instanced (merged sway takes world-unit pivot heights)
  s.push(PROP_DEF_INDEX.goodsStall, 0, 10, 0, 10, 0, 1.2, 0, 0, grounded | windy);
  return s;
}

function build(nearMergeMaxVerts?: number) {
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
    castShadows: true,
    nearMergeMaxVerts,
  });
  return { store, scope, b };
}

const lod0 = (b: ReturnType<typeof build>['b'], id: string, isl: number): Group[] =>
  b.groups.filter((g) => g.lod === 0 && g.def.id === id && g.bucket === isl);

describe('near structure merge (TASK-476)', () => {
  it('merges the seven gate groups of the island in reach into one mesh; the far island waits', () => {
    const { b } = build();
    const cam = new THREE.Vector3(20, 15, 40);
    b.setTier(2, 0);
    b.update(0, 0, 0, cam);
    const near = b.nearMerge!;
    expect(lod0(b, 'cultureGate', 0)).toHaveLength(7);
    // island 0 built (one class: the gates), island 1 still dirty (out of reach)
    expect(near.meshes.map((m) => m.island)).toEqual([0]);
    expect(near.dirty.has(1)).toBe(true);
    const m = near.meshes[0];
    expect(m.mesh.visible).toBe(true);
    expect(m.mesh.castShadow).toBe(true);
    expect(m.mesh.name.startsWith('props:near:0:')).toBe(true);
    for (const g of lod0(b, 'cultureGate', 0)) {
      expect(g.visible).toBe(true); // logical visibility (picking) unchanged
      expect(g.mesh.visible).toBe(false);
    }
    // the merged mesh holds every gate vertex
    const verts = lod0(b, 'cultureGate', 0).reduce(
      (a, g) => a + g.mesh.count * g.mesh.geometry.getAttribute('position').count,
      0,
    );
    expect(m.mesh.geometry.getAttribute('position').count).toBe(verts);
    // the camera reaches island 1: it is built too
    cam.set(1020, 15, 40);
    b.update(1, 0, 0, cam);
    expect(new Set(near.meshes.map((x) => x.island))).toEqual(new Set([0, 1]));
    for (const g of lod0(b, 'cultureGate', 1)) expect(g.mesh.visible).toBe(false);
  });

  it('keeps big, tree and scaled windy groups out of the merge', () => {
    const { b } = build();
    const cam = new THREE.Vector3(20, 15, 40);
    b.setTier(2, 0);
    b.update(0, 0, 0, cam);
    const kept = [...lod0(b, 'pine', 0), ...lod0(b, 'goodsStall', 0)];
    expect(kept).toHaveLength(2);
    for (const g of kept) expect(g.mesh.visible).toBe(true);
    // a group over the vertex cap stays instanced too (a gate has > 100 vertices)
    expect(NEAR_MERGE.maxVerts).toBeGreaterThan(100);
    const { b: b2 } = build(100);
    b2.setTier(2, 0);
    b2.update(0, 0, 0, cam);
    expect(b2.nearMerge!.meshes).toHaveLength(0);
    for (const g of lod0(b2, 'cultureGate', 0)) expect(g.mesh.visible).toBe(true);
  });

  it('waits for bloom-ins and hides at T0–T1', () => {
    const { b } = build();
    const cam = new THREE.Vector3(20, 15, 40);
    b.setTier(1, 0);
    b.update(0, 0, 0, cam);
    b.setTier(2, 1); // soft: LOD0 blooms in
    for (let t = 1; t < 1.5; t += 1 / 30) b.update(t, 0, 0, cam);
    for (const g of lod0(b, 'cultureGate', 0)) expect(g.mesh.visible).toBe(true);
    expect(b.nearMerge!.meshes.every((m) => !m.mesh.visible)).toBe(true);
    for (let t = 1.5; t < 4; t += 1 / 30) b.update(t, 0, 0, cam);
    for (const g of lod0(b, 'cultureGate', 0)) expect(g.mesh.visible).toBe(false);
    expect(b.nearMerge!.meshes.some((m) => m.mesh.visible)).toBe(true);
    b.setTier(1, 5);
    b.update(5, 0, 0, cam);
    expect(b.nearMerge!.meshes.every((m) => !m.mesh.visible)).toBe(true);
  });

  it('disposes the merged geometry with the world scope', () => {
    const { b, scope } = build();
    b.setTier(2, 0);
    b.update(0, 0, 0, new THREE.Vector3(20, 15, 40));
    let disposed = 0;
    for (const m of b.nearMerge!.meshes)
      m.mesh.geometry.addEventListener('dispose', () => {
        disposed++;
      });
    const n = b.nearMerge!.meshes.length;
    expect(n).toBeGreaterThan(0);
    scope.dispose();
    expect(disposed).toBe(n);
  });
});
