import { PropFlag, type PropStore } from '../../world/prop-store.ts';

/**
 * T0 tree-cluster cells (PropBatcher, D-004): at the map tier clusterable trees are replaced by
 * one proxy blob per `CLUSTER_CELL` u cell holding ≥ 1 live tree, at the trees' mean position.
 * Pure bookkeeping (no three) so the batcher can re-derive only the cells an edit touched
 * (TASK-213): `update(store, indices)` moves the touched store indices between cells and returns
 * the cells whose members changed. A cell that lost its last tree stays in the index with
 * `n = 0` (its render slot is kept and hidden), so slots never move.
 */
export const CLUSTER_CELL = 8;

export interface ClusterCell {
  key: number;
  /** Island of the cell's first tree (blob group bucket). */
  island: number;
  /** Store indices in the cell, in insertion order (build: store order). */
  members: number[];
  /** Mean position of the members (the last one while empty). */
  x: number;
  y: number;
  z: number;
  n: number;
}

const OFF = 32768;

/** Cell key of world xz. */
export function clusterKey(x: number, z: number): number {
  const cx = Math.floor(x / CLUSTER_CELL);
  const cz = Math.floor(z / CLUSTER_CELL);
  return (cx + OFF) * 65536 + (cz + OFF);
}

const live = (s: PropStore, i: number): boolean =>
  i < s.count && (s.flags[i] & PropFlag.clusterable) !== 0 && (s.flags[i] & PropFlag.removed) === 0;

export class ClusterIndex {
  /** Cells in creation order (build: first tree's store order — the batcher's group order). */
  readonly cells = new Map<number, ClusterCell>();
  private readonly cellOf = new Map<number, number>();

  constructor(store: PropStore) {
    for (let i = 0; i < store.count; i++) {
      if (!live(store, i)) continue;
      this.insert(store, i);
    }
    for (const c of this.cells.values()) this.mean(store, c);
  }

  /** Cell of store index `i` (undefined when it is not clustered). */
  keyOf(i: number): number | undefined {
    return this.cellOf.get(i);
  }

  /**
   * Re-derive the cells of the touched store indices (moved, removed, restored, appended);
   * returns the cells whose member set or mean changed, in first-touch order.
   */
  update(store: PropStore, indices: readonly number[]): ClusterCell[] {
    const changed = new Set<ClusterCell>();
    for (const i of indices) {
      const old = this.cellOf.get(i);
      const isLive = live(store, i);
      if (old !== undefined && isLive && old === clusterKey(store.x[i], store.z[i])) {
        // same cell: keep the member order (an unchanged prop re-derives the identical mean)
        changed.add(this.cells.get(old)!);
        continue;
      }
      if (old !== undefined) {
        const c = this.cells.get(old)!;
        const k = c.members.indexOf(i);
        if (k >= 0) c.members.splice(k, 1);
        this.cellOf.delete(i);
        changed.add(c);
      }
      if (isLive) changed.add(this.insert(store, i));
    }
    for (const c of changed) this.mean(store, c);
    return Array.from(changed);
  }

  private insert(store: PropStore, i: number): ClusterCell {
    const key = clusterKey(store.x[i], store.z[i]);
    let c = this.cells.get(key);
    if (!c) {
      c = { key, island: store.islandId[i], members: [], x: 0, y: 0, z: 0, n: 0 };
      this.cells.set(key, c);
    }
    c.members.push(i);
    this.cellOf.set(i, key);
    return c;
  }

  /** Mean over the members, accumulated in member order (bit-identical to the build). */
  private mean(store: PropStore, c: ClusterCell): void {
    let x = 0;
    let y = 0;
    let z = 0;
    for (const i of c.members) {
      x += store.x[i];
      z += store.z[i];
      y += store.y[i];
    }
    const n = c.members.length;
    c.n = n;
    if (!n) return; // empty: keep the last mean (the hidden blob stays in place)
    c.x = x / n;
    c.y = y / n;
    c.z = z / n;
  }
}

/** Blob scale for a cell of `n` trees. */
export const clusterScale = (n: number): number => Math.min(2.4, 0.9 + 0.3 * Math.sqrt(n));
