/**
 * Cam ve Işık Stüdyosu (Glass & Light Studio) — kit ledger filled by TASK-415
 * (geo/themes/culture-design.ts, defs in content/props-themes/design.ts); story spots, rhythm and
 * relay by waves 2–3.
 *
 * Ledger ORDER = priority: if the per-island cap drops (10 -> 6) the kit is cut from the END. The
 * first four are the tier-2 identity (hot shop, prism, stained screen, gather ring); then the
 * caustic decal (the prism's light), the orb and the cheap tier-3 props; the one tier-1 def
 * (rainbowArc, the only entry that costs W11 calls) comes last. Variants of existing defs
 * (giantTree canopy vitray, galleryPavilion glass roof, bunting glass chime line) are not entries.
 */
import { PropFlag } from '../../world/prop-store.ts';
import type { CultureDef } from './types.ts';

const { grounded, noShadow } = PropFlag;

export const DESIGN_CULTURE: CultureDef = {
  theme: 'design',
  id: 'glassAndLight',
  name: 'Cam ve Işık Stüdyosu',
  nameEn: 'Glass & Light Studio',
  palette: {
    accent: '#B07CE0',
    roofs: ['#9C8CE0'],
    walls: ['#FFF4E0'],
    trims: ['#FF8FB1'],
  },
  pennant: { cut: 'scallop', accent: '#B07CE0' },
  kit: [
    { id: 'hotShop', tier: 2, flags: grounded },
    { id: 'prismSculpture', tier: 2, flags: grounded },
    { id: 'stainedScreen', tier: 2, flags: grounded },
    { id: 'gatherRing', tier: 2, flags: grounded },
    { id: 'causticDecal', tier: 3, flags: grounded | noShadow },
    { id: 'glassOrb', tier: 3, flags: grounded | noShadow },
    { id: 'culletCrate', tier: 3, flags: grounded | noShadow },
    { id: 'sampleShelf', tier: 3, flags: grounded | noShadow },
    { id: 'blowpipeRack', tier: 3, flags: grounded | noShadow },
    // not `grounded` (TASK-425): a 14 u arc would get a 13 u contact blob at its empty centre
    { id: 'rainbowArc', tier: 1, flags: noShadow },
    // M20 Glass Conservatory (D-057, TASK-465): cap 15 / 2 tier-1 (cultureCapOverride.design);
    // the conservatory is the second tier-1 def and, like the rainbow, an effective tier 0 by size
    { id: 'conservatory', tier: 1, flags: grounded },
    { id: 'glasshouse', tier: 2, flags: grounded },
    { id: 'glassBridge', tier: 2, flags: 0 },
    { id: 'prismArch', tier: 2, flags: grounded },
    { id: 'stainedWindmill', tier: 2, flags: grounded },
  ],
  // TASK-425: emitted by world/gen/plans/design.ts glassAndLight (world.storySpots)
  storySpots: [
    { kind: 'annealerCat', defs: ['hotShop'] },
    { kind: 'gafferTurn', defs: ['hotShop', 'blowpipeRack'] },
    { kind: 'secondsGull', defs: ['sampleShelf'] },
    { kind: 'rainbowShards', defs: ['culletCrate', 'causticDecal'] },
    { kind: 'vaseToSun', defs: ['causticDecal'] },
    { kind: 'foxOrb', defs: ['glassOrb'] },
    { kind: 'prismRainbow', defs: ['prismSculpture', 'causticDecal'] },
    { kind: 'critique', defs: ['gatherRing'] },
  ],
  rhythm: [],
  relay: { order: 6, id: 'lanternNight' },
};

/**
 * TASK-425 placement of the Glass & Light kit on Mossgrove (world/gen/plans/design.ts
 * `glassAndLight`). Distances in u; hot-shop offsets are (local x, local z) in its frame (front =
 * +z, facing the quad). Every draw comes from a sub-fork of the island's culture fork.
 */
export const DESIGN_CULTURE_SITE = {
  /** Kit props stand on ground at least this high (u). */
  minY: 0.6,
  /** The gallery: the galleryPavilion lot nearest the quad gets the glass roof (v2). */
  glassPavilionVariant: 2,
  hotShop: {
    /**
     * Obstacle rect (local x, z); the core that must be free (shop + the bench in front, centred
     * at `yardZ`); the levelled, terrazzo-paved yard (side clutter only where it is free).
     */
    rect: [3.0, 2.7] as const,
    core: [4.2, 4.0] as const,
    yard: [7.4, 4.6] as const,
    /** Yard centre offset along local z (the yard runs a little in front of the shop). */
    yardZ: 0.5,
    /** Ring round the quad centre (u past the quad edge), radius step, angle samples. */
    ring: [3.5, 22] as const,
    step: 1,
    samples: 28,
    /** Relief over the yard tried in order (u). */
    maxRelief: [1.2, 2, 3.2] as const,
    gap: 0.8,
    /** Score: per u from the quad edge, and for the windward side (smoke blows off the glade). */
    distCost: 0.12,
    leeCost: 1.2,
  },
  /** Workshop clutter round the hot shop (local x, local z[, 1 = turned to face the back]). */
  workshop: {
    /** Slots tried in order: beside the furnace / annealer, else behind the back wall (turned). */
    blowpipeRack: [
      [-2.25, -0.75, 0],
      [-0.6, -2.0, 1],
    ] as const,
    /** The "seconds" shelf (sampleShelf v1): the gull sits in its big bowl. */
    seconds: [
      [2.3, -0.8, 0],
      [0.9, -2.0, 1],
    ] as const,
    secondsVariant: 1,
    /** Cullet crates (count range; slots in order, colours drawn without repeats). */
    cullet: [
      [2.2, 0.55],
      [2.85, 1.3],
      [-2.3, 0.7],
    ] as const,
    culletCount: [2, 3] as const,
  },
  /** Story anchors on the hot shop (local x, y above the ground, local z). */
  annealerCat: [0.88, 0.86, -0.58] as const,
  gaffer: [-0.28, 0, 1.6] as const,
  /** The gull in the seconds shelf's bowl (height above the ground). */
  secondsGullY: 1.0,
  prisms: {
    /** Between the garden's sculptures, at these fractions of the clearing radius (tried in order). */
    count: [2, 3] as const,
    ringFrac: [0.86, 0.76] as const,
    /** Fallbacks: a ring just outside the garden, then round the quad (u past their edges). */
    outRing: [1.5, 6] as const,
    quadRing: [3, 14] as const,
    /** Relief cap of a fallback prism site before levelling (u). */
    outRelief: 1.6,
    /** Each prism throws a caustic decal this far toward the garden centre; colour per variant. */
    caustic: 1.15,
    causticOf: [4, 0, 2] as const,
  },
  screens: {
    /** Between consecutive easels along the walk (≤ maxPair apart), else round the garden / quad. */
    count: [2, 3] as const,
    maxPair: 13,
    /** Fallback ring past the garden edge / the quad edge (u). */
    ring: [1.5, 12] as const,
    /** Relief cap over the screen disc before levelling (the walk runs down the dome flank). */
    maxRelief: 1.6,
  },
  gather: {
    /** Ring round the quad (u past its edge); keep this far from the hot shop centre. */
    ring: [4, 22] as const,
    shopDist: 7,
    maxRelief: 2,
  },
  orbs: {
    /** Glass orbs on the glade lawns: count, ring past the quad edge (u), spacing. */
    count: [2, 3] as const,
    ring: [2.5, 14] as const,
    spacing: 4,
    /** Caustic colour per orb variant (violet, sky, amber families). */
    causticOf: [4, 3, 1] as const,
  },
  /** The fox and the orb at the forest edge: ring round the mushroom grove (u); fox in front. */
  foxOrb: { ring: [6.5, 12] as const, fox: 1.3, orbVariant: 2 },
  /** The bot holding a vase to the sun: a big amber caustic this far in front of it. */
  vase: { ring: [3, 20] as const, caustic: 1.0, causticVariant: 1, maxRelief: 1.6 },
  /** Rainbow-sorted shards: a cullet crate, then the five caustics in hue order in front of it. */
  shards: { shopR: 4, ring: [0, 12] as const, first: 1.0, spacing: 0.72, maxRelief: 2 },
  /** The prism bot: this far past a prism's caustic decal (u). */
  prismBot: 0.9,
  chimes: {
    /** Glass chime lines (bunting v3, 6 u span) across the glade lanes. */
    variant: 3,
    count: [2, 3] as const,
    start: 3,
    spacing: 6,
    half: 3,
    poleR: 0.3,
    cordDepth: 0.8,
    /** Max height difference between the two poles (u). */
    maxStep: 1.2,
  },
  /**
   * The rainbow (one per island) stands in the sea off the bluff foot like the spray rainbow of a
   * waterfall: pivot at the waterline (FLOATING_FIXTURES), its plane along the shore, the stream
   * mouth (where the falls drop) preferred. A ground-standing arc floats its legs on the dome.
   */
  rainbow: {
    /** Leg half-span (u; RAINBOW.r minus half a band) and the underside radius of the inner band. */
    half: 13.7,
    inner: 10.15,
    /** Centre: shore distance range (u, negative = sea), scan step (u), orientations tried. */
    offshore: [-9, -2.5] as const,
    step: 2,
    angles: 12,
    /** Ground under the low ends stays below this (u: shallows, wet beach); land under the high
     * part this far below the arc. */
    legMaxY: 0.4,
    clearance: 1,
    /** Keep this far from the island's docks and moorings (u). */
    dockClear: 18,
    /** Score per u: from the stream mouth, leg shore-distance mismatch (plane along the shore). */
    mouthCost: 0.05,
    alongCost: 0.2,
  },
  /** Small kit props: relief cap round the footprint before levelling (u), obstacle gap. */
  smallRelief: 1.0,
  gap: 0.5,
} as const;
