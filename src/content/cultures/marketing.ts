/**
 * Karnaval Yayıncıları (Carnival Broadcasters). Kit ledger (TASK-413): 10 new defs, 9/10 tier >= 2,
 * one tier-1 (mascotStatue), no tier-0, ORDERED BY PRIORITY (most identity-defining first; if the
 * budget gate drops the per-island cap to 6, cut from the end). Geometry:
 * geo/themes/culture-marketing.ts. prizeBooth is its own def (not a fairBooth variant, which would
 * shift existing settlements' rolls). Story spots, rhythm and relay by waves 2-3.
 */
import { PropFlag } from '../../world/prop-store.ts';
import type { CultureDef } from './types.ts';

const { grounded, windy, noShadow } = PropFlag;

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
  kit: [
    { id: 'mascotStatue', tier: 1, flags: grounded },
    { id: 'marqueeSign', tier: 2, flags: grounded },
    { id: 'popcornCart', tier: 2, flags: grounded | windy },
    { id: 'balloonMast', tier: 2, flags: grounded | windy },
    { id: 'confettiCannon', tier: 2, flags: grounded | windy },
    { id: 'searchlightPair', tier: 2, flags: grounded },
    { id: 'prizeBooth', tier: 2, flags: grounded },
    { id: 'selfieSpot', tier: 2, flags: grounded },
    { id: 'posterRoll', tier: 3, flags: grounded | noShadow },
    { id: 'megaphoneStand', tier: 3, flags: grounded | noShadow },
  ],
  storySpots: [],
  rhythm: [],
  relay: { order: 5, id: 'goldenHourShow' },
};
