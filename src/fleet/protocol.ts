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
  /** M43: the registered project this session works on (`FleetProject.id`). */
  project?: string;
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

/**
 * M43 admin window (TASK-584 / 585). A registered project the fleet may work on: `dir` is an
 * absolute path on the bridge machine (added to a session with `--add-dir`). Stored in
 * `fleet/projects.json` (`{ "projects": FleetProject[] }`), HQ and the window read it.
 */
export interface FleetProject {
  /** Slug, unique (`marisland`, `piton-studios`). */
  id: string;
  name: string;
  /** Absolute directory; the bridge refuses one that does not exist. */
  dir: string;
  note?: string;
  /** Accent hex (`#RRGGBB`); the window falls back to a palette colour. */
  color?: string;
  createdAt: number;
}

/**
 * Knowledge-base sources the bridge serves read-only over HTTP (TASK-584):
 *   GET /api/kb/tree                → { sources: KbSource[]; files: KbFile[] }
 *   GET /api/kb/file?path=<KbFile.path> → KbDoc
 *   GET /api/kb/search?q=<text>     → { hits: KbHit[] }   (case-insensitive, ≤ 200 hits)
 *   GET /api/projects               → { projects: FleetProject[] }
 *   POST /api/projects {name, dir, note?, color?} → { project: FleetProject } (201) | { error } (400)
 * `KbFile.path` is `<source id>/<relative path>`; the bridge resolves it inside that source's root
 * only (no `..`, no symlink escape). Sources: `island:<theme>` (the island dir: CLAUDE.md, memory/,
 * knowledge/, reports/), `fleet` (fleet/CLAUDE.md, fleet/kb/, fleet/fleet.config.json),
 * `mar-docs` (mar-docs/MEMORY.md, DECISIONS.md), `hq-memory` (fleet.config.json → `hqMemoryDir`,
 * `~` expanded; absent when unset). Only `.md` / `.json` files, ≤ 256 KB each, dot-dirs skipped.
 */
export type KbFileKind = 'memory' | 'knowledge' | 'report' | 'claude' | 'doc' | 'config' | 'other';
export interface KbSource {
  /** `island:coding` | `fleet` | `mar-docs` | `hq-memory` */
  id: string;
  label: string;
  island?: FleetIsland;
}
export interface KbFile {
  path: string;
  source: KbSource['id'];
  island?: FleetIsland;
  kind: KbFileKind;
  /** Frontmatter `name`, else the first `# ` heading, else the file name without extension. */
  title: string;
  /** Frontmatter `description`, when present. */
  description?: string;
  /** Frontmatter `type` (`user | feedback | project | reference`), top level or under `metadata:`. */
  type?: string;
  /** mtime (ms since epoch) and size in bytes. */
  mtime: number;
  size: number;
}
export interface KbDoc {
  file: KbFile;
  /** Body without the frontmatter block. */
  text: string;
  /** Flattened frontmatter (nested keys joined with `.`: `metadata.type`). */
  frontmatter: Record<string, string>;
  /** `[[name]]` targets found in the body, in order, unique. */
  links: string[];
}
export interface KbHit {
  path: string;
  /** 1-based line of the match and that line trimmed (≤ 200 chars). */
  line: number;
  text: string;
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
      /** M43 (TASK-584): registered projects; older bridges omit it. */
      projects?: FleetProject[];
    }
  | { type: 'session'; session: FleetSession }
  /** M43: a project was added / changed (`fleet/projects.json`). */
  | { type: 'project'; project: FleetProject }
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
      /** M43: work on a registered project (`FleetProject.id`): its dir is added with `--add-dir`. */
      project?: string;
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
