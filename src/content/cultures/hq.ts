/**
 * Liman Loncası (Harbour Guild) — TASK-408 stub. Kit ledger (new defs, ≤ 10; ≥ 70 % tier ≥ 2,
 * ≤ 1 tier-1, no tier-0) is filled by wave 1; story spots, rhythm and relay by waves 2–3.
 */
import type { CultureDef } from './types.ts';

export const HQ_CULTURE: CultureDef = {
  theme: 'hq',
  id: 'harbourGuild',
  name: 'Liman Loncası',
  nameEn: 'Harbour Guild',
  palette: {
    accent: '#E8735A',
    roofs: ['#E8735A', '#F09A7E'],
    walls: ['#FFF4E0'],
    trims: ['#5DA9E9', '#FAFAF5'],
  },
  pennant: { cut: 'swallowtail', accent: '#E8735A' },
  kit: [],
  storySpots: [],
  rhythm: [],
  relay: { order: 1, id: 'ferryFanfare' },
};
