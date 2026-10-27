/**
 * QA "Customs Port" kit (M30 TASK-506; D-082, WORLD_PLAN §4.5): the cove-mouth Q8 scanner arch, the
 * QA-tone cargo ship, the quay crane, the inspection line, QA-tone containers and the Q9 quarantine
 * pontoon. Size / colour tables of geo/themes/qa-customs.ts; defs: content/props-themes/qa-customs.ts.
 * The palette is the Proving Grounds toy-factory one (white / mint / yellow) plus the two lamp
 * lenses (lit / dim) and the warm window; nothing else.
 *
 * The containers are DevOps' (content/props-themes/devops.ts DEVOPS_WORKS.container, 5 x 2.1 x 2) at
 * a 0.72 scale and in QA tones, so the cargo ship, crane spreader, conveyor and stacks agree on one size.
 */
import { PROVING_PAL as P } from './qa-proving.ts';

export const CUSTOMS_PAL = {
  ...P,
  window: '#FFC870',
  lampGreen: '#4FE0A0',
  lampGreenDim: '#2E6E57',
  lampRed: '#E35D6A',
  lampRedDim: '#7A3B45',
} as const;

const C = CUSTOMS_PAL;

/** Container size (length x, width z, height) shared by every piece of the kit. */
const CONTAINER = { l: 3.6, w: 1.5, h: 1.5 } as const;

export const QA_CUSTOMS = {
  container: {
    ...CONTAINER,
    /** Body colours in pick order (white, mint, yellow, sky, deep mint). */
    colors: [C.white, C.mint, C.yellow, C.sky, C.mintMid] as const,
    door: C.rubber,
    /** The stencil plate on both long sides. */
    plate: C.yellow,
    check: C.mintMid,
  },
  /** Loose stack (variant 4 of customsYard): columns side by side along z, `tiers` containers each. */
  stack: { tiers: [2, 2, 1] as const, gap: 0.1 },

  /**
   * Q8 scanner arch (tier 2 def, > 3 u so drawn from T0): lattice posts at +-postX, a box girder at
   * `girderY`, a mint gable roof, a faceted prism lens on the crown. The channel runs along local z
   * (the ship passes under it); `clear` is the free height under the scan head, `halfClear` the free
   * half width between the posts. The chase strip is `bulbs` marquee bulbs per face (front L to R,
   * then back R to L = one loop).
   */
  arch: {
    postX: 4.9,
    plinth: 0.45,
    girderY: 7.5,
    girderH: 1.0,
    girderD: 1.4,
    clear: 7.1,
    halfClear: 4.05,
    bulbs: 18,
    bulbR: 0.18,
    bulbY: 8.05,
    roofH: 0.85,
    prismH: 1.0,
    chordBase: 0.62,
    chordTop: 0.46,
    bays: 3,
    footprint: 5.7,
  },

  /**
   * Quay crane (customsYard v0 loaded, v1 empty rig): portal gantry, legs at (+-legX, +-legZ), girders
   * from backZ to boomZ (the boom reaches out over the water at +z). The trolley rides z in
   * `trolleyZ`, the spreader hangs from it between `spreaderUp` and `spreaderDown` (frame TOP height).
   */
  crane: {
    legX: 2.4,
    legZ: 3.0,
    top: 7.6,
    boomZ: 8.6,
    backZ: -4.2,
    leg: 0.34,
    trolleyZ: [-1.5, 8.0] as const,
    trolleyHome: 5.2,
    spreaderUp: 6.4,
    spreaderDown: 1.75,
    spreaderHome: 4.6,
    spreaderLen: 3.9,
    spreaderW: 1.2,
    body: C.white,
    bodyDark: C.mintDeep,
    steel: C.steel,
    cab: C.white,
    cable: C.rubber,
    footprint: 6.2,
  },

  /**
   * Inspection line (customsYard v2 green lamp lit, v3 red lamp lit): belt along local x (length
   * `len`, container wide), a mini scanner portal over the middle, the inspector booth behind it (-z),
   * the check / reject lamp pair on a post at the +x end, in front (+z) of the belt.
   */
  line: {
    len: 12,
    width: 1.9,
    beltY: 0.72,
    portalX: -1.4,
    portalH: 3.0,
    booth: { x: 2.2, z: -2.7, w: 2.3, d: 1.9, h: 2.4 },
    lamp: { x: 6.5, z: 1.9, postH: 2.3, r: 0.24 },
    footprint: 6.6,
  },

  /** Cargo ship mover (not a def): hull length (z), beam, deck height, bow taper, the container slots. */
  ship: {
    l: 17,
    beam: 4.6,
    deck: 1.2,
    taper: 2.4,
    hull: C.white,
    hullLow: C.mintDeep,
    trim: C.yellow,
    deckCol: C.steel,
    bridge: C.white,
    roof: C.mint,
    funnel: C.yellow,
    /** Slot grid: column x offsets, bay z centres (stern to bow), upper tier on these bays. */
    colX: [-0.85, 0.85] as const,
    bayZ: [-2.9, 0.9, 4.7] as const,
    upperBays: [1] as const,
  },

  /** Q9 quarantine pontoon layouts (variants 0..2): raft w x l, tents / crate stacks / lamp (raft frame). */
  pontoon: {
    deck: 0.6,
    lampH: 2.4,
    lampR: 0.2,
    hull: C.white,
    waterline: C.mintDeep,
    plank: C.mint,
    tent: [C.yellow, C.white] as const,
    layouts: [
      {
        w: 5,
        l: 6,
        tents: [{ x: 0, z: -1.1, yaw: 0 }],
        crates: [
          { x: 1.4, z: 1.7, n: 2 },
          { x: -1.3, z: 1.9, n: 1 },
        ],
        lamp: { x: 1.7, z: -2.3 },
      },
      {
        w: 4.6,
        l: 5.2,
        tents: [],
        crates: [
          { x: -1.2, z: 1.3, n: 3 },
          { x: 0.1, z: 1.5, n: 2 },
          { x: 1.3, z: 1.1, n: 1 },
          { x: 0, z: -0.8, n: 2 },
        ],
        lamp: { x: -1.6, z: -1.8 },
      },
      {
        w: 6.4,
        l: 4.6,
        tents: [
          { x: -1.5, z: -0.2, yaw: 0.2 },
          { x: 1.5, z: 0.3, yaw: -0.2 },
        ],
        crates: [{ x: 0, z: 1.6, n: 2 }],
        lamp: { x: 0, z: -1.7 },
      },
    ] as const,
    footprint: 3.4,
  },
} as const;

/** Hazard stripe pair (yellow / dark rubber) used on the posts, legs and spreaders. */
export const HAZARD = [C.yellow, C.rubber] as const;

/** customsYard variants (the one def holding the crane, the inspection line and the loose stack). */
export const CUSTOMS_VARIANT = {
  craneLoaded: 0,
  craneEmpty: 1,
  lineOk: 2,
  lineReject: 3,
  stack: 4,
} as const;

/**
 * Customs Port layout (M30 TASK-508; D-087; world/gen/customs-port.ts, plans/qa-customs.ts). Crane frame
 * (u): origin at the quay crane (customsYard v1), `x` along the quay (the line always on +x), `z`
 * seaward; the waterline is `shoreZ` seaward of the crane. The cove terrace is only ~14 u deep and
 * ~24 u long, so the quay is compact: crane + ONE inspection line (v2, the check lamp lit; the cross lamp
 * is lit by a mover glow), rejected crates lobbed from the belt end onto the landing pontoon, an
 * optional container stack (v4). The ship sails in from the open sea along a straight lane (`laneDeg`
 * off the quay, side `sl` = +-1), rounds one arc of radius `turnR` onto the line parallel to the quay at
 * `laneZ`, slides in to the berth, and leaves the way it came after a spin on the spot.
 */
export const CUSTOMS_PORT = {
  shoreZ: 3.4,
  /** The land strip that carries the crane and the line (centre x, z, w, d), level pad margin, relief cap. */
  strip: { x: 5.4, z: -1.7, w: 17.6, d: 4.6, pad: 0.6, relief: 2.4, minShore: 0.2 },
  /** The optional stack tolerates a rougher pad (relief cap) than the quay. */
  stackRelief: 3.4,
  /** The inspection line (customsYard v2) and the optional stacks (v4), tried in order. */
  okLine: { variant: 2, x: 6.3, z: -1.5 },
  stacks: [
    { variant: 4, x: 16.6, z: -1.5, w: 4.4, d: 5.6 },
    { variant: 4, x: 15.5, z: -7.5, w: 4.4, d: 5.6 },
    { variant: 4, x: -7.8, z: -1.5, w: 4.4, d: 5.6 },
    { variant: 4, x: 6.3, z: -9.2, w: 4.4, d: 5.6 },
  ] as const,
  /** Crane drop point on the belt (frame z), belt top height. */
  dropZ: -1.5,
  beltTop: 0.66,
  /** Ship berth: centre z, offset of the centre along the quay so bay 1 hangs under the crane. */
  berthZ: 5.9,
  bayShift: 0.9,
  /** The turn-around spot (hull half length 8.5 clears the quay), lane angle, arc radius. */
  laneZ: 12.6,
  laneDeg: 34,
  turnR: 20,
  /** Lane lengths from the corner V to the spawn point and to the arch, per fallback pass (longest first). */
  lanes: [
    { spawn: 31, arch: 19 },
    { spawn: 24, arch: 14.5 },
    { spawn: 18, arch: 11 },
  ] as const,
  /** Pontoons (frame): the landing one first (variant 0); `lane: true` sits on the side opposite the ship lane. */
  pontoons: [
    { variant: 0, x: 14, z: 9, turn: 0.35, lane: false },
    { variant: 2, x: 21, z: 13.8, turn: -0.3, lane: false },
    { variant: 1, x: -14.5, z: 17, turn: 0.2, lane: true },
  ] as const,
  /** Where a rejected crate rests on the landing pontoon (pontoon frame), stacked crates add `stackH`. */
  landing: { x: 0.05, z: 1.25, stackH: 0.7 },
  /** Water depth (u) of the dredged lane and berth. */
  carveDepth: 1.1,
  carveCore: 3.1,
  carveFall: 1.8,
  /** Discs (u) the boat routes keep out of: round the spin spot, along the lane, round the pontoons. */
  keepOut: { spot: 11, lane: 7, pontoon: 5 },
  /** Clearances: other land round the hull on the lane, round the spin spot (centre). */
  landGap: 3.2,
  spotClear: 7.2,
} as const;

/**
 * Customs Port motion (closed form in the culture-clock day seconds, so a capture replays it). One visit
 * per `period` s from noon on, `openHour` .. `closeHour` only. Times in s from the visit start.
 */
export const CUSTOMS_MOTION = {
  noon: 12,
  period: 36,
  openHour: 8,
  closeHour: 20,
  /** Arrival along the lane (ease in / out), slide to the berth. */
  arrive: { t: 0, dur: 9, easeIn: 1.2, easeOut: 2.6 },
  slideIn: { t: 9, dur: 2.6 },
  /** Crane jobs: ship slot ids unloaded (top tier first), start, step durations, return home. */
  jobs: {
    slots: [3, 5, 2] as const,
    start: 11.8,
    steps: { out: 1, down: 0.5, latch: 0.2, up: 0.5, back: 0.75, set: 0.55 },
    home: 1.2,
  },
  /** Departure: slide out, spin on the spot, sail out. */
  depart: { t: 21.1, slide: 2.6, spin: 3, leave: 8, easeIn: 2.4 },
  /** Belt ride speed (u/s), dwell before the ride, lamp pulse length. */
  belt: { speed: 2.8, dwell: 0.3, pulse: 1.8 },
  /** Rejected crate flight (s), apex (u), shrink scale at the landing, spin turns. */
  toss: { dur: 1.1, apex: 3.4, scale: 0.42, turns: 1 },
  /** The visit before leaves its rejected crates on the pontoon until here, then they sink (s into the next visit). */
  clear: { t: 3.6, dur: 1.4 },
  /** Verdict patterns of the three crates (1 = rejected), picked by the visit index. */
  patterns: [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
    [1, 0, 1],
    [0, 1, 1],
  ] as const,
  /** Ship bob (u), pop-in / pop-out length (s), ripples. */
  bob: { y: 0.05, period: 3.1 },
  pop: 1.3,
  ripple: { rings: 3, r0: 0.8, r1: 5.5, life: 1.4, color: '#EAFBF3' },
  scanColor: '#7CFFB0',
  badColor: '#FF6E7C',
} as const;
