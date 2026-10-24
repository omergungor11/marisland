/** Life catalog numbers (ART_BIBLE §7 rows 3, 4, 8–15, 26, 28). Data only. */
import { Zone } from '../world/types.ts';
import type { WorkPose } from './offices.ts';
import type { CarriedItem } from './themes/index.ts';

/** The seven HQ street zones (TASK-466): paving, walked like paths. */
const STREET_ZONES = [
  Zone.streetHq,
  Zone.streetCoding,
  Zone.streetMarketing,
  Zone.streetQa,
  Zone.streetDesign,
  Zone.streetDevops,
  Zone.streetResearch,
];

/** Per-quality agent plan; totals stay ≤ QUALITY_PRESETS[q].agentCap (fish/dolphins only live at T3/T1+). */
export interface LifePlan {
  sailboats: number;
  rowboats: number;
  /** Parked (non-sailing) sailboats at moorings. */
  parked: number;
  /** Culture boats (TASK-434): HQ ferries on 'ferry' routes, QA inspection boat, Design lantern boat. */
  ferries: number;
  patrolBoats: number;
  lanternBoats: number;
  flocks: number;
  gullsPerFlock: [number, number];
  schools: number;
  fishPerSchool: [number, number];
  jumpers: number;
  dolphins: number;
  /** Land agents (TASK-161), totals across the archipelago; spawned per island by what it offers. */
  villagers: number;
  /** Department workers (Phase 3, D-026): replace the villagers; allocated by island theme weight. */
  workers: number;
  /** Near-focus ambient worker slots per island = round(ACTIVITY.slots[theme] × this) (TASK-383). */
  ambientScale: number;
  cats: number;
  sheep: number;
  crabs: number;
  /** Night fireflies (particles, not agents: one draw call, excluded from `agents`). */
  fireflies: number;
  /** Ducks on the Coding reflecting pool (TASK-332): agents; 0 on low (its cap is already full). */
  ducks: number;
  /** Day butterflies over the Design flowers (TASK-332): particles like fireflies, not agents. */
  butterflies: number;
}
export const LIFE_PLAN: Record<'low' | 'medium' | 'high', LifePlan> = {
  low: {
    sailboats: 1,
    rowboats: 1,
    parked: 0,
    ferries: 1,
    patrolBoats: 0,
    lanternBoats: 0,
    flocks: 2,
    gullsPerFlock: [3, 3],
    schools: 1,
    fishPerSchool: [4, 4],
    jumpers: 1,
    dolphins: 0,
    villagers: 0,
    workers: 8,
    ambientScale: 0.5,
    cats: 1,
    sheep: 2,
    crabs: 1,
    fireflies: 27,
    ducks: 0,
    butterflies: 6,
  },
  medium: {
    sailboats: 2,
    rowboats: 3,
    parked: 0,
    ferries: 1,
    patrolBoats: 1,
    lanternBoats: 1,
    flocks: 3,
    gullsPerFlock: [3, 5],
    schools: 2,
    fishPerSchool: [4, 6],
    jumpers: 2,
    dolphins: 2,
    villagers: 0,
    workers: 16,
    ambientScale: 0.75,
    cats: 2,
    sheep: 6,
    crabs: 2,
    fireflies: 54,
    ducks: 4,
    butterflies: 10,
  },
  high: {
    sailboats: 4,
    rowboats: 3,
    parked: 2,
    ferries: 2,
    patrolBoats: 1,
    lanternBoats: 1,
    flocks: 3,
    gullsPerFlock: [5, 8],
    schools: 2,
    fishPerSchool: [6, 10],
    jumpers: 3,
    dolphins: 2,
    villagers: 0,
    workers: 30,
    ambientScale: 1,
    cats: 4,
    sheep: 12,
    crabs: 5,
    fireflies: 72,
    ducks: 5,
    butterflies: 16,
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
  perSwarm: 9,
  swarmRadius: 4.5,
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
  /**
   * Q17 bug hunt 2.0 (TASK-480): extra green swarms on the theme's island, centred on these story
   * spots (the UV-lamp hunt by the track, the Bug Zoo's ant trail), `perSwarm` each, on top of the
   * plan's count (any quality with fireflies). Not agents, same mesh (instance colour).
   */
  bugHunt: {
    theme: 'qa',
    color: '#6CF59A',
    stories: ['uvBugHunt', 'antTrail'] as readonly string[],
    /** Swarm centre offset from the story spot along its facing (u). */
    ahead: 1.5,
  },
  /**
   * D15 ember sparks (M22 TASK-482): orange firefly points on the theme's island (same mesh,
   * instance colour, night only like the fireflies). At every `anvilHammer` story spot `anvil.n`
   * sparks burst off the anvil top once per hammer stroke (the worker hammer pose: 1.1 Hz) and
   * fly out in a short arc; at every furnace mouth (`foundry` fixture, hall-local `mouth`)
   * `forge.n` embers drift up continuously, each on its own period. Lengths in u, times in s.
   */
  embers: {
    theme: 'devops',
    color: '#FF8A3D',
    size: 0.75,
    anvil: {
      story: 'anvilHammer',
      /** Anvil top: this far ahead of the smith's spot, this high. */
      ahead: 0.8,
      y: 0.75,
      n: 3,
      period: 0.909,
      spread: 0.9,
      rise: 0.7,
    },
    forge: {
      def: 'foundry',
      /** Mouth sill in the hall frame (along its facing, height). */
      mouth: [3.4, 0.4] as const,
      n: 8,
      period: [1.4, 2.6] as const,
      width: 1.1,
      rise: 3.4,
      sway: 0.25,
    },
  },
} as const;

export const SIM_LOD = { farDistance: 400, farEvery: 6 } as const;

export const SAILBOAT = {
  speed: 3,
  /** Speed within `stopRadius` u of a route stop dock end (eased in). */
  stopSpeed: 1.2,
  stopRadius: 12,
  /** Sailing boats keep this far (u, centre to centre) from every pier-end berth: a ferry dwells there. */
  berthClear: 12,
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
  /**
   * Lingering wake trail (TASK-472 B4): on every tier each boat also stamps the water's foam-trail
   * texture (content/water `trail`) `back` u behind its origin every `spacing` u of travel, a disc of
   * `radius` u per kind that lingers `life` s, widening and fading (the route "draws itself" at T0).
   * At build the last `life` s of each boat's track are stamped with their ages, so the routes are
   * drawn from the first frame (ferries by their timetable, the others at cruise speed).
   */
  trail: {
    spacing: 0.5,
    back: 1.6,
    life: 40,
    radius: { sailboat: 1.0, ferry: 1.6, patrol: 0.9, lanternBoat: 0.75 } as Record<string, number>,
    strength: 1,
  },
  /** Fallback route: ring radius beyond the island, minimum depth, loop spacing. */
  route: { margin: 25, minDepth: 2, spacing: 2, count: 2, pushStep: 2, pushMax: 80 },
} as const;

/**
 * Culture boats (TASK-434, ISLAND_CULTURES §3.1). Ferries (sailboat v2) run the 'ferry' routes on a
 * closed-form timetable: cruise at `speed`, brake at constant `decel` to stand still at each stop for
 * the route's `dwell` s (HQ_FERRY.dwell), accelerate away. The inspection boat (v3) and the lantern boat
 * (v4) circle their culture island on a ring `margin` u beyond its radius at a leisurely `speed`.
 */
export const CULTURE_BOATS = {
  ferry: { variant: 2, speed: 3.4, decel: 0.45, startFrac: 0.12, heelScale: 0.6 },
  // Q10 (TASK-480): the ring weaves through the QA plan's inspection buoys, `weave` u either side
  patrol: {
    variant: 3,
    theme: 'qa',
    speed: 2.2,
    margin: 22,
    slalom: { def: 'inspectionBuoy', weave: 2.6 },
  },
  lantern: { variant: 4, theme: 'design', speed: 1.4, margin: 30 },
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
    landmarkTop: { lighthouse: 20, clocktower: 17.6 } as Record<string, number>,
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
    splash: { radius: 0.8, strength: 0.6, life: 2.2 },
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
    splash: { radius: 1.4, strength: 0.7, life: 3 },
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
  minTier: { villagers: 2, workers: 2, cats: 2, sheep: 2, crabs: 3 },
  /**
   * Instance size multiplier per kind (chunky-cute: figures are drawn bigger than life). TASK-192
   * D11: sheep/villagers/cats were 2–10 px at the village zoom; they must read as a blob + head.
   */
  size: { villagers: 1.7, workers: 1.7, cats: 1.65, sheep: 2.1, crabs: 1.4 },
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

/**
 * Workers (Phase 3, TASK-307): department bots. They walk the path graph between doors, hub and
 * dock ends like the villagers did, but go INTO their lot (ENTER → WORK → EXIT) and sit at a
 * `WORK_SPOTS` seat. Times in s, speeds in u/s.
 */
export const WORKERS = {
  speed: 1.3,
  /** One footstep = half a leg cycle. */
  stepPeriod: 0.45,
  hop: 0.1,
  squash: 0.08,
  sway: 0.05,
  pauseDoor: [0.8, 2] as const,
  pauseNode: [1.2, 2.4] as const,
  pauseDock: [5, 10] as const,
  lookYaw: 0.7,
  /** Trips: chance to head to a dock end, else a random door / hub. */
  dockChance: 0.12,
  /** At a lot door: chance to go in and sit down when a seat is free. */
  enterChance: 0.75,
  /** Walking inside / to the seat (u/s) and the standing-up beat (s). */
  seatSpeed: 1.0,
  standSeconds: 0.35,
  /** Door-side ramp (u) between the terrain and a shell floor (the stilt lab's ladder). */
  floorRamp: 1.2,
  /** Sit / stand-up easing rate (1/s) and the typing spring-in (k, c). */
  sitLambda: 9,
  typeK: 160,
  typeC: 14,
  /** Time at the desk (s); a stretch beat every `stretch` s lasting `stretchSeconds`. */
  desk: [20, 60] as const,
  stretch: [8, 15] as const,
  stretchSeconds: 1.1,
  /** Share of the typing amount per work pose (seated or standing). */
  typeAmount: { type: 1, paint: 0.7, inspect: 0.55, rack: 0.55, look: 0, stand: 0 } as Record<
    string,
    number
  >,
  /** Legacy (pre-Phase-3) lots have only a door-side bench: the worker sits there typing on a laptop. */
  legacyPose: 'type',
  /** Wave at a camera within `wave.radius` u: same beat as the villagers had (VILLAGERS.wave). */
  wave: {
    radius: 25,
    minTier: 3,
    seconds: 2.2,
    emoteSeconds: 1.5,
    k: 200,
    c: 16,
    lower: 0.35,
    cooldown: [9, 16],
  },
  turnRate: 9,
  /** Outpost loop (an island without a path graph): straight legs between anchors. */
  outpost: { speed: 0.9, pause: [3, 8] as const, anchorGap: 1.2, palmGap: 3 },
  pickRadius: 0.85,
  pickHeight: 0.9,
} as const;

/**
 * Living close-up (M14c, TASK-383): the near-focus activity sim of the department bots. Times in s,
 * lengths in u. The awake bots never exceed `LIFE_PLAN.workers` (the agent cap is respected by
 * construction): the island in camera focus wakes its ambient slots and the farthest islands'
 * residents sleep to make room.
 */
export type GoalSpec =
  | { kind: 'seat'; defs: readonly string[] }
  | { kind: 'spot'; defs: readonly string[] }
  | { kind: 'queue'; def: string }
  | { kind: 'hub' }
  | { kind: 'dock' };

export interface ItineraryStep {
  goal: GoalSpec;
  /** Carried while travelling to the goal, using it and walking away (until the next step). */
  item?: CarriedItem;
}

export const ACTIVITY = {
  /** Focus: nearest campus hub within `radius` u (3-D) of the camera at tier >= `minTier`, re-evaluated every `every` steps; a rival must be `switchRatio` times nearer. */
  focus: { minTier: 2, radius: 190, every: 15, switchRatio: 0.8 },
  /** Ambient slots per island at ambientScale 1 (seat count is the soft limit). */
  slots: { hq: 12, coding: 12, marketing: 9, qa: 9, design: 9, devops: 10, research: 9 },
  /** Outposts (no walk graph) host at most this many ambient bots. */
  outpostSlots: 4,
  /** Wake: scale-in is delayed by up to `stagger` s (hash) so a campus fills in, not all at once. */
  wake: { stagger: 0.7 },
  /** First wake mix by slot rank (cycled): Walking an errand, Busy at a stop, Seated at a desk. */
  startMix: 'WBWWSWBWWS',
  /** Seconds at a desk during an itinerary, a stop by pose, an order at the kiosk, and a hub chat-stop. */
  desk: [7, 16] as const,
  use: {
    paint: [14, 26],
    inspect: [8, 16],
    look: [6, 12],
    rack: [10, 18],
    stand: [5, 9],
    // M19 culture poses (TASK-432)
    hammer: [10, 18],
    stamp: [8, 14],
    selfie: [6, 10],
    light: [8, 14],
    gaze: [8, 14],
    bell: [4, 7],
    nap: [14, 24],
  } as Record<string, readonly [number, number]>,
  /** Spots where a bot who stops may start a chat with another idle bot (the culture gathering places). */
  chatHubs: ['gatherRing', 'lectureSteps', 'coffeeCart'] as readonly string[],
  order: [2.6, 4.4] as const,
  loiter: [5, 10] as const,
  /** Spot-leg walking speed (u/s) and the micro step along a queue. */
  legSpeed: 1.0,
  queue: { gap: 1.0, length: 4, offset: 1.0, startMax: 2 },
  /** Margins (u) around props / fixtures and lots for work spots and their approach lines (bots may stand close). */
  stopMargin: { solid: 0.08, lot: 0.25 },
  /** District kind -> stops at its edges (def is what an itinerary `spot` names). */
  districtSpots: {
    solar: { def: 'solarField', pose: 'inspect', gap: 1.1, count: 2 },
  } as Record<string, { def: string; pose: WorkPose; gap: number; count: number }>,
  /** Hub loiter ring radius (u). */
  ring: 0.95,
  /** Chat: pairs that pause within `range` u of each other face up (`gap` u apart) for `seconds`. */
  chat: {
    range: 4.5,
    gap: 1.15,
    chance: 0.7,
    seconds: [4, 8] as const,
    cooldown: [8, 16] as const,
    approachSpeed: 0.9,
    /** Speaker bounce (Hz, squash) and listener nod (Hz, rad), turn swaps every `swap` s. */
    bob: { hz: 3.1, squash: 0.06 },
    nod: { hz: 1.3, pitch: 0.07 },
    swap: [1.3, 2.3] as const,
    gesture: 0.32,
  },
  /** Look-around yaw (rad) while using a spot. */
  scan: { yaw: 0.35, hz: 0.18 },
  /** Per theme: the cycle each bot walks (start offset hashed per bot). */
  itinerary: {
    // TASK-420/432 Harbour Guild: desks, the timetable, the morning bell, the coffee cart and kiosk,
    // the notice board, a post bag along the pier
    hq: [
      { goal: { kind: 'seat', defs: ['hqOffice'] }, item: 'laptop' },
      { goal: { kind: 'spot', defs: ['timetableBoard'] }, item: 'satchel' },
      { goal: { kind: 'hub' } },
      { goal: { kind: 'queue', def: 'coffeeKiosk' } },
      { goal: { kind: 'spot', defs: ['bellPost'] } },
      { goal: { kind: 'seat', defs: ['meetingPavilion'] }, item: 'laptop' },
      { goal: { kind: 'spot', defs: ['coffeeCart'] } },
      { goal: { kind: 'spot', defs: ['guildNoticeBoard'] }, item: 'satchel' },
      { goal: { kind: 'seat', defs: ['hqOffice', 'hqAnnex'] } },
      { goal: { kind: 'queue', def: 'coffeeKiosk' } },
      { goal: { kind: 'dock' }, item: 'satchel' },
    ],
    // TASK-421/432 Wind Gardens: outdoor pergola desks, solar rounds, a nap in the hammock, the whiteboard
    coding: [
      { goal: { kind: 'seat', defs: ['devOffice', 'devPod'] }, item: 'laptop' },
      { goal: { kind: 'spot', defs: ['pergolaDesk'] }, item: 'laptop' },
      {
        goal: { kind: 'spot', defs: ['solarRow', 'windTurbine', 'solarField'] },
        item: 'clipboard',
      },
      { goal: { kind: 'seat', defs: ['serverShed'] } },
      { goal: { kind: 'spot', defs: ['hammock'] } },
      { goal: { kind: 'hub' } },
      { goal: { kind: 'spot', defs: ['whiteboardA', 'kiteRack'] } },
      { goal: { kind: 'seat', defs: ['devOffice', 'devPod'] }, item: 'laptop' },
      { goal: { kind: 'dock' } },
    ],
    // TASK-403/432 Media Rock: desks, the boulevard screen, the campus ledges, the fair, the pier,
    // popcorn and the megaphone stand, the selfie platform
    marketing: [
      { goal: { kind: 'seat', defs: ['broadcastStudio'] }, item: 'laptop' },
      { goal: { kind: 'spot', defs: ['giantScreen'] } },
      {
        goal: { kind: 'spot', defs: ['antennaTower', 'mediaOffice', 'mediaShop'] },
        item: 'clipboard',
      },
      { goal: { kind: 'spot', defs: ['megaphoneStand', 'marqueeSign'] }, item: 'megaphone' },
      { goal: { kind: 'hub' } },
      { goal: { kind: 'seat', defs: ['billboard'] }, item: 'paintPot' },
      { goal: { kind: 'spot', defs: ['popcornCart', 'prizeBooth'] } },
      { goal: { kind: 'spot', defs: ['stage', 'fairBooth', 'fairTent'] } },
      { goal: { kind: 'spot', defs: ['selfieSpot', 'mascotStatue'] } },
      { goal: { kind: 'spot', defs: ['ferrisWheel'] } },
      { goal: { kind: 'dock' } },
    ],
    // TASK-423/432 Inspectors' Island: gates, the stamp desk, the clipboard wall, the scoreboard
    qa: [
      { goal: { kind: 'spot', defs: ['barrierGate'] }, item: 'clipboard' },
      { goal: { kind: 'spot', defs: ['stampDesk'] }, item: 'clipboard' },
      { goal: { kind: 'spot', defs: ['checklistBoard', 'clipboardWall'] }, item: 'clipboard' },
      { goal: { kind: 'seat', defs: ['testLab', 'testLabStilt'] }, item: 'clipboard' },
      { goal: { kind: 'hub' } },
      { goal: { kind: 'seat', defs: ['inspectionTower'] } },
      { goal: { kind: 'spot', defs: ['scoreboard', 'dummyBench'] } },
      { goal: { kind: 'spot', defs: ['barrierGate', 'checklistBoard'] }, item: 'clipboard' },
    ],
    // TASK-425/432 Glass & Light: easel walk, the hot shop, the gather ring, the stained screens
    design: [
      { goal: { kind: 'spot', defs: ['easel'] }, item: 'paintPot' },
      { goal: { kind: 'spot', defs: ['hotShop'] }, item: 'blowpipe' },
      { goal: { kind: 'spot', defs: ['gatherRing'] }, item: 'blowpipe' },
      { goal: { kind: 'spot', defs: ['stainedScreen', 'glassOrb', 'sampleShelf'] } },
      { goal: { kind: 'seat', defs: ['atelier'] }, item: 'paintPot' },
      { goal: { kind: 'spot', defs: ['sculptureTorus', 'sculptureArch', 'sculptureStack'] } },
      { goal: { kind: 'hub' } },
      { goal: { kind: 'spot', defs: ['blowpipeRack', 'hotShop'] }, item: 'blowpipe' },
      { goal: { kind: 'seat', defs: ['galleryPavilion'] } },
      // TASK-469: a look at the creek from the bank beside the glass bridge (one bank is across it)
      { goal: { kind: 'spot', defs: ['glassBridge'] } },
    ],
    // TASK-422/432 Ember Smiths: racks, cooling, the anvil, the incident board, crates to the quay
    devops: [
      { goal: { kind: 'seat', defs: ['dataCenter'] } },
      { goal: { kind: 'spot', defs: ['anvil'] }, item: 'crate' },
      { goal: { kind: 'spot', defs: ['rackRow'] }, item: 'crate' },
      { goal: { kind: 'spot', defs: ['coolingTower'] }, item: 'clipboard' },
      { goal: { kind: 'spot', defs: ['incidentSign', 'signalHorn', 'pagerRock'] } },
      { goal: { kind: 'seat', defs: ['rackShed', 'antennaMast'] } },
      { goal: { kind: 'dock' }, item: 'crate' },
      { goal: { kind: 'hub' } },
    ],
    // TASK-402b/426/432 Stargazer Academy: glasshouses, the observatory, the telescopes, lectures,
    // tea, books; samples to the research vessel's pier, the garden and the sculptures
    research: [
      { goal: { kind: 'spot', defs: ['terrarium', 'biodomeHero'] }, item: 'clipboard' },
      { goal: { kind: 'spot', defs: ['observatory'] }, item: 'laptop' },
      { goal: { kind: 'spot', defs: ['tripodTelescope', 'orrery'] }, item: 'books' },
      { goal: { kind: 'spot', defs: ['lectureSteps', 'chalkboard'] }, item: 'books' },
      { goal: { kind: 'spot', defs: ['labPod', 'radioDish', 'weatherMast'] }, item: 'clipboard' },
      { goal: { kind: 'spot', defs: ['teaTrolley', 'bookCart'] } },
      { goal: { kind: 'dock' }, item: 'crate' },
      { goal: { kind: 'spot', defs: ['hedgeParterre', 'armillarySphere', 'atomSculpture'] } },
      { goal: { kind: 'hub' } },
    ],
  } as Record<string, readonly ItineraryStep[]>,
} as const;

/**
 * Culture poses (M19, TASK-432). `code` is the arm pose of the life shader (aGait.y = 4 * code +
 * amount, life-material.ts mode 7): 1 hammer, 2 stamp, 3 selfie, 4 hold to light, 5 gaze, 6 bell,
 * 7 rest. `lean` pitches the whole bot (rad, + = back / looking up, − = bowing over a desk), `lie`
 * lays it on its back on a hammock / a roof (`NAP`).
 */
export const POSES: Readonly<Record<string, { code: number; lean?: number; lie?: number }>> = {
  hammer: { code: 1 },
  stamp: { code: 2 },
  selfie: { code: 3 },
  light: { code: 4 },
  gaze: { code: 5, lean: 0.3 },
  bell: { code: 6 },
  nap: { code: 7, lie: 1 },
  // tableau-only
  slump: { code: 7, lean: -0.85 },
  peer: { code: 5, lean: -0.5 },
};

/**
 * Night items (Q17 bug hunt 2.0, TASK-480): while `uNight` ≥ `from`, every bot of the theme carries
 * this item instead of its step's (the lantern bots of the QA bug hunt); back to the step's item by day.
 */
export const NIGHT_ITEMS = {
  from: 0.5,
  items: { qa: 'lantern' } as Readonly<Partial<Record<string, CarriedItem>>>,
} as const;

/** Lying on a hammock: pitch (rad), lift of the feet pivot (u) and shift along the heading (u), ease rate (1/s). */
export const NAP = { pitch: 1.5, lift: 0.75, shift: 1.05, lambda: 3 } as const;

/** One fixed bot of a story-spot tableau (spot frame: +z = rotY direction, +x = right hand). */
export interface TableauBotSpec {
  dx: number;
  dz: number;
  /** Faces the nearest world fixture of this def; else heading = rotY + `turn`. */
  look?: string;
  turn?: number;
  /** A `POSES` / work pose, or 'chat' (talks with the next / previous bot of the spot), 'speak', 'wave', 'stand'. */
  pose: string;
  item?: CarriedItem;
  /** Feet on the story spot's own y (+ `dy`) instead of the terrain (platforms, decks, roofs). */
  atSpot?: boolean;
  dy?: number;
}

/**
 * Story spots (`world.storySpots` kind) that need a person: the tableau bots are taken from the
 * island's ambient worker slots (no extra agents), placed once when the campus wakes and then held.
 * Offsets are tuned against `D-story-*` shots (seed 1001).
 */
export const TABLEAU: Readonly<Record<string, readonly TableauBotSpec[]>> = {
  // HQ
  signpostDebate: [
    { dx: -0.95, dz: 1.0, turn: -Math.PI / 2, pose: 'chat', item: 'satchel' },
    { dx: 0.95, dz: 1.0, turn: Math.PI / 2, pose: 'chat' },
  ],
  coffeeQueue: [
    { dx: 0, dz: 1.7, turn: Math.PI, pose: 'stand' },
    { dx: 0.2, dz: 2.7, turn: Math.PI, pose: 'stand', item: 'satchel' },
  ],
  morningBell: [{ dx: 1.0, dz: 0, turn: Math.PI / 2, pose: 'bell' }],
  // Coding
  hammockNap: [{ dx: 0, dz: 0, turn: 0, pose: 'nap', item: 'laptop' }],
  stuckKite: [{ dx: 1.6, dz: 1.2, look: 'kite', pose: 'gaze' }],
  duckCrossing: [{ dx: 2.0, dz: 0.2, turn: Math.PI / 2, pose: 'stand' }],
  // DevOps
  anvilHammer: [{ dx: 0, dz: 0, look: 'anvil', pose: 'hammer' }],
  incidentWatch: [
    { dx: -0.7, dz: 0, look: 'incidentSign', pose: 'gaze' },
    { dx: 0.7, dz: 0.3, look: 'incidentSign', pose: 'stand', item: 'clipboard' },
  ],
  containerNap: [{ dx: 0, dz: 0, turn: 0, pose: 'nap', atSpot: true }],
  onsenCapybara: [{ dx: 1.2, dz: 0.7, turn: Math.PI, pose: 'stand', atSpot: true }],
  // Marketing
  lighthouseSelfie: [{ dx: 0, dz: 0, turn: 0, pose: 'selfie', atSpot: true }],
  mascotWave: [{ dx: 0, dz: 2.6, turn: Math.PI, pose: 'wave', atSpot: true }],
  wheelNap: [{ dx: 1.5, dz: 1.0, turn: Math.PI, pose: 'slump' }],
  posterCrew: [
    { dx: 0, dz: 0, look: 'billboardV2', pose: 'paint', item: 'paintPot', atSpot: true },
  ],
  // QA
  dummyCoffee: [{ dx: 0, dz: 0, look: 'dummyBench', pose: 'stand', item: 'clipboard' }],
  sleepyStamp: [{ dx: 0, dz: -1.0, look: 'stampDesk', pose: 'slump', item: 'clipboard' }],
  scoreboardDrop: [{ dx: 0, dz: 0, look: 'scoreboard', pose: 'gaze' }],
  antTrail: [{ dx: 0, dz: 0, turn: 0, pose: 'peer', item: 'clipboard' }],
  // Design
  gafferTurn: [{ dx: 0, dz: 0, look: 'hotShop', pose: 'light', item: 'blowpipe' }],
  vaseToSun: [{ dx: 0, dz: 0, turn: 0, pose: 'light' }],
  critique: [
    { dx: 2.1, dz: 0, turn: Math.PI / 2, pose: 'chat', item: 'blowpipe' },
    { dx: -2.1, dz: 0, turn: -Math.PI / 2, pose: 'chat' },
    { dx: 0, dz: -2.1, turn: 0, pose: 'light' },
  ],
  prismRainbow: [{ dx: 0.8, dz: 0, turn: Math.PI, pose: 'light', atSpot: true }],
  // Research
  bookStepGazer: [{ dx: 0.9, dz: 0.6, look: 'tripodTelescope', pose: 'gaze', item: 'books' }],
  teaTime: [
    { dx: -0.6, dz: 0, look: 'teaTrolley', pose: 'stand' },
    { dx: 0.7, dz: 0.2, look: 'teaTrolley', pose: 'stand', item: 'books' },
  ],
  lecture: [
    { dx: -1.1, dz: 0, turn: 0, pose: 'stand', item: 'books' },
    { dx: 1.1, dz: 0, turn: 0, pose: 'stand' },
    { dx: 0, dz: 2.6, turn: Math.PI, pose: 'speak' },
  ],
  cometWatch: [{ dx: 0.9, dz: 0.9, look: 'tripodTelescope', pose: 'gaze' }],
};

/**
 * Most tableau bots a campus keeps (the first story spots in plan order win), by the quality's
 * `ambientScale` (low 0.5, medium 0.75, high 1): the awake workers never exceed `LIFE_PLAN.workers`,
 * so a small plan keeps most of its slots for the walkers. Medium = high so Research fits its
 * lecture (3) and tea time (2).
 */
export const tableauMax = (ambientScale: number): number => (ambientScale >= 0.75 ? 5 : 2);

/** Ground workers may stand on outside the path graph (outpost loops). */
export const WORKER_ZONES = [
  Zone.grass,
  Zone.meadow,
  Zone.forest,
  Zone.path,
  Zone.plaza,
  Zone.sandWet,
  Zone.sandDry,
  Zone.sandBlack,
  ...STREET_ZONES,
];

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
  zones: [Zone.grass, Zone.meadow, Zone.forest, Zone.path, Zone.plaza, ...STREET_ZONES],
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
  /**
   * Department accessories, culture-coloured (M19 TASK-432): every hex is a hue of that island's
   * `content/cultures/<theme>.ts` palette (walls / roofs / trims) or of its team tints.
   */
  acc: {
    headsetBand: '#2F3340',
    headsetCup: '#FF8A6A',
    // HQ captain's cap: cream crown, blue band, coral peak, gold badge
    capCrown: '#FFF4E0',
    capBand: '#5DA9E9',
    capPeak: '#E8735A',
    capBadge: '#F5C84C',
    // Coding: teal hoodie, duck-yellow headphones, clear cream-framed glasses
    hood: '#3FB8AF',
    phoneBand: '#2F3340',
    phoneCup: '#FFE45C',
    glasses: '#FAFAF5',
    cap: '#FFF4E0',
    capBrim: '#E35D6A',
    badge: '#F5C84C',
    badgeIcon: '#FFF8E8',
    stripe: '#FAFAF5',
    visor: '#2E9E74',
    safety: '#F5C84C',
    monocle: '#F5C84C',
    beret: '#D6477D',
    beretNub: '#8E2E58',
    gogStrap: '#6B4A33',
    gogRim: '#8A5A3B',
    amber: '#F5C84C',
    apron: '#8A5A3B',
    apronBelt: '#6B4A33',
    hat: '#FFD23F',
    hatRidge: '#E0A800',
    reflect: '#FFF4E0',
    capBase: '#2B2B36',
    board: '#383C4C',
    tassel: '#F5C84C',
    gown: '#666C7A',
    gownTrim: '#E0B050',
  },
  /** Carried items (CARRIED_ITEM_SLOT 7..14). None is pure white: the tint must not catch them. */
  item: {
    laptopBase: '#C4CAD8',
    laptopLid: '#383C4C',
    laptopLogo: '#7DE8F2',
    board: '#A9714A',
    paper: '#FBF3DC',
    clip: '#C4CAD8',
    ink: '#6E86B0',
    crate: '#D49A58',
    crateSlat: '#935F34',
    parcel: '#7CD6A8',
    pot: '#EFE9DC',
    paint: '#FF6FA3',
    brush: '#8A5A38',
    bag: '#5DA9E9',
    bagFlap: '#FFF4E0',
    bagClasp: '#F5C84C',
    mega: '#E35D6A',
    megaGrip: '#383C4C',
    megaRim: '#FFB347',
    pipe: '#A9AEB8',
    pipeMouth: '#C9754A',
    ember: '#FF6A3D',
    books: ['#C29A74', '#3FB8AF', '#E0B050'],
    pages: '#FBF3DC',
    // QA bug-hunt lantern (TASK-480): dark frame, green-glowing glass
    lanternFrame: '#4F4A5E',
    lanternGlow: '#7FD8B3',
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

/**
 * Creature allocation weights by island theme (M14b, TASK-379). The theme-first redesign moves
 * sheep from the farm islands to Design's meadow (none on Coding: solar gravel + lawns), keeps
 * the crab beaches where sand remains and thins cats where there is no village feel.
 * Values replace the archetype / settlement-kind weight of the same creature:
 *   sheep: × meadow cells (SHEEP.weights replacement; unlisted theme = SHEEP.otherWeight)
 *   crabs: per island (CRABS.weights replacement)
 *   cats:  per settlement on the island (CATS.weights replacement)
 * Consumers (life/land-world.ts planSheep / planCrabs / planCats) call `lifeWeight`.
 */
export const THEME_LIFE: Readonly<
  Record<
    'hq' | 'coding' | 'marketing' | 'qa' | 'design' | 'devops' | 'research',
    { sheep: number; crabs: number; cats: number }
  >
> = {
  hq: { sheep: 0.5, crabs: 4, cats: 3 },
  coding: { sheep: 0, crabs: 1, cats: 2 },
  marketing: { sheep: 0, crabs: 0, cats: 1 },
  qa: { sheep: 0, crabs: 3.5, cats: 1.5 },
  design: { sheep: 5, crabs: 1, cats: 2 },
  devops: { sheep: 0, crabs: 0, cats: 0 },
  research: { sheep: 0, crabs: 1.5, cats: 0 },
};

/**
 * Weight of a creature on a themed island. `override` is `THEMES[theme].life[kind]` (an island plan
 * may tune it); else the THEME_LIFE table. `legacy` (archetype / settlement-kind weight) is only
 * used when `theme` is unknown (pre-theme worlds, tests).
 */
export function lifeWeight(
  theme: keyof typeof THEME_LIFE | undefined,
  kind: 'sheep' | 'crabs' | 'cats',
  legacy: number,
  override?: number,
): number {
  if (override !== undefined) return override;
  return theme ? THEME_LIFE[theme][kind] : legacy;
}

/**
 * Stilt-lab reachability (TASK-379). A lot whose door node is not on a walkable component (the stilt
 * lab stands in water; `buildWalkGraph` drops water nodes) gets a deck spur: a chain of nodes from the
 * door to the nearest walkable node within `maxReach` u, feet on `deckY`. Skipped when worldgen already
 * made the door walkable, so a real walk-graph spur supersedes this.
 */
export const STILT_SPUR = {
  maxReach: 12,
  /** Node spacing along the spur (u). */
  step: 1,
  /** Deck height above the waterline (u): the hut deck rises to RAISED_FLOOR from here. */
  deckY: 0.7,
} as const;
