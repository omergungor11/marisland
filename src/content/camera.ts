/**
 * Camera framing numbers (ART_BIBLE §6/§9/§11, ARCHITECTURE §6): how the presets fit what they
 * show. Pure data — `src/camera/framing.ts` turns these into orbit poses. Distances in u,
 * angles in degrees, screen margins in CSS px unless noted.
 */

/** Screen-space safe margins (CSS px) that a fitted pose keeps its content out of. */
export interface SafeInsets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export const FRAMING = {
  /** Margins with the HUD on: dock (16 px offset + 64 px dial + 16 px air) and a label row on top. */
  hudInsets: { top: 44, bottom: 96, left: 16, right: 16 } as SafeInsets,
  /** Margins with the HUD off (capture `hud=0`, photo mode). */
  bareInsets: { top: 14, bottom: 14, left: 14, right: 14 } as SafeInsets,

  /** T0 overview (D2): every island's whole shallow ring is inside the safe area. */
  overview: {
    /** The visible shelf + drop-off ring reaches this far past an island's land reach. */
    ringPad: 22,
    /** Points sampled around each ring. */
    ringSamples: 24,
    /**
     * Farthest fitted overview (u). Landscape fits inside the T0 800 u ceiling; a 9:16 phone
     * needs ≈ 2× that to fit the width, and the zoom-out limit follows the fitted pose.
     */
    maxDist: 2200,
  },

  /** `village` (D1): fit the settlement (lots + plaza + its docks), camera over the water. */
  village: {
    /** Lots stand this tall above the ground for the fit (roof ridge). */
    roofY: 4,
    /** Distance range (u): the nominal T2 framing distance up to the T2 ceiling. */
    minDist: 72,
    maxDist: 125,
    /** Extra margin around the fitted settlement, fraction of the viewport per side. */
    pad: 0.05,
    /** Fit this fraction of the lots nearest the plaza (the bible check wants ≥ 80 % in frame). */
    keepFraction: 0.85,
    /** Settlement landmarks (windmills, clocktower) within this distance (u) of the centroid … */
    landmarkRadius: 45,
    /** … are fitted up to this height above their ground (windmill cap + blades). */
    landmarkY: 11,
  },

  /** `dock`: fit the pier, its moorings and the waterfront lots near the pier root. */
  dock: {
    minDist: 64,
    maxDist: 110,
    pad: 0.06,
    /** Lots within this distance (u) of the pier root are part of the dock frame. */
    lotRadius: 26,
    /** Camera heading off the pier axis (deg): the pier crosses the frame diagonally. */
    skewDeg: 50,
    /** Probe distance (u) for picking the water side of the pier. */
    probe: 40,
  },

  /**
   * Hero framing for tiny islands with a tall landmark (Lonely Palm, D13 / W9): a low,
   * near-horizontal look so the landmark stands against the sky and the horizon sits in the top
   * third. At FOV 35° the horizon is only in frame when the camera looks down less than 17.5°.
   */
  hero: {
    /** Islands whose land reach is at most this (u) get the hero framing. */
    maxReach: 20,
    /**
     * Look-down angle (deg). Horizon at tan(pitch)/tan(17.5°) ≈ 0.5 above the frame centre (top
     * quarter); the camera stays below the palm crown (≈ 6–7 u at the fitted 36–45 u).
     */
    pitch: 9,
    /** Preferred heading (camera-controls azimuth, deg): toward the evening sun (≈ −103° at 18:45). */
    azimuthDeg: -78,
    /** Heading search: ± steps × step (deg) around the preferred heading … */
    searchSteps: 12,
    searchStepDeg: 10,
    /** … scored by the angular clearance (deg) to the nearest other island, capped here … */
    clearDeg: 40,
    /** … minus this per degree turned away from the preferred heading. */
    turnCost: 0.12,
    /** Ring around the sandbar kept in frame: land reach + this (u). */
    ringPad: 8,
    /** Landmark top above sea level (u): palm 6.1 u × 1.35 + crown. */
    landmarkTop: 9.5,
    /** ≤ `lowBand.fullAt`, so the pose is inside the user pitch band. */
    minDist: 24,
    maxDist: 50,
    pad: 0.04,
  },

  /**
   * Low-pitch allowance at macro distances (so the hero pose is reachable and the first drag
   * never snaps): the lower pitch bound drops to `pitch` at or below `fullAt` u and blends back
   * to the pitch curve by `blendTo` u (log-distance).
   */
  lowBand: { pitch: 8, fullAt: 50, blendTo: 90 },

  /**
   * Zoom ladder (D-031, M14b TASK-374, `cam=ladder:<island>:<dist>`): a near-pure dolly along one
   * axis — fixed pitch, the heading of the island's village frame (camera over the water), target
   * on the frame anchor (island centre + `fallbackAzimuth` without a settlement). The tier is taken
   * without hysteresis so each frame shows what a fresh view at that distance shows.
   */
  ladder: {
    pitch: 48,
    fallbackAzimuth: 30,
    /** Ladder distances (u), far → near, ratio ≈ 0.7. */
    dists: [700, 480, 340, 240, 170, 120, 85, 60, 42, 30, 21],
    /** Tier / LOD boundaries (u) checked as pairs at `pairSpread` × b. */
    pairs: [380, 250, 140, 45, 300, 120, 40],
    pairSpread: [1.06, 0.94],
    /**
     * Island drift is measured over this frame's footprint (u; about the whole island) in the
     * farther frames, over the whole frame in the nearer ones.
     */
    driftRef: 170,
  },
} as const;
