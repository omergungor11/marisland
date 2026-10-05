/** QA / Audit (Palmlagoon, atoll) — M14b plan §2. */
import { FOLIAGE } from '../palette.ts';
import type { ThemeDef } from './index.ts';

export const QA_THEME: ThemeDef = {
  id: 'qa',
  displayName: 'QA',
  short: 'QA',
  icon: 'magnifier',
  accent: '#3FBF8F',
  teamTints: ['#3FBF8F', '#7FD8B3', '#2E9E74'],
  lotMix: [
    ['testLab', 1],
    ['inspectionTower', 0],
  ],
  crown: null,
  defSwap: { stiltHut: 'testLabStilt' },
  landmarkVariant: {},
  decor: [
    ['crate', 1],
    ['bench', 1],
  ],
  pathLanterns: 0.4,
  workers: { weight: 0.9, cap: 7, deskShare: 0.4 },
  accessory: 3,
  // M14b defaults (TASK-360): today's behaviour; the island plan task fills these.
  ground: {},
  patchwork: 'off',
  landmarks: {},
  scatter: [],
  scatterOff: [],
  life: {},
  treePalette: FOLIAGE,
};
