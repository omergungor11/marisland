/**
 * Müfettişler Adası (Inspectors' Island) — TASK-408 stub. Kit ledger (new defs, ≤ 10; ≥ 70 %
 * tier ≥ 2, ≤ 1 tier-1, no tier-0) is filled by wave 1; story spots, rhythm and relay by
 * waves 2–3.
 */
import type { CultureDef } from './types.ts';

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
  kit: [],
  storySpots: [],
  rhythm: [],
  relay: { order: 3, id: 'greenLightCeremony' },
};
