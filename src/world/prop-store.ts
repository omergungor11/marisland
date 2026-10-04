/**
 * PropStore — SoA list of placed props (ARCHITECTURE §2). Pure data; filled by
 * world/gen/props (TASK-122), consumed by render/props (PropBatcher) and Phase 2.
 */
export const PropFlag = {
  /** Sits on the seabed (sunken ship, tide pool rocks). */
  underwater: 1,
  /** Gets a contact-shadow blob. */
  grounded: 2,
  /** Vertex-shader wind applies. */
  windy: 4,
  /** Ground cover: batched per chunk, T3 only, dithers in. */
  groundCover: 8,
  /** Appears as a T0 cluster-proxy blob member (trees). */
  clusterable: 16,
  /**
   * Removed by an edit (Phase 2): the slot stays (ids are indices) but consumers must skip it.
   * Scatter props are only ever hidden this way; edit-added props may also be popped.
   */
  removed: 32,
} as const;

/** Alias used by the Phase 2 spec. */
export const PROP_FLAGS = PropFlag;

export interface PropStore {
  count: number;
  /**
   * Phase 2: index of the first edit-added slot (= scatter count at generation). Prop id ↔
   * index: scatter ids are indices (< editBase); edit-added id `EDIT_PROP_ID_BASE + k` lives at
   * `editBase + k`. Set by `generateWorld`; absent on render-side copies.
   */
  editBase?: number;
  /** Index into content/props PROP_DEFS. */
  defId: Uint16Array;
  variant: Uint8Array;
  x: Float32Array;
  y: Float32Array;
  z: Float32Array;
  rotY: Float32Array;
  scale: Float32Array;
  islandId: Uint8Array;
  chunkId: Uint16Array;
  flags: Uint8Array;
}

export function createPropStore(capacity: number): PropStore & { push: PushFn } {
  const s = {
    count: 0,
    defId: new Uint16Array(capacity),
    variant: new Uint8Array(capacity),
    x: new Float32Array(capacity),
    y: new Float32Array(capacity),
    z: new Float32Array(capacity),
    rotY: new Float32Array(capacity),
    scale: new Float32Array(capacity),
    islandId: new Uint8Array(capacity),
    chunkId: new Uint16Array(capacity),
    flags: new Uint8Array(capacity),
    push: (() => 0) as PushFn,
  };
  s.push = (defId, variant, x, y, z, rotY, scale, islandId, chunkId, flags) => {
    const i = s.count;
    if (i >= s.defId.length) throw new Error('PropStore capacity exceeded');
    s.defId[i] = defId;
    s.variant[i] = variant;
    s.x[i] = x;
    s.y[i] = y;
    s.z[i] = z;
    s.rotY[i] = rotY;
    s.scale[i] = scale;
    s.islandId[i] = islandId;
    s.chunkId[i] = chunkId;
    s.flags[i] = flags;
    s.count++;
    return i;
  };
  return s;
}

export type PushFn = (
  defId: number,
  variant: number,
  x: number,
  y: number,
  z: number,
  rotY: number,
  scale: number,
  islandId: number,
  chunkId: number,
  flags: number,
) => number;

/**
 * Trim a store to its count (for hashing / serialisation), optionally keeping `headroom` spare
 * zeroed slots (Phase 2 edits append there without reallocating).
 */
export function compactPropStore(s: PropStore, headroom = 0): PropStore {
  const n = s.count;
  const cap = n + Math.max(0, headroom);
  const cut = <T extends Uint8Array | Uint16Array | Float32Array>(
    a: T,
    make: (len: number) => T,
  ): T => {
    const out = make(cap);
    out.set(a.subarray(0, n) as never);
    return out;
  };
  return {
    count: n,
    defId: cut(s.defId, (l) => new Uint16Array(l)),
    variant: cut(s.variant, (l) => new Uint8Array(l)),
    x: cut(s.x, (l) => new Float32Array(l)),
    y: cut(s.y, (l) => new Float32Array(l)),
    z: cut(s.z, (l) => new Float32Array(l)),
    rotY: cut(s.rotY, (l) => new Float32Array(l)),
    scale: cut(s.scale, (l) => new Float32Array(l)),
    islandId: cut(s.islandId, (l) => new Uint8Array(l)),
    chunkId: cut(s.chunkId, (l) => new Uint16Array(l)),
    flags: cut(s.flags, (l) => new Uint8Array(l)),
  };
}

/** Allocated slots (count ≤ capacity). */
export const propCapacity = (s: PropStore): number => s.defId.length;

/**
 * Ensure room for `extra` more slots. Reallocates the typed arrays **on the same object**
 * (×1.5 growth, slots past `count` zeroed), so holders of the store see the new arrays on their
 * next read — but anyone who cached `store.x` etc. must re-read after a grow. Returns true when
 * the arrays were reallocated.
 */
export function growPropStore(s: PropStore, extra: number): boolean {
  const need = s.count + Math.max(0, extra);
  const cap = propCapacity(s);
  if (need <= cap) return false;
  const next = Math.max(need, Math.ceil(cap * 1.5), 64);
  const grow = <T extends Uint8Array | Uint16Array | Float32Array>(
    a: T,
    make: (len: number) => T,
  ): T => {
    const out = make(next);
    out.set(a as never);
    return out;
  };
  s.defId = grow(s.defId, (l) => new Uint16Array(l));
  s.variant = grow(s.variant, (l) => new Uint8Array(l));
  s.x = grow(s.x, (l) => new Float32Array(l));
  s.y = grow(s.y, (l) => new Float32Array(l));
  s.z = grow(s.z, (l) => new Float32Array(l));
  s.rotY = grow(s.rotY, (l) => new Float32Array(l));
  s.scale = grow(s.scale, (l) => new Float32Array(l));
  s.islandId = grow(s.islandId, (l) => new Uint8Array(l));
  s.chunkId = grow(s.chunkId, (l) => new Uint16Array(l));
  s.flags = grow(s.flags, (l) => new Uint8Array(l));
  return true;
}
