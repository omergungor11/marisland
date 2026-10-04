/**
 * Phase 2 sandbox tunables (mar-tasks/phases/phase-2.md, TASK-201/202). Data only: brush
 * shape and limits, placement rules for user-placed props, derived-data margins, prop-store
 * headroom and the edit-log codec grid. Engine code (`world/edit.ts`) reads these; it never
 * hard-codes them.
 */
import type { ZonePaint } from '../world/edit-types.ts';
import { Zone, type ZoneId } from '../world/types.ts';
import { PLACEMENT_RULES } from './placement.ts';

export const EDIT_BRUSH = {
  /** Brush radius limits in u (UI slider is 4–40; commands outside are clamped). */
  minRadius: 2,
  maxRadius: 40,
  /**
   * Radial falloff w(t) = (1 − t²)^falloffPower for t = d / r ∈ [0, 1]: 1 at the centre, 0 with
   * zero slope at the rim (no ridge at the brush edge).
   */
  falloffPower: 2,
  /** Max |height change| per cell per command (raise/lower `s` is clamped to it), u. */
  maxDelta: 4,
  /** Flatten: fraction of the gap to the target closed per command at w = 1. */
  flattenRate: 0.5,
  /** Smooth: box kernel half-width in cells (1 → 3×3 mean). */
  smoothKernel: 1,
  /** Height clamp: [SEABED_Y, maxY]. */
  maxY: 60,
} as const;

export const EDIT_DERIVE = {
  /**
   * Cells around an sdf-changed near-shore cell whose chunks are re-meshed too (wet-sand colour,
   * skirts at the waterline). Far-field sdf changes (deep water) only update the textures.
   */
  sdfMargin: 2,
  /** |shoreSdf| (u) below which an sdf change affects terrain vertex colours (wet sand ≤ 3 u). */
  sdfMeshBand: 6,
  /**
   * Height changes reach this many cells into neighbouring vertices: terrain AO horizon
   * (TERRAIN_AO.steps × stepCells = 3) and normals (1). Used for the dirty chunk list.
   */
  renderMarginCells: 3,
} as const;

/** `SDF_MARGIN` of the task spec (cells). */
export const SDF_MARGIN = EDIT_DERIVE.sdfMargin;

/** Zone paint → zone id (land zones only; painting water cells is a no-op). */
export const ZONE_PAINT: Readonly<Record<ZonePaint, ZoneId>> = {
  grass: Zone.grass,
  meadow: Zone.meadow,
  forest: Zone.forest,
  sand: Zone.sandDry,
  rock: Zone.rock,
};
/** Codec order of zone paints (append only). */
export const ZONE_PAINT_ORDER: readonly ZonePaint[] = ['grass', 'meadow', 'forest', 'sand', 'rock'];

/** Max slope per def from the scatter rules (the most permissive rule wins). */
const ruleSlope: Record<string, number> = {};
for (const r of PLACEMENT_RULES) ruleSlope[r.def] = Math.max(ruleSlope[r.def] ?? 0, r.slopeMax);

export const EDIT_PROPS = {
  /**
   * Defs the user may place (TASK-221 picker order). Excluded: `treeBlob` (batcher proxy),
   * `dock` (segment chains), `volcanoCrater` (terrain-bound), `lighthouse` (the beam follows the
   * first lighthouse in the store).
   */
  placeable: [
    'palm',
    'roundTree',
    'pine',
    'giantMushroom',
    'bush',
    'rockCluster',
    'haybale',
    'cropRow',
    'flower',
    'grassTuft',
    'reeds',
    'lilyPad',
    'cottage',
    'towerHouse',
    'logCabin',
    'barn',
    'windmill',
    'marketStall',
    'stiltHut',
    'clocktower',
    'giantTree',
    'hotSpring',
    'well',
    'bench',
    'lanternPost',
    'fence',
    'barrel',
    'crate',
    'bunting',
    'laundryLine',
    'steppingStone',
    'driftwood',
    'shell',
    'starfish',
    'messageBottle',
    'tidePool',
    'rowboat',
    'sailboat',
    'buoy',
    'seaStack',
    'sunkenShip',
  ] as readonly string[],
  /** Sit on the water surface (y = 0); only placeable where the ground is under water. */
  floating: ['lilyPad', 'rowboat', 'sailboat', 'buoy', 'stiltHut'] as readonly string[],
  /** Stand on the seabed or on land (y = heightAt) without the `underwater` flag. */
  seabed: ['seaStack'] as readonly string[],
  /** Only blocked by structures (lots, docks, landmarks), not by footpaths / plaza edges. */
  pathOk: [
    'bench',
    'lanternPost',
    'fence',
    'barrel',
    'crate',
    'bunting',
    'laundryLine',
    'steppingStone',
    'well',
    'marketStall',
  ] as readonly string[],
  /** Max terrain slope (rise/run) per def; defaults to `defaultSlopeMax`. */
  slopeMax: { ...ruleSlope, seaStack: 3 } as Readonly<Record<string, number>>,
  /** Buildings, decor and landmarks without a scatter rule. */
  defaultSlopeMax: 0.45,
  /** Uniform scale clamp for placed props. */
  scaleMin: 0.3,
  scaleMax: 3,
  /** Spare PropStore slots allocated at generation (growth beyond reallocates in place). */
  propHeadroom: 1024,
  /** Highest edit-added slot accepted from a log (guards against hostile URLs). */
  maxEditProps: 20000,
} as const;

/**
 * Edit-log codec (`encodeLog`/`decodeLog`): binary varints → base64url. `applyEdit` snaps every
 * command to this grid first, so a decoded log replays to the identical world.
 */
export const EDIT_CODEC = {
  version: 1,
  /** Position step (u); x/z are stored as round((x + 384) / pos). */
  pos: 1 / 16,
  /** Radius step (u). */
  radius: 1 / 16,
  /** Brush strength / height step (u or blend fraction). */
  strength: 1 / 256,
  /** Rotation steps per turn. */
  rotSteps: 4096,
  /** Scale step. */
  scale: 1 / 256,
} as const;

/** Render-side rebuild constants (TASK-211). */
export const EDIT_RENDER = {
  /** Dirty terrain chunks remeshed per frame in interactive mode (capture drains all at once). */
  chunksPerFrame: 2,
  /** Instanced prop groups grow to `ceil(needed × (1 + batchHeadroom)) + batchMinSpare`. */
  batchHeadroom: 0.25,
  batchMinSpare: 8,
  /**
   * Chunks within this many cells of the dirty bounds are remeshed: the height texture scan
   * reaches 1 cell past the bounds and skirt edge normals read 1 more. Colour changes beyond
   * (AO reach, wet-sand SDF, zones) queue their chunks from the exact changed-texel rect.
   */
  chunkPadCells: 2,
  /**
   * SDF texture: cells around the dirty bounds scanned for changed shore distance (the local EDT
   * of TASK-202 may touch more than the brush footprint). Only changed texels are uploaded.
   */
  sdfScanPad: 48,
  /** Ring-scale field (water bands): cells around the bounds whose nearest coast is re-derived. */
  ringPad: 32,
  /** Extra EDT window around `ringPad` (nearest-coast search radius, cells). */
  ringSearch: 32,
} as const;
