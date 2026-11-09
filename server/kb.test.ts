import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { kbDoc, kbSearch, kbSources, kbTree, parseFrontmatter } from './kb.ts';

function put(root: string, rel: string, text: string): void {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), text);
}

function fixture(): { root: string; cfg: { hqMemoryDir: string } } {
  const root = mkdtempSync(join(tmpdir(), 'kb-'));
  const hq = join(root, 'hqmem');
  put(root, 'fleet/islands/coding/island.json', '{"name":"Kod Adası"}');
  put(root, 'fleet/islands/coding/CLAUDE.md', '# Coding\nGotcha here\n');
  put(
    root,
    'fleet/islands/coding/memory/a.md',
    '---\nname: Alpha\ndescription: d1\nmetadata:\n  type: feedback\n---\nBody [[beta]] and [[beta]] [[gamma]]\n',
  );
  put(root, 'fleet/islands/coding/memory/b.md', '---\nname: B\ntype: user\n---\nx\n');
  put(root, 'fleet/islands/coding/knowledge/k.md', 'no heading\n');
  put(root, 'fleet/islands/coding/reports/2026-01-01.md', '# Rapor\n');
  put(root, 'fleet/islands/coding/notes.txt', 'ignored');
  put(root, 'fleet/islands/coding/.claude/settings.json', '{}');
  put(root, 'fleet/islands/coding/node_modules/x.md', 'x');
  put(root, 'fleet/islands/coding/big.md', 'a'.repeat(300 * 1024));
  put(root, 'fleet/CLAUDE.md', '# Filo\n');
  put(root, 'fleet/kb/one.md', '# One\n');
  put(root, 'fleet/fleet.config.json', '{}');
  put(root, 'fleet/projects.json', '{"projects":[]}');
  put(root, 'fleet/runs/index.json', '{}');
  put(root, 'mar-docs/MEMORY.md', '# Mem\n');
  put(root, 'mar-docs/DECISIONS.md', '# Dec\n');
  put(root, 'mar-docs/ART_BIBLE.md', '# Art\n');
  put(root, 'CLAUDE.md', 'ROOT SECRET');
  put(hq, 'MEMORY.md', '- idx\n');
  put(hq, 'sub/deep.md', 'deep\n');
  return { root, cfg: { hqMemoryDir: hq } };
}

describe('kb', () => {
  it('lists sources, with hq-memory only when configured and existing', () => {
    const { root, cfg } = fixture();
    expect(kbSources(root, cfg).map((s) => s.id)).toEqual([
      'island:coding',
      'fleet',
      'mar-docs',
      'hq-memory',
    ]);
    expect(kbSources(root, cfg)[0]).toMatchObject({ label: 'Kod Adası', island: 'coding' });
    expect(kbSources(root, {} as never).map((s) => s.id)).not.toContain('hq-memory');
    expect(kbSources(root, { hqMemoryDir: join(root, 'nope') }).map((s) => s.id)).not.toContain(
      'hq-memory',
    );
  });

  it('builds the tree with kinds, titles and filters', () => {
    const { root, cfg } = fixture();
    const { files } = kbTree(root, cfg);
    const paths = files.map((f) => f.path);
    expect(paths).toEqual([
      'island:coding/CLAUDE.md',
      'island:coding/island.json',
      'island:coding/knowledge/k.md',
      'island:coding/memory/a.md',
      'island:coding/memory/b.md',
      'island:coding/reports/2026-01-01.md',
      'fleet/CLAUDE.md',
      'fleet/kb/one.md',
      'fleet/fleet.config.json',
      'fleet/projects.json',
      'mar-docs/MEMORY.md',
      'mar-docs/DECISIONS.md',
      'hq-memory/MEMORY.md',
      'hq-memory/sub/deep.md',
    ]);
    const by = Object.fromEntries(files.map((f) => [f.path, f]));
    expect(by['island:coding/memory/a.md']).toMatchObject({
      kind: 'memory',
      title: 'Alpha',
      description: 'd1',
      type: 'feedback',
      island: 'coding',
    });
    expect(by['island:coding/memory/b.md'].type).toBe('user');
    expect(by['island:coding/knowledge/k.md'].title).toBe('k');
    expect(by['island:coding/CLAUDE.md']).toMatchObject({ kind: 'claude', title: 'Coding' });
    expect(by['island:coding/island.json'].kind).toBe('config');
    expect(by['mar-docs/MEMORY.md'].kind).toBe('doc');
    expect(by['fleet/projects.json'].kind).toBe('config');
    expect(by['hq-memory/sub/deep.md'].kind).toBe('memory');
  });

  it('reads a doc: frontmatter flattened, body stripped, unique links', () => {
    const { root, cfg } = fixture();
    const doc = kbDoc(root, cfg, 'island:coding/memory/a.md');
    expect(doc?.frontmatter).toEqual({
      name: 'Alpha',
      description: 'd1',
      'metadata.type': 'feedback',
    });
    expect(doc?.text).toBe('Body [[beta]] and [[beta]] [[gamma]]\n');
    expect(doc?.links).toEqual(['beta', 'gamma']);
  });

  it('refuses traversal, absolute, unlisted files and symlink escapes', () => {
    const { root, cfg } = fixture();
    expect(kbDoc(root, cfg, 'island:coding/../../CLAUDE.md')).toBeNull();
    expect(kbDoc(root, cfg, 'island:coding/../../../CLAUDE.md')).toBeNull();
    expect(kbDoc(root, cfg, 'mar-docs//etc/passwd')).toBeNull();
    expect(kbDoc(root, cfg, 'mar-docs/ART_BIBLE.md')).toBeNull();
    expect(kbDoc(root, cfg, 'fleet/runs/index.json')).toBeNull();
    expect(kbDoc(root, cfg, 'island:coding/big.md')).toBeNull();
    expect(kbDoc(root, cfg, 'nosuch/x.md')).toBeNull();
    symlinkSync(join(root, 'CLAUDE.md'), join(root, 'fleet/kb/link.md'));
    expect(kbDoc(root, cfg, 'fleet/kb/link.md')).toBeNull();
    expect(kbTree(root, cfg).files.some((f) => f.path.endsWith('link.md'))).toBe(false);
  });

  it('searches case-insensitively, ignores short queries, caps hits', () => {
    const { root, cfg } = fixture();
    expect(kbSearch(root, cfg, 'gotcha')).toEqual([
      { path: 'island:coding/CLAUDE.md', line: 2, text: 'Gotcha here' },
    ]);
    expect(kbSearch(root, cfg, 'g')).toEqual([]);
    expect(kbSearch(root, cfg, '# ', 1)).toHaveLength(1);
  });

  it('parses frontmatter-less text untouched', () => {
    expect(parseFrontmatter('# hi\n')).toEqual({ frontmatter: {}, body: '# hi\n' });
  });
});
