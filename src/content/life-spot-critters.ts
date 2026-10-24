/**
 * Culture critters (M19, TASK-433): the animals of the story spots (`world.storySpots` kind) and the
 * Bug Zoo ladybugs. Data only; the loops live in life/critters.ts. Offsets are tuned against the
 * `D-critter-*` shots (seed 1001).
 */
import { BUTTERFLIES } from './life-critters.ts';

export type SpotSpecies = 'cat' | 'fox' | 'capybara' | 'bird' | 'owl' | 'crab' | 'duck' | 'seal';

/**
 * Idle loops (closed forms of the engine clock): sleep = loaf breathing, sit = upright cat with a
 * slow head turn, peek = kitten bobbing out of its bag, stare = fox gazing (head sways), doze =
 * capybara nodding off, peck = gull / pigeon pecking in bursts, blink = owl swivel + blink,
 * orbit = crab circling its rock, pace = crab checking a cone back and forth, dance = happy hop,
 * cross = duck family waddling across the path.
 */
export type SpotIdle =
  | 'sleep'
  | 'sit'
  | 'peek'
  | 'stare'
  | 'doze'
  | 'peck'
  | 'blink'
  | 'orbit'
  | 'pace'
  | 'dance'
  | 'cross';

/**
 * One critter of a story spot, in the spot frame (+z = the spot's rotY direction, +x = right hand).
 * `y`: 'spot' = the spot's own world y (+ dy; roofs, cabs, bowls), 'ground' = the terrain under the
 * critter (+ dy; board tops, posts).
 */
export interface SpotCritter {
  species: SpotSpecies;
  idle: SpotIdle;
  dx: number;
  dz: number;
  y: 'spot' | 'ground';
  dy?: number;
  /** Heading = spot rotY + turn. */
  turn?: number;
  /** Instance size multiplier on top of the species' own. */
  scale: number;
  /** Instance tint (white vertices of the species take it). */
  tint: string;
  /** Only alive at night (smooth across `SPOT_LIFE.night`). */
  nightOnly?: boolean;
  /** Idle parameter: orbit radius, pace / cross half-length (u). */
  reach?: number;
  /** Idle period (s), jittered per critter. */
  period?: number;
  /** Anchor to the nearest fixture of this def (within 8 u of the spot) instead of the spot itself. */
  at?: string;
  /** Offset overrides by the anchor fixture's variant (stake heights, perch shapes). */
  variants?: Readonly<Record<number, { dx?: number; dz?: number; dy?: number }>>;
}

const c = (
  species: SpotSpecies,
  idle: SpotIdle,
  scale: number,
  tint: string,
  o: Partial<SpotCritter> = {},
): SpotCritter => ({ species, idle, dx: 0, dz: 0, y: 'ground', scale, tint, ...o });

export const SPOT_CRITTERS: Readonly<Record<string, readonly SpotCritter[]>> = {
  // HQ
  catOnTimetable: [c('cat', 'sleep', 1.1, '#E89A55', { dy: 2.0 })],
  kittenInMailbag: [c('cat', 'peek', 0.7, '#F4E6CF', { dy: 0.45 })],
  // the tallest stake of the perch: v0 (0.34, 0.12) 1.5 u, v1 (0, 0) 1.4 u (prop-local x = spot dz, z = -dx)
  gullFeeding: [
    c('bird', 'peck', 0.85, '#FFFFFF', {
      at: 'gullPerch',
      variants: { 0: { dx: -0.12, dz: 0.34, dy: 1.65 }, 1: { dy: 1.55 } },
    }),
  ],
  // Coding
  // on the giant duck's head: 1.95 x (z 0.42, top y 1.44)
  gullOnDuck: [c('bird', 'peck', 1.0, '#FFFFFF', { dz: 0.82, dy: 2.95 })],
  duckCrossing: [
    c('duck', 'cross', 1.9, '#FFF4D2', { dz: 2.6, reach: 2.4, period: 16 }),
    c('duck', 'cross', 1.2, '#FFE06A', { dz: 2.6, reach: 2.4, period: 16 }),
    c('duck', 'cross', 1.2, '#FFE06A', { dz: 2.6, reach: 2.4, period: 16 }),
  ],
  // DevOps
  onsenCapybara: [c('capybara', 'doze', 1.7, '#B07A4C', { y: 'spot', dx: -0.25 })],
  craneCat: [c('cat', 'sit', 1.3, '#4A4654', { y: 'spot' })],
  pagerCrab: [c('crab', 'orbit', 1.3, '#FFFFFF', { reach: 1.2, period: 22 })],
  // Marketing
  mascotWave: [
    c('crab', 'dance', 1.6, '#FFFFFF', { dx: -1.3, dz: 1.5, period: 0.9 }),
    c('crab', 'dance', 1.6, '#FFE2C8', { dx: 1.3, dz: 1.5, period: 0.9 }),
  ],
  popcornGulls: [
    c('bird', 'peck', 0.8, '#FFFFFF', { dx: 1.5, dz: 1.3 }),
    c('bird', 'peck', 0.8, '#F2F2F2', { dx: 2.2, dz: 0.4 }),
    c('bird', 'peck', 0.8, '#FFFFFF', { dx: 0.8, dz: 2.1 }),
  ],
  // QA
  // the spot's own y is the top of the pyramid
  gullOnCones: [c('bird', 'peck', 0.8, '#FFFFFF', { y: 'spot', dy: 0.15 })],
  crabInspection: [c('crab', 'pace', 1.4, '#FFFFFF', { dz: 0.9, reach: 1.3, period: 14 })],
  // Design
  annealerCat: [c('cat', 'sleep', 1.0, '#C9A07A', { y: 'spot' })],
  foxOrb: [c('fox', 'stare', 1.5, '#F07F32')],
  secondsGull: [c('bird', 'peck', 0.7, '#FFFFFF', { y: 'spot', dy: 0.35 })],
  // Research
  // on the box roof ridge (2.63 u)
  owlNight: [c('owl', 'blink', 1.0, '#A47D55', { dy: 2.62, nightOnly: true })],
  // on the perch's canopy knob (v0, 1.75 u) / the pillar's rim (v1, 1.0 u)
  pigeonStatue: [
    c('bird', 'peck', 0.7, '#A9AFC0', {
      at: 'pigeonPerch',
      variants: { 0: { dy: 1.9 }, 1: { dy: 1.15 } },
    }),
  ],
  // M22 R3-16 / R18: the seal dozing on the pier end (the spot's own y is the deck), a slow nod
  sealPier: [c('seal', 'doze', 1.5, '#9AA3AE', { y: 'spot', period: 11 })],
};

export const SPOT_LIFE = {
  /** Alive from this zoom tier, and only within `fade` u of the camera (shrinks to 0 across it). */
  minTier: 2,
  fade: [200, 240] as const,
  /** Night window: owls are out above `night[1]`, gone below `night[0]`. */
  night: [0.45, 0.65] as const,
  /** Per-species base size of the model. */
  size: {
    cat: 1.65,
    fox: 1,
    capybara: 1,
    bird: 1.4,
    owl: 1,
    crab: 1.4,
    duck: 1,
    seal: 1,
  } as Record<SpotSpecies, number>,
  /** Loaf sleep: squash, breathing period (s) and amplitude. */
  sleep: { squash: 0.64, breath: [3.4, 0.035] as const },
  /** Sitting cat: head-turn period (s), amplitude (rad) and rear-up pitch (rad). */
  sit: { turn: [9, 0.35] as const, pitch: 0.12 },
  /** Kitten peek: period (s) and rise (u). */
  peek: { period: 4.2, rise: 0.14 },
  /** Fox gaze: head sway period (s), yaw amplitude (rad) and head dip (0..1). */
  stare: { period: 6.5, yaw: 0.12, dip: 0.25 },
  /** Capybara doze: nod period (s), depth (0..1). */
  doze: { period: 7.5, depth: 0.55 },
  /** Bird peck: period (s) and the share of it spent pecking (two dips). */
  peck: { period: 3.6, share: 0.4 },
  /** Owl: head swivel [period s, amplitude rad] and blink [period s, length s]. */
  owl: { swivel: [11, 0.7] as const, blink: [4, 0.16] as const },
  /** Crab leg-tick rate (rad/s) and the pause share at each end of a pace. */
  crab: { tick: 50, pause: 0.22 },
  /** Dance: hop height (u) and landing squash. */
  dance: { hop: 0.22, squash: 0.85 },
  /** Duck cross: waddle roll (rad), rate (Hz), pause share at the ends, lag of each follower (fraction of a trip). */
  cross: { roll: 0.14, hz: 2.6, pause: 0.22, lag: 0.07 },
  /** Period jitter (fraction). */
  jitter: 0.15,
  colors: {
    capyBelly: '#C9A070',
    capyDark: '#5A3E2A',
    hat: '#FFD23C',
    hatBand: '#E8735A',
    foxCream: '#FFF1DC',
    foxDark: '#3E2A22',
    birdWing: '#9AA3B5',
    birdTip: '#3A3F4F',
    owlCream: '#F2E4C8',
    owlWing: '#6E4F34',
    owlEye: '#FFD84A',
    sealBelly: '#DDE1E8',
    sealDark: '#3A3F4D',
  },
} as const;

/** Ladybugs near the QA Bug Zoo terrariums: the butterfly model, red, low and small. */
export const LADYBUGS = {
  ...BUTTERFLIES,
  size: 1.1,
  extentX: [3.2, 4.4] as const,
  extentZ: [2.6, 3.6] as const,
  period: [5, 8] as const,
  height: [0.8, 1.7] as const,
  drift: [0.3, 23] as const,
  bob: 0.06,
  flapHz: [5, 6.5] as const,
  tints: ['#E8412E', '#F0583C', '#D93A2B'] as const,
  bank: 0.45,
  /** Total ladybugs = this × the plan's butterflies. */
  share: 0.5,
  /** Fixture def of the Bug Zoo and the island theme that hosts it. */
  zooDef: 'terrarium',
  theme: 'qa',
} as const;
