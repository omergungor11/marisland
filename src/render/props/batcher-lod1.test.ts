import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ALL_ISLANDS, createPropBatcher, isLargeStructure, STRUCTURE_MIN_SIZE } from './batcher.ts';
import { createPropStore, PropFlag } from '../../world/prop-store.ts';
import { PROP_DEFS, PROP_DEF_INDEX, TIER_FADE, type PropDef } from '../../content/props.ts';
import { Scope } from '../../core/scope.ts';
import { PROP_GEO, buildProp } from '../../geo/index.ts';
import { withFakeDefs } from './fake-defs.test-util.ts';

/**
 * TASK-373 (D-031 / D-032): every def draws its own LOD1 (the shared `def.lod1` proxy is unused),
 * LOD1 variants collapse when their geometry is identical, large structures show from T0.
 * TASK-304: interiors. Fake defs over existing geometry (+ one fake variant-blind geometry).
 */
const { grounded, clusterable } = PropFlag;
const FAKES: PropDef[] = [
  // a "shell" that still names the retired shared proxy: must be ignored
  {
    id: 'fakeShellA',
    geo: 'cottage',
    tier: 1,
    variants: 2,
    footprint: 2,
    flags: grounded,
    lod1: { geo: 'barrel', variant: 0 },
  },
  // a variant-blind geometry: one LOD1 group for both variants
  { id: 'fakeBlock', geo: 'fakeBlock', tier: 1, variants: 2, footprint: 2, flags: grounded },
  // small: stays tier 1
  { id: 'fakeSmall', geo: 'barrel', tier: 1, variants: 2, footprint: 0.5, flags: grounded },
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

/** 4 × 4 × 4 u coloured box, the same for every variant. */
function fakeBlock(): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(4, 4, 4).toNonIndexed();
  g.translate(0, 2, 0);
  const n = g.getAttribute('position').count;
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(0.5), 3));
  return g;
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

function makeStore() {
  const s = createPropStore(200);
  // 3 defs × 2 variants × 3 islands, 2 instances each
  for (const id of ['fakeShellA', 'fakeBlock', 'fakeSmall'])
    for (let v = 0; v < 2; v++)
      for (let isl = 0; isl < 3; isl++)
        for (let k = 0; k < 2; k++)
          s.push(PROP_DEF_INDEX[id], v, isl * 40 + k * 8, 1, v * 8, 0, 1, isl, 0, grounded);
  for (let isl = 0; isl < 3; isl++)
    s.push(PROP_DEF_INDEX.fakeInterior, isl % 2, isl * 40, 1, 0, 0, 1, isl, 0, grounded);
  return s;
}

const build = (
  store = makeStore(),
  opts: { cast?: boolean; interior?: boolean; fromT0?: boolean } = {},
  c = counters(),
) =>
  createPropBatcher(store, {
    scope: new Scope('t'),
    seed: 1,
    counters: c,
    materialFor: () => new THREE.MeshLambertMaterial(),
    softAppear: true,
    castShadows: opts.cast ?? false,
    interiorShadows: opts.interior,
    structuresFromT0: opts.fromT0 ?? true,
  });

describe('PropBatcher: own LOD1, T0 structures, interiors (TASK-373 / TASK-304)', () => {
  const restore = { fn: (): void => {} };
  beforeAll(() => {
    const undo = withFakeDefs(FAKES);
    (PROP_GEO as Record<string, (typeof PROP_GEO)[string]>).fakeBlock = {
      ...PROP_GEO.barrel,
      id: 'fakeBlock',
      build: fakeBlock,
    };
    restore.fn = () => {
      undo();
      delete (PROP_GEO as Record<string, unknown>).fakeBlock;
    };
  });
  afterAll(() => restore.fn());

  it('shells draw their own LOD1 (no shared proxy), variant groups collapse when identical', () => {
    const b = build();
    const lod1 = (id: string) => b.groups.filter((g) => g.lod === 1 && g.def.id === id);
    expect(b.groups.some((g) => g.mesh.name.startsWith('@'))).toBe(false);
    // cottage LOD1 differs per variant (roof colours) → 2 groups, own geometry
    const shell = lod1('fakeShellA');
    expect(shell).toHaveLength(2);
    const own = buildProp('cottage', 1, 0, 1).getAttribute('position').count;
    expect(shell.find((g) => g.variant === 0)!.mesh.geometry.getAttribute('position').count).toBe(
      own,
    );
    // the variant-blind block: one LOD1 group (variant 0) holding both variants
    const block = lod1('fakeBlock');
    expect(block).toHaveLength(1);
    expect(block[0].variant).toBe(0);
    expect(block[0].members.length).toBe(12);
    expect(block[0].bucket).toBe(ALL_ISLANDS);
    // small props keep a group per variant (no collapse check for them)
    expect(lod1('fakeSmall')).toHaveLength(2);
    // LOD0 stays per (def, variant, island)
    expect(b.groups.filter((g) => g.lod === 0 && g.def.id === 'fakeBlock')).toHaveLength(6);
  });

  it('large structures show from T0 (tier-0 fade), small ones and the flag-off path do not', () => {
    const c = counters();
    const b = build(makeStore(), {}, c);
    b.setTier(0, 0);
    b.update(0, 0, 0);
    const vis = (id: string) => b.groups.filter((g) => g.def.id === id && g.mesh.visible);
    expect(vis('fakeShellA').every((g) => g.lod === 1)).toBe(true);
    expect(vis('fakeShellA')).toHaveLength(2);
    expect(vis('fakeBlock')).toHaveLength(1);
    expect(vis('fakeSmall')).toHaveLength(0);
    // the group def is an effective tier-0 copy (its material fades like tier 0)
    const shell = b.groups.find((g) => g.def.id === 'fakeShellA')!;
    expect(shell.def.tier).toBe(0);
    expect(TIER_FADE[shell.def.tier][1]).toBeGreaterThan(600);
    // T0 → T1 → T2 → T1: no hard pops
    b.setTier(1, 1);
    b.update(1, 0, 0);
    b.setTier(2, 2);
    b.update(2, 0, 0);
    b.setTier(1, 3);
    b.update(3, 0, 0);
    expect(c.hardPops).toBe(0);
    const off = build(makeStore(), { fromT0: false });
    off.setTier(0, 0);
    expect(off.groups.some((g) => g.def.id === 'fakeShellA' && g.mesh.visible)).toBe(false);
  });

  it('an edit-added variant joins the collapsed LOD1 group', () => {
    const store = makeStore();
    const b = build(store);
    b.setTier(1, 0);
    const before = b.groups.length;
    const g0 = b.groups.find((g) => g.lod === 1 && g.def.id === 'fakeBlock')!;
    const n = g0.members.length;
    // variant 1 on a new island: LOD0 group is created, LOD1 joins the collapsed group
    const i = store.push(PROP_DEF_INDEX.fakeBlock, 1, 300, 1, 0, 0, 1, 5, 0, grounded);
    const st = b.rewrite([i], 1);
    expect(st.appended).toBe(1);
    expect(st.created).toBe(1);
    expect(b.groups.length).toBe(before + 1);
    expect(g0.members.length).toBe(n + 1);
    const far = b.slotsOf(i)!.find((x) => x.g.lod === 1)!;
    expect(far.g).toBe(g0);
    const near = b.slotsOf(i)!.find((x) => x.g.lod === 0)!;
    expect(near.g.def.tier).toBe(0);
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
});

describe('every structure ≥ 3 u is drawn at 600 u (D-031)', () => {
  it('one instance of every def: at T0 each large structure has a visible group with no fade', () => {
    const s = createPropStore(PROP_DEFS.length + 8);
    PROP_DEFS.forEach((def, di) => {
      if (!PROP_GEO[def.geo] || def.id === 'treeBlob') return;
      s.push(di, 0, di * 20, 1, 0, 0, 1, 0, 0, def.flags);
    });
    const b = build(s);
    b.setTier(0, 0);
    const large: string[] = [];
    for (const def of PROP_DEFS) {
      if (!PROP_GEO[def.geo] || def.id === 'treeBlob') continue;
      const g = buildProp(def.geo, 1, 0, 0);
      g.computeBoundingBox();
      const size = g.boundingBox!.getSize(new THREE.Vector3());
      if (!isLargeStructure(def, size)) continue;
      large.push(def.id);
      const shown = b.groups.filter((x) => x.def.id === def.id && x.mesh.visible);
      expect(shown.length, def.id).toBeGreaterThan(0);
      // drawn at 600 u: the dither fade of its tier reaches past it
      const [, far] = shown[0].def.fade ?? TIER_FADE[shown[0].def.tier];
      expect(far, def.id).toBeGreaterThan(600);
    }
    // the sweep covers buildings, landmarks and office shells
    expect(large).toEqual(
      expect.arrayContaining(['cottage', 'windmill', 'lighthouse', 'hqOffice']),
    );
    expect(STRUCTURE_MIN_SIZE).toBe(3);
  });
});
