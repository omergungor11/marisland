/**
 * DevOps M26 "DevOps II" placement + motion (TASK-509c, D-093): where the TASK-509b lava pack stands on
 * the TASK-503 growth anchors (world/gen/plans/devops-m26.ts) and how it moves (life/tug.ts,
 * render/culture-movers.ts). Distances in u, times in s. Prop sizes: DEVOPS_M26 (devops-m26.ts).
 */
import { DEVOPS_M26 } from './devops-m26.ts';
import { DEVOPS_WORKS } from '../props-themes/devops.ts';

const B = DEVOPS_M26.bridge;
const K = DEVOPS_M26.kiln;

export const DEVOPS_M26_SITE = {
  /**
   * D1 lava bed, carved in `plan.finish` along the `lavaChannel` anchors (world.fences kind 'lava',
   * `levels` = bed height per point): `depth` below the bank, levelled across the `core` half-width,
   * blended back to the ground over `fall`. Downstream the bed never climbs (a gully shoulder is cut,
   * at most `maxCut` u below the ground), never below `minBed` over the sea.
   */
  lava: { depth: 0.5, core: 1.7, fall: 2.3, maxCut: 3.2, minBed: 0.9, sample: 1 },
  /**
   * D3 ember bridge (v0; v1 is for a track over the bed: no seed has one, the funicular and the
   * foundry rail keep off the channel): on the most level crossing of the channel between `reach[0]`
   * of its length and `reach[1]` u before the lip (banks `bank` u either side, `minShore` inland,
   * within `maxBank` of each other, footing relief ≤ `footRelief` within `footR`; ties go downstream
   * by `downstream` per u). The bed is blocked for footpaths `block` u either side of its centre line
   * except the deck (± `gap` along it); both ends get a path link `pin` u past the deck. The pivot
   * (planned y) is the mean bank height; the abutments (`abut` along the span) are levelled to it,
   * then ramps (`ramp` u long, `rampTop` over the pivot at the abutment end) meet the path.
   */
  bridge: {
    reach: [0.3, 8] as const,
    bank: B.length / 2 - 0.6,
    minShore: 2,
    maxBank: 1.0,
    footR: 1.4,
    footRelief: 1.2,
    downstream: 0.02,
    block: 2.2,
    gap: 1.6,
    pin: 1.2,
    abut: [B.clear / 2, B.length / 2] as const,
    /** Lateral core / blend of the abutment and ramp earthworks (deck half-width + a kerb). */
    core: B.width / 2 + 0.5,
    fall: 1.6,
    rampTop: B.deckY - 0.05,
    ramp: 3.5,
  },
  /**
   * D10 obsidian beach (the windward bluff beside the fall): sea stacks on the shallow shelf in front
   * (seabed in `stackDepth`), a tide-pool slab at the waterline, shard clusters and a cairn on the
   * bluff top. Searched on the anchor rect (`DEVOPS_GROWTH.obsidian.size`, depth axis = out to sea)
   * grown by `reach` seaward. With a cove (TASK-513) the clusters and the cairn stand on its floor.
   */
  obsidian: {
    /**
     * TASK-513 black-sand cove: a notch carved into the bluff at the anchor (frame: s out to sea,
     * q along the coast). Floor = |q| ≤ `halfW`, s ≥ −back (back corners rounded by `corner`), its
     * ground cut (never raised) to a beach sloping from `backY` at the back to `frontY` at s =
     * `frontS` (≈ the waterline; ≥ FLATTEN.minHeight); the walls blend back to the bluff over
     * `wall`. Cut late (plan.finish, groundWriter rules), planned at plan time: the deepest `backs`
     * (the D13 quarry often sits ~13 u behind the anchor), then the first centre slid `slide` u
     * along the coast whose floor is `gap` + the groundWriter keep-off clear of every other
     * obstacle and pad falloff; its rect is reserved and blocked for paths. Floor = black sand; the walls repaint by slope:
     * cliff above ZONE_RULES.cliffSlope, black sand up to `sandTop`, rock above `rockSlope`.
     */
    cove: {
      halfW: 5,
      backs: [6, 5, 4] as const,
      corner: 3,
      wall: 2.5,
      frontS: 4,
      backY: 1.1,
      frontY: 0.45,
      slide: [0, 2, -2, 4, -4, 6, -6] as const,
      gap: 0.4,
      sandTop: 1.6,
    },
    /** Cove floor pieces (clusters, cairn): ground height range, kept `inset` u off the walls. */
    floorY: [0.4, 1.4] as const,
    inset: 1.2,
    /** Slab samples run this far past the cove's `frontS` (the waterline step into the shelf). */
    slabOut: 2,
    reach: 8,
    /** Variants: cluster 0, stack 1, slab 2, cairn 3; how many of each (in this order). */
    want: [
      [1, 3],
      [2, 1],
      [0, 2],
      [3, 1],
    ] as const,
    stackDepth: [-1.6, -0.25] as const,
    slabY: [-0.15, 0.7] as const,
    landY: 1.2,
    /** Ground relief under each piece's disc (per variant): the piece sits, nothing floats. */
    maxRelief: [0.9, 1.0, 0.9, 0.9] as const,
    spacing: [3.2, 3.0, 2.6, 2.6] as const,
    radius: [1.0, 0.9, 1.2, 0.5] as const,
    tries: 60,
  },
  /**
   * D6 crater deck: on the `craterDeck` anchor, facing the crater; its ground levelled late (finish,
   * groundWriter rules, no pad: a pad falloff would reach the funicular rail by the top station)
   * within `core` of the pivot, blended out over `fall`; the pivot first slides to the least floor
   * relief (the top station's pad may have cut the rim behind the anchor).
   */
  deck: {
    core: DEVOPS_M26.deck.r + 0.4,
    fall: 1.8,
    /** Pivot slide (u, along the heading and across it) on the anchor disc, cost per u of slide. */
    slide: [0, 0.5, -0.5, 1, -1] as const,
    slideCost: 0.15,
  },
  /**
   * D17 glass kiln: a free level rect beside the smiths' lane (else the foundry), its mouth (+z)
   * toward the lane. Rect: the kiln + rack (x) and the apron / bench in front (z, centred `z` ahead).
   */
  kiln: {
    w: 6.8,
    d: 4.2,
    z: 0.55,
    ring: [5, 22] as const,
    /** The mouth may turn this far (rad) off the lane centre, at `turnCost` per radian. */
    turn: 0.55,
    turnCost: 1.5,
    gap: 0.8,
    minShore: 2.5,
    maxRelief: 3.0,
    padMargin: 0.6,
    /** A pad whose falloff reaches another pad core more than this off its level is not taken. */
    levelGap: 1.4,
  },
  /**
   * D18 breakwater: variants tried in order (head with the light first) at shifts round the D-083
   * anchor (toward the shore first, then along the arm), every footprint sample's seabed between the
   * foot (+ `footClear`, so the rubble foot is buried) and `-crestClear`; clear of the harbour pier
   * by `pierClear`. Boat routes keep `keepOut` u off its centre line (world/index.ts).
   */
  breakwater: {
    order: [2, 0, 1] as const,
    shore: [0, 1.5, 3, 4.5, 6] as const,
    slide: [0, -2, 2, -4, 4] as const,
    footClear: 0.25,
    crestClear: 0.3,
    pierClear: 6,
    keepOut: 5.5,
  },
} as const;

export const DEVOPS_M26_MOTION = {
  /** Kiln furnace: at night the mouth glow (radius × uNight) breathes on two incommensurate sines. */
  kiln: { period: [2.3, 3.7] as const, r: [0.13, 0.2] as const, color: '#FF9A4A' },
  /**
   * D18 tug (sailboat v9, render/movers.ts): it leads the first cargo ship of each DevOps pier round
   * its harbour loop (render/harbour-routes.ts `tugPose`): off the ship's bow quarter, `lead` u ahead of
   * its centre and `side` u to the loop's inside (half beams + a 1.6 u gap), so it waits seaward of
   * the berthed ship and stays off the other ship's lane; `draft` u below the waterline.
   */
  tug: {
    lead: DEVOPS_WORKS.ship.l / 2 - DEVOPS_M26.tug.length / 2 + 0.5,
    side: DEVOPS_WORKS.ship.beam / 2 + DEVOPS_M26.tug.beam / 2 + 1.6,
    draft: 0.3,
    bob: 0.05,
  },
  /**
   * Tug funnel smoke: `n` puffs born `life` / n apart at the funnel top, left behind as the tug moves
   * (each at the funnel's position when it was born), rising and drifting downwind as they swell.
   */
  tugSmoke: {
    n: 7,
    life: 3.2,
    rise: 2.4,
    drift: 1.6,
    size: [0.35, 1.25] as const,
    opacity: 0.75,
    edge: 0.5,
  },
} as const;

/** Kiln chimney top in the kiln frame (geo/themes/devops-m26.ts glassKiln `smoke` hook). */
export const KILN_CHIMNEY = {
  x: K.base.x,
  y: K.base.h + K.dome[K.dome.length - 1][1] - 0.05 + K.chimney.h + 0.1,
  z: 0,
} as const;

/** Kiln furnace mouth centre in the kiln frame (glassKiln `mouth` hook; dome radius at the mouth). */
export const KILN_MOUTH = {
  x: K.base.x,
  y: K.base.h + K.mouth.y + K.mouth.h * 0.4,
  z: (K.dome[0][0] + ((K.dome[1][0] - K.dome[0][0]) * K.mouth.y) / K.dome[1][1]) * 0.96 + 0.25,
} as const;

/** Tug funnel top in the tug frame (bow +z, keel y 0; sailboat v9 `smoke` hook). */
export const TUG_FUNNEL = {
  y: DEVOPS_M26.tug.hullH + 1.78,
  z: DEVOPS_M26.tug.funnelZ - 0.35,
} as const;
