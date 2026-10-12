/**
 * Ferry timetable (TASK-434): arc length along a closed route as a closed-form function of time.
 * The cycle starts standing at stop 0; for each stop: dwell, then a leg to the next stop (accelerate
 * at `decel`, cruise at `speed`, brake to a standstill). Pure, so capture/freeze and any seek agree.
 */
export interface FerryLeg {
  /** Cycle time at which the dwell before this leg starts, s. */
  t0: number;
  /** Arc length of the stop the leg leaves from (unwrapped, ascending). */
  s0: number;
  len: number;
  /** Peak speed (< cruise on short legs) and ramp duration/length. */
  vp: number;
  ramp: number;
  rampLen: number;
  /** Leg travel time (excl. dwell). */
  dur: number;
}

export interface FerrySchedule {
  total: number;
  dwell: number;
  cycle: number;
  speed: number;
  legs: FerryLeg[];
  /** Stop arcs ascending, in [0, total). Empty = a plain cruise loop. */
  stops: number[];
}

export function buildFerrySchedule(
  total: number,
  stopArcs: readonly number[],
  dwell: number,
  speed: number,
  decel: number,
): FerrySchedule {
  const stops = [...stopArcs].sort((a, b) => a - b);
  const legs: FerryLeg[] = [];
  let t = 0;
  stops.forEach((s, k) => {
    const next = k + 1 < stops.length ? stops[k + 1] : stops[0] + total;
    const len = next - s;
    const vp = Math.min(speed, Math.sqrt(decel * len));
    const ramp = vp / decel;
    const rampLen = (vp * vp) / (2 * decel);
    const dur = 2 * ramp + Math.max(0, len - 2 * rampLen) / vp;
    legs.push({ t0: t, s0: s, len, vp, ramp, rampLen, dur });
    t += dwell + dur;
  });
  return { total, dwell, cycle: stops.length ? t : total / speed, speed, legs, stops };
}

/** Unwrapped distance travelled at schedule time `tau` (monotone; position = d mod total). */
export function ferryDist(sch: FerrySchedule, tau: number): number {
  if (sch.legs.length === 0) return tau * sch.speed;
  const laps = Math.floor(tau / sch.cycle);
  const c = tau - laps * sch.cycle;
  const base = laps * sch.total;
  let k = sch.legs.length - 1;
  while (k > 0 && sch.legs[k].t0 > c) k--;
  const L = sch.legs[k];
  const u = c - L.t0 - sch.dwell;
  if (u <= 0) return base + L.s0;
  if (u >= L.dur) return base + L.s0 + L.len;
  let s: number;
  if (u < L.ramp) s = 0.5 * (L.vp / L.ramp) * u * u;
  else if (u > L.dur - L.ramp) {
    const r = L.dur - u;
    s = L.len - 0.5 * (L.vp / L.ramp) * r * r;
  } else s = L.rampLen + L.vp * (u - L.ramp);
  return base + L.s0 + s;
}

/** True while the ferry stands at a stop at schedule time `tau`. */
export function ferryDwelling(sch: FerrySchedule, tau: number): boolean {
  if (sch.legs.length === 0) return false;
  const c = tau - Math.floor(tau / sch.cycle) * sch.cycle;
  let k = sch.legs.length - 1;
  while (k > 0 && sch.legs[k].t0 > c) k--;
  return c - sch.legs[k].t0 <= sch.dwell || c - sch.legs[k].t0 >= sch.dwell + sch.legs[k].dur;
}
