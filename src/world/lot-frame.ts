/**
 * Lot-local frame (content/offices.ts header): +z = the lot's facing (cos rotY, sin rotY),
 * +x = its right hand. Shared by render (settlement-props), geo-aligned desks and life so
 * desks and seats never drift apart. Pure, no three import.
 */
import { heightAt, type Heightfield, type LotData } from './types.ts';

type LotFrame = Pick<LotData, 'x' | 'z' | 'rotY'>;

/** three `rotation.y` that turns a lot-local model (door on +z) to face the lot's rotY. */
export const lotYaw = (lot: LotFrame): number => Math.atan2(Math.cos(lot.rotY), Math.sin(lot.rotY));

/** Lot-local (lx, lz) → world (x, z). */
export function lotLocalToWorld(lot: LotFrame, lx: number, lz: number): { x: number; z: number } {
  const fx = Math.cos(lot.rotY);
  const fz = Math.sin(lot.rotY);
  // right hand = (fz, −fx)
  return { x: lot.x + lx * fz + lz * fx, z: lot.z - lx * fx + lz * fz };
}

/** Lot-local heading (worker looks along (sin face, cos face) locally) → world three rotation.y. */
export const lotFaceToWorldYaw = (lot: LotFrame, face: number): number => lotYaw(lot) + face;

/** World y of a lot building's pivot: stilt huts stand on the sea level, everything else on the ground. */
export const lotPivotY = (lot: Pick<LotData, 'x' | 'z' | 'kind'>, h: Heightfield): number =>
  lot.kind === 'hut' ? 0 : heightAt(h, lot.x, lot.z);
