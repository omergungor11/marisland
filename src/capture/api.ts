/**
 * `window.__marisland` — the contract between the app and scripts/shots.ts
 * (ARCHITECTURE §9). Keep this file dependency-free so the harness can import the types.
 */
export interface RenderInfo {
  calls: number;
  triangles: number;
  points: number;
  lines: number;
  programs: number;
  geometries: number;
  textures: number;
}

export interface Counters {
  /** Instances that appeared with neither bloom-in nor dither. Must stay 0. */
  hardPops: number;
  instances: number;
  groundCover: number;
  agents: number;
  particles: number;
  /** Approximate GPU memory of textures + render targets, MB. */
  gpuMemoryMB: number;
}

export interface PickResult {
  kind: string;
  id: number;
  x: number;
  y: number;
  z: number;
}

export interface PerfResult {
  p50: number;
  p95: number;
  frames: number;
}

export interface MarislandApi {
  ready: boolean;
  error: string | null;
  /** 'ANGLE (…SwiftShader…)' etc. */
  renderer: string;
  quality: 'low' | 'medium' | 'high';
  seed: number;
  worldHash: string;
  tier: number;
  info: RenderInfo;
  timings: Record<string, number>;
  counters: Counters;
  /** Advance the loop `n` frames of `dt` seconds (capture mode). Renders each frame. */
  step(dt?: number, n?: number): void;
  /** Apply a camera preset string (same grammar as `?cam=`). Renders one frame. */
  setCamera(preset: string): void;
  /** Set game hour and re-render. */
  setTime(hour: number): void;
  /** CPU pick at CSS pixel coordinates. */
  pick(x: number, y: number): PickResult | null;
  /** Fly a 10 s path and report frame times (real GPU only). */
  perf(): Promise<PerfResult>;
  /** Regenerate with a new seed (used by selftest=regen). Resolves when ready. */
  regen(seed: number): Promise<void>;
  /** renderer.info.memory snapshot for leak checks. */
  memory(): { geometries: number; textures: number };
}

declare global {
  interface Window {
    __marisland?: MarislandApi;
  }
}
