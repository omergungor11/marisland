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
  /** Night fireflies (particles, not agents: one draw call, excluded from `agents`). */
  fireflies: number;
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
    sheep: 4,
    crabs: 1,
    fireflies: 12,
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
    sheep: 8,
    crabs: 3,
    fireflies: 18,
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
    sheep: 12,
    crabs: 5,
    fireflies: 24,
  },
};

/** Sim LOD: beyond `farDistance` u from the camera an agent updates every `farEvery`-th fixed step. */
/**
 * Fireflies (ART_BIBLE W3 Lantern Night; TASK-192): a handful of warm points bobbing on slow Lissajous
 * paths at the forest/meadow edges of the settlement island. Pure functions of the engine clock and
 * `night`, so capture mode freezes them; zero agents, zero programs (creature glyph mode), one draw.
 */
export const FIREFLIES = {
  /** Zoom tier from which they are shown. */
  minTier: 2,
  color: '#FFD54A',
  /** Dot radius, u (an octahedron; blinking scales it 0 → 1 → 0). */
  size: 0.36,
  /** Night 0..1 window: nothing below `night[0]`; the swarm is complete at `night[1]` (each firefly lights at its own point of the ramp). */
  night: [0.5, 0.85] as const,
  /** Fraction of the ramp over which one firefly fades in (the rest is per-firefly stagger). */
  stagger: 0.6,
  /** Fireflies per swarm and swarm radius, u. */
  perSwarm: 6,
  swarmRadius: 3,
  /** Lissajous half-extents (u), periods (s) and height above the ground (u). */
  extent: [0.9, 2.4] as const,
  period: [7, 13] as const,
  height: [0.5, 1.7] as const,
  bob: 0.25,
  /** Blink: period (s) per firefly and the lit fraction of it. */
  blink: [2, 3] as const,
  duty: 0.7,
  /** Swarm centres: forest edge cells (grass/meadow with forest within `edgeRing` u), keep-out beyond lamp pools. */
  edgeRing: 3.5,
  minEdgeHits: 2,
  shoreMin: 5,
  minHeight: 0.8,
  lampClear: 1.5,
  /** Swarm centres are ranked by distance to the settlement hub in bands of this width (u). */
  hubBand: 8,
  minSeparation: 8,
} as const;

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
  /**
   * Foam wake (TASK-192 D4): small flat foam discs, NOT the water foam-trail texture. That texture has
   * 3 u texels (384 u / 256), so any splat is ≥ 2 u wide and per-step splats saturate into a ~10 u white
   * band. Here a pair of dots is laid every `spacing` u of travel `back` u behind the origin, `side` u
   * either side of the track; each dot drifts outward `spread` u/s (the V), grows in over `pop` of its
   * life and shrinks away over `life` s (≈ 3 u/s × 2.8 s ≈ 8 u ≈ 2 boat lengths). `radius` u is the
   * disc radius (± `jitter`). None below `minTier` (T0: boats are specks).
   */
  wake: {
    spacing: 0.7,
    back: 2.2,
    side: 0.3,
    spread: 0.45,
    radius: 0.3,
    jitter: 0.3,
    life: 2.8,
    pop: 0.12,
    lift: 0.12,
    minTier: 1,
  },
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
  /**
   * Instance size multiplier per kind (chunky-cute: figures are drawn bigger than life). TASK-192
   * D11: sheep/villagers/cats were 2–10 px at the village zoom; they must read as a blob + head.
   */
  size: { villagers: 1.7, cats: 1.65, sheep: 2.1, crabs: 1.4 },
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
  wave: {
    radius: 25,
    minTier: 3,
    seconds: 2.2,
    /** Click emote (`Villagers.wave`): the same wave, shorter (TASK-192). */
    emoteSeconds: 1.5,
    k: 200,
    c: 16,
    lower: 0.35,
    cooldown: [9, 16],
  },
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
  /** Flock homes are taken from the nearest `anchorBand`-u band (barn / windmill / hub) outward. */
  anchorBand: 6,
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

/** Worker bot palette (life/geo/workers.ts). Body, arms and ear pads take the instance team tint. */
export const WORKER_COLORS = {
  metal: '#8C94A8',
  foot: '#454B5C',
  hand: '#E4E8F0',
  shell: '#F1F3F8',
  screen: '#2B2B36',
  plate: '#D3D8E3',
  light: '#7CFFB2',
  eye: '#BDF7FF',
  blush: '#FF9EB5',
  antenna: '#FFD54A',
  acc: {
    headsetBand: '#2F3340',
    headsetCup: '#FF8A6A',
    hood: '#4A5368',
    phoneBand: '#2F3340',
    phoneCup: '#7CFFB2',
    cap: '#FFF4E0',
    capBrim: '#E35D6A',
    badge: '#F5C84C',
    badgeIcon: '#FFF8E8',
    visor: '#2E9E74',
    monocle: '#F5C84C',
    beret: '#D6477D',
    beretNub: '#8E2E58',
    hat: '#FFD23F',
    hatRidge: '#E0A800',
    strap: '#6B4A33',
    rim: '#C9A24B',
    lens: '#7DE8F2',
  },
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
