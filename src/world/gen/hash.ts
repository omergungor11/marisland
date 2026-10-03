import { hashString, mix32 } from '../../core/hash.ts';
import type { IslandData } from '../types.ts';

/** Floats are quantised to this step before hashing (ARCHITECTURE §2). */
const Q = 1e4;

/** Two-lane FNV-style streaming hash → 16 hex chars. */
export class StageHash {
  private a = 0x811c9dc5;
  private b = 0x9e3779b9;
  private len = 0;

  u32(w: number): this {
    this.a = Math.imul(this.a ^ w, 0x01000193) >>> 0;
    const b = Math.imul(this.b ^ w, 0x85ebca6b);
    this.b = ((b << 13) | (b >>> 19)) >>> 0;
    this.len++;
    return this;
  }

  float(v: number): this {
    return this.u32(Math.round(v * Q) | 0);
  }

  str(s: string): this {
    return this.u32(hashString(s));
  }

  floats(arr: Float32Array): this {
    for (let i = 0; i < arr.length; i++) this.u32(Math.round(arr[i] * Q) | 0);
    return this;
  }

  bytes(arr: Uint8Array): this {
    let i = 0;
    for (; i + 3 < arr.length; i += 4) {
      this.u32(arr[i] | (arr[i + 1] << 8) | (arr[i + 2] << 16) | (arr[i + 3] << 24));
    }
    for (; i < arr.length; i++) this.u32(arr[i]);
    return this;
  }

  hex(): string {
    const a = mix32(this.a ^ this.len);
    const b = mix32(this.b ^ Math.imul(this.len, 0x27d4eb2d));
    return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
  }
}

export const hashFloats = (arr: Float32Array): string => new StageHash().floats(arr).hex();
export const hashBytes = (arr: Uint8Array): string => new StageHash().bytes(arr).hex();

/** Layout hash: wind + every layout-stage island field (not peaks/anchors). */
export function hashLayout(windDir: number, islands: IslandData[]): string {
  const h = new StageHash().float(windDir).u32(islands.length);
  for (const isl of islands) {
    h.u32(isl.id).str(isl.archetype).str(isl.name).float(isl.cx).float(isl.cz).float(isl.radius);
    h.float(isl.minX).float(isl.minZ).float(isl.maxX).float(isl.maxZ);
  }
  return h.hex();
}

/** Combine stage hashes in a fixed key order. */
export function combineHashes(hashes: Record<string, string>, keys: readonly string[]): string {
  const h = new StageHash();
  for (const k of keys) h.str(k).str(hashes[k]);
  return h.hex();
}
