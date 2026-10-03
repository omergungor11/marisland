import type { System } from '../core/loop.ts';
import { lookFromOrbit, type CameraSystem, type OrbitPose } from './controls.ts';
import { easeInOutCubic } from '../core/math/easing.ts';
import { lerp } from '../core/math/index.ts';
import { INTRO, type IntroKey } from '../content/ui.ts';

/**
 * Opening sequence (ART_BIBLE §8), 10 s. A keyframed spline (monotone cubic per channel: smooth
 * through the keys, no overshoot except the scripted 2 % settle) drives the camera while the
 * camera system is suspended; it lands exactly on the overview preset and hands back to
 * camera-controls. Any input eases to the final pose over 400 ms.
 */
export interface IntroOptions {
  cam: CameraSystem;
  /** Hearthholm (or hero island) position for the push-in. */
  heroX: number;
  heroZ: number;
  onCurtainOpen: () => void;
  onLabels: () => void;
  /** HUD buttons pop in (bible: during the 8.5–10 s settle). */
  onHud: () => void;
  onDone: () => void;
}

export interface Intro extends System {
  /** Ease to the final pose (any input). */
  skip(): void;
  /** Capture: jump to time `t` (s) deterministically, firing due callbacks. */
  seek(t: number): void;
  readonly active: boolean;
  readonly time: number;
  dispose(): void;
}

/** Monotone cubic (Fritsch–Carlson) through (xs, ys) evaluated at x. Flat holds stay flat. */
export function monotoneCubic(xs: readonly number[], ys: readonly number[], x: number): number {
  const n = xs.length;
  if (n === 0) return 0;
  if (x <= xs[0]) return ys[0];
  if (x >= xs[n - 1]) return ys[n - 1];
  const d: number[] = [];
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  const m: number[] = new Array<number>(n);
  m[0] = 0;
  m[n - 1] = 0;
  for (let i = 1; i < n - 1; i++) {
    if (d[i - 1] * d[i] <= 0) m[i] = 0;
    else {
      const w1 = 2 * (xs[i + 1] - xs[i]) + (xs[i] - xs[i - 1]);
      const w2 = xs[i + 1] - xs[i] + 2 * (xs[i] - xs[i - 1]);
      m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]);
    }
  }
  let i = 0;
  while (i < n - 2 && x > xs[i + 1]) i++;
  const h = xs[i + 1] - xs[i];
  const t = (x - xs[i]) / h;
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    (2 * t3 - 3 * t2 + 1) * ys[i] +
    (t3 - 2 * t2 + t) * h * m[i] +
    (-2 * t3 + 3 * t2) * ys[i + 1] +
    (t3 - t2) * h * m[i + 1]
  );
}

/** Intro camera pose at time `t` for a given overview pose and hero island. */
export function introPose(
  t: number,
  ov: OrbitPose,
  heroX: number,
  heroZ: number,
  keys: readonly IntroKey[] = INTRO.keys,
): OrbitPose {
  const ts = keys.map((k) => k.t);
  const ch = (f: (k: IntroKey) => number): number =>
    monotoneCubic(
      ts,
      keys.map((k) => f(k)),
      t,
    );
  const hero = ch((k) => k.hero);
  return {
    tx: lerp(ov.tx, heroX, hero),
    ty: ov.ty,
    tz: lerp(ov.tz, heroZ, hero),
    dist: ch((k) => k.dist ?? ov.dist * (k.settle ? 1 - INTRO.settleOvershoot : 1)),
    pitch: ch((k) => k.pitch ?? ov.pitch),
    az: ov.az + ch((k) => k.azOffset),
  };
}

export function createIntro(o: IntroOptions): Intro {
  const controls = o.cam.controls;
  let ov = o.cam.overviewPose();
  let t = 0;
  let active = true;
  let curtainOpened = false;
  let labelsShown = false;
  let hudShown = false;
  let skipFrom: OrbitPose | null = null;
  let skipT = 0;
  const wasEnabled = controls.enabled;
  controls.enabled = false;
  o.cam.setSuspended(true);

  const apply = (p: OrbitPose): void => {
    lookFromOrbit(controls, p.tx, p.ty, p.tz, p.dist, p.pitch, p.az, false);
    controls.update(0);
  };
  let cur = introPose(0, ov, o.heroX, o.heroZ);
  apply(cur);

  const fire = (): void => {
    if (!curtainOpened && t >= INTRO.curtainAt) {
      curtainOpened = true;
      o.onCurtainOpen();
    }
    if (!labelsShown && t >= INTRO.labelsAt) {
      labelsShown = true;
      o.onLabels();
    }
    if (!hudShown && t >= INTRO.hudAt) {
      hudShown = true;
      o.onHud();
    }
  };

  const finish = (): void => {
    if (!active) return;
    active = false;
    o.cam.setSuspended(false);
    controls.enabled = wasEnabled;
    // Land on the preset itself, not an approximation of it: no jump when the user takes over.
    o.cam.applyPreset('overview', false);
    if (!curtainOpened) {
      curtainOpened = true;
      o.onCurtainOpen();
    }
    if (!labelsShown) {
      labelsShown = true;
      o.onLabels();
    }
    if (!hudShown) {
      hudShown = true;
      o.onHud();
    }
    o.onDone();
  };

  return {
    name: 'intro',
    get active() {
      return active;
    },
    get time() {
      return t;
    },
    skip() {
      if (!active || skipFrom) return;
      skipFrom = { ...cur };
      skipT = 0;
      if (!curtainOpened) {
        curtainOpened = true;
        o.onCurtainOpen();
      }
    },
    seek(time) {
      if (!active) return;
      t = Math.max(0, time);
      ov = o.cam.overviewPose();
      fire();
      cur = introPose(Math.min(t, INTRO.duration), ov, o.heroX, o.heroZ);
      apply(cur);
    },
    update(dt) {
      if (!active) return;
      if (skipFrom) {
        skipT += dt;
        const e = easeInOutCubic(Math.min(1, skipT / INTRO.skipSeconds));
        const f = skipFrom;
        cur = {
          tx: lerp(f.tx, ov.tx, e),
          ty: lerp(f.ty, ov.ty, e),
          tz: lerp(f.tz, ov.tz, e),
          dist: lerp(f.dist, ov.dist, e),
          pitch: lerp(f.pitch, ov.pitch, e),
          az: lerp(f.az, ov.az, e),
        };
        apply(cur);
        if (skipT >= INTRO.skipSeconds) finish();
        return;
      }
      t += dt;
      ov = o.cam.overviewPose();
      fire();
      cur = introPose(Math.min(t, INTRO.duration), ov, o.heroX, o.heroZ);
      apply(cur);
      if (t >= INTRO.duration) finish();
    },
    dispose() {
      if (!active) return;
      active = false;
      o.cam.setSuspended(false);
      controls.enabled = wasEnabled;
    },
  };
}
