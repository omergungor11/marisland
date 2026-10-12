/**
 * Island roster + worldgen tuning tables (ART_BIBLE §1 P3, §2, §4;
 * ARCHITECTURE §2). Plain data, no logic, no three.js — `src/world/gen/*`
 * reads these; nothing here is computed.
 */
import type { ArchetypeId, ColorClass, HeightClass } from '../world/types.ts';

/** Per-archetype zone rule block (ARCHITECTURE §2 step 4). */
export interface ZoneRuleParams {
  /** Low-frequency cluster noise above this → forest (groves, not sprinkle). */
  forestThreshold: number;
  /** Moisture noise above this → meadow. */
  meadowThreshold: number;
  /** Rock needs height ≥ this fraction of the island peak (and steep slope). */
  rockMinFrac: number;
  /** Which sand zone the dry beach uses. */
  sand: 'sandDry' | 'sandBlack';
  /** Wet sand also uses `sand` (Emberpeak: the whole beach ring is black). */
  sandRing?: boolean;
  /**
   * 'slope' = cliff where slope > ZONE_RULES.cliffSlope (plus forced sectors);
   * 'tagged' = cliff only where the profile forces it (Emberpeak rim + notch).
   */
  cliff: 'slope' | 'tagged';
  /**
   * 'slope' cliffs only within this shore distance (u; unset = everywhere), above `cliffSlope`
   * (unset = ZONE_RULES.cliffSlope). TASK-402b: on Research every steep bank along the walls is
   * earth (also pad edges at the rim), the summit / terrace banks inland stay lawn.
   */
  slopeCliffMaxShore?: number;
  cliffSlope?: number;
  /** Forced-cliff cells become cliff above this slope. */
  forcedCliffSlope: number;
  /** Rock regardless of slope above this fraction of the peak (bare summits). */
  rockAboveFrac?: number;
  /** Basalt strata: rock where (y − from) mod step < width, for from ≤ y. */
  rockBands?: { from: number; step: number; width: number };
  /** Forest only below this fraction of the peak (hilltops stay open). */
  forestMaxFrac?: number;
  /** Forest only below this slope (defaults to ZONE_RULES.forestMaxSlope). */
  forestMaxSlope?: number;
  /** Forest only this far from shore (defaults to ZONE_RULES.forestMinShore). */
  forestMinShore?: number;
  /** Profile-tagged patchwork cells become `field`. */
  patchwork?: boolean;
  /** Every land cell is sand (Lonely Palm). */
  sandOnly?: boolean;
  /** Wet sand only below this height (TASK-400: the crater rim tops near the shore stay dry land). */
  wetSandMaxY?: number;
}

export type SizeClass = 'hero' | 'medium' | 'small' | 'tiny';

/**
 * Bluff coast (M17b "Concept Archipelago", TASK-390): the island stands on a raised plateau
 * whose rim drops to the sea as an earthy wall; a beach cove survives only in the leeward
 * sector, where the harbour and dock planners put their piers. `on: false` restores the
 * pre-M17b low disc (beach ring + `ArchetypeParams.peak`).
 */
export interface BluffParams {
  on: boolean;
  /** Wall (plateau lift) height range in u; one value per island from its own rng fork. */
  wall: readonly [number, number];
  /** Total peak range in u while the bluff is on (replaces `ArchetypeParams.peak`). */
  peak: readonly [number, number];
  /** Cove half-angle around the leeward direction, in degrees (0 = no cove). */
  coveHalfDeg: number;
  /**
   * Cove = disc around this profile anchor instead of the leeward sector (Hearthholm: the
   * harbour bay); `radius` = full cove → bluff, in island radii.
   */
  coveAnchor?: {
    key: string;
    radius: readonly [number, number];
    /**
     * Centre the cove on the flattest `r` u disc within `search` u of the anchor (grown by
     * `grow`; ≥ `minShore` u inland) instead: the HQ planner's quad rule (HQ_PLAN.quad,
     * VILLAGE.searchGrow), so the whole campus stays on cove ground.
     */
    flattest?: { search: number; grow: number; minShore: number; r: number };
  };
  /** Inside the cove the ground stays low (beach + profile) this many u inland of the beach. */
  coveFlat: number;
  /** …then the plateau lift ramps up over this many u. */
  coveRamp: number;
  /** Per-archetype BLUFF.rimEase (u); unset = the shared value (TASK-400: the crater rim). */
  rimEase?: number;
}

/**
 * Terraced campus hill (TASK-402b, Lonely Palm → Research "Observatory University"), in
 * island-local units (radius-normalised, +x leeward, `z` mirrored per island): a lawn plateau
 * whose land ends at `coast` (plus two promontories), a broad campus terrace and a summit
 * plateau for the observatory, with soft grassy risers between them. Raw profile levels (the
 * heightfield rescales the summit to `bluff.peak − wall`).
 */
export interface CampusHillParams {
  /** Land ends at this warped radius (keep ≤ reachScale − 0.12: land inside the reach disc). */
  coast: number;
  coastSoft: number;
  /** Coast warp amplitude (fbm, radius units). */
  warp: number;
  /** Promontory: the coast grows by `len` around the angle (deg from leeward, mirrored), `widthDeg` wide. */
  spur: { angleDeg: number; widthDeg: number; len: number };
  headland: { angleDeg: number; widthDeg: number; len: number };
  /** Lawn level and its gentle fbm swell (raw). */
  lawn: number;
  lawnNoise: number;
  /** Campus terrace: centre (local x, z), radius, raw height above the lawn. */
  terrace: { x: number; z: number; r: number; h: number };
  /** Summit plateau (observatory): centre, radius, raw height above the lawn. */
  summit: { x: number; z: number; r: number; h: number };
  /** Riser half-width (radius units). */
  soft: number;
  /** Terrace lifts fade out between these distances inside the coast (radius units). */
  rimFade: readonly [number, number];
  /** Seeded jitter of the terrace / summit centres (radius units) and rotation (rad). */
  jitter: number;
  turn: number;
  /** Garden lawn and glasshouse anchors (local x, z; z mirrored like the rest). */
  garden: { x: number; z: number };
  glasshouse: { x: number; z: number };
}

/**
 * Lee terraces (TASK-403, Beacon Rock → Marketing "Media Rock"), in island-local units (u along
 * the terrace axis = leeward rolled by ± `lean` rad, v across it): nested ellipses stepping down
 * from the stack toward the landing cove, each a flat shelf at `level` × the stack top with a
 * steep earth wall (`wall` u of horizontal run) at its rim. Shelf widths are in u (the buildings
 * need room on every island size): shelf k ends `band` u past the previous rim (the first one
 * past the stack foot), its ellipse spans the axis from `inner` (inside the stack, radius units)
 * to that rim and reaches `across` × its half-length to the sides. The last shelf is the fair
 * ground at the waterline; inside its `cove` sector the rim ramps down to a beach (the landing).
 * Raw profile values like the stack (rescaled to the peak).
 */
export interface TerraceParams {
  shelves: readonly {
    /** Shelf height as a fraction of the stack top. */
    level: number;
    /** Shelf width on the axis past the previous rim, in u (× `bandScale`); includes the wall. */
    band: number;
    /** Half-width across the axis / half-length along it. */
    across: number;
    /** Wall run at the rim (u). */
    wall: number;
  }[];
  /** Where every shelf ellipse starts on the axis (radius units, inside the stack). */
  inner: number;
  /** Stack foot on the axis (radius units, before the stack shift / scale). */
  foot: number;
  /** Bands scale with the island: clamp(radius / ref, min, max). */
  bandScale: { ref: number; min: number; max: number };
  /** The stack moves windward by `shift` (radius units) and narrows by `scale` to make room. */
  stack: { shift: number; scale: number };
  /** Terrace axis roll off leeward (± rad, one draw per island). */
  lean: number;
  /** Rim warp amplitude (fbm, ellipse units). */
  warp: number;
  /** Shelf ripple amplitude (raw u): flat enough for pads, not a table top. */
  ripple: number;
  /** Flatten pads leave ground more than this many u off their level alone (walls, other shelves). */
  padBreak: number;
  /** Landing cove on the last shelf: centre angle off the axis (deg, side rolled), half-angle, ramp run (u). */
  cove: { angleDeg: readonly [number, number]; halfDeg: number; soft: number; ramp: number };
}

/**
 * A flat land shelf grown at the foot of a cone (TASK-405, Emberpeak → DevOps "Ember Works"), in
 * island-local units (radius-normalised, +x leeward): a rounded rectangle whose radial axis points
 * at `angle` (degrees from leeward, on the side the profile picks), level at raw height `h` where
 * the cone is lower (the cone keeps everything above it). Its outer edge is the new coast, so
 * `d + radial` must stay below the archetype's `reachScale` − 0.1. `steps` are higher, smaller
 * shelves on the same axis (terraces climbing toward the cone).
 */
export interface ShelfParams {
  /** Anchor name written for the theme planner (the shelf centre, rotY = outward heading). */
  key: string;
  /**
   * Angle range from leeward (degrees), multiplied by the profile's side (+1 = away from the hot
   * spring); negative ranges put the shelf on the spring's side.
   */
  angle: readonly [number, number];
  d: number;
  /** Half extents along the radial and tangential axes (radius units). */
  radial: number;
  tangential: number;
  /** Raw plateau height (profile units, before the peak rescale). */
  h: number;
  /** Edge warp amplitude (fbm, in units of the half extents). */
  warp: number;
  steps?: readonly { key: string; d: number; radial: number; tangential: number; h: number }[];
}

export interface ArchetypeParams {
  displayName: string;
  /** Bible diameter range in u; radius = diameter / 2. */
  diameter: readonly [number, number];
  /**
   * Diameter used when the roster has too many mediums and this archetype is
   * demoted to `small` (still inside the bible range).
   */
  demotedDiameter?: readonly [number, number];
  sizeClass: SizeClass;
  /** Target peak height range in u (the heightfield is rescaled to hit it). */
  peak: readonly [number, number];
  heightClass: HeightClass;
  colorClass: ColorClass;
  /** Evaluation bounds half-extent as a multiple of radius. */
  boundsScale: number;
  /**
   * Bounding disc (layout gaps, overlap tests) as a multiple of radius: every
   * land cell of the island lies inside it (checked in tests).
   */
  reachScale: number;
  /** Windward shelf width in u (leeward = × WATER_BANDS.leewardRingScale). */
  shelfWidth: number;
  /** Beach ramp width in u (0 → beachMax over this distance inland). */
  beachWidth: number;
  /** Beach ramp top (defaults to BEACH.max). */
  beachMax?: number;
  /** Soft terraces (cute stepped look); strength 0 = off. */
  terrace: { step: number; strength: number };
  /** Windward face meets deep water with no shelf (WINDWARD_CLIFF; Beacon Rock only). */
  windwardCliff?: boolean;
  /** Bluff coast + raised plateau (BLUFF); unset = the low beach-ringed disc. */
  bluff?: BluffParams;
  /** Terraced campus hill profile (Lonely Palm only, TASK-402b). */
  campusHill?: CampusHillParams;
  /** No waterfalls off this island's bluff (TASK-402b: Research keeps its walls dry). */
  noWaterfalls?: boolean;
  /** Lee terraces down to the landing cove (Beacon Rock only, TASK-403). */
  terraces?: TerraceParams;
  /** Flat shelves at the cone foot (Emberpeak only, TASK-405): [harbour, foundry, data center]. */
  shelves?: readonly ShelfParams[];
  zones: ZoneRuleParams;
}

const DEFAULT_ZONES: ZoneRuleParams = {
  forestThreshold: 0.22,
  meadowThreshold: 0.2,
  rockMinFrac: 0.55,
  sand: 'sandDry',
  cliff: 'slope',
  forcedCliffSlope: 0.45,
};

export const ARCHETYPES: Readonly<Record<ArchetypeId, ArchetypeParams>> = {
  hearthholm: {
    displayName: 'Hearthholm',
    diameter: [110, 140],
    sizeClass: 'hero',
    peak: [11, 13],
    heightClass: 'mid',
    colorClass: 'green',
    boundsScale: 1.55,
    reachScale: 1.4,
    shelfWidth: 8,
    beachWidth: 7,
    terrace: { step: 3, strength: 0.2 },
    bluff: {
      on: true,
      wall: [6, 7],
      peak: [18, 20],
      coveHalfDeg: 45,
      coveAnchor: {
        key: 'harbour',
        radius: [0.7, 0.9],
        flattest: { search: 25, grow: 10, minShore: 8, r: 7 },
      },
      coveFlat: 0,
      coveRamp: 400,
    },
    zones: DEFAULT_ZONES,
  },
  beaconrock: {
    displayName: 'Beacon Rock',
    diameter: [40, 60],
    sizeClass: 'small',
    peak: [24, 26],
    heightClass: 'tall',
    colorClass: 'dark',
    boundsScale: 2.45,
    reachScale: 2.35,
    shelfWidth: 7,
    beachWidth: 3,
    terrace: { step: 0, strength: 0 },
    windwardCliff: true,
    // TASK-403: the Media Rock — upper ledge (media campus), middle ledge, fair ground + cove
    terraces: {
      shelves: [
        { level: 0.64, band: 12, across: 1.0, wall: 3.5 },
        { level: 0.4, band: 10, across: 0.95, wall: 3.5 },
        { level: 0.17, band: 14, across: 0.95, wall: 3 },
      ],
      inner: -0.3,
      foot: 0.86,
      bandScale: { ref: 24, min: 0.9, max: 1.2 },
      stack: { shift: 0.12, scale: 1.1 },
      lean: 0.35,
      warp: 0.06,
      ripple: 0.25,
      padBreak: 2.5,
      cove: { angleDeg: [35, 55], halfDeg: 22, soft: 0.15, ramp: 12 },
    },
    zones: {
      ...DEFAULT_ZONES,
      forestThreshold: 2,
      meadowThreshold: 0.35,
      rockMinFrac: 0.3,
      rockAboveFrac: 0.3,
    },
  },
  millbrook: {
    displayName: 'Millbrook',
    diameter: [80, 110],
    sizeClass: 'medium',
    peak: [6.5, 8],
    heightClass: 'flat',
    colorClass: 'green',
    boundsScale: 1.5,
    reachScale: 1.35,
    shelfWidth: 9,
    beachWidth: 6,
    terrace: { step: 2, strength: 0.3 },
    bluff: { on: true, wall: [5, 6], peak: [10, 12], coveHalfDeg: 35, coveFlat: 0, coveRamp: 28 },
    zones: { ...DEFAULT_ZONES, forestThreshold: 0.5, patchwork: true, rockMinFrac: 2 },
  },
  emberpeak: {
    displayName: 'Emberpeak',
    diameter: [90, 120],
    sizeClass: 'medium',
    peak: [34, 36],
    heightClass: 'tall',
    colorClass: 'dark',
    boundsScale: 1.5,
    reachScale: 1.35,
    shelfWidth: 7,
    beachWidth: 5,
    terrace: { step: 4, strength: 0.2 },
    // TASK-405: the cove is a disc around the harbour shelf (was the ±60° lee sector) and stays
    // low 14 u inland, so the harbour is a quay at the water, not a mesa; the rest has walls
    bluff: {
      on: true,
      wall: [5, 6],
      peak: [34, 36],
      coveHalfDeg: 60,
      coveAnchor: { key: 'harbour', radius: [0.55, 0.85] },
      coveFlat: 14,
      coveRamp: 12,
      // the shelves stand 4–5 u above the beach at the rim: ease them in wider so faces stay ≤ 65°
      rimEase: 7.5,
    },
    // TASK-405 "Ember Works": a low harbour shelf on the lee side away from the hot spring and a
    // two-step foundry terrace further round the same side, on bluff walls; land stays < 1.27 r
    shelves: [
      {
        key: 'harbour',
        angle: [30, 40],
        d: 1.0,
        radial: 0.27,
        tangential: 0.42,
        h: 1.6,
        warp: 0.06,
      },
      {
        key: 'foundry',
        angle: [100, 116],
        d: 1.04,
        radial: 0.22,
        tangential: 0.34,
        h: 4.6,
        warp: 0.06,
        steps: [{ key: 'foundryUpper', d: 0.76, radial: 0.1, tangential: 0.26, h: 10.5 }],
      },
      // negative angles: the hot-spring side (data center terraces beyond the geothermal plant)
      {
        key: 'datacenter',
        angle: [-70, -56],
        d: 1.0,
        radial: 0.24,
        tangential: 0.3,
        h: 4.6,
        warp: 0.06,
        steps: [{ key: 'datacenterUpper', d: 0.72, radial: 0.13, tangential: 0.22, h: 10 }],
      },
    ],
    zones: {
      ...DEFAULT_ZONES,
      forestThreshold: 0.45,
      sand: 'sandBlack',
      sandRing: true,
      cliff: 'tagged',
      forcedCliffSlope: 0.5,
      rockMinFrac: 0.2,
      rockAboveFrac: 0.5,
      rockBands: { from: 8, step: 5, width: 1.4 },
      forestMaxFrac: 0.35,
    },
  },
  palmlagoon: {
    /**
     * M17b TASK-401: the QA "Test Factory" — a solid rounded-square plateau on a bluff (was the
     * atoll ring + lagoon). Id, size range and height/colour classes are kept so the layout and
     * every other island are unchanged; only the profile (profiles.ts) and the bluff are new.
     */
    displayName: 'Palmlagoon',
    diameter: [78, 100],
    demotedDiameter: [70, 76],
    sizeClass: 'medium',
    peak: [2.6, 3.6],
    heightClass: 'flat',
    colorClass: 'sand',
    boundsScale: 1.45,
    reachScale: 1.3,
    shelfWidth: 10,
    beachWidth: 5,
    terrace: { step: 0, strength: 0 },
    bluff: {
      on: true,
      wall: [6, 6.8],
      peak: [8.6, 9.6],
      coveHalfDeg: 32,
      coveFlat: 0,
      coveRamp: 22,
    },
    zones: { ...DEFAULT_ZONES, forestThreshold: 2, meadowThreshold: 0.1, rockMinFrac: 2 },
  },
  mossgrove: {
    displayName: 'Mossgrove',
    diameter: [80, 110],
    sizeClass: 'medium',
    peak: [19, 21],
    heightClass: 'tall',
    colorClass: 'green',
    boundsScale: 1.5,
    reachScale: 1.35,
    shelfWidth: 8,
    beachWidth: 5,
    terrace: { step: 0, strength: 0 },
    bluff: {
      on: true,
      wall: [5, 6.5],
      peak: [22.5, 24.5],
      coveHalfDeg: 55,
      coveFlat: 0,
      coveRamp: 14,
    },
    zones: {
      ...DEFAULT_ZONES,
      forestThreshold: -0.6,
      forestMaxFrac: 0.9,
      forestMaxSlope: 1.4,
      forestMinShore: 4,
      rockMinFrac: 2,
      cliff: 'tagged',
    },
  },
  lonelypalm: {
    displayName: 'Lonely Palm',
    /**
     * TASK-402b (Research "Observatory University"): 52–58 u (was the 17–21 u crater). Still the
     * last island the layout places (smallest reach), so on most seeds the other islands keep
     * their places or shift as a whole (re-centring). Height / colour classes are kept so the
     * neighbour-contrast rule (and with it most layouts) does not change.
     */
    diameter: [52, 58],
    sizeClass: 'small',
    peak: [6, 7],
    heightClass: 'flat',
    colorClass: 'sand',
    boundsScale: 1.35,
    reachScale: 1.06,
    shelfWidth: 7,
    beachWidth: 4,
    terrace: { step: 0, strength: 0 },
    // lawn plateau on earth walls, the leeward cove for the pier; the lawns run flat to the rim
    bluff: {
      on: true,
      wall: [4.2, 4.8],
      peak: [12, 13.2],
      coveHalfDeg: 30,
      coveFlat: 0,
      coveRamp: 12,
      rimEase: 3,
    },
    campusHill: {
      coast: 0.95,
      coastSoft: 0.05,
      warp: 0.035,
      spur: { angleDeg: 140, widthDeg: 24, len: 0.045 },
      headland: { angleDeg: -150, widthDeg: 26, len: 0.045 },
      lawn: 1,
      lawnNoise: 0.08,
      terrace: { x: 0.14, z: 0.3, r: 0.36, h: 0.8 },
      summit: { x: -0.34, z: 0.1, r: 0.25, h: 2.1 },
      soft: 0.17,
      rimFade: [0.06, 0.3],
      jitter: 0.04,
      turn: 0.25,
      garden: { x: 0.12, z: -0.46 },
      glasshouse: { x: 0.45, z: -0.5 },
    },
    noWaterfalls: true,
    // steep ground is cliff only along the walls: the summit and terrace banks stay lawn
    zones: {
      ...DEFAULT_ZONES,
      forestThreshold: 2,
      meadowThreshold: 0.15,
      rockMinFrac: 2,
      slopeCliffMaxShore: 8,
      cliffSlope: 0.55,
    },
  },
};

/** Archipelago layout (ART_BIBLE §4, ARCHITECTURE §2 step 1). */
export const LAYOUT = {
  /**
   * Island count weights. Phase 3 (D-024): always 7, so every seed has all seven department
   * themes (the archipelago is the org chart). The roster code still accepts 5–7.
   */
  countWeights: [[7, 1]] as ReadonlyArray<readonly [number, number]>,
  /**
   * Lonely Palm is in the roster with this probability. Unused while the count is always 7
   * (Lonely Palm is forced at count 7); kept for a 5–6 island count. W9 needs it.
   */
  lonelyPalmChance: 0.82,
  /** At least one of these is always present. */
  tallLandmarks: ['beaconrock', 'emberpeak'] as readonly ArchetypeId[],
  /** Size hierarchy: medium count range; small + tiny ≥ 1. */
  medium: [2, 3] as const,
  /** Every non-hero diameter ≤ this × hero diameter (hero is the largest). */
  heroDominance: 0.86,
  /** Minimum coast-to-coast gap between bounding discs (bible: 40–90 u). */
  minGap: 40,
  /** Dart-throw gap to the island it is attached to. */
  attachGap: [42, 66] as const,
  /** Every island's nearest neighbour is at most this far (one archipelago). */
  maxNearestGap: 72,
  /** Everything (bounding discs) inside ±extent u after re-centring. */
  extent: 300,
  /** Candidate darts per island; the one nearest the cluster centroid wins. */
  candidates: 12,
  relaxIterations: 3,
  /** Pull toward the centroid per relaxation step, as a fraction of the excess gap. */
  pull: 0.35,
  /** Placement attempts before giving up (deterministic: fork('place', attempt)). */
  attempts: 60,
} as const;

/** Seeded syllable bank for island names (2–3 syllables). */
export const NAME_SYLLABLES = {
  first: [
    'Vel',
    'Tosk',
    'Bri',
    'Lun',
    'Ka',
    'Sor',
    'Ren',
    'Dal',
    'Wyn',
    'Fen',
    'Ho',
    'Ma',
    'Ri',
    'Sto',
    'Ne',
    'Lo',
    'Ber',
    'Quil',
    'Tam',
    'Or',
    'Pim',
    'Cor',
    'Mer',
    'Ash',
    'Bel',
    'Kel',
    'Nor',
    'Sel',
    'Pip',
    'Tul',
  ],
  mid: ['mor', 'a', 'i', 'o', 'ber', 'lan', 'ri', 've', 'do', 'na', 'li', 'sa', 'wen', 'ro', 'ta'],
  last: [
    'a',
    'ey',
    'holm',
    'wick',
    'by',
    'sa',
    'ra',
    'ma',
    'ne',
    'dun',
    'sey',
    'mere',
    'lo',
    'ka',
    'nis',
    'wyn',
    'ton',
  ],
  /** Chance of a middle syllable (3 syllables instead of 2). */
  threeChance: 0.4,
} as const;

/** Underwater profile as a function of distance from shore (P3 "islands are rings"). */
export const SHELF = {
  /** Height just off the waterline (keeps water samples strictly < 0). */
  lip: -0.1,
  /** Depth reached at the outer edge of the shelf. */
  depth: 1.5,
  /** ± fraction of shelf width from low-frequency coast noise. */
  widthJitter: 0.15,
  /** Noise wavelength along the coast in u. */
  noiseScale: 70,
  /** Drop-off target depth range below the shelf. */
  dropDepth: [8, 15] as const,
  /** Horizontal length of the drop-off in u. */
  dropLen: 18,
  /** Horizontal length from drop-off foot to SEABED_Y in u. */
  seabedFall: 50,
  /** Where two islands' shelves meet (Voronoi seam of the coasts), blur this many cells. */
  seamBlur: 2,
} as const;

/**
 * Beacon Rock's windward cliff: the only coast with no shelf (P3 exception).
 * Sector = ±halfAngle around the upwind direction, smoothed by `soft` (cos units).
 */
export const WINDWARD_CLIFF = {
  halfAngleDeg: 50,
  soft: 0.12,
  shelfWidth: 0.5,
  dropLen: 6,
  /** Water zone band scale inside the sector (thin ring of foam only). */
  bandScale: 0.15,
  /** Mid-water band scale inside the sector (deep water close in). */
  midScale: 0.35,
} as const;

/** Atoll lagoon floor (Palmlagoon): −min … −max u, deepest away from the ring. */
export const LAGOON = { min: 2, max: 4, rampLen: 14 } as const;

/**
 * Coast cleanup so every coast has room for its shelf: inlets narrower than
 * ≈ 2 × closeRadius u are filled, spits thinner than ≈ 2 × openRadius removed,
 * stray islets dropped. Profile-protected cells (lagoons, atoll channels, Beacon Rock) are never filled.
 */
export const COAST = {
  closeRadius: 7,
  openRadius: 3,
  /**
   * Detached land specks below this many samples (4 u² each) are dropped unless they are
   * the island's main body or profile-protected (Beacon Rock stacks): no stray islet in
   * Hearthholm's bay (sweep D9). Atoll ring segments are ≥ 145 samples (60-seed survey).
   */
  minIsletCells: 100,
} as const;

/** Bluff wall shape shared by every `bluff` archetype (TASK-390). */
export const BLUFF = {
  /** Steepest wall slope in degrees (the straight mid-face). */
  maxSlopeDeg: 62,
  /** Fraction of the wall run rounded off at the foot and at the rim. */
  knee: 0.2,
  /** The archetype profile fades in over the wall run + this many u (keeps the face ≤ ~65°). */
  rimEase: 6,
  /** Cove sector edge softness (cos units, like WINDWARD_CLIFF.soft). */
  coveSoft: 0.12,
  /**
   * Wall band = cove factor < cliffTagCove and shore distance < wall run + cliffTagPad u; its
   * cells steeper than cliffTagSlope get Tag.cliff, so the faces are Zone.cliff on every
   * bluff archetype (also the `cliff: 'tagged'` ones).
   */
  cliffTagCove: 0.85,
  cliffTagPad: 2,
  cliffTagSlope: 0.5,
  /** Box-blur radius (cells) of the shore distance that drives the wall, so the rim is not a staircase. */
  sdfBlur: 1,
} as const;

/** Beach band (ART_BIBLE §1/§2: 0–1.2 u above sea level, gentle). */
export const BEACH = { min: 0.1, max: 1.2 } as const;

/** Raw land field floor (water value before the shelf pass). */
export const RAW_FLOOR = -1;

/** Zone thresholds shared by all archetypes. */
export const ZONE_RULES = {
  /** Wet sand: shore SDF 0..wetSand u. */
  wetSand: 3,
  /** Dry sand below this height. */
  sandMaxY: 1.2,
  /** Cliff: slope (height gradient, u/u) above this. */
  cliffSlope: 0.9,
  /** Rock: slope above this on high ground. */
  rockSlope: 0.55,
  /** Forest only below this slope and this far from shore. */
  forestMaxSlope: 0.6,
  forestMinShore: 6,
  /** Hilltops above this fraction of the peak stay open grass. */
  forestMaxFrac: 0.85,
  /** Patchwork fields only up to this slope (plateau-edge banks stay grass, sweep D11). */
  fieldMaxSlope: 0.4,
  moistureScale: 90,
  forestScale: 45,
} as const;

/**
 * Millbrook patchwork: rotated rectangular field cells (u) and their share by zone. Cells
 * are big enough to read at T1 (sweep D11: 16 × 11 u blurred into one lime plateau).
 * Field cells get one of `colors` hues (palette FIELDS), never the same as a neighbour.
 */
export const PATCHWORK = {
  cell: [22, 15] as const,
  field: 0.6,
  meadow: 0.15,
  colors: 5,
  /** Only cells whose centre has at least this plateau mask count toward colour balance. */
  plateauMask: 0.45,
} as const;

/** Chunk flag: shallow means water depth below this (u). */
export const CHUNK_SHALLOW_DEPTH = 35;
