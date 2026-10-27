import { CUSTOMS_PORT as C, QA_CUSTOMS as K } from '../../content/themes/qa-customs.ts';
import type { XZ } from '../types.ts';

/**
 * Customs Port layout maths (M30 TASK-508, D-087). Pure (no three): the planner (gen/plans/qa-customs.ts)
 * tests and places it, the movers (render/culture-movers.ts) replay it. Everything lives in the CRANE
 * FRAME: origin at the quay crane (customsYard v1), `x` along the quay, `z` seaward, the same frame as
 * the crane prop's local x / z. The inspection line and the landing pontoon are on +x, `sl` = +-1 is the
 * side the ship lane comes from.
 */

const DEG = Math.PI / 180;

export interface PortSpec {
  /** The side the ship lane comes from (the inspection line is always on +x). */
  sl: 1 | -1;
  /** Index into CUSTOMS_PORT.lanes (0 = longest). */
  lane: number;
}

export interface PortPlacement {
  x: number;
  z: number;
  /** Fixture turn about the up axis in the crane frame: its local +z points along (sin turn, cos turn). */
  turn: number;
}

export interface PortLayout {
  spec: PortSpec;
  ok: PortPlacement & { variant: number };
  arch: PortPlacement;
  /** Landing pontoon first (always built), then the optional ones. */
  pontoons: (PortPlacement & { variant: number })[];
  /** Ship stop on the berth (centre) and the turn-around spot on the lane line. */
  berth: XZ;
  spot: XZ;
  /** The lane path outward from the spot: arc, then a straight run. */
  path: ShipPath;
}

export interface ShipPath {
  /** Lane side. */
  s: 1 | -1;
  /** Turn-around spot (d = 0) and the arc. */
  x0: number;
  z0: number;
  R: number;
  gamma: number;
  /** Arc length, straight length, total length, distance of the arch along the path. */
  arc: number;
  run: number;
  length: number;
  archD: number;
  /** Straight lane direction. */
  ux: number;
  uz: number;
  /** The arc's end (start of the straight run). */
  t1x: number;
  t1z: number;
}

/** Build the path of lane variant `lane` for lane side `s`. */
export function shipPath(s: 1 | -1, lane: number): ShipPath {
  const L = C.lanes[Math.min(C.lanes.length - 1, lane)];
  const gamma = C.laneDeg * DEG;
  const R = C.turnR;
  const tl = R * Math.tan(gamma / 2);
  const x0 = s * C.bayShift;
  const z0 = C.laneZ;
  const arc = R * gamma;
  const run = Math.max(0, L.spawn - tl);
  return {
    s,
    x0,
    z0,
    R,
    gamma,
    arc,
    run,
    length: arc + run,
    archD: arc + Math.max(0, L.arch - tl),
    ux: s * Math.cos(gamma),
    uz: Math.sin(gamma),
    t1x: x0 + R * s * Math.sin(gamma),
    t1z: z0 + R * (1 - Math.cos(gamma)),
  };
}

export interface PathPoint {
  x: number;
  z: number;
  /** Outward tangent (away from the spot). */
  hx: number;
  hz: number;
}

/** Position on the path at distance `d` from the turn-around spot (outward). */
export function pathAt(p: ShipPath, d: number, out: PathPoint): PathPoint {
  const dd = Math.min(p.length, Math.max(0, d));
  if (dd <= p.arc) {
    const phi = dd / p.R;
    out.x = p.x0 + p.R * p.s * Math.sin(phi);
    out.z = p.z0 + p.R * (1 - Math.cos(phi));
    out.hx = p.s * Math.cos(phi);
    out.hz = Math.sin(phi);
  } else {
    const e = dd - p.arc;
    out.x = p.t1x + p.ux * e;
    out.z = p.t1z + p.uz * e;
    out.hx = p.ux;
    out.hz = p.uz;
  }
  return out;
}

export function portLayout(spec: PortSpec): PortLayout {
  const { sl } = spec;
  const path = shipPath(sl, spec.lane);
  const at = (x: number, z: number, turn = 0): PortPlacement => ({ x, z, turn });
  const a = pathAt(path, path.archD, { x: 0, z: 0, hx: 0, hz: 0 });
  return {
    spec,
    ok: { ...at(C.okLine.x, C.okLine.z), variant: C.okLine.variant },
    // the arch faces along the arrival heading: its local +z = (-ux, -uz)
    arch: { x: a.x, z: a.z, turn: Math.atan2(-path.ux, -path.uz) },
    pontoons: C.pontoons.map((p) => {
      // `lane: true` sits on the side opposite the ship lane, the others on the belt side
      const x = p.lane ? -sl * Math.abs(p.x) : p.x;
      return { x, z: p.z, turn: p.turn, variant: p.variant };
    }),
    berth: { x: sl * C.bayShift, z: C.berthZ },
    spot: { x: path.x0, z: path.z0 },
    path,
  };
}

/** Crane frame -> world for a port whose crane stands at (ox, oz) with the fixture turn `rotY`. */
export function frameToWorld(ox: number, oz: number, rotY: number, x: number, z: number): XZ {
  const c = Math.cos(rotY);
  const sn = Math.sin(rotY);
  return { x: ox + sn * x + c * z, z: oz - c * x + sn * z };
}

/** World rotY of a fixture turned `turn` in the crane frame (see PortPlacement). */
export const fixtureRot = (rotY: number, turn: number): number => rotY - turn;

/** Hull half extents used by the planner's clearance tests. */
export const SHIP_HALF = { l: K.ship.l / 2, w: K.ship.beam / 2 } as const;

/**
 * Sample points (crane frame) that must be open water: the berth, the slide, the spin disc, the lane
 * every `step` u, each with the radius `r` of the hull part that sweeps it.
 */
export interface WaterProbe {
  x: number;
  z: number;
  r: number;
  /** berth / slide (next to the quay), spin ring, spin centre, lane. */
  kind: 'near' | 'ring' | 'spot' | 'lane';
}

export function waterProbes(lay: PortLayout, step = 3): WaterProbe[] {
  const out: WaterProbe[] = [];
  const { berth, spot, path } = lay;
  for (let k = -4; k <= 4; k++)
    out.push({ x: berth.x + (k * SHIP_HALF.l) / 4, z: berth.z, r: SHIP_HALF.w, kind: 'near' });
  for (let z = berth.z + 2; z <= spot.z - 4; z += 2)
    out.push({ x: spot.x, z, r: SHIP_HALF.w + 1.5, kind: 'near' });
  out.push({ x: spot.x, z: spot.z, r: SHIP_HALF.l, kind: 'spot' });
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    out.push({
      x: spot.x + Math.cos(a) * (SHIP_HALF.l - 2),
      z: spot.z + Math.sin(a) * (SHIP_HALF.l - 2),
      r: 2.4,
      kind: 'ring',
    });
  }
  const o = { x: 0, z: 0, hx: 0, hz: 0 };
  for (let d = step; d < path.length; d += step) {
    pathAt(path, d, o);
    out.push({ x: o.x, z: o.z, r: SHIP_HALF.w + 1.2, kind: 'lane' });
  }
  pathAt(path, path.length, o);
  out.push({ x: o.x, z: o.z, r: SHIP_HALF.w + 1.2, kind: 'lane' });
  return out;
}

/**
 * Discs the boat routes keep out of (world): the spin spot, the lane and the pontoons of every island
 * that carries a port (anchors `customs` / `customsFlip` / `customsLane`).
 */
export function portKeepOut(
  islands: readonly { anchors: Record<string, { x: number; z: number; rotY: number }> }[],
): { x: number; z: number; r: number }[] {
  const out: { x: number; z: number; r: number }[] = [];
  for (const isl of islands) {
    const a = isl.anchors.customs;
    const f = isl.anchors.customsFlip;
    const l = isl.anchors.customsLane;
    if (!a || !f || !l) continue;
    const lay = portLayout({ sl: f.z > 0 ? 1 : -1, lane: l.x });
    const w = (p: XZ): XZ => frameToWorld(a.x, a.z, a.rotY, p.x, p.z);
    const s = w(lay.spot);
    out.push({ x: s.x, z: s.z, r: C.keepOut.spot });
    const o = { x: 0, z: 0, hx: 0, hz: 0 };
    for (let d = 5; d <= lay.path.length + 4.9; d += 5) {
      const q = w(pathAt(lay.path, Math.min(d, lay.path.length), o));
      out.push({ x: q.x, z: q.z, r: C.keepOut.lane });
    }
    for (const p of lay.pontoons.slice(0, 2)) {
      const q = w(p);
      out.push({ x: q.x, z: q.z, r: C.keepOut.pontoon });
    }
  }
  return out;
}
