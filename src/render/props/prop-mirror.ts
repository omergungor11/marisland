import { heightAt, type Heightfield } from '../../world/types.ts';
import { EDIT_PROP_ID_BASE } from '../../world/edit-types.ts';
import { PropFlag, type PropStore } from '../../world/prop-store.ts';

/**
 * The batcher draws a render-side PropStore: a copy of `world.props` (indices 0 … base − 1 map
 * 1:1) followed by the settlement props (`appendSettlementProps`). Edits change `world.props`
 * (TASK-201 appends edit-added props to it), so after an edit the touched world indices are
 * copied over here; world indices ≥ base (edit-added after the build) get render slots appended
 * at the end (the typed arrays grow in place — the batcher and picking keep the same store
 * object).
 *
 * Settlement props are render-only: the ones that sat on the ground at build time (y =
 * heightAt) follow terrain edits through `reground`.
 *
 * Ids (TASK-213): the edit model names props by id — scatter props by their world index
 * (< `editBase`), edit-added props `EDIT_PROP_ID_BASE + k` at world index `editBase + k`
 * (`world/edit.ts` `propIndexOf` / `propIdAt`). `editBase` is the world store's own (set at
 * generation) and differs from `base` when a `?edit=` log appended props before the build.
 * `idOf` / `indexOf` translate between ids and render indices (picking ↔ edit tools).
 */
export interface PropMirror {
  /** `world.props.count` when the render store was built. */
  readonly base: number;
  /** First edit-added world index (`world.props.editBase`). */
  readonly editBase: number;
  /**
   * Copy world store entries `ids` (edit-model prop ids, see above) into the render store;
   * returns their render indices.
   */
  sync(world: PropStore, ids: readonly number[]): number[];
  /** Re-ground ground-following settlement props inside the cell bounds; returns changed indices. */
  reground(minI: number, maxI: number, minJ: number, maxJ: number): number[];
  /** Edit-model prop id of render index `r`; −1 for render-only (settlement) props. */
  idOf(r: number): number;
  /** Render index of edit-model prop id `id`; −1 when it has no render slot. */
  indexOf(id: number): number;
}

const FIELDS = [
  'defId',
  'variant',
  'x',
  'y',
  'z',
  'rotY',
  'scale',
  'islandId',
  'chunkId',
  'flags',
] as const;

/** Grow every typed array of `s` to `cap` entries (same object; contents kept). */
export function growStoreInPlace(s: PropStore, cap: number): void {
  if (s.x.length >= cap) return;
  for (const f of FIELDS) {
    const old = s[f];
    const next = new (old.constructor as new (n: number) => typeof old)(cap);
    next.set(old as never);
    (s as unknown as Record<string, unknown>)[f] = next;
  }
}

/**
 * @param base `world.props.count` at build (render indices below it are world indices).
 * @param editBase `world.props.editBase` (defaults to `base`: no edit-added props at build).
 */
export function createPropMirror(
  render: PropStore,
  base: number,
  h: Heightfield,
  editBase: number = base,
): PropMirror {
  const settled = render.count;
  // ground-following settlement props (decor, lots, landmarks placed at heightAt)
  const follow = new Uint8Array(Math.max(0, settled - base));
  for (let i = base; i < settled; i++)
    follow[i - base] = Math.abs(render.y[i] - heightAt(h, render.x[i], render.z[i])) < 1e-3 ? 1 : 0;
  /** World index (≥ base) → render slot appended after the settlement props. */
  const editSlot = new Map<number, number>();
  /** Render slot → world index, for the appended slots. */
  const slotWorld = new Map<number, number>();
  const worldIndexOf = (id: number): number =>
    id >= EDIT_PROP_ID_BASE ? editBase + (id - EDIT_PROP_ID_BASE) : id < editBase ? id : -1;
  const renderIndexOf = (w: number): number => {
    if (w < base) return w;
    let r = editSlot.get(w);
    if (r === undefined) {
      if (render.count >= render.x.length)
        growStoreInPlace(render, Math.ceil(render.count * 1.25) + 64);
      r = render.count++;
      editSlot.set(w, r);
      slotWorld.set(r, w);
    }
    return r;
  };
  return {
    base,
    editBase,
    sync(world, ids) {
      const out: number[] = [];
      for (const id of ids) {
        const w = worldIndexOf(id);
        if (w < 0) continue;
        if (w >= world.count) {
          // the world popped this edit slot (undo of the last propAdd): hide its render instance
          const r = w < base ? w : editSlot.get(w);
          if (r === undefined) continue;
          render.flags[r] |= PropFlag.removed;
          out.push(r);
          continue;
        }
        const r = renderIndexOf(w);
        for (const f of FIELDS) render[f][r] = world[f][w];
        out.push(r);
      }
      return out;
    },
    reground(minI, maxI, minJ, maxJ) {
      const out: number[] = [];
      if (maxI < minI || maxJ < minJ) return out;
      const x0 = h.originX + minI * h.cellSize;
      const x1 = h.originX + maxI * h.cellSize;
      const z0 = h.originZ + minJ * h.cellSize;
      const z1 = h.originZ + maxJ * h.cellSize;
      for (let i = base; i < settled; i++) {
        if (!follow[i - base]) continue;
        const x = render.x[i];
        const z = render.z[i];
        if (x < x0 || x > x1 || z < z0 || z > z1) continue;
        const y = Math.fround(heightAt(h, x, z));
        if (y === render.y[i]) continue;
        render.y[i] = y;
        out.push(i);
      }
      return out;
    },
    idOf(r) {
      if (r < 0) return -1;
      const w = r < base ? r : slotWorld.get(r);
      if (w === undefined) return -1;
      return w < editBase ? w : EDIT_PROP_ID_BASE + (w - editBase);
    },
    indexOf(id) {
      if (!Number.isInteger(id)) return -1;
      const w = worldIndexOf(id);
      if (w < 0) return -1;
      if (w < base) return w;
      return editSlot.get(w) ?? -1;
    },
  };
}
