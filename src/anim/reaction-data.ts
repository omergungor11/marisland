/**
 * Click-reaction catalog (ART_BIBLE §7 "Click reactions", cute-motion skill). Pure data: the
 * interact layer evaluates it. Every click starts with the shared squash then a ring of sparkles;
 * the specs below add the per-target motion and extras.
 */

export const SQUASH = { depth: 0.85, wide: 1.15, down: 0.11, k: 300, c: 14 } as const;
export const SPARKLES = {
  count: 6,
  color: '#FFF6C2',
  radius: 0.9,
  size: 0.2,
  life: 0.5,
  rise: 0.35,
  /** Pool size in bursts (6 quads each). */
  bursts: 8,
} as const;
export const COOLDOWN_S = 0.6;
/** Clicks closer than this on the same target escalate; the 3rd triggers `special`. */
export const STREAK_WINDOW_S = 2.5;
export const STREAK_SPECIAL = 3;
export const HOVER = { scale: 1.04, lambda: 14 } as const;
export const REDUCED = { duration: 0.3, scale: 1.02, tint: 0.3 } as const;
export const LEAF_COLORS = ['#7FD8B3', '#6CC04A', '#B8E26B', '#F5C84C'] as const;
export const FX_COLORS = {
  heart: '#FF8FB1',
  apple: '#E35D6A',
  sand: '#E9D8A6',
  bubble: '#FFFFFF',
  bubbleInk: '#E8735A',
} as const;

export type Extra = 'leaves' | 'puff' | 'apple' | 'ring' | 'sandPuff' | 'fishJump' | 'doublePuff';
export type Emote = 'exclaim';

export interface ReactionSpec {
  squash: boolean;
  hop?: { height: number; dur: number; count: number };
  spin?: { turns: number; dur: number };
  /** Roll wobble (degrees) released from `deg` on a spring toward 0. */
  wobble?: { deg: number; k: number; c: number; dur: number };
  /** Scale y goes to `to`, stays `stay` s, then springs back (crab burying). */
  sink?: { to: number; down: number; stay: number };
  emote?: Emote;
  extras: readonly Extra[];
  /** Id for effects only the app can render (camera shake, bird burst, lamp flash, toot…). */
  effect?: string;
  /** Seconds an agent's behaviour is frozen so the overlay plays undisturbed. */
  hold: number;
  /** Merged over the spec on the 3rd click in a row. */
  special?: Partial<Omit<ReactionSpec, 'special'>>;
}

const base: ReactionSpec = { squash: true, extras: [], hold: 0 };

export const DEFAULT_SPEC: ReactionSpec = base;

/** Prop families by `PROP_GEO` id. */
export const GEO_FAMILY: Record<string, string> = {
  palm: 'tree',
  roundTree: 'tree',
  pine: 'tree',
  giantTree: 'tree',
  giantMushroom: 'tree',
  bush: 'bush',
  cottage: 'house',
  towerHouse: 'house',
  logCabin: 'house',
  stiltHut: 'house',
  barn: 'house',
  windmill: 'windmill',
  lighthouse: 'lighthouse',
  clocktower: 'clocktower',
  volcanoCrater: 'volcano',
  rowboat: 'boat',
  sailboat: 'boat',
};

export const PROP_REACTIONS: Record<string, ReactionSpec> = {
  tree: {
    squash: true,
    wobble: { deg: 5, k: 160, c: 5, dur: 0.6 },
    extras: ['leaves'],
    effect: 'treeShake',
    hold: 0,
    special: { extras: ['leaves', 'apple'] },
  },
  bush: { squash: true, wobble: { deg: 4, k: 160, c: 5, dur: 0.5 }, extras: ['leaves'], hold: 0 },
  house: {
    squash: true,
    extras: ['puff'],
    effect: 'doorPeek',
    hold: 0,
    special: { extras: ['doublePuff'], hop: { height: 0.15, dur: 0.35, count: 2 } },
  },
  windmill: { squash: true, extras: [], effect: 'windmillSpin', hold: 0 },
  lighthouse: { squash: true, extras: [], effect: 'lampFlash', hold: 0 },
  clocktower: { squash: true, extras: [], effect: 'chime', hold: 0 },
  volcano: { squash: true, extras: [], effect: 'volcanoBurp', hold: 0 },
};

/** Agent reactions by `AgentKind.name`. */
export const AGENT_REACTIONS: Record<string, ReactionSpec> = {
  villager: {
    squash: true,
    hop: { height: 0.5, dur: 0.5, count: 1 },
    emote: 'exclaim',
    extras: [],
    effect: 'villagerWave',
    hold: 1.4,
    special: { hop: { height: 0.5, dur: 0.45, count: 2 } },
  },
  cat: {
    squash: true,
    hop: { height: 0.25, dur: 0.35, count: 1 },
    extras: [],
    hold: 0.8,
    special: { spin: { turns: 1, dur: 0.6 } },
  },
  sheep: {
    squash: true,
    hop: { height: 0.3, dur: 0.35, count: 2 },
    extras: [],
    effect: 'baa',
    hold: 1.2,
    special: { hop: { height: 0.3, dur: 0.3, count: 3 } },
  },
  crab: {
    squash: false,
    sink: { to: 0.1, down: 0.18, stay: 4 },
    extras: ['sandPuff'],
    hold: 4.6,
    special: {
      sink: { to: 0.1, down: 0.18, stay: 6 },
      extras: ['sandPuff', 'doublePuff'],
      hold: 6.6,
    },
  },
  sailboat: {
    squash: false,
    wobble: { deg: 15, k: 60, c: 3, dur: 2.4 },
    extras: ['ring'],
    effect: 'toot',
    hold: 0,
    special: { spin: { turns: 1, dur: 0.9 }, effect: 'honk' },
  },
  rowboat: {
    squash: false,
    wobble: { deg: 15, k: 60, c: 3, dur: 2.4 },
    extras: ['ring'],
    effect: 'toot',
    hold: 0,
    special: { spin: { turns: 1, dur: 0.9 }, effect: 'honk' },
  },
  parked: {
    squash: false,
    wobble: { deg: 15, k: 60, c: 3, dur: 2.4 },
    extras: ['ring'],
    effect: 'toot',
    hold: 0,
    special: { spin: { turns: 1, dur: 0.9 }, effect: 'honk' },
  },
  gull: { squash: true, extras: [], effect: 'birdTakeoff', hold: 0 },
  duck: { squash: true, hop: { height: 0.15, dur: 0.3, count: 1 }, extras: [], hold: 0.6 },
  capybara: { squash: true, extras: [], hold: 0.5 },
};

export function mergeSpec(spec: ReactionSpec, streak: number): ReactionSpec {
  if (streak < STREAK_SPECIAL || !spec.special) return spec;
  const sp = spec.special;
  return {
    ...spec,
    ...sp,
    extras: [...spec.extras, ...(sp.extras ?? []).filter((e) => !spec.extras.includes(e))],
  };
}

/** Total seconds a reaction runs (squash settle included). */
export function specDuration(s: ReactionSpec): number {
  let d = s.squash ? 0.11 + 0.55 : 0.2;
  if (s.hop) d = Math.max(d, 0.11 + s.hop.dur * s.hop.count + 0.1 * (s.hop.count - 1) + 0.35);
  if (s.spin) d = Math.max(d, 0.11 + s.spin.dur + 0.2);
  if (s.wobble) d = Math.max(d, s.wobble.dur + 0.3, 1.6);
  if (s.sink) d = Math.max(d, s.sink.down + s.sink.stay + 0.8);
  return d;
}
