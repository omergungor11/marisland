import type { BotChassis, BotEyes, BotHead, RoleItem } from './bot-look.ts';
import type { SessionStatus } from '../fleet/protocol.ts';
import type { ThemeId } from '../world/types.ts';

/**
 * 2D bot portrait (TASK-591, `ui/bot-portrait.ts`): the numbers of the inline SVG drawn from a
 * `BotLook`. Geometry is in a 48 × 48 viewBox (y down, feet at the bottom); `size` only sets the
 * pixel box, so one look reads the same in the 20 px chip and the 48 px tip.
 */

/** A box in viewBox units: centre x / y, width, height. */
export interface PortraitBox {
  cx: number;
  cy: number;
  w: number;
  h: number;
}

export interface PortraitChassis {
  /** Torso (rounded rect) and its corner radius. */
  body: PortraitBox & { r: number };
  /** Head box the head kind is drawn into. */
  head: PortraitBox;
  /** Legs: x centres, width, top / bottom y; `tread` = one wide tread block instead. */
  legs: { xs: readonly number[]; w: number; y0: number; y1: number; tread: boolean };
  /** Arm stubs: half-gap from the body edge, width, top / bottom y. */
  arms: { w: number; y0: number; y1: number };
  /** Antenna: height above the head top and the tip ring radius (0 = a ball). */
  antenna: { h: number; ring: number };
  /** Where the role item sits (the hand). */
  hand: { x: number; y: number };
}

export const PORTRAIT = {
  view: 48,
  /** Backdrop: rounded square in the accent mixed this far toward the surface (not the island disc's circle). */
  backdrop: { r: 12, mix: 0.74 },
  /** Outline stroke (viewBox units) and its floor in screen px (a 20 px chip keeps ≥ 1 px lines). */
  stroke: 1.6,
  minStrokePx: 0.9,
  colors: {
    ink: '#3B3A5A',
    surface: '#FFF8EC',
    /** Screen / visor band / lens. */
    screen: '#2E2C48',
    /** Legs, treads, neck. */
    metal: '#6E6B8C',
    white: '#FFFFFF',
  },
  /** Accent lightness step per `shade` 0..2: < 0 toward ink, > 0 toward white. */
  shades: [-0.16, 0, 0.22] as const,
  /** Head shell: the body accent this far toward white (the face reads apart from the torso). */
  headLift: 0.32,
  chassis: {
    // today's bot: chunky legs, tinted body, monitor-sized head
    scout: {
      body: { cx: 24, cy: 31, w: 20, h: 13, r: 5 },
      head: { cx: 24, cy: 15.5, w: 22, h: 15 },
      legs: { xs: [19, 29], w: 6, y0: 37, y1: 44.5, tread: false },
      arms: { w: 4, y0: 27, y1: 34 },
      antenna: { h: 4, ring: 0 },
      hand: { x: 38.5, y: 36 },
    },
    // squat and wide, tread feet
    hauler: {
      body: { cx: 24, cy: 32, w: 30, h: 11, r: 4 },
      head: { cx: 24, cy: 19.5, w: 26, h: 12 },
      legs: { xs: [24], w: 32, y0: 38.5, y1: 45, tread: true },
      arms: { w: 4, y0: 28.5, y1: 35 },
      antenna: { h: 3, ring: 0 },
      hand: { x: 39.4, y: 35 },
    },
    // tall and slim, a long antenna with a ring
    spire: {
      body: { cx: 24, cy: 31, w: 13, h: 17, r: 6 },
      head: { cx: 24, cy: 16, w: 16, h: 12 },
      legs: { xs: [21, 27], w: 3.2, y0: 39, y1: 45, tread: false },
      arms: { w: 3, y0: 26, y1: 35 },
      antenna: { h: 5, ring: 2.1 },
      hand: { x: 36.5, y: 35 },
    },
  } satisfies Record<BotChassis, PortraitChassis>,
  head: {
    /** Monitor: shell corner radius, screen inset. */
    monitor: { r: 3.5, inset: 2.6 },
    /** Dome visor: the dark band's height share and centre (share of the head height from the top). */
    visor: { band: 0.44, at: 0.58 },
    /** Round cam: lens radius share of the head radius. */
    cam: { lens: 0.66 },
  } satisfies Record<BotHead, unknown>,
  /** Eye glyphs are drawn in a 12 × 8 local box scaled to the face; colour per state. */
  eyes: {
    box: [12, 8] as const,
    /** Glyph line width (local units, before the face scale). */
    line: 1.5,
    color: {
      idle: '#FFF3C9',
      working: '#9FEFE3',
      gate: '#FFC14D',
      error: '#FF7D6E',
      done: '#AEEB8E',
    } satisfies Record<BotEyes, string>,
  },
  /** Role item: a cream badge at the hand, glyph drawn in a 10 × 10 local box. */
  item: {
    badge: 7.6,
    glyph: 11,
    /** Below this portrait size (px) the item glyph is dropped (unreadable smudge). */
    minPx: 24,
    colors: {
      brush: '#FF8FB1',
      wrench: '#B7C0D2',
      map: '#F2DFAE',
      hammer: '#C98B5A',
      duck: '#FFD34D',
      magnifier: '#9FD8F5',
      hardhat: '#FFC23D',
      book: '#7FA6E8',
    } satisfies Record<Exclude<RoleItem, 'none'>, string>,
  },
  /** Fleet view crew strip: live sessions' chips, at most `max`, the rest as "+N". */
  crew: { max: 13, gapPx: 4, more: (n: number): string => `+${n}` },
  /** Pixel sizes where the portrait is shown. */
  px: { row: 24, fleetRow: 20, term: 40, tip: 48 },
} as const;

/**
 * Extra `?fleet=mock` sessions (TASK-591, after the scripted chain, no RNG): the roles and states
 * the drawn feed lacks, so every role item, status and eye state shows somewhere in the fleet view.
 * `agoS` = started before `now`, `ranS` = run length of a finished one.
 */
export interface PortraitCastRow {
  island: ThemeId;
  agent: string;
  status: SessionStatus;
  title: string;
  lastLine?: string;
  agoS: number;
  ranS: number;
  turns: number;
}

export const PORTRAIT_CAST: readonly PortraitCastRow[] = [
  {
    island: 'coding',
    agent: 'engine',
    status: 'error',
    title: 'Zoom kademesi geçişinde titreme',
    lastLine: 'Bash pnpm test',
    agoS: 7200,
    ranS: 840,
    turns: 9,
  },
  {
    island: 'coding',
    agent: 'life',
    status: 'done',
    title: 'Ördek sürüsü göl kenarında yüzsün',
    lastLine: 'Edit src/life/ducks.ts',
    agoS: 10_800,
    ranS: 1500,
    turns: 14,
  },
  {
    island: 'design',
    agent: 'props',
    status: 'stopped',
    title: 'İskele fenerleri için yeni model',
    lastLine: 'Read src/geo/lamps.ts',
    agoS: 14_400,
    ranS: 600,
    turns: 4,
  },
  {
    island: 'qa',
    agent: 'qa',
    status: 'done',
    title: 'Gece çekimlerinde kontrast turu',
    lastLine: 'Kontrast raporu hazır',
    agoS: 12_600,
    ranS: 1800,
    turns: 11,
  },
  {
    island: 'hq',
    agent: 'docs',
    status: 'queued',
    title: 'Görev listesini güncelle',
    agoS: 240,
    ranS: 0,
    turns: 0,
  },
];
