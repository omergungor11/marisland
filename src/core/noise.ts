import {
  createNoise2D,
  createNoise3D,
  type NoiseFunction2D,
  type NoiseFunction3D,
} from 'simplex-noise';
import type { Rng } from './rng.ts';

/** Seeded 2D/3D simplex noise plus the usual fbm / warp / ridge helpers. */
export interface Noise {
  n2: NoiseFunction2D;
  n3: NoiseFunction3D;
  /** Fractal Brownian motion in [-1, 1]. */
  fbm(x: number, y: number, octaves: number, lacunarity?: number, gain?: number): number;
  /** Ridged multifractal in [0, 1]. */
  ridged(x: number, y: number, octaves: number): number;
  /** Domain-warped fbm in [-1, 1]. */
  warped(x: number, y: number, octaves: number, warp: number): number;
}

export function createNoise(rng: Rng): Noise {
  const r = rng.fork('noise');
  const next = (): number => r.next();
  const n2 = createNoise2D(next);
  const n3 = createNoise3D(next);
  const fbm = (x: number, y: number, octaves: number, lacunarity = 2, gain = 0.5): number => {
    let amp = 1;
    let sum = 0;
    let norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += n2(x, y) * amp;
      norm += amp;
      amp *= gain;
      x *= lacunarity;
      y *= lacunarity;
    }
    return sum / norm;
  };
  const ridged = (x: number, y: number, octaves: number): number => {
    let amp = 1;
    let sum = 0;
    let norm = 0;
    for (let i = 0; i < octaves; i++) {
      const v = 1 - Math.abs(n2(x, y));
      sum += v * v * amp;
      norm += amp;
      amp *= 0.5;
      x *= 2;
      y *= 2;
    }
    return sum / norm;
  };
  const warped = (x: number, y: number, octaves: number, warp: number): number => {
    const wx = fbm(x + 5.2, y + 1.3, 2);
    const wy = fbm(x + 1.7, y + 9.2, 2);
    return fbm(x + wx * warp, y + wy * warp, octaves);
  };
  return { n2, n3, fbm, ridged, warped };
}
