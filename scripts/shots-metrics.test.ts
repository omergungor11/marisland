import { describe, expect, it } from 'vitest';
import { computeMetrics, isBlank, isMagenta } from './shots-metrics.ts';

function fill(n: number, rgb: [number, number, number]): Uint8Array {
  const a = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) a.set([...rgb, 255], i * 4);
  return a;
}

describe('shots metrics', () => {
  it('flags a flat frame as blank', () => {
    expect(isBlank(computeMetrics(fill(1000, [90, 120, 200]), 4))).toBe(true);
  });
  it('does not flag a varied frame', () => {
    const a = fill(1000, [0, 0, 0]);
    for (let i = 0; i < 500; i++) a.set([255, 255, 255, 255], i * 4);
    expect(isBlank(computeMetrics(a, 4))).toBe(false);
  });
  it('detects shader-error magenta', () => {
    expect(isMagenta(computeMetrics(fill(1000, [255, 0, 255]), 4))).toBe(true);
    expect(isMagenta(computeMetrics(fill(1000, [10, 200, 30]), 4))).toBe(false);
  });
  it('bins hue', () => {
    const m = computeMetrics(fill(100, [255, 0, 0]), 4);
    expect(m.hueHist[0]).toBe(1);
  });
});
