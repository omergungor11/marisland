import { describe, expect, it } from 'vitest';
import type { DirtyRegion, EditCommand, EditLog } from '../world/edit-types.ts';
import { EMPTY_DIRTY } from '../world/edit-types.ts';
import type { WorldData } from '../world/types.ts';
import { createEditApplier } from './apply.ts';
import { adaptWorldEditModule, loadWorldEditApi, type WorldEditApi } from './world-edit-api.ts';

/** A fake edit model: the "world" is one number; raise adds `s`, lower subtracts it. */
type FakeWorld = WorldData & { v: number };
const fakeWorld = (seed: number): FakeWorld => ({ seed, v: 0 }) as unknown as FakeWorld;
const dirtyFor = (c: number): DirtyRegion => ({ ...EMPTY_DIRTY, chunks: [c] });
const raise = (s: number): EditCommand => ({ k: 'raise', x: 0, z: 0, r: 4, s });

function fakeApi(): WorldEditApi & { replays: EditLog[] } {
  const api = {
    replays: [] as EditLog[],
    applyEdit(world: WorldData, cmd: EditCommand) {
      const w = world as FakeWorld;
      if (cmd.k !== 'raise' && cmd.k !== 'lower')
        return { ok: false, reason: 'unsupported', inverse: [], dirty: EMPTY_DIRTY };
      const d = cmd.k === 'raise' ? cmd.s : -cmd.s;
      w.v += d;
      const inv: EditCommand = { ...cmd, k: cmd.k === 'raise' ? 'lower' : 'raise' };
      return { ok: true, inverse: [inv], dirty: dirtyFor(Math.abs(d)) };
    },
    replay(world: WorldData, log: EditLog): DirtyRegion {
      api.replays.push(log);
      for (const c of log.cmds) api.applyEdit(world, c);
      return EMPTY_DIRTY;
    },
    encodeLog: (log: EditLog) => JSON.stringify(log),
    decodeLog: (s: string) => JSON.parse(s) as EditLog,
  };
  return api;
}

describe('edit applier (TASK-211)', () => {
  it('replays ?edit= before the build, then applies, undoes and redoes through the history', () => {
    const api = fakeApi();
    const boot: EditLog = { v: 1, seed: 7, cmds: [raise(5)] };
    const ed = createEditApplier(api, { seed: 7, encoded: api.encodeLog(boot), warn: () => {} });
    const w = fakeWorld(7);
    ed.beforeBuild(w);
    expect(w.v).toBe(5);
    const rebuilt: DirtyRegion[] = [];
    ed.attach({ world: w, rebuildDirty: (r) => rebuilt.push(r) });
    expect(ed.apply(raise(2)).ok).toBe(true);
    expect(ed.apply(raise(3)).ok).toBe(true);
    expect(w.v).toBe(10);
    expect(rebuilt.map((r) => r.chunks[0])).toEqual([2, 3]);
    expect(ed.log().cmds).toEqual([raise(5), raise(2), raise(3)]);
    expect(ed.undo()).toBe(true);
    expect(w.v).toBe(7);
    expect(ed.log().cmds).toHaveLength(2);
    expect(ed.redo()).toBe(true);
    expect(w.v).toBe(10);
    expect(ed.undo() && ed.undo()).toBe(true);
    expect(w.v).toBe(5);
    expect(ed.undo()).toBe(false); // the boot log is not undoable
    expect(rebuilt).toHaveLength(6);
    // rejected commands leave no history
    expect(ed.apply({ k: 'propRemove', id: 1 }).ok).toBe(false);
    expect(ed.history.size).toBe(0);
  });

  it('context restore replays the whole log; a new seed clears it', () => {
    const api = fakeApi();
    const ed = createEditApplier(api, { seed: 7, encoded: '' });
    const w = fakeWorld(7);
    ed.beforeBuild(w);
    expect(api.replays).toHaveLength(0);
    ed.attach({ world: w, rebuildDirty: () => {} });
    ed.apply(raise(4));
    const restored = fakeWorld(7);
    ed.beforeBuild(restored);
    expect(restored.v).toBe(4);
    const other = fakeWorld(8);
    ed.beforeBuild(other);
    expect(other.v).toBe(0);
    expect(ed.log()).toEqual({ v: 1, seed: 8, cmds: [] });
  });

  it('ignores logs for another seed and works without the edit model', () => {
    const api = fakeApi();
    const warns: string[] = [];
    const ed = createEditApplier(api, {
      seed: 7,
      encoded: api.encodeLog({ v: 1, seed: 9, cmds: [raise(1)] }),
      warn: (m) => warns.push(m),
    });
    const w = fakeWorld(7);
    ed.beforeBuild(w);
    expect(w.v).toBe(0);
    expect(warns).toHaveLength(1);
    const none = createEditApplier(null, { seed: 7, encoded: 'xyz', warn: (m) => warns.push(m) });
    expect(none.available).toBe(false);
    none.attach({ world: w, rebuildDirty: () => {} });
    expect(none.apply(raise(1))).toMatchObject({ ok: false, reason: 'edit api unavailable' });
    expect(none.undo()).toBe(false);
    expect(warns).toHaveLength(2);
  });
});

describe('world edit api loader', () => {
  it('adapts a module with the required exports, rejects others', () => {
    const api = fakeApi();
    expect(adaptWorldEditModule(api)).not.toBeNull();
    expect(adaptWorldEditModule({ ...api, replay: undefined })).toBeNull();
    expect(adaptWorldEditModule(null)).toBeNull();
    const withCanPlace = adaptWorldEditModule({ ...api, canPlace: () => true });
    expect(withCanPlace?.canPlace).toBeTypeOf('function');
  });

  it('resolves to the module when world/edit.ts is built in, else null', async () => {
    const a = await loadWorldEditApi();
    expect(a === null || typeof a.applyEdit === 'function').toBe(true);
    expect(await loadWorldEditApi()).toBe(a); // cached
  });
});
