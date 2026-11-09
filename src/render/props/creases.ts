import * as THREE from 'three';
import { CREASE_CODES, EMISSIVE_STRIDE, NEAR_DETAIL } from '../../content/materials.ts';

/**
 * Crease bits for the bevel edge light (TASK-594). The flat-shaded lit program cannot see a facet
 * edge from inside one triangle (`fwidth` of a flat normal is 0: a 2×2 quad always shades a single
 * primitive), so the edges are found here, once per LOD0 geometry: bit k of a triangle = its edge
 * opposite corner k is shared with a facet bent more than `creaseDeg`. The bits ride in the
 * `emissive` code (content/materials.ts packing); the shader reads its corner with gl_VertexID % 3.
 *
 * Non-indexed geometry only (indexed geometry is returned untouched: no edge light). Open borders
 * (one triangle) and double-sided twins (opposite normals, same edge) are not creases, so panes,
 * leaves and cloth get no outline.
 */
export function bakeCreases(
  g: THREE.BufferGeometry,
  creaseDeg = NEAR_DETAIL.creaseDeg,
): THREE.BufferGeometry {
  if (g.index) return g;
  const pos = g.getAttribute('position');
  if (!pos || pos.count < 3 || pos.count % 3 !== 0) return g;
  const nTri = pos.count / 3;
  const nrm = new Float32Array(nTri * 3);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const keyOf = (i: number): string =>
    `${Math.round(pos.getX(i) * 1e4)},${Math.round(pos.getY(i) * 1e4)},${Math.round(pos.getZ(i) * 1e4)}`;
  const vkey: string[] = new Array(pos.count);
  for (let i = 0; i < pos.count; i++) vkey[i] = keyOf(i);
  for (let t = 0; t < nTri; t++) {
    a.fromBufferAttribute(pos, t * 3);
    b.fromBufferAttribute(pos, t * 3 + 1);
    c.fromBufferAttribute(pos, t * 3 + 2);
    b.sub(a);
    c.sub(a);
    b.cross(c);
    const l = b.length();
    if (l > 1e-10) b.multiplyScalar(1 / l);
    else b.set(0, 0, 0);
    nrm[t * 3] = b.x;
    nrm[t * 3 + 1] = b.y;
    nrm[t * 3 + 2] = b.z;
  }
  // edge (unordered vertex keys) → list of (triangle, opposite corner)
  const edges = new Map<string, number[]>();
  for (let t = 0; t < nTri; t++) {
    if (nrm[t * 3] === 0 && nrm[t * 3 + 1] === 0 && nrm[t * 3 + 2] === 0) continue;
    for (let k = 0; k < 3; k++) {
      const p = vkey[t * 3 + ((k + 1) % 3)];
      const q = vkey[t * 3 + ((k + 2) % 3)];
      if (p === q) continue;
      const e = p < q ? `${p}|${q}` : `${q}|${p}`;
      let list = edges.get(e);
      if (!list) edges.set(e, (list = []));
      list.push(t * 3 + k);
    }
  }
  const cosMax = Math.cos((creaseDeg * Math.PI) / 180);
  const bits = new Uint8Array(nTri);
  let any = false;
  for (const list of edges.values()) {
    if (list.length < 2) continue;
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++) {
        const ti = Math.floor(list[i] / 3);
        const tj = Math.floor(list[j] / 3);
        const d =
          nrm[ti * 3] * nrm[tj * 3] +
          nrm[ti * 3 + 1] * nrm[tj * 3 + 1] +
          nrm[ti * 3 + 2] * nrm[tj * 3 + 2];
        if (d < -0.95 || d > cosMax) continue; // double-sided twin / smooth enough
        bits[ti] |= 1 << (list[i] % 3);
        bits[tj] |= 1 << (list[j] % 3);
        any = true;
      }
  }
  if (!any) return g;
  const old = g.getAttribute('emissive');
  const em = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const e = old ? old.getX(i) : 0;
    const crease = Math.floor(e / EMISSIVE_STRIDE) % CREASE_CODES;
    // a tagged code keeps its class; crease bits fill the low part of the code (0 before baking)
    em[i] = crease === 0 ? e + EMISSIVE_STRIDE * bits[Math.floor(i / 3)] : e;
  }
  g.setAttribute('emissive', new THREE.BufferAttribute(em, 1));
  return g;
}
