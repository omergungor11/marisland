/**
 * HQ yacht marina and star fort (M29 TASK-505, D-081 / D-085; hq-design.md H9 / H10 / H11 / H18).
 * Look and size tables of the two new defs (geo/themes/hq-marina.ts: `marinaPier`, `starFort`) and
 * the two sailboat variants / tender, plus every number of the post-route placement stage
 * (world/gen/marina.ts). Defs: content/props-themes/hq-marina.ts. Colours come from the bible
 * palette tables (palette.ts / palette-offices.ts) and the HQ accent; nothing here is logic.
 */
import { CLIFF_STRATA, EMISSIVE, GRASS, ROCK, ROOFS, WALLS, WOOD } from '../palette.ts';
import { OFFICE_PAL } from '../palette-offices.ts';

const HQ = OFFICE_PAL.hq[0];

/** Marina palette: cream stone and white paint, the HQ coral, harbour blue trim, port red / starboard green lenses. */
export const MARINA_PAL = {
  stone: WALLS[0],
  stoneLight: WALLS[1],
  stoneShade: ROCK[0],
  stoneDark: ROCK[1],
  rubble: ROCK[2],
  coral: HQ.roof,
  blue: ROOFS[5],
  red: ROOFS[1],
  green: GRASS[2],
  lamp: EMISSIVE.lantern,
  window: EMISSIVE.window,
  deck: WOOD.planks,
  post: WOOD.dark,
  plank: WOOD.dock,
  rope: WOOD.logs,
} as const;

const P = MARINA_PAL;

/** Pier / mole variants of the `marinaPier` def. */
export const MARINA_PIER_V = { finger: 0, fingerShort: 1, spine: 2, mole: 3, moleHead: 4 } as const;

/** `marinaPier` look (geo/themes/hq-marina.ts); lengths are along local +z from the root. */
export const MARINA_PIER = {
  /** Deck top above the waterline (the ferry pier's `dock` deck is 0.55). */
  deckY: 0.55,
  deckW: 1.7,
  /** Lengths per variant: finger, short finger, spine piece, mole piece, mole head. */
  length: [12, 8, 6, 8, 5] as const,
  /** Posts (piles) both sides every `postEvery` u, down to `pileY`, up `postH` over the deck. */
  postEvery: 3,
  pileY: -4.3,
  postH: 0.5,
  deck: P.deck,
  plank: P.plank,
  post: P.post,
  rope: P.rope,
  /** Finger-end lantern: pole height over the deck and lens radius. */
  lantern: { h: 1.9, r: 0.17, pole: P.post, lens: P.lamp },
  /** Mole (breakwater): crest width / height over the water, foot half width, how deep the foot goes. */
  mole: {
    crestW: 2.2,
    crestY: 1.25,
    footW: 5.2,
    footY: -4.6,
    block: [P.stoneShade, P.stoneDark, P.stoneLight] as readonly string[],
    cap: P.stoneLight,
    /** Rubble blobs along the seaward flank: count per piece, radius, noise amplitude. */
    rubble: { n: 5, r: [0.55, 0.9] as const, amp: 0.16 },
  },
  /** Mole head: round end with a harbour-light tower (green lens, the H18 pair of the fort's red one). */
  head: {
    r: 2.6,
    tower: { h: 3.3, r: 0.75, roof: P.coral, lens: P.green, lensR: 0.34 },
  },
  /** Spine piece: deck width and the number of cross-ties. */
  spine: { w: 2.2 },
} as const;

/** The star fort (geo/themes/hq-marina.ts). Pivot = water level; the plinth runs down to `footY`. */
export const STAR_FORT = {
  /** Star points. */
  points: 5,
  /** Outer / inner radius at the waterline and the wall-top scale (the batter of the sloped walls). */
  outerR: 7.2,
  innerR: 4.5,
  topScale: 0.8,
  /** Wall top over the waterline, and how far the plinth reaches under it. */
  wallH: 3.0,
  footY: -2.4,
  /** Parapet: merlon height / depth, merlons per face with a gun embrasure between each pair. */
  parapet: { h: 0.75, d: 0.55, w: 1.2, perFace: 3 },
  /** Gun embrasures: slot size on the parapet gap and the cannon barrel poking out. */
  gun: { len: 1.25, r: 0.17 },
  /** Courtyard floor under the keep, keep (flag tower) size and its roof. */
  court: { y: 0.15, color: P.stoneShade },
  tower: { w: 2.3, h: 5.0, roofH: 1.5, windowEvery: 1.6 },
  /** Flag pole above the roof and the pennant (HQ coral swallowtail, flutters). */
  flag: { poleH: 2.6, len: 1.9, h: 0.75 },
  /** Red harbour light (H18) in the keep's lantern gallery. */
  light: { r: 0.4, color: P.red },
  stone: P.stone,
  stoneEdge: P.stoneLight,
  /**
   * Stone of the fort walls (TASK-521, D-101): the plinth under the water, a mossy waterline
   * course, then warm sandstone courses (`courses`, bottom to top, each up to its wall-height
   * fraction `t`, colours alternate) and a light coping band under the parapet. Merlons are warm
   * cream: the pure-white WALLS[1] read lavender-grey at dusk.
   */
  stoneBands: {
    plinth: ROCK[2],
    moss: '#8FA571',
    courses: [
      { t: 0.32, color: CLIFF_STRATA[0] },
      { t: 0.62, color: '#E6C9A0' },
      { t: 0.88, color: CLIFF_STRATA[0] },
    ],
    coping: WALLS[3],
    merlon: WALLS[0],
  },
  slot: ROCK[2],
  roof: P.coral,
  trim: P.blue,
  /** A small timber landing on the cove side (towards `landing` heading): length, width. */
  landing: { len: 4.2, w: 1.5 },
} as const;

/** Moored boats: sloop palettes (variants 6, 7) and the tender (variant 8) of the `sailboat` def. */
export const MARINA_BOATS = {
  /** First of the new sailboat variants (the pontoon, v5, was the last). */
  firstVariant: 6,
  variants: 9,
  sloops: [
    { hull: WALLS[1], stripe: ROOFS[5], sail: WALLS[1], jib: ROOFS[0], boot: ROOFS[5] },
    { hull: WALLS[0], stripe: ROOFS[2], sail: WALLS[3], jib: ROOFS[2], boot: ROOFS[2] },
  ] as const,
  /** The tender: a rowing dinghy (the `rowboat` hull) with an anchor light on a short post. */
  tender: { variant: 8, lamp: P.lamp, post: 1.15 },
  /** Mast-head light (emissive 1: it follows the night lamp ramp). */
  mastLamp: { r: 0.3, color: P.lamp },
} as const;

/** Placement of the marina (world/gen/marina.ts). Lengths in u, angles in degrees. */
export const HQ_MARINA = {
  /** Shared water rules: berths, fingers and the mole stand in this depth (u under the sea). */
  depth: { min: 0.25, finger: 4.0, mole: 4.8 },
  /** Spine: the walkway 3.2 u off the shore, walked from `pierGap` u past the ferry pier along the shore. */
  spine: {
    offshore: 3.2,
    pierGap: 8,
    maxLen: 44,
    /** A walk shorter than this carries no comb (u). */
    minLen: 12,
    /** Stop when the heading has turned this far (the contour wraps the horn). */
    maxTurn: 112,
    step: 1,
    /** A piece every `piece` u of the smoothed contour (variant `spine`). */
    piece: 6,
    /** Smoothing passes of the walked contour. */
    smooth: 4,
  },
  /** Comb fingers off the spine, seaward: pitch along the spine, first offset, lengths tried (variant). */
  fingers: {
    pitch: 7.2,
    first: 3.5,
    /** Offset of the finger root from the spine centreline (u): half the spine deck + half a finger. */
    rootOff: 1.2,
    lengths: [
      [12, 0],
      [8, 1],
    ] as const,
    /** Water clearance: min distance (u) between a finger tip and any shore / route. */
    tipShore: 2.5,
    routeClear: 4.5,
    /** Clear of the ferry pier (u), of the neighbouring fingers, per spine and in all. */
    pierClear: 5,
    apart: 5.2,
    max: 6,
    total: 9,
  },
  /** Berths: a boat each side of a finger every `pitch` u, `side` u off its centreline. */
  berths: {
    pitch: 5.4,
    first: 3.5,
    side: 2.05,
    /** Chance a slot is filled (the rest are topped up to `min`), total bounds. */
    fill: 0.9,
    min: 15,
    max: 20,
    /** Heading jitter (rad) and along jitter (u). */
    /** A tender (sailboat variant 8) at the end of each finger, this far past its tip (u). */
    tender: 8,
    tenderBeyond: 2.2,
    /** Boats alongside the spine: first / pitch along it, offset seaward, clear of fingers / routes; boats keep `sep` apart. */
    spineFirst: 2.5,
    spinePitch: 5.6,
    spineSide: 2.45,
    fingerClear: 2.7,
    routeClear: 3.5,
    sep: 3.7,
    yawJit: 0.05,
    alongJit: 0.3,
    /** Mix of the boat variants: [sailboat variant, weight]. v0 / v1 are the old white / coloured sloops. */
    mix: [
      [6, 3],
      [7, 3],
      [8, 2],
      [0, 1],
      [1, 1],
    ] as readonly (readonly [number, number])[],
  },
  /** Fort: centre pushed this far seaward of the horn tip; ground it sits on must be this deep (u) at most. */
  fort: {
    /** Centre this far seaward of the main spine's end (the contour 3.2 u off the horn's tip). */
    seaward: 2,
    clearRoute: 9,
    /** Radius kept clear of trees / scatter on the horn (u, > outerR). */
    keepOut: 8.4,
  },
  /** Breakwater arm from the fort towards the pier side: bend from the horn heading, lengths tried. */
  mole: {
    bends: [45, 60, 30, 75, 95] as const,
    lengths: [24, 16, 8] as const,
    /** Starts this far from the fort centre (the fort's flank). */
    from: 6.2,
    routeClear: 6.5,
    stopClear: 7.5,
    fingerClear: 4.2,
    pierClear: 6,
    step: 1,
    /** Lee berths along the arm: first / pitch along it, side offset from its axis (u). */
    berthFirst: 5,
    berthPitch: 5.6,
    berthSide: 3.5,
  },
  /** H11 channel gates along the HQ ferry route round its stop: arc offsets (u), lateral half width. */
  gates: {
    arcs: [-26, -13, 13, 26] as const,
    lateral: 3.6,
    minDepth: 1.0,
    minShore: 2.0,
    port: 1,
    starboard: 2,
    /** The generic channel buoys (seamarks) keep out of this radius round the HQ ferry stop. */
    reserve: 48,
  },
} as const;
