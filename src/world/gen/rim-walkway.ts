/**
 * Rim walkway primitive (WORLD_PLAN §3.5, TASK-480): a painted walk `spec.inset` u inland of a
 * bluff island's plateau lip, plus a post line (rails between consecutive posts) between the walk
 * and the drop. Island-agnostic: the island's look comes from its `RimWalkwaySpec`
 * (content/rim-walkway.ts) — the zone it paints (material = the theme's `ground[zone]`) and the
 * post def / variants.
 *
 * Runs as a plan `finish` pass (after the footpaths are built and written), so it can leave gaps
 * where footpaths cross the rim and never paints over a path. Pure + deterministic (no rng):
 * - `findLip`: the lip's shore distance, from the mean slope of shore-distance bands;
 * - `contours`: the iso-line of the shore SDF at a level, chained and inland-on-the-left;
 * - `rimWalkway`: walk runs (rim-only, flat, clear of obstacles) → zone paint + post fixtures.
 * Callers place their own seats / trees along `RimWalkway.runs` (`rimSamples`).
 */
import type { RimWalkwaySpec } from '../../content/rim-walkway.ts';
import type { IslandData, Polyline, XZ } from '../types.ts';
import { heightAt } from '../types.ts';
import { cellX, cellZ, gridRange } from './grid.ts';
import { forSamplesNearSegment } from './paths.ts';
import { addShape, ang, discShape, dist, onIsland, sdfAt, segDist, shapeDist } from './sites.ts';
import type { SiteCtx } from './sites.ts';

export interface RimRun {
  /** Walk centreline, ≈ 1 u spacing, inland on the left of the travel direction. */
  pts: XZ[];
  closed: boolean;
}

export interface RimWalkway {
  /** Shore distance (u) of the lip; null = no bluff (nothing placed). */
  lipSdf: number | null;
  runs: RimRun[];
  /** Indices into `ctx.fixtures` of the posts, in run order. */
  posts: number[];
  /** Grid samples painted with `spec.zone`. */
  painted: number;
}

/** Grid slope (rise / run) at (x, z): central differences over ± 1 u. */
export function slopeAtXZ(ctx: SiteCtx, x: number, z: number): number {
  const h = ctx.h;
  return (
    Math.hypot(
      heightAt(h, x + 1, z) - heightAt(h, x - 1, z),
      heightAt(h, x, z + 1) - heightAt(h, x, z - 1),
    ) / 2
  );
}

/**
 * The lip's shore distance: walking inland over `spec.lip.band`-wide shore-distance bands of the
 * island's land, the first band flatter than `lip.flat` after one steeper than `lip.steep`.
 */
export function findLip(ctx: SiteCtx, isl: IslandData, spec: RimWalkwaySpec): number | null {
  const L = spec.lip;
  const nb = Math.ceil(L.maxSdf / L.band);
  const sum = new Float64Array(nb);
  const cnt = new Float64Array(nb);
  const n = ctx.n;
  const d = ctx.h.data;
  const cs = ctx.h.cellSize;
  const [x0, x1] = gridRange(isl.minX, isl.maxX);
  const [z0, z1] = gridRange(isl.minZ, isl.maxZ);
  for (let iz = Math.max(1, z0); iz <= Math.min(n - 2, z1); iz++)
    for (let ix = Math.max(1, x0); ix <= Math.min(n - 2, x1); ix++) {
      const i = iz * n + ix;
      const s = ctx.sdf[i];
      if (ctx.islandMap[i] !== isl.id + 1 || s <= 0 || s >= L.maxSdf) continue;
      const b = Math.floor(s / L.band);
      sum[b] += Math.hypot(d[i + 1] - d[i - 1], d[i + n] - d[i - n]) / (2 * cs);
      cnt[b]++;
    }
  let steep = false;
  for (let b = 0; b < nb; b++) {
    if (!cnt[b]) continue;
    const g = sum[b] / cnt[b];
    if (g > L.steep) steep = true;
    else if (steep && g < L.flat) return b * L.band;
  }
  return null;
}

/**
 * Iso-lines of the shore SDF at `level` over the island's grid samples (marching squares, saddles
 * by the cell mean), chained into polylines with the inland side on the left.
 */
export function contours(ctx: SiteCtx, isl: IslandData, level: number): RimRun[] {
  const n = ctx.n;
  const [x0, x1] = gridRange(isl.minX - 2, isl.maxX + 2);
  const [z0, z1] = gridRange(isl.minZ - 2, isl.maxZ + 2);
  const f = (ix: number, iz: number): number => {
    const i = iz * n + ix;
    return ctx.islandMap[i] === isl.id + 1 ? ctx.sdf[i] - level : -1;
  };
  // edge key: 2 · sample + (0 = edge toward +x, 1 = edge toward +z)
  const pos = new Map<number, XZ>();
  const link = new Map<number, number[]>();
  const edgePt = (ix: number, iz: number, dir: 0 | 1): number => {
    const key = 2 * (iz * n + ix) + dir;
    if (!pos.has(key)) {
      const a = f(ix, iz);
      const b = dir === 0 ? f(ix + 1, iz) : f(ix, iz + 1);
      const t = a / (a - b);
      pos.set(key, {
        x: cellX(ix) + (dir === 0 ? t * ctx.h.cellSize : 0),
        z: cellZ(iz) + (dir === 1 ? t * ctx.h.cellSize : 0),
      });
    }
    return key;
  };
  const seg = (a: number, b: number): void => {
    (link.get(a) ?? link.set(a, []).get(a)!).push(b);
    (link.get(b) ?? link.set(b, []).get(b)!).push(a);
  };
  for (let iz = z0; iz < z1; iz++)
    for (let ix = x0; ix < x1; ix++) {
      const v = [f(ix, iz), f(ix + 1, iz), f(ix + 1, iz + 1), f(ix, iz + 1)];
      const code =
        (v[0] > 0 ? 1 : 0) | (v[1] > 0 ? 2 : 0) | (v[2] > 0 ? 4 : 0) | (v[3] > 0 ? 8 : 0);
      if (code === 0 || code === 15) continue;
      // cell edges: 0 bottom (z = iz), 1 right (x = ix + 1), 2 top (z = iz + 1), 3 left (x = ix)
      const e = [
        () => edgePt(ix, iz, 0),
        () => edgePt(ix + 1, iz, 1),
        () => edgePt(ix, iz + 1, 0),
        () => edgePt(ix, iz, 1),
      ];
      const pairs: [number, number][] = [];
      switch (code) {
        case 1:
        case 14:
          pairs.push([3, 0]);
          break;
        case 2:
        case 13:
          pairs.push([0, 1]);
          break;
        case 4:
        case 11:
          pairs.push([1, 2]);
          break;
        case 8:
        case 7:
          pairs.push([2, 3]);
          break;
        case 3:
        case 12:
          pairs.push([3, 1]);
          break;
        case 6:
        case 9:
          pairs.push([0, 2]);
          break;
        case 5:
        case 10: {
          const mid = (v[0] + v[1] + v[2] + v[3]) / 4 > 0;
          // 5: corners 0 and 2 inside; joined through the centre when the mean is inside
          if ((code === 5) === mid) pairs.push([3, 2], [0, 1]);
          else pairs.push([3, 0], [1, 2]);
          break;
        }
      }
      for (const [a, b] of pairs) seg(e[a](), e[b]());
    }
  // chain: open chains start at a degree-1 key, then the remaining loops
  const used = new Set<number>();
  const out: RimRun[] = [];
  const walk = (start: number): RimRun => {
    const keys = [start];
    used.add(start);
    let cur = start;
    for (;;) {
      const next = (link.get(cur) ?? []).find((k) => !used.has(k));
      if (next === undefined) break;
      used.add(next);
      keys.push(next);
      cur = next;
    }
    const closed = keys.length > 2 && (link.get(cur) ?? []).includes(start);
    return { pts: keys.map((k) => pos.get(k) as XZ), closed };
  };
  const keys = [...link.keys()].sort((a, b) => a - b);
  for (const k of keys)
    if (!used.has(k) && (link.get(k) as number[]).length === 1) out.push(walk(k));
  for (const k of keys) if (!used.has(k)) out.push(walk(k));
  // inland on the left: the left normal of the longest-chord step points up the SDF
  for (const r of out) {
    let bi = 0;
    let bl = -1;
    for (let i = 0; i + 1 < r.pts.length; i++) {
      const l = dist(r.pts[i], r.pts[i + 1]);
      if (l > bl) {
        bl = l;
        bi = i;
      }
    }
    if (r.pts.length < 2) continue;
    const a = r.pts[bi];
    const b = r.pts[bi + 1];
    const m = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
    const t = { x: (b.x - a.x) / bl, z: (b.z - a.z) / bl };
    const left = sdfAt(ctx, m.x - t.z, m.z + t.x) - sdfAt(ctx, m.x + t.z, m.z - t.x);
    if (left < 0) r.pts.reverse();
  }
  return out;
}

/** Resample a polyline to `step` u arc spacing, then `passes` [1 2 1] smoothing passes. */
export function resample(run: RimRun, step: number, passes: number): RimRun {
  const src = run.closed ? [...run.pts, run.pts[0]] : run.pts;
  const out: XZ[] = [];
  // `need`: arc length into the current segment where the next sample sits
  let need = 0;
  for (let i = 0; i + 1 < src.length; i++) {
    const a = src[i];
    const b = src[i + 1];
    const l = dist(a, b);
    let s = need;
    for (; s < l; s += step)
      out.push({ x: a.x + ((b.x - a.x) * s) / l, z: a.z + ((b.z - a.z) * s) / l });
    need = s - l;
  }
  if (!run.closed && src.length) out.push(src[src.length - 1]);
  let pts = out;
  const m = pts.length;
  for (let p = 0; p < passes && m > 2; p++) {
    const next = pts.map((q, i) => {
      if (!run.closed && (i === 0 || i === m - 1)) return q;
      const a = pts[(i - 1 + m) % m];
      const c = pts[(i + 1) % m];
      return { x: (a.x + 2 * q.x + c.x) / 4, z: (a.z + 2 * q.z + c.z) / 4 };
    });
    pts = next;
  }
  return { pts, closed: run.closed };
}

/** Unit tangent of a run at sample i (central difference; ends one-sided). */
export function tangentAt(run: RimRun, i: number): XZ {
  const m = run.pts.length;
  const a = run.closed ? run.pts[(i - 1 + m) % m] : run.pts[Math.max(0, i - 1)];
  const b = run.closed ? run.pts[(i + 1) % m] : run.pts[Math.min(m - 1, i + 1)];
  const l = dist(a, b) || 1;
  return { x: (b.x - a.x) / l, z: (b.z - a.z) / l };
}

/** Inland unit normal (left of the travel direction) of a run at sample i. */
export function inlandAt(run: RimRun, i: number): XZ {
  const t = tangentAt(run, i);
  return { x: -t.z, z: t.x };
}

/** A rim sample: walk point, tangent and the inland normal. */
export interface RimSample {
  p: XZ;
  t: XZ;
  inland: XZ;
}

/** Every `step`-th sample of every run (1 u samples), in run order. */
export function rimSamples(walk: RimWalkway, step: number): RimSample[] {
  const out: RimSample[] = [];
  for (const r of walk.runs)
    for (let i = Math.floor(step / 2); i < r.pts.length; i += step)
      out.push({ p: r.pts[i], t: tangentAt(r, i), inland: inlandAt(r, i) });
  return out;
}

const pathNear = (paths: readonly Polyline[], id: number, p: XZ, r: number): boolean => {
  for (const pl of paths) {
    if (pl.islandId !== id) continue;
    const q = pl.points;
    for (let k = 0; k + 1 < q.length; k++) if (segDist(p, q[k], q[k + 1]) < r) return true;
    if (q.length === 1 && dist(p, q[0]) < r) return true;
  }
  return false;
};

/**
 * Build the island's rim walkway: find the lip, take the SDF iso-line `inset` u inland of it, keep
 * the samples that are rim (drop test), flat, high and clear of obstacles, paint them in
 * `spec.zone` and stand the posts on the line `posts.inset` u inland of the lip (seaward of the
 * walk), `posts.spacing` u apart by chord, gapped at footpaths. `paths` = the built footpaths.
 */
export function rimWalkway(
  ctx: SiteCtx,
  isl: IslandData,
  spec: RimWalkwaySpec,
  paths: readonly Polyline[],
): RimWalkway {
  const lip = findLip(ctx, isl, spec);
  const res: RimWalkway = { lipSdf: lip, runs: [], posts: [], painted: 0 };
  if (lip === null) return res;
  const shapes = ctx.shapes[isl.id];
  const clearOf = (p: XZ, gap: number): boolean =>
    shapes.every((o) => o.tag === 'plaza' || shapeDist(o, p.x, p.z) >= gap);
  const rim = (p: XZ, inland: XZ, back: number): boolean => {
    if (!onIsland(ctx, isl, p.x, p.z)) return false;
    const y = heightAt(ctx.h, p.x, p.z);
    if (y < spec.minY || slopeAtXZ(ctx, p.x, p.z) > spec.maxSlope) return false;
    // seaward to where the shore distance is ≈ drop.shore (the bluff foot)
    const s = Math.max(1, (lip as number) + back - spec.drop.shore);
    return y - heightAt(ctx.h, p.x - inland.x * s, p.z - inland.z * s) >= spec.drop.min;
  };

  // walk runs: valid stretches of the iso-line at lip + inset
  for (const raw of contours(ctx, isl, lip + spec.inset)) {
    const r = resample(raw, 1, 3);
    const m = r.pts.length;
    if (m < 3) continue;
    const ok = r.pts.map(
      (p, i) =>
        rim(p, inlandAt(r, i), spec.inset) &&
        clearOf(p, spec.halfWidth) &&
        !pathNear(paths, isl.id, p, 0),
    );
    if (r.closed && ok.every(Boolean)) {
      res.runs.push(r);
      continue;
    }
    // open stretches; on a closed line start right after a gap so a run never wraps unsplit
    const start = r.closed ? (ok.findIndex((v) => !v) + 1) % m : 0;
    let cur: XZ[] = [];
    const flush = (): void => {
      if (cur.length - 1 >= spec.minRun) res.runs.push({ pts: cur, closed: false });
      cur = [];
    };
    for (let k = 0; k < m; k++) {
      const i = (start + k) % m;
      if (ok[i]) cur.push(r.pts[i]);
      else flush();
    }
    flush();
  }

  // paint (never over paths / plaza / streets / cliffs: only `paintOver` zones, flat samples)
  for (const r of res.runs) {
    const m = r.pts.length;
    const segs = r.closed ? m : m - 1;
    for (let k = 0; k < segs; k++)
      forSamplesNearSegment(ctx.h, r.pts[k], r.pts[(k + 1) % m], spec.halfWidth, (i) => {
        if (ctx.islandMap[i] !== isl.id + 1 || ctx.sdf[i] <= 0 || ctx.h.data[i] <= 0) return;
        if (ctx.zone[i] === spec.zone || !spec.paintOver.includes(ctx.zone[i])) return;
        const x = cellX(i % ctx.n);
        const z = cellZ(Math.floor(i / ctx.n));
        if (slopeAtXZ(ctx, x, z) > spec.maxSlope) return;
        ctx.zone[i] = spec.zone;
        res.painted++;
      });
  }

  // posts: on the offset line (seaward of the walk), chord-spaced, gapped at paths / obstacles
  const P = spec.posts;
  if (P) {
    const back = spec.inset - P.inset;
    for (const r of res.runs) {
      const line = r.pts.map((p, i) => {
        const n = inlandAt(r, i);
        return { p: { x: p.x - n.x * back, z: p.z - n.z * back }, n };
      });
      const ok = (q: XZ, n: XZ): boolean =>
        rim(q, n, P.inset) &&
        clearOf(q, spec.shapeGap) &&
        !pathNear(paths, isl.id, q, spec.pathGap);
      // chord walk: the next post is the first line point ≥ spacing from the last one
      const chain: { p: XZ; n: XZ; brk: boolean }[] = [];
      let last: XZ | null = null;
      let gap = false;
      const L = r.closed ? line.length + 1 : line.length;
      for (let k = 0; k < L; k++) {
        const c = line[k % line.length];
        if (last && dist(last, c.p) < P.spacing) continue;
        // interpolate onto the spacing circle round the last post (rails match the geometry)
        let q = c.p;
        if (last && k > 0) {
          const a = line[(k - 1) % line.length].p;
          const da = dist(last, a);
          const db = dist(last, c.p);
          const t = db > da ? (P.spacing - da) / (db - da) : 1;
          q = { x: a.x + (c.p.x - a.x) * t, z: a.z + (c.p.z - a.z) * t };
        }
        if (!ok(q, c.n)) {
          gap = true;
          last = null;
          continue;
        }
        if (r.closed && k === line.length && chain.length && dist(q, chain[0].p) < P.spacing * 0.5)
          break;
        chain.push({ p: q, n: c.n, brk: gap || chain.length === 0 });
        gap = false;
        last = q;
      }
      for (let k = 0; k < chain.length; k++) {
        const c = chain[k];
        const nx = chain[k + 1];
        const rail = nx !== undefined && !nx.brk && Math.abs(dist(c.p, nx.p) - P.spacing) < 0.05;
        // rotY = heading of local +z; local +x (the rail) = (sin, −cos) points at the next post
        const t = rail
          ? { x: (nx.p.x - c.p.x) / P.spacing, z: (nx.p.z - c.p.z) / P.spacing }
          : { x: c.n.z, z: -c.n.x };
        res.posts.push(ctx.fixtures.length);
        ctx.fixtures.push({
          defId: P.def,
          x: c.p.x,
          z: c.p.z,
          rotY: ang(-t.z, t.x),
          islandId: isl.id,
          variant: rail ? P.variant : P.end,
        });
        addShape(ctx, isl, discShape(c.p.x, c.p.z, 0.3), false);
      }
    }
  }
  return res;
}
