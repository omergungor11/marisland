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
  it('parses HUD panel and intro capture time', () => {
    const d = parseParams('');
    expect(d.panel).toBe('');
    expect(Number.isNaN(d.introt)).toBe(true);
    expect(d.intro).toBe(true);
    expect(d.rm).toBe(false);
    const p = parseParams('?panel=photo&introt=4.5&intro=0&rm=1');
    expect(p.panel).toBe('photo');
    expect(p.introt).toBeCloseTo(4.5);
    expect(p.intro).toBe(false);
    expect(p.rm).toBe(true);
    expect(parseParams('?panel=settings').panel).toBe('settings');
    expect(parseParams('?panel=nope').panel).toBe('');
    expect(Number.isNaN(parseParams('?introt=-1').introt)).toBe(true);
    expect(Number.isNaN(parseParams('?introt=abc').introt)).toBe(true);
    expect(parseParams('?introt=0').introt).toBe(0);
  });
});
