/** Pure helpers of the M41 resume / tail path (no fs, no process): argv, tail source, accumulation. */
import type { FleetRequest, FleetSession } from '../src/fleet/protocol.ts';
import type { ResultInfo } from './stream.ts';

/** Flags shared by the first run and every resumed run; only the session flag differs. */
export function claudeArgs(o: {
  prompt: string;
  sessionId: string;
  resume: boolean;
  islandArgs: string[];
}): string[] {
  return [
    '-p',
    o.prompt,
    '--output-format',
    'stream-json',
    '--verbose',
    '--include-partial-messages',
    ...(o.resume ? ['--resume', o.sessionId] : ['--session-id', o.sessionId]),
    '--permission-mode',
    'acceptEdits',
    '--permission-prompts',
    'none',
    // --settings / --add-dir / --allowedTools ... are NOT restored by --resume: always repeat them
    ...o.islandArgs,
  ];
}

/** Max lines in one `lines` answer / HTTP tail; a client that needs more asks again from `last + 1`. */
export const TAIL_MAX = 2000;

/** `memFirstSeq`: first seq in the run's cache (undefined = no cache entry; null = cache empty). */
export function tailSource(
  memFirstSeq: number | null | undefined,
  from: number,
): 'memory' | 'disk' {
  if (memFirstSeq === undefined) return 'disk';
  return memFirstSeq === null || memFirstSeq <= from ? 'memory' : 'disk';
}

/** `result` carries per-invocation numbers: add them to what earlier runs of the session had. */
export function accumulate(
  base: { turns: number; costUsd: number },
  r: Pick<ResultInfo, 'turns' | 'costUsd'>,
): { turns: number; costUsd?: number } {
  return {
    turns: base.turns + r.turns,
    ...(r.costUsd !== undefined ? { costUsd: base.costUsd + r.costUsd } : {}),
  };
}

/** Synthetic jsonl record: the prompt of a resumed turn (disk replay keeps the same seq). */
export const userRecord = (prompt: string, at: number): string =>
  JSON.stringify({ type: 'bridge_user', at, text: prompt });

/** Request carrying the root session's title, or undefined when `s` is not a root / nothing changes. */
export function requestWithTitle(
  requests: FleetRequest[],
  s: Pick<FleetSession, 'id' | 'requestId'>,
  title: string,
): FleetRequest | undefined {
  const req = requests.find((x) => x.id === s.requestId);
  return req && req.rootSessionId === s.id && req.title !== title ? { ...req, title } : undefined;
}

/**
 * Stale-process guard (QA 570 FAIL): a `send` right after `done` replaces `run.proc`; the old
 * process's late `close` / `error` / buffered output must not touch the record (it flipped the
 * resumed session to `error` and let a second `send` run concurrently). Call handlers through this.
 */
export function onlyCurrent<T extends unknown[]>(
  run: { proc?: unknown },
  proc: unknown,
  fn: (...a: T) => void,
): (...a: T) => void {
  return (...a: T) => {
    if (run.proc === proc) fn(...a);
  };
}
