import { createRng } from '../core/rng.ts';
import { bush, cropRow, flower, grassTuft, haybale, lilyPad, reeds, rockCluster } from './small.ts';
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
