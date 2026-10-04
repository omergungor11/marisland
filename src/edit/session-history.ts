import type { EditCommand } from '../world/edit-types.ts';
import { EditHistory } from './history.ts';
import type { HistoryEntry, HistoryLike } from './session-types.ts';

/**
 * `EditHistory` (TASK-211: grouped steps, one inverse list per step) seen through the
 * `HistoryLike` shape the `EditSession` (TASK-212) expects: one `{cmd, inverse}` entry per
 * command, in apply order. The per-command inverse is kept on the side, keyed by the command
 * object the session logged (identity-stable).
 */
export class SessionHistory implements HistoryLike {
  private readonly h = new EditHistory<EditCommand>();
  private readonly inv = new WeakMap<EditCommand, EditCommand[]>();

  push(cmd: EditCommand, inverse: EditCommand[]): void {
    this.inv.set(cmd, [...inverse]);
    this.h.push(cmd, inverse);
  }
  beginGroup(): void {
    this.h.beginGroup();
  }
  endGroup(): void {
    this.h.endGroup();
  }
  private entries(cmds: EditCommand[]): HistoryEntry[] {
    return cmds.map((cmd) => ({ cmd, inverse: this.inv.get(cmd) ?? [] }));
  }
  undo(): HistoryEntry[] | null {
    const e = this.h.undo();
    return e ? this.entries(e.cmds) : null;
  }
  redo(): HistoryEntry[] | null {
    const e = this.h.redo();
    return e ? this.entries(e.cmds) : null;
  }
  canUndo(): boolean {
    return this.h.canUndo;
  }
  canRedo(): boolean {
    return this.h.canRedo;
  }
  clear(): void {
    this.h.clear();
  }
}
