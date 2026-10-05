/** Design / Art (Mossgrove, forest dome) — M14b plan §2. */
import { FOLIAGE } from '../palette.ts';
import type { ThemeDef } from './index.ts';

export const DESIGN_THEME: ThemeDef = {
  id: 'design',
  displayName: 'Design',
  short: 'ART',
  icon: 'palette',
  accent: '#B07CE0',
  teamTints: ['#B07CE0', '#C9A2EC', '#9260C4'],
  lotMix: [
    ['atelier', 2],
    ['galleryPavilion', 1],
  ],
  crown: null,
  defSwap: { logCabin: 'atelier' },
  landmarkVariant: {},
  decor: [
    ['flowerBed', 3],
    ['bench', 1],
  ],
  pathLanterns: 0.35,
  workers: { weight: 0.9, cap: 7, deskShare: 0.5 },
  accessory: 4,
  // M14b defaults (TASK-360): today's behaviour; the island plan task fills these.
  ground: {},
  patchwork: 'off',
  landmarks: {},
  scatter: [],
  scatterOff: [],
  life: {},
  treePalette: FOLIAGE,
};
