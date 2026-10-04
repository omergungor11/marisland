import * as THREE from 'three';
import type { Scope } from '../core/scope.ts';
import type { WorldData } from '../world/types.ts';
import { Zone } from '../world/types.ts';
import type { DirtyRegion } from '../world/edit-types.ts';
import { edtNearest } from '../world/gen/coast.ts';
import { leewardness } from '../world/gen/heightfield.ts';
import { WATER_BANDS } from '../content/palette.ts';
import { WATER_SHADER } from '../content/water.ts';
import { EDIT_RENDER } from '../content/edit.ts';
import { TERRAIN_AO } from '../content/terrain.ts';
import {
  DirtyRect,
  rectFromBounds,
  uploadTextureRect,
  type SubImageRenderer,
  type TexRect,
  type UploadKind,
} from './gl-subimage.ts';

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
  return blurRing(ringScaleRaw(world, landMask(world)), n, n, world.height.cellSize);
}

/** 1 where `shoreSdf > 0` (the coast mask the ring field's nearest-coast search uses). */
export function landMask(world: WorldData): Uint8Array {
  const n = world.height.n;
  const land = new Uint8Array(n * n);
  for (let i = 0; i < n * n; i++) land[i] = world.shoreSdf[i] > 0 ? 1 : 0;
  return land;
}

/** Unblurred ring scale: 1 + k · leewardness of the island owning the nearest coast. */
export function ringScaleRaw(world: WorldData, land: Uint8Array): Float32Array {
  const n = world.height.n;
  const near = edtNearest(land, n, n, 1).nearest;
  const out = new Float32Array(n * n).fill(1);
  for (let iz = 0; iz < n; iz++) {
    for (let ix = 0; ix < n; ix++) {
      const i = iz * n + ix;
      out[i] = rawAt(world, land[i] === 1 ? i : near[i], ix, iz);
    }
  }
  return out;
}

function rawAt(world: WorldData, owner: number, ix: number, iz: number): number {
  const id = owner >= 0 ? world.islandMap[owner] : 0;
  const isl = id > 0 ? world.islands[id - 1] : undefined;
  if (!isl) return 1;
  const h = world.height;
  return (
    1 +
    (WATER_BANDS.leewardRingScale - 1) *
      leewardness(isl, world.windDir, h.originX + ix * h.cellSize, h.originZ + iz * h.cellSize)
  );
}

const blurRadius = (cell: number): number =>
  Math.max(1, Math.round(WATER_SHADER.ringScaleBlur / cell));

/** 3 × (rows, columns) box blur of a `w`×`h` field (clamped edges); returns a new array. */
function blurRing(raw: Float32Array, w: number, h: number, cell = 2): Float32Array {
  const r = blurRadius(cell);
  const out = raw.slice();
  const tmp = new Float32Array(w * h);
  for (let pass = 0; pass < 3; pass++) {
    boxBlur(out, tmp, w, h, r, 1, w); // rows
    boxBlur(tmp, out, h, w, r, w, 1); // columns
  }
  return out;
}

/**
 * 1-D box blur of `count` lines of `len` samples (clamped edges): `step` along a line, `stride`
 * between lines.
 */
function boxBlur(
  src: Float32Array,
  dst: Float32Array,
  len: number,
  count: number,
  r: number,
  step: number,
  stride: number,
): void {
  const w = 1 / (2 * r + 1);
  for (let l = 0; l < count; l++) {
    const base = l * stride;
    let acc = 0;
    for (let t = -r; t <= r; t++) acc += src[base + Math.min(len - 1, Math.max(0, t)) * step];
    for (let t = 0; t < len; t++) {
      dst[base + t * step] = acc * w;
      const add = Math.min(len - 1, t + r + 1);
      const sub = Math.max(0, t - r);
      acc += src[base + add * step] - src[base + sub * step];
    }
  }
}

/** CPU caches behind the ring-scale channel (kept for local updates after edits). */
export interface RingCache {
  land: Uint8Array;
  raw: Float32Array;
  ring: Float32Array;
}

export function createRingCache(world: WorldData): RingCache {
  const n = world.height.n;
  const land = landMask(world);
  const raw = ringScaleRaw(world, land);
  return { land, raw, ring: blurRing(raw, n, n, world.height.cellSize) };
}

/**
 * Local ring-scale update after an edit (TASK-211). Scans the cells around the dirty bounds for
 * coast-mask flips; with none, the field is unchanged (the owner of the nearest coast is all it
 * depends on). Otherwise the raw scale is re-derived within `ringPad` cells of the flips using a
 * nearest-coast search over a window `ringSearch` cells larger — exact wherever the nearest
 * coast lies inside that window (cells further out keep their value; they are ≥ 64 u from any
 * coast, beyond the visible bands) — and the blur is recomputed exactly over the affected rect
 * (3·r margin each way). Returns the texel rect whose ring value may have changed.
 */
export function updateRingRegion(
  world: WorldData,
  cache: RingCache,
  i0: number,
  i1: number,
  j0: number,
  j1: number,
): TexRect | null {
  const h = world.height;
  const n = h.n;
  // 1. coast-mask flips
  const flips = new DirtyRect();
  for (let j = Math.max(0, j0); j <= Math.min(n - 1, j1); j++)
    for (let i = Math.max(0, i0); i <= Math.min(n - 1, i1); i++) {
      const k = j * n + i;
      flips.set(cache.land, k, world.shoreSdf[k] > 0 ? 1 : 0, i, j);
    }
  const f = flips.rect;
  if (!f) return null;
  // 2. raw scale within W = flips + ringPad from a nearest-coast search over W' = W + ringSearch
  const W = rectFromBounds(f.x, f.x + f.w - 1, f.y, f.y + f.h - 1, n, EDIT_RENDER.ringPad)!;
  const S = rectFromBounds(W.x, W.x + W.w - 1, W.y, W.y + W.h - 1, n, EDIT_RENDER.ringSearch)!;
  const sub = new Uint8Array(S.w * S.h);
  for (let y = 0; y < S.h; y++)
    sub.set(cache.land.subarray((S.y + y) * n + S.x, (S.y + y) * n + S.x + S.w), y * S.w);
  const { dist, nearest } = edtNearest(sub, S.w, S.h, 1);
  // distance (cells) from a W cell to each window side that is not the grid edge
  const left = S.x > 0 ? S.x : -Infinity;
  const top = S.y > 0 ? S.y : -Infinity;
  const right = S.x + S.w - 1 < n - 1 ? S.x + S.w - 1 : Infinity;
  const bottom = S.y + S.h - 1 < n - 1 ? S.y + S.h - 1 : Infinity;
  for (let j = W.y; j < W.y + W.h; j++) {
    for (let i = W.x; i < W.x + W.w; i++) {
      const k = j * n + i;
      const sk = (j - S.y) * S.w + (i - S.x);
      let owner: number;
      if (cache.land[k] === 1) owner = k;
      else {
        const near = nearest[sk];
        const reach = Math.min(i - left, right - i, j - top, bottom - j);
        if (near < 0 || dist[sk] > reach) continue; // nearest coast may lie outside: keep
        owner = (S.y + Math.floor(near / S.w)) * n + S.x + (near % S.w);
      }
      cache.raw[k] = rawAt(world, owner, i, j);
    }
  }
  // 3. exact blur over B = W + 3r, computed on B + 3r (clamped like the full field at grid edges)
  const r3 = 3 * blurRadius(h.cellSize);
  const B = rectFromBounds(W.x, W.x + W.w - 1, W.y, W.y + W.h - 1, n, r3)!;
  const C = rectFromBounds(B.x, B.x + B.w - 1, B.y, B.y + B.h - 1, n, r3)!;
  const win = new Float32Array(C.w * C.h);
  for (let y = 0; y < C.h; y++)
    win.set(cache.raw.subarray((C.y + y) * n + C.x, (C.y + y) * n + C.x + C.w), y * C.w);
  const blurred = blurRing(win, C.w, C.h, h.cellSize);
  for (let j = B.y; j < B.y + B.h; j++)
    for (let i = B.x; i < B.x + B.w; i++)
      cache.ring[j * n + i] = blurred[(j - C.y) * C.w + (i - C.x)];
  return B;
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
  /**
   * Re-upload after a Phase 2 edit (TASK-211). With a region: only texels that changed inside
   * the dirty bounds (+ `sdfScanPad` for SDF / zones when `region.sdf`) are rewritten and sent
   * with `texSubImage2D` (fallback: full upload). Without: everything, full upload.
   */
  update(region?: DirtyRegion): TextureUpdateStats;
  /**
   * TASK-213 first-edit prewarm: run the ring-scale re-derivation (coast flip → nearest-coast
   * EDT window → blur) around sample (i, j) on scratch copies of the CPU caches. Nothing the
   * textures or later edits read is written.
   */
  prewarm(i: number, j: number): void;
}

export interface TextureUpdateStats {
  height: UploadKind;
  sdf: UploadKind;
  zone: UploadKind;
  /** Texel rects written (null = unchanged). `sdfRect` covers both channels. */
  heightRect: TexRect | null;
  sdfRect: TexRect | null;
  zoneRect: TexRect | null;
  /** Time spent in the GL sub-image calls (the rest of `update` is CPU work). */
  uploadMs: number;
  /** Samples whose float height changed (a change below half-float precision still moves the mesh). */
  geometryRect: TexRect | null;
  /**
   * Grid samples whose terrain colour inputs changed (TASK-211): heights ± the AO / slope
   * reach, zones, and shore distance on wet sand (the only zone whose colour reads the SDF).
   */
  colorRect: TexRect | null;
}

/** Samples away from a height change whose terrain colour can change (AO horizon, crease). */
export const COLOR_REACH = TERRAIN_AO.steps * TERRAIN_AO.stepCells;

const clampSdf = (v: number): number => Math.max(-200, Math.min(200, v));

export function createWorldTextures(
  world: WorldData,
  scope: Scope,
  renderer: SubImageRenderer | null = null,
): WorldTextures {
  const n = world.height.n;
  const heightHalf = new Uint16Array(n * n);
  const sdfHalf = new Uint16Array(n * n * 2);
  const zoneCopy = world.zone.slice();
  // float copies: change detection for geometry / colours (finer than the half-float texels)
  const heightF = world.height.data.slice();
  const sdfF = world.shoreSdf.slice();
  let ring = createRingCache(world);
  const fill = (): void => {
    ring = createRingCache(world);
    heightF.set(world.height.data);
    sdfF.set(world.shoreSdf);
    for (let i = 0; i < n * n; i++) {
      heightHalf[i] = THREE.DataUtils.toHalfFloat(world.height.data[i]);
      sdfHalf[i * 2] = THREE.DataUtils.toHalfFloat(clampSdf(world.shoreSdf[i]));
      sdfHalf[i * 2 + 1] = THREE.DataUtils.toHalfFloat(ring.ring[i]);
    }
    zoneCopy.set(world.zone);
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
  // zones as an R8 copy (the world array may be replaced or edited in place)
  const zone = mk(zoneCopy, THREE.UnsignedByteType, THREE.NearestFilter);
  const extent = (n - 1) * world.height.cellSize;
  const hRect = new DirtyRect();
  const sRect = new DirtyRect();
  const zRect = new DirtyRect();
  const cRect = new DirtyRect();
  const gRect = new DirtyRect();
  return {
    height,
    sdf,
    zone,
    uGridMap: { value: new THREE.Vector3(world.height.originX, world.height.originZ, 1 / extent) },
    prewarm(i, j) {
      const scratch: RingCache = {
        land: ring.land.slice(),
        raw: ring.raw.slice(),
        ring: ring.ring.slice(),
      };
      const k = Math.min(n - 1, Math.max(0, j)) * n + Math.min(n - 1, Math.max(0, i));
      scratch.land[k] ^= 1; // a fake coast flip: the full update path runs on the scratch copy
      updateRingRegion(world, scratch, i, i, j, j);
    },
    update(region) {
      if (!region) {
        fill();
        height.needsUpdate = true;
        sdf.needsUpdate = true;
        zone.needsUpdate = true;
        const all = { x: 0, y: 0, w: n, h: n };
        return {
          height: 'full',
          sdf: 'full',
          zone: 'full',
          heightRect: all,
          sdfRect: all,
          zoneRect: all,
          geometryRect: all,
          colorRect: all,
          uploadMs: 0,
        };
      }
      hRect.clear();
      sRect.clear();
      zRect.clear();
      cRect.clear();
      gRect.clear();
      const hb = rectFromBounds(region.minI, region.maxI, region.minJ, region.maxJ, n, 1);
      if (hb) {
        const d = world.height.data;
        for (let j = hb.y; j < hb.y + hb.h; j++)
          for (let i = hb.x; i < hb.x + hb.w; i++) {
            const k = j * n + i;
            if (gRect.set(heightF, k, d[k], i, j))
              hRect.set(heightHalf, k, THREE.DataUtils.toHalfFloat(d[k]), i, j);
          }
      }
      // SDF / zones may change beyond the brush (local EDT, zone re-derivation): scan a margin
      const pad = region.sdf ? EDIT_RENDER.sdfScanPad : 1;
      const sb = rectFromBounds(region.minI, region.maxI, region.minJ, region.maxJ, n, pad);
      if (sb) {
        for (let j = sb.y; j < sb.y + sb.h; j++)
          for (let i = sb.x; i < sb.x + sb.w; i++) {
            const k = j * n + i;
            if (zRect.set(zoneCopy, k, world.zone[k], i, j)) cRect.mark(i, j);
            if (!region.sdf || sdfF[k] === world.shoreSdf[k]) continue;
            sdfF[k] = world.shoreSdf[k];
            sRect.set(sdfHalf, k * 2, THREE.DataUtils.toHalfFloat(clampSdf(sdfF[k])), i, j);
            if (world.zone[k] === Zone.sandWet) cRect.mark(i, j);
          }
        if (region.sdf) {
          const rr = updateRingRegion(world, ring, sb.x, sb.x + sb.w - 1, sb.y, sb.y + sb.h - 1);
          if (rr) {
            const rc = ring;
            for (let j = rr.y; j < rr.y + rr.h; j++)
              for (let i = rr.x; i < rr.x + rr.w; i++) {
                const k = j * n + i;
                sRect.set(sdfHalf, k * 2 + 1, THREE.DataUtils.toHalfFloat(rc.ring[k]), i, j);
              }
          }
        }
      }
      const heightRect = hRect.rect;
      const sdfRect = sRect.rect;
      const zoneRect = zRect.rect;
      const geometryRect = gRect.rect;
      if (geometryRect) {
        const g = geometryRect;
        const r = rectFromBounds(g.x, g.x + g.w - 1, g.y, g.y + g.h - 1, n, COLOR_REACH)!;
        cRect.mark(r.x, r.y);
        cRect.mark(r.x + r.w - 1, r.y + r.h - 1);
      }
      const tGl = performance.now();
      const up = {
        height: uploadTextureRect(renderer, height, heightRect),
        sdf: uploadTextureRect(renderer, sdf, sdfRect),
        zone: uploadTextureRect(renderer, zone, zoneRect),
      };
      return {
        ...up,
        uploadMs: performance.now() - tGl,
        heightRect,
        sdfRect,
        zoneRect,
        geometryRect,
        colorRect: cRect.rect,
      };
    },
  };
}

/** GLSL helper: sample a world grid texture at world xz. Expects `uniform vec3 uGridMap;`. */
export const GRID_SAMPLE_GLSL = /* glsl */ `
vec2 marGridUv(vec2 xz) { return (xz - uGridMap.xy) * uGridMap.z; }
float marSampleGrid(sampler2D t, vec2 xz) { return texture2D(t, marGridUv(xz)).r; }
`;
