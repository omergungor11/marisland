/**
 * Building variants v2 (TASK-598, D-160): a variant index of cottage / stiltHut / towerHouse / barn /
 * logCabin selects a roof style, a window layout, a door and a trim set. Pure data: geometry lives in
 * geo/building-kit.ts + geo/building-v2.ts. Every colour is a palette reference (ART_BIBLE §2).
 *
 * Indices below the first row of a def keep their legacy look (the legacy builders in geo/buildings.ts,
 * pinned by culture plans); the rows here are APPENDED after them. LOD1 of every row is the def's
 * legacy LOD1 silhouette painted in the row's wall / roof colours.
 */
import { FOLIAGE, FLOWERS, ROCK, ROOFS, WALLS, WOOD } from './palette.ts';

export type RoofStyle = 'gable' | 'hip' | 'dormer' | 'mansard' | 'cone' | 'gambrel';
/** 0 = pair flanking the door (+ one on a side), 1 = tall slim pairs, 2 = wide window + small, door off-centre. */
export type WindowPattern = 0 | 1 | 2;
export type DoorKind = 'plain' | 'arched' | 'double';
export type ChimneyKind = 'brick' | 'pipe' | 'none';

export interface BuildingStyle {
  roof: RoofStyle;
  windows: WindowPattern;
  door: DoorKind;
  chimney: ChimneyKind;
  wall: string;
  roofCol: string;
  trim: string;
  doorCol: string;
  /** Shutter colour on the front windows. */
  shutters?: string;
  flowerBox?: boolean;
  /** Door awning stripe colours. */
  awning?: readonly [string, string];
  /** Stone footing colour (two-tone lower wall) replacing the plain foundation. */
  plinth?: string;
  /** Dormer roofs: how many (+x slope first). Default 2. */
  dormers?: 1 | 2;
  /** Stilt hut: six posts instead of four. */
  sixPosts?: boolean;
}

/** Measures in u (ART_BIBLE §1: chunky, min thickness 0.12). */
export const BUILDING_K = {
  /** Eave plate under hip / mansard roofs: gives the thin roof sheet a 0.12 u rim and a dark soffit. */
  plate: { thick: 0.12, soffitAo: 0.8 },
  overhang: { gable: 0.25, hip: 0.4, mansard: 0.32 },
  hip: { riseMul: 0.95 },
  mansard: { inset: 0.5, lowMul: 0.62, topMul: 0.42 },
  dormer: { w: 0.9, wallH: 0.55, rise: 0.28, depth: 0.7, at: 0.64, window: 0.34 },
  shutter: { w: 0.2, d: 0.1 },
  flowerBox: {
    h: 0.2,
    d: 0.24,
    foliage: [FOLIAGE.deciduous[1], FLOWERS[0], FOLIAGE.deciduous[0], FLOWERS[1]],
  },
  awning: { depth: 0.72, drop: 0.3, valance: 0.14, stripes: 4 },
  slimWindow: { w: 0.42, h: 0.95 },
  wideWindow: { w: 1.2, h: 0.62 },
  pipe: { rb: 0.17, rt: 0.13, radial: 5 },
  plinth: { h: 0.85, grow: 0.1 },
} as const;

const S = (s: BuildingStyle): BuildingStyle => s;

/** Variant index -> style, per def. Indices not listed here are legacy. */
export const BUILDING_STYLES: Readonly<Record<string, Readonly<Record<number, BuildingStyle>>>> = {
  // cottage: 0..2 legacy rolls, 3 = DevOps ops shack (pinned)
  cottage: {
    4: S({
      roof: 'hip',
      windows: 1,
      door: 'arched',
      chimney: 'pipe',
      wall: WALLS[2],
      roofCol: ROOFS[2],
      trim: WALLS[1],
      doorCol: ROOFS[1],
      shutters: ROOFS[5],
      plinth: ROCK[1],
    }),
    5: S({
      roof: 'dormer',
      windows: 0,
      door: 'plain',
      chimney: 'pipe',
      dormers: 1,
      wall: WALLS[3],
      roofCol: ROOFS[1],
      trim: WOOD.planks,
      doorCol: WOOD.dark,
      shutters: ROOFS[6],
    }),
    6: S({
      roof: 'mansard',
      windows: 2,
      door: 'double',
      chimney: 'none',
      wall: WALLS[0],
      roofCol: ROOFS[4],
      trim: WALLS[1],
      doorCol: WOOD.dark,
      awning: [ROOFS[0], WALLS[1]],
      plinth: ROCK[0],
    }),
    7: S({
      roof: 'gable',
      windows: 2,
      door: 'arched',
      chimney: 'brick',
      wall: WALLS[1],
      roofCol: ROOFS[0],
      trim: WOOD.planks,
      doorCol: ROOFS[2],
      shutters: ROOFS[2],
      flowerBox: true,
    }),
  },
  // stiltHut: 0..1 legacy
  stiltHut: {
    2: S({
      roof: 'hip',
      windows: 1,
      door: 'plain',
      chimney: 'none',
      wall: WALLS[3],
      roofCol: ROOFS[5],
      trim: WOOD.planks,
      doorCol: WOOD.dark,
      shutters: ROOFS[2],
    }),
    3: S({
      roof: 'dormer',
      windows: 0,
      door: 'arched',
      chimney: 'pipe',
      wall: WALLS[2],
      roofCol: ROOFS[3],
      trim: WALLS[1],
      doorCol: WOOD.dark,
      flowerBox: true,
    }),
    4: S({
      roof: 'gable',
      windows: 2,
      door: 'plain',
      chimney: 'brick',
      wall: WALLS[0],
      roofCol: ROOFS[6],
      trim: WOOD.planks,
      doorCol: WOOD.dark,
      awning: [ROOFS[1], WALLS[1]],
    }),
    5: S({
      roof: 'hip',
      windows: 0,
      door: 'plain',
      chimney: 'pipe',
      sixPosts: true,
      wall: WALLS[1],
      roofCol: ROOFS[1],
      trim: WOOD.planks,
      doorCol: WOOD.dark,
      shutters: ROOFS[4],
    }),
    6: S({
      roof: 'mansard',
      windows: 1,
      door: 'arched',
      chimney: 'none',
      wall: WALLS[3],
      roofCol: ROOFS[4],
      trim: WALLS[1],
      doorCol: ROOFS[2],
      flowerBox: true,
    }),
    7: S({
      roof: 'dormer',
      windows: 2,
      door: 'plain',
      chimney: 'brick',
      wall: WALLS[2],
      roofCol: ROOFS[0],
      trim: WOOD.planks,
      doorCol: WOOD.dark,
      shutters: ROOFS[6],
      awning: [ROOFS[5], WALLS[1]],
    }),
  },
  // towerHouse: 0..2 legacy (cone roof)
  towerHouse: {
    3: S({
      roof: 'cone',
      windows: 1,
      door: 'arched',
      chimney: 'none',
      wall: WALLS[0],
      roofCol: ROOFS[4],
      trim: WALLS[1],
      doorCol: WOOD.dark,
      shutters: ROOFS[2],
      plinth: ROCK[1],
    }),
    4: S({
      roof: 'hip',
      windows: 0,
      door: 'plain',
      chimney: 'brick',
      wall: WALLS[2],
      roofCol: ROOFS[5],
      trim: WOOD.planks,
      doorCol: WOOD.dark,
      flowerBox: true,
    }),
    5: S({
      roof: 'mansard',
      windows: 2,
      door: 'double',
      chimney: 'pipe',
      wall: WALLS[1],
      roofCol: ROOFS[1],
      trim: WOOD.planks,
      doorCol: ROOFS[2],
      plinth: ROCK[0],
    }),
    6: S({
      roof: 'gable',
      windows: 1,
      door: 'plain',
      chimney: 'brick',
      wall: WALLS[3],
      roofCol: ROOFS[0],
      trim: WALLS[1],
      doorCol: WOOD.dark,
      shutters: ROOFS[5],
      plinth: ROCK[1],
    }),
    7: S({
      roof: 'hip',
      windows: 2,
      door: 'arched',
      chimney: 'pipe',
      wall: WALLS[0],
      roofCol: ROOFS[6],
      trim: WOOD.planks,
      doorCol: ROOFS[1],
      shutters: ROOFS[1],
      flowerBox: true,
    }),
  },
  // barn: 0..1 legacy (gambrel, X doors on the +x gable end)
  barn: {
    2: S({
      roof: 'gable',
      windows: 0,
      door: 'double',
      chimney: 'none',
      wall: ROOFS[1],
      roofCol: ROOFS[5],
      trim: WALLS[1],
      doorCol: WOOD.planks,
      plinth: ROCK[1],
    }),
    3: S({
      roof: 'dormer',
      windows: 1,
      door: 'double',
      chimney: 'none',
      wall: WALLS[3],
      roofCol: ROOFS[1],
      trim: WALLS[1],
      doorCol: WOOD.planks,
    }),
    4: S({
      roof: 'hip',
      windows: 2,
      door: 'plain',
      chimney: 'pipe',
      wall: ROOFS[1],
      roofCol: ROOFS[3],
      trim: WALLS[1],
      doorCol: WOOD.planks,
      shutters: WALLS[1],
    }),
    5: S({
      roof: 'gambrel',
      windows: 1,
      door: 'arched',
      chimney: 'none',
      wall: WALLS[2],
      roofCol: ROOFS[2],
      trim: WALLS[1],
      doorCol: WOOD.planks,
      plinth: ROCK[0],
    }),
    6: S({
      roof: 'hip',
      windows: 0,
      door: 'double',
      chimney: 'brick',
      wall: WALLS[0],
      roofCol: ROOFS[0],
      trim: WOOD.planks,
      doorCol: WOOD.dark,
      awning: [ROOFS[5], WALLS[1]],
    }),
    7: S({
      roof: 'dormer',
      windows: 2,
      door: 'arched',
      chimney: 'pipe',
      wall: ROOFS[1],
      roofCol: ROOFS[6],
      trim: WALLS[1],
      doorCol: WOOD.planks,
    }),
  },
  // logCabin: 0..1 legacy (gable)
  logCabin: {
    2: S({
      roof: 'hip',
      windows: 0,
      door: 'plain',
      chimney: 'brick',
      wall: WOOD.logs,
      roofCol: ROOFS[1],
      trim: WALLS[1],
      doorCol: WOOD.planks,
      shutters: ROOFS[2],
    }),
    3: S({
      roof: 'dormer',
      windows: 0,
      door: 'arched',
      chimney: 'pipe',
      wall: WOOD.dark,
      roofCol: ROOFS[2],
      trim: WALLS[1],
      doorCol: WOOD.planks,
      flowerBox: true,
    }),
    4: S({
      roof: 'gable',
      windows: 2,
      door: 'double',
      chimney: 'brick',
      wall: WOOD.logs,
      roofCol: ROOFS[3],
      trim: WALLS[3],
      doorCol: WOOD.dark,
      awning: [ROOFS[0], WALLS[1]],
    }),
    5: S({
      roof: 'hip',
      windows: 1,
      door: 'plain',
      chimney: 'none',
      wall: WOOD.dark,
      roofCol: ROOFS[6],
      trim: WALLS[1],
      doorCol: WOOD.planks,
      shutters: ROOFS[4],
      flowerBox: true,
    }),
    6: S({
      roof: 'dormer',
      windows: 2,
      door: 'plain',
      chimney: 'brick',
      wall: WOOD.logs,
      roofCol: ROOFS[4],
      trim: WALLS[1],
      doorCol: WOOD.planks,
      shutters: ROOFS[1],
    }),
    7: S({
      roof: 'gable',
      windows: 2,
      door: 'plain',
      chimney: 'brick',
      wall: WOOD.dark,
      roofCol: ROOFS[0],
      trim: WALLS[3],
      doorCol: WOOD.planks,
      shutters: ROOFS[5],
      awning: [ROOFS[2], WALLS[1]],
    }),
  },
};

/** Variants per def after TASK-598 (legacy rows + the appended styles). */
export const BUILDING_VARIANTS = {
  cottage: 8,
  stiltHut: 8,
  towerHouse: 8,
  barn: 8,
  logCabin: 8,
} as const;

/**
 * What `rollVariants` is TODAY for each def (rolls draw from the first N only, so the appended styles
 * never appear in worlds yet; the world `props` hash stays). TASK-600 flips these to
 * BUILDING_ROLL_PROPOSAL with the single planned hash re-pin.
 */
export const BUILDING_ROLL_NOW = {
  cottage: 3,
  stiltHut: 2,
  towerHouse: 3,
  barn: 2,
  logCabin: 2,
} as const;

/** Proposed rolls: every appended style, cottage keeps v3 (ops shack) pinned. */
export const BUILDING_ROLL_PROPOSAL = {
  cottage: 8,
  stiltHut: 8,
  towerHouse: 8,
  barn: 8,
  logCabin: 8,
} as const;

export const buildingStyle = (def: string, variant: number): BuildingStyle | undefined =>
  BUILDING_STYLES[def]?.[variant];
