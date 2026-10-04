/**
 * Sandbox editor UI numbers (phase-2 TASK-212): tool defaults, stroke sampling, brush cursor and
 * ghost-preview look, autosave. Pure data — `edit/` reads these, it never hard-codes them.
 * (Brush falloff / max delta per command live with the edit commands in `content/edit.ts`.)
 */
import type { ZonePaint } from '../world/edit-types.ts';
import { FOLIAGE, GRASS, ROCK, SAND } from './palette.ts';

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

/**
 * Edit panel (TASK-221, `ui/edit-panel.ts`): tool labels and hints, zone swatches, footer text,
 * share toast, reset confirm. Swatch colours are the terrain palette's zone colours.
 */
export const EDIT_PANEL = {
  tools: {
    raise: { label: 'Raise', hint: 'Drag on the land to raise it' },
    lower: { label: 'Lower', hint: 'Drag to dig · below sea level it floods' },
    flatten: { label: 'Flatten', hint: 'Drag from the height you want to keep' },
    smooth: { label: 'Smooth', hint: 'Drag to soften slopes' },
    paint: { label: 'Paint', hint: 'Drag to paint the ground' },
    prop: { label: 'Place', hint: 'Tap to place' },
    erase: { label: 'Erase', hint: 'Tap a prop to remove it' },
    move: { label: 'Move', hint: 'Drag a prop to a new spot' },
  } as Readonly<Record<EditToolKind, { label: string; hint: string }>>,
  /** Hint while no tool is selected (tap the active tool again to look around). */
  idleHint: 'Drag to look around · pick a tool',
  zones: [
    { id: 'grass', label: 'Grass', color: GRASS[2] },
    { id: 'meadow', label: 'Meadow', color: GRASS[0] },
    { id: 'forest', label: 'Forest', color: FOLIAGE.deciduous[2] },
    { id: 'sand', label: 'Sand', color: SAND.dry },
    { id: 'rock', label: 'Rock', color: ROCK[1] },
  ] as readonly { id: ZonePaint; label: string; color: string }[],
  /** Slider labels; strength is shown as a percentage. */
  radiusLabel: 'Size',
  strengthLabel: 'Strength',
  /** Footer: title while unedited, badge `edited · N changes` once the log has commands. */
  title: 'Sandbox',
  badge: (n: number): string => `edited · ${n} ${n === 1 ? 'change' : 'changes'}`,
  tips: {
    undo: 'Undo · Ctrl Z',
    redo: 'Redo · Shift Ctrl Z',
    share: 'Copy share link',
    reset: 'Reset all edits',
    done: 'Done · E',
    edit: 'Edit · E',
  },
  doneLabel: 'Done',
  /** Share: toast text and how long it stays (ms); the prompt fallback when the clipboard fails. */
  copied: 'Link copied',
  copyPrompt: 'Copy this link',
  toastMs: 1800,
  /** Prop thumbnails render this long after the panel first opens (ms; the place tool: at once). */
  thumbsDelayMs: 400,
  /** Reset asks for a second tap within this long (ms). */
  resetConfirm: 'Reset all?',
  resetArmMs: 3000,
  /** Capture (`freeze=1`, `panel=edit`): the tool shown when `panel=edit:<tool>` gives none. */
  captureTool: 'raise' as EditToolKind,
} as const;

/**
 * Prop-picker thumbnails (TASK-221): every placeable def rendered once through the prop material
 * into a small offscreen WebGL canvas (neutral daylight, no fog / night / weather), cached as
 * PNG data URLs. Fixed geometry seed so the cache is shared by every world.
 */
export const EDIT_THUMBS = {
  /** Thumbnail size (px, square) and atlas columns of the offscreen canvas. */
  size: 64,
  cols: 8,
  seed: 1001,
  variant: 0,
  /** Camera: vertical FOV, yaw (deg, from +z toward +x) and pitch (deg above horizontal). */
  fov: 30,
  yaw: 35,
  pitch: 24,
  /** Bounding-sphere fill of the frame (1 = touching the edges). */
  fill: 0.92,
  sun: { color: '#FFF6E5', intensity: 3, dir: [0.6, 1, 0.8] as const },
  hemi: { sky: '#CFEAFF', ground: '#B9D08A', intensity: 1.2 },
  /** Rim (fresnel) colour while the thumbnails render. */
  horizon: '#CFEAFF',
} as const;
