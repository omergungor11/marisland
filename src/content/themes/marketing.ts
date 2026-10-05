/** Marketing (Beacon Rock, sea stack) — M14b plan §2. */
import { FOLIAGE } from '../palette.ts';
import type { ThemeDef } from './index.ts';

export const MARKETING_THEME: ThemeDef = {
  id: 'marketing',
  displayName: 'Marketing',
  short: 'MKT',
  icon: 'megaphone',
  accent: '#E35D6A',
  teamTints: ['#E35D6A', '#EE8790', '#C9465A'],
  lotMix: [
    ['broadcastStudio', 2],
    ['billboard', 1],
  ],
  crown: null,
  defSwap: { cottage: 'broadcastStudio' },
  landmarkVariant: { lighthouse: 2 },
  decor: [
    ['flowerBed', 2],
    ['bench', 1],
  ],
  pathLanterns: 0.4,
  workers: { weight: 0.7, cap: 5, deskShare: 0.5 },
  accessory: 2,
  // M14b defaults (TASK-360): today's behaviour; the island plan task fills these.
  ground: {},
  patchwork: 'off',
  landmarks: {},
  scatter: [],
  scatterOff: [],
  life: {},
  treePalette: FOLIAGE,
};
