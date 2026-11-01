/**
 * The site's coaster in its KIT frame (TASK-541, D-122): the published track (plans/qa-park.ts) divided
 * by the site's scale, so one unit-scale kit (rails, ties, cars, riders, station, rink) fits every site
 * and the renderer scales it as a whole. Kit frame: x / z = the site's local frame / scale, y = height
 * over the station's ground / scale. World = origin + `scale` × (x (sin rotY, −cos rotY) + z (cos rotY,
 * sin rotY)), y = groundY + scale × y: a prop at the site origin with `rotY` and `scale`.
 *
 * Pure (no three). Null on the seeds without a site: the kit, the movers and the scenes all skip then.
 */
import { COASTER_PART_RANGE, coasterTrackOf } from './gen/plans/qa-park.ts';
import { COASTER_TEMPLATE, QA_PARK } from '../content/themes/qa-park.ts';
import { QA_COASTER } from '../content/themes/qa-coaster.ts';
import { createCoasterSpline, type CoasterSpline } from './coaster-spline.ts';
import type { IslandData, XZ } from './types.ts';

export interface CoasterKit {
  /** Control points, kit frame. */
  points: ReadonlyArray<readonly [number, number, number]>;
  spline: CoasterSpline;
  /** The site's frame: origin, heading, scale, the station's ground (the kit's y = 0). */
  origin: XZ;
  rotY: number;
  scale: number;
  groundY: number;
  /** Chain lift as arc lengths: from the lift's foot up to the crest. */
  chain: ReadonlyArray<readonly [number, number]>;
  /** Arc length of the crest (the highest point of lift + turn): the gravity run starts here. */
  crestS: number;
  /** Arc length of the lead car when the train stands centred on the platform. */
  stopS: number;
  /** Arc length where the loop starts (the wow moment). */
  loopS: number;
  /** Bumper rink floor: centre, size, ground height (kit frame). */
  rink: { x: number; z: number; w: number; d: number; y: number };
}

/** Kit-frame point → world (x, y, z). */
export function coasterKitToWorld(
  kit: Pick<CoasterKit, 'origin' | 'rotY' | 'scale' | 'groundY'>,
  x: number,
  y: number,
  z: number,
): [number, number, number] {
  const s = kit.scale;
  const c = Math.cos(kit.rotY);
  const n = Math.sin(kit.rotY);
  return [
    kit.origin.x + s * (n * x + c * z),
    kit.groundY + s * y,
    kit.origin.z + s * (-c * x + n * z),
  ];
}

/** The island's coaster in the kit frame, or null without a site. */
export function coasterKitOf(isl: IslandData): CoasterKit | null {
  const tr = coasterTrackOf(isl);
  if (!tr) return null;
  const s = tr.scale;
  const points = tr.points.map(
    (p) => [p[0] / s, (p[1] - tr.groundY) / s, p[2] / s] as [number, number, number],
  );
  const spline = createCoasterSpline(points, { closed: true });
  const [lift0] = COASTER_PART_RANGE.lift;
  const [, turn1] = COASTER_PART_RANGE.turn;
  let crest = lift0;
  for (let i = lift0; i <= turn1; i++) if (points[i][1] > points[crest][1]) crest = i;
  const crestS = spline.controlS[crest];
  const st0 = spline.controlS[COASTER_PART_RANGE.station[0]];
  // the train's middle car over the platform's middle (the station's points are collinear)
  const mid = st0 + (QA_PARK.station.z - COASTER_TEMPLATE.station[0][2]);
  const stopS = mid + ((QA_COASTER.car.cars - 1) / 2) * QA_COASTER.car.pitch;
  const A = isl.anchors;
  const rc = A.coasterRink;
  const rs = A.coasterRinkSize;
  const dx = rc.x - tr.origin.x;
  const dz = rc.z - tr.origin.z;
  const n = Math.sin(tr.rotY);
  const c = Math.cos(tr.rotY);
  return {
    points,
    spline,
    origin: tr.origin,
    rotY: tr.rotY,
    scale: s,
    groundY: tr.groundY,
    chain: [[spline.controlS[lift0], crestS]],
    crestS,
    stopS,
    loopS: spline.controlS[COASTER_PART_RANGE.loop[0]],
    rink: {
      x: (n * dx - c * dz) / s,
      z: (c * dx + n * dz) / s,
      w: rs.x / s,
      d: rs.z / s,
      y: ((rc.y ?? tr.groundY) - tr.groundY) / s,
    },
  };
}
