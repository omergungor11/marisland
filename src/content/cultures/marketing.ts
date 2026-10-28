/**
 * Karnaval Yayıncıları (Carnival Broadcasters). Kit ledger (TASK-413): 10 new defs, 9/10 tier >= 2,
 * one tier-1 (mascotStatue), no tier-0, ORDERED BY PRIORITY (most identity-defining first; if the
 * budget gate drops the per-island cap to 6, cut from the end). Geometry:
 * geo/themes/culture-marketing.ts. prizeBooth is its own def (not a fairBooth variant, which would
 * shift existing settlements' rolls). Rhythm and relay by waves 2-3.
 * Placement (TASK-423): `MARKETING_CULTURE_SITES` below, read by world/gen/plans/marketing.ts.
 */
import { PropFlag } from '../../world/prop-store.ts';
import type { CultureDef } from './types.ts';

const { grounded, windy, noShadow } = PropFlag;

export const MARKETING_CULTURE: CultureDef = {
  theme: 'marketing',
  id: 'carnivalBroadcasters',
  name: 'Karnaval Yayıncıları',
  nameEn: 'Carnival Broadcasters',
  palette: {
    accent: '#E35D6A',
    roofs: ['#E35D6A', '#FAFAF5'],
    walls: ['#FFF4E0'],
    trims: ['#FFB347', '#A9AEB8'],
  },
  pennant: { cut: 'streamer', accent: '#E35D6A' },
  kit: [
    { id: 'mascotStatue', tier: 1, flags: grounded },
    { id: 'marqueeSign', tier: 2, flags: grounded },
    { id: 'popcornCart', tier: 2, flags: grounded | windy },
    { id: 'balloonMast', tier: 2, flags: grounded | windy },
    { id: 'confettiCannon', tier: 2, flags: grounded | windy },
    { id: 'searchlightPair', tier: 2, flags: grounded },
    { id: 'prizeBooth', tier: 2, flags: grounded },
    { id: 'selfieSpot', tier: 2, flags: grounded },
    { id: 'posterRoll', tier: 3, flags: grounded | noShadow },
    { id: 'megaphoneStand', tier: 3, flags: grounded | noShadow },
    // M27 TASK-517 (D-096): the dive tower on the third sea stack
    { id: 'diveTower', tier: 2, flags: grounded | windy },
  ],
  // emitted by world/gen/plans/marketing.ts (TASK-423); `defs` = the props the scene stands on
  storySpots: [
    { kind: 'mascotWave', defs: ['mascotStatue'] },
    { kind: 'popcornGulls', defs: ['popcornCart'] },
    { kind: 'lighthouseSelfie', defs: ['selfieSpot', 'lighthouse'] },
    { kind: 'wheelNap', defs: ['ferrisWheel'] },
    { kind: 'snaggedBalloon', defs: ['antennaTower'] },
    { kind: 'giftDuck', defs: ['prizeBooth'] },
    { kind: 'posterCrew', defs: ['billboardV2', 'posterRoll'] },
    /** The Golden Hour Launch Show's mast: the sky task launches a balloon from here. */
    { kind: 'balloonLaunch', defs: ['balloonMast'] },
  ],
  rhythm: [],
  relay: { order: 5, id: 'goldenHourShow' },
};

/**
 * Carnival placement (TASK-423, world/gen/plans/marketing.ts). Lengths in u. `rect` footprints are
 * local x (width) × local z (depth, the facing); the other defs block their FIXTURE_RADIUS disc
 * (content/settlements.ts). Variants are pinned here, never rolled.
 */
export const MARKETING_CULTURE_SITES = {
  rect: {
    marqueeSign: [2.5, 0.6],
    popcornCart: [2.0, 2.1],
    confettiCannon: [1.1, 2.6],
    searchlightPair: [3.3, 1.0],
    prizeBooth: [2.6, 2.0],
    selfieSpot: [2.6, 2.7],
  },
  /** Marquee variants: 0 SHOW (fair entrance), 1 LIVE (by the giant screen), 2 NEW (street start). */
  marquee: { show: 0, live: 1, fresh: 2 },
  /**
   * Fair entrance (toward the landing pier): the mascot and the SHOW sign flank the way in (on
   * opposite sides), from `out` u beyond the paving rim toward the pier, up to `search` u farther
   * off the way than its `keep` u clearance.
   */
  entrance: { mascotOut: 1.5, signOut: 0.5, keep: 1.8, search: 4, step: 0.75 },
  /** No room at the entrance: the mascot on the fair shelf this far off the rim (nearest the way). */
  mascotRing: [1, 12] as const,
  /** Confetti cannons at the stage front corners (v1 mid-blast on one side), splayed outward. */
  confetti: {
    side: 0.8,
    back: 0.6,
    splay: 0.35,
    blastSide: -1,
    /** Candidate offsets from the corner spot: along the stage axis (+ = forward), outward. */
    along: [0, 0.8, -0.8, 1.6, 2.4, 3.2] as const,
    out: [0, 0.6, 1.2, -0.6, -1.4] as const,
  },
  /** Searchlight pair behind the stage (else beside it). */
  searchlight: { back: 1.0, variant: 0 },
  /** Popcorn carts on / just off the fair paving (radii off the rim), facing the centre. */
  popcorn: { count: [1, 2] as const, radii: [-1.3, 1.1, 2.2] as const, angles: 16 },
  /** Prize booths outside the rim; the first is the giant plush duck (v1, story `giftDuck`). */
  prize: { count: [1, 2] as const, radii: [1.3, 2.3, 3.3, 4.5, 6, 7.5] as const, angles: 16 },
  /**
   * Balloon masts round the fair edge, spread away from the stage and each other: the first is the
   * launch mast (v0, its mooring empty: story `balloonLaunch`), the others carry a bunch (v1).
   */
  masts: { count: [2, 3] as const, ring: [2.4, 10.4] as const, angles: 24, gap: 1.0 },
  /**
   * When the fair's rings are full: any spot this far from the fair centre (past the paving), on
   * the shelf or else on land with at most `fallbackRelief` u relief (levelled by its pad).
   */
  fallback: { searchlight: 10, popcorn: 6, prize: 12, masts: 14, gap: 0.4 },
  fallbackRelief: 0.8,
  /** Every piece: the footprint grown by `grow` u has at most `relief` u relief before its pad. */
  level: { grow: 1, relief: 1.4 },
  /** Marquee signs at the Ad Boulevard's edge (`edge` u past the street half-width). */
  boulevard: { edge: 0.65 },
  /** Print shop: poster rolls at its front corners / sides (v0 basket, v1 stack, v2 boards). */
  posters: { front: 0.75, inset: 0.45, side: 0.8 },
  /** The poster crew's leaning boards beside the first boulevard billboard. */
  crewBoards: 0.7,
  /** Megaphone stands at media office fronts (up to `max`). */
  megaphones: { max: 2, front: 0.8, inset: 0.6 },
  /**
   * Selfie deck on the summit near the Broadcast Tower (ring radii round it), its back to the sea
   * (the closer to the edge the better); else on the upper ledge's rim; else anywhere on the summit.
   */
  selfie: { ring: [5, 12] as const, angles: 24, maxShore: 7, ledgeSearch: 14, summitSearch: 22 },
} as const;
