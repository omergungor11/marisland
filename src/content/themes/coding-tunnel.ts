/**
 * Coding Wind Tunnel + Kite Day (M24 TASK-498, `CO:C1`; D-088). Look and motion numbers of the two new
 * defs (geo/themes/coding-tunnel.ts), the windsock lift tag and the hill kite scene
 * (render/culture-movers.ts). Defs: content/props-themes/coding-tunnel.ts; placement: the
 * `windTunnel` anchor of world/gen/plans/coding.ts.
 */
import { EMISSIVE, FLOWERS, ROOFS, WALLS } from '../palette.ts';
import { THEMES } from './index.ts';

const BLUE = THEMES.coding.accent;
const CREAM = WALLS[1];

export const TUNNEL_PAL = {
  frame: CREAM,
  rail: '#8A909C',
  brace: BLUE,
  floor: '#D6D3CB',
  floorTop: '#E7E4DC',
  curb: '#B9BDC7',
  yellow: FLOWERS[1],
  warm: EMISSIVE.lantern,
  /** The blue server light (accent family, same as the Server Yard plates). */
  server: BLUE,
} as const;

export const WIND_TUNNEL = {
  /** The half tube along local +x (= downwind): length, arch radius, floor height. */
  length: 14,
  radius: 2.55,
  floorY: 0.16,
  /** Arch ribs along the length (end to end) and ridge / flank rails (angles in deg from the floor). */
  ribs: 8,
  railDeg: [0, 36, 72, 108, 144, 180] as readonly number[],
  ribTh: 0.15,
  railTh: 0.12,
  /** Half-width of the floor deck (the pad is 6 u wide). */
  deckHalf: 2.8,
  /**
   * Windsocks: x along the tunnel, drop below the ridge to the ring, sock length / radii / bands.
   * The droop and the gust wave (socks lift one after another) are SOCK_LIFT (content/activity.ts).
   */
  socks: {
    xs: [-4.8, -2.4, 0, 2.4, 4.8] as readonly number[],
    drop: 0.62,
    length: 1.3,
    rNear: 0.3,
    rFar: 0.12,
    bands: 4,
    colors: [
      [BLUE, CREAM],
      [ROOFS[0], CREAM],
      [FLOWERS[1], CREAM],
    ] as readonly (readonly [string, string])[],
  },
  /** Blue server light: floor-edge strips and the ridge strip (glow mask), warm lantern posts at the mouth. */
  light: { edge: 0.38, ridge: 0.3, lanternMask: 1, lanternH: 1.45, lanternX: 0.7, lanternZ: 2.95 },
} as const;

export const TUNNEL_FAN = {
  /** 3 u fan: blade radius, cage radius, hub height; faces +z (downwind), blades turn with the wind. */
  hubY: 1.6,
  bladeR: 1.4,
  bladeW: 0.5,
  blades: 5,
  cageR: 1.58,
  /** Z of the fixture behind the tunnel mouth: the fixture stands this far upwind of the pad centre. */
  mouthGap: 7.55,
  blade: FLOWERS[1],
  cage: BLUE,
  body: CREAM,
  foot: '#8A909C',
} as const;

/**
 * Kite Day at the hill (kite poles on the hill foot, culture-movers `hillKiteScene`): every pole
 * sends a big kite up on its line at 14:00 (same ritual window as the rack kites, `kites.ritual`),
 * staggered by pole; one stays stuck low, tugging on its line.
 */
export const HILL_KITES = {
  /** Fraction of the window spent climbing, stagger per pole, fall at the end. */
  rise: 0.2,
  stagger: 0.006,
  fall: 0.12,
  /** Line top above the pole origin (the brass ring). */
  anchorY: 1.95,
  /** Height above the anchor at full climb, cycled by pole, and the downwind drift ratio. */
  height: [9, 12.5, 10.5, 14, 11.5, 8] as readonly number[],
  drift: 0.62,
  size: 1.9,
  tail: 2.4,
  sway: 0.8,
  bob: 0.3,
  /** The stuck kite: it climbs this high (u) and tugs `tug` u further on a `period` s beat, never freeing. */
  stuck: { height: 2.7, tug: 1.1, period: 4.6, size: 1.6 },
  colors: [ROOFS[5], FLOWERS[0], FLOWERS[4], ROOFS[2], FLOWERS[1], BLUE] as readonly string[],
} as const;
