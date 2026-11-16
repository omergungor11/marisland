/**
 * Waterfall placement (M17b TASK-395): 1–3 falls per bluff island where a stream, a valley line
 * or the highest rim meets the bluff face, clear of docks, lots, landmarks and the harbour cove.
 * Pure data (no three), deterministic: one rng fork per island.
 */
import type { Rng } from '../../core/rng.ts';
import { hypotLess } from '../../core/math/index.ts';
import { ARCHETYPES } from '../../content/islands.ts';
import { WATERFALLS as W } from '../../content/waterfalls.ts';
import { COAST_FEATURES } from '../../content/biome-scatter.ts';
import { heightAt, Zone, type WaterfallData, type WorldData } from '../types.ts';
import { bluffOf, coveness } from './heightfield.ts';
import { cellX, cellZ } from './grid.ts';
import * as dm from '../../core/math/dmath.ts';

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
  for (const p of pts) if (hypotLess(x - p.x, z - p.z, r)) return true;
  return false;
}

/**
 * Share of the plunge-pool window (the coast pass's fall-foot ring, COAST_FEATURES.fall, both
 * sides, 0.5 u steps, at the widest fall) that is low, gentle ground clear of fixtures: where the
 * foot stones can stand (TASK-635).
 */
function footRoom(world: PlaceInput, c: Candidate, base: { x: number; z: number }): number {
  const F = COAST_FEATURES.fall;
  const h = world.height;
  const fx = dm.cos(c.rotY);
  const fz = dm.sin(c.rotY);
  const half = W.width[1] / 2;
  let ok = 0;
  let all = 0;
  for (const side of [1, -1])
    for (let lat = half + F.ring[0]; lat <= half + F.ring[1] + 1e-6; lat += 0.5)
      for (let al = F.along[0]; al <= F.along[1] + 1e-6; al += 0.5) {
        const x = base.x - fz * side * lat + fx * al;
        const z = base.z + fx * side * lat + fz * al;
        all++;
        const y = heightAt(h, x, z);
        if (y < F.heights[0] || y > F.heights[1]) continue;
        const sx = heightAt(h, x + 0.5, z) - heightAt(h, x - 0.5, z);
        const sz = heightAt(h, x, z + 0.5) - heightAt(h, x, z - 0.5);
        if (Math.hypot(sx, sz) > F.slopeMax || nearAny(x, z, world.fixtures, W.footFixture))
          continue;
        ok++;
      }
  return ok / all;
}

/**
 * Rank the lips on the terrain as it is now (pre-rim, TASK-635) and return the pick, which runs on
 * the final terrain: the rim delta and the lip knobs (TASK-615) come between the two. Each island
 * walks its ranked list and takes a lip only where it still drops cleanly into the sea on the
 * final heightfield (`minDrop`, `maxRun`, `minSteep`; height and base re-traced along the same
 * heading), so a lip the rim spoiled hands its slot to the next one. Scoring on the final wall
 * had re-rolled the count roll (drawn after one jitter draw per candidate): Coding on seed 1001
 * went from 3 falls to 1 when the rim removed one candidate.
 */
export function planWaterfalls(
  world: PlaceInput,
  rng: Rng,
): (final: PlaceInput) => WaterfallData[] {
  const { height: h, zone, shoreSdf: sdf, islandMap } = world;
  const n = h.n;
  const ranked: { r: Rng; want: number; cands: Candidate[] }[] = [];
  const dockPts = world.docks.flatMap((d) => [
    { x: d.x, z: d.z },
    {
      x: d.x + dm.cos(d.rotY) * d.segments * 2,
      z: d.z + dm.sin(d.rotY) * d.segments * 2,
    },
  ]);
  const at = (x: number, z: number): number => heightAt(h, x, z);
  for (const isl of world.islands) {
    // Research (TASK-402b) keeps its campus walls dry: `noWaterfalls`
    if (!bluffOf(isl) || ARCHETYPES[isl.archetype].noWaterfalls) continue;
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
          rotY: dm.atan2(dz, dx),
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
    ranked.push({ r, want: r.int(W.count[0], W.count[1]), cands });
  }
  return (final) => {
    const out: WaterfallData[] = [];
    for (const { r, want, cands } of ranked) {
      const picked: WaterfallData[] = [];
      for (const c of cands) {
        if (picked.length >= want) break;
        if (nearAny(c.x, c.z, picked, W.spacing)) continue;
        const y = heightAt(final.height, c.x, c.z);
        if (y < W.minDrop) continue;
        const base = traceBase(final, c.x, c.z, dm.cos(c.rotY), dm.sin(c.rotY), y);
        if (!base || y / base.s < W.minSteep) continue;
        if (footRoom(final, c, base) < W.footRoom) continue;
        const { score: _score, ...fall } = c;
        picked.push({ ...fall, y, baseX: base.x, baseZ: base.z });
      }
      for (const fall of picked) {
        fall.width = fall.stream ? W.width[1] : r.range(W.width[0], W.width[1]);
        fall.seed = r.next();
        out.push(fall);
      }
    }
    return out;
  };
}

/** Rank and pick on the same terrain (no rim pass in between). */
export function placeWaterfalls(world: PlaceInput, rng: Rng): WaterfallData[] {
  return planWaterfalls(world, rng)(world);
}
