import * as THREE from 'three';
import type { Scope } from '../core/scope.ts';
import type { WorldData } from '../world/types.ts';

/**
 * GPU copies of the world grids (ARCHITECTURE §3): height and shore SDF as R16F
 * (filterable in WebGL2 core, works under SwiftShader), zones as R8. Shared by
 * terrain (caustics/wet sand), water (depth ramp, foam) and clouds (shadow mask).
 * UV mapping: u = (x − originX) / (n − 1) / cellSize, v likewise for z.
 */
export interface WorldTextures {
  height: THREE.DataTexture;
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
  const sdfHalf = new Uint16Array(n * n);
  const sdfSmooth = smoothSdf(world.shoreSdf, n);
  for (let i = 0; i < n * n; i++) {
    heightHalf[i] = THREE.DataUtils.toHalfFloat(world.height.data[i]);
    sdfHalf[i] = THREE.DataUtils.toHalfFloat(Math.max(-200, Math.min(200, sdfSmooth[i])));
  }
  const mk = (
    data: Uint16Array | Uint8Array,
    type: THREE.TextureDataType,
    filter: THREE.MagnificationTextureFilter,
  ): THREE.DataTexture => {
    const t = new THREE.DataTexture(data, n, n, THREE.RedFormat, type);
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
  const sdf = mk(sdfHalf, THREE.HalfFloatType, THREE.LinearFilter);
  const zone = mk(world.zone, THREE.UnsignedByteType, THREE.NearestFilter);
  const extent = (n - 1) * world.height.cellSize;
  return {
    height,
    sdf,
    zone,
    uGridMap: { value: new THREE.Vector3(world.height.originX, world.height.originZ, 1 / extent) },
    update() {
      for (let i = 0; i < n * n; i++) {
        heightHalf[i] = THREE.DataUtils.toHalfFloat(world.height.data[i]);
        sdfHalf[i] = THREE.DataUtils.toHalfFloat(Math.max(-200, Math.min(200, world.shoreSdf[i])));
      }
      height.needsUpdate = true;
      sdf.needsUpdate = true;
      zone.needsUpdate = true;
    },
  };
}

/**
 * The EDT is exact to the 2 u land mask, so water bands inherit its staircase. A 3×3 tent blur
 * (water cells only, sign preserved) gives the ring edges a smooth gradient on the GPU copy.
 */
function smoothSdf(sdf: Float32Array, n: number): Float32Array {
  const out = new Float32Array(sdf);
  for (let z = 1; z < n - 1; z++) {
    for (let x = 1; x < n - 1; x++) {
      const i = z * n + x;
      if (sdf[i] > 0) continue;
      let acc = 0;
      let w = 0;
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          const k = (dx === 0 ? 2 : 1) * (dz === 0 ? 2 : 1);
          acc += sdf[i + dz * n + dx] * k;
          w += k;
        }
      }
      out[i] = Math.min(acc / w, -0.01);
    }
  }
  return out;
}

/** GLSL helper: sample a world grid texture at world xz. Expects `uniform vec3 uGridMap;`. */
export const GRID_SAMPLE_GLSL = /* glsl */ `
vec2 marGridUv(vec2 xz) { return (xz - uGridMap.xy) * uGridMap.z; }
float marSampleGrid(sampler2D t, vec2 xz) { return texture2D(t, marGridUv(xz)).r; }
`;
