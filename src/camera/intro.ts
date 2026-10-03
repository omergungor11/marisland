import * as THREE from 'three';
import type { System } from '../core/loop.ts';
import type { CameraSystem } from './controls.ts';
import { easeInOutCubic, easeOutCubic } from '../core/math/easing.ts';
import { CAMERA } from '../content/tiers.ts';
import { DEG, lerp } from '../core/math/index.ts';

/**
 * Opening sequence (ART_BIBLE §8), 10 s. Drives the camera directly from a keyframed
 * orbit path (critically damped, no overshoot except the 2 % settle), then hands over to
 * camera-controls. Any input skips to the final pose with a 400 ms ease.
 */
export interface IntroOptions {
  cam: CameraSystem;
  centerX: number;
  centerZ: number;
  /** Hearthholm (or hero island) position for the push-in. */
  heroX: number;
  heroZ: number;
  onCurtainOpen: () => void;
  onLabels: () => void;
  onDone: () => void;
}

interface Key {
  t: number;
  dist: number;
  pitch: number;
  az: number;
  tx: number;
  tz: number;
}

export interface Intro extends System {
  skip(): void;
  readonly active: boolean;
}

export function createIntro(o: IntroOptions): Intro {
  const ov = CAMERA.overview;
  const keys: Key[] = [
    { t: 0, dist: 180, pitch: 80, az: ov.azimuthDeg - 40, tx: o.centerX, tz: o.centerZ },
    { t: 1.5, dist: 900, pitch: 80, az: ov.azimuthDeg - 40, tx: o.centerX, tz: o.centerZ },
    { t: 3.0, dist: 900, pitch: 80, az: ov.azimuthDeg - 40, tx: o.centerX, tz: o.centerZ },
    { t: 6.5, dist: 420, pitch: 58, az: ov.azimuthDeg, tx: o.centerX, tz: o.centerZ },
    {
      t: 8.5,
      dist: 300,
      pitch: 55,
      az: ov.azimuthDeg + 6,
      tx: lerp(o.centerX, o.heroX, 0.6),
      tz: lerp(o.centerZ, o.heroZ, 0.6),
    },
    {
      t: 9.7,
      dist: ov.dist * 0.98,
      pitch: ov.pitch,
      az: ov.azimuthDeg,
      tx: o.centerX,
      tz: o.centerZ,
    },
    { t: 10, dist: ov.dist, pitch: ov.pitch, az: ov.azimuthDeg, tx: o.centerX, tz: o.centerZ },
  ];
  let t = 0;
  let active = true;
  let curtainOpened = false;
  let labelsShown = false;
  let skipping = false;
  let skipFrom: Key | null = null;
  let skipT = 0;
  const controls = o.cam.controls;
  const wasEnabled = controls.enabled;
  controls.enabled = false;

  const evalKey = (time: number, out: Key): Key => {
    let i = 0;
    while (i < keys.length - 2 && keys[i + 1].t <= time) i++;
    const a = keys[i];
    const b = keys[i + 1];
    const u = Math.min(1, Math.max(0, (time - a.t) / (b.t - a.t)));
    const e = i === 0 ? easeOutCubic(u) : easeInOutCubic(u);
    out.dist = lerp(a.dist, b.dist, e);
    out.pitch = lerp(a.pitch, b.pitch, e);
    out.az = lerp(a.az, b.az, e);
    out.tx = lerp(a.tx, b.tx, e);
    out.tz = lerp(a.tz, b.tz, e);
    out.t = time;
    return out;
  };
  const cur: Key = { ...keys[0] };
  const apply = (k: Key): void => {
    const pitch = k.pitch * DEG;
    const az = k.az * DEG;
    const px = k.tx + Math.sin(az) * Math.cos(pitch) * k.dist;
    const pz = k.tz + Math.cos(az) * Math.cos(pitch) * k.dist;
    const py = Math.sin(pitch) * k.dist;
    void controls.setLookAt(px, py, pz, k.tx, 0, k.tz, false);
    controls.update(0);
  };
  apply(cur);

  const finish = (): void => {
    if (!active) return;
    active = false;
    apply(keys[keys.length - 1]);
    controls.enabled = wasEnabled;
    if (!curtainOpened) o.onCurtainOpen();
    if (!labelsShown) o.onLabels();
    o.onDone();
  };

  const intro: Intro = {
    name: 'intro',
    get active() {
      return active;
    },
    skip() {
      if (!active || skipping) return;
      skipping = true;
      skipFrom = { ...cur };
      skipT = 0;
      if (!curtainOpened) {
        curtainOpened = true;
        o.onCurtainOpen();
      }
    },
    update(dt) {
      if (!active) return;
      if (skipping && skipFrom) {
        skipT += dt;
        const u = Math.min(1, skipT / 0.4);
        const e = easeInOutCubic(u);
        const end = keys[keys.length - 1];
        apply({
          t: 0,
          dist: lerp(skipFrom.dist, end.dist, e),
          pitch: lerp(skipFrom.pitch, end.pitch, e),
          az: lerp(skipFrom.az, end.az, e),
          tx: lerp(skipFrom.tx, end.tx, e),
          tz: lerp(skipFrom.tz, end.tz, e),
        });
        if (u >= 1) finish();
        return;
      }
      t += dt;
      if (!curtainOpened && t >= 1.5) {
        curtainOpened = true;
        o.onCurtainOpen();
      }
      if (!labelsShown && t >= 5.5) {
        labelsShown = true;
        o.onLabels();
      }
      evalKey(Math.min(t, 10), cur);
      apply(cur);
      if (t >= 10) finish();
    },
    dispose() {
      active = false;
      controls.enabled = wasEnabled;
    },
  };
  return intro;
}

export const _introVec = new THREE.Vector3();
