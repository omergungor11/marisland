/** Marketing (Beacon Rock, sea stack) — M14b plan §2.4. */
import { FOLIAGE } from '../palette.ts';
import { PLACEMENT_RULES } from '../placement.ts';
import { Zone } from '../../world/types.ts';
import type { ThemeDef } from './index.ts';

/** Brand lawn: grass and meadow alike, magenta / coral flower speckle. */
const BRAND_LAWN = {
  material: 'meadow',
  base: '#9BD66A',
  layer: { speckle: ['#E0457B', '#FF7F6B'] },
} as const;

export const MARKETING_THEME: ThemeDef = {
  id: 'marketing',
  displayName: 'Marketing',
  short: 'MKT',
  icon: 'megaphone',
  accent: '#E35D6A',
  teamTints: ['#E35D6A', '#EE8790', '#C9465A'],
  lotMix: [
    ['broadcastStudio', 2],
    ['billboard', 1],
  ],
  crown: null,
  defSwap: {},
  landmarkVariant: { lighthouse: 2 },
  decor: [
    ['flowerBed', 2],
    ['bannerPole', 1],
    ['bench', 1],
  ],
  pathLanterns: 0.4,
  plazaDecor: { posts: 'lanternPost', seats: 'bannerPole', across: 'bunting' },
  workers: { weight: 0.7, cap: 5, deskShare: 0.5 },
  accessory: 2,
  ground: {
    [Zone.grass]: BRAND_LAWN,
    [Zone.meadow]: BRAND_LAWN,
    [Zone.rock]: { material: 'rock', base: '#D9B48F' },
    [Zone.cliff]: { material: 'rock', base: '#C29A74' },
    // red-painted stair decking
    [Zone.path]: {
      material: 'paving',
      base: '#C9675E',
      layer: { layers: ['tiles'], tile: { size: 0.7, grout: '#8E4A44' } },
    },
    [Zone.plaza]: {
      material: 'paving',
      base: '#E9D3B3',
      layer: { tile: { size: 1.4, grout: '#C9AE88' } },
    },
  },
  // the stack top is lawn, not bare rock (the archetype makes everything above 30 % of the peak
  // rock); steep faces stay rock / cliff by slope
  zoneRules: { rockAboveFrac: 2, meadowThreshold: 0.15 },
  patchwork: 'off',
  // the Broadcast Tower (variant 2 via landmarkVariant) on the summit anchor
  landmarks: { lighthouse: { kind: 'lighthouse', variant: 2 } },
  // flower clumps on the brand lawn: a denser, clustered copy of the global flower rule
  scatter: PLACEMENT_RULES.filter((r) => r.def === 'flower').map((r) => ({
    ...r,
    minDist: 1.1,
    density: 0.75,
    cluster: { scale: 9, threshold: 0.1 },
  })),
  // TASK-403: the built-up Media Rock keeps its trees and flowers but no bush / rock clutter
  // (two scatter kinds × variants of LOD0 groups in every close-up)
  scatterOff: ['bush', 'rockCluster'],
  life: {},
  treePalette: FOLIAGE,
};

/**
 * Marketing island plan tuning (world/gen/plans/marketing.ts, TASK-403 "Media Rock"): the
 * lighthouse on the summit with the Ad Boulevard running from it to the giant screen on the lee
 * rim; the media campus on the upper / middle ledges (antenna tower, layered media offices,
 * photo studio and print shop, broadcast studios); the fair ground on the low shelf (ferris
 * wheel, stage, tents, game booths); the landing pier in the cove. Lengths in u.
 */
export const MARKETING_PLAN = {
  /** Broadcast tower (lighthouse variant 2) top above its base (geo/landmarks.ts, ×1.7 TASK-393). */
  towerHeight: 19,
  /**
   * The tower moves from the summit anchor up to `back` u windward (against the terrace axis) to
   * the farthest spot whose `r` u lawn is on the plateau (relief, `drop` below the anchor height).
   */
  lighthouse: { back: 14, r: 4, minShore: 3, maxRelief: 1.6, drop: 2.5 },
  /** Landing dock search around the cove anchor. */
  dockSearch: 18,
  /** Megaphone kiosk beside the pier root: ring radii and footprint radius. */
  kioskRing: [3, 10] as const,
  kioskRadius: 0.9,
  /** Summit plateau: a footprint nowhere lower than the lighthouse base − summitDrop, relief ≤ summitRelief. */
  summitDrop: 3.2,
  summitRelief: 1.4,
  /** Ad Boulevard: street width, its length window (lighthouse → screen), side slot pitch. */
  boulevard: { width: 5, len: [10, 30] as const, slot: 5.8, start: 2, end: 1.5 },
  /** The boulevard's hub disc (Zone.plaza, the island network seed) mid-street. */
  quadR: 2.6,
  /** Giant screen (geo giantScreen) on the summit's lee rim, both faces lit; footprint. */
  screen: { w: 8.4, d: 1.8, drop: 4.5, maxRelief: 2.2 },
  /**
   * Boulevard frontage, per side in street order (left / right of the walk lighthouse → screen):
   * lot defs (offices) or fixture defs; a slot that cannot hold its item tries a banner pole.
   * `cafe` = fairBooth variant 1.
   */
  frontage: {
    left: ['broadcastStudio', 'billboardV2', 'bannerPole', 'billboardV2'],
    right: ['cafe', 'billboard', 'billboardV2', 'bannerPole'],
  } as const,
  /** Fixture footprints (w along the street / facing width, d depth). */
  billboard: { w: 5.6, d: 1.6, height: 5.7 },
  cafe: { w: 3.4, d: 2.6 },
  /** A shelf spot: all footprint samples within `tol` u of the shelf level. */
  shelfTol: 1.2,
  shelfMinShore: 1.2,
  /** Media campus: antenna tower on the upper ledge, layered offices, photo studio / print shop. */
  antenna: { r: 1.7, search: 20 },
  office: { w: 6.2, d: 4.4, count: [2, 3] as const, search: 36 },
  shop: { w: 3.8, d: 3.2, search: 36 },
  /**
   * Ledge lots keep this grown footprint within `tol` of the shelf: their flatten pad (which leaves
   * ground > padBreak off its level alone) then levels every cell the lot corners sample.
   */
  lotGrow: { u: 2.9, tol: 2.2 },
  /** Broadcast studio lots on the ledges (workers' desks), besides the boulevard one. */
  ledgeLots: [1, 2] as const,
  /** Stair hubs: one free disc per shelf, kept clear (`clear` u) for the switchbacks. */
  hub: { r: 1.6, clear: 2.4, search: 16 },
  /** Fair ground: the paved disc, its ring of tents and booths, ferris wheel and stage. */
  fair: { r: 5.5, rMin: 4.2, search: 18, maxRelief: 1.4 },
  wheel: { w: 8, d: 4, gap: 1 },
  tent: { r: 2.1, count: [3, 4] as const, gap: 0.8 },
  booth: { w: 2.4, d: 1.8, count: [3, 4] as const, ring: 2.4, slots: 8 },
  /** Stage (geo/themes/marketing.ts stage, 5.8 × 4.2) facing the fair centre. */
  stage: { w: 5.8, d: 4.2, gap: 0.8, maxRelief: 1.6 },
  /** Banner poles round the fair (angle off the stage axis in deg). */
  bannerPoles: [125, -125, 180] as const,
} as const;

/**
 * Media Rock structures (TASK-403, geo/themes/marketing-media.ts): sizes and colours. The ferris
 * wheel's rotor is a mover (render/movers.ts): one instance per wheel, turning about the hub.
 */
export const MEDIA_ROCK = {
  colors: {
    accent: '#E35D6A',
    cream: '#FFF4E0',
    blush: '#FFD9D2',
    gold: '#F5C84C',
    sky: '#7CC4FF',
    mint: '#7FD8B3',
    lilac: '#B9A3E8',
    bezel: '#3A3F4D',
    steel: '#C9CFD8',
    warm: '#FFE9B8',
    redLamp: '#FF4A4A',
  },
  /** Giant screen: face size, its bottom edge, leg section; both faces carry the slideshow. */
  screen: { w: 7.6, h: 4.2, y: 4.4, leg: 0.5 },
  /** Antenna tower: lattice height, half-width at the foot / top, platform heights. */
  antenna: { h: 14, foot: 1.2, top: 0.28, platforms: [5.8, 10.2] as const },
  /** Layered media office: ground block, the set-back upper block (depth, offset to the back). */
  office: { w: 6.2, d: 4.4, h0: 3.0, w1: 4.6, d1: 2.8, h1: 2.5 },
  /** Photo studio / print shop. */
  shop: { w: 3.8, d: 3.2, h: 2.8 },
  /** Ferris wheel: rim radius, hub height, pod count / radius / length, rim ring spacing (z). */
  wheel: { r: 4.4, hubY: 5.7, pods: 8, podR: 0.52, podL: 1.0, ringZ: 0.55, spokes: 8 },
  /** Pod colours round the rim (cycled). */
  podColors: ['#E35D6A', '#7CC4FF', '#F5C84C', '#7FD8B3', '#B9A3E8', '#FF9F7A'] as const,
  /** Marquee tent: wall radius / height, roof overhang radius / rise; stripe colours cycled. */
  tent: { r: 2.1, wall: 1.5, roofR: 2.45, rise: 1.9, stripes: 12 },
  tentColors: ['#E35D6A', '#FFF4E0', '#F5C84C', '#FFF4E0', '#7CC4FF', '#FFF4E0'] as const,
  /** Game booth / café counter. */
  booth: { w: 2.2, d: 1.4, h: 1.0, roof: 2.3 },
} as const;

/** Ferris wheel rotor motion (render/movers.ts): seconds per turn; drawn at every distance. */
export const MEDIA_MOVERS = { wheelPeriod: 36, fadeNear: 4000, fadeFar: 5000 } as const;
