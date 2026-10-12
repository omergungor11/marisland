/**
 * Yıldız Akademisi (Star Academy). Kit ledger (TASK-416): 10 new defs, 10/10 tier >= 2, no tier-1,
 * no tier-0, ORDERED BY PRIORITY (most identity-defining first; if the budget gate drops the
 * per-island cap to 6, cut from the end: the first six are tripodTelescope, chalkboard, orrery,
 * lectureSteps, teaTrolley, weatherBalloonCart). Geometry: geo/themes/culture-research.ts. The
 * T0/T1 identity comes from VARIANTS of existing defs (not ledger entries, LOD1 = variant 0's):
 * observatory v2 (comet night: slit wide open, dome glowing teal, balcony telescope) and
 * campusTower v3 (bell cupola). The miniVolcanoTerrarium is its own tier-3 def (the existing
 * terrarium is a 5 u tier-0 glasshouse). Story spots, rhythm and relay by waves 2-3.
 */
import { PropFlag } from '../../world/prop-store.ts';
import type { CultureDef } from './types.ts';

const { grounded, noShadow } = PropFlag;

export const RESEARCH_CULTURE: CultureDef = {
  theme: 'research',
  id: 'starAcademy',
  name: 'Yıldız Akademisi',
  nameEn: 'Star Academy',
  palette: {
    accent: '#4FC3C9',
    roofs: ['#3FB8AF', '#666C7A'],
    walls: ['#FFF4E0'],
    trims: ['#E0B050', '#C29A74'],
  },
  pennant: { cut: 'star', accent: '#4FC3C9' },
  kit: [
    { id: 'tripodTelescope', tier: 2, flags: grounded },
    { id: 'chalkboard', tier: 2, flags: grounded },
    { id: 'orrery', tier: 2, flags: grounded },
    { id: 'lectureSteps', tier: 2, flags: grounded },
    { id: 'teaTrolley', tier: 2, flags: grounded },
    { id: 'weatherBalloonCart', tier: 2, flags: grounded },
    { id: 'owlBox', tier: 2, flags: grounded },
    { id: 'pigeonPerch', tier: 3, flags: grounded | noShadow },
    { id: 'bookCart', tier: 3, flags: grounded | noShadow },
    { id: 'miniVolcanoTerrarium', tier: 3, flags: grounded | noShadow },
  ],
  storySpots: [],
  rhythm: [],
  relay: { order: 7, id: 'cometNight' },
};
