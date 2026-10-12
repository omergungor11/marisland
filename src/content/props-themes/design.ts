/**
 * design theme structures (M14b): PropDefs appended to PROP_DEFS after PROP_DEFS_BUILDINGS
 * (content/props.ts, fixed theme order). Geometry: geo/themes/design.ts.
 */
import { PropFlag } from '../../world/prop-store.ts';
import { OFFICE_PAL } from '../palette-offices.ts';
import { CLIFF_STRATA, EMISSIVE, FLOWERS, ROCK, ROOFS, WALLS, WOOD } from '../palette.ts';
import { SKY_CRAFT } from '../sky-craft.ts';
import type { PropDef } from '../props.ts';

const { grounded, windy, clusterable, noShadow } = PropFlag;

/** Sculpture garden primaries (ART_BIBLE M14b §2.6): saturated but warm, read from the far tier. */
export const SCULPTURE_COLORS = {
  red: '#E8483F',
  yellow: '#FFD23F',
  blue: '#3F7FE8',
  plinth: '#FAFAF5',
} as const;

/**
 * Blossom tree canopy (shade, mid, light). The T0 tree blobs and the Design `treePalette.deciduous`
 * should use these hexes so blobs match the blossom trees (D-031); middle = ART_BIBLE #FF8FB1.
 */
export const BLOSSOM_CANOPY = ['#E8709A', '#FF8FB1', '#FFC2D4'] as const;

export const DESIGN_PROP_DEFS: readonly PropDef[] = [
  // T0 sculptures (3-5 u, primary colours) so the garden reads from far
  {
    id: 'sculptureTorus',
    geo: 'sculptureTorus',
    tier: 0,
    variants: 1,
    footprint: 1.6,
    flags: grounded,
  },
  {
    id: 'sculptureStack',
    geo: 'sculptureStack',
    tier: 0,
    variants: 1,
    footprint: 1.3,
    flags: grounded,
  },
  {
    id: 'sculptureArch',
    geo: 'sculptureArch',
    tier: 0,
    variants: 1,
    footprint: 2.4,
    flags: grounded,
  },
  { id: 'easel', geo: 'easel', tier: 2, variants: 2, footprint: 0.6, flags: grounded },
  {
    id: 'paintPotPlanter',
    geo: 'paintPotPlanter',
    tier: 2,
    variants: 3,
    footprint: 0.4,
    flags: grounded | windy,
  },
  // tree: like roundTree it is a T0 cluster-proxy blob member (blob colours = BLOSSOM_CANOPY)
  {
    id: 'blossomTree',
    geo: 'blossomTree',
    tier: 1,
    variants: 3,
    footprint: 0.7,
    flags: grounded | windy | clusterable,
  },
];

/**
 * TASK-415 "Cam ve Işık Stüdyosu" (Glass & Light) kit colours (geo/themes/culture-design.ts). Every
 * hex is a palette-table value (ROOFS / FLOWERS / EMISSIVE / OFFICE_PAL / CLIFF_STRATA / ROCK /
 * SKY_CRAFT). Design glass is saturated and warm — never the Research aqua (`WATER.lagoon`
 * `#8EEBE0`) or the pale `paneHigh` lilac, and never a flat clear pane (ISLAND_CULTURES §2.6).
 */
export const DESIGN_CULTURE_KIT = {
  /** The stained-glass hues: ruby, orange, amber, sun yellow, mint, sky, violet, lavender, pink. */
  glass: {
    ruby: ROOFS[1],
    coral: ROOFS[0],
    orange: FLOWERS[4],
    amber: ROOFS[3],
    sun: FLOWERS[1],
    mint: ROOFS[6],
    sky: ROOFS[5],
    violet: ROOFS[4],
    lavender: FLOWERS[3],
    pink: FLOWERS[0],
    plum: OFFICE_PAL.design[0].roof,
  },
  plumDeep: OFFICE_PAL.design[0].trim,
  plumLight: OFFICE_PAL.design[1].roof,
  lava: EMISSIVE.lava,
  glow: EMISSIVE.lantern,
  window: EMISSIVE.window,
  brick: CLIFF_STRATA[1],
  brickLight: CLIFF_STRATA[0],
  brickDark: WOOD.logs,
  soot: WOOD.dark,
  copper: SKY_CRAFT.copper,
  brass: SKY_CRAFT.brass,
  /** Lead came / forged iron. */
  came: '#3A3F4D',
  steel: ROCK[2],
  steelLight: ROCK[1],
  steelPale: ROCK[0],
  cream: WALLS[0],
  paper: WALLS[1],
  woodLight: WOOD.planks,
  wood: WOOD.logs,
  woodDark: WOOD.dark,
  stone: '#7A7584',
  stoneDark: '#5A5664',
} as const;

/**
 * TASK-415 Glass & Light kit (geo/themes/culture-design.ts); ledger: content/cultures/design.ts.
 * Appended at the END of PROP_DEFS (content/props.ts) so no existing defId shifts (hash pins).
 * Tier >= 2 except rainbowArc; none of the tier-2/3 defs reaches isLargeStructure (< 3 u high).
 * rainbowArc is a 14 u arc: `isLargeStructure` promotes it to an effective tier 0 (its LOD1 group
 * is the only far cost of the kit), it casts no shadow and the mover gates it by the clock.
 */
export const DESIGN_CULTURE_PROP_DEFS: readonly PropDef[] = [
  { id: 'hotShop', geo: 'hotShop', tier: 2, variants: 3, footprint: 1.6, flags: grounded },
  {
    id: 'prismSculpture',
    geo: 'prismSculpture',
    tier: 2,
    variants: 3,
    footprint: 0.7,
    flags: grounded,
  },
  {
    id: 'stainedScreen',
    geo: 'stainedScreen',
    tier: 2,
    variants: 2,
    footprint: 1.0,
    flags: grounded,
  },
  { id: 'gatherRing', geo: 'gatherRing', tier: 2, variants: 1, footprint: 1.5, flags: grounded },
  // T3 micro props: no shadow-pass copy (B4)
  {
    id: 'causticDecal',
    geo: 'causticDecal',
    tier: 3,
    variants: 5,
    footprint: 0.5,
    flags: grounded | noShadow,
  },
  {
    id: 'glassOrb',
    geo: 'glassOrb',
    tier: 3,
    variants: 3,
    footprint: 0.5,
    flags: grounded | noShadow,
  },
  {
    id: 'culletCrate',
    geo: 'culletCrate',
    tier: 3,
    variants: 5,
    footprint: 0.5,
    flags: grounded | noShadow,
  },
  {
    id: 'sampleShelf',
    geo: 'sampleShelf',
    tier: 3,
    variants: 2,
    footprint: 0.7,
    flags: grounded | noShadow,
  },
  {
    id: 'blowpipeRack',
    geo: 'blowpipeRack',
    tier: 3,
    variants: 1,
    footprint: 0.7,
    flags: grounded | noShadow,
  },
  // the one tier-1 def: the waterfall rainbow (time-gated by the culture mover)
  {
    id: 'rainbowArc',
    geo: 'rainbowArc',
    tier: 1,
    variants: 1,
    footprint: 14,
    flags: grounded | noShadow,
  },
];
