/** Life catalog numbers (ART_BIBLE §7 rows 3, 4, 11–14, 28). Data only. */

/**
 * Per-quality agent plan; the worst case (everything live at T3) stays <= QUALITY_PRESETS[q].agentCap
 * (low 25, medium 50, high 90; checked by tests).
 */
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
  /** Villagers: Hearthholm and each other settlement island (T2+). */
  villagers: { hearth: number; other: number };
  cats: number;
  /** Sheep on Millbrook field/meadow (T2+). */
  sheep: number;
  /** Crabs near the camera focus (T3). */
  crabs: number;
  ducks: number;
  capybaras: number;
}
export const LIFE_PLAN: Record<'low' | 'medium' | 'high', LifePlan> = {
  low: {
    sailboats: 2,
    rowboats: 1,
    parked: 0,
    flocks: 2,
    gullsPerFlock: [3, 3],
    schools: 2,
    fishPerSchool: [3, 3],
    jumpers: 1,
    dolphins: 0,
    villagers: { hearth: 3, other: 0 },
    cats: 1,
    sheep: 3,
    crabs: 2,
    ducks: 0,
    capybaras: 0,
  },
  medium: {
    sailboats: 3,
    rowboats: 4,
    parked: 2,
    flocks: 3,
    gullsPerFlock: [3, 3],
    schools: 2,
    fishPerSchool: [4, 4],
    jumpers: 2,
    dolphins: 2,
    villagers: { hearth: 6, other: 2 },
    cats: 2,
    sheep: 5,
    crabs: 3,
    ducks: 0,
    capybaras: 0,
  },
  high: {
    sailboats: 4,
    rowboats: 3,
    parked: 2,
    flocks: 3,
    gullsPerFlock: [5, 6],
    schools: 2,
    fishPerSchool: [6, 8],
    jumpers: 3,
    dolphins: 2,
    villagers: { hearth: 10, other: 2 },
    cats: 2,
    sheep: 8,
    crabs: 4,
    ducks: 5,
    capybaras: 3,
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

export const CRITTER_COLORS = {
  skin: '#F2C9A6',
  hat: '#8A5A3B',
  catBody: '#E8A86B',
  catBelly: '#FFF4E0',
  wool: '#FAFAF5',
  sheepHead: '#4A4458',
  crab: '#FF7A5C',
  crabClaw: '#FF9A7C',
  duck: '#FFE27A',
  duckBeak: '#FF9B3D',
  capybara: '#A8794E',
  yuzu: '#FFA13D',
} as const;

/** Villager shirt/hat tints (instanceColor). */
export const VILLAGER_TINTS = ['#E8735A', '#3FB8AF', '#F5C84C', '#9C8CE0'] as const;

/** ART_BIBLE §7 rows 8, 9. */
export const VILLAGERS = {
  speed: 1.3,
  /** Hop step: duration (s), height (u), squash at landing (sy), stretch in the air (sy). */
  step: 0.45,
  hop: 0.12,
  landSquash: 0.9,
  airStretch: 1.1,
  /** Stand-still looking around at plazas/stalls (s) and the yaw wobble (rad). */
  lookAround: 1.5,
  lookYaw: 0.7,
  /** Standing at a door/dock: seconds, then an idle action (wave / stretch) of `actionTime`. */
  idleEvery: [6, 12],
  actionTime: 1.4,
  /** Wave at the camera within this distance (u), at most every `waveCooldown` s. */
  waveRange: 25,
  waveCooldown: 9,
  /** Idle-action spring (row 9). */
  spring: { k: 200, c: 16 },
  /** Target mix: lots (doors), plaza hub, docks, landmarks. */
  targetWeights: { door: 5, plaza: 3, dock: 1.5, landmark: 1 },
} as const;

/** ART_BIBLE §7 row 10. */
export const CATS = {
  tailPeriod: 20,
  tailDeg: 30,
  /** Sleeping hours (game time): from dusk to dawn. */
  sleep: [19.5, 6.5],
  sleepScaleY: 0.7,
  sleepLambda: 1.2,
  /** Roof corner height as a fraction of the cottage's nominal height. */
  roofFrac: 0.55,
  /** Head-turn yaw wobble amplitude (rad) and period (s). */
  lookYaw: 0.35,
  lookPeriod: 9,
} as const;

/** ART_BIBLE §7 row 26. */
export const SHEEP = {
  graze: 8,
  hop: 0.35,
  hopHeight: 0.2,
  hopDist: [1.0, 1.8],
  squash: 0.85,
  stretch: 1.15,
  /** Wool jiggle spring. */
  jiggle: { k: 120, c: 6, kick: 3 },
  /** Max wander radius from the spawn cell (u) and min spacing between sheep (u). */
  leash: 10,
  spacing: 0.9,
  /** Head-dip amplitude while grazing (fraction of body height). */
  dip: 0.06,
} as const;

/** ART_BIBLE §7 row 15. */
export const CRABS = {
  scuttle: 3,
  distance: 1.5,
  pause: [2, 5],
  legHz: 8,
  legJitter: 0.07,
  clackHz: 6,
  clackDeg: 18,
  /** Spawn within this radius of the camera focus; relocate beyond `relocate`. */
  radius: 60,
  relocate: 80,
  /** Retry spacing (s) while no sand is near. */
  retry: 2,
  clusterRadius: 5,
} as const;

/** ART_BIBLE §7 rows 27, 29 (optional). */
export const DUCKS = {
  speed: 0.9,
  paddle: 1,
  bob: 0.25,
  pondRadius: 3,
  follow: 0.55,
  surface: 0.04,
} as const;
export const CAPYBARAS = {
  blink: 4,
  bob: 0.03,
  bobPeriod: 3.2,
  radius: 1.5,
  surface: 0.12,
} as const;

/** Pick spheres (u): centre height above the agent origin and radius, by kind name. */
export const PICK_SPHERES: Record<string, { y: number; r: number }> = {
  villager: { y: 0.5, r: 0.7 },
  cat: { y: 0.2, r: 0.5 },
  sheep: { y: 0.4, r: 0.7 },
  crab: { y: 0.1, r: 0.5 },
  duck: { y: 0.2, r: 0.5 },
  capybara: { y: 0.2, r: 0.6 },
  sailboat: { y: 1.5, r: 2 },
  rowboat: { y: 0.4, r: 1.3 },
  parked: { y: 1.5, r: 2 },
  gull: { y: 0, r: 1 },
};
export const PICK_DEFAULT = { y: 0, r: 0.8 } as const;
