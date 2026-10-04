import { describe, expect, it } from 'vitest';
import type { DirtyRegion, EditCommand } from '../world/edit-types.ts';
import { EDIT_PROP_ID_BASE } from '../world/edit-types.ts';
import { createEditSession, editLogFromUrl, editStorageKey } from './session.ts';
import type { SessionEvent } from './session-types.ts';
import { FakeHistory, FakeWorld, ManualTimer, MapStorage, decode, encode } from './test-fakes.ts';
import { EDIT_UI } from '../content/edit-ui.ts';

const SEED = 1001;

function setup(storage: MapStorage | null = new MapStorage()) {
  const world = new FakeWorld();
  const history = new FakeHistory();
  const timer = new ManualTimer();
  const rebuilds: DirtyRegion[] = [];
  const events: SessionEvent[] = [];
  let resets = 0;
  const session = createEditSession({
    seed: SEED,
    apply: world.apply,
    rebuild: (r) => rebuilds.push(r),
    history,
    encode,
    decode,
    storage,
    timer,
    now: () => 1234,
    resetWorld: () => {
      resets++;
      world.heights.clear();
      world.props.clear();
    },
  });
  session.subscribe((e) => events.push(e));
  return { world, history, timer, rebuilds, events, session, storage, resets: () => resets };
}

const raise = (x: number, s = 1): EditCommand => ({ k: 'raise', x, z: 0, r: 8, s });
const pine = (x: number): EditCommand => ({
  k: 'propAdd',
  def: 'pine',
  x,
  z: 5,
  rotY: 0.5,
  scale: 1,
});

describe('EditSession stack', () => {
  it('applies, logs and rebuilds the dirty region', () => {
    const { session, rebuilds, events, world } = setup();
    const r = session.apply(raise(1));
    expect(r.ok).toBe(true);
    expect(session.count).toBe(1);
    expect(session.log).toEqual({ v: 1, seed: SEED, cmds: [raise(1)] });
    expect(rebuilds).toHaveLength(1);
    expect(rebuilds[0].chunks).toEqual([0]);
    expect(world.heights.get('1,0')).toBe(1);
    expect(events.at(-1)).toMatchObject({ type: 'applied', count: 1 });
    expect(session.canUndo()).toBe(true);
    expect(session.canRedo()).toBe(false);
  });

  it('does not log rejected commands and reports them to subscribers', () => {
    const { session, rebuilds, events, history } = setup();
    session.apply(raise(1));
    const r = session.apply(pine(-3));
    expect(r.ok).toBe(false);
    expect(session.count).toBe(1);
    expect(rebuilds).toHaveLength(1);
    expect(history.done).toHaveLength(1);
    expect(events.at(-1)).toEqual({ type: 'rejected', cmd: pine(-3), reason: 'collision' });
    // undo still reverts the accepted one only
    expect(session.undo()).toBe(true);
    expect(session.count).toBe(0);
    expect(session.canUndo()).toBe(false);
  });

  it('undo / redo restore the exact world state', () => {
    const { session, world } = setup();
    const s0 = world.snapshot();
    session.apply(raise(1));
    const s1 = world.snapshot();
    session.apply(raise(2, 0.5));
    const s2 = world.snapshot();
    expect(session.undo()).toBe(true);
    expect(world.snapshot()).toBe(s1);
    expect(session.undo()).toBe(true);
    expect(world.snapshot()).toBe(s0);
    expect(session.undo()).toBe(false);
    expect(session.redo()).toBe(true);
    expect(world.snapshot()).toBe(s1);
    expect(session.redo()).toBe(true);
    expect(world.snapshot()).toBe(s2);
    expect(session.redo()).toBe(false);
    expect(session.log.cmds).toEqual([raise(1), raise(2, 0.5)]);
  });

  it('a new command after undo drops the redo branch', () => {
    const { session } = setup();
    session.apply(raise(1));
    session.apply(raise(2));
    session.undo();
    expect(session.canRedo()).toBe(true);
    session.apply(raise(3));
    expect(session.canRedo()).toBe(false);
    expect(session.log.cmds).toEqual([raise(1), raise(3)]);
  });

  it('groups a stroke into one undo step', () => {
    const { session, world } = setup();
    const s0 = world.snapshot();
    session.beginStroke();
    for (let i = 0; i < 4; i++) session.apply(raise(i * 3));
    expect(session.canUndo()).toBe(false); // not while the stroke runs
    session.endStroke();
    session.apply(raise(50));
    expect(session.count).toBe(5);
    session.undo();
    expect(session.count).toBe(4);
    session.undo();
    expect(session.count).toBe(0);
    expect(world.snapshot()).toBe(s0);
    session.redo();
    expect(session.count).toBe(4);
  });

  it('an empty stroke (all rejected) adds no undo step', () => {
    const { session, history } = setup();
    session.beginStroke();
    session.apply(pine(-1));
    session.apply(pine(-2));
    session.endStroke();
    expect(history.done).toHaveLength(0);
    expect(session.count).toBe(0);
  });

  it('records the id applyEdit assigned to a new prop; redo re-adds the same id', () => {
    const { session, world } = setup();
    session.apply(pine(4));
    const logged = session.log.cmds[0];
    expect(logged).toMatchObject({ k: 'propAdd', id: EDIT_PROP_ID_BASE });
    session.undo();
    expect(world.props.size).toBe(0);
    session.redo();
    expect([...world.props.keys()]).toEqual([EDIT_PROP_ID_BASE]);
    expect(world.applied.at(-1)).toMatchObject({ k: 'propAdd', id: EDIT_PROP_ID_BASE });
  });

  it('clear reverts everything; load replaces the edits without undo history', () => {
    const { session, world, events } = setup();
    const s0 = world.snapshot();
    session.apply(raise(1));
    session.apply(pine(2));
    session.clear();
    expect(world.snapshot()).toBe(s0);
    expect(session.count).toBe(0);
    expect(session.canUndo()).toBe(false);
    expect(events.at(-1)).toEqual({ type: 'clear', count: 0 });
    const res = session.load({ v: 1, seed: SEED, cmds: [raise(7), pine(-1), pine(9)] });
    expect(res).toEqual({ applied: 2, rejected: 1 });
    expect(session.count).toBe(2);
    expect(session.canUndo()).toBe(false);
    expect(events.at(-1)).toEqual({ type: 'load', count: 2, rejected: 1 });
    // a log for another seed is refused
    expect(session.load({ v: 1, seed: 7, cmds: [raise(1)] }).applied).toBe(0);
    expect(session.count).toBe(2);
  });

  it('adopted (pre-build replayed) commands join the log; clear regenerates', () => {
    const { session, resets } = setup();
    session.adopt({ v: 1, seed: SEED, cmds: [raise(1)] });
    session.apply(raise(2));
    expect(session.log.cmds).toEqual([raise(1), raise(2)]);
    session.clear();
    expect(resets()).toBe(1);
    expect(session.count).toBe(0);
  });
});

describe('EditSession autosave', () => {
  it('debounces 500 ms under a per-seed, versioned key', () => {
    const { session, timer, storage, events } = setup();
    const key = editStorageKey(SEED);
    expect(key).toBe('marisland.edit.1001.v1');
    session.apply(raise(1));
    timer.advance(300);
    session.apply(raise(2));
    timer.advance(300);
    expect(storage!.getItem(key)).toBeNull(); // still inside the debounce window
    expect(timer.jobs.size).toBe(1);
    timer.advance(EDIT_UI.autosaveMs - 300);
    const raw = storage!.getItem(key)!;
    const rec = JSON.parse(raw) as { v: number; seed: number; t: number; log: string };
    expect(rec.v).toBe(1);
    expect(rec.seed).toBe(SEED);
    expect(rec.t).toBe(1234);
    expect(decode(rec.log).cmds).toEqual([raise(1), raise(2)]);
    expect(events.filter((e) => e.type === 'saved')).toHaveLength(1);
  });

  it('removes the key when everything is undone; flush writes immediately', () => {
    const { session, timer, storage } = setup();
    session.apply(raise(1));
    session.flush();
    expect(storage!.getItem(editStorageKey(SEED))).not.toBeNull();
    session.undo();
    timer.advance(EDIT_UI.autosaveMs);
    expect(storage!.getItem(editStorageKey(SEED))).toBeNull();
  });

  it('restores the autosaved log into a fresh session; rejects other versions', () => {
    const a = setup();
    a.session.apply(raise(1));
    a.session.apply(pine(3));
    a.session.dispose(); // flushes
    const b = setup(a.storage);
    expect(b.session.restore(SEED)).toBe(true);
    expect(b.session.log.cmds).toEqual(a.session.log.cmds);
    expect(b.world.snapshot()).toBe(a.world.snapshot());
    // wrong seed / version → nothing
    expect(b.session.restore(42)).toBe(false);
    const rec = JSON.parse(a.storage!.getItem(editStorageKey(SEED))!) as { v: number };
    rec.v = 99;
    a.storage!.setItem(editStorageKey(SEED), JSON.stringify(rec));
    const c = setup(a.storage);
    expect(c.session.restore()).toBe(false);
    expect(c.session.count).toBe(0);
  });

  it('no storage (capture) → no timers, no writes', () => {
    const { session, timer } = setup(null);
    session.apply(raise(1));
    expect(timer.jobs.size).toBe(0);
    expect(session.restore()).toBe(false);
  });
});

describe('EditSession share URL', () => {
  it('round-trips the log through edit= and keeps the other params', () => {
    const { session } = setup();
    session.apply(raise(1));
    session.apply(pine(3));
    session.apply({ k: 'paint', x: 1, z: 2, r: 6, zone: 'meadow' });
    const url = session.shareUrl('https://example.org/marisland/?seed=1001&cam=village');
    const u = new URL(url);
    expect(u.searchParams.get('seed')).toBe('1001');
    expect(u.searchParams.get('cam')).toBe('village');
    expect(u.pathname).toBe('/marisland/');
    expect(editLogFromUrl(url, decode)).toEqual(session.log);
    // empty log → param removed
    session.clear();
    expect(new URL(session.shareUrl(url)).searchParams.has('edit')).toBe(false);
    expect(editLogFromUrl('https://example.org/?edit=%%%', decode)).toBeNull();
  });

  it('applies the codec-quantised command (live world == replay)', () => {
    const world = new FakeWorld();
    const q = (v: number): number => Math.round(v * 8) / 8;
    const session = createEditSession({
      seed: SEED,
      apply: world.apply,
      rebuild: () => {},
      history: new FakeHistory(),
      encode: (log) =>
        encode({
          ...log,
          cmds: log.cmds.map((c) => ('x' in c ? { ...c, x: q(c.x), z: q(c.z) } : c)),
        }),
      decode,
      storage: null,
      timer: new ManualTimer(),
      now: () => 0,
    });
    session.apply({ k: 'raise', x: 1.33, z: 2.71, r: 8, s: 1 });
    expect(world.applied[0]).toMatchObject({ x: 1.375, z: 2.75 });
    expect(session.log.cmds[0]).toMatchObject({ x: 1.375, z: 2.75 });
  });
});
