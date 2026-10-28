/**
 * Marketing "Beacon Rock" M27 signature kit (TASK-517, D-096, "Cable Carnival" of the marketing
 * study, direction A): numbers and palette of the cable car (MK:M1), the sea-facing billboard
 * (MK:M3), the vertical ON AIR neon (MK:M4), the dive tower (MK:M13) and the guyed stack
 * transmitter (MK:M2 v2). Geometry: geo/themes/marketing-m27.ts; defs: content/props-themes/
 * marketing-m27.ts. Lengths in u (1 u = 1 m), pivot on the ground. Colours come from the existing
 * Marketing media-rock table (MEDIA_ROCK.colors); nothing new is invented.
 *
 * Variants of existing defs (ledger-free, D-094):
 *   mailLine      v4 sea pylon, v5 gondola (red), v6 gondola (cream)
 *   billboardV2   v2 sea billboard (rock-face mount), v3 ON AIR neon (vertical, back-mount)
 *   antennaTower  v2 guyed stack transmitter
 * New def: diveTower (tier 2, Marketing ledger 10 -> 11).
 */
import { CLIFF_STRATA, WALLS } from '../palette.ts';
import { MEDIA_ROCK } from './marketing.ts';

const K = MEDIA_ROCK.colors;

export const M27_PAL = {
  red: K.accent,
  cream: K.cream,
  gold: K.gold,
  sky: K.sky,
  steel: K.steel,
  bezel: K.bezel,
  neon: K.redLamp,
  /** Warm window light of the gondola panes and the bulbs. */
  warm: K.warm,
} as const;

export const MARKETING_M27 = {
  /**
   * M1 cable car, on the `mailLine` system: a LOOP (two tracks, gondolas out on one, back on the
   * other; TASK-518 / D-097). The pylon (v4, mid / angle pylon) is a red / white lattice 9 u tall
   * with a crossarm along x OVER the cable carrying one sheave per track at x = ±`track` (the
   * gondolas pass beside the tower, never through it); the terminal (v7, both ends of the line)
   * is the same tower with a horizontal bullwheel of radius `track` at the seat height (the cable
   * turns round it behind the tower, local -z) and a boarding landing beside the +x track.
   * Gondolas (v5 red, v6 cream) hang on the cable: the pivot is on the cabin floor, the carrier
   * wheels sit `grip` above it; the cable axis is local z.
   */
  pylon: {
    variant: 4,
    /** Terminal (end station) variant: bullwheel + landing. */
    terminal: 7,
    height: 9,
    /** Half-width of the lattice at the plinth / at the head. */
    foot: 0.95,
    top: 0.26,
    /** Cable seat height over the pivot (both variants; = MARKETING_ANCHORS.cable.seat). */
    anchorY: 9.45,
    /** Lateral offset of each track (sheave / bullwheel radius) from the tower axis. */
    track: 1.25,
    /** Crossarm height over the seat (the grips pass under it), sheave radius. */
    armOver: 0.42,
    sheaveR: 0.24,
    /** Terminal landing beside the +x track: floor height (= the gondola floor), x range, depth. */
    landing: { y: 6.95, x0: 1.95, x1: 3.15, depth: 1.5 },
  },
  gondola: {
    variants: [5, 6] as const,
    /** Cabin: width (x), length along the cable (z), body height, bevel. */
    w: 1.1,
    d: 0.95,
    h: 1.3,
    bevel: 0.13,
    /** Roof dome rise; lower band share of the body; window pane height and end pane width. */
    roof: 0.26,
    band: 0.28,
    pane: { w: 0.5, h: 0.5 },
    /** Carrier wheel centre (grip on the cable) over the cabin floor, hanger pin just below it. */
    grip: 2.5,
    pin: 2.32,
    /** Cabin liveries: [lower band + roof, upper band]. Variant 5 red, 6 cream. */
    livery: [
      [M27_PAL.red, M27_PAL.cream],
      [M27_PAL.cream, M27_PAL.red],
    ] as const,
    /** Gust swing about the cable axis (deg), for the mover. */
    swingDeg: 3,
  },
  /**
   * M3 sea billboard (`billboardV2` v2): 6 x 3 u board standing on two short posts at the foot of
   * a rock face and tied back to it. Local z = out to sea, the rock face plane is z = -reach.
   */
  seaBoard: {
    variant: 2,
    w: 6,
    h: 3,
    y: 1.55,
    reach: 1.15,
    /**
     * Anchored foot (TASK-522, D-101): a footing block running `into`
     * u behind the rock face plane (the pivot rule keeps y >= 0), two flared pedestals up to the board, a steel cap plate
     * on each, and a boulder at either end of the footing.
     */
    foot: {
      sink: 0.05,
      top: 0.4,
      into: 0.6,
      front: -0.4,
      pedSink: 0.05,
      pedR: [0.8, 0.36] as const,
      block: CLIFF_STRATA[0],
      pedestal: WALLS[0],
      boulder: CLIFF_STRATA[1],
    },
  },
  /**
   * M4 ON AIR neon (`billboardV2` v3): `word` stacked top to bottom, each letter on its own dark
   * plate, a steel spine tied back to the cliff. Letters are separate emissive slots: letter k
   * glows at `slot.base + k * slot.step` (all lamp class, 1.00 .. 1.04).
   */
  onAir: {
    variant: 3,
    word: 'ONAIR',
    /** Gap (u) between letters, and the extra gap after letter index `wordGapAfter`. */
    gap: 0.12,
    wordGap: 0.42,
    wordGapAfter: 1,
    plate: { w: 1.2, h: 1.5, d: 0.2 },
    /** Stroke letter size inside the plate and stroke width. */
    letter: { w: 0.78, h: 1.2, th: 0.15, d: 0.1 },
    foot: 0.7,
    reach: 1.0,
    slot: { base: 1, step: 0.01 },
  },
  /**
   * M13 dive tower (def `diveTower`): four legs, a 1.9 x 1.9 u deck `deckY` up, rails, a ladder up
   * the back and a springboard out front (+z). Splash target: straight ahead of the board tip.
   */
  dive: {
    deckY: 5,
    deck: 1.9,
    legFoot: 1.15,
    legTop: 0.85,
    rail: 0.9,
    board: { len: 2.7, w: 0.5, from: 0.65, rise: 0.12, thick: 0.1 },
    ladder: { z: -1.28, w: 0.55, rungEvery: 0.38 },
    flag: { h: 1.5, w: 0.8, len: 0.55 },
    /** Where the diver lands, ahead of the tip (u), for the life task. */
    splashAhead: 3.2,
  },
  /**
   * M2 stack-1 transmitter (`antennaTower` v2): the v1 lattice, taller, with two tiers of guy
   * wires tied to eye blocks `radius` out, and the blinking red tip lamp.
   */
  guyed: {
    variant: 2,
    height: 8.2,
    foot: 0.8,
    top: 0.2,
    /** Guy tiers: share of the mast height, count per tier (120 degrees apart), radius to the eyes. */
    tiers: [0.55, 0.88] as const,
    count: 3,
    radius: 2.1,
    wire: 0.022,
  },
} as const;
