/**
 * Phase 2 edit commands (TASK-201): apply / exact inverse / replay / log codec. Pure data, no
 * three: `applyEdit` mutates `WorldData` in place and reports what it touched; derived data
 * (shore SDF, zones, islandMap, chunk flags, prop grounding) is kept current by
 * `edit-derive.ts` (TASK-202).
 *
 * Contract notes for callers (engine/session):
 * - `applyEdit` canonicalises the command **in place** (snaps numbers to the codec grid, see
 *   `EDIT_CODEC`) and writes the assigned `id` into a `propAdd` without one. Log the command
 *   object you passed; it then replays to the identical world and round-trips the codec exactly.
 * - Inverses: `propAdd` → `propRemove` (mirror) when it appended; everything else → one private
 *   `{ k: 'patch' }` command that restores grids and prop slots byte-exactly. Apply inverses
 *   with `applyEdit` like any command; never log them (`encodeLog` throws on `patch`).
 * - Prop ids: scatter props keep their store index as id (< EDIT_PROP_ID_BASE); edit-added
 *   props are `EDIT_PROP_ID_BASE + k` at store index `props.editBase + k`. Removing a scatter
 *   prop sets `PropFlag.removed`; removing the last edit-added slot pops it (`count` − 1), other
 *   edit-added slots are flagged. Consumers must skip `removed` slots and re-read the typed
 *   arrays after a command that appended props (the store may have grown in place).
 */
import { EDIT_PROP_ID_BASE, EMPTY_DIRTY } from './edit-types.ts';
import type { DirtyRegion, EditCommand, EditLog, EditResult, ZonePaint } from './edit-types.ts';
import {
  EDIT_BRUSH,
  EDIT_CODEC,
  EDIT_PROPS,
  ZONE_PAINT,
  ZONE_PAINT_ORDER,
} from '../content/edit.ts';
import { PROP_DEFS, PROP_DEF_INDEX } from '../content/props.ts';
import { CHUNKS_PER_SIDE, heightAt, SEABED_Y, WORLD_SIZE, type WorldData } from './types.ts';
import { PropFlag, growPropStore, type PropStore } from './prop-store.ts';
import { chunkIdAt, createOccupancy } from './gen/scatter.ts';
import { OCC_STRUCTURE } from './gen/settlements.ts';
import { slopeAtCell } from './gen/zones.ts';
import { nearestIsland } from './gen/heightfield.ts';
import { StageHash } from './gen/hash.ts';
import {
  DIRTY,
  Journal,
  PROTECT_DOCK,
  PROTECT_PLAZA,
  brushAuxOf,
  brushNoiseAt,
  brushStretchAt,
  editState,
  forChunks,
  islandForNewLand,
  nextEpoch,
  refreshChunkFlags,
  rederiveZones,
  updateSites,
  writeSdf,
  zeroSlot,
  type PropSlots,
} from './edit-derive.ts';

// ---------------------------------------------------------------- types

export interface GridCells<T extends Uint8Array | Float32Array> {
  /** Sample indices `iz · n + ix`. */
  idx: Int32Array;
  /** Values to restore, same order (applied last → first). */
  val: T;
}

export interface PatchProps {
  /** Store count to restore. */
  count: number;
  slot: Int32Array;
  defId: Uint16Array;
  variant: Uint8Array;
  x: Float32Array;
  y: Float32Array;
  z: Float32Array;
  rotY: Float32Array;
  scale: Float32Array;
  islandId: Uint8Array;
  chunkId: Uint16Array;
  flags: Uint8Array;
}

/** Payload of the private inverse command `{ k: 'patch' }`: previous values, verbatim. */
export interface EditPatchData {
  height: GridCells<Float32Array>;
  zone: GridCells<Uint8Array>;
  painted: GridCells<Uint8Array>;
  fieldColor: GridCells<Uint8Array>;
  islandMap: GridCells<Uint8Array>;
  sdf: GridCells<Float32Array>;
  props: PatchProps | null;
}

/** Result of `canPlace` (ghost preview) — `y` is where the prop would stand. */
export interface PlaceCheck {
  ok: boolean;
  reason?: string;
  y?: number;
}

type Cmd<K extends EditCommand['k']> = Extract<EditCommand, { k: K }>;
type BrushCmd = Cmd<'raise' | 'lower' | 'flatten' | 'smooth'>;

const HALF_WORLD = WORLD_SIZE / 2;
const TAU = Math.PI * 2;

// ---------------------------------------------------------------- ids

/** Index of the first edit-added slot. */
function baseOf(s: PropStore): number {
  if (s.editBase === undefined) s.editBase = s.count;
  return s.editBase;
}

/** Store index of prop `id`, or −1 when it has no slot (never added / popped). */
export function propIndexOf(world: WorldData, id: number): number {
  const s = world.props;
  if (!Number.isInteger(id) || id < 0) return -1;
  const i =
    id < EDIT_PROP_ID_BASE ? (id < baseOf(s) ? id : -1) : baseOf(s) + id - EDIT_PROP_ID_BASE;
  return i >= 0 && i < s.count ? i : -1;
}

/** Prop id of store index `i`. */
export function propIdAt(world: WorldData, i: number): number {
  const b = baseOf(world.props);
  return i < b ? i : EDIT_PROP_ID_BASE + i - b;
}

// ---------------------------------------------------------------- canonical form

const q = (v: number, step: number): number => Math.round(v / step) * step;
const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
const finite = (...v: number[]): boolean => v.every((x) => Number.isFinite(x));

const canonPos = (v: number): number =>
  Math.round((v + HALF_WORLD) / EDIT_CODEC.pos) * EDIT_CODEC.pos - HALF_WORLD;
const rotIndex = (r: number): number => {
  const k = Math.round((r / TAU) * EDIT_CODEC.rotSteps) % EDIT_CODEC.rotSteps;
  return k < 0 ? k + EDIT_CODEC.rotSteps : k;
};
const canonRot = (r: number): number => rotIndex(r) * (TAU / EDIT_CODEC.rotSteps);
const canonScale = (s: number): number =>
  q(clamp(s, EDIT_PROPS.scaleMin, EDIT_PROPS.scaleMax), EDIT_CODEC.scale);
const canonRadius = (r: number): number =>
  q(clamp(r, EDIT_BRUSH.minRadius, EDIT_BRUSH.maxRadius), EDIT_CODEC.radius);

function canonStrength(k: BrushCmd['k'], s: number): number {
  const lim: [number, number] =
    k === 'flatten'
      ? [SEABED_Y, EDIT_BRUSH.maxY]
      : k === 'smooth'
        ? [0, 1]
        : [0, EDIT_BRUSH.maxDelta];
  return q(clamp(s, lim[0], lim[1]), EDIT_CODEC.strength);
}

/**
 * Canonical copy of a command (codec grid, clamped ranges) or null when it is malformed.
 * Idempotent; `applyEdit` runs it first, so raw and decoded logs replay identically.
 */
export function canonicalCmd(cmd: EditCommand): EditCommand | null {
  switch (cmd.k) {
    case 'raise':
    case 'lower':
    case 'flatten':
    case 'smooth':
      if (!finite(cmd.x, cmd.z, cmd.r, cmd.s)) return null;
      return {
        k: cmd.k,
        x: canonPos(cmd.x),
        z: canonPos(cmd.z),
        r: canonRadius(cmd.r),
        s: canonStrength(cmd.k, cmd.s),
      };
    case 'paint':
      if (!finite(cmd.x, cmd.z, cmd.r) || !ZONE_PAINT_ORDER.includes(cmd.zone)) return null;
      return {
        k: 'paint',
        x: canonPos(cmd.x),
        z: canonPos(cmd.z),
        r: canonRadius(cmd.r),
        zone: cmd.zone,
      };
    case 'propAdd': {
      if (!finite(cmd.x, cmd.z, cmd.rotY, cmd.scale)) return null;
      if (cmd.id !== undefined && !Number.isInteger(cmd.id)) return null;
      const out: Cmd<'propAdd'> = {
        k: 'propAdd',
        def: String(cmd.def),
        x: canonPos(cmd.x),
        z: canonPos(cmd.z),
        rotY: canonRot(cmd.rotY),
        scale: canonScale(cmd.scale),
      };
      if (cmd.id !== undefined) out.id = cmd.id;
      if (cmd.variant !== undefined) {
        if (!Number.isFinite(cmd.variant)) return null;
        const d = PROP_DEFS[PROP_DEF_INDEX[out.def]];
        out.variant = clamp(Math.round(cmd.variant), 0, d ? d.variants - 1 : 255);
      }
      return out;
    }
    case 'propRemove':
      return Number.isInteger(cmd.id) ? { k: 'propRemove', id: cmd.id } : null;
    case 'propMove':
      if (!Number.isInteger(cmd.id) || !finite(cmd.x, cmd.z, cmd.rotY)) return null;
      return {
        k: 'propMove',
        id: cmd.id,
        x: canonPos(cmd.x),
        z: canonPos(cmd.z),
        rotY: canonRot(cmd.rotY),
      };
    case 'patch':
      return cmd;
    default:
      return null;
  }
}

// ---------------------------------------------------------------- placement

const isIn = (list: readonly string[], id: string): boolean => list.includes(id);

/**
 * Cheap placement check for `propAdd` / `propMove` (ghost preview, ≈ O(props) worst case);
 * other commands only get their inputs validated. Does not mutate the world or the command.
 */
export function canPlace(world: WorldData, cmd: EditCommand): PlaceCheck {
  const c = canonicalCmd(cmd);
  if (!c) return { ok: false, reason: 'invalid command' };
  if (c.k === 'propAdd') {
    const di = PROP_DEF_INDEX[c.def];
    if (di === undefined || !isIn(EDIT_PROPS.placeable, c.def))
      return { ok: false, reason: 'unknown def' };
    const slot = addSlot(world.props, c.id);
    if (typeof slot === 'string') return { ok: false, reason: slot };
    return checkSpot(world, di, c.x, c.z, c.scale, -1);
  }
  if (c.k === 'propMove') {
    const i = propIndexOf(world, c.id);
    if (i < 0) return { ok: false, reason: 'unknown id' };
    const s = world.props;
    if (s.flags[i] & PropFlag.removed) return { ok: false, reason: 'removed' };
    return checkSpot(world, s.defId[i], c.x, c.z, s.scale[i], i);
  }
  if (c.k === 'propRemove') {
    const i = propIndexOf(world, c.id);
    if (i < 0) return { ok: false, reason: 'unknown id' };
    if (world.props.flags[i] & PropFlag.removed) return { ok: false, reason: 'removed' };
  }
  if (c.k !== 'propRemove' && c.k !== 'patch' && !discRange(world, c.x, c.z, c.r))
    return { ok: false, reason: 'outside world' };
  return { ok: true };
}

function checkSpot(
  world: WorldData,
  defIndex: number,
  x: number,
  z: number,
  scale: number,
  self: number,
): PlaceCheck {
  if (Math.abs(x) > HALF_WORLD || Math.abs(z) > HALF_WORLD)
    return { ok: false, reason: 'outside world' };
  const def = PROP_DEFS[defIndex];
  const h = world.height;
  const ground = heightAt(h, x, z);
  const water = ground <= 0;
  const floating = isIn(EDIT_PROPS.floating, def.id);
  let y = ground;
  if (floating) {
    if (!water) return { ok: false, reason: 'on land' };
    y = 0;
  } else if (water && !(def.flags & PropFlag.underwater) && !isIn(EDIT_PROPS.seabed, def.id)) {
    return { ok: false, reason: 'under water' };
  }
  if (!floating) {
    const ix = clamp(Math.round((x - h.originX) / h.cellSize), 0, h.n - 1);
    const iz = clamp(Math.round((z - h.originZ) / h.cellSize), 0, h.n - 1);
    const lim = EDIT_PROPS.slopeMax[def.id] ?? EDIT_PROPS.defaultSlopeMax;
    if (slopeAtCell(h, ix, iz) > lim) return { ok: false, reason: 'too steep' };
  }
  const r = def.footprint * scale;
  const ground0 = (def.flags & PropFlag.groundCover) !== 0;
  const occ = createOccupancy(world.genAux.siteOccupancy);
  const min = ground0 || isIn(EDIT_PROPS.pathOk, def.id) ? OCC_STRUCTURE : 1;
  if (!occ.isFreeDisc(x, z, r, min)) return { ok: false, reason: 'occupied' };
  if (!ground0) {
    const s = world.props;
    for (let i = 0; i < s.count; i++) {
      if (i === self) continue;
      const f = s.flags[i];
      if (f & (PropFlag.removed | PropFlag.groundCover)) continue;
      const dx = s.x[i] - x;
      const dz = s.z[i] - z;
      const rr = r + PROP_DEFS[s.defId[i]].footprint * s.scale[i];
      if (dx * dx + dz * dz < rr * rr) return { ok: false, reason: 'collides' };
    }
  }
  return { ok: true, y };
}

// ---------------------------------------------------------------- apply

const reject = (reason: string): EditResult => ({
  ok: false,
  reason,
  inverse: [],
  dirty: { ...EMPTY_DIRTY, chunks: [], props: [] },
});
const noop = (): EditResult => ({
  ok: true,
  inverse: [],
  dirty: { ...EMPTY_DIRTY, chunks: [], props: [] },
});

/**
 * Apply one command to `world` (in place). Returns ok:false + reason (world untouched) when the
 * command is malformed, a prop placement is invalid or a brush would only have raised protected
 * ground (`'dock'` / `'plaza'`, `EDIT_BRUSH.protect`; partially protected brushes apply to the
 * free samples); otherwise the exact inverse and the dirty region. See the module header for
 * the in-place canonicalisation / id contract.
 */
export function applyEdit(world: WorldData, cmd: EditCommand): EditResult {
  if (cmd.k === 'patch') return applyPatch(world, cmd.data);
  const c = canonicalCmd(cmd);
  if (!c || c.k === 'patch') return reject('invalid command');
  Object.assign(cmd, c);
  switch (c.k) {
    case 'raise':
    case 'lower':
    case 'flatten':
    case 'smooth':
      return applyBrush(world, c);
    case 'paint':
      return applyPaint(world, c);
    case 'propAdd': {
      const res = applyPropAdd(world, c);
      if (res.ok && c.id !== undefined) (cmd as Cmd<'propAdd'>).id = c.id;
      return res;
    }
    case 'propRemove':
      return applyPropRemove(world, c);
    case 'propMove':
      return applyPropMove(world, c);
  }
}

/** Sample index range covered by a disc, or null when it misses the grid. */
function discRange(
  world: WorldData,
  x: number,
  z: number,
  r: number,
): { fx: number; fz: number; rc: number; x0: number; x1: number; z0: number; z1: number } | null {
  const h = world.height;
  const fx = (x - h.originX) / h.cellSize;
  const fz = (z - h.originZ) / h.cellSize;
  const rc = r / h.cellSize;
  const x0 = Math.max(0, Math.ceil(fx - rc));
  const x1 = Math.min(h.n - 1, Math.floor(fx + rc));
  const z0 = Math.max(0, Math.ceil(fz - rc));
  const z1 = Math.min(h.n - 1, Math.floor(fz + rc));
  return x0 > x1 || z0 > z1 ? null : { fx, fz, rc, x0, x1, z0, z1 };
}

/** Raise taper above `EDIT_BRUSH.softCap` (×1 → ×capScale over capRamp u). */
function cap(y: number): number {
  const { softCap, capScale, capRamp } = EDIT_BRUSH;
  if (y <= softCap) return 1;
  return 1 - (1 - capScale) * Math.min(1, (y - softCap) / capRamp);
}

/** Rejection reason of a brush that only hit protected ground. */
const PROTECT_REASON: Readonly<Record<number, string>> = {
  [PROTECT_DOCK]: 'dock',
  [PROTECT_PLAZA]: 'plaza',
};

function applyBrush(world: WorldData, c: BrushCmd): EditResult {
  const rg = discRange(world, c.x, c.z, c.r);
  if (!rg) return reject('outside world');
  const h = world.height;
  const n = h.n;
  const hd = h.data;
  const { fx, fz, rc } = rg;
  const idx: number[] = [];
  const nv: number[] = [];
  const kr = EDIT_BRUSH.smoothKernel;
  const md = EDIT_BRUSH.maxDelta;
  const aux = brushAuxOf(world);
  const protect = aux.protect;
  let blocked = 0;
  for (let iz = rg.z0; iz <= rg.z1; iz++) {
    for (let ix = rg.x0; ix <= rg.x1; ix++) {
      const dx = ix - fx;
      const dz = iz - fz;
      let t2 = (dx * dx + dz * dz) / (rc * rc);
      if (t2 >= 1) continue;
      if (c.k === 'raise') {
        // lobed footprint (raise only: a lowered channel keeps the full brush width)
        const k = brushStretchAt(aux, ix, iz);
        t2 *= k * k;
        if (t2 >= 1) continue;
      }
      const w = Math.pow(1 - t2, EDIT_BRUSH.falloffPower);
      const i = iz * n + ix;
      const old = hd[i];
      let v: number;
      if (c.k === 'raise') v = old + Math.min(md, c.s * w * brushNoiseAt(aux, ix, iz) * cap(old));
      else if (c.k === 'lower') v = old - Math.min(md, c.s * w * brushNoiseAt(aux, ix, iz));
      else if (c.k === 'flatten')
        v = old + clamp((c.s - old) * w * EDIT_BRUSH.flattenRate, -md, md);
      else {
        let sum = 0;
        let cnt = 0;
        for (let oz = -kr; oz <= kr; oz++)
          for (let ox = -kr; ox <= kr; ox++) {
            const sx = clamp(ix + ox, 0, n - 1);
            const sz = clamp(iz + oz, 0, n - 1);
            sum += hd[sz * n + sx];
            cnt++;
          }
        v = old + clamp((sum / cnt - old) * c.s * w, -md, md);
      }
      v = Math.fround(clamp(v, SEABED_Y, EDIT_BRUSH.maxY));
      if (v > old && protect[i] !== 0) {
        // piers, moorings and plazas never rise (lowering stays allowed)
        if (blocked === 0 || protect[i] < blocked) blocked = protect[i];
        continue;
      }
      if (v !== old) {
        idx.push(i);
        nv.push(v);
      }
    }
  }
  if (idx.length === 0) return blocked === 0 ? noop() : reject(PROTECT_REASON[blocked]);
  const st = editState(world);
  const hEp = nextEpoch(st);
  let bx0 = n;
  let bx1 = -1;
  let bz0 = n;
  let bz1 = -1;
  for (const i of idx) {
    st.hStamp[i] = hEp;
    const ix = i % n;
    const iz = (i - ix) / n;
    if (ix < bx0) bx0 = ix;
    if (ix > bx1) bx1 = ix;
    if (iz < bz0) bz0 = iz;
    if (iz > bz1) bz1 = iz;
  }
  const affected = collectProps(world, st.hStamp, hEp, bx0, bx1, bz0, bz1);
  const j = new Journal();
  const toLand: number[] = [];
  const toWater: number[] = [];
  for (let k = 0; k < idx.length; k++) {
    const i = idx[k];
    const old = hd[i];
    j.height.push(i, old);
    hd[i] = nv[k];
    if (old > 0 !== nv[k] > 0) (nv[k] > 0 ? toLand : toWater).push(i);
  }
  const im = world.islandMap;
  for (const i of toLand) {
    const v = islandForNewLand(st, world, i);
    if (v !== im[i]) {
      j.islandMap.push(i, im[i]);
      im[i] = v;
    }
  }
  for (const i of toWater)
    if (im[i] !== 0) {
      j.islandMap.push(i, im[i]);
      im[i] = 0;
    }
  const sdfChanged = writeSdf(st, world, updateSites(st, hd, toLand, toWater), j);
  const zoneCells: number[] = [];
  for (const i of idx) {
    const ix = i % n;
    const iz = (i - ix) / n;
    for (let oz = -1; oz <= 1; oz++)
      for (let ox = -1; ox <= 1; ox++) {
        const x = ix + ox;
        const z = iz + oz;
        if (x >= 0 && z >= 0 && x < n && z < n) zoneCells.push(z * n + x);
      }
  }
  for (const i of sdfChanged) zoneCells.push(i);
  rederiveZones(st, world, zoneCells, hEp, j);
  refreshChunkFlags(world, idx);
  regroundProps(world, affected, j);
  return finish(world, j);
}

interface Affected {
  slot: number;
  ground: number;
}

/** Live props whose bilinear height reads a changed sample (heights not yet written). */
function collectProps(
  world: WorldData,
  hStamp: Uint32Array,
  ep: number,
  bx0: number,
  bx1: number,
  bz0: number,
  bz1: number,
): Affected[] {
  const s = world.props;
  const h = world.height;
  const n = h.n;
  const minX = h.originX + (bx0 - 1) * h.cellSize;
  const maxX = h.originX + (bx1 + 1) * h.cellSize;
  const minZ = h.originZ + (bz0 - 1) * h.cellSize;
  const maxZ = h.originZ + (bz1 + 1) * h.cellSize;
  const out: Affected[] = [];
  for (let i = 0; i < s.count; i++) {
    if (s.flags[i] & PropFlag.removed) continue;
    const x = s.x[i];
    const z = s.z[i];
    if (x < minX || x > maxX || z < minZ || z > maxZ) continue;
    const fx = (x - h.originX) / h.cellSize;
    const fz = (z - h.originZ) / h.cellSize;
    if (fx < 0 || fz < 0 || fx > n - 1 || fz > n - 1) continue;
    const x0 = Math.min(Math.floor(fx), n - 2);
    const z0 = Math.min(Math.floor(fz), n - 2);
    const c = z0 * n + x0;
    if (
      hStamp[c] === ep ||
      hStamp[c + 1] === ep ||
      hStamp[c + n] === ep ||
      hStamp[c + n + 1] === ep
    )
      out.push({ slot: i, ground: heightAt(h, x, z) });
  }
  return out;
}

/** Re-ground touched props; flooded land props / stranded floating props are removed. */
function regroundProps(world: WorldData, list: Affected[], j: Journal): void {
  const s = world.props;
  const h = world.height;
  for (const { slot, ground } of list) {
    const def = PROP_DEFS[s.defId[slot]];
    const g = heightAt(h, s.x[slot], s.z[slot]);
    let remove = false;
    let y: number | null = null;
    if (isIn(EDIT_PROPS.floating, def.id)) remove = g > 0;
    else if (def.flags & PropFlag.underwater || isIn(EDIT_PROPS.seabed, def.id)) y = g;
    else if (ground > 0 && g <= 0) remove = true;
    else if (g > 0) y = g;
    if (remove) {
      j.prop(s, slot);
      s.flags[slot] |= PropFlag.removed;
    } else if (y !== null && Math.fround(y) !== s.y[slot]) {
      j.prop(s, slot);
      s.y[slot] = y;
    }
  }
}

function applyPaint(world: WorldData, c: Cmd<'paint'>): EditResult {
  const rg = discRange(world, c.x, c.z, c.r);
  if (!rg) return reject('outside world');
  const n = world.height.n;
  const hd = world.height.data;
  const zid = ZONE_PAINT[c.zone];
  const { zone, zonePainted, fieldColor } = world;
  const j = new Journal();
  for (let iz = rg.z0; iz <= rg.z1; iz++)
    for (let ix = rg.x0; ix <= rg.x1; ix++) {
      const dx = ix - rg.fx;
      const dz = iz - rg.fz;
      if (dx * dx + dz * dz >= rg.rc * rg.rc) continue;
      const i = iz * n + ix;
      if (hd[i] <= 0) continue;
      if (!zonePainted[i]) {
        j.painted.push(i, 0);
        zonePainted[i] = 1;
      }
      if (zone[i] !== zid) {
        j.zone.push(i, zone[i]);
        zone[i] = zid;
      }
      if (fieldColor[i] !== 0) {
        j.fieldColor.push(i, fieldColor[i]);
        fieldColor[i] = 0;
      }
    }
  return finish(world, j);
}

function islandIdAt(world: WorldData, x: number, z: number): number {
  const h = world.height;
  const ix = Math.round((x - h.originX) / h.cellSize);
  const iz = Math.round((z - h.originZ) / h.cellSize);
  if (ix >= 0 && iz >= 0 && ix < h.n && iz < h.n) {
    const v = world.islandMap[iz * h.n + ix];
    if (v > 0) return v - 1;
  }
  return nearestIsland(world.islands, x, z)?.id ?? 0;
}

function writeProp(
  world: WorldData,
  slot: number,
  defIndex: number,
  variant: number,
  x: number,
  y: number,
  z: number,
  rotY: number,
  scale: number,
): void {
  const s = world.props;
  s.defId[slot] = defIndex;
  s.variant[slot] = variant;
  s.x[slot] = x;
  s.y[slot] = y;
  s.z[slot] = z;
  s.rotY[slot] = rotY;
  s.scale[slot] = scale;
  s.islandId[slot] = islandIdAt(world, x, z);
  s.chunkId[slot] = chunkIdAt(x, z);
  s.flags[slot] = PROP_DEFS[defIndex].flags;
}

/**
 * Store slot a `propAdd` writes: the next slot when no id is given, else `editBase + k` for id
 * `EDIT_PROP_ID_BASE + k` (must be free: unused or removed). A string = rejection reason.
 */
function addSlot(s: PropStore, id: number | undefined): number | string {
  const base = baseOf(s);
  let slot: number;
  if (id === undefined) slot = s.count;
  else {
    const k = id - EDIT_PROP_ID_BASE;
    if (k < 0 || k >= EDIT_PROPS.maxEditProps) return 'bad id';
    slot = base + k;
    if (slot < s.count && !(s.flags[slot] & PropFlag.removed)) return 'id in use';
  }
  return slot - base >= EDIT_PROPS.maxEditProps ? 'too many props' : slot;
}

function applyPropAdd(world: WorldData, c: Cmd<'propAdd'>): EditResult {
  const di = PROP_DEF_INDEX[c.def];
  if (di === undefined || !isIn(EDIT_PROPS.placeable, c.def)) return reject('unknown def');
  const s = world.props;
  const base = baseOf(s);
  const slot = addSlot(s, c.id);
  if (typeof slot === 'string') return reject(slot);
  const chk = checkSpot(world, di, c.x, c.z, c.scale, -1);
  if (!chk.ok) return reject(chk.reason ?? 'invalid');
  const appended = slot === s.count;
  const j = new Journal();
  j.count(s);
  growPropStore(s, slot + 1 - s.count);
  for (let i = s.count; i <= slot; i++) {
    j.prop(s, i);
    zeroSlot(s, i);
    s.flags[i] = PropFlag.removed; // gap slots (replay of sparse ids) stay hidden
  }
  if (slot < s.count) j.prop(s, slot);
  const def = PROP_DEFS[di];
  const variant = c.variant ?? 0;
  writeProp(
    world,
    slot,
    di,
    Math.min(variant, def.variants - 1),
    c.x,
    chk.y ?? 0,
    c.z,
    c.rotY,
    c.scale,
  );
  if (slot >= s.count) s.count = slot + 1;
  c.id = EDIT_PROP_ID_BASE + slot - base;
  const res = finish(world, j);
  if (appended) res.inverse = [{ k: 'propRemove', id: c.id }];
  return res;
}

function applyPropRemove(world: WorldData, c: Cmd<'propRemove'>): EditResult {
  const s = world.props;
  const i = propIndexOf(world, c.id);
  if (i < 0) return reject('unknown id');
  if (s.flags[i] & PropFlag.removed) return reject('removed');
  const j = new Journal();
  j.prop(s, i);
  if (i >= baseOf(s) && i === s.count - 1) {
    zeroSlot(s, i);
    s.count--;
  } else s.flags[i] |= PropFlag.removed;
  return finish(world, j);
}

function applyPropMove(world: WorldData, c: Cmd<'propMove'>): EditResult {
  const s = world.props;
  const i = propIndexOf(world, c.id);
  if (i < 0) return reject('unknown id');
  if (s.flags[i] & PropFlag.removed) return reject('removed');
  const chk = checkSpot(world, s.defId[i], c.x, c.z, s.scale[i], i);
  if (!chk.ok) return reject(chk.reason ?? 'invalid');
  const j = new Journal();
  j.prop(s, i);
  const flags = s.flags[i];
  writeProp(world, i, s.defId[i], s.variant[i], c.x, chk.y ?? 0, c.z, c.rotY, s.scale[i]);
  s.flags[i] = flags;
  return finish(world, j);
}

// ---------------------------------------------------------------- patch

function cells<T extends Uint8Array | Float32Array>(
  pairs: number[],
  make: (len: number) => T,
): GridCells<T> {
  const m = pairs.length / 2;
  const idx = new Int32Array(m);
  const val = make(m);
  for (let k = 0; k < m; k++) {
    idx[k] = pairs[k * 2];
    val[k] = pairs[k * 2 + 1];
  }
  return { idx, val };
}

function toPatch(j: Journal): EditPatchData {
  const p = j.props;
  return {
    height: cells(j.height, (l) => new Float32Array(l)),
    zone: cells(j.zone, (l) => new Uint8Array(l)),
    painted: cells(j.painted, (l) => new Uint8Array(l)),
    fieldColor: cells(j.fieldColor, (l) => new Uint8Array(l)),
    islandMap: cells(j.islandMap, (l) => new Uint8Array(l)),
    sdf: cells(j.sdf, (l) => new Float32Array(l)),
    props:
      j.propCount < 0
        ? null
        : {
            count: j.propCount,
            slot: Int32Array.from(p.slot),
            defId: Uint16Array.from(p.defId),
            variant: Uint8Array.from(p.variant),
            x: Float32Array.from(p.x),
            y: Float32Array.from(p.y),
            z: Float32Array.from(p.z),
            rotY: Float32Array.from(p.rotY),
            scale: Float32Array.from(p.scale),
            islandId: Uint8Array.from(p.islandId),
            chunkId: Uint16Array.from(p.chunkId),
            flags: Uint8Array.from(p.flags),
          },
  };
}

/** Restore a byte grid from a patch (last → first), journaling current values. */
function restoreBytes(arr: Uint8Array, g: GridCells<Uint8Array>, out: number[]): void {
  for (let k = g.idx.length - 1; k >= 0; k--) {
    const i = g.idx[k];
    if (arr[i] === g.val[k]) continue;
    out.push(i, arr[i]);
    arr[i] = g.val[k];
  }
}

function applyPatch(world: WorldData, d: EditPatchData): EditResult {
  const j = new Journal();
  // the nearest-site maps must be built from the pre-patch heights
  const st = d.height.idx.length > 0 ? editState(world) : null;
  const hd = world.height.data;
  const toLand: number[] = [];
  const toWater: number[] = [];
  const hCells: number[] = [];
  for (let k = d.height.idx.length - 1; k >= 0; k--) {
    const i = d.height.idx[k];
    const v = d.height.val[k];
    const old = hd[i];
    if (old === v) continue;
    j.height.push(i, old);
    hd[i] = v;
    hCells.push(i);
    if (old > 0 !== v > 0) (v > 0 ? toLand : toWater).push(i);
  }
  // keep the nearest-site maps in step; the sdf itself comes verbatim from the patch
  if (st && toLand.length + toWater.length > 0) updateSites(st, hd, toLand, toWater);
  const sdf = world.shoreSdf;
  for (let k = d.sdf.idx.length - 1; k >= 0; k--) {
    const i = d.sdf.idx[k];
    if (sdf[i] === d.sdf.val[k]) continue;
    j.sdf.push(i, sdf[i]);
    sdf[i] = d.sdf.val[k];
  }
  restoreBytes(world.islandMap, d.islandMap, j.islandMap);
  restoreBytes(world.zone, d.zone, j.zone);
  restoreBytes(world.zonePainted, d.painted, j.painted);
  restoreBytes(world.fieldColor, d.fieldColor, j.fieldColor);
  if (hCells.length > 0) refreshChunkFlags(world, hCells);
  if (d.props) restoreProps(world.props, d.props, j);
  const res = finish(world, j);
  return res;
}

function restoreProps(s: PropStore, p: PatchProps, j: Journal): void {
  j.count(s);
  let maxSlot = p.count - 1;
  for (let k = 0; k < p.slot.length; k++) maxSlot = Math.max(maxSlot, p.slot[k]);
  growPropStore(s, maxSlot + 1 - s.count);
  for (let k = 0; k < p.slot.length; k++) j.prop(s, p.slot[k]);
  for (let i = p.count; i < s.count; i++) j.prop(s, i);
  for (let k = p.slot.length - 1; k >= 0; k--) {
    const i = p.slot[k];
    s.defId[i] = p.defId[k];
    s.variant[i] = p.variant[k];
    s.x[i] = p.x[k];
    s.y[i] = p.y[k];
    s.z[i] = p.z[k];
    s.rotY[i] = p.rotY[k];
    s.scale[i] = p.scale[k];
    s.islandId[i] = p.islandId[k];
    s.chunkId[i] = p.chunkId[k];
    s.flags[i] = p.flags[k];
  }
  for (let i = p.count; i < s.count; i++) zeroSlot(s, i);
  s.count = p.count;
}

// ---------------------------------------------------------------- dirty

/** Build the result (inverse patch + exact dirty region) from what the journal recorded. */
function finish(world: WorldData, j: Journal): EditResult {
  const n = world.height.n;
  const flag = new Uint8Array(CHUNKS_PER_SIDE * CHUNKS_PER_SIDE);
  let minI = n;
  let maxI = -1;
  let minJ = n;
  let maxJ = -1;
  const bound = (i: number): [number, number] => {
    const ix = i % n;
    const iz = (i - ix) / n;
    if (ix < minI) minI = ix;
    if (ix > maxI) maxI = ix;
    if (iz < minJ) minJ = iz;
    if (iz > maxJ) maxJ = iz;
    return [ix, iz];
  };
  const mark = (pairs: number[], margin: number, chunks: boolean): void => {
    for (let k = 0; k < pairs.length; k += 2) {
      const [ix, iz] = bound(pairs[k]);
      if (chunks)
        forChunks(ix - margin, iz - margin, ix + margin, iz + margin, (c) => (flag[c] = 1));
    }
  };
  mark(j.height, DIRTY.height, true);
  mark(j.zone, 0, true);
  mark(j.fieldColor, 0, true);
  mark(j.islandMap, 0, true);
  mark(j.painted, 0, false);
  const sdf = world.shoreSdf;
  for (let k = 0; k < j.sdf.length; k += 2) {
    const i = j.sdf[k];
    const [ix, iz] = bound(i);
    if (Math.abs(sdf[i]) <= DIRTY.sdfBand || Math.abs(j.sdf[k + 1]) <= DIRTY.sdfBand) {
      const m = DIRTY.sdf;
      forChunks(ix - m, iz - m, ix + m, iz + m, (c) => (flag[c] = 1));
    }
  }
  const chunks: number[] = [];
  for (let c = 0; c < flag.length; c++) if (flag[c]) chunks.push(c);
  const props = changedProps(world, j);
  const dirty: DirtyRegion =
    maxI < 0
      ? { ...EMPTY_DIRTY, chunks, props }
      : { chunks, minI, maxI, minJ, maxJ, props, sdf: j.sdf.length > 0 };
  const empty =
    j.height.length +
      j.zone.length +
      j.painted.length +
      j.fieldColor.length +
      j.islandMap.length +
      j.sdf.length ===
      0 && j.propCount < 0;
  return { ok: true, inverse: empty ? [] : [{ k: 'patch', data: toPatch(j) }], dirty };
}

/** Ids of journaled slots whose record or existence actually changed. */
function changedProps(world: WorldData, j: Journal): number[] {
  if (j.propCount < 0) return [];
  const s = world.props;
  const p: PropSlots = j.props;
  const ids: number[] = [];
  for (let k = 0; k < p.slot.length; k++) {
    const i = p.slot[k];
    const was = i < j.propCount;
    const now = i < s.count;
    if (!was && !now) continue;
    const same =
      was === now &&
      p.defId[k] === s.defId[i] &&
      p.variant[k] === s.variant[i] &&
      p.x[k] === s.x[i] &&
      p.y[k] === s.y[i] &&
      p.z[k] === s.z[i] &&
      p.rotY[k] === s.rotY[i] &&
      p.scale[k] === s.scale[i] &&
      p.islandId[k] === s.islandId[i] &&
      p.chunkId[k] === s.chunkId[i] &&
      p.flags[k] === s.flags[i];
    if (!same) ids.push(propIdAt(world, i));
  }
  return Array.from(new Set(ids)).sort((a, b) => a - b);
}

// ---------------------------------------------------------------- replay / hash

/**
 * Apply every command of `log` in order (rejected ones are skipped deterministically; ids of
 * `propAdd` without one are assigned in order and written back). Returns the merged dirty
 * region. Throws when the log's version or seed does not match.
 */
export function replay(world: WorldData, log: EditLog): DirtyRegion {
  if (log.v !== 1) throw new Error(`edit log version ${String(log.v)} not supported`);
  if (log.seed >>> 0 !== world.seed >>> 0)
    throw new Error('edit log seed does not match the world');
  const flag = new Uint8Array(CHUNKS_PER_SIDE * CHUNKS_PER_SIDE);
  const props = new Set<number>();
  let minI = Infinity;
  let maxI = -1;
  let minJ = Infinity;
  let maxJ = -1;
  let sdf = false;
  for (const cmd of log.cmds) {
    if (cmd.k === 'patch') throw new Error('patch commands cannot be replayed from a log');
    const r = applyEdit(world, cmd);
    if (!r.ok) continue;
    const d = r.dirty;
    for (const c of d.chunks) flag[c] = 1;
    for (const id of d.props) props.add(id);
    if (d.maxI >= d.minI) {
      minI = Math.min(minI, d.minI);
      maxI = Math.max(maxI, d.maxI);
      minJ = Math.min(minJ, d.minJ);
      maxJ = Math.max(maxJ, d.maxJ);
    }
    sdf ||= d.sdf;
  }
  const chunks: number[] = [];
  for (let c = 0; c < flag.length; c++) if (flag[c]) chunks.push(c);
  const ids = Array.from(props).sort((a, b) => a - b);
  return maxI < 0
    ? { ...EMPTY_DIRTY, chunks, props: ids }
    : { chunks, minI, maxI, minJ, maxJ, props: ids, sdf };
}

const bytesOf = (a: Float32Array | Uint16Array | Uint8Array, len = a.length): Uint8Array =>
  new Uint8Array(a.buffer, a.byteOffset, len * a.BYTES_PER_ELEMENT);

/**
 * Exact (bit-level, not quantised) hash of everything edits can change: height, zone, paint
 * mask, shore SDF, islandMap, fieldColor, chunk flags and the live prop slots.
 */
export function editHash(world: WorldData): string {
  const h = new StageHash();
  h.bytes(bytesOf(world.height.data));
  h.bytes(world.zone);
  h.bytes(world.zonePainted);
  h.bytes(bytesOf(world.shoreSdf));
  h.bytes(world.islandMap);
  h.bytes(world.fieldColor);
  h.bytes(world.chunkFlags);
  const s = world.props;
  h.u32(s.count);
  for (const a of [
    s.defId,
    s.variant,
    s.x,
    s.y,
    s.z,
    s.rotY,
    s.scale,
    s.islandId,
    s.chunkId,
    s.flags,
  ])
    h.bytes(bytesOf(a, s.count));
  return h.hex();
}

// ---------------------------------------------------------------- codec

const KIND = [
  'raise',
  'lower',
  'flatten',
  'smooth',
  'paint',
  'propAdd',
  'propRemove',
  'propMove',
] as const;
const HAS_ID = 16;
const HAS_VARIANT = 32;

class Writer {
  buf = new Uint8Array(256);
  len = 0;
  byte(b: number): void {
    if (this.len === this.buf.length) {
      const next = new Uint8Array(this.buf.length * 2);
      next.set(this.buf);
      this.buf = next;
    }
    this.buf[this.len++] = b;
  }
  /** Unsigned LEB128 (non-negative safe integers). */
  uv(v: number): void {
    let x = v;
    while (x >= 128) {
      this.byte((x % 128) | 128);
      x = Math.floor(x / 128);
    }
    this.byte(x);
  }
  /** Zig-zag signed varint. */
  sv(v: number): void {
    this.uv(v < 0 ? -v * 2 - 1 : v * 2);
  }
}

class Reader {
  pos = 0;
  constructor(private buf: Uint8Array) {}
  get length(): number {
    return this.buf.length;
  }
  byte(): number {
    if (this.pos >= this.buf.length) throw new Error('edit log truncated');
    return this.buf[this.pos++];
  }
  uv(): number {
    let v = 0;
    let mul = 1;
    for (let k = 0; k < 8; k++) {
      const b = this.byte();
      v += (b & 127) * mul;
      if (b < 128) return v;
      mul *= 128;
    }
    throw new Error('edit log varint overflow');
  }
  sv(): number {
    const u = this.uv();
    return u % 2 === 1 ? -(u + 1) / 2 : u / 2;
  }
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function toB64url(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i += 3) {
    const v = (b[i] << 16) | ((b[i + 1] ?? 0) << 8) | (b[i + 2] ?? 0);
    s += B64[(v >> 18) & 63] + B64[(v >> 12) & 63];
    if (i + 1 < b.length) s += B64[(v >> 6) & 63];
    if (i + 2 < b.length) s += B64[v & 63];
  }
  return s;
}

function fromB64url(s: string): Uint8Array {
  const out = new Uint8Array(Math.floor((s.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < s.length; i += 4) {
    let v = 0;
    const m = Math.min(4, s.length - i);
    if (m === 1) throw new Error('edit log: bad base64 length');
    for (let k = 0; k < 4; k++) {
      const c = k < m ? B64.indexOf(s[i + k]) : 0;
      if (c < 0) throw new Error('edit log: bad base64 character');
      v = v * 64 + c;
    }
    out[o++] = (v >> 16) & 255;
    if (m > 2) out[o++] = (v >> 8) & 255;
    if (m > 3) out[o++] = v & 255;
  }
  return out.subarray(0, o);
}

const qi = (v: number, step: number): number => Math.round(v / step);

/**
 * Delta state shared by encoder and decoder: positions, radius and strength are coded as
 * zig-zag differences to the previous command's (quantised) values, `propAdd` ids relative to
 * the previous added id + 1 — a brush stroke costs ≈ 5 bytes per sample.
 */
interface DeltaState {
  x: number;
  z: number;
  r: number;
  s: number;
  id: number;
}
const deltaStart = (): DeltaState => ({ x: 0, z: 0, r: 0, s: 0, id: EDIT_PROP_ID_BASE - 1 });

/**
 * Encode a log as URL-safe text: base64url of
 * `[version][seed][def table][count][cmd…]`, each command a kind byte plus zig-zag varints on
 * the `EDIT_CODEC` grid (delta-coded, see `DeltaState`). Sync and pure. Commands are
 * canonicalised on the way (applied logs already are, so they round-trip exactly).
 */
export function encodeLog(log: EditLog): string {
  const w = new Writer();
  w.byte(EDIT_CODEC.version);
  w.uv(log.seed >>> 0);
  const defs: string[] = [];
  const cmds = log.cmds.map((cmd) => {
    if (cmd.k === 'patch') throw new Error('patch commands are undo-only and cannot be logged');
    const c = canonicalCmd(cmd);
    if (!c) throw new Error(`edit log: malformed ${cmd.k} command`);
    if (c.k === 'propAdd' && !defs.includes(c.def)) defs.push(c.def);
    return c;
  });
  w.uv(defs.length);
  for (const d of defs) {
    w.uv(d.length);
    for (let k = 0; k < d.length; k++) w.byte(d.charCodeAt(k) & 127);
  }
  w.uv(cmds.length);
  const st = deltaStart();
  const pos = (x: number, z: number): void => {
    const qx = qi(x + HALF_WORLD, EDIT_CODEC.pos);
    const qz = qi(z + HALF_WORLD, EDIT_CODEC.pos);
    w.sv(qx - st.x);
    w.sv(qz - st.z);
    st.x = qx;
    st.z = qz;
  };
  const rad = (r: number): void => {
    const v = qi(r, EDIT_CODEC.radius);
    w.sv(v - st.r);
    st.r = v;
  };
  for (const c of cmds) {
    if (c.k === 'patch') continue;
    const kind = KIND.indexOf(c.k);
    switch (c.k) {
      case 'raise':
      case 'lower':
      case 'flatten':
      case 'smooth': {
        w.byte(kind);
        pos(c.x, c.z);
        rad(c.r);
        const v = qi(c.s, EDIT_CODEC.strength);
        w.sv(v - st.s);
        st.s = v;
        break;
      }
      case 'paint':
        w.byte(kind);
        pos(c.x, c.z);
        rad(c.r);
        w.byte(ZONE_PAINT_ORDER.indexOf(c.zone));
        break;
      case 'propAdd':
        w.byte(
          kind | (c.id !== undefined ? HAS_ID : 0) | (c.variant !== undefined ? HAS_VARIANT : 0),
        );
        if (c.id !== undefined) {
          w.sv(c.id - st.id - 1);
          st.id = c.id;
        }
        w.uv(defs.indexOf(c.def));
        pos(c.x, c.z);
        w.uv(rotIndex(c.rotY));
        w.uv(qi(c.scale, EDIT_CODEC.scale));
        if (c.variant !== undefined) w.uv(c.variant);
        break;
      case 'propRemove':
        w.byte(kind);
        w.sv(c.id - EDIT_PROP_ID_BASE);
        break;
      case 'propMove':
        w.byte(kind);
        w.sv(c.id - EDIT_PROP_ID_BASE);
        pos(c.x, c.z);
        w.uv(rotIndex(c.rotY));
        break;
    }
  }
  return toB64url(w.buf.subarray(0, w.len));
}

/** Decode `encodeLog` output. Throws on a malformed string or an unknown version. */
export function decodeLog(text: string): EditLog {
  const r = new Reader(fromB64url(text));
  const v = r.byte();
  if (v !== EDIT_CODEC.version) throw new Error(`edit log version ${v} not supported`);
  const seed = r.uv() >>> 0;
  const defs: string[] = [];
  const nd = r.uv();
  for (let k = 0; k < nd; k++) {
    const len = r.uv();
    let s = '';
    for (let c = 0; c < len; c++) s += String.fromCharCode(r.byte());
    defs.push(s);
  }
  const count = r.uv();
  const cmds: EditCommand[] = [];
  const st = deltaStart();
  const rot = (k: number): number => (k % EDIT_CODEC.rotSteps) * (TAU / EDIT_CODEC.rotSteps);
  const pos = (): { x: number; z: number } => {
    st.x += r.sv();
    st.z += r.sv();
    return {
      x: st.x * EDIT_CODEC.pos - HALF_WORLD,
      z: st.z * EDIT_CODEC.pos - HALF_WORLD,
    };
  };
  const rad = (): number => {
    st.r += r.sv();
    return st.r * EDIT_CODEC.radius;
  };
  for (let k = 0; k < count; k++) {
    const head = r.byte();
    const kind = KIND[head & 15];
    if (kind === undefined) throw new Error('edit log: unknown command kind');
    switch (kind) {
      case 'raise':
      case 'lower':
      case 'flatten':
      case 'smooth': {
        const { x, z } = pos();
        const rr = rad();
        st.s += r.sv();
        cmds.push({ k: kind, x, z, r: rr, s: st.s * EDIT_CODEC.strength });
        break;
      }
      case 'paint': {
        const { x, z } = pos();
        const rr = rad();
        const zone: ZonePaint | undefined = ZONE_PAINT_ORDER[r.byte()];
        if (zone === undefined) throw new Error('edit log: unknown zone paint');
        cmds.push({ k: 'paint', x, z, r: rr, zone });
        break;
      }
      case 'propAdd': {
        let id: number | undefined;
        if (head & HAS_ID) {
          id = st.id + 1 + r.sv();
          st.id = id;
        }
        const def = defs[r.uv()];
        if (def === undefined) throw new Error('edit log: bad def index');
        const { x, z } = pos();
        const c: Cmd<'propAdd'> = {
          k: 'propAdd',
          def,
          x,
          z,
          rotY: rot(r.uv()),
          scale: r.uv() * EDIT_CODEC.scale,
        };
        if (id !== undefined) c.id = id;
        if (head & HAS_VARIANT) c.variant = r.uv();
        cmds.push(c);
        break;
      }
      case 'propRemove':
        cmds.push({ k: 'propRemove', id: EDIT_PROP_ID_BASE + r.sv() });
        break;
      case 'propMove': {
        const id = EDIT_PROP_ID_BASE + r.sv();
        const { x, z } = pos();
        cmds.push({ k: 'propMove', id, x, z, rotY: rot(r.uv()) });
        break;
      }
    }
  }
  if (r.pos !== r.length) throw new Error('edit log: trailing bytes');
  return { v: 1, seed, cmds };
}
