/**
 * Fleet protocol (Faz 4, D-141, `mar-plans/FLEET.md`): the wire types the bridge (`server/`) and
 * the browser (`src/fleet/client.ts`, `src/ui/fleet-panel.ts`) share. Pure types + tiny helpers,
 * no three.js, no DOM, no Node: both tsconfigs include it.
 *
 * Transport: `ws://localhost:5174/ws` carries `FleetEvent` (bridge → browser) and `FleetCommand`
 * (browser → bridge) as one JSON object per message. REST mirrors the read side
 * (`GET /api/sessions`, `GET /api/sessions/:id/lines?from=<seq>`) and `POST /api/start`.
 */
import type { ThemeId } from '../world/types.ts';

export const FLEET_PORT = 5174;
export const FLEET_WS_PATH = '/ws';
export const FLEET_PROTOCOL_VERSION = 1;

/** Island = department. */
export type FleetIsland = ThemeId;

export type SessionStatus = 'queued' | 'running' | 'waiting' | 'done' | 'error' | 'stopped';

export interface FleetSession {
  /** Claude Code session id (also the `fleet/runs/<id>.jsonl` name). */
  id: string;
  island: FleetIsland;
  /** Department agent that runs it (`default` = the island's CLAUDE.md persona). */
  agent: string;
  /** Readable one-liner: the first 60 chars of the prompt, replaced by the haiku title. */
  title: string;
  status: SessionStatus;
  /** Wall-clock ms (bridge clock). The panel's "since 12 min" counts from `startedAt`. */
  startedAt: number;
  updatedAt: number;
  endedAt?: number;
  /** Assistant turns so far (from the `result` event at the end). */
  turns: number;
  costUsd?: number;
  /** Parent session when this one was spawned by an island hand-off (M42). */
  parentId?: string;
  /** Request (user ask) this session belongs to. */
  requestId: string;
  cwd: string;
  /** Model alias the session runs on. */
  model?: string;
  /** Last meaningful line (assistant text or tool name), for the collapsed row. */
  lastLine?: string;
  /** Status detail for `error` / `stopped` (exit code, bridge restarted…). */
  reason?: string;
  /** Highest line `seq` the bridge holds for this session (M41: a reconnecting client tails from `linesOf(id).length`). */
  lastSeq?: number;
}

export type LineKind =
  'system' | 'user' | 'assistant' | 'tool_use' | 'tool_result' | 'result' | 'stderr';

/** One reduced stream line. `seq` is per session, dense from 0; `text` is already short (≤ 400 chars). */
export interface FleetLine {
  sessionId: string;
  seq: number;
  at: number;
  kind: LineKind;
  text: string;
  /** Tool name for `tool_use` / `tool_result`. */
  tool?: string;
}

export type RequestStatus = 'open' | 'done' | 'error' | 'stopped';

export interface FleetRequest {
  id: string;
  /** The user's ask, one line. */
  title: string;
  island: FleetIsland;
  rootSessionId: string;
  createdAt: number;
  status: RequestStatus;
}

/** Island hand-off waiting for the user (M42). */
export interface FleetGate {
  id: string;
  requestId: string;
  fromSessionId: string;
  fromIsland: FleetIsland;
  toIsland: FleetIsland;
  prompt: string;
  status: 'pending' | 'allowed' | 'denied';
  createdAt: number;
  /** Gates opened by one message share a round id (panel groups by it). */
  round?: string;
  /** Child session started on allow. */
  childId?: string;
  /** First ~400 chars of the child's report, once it came back. */
  report?: string;
  /** When the gate was answered (bridge clock, ms). */
  answeredAt?: number;
}

export interface BridgeInfo {
  version: number;
  /** Repo root the bridge serves from. */
  root: string;
  startedAt: number;
}

export type FleetEvent =
  | {
      type: 'snapshot';
      bridge: BridgeInfo;
      sessions: FleetSession[];
      requests: FleetRequest[];
      gates: FleetGate[];
    }
  | { type: 'session'; session: FleetSession }
  | { type: 'request'; request: FleetRequest }
  | { type: 'line'; line: FleetLine }
  | { type: 'lines'; sessionId: string; lines: FleetLine[] }
  | { type: 'gate'; gate: FleetGate }
  | { type: 'error'; message: string; command?: FleetCommand['type']; gateId?: string };

export type FleetCommand =
  | {
      type: 'start';
      island: FleetIsland;
      prompt: string;
      agent?: string;
      /** Hand-off: the session that asked for it (M42). */
      parentId?: string;
      /** Join an existing request instead of opening a new one. */
      requestId?: string;
    }
  /** Follow-up turn on an existing session (`claude --resume`, M41). */
  | { type: 'send'; sessionId: string; prompt: string }
  | { type: 'stop'; sessionId: string }
  /** Replay persisted lines from `seq` (inclusive); the bridge answers with `lines`. */
  | { type: 'tail'; sessionId: string; from: number }
  | { type: 'gate'; gateId: string; allow: boolean };

export const isLive = (s: Pick<FleetSession, 'status'>): boolean =>
  s.status === 'queued' || s.status === 'running' || s.status === 'waiting';

/** Panel one-liner for a prompt before the haiku title lands. */
export function draftTitle(prompt: string, max = 60): string {
  const line = prompt.trim().split('\n')[0] ?? '';
  return line.length <= max ? line : `${line.slice(0, max - 1).trimEnd()}…`;
}
