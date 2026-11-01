/**
 * Research Tide-Lab motion, pure maths over the island's anchors (TASK-534, D-118; no three.js): the
 * submersible's day as a closed form of the culture-clock day seconds, so a frozen capture
 * (`time=9&simt=4`) lands on the exact pose. render/tide-sub.ts draws the hull,
 * render/culture-movers.ts its bubbles.
 */
import { CULTURE_CLOCK } from '../content/cultures/rhythm.ts';
import { RESEARCH_HARBOUR_MOTION as M } from '../content/themes/research-harbour-site.ts';
import { RESEARCH_M31 } from '../content/themes/research-m31.ts';
import type { IslandData, XZ } from '../world/types.ts';
import { anchorPoints } from '../world/gen/plans/research-anchors.ts';

export interface SubPath {
  pts: readonly XZ[];
  /** Arc length at each point (0 = the mooring). */
  arcs: readonly number[];
  len: number;
  /** The moored heading (the pier heading, rad, xz). */
  home: number;
  /** World y of the bed at the dive point. */
  bed: number;
}

export type SubPhase = 'moored' | 'out' | 'sink' | 'down' | 'rise' | 'home' | 'turn';

export interface SubPose {
  x: number;
  z: number;
  /** Heading (rad, xz: (cos, sin) = the hull's local +z). */
  heading: number;
  /** Keel world y (surfaced: −waterline). */
  y: number;
  pitch: number;
  phase: SubPhase;
}

/** The sub's path of an island, null without one. */
export function subPathOf(isl: IslandData): SubPath | null {
  const pts = anchorPoints(isl, 'subPath');
  const moor = isl.anchors.subMooring;
  const dive = isl.anchors.subDive;
  if (pts.length < 2 || !moor || !dive) return null;
  const arcs = [0];
  for (let k = 1; k < pts.length; k++)
    arcs.push(arcs[k - 1] + Math.hypot(pts[k].x - pts[k - 1].x, pts[k].z - pts[k - 1].z));
  return { pts, arcs, len: arcs[arcs.length - 1], home: moor.rotY, bed: dive.y ?? -3.2 };
}

/** Smooth 0 → 1 with zero speed at both ends (mean speed 1). */
const ease = (x: number): number => x - Math.sin(2 * Math.PI * x) / (2 * Math.PI);
const smooth = (x: number): number => {
  const c = Math.min(1, Math.max(0, x));
  return c * c * (3 - 2 * c);
};
/** Shortest turn from angle `a` to `b`, `k` of the way. */
function turn(a: number, b: number, k: number): number {
  let d = (b - a) % (2 * Math.PI);
  if (d > Math.PI) d -= 2 * Math.PI;
  if (d < -Math.PI) d += 2 * Math.PI;
  return a + d * k;
}

function at(P: SubPath, s: number, out: { x: number; z: number; heading: number }): void {
  let k = 0;
  while (k < P.pts.length - 2 && P.arcs[k + 1] < s) k++;
  const a = P.pts[k];
  const b = P.pts[k + 1];
  const l = Math.max(1e-6, P.arcs[k + 1] - P.arcs[k]);
  const t = Math.min(1, Math.max(0, (s - P.arcs[k]) / l));
  out.x = a.x + (b.x - a.x) * t;
  out.z = a.z + (b.z - a.z) * t;
  // the tangent, half way to the neighbour segment's at each vertex: no snap
  const seg = (j: number): number => {
    const q = P.pts[Math.max(0, Math.min(j, P.pts.length - 2))];
    const r = P.pts[Math.max(1, Math.min(j + 1, P.pts.length - 1))];
    return Math.atan2(r.z - q.z, r.x - q.x);
  };
  const h = seg(k);
  out.heading =
    t < 0.5
      ? turn(seg(k - 1), h, 0.5 + 0.5 * smooth(t * 2))
      : turn(h, seg(k + 1), 0.5 * smooth((t - 0.5) * 2));
}

const SPH = CULTURE_CLOCK.secondsPerHour;
const WATERLINE = RESEARCH_M31.sub.waterline;

/** Day seconds of the dive / the surfacing; the cruise's length in seconds. */
export const diveAt = (): number => M.sub.diveHour * SPH;
export const surfaceAt = (): number => M.sub.surfaceHour * SPH;
export const cruiseS = (P: SubPath): number => P.len / M.sub.speed;

/** True while the hull lies on the bottom or is on its way down / up there (bubbles). */
export function subBelow(day: number): boolean {
  return day >= diveAt() && day < surfaceAt() + M.sub.sink;
}

/** Pose at culture-clock day seconds `day` (wraps at 24 h). */
export function subPose(P: SubPath, day: number, out: SubPose): SubPose {
  const S = M.sub;
  const D = ((day % (24 * SPH)) + 24 * SPH) % (24 * SPH);
  const dive = diveAt();
  const up = surfaceAt();
  const dur = cruiseS(P);
  const leave = dive - dur;
  const floatY = -WATERLINE;
  const downY = Math.min(P.bed + S.keel, floatY);
  out.pitch = 0;
  out.y = floatY;
  if (D < leave || D >= up + S.sink + dur + S.dockTurn) {
    at(P, 0, out);
    out.heading = P.home;
    out.phase = 'moored';
  } else if (D < dive) {
    const s = P.len * ease((D - leave) / dur);
    at(P, s, out);
    // swings off its bow-out mooring heading onto the path
    out.heading = turn(P.home, out.heading, smooth(s / S.swing));
    out.phase = 'out';
  } else if (D < up) {
    at(P, P.len, out);
    const u = D - dive;
    if (u < S.sink) {
      out.y = floatY + (downY - floatY) * smooth(u / S.sink);
      out.pitch = S.pitch * Math.sin((u / S.sink) * Math.PI);
      out.phase = 'sink';
    } else {
      out.y = downY;
      out.phase = 'down';
    }
  } else if (D < up + S.sink) {
    at(P, P.len, out);
    const u = (D - up) / S.sink;
    out.y = downY + (floatY - downY) * smooth(u);
    out.pitch = -S.pitch * Math.sin(u * Math.PI);
    // pivots back toward home as it comes up
    out.heading = turn(out.heading, out.heading + Math.PI, smooth(u));
    out.phase = 'rise';
  } else if (D < up + S.sink + dur) {
    at(P, P.len * (1 - ease((D - up - S.sink) / dur)), out);
    out.heading += Math.PI;
    out.phase = 'home';
  } else {
    at(P, 0, out);
    out.heading = turn(out.heading + Math.PI, P.home, smooth((D - up - S.sink - dur) / S.dockTurn));
    out.phase = 'turn';
  }
  return out;
}

export const newSubPose = (): SubPose => ({
  x: 0,
  z: 0,
  heading: 0,
  y: 0,
  pitch: 0,
  phase: 'moored',
});
