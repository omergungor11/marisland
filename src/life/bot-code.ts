import {
  BOT_CHASSIS,
  BOT_EYES,
  BOT_HEADS,
  type BotChassis,
  type BotEyes,
  type BotHead,
  type RoleItem,
} from '../content/bot-look.ts';
import { CARRIED_ITEM_SLOT } from '../content/themes.ts';
import { ITEM_STRIDE, LOOK_STRIDE } from './life-material.ts';

/**
 * Bot instance codes (TASK-590), no three import. A bot lives in ONE of three meshes (chassis), so the
 * chassis is not an attribute; everything else rides in the per-instance `aSeed` of the existing life
 * program (no new vertex attribute, 15 of 16 stay used):
 *
 *   aSeed = acc + ITEM_STRIDE * item + LOOK_STRIDE * (head + 3 * eyes) + phase01
 *
 *   acc   0..6     department accessory (`ThemeDef.accessory`)
 *   item  0..15    carried item, CARRIED_ITEM_SLOT - 6 (0 = none)
 *   head  0..2     monitor / visor / cam
 *   eyes  0..4     idle / working / gate / error / done
 *
 * The shade (0..2) is the instance tint's lightness step (CPU, `BOT_SHADE_L`), not a code. The eye state
 * could have used `aGait.y` 4..8, but that range is the culture arm poses (`floor(y / 4)` = pose code).
 * Both strides are multiples of 100, so `sin(aSeed * 2π)` / `fract(aSeed * 7.31)` phases are unchanged.
 * `visibleVariants` is the JS twin of the GLSL decode in life-material.ts (mode 8).
 */

export interface BotCode {
  acc: number;
  item: number;
  head: number;
  eyes: number;
}

/** Integer part of `aSeed` for a bot. */
export function encodeBotCode(c: BotCode): number {
  return c.acc + ITEM_STRIDE * c.item + LOOK_STRIDE * (c.head + 3 * c.eyes);
}

export function decodeBotCode(seed: number): BotCode {
  const f = Math.floor(seed);
  const look = Math.floor(f / LOOK_STRIDE);
  const rest = f - look * LOOK_STRIDE;
  const item = Math.floor(rest / ITEM_STRIDE);
  const eyes = Math.floor(look / 3);
  return { acc: rest - item * ITEM_STRIDE, item, head: look - eyes * 3, eyes };
}

/** Mode-8 `limb.x` variants a bot with this `aSeed` shows (everything else collapses to a point). */
export function visibleVariants(seed: number): number[] {
  const c = decodeBotCode(seed);
  const out = [c.acc, 30 + c.head, 40 + c.head * 5 + c.eyes];
  if (c.item > 0) out.push(c.item + 6);
  return out;
}

/** The mesh index (0 scout, 1 hauler, 2 spire) of a chassis. */
export const chassisIndex = (c: BotChassis): number => BOT_CHASSIS.indexOf(c);
export const headIndex = (h: BotHead): number => BOT_HEADS.indexOf(h);
export const eyesIndex = (e: BotEyes): number => BOT_EYES.indexOf(e);

/** Shader item code (CARRIED_ITEM_SLOT - 6) of a role item; brush is the paint pot's brush, book the stack. */
export const ROLE_ITEM_CODE: Readonly<Record<RoleItem, number>> = {
  none: 0,
  brush: CARRIED_ITEM_SLOT.paintPot - 6,
  wrench: CARRIED_ITEM_SLOT.wrench - 6,
  map: CARRIED_ITEM_SLOT.map - 6,
  hammer: CARRIED_ITEM_SLOT.hammer - 6,
  duck: CARRIED_ITEM_SLOT.duck - 6,
  magnifier: CARRIED_ITEM_SLOT.magnifier - 6,
  hardhat: CARRIED_ITEM_SLOT.hardHat - 6,
  book: CARRIED_ITEM_SLOT.books - 6,
};
