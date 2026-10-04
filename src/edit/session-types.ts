/**
 * Injected interfaces of the editor session (TASK-212). The session codes against these so it
 * runs in unit tests and in a build where the world edit API (TASK-201, `world/edit.ts`) or the
 * dirty rebuild / history (TASK-211, `render/world-view.ts`, `edit/history.ts`) are absent. The
 * composition root (`app.ts`) maps them onto the real exports. No three, no DOM.
 */
import type { DirtyRegion, EditCommand, EditLog, EditResult } from '../world/edit-types.ts';

/** One applied command and the command(s) that undo it (applied in order). */
export interface HistoryEntry {
  cmd: EditCommand;
  inverse: EditCommand[];
}

/**
 * Undo/redo stack of steps; a step is one command or one group (a stroke). The session applies
 * what `undo` / `redo` return; the history only stores.
 */
export interface HistoryLike {
  push(cmd: EditCommand, inverse: EditCommand[]): void;
  /** Commands pushed until `endGroup` form one step (empty groups are dropped). */
  beginGroup(): void;
  endGroup(): void;
  /** Pop the last step: its entries in apply order (the caller reverts them back to front). */
  undo(): HistoryEntry[] | null;
  /** Re-do the last undone step: its entries in apply order. */
  redo(): HistoryEntry[] | null;
  canUndo(): boolean;
  canRedo(): boolean;
  clear(): void;
}

/** `localStorage` subset (tests pass a Map-backed fake; private mode throws → caught). */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Debounce timer (tests drive it by hand). */
export interface TimerLike {
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

/** The world edit API (TASK-201 `world/edit.ts`) bound to the live world. */
export interface WorldEditApi<W = unknown> {
  applyEdit(world: W, cmd: EditCommand): EditResult;
  canPlace(world: W, cmd: EditCommand): { ok: boolean; reason?: string };
  encodeLog(log: EditLog): string;
  decodeLog(s: string): EditLog;
}

export interface EditSessionDeps {
  seed: number;
  /** `applyEdit(world, cmd)` (mutates the world, returns inverse + dirty). */
  apply(cmd: EditCommand): EditResult;
  /** `worldView.rebuildDirty(region)`. */
  rebuild(region: DirtyRegion): void;
  history: HistoryLike;
  encode(log: EditLog): string;
  decode(s: string): EditLog;
  /** Autosave target; `null` disables autosave (capture mode). */
  storage: StorageLike | null;
  timer: TimerLike;
  /** Clock for the stored record's timestamp (ms). */
  now(): number;
  /**
   * Regenerate the pristine world (same seed, no edits). `clear()` calls it when commands were
   * replayed before the build (`adopt`) — those have no inverses to revert.
   */
  resetWorld?(): void;
}

export type SessionEvent =
  | { type: 'applied'; cmd: EditCommand; count: number }
  | { type: 'rejected'; cmd: EditCommand | null; reason: string }
  | { type: 'undo'; count: number }
  | { type: 'redo'; count: number }
  | { type: 'clear'; count: 0 }
  | { type: 'load'; count: number; rejected: number }
  | { type: 'saved'; key: string; bytes: number };
