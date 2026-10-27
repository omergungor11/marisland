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
