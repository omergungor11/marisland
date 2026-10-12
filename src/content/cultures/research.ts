/**
 * Yıldız Akademisi (Star Academy) — TASK-408 stub. Kit ledger (new defs, ≤ 10; ≥ 70 % tier ≥ 2,
 * ≤ 1 tier-1, no tier-0) is filled by wave 1; story spots, rhythm and relay by waves 2–3.
 */
import type { CultureDef } from './types.ts';

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
  kit: [],
  storySpots: [],
  rhythm: [],
  relay: { order: 7, id: 'cometNight' },
};
