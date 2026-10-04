import { describe, expect, it } from 'vitest';
import { createPropStore, PropFlag } from '../../world/prop-store.ts';
import { EDIT_PROP_ID_BASE } from '../../world/edit-types.ts';
import type { Heightfield } from '../../world/types.ts';
import { createPropMirror } from './prop-mirror.ts';
import { PROP_DEF_INDEX } from '../../content/props.ts';
import { EDIT_RENDER } from '../../content/edit.ts';

const flat: Heightfield = { data: new Float32Array(4), n: 2, cellSize: 1, originX: 0, originZ: 0 };

describe('prop mirror', () => {
  it('hides the render instance of an edit slot the world popped (undo of the last propAdd)', () => {
    const world = createPropStore(8);
    world.push(0, 0, 1, 0, 1, 0, 1, 0, 0, 0);
    const render = createPropStore(8);
    render.push(0, 0, 1, 0, 1, 0, 1, 0, 0, 0);
    const m = createPropMirror(render, 1, flat);
    // propAdd → world slot 1 (id BASE + 0)
    world.push(2, 0, 5, 0, 5, 0, 1, 0, 0, 0);
    const added = m.sync(world, [EDIT_PROP_ID_BASE]);
    expect(added).toEqual([1]);
    expect(render.count).toBe(2);
    expect(render.defId[1]).toBe(2);
    // undo pops the slot
    world.count = 1;
    const popped = m.sync(world, [EDIT_PROP_ID_BASE]);
    expect(popped).toEqual([1]);
    expect(render.flags[1] & PropFlag.removed).not.toBe(0);
    // redo re-pushes the same slot: flags come back from the world (not removed)
    world.push(2, 0, 5, 0, 5, 0, 1, 0, 0, 0);
    const redone = m.sync(world, [EDIT_PROP_ID_BASE]);
    expect(redone).toEqual([1]);
    expect(render.flags[1] & PropFlag.removed).toBe(0);
  });

  it('maps edit ids through the world editBase when a boot log appended props (TASK-213)', () => {
    // world: 2 scatter props (editBase 2) + 1 edit-added at boot (index 2, id BASE + 0)
    const world = createPropStore(8);
    for (let k = 0; k < 3; k++) world.push(0, 0, k, 0, k, 0, 1, 0, 0, 0);
    world.editBase = 2;
    // render store: the 3 world props + 2 settlement props
    const render = createPropStore(8);
    for (let k = 0; k < 5; k++) render.push(1, 0, k, 0, k, 0, 1, 0, 0, 0);
    const m = createPropMirror(render, 3, flat, 2);
    expect(m.idOf(0)).toBe(0);
    expect(m.idOf(1)).toBe(1);
    expect(m.idOf(2)).toBe(EDIT_PROP_ID_BASE); // boot-replayed edit prop
    expect(m.idOf(3)).toBe(-1); // settlement: render-only
    expect(m.indexOf(EDIT_PROP_ID_BASE)).toBe(2);
    expect(m.indexOf(3)).toBe(-1); // not a scatter id (≥ editBase)
    // a live propAdd → world slot 3 = id BASE + 1 (NOT base + 1 = 4)
    world.push(2, 0, 9, 0, 9, 0, 1, 0, 0, 0);
    const [r] = m.sync(world, [EDIT_PROP_ID_BASE + 1]);
    expect(r).toBe(5);
    expect(render.x[5]).toBe(9);
    expect(m.idOf(5)).toBe(EDIT_PROP_ID_BASE + 1);
    expect(m.indexOf(EDIT_PROP_ID_BASE + 1)).toBe(5);
    // moving the boot edit prop syncs its own render slot
    world.x[2] = 7;
    expect(m.sync(world, [EDIT_PROP_ID_BASE])).toEqual([2]);
    expect(render.x[2]).toBe(7);
    // undo of the live add pops world slot 3 → render slot 5 hidden
    world.count = 3;
    expect(m.sync(world, [EDIT_PROP_ID_BASE + 1])).toEqual([5]);
    expect(render.flags[5] & PropFlag.removed).not.toBe(0);
  });

  describe('flooding (sweep D1)', () => {
    const grid = (v: number): Heightfield => ({
      data: new Float32Array(25).fill(v),
      n: 5,
      cellSize: 1,
      originX: 0,
      originZ: 0,
    });
    /** house + decor (lot 0), pier segment + root lantern (dock 0), bench, lighthouse. */
    const settlement = (h: Heightfield) => {
      const r = createPropStore(8);
      const y = (x: number, z: number) => h.data[z * h.n + x];
      r.push(PROP_DEF_INDEX.cottage, 0, 1, y(1, 1), 1, 0, 1, 0, 0, 0); // 0
      r.push(PROP_DEF_INDEX.barrel, 0, 2, y(2, 1), 1, 0, 1, 0, 0, 0); // 1
      r.push(PROP_DEF_INDEX.dock, 0, 1, 0, 3, 0, 1, 0, 0, 0); // 2 (planks at the waterline)
      r.push(PROP_DEF_INDEX.lanternPost, 0, 2, y(2, 3), 3, 0, 1, 0, 0, 0); // 3
      r.push(PROP_DEF_INDEX.bench, 0, 3, y(3, 3), 3, 0, 1, 0, 0, 0); // 4
      r.push(PROP_DEF_INDEX.lighthouse, 0, 3, y(3, 1), 1, 0, 1, 0, 0, 0); // 5
      return r;
    };
    const groups = {
      lots: [{ x: 1, z: 1, members: [0, 1] }],
      docks: [{ x: 2, z: 3, members: [2, 3] }],
    };
    const removed = (r: ReturnType<typeof settlement>) =>
      Array.from({ length: r.count }, (_, i) => (r.flags[i] & PropFlag.removed ? 1 : 0));

    it('hides lots, piers and props whose ground sinks under the flood level; undo restores', () => {
      const h = grid(1);
      const r = settlement(h);
      const m = createPropMirror(r, 0, h, 0, groups);
      expect(removed(r)).toEqual([0, 0, 0, 0, 0, 0]);
      h.data.fill(EDIT_RENDER.floodLevel - 0.5);
      const changed = m.reground(0, 4, 0, 4);
      // every settlement prop re-grounded or hidden (the planks only through their pier)
      expect(changed).toEqual([0, 1, 2, 3, 4, 5]);
      // lighthouse never floods (beam); everything else hides
      expect(removed(r)).toEqual([1, 1, 1, 1, 1, 0]);
      expect([...m.floodedLots]).toEqual([0]);
      expect([...m.floodedDocks]).toEqual([0]);
      h.data.fill(1);
      m.reground(0, 4, 0, 4);
      expect(removed(r)).toEqual([0, 0, 0, 0, 0, 0]);
      expect(m.floodedLots.size + m.floodedDocks.size).toBe(0);
      expect(r.y[0]).toBe(1);
    });

    it('a lot hides as one unit; side decor also hides on its own ground', () => {
      const h = grid(1);
      const r = settlement(h);
      const m = createPropMirror(r, 0, h, 0, groups);
      // only the decor's cell floods: the decor goes, the house stays
      h.data[1 * 5 + 2] = -2;
      m.reground(2, 2, 1, 1);
      expect(removed(r).slice(0, 2)).toEqual([0, 1]);
      expect(m.floodedLots.size).toBe(0);
      // the house's cell floods too: the whole lot is hidden
      h.data[1 * 5 + 1] = -2;
      m.reground(1, 1, 1, 1);
      expect(removed(r).slice(0, 2)).toEqual([1, 1]);
      // raising the house's ground back: the decor stays hidden on its own flooded cell
      h.data[1 * 5 + 1] = 1;
      m.reground(1, 1, 1, 1);
      expect(removed(r).slice(0, 2)).toEqual([0, 1]);
    });

    it('a pier is hidden by its root only; units built under water never flood', () => {
      const h = grid(1);
      const r = settlement(h);
      const m = createPropMirror(r, 0, h, 0, groups);
      h.data[3 * 5 + 2] = -2; // the root (and the lantern on it)
      m.reground(2, 2, 3, 3);
      expect(removed(r).slice(2, 4)).toEqual([1, 1]);
      expect([...m.floodedDocks]).toEqual([0]);
      // a pier whose root was already in the sea at generation is not a flood unit
      const h2 = grid(1);
      h2.data[3 * 5 + 2] = -2;
      const r2 = settlement(h2);
      const m2 = createPropMirror(r2, 0, h2, 0, groups);
      expect(removed(r2)).toEqual([0, 0, 0, 0, 0, 0]);
      h2.data[3 * 5 + 2] = -3;
      m2.reground(0, 4, 0, 4);
      expect(removed(r2).slice(2, 4)).toEqual([0, 0]);
    });

    it('a world flooded before the build (?edit= replay) starts hidden against the generated ground', () => {
      const h0 = grid(1);
      const h = grid(-2);
      const r = settlement(h); // props placed on the edited (sunk) ground
      createPropMirror(r, 0, h, 0, groups, h0);
      expect(removed(r)).toEqual([1, 1, 1, 1, 1, 0]);
    });
  });
});
