/** DevOps (Emberpeak, volcano) — M14b plan §2.3. */
import { FOLIAGE } from '../palette.ts';
import { Zone } from '../../world/types.ts';
import type { ThemeDef } from './index.ts';

const { grass, meadow, forest, rock, cliff, sandBlack, sandWet, path, plaza } = Zone;

/**
 * D8 fumarole pools (M22 TASK-482): three kerbless pool discs (teal / sulphur / pink) inside a
 * salt-white rim, painted by the plan. They reuse zone ids no DevOps feature paints (the other
 * cultures' street tints, which only the HQ plan writes on its own island), so no new zone id:
 * this island's `ground` row gives them their look.
 */
export const FUMAROLE_ZONES = {
  pools: [Zone.streetHq, Zone.streetCoding, Zone.streetMarketing] as const,
  rim: Zone.streetQa,
} as const;

export const DEVOPS_THEME: ThemeDef = {
  id: 'devops',
  displayName: 'DevOps',
  short: 'OPS',
  icon: 'gear',
  accent: '#FF9F43',
  teamTints: ['#FF9F43', '#FFBC78', '#E5822A'],
  lotMix: [
    ['dataCenter', 2],
    ['rackShed', 2],
    ['antennaMast', 1],
  ],
  crown: 'antennaMast',
  defSwap: {},
  landmarkVariant: {},
  decor: [
    ['cableSpool', 2],
    ['warningSign', 1],
    ['crate', 1],
  ],
  pathLanterns: 0.5,
  plazaDecor: { posts: 'lanternPost', seats: 'cableSpool', across: null },
  workers: { weight: 1.0, cap: 8, deskShare: 0.4 },
  accessory: 5,
  ground: {
    [sandBlack]: { material: 'blackSand', base: '#5B5566' },
    [sandWet]: { material: 'blackSand', base: '#4E4958' },
    // lower slopes: dry scrub instead of lawn green
    [grass]: { material: 'grass', base: '#8FA05A' },
    [meadow]: {
      material: 'meadow',
      base: '#98A863',
      layer: { speckle: ['#D9C27A', '#B8A06A'] },
    },
    [forest]: { material: 'forest', base: '#3F6B45' },
    // basalt with cracks (rock), darker walls (rim, notch); lifted from the bible's #4F4C57, which
    // read as a black hole over the whole cone
    [rock]: {
      material: 'rock',
      base: '#7A7584',
      // an even basalt: the stock slope ramp (±25 %) read as large grey blotches over the cone
      ramp: 0.3,
      // crack accents in basalt greys (the stock lichen reads as pale blotches on dark rock)
      layer: { layers: ['cracks'], speckle: ['#958FA0', '#5A5664'] },
    },
    [cliff]: {
      material: 'rock',
      base: '#6B6674',
      layer: { layers: ['cracks'], speckle: ['#958FA0', '#5A5664'] },
    },
    // steel grating / dark gravel paths
    [path]: { material: 'gravel', base: '#6E6A72' },
    // concrete pads with yellow safety lines (pad grout)
    [plaza]: {
      material: 'paving',
      base: '#9A979E',
      layer: { layers: ['tiles'], tile: { size: 1.9, grout: '#F5C84C' } },
    },
    // D8 fumarole pools (TASK-482): still mineral water (ripples only), study colours
    [FUMAROLE_ZONES.pools[0]]: {
      material: 'paving',
      base: '#9FE6E0',
      layer: { layers: ['ripples'], amplitude: 0.5 },
    },
    [FUMAROLE_ZONES.pools[1]]: {
      material: 'paving',
      base: '#FFE45C',
      layer: { layers: ['ripples'], amplitude: 0.5 },
    },
    [FUMAROLE_ZONES.pools[2]]: {
      material: 'paving',
      base: '#FF8FB1',
      layer: { layers: ['ripples'], amplitude: 0.5 },
    },
    // D12 switchback service roads (TASK-482; the island's own street zone, painted over the
    // cone's stair paths): pale ochre gravel, so the zigzag reads on the dark cone by day
    [Zone.streetDevops]: {
      material: 'gravel',
      base: '#C9BDAC',
      layer: { layers: ['pebbles'] },
    },
    // salt crust round the pools: off-white with white / grey speckle
    [FUMAROLE_ZONES.rim]: {
      material: 'sand',
      base: '#F2EFE8',
      layer: { layers: ['speckle'], speckle: ['#FFFFFF', '#B9B3BE'] },
    },
  },
  // pines stay low (no upper-slope forest)
  zoneRules: { forestThreshold: 0.5, forestMaxFrac: 0.18 },
  patchwork: 'off',
  landmarks: {},
  scatter: [
    {
      def: 'pine',
      zones: [forest, grass],
      minDist: 5,
      density: 0.55,
      slopeMax: 0.7,
      heights: [1.5, 9],
      shore: [4, 1000],
      cluster: { scale: 26, threshold: 0 },
      scale: [0.8, 1.15],
    },
    {
      def: 'basaltBoulder',
      zones: [rock, cliff, sandBlack, grass, meadow],
      minDist: 7,
      density: 0.5,
      slopeMax: 2,
      heights: [0.3, 34],
      scale: [0.7, 1.3],
    },
    {
      def: 'steamVent',
      zones: [rock, grass, meadow],
      minDist: 12,
      density: 0.7,
      slopeMax: 0.9,
      heights: [5, 30],
      scale: [0.9, 1.2],
      maxPerIsland: 7,
    },
    {
      def: 'cableSpool',
      zones: [grass, meadow, sandBlack],
      minDist: 12,
      density: 0.6,
      slopeMax: 0.4,
      heights: [0.5, 14],
      shore: [2, 1000],
      scale: [0.9, 1.1],
      maxPerIsland: 4,
    },
    {
      def: 'warningSign',
      zones: [grass, meadow, rock],
      minDist: 14,
      density: 0.6,
      slopeMax: 0.8,
      heights: [2, 30],
      scale: [0.9, 1.1],
      maxPerIsland: 5,
    },
  ],
  // the theme rules above replace the global pines / rock clusters; dry scrub has no flowers
  scatterOff: ['pine', 'rockCluster', 'flower'],
  // creature weights: THEME_LIFE.devops (none)
  life: {},
  // scatter pines are the stock pine geometry, so blobs keep the stock canopy hexes (D-031)
  treePalette: FOLIAGE,
};

/**
 * DevOps site plan tuning (world/gen/plans/devops.ts). Distances in u, heights in u above sea.
 * TASK-405 "Ember Works": the archetype grows three shelves at the cone foot (content/islands.ts
 * `shelves`): the data center terraces (`datacenter`, `datacenterUpper`) beyond the geothermal
 * plant, the deployment harbour (`harbour`) and the lava foundry (`foundry`, `foundryUpper`).
 */
export const DEVOPS_SITE = {
  plant: {
    /** Cooling towers: ring around the hot-spring (cooling pool) centre. */
    ring: [7, 13] as const,
    /** Tower obstacle / pad radius and the gap between the two towers' centres. */
    radius: 2,
    pair: [5, 8] as const,
    maxRelief: 3.5,
    minShore: 3,
  },
  terraces: {
    /**
     * Data centers per shelf level, in anchor order [upper, lower]: side by side along the
     * shelf, doors facing out to sea; the levels differ by the shelf step (≈ 4 u).
     */
    perLevel: [1, 2] as const,
    /** Target offset out to sea from each anchor (u), per level [upper, lower]. */
    out: [0, 2] as const,
    /** A lot centre stays within this of its shelf anchor's height (u). */
    levelTol: 2,
    /** Search radius around each shelf anchor, side spacing between the lot centres. */
    search: 12,
    side: 9,
    minShore: 4,
    maxRelief: 3.2,
    /** Concrete apron around each data center (district rect = footprint + 2 × apron). */
    apron: 1.6,
  },
  quad: {
    /** Ops quad (settlement plaza) radius. */
    radius: 4,
    /** Passes near the top terrace: [max relief, search radius, max level difference] (u). */
    passes: [
      [2.5, 14, 1.2],
      [4, 20, 1.2],
      [6, 26, 1.6],
    ] as const,
    /** Fallback search radius around the plant when no terrace stands. */
    fallbackSearch: 40,
  },
  ridge: {
    /** Antenna masts: distance from the crater centre, min height, spacing between masts. */
    dist: [13, 22] as const,
    minY: 14,
    /**
     * D5 (M22 TASK-482): ONE summit watch tower replaces the 2–3 rim masts — the highest rim
     * shoulder nearest the hub, antennaMast lot pinned to `towerVariant` (lattice + bell + red
     * beacon, geo/themes/devops-m22.ts).
     */
    count: [1, 1] as const,
    towerVariant: 2,
    gap: 12,
    maxRelief: 4,
    angles: 48,
  },
  yard: {
    /** Rack yard: on black sand nearest the dock root (within this ring). */
    search: [5, 60] as const,
    sheds: 2,
    racks: [2, 3] as const,
    shedGap: 1.8,
    minShore: 2,
    maxRelief: 3.5,
    /** Max shed pad level: the yard stays down on the beach (no raised shelf by the water). */
    maxY: 3.5,
    /** District rect margin around the sheds and racks. */
    margin: 1.2,
  },
  pipeline: {
    /** Pipe route: min shore distance and max slope (rise / run) of a straight run. */
    minShore: 1.5,
    maxSlope: 1.4,
    /** Clearance kept from obstacles (lots, landmarks, fixtures) except its two ends. */
    clear: 0.9,
    /** Obstacle half-width registered along the pipe (scatter keeps off it). */
    halfWidth: 0.6,
  },
  dock: { rowboats: [1, 2] as const },
  /** Deployment harbour on the `harbour` shelf (pier, container yard, gantry crane, tower). */
  harbour: {
    /** Pier search around the shelf anchor; the anchor is ≈ 10 u inland of the quay. */
    dockSearch: 26,
    /** Concrete quay: shelf samples within this of the anchor and below `maxY` are paved. */
    paveR: 17,
    maxY: 4,
    /** Container yard (stacks + crane, boom out to sea): slots tried in the shelf frame, search. */
    yardSlots: [
      [0, -2],
      [0, 2],
      [-7, -2],
      [7, -2],
      [0, -7],
      [-7, 3],
      [7, 3],
    ] as const,
    yardSearch: 10,
    /** Yard headings tried (rad off the shelf's outward heading), each over every slot. */
    yardTurns: [0, 0.35, -0.35],
    /** The yard prefab is large: its footprint may span this much relief (the pad levels it). */
    yardRelief: 3.6,
    minShore: 2,
    maxRelief: 2.2,
    /** CI/CD belt: rack shed → the container yard, straight; shed-to-yard-edge range (u). */
    belt: [2, 16] as const,
    /**
     * Quay dressing (density pass): kits on a grid over the paved quay, shuffled; a lane `lane` u
     * wide stays clear from the pier root to the yard. Loose container rows, fuel tanks and
     * forklifts first, then crate / cable-spool piles; lamp posts along the quay edge.
     */
    quay: {
      pitch: 3.6,
      minShore: 2,
      lane: 3,
      rootClear: 8,
      /** Machinery caps per kind (placed first), stock piles after, fit search for machinery. */
      caps: { row: 3, tank: 2, forklift: 2 },
      bigSearch: 3,
      piles: 12,
      crateShare: 0.65,
      pile: [3, 4] as const,
      pileR: 1.3,
      lampShore: [1.2, 3.4] as const,
      lampGap: 7,
      lamps: 7,
    },
  },
  /**
   * Village infill (density pass): cottage lodges and rack sheds (fixtures of the existing defs,
   * one variant set) on the data center and foundry shelves, doors out to sea, so the shelves
   * read as small villages. Per anchor: how many, rows (u inland / out) and tangent spacing.
   */
  village: {
    perShelf: { datacenterUpper: 2, datacenter: 4, foundryUpper: 3 } as Record<string, number>,
    rows: [0, 3.5, -3.5, 6.5, -6.5] as const,
    spacing: 4.4,
    span: 24,
    search: 2.5,
    minShore: 3.5,
    maxRelief: 2.6,
    levelTol: 1.4,
    /** Every `shedEvery`-th building is a rack shed (variants cycled), the rest cottages. */
    shedEvery: 3,
  },
  /** Lava foundry on the `foundry` (lower) and `foundryUpper` shelves. */
  foundry: {
    /** Furnace halls on the upper step (side spacing); the rail and a row of shops below. */
    furnaces: [1, 2] as const,
    furnaceSide: 8.5,
    /** Rail line along the lower shelf at the foot of the step: length range, offsets tried. */
    rail: [12, 28] as const,
    railOut: [-7, -6, -8, -5, -9, -4] as const,
    /** Rail pads: small discs this far apart (one big corridor pad would tie the step levels). */
    railPad: 4,
    /** The shop row stands this far seaward of the rail; smithies and lodges alternate. */
    rowOff: 5.5,
    smithies: [2, 3] as const,
    lodges: [2, 3] as const,
    pitch: 5.6,
    /** Fit search around each shop slot (u). */
    shopSearch: 3.5,
    search: 7,
    minShore: 4,
    maxRelief: 2.6,
    /** Paved foundry yard on the upper step (square around each furnace). */
    yardR: 5,
  },
  /** Steam main: a vent high on the cone above the plant, piped down to a cooling tower (maxSlope: gentler than the pipeline so
   * the pipe pieces traverse the cone in short steps, TASK-453c). */
  steam: { ventY: [15, 24] as const, search: 16, furnaceR: 3.2, maxSlope: 0.6 },
  /** Worker lodges (cottage fixtures, variants cycled) beside the ops quad. */
  quadLodges: { count: 2, ring: [7, 13] as const, variants: [3] as const },
  /**
   * R3-13 (M22 TASK-482): every DevOps lodge (quad, shelf village, foundry row) is the cottage
   * ops-shack variant (steel roof, orange trim; geo/themes/devops-m22.ts), not the stock cottage.
   */
  lodgeVariant: 3,
  /**
   * D8 fumarole pools (TASK-482): a trio of level pool discs on the cone flank (zones
   * FUMAROLE_ZONES, kerbless: no prop), each in a salt rim `rim` u wide. The trio centre is the
   * flattest spot `dist` u from the crater centre at `y` heights, nearest the crater → hub
   * heading (the face the village cameras see); pools sit `spread` u from it.
   */
  fumaroles: {
    radii: [3, 2.5, 2.1] as const,
    rim: 1.4,
    spread: 5.4,
    /** Trio centre distance from the crater centre and its height band (u). */
    dist: [10, 34] as const,
    y: [5, 22] as const,
    /** Score: relief + `heading` × angle off the crater → hub heading (rad). */
    heading: 0.6,
    /**
     * Relief under one pool + rim before its pad: the pads level every sample within the
     * archetype's padBreak (2.5 u) of the mean, so up to ~2 × that the pool reads level.
     */
    maxRelief: 5.5,
    /** Second pass: maxRelief × this. */
    rough: 1.4,
    minShore: 6,
    /** Pad margin round each disc (its own level: pools step down the slope). */
    padMargin: 0.6,
    padStep: 1.5,
  },
  /**
   * D11 basalt columns (TASK-482): clusters of basaltBoulder v2 (hex column clusters) on the
   * windward shore at the foot of a steep rise: shore distance `shore`, ground ≤ `maxY`, the ground
   * `probe` u inland at least `rise` u higher; `clusters` cluster centres ≥ `gap` apart, each
   * `perCluster` columns within `spread` u.
   */
  columns: {
    variant: 2,
    maxLee: 0.3,
    shore: [0.4, 3] as const,
    maxY: 2.2,
    probe: 5,
    rise: 2.4,
    clusters: [3, 4] as const,
    gap: 11,
    perCluster: [3, 5] as const,
    spread: 2.6,
    sep: 1.15,
  },
  /**
   * D12 switchback service roads (TASK-482, R3-13 "every direction"): from the summit watch tower
   * down to the hub and to the foot of shelf facilities (`feet`, in this order, each >= `minTurn`
   * rad round the crater from the others, `maxRoads` with the hub road), each a zigzag of legs of
   * about `legRise` u of drop (`legs` range) swinging `amp` u across the fall line; every leg is a
   * 'stair' link searched in a `corridor` u half-width strip (straight legs, sharp hairpins).
   * The foot pin stands `footIn` u from the shelf anchor toward the crater (on the cone).
   */
  switchback: {
    feet: ['harbour', 'foundryUpper', 'datacenterUpper', 'hotspring', 'foundry'] as const,
    maxRoads: 4,
    minTurn: 1.0,
    footIn: 6,
    legRise: 6,
    legs: [2, 8] as const,
    amp: 18,
    corridor: 2.6,
    /** Hairpin corners keep this much shore distance (u). */
    minShore: 3,
    /** lavaLantern every `every`-th path sample (PATHS.step u) on cone paths above `minY`. */
    every: 5,
    minY: 9,
    /** Lantern this far beside the centreline, >= PATHS.halfWidth + `gap` from every path sample. */
    side: 1.8,
    gap: 0.5,
    /** A lantern stands only where the ground within `levelR` u varies ≤ `maxRelief` u; at most `maxLanterns`. */
    levelR: 0.3,
    maxRelief: 0.65,
    maxLanterns: 40,
  },
} as const;

/**
 * DevOps movers (TASK-405, render/movers.ts + render/harbour-routes.ts): closed-form, time-driven,
 * not life agents. Cargo ships lap a stadium loop off each DevOps pier head, stopping alongside
 * it; a short ore train shuttles along each foundry rail line. Distances in u, speeds in u/s.
 */
export const DEVOPS_MOVERS = {
  ship: {
    /** Ships per DevOps pier (phase-shifted by an equal share of the cycle). */
    perDock: 2,
    speed: 2.4,
    /** Stop alongside the pier head (s). */
    dwell: 7,
    /** Stadium loop: near straight (through the pier head, along the coast), turn radius. */
    straight: 22,
    turnR: 9,
    /** Near straight this far past the pier end (ship side to the pier head). */
    off: 2.4,
    /** The loop is pushed out by `push` u up to `tries` times until it lies in water. */
    push: 2,
    tries: 8,
    /** Every loop sample (and ± `lateral` u across it) at least this deep. */
    minDepth: 1.2,
    lateral: 2.2,
  },
  train: {
    /** Cars per rail line (crate carts), gap between them, speed, end dwell, scale. */
    cars: 3,
    gap: 1.7,
    speed: 1.6,
    dwell: 3,
    scale: 1.25,
  },
  /** Dither fade by camera distance (u); the meshes hide 20 u past `fadeFar`. */
  fadeNear: 170,
  fadeFar: 240,
} as const;
