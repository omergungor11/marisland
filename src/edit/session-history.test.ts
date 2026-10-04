import { describe, expect, it } from 'vitest';
import type { EditCommand } from '../world/edit-types.ts';
import { SessionHistory } from './session-history.ts';

const raise = (x: number): EditCommand => ({ k: 'raise', x, z: 0, r: 5, s: 1 });
const inv = (x: number): EditCommand => ({ k: 'lower', x, z: 0, r: 5, s: 1 });

describe('SessionHistory', () => {
  it('returns one entry per command with its own inverse, grouped strokes as one step', () => {
    const h = new SessionHistory();
    h.push(raise(1), [inv(1)]);
    h.beginGroup();
    h.push(raise(2), [inv(2)]);
    h.push(raise(3), [inv(3)]);
    h.endGroup();
    expect(h.canUndo()).toBe(true);
    const step = h.undo();
    expect(step?.map((e) => (e.cmd as { x: number }).x)).toEqual([2, 3]);
    expect(step?.[1].inverse).toEqual([inv(3)]);
    expect(h.redo()?.length).toBe(2);
    expect(h.undo()?.length).toBe(2);
    expect(h.undo()?.length).toBe(1);
    expect(h.undo()).toBeNull();
    h.clear();
    expect(h.canRedo()).toBe(false);
  });
});
