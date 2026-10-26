import * as THREE from 'three';
import { createRng } from '../core/rng.ts';
import { WHALE } from '../content/whale.ts';

/**
 * The grey whale mesh (M23 TASK-489): low-poly, vertex-coloured, faceted, built from code. One
 * non-indexed geometry whose vertices the view re-poses on the CPU each frame (a spine of rings:
 * the body bends in the vertical plane, the tail and fluke flex, the flippers paddle) — one hero
 * animal, ≈ 650 triangles, so a CPU skin is cheaper than any extra program. Local frame: +x
 * forward (the nose), +y up, +z right; the origin is the body-centre ring.
 *
 * Geometry attributes match the lit program (position, normal, color, wind, ao, emissive), so the
 * mesh draws with the existing `mar-lit` program (no new program).
 */

/** The bend parameters the skin needs (life/whale-pose.ts `WhalePose` is assignable to it). */
export interface WhaleBend {
  pitch: number;
  arch: number;
  tail: number;
  fluke: number;
  fin: number;
  wag: number;
  wagPhase: number;
}

export interface WhaleRig {
  geometry: THREE.BufferGeometry;
  /** Re-pose the spine and (when `skin`) the vertices (local frame); `tail` is always updated. */
  pose(b: WhaleBend, skin?: boolean): void;
  /** Spine frame count and the last pose's ring centres (x, y per frame; z = 0). */
  readonly spine: { x: Float32Array; y: Float32Array; a: Float32Array };
  /** Fluke tip midpoint of the last pose (local frame), for the splash anchor. */
  readonly tail: THREE.Vector3;
  readonly tris: number;
}

/** Ring axis positions (u, nose +), radii; index 0 is the nose apex. The pivot ring is `PIVOT`. */
const A = [7.0, 6.8, 6.1, 5.2, 4.2, 3.2, 2.1, 1.0, 0.0, -1.1, -2.2, -3.3, -4.2, -5.0, -5.5];
const R = [0, 0.62, 1.2, 1.65, 1.95, 2.1, 2.15, 2.1, 2.0, 1.8, 1.5, 1.15, 0.85, 0.6, 0.5];
const PIVOT = 8;
const RINGS = A.length;
/** Frame index of the fluke (after the last ring). */
const FLUKE = RINGS;
const N = 16;
const TAU = Math.PI * 2;
const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (x: number): number => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};

interface Node {
  k: number;
  ox: number;
  oy: number;
  oz: number;
  /** Flipper vertices: side ±1 and the root (oy, oz) it paddles about. */
  fin?: { side: number; ry: number; rz: number };
}

export function buildWhale(): WhaleRig {
  const C = WHALE.colors;
  const rng = createRng(489).fork('whale');
  const nodes: Node[] = [];
  const corner: number[] = [];
  const colour: THREE.Color[] = [];
  const hints: THREE.Vector3[] = [];
  const addNode = (n: Node): number => nodes.push(n) - 1;
  const col = (hex: string): THREE.Color => new THREE.Color(hex);
  const restPos = (n: Node): THREE.Vector3 =>
    new THREE.Vector3(A[n.k === FLUKE ? RINGS - 1 : n.k] + n.ox, n.oy, n.oz);

  /** Triangle (a, b, c), wound to face `hint` (a vector from the rest centroid) at the end. */
  const tri = (
    a: number,
    b: number,
    c: number,
    hex: string,
    hint: (p: THREE.Vector3) => THREE.Vector3,
  ): void => {
    corner.push(a, b, c);
    colour.push(col(hex));
    const cen = restPos(nodes[a])
      .add(restPos(nodes[b]))
      .add(restPos(nodes[c]))
      .multiplyScalar(1 / 3);
    hints.push(hint(cen));
  };
  const outward = (p: THREE.Vector3): THREE.Vector3 => new THREE.Vector3(0, p.y, p.z);
  const fixed = (x: number, y: number, z: number) => (): THREE.Vector3 =>
    new THREE.Vector3(x, y, z);

  // --- body rings
  const apex = addNode({ k: 0, ox: 0.25, oy: 0, oz: 0 });
  const ring: number[][] = [[]];
  for (let k = 1; k < RINGS; k++) {
    const row: number[] = [];
    for (let j = 0; j < N; j++) {
      const th = (j / N) * TAU;
      let ry = R[k] * 0.97;
      const rz = R[k] * 1.04;
      let cy = Math.cos(th);
      if (cy < 0) cy *= 0.92; // flatter belly
      // dorsal knuckles on the peduncle
      if (j === 0 && k >= 9 && k <= 11) ry *= 1.2;
      // throat grooves: every other belly line pulled in on the head and chest
      let g = 1;
      if ((j === 6 || j === 8 || j === 10) && k <= 8) g = 1 - 0.09 * (1 - smooth((k - 4) / 5));
      row.push(addNode({ k, ox: 0, oy: ry * cy * g, oz: rz * Math.sin(th) * g }));
    }
    ring.push(row);
  }
  const cap = addNode({ k: RINGS - 1, ox: -0.5, oy: 0, oz: 0 });

  const faceColour = (k: number, j: number): string => {
    const c = (j + 0.5) / N; // 0 top .. 0.5 bottom .. 1 top, symmetric
    const ang = Math.min(c, 1 - c) * 2; // 0 at the top, 1 at the bottom
    const mouthJ = k <= 3 ? 4 : 3;
    // mouth line: the smiling band along the head, on each side
    if (k >= 1 && k <= 5 && (j === mouthJ || j === N - 1 - mouthJ)) return C.mouth;
    if (ang > 0.72) return k <= 8 && j % 2 === 0 ? C.groove : C.belly;
    if (ang > 0.52) return C.flank;
    return rng.chance(0.14) ? C.mottle : C.back;
  };
  for (let j = 0; j < N; j++) {
    const j2 = (j + 1) % N;
    tri(apex, ring[1][j], ring[1][j2], faceColour(1, j), outward);
  }
  for (let k = 1; k < RINGS - 1; k++)
    for (let j = 0; j < N; j++) {
      const j2 = (j + 1) % N;
      const col0 = faceColour(k, j);
      tri(ring[k][j], ring[k + 1][j], ring[k + 1][j2], col0, outward);
      tri(ring[k][j], ring[k + 1][j2], ring[k][j2], col0, outward);
    }
  for (let j = 0; j < N; j++) {
    const j2 = (j + 1) % N;
    tri(
      ring[RINGS - 1][j],
      cap,
      ring[RINGS - 1][j2],
      C.back,
      (p) => new THREE.Vector3(-1, p.y * 0.1, p.z * 0.1),
    );
  }

  // --- fluke: a flat double layer in the fluke frame (outline points x back, z across)
  const outline: [number, number][] = [
    [-0.1, 0.45],
    [-0.9, 1.5],
    [-1.75, 2.55],
    [-1.15, 1.1],
    [-0.95, 0],
    [-1.15, -1.1],
    [-1.75, -2.55],
    [-0.9, -1.5],
    [-0.1, -0.45],
  ];
  const th = 0.09;
  const mk = (layer: number): number[] =>
    outline.map(([x, z]) => addNode({ k: FLUKE, ox: x, oy: layer * th, oz: z }));
  const top = mk(1);
  const bot = mk(-1);
  const ctop = addNode({ k: FLUKE, ox: -0.45, oy: th, oz: 0 });
  const cbot = addNode({ k: FLUKE, ox: -0.45, oy: -th, oz: 0 });
  for (let i = 0; i < outline.length; i++) {
    const i2 = (i + 1) % outline.length;
    tri(ctop, top[i2], top[i], C.fluke, fixed(0, 1, 0));
    tri(cbot, bot[i], bot[i2], C.flukeUnder, fixed(0, -1, 0));
    if (i < outline.length - 1) {
      tri(top[i], top[i2], bot[i2], C.fluke, (p) => new THREE.Vector3(p.x + 1, 0, p.z));
      tri(top[i], bot[i2], bot[i], C.fluke, (p) => new THREE.Vector3(p.x + 1, 0, p.z));
    }
  }

  // --- pectoral flippers (paddle about the root on the chest ring)
  const FIN_K = 5;
  const fin: [number, number][] = [
    [0.55, 0],
    [0.25, 1.2],
    [-0.7, 2.2],
    [-1.3, 1.7],
    [-0.6, 0.9],
    [-0.5, 0],
  ];
  for (const side of [-1, 1]) {
    const ry = -0.85;
    const rz = side * 1.95;
    const mkf = (layer: number): number[] =>
      fin.map(([x, d]) =>
        addNode({
          k: FIN_K,
          ox: x,
          oy: ry - 0.32 * d + layer * 0.06,
          oz: rz + side * d,
          fin: { side, ry, rz },
        }),
      );
    const ft = mkf(1);
    const fb = mkf(-1);
    for (let i = 1; i < fin.length - 1; i++) {
      tri(ft[0], ft[i + 1], ft[i], C.fin, fixed(0, 1, 0));
      tri(fb[0], fb[i], fb[i + 1], C.fin, fixed(0, -1, 0));
    }
  }

  // --- face: eyes with a highlight, rosy cheeks (ring 3 / 4 frames)
  const ico = (r: number, detail: number): THREE.BufferGeometry =>
    new THREE.IcosahedronGeometry(r, detail).toNonIndexed();
  const blob = (
    kring: number,
    c: [number, number, number],
    r: number,
    hex: string,
    sq: [number, number, number] = [1, 1, 1],
  ): void => {
    const g = ico(r, 0);
    const p = g.getAttribute('position');
    const idx: number[] = [];
    for (let i = 0; i < p.count; i++)
      idx.push(
        addNode({
          k: kring,
          ox: c[0] + p.getX(i) * sq[0],
          oy: c[1] + p.getY(i) * sq[1],
          oz: c[2] + p.getZ(i) * sq[2],
        }),
      );
    for (let i = 0; i < p.count; i += 3) {
      const mid = new THREE.Vector3(c[0], c[1], c[2]);
      tri(idx[i], idx[i + 1], idx[i + 2], hex, (q) =>
        q.clone().sub(new THREE.Vector3(A[kring] + mid.x, mid.y, mid.z)),
      );
    }
  };
  for (const s of [-1, 1]) {
    blob(3, [0.1, 0.62, s * 1.52], 0.34, C.eye);
    blob(3, [0.3, 0.8, s * 1.7], 0.11, C.eyeLight);
    blob(4, [-0.2, -0.28, s * 1.92], 0.4, C.blush, [1, 0.8, 0.35]);
  }

  // --- bake: corner list, colours, orient triangles
  const nTri = corner.length / 3;
  const nodePos = new Float32Array(nodes.length * 3);
  const rp = nodes.map(restPos);
  for (let t = 0; t < nTri; t++) {
    const a = rp[corner[t * 3]];
    const b = rp[corner[t * 3 + 1]];
    const c = rp[corner[t * 3 + 2]];
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
    if (n.dot(hints[t]) < 0) {
      const tmp = corner[t * 3 + 1];
      corner[t * 3 + 1] = corner[t * 3 + 2];
      corner[t * 3 + 2] = tmp;
    }
  }
  const nv = nTri * 3;
  const pos = new Float32Array(nv * 3);
  const colArr = new Float32Array(nv * 3);
  const aoArr = new Float32Array(nv).fill(1);
  for (let t = 0; t < nTri; t++)
    for (let c = 0; c < 3; c++) {
      const o = (t * 3 + c) * 3;
      colArr[o] = colour[t].r;
      colArr[o + 1] = colour[t].g;
      colArr[o + 2] = colour[t].b;
    }
  const geometry = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(pos, 3);
  posAttr.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', posAttr);
  geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nv * 3), 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colArr, 3));
  geometry.setAttribute('wind', new THREE.BufferAttribute(new Float32Array(nv), 1));
  geometry.setAttribute('ao', new THREE.BufferAttribute(aoArr, 1));
  geometry.setAttribute('emissive', new THREE.BufferAttribute(new Float32Array(nv), 1));
  geometry.userData = { tris: nTri };

  // --- skin
  const phi = new Float32Array(RINGS + 1);
  const sx = new Float32Array(RINGS + 1);
  const sy = new Float32Array(RINGS + 1);
  const sa = Float32Array.from(A);
  const tail = new THREE.Vector3();
  const pose = (b: WhaleBend, skin = true): void => {
    // frame angles: pitch − arch·a, the tail bend ramped over the rear half, the vertical undulation
    for (let k = 0; k < RINGS; k++) {
      const a = A[k];
      const ramp = Math.pow(clamp01((0.5 - a) / 6), 1.2);
      const wagW = Math.pow(clamp01((1.5 - a) / 7), 1.5);
      phi[k] = b.pitch - b.arch * a + b.tail * ramp + b.wag * Math.sin(b.wagPhase - 0.5 * a) * wagW;
    }
    phi[FLUKE] = phi[RINGS - 1] + b.fluke;
    sx[PIVOT] = 0;
    sy[PIVOT] = 0;
    for (let k = PIVOT - 1; k >= 0; k--) {
      const m = (phi[k] + phi[k + 1]) / 2;
      sx[k] = sx[k + 1] + (A[k] - A[k + 1]) * Math.cos(m);
      sy[k] = sy[k + 1] + (A[k] - A[k + 1]) * Math.sin(m);
    }
    for (let k = PIVOT + 1; k < RINGS; k++) {
      const m = (phi[k] + phi[k - 1]) / 2;
      sx[k] = sx[k - 1] + (A[k] - A[k - 1]) * Math.cos(m);
      sy[k] = sy[k - 1] + (A[k] - A[k - 1]) * Math.sin(m);
    }
    sx[FLUKE] = sx[RINGS - 1];
    sy[FLUKE] = sy[RINGS - 1];
    // fluke tip midpoint: the fluke frame, 1.75 behind its root
    tail.set(sx[FLUKE] - 1.75 * Math.cos(phi[FLUKE]), sy[FLUKE] - 1.75 * Math.sin(phi[FLUKE]), 0);
    if (!skin) return;
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      let oy = n.oy;
      let oz = n.oz;
      if (n.fin) {
        const g = b.fin * n.fin.side;
        const dy = oy - n.fin.ry;
        const dz = oz - n.fin.rz;
        oy = n.fin.ry + dy * Math.cos(g) - dz * Math.sin(g);
        oz = n.fin.rz + dy * Math.sin(g) + dz * Math.cos(g);
      }
      const c = Math.cos(phi[n.k]);
      const s = Math.sin(phi[n.k]);
      nodePos[i * 3] = sx[n.k] + n.ox * c - oy * s;
      nodePos[i * 3 + 1] = sy[n.k] + n.ox * s + oy * c;
      nodePos[i * 3 + 2] = oz;
    }
    for (let i = 0; i < corner.length; i++) {
      const s = corner[i] * 3;
      pos[i * 3] = nodePos[s];
      pos[i * 3 + 1] = nodePos[s + 1];
      pos[i * 3 + 2] = nodePos[s + 2];
    }
    posAttr.needsUpdate = true;
  };
  pose({ pitch: 0, arch: 0, tail: 0, fluke: 0, fin: 0, wag: 0, wagPhase: 0 });
  // flat shading takes the normal from derivatives; the attribute only needs sane values
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  if (geometry.boundingSphere) geometry.boundingSphere.radius += 6;
  return { geometry, pose, spine: { x: sx, y: sy, a: sa }, tail, tris: nTri };
}

export const WHALE_RINGS = { count: RINGS, pivot: PIVOT };
