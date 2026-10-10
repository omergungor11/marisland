/**
 * Preset poses (ARCHITECTURE §6): overview fit, island / hero, village and dock framing, and the
 * pitch band the user can reach. Pure — no three, no DOM — so tests compute exactly the poses the
 * app applies.
 */
import { CAMERA, CAMERA_MOVE, TIERS } from '../content/tiers.ts';
import { FRAMING, type SafeInsets } from '../content/camera.ts';
import { pitchForDistance } from '../detail/tier.ts';
import { THEMES, THEME_BY_ARCHETYPE } from '../content/themes.ts';
import type { ArchetypeId, ThemeId } from '../world/types.ts';
import type { CameraFrame } from './frames.ts';
import {
  azimuthToward,
  fitOrbit,
  insetFrac,
  ringPoints,
  type Pose,
  type Pt3,
  type View,
} from './framing.ts';

const DEG = Math.PI / 180;
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** What the camera needs from the world: bounds, island anchors and the ground height. */
export interface CameraWorld {
  centerX: number;
  centerZ: number;
  /** Radius of the archipelago for the target clamp. */
  radius: number;
  islands: Array<{
    name: string;
    archetypeName?: string;
    /** Department theme (Phase 3, D-024); see `themeOf` for the archetype fallback. */
    theme?: ThemeId;
    cx: number;
    cz: number;
    radius: number;
    /** Land reach (every land cell within it of the centre); defaults to radius × 1.4. */
    reach?: number;
    peakX?: number;
    peakY: number;
    peakZ?: number;
    anchors: Record<string, { x: number; z: number; rotY: number }>;
    /** Settlement framing for `village` / `dock` (from the settlement pipeline). */
    frames?: { village?: CameraFrame; dock?: CameraFrame };
  }>;
  heightAt(x: number, z: number): number;
}

export type CameraIsland = CameraWorld['islands'][number];

/** Viewport in CSS px plus the HUD-dependent safe margins. */
export interface Viewport {
  width: number;
  height: number;
  insets: SafeInsets;
}

export const reachOf = (i: CameraIsland): number => i.reach ?? i.radius * 1.4;

/** The island's department: `theme`, else derived from the archetype display name ('Beacon Rock' → beaconrock). */
export function themeOf(i: CameraIsland): ThemeId | undefined {
  if (i.theme) return i.theme;
  const id = (i.archetypeName ?? '').toLowerCase().replace(/\s+/g, '');
  return Object.hasOwn(THEME_BY_ARCHETYPE, id) ? THEME_BY_ARCHETYPE[id as ArchetypeId] : undefined;
}

/** Island by name, archetype name, theme id or theme display name (`cam=island:coding`); '' = the first. */
export function findIsland(world: CameraWorld, name: string): CameraIsland | undefined {
  const norm = (v: string | undefined): string => (v ?? '').toLowerCase().replace(/\s+/g, '');
  const n = norm(name);
  return (
    world.islands.find((i) => norm(i.name) === n) ??
    world.islands.find((i) => norm(i.archetypeName) === n) ??
    world.islands.find((i) => {
      const t = themeOf(i);
      return t !== undefined && (t === n || norm(THEMES[t].displayName) === n);
    }) ??
    (n === '' ? world.islands[0] : undefined)
  );
}

/**
 * Allowed pitch (deg from horizontal) at an orbit distance: the pitch curve ± slack, widened at
 * T0 down to the tier's `pitchMin` (ART_BIBLE §6: T0 58–70°) so the overview default is a
 * reachable pose, and at macro distances down to `FRAMING.lowBand.pitch` so the hero (horizon)
 * framing is reachable — the first drag never snaps.
 */
export function pitchBand(dist: number): [number, number] {
  const curve = pitchForDistance(dist);
  let lo = curve - CAMERA.pitchSlack;
  if (dist >= TIERS[0].minDist) lo = Math.min(lo, TIERS[0].pitchMin);
  const lb = FRAMING.lowBand;
  const t = clamp(
    (Math.log(Math.max(dist, 1e-3)) - Math.log(lb.fullAt)) /
      (Math.log(lb.blendTo) - Math.log(lb.fullAt)),
    0,
    1,
  );
  lo = Math.min(lo, lb.pitch + (lo - lb.pitch) * t);
  // far out: down to the postcard look-down (TASK-392), blended in over [blendTo, fullAt]
  const pb = FRAMING.postcard.band;
  const u = clamp(
    (Math.log(Math.max(dist, 1e-3)) - Math.log(pb.blendTo)) /
      (Math.log(pb.fullAt) - Math.log(pb.blendTo)),
    0,
    1,
  );
  lo = Math.min(lo, lo + (pb.pitch - lo) * u);
  return [lo, curve + CAMERA.pitchSlack];
}

/**
 * Postcard fit points: every island's land outline at sea level, an inner ring at the terrain
 * height (cliff tops), the peak and the landmark tops — all measured on the world, so raised
 * islands raise the fit.
 */
export function postcardPoints(world: CameraWorld): Pt3[] {
  const P = FRAMING.postcard;
  const pts: Pt3[] = [];
  for (const i of world.islands) {
    const reach = reachOf(i);
    pts.push(...ringPoints(i.cx, i.cz, reach, 0, P.ringSamples));
    for (const q of ringPoints(i.cx, i.cz, reach * P.innerRing, 0, P.ringSamples))
      pts.push({ x: q.x, y: Math.max(0, world.heightAt(q.x, q.z)), z: q.z });
    pts.push({ x: i.peakX ?? i.cx, y: i.peakY, z: i.peakZ ?? i.cz });
    const theme = themeOf(i);
    if (!theme) continue;
    for (const [key, lm] of Object.entries(THEMES[theme].landmarks)) {
      const a = i.anchors[key];
      const top = P.landmarkTop[lm.kind];
      if (!a || top === undefined) continue;
      pts.push({ x: a.x, y: Math.max(0, world.heightAt(a.x, a.z)) + top, z: a.z });
    }
  }
  return pts;
}

/** Bisection for the root of a decreasing function on [lo, hi]. */
function solveDecreasing(f: (x: number) => number, lo: number, hi: number, iters = 48): number {
  for (let k = 0; k < iters; k++) {
    const mid = (lo + hi) / 2;
    if (f(mid) > 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * Postcard (TASK-392): the low 3/4 look the intro ends on. The look-down is fixed by the horizon
 * height (`FRAMING.postcard.horizon`); the camera height is the smallest at which the whole
 * archipelago (land, cliffs, peaks, landmark tops) fits the safe width with its nearest shore on
 * the bottom safe edge and its highest far point under the horizon band. The orbit target is the
 * point of the view ray nearest the archipelago centre (≤ `maxTargetY`), so the idle orbit and
 * zoom pivot over the islands. Portrait screens (and an empty world) get the overview: fitting
 * the archipelago's width under a fixed horizon there puts the camera so high and far back that
 * the islands shrink to a strip.
 */
export function postcardPose(world: CameraWorld, view: View, vp: Viewport): Pose {
  const P = FRAMING.postcard;
  const pts = postcardPoints(world);
  if (pts.length === 0 || view.aspect < P.minAspect) return overviewPose(world, view, vp);
  const tv = Math.tan((view.fov * DEG) / 2);
  const th = tv * view.aspect;
  const pitch = Math.atan(P.horizon * tv) / DEG;
  const sp = Math.sin(pitch * DEG);
  const cp = Math.cos(pitch * DEG);
  const a = P.azimuthDeg * DEG;
  // horizontal view direction u (camera → target) and screen right r
  const ux = -Math.sin(a);
  const uz = -Math.cos(a);
  const rx = Math.cos(a);
  const rz = -Math.sin(a);
  const safe = insetFrac(vp.insets, vp.width, vp.height, P.pad);
  const sx0 = -1 + 2 * safe.left;
  const sx1 = 1 - 2 * safe.right;
  const sy0 = -1 + 2 * safe.bottom;
  const yTop = Math.min(1 - 2 * safe.top, P.horizon - P.horizonGap);
  const along0 = pts.map((q) => q.x * ux + q.z * uz);
  const lat0 = pts.map((q) => q.x * rx + q.z * rz);
  let minA = Infinity;
  let maxA = -Infinity;
  let minL = Infinity;
  let maxL = -Infinity;
  for (let k = 0; k < pts.length; k++) {
    minA = Math.min(minA, along0[k]);
    maxA = Math.max(maxA, along0[k]);
    minL = Math.min(minL, lat0[k]);
    maxL = Math.max(maxL, lat0[k]);
  }
  const span = Math.max(maxA - minA, maxL - minL, 1);

  /** Camera at height h, `ca` along u and `cl` along r: projected bounds. */
  const project = (h: number, ca: number, cl: number) => {
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (let k = 0; k < pts.length; k++) {
      const al = along0[k] - ca;
      const dy = pts[k].y - h;
      const depth = Math.max(al * cp - dy * sp, 1e-6);
      const y = (al * sp + dy * cp) / (depth * tv);
      const x = (lat0[k] - cl) / (depth * th);
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
    return { x0, x1, y0, y1 };
  };
  /** At height h: slide along u until the lowest point sits on the bottom edge, then centre x. */
  const place = (h: number) => {
    // farthest forward the camera may go with every point ≥ 1 u in front of it
    let caMax = Infinity;
    for (let k = 0; k < pts.length; k++)
      caMax = Math.min(caMax, along0[k] - (1 + (pts[k].y - h) * sp) / cp);
    const ca = solveDecreasing((c) => project(h, c, 0).y0 - sy0, caMax - 8 * span - 8 * h, caMax);
    const xc = (sx0 + sx1) / 2;
    const cl = solveDecreasing(
      (c) => {
        const b = project(h, ca, c);
        return (b.x0 + b.x1) / 2 - xc;
      },
      minL - 4 * span,
      maxL + 4 * span,
    );
    const b = project(h, ca, cl);
    return { ca, cl, fits: b.x1 - b.x0 <= sx1 - sx0 && b.y1 <= yTop };
  };
  let hLo: number = P.minHeight;
  let hHi: number = P.maxHeight;
  let best = place(hHi);
  if (place(hLo).fits) {
    hHi = hLo;
    best = place(hLo);
  } else
    for (let k = 0; k < 28 && hHi - hLo > 0.25; k++) {
      const mid = (hLo + hHi) / 2;
      const r = place(mid);
      if (r.fits) {
        hHi = mid;
        best = r;
      } else hLo = mid;
    }
  const h = hHi;
  const camX = best.ca * ux + best.cl * rx;
  const camZ = best.ca * uz + best.cl * rz;
  // orbit target: the view-ray point over the archipelago centre, kept in [0, maxTargetY]
  let s = ((world.centerX - camX) * ux + (world.centerZ - camZ) * uz) / cp;
  s = clamp(s, (h - P.maxTargetY) / sp, h / sp);
  return {
    tx: camX + ux * cp * s,
    ty: h - sp * s,
    tz: camZ + uz * cp * s,
    dist: s,
    pitch,
    az: P.azimuthDeg,
  };
}

/**
 * T0 default (D2): the smallest distance (≥ the bible's 450 u) at which every island's whole
 * shallow ring and peak sit inside the safe area (HUD dock + label row excluded), with the target
 * slid so the archipelago is centred in that area. Portrait screens fit the width.
 */
export function overviewPose(world: CameraWorld, view: View, vp: Viewport): Pose {
  const o = CAMERA.overview;
  const f = FRAMING.overview;
  const pts: Pt3[] = [];
  for (const i of world.islands) {
    pts.push(...ringPoints(i.cx, i.cz, reachOf(i) + f.ringPad, 0, f.ringSamples));
    pts.push({ x: i.peakX ?? i.cx, y: i.peakY, z: i.peakZ ?? i.cz });
  }
  if (pts.length === 0) pts.push(...ringPoints(world.centerX, world.centerZ, world.radius, 0, 8));
  // fixed overview pitch, kept inside the band (≥ 380 u the band reaches down to 58°)
  const pitchAt = (d: number): number => {
    const [lo, hi] = pitchBand(d);
    return clamp(o.pitch, lo, hi);
  };
  return fitOrbit(pts, {
    view,
    safe: insetFrac(vp.insets, vp.width, vp.height),
    az: o.azimuthDeg,
    pitchAt,
    minDist: o.dist,
    maxDist: f.maxDist,
    ty: 0,
    start: { x: world.centerX, z: world.centerZ },
  });
}

/**
 * Tiny islands with a tall landmark (Lonely Palm) get the low hero framing (D13). Only generated
 * islands (with a measured reach) qualify — gallery items keep the sphere fit.
 */
export function isHeroIsland(i: CameraIsland): boolean {
  return i.reach !== undefined && i.reach <= FRAMING.hero.maxReach;
}

/**
 * Hero heading: the candidate nearest the content heading (toward the evening sun) that keeps
 * the other islands out of the background — the low look otherwise stares into a neighbour
 * (clutter, and every prop on it at T3 detail).
 */
export function heroAzimuth(i: CameraIsland, others: readonly CameraIsland[]): number {
  const h = FRAMING.hero;
  let best: number = h.azimuthDeg;
  let bestScore = -Infinity;
  for (let k = -h.searchSteps; k <= h.searchSteps; k++) {
    const az = h.azimuthDeg + k * h.searchStepDeg;
    // view direction (camera → target) = −(sin az, cos az)
    const vx = -Math.sin(az * DEG);
    const vz = -Math.cos(az * DEG);
    let clear = 180;
    for (const o of others) {
      if (o === i) continue;
      const dx = o.cx - i.cx;
      const dz = o.cz - i.cz;
      const d = Math.hypot(dx, dz);
      if (d < 1e-6) continue;
      const sep = Math.acos(clamp((dx * vx + dz * vz) / d, -1, 1)) / DEG;
      clear = Math.min(clear, sep - Math.atan(reachOf(o) / d) / DEG);
    }
    const score = Math.min(clear, h.clearDeg) - h.turnCost * Math.abs(k * h.searchStepDeg);
    if (score > bestScore) {
      bestScore = score;
      best = az;
    }
  }
  return best;
}

/**
 * Hero framing (W9): low look over the sandbar so the landmark stands against the sky with the
 * horizon in the top third; the whole sandbar + shallow ring and the landmark top in frame.
 */
export function heroPose(
  i: CameraIsland,
  view: View,
  vp: Viewport,
  azimuth?: number,
  others: readonly CameraIsland[] = [],
): Pose {
  const h = FRAMING.hero;
  const lm = i.anchors.palm ?? { x: i.peakX ?? i.cx, z: i.peakZ ?? i.cz };
  const pts: Pt3[] = [
    ...ringPoints(i.cx, i.cz, reachOf(i) + h.ringPad, 0, 16),
    { x: lm.x, y: h.landmarkTop, z: lm.z },
  ];
  return fitOrbit(pts, {
    view,
    safe: insetFrac(vp.insets, vp.width, vp.height, h.pad),
    az: azimuth ?? heroAzimuth(i, others),
    pitchAt: () => h.pitch,
    minDist: h.minDist,
    maxDist: h.maxDist,
    ty: 0,
    start: { x: i.cx, z: i.cz },
    slide: false,
  });
}

/**
 * T1 island framing: fit the island sphere, settle on the pitch curve. `azimuth` keeps a heading
 * (fly-to); without it the preset heading is used (hero: clear of the other islands).
 */
export function islandPose(
  i: CameraIsland,
  view: View,
  vp: Viewport,
  azimuth?: number,
  others: readonly CameraIsland[] = [],
): Pose {
  if (isHeroIsland(i)) return heroPose(i, view, vp, azimuth, others);
  const r = i.radius * CAMERA_MOVE.islandFitScale;
  const dist = clamp(
    r / Math.sin((view.fov * DEG) / 2),
    CAMERA.minDist * 2.2,
    CAMERA_MOVE.islandMaxDist,
  );
  return {
    tx: i.cx,
    ty: Math.max(0, i.peakY * 0.3),
    tz: i.cz,
    dist,
    pitch: pitchForDistance(dist),
    az: azimuth ?? 30,
  };
}

/** `village` / `dock` (D1): fit the settlement frame from over the water, on the pitch curve. */
export function framePose(
  frame: CameraFrame,
  kind: 'village' | 'dock',
  view: View,
  vp: Viewport,
  groundY: number,
): Pose {
  const c = kind === 'village' ? FRAMING.village : FRAMING.dock;
  return fitOrbit(frame.points, {
    view,
    safe: insetFrac(vp.insets, vp.width, vp.height, c.pad),
    az: azimuthToward(frame.facing),
    pitchAt: pitchForDistance,
    minDist: c.minDist,
    maxDist: c.maxDist,
    ty: Math.max(0, groundY),
    start: { x: frame.x, z: frame.z },
  });
}
