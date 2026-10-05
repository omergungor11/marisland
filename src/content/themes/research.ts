/** Research (Lonely Palm, sandbar) — M14b plan §2. */
import { FOLIAGE } from '../palette.ts';
import type { ThemeDef } from './index.ts';

export const RESEARCH_THEME: ThemeDef = {
  id: 'research',
  displayName: 'Research',
  short: 'R&D',
  icon: 'flask',
  accent: '#4FC3C9',
  teamTints: ['#4FC3C9', '#86D9DD', '#36A3A9'],
  lotMix: [['researchHut', 1]],
  crown: null,
  defSwap: {},
  landmarkVariant: {},
  // the telescope is a worldgen fixture (RESEARCH_OUTPOST)
  decor: [],
  pathLanterns: 0,
  workers: { weight: 0.3, cap: 2, deskShare: 0.5 },
  accessory: 6,
  // M14b defaults (TASK-360): today's behaviour; the island plan task fills these.
  ground: {},
  patchwork: 'off',
  landmarks: {},
  scatter: [],
  scatterOff: [],
  life: {},
  treePalette: FOLIAGE,
};
