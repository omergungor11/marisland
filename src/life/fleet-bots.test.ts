import { describe, expect, it } from 'vitest';
import type { FleetSession, SessionStatus } from '../fleet/protocol.ts';
import { bindFleetToBots, type BotHost } from './fleet-bots.ts';
import { assignBots } from './fleet-bots-map.ts';

const sess = (id: string, island = 'coding', status: SessionStatus = 'running'): FleetSession =>
  ({ id, island, status, title: id, agent: 'default' }) as FleetSession;

describe('assignBots', () => {
  const counts = { coding: 6, qa: 3 };
  const ids = ['a1', 'b2', 'c3', 'd4', 'e5'].map((id) => ({ id, island: 'coding' }));

  it('is deterministic and independent of input order', () => {
    const one = assignBots(ids, counts);
    const two = assignBots([...ids].reverse(), counts);
    expect([...one].sort()).toEqual([...two].sort());
    expect(assignBots(ids, counts)).toEqual(one);
  });

  it('gives every session its own slot by linear probing and drops the overflow', () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ id: `s-${i}`, island: 'qa' }));
    const got = assignBots(many, counts);
    expect(got.size).toBe(3);
    expect(new Set(got.values()).size).toBe(3);
    for (const slot of got.values()) expect(slot).toBeLessThan(3);
    const first = assignBots(ids, counts);
    expect(new Set(first.values()).size).toBe(ids.length);
  });

  it('keeps held slots when a newcomer arrives, and ignores islands without workers', () => {
    const before = assignBots(ids, counts);
    const after = assignBots([...ids, { id: 'a0', island: 'coding' }], counts, before);
    for (const [id, slot] of before) expect(after.get(id)).toBe(slot);
    expect(assignBots([{ id: 'x', island: 'design' }], counts).size).toBe(0);
  });
});

describe('bindFleetToBots', () => {
  const rig = () => {
    const sessions = new Map<string, FleetSession>();
    const subs = new Set<() => void>();
    const store = {
      sessions,
      subscribe: (cb: () => void) => (subs.add(cb), () => subs.delete(cb)),
    };
    const pinned = new Set<number>();
    // coding = THEME_IDS index 1: bots 10..15
    const host: BotHost = {
      residentsOf: (k) => (k === 1 ? [10, 11, 12, 13, 14, 15] : []),
      pin: (i) => pinned.add(i),
      unpin: (i) => pinned.delete(i),
    };
    const set = (s: FleetSession): void => {
      sessions.set(s.id, s);
      for (const cb of subs) cb();
    };
    return {
      store,
      host,
      pinned,
      set,
      bind: () => bindFleetToBots(store, { kinds: { workers: host } }, { releaseDelayS: 5 }),
    };
  };

  it('pins a bot for a live session and the same bot every run', () => {
    const a = rig();
    const fb = a.bind();
    a.set(sess('s1'));
    a.set(sess('s2', 'coding', 'waiting'));
    fb.update(1);
    const first = [...a.pinned].sort();
    expect(first).toHaveLength(2);
    expect(fb.sessionOf(first[0])).not.toBeNull();
    const b = rig();
    const fb2 = b.bind();
    b.set(sess('s2', 'coding', 'waiting'));
    b.set(sess('s1'));
    fb2.update(99);
    expect([...b.pinned].sort()).toEqual(first);
  });

  it('releases an ended session after the sim-time delay, not before', () => {
    const r = rig();
    const fb = r.bind();
    r.set(sess('s1'));
    fb.update(0);
    expect(fb.bound).toBe(1);
    r.set(sess('s1', 'coding', 'done'));
    fb.update(10);
    expect(fb.bound).toBe(1);
    fb.update(14.9);
    expect(fb.bound).toBe(1);
    fb.update(15);
    expect(fb.bound).toBe(0);
    expect(r.pinned.size).toBe(0);
  });

  it('a session that goes live again during the delay keeps its bot', () => {
    const r = rig();
    const fb = r.bind();
    r.set(sess('s1'));
    fb.update(0);
    const bot = [...r.pinned][0];
    r.set(sess('s1', 'coding', 'error'));
    fb.update(1);
    r.set(sess('s1', 'coding', 'running'));
    fb.update(2);
    fb.update(60);
    expect([...r.pinned]).toEqual([bot]);
  });

  it('dispose unpins everything', () => {
    const r = rig();
    const fb = r.bind();
    r.set(sess('s1'));
    fb.update(0);
    fb.dispose();
    expect(r.pinned.size).toBe(0);
  });
});
