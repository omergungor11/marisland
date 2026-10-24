/**
 * Tour mode (TASK-473, world.md C1): a chain of wow-like framings the camera flies through when
 * idle or on the HUD "Tour" toggle / `tour=1`. The timeline is a pure function of the tour time
 * (`tourAt`), so a capture at `tour=1&simt=T` is deterministic; the stops are resolved against
 * the live world by island / theme (`stopPose`), never from raw coordinates. The game clock scrubs
 * forward to each stop's hour during the flight and holds it at the stop.
 */
import type CameraControls from 'camera-controls';
import type { System } from '../core/loop.ts';
import type { Clock } from '../core/clock.ts';
import type { Emitter, AppEvents } from '../core/events.ts';
import { easeInOutCubic } from '../core/math/easing.ts';
import { lerp } from '../core/math/index.ts';
import { pitchForDistance } from '../detail/tier.ts';
import { TOUR, type TourStop } from '../content/tour.ts';
import { lookFromOrbit, type CameraSystem } from './controls.ts';
import { orbitPoseOf } from './perf-path.ts';
import {
  findIsland,
  framePose,
  islandPose,
  ladderPose,
  overviewPose,
  postcardPose,
  type CameraWorld,
  type Viewport,
} from './poses.ts';
import { azimuthToward, type Pose, type View } from './framing.ts';

/** A resolved stop: where the camera holds, at which hour, for how long. */
export interface TourKey {
  pose: Pose;
  hour: number;
  fly: number;
  hold: number;
}

export interface TourSample {
  pose: Pose;
  hour: number;
  /** Stop index the segment leads to / holds. */
  index: number;
  phase: 'fly' | 'hold';
  /** Flight progress 0–1 (1 while holding). */
  f: number;
}

export interface FitContext {
  world: CameraWorld;
  view: View;
  viewport: Viewport;
}

/** Shortest signed angle from `a` to `b`, degrees. */
const angleTo = (a: number, b: number): number => ((((b - a) % 360) + 540) % 360) - 180;
/** Forward-only hour distance (the tour clock never runs backwards). */
export const hoursForward = (from: number, to: number): number => (((to - from) % 24) + 24) % 24;

/** Pose blend: targets linear, distance in log space, heading the short way round. */
export function blendPose(a: Pose, b: Pose, e: number): Pose {
  return {
    tx: lerp(a.tx, b.tx, e),
    ty: lerp(a.ty, b.ty, e),
    tz: lerp(a.tz, b.tz, e),
    dist: Math.exp(lerp(Math.log(a.dist), Math.log(b.dist), e)),
    pitch: lerp(a.pitch, b.pitch, e),
    az: a.az + angleTo(a.az, b.az) * e,
  };
}

/** One lap: every stop's flight plus hold (s). */
export function tourPeriod(keys: readonly TourKey[]): number {
  let p = 0;
  for (const k of keys) p += k.fly + k.hold;
  return p;
}

/**
 * The tour at time `t` (s since the start): the first lap flies in from `start` (the pose and
 * hour the user left), later laps wrap from the last stop; after the lap the chain repeats.
 * `cut` (reduced motion) replaces every flight by a cut to its stop.
 */
export function tourAt(
  t: number,
  keys: readonly TourKey[],
  start: { pose: Pose; hour: number },
  cut = false,
): TourSample {
  const n = keys.length;
  const period = tourPeriod(keys);
  const lap = Math.floor(t / period);
  let u = t - lap * period;
  for (let i = 0; i < n; i++) {
    const k = keys[i];
    if (u < k.fly) {
      const prev = i === 0 ? (lap === 0 ? start : keys[n - 1]) : keys[i - 1];
      const f = u / k.fly;
      const e = cut ? 1 : easeInOutCubic(f);
      return {
        pose: e <= 0 ? prev.pose : e >= 1 ? k.pose : blendPose(prev.pose, k.pose, e),
        hour: (prev.hour + hoursForward(prev.hour, k.hour) * e) % 24,
        index: i,
        phase: 'fly',
        f,
      };
    }
    u -= k.fly;
    if (u < k.hold || i === n - 1)
      return { pose: k.pose, hour: k.hour, index: i, phase: 'hold', f: 1 };
    u -= k.hold;
  }
  const last = keys[n - 1];
  return { pose: last.pose, hour: last.hour, index: n - 1, phase: 'hold', f: 1 };
}

/**
 * A stop's orbit pose against the live world (island / theme-relative; see content/tour.ts).
 * Unfitted kinds default to the pitch curve at their distance (inside the user pitch band, so the
 * hand-back never snaps).
 */
export function stopPose(stop: TourStop, ctx: FitContext): Pose {
  const { world, view, viewport } = ctx;
  const key = stop.island ?? '';
  const isl = findIsland(world, key);
  const dist = stop.dist ?? 85;
  const pitch = stop.pitch ?? pitchForDistance(dist);
  switch (stop.kind) {
    case 'overview':
      return overviewPose(world, view, viewport);
    case 'postcard':
      return postcardPose(world, view, viewport);
    case 'island':
      if (!isl) return overviewPose(world, view, viewport);
      return islandPose(isl, view, viewport, undefined, world.islands);
    case 'village':
    case 'dock': {
      const frame = isl?.frames?.[stop.kind];
      if (!frame) return ladderPose(world, isl, key, dist, pitch, stop.azOffset);
      return framePose(frame, stop.kind, view, viewport, world.heightAt(frame.x, frame.z));
    }
    case 'ladder':
      return ladderPose(world, isl, key, dist, pitch, stop.azOffset);
    case 'anchor': {
      const a = stop.anchor ? isl?.anchors[stop.anchor] : undefined;
      if (!a) return ladderPose(world, isl, key, dist, pitch, stop.azOffset);
      const az = azimuthToward(a.rotY) + (stop.azOffset ?? 0);
      const ux = Math.sin((az * Math.PI) / 180);
      const uz = Math.cos((az * Math.PI) / 180);
      const sh = stop.shift ?? { right: 0, back: 0 };
      const tx = a.x + uz * sh.right + ux * sh.back;
      const tz = a.z - ux * sh.right + uz * sh.back;
      return { tx, ty: Math.max(0, world.heightAt(tx, tz)), tz, dist, pitch, az };
    }
  }
}

export function resolveKeys(stops: readonly TourStop[], ctx: FitContext): TourKey[] {
  return stops.map((s) => ({
    pose: stopPose(s, ctx),
    hour: s.time,
    fly: s.fly ?? TOUR.flySeconds,
    hold: s.hold ?? TOUR.holdSeconds,
  }));
}

export interface TourOptions {
  cam: CameraSystem;
  clock: Clock;
  events: Emitter<AppEvents>;
  /** Window input listeners (any input stops the tour / resets the idle timer); off in capture. */
  listen: boolean;
  /** Input from this target (the HUD's own Tour toggle) is not "any input". */
  ignoreInput?: (target: EventTarget | null) => boolean;
  /** The tour started / stopped (HUD toggle state). */
  onActive?: (active: boolean) => void;
}

export interface Tour extends System {
  readonly active: boolean;
  /** Seconds into the tour (NaN while inactive). */
  readonly time: number;
  start(): void;
  /** Hand the camera back; a running flight glides out through camera-controls' damping. */
  stop(): void;
  /** Idle auto-start after `TOUR.idleAfter` s without input (`tour=0` / capture turn it off). */
  setIdleStart(on: boolean): void;
  /** Blockers (intro, perf run, edit mode, frozen photo): no start; blocking while active stops. */
  setBlocked(reason: string, on: boolean): void;
  dispose(): void;
}

export function createTour(o: TourOptions): Tour {
  const { cam, clock, events } = o;
  const controls: CameraControls = cam.controls;
  let keys: TourKey[] = [];
  let start: { pose: Pose; hour: number } | null = null;
  let t0 = 0;
  let idle = 0;
  let idleStart: boolean = TOUR.idleStart;
  let wasEnabled = true;
  const blocked = new Set<string>();
  const cleanups: Array<() => void> = [];

  const apply = (p: Pose, transition: boolean): void => {
    if (p.dist > controls.maxDistance) controls.maxDistance = p.dist * 1.02;
    lookFromOrbit(controls, p.tx, p.ty, p.tz, p.dist, p.pitch, p.az, transition);
    if (!transition) controls.update(0);
  };
  const resolve = (): void => {
    keys = resolveKeys(TOUR.stops, cam.fitContext());
  };
  const sample = (t: number): TourSample =>
    tourAt(t, keys, start as { pose: Pose; hour: number }, cam.reducedMotion);

  const tour: Tour = {
    name: 'tour',
    get active() {
      return start !== null;
    },
    get time() {
      return start ? clock.time - t0 : NaN;
    },
    start() {
      if (start || blocked.size > 0) return;
      resolve();
      if (keys.length === 0) return;
      start = { pose: orbitPoseOf(controls), hour: clock.dayTime };
      t0 = clock.time;
      idle = 0;
      wasEnabled = controls.enabled;
      controls.enabled = false;
      cam.setSuspended(true);
      // free pitch for the flights; `cam.update` restores the band after the hand-back
      controls.minPolarAngle = 0;
      controls.maxPolarAngle = Math.PI / 2;
      o.onActive?.(true);
    },
    stop() {
      if (!start) return;
      const ahead = sample(clock.time - t0 + TOUR.handbackSeconds).pose;
      start = null;
      idle = 0;
      cam.setSuspended(false);
      controls.enabled = wasEnabled;
      apply(ahead, !cam.reducedMotion);
      controls.normalizeRotations();
      o.onActive?.(false);
    },
    setIdleStart(on) {
      idleStart = on;
      idle = 0;
    },
    setBlocked(reason, on) {
      if (on) blocked.add(reason);
      else blocked.delete(reason);
      if (on) tour.stop();
      idle = 0;
    },
    fixedUpdate() {
      if (!start) return;
      // the pose moves with the sim too: a capture warm-up (`simt`) lands the camera before the
      // first frame, so the first tier is set instantly instead of blooming in over the settle
      const s = sample(clock.simTime - t0);
      clock.dayTime = s.hour;
      apply(s.pose, false);
    },
    update(dt) {
      if (start) {
        apply(sample(clock.time - t0).pose, false);
        return;
      }
      if (!idleStart || blocked.size > 0 || cam.reducedMotion) return;
      idle += dt;
      if (idle >= TOUR.idleAfter) tour.start();
    },
    dispose() {
      tour.stop();
      for (const c of cleanups) c();
      cleanups.length = 0;
    },
  };

  if (o.listen) {
    const onInput = (e: Event): void => {
      if (o.ignoreInput?.(e.target)) return;
      idle = 0;
      tour.stop();
    };
    // capture phase: the hand-back runs before camera-controls sees the same pointerdown
    for (const type of ['pointerdown', 'wheel', 'keydown', 'touchstart'] as const) {
      window.addEventListener(type, onInput, { passive: true, capture: true });
      cleanups.push(() => window.removeEventListener(type, onInput, { capture: true }));
    }
  }
  cleanups.push(
    events.on('editModeChanged', ({ active }) => tour.setBlocked('edit', active)),
    events.on('photoMode', ({ frozen }) => tour.setBlocked('photo', frozen)),
    // the stops are fitted to the viewport: refit while touring (a new seed stops the tour first)
    events.on('resized', () => {
      if (start) resolve();
    }),
  );
  return tour;
}
