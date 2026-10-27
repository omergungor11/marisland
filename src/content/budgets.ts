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
 * D-046 (TASK-402b): medium 255 → 300. The Research campus (≈ 20 instanced LOD1 groups: observatory,
 * library, halls, tower, parterres, terrariums, dishes, pods, sculptures, each + its shadow pass) sits
 * in the W11 postcard foreground: 216 → 289 calls measured (seed 1001); everything else stays ≤ 237.
 * TASK-466 (D-057 Seven Gates): HQ's seven culture gates / goods stalls / pennant cuts are one
 * instanced LOD0 group per culture (+ shadow pass); W16 (Harbour Guild, seed 1001) 291 → 328
 * calls, W2 / W3 202 / 206 → 243 / 241. Medium 300 → 340. The new kit geometry adds 1–2 MB on
 * every frame and W4 already stood at the 170 MB line: medium gpuMemoryMB 170 → 176.
 * TASK-467 (Design Glass Conservatory): conservatory / glasshouse / prism-arch / glass-bridge buffers
 * add ≈ 2.5 MB (W4 172 MB alone). D-061: TASK-476 wins the calls back.
 * TASK-476 (D-061): the near structure merge (NEAR_MERGE below) draws an island's small LOD0 groups
 * as one mesh per material class at T2–T3: W16 331 → 269 calls, W2 / W3 239 → 176 / 175, every
 * wow shot ≤ 269. Medium calls 340 → 300. The merged copies cost +1–5 MB on close shots (max 172);
 * the memory peak is still W4 (173 MB, a T1 view the merge never touches), so medium
 * gpuMemoryMB stays 176 (170 needs W4's Beacon / Design buffers trimmed first).
 * TASK-478 (D-061): prop LOD geometries keep normals as 16-bit normalized and the emissive / ao /
 * wind weights as 16-bit unsigned normalized (batcher `compactAttributes`; same floats in the
 * shader): prop geometry −5.3 to −8 MB per frame, W4 174 → 166 MB. Medium gpuMemoryMB 176 → 170.
 * TASK-495 (D-073), budgets unchanged, headroom won back: the culture movers draw one instanced
 * mesh per part kind (an instance drew all 970 part triangles before), low ladder tier-2 rungs
 * Design 120 u 358k → 303k, Research 131.6 u 351k → 305k tris; the composer's ping-pong output
 * buffer has no depth renderbuffer (−7.9 MB on every medium frame at 1920×1080): W27 169 → 162 MB.
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
    drawCalls: 300,
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

/** M19 (TASK-408): max new prop defs one island culture may add (content/cultures). */
export const cultureDefsPerIsland = 10;

/** M20 remade islands (D-057): their own def cap and tier-1 cap instead of the shared ones. */
export const cultureCapOverride: Readonly<Record<string, { defs: number; tier1: number }>> = {
  hq: { defs: 12, tier1: 1 },
  design: { defs: 15, tier1: 2 },
  // TASK-506 (D-086): +3 for the Customs Port (scannerArch, customsYard, quarantinePontoon), all tier 2
  qa: { defs: 15, tier1: 1 },
};

/** SwiftShader is ~20–50× slower; time budgets are scaled by this when headless. */
export const HEADLESS_TIME_FACTOR = 40;

/**
 * TASK-476 (D-061) near structure merge (render/props/batcher.ts): at tiers 2–3 the LOD0 groups
 * of an island with at most `maxVerts` pre-transformed vertices (instances × geometry vertices)
 * draw as one merged mesh per (island, material class, tier class) — HQ's seven culture gates /
 * stalls / pennant cuts / crates, Design's kit, benches, lanterns, … instead of one instanced
 * group (+ shadow pass) per (def, variant). An island is merged once the camera is within
 * `reach` u of such a group (= the T2 fade-out, TIER_FADE[2]). The merged copy is memory
 * (≈ 60 B per vertex): sweep 2026-10-23 (W16 / W3, seed 1001, medium) maxVerts 1200 → 284 / 185
 * calls at 170 / 169 MB, 1600 → 269 / 175 at 172 / 170, 2500 → 252 / 160 at 176 / 175.
 */
export const NEAR_MERGE = { maxVerts: 1600, reach: 160 } as const;
