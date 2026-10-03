import { WATER_BANDS } from '../../content/palette.ts';

/**
 * Shore-distance → colour band (ART_BIBLE §2). The TS function is the reference;
 * the shader gets the same thresholds through `bandDefines()` so both agree.
 */
export type WaterBand = 'lagoon' | 'shallow' | 'mid' | 'deep';

/** `d` = distance from shore in u (≥ 0 in water), already divided by the leeward scale. */
export function bandForDistance(d: number): WaterBand {
  if (d < WATER_BANDS.lagoonMax) return 'lagoon';
  if (d < WATER_BANDS.shallowMax) return 'shallow';
  if (d < WATER_BANDS.midMax) return 'mid';
  return 'deep';
}

/**
 * Leeward ring scale for a shore normal (unit, pointing toward land) and the wind
 * direction (unit, the way the wind blows). Downwind coasts (normal opposite to the
 * wind) get the full `leewardRingScale`, windward coasts 1×.
 */
export function leewardScale(nx: number, nz: number, wx: number, wz: number): number {
  const lee = 0.5 - 0.5 * (nx * wx + nz * wz);
  return 1 + (WATER_BANDS.leewardRingScale - 1) * lee;
}

const f = (n: number): string => (Number.isInteger(n) ? `${n}.0` : `${n}`);

export function bandDefines(): string {
  return [
    `#define MAR_LAGOON_MAX ${f(WATER_BANDS.lagoonMax)}`,
    `#define MAR_SHALLOW_MAX ${f(WATER_BANDS.shallowMax)}`,
    `#define MAR_MID_MAX ${f(WATER_BANDS.midMax)}`,
    `#define MAR_FOAM_MIN ${f(WATER_BANDS.foamLine[0])}`,
    `#define MAR_FOAM_MAX ${f(WATER_BANDS.foamLine[1])}`,
    `#define MAR_LEEWARD_SCALE ${f(WATER_BANDS.leewardRingScale)}`,
  ].join('\n');
}

export { f as glslFloat };
