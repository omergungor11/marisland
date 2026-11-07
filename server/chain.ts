/**
 * Request chains (M42, D-149; pure, no fs / process): parse `## → <ada>: <istek>` hand-off
 * lines out of a run's final text, build the child prompt and the report-back prompt, check caps.
 */
import type { FleetGate, FleetIsland } from '../src/fleet/protocol.ts';
import { THEME_IDS } from '../src/world/types.ts';
import { maxPerMessage } from './config.ts';

export { maxPerMessage };

export interface Handoff {
  island: FleetIsland;
  prompt: string;
}

/** Hand-offs may chain at most this many hops below the root session (root = 0). */
export const MAX_DEPTH = 3;
const SUMMARY_FALLBACK = 600;

/** Lowercase + Turkish folding (ı→i ş→s ğ→g ü→u ö→o ç→c) for name matching. */
export const fold = (s: string): string =>
  s
    .toLocaleLowerCase('tr')
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c');

const HEADING = /^\s{0,3}#{1,6}\s/;
/** Only level-2 headings at line start: prose arrows (`→ design: …`) never open a gate. */
const HANDOFF = /^##(?!#)\s*(?:→|->)\s*([^:：\n]+?)\s*[:：]\s*(.*)$/;
const FENCE = /^\s*(```|~~~)/;

/** `islands`: ThemeId plus the Turkish display name of each island (`island.json` `name`). */
export function parseHandoffs(
  finalText: string,
  islands: readonly { theme: FleetIsland; name: string }[],
): Handoff[] {
  const byName = new Map<string, FleetIsland>();
  for (const t of THEME_IDS) byName.set(fold(t), t);
  for (const i of islands) {
    byName.set(fold(i.name), i.theme);
    byName.set(fold(i.name.replace(/\s*\(.*\)\s*$/, '')), i.theme); // "Kalite (QA)" -> "kalite"
  }

  const out: { island: FleetIsland; parts: string[] }[] = [];
  let cur: { island: FleetIsland; parts: string[] } | undefined;
  let fenced = false;
  for (const line of finalText.split('\n')) {
    if (FENCE.test(line)) fenced = !fenced;
    if (!fenced) {
      const m = HANDOFF.exec(line);
      const island = m ? byName.get(fold(m[1].replace(/[*_`]/g, '').trim())) : undefined;
      if (m && island) {
        cur = { island, parts: [m[2]] };
        out.push(cur);
        continue;
      }
      if (HEADING.test(line)) cur = undefined;
    }
    cur?.parts.push(line);
  }
  return out
    .map((o) => ({ island: o.island, prompt: o.parts.join('\n').trim() }))
    .filter((h) => h.prompt);
}

/** Body of the `## Özet` section; falls back to the first 600 chars of the text. */
export const parseSummary = (finalText: string): string => summaryOf(finalText).text;

export function summaryOf(finalText: string): { text: string; explicit: boolean } {
  const lines = finalText.split('\n');
  const at = lines.findIndex((l) => /^\s{0,3}#{1,6}\s*(özet|ozet)\b/i.test(l));
  if (at >= 0) {
    const body: string[] = [];
    for (const l of lines.slice(at + 1)) {
      if (HEADING.test(l)) break;
      body.push(l);
    }
    const text = body.join('\n').trim();
    if (text) return { text, explicit: true };
  }
  return { text: finalText.trim().slice(0, SUMMARY_FALLBACK), explicit: false };
}

const cap1 = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

export function childPrompt(o: {
  requestTitle: string;
  parentIsland: FleetIsland;
  parentSummary: string;
  /** false = the parent wrote no `## Özet`; the summary is the head of its text. */
  parentSummaryExplicit?: boolean;
  handoff: Handoff;
}): string {
  const parent = cap1(o.parentIsland);
  return [
    `${parent} adasından devir (kullanıcı onayladı) — İstek: ${o.requestTitle}`,
    '',
    o.parentSummaryExplicit === false
      ? `${parent} adasının özeti (üst ada özet vermedi; metnin başı):`
      : `${parent} adasının özeti:`,
    o.parentSummary,
    '',
    `${parent} adasının senden istediği:`,
    o.handoff.prompt,
    '',
    `Raporunu \`## Özet\` bölümüyle bitir. Raporun ${parent} adasındaki session'a geri gider ve o devam eder.`,
  ].join('\n');
}

export type ReportStatus = 'done' | 'error' | 'stopped' | 'denied';

export function reportBackPrompt(
  childIsland: FleetIsland,
  childSummary: string,
  status: ReportStatus,
): string {
  const c = cap1(childIsland);
  switch (status) {
    case 'done':
      return `${c} adasından rapor:\n${childSummary}`;
    case 'error':
      return `${c} adasındaki iş hata ile bitti: ${childSummary}\nKendi başına devam et ya da durumu raporunda belirt.`;
    case 'stopped':
      return `${c} adasındaki iş kullanıcı tarafından durduruldu.\nKendi başına devam et ya da durumu raporunda belirt.`;
    case 'denied':
      return `${c}'a devir reddedildi: kullanıcı izin vermedi. Aynı isteği tekrarlama; işi kendin bitir ya da raporunda eksik olarak belirt.`;
  }
}

export type CapResult = { ok: true } | { ok: false; reason: string };

/**
 * `requestChildren` = sessions of the request except the root, plus gates already waiting;
 * `depth` = parentId hops of the asking session (root = 0).
 */
export function capCheck(
  o: { requestChildren: number; depth: number },
  manifest: { maxChildren: number },
): CapResult {
  if (o.requestChildren >= manifest.maxChildren)
    return { ok: false, reason: `istek başına en fazla ${manifest.maxChildren} alt session` };
  if (o.depth + 1 > MAX_DEPTH)
    return { ok: false, reason: `zincir derinliği en fazla ${MAX_DEPTH}` };
  return { ok: true };
}

/** Hand-offs of a finished run → gates to open (one round) + rejection lines. */
export function planGates(
  handoffs: readonly Handoff[],
  o: { requestChildren: number; depth: number; perMessage: number },
  manifest: { maxChildren: number },
): { open: Handoff[]; rejected: string[] } {
  const open: Handoff[] = [];
  const rejected: string[] = [];
  for (const h of handoffs) {
    const r =
      open.length >= o.perMessage
        ? ({ ok: false, reason: `mesaj başına en fazla ${o.perMessage} devir` } as const)
        : capCheck({ ...o, requestChildren: o.requestChildren + open.length }, manifest);
    if (r.ok) open.push(h);
    else rejected.push(`devir reddedildi: ${r.reason} (${h.island})`);
  }
  return { open, rejected };
}

/** Resume text of a finished round: every gate's report (or denial), in gate order. */
export const roundPrompt = (parts: readonly string[]): string => parts.join('\n\n');

/** Allowed gate → arguments of the child's `start` command. */
export function childStart(
  gate: Pick<FleetGate, 'fromSessionId' | 'fromIsland' | 'toIsland' | 'prompt' | 'requestId'>,
  ctx: { requestTitle: string; parentSummary: string; parentSummaryExplicit?: boolean },
): { island: FleetIsland; prompt: string; parentId: string; requestId: string } {
  return {
    island: gate.toIsland,
    parentId: gate.fromSessionId,
    requestId: gate.requestId,
    prompt: childPrompt({
      requestTitle: ctx.requestTitle,
      parentIsland: gate.fromIsland,
      parentSummary: ctx.parentSummary,
      parentSummaryExplicit: ctx.parentSummaryExplicit,
      handoff: { island: gate.toIsland, prompt: gate.prompt },
    }),
  };
}
