import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ALL_ISLANDS, createPropBatcher, lodGeo } from './batcher.ts';
import { createPropStore, PropFlag } from '../../world/prop-store.ts';
import { PROP_DEFS, PROP_DEF_INDEX, type PropDef } from '../../content/props.ts';
import { Scope } from '../../core/scope.ts';
import { buildProp } from '../../geo/index.ts';
import { withFakeDefs } from './fake-defs.test-util.ts';

/**
 * TASK-304: shared LOD1 proxies (`def.lod1`) and interiors, with fake defs over existing
 * geometry — the themed shells of TASK-303 may not exist yet.
 */
const { grounded, clusterable } = PropFlag;
const FAKES: PropDef[] = [
  // three "shells" over two proxy classes (barrel:0, barrel:1)
  {
    id: 'fakeShellA',
    geo: 'cottage',
    tier: 1,
    variants: 2,
    footprint: 2,
    flags: grounded,
    lod1: { geo: 'barrel', variant: 0 },
  },
  {
    id: 'fakeShellB',
    geo: 'barn',
    tier: 1,
    variants: 2,
    footprint: 3,
    flags: grounded,
    lod1: { geo: 'barrel', variant: 0 },
  },
  {
    id: 'fakeShellC',
    geo: 'logCabin',
    tier: 1,
    variants: 2,
    footprint: 2.5,
    flags: grounded,
    lod1: { geo: 'barrel', variant: 1 },
  },
  {
    id: 'fakeInterior',
    geo: 'bench',
    tier: 2,
    variants: 2,
    footprint: 1,
    flags: grounded | clusterable,
    interior: true,
  },
];

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
  // 3 shells × 2 variants × 3 islands, 2 instances each
  for (const id of ['fakeShellA', 'fakeShellB', 'fakeShellC'])
    for (let v = 0; v < 2; v++)
      for (let isl = 0; isl < 3; isl++)
        for (let k = 0; k < 2; k++)
          s.push(PROP_DEF_INDEX[id], v, isl * 40 + k * 8, 1, v * 8, 0, 1, isl, 0, grounded);
  for (let isl = 0; isl < 3; isl++)
    s.push(PROP_DEF_INDEX.fakeInterior, isl % 2, isl * 40, 1, 0, 0, 1, isl, 0, grounded);
  return s;
}

const build = (store = makeStore(), opts: { cast?: boolean; interior?: boolean } = {}) =>
  createPropBatcher(store, {
    scope: new Scope('t'),
    seed: 1,
    counters: counters(),
    materialFor: () => new THREE.MeshLambertMaterial(),
    softAppear: true,
    castShadows: opts.cast ?? false,
    interiorShadows: opts.interior,
  });

describe('PropBatcher: shared LOD1 proxies + interiors (TASK-304)', () => {
  const restore = { fn: (): void => {} };
  beforeAll(() => (restore.fn = withFakeDefs(FAKES)));
  afterAll(() => restore.fn());

  it('themed shells collapse to one LOD1 group per proxy class', () => {
    const b = build();
    const shells = new Set(['fakeShellA', 'fakeShellB', 'fakeShellC']);
    const lod1 = b.groups.filter((g) => g.lod === 1 && shells.has(g.def.id));
    expect(lod1).toHaveLength(2); // barrel:0, barrel:1 — instead of 3 defs × 2 variants = 6
    expect(lod1.every((g) => g.bucket === ALL_ISLANDS)).toBe(true);
    expect(lod1.map((g) => g.variant).sort()).toEqual([0, 1]);
    expect(lod1.every((g) => g.mesh.name.startsWith('@barrel:'))).toBe(true);
    // every shell instance is in exactly one LOD1 group; A + B share barrel:0
    expect(lod1.reduce((a, g) => a + g.members.length, 0)).toBe(36);
    const g0 = lod1.find((g) => g.variant === 0)!;
    expect(g0.members.length).toBe(24);
    // LOD0 stays per (def, variant, island)
    expect(b.groups.filter((g) => g.lod === 0 && shells.has(g.def.id))).toHaveLength(18);
    // the shared groups draw the proxy geometry (barrel, LOD1), not a shell's
    const proxy = buildProp('barrel', 1, 0, 1).getAttribute('position').count;
    expect(g0.mesh.geometry.getAttribute('position').count).toBe(proxy);
    expect(lodGeo(FAKES[1], 1, 1)).toEqual({ geo: 'barrel', variant: 0 });
    expect(lodGeo(FAKES[1], 1, 0)).toEqual({ geo: 'barn', variant: 1 });
  });

  it('shared groups follow the tiers like any LOD1 group, no hard pops', () => {
    const c = counters();
    const b = createPropBatcher(makeStore(), {
      scope: new Scope('t'),
      seed: 1,
      counters: c,
      materialFor: () => new THREE.MeshLambertMaterial(),
      softAppear: true,
      castShadows: false,
    });
    const shared = b.groups.filter((g) => g.mesh.name.startsWith('@'));
    b.setTier(1, 0);
    b.update(0, 0, 0);
    expect(shared.every((g) => g.mesh.visible)).toBe(true);
    b.setTier(2, 1);
    b.update(1, 0, 0);
    expect(shared.some((g) => g.mesh.visible)).toBe(false);
    b.setTier(1, 2);
    b.update(2, 0, 0);
    expect(c.hardPops).toBe(0);
  });

  it('an edit-added shell joins the existing shared LOD1 group', () => {
    const store = makeStore();
    const b = build(store);
    b.setTier(1, 0);
    const before = b.groups.length;
    const g0 = b.groups.find((g) => g.mesh.name.startsWith('@barrel:0'))!;
    const n = g0.members.length;
    // a new variant on a new island: LOD0 group is created, LOD1 joins barrel:0
    const i = store.push(PROP_DEF_INDEX.fakeShellB, 1, 300, 1, 0, 0, 1, 5, 0, grounded);
    const st = b.rewrite([i], 1);
    expect(st.appended).toBe(1);
    expect(st.created).toBe(1);
    expect(b.groups.length).toBe(before + 1);
    expect(g0.members.length).toBe(n + 1);
    const far = b.slotsOf(i)!.find((x) => x.g.lod === 1)!;
    expect(far.g).toBe(g0);
  });

  it('interiors: no LOD1 group, never clustered, shadows only with interiorShadows', () => {
    const lo = build(makeStore(), { cast: true });
    const inner = lo.groups.filter((g) => g.def.id === 'fakeInterior');
    expect(inner.length).toBeGreaterThan(0);
    expect(inner.every((g) => g.lod === 0)).toBe(true);
    expect(inner.some((g) => g.mesh.castShadow)).toBe(false);
    // shells still cast
    expect(lo.groups.find((g) => g.def.id === 'fakeShellA')!.mesh.castShadow).toBe(true);
    const hi = build(makeStore(), { cast: true, interior: true });
    expect(
      hi.groups.filter((g) => g.def.id === 'fakeInterior').every((g) => g.mesh.castShadow),
    ).toBe(true);
    // tier 2: the interiors bloom in with their LOD0 group
    lo.setTier(2, 0);
    expect(inner.every((g) => g.mesh.visible)).toBe(true);
  });

  it('content: defs sharing a LOD1 proxy agree on tier and flags', () => {
    const byKey = new Map<string, PropDef>();
    for (const def of PROP_DEFS) {
      if (!def.lod1 || def.id.startsWith('fake')) continue;
      const k = `${def.lod1.geo}:${def.lod1.variant}`;
      const first = byKey.get(k);
      if (!first) byKey.set(k, def);
      else {
        expect(def.tier, `${def.id} vs ${first.id}`).toBe(first.tier);
        expect(def.flags, `${def.id} vs ${first.id}`).toBe(first.flags);
      }
    }
  });
});
