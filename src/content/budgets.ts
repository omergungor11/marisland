/**
 * Performance budgets (ARCHITECTURE §8), enforced as counts by `pnpm shots --assert`.
 * Worst case across tiers.
 */
export interface Budget {
  drawCalls: number;
  triangles: number;
  instances: number;
  groundCover: number;
  agents: number;
  particles: number;
  programs: number;
  /** Textures + render targets, MB. */
  gpuMemoryMB: number;
  /** Max JS heap, MB. */
  jsHeapMB: number;
  /** New seed gen + build, ms (real GPU; headless multiplies by `headlessFactor`). */
  newSeedMs: number;
}

export const BUDGETS: Record<'low' | 'medium' | 'high', Budget> = {
  low: {
    drawCalls: 120,
    triangles: 350_000,
    instances: 6_000,
    groundCover: 3_000,
    agents: 25,
    particles: 2_000,
    programs: 12,
    gpuMemoryMB: 40,
    jsHeapMB: 120,
    newSeedMs: 1500,
  },
  medium: {
    drawCalls: 220,
    triangles: 800_000,
    instances: 15_000,
    groundCover: 12_000,
    agents: 50,
    particles: 6_000,
    programs: 24,
    gpuMemoryMB: 90,
    jsHeapMB: 180,
    newSeedMs: 800,
  },
  high: {
    drawCalls: 350,
    triangles: 1_600_000,
    instances: 30_000,
    groundCover: 30_000,
    agents: 90,
    particles: 12_000,
    programs: 28,
    gpuMemoryMB: 160,
    jsHeapMB: 250,
    newSeedMs: 500,
  },
};

/** SwiftShader is ~20–50× slower; time budgets are scaled by this when headless. */
export const HEADLESS_TIME_FACTOR = 40;
