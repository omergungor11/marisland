import { describe, expect, it } from 'vitest';
import { createPropStore, PropFlag } from '../../world/prop-store.ts';
import { PROP_DEF_INDEX } from '../../content/props.ts';
import { createRng } from '../../core/rng.ts';
import * as THREE from 'three';
import { FOLIAGE } from '../../content/palette.ts';
import {
  BLOB_MIX_STEPS,
  ClusterIndex,
  canopyKindOf,
  canopyStats,
  clusterKey,
  CLUSTER_CELL,
  deltaE,
  hexToLinear,
  mixLattice,
  rampRatio,
} from './clusters.ts';

const TREE = PropFlag.grounded | PropFlag.clusterable;

function forest(n: number, seed: number) {
  const s = createPropStore(n + 400);
  const rng = createRng(seed).fork('forest');
  for (let i = 0; i < n; i++)
    s.push(
      PROP_DEF_INDEX.roundTree,
      0,
      rng.range(-40, 40),
      rng.range(0, 6),
      rng.range(-40, 40),
      0,
      1,
      i % 3,
      0,
      i % 5 === 0 ? PropFlag.grounded : TREE, // every 5th: not clusterable
    );
  return s;
}

/** Non-empty cells as comparable records (order-free). */
const live = (c: ClusterIndex) =>
  Array.from(c.cells.values())
    .filter((x) => x.n > 0)
    .map((x) => ({ key: x.key, n: x.n, m: [...x.members].sort((a, b) => a - b) }))
    .sort((a, b) => a.key - b.key);

describe('T0 cluster cells (TASK-213)', () => {
  it('groups live clusterable props per 8 u cell at their mean', () => {
    const s = forest(200, 1);
    const c = new ClusterIndex(s);
    let total = 0;
    for (const cell of c.cells.values()) {
      total += cell.n;
      let x = 0;
      for (const i of cell.members) {
        expect(clusterKey(s.x[i], s.z[i])).toBe(cell.key);
        expect(s.flags[i] & PropFlag.clusterable).not.toBe(0);
        x += s.x[i];
      }
      expect(cell.x).toBeCloseTo(x / cell.n, 9);
    }
    expect(total).toBe(160);
  });

  it('move / remove / restore / append re-derive exactly the touched cells', () => {
    const s = forest(200, 2);
    const c = new ClusterIndex(s);
    const rng = createRng(7).fork('ops');
    for (let step = 0; step < 300; step++) {
      const op = rng.int(0, 3);
      let i: number;
      if (op === 3) {
        i = s.push(
          PROP_DEF_INDEX.pine,
          0,
          rng.range(-40, 40),
          1,
          rng.range(-40, 40),
          0,
          1,
          1,
          0,
          TREE,
        );
      } else {
        i = rng.int(0, s.count - 1);
        if (op === 0) {
          s.x[i] = rng.range(-40, 40);
          s.z[i] = rng.range(-40, 40);
        } else if (op === 1) s.flags[i] |= PropFlag.removed;
        else s.flags[i] &= ~PropFlag.removed;
      }
      const touched = c.update(s, [i]);
      for (const cell of touched) expect(c.cells.get(cell.key)).toBe(cell);
    }
    // the incrementally maintained index equals a fresh one over the edited store
    expect(live(c)).toEqual(live(new ClusterIndex(s)));
  });

  it('a cell that lost its last tree stays (n = 0) and refills in place', () => {
    const s = createPropStore(8);
    const a = s.push(PROP_DEF_INDEX.pine, 0, 1, 0, 1, 0, 1, 0, 0, TREE);
    const c = new ClusterIndex(s);
    const key = clusterKey(1, 1);
    s.flags[a] |= PropFlag.removed;
    expect(c.update(s, [a]).map((x) => x.n)).toEqual([0]);
    expect(c.cells.get(key)!.n).toBe(0);
    const b = s.push(PROP_DEF_INDEX.pine, 0, 2, 4, CLUSTER_CELL - 1, 0, 1, 0, 0, TREE);
    const [cell] = c.update(s, [b]);
    expect(cell.key).toBe(key);
    expect(cell.n).toBe(1);
    expect(cell.y).toBe(4);
  });

  it('an unchanged prop keeps the member order (identical mean bits)', () => {
    const s = forest(120, 3);
    const c = new ClusterIndex(s);
    const before = Array.from(c.cells.values()).map((x) => [x.x, x.y, x.z, ...x.members]);
    for (let i = 0; i < s.count; i++) c.update(s, [i]);
    expect(Array.from(c.cells.values()).map((x) => [x.x, x.y, x.z, ...x.members])).toEqual(before);
  });
});

describe('blob colour helpers (TASK-373)', () => {
  it('mixLattice: counts sum to the steps, nearest lattice point, deterministic ties', () => {
    expect(mixLattice([1, 0, 0])).toEqual([BLOB_MIX_STEPS, 0, 0]);
    expect(mixLattice([0, 0, 0])).toEqual([BLOB_MIX_STEPS, 0, 0]);
    expect(mixLattice([3, 1, 0], 4)).toEqual([3, 1, 0]);
    expect(mixLattice([1, 1, 0], 5)).toEqual([3, 2, 0]); // tie → lower kind index
    for (const w of [
      [0.2, 0.5, 0.3],
      [5, 0.1, 0.01],
      [1, 2, 3],
    ])
      expect(mixLattice(w).reduce((a, x) => a + x, 0)).toBe(BLOB_MIX_STEPS);
  });

  it('hexToLinear matches three, rampRatio is 1 for equal ramps', () => {
    const c = new THREE.Color('#5DBB63');
    const l = hexToLinear('#5DBB63');
    expect(l[0]).toBeCloseTo(c.r, 6);
    expect(l[1]).toBeCloseTo(c.g, 6);
    expect(l[2]).toBeCloseTo(c.b, 6);
    expect(rampRatio(FOLIAGE.pine, FOLIAGE.pine)).toEqual([1, 1, 1]);
    expect(rampRatio(['#FFFFFF'], ['#808080'])[0]).toBeGreaterThan(1);
  });

  it('canopyStats: top-projected area, canopy-only colour, ao applied', () => {
    // two upward triangles (0.5 u² each): green with ao 0.5, brown trunk top
    const pos = [0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 1, 0, 0, 1, 1, 1, 1, 0];
    const green = [0.1, 0.8, 0.1];
    const brown = [0.6, 0.3, 0.1];
    const col = [...green, ...green, ...green, ...brown, ...brown, ...brown];
    const ao = [0.5, 0.5, 0.5, 1, 1, 1];
    const st = canopyStats(pos, col, ao);
    expect(st.area).toBeCloseTo(0.5, 6);
    expect(st.rgb[1]).toBeCloseTo(0.4, 6);
    expect(canopyStats(pos, col, null, null, false).area).toBeCloseTo(1, 6);
    // a downward face does not count
    expect(canopyStats([0, 0, 0, 1, 0, 0, 0, 0, 1], col, null).area).toBe(0);
    expect(deltaE([0.2, 0.5, 0.1], [0.2, 0.5, 0.1])).toBe(0);
  });

  it('canopyKindOf maps the clusterable trees', () => {
    expect(canopyKindOf('pine')).toBe('pine');
    expect(canopyKindOf('palm')).toBe('palm');
    expect(canopyKindOf('roundTree')).toBe('deciduous');
  });
});
