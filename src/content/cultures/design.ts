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
    ring: [3.5, 26] as const,
    step: 1,
    samples: 28,
    /** Relief over the yard tried in order (u). */
    maxRelief: [1.2, 2, 3.2, 4.5] as const,
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

  // ---- M20 Glass Conservatory (D-057 / D-058 / D-060, TASK-467)
  /**
   * Glasshouse rows (Z1 / D2): a 2 × 3 block beside the square, doors toward it, one level.
   * `rows` = GLASSHOUSE_HUES indices, front row (nearest the square) then back row, left → right
   * seen from the square: read as a serpentine the six are pink → amber → mint → sky → violet →
   * pink, the spectrum wrapping back to magenta.
   */
  glasshouses: {
    rows: [
      [2, 4, 1],
      [0, 3, 2],
    ] as const,
    /** Centre spacing along the row and between the two rows (u; the aisle between rows walks). */
    colGap: 3.4,
    rowGap: 6.6,
    /** Block centre: this far from the square centre (u) at these angles off each bay axis
     * (deg; 45 = the diagonal between two bays); every pair is scored, the best wins. */
    dist: [17, 19, 21, 23.5, 26] as const,
    angleOff: [45, 25, 65, 12, 78] as const,
    /** Relief over the block before levelling (u, tiers); shore floor (u); obstacle gap (u). */
    maxRelief: [3, 4.5, 6.5, 9] as const,
    /** Shore floor (u): the block pad (lotMargin + falloff) must stay off the bluff band. */
    minShore: 12,
    gap: 1,
    /** Path pins: in front of the middle front house and at both aisle ends (u past the block). */
    pin: 1.5,
    /** Nothing else stands within this of the block (u): a neighbouring lot / kit pad core
     * overlapping the block pad's core would mix two levels under a house corner. */
    keepOff: 4.5,
    /** Forest within this of the block edge becomes meadow (u). */
    meadow: 5,
  },
  /**
   * Prism Walk (Z4 / D3): prism arches astride the pier bay path, `spacing` u apart from `first`
   * u past the bay pin, only on straight, level, high-enough cells (an arch on a cross-slope
   * floats a post). The arch's own position is the TASK-468 light-pool centre (`hooks.pool.at`
   * = the local origin on the ground) — the pools need no extra fixture.
   */
  prismWalk: {
    first: 6,
    spacing: 8,
    count: [3, 5] as const,
    /** Each arch takes the levellest cell within ± `window` u of its nominal spot (≥ `minSpacing`
     * past the arch before it) that sits mid-way in a straight run of `run` lane cells (the
     * smoothed path keeps a straight run). */
    window: 8,
    minSpacing: 5,
    run: [5, 3] as const,
    /** Post-to-post step caps tried in order (u): the lane traverses the dome flank, so each
     * arch gets a small levelling pad (`pad` u disc); the second tier is a small shelf. */
    crossStep: [1.0, 1.4] as const,
    pad: 1.2,
    /** Posts off the path edge: PRISM_ARCH.postX; their obstacle disc (u). */
    postX: 1.0,
    postR: 0.3,
    /** Forest within this of the walk becomes meadow (u). */
    meadow: 5,
  },
  /**
   * Glass bridge (Z10 / D7) over the stream's tidal creek: the Mossgrove stream carve does not
   * survive into the heightfield (the dome's cross-slope swallows a 1 u dent), so the only water
   * a bridge can span is the sea. The last reach of the stream across the lee beach is cut
   * below sea level (`creek*`: the sea fills it), the bridge crosses it where both banks are
   * beach (`bankY`) and level (`bankStep`), local +x across the water (GLASS_BRIDGE: span 7,
   * pads at x = ± 3.9). The creek is blocked for paths except at the bridge, so the pier side
   * reaches the island over it. The render pivot y is the mean bank height
   * (content/settlements BANK_FIXTURES), not the bed.
   */
  bridge: {
    /** Pad centres along local x (u) = GLASS_BRIDGE.span / 2 + pad / 2; their obstacle disc. */
    padX: 3.9,
    padR: 0.9,
    /** Bank height window at the pads (u above sea; the end pads lift a low bank to
     * FLATTEN.minHeight) and the step between them, tiers (u). */
    bankY: [0.5, 1.6] as const,
    bankStep: [0.3, 0.6] as const,
    /** Deck axis turned off the stream normal by these (deg, tried in order): the beach is
     * tilted across the creek, the deck follows the contour. */
    angles: [0, 15, -15, 30, -30, 45, -45] as const,
    /** Relief over a 1.3 u disc at each pad before its levelling pad (u); the pad disc (u);
     * shore distance floor at the pivot (u). */
    padRelief: 2.2,
    endPad: 1.1,
    endPadStep: 5,
    minShore: 1.5,
    /** Prefer the site farthest inland (the longest creek); never inside the square pad. */
    squareClear: 4,
    /** Path pins this far past the pads (u). */
    pin: 1.4,
    /** Creek: bed depth (u, below sea), full-depth core and falloff half-widths (u), how far
     * upstream of the bridge it is cut (u); its path-blocking band half-width and bridge gap (u). */
    creekDepth: -0.6,
    creekCore: 1.1,
    creekFalloff: 2.0,
    creekPast: 5,
    band: 2.0,
    gapAlong: 3.2,
    /** No band within this of the pier root (its link needs a free cell). */
    pierClear: 3.5,
  },
  /**
   * Stained windmill (Z6 / D9): a meadow on the dome's shoulder opposite the tree, the rotor
   * (local +z) into the wind. Pine filler is cleared: forest in `meadowR` becomes meadow.
   */
  windmill: {
    /** Distance from the island centre (u) and the preferred one; floors / gaps (u). */
    dist: [16, 36] as const,
    preferDist: 26,
    minY: 6,
    minShore: 10,
    treeClear: 22,
    squareClear: 20,
    streamClear: 9,
    /** Disc levelled under the mill (u) and its relief tiers (u). */
    discR: 3.5,
    maxRelief: [2, 3, 4.5] as const,
    meadowR: 9,
    /** Path pin this far from the mill toward the square (u). */
    pin: 2.8,
  },
  /** Two spray rainbows (D-060, +2 calls): the second at least this far from the first (u). */
  rainbows: { count: 2, minSep: 34 },
} as const;
