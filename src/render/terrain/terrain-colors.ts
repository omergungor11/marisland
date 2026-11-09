import * as THREE from 'three';
import type { ThemeId, WorldData, ZoneId } from '../../world/types.ts';
import { isStreetZone, Zone, ZONE_COUNT } from '../../world/types.ts';
import { slopeAtCell } from '../../world/index.ts';
import { createRng } from '../../core/rng.ts';
import { createNoise, type Noise } from '../../core/noise.ts';
import { THEMES } from '../../content/themes/index.ts';
import {
  DEFAULT_GROUND,
  DETAIL_LAYER_IDS,
  DETAIL_LAYERS,
  GROUND_DETAIL,
  GROUND_MACRO,
  GROUND_MATERIALS,
  GROUND_SMOOTH,
  GROUND_WALL,
  MATERIAL_ACCENTS,
  MATERIAL_LAYERS,
  type DetailLayerId,
  type GroundSpec,
} from '../../content/ground.ts';
import { TERRAIN_AO, TERRAIN_COLORS, TERRAIN_FX, TERRAIN_SHAPE } from '../../content/terrain.ts';

/** Material classes for border blending: same class mixes fully, odd-one-out only lightly. */
export const TerrainClass = {
  under: 0,
  sand: 1,
  veg: 2,
  rock: 3,
  cliff: 4,
  path: 5,
  crater: 6,
} as const;

function classOf(zone: number, y: number): number {
  return y <= 0 ? TerrainClass.under : zoneClass(zone);
}

/**
 * Material class of a sample above water (shared with the shader's crisp class borders); stray
 * water zones on land count as vegetation.
 */
export function zoneClass(zone: number): number {
  switch (zone) {
    case Zone.sandWet:
    case Zone.sandDry:
    case Zone.sandBlack:
      return TerrainClass.sand;
    case Zone.rock:
      return TerrainClass.rock;
    case Zone.cliff:
      return TerrainClass.cliff;
    case Zone.path:
    case Zone.plaza:
      return TerrainClass.path;
    case Zone.crater:
      return TerrainClass.crater;
    default:
      return isStreetZone(zone) ? TerrainClass.path : TerrainClass.veg;
  }
}

const lin = (hex: string): THREE.Color => new THREE.Color(hex);

interface Pal {
  sandDry: THREE.Color;
  sandWet: THREE.Color;
  sandBlack: THREE.Color;
  grass: THREE.Color[];
  tip: THREE.Color;
  meadowTint: THREE.Color;
  forest: THREE.Color;
  field: THREE.Color;
  fields: THREE.Color[];
  rock: THREE.Color[];
  strata: THREE.Color[];
  path: THREE.Color;
  plaza: THREE.Color;
  crater: THREE.Color;
  seabed: THREE.Color;
  seabedDeep: THREE.Color;
}

let palCache: Pal | null = null;
function pal(): Pal {
  if (palCache) return palCache;
  const C = TERRAIN_COLORS;
  palCache = {
    sandDry: lin(C.sandDry),
    sandWet: lin(C.sandWet),
    sandBlack: lin(C.sandBlack),
    grass: C.grassBands.map((h, k) =>
      k === 0 ? lin(h).lerp(lin(C.grassFoot), C.grassFootMix) : lin(h),
    ),
    tip: lin(C.grassTip),
    meadowTint: lin(C.meadowTint),
    forest: lin(C.forest).multiplyScalar(C.forestDarken),
    field: lin(C.field),
    fields: C.fields.map(lin),
    rock: C.rock.map(lin),
    strata: C.cliffStrata.map(lin),
    path: lin(C.path),
    plaza: lin(C.plaza),
    crater: lin(C.crater),
    seabed: lin(C.seabed),
    seabedDeep: lin(C.seabedDeep),
  };
  return palCache;
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a: number, b: number, v: number): number => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

const _c = new THREE.Color();
const _d = new THREE.Color();

/** 3-stop ramp into `_c`. */
function ramp3(stops: THREE.Color[], t: number): THREE.Color {
  if (t <= 0.5) return _c.copy(stops[0]).lerp(stops[1], t * 2);
  return _c.copy(stops[1]).lerp(stops[2], (t - 0.5) * 2);
}

/** Underwater ramp (wet sand → seabed → deep seabed) by depth. */
function seabedColor(y: number, out: THREE.Color): THREE.Color {
  const P = pal();
  const S = TERRAIN_SHAPE;
  const d = -y;
  if (d <= S.wetDepth) return out.copy(P.sandWet);
  if (d <= S.seabedDepth)
    return out.copy(P.sandWet).lerp(P.seabed, smooth(S.wetDepth, S.seabedDepth, d));
  return out.copy(P.seabed).lerp(P.seabedDeep, smooth(S.seabedDepth, S.deepDepth, d));
}

const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
] as const;

/** Shade of one sample (`_shade`): concavity (crease > 0, crest < 0) and the AO multiplier. */
const _shade = { concavity: 0, ao: 1 };
function shadeAt(world: WorldData, ix: number, iz: number, cls: number): void {
  const h = world.height;
  const n = h.n;
  const d = h.data;
  const A = TERRAIN_AO;
  const at = (x: number, z: number): number =>
    d[Math.min(n - 1, Math.max(0, z)) * n + Math.min(n - 1, Math.max(0, x))];
  const y = d[iz * n + ix];
  // 8-neighbour mean → crease (concave > 0) / crest (convex < 0)
  let sum = 0;
  for (const [dx, dz] of DIRS) sum += at(ix + dx, iz + dz);
  const concavity = sum / 8 - y;
  // horizon term: mean positive elevation slope over 8 directions
  let hz = 0;
  for (const [dx, dz] of DIRS) {
    const len = Math.hypot(dx, dz) * h.cellSize * A.stepCells;
    let best = 0;
    for (let s = 1; s <= A.steps; s++) {
      const k = s * A.stepCells;
      const rise = (at(ix + dx * k, iz + dz * k) - y) / (len * s);
      if (rise > best) best = rise;
    }
    hz += best;
  }
  hz /= 8;
  const occl = clamp01(
    A.creaseWeight * clamp01(concavity / A.creaseFull) +
      A.horizonWeight * clamp01(hz / A.horizonFull),
  );
  _shade.concavity = concavity;
  // open beaches stay bright: sand only takes part of the occlusion
  _shade.ao = 1 - A.max * occl * (cls === TerrainClass.sand ? A.sandScale : 1);
}

/** Today's (untinted, unjittered) colour of sample i, linear, in the shared scratch `_c`. */
function zoneColor(
  world: WorldData,
  i: number,
  ix: number,
  iz: number,
  concavity: number,
): THREE.Color {
  const h = world.height;
  const y = h.data[i];
  const P = pal();
  const S = TERRAIN_SHAPE;
  if (y <= 0) return seabedColor(y, _c);
  const z = world.zone[i];
  switch (z) {
    case Zone.sandWet: {
      // wet at the waterline, drying inland; the shader lap re-wets the edge
      const sdf = world.shoreSdf[i];
      return _c.copy(P.sandWet).lerp(P.sandDry, 0.55 * smooth(0.6, 3, sdf));
    }
    case Zone.sandDry:
      return _c.copy(P.sandDry);
    case Zone.sandBlack:
      return _c.copy(P.sandBlack);
    case Zone.rock: {
      const sl = slopeAtCell(h, ix, iz);
      return ramp3(P.rock, smooth(S.rockSlope[0], S.rockSlope[1], sl));
    }
    case Zone.cliff:
      return _c.copy(P.strata[0]).lerp(P.strata[1], 0.5);
    case Zone.path:
      return _c.copy(P.path);
    case Zone.plaza:
      return _c.copy(P.plaza);
    case Zone.crater:
      return _c.copy(P.crater);
    default: {
      if (isStreetZone(z)) return _c.copy(P.plaza);
      // grass family (grass / meadow / forest / field, and stray water zones on land)
      const isl = world.islandMap[i] > 0 ? world.islands[world.islandMap[i] - 1] : null;
      const peak = isl ? Math.max(isl.peakY, 4) : 10;
      // island-relative ramp (TASK-614): its own height range + distance in from the lip
      const inland = smooth(
        S.grassInland[0],
        Math.max(S.grassInland[0] + 4, S.grassInland[1] * (isl?.radius ?? 20)),
        world.shoreSdf[i],
      );
      const t = clamp01(
        S.grassHeightWeight * smooth(peak * S.grassBandLowFrac, peak * S.grassBandHighFrac, y) +
          S.grassInlandWeight * inland,
      );
      const col = ramp3(P.grass, t);
      const crest = clamp01(-concavity / S.crestScale);
      if (crest > 0) col.lerp(P.tip, S.crestTip * crest);
      if (z === Zone.meadow) col.lerp(P.meadowTint, TERRAIN_COLORS.meadowMix);
      else if (z === Zone.forest) col.copy(P.forest).lerp(_d.copy(P.grass[1]), 0.15 * t);
      else if (z === Zone.field) {
        const fc = world.fieldColor?.[i] ?? 0;
        col.lerp(fc > 0 ? P.fields[fc - 1] : P.field, TERRAIN_COLORS.fieldMix);
      }
      return col;
    }
  }
}

// ---------------------------------------------------------------- M14b albedo + palette (TASK-372)

/**
 * Albedo world texture data (D-030): one RGBA8 texel per grid sample. RGB = sRGB colour (theme
 * ground × smooth ramps × crest tint × seeded macro variation × AO, land L floor; `Zone.cliff` =
 * the island's wall mean, `wallColors`; no per-face jitter and no strata bands — a vertical wall
 * spans one 2 u texel, so the shader draws those at every quality). A = island id (`islandMap`, 0 = none),
 * the palette row the shader reads per corner. Identical at every distance.
 */
export interface AlbedoGrid {
  rgba: Uint8Array;
}

/** Zones whose colour is a ramp (kept relative to a theme base); others take the base flat. */
const RAMP_ZONES = new Set<number>([Zone.sandWet, Zone.grass, Zone.meadow, Zone.forest, Zone.rock]);

const linCache = new Map<string, THREE.Color>();
const linOf = (hex: string): THREE.Color => {
  let c = linCache.get(hex);
  if (!c) linCache.set(hex, (c = new THREE.Color(hex)));
  return c;
};

const macroCache = new WeakMap<WorldData, Noise>();
const macroNoise = (world: WorldData): Noise => {
  let m = macroCache.get(world);
  if (!m) macroCache.set(world, (m = createNoise(createRng(world.seed).fork('ground-macro'))));
  return m;
};

export function buildAlbedoGrid(world: WorldData): AlbedoGrid {
  const n = world.height.n;
  const grid: AlbedoGrid = { rgba: new Uint8Array(n * n * 4) };
  fillAlbedoGrid(world, grid, 0, n - 1, 0, n - 1);
  return grid;
}

/** Earth-wall colours of a theme (TASK-613): the strata band tones and their mean, linear. */
export interface WallColors {
  tones: THREE.Color[];
  mean: THREE.Color;
}

const wallCache = new Map<string, WallColors>();
/** `GROUND_WALL.strata` of a theme (undefined = islets / no island: the default row). */
export function wallColors(theme: ThemeId | undefined): WallColors {
  const key = theme ?? 'default';
  let w = wallCache.get(key);
  if (!w) {
    const tones = GROUND_WALL.strata[key].map((h) => new THREE.Color(h));
    const mean = new THREE.Color(0, 0, 0);
    for (const t of tones) mean.add(t);
    wallCache.set(key, (w = { tones, mean: mean.multiplyScalar(1 / tones.length) }));
  }
  return w;
}

/** Theme ground spec of sample i (null = the default palette). */
function themeSpec(world: WorldData, i: number, zone: number): GroundSpec | null {
  const id = world.islandMap[i];
  const isl = id > 0 ? world.islands[id - 1] : undefined;
  if (!isl) return null;
  return THEMES[isl.theme]?.ground[zone as ZoneId] ?? null;
}

/**
 * (Re)compute the albedo texels of the inclusive sample rect (same arithmetic as the full build,
 * so an edited region matches a fresh boot of the edited world).
 */
export function fillAlbedoGrid(
  world: WorldData,
  grid: AlbedoGrid,
  ix0: number,
  ix1: number,
  iz0: number,
  iz1: number,
): void {
  const n = world.height.n;
  const R = GROUND_SMOOTH.radius;
  const out = grid.rgba;
  const x0 = Math.max(0, ix0);
  const x1 = Math.min(n - 1, ix1);
  const z0 = Math.max(0, iz0);
  const z1 = Math.min(n - 1, iz1);
  if (x1 < x0 || z1 < z0) return;
  // raw colours of the rect + the smoothing margin (sRGB 0..1) and their blend class
  const ex0 = Math.max(0, x0 - R);
  const ex1 = Math.min(n - 1, x1 + R);
  const ez0 = Math.max(0, z0 - R);
  const ez1 = Math.min(n - 1, z1 + R);
  const w = ex1 - ex0 + 1;
  const raw = new Float32Array(w * (ez1 - ez0 + 1) * 3);
  const cls = new Uint8Array(w * (ez1 - ez0 + 1));
  for (let iz = ez0; iz <= ez1; iz++)
    for (let ix = ex0; ix <= ex1; ix++) {
      const k = (iz - ez0) * w + (ix - ex0);
      cls[k] = rawAlbedo(world, ix, iz);
      raw[k * 3] = _px.r;
      raw[k * 3 + 1] = _px.g;
      raw[k * 3 + 2] = _px.b;
    }
  // smoothing (M14b polish): a binomial blur over same-class neighbours only, so zone patches of
  // one material family (forest floor in grass, slope ramps on rock) read as soft rounded
  // shapes instead of 2 u blocks; class borders stay where they are.
  const K = GROUND_SMOOTH.kernel;
  for (let iz = z0; iz <= z1; iz++)
    for (let ix = x0; ix <= x1; ix++) {
      const kc = (iz - ez0) * w + (ix - ex0);
      const c = cls[kc];
      let r = 0;
      let g = 0;
      let b = 0;
      let ws = 0;
      for (let dz = -R; dz <= R; dz++) {
        const jz = iz + dz;
        if (jz < ez0 || jz > ez1) continue;
        for (let dx = -R; dx <= R; dx++) {
          const jx = ix + dx;
          if (jx < ex0 || jx > ex1) continue;
          const k = (jz - ez0) * w + (jx - ex0);
          if (cls[k] !== c) continue;
          const wt = K[dz + R] * K[dx + R];
          r += raw[k * 3] * wt;
          g += raw[k * 3 + 1] * wt;
          b += raw[k * 3 + 2] * wt;
          ws += wt;
        }
      }
      const i = iz * n + ix;
      out[i * 4] = Math.round((r / ws) * 255);
      out[i * 4 + 1] = Math.round((g / ws) * 255);
      out[i * 4 + 2] = Math.round((b / ws) * 255);
      // palette row = island id + 1; islets (ids past the islands) use the default row 0
      out[i * 4 + 3] = world.islandMap[i] <= world.islands.length ? world.islandMap[i] : 0;
    }
}

const _px = { r: 0, g: 0, b: 0 };

/** Neighbour reach of `topVariation` in grid cells (an edit recolours this far plus the blur). */
export const TOP_REACH = Math.max(GROUND_MACRO.worn.reach, GROUND_MACRO.shore.reach);

const _e = new THREE.Color();

/**
 * Plateau top variation (TASK-614, G2), linear, in place on `col`: on vegetation the moisture /
 * wear blotches with the island theme's lean, worn grass beside paved ground and the dry blend
 * toward a neighbouring beach; on sand the matching blend toward neighbouring vegetation. Only
 * world data (zones, seeded noise), so a sub-rect refill equals the full build.
 */
function topVariation(
  world: WorldData,
  ix: number,
  iz: number,
  cls: number,
  col: THREE.Color,
  noise: Noise,
): void {
  const M = GROUND_MACRO;
  const h = world.height;
  const n = h.n;
  const veg = cls === TerrainClass.veg;
  // nearest paved / opposite-family sample (cells, Euclidean) within the reach
  const reach = veg ? TOP_REACH : M.shore.sandReach;
  let dPave = Infinity;
  let dEdge = Infinity;
  let edgeZone = -1;
  let edgeIdx = -1;
  for (let dz = -reach; dz <= reach; dz++) {
    const jz = iz + dz;
    if (jz < 0 || jz >= n) continue;
    for (let dx = -reach; dx <= reach; dx++) {
      const jx = ix + dx;
      if ((dx === 0 && dz === 0) || jx < 0 || jx >= n) continue;
      const j = jz * n + jx;
      if (h.data[j] <= 0) continue;
      const c = zoneClass(world.zone[j]);
      const d = Math.hypot(dx, dz);
      if (veg && c === TerrainClass.path && d < dPave) dPave = d;
      if (c === (veg ? TerrainClass.sand : TerrainClass.veg) && d < dEdge) {
        dEdge = d;
        edgeZone = world.zone[j];
        edgeIdx = j;
      }
    }
  }
  const x = h.originX + ix * h.cellSize;
  const zw = h.originZ + iz * h.cellSize;
  if (veg) {
    const B = M.blotch;
    const f =
      B.weights[0] * noise.n2(x / B.wavelengths[0] - 53.1, zw / B.wavelengths[0] + 17.9) +
      B.weights[1] * noise.n2(x / B.wavelengths[1] + 8.3, zw / B.wavelengths[1] - 41.6);
    const dry = smooth(B.dry[0], B.dry[1], f);
    const moist = smooth(-B.moist[0], -B.moist[1], -f);
    const id = world.islandMap[ix + iz * n];
    const theme = id > 0 ? world.islands[id - 1]?.theme : undefined;
    const L = M.themeLean[theme ?? 'default'];
    if (dry > 0) col.lerp(linOf(L.lean), L.mix * dry).multiplyScalar(1 + B.dryLight * dry);
    if (moist > 0) {
      const k = 1 - B.moistDark * moist;
      col.r *= k * (1 - B.moistCool * moist);
      col.g *= k;
      col.b *= k * (1 + B.moistCool * moist);
    }
    if (dPave <= M.worn.reach) {
      const w = 1 - (dPave - 1) / M.worn.reach;
      const grey = (col.r + col.g + col.b) / 3;
      col.lerp(_e.setRGB(grey, grey, grey), M.worn.desat * w).multiplyScalar(1 - M.worn.dark * w);
    }
  }
  const edgeReach = veg ? M.shore.reach : M.shore.sandReach;
  if (dEdge <= edgeReach) {
    // the dry blend: own colour and the neighbour's base (theme spec or default)
    const spec = themeSpec(world, edgeIdx, edgeZone);
    const other = linOf(spec?.base ?? DEFAULT_GROUND[edgeZone as ZoneId].base);
    const share = veg ? M.shore.dryShare : 1 - M.shore.dryShare;
    _e.copy(col).lerp(other, share);
    const sp =
      1 +
      M.shore.speckle * noise.n2(x / M.shore.speckleScale + 3.7, zw / M.shore.speckleScale - 9.2);
    const w = (1 - (dEdge - 1) / edgeReach) * (veg ? M.shore.mix : M.shore.sandMix) * sp;
    col.lerp(_e, clamp01(w));
  }
}

/** Unsmoothed sRGB colour of sample (ix, iz) into `_px`; returns its blend class. */
function rawAlbedo(world: WorldData, ix: number, iz: number): number {
  const h = world.height;
  const n = h.n;
  const noise = macroNoise(world);
  const M = GROUND_MACRO;
  const i = iz * n + ix;
  const y = h.data[i];
  const z = world.zone[i];
  const cls = classOf(z, y);
  shadeAt(world, ix, iz, cls);
  const col = zoneColor(world, i, ix, iz, _shade.concavity);
  const spec = y > 0 ? themeSpec(world, i, z) : null;
  if (spec) {
    const base = linOf(spec.base);
    if (RAMP_ZONES.has(z)) {
      const ref = linOf(DEFAULT_GROUND[z as ZoneId].base);
      // ramp contrast kept relative to the reference (1 = full slope / height ramp)
      const k = spec.ramp ?? 1;
      col.r = (ref.r + (col.r - ref.r) * k) * (base.r / Math.max(ref.r, 1e-4));
      col.g = (ref.g + (col.g - ref.g) * k) * (base.g / Math.max(ref.g, 1e-4));
      col.b = (ref.b + (col.b - ref.b) * k) * (base.b / Math.max(ref.b, 1e-4));
    } else col.copy(base);
  }
  if (y > 0 && (cls === TerrainClass.veg || cls === TerrainClass.sand))
    topVariation(world, ix, iz, cls, col, noise);
  if (z === Zone.cliff && y > 0) {
    // the wall's far colour: its theme's strata mean (islets: the default row)
    const id = world.islandMap[i];
    col.copy(wallColors(id > 0 ? world.islands[id - 1]?.theme : undefined).mean);
  }
  let r = linearToSrgb(clamp01(col.r));
  let g = linearToSrgb(clamp01(col.g));
  let b = linearToSrgb(clamp01(col.b));
  // macro variation: two seeded octaves (identical at every distance)
  const x = h.originX + ix * h.cellSize;
  const zw = h.originZ + iz * h.cellSize;
  const m =
    M.weights[0] * noise.n2(x / M.wavelengths[0], zw / M.wavelengths[0]) +
    M.weights[1] * noise.n2(x / M.wavelengths[1] + 31.7, zw / M.wavelengths[1] - 12.3);
  const amt =
    cls === TerrainClass.veg
      ? M.lightness.veg
      : cls === TerrainClass.sand
        ? M.lightness.sand
        : cls === TerrainClass.path
          ? M.lightness.paved
          : cls === TerrainClass.under
            ? M.lightness.under
            : M.lightness.rock;
  r *= 1 + amt * m;
  g *= 1 + amt * m;
  b *= 1 + amt * m;
  if (cls === TerrainClass.veg) {
    // green ↔ yellow lean on its own field
    const hue = noise.n2(x / 21 - 7.1, zw / 21 + 4.4) * M.vegHue;
    r *= 1 + hue;
    b *= 1 - hue;
    if (y > 0) {
      // saturation floor (TASK-614): the blotch / foot / worn tints never turn the grass muddy
      const bh = linOf(spec?.base ?? DEFAULT_GROUND[z as ZoneId].base);
      hslOf(linearToSrgb(bh.r), linearToSrgb(bh.g), linearToSrgb(bh.b));
      const floor = Math.min(M.vegSatFloor, _hsl.s);
      hslOf(r, g, b);
      if (_hsl.s < floor) {
        rgbOfHsl(_hsl.h, floor, _hsl.l);
        r = _rgb.r;
        g = _rgb.g;
        b = _rgb.b;
      }
    }
  }
  // AO: scale the sRGB value and lean the shade slightly cool (ART_BIBLE P4), as faceColor
  const occ = _shade.ao;
  const o = 1 - occ;
  r = clamp01(r * occ * (1 - TERRAIN_AO.coolShift * o));
  g = clamp01(g * occ);
  b = clamp01(b * occ * (1 + TERRAIN_AO.coolShift * o));
  if (y > 0 && (Math.max(r, g, b) + Math.min(r, g, b)) / 2 < TERRAIN_FX.minLandL) {
    hslOf(r, g, b);
    rgbOfHsl(_hsl.h, _hsl.s, TERRAIN_FX.minLandL);
    r = _rgb.r;
    g = _rgb.g;
    b = _rgb.b;
  }
  _px.r = r;
  _px.g = g;
  _px.b = b;
  return cls;
}

/** Palette texture: `PALETTE_TEXELS` texels per zone, `PALETTE_ROWS` rows (row = island id). */
export const PALETTE_TEXELS = 9;
/** First palette texel of the strata band tones (`WALL_TONES` of them, after the wall mean). */
export const WALL_TONE_TEXEL = 5;
export const WALL_TONES = 4;
export const PALETTE_ROWS = 8;
/** Byte scales of the palette fields (decoded by the terrain shader). */
export const PALETTE_SCALE = { amp: 100, pattern: 64, wall: 255 } as const;

/** Pattern layers: a spec's tile size / mow period rescales them (others keep their tile). */
export const PATTERN_LAYERS: readonly DetailLayerId[] = ['mow', 'tiles', 'mosaic'];

const NO_LAYER = 255;

/**
 * Ground palette (16 zones × 9 texels) × 8 rows: row 0 = no island (defaults), row k = island
 * id k with its theme's `ground` over `DEFAULT_GROUND`. Per (zone, row):
 * - texel 0: R layer 0, G layer 1 (255 = none), B amplitude × 100, A material id
 *   (texel 0 is also the shader's material-group key: equal texels blend smoothly);
 * - texel 1: R pattern scale × 64, G layer-1 amplitude × 100, B earth-wall weight × 255
 *   (`GROUND_WALL.zoneWeight`; the shader gates it to land above the water), A wall kind
 *   (0 coastal soil, 128 cliff: soil inland too, 255 rock: own albedo, softer bands);
 * - texels 2 / 3: accent 1 / 2 (sRGB bytes);
 * - texel 4: the island's wall colour (sRGB bytes; the linear mean of its strata tones);
 * - texels 5–8: its strata band tones (`GROUND_WALL.strata[theme]`, sRGB bytes, TASK-613).
 * Wall texels repeat per zone (any zone can be a wall) and are equal across one row.
 */
export function buildGroundPalette(world: WorldData): Uint8Array {
  const out = new Uint8Array(ZONE_COUNT * PALETTE_TEXELS * PALETTE_ROWS * 4);
  const w = ZONE_COUNT * PALETTE_TEXELS;
  const put = (row: number, zone: number, t: number, v: readonly number[]): void => {
    const o = (row * w + zone * PALETTE_TEXELS + t) * 4;
    for (let c = 0; c < 4; c++) out[o + c] = Math.max(0, Math.min(255, Math.round(v[c])));
  };
  const srgbOf = (c: THREE.Color): number[] => [
    linearToSrgb(c.r) * 255,
    linearToSrgb(c.g) * 255,
    linearToSrgb(c.b) * 255,
    255,
  ];
  const srgb = (hex: string): number[] => srgbOf(linOf(hex));
  for (let row = 0; row < PALETTE_ROWS; row++) {
    const isl = row > 0 ? world.islands[row - 1] : undefined;
    const ground = isl ? THEMES[isl.theme]?.ground : undefined;
    const walls = wallColors(isl?.theme);
    const wallColor = srgbOf(walls.mean);
    const wallTones = walls.tones.map(srgbOf);
    for (let zone = 0; zone < ZONE_COUNT; zone++) {
      const spec = ground?.[zone as ZoneId] ?? DEFAULT_GROUND[zone as ZoneId];
      const p = spec.layer ?? {};
      const layers = (p.layers ?? MATERIAL_LAYERS[spec.material]).slice(
        0,
        GROUND_DETAIL.maxLayersPerMaterial,
      );
      const li = layers.map((id) => DETAIL_LAYER_IDS.indexOf(id));
      let pattern = 1;
      let amp1 = 1;
      if (p.mow && layers.includes('mow')) {
        pattern = (p.mow.period * 2) / DETAIL_LAYERS.mow.tile;
        if (layers[1] === 'mow') amp1 = p.mow.amplitude / DETAIL_LAYERS.mow.amplitude;
      }
      if (p.tile && layers.includes('tiles'))
        pattern = p.tile.size / (DETAIL_LAYERS.tiles.tile / 4);
      else if (p.tile && layers.includes('mosaic'))
        pattern = p.tile.size / (DETAIL_LAYERS.mosaic.tile / 16);
      const wall = GROUND_WALL.zoneWeight[zone as ZoneId] ?? 1;
      const accents = p.speckle?.length
        ? [p.speckle[0], p.speckle[1] ?? p.speckle[0]]
        : p.tile
          ? [p.tile.grout, p.tile.grout]
          : MATERIAL_ACCENTS[spec.material];
      put(row, zone, 0, [
        li[0] ?? NO_LAYER,
        li[1] ?? NO_LAYER,
        (p.amplitude ?? 1) * PALETTE_SCALE.amp,
        GROUND_MATERIALS.indexOf(spec.material),
      ]);
      put(row, zone, 1, [
        pattern * PALETTE_SCALE.pattern,
        amp1 * PALETTE_SCALE.amp,
        wall * PALETTE_SCALE.wall,
        zone === Zone.rock ? 255 : zone === Zone.cliff ? 128 : 0,
      ]);
      put(row, zone, 2, srgb(accents[0]));
      put(row, zone, 3, srgb(accents[1]));
      put(row, zone, 4, wallColor);
      for (let k = 0; k < WALL_TONES; k++) put(row, zone, WALL_TONE_TEXEL + k, wallTones[k]);
    }
  }
  return out;
}

// sRGB encode, HSL ↔ RGB: the exact arithmetic of three r186 (`ColorManagement` LinearToSRGB,
// `Color.getHSL` / `setHSL` / `hue2rgb`) on plain numbers (per-sample albedo, TASK-211 speed).
const linearToSrgb = (c: number): number =>
  c < 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 0.41666) - 0.055;
function hue2rgb(p: number, q: number, t: number): number {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * 6 * (2 / 3 - t);
  return p;
}
/** HSL of an sRGB triple into `_hsl` (Color.getHSL after the working → sRGB conversion). */
function hslOf(r: number, g: number, b: number): void {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let hue: number;
  let sat: number;
  const light = (min + max) / 2.0;
  if (min === max) {
    hue = 0;
    sat = 0;
  } else {
    const delta = max - min;
    sat = light <= 0.5 ? delta / (max + min) : delta / (2 - max - min);
    switch (max) {
      case r:
        hue = (g - b) / delta + (g < b ? 6 : 0);
        break;
      case g:
        hue = (b - r) / delta + 2;
        break;
      default:
        hue = (r - g) / delta + 4;
        break;
    }
    hue /= 6;
  }
  _hsl.h = hue;
  _hsl.s = sat;
  _hsl.l = light;
}
/** sRGB triple of (h, s, l) into `_rgb` (Color.setHSL before its sRGB → working conversion). */
function rgbOfHsl(h: number, s: number, l: number): void {
  h = ((h % 1) + 1) % 1;
  s = Math.max(0, Math.min(1, s));
  l = Math.max(0, Math.min(1, l));
  if (s === 0) {
    _rgb.r = _rgb.g = _rgb.b = l;
  } else {
    const p = l <= 0.5 ? l * (1 + s) : l + s - l * s;
    const q = 2 * l - p;
    _rgb.r = hue2rgb(q, p, h + 1 / 3);
    _rgb.g = hue2rgb(q, p, h);
    _rgb.b = hue2rgb(q, p, h - 1 / 3);
  }
}

const _hsl = { h: 0, s: 0, l: 0 };
const _rgb = { r: 0, g: 0, b: 0 };
