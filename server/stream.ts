/**
 * claude `--output-format stream-json` event -> `FleetLine[]` reducer (pure: no fs, no process).
 * Shapes verified against a real run: `server/fixtures/stream-sample.jsonl`. Unknown event types
 * (hook_started, rate_limit_event, anything new) are ignored, never thrown on.
 */
import type { FleetLine, LineKind } from '../src/fleet/protocol.ts';

export const LINE_MAX = 400;

/** A line before the bridge stamps `sessionId`, `seq` and `at`. */
export type RawLine = Pick<FleetLine, 'kind' | 'text' | 'tool'>;

export interface ResultInfo {
  ok: boolean;
  subtype: string;
  turns: number;
  costUsd?: number;
  durationMs?: number;
  text: string;
}

export interface Reduced {
  lines: RawLine[];
  /** New collapsed-row text (partials and whole events). */
  lastLine?: string;
  init?: { sessionId: string; model?: string; cwd?: string };
  result?: ResultInfo;
  /** Whole assistant text in this event (title job trigger). */
  assistantText?: string;
}

/** Mutable reducer state per session: tool_use id -> tool name, partial text buffer. */
export interface StreamState {
  tools: Map<string, string>;
  partial: string;
}

export const newStreamState = (): StreamState => ({ tools: new Map(), partial: '' });

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

export function clip(s: string, max = LINE_MAX): string {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}

const firstLine = (s: string): string => s.trim().split('\n')[0] ?? '';

const INPUT_KEYS = ['command', 'file_path', 'path', 'pattern', 'url', 'description', 'query'];

function toolSummary(name: string, input: unknown): string {
  if (isObj(input)) {
    for (const k of INPUT_KEYS) {
      const v = input[k];
      if (typeof v === 'string' && v) return clip(`${name} ${v}`);
    }
    const json = JSON.stringify(input);
    if (json && json !== '{}') return clip(`${name} ${json}`);
  }
  return name;
}

function resultContentText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content))
    return content
      .map((b) => (isObj(b) && b.type === 'text' && typeof b.text === 'string' ? b.text : ''))
      .join('\n');
  return '';
}

function formatResult(r: ResultInfo): string {
  const parts = [r.ok ? 'done' : r.subtype, `${r.turns} turns`];
  if (r.costUsd !== undefined) parts.push(`$${r.costUsd.toFixed(4)}`);
  if (r.durationMs !== undefined) parts.push(`${(r.durationMs / 1000).toFixed(1)} s`);
  return parts.join(' · ');
}

const num = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined;

export function reduceEvent(state: StreamState, ev: unknown): Reduced {
  const none: Reduced = { lines: [] };
  if (!isObj(ev) || typeof ev.type !== 'string') return none;

  switch (ev.type) {
    case 'system': {
      if (ev.subtype !== 'init' || typeof ev.session_id !== 'string') return none;
      const model = typeof ev.model === 'string' ? ev.model : undefined;
      const cwd = typeof ev.cwd === 'string' ? ev.cwd : undefined;
      const nTools = Array.isArray(ev.tools) ? ev.tools.length : 0;
      return {
        lines: [
          { kind: 'system', text: clip(`init · ${model ?? '?'} · ${nTools} tools · ${cwd ?? ''}`) },
        ],
        init: { sessionId: ev.session_id, model, cwd },
      };
    }
    case 'stream_event': {
      const e = ev.event;
      if (!isObj(e)) return none;
      if (e.type === 'message_start') state.partial = '';
      if (e.type === 'content_block_delta' && isObj(e.delta) && e.delta.type === 'text_delta') {
        if (typeof e.delta.text !== 'string') return none;
        state.partial += e.delta.text;
        const last = state.partial.trim().split('\n').at(-1) ?? '';
        return { lines: [], lastLine: clip(last, 120) };
      }
      return none;
    }
    case 'assistant':
    case 'user': {
      const msg = ev.message;
      if (!isObj(msg)) return none;
      if (typeof msg.content === 'string')
        return ev.type === 'user' && msg.content.trim()
          ? { lines: [{ kind: 'user', text: clip(msg.content) }] }
          : none;
      if (!Array.isArray(msg.content)) return none;
      const out: Reduced = { lines: [] };
      const texts: string[] = [];
      for (const b of msg.content) {
        if (!isObj(b)) continue;
        if (b.type === 'text' && typeof b.text === 'string' && b.text.trim()) {
          const kind: LineKind = ev.type === 'assistant' ? 'assistant' : 'user';
          out.lines.push({ kind, text: clip(b.text) });
          if (kind === 'assistant') {
            texts.push(b.text);
            out.lastLine = clip(firstLine(b.text), 120);
          }
        } else if (b.type === 'tool_use' && typeof b.name === 'string') {
          if (typeof b.id === 'string') state.tools.set(b.id, b.name);
          const text = toolSummary(b.name, b.input);
          out.lines.push({ kind: 'tool_use', text, tool: b.name });
          out.lastLine = clip(text, 120);
        } else if (b.type === 'tool_result') {
          const tool =
            typeof b.tool_use_id === 'string' ? state.tools.get(b.tool_use_id) : undefined;
          const body = firstLine(resultContentText(b.content));
          const text = clip(b.is_error === true ? `error: ${body}` : body || '(empty)');
          out.lines.push({ kind: 'tool_result', text, ...(tool ? { tool } : {}) });
        }
      }
      if (texts.length) out.assistantText = texts.join('\n');
      if (ev.type === 'assistant') state.partial = '';
      return out;
    }
    case 'result': {
      const subtype = typeof ev.subtype === 'string' ? ev.subtype : 'unknown';
      const info: ResultInfo = {
        ok: subtype === 'success' && ev.is_error !== true,
        subtype,
        turns: num(ev.num_turns) ?? 0,
        costUsd: num(ev.total_cost_usd),
        durationMs: num(ev.duration_ms),
        text: typeof ev.result === 'string' ? ev.result : '',
      };
      const text = clip(
        info.ok || !info.text ? formatResult(info) : `${formatResult(info)} · ${info.text}`,
      );
      return { lines: [{ kind: 'result', text }], lastLine: clip(text, 120), result: info };
    }
    case 'bridge_stderr':
      // synthetic record the bridge writes into the jsonl so disk replay keeps the live seq
      return typeof ev.text === 'string'
        ? { lines: [{ kind: 'stderr', text: clip(ev.text) }] }
        : none;
    default:
      return none;
  }
}

/** Reduce a whole raw jsonl (disk replay for sessions that fell out of the in-memory window). */
export function reduceJsonl(text: string, sessionId: string, fallbackAt: number): FleetLine[] {
  const state = newStreamState();
  const lines: FleetLine[] = [];
  for (const raw of text.split('\n')) {
    if (!raw.trim()) continue;
    let ev: unknown;
    try {
      ev = JSON.parse(raw);
    } catch {
      continue;
    }
    const at = isObj(ev) && typeof ev.at === 'number' ? ev.at : fallbackAt;
    for (const l of reduceEvent(state, ev).lines)
      lines.push({ sessionId, seq: lines.length, at, ...l });
  }
  return lines;
}

/** Title job output (`--output-format json` -> `.result`): first line, quotes and trailing dot stripped. */
export function parseTitle(stdout: string): string | undefined {
  try {
    const o: unknown = JSON.parse(stdout);
    if (!isObj(o) || typeof o.result !== 'string' || o.is_error === true) return undefined;
    const t = firstLine(o.result)
      .replace(/^["'“”‘’`*#\s]+|["'“”‘’`*\s]+$/g, '')
      .replace(/\.$/, '')
      .trim();
    return t ? clip(t, 80) : undefined;
  } catch {
    return undefined;
  }
}

/** Prompt for the haiku title job. */
export const titlePrompt = (prompt: string): string =>
  `Şu işi 4-7 kelimelik Türkçe bir başlıkla özetle, sadece başlığı yaz: ${prompt.slice(0, 500)}`;
