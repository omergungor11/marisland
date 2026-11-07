import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { newStreamState, parseTitle, reduceEvent, reduceJsonl, titlePrompt } from './stream.ts';

const sample = readFileSync(`${import.meta.dirname}/fixtures/stream-sample.jsonl`, 'utf8');
const events = sample
  .trim()
  .split('\n')
  .map((l) => JSON.parse(l) as unknown);

describe('stream reducer on a real run', () => {
  it('maps init, assistant text and result; ignores hooks and rate limits', () => {
    const st = newStreamState();
    const reduced = events.map((e) => reduceEvent(st, e));
    const init = reduced.find((r) => r.init)?.init;
    expect(init?.sessionId).toMatch(/^[0-9a-f-]{36}$/);
    expect(init?.model).toBeTruthy();
    const lines = reduced.flatMap((r) => r.lines);
    expect(lines.map((l) => l.kind)).toEqual(['system', 'assistant', 'result']);
    expect(lines[1].text).toBe('pong');
    expect(reduced.find((r) => r.assistantText)?.assistantText).toBe('pong');
    const result = reduced.find((r) => r.result)?.result;
    expect(result).toMatchObject({ ok: true, subtype: 'success', turns: 1, text: 'pong' });
    expect(result?.costUsd).toBeGreaterThan(0);
    expect(lines[2].text).toMatch(/^done · 1 turns · \$/);
  });

  it('reduceJsonl gives dense seq and the same lines', () => {
    const lines = reduceJsonl(sample, 's1', 123);
    expect(lines.map((l) => l.seq)).toEqual([0, 1, 2]);
    expect(lines.every((l) => l.sessionId === 's1' && l.at === 123)).toBe(true);
  });
});

describe('stream reducer shapes', () => {
  it('pairs tool_result with its tool_use name and clips long text', () => {
    const st = newStreamState();
    const use = reduceEvent(st, {
      type: 'assistant',
      message: {
        content: [{ type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'ls -la' } }],
      },
    });
    expect(use.lines).toEqual([{ kind: 'tool_use', text: 'Bash ls -la', tool: 'Bash' }]);
    const res = reduceEvent(st, {
      type: 'user',
      message: {
        content: [
          { type: 'tool_result', tool_use_id: 't1', content: `a.txt\nb.txt${'x'.repeat(500)}` },
        ],
      },
    });
    expect(res.lines[0]).toMatchObject({ kind: 'tool_result', tool: 'Bash', text: 'a.txt' });
    const long = reduceEvent(st, {
      type: 'assistant',
      message: { content: [{ type: 'text', text: 'y'.repeat(900) }] },
    });
    expect(long.lines[0].text.length).toBeLessThanOrEqual(4000);
  });

  it('assistant prose keeps newlines so trailing `## →` headings survive (TASK-577)', () => {
    const st = newStreamState();
    const body = `## Özet\n${'x'.repeat(900)}\n\n\n\n## → design: 5 gönderi için görsel\n  gövde  satırı`;
    const r = reduceEvent(st, {
      type: 'assistant',
      message: { content: [{ type: 'text', text: body }] },
    });
    const text = r.lines[0].text;
    expect(text).toContain('\n## → design: 5 gönderi için görsel\ngövde satırı');
    expect(text).not.toContain('\n\n\n');
    expect(r.lastLine).toBe('## Özet');
    const huge = reduceEvent(st, {
      type: 'assistant',
      message: { content: [{ type: 'text', text: 'y'.repeat(5000) }] },
    });
    expect(huge.lines[0].text.length).toBe(4000);
    expect(huge.lines[0].text.endsWith('…')).toBe(true);
  });

  it('partials only move lastLine', () => {
    const st = newStreamState();
    const r = reduceEvent(st, {
      type: 'stream_event',
      event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Merhaba' } },
    });
    expect(r.lines).toEqual([]);
    expect(r.lastLine).toBe('Merhaba');
  });

  it('error results are not ok', () => {
    const r = reduceEvent(newStreamState(), {
      type: 'result',
      subtype: 'error_max_turns',
      is_error: true,
      num_turns: 30,
    });
    expect(r.result).toMatchObject({ ok: false, subtype: 'error_max_turns', turns: 30 });
    expect(r.lines[0].text).toContain('error_max_turns');
  });

  it('never throws on junk', () => {
    const st = newStreamState();
    for (const j of [null, 1, 'x', [], {}, { type: 5 }, { type: 'wat' }, { type: 'assistant' }])
      expect(reduceEvent(st, j).lines).toEqual([]);
    expect(reduceEvent(st, { type: 'bridge_stderr', text: 'boom' }).lines[0].kind).toBe('stderr');
  });
});

describe('title', () => {
  it('parses and trims the haiku result', () => {
    expect(parseTitle(JSON.stringify({ result: '"Dosyaları listele ve selam ver."\n' }))).toBe(
      'Dosyaları listele ve selam ver',
    );
    expect(parseTitle(JSON.stringify({ result: 'x', is_error: true }))).toBeUndefined();
    expect(parseTitle('not json')).toBeUndefined();
  });
  it('caps the prompt at 500 chars', () => {
    expect(titlePrompt('a'.repeat(900)).length).toBeLessThan(600);
  });
});
