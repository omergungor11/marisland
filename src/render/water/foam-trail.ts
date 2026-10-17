import * as THREE from 'three';
import type { Scope } from '../../core/scope.ts';

/**
 * Foam-trail texture (ARCHITECTURE §3; TASK-472 B4): one RGBA8 DataTexture over the archipelago
 * that boats and ripples stamp into on the CPU. Per texel: R = stamp profile (1 − r² / R², the
 * freshest stamp wins), G = age 0..1 of that stamp's own life, B = gain. The water shader turns
 * profile + age into a disc that widens (threshold drops with age) and fades; the CPU only ages
 * the texels (Float32 mirrors keep it smooth) by elapsed render time, inside the bounding box of
 * the live texels, and uploads once per fixed step.
 */
export interface FoamTrail {
  texture: THREE.DataTexture;
  /** xy = world origin, z = 1 / world extent — same convention as WorldTextures.uGridMap. */
  uMap: { value: THREE.Vector3 };
  /** Stamp a disc that lives `life` s (default `o.life`), starting at age `age0` 0..1. */
  splat(x: number, z: number, radius: number, strength: number, life?: number, age0?: number): void;
  /** Advance ageing to `time` (seconds). */
  step(time: number): void;
  /** Visible amplitude 0..1 (profile × (1 − age) × gain) at a texel (tests/debug). */
  sample(x: number, z: number): number;
  /** Age 0..1 at a texel (tests/debug). */
  ageAt(x: number, z: number): number;
  readonly active: boolean;
}

export interface FoamTrailOptions {
  size: number;
  /** Half extent in u: covers −extent … +extent. */
  extent: number;
  stepSec: number;
  /** Default stamp life (s). */
  life: number;
}

export function createFoamTrail(o: FoamTrailOptions, scope?: Scope): FoamTrail {
  const n = o.size;
  const prof = new Float32Array(n * n);
  const age = new Float32Array(n * n).fill(1);
  const rate = new Float32Array(n * n);
  const gain = new Float32Array(n * n);
  const bytes = new Uint8Array(n * n * 4);
  const texture = new THREE.DataTexture(bytes, n, n, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.colorSpace = THREE.NoColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.generateMipmaps = false;
  texture.flipY = false;
  texture.needsUpdate = true;
  scope?.add(texture);

  const span = 2 * o.extent;
  const texel = span / n;
  let active = false;
  let dirty = false;
  let lastTime = Number.NaN;
  let acc = 0;
  // bounding box of the live texels (inclusive); empty when x0 > x1
  let bx0 = n;
  let bx1 = -1;
  let bz0 = n;
  let bz1 = -1;

  const upload = (): void => {
    let any = false;
    let nx0 = n;
    let nx1 = -1;
    let nz0 = n;
    let nz1 = -1;
    for (let j = bz0; j <= bz1; j++) {
      for (let i = bx0; i <= bx1; i++) {
        const k = j * n + i;
        const a = age[k];
        if (a >= 1 || prof[k] <= 0) {
          prof[k] = 0;
          age[k] = 1;
          bytes[k * 4] = 0;
          bytes[k * 4 + 1] = 255;
          bytes[k * 4 + 2] = 0;
          continue;
        }
        any = true;
        if (i < nx0) nx0 = i;
        if (i > nx1) nx1 = i;
        if (j < nz0) nz0 = j;
        if (j > nz1) nz1 = j;
        bytes[k * 4] = Math.min(255, Math.round(prof[k] * 255));
        bytes[k * 4 + 1] = Math.min(255, Math.round(a * 255));
        bytes[k * 4 + 2] = Math.min(255, Math.round(gain[k] * 255));
      }
    }
    bx0 = nx0;
    bx1 = nx1;
    bz0 = nz0;
    bz1 = nz1;
    active = any;
    dirty = false;
    texture.needsUpdate = true;
  };

  const idx = (x: number, z: number): number => {
    const i = Math.min(n - 1, Math.max(0, Math.floor((x + o.extent) / texel)));
    const j = Math.min(n - 1, Math.max(0, Math.floor((z + o.extent) / texel)));
    return j * n + i;
  };

  return {
    texture,
    uMap: { value: new THREE.Vector3(-o.extent, -o.extent, 1 / span) },
    get active() {
      return active;
    },
    splat(x, z, radius, strength, life = o.life, age0 = 0) {
      if (age0 >= 1 || strength <= 0) return;
      const cx = (x + o.extent) / texel - 0.5;
      const cz = (z + o.extent) / texel - 0.5;
      const r = Math.max(radius / texel, 0.75);
      const x0 = Math.max(0, Math.floor(cx - r));
      const x1 = Math.min(n - 1, Math.ceil(cx + r));
      const z0 = Math.max(0, Math.floor(cz - r));
      const z1 = Math.min(n - 1, Math.ceil(cz + r));
      if (x0 > x1 || z0 > z1) return;
      const rt = 1 / Math.max(life, 1e-3);
      const g = Math.min(1, strength);
      for (let j = z0; j <= z1; j++) {
        for (let i = x0; i <= x1; i++) {
          const q = ((i - cx) ** 2 + (j - cz) ** 2) / (r * r);
          if (q >= 1) continue;
          const k = j * n + i;
          const v = 1 - q;
          // the stamp with the larger visible amplitude owns the texel
          if (v * (1 - age0) * g < prof[k] * (1 - age[k]) * gain[k]) continue;
          prof[k] = v;
          age[k] = age0;
          rate[k] = rt;
          gain[k] = g;
        }
      }
      if (x0 < bx0) bx0 = x0;
      if (x1 > bx1) bx1 = x1;
      if (z0 < bz0) bz0 = z0;
      if (z1 > bz1) bz1 = z1;
      active = true;
      dirty = true;
    },
    step(time) {
      if (!Number.isFinite(lastTime) || time < lastTime) {
        lastTime = time;
        if (dirty) upload();
        return;
      }
      acc += time - lastTime;
      lastTime = time;
      const steps = Math.floor(acc / o.stepSec);
      if (steps <= 0) {
        if (dirty) upload();
        return;
      }
      acc -= steps * o.stepSec;
      if (!active) return;
      const dt = steps * o.stepSec;
      for (let j = bz0; j <= bz1; j++)
        for (let i = bx0; i <= bx1; i++) {
          const k = j * n + i;
          if (prof[k] > 0) age[k] = Math.min(1, age[k] + dt * rate[k]);
        }
      upload();
    },
    sample(x, z) {
      const k = idx(x, z);
      return prof[k] * (1 - age[k]) * gain[k];
    },
    ageAt(x, z) {
      return age[idx(x, z)];
    },
  };
}
