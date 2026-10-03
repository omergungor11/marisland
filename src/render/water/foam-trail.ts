import * as THREE from 'three';
import type { Scope } from '../../core/scope.ts';

/**
 * Foam-trail texture (ARCHITECTURE §3): one R8 DataTexture over the archipelago that
 * boats (M6) and ripples stamp into on the CPU; decays ×`decay` per fixed step of
 * render time. A Float32 mirror keeps the decay smooth (u8 rounding would stall).
 */
export interface FoamTrail {
  texture: THREE.DataTexture;
  /** xy = world origin, z = 1 / world extent — same convention as WorldTextures.uGridMap. */
  uMap: { value: THREE.Vector3 };
  splat(x: number, z: number, radius: number, strength: number): void;
  /** Advance decay to `time` (seconds). */
  step(time: number): void;
  /** Value 0..1 at a texel (tests/debug). */
  sample(x: number, z: number): number;
  readonly active: boolean;
}

export interface FoamTrailOptions {
  size: number;
  /** Half extent in u: covers −extent … +extent. */
  extent: number;
  decayPerStep: number;
  stepSec: number;
}

export function createFoamTrail(o: FoamTrailOptions, scope?: Scope): FoamTrail {
  const n = o.size;
  const values = new Float32Array(n * n);
  const bytes = new Uint8Array(n * n);
  const texture = new THREE.DataTexture(bytes, n, n, THREE.RedFormat, THREE.UnsignedByteType);
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
  let lastTime = Number.NaN;
  let acc = 0;

  const upload = (): void => {
    let any = false;
    for (let i = 0; i < values.length; i++) {
      let v = values[i];
      if (v < 1 / 512) v = values[i] = 0;
      else any = true;
      bytes[i] = Math.min(255, Math.round(v * 255));
    }
    active = any;
    texture.needsUpdate = true;
  };

  return {
    texture,
    uMap: { value: new THREE.Vector3(-o.extent, -o.extent, 1 / span) },
    get active() {
      return active;
    },
    splat(x, z, radius, strength) {
      const cx = (x + o.extent) / texel - 0.5;
      const cz = (z + o.extent) / texel - 0.5;
      const r = Math.max(radius / texel, 0.75);
      const x0 = Math.max(0, Math.floor(cx - r));
      const x1 = Math.min(n - 1, Math.ceil(cx + r));
      const z0 = Math.max(0, Math.floor(cz - r));
      const z1 = Math.min(n - 1, Math.ceil(cz + r));
      if (x0 > x1 || z0 > z1) return;
      for (let j = z0; j <= z1; j++) {
        for (let i = x0; i <= x1; i++) {
          const q = ((i - cx) ** 2 + (j - cz) ** 2) / (r * r);
          if (q >= 1) continue;
          const k = j * n + i;
          values[k] = Math.min(1, values[k] + strength * (1 - q));
        }
      }
      upload();
    },
    step(time) {
      if (!Number.isFinite(lastTime) || time < lastTime) {
        lastTime = time;
        return;
      }
      acc += time - lastTime;
      lastTime = time;
      const steps = Math.floor(acc / o.stepSec);
      if (steps <= 0) return;
      acc -= steps * o.stepSec;
      if (!active) return;
      const f = Math.pow(o.decayPerStep, steps);
      for (let i = 0; i < values.length; i++) values[i] *= f;
      upload();
    },
    sample(x, z) {
      const i = Math.min(n - 1, Math.max(0, Math.floor((x + o.extent) / texel)));
      const j = Math.min(n - 1, Math.max(0, Math.floor((z + o.extent) / texel)));
      return values[j * n + i];
    },
  };
}
