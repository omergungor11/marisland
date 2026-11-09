import { describe, expect, it } from 'vitest';
import { BOT_CHASSIS, BOT_HEADS, botLook, packLook, roleItem, unpackLook } from './bot-look.ts';

describe('botLook', () => {
  it('is deterministic for a seed', () => {
    expect(botLook('sess-1', 'coding', 'shader')).toEqual(botLook('sess-1', 'coding', 'shader'));
  });

  it('spreads 200 seeds over every chassis and head', () => {
    const chassis = new Set<string>();
    const heads = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const l = botLook(`seed-${i}`, 'qa');
      chassis.add(l.chassis);
      heads.add(l.head);
    }
    expect(chassis.size).toBe(BOT_CHASSIS.length);
    expect(heads.size).toBe(BOT_HEADS.length);
  });

  it('maps roles to items and unknown roles to none', () => {
    expect(roleItem('Shader')).toBe('brush');
    expect(roleItem('general-purpose')).toBe('none');
    expect(botLook('x', 'hq').item).toBe('none');
  });

  it('packs and unpacks every combination', () => {
    for (let c = 0; c < 27; c++) {
      const u = unpackLook(c);
      expect(packLook({ ...u, dept: 'hq', role: '', item: 'none', eyes: 'idle' })).toBe(c);
    }
  });
});
