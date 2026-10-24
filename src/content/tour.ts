/**
 * Tour mode (TASK-473, world.md C1): the idle camera flies a chain of wow-like framings instead
 * of the old plain orbit. Pure data; `src/camera/tour.ts` resolves the stops against the live
 * world (island / theme-relative targets, never raw coordinates — the layout may change).
 */

export type TourStopKind =
  /** The fitted T0 overview (W1). */
  | 'overview'
  /** The fitted low 3/4 postcard (W11 / W15). */
  | 'postcard'
  /** `islandPose`: fit the island sphere (hero framing on tiny islands). */
  | 'island'
  /** The settlement frame from over the water (W3-style). */
  | 'village'
  /** The pier frame (W2-style). */
  | 'dock'
  /** Zoom-ladder target (village anchor, ladder heading, clear of tall landmarks) at `dist`. */
  | 'ladder'
  /** A named island anchor (`waterfall`, `summit`, `giantTree`, `dock`, …) at `dist` / `pitch`. */
  | 'anchor';

export interface TourStop {
  /** Wow-shot id the framing stands in for (ART_BIBLE §11). */
  id: string;
  title: string;
  kind: TourStopKind;
  /** Island by theme id / name (`findIsland`); unused for overview / postcard. */
  island?: string;
  /** Anchor key for `kind: 'anchor'`; a missing anchor falls back to the ladder target. */
  anchor?: string;
  /** Orbit distance (u) for `ladder` / `anchor`. */
  dist?: number;
  /** Pitch (deg from horizontal) for `ladder` / `anchor`; must sit inside `pitchBand(dist)`. */
  pitch?: number;
  /** Heading offset (deg) from the anchor's facing / the ladder heading. */
  azOffset?: number;
  /**
   * `anchor` stops: target shift (u) off the anchor in the view frame (right = across the view,
   * back = toward the camera), as `FRAMING.ladder.shift`.
   */
  shift?: { right: number; back: number };
  /** Game hour held at this stop; the clock scrubs forward to it during the flight. */
  time: number;
  /** Per-stop overrides of `TOUR.flySeconds` / `TOUR.holdSeconds`. */
  fly?: number;
  hold?: number;
}

export const TOUR = {
  /** Flight between stops (s), easeInOutCubic on every channel. */
  flySeconds: 4,
  /** Hold at each stop (s). */
  holdSeconds: 8,
  /** Idle auto-start after this many seconds without input (replaces the old idle orbit). */
  idleAfter: 30,
  /** Idle auto-start on by default (`tour=0` turns it off, `tour=1` starts at once). */
  idleStart: true,
  /**
   * Hand-back on input: the camera is sent (with camera-controls' own damping) to the pose it
   * would have reached this many seconds later, so a mid-flight stop glides out instead of halting.
   */
  handbackSeconds: 0.35,
  /**
   * Stops in game-hour order: the clock only ever runs forward (15:00 → golden → night → the
   * next morning → back to 15:00 on the wrap), so no flight scrubs the sun backwards.
   */
  stops: [
    { id: 'W1', title: 'Postcard', kind: 'overview', time: 15 },
    {
      id: 'W19',
      title: 'Prism Hour',
      kind: 'anchor',
      island: 'design',
      // the TASK-470 W19 look (NNW): heading ≈ the W19 camera's, target ≈ 21 u left of the
      // Atelier Tree so the conservatory sits whole beside it; pitch at the band's floor
      anchor: 'giantTree',
      dist: 74,
      pitch: 26,
      azOffset: 53,
      shift: { right: -21, back: 0 },
      time: 17.5,
    },
    { id: 'W2', title: 'Golden Harbor', kind: 'dock', island: 'hq', time: 17.75 },
    {
      id: 'W9',
      title: 'Observatory University',
      kind: 'anchor',
      island: 'research',
      anchor: 'summit',
      dist: 50,
      pitch: 12,
      azOffset: 0,
      time: 18.75,
    },
    { id: 'W15', title: 'Relay Night', kind: 'postcard', time: 21 },
    { id: 'W3', title: 'Lantern Night', kind: 'village', island: 'hq', time: 22 },
    {
      id: 'W16',
      title: 'Harbour Guild Morning',
      kind: 'anchor',
      island: 'hq',
      anchor: 'dock',
      dist: 48,
      pitch: 16,
      azOffset: 0,
      time: 9,
    },
    {
      id: 'W13',
      title: 'Falls',
      kind: 'anchor',
      island: 'design',
      anchor: 'waterfall',
      dist: 45,
      pitch: 14,
      azOffset: 0,
      time: 10.5,
    },
  ] as readonly TourStop[],
} as const;
