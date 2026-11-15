import { describe, expect, it } from 'vitest';
import { BOT_BEAT, BOT_BEATS, BOT_DONE, BOT_GAIT, BOT_SWAP } from '../content/bot-motion.ts';
import { BOT_CHASSIS } from '../content/bot-look.ts';
import { beatPose, DONE_TOTAL, doneHop, restPose, swapScale } from './bot-motion.ts';

describe('bot motion curves (TASK-592)', () => {
  it('gait: hauler waddles slower and rolls more than scout, spire glides low and leans', () => {
    const { scout, hauler, spire } = BOT_GAIT;
    expect(hauler.stepPeriod).toBeCloseTo(0.55);
    expect(hauler.roll).toBeCloseTo((6 * Math.PI) / 180);
    expect(hauler.roll).toBeGreaterThan(scout.roll);
    expect(spire.hop).toBeCloseTo(0.04);
    expect(spire.lean).toBeCloseTo((4 * Math.PI) / 180);
    expect(spire.glide).toBe(true);
    expect(BOT_CHASSIS.every((c) => BOT_GAIT[c].stepPeriod > 0)).toBe(true);
  });

  it('every idle beat starts and ends at rest and moves in between', () => {
    for (const beat of BOT_BEATS) {
      const a = beatPose(beat, 0, restPose());
      const b = beatPose(beat, 1, restPose());
      for (const k of ['yaw', 'pitch', 'roll', 'y', 'arm'] as const) {
        expect(a[k]).toBeCloseTo(0, 9);
        expect(b[k]).toBeCloseTo(0, 6);
      }
      let peak = 0;
      for (let u = 0.05; u < 1; u += 0.05) {
        const p = beatPose(beat, u, restPose());
        peak = Math.max(peak, Math.abs(p.yaw), Math.abs(p.pitch), Math.abs(p.roll), p.y, p.arm);
      }
      expect(peak).toBeGreaterThan(0.03);
      expect(BOT_BEAT.len[beat]).toBeGreaterThan(1);
    }
  });

  it('done hop: one arc of the set height, squash at takeoff and landing, then over', () => {
    const p = restPose();
    expect(doneHop(0.5 * BOT_DONE.anticipate, p)).toBe(true);
    expect(p.sy).toBeLessThan(1);
    let top = 0;
    for (let t = 0; t < DONE_TOTAL; t += 0.01) {
      const q = restPose();
      if (doneHop(t, q)) top = Math.max(top, q.y);
    }
    expect(top).toBeCloseTo(BOT_DONE.height, 1);
    expect(doneHop(DONE_TOTAL + 0.01, restPose())).toBe(false);
    expect(BOT_DONE.sparkles.count).toBe(6);
  });

  it('swap: squashes first, swaps at the bottom, springs back to 1', () => {
    expect(swapScale(0).swapped).toBe(false);
    expect(swapScale(BOT_SWAP.squashS * 0.99).sy).toBeCloseTo(BOT_SWAP.squashY, 1);
    const mid = swapScale(BOT_SWAP.squashS + 0.05);
    expect(mid.swapped).toBe(true);
    expect(mid.sy).toBeLessThan(1.2);
    const end = swapScale(BOT_SWAP.squashS + BOT_SWAP.popS + 0.01);
    expect(end.done).toBe(true);
    expect(end.sy).toBe(1);
  });

  it('is a pure function of time', () => {
    const a = beatPose('look', 0.37, restPose());
    const b = beatPose('look', 0.37, restPose());
    expect(a).toEqual(b);
  });
});
