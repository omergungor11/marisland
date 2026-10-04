/**
 * EditSession (phase-2 TASK-212): the one entry point for edits on the live world.
 *
 *   apply(cmd) → deps.apply (applyEdit: mutates the world, inverse + dirty) → deps.rebuild(dirty)
 *              → log appended + history push → autosave (debounced) → subscribers
 *
 * Rejected commands (`ok: false`) are not logged; they surface as `{type: 'rejected'}` events.
 * A stroke (`beginStroke` … `endStroke`) is one undo step. The log is the list of commands in
 * effect (undo pops, redo re-appends), so `serialize()` + replay on a fresh world reproduces the
 * current state. Pure: no three, no DOM — storage, timer and clock are injected.
 */
import {
  EMPTY_DIRTY,
  mergeDirty,
  type DirtyRegion,
  type EditCommand,
  type EditLog,
  type EditResult,
} from '../world/edit-types.ts';
import { EDIT_UI } from '../content/edit-ui.ts';
import type { EditSessionDeps, HistoryEntry, SessionEvent } from './session-types.ts';

export interface LoadResult {
  applied: number;
  rejected: number;
}

export interface EditSession {
  readonly seed: number;
  /** Commands in effect (copy). */
  readonly log: EditLog;
  /** Number of commands in effect. */
  readonly count: number;
  readonly stroking: boolean;
  apply(cmd: EditCommand): EditResult;
  undo(): boolean;
  redo(): boolean;
  canUndo(): boolean;
  canRedo(): boolean;
  /** Group every command until `endStroke` into one undo step. Nested calls are ignored. */
  beginStroke(): void;
  endStroke(): void;
  /** Encoded log (URL-safe, versioned by the codec). */
  serialize(): string;
  /** Replace the current edits with `log` (no undo history). */
  load(log: EditLog): LoadResult;
  /**
   * Record commands that were already replayed into the world before it was built (`?edit=`):
   * they join the log (share / autosave) but have no inverses, so `clear()` regenerates instead.
   */
  adopt(log: EditLog): void;
  /** Revert every edit (or regenerate the world when adopted commands exist). */
  clear(): void;
  /** Load the autosaved log for `seed` (default: the session's); false when none / invalid. */
  restore(seed?: number): boolean;
  /** Write a pending autosave now (page hide, teardown). */
  flush(): void;
  /** `base` with `edit=<serialized log>` (removed when the log is empty). */
  shareUrl(base: string): string;
  subscribe(cb: (e: SessionEvent) => void): () => void;
  /** Flush the pending autosave and drop subscribers. */
  dispose(): void;
}

/** localStorage key of the autosaved log for a seed (versioned). */
export function editStorageKey(seed: number): string {
  return `${EDIT_UI.storagePrefix}${seed >>> 0}.v${EDIT_UI.storageVersion}`;
}

/** Stored autosave record. */
interface SavedRecord {
  v: number;
  seed: number;
  /** Save time (ms, injected clock). */
  t: number;
  log: string;
}

/** The edit log carried by a URL's `edit=` parameter, or null. */
export function editLogFromUrl(url: string, decode: (s: string) => EditLog): EditLog | null {
  const s = new URL(url).searchParams.get(EDIT_UI.urlParam);
  if (!s) return null;
  try {
    return decode(s);
  } catch {
    return null;
  }
}

/**
 * The command as it must be replayed: a first `propAdd` gets the id `applyEdit` assigned
 * (written into the command, or readable from its `propRemove` inverse), so redo / replay
 * recreate the same id.
 */
export function withAssignedId(cmd: EditCommand, res: EditResult): EditCommand {
  if (cmd.k !== 'propAdd' || cmd.id !== undefined) return cmd;
  const inv = res.inverse.find((c) => c.k === 'propRemove');
  return inv && inv.k === 'propRemove' ? { ...cmd, id: inv.id } : cmd;
}

const copyCmd = (c: EditCommand): EditCommand => ({ ...c });

export function createEditSession(d: EditSessionDeps): EditSession {
  const seed = d.seed >>> 0;
  const key = editStorageKey(seed);
  /** Commands applied by the session (revertible), in order. */
  let entries: HistoryEntry[] = [];
  /** Commands replayed before the build (`adopt`): in the log, not revertible. */
  let base: EditCommand[] = [];
  let strokeDepth = 0;
  let pending: unknown = null;
  const subs = new Set<(e: SessionEvent) => void>();

  const emit = (e: SessionEvent): void => {
    for (const cb of Array.from(subs)) cb(e);
  };
  const count = (): number => base.length + entries.length;
  const logOf = (): EditLog => ({
    v: 1,
    seed,
    cmds: [...base.map(copyCmd), ...entries.map((e) => copyCmd(e.cmd))],
  });

  const save = (): void => {
    pending = null;
    if (!d.storage) return;
    try {
      if (count() === 0) {
        d.storage.removeItem(key);
        emit({ type: 'saved', key, bytes: 0 });
        return;
      }
      const rec: SavedRecord = {
        v: EDIT_UI.storageVersion,
        seed,
        t: d.now(),
        log: d.encode(logOf()),
      };
      const s = JSON.stringify(rec);
      d.storage.setItem(key, s);
      emit({ type: 'saved', key, bytes: s.length });
    } catch {
      /* private mode / quota: autosave is best effort */
    }
  };
  const scheduleSave = (): void => {
    if (!d.storage) return;
    if (pending !== null) d.timer.clear(pending);
    pending = d.timer.set(save, EDIT_UI.autosaveMs);
  };

  /** Apply commands back to front through their inverses; merged dirty region. */
  const revert = (list: readonly HistoryEntry[]): DirtyRegion => {
    let dirty = EMPTY_DIRTY;
    for (let i = list.length - 1; i >= 0; i--) {
      for (const inv of list[i].inverse) {
        const r = d.apply(inv);
        if (r.ok) dirty = mergeDirty(dirty, r.dirty);
        else emit({ type: 'rejected', cmd: inv, reason: r.reason ?? 'inverse rejected' });
      }
    }
    return dirty;
  };

  /** Clear without event / autosave (regenerates when adopted commands cannot be reverted). */
  const clearSilently = (): void => {
    const regen = base.length > 0 && !!d.resetWorld;
    if (!regen) {
      const dirty = revert(entries);
      if (dirty.chunks.length || dirty.props.length || dirty.maxI >= dirty.minI) d.rebuild(dirty);
    }
    entries = [];
    base = [];
    d.history.clear();
    if (regen) {
      // the regenerated world restores the autosave on build: drop it first
      if (pending !== null) d.timer.clear(pending);
      save();
      d.resetWorld?.();
    }
  };

  /**
   * What replay will see: the command through the log codec (which may quantise), so the live
   * world and `generateWorld(seed) + replay(log)` stay identical.
   */
  const quantize = (cmd: EditCommand): EditCommand => {
    try {
      const out = d.decode(d.encode({ v: 1, seed, cmds: [cmd] })).cmds[0];
      if (!out || out.k !== cmd.k) return cmd;
      if (out.k === 'propAdd' && cmd.k === 'propAdd' && cmd.id === undefined) delete out.id;
      return out;
    } catch {
      return cmd;
    }
  };

  const session: EditSession = {
    seed,
    get log() {
      return logOf();
    },
    get count() {
      return count();
    },
    get stroking() {
      return strokeDepth > 0;
    },
    apply(raw) {
      const cmd = quantize(raw);
      const res = d.apply(cmd);
      if (!res.ok) {
        emit({ type: 'rejected', cmd, reason: res.reason ?? 'rejected' });
        return res;
      }
      d.rebuild(res.dirty);
      const logged = withAssignedId(cmd, res);
      entries.push({ cmd: logged, inverse: res.inverse });
      d.history.push(logged, res.inverse);
      scheduleSave();
      emit({ type: 'applied', cmd: logged, count: count() });
      return res;
    },
    undo() {
      if (strokeDepth > 0 || !d.history.canUndo()) return false;
      const step = d.history.undo();
      if (!step || step.length === 0) return false;
      d.rebuild(revert(step));
      entries.splice(Math.max(0, entries.length - step.length), step.length);
      scheduleSave();
      emit({ type: 'undo', count: count() });
      return true;
    },
    redo() {
      if (strokeDepth > 0 || !d.history.canRedo()) return false;
      const step = d.history.redo();
      if (!step || step.length === 0) return false;
      let dirty = EMPTY_DIRTY;
      for (const e of step) {
        const r = d.apply(e.cmd);
        if (!r.ok) {
          emit({ type: 'rejected', cmd: e.cmd, reason: r.reason ?? 'redo rejected' });
          continue;
        }
        dirty = mergeDirty(dirty, r.dirty);
        entries.push({ cmd: withAssignedId(e.cmd, r), inverse: r.inverse });
      }
      d.rebuild(dirty);
      scheduleSave();
      emit({ type: 'redo', count: count() });
      return true;
    },
    canUndo: () => strokeDepth === 0 && d.history.canUndo(),
    canRedo: () => strokeDepth === 0 && d.history.canRedo(),
    beginStroke() {
      if (strokeDepth++ === 0) d.history.beginGroup();
    },
    endStroke() {
      if (strokeDepth === 0) return;
      if (--strokeDepth === 0) d.history.endGroup();
    },
    serialize: () => d.encode(logOf()),
    load(log) {
      if (log.seed >>> 0 !== seed) {
        emit({ type: 'rejected', cmd: null, reason: 'seed mismatch' });
        return { applied: 0, rejected: log.cmds.length };
      }
      if (strokeDepth > 0) {
        strokeDepth = 0;
        d.history.endGroup();
      }
      clearSilently();
      let dirty = EMPTY_DIRTY;
      let rejected = 0;
      for (const c of log.cmds) {
        const r = d.apply(c);
        if (!r.ok) {
          rejected++;
          emit({ type: 'rejected', cmd: c, reason: r.reason ?? 'rejected' });
          continue;
        }
        dirty = mergeDirty(dirty, r.dirty);
        entries.push({ cmd: withAssignedId(c, r), inverse: r.inverse });
      }
      d.rebuild(dirty);
      scheduleSave();
      emit({ type: 'load', count: count(), rejected });
      return { applied: entries.length, rejected };
    },
    adopt(log) {
      if (log.seed >>> 0 !== seed) return;
      base = [...base, ...log.cmds.map(copyCmd)];
      scheduleSave();
      emit({ type: 'load', count: count(), rejected: 0 });
    },
    clear() {
      if (strokeDepth > 0) {
        strokeDepth = 0;
        d.history.endGroup();
      }
      clearSilently();
      scheduleSave();
      emit({ type: 'clear', count: 0 });
    },
    restore(s = seed) {
      if (!d.storage || s >>> 0 !== seed) return false;
      let raw: string | null;
      try {
        raw = d.storage.getItem(editStorageKey(s));
      } catch {
        return false;
      }
      if (!raw) return false;
      try {
        const rec = JSON.parse(raw) as Partial<SavedRecord>;
        if (rec.v !== EDIT_UI.storageVersion || typeof rec.log !== 'string') return false;
        const log = d.decode(rec.log);
        if (log.seed >>> 0 !== seed || log.cmds.length === 0) return false;
        session.load(log);
        return true;
      } catch {
        return false;
      }
    },
    flush() {
      if (pending === null) return;
      d.timer.clear(pending);
      save();
    },
    shareUrl(baseUrl) {
      const u = new URL(baseUrl);
      if (count() > 0) u.searchParams.set(EDIT_UI.urlParam, session.serialize());
      else u.searchParams.delete(EDIT_UI.urlParam);
      return u.toString();
    },
    subscribe(cb) {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    dispose() {
      session.flush();
      subs.clear();
    },
  };
  return session;
}
