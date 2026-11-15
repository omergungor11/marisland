import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { BOT_CHASSIS, type BotLook } from '../content/bot-look.ts';
import { BOT_SWAP } from '../content/bot-motion.ts';
import { FIXED_STEP } from '../core/clock.ts';
import { Scope } from '../core/scope.ts';
import { generateWorld } from '../world/index.ts';
import { createLife } from './index.ts';
import type { Workers } from './workers.ts';

const STATE_WORK = 4;
const world = generateWorld(1001);

/** A life whose camera stands next to the first seated bot, so it is revealed (vis 1) and simulated. */
function rig(): { life: ReturnType<typeof createLife>; w: Workers; bot: number } {
  const cam = new THREE.Vector3(0, 400, 0);
  const life = createLife({
    world,
    scope: new Scope('workers-motion-test'),
    seed: 1001,
    quality: 'medium',
    water: { splat: () => undefined },
    counters: { agents: 0 } as never,
    getTier: () => 2,
    cameraPos: cam,
  });
  life.onTier(2);
  const w = life.kinds.workers as Workers;
  for (let i = 0; i < 90; i++) life.fixedUpdate(FIXED_STEP);
  const ids = [...Array(w.capacity).keys()];
  const seated = ids.find((i) => w.active[i] && w.stateOf(i) === STATE_WORK);
  const bot = seated ?? ids.find((i) => w.active[i])!;
  cam.set(w.x[bot], w.y[bot] + 6, w.z[bot]);
  for (let i = 0; i < 60; i++) life.fixedUpdate(FIXED_STEP);
  return { life, w, bot };
}

const wantOther = (w: Workers, bot: number, eyes: BotLook['eyes']): BotLook => ({
  ...w.lookOf(bot),
  chassis: BOT_CHASSIS[(w.chassisOf(bot) + 1) % 3],
  eyes,
});

describe('bot motion in the workers sim (TASK-592)', () => {
  it('chassis swap at rest: squash first, swap at the bottom under a poof, then back to full height', () => {
    const { life, w, bot } = rig();
    expect(w.stateOf(bot)).toBe(STATE_WORK);
    w.fxOn = true;
    const before = w.chassisOf(bot);
    w.setLook(bot, wantOther(w, bot, 'idle'));
    life.update(1, 0);
    expect(w.chassisOf(bot)).toBe(before);
    let minSy = 9;
    let swappedAt = -1;
    const steps = Math.ceil((BOT_SWAP.squashS + BOT_SWAP.popS + 0.3) / FIXED_STEP);
    for (let i = 0; i < steps; i++) {
      life.fixedUpdate(FIXED_STEP);
      life.update(1, 0);
      minSy = Math.min(minSy, w.sy[bot]);
      if (swappedAt < 0 && w.chassisOf(bot) !== before) swappedAt = i * FIXED_STEP;
    }
    expect(swappedAt).toBeGreaterThanOrEqual(BOT_SWAP.squashS - 2 * FIXED_STEP);
    expect(swappedAt).toBeLessThan(BOT_SWAP.squashS + 3 * FIXED_STEP);
    expect(minSy).toBeLessThan(0.7);
    expect(w.fx.filter((e) => e.kind === 'poof')).toHaveLength(1);
    expect(w.sy[bot]).toBeGreaterThan(0.9);
    expect(w.sy[bot]).toBeLessThan(1.1);
  });

  it('eyes -> done: one hop raises the bot and queues one sparkle event', () => {
    const { life, w, bot } = rig();
    w.fxOn = true;
    const y0 = w.y[bot];
    w.setLook(bot, { ...w.lookOf(bot), eyes: 'done' });
    life.update(1, 0);
    expect(w.fx.filter((e) => e.kind === 'done')).toHaveLength(1);
    let top = 0;
    for (let i = 0; i < 40; i++) {
      life.fixedUpdate(FIXED_STEP);
      top = Math.max(top, w.y[bot] - y0);
    }
    expect(top).toBeGreaterThan(0.2);
    // asking for done again (same state) does not hop twice
    w.fx.length = 0;
    w.setLook(bot, { ...w.lookOf(bot), eyes: 'done' });
    life.update(1, 0);
    expect(w.fx).toHaveLength(0);
  });

  it('nothing is queued while no fx system listens', () => {
    const { life, w, bot } = rig();
    w.setLook(bot, wantOther(w, bot, 'done'));
    for (let i = 0; i < 30; i++) {
      life.fixedUpdate(FIXED_STEP);
      life.update(1, 0);
    }
    expect(w.fx).toHaveLength(0);
  });

  it('gate eyes tip the head up; the same steps give the same pose (determinism)', () => {
    const a = rig();
    const b = rig();
    a.w.setLook(a.bot, { ...a.w.lookOf(a.bot), eyes: 'gate' });
    for (let i = 0; i < 60; i++) {
      a.life.fixedUpdate(FIXED_STEP);
      b.life.fixedUpdate(FIXED_STEP);
      a.life.update(1, 0);
      b.life.update(1, 0);
    }
    expect(a.w.pitch[a.bot] - b.w.pitch[b.bot]).toBeGreaterThan(0.2);
    // two identical rigs agree on everything else
    const c = rig();
    const d = rig();
    for (let i = 0; i < 200; i++) {
      c.life.fixedUpdate(FIXED_STEP);
      d.life.fixedUpdate(FIXED_STEP);
    }
    expect([...c.w.y]).toEqual([...d.w.y]);
    expect([...c.w.pitch]).toEqual([...d.w.pitch]);
    expect([...c.w.roll]).toEqual([...d.w.roll]);
  });

  it('idle beats are staggered: bots do not all move in the same step', () => {
    const { life, w } = rig();
    const pitches = new Set<number>();
    for (let i = 0; i < 600; i++) {
      life.fixedUpdate(FIXED_STEP);
      if (i % 100 === 0)
        for (let k = 0; k < w.capacity; k++) if (w.active[k]) pitches.add(w.pitch[k]);
    }
    expect(pitches.size).toBeGreaterThan(3);
  });
});
