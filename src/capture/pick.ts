import * as THREE from 'three';
import { THEME_IDS, type ThemeId } from '../world/types.ts';

/**
 * `?pick=` (TASK-650): capture-only click script, so an info card that opens from a pick can be shot
 * in headless QA (a pointer event never reaches a frozen page). `ship:<theme>` clicks the courier
 * ship of that island at its projected pick sphere, `<x>,<y>` clicks canvas-relative CSS pixels.
 * The click goes through the real pick path (`interaction.clickAt`: ray, picker, reaction,
 * `picked` event), so a ship the ray misses opens nothing. Honoured only with `freeze=1`.
 */
export type PickSpec = { kind: 'ship'; theme: ThemeId } | { kind: 'xy'; x: number; y: number };

export function parsePick(raw: string | null | undefined): PickSpec | null {
  if (!raw) return null;
  if (raw.startsWith('ship:')) {
    const theme = THEME_IDS.find((t) => t === raw.slice(5));
    return theme ? { kind: 'ship', theme } : null;
  }
  const m = /^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/.exec(raw);
  return m ? { kind: 'xy', x: Number(m[1]), y: Number(m[2]) } : null;
}

/** What `capturePick` needs of the courier kind (`Couriers.positions`: x, y, z, r per active ship). */
export interface PickShips {
  positions(out: Float32Array, ids?: Uint16Array): number;
}

/** Canvas-relative CSS px of a world point, or null behind the camera / outside the canvas. */
export function projectPx(
  p: THREE.Vector3,
  camera: THREE.PerspectiveCamera,
  width: number,
  height: number,
): { x: number; y: number } | null {
  camera.updateMatrixWorld();
  const v = p.clone().project(camera);
  if (v.z > 1 || Math.abs(v.x) > 1 || Math.abs(v.y) > 1) return null;
  return { x: ((v.x + 1) / 2) * width, y: ((1 - v.y) / 2) * height };
}

/** The click point of a spec (null: the ship is not drawn / not in view). */
export function pickPoint(
  spec: PickSpec,
  ships: PickShips | null,
  camera: THREE.PerspectiveCamera,
  width: number,
  height: number,
): { x: number; y: number } | null {
  if (spec.kind === 'xy') return { x: spec.x, y: spec.y };
  if (!ships) return null;
  const out = new Float32Array(THEME_IDS.length * 4);
  const ids = new Uint16Array(THEME_IDS.length);
  const n = ships.positions(out, ids);
  for (let k = 0; k < n; k++) {
    if (THEME_IDS[ids[k]] !== spec.theme) continue;
    const at = new THREE.Vector3(out[k * 4], out[k * 4 + 1], out[k * 4 + 2]);
    return projectPx(at, camera, width, height);
  }
  return null;
}

/** Click the spec; returns the pick result (null when nothing was hit or the point is off screen). */
export function capturePick(
  spec: PickSpec,
  click: (x: number, y: number) => unknown,
  ships: PickShips | null,
  camera: THREE.PerspectiveCamera,
  canvas: HTMLCanvasElement,
): unknown {
  const at = pickPoint(spec, ships, camera, canvas.clientWidth, canvas.clientHeight);
  return at ? click(at.x, at.y) : null;
}
