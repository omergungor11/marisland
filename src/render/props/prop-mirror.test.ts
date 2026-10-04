import { describe, expect, it } from 'vitest';
import { createPropStore, PropFlag } from '../../world/prop-store.ts';
import { EDIT_PROP_ID_BASE } from '../../world/edit-types.ts';
import type { Heightfield } from '../../world/types.ts';
import { createPropMirror } from './prop-mirror.ts';

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
});
