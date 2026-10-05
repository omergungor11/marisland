/** Coding (Millbrook, flat plateau) — M14b plan §2. */
import { FOLIAGE } from '../palette.ts';
import type { ThemeDef } from './index.ts';

export const CODING_THEME: ThemeDef = {
  id: 'coding',
  displayName: 'Coding',
  short: 'CODE',
  icon: 'code',
  accent: '#5B9BE6',
  teamTints: ['#5B9BE6', '#82B6F0', '#4479C9'],
  lotMix: [
    ['devOffice', 3],
    ['devPod', 2],
    ['serverShed', 1],
  ],
  crown: null,
  defSwap: { barn: 'devOffice', cottage: 'devPod' },
  landmarkVariant: {},
  decor: [
    ['bench', 2],
    ['crate', 1],
    ['lanternPost', 1],
  ],
  pathLanterns: 0.6,
  workers: { weight: 1.6, cap: 12, deskShare: 0.6 },
  accessory: 1,
  // M14b defaults (TASK-360): today's behaviour; the island plan task fills these.
  ground: {},
  patchwork: 'fields',
  landmarks: {},
  scatter: [],
  scatterOff: [],
  life: {},
  treePalette: FOLIAGE,
};
