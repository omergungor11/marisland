import { describe, expect, it } from 'vitest';
import type { FleetSession } from '../src/fleet/protocol.ts';
import { THEME_IDS } from '../src/world/types.ts';
import { islandSpawn, parseConfig, parseConfigText } from './config.ts';
import { emptyIndex, parseIndex, recoverIndex, serializeIndex, upsertSession } from './store.ts';

const sess = (id: string, status: FleetSession['status']): FleetSession => ({
  id,
  island: 'coding',
  agent: 'default',
  title: id,
  status,
  startedAt: 1,
  updatedAt: 1,
  turns: 0,
  requestId: `r-${id}`,
  cwd: '/x',
});

describe('store', () => {
  it('round-trips and tolerates garbage', () => {
    const idx = emptyIndex();
    upsertSession(idx, sess('a', 'done'));
    upsertSession(idx, { ...sess('a', 'done'), title: 'new' });
    expect(parseIndex(serializeIndex(idx)).sessions).toHaveLength(1);
    expect(parseIndex(serializeIndex(idx)).sessions[0].title).toBe('new');
    for (const bad of [undefined, '', '{', 'null', '{"sessions":3}'])
      expect(parseIndex(bad)).toEqual(emptyIndex());
  });

  it('recover turns live sessions into error: bridge restarted', () => {
    const idx = {
      sessions: [sess('a', 'running'), sess('b', 'done'), sess('c', 'queued')],
      requests: [
        {
          id: 'r-a',
          title: 'a',
          island: 'coding' as const,
          rootSessionId: 'a',
          createdAt: 1,
          status: 'open' as const,
        },
      ],
    };
    const out = recoverIndex(idx, 99);
    expect(out.sessions.map((s) => s.status)).toEqual(['error', 'done', 'error']);
    expect(out.sessions[0]).toMatchObject({ reason: 'bridge restarted', endedAt: 99 });
    expect(out.requests[0].status).toBe('error');
  });
});

describe('config', () => {
  it('fills defaults', () => {
    const c = parseConfig({});
    expect(c).toMatchObject({ port: 5174, maxTurns: 30, maxChildren: 6 });
    expect(c.allowedTools).toContain('Bash(pnpm *)');
    expect(Object.keys(c.islands).sort()).toEqual([...THEME_IDS].sort());
    expect(c.model).toBeUndefined();
  });

  it('accepts overrides and rejects bad input', () => {
    const c = parseConfigText(
      '{"maxTurns":5,"model":"sonnet","islands":{"qa":{"addDirs":["/a"]}}}',
    );
    expect(c).toMatchObject({ maxTurns: 5, model: 'sonnet' });
    expect(c.islands.qa.addDirs).toEqual(['/a']);
    expect(() => parseConfig({ maxTurns: 0 })).toThrow(/maxTurns/);
    expect(() => parseConfig({ islands: { moon: {} } })).toThrow(/unknown island/);
    expect(() => parseConfig({ allowedTools: [1] })).toThrow(/allowedTools/);
    expect(() => parseConfigText('{')).toThrow(/invalid JSON/);
  });

  it('islandSpawn is the single layout point', () => {
    const c = parseConfig({ islands: { coding: { addDirs: ['/p', '/q'] } } });
    expect(islandSpawn('/r', c, 'coding')).toEqual({
      cwd: '/r/fleet/islands/coding',
      args: ['--add-dir', '/p', '--add-dir', '/q'],
    });
  });
});
