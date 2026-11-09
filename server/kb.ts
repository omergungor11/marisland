/**
 * Read-only knowledge base (M43, TASK-584): the files HQ and the window may browse over HTTP.
 * Pure functions over the filesystem (no bridge state). A path is always `<source id>/<relative>`
 * and is accepted only when it is one of the files the tree would list (so `..`, absolute paths
 * and symlink escapes never reach `readFileSync`).
 */
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { isAbsolute, resolve, sep } from 'node:path';
import type { KbDoc, KbFile, KbFileKind, KbHit, KbSource } from '../src/fleet/protocol.ts';
import type { FleetConfig } from './config.ts';
import { expandHome } from './projects.ts';

export const KB_MAX_BYTES = 256 * 1024;
const EXTS = ['.md', '.json'];
const SKIP_DIRS = new Set(['node_modules']);

const isDir = (p: string): boolean => existsSync(p) && statSync(p).isDirectory();

const readJson = (p: string): Record<string, unknown> | undefined => {
  try {
    const o: unknown = JSON.parse(readFileSync(p, 'utf8'));
    return typeof o === 'object' && o !== null ? (o as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
};

interface SourceRoot extends KbSource {
  dir: string;
}

function sourceRoots(root: string, cfg: Pick<FleetConfig, 'hqMemoryDir'>): SourceRoot[] {
  const out: SourceRoot[] = [];
  const islands = resolve(root, 'fleet/islands');
  if (isDir(islands))
    for (const theme of readdirSync(islands).sort()) {
      const dir = resolve(islands, theme);
      if (!isDir(dir)) continue;
      const name = readJson(resolve(dir, 'island.json'))?.name;
      out.push({
        id: `island:${theme}`,
        label: typeof name === 'string' && name ? name : theme,
        island: theme as KbSource['island'],
        dir,
      });
    }
  out.push({ id: 'fleet', label: 'Filo', dir: resolve(root, 'fleet') });
  out.push({ id: 'mar-docs', label: 'Proje hafızası', dir: resolve(root, 'mar-docs') });
  if (cfg.hqMemoryDir) {
    const dir = resolve(expandHome(cfg.hqMemoryDir));
    if (isDir(dir)) out.push({ id: 'hq-memory', label: 'HQ auto-memory', dir });
  }
  return out;
}

export function kbSources(root: string, cfg: Pick<FleetConfig, 'hqMemoryDir'>): KbSource[] {
  return sourceRoots(root, cfg).map(({ dir: _dir, ...s }) => s);
}

/** Relative paths (posix) of `.md` / `.json` files under `dir`, dot-dirs and node_modules skipped. */
function walk(dir: string, prefix = ''): string[] {
  if (!isDir(dir)) return [];
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
    a.name < b.name ? -1 : 1,
  )) {
    if (e.isDirectory()) {
      if (e.name.startsWith('.') || SKIP_DIRS.has(e.name)) continue;
      out.push(...walk(resolve(dir, e.name), `${prefix}${e.name}/`));
    } else if (e.isFile() && EXTS.some((x) => e.name.endsWith(x))) out.push(`${prefix}${e.name}`);
  }
  return out;
}

function candidates(s: SourceRoot): string[] {
  if (s.id === 'fleet')
    return [
      'CLAUDE.md',
      ...walk(resolve(s.dir, 'kb'), 'kb/'),
      'fleet.config.json',
      'projects.json',
    ].filter((r) => existsSync(resolve(s.dir, r)));
  if (s.id === 'mar-docs')
    return ['MEMORY.md', 'DECISIONS.md'].filter((r) => existsSync(resolve(s.dir, r)));
  if (s.id === 'hq-memory') return walk(s.dir).filter((r) => r.endsWith('.md'));
  return walk(s.dir);
}

function kindOf(s: SourceRoot, rel: string): KbFileKind {
  if (s.id === 'mar-docs') return 'doc';
  if (s.id === 'hq-memory') return 'memory';
  if (s.id === 'fleet') {
    if (rel === 'CLAUDE.md') return 'claude';
    if (rel.startsWith('kb/')) return 'knowledge';
    return 'config';
  }
  if (rel === 'CLAUDE.md') return 'claude';
  if (rel === 'island.json') return 'config';
  if (rel.startsWith('memory/')) return 'memory';
  if (rel.startsWith('knowledge/')) return 'knowledge';
  if (rel.startsWith('reports/')) return 'report';
  return 'other';
}

/** Frontmatter block (flattened, one nesting level) and the body after it. */
export function parseFrontmatter(text: string): {
  frontmatter: Record<string, string>;
  body: string;
} {
  const m = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(text);
  if (!m) return { frontmatter: {}, body: text };
  const frontmatter: Record<string, string> = {};
  let parent = '';
  for (const line of m[1].split(/\r?\n/)) {
    const k = /^(\s*)([A-Za-z_][\w-]*)\s*:\s*(.*?)\s*$/.exec(line);
    if (!k) continue;
    const nested = k[1].length > 0 && parent !== '';
    const val = k[3].replace(/^(["'])(.*)\1$/, '$2');
    if (!nested) parent = val === '' ? k[2] : '';
    if (val === '' && !nested) continue;
    frontmatter[nested ? `${parent}.${k[2]}` : k[2]] = val;
  }
  return { frontmatter, body: text.slice(m[0].length) };
}

function describeFile(s: SourceRoot, rel: string): KbFile | undefined {
  const abs = resolve(s.dir, rel);
  let st;
  try {
    st = statSync(abs);
  } catch {
    return undefined;
  }
  if (!st.isFile() || st.size > KB_MAX_BYTES) return undefined;
  let title = rel.slice(rel.lastIndexOf('/') + 1).replace(/\.[^.]+$/, '');
  let description: string | undefined;
  let type: string | undefined;
  if (rel.endsWith('.md')) {
    const { frontmatter: fm, body } = parseFrontmatter(readFileSync(abs, 'utf8'));
    const h1 = /^# +(.+?)\s*$/m.exec(body)?.[1];
    title = fm.name || h1 || title;
    description = fm.description || undefined;
    type = fm.type || fm['metadata.type'] || undefined;
  }
  return {
    path: `${s.id}/${rel}`,
    source: s.id,
    ...(s.island ? { island: s.island } : {}),
    kind: kindOf(s, rel),
    title,
    ...(description ? { description } : {}),
    ...(type ? { type } : {}),
    mtime: Math.round(st.mtimeMs),
    size: st.size,
  };
}

export function kbTree(
  root: string,
  cfg: Pick<FleetConfig, 'hqMemoryDir'>,
): { sources: KbSource[]; files: KbFile[] } {
  const roots = sourceRoots(root, cfg);
  const files: KbFile[] = [];
  for (const s of roots)
    for (const rel of candidates(s)) {
      const f = describeFile(s, rel);
      if (f) files.push(f);
    }
  return { sources: roots.map(({ dir: _dir, ...s }) => s), files };
}

/** Null for anything outside a source: unknown source, `..`, absolute, not listed, symlink escape. */
export function kbDoc(
  root: string,
  cfg: Pick<FleetConfig, 'hqMemoryDir'>,
  path: string,
): KbDoc | null {
  const roots = sourceRoots(root, cfg);
  const s = roots.find((r) => path.startsWith(`${r.id}/`));
  if (!s) return null;
  const rel = path.slice(s.id.length + 1);
  if (!rel || isAbsolute(rel) || rel.split(/[\\/]/).includes('..')) return null;
  if (!candidates(s).includes(rel)) return null;
  try {
    const real = realpathSync(resolve(s.dir, rel));
    const base = realpathSync(s.dir);
    if (!real.startsWith(base + sep)) return null;
  } catch {
    return null;
  }
  const file = describeFile(s, rel);
  if (!file) return null;
  const { frontmatter, body } = parseFrontmatter(readFileSync(resolve(s.dir, rel), 'utf8'));
  const links = [...new Set([...body.matchAll(/\[\[([^\]\n]+)\]\]/g)].map((m) => m[1].trim()))];
  return { file, text: body, frontmatter, links };
}

export function kbSearch(
  root: string,
  cfg: Pick<FleetConfig, 'hqMemoryDir'>,
  q: string,
  max = 200,
): KbHit[] {
  const needle = q.toLowerCase();
  if (needle.length < 2) return [];
  const roots = sourceRoots(root, cfg);
  const hits: KbHit[] = [];
  for (const s of roots)
    for (const rel of candidates(s)) {
      const f = describeFile(s, rel);
      if (!f) continue;
      const lines = readFileSync(resolve(s.dir, rel), 'utf8').split(/\r?\n/);
      for (let i = 0; i < lines.length; i++)
        if (lines[i].toLowerCase().includes(needle)) {
          hits.push({ path: f.path, line: i + 1, text: lines[i].trim().slice(0, 200) });
          if (hits.length >= max) return hits;
        }
    }
  return hits;
}
