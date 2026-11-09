/** Done gate (TASK-632): a long session that ends without `## Özet` is sent back once for it. Pure. */
import type { FleetSession } from '../src/fleet/protocol.ts';
import type { DoneGateConfig } from './config.ts';

const SUMMARY_HEADING = /^\s{0,3}#{1,6}\s*(özet|ozet|summary)\b/im;

/** True when the final assistant text has no `## Özet` / `## Ozet` / `## Summary` heading anywhere. */
export const needsSummary = (text: string): boolean => !SUMMARY_HEADING.test(text);

export type DoneGateDecision = 'nudge' | 'final';

/** `nudge` = run one follow-up turn instead of publishing `done`; `final` = settle now. */
export function doneGateDecision(
  session: Pick<FleetSession, 'turns'>,
  text: string,
  cfg: DoneGateConfig,
  nudged: boolean,
): DoneGateDecision {
  if (nudged || cfg.nudgeMaxTurns < 1) return 'final'; // nudgeMaxTurns 0 = gate off
  return session.turns >= cfg.minTurns && needsSummary(text) ? 'nudge' : 'final';
}

export type SettleStep = { kind: 'nudge' } | { kind: 'final'; text: string };

/**
 * One call per `result` of a normally ended run. `nudge` = send it back (caller marks it nudged
 * and keeps `text`); `final` = the one and only point where hand-offs / report-back may run.
 */
export function settleStep(
  run: { turns: number; nudged: boolean; before?: string },
  text: string,
  cfg: DoneGateConfig,
): SettleStep {
  if (doneGateDecision({ turns: run.turns }, text, cfg, run.nudged) === 'nudge')
    return { kind: 'nudge' };
  return {
    kind: 'final',
    text: run.nudged && run.before !== undefined ? finalTextAfterNudge(run.before, text) : text,
  };
}

export const NUDGE_NOTICE = 'Özet eksik · bir kez geri gönderildi (done gate)';

export const NUDGE_PROMPT =
  'Raporunda `## Özet` bölümü yok. fleet/CLAUDE.md rapor biçimiyle yalnız şunu yaz: ' +
  '`## Özet` (2–3 cümle: ne istendi, ne yapıldı), varsa `## Değişen dosyalar`, ' +
  'varsa `## → <ada>: <istek>` başlıkları. Başka iş yapma, araç çağırma.';

/** The nudge reply is final when it brought a summary; otherwise the original text (hand-offs) stays. */
export const finalTextAfterNudge = (before: string, after: string): string =>
  needsSummary(after) ? before : after;

/** Island args with `--max-turns` swapped (the nudge turn is capped lower than the island's own). */
export function withMaxTurns(args: string[], n: number): string[] {
  const out = [...args];
  const i = out.indexOf('--max-turns');
  if (i >= 0) out[i + 1] = String(n);
  else out.push('--max-turns', String(n));
  return out;
}
