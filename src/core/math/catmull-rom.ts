/** Centripetal-ish Catmull–Rom over a closed or open polyline of [x, z] points. */
export interface Vec2 {
  x: number;
  y: number;
}

export function catmullRom(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, t: number, out: Vec2): Vec2 {
  const t2 = t * t;
  const t3 = t2 * t;
  out.x =
    0.5 *
    (2 * p1.x +
      (-p0.x + p2.x) * t +
      (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
      (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);
  out.y =
    0.5 *
    (2 * p1.y +
      (-p0.y + p2.y) * t +
      (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
      (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3);
  return out;
}

/** Resample a polyline through a Catmull–Rom spline into ~`segments` per edge. */
export function smoothPolyline(points: Vec2[], segments: number, closed: boolean): Vec2[] {
  const n = points.length;
  if (n < 2) return points.map((p) => ({ x: p.x, y: p.y }));
  const out: Vec2[] = [];
  const edges = closed ? n : n - 1;
  const get = (i: number): Vec2 =>
    closed ? points[((i % n) + n) % n] : points[Math.min(Math.max(i, 0), n - 1)];
  for (let e = 0; e < edges; e++) {
    for (let s = 0; s < segments; s++) {
      const t = s / segments;
      out.push(catmullRom(get(e - 1), get(e), get(e + 1), get(e + 2), t, { x: 0, y: 0 }));
    }
  }
  if (!closed) out.push({ x: points[n - 1].x, y: points[n - 1].y });
  return out;
}

/** Cumulative arc length table for arc-length parameterisation. */
export function arcLengths(points: Vec2[], closed: boolean): Float32Array {
  const n = points.length;
  const len = new Float32Array(closed ? n + 1 : n);
  len[0] = 0;
  for (let i = 1; i < len.length; i++) {
    const a = points[(i - 1) % n];
    const b = points[i % n];
    len[i] = len[i - 1] + Math.hypot(b.x - a.x, b.y - a.y);
  }
  return len;
}

/** Position at arc-length distance `d` (wraps when closed). */
export function pointAtLength(
  points: Vec2[],
  lens: Float32Array,
  d: number,
  closed: boolean,
  out: Vec2,
): Vec2 {
  const total = lens[lens.length - 1];
  if (total <= 0) {
    out.x = points[0].x;
    out.y = points[0].y;
    return out;
  }
  const s = closed ? ((d % total) + total) % total : Math.min(Math.max(d, 0), total);
  let lo = 0;
  let hi = lens.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (lens[mid] <= s) lo = mid;
    else hi = mid;
  }
  const seg = lens[hi] - lens[lo];
  const t = seg > 0 ? (s - lens[lo]) / seg : 0;
  const a = points[lo % points.length];
  const b = points[hi % points.length];
  out.x = a.x + (b.x - a.x) * t;
  out.y = a.y + (b.y - a.y) * t;
  return out;
}
