import { createNoise } from '../../core/noise.ts';
import type { Rng } from '../../core/rng.ts';
import { lerp } from '../../core/math/index.ts';
import { WATER_BANDS } from '../../content/palette.ts';
import type { Heightfield, IslandData } from '../types.ts';
import { Zone } from '../types.ts';
import { cellX, cellZ } from './grid.ts';
import { leewardness, nearestIsland } from './heightfield.ts';
import { ARCHETYPES, ZONE_RULES } from './params.ts';

/** Height gradient magnitude (u per u) at grid sample (ix, iz), central differences. */
export function slopeAtCell(h: Heightfield, ix: number, iz: number): number {
  const n = h.n;
  const d = h.data;
  const xa = Math.max(0, ix - 1);
  const xb = Math.min(n - 1, ix + 1);
  const za = Math.max(0, iz - 1);
  const zb = Math.min(n - 1, iz + 1);
  const gx = (d[iz * n + xb] - d[iz * n + xa]) / ((xb - xa) * h.cellSize);
  const gz = (d[zb * n + ix] - d[za * n + ix]) / ((zb - za) * h.cellSize);
  return Math.hypot(gx, gz);
}

/**
 * Zone map (ARCHITECTURE §2 steps 3–4). Water by shore-distance bands
 * (WATER_BANDS; lagoon/shallow widen leeward like the shelf); land by
 * slope × height band × moisture / cluster noise, with archetype rules.
 */
export function buildZones(
  h: Heightfield,
  sdf: Float32Array,
  islandMap: Uint8Array,
  islands: IslandData[],
  windDir: number,
  rng: Rng,
): Uint8Array {
  const n = h.n;
  const zone = new Uint8Array(n * n);
  const noise = createNoise(rng.fork('zones'));
  const ms = 1 / ZONE_RULES.moistureScale;
  const fs = 1 / ZONE_RULES.forestScale;
  for (let iz = 0; iz < n; iz++) {
    const z = cellZ(iz);
    for (let ix = 0; ix < n; ix++) {
      const i = iz * n + ix;
      const x = cellX(ix);
      const s = sdf[i];
      if (s <= 0) {
        const dist = -s;
        if (dist > WATER_BANDS.midMax) {
          zone[i] = Zone.deep;
          continue;
        }
        const isl = nearestIsland(islands, x, z);
        const k = isl ? lerp(1, WATER_BANDS.leewardRingScale, leewardness(isl, windDir, x, z)) : 1;
        zone[i] =
          dist <= WATER_BANDS.lagoonMax * k
            ? Zone.lagoon
            : dist <= WATER_BANDS.shallowMax * k
              ? Zone.shallow
              : dist <= WATER_BANDS.midMax
                ? Zone.mid
                : Zone.deep;
        continue;
      }
      const isl = islands[islandMap[i] - 1];
      const rules = ARCHETYPES[isl.archetype].zones;
      const y = h.data[i];
      const slope = slopeAtCell(h, ix, iz);
      if (slope > ZONE_RULES.cliffSlope) {
        zone[i] = Zone.cliff;
      } else if (s <= ZONE_RULES.wetSand) {
        zone[i] = Zone.sandWet;
      } else if (y < 1.2) {
        zone[i] = rules.sand === 'sandBlack' ? Zone.sandBlack : Zone.sandDry;
      } else if (slope > ZONE_RULES.rockSlope && y >= rules.rockMinFrac * isl.peakY) {
        zone[i] = Zone.rock;
      } else {
        const forest = noise.fbm(x * fs + 17.3, z * fs - 8.1, 3);
        const moist = noise.fbm(x * ms - 5.7, z * ms + 21.9, 3);
        if (
          forest > rules.forestThreshold &&
          slope < ZONE_RULES.forestMaxSlope &&
          s > ZONE_RULES.forestMinShore &&
          y < ZONE_RULES.forestMaxFrac * isl.peakY
        ) {
          zone[i] = Zone.forest;
        } else if (moist > rules.meadowThreshold) {
          zone[i] = Zone.meadow;
        } else {
          zone[i] = Zone.grass;
        }
      }
    }
  }
  return zone;
}
