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
  ],
  storySpots: [],
  rhythm: [],
  relay: { order: 2, id: 'releaseNight' },
};
