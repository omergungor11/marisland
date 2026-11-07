import { describe, expect, it } from 'vitest';
import { CAMERA_MOVE } from '../content/tiers.ts';
import { createKeyState, velocityFor, type KeyMoveConfig } from './keys.ts';

const map = CAMERA_MOVE.keys.map;
const cfg: KeyMoveConfig = {
  unitsPerSecond: 100,
  refDistance: 400,
  minScale: 0.1,
  maxScale: 2,
  rotateRadPerSecond: 2,
  rampSeconds: 0.2,
};
const dt = 1 / 60;

/** Run `seconds` of frames and return the last frame's move. */
function run(s: ReturnType<typeof createKeyState>, seconds: number, dist = 400) {
  let m = velocityFor(s, dt, dist, cfg);
  for (let t = dt; t < seconds - 1e-9; t += dt) m = velocityFor(s, dt, dist, cfg);
  return m;
}

describe('keyboard camera key state', () => {
  it('a single key reaches full speed after the ramp', () => {
    const s = createKeyState(map);
    expect(s.down('W')).toBe(true);
    const m = run(s, 0.5);
    expect(m.forward).toBeCloseTo(100 * dt, 6);
    expect(m.truckX).toBe(0);
    expect(m.azimuth).toBe(0);
  });

  it('arrows mirror WASD, unbound keys are ignored', () => {
    const s = createKeyState(map);
    expect(s.down('ArrowLeft')).toBe(true);
    expect(s.down('x')).toBe(false);
    expect(run(s, 0.5).truckX).toBeCloseTo(-100 * dt, 6);
  });

  it('opposite keys cancel', () => {
    const s = createKeyState(map);
    s.down('w');
    s.down('s');
    s.down('q');
    s.down('e');
    const m = run(s, 0.5);
    expect(m.forward).toBe(0);
    expect(m.azimuth).toBe(0);
  });

  it('Q turns positive azimuth at the configured rate', () => {
    const s = createKeyState(map);
    s.down('q');
    expect(run(s, 0.5).azimuth).toBeCloseTo(2 * dt, 6);
  });

  it('ground speed scales linearly with distance, clamped', () => {
    const at = (dist: number): number => {
      const s = createKeyState(map);
      s.down('d');
      return run(s, 0.5, dist).truckX / dt;
    };
    expect(at(200)).toBeCloseTo(50, 6);
    expect(at(800)).toBeCloseTo(200, 6);
    expect(at(10)).toBeCloseTo(10, 6); // minScale
    expect(at(5000)).toBeCloseTo(200, 6); // maxScale
  });

  it('eases in and out over rampSeconds instead of snapping', () => {
    const s = createKeyState(map);
    s.down('w');
    const first = velocityFor(s, dt, 400, cfg).forward;
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThan(0.05 * 100 * dt);
    const mid = run(s, 0.1 - dt).forward;
    expect(mid).toBeCloseTo(0.5 * 100 * dt, 6); // smoothstep(0.5) = 0.5
    run(s, 0.3);
    s.up('w');
    const after = velocityFor(s, dt, 400, cfg).forward;
    expect(after).toBeGreaterThan(0.9 * 100 * dt);
    expect(s.active).toBe(true);
    run(s, 0.25);
    expect(velocityFor(s, dt, 400, cfg).forward).toBe(0);
    expect(s.active).toBe(false);
  });

  it('clear (blur) releases every key', () => {
    const s = createKeyState(map);
    s.down('w');
    s.down('e');
    run(s, 0.5);
    s.clear();
    expect(s.held.size).toBe(0);
    run(s, 0.3);
    expect(s.active).toBe(false);
  });

  it('clamps a tab-switch dt spike', () => {
    const s = createKeyState(map);
    s.down('w');
    // 0.1 s of ramp: drive 0.5 → smoothstep 0.5, over 0.1 s, not 5 s
    expect(velocityFor(s, 5, 400, cfg).forward).toBeCloseTo(0.5 * 100 * 0.1, 6);
  });
});
