/**
 * "Horseshoe Harbour" kit look (M52 TASK-660, D-170; repainted in the HQ palette, TASK-667, D-171): every colour and dimension of the
 * quay houses, terraces, stalls, moored boats, finger pontoon and mole tower. Geometry:
 * geo/themes/marketing-marina*.ts; the placement contract (keys, sizes): marketing-marina.ts.
 * Palette references only (ART_BIBLE §2): HQ's wall strata (Hearthholm), the cream walls, the roof
 * set, the HQ coral and its light coral (OFFICE_PAL.hq), the harbour blue trim. Lengths in u.
 */
import { OFFICE_PAL } from '../palette-offices.ts';
import {
  EMISSIVE,
  FLOWERS,
  FOLIAGE,
  HAY,
  ROCK,
  ROOFS,
  WALL_STRATA,
  WALLS,
  WOOD,
} from '../palette.ts';

const S = WALL_STRATA.hq;
const CORAL = OFFICE_PAL.hq[0].roof;
const TERRA = S[3];
const TEAL = ROOFS[2];
const GOLD = ROOFS[3];
const SALMON = OFFICE_PAL.hq[1].roof;
const SKY = ROOFS[5];
const MINT = ROOFS[6];
const CREAM = WALLS[0];
const WHITE = WALLS[1];

export type Glyph = 'fish' | 'cup' | 'loaf' | 'cone' | 'card' | 'anchor';
export type RoofKind = 'gableFront' | 'gableSide' | 'hip' | 'flat';
export type HouseExtra =
  | 'balcony'
  | 'chimney'
  | 'finial'
  | 'hoist'
  | 'lifebuoy'
  | 'flowerBoxes'
  | 'bunting'
  | 'atticWindow';

export interface HouseSpec {
  /** Width across the front (the kit's `w`). */
  w: number;
  storeys: 2 | 3;
  groundH: number;
  upperH: number;
  roof: RoofKind;
  /** Roof rise (flat: the parapet height). */
  rise: number;
  wall: string;
  /** The painted shop front of the ground floor. */
  front: string;
  roofCol: string;
  shutters: string;
  doorCol: string;
  awning: readonly [string, string];
  /** Which side the door is on (+1 right, -1 left, seen from the quay). */
  doorSide: 1 | -1;
  glyph: Glyph;
  extras: readonly HouseExtra[];
}

export const MARINA_LOOK = {
  pal: {
    stone: S[0],
    stoneWarm: S[2],
    stoneRed: S[1],
    stoneDark: S[3],
    trim: CREAM,
    white: WHITE,
    wood: WOOD.dark,
    woodLight: WOOD.planks,
    dock: WOOD.dock,
    rock: ROCK[1],
    window: EMISSIVE.window,
    lantern: EMISSIVE.lantern,
    accent: CORAL,
    teal: TEAL,
    gold: GOLD,
    sky: SKY,
    mint: MINT,
    salmon: SALMON,
    terra: TERRA,
    leaf: FOLIAGE.deciduous[1],
    pink: FLOWERS[0],
    yellow: FLOWERS[1],
    ink: '#5A4A55',
  },
  /** Fair-tent striped awnings and parasols: coral first, always against cream or white. */
  stripes: [
    [CORAL, CREAM],
    [TEAL, CREAM],
    [GOLD, WHITE],
    [SKY, CREAM],
    [MINT, WHITE],
    [SALMON, CREAM],
  ] as const,
  /** 0 seafood restaurant · 1 café · 2 bakery · 3 gelato · 4 souvenir shop · 5 chandlery. */
  houses: [
    {
      w: 4,
      storeys: 2,
      groundH: 2.7,
      upperH: 2.0,
      roof: 'gableFront',
      rise: 1.55,
      wall: CREAM,
      front: SKY,
      roofCol: CORAL,
      shutters: TEAL,
      doorCol: S[3],
      awning: [CORAL, CREAM],
      doorSide: 1,
      glyph: 'fish',
      extras: ['lifebuoy', 'atticWindow'],
    },
    {
      w: 4,
      storeys: 2,
      groundH: 2.7,
      upperH: 1.9,
      roof: 'hip',
      rise: 0.95,
      wall: WALLS[3],
      front: TEAL,
      roofCol: S[3],
      shutters: CORAL,
      doorCol: WOOD.dark,
      awning: [TEAL, CREAM],
      doorSide: -1,
      glyph: 'cup',
      extras: ['balcony', 'flowerBoxes'],
    },
    {
      w: 3.6,
      storeys: 2,
      groundH: 2.7,
      upperH: 2.1,
      roof: 'gableSide',
      rise: 1.2,
      wall: WALLS[2],
      front: GOLD,
      roofCol: SALMON,
      shutters: SKY,
      doorCol: S[3],
      awning: [GOLD, WHITE],
      doorSide: 1,
      glyph: 'loaf',
      extras: ['chimney', 'flowerBoxes'],
    },
    {
      w: 3.6,
      storeys: 3,
      groundH: 2.7,
      upperH: 1.8,
      roof: 'flat',
      rise: 0.45,
      wall: MINT,
      front: CORAL,
      roofCol: S[0],
      shutters: CREAM,
      doorCol: WALLS[1],
      awning: [CORAL, WHITE],
      doorSide: -1,
      glyph: 'cone',
      extras: ['finial'],
    },
    {
      w: 4,
      storeys: 2,
      groundH: 2.7,
      upperH: 1.9,
      roof: 'flat',
      rise: 0.5,
      wall: S[0],
      front: SALMON,
      roofCol: S[2],
      shutters: S[1],
      doorCol: WOOD.dark,
      awning: [SALMON, CREAM],
      doorSide: 1,
      glyph: 'card',
      extras: ['bunting', 'flowerBoxes'],
    },
    {
      w: 4.4,
      storeys: 2,
      groundH: 2.7,
      upperH: 2.1,
      roof: 'gableFront',
      rise: 1.25,
      wall: SKY,
      front: S[3],
      roofCol: CORAL,
      shutters: CREAM,
      doorCol: WOOD.dark,
      awning: [SKY, CREAM],
      doorSide: -1,
      glyph: 'anchor',
      extras: ['hoist', 'lifebuoy'],
    },
  ] satisfies readonly HouseSpec[],
  house: {
    /** Body depth (front to back, awning and sign come on top). */
    d: 3.9,
    plinthH: 0.4,
    plinthGrow: 0.04,
    corniceH: 0.14,
    doorW: 0.95,
    doorH: 1.7,
    /** Shop window: share of the width, sill height, height. */
    shopW: 0.43,
    shopSill: 0.72,
    shopH: 1.3,
    /** Awning centre height on the ground floor, its width taken off the front. */
    awningY: 2.4,
    awningInset: 0.2,
    /** Upper window size, x offset share of the width, shutter width. */
    win: { w: 0.62, h: 0.95, x: 0.2, shutter: 0.26 },
    sign: { board: 0.88, frame: 0.07, arm: 0.62, y: 2.42, inset: 0.58 },
    parapetCap: 0.08,
  },
  glyphColors: {
    fish: [SKY, '#3E8BC9', '#5A4A55'],
    cup: [CORAL, '#8A5A3B', '#A9AEB8'],
    loaf: [HAY, S[1]],
    cone: [S[2], '#FF8FB1', '#7FD8B3'],
    card: [SKY, CORAL, CREAM],
    anchor: ['#5A4A55'],
  },
  /** Terraces: tables / chairs / parasols; `r` parasol radius. All x, z from the piece centre. */
  terraces: [
    {
      w: 4,
      d: 2.2,
      tables: [
        { x: -1.0, z: 0, chairs: [0, 2] },
        { x: 1.0, z: 0, chairs: [0, 2] },
      ],
      parasols: [
        { x: -1.0, z: 0, r: 0.95, set: 0 },
        { x: 1.0, z: 0, r: 0.95, set: 1 },
      ],
      menu: { x: 0, z: 0.8 },
      planters: [],
    },
    {
      w: 4,
      d: 2.2,
      tables: [
        { x: -1.3, z: -0.3, chairs: [1, 3] },
        { x: 0, z: 0.35, chairs: [1, 3] },
        { x: 1.3, z: -0.3, chairs: [1, 3] },
      ],
      parasols: [
        { x: -1.3, z: -0.3, r: 0.75, set: 2 },
        { x: 0, z: 0.35, r: 0.75, set: 0 },
        { x: 1.3, z: -0.3, r: 0.75, set: 3 },
      ],
      menu: null,
      planters: [],
    },
    {
      w: 3.2,
      d: 2.2,
      tables: [
        { x: -0.7, z: 0.15, chairs: [0, 2] },
        { x: 0.7, z: 0.15, chairs: [0, 2] },
      ],
      parasols: [{ x: 0, z: 0.1, r: 1.0, set: 4 }],
      menu: null,
      planters: [-1.2, 0, 1.2],
    },
  ],
  terrace: {
    tableR: 0.36,
    tableH: 0.74,
    tableCloth: 0.1,
    chairSeat: 0.4,
    chairH: 0.42,
    chairBack: 0.34,
    chairDist: 0.62,
    parasolH: 2.3,
    parasolRise: 0.3,
    pole: 0.035,
    menuW: 0.5,
    menuH: 0.8,
    planter: { w: 0.8, d: 0.36, h: 0.4, bush: 0.28 },
    chairColors: [CORAL, TEAL, GOLD, SKY, MINT] as readonly string[],
  },
  /** Stalls 0 fish · 1 fruit · 2 postcards, 2 × 1.6 plan. */
  stall: {
    w: 2,
    d: 1.6,
    counterH: 0.9,
    counterD: 0.7,
    postH: 2.1,
    canopyRise: 0.28,
    fish: ['#C9D2DC', '#9FB4C8', '#E8A5A0', '#8FA6BC'],
    ice: '#DDF3FA',
    crates: [WOOD.planks, WOOD.dock],
    fruit: [CORAL, GOLD, FOLIAGE.deciduous[0], TERRA, '#FF8FB1'],
    cards: [SKY, CORAL, GOLD, MINT, SALMON, CREAM],
    set: [1, 0, 3] as readonly number[],
  },
  /** Boats; `hull` length x beam, bow +z, keel sinks `draft` under the water line. */
  boat: {
    draft: 0.2,
    sloop: {
      len: 5.5,
      beam: 1.8,
      deckY: 0.82,
      mastH: 6.5,
      mastZ: 0.55,
      boot: S[3],
      side: WHITE,
      stripe: CORAL,
      sail: CREAM,
    },
    cruiser: {
      len: 5,
      beam: 2,
      deckY: 0.85,
      boot: S[1],
      side: WHITE,
      stripe: TEAL,
    },
    day: {
      len: 3.2,
      beam: 1.4,
      floorY: 0.28,
      rimY: 0.62,
      hull: SKY,
      rim: CREAM,
      canopy: [GOLD, WHITE],
    },
    caique: {
      len: 4,
      beam: 1.6,
      floorY: 0.3,
      rimY: 0.66,
      hull: TEAL,
      stripe: GOLD,
      rim: CREAM,
      mastH: 2.1,
    },
    bob: true,
  },
  pontoon: {
    w: 1.2,
    len: 6,
    deckTop: 0.34,
    deckThick: 0.08,
    floatW: 0.42,
    floatH: 0.5,
    plank: 0.5,
    tones: [WOOD.planks, WOOD.dock],
    floatCol: WHITE,
    cleats: [-2.2, -0.6, 1.0, 2.5],
  },
  tower: {
    r: 1.5,
    plinthH: 0.55,
    bodyH: 4.1,
    bodyTop: 1.22,
    corbelH: 0.4,
    corbelR: 1.62,
    merlons: 8,
    merlonH: 0.56,
    floorCol: S[3],
    stone: S[0],
    band: S[2],
    plinth: S[1],
    pole: 1.55,
    flag: { len: 1.15, h: 0.42 },
    lamp: { r: 0.17, post: 0.55 },
    seg: 10,
  },
} as const;
