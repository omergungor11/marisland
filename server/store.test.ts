import { describe, expect, it } from 'vitest';
import type { FleetGate, FleetSession } from '../src/fleet/protocol.ts';

import {
  emptyIndex,
  parseIndex,
  publicGate,
  recoverIndex,
  serializeIndex,
  upsertSession,
  type StoredGate,
} from './store.ts';

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
      gates: [],
    };
    const out = recoverIndex(idx, 99);
    expect(out.sessions.map((s) => s.status)).toEqual(['error', 'done', 'error']);
    expect(out.sessions[0]).toMatchObject({ reason: 'bridge restarted', endedAt: 99 });
    expect(out.requests[0].status).toBe('error');
  });

  it('recover keeps a waiting parent with a pending gate, settles one without', () => {
    const gate = {
      id: 'g',
      requestId: 'r-a',
      fromSessionId: 'a',
      fromIsland: 'coding' as const,
      toIsland: 'design' as const,
      prompt: 'x',
      status: 'pending' as const,
      createdAt: 1,
    };
    const idx = {
      sessions: [sess('a', 'waiting'), sess('b', 'waiting')],
      requests: [],
      gates: [gate],
    };
    const out = recoverIndex(idx, 99);
    expect(out.sessions.map((s) => s.status)).toEqual(['waiting', 'done']);
    expect(out.gates).toEqual([gate]);
  });
});

const oldGate: FleetGate = {
  id: 'g',
  requestId: 'r-p',
  fromSessionId: 'p',
  fromIsland: 'marketing',
  toIsland: 'design',
  prompt: 'x',
  status: 'allowed',
  createdAt: 1,
};

describe('store: gate fields (TASK-578)', () => {
  it('publicGate exposes round / childId / answeredAt and a 400-char report preview, hides internals', () => {
    const g: StoredGate = {
      ...oldGate,
      round: 'r1',
      childId: 'c',
      answeredAt: 5,
      report: 'a'.repeat(900),
      parentSummary: 'secret',
      parentSummaryExplicit: true,
    };
    const pub = publicGate(g);
    expect(pub).toMatchObject({ round: 'r1', childId: 'c', answeredAt: 5 });
    expect(pub.report).toHaveLength(400);
    expect('parentSummary' in pub).toBe(false);
    expect('parentSummaryExplicit' in pub).toBe(false);
    expect('report' in publicGate(oldGate)).toBe(false);
  });

  it('an old index entry without the fields survives parse + recover', () => {
    const idx = parseIndex(
      JSON.stringify({ sessions: [sess('p', 'done')], requests: [], gates: [oldGate] }),
    );
    const rec = recoverIndex(idx, 9);
    expect(publicGate(rec.gates[0])).toMatchObject({ id: 'g', status: 'allowed' });
    expect(publicGate(rec.gates[0]).answeredAt).toBeUndefined();
  });
});
