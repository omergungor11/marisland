import type { CameraSystem, OrbitPose } from '../camera/controls.ts';
import { lookFromOrbit } from '../camera/controls.ts';
import { orbitPoseOf, perfPathPose } from '../camera/perf-path.ts';
import type { Loop } from '../core/loop.ts';
import { percentile } from '../core/governor.ts';
import type { PerfResult } from '../capture/api.ts';
import type { GpuTimer } from '../render/gpu-timer.ts';

/**
 * `?perf=1` / `api.perf()` (ARCHITECTURE §8, TASK-191): fly the fixed path and report frame
 * time percentiles. Live: RAF-to-RAF intervals (+ the loop's CPU ms, + GPU timer queries when
 * the extension exists). Capture (`freeze=1`, no RAF): the path is stepped at `manualFps` and
 * each step is timed including a 1-px `readPixels` sync, so headless numbers include the GPU work.
 */
export interface PerfRunDeps {
  cam: CameraSystem;
  loop: Loop;
  now: () => number;
  manual: boolean;
  gl: WebGL2RenderingContext;
  /** GPU timer around each render (null when unsupported); the app's render() wraps it. */
  gpuTimer: GpuTimer | null;
  presets: readonly string[];
  seconds: number;
  manualFps: number;
}

export function runPerfPath(d: PerfRunDeps): Promise<PerfResult> {
  const { cam, loop, now } = d;
  const controls = cam.controls;
  const keys: OrbitPose[] = d.presets.map((p) => {
    cam.applyPreset(p, false);
    return orbitPoseOf(controls);
  });
  const wasEnabled = controls.enabled;
  controls.enabled = false;
  cam.setIdleOrbit(false);
  cam.setSuspended(true);
  const pose: OrbitPose = { ...keys[0] };
  const apply = (t: number): void => {
    perfPathPose(keys, d.seconds, t, pose);
    lookFromOrbit(controls, pose.tx, pose.ty, pose.tz, pose.dist, pose.pitch, pose.az, false);
    controls.update(0);
  };
  const frame: number[] = [];
  const cpu: number[] = [];

  const finish = (): PerfResult => {
    cam.setSuspended(false);
    controls.enabled = wasEnabled;
    cam.applyPreset(d.presets[d.presets.length - 1], false);
    const gpu = d.gpuTimer ? Array.from(d.gpuTimer.poll()) : [];
    const pct = (a: number[], p: number): number =>
      a.length ? round2(percentile(Float64Array.from(a), a.length, p)) : NaN;
    const r: PerfResult = {
      p50: pct(frame, 0.5),
      p95: pct(frame, 0.95),
      frames: frame.length,
      cpuP50: pct(cpu, 0.5),
      cpuP95: pct(cpu, 0.95),
    };
    if (gpu.length) {
      r.gpuP50 = pct(gpu, 0.5);
      r.gpuP95 = pct(gpu, 0.95);
      r.gpuFrames = gpu.length;
    }
    return r;
  };

  if (d.manual) {
    const n = Math.round(d.seconds * d.manualFps);
    const px = new Uint8Array(4);
    for (let i = 0; i <= n; i++) {
      apply(i / d.manualFps);
      const t0 = now();
      loop.step(1 / d.manualFps, 1);
      // finish() does not wait for SwiftShader/ANGLE; a 1-px read of the canvas does
      d.gl.readPixels(0, 0, 1, 1, d.gl.RGBA, d.gl.UNSIGNED_BYTE, px);
      const ms = now() - t0;
      frame.push(ms);
      cpu.push(ms);
    }
    return Promise.resolve(finish());
  }

  return new Promise((resolve) => {
    let start = NaN;
    let last = NaN;
    const sys = {
      name: 'perf-path',
      update: () => {
        const t = now();
        if (Number.isNaN(start)) start = t;
        else {
          frame.push(t - last);
          cpu.push(loop.cpuMs);
        }
        last = t;
        const e = (t - start) / 1000;
        apply(e);
        if (e >= d.seconds) {
          loop.remove(sys);
          // let the last queries land before reading them back
          requestAnimationFrame(() => requestAnimationFrame(() => resolve(finish())));
        }
      },
    };
    loop.add(sys);
  });
}

const round2 = (v: number): number => Math.round(v * 100) / 100;
