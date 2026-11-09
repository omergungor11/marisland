import { describe, expect, it } from 'vitest';
import { FLEET_CARD as C, FLEET_PANEL as P } from '../content/fleet.ts';
import type { FleetGate, FleetSession } from '../fleet/protocol.ts';
import type { CourierPlan } from '../life/courier-state.ts';
import {
  cardStatus,
  lastGate,
  lastVoyage,
  placeCard,
  sailProgress,
  statusLine,
  tipText,
} from './courier-card.ts';

const MIN = 60_000;
const plan = (o: Partial<CourierPlan>): CourierPlan => ({
  island: 'marketing',
  phase: 'idle',
  from: 'marketing',
  to: 'marketing',
  gateId: null,
  t0: -Infinity,
  t1: Infinity,
  crates: [],
  ...o,
});
const gate = (o: Partial<FleetGate>): FleetGate => ({
  id: 'g1',
  requestId: 'r1',
  fromSessionId: 's1',
  fromIsland: 'marketing',
  toIsland: 'design',
  prompt: 'p',
  status: 'allowed',
  createdAt: 0,
  ...o,
});
const session = (o: Partial<FleetSession>): FleetSession => ({
  id: 'c1',
  island: 'design',
  agent: 'default',
  title: 't',
  status: 'done',
  startedAt: 0,
  updatedAt: 0,
  turns: 1,
  requestId: 'r1',
  cwd: '/',
  ...o,
});

describe('courier card status', () => {
  it('maps every phase to the Turkish status words', () => {
    expect(C.status[cardStatus(plan({ phase: 'loading' }))]).toBe('bekliyor');
    expect(C.status[cardStatus(plan({ phase: 'outbound' }))]).toBe('yolda');
    expect(C.status[cardStatus(plan({ phase: 'delivered' }))]).toBe('teslim edildi');
    expect(C.status[cardStatus(plan({ phase: 'returning' }))]).toBe('rapor dönüyor');
    expect(C.status[cardStatus(plan({ phase: 'idle' }))]).toBe('boşta');
  });

  it('adds the time since the phase began, none without a start', () => {
    expect(statusLine(plan({ phase: 'outbound', t0: 0, t1: 30_000 }), 10_000)).toBe(
      'yolda · az önce',
    );
    expect(statusLine(plan({ phase: 'delivered', t0: 0 }), 3 * MIN + 5000)).toBe(
      'teslim edildi · 3 dk',
    );
    expect(statusLine(plan({ phase: 'idle' }), 1e12)).toBe('boşta');
  });

  it('progress only while sailing, clamped', () => {
    expect(sailProgress(plan({ phase: 'outbound', t0: 0, t1: 20_000 }), 5000)).toBe(0.25);
    expect(sailProgress(plan({ phase: 'returning', t0: 0, t1: 20_000 }), 40_000)).toBe(1);
    expect(sailProgress(plan({ phase: 'delivered', t0: 0, t1: 20_000 }), 5000)).toBeNull();
    expect(sailProgress(plan({ phase: 'loading', t0: 0 }), 5000)).toBeNull();
  });

  it('tip names the leg of the gate (also on the way back)', () => {
    const g = gate({});
    expect(tipText(plan({ phase: 'outbound', to: 'design', gateId: 'g1' }), g)).toBe(
      'Kurye · Marketing → Design · yolda',
    );
    expect(
      tipText(plan({ phase: 'returning', from: 'design', to: 'marketing', gateId: 'g1' }), g),
    ).toBe('Kurye · Marketing → Design · rapor dönüyor');
    expect(tipText(plan({}), undefined)).toBe('Kurye · Marketing · boşta');
  });
});

describe('last voyage', () => {
  it('picks the latest answered gate of the island', () => {
    const gs = [
      gate({ id: 'a', answeredAt: 10 }),
      gate({ id: 'b', answeredAt: 30 }),
      gate({ id: 'c', status: 'pending', createdAt: 40 }),
      gate({ id: 'd', fromIsland: 'qa', answeredAt: 50 }),
    ];
    expect(lastGate(gs, 'marketing')?.id).toBe('b');
    expect(lastGate(gs, 'hq')).toBeNull();
  });

  it('reads the child status and its end, the denial, or no voyage', () => {
    const sessions = new Map([['c1', session({ status: 'done', endedAt: 0 })]]);
    expect(
      lastVoyage([gate({ childId: 'c1', answeredAt: 0 })], sessions, 'marketing', 12 * MIN),
    ).toBe(`Son sefer → Design · ${P.statusLabel.done} · 12 dk önce`);
    expect(lastVoyage([gate({ status: 'denied', answeredAt: 0 })], sessions, 'marketing', 10)).toBe(
      'Son sefer → Design · reddedildi · az önce',
    );
    expect(lastVoyage([], sessions, 'marketing', 0)).toBe(C.lastNone);
  });
});

describe('placeCard', () => {
  const W = 288;
  const H = 200;
  it('right of and above the ship when it fits', () => {
    expect(placeCard(400, 400, W, H, 1600, 900, null)).toEqual({
      x: 400 + C.dx,
      y: 400 - C.dy - H,
    });
  });

  it('flips left near the right edge and below near the top', () => {
    const p = placeCard(1500, 120, W, H, 1600, 900, null);
    expect(p.x).toBe(1500 - C.dx - W);
    expect(p.y).toBe(120 + C.dy);
  });

  it('never covers the fleet panel', () => {
    const avoid = { l: 16, t: 72, r: 376, b: 700 };
    const p = placeCard(200, 400, W, H, 1600, 900, avoid);
    expect(p.x).toBeGreaterThanOrEqual(avoid.r + C.avoidPad);
  });

  it('stays inside the viewport and above the dock when nothing fits', () => {
    const p = placeCard(480, 500, W, 420, 960, 540, null);
    expect(p.x).toBeGreaterThanOrEqual(C.margin);
    expect(p.x + W).toBeLessThanOrEqual(960 - C.margin);
    expect(p.y).toBeGreaterThanOrEqual(C.top);
  });

  it('keeps clear of the bottom dock', () => {
    const p = placeCard(480, 520, W, H, 960, 540, null);
    expect(p.y + H).toBeLessThanOrEqual(540 - P.bottomClear);
  });
});
