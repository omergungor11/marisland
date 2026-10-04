/**
 * Test fakes for the edit session (no world, no three): a toy world with per-point heights and
 * props, an unbounded history, a Map storage and a manual timer. Not imported by app code.
 */
import {
  EDIT_PROP_ID_BASE,
  EMPTY_DIRTY,
  type DirtyRegion,
  type EditCommand,
  type EditLog,
  type EditResult,
} from '../world/edit-types.ts';
import type { HistoryEntry, HistoryLike, StorageLike, TimerLike } from './session-types.ts';

export class FakeWorld {
  heights = new Map<string, number>();
  props = new Map<number, { def: string; x: number; z: number; rotY: number }>();
  nextId = EDIT_PROP_ID_BASE;
  applied: EditCommand[] = [];

  private dirty(x: number, z: number, id?: number): DirtyRegion {
    const c = Math.max(0, Math.floor(x / 32)) + Math.max(0, Math.floor(z / 32)) * 12;
    return {
      ...EMPTY_DIRTY,
      chunks: [c],
      minI: 0,
      maxI: 1,
      minJ: 0,
      maxJ: 1,
      props: id === undefined ? [] : [id],
    };
  }

  apply = (cmd: EditCommand): EditResult => {
    this.applied.push(cmd);
    const fail = (reason: string): EditResult => ({
      ok: false,
      reason,
      inverse: [],
      dirty: EMPTY_DIRTY,
    });
    switch (cmd.k) {
      case 'raise':
      case 'lower': {
        const key = `${cmd.x},${cmd.z}`;
        const d = cmd.k === 'raise' ? cmd.s : -cmd.s;
        this.heights.set(key, (this.heights.get(key) ?? 0) + d);
        const inv: EditCommand = { ...cmd, k: cmd.k === 'raise' ? 'lower' : 'raise' };
        return { ok: true, inverse: [inv], dirty: this.dirty(cmd.x, cmd.z) };
      }
      case 'flatten':
      case 'smooth':
      case 'paint':
        return { ok: true, inverse: [], dirty: this.dirty(cmd.x, cmd.z) };
      case 'propAdd': {
        if (cmd.x < 0) return fail('collision');
        const id = cmd.id ?? this.nextId++;
        if (this.props.has(id)) return fail('id taken');
        this.props.set(id, { def: cmd.def, x: cmd.x, z: cmd.z, rotY: cmd.rotY });
        return {
          ok: true,
          inverse: [{ k: 'propRemove', id }],
          dirty: this.dirty(cmd.x, cmd.z, id),
        };
      }
      case 'propRemove': {
        const p = this.props.get(cmd.id);
        if (!p) return fail('no such prop');
        this.props.delete(cmd.id);
        return {
          ok: true,
          inverse: [
            { k: 'propAdd', id: cmd.id, def: p.def, x: p.x, z: p.z, rotY: p.rotY, scale: 1 },
          ],
          dirty: this.dirty(p.x, p.z, cmd.id),
        };
      }
      case 'propMove': {
        const p = this.props.get(cmd.id);
        if (!p) return fail('no such prop');
        const inv: EditCommand = { k: 'propMove', id: cmd.id, x: p.x, z: p.z, rotY: p.rotY };
        this.props.set(cmd.id, { ...p, x: cmd.x, z: cmd.z, rotY: cmd.rotY });
        return { ok: true, inverse: [inv], dirty: this.dirty(cmd.x, cmd.z, cmd.id) };
      }
      default:
        return fail('unsupported command');
    }
  };

  snapshot(): string {
    const h = [...this.heights.entries()].filter(([, v]) => Math.abs(v) > 1e-9).sort();
    const p = [...this.props.entries()].sort((a, b) => a[0] - b[0]);
    return JSON.stringify({ h, p });
  }
}

export class FakeHistory implements HistoryLike {
  done: HistoryEntry[][] = [];
  undone: HistoryEntry[][] = [];
  private group: HistoryEntry[] | null = null;

  push(cmd: EditCommand, inverse: EditCommand[]): void {
    this.undone = [];
    if (this.group) this.group.push({ cmd, inverse });
    else this.done.push([{ cmd, inverse }]);
  }
  beginGroup(): void {
    this.group = [];
  }
  endGroup(): void {
    if (this.group?.length) this.done.push(this.group);
    this.group = null;
  }
  undo(): HistoryEntry[] | null {
    const s = this.done.pop() ?? null;
    if (s) this.undone.push(s);
    return s;
  }
  redo(): HistoryEntry[] | null {
    const s = this.undone.pop() ?? null;
    if (s) this.done.push(s);
    return s;
  }
  canUndo = (): boolean => this.done.length > 0;
  canRedo = (): boolean => this.undone.length > 0;
  clear(): void {
    this.done = [];
    this.undone = [];
    this.group = null;
  }
}

export class MapStorage implements StorageLike {
  m = new Map<string, string>();
  getItem = (k: string): string | null => this.m.get(k) ?? null;
  setItem = (k: string, v: string): void => void this.m.set(k, v);
  removeItem = (k: string): void => void this.m.delete(k);
}

export class ManualTimer implements TimerLike {
  private id = 0;
  t = 0;
  jobs = new Map<number, { at: number; fn: () => void }>();
  set = (fn: () => void, ms: number): unknown => {
    const id = ++this.id;
    this.jobs.set(id, { at: this.t + ms, fn });
    return id;
  };
  clear = (h: unknown): void => void this.jobs.delete(h as number);
  advance(ms: number): void {
    this.t += ms;
    for (const [id, j] of [...this.jobs]) {
      if (j.at <= this.t) {
        this.jobs.delete(id);
        j.fn();
      }
    }
  }
}

/** URL-safe JSON codec stand-in for `world/edit.ts` encodeLog / decodeLog. */
export const encode = (log: EditLog): string =>
  btoa(JSON.stringify(log)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const decode = (s: string): EditLog =>
  JSON.parse(atob(s.replace(/-/g, '+').replace(/_/g, '/'))) as EditLog;
