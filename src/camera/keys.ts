/**
 * Keyboard camera (TASK-565): held keys → per-frame truck / forward / azimuth deltas. Pure math, no
 * DOM; `controls.ts` feeds it `KeyboardEvent.key` values and applies the result.
 */
import { clamp, smoothstep } from '../core/math/index.ts';

export type KeyAction = 'forward' | 'back' | 'left' | 'right' | 'rotateLeft' | 'rotateRight';
/** Action → the `KeyboardEvent.key` values bound to it (single letters match either case). */
export type KeyMap = Readonly<Record<KeyAction, readonly string[]>>;

export interface KeyMoveConfig {
  /** Ground speed (u/s) at `refDistance`; linear with the orbit distance … */
  unitsPerSecond: number;
  refDistance: number;
  /** … the distance factor clamped to [minScale, maxScale]. */
  minScale: number;
  maxScale: number;
  /** Q / E azimuth speed, rad/s. */
  rotateRadPerSecond: number;
  /** Ease-in / ease-out time from rest to full speed and back (smoothstep). */
  rampSeconds: number;
}

/** This frame's move: target truck along camera right (u), along the ground heading (u), azimuth (rad). */
export interface KeyMove {
  truckX: number;
  forward: number;
  azimuth: number;
}

export interface KeyState {
  /** Returns true when the key is bound (the caller may then preventDefault). */
  down(key: string): boolean;
  up(key: string): void;
  /** Release everything (window blur, a modifier went down, focus moved to an input). */
  clear(): void;
  /** Actions held right now. */
  readonly held: ReadonlySet<KeyAction>;
  /** Any key held, or still easing out. */
  readonly active: boolean;
  /** Ramps per axis, −1…1 before easing (internal; exposed for tests). */
  readonly drive: { x: number; z: number; az: number };
  readonly out: KeyMove;
}

const norm = (k: string): string => (k.length === 1 ? k.toLowerCase() : k);

export function createKeyState(map: KeyMap): KeyState {
  const bind = new Map<string, KeyAction>();
  for (const action of Object.keys(map) as KeyAction[]) {
    for (const k of map[action]) bind.set(norm(k), action);
  }
  const held = new Set<KeyAction>();
  const drive = { x: 0, z: 0, az: 0 };
  return {
    down(key) {
      const a = bind.get(norm(key));
      if (!a) return false;
      held.add(a);
      return true;
    },
    up(key) {
      const a = bind.get(norm(key));
      if (a) held.delete(a);
    },
    clear() {
      held.clear();
    },
    held,
    get active() {
      return held.size > 0 || drive.x !== 0 || drive.z !== 0 || drive.az !== 0;
    },
    get drive() {
      return drive;
    },
    out: { truckX: 0, forward: 0, azimuth: 0 },
  };
}

/** Move `v` toward `goal` by at most `step`. */
const toward = (v: number, goal: number, step: number): number =>
  v < goal ? Math.min(goal, v + step) : Math.max(goal, v - step);

/** Signed smoothstep ease of a −1…1 ramp. */
const ease = (v: number): number => Math.sign(v) * smoothstep(0, 1, Math.abs(v));

/**
 * Advance the ramps by `dt` and return this frame's deltas (written into `state.out`, no
 * allocation). Opposite keys cancel; ground speed scales with the orbit `distance`.
 */
export function velocityFor(
  state: KeyState,
  dt: number,
  distance: number,
  cfg: KeyMoveConfig,
): KeyMove {
  const h = state.held;
  const t = Math.min(dt, 0.1);
  const step = cfg.rampSeconds > 0 ? t / cfg.rampSeconds : Infinity;
  const d = state.drive;
  const axis = (pos: KeyAction, neg: KeyAction): number =>
    (h.has(pos) ? 1 : 0) - (h.has(neg) ? 1 : 0);
  d.x = toward(d.x, axis('right', 'left'), step);
  d.z = toward(d.z, axis('forward', 'back'), step);
  d.az = toward(d.az, axis('rotateLeft', 'rotateRight'), step);
  const speed = cfg.unitsPerSecond * clamp(distance / cfg.refDistance, cfg.minScale, cfg.maxScale);
  const o = state.out;
  o.truckX = ease(d.x) * speed * t;
  o.forward = ease(d.z) * speed * t;
  o.azimuth = ease(d.az) * cfg.rotateRadPerSecond * t;
  return o;
}
