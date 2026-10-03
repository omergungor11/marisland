import { hashString, mix32 } from '../../core/hash.ts';
import type { PropStore } from '../prop-store.ts';
import type { IslandData, Polyline, WorldData } from '../types.ts';

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

/** Polylines (kind, island, closed, quantised points). */
export function hashPolylines(lines: Polyline[], h = new StageHash()): string {
  h.u32(lines.length);
  for (const l of lines) {
    h.str(l.kind)
      .u32(l.islandId + 1)
      .u32(l.closed ? 1 : 0)
      .u32(l.points.length);
    for (const p of l.points) h.float(p.x).float(p.z);
    for (const s of l.stops ?? []) h.u32(s);
  }
  return h.hex();
}

/** Settlements stage: lots, landmarks, docks, moorings, fixtures, paths, graph, fences. */
export function hashSites(w: WorldData): string {
  const h = new StageHash();
  h.u32(w.settlements.length);
  for (const s of w.settlements) {
    h.u32(s.islandId)
      .str(s.kind)
      .float(s.hub.x)
      .float(s.hub.z)
      .u32(s.hub.node + 1);
    h.u32(s.lots.length).u32(s.landmarks.length).u32(s.docks.length);
  }
  for (const l of w.lots)
    h.str(l.defId).float(l.x).float(l.z).float(l.rotY).u32(l.node).u32(l.variant);
  for (const l of w.landmarks) h.str(l.kind).float(l.x).float(l.z).float(l.rotY);
  for (const d of w.docks)
    h.float(d.x)
      .float(d.z)
      .float(d.rotY)
      .u32(d.segments)
      .u32(d.node + 1);
  for (const m of w.moorings) h.str(m.defId).float(m.x).float(m.z).u32(m.dock);
  for (const f of w.fixtures) h.str(f.defId).float(f.x).float(f.z).float(f.rotY);
  h.floats(w.pathGraph.nodes);
  for (let i = 0; i < w.pathGraph.edges.length; i++) h.u32(w.pathGraph.edges[i]);
  for (const f of w.fields) h.u32(f.islandId).float(f.x).float(f.z).u32(f.color);
  hashPolylines(w.fences, h);
  return hashPolylines(w.paths, h);
}

/** Prop store: def ids, quantised transforms. */
export function hashProps(p: PropStore): string {
  const h = new StageHash().u32(p.count);
  for (let i = 0; i < p.count; i++)
    h.u32(p.defId[i])
      .u32(p.variant[i])
      .float(p.x[i])
      .float(p.y[i])
      .float(p.z[i])
      .float(p.rotY[i])
      .float(p.scale[i]);
  return h.hex();
}
