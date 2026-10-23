/**
 * HQ / Orchestrator (Hearthholm, harbour crescent) — M14b plan §2.1, remade as the Seven Gates
 * Crossroads (M20 TASK-466, D-057 / D-058 / D-060; zones `mar-plans/study/hq-design.md` §1.2).
 */
import { FOLIAGE } from '../palette.ts';
import { streetZone, THEME_IDS, Zone } from '../../world/types.ts';
import type { ThemeDef } from './index.ts';
import { CODING_THEME } from './coding.ts';
import { MARKETING_THEME } from './marketing.ts';
import { QA_THEME } from './qa.ts';
import { DESIGN_THEME } from './design.ts';
import { DEVOPS_THEME } from './devops.ts';
import { RESEARCH_THEME } from './research.ts';

const { grass, meadow, sandDry, sandWet } = Zone;

/** Civic lawn and flowering-lawn hexes (plan §2.1), shared by the ground table and the beds. */
const LAWN = '#8FCB62';
const ACCENT = '#E8735A';
/** Plaza paving base; the streets are this paving tinted toward their culture's accent. */
const PAVING = '#D8B894';
const GROUT = '#C98A6A';

/** sRGB hex lerp (content only: the street tints are fixed hexes once built). */
function mixHex(a: string, b: string, t: number): string {
  const c = (h: string, i: number): number => parseInt(h.slice(i, i + 2), 16);
  const m = (i: number): string =>
    Math.round(c(a, i) + (c(b, i) - c(a, i)) * t)
      .toString(16)
      .padStart(2, '0');
  return `#${m(1)}${m(3)}${m(5)}`;
}

/** Culture accents in THEME_IDS order (the street / gate / stall of each culture). */
const ACCENT_OF: Readonly<Record<(typeof THEME_IDS)[number], string>> = {
  hq: ACCENT,
  coding: CODING_THEME.accent,
  marketing: MARKETING_THEME.accent,
  qa: QA_THEME.accent,
  design: DESIGN_THEME.accent,
  devops: DEVOPS_THEME.accent,
  research: RESEARCH_THEME.accent,
};

/**
 * Street tint (D-060 S8 b): the plaza paving pulled `STREET_TINT` of the way toward the culture
 * accent, same tiles and grout, so the seven streets read as a seven-colour star from above.
 */
export const STREET_TINT = 0.42;
const STREET_GROUND = Object.fromEntries(
  THEME_IDS.map((t, k) => [
    streetZone(k),
    {
      material: 'paving' as const,
      base: mixHex(PAVING, ACCENT_OF[t], STREET_TINT),
      layer: { tile: { size: 0.9, grout: mixHex(GROUT, ACCENT_OF[t], STREET_TINT * 0.5) } },
    },
  ]),
) as ThemeDef['ground'];

export const HQ_THEME: ThemeDef = {
  id: 'hq',
  displayName: 'HQ',
  short: 'HQ',
  icon: 'hub',
  accent: ACCENT,
  teamTints: ['#E8735A', '#F09A7E', '#D45F4A'],
  // Seven Gates street lots (D-060 H8): offices, cottages (lodgings), a barn (warehouse), a
  // tower house, a pavilion now and then. The Guild Hall (hqAnnex v2) stands on its terrace.
  lotMix: [
    ['hqOffice', 3],
    ['cottage', 2],
    ['barn', 1],
    ['towerHouse', 1],
    ['meetingPavilion', 1],
  ],
  crown: 'hqAnnex',
  defSwap: { marketStall: 'coffeeKiosk' },
  landmarkVariant: { clocktower: 2 },
  decor: [
    ['bench', 2],
    ['flowerBed', 2],
    ['lanternPost', 1],
  ],
  pathLanterns: 0.6,
  plazaDecor: { posts: 'lanternPost', seats: 'bench', across: null },
  workers: { weight: 1.4, cap: 12, deskShare: 0.5 },
  accessory: 0,
  ground: {
    [Zone.grass]: { material: 'lawn', base: LAWN, layer: { mow: { amplitude: 0.03, period: 3 } } },
    [Zone.meadow]: {
      material: 'meadow',
      base: '#A9D86E',
      layer: { speckle: ['#FF8A70', '#FFFFFF'] },
    },
    [Zone.forest]: { material: 'forest', base: '#5E9E4A' },
    [Zone.sandDry]: { material: 'sand', base: '#F3DDB0' },
    [Zone.sandWet]: { material: 'sand', base: '#DDB884' },
    [Zone.rock]: { material: 'rock', base: '#A3A7B2' },
    [Zone.path]: {
      material: 'paving',
      base: '#D9C7A4',
      layer: { tile: { size: 0.9, grout: '#B8A27E' } },
    },
    // the compass plaza and the stone quay (TASK-468 paints the compass mosaic over the plaza)
    [Zone.plaza]: {
      material: 'paving',
      base: PAVING,
      layer: { tile: { size: 1.4, grout: GROUT } },
    },
    [Zone.field]: { material: 'lawn', base: LAWN },
    ...STREET_GROUND,
  },
  // a campus of lawns: fewer, smaller park groves; flowering lawn patches a little more common
  zoneRules: { forestThreshold: 0.3, meadowThreshold: 0.16 },
  patchwork: 'off',
  // the plan places the Orchestrator Tower itself (Central Quad, plans/hq.ts)
  landmarks: {},
  scatter: [
    // flower beds dotted over the flowering lawn
    {
      def: 'flowerBed',
      zones: [meadow, grass],
      minDist: 7,
      density: 0.5,
      slopeMax: 0.3,
      heights: [0.8, 20],
      shore: [5, 1000],
      cluster: { scale: 16, threshold: 0.15 },
      scale: [0.9, 1.15],
      maxPerIsland: 14,
    },
    // Bottle Beach (D-058, hq-design H19): message bottles and driftwood on the bay sand; the
    // quay band is plaza (never scattered), so they keep to the beach
    {
      def: 'messageBottle',
      zones: [sandWet, sandDry],
      minDist: 4,
      density: 0.6,
      slopeMax: 0.5,
      heights: [0.05, 2],
      shore: [0.6, 6],
      scale: [0.9, 1.1],
      maxPerIsland: 9,
    },
    {
      def: 'driftwood',
      zones: [sandWet, sandDry],
      minDist: 9,
      density: 0.5,
      slopeMax: 0.5,
      heights: [0.1, 2],
      shore: [1, 6],
      scale: [0.9, 1.2],
      maxPerIsland: 4,
    },
  ],
  scatterOff: ['cropRow', 'haybale'],
  // creature weights: content/life.ts THEME_LIFE (TASK-379)
  life: {},
  // palette FOLIAGE: a canopy of its own would add a T0 blob colour class (draw calls, D-033)
  treePalette: FOLIAGE,
};

/**
 * HQ Seven Gates layout (plans/hq.ts), `hq-design.md` §1.2 zones: Z1 compass plaza, Z2 seven
 * streets + gates, Z3 quay, Z5 post yard, Z6 Guild Terrace, Z7 semaphore summit, Z8 ridge walk +
 * falls balconies, Z9 bay beach. Distances in u, angles in degrees from the plaza → harbour
 * heading. Kit placement numbers (stalls, pennants, crates, mail line): content HQ_CULTURE_SITE.
 */
export const HQ_PLAN = {
  /** Z1: round compass plaza (district kind 'compass'), the flattest disc near the harbour. */
  plaza: {
    radius: 10,
    /** Search around the harbour anchor (grows by VILLAGE.searchGrow, 5 steps). */
    search: 25,
    minShore: 11,
  },
  /** Orchestrator Tower: inland side of the plaza, this far in from the plaza edge. */
  tower: { inset: 2.4, slide: [0, 30, -30, 60, -60] },
  /** Coffee kiosks on the plaza edge flanking the harbour lane, facing the centre. */
  kiosks: {
    count: 2,
    angles: [42, -42, 100, -100, 150, -150, 70, -70, 125, -125],
    inset: 1.1,
    /** A kiosk angle within this of a street ray (deg) is skipped. */
    rayGap: 16,
  },
  /** Harbour moorings at the ferry pier. */
  moorings: { rowboats: [2, 3] as const, sailboats: [1, 2] as const },
  /** Ferry office beside the pier root, in the shallows (pivot = water level). */
  ferry: {
    side: 3.6,
    along: [1, 2, 0, 3, -0.5],
    /** Ground under the office (u): shallow water to the wet sand. */
    depth: [-0.55, 0.35] as const,
    radius: 2.2,
  },
  /**
   * Z2: one street per island, aimed at its real centre (`ctx.islands`); HQ's own street is the
   * harbour lane to the pier. Runs are measured from the plaza rim.
   */
  streets: {
    /** A full street stops at `maxRun` u past the rim (gate there), never past the shore. */
    maxRun: 26,
    /**
     * D-058: a heading whose land ends within this of the rim is a shore street: it runs to the
     * beach and ends in a shore gate with a mooring post.
     */
    shoreGateRun: 12,
    /**
     * Shortest street (rim → gate, u): a heading with less land than this is dropped; between
     * this and 0 the gate stands on the plaza rim itself (a "sea gate", its mooring post beyond).
     */
    minRun: -3,
    /** An island within this of the pier heading (deg) shares the harbour lane; its gate stands `sharedGateOut` u past the rim on it. */
    shareDeg: 14,
    sharedGateOut: 1.5,
    /** The probe stops where the ground climbs faster than this (rise / run over 2 u): the gate stands at the foot of the hill. */
    steep: 0.55,
    /** Land along a street: shore distance / height the probe needs (full street ends, gates). */
    endMinShore: 2.5,
    gateMinY: 0.35,
    /** A full street's gate stands this far before the probed land end. */
    gateInset: 3,
    /** The path runs on this far past the gate (the gate is walked through). */
    beyond: 2.5,
    /**
     * Gates stand on level ground (a small pad): max relief over the gate disc (shore gates on
     * the beach slope more), else slide back up the street.
     */
    gateRelief: 2.2,
    shoreGateRelief: 2.2,
    /** A gate that gets no pad (the water is near) must have its two feet within this (u). */
    unpaddedFeet: 0.5,
    gateSlide: 10,
    gatePad: 2.4,
    /** Gates keep this far apart (a rim gate on top of the harbour gate is dropped). */
    gateGap: 4.5,
    /** HQ's gate may stand this close behind a shared culture gate on the harbour lane. */
    hqGateGap: 3,
    /** A gate stands within this of its ideal ray (deg, seen from the plaza), or the street gets none. */
    rayDeg: 28,
    /**
     * Outside the plaza the lane search keeps within `corridor` u of the ideal ray and pays
     * `crossCost` x (instead of the merge discount) on another street's cells: separate rays.
     */
    corridor: 4,
    /** Corridor factor of the second try when the ray is blocked (an earlier gate's posts). */
    wideCorridor: 1.75,
    crossCost: 1.4,
    /** Street tint half-width (u, > PATHS.halfWidth so the band covers the smoothed path). */
    paintHalf: 1.7,
    /** Lots: slots start `from` u past the rim, stop `back` u before the gate; target count. */
    lots: { from: 12, back: 4, target: [8, 13] as const, minShore: 6, maxRelief: 1.6 },
  },
  /** Shore gate mooring post (gullPerch: three lashed stakes) at the waterline past the gate. */
  shoreGate: {
    def: 'gullPerch',
    /** Reach past the gate (u) and side offsets (u), first dry waterline spot wins. */
    reach: [2, 3, 4, 5, 6.5, 8, 10],
    side: [0, 1.6, -1.6, 2.8, -2.8],
  },
  /**
   * Z6 Guild Terrace: a levelled disc above the plaza (ground ≥ plaza + `rise`, ideally + `ideal`),
   * the Guild Hall on it facing the plaza, flower beds and benches, a stair link down.
   */
  terrace: {
    radius: 5.5,
    inner: 16,
    outer: 36,
    /** Ground at least this far above the plaza is preferred (score); lower discs are earthed up. */
    rise: 1.5,
    /** The terrace floor is lifted to plaza + `liftTo` where the ground is lower, ramping down over `liftFalloff` u. */
    liftTo: 3.5,
    liftFalloff: 5,
    /** Lanes keep this far outside the disc (only the ramp's foot may touch a street). */
    laneClear: 2,
    minShore: 6,
    /** Footprint relief passes (u), tried in order. */
    passes: [1.6, 2.8, 4],
    beds: 4,
    bedRing: 4.3,
    benches: 2,
    /** Pad level group (Pad.group) of the terrace: its lot shares the level, nothing else does. */
    padGroup: 466,
    padStep: 3,
  },
  /**
   * Z5 post yard on the hill shoulder: a levelled disc, the mail line's high pylon at its
   * seaward edge; the cable must clear the ground / roofs / tower on its way to the pier.
   */
  yard: {
    radius: 4,
    inner: 22,
    outer: 62,
    rise: 4,
    minShore: 5,
    maxRelief: 2.5,
    padGroup: 467,
    cable: {
      /** Cable height over the ground (u) at every sample; lots count as this tall. */
      clearance: 2.5,
      lotHeight: 6.5,
      /** Ground inside another pad's core may still rise this much to its plateau. */
      padLift: 1.6,
      /** The first / last `endFrac` of the span only needs `endClearance` over the ground. */
      endFrac: 0.14,
      endClearance: 1.0,
      /** Horizontal keep-out from the clock tower (u). */
      towerClear: 5,
      span: [18, 85] as const,
      samples: 32,
    },
  },
  /** Z7 summit: the semaphore on the peak (pad disc), benches round it looking out. */
  summit: { radius: 3.2, minShore: 3, search: 20, benches: 3, benchRing: 2.8, lantern: 2.2 },
  /**
   * Z8 ridge walk: lookouts on the plateau behind the likely waterfall lips (the falls are placed
   * after the plan: a bench `inland` u behind a lip keeps clear of WATERFALLS.avoid.fixture).
   */
  ridge: {
    balconies: 3,
    inland: 4.8,
    spacing: 28,
    maxRelief: 1.2,
    lipMinH: 3.5,
    lipSdf: 10,
    /** Keep clear of the village (u from the plaza) and the summit. */
    minPlaza: 30,
    minSummit: 10,
  },
  /** Z3 stone quay: plaza paving `halfAlong` u either side of the pier root, `inland` u deep. */
  quay: { halfAlong: 9, inland: 4.5 },
  /** Avenue: trees at `spacing` along every street, `offset` either side; lanterns / benches between. */
  avenue: {
    def: 'roundTree',
    spacing: 7,
    offset: 3.6,
    /** Start past the plaza edge. */
    start: 4,
    clear: 1.0,
    lanternEvery: 3,
    lanternOffset: 2.3,
    bench: { every: 4, offset: 2.5 },
  },
  /** Inland dry sand → civic lawn within these pads of the plaza edge / lot footprints (u). */
  lawn: { minShore: 4, quadPad: 14, lotPad: 6 },
} as const;
