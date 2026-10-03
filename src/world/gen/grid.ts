import { CELL_SIZE, GRID_N, WORLD_SIZE } from '../types.ts';

/** World x/z of grid sample (0, 0). */
export const GRID_ORIGIN = -WORLD_SIZE / 2;

export const cellX = (ix: number): number => GRID_ORIGIN + ix * CELL_SIZE;
export const cellZ = (iz: number): number => GRID_ORIGIN + iz * CELL_SIZE;

/** Clamp a world coordinate range to inclusive grid indices. */
export function gridRange(min: number, max: number): [number, number] {
  const a = Math.max(0, Math.ceil((min - GRID_ORIGIN) / CELL_SIZE));
  const b = Math.min(GRID_N - 1, Math.floor((max - GRID_ORIGIN) / CELL_SIZE));
  return [a, b];
}
