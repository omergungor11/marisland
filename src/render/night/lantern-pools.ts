import * as THREE from 'three';
import type { Scope } from '../../core/scope.ts';
import { PROP_DEFS } from '../../content/props.ts';
import { POOLS } from '../../content/lighting.ts';
import { PropFlag, type PropStore } from '../../world/prop-store.ts';
import { SHARED } from '../uniforms.ts';
import { POOL_HEIGHT_RANGE } from '../shaders/chunks/night.glsl.ts';
import {
  unionRect,
  uploadTextureRect,
  type SubImageRenderer,
  type TexRect,
} from '../gl-subimage.ts';

/**
 * Lantern pools (TASK-171, ARCHITECTURE §7 "Night": additive decals, not point lights).
 * Every pool source (lantern posts, stalls, house doors … content POOLS.sources) is splatted
 * on the CPU into one small RG8 world texture: R = light (small core, long quadratic tail and a
 * wobbly rim so pools never read as discs), G = the pool's ground height / POOL_HEIGHT_RANGE
 * (props fade the light out with height above it). Terrain, props and water add
 * `albedo × poolColor × R × lamps` — one texture fetch, no extra program, no draw call.
 *
 * Edits (TASK-213): `update(indices)` re-derives the sources of the touched render-store
 * indices; when one changed, only the texels under the old and new pools are re-splatted (from
 * every source overlapping them, in store order — bit-identical to a fresh splat over the same
 * layout) and uploaded with `texSubImage2D`. A pool outside the texture's extent rebuilds the
 * texture with a new layout (rare: the extent covers every source of the generated world).
 */
export interface LanternPools {
  texture: THREE.DataTexture | null;
  /** Number of splatted sources (debug/HUD). */
  count: number;
  /** Re-splat after an edit touched render-store indices `indices` (TASK-213). */
  update(indices: readonly number[]): PoolUpdate;
}

export interface PoolUpdate {
  /** none: no pool changed; sub: texels re-splatted in place; rebuild: new texture / layout. */
  kind: 'none' | 'sub' | 'rebuild';
  /** Texel rect re-splatted ('sub'). */
  rect: TexRect | null;
}

export interface PoolSource {
  x: number;
  z: number;
  y: number;
  r: number;
  k: number;
}

/** Texture placement of the splat (world square [origin, origin + extent]², `size`² texels). */
export interface PoolLayout {
  size: number;
  originX: number;
  originZ: number;
  extent: number;
}

const hash01 = (x: number, z: number): number => {
  const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return s - Math.floor(s);
};

/** Pool light at t = distance / radius (0 → peak, 1 → 0); content POOLS.falloff. */
export function poolFalloff(t: number): number {
  if (t >= 1) return 0;
  const F = POOLS.falloff;
  const q = t / F.core;
  return (F.peak / (1 + q * q)) * Math.pow(1 - t * t, F.window);
}

/** Pool source of store index `i`, or null (no pool def, removed). Pure. */
export function poolSourceOf(props: PropStore, i: number): PoolSource | null {
  if (i < 0 || i >= props.count || props.flags[i] & PropFlag.removed) return null;
  const def = PROP_DEFS[props.defId[i]];
  const src = def ? POOLS.sources[def.geo] : undefined;
  if (!src) return null;
  const rot = props.rotY[i];
  const sc = props.scale[i] || 1;
  // geometry doors face local +z → world (sin rotY, cos rotY)
  return {
    x: props.x[i] + Math.sin(rot) * src.offset * sc,
    z: props.z[i] + Math.cos(rot) * src.offset * sc,
    y: props.y[i],
    r: src.radius * sc,
    k: src.intensity,
  };
}

/** Collect pool sources from the prop store, in store order (pure; exported for tests). */
export function collectPoolSources(props: PropStore): PoolSource[] {
  const out: PoolSource[] = [];
  for (let i = 0; i < props.count; i++) {
    const s = poolSourceOf(props, i);
    if (s) out.push(s);
  }
  return out;
}

/** Splat layout fitted to `sources` (null without sources). */
export function poolLayout(sources: readonly PoolSource[]): PoolLayout | null {
  if (sources.length === 0) return null;
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  for (const s of sources) {
    const r = s.r * (1 + POOLS.wobble) + 2;
    minX = Math.min(minX, s.x - r);
    minZ = Math.min(minZ, s.z - r);
    maxX = Math.max(maxX, s.x + r);
    maxZ = Math.max(maxZ, s.z + r);
  }
  const extent = Math.max(maxX - minX, maxZ - minZ, 8);
  const size = Math.min(1024, Math.max(8, Math.ceil(extent * POOLS.texelsPerUnit)));
  return { size, originX: minX, originZ: minZ, extent };
}

/** Texel window a source writes (clamped), or null when it lies outside the layout. */
function texelsOf(s: PoolSource, L: PoolLayout): TexRect | null {
  const texel = L.extent / L.size;
  const rMax = s.r * (1 + POOLS.wobble);
  const i0 = Math.max(0, Math.floor((s.x - rMax - L.originX) / texel));
  const i1 = Math.min(L.size - 1, Math.ceil((s.x + rMax - L.originX) / texel));
  const j0 = Math.max(0, Math.floor((s.z - rMax - L.originZ) / texel));
  const j1 = Math.min(L.size - 1, Math.ceil((s.z + rMax - L.originZ) / texel));
  if (i1 < i0 || j1 < j0) return null;
  return { x: i0, y: j0, w: i1 - i0 + 1, h: j1 - j0 + 1 };
}

/** True when the whole pool of `s` lies inside the layout's square. */
export function poolInside(s: PoolSource, L: PoolLayout): boolean {
  const rMax = s.r * (1 + POOLS.wobble);
  return (
    s.x - rMax >= L.originX &&
    s.z - rMax >= L.originZ &&
    s.x + rMax <= L.originX + L.extent &&
    s.z + rMax <= L.originZ + L.extent
  );
}

/**
 * Splat `sources` into the texels of `rect` of RG8 `data` (R light 0..255, G height); texels
 * outside `rect` are untouched. Per texel the sources accumulate in array order, so a sub-rect
 * equals the same texels of a full splat. Pure; exported for tests.
 */
export function splatPoolsRect(
  sources: readonly PoolSource[],
  L: PoolLayout,
  rect: TexRect,
  data: Uint8Array,
): void {
  const { size, originX: minX, originZ: minZ } = L;
  const texel = L.extent / size;
  const w = rect.w;
  const light = new Float32Array(rect.w * rect.h);
  const hSum = new Float32Array(rect.w * rect.h);
  const wSum = new Float32Array(rect.w * rect.h);
  const rx1 = rect.x + rect.w - 1;
  const ry1 = rect.y + rect.h - 1;
  for (const s of sources) {
    const rMax = s.r * (1 + POOLS.wobble);
    const i0 = Math.max(rect.x, Math.floor((s.x - rMax - minX) / texel));
    const i1 = Math.min(rx1, Math.ceil((s.x + rMax - minX) / texel));
    const j0 = Math.max(rect.y, Math.floor((s.z - rMax - minZ) / texel));
    const j1 = Math.min(ry1, Math.ceil((s.z + rMax - minZ) / texel));
    if (i1 < i0 || j1 < j0) continue;
    const phase = hash01(s.x, s.z) * Math.PI * 2;
    for (let j = j0; j <= j1; j++) {
      const wz = minZ + (j + 0.5) * texel - s.z;
      for (let i = i0; i <= i1; i++) {
        const wx = minX + (i + 0.5) * texel - s.x;
        const d = Math.hypot(wx, wz);
        const a = Math.atan2(wz, wx);
        // two incommensurate harmonics → organic rim, never a clean disc or a lobed flower
        const wob =
          0.65 * Math.sin(POOLS.wobbleFreq * a + phase) +
          0.35 * Math.sin((POOLS.wobbleFreq + 2) * a - phase * 1.7);
        const rr = s.r * (1 + POOLS.wobble * wob);
        const t = d / rr;
        if (t >= 1) continue;
        // small bright core, long quadratic tail, zero at the (wobbly) rim (D14)
        const v = s.k * poolFalloff(t);
        const k = (j - rect.y) * w + (i - rect.x);
        light[k] += v;
        hSum[k] += v * s.y;
        wSum[k] += v;
      }
    }
  }
  for (let j = 0; j < rect.h; j++)
    for (let i = 0; i < rect.w; i++) {
      const k = j * w + i;
      const o = ((rect.y + j) * size + rect.x + i) * 2;
      // soft clamp so overlapping pools saturate gracefully instead of clipping
      const l = 1 - Math.exp(-1.6 * light[k]);
      data[o] = Math.round(Math.min(1, l / (1 - Math.exp(-1.6))) * 255);
      const h = wSum[k] > 0 ? hSum[k] / wSum[k] : 0;
      data[o + 1] = Math.round(Math.min(1, Math.max(0, h / POOL_HEIGHT_RANGE)) * 255);
    }
}

/** Splat sources into RG8 data (R light 0..255, G height). Pure; exported for tests. */
export function splatPools(
  sources: readonly PoolSource[],
): { data: Uint8Array; size: number; originX: number; originZ: number; extent: number } | null {
  const L = poolLayout(sources);
  if (!L) return null;
  const data = new Uint8Array(L.size * L.size * 2);
  splatPoolsRect(sources, L, { x: 0, y: 0, w: L.size, h: L.size }, data);
  return { data, ...L };
}

/**
 * Per-index source bookkeeping for edits (pure): `touch(indices)` re-reads the sources of the
 * touched store indices and returns what the texture must do. Exported for tests.
 */
export class PoolSources {
  /** Source per store index (null = none). */
  private srcs: (PoolSource | null)[] = [];

  constructor(private readonly props: PropStore) {
    for (let i = 0; i < props.count; i++) this.srcs.push(poolSourceOf(props, i));
  }

  /** Sources in store order. */
  list(): PoolSource[] {
    const out: PoolSource[] = [];
    for (const s of this.srcs) if (s) out.push(s);
    return out;
  }

  /**
   * Re-read `indices`. `rect`: texels under every changed pool (old and new) in `layout`;
   * `outside`: a changed pool does not fit the layout (or there is none) → rebuild.
   */
  touch(
    indices: readonly number[],
    layout: PoolLayout | null,
  ): { changed: boolean; rect: TexRect | null; outside: boolean } {
    let changed = false;
    let rect: TexRect | null = null;
    let outside = false;
    for (const i of indices) {
      if (i < 0) continue;
      while (this.srcs.length < this.props.count) this.srcs.push(null);
      const old = i < this.srcs.length ? this.srcs[i] : null;
      const nu = poolSourceOf(this.props, i);
      if (sameSource(old, nu)) continue;
      changed = true;
      if (i < this.srcs.length) this.srcs[i] = nu;
      for (const s of [old, nu]) {
        if (!s) continue;
        if (!layout || !poolInside(s, layout)) {
          // a removed pool outside the layout left no texels; a new one needs a new layout
          if (s === nu) outside = true;
          continue;
        }
        rect = unionRect(rect, texelsOf(s, layout));
      }
    }
    return { changed, rect, outside };
  }
}

const sameSource = (a: PoolSource | null, b: PoolSource | null): boolean =>
  a === b ||
  (!!a && !!b && a.x === b.x && a.z === b.z && a.y === b.y && a.r === b.r && a.k === b.k);

/**
 * Build the pool texture for this world and bind it to SHARED (reset on dispose). `renderer`:
 * sub-rect uploads after edits (null → full re-uploads).
 */
export function createLanternPools(
  props: PropStore,
  scope: Scope,
  renderer: SubImageRenderer | null = null,
): LanternPools {
  const book = new PoolSources(props);
  let layout: PoolLayout | null = null;
  let tex: THREE.DataTexture | null = null;
  const view: LanternPools = { texture: null, count: 0, update };

  const bind = (sources: readonly PoolSource[]): void => {
    const old = tex;
    const splat = splatPools(sources);
    view.count = sources.length;
    if (!splat) {
      layout = null;
      tex = null;
      SHARED.uPoolTex.value = null;
      SHARED.uPoolMap.value.set(0, 0, 1, 0);
    } else {
      layout = {
        size: splat.size,
        originX: splat.originX,
        originZ: splat.originZ,
        extent: splat.extent,
      };
      const t = new THREE.DataTexture(
        splat.data,
        splat.size,
        splat.size,
        THREE.RGFormat,
        THREE.UnsignedByteType,
      );
      t.colorSpace = THREE.NoColorSpace;
      t.magFilter = THREE.LinearFilter;
      t.minFilter = THREE.LinearFilter;
      t.wrapS = THREE.ClampToEdgeWrapping;
      t.wrapT = THREE.ClampToEdgeWrapping;
      t.generateMipmaps = false;
      t.flipY = false;
      t.unpackAlignment = 2;
      t.needsUpdate = true;
      t.name = 'lantern-pools';
      tex = t;
      SHARED.uPoolTex.value = t;
      SHARED.uPoolMap.value.set(splat.originX, splat.originZ, 1 / splat.extent, 1);
    }
    view.texture = tex;
    old?.dispose();
  };

  function update(indices: readonly number[]): PoolUpdate {
    const t = book.touch(indices, layout);
    if (!t.changed) return { kind: 'none', rect: null };
    if (t.outside || !tex || !layout) {
      bind(book.list());
      return { kind: 'rebuild', rect: null };
    }
    if (!t.rect) return { kind: 'none', rect: null };
    splatPoolsRect(book.list(), layout, t.rect, tex.image.data as Uint8Array);
    uploadTextureRect(renderer, tex, t.rect);
    return { kind: 'sub', rect: t.rect };
  }

  bind(book.list());
  scope.defer(() => {
    if (tex && SHARED.uPoolTex.value === tex) {
      SHARED.uPoolTex.value = null;
      SHARED.uPoolMap.value.set(0, 0, 1, 0);
    }
    tex?.dispose();
    tex = null;
  });
  return view;
}
