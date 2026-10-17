/**
 * Liman Loncası (Harbour Guild). Kit ledger (TASK-410; new defs, ≤ 10, M20: 12 for HQ only; ≥ 70 % tier ≥ 2, ≤ 1 tier-1,
 * no tier-0), ORDERED BY PRIORITY: most identity-defining first, so if the budget gate lowers the
 * cap the tail is cut. Variants of existing defs (hqAnnex v2 guildHall, sailboat v2 ferry) are not
 * ledger entries. Story spots, rhythm and relay are filled by waves 2–3.
 */
import { PropFlag } from '../../world/prop-store.ts';
import type { CultureDef } from './types.ts';

const { grounded, windy, noShadow } = PropFlag;

export const HQ_CULTURE: CultureDef = {
  theme: 'hq',
  id: 'harbourGuild',
  name: 'Liman Loncası',
  nameEn: 'Harbour Guild',
  palette: {
    accent: '#E8735A',
    roofs: ['#E8735A', '#F09A7E'],
    walls: ['#FFF4E0'],
    trims: ['#5DA9E9', '#FAFAF5'],
  },
  pennant: { cut: 'swallowtail', accent: '#E8735A' },
  kit: [
    { id: 'ferryAwning', tier: 2, flags: grounded | windy },
    { id: 'guildNoticeBoard', tier: 2, flags: grounded | windy },
    { id: 'timetableBoard', tier: 2, flags: grounded },
    { id: 'bellPost', tier: 2, flags: grounded },
    { id: 'harbourCrane', tier: 2, flags: grounded },
    { id: 'coffeeCart', tier: 2, flags: grounded },
    { id: 'gullPerch', tier: 3, flags: grounded | noShadow },
    { id: 'mailbag', tier: 3, flags: grounded | noShadow },
    // M20 Seven Gates Crossroads (D-057, TASK-465): cap 12 (cultureCapOverride.hq)
    { id: 'cultureGate', tier: 2, flags: windy },
    { id: 'goodsStall', tier: 2, flags: grounded | windy },
    { id: 'semaphoreTower', tier: 2, flags: grounded },
    { id: 'mailLine', tier: 2, flags: grounded },
  ],
  // ISLAND_CULTURES §2.1 ambient stories (T3); plans/hq.ts emits one spot per kind it could anchor
  storySpots: [
    { kind: 'catOnTimetable', defs: ['timetableBoard'] },
    { kind: 'gullFeeding', defs: ['gullPerch'] },
    { kind: 'forgottenUmbrella', defs: ['ferryAwning'] },
    { kind: 'signpostDebate', defs: ['pierSignpost'] },
    { kind: 'bottleShelf', defs: ['ferryOffice'] },
    { kind: 'kittenInMailbag', defs: ['mailbag'] },
    { kind: 'coffeeQueue', defs: ['coffeeCart'] },
    { kind: 'morningBell', defs: ['bellPost'] },
  ],
  rhythm: [],
  relay: { order: 1, id: 'ferryFanfare' },
};

/**
 * Where the plan (world/gen/plans/hq.ts, TASK-420) puts the kit down. Frames: `pier` = origin at
 * the ferry pier root, `along` toward the sea (negative = inland), `side` across it; `quad` =
 * angles (deg) from the quad → harbour heading at a ring radius. Every list is a candidate order:
 * the first slot that is on land, off the lanes and free of other shapes wins. Blocking radii:
 * content/settlements FIXTURE_RADIUS.
 */
export const HQ_CULTURE_SITE = {
  /** No culture prop within this of the pier root (the dock link and the banner gate). */
  apron: 2.4,
  /** Lowest ground (u) a land prop may stand on; quay props (perches, crane) use `quayY`. */
  minY: 0.3,
  quayY: [0.08, 1.6] as const,
  /** Quay props stand within this of the waterline (shore distance, u). */
  quayShore: 3,
  /** Max ground relief under a prop; levelled props (awning, timetable, crane, bell, notice board)
   * get a small flatten pad and tolerate `padRelief`. */
  relief: 0.8,
  /** Unpadded props of radius ≥ 1 u (awning or cart on the quad) need nearly flat ground. */
  wideRelief: 0.3,
  padRelief: 2.4,
  /** Pad core radius (u): ≥ 2√2, so every bilinear corner of the prop's cell is on the plateau. */
  padCore: 2.9,
  /** Level difference to neighbouring pads tolerated without relaxing them (keeps lots put). */
  padStep: 3,
  /** Pad group of the culture pads: overlapping ones (awning + timetable) share one level. */
  padGroup: 420,
  /** The hqAnnex crown lot builds this variant (geo: GUILD_HALL_VARIANT, the Guild Hall). */
  guildHallVariant: 2,
  awning: {
    along: [-3.5, -5, -2.5, -6.5, -8, -1.5],
    side: [3.6, -3.6, 4.8, -4.8, 6, -6, 7.5, -7.5, 9, -9],
    /** Fallback: on the quad's harbour edge (rings from the centre, angles from the heading). */
    quadRings: [4.4, 3.6, 5.2],
    quadAngles: [0, 25, -25, 50, -50, 75, -75, 100, -100, 125, -125],
    variant: 0,
  },
  /** Timetable beside the awning (same side, farther out from the lane), facing the pier root. */
  timetable: {
    along: [0, -1.6, 1.4],
    out: [2.4, 3.2],
    /** Fallback beside the pier path (as the signpost). */
    steps: [3, 4, 6, 8],
    laneSide: [2.4, -2.4, 3, -3],
    variant: 0,
  },
  /** Mail bags at the post spot: beside the awning (awning frame, `out` < 0 = its lane side),
   * else beside the pier path (`steps` / `laneSide` as the signpost). */
  mailbag: {
    along: [0.4, -0.8, 1.4, -2],
    out: [-2.4, -3.1, 2.5, 3.3],
    steps: [2, 3, 5, 6, 8],
    laneSide: [-2, 2, -2.7, 2.7],
    count: [1, 2] as const,
  },
  /** Pier signpost beside the path leaving the pier root: `steps` u up the lane, `side` u off it
   * (fallback: the pier frame with the same `side`, `along`). */
  signpost: {
    steps: [4, 5, 3, 6, 7, 8],
    side: [2, -2, 2.6, -2.6, 3.3, -3.3],
    along: [-3, -4.5, -2, -6],
    variant: 0,
  },
  /** Bell post by the harbour lane, inland of the pier root. */
  bell: {
    along: [-8, -10, -6.5, -12],
    side: [2.6, -2.6, 3.4, -3.4],
    /** Fallback beside the pier path (as the signpost). */
    steps: [8, 10, 6, 12, 14],
    laneSide: [2.4, -2.4, 3.2, -3.2],
    variant: 0,
  },
  /** Hand crane on the quay edge beside the pier, jib over the water. */
  crane: { along: [-0.5, -1.5, 0.5, -2.5], side: [6, -6, 7.5, -7.5, 9, -9], variant: 0 },
  /** Cargo crate clusters (cargoCrate variants = the 7 cultures; every colour once). */
  crates: {
    clusters: [
      { size: 4, along: [-2, -3, -1, -4.5], side: [8.5, -8.5, 7, -7, 10, -10] },
      { size: 3, along: [-5.5, -7, -4, -9], side: [6.5, -6.5, 8, -8, 5, -5, 11, -11] },
    ],
    /** Offsets inside a cluster (u, cluster frame: along, side). */
    grid: [
      [0, 0],
      [0, 0.85],
      [0.85, 0],
      [0.85, 0.85],
    ] as const,
  },
  /** Gull perches on the waterline beside the pier. */
  perches: {
    along: [0.5, 1.5, -0.5, 2.5],
    side: [4, -4, 5.5, -5.5, 7, -7, 8.5, -8.5, 10, -10, 12, -12, 14, -14],
    count: [2, 3] as const,
    gap: 2.5,
    variant: 0,
  },
  /** Coffee cart on the quad (ring radii from the quad centre), serving side to the centre. */
  cart: {
    rings: [3.8, 4.6, 3],
    /** Crowded quad: just outside its rim instead (levelled). */
    outer: [8.6, 9.8],
    angles: [100, -100, 130, -130, 70, -70, 160, -160, 45, -45, 20, -20, 180],
    variant: 0,
  },
  /** Guild notice board just outside the quad rim (clear of the plaza decor), facing the centre. */
  notice: {
    rings: [8.4, 9.6],
    angles: [-75, 75, -115, 115, -140, 140, -50, 50, -160, 160, -25, 25],
    variant: 0,
  },
  /**
   * Pennant lines (6 u span, poles ±3 u) across the lanes: lane 0 (to the pier) first, every
   * `spacing` u from `start` past the quad edge, then the first gate of the next lanes.
   */
  pennants: {
    count: [3, 4] as const,
    start: 3.5,
    spacing: 5,
    half: 3,
    poleR: 0.3,
    /** Keep-out strip under the cord (u along the lane; walkable, no lamps or trees). */
    cordDepth: 0.8,
    /** Keep the cord this far from the banner gates (u). */
    bannerClear: 2.5,
    /** The first line is HQ's; the others are other cultures drawn without repeats. */
    first: 'hq' as const,
  },
} as const;

/**
 * Harbour Guild ferries (world/gen/routes.ts kind 'ferry'): loops from HQ's pier through every
 * other island's pier (one pier per island), split by bearing from HQ into `lines` loops (the
 * stops list the dock indices; a stop the loop cannot reach closely is passed at `reach`).
 * `dwell` = seconds a ferry rests at each stop (life, wave 3).
 */
export const HQ_FERRY = {
  lines: 2,
  dwell: 8,
  /** HQ's pier in a closed bay: the ferry stop is the nearest open-water node within this (u). */
  reach: 60,
} as const;
