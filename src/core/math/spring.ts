/**
 * Springs with the bible's `k` (stiffness) / `c` (damping), mass 1.
 * `springIn` is the closed form used both here and in GLSL (bloom-in) — keep in sync
 * with render/shaders/chunks (parity test in spring.test.ts).
 */
export interface SpringState {
  x: number;
  v: number;
}

/** Closed-form response of an underdamped spring released from 0 toward 1 at t=0. */
export function springIn(t: number, k: number, c: number): number {
  if (t <= 0) return 0;
  if (t > 2) return 1;
  const w0 = Math.sqrt(k);
  const z = c / (2 * w0);
  if (z >= 1) {
    // critically / over-damped: use critically damped form
    return 1 - Math.exp(-w0 * t) * (1 + w0 * t);
  }
  const wd = w0 * Math.sqrt(1 - z * z);
  return 1 - Math.exp(-z * w0 * t) * (Math.cos(wd * t) + ((z * w0) / wd) * Math.sin(wd * t));
}

/** Semi-implicit Euler with substeps; stable at 30–144 fps. */
export function stepSpring(s: SpringState, target: number, k: number, c: number, dt: number): void {
  const d = Math.min(dt, 0.1);
  const steps = Math.max(1, Math.ceil(d / (1 / 120)));
  const h = d / steps;
  for (let i = 0; i < steps; i++) {
    s.v += (-k * (s.x - target) - c * s.v) * h;
    s.x += s.v * h;
  }
}

/** Peak overshoot fraction of `springIn` (e.g. 0.08 for ≈8 %). */
export function springOvershoot(k: number, c: number): number {
  let peak = 0;
  for (let t = 0; t < 2; t += 1 / 240) peak = Math.max(peak, springIn(t, k, c));
  return peak - 1;
}
