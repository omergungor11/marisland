/** Life catalog numbers (ART_BIBLE §7 rows 3, 4, 8–15, 26, 28). Data only. */
import { Zone } from '../world/types.ts';

/** Per-quality agent plan; totals stay ≤ QUALITY_PRESETS[q].agentCap (fish/dolphins only live at T3/T1+). */
export interface LifePlan {
  sailboats: number;
  rowboats: number;
  /** Parked (non-sailing) sailboats at moorings. */
  parked: number;
  flocks: number;
  gullsPerFlock: [number, number];
  schools: number;
  fishPerSchool: [number, number];
  jumpers: number;
  dolphins: number;
  /** Land agents (TASK-161), totals across the archipelago; spawned per island by what it offers. */
  villagers: number;
  cats: number;
  sheep: number;
  crabs: number;
}
export const LIFE_PLAN: Record<'low' | 'medium' | 'high', LifePlan> = {
  low: {
    sailboats: 2,
    rowboats: 1,
    parked: 0,
    flocks: 2,
    gullsPerFlock: [3, 4],
    schools: 1,
    fishPerSchool: [4, 5],
    jumpers: 1,
    dolphins: 0,
    villagers: 3,
    cats: 1,
    sheep: 3,
    crabs: 1,
  },
  medium: {
    sailboats: 3,
    rowboats: 2,
    parked: 1,
    flocks: 3,
    gullsPerFlock: [4, 5],
    schools: 2,
    fishPerSchool: [4, 6],
    jumpers: 2,
    dolphins: 2,
    villagers: 5,
    cats: 2,
    sheep: 6,
    crabs: 3,
  },
  high: {
    sailboats: 4,
    rowboats: 3,
    parked: 2,
    flocks: 3,
    gullsPerFlock: [5, 8],
    schools: 2,
    fishPerSchool: [6, 10],
    jumpers: 3,
    dolphins: 2,
    villagers: 9,
    cats: 4,
    sheep: 10,
    crabs: 5,
  },
};

/** Sim LOD: beyond `farDistance` u from the camera an agent updates every `farEvery`-th fixed step. */
export const SIM_LOD = { farDistance: 400, farEvery: 6 } as const;

export const SAILBOAT = {
  speed: 3,
  /** Speed within `stopRadius` u of a route stop dock end (eased in). */
  stopSpeed: 1.2,
  stopRadius: 12,
  heelDeg: 8,
  /** Yaw rate (rad/s) at which the heel saturates. */
  heelRate: 0.25,
  heelLambda: 3,
  /** Swell taps for roll/pitch (u). */
  tapSide: 0.9,
  tapFront: 1.6,
  puff: 0.05,
  /** Wake splat behind the stern: offset u, radius u, strength. */
  wake: { offset: 2.5, radius: 1.2, strength: 0.35 },
  /** Fallback route: ring radius beyond the island, minimum depth, loop spacing. */
  route: { margin: 25, minDepth: 2, spacing: 2, count: 2, pushStep: 2, pushMax: 80 },
} as const;

export const ROWBOAT = {
  period: [2.9, 3.5],
  rollPhaseLag: 0.8,
  bobShare: 0.5,
  minDepth: 0.8,
} as const;

export const GULLS = {
  radius: [15, 25],
  altitude: [12, 25],
  period: 12,
  periodJitter: 0.1,
  bankDeg: 20,
  /** 3 flaps of 0.3 s then a 2 s glide. */
  flaps: 3,
  flapPeriod: 0.3,
  glide: 2,
  spread: 0.5,
  radiusJitter: 3,
  /** Landing: descent speed u/s (clamped duration), sit seconds, takeoff seconds. */
  land: {
    speed: 9,
    minTime: 3,
    maxTime: 14,
    sit: [4, 8],
    takeoff: 2.5,
    perchY: 1.2,
    /** Perch height above terrain at landmark tops. */
    landmarkTop: { lighthouse: 14, clocktower: 11 } as Record<string, number>,
    pulse: 1.08,
  },
} as const;

export const FISH = {
  speed: 1.6,
  fleeSpeed: 4,
  maxTurnDeg: 90,
  depthBelowSurface: 0.5,
  /** Allowed cell depth (u) when spawning an anchor / when moving. */
  spawnDepth: [0.8, 4],
  moveDepth: [0.5, 5],
  repelRadius: 14,
  regroupAfter: 2,
  goalRadius: 18,
  goalTime: [8, 15],
  searchRadius: 150,
  reanchorDistance: 100,
  size: 1,
  colors: ['#FF7A5C', '#F5C84C', '#3FB8AF', '#FF8FB1'],
} as const;

export const ARCS = {
  fish: {
    height: 1.2,
    length: 2,
    duration: 0.6,
    spin: 1,
    splash: { radius: 0.8, strength: 0.6 },
    scale: 1,
  },
  dolphin: {
    height: 2,
    length: 5,
    duration: 0.9,
    arcs: 3,
    gap: 0.35,
    pairOffset: 1.6,
    pairLag: 0.1,
    scale: 3,
    splash: { radius: 1.4, strength: 0.7 },
  },
  /** Jump search near a coast, radius around the focus (u). */
  fishRadius: 80,
  dolphinRadius: 120,
} as const;

/** Ambient Poisson scheduler: exponential gaps with `mean` s, clamped to [min, max]. */
export const AMBIENT = {
  fishJump: { mean: 10, min: 6, max: 14 },
  gullLand: { mean: 27, min: 15, max: 40 },
  coconutDrop: { mean: 45, min: 20, max: 90 },
  dolphins: { mean: 45, min: 30, max: 60 },
} as const;

export const LIFE_COLORS = {
  gullBody: '#FFFFFF',
  gullWing: '#F4F7FA',
  gullTip: '#6C7280',
  gullBeak: '#F5C84C',
  boatHull: '#E8735A',
  boatTrim: '#FFF4E0',
  boatSail: '#FAFAF5',
  boatMast: '#8A5A3B',
  fishTop: '#FFFFFF',
  fishBelly: '#EDEDED',
  dolphinTop: '#7C8FA8',
  dolphinBelly: '#E4EAF2',
} as const;

/**
 * Land agents (TASK-161): villagers, cats, sheep, crabs. Positions are in u, times in s, speeds in
 * u/s. Allocation across islands is D'Hondt over `weights` (key = settlement kind or archetype).
 */
export const LAND = {
  /** First zoom tier at which each kind is alive (ART_BIBLE §6: villagers/sheep T2, crabs T3). */
  minTier: { villagers: 2, cats: 2, sheep: 2, crabs: 3 },
  /** Instance size multiplier per kind (chunky-cute: figures are drawn bigger than life). */
  size: { villagers: 1.3, cats: 1.25, sheep: 1.25, crabs: 1.4 },
  /** Reveal: staggered spring-in (BLOOM_IN k/c), then a short ease-out when the tier drops. */
  appearStagger: 0.22,
  outSeconds: 0.14,
  /** Reduced motion: ease-in without overshoot over this long. */
  calmInSeconds: 0.3,
  /** Terrain clearance of the feet. */
  footLift: 0.02,
  /** A solid prop (tree, rock, haybale …) blocks cats/sheep within its footprint plus this. */
  solidMargin: 0.35,
  /** Props with a smaller footprint (u) never block. */
  solidMinFootprint: 0.3,
  /** Lots/landmarks block within their footprint plus this. */
  lotMargin: 0.8,
  landmarkMargin: 0.8,
  /** Straight-line wander moves are checked every this many u. */
  segmentCheck: 0.6,
} as const;

/** Villagers walk the path graph between points of interest; the camera gets a wave. */
export const VILLAGERS = {
  /** Settlement kind → allocation weight (0 = none). */
  weights: { village: 6, farm: 2, lighthouse: 1, cabin: 1, beachhut: 1, spring: 0 } as Record<
    string,
    number
  >,
  /** Per-settlement cap. */
  perSettlement: 6,
  speed: 1.3,
  /** One footstep = half a leg cycle (ART_BIBLE #8: 0.45 s). */
  stepPeriod: 0.45,
  hop: 0.12,
  squash: 0.1,
  /** Side-to-side sway (rad) at full gait. */
  sway: 0.06,
  /** Stand-still beats: `[min, max]` s. */
  pauseDoor: [1.5, 3],
  pauseNode: [1.2, 2.4],
  /** Look-around yaw amplitude (rad) and sweeps per pause. */
  lookYaw: 0.7,
  /** Fishing / watching at the dock end. */
  pauseDock: [6, 12],
  /** Trips: chance to head to a dock end, else a random door / hub. */
  dockChance: 0.2,
  /** Wave at a camera within `radius` u (tier ≥ `minTier`): spring raise, then lower. */
  wave: { radius: 25, minTier: 3, seconds: 2.2, k: 200, c: 16, lower: 0.35, cooldown: [9, 16] },
  /** Turn rate toward the heading / camera (1/s). */
  turnRate: 9,
  /** Walkable land: nodes below this terrain height are dropped (boardwalks over water). */
  minWalkY: 0.15,
  /** Dock deck height above the waterline (dock prop: planks top at 0.7). */
  deckY: 0.7,
  /** Samples along a dock (u). */
  dockStep: 1,
  pickRadius: 0.7,
  pickHeight: 0.65,
} as const;

export const SHEEP = {
  zones: [Zone.meadow],
  /** Archetype → allocation weight; other archetypes use `otherWeight` × meadow area. */
  weights: { millbrook: 5, hearthholm: 1 } as Record<string, number>,
  otherWeight: 0.5,
  /** Minimum meadow cells (2 u grid) of an island to host a flock. */
  minMeadowCells: 40,
  flockSize: [2, 4] as const,
  /** Walk speed, roam radius around the flock home, graze/walk beats. */
  speed: 0.55,
  legHz: 1.6,
  radius: 8,
  walk: [2, 5] as const,
  /** Graze: head down, 8 s (ART_BIBLE #26). */
  rest: [6, 10] as const,
  hopDist: [1.5, 4] as const,
  /** Chance a graze ends with a hop (0.35 s, 0.2 u). */
  hopChance: 0.35,
  hop: { seconds: 0.35, height: 0.2 },
  /** Wool jiggle after landing: spring k=120 c=6, impulse in squash (fraction). */
  jiggle: { k: 120, c: 6, impulse: 0.15 },
  /** Head-dip transition rate (1/s). */
  headLambda: 4,
  /** Flock radius at spawn (u). */
  spawnSpread: 2.2,
  /** Candidate flock homes must have this fraction of the ring (radius 3 u) on meadow. */
  homeCover: 0.85,
  pickRadius: 0.6,
  pickHeight: 0.4,
  /** Body waddle (rad) at walking pace. */
  roll: 0.05,
} as const;

export const CATS = {
  zones: [Zone.grass, Zone.meadow, Zone.forest, Zone.path, Zone.plaza],
  weights: { village: 3, farm: 1, cabin: 1, lighthouse: 1, beachhut: 0, spring: 0 } as Record<
    string,
    number
  >,
  speed: 0.9,
  legHz: 2.2,
  radius: 15,
  walk: [3, 6] as const,
  /** Sit and tail-flick. */
  rest: [4, 10] as const,
  hopDist: [3, 7] as const,
  /** Cats prefer to start 2–5 u from a lot door / plaza. */
  spawnSpread: [2, 5] as const,
  pickRadius: 0.4,
  pickHeight: 0.3,
  /** Pad at rest: sit squash (y) and rear-up pitch (rad). */
  sit: { squash: 0.9, pitch: 0.12 },
  hop: 0.05,
} as const;

export const CRABS = {
  zones: [Zone.sandWet, Zone.sandDry, Zone.sandBlack, Zone.shallow],
  /** Archetype → allocation weight. */
  weights: {
    hearthholm: 4,
    palmlagoon: 3.5,
    lonelypalm: 1.5,
    millbrook: 1,
    mossgrove: 1,
    beaconrock: 0,
    emberpeak: 0,
  } as Record<string, number>,
  /** Beach homes: shore SDF window (u) of the cell (dry sand above the wet line). */
  homeSdf: [0.5, 6] as const,
  /** Shallow cells are only entered up to this depth (u). */
  maxDepth: 0.45,
  /** Scuttle 3 s covering ~1.5 u sideways, pause 2–5 s, 8 Hz leg tick. */
  speed: 0.5,
  radius: 7,
  walk: [2, 3] as const,
  rest: [2, 5] as const,
  hopDist: [1, 2] as const,
  legHz: 8,
  /** Freeze beat: chance of a 0.4–0.9 s stop in the middle of a scuttle. */
  freezeChance: 0.5,
  freeze: [0.4, 0.9] as const,
  spawnSpread: 1.5,
  pickRadius: 0.35,
  pickHeight: 0.15,
} as const;

export const LAND_COLORS = {
  skin: '#FFD6B0',
  trousers: '#5B6C86',
  shoe: '#6B4A33',
  hair: '#7A4B2A',
  beanie: '#E8735A',
  straw: '#F2D27A',
  strawBand: '#E8735A',
  /** Instance tints (white vertices of the villager shirt are multiplied by these). */
  shirts: ['#E8735A', '#F5C84C', '#3FB8AF', '#7FD8B3', '#FF8FB1', '#7C8FA8'],
  wool: '#FFFFFF',
  woolTints: ['#FFFFFF', '#FFF6E4', '#F2EEE8', '#FFFFFF'],
  sheepFace: '#3C3A46',
  sheepLeg: '#3C3A46',
  catFurs: ['#E89A55', '#8C93A3', '#F4E6CF', '#4A4650', '#C9A07A'],
  catInner: '#FFB8B0',
  catEye: '#2B2B36',
  crabShell: '#F0644E',
  crabShellTints: ['#FFFFFF', '#FFE2C8', '#FFD0C0'],
  crabLeg: '#D9503C',
  crabEye: '#22222C',
} as const;
