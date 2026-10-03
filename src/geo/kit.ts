import * as THREE from 'three';
import type { Rng } from '../core/rng.ts';
import { createNoise, type Noise } from '../core/noise.ts';

THREE.ColorManagement.enabled = true;

/** Colour of a face given its world-space centroid (linear RGB out). */
export type ColorFn = (p: THREE.Vector3) => THREE.Color;

export interface PartOpts {
  color: THREE.Color | ColorFn;
  /** Sway weight multiplier (1 = canopy/fronds, ~0.8 = trunk). */
  windMul?: number;
  /** Bottom-of-part darkening (0.15 -> ao 0.85 at the part's base). */
  aoAmt?: number;
  /** Fully custom ao in [0.75, 1]; overrides aoAmt. */
  ao?: (p: THREE.Vector3) => number;
  /** Drop triangles whose centroid lies below this y (hidden undersides). */
  cullY?: number;
  /** Clamp every vertex to y >= 0 after culling (flat ground contact). */
  groundClamp?: boolean;
}

const MIN_L = 0.13;
const AO_MIN = 0.75;

export const col = (hex: string): THREE.Color => new THREE.Color(hex);

/** Even-spaced multi-stop gradient on world y. */
export function gradY(hexes: readonly string[], y0: number, y1: number): ColorFn {
  const cs = hexes.map(col);
  if (cs.length === 1) return () => cs[0].clone();
  return (p) => {
    const t = Math.min(1, Math.max(0, (p.y - y0) / (y1 - y0))) * (cs.length - 1);
    const i = Math.min(Math.floor(t), cs.length - 2);
    return cs[i].clone().lerp(cs[i + 1], t - i);
  };
}

export function mat(
  pos: THREE.Vector3 | [number, number, number],
  quat: THREE.Quaternion | null = null,
  scale: number | [number, number, number] = 1,
): THREE.Matrix4 {
  const p = Array.isArray(pos) ? new THREE.Vector3(...pos) : pos;
  const s =
    typeof scale === 'number'
      ? new THREE.Vector3(scale, scale, scale)
      : new THREE.Vector3(...scale);
  return new THREE.Matrix4().compose(p, quat ?? new THREE.Quaternion(), s);
}

export function qEuler(x: number, y: number, z: number): THREE.Quaternion {
  return new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z));
}

export function qFromTo(a: THREE.Vector3, b: THREE.Vector3): THREE.Quaternion {
  return new THREE.Quaternion().setFromUnitVectors(a.clone().normalize(), b.clone().normalize());
}

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Accumulates triangles from many parts, then bakes colour/wind/ao into one geometry. */
export class Acc {
  private pos: number[] = [];
  private colr: number[] = [];
  private wmul: number[] = [];
  private ao: number[] = [];

  add(geo: THREE.BufferGeometry, o: PartOpts & { m?: THREE.Matrix4 }): void {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const src = g.getAttribute('position');
    const n = src.count;
    const v: THREE.Vector3[] = [];
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < n; i++) {
      const p = new THREE.Vector3().fromBufferAttribute(src, i);
      if (o.m) p.applyMatrix4(o.m);
      v.push(p);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
    const aoAmt = o.aoAmt ?? 0.15;
    const wm = o.windMul ?? 1;
    const e1 = new THREE.Vector3();
    const e2 = new THREE.Vector3();
    const cen = new THREE.Vector3();
    for (let t = 0; t < n; t += 3) {
      const a = v[t];
      const b = v[t + 1];
      const c = v[t + 2];
      e1.subVectors(b, a);
      e2.subVectors(c, a);
      if (e1.cross(e2).length() < 1e-5) continue;
      cen
        .copy(a)
        .add(b)
        .add(c)
        .multiplyScalar(1 / 3);
      if (o.cullY !== undefined && cen.y < o.cullY) continue;
      const fc = typeof o.color === 'function' ? o.color(cen) : o.color;
      for (const p of [a, b, c]) {
        const q = o.groundClamp ? p.clone().setY(Math.max(0, p.y)) : p;
        this.pos.push(q.x, q.y, q.z);
        this.colr.push(fc.r, fc.g, fc.b);
        this.wmul.push(wm);
        const partAo = o.ao
          ? o.ao(q)
          : 1 - aoAmt * (1 - smooth(minY, minY + 0.5 * Math.max(1e-6, maxY - minY), q.y));
        this.ao.push(partAo);
      }
    }
  }

  /** Convex planar polygon (fan from pts[0]) wound to face `hint`. */
  addPoly(pts: THREE.Vector3[], hint: THREE.Vector3, o: PartOpts): void {
    const tris: number[] = [];
    for (let i = 1; i < pts.length - 1; i++) {
      let a = pts[0];
      let b = pts[i];
      let c = pts[i + 1];
      const nrm = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
      if (nrm.dot(hint) < 0) [b, c] = [c, b];
      a = pts[0];
      tris.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(tris, 3));
    this.add(g, o);
  }

  finish(rng: Rng, windy: boolean): THREE.BufferGeometry {
    const jr = rng.fork('faces');
    const n = this.pos.length / 3;
    const hsl = { h: 0, s: 0, l: 0 };
    const c = new THREE.Color();
    let maxY = 1e-6;
    for (let i = 0; i < n; i++) maxY = Math.max(maxY, this.pos[i * 3 + 1]);
    const wind = new Float32Array(n);
    const ao = new Float32Array(n);
    const color = new Float32Array(n * 3);
    for (let f = 0; f < n; f += 3) {
      c.setRGB(this.colr[f * 3], this.colr[f * 3 + 1], this.colr[f * 3 + 2]);
      c.getHSL(hsl);
      const h = hsl.h + jr.range(-4, 4) / 360;
      const l = Math.max(MIN_L, hsl.l + jr.range(-0.03, 0.03));
      c.setHSL(h, hsl.s, l);
      for (let k = 0; k < 3; k++) {
        const i = f + k;
        color[i * 3] = Math.min(1, Math.max(0, c.r));
        color[i * 3 + 1] = Math.min(1, Math.max(0, c.g));
        color[i * 3 + 2] = Math.min(1, Math.max(0, c.b));
        const y = this.pos[i * 3 + 1];
        const ty = Math.min(1, Math.max(0, y / maxY));
        wind[i] = windy ? Math.min(1, this.wmul[i] * ty * ty) : 0;
        const ground = 0.88 + 0.12 * smooth(0, 0.35, y);
        ao[i] = Math.min(1, Math.max(AO_MIN, this.ao[i] * ground));
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.computeVertexNormals(); // non-indexed => flat per-face normals
    g.setAttribute('color', new THREE.BufferAttribute(color, 3));
    g.setAttribute('wind', new THREE.BufferAttribute(wind, 1));
    g.setAttribute('ao', new THREE.BufferAttribute(ao, 1));
    g.computeBoundingBox();
    g.computeBoundingSphere();
    g.userData = { tris: n / 3 };
    return g;
  }
}

/** Tapered cylinder between two points (axis-aligned geometry reoriented). */
export function frustum(
  p0: THREE.Vector3,
  p1: THREE.Vector3,
  r0: number,
  r1: number,
  radial: number,
  open = true,
): { geo: THREE.BufferGeometry; m: THREE.Matrix4 } {
  const d = new THREE.Vector3().subVectors(p1, p0);
  const len = d.length();
  const geo = new THREE.CylinderGeometry(r1, r0, len, radial, 1, open);
  const m = mat(p0.clone().add(p1).multiplyScalar(0.5), qFromTo(new THREE.Vector3(0, 1, 0), d));
  return { geo, m };
}

/** Icosphere radially displaced by noise (shared positions displace identically). */
export function blob(
  r: number,
  detail: number,
  noise: Noise,
  amp: number,
  freq = 1.4,
  off = 0,
): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(r, detail);
  const p = g.getAttribute('position');
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    const k = 1 + amp * noise.n3(v.x * freq + off, v.y * freq + off * 0.7, v.z * freq - off);
    p.setXYZ(i, v.x * r * k, v.y * r * k, v.z * r * k);
  }
  return g;
}

export { createNoise };
