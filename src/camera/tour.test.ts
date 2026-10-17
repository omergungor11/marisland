import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  blendPose,
  createTour,
  hoursForward,
  resolveKeys,
  stopPose,
  tourAt,
  tourPeriod,
  type FitContext,
  type TourKey,
} from './tour.ts';
import { pitchBand, type CameraWorld } from './poses.ts';
import { azimuthToward, type Pose } from './framing.ts';
import { TOUR } from '../content/tour.ts';
import { FRAMING } from '../content/camera.ts';
import { Clock } from '../core/clock.ts';
import { Emitter, type AppEvents } from '../core/events.ts';
import type { CameraSystem } from './controls.ts';

const pose = (tx: number, dist: number, pitch: number, az: number): Pose => ({
  tx,
  ty: 0,
  tz: 0,
  dist,
  pitch,
  az,
});
const keys: TourKey[] = [
  { pose: pose(0, 400, 58, 25), hour: 15, fly: 4, hold: 8 },
  { pose: pose(100, 60, 20, -170), hour: 22, fly: 4, hold: 8 },
  { pose: pose(-50, 45, 14, 170), hour: 9, fly: 4, hold: 8 },
];
const start = { pose: pose(10, 500, 13, -10), hour: 3 };

describe('tour timeline', () => {
  it('is a pure function of t: start, stop poses and holds', () => {
    expect(tourPeriod(keys)).toBe(36);
    const a = tourAt(0, keys, start);
    expect(a.pose).toEqual(start.pose);
    expect(a.hour).toBe(3);
    expect(a.phase).toBe('fly');
    const b = tourAt(4, keys, start);
    expect(b.pose).toEqual(keys[0].pose);
    expect(b.hour).toBe(15);
    expect(b.phase).toBe('hold');
    expect(b.index).toBe(0);
    // the hold is flat
    expect(tourAt(9, keys, start).pose).toEqual(keys[0].pose);
    expect(tourAt(11.99, keys, start).hour).toBe(15);
    // same t → same sample
    expect(tourAt(17.3, keys, start)).toEqual(tourAt(17.3, keys, start));
  });

  it('eases in and out between stops, distance in log space, heading the short way', () => {
    const mid = tourAt(14, keys, start); // half-way from key 0 to key 1
    expect(mid.phase).toBe('fly');
    expect(mid.index).toBe(1);
    expect(mid.f).toBeCloseTo(0.5);
    expect(mid.pose.tx).toBeCloseTo(50);
    expect(mid.pose.dist).toBeCloseTo(Math.sqrt(400 * 60));
    // 25 → −170 is 165° the short way (through +180), not −195°
    expect(mid.pose.az).toBeCloseTo(25 + 165 / 2);
    // eased: 10 % in moves far less than 10 % of the way
    expect((tourAt(12.4, keys, start).pose.tx - 0) / 100).toBeLessThan(0.02);
    // −170 → 170 goes −20° the short way (through ±180)
    const p = blendPose(keys[1].pose, keys[2].pose, 0.5);
    expect(Math.abs(p.az)).toBeCloseTo(180);
  });

  it('scrubs the clock forward only', () => {
    expect(hoursForward(22, 9)).toBe(11);
    expect(hoursForward(15, 22)).toBe(7);
    expect(hoursForward(10, 10)).toBe(0);
    // 22 → 9 half-way (eased 0.5) = 03:30, through the night, never back through the evening
    const h = tourAt(26, keys, start).hour;
    expect(h).toBeCloseTo(3.5);
  });

  it('wraps from the last stop to the first and keeps repeating', () => {
    const P = tourPeriod(keys);
    const w = tourAt(P + 2, keys, start); // half-way into lap 2's first flight
    expect(w.index).toBe(0);
    expect(w.phase).toBe('fly');
    expect(w.pose.tx).toBeCloseTo((keys[2].pose.tx + keys[0].pose.tx) / 2);
    expect(w.hour).toBeCloseTo(9 + 6 / 2);
    expect(tourAt(P + 4, keys, start).pose).toEqual(keys[0].pose);
    expect(tourAt(3 * P + 20, keys, start)).toEqual(tourAt(20 + P, keys, start));
  });

  it('cuts instead of flying under reduced motion', () => {
    const c = tourAt(0.5, keys, start, true);
    expect(c.pose).toEqual(keys[0].pose);
    expect(c.hour).toBe(15);
  });
});

// ---- stop resolution against a fake world
const world: CameraWorld = {
  centerX: 0,
  centerZ: 0,
  radius: 300,
  islands: [
    {
      name: 'Hearthholm',
      theme: 'hq',
      cx: 100,
      cz: -180,
      radius: 40,
      reach: 50,
      peakY: 12,
      anchors: {
        dock: { x: 80, z: -190, rotY: Math.PI / 2 },
        village: { x: 95, z: -175, rotY: 0 },
      },
    },
    {
      name: 'Mossgrove',
      theme: 'design',
      cx: -140,
      cz: 80,
      radius: 40,
      reach: 50,
      peakY: 20,
      anchors: { giantTree: { x: -150, z: 70, rotY: 1 } },
    },
  ],
  heightAt: (x) => (x > 0 ? 3 : 6),
};
const ctx: FitContext = {
  world,
  view: { fov: 35, aspect: 16 / 9 },
  viewport: { width: 1920, height: 1080, insets: FRAMING.bareInsets },
};

describe('tour stops', () => {
  it('anchor stops orbit the island anchor on its facing side', () => {
    const p = stopPose(
      {
        id: 'x',
        title: '',
        kind: 'anchor',
        island: 'hq',
        anchor: 'dock',
        dist: 48,
        pitch: 16,
        time: 9,
      },
      ctx,
    );
    expect(p.tx).toBe(80);
    expect(p.tz).toBe(-190);
    expect(p.ty).toBe(3);
    expect(p.dist).toBe(48);
    expect(p.pitch).toBe(16);
    expect(p.az).toBeCloseTo(azimuthToward(Math.PI / 2));
    const q = stopPose(
      {
        id: 'x',
        title: '',
        kind: 'anchor',
        island: 'design',
        anchor: 'giantTree',
        dist: 70,
        pitch: 25,
        azOffset: 40,
        time: 17.5,
      },
      ctx,
    );
    expect(q.tx).toBe(-150);
    expect(q.az).toBeCloseTo(azimuthToward(1) + 40);
  });

  it('falls back to the ladder target when the anchor or frame is missing', () => {
    const p = stopPose(
      {
        id: 'x',
        title: '',
        kind: 'anchor',
        island: 'design',
        anchor: 'waterfall',
        dist: 45,
        pitch: 14,
        time: 10.5,
      },
      ctx,
    );
    // no village frame either: the island centre, ladder heading, the giant tree kept clear
    expect(p.dist).toBe(45);
    expect(p.pitch).toBe(14);
    expect(p.az).toBe(FRAMING.ladder.fallbackAzimuth);
    expect(Math.hypot(p.tx + 150, p.tz - 70)).toBeGreaterThanOrEqual(
      FRAMING.ladder.avoid.giantTree - 1e-6,
    );
    const v = stopPose({ id: 'x', title: '', kind: 'village', island: 'hq', time: 22 }, ctx);
    expect(v.dist).toBe(85);
  });

  it('fitted stops resolve and every content stop sits inside the pitch band', () => {
    const o = stopPose({ id: 'W1', title: '', kind: 'overview', time: 15 }, ctx);
    expect(o.dist).toBeGreaterThanOrEqual(450);
    const all = resolveKeys(TOUR.stops, ctx);
    expect(all).toHaveLength(TOUR.stops.length);
    all.forEach((k, i) => {
      expect(Number.isFinite(k.pose.tx + k.pose.tz + k.pose.az)).toBe(true);
      // fitted kinds pick their own band-aware pitch (the postcard band needs the real archipelago's
      // distance); the hand-written anchor / ladder stops must sit inside the user band
      const kind = TOUR.stops[i].kind;
      if (kind !== 'anchor' && kind !== 'ladder') return;
      const [lo, hi] = pitchBand(k.pose.dist);
      expect(k.pose.pitch).toBeGreaterThanOrEqual(lo - 1e-6);
      expect(k.pose.pitch).toBeLessThanOrEqual(hi + 1e-6);
    });
    // the lap is ~96 s and the clock only runs forward over it (wrap included)
    expect(tourPeriod(all)).toBe(TOUR.stops.length * (TOUR.flySeconds + TOUR.holdSeconds));
    let forward = 0;
    for (let i = 0; i < all.length; i++)
      forward += hoursForward(all[(i + all.length - 1) % all.length].hour, all[i].hour);
    expect(forward).toBe(24);
  });
});

// ---- the system: start / stop on input / blockers, against fake controls and a fake window
type Listener = (e: { target: EventTarget | null }) => void;
function fakeWindow(): {
  listeners: Map<string, Listener[]>;
  fire(type: string, target?: unknown): void;
} {
  const listeners = new Map<string, Listener[]>();
  (globalThis as { window?: unknown }).window = {
    addEventListener: (t: string, fn: Listener) =>
      listeners.set(t, [...(listeners.get(t) ?? []), fn]),
    removeEventListener: (t: string, fn: Listener) =>
      listeners.set(
        t,
        (listeners.get(t) ?? []).filter((f) => f !== fn),
      ),
  };
  return {
    listeners,
    fire: (type, target = null) => {
      for (const fn of listeners.get(type) ?? []) fn({ target: target as EventTarget | null });
    },
  };
}

function fakeCam(): { cam: CameraSystem; looks: Array<{ pos: number[]; transition: boolean }> } {
  const looks: Array<{ pos: number[]; transition: boolean }> = [];
  const controls = {
    enabled: true,
    maxDistance: 800,
    minPolarAngle: 0.3,
    maxPolarAngle: 1,
    distance: 450,
    polarAngle: (90 - 58) * (Math.PI / 180),
    azimuthAngle: 25 * (Math.PI / 180),
    getTarget: (v: { set(x: number, y: number, z: number): void }) => v.set(0, 0, 0),
    setLookAt: (...a: number[]) => {
      looks.push({ pos: a.slice(0, 6), transition: a[6] as unknown as boolean });
    },
    update: () => false,
    normalizeRotations: () => undefined,
  };
  const cam = {
    controls,
    reducedMotion: false,
    suspended: false,
    setSuspended(on: boolean) {
      this.suspended = on;
    },
    fitContext: () => ctx,
  };
  return { cam: cam as unknown as CameraSystem, looks };
}

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

describe('tour system', () => {
  it('starts, drives the clock and the pose, and stops on any input (not on its own toggle)', () => {
    const win = fakeWindow();
    const { cam, looks } = fakeCam();
    const clock = new Clock();
    clock.dayTime = 3;
    const events = new Emitter<AppEvents>();
    const onActive = vi.fn();
    const toggle = { closest: () => ({}) } as unknown as EventTarget;
    const tour = createTour({
      cam,
      clock,
      events,
      listen: true,
      ignoreInput: (t) => t === toggle,
      onActive,
    });
    expect(win.listeners.get('pointerdown')).toHaveLength(1);
    tour.start();
    expect(tour.active).toBe(true);
    expect(cam.controls.enabled).toBe(false);
    expect(onActive).toHaveBeenLastCalledWith(true);
    // 4 s of fixed steps: the clock lands on the first stop's hour, the pose on its orbit
    for (let i = 0; i < 120; i++) {
      clock.tick();
      tour.fixedUpdate?.(1 / 30);
    }
    expect(clock.dayTime).toBeCloseTo(TOUR.stops[0].time, 5);
    tour.update?.(1 / 30, 0);
    expect(tour.time).toBeCloseTo(4);
    expect(looks.at(-1)?.transition).toBe(false);
    // the HUD toggle's own pointerdown is not "any input"
    win.fire('pointerdown', toggle);
    expect(tour.active).toBe(true);
    // a wheel notch hands the camera back with a damped glide to the pose just ahead
    win.fire('wheel');
    expect(tour.active).toBe(false);
    expect(cam.controls.enabled).toBe(true);
    expect(looks.at(-1)?.transition).toBe(true);
    expect(onActive).toHaveBeenLastCalledWith(false);
    expect(Number.isNaN(tour.time)).toBe(true);
    tour.dispose();
    expect(win.listeners.get('pointerdown')).toHaveLength(0);
  });

  it('idle-starts after TOUR.idleAfter without input, never while blocked or idle-start is off', () => {
    const win = fakeWindow();
    const { cam } = fakeCam();
    const clock = new Clock();
    const events = new Emitter<AppEvents>();
    const tour = createTour({ cam, clock, events, listen: true });
    tour.update?.(TOUR.idleAfter - 1, 0);
    expect(tour.active).toBe(false);
    win.fire('keydown'); // resets the timer
    tour.update?.(TOUR.idleAfter - 1, 0);
    expect(tour.active).toBe(false);
    tour.update?.(2, 0);
    expect(tour.active).toBe(true);
    // edit mode stops it and blocks the idle start
    events.emit('editModeChanged', { active: true });
    expect(tour.active).toBe(false);
    tour.update?.(TOUR.idleAfter + 1, 0);
    expect(tour.active).toBe(false);
    events.emit('editModeChanged', { active: false });
    tour.setIdleStart(false);
    tour.update?.(TOUR.idleAfter + 1, 0);
    expect(tour.active).toBe(false);
    tour.start(); // the explicit toggle still works
    expect(tour.active).toBe(true);
    tour.dispose();
  });
});
