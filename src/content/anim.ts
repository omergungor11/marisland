/** Animation catalog numbers (ART_BIBLE §6–§7). Data only. */
export const SWELL = { amplitude: 0.15, period: 7 } as const;
export const SHORE_LAP = { period: 4.5, advance: 0.8, wetLag: 0.6 } as const;
export const GUST = { speed: 6, wavelength: 40, strength: 1 } as const;
export const TREE_SWAY = { idlePeriod: 4, idleDeg: 2, gustDeg: 6, squash: 0.03 } as const;
export const PALM_SWAY = { period: 5, trunkDeg: 4, frondDeg: 10, frondLag: 0.3 } as const;
export const GRASS_SWAY = { period: 2.5, deg: 8 } as const;
/** Bloom-in spring (D-008: c=17 gives the bible's 8 % overshoot / 300 ms). */
export const BLOOM_IN = {
  k: 180,
  c: 17,
  staggerMs: 220,
  maxPerFrame: 40,
  ditherMs: 250,
  outMs: 140,
  outDitherMs: 200,
} as const;
export const CLICK_SQUASH = { k: 300, c: 14, squash: 0.85, stretch: 1.15 } as const;
export const BOAT_BOB = { period: 3.2, y: 0.12, rollDeg: 6, pitchDeg: 3, rollLag: 0.8 } as const;
export const CLOUDS = {
  count: [6, 10],
  altitude: [60, 90],
  width: [22, 44],
  drift: 1.5,
  shadowMul: 0.82,
  shadowBlur: 6,
  /** Periodic cloud field (TASK-153): `cells`² jittered candidate cells per `tile` u square,
   *  centred on the archipelago → every tile-sized window holds exactly `count` clouds. */
  tile: 720,
  cells: 4,
  /** Cell jitter range (fraction of a cell) — keeps neighbours ≥ 0.4 cell apart. */
  jitter: [0.2, 0.8],
  /** Footprint ellipse depth / length (geometry is normalised to this). */
  aspect: 0.55,
  /** Shadow ellipse half-length as a fraction of half the cloud width. */
  shadowFit: 0.92,
  /** Edge-wobble amplitude of the shadow outline, u (2 octaves of value noise). */
  wobble: 3,
  /** Clouds scale to 0 within this distance of the tile edge (wrap point). */
  edgeFade: 70,
  /** Sun elevation clamp for the projected shadow offset (sin of elevation). */
  minSunY: 0.3,
  /** Cloud shadows per quality (≈ 4 hashes per active cell per terrain/water/prop fragment). */
  shadowOn: { low: true, medium: true, high: true },
  /** Breathing: scale ±amp over period s. */
  breathe: { amp: 0.025, period: 9 },
  /** Fade to 0 when the zoom tier reaches `hideTier`, over `fade` s. */
  hideTier: 2,
  fade: 0.5,
} as const;
/** Smoke and steam puffs (ART_BIBLE §7 #20/#21; stateless GPU, ARCHITECTURE §5). Sizes are diameters, u. */
export const PUFFS = {
  chimney: { spawn: 1.2, slots: 3, size: [0.2, 0.9], rise: 4, drift: 2, jitter: 0.15 },
  steam: { spawn: 0.6, slots: 24, size: [1.6, 8], rise: 24, drift: 24, jitter: 1.0 },
  spring: { spawn: 0.8, slots: 5, size: [0.6, 2.4], rise: 5, drift: 1.5, jitter: 0.4 },
  /** Office roof vents (DevOps / server sheds, TASK-304): small soft steam, no burp. */
  vent: { spawn: 0.7, slots: 4, size: [0.25, 1.1], rise: 3.5, drift: 1.5, jitter: 0.12 },
  /** Ring-puff burp on steam emitters every `period` s. */
  burp: { period: 40, ring: 7, life: 3.5, radius: 7, rise: 6, size: [3, 6.5], pulse: 1.5 },
  /** Fraction of a puff's life spent fading (dither) at the end. */
  fadeLast: 0.4,
  /**
   * Soft steam (D5; volcano steam, hot spring, burp ring — chimney smoke stays a small solid puff):
   * radial alpha from the view-facing term (`edge` = facing at which a puff reaches full opacity),
   * opacity over the puff's life `opacity[0] → opacity[1]` (lighter, see-through at the top),
   * turbulence ± u (grows with age) at `turbFreq` Hz; at night the young (low) volcano steam is
   * tinted by the crater glow (`nightGlow` × lava colour).
   */
  soft: {
    edge: 1.0,
    opacity: [0.62, 0.1] as const,
    turbulence: 2.2,
    turbFreq: 0.23,
    nightGlow: 0.35,
  },
  capacity: { low: 240, medium: 600, high: 900 },
} as const;
export const WINDMILL = { secondsPerRev: 6 } as const;
export const BEACON = {
  secondsPerRev: 8,
  coneLength: 40,
  opacity: 0.35,
  onHours: [18.5, 6.5],
} as const;
export const WINDOWS = {
  onFrom: 18.75,
  onTo: 19.5,
  offAt: 23,
  offFraction: 0.3,
  flicker: [0.2, 0.5],
  flickerAmp: 0.08,
} as const;
export const FIREFLIES = { from: 19.5, to: 4, blink: [1.5, 3], drift: 0.5 } as const;

// ---- Interaction (TASK-162): picking, hover, click reactions, reduced motion ---------------------

/** Pick proxies are derived from each prop's geometry bounds; these tune the fit (u). */
export const PICK = {
  /** Spatial-hash cell for prop proxies. */
  cell: 8,
  /** Proxy cylinder radius = sqrt(sizeX · sizeZ) / 2 × this (bounds overstate round shapes). */
  radiusFit: 0.9,
  minRadius: 0.3,
  /** Proxy height = bounds top × this. */
  heightFit: 1,
  /** Ground cover, underwater and cluster-proxy defs are not clickable. */
  skipDefs: [
    'treeBlob',
    'tidePool',
    'sunkenShip',
    'cropRow',
    'reeds',
    'lilyPad',
    'grassTuft',
    'flower',
  ],
  /** Per-def override `[radius, height]` (u, before instance scale) where bounds mislead. */
  proxy: {} as Record<string, readonly [number, number]>,
  /** Agent kinds that can be picked (fish schools scatter from the cursor instead) and their
   *  sphere overrides — `[radius, height of the centre]`; land kinds ship their own. */
  agents: {
    villagers: null,
    cats: null,
    sheep: null,
    crabs: null,
    sailboats: [1.7, 1.1],
    rowboats: [1.0, 0.3],
    parked: [1.7, 1.1],
    gulls: [0.8, 0.1],
  } as Record<string, readonly [number, number] | null>,
  /** Ray-march: step = clamp(t × stepRel, stepMin, stepMax); bisect iterations on the hit. */
  march: { stepRel: 0.012, stepMin: 0.4, stepMax: 3, bisect: 14 },
  /** Hover re-pick rate, Hz. */
  hoverHz: 10,
} as const;

/** Hover tint (additive, linear) and the reduced-motion click flash. */
export const HOVER = { color: '#FFE9B0', strength: 0.22, flash: 0.5, flashMs: 300 } as const;

export type ReactionMotion = 'squash' | 'hop' | 'spin' | 'wobble' | 'emote';
export type BurstGlyph = 'puff' | 'heart' | 'sparkle' | 'leaf' | 'bang';
/** ring: radial outward; rise: float up; fall: drift down from the top; pop: small scatter. */
export type BurstPattern = 'ring' | 'rise' | 'fall' | 'pop';

export interface BurstSpec {
  glyph: BurstGlyph;
  count: number;
  pattern: BurstPattern;
  /** Hex colours, picked per particle. */
  colors: readonly string[];
  /** Particle size [min, max], u. */
  size: readonly [number, number];
  /** Life [min, max], s. */
  life: readonly [number, number];
  /** Initial speed [min, max], u/s (ring: outward, rise: upward, fall: sideways drift). */
  speed: readonly [number, number];
  /** Spawn height: 'base' / 'mid' / 'top' of the target's proxy. */
  from: 'base' | 'mid' | 'top';
  /** Seconds before the burst starts. */
  delay?: number;
}

export interface ReactionSpec {
  motion: ReactionMotion;
  /** Spring override (defaults to REACTION.spring). */
  k?: number;
  c?: number;
  /** squash: depth of the squash 0..1, stretch gain on the rebound, and the kick velocity. */
  squash?: number;
  stretch?: number;
  kick?: number;
  /** hop / emote / spin: arc height (u, before instance scale), duration of one arc (s), hop count. */
  height?: number;
  duration?: number;
  count?: number;
  /** wobble / emote: peak tilt / yaw wiggle, deg. */
  deg?: number;
  /** spin: full turns. */
  turns?: number;
  bursts: readonly BurstSpec[];
}

/** Reactions are springs; k = 180, c = 17 is the bible's 8 % overshoot / 300 ms (D-008). */
export const REACTION = {
  spring: { k: 180, c: 17 },
  /** Hard stop for any reaction, s. */
  maxSeconds: 3.2,
  /** Squash anticipation: ease down into the squash over this long before the release, s. */
  squashDown: 0.09,
  /** Concurrent reactions (a re-click on the same instance restarts, never stacks). */
  maxActive: 24,
} as const;

/** Every click opens with a ring of 6 sparkles (ART_BIBLE §7 click reactions). */
export const CLICK_SPARKLE: BurstSpec = {
  glyph: 'sparkle',
  count: 6,
  pattern: 'ring',
  colors: ['#FFF6C2'],
  size: [0.22, 0.3],
  life: [0.45, 0.6],
  speed: [1.4, 1.9],
  from: 'mid',
};

const HEART = ['#FF8FA3', '#FFB3C1'] as const;
const LEAF = ['#D4EA7A', '#F2E27A', '#B5E48C'] as const;

export const REACTION_PRESETS: Record<string, ReactionSpec> = {
  /** Trees: shake ~0.6 s, a few leaves drift down. */
  tree: {
    motion: 'wobble',
    k: 220,
    c: 7,
    deg: 9,
    bursts: [
      {
        glyph: 'leaf',
        count: 4,
        pattern: 'fall',
        colors: LEAF,
        size: [0.32, 0.45],
        life: [1.1, 1.5],
        speed: [0.3, 0.8],
        from: 'top',
      },
    ],
  },
  /** Houses: squash + a heart-shaped puff off the roof. */
  house: {
    motion: 'squash',
    squash: 0.15,
    stretch: 0.08,
    kick: -34,
    bursts: [
      {
        glyph: 'heart',
        count: 1,
        pattern: 'rise',
        colors: HEART,
        size: [0.55, 0.65],
        life: [1.3, 1.5],
        speed: [1.1, 1.3],
        from: 'top',
        delay: 0.12,
      },
      {
        glyph: 'puff',
        count: 3,
        pattern: 'rise',
        colors: ['#FFFFFF', '#F4F1EA'],
        size: [0.3, 0.45],
        life: [0.9, 1.3],
        speed: [0.8, 1.2],
        from: 'top',
        delay: 0.05,
      },
    ],
  },
  /** Sheep: double hop + hearts. */
  sheep: {
    motion: 'hop',
    height: 0.35,
    duration: 0.32,
    count: 2,
    bursts: [
      {
        glyph: 'heart',
        count: 2,
        pattern: 'rise',
        colors: HEART,
        size: [0.3, 0.4],
        life: [1, 1.3],
        speed: [0.9, 1.3],
        from: 'top',
        delay: 0.1,
      },
    ],
  },
  /** Villager / cat: a happy wiggle and a "!" bubble. */
  villager: {
    motion: 'emote',
    height: 0.3,
    duration: 0.34,
    deg: 14,
    bursts: [
      {
        glyph: 'bang',
        count: 1,
        pattern: 'rise',
        colors: ['#FFD166'],
        size: [0.5, 0.55],
        life: [1.1, 1.3],
        speed: [0.5, 0.6],
        from: 'top',
      },
    ],
  },
  /** Crab: spin a full turn. */
  crab: { motion: 'spin', turns: 1, height: 0.12, duration: 0.45, bursts: [] },
  /** Boats rock 15° on the bible's soft spring (k=60, c=3). */
  boat: { motion: 'wobble', k: 60, c: 3, deg: 15, bursts: [] },
  /** Rocks: a heavy squash. */
  rock: { motion: 'squash', squash: 0.1, stretch: 0.02, kick: -20, bursts: [] },
  /** Everything else: the bible's baseline squash 0.85 → 1.15 and the sparkle ring. */
  generic: { motion: 'squash', squash: 0.15, stretch: 0.12, kick: -40, bursts: [] },
};

/** Prop def id → preset (anything unlisted uses `generic`). */
export const PROP_REACTIONS: Record<string, string> = {
  palm: 'tree',
  roundTree: 'tree',
  pine: 'tree',
  giantMushroom: 'tree',
  bush: 'tree',
  giantTree: 'tree',
  cottage: 'house',
  stiltHut: 'house',
  towerHouse: 'house',
  barn: 'house',
  logCabin: 'house',
  marketStall: 'house',
  clocktower: 'house',
  windmill: 'house',
  lighthouse: 'house',
  rowboat: 'boat',
  sailboat: 'boat',
  buoy: 'boat',
  rockCluster: 'rock',
  seaStack: 'rock',
  volcanoCrater: 'rock',
  steppingStone: 'rock',
};

/** Agent kind (LifeSystem.kinds key) → preset. */
export const AGENT_REACTIONS: Record<string, string> = {
  villagers: 'villager',
  cats: 'villager',
  sheep: 'sheep',
  crabs: 'crab',
  sailboats: 'boat',
  rowboats: 'boat',
  parked: 'boat',
  gulls: 'sheep',
};

/** Burst particle system (one instanced-quad draw call; positions are f(uTime), deterministic). */
export const BURSTS = {
  capacity: { low: 96, medium: 160, high: 256 },
  gravity: 1.6,
  /** Quads never shrink below this fraction of the camera distance (readable at any zoom). */
  minScreenFrac: 0.012,
  /** Fraction of life spent shrinking out. */
  outFrac: 0.3,
  /** Particles stop this far above the ground they spawned over, u. */
  floorLift: 0.06,
} as const;
