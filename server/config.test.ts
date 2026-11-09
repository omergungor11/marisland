import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { firstOutOfBounds, porcelainPaths } from './bounds.ts';
import {
  islandSpawn,
  parseConfig,
  parseConfigText,
  parseManifest,
  validateManifest,
} from './config.ts';

const coding: unknown = JSON.parse(
  readFileSync(`${import.meta.dirname}/../fleet/islands/coding/island.json`, 'utf8'),
);

describe('fleet config', () => {
  it('fills defaults and rejects bad input', () => {
    expect(parseConfig({})).toEqual({
      port: 5174,
      titleModel: 'haiku',
      maxTurns: 30,
      maxChildren: 6,
      doneGate: { minTurns: 5, nudgeMaxTurns: 3 },
    });
    expect(parseConfig({ doneGate: { minTurns: 0 } }).doneGate).toEqual({
      minTurns: 0,
      nudgeMaxTurns: 3,
    });
    expect(() => parseConfig({ doneGate: { minTurns: -1 } })).toThrow(/doneGate.minTurns/);
    expect(() => parseConfig({ doneGate: { nudgeMaxTurns: 1.5 } })).toThrow(/nudgeMaxTurns/);
    expect(() => parseConfig({ maxTurns: 0 })).toThrow(/maxTurns/);
    expect(() => parseConfig({ port: 70000 })).toThrow(/port/);
    expect(() => parseConfigText('{')).toThrow(/invalid JSON/);
  });
});

describe('island manifest', () => {
  it('accepts the coding example', () => {
    expect(validateManifest(coding, 'coding')).toEqual([]);
  });

  it('flags every rule', () => {
    const c = coding as Record<string, unknown>;
    expect(validateManifest(c, 'qa')[0]).toMatch(/!= directory/);
    expect(validateManifest({ ...c, model: 'fable' }, 'coding')[0]).toMatch(/never fable/);
    expect(validateManifest({ ...c, extra: 1 }, 'coding')[0]).toMatch(/unknown key/);
    expect(validateManifest({ ...c, maxTurns: 999 }, 'coding')[0]).toMatch(/maxTurns/);
    expect(validateManifest({ ...c, owner: 'bob' }, 'coding')[0]).toMatch(/owner/);
    const { name: _n, ...noName } = c;
    expect(validateManifest(noName, 'coding')[0]).toMatch(/missing required key "name"/);
    expect(validateManifest(null, 'coding')).toHaveLength(1);
  });

  it('childGates: boolean only, defaults to true, set per island', () => {
    const c = coding as Record<string, unknown>;
    expect(validateManifest({ ...c, childGates: false }, 'coding')).toEqual([]);
    expect(validateManifest({ ...c, childGates: 'no' }, 'coding')[0]).toMatch(/childGates/);
    const bare = { ...c };
    delete bare.childGates;
    expect(parseManifest(bare, 'coding', parseConfig({})).childGates).toBe(true);
    expect(parseManifest({ ...c, childGates: false }, 'coding', parseConfig({})).childGates).toBe(
      false,
    );
    const flag = (t: string): unknown =>
      (
        JSON.parse(
          readFileSync(`${import.meta.dirname}/../fleet/islands/${t}/island.json`, 'utf8'),
        ) as { childGates?: boolean }
      ).childGates;
    for (const t of ['design', 'qa', 'devops', 'research']) expect(flag(t)).toBe(false);
    for (const t of ['marketing', 'coding', 'hq']) expect(flag(t)).toBe(true);
  });

  it('fills maxChildren from the fleet config', () => {
    const c = { ...(coding as Record<string, unknown>) };
    delete c.maxChildren;
    expect(parseManifest(c, 'coding', parseConfig({ maxChildren: 3 })).maxChildren).toBe(3);
    expect(() => parseManifest({}, 'coding', parseConfig({}))).toThrow(/island coding/);
  });

  it('islandSpawn is the single layout point', () => {
    const m = parseManifest(
      { ...(coding as Record<string, unknown>), addDirs: ['src', 'server/'] },
      'coding',
      parseConfig({}),
    );
    const sp = islandSpawn('/r', m);
    expect(sp.cwd).toBe('/r/fleet/islands/coding');
    expect(sp.args).toEqual(
      expect.arrayContaining(['--max-turns', '30', '--model', 'sonnet', '--add-dir', '/r/src']),
    );
    expect(JSON.parse(sp.args[sp.args.indexOf('--settings') + 1])).toEqual({
      autoMemoryDirectory: '/r/fleet/islands/coding/memory',
    });
    expect(sp.args[sp.args.indexOf('--allowedTools') + 1]).toContain('Bash(git diff*)');
    expect(sp.writable).toEqual(['fleet/islands/coding/', 'src/', 'server/']);
  });
});

describe('bounds check', () => {
  const allowed = ['fleet/islands/coding/', 'src/'];
  it('parses porcelain paths incl. renames and quotes', () => {
    expect(porcelainPaths(' M a.ts\n?? "b c.ts"\nR  x.ts -> y.ts\n')).toEqual([
      'a.ts',
      'b c.ts',
      'x.ts',
      'y.ts',
    ]);
  });

  it('passes in-bounds and pre-existing dirt, flags the first new stray path', () => {
    const before = ' M README.md\n';
    expect(
      firstOutOfBounds(
        before,
        ' M README.md\n M src/a.ts\n?? fleet/islands/coding/memory/x.md\n?? fleet/runs/s.jsonl\n',
        allowed,
      ),
    ).toBeUndefined();
    expect(
      firstOutOfBounds(
        before,
        ' M README.md\n M src/a.ts\n M scripts/shots.ts\n?? zz.txt\n',
        allowed,
      ),
    ).toBe('scripts/shots.ts');
    expect(firstOutOfBounds('', '?? fleet/islands/qa/\n', allowed)).toBe('fleet/islands/qa/');
    expect(firstOutOfBounds('', '?? fleet/islands/coding/\n', allowed)).toBeUndefined();
  });
});
