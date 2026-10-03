import * as THREE from 'three';
import type { Scope } from '../core/scope.ts';
import type { WorldData } from '../world/types.ts';
import { edtNearest } from '../world/gen/coast.ts';
import { leewardness } from '../world/gen/heightfield.ts';
import { WATER_BANDS } from '../content/palette.ts';
import { WATER_SHADER } from '../content/water.ts';

/**
 * Leeward ring scale per grid sample (D3), 1 … WATER_BANDS.leewardRingScale: the owning island
 * is the one with the nearest coast (exact feature transform, like the shelf heights), its
 * leewardness is the worldgen shelf's (`leewardness`, so the colour rings follow the seabed
 * shelf), and the field is box-blurred (3 separable passes ≈ gaussian) so where two islands'
 * shelves meet — or across a bay's medial axis — the scale blends instead of jumping.
 *
 * Before, the water shader derived the scale per pixel from the SDF gradient direction, which
 * flips across those seams (Voronoi edges between islands, medial axes of bays) and is piecewise
 * constant per bilinear texel: the band contours (d / scale) jumped by up to 50 % along straight
 * seam lines and stair-stepped along texel edges.
 */
export function ringScaleField(world: WorldData): Float32Array {
  const n = world.height.n;
  const cell = world.height.cellSize;
  const land = new Uint8Array(n * n);
  for (let i = 0; i < n * n; i++) land[i] = world.shoreSdf[i] > 0 ? 1 : 0;
  const near = edtNearest(land, n, n, 1).nearest;
  const out = new Float32Array(n * n).fill(1);
  const k = WATER_BANDS.leewardRingScale - 1;
  for (let iz = 0; iz < n; iz++) {
    const z = world.height.originZ + iz * cell;
    for (let ix = 0; ix < n; ix++) {
      const i = iz * n + ix;
      const j = land[i] === 1 ? i : near[i];
      const id = j >= 0 ? world.islandMap[j] : 0;
      const isl = id > 0 ? world.islands[id - 1] : undefined;
      if (isl)
        out[i] = 1 + k * leewardness(isl, world.windDir, world.height.originX + ix * cell, z);
    }
  }
  const r = Math.max(1, Math.round(WATER_SHADER.ringScaleBlur / cell));
  const tmp = new Float32Array(n * n);
  for (let pass = 0; pass < 3; pass++) {
    boxBlur(out, tmp, n, r, 1, n); // rows
    boxBlur(tmp, out, n, r, n, 1); // columns
  }
  return out;
}

/** 1-D box blur of every line (clamped edges): `step` along the line, `stride` between lines. */
function boxBlur(
  src: Float32Array,
  dst: Float32Array,
  n: number,
  r: number,
  step: number,
  stride: number,
): void {
  const w = 1 / (2 * r + 1);
  for (let l = 0; l < n; l++) {
    const base = l * stride;
    let acc = 0;
    for (let t = -r; t <= r; t++) acc += src[base + Math.min(n - 1, Math.max(0, t)) * step];
    for (let t = 0; t < n; t++) {
      dst[base + t * step] = acc * w;
      const add = Math.min(n - 1, t + r + 1);
      const sub = Math.max(0, t - r);
      acc += src[base + add * step] - src[base + sub * step];
    }
  }
}

/**
 * GPU copies of the world grids (ARCHITECTURE §3): height as R16F, shore SDF as RG16F
 * (R = signed shore distance, G = leeward ring scale, `ringScaleField`; filterable in WebGL2
 * core, works under SwiftShader), zones as R8. Shared by
 * terrain (caustics/wet sand), water (depth ramp, foam) and clouds (shadow mask).
 * UV mapping: u = (x − originX) / (n − 1) / cellSize, v likewise for z.
 */
export interface WorldTextures {
  height: THREE.DataTexture;
  /** R = signed shore distance (u), G = leeward ring scale (water bands). */
  sdf: THREE.DataTexture;
  zone: THREE.DataTexture;
  /** Uniform-ready mapping: xy = origin, z = 1 / world extent (n−1)·cellSize. */
  uGridMap: { value: THREE.Vector3 };
  /** Re-upload a region after a Phase 2 edit. */
  update(): void;
}

export function createWorldTextures(world: WorldData, scope: Scope): WorldTextures {
  const n = world.height.n;
  const heightHalf = new Uint16Array(n * n);
  const sdfHalf = new Uint16Array(n * n * 2);
  const fill = (): void => {
    const ring = ringScaleField(world);
    for (let i = 0; i < n * n; i++) {
      heightHalf[i] = THREE.DataUtils.toHalfFloat(world.height.data[i]);
      sdfHalf[i * 2] = THREE.DataUtils.toHalfFloat(
        Math.max(-200, Math.min(200, world.shoreSdf[i])),
      );
      sdfHalf[i * 2 + 1] = THREE.DataUtils.toHalfFloat(ring[i]);
    }
  };
  fill();
  const mk = (
    data: Uint16Array | Uint8Array,
    type: THREE.TextureDataType,
    filter: THREE.MagnificationTextureFilter,
    format: THREE.PixelFormat = THREE.RedFormat,
  ): THREE.DataTexture => {
    const t = new THREE.DataTexture(data, n, n, format, type);
    t.colorSpace = THREE.NoColorSpace;
    t.magFilter = filter;
    t.minFilter = filter;
    t.wrapS = THREE.ClampToEdgeWrapping;
    t.wrapT = THREE.ClampToEdgeWrapping;
    t.generateMipmaps = false;
    t.flipY = false;
    t.needsUpdate = true;
    scope.add(t);
    return t;
  };
  const height = mk(heightHalf, THREE.HalfFloatType, THREE.LinearFilter);
  const sdf = mk(sdfHalf, THREE.HalfFloatType, THREE.LinearFilter, THREE.RGFormat);
  const zone = mk(world.zone, THREE.UnsignedByteType, THREE.NearestFilter);
  const extent = (n - 1) * world.height.cellSize;
  return {
    height,
    sdf,
    zone,
    uGridMap: { value: new THREE.Vector3(world.height.originX, world.height.originZ, 1 / extent) },
    update() {
      fill();
      height.needsUpdate = true;
      sdf.needsUpdate = true;
      zone.needsUpdate = true;
    },
  };
}

/** GLSL helper: sample a world grid texture at world xz. Expects `uniform vec3 uGridMap;`. */
export const GRID_SAMPLE_GLSL = /* glsl */ `
vec2 marGridUv(vec2 xz) { return (xz - uGridMap.xy) * uGridMap.z; }
float marSampleGrid(sampler2D t, vec2 xz) { return texture2D(t, marGridUv(xz)).r; }
`;
