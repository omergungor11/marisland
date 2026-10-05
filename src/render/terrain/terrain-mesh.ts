import * as THREE from 'three';
import type { WorldData } from '../../world/types.ts';
import { CHUNK_CELLS } from '../../world/types.ts';
import { TERRAIN_FACETS, TERRAIN_LOD } from '../../content/terrain.ts';
import { sampleSurface, type SurfaceSample } from '../../shared/terrain-sample.ts';
import { faceColor, type TerrainColorGrid } from './terrain-colors.ts';

/**
 * Smooth chunk mesher (M14b D-030, TASK-371). Indexed grid over one 64 u chunk at a level's
 * stride (4 / 2 / 1 / 0.5 u), every vertex ON the clamped Catmull-Rom surface with its analytic
 * normal. Attributes (contract with the terrain material, TASK-372):
 *  - `position`, `normal`;
 *  - `ao` (float): bilinear AO of the 2 u colour grid;
 *  - `aMorph` (vec4, fixed location `TERRAIN_MORPH_LOCATION`): x = Δy to the next-coarser level
 *    at this xz, yz = that level's normal (x, z; y = √(1 − x² − z²)), w = level index. Even
 *    vertices (shared with the coarser level) carry Δy = 0 and their own normal;
 *  - TODO(TASK-372) `color`: temporary per-vertex colour so the current vertex-colour material
 *    still renders. Remove with 372 (see `vertexColor` / `VertexColorCache`).
 * Every quad splits along the same diagonal (x0,z0)–(x1,z1), so level k nests in level k − 1:
 * odd vertices fully morphed lie exactly on the coarser level's triangles (no cracks, no pops).
 * Skirts: a row of vertices hanging `TERRAIN_LOD.skirt` u below each skirted edge (same normal /
 * morph as the edge, so they follow it) hides sub-pixel seams between neighbours.
 */
export interface ChunkGeometryStats {
  triangles: number;
  /** Lowest / highest vertex y (skirts included). */
  minY: number;
  maxY: number;
  /** Attribute + index bytes. */
  bytes: number;
}

/** `aMorph` vertex location (D-016): free in the terrain program (aSpin's slot elsewhere). */
export const TERRAIN_MORPH_LOCATION = 13;

/**
 * Per level (start, end) of the morph distance window, u: level k blends to k − 1 between them;
 * end = band × (1 − hysteresis) = where a chunk switches between the two levels. Level 0: never.
 */
export function morphBands(): [number, number][] {
  const L = TERRAIN_LOD;
  const out: [number, number][] = [[1e9, 2e9]];
  for (let k = 1; k < L.strides.length; k++) {
    const b = L.bands[k - 1];
    const inner = k < L.bands.length ? L.bands[k] : 0;
    const end = b * (1 - L.hysteresis);
    out.push([end - L.morph * (b - inner), end]);
  }
  return out;
}

/** CPU twin of the vertex-shader morph weight. */
export function morphWeight(level: number, dist: number): number {
  const [a, b] = morphBands()[level];
  return Math.min(1, Math.max(0, (dist - a) / (b - a)));
}

const f4 = (v: number): string => v.toFixed(4);

const MORPH_PARS = /* glsl */ `
layout(location = ${TERRAIN_MORPH_LOCATION}) attribute vec4 aMorph;
uniform vec2 uMorphBand[${TERRAIN_LOD.strides.length}];
varying vec3 vMarSurf;
`;
const MORPH_NORMAL = /* glsl */ `
  // geomorph (TASK-371): odd vertices slide to the coarser level as the camera recedes
  vec2 marMb = uMorphBand[int(aMorph.w + 0.5)];
  float marMw = clamp((distance(position, cameraPosition) - marMb.x) / (marMb.y - marMb.x), 0.0, 1.0);
  objectNormal = mix(objectNormal, vec3(aMorph.y, sqrt(max(1.0 - dot(aMorph.yz, aMorph.yz), 0.0)), aMorph.z), marMw);
`;
const MORPH_POSITION = /* glsl */ `
  transformed.y += aMorph.x * marMw;
  vMarSurf = transformed;
`;
const FACET_PARS = /* glsl */ `
varying vec3 vMarSurf;
uniform sampler2D uMarHeight;
uniform vec4 uMarHeightGrid;
`;
// Flat normal of the 2 u grid triangle under the fragment (diagonal (x0,z0)–(x1,z1), as the mesh)
const FACET_NORMAL = /* glsl */ `
  {
    vec2 marG = clamp((vMarSurf.xz - uMarHeightGrid.xy) * uMarHeightGrid.z, vec2(0.0), vec2(uMarHeightGrid.w - 1.001));
    ivec2 marC = ivec2(floor(marG));
    vec2 marF = marG - vec2(marC);
    float marHa = texelFetch(uMarHeight, marC, 0).r;
    float marHb = texelFetch(uMarHeight, marC + ivec2(1, 0), 0).r;
    float marHc = texelFetch(uMarHeight, marC + ivec2(0, 1), 0).r;
    float marHe = texelFetch(uMarHeight, marC + ivec2(1, 1), 0).r;
    vec2 marD = marF.x >= marF.y ? vec2(marHb - marHa, marHe - marHb) : vec2(marHe - marHc, marHc - marHa);
    vec3 marFn = normalize(vec3(-marD.x, 1.0 / uMarHeightGrid.z, -marD.y));
    float marFw = 1.0 - smoothstep(${f4(TERRAIN_FACETS.ny[0])}, ${f4(TERRAIN_FACETS.ny[1])}, marFn.y);
    if (marFw > 0.0) normal = normalize(mix(normal, normalize((viewMatrix * vec4(marFn, 0.0)).xyz), marFw));
  }
`;

function insertAfter(src: string, find: string, insert: string): string {
  const i = src.indexOf(find);
  if (i < 0) throw new Error(`terrain surface: chunk "${find}" not found`);
  return src.slice(0, i + find.length) + insert + src.slice(i + find.length);
}

/**
 * Chain the smooth-surface terms onto the terrain material's own `onBeforeCompile` (same program
 * key: the patch is constant, so the program count is unchanged):
 *  - geomorph (vertex): `aMorph` blend by camera distance, `uMorphBand` per level;
 *  - cliff facets (fragment, `TERRAIN_FACETS`): steep ground shades with the 2 u grid's flat
 *    triangle normals from the height texture (1 sampler, 4 texel fetches).
 * Chunks / merges have identity model and instance matrices, so `position` is world space.
 */
export function addTerrainSurface(
  material: THREE.Material,
  height: THREE.Texture,
  h: { originX: number; originZ: number; cellSize: number; n: number },
): void {
  const base = material.onBeforeCompile;
  const uniforms = {
    uMorphBand: { value: morphBands().map(([a, b]) => new THREE.Vector2(a, b)) },
    uMarHeight: { value: height },
    uMarHeightGrid: { value: new THREE.Vector4(h.originX, h.originZ, 1 / h.cellSize, h.n) },
  };
  material.onBeforeCompile = (shader, renderer) => {
    base.call(material, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    let vs = shader.vertexShader;
    vs = insertAfter(vs, '#include <common>', MORPH_PARS);
    vs = insertAfter(vs, '#include <beginnormal_vertex>', MORPH_NORMAL);
    vs = insertAfter(vs, '#include <begin_vertex>', MORPH_POSITION);
    shader.vertexShader = vs;
    let fs = shader.fragmentShader;
    fs = insertAfter(fs, '#include <common>', FACET_PARS);
    fs = insertAfter(fs, '#include <normal_fragment_begin>', FACET_NORMAL);
    shader.fragmentShader = fs;
  };
}

/**
 * TODO(TASK-372): per-sample vertex colours (`faceColor` of the sample with no jitter, AO
 * included), filled lazily per chunk. Delete together with the `color` attribute.
 */
export interface VertexColorCache {
  rgb: Float32Array;
  valid: Uint8Array;
}

/** TODO(TASK-372): remove with the `color` attribute. */
export function createVertexColorCache(n: number): VertexColorCache {
  return { rgb: new Float32Array(n * n * 3), valid: new Uint8Array(n * n) };
}

/** TODO(TASK-372): drop the cached colours of the inclusive sample rect. */
export function invalidateVertexColors(
  cache: VertexColorCache,
  n: number,
  ix0: number,
  ix1: number,
  iz0: number,
  iz1: number,
): void {
  for (let iz = Math.max(0, iz0); iz <= Math.min(n - 1, iz1); iz++)
    cache.valid.fill(0, iz * n + Math.max(0, ix0), iz * n + Math.min(n - 1, ix1) + 1);
}

const _col = new THREE.Color();

/**
 * TODO(TASK-372): colour of a vertex = bilinear blend of its 4 grid samples' colours; cliff
 * samples resolve their strata band at the vertex itself (as `faceColor` does per face).
 */
function vertexColor(
  world: WorldData,
  grid: TerrainColorGrid,
  cache: VertexColorCache,
  x: number,
  y: number,
  z: number,
  out: Float32Array,
  o: number,
): void {
  const h = world.height;
  const n = h.n;
  const fx = Math.min(Math.max((x - h.originX) / h.cellSize, 0), n - 1);
  const fz = Math.min(Math.max((z - h.originZ) / h.cellSize, 0), n - 1);
  const ix = Math.min(Math.floor(fx), n - 2);
  const iz = Math.min(Math.floor(fz), n - 2);
  const tx = fx - ix;
  const tz = fz - iz;
  let r = 0;
  let g = 0;
  let b = 0;
  for (let k = 0; k < 4; k++) {
    const w = (k & 1 ? tx : 1 - tx) * (k & 2 ? tz : 1 - tz);
    if (w === 0) continue;
    const i = (iz + (k >> 1)) * n + ix + (k & 1);
    if (grid.cliff[i] && y > 0) {
      faceColor(grid, i, i, i, x, y, z, 0, _col);
      r += w * _col.r;
      g += w * _col.g;
      b += w * _col.b;
      continue;
    }
    if (!cache.valid[i]) {
      const sx = h.originX + (i % n) * h.cellSize;
      const sz = h.originZ + Math.floor(i / n) * h.cellSize;
      faceColor(grid, i, i, i, sx, h.data[i], sz, 0, _col);
      cache.rgb[i * 3] = _col.r;
      cache.rgb[i * 3 + 1] = _col.g;
      cache.rgb[i * 3 + 2] = _col.b;
      cache.valid[i] = 1;
    }
    r += w * cache.rgb[i * 3];
    g += w * cache.rgb[i * 3 + 1];
    b += w * cache.rgb[i * 3 + 2];
  }
  out[o] = r;
  out[o + 1] = g;
  out[o + 2] = b;
}

const _s: SurfaceSample = { y: 0, dydx: 0, dydz: 0 };

/** Bilinear grid AO at world (x, z). */
function aoAt(world: WorldData, ao: Float32Array, x: number, z: number): number {
  const h = world.height;
  const n = h.n;
  const fx = Math.min(Math.max((x - h.originX) / h.cellSize, 0), n - 1);
  const fz = Math.min(Math.max((z - h.originZ) / h.cellSize, 0), n - 1);
  const ix = Math.min(Math.floor(fx), n - 2);
  const iz = Math.min(Math.floor(fz), n - 2);
  const tx = fx - ix;
  const tz = fz - iz;
  const i = iz * n + ix;
  const top = ao[i] + (ao[i + 1] - ao[i]) * tx;
  const bot = ao[i + n] + (ao[i + n + 1] - ao[i + n]) * tx;
  return top + (bot - top) * tz;
}

export function buildChunkGeometry(
  world: WorldData,
  grid: TerrainColorGrid,
  cx: number,
  cz: number,
  level: number,
  /** Skirt edges as bits: 1 = north (−z), 2 = south (+z), 4 = west (−x), 8 = east (+x). */
  skirtEdges = 15,
  colors: VertexColorCache = createVertexColorCache(world.height.n),
): { geometry: THREE.BufferGeometry; stats: ChunkGeometryStats } {
  const h = world.height;
  const s = TERRAIN_LOD.strides[level];
  const size = CHUNK_CELLS * h.cellSize;
  const m = Math.round(size / s);
  const side = m + 1;
  const x0 = h.originX + cx * size;
  const z0 = h.originZ + cz * size;
  const edges = [1, 2, 4, 8].filter((b) => skirtEdges & b);
  const nSurf = side * side;
  const nv = nSurf + edges.length * side;
  const pos = new Float32Array(nv * 3);
  const nor = new Float32Array(nv * 3);
  const ao = new Float32Array(nv);
  const mor = new Float32Array(nv * 4);
  const col = new Float32Array(nv * 3); // TODO(TASK-372)

  for (let j = 0; j < side; j++)
    for (let i = 0; i < side; i++) {
      const v = j * side + i;
      const x = x0 + i * s;
      const z = z0 + j * s;
      sampleSurface(h, x, z, _s);
      const l = Math.hypot(_s.dydx, 1, _s.dydz);
      pos[v * 3] = x;
      pos[v * 3 + 1] = _s.y;
      pos[v * 3 + 2] = z;
      nor[v * 3] = -_s.dydx / l;
      nor[v * 3 + 1] = 1 / l;
      nor[v * 3 + 2] = -_s.dydz / l;
      ao[v] = aoAt(world, grid.ao, x, z);
      vertexColor(world, grid, colors, x, pos[v * 3 + 1], z, col, v * 3); // TODO(TASK-372)
    }

  // geomorph targets: the coarser level's (nested) triangles at each odd vertex
  let maxDy = 0;
  for (let j = 0; j < side; j++)
    for (let i = 0; i < side; i++) {
      const v = j * side + i;
      const o = v * 4;
      mor[o + 3] = level;
      let a = v;
      let b = v;
      if (level > 0 && (i & 1 || j & 1)) {
        const di = i & 1;
        const dj = j & 1;
        a = (j - dj) * side + (i - di);
        b = (j + dj) * side + (i + di);
      }
      if (a === v) {
        mor[o + 1] = nor[v * 3];
        mor[o + 2] = nor[v * 3 + 2];
        continue;
      }
      const dy = (pos[a * 3 + 1] + pos[b * 3 + 1]) / 2 - pos[v * 3 + 1];
      mor[o] = dy;
      maxDy = Math.max(maxDy, Math.abs(dy));
      const nx = nor[a * 3] + nor[b * 3];
      const ny = nor[a * 3 + 1] + nor[b * 3 + 1];
      const nz = nor[a * 3 + 2] + nor[b * 3 + 2];
      const l = Math.hypot(nx, ny, nz);
      mor[o + 1] = nx / l;
      mor[o + 2] = nz / l;
    }

  const tris = m * m * 2 + edges.length * m * 2;
  const index = nv > 65535 ? new Uint32Array(tris * 3) : new Uint16Array(tris * 3);
  let t = 0;
  for (let j = 0; j < m; j++)
    for (let i = 0; i < m; i++) {
      const a = j * side + i;
      const b = a + 1;
      const c = a + side;
      const e = c + 1;
      index[t++] = a;
      index[t++] = c;
      index[t++] = e;
      index[t++] = a;
      index[t++] = e;
      index[t++] = b;
    }

  // skirts: per edge a hanging copy of the edge row, triangles facing outward
  let base = nSurf;
  for (const bit of edges) {
    const at = (k: number): number =>
      bit === 1 ? k : bit === 2 ? m * side + k : bit === 4 ? k * side : k * side + m;
    for (let k = 0; k < side; k++) {
      const v = at(k);
      const sv = base + k;
      const y = pos[v * 3 + 1];
      let step = 0;
      if (k > 0) step = Math.abs(y - pos[at(k - 1) * 3 + 1]);
      if (k < m) step = Math.max(step, Math.abs(y - pos[at(k + 1) * 3 + 1]));
      pos[sv * 3] = pos[v * 3];
      pos[sv * 3 + 1] = y - TERRAIN_LOD.skirt - 0.5 * step;
      pos[sv * 3 + 2] = pos[v * 3 + 2];
      for (let q = 0; q < 3; q++) {
        nor[sv * 3 + q] = nor[v * 3 + q];
        col[sv * 3 + q] = col[v * 3 + q];
      }
      for (let q = 0; q < 4; q++) mor[sv * 4 + q] = mor[v * 4 + q];
      ao[sv] = ao[v];
    }
    // north / east face −z / +x with (t0, t1, b0); south / west with (t0, b0, t1)
    const flip = bit === 2 || bit === 4;
    for (let k = 0; k < m; k++) {
      const t0 = at(k);
      const t1 = at(k + 1);
      const b0 = base + k;
      const b1 = base + k + 1;
      if (flip) {
        index[t++] = t0;
        index[t++] = b0;
        index[t++] = t1;
        index[t++] = t1;
        index[t++] = b0;
        index[t++] = b1;
      } else {
        index[t++] = t0;
        index[t++] = t1;
        index[t++] = b0;
        index[t++] = t1;
        index[t++] = b1;
        index[t++] = b0;
      }
    }
    base += side;
  }

  let minY = Infinity;
  let maxY = -Infinity;
  for (let v = 0; v < nv; v++) {
    const y = pos[v * 3 + 1];
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setIndex(new THREE.BufferAttribute(index, 1));
  geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geometry.setAttribute('ao', new THREE.BufferAttribute(ao, 1));
  geometry.setAttribute('aMorph', new THREE.BufferAttribute(mor, 4));
  geometry.setAttribute('color', new THREE.BufferAttribute(col, 3)); // TODO(TASK-372)
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  // morphed vertices move by up to maxDy
  geometry.boundingSphere!.radius += maxDy;
  geometry.boundingBox!.expandByScalar(maxDy);
  return { geometry, stats: { triangles: tris, minY, maxY, bytes: geometryBytes(geometry) } };
}

export function geometryBytes(g: THREE.BufferGeometry): number {
  let b = g.index ? g.index.array.byteLength : 0;
  for (const a of Object.values(g.attributes)) b += (a as THREE.BufferAttribute).array.byteLength;
  return b;
}

/** One indexed geometry from several chunk geometries with the same attributes (island merge). */
export function mergeChunkGeometries(parts: readonly THREE.BufferGeometry[]): THREE.BufferGeometry {
  let nv = 0;
  let ni = 0;
  for (const p of parts) {
    nv += p.getAttribute('position').count;
    ni += p.index!.count;
  }
  const index = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
  const out = new THREE.BufferGeometry();
  const names = parts.length ? Object.keys(parts[0].attributes) : ['position'];
  for (const name of names) {
    const size = parts[0].getAttribute(name).itemSize;
    const arr = new Float32Array(nv * size);
    let o = 0;
    for (const p of parts) {
      const src = p.getAttribute(name).array as Float32Array;
      arr.set(src, o);
      o += src.length;
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  let vo = 0;
  let io = 0;
  for (const p of parts) {
    const src = p.index!.array;
    for (let k = 0; k < src.length; k++) index[io + k] = src[k] + vo;
    io += src.length;
    vo += p.getAttribute('position').count;
  }
  out.setIndex(new THREE.BufferAttribute(index, 1));
  out.computeBoundingBox();
  out.computeBoundingSphere();
  return out;
}
