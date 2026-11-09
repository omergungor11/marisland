import { describe, expect, it } from 'vitest';
import { COURIER } from '../content/fleet-ships.ts';
import { FLEET } from '../content/fleet.ts';
import { mockChain } from '../fleet/mock.ts';
import type { FleetGate, FleetSession } from '../fleet/protocol.ts';
import { courierState } from './courier-state.ts';

const NOW = FLEET.captureNow;
const S = 1000;
const D = COURIER.voyageS[0] * S;
const U = COURIER.dwell.unload * S;

const sess = (id: string, o: Partial<FleetSession> = {}): FleetSession => ({
  id,
  island: 'design',
  agent: 'a',
  title: id,
  status: 'running',
  startedAt: NOW,
  updatedAt: NOW,
  turns: 0,
  requestId: 'req',
  cwd: 'x',
  ...o,
});
const gate = (id: string, o: Partial<FleetGate> = {}): FleetGate => ({
  id,
  requestId: 'req',
  fromSessionId: 'p',
  fromIsland: 'marketing',
  toIsland: 'design',
  prompt: 'x',
  status: 'pending',
  createdAt: NOW,
  ...o,
});
const map = (l: FleetSession[]) => new Map(l.map((s) => [s.id, s]));
const of = (plans: ReturnType<typeof courierState>, i: string) =>
  plans.find((p) => p.island === i)!;

describe('courierState', () => {
  it('one plan per island, idle without gates', () => {
    const p = courierState([], new Map(), NOW);
    expect(p).toHaveLength(7);
    expect(p.every((x) => x.phase === 'idle' && x.crates.length === 0)).toBe(true);
  });

  it('pending: loading at the from island with the TO crate', () => {
    const p = of(courierState([gate('a')], new Map(), NOW + 5 * S), 'marketing');
    expect(p.phase).toBe('loading');
    expect(p.crates).toEqual(['design']);
    expect(p.gateId).toBe('a');
    expect(p.t1).toBe(Infinity);
  });

  it('allowed: outbound, delivered, then waits for the child', () => {
    const g = gate('a', { status: 'allowed', answeredAt: NOW + 10 * S, childId: 'c' });
    const ss = map([sess('c')]);
    const at = (t: number) => of(courierState([g], ss, NOW + t, {}), 'marketing');
    expect(at(5 * S).phase).toBe('loading');
    const o = at(10 * S + 4000);
    expect(o.phase).toBe('outbound');
    expect(o.crates).toEqual(['design']);
    expect([o.t0, o.t1]).toEqual([NOW + 10 * S, NOW + 10 * S + D]);
    const d = at(10 * S + D + 1000);
    expect(d.phase).toBe('delivered');
    expect(d.crates).toEqual([]);
    expect(at(10 * S + D + U + 600_000).phase).toBe('delivered');
  });

  it('child done returns with an ok scroll, error with a fail scroll, then idle', () => {
    const ans = NOW + 10 * S;
    const g = gate('a', { status: 'allowed', answeredAt: ans, childId: 'c' });
    const endAt = ans + 120 * S;
    for (const [status, scroll] of [
      ['done', 'ok'],
      ['stopped', 'ok'],
      ['error', 'fail'],
    ] as const) {
      const ss = map([sess('c', { status, endedAt: endAt })]);
      const r = of(courierState([g], ss, endAt + 2000), 'marketing');
      expect(r.phase).toBe('returning');
      expect(r.scroll).toBe(scroll);
      expect(r.from).toBe('design');
      expect(r.to).toBe('marketing');
      const home = of(courierState([g], ss, endAt + D + 1000), 'marketing');
      expect(home.phase).toBe('idle');
      expect(home.scroll).toBe(scroll);
      const done = of(courierState([g], ss, endAt + D + U + 1000), 'marketing');
      expect(done.phase).toBe('idle');
      expect(done.scroll).toBeUndefined();
    }
    // a child still live keeps the ship at the target
    const live = map([sess('c', { status: 'running' })]);
    expect(of(courierState([g], live, endAt + 9e6), 'marketing').phase).toBe('delivered');
  });

  it('denied: crate lifts off, then idle', () => {
    const g = gate('a', { status: 'denied', answeredAt: NOW + 4 * S });
    const early = of(courierState([g], new Map(), NOW + 4 * S + 200), 'marketing');
    expect(early.phase).toBe('idle');
    expect(early.lift).toBe('design');
    expect(early.crates).toEqual([]);
    expect(of(courierState([g], new Map(), NOW + 60 * S), 'marketing').lift).toBeUndefined();
    expect(of(courierState([g], new Map(), NOW + 2 * S), 'marketing').crates).toEqual(['design']);
  });

  it('two gates in a round: two crates, second voyage after the first returns', () => {
    const a = gate('a', { status: 'allowed', answeredAt: NOW + S, childId: 'ca' });
    const b = gate('b', {
      toIsland: 'coding',
      createdAt: NOW + 1,
      status: 'allowed',
      answeredAt: NOW + 2 * S,
      childId: 'cb',
    });
    const endA = NOW + 60 * S;
    const ss = map([sess('ca', { status: 'done', endedAt: endA }), sess('cb')]);
    const mid = of(courierState([a, b], ss, NOW + 5 * S), 'marketing');
    expect(mid.phase).toBe('outbound');
    expect(mid.gateId).toBe('a');
    expect(mid.crates).toEqual(['design', 'coding']);
    // after A is home, B departs
    const homeEnd = endA + D + U;
    const b1 = of(courierState([a, b], ss, homeEnd + 1000), 'marketing');
    expect(b1.phase).toBe('outbound');
    expect(b1.gateId).toBe('b');
    expect(b1.t0).toBe(homeEnd);
    // other islands unaffected
    expect(of(courierState([a, b], ss, NOW + 5 * S), 'design').phase).toBe('idle');
  });

  it('snapshot at an arbitrary now equals the same call again; future gates are invisible', () => {
    const g = gate('a', { status: 'allowed', answeredAt: NOW + 10 * S, childId: 'c' });
    const ss = map([sess('c')]);
    for (const t of [-5 * S, 0, 11 * S, 100 * S, 1e7]) {
      expect(courierState([g], ss, NOW + t)).toEqual(courierState([g], ss, NOW + t));
    }
    expect(of(courierState([g], ss, NOW - S), 'marketing').phase).toBe('idle');
  });

  it('mock chain: allowed variant is mid-voyage at capture time, pending loads two crates', () => {
    const al = mockChain(NOW, 'allowed');
    const p = of(
      courierState(al.gates, map(al.sessions), NOW + 2 * S, { voyageS: () => 30 }),
      'marketing',
    );
    expect(p.phase).toBe('outbound');
    expect(p.crates).toEqual(['design', 'coding']);
    const pe = mockChain(NOW, 'pending');
    const q = of(courierState(pe.gates, map(pe.sessions), NOW), 'marketing');
    expect(q.phase).toBe('loading');
    expect(q.crates).toEqual(['design', 'coding']);
  });
});
