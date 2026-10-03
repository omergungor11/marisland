/**
 * Ownership of disposable resources (CLAUDE.md rule 5). Everything seed-derived
 * registers in the `world` scope and is freed on regen; renderer-lifetime things
 * live in `app`.
 */
export interface Disposable {
  dispose(): void;
}

export class Scope {
  readonly name: string;
  private items: Disposable[] = [];
  private disposed = false;

  constructor(name: string) {
    this.name = name;
  }

  add<T extends Disposable>(item: T): T {
    if (this.disposed) throw new Error(`Scope "${this.name}" is disposed`);
    this.items.push(item);
    return item;
  }

  /** Register an arbitrary cleanup callback. */
  defer(fn: () => void): void {
    this.add({ dispose: fn });
  }

  get size(): number {
    return this.items.length;
  }

  /** Dispose everything in reverse order; the scope stays usable afterwards. */
  dispose(): void {
    for (let i = this.items.length - 1; i >= 0; i--) {
      try {
        this.items[i].dispose();
      } catch (e) {
        console.error(`dispose failed in scope "${this.name}"`, e);
      }
    }
    this.items.length = 0;
  }

  /** Dispose and seal. */
  destroy(): void {
    this.dispose();
    this.disposed = true;
  }
}
