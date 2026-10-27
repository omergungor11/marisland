import { hashInts } from '../core/hash.ts';
import { CULTURE_CLOCK } from '../content/cultures/rhythm.ts';
import {
  CUSTOMS_MOTION as M,
  CUSTOMS_PORT as C,
  QA_CUSTOMS as K,
} from '../content/themes/qa-customs.ts';
import { pathAt, type PathPoint, type PortLayout } from '../world/gen/customs-port.ts';

/**
 * Customs Port motion (M30 TASK-508, D-087): the QA cargo ship's visit, the quay crane's unloading, the
 * inspection line's verdicts and the rejected crates' lob onto the quarantine pontoon, as a pure
 * closed-form function of the culture-clock day seconds (so a capture, `?freeze=1&time=..&simt=..`,
 * replays it) and the reduced-motion scale. The result is a flat list of draw items in the CRANE FRAME
 * (x along the quay, z seaward, y relative to the crane's base); render/culture-movers.ts writes them
 * as culture-mover parts. Visits start at noon and repeat every `period` s between `openHour` and
 * `closeHour`; the rejected crates of a visit stay on the pontoon until the next visit's early seconds.
 */

const SPH = CULTURE_CLOCK.secondsPerHour;
const TAU = Math.PI * 2;
const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (x: number): number => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};
const smoother = (x: number): number => {
  const t = clamp01(x);
  return t * t * t * (t * (t * 6 - 15) + 10);
};
const easeOutBack = (x: number): number => {
  const t = clamp01(x) - 1;
  return 1 + 2.70158 * t * t * t + 1.70158 * t * t;
};
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Draw item kinds (the scene maps them to culture-mover parts). */
export const ITEM = {
  ship: 0,
  cargo: 1,
  trolley: 2,
  spreader: 3,
  cable: 4,
  glow: 5,
  ring: 6,
  blob: 7,
} as const;
export type ItemKind = (typeof ITEM)[keyof typeof ITEM];

export interface Item {
  kind: ItemKind;
  x: number;
  y: number;
  z: number;
  /** Yaw about the up axis (three: local +z points along (sin yaw, cos yaw)). */
  yaw: number;
  sx: number;
  sy: number;
  sz: number;
  hex: string;
  /** Cable: the other end. */
  x1: number;
  y1: number;
  z1: number;
}

export const MAX_ITEMS = 48;

export interface CustomsFrame {
  n: number;
  items: Item[];
  /** 0..1: how much of the ship's length is under the arch (the marquee / scan strength). */
  underArch: number;
  /** Visit index, seconds into it, whether it is an open visit (debug / tests). */
  visit: number;
  t: number;
  active: boolean;
}

export function newCustomsFrame(): CustomsFrame {
  const items: Item[] = [];
  for (let i = 0; i < MAX_ITEMS; i++)
    items.push({
      kind: 0,
      x: 0,
      y: 0,
      z: 0,
      yaw: 0,
      sx: 1,
      sy: 1,
      sz: 1,
      hex: '',
      x1: 0,
      y1: 0,
      z1: 0,
    });
  return { n: 0, items, underArch: 0, visit: 0, t: 0, active: false };
}

/* ----------------------------------- schedule ----------------------------------- */

const NOON = M.noon * SPH;
const OPEN = M.openHour * SPH;
const CLOSE = M.closeHour * SPH;

/** Start (day seconds) of visit `k`. */
export const visitStart = (k: number): number => NOON + k * M.period;
/** Visits run whole between the opening and closing hours. */
export const visitOpen = (k: number): boolean =>
  visitStart(k) >= OPEN && visitStart(k) + M.period <= CLOSE;

/** Verdicts of visit `k` (1 = rejected), one per crane job. */
export function verdicts(k: number): readonly number[] {
  return M.patterns[hashInts(k, 508, 1) % M.patterns.length];
}

/** Ship slots (container base centres in the ship frame), in the builder's order. */
export interface Slot {
  id: number;
  x: number;
  y: number;
  z: number;
  color: string;
}
export const SHIP_SLOTS: readonly Slot[] = (() => {
  const S = K.ship;
  const out: Slot[] = [];
  let n = 0;
  S.bayZ.forEach((z, bay) => {
    S.colX.forEach((x) => {
      const tiers = (S.upperBays as readonly number[]).includes(bay) ? 2 : 1;
      for (let tier = 0; tier < tiers; tier++) {
        out.push({
          id: n,
          x,
          y: S.deck + 0.08 + tier * (K.container.h + 0.04),
          z,
          color: K.container.colors[(n * 2 + tier) % K.container.colors.length],
        });
        n++;
      }
    });
  });
  return out;
})();

/* -------------------------------- derived geometry -------------------------------- */

const J = M.jobs.steps;
/** Seconds of one crane job. */
export const JOB_SECONDS = J.out + J.down + J.latch + J.up + J.back + J.set;
const LATCH_AT = J.out + J.down + J.latch;
/** The spreader frame top sits this far above the base of the container it carries (1.5 + the hook gap 0.24). */
const HANG = K.container.h + 0.24;
const G = K.crane;

export interface PortGeometry {
  /** Water level in the crane frame (y). */
  waterY: number;
}

/** Frame position the line lamps glow at (crane frame, y relative to the base): check / cross lens. */
export const LAMP = {
  x: C.okLine.x + 6.5,
  z: C.okLine.z + 2.02,
  okY: 2.5,
  badY: 1.45,
} as const;

/** Where rejected crate `i` rests on the landing pontoon (crane frame, base height above the water). */
export function landingSpot(
  lay: PortLayout,
  i: number,
): { x: number; z: number; up: number; yaw: number } {
  const p = lay.pontoons[0];
  const L = C.landing;
  const c = Math.cos(p.turn);
  const s = Math.sin(p.turn);
  return {
    x: p.x + L.x * c + L.z * s,
    z: p.z - L.x * s + L.z * c,
    up: K.pontoon.deck + i * L.stackH * 0.93,
    yaw: p.turn,
  };
}

/* ------------------------------------ the frame ------------------------------------ */

/** Seconds into a visit when the ship has sailed out of sight. */
const shipEnd = (): number => M.depart.t + M.depart.slide + M.depart.spin + M.depart.leave;

const _pt: PathPoint = { x: 0, z: 0, hx: 0, hz: 0 };

interface Ship {
  visible: boolean;
  x: number;
  z: number;
  yaw: number;
  scale: number;
  /** Distance along the lane (arrival / departure), or -1 while docked / turning. */
  d: number;
  /** Seconds the ship has been alongside the quay (docked), for the bob phase. */
  y: number;
}

const _ship: Ship = { visible: false, x: 0, z: 0, yaw: 0, scale: 1, d: -1, y: 0 };

/** Ship pose at `t` seconds into a visit. */
function shipAt(t: number, lay: PortLayout, motion: number, out: Ship): Ship {
  const A = M.arrive;
  const D = M.depart;
  const path = lay.path;
  const L = path.length;
  const sl = path.s;
  const dockYaw = Math.atan2(-sl, 0);
  const tSlideOut = D.t;
  const tSpin = tSlideOut + D.slide;
  const tLeave = tSpin + D.spin;
  const tEnd = tLeave + D.leave;
  out.visible = t >= 0 && t < tEnd;
  out.scale = 1;
  out.d = -1;
  if (!out.visible) return out;
  if (t < A.dur) {
    // along the lane, ease in at the spawn and out at the spot; head into the harbour
    const v = L / (A.dur - 0.5 * (A.easeIn + A.easeOut));
    let p: number;
    if (t < A.easeIn) p = (v * t * t) / (2 * A.easeIn);
    else if (t < A.dur - A.easeOut) p = (v * A.easeIn) / 2 + v * (t - A.easeIn);
    else p = L - (v * (A.dur - t) * (A.dur - t)) / (2 * A.easeOut);
    out.d = L - p;
    pathAt(path, out.d, _pt);
    out.x = _pt.x;
    out.z = _pt.z;
    out.yaw = Math.atan2(-_pt.hx, -_pt.hz);
    out.scale = easeOutBack(t / M.pop);
  } else if (t < tSlideOut) {
    const q = smooth((t - M.slideIn.t) / M.slideIn.dur);
    out.x = lay.spot.x;
    out.z = lerp(lay.spot.z, lay.berth.z, q);
    // a little sway as the tugs nudge it in
    out.yaw = dockYaw + 0.06 * motion * Math.sin(q * Math.PI);
  } else if (t < tSpin) {
    const q = smooth((t - tSlideOut) / D.slide);
    out.x = lay.spot.x;
    out.z = lerp(lay.berth.z, lay.spot.z, q);
    out.yaw = dockYaw - 0.06 * motion * Math.sin(q * Math.PI);
  } else if (t < tLeave) {
    const psi = Math.PI * smoother((t - tSpin) / D.spin);
    out.x = lay.spot.x;
    out.z = lay.spot.z;
    out.yaw = Math.atan2(-sl * Math.cos(psi), Math.sin(psi));
  } else {
    const u = t - tLeave;
    const v = L / (D.leave - 0.5 * D.easeIn);
    const p = u < D.easeIn ? (v * u * u) / (2 * D.easeIn) : (v * D.easeIn) / 2 + v * (u - D.easeIn);
    out.d = Math.min(L, p);
    pathAt(path, out.d, _pt);
    out.x = _pt.x;
    out.z = _pt.z;
    out.yaw = Math.atan2(_pt.hx, _pt.hz);
    out.scale = 1 - smooth((u - (D.leave - M.pop)) / M.pop);
  }
  return out;
}

const _f = { n: 0 };

function put(
  fr: CustomsFrame,
  kind: ItemKind,
  x: number,
  y: number,
  z: number,
  yaw: number,
  sx: number,
  sy: number,
  sz: number,
  hex = '',
): Item | null {
  if (_f.n >= MAX_ITEMS) return null;
  const it = fr.items[_f.n++];
  it.kind = kind;
  it.x = x;
  it.y = y;
  it.z = z;
  it.yaw = yaw;
  it.sx = sx;
  it.sy = sy;
  it.sz = sz;
  it.hex = hex;
  it.x1 = 0;
  it.y1 = 0;
  it.z1 = 0;
  return it;
}

/** Concentric ripples on the water at (x, z): `age` s since they started. */
function ripples(fr: CustomsFrame, x: number, y: number, z: number, age: number, k = 1): void {
  const R = M.ripple;
  if (age < 0 || age > R.life + 0.4) return;
  for (let i = 0; i < R.rings; i++) {
    const ph = (age - i * 0.28) / R.life;
    if (ph < 0 || ph > 1) continue;
    const r = (R.r0 + (R.r1 - R.r0) * ph) * k;
    put(fr, ITEM.ring, x, y, z, 0, r, r * Math.max(0.15, 1 - ph), r, R.color);
  }
}

/** Crane rig state: trolley z, spreader frame-top y, the job carrying a container (or -1). */
interface Rig {
  z: number;
  y: number;
  carry: number;
}
const _rig: Rig = { z: G.trolleyHome, y: G.spreaderHome, carry: -1 };

/** Frame-top y that sets a container on the belt / picks ship slot `slotId` (crane frame). */
const BELT_Y = C.beltTop + HANG;

function rigAt(t: number, lay: PortLayout, wy: number, out: Rig): Rig {
  const JB = M.jobs;
  const n = JB.slots.length;
  const homeZ = G.trolleyHome;
  const homeY = G.spreaderHome;
  out.carry = -1;
  const t0 = JB.start;
  const tEnd = t0 + n * JOB_SECONDS;
  if (t < t0) {
    out.z = homeZ;
    out.y = homeY;
    return out;
  }
  if (t >= tEnd) {
    const q = smooth((t - tEnd) / JB.home);
    out.z = lerp(C.dropZ, homeZ, q);
    out.y = lerp(BELT_Y, homeY, q);
    return out;
  }
  const j = Math.min(n - 1, Math.floor((t - t0) / JOB_SECONDS));
  const u = t - t0 - j * JOB_SECONDS;
  const slot = SHIP_SLOTS[JB.slots[j]];
  const sx = lay.path.s;
  // the docked ship: slot z in the crane frame (ship local x maps to +z by the lane side)
  const slotZ = lay.berth.z + sx * slot.x;
  const grabY = slot.y + wy + HANG;
  const zPrev = j === 0 ? homeZ : C.dropZ;
  const yPrev = j === 0 ? homeY : BELT_Y;
  const up = G.spreaderUp;
  if (u < J.out) {
    // lift the empty spreader first, then run the trolley out
    out.y = lerp(yPrev, up, smooth(u / (J.out * 0.45)));
    out.z = lerp(zPrev, slotZ, smooth((u - J.out * 0.2) / (J.out * 0.8)));
    return out;
  }
  let a = J.out;
  if (u < a + J.down) {
    out.z = slotZ;
    out.y = lerp(up, grabY, smooth((u - a) / J.down));
    return out;
  }
  a += J.down;
  if (u < a + J.latch) {
    out.z = slotZ;
    out.y = grabY;
    return out;
  }
  a += J.latch;
  out.carry = j;
  if (u < a + J.up) {
    out.z = slotZ;
    out.y = lerp(grabY, up, smooth((u - a) / J.up));
    return out;
  }
  a += J.up;
  if (u < a + J.back) {
    out.z = lerp(slotZ, C.dropZ, smooth((u - a) / J.back));
    out.y = up;
    return out;
  }
  a += J.back;
  out.z = C.dropZ;
  out.y = lerp(up, BELT_Y, smooth((u - a) / J.set));
  if (u >= a + J.set) out.carry = -1;
  return out;
}

/** Seconds into the visit when job `j`'s container is set down on the belt. */
const dropTime = (j: number): number => M.jobs.start + (j + 1) * JOB_SECONDS;
const RIDE = M.belt.dwell;
/** End of the ride (container centre x on the line) and seconds of the ride. */
const END_X = C.okLine.x + 3.7;
const RIDE_SECONDS = (END_X - 0) / M.belt.speed;
/** Seconds into the visit when job `j`'s container reaches the end of the line. */
const arriveTime = (j: number): number => dropTime(j) + RIDE + RIDE_SECONDS;
const OK_HOLD = 0.5;
const OK_OUT = 1.1;

/**
 * Write the port's draw items for culture-clock day seconds `day`. `waterY` is the sea level in the
 * crane frame (-base height), `motion` the reduced-motion scale (1 normal … 0.3).
 */
export function customsFrame(
  day: number,
  motion: number,
  lay: PortLayout,
  waterY: number,
  out: CustomsFrame,
): CustomsFrame {
  _f.n = 0;
  const k = Math.floor((day - NOON) / M.period);
  const t = day - visitStart(k);
  const open = visitOpen(k);
  out.visit = k;
  out.t = t;
  out.active = open;
  out.underArch = 0;
  const wy = waterY;
  const sl = lay.path.s;
  const dockYaw = Math.atan2(-sl, 0);
  const tr = motion; // reduced motion scales the lob, the sway, the bob
  const rig = rigAt(open ? t : 0, lay, wy, _rig);
  const vd = verdicts(k);
  const slotsJob = M.jobs.slots;

  // ---------------------------------- the ship ----------------------------------
  const sh = open ? shipAt(t, lay, tr, _ship) : null;
  if (sh?.visible) {
    const bob = M.bob;
    const by = wy + bob.y * tr * Math.sin((TAU * t) / bob.period);
    const sc = sh.scale;
    put(out, ITEM.ship, sh.x, by, sh.z, sh.yaw, sc, sc, sc);
    const cs = Math.cos(sh.yaw);
    const sn = Math.sin(sh.yaw);
    for (const slot of SHIP_SLOTS) {
      const jIdx = (slotsJob as readonly number[]).indexOf(slot.id);
      // unloaded slots leave the deck when their job latches on
      if (jIdx >= 0 && t >= M.jobs.start + jIdx * JOB_SECONDS + LATCH_AT) continue;
      const lx = slot.x * sc;
      const lz = slot.z * sc;
      put(
        out,
        ITEM.cargo,
        sh.x + lx * cs + lz * sn,
        by + slot.y * sc,
        sh.z - lx * sn + lz * cs,
        sh.yaw + Math.PI / 2,
        sc,
        sc,
        sc,
        slot.color,
      );
    }
    // the arch: the hull's share under it (the marquee strip / scan lens glow while it passes)
    if (sh.d >= 0) {
      const dd = Math.abs(sh.d - lay.path.archD);
      out.underArch = 1 - smooth((dd - 2) / 9);
    }
  }
  if (open) {
    // spawn / despawn ripples at the lane's far end, the splash as the ship settles at the quay
    const e = lay.path;
    const ex = e.t1x + e.ux * e.run;
    const ez = e.t1z + e.uz * e.run;
    ripples(out, ex, wy + 0.06, ez, t, 1);
    ripples(out, ex, wy + 0.06, ez, t - (shipEnd() - M.pop), 1);
    ripples(out, lay.berth.x, wy + 0.06, lay.berth.z, t - (M.slideIn.t + M.slideIn.dur), 0.8);
  }

  // ---------------------------------- the crane ----------------------------------
  put(out, ITEM.trolley, 0, G.top + 0.7, rig.z, 0, 1, 1, 1);
  put(out, ITEM.spreader, 0, rig.y, rig.z, 0, 1, 1, 1);
  for (const dx of [-0.5, 0.5]) {
    const c = put(out, ITEM.cable, dx, rig.y, rig.z, 0, 1, 1, 1, K.crane.cable);
    if (c) {
      c.x1 = dx;
      c.y1 = G.top;
      c.z1 = rig.z;
    }
  }
  if (open && rig.carry >= 0) {
    const slot = SHIP_SLOTS[slotsJob[rig.carry]];
    put(out, ITEM.cargo, 0, rig.y - HANG, rig.z, dockYaw + Math.PI / 2, 1, 1, 1, slot.color);
  }

  // ----------------------- the line, the verdicts, the pontoon -----------------------
  if (open) {
    for (let j = 0; j < slotsJob.length; j++) {
      const slot = SHIP_SLOTS[slotsJob[j]];
      const td = dropTime(j);
      if (t < td - 1e-6) continue;
      const bad = vd[j] === 1;
      const ta = arriveTime(j);
      const yaw = dockYaw + Math.PI / 2;
      const baseY = C.beltTop;
      if (t < td + RIDE) {
        put(out, ITEM.cargo, 0, baseY, C.dropZ, yaw, 1, 1, 1, slot.color);
      } else if (t < ta) {
        const x = Math.min(END_X, (t - td - RIDE) * M.belt.speed);
        put(out, ITEM.cargo, x, baseY, C.dropZ, yaw, 1, 1, 1, slot.color);
        // the mini portal scans it in passing
        const px = C.okLine.x + K.line.portalX;
        const f = 1 - Math.min(1, Math.abs(x - px) / 1.3);
        if (f > 0.02) {
          const r = 0.35 + 0.35 * f;
          put(out, ITEM.glow, px, 3.25, C.dropZ, 0, r, r, r, bad ? M.badColor : M.scanColor);
        }
      } else if (!bad) {
        // checked: the lamp lights, the crate rolls on and is filed behind the stack
        const u = t - ta;
        const slide = smooth((u - OK_HOLD) / OK_OUT);
        const sc = 1 - smooth((u - OK_HOLD - OK_OUT * 0.55) / (OK_OUT * 0.45));
        if (sc > 0.01)
          put(out, ITEM.cargo, END_X + 3.4 * slide, baseY, C.dropZ, yaw, sc, sc, sc, slot.color);
        lamp(out, u, false);
      } else {
        const u = t - ta;
        const L = landingSpot(lay, rejectsBefore(vd, j));
        const t0 = 0.45; // hold at the end of the line while the cross lamp lights
        const f = clamp01((u - t0) / M.toss.dur);
        lamp(out, u, true);
        if (f <= 0) {
          put(out, ITEM.cargo, END_X, baseY, C.dropZ, yaw, 1, 1, 1, slot.color);
        } else if (f < 1) {
          const arc = (0.5 + 0.5 * tr) * M.toss.apex;
          const e = smooth(f);
          const x = lerp(END_X, L.x, e);
          const z = lerp(C.dropZ, L.z, e);
          const y = lerp(baseY, wy + L.up, e) + arc * 4 * f * (1 - f);
          const sc = lerp(1, M.toss.scale, smooth(f * 1.4));
          put(out, ITEM.cargo, x, y, z, yaw + f * TAU * M.toss.turns, sc, sc, sc, slot.color);
        } else {
          const since = u - t0 - M.toss.dur;
          // the landing: a squash, a splash ring
          const sq = since < 0.4 ? 0.22 * Math.exp(-since * 9) * Math.cos(since * 22) * tr : 0;
          const sc = M.toss.scale;
          put(
            out,
            ITEM.cargo,
            L.x,
            wy + L.up,
            L.z,
            L.yaw,
            sc * (1 + sq),
            sc * (1 - sq),
            sc * (1 + sq),
            slot.color,
          );
          if (since < M.ripple.life) ripples(out, L.x, wy + 0.06, L.z, since, 0.6);
        }
      }
    }
  }

  // --------------------- the previous visit's crates on the pontoon ---------------------
  const kp = k - 1;
  if (visitOpen(kp) && t < M.clear.t + M.clear.dur) {
    const vp = verdicts(kp);
    vp.forEach((bad, j) => {
      if (bad !== 1) return;
      const L = landingSpot(lay, rejectsBefore(vp, j));
      const u = clamp01((t - M.clear.t) / M.clear.dur);
      const sink = smooth(u);
      const sc = M.toss.scale * (1 - 0.5 * sink);
      if (u >= 1) return;
      put(
        out,
        ITEM.cargo,
        L.x,
        wy + L.up - 1.1 * sink,
        L.z,
        L.yaw,
        sc,
        sc,
        sc,
        SHIP_SLOTS[slotsJob[j]].color,
      );
      if (u > 0.05 && u < 0.7) ripples(out, L.x, wy + 0.06, L.z, (u - 0.05) * M.clear.dur, 0.5);
    });
  }

  // ------------------------------ the arch ------------------------------
  if (out.underArch > 0.02) {
    const a = lay.arch;
    const e = out.underArch;
    put(
      out,
      ITEM.glow,
      a.x,
      wy + 7.06,
      a.z,
      a.turn,
      4.1 * e,
      0.07 + 0.05 * e,
      0.25 + 0.12 * e,
      M.scanColor,
    );
    put(out, ITEM.glow, a.x, wy + 10.65, a.z, 0, 0.5 * e, 0.5 * e, 0.5 * e, M.scanColor);
  }
  out.n = _f.n;
  return out;
}

/** Rejected crates before job `j` (the pontoon stack index of job `j`'s crate). */
const rejectsBefore = (vd: readonly number[], j: number): number => {
  let n = 0;
  for (let i = 0; i < j; i++) n += vd[i];
  return n;
};

/** Line lamps: ✓ (green glow) or ✗ (the check lens dimmed, the cross lens lit) `u` s after the arrival. */
function lamp(fr: CustomsFrame, u: number, bad: boolean): void {
  const env = smooth(u / 0.12) * (1 - smooth((u - (M.belt.pulse - 0.5)) / 0.5));
  if (env < 0.02) return;
  if (bad) {
    put(fr, ITEM.blob, LAMP.x, LAMP.okY, LAMP.z + 0.04, 0, 0.3, 0.3, 0.3, '#2E6E57');
    const r = 0.3 + 0.12 * env;
    put(fr, ITEM.glow, LAMP.x, LAMP.badY, LAMP.z + 0.1, 0, r, r, r, M.badColor);
  } else {
    const r = 0.3 + 0.12 * env;
    put(fr, ITEM.glow, LAMP.x, LAMP.okY, LAMP.z + 0.1, 0, r, r, r, M.scanColor);
  }
}
