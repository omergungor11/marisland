/**
 * DevOps "Ember Smiths" M26 lava-pack kit (TASK-509b, D-092): numbers and palette of the ember bridge
 * (D3), the crater deck (D6), the lava-glass kiln (D17), the obsidian beach decor (D10), the breakwater
 * (D18) and the tug (D18, sailboat variant 9). Geometry: geo/themes/devops-m26.ts; defs:
 * content/props-themes/devops-m26.ts. Anchor sizes it must fit: content/themes/devops-growth.ts
 * (`lava` strip 3 u + 2 x 1.5 u margin, `craterDeck.r` 2.5, `obsidian.size`, `breakwater`).
 * Lengths in u (1 u = 1 m), ground (or waterline) at y = 0. Colours come from the existing DevOps
 * tables (M25_PAL); only the obsidian blacks are new, derived from the black sand `SAND.black`.
 */
import { M25_PAL } from './devops-m25.ts';

export const M26_PAL = {
  ...M25_PAL,
  /** Obsidian glass: deep black-violet body (SAND.black #5B5566 x ~0.45), mid facet, lit facet. */
  obsidian: ['#26222F', '#363245', '#514B66'] as readonly string[],
  /** Glint on the glass (the tide-pool turquoise of the sand beach) and the ember rim. */
  glint: '#8EEBE0',
  ember: M25_PAL.orange,
  /** Lava-glass pieces on the kiln rack (DevOps accents). */
  glass: [
    M25_PAL.orange,
    M25_PAL.teal,
    M25_PAL.coral,
    M25_PAL.red,
    M25_PAL.hazard,
  ] as readonly string[],
} as const;

export const DEVOPS_M26 = {
  /**
   * D3 ember bridge: runs along local z (the lava flows along x under it), centred on the pivot.
   * The lava strip is `lava.width` 3 u + 1.5 u margin each side (devops-growth.ts): the clear span
   * is the channel plus a 0.3 u gap each side, the abutments reach out over the margins.
   */
  bridge: {
    /** 0 footbridge (iron rail, lantern posts), 1 rail bridge (ballast + one track along z). */
    variants: [0, 1] as const,
    length: 9,
    width: 2.4,
    /** Clear span between the abutment faces (> the 3 u lava width). */
    clear: 3.6,
    /** Deck top over the pivot (bank) level; the body reaches `skirt` below it into the bank. */
    deckY: 1.0,
    skirt: 0.5,
    /** Segmental arch: springline and crown height (the lava glows under it). */
    springY: 0.2,
    crownY: 0.68,
    parapet: { w: 0.22, h: 0.34 },
    rail: { h: 0.92, post: 0.07, every: 1.2 },
    lantern: { h: 1.45, r: 0.15 },
    /** Rail variant: ballast bed height over the deck and the track gauge (railTrack.gauge). */
    track: { ballast: 0.1, gauge: 1.1, rail: 0.2 },
    /** Glowing seams in the stone (cracks lit from the lava). */
    seams: 10,
  },
  /** D6 crater deck: an octagonal viewing platform on a stone drum, front (crater side) = +z. */
  deck: {
    /** Floor radius (the anchor disc is 2.5 u; the rail reaches 2.4). */
    r: 2.3,
    floorY: 0.62,
    skirt: 0.6,
    railH: 0.98,
    sides: 8,
    /** The entry gap: this many vertices at the back (-z) have no rail. */
    entry: 1,
    bench: { w: 1.1, d: 0.42, x: 1.05, z: 0.1, seatH: 0.46 },
    scope: { z: 1.35, h: 1.15, len: 0.8, tilt: 0.2 },
    lantern: { h: 1.75, r: 0.16, x: 1.55, z: 1.5 },
  },
  /** D17 lava-glass kiln: front (furnace mouth) = +z; kiln dome on the left, glass rack on the right. */
  kiln: {
    base: { w: 2.7, h: 0.6, d: 2.5, x: -1.4 },
    dome: [
      [1.26, 0],
      [1.3, 0.4],
      [1.16, 0.95],
      [0.86, 1.45],
      [0.46, 1.78],
      [0.3, 1.84],
    ] as const,
    chimney: { r0: 0.32, r1: 0.22, h: 1.55 },
    mouth: { w: 0.78, h: 0.64, y: 0.18 },
    rack: { x: 1.9, w: 2.1, h: 2.0, d: 0.5, z: 0.15 },
    /** Hung lanterns on the top bar, pieces on the shelf. */
    lanterns: 6,
    pieces: 4,
  },
  /** D10 obsidian beach decor (variants: cluster, sea stack, tide-pool slab, cairn). */
  obsidian: {
    variants: 4,
    heights: [1.5, 2.7, 0.75, 0.95] as const,
    /** Shards in the cluster, their height range and base radius. */
    cluster: { n: 7, h: [0.5, 1.5] as const, r: [0.13, 0.26] as const, spread: 0.85, lean: 0.34 },
    stack: { h: 2.7, r: 0.78, sides: 6 },
    slab: { r: 1.15, h: 0.4, pool: 0.55 },
    cairn: { n: 5, r: 0.42 },
    noise: 0.16,
  },
  /**
   * D18 breakwater: a basalt rubble mole along local z, centred on z = 0, crest over the waterline.
   * Variants 0 straight (8 u), 1 short (5 u, with the ladder), 2 head (6 u, round end +z, red light).
   */
  breakwater: {
    length: [8, 5, 6] as const,
    heights: [1.6, 1.6, 3.4] as const,
    crestW: 2.0,
    crestY: 1.25,
    footW: 5.2,
    footY: -2.6,
    bollard: { h: 0.4, r: 0.14 },
    light: { h: 1.9, r: 0.2 },
  },
  /**
   * D18 tug: sailboat variant 9 (bow +z, keel y = 0, like every sailboat variant). 4.6 u hull in
   * graphite with an orange sheer stripe, cream deckhouse, red funnel with an orange band, a tyre
   * fender ring on the bow and a towing bitt aft. `speed` / `lead` are the route hints for the mover.
   */
  tug: {
    variant: 9,
    length: 4.6,
    beam: 1.9,
    hullH: 0.7,
    height: 2.7,
    /** Route hints (u/s, u): cruise speed, the stand-off ahead of the cargo ship it leads or trails. */
    speed: 1.8,
    lead: 7,
    /** Funnel top (smoke), towing bitt, the stern fairlead. */
    funnelZ: -0.55,
    bittZ: -1.95,
  },
} as const;
