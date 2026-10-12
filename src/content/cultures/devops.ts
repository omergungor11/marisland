/**
 * Kor Demircileri (Ember Smiths) — TASK-408 stub. Kit ledger (new defs, ≤ 10; ≥ 70 % tier ≥ 2,
 * ≤ 1 tier-1, no tier-0) is filled by wave 1; story spots, rhythm and relay by waves 2–3.
 */
import type { CultureDef } from './types.ts';

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
  kit: [],
  storySpots: [],
  rhythm: [],
  relay: { order: 2, id: 'releaseNight' },
};
