/**
 * Swell and gust fields shared by CPU (boats, agents) and GPU (water, wind).
 * GLSL twin: src/render/shaders/chunks/fields.glsl — keep formulas identical;
 * the parity test (fields.test.ts) evaluates both at sample points.
 *
 * Numbers come from content/anim.ts at call time (no bible constants baked here).
 */
export interface SwellParams {
  /** Peak-to-peak amplitude /2, in u (bible: 0.15). */
  amplitude: number;
  /** Primary period in seconds (bible: 7). */
  period: number;
  /** Wind direction in radians (wave direction). */
  dir: number;
}

/** Vertical swell at (x, z, t): 2 octaves of travelling sines (ART_BIBLE §7 #1). */
export function swellY(x: number, z: number, t: number, p: SwellParams): number {
  const w = (2 * Math.PI) / p.period;
  const c1 = Math.cos(p.dir);
  const s1 = Math.sin(p.dir);
  // wavelength ≈ 28 u for the primary train, 11 u for the second (rotated 37°).
  const k1 = (2 * Math.PI) / 28;
  const k2 = (2 * Math.PI) / 11;
  const c2 = Math.cos(p.dir + 0.65);
  const s2 = Math.sin(p.dir + 0.65);
  const a = Math.sin((x * c1 + z * s1) * k1 - t * w);
  const b = Math.sin((x * c2 + z * s2) * k2 - t * w * 1.7 + 1.3);
  return p.amplitude * (a * 0.7 + b * 0.3);
}

export interface GustParams {
  /** Wind direction in radians. */
  dir: number;
  /** Gust wave speed in u/s (bible: 6). */
  speed: number;
  /** Gust wavelength in u (bible: 40). */
  wavelength: number;
  /** Base wind strength 0–1.5. */
  strength: number;
}

/** Gust strength 0..1 at (x, z, t): a travelling wave along the wind plus a slow pulse. */
export function gustAt(x: number, z: number, t: number, p: GustParams): number {
  const along = x * Math.cos(p.dir) + z * Math.sin(p.dir);
  const phase = (along - t * p.speed) * ((2 * Math.PI) / p.wavelength);
  const wave = 0.5 + 0.5 * Math.sin(phase);
  const pulse = 0.5 + 0.5 * Math.sin(t * 0.37 + along * 0.013);
  const g = wave * wave * (0.55 + 0.45 * pulse);
  return Math.min(1, g * p.strength);
}
