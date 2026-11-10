/**
 * Horseshoe Harbour life plan (M52 TASK-662, D-170). Pure data: no three.js, no clock, no
 * `Math.random`; every choice is a hash of (world seed, slot). The marina's anchors
 * (world/gen/plans/hq-horseshoe.ts) become `TableauBot`s of the Workers kind: strollers on a
 * closed-form route along the promenade lane, diners in the terrace chairs, vendors beside the
 * stalls. Numbers: content/life-marina.ts, chairs and tables: content/themes/hq-horseshoe-look.ts.
 */
import { MARINA_LIFE, marinaCounts, type Shift } from '../content/life-marina.ts';
import { MARINA_LOOK } from '../content/themes/hq-horseshoe-look.ts';
import { MARINA_SITE } from '../content/themes/hq-horseshoe-site.ts';
import { unitHash } from '../core/hash.ts';
import { inMarina } from '../world/gen/plans/hq-horseshoe.ts';
import { lotLocalToWorld } from '../world/lot-frame.ts';
import type { WorldData } from '../world/types.ts';
import type { TableauBot } from './workers-world.ts';

const SALT = 0x6d61;

/** A leg of a stroller's cycle: walk `s0 → s1` over [t0, tw), then stand until `t1` facing `face`. */
interface Leg {
  t0: number;
  tw: number;
  t1: number;
  s0: number;
  s1: number;
  face: number;
}

/** Closed-form promenade walk: the lane polyline and a stroller's back-and-forth cycle on it. */
export interface StrollRoute {
  x: Float32Array;
  z: Float32Array;
  /** Arc length at each lane point (u). */
  cum: Float32Array;
  legs: Leg[];
  cycle: number;
}

export interface StrollPose {
  x: number;
  z: number;
  /** World heading (xz angle). */
  hd: number;
  moving: boolean;
}

/** What makes a marina bot different from a story-spot tableau bot. */
export interface TownBot {
  /** Hours the bot is out (edges jittered), see `onShift`. */
  shift: Shift;
  /** Seconds added to the sim clock for its beats / route (per-bot phase). */
  offset: number;
  route?: StrollRoute;
}

/** True while `hour` (0..24) lies inside `shift`; windows may pass midnight (`to` > 24). */
export function onShift(shift: Shift, hour: number): boolean {
  const h = hour < shift[0] ? hour + 24 : hour;
  return h >= shift[0] && h < shift[1];
}

let _tx = 1;
let _tz = 0;
type Lane = { x: Float32Array; z: Float32Array; cum: Float32Array };

/** Lane point at arc length `s` (clamped); leaves the segment's direction in (_tx, _tz). */
function laneAt(r: Lane, s: number, out: { x: number; z: number }): void {
  const n = r.cum.length;
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (r.cum[mid] <= s) lo = mid;
    else hi = mid;
  }
  const len = Math.max(1e-6, r.cum[hi] - r.cum[lo]);
  const k = Math.min(1, Math.max(0, (s - r.cum[lo]) / len));
  out.x = r.x[lo] + (r.x[hi] - r.x[lo]) * k;
  out.z = r.z[lo] + (r.z[hi] - r.z[lo]) * k;
  _tx = r.x[hi] - r.x[lo];
  _tz = r.z[hi] - r.z[lo];
}

const smooth = (u: number): number => u * u * (3 - 2 * u);

/** Position and heading on `route` at clock `t` (s, any value; the cycle repeats). */
export function strollAt(r: StrollRoute, t: number, out: StrollPose): StrollPose {
  const c = ((t % r.cycle) + r.cycle) % r.cycle;
  let leg = r.legs[r.legs.length - 1];
  for (const l of r.legs)
    if (c < l.t1) {
      leg = l;
      break;
    }
  let s = leg.s1;
  out.moving = false;
  if (c < leg.tw) {
    const u = (c - leg.t0) / Math.max(1e-6, leg.tw - leg.t0);
    s = leg.s0 + (leg.s1 - leg.s0) * smooth(u);
    out.moving = true;
  }
  laneAt(r, s, out);
  if (out.moving) {
    const dir = Math.sign(leg.s1 - leg.s0) || 1;
    out.hd = Math.atan2(_tz * dir, _tx * dir);
  } else out.hd = leg.face;
  return out;
}

interface Stop {
  s: number;
  face: number;
  /** Pause weight (1 = a full pause, ends turn around quickly). */
  w: number;
  stall: boolean;
}

export interface MarinaPlan {
  island: number;
  /** The bay's centre on the water (world xz); the quay's own reach is `QuayPoint`s (`marinaQuayPoints`). */
  centre: { x: number; z: number };
  /** Total length of the strollers' walks along the promenade (u; tests / report). */
  laneLength: number;
  bots: TableauBot[];
  /** Counts by class (tests / report). */
  strollers: number;
  diners: number;
  vendors: number;
}

const heading = (dx: number, dz: number): number => Math.atan2(dz, dx);

/** A quay centre-line point: position, ground height, heading to the next point. */
export interface QuayPoint {
  x: number;
  y: number;
  z: number;
  rotY: number;
}

/** The quay's centre line from the anchors (`marinaQuay0..K`, light end first). */
export function marinaQuayPoints(
  A: Record<string, { x: number; y?: number; z: number; rotY: number }>,
): QuayPoint[] {
  const out: QuayPoint[] = [];
  for (let k = 0; A[`marinaQuay${k}`]; k++) {
    const q = A[`marinaQuay${k}`];
    out.push({ x: q.x, y: q.y ?? 0, z: q.z, rotY: q.rotY });
  }
  return out;
}

/** A point `off` u from the centre line toward the water (the water lies at heading + 90°). */
const waterSide = (
  q: { x: number; z: number; rotY: number },
  off: number,
): { x: number; z: number } => ({
  x: q.x - Math.sin(q.rotY) * off,
  z: q.z + Math.cos(q.rotY) * off,
});

/**
 * The paved stretches of the quay: runs of points on the deck (their ground at the deck height) at
 * least `minLen` u long. The pier root's gap and its ramps lie lower and cut the quay; a stroller
 * turns back before them rather than walking the ramp.
 */
function deckRuns(quay: readonly QuayPoint[], minLen: number): QuayPoint[][] {
  const flat = MARINA_SITE.ring.deckY - 0.03;
  const out: QuayPoint[][] = [];
  for (let k = 0; k < quay.length;) {
    if (quay[k].y < flat) {
      k++;
      continue;
    }
    let e = k;
    while (e + 1 < quay.length && quay[e + 1].y >= flat) e++;
    const run = quay.slice(k, e + 1);
    let len = 0;
    for (let m = 1; m < run.length; m++)
      len += Math.hypot(run[m].x - run[m - 1].x, run[m].z - run[m - 1].z);
    if (len >= minLen) out.push(run);
    k = e + 1;
  }
  return out;
}

/** Lane polyline: the deck run's centre line moved to `offset` u from it toward the water. */
function laneOf(run: readonly QuayPoint[], offset: number): Lane {
  const n = run.length;
  const x = new Float32Array(n);
  const z = new Float32Array(n);
  const cum = new Float32Array(n);
  run.forEach((q, k) => {
    const p = waterSide(q, offset);
    x[k] = p.x;
    z[k] = p.z;
    if (k > 0) cum[k] = cum[k - 1] + Math.hypot(x[k] - x[k - 1], z[k] - z[k - 1]);
  });
  return { x, z, cum };
}

/** Arc length of the lane point nearest to (px, pz). */
function project(lane: Lane, px: number, pz: number): number {
  let best = Infinity;
  let bs = 0;
  for (let k = 0; k + 1 < lane.x.length; k++) {
    const ax = lane.x[k];
    const az = lane.z[k];
    const dx = lane.x[k + 1] - ax;
    const dz = lane.z[k + 1] - az;
    const l2 = dx * dx + dz * dz || 1;
    const t = Math.min(1, Math.max(0, ((px - ax) * dx + (pz - az) * dz) / l2));
    const d = Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
    if (d < best) {
      best = d;
      bs = lane.cum[k] + t * Math.sqrt(l2);
    }
  }
  return bs;
}

/** The pivot of local (lx, lz) of a fixture / anchor and the world heading of a local direction. */
const toWorld = (
  f: { x: number; z: number; rotY: number },
  lx: number,
  lz: number,
): { x: number; z: number } => lotLocalToWorld(f, lx, lz);

const localHeading = (rotY: number, dx: number, dz: number): number => {
  const fx = Math.cos(rotY);
  const fz = Math.sin(rotY);
  return heading(dx * fz + dz * fx, -dx * fx + dz * fz);
};

/** The marina town of `world` for an ambient scale (null: no marina in this world). */
export function planMarina(
  world: Pick<WorldData, 'islands' | 'fixtures' | 'seed'>,
  scale: number,
): MarinaPlan | null {
  const island = world.islands.findIndex((i) => i.anchors.marinaBasin && i.anchors.marinaQuay0);
  if (island < 0) return null;
  const A = world.islands[island].anchors;
  const C = A.marinaBasin;
  const seed = world.seed;
  const L = MARINA_LIFE;
  const counts = marinaCounts(scale);
  const bots: TableauBot[] = [];
  const hash = (i: number, salt: number): number => unitHash(seed ^ SALT, i, salt);
  const jit = (v: number, share: number, h: number): number => v * (1 + share * (2 * h - 1));
  const shiftOf = (list: readonly Shift[], rank: number, i: number): Shift => {
    const s = list[rank % list.length];
    const j = L.jitter;
    return [s[0] + j * (2 * hash(i, 31) - 1), s[1] + j * (2 * hash(i, 32) - 1)];
  };
  const base = { island, hd: 0, item: undefined, pose: 'stand' } as const;
  let group = 5000;

  // ---- strollers: one walk per paved run of the quay (the pier root's gap cuts the crescent)
  const half = (A.marinaQuaySize?.x ?? MARINA_SITE.ring.width) / 2;
  const a = L.stroll.endTrim;
  const stalls = (world.fixtures ?? []).filter(
    (f) => f.defId === 'quayFurnish' && (f.variant ?? 0) >= 3 && inMarina(world.islands[island], f),
  );
  interface Walk {
    lane: Lane;
    stops: Stop[];
    len: number;
  }
  const walks: Walk[] = [];
  deckRuns(marinaQuayPoints(A), L.stroll.minRun + 2 * a).forEach((run, r) => {
    const lane = laneOf(run, half - MARINA_SITE.walk);
    const b = lane.cum[lane.cum.length - 1] - a;
    const stops: Stop[] = [];
    const at = (s: number): { x: number; z: number } => {
      const p = { x: 0, z: 0 };
      laneAt(lane, s, p);
      return p;
    };
    /** Heading to the water at lane arc `s`: the lane's tangent turned +90 degrees. */
    const toWater = (s: number): number => {
      laneAt(lane, s, { x: 0, z: 0 });
      return Math.atan2(_tx, -_tz);
    };
    stalls.forEach((f, k) => {
      const sc = project(lane, f.x, f.z);
      const p = at(sc);
      // (a stall off this run, on the ramps or another run, is not this walk's)
      if (Math.hypot(p.x - f.x, p.z - f.z) > half) return;
      const side = hash(k, 41) < 0.5 ? -1 : 1;
      const s = Math.min(b - 1, Math.max(a + 1, sc + side * L.stroll.stallSide));
      stops.push({ s, face: toWater(s), w: 1, stall: true });
    });
    for (let s = a + L.stroll.lookEvery / 2; s < b - 1; s += L.stroll.lookEvery) {
      const q = Math.min(b - 1, s + (hash(Math.round(s * 10) + r * 1000, 42) - 0.5) * 3);
      if (stops.some((o) => Math.abs(o.s - q) < 3.5)) continue;
      stops.push({
        s: q,
        face: toWater(q) + L.stroll.lookYaw * (2 * hash(Math.round(q * 10) + r * 1000, 43) - 1),
        w: 1,
        stall: false,
      });
    }
    for (const s of [a, b]) stops.push({ s, face: toWater(s), w: 0.4, stall: false });
    stops.sort((p, q) => p.s - q.s);
    walks.push({ lane, stops, len: b - a });
  });
  const total = walks.reduce((m, w) => m + w.len, 0);
  const given = walks.map(() => 0);
  for (let i = 0; i < counts.strollers && walks.length > 0; i++) {
    // the walk with the most length per stroller already on it gets the next one (d'Hondt)
    let wi = 0;
    walks.forEach((w, k) => {
      if (w.len / (given[k] + 1) > walks[wi].len / (given[wi] + 1)) wi = k;
    });
    given[wi]++;
    const { lane, stops } = walks[wi];
    // each stroller visits its own subset of the stops (ends always), speed and pauses jittered
    const mine = stops.filter(
      (o, k) => k === 0 || k === stops.length - 1 || hash(i * 64 + k, 51) < (o.stall ? 0.8 : 0.6),
    );
    const speed = jit(L.stroll.speed, L.stroll.speedJitter, hash(i, 52));
    const seq: number[] = [];
    for (let k = 0; k < mine.length; k++) seq.push(k);
    for (let k = mine.length - 2; k >= 1; k--) seq.push(k);
    // start the bots at different stops of the cycle (mirrored runs go the other way first)
    const legs: Leg[] = [];
    let t = 0;
    for (let j = 0; j < seq.length; j++) {
      const from = mine[seq[j]];
      const to = mine[seq[(j + 1) % seq.length]];
      const walk = Math.abs(to.s - from.s) / speed;
      const pause =
        jit(
          L.stroll.pause[0] + (L.stroll.pause[1] - L.stroll.pause[0]) * hash(i * 64 + j, 53),
          L.stroll.pauseJitter,
          hash(i * 64 + j, 54),
        ) * to.w;
      legs.push({ t0: t, tw: t + walk, t1: t + walk + pause, s0: from.s, s1: to.s, face: to.face });
      t += walk + pause;
    }
    bots.push({
      ...base,
      kind: 'marinaStroll',
      x: 0,
      z: 0,
      y: Number.NaN,
      group: group++,
      k: 0,
      town: {
        shift: shiftOf(L.shifts.stroller, i, i),
        offset: hash(i, 55) * t,
        route: { ...lane, legs, cycle: t },
      },
    });
    // the first position, for placement before the first step
    const p0 = strollAt(bots[bots.length - 1].town!.route!, bots[bots.length - 1].town!.offset, {
      x: 0,
      z: 0,
      hd: 0,
      moving: false,
    });
    bots[bots.length - 1].x = p0.x;
    bots[bots.length - 1].z = p0.z;
    bots[bots.length - 1].hd = p0.hd;
  }

  // ---- diners: tables of the terraces in front of the restaurant / café / gelato houses
  interface Table {
    terrace: number;
    table: number;
    pri: number;
  }
  const tables: Table[] = [];
  const terraceVariant = (t: number): number => {
    for (let k = 0; A[`marinaHouseKind${k}`]; k++) {
      const kind = A[`marinaHouseKind${k}`];
      if (kind.z === t) return MARINA_SITE.house.restaurant[kind.x] ?? 0;
    }
    return 0;
  };
  for (let t = 0; A[`marinaTerrace${t}`]; t++) {
    const tv = MARINA_LOOK.terraces[terraceVariant(t)];
    tv.tables.forEach((_tb, j) => tables.push({ terrace: t, table: j, pri: hash(t * 16 + j, 61) }));
  }
  tables.sort((p, q) => p.pri - q.pri);
  let want = counts.diners;
  let rank = 0;
  const D = L.diner;
  for (const tb of tables) {
    if (want <= 0) break;
    const anchor = A[`marinaTerrace${tb.terrace}`];
    const spec = MARINA_LOOK.terraces[terraceVariant(tb.terrace)].tables[tb.table];
    const seats = spec.chairs.slice(0, Math.min(want, 2));
    const pair = seats.length > 1;
    const off = hash(tb.terrace * 16 + tb.table, 62) * D.beat.cycle;
    const sh = shiftOf(L.shifts.diner, rank, tb.terrace * 16 + tb.table);
    const grp = group++;
    seats.forEach((c, m) => {
      const ang = (c * Math.PI) / 2;
      const lx = spec.x + Math.sin(ang) * D.chairDist;
      const lz = spec.z + Math.cos(ang) * D.chairDist;
      const p = toWorld(anchor, lx, lz);
      want--;
      const steps = pair
        ? [
            { to: D.beat.chat, pose: D.beat.chatPose },
            { to: D.beat.cycle, pose: D.beat.eatPose },
          ]
        : [
            { to: D.beat.eat * 0.7, pose: D.beat.eatPose },
            { to: D.beat.eat, pose: D.beat.gazePose },
            { to: D.beat.cycle, pose: D.beat.eatPose },
          ];
      bots.push({
        ...base,
        kind: 'marinaDiner',
        x: p.x,
        z: p.z,
        // seat top = chair height over the deck; the bot's body bottom rests on it
        y: (anchor.y ?? 0) + MARINA_LOOK.terrace.chairH - D.hip,
        hd: localHeading(anchor.rotY, -Math.sin(ang), -Math.cos(ang)),
        pose: pair ? D.beat.chatPose : D.beat.eatPose,
        beats: { cycle: D.beat.cycle, steps },
        group: grp,
        k: m,
        town: { shift: sh, offset: off + m * 0.4 },
      });
    });
    rank++;
  }

  // ---- vendors beside the stalls
  const V = L.vendor;
  stalls.slice(0, counts.vendors).forEach((f, k) => {
    const side = hash(k, 41) < 0.5 ? 1 : -1;
    const p = toWorld(f, side * V.x, V.z);
    const wv = V.beat.wave;
    bots.push({
      ...base,
      kind: 'marinaVendor',
      x: p.x,
      z: p.z,
      y: Number.NaN,
      hd: f.rotY,
      beats: {
        cycle: V.beat.cycle,
        steps: [
          { to: wv[0], pose: 'stand' },
          { to: wv[1], pose: V.beat.wavePose },
          { to: V.beat.cycle, pose: 'stand', yaw: -side * V.beat.turnYaw },
        ],
      },
      group: group++,
      k: 0,
      town: { shift: shiftOf(L.shifts.vendor, k, 700 + k), offset: hash(k, 63) * V.beat.cycle },
    });
  });

  const strollers = bots.filter((o) => o.kind === 'marinaStroll').length;
  const diners = bots.filter((o) => o.kind === 'marinaDiner').length;
  return {
    island,
    centre: { x: C.x, z: C.z },
    laneLength: total,
    bots,
    strollers,
    diners,
    vendors: bots.length - strollers - diners,
  };
}

/** Perches for the gulls: the tower's crenellation and the quay's edge row (world xyz). */
export function marinaPerches(
  world: Pick<WorldData, 'islands'>,
): { x: number; y: number; z: number }[] {
  const out: { x: number; y: number; z: number }[] = [];
  for (const isl of world.islands) {
    const A = isl.anchors;
    if (!A.marinaBasin || !A.marinaQuay0) continue;
    const G = MARINA_LIFE.gull;
    const half = (A.marinaQuaySize?.x ?? MARINA_SITE.ring.width) / 2;
    const T = A.marinaTower;
    if (T) out.push({ x: T.x, y: (T.y ?? 0) + G.towerTop, z: T.z });
    for (let k = G.edgeEvery; A[`marinaQuay${k}`]; k += G.edgeEvery) {
      const q = A[`marinaQuay${k}`];
      const p = waterSide(q, half - G.edge);
      out.push({ x: p.x, y: (q.y ?? 0) + G.y, z: p.z });
    }
  }
  return out;
}
