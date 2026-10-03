/**
 * Pure orbit-pose framing (no three, no DOM): project points through an orbit pose and fit a
 * point set into a safe screen rectangle (ARCHITECTURE §6). Deterministic — same inputs, same
 * pose — so capture presets stay pixel-stable.
 *
 * Conventions match `lookFromOrbit` / camera-controls: the camera sits at
 * target + dist · (sin az · cos p, sin p, cos az · cos p), up = +y.
 */

const DEG = Math.PI / 180;

export interface Pt3 {
  x: number;
  y: number;
  z: number;
}

/** An orbit pose: target, distance (u), pitch (deg from horizontal), azimuth (deg). */
export interface Pose {
  tx: number;
  ty: number;
  tz: number;
  dist: number;
  pitch: number;
  az: number;
}

/** Safe area as fractions of the viewport (0 = edge) per side. */
export interface SafeFrac {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface View {
  /** Vertical FOV, degrees. */
  fov: number;
  /** width / height. */
  aspect: number;
}

/** Normalised device coordinates of `p` seen from `pose` (x right, y up, ±1 at the edges). */
export function projectNdc(
  pose: Pose,
  view: View,
  p: Pt3,
  out: { x: number; y: number; depth: number },
): { x: number; y: number; depth: number } {
  const pr = pose.pitch * DEG;
  const a = pose.az * DEG;
  const cp = Math.cos(pr);
  const sp = Math.sin(pr);
  const sa = Math.sin(a);
  const ca = Math.cos(a);
  // camera position
  const cx = pose.tx + sa * cp * pose.dist;
  const cy = pose.ty + sp * pose.dist;
  const cz = pose.tz + ca * cp * pose.dist;
  // basis: forward f = −(sa·cp, sp, ca·cp), right r = (ca, 0, −sa), up u = r × f
  const fx = -sa * cp;
  const fy = -sp;
  const fz = -ca * cp;
  const rx = ca;
  const rz = -sa;
  const ux = -sp * sa; // r × f, with r.y = 0
  const uy = cp;
  const uz = -sp * ca;
  const vx = p.x - cx;
  const vy = p.y - cy;
  const vz = p.z - cz;
  const depth = vx * fx + vy * fy + vz * fz;
  const tv = Math.tan((view.fov * DEG) / 2);
  const th = tv * view.aspect;
  const d = Math.max(depth, 1e-6);
  out.x = (vx * rx + vz * rz) / (d * th);
  out.y = (vx * ux + vy * uy + vz * uz) / (d * tv);
  out.depth = depth;
  return out;
}

export interface FitOptions {
  view: View;
  safe: SafeFrac;
  /** Camera heading (deg, camera-controls azimuth). */
  az: number;
  /** Pitch (deg) as a function of the orbit distance. */
  pitchAt: (dist: number) => number;
  minDist: number;
  maxDist: number;
  /** Target height (the orbit pivot sits on this plane). */
  ty: number;
  /** Starting target (defaults to the points' centroid). */
  start?: { x: number; z: number };
  /**
   * Slide the target to centre the projection (default). Off: the target stays at `start` and
   * only the distance is searched (low pitches, where a slide is a dolly and does not converge).
   */
  slide?: boolean;
}

export interface FitResult extends Pose {
  /** True when every point is inside the safe rectangle. */
  fits: boolean;
}

const _p = { x: 0, y: 0, depth: 0 };

interface Bounds {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  behind: boolean;
}

function bounds(pose: Pose, view: View, pts: readonly Pt3[], near: number): Bounds {
  const b: Bounds = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity, behind: false };
  for (const q of pts) {
    projectNdc(pose, view, q, _p);
    if (_p.depth < near) b.behind = true;
    b.x0 = Math.min(b.x0, _p.x);
    b.x1 = Math.max(b.x1, _p.x);
    b.y0 = Math.min(b.y0, _p.y);
    b.y1 = Math.max(b.y1, _p.y);
  }
  return b;
}

/**
 * Fit `pts` into the safe rectangle: the smallest distance in [minDist, maxDist] at which the
 * centred projection fits (bisection), with the target slid on its plane so the projected
 * bounds sit centred in the safe area. At `maxDist` without a fit the pose is centred anyway.
 */
export function fitOrbit(pts: readonly Pt3[], o: FitOptions): FitResult {
  const { view, safe } = o;
  const sx0 = -1 + 2 * safe.left;
  const sx1 = 1 - 2 * safe.right;
  const sy0 = -1 + 2 * safe.bottom;
  const sy1 = 1 - 2 * safe.top;
  const tv = Math.tan((view.fov * DEG) / 2);
  const th = tv * view.aspect;
  const a = o.az * DEG;
  let start = o.start;
  if (!start) {
    let x = 0;
    let z = 0;
    for (const q of pts) {
      x += q.x;
      z += q.z;
    }
    const n = Math.max(1, pts.length);
    start = { x: x / n, z: z / n };
  }
  const place = (dist: number): { pose: Pose; fits: boolean } => {
    const pitch = o.pitchAt(dist);
    const pose: Pose = { tx: start.x, ty: o.ty, tz: start.z, dist, pitch, az: o.az };
    const sp = Math.max(0.05, Math.sin(pitch * DEG));
    let b = bounds(pose, view, pts, 0.5);
    for (let k = 0; k < (o.slide === false ? 0 : 12); k++) {
      const ex = (b.x0 + b.x1) / 2 - (sx0 + sx1) / 2;
      const ey = (b.y0 + b.y1) / 2 - (sy0 + sy1) / 2;
      if (Math.abs(ex) < 1e-4 && Math.abs(ey) < 1e-4) break;
      // slide right by ex half-widths, forward (away from the camera) by ey half-heights
      const right = ex * dist * th;
      const fwd = (ey * dist * tv) / sp;
      pose.tx += Math.cos(a) * right - Math.sin(a) * fwd;
      pose.tz += -Math.sin(a) * right - Math.cos(a) * fwd;
      b = bounds(pose, view, pts, 0.5);
    }
    const fits =
      !b.behind &&
      (o.slide === false
        ? b.x0 >= sx0 && b.x1 <= sx1 && b.y0 >= sy0 && b.y1 <= sy1
        : b.x1 - b.x0 <= sx1 - sx0 && b.y1 - b.y0 <= sy1 - sy0);
    return { pose, fits };
  };
  const lo = place(o.minDist);
  if (lo.fits || pts.length === 0) return { ...lo.pose, fits: true };
  const hi = place(o.maxDist);
  if (!hi.fits) return { ...hi.pose, fits: false };
  let dLo = o.minDist;
  let dHi = o.maxDist;
  let best = hi.pose;
  for (let i = 0; i < 24 && dHi - dLo > 0.25; i++) {
    const mid = (dLo + dHi) / 2;
    const r = place(mid);
    if (r.fits) {
      dHi = mid;
      best = r.pose;
    } else dLo = mid;
  }
  return { ...best, fits: true };
}

/** Fraction of `pts` inside the full viewport (NDC ±1) and in front of the camera. */
export function fractionInFrame(pose: Pose, view: View, pts: readonly Pt3[]): number {
  if (pts.length === 0) return 1;
  let n = 0;
  for (const q of pts) {
    projectNdc(pose, view, q, _p);
    if (_p.depth > 0 && Math.abs(_p.x) <= 1 && Math.abs(_p.y) <= 1) n++;
  }
  return n / pts.length;
}

/** camera-controls azimuth (deg) that puts the camera on the side `rotY` points to (xz angle). */
export function azimuthToward(rotY: number): number {
  return Math.atan2(Math.cos(rotY), Math.sin(rotY)) / DEG;
}

/** Points on a horizontal circle (overview rings, label anchors). */
export function ringPoints(cx: number, cz: number, r: number, y: number, n: number): Pt3[] {
  const out: Pt3[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    out.push({ x: cx + Math.cos(t) * r, y, z: cz + Math.sin(t) * r });
  }
  return out;
}

/** Pixel insets → viewport fractions (plus an extra `pad` fraction per side). */
export function insetFrac(
  px: { top: number; bottom: number; left: number; right: number },
  width: number,
  height: number,
  pad = 0,
): SafeFrac {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  return {
    top: Math.min(0.45, px.top / h + pad),
    bottom: Math.min(0.45, px.bottom / h + pad),
    left: Math.min(0.45, px.left / w + pad),
    right: Math.min(0.45, px.right / w + pad),
  };
}
