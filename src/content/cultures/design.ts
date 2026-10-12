/**
 * Cam ve Işık Stüdyosu (Glass & Light Studio) — TASK-408 stub, deliberately generic: the Design
 * detail bible (§2.6) is being rewritten. Kit ledger (new defs, ≤ 10; ≥ 70 % tier ≥ 2, ≤ 1
 * tier-1, no tier-0) is filled by wave 1; story spots, rhythm and relay by waves 2–3.
 */
import type { CultureDef } from './types.ts';

export const DESIGN_CULTURE: CultureDef = {
  theme: 'design',
  id: 'glassAndLight',
  name: 'Cam ve Işık Stüdyosu',
  nameEn: 'Glass & Light Studio',
  palette: {
    accent: '#B07CE0',
    roofs: ['#9C8CE0'],
    walls: ['#FFF4E0'],
    trims: ['#FF8FB1'],
  },
  pennant: { cut: 'scallop', accent: '#B07CE0' },
  kit: [],
  storySpots: [],
  rhythm: [],
  relay: { order: 6, id: 'lanternNight' },
};
