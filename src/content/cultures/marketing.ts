/**
 * Karnaval Yayıncıları (Carnival Broadcasters) — TASK-408 stub. Kit ledger (new defs, ≤ 10;
 * ≥ 70 % tier ≥ 2, ≤ 1 tier-1, no tier-0) is filled by wave 1; story spots, rhythm and relay
 * by waves 2–3.
 */
import type { CultureDef } from './types.ts';

export const MARKETING_CULTURE: CultureDef = {
  theme: 'marketing',
  id: 'carnivalBroadcasters',
  name: 'Karnaval Yayıncıları',
  nameEn: 'Carnival Broadcasters',
  palette: {
    accent: '#E35D6A',
    roofs: ['#E35D6A', '#FAFAF5'],
    walls: ['#FFF4E0'],
    trims: ['#FFB347', '#A9AEB8'],
  },
  pennant: { cut: 'streamer', accent: '#E35D6A' },
  kit: [],
  storySpots: [],
  rhythm: [],
  relay: { order: 5, id: 'goldenHourShow' },
};
