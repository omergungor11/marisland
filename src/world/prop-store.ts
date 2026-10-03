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
} as const;

export interface PropStore {
  count: number;
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
    if (i >= capacity) throw new Error('PropStore capacity exceeded');
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

/** Trim a store to its count (for hashing / serialisation). */
export function compactPropStore(s: PropStore): PropStore {
  const n = s.count;
  return {
    count: n,
    defId: s.defId.slice(0, n),
    variant: s.variant.slice(0, n),
    x: s.x.slice(0, n),
    y: s.y.slice(0, n),
    z: s.z.slice(0, n),
    rotY: s.rotY.slice(0, n),
    scale: s.scale.slice(0, n),
    islandId: s.islandId.slice(0, n),
    chunkId: s.chunkId.slice(0, n),
    flags: s.flags.slice(0, n),
  };
}
