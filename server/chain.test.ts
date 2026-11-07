import { describe, expect, it } from 'vitest';
import {
  capCheck,
  childPrompt,
  childStart,
  parseHandoffs,
  parseSummary,
  summaryOf,
  maxPerMessage,
  planGates,
  reportBackPrompt,
  roundPrompt,
} from './chain.ts';

const islands = [
  { theme: 'marketing', name: 'Pazarlama' },
  { theme: 'design', name: 'Tasarım' },
  { theme: 'coding', name: 'Kodlama' },
] as const;

describe('parseHandoffs', () => {
  it('ThemeId, spacing and arrow variants', () => {
    expect(parseHandoffs('## → design: afiş çiz', islands)).toEqual([
      { island: 'design', prompt: 'afiş çiz' },
    ]);
    expect(parseHandoffs('## → Design :   afiş', islands)).toEqual([
      { island: 'design', prompt: 'afiş' },
    ]);
    expect(parseHandoffs('##→CODING:x', islands)).toEqual([{ island: 'coding', prompt: 'x' }]);
    expect(parseHandoffs('## -> design: ok', islands)).toHaveLength(1);
  });
  it('Turkish island names, folded', () => {
    expect(parseHandoffs('## → Pazarlama: metin', islands)[0].island).toBe('marketing');
    expect(parseHandoffs('## → TASARIM: x', islands)[0].island).toBe('design');
    expect(
      parseHandoffs('## → Kalite (QA): x', [{ theme: 'qa', name: 'Kalite (QA)' }])[0].island,
    ).toBe('qa');
  });
  it('multi-line prompts end at the next heading; several hand-offs', () => {
    const t = [
      '## Özet',
      'bitti',
      '## → design: ilk satır',
      'ikinci satır',
      '',
      '- madde',
      '## → coding: kodla',
      '## HQ’ya öneri',
      '- başka',
    ].join('\n');
    expect(parseHandoffs(t, islands)).toEqual([
      { island: 'design', prompt: 'ilk satır\nikinci satır\n\n- madde' },
      { island: 'coding', prompt: 'kodla' },
    ]);
  });
  it('none: unknown islands, empty prompts, fenced examples, plain text', () => {
    expect(parseHandoffs('merhaba', islands)).toEqual([]);
    expect(parseHandoffs('## → mars: x', islands)).toEqual([]);
    expect(parseHandoffs('## → design:', islands)).toEqual([]);
    expect(parseHandoffs('```\n## → design: x\n```', islands)).toEqual([]);
    // prose arrows and other heading levels never open a gate
    expect(parseHandoffs('→ design: x', islands)).toEqual([]);
    expect(parseHandoffs('- → design: x', islands)).toEqual([]);
    expect(parseHandoffs('metin\n  ## → design: x', islands)).toEqual([]);
    expect(parseHandoffs('### → design: x', islands)).toEqual([]);
    expect(parseHandoffs('# → design: x', islands)).toEqual([]);
  });
});

describe('parseSummary', () => {
  it('takes the Özet body up to the next heading', () => {
    expect(parseSummary('giriş\n## Özet\n- a\n- b\n## Dosyalar\nx')).toBe('- a\n- b');
    expect(parseSummary('## ozet\nx')).toBe('x');
  });
  it('falls back to the first 600 chars', () => {
    expect(parseSummary('a'.repeat(900))).toHaveLength(600);
    expect(summaryOf('x').explicit).toBe(false);
    expect(summaryOf('## Özet\ny').explicit).toBe(true);
    expect(parseSummary('## Özet\n\n## Başka\nx')).toBe('## Özet\n\n## Başka\nx');
  });
});

describe('prompts', () => {
  const handoff = { island: 'design', prompt: 'iki görsel' } as const;
  it('childPrompt carries title, parent, summary, hand-off and the report instruction', () => {
    const p = childPrompt({
      requestTitle: '5 gönderi',
      parentIsland: 'marketing',
      parentSummary: 'metinler hazır',
      handoff,
    });
    expect(p).toContain('Marketing adasından devir');
    expect(p).toContain('5 gönderi');
    expect(p).toContain('metinler hazır');
    expect(p).toContain('iki görsel');
    expect(p).toContain('## Özet');
  });
  it('reportBackPrompt variants', () => {
    expect(reportBackPrompt('design', 'tamam', 'done')).toBe('Design adasından rapor:\ntamam');
    expect(reportBackPrompt('design', 'exit 1', 'error')).toContain('hata');
    expect(reportBackPrompt('design', '', 'stopped')).toContain('durduruldu');
    expect(reportBackPrompt('design', '', 'denied')).toContain("Design'a devir reddedildi");
  });
  it('childStart maps a gate to start args', () => {
    const s = childStart(
      {
        fromSessionId: 'p1',
        fromIsland: 'marketing',
        toIsland: 'design',
        prompt: 'x',
        requestId: 'r1',
      },
      { requestTitle: 't', parentSummary: 's' },
    );
    expect(s).toMatchObject({ island: 'design', parentId: 'p1', requestId: 'r1' });
    expect(s.prompt).toContain('x');
  });
});

describe('caps', () => {
  const m = { maxChildren: 3 };
  it('ok / children / depth', () => {
    expect(capCheck({ requestChildren: 2, depth: 2 }, m)).toEqual({ ok: true });
    expect(capCheck({ requestChildren: 3, depth: 0 }, m)).toMatchObject({
      ok: false,
      reason: expect.stringContaining('3 alt session'),
    });
    expect(capCheck({ requestChildren: 0, depth: 3 }, m)).toMatchObject({
      ok: false,
      reason: expect.stringContaining('derinliği'),
    });
  });
  it('planGates opens a round up to the per-message limit and rejects the rest', () => {
    const hs = [
      { island: 'design', prompt: 'a' },
      { island: 'coding', prompt: 'b' },
      { island: 'qa', prompt: 'c' },
    ] as const;
    const r = planGates(hs, { requestChildren: 0, depth: 0, perMessage: 2 }, m);
    expect(r.open).toEqual([hs[0], hs[1]]);
    expect(r.rejected).toHaveLength(1);
    expect(r.rejected[0]).toContain('devir reddedildi');
    expect(planGates(hs, { requestChildren: 3, depth: 0, perMessage: 2 }, m).open).toEqual([]);
    // children cap counts the gates of the same round
    expect(planGates(hs, { requestChildren: 2, depth: 0, perMessage: 7 }, m).open).toHaveLength(1);
  });
  it('per-message limits: 2 everywhere, 7 for hq', () => {
    expect(maxPerMessage('marketing')).toBe(2);
    expect(maxPerMessage('hq')).toBe(7);
  });
  it('roundPrompt joins reports with a blank line', () => {
    expect(roundPrompt(['Design adasından rapor:\na', "Coding'a devir reddedildi"])).toBe(
      "Design adasından rapor:\na\n\nCoding'a devir reddedildi",
    );
  });
  it('childPrompt notes a missing parent summary', () => {
    const p = childPrompt({
      requestTitle: 't',
      parentIsland: 'marketing',
      parentSummary: 's',
      parentSummaryExplicit: false,
      handoff: { island: 'design', prompt: 'x' },
    });
    expect(p).toContain('üst ada özet vermedi');
  });
});
