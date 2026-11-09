import { describe, expect, it } from 'vitest';
import { parseHandoffs } from './chain.ts';
import {
  NUDGE_PROMPT,
  doneGateDecision,
  finalTextAfterNudge,
  needsSummary,
  settleStep,
  withMaxTurns,
} from './done-gate.ts';

const cfg = { minTurns: 5, nudgeMaxTurns: 3 };

describe('needsSummary', () => {
  it('accepts the heading variants', () => {
    for (const h of [
      '## Özet',
      '## Ozet',
      '## Summary',
      '## özet',
      '##ÖZET',
      '### Özet',
      '# Summary',
    ])
      expect(needsSummary(`${h}\nbir şey`), h).toBe(false);
  });
  it('finds the heading deep in the message', () => {
    const text = `${'uzun metin\n'.repeat(80)}\n## Değişen dosyalar\n- a\n\n## Özet\nYapıldı.`;
    expect(needsSummary(text)).toBe(false);
  });
  it('needs one when absent (no frontmatter, prose mentions, empty)', () => {
    expect(needsSummary('Bitti, her şey tamam.')).toBe(true);
    expect(needsSummary('')).toBe(true);
    expect(needsSummary('Aşağıda özet var ama başlık yok\n## Değişen dosyalar\n- a')).toBe(true);
    expect(needsSummary('## Özetle\nx')).toBe(true);
  });
});

describe('doneGateDecision', () => {
  const t = 'iş bitti';
  it('nudges a long session without a summary', () => {
    expect(doneGateDecision({ turns: 5 }, t, cfg, false)).toBe('nudge');
    expect(doneGateDecision({ turns: 40 }, t, cfg, false)).toBe('nudge');
  });
  it('does not nudge: short session, summary present, already nudged, gate off', () => {
    expect(doneGateDecision({ turns: 4 }, t, cfg, false)).toBe('final');
    expect(doneGateDecision({ turns: 9 }, '## Özet\nx', cfg, false)).toBe('final');
    expect(doneGateDecision({ turns: 9 }, t, cfg, true)).toBe('final');
    expect(doneGateDecision({ turns: 9 }, t, { ...cfg, nudgeMaxTurns: 0 }, false)).toBe('final');
    expect(doneGateDecision({ turns: 0 }, t, { minTurns: 0, nudgeMaxTurns: 3 }, false)).toBe(
      'nudge',
    );
  });
});

describe('finalTextAfterNudge / withMaxTurns', () => {
  it('keeps the original when the nudge brought no summary', () => {
    expect(finalTextAfterNudge('orijinal', '')).toBe('orijinal');
    expect(finalTextAfterNudge('orijinal', 'tamam')).toBe('orijinal');
    expect(finalTextAfterNudge('orijinal', '## Özet\nx')).toBe('## Özet\nx');
  });
  it('swaps --max-turns without touching other flags', () => {
    expect(withMaxTurns(['--model', 'opus', '--max-turns', '30', '--add-dir', 'x'], 3)).toEqual([
      '--model',
      'opus',
      '--max-turns',
      '3',
      '--add-dir',
      'x',
    ]);
    expect(withMaxTurns(['--model', 'opus'], 3)).toEqual(['--model', 'opus', '--max-turns', '3']);
  });
  it('prompt names the report format', () => {
    expect(NUDGE_PROMPT).toContain('## Özet');
    expect(NUDGE_PROMPT).toContain('araç çağırma');
  });
});

/** Fake of the bridge end path: `end()` = one `result`; `final` work counts hand-off gates / resumes. */
function fakeRun(turns: number) {
  const run = { turns, nudged: false, before: undefined as string | undefined };
  const seen = { gates: 0, finals: 0, nudges: 0 };
  const end = (text: string): void => {
    const step = settleStep(run, text, cfg);
    if (step.kind === 'nudge') {
      run.nudged = true;
      run.before = text;
      seen.nudges++;
      return;
    }
    seen.finals++; // openGates + reportBack happen here and only here
    seen.gates += parseHandoffs(step.text, [{ theme: 'research', name: 'Research' }]).length;
  };
  return { end, seen };
}

describe('settleStep: hand-offs parsed once', () => {
  const handoff = '## → Research: şunu araştır\ndetay';
  it('nudged run: gates and parent resume only on the final text', () => {
    const { end, seen } = fakeRun(12);
    end('çalıştım, bitti'); // no summary -> nudge, nothing else may happen
    expect(seen).toEqual({ gates: 0, finals: 0, nudges: 1 });
    end(`## Özet\nx\n\n${handoff}`); // nudge reply is final
    expect(seen).toEqual({ gates: 1, finals: 1, nudges: 1 });
  });
  it('the second end is final even without a summary (no loop)', () => {
    const { end, seen } = fakeRun(12);
    end('metin');
    end('hâlâ özet yok');
    expect(seen).toEqual({ gates: 0, finals: 1, nudges: 1 });
  });
  it('a nudge reply without summary falls back to the original hand-offs, still once', () => {
    const { end, seen } = fakeRun(12);
    end(`işlem tamam\n${handoff}`);
    end('tamam');
    expect(seen).toEqual({ gates: 1, finals: 1, nudges: 1 });
  });
  it('a run with a summary settles immediately, never nudged', () => {
    const { end, seen } = fakeRun(12);
    end(`## Özet\nx\n${handoff}`);
    expect(seen).toEqual({ gates: 1, finals: 1, nudges: 0 });
  });
});
