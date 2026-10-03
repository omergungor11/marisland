import * as THREE from 'three';

/** Tiny non-indexed triangle accumulator with flat normals and vertex colours. */
export class TriBuilder {
  private pos: number[] = [];
  private col: number[] = [];

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
    // explicit neutral values for the lit material's optional attributes (wind 0, ao 1, emissive 0)
    const n = this.pos.length / 3;
    g.setAttribute('wind', new THREE.Float32BufferAttribute(new Float32Array(n), 1));
    g.setAttribute('ao', new THREE.Float32BufferAttribute(new Float32Array(n).fill(1), 1));
    g.setAttribute('emissive', new THREE.Float32BufferAttribute(new Float32Array(n), 1));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
}

export const v3 = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);
export const hex = (h: string): THREE.Color => new THREE.Color(h);
