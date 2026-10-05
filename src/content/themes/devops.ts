/** DevOps (Emberpeak, volcano) — M14b plan §2. */
import { FOLIAGE } from '../palette.ts';
import type { ThemeDef } from './index.ts';

export const DEVOPS_THEME: ThemeDef = {
  id: 'devops',
  displayName: 'DevOps',
  short: 'OPS',
  icon: 'gear',
  accent: '#FF9F43',
  teamTints: ['#FF9F43', '#FFBC78', '#E5822A'],
  lotMix: [
    ['dataCenter', 2],
    ['rackShed', 2],
    ['antennaMast', 1],
  ],
  crown: 'antennaMast',
  defSwap: {},
  landmarkVariant: {},
  decor: [
    ['crate', 2],
    ['barrel', 1],
  ],
  pathLanterns: 0.5,
  workers: { weight: 1.0, cap: 8, deskShare: 0.4 },
  accessory: 5,
  // M14b defaults (TASK-360): today's behaviour; the island plan task fills these.
  ground: {},
  patchwork: 'off',
  landmarks: {},
  scatter: [],
  scatterOff: [],
  life: {},
  treePalette: FOLIAGE,
};
