import { describe, expect, it } from 'vitest';
import type { FleetRequest } from '../src/fleet/protocol.ts';
import { withEnvPort, parseConfig } from './config.ts';
import { accumulate, claudeArgs, requestWithTitle, tailSource, userRecord } from './resume.ts';
import { reduceJsonl } from './stream.ts';

const islandArgs = ['--allowedTools', 'Read', '--settings', '{}', '--add-dir', '/x'];

describe('claudeArgs', () => {
  it('resume = start flags with --resume instead of --session-id', () => {
    const start = claudeArgs({ prompt: 'p', sessionId: 'abc', resume: false, islandArgs });
    const resume = claudeArgs({ prompt: 'q', sessionId: 'abc', resume: true, islandArgs });
    expect(start).toContain('--session-id');
    expect(resume).not.toContain('--session-id');
    const i = resume.indexOf('--resume');
    expect(resume.slice(i, i + 2)).toEqual(['--resume', 'abc']);
    expect(resume.slice(-islandArgs.length)).toEqual(islandArgs);
    const common = (a: string[]): string[] =>
      a.filter((x) => !['p', 'q', 'abc', '--session-id', '--resume'].includes(x));
    expect(common(resume)).toEqual(common(start));
  });
});

describe('tailSource', () => {
  it('memory when from is inside the window or the cache is empty, disk otherwise', () => {
    expect(tailSource(10, 10)).toBe('memory');
    expect(tailSource(10, 50)).toBe('memory');
    expect(tailSource(10, 3)).toBe('disk');
    expect(tailSource(null, 0)).toBe('memory');
    expect(tailSource(undefined, 0)).toBe('disk');
  });
});

describe('accumulate', () => {
  it('adds per-run turns and cost to the earlier runs', () => {
    expect(accumulate({ turns: 1, costUsd: 0.02 }, { turns: 2, costUsd: 0.03 })).toEqual({
      turns: 3,
      costUsd: 0.05,
    });
    expect(accumulate({ turns: 1, costUsd: 0.02 }, { turns: 2 })).toEqual({ turns: 3 });
  });
});

describe('requestWithTitle', () => {
  const req: FleetRequest = {
    id: 'r1',
    title: 'draft',
    island: 'coding',
    rootSessionId: 's1',
    createdAt: 0,
    status: 'open',
  };
  it('titles the request only from its root session', () => {
    expect(requestWithTitle([req], { id: 's1', requestId: 'r1' }, 'Yeni')?.title).toBe('Yeni');
    expect(requestWithTitle([req], { id: 's2', requestId: 'r1' }, 'Yeni')).toBeUndefined();
    expect(requestWithTitle([req], { id: 's1', requestId: 'zz' }, 'Yeni')).toBeUndefined();
    expect(requestWithTitle([req], { id: 's1', requestId: 'r1' }, 'draft')).toBeUndefined();
  });
});

describe('user line', () => {
  it('replays from disk as a user line and keeps seq dense across runs', () => {
    const first = JSON.stringify({ type: 'result', subtype: 'success', num_turns: 1 });
    const jsonl = `${first}\n${userRecord('devam et', 5)}\n${first}\n`;
    const lines = reduceJsonl(jsonl, 's', 0);
    expect(lines.map((l) => [l.seq, l.kind])).toEqual([
      [0, 'result'],
      [1, 'user'],
      [2, 'result'],
    ]);
    expect(lines[1]).toMatchObject({ text: 'devam et', at: 5 });
  });
});

describe('withEnvPort', () => {
  it('FLEET_PORT overrides, junk is ignored', () => {
    const c = parseConfig({});
    expect(withEnvPort(c, { FLEET_PORT: '5175' }).port).toBe(5175);
    expect(withEnvPort(c, { FLEET_PORT: 'x' }).port).toBe(c.port);
    expect(withEnvPort(c, {}).port).toBe(c.port);
  });
});
