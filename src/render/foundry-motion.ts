/**
 * Bot Foundry motion (TASK-545, D-124; numbers content/themes/coding-foundry-motion.ts). Pure, no three:
 * every pose is a closed-form function of the sim time, so a capture lands on the exact frame.
 *
 * The line indexes: each `period` the belt moves one station pitch, then stands while the three arms
 * bring a body, a head and an antenna from their crates. A finished bot rides to the belt's end, hops
 * over the chute, stands, and walks the footpath off the yard in a queue, one every period.
 *
 * Hand-off to the agent pool is an illusion, by choice: the agent cap is full on low and medium (D-116),
 * so the walkers are instances, not agents. The pool of instances is fixed by the route's length; each
 * shrinks away at the route's end, on the footpath where the real workers walk.
 */
import { CODING_FOUNDRY_MOTION as M } from '../content/themes/coding-foundry-motion.ts';
import { CODING_FOUNDRY } from '../content/themes/coding-foundry.ts';
import { heightAt, type IslandData, type WorldData, type XZ } from '../world/types.ts';

const TAU = Math.PI * 2;
const sat = (x: number): number => Math.min(1, Math.max(0, x));
const smooth = (x: number): number => {
  const t = sat(x);
  return t * t * (3 - 2 * t);
};
const span = (t: number, a: readonly [number, number]): number => (t - a[0]) / (a[1] - a[0]);
const mod = (x: number, m: number): number => ((x % m) + m) % m;

/** Which mesh an item draws. `foundryPart` variants, plus the arm's swing group. */
export const ITEM = { arm: 0, body: 3, botHead: 4, bot: 5, head: 6, antenna: 7 } as const;
export type ItemKind = (typeof ITEM)[keyof typeof ITEM];

export interface FoundryItem {
  kind: ItemKind;
  x: number;
  y: number;
  z: number;
  /** Heading of the item's +x, xz (cos, sin). */
  heading: number;
  /** Roll about its +x. */
  roll: number;
  /** Scale up, scale across (squash keeps the volume). */
  sy: number;
  sxz: number;
}

export interface FoundryFrame {
  n: number;
  items: FoundryItem[];
}

export function newFoundryFrame(cap = 24): FoundryFrame {
  return {
    n: 0,
    items: Array.from({ length: cap }, () => ({
      kind: ITEM.bot,
      x: 0,
      y: 0,
      z: 0,
      heading: 0,
      roll: 0,
      sy: 1,
      sxz: 1,
    })),
  };
}

function push(
  f: FoundryFrame,
  kind: ItemKind,
  x: number,
  y: number,
  z: number,
  heading: number,
  roll = 0,
  sy = 1,
  sxz = sy === 1 ? 1 : 1 / Math.sqrt(sy),
): void {
  if (f.n >= f.items.length) return;
  const it = f.items[f.n++];
  it.kind = kind;
  it.x = x;
  it.y = y;
  it.z = z;
  it.heading = heading;
  it.roll = roll;
  it.sy = sy;
  it.sxz = sxz;
}

export interface FoundryLine {
  /** Belt start, its heading, its length, ground level of the yard, the belt top. */
  x0: number;
  z0: number;
  heading: number;
  hx: number;
  hz: number;
  belt: number;
  ground: number;
  beltY: number;
  /** Stations along the belt (u), one pitch apart. */
  stations: readonly [number, number, number];
  pitch: number;
  /** Arm bases, the heading from each to the belt. */
  arms: ReadonlyArray<{ x: number; z: number; toBelt: number }>;
  exit: { x: number; y: number; z: number };
  /** Walk from the landing on: equal `sample` spacing, world y. */
  route: ReadonlyArray<{ x: number; y: number; z: number }>;
  /** Route length (u). */
  walk: number;
}

const chain = (isl: IslandData, key: string): NonNullable<IslandData['anchors'][string]>[] => {
  const out = [];
  for (let k = 0; isl.anchors[`${key}${k}`]; k++) out.push(isl.anchors[`${key}${k}`]);
  return out;
};

/**
 * The footpaths on from `p`: the polylines are split at the graph's junctions, so chain them, at each
 * junction the one whose far end lies nearest the campus hub (the way real workers walk), until `max` u.
 */
function pathFrom(world: WorldData, isl: IslandData, p: XZ, max: number): XZ[] {
  const hub = world.settlements.find((c) => c.islandId === isl.id)?.hub ?? { x: isl.cx, z: isl.cz };
  const lines = world.paths.filter((l) => l.islandId === isl.id && l.points.length >= 2);
  const used = new Set<number>();
  const out: XZ[] = [];
  let at = p;
  let len = 0;
  while (len < max) {
    let best = -1;
    let flip = false;
    let bs = Infinity;
    lines.forEach((l, i) => {
      if (used.has(i)) return;
      const a = l.points[0];
      const b = l.points[l.points.length - 1];
      for (const [q, far, fl] of [
        [a, b, false],
        [b, a, true],
      ] as const) {
        if (Math.hypot(q.x - at.x, q.z - at.z) > M.walk.pathNear) continue;
        const sc = Math.hypot(far.x - hub.x, far.z - hub.z);
        if (sc < bs) {
          bs = sc;
          best = i;
          flip = fl;
        }
      }
    });
    if (best < 0) break;
    used.add(best);
    const pts = flip ? [...lines[best].points].reverse() : lines[best].points;
    for (const q of pts) {
      len += Math.hypot(q.x - at.x, q.z - at.z);
      out.push({ x: q.x, z: q.z });
      at = q;
    }
  }
  return out;
}

/** Corners cut, resampled at `step`, at most `max` long. */
function resample(pts: readonly XZ[], step: number, max: number): XZ[] {
  let cur = [...pts];
  for (let pass = 0; pass < 2; pass++) {
    const out: XZ[] = [cur[0]];
    for (let i = 0; i + 1 < cur.length; i++) {
      const a = cur[i];
      const b = cur[i + 1];
      out.push({ x: a.x * 0.75 + b.x * 0.25, z: a.z * 0.75 + b.z * 0.25 });
      out.push({ x: a.x * 0.25 + b.x * 0.75, z: a.z * 0.25 + b.z * 0.75 });
    }
    out.push(cur[cur.length - 1]);
    cur = out;
  }
  const res: XZ[] = [cur[0]];
  let left = step;
  for (let i = 0; i + 1 < cur.length && (res.length - 1) * step < max; i++) {
    const a = cur[i];
    const b = cur[i + 1];
    const d = Math.hypot(b.x - a.x, b.z - a.z);
    let at = left;
    while (at <= d && (res.length - 1) * step < max) {
      res.push({ x: a.x + ((b.x - a.x) * at) / d, z: a.z + ((b.z - a.z) * at) / d });
      at += step;
    }
    left = at - d;
  }
  return res;
}

/** The line of a world, or null on a seed without one. */
export function foundryLineOf(
  world: WorldData,
  isl: IslandData,
  walkLen: number,
): FoundryLine | null {
  const A = isl.anchors;
  const a = A.foundryLine0;
  const b = A.foundryLine1;
  const ex = A.foundryExit;
  const gate = A.foundryGate;
  if (!a || !b || !ex || !gate) return null;
  const ground = a.y ?? 0;
  const belt = Math.hypot(b.x - a.x, b.z - a.z);
  const hx = (b.x - a.x) / belt;
  const hz = (b.z - a.z) / belt;
  const pitch = belt / 4;
  const arms = chain(isl, 'foundryArm').map((p) => ({ x: p.x, z: p.z, toBelt: p.rotY }));
  const onward = pathFrom(world, isl, gate, walkLen);
  // off the landing round the arms and crates: along a side lane of the yard, not across the line
  const gu = (gate.x - a.x) * hx + (gate.z - a.z) * hz;
  const gv = -(gate.x - a.x) * hz + (gate.z - a.z) * hx;
  const eu = (ex.x - a.x) * hx + (ex.z - a.z) * hz;
  const lane = gv > 1 ? M.walk.laneArms : -M.walk.laneFree;
  const frame = (u: number, v: number): XZ => ({
    x: a.x + hx * u - hz * v,
    z: a.z + hz * u + hx * v,
  });
  const side = gu < eu - 3 ? [frame(eu, lane), frame(gu, lane)] : [];
  const way = resample(
    [{ x: ex.x, z: ex.z }, ...side, { x: gate.x, z: gate.z }, ...onward],
    M.walk.sample,
    walkLen,
  );
  const route = way.map((p) => ({ x: p.x, y: heightAt(world.height, p.x, p.z), z: p.z }));
  return {
    x0: a.x,
    z0: a.z,
    heading: a.rotY,
    hx,
    hz,
    belt,
    ground,
    beltY: ground + M.line.beltY,
    stations: [pitch, pitch * 2, pitch * 3],
    pitch,
    arms,
    exit: { x: ex.x, y: ex.y ?? ground, z: ex.z },
    route,
    walk: (route.length - 1) * M.walk.sample,
  };
}

/** Time of the landing, s after the period in which the bot started for the belt's end. */
export const landingAt = (): number => M.line.move + M.hop.wait + M.hop.crouch + M.hop.air;

/** How many periods a walker lives after it reached the belt's end. */
export function walkerPeriods(line: FoundryLine): number {
  const life = landingAt() + M.hop.stand + line.walk / M.walk.speed + M.walk.outFor;
  return Math.ceil(life / M.line.period);
}

const settle = (u: number): number => {
  if (u < 0) return 1;
  const S = M.line.settle;
  return 1 - S.amt * Math.exp(-S.decay * u) * Math.cos(S.freq * u);
};

/** Arm `k`'s state at `t`: heading of the forearm, lift, held part scale (0 = empty). */
export function armAt(
  line: FoundryLine,
  k: number,
  t: number,
): { heading: number; lift: number; hold: number; released: boolean; ft: number } {
  const A = M.arm;
  const ft = mod(t - k * M.line.armLag, M.line.period);
  const out = smooth(span(ft, A.swingOut));
  const back = smooth(span(ft, A.swingBack));
  // overshoot past each end of the swing, gone in 0.4 s
  const over = (u: number): number => (u > 0 && u < 0.4 ? Math.sin((u / 0.4) * Math.PI) : 0);
  const share =
    out - back + A.overshoot * over(ft - A.swingOut[1]) - A.overshoot * over(ft - A.swingBack[1]);
  // alternate turning sense station by station
  const dir = k % 2 === 0 ? 1 : -1;
  const heading = line.arms[k].toBelt + dir * Math.PI * (1 - share);
  const placed = A.lift[k];
  const carried = placed + A.dip;
  const up = smooth(span(ft, A.raise)) * (1 - smooth(span(ft, A.lower)));
  const dipIn = smooth((ft - (A.releaseAt - A.dipFor)) / A.dipFor);
  const dipOut = smooth((ft - A.releaseAt) / A.dipFor);
  const lift = carried * up - A.dip * dipIn * (1 - dipOut);
  const held = ft >= A.pickAt && ft < A.releaseAt;
  const hold = held ? smooth((ft - A.pickAt) / A.popFor) : 0;
  return { heading, lift, hold, released: ft >= A.releaseAt, ft };
}

/** Line, its bots and the walkers at sim time `t` (t >= 0 or negative alike). */
export function foundryFrame(line: FoundryLine, t: number, f: FoundryFrame): void {
  f.n = 0;
  const P = M.line.period;
  const n = Math.floor(t / P);
  const ph = t - n * P;
  const belt = smooth(ph / M.line.move);
  const stopped = ph - M.line.move;
  const at = (u: number): [number, number] => [line.x0 + line.hx * u, line.z0 + line.hz * u];
  const nArms = line.arms.length;
  for (let k = 0; k < nArms; k++) {
    const a = armAt(line, k, t);
    const b = line.arms[k];
    push(f, ITEM.arm, b.x, line.ground + M.arm.plinth + a.lift, b.z, a.heading);
    if (a.hold > 0) {
      const reach = Math.hypot(
        line.x0 + line.hx * line.stations[k] - b.x,
        line.z0 + line.hz * line.stations[k] - b.z,
      );
      const px = b.x + Math.cos(a.heading) * reach;
      const pz = b.z + Math.sin(a.heading) * reach;
      const py = line.ground + M.arm.clawY + a.lift - M.arm.partTop[k];
      const kind = k === 0 ? ITEM.body : k === 1 ? ITEM.head : ITEM.antenna;
      const yaw = line.heading + (a.heading - b.toBelt);
      push(f, kind, px, py, pz, yaw, 0, a.hold, a.hold);
    }
  }
  const st = line.stations;
  // bot at station 0 once arm 0 let go
  {
    const a = armAt(line, 0, t);
    if (a.released) {
      const [x, z] = at(st[0]);
      const u = a.ft - M.arm.releaseAt;
      push(f, ITEM.body, x, line.beltY, z, line.heading, 0, settle(u));
    }
  }
  // moving to station 1: bare until arm 1 lets go
  {
    const a = armAt(line, 1, t);
    const [x, z] = at(st[0] + line.pitch * belt);
    const u = a.released ? a.ft - M.arm.releaseAt : stopped;
    push(f, a.released ? ITEM.botHead : ITEM.body, x, line.beltY, z, line.heading, 0, settle(u));
  }
  // to station 2: gets its antenna
  {
    const a = armAt(line, 2, t);
    const [x, z] = at(st[1] + line.pitch * belt);
    const u = a.released ? a.ft - M.arm.releaseAt : stopped;
    push(f, a.released ? ITEM.bot : ITEM.botHead, x, line.beltY, z, line.heading, 0, settle(u));
  }
  // to the belt's end, the hop, the walk: this period's and the walkers still on their route
  const nw = walkerPeriods(line);
  for (let a = 0; a < nw; a++) {
    botOff(line, ph + a * P, a === 0 ? belt : 1, f);
  }
}

/** The finished bot, `u` s after it started for the belt's end. */
function botOff(line: FoundryLine, u: number, belt: number, f: FoundryFrame): void {
  const H = M.hop;
  const W = M.walk;
  const end: [number, number] = [line.x0 + line.hx * line.belt, line.z0 + line.hz * line.belt];
  const t0 = M.line.move + H.wait;
  if (u < t0) {
    const s = line.stations[2] + line.pitch * belt;
    push(
      f,
      ITEM.bot,
      line.x0 + line.hx * s,
      line.beltY,
      line.z0 + line.hz * s,
      line.heading,
      0,
      settle(u - M.line.move),
    );
    return;
  }
  if (u < t0 + H.crouch) {
    // anticipation: squash
    const q = (u - t0) / H.crouch;
    const sy = 1 - 0.16 * Math.sin((q * Math.PI) / 2);
    push(f, ITEM.bot, end[0], line.beltY, end[1], line.heading, 0, sy);
    return;
  }
  const t1 = t0 + H.crouch;
  if (u < t1 + H.air) {
    const q = (u - t1) / H.air;
    const y = line.beltY + (line.exit.y - line.beltY) * q + 4 * H.height * q * (1 - q);
    const x = end[0] + (line.exit.x - end[0]) * q;
    const z = end[1] + (line.exit.z - end[1]) * q;
    // stretched leaving, back to round at the top
    const sy = 1 + 0.1 * Math.abs(1 - 2 * q);
    push(f, ITEM.bot, x, y, z, line.heading, 0, sy);
    return;
  }
  const t2 = t1 + H.air;
  const w = u - t2;
  const R = line.route;
  const out = w - H.stand - line.walk / W.speed;
  if (out >= W.outFor) return;
  if (w < H.stand) {
    // landing squash, then a look round
    const sy = 1 - H.squash * Math.exp(-7 * w) * Math.cos(16 * w);
    const look = 0.45 * Math.sin((w / H.stand) * TAU) * (1 - w / H.stand);
    const h = routeHeading(R, 0, line.heading);
    const blend = smooth(w / H.stand);
    push(f, ITEM.bot, R[0].x, R[0].y, R[0].z, angleLerp(line.heading, h, blend) + look, 0, sy);
    return;
  }
  const s = Math.min(line.walk, (w - H.stand) * W.speed);
  const i = s / W.sample;
  const i0 = Math.min(R.length - 1, Math.floor(i));
  const i1 = Math.min(R.length - 1, i0 + 1);
  const q = i - i0;
  const gait = (w - H.stand) / W.step;
  const bob = W.stepH * Math.abs(Math.sin(gait * Math.PI));
  const roll = W.roll * Math.sin(gait * Math.PI);
  const shrink = out > 0 ? 1 - smooth(out / W.outFor) : 1;
  push(
    f,
    ITEM.bot,
    R[i0].x + (R[i1].x - R[i0].x) * q,
    R[i0].y + (R[i1].y - R[i0].y) * q + bob,
    R[i0].z + (R[i1].z - R[i0].z) * q,
    routeHeading(R, i, line.heading),
    roll,
    shrink,
    shrink,
  );
}

function angleLerp(a: number, b: number, q: number): number {
  const d = mod(b - a + Math.PI, TAU) - Math.PI;
  return a + d * q;
}

/** Tangent at route index `i`, eased over the next few samples so a corner is a turn, not a snap. */
function routeHeading(
  R: ReadonlyArray<{ x: number; z: number }>,
  i: number,
  fallback: number,
): number {
  const i0 = Math.min(R.length - 1, Math.max(0, Math.floor(i) - 1));
  const i1 = Math.min(R.length - 1, Math.floor(i) + 2);
  if (i1 === i0) return fallback;
  return Math.atan2(R[i1].z - R[i0].z, R[i1].x - R[i0].x);
}

/* ------------------------------ test track ------------------------------ */

export interface BotTrack {
  x0: number;
  z0: number;
  hx: number;
  hz: number;
  heading: number;
  y: number;
  /** Station centres along the axis (u), course range, botCourse variant of each. */
  stations: number[];
  variants: number[];
  u0: number;
  u1: number;
  /** Lap time and the shares of its legs. */
  lap: number;
}

export function botTrackOf(isl: IslandData): BotTrack | null {
  const st = chain(isl, 'botTrack');
  if (st.length === 0) return null;
  const a = st[0];
  const heading = a.rotY;
  const hx = Math.cos(heading);
  const hz = Math.sin(heading);
  const pitch = CODING_FOUNDRY.track.pitch;
  const stations = st.map((_, k) => k * pitch);
  const u0 = -pitch / 2;
  const u1 = stations[stations.length - 1] + pitch / 2;
  const T = M.track;
  const r = T.returnV / 2;
  const lap = (u1 - u0) / T.speed + (u1 - u0) / T.speedReturn + (2 * Math.PI * r) / T.speedReturn;
  return {
    x0: a.x,
    z0: a.z,
    hx,
    hz,
    heading,
    y: a.y ?? 0,
    stations,
    variants: st.map((_, k) => M.track.order[k % M.track.order.length]),
    u0,
    u1,
    lap,
  };
}

/** Knots (x, y) of a course's walking height, smooth between them. */
const PROFILE: Readonly<Record<number, ReadonlyArray<readonly [number, number]>>> = {
  0: [
    [-1.25, 0],
    [-1.0, 0.2],
    [-0.45, 0.2],
    [-0.25, 0.4],
    [0.25, 0.4],
    [0.45, 0.6],
    [1.0, 0.6],
    [1.4, 0],
  ],
  1: [
    [-1.2, 0],
    [1.1, 0.58],
    [1.25, 0.72],
    [1.4, 0.72],
    [1.75, 0],
  ],
  3: [
    [-1.75, 0],
    [-1.55, 0.3],
    [-1.2, 0.3],
    [-0.6, 0.413],
    [0, 0.46],
    [0.6, 0.413],
    [1.2, 0.3],
    [1.55, 0.3],
    [1.75, 0],
  ],
};

/** Course height at local `x` of variant `v` (exported for tests). */
export function courseHeight(v: number, x: number): number {
  const K = PROFILE[v];
  if (!K) return 0;
  if (x <= K[0][0] || x >= K[K.length - 1][0]) return 0;
  for (let i = 0; i + 1 < K.length; i++) {
    if (x > K[i + 1][0]) continue;
    const q = smooth((x - K[i][0]) / (K[i + 1][0] - K[i][0]));
    return K[i][1] + (K[i + 1][1] - K[i][1]) * q;
  }
  return 0;
}

/** Sideways swing round the cones (variant 2). */
function courseSide(v: number, x: number): number {
  if (v !== 2) return 0;
  const win = smooth((1.8 - Math.abs(x)) / 0.3);
  return -M.track.slalom * Math.cos((Math.PI * (x + 1.5)) / 0.75) * win;
}

/** First-step bot `k` of `count` at `t`. */
export function trackBotFrame(
  tr: BotTrack,
  k: number,
  count: number,
  t: number,
  f: FoundryFrame,
): void {
  const T = M.track;
  const L = tr.u1 - tr.u0;
  const r = T.returnV / 2;
  const arc = Math.PI * r;
  const tF = L / T.speed;
  const tA = arc / T.speedReturn;
  const tB = L / T.speedReturn;
  // never in sync: even spacing, plus a little from the bot's index
  const q = mod(t + (k / count) * tr.lap + k * 1.7, tr.lap);
  let u: number;
  let v: number;
  let dh: number;
  let step: number;
  let extra = 0;
  let yOver = 0;
  if (q < tF) {
    u = tr.u0 + q * T.speed;
    const i = Math.min(tr.stations.length - 1, Math.floor(((u - tr.u0) / L) * tr.stations.length));
    const x = u - tr.stations[i];
    const vr = tr.variants[i];
    yOver = courseHeight(vr, x);
    const ds = (courseSide(vr, x + 0.05) - courseSide(vr, x - 0.05)) / 0.1;
    dh = Math.atan(ds);
    v = courseSide(vr, x);
    step = T.step;
  } else if (q < tF + tA) {
    // the U-turn at the far end, the cheer in it
    const a = (q - tF) / tA;
    u = tr.u1 + Math.sin(a * Math.PI) * r;
    v = r - Math.cos(a * Math.PI) * r;
    dh = a * Math.PI;
    extra = T.cheer.height * Math.sin(Math.min(1, a * 1.6) * Math.PI);
    step = T.step * 0.8;
  } else if (q < tF + tA + tB) {
    u = tr.u1 - (q - tF - tA) * T.speedReturn;
    v = T.returnV;
    dh = Math.PI;
    step = M.walk.step;
  } else {
    const a = (q - tF - tA - tB) / tA;
    u = tr.u0 - Math.sin(a * Math.PI) * r;
    v = r + Math.cos(a * Math.PI) * r;
    dh = Math.PI + a * Math.PI;
    step = M.walk.step;
  }
  const gait = t / step + k * 0.37;
  const bob = (dh === Math.PI ? M.walk.stepH : T.stepH) * Math.abs(Math.sin(gait * Math.PI));
  // +v = heading turned +90°
  const x = tr.x0 + tr.hx * u - tr.hz * v;
  const z = tr.z0 + tr.hz * u + tr.hx * v;
  const roll = (dh === Math.PI ? M.walk.roll : T.roll) * Math.sin(gait * Math.PI);
  push(f, ITEM.bot, x, tr.y + yOver + bob + extra, z, tr.heading + dh, roll);
}
