/**
 * Waterfall placement (M17b TASK-395): 1–3 falls per bluff island where a stream, a valley line
 * or the highest rim meets the bluff face, clear of docks, lots, landmarks and the harbour cove.
 * Pure data (no three), deterministic: one rng fork per island.
 */
import type { Rng } from '../../core/rng.ts';
import { WATERFALLS as W } from '../../content/waterfalls.ts';
import { heightAt, Zone, type WaterfallData, type WorldData } from '../types.ts';
import { bluffOf, coveness } from './heightfield.ts';
import { cellX, cellZ } from './grid.ts';

type PlaceInput = Pick<
  WorldData,
  | 'islands'
  | 'height'
  | 'zone'
  | 'shoreSdf'
  | 'islandMap'
  | 'windDir'
  | 'streams'
  | 'docks'
  | 'lots'
  | 'landmarks'
  | 'fixtures'
>;

interface Candidate extends WaterfallData {
  score: number;
}

const STEP = 0.25;

/** Where the fall from (x, z) along (dx, dz) meets the water, or null (no clean drop). */
function traceBase(
  world: PlaceInput,
  x: number,
  z: number,
  dx: number,
  dz: number,
  lipH: number,
): { s: number; x: number; z: number } | null {
  for (let s = STEP; s <= W.maxRun; s += STEP) {
    const px = x + dx * s;
    const pz = z + dz * s;
    const y = heightAt(world.height, px, pz);
    if (y > lipH + 0.5) return null; // the ground rises again: not a lip
    if (y < -W.baseDepth) return { s, x: px, z: pz };
  }
  return null;
}

function nearAny(
  x: number,
  z: number,
  pts: readonly { x: number; z: number }[],
  r: number,
): boolean {
  for (const p of pts) if (Math.hypot(x - p.x, z - p.z) < r) return true;
  return false;
}

export function placeWaterfalls(world: PlaceInput, rng: Rng): WaterfallData[] {
  const { height: h, zone, shoreSdf: sdf, islandMap } = world;
  const n = h.n;
  const out: WaterfallData[] = [];
  const dockPts = world.docks.flatMap((d) => [
    { x: d.x, z: d.z },
    {
      x: d.x + Math.cos(d.rotY) * d.segments * 2,
      z: d.z + Math.sin(d.rotY) * d.segments * 2,
    },
  ]);
  const at = (x: number, z: number): number => heightAt(h, x, z);
  for (const isl of world.islands) {
    if (!bluffOf(isl)) continue;
    const r = rng.fork('island', isl.id);
    const id = isl.id + 1;
    const lots = world.lots.filter((l) => l.islandId === isl.id);
    const streams = (world.streams ?? []).filter((s) => s.islandId === isl.id);
    const cands: Candidate[] = [];
    const [i0, i1] = [
      Math.max(1, Math.floor((isl.minX - h.originX) / h.cellSize)),
      Math.min(n - 2, Math.ceil((isl.maxX - h.originX) / h.cellSize)),
    ];
    const [j0, j1] = [
      Math.max(1, Math.floor((isl.minZ - h.originZ) / h.cellSize)),
      Math.min(n - 2, Math.ceil((isl.maxZ - h.originZ) / h.cellSize)),
    ];
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const k = j * n + i;
        if (islandMap[k] !== id || sdf[k] <= 0 || sdf[k] > W.lipSdf) continue;
        if (zone[k] === Zone.cliff || h.data[k] < W.minDrop) continue;
        if (
          zone[k + 1] !== Zone.cliff &&
          zone[k - 1] !== Zone.cliff &&
          zone[k + n] !== Zone.cliff &&
          zone[k - n] !== Zone.cliff
        )
          continue;
        const x = cellX(i);
        const z = cellZ(j);
        // toward the sea: down the shore distance gradient
        const gx = sdf[k + 1] - sdf[k - 1];
        const gz = sdf[k + n] - sdf[k - n];
        const gl = Math.hypot(gx, gz);
        if (gl < 1e-4) continue;
        const dx = -gx / gl;
        const dz = -gz / gl;
        const lipH = h.data[k];
        const base = traceBase(world, x, z, dx, dz, lipH);
        if (!base || lipH / base.s < W.minSteep) continue;
        if (coveness(isl, world.windDir, x, z) > W.maxCove) continue;
        if (nearAny(x, z, dockPts, W.avoid.dock) || nearAny(base.x, base.z, dockPts, W.avoid.dock))
          continue;
        if (lots.some((l) => Math.hypot(x - l.x, z - l.z) - Math.max(l.w, l.d) / 2 < W.avoid.lot))
          continue;
        if (nearAny(x, z, world.landmarks, W.avoid.landmark)) continue;
        if (nearAny(x, z, world.fixtures, W.avoid.fixture)) continue;
        // valley line: the lip sits lower than the rim on both sides (also a bit inland)
        const tx = -dz;
        const tz = dx;
        const R = W.valleyReach;
        const conc = (px: number, pz: number): number =>
          (at(px + tx * R, pz + tz * R) + at(px - tx * R, pz - tz * R)) / 2 - at(px, pz);
        const qx = x - dx * W.valleyInland;
        const qz = z - dz * W.valleyInland;
        const valley = Math.max(0, conc(x, z)) + 0.5 * Math.max(0, conc(qx, qz));
        const stream = streams.some((s) => nearAny(x, z, s.points, W.streamReach));
        const score =
          W.score.height * lipH +
          W.score.valley * Math.min(valley, 4) +
          (stream ? W.score.stream : 0) +
          W.score.jitter * r.next();
        cands.push({
          islandId: isl.id,
          x,
          z,
          y: lipH,
          rotY: Math.atan2(dz, dx),
          baseX: base.x,
          baseZ: base.z,
          width: 0,
          stream,
          seed: 0,
          score,
        });
      }
    }
    cands.sort((a, b) => b.score - a.score || a.z - b.z || a.x - b.x);
    const want = r.int(W.count[0], W.count[1]);
    const picked: Candidate[] = [];
    for (const c of cands) {
      if (picked.length >= want) break;
      if (nearAny(c.x, c.z, picked, W.spacing)) continue;
      picked.push(c);
    }
    for (const c of picked) {
      const { score: _score, ...fall } = c;
      fall.width = c.stream ? W.width[1] : r.range(W.width[0], W.width[1]);
      fall.seed = r.next();
      out.push(fall);
    }
  }
  return out;
}
