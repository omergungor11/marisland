/**
 * Editor tools (phase-2 TASK-212): the tool state, `commandFor(state, hit)` and the stroke
 * sampler that turns a pointer drag into commands. Pure (no three, no DOM).
 *
 * A stroke starts at pointer-down (`begin`), emits a sample whenever the terrain hit has moved
 * ≥ radius × `EDIT_UI.sampleSpacing` (gaps of a fast drag are filled along the segment) and ends
 * at pointer-up; the caller wraps it in `session.beginStroke/endStroke` so it is one undo step.
 * Prop placements draw rotation / scale / variant from `createRng(seed).fork('edit', n)` (n =
 * placements so far) so the ghost can preview exactly what the next click places.
 */
import { createRng } from '../core/rng.ts';
import { clamp } from '../core/math/index.ts';
import type { EditCommand, ZonePaint } from '../world/edit-types.ts';
import { BRUSH_TOOLS, EDIT_UI, type EditToolKind } from '../content/edit-ui.ts';

/** A pointer hit for editing (terrain ray-march + optional prop under the pointer). */
export interface EditHit {
  x: number;
  z: number;
  /** Raw terrain height at (x, z) — below 0 under water. */
  ground: number;
  /** Prop under the pointer (erase / move): its id and rotation. */
  prop?: { id: number; rotY: number } | null;
}

export interface ToolState {
  /** `null` = navigate (no stroke, the camera pans). */
  tool: EditToolKind | null;
  /** Brush radius (u), clamped to `EDIT_UI.radius`. */
  radius: number;
  /** 0..1. */
  strength: number;
  zone: ZonePaint;
  /** Prop def id for the prop tool. */
  def: string;
  /** Fixed variant, or −1 = drawn per placement. */
  variant: number;
  /** Variant count of `def` (for random draws). */
  variants: number;
  /** Prop placements so far: the rng fork index of the next one. */
  placed: number;
  /** World seed (rng root). */
  seed: number;
}

export function createToolState(seed: number, init: Partial<ToolState> = {}): ToolState {
  return {
    tool: EDIT_UI.initialTool,
    radius: EDIT_UI.radius.initial,
    strength: EDIT_UI.strength.initial,
    zone: EDIT_UI.initialZone,
    def: EDIT_UI.initialDef,
    variant: -1,
    variants: 1,
    placed: 0,
    ...init,
    seed: seed >>> 0,
  };
}

export function setRadius(s: ToolState, r: number): number {
  s.radius = clamp(r, EDIT_UI.radius.min, EDIT_UI.radius.max);
  return s.radius;
}

export function setStrength(s: ToolState, v: number): number {
  s.strength = clamp(v, EDIT_UI.strength.min, EDIT_UI.strength.max);
  return s.strength;
}

export const isBrushTool = (t: EditToolKind | null): boolean => !!t && BRUSH_TOOLS.includes(t);

export interface Placement {
  rotY: number;
  scale: number;
  variant: number;
}

/** Rotation / scale / variant of placement `n` (default: the next one). Deterministic. */
export function nextPlacement(s: ToolState, n = s.placed): Placement {
  const rng = createRng(s.seed).fork('edit', n);
  const rotY = rng.range(0, Math.PI * 2);
  const scale = rng.range(EDIT_UI.propScale[0], EDIT_UI.propScale[1]);
  const drawn = rng.int(0, Math.max(0, s.variants - 1));
  return { rotY, scale, variant: s.variant >= 0 ? s.variant : drawn };
}

/** Per-stroke context captured at pointer-down. */
export interface StrokeContext {
  /** Terrain height under the first sample (flatten target). */
  startGround: number;
  /** Prop grabbed at pointer-down (move). */
  prop: { id: number; rotY: number } | null;
}

/** The command a tool emits for one sample at `hit` (null: nothing to do here). */
export function commandFor(
  s: ToolState,
  hit: EditHit,
  stroke: StrokeContext = { startGround: hit.ground, prop: hit.prop ?? null },
): EditCommand | null {
  const { x, z } = hit;
  const r = s.radius;
  switch (s.tool) {
    case 'raise':
    case 'lower':
      return { k: s.tool, x, z, r, s: s.strength * EDIT_UI.brushDelta };
    case 'flatten':
      return { k: 'flatten', x, z, r, s: stroke.startGround };
    case 'smooth':
      return { k: 'smooth', x, z, r, s: s.strength * EDIT_UI.smoothBlend };
    case 'paint':
      return { k: 'paint', x, z, r, zone: s.zone };
    case 'prop': {
      const p = nextPlacement(s);
      return { k: 'propAdd', def: s.def, x, z, rotY: p.rotY, scale: p.scale, variant: p.variant };
    }
    case 'erase':
      return hit.prop ? { k: 'propRemove', id: hit.prop.id } : null;
    case 'move':
      return stroke.prop
        ? { k: 'propMove', id: stroke.prop.id, x, z, rotY: stroke.prop.rotY }
        : null;
    default:
      return null;
  }
}

/** Receives each sample's command; returns whether it was applied (prop counter advances). */
export type EmitCommand = (cmd: EditCommand) => boolean;

export class StrokeSampler {
  private ctx: StrokeContext = { startGround: 0, prop: null };
  private lastX = 0;
  private lastZ = 0;
  private lastG = 0;
  private endHit: EditHit | null = null;
  private readonly erased = new Set<number>();
  active = false;
  /** Commands emitted in the current / last stroke. */
  emitted = 0;

  constructor(
    private readonly state: ToolState,
    private readonly emit: EmitCommand,
  ) {}

  /** Sample spacing (u) for the current radius. */
  get spacing(): number {
    return this.state.radius * EDIT_UI.sampleSpacing;
  }

  private send(hit: EditHit): void {
    const cmd = commandFor(this.state, hit, this.ctx);
    if (!cmd) return;
    this.emitted++;
    const ok = this.emit(cmd);
    if (ok && cmd.k === 'propAdd') this.state.placed++;
    if (cmd.k === 'propRemove') this.erased.add(cmd.id);
  }

  begin(hit: EditHit): void {
    this.active = true;
    this.emitted = 0;
    this.erased.clear();
    this.ctx = { startGround: hit.ground, prop: hit.prop ?? null };
    this.lastX = hit.x;
    this.lastZ = hit.z;
    this.lastG = hit.ground;
    this.endHit = null;
    const t = this.state.tool;
    if (isBrushTool(t) || t === 'prop' || t === 'erase') this.send(hit);
  }

  move(hit: EditHit): void {
    if (!this.active) return;
    const t = this.state.tool;
    if (t === 'move') {
      this.endHit = hit;
      return;
    }
    if (t === 'erase') {
      if (hit.prop && !this.erased.has(hit.prop.id)) this.send(hit);
      return;
    }
    if (!isBrushTool(t)) return;
    const dx = hit.x - this.lastX;
    const dz = hit.z - this.lastZ;
    const d = Math.hypot(dx, dz);
    const step = this.spacing;
    if (d < step || step <= 0) return;
    const n = Math.floor(d / step);
    const m = Math.min(n, EDIT_UI.maxSamplesPerMove);
    const ux = dx / d;
    const uz = dz / d;
    const dg = hit.ground - this.lastG;
    for (let i = 1; i <= m; i++) {
      // the last of a capped burst lands on the pointer (no lag behind a very fast drag)
      const a = i === m && m < n ? d : step * i;
      this.send({
        x: this.lastX + ux * a,
        z: this.lastZ + uz * a,
        ground: this.lastG + dg * (a / d),
      });
    }
    const a = m < n ? d : step * m;
    this.lastX += ux * a;
    this.lastZ += uz * a;
    this.lastG += dg * (a / d);
  }

  /** Pointer-up (the move tool drops its prop here). Returns the stroke's command count. */
  end(hit?: EditHit): number {
    if (!this.active) return this.emitted;
    if (this.state.tool === 'move') {
      const h = hit ?? this.endHit;
      if (h && this.ctx.prop) this.send(h);
    }
    this.active = false;
    return this.emitted;
  }

  /** Abort without the move drop (second finger, mode exit). */
  cancel(): void {
    this.active = false;
  }
}
