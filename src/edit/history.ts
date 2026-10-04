/**
 * Undo / redo stack for edit commands (TASK-211; reused by `EditSession`, TASK-212). Pure and
 * generic over the command type. An entry is one undo step: the commands as applied (redo
 * replays them in order) and the inverse commands (undo applies them in order). Grouping
 * (`beginGroup` / `endGroup`, nestable) folds a stroke's samples into one entry: its inverse is
 * the samples' inverses in reverse sample order.
 */
export interface HistoryEntry<C> {
  cmds: C[];
  inverse: C[];
}

export class EditHistory<C> {
  private entries: HistoryEntry<C>[] = [];
  private cursor = 0;
  private open: HistoryEntry<C> | null = null;
  private depth = 0;
  private readonly limit: number;

  /** `limit`: oldest steps are dropped beyond this many (their commands stay in `dropped`). */
  constructor(limit = Infinity) {
    this.limit = limit;
  }

  /** Commands of steps dropped by the limit (still part of the log, no longer undoable). */
  readonly dropped: C[] = [];

  /** Record an applied command and the commands that undo it (applied in order). */
  push(cmd: C, inverse: readonly C[]): void {
    if (this.open) {
      this.open.cmds.push(cmd);
      this.open.inverse = [...inverse, ...this.open.inverse];
      return;
    }
    this.truncateRedo();
    this.entries.push({ cmds: [cmd], inverse: [...inverse] });
    this.cursor++;
    this.trim();
  }

  /** Start a group (one undo step); nested calls join the outer group. */
  beginGroup(): void {
    if (this.depth++ === 0) {
      this.truncateRedo();
      this.open = { cmds: [], inverse: [] };
    }
  }

  /** Close the group; an empty group leaves no entry. */
  endGroup(): void {
    if (this.depth === 0) return;
    if (--this.depth > 0) return;
    const g = this.open;
    this.open = null;
    if (g && g.cmds.length) {
      this.entries.push(g);
      this.cursor++;
      this.trim();
    }
  }

  get grouping(): boolean {
    return this.depth > 0;
  }

  get canUndo(): boolean {
    return this.cursor > 0 || !!this.open?.cmds.length;
  }

  get canRedo(): boolean {
    return !this.open && this.cursor < this.entries.length;
  }

  /** Step back: returns the entry whose `inverse` the caller applies (null at the bottom). */
  undo(): HistoryEntry<C> | null {
    if (this.depth > 0) {
      // undo during a stroke closes it first
      this.depth = 1;
      this.endGroup();
    }
    if (this.cursor === 0) return null;
    return this.entries[--this.cursor];
  }

  /** Step forward: returns the entry whose `cmds` the caller re-applies (null at the top). */
  redo(): HistoryEntry<C> | null {
    if (this.open || this.cursor >= this.entries.length) return null;
    return this.entries[this.cursor++];
  }

  /** Replace an entry's inverse (re-applying a command may produce fresh inverse data). */
  setInverse(entry: HistoryEntry<C>, inverse: readonly C[]): void {
    entry.inverse = [...inverse];
  }

  /** Every applied command in order (dropped steps, undoable steps, the open group). */
  applied(): C[] {
    const out = [...this.dropped];
    for (let i = 0; i < this.cursor; i++) out.push(...this.entries[i].cmds);
    if (this.open) out.push(...this.open.cmds);
    return out;
  }

  /** Undoable steps (open group included). */
  get size(): number {
    return this.cursor + (this.open?.cmds.length ? 1 : 0);
  }

  clear(): void {
    this.entries = [];
    this.cursor = 0;
    this.open = null;
    this.depth = 0;
    this.dropped.length = 0;
  }

  private truncateRedo(): void {
    this.entries.length = this.cursor;
  }

  private trim(): void {
    while (this.entries.length > this.limit) {
      const e = this.entries.shift()!;
      this.dropped.push(...e.cmds);
      this.cursor--;
    }
  }
}
