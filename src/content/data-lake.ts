/**
 * Data Lake surface (TASK-547, D-125; D-116 direction C). Look numbers only: render/lake.ts paints the
 * lake into the ONE terrain program, masked by the world/data-lake.ts outline. Colours come from the
 * Coding M33 kit (its navy hulls and LED blues) so the shore pods and the water belong together.
 * Distances in u, speeds in u/s, glows are emissive gains over the palette colour (linear).
 */
import { CODING_M33_PAL as K } from './themes/coding-m33.ts';
import { WATER } from './palette.ts';

export const DATA_LAKE = {
  colors: {
    /** Open water at the middle, between the middle and the shore, and in the shallow ring. */
    deep: K.navyDeep,
    mid: K.navy,
    shallow: K.ledDeep,
    /** Thin wet line at the outline. */
    foam: WATER.lagoon,
    /** Fibre light and its core; packets. */
    fibre: K.ledDeep,
    core: K.led,
    packet: WATER.foam,
    /** Stone kerb on the shore side of the outline, over the zone's 2 u steps. */
    kerb: '#C9CED6',
  },
  /** Paints only within ± this of the water level (an edited hill in the lake stays plain). */
  heightBand: 1.5,
  /** Depth ramp, distance in from the outline: shallow → mid over `shallow`, mid → deep by `deep`. */
  depth: { shallow: 1.3, deep: 4.2, shallowMix: 0.55 },
  foam: { width: 0.16, mix: 0.6 },
  kerb: { width: 1.05 },
  fibre: {
    /** Lines across the short axis, so a smaller lake keeps the same read. */
    lines: 6,
    /** Share of the bundle squeezed toward the long-axis tips (a trunk that opens up in the middle). */
    pinch: 0.72,
    /** Slow shared curve of the bundle: amplitude (u), rad per u, twice. */
    wander: [
      [0.55, 0.31],
      [0.22, 0.83],
    ] as const,
    /** Per-line drift under the water (medium+): amplitude (share of the spacing), rad per u, rad per s. */
    drift: { amp: 0.14, freq: 0.62, rate: 0.28 },
    /** Refraction by the moving surface (medium+): amplitude (u), noise per u, noise drift per s. */
    refract: { amp: 0.28, scale: 0.8, rate: 0.13 },
    /** Core half-width and halo radius (u). */
    coreWidth: 0.085,
    haloWidth: 0.6,
    /** Fades in from the shore over this (u): the lines are under the water, not on the kerb. */
    inset: 0.7,
    /** Line offset in its cell (share of the spacing). */
    jitter: 0.3,
    /** Light running along the line: period (u), speed (u/s), brightness floor. Low: static at `flat`. */
    flow: { period: 6.5, speed: 0.8, floor: 0.34, flat: 0.45 },
    /** Albedo pull by day: the lines read as paler blue under the surface. */
    albedo: { core: 0.5, halo: 0.14 },
    /** Emissive gain, day / added at night (day + night × uNight). */
    core: { day: 0.1, night: 1.15 },
    halo: { day: 0.015, night: 0.3 },
  },
  /** Light dots riding the lines, medium+: spacing and speed along a line, share of slots in use. */
  packet: {
    spacing: 7.5,
    speed: 2.1,
    share: 0.62,
    /** Dot radius (u; never under a pixel or so, so they hold at a distance), halo × radius. */
    radius: 0.14,
    minPixels: 1.1,
    halo: 2.4,
    /** Emissive gain: day / added at night. */
    day: 0.2,
    night: 1.7,
    haloGain: 0.16,
  },
  /** Slow sheen on the calm surface (medium+): albedo ± share, noise per u, drift per s; ripple normal kept. */
  sheen: { amount: 0.14, scale: 0.34, rate: 0.05, normal: 0.15 },
  /** Night blue on the quay (× albedo, medium+): radius past the outline and gain added at night. */
  spill: { radius: 2.6, night: 0.22 },
  /** Faint inner blue of the water, gain × fibre colour added at night. */
  body: { night: 0.05 },
} as const;
