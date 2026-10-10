/**
 * Stone viaducts between near islands (M17b "Concept Archipelago", TASK-394). Data only:
 * world/gen/bridges.ts picks the pairs, geo/bridge.ts builds the bay model, render/bridges.ts
 * instances one bay per span piece.
 */
export const BRIDGES = {
  /** Bridges per world: a roll in [min, max], then as many as fit the rules. */
  count: [1, 3],
  /**
   * Shore-to-shore water gap limits, u (rim of one island to the rim of the other). The layout
   * keeps islands 67–90 u apart rim to rim (measured on seeds 1001 / 42 / 4004), so the brief's
   * "about 60" is raised to 90; the score still prefers the short ones.
   */
  gap: { min: 14, max: 90 },
  /** Max bridges touching one island, and the least spacing between two ends on one island, u. */
  maxPerIsland: 2,
  endSpacing: 18,
  /**
   * Lines tried per island pair: through the closest rim pair, rotated by `angles` (deg) and
   * shifted sideways by `lateral` (u). `walkMargin` = how far past the rim pair a line is walked,
   * `searchSlack` = how much longer than `gap.max` the closest approach may be (the rim grid is 2 u coarse).
   */
  angles: [-30, -18, -9, 0, 9, 18, 30],
  lateral: [-16, -8, 0, 8, 16],
  walkMargin: 32,
  searchSlack: 4,
  /** Probe step along the line, u. */
  step: 1,
  /**
   * Bluff top: an end sits where the ground first reaches `topY` walking inland from the rim, at
   * most `inlandMax` u in, then `inset` u further so the abutment stands on the plateau.
   */
  topY: 3.6,
  inlandMax: 14,
  inset: 3.2,
  /** Ends may differ in height by at most this (the deck tilts evenly between them), u. */
  maxEndDiff: 3.2,
  /** Deck top sits this far above the ground at an end (no z-fight with the plateau), u. */
  deckLift: 0.18,
  /** Clearance from the bridge axis (half deck width added) to lots / docks / landmarks, u. */
  clear: { lot: 3.5, dock: 3.5, landmark: 7 },
  /** A pier foot (`pierDepth` below the deck) must end this far below the seabed under it, u. */
  footBelowSeabed: 1,
  /** Score = gap + endDiff·diffW + |lateral|·latW + jitter; lower wins. */
  score: { diffW: 3, latW: 0.15, jitter: 4, degreePenalty: 18 },
  /** Footprint marked in the prop occupancy around the deck on land (scatter keeps clear), u. */
  occupancyR: 3.2,

  /** Model (u). One bay is `bay` long, centred on its middle; spans scale z to fill the gap. */
  model: {
    bay: 8,
    deckW: 4.0,
    /** Deck slab thickness and the arch spring/crown, measured down from the deck top. */
    deckT: 0.7,
    archRise: 3.2,
    archT: 0.55,
    /** Pier width along the span, and how deep its foot runs below the deck top. */
    pierW: 1.5,
    pierDepth: 34,
    /** Waterline stain starts this far below the deck top (the deck stands 6–8 u over the sea). */
    stainY: -6.2,
    parapetH: 0.75,
    parapetT: 0.4,
    capH: 0.18,
    /** A lamp post on each side at every bay's +z pier. */
    lampH: 1.9,
    lampR: 0.1,
    archSegs: 8,
    lodArchSegs: 4,
  },

  colors: {
    stone: '#D8CDB6',
    stoneDark: '#B9AE98',
    path: '#E4DAC4',
    cap: '#EDE4D0',
    moss: '#7E9B6E',
    lampPost: '#4F4A5E',
    lampGlass: '#FFE6A0',
  },
} as const;
