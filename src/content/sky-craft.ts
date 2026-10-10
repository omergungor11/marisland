/**
 * Sky craft (TASK-335, D-038): hot-air balloons and one airship drifting over the archipelago.
 * Data only — geo/sky-craft.ts builds the models, render/sky-craft.ts flies them on closed-form
 * orbits. Altitudes sit just under / between the cloud layer (`CLOUDS.altitude` 60–90 u).
 */
export const SKY_CRAFT = {
  count: {
    low: { balloons: 2, airships: 0 },
    medium: { balloons: 4, airships: 1 },
    high: { balloons: 5, airships: 1 },
  },
  /** Balloon altitude band (u above sea level); balloons take evenly spaced, shuffled layers. */
  balloonY: [34, 60],
  airshipY: 96,
  /** Ground speed along the orbit (u/s) — deliberately lazy. */
  balloonSpeed: 1.6,
  airshipSpeed: 3.2,
  /**
   * Orbits are concentric, same-aspect ellipses over the islands' bounding box (radius = fraction of
   * its half-extent), balloons all turning the same way at one angular speed → the horizontal gap
   * between two balloons never drops below the radius step. The airship counter-rotates, higher up.
   */
  radiusFrac: [0.3, 0.9],
  airshipRadiusFrac: 0.7,
  /** Jitter on each balloon's start angle (fraction of its even slot). */
  phaseJitter: 0.35,
  /**
   * Model scale (models are 10 u / 26 u across): chunky on purpose so they read as shapes from the
   * T0 postcard distance (~500 u). Balloons get a per-instance jitter inside the range.
   */
  scale: [1.6, 2.1],
  airshipScale: 1.5,
  /** Vertical bob (u, period s) and swing (rad, period s). */
  bob: { amp: 0.6, period: 7 },
  sway: { amp: 0.035, period: 9 },
  airshipBank: 0.06,
  /** Dither fade by camera distance (u): gone close up so they never fly into the shot. */
  fadeNear: 100,
  fadeFar: 50,
  /** Colours. Envelope gores cycle through `stripes`; trim = band at the mouth. */
  stripes: ['#FF9E8A', '#FFE9A8', '#9FE0D0', '#B7A8F0'],
  trim: '#FFF4E0',
  basket: '#C9A06B',
  rope: '#D9C3A0',
  flame: '#FFB347',
  burner: '#8A909C',
  airship: {
    hull: '#FFF4E0',
    belly: '#F2E3C4',
    band: '#FF9E8A',
    fins: ['#FF9E8A', '#9FE0D0'],
    cabin: '#C9A06B',
    window: '#FFE9A8',
  },
} as const;
