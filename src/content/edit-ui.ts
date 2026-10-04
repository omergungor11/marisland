/**
 * Sandbox editor UI numbers (phase-2 TASK-212): tool defaults, stroke sampling, brush cursor and
 * ghost-preview look, autosave. Pure data — `edit/` reads these, it never hard-codes them.
 * (Brush falloff / max delta per command live with the edit commands in `content/edit.ts`.)
 */
import type { ZonePaint } from '../world/edit-types.ts';

export type EditToolKind =
  'raise' | 'lower' | 'flatten' | 'smooth' | 'paint' | 'prop' | 'erase' | 'move';

export const EDIT_TOOLS: readonly EditToolKind[] = [
  'raise',
  'lower',
  'flatten',
  'smooth',
  'paint',
  'prop',
  'erase',
  'move',
];

/** Terrain brushes: a stroke emits one command per sample. */
export const BRUSH_TOOLS: readonly EditToolKind[] = [
  'raise',
  'lower',
  'flatten',
  'smooth',
  'paint',
];

export const EDIT_UI = {
  /** Brush radius (u): slider range, default, `[` / `]` step. */
  radius: { min: 4, max: 40, initial: 10, step: 2 },
  /** Brush strength 0..1 (slider), default. */
  strength: { min: 0.05, max: 1, initial: 0.5 },
  /** A stroke emits a sample each time the terrain hit moved ≥ radius × this. */
  sampleSpacing: 0.35,
  /** A fast drag fills the gap with at most this many samples per pointer move. */
  maxSamplesPerMove: 8,
  /** raise / lower: height delta at the brush centre per sample at strength 1 (u). */
  brushDelta: 1.2,
  /** smooth: blend per sample at strength 1. */
  smoothBlend: 0.6,
  /** Prop placement: uniform scale range drawn from the label-forked rng. */
  propScale: [0.85, 1.15] as const,
  initialTool: 'raise' as EditToolKind,
  initialZone: 'meadow' as ZonePaint,
  initialDef: 'pine',
  /** Autosave debounce (ms) and localStorage key `<prefix><seed>.v<version>`. */
  autosaveMs: 500,
  storagePrefix: 'marisland.edit.',
  storageVersion: 1,
  /** Share URL query parameter. */
  urlParam: 'edit',
  /** Ring radius (u) for the pointer tools (erase / move). */
  pointerRing: 1.5,
  /** Prop tool: ring = def footprint × placement scale × this (the contact-blob size). */
  propRingScale: 1.6,
  /** Ring opacity (strength) for the prop / pointer tools. */
  propRingStrength: 0.6,
  /** Cursor ray-march rate (Hz). */
  cursorHz: 60,
  /** Cursor radius follows `[` / `]` with this damping (1/s); instant under reduced motion. */
  cursorRadiusLambda: 16,
  keys: { toggle: 'e', radiusDown: '[', radiusUp: ']', exit: 'Escape' },
} as const;

/**
 * Brush ring decal (terrain material `uBrush`): a soft band `width` heightfield cells wide at the
 * radius over a faint fill. Colours are bible creams / the coral roof red; alpha by strength.
 */
export const BRUSH_RING = {
  color: '#FFF6E5',
  invalid: '#E8735A',
  /** Band width in heightfield cells… */
  widthCells: 1,
  /** …but at most this fraction of the radius (small prop-footprint rings). */
  maxWidthOfRadius: 0.35,
  /** Ring opacity at strength 0 → 1. */
  alpha: [0.55, 0.9] as const,
  /** Inner fill opacity. */
  fill: 0.1,
  /** Darkening of the soft rim either side of the band (contrast on sand). */
  outline: 0.22,
  /** Colour scale (keeps the ring under the bloom threshold). */
  brightness: 0.8,
} as const;

/** Ghost preview of the selected prop (dithered through the shared lit program). */
export const GHOST = {
  /** Dither coverage (the factory's `vFade`). */
  alpha: 0.5,
  /** Additive tint (Lambert `emissive`) and diffuse multiplier when placement is valid… */
  validEmissive: '#2A3A44',
  validColor: '#FFFFFF',
  /** …and when it is not. */
  invalidEmissive: '#B8321F',
  invalidColor: '#FF9C8C',
} as const;
