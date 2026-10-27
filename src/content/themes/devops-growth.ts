/**
 * Emberpeak growth reservations (TASK-503, D-083; M25 DevOps I / M26 DevOps II, WORLD_PLAN §4.4,
 * study D1–D18). The apron ring (islands.ts `emberpeak.apron`) gives the ground; the DevOps plan
 * (world/gen/plans/devops-growth.ts) picks the sites, reserves them as obstacle shapes (lots and
 * kit keep off) and publishes them as island anchors. No prop, pad or zone is placed here: the
 * M25/M26 tasks put their fixtures on the anchors and add their own pads.
 * Distances in u, angles in degrees, sizes as [w, d] (w along the anchor frame's width axis).
 */
export const DEVOPS_GROWTH = {
  /**
   * Keep-off angles round the crater centre (deg) for the windward pieces (lava channel exit,
   * quarry, funicular heading): the harbour shelf (container yard + cove), the other shelves and
   * the hot-spring terrace.
   */
  keepOff: { harbour: 62, shelf: 38, spring: 45 },
  /** D1 lava channel: notch → windward apron lip, 3 u wide (+ `margin` each side reserved). */
  lava: {
    width: 3,
    margin: 1.5,
    /** Sample spacing along the polyline. */
    step: 4,
    /**
     * Straight down the notch groove out to `straightR` (× r; the groove fades by ≈ 0.6 r), then the
     * bend to the exit heading, done by `turnR`.
     */
    straightR: 0.42,
    turnR: 0.75,
    /** Heading drift toward the lowest ground per sample / in total (deg). */
    drift: 3,
    maxDrift: 12,
    /** Exit score: turn off the notch heading + `windward` × turn off the windward heading. */
    windward: 0.6,
    /** Last sample (the lip, `lavaFall`) at this shore distance. */
    lipShore: 1.5,
  },
  /** D10 obsidian beach: a coast point this far (along the coast) beside the lava fall. */
  obsidian: { offset: 16, shore: 2.5, size: [14, 7] as const },
  /** D4 funicular: three station discs on one heading (foot, mid-slope, below the rim). */
  funicular: {
    stationR: 2.5,
    /** Station search radius round the ideal point, relief limits [foot, mid, top]. */
    search: 6,
    maxRelief: [1.5, 4, 5] as const,
    /** Top station this far below the island peak; foot = first level ground off the cone. */
    topBelow: 5,
    footY: 12,
    footRelief: 1.5,
    /** Heading keep-offs from the lava exit and the notch (deg). */
    lavaOff: 50,
    notchOff: 45,
    gap: 1,
  },
  /** D13 ore cableway: quarry (cablewayFrom) → the foundry's upper step (cablewayTo). */
  cableway: {
    toSearch: 12,
    toR: 1.5,
    toTol: 2,
    toRelief: 2.5,
    span: [26, 62] as const,
    spanPref: 42,
    /** Quarry rect sizes tried in order, its max relief (a quarry may bite into the slope). */
    quarry: [
      [12, 9],
      [10, 8],
      [8, 7],
    ] as const,
    quarryRelief: 4.5,
    minShore: 4,
    /** Score bonus when the span crosses the lava channel (buckets over the lava, D13 wow). */
    crossBonus: 3,
    gap: 1.2,
  },
  /** D9 onsen town: the bank beside the hot-spring pool (stilt bathhouses reach over it). */
  onsen: {
    /** Inner radius off the pool centre, then the outer search radius per pass. */
    ring: [7, 20] as const,
    farther: 30,
    sizes: [
      [16, 10],
      [13, 9],
      [11, 8],
    ] as const,
    /** Stilt bathhouses take a sloping bank. */
    maxRelief: 4.5,
    minShore: 2,
    gap: 1,
  },
  /** D7 geyser field (4–6 cones): a level-ish rect on the hot-spring side of the apron. */
  geysers: {
    ring: [10, 50] as const,
    /** Second pass: anywhere this far from the pool (the apron round the cone foot). */
    farther: 80,
    sizes: [
      [20, 12],
      [16, 10],
      [12, 8],
    ] as const,
    maxRelief: 3,
    minShore: 3,
    gap: 1.5,
  },
  /** D14 smiths' lane: a strip along the foundry lower shelf (two facing stall rows). */
  smiths: {
    search: 20,
    sizes: [
      [14, 6],
      [12, 5],
      [10, 5],
      [8, 4],
    ] as const,
    maxRelief: 2.2,
    /** Pass 1 stays within this of the shelf level; pass 2 takes the apron below it. */
    levelTol: 1.5,
    minShore: 2,
    gap: 0.8,
  },
  /** D6 crater deck: a disc on the rim, facing the crater, near the funicular top. */
  craterDeck: { r: 2.5, rim: [5, 15] as const, notchOff: 60, lavaOff: 30, maxRelief: 4 },
  /** D18 breakwater: off the harbour mouth, shifted to windward, in water at least `depth` deep. */
  breakwater: { off: 10, shift: 8, depth: 1.5, push: 3, tries: 8 },
} as const;
