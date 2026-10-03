/** Spring + easing helpers (cute-motion skill). Pure math, no allocation in hot paths. */

export interface Spring {
  x: number;
  v: number;
}

export const makeSpring = (x = 0, v = 0): Spring => ({ x, v });

/** Damped spring toward `target`, substepped at 120 Hz and dt-clamped to 0.1 s. */
export function stepSpring(s: Spring, target: number, k: number, c: number, dt: number): void {
  const d = Math.min(Math.max(dt, 0), 0.1);
  if (d === 0) return;
  const steps = Math.max(1, Math.ceil(d / (1 / 120)));
  const h = d / steps;
  for (let i = 0; i < steps; i++) {
    s.v += (-k * (s.x - target) - c * s.v) * h;
    s.x += s.v * h;
  }
}

/** Frame-rate independent smoothing. */
export const damp = (a: number, b: number, lambda: number, dt: number): number =>
  a + (b - a) * (1 - Math.exp(-lambda * dt));

export const clamp01 = (u: number): number => (u < 0 ? 0 : u > 1 ? 1 : u);
export const easeOutCubic = (u: number): number => 1 - Math.pow(1 - clamp01(u), 3);
export const easeInCubic = (u: number): number => Math.pow(clamp01(u), 3);
export const easeOutBack = (u: number, s = 1.7): number => {
  const t = clamp01(u) - 1;
  return 1 + (s + 1) * t * t * t + s * t * t;
};
export const smoothstep = (a: number, b: number, x: number): number => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** Volume-keeping squash: `sy` is the y scale; returns the x/z scale 1/sqrt(sy). */
export const volumeXZ = (sy: number): number => 1 / Math.sqrt(sy);
