/**
 * Brush cursor (phase-2 TASK-212): a ring decal drawn by the terrain material itself
 * (`BRUSH_UNIFORMS.uBrush`, terrain-material.ts (i)) — no mesh, no program, no z-fighting.
 * The pointer is ray-marched against the live heightfield at `EDIT_UI.cursorHz`; the ring radius
 * eases toward the tool radius (instant under reduced motion). Hidden outside edit mode; never
 * created in capture (`freeze=1`), so frozen frames carry no cursor.
 */
import { damp } from '../core/math/index.ts';
import { EDIT_UI } from '../content/edit-ui.ts';
import { BRUSH_UNIFORMS } from '../render/terrain/terrain-material.ts';
import type { EditHit } from './tools.ts';

export interface BrushCursorDeps {
  /** Terrain-only pick at canvas CSS px (`Interaction.terrainAt`). */
  terrainAt(x: number, y: number): { x: number; z: number } | null;
  /** Raw terrain height (below 0 under water). */
  heightAt(x: number, z: number): number;
  reduced(): boolean;
}

export interface BrushCursor {
  /** Pointer at canvas-relative CSS px; `null` = left the canvas. */
  setPointer(x: number, y: number): void;
  clearPointer(): void;
  setVisible(on: boolean): void;
  readonly visible: boolean;
  /** Ring radius (u); eased unless reduced motion. */
  setRadius(r: number, instant?: boolean): void;
  /** Strength 0..1 (ring opacity). */
  setStrength(s: number): void;
  /** Red ring (placement / brush not allowed here). */
  setInvalid(on: boolean): void;
  /** Ray-march now (pointer-down) and return the hit. */
  sample(): EditHit | null;
  /** Last marched hit (null: off the terrain / no pointer). */
  readonly hit: EditHit | null;
  /** Per frame: march at ≤ cursorHz, ease the radius, write `uBrush`. */
  update(dt: number): void;
  /** Hide and reset the shared uniform. */
  dispose(): void;
}

export function createBrushCursor(d: BrushCursorDeps): BrushCursor {
  const u = BRUSH_UNIFORMS.uBrush.value;
  let visible = false;
  let px = 0;
  let py = 0;
  let hasPointer = false;
  let dirty = false;
  let hit: EditHit | null = null;
  let radius: number = EDIT_UI.radius.initial;
  let target = radius;
  let strength: number = EDIT_UI.strength.initial;
  let invalid = false;
  let acc = 0;
  const period = 1 / EDIT_UI.cursorHz;

  const march = (): EditHit | null => {
    dirty = false;
    acc = 0;
    if (!hasPointer) return (hit = null);
    const h = d.terrainAt(px, py);
    hit = h ? { x: h.x, z: h.z, ground: d.heightAt(h.x, h.z), prop: null } : null;
    return hit;
  };

  const write = (): void => {
    if (!visible || !hit) {
      u.w = 0;
      return;
    }
    const s = Math.max(0.01, Math.min(1, strength));
    u.set(hit.x, hit.z, radius, invalid ? -s : s);
  };

  return {
    setPointer(x, y) {
      if (hasPointer && x === px && y === py) return;
      px = x;
      py = y;
      hasPointer = true;
      dirty = true;
    },
    clearPointer() {
      hasPointer = false;
      hit = null;
      write();
    },
    setVisible(on) {
      visible = on;
      if (on) dirty = true;
      write();
    },
    get visible() {
      return visible;
    },
    setRadius(r, instant = false) {
      target = r;
      if (instant || d.reduced() || !visible) radius = r;
    },
    setStrength(s) {
      strength = s;
    },
    setInvalid(on) {
      invalid = on;
    },
    sample() {
      march();
      write();
      return hit;
    },
    get hit() {
      return hit;
    },
    update(dt) {
      if (!visible) return;
      acc += Math.min(dt, 0.1);
      // 60 Hz: march when the pointer moved or the ground under it may have changed (edits)
      if (acc >= period * 0.999) march();
      else if (dirty && acc >= period * 0.5) march();
      radius = d.reduced() ? target : damp(radius, target, EDIT_UI.cursorRadiusLambda, dt);
      if (Math.abs(radius - target) < 1e-3) radius = target;
      write();
    },
    dispose() {
      visible = false;
      hit = null;
      u.set(0, 0, 0, 0);
    },
  };
}
