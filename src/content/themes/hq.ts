/** HQ / Orchestrator (Hearthholm, harbour crescent) — M14b plan §2. */
import { FOLIAGE } from '../palette.ts';
import type { ThemeDef } from './index.ts';

export const HQ_THEME: ThemeDef = {
  id: 'hq',
  displayName: 'HQ',
  short: 'HQ',
  icon: 'hub',
  accent: '#E8735A',
  teamTints: ['#E8735A', '#F09A7E', '#D45F4A'],
  lotMix: [
    ['hqOffice', 3],
    ['meetingPavilion', 1],
  ],
  crown: 'hqAnnex',
  defSwap: { cottage: 'hqOffice', towerHouse: 'hqAnnex', marketStall: 'coffeeKiosk' },
  landmarkVariant: { clocktower: 2 },
  decor: [
    ['bench', 2],
    ['flowerBed', 2],
    ['lanternPost', 1],
  ],
  pathLanterns: 0.6,
  workers: { weight: 1.4, cap: 12, deskShare: 0.5 },
  accessory: 0,
  // M14b defaults (TASK-360): today's behaviour; the island plan task fills these.
  ground: {},
  patchwork: 'off',
  landmarks: {},
  scatter: [],
  scatterOff: [],
  life: {},
  treePalette: FOLIAGE,
};
