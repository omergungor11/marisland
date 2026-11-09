/**
 * `pnpm fleet:lint` (TASK-567): checks the island layout from `mar-plans/FLEET.md` "Dizin yapısı".
 * `lintFleet(root)` returns the problems (empty = clean); the CLI exits 1 on any. The vitest run
 * (`scripts/fleet-lint.test.ts`) calls it on the real repo, so `pnpm test` guards the layout.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateManifest } from '../server/config.ts';
import { THEME_IDS } from '../src/world/types.ts';

const CLAUDE_MD_MAX_LINES = 120;
const REFERENCE_ISLAND = 'coding';

const read = (p: string): string => readFileSync(p, 'utf8');
const isDir = (p: string): boolean => existsSync(p) && statSync(p).isDirectory();

function denyRules(path: string): string[] | string {
  try {
    const o = JSON.parse(read(path)) as { permissions?: { deny?: unknown } };
    const d = o.permissions?.deny;
    return Array.isArray(d) ? (d as string[]) : 'permissions.deny is not a list';
  } catch (e) {
    return `unreadable (${(e as Error).message})`;
  }
}

/** Frontmatter keys of a memory file; `type` may sit top-level or under `metadata:`. */
function frontmatterKeys(text: string): Set<string> | undefined {
  const m = /^---\n([\s\S]*?)\n---(?:\n|$)/.exec(text);
  if (!m) return undefined;
  const keys = new Set<string>();
  for (const line of m[1].split('\n')) {
    const k = /^(\s*)([A-Za-z_][\w-]*):/.exec(line);
    if (k) keys.add(k[2]);
  }
  return keys;
}

/** HQ manages the other islands' manifests and settings (FLEET.md "Kontrol (HQ)" 3), so it may write to siblings. */
const HQ_EXEMPT_RULES = ['Edit(../*/**)', 'Write(../*/**)'];

export function lintFleet(root: string): string[] {
  const problems: string[] = [];
  const islandsDir = resolve(root, 'fleet/islands');
  if (!isDir(islandsDir)) return ['fleet/islands/ is missing'];

  const refSettings = resolve(islandsDir, REFERENCE_ISLAND, '.claude/settings.json');
  const refDeny = denyRules(refSettings);
  if (typeof refDeny === 'string') problems.push(`${REFERENCE_ISLAND}: settings.json ${refDeny}`);

  const dirs = readdirSync(islandsDir).filter((d) => isDir(resolve(islandsDir, d)));
  for (const id of THEME_IDS) if (!dirs.includes(id)) problems.push(`island "${id}" is missing`);

  for (const dir of dirs) {
    const at = (p: string): string => `${dir}: ${p}`;
    const base = resolve(islandsDir, dir);
    if (!(THEME_IDS as readonly string[]).includes(dir)) problems.push(at('not a ThemeId'));

    const manifest = resolve(base, 'island.json');
    if (!existsSync(manifest)) problems.push(at('island.json missing'));
    else {
      try {
        for (const p of validateManifest(JSON.parse(read(manifest)), dir))
          problems.push(at(`island.json: ${p}`));
      } catch (e) {
        problems.push(at(`island.json: invalid JSON (${(e as Error).message})`));
      }
    }

    const claude = resolve(base, 'CLAUDE.md');
    if (!existsSync(claude)) problems.push(at('CLAUDE.md missing'));
    else {
      const n = read(claude).trimEnd().split('\n').length;
      if (n > CLAUDE_MD_MAX_LINES)
        problems.push(at(`CLAUDE.md has ${n} lines (max ${CLAUDE_MD_MAX_LINES})`));
    }

    const settings = resolve(base, '.claude/settings.json');
    if (!existsSync(settings)) problems.push(at('.claude/settings.json missing'));
    else {
      const deny = denyRules(settings);
      if (typeof deny === 'string') problems.push(at(`settings.json ${deny}`));
      else if (Array.isArray(refDeny))
        for (const rule of refDeny)
          if (dir === 'hq' && HQ_EXEMPT_RULES.includes(rule)) continue;
          else if (!deny.includes(rule)) problems.push(at(`settings.json deny lacks "${rule}"`));
    }

    for (const sub of ['knowledge', 'reports', '.claude/skills', '.claude/agents'])
      if (!isDir(resolve(base, sub))) problems.push(at(`${sub}/ missing`));

    const memoryDir = resolve(base, 'memory');
    if (!existsSync(resolve(memoryDir, 'MEMORY.md'))) problems.push(at('memory/MEMORY.md missing'));
    if (isDir(memoryDir))
      for (const f of readdirSync(memoryDir)) {
        if (!f.endsWith('.md') || f === 'MEMORY.md') continue;
        const keys = frontmatterKeys(read(resolve(memoryDir, f)));
        if (!keys) problems.push(at(`memory/${f} has no frontmatter`));
        else
          for (const k of ['name', 'description', 'type'])
            if (!keys.has(k)) problems.push(at(`memory/${f} frontmatter lacks "${k}"`));
      }

    const agentsDir = resolve(base, '.claude/agents');
    if (isDir(agentsDir))
      for (const f of readdirSync(agentsDir))
        if (f.endsWith('.md') && !f.startsWith(`${dir}-`))
          problems.push(at(`.claude/agents/${f} must be named ${dir}-*.md`));
  }

  const projectsFile = resolve(root, 'fleet/projects.json');
  if (existsSync(projectsFile)) problems.push(...lintProjects(read(projectsFile)));
  return problems;
}

/** `fleet/projects.json` shape (M43): unique slug ids, non-empty names, absolute dirs. */
export function lintProjects(text: string): string[] {
  let o: unknown;
  try {
    o = JSON.parse(text);
  } catch (e) {
    return [`projects.json: invalid JSON (${(e as Error).message})`];
  }
  const list = (o as { projects?: unknown } | null)?.projects;
  if (!Array.isArray(list)) return ['projects.json: "projects" must be a list'];
  const problems: string[] = [];
  const seen = new Set<string>();
  list.forEach((p: unknown, i) => {
    const q = (p ?? {}) as Record<string, unknown>;
    const at = `projects.json[${i}]`;
    if (typeof q.id !== 'string' || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(q.id))
      problems.push(`${at}: id must be a slug`);
    else if (seen.has(q.id)) problems.push(`${at}: duplicate id "${q.id}"`);
    else seen.add(q.id);
    if (typeof q.name !== 'string' || !q.name.trim()) problems.push(`${at}: name is empty`);
    if (typeof q.dir !== 'string' || !isAbsolute(q.dir))
      problems.push(`${at}: dir must be an absolute path`);
  });
  return problems;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const problems = lintFleet(resolve(import.meta.dirname, '..'));
  for (const p of problems) console.error(`fleet-lint: ${p}`);
  if (problems.length) process.exit(1);
  console.info('fleet-lint: ok');
}
