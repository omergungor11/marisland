/**
 * Research Tide-Lab kit on its anchors (TASK-534, D-118): runs in the Research plan's `finish`
 * right after `finishTideLab` and never searches for a site (research-harbour.ts holds the anchor
 * contract). Numbers: content/themes/research-harbour-site.ts.
 * - `tideLab` on `tideLab` (its +z = the pier side, so the anchor's sea heading + π), the lab pier in
 *   scaled dock pieces, level with its deck.
 * - `tideGauge` on `tideGauge`.
 * - The sunken city: a `sunkenCity` piece on every ruin slot. Paving lies on the bed; arches and
 *   tops stand at seaY - waterline and break the surface; columns are sunk to a top height near the
 *   surface, so the streets read under the water and only the tops stand out of it.
 * - `subPath0..K`: the submersible's way from `subMooring` round the arm tip to `subDive`, a grid
 *   route over the final seabed (the sub is a mover, render/tide-sub.ts).
 * The only rng is `rng.fork('harbour').fork('ruins')` (which ruin piece).
 */
import { RESEARCH_HARBOUR_SITE as K } from '../../../content/themes/research-harbour-site.ts';
import { RESEARCH_M31 } from '../../../content/themes/research-m31.ts';
import { RESEARCH_SITE as S } from '../../../content/themes/research.ts';
import { DOCK } from '../../../content/settlements.ts';
import type { Rng } from '../../../core/rng.ts';
import { heightAt, type IslandData, type XZ } from '../../types.ts';
import { cellX, cellZ, gridRange } from '../grid.ts';
import { gridAStar } from '../paths.ts';
import {
  add,
  ang,
  cellOf,
  discShape,
  dist,
  rectShape,
  sdfAt,
  shapeDist,
  type Shape,
  type SiteCtx,
} from '../sites.ts';
import { anchorPoints } from './research-anchors.ts';
import { RUIN_KINDS, type TideLab } from './research-harbour.ts';

const SPEC = RESEARCH_M31.city.spec;

/** World y of the ruin variant `v` on a slot of kind `kind` with bed height `bed`. */
function ruinY(kind: (typeof RUIN_KINDS)[number], v: number, bed: number, r: Rng): number {
  const sp = SPEC[v];
  if (kind === 'ruinColumn') {
    const [a, b] = K.ruins.columnTop[v as 0 | 1];
    return r.range(a, b) - sp.h;
  }
  // ('sea': a shallower bed buries the foot, never hangs it)
  return sp.sit === 'sea' ? Math.min(-sp.waterline, bed) : bed;
}

/** The city's pieces, one per slot, in chain order. */
function placeRuins(ctx: SiteCtx, isl: IslandData, rng: Rng): void {
  const r = rng.fork('ruins');
  const pick: Record<(typeof RUIN_KINDS)[number], readonly number[]> = {
    ruinPaving: K.ruins.paving,
    ruinArch: K.ruins.arch,
    ruinColumn: K.ruins.column,
    ruinTop: K.ruins.top,
  };
  for (const kind of RUIN_KINDS)
    for (const p of anchorPoints(isl, kind)) {
      const list = pick[kind];
      const v = list[r.int(0, list.length - 1)];
      ctx.fixtures.push({
        defId: 'sunkenCity',
        x: p.x,
        z: p.z,
        rotY: p.rotY,
        islandId: isl.id,
        variant: v,
        y: ruinY(kind, v, p.y, r),
      });
    }
}

/** The stilt lab and its pier, root → lab. */
function placeLab(ctx: SiteCtx, isl: IslandData): void {
  const A = isl.anchors;
  const lab = A.tideLab;
  if (!lab) return;
  ctx.fixtures.push({
    defId: 'tideLab',
    x: lab.x,
    z: lab.z,
    rotY: lab.rotY + Math.PI,
    islandId: isl.id,
    y: 0,
  });
  const a = A.tideLabPier0;
  const b = A.tideLabPier1;
  if (!a || !b) return;
  const L = K.lab;
  const len = dist(a, b);
  const piece = DOCK.segment * L.pierScale;
  const n = Math.max(1, Math.ceil(len / piece));
  // (local +x = the planks' run, planner frame: (sin rotY, −cos rotY))
  const rotY = ang(b.x - a.x, b.z - a.z) + Math.PI / 2;
  for (let k = 0; k < n; k++) {
    const t = (k + 0.5) / n;
    ctx.fixtures.push({
      defId: 'dock',
      x: a.x + (b.x - a.x) * t,
      z: a.z + (b.z - a.z) * t,
      rotY,
      islandId: isl.id,
      variant: L.pierVariant,
      scale: L.pierScale,
      y: k % 2 === 0 ? 0 : L.seam,
    });
  }
}

/** Corner-cut polyline, both ends kept. */
function chaikin(pts: readonly XZ[]): XZ[] {
  const out: XZ[] = [pts[0]];
  for (let k = 0; k + 1 < pts.length; k++) {
    const a = pts[k];
    const b = pts[k + 1];
    out.push(
      { x: a.x + (b.x - a.x) * 0.25, z: a.z + (b.z - a.z) * 0.25 },
      { x: a.x + (b.x - a.x) * 0.75, z: a.z + (b.z - a.z) * 0.75 },
    );
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/** `pts` every ≈ `step` u along its length, both ends kept. */
function resample(pts: readonly XZ[], step: number): XZ[] {
  const out: XZ[] = [pts[0]];
  let need = step;
  for (let k = 0; k + 1 < pts.length; k++) {
    const a = pts[k];
    const b = pts[k + 1];
    const l = dist(a, b);
    let s = need;
    while (s < l) {
      out.push({ x: a.x + ((b.x - a.x) * s) / l, z: a.z + ((b.z - a.z) * s) / l });
      s += step;
    }
    need = s - l;
  }
  const end = pts[pts.length - 1];
  if (dist(out[out.length - 1], end) < step / 2) out.pop();
  out.push(end);
  return out;
}

/**
 * The sub's way (see RESEARCH_HARBOUR_SITE.subPath), published as `subPath0..K`, or nothing when
 * the anchors are missing or no water route exists.
 */
function planSubPath(ctx: SiteCtx, t: TideLab): void {
  const { hb } = t;
  const { isl } = hb;
  const A = isl.anchors;
  const start0 = A.subMooring;
  const goal0 = A.subDive;
  if (!start0 || !goal0) return;
  const P = K.subPath;
  const obstacles: Shape[] = [];
  const L = hb.site.segments * DOCK.segment;
  const mid = add(hb.root, hb.u, L / 2);
  obstacles.push(rectShape(mid.x, mid.z, hb.rotY, 1.6, L));
  obstacles.push(rectShape(hb.end.x, hb.end.z, hb.rotY, hb.P.pier.head.w, hb.P.pier.head.d));
  for (const f of ctx.fixtures)
    if (f.islandId === isl.id && f.defId === S.vessel.def)
      obstacles.push(rectShape(f.x, f.z, f.rotY, S.vessel.halfBeam * 2, S.vessel.halfLength * 2));
  const lab = A.tideLab;
  const labSize = A.tideLabSize;
  if (lab && labSize) obstacles.push(rectShape(lab.x, lab.z, lab.rotY, labSize.x, labSize.z));
  for (const kind of RUIN_KINDS)
    for (const p of anchorPoints(isl, kind)) obstacles.push(discShape(p.x, p.z, 0.9));
  const H = (p: XZ): number => heightAt(ctx.h, p.x, p.z);
  const free = (p: XZ): boolean =>
    H(p) <= -P.minDepth &&
    sdfAt(ctx, p.x, p.z) <= -P.shore &&
    !obstacles.some((o) => shapeDist(o, p.x, p.z) < P.clear);
  const clearLine = (a: XZ, b: XZ): boolean => {
    const n = Math.max(1, Math.ceil(dist(a, b) / P.sample));
    for (let k = 0; k <= n; k++)
      if (!free({ x: a.x + ((b.x - a.x) * k) / n, z: a.z + ((b.z - a.z) * k) / n })) return false;
    return true;
  };
  const start = add(start0, hb.u, P.leave);
  const x0x1 = gridRange(
    Math.min(start.x, goal0.x) - P.reach,
    Math.max(start.x, goal0.x) + P.reach,
  );
  const z0z1 = gridRange(
    Math.min(start.z, goal0.z) - P.reach,
    Math.max(start.z, goal0.z) + P.reach,
  );
  const s0 = cellOf(ctx, start.x, start.z);
  const g0 = cellOf(ctx, goal0.x, goal0.z);
  const passable = new Map<number, boolean>();
  const pass = (i: number): boolean => {
    let v = passable.get(i);
    if (v === undefined) {
      v = i === s0 || i === g0 || free({ x: cellX(i % ctx.n), z: cellZ(Math.floor(i / ctx.n)) });
      passable.set(i, v);
    }
    return v;
  };
  const cells = gridAStar({
    n: ctx.n,
    x0: x0x1[0],
    x1: x0x1[1],
    z0: z0z1[0],
    z1: z0z1[1],
    start: s0,
    goal: g0,
    step: (_a, b, d) => {
      if (!pass(b)) return Infinity;
      const q = { x: cellX(b % ctx.n), z: cellZ(Math.floor(b / ctx.n)) };
      const near = sdfAt(ctx, q.x, q.z) > -P.near || dist(q, hb.berth) < P.near;
      return d * ctx.h.cellSize * (near ? P.nearCost : 1);
    },
    hScale: ctx.h.cellSize,
  });
  if (!cells) return;
  const raw: XZ[] = [
    start,
    ...cells.slice(1, -1).map((i) => ({ x: cellX(i % ctx.n), z: cellZ(Math.floor(i / ctx.n)) })),
    goal0,
  ];
  // string-pull (the cell centres are only the skeleton)
  const pulled: XZ[] = [raw[0]];
  for (let k = 0; k < raw.length - 1;) {
    let j = raw.length - 1;
    while (j > k + 1 && !clearLine(raw[k], raw[j])) j--;
    pulled.push(raw[j]);
    k = j;
  }
  let line: XZ[] = [start0, ...pulled];
  for (let k = 0; k < P.chaikin; k++) line = chaikin(line);
  const ok = line.every(
    (p) =>
      H(p) <= -P.checkDepth &&
      sdfAt(ctx, p.x, p.z) <= -P.checkShore &&
      !obstacles.some((o) => shapeDist(o, p.x, p.z) < P.clear * 0.5),
  );
  const pts = resample(ok ? line : [start0, ...pulled], P.step);
  pts.forEach((p, k) => {
    const q = pts[Math.min(k + 1, pts.length - 1)];
    const o = pts[Math.max(k - 1, 0)];
    isl.anchors[`subPath${k}`] = { x: p.x, z: p.z, rotY: ang(q.x - o.x, q.z - o.z), y: 0 };
  });
}

/** Place the Tide-Lab kit on the final anchors. */
export function placeTideLabKit(ctx: SiteCtx, t: TideLab, rng: Rng): void {
  const { isl } = t.hb;
  placeLab(ctx, isl);
  const g = isl.anchors.tideGauge;
  if (g)
    ctx.fixtures.push({
      defId: 'tideGauge',
      x: g.x,
      z: g.z,
      rotY: g.rotY,
      islandId: isl.id,
      variant: K.gauge.variant,
    });
  placeRuins(ctx, isl, rng);
  planSubPath(ctx, t);
}
