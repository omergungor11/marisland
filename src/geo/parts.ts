import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import type { Rng } from '../core/rng.ts';
import { Acc, col, mat, qEuler, type PartOpts } from './kit.ts';

export const TAU = Math.PI * 2;
export const V = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);
export const V2 = (x: number, y: number): THREE.Vector2 => new THREE.Vector2(x, y);

/** Small one-off tints that have no palette slot (ART_BIBLE §2 gives the hexes in prose). */
export const TINT = {
  pool: '#8EEBE0',
  bottle: '#BFE8C8',
  cork: '#C9A06B',
  glass: '#FFEFC4',
  cloth: '#FFF4E0',
  rope: '#D9C3A0',
  seaweed: '#3E9A6A',
  basalt: '#4F4A5E',
  iron: '#6F7685',
  gold: '#F5C84C',
} as const;

/** Chamfered box (convex hull of the 24 corner-cut points): 44 tris. Centred. */
export function bevBox(w: number, h: number, d: number, b: number): THREE.BufferGeometry {
  const pts: THREE.Vector3[] = [];
  for (const sx of [-1, 1])
    for (const sy of [-1, 1])
      for (const sz of [-1, 1]) {
        const c = V((sx * w) / 2, (sy * h) / 2, (sz * d) / 2);
        pts.push(c.clone().add(V(-sx * b, 0, 0)), c.clone().add(V(0, -sy * b, 0)));
        pts.push(c.clone().add(V(0, 0, -sz * b)));
      }
  return new ConvexGeometry(pts);
}

/** Box that sits on y = 0 (base at origin). */
export function baseBox(w: number, h: number, d: number): THREE.BufferGeometry {
  return new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0);
}

/** Cylinder / frustum with its base at y = 0. */
export function cylB(rb: number, rt: number, h: number, seg: number, open = false) {
  return new THREE.CylinderGeometry(rt, rb, h, seg, 1, open).translate(0, h / 2, 0);
}

/** Polygon profile (x,y) extruded along z, centred on z. */
export function prism(profile: THREE.Vector2[], length: number): THREE.BufferGeometry {
  const g = new THREE.ExtrudeGeometry(new THREE.Shape(profile), {
    depth: length,
    bevelEnabled: false,
    steps: 1,
  });
  return g.translate(0, 0, -length / 2);
}

/** Gable roof slab, eave at y = 0, ridge along z. Half-width includes overhang. */
export function gableRoof(
  halfW: number,
  rise: number,
  length: number,
  thick = 0.16,
): THREE.BufferGeometry {
  return prism(
    [V2(-halfW, -thick), V2(halfW, -thick), V2(halfW, 0.04), V2(0, rise), V2(-halfW, 0.04)],
    length,
  );
}

/** Revolve [r, y] pairs about y. */
export function lathe(pts: ReadonlyArray<readonly [number, number]>, seg: number) {
  return new THREE.LatheGeometry(
    pts.map(([r, y]) => V2(r, y)),
    seg,
  );
}

export function quadXY(w: number, h: number): THREE.PlaneGeometry {
  return new THREE.PlaneGeometry(w, h);
}

/** Sagging rope between a and b (catenary-ish parabola). */
export function ropePoints(a: THREE.Vector3, b: THREE.Vector3, sag: number, n: number) {
  const out: THREE.Vector3[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p = a.clone().lerp(b, t);
    p.y -= sag * 4 * t * (1 - t);
    out.push(p);
  }
  return out;
}

/** Thin 3-sided tube along a polyline. */
export function tubeAlong(pts: THREE.Vector3[], r: number, radial = 3): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  return new THREE.TubeGeometry(curve, pts.length - 1, r, radial, false);
}

export interface PutOpts extends Partial<PartOpts> {
  q?: THREE.Quaternion;
  s?: number | [number, number, number];
}

/** Add `geo` at `pos` (rigid by default: windMul 0). */
export function put(
  acc: Acc,
  geo: THREE.BufferGeometry,
  pos: THREE.Vector3 | [number, number, number],
  color: THREE.Color | string | PartOpts['color'],
  o: PutOpts = {},
): void {
  const { q, s, ...rest } = o;
  const c = typeof color === 'string' ? col(color) : color;
  acc.add(geo, { windMul: 0, ...rest, color: c, m: mat(pos, q ?? null, s ?? 1) });
}

/** Compose a group transform with a local one. */
export const compose = (outer: THREE.Matrix4, inner: THREE.Matrix4): THREE.Matrix4 =>
  outer.clone().multiply(inner);

export interface WindowSpec {
  /** Centre on the wall surface. */
  at: THREE.Vector3;
  /** Yaw of the wall normal (0 = +z). */
  yaw: number;
  w?: number;
  h?: number;
  frame: THREE.Color | string;
  glow: THREE.Color | string;
  /** Pane glow mask. */
  emissive?: number;
  sill?: boolean;
  /** Tilt of the wall (rad): top leans toward the building axis. */
  lean?: number;
}

/** Inset window: frame box + emissive pane (+ sill). 14-26 tris. */
export function windowAt(acc: Acc, o: WindowSpec): void {
  const w = o.w ?? 0.6;
  const h = o.h ?? 0.7;
  const q = qEuler(0, o.yaw, 0).multiply(qEuler(-(o.lean ?? 0), 0, 0));
  const place = (g: THREE.BufferGeometry, off: THREE.Vector3): THREE.Matrix4 => {
    void g;
    return mat(o.at.clone().add(off.applyQuaternion(q)), q);
  };
  const frame = new THREE.BoxGeometry(w + 0.14, h + 0.14, 0.08);
  acc.add(frame, {
    m: place(frame, V(0, 0, 0)),
    color: typeof o.frame === 'string' ? col(o.frame) : o.frame,
    windMul: 0,
    aoAmt: 0,
  });
  const pane = new THREE.PlaneGeometry(w, h);
  acc.add(pane, {
    m: place(pane, V(0, 0, 0.045)),
    color: typeof o.glow === 'string' ? col(o.glow) : o.glow,
    windMul: 0,
    ao: () => 1,
    emissive: o.emissive ?? 1,
  });
  if (o.sill) {
    const s = new THREE.BoxGeometry(w + 0.3, 0.1, 0.2);
    acc.add(s, {
      m: place(s, V(0, -(h / 2 + 0.15), 0.06)),
      color: typeof o.frame === 'string' ? col(o.frame) : o.frame,
      windMul: 0,
      aoAmt: 0,
    });
  }
}

/** Door slab with frame, centred on the wall surface at ground level `y0`. */
export function doorAt(
  acc: Acc,
  at: THREE.Vector3,
  yaw: number,
  door: string,
  frame: string,
  w = 0.9,
  h = 1.6,
  lean = 0,
): void {
  const q = qEuler(0, yaw, 0).multiply(qEuler(-lean, 0, 0));
  const f = new THREE.BoxGeometry(w + 0.22, h + 0.14, 0.1).translate(0, (h + 0.14) / 2, 0);
  acc.add(f, {
    m: mat(at.clone(), q),
    color: col(frame),
    windMul: 0,
    aoAmt: 0,
  });
  const d = new THREE.BoxGeometry(w, h, 0.08).translate(0, h / 2, 0.04);
  acc.add(d, {
    m: mat(at.clone().add(V(0, 0, 0).applyQuaternion(q)), q),
    color: col(door),
    windMul: 0,
    aoAmt: 0.05,
  });
}

/** Deterministic noise-free per-index pick helper. */
export const cycle = <T>(arr: readonly T[], i: number): T =>
  arr[((i % arr.length) + arr.length) % arr.length];

/** Acc whose parts are scaled a few percent per axis by the seed (about the ground pivot). */
export function jitterAcc(rng: Rng, amt = 0.03): Acc {
  const acc = new Acc();
  const r = rng.fork('jit');
  acc.xf = mat([0, 0, 0], null, [
    1 + r.range(-amt, amt),
    1 + r.range(-amt, amt),
    1 + r.range(-amt, amt),
  ]);
  return acc;
}
