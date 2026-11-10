/**
 * Marketing "Deniz Üstü Lunapark" kit contract (M53 TASK-670, D-172): the pieces the sea-top fun park is
 * built from. The plan (world/gen/plans/marketing-harbour.ts, TASK-666) places fixtures by these refs and
 * reads only the keys, sizes and pivots; the props task (TASK-670) owns the values. Look numbers live in
 * marketing-luna-look.ts. Pattern of marketing-marina.ts (MARINA_KIT).
 *
 * Frames. Every ref is `{ defId, variant, w, d, h }`: `w` across the front, `d` front to back, `h` to the
 * highest point (u); the numbers are the measured bounds of the built geometry (geo/themes/
 * marketing-luna.test.ts pins them within 3 %). Pivots:
 *  - `lunaDeck` is a floating fixture (FLOATING_FIXTURES): pivot on the WATER at the platform's centre,
 *    plank top at `deckY` over it, front = +z = the sea side. Its x and z are centred on the box.
 *  - everything that stands on the platform (rides, coaster, gate, stands, decor) has its pivot on the
 *    PLANK TOP (place it at y = the platform's y + `deckY`, like the Carnival Pier's wheel and screen).
 *    Rides and the gate: pivot on the vertical axis (the swing, drop tower, carousel are round about it).
 *  - geo-only movers (no PropDef, `buildProp(geo, seed, variant, lod)`) have their pivot on their own
 *    rotation / travel axis, `at` = that point relative to the base's pivot, so a mover's matrix is
 *    `base matrix * translate(at) * motion`. Boats: pivot on the water line (a floating fixture's y).
 * Front = +z everywhere. Deck frame of `lunaLayout`: origin at the platform centre, +z = sea side
 * (the ferry pier meets the -x edge mid-way, the island is at -z).
 */
import { LUNA_LOOK as L } from './marketing-luna-look.ts';

export interface LunaRef {
  defId: string;
  variant: number;
  w: number;
  d: number;
  h: number;
}

const ref = (defId: string, variant: number, w: number, d: number, h: number): LunaRef => ({
  defId,
  variant,
  w,
  d,
  h,
});

/**
 * A moving part: where its pivot sits on the base and how it moves. Motion itself: a later task. `h` of a
 * mover is its vertical EXTENT (it reaches below its pivot: the swing's chairs hang 3.8 u under the hinge).
 */
export interface LunaMover extends LunaRef {
  /** Geo-only mesh id (buildProp). */
  geo: string;
  /** Pivot relative to the base's pivot (on the axis). */
  at: readonly [x: number, y: number, z: number];
  /** `spin`: turns about local +y; `lift`: slides along +y between `range`; `path`: rides the coaster spline. */
  motion: 'spin' | 'lift' | 'path' | 'float';
  /** Lift: [lowest, highest] pivot height over the base's pivot. */
  range?: readonly [number, number];
}

const mover = (
  geo: string,
  variant: number,
  w: number,
  d: number,
  h: number,
  at: readonly [number, number, number],
  motion: LunaMover['motion'],
  range?: readonly [number, number],
): LunaMover => ({ ...ref(geo, variant, w, d, h), geo, at, motion, range });

export const LUNA_KIT = {
  /** Plank top over the water (= the Carnival Pier's `kit.deckY`). */
  deckY: L.deck.top,
  /** The ring platform, three sizes; `ring` = walkway width, `pool` = the open water inside. */
  deck: L.deck.sizes.map((s, i) => ({
    ...ref('lunaDeck', i, s.w, s.d, 1.91),
    ring: L.deck.ring,
    pool: { w: s.w - 2 * L.deck.ring, d: s.d - 2 * L.deck.ring },
  })),
  /** Gaps in the rails: at the pier (centre of the -x edge) and the boats' landing (+z side of the pool). */
  entry: L.deck.entry,
  landing: L.deck.landing,
  ride: {
    /** Chain swing: base + canopy / chairs (the rotor spins about +y at the hinge). */
    swing: {
      base: ref('lunaRide', 0, 6.21, 6.3, 5.6),
      top: mover('lunaSwingTop', 0, 7.43, 7.22, 5.7, [0, L.swing.hingeY, 0], 'spin'),
    },
    /** Drop tower: base + gondola ring (lifts along +y). Base box is 3.4 x 4.15: the entry steps run out in +z. */
    drop: {
      base: ref('lunaRide', 1, 3.4, 4.15, 10.04),
      car: mover('lunaDropCar', 0, 3.05, 3.05, 1.02, [0, L.drop.lo, 0], 'lift', [
        L.drop.lo,
        L.drop.hi,
      ]),
    },
    /** Carousel: base (plinth, pole, roof) + platform with drum and horses (spins about +y). */
    carousel: {
      base: ref('lunaRide', 2, 7.21, 7.7, 7.5),
      top: mover('lunaCarouselTop', 0, 6.1, 6.1, 3.73, [0, L.carousel.platform.y, 0], 'spin'),
    },
    /** The park wheel: the land fair's `ferrisWheel` (no new geometry), rotor = buildWheelRotor via render/movers.ts. */
    wheel: { defId: 'ferrisWheel', variant: 0, scale: 1.0, w: 6.2, d: 3.6, h: 10.7 },
  },
  /**
   * Mini coaster loop, three lengths matched to the decks' gaps between the corner pads (deck w - 2 ring).
   * Pivot on the plank top at the loop's centre; the deck straight is at local z = +3, the sea straight at
   * z = -3, so put the pivot on the platform's shore edge (z = -d / 2): the deck half stands on the ring, the
   * other half hangs over the water (its columns go under the surface, y down to -1.1). The train rides
   * `createCoasterSpline(lunaCoasterPoints(length), { closed: true })` in that same frame.
   */
  coaster: [
    ref('lunaCoaster', 0, 15.04, 7.11, 4.23),
    ref('lunaCoaster', 1, 21.04, 7.1, 4.23),
    ref('lunaCoaster', 2, 27.04, 7.1, 4.22),
  ],
  coasterLengths: L.coaster.lengths,
  /** The worm train: a head and `cars` passenger cars; origin = rail top centre, front +z, coupled `gap` apart. */
  train: {
    head: mover('lunaTrain', 0, 1.16, 1.92, 1.79, [0, 0, 0], 'path'),
    /** Passenger cars: v1 coral, v2 gold, v3 sky (cycle them down the train). */
    car: [1, 2, 3].map((v) => mover('lunaTrain', v, 1.16, 1.49, 0.92, [0, 0, 0], 'path')),
    cars: L.train.cars - 1,
    gap: L.train.gap,
  },
  /** Bumper boats, 3 colours (coral, sky, gold); pivot on the water line, they float and bump about the pool. */
  boat: [
    mover('lunaBoat', 0, 2.3, 2.31, 1.6, [0, 0, 0], 'float'),
    mover('lunaBoat', 1, 2.3, 2.31, 1.6, [0, 0, 0], 'float'),
    mover('lunaBoat', 2, 2.3, 2.31, 1.6, [0, 0, 0], 'float'),
  ],
  /** The neon sign gate at the pier mouth: pivot between the towers, the sign faces +z. */
  gate: ref('lunaGate', 0, 7.0, 1.8, 6.3),
  booth: ref('lunaStand', 0, 2.66, 2.66, 2.89),
  /** Food carts: 0 cotton candy, 1 popcorn, 2 ice cream. */
  cart: [
    ref('lunaStand', 1, 2.2, 2.63, 2.71),
    ref('lunaStand', 2, 2.3, 2.38, 2.72),
    ref('lunaStand', 3, 1.8, 1.8, 2.86),
  ],
  prize: ref('lunaStand', 4, 3.3, 2.34, 2.67),
  balloons: ref('lunaDecor', 0, 1.47, 1.12, 2.66),
  bench: ref('lunaDecor', 1, 1.7, 0.58, 0.9),
  queueRail: ref('lunaDecor', 2, 2.24, 0.24, 1.11),
  bulbPost: ref('lunaDecor', 3, 1.53, 1.53, 2.74),
  /** String-bulb strips between posts / gate / rides: the existing `bunting` v5 / `bulbString` (marketing-quick), not new geometry. */
} as const;

/** One placed piece of the suggested layout (deck frame, see the header). */
export interface LunaPlacement {
  key: string;
  ref: LunaRef;
  x: number;
  z: number;
  rotY: number;
  /** 'water': a floating fixture / mover on the water line; 'deck': pivot on the plank top. */
  on: 'water' | 'deck';
  /** Uniform scale (the wheel). */
  scale?: number;
}

/**
 * The suggested layout for deck size `size` (0 = 30 x 22, 1 = 36 x 26, 2 = 42 x 30): rides on the four
 * corner pads (swing next to the pier on the shore side, drop tower on the far shore corner, carousel next
 * to the pier on the sea side, the wheel on the far sea corner), the coaster on the shore edge between the
 * two shore pads, the bumper pool in the middle with its landing on the sea side, the gate at the pier
 * mouth with the booth beside it, food carts and the prize stall along the sea edge, benches and the
 * balloons on the far strip, queue rails at the rides, bulb posts along the pool rail.
 */
export function lunaLayout(size: 0 | 1 | 2): LunaPlacement[] {
  const D = LUNA_KIT.deck[size];
  const hx = D.w / 2;
  const hz = D.d / 2;
  const rw = D.ring;
  const px = hx - rw / 2;
  const pz = hz - rw / 2;
  const out: LunaPlacement[] = [];
  const add = (
    key: string,
    r: LunaRef,
    x: number,
    z: number,
    rotY: number,
    extra: Partial<LunaPlacement> = {},
  ): void => {
    out.push({ key, ref: r, x, z, rotY, on: 'deck', ...extra });
  };
  // the corner rides
  add('swing', LUNA_KIT.ride.swing.base, -px, -pz, 0);
  add('drop', LUNA_KIT.ride.drop.base, px, -pz, 0);
  add('carousel', LUNA_KIT.ride.carousel.base, -px, pz, 0);
  const W = LUNA_KIT.ride.wheel;
  add('wheel', ref('ferrisWheel', 0, W.w, W.d, W.h), px, hz - 2.4, 0, { scale: W.scale });
  // the coaster loop on the shore edge (its sea half over the water)
  add('coaster', LUNA_KIT.coaster[size], 0, -hz, 0);
  // the gate at the pier mouth, facing the pier (-x), the booth beside it
  add('gate', LUNA_KIT.gate, -hx + 1.3, 0, -Math.PI / 2);
  add('booth', LUNA_KIT.booth, -hx + 1.6, 4.4, -Math.PI / 2);
  // food carts and the prize stall along the sea edge, facing the pool
  const seaZ = hz - 1.5;
  const k = hx - rw; // pool half width
  add('cart0', LUNA_KIT.cart[0], -k * 0.62, seaZ, Math.PI);
  add('cart1', LUNA_KIT.cart[1], -k * 0.28, seaZ, Math.PI);
  add('prize', LUNA_KIT.prize, k * 0.45, seaZ, Math.PI);
  add('cart2', LUNA_KIT.cart[2], k * 0.8, seaZ, Math.PI);
  // the far strip: benches facing the pool, balloons
  const farX = hx - 1.4;
  add('bench0', LUNA_KIT.bench, farX, -1.8, -Math.PI / 2);
  add('bench1', LUNA_KIT.bench, farX, 1.8, -Math.PI / 2);
  add('balloons0', LUNA_KIT.balloons, farX, 0, 0);
  add('balloons1', LUNA_KIT.balloons, -hx + 1.2, -3.2, 0);
  // queue rails in front of the rides (towards the pool)
  add('queue0', LUNA_KIT.queueRail, -px, -pz + 3.9, 0);
  add('queue1', LUNA_KIT.queueRail, px, -pz + 3.9, 0);
  add('queue2', LUNA_KIT.queueRail, -px, pz - 3.9, 0);
  // bulb posts along the pool rail
  const ix = hx - rw;
  const iz = hz - rw;
  for (const [i, x] of [-ix * 0.5, ix * 0.5].entries()) {
    add(`post${i}`, LUNA_KIT.bulbPost, x, iz + 0.8, 0);
    add(`post${i + 2}`, LUNA_KIT.bulbPost, x, -iz - 0.8, 0);
  }
  // bumper boats on the pool (water line), spread by fractions of the pool
  const bx = D.pool.w / 2 - 1.5;
  const bz = D.pool.d / 2 - 1.5;
  const spots: ReadonlyArray<readonly [number, number]> = [
    [-0.62, -0.3],
    [-0.2, 0.45],
    [0.2, -0.5],
    [0.6, 0.3],
    [0.0, 0.0],
  ];
  spots.forEach(([fx, fz], i) =>
    add(`boat${i}`, LUNA_KIT.boat[i % 3], fx * bx, fz * bz, i * 1.3, { on: 'water' }),
  );
  return out;
}
