/**
 * Ground art painted by the terrain shader (TASK-468, D-057 / D-060): no meshes, no draw calls —
 * analytic shapes over the albedo, fed from world data (render/terrain/ground-art.ts).
 *
 * - HQ compass mosaic (hq-design H1): over the 'compass' district (the round plaza), a rim band
 *   that makes the plaza read round, seven two-tone rays toward the `cultureGate` fixtures (each in
 *   its culture's accent, its gate marked by a dot on the rim) and a centre medallion.
 * - Design prism pools (hq-design D3): under every `prismArch` a rainbow pool of sun light thrown
 *   through the prism — offset away from the sun, stretched and brightest at golden hour; at night
 *   (lamps on) a softer pool right under the glowing prism.
 */
import { WALLS } from './palette.ts';
import { CULTURE_ACCENT, GROUT, PAVING } from './themes/hq.ts';
import { DESIGN_CULTURE_KIT } from './props-themes/design.ts';
import { PRISM_ARCH } from './props-themes/m20.ts';

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
