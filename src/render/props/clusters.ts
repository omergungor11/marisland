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

// ---- blob colours (TASK-373, D-031): a blob takes the canopy colour of the trees it stands for

/** Canopy kinds = `ThemeTreePalette` keys (content/themes). */
export const CANOPY_KINDS = ['deciduous', 'pine', 'palm'] as const;
export type CanopyKind = (typeof CANOPY_KINDS)[number];
export type TreePalette = Readonly<Record<CanopyKind, readonly string[]>>;

/** Canopy kind of a clusterable def (unknown trees count as deciduous). */
export function canopyKindOf(defId: string): CanopyKind {
  return defId === 'pine' ? 'pine' : defId === 'palm' ? 'palm' : 'deciduous';
}

/**
 * Blob colour classes: a cell's kind mix (canopy-area fractions) snaps to a lattice of
 * 1 / BLOB_MIX_STEPS. Blobs of one class share one recoloured geometry and one draw call across
 * islands. Measured (seeds 1 / 1001): 5 steps → 9 / 8 classes, max ΔE76 3.4 vs the cell's canopy
 * (4 steps: 8 classes, ΔE 4.2; 6 steps: 11 classes). Kinds: deciduous ↔ pine ≈ ΔE 37,
 * deciduous ↔ palm ≈ 13, pine ↔ palm ≈ 46 (that pair does not share cells today).
 */
export const BLOB_MIX_STEPS = 5;

export type Rgb = [number, number, number];

/** Top-view canopy colour of a geometry: area · max(0, n_y) weighted mean of colour × ao (linear). */
export interface CanopyStats {
  /** Weighted area (u², top-projected). */
  area: number;
  rgb: Rgb;
}

/** Green vertices (g > r) are canopy; trunks and wood are not. */
export const isCanopy = (r: number, g: number): boolean => g > r;

/**
 * Canopy stats of a non-indexed (or indexed) triangle soup: `position` / `color` xyz triplets,
 * optional per-vertex `ao` multiplier. `canopyOnly` drops non-green vertices.
 */
export function canopyStats(
  position: ArrayLike<number>,
  color: ArrayLike<number>,
  ao: ArrayLike<number> | null,
  index: ArrayLike<number> | null = null,
  canopyOnly = true,
): CanopyStats {
  const n = index ? index.length : position.length / 3;
  let w = 0;
  let r = 0;
  let g = 0;
  let b = 0;
  for (let t = 0; t + 2 < n; t += 3) {
    const i0 = index ? index[t] : t;
    const i1 = index ? index[t + 1] : t + 1;
    const i2 = index ? index[t + 2] : t + 2;
    const ax = position[i1 * 3] - position[i0 * 3];
    const az = position[i1 * 3 + 2] - position[i0 * 3 + 2];
    const bx = position[i2 * 3] - position[i0 * 3];
    const bz = position[i2 * 3 + 2] - position[i0 * 3 + 2];
    // (b − a) × (c − a), y component / 2 = top-projected area (front faces only)
    const wy = (az * bx - ax * bz) / 2;
    if (!(wy > 0)) continue;
    for (const i of [i0, i1, i2]) {
      const cr = color[i * 3];
      const cg = color[i * 3 + 1];
      if (canopyOnly && !isCanopy(cr, cg)) continue;
      const k = (ao ? ao[i] : 1) * (wy / 3);
      r += cr * k;
      g += cg * k;
      b += color[i * 3 + 2] * k;
      w += wy / 3;
    }
  }
  return w > 0 ? { area: w, rgb: [r / w, g / w, b / w] } : { area: 0, rgb: [0, 0, 0] };
}

/** sRGB hex → linear rgb (three's ColorManagement conversion, without three). */
export function hexToLinear(hex: string): Rgb {
  const v = parseInt(hex.replace('#', ''), 16);
  const f = (c: number): number => {
    const s = c / 255;
    return s < 0.04045 ? s * 0.0773993808 : Math.pow(s * 0.9478672986 + 0.0521327014, 2.4);
  };
  return [f((v >> 16) & 255), f((v >> 8) & 255), f(v & 255)];
}

/** Per-channel ratio mean(palette ramp) / mean(reference ramp) (1 when the hexes agree). */
export function rampRatio(ramp: readonly string[], ref: readonly string[]): Rgb {
  const mean = (hexes: readonly string[]): Rgb => {
    const m: Rgb = [0, 0, 0];
    for (const h of hexes) {
      const c = hexToLinear(h);
      for (let k = 0; k < 3; k++) m[k] += c[k] / hexes.length;
    }
    return m;
  };
  const a = mean(ramp);
  const b = mean(ref);
  return [a[0] / b[0], a[1] / b[1], a[2] / b[2]];
}

/**
 * Lattice counts (sum = `steps`) nearest to the fractions `w` (largest remainder; ties to the
 * lower kind index, so the result is deterministic).
 */
export function mixLattice(w: readonly number[], steps = BLOB_MIX_STEPS): number[] {
  let sum = 0;
  for (const x of w) sum += x;
  if (!(sum > 0)) return w.map((_, k) => (k === 0 ? steps : 0));
  const exact = w.map((x) => (x / sum) * steps);
  const out = exact.map(Math.floor);
  let left = steps - out.reduce((a, x) => a + x, 0);
  const order = exact.map((x, k) => ({ k, rem: x - Math.floor(x) }));
  order.sort((a, b) => b.rem - a.rem || a.k - b.k);
  for (let j = 0; left > 0; j++, left--) out[order[j % order.length].k]++;
  return out;
}

/** CIE L*a*b* (D65) of a linear rgb colour. */
export function linearToLab(c: Rgb): Rgb {
  const f = (t: number): number => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);
  const X = (0.4124 * c[0] + 0.3576 * c[1] + 0.1805 * c[2]) / 0.95047;
  const Y = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  const Z = (0.0193 * c[0] + 0.1192 * c[1] + 0.9505 * c[2]) / 1.08883;
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}

/** CIE76 ΔE (≥ ΔE2000 for these greens, so a conservative check). */
export function deltaE(a: Rgb, b: Rgb): number {
  const p = linearToLab(a);
  const q = linearToLab(b);
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}
