import { createNoise } from '../../core/noise.ts';
import type { Rng } from '../../core/rng.ts';
import { lerp } from '../../core/math/index.ts';
import { WATER_BANDS } from '../../content/palette.ts';
import type { Heightfield, IslandData } from '../types.ts';
import { Zone } from '../types.ts';
import { cellX, cellZ } from './grid.ts';
import { leewardness, windwardCliffness } from './heightfield.ts';
import { Tag } from './profiles.ts';
import { ARCHETYPES, WINDWARD_CLIFF, ZONE_RULES } from '../../content/islands.ts';

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

export interface ZoneInputs {
  h: Heightfield;
  sdf: Float32Array;
  islandMap: Uint8Array;
  /** Island id + 1 of the nearest coast for every cell. */
  owner: Uint8Array;
  tags: Uint8Array;
  islands: IslandData[];
  windDir: number;
}

/**
 * Zone map (ARCHITECTURE §2 steps 3–4). Water by shore-distance bands
 * (WATER_BANDS; lagoon/shallow widen leeward like the shelf, shrink on Beacon
 * Rock's windward face; enclosed atoll lagoons are all `lagoon`); land by
 * slope × height band × moisture / cluster noise with the archetype's rule
 * block (content/islands.ts) and profile tags.
 */
export function buildZones(inp: ZoneInputs, rng: Rng): Uint8Array {
  const { h, sdf, islandMap, owner, tags, islands, windDir } = inp;
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
      const tag = tags[i];
      if (s <= 0) {
        const dist = -s;
        if (tag & Tag.lagoon) {
          zone[i] = Zone.lagoon;
          continue;
        }
        if (dist > WATER_BANDS.midMax) {
          zone[i] = Zone.deep;
          continue;
        }
        const isl = owner[i] > 0 ? islands[owner[i] - 1] : null;
        let k = isl ? lerp(1, WATER_BANDS.leewardRingScale, leewardness(isl, windDir, x, z)) : 1;
        let midMax: number = WATER_BANDS.midMax;
        const cliff = isl ? windwardCliffness(isl, windDir, x, z) : 0;
        if (cliff > 0) {
          k = lerp(k, WINDWARD_CLIFF.bandScale, cliff);
          midMax = lerp(midMax, midMax * WINDWARD_CLIFF.midScale, cliff);
        }
        zone[i] =
          dist <= WATER_BANDS.lagoonMax * k
            ? Zone.lagoon
            : dist <= WATER_BANDS.shallowMax * k
              ? Zone.shallow
              : dist <= midMax
                ? Zone.mid
                : Zone.deep;
        continue;
      }
      const isl = islands[islandMap[i] - 1];
      const rules = ARCHETYPES[isl.archetype].zones;
      const y = h.data[i];
      if (rules.sandOnly) {
        zone[i] = s <= ZONE_RULES.wetSand ? Zone.sandWet : Zone.sandDry;
        continue;
      }
      const slope = slopeAtCell(h, ix, iz);
      const forced = (tag & Tag.cliff) !== 0 && slope > rules.forcedCliffSlope;
      const cliff = rules.cliff === 'slope' ? slope > ZONE_RULES.cliffSlope || forced : forced;
      const pond = (tag & Tag.pond) !== 0;
      const sandZone = rules.sand === 'sandBlack' ? Zone.sandBlack : Zone.sandDry;
      if (cliff) {
        zone[i] = Zone.cliff;
      } else if (tag & Tag.crater) {
        zone[i] = Zone.crater;
      } else if (s <= ZONE_RULES.wetSand && !pond) {
        zone[i] = rules.sandRing ? sandZone : Zone.sandWet;
      } else if (y < ZONE_RULES.sandMaxY && !pond) {
        zone[i] = sandZone;
      } else if (
        (tag & Tag.cliff) !== 0 ||
        (slope > ZONE_RULES.rockSlope && y >= rules.rockMinFrac * isl.peakY) ||
        (rules.rockAboveFrac !== undefined && y >= rules.rockAboveFrac * isl.peakY) ||
        (rules.rockBands !== undefined &&
          y >= rules.rockBands.from &&
          (y - rules.rockBands.from) % rules.rockBands.step < rules.rockBands.width)
      ) {
        zone[i] = Zone.rock;
      } else if (rules.patchwork && tag & Tag.field && slope <= ZONE_RULES.fieldMaxSlope) {
        zone[i] = Zone.field;
      } else if (rules.patchwork && tag & Tag.meadow) {
        zone[i] = Zone.meadow;
      } else {
        const forest = noise.fbm(x * fs + 17.3, z * fs - 8.1, 3);
        const moist = noise.fbm(x * ms - 5.7, z * ms + 21.9, 3);
        if (
          forest > rules.forestThreshold &&
          slope < (rules.forestMaxSlope ?? ZONE_RULES.forestMaxSlope) &&
          s > (rules.forestMinShore ?? ZONE_RULES.forestMinShore) &&
          y < (rules.forestMaxFrac ?? ZONE_RULES.forestMaxFrac) * isl.peakY
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
