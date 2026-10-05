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
}

export type SizeClass = 'hero' | 'medium' | 'small' | 'tiny';

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
    diameter: [10, 16],
    sizeClass: 'tiny',
    peak: [0.55, 0.65],
    heightClass: 'flat',
    colorClass: 'sand',
    boundsScale: 2.2,
    reachScale: 1.6,
    shelfWidth: 5,
    beachWidth: 4,
    beachMax: 0.6,
    terrace: { step: 0, strength: 0 },
    zones: { ...DEFAULT_ZONES, forestThreshold: 2, meadowThreshold: 2, sandOnly: true },
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
