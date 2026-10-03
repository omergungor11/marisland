import { describe, expect, it } from 'vitest';
import { parseParams } from './params.ts';

describe('params', () => {
  it('parses defaults', () => {
    const p = parseParams('');
    expect(p.seed).toBe(1001);
    expect(p.freeze).toBe(false);
    expect(Number.isNaN(p.time)).toBe(true);
    expect(p.hud).toBe(true);
  });
  it('parses times as hours, h:mm and fraction', () => {
    expect(parseParams('?time=15:30').time).toBeCloseTo(15.5);
    expect(parseParams('?time=0.5').time).toBeCloseTo(12);
    expect(parseParams('?time=22').time).toBeCloseTo(22);
  });
  it('parses capture flags', () => {
    const p = parseParams(
      '?seed=42&shot=W1&freeze=1&simt=30&quality=low&hud=0&debug=mask&weather=rain',
    );
    expect(p.seed).toBe(42);
    expect(p.shot).toBe('W1');
    expect(p.freeze).toBe(true);
    expect(p.simt).toBe(30);
    expect(p.quality).toBe('low');
    expect(p.hud).toBe(false);
    expect(p.debug).toBe('mask');
    expect(p.weather).toBe('rain');
  });
});
