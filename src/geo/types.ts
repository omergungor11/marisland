import type * as THREE from 'three';
import type { Rng } from '../core/rng.ts';

/** 0 = full (T1-T3), 1 = far/T0 proxy (<= 30 % of the triangles). */
export type Lod = 0 | 1;
export interface BuildOpts {
  rng: Rng;
  lod: Lod;
  /** 0..variants-1 */
  variant: number;
}
export type PropBuilder = (o: BuildOpts) => THREE.BufferGeometry;
export interface PropGeoDef {
  id: string;
  variants: number;
  build: PropBuilder;
  /** Radius in u. */
  footprint: number;
  /** Nominal height in u. */
  height: number;
  /** Optional per-variant nominal heights (size classes). */
  heights?: readonly number[];
  windy: boolean;
  /**
   * LOD1 of variant `k` is built as variant `lod1Of[k]` (identical far geometry, M19 B2: a culture
   * variant such as hqAnnex 2 adds no new LOD1 look).
   */
  lod1Of?: Readonly<Record<number, number>>;
  /**
   * Build under another def's rng stream (`createRng(seed).fork('geo', v).fork(rngAs)`): a companion
   * def (M22 `fairyWreath`) reads the very tree / mast of the def it dresses.
   */
  rngAs?: string;
}
