import * as THREE from 'three';
import type { WorldData } from '../../world/types.ts';
import { Zone } from '../../world/types.ts';
import { slopeAtCell } from '../../world/index.ts';
import { hashInts } from '../../core/hash.ts';
import {
  TERRAIN_AO,
  TERRAIN_COLORS,
  TERRAIN_FX,
  TERRAIN_JITTER,
  TERRAIN_SHAPE,
} from '../../content/terrain.ts';

/**
 * Per-sample colour + AO grids for the terrain mesher (ART_BIBLE §1/§2).
 * Colours are linear RGB (THREE.Color(hex) with ColorManagement on). Cliff
 * samples are flagged: their strata colour depends on the FACE centre height,
 * so faces resolve them at build time (`faceColor`).
 */
export interface TerrainColorGrid {
  /** Linear RGB per sample, n·n·3. */
  rgb: Float32Array;
  /** AO lightness multiplier per sample (1 = none). */
  ao: Float32Array;
  /** 1 where the sample is cliff (strata resolved per face). */
  cliff: Uint8Array;
  /** Material class per sample (underwater / sand / vegetation / rock / cliff / path / crater). */
  cls: Uint8Array;
}

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
  if (y <= 0) return TerrainClass.under;
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
      return TerrainClass.veg;
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
    grass: C.grassBands.map(lin),
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

export function buildColorGrid(world: WorldData): TerrainColorGrid {
  const h = world.height;
  const n = h.n;
  const d = h.data;
  const P = pal();
  const S = TERRAIN_SHAPE;
  const rgb = new Float32Array(n * n * 3);
  const ao = new Float32Array(n * n);
  const cliff = new Uint8Array(n * n);
  const cls = new Uint8Array(n * n);
  const A = TERRAIN_AO;
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ];
  const at = (ix: number, iz: number): number =>
    d[Math.min(n - 1, Math.max(0, iz)) * n + Math.min(n - 1, Math.max(0, ix))];

  for (let iz = 0; iz < n; iz++) {
    for (let ix = 0; ix < n; ix++) {
      const i = iz * n + ix;
      const y = d[i];
      // 8-neighbour mean → crease (concave > 0) / crest (convex < 0)
      let sum = 0;
      for (const [dx, dz] of dirs) sum += at(ix + dx, iz + dz);
      const concavity = sum / 8 - y;
      // horizon term: mean positive elevation slope over 8 directions
      let hz = 0;
      for (const [dx, dz] of dirs) {
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
      const z = world.zone[i];
      cls[i] = classOf(z, y);
      // open beaches stay bright: sand only takes part of the occlusion
      ao[i] = 1 - A.max * occl * (cls[i] === TerrainClass.sand ? A.sandScale : 1);

      let col: THREE.Color;
      if (y <= 0) {
        col = seabedColor(y, _c);
      } else {
        switch (z) {
          case Zone.sandWet: {
            // wet at the waterline, drying inland; the shader lap re-wets the edge
            const sdf = world.shoreSdf[i];
            col = _c.copy(P.sandWet).lerp(P.sandDry, 0.55 * smooth(0.6, 3, sdf));
            break;
          }
          case Zone.sandDry:
            col = _c.copy(P.sandDry);
            break;
          case Zone.sandBlack:
            col = _c.copy(P.sandBlack);
            break;
          case Zone.rock: {
            const sl = slopeAtCell(h, ix, iz);
            col = ramp3(P.rock, smooth(S.rockSlope[0], S.rockSlope[1], sl));
            break;
          }
          case Zone.cliff:
            cliff[i] = 1;
            col = _c.copy(P.strata[0]).lerp(P.strata[1], 0.5);
            break;
          case Zone.path:
            col = _c.copy(P.path);
            break;
          case Zone.plaza:
            col = _c.copy(P.plaza);
            break;
          case Zone.crater:
            col = _c.copy(P.crater);
            break;
          default: {
            // grass family (grass / meadow / forest / field, and stray water zones on land)
            const isl = world.islandMap[i] > 0 ? world.islands[world.islandMap[i] - 1] : null;
            const peak = isl ? Math.max(isl.peakY, 4) : 10;
            const t = smooth(S.grassBandLow, peak * S.grassBandHighFrac, y);
            col = ramp3(P.grass, t);
            const crest = clamp01(-concavity / S.crestScale);
            if (crest > 0) col.lerp(P.tip, S.crestTip * crest);
            if (z === Zone.meadow) col.lerp(P.meadowTint, TERRAIN_COLORS.meadowMix);
            else if (z === Zone.forest) col.copy(P.forest).lerp(_d.copy(P.grass[1]), 0.15 * t);
            else if (z === Zone.field) {
              const fc = world.fieldColor?.[i] ?? 0;
              col.lerp(fc > 0 ? P.fields[fc - 1] : P.field, TERRAIN_COLORS.fieldMix);
            }
          }
        }
      }
      rgb[i * 3] = col.r;
      rgb[i * 3 + 1] = col.g;
      rgb[i * 3 + 2] = col.b;
    }
  }
  return { rgb, ao, cliff, cls };
}

/** Cliff strata colour at a face centre (alternating horizontal bands). */
function strataAt(x: number, y: number, z: number, out: THREE.Color): THREE.Color {
  const S = TERRAIN_SHAPE;
  const w = S.strataWobble * Math.sin(x * 0.07 + z * 0.05) + 0.3 * Math.sin(z * 0.13 - x * 0.04);
  const band = Math.floor((y + w) / S.strataBand);
  return out.copy(pal().strata[band & 1]);
}

const _hsl = { h: 0, s: 0, l: 0 };
const _rgb = { r: 0, g: 0, b: 0 };
const _acc = new THREE.Color();
const _tmp = new THREE.Color();

/**
 * Face colour (linear RGB) into `out`: mean of the vertex base colours (cliff
 * vertices resolved to strata at the face centre), then seeded jitter (hue ±4°,
 * L ±3 %), AO as a lightness multiplier, and the land L floor.
 * `jitterHash` = 0 disables jitter (skirts).
 */
export function faceColor(
  grid: TerrainColorGrid,
  i0: number,
  i1: number,
  i2: number,
  cx: number,
  cy: number,
  cz: number,
  jitterHash: number,
  out: THREE.Color,
): THREE.Color {
  const { rgb, cliff, ao, cls } = grid;
  _acc.setRGB(0, 0, 0);
  const idx = [i0, i1, i2];
  const c0 = cls[i0];
  const c1 = cls[i1];
  const c2 = cls[i2];
  let wsum = 0;
  // Border blend: weight = (vertices sharing this class)^p. Soft grounds (sand ↔ grass)
  // use p = 1 (lone vertex 20 %); rock / cliff use p = 2 (lone vertex 11 %) so outcrops
  // stay crisp instead of smearing grey into the grass.
  const hard =
    c0 === TerrainClass.rock ||
    c1 === TerrainClass.rock ||
    c2 === TerrainClass.rock ||
    c0 === TerrainClass.cliff ||
    c1 === TerrainClass.cliff ||
    c2 === TerrainClass.cliff;
  for (let k = 0; k < 3; k++) {
    const i = idx[k];
    const ck = cls[i];
    const same = (ck === c0 ? 1 : 0) + (ck === c1 ? 1 : 0) + (ck === c2 ? 1 : 0);
    const w = hard ? same * same : same;
    if (cliff[i] && cy > 0) {
      strataAt(cx, cy, cz, _tmp);
    } else {
      _tmp.setRGB(rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]);
    }
    _acc.r += _tmp.r * w;
    _acc.g += _tmp.g * w;
    _acc.b += _tmp.b * w;
    wsum += w;
  }
  _acc.multiplyScalar(1 / wsum);
  const occ = (ao[i0] + ao[i1] + ao[i2]) / 3;
  _acc.getHSL(_hsl, THREE.SRGBColorSpace);
  let hue = _hsl.h;
  let l = _hsl.l;
  if (jitterHash !== 0) {
    const a = (jitterHash & 0xffff) / 65535;
    const b = (jitterHash >>> 16) / 65535;
    hue += ((a * 2 - 1) * TERRAIN_JITTER.hueDeg) / 360;
    l += (b * 2 - 1) * TERRAIN_JITTER.lightness;
  }
  hue = hue - Math.floor(hue);
  out.setHSL(hue, _hsl.s, clamp01(l), THREE.SRGBColorSpace);
  // AO: scale the sRGB value (not HSL L, which would raise chroma and turn sand
  // orange) and lean the shade slightly cool (ART_BIBLE P4).
  out.getRGB(_rgb, THREE.SRGBColorSpace);
  const o = 1 - occ;
  _rgb.r *= occ * (1 - TERRAIN_AO.coolShift * o);
  _rgb.g *= occ;
  _rgb.b *= occ * (1 + TERRAIN_AO.coolShift * o);
  out.setRGB(clamp01(_rgb.r), clamp01(_rgb.g), clamp01(_rgb.b), THREE.SRGBColorSpace);
  if (cy > 0) {
    out.getHSL(_hsl, THREE.SRGBColorSpace);
    if (_hsl.l < TERRAIN_FX.minLandL)
      out.setHSL(_hsl.h, _hsl.s, TERRAIN_FX.minLandL, THREE.SRGBColorSpace);
  }
  return out;
}

/** Per-face jitter hash: seed × global face index × LOD salt. */
export function faceHash(seed: number, faceIndex: number, lod: number): number {
  return hashInts(seed, faceIndex, lod) | 1;
}
