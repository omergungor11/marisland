/**
 * Worldgen tuning tables (ART_BIBLE §1 P3, §2, §4) as plain data — no logic.
 *
 * NOTE: these belong in `src/content/` (CLAUDE.md rule 3). They live here only
 * because TASK-101 is scoped to `src/world/**`; the file imports nothing but
 * types so it can move verbatim to `src/content/islands.ts`.
 */
import type { ArchetypeId, ColorClass, HeightClass } from '../types.ts';

export interface ZoneRuleParams {
  /** Low-frequency cluster noise above this → forest (groves, not sprinkle). */
  forestThreshold: number;
  /** Moisture noise above this → meadow. */
  meadowThreshold: number;
  /** Rock needs height ≥ this fraction of the island peak (and steep slope). */
  rockMinFrac: number;
  /** Which sand zone the dry beach uses. */
  sand: 'sandDry' | 'sandBlack';
}

export interface ArchetypeParams {
  displayName: string;
  /** Bible diameter range in u; radius = diameter / 2. */
  diameter: readonly [number, number];
  /** Target peak height range in u (the heightfield is rescaled to hit it). */
  peak: readonly [number, number];
  heightClass: HeightClass;
  colorClass: ColorClass;
  /** Evaluation bounds half-extent as a multiple of radius. */
  boundsScale: number;
  /** Windward shelf width in u (leeward = × WATER_BANDS.leewardRingScale). */
  shelfWidth: number;
  /** Beach ramp width in u (0 → BEACH.max over this distance inland). */
  beachWidth: number;
  /** Soft terraces (cute stepped look); strength 0 = off. */
  terrace: { step: number; strength: number };
  zones: ZoneRuleParams;
}

const DEFAULT_ZONES: ZoneRuleParams = {
  forestThreshold: 0.22,
  meadowThreshold: 0.2,
  rockMinFrac: 0.55,
  sand: 'sandDry',
};

export const ARCHETYPES: Readonly<Record<ArchetypeId, ArchetypeParams>> = {
  hearthholm: {
    displayName: 'Hearthholm',
    diameter: [110, 140],
    peak: [11, 13],
    heightClass: 'mid',
    colorClass: 'green',
    boundsScale: 1.55,
    shelfWidth: 8,
    beachWidth: 7,
    terrace: { step: 3, strength: 0.35 },
    zones: DEFAULT_ZONES,
  },
  beaconrock: {
    displayName: 'Beacon Rock',
    diameter: [40, 60],
    peak: [23, 27],
    heightClass: 'tall',
    colorClass: 'dark',
    boundsScale: 1.5,
    shelfWidth: 7,
    beachWidth: 3,
    terrace: { step: 0, strength: 0 },
    zones: { ...DEFAULT_ZONES, forestThreshold: 2 },
  },
  millbrook: {
    displayName: 'Millbrook',
    diameter: [80, 110],
    peak: [6, 8],
    heightClass: 'flat',
    colorClass: 'green',
    boundsScale: 1.5,
    shelfWidth: 9,
    beachWidth: 6,
    terrace: { step: 2, strength: 0.5 },
    zones: { ...DEFAULT_ZONES, forestThreshold: 0.45 },
  },
  emberpeak: {
    displayName: 'Emberpeak',
    diameter: [90, 120],
    peak: [33, 37],
    heightClass: 'tall',
    colorClass: 'dark',
    boundsScale: 1.5,
    shelfWidth: 7,
    beachWidth: 5,
    terrace: { step: 0, strength: 0 },
    zones: { ...DEFAULT_ZONES, forestThreshold: 0.5, sand: 'sandBlack' },
  },
  palmlagoon: {
    displayName: 'Palmlagoon',
    diameter: [70, 100],
    peak: [2, 3],
    heightClass: 'flat',
    colorClass: 'sand',
    boundsScale: 1.5,
    shelfWidth: 10,
    beachWidth: 6,
    terrace: { step: 0, strength: 0 },
    zones: { ...DEFAULT_ZONES, forestThreshold: 2 },
  },
  mossgrove: {
    displayName: 'Mossgrove',
    diameter: [80, 110],
    peak: [18, 22],
    heightClass: 'tall',
    colorClass: 'green',
    boundsScale: 1.5,
    shelfWidth: 8,
    beachWidth: 5,
    terrace: { step: 0, strength: 0 },
    zones: { ...DEFAULT_ZONES, forestThreshold: -0.1 },
  },
  lonelypalm: {
    displayName: 'Lonely Palm',
    diameter: [10, 16],
    peak: [0.5, 0.7],
    heightClass: 'flat',
    colorClass: 'sand',
    boundsScale: 1.8,
    shelfWidth: 6,
    beachWidth: 4,
    terrace: { step: 0, strength: 0 },
    zones: { ...DEFAULT_ZONES, forestThreshold: 2, meadowThreshold: 2 },
  },
};

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
} as const;

/** Beach band (ART_BIBLE §1/§2: 0–1.2 u above sea level, gentle). */
export const BEACH = { min: 0.1, max: 1.2 } as const;

/** Raw land field floor (water value before the shelf pass). */
export const RAW_FLOOR = -1;

/** Zone thresholds shared by all archetypes. */
export const ZONE_RULES = {
  /** Wet sand: shore SDF 0..wetSand u. */
  wetSand: 3,
  /** Cliff: slope (height gradient, u/u) above this. */
  cliffSlope: 0.9,
  /** Rock: slope above this on high ground. */
  rockSlope: 0.55,
  /** Forest only below this slope and this far from shore. */
  forestMaxSlope: 0.6,
  forestMinShore: 6,
  /** Hilltops above this fraction of the peak stay open grass. */
  forestMaxFrac: 0.85,
  moistureScale: 90,
  forestScale: 45,
} as const;

/** Chunk flag: shallow means water depth below this (u). */
export const CHUNK_SHALLOW_DEPTH = 35;
