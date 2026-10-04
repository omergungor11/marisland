import { heightAt, type Heightfield } from '../../world/types.ts';
import { EDIT_PROP_ID_BASE } from '../../world/edit-types.ts';
import { PropFlag, type PropStore } from '../../world/prop-store.ts';
import { EDIT_RENDER } from '../../content/edit.ts';
import { PROP_DEFS } from '../../content/props.ts';

/** A lot or pier that floods as one unit (sweep D1). */
export interface FloodGroup {
  /** Anchor: lot centre / pier root. */
  x: number;
  z: number;
  /** Render indices of the unit (a lot's building first). */
  members: readonly number[];
}

export interface FloodGroups {
  lots: readonly FloodGroup[];
  docks: readonly FloodGroup[];
}

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
 * Flooding (sweep D1): a ground-following settlement prop whose ground sinks below
 * `EDIT_RENDER.floodLevel` is flagged `PropFlag.removed` (the batcher fades it out; lantern
 * pools and contact blobs follow the flag) and un-flagged when the ground comes back up (undo).
 * Lots and piers go as one unit (`FloodGroup`): a lot is flooded when the ground under its
 * centre is, a pier when the ground at its shore root is — then every member hides (house +
 * side decor; plank segments + cargo + root lantern), whatever its own ground. Only props / groups
 * that stood above the flood level at build can flood (sunken ship, beach huts on stilts, piers
 * built from the water stay), and `EDIT_RENDER.floodKeep` defs never do.
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
  /**
   * Re-ground ground-following settlement props inside the cell bounds and re-derive the flood
   * state of the props / lots / piers there; returns changed indices (moved, hidden, restored).
   */
  reground(minI: number, maxI: number, minJ: number, maxJ: number): number[];
  /** Lots (indices into `world.lots`) currently hidden by flooding. */
  readonly floodedLots: ReadonlySet<number>;
  /** Piers (indices into `world.docks`) currently hidden by flooding. */
  readonly floodedDocks: ReadonlySet<number>;
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
  groups: FloodGroups = { lots: [], docks: [] },
  /** Generated (pre-`?edit=`) ground: what stood above the flood level there can flood. */
  h0: Heightfield = h,
): PropMirror {
  const settled = render.count;
  const n = Math.max(0, settled - base);
  const flood = EDIT_RENDER.floodLevel;
  const keep = new Set(EDIT_RENDER.floodKeep);
  // ground-following settlement props (decor, lots, landmarks placed at heightAt)
  const follow = new Uint8Array(n);
  /** Own flood test applies: follows the ground, stood above the flood level at build. */
  const floodable = new Uint8Array(n);
  for (let i = base; i < settled; i++) {
    const on = Math.abs(render.y[i] - heightAt(h, render.x[i], render.z[i])) < 1e-3;
    follow[i - base] = on ? 1 : 0;
    const def = PROP_DEFS[render.defId[i]];
    const y0 = heightAt(h0, render.x[i], render.z[i]);
    floodable[i - base] = on && y0 >= flood && def && !keep.has(def.id) ? 1 : 0;
  }
  // flood units: lots (whose building follows the ground) and piers, anchored above the level
  interface Unit {
    kind: 0 | 1;
    index: number;
    x: number;
    z: number;
    members: readonly number[];
    hidden: boolean;
  }
  const units: Unit[] = [];
  /** Settlement index − base → unit (−1: none). */
  const unitOf = new Int32Array(n).fill(-1);
  const addUnits = (list: readonly FloodGroup[], kind: 0 | 1): void =>
    list.forEach((g, index) => {
      const lead = g.members[0];
      if (lead === undefined || lead < base || lead >= settled) return;
      if (kind === 0 && !floodable[lead - base]) return; // stilt huts, kept defs
      if (heightAt(h0, g.x, g.z) < flood) return;
      const u = units.length;
      units.push({ kind, index, x: g.x, z: g.z, members: g.members, hidden: false });
      for (const r of g.members) if (r >= base && r < settled) unitOf[r - base] = u;
    });
  addUnits(groups.lots, 0);
  addUnits(groups.docks, 1);
  const floodedLots = new Set<number>();
  const floodedDocks = new Set<number>();
  /** Hidden by flooding: own ground or its unit. */
  const hiddenNow = (i: number): boolean => {
    const u = unitOf[i - base];
    if (u >= 0 && units[u].hidden) return true;
    return floodable[i - base] === 1 && render.y[i] < flood;
  };
  /** Write the removed flag of settlement index `i` from its flood state; true when it changed. */
  const applyFlag = (i: number): boolean => {
    const was = (render.flags[i] & PropFlag.removed) !== 0;
    const now = hiddenNow(i);
    if (was === now) return false;
    if (now) render.flags[i] |= PropFlag.removed;
    else render.flags[i] &= ~PropFlag.removed;
    return true;
  };
  /** Re-test unit `u` against the current ground; true when its state flipped. */
  const testUnit = (u: Unit): boolean => {
    const hidden = heightAt(h, u.x, u.z) < flood;
    if (hidden === u.hidden) return false;
    u.hidden = hidden;
    const set = u.kind === 0 ? floodedLots : floodedDocks;
    if (hidden) set.add(u.index);
    else set.delete(u.index);
    return true;
  };
  // a world edited before the build (`?edit=` replay) starts with its flooded units hidden
  for (const u of units) testUnit(u);
  for (let i = base; i < settled; i++) applyFlag(i);
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
    floodedLots,
    floodedDocks,
    reground(minI, maxI, minJ, maxJ) {
      const out: number[] = [];
      if (maxI < minI || maxJ < minJ) return out;
      const x0 = h.originX + minI * h.cellSize;
      const x1 = h.originX + maxI * h.cellSize;
      const z0 = h.originZ + minJ * h.cellSize;
      const z1 = h.originZ + maxJ * h.cellSize;
      const inside = (x: number, z: number): boolean => x >= x0 && x <= x1 && z >= z0 && z <= z1;
      const touched = new Set<number>();
      for (let i = base; i < settled; i++) {
        if (!follow[i - base]) continue;
        const x = render.x[i];
        const z = render.z[i];
        if (!inside(x, z)) continue;
        const y = Math.fround(heightAt(h, x, z));
        if (y === render.y[i]) continue;
        render.y[i] = y;
        touched.add(i);
      }
      // units whose anchor lies in the bounds: re-test, then every member re-derives its flag
      const recheck = new Set<number>(touched);
      for (const u of units) {
        if (!inside(u.x, u.z) || !testUnit(u)) continue;
        for (const r of u.members) if (r >= base && r < settled) recheck.add(r);
      }
      for (const i of recheck) if (applyFlag(i)) touched.add(i);
      for (const i of touched) out.push(i);
      out.sort((a, b) => a - b);
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
