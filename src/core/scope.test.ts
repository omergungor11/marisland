import { describe, expect, it } from 'vitest';
import { Scope } from './scope.ts';

describe('Scope', () => {
  it('disposes in reverse order and stays usable', () => {
    const s = new Scope('t');
    const log: string[] = [];
    s.defer(() => log.push('a'));
    s.defer(() => log.push('b'));
    s.dispose();
    expect(log).toEqual(['b', 'a']);
    expect(s.size).toBe(0);
    s.defer(() => log.push('c'));
    expect(s.size).toBe(1);
  });

  it('disposeExcept moves the kept items to a new scope', () => {
    const s = new Scope('t');
    const log: string[] = [];
    const mk = (name: string, keep: boolean): { keep: boolean; dispose(): void } => ({
      keep,
      dispose: () => log.push(name),
    });
    s.add(mk('m1', true));
    s.add(mk('g1', false));
    s.add(mk('m2', true));
    s.add(mk('g2', false));
    const kept = s.disposeExcept((it) => (it as { keep?: boolean }).keep === true);
    expect(log).toEqual(['g2', 'g1']);
    expect(s.size).toBe(0);
    expect(kept.size).toBe(2);
    kept.dispose();
    expect(log).toEqual(['g2', 'g1', 'm2', 'm1']);
  });
});
