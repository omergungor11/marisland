import { afterEach, describe, expect, it, vi } from 'vitest';
import { FLEET, FLEET_GATE, FLEET_MOCK } from '../content/fleet.ts';
import { applyFleetEvent, createFleetClient, emptyFleetState } from './client.ts';
import { createFleetMock, mockCast, mockChain, mockFleet } from './mock.ts';
import {
  chainOf,
  gatedSessions,
  gateGroups,
  gateLineShown,
  groupRows,
  pendingGates,
  requestTree,
  trackAnswers,
} from './rows.ts';
import type { FleetEvent, FleetGate, FleetRequest, FleetSession } from './protocol.ts';

const NOW = FLEET.captureNow;
const MIN = 60_000;
const C = FLEET_MOCK.chain;

const sess = (id: string, o: Partial<FleetSession> = {}): FleetSession => ({
  id,
  island: 'marketing',
  agent: 'social',
  title: id,
  status: 'done',
  startedAt: NOW - 10 * MIN,
  updatedAt: NOW - 5 * MIN,
  turns: 1,
  requestId: 'req',
  cwd: 'fleet/islands/marketing',
  ...o,
});
const gate = (id: string, o: Partial<FleetGate> = {}): FleetGate => ({
  id,
  requestId: 'req',
  fromSessionId: 'p',
  fromIsland: 'marketing',
  toIsland: 'design',
  prompt: 'kare görseller',
  status: 'pending',
  createdAt: NOW - 2 * MIN,
  ...o,
});
const storeOf = (
  sessions: FleetSession[],
  gates: FleetGate[] = [],
  requests: FleetRequest[] = [],
) => ({
  sessions: new Map(sessions.map((s) => [s.id, s])),
  gates: new Map(gates.map((g) => [g.id, g])),
  requests: new Map(requests.map((r) => [r.id, r])),
});

describe('fleet chains: store gates (M42)', () => {
  it('snapshot fills gates, a gate event upserts, a new snapshot replaces them', () => {
    const st = emptyFleetState();
    const snap = (gates: FleetGate[]): FleetEvent => ({
      type: 'snapshot',
      bridge: { version: 1, root: '/', startedAt: NOW },
      sessions: [sess('p')],
      requests: [],
      gates,
    });
    applyFleetEvent(st, snap([gate('a'), gate('b')]));
    expect([...st.gates.keys()]).toEqual(['a', 'b']);
    applyFleetEvent(st, { type: 'gate', gate: gate('a', { status: 'allowed' }) });
    applyFleetEvent(st, { type: 'gate', gate: gate('c') });
    expect(st.gates.get('a')?.status).toBe('allowed');
    expect(st.gates.size).toBe(3);
    applyFleetEvent(st, snap([gate('z')]));
    expect([...st.gates.keys()]).toEqual(['z']);
  });
});

describe('fleet chains: tree, gates, groups (M42)', () => {
  const tree = [
    sess('c2', { island: 'coding', parentId: 'p', startedAt: NOW - 3 * MIN }),
    sess('p', { startedAt: NOW - 20 * MIN }),
    sess('g1', { island: 'qa', parentId: 'c1', startedAt: NOW - 2 * MIN }),
    sess('c1', { island: 'design', parentId: 'p', startedAt: NOW - 8 * MIN }),
    sess('other', { requestId: 'req2' }),
  ];
  it('requestTree: parent, then children by startedAt, depth first', () => {
    const t = requestTree(storeOf(tree), 'req');
    expect(t.map((r) => [r.session.id, r.depth])).toEqual([
      ['p', 0],
      ['c1', 1],
      ['g1', 2],
      ['c2', 1],
    ]);
    // a child whose parent is not in the request is a root
    expect(requestTree(storeOf([sess('x', { parentId: 'gone' })]), 'req')).toHaveLength(1);
  });
  it('pendingGates: pending only, oldest first, island = from or to', () => {
    const s = storeOf(
      [],
      [
        gate('b', { createdAt: NOW - MIN }),
        gate('a', { createdAt: NOW - 3 * MIN, toIsland: 'coding' }),
        gate('done', { status: 'allowed' }),
        gate('q', { fromIsland: 'qa', toIsland: 'devops', fromSessionId: 'x' }),
      ],
    );
    expect(pendingGates(s).map((g) => g.id)).toEqual(['a', 'q', 'b']);
    expect(pendingGates(s, 'design').map((g) => g.id)).toEqual(['b']);
    expect(pendingGates(s, 'marketing').map((g) => g.id)).toEqual(['a', 'b']);
    expect(pendingGates(s, 'devops').map((g) => g.id)).toEqual(['q']);
    expect([...gatedSessions(s)]).toEqual(['p', 'x']);
  });
  it('chainOf: null for a lone session; fan-out with the pending target last', () => {
    expect(chainOf(storeOf([sess('solo', { requestId: 'r1' })]), 'solo')).toBeNull();
    const s = storeOf(
      tree,
      [gate('gp', { toIsland: 'devops' }), gate('ga', { status: 'allowed' })],
      [
        {
          id: 'req',
          title: 'İstek başlığı',
          island: 'marketing',
          rootSessionId: 'p',
          createdAt: NOW,
          status: 'open',
        },
      ],
    );
    const c = chainOf(s, 'c1');
    expect(c?.title).toBe('İstek başlığı');
    expect(c?.count).toBe(4);
    expect(c?.roots).toHaveLength(1);
    const kids = c?.roots[0].children ?? [];
    expect(kids.map((k) => k.session?.id ?? `gate:${k.island}`)).toEqual([
      'c1',
      'c2',
      'gate:devops',
    ]);
    expect(kids[0].children.map((k) => k.session?.id)).toEqual(['g1']);
    // a gate alone (one session, pending hand-off) still shows the strip
    expect(chainOf(storeOf([sess('p')], [gate('g')]), 'p')?.roots[0].children).toHaveLength(1);
  });
  it('groupRows: a multi-session request under its title, tree order; singles stay rows', () => {
    const rows = [tree[0], tree[4], tree[1]]; // c2, other, p (panel order)
    const items = groupRows(rows, storeOf(tree));
    expect(
      items.map((i) => (i.kind === 'req' ? `req:${i.requestId}` : `${i.session.id}@${i.depth}`)),
    ).toEqual(['req:req', 'p@0', 'c2@1', 'other@0']);
  });
  it('answers collapse to one line for collapseS, already-answered ones never show', () => {
    const seen = new Set<string>();
    const at = new Map<string, number>();
    const gs = [gate('a'), gate('b', { createdAt: NOW - MIN }), gate('old', { status: 'denied' })];
    trackAnswers(gs, seen, at, NOW);
    let groups = gateGroups(gs, null, at, NOW);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ parentId: 'p', pending: 2 });
    expect(groups[0].views.map((v) => v.mode)).toEqual(['card', 'row']);
    const later = [gate('a', { status: 'allowed' }), gs[1], gs[2]];
    trackAnswers(later, seen, at, NOW + 1000);
    groups = gateGroups(later, 'design', at, NOW + 2 * MIN);
    expect(groups[0].views.map((v) => [v.gate.id, v.mode, v.text])).toEqual([
      ['a', 'line', `${FLEET_GATE.answered.allowed} · 1 dk`],
      ['b', 'card', ''],
    ]);
    expect(groups[0].pending).toBe(1);
    const gone = gateGroups(later, null, at, NOW + 1000 + FLEET_GATE.collapseS * 1000 + 1);
    expect(gone[0].views.map((v) => v.gate.id)).toEqual(['b']);
    expect(gateGroups(later, 'coding', at, NOW)).toEqual([]);
  });
  it('answeredAt drives the collapse, even for a gate answered before the snapshot', () => {
    const seen = new Set<string>();
    const at = new Map<string, number>();
    const fresh = gate('f', { status: 'allowed', answeredAt: NOW - MIN, childId: 'c9' });
    const stale = gate('s', {
      status: 'denied',
      answeredAt: NOW - (FLEET_GATE.collapseS + 5) * 1000,
    });
    trackAnswers([fresh, stale], seen, at, NOW);
    const groups = gateGroups([fresh, stale], null, at, NOW);
    expect(groups[0].views.map((v) => [v.gate.id, v.text])).toEqual([
      ['f', `${FLEET_GATE.answered.allowed} · 1 dk`],
    ]);
  });
  it('groups by round when present, else by parent', () => {
    const gs = [gate('a', { round: 'r1' }), gate('b', { round: 'r2' }), gate('c')];
    const groups = gateGroups(gs, null, new Map(), NOW);
    expect(groups.map((g) => g.views.map((v) => v.gate.id))).toEqual([['a'], ['b'], ['c']]);
  });
  it('one open card, the other pending gates compact rows; a click picks the card (TASK-580)', () => {
    // HQ sends 7 gates in one round: one card, six rows, the head counts all seven
    const isles = ['marketing', 'design', 'coding', 'qa', 'devops', 'research', 'design'] as const;
    const gs = isles.map((to, i) =>
      gate(`g${i}`, { fromIsland: 'hq', toIsland: to, round: 'r', createdAt: NOW - (9 - i) * MIN }),
    );
    let [gr] = gateGroups(gs, null, new Map(), NOW);
    expect(gr.pending).toBe(7);
    expect(gr.views.map((v) => v.mode)).toEqual(['card', ...Array<string>(6).fill('row')]);
    [gr] = gateGroups(gs, null, new Map(), NOW, new Map(), 'g4');
    expect(gr.views.filter((v) => v.mode === 'card').map((v) => v.gate.id)).toEqual(['g4']);
    expect(gr.views[0].mode).toBe('row');
    // the open gate answered (no longer pending): the oldest pending one is the card again
    const answered = gs.map((g) => (g.id === 'g4' ? { ...g, status: 'allowed' as const } : g));
    [gr] = gateGroups(answered, null, new Map(), NOW, new Map(), 'g4');
    expect(gr.views.find((v) => v.mode === 'card')?.gate.id).toBe('g0');
    expect(gr.pending).toBe(6);
    // across groups too: only one card in the whole block
    const two = [gate('a', { round: 'r1' }), gate('b', { round: 'r2', fromSessionId: 'q' })];
    expect(gateGroups(two, null, new Map(), NOW).map((g) => g.views[0].mode)).toEqual([
      'card',
      'row',
    ]);
  });
  it('the collapsed line lives with the parent, then collapseS after it ends (TASK-580)', () => {
    const at = new Map([['a', NOW - 10 * MIN]]);
    const gs = [gate('a', { status: 'allowed', answeredAt: NOW - 10 * MIN, childId: 'c' })];
    const lines = (parent?: FleetSession, now: number = NOW): string[] =>
      gateGroups(gs, null, at, now, new Map(parent ? [['p', parent]] : [])).flatMap((g) =>
        g.views.map((v) => v.text),
      );
    const t = `${FLEET_GATE.answered.allowed} · 10 dk`;
    expect(lines()).toEqual([]); // unknown parent: collapseS (300 s) from the answer, gone
    expect(lines(sess('p', { status: 'running' }))).toEqual([t]);
    expect(lines(sess('p', { status: 'waiting' }))).toEqual([t]);
    expect(lines(sess('p', { status: 'queued' }))).toEqual([t]);
    // ended 2 min ago: still there; 6 min ago: gone
    expect(lines(sess('p', { endedAt: NOW - 2 * MIN }))).toEqual([t]);
    expect(lines(sess('p', { endedAt: NOW - 6 * MIN }))).toEqual([]);
    // ended without endedAt: `updatedAt` stands in
    expect(lines(sess('p', { updatedAt: NOW - MIN }))).toEqual([t]);
    // live past the safety cap
    const late = NOW - 10 * MIN + FLEET_GATE.liveCapS * 1000 + 1;
    expect(lines(sess('p', { status: 'running' }), late)).toEqual([]);
    expect(gateLineShown(-Infinity, sess('p', { status: 'running' }), NOW)).toBe(false);
  });
  it('a gate error counts per gateId (the panel re-enables the card)', () => {
    const st = emptyFleetState();
    applyFleetEvent(st, { type: 'error', message: 'gate: x', command: 'gate', gateId: 'g1' });
    applyFleetEvent(st, { type: 'error', message: 'gate: x', command: 'gate', gateId: 'g1' });
    applyFleetEvent(st, { type: 'error', message: 'other' });
    expect([...st.gateErrors]).toEqual([['g1', 2]]);
  });
});

describe('fleet chains: mock (M42)', () => {
  afterEach(() => vi.useRealTimers());
  it('the chain is pure and appended after the drawn sessions (their order unchanged)', () => {
    expect(mockChain(NOW, 'pending')).toEqual(mockChain(NOW, 'pending'));
    const evs: FleetEvent[] = [];
    createFleetMock({ seed: 1001, now: NOW, frozen: true }, (e) => evs.push(e));
    const snap = evs[0];
    if (snap.type !== 'snapshot') throw new Error('no snapshot');
    const drawn = mockFleet(1001, NOW).sessions;
    expect(snap.sessions.slice(0, drawn.length).map((s) => s.id)).toEqual(drawn.map((s) => s.id));
    expect(snap.sessions.slice(drawn.length).map((s) => s.id)).toEqual([
      C.parentId,
      ...mockCast(NOW).sessions.map((s) => s.id), // TASK-591 portrait cast after the chain
    ]);
    expect(snap.gates.map((g) => [g.id, g.toIsland, g.status])).toEqual([
      ['gate-chain-design', 'design', 'pending'],
      ['gate-chain-coding', 'coding', 'pending'],
    ]);
    const parent = snap.sessions.find((s) => s.id === C.parentId);
    expect(parent?.status).toBe('waiting');
    const final = mockChain(NOW, 'pending').lines.get(C.parentId)?.at(-2)?.text ?? '';
    expect(final).toContain('## → design: 5 gönderi için kare görsel önerisi');
  });
  it('allowed variant: a running Design child of the waiting parent, the Coding gate pending', () => {
    const ch = mockChain(NOW, 'allowed');
    const child = ch.sessions.find((s) => s.island === 'design');
    expect(child).toMatchObject({
      status: 'running',
      parentId: C.parentId,
      requestId: C.requestId,
    });
    expect(ch.gates.map((g) => g.status)).toEqual(['allowed', 'pending']);
    const c = createFleetClient({
      mode: 'mock',
      seed: 1001,
      now: NOW,
      frozen: true,
      chain: 'allowed',
    });
    const strip = chainOf(c, C.parentId);
    expect(strip?.count).toBe(2);
    expect(strip?.roots[0].children.map((k) => k.session?.id ?? `gate:${k.island}`)).toEqual([
      C.gates[0].childId,
      'gate:coding',
    ]);
    c.dispose();
  });
  it('gate command: allow spawns the child, deny + child done resume the parent once', () => {
    vi.useFakeTimers();
    const c = createFleetClient({ mode: 'mock', seed: 1001, now: NOW });
    expect(c.send({ type: 'gate', gateId: 'nope', allow: true })).toBe(false);
    expect(c.send({ type: 'tail', sessionId: C.parentId, from: 0 })).toBe(true);
    expect(c.send({ type: 'gate', gateId: 'gate-chain-design', allow: true })).toBe(true);
    expect(c.gates.get('gate-chain-design')?.status).toBe('allowed');
    expect(c.send({ type: 'gate', gateId: 'gate-chain-design', allow: false })).toBe(false);
    const kids = [...c.sessions.values()].filter((s) => s.parentId === C.parentId);
    expect(kids).toHaveLength(1);
    expect(kids[0]).toMatchObject({ island: 'design', status: 'running', requestId: C.requestId });
    expect(c.linesOf(kids[0].id)[0].text).toContain(C.title);
    expect(c.sessions.get(C.parentId)?.status).toBe('waiting');
    expect(c.send({ type: 'gate', gateId: 'gate-chain-coding', allow: false })).toBe(true);
    expect(c.gates.get('gate-chain-coding')?.status).toBe('denied');
    // the round still waits for the Design child
    expect(c.sessions.get(C.parentId)?.status).toBe('waiting');
    vi.advanceTimersByTime(11_000);
    expect(c.sessions.get(kids[0].id)?.status).toBe('done');
    const user = c.linesOf(C.parentId).filter((l) => l.kind === 'user');
    expect(user).toHaveLength(2);
    expect(user[1].text).toContain('Design adasından rapor');
    expect(user[1].text).toContain('Coding adasına devir reddedildi');
    vi.advanceTimersByTime(12_000);
    expect(c.sessions.get(C.parentId)?.status).toBe('done');
    expect(c.linesOf(C.parentId).filter((l) => l.kind === 'user')).toHaveLength(2);
    c.dispose();
  });
  it('two runs of the same gate script emit the same events', () => {
    const run = (): FleetEvent[] => {
      vi.useFakeTimers();
      const evs: FleetEvent[] = [];
      const m = createFleetMock({ seed: 1001, now: NOW, frozen: false }, (e) => evs.push(e));
      m.command({ type: 'gate', gateId: 'gate-chain-coding', allow: true });
      m.command({ type: 'gate', gateId: 'gate-chain-design', allow: false });
      vi.advanceTimersByTime(25_000);
      m.stop();
      vi.useRealTimers();
      return evs;
    };
    expect(run()).toEqual(run());
  });
});
