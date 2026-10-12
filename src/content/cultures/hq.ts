/**
 * Liman Loncası (Harbour Guild). Kit ledger (TASK-410; new defs, ≤ 10; ≥ 70 % tier ≥ 2, ≤ 1 tier-1,
 * no tier-0), ORDERED BY PRIORITY: most identity-defining first, so if the budget gate lowers the
 * cap the tail is cut. Variants of existing defs (hqAnnex v2 guildHall, sailboat v2 ferry) are not
 * ledger entries. Story spots, rhythm and relay are filled by waves 2–3.
 */
import { PropFlag } from '../../world/prop-store.ts';
import type { CultureDef } from './types.ts';

const { grounded, windy, noShadow } = PropFlag;

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
  kit: [
    { id: 'ferryAwning', tier: 2, flags: grounded | windy },
    { id: 'guildNoticeBoard', tier: 2, flags: grounded | windy },
    { id: 'timetableBoard', tier: 2, flags: grounded },
    { id: 'bellPost', tier: 2, flags: grounded },
    { id: 'harbourCrane', tier: 2, flags: grounded },
    { id: 'coffeeCart', tier: 2, flags: grounded },
    { id: 'gullPerch', tier: 3, flags: grounded | noShadow },
    { id: 'mailbag', tier: 3, flags: grounded | noShadow },
  ],
  storySpots: [],
  rhythm: [],
  relay: { order: 1, id: 'ferryFanfare' },
};
