/**
 * Animated-surface tagging (M14c TASK-384): writes the `aSpin` tag channel documented in
 * content/activity.ts on finished (non-indexed) geometry. Pure post-passes — positions, colours
 * and every other attribute stay untouched, so the static look of a tagged prop is unchanged.
 */
import * as THREE from 'three';
import { MOTION_TAG, SURFACE, type SurfaceKind } from '../../content/activity.ts';

export interface VertexRange {
  first: number;
  count: number;
}

/** The geometry's `aSpin` attribute, created (all zero) when absent. */
export function spinAttr(g: THREE.BufferGeometry): THREE.BufferAttribute {
  let a = g.getAttribute('aSpin') as THREE.BufferAttribute | undefined;
  if (!a) {
    const n = g.getAttribute('position').count;
    a = new THREE.BufferAttribute(new Float32Array(n * 4), 4);
    g.setAttribute('aSpin', a);
  }
  return a;
}

const all = (g: THREE.BufferGeometry): VertexRange => ({
  first: 0,
  count: g.getAttribute('position').count,
});

/** Integer hash → [0, 1) (patch seeds; deterministic, no rng needed). */
function hash01(i: number): number {
  let h = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

interface Patch {
  tris: number[];
  n: THREE.Vector3;
}

/**
 * Coplanar edge-connected patches of screen-class triangles (all three vertices `emissive ≥ 1.5`)
 * in `range`. Single triangles (icosahedron lamps, eyes) are dropped: a screen is at least a quad.
 */
export function screenPatches(g: THREE.BufferGeometry, range: VertexRange = all(g)): Patch[] {
  const pos = g.getAttribute('position');
  const emi = g.getAttribute('emissive') as THREE.BufferAttribute | undefined;
  if (!emi) return [];
  const t0 = Math.ceil(range.first / 3);
  const t1 = Math.floor((range.first + range.count) / 3);
  const tris: number[] = [];
  const normals: THREE.Vector3[] = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let t = t0; t < t1; t++) {
    const i = t * 3;
    if (emi.getX(i) < 1.5 || emi.getX(i + 1) < 1.5 || emi.getX(i + 2) < 1.5) continue;
    a.fromBufferAttribute(pos, i);
    b.fromBufferAttribute(pos, i + 1);
    c.fromBufferAttribute(pos, i + 2);
    const n = b.clone().sub(a).cross(c.clone().sub(a));
    if (n.lengthSq() < 1e-12) continue;
    tris.push(t);
    normals.push(n.normalize());
  }
  // union-find over shared vertex positions with the same normal
  const parent = tris.map((_, k) => k);
  const find = (k: number): number => {
    while (parent[k] !== k) k = parent[k] = parent[parent[k]];
    return k;
  };
  const key = (i: number): string =>
    `${Math.round(pos.getX(i) * 1e4)},${Math.round(pos.getY(i) * 1e4)},${Math.round(pos.getZ(i) * 1e4)}`;
  const seen = new Map<string, number[]>();
  tris.forEach((t, k) => {
    for (let v = 0; v < 3; v++) {
      const kk = key(t * 3 + v);
      const list = seen.get(kk);
      if (!list) {
        seen.set(kk, [k]);
        continue;
      }
      for (const o of list) if (normals[o].dot(normals[k]) > 0.999) parent[find(o)] = find(k);
      list.push(k);
    }
  });
  const groups = new Map<number, Patch>();
  tris.forEach((t, k) => {
    const r = find(k);
    let p = groups.get(r);
    if (!p) groups.set(r, (p = { tris: [], n: normals[k] }));
    p.tris.push(t);
  });
  return [...groups.values()].filter((p) => p.tris.length >= 2);
}

/** In-plane frame of a patch: u right / v up as seen from the front (along −n). */
function planeBasis(n: THREE.Vector3): { u: THREE.Vector3; v: THREE.Vector3 } {
  const up = Math.abs(n.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, -1);
  const u = up.clone().cross(n).normalize();
  const v = n.clone().cross(u).normalize();
  return { u, v };
}

interface Frame {
  o: THREE.Vector3;
  u: THREE.Vector3;
  v: THREE.Vector3;
  /** Extent along u / v (u). */
  w: number;
  h: number;
}

function patchFrame(g: THREE.BufferGeometry, p: Patch): Frame {
  const pos = g.getAttribute('position');
  const { u, v } = planeBasis(p.n);
  let u0 = Infinity;
  let u1 = -Infinity;
  let v0 = Infinity;
  let v1 = -Infinity;
  const q = new THREE.Vector3();
  for (const t of p.tris)
    for (let k = 0; k < 3; k++) {
      q.fromBufferAttribute(pos, t * 3 + k);
      const a = q.dot(u);
      const b = q.dot(v);
      u0 = Math.min(u0, a);
      u1 = Math.max(u1, a);
      v0 = Math.min(v0, b);
      v1 = Math.max(v1, b);
    }
  const o = u.clone().multiplyScalar(u0).add(v.clone().multiplyScalar(v0));
  // o is the in-plane origin; the normal offset does not matter for dot products along u / v
  return { o, u, v, w: Math.max(u1 - u0, 1e-4), h: Math.max(v1 - v0, 1e-4) };
}

function writeUv(g: THREE.BufferGeometry, tris: number[], f: Frame, z: number, kind: number): void {
  const pos = g.getAttribute('position');
  const s = spinAttr(g);
  const q = new THREE.Vector3();
  const ou = f.o.dot(f.u);
  const ov = f.o.dot(f.v);
  for (const t of tris)
    for (let k = 0; k < 3; k++) {
      const i = t * 3 + k;
      q.fromBufferAttribute(pos, i);
      s.setXYZW(i, (q.dot(f.u) - ou) / f.w, (q.dot(f.v) - ov) / f.h, z, -kind);
    }
  s.needsUpdate = true;
}

/**
 * Tag every screen patch in `range` with surface `kind` (uv over the patch). LED strips get
 * `cols + seed` in z (one dot column per ≈ 2 × the strip height). Returns the patch count.
 */
export function tagScreens(
  g: THREE.BufferGeometry,
  kind: SurfaceKind,
  range: VertexRange = all(g),
): number {
  const patches = screenPatches(g, range);
  patches.forEach((p, i) => {
    const f = patchFrame(g, p);
    const asp = f.w / f.h;
    const z =
      kind === 'led' ? Math.max(1, Math.round(asp * 1.6)) + 0.999 * hash01(i + range.first) : asp;
    writeUv(g, p.tris, f, z, SURFACE[kind]);
  });
  return patches.length;
}

/**
 * Billboard slideshow: the board patch (largest screen patch in `board`) gets the slides kind;
 * every screen-class triangle in `art` (glyph, copy bars, incl. extrusion sides) takes the board
 * uv with a negative aspect so it shows the brand slide only.
 */
export function tagSlides(g: THREE.BufferGeometry, board: VertexRange, art: VertexRange): void {
  const patches = screenPatches(g, board);
  if (!patches.length) return;
  const p = patches.reduce((m, x) => (x.tris.length > m.tris.length ? x : m));
  const f = patchFrame(g, p);
  writeUv(g, p.tris, f, f.w / f.h, SURFACE.slides);
  const emi = g.getAttribute('emissive');
  const tris: number[] = [];
  for (let t = Math.ceil(art.first / 3); t < Math.floor((art.first + art.count) / 3); t++)
    if (emi.getX(t * 3) >= 1.5) tris.push(t);
  writeUv(g, tris, f, -f.w / f.h, SURFACE.slides);
}

/** Tag a vertex range with a constant `aSpin` value (pipes: axis + pulse kind). */
export function tagRange(
  g: THREE.BufferGeometry,
  r: VertexRange,
  v: readonly [number, number, number, number],
): void {
  const s = spinAttr(g);
  for (let i = r.first; i < r.first + r.count; i++) s.setXYZW(i, v[0], v[1], v[2], v[3]);
  s.needsUpdate = true;
}

/** Pipe pulse tag: tube axis (object space, unit) + kind. */
export function tagPulse(g: THREE.BufferGeometry, r: VertexRange, axis: 'x' | 'z'): void {
  tagRange(g, r, axis === 'x' ? [1, 0, 0, -SURFACE.pulse] : [0, 0, 1, -SURFACE.pulse]);
}

/** Turbine head: spinning vertices → yaw + spin, the rest of the range → yaw. */
export function tagYawHead(g: THREE.BufferGeometry, r: VertexRange): void {
  const s = spinAttr(g);
  for (let i = r.first; i < r.first + r.count; i++)
    s.setW(i, s.getW(i) > 0.5 ? MOTION_TAG.yawSpin : MOTION_TAG.yaw);
  s.needsUpdate = true;
}

/**
 * Sun tracker: range rotates about the x axis through `pivot` (object space); `restTilt` (rad,
 * |·| < π/2) is the built tilt about x, encoded as `w = 4 + restTilt / π`.
 */
export function tagTracker(
  g: THREE.BufferGeometry,
  r: VertexRange,
  pivot: THREE.Vector3,
  restTilt: number,
): void {
  tagRange(g, r, [pivot.x, pivot.y, pivot.z, MOTION_TAG.tracker + restTilt / Math.PI]);
}
