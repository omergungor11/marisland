import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { lintFleet } from './fleet-lint.ts';

const ROOT = resolve(import.meta.dirname, '..');
const tmp = mkdtempSync(join(tmpdir(), 'fleet-lint-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe('fleet-lint', () => {
  it('the real repo is clean', () => {
    expect(lintFleet(ROOT)).toEqual([]);
  });

  it('catches layout breakage on a copy', () => {
    cpSync(resolve(ROOT, 'fleet/islands'), join(tmp, 'fleet/islands'), { recursive: true });
    const qa = join(tmp, 'fleet/islands/qa');
    writeFileSync(join(qa, 'island.json'), '{"theme":"design"}');
    writeFileSync(join(qa, 'CLAUDE.md'), 'x\n'.repeat(130));
    writeFileSync(join(qa, 'memory/bad.md'), '---\nname: bad\n---\nbody');
    writeFileSync(join(qa, '.claude/agents/other.md'), 'x');
    writeFileSync(join(qa, '.claude/settings.json'), '{"permissions":{"deny":[]}}');
    const out = lintFleet(tmp).join('\n');
    expect(out).toMatch(/qa: island\.json: missing required key/);
    expect(out).toMatch(/qa: island\.json: theme "design" != directory "qa"/);
    expect(out).toMatch(/qa: CLAUDE\.md has 130 lines/);
    expect(out).toMatch(/qa: memory\/bad\.md frontmatter lacks "description"/);
    expect(out).toMatch(/qa: \.claude\/agents\/other\.md must be named qa-\*\.md/);
    expect(out).toMatch(/qa: settings\.json deny lacks "Bash\(git push\*\)"/);
    expect(out).not.toMatch(/coding:/);
  });
});
