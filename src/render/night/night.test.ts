import { describe, expect, it } from 'vitest';
import {
  collectPoolSources,
  poolFalloff,
  poolLayout,
  PoolSources,
  splatPools,
  splatPoolsRect,
} from './lantern-pools.ts';
import { createPropStore, PropFlag } from '../../world/prop-store.ts';
import { PROP_DEF_INDEX } from '../../content/props.ts';
import { buildBeamGeometry } from './beam.ts';
import { BEAM, POOLS } from '../../content/lighting.ts';
import { POOL_HEIGHT_RANGE } from '../shaders/chunks/night.glsl.ts';

describe('lantern pools (TASK-171)', () => {
  it('returns null without sources', () => {
    expect(splatPools([])).toBeNull();
  });

  it('splats a soft pool: bright core, zero outside the rim, height in G', () => {
    const s = splatPools([{ x: 10, z: -4, y: 6.4, r: 4, k: 1 }]);
    expect(s).not.toBeNull();
    if (!s) return;
    const at = (x: number, z: number): [number, number] => {
      const i = Math.floor(((x - s.originX) / s.extent) * s.size);
      const j = Math.floor(((z - s.originZ) / s.extent) * s.size);
      const k = (j * s.size + i) * 2;
      return [s.data[k], s.data[k + 1]];
    };
    const [core, h] = at(10, -4);
    // D14: lower peak than a full-bright disc (the lamp stays brighter than its pool)
    expect(core).toBeGreaterThan(90);
    expect(core).toBeLessThan(235);
    expect((h / 255) * POOL_HEIGHT_RANGE).toBeCloseTo(6.4, 0);
    // small core, long soft tail, nothing beyond the wobbly rim (r × (1 + wobble))
    expect(at(12, -4)[0]).toBeLessThan(core * 0.5);
    expect(at(13, -4)[0]).toBeGreaterThan(0);
    expect(at(10 + 4 * (1 + POOLS.wobble + 0.03), -4)[0]).toBe(0);
  });

  it('falloff: peak < 1, quadratic tail, 0 at the rim (D14)', () => {
    expect(poolFalloff(0)).toBeCloseTo(POOLS.falloff.peak);
    expect(poolFalloff(0)).toBeLessThan(1);
    expect(poolFalloff(1)).toBe(0);
    let prev = poolFalloff(0);
    for (let t = 0.05; t < 1; t += 0.05) {
      const v = poolFalloff(t);
      expect(v).toBeLessThan(prev);
      prev = v;
    }
    // inverse-square-like: at 2× the core radius ≈ 1/5 of the peak
    expect(poolFalloff(2 * POOLS.falloff.core) / poolFalloff(0)).toBeLessThan(0.25);
  });

  it('is deterministic', () => {
    const src = [
      { x: 0, z: 0, y: 1, r: 3, k: 0.5 },
      { x: 2, z: 1, y: 1, r: 4, k: 1 },
    ];
    const a = splatPools(src);
    const b = splatPools(src);
    expect(a?.data).toEqual(b?.data);
  });
});

describe('lantern pools follow edits (TASK-213)', () => {
  const lamps = () => {
    const s = createPropStore(32);
    const L = PROP_DEF_INDEX.lanternPost;
    s.push(L, 0, 0, 1, 0, 0, 1, 0, 0, 0);
    s.push(L, 0, 30, 2, 10, 0, 1, 0, 0, 0);
    s.push(L, 0, 12, 1.5, 28, 0, 1, 0, 0, 0);
    s.push(PROP_DEF_INDEX.pine, 0, 6, 1, 6, 0, 1, 0, 0, 0); // no pool
    return s;
  };

  it('skips removed props', () => {
    const s = lamps();
    expect(collectPoolSources(s)).toHaveLength(3);
    s.flags[1] |= PropFlag.removed;
    expect(collectPoolSources(s)).toHaveLength(2);
  });

  it('a local re-splat equals a fresh splat over the same layout (move, remove, add)', () => {
    const s = lamps();
    const book = new PoolSources(s);
    const full = splatPools(book.list())!;
    const layout = poolLayout(book.list())!;
    const data = full.data.slice();
    const step = (indices: number[]): void => {
      const t = book.touch(indices, layout);
      expect(t.changed).toBe(true);
      expect(t.outside).toBe(false);
      splatPoolsRect(book.list(), layout, t.rect!, data);
      const want = new Uint8Array(layout.size * layout.size * 2);
      splatPoolsRect(book.list(), layout, { x: 0, y: 0, w: layout.size, h: layout.size }, want);
      expect(data).toEqual(want);
    };
    s.x[0] = 4; // move inside the layout
    step([0]);
    s.flags[1] |= PropFlag.removed; // remove
    step([1]);
    s.push(PROP_DEF_INDEX.lanternPost, 0, 20, 1, 20, 0, 1, 0, 0, 0); // add
    step([s.count - 1]);
    // an unrelated / unchanged index is a no-op
    expect(book.touch([3], layout).changed).toBe(false);
  });

  it('a pool outside the layout asks for a rebuild', () => {
    const s = lamps();
    const book = new PoolSources(s);
    const layout = poolLayout(book.list())!;
    s.push(PROP_DEF_INDEX.lanternPost, 0, 400, 1, 400, 0, 1, 0, 0, 0);
    const t = book.touch([s.count - 1], layout);
    expect(t.changed).toBe(true);
    expect(t.outside).toBe(true);
    const grown = poolLayout(book.list())!;
    expect(grown.originX + grown.extent).toBeGreaterThan(400);
  });
});

describe('lighthouse beam geometry (TASK-171)', () => {
  it('builds front + back cones and a flare quad with bounded size', () => {
    const g = buildBeamGeometry();
    const kinds = g.getAttribute('aBeam');
    let front = 0;
    let back = 0;
    let flare = 0;
    for (let i = 0; i < kinds.count; i++) {
      const k = kinds.getY(i);
      if (k === 0) front++;
      else if (k === 1) back++;
      else flare++;
    }
    expect(front).toBe(back);
    expect(flare).toBe(4);
    const pos = g.getAttribute('position');
    let maxX = 0;
    for (let i = 0; i < pos.count; i++) maxX = Math.max(maxX, Math.abs(pos.getX(i)));
    expect(maxX).toBeCloseTo(BEAM.length, 3);
    expect(g.boundingSphere?.radius).toBeGreaterThanOrEqual(BEAM.length);
    g.dispose();
  });
});
