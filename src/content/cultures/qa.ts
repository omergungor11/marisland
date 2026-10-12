/**
 * Müfettişler Adası (Inspectors' Island). Kit ledger (TASK-414; new defs, ≤ 10; ≥ 70 % tier ≥ 2,
 * ≤ 1 tier-1, no tier-0), ORDERED BY PRIORITY: most identity-defining first, so if the budget gate
 * lowers the cap the tail is cut. Variants of existing defs (testHangar v1 hallOfChecks, terrarium
 * v2 bugZoo, sailboat v3 inspection boat) are not ledger entries. Story spots, rhythm and relay are
 * filled by waves 2–3.
 */
import { PropFlag } from '../../world/prop-store.ts';
import type { CultureDef } from './types.ts';

const { grounded, windy, noShadow } = PropFlag;

export const QA_CULTURE: CultureDef = {
  theme: 'qa',
  id: 'inspectors',
  name: 'Müfettişler Adası',
  nameEn: "Inspectors' Island",
  palette: {
    accent: '#3FBF8F',
    roofs: ['#7FD8B3', '#FAFAF5'],
    walls: ['#FAFAF5'],
    trims: ['#F5C84C', '#666C7A'],
  },
  pennant: { cut: 'chevron', accent: '#3FBF8F' },
  kit: [
    { id: 'dummyBench', tier: 2, flags: grounded },
    { id: 'inspectionBooth', tier: 2, flags: grounded },
    { id: 'uvLampPost', tier: 2, flags: grounded },
    { id: 'scoreboard', tier: 2, flags: grounded },
    { id: 'bugJar', tier: 3, flags: grounded | noShadow },
    { id: 'conePyramid', tier: 3, flags: grounded | noShadow },
    { id: 'flagMast', tier: 2, flags: grounded | windy },
    { id: 'stampDesk', tier: 3, flags: grounded | noShadow },
    { id: 'clipboardWall', tier: 3, flags: grounded | noShadow },
  ],
  storySpots: [],
  rhythm: [],
  relay: { order: 3, id: 'greenLightCeremony' },
};
