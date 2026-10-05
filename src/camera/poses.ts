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
  return [lo, curve + CAMERA.pitchSlack];
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
