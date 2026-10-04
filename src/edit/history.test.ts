import { describe, expect, it } from 'vitest';
import { EditHistory } from './history.ts';

/** Commands are strings; the inverse of 'x' is '~x'. */
const inv = (c: string): string[] => [`~${c}`];

describe('EditHistory (TASK-211)', () => {
  it('undo / redo walk the stack; a new push drops the redo tail', () => {
    const h = new EditHistory<string>();
    expect(h.canUndo).toBe(false);
    expect(h.undo()).toBeNull();
    h.push('a', inv('a'));
    h.push('b', inv('b'));
    expect(h.applied()).toEqual(['a', 'b']);
    expect(h.undo()?.inverse).toEqual(['~b']);
    expect(h.applied()).toEqual(['a']);
    expect(h.canRedo).toBe(true);
    expect(h.redo()?.cmds).toEqual(['b']);
    expect(h.redo()).toBeNull();
    h.undo();
    h.undo();
    expect(h.canUndo).toBe(false);
    h.push('c', inv('c'));
    expect(h.canRedo).toBe(false);
    expect(h.applied()).toEqual(['c']);
    expect(h.size).toBe(1);
  });

  it('groups fold into one step with the inverses in reverse order', () => {
    const h = new EditHistory<string>();
    h.push('a', inv('a'));
    h.beginGroup();
    h.push('s1', ['~s1', '~s1b']);
    h.beginGroup(); // nested: same group
    h.push('s2', inv('s2'));
    h.endGroup();
    h.push('s3', inv('s3'));
    expect(h.grouping).toBe(true);
    expect(h.canRedo).toBe(false);
    expect(h.applied()).toEqual(['a', 's1', 's2', 's3']);
    h.endGroup();
    expect(h.size).toBe(2);
    const e = h.undo()!;
    expect(e.cmds).toEqual(['s1', 's2', 's3']);
    expect(e.inverse).toEqual(['~s3', '~s2', '~s1', '~s1b']);
    expect(h.redo()).toBe(e);
    // empty groups leave nothing
    h.beginGroup();
    h.endGroup();
    expect(h.size).toBe(2);
  });

  it('undo inside an open group closes it first', () => {
    const h = new EditHistory<string>();
    h.beginGroup();
    h.push('s1', inv('s1'));
    h.push('s2', inv('s2'));
    expect(h.canUndo).toBe(true);
    expect(h.undo()?.inverse).toEqual(['~s2', '~s1']);
    expect(h.grouping).toBe(false);
    expect(h.applied()).toEqual([]);
  });

  it('setInverse replaces an entry inverse; limit drops the oldest into the log', () => {
    const h = new EditHistory<string>(2);
    h.push('a', inv('a'));
    h.push('b', inv('b'));
    h.push('c', inv('c'));
    expect(h.size).toBe(2);
    expect(h.applied()).toEqual(['a', 'b', 'c']);
    expect(h.dropped).toEqual(['a']);
    const e = h.undo()!;
    h.setInverse(e, ['~c2']);
    h.redo();
    expect(h.undo()?.inverse).toEqual(['~c2']);
    h.clear();
    expect(h.applied()).toEqual([]);
    expect(h.canUndo || h.canRedo).toBe(false);
  });
});
