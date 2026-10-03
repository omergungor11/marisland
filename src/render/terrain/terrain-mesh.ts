import * as THREE from 'three';
import type { WorldData } from '../../world/types.ts';
import { CHUNK_CELLS } from '../../world/types.ts';
import { TERRAIN_LOD } from '../../content/terrain.ts';
import { faceColor, faceHash, type TerrainColorGrid } from './terrain-colors.ts';

/**
 * Faceted chunk mesher (ARCHITECTURE §3 "Terrain"). Non-indexed triangles with
 * flat normals and per-face colours; each quad is split along the diagonal whose
 * two triangles agree best (smaller normal difference) so ridges read carved.
 * A vertical skirt around the chunk edge hides LOD / chunk cracks.
 */
export interface ChunkGeometryStats {
  triangles: number;
  minY: number;
}

const _col = new THREE.Color();

export function buildChunkGeometry(
  world: WorldData,
  grid: TerrainColorGrid,
  cx: number,
  cz: number,
  lod: number,
  /** Skirt edges as bits: 1 = north (−z), 2 = south (+z), 4 = west (−x), 8 = east (+x). */
  skirtEdges = 15,
): { geometry: THREE.BufferGeometry; stats: ChunkGeometryStats } {
  const h = world.height;
  const n = h.n;
  const d = h.data;
  const cs = h.cellSize;
  const stride = TERRAIN_LOD.strides[lod];
  const cells = CHUNK_CELLS / stride;
  const ix0 = cx * CHUNK_CELLS;
  const iz0 = cz * CHUNK_CELLS;
  const edgeCount =
    (skirtEdges & 1) + ((skirtEdges >> 1) & 1) + ((skirtEdges >> 2) & 1) + ((skirtEdges >> 3) & 1);
  const triCount = cells * cells * 2 + edgeCount * cells * 2;
  const pos = new Float32Array(triCount * 9);
  const nor = new Float32Array(triCount * 9);
  const col = new Float32Array(triCount * 9);
  let t = 0;
  let minY = Infinity;

  const X = (ix: number): number => h.originX + ix * cs;
  const Z = (iz: number): number => h.originZ + iz * cs;

  const pushTri = (
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
    qx: number,
    qy: number,
    qz: number,
    c: THREE.Color,
    normalOverride?: readonly number[],
  ): void => {
    // flat normal = (b − a) × (c − a)
    const ux = bx - ax,
      uy = by - ay,
      uz = bz - az;
    const vx = qx - ax,
      vy = qy - ay,
      vz = qz - az;
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l;
    ny /= l;
    nz /= l;
    if (normalOverride) {
      nx = normalOverride[0];
      ny = normalOverride[1];
      nz = normalOverride[2];
    }
    const o = t * 9;
    pos[o] = ax;
    pos[o + 1] = ay;
    pos[o + 2] = az;
    pos[o + 3] = bx;
    pos[o + 4] = by;
    pos[o + 5] = bz;
    pos[o + 6] = qx;
    pos[o + 7] = qy;
    pos[o + 8] = qz;
    for (let k = 0; k < 3; k++) {
      nor[o + k * 3] = nx;
      nor[o + k * 3 + 1] = ny;
      nor[o + k * 3 + 2] = nz;
      col[o + k * 3] = c.r;
      col[o + k * 3 + 1] = c.g;
      col[o + k * 3 + 2] = c.b;
    }
    t++;
  };

  // unnormalised up-facing normal of (a, b, c) given heights on a stride×stride quad
  const triNormal = (
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
    qx: number,
    qy: number,
    qz: number,
    out: number[],
  ): void => {
    const ux = bx - ax,
      uy = by - ay,
      uz = bz - az;
    const vx = qx - ax,
      vy = qy - ay,
      vz = qz - az;
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    out[0] = nx / l;
    out[1] = ny / l;
    out[2] = nz / l;
  };
  const n1 = [0, 0, 0];
  const n2 = [0, 0, 0];

  const tri = (i0: number, i1: number, i2: number, faceIndex: number): void => {
    const x0 = X(i0 % n),
      z0 = Z(Math.floor(i0 / n)),
      y0 = d[i0];
    const x1 = X(i1 % n),
      z1 = Z(Math.floor(i1 / n)),
      y1 = d[i1];
    const x2 = X(i2 % n),
      z2 = Z(Math.floor(i2 / n)),
      y2 = d[i2];
    if (y0 < minY) minY = y0;
    if (y1 < minY) minY = y1;
    if (y2 < minY) minY = y2;
    faceColor(
      grid,
      i0,
      i1,
      i2,
      (x0 + x1 + x2) / 3,
      (y0 + y1 + y2) / 3,
      (z0 + z1 + z2) / 3,
      faceHash(world.seed, faceIndex, lod),
      _col,
    );
    pushTri(x0, y0, z0, x1, y1, z1, x2, y2, z2, _col);
  };

  for (let qz = 0; qz < cells; qz++) {
    for (let qx = 0; qx < cells; qx++) {
      const ix = ix0 + qx * stride;
      const iz = iz0 + qz * stride;
      const a = iz * n + ix;
      const b = a + stride;
      const c = a + stride * n;
      const e = c + stride;
      const xa = X(ix),
        xb = X(ix + stride),
        za = Z(iz),
        zc = Z(iz + stride);
      // option A: diagonal b–c → (a,c,b) + (b,c,e)
      triNormal(xa, d[a], za, xa, d[c], zc, xb, d[b], za, n1);
      triNormal(xb, d[b], za, xa, d[c], zc, xb, d[e], zc, n2);
      const dotA = n1[0] * n2[0] + n1[1] * n2[1] + n1[2] * n2[2];
      // option B: diagonal a–e → (a,c,e) + (a,e,b)
      triNormal(xa, d[a], za, xa, d[c], zc, xb, d[e], zc, n1);
      triNormal(xa, d[a], za, xb, d[e], zc, xb, d[b], za, n2);
      const dotB = n1[0] * n2[0] + n1[1] * n2[1] + n1[2] * n2[2];
      const f = a * 2;
      if (dotA >= dotB) {
        tri(a, c, b, f);
        tri(b, c, e, f + 1);
      } else {
        tri(a, c, e, f);
        tri(a, e, b, f + 1);
      }
    }
  }

  // Skirts: per edge segment a vertical quad facing outward, coloured like the edge.
  // `outward` = winding for an edge running along +x (→ +z normal) or +z (→ −x normal).
  const _sn = [0, 1, 0];
  const hAt = (ix: number, iz: number): number =>
    d[Math.min(n - 1, Math.max(0, iz)) * n + Math.min(n - 1, Math.max(0, ix))];
  const edgeNormal = (i0: number, i1: number, out: number[]): void => {
    let gx = 0;
    let gz = 0;
    for (const i of [i0, i1]) {
      const ix = i % n;
      const iz = Math.floor(i / n);
      gx += (hAt(ix + 1, iz) - hAt(ix - 1, iz)) / (2 * cs);
      gz += (hAt(ix, iz + 1) - hAt(ix, iz - 1)) / (2 * cs);
    }
    gx /= 2;
    gz /= 2;
    const l = Math.hypot(gx, 1, gz);
    out[0] = -gx / l;
    out[1] = 1 / l;
    out[2] = -gz / l;
  };
  const skirt = (i0: number, i1: number, outward: boolean): void => {
    const x0 = X(i0 % n),
      z0 = Z(Math.floor(i0 / n)),
      y0 = d[i0] - TERRAIN_LOD.skirtInset;
    const x1 = X(i1 % n),
      z1 = Z(Math.floor(i1 / n)),
      y1 = d[i1] - TERRAIN_LOD.skirtInset;
    const bottom = Math.min(y0, y1) - TERRAIN_LOD.skirt - 0.5 * Math.abs(y0 - y1);
    faceColor(grid, i0, i1, i1, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, 0, _col);
    // Skirts only ever show through sub-pixel seams, so shade them like the surface
    // (heightfield normal at the edge) instead of as a dark vertical wall.
    edgeNormal(i0, i1, _sn);
    if (outward) {
      pushTri(x0, y0, z0, x0, bottom, z0, x1, y1, z1, _col, _sn);
      pushTri(x1, y1, z1, x0, bottom, z0, x1, bottom, z1, _col, _sn);
    } else {
      pushTri(x0, y0, z0, x1, y1, z1, x0, bottom, z0, _col, _sn);
      pushTri(x1, y1, z1, x1, bottom, z1, x0, bottom, z0, _col, _sn);
    }
    if (bottom < minY) minY = bottom;
  };
  const S = stride;
  const ixe = ix0 + CHUNK_CELLS;
  const ize = iz0 + CHUNK_CELLS;
  for (let k = 0; k < cells; k++) {
    const xA = ix0 + k * S;
    const zA = iz0 + k * S;
    // north edge (z = iz0) faces −z; south (z = ize) faces +z; west (x = ix0) −x; east +x
    if (skirtEdges & 1) skirt(iz0 * n + xA, iz0 * n + xA + S, false);
    if (skirtEdges & 2) skirt(ize * n + xA, ize * n + xA + S, true);
    if (skirtEdges & 4) skirt(zA * n + ix0, (zA + S) * n + ix0, true);
    if (skirtEdges & 8) skirt(zA * n + ixe, (zA + S) * n + ixe, false);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return { geometry, stats: { triangles: t, minY } };
}
