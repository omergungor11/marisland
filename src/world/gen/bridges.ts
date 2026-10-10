/**
 * Viaduct pair picker (TASK-394). Pure data, no three.js. For every island pair within reach it
 * tries a few parallel lines between the two islands, keeps the ones that cross only open water
 * between the facing rims (never another island), find bluff tops behind both rims that are clear
 * of lots, docks and landmarks, then greedily takes the best 1–3 (island degree and end spacing
 * limited, no two bridges crossing).
 */
import type { Rng } from '../../core/rng.ts';
import { BRIDGES as B } from '../../content/bridges.ts';
import type {
  BridgeData,
  DockData,
  Heightfield,
  IslandData,
  LandmarkData,
  LotData,
  XZ,
} from '../types.ts';
import { heightAt } from '../types.ts';
import { GRID_ORIGIN } from './grid.ts';
import type { OccupancyGrid } from './scatter.ts';
import { OCC_STRUCTURE } from './settlements.ts';

export interface BridgeInputs {
  height: Heightfield;
  islandMap: Uint8Array;
  islands: readonly IslandData[];
  lots: readonly LotData[];
  docks: readonly DockData[];
  landmarks: readonly LandmarkData[];
}

interface Candidate {
  a: number;
  b: number;
  ax: number;
  az: number;
  ay: number;
  bx: number;
  bz: number;
  by: number;
  gap: number;
  lateral: number;
  score: number;
}

function islandAt(w: BridgeInputs, x: number, z: number): number {
  const h = w.height;
  const ix = Math.round((x - GRID_ORIGIN) / h.cellSize);
  const iz = Math.round((z - GRID_ORIGIN) / h.cellSize);
  if (ix < 0 || iz < 0 || ix >= h.n || iz >= h.n) return 0;
  return w.islandMap[iz * h.n + ix];
}

/** True when the point (x, z) is further than the clearances from every lot / dock / landmark. */
function clearOfSites(w: BridgeInputs, x: number, z: number): boolean {
  const half = B.model.deckW / 2;
  for (const l of w.lots) {
    const r = Math.hypot(l.w, l.d) / 2 + half + B.clear.lot;
    if ((l.x - x) ** 2 + (l.z - z) ** 2 < r * r) return false;
  }
  for (const d of w.docks) {
    const dx = Math.cos(d.rotY);
    const dz = Math.sin(d.rotY);
    const len = d.segments * 2;
    // distance to the dock segment
    const t = Math.min(len, Math.max(0, (x - d.x) * dx + (z - d.z) * dz));
    const px = d.x + dx * t - x;
    const pz = d.z + dz * t - z;
    const r = half + B.clear.dock + 1;
    if (px * px + pz * pz < r * r) return false;
  }
  for (const m of w.landmarks) {
    const r = half + B.clear.landmark;
    if ((m.x - x) ** 2 + (m.z - z) ** 2 < r * r) return false;
  }
  return true;
}

/** Rim cells (land cells next to open sea) of every island, as world points. */
function rimPoints(w: BridgeInputs): XZ[][] {
  const h = w.height;
  const n = h.n;
  const out: XZ[][] = w.islands.map(() => []);
  for (let iz = 1; iz < n - 1; iz++)
    for (let ix = 1; ix < n - 1; ix++) {
      const id = w.islandMap[iz * n + ix];
      if (id === 0) continue;
      const i = iz * n + ix;
      if (
        w.islandMap[i - 1] === 0 ||
        w.islandMap[i + 1] === 0 ||
        w.islandMap[i - n] === 0 ||
        w.islandMap[i + n] === 0
      )
        out[id - 1].push({ x: GRID_ORIGIN + ix * h.cellSize, z: GRID_ORIGIN + iz * h.cellSize });
    }
  return out;
}

/** One line (origin o, unit direction u) from island `ia` to island `ib`; null when it fails a rule. */
function tryLine(
  w: BridgeInputs,
  ia: number,
  ib: number,
  ox: number,
  oz: number,
  ux: number,
  uz: number,
  reach: number,
  lateral: number,
  rng: Rng,
): Candidate | null {
  // walk the whole line; find the A → B transition through open water only
  const t0 = -reach;
  const t1 = reach;
  let lastA = Number.NaN;
  let firstB = Number.NaN;
  let seen = 0; // id of the last non-zero sample
  let lastT = Number.NaN;
  for (let t = t0; t <= t1; t += B.step) {
    const id = islandAt(w, ox + ux * t, oz + uz * t);
    if (id === 0) continue;
    if (seen === ia + 1 && id === ib + 1) {
      lastA = lastT;
      firstB = t;
      break;
    }
    seen = id;
    lastT = t;
  }
  if (Number.isNaN(lastA)) return null;
  const gap = firstB - lastA;
  if (gap < B.gap.min || gap > B.gap.max) return null;
  // bluff tops: walk inland from each rim to the first cell at/above topY
  const topFrom = (t: number, dir: number, id: number): number => {
    for (let s = 0; s <= B.inlandMax; s += 0.5) {
      const tt = t + dir * s;
      const x = ox + ux * tt;
      const z = oz + uz * tt;
      if (islandAt(w, x, z) !== id) return Number.NaN;
      if (heightAt(w.height, x, z) >= B.topY) return tt + dir * B.inset;
    }
    return Number.NaN;
  };
  const tA = topFrom(lastA, -1, ia + 1);
  const tB = topFrom(firstB, 1, ib + 1);
  if (Number.isNaN(tA) || Number.isNaN(tB)) return null;
  const ax = ox + ux * tA;
  const az = oz + uz * tA;
  const bx = ox + ux * tB;
  const bz = oz + uz * tB;
  if (islandAt(w, ax, az) !== ia + 1 || islandAt(w, bx, bz) !== ib + 1) return null;
  const ay = heightAt(w.height, ax, az);
  const by = heightAt(w.height, bx, bz);
  if (ay < B.topY || by < B.topY) return null;
  if (Math.abs(ay - by) > B.maxEndDiff) return null;
  // every pier foot ends under the seabed (the deck is level-tilted between the two ends)
  const total = Math.hypot(bx - ax, bz - az);
  const bays = Math.max(2, Math.round(total / B.model.bay));
  for (let k = 0; k <= bays; k++) {
    const f = k / bays;
    const x = ax + (bx - ax) * f;
    const z = az + (bz - az) * f;
    if (islandAt(w, x, z) !== 0) continue;
    const deck = ay + (by - ay) * f + B.deckLift;
    if (heightAt(w.height, x, z) < deck - B.model.pierDepth + B.footBelowSeabed) return null;
  }
  // lots / docks / landmarks along the part of the line that stands on land
  for (let t = tA; t <= tB; t += 1.5) {
    const x = ox + ux * t;
    const z = oz + uz * t;
    if (islandAt(w, x, z) === 0) continue;
    if (!clearOfSites(w, x, z)) return null;
  }
  const score =
    gap +
    Math.abs(ay - by) * B.score.diffW +
    Math.abs(lateral) * B.score.latW +
    rng.range(0, B.score.jitter);
  return {
    a: ia,
    b: ib,
    ax,
    az,
    ay: ay + B.deckLift,
    bx,
    bz,
    by: by + B.deckLift,
    gap,
    lateral,
    score,
  };
}

function segmentsCross(a: XZ, b: XZ, c: XZ, d: XZ): boolean {
  const o = (p: XZ, q: XZ, r: XZ): number => (q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x);
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
}

/** Island pairs → viaducts. Deterministic for a given world and rng fork. */
export function generateBridges(w: BridgeInputs, rng: Rng): BridgeData[] {
  const best: Candidate[] = [];
  const isl = w.islands;
  const rims = rimPoints(w);
  for (let i = 0; i < isl.length; i++) {
    for (let j = i + 1; j < isl.length; j++) {
      const dist = Math.hypot(isl[i].cx - isl[j].cx, isl[i].cz - isl[j].cz);
      if (dist - isl[i].reach - isl[j].reach > B.gap.max) continue;
      // closest rim pair → search lines around it (rotated and shifted)
      let d2 = Infinity;
      let pi = rims[i][0];
      let pj = rims[j][0];
      if (!pi || !pj) continue;
      for (const p of rims[i])
        for (const q of rims[j]) {
          const d = (p.x - q.x) ** 2 + (p.z - q.z) ** 2;
          if (d < d2) {
            d2 = d;
            pi = p;
            pj = q;
          }
        }
      const near = Math.sqrt(d2);
      if (near > B.gap.max + B.searchSlack) continue;
      const mx = (pi.x + pj.x) / 2;
      const mz = (pi.z + pj.z) / 2;
      const bx = (pj.x - pi.x) / near;
      const bz = (pj.z - pi.z) / near;
      const r = rng.fork('pair', i, j);
      let pick: Candidate | null = null;
      let k = 0;
      for (const deg of B.angles)
        for (const lat of B.lateral) {
          const an = (deg * Math.PI) / 180;
          const ux = bx * Math.cos(an) - bz * Math.sin(an);
          const uz = bx * Math.sin(an) + bz * Math.cos(an);
          const c = tryLine(
            w,
            i,
            j,
            mx - bz * lat,
            mz + bx * lat,
            ux,
            uz,
            near / 2 + B.walkMargin,
            lat + deg * 0.5,
            r.fork('line', k++),
          );
          if (c && (!pick || c.score < pick.score)) pick = c;
        }
      if (pick) best.push(pick);
    }
  }
  best.sort((p, q) => p.score - q.score || p.a - q.a || p.b - q.b);
  const want = rng.fork('count').int(B.count[0], B.count[1]);
  const out: Candidate[] = [];
  const degree = new Map<number, number>();
  // greedy with a soft preference for islands that do not have a bridge yet
  const pool = best.slice();
  while (out.length < want && pool.length) {
    let bi = -1;
    let bs = Infinity;
    pool.forEach((c, k) => {
      const da = degree.get(c.a) ?? 0;
      const db = degree.get(c.b) ?? 0;
      if (da >= B.maxPerIsland || db >= B.maxPerIsland) return;
      const s = c.score + (da + db) * B.score.degreePenalty;
      if (s < bs) {
        bs = s;
        bi = k;
      }
    });
    if (bi < 0) break;
    const c = pool.splice(bi, 1)[0];
    const pa = { x: c.ax, z: c.az };
    const pb = { x: c.bx, z: c.bz };
    const bad = out.some(
      (o) =>
        segmentsCross(pa, pb, { x: o.ax, z: o.az }, { x: o.bx, z: o.bz }) ||
        ((o.a === c.a || o.b === c.a) &&
          Math.hypot(pa.x - (o.a === c.a ? o.ax : o.bx), pa.z - (o.a === c.a ? o.az : o.bz)) <
            B.endSpacing) ||
        ((o.a === c.b || o.b === c.b) &&
          Math.hypot(pb.x - (o.a === c.b ? o.ax : o.bx), pb.z - (o.a === c.b ? o.az : o.bz)) <
            B.endSpacing),
    );
    if (bad) continue;
    out.push(c);
    degree.set(c.a, (degree.get(c.a) ?? 0) + 1);
    degree.set(c.b, (degree.get(c.b) ?? 0) + 1);
  }
  return out.map((c) => {
    const length = Math.hypot(c.bx - c.ax, c.bz - c.az);
    return {
      islandA: c.a,
      islandB: c.b,
      ax: c.ax,
      az: c.az,
      ay: c.ay,
      bx: c.bx,
      bz: c.bz,
      by: c.by,
      length,
      yaw: Math.atan2(c.bx - c.ax, c.bz - c.az),
      bays: Math.max(2, Math.round(length / B.model.bay)),
      width: B.model.deckW,
    };
  });
}

/** Keep scatter (trees, rocks) off the deck where it stands on land. */
export function markBridges(occ: OccupancyGrid, bridges: readonly BridgeData[]): void {
  for (const b of bridges) {
    const n = Math.ceil(b.length / 1.5);
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      occ.mark(b.ax + (b.bx - b.ax) * t, b.az + (b.bz - b.az) * t, B.occupancyR, OCC_STRUCTURE);
    }
  }
}
