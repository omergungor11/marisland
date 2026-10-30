import { createNoise, type Noise } from '../../core/noise.ts';
import type { Rng } from '../../core/rng.ts';
import { lerp } from '../../core/math/index.ts';
import { WATER_BANDS } from '../../content/palette.ts';
import type { Heightfield, IslandData, IsletData } from '../types.ts';
import { Zone } from '../types.ts';
import { cellX, cellZ } from './grid.ts';
import { coastBody, leewardness, windwardCliffness } from './heightfield.ts';
import { Tag } from './profiles.ts';
import {
  ARCHETYPES,
  ISLETS,
  WINDWARD_CLIFF,
  ZONE_RULES,
  type ZoneRuleParams,
} from '../../content/islands.ts';
import { THEMES } from '../../content/themes/index.ts';

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
  islets: IsletData[];
  windDir: number;
}

/** Per-cell inputs shared by generation and Phase 2 local re-derivation (TASK-202). */
export interface ZoneCellContext {
  h: Heightfield;
  sdf: Float32Array;
  islandMap: Uint8Array;
  tags: Uint8Array;
  islands: IslandData[];
  islets: IsletData[];
  windDir: number;
  noise: Noise;
}

/** The zone noise stream; `rng` is the generation's `root.fork('zones')`. */
export function zoneNoise(rng: Rng): Noise {
  return createNoise(rng.fork('zones'));
}

/**
 * Zone map (ARCHITECTURE §2 steps 3–4). Water by shore-distance bands
 * (WATER_BANDS; lagoon/shallow widen leeward like the shelf, shrink on Beacon
 * Rock's windward face; enclosed atoll lagoons are all `lagoon`); land by
 * slope × height band × moisture / cluster noise with the island's rule block
 * (`zoneRulesOf`: archetype rules + theme overrides) and profile tags.
 */
export function buildZones(inp: ZoneInputs, rng: Rng): Uint8Array {
  const { h, sdf, islandMap, owner, tags, islands, islets, windDir } = inp;
  const n = h.n;
  const zone = new Uint8Array(n * n);
  const ctx: ZoneCellContext = {
    h,
    sdf,
    islandMap,
    tags,
    islands,
    islets,
    windDir,
    noise: zoneNoise(rng),
  };
  for (let iz = 0; iz < n; iz++)
    for (let ix = 0; ix < n; ix++) {
      const i = iz * n + ix;
      zone[i] = deriveZoneCell(ctx, ix, iz, owner[i]);
    }
  return zone;
}

/**
 * Zone of one grid sample from the generation rules. `owner` = island id + 1 of the nearest
 * coast (read for water samples only). Shared by `buildZones` and edits, so a re-derived cell
 * follows exactly the generation rules.
 */
export function deriveZoneCell(
  ctx: ZoneCellContext,
  ix: number,
  iz: number,
  owner: number,
): number {
  const h = ctx.h;
  const i = iz * h.n + ix;
  const s = ctx.sdf[i];
  const tag = ctx.tags[i];
  if (s <= 0) {
    const dist = -s;
    if (tag & Tag.lagoon) return Zone.lagoon;
    if (dist > WATER_BANDS.midMax) return Zone.deep;
  }
  return deriveNear(ctx, i, ix, iz, s, tag, owner);
}

const mergedRules = new Map<string, ZoneRuleParams>();

/**
 * Zone rules of an island (M14b): the archetype's rule block with the theme's `zoneRules`
 * merged over it, `{ ...ARCHETYPES[a].zones, ...THEMES[t].zoneRules }` (memoised: per-cell path).
 */
function zoneRulesOf(isl: IslandData): ZoneRuleParams {
  const base = ARCHETYPES[isl.archetype].zones;
  const over = THEMES[isl.theme].zoneRules;
  if (!over) return base;
  const key = `${isl.archetype}:${isl.theme}`;
  let rules = mergedRules.get(key);
  if (!rules) {
    rules = { ...base, ...over };
    mergedRules.set(key, rules);
  }
  return rules;
}

const FOREST_FREQ = 1 / ZONE_RULES.forestScale;
const MOIST_FREQ = 1 / ZONE_RULES.moistureScale;

/**
 * Water zone at (x, z), `dist` u from the nearest coast whose body is `owner` (island id + 1):
 * the shore-distance bands (wider leeward, narrower on Beacon Rock's windward face). Shared by
 * the generation rules and late coast changes (TASK-532: the harbour breakwater re-derives the
 * water it moved the coast for).
 */
export function waterBandZone(
  islands: readonly IslandData[],
  islets: readonly IsletData[],
  windDir: number,
  x: number,
  z: number,
  dist: number,
  owner: number,
): number {
  const body = owner > 0 ? coastBody(islands, islets, owner) : null;
  let k = body ? lerp(1, WATER_BANDS.leewardRingScale, leewardness(body, windDir, x, z)) : 1;
  let midMax: number = WATER_BANDS.midMax;
  const cliff = body?.island ? windwardCliffness(body.island, windDir, x, z) : 0;
  if (cliff > 0) {
    k = lerp(k, WINDWARD_CLIFF.bandScale, cliff);
    midMax = lerp(midMax, midMax * WINDWARD_CLIFF.midScale, cliff);
  }
  return dist <= WATER_BANDS.lagoonMax * k
    ? Zone.lagoon
    : dist <= WATER_BANDS.shallowMax * k
      ? Zone.shallow
      : dist <= midMax
        ? Zone.mid
        : Zone.deep;
}

/** `deriveZoneCell` past the cheap open-water exits (kept apart so the hot path stays small). */
function deriveNear(
  ctx: ZoneCellContext,
  i: number,
  ix: number,
  iz: number,
  s: number,
  tag: number,
  owner: number,
): number {
  const { h, islandMap, islands, islets, windDir, noise } = ctx;
  const x = cellX(ix);
  const z = cellZ(iz);
  if (s <= 0) return waterBandZone(islands, islets, windDir, x, z, -s, owner);
  const k = islandMap[i] - 1;
  const isl = k < islands.length ? islands[k] : null;
  const rules = isl ? zoneRulesOf(isl) : ISLETS[islets[k - islands.length].kind].zones;
  const peakY = isl ? isl.peakY : islets[k - islands.length].peakY;
  const y = h.data[i];
  if (rules.sandOnly) return s <= ZONE_RULES.wetSand ? Zone.sandWet : Zone.sandDry;
  const slope = slopeAtCell(h, ix, iz);
  if (rules.rockOnly)
    return slope > (rules.cliffSlope ?? ZONE_RULES.cliffSlope) ? Zone.cliff : Zone.rock;
  const forced = (tag & Tag.cliff) !== 0 && slope > rules.forcedCliffSlope;
  const slopeCliff =
    slope > (rules.cliffSlope ?? ZONE_RULES.cliffSlope) &&
    s <= (rules.slopeCliffMaxShore ?? Infinity);
  const cliff = rules.cliff === 'slope' ? slopeCliff || forced : forced;
  const pond = (tag & Tag.pond) !== 0;
  const sandZone = rules.sand === 'sandBlack' ? Zone.sandBlack : Zone.sandDry;
  if (cliff) return Zone.cliff;
  if (tag & Tag.crater) return Zone.crater;
  if (s <= ZONE_RULES.wetSand && !pond && !(y >= (rules.wetSandMaxY ?? Infinity)))
    return rules.sandRing ? sandZone : Zone.sandWet;
  if (y < ZONE_RULES.sandMaxY && !pond) return sandZone;
  if (
    (tag & Tag.cliff) !== 0 ||
    (slope > ZONE_RULES.rockSlope && y >= rules.rockMinFrac * peakY) ||
    (rules.rockAboveFrac !== undefined && y >= rules.rockAboveFrac * peakY) ||
    (rules.rockBands !== undefined &&
      y >= rules.rockBands.from &&
      (y - rules.rockBands.from) % rules.rockBands.step < rules.rockBands.width)
  )
    return Zone.rock;
  if (rules.patchwork && tag & Tag.field && slope <= ZONE_RULES.fieldMaxSlope) return Zone.field;
  if (rules.patchwork && tag & Tag.meadow) return Zone.meadow;
  const forest = noise.fbm(x * FOREST_FREQ + 17.3, z * FOREST_FREQ - 8.1, 3);
  const moist = noise.fbm(x * MOIST_FREQ - 5.7, z * MOIST_FREQ + 21.9, 3);
  if (
    forest > rules.forestThreshold &&
    slope < (rules.forestMaxSlope ?? ZONE_RULES.forestMaxSlope) &&
    s > (rules.forestMinShore ?? ZONE_RULES.forestMinShore) &&
    y < (rules.forestMaxFrac ?? ZONE_RULES.forestMaxFrac) * peakY
  )
    return Zone.forest;
  if (moist > rules.meadowThreshold) return Zone.meadow;
  return Zone.grass;
}
