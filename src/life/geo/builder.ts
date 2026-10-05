import * as THREE from 'three';

/** Tiny non-indexed triangle accumulator with flat normals and vertex colours. */
export class TriBuilder {
  private pos: number[] = [];
  private col: number[] = [];
  private limb: number[] = [];
  private emi: number[] = [];
  private emiCur = 0;
  private emiUsed = false;
  private cur: [number, number, number, number] = [0, 0, 0, 0];
  private limbUsed = false;

  /**
   * Per-vertex animation tag for every following triangle (read by the life vertex shader):
   * `limb = (x, y, z, mode)`; see `life-material.ts` for the modes. `clearLimb` = static.
   */
  setLimb(x: number, y: number, z: number, mode: number): void {
    this.cur = [x, y, z, mode];
    this.limbUsed = true;
  }

  clearLimb(): void {
    this.cur = [0, 0, 0, 0];
  }

  /** Per-vertex night / screen glow (`emissive` attribute) for every following triangle; 0 = none. */
  setEmissive(v: number): void {
    this.emiCur = v;
    if (v !== 0) this.emiUsed = true;
  }

  tri(
    a: THREE.Vector3,
    b: THREE.Vector3,
    c: THREE.Vector3,
    ca: THREE.Color,
    cb = ca,
    cc = ca,
  ): void {
    for (const [p, k] of [
      [a, ca],
      [b, cb],
      [c, cc],
    ] as const) {
      this.pos.push(p.x, p.y, p.z);
      this.col.push(k.r, k.g, k.b);
      this.limb.push(this.cur[0], this.cur[1], this.cur[2], this.cur[3]);
      this.emi.push(this.emiCur);
    }
  }

  /** Triangle wound so its normal points away from `inside` (convex parts). */
  triOut(
    a: THREE.Vector3,
    b: THREE.Vector3,
    c: THREE.Vector3,
    inside: THREE.Vector3,
    ca: THREE.Color,
    cb = ca,
    cc = ca,
  ): void {
    const n = b.clone().sub(a).cross(c.clone().sub(a));
    const g = a
      .clone()
      .add(b)
      .add(c)
      .multiplyScalar(1 / 3)
      .sub(inside);
    if (n.dot(g) >= 0) this.tri(a, b, c, ca, cb, cc);
    else this.tri(a, c, b, ca, cc, cb);
  }

  /** Axis-aligned box (12 tris). `top` colours the +y face. */
  box(
    c: THREE.Vector3,
    hx: number,
    hy: number,
    hz: number,
    color: THREE.Color,
    top: THREE.Color = color,
  ): void {
    const p = (sx: number, sy: number, sz: number): THREE.Vector3 =>
      v3(c.x + sx * hx, c.y + sy * hy, c.z + sz * hz);
    const faces: [THREE.Vector3[], THREE.Color][] = [
      [[p(1, -1, -1), p(1, 1, -1), p(1, 1, 1), p(1, -1, 1)], color],
      [[p(-1, -1, -1), p(-1, 1, -1), p(-1, 1, 1), p(-1, -1, 1)], color],
      [[p(-1, 1, -1), p(1, 1, -1), p(1, 1, 1), p(-1, 1, 1)], top],
      [[p(-1, -1, -1), p(1, -1, -1), p(1, -1, 1), p(-1, -1, 1)], color],
      [[p(-1, -1, 1), p(1, -1, 1), p(1, 1, 1), p(-1, 1, 1)], color],
      [[p(-1, -1, -1), p(1, -1, -1), p(1, 1, -1), p(-1, 1, -1)], color],
    ];
    for (const [q, k] of faces) {
      this.triOut(q[0], q[1], q[2], c, k);
      this.triOut(q[0], q[2], q[3], c, k);
    }
  }

  /** Truncated cone along +y from `base` (radii rb → rt, `h` tall); caps included. */
  frustum(
    base: THREE.Vector3,
    rb: number,
    rt: number,
    h: number,
    seg: number,
    color: THREE.Color,
    top: THREE.Color = color,
  ): void {
    const mid = v3(base.x, base.y + h / 2, base.z);
    const ring = (y: number, r: number): THREE.Vector3[] =>
      Array.from({ length: seg }, (_, i) => {
        const th = (i / seg) * Math.PI * 2;
        return v3(base.x + Math.cos(th) * r, y, base.z + Math.sin(th) * r);
      });
    const lo = ring(base.y, rb);
    const hi = ring(base.y + h, rt);
    const cLo = v3(base.x, base.y, base.z);
    const cHi = v3(base.x, base.y + h, base.z);
    for (let i = 0; i < seg; i++) {
      const j = (i + 1) % seg;
      this.triOut(lo[i], lo[j], hi[j], mid, color);
      if (rt > 1e-4) this.triOut(lo[i], hi[j], hi[i], mid, color);
      this.triOut(cLo, lo[i], lo[j], mid, color);
      if (rt > 1e-4) this.triOut(cHi, hi[i], hi[j], mid, top);
    }
  }

  /** Quad a-b-c-d (counter-clockwise seen from the front); `double` also emits the back face. */
  quad(
    a: THREE.Vector3,
    b: THREE.Vector3,
    c: THREE.Vector3,
    d: THREE.Vector3,
    ca: THREE.Color,
    cb = ca,
    cc = ca,
    cd = ca,
    double = false,
  ): void {
    this.tri(a, b, c, ca, cb, cc);
    this.tri(a, c, d, ca, cc, cd);
    if (double) {
      this.tri(a, c, b, ca, cc, cb);
      this.tri(a, d, c, ca, cd, cc);
    }
  }

  /** Ellipsoid (semi-axes rx, ry, rz) centred at `c`, `seg` sides × `rings` rings, colour by height. */
  ellipsoid(
    c: THREE.Vector3,
    rx: number,
    ry: number,
    rz: number,
    seg: number,
    rings: number,
    colorAt: (t: number) => THREE.Color,
  ): void {
    const ring = (i: number): THREE.Vector3[] => {
      const a = (i / rings) * Math.PI;
      const r = Math.sin(a);
      const y = Math.cos(a);
      const out: THREE.Vector3[] = [];
      for (let s = 0; s < seg; s++) {
        const th = (s / seg) * Math.PI * 2;
        out.push(
          new THREE.Vector3(c.x + Math.cos(th) * r * rx, c.y + y * ry, c.z + Math.sin(th) * r * rz),
        );
      }
      return out;
    };
    const top = new THREE.Vector3(c.x, c.y + ry, c.z);
    const bot = new THREE.Vector3(c.x, c.y - ry, c.z);
    let prev = ring(1);
    for (let s = 0; s < seg; s++) {
      this.tri(top, prev[(s + 1) % seg], prev[s], colorAt(1));
    }
    for (let i = 2; i < rings; i++) {
      const cur = ring(i);
      const k = colorAt(1 - i / rings);
      for (let s = 0; s < seg; s++) {
        const s1 = (s + 1) % seg;
        this.quad(prev[s], prev[s1], cur[s1], cur[s], k);
      }
      prev = cur;
    }
    for (let s = 0; s < seg; s++) {
      this.tri(bot, prev[s], prev[(s + 1) % seg], colorAt(0));
    }
  }

  get triangles(): number {
    return this.pos.length / 9;
  }

  finish(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    if (this.limbUsed) g.setAttribute('limb', new THREE.Float32BufferAttribute(this.limb, 4));
    if (this.emiUsed) g.setAttribute('emissive', new THREE.Float32BufferAttribute(this.emi, 1));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
}

export const v3 = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);
export const hex = (h: string): THREE.Color => new THREE.Color(h);
