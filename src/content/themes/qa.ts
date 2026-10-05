/** QA / Audit (Palmlagoon, atoll) — M14b plan §2.5. */
import { FOLIAGE } from '../palette.ts';
import { PLACEMENT_RULES } from '../placement.ts';
import { Zone } from '../../world/types.ts';
import type { ThemeDef } from './index.ts';

/** Palms on the atoll: the archetype's palm rule at this density / cap factor (§2.5 "palms ×0.6"). */
const PALM_FACTOR = 0.6;

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
  // placeStiltHut places the archetype's 'stiltHut' def: the QA lab on stilts
  defSwap: { stiltHut: 'testLabStilt' },
  landmarkVariant: {},
  decor: [
    ['checklistBoard', 2],
    ['trafficCone', 2],
    ['bench', 1],
  ],
  pathLanterns: 0.4,
  workers: { weight: 0.9, cap: 7, deskShare: 0.4 },
  accessory: 3,
  ground: {
    [Zone.sandDry]: { material: 'sand', base: '#F6E7C4' },
    [Zone.grass]: { material: 'lawn', base: '#A8D670' },
    [Zone.meadow]: { material: 'lawn', base: '#A8D670' },
    [Zone.path]: { material: 'gravel', base: '#E7E2D5' },
    [Zone.plaza]: {
      material: 'paving',
      base: '#E4EFEA',
      layer: { tile: { size: 2, grout: '#3FBF8F' } },
    },
  },
  patchwork: 'off',
  // the bug wreck: the archetype's deepest-lagoon anchor
  landmarks: { wreck: { kind: 'sunkenShip', variant: 0 } },
  scatter: PLACEMENT_RULES.filter(
    (r) => r.def === 'palm' && r.archetypes?.includes('palmlagoon'),
  ).map((r) => ({
    ...r,
    density: r.density * PALM_FACTOR,
    maxPerIsland:
      r.maxPerIsland === undefined ? undefined : Math.round(r.maxPerIsland * PALM_FACTOR),
  })),
  scatterOff: ['palm'],
  life: {},
  treePalette: FOLIAGE,
};

/**
 * QA island plan tuning (world/gen/plans/qa.ts): The Loop (ring path with test labs), checkpoint
 * gates, the inspection tower opposite the channel, the stilt lab, the ringed wreck. Lengths in u.
 */
export const QA_PLAN = {
  /** Ring midline: rays from the lagoon centre; a ray's ridge needs this shore distance to walk. */
  ringRays: 120,
  ringMinShore: 1.5,
  /** Ring samples dropped at each channel end of the walked arc. */
  arcTrim: 2,
  /** The Loop: A* waypoints every this many ring samples (keeps it on the ring's ridge). */
  waypointStep: 4,
  /** Lab paving quad: search radius around the landing, relief and score weight to the landing. */
  quadSearch: 40,
  quadLanding: 0.03,
  /** Landing dock in the channel (no carving on the atoll). */
  dockSearch: 16,
  dockSegments: 5,
  /** Test labs along the Loop: count, centre spacing (clamped), path centreline → lot front. */
  labs: [3, 5] as const,
  labSpacing: [8, 18] as const,
  labClear: 1.6,
  /** Inspection tower: Loop samples within this of the ring point opposite the channel. */
  towerSearch: 16,
  /** Checkpoints: a barrier gate every `gateEvery` u of the Loop from `gateStart`, ± `gateSearch`. */
  gateEvery: 22,
  gateStart: 9,
  gateSearch: 10,
  gateRadius: 1.6,
  gateSpacing: 12,
  /** Gates stand on straight stretches: tangent over ± this many Loop samples (1 u), max bend. */
  gateTangent: 3,
  gateStraightDeg: 30,
  /** Checklist board right of a gate, traffic cones left of it (along, side). */
  boardSide: 2.7,
  cone: [1.4, 1.5] as const,
  /** Inspection buoys ringing the wreck: count, gap past its radius, min water depth. */
  wreckBuoys: 6,
  wreckBuoyGap: 1.6,
  wreckBuoyDepth: 0.7,
  /** Stilt lab: lagoon spots this far from the wreck at least. */
  stiltWreckClear: 12,
} as const;
