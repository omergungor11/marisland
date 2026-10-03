/**
 * Small, fast, deterministic integer hashes. Used for RNG forking by label,
 * per-instance phases and per-face jitter. All results are uint32.
 */

/** FNV-1a over a string, mixed into an existing uint32 state. */
export function hashString(str: string, h = 0x811c9dc5): number {
  h >>>= 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Final avalanche (murmur3 fmix32). */
export function mix32(h: number): number {
  h >>>= 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

/** Hash an integer tuple (e.g. seed, x, y) to uint32. */
export function hashInts(...parts: number[]): number {
  let h = 0x9e3779b9;
  for (let i = 0; i < parts.length; i++) {
    h = Math.imul(h ^ (parts[i] | 0), 0x01000193) >>> 0;
    h = mix32(h + 0x7f4a7c15);
  }
  return h >>> 0;
}

/** Hash a label plus integer parts; the backbone of `rng.fork(label)`. */
export function hashLabel(seed: number, label: string, ...parts: number[]): number {
  let h = hashString(label, (seed >>> 0) ^ 0x811c9dc5);
  for (let i = 0; i < parts.length; i++) {
    h = mix32(h ^ Math.imul(parts[i] | 0, 0x9e3779b1));
  }
  return mix32(h);
}

/** uint32 → [0, 1). */
export function hashToUnit(h: number): number {
  return (h >>> 0) / 4294967296;
}

/** Stable float in [0,1) for a (seed, id) pair — per-instance phases, jitter. */
export function unitHash(seed: number, id: number, salt = 0): number {
  return hashToUnit(hashInts(seed, id, salt));
}
