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
});
