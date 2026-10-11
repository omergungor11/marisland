/**
 * Closed-form routes of the DevOps movers (TASK-402; render/movers.ts draws them). Pure maths over
 * world data, no three.js: a cargo ship laps a stadium loop off a pier head (stopping alongside
 * it), an ore train shuttles along a rail line. Every pose is a function of the sim time only.
 */
import { DEVOPS_MOVERS as M } from '../content/themes/devops.ts';
import { heightAt, type Heightfield, type XZ } from '../world/types.ts';

export interface Pose {
  x: number;
  z: number;
  /** Heading (unit, xz): the mover's local +z. */
  hx: number;
  hz: number;
}

/**
 * Stadium loop: near straight from `a` along +t (through the pier-head stop `s0`), a half turn
 * out to sea (+f), the far straight back along −t, a half turn home. Arc length `P`.
 */
export interface Loop {
  a: XZ;
  t: XZ;
  f: XZ;
  len: number;
  r: number;
  P: number;
  s0: number;
}

/** Position + heading at arc length `s` (wrapped) on the loop. */
export function loopPose(L: Loop, s: number): Pose {
  let u = s % L.P;
  if (u < 0) u += L.P;
  const { a, t, f, len, r } = L;
  const at = (k: number, m: number): XZ => ({
    x: a.x + t.x * k + f.x * m,
    z: a.z + t.z * k + f.z * m,
  });
  if (u < len) {
    const p = at(u, 0);
    return { ...p, hx: t.x, hz: t.z };
  }
  u -= len;
  const half = Math.PI * r;
  if (u < half) {
    const th = u / r;
    // centre (len, r): from (len, 0) heading +t round to (len, 2r) heading −t
    const p = at(len + r * Math.sin(th), r - r * Math.cos(th));
    return {
      ...p,
      hx: t.x * Math.cos(th) + f.x * Math.sin(th),
      hz: t.z * Math.cos(th) + f.z * Math.sin(th),
    };
  }
  u -= half;
  if (u < len) {
    const p = at(len - u, 2 * r);
    return { ...p, hx: -t.x, hz: -t.z };
  }
  u -= len;
  const th = u / r;
  // centre (0, r): from (0, 2r) heading −t round to (0, 0) heading +t
  const p = at(-r * Math.sin(th), r + r * Math.cos(th));
  return {
    ...p,
    hx: -t.x * Math.cos(th) - f.x * Math.sin(th),
    hz: -t.z * Math.cos(th) - f.z * Math.sin(th),
  };
}

/** Every sample of the loop (and ± `lateral` across it) at least `depth` deep. */
function wet(h: Heightfield, L: Loop): boolean {
  const S = M.ship;
  for (let s = 0; s < L.P; s += 1.5) {
    const p = loopPose(L, s);
    for (const k of [-S.lateral, 0, S.lateral]) {
      const x = p.x - p.hz * k;
      const z = p.z + p.hx * k;
      if (heightAt(h, x, z) > -S.minDepth) return false;
    }
  }
  return true;
}

/**
 * The ship loop off a pier (`root`, unit `dir` out to sea, `length` u): the near straight runs
 * along the coast `off` u past the pier end, the stop centred on the pier axis; pushed out to
 * sea until it is all water. Null when no loop fits.
 */
export function pierLoop(h: Heightfield, root: XZ, dir: XZ, length: number): Loop | null {
  const S = M.ship;
  const t = { x: -dir.z, z: dir.x };
  for (const len of [S.straight, S.straight * 0.65])
    for (let k = 0; k < S.tries; k++) {
      const d = length + S.off + k * S.push;
      const a = {
        x: root.x + dir.x * d - (t.x * len) / 2,
        z: root.z + dir.z * d - (t.z * len) / 2,
      };
      const L: Loop = {
        a,
        t,
        f: dir,
        len,
        r: S.turnR,
        P: 2 * len + 2 * Math.PI * S.turnR,
        s0: len / 2,
      };
      if (wet(h, L)) return L;
    }
  return null;
}

/** Smooth 0 → 1 with zero speed at both ends (mean speed 1). */
const ease = (x: number): number => x - Math.sin(2 * Math.PI * x) / (2 * Math.PI);

/** Ship `k` of `n` on loop `L` at `time`: stop at s0 for `dwell`, then one eased lap. */
export function shipPose(L: Loop, time: number, k: number, n: number): Pose {
  const S = M.ship;
  const lap = (L.P / S.speed) * 1.15;
  const T = lap + S.dwell;
  let u = (time + (k * T) / n) % T;
  if (u < 0) u += T;
  const s = u < S.dwell ? L.s0 : L.s0 + L.P * ease((u - S.dwell) / lap);
  return loopPose(L, s);
}

/**
 * Lead car offset along a rail of length `L` at `time`: there and back with a dwell at each end,
 * eased; the train (`cars` × `gap`) stays on the rail. Returns [offset, direction ±1].
 */
export function trainAt(L: number, time: number): [number, number] {
  const Tn = M.train;
  const span = Math.max(0, L - 1.6 - (Tn.cars - 1) * Tn.gap);
  const run = span / Tn.speed;
  const T = 2 * (run + Tn.dwell);
  let u = time % T;
  if (u < 0) u += T;
  const leg = run + Tn.dwell;
  const back = u >= leg;
  const v = back ? u - leg : u;
  const x = v < Tn.dwell || run <= 0 ? 0 : ease((v - Tn.dwell) / run);
  return back ? [0.8 + span * (1 - x), -1] : [0.8 + span * x, 1];
}
