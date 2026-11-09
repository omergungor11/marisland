import { hashString, mix32 } from '../core/hash.ts';
import type { ThemeId } from '../world/types.ts';

/**
 * Bot look contract (Phase 5 M45, TASK-590 / 591). One deterministic descriptor drives both the 3D
 * bot (life: chassis mesh, head variant, carried item, eye state) and the 2D panel portrait
 * (ui/bot-portrait.ts). Pure data: no three, no DOM. Numbers that shape geometry live with the
 * life / ui modules; this file only decides WHICH variant a bot is.
 */

export const BOT_CHASSIS = ['scout', 'hauler', 'spire'] as const;
export type BotChassis = (typeof BOT_CHASSIS)[number];

export const BOT_HEADS = ['monitor', 'visor', 'cam'] as const;
export type BotHead = (typeof BOT_HEADS)[number];

/** Eye state shown on the screen / visor; derived from the session (idle for resident bots). */
export const BOT_EYES = ['idle', 'working', 'gate', 'error', 'done'] as const;
export type BotEyes = (typeof BOT_EYES)[number];

/** Carried item a role (fleet `agent` name) shows; `none` = the department default. */
export const ROLE_ITEM = {
  shader: 'brush',
  engine: 'wrench',
  worldgen: 'map',
  props: 'hammer',
  life: 'duck',
  qa: 'magnifier',
  devops: 'hardhat',
  docs: 'book',
} as const;
export type RoleItem = (typeof ROLE_ITEM)[keyof typeof ROLE_ITEM] | 'none';

export interface BotLook {
  chassis: BotChassis;
  head: BotHead;
  /** Department accent (island theme) tints shell parts and the portrait fill. */
  dept: ThemeId;
  /** Fleet agent name (`FleetSession.agent`, lower-cased) or '' for a resident bot. */
  role: string;
  item: RoleItem;
  /** 0..2: shade of the department accent (portrait + instance tint lightness step). */
  shade: 0 | 1 | 2;
  eyes: BotEyes;
}

/** Role → item; unknown roles (e.g. `claude`, `general-purpose`) carry the department default. */
export function roleItem(role: string): RoleItem {
  const key = role.toLowerCase() as keyof typeof ROLE_ITEM;
  return ROLE_ITEM[key] ?? 'none';
}

/**
 * Deterministic look for a seed string: a fleet session id, or `${islandId}:${botIndex}` for a
 * resident bot. Same seed → same look on every client and in every capture.
 */
export function botLook(seed: string, dept: ThemeId, role = '', eyes: BotEyes = 'idle'): BotLook {
  const h = mix32(hashString(seed));
  return {
    chassis: BOT_CHASSIS[h % 3],
    head: BOT_HEADS[(h >>> 8) % 3],
    dept,
    role,
    item: roleItem(role),
    shade: ((h >>> 16) % 3) as 0 | 1 | 2,
    eyes,
  };
}

/** Pack chassis / head / shade into one small integer (0..26) for instance attributes and tests. */
export function packLook(look: BotLook): number {
  return BOT_CHASSIS.indexOf(look.chassis) * 9 + BOT_HEADS.indexOf(look.head) * 3 + look.shade;
}

export function unpackLook(code: number): Pick<BotLook, 'chassis' | 'head' | 'shade'> {
  const c = Math.max(0, Math.min(26, code | 0));
  return {
    chassis: BOT_CHASSIS[Math.floor(c / 9)],
    head: BOT_HEADS[Math.floor(c / 3) % 3],
    shade: (c % 3) as 0 | 1 | 2,
  };
}
