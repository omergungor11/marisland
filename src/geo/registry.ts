import { createRng } from '../core/rng.ts';
import { bush, cropRow, flower, grassTuft, haybale, lilyPad, reeds, rockCluster } from './small.ts';
import {
  barn,
  cottage,
  logCabin,
  marketStall,
  stiltHut,
  towerHouse,
  windmill,
} from './buildings.ts';
import {
  buoy,
  dock,
  driftwood,
  messageBottle,
  rowboat,
  sailboat,
  seaStack,
  shell,
  starfish,
  tidePool,
} from './coastal.ts';
import {
  barrel,
  bench,
  bunting,
  crate,
  fence,
  lanternPost,
  laundryLine,
  steppingStone,
  well,
} from './decor.ts';
import {
  clocktower,
  giantTree,
  hotSpring,
  lighthouse,
  sunkenShip,
  volcanoCrater,
} from './landmarks.ts';
import { giantMushroom, palm, pine, roundTree, treeBlob } from './trees.ts';
import type { Lod, PropGeoDef } from './types.ts';
import type * as THREE from 'three';

const defs: PropGeoDef[] = [
  { id: 'palm', variants: 3, build: palm, footprint: 3, height: 6, windy: true },
  { id: 'roundTree', variants: 3, build: roundTree, footprint: 2, height: 5, windy: true },
  { id: 'pine', variants: 3, build: pine, footprint: 1.8, height: 7, windy: true },
  {
    id: 'giantMushroom',
    variants: 2,
    build: giantMushroom,
    footprint: 1.1,
    height: 2,
    windy: false,
  },
  { id: 'bush', variants: 2, build: bush, footprint: 0.8, height: 1, windy: true },
  { id: 'cropRow', variants: 2, build: cropRow, footprint: 1.05, height: 0.4, windy: true },
  {
    id: 'haybale',
    variants: 2,
    build: haybale,
    footprint: 0.7,
    height: 1.2,
    windy: false,
    heights: [1, 1.2],
  },
  { id: 'reeds', variants: 2, build: reeds, footprint: 0.3, height: 0.9, windy: true },
  {
    id: 'lilyPad',
    variants: 2,
    build: lilyPad,
    footprint: 0.45,
    height: 0.2,
    heights: [0.04, 0.2],
    windy: false,
  },
  { id: 'grassTuft', variants: 2, build: grassTuft, footprint: 0.15, height: 0.3, windy: true },
  { id: 'flower', variants: 2, build: flower, footprint: 0.1, height: 0.25, windy: true },
  {
    id: 'rockCluster',
    variants: 3,
    build: rockCluster,
    footprint: 2.4,
    height: 1,
    heights: [0.35, 0.9, 1.95],
    windy: false,
  },
  { id: 'treeBlob', variants: 3, build: treeBlob, footprint: 1.8, height: 5, windy: true },
];

const D = (
  id: string,
  variants: number,
  build: PropGeoDef['build'],
  footprint: number,
  height: number,
  windy = false,
  heights?: readonly number[],
): PropGeoDef => ({
  id,
  variants,
  build,
  footprint,
  height,
  windy,
  ...(heights ? { heights } : {}),
});

defs.push(
  // buildings
  D('cottage', 3, cottage, 2.2, 3.7),
  D('stiltHut', 2, stiltHut, 2.4, 4.6),
  D('towerHouse', 3, towerHouse, 2.1, 6),
  D('windmill', 2, windmill, 2.4, 9.9),
  D('barn', 2, barn, 3.6, 4.6),
  D('logCabin', 2, logCabin, 2.6, 3.9),
  D('marketStall', 3, marketStall, 1.4, 2.4),
  // coastal
  D('dock', 2, dock, 1.2, 0.95),
  D('rowboat', 2, rowboat, 1.3, 0.6),
  D('sailboat', 2, sailboat, 2.8, 5.2, true),
  D('seaStack', 3, seaStack, 3, 10, false, [6, 10, 15]),
  D('buoy', 2, buoy, 0.4, 0.85),
  D('driftwood', 2, driftwood, 0.9, 0.4),
  D('tidePool', 2, tidePool, 1.2, 0.45),
  D('shell', 3, shell, 0.15, 0.15),
  D('starfish', 3, starfish, 0.15, 0.04),
  D('messageBottle', 1, messageBottle, 0.2, 0.12),
  // decor
  D('fence', 2, fence, 0.9, 0.8),
  D('lanternPost', 3, lanternPost, 0.5, 2.3),
  D('laundryLine', 3, laundryLine, 2.1, 2.0, true),
  D('bunting', 3, bunting, 3.1, 2.6, true),
  D('bench', 2, bench, 0.8, 0.8),
  D('barrel', 2, barrel, 0.3, 0.6),
  D('crate', 2, crate, 0.45, 0.6, false, [0.6, 0.48]),
  D('well', 2, well, 1.1, 1.8),
  D('steppingStone', 3, steppingStone, 0.3, 0.1),
  // landmarks
  D('lighthouse', 2, lighthouse, 2.6, 13.2),
  D('clocktower', 2, clocktower, 2.0, 11.2),
  D('giantTree', 2, giantTree, 4.5, 18.5, true),
  D('sunkenShip', 2, sunkenShip, 5.5, 6),
  D('hotSpring', 1, hotSpring, 3.5, 1),
  D('volcanoCrater', 1, volcanoCrater, 5.4, 0.34),
);

export const PROP_GEO: Record<string, PropGeoDef> = Object.fromEntries(defs.map((d) => [d.id, d]));

export function buildProp(
  id: string,
  seed: number,
  variant: number,
  lod: Lod,
): THREE.BufferGeometry {
  const def = PROP_GEO[id];
  if (!def) throw new Error(`unknown prop geo: ${id}`);
  const rng = createRng(seed).fork('geo', variant).fork(id);
  return def.build({ rng, lod, variant });
}
