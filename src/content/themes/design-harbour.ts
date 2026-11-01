/**
 * Design "Colour Wharf" (M31 TASK-537, D-112 / D-127; study `mar-plans/study/harbours.html`): the
 * Design instance on the harbour skeleton. Plan: world/gen/plans/design-harbour.ts, geometry:
 * geo/themes/design-harbour.ts, ritual: render/culture-movers.ts. Lengths in u, hours in game hours,
 * times in sim seconds. All three kit pieces are VARIANTS of old defs, so the Design ledger stays 15:
 *   boathouse  glasshouse v5.. (the row-reads-from-T0 def, 5 pastels)
 *   pavilion   conservatory v1 (the small octagon the pier runs through)
 *   paint pot  buoy v3.. (4 paint colours, one shared LOD1)
 */

/** Paint colours in hue order: boathouse walls, paint pots, the ritual's lights and streaks. */
export const WHARF_PASTELS = ['#FF8FB8', '#FFD76E', '#86D6FF', '#B79BEA', '#8CE3BE'] as const;

/** First added variant of each old def (random rolls never reach them, `rollVariants`). */
export const WHARF_VARIANTS = { boathouse: 5, pavilion: 1, paintPot: 3 } as const;

export const WHARF_GEO = {
  /**
   * Boathouse: pivot on the waterline, floor on stilts over it, door (+z) to the sea. `w` across the
   * shore, `d` along the slip; `floorY` over the water, `wallH` to the eaves, `roofRise` of the gable.
   */
  boathouse: {
    w: 2.7,
    d: 4,
    floorY: 0.55,
    wallH: 1.5,
    roofRise: 0.95,
    stiltDown: 1.6,
    door: { w: 1.5, h: 1.2 },
    window: { w: 0.6, h: 0.42, y: 1.72 },
    /** Roof = the wall's paint × this (the row reads by its roofs from above). */
    roofShade: 0.8,
    trim: '#FFFDF7',
    pile: '#8A6A4C',
    deck: '#B98D62',
    /** The dark door, the window glow (emissive < 1: window class) and the hull inside. */
    doorDark: '#4D4358',
    glow: '#FFE2A8',
    hull: '#F7F1E4',
  },
  /**
   * Glass waiting pavilion: an octagon `r` u (circumradius) astride the pier, the pier's axis through
   * its two open bays (local ±z, the same bays as the big conservatory). Floor on the pier's deck.
   */
  pavilion: {
    heightNominal: 5.5,
    r: 2.6,
    deckR: 3,
    deckY: 0.7,
    wallH: 2.35,
    bayW: 1.5,
    doorH: 1.75,
    ringR: 1.55,
    ringH: 0.95,
    domeH: 0.8,
    finial: 0.14,
    pileDown: 2.3,
    frame: '#8E6FD8',
    frameDeep: '#6E52B4',
    deck: '#E9DDCB',
    bench: '#B98D62',
    lamp: '#FFE2A8',
    /** Pane order round the octagon. */
    panes: ['lavender', 'sky', 'pink', 'mint', 'sun', 'violet'] as const,
  },
  /** Paint pot buoy: a pot with a paint-coloured rim, wire handle and a drip, on a float. */
  paintPot: {
    heightNominal: 0.95,
    footprint: 0.4,
    r: 0.3,
    h: 0.56,
    y0: 0.08,
    float: { r: 0.42, h: 0.22 },
    can: '#ECE6DA',
    handle: '#5C6170',
  },
} as const;

/** Where the wharf goes. */
export const WHARF_SITE = {
  /**
   * The boathouse row walks the coast contour `offset` u inland at `spacing` u a house, door to the
   * sea, `count` [min, max] houses. A house needs `frontWet` u out (height ≤ `frontY`), still sea
   * `openWet` u out (so no row up the creek), the old coast (`maxOffArm` u, not the new arm), ground
   * ≤ `rearMax` under its back wall, `streamClear` u off the stream line and no obstacle within `gap`.
   * Tiers: a row within `mouthReach` u of the stream mouth (the study's site), else the fallback:
   * the nearest row within `rootReach` u of the pier root (no stream on that stretch of coast).
   * `gapSteps`: how many unusable spots a row may jump.
   */
  row: {
    offset: 0.5,
    spacing: 3.1,
    /** Two neighbours keep this far apart where the coast curves in (their roofs must not cross). */
    minPitch: 2.7,
    /** And this far off the plan's linked path pins (the glass bridge's ends). */
    pinKeep: 3.2,
    count: [3, 5] as const,
    frontWet: 2.6,
    frontY: -0.12,
    openWet: 6,
    maxOffArm: 1.5,
    rearMax: 1.5,
    streamClear: 1.6,
    gap: 0.25,
    mouthReach: 15,
    rootReach: 44,
    gapSteps: 1,
    /** Score: per house missing (u), per u from the mouth, per u from the pier root. */
    houseCost: 9,
    mouthCost: 1,
    rootCost: 0.2,
  },
  /** The pavilion stands `at` of the pier's length along it, at least `minRoot` u past the root. */
  pavilion: { at: 0.58, minRoot: 4.6, maxWaterY: -0.05, keep: 3.2 },
  /**
   * The lantern boat's mooring and its way in and out (one-way lanes `lane` u either side of the
   * basin mouth's centre line, so it never meets itself): `back` u short of the pier end it turns,
   * `moor` u short of the pier end it stands, bow to the sea; `sea` u past the pier end the lanes
   * meet the open water. A sample must keep `minDepth` deep, `shore` u off land, `clear` u off the
   * pier, T-head and pavilion, else the lanes try `shift` u steps across the mouth.
   */
  lantern: {
    lane: 1.5,
    moor: 3.2,
    back: [8.2, 6.6, 5.2] as const,
    sea: 11,
    minDepth: 0.3,
    shore: 0.7,
    clear: 0.9,
    shift: [0, 0.6, -0.6, 1.2, -1.2, 1.8, -1.8, 2.4, -2.4] as const,
    sample: 0.5,
    keepOut: 2.2,
  },
  /**
   * Paint-pot buoys: a line down the lagoon, `inset` u inside the arm's crest line, `spacing` u apart
   * from `first` u past the tip (the arm's mouth end lights first), `count` [min, max]. A buoy needs
   * `minDepth`, `shore` u off land, `routeClear` u off the lantern boat's lanes.
   */
  buoys: {
    inset: [3.8, 3.2, 4.4, 2.6] as const,
    first: 0.5,
    spacing: 3.2,
    count: [4, 7] as const,
    minDepth: 0.2,
    shore: 0.8,
    routeClear: 1.6,
    keepOut: 1,
  },
} as const;

/** Motion. The ferry's arrival runs on the shared call clock (life/ferry.ts). */
export const WHARF_MOTION = {
  arrival: {
    /** Envelope: up, down and the seconds it lingers after the boat leaves. */
    rise: 1.2,
    fall: 2.5,
    linger: 3,
    range: 150,
    /** Buoys light in turn: seconds between two, the glow's radius and height over the pot. */
    buoys: { step: 0.7, r: 0.3, y: 0.98, ring: { r: 1.5, y: 0.05, tube: 0.1, period: 2.4 } },
    /**
     * Prism: one sheet of colour per glazed face (`faces`, local angle from +z), hues walking round
     * the pastels `rate` per second; `throw` light patches fall on the water round the deck.
     */
    prism: {
      faces: [45, 90, 135, 225, 270, 315] as const,
      /** Sheets just outside the opaque glass, `fill` of the pane's size, `stagger` s face to face. */
      apothemK: 1.015,
      fill: 0.92,
      stagger: 0.12,
      rate: 0.35,
      ring: { y: 4.86, r: 0.42 },
      patch: { from: 3.8, to: 5.4, size: [0.6, 1, 1.5] as const, y: 0.06, sway: 0.6 },
    },
  },
  /**
   * Boathouse colour on the evening water (no real reflections in the water shader): a soft patch of
   * each house's paint off its door, from `hours[0]` to `hours[1]` (fades over `fade` h). Size
   * [across, 1, along], `out` u past the door, `y` over the water; it breathes `shimmer` over `period` s.
   */
  streak: {
    hours: [17.25, 21] as const,
    fade: 0.75,
    out: 3.1,
    size: [1.2, 1, 2] as const,
    y: 0.05,
    shimmer: 0.12,
    period: 4.6,
    range: 110,
  },
} as const;
