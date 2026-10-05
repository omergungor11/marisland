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
  /**
   * GPU memory, MB (`render/gpu-memory.ts`: geometry + textures + render targets + shadow map +
   * drawing buffer), at the reference capture size — low ≤ 1280×720, medium / high 1920×1080, DPR 1
   * (targets and the drawing buffer scale with the pixel count). D-022 (amends D-010).
   */
  gpuMemoryMB: number;
  /** Max JS heap, MB. */
  jsHeapMB: number;
  /** New seed gen + build, ms (real GPU; headless multiplies by `headlessFactor`). */
  newSeedMs: number;
}

/**
 * D-028 (TASK-309, Phase 3 M14): raised only where the measured worst case (ci/dev/edit sets) passed
 * the old budget, to measured + ~10 %: calls low 157 (E-meadow; T3 views see ~47 terrain chunks and
 * the LOD0 groups of 3–4 islands of the 7-island layout) → 170, medium 232 → 255; gpuMemoryMB low
 * 63 (E-panel at 1280×720) → 70. Programs stay 9 / 17 / 24 (= pre-Phase-3 baseline).
 */
export const BUDGETS: Record<'low' | 'medium' | 'high', Budget> = {
  low: {
    drawCalls: 170,
    triangles: 350_000,
    instances: 6_000,
    groundCover: 3_000,
    agents: 25,
    particles: 2_000,
    programs: 12,
    gpuMemoryMB: 70,
    jsHeapMB: 120,
    newSeedMs: 1500,
  },
  medium: {
    drawCalls: 255,
    triangles: 800_000,
    instances: 15_000,
    groundCover: 12_000,
    agents: 60,
    particles: 6_000,
    programs: 20,
    gpuMemoryMB: 170,
    jsHeapMB: 180,
    newSeedMs: 800,
  },
  high: {
    drawCalls: 350,
    triangles: 1_600_000,
    instances: 30_000,
    groundCover: 30_000,
    agents: 110,
    particles: 12_000,
    programs: 24,
    gpuMemoryMB: 480,
    jsHeapMB: 250,
    newSeedMs: 500,
  },
};

/** SwiftShader is ~20–50× slower; time budgets are scaled by this when headless. */
export const HEADLESS_TIME_FACTOR = 40;
