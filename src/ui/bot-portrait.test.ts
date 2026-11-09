import { describe, expect, it } from 'vitest';
import {
  BOT_CHASSIS,
  BOT_EYES,
  BOT_HEADS,
  ROLE_ITEM,
  eyesFor,
  type BotLook,
} from '../content/bot-look.ts';
import { PORTRAIT } from '../content/fleet-portrait.ts';
import { createFleetMock } from '../fleet/mock.ts';
import type { FleetEvent, FleetSession, SessionStatus } from '../fleet/protocol.ts';
import { botPortraitSvg, sessionLook } from './bot-portrait.ts';

const BASE: BotLook = {
  chassis: 'scout',
  head: 'monitor',
  dept: 'coding',
  role: 'engine',
  item: 'wrench',
  shade: 1,
  eyes: 'idle',
};

/** Cheap well-formedness: tags balance, attributes quoted, no script / handler / foreign ref. */
function wellFormed(svg: string): boolean {
  const stack: string[] = [];
  const tag = /<(\/?)([a-z]+)((?:\s+[a-z-]+="[^"<>]*")*)\s*(\/?)>/gi;
  let at = 0;
  for (let m = tag.exec(svg); m; m = tag.exec(svg)) {
    if (svg.slice(at, m.index).trim() !== '') return false; // no text nodes
    at = m.index + m[0].length;
    if (m[1]) {
      if (stack.pop() !== m[2]) return false;
    } else if (!m[4]) stack.push(m[2]);
  }
  return at === svg.length && stack.length === 0;
}

describe('bot portrait (TASK-591)', () => {
  it('is a stable string for a look', () => {
    expect(botPortraitSvg(BASE, 24)).toBe(botPortraitSvg({ ...BASE }, 24));
    expect(botPortraitSvg(BASE, 24)).toContain('width="24"');
  });

  it('differs across chassis, head, eyes, dept, role and shade', () => {
    const ref = botPortraitSvg(BASE, 48);
    const variants: BotLook[] = [
      ...BOT_CHASSIS.filter((c) => c !== BASE.chassis).map((chassis) => ({ ...BASE, chassis })),
      ...BOT_HEADS.filter((h) => h !== BASE.head).map((head) => ({ ...BASE, head })),
      ...BOT_EYES.filter((e) => e !== BASE.eyes).map((eyes) => ({ ...BASE, eyes })),
      { ...BASE, dept: 'design' },
      { ...BASE, role: 'docs', item: 'book' },
      { ...BASE, shade: 2 },
    ];
    const all = new Set([ref, ...variants.map((l) => botPortraitSvg(l, 48))]);
    expect(all.size).toBe(variants.length + 1);
  });

  it('every item draws at the tip size and is dropped below `item.minPx`', () => {
    const items = new Set(
      Object.values(ROLE_ITEM).map((item) => botPortraitSvg({ ...BASE, item }, 48)),
    );
    expect(items.size).toBe(Object.keys(ROLE_ITEM).length);
    const small = PORTRAIT.item.minPx - 1;
    expect(botPortraitSvg({ ...BASE, item: 'duck' }, small)).toBe(
      botPortraitSvg({ ...BASE, item: 'none' }, small),
    );
  });

  it('is well-formed XML with nothing unsafe inside', () => {
    for (const chassis of BOT_CHASSIS)
      for (const head of BOT_HEADS)
        for (const eyes of BOT_EYES)
          for (const size of [20, 24, 40, 48]) {
            const svg = botPortraitSvg({ ...BASE, chassis, head, eyes, item: 'duck' }, size);
            expect(wellFormed(svg), `${chassis}/${head}/${eyes}/${size}`).toBe(true);
            expect(svg).not.toMatch(/script|on[a-z]+=|href|url\(|NaN|undefined/i);
          }
  });

  it('the mock fleet shows every role, status, eye state and 3 × 3 chassis / head', () => {
    const evs: FleetEvent[] = [];
    createFleetMock({ seed: 1001, now: 1_800_000_000_000, frozen: true }, (e) => evs.push(e));
    const snap = evs[0];
    if (snap.type !== 'snapshot') throw new Error('no snapshot');
    const gated = new Set(
      snap.gates.filter((g) => g.status === 'pending').map((g) => g.fromSessionId),
    );
    expect(gated.size).toBeGreaterThan(0);
    const looks = snap.sessions.map((s: FleetSession) => sessionLook(s, gated.has(s.id)));
    const roles = new Set(snap.sessions.map((s) => s.agent));
    for (const r of Object.keys(ROLE_ITEM)) expect(roles, r).toContain(r);
    expect([...roles].some((r) => !(r in ROLE_ITEM))).toBe(true);
    const statuses = new Set(snap.sessions.map((s) => s.status));
    const all: SessionStatus[] = ['queued', 'running', 'waiting', 'done', 'error', 'stopped'];
    for (const st of all) expect(statuses, st).toContain(st);
    expect(new Set(looks.map((l) => l.eyes))).toEqual(new Set(BOT_EYES));
    expect(new Set(looks.map((l) => `${l.chassis}/${l.head}`)).size).toBe(9);
    const strings = new Set(looks.map((l) => botPortraitSvg(l, PORTRAIT.px.fleetRow)));
    expect(strings.size).toBeGreaterThanOrEqual(9);
    // eyes follow the gate: the gated parent asks, a waiting one without a gate idles
    for (const s of snap.sessions)
      expect(sessionLook(s, gated.has(s.id)).eyes).toBe(eyesFor(s.status, gated.has(s.id)));
  });
});
