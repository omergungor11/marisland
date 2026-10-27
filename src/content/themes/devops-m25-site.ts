/**
 * DevOps M25 "DevOps I" placement + motion (TASK-507, D-089): where the TASK-504 kit stands on the
 * TASK-503 growth anchors (world/gen/plans/devops-m25.ts) and how it moves (render/movers.ts,
 * render/culture-movers.ts, world/funicular.ts). Distances in u, times in s, angles in degrees.
 */
import { DEVOPS_M25 } from './devops-m25.ts';

export const DEVOPS_M25_SITE = {
  /**
   * D4 funicular: rackShed v2 stations on the three `funicular0..2` anchors, two sections (foot →
   * mid, mid → top) of zig-zag legs between them, `funicularRail` pieces along every leg.
   */
  funicular: {
    /** Station rect (shed + platform + track stub; along local x / z) and its centre offset along +z. */
    station: { w: 4.6, d: 4.8, z: 0.35, padMargin: 0.4 },
    /**
     * The mid station is re-sited (on the foot → top line, nearest half height, ≤ `midSide` off it,
     * relief ≤ `midRelief`) when the anchor takes a share of the rise outside `midShare` or stands
     * within `minSection` u of the top.
     */
    midShare: [0.3, 0.72] as const,
    minSection: 10,
    midSide: 8,
    midRelief: 5.5,
    /** Rail start / end: the stub end in front (+z), behind the back wall (−z, the mid station). */
    stubFront: 2.0,
    stubBack: 1.5,
    /** Zig-zag search: legs per section, lateral swing (±W off the station axis). */
    legs: [1, 2, 3, 4, 5, 6, 7] as const,
    swing: [2.5, 4, 5.5, 7, 8.5, 10, 11.5, 13] as const,
    /** Candidates (by the cheap grade pre-score) that get the full levelling. */
    level: 14,
    /** Candidates per section reserved before the pads; the best on the final ground is built. */
    keep: 4,
    minLeg: 4.5,
    /** Corridor: shore distance, gap to other obstacles, reserved strip width. */
    minShore: 1.5,
    gap: 0.5,
    strip: 2.4,
    /** Score: leg count and length weights on top of the levelling cost. */
    perLeg: 0.6,
    perU: 0.03,
    /** A section is not built past this grade-line cost (mean earthwork u² per piece + miss). */
    maxCost: 3,
    /**
     * Vertex lanterns (lavaLantern): tried this far out from the vertex on the outer side of the
     * turn (± 26° / 52°), first spot clear of the car sweep whose ground varies ≤ `lanternRelief`
     * within `lanternR` (else no lantern there).
     */
    lantern: [3.0, 3.6, 4.3] as const,
    lanternR: 0.35,
    lanternRelief: 0.55,
  },
  /** Rail grade line (world/funicular.ts): run per piece, rail top over the pivot, search. */
  rail: {
    piece: 3,
    clearance: 0.55,
    /** Rise per pitch step per unit run (DEVOPS_M25.rail.pitches = 0, 0.3, 0.6). */
    pitchStep: 0.3,
    maxStep: 2,
    /** Grade-line search: state resolution, states kept per piece, cost per u² of top-stub miss. */
    res: 0.05,
    keep: 64,
    missCost: 6,
    /** Earthworks: the ground is cut / filled to the pivot line in the core, blended across `fall`. */
    core: 1.3,
    fall: 2.6,
    /** …but never within this of another obstacle (lot, fixture, rail, reservation). */
    keepOff: 1.2,
  },
  /** D13 ore cableway: mailLine v3 at both ends, v2 mid pylons at most `span` apart. */
  cableway: {
    span: 15,
    /** Bucket bottom (= cable − grip) at least this far over the ground. */
    clear: 0.9,
    maxPylons: 6,
    pylonR: 1.1,
  },
  /**
   * D14 smiths' lane: goodsStall v7 rows facing across the lane, `pitch` apart, `inset` in from the
   * strip's long edges; each on a disc pad (`padR` + `padMargin`), skipped where that pad's falloff
   * would reach a pad core more than `levelGap` u off its level (then unpadded, relief ≤ `maxRelief`).
   */
  smiths: { pitch: 2.3, inset: 0.85, padR: 1.0, padMargin: 0.3, levelGap: 0.8, maxRelief: 0.6 },
  /** D9 onsen town: onsenHouse v1 / v2 along the bank, facing the pool. */
  onsen: { house: [5.3, 3.6] as const, gap: 0.3, max: 3, padMargin: 0.8, capybaras: 1.6 },
  /** D7 geyser field: geyserCone fixtures on a hashed grid in the field rect. */
  geysers: { min: 4, max: 6, spacing: 3.6, inset: 1.6, padMargin: 0.6, area: 32 },
} as const;

/**
 * Motion (closed forms of the sim time / culture clock; reduced motion via `uMotionScale`).
 */
export const DEVOPS_M25_MOTION = {
  /** D4 cars: one-way trip, dwell at the stations, turn at each zig-zag vertex (pivot). */
  car: {
    oneWay: 30,
    dwell: 6,
    turn: 2.4,
    /**
     * Cycle offset of every car (share of the 72 s cycle): seed 1001's lower car turns at its
     * first switchback at sim 5 s (the Funicular Dawn preset, 06:00 + 5 s).
     */
    phase: 0.125,
    /** Pitch chord half-length along the leg (u). */
    chord: 1.5,
    /** Dither fade by camera distance (u); hidden 20 u past `fadeFar`. */
    fadeNear: 170,
    fadeFar: 240,
  },
  /** Vertex lanterns flare while a car is within `radius` u (night / dawn only). */
  lamp: { radius: 6, r: [0.18, 0.42] as const, color: '#FFB066', y: 1.8 },
  /** D13 buckets: count per line, speed (u/s), tip at the furnace, grow / shrink at the ends. */
  bucket: { count: 4, speed: 1.3, tip: 1.6, tipDeg: 95, pop: 0.7, sway: 0.06 },
  /**
   * D14 trip hammer in front of each smith's stall (stall frame, +z = toward the lane, out past
   * the awning so it reads from above): a block anvil (`anvil` = its top centre, `block` = half
   * width / depth) with a glowing workpiece, the hammer on a post (`hinge`), its `head` (half
   * sizes) striking at 1.1 Hz on a hashed phase per stall, `lift` = raise (rad); every strike
   * flashes and throws three sparks (D15).
   */
  hammer: {
    period: 1 / 1.1,
    anvil: [0.45, 0.55, 1.3] as const,
    block: [0.2, 0.15] as const,
    hinge: [0.45, 1.05, 0.62] as const,
    head: [0.1, 0.09, 0.13] as const,
    work: 0.07,
    lift: 0.8,
    iron: '#4B505C',
    handle: '#8A6A48',
    flash: { r: [0.1, 0.3] as const, color: '#FFB066', life: 0.2 },
    sparks: { n: 3, spread: 0.7, rise: 0.6, life: 0.34, size: 0.075, color: '#FF8A3D' },
  },
  /** D7 geysers: hashed period / phase, eruption length, column and steam; 17:30 shift end. */
  geyser: {
    period: [18, 30] as const,
    erupt: 4.5,
    column: 6,
    blobs: 6,
    width: 0.5,
    color: '#EAF6F4',
    puffs: 8,
    puffSize: [1.0, 3.2] as const,
    puffLife: 2.6,
    opacity: 0.9,
    edge: 0.45,
    /** Every cone erupts together at this culture-clock ritual (rhythm slot `seconds` there). */
    ritual: 'shiftEnd',
    ritualSeconds: 12,
  },
} as const;

/**
 * World position of an ore pylon's cable seat (mailLine v2 / v3, DEVOPS_M25.ore.anchor; v2 `back`
 * = the seat facing away from its front) for a pylon at ground pivot `p` with worldgen yaw `rotY`
 * (local +z = (cos rotY, sin rotY), the mailAnchorWorld convention).
 */
export function oreAnchorWorld(
  variant: number,
  p: { x: number; y: number; z: number },
  rotY: number,
  back = false,
): { x: number; y: number; z: number } {
  const O = DEVOPS_M25.ore;
  const vi = variant - O.pylonVariants[0];
  const [, ay, az] = back && vi === 0 ? O.back : O.anchor[vi];
  return { x: p.x + az * Math.cos(rotY), y: p.y + ay, z: p.z + az * Math.sin(rotY) };
}
