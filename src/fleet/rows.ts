/** Island panel view math (TASK-563): pure, tested without a DOM. */
import { FLEET_DURATION as D } from '../content/fleet.ts';
import { isLive, type FleetIsland, type FleetSession } from './protocol.ts';

/** "az önce", "3 dk", "2 sa 10 dk", "2 sa", "1 g". */
export function formatDuration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < D.justNowS) return D.justNow;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} ${D.min}`;
  const h = Math.floor(m / 60);
  if (h < 24) return m % 60 ? `${h} ${D.hour} ${m % 60} ${D.min}` : `${h} ${D.hour}`;
  return `${Math.floor(h / 24)} ${D.day}`;
}

/** How long the session has run: to `endedAt` once it ended, else to `now`. */
export const sessionDuration = (s: FleetSession, now: number): string =>
  formatDuration((s.endedAt ?? now) - s.startedAt);

export interface PanelRows {
  rows: FleetSession[];
  live: number;
  /** Sessions past the cap. */
  more: number;
}

/**
 * The island's rows: live first (newest start on top, so the feed does not reshuffle them), then
 * the rest by `updatedAt` desc; capped at `cap`.
 */
export function panelRows(
  sessions: Iterable<FleetSession>,
  island: FleetIsland,
  cap: number,
): PanelRows {
  const live: FleetSession[] = [];
  const rest: FleetSession[] = [];
  for (const s of sessions) if (s.island === island) (isLive(s) ? live : rest).push(s);
  live.sort((a, b) => b.startedAt - a.startedAt || (a.id < b.id ? -1 : 1));
  rest.sort((a, b) => b.updatedAt - a.updatedAt || (a.id < b.id ? -1 : 1));
  const all = live.concat(rest);
  return { rows: all.slice(0, cap), live: live.length, more: Math.max(0, all.length - cap) };
}
