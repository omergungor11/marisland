/**
 * Ground art painted by the terrain shader (TASK-468, D-057 / D-060): no meshes, no draw calls —
 * analytic shapes over the albedo, fed from world data (render/terrain/ground-art.ts).
 *
 * - HQ compass mosaic (hq-design H1): over the 'compass' district (the round plaza), a rim band
 *   that makes the plaza read round, seven two-tone rays toward the `cultureGate` fixtures (each in
 *   its culture's accent, its gate marked by a dot on the rim) and a centre medallion.
 * - Marketing red carpet (TASK-481, M7): over the 'carpet' district (the Ad Boulevard) a crisp straight
 *   strip of deep-red pile with gold trim lines either side and a gold star on a cream plate every
 *   `pitch` u down both edges, so the street reads as one straight red line from T1.
 * - Design prism pools (hq-design D3): under every `prismArch` a rainbow pool of sun light thrown
 *   through the prism — offset away from the sun, stretched and brightest at golden hour; at night
 *   (lamps on) a softer pool right under the glowing prism.
 * - Marketing marina quay (TASK-664): over the Horseshoe Harbour's ring (the plan's deck shape,
 *   rebuilt from the `marina*` anchors) cream stone flags laid in courses round the basin, a dark
 *   coping band along every water edge, and a darker stone face below it, so the quay reads as a
 *   built harbour wall, not a beach.
 */
import { WALLS, WALL_STRATA } from './palette.ts';
import { CULTURE_ACCENT, GROUT, PAVING } from './themes/hq.ts';
import { DESIGN_CULTURE_KIT } from './props-themes/design.ts';
import { PRISM_ARCH } from './props-themes/m20.ts';
import { MARKETING_QUICK } from './themes/marketing.ts';
import { MARINA_SITE } from './themes/marketing-marina-site.ts';

/** Compass mosaic. Distances in u (plaza radius R = district w / 2, 10 today). */
export const COMPASS_MOSAIC = {
  /** Ray colours (THEME_IDS order, = the street tints' accents) and the plaza paving / grout. */
  accents: CULTURE_ACCENT,
  paving: PAVING,
  grout: GROUT,
  /** Light inlay (rim lines, medallion core). */
  inlay: WALLS[0],
  /** Share of the accent over the paving on a ray's lit half; its other half × `shade`. */
  rayMix: 0.9,
  shade: 0.72,
  /** Ray half-width where it leaves the medallion and its tip short of the rim band. */
  rayWidth: 1.15,
  tipInset: 0.15,
  /**
   * Rim band: from `rim[0]` to `rim[1]` u inside R, grout pulled `rimPaving` toward the paving
   * (full grout reads as a heavy brown hoop at W2), a light line either side.
   */
  rim: [1.25, 0.5] as const,
  rimPaving: 0.3,
  rimLine: 0.12,
  /** Gate dots on the rim band (one per ray, in its accent). */
  dot: 0.36,
  /** Centre medallion: HQ accent ring out to `hub`, light core inside `core`. */
  hub: 1.6,
  core: 1.05,
  /** Thin grout outline round rays, dots and medallion (u). */
  outline: 0.07,
  /** Paints only within ± this of the plaza height (a terrace or a stair landing stays plain). */
  heightBand: 1.0,
  /** Ray slots (≤ the culture count). */
  maxRays: 7,
} as const;

/** Prism-arch light pools. */
export const PRISM_POOLS = {
  /** Spectrum across the pool (first → last), the Design stained-glass hues. */
  colors: [
    DESIGN_CULTURE_KIT.glass.ruby,
    DESIGN_CULTURE_KIT.glass.orange,
    DESIGN_CULTURE_KIT.glass.sun,
    DESIGN_CULTURE_KIT.glass.mint,
    DESIGN_CULTURE_KIT.glass.sky,
    DESIGN_CULTURE_KIT.glass.violet,
  ],
  /** Height of the prism above the ground (the pool is its sun projection). */
  height: PRISM_ARCH.crownY + PRISM_ARCH.prismH / 2,
  /** The projected centre stays within this of the arch (u): the pool stays on the path under it. */
  maxOffset: 1.3,
  /** Pool half-length along the light (grows by `stretch` × (1 − sun y)) and half-width across. */
  length: 1.5,
  stretch: 1.3,
  width: PRISM_ARCH.poolRadius * 0.85,
  /** Light gain (× albedo): day, at full golden hour, and at night × lamps (round, under the prism). */
  day: 0.7,
  golden: 1.8,
  night: 1.1,
  /**
   * Share of the albedo's own hue in the pool (the rest is its luminance): a violet band on green
   * grass would vanish under a plain light × albedo, so the pool colours the light, not the ground.
   */
  albedoHue: 0.3,
  /** Night pool radius (u). */
  nightRadius: PRISM_ARCH.poolRadius,
  /** Sun height ramp (sin elevation) over which the day pool fades in. */
  sunY: [0.02, 0.12] as const,
  /** Arch slots (≥ DESIGN_CULTURE_SITE.prismWalk.count max). */
  maxArches: 6,
} as const;

/** Marketing red carpet (TASK-481). Distances in u; the district is the street (w across, d along). */
export const CARPET = {
  /** The strip is this much wider than the street each side (covers the painted zone's soft edge). */
  edge: MARKETING_QUICK.carpet.edge,
  /** Deep red pile, gold trim, cream plate, gold star, dark plate outline. */
  pile: '#B22A41',
  trim: '#F5C84C',
  plate: '#FFF4E0',
  star: '#E8A92E',
  outline: '#6E1A2A',
  /** Trim line: from `trim[0]` to `trim[1]` u inside the strip edge. */
  trimBand: [0.14, 0.32] as const,
  /** Plates: centred `plateInset` u inside the strip edge, every `pitch` u along, `plate` half-size, star radius. */
  plateInset: 0.95,
  pitch: 2.6,
  plateHalf: 0.4,
  starR: 0.3,
  /** Share of the underlying tile detail kept on the pile (0 = flat), and the pile's own weave (± lightness). */
  detail: 0.45,
  weave: 0.05,
  /** Paints only within ± this of the street height (a stair or a cliff below stays plain). */
  heightBand: 1.2,
} as const;

/**
 * Horseshoe Harbour quay (TASK-664, HQ palette TASK-667). Colours: Hearthholm strata (palette.ts WALL_STRATA.hq,
 * ART_BIBLE §2). Distances in u, measured on the plan's deck shape (marketing-marina.ts `where`).
 */
const MS = WALL_STRATA.hq;
export const MARINA_QUAY = {
  /** Deck stone, the coping and the quay / mole face. */
  ink: { deck: MS[0], coping: MS[3], face: MS[2] },
  /** The deck stone lifted toward the town's wall cream by this share (pale flags, not sand). */
  deckLight: WALLS[0],
  deckLightMix: 0.4,
  /** Share of the deck colour over the zone paving. */
  deckMix: 0.85,
  /** Share of the paving's own lightness (its flag relief) kept on the deck and coping. */
  deckShade: 0.6,
  /** The drawn inner edge sits `edgeInset` u inside the basin radius (mid-way down the grid's brink). */
  edgeInset: 0.5,
  /** Coping band inside every water edge: `coping` u, never under `copingPx` px. */
  coping: 0.55,
  copingPx: 1.6,
  /** A light line on the coping's deck side (u, px floor) and its share. */
  copingLip: 0.08,
  copingLipPx: 0.6,
  copingLipMix: 0.35,
  /** Face: from the drawn edge out `faceReach` u (the basin face and the moles' rock flank). */
  faceReach: MARINA_SITE.ring.flank + 1.5,
  /** The face carries on this far under the water (the shelf colour stops at the wall foot). */
  faceDepth: 1.2,
  /** Lightness of the wall shading (wet band, blocks) kept on the face / coping, as a ratio. */
  faceShade: [0.55, 1.4] as const,
  /** Outer (sea / bluff) edge: coping and face only where the shore SDF is under this (u). */
  seaSdf: [3.5, 5.5] as const,
  /** Deck stone only within ± this of the deck height (lanes up the bluff stay plain). */
  heightBand: 0.12,
  /** Below the deck by `faceBelow[0]` → `[1]` u the ground is face (the grid's brink past the edge). */
  faceBelow: [0.08, 0.25] as const,
  /** Deck shape (marketing-marina-site.ts): taper of the edges toward the mole heads. */
  taper: MARINA_SITE.ring.taper,
  edgeFlat: MARINA_SITE.ring.edgeFlat,
} as const;
