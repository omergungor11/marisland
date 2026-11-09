/**
 * Courier ships (M51, TASK-620, D-164): every island owns one ship that carries hand-offs
 * (fleet gates) between islands. `geo/courier.ts` builds them from these specs; `life/` (TASK-621)
 * reads `COURIER` for the voyage FSM. No number or colour of a ship lives in geo code.
 *
 * Geometry contract = the sailboat's: bow +z, keel at y = 0, deck at `hullH`, centred on x / z.
 * `life/` sinks it by `draft` (the part of the hull under the waterline) like `orientBoat`.
 */
import { ROCK, ROOFS, WALLS, WOOD } from './palette.ts';
import { THEMES } from './themes.ts';
import { THEME_IDS, type ThemeId } from '../world/types.ts';

/** Superstructure family; one builder per kind in geo/courier.ts, 7 apart silhouettes. */
export type ShipKind = 'yacht' | 'feeder' | 'barge' | 'catamaran' | 'cutter' | 'tug' | 'survey';

/** Flag / banner flown by the ship (`color`); the shape is part of the kind's silhouette. */
export interface ShipFlag {
  shape: 'pennant' | 'antenna' | 'patchwork' | 'banner' | 'checklist' | 'hook' | 'dish';
  color: string;
}

export interface CourierShipSpec {
  kind: ShipKind;
  /** Hull length / beam (u). Ferry-class: 5-7 u long. */
  length: number;
  beam: number;
  /** Deck height above the keel (u): crates stand at y = hullH. */
  hullH: number;
  /** Part of the hull under the waterline (u), for `orientBoat`. */
  draft: number;
  /** Boot-top (lowest band), main hull band, sheer / livery band, deck planks. */
  hullLow: string;
  hull: string;
  trim: string;
  deck: string;
  /** Livery band as a fraction of hullH: [from, to]. */
  trimBand: readonly [number, number];
  /** Deckhouse walls / roof. */
  superColor: string;
  roof: string;
  /** Funnel / sail / container / banner colour (the kind's loudest element). */
  rig: string;
  /** Theme accent (island dot colour). */
  accent: string;
  /** Main mast / funnel top above the keel (u). */
  mastH: number;
  flag: ShipFlag;
  /** Patchwork sail panels (design), container colours (coding), streamers (marketing). */
  patches: readonly string[];
  /** Free deck spots for `courierCrate`, [x, z] on the deck plane (y = hullH); first = the load spot. */
  crates: ReadonlyArray<readonly [number, number]>;
}

const acc = (t: ThemeId): string => THEMES[t].accent;
const tint = (t: ThemeId, i: number): string => THEMES[t].teamTints[i];

/** Index = `THEME_IDS` index = the ship variant. */
export const COURIER_SHIPS: Readonly<Record<ThemeId, CourierShipSpec>> = {
  // white steam yacht, tall buff funnel, gold trim, pennant
  hq: {
    kind: 'yacht',
    length: 6.6,
    beam: 2.0,
    hullH: 0.8,
    draft: 0.35,
    hullLow: tint('hq', 2),
    hull: WALLS[1],
    trim: ROOFS[3],
    deck: WOOD.planks,
    trimBand: [0.74, 0.9],
    superColor: WALLS[1],
    roof: ROOFS[3],
    rig: '#E9D3A0',
    accent: acc('hq'),
    mastH: 3.1,
    flag: { shape: 'pennant', color: acc('hq') },
    patches: [],
    crates: [
      [-0.45, -2.0],
      [0.45, -2.0],
      [0, 1.9],
    ],
  },
  // angular container feeder, stacked bracket-coloured crates, antenna
  coding: {
    kind: 'feeder',
    length: 7.0,
    beam: 2.2,
    hullH: 0.8,
    draft: 0.35,
    hullLow: ROCK[2],
    hull: ROCK[1],
    trim: acc('coding'),
    deck: ROCK[0],
    trimBand: [0.74, 0.9],
    superColor: WALLS[1],
    roof: acc('coding'),
    rig: acc('coding'),
    accent: acc('coding'),
    mastH: 4.3,
    flag: { shape: 'antenna', color: ROOFS[0] },
    patches: [acc('coding'), tint('coding', 1), ROOFS[3], ROOFS[0], tint('coding', 2), ROOFS[2]],
    crates: [
      [-0.32, 2.3],
      [0.32, 2.3],
    ],
  },
  // lantern-strung barge, patchwork palette sail (kin of the lantern boat)
  design: {
    kind: 'barge',
    length: 6.0,
    beam: 2.4,
    hullH: 0.7,
    draft: 0.3,
    hullLow: WOOD.dark,
    hull: WOOD.logs,
    trim: acc('design'),
    deck: WOOD.planks,
    trimBand: [0.7, 0.88],
    superColor: WALLS[3],
    roof: tint('design', 2),
    rig: acc('design'),
    accent: acc('design'),
    mastH: 4.2,
    flag: { shape: 'patchwork', color: acc('design') },
    patches: [
      ROOFS[0],
      ROOFS[3],
      ROOFS[2],
      acc('design'),
      WALLS[2],
      ROOFS[5],
      ROOFS[6],
      ROOFS[1],
      WALLS[3],
    ],
    crates: [
      [-0.55, 1.5],
      [0.55, 1.5],
    ],
  },
  // bright catamaran (two hulls), billboard banner sail, streamers
  marketing: {
    kind: 'catamaran',
    length: 6.2,
    beam: 2.8,
    hullH: 0.72,
    draft: 0.3,
    hullLow: tint('marketing', 2),
    hull: WALLS[1],
    trim: acc('marketing'),
    deck: WOOD.planks,
    trimBand: [0.7, 0.9],
    superColor: WALLS[0],
    roof: ROOFS[3],
    rig: WALLS[0],
    accent: acc('marketing'),
    mastH: 3.9,
    flag: { shape: 'banner', color: acc('marketing') },
    patches: [acc('marketing'), ROOFS[3], ROOFS[2], ROOFS[4]],
    crates: [
      [-0.6, 0.2],
      [0.6, 0.2],
    ],
  },
  // patrol cutter, mast light, checklist flag (kin of the inspection boat)
  qa: {
    kind: 'cutter',
    length: 5.8,
    beam: 1.9,
    hullH: 0.72,
    draft: 0.32,
    hullLow: tint('qa', 2),
    hull: WALLS[1],
    trim: acc('qa'),
    deck: WOOD.planks,
    trimBand: [0.6, 0.82],
    superColor: WALLS[0],
    roof: acc('qa'),
    rig: WALLS[1],
    accent: acc('qa'),
    mastH: 3.7,
    flag: { shape: 'checklist', color: acc('qa') },
    patches: [],
    crates: [
      [-0.32, 1.15],
      [0.32, 1.15],
      [0, 2.0],
    ],
  },
  // stubby tug, crane arm, spare-parts deck, tyre fenders
  devops: {
    kind: 'tug',
    length: 4.8,
    beam: 2.5,
    hullH: 0.8,
    draft: 0.35,
    hullLow: tint('devops', 2),
    hull: acc('devops'),
    trim: ROCK[2],
    deck: ROCK[1],
    trimBand: [0.72, 0.92],
    superColor: WALLS[3],
    roof: tint('devops', 2),
    rig: ROOFS[3],
    accent: acc('devops'),
    mastH: 2.6,
    flag: { shape: 'hook', color: ROCK[2] },
    patches: [],
    crates: [
      [-0.5, -1.8],
      [0.5, -1.8],
    ],
  },
  // survey vessel, instrument mast with dish, orange hull band
  research: {
    kind: 'survey',
    length: 6.6,
    beam: 2.0,
    hullH: 0.8,
    draft: 0.35,
    hullLow: tint('research', 2),
    hull: WALLS[1],
    trim: '#FF9F43',
    deck: WOOD.dock,
    trimBand: [0.45, 0.82],
    superColor: acc('research'),
    roof: WALLS[1],
    rig: WALLS[1],
    accent: acc('research'),
    mastH: 3.9,
    flag: { shape: 'dish', color: '#FF9F43' },
    patches: [],
    crates: [
      [-0.4, -1.95],
      [0.4, -1.95],
    ],
  },
};

/** Spec by ship variant (`THEME_IDS` index). */
export const courierSpec = (variant: number): CourierShipSpec =>
  COURIER_SHIPS[THEME_IDS[((variant % 7) + 7) % 7]];

/**
 * Courier motion (read by TASK-621 `life/`). Seconds / units / u per s.
 * - `speed` cruise (the ferry's 3.4), `accel` / `decel` the ramp rates (u per s^2, ferry decel 0.45);
 * - `dwell` seconds alongside the berth (loading before cast-off, unloading after arrival);
 * - `voyageS` clamp of a whole voyage: slow the ship down / speed it up to land inside it;
 * - `bobScale` / `heelScale` multiply the sailboat bob / heel (a ship is heavier than a dinghy);
 * - `crateHop` a crate hopping between deck spot and dock (apex height u, duration s);
 * - `lantern` mast lantern: `emissive` is the vertex-colour glow class (1 = the boats' lamp class).
 */
export const COURIER = {
  speed: 3.4,
  accel: 0.6,
  decel: 0.45,
  dwell: { load: 2.5, unload: 3 },
  voyageS: [18, 45] as readonly [number, number],
  bobScale: 0.7,
  heelScale: 0.6,
  crateHop: { height: 0.9, seconds: 0.7 },
  lantern: { emissive: 1 },
} as const;

/** The def ids of this task (gallery showcase `couriers`, geometry tests). */
export const COURIER_PROP_IDS: readonly string[] = ['courierShip', 'courierCrate', 'reportScroll'];

/** Report scroll colours: `ok` cream parchment + gold ribbon, `fail` the red of FLEET_TERM error. */
export const REPORT_SCROLL = {
  ok: { paper: WALLS[0], ribbon: ROOFS[3] },
  fail: { paper: WALLS[2], ribbon: '#D9443A' },
} as const;
