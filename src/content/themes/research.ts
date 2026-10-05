/** Research (Lonely Palm, sandbar) — M14b plan §2. */
import { FOLIAGE, SAND } from '../palette.ts';
import { Zone } from '../../world/types.ts';
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
  // sand kept (ART_BIBLE Lonely Palm), ripple detail
  ground: {
    [Zone.sandDry]: { material: 'sand', base: SAND.dry, layer: { layers: ['ripples'] } },
    [Zone.sandWet]: { material: 'sand', base: SAND.wet, layer: { layers: ['ripples'] } },
  },
  patchwork: 'off',
  landmarks: {},
  scatter: [
    // instrument buoys bob just off the beach (lagoon band: they float at the waterline)
    {
      def: 'instrumentBuoy',
      zones: [Zone.lagoon],
      minDist: 7,
      density: 1,
      slopeMax: 2,
      heights: [-4, -0.15],
      shore: [-7, -1],
      scale: [0.9, 1.1],
      maxPerIsland: 3,
    },
    {
      def: 'starfish',
      zones: [Zone.sandWet],
      minDist: 4,
      density: 0.7,
      slopeMax: 1,
      heights: [0, 0.6],
      scale: [0.8, 1.2],
      maxPerIsland: 4,
    },
  ],
  scatterOff: [],
  // creature weights: THEME_LIFE.research
  life: {},
  treePalette: FOLIAGE,
};

/**
 * Research outpost extras (world/gen/plans/research.ts), on top of the RESEARCH_OUTPOST hut,
 * telescope and dock: an observatory dome and a weather mast beside the hut. Both keep the W9
 * rules of the hut (≥ palmClear from the palm, outside ±viewClearDeg of the hero line) and stay
 * out of the hut's door sector. Distances in u.
 */
export const RESEARCH_SITE = {
  observatory: { ring: [3.2, 7.5] as const, radius: 1.6 },
  weatherMast: { ring: [2.4, 7.5] as const, radius: 0.6 },
  /** Gap kept from other obstacles. */
  gap: 0.4,
  /** Door sector: cos of the half-angle in front of the hut door kept free. */
  doorCos: 0.45,
  minShore: 0.4,
  /** Min ground height under the fixture's rim before flattening. */
  cornerMin: 0.02,
} as const;
