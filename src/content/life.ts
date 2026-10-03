/** Life catalog numbers (ART_BIBLE §7 rows 3, 4, 11–14, 28). Data only. */

/** Per-quality agent plan; totals stay ≤ QUALITY_PRESETS[q].agentCap (fish/dolphins only live at T3/T1+). */
export interface LifePlan {
  sailboats: number;
  rowboats: number;
  flocks: number;
  gullsPerFlock: [number, number];
  schools: number;
  fishPerSchool: [number, number];
  jumpers: number;
  dolphins: number;
}
export const LIFE_PLAN: Record<'low' | 'medium' | 'high', LifePlan> = {
  low: {
    sailboats: 2,
    rowboats: 2,
    flocks: 2,
    gullsPerFlock: [4, 5],
    schools: 2,
    fishPerSchool: [4, 5],
    jumpers: 1,
    dolphins: 0,
  },
  medium: {
    sailboats: 3,
    rowboats: 2,
    flocks: 3,
    gullsPerFlock: [5, 6],
    schools: 2,
    fishPerSchool: [6, 8],
    jumpers: 2,
    dolphins: 2,
  },
  high: {
    sailboats: 4,
    rowboats: 3,
    flocks: 3,
    gullsPerFlock: [5, 8],
    schools: 2,
    fishPerSchool: [6, 10],
    jumpers: 3,
    dolphins: 2,
  },
};

/** Sim LOD: beyond `farDistance` u from the camera an agent updates every `farEvery`-th fixed step. */
export const SIM_LOD = { farDistance: 400, farEvery: 6 } as const;

export const SAILBOAT = {
  speed: 3,
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
  land: { speed: 9, minTime: 3, maxTime: 14, sit: [4, 8], takeoff: 2.5, perchY: 1.2, pulse: 1.08 },
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
