import type CameraControls from 'camera-controls';
import * as THREE from 'three';
import type { OrbitPose } from './controls.ts';
import { DEG } from '../core/math/index.ts';

/**
 * `?perf=1` camera path (ARCHITECTURE §8 "Measurement"): a fixed flight through orbit poses
 * (overview → village → macro → overview), a pure function of the path time so every run
 * covers the same views regardless of the frame rate.
 */
const _t = new THREE.Vector3();

/** The current orbit pose of `controls` (pitch / azimuth in degrees, the `lookFromOrbit` grammar). */
export function orbitPoseOf(controls: CameraControls): OrbitPose {
  controls.getTarget(_t);
  return {
    tx: _t.x,
    ty: _t.y,
    tz: _t.z,
    dist: controls.distance,
    pitch: 90 - controls.polarAngle / DEG,
    az: controls.azimuthAngle / DEG,
  };
}

const smoother = (u: number): number => u * u * u * (u * (u * 6 - 15) + 10);

/** Shortest signed angle from `a` to `b`, degrees. */
function angleTo(a: number, b: number): number {
  return ((((b - a) % 360) + 540) % 360) - 180;
}

/**
 * Pose at path time `t` (s) for keys spread evenly over `seconds`. Each leg eases in and out
 * (smootherstep); distance interpolates in log space so the zoom speed feels even.
 */
export function perfPathPose(
  keys: readonly OrbitPose[],
  seconds: number,
  t: number,
  out: OrbitPose,
): OrbitPose {
  const legs = keys.length - 1;
  if (legs < 1) return Object.assign(out, keys[0]);
  const x = Math.min(Math.max(t / seconds, 0), 1) * legs;
  const i = Math.min(Math.floor(x), legs - 1);
  const u = smoother(x - i);
  const a = keys[i];
  const b = keys[i + 1];
  out.tx = a.tx + (b.tx - a.tx) * u;
  out.ty = a.ty + (b.ty - a.ty) * u;
  out.tz = a.tz + (b.tz - a.tz) * u;
  out.dist = Math.exp(Math.log(a.dist) + (Math.log(b.dist) - Math.log(a.dist)) * u);
  out.pitch = a.pitch + (b.pitch - a.pitch) * u;
  out.az = a.az + angleTo(a.az, b.az) * u;
  return out;
}
