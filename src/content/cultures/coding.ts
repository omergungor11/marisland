/**
 * Rüzgâr Bahçeleri (Wind Gardens). Kit ledger (TASK-411): 8 new defs, 7/8 tier >= 2, one tier-1
 * (giantDuck), no tier-0, ORDERED BY PRIORITY (most identity-defining first; if the budget gate
 * drops the per-island cap to 6, cut from the end). Geometry: geo/themes/culture-coding.ts.
 * Not ledger entries (variants of existing defs): bracketHedge = hedge v2, windChimeTower =
 * windTurbine v3 (LOD1 identical to v0). Story spots, rhythm and relay by waves 2-3.
 */
import { PropFlag } from '../../world/prop-store.ts';
import type { CultureDef } from './types.ts';

const { grounded, windy, noShadow } = PropFlag;

export const CODING_CULTURE: CultureDef = {
  theme: 'coding',
  id: 'windGardens',
  name: 'Rüzgâr Bahçeleri',
  nameEn: 'Wind Gardens',
  palette: {
    accent: '#5B9BE6',
    roofs: ['#5DA9E9', '#3FB8AF'],
    walls: ['#FAFAF5'],
    trims: ['#D2A679', '#FFE45C'],
  },
  pennant: { cut: 'kite', accent: '#5B9BE6' },
  kit: [
    { id: 'rubberDuck', tier: 3, flags: grounded | noShadow },
    { id: 'kite', tier: 2, flags: grounded | windy },
    { id: 'pergolaDesk', tier: 2, flags: grounded | windy },
    { id: 'hammock', tier: 2, flags: grounded | windy },
    { id: 'kiteRack', tier: 2, flags: grounded | windy },
    { id: 'giantDuck', tier: 1, flags: grounded },
    { id: 'whiteboardA', tier: 3, flags: grounded | noShadow },
    { id: 'mugStack', tier: 3, flags: grounded | noShadow },
  ],
  storySpots: [],
  rhythm: [],
  relay: { order: 4, id: 'kiteDay' },
};
