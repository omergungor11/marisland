import type { DirtyRegion, EditCommand, EditLog, EditResult } from '../world/edit-types.ts';
import { EMPTY_DIRTY, mergeDirty } from '../world/edit-types.ts';
import type { WorldData } from '../world/types.ts';
import { EditHistory } from './history.ts';
import type { WorldEditApi } from './world-edit-api.ts';

/**
 * Thin bridge between the pure edit model (`WorldEditApi`, TASK-201) and the live world view
 * (TASK-211): `applyEdit` → history → `rebuildDirty`, undo / redo through the inverse stack,
 * and the `?edit=` boot replay. TASK-212's `EditSession` (autosave, strokes, subscribe) wraps
 * the same pieces.
 */
export interface EditTarget {
  world: WorldData;
  rebuildDirty(region: DirtyRegion): void;
}

export interface EditApplier {
  /** True when `world/edit.ts` is part of the build. */
  readonly available: boolean;
  /**
   * Right after `generateWorld`, before the world view is built (boot, regen, context
   * restore): replays the current log when `world.seed` matches it; a new seed clears it.
   */
  beforeBuild(world: WorldData): void;
  /** The world view edits go to (null while none is live). */
  attach(target: EditTarget | null): void;
  apply(cmd: EditCommand): EditResult;
  undo(): boolean;
  redo(): boolean;
  /** Seed + every applied command (boot log first). */
  log(): EditLog;
  /**
   * Take over a log as the boot log (not undoable): the live `EditSession` hands its log over
   * before a `keep` rebuild (context restore, reset) so `beforeBuild` replays the same edits.
   */
  adoptLog(log: EditLog): void;
  readonly history: EditHistory<EditCommand>;
}

const unavailable = (reason: string): EditResult => ({
  ok: false,
  reason,
  inverse: [],
  dirty: EMPTY_DIRTY,
});

export interface EditApplierOptions {
  seed: number;
  /** `?edit=` value ('' = none). */
  encoded: string;
  warn?: (msg: string) => void;
}

export function createEditApplier(api: WorldEditApi | null, o: EditApplierOptions): EditApplier {
  const warn = o.warn ?? ((m: string): void => console.warn(`[marisland] ${m}`));
  const history = new EditHistory<EditCommand>();
  let seed = o.seed;
  /** Replayed at build time (from `?edit=`); not undoable. */
  let boot: EditCommand[] = [];
  let target: EditTarget | null = null;
  if (o.encoded) {
    if (!api) warn('edit= given but world/edit.ts is not in this build: ignored');
    else {
      try {
        const log = api.decodeLog(o.encoded);
        if (log.seed !== o.seed)
          warn(`edit log is for seed ${log.seed}, world is ${o.seed}: ignored`);
        else boot = log.cmds.slice();
      } catch (e) {
        warn(`edit= could not be decoded: ${String(e)}`);
      }
    }
  }
  const log = (): EditLog => ({ v: 1, seed, cmds: [...boot, ...history.applied()] });
  const run = (cmds: readonly EditCommand[]): { dirty: DirtyRegion; inverse: EditCommand[] } => {
    let dirty = EMPTY_DIRTY;
    let inverse: EditCommand[] = [];
    for (const c of cmds) {
      const r = api!.applyEdit(target!.world, c);
      dirty = mergeDirty(dirty, r.dirty);
      if (r.ok) inverse = [...r.inverse, ...inverse];
    }
    return { dirty, inverse };
  };
  return {
    available: !!api,
    history,
    beforeBuild(world) {
      if (world.seed !== seed) {
        seed = world.seed;
        boot = [];
        history.clear();
        return;
      }
      const cmds = log().cmds;
      if (!api || !cmds.length) return;
      // the full log (boot + applied history) rebuilds the same edited world (context restore)
      api.replay(world, { v: 1, seed, cmds });
    },
    attach(t) {
      target = t;
    },
    apply(cmd) {
      if (!api) return unavailable('edit api unavailable');
      if (!target) return unavailable('no world');
      const r = api.applyEdit(target.world, cmd);
      if (r.ok) {
        history.push(cmd, r.inverse);
        target.rebuildDirty(r.dirty);
      }
      return r;
    },
    undo() {
      if (!api || !target) return false;
      const e = history.undo();
      if (!e) return false;
      target.rebuildDirty(run(e.inverse).dirty);
      return true;
    },
    redo() {
      if (!api || !target) return false;
      const e = history.redo();
      if (!e) return false;
      const r = run(e.cmds);
      history.setInverse(e, r.inverse);
      target.rebuildDirty(r.dirty);
      return true;
    },
    log,
    adoptLog(l) {
      seed = l.seed;
      boot = l.cmds.slice();
      history.clear();
    },
  };
}
