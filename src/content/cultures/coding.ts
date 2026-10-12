/**
 * Rüzgâr Bahçeleri (Wind Gardens) — TASK-408 stub. Kit ledger (new defs, ≤ 10; ≥ 70 % tier ≥ 2,
 * ≤ 1 tier-1, no tier-0) is filled by wave 1; story spots, rhythm and relay by waves 2–3.
 */
import type { CultureDef } from './types.ts';

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
  kit: [],
  storySpots: [],
  rhythm: [],
  relay: { order: 4, id: 'kiteDay' },
};
