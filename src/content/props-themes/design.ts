/**
 * design theme structures (M14b): PropDefs appended to PROP_DEFS after PROP_DEFS_BUILDINGS
 * (content/props.ts, fixed theme order). Geometry: geo/themes/design.ts.
 */
import { PropFlag } from '../../world/prop-store.ts';
import type { PropDef } from '../props.ts';

const { grounded, windy, clusterable } = PropFlag;

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
