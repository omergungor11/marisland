/**
 * Phase 2 edit tunables (mar-tasks/phases/phase-2.md). Render-side rebuild constants live under
 * `EDIT_RENDER` (TASK-211); the brush / command constants (TASK-201) go next to them.
 */
export const EDIT_RENDER = {
  /** Dirty terrain chunks remeshed per frame in interactive mode (capture drains all at once). */
  chunksPerFrame: 2,
  /** Instanced prop groups grow to `ceil(needed × (1 + batchHeadroom)) + batchMinSpare`. */
  batchHeadroom: 0.25,
  batchMinSpare: 8,
  /**
   * Chunks within this many cells of the dirty bounds are remeshed: the height texture scan
   * reaches 1 cell past the bounds and skirt edge normals read 1 more. Colour changes beyond
   * (AO reach, wet-sand SDF, zones) queue their chunks from the exact changed-texel rect.
   */
  chunkPadCells: 2,
  /**
   * SDF texture: cells around the dirty bounds scanned for changed shore distance (the local EDT
   * of TASK-202 may touch more than the brush footprint). Only changed texels are uploaded.
   */
  sdfScanPad: 48,
  /** Ring-scale field (water bands): cells around the bounds whose nearest coast is re-derived. */
  ringPad: 32,
  /** Extra EDT window around `ringPad` (nearest-coast search radius, cells). */
  ringSearch: 32,
} as const;
