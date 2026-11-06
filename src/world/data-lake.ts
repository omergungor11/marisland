/**
 * Data Lake outline (TASK-544, D-121): pure, shared by the planner, the tests and TASK-547's
 * uniforms. A rotated ellipse with a 3-lobe wobble, read from the island's anchors:
 * - `dataLake` centre, rotY = long-axis heading, y = water level;
 * - `dataLakeSize` x = long semi axis, z = short semi axis;
 * - `dataLakeWobble` x = amplitude (share of the ellipse), z = phase (rad).
 */
import type { IslandData, XZ } from './types.ts';
import * as dm from '../core/math/dmath.ts';

export interface LakeOutline {
  x: number;
  z: number;
  rotY: number;
  /** Long and short semi axes (u). */
  a: number;
  b: number;
  wobble: number;
  phase: number;
}

export interface DataLake extends LakeOutline {
  /** Water level (world y): the flat ground inside the outline. */
  level: number;
}

/** Outline radius factor at ellipse angle `t`. */
const radiusAt = (l: LakeOutline, t: number): number => 1 + l.wobble * dm.cos(3 * t + l.phase);

/**
 * Signed distance estimate to the outline (u; < 0 inside): exact in sign, first order in size (good
 * near the outline at any bearing). GLSL: q = rotate(p - c, -rotY) / vec2(a, b); r = length(q);
 * e = r - (1. + w * cos(3. * atan(q.y, q.x) + phase));
 * d = e * r / max(length(q / vec2(a, b)), 1e-4).
 */
export function lakeEdge(l: LakeOutline, x: number, z: number): number {
  const dx = x - l.x;
  const dz = z - l.z;
  const c = dm.cos(l.rotY);
  const s = dm.sin(l.rotY);
  const u = (dx * c + dz * s) / l.a;
  const v = (-dx * s + dz * c) / l.b;
  const r = Math.hypot(u, v);
  const e = r - radiusAt(l, dm.atan2(v, u));
  return (e * r) / Math.max(Math.hypot(u / l.a, v / l.b), 1e-4);
}

/** Outline point at ellipse angle `t`, moved `out` u along the outward normal. */
export function lakePoint(l: LakeOutline, t: number, out = 0): XZ {
  const at = (q: number): XZ => {
    const r = radiusAt(l, q);
    const u = l.a * r * dm.cos(q);
    const v = l.b * r * dm.sin(q);
    const c = dm.cos(l.rotY);
    const s = dm.sin(l.rotY);
    return { x: l.x + u * c - v * s, z: l.z + u * s + v * c };
  };
  const p = at(t);
  const e = 1e-3;
  const p0 = at(t - e);
  const p1 = at(t + e);
  const tx = p1.x - p0.x;
  const tz = p1.z - p0.z;
  const n = Math.hypot(tx, tz);
  // t runs counter-clockwise in (x, z) as seen with +z = 90°: outward = tangent turned by -90°
  return { x: p.x + (tz / n) * out, z: p.z - (tx / n) * out };
}

/** The island's Data Lake from its anchors, or null (D-121: a seed may have none). */
export function dataLakeOf(isl: IslandData): DataLake | null {
  const c = isl.anchors.dataLake;
  const size = isl.anchors.dataLakeSize;
  const w = isl.anchors.dataLakeWobble;
  if (!c || !size || !w) return null;
  return {
    x: c.x,
    z: c.z,
    rotY: c.rotY,
    a: size.x,
    b: size.z,
    wobble: w.x,
    phase: w.z,
    level: c.y ?? 0,
  };
}
