import * as THREE from 'three';
import type { Rng } from '../core/rng.ts';
import { CLICK_SPARKLE, HOVER, REACTION, type ReactionSpec } from '../content/anim.ts';
import type { BurstAnchor, Bursts } from '../render/particles/bursts.ts';
import { startReaction, stepReaction, type ReactionState } from './reaction-pose.ts';

/**
 * Click reactions (ARCHITECTURE §5): only the clicked instance's matrix animates. Props are
 * static — their base matrix is saved on the first click, the one slot is rewritten each frame
 * (partial buffer upload) and restored on the last. Agents rewrite their own matrix every frame,
 * so the reaction composes on top of whatever the agent just wrote (run this after `life.update`).
 * Under reduced motion a reaction is a 300 ms tint (`flash`), no matrix, no particles.
 */
export interface ReactionTarget {
  /** One mesh per LOD for props, the kind's mesh for agents. */
  meshes: readonly THREE.InstancedMesh[];
  slot: number;
  /** True for agents (matrix rewritten every frame by the sim). */
  dynamic: boolean;
}

export interface Flash {
  target: ReactionTarget;
  /** 0..1 fade of the tint. */
  strength: number;
}

export interface ReactionDeps {
  bursts: Bursts | null;
  /** Click-order RNG root (label-forked per burst → deterministic). */
  rng: Rng;
  /** Engine clock, s. */
  time(): number;
  /** Horizontal unit view direction (the lean axis, so a wobble reads side to side on screen). */
  viewAxis(out: THREE.Vector3): void;
}

export interface Reactions {
  trigger(
    key: string,
    spec: ReactionSpec,
    target: ReactionTarget,
    anchor: BurstAnchor,
    reduced: boolean,
  ): void;
  /** Advance and write the animated matrices. */
  update(dt: number): void;
  /** Reduced-motion tint in progress (latest click), or null. */
  readonly flash: Flash | null;
  readonly active: number;
  /** Restore every animated instance. */
  clear(): void;
}

interface Active {
  key: string;
  target: ReactionTarget;
  state: ReactionState;
  axis: THREE.Vector3;
  /** Saved base matrix (static targets). */
  saved: Float32Array | null;
}

const _base = new THREE.Matrix4();
const _out = new THREE.Matrix4();
const _loc = new THREE.Matrix4();
const _rot = new THREE.Matrix4();
const _tp = new THREE.Matrix4();
const _tn = new THREE.Matrix4();
const _lift = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _s = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

export function createReactions(d: ReactionDeps): Reactions {
  const active = new Map<string, Active>();
  let clicks = 0;
  let flash: { target: ReactionTarget; t: number } | null = null;

  const slotArray = (m: THREE.InstancedMesh): Float32Array =>
    m.instanceMatrix.array as Float32Array;

  const write = (a: Active, m: THREE.Matrix4): void => {
    const t = a.target;
    for (const mesh of t.meshes) {
      m.toArray(slotArray(mesh), t.slot * 16);
      if (!t.dynamic) {
        // static props: upload only this slot (agent meshes upload whole every frame)
        mesh.instanceMatrix.addUpdateRange(t.slot * 16, 16);
        mesh.instanceMatrix.needsUpdate = true;
      }
    }
  };

  const restore = (a: Active): void => {
    if (!a.saved) return;
    _base.fromArray(a.saved);
    write(a, _base);
  };

  const compose = (a: Active): void => {
    const t = a.target;
    if (t.dynamic) _base.fromArray(slotArray(t.meshes[0]), t.slot * 16);
    else _base.fromArray(a.saved!);
    const pose = a.state.pose;
    _p.setFromMatrixPosition(_base);
    // lean about the click-time axis through the instance's foot
    _q.setFromAxisAngle(a.axis, pose.tilt);
    _rot.makeRotationFromQuaternion(_q);
    _tp.makeTranslation(_p.x, _p.y, _p.z);
    _tn.makeTranslation(-_p.x, -_p.y, -_p.z);
    _out.copy(_tp).multiply(_rot).multiply(_tn).multiply(_base);
    // local yaw + squash/stretch, then lift in world space
    _q.setFromAxisAngle(_up, pose.yaw);
    _s.set(pose.sxz, pose.sy, pose.sxz);
    _loc.compose(_p.set(0, 0, 0), _q, _s);
    _out.multiply(_loc);
    _lift.makeTranslation(0, pose.lift, 0);
    _out.premultiply(_lift);
    write(a, _out);
  };

  return {
    get flash(): Flash | null {
      if (!flash) return null;
      const f = 1 - flash.t / (HOVER.flashMs / 1000);
      return f > 0 ? { target: flash.target, strength: f } : null;
    },
    get active(): number {
      return active.size;
    },
    trigger(key, spec, target, anchor, reduced) {
      if (reduced) {
        flash = { target, t: 0 };
        return;
      }
      const click = clicks++;
      d.viewAxis(_axis);
      const prev = active.get(key);
      if (prev) {
        // re-click restarts in place (never stacks); the saved base stays the original pose
        startReaction(spec, prev.state);
        prev.axis.copy(_axis);
      } else {
        if (active.size >= REACTION.maxActive) {
          const oldest = active.keys().next().value as string;
          const old = active.get(oldest)!;
          restore(old);
          active.delete(oldest);
        }
        const saved = target.dynamic ? null : new Float32Array(16);
        if (saved) _base.fromArray(slotArray(target.meshes[0]), target.slot * 16).toArray(saved);
        active.set(key, {
          key,
          target,
          state: startReaction(spec),
          axis: _axis.clone(),
          saved,
        });
      }
      if (d.bursts) {
        const rng = d.rng.fork('burst', click);
        const t = d.time();
        d.bursts.emit(CLICK_SPARKLE, anchor, t, rng.fork('sparkle'));
        spec.bursts.forEach((b, i) => d.bursts!.emit(b, anchor, t, rng.fork('b', i)));
      }
    },
    update(dt) {
      if (flash) {
        flash.t += Math.min(dt, 0.1);
        if (flash.t >= HOVER.flashMs / 1000) flash = null;
      }
      for (const a of active.values()) {
        stepReaction(a.state, dt);
        if (a.state.done) {
          restore(a);
          active.delete(a.key);
        } else compose(a);
      }
    },
    clear() {
      for (const a of active.values()) restore(a);
      active.clear();
      flash = null;
    },
  };
}
