/**
 * D4 funicular rail: grade line, earthworks and car pose (TASK-507, D-089). Pure data (no three).
 *
 * A section is a polyline (`world.fences` kind 'funicular', travel order = uphill) of straight
 * legs; each leg is cut into whole pieces of `piece` u horizontal run (a leg's pieces share a
 * scale `s` = len / (piece × m), 0.75–1.5), each piece rising 0, ±1 or ±2 pitch steps (variants
 * 0–2 of `funicularRail`; a fall is the piece turned round, pivot at its low end). Like a real
 * mountain railway the grade line does not follow the cone: `planRail` picks the rises (a beam
 * search from the foot stub to the top stub, least cut and fill) and the planner carves the
 * ground along the line to it (`railEarthworks`, after the pads), so every pivot stands on the
 * ground. The joint levels are stored on the polyline (`levels`); settlement-props lays the pieces
 * and render/movers.ts runs the cars from them (`railFromLevels`).
 */
import { DEVOPS_M25_MOTION, DEVOPS_M25_SITE } from '../content/themes/devops-m25-site.ts';
import { heightAt, type Heightfield, type XZ } from './types.ts';

const R = DEVOPS_M25_SITE.rail;

export interface RailPiece {
  /** Travel-order ends (xz) and their rail-top heights. */
  a: XZ;
  b: XZ;
  ya: number;
  yb: number;
  /** Prop pivot (the low end, on the ground line), three.js yaw (local +z low → high), variant, scale. */
  x: number;
  z: number;
  y: number;
  yaw: number;
  variant: number;
  scale: number;
  /** Leg index the piece belongs to. */
  leg: number;
}

export interface RailLine {
  pieces: RailPiece[];
  /** Rail-top polyline in travel order: joint k = start of piece k (last = end of the last piece). */
  pts: { x: number; y: number; z: number }[];
  /** Cumulative horizontal arc length at each joint. */
  arc: number[];
  /** Joint index of every leg start (0 … n − 1) and the last joint. */
  legAt: number[];
  /** Planner score: mean earthwork per piece + the miss at the top stub (0 from stored levels). */
  cost: number;
}

interface Span {
  a: XZ;
  b: XZ;
  s: number;
  leg: number;
}

const lerp = (a: XZ, b: XZ, t: number): XZ => ({
  x: a.x + (b.x - a.x) * t,
  z: a.z + (b.z - a.z) * t,
});

/** Pieces of a section polyline (null when a leg is no whole number of 0.75–1.5-scale pieces). */
function spansOf(points: readonly XZ[]): { spans: Span[]; legAt: number[] } | null {
  if (points.length < 2) return null;
  const spans: Span[] = [];
  const legAt: number[] = [];
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i];
    const b = points[i + 1];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const m = Math.max(1, Math.round(len / R.piece));
    const s = len / (R.piece * m);
    if (s < 0.75 || s > 1.5) return null;
    legAt.push(spans.length);
    for (let k = 0; k < m; k++)
      spans.push({ a: lerp(a, b, k / m), b: lerp(a, b, (k + 1) / m), s, leg: i });
  }
  legAt.push(spans.length);
  return { spans, legAt };
}

/** The line from its spans and joint rail-top heights. */
function build(
  spans: readonly Span[],
  legAt: number[],
  ys: readonly number[],
  cost: number,
): RailLine {
  const pieces: RailPiece[] = spans.map((sp, k) => {
    const ya = ys[k];
    const yb = ys[k + 1];
    const up = yb >= ya - 1e-6;
    const lo = up ? sp.a : sp.b;
    const hi = up ? sp.b : sp.a;
    const step = R.pitchStep * R.piece * sp.s;
    return {
      a: sp.a,
      b: sp.b,
      ya,
      yb,
      x: lo.x,
      z: lo.z,
      y: Math.min(ya, yb) - R.clearance * sp.s,
      yaw: Math.atan2(hi.x - lo.x, hi.z - lo.z),
      variant: Math.min(R.maxStep, Math.round(Math.abs(yb - ya) / step)),
      scale: sp.s,
      leg: sp.leg,
    };
  });
  const pts = pieces.map((p) => ({ x: p.a.x, y: p.ya, z: p.a.z }));
  const last = pieces[pieces.length - 1];
  pts.push({ x: last.b.x, y: last.yb, z: last.b.z });
  const arc = [0];
  for (let k = 1; k < pts.length; k++)
    arc.push(arc[k - 1] + Math.hypot(pts[k].x - pts[k - 1].x, pts[k].z - pts[k - 1].z));
  return { pieces, pts, arc, legAt, cost };
}

/** Rail from stored joint levels (`Polyline.levels`); null when they do not match the pieces. */
export function railFromLevels(points: readonly XZ[], levels: readonly number[]): RailLine | null {
  const sp = spansOf(points);
  if (!sp || levels.length !== sp.spans.length + 1) return null;
  return build(sp.spans, sp.legAt, levels, 0);
}

interface State {
  y: number;
  cost: number;
  prev: number;
}

/**
 * Grade line of a section over the ground `h` from rail top `y0` (the foot stub) toward `y1` (the
 * top stub): per piece 0, ±1 or ±2 pitch steps, least earthwork (the ground along the piece vs the
 * pivot line `rail − clearance`), missing `y1` costs `missCost` per u². Null when the polyline
 * does not cut into whole pieces.
 */
export function planRail(
  h: Heightfield,
  points: readonly XZ[],
  y0: number,
  y1: number,
): RailLine | null {
  const sp = spansOf(points);
  if (!sp) return null;
  const { spans, legAt } = sp;
  const N = spans.length;
  // most the remaining pieces can still climb or fall
  const reach = new Float32Array(N + 1);
  for (let k = N - 1; k >= 0; k--)
    reach[k] = reach[k + 1] + R.maxStep * R.pitchStep * R.piece * spans[k].s;
  const g = spans.map((s) =>
    [0, 0.5, 1].map((t) => {
      const p = lerp(s.a, s.b, t);
      return heightAt(h, p.x, p.z);
    }),
  );
  const miss = (y: number, k: number): number => Math.max(0, Math.abs(y1 - y) - reach[k]);
  const key = (st: State, k: number): number => st.cost + R.missCost * miss(st.y, k) ** 2;
  const layers: State[][] = [];
  let cur: State[] = [{ y: y0, cost: 0, prev: -1 }];
  for (let k = 0; k < N; k++) {
    const s = spans[k].s;
    const step = R.pitchStep * R.piece * s;
    const next = new Map<number, State>();
    cur.forEach((st, si) => {
      for (let r = -R.maxStep; r <= R.maxStep; r++) {
        const yb = st.y + r * step;
        let c = 0;
        for (let j = 0; j < 3; j++) {
          const e = st.y + (yb - st.y) * (j / 2) - R.clearance * s - g[k][j];
          c += e * e;
        }
        const q = Math.round(yb / R.res);
        const total = st.cost + c / 3;
        const old = next.get(q);
        if (!old || total < old.cost) next.set(q, { y: yb, cost: total, prev: si });
      }
    });
    layers.push(cur);
    cur = [...next.values()]
      .sort((p, q) => key(p, k + 1) - key(q, k + 1) || p.y - q.y)
      .slice(0, R.keep);
  }
  let best = cur[0];
  let bs = Infinity;
  for (const st of cur) {
    const v = st.cost + R.missCost * (st.y - y1) ** 2;
    if (v < bs) {
      bs = v;
      best = st;
    }
  }
  const ys: number[] = new Array(N + 1);
  let st = best;
  for (let k = N; k >= 1; k--) {
    ys[k] = st.y;
    st = layers[k - 1][st.prev];
  }
  ys[0] = y0;
  return build(spans, legAt, ys, bs / N);
}

/**
 * Earthworks of a line: per grid cell within `core` + `fall` u of the centreline, the pivot line
 * (rail − clearance) of the nearest piece and the blend weight (1 in the core, smooth to 0 across
 * the falloff), handed to `visit(cell index, target, weight)`.
 */
export function railEarthworks(
  h: Heightfield,
  L: RailLine,
  core: number,
  fall: number,
  visit: (i: number, target: number, w: number) => void,
): void {
  const n = h.n;
  const R2 = core + fall;
  const best = new Map<number, { d: number; y: number }>();
  for (const p of L.pieces) {
    const cell = (v: number, o: number): number => (v - o) / h.cellSize;
    const x0 = Math.max(0, Math.floor(cell(Math.min(p.a.x, p.b.x) - R2, h.originX)));
    const x1 = Math.min(n - 1, Math.ceil(cell(Math.max(p.a.x, p.b.x) + R2, h.originX)));
    const z0 = Math.max(0, Math.floor(cell(Math.min(p.a.z, p.b.z) - R2, h.originZ)));
    const z1 = Math.min(n - 1, Math.ceil(cell(Math.max(p.a.z, p.b.z) + R2, h.originZ)));
    const dx = p.b.x - p.a.x;
    const dz = p.b.z - p.a.z;
    const l2 = dx * dx + dz * dz;
    for (let iz = z0; iz <= z1; iz++)
      for (let ix = x0; ix <= x1; ix++) {
        const x = h.originX + ix * h.cellSize;
        const z = h.originZ + iz * h.cellSize;
        const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - p.a.x) * dx + (z - p.a.z) * dz) / l2)) : 0;
        const d = Math.hypot(x - (p.a.x + dx * t), z - (p.a.z + dz * t));
        if (d > R2) continue;
        const i = iz * n + ix;
        const o = best.get(i);
        if (o && o.d <= d) continue;
        best.set(i, { d, y: p.ya + (p.yb - p.ya) * t - R.clearance * p.scale });
      }
  }
  for (const [i, { d, y }] of best) {
    const u = Math.max(0, Math.min(1, (d - core) / fall));
    visit(i, y, d <= core ? 1 : 1 - u * u * (3 - 2 * u));
  }
}

/** Rail-top height at arc `s` (clamped to the line). */
export function railY(L: RailLine, s: number): number {
  const a = L.arc;
  const c = Math.max(0, Math.min(a[a.length - 1], s));
  let k = 0;
  while (k < a.length - 2 && a[k + 1] < c) k++;
  const t = a[k + 1] > a[k] ? (c - a[k]) / (a[k + 1] - a[k]) : 0;
  return L.pts[k].y + (L.pts[k + 1].y - L.pts[k].y) * t;
}

export interface CarPose {
  x: number;
  y: number;
  z: number;
  /** three.js yaw of the car's local +z (uphill along the leg) and its pitch (rad, nose up > 0). */
  yaw: number;
  pitch: number;
  /** Index of the zig-zag vertex the car is turning at (−1 = none) and 0..1 through the turn. */
  turning: number;
  turnT: number;
}

export const newCarPose = (): CarPose => ({
  x: 0,
  y: 0,
  z: 0,
  yaw: 0,
  pitch: 0,
  turning: -1,
  turnT: 0,
});

const ease = (u: number): number => u - Math.sin(2 * Math.PI * u) / (2 * Math.PI);
const smooth = (t: number): number => {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
};

/** Point + heading of leg `i` at arc `s` (clamped to the leg). */
function onLeg(L: RailLine, i: number, s: number, out: CarPose): void {
  const j0 = L.legAt[i];
  const j1 = L.legAt[i + 1];
  const s0 = L.arc[j0];
  const s1 = L.arc[j1];
  const c = Math.max(s0, Math.min(s1, s));
  const a = L.pts[j0];
  const b = L.pts[j1];
  const t = s1 > s0 ? (c - s0) / (s1 - s0) : 0;
  out.x = a.x + (b.x - a.x) * t;
  out.z = a.z + (b.z - a.z) * t;
  out.y = railY(L, c);
  out.yaw = Math.atan2(b.x - a.x, b.z - a.z);
  const ch = DEVOPS_M25_MOTION.car.chord;
  const lo = Math.max(s0, c - ch);
  const hi = Math.min(s1, c + ch);
  out.pitch = hi > lo ? Math.atan((railY(L, hi) - railY(L, lo)) / (hi - lo)) : 0;
}

/** Signed shortest a → b (rad). */
const signedTurn = (a: number, b: number): number => {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
};

const _p = newCarPose();

/**
 * Car on section `L` at sim time `t`: a cycle of dwell at the start, the climb (each leg eased,
 * a pivot `turn` s at every vertex), dwell at the end and the same back down. `phase` 0 starts at
 * the bottom, 0.5 at the top (the counter-moving car). Every leg takes a share of the trip by its
 * length, so two sections with the same `oneWay` meet at their shared station together.
 */
export function carPose(L: RailLine, t: number, phase: number, out: CarPose): CarPose {
  const C = DEVOPS_M25_MOTION.car;
  const nLeg = L.legAt.length - 1;
  const cyc = 2 * (C.oneWay + C.dwell);
  const u = ((((t / cyc + phase + C.phase) % 1) + 1) % 1) * cyc;
  const total = L.arc[L.arc.length - 1];
  // position along the one-way trip: τ in [0, oneWay]
  let tau: number;
  if (u < C.dwell) tau = 0;
  else if (u < C.dwell + C.oneWay) tau = u - C.dwell;
  else if (u < 2 * C.dwell + C.oneWay) tau = C.oneWay;
  else tau = C.oneWay - (u - 2 * C.dwell - C.oneWay);
  const move = Math.max(1e-3, C.oneWay - C.turn * (nLeg - 1));
  out.turning = -1;
  out.turnT = 0;
  let acc = 0;
  for (let i = 0; i < nLeg; i++) {
    const s0 = L.arc[L.legAt[i]];
    const s1 = L.arc[L.legAt[i + 1]];
    const T = (move * (s1 - s0)) / Math.max(total, 1e-3);
    if (tau <= acc + T || i === nLeg - 1) {
      const f = T > 0 ? Math.min(1, Math.max(0, (tau - acc) / T)) : 1;
      onLeg(L, i, s0 + (s1 - s0) * ease(f), out);
      return out;
    }
    acc += T;
    if (tau <= acc + C.turn) {
      // pivot at the vertex: from leg i's heading to leg i + 1's, pitch blended
      const f = smooth((tau - acc) / C.turn);
      onLeg(L, i, s1, out);
      const y0 = out.yaw;
      const p0 = out.pitch;
      onLeg(L, i + 1, s1, _p);
      out.yaw = y0 + signedTurn(y0, _p.yaw) * f;
      out.pitch = p0 + (_p.pitch - p0) * f;
      out.turning = i;
      out.turnT = (tau - acc) / C.turn;
      return out;
    }
    acc += C.turn;
  }
  return out;
}
