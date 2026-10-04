/**
 * `window.__marisland` — the contract between the app and scripts/shots.ts
 * (ARCHITECTURE §9). Keep this file dependency-free so the harness can import the types
 * (type-only imports below are erased).
 */
import type { EditCommand, EditLog } from '../world/edit-types.ts';

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
  /** Terrain chunks remeshed by edits (TASK-211). */
  rebuilds: number;
}

/** `api.edit` result (the edit model's `EditResult` without its inverse / dirty payload). */
export interface EditOutcome {
  ok: boolean;
  reason?: string;
}

/** `api.testBrush` summary (test-only terrain brush, TASK-211). */
export interface TestBrushOutcome {
  chunks: number;
  props: number;
  sdf: boolean;
  /** Chunks still queued after the call (0 in capture mode). */
  pending: number;
}

export interface PickResult {
  /** 'prop' | 'agent' | 'terrain'. */
  kind: string;
  /** Prop: edit-model id (scatter index, ≥ EDIT_PROP_ID_BASE when edit-added, −1 for settlement props; `instanceIndex` is the render-store slot). Agent: slot in its kind. Terrain: −1. */
  id: number;
  /** Prop def id, agent kind, or 'terrain' / 'water'. */
  name?: string;
  /** Same as `id` for props and agents. */
  instanceIndex?: number;
  x: number;
  y: number;
  z: number;
}

/** `api.perf()`: frame-time percentiles over the `?perf=1` path, ms. */
export interface PerfResult {
  /** Frame interval (RAF to RAF; capture mode: one stepped frame incl. `gl.finish`). */
  p50: number;
  p95: number;
  frames: number;
  /** Main-thread time of the loop per frame. */
  cpuP50?: number;
  cpuP95?: number;
  /** GPU time per frame (`EXT_disjoint_timer_query_webgl2`); absent when unsupported. */
  gpuP50?: number;
  gpuP95?: number;
  gpuFrames?: number;
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
  /** Dolly from `fromDist` to the current distance over `seconds`, stepping frames (W8 check). */
  dolly(fromDist: number, seconds: number): void;
  /** CPU pick at canvas-relative CSS pixel coordinates. */
  pick(x: number, y: number): PickResult | null;
  /** Set the hover highlight as the pointer at (x, y) would (capture-mode script hook). */
  hover(x: number, y: number): PickResult | null;
  /** Click at (x, y): pick and start the reaction (capture-mode script hook). */
  click(x: number, y: number): PickResult | null;
  /** Fly a 10 s path and report frame times (real GPU only). */
  perf(): Promise<PerfResult>;
  /** Regenerate with a new seed (used by selftest=regen). Resolves when ready. */
  regen(seed: number): Promise<void>;
  /** renderer.info.memory snapshot for leak checks. */
  memory(): { geometries: number; textures: number };
  /**
   * Phase 2 (TASK-211): apply an edit command through the edit model (`world/edit.ts`) and
   * rebuild; capture mode renders one frame. `{ ok: false }` when the model is not built in.
   */
  edit(cmd: EditCommand): EditOutcome;
  undo(): boolean;
  redo(): boolean;
  /** Seed + applied commands (null without the edit model). */
  editLog(): EditLog | null;
  /**
   * TEST-ONLY: raise (delta > 0) / lower the terrain around (x, z) with the render tests'
   * brush (no edit model, no history) and rebuild; capture mode renders one frame.
   */
  testBrush(x: number, z: number, r: number, delta: number): TestBrushOutcome | null;
}

declare global {
  interface Window {
    __marisland?: MarislandApi;
  }
}
