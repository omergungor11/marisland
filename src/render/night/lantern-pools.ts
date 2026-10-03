import * as THREE from 'three';
import type { Scope } from '../../core/scope.ts';
import { PROP_DEFS } from '../../content/props.ts';
import { POOLS } from '../../content/lighting.ts';
import type { PropStore } from '../../world/prop-store.ts';
import { SHARED } from '../uniforms.ts';
import { POOL_HEIGHT_RANGE } from '../shaders/chunks/night.glsl.ts';

/**
 * Lantern pools (TASK-171, ARCHITECTURE §7 "Night": additive decals, not point lights).
 * Every pool source (lantern posts, stalls, house doors … content POOLS.sources) is splatted
 * on the CPU into one small RG8 world texture: R = light (soft gaussian-ish falloff with a
 * wobbly rim so pools never read as discs), G = the pool's ground height / POOL_HEIGHT_RANGE
 * (props fade the light out with height above it). Terrain, props and water add
 * `albedo × poolColor × R × lamps` — one texture fetch, no extra program, no draw call.
 */
export interface LanternPools {
  texture: THREE.DataTexture | null;
  /** Number of splatted sources (debug/HUD). */
  count: number;
}

interface Source {
  x: number;
  z: number;
  y: number;
  r: number;
  k: number;
}

const hash01 = (x: number, z: number): number => {
  const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return s - Math.floor(s);
};

/** Collect pool sources from the prop store (pure; exported for tests). */
export function collectPoolSources(props: PropStore): Source[] {
  const out: Source[] = [];
  for (let i = 0; i < props.count; i++) {
    const def = PROP_DEFS[props.defId[i]];
    const src = def ? POOLS.sources[def.geo] : undefined;
    if (!src) continue;
    const rot = props.rotY[i];
    const sc = props.scale[i] || 1;
    // geometry doors face local +z → world (sin rotY, cos rotY)
    out.push({
      x: props.x[i] + Math.sin(rot) * src.offset * sc,
      z: props.z[i] + Math.cos(rot) * src.offset * sc,
      y: props.y[i],
      r: src.radius * sc,
      k: src.intensity,
    });
  }
  return out;
}

/** Splat sources into RG8 data (R light 0..255, G height). Pure; exported for tests. */
export function splatPools(
  sources: readonly Source[],
): { data: Uint8Array; size: number; originX: number; originZ: number; extent: number } | null {
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
  const texel = extent / size;
  const light = new Float32Array(size * size);
  const hSum = new Float32Array(size * size);
  const wSum = new Float32Array(size * size);
  for (const s of sources) {
    const rMax = s.r * (1 + POOLS.wobble);
    const i0 = Math.max(0, Math.floor((s.x - rMax - minX) / texel));
    const i1 = Math.min(size - 1, Math.ceil((s.x + rMax - minX) / texel));
    const j0 = Math.max(0, Math.floor((s.z - rMax - minZ) / texel));
    const j1 = Math.min(size - 1, Math.ceil((s.z + rMax - minZ) / texel));
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
        // bright core, long soft tail, zero at the (wobbly) rim
        const edge = 1 - t * t;
        const v = s.k * Math.exp(-2.6 * t * t) * edge * edge;
        const k = j * size + i;
        light[k] += v;
        hSum[k] += v * s.y;
        wSum[k] += v;
      }
    }
  }
  const data = new Uint8Array(size * size * 2);
  for (let k = 0; k < size * size; k++) {
    // soft clamp so overlapping pools saturate gracefully instead of clipping
    const l = 1 - Math.exp(-1.6 * light[k]);
    data[k * 2] = Math.round(Math.min(1, l / (1 - Math.exp(-1.6))) * 255);
    const h = wSum[k] > 0 ? hSum[k] / wSum[k] : 0;
    data[k * 2 + 1] = Math.round(Math.min(1, Math.max(0, h / POOL_HEIGHT_RANGE)) * 255);
  }
  return { data, size, originX: minX, originZ: minZ, extent };
}

/** Build the pool texture for this world and bind it to SHARED (reset on dispose). */
export function createLanternPools(props: PropStore, scope: Scope): LanternPools {
  const sources = collectPoolSources(props);
  const splat = splatPools(sources);
  if (!splat) {
    SHARED.uPoolTex.value = null;
    SHARED.uPoolMap.value.set(0, 0, 1, 0);
    return { texture: null, count: 0 };
  }
  const tex = new THREE.DataTexture(
    splat.data,
    splat.size,
    splat.size,
    THREE.RGFormat,
    THREE.UnsignedByteType,
  );
  tex.colorSpace = THREE.NoColorSpace;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.generateMipmaps = false;
  tex.flipY = false;
  tex.unpackAlignment = 2;
  tex.needsUpdate = true;
  tex.name = 'lantern-pools';
  scope.add(tex);
  SHARED.uPoolTex.value = tex;
  SHARED.uPoolMap.value.set(splat.originX, splat.originZ, 1 / splat.extent, 1);
  scope.defer(() => {
    if (SHARED.uPoolTex.value === tex) {
      SHARED.uPoolTex.value = null;
      SHARED.uPoolMap.value.set(0, 0, 1, 0);
    }
  });
  return { texture: tex, count: sources.length };
}
