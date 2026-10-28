/**
 * Kor Demircileri (Ember Smiths) — kit ledger filled by TASK-412 (geo/themes/culture-devops.ts,
 * defs in content/props-themes/devops.ts); story spots, rhythm and relay by waves 2–3.
 *
 * Ledger ORDER = priority: if the budget gate fails the per-island cap may drop (10 -> 6) and the
 * kit is cut from the END. The first six carry the identity at T2 (lit, tier 2, cheap); the
 * tier-3 micro props (noShadow) and the one tier-1 def (onsenHouse, the only entry that costs
 * W11 calls) come last. Variants of existing defs (foundry v1 forge bell) are not ledger entries.
 */
import { PropFlag } from '../../world/prop-store.ts';
import type { CultureDef } from './types.ts';

const { grounded, noShadow } = PropFlag;

export const DEVOPS_CULTURE: CultureDef = {
  theme: 'devops',
  id: 'emberSmiths',
  name: 'Kor Demircileri',
  nameEn: 'Ember Smiths',
  palette: {
    accent: '#FF9F43',
    roofs: ['#666C7A', '#8A909C'],
    walls: ['#7A7584'],
    trims: ['#FF9F43', '#FF6A3D'],
  },
  pennant: { cut: 'square', accent: '#FF9F43' },
  kit: [
    { id: 'lavaLantern', tier: 2, flags: grounded },
    { id: 'onsenDeck', tier: 2, flags: grounded },
    { id: 'ingotStack', tier: 2, flags: grounded },
    { id: 'incidentSign', tier: 2, flags: grounded },
    { id: 'pipeValveWheel', tier: 2, flags: grounded },
    { id: 'signalHorn', tier: 2, flags: grounded },
    { id: 'serverShrine', tier: 2, flags: grounded },
    { id: 'anvil', tier: 3, flags: grounded | noShadow },
    { id: 'pagerRock', tier: 3, flags: grounded | noShadow },
    { id: 'onsenHouse', tier: 1, flags: grounded },
    // M25 TASK-504 (D-084): funicular, geyser field, ore cableway (cap 14, cultureCapOverride.devops)
    { id: 'funicularRail', tier: 2, flags: grounded },
    { id: 'funicularCar', tier: 2, flags: grounded },
    { id: 'geyserCone', tier: 2, flags: grounded },
    { id: 'oreBucket', tier: 3, flags: grounded | noShadow },
    // M26 TASK-509b (D-092): ember bridge, crater deck, glass kiln, obsidian beach decor, breakwater
    { id: 'emberBridge', tier: 2, flags: grounded },
    { id: 'craterDeck', tier: 2, flags: grounded },
    { id: 'glassKiln', tier: 2, flags: grounded },
    { id: 'obsidianShard', tier: 2, flags: grounded | noShadow },
    { id: 'devopsBreakwater', tier: 2, flags: noShadow },
  ],
  // TASK-422: emitted by world/gen/plans/devops-works.ts placeCulture (world.storySpots)
  storySpots: [
    { kind: 'onsenCapybara', defs: ['onsenDeck'] },
    { kind: 'containerNap', defs: ['containerRow'] },
    { kind: 'craneCat', defs: ['containerYard'] },
    { kind: 'cartFlower', defs: ['railTrack'] },
    { kind: 'incidentWatch', defs: ['incidentSign'] },
    { kind: 'pagerCrab', defs: ['pagerRock'] },
    { kind: 'anvilHammer', defs: ['anvil', 'smithy'] },
    // TASK-507 (D9): the capybaras on the onsen town bank (world/gen/plans/devops-m25.ts)
    { kind: 'onsenTown', defs: ['onsenHouse'] },
  ],
  rhythm: [],
  relay: { order: 2, id: 'releaseNight' },
};

/**
 * TASK-422 placement of the Ember Smiths kit on Emberpeak (world/gen/plans/devops-works.ts
 * `placeCulture`). Distances in u; "frame" offsets are (along, out) in the facility's own frame.
 */
export const DEVOPS_CULTURE_SITE = {
  /** Foundry variant of the first furnace hall (v1 = forge bell on the roof); the others v0. */
  forgeBellVariant: 1,
  /** Onsen: deck on the hot-spring pool rim facing the pool, the bath house beside it. */
  onsen: {
    /** Deck centre distance from the pool centre (tried in order), candidate angles round it. */
    deckOff: [4.6, 5.0, 5.6] as const,
    angles: 24,
    /** Best deck spots tried for a pair with room for the bath house. */
    deckTries: 8,
    /** Deck / house footprints (w × d, the house includes its side bench). */
    deck: [5.4, 2.2] as const,
    /** Deck pad margin (the house pads like a lot: FLATTEN.lotMargin, flat under bilinear corners). */
    deckMargin: 1.5,
    house: [4.8, 2.6] as const,
    /** House: on a ring round the pool (radius range), flattest + `houseNear` × distance to the deck. */
    houseRing: [5.5, 12] as const,
    houseNear: 0.15,
    /** The house centre stays within this of the pool's ground height (on the spring terrace). */
    houseLevel: 2,
    /** Pre-flatten relief allowed under the deck / house (their level pads flatten it). */
    maxRelief: 3,
    minShore: 1.5,
    /** Score weight pulling the deck to the inland rim (it then faces the sea across the pool). */
    inland: 2,
    /** The capybara story spot on the deck's clear strip (deck-local x, z; plank top y). */
    capybara: [-0.6, 0.35, 0.3] as const,
  },
  /** Lava lanterns: an avenue pier root → container yard, and a row along the foundry rail. */
  lanterns: {
    /** Quay edge (after the avenue): total lanterns on the quay, gap to any lamp there. */
    quayMax: 5,
    quayGap: 5,
    avenueStart: 5,
    avenuePitch: 5,
    avenueOff: 2.6,
    avenueMax: 2,
    railPitch: 4,
    railOff: 1.7,
    railMax: 4,
  },
  /**
   * Ingot stacks beside the first furnace's mouth, along the (level) upper step: hot (v0) at the
   * front corner → cooled (v2) further along. Hall-frame x = along[0] + k·along[1], z = out[0] + k·out[1].
   */
  ingots: {
    count: [3, 4] as const,
    along: [4.4, 1.5] as const,
    out: [1.8, -0.35] as const,
    maxRelief: 1,
  },
  /** Anvils by the smithy doors (frame offset), at most `max`. */
  anvils: { max: 2, at: [1.25, 0.9] as const, side: 0.8 },
  /**
   * The incident sign at the pier root ("the gate"): (along the lane, off its side) tried in order,
   * either side; variant 0 = 42 days.
   */
  incident: {
    at: [
      [2.5, 4.4],
      [4, 4.4],
      [2.5, 3.4],
      [6, 4],
      [8, 4.4],
      [1, 5.4],
      [5, 5.6],
    ] as const,
    variant: 0,
    maxRelief: 0.9,
    /** Off the beach (the pier root's dock cut and ramp leave the waterline uneven). */
    minShore: 2,
    /** Else by the control tower's path pin (tower-frame x offsets, z out from the pin). */
    tower: { x: [2.6, -2.6, 3.6, -3.6] as const, z: 0.6 },
  },
  /** Signal horns: one at the pier root (along, across the lane), one beside the furnace hall (x, z). */
  horns: { pier: [[1.5, 3, 5], 4.2] as const, furnace: [4.6, -1.0] as const, maxRelief: 1 },
  /**
   * Valve wheels on the pipe runs: at most `max`, one per line, longest runs first, tried at these
   * fractions of the run.
   */
  valves: { max: 3, off: 1.2, minRun: 3, maxRelief: 1.2, at: [0.5, 0.3, 0.7, 0.15, 0.85] as const },
  /**
   * The server shrine beside the top data center (side, front offset from its front corner), else
   * on its front apron (inset from the side, out from the front).
   */
  shrine: { side: 1.6, front: -1.2, inset: 0.9, apron: 1.3 },
  /** Pager rock by the control tower (out of the yard rect, off the tower path pin). */
  pager: {
    out: [3.2, 4.4, 5.6] as const,
    side: [2.2, -2.2, 3.2, -3.2] as const,
    /** Else beside the yard's tower-side end: (tower-frame x, z) pairs. */
    end: [
      [-3.9, 0],
      [-3.9, 2],
      [-5, 1],
      [-3.9, -2],
    ] as const,
    pinClear: 1.6,
  },
  /** Imported cargo crates on the quay (cargoCrate variants = THEME_IDS order). */
  crates: {
    piles: [
      { theme: 'qa', n: 3 },
      { theme: 'hq', n: 2 },
    ] as const,
    pileR: 0.9,
    search: 12,
  },
  /**
   * Small kit props: clearance gap, max (pre-flatten) relief under them, the margin of their small
   * level pad, and the clearance kept from footpath pins.
   */
  gap: 0.35,
  maxRelief: 0.7,
  padMargin: 0.4,
  pinClear: 1.6,
  /** A kit spot keeps out of the falloff of any pad more than this off its own height. */
  falloffTol: 1,
} as const;
