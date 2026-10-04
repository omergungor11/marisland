/**
 * Phase 2 edit contract (mar-tasks/phases/phase-2.md). Pure types shared by the edit
 * commands (`world/edit.ts`), the dirty-chunk rebuild (`render/world-view.ts`) and the
 * editor session/UI (`edit/`, `ui/edit-panel.ts`). No three import.
 */

/** Zone paints the brush can apply (subset of `Zone`, land only). */
export type ZonePaint = 'grass' | 'meadow' | 'forest' | 'sand' | 'rock';

export type TerrainBrushKind = 'raise' | 'lower' | 'flatten' | 'smooth';

export type EditCommand =
  | {
      k: TerrainBrushKind;
      /** Brush centre, world xz. */
      x: number;
      z: number;
      /** Radius, world units. */
      r: number;
      /** raise/lower: height delta at the centre; smooth: 0..1 blend; flatten: target height. */
      s: number;
    }
  | { k: 'paint'; x: number; z: number; r: number; zone: ZonePaint }
  | {
      k: 'propAdd';
      /** Assigned by `applyEdit` on first apply (ids ≥ EDIT_PROP_ID_BASE); given on replay/redo. */
      id?: number;
      def: string;
      x: number;
      z: number;
      rotY: number;
      scale: number;
      variant?: number;
    }
  | { k: 'propRemove'; id: number }
  | { k: 'propMove'; id: number; x: number; z: number; rotY: number };

/** Prop ids below this are scatter/settlement props from `WorldData.props`; above: edit-added. */
export const EDIT_PROP_ID_BASE = 1 << 20;

export interface EditLog {
  v: 1;
  seed: number;
  cmds: EditCommand[];
}

/** What a command touched, for the frame-amortised rebuild (ARCHITECTURE Phase 2). */
export interface DirtyRegion {
  /** Chunk ids `cz * CHUNKS_PER_SIDE + cx`, including neighbours whose SDF/skirts changed. */
  chunks: number[];
  /** Inclusive heightfield cell bounds of the touched area (for `texSubImage2D`). */
  minI: number;
  maxI: number;
  minJ: number;
  maxJ: number;
  /** Prop ids whose instance (position / existence / validity) changed. */
  props: number[];
  /** True when `shoreSdf` changed inside the bounds (water + terrain SDF textures need an update). */
  sdf: boolean;
}

export interface EditResult {
  ok: boolean;
  /** Why the command was rejected (placement collision, out of bounds, unknown def…). */
  reason?: string;
  /** Command(s) that undo this one; applied in order. */
  inverse: EditCommand[];
  dirty: DirtyRegion;
}

export const EMPTY_DIRTY: DirtyRegion = {
  chunks: [],
  minI: 0,
  maxI: -1,
  minJ: 0,
  maxJ: -1,
  props: [],
  sdf: false,
};

/** Merge two regions (union of chunks/props, bounding box of cells). */
export function mergeDirty(a: DirtyRegion, b: DirtyRegion): DirtyRegion {
  const chunks = Array.from(new Set([...a.chunks, ...b.chunks])).sort((x, y) => x - y);
  const props = Array.from(new Set([...a.props, ...b.props])).sort((x, y) => x - y);
  const aEmpty = a.maxI < a.minI;
  const bEmpty = b.maxI < b.minI;
  return {
    chunks,
    props,
    sdf: a.sdf || b.sdf,
    minI: aEmpty ? b.minI : bEmpty ? a.minI : Math.min(a.minI, b.minI),
    maxI: aEmpty ? b.maxI : bEmpty ? a.maxI : Math.max(a.maxI, b.maxI),
    minJ: aEmpty ? b.minJ : bEmpty ? a.minJ : Math.min(a.minJ, b.minJ),
    maxJ: aEmpty ? b.maxJ : bEmpty ? a.maxJ : Math.max(a.maxJ, b.maxJ),
  };
}
