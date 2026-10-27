import { describe, expect, it } from 'vitest';
import { CULTURE_CLOCK } from '../content/cultures/rhythm.ts';
import { CUSTOMS_MOTION as M } from '../content/themes/qa-customs.ts';
import { portLayout, pathAt } from '../world/gen/customs-port.ts';
import {
  ITEM,
  JOB_SECONDS,
  MAX_ITEMS,
  customsFrame,
  newCustomsFrame,
  verdicts,
  visitOpen,
  visitStart,
} from './qa-customs-motion.ts';

const SPH = CULTURE_CLOCK.secondsPerHour;
const NOON = M.noon * SPH;
const lay = portLayout({ sl: 1, lane: 0 });
const WY = -1.5;
const fr = newCustomsFrame();
const at = (t: number, motion = 1, k = 0): typeof fr =>
  customsFrame(NOON + k * M.period + t, motion, lay, WY, fr);
const of = (kind: number) => fr.items.slice(0, fr.n).filter((i) => i.kind === kind);

describe('customs port schedule (TASK-508)', () => {
  it('visits start at noon every period, between the opening and closing hours only', () => {
    expect(visitStart(0)).toBe(NOON);
    expect(visitOpen(0)).toBe(true);
    expect(visitOpen(-2)).toBe(true);
    expect(visitOpen(-3)).toBe(false);
    expect(visitOpen(4)).toBe(true);
    expect(visitOpen(5)).toBe(false);
    // the visit fits its period
    expect(M.depart.t + M.depart.slide + M.depart.spin + M.depart.leave).toBeLessThan(M.period);
    expect(M.jobs.start + M.jobs.slots.length * JOB_SECONDS + M.jobs.home).toBeLessThan(
      M.depart.t + M.depart.slide + M.depart.spin,
    );
  });

  it('every visit has at least one accepted and one rejected crate', () => {
    for (let k = -3; k < 30; k++) {
      const v = verdicts(k);
      expect(v.length).toBe(M.jobs.slots.length);
      expect(v.includes(1)).toBe(true);
      expect(v.includes(0)).toBe(true);
    }
  });

  it('is a pure function of the day seconds (a capture replays it)', () => {
    const a = JSON.stringify(at(14.6).items.slice(0, fr.n));
    at(3);
    at(30);
    expect(JSON.stringify(at(14.6).items.slice(0, fr.n))).toBe(a);
  });

  it('closed hours: no ship, the crane rests at home', () => {
    customsFrame(2 * SPH, 1, lay, WY, fr);
    expect(of(ITEM.ship).length).toBe(0);
    expect(fr.active).toBe(false);
  });
});

describe('customs ship visit (TASK-508)', () => {
  it('pops in at the lane end, passes under the arch, docks, leaves under the arch and is gone', () => {
    at(0);
    expect(of(ITEM.ship)[0].sx).toBeLessThan(0.05);
    let arch = 0;
    let archAt = 0;
    for (let t = 0; t < M.period; t += 0.1) {
      at(t);
      if (fr.underArch > arch) {
        arch = fr.underArch;
        archAt = t;
      }
    }
    expect(arch).toBeGreaterThan(0.95);
    expect(archAt).toBeLessThan(M.arrive.dur);
    // under the arch at 3 s (the Customs Noon preset)
    at(3);
    expect(fr.underArch).toBeGreaterThan(0.9);
    // docked: centre on the berth, hull parallel to the quay
    at(M.slideIn.t + M.slideIn.dur + 1);
    const s = of(ITEM.ship)[0];
    expect(s.x).toBeCloseTo(lay.berth.x, 3);
    expect(s.z).toBeCloseTo(lay.berth.z, 3);
    // leaving passes the arch again, then it is gone before the next visit
    let second = 0;
    for (let t = M.depart.t + M.depart.slide + M.depart.spin; t < M.period; t += 0.1) {
      at(t);
      second = Math.max(second, fr.underArch);
    }
    expect(second).toBeGreaterThan(0.9);
    at(M.period - 0.2);
    expect(of(ITEM.ship).length).toBe(0);
  });

  it('moves continuously: no jump bigger than the top speed over a frame', () => {
    let px = NaN;
    let pz = NaN;
    let py = NaN;
    for (let t = 0.05; t < M.period - 1.4; t += 1 / 30) {
      at(t);
      const s = of(ITEM.ship)[0];
      if (!s) continue;
      if (!Number.isNaN(px)) {
        expect(Math.hypot(s.x - px, s.z - pz), `t ${t}`).toBeLessThan(0.3);
        let dy = Math.abs(s.yaw - py);
        if (dy > Math.PI) dy = 2 * Math.PI - dy;
        expect(dy, `yaw t ${t}`).toBeLessThan(0.2);
      }
      px = s.x;
      pz = s.z;
      py = s.yaw;
    }
  });

  it('keeps the hull off the quay all along (spin included)', () => {
    for (let t = 0; t < M.period; t += 0.1) {
      at(t);
      const s = of(ITEM.ship)[0];
      if (!s || s.sx < 0.99) continue;
      // bow and stern points of the 17 u hull, 2.3 u half beam
      for (const l of [-8.5, 8.5])
        for (const w of [-2.3, 2.3]) {
          const z = s.z - w * Math.sin(s.yaw) + l * Math.cos(s.yaw);
          expect(z, `t ${t}`).toBeGreaterThan(3.4 + 0.05);
        }
    }
  });
});

describe('customs crane and line (TASK-508)', () => {
  it('unloads three containers: each is picked from a ship slot and set on the line', () => {
    const carried = new Set<number>();
    let maxCargo = 0;
    for (let t = 0; t < M.period; t += 0.05) {
      at(t);
      const rig = of(ITEM.spreader)[0];
      const tro = of(ITEM.trolley)[0];
      expect(tro.z).toBe(rig.z);
      const hanging = of(ITEM.cargo).filter(
        (c) =>
          Math.abs(c.x) < 0.01 && Math.abs(c.z - rig.z) < 0.01 && c.y > rig.y - 2.5 && c.y < rig.y,
      );
      if (hanging.length) carried.add(Math.round(t / JOB_SECONDS));
      maxCargo = Math.max(maxCargo, of(ITEM.cargo).length);
    }
    expect(carried.size).toBeGreaterThanOrEqual(3);
    expect(maxCargo).toBeLessThanOrEqual(MAX_ITEMS);
    // every slot leaves its place on the deck once: the ship carries 8 - 3 away
    at(M.depart.t - 0.5);
    expect(of(ITEM.cargo).filter((c) => Math.abs(c.y - WY) < 6).length).toBeGreaterThanOrEqual(5);
  });

  it('rejected crates end on the landing pontoon and sink in the next visit', () => {
    const bad = verdicts(0).filter((v) => v === 1).length;
    const landing = lay.pontoons[0];
    const onPontoon = (): number =>
      of(ITEM.cargo).filter((c) => Math.hypot(c.x - landing.x, c.z - landing.z) < 3 && c.sx < 0.5)
        .length;
    at(M.period - 0.1);
    expect(onPontoon()).toBe(bad);
    // still there at the start of the next visit, then gone
    at(1, 1, 1);
    expect(onPontoon()).toBe(bad);
    at(M.clear.t + M.clear.dur + 0.1, 1, 1);
    expect(onPontoon()).toBe(0);
  });

  it('the lob is calmer under reduced motion', () => {
    const peak = (m: number): number => {
      let top = -Infinity;
      for (let t = 0; t < M.period; t += 0.02) {
        at(t, m);
        for (const c of of(ITEM.cargo)) if (c.sx < 0.9 && c.sx > 0.45) top = Math.max(top, c.y);
      }
      return top;
    };
    expect(peak(0.3)).toBeLessThan(peak(1));
  });

  it('lamps and the scan glow only while a crate is at the end of the line / in the portal', () => {
    let lamps = 0;
    for (let t = 0; t < M.period; t += 0.05) {
      at(t);
      lamps = Math.max(lamps, of(ITEM.glow).length);
    }
    expect(lamps).toBeGreaterThan(0);
    at(8);
    expect(of(ITEM.glow).length).toBe(0);
  });

  it('the lane path is continuous from the spin spot out', () => {
    const o = { x: 0, z: 0, hx: 0, hz: 0 };
    pathAt(lay.path, 0, o);
    expect(o.x).toBeCloseTo(lay.spot.x, 6);
    expect(o.z).toBeCloseTo(lay.spot.z, 6);
    let px = o.x;
    let pz = o.z;
    for (let d = 0.5; d <= lay.path.length; d += 0.5) {
      pathAt(lay.path, d, o);
      expect(Math.hypot(o.x - px, o.z - pz)).toBeLessThan(0.55);
      px = o.x;
      pz = o.z;
    }
  });
});
