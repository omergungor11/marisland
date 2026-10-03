/** Zoom tiers (ART_BIBLE §6, ARCHITECTURE §4). Distances in u, pitch in degrees from horizontal. */
export interface TierDef {
  id: 0 | 1 | 2 | 3;
  name: 'map' | 'island' | 'village' | 'macro';
  minDist: number;
  maxDist: number;
  pitchMin: number;
  pitchMax: number;
  /** Clouds visible at this tier. */
  clouds: boolean;
}

export const TIERS: readonly TierDef[] = [
  { id: 0, name: 'map', minDist: 380, maxDist: 800, pitchMin: 58, pitchMax: 70, clouds: true },
  { id: 1, name: 'island', minDist: 140, maxDist: 380, pitchMin: 45, pitchMax: 58, clouds: true },
  { id: 2, name: 'village', minDist: 45, maxDist: 140, pitchMin: 35, pitchMax: 45, clouds: false },
  { id: 3, name: 'macro', minDist: 12, maxDist: 45, pitchMin: 20, pitchMax: 35, clouds: false },
];

/** ±10 % distance hysteresis at every boundary. */
export const TIER_HYSTERESIS = 0.1;

export const CAMERA = {
  fov: 35,
  photoFov: [15, 60] as const,
  minDist: 12,
  maxDist: 800,
  /** Free pitch slack around the curve, degrees. */
  pitchSlack: 6,
  /** Camera y stays this far above the terrain. */
  terrainClearance: 3,
  /** T0 default pose. */
  overview: { dist: 450, pitch: 58, azimuthDeg: 25 },
  /** Idle orbit speed, deg/s. */
  idleOrbit: 0.6,
  idleAfter: 30,
  smoothTime: 0.18,
  draggingSmoothTime: 0.08,
  /** Click = pointer moved < px within < ms. */
  clickMaxPx: 6,
  clickMaxMs: 300,
  /** Two clicks/taps within this many ms and px = double-click (fly-to). */
  doubleTapMs: 350,
  doubleTapPx: 24,
} as const;

/** Spring/ease for camera moves (cute-motion: critically damped). */
export const CAMERA_MOVE = {
  flyToSeconds: 1.6,
  snapSeconds: 0.4,
  /** camera-controls smoothTime for fly-tos (≈ flyToSeconds / 3.5, critically damped). */
  flySmoothTime: 0.45,
  /** Idle orbit eases in over this many seconds (no sudden start). */
  orbitRampSeconds: 2.5,
  /** Island fly-to: sphere radius × this, distance clamp (u). */
  islandFitScale: 1.35,
  islandMaxDist: 380,
  /** Ray-march step (u) when picking an island under the cursor. */
  pickStep: 2,
  /** A hit within radius × this of an island centre picks it (shallows count). */
  pickSlack: 1.3,
} as const;
