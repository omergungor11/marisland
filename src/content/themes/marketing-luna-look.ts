/**
 * Marketing "Deniz Üstü Lunapark" kit look (M53 TASK-670, D-172): every colour and dimension of the
 * sea-top fun park: the ring platform on piles, the swing ride, drop tower, carousel, the mini
 * coaster and its worm train, bumper boats, neon gate, ticket booth, food carts, prize stall and the
 * small furniture. Geometry: geo/themes/marketing-luna*.ts; the placement contract (keys, sizes,
 * pivots): content/themes/marketing-luna.ts. Palette references only (ART_BIBLE §2 Marketing: coral
 * accent, cream, gold, sky, mint, lilac); the planks, slab and piles are the Carnival Pier deck's own
 * tones (content/themes/marketing-harbour.ts), the wheel is the land fair's `ferrisWheel`. Lengths in u.
 */
import { CARNIVAL_PIER } from './marketing-harbour.ts';
import * as dm from '../../core/math/dmath.ts';
import { MEDIA_ROCK } from './marketing.ts';

const C = MEDIA_ROCK.colors;
const D = CARNIVAL_PIER.deck;

export const LUNA_LOOK = {
  pal: {
    coral: C.accent,
    cream: C.cream,
    blush: C.blush,
    gold: C.gold,
    sky: C.sky,
    mint: C.mint,
    lilac: C.lilac,
    pink: '#FF8FB1',
    white: '#FAFAF5',
    steel: C.steel,
    ink: C.bezel,
    warm: C.warm,
    wood: D.beam,
    woodLight: D.tones[0],
    leaf: '#4FA36B',
    dark: '#5A4A55',
  },
  /** Chasing bulb colours (as the Carnival Pier's arches). */
  bulbs: ['#FFC870', '#FFF4E0', '#FF8FB1'] as const,
  /** Rider / prize / horse colour cycle. */
  cycle: [C.accent, C.sky, C.gold, C.mint, C.lilac, '#FF8FB1', C.cream, '#FF9F7A'] as const,

  /**
   * The ring platform: one parametric piece per size (pivot on the water, plank top `top` over it,
   * the Carnival Pier's own planks / slab / piles). A ring `ring` wide round an open pool; the pier
   * (the skeleton's T, on the -x side) meets the outer edge mid-way (`entry` wide gap in the rail),
   * the bumper boats' landing is a `landing` wide gap in the pool rail on the +z (sea) side.
   */
  deck: {
    top: D.top,
    thick: D.thick,
    plank: 0.5,
    gapTone: D.gapTone,
    tones: D.tones,
    beam: D.beam,
    pileColor: D.pileColor,
    pileR: 0.15,
    /** Pile spacing along an edge; piles reach `pileDepth` under the waterline. */
    pile: 2.4,
    pileDepth: 0.4,
    ring: 7,
    sizes: [
      { w: 30, d: 22 },
      { w: 36, d: 26 },
      { w: 42, d: 30 },
    ] as const,
    entry: 4.6,
    landing: 5,
    /** Guard rail on both edges: posts every `post` u, a bar, a bulb on every post. */
    rail: { h: 1.0, post: 2.4, postR: 0.05, bar: 0.07, bulb: 0.09, color: C.cream, top: C.accent },
    /** LOD1 keeps one bulb in `thin`. */
    thin: 4,
  },

  /** Chain swing ride: tower, canopy (rotor) with `chairs` hanging on chains `tilt` rad out. */
  swing: {
    step: { r: 3.15, h: 0.3 },
    disc: { r: 2.55, color: C.mint },
    tower: { r0: 0.52, r1: 0.4, h: 5.3, bands: 7 },
    collar: { r: 0.58, h: 0.22, color: C.gold },
    /** Hinge height over the plank top (the rotor's origin). */
    hingeY: 5.6,
    canopy: { r: 3.35, rise: 1.15, segs: 10, bulbs: 14 },
    arms: { n: 10, r: 2.55 },
    chain: { len: 3.6, tilt: 0.25, w: 0.045, gap: 0.2 },
    chair: { w: 0.55, d: 0.5, seat: 0.12, back: 0.5 },
    finial: { r: 0.26, pole: 0.5 },
  },

  /** Drop tower: striped square column; the gondola ring (rotor) travels between `lo` and `hi`. */
  drop: {
    plinth: { w: 3.4, h: 0.35 },
    column: { w: 1.0, from: 0.35, to: 8.2, bands: 8 },
    rail: { w: 0.1, off: 0.56, color: C.gold },
    cap: { w: 2.3, h: 0.4 },
    roof: { r: 1.15, h: 0.6 },
    star: { r: 0.34, y: 1.1 },
    bulbRows: 7,
    car: { w: 2.7, hole: 1.2, h: 0.34, seatDrop: 0.85, seatW: 1.5, seatD: 0.55, reach: 1.25 },
    /** Gondola centre height over the plank top: at the bottom and at the top of the ride. */
    lo: 1.5,
    hi: 7.2,
  },

  /** Carousel: low plinth, a gold centre pole and a striped roof (static); platform + horses (rotor). */
  carousel: {
    step: { r: 3.45, h: 0.18 },
    plinth: { r: 3.25, h: 0.42 },
    pole: { r: 0.34 },
    posts: { n: 8, r: 3.2, rad: 0.06 },
    fascia: { r: 3.5, y: 4.5, h: 0.55, segs: 16 },
    roof: { r: 3.6, rise: 1.5, segs: 16 },
    finial: { r: 0.25, pole: 0.7 },
    bulbs: 16,
    /** Platform: top height over the plank top (= the rotor's origin), radius, thickness. */
    platform: { y: 0.55, r: 3.05, h: 0.13 },
    drum: { r: 1.05, h: 3.3 },
    horses: { n: 8, r: 2.2, bob: 0.22, pole: 3.6 },
  },

  /** Mini coaster: a stadium loop (radius `R`, straights `a`) hung on gold columns over deck and water. */
  coaster: {
    R: 3,
    /** Loop lengths (x extent) of the three sizes, matched to the decks' gaps between corner pads. */
    lengths: [14, 20, 26] as const,
    /** Rail-top height: valley, and the hills' extra rise on the deck straight / the sea straight. */
    base: 1.9,
    hillDeck: { rise: 2.6, sigma: 1.7 },
    hillSea: { rise: 1.7, sigma: 1.3 },
    /** Control point spacing (u). */
    spacing: 1.5,
    gauge: 0.7,
    rail: { r: 0.07, color: C.cream },
    spine: { r: 0.17, drop: 0.2, color: C.accent },
    tie: { len: 1.05, w: 0.22, h: 0.06, every: 0.75, color: C.sky },
    column: { every: 3, r0: 0.17, r1: 0.13, color: C.gold, foot: 0.4, minClear: 0.5 },
    /** Where the columns end: over the deck, and under the sea (below the water). */
    groundDeck: 0,
    groundSea: -1.1,
    /** Station: a boarding platform is not modelled; the train rests at this arc length. */
    stationS: 0,
    step: [0.6, 1.5] as const,
  },
  train: {
    cars: 4,
    head: { len: 1.8, w: 1.05, h: 1.0, color: C.mint },
    car: { len: 1.45, w: 0.95, h: 0.62 },
    colors: [C.accent, C.gold, C.sky] as const,
    gap: 0.12,
  },

  /** Bumper boats: a tube ring on the pool, a cabin, a pennant mast and a night lamp; 3 colours. */
  boat: {
    r: 0.85,
    tube: 0.3,
    y: 0.22,
    colors: [C.accent, C.sky, C.gold] as const,
    mast: 1.0,
  },

  /** Neon sign gate: two candy towers, a lit sign (wheel, star, coaster icons) and a bulb border. */
  gate: {
    tower: { r: 0.55, h: 4.3, bands: 7, cap: 1.0 },
    span: 5.2,
    beam: { y: 3.7, h: 0.5 },
    sign: { w: 4.8, h: 1.9, y: 4.25, d: 0.3 },
    bulbs: 14,
    bulbR: 0.1,
  },

  stand: {
    booth: { w: 1.9, d: 1.6, h: 1.95, roof: 0.7 },
    cart: { w: 1.6, d: 1.0, bodyH: 0.85, wheelR: 0.3 },
    prize: { w: 3.2, d: 1.8, h: 2.7, counter: 0.95 },
    plush: ['#C98F5E', '#FFD9D2', '#B9A3E8', '#7FD8B3', '#FFE45C', '#7CC4FF'] as const,
  },
  decor: {
    balloons: [C.accent, C.gold, C.sky, C.mint, C.lilac, '#FF8FB1', C.cream] as const,
    bench: { w: 1.7, d: 0.55, h: 0.85 },
    rail: { len: 2, postH: 0.95 },
    post: { h: 2.6 },
  },
} as const;

/** The coaster loop's control points (kit frame: x along the loop, z across, y = rail top). */
export function lunaCoasterPoints(length: number): Array<[number, number, number]> {
  const K = LUNA_LOOK.coaster;
  const R = K.R;
  const a = length / 2 - R;
  const straight = 2 * a;
  const arc = Math.PI * R;
  const total = 2 * straight + 2 * arc;
  const bump = (s: number, c: number, sigma: number): number => dm.exp(-(((s - c) / sigma) ** 2));
  // arc-length positions: 0 = start of the deck straight (x = -a), going +x at z = +R
  const height = (s: number): number => {
    const sd = straight;
    const sSea = straight + arc;
    let y = K.base;
    y += K.hillDeck.rise * bump(s, sd / 2, K.hillDeck.sigma);
    // the sea straight: two lower hills at a quarter and three quarters
    y += K.hillSea.rise * bump(s, sSea + sd * 0.27, K.hillSea.sigma);
    y += K.hillSea.rise * bump(s, sSea + sd * 0.73, K.hillSea.sigma);
    return y;
  };
  const n = Math.max(12, Math.round(total / K.spacing));
  const pts: Array<[number, number, number]> = [];
  for (let i = 0; i < n; i++) {
    const s = (i / n) * total;
    let x: number;
    let z: number;
    if (s < straight) {
      x = -a + s;
      z = R;
    } else if (s < straight + arc) {
      const t = (s - straight) / R;
      x = a + R * dm.sin(t);
      z = R * dm.cos(t);
    } else if (s < 2 * straight + arc) {
      x = a - (s - straight - arc);
      z = -R;
    } else {
      const t = (s - 2 * straight - arc) / R;
      x = -a - R * dm.sin(t);
      z = -R * dm.cos(t);
    }
    pts.push([x, height(s), z]);
  }
  return pts;
}
