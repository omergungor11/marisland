/**
 * Marketing "Carnival Pier" (M31 TASK-536, D-126; study `mar-plans/study/harbours.html`): the numbers
 * of the boardwalk, its small Ferris wheel, the WELCOME screen, the bulb arches and the confetti
 * cannons on the shared harbour skeleton (content/harbours.ts `marketing`), and of the ferry arrival
 * ritual. Placement: world/gen/plans/marketing-harbour.ts; geometry: geo/themes/marketing-harbour.ts;
 * motion: render/culture-movers.ts, render/movers.ts. Lengths in u.
 *
 * No new def, no ledger entry: the deck is `sailboat` v10, the wheel a scaled `ferrisWheel`, the
 * screen `billboardV2` v4, the arches `bunting` v5, the cannons `confettiCannon` v0.
 */

/** Stroke letters of the WELCOME screen: polylines in the unit box (x right, y up). */
export const WELCOME_FONT: Readonly<
  Record<string, readonly (readonly (readonly [number, number])[])[]>
> = {
  W: [
    [
      [0, 1],
      [0.25, 0],
      [0.5, 0.62],
      [0.75, 0],
      [1, 1],
    ],
  ],
  E: [
    [
      [1, 1],
      [0, 1],
      [0, 0],
      [1, 0],
    ],
    [
      [0, 0.5],
      [0.78, 0.5],
    ],
  ],
  L: [
    [
      [0, 1],
      [0, 0],
      [1, 0],
    ],
  ],
  C: [
    [
      [1, 0.84],
      [0.76, 1],
      [0.24, 1],
      [0, 0.8],
      [0, 0.2],
      [0.24, 0],
      [0.76, 0],
      [1, 0.16],
    ],
  ],
  O: [
    [
      [0.24, 0],
      [0.76, 0],
      [1, 0.2],
      [1, 0.8],
      [0.76, 1],
      [0.24, 1],
      [0, 0.8],
      [0, 0.2],
      [0.24, 0],
    ],
  ],
  M: [
    [
      [0, 0],
      [0, 1],
      [0.5, 0.42],
      [1, 1],
      [1, 0],
    ],
  ],
};

export const CARNIVAL_PIER = {
  /**
   * The boardwalk (`sailboat` v10, a floating fixture: one solid piece, one draw group, no near merge
   * of dozens of pier pieces): a `w` × `d` deck on piles off the pier's open side (away from the arm),
   * its top at the skeleton's `kit.deckY`, its sea edge `headGap` u short of the T crossbar. The seabed
   * (and any spit of land) stays under `maxGround` everywhere on it, searched shoreward from the head in
   * `step` u steps for at most `slide` u. `gap`: u off every other reserved shape.
   */
  deck: {
    variant: 10,
    w: 12,
    d: 4.8,
    /** Plank top over the water (= the skeleton's `kit.deckY`, the test pins it). */
    top: 0.7,
    /** Half width of the pier's own planks (the wing's inner edge touches them). */
    pierHalf: 0.6,
    headGap: 0.4,
    step: 0.5,
    slide: 5,
    maxGround: 0.2,
    gap: 0.6,
    /** Boat routes keep this much off the deck's edge. */
    keepOut: 1.6,
    /** Geometry: planks along z, `plank` u each; slab `thick` under them; a pile row every `pile` u. */
    plank: 0.46,
    gapTone: '#7C5E45',
    tones: ['#C9A57F', '#BE9872', '#D2B08A', '#B9936E'] as const,
    thick: 0.16,
    beam: '#8A5A3B',
    pile: 2.4,
    pileR: 0.13,
    pileColor: '#A8754F',
    /** A pennant on the far corner (`pole` u high, `flag` u long), the only cloth on the deck. */
    pennant: { pole: 1.6, flag: 0.55, color: '#E35D6A', wind: 0.12 },
    height: 2.35,
  },
  /**
   * The small wheel: `ferrisWheel` at `scale`, its centre `out` u from the deck's far end, mid depth.
   * Everything on the planks stands at the skeleton's deck height (`kit.deckY`).
   */
  wheel: { scale: 0.6, out: 3 },
  /** The WELCOME screen (`billboardV2` v4): centre `out` u from the deck's pier edge, at the back. */
  screen: {
    variant: 4,
    out: 2.8,
    back: 0.75,
    w: 5,
    h: 2.5,
    /** Board bottom over the planks. */
    y: 0.95,
    frame: 0.17,
    depth: 0.2,
    word: 'WELCOME',
    /** Letter box height (share of the board), letter width (share of its slot), stroke. */
    letterH: 0.52,
    letterW: 0.72,
    stroke: 0.13,
    /** The word's centre above the board's centre; the bar under it. */
    wordY: 0.18,
    bar: { w: 3.2, h: 0.16, y: -0.82, color: '#F5C84C' },
    face: '#C93A4E',
    ink: '#FFFFFF',
    frameColor: '#FFF4E0',
    post: '#7A3B46',
    /** Chasing bulbs along the top and bottom of the frame (per edge). */
    bulbs: 11,
    bulbR: 0.075,
    bulbColors: ['#FFC870', '#FFF4E0', '#FF8FB1'] as const,
    height: 3.75,
  },
  /**
   * Bulb arches (`bunting` v5): over the pier every `pierEvery` segments from `pierFrom`, and across
   * the deck at `deckScale`, `deckAt` u from its far end (the end itself only: an arch between the
   * wheel and the screen stands its sea pole in front of the board from every oblique sea view,
   * TASK-556), so none crosses the screen seen from the sea. Poles at ± w / 2, a hoop of chasing
   * bulbs rising `rise` over them.
   */
  arch: {
    variant: 5,
    w: 2.5,
    poleH: 2.1,
    rise: 0.5,
    bulbs: 9,
    bulbR: 0.085,
    wind: 0.05,
    pole: '#FFF4E0',
    band: '#E35D6A',
    cable: '#5A4A55',
    bulbColors: ['#FFC870', '#FFF4E0', '#FF8FB1'] as const,
    height: 2.75,
    pierFrom: 1,
    pierEvery: 2,
    deckScale: 1.6,
    deckAt: [0.15] as const,
  },
  /**
   * Lantern posts (their street pools light the water): on the deck's sea edge `at` u from its far end
   * (clear of the screen's letters from the sea), and on the T crossbar's back corners `head` [u, v].
   */
  lantern: {
    variant: 0,
    at: [0.3, 4.6, 11.7] as const,
    inset: 0.3,
    head: [-0.9, 3.7] as const,
  },
  /** Confetti cannons on the T crossbar: `v` u either side of the pier axis, splayed `splay` rad out. */
  cannon: { variant: 0, v: 2.6, u: 0.1, splay: 0.4 },
} as const;

/**
 * The sea-top fun park's site (M53 TASK-671, D-172): how the ring platform (`LUNA_KIT.deck`) is fitted
 * beside the ferry pier and joined to it. Placement: world/gen/plans/marketing-luna.ts; the pieces and
 * their suggested layout: content/themes/marketing-luna.ts. Lengths in u.
 */
export const LUNA_SITE = {
  /** Fit tiers (LUNA_KIT.deck index): M first, then S; none = the small Carnival deck above. */
  tiers: [1, 0] as const,
  /**
   * The gangway: `dock` pieces (2 u each, pier look) in a straight run from the T crossbar's end to the
   * gate at the platform's pier edge, `pieces` long; the platform slides `slide` u along the pier from
   * the crossbar (+ = seaward), at most `skewDeg` off square to the pier. The platform's pier edge stays
   * `approachGap` u outside the ferry's approach corridor.
   */
  gangway: { pieces: [2, 8] as const, slide: [-4, 14] as const, skewDeg: 42, half: 0.6 },
  approachGap: 1.5,
  /**
   * Seabed limits (u, world height): under the ring and the pool (the piles reach 0.4 u under the
   * waterline, the boats float), and under the coaster's sea half (its columns stand in the water).
   * `dry`: no land within this much of the platform; `clearOther`: no other island's land within this.
   */
  seabed: { deck: -0.4, coaster: -0.1 },
  /**
   * The bed under the platform (and the coaster's sea half) is filled up to `y` where deeper, out to
   * `edge` u past it, blending back over `fall` u, so the couriers, which only read the depth
   * (COURIER.route.depth 1.2 u, life/courier-route.ts), sail round the park. Not seen: the water's
   * colour follows the shore distance and the deep band is opaque.
   */
  shoal: { y: -1, edge: 2.2, fall: 1.5 },
  dry: 1.5,
  clearOther: 8,
  /** u off every other reserved shape. */
  gap: 0.6,
  /**
   * Boat routes, couriers and seamarks: discs `disc` u apart over the platform, reaching `keepOut` u past
   * its corners; the smoothed routes keep `hard` × the radius off each centre (≈ 0.9 u off the edges).
   */
  keepOut: 1.6,
  disc: 4,
  hard: 0.8,
  /** The coaster's sea half: its loop hangs `overhang` u past the platform's shore edge. */
  overhang: 3.6,
  /**
   * The WELCOME screen on the sea strip, back to the pool, in the widest gap between the stands (at
   * least the board + 2 `pad`); the two carts on the carousel's side close up from `edge` u off its
   * pad first, and when no gap is wide enough the popcorn cart (`dropCart`) gives way.
   */
  screen: { pad: 0.1, edge: 0.6, dropCart: 'cart1' },
  /** The ticket booth: on the pier strip beside the gate, else off the far strip (`booth.far` u in). */
  booth: { gap: 0.3, far: 1.6 },
  /** Bulb arches (bunting v5) over the gangway's middle and across the stroll on the far and sea strips. */
  arches: { minGangway: 3 },
  /**
   * The visitor stroll: a loop round the ring `x` u off the pool rail on the pier / far strips and `z` u
   * on the shore / sea strips, round each corner ride at its reach + `rideGap`, a point every ≈ `step` u.
   */
  stroll: { x: 1.6, z: 2.2, rideGap: 0.3, step: 2 },
  /** Browse spots `front` u in front of each stand. */
  stall: { front: 0.7 },
} as const;

/** The ferry arrival ritual: every number keys off `sinceFerryArrival` (life/ferry.ts). */
export const CARNIVAL_MOTION = {
  arrival: {
    /** Scene range (u). */
    range: 170,
    /** The harbour light's flash and the berth's ripple (`harbourArrivalScene`). */
    flash: { r: 0.72, period: 0.9, pulses: 2, color: '#FFF0C0' },
    ripple: {
      rings: 2,
      period: 2.2,
      r0: 1.2,
      r1: 4.2,
      tube: 0.3,
      color: '#F2FFFF',
      y: 0.06,
      lastS: 4.4,
    },
  },
  /** Each cannon's burst (cannon frame, muzzle / barrel as the fair's), `delay` s apart. */
  confetti: {
    pieces: 30,
    delay: [0.1, 0.4] as const,
    life: 7,
    /** Shrink-out at the end of life, s (smoothstep). */
    fade: 1.8,
    speed: [4, 8] as const,
    spread: 0.7,
    tau: 0.9,
    fall: 0.9,
    size: 0.36,
    /** Local height where a piece settles: the water under the T crossbar. */
    floor: -0.65,
  },
  /**
   * The screen's flash: `pulses` blinks `period` s apart from `delay` s after the arrival, each lit for
   * `on` × the period. TASK-555: the frame flashes, the word stays: four lit strips over the frame
   * ring and `edge` u past it, `z` u proud of the face, swelling `pop` × the board at a blink's peak.
   */
  flash: {
    delay: 0.1,
    pulses: 5,
    period: 0.42,
    on: 0.45,
    pop: 0.03,
    edge: 0.18,
    z: 0.02,
    color: '#FFD45C',
  },
  /** The wheel gains `turns` whole extra turns over `seconds` s after each arrival (closed form). */
  wheel: { turns: 1, seconds: 18 },
} as const;
