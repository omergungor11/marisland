/** `fleet/projects.json` (M43): registered projects the fleet may work on. */
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, resolve } from 'node:path';
import type { FleetProject } from '../src/fleet/protocol.ts';

const file = (root: string): string => resolve(root, 'fleet/projects.json');

export const expandHome = (p: string): string =>
  p === '~' ? homedir() : p.startsWith('~/') ? resolve(homedir(), p.slice(2)) : p;

export function loadProjects(root: string): FleetProject[] {
  const f = file(root);
  if (!existsSync(f)) return [];
  try {
    const o = JSON.parse(readFileSync(f, 'utf8')) as { projects?: unknown };
    return Array.isArray(o.projects) ? (o.projects as FleetProject[]) : [];
  } catch {
    return [];
  }
}

const slug = (name: string): string =>
  name
    .toLowerCase()
    .replace(/ı/g, 'i')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '') || 'proje';

/** Validates and appends a project; throws an Error with the user-facing message on bad input. */
export function addProject(root: string, input: unknown): FleetProject {
  if (typeof input !== 'object' || input === null || Array.isArray(input))
    throw new Error('body must be an object');
  const o = input as Record<string, unknown>;
  const name = typeof o.name === 'string' ? o.name.trim() : '';
  if (name.length < 1 || name.length > 60) throw new Error('name must be 1-60 characters');
  if (typeof o.dir !== 'string' || !o.dir.trim()) throw new Error('dir is required');
  const dir = expandHome(o.dir.trim());
  if (!isAbsolute(dir)) throw new Error('dir must be an absolute path');
  if (!existsSync(dir) || !statSync(dir).isDirectory())
    throw new Error(`dir is not an existing directory: ${dir}`);
  if (o.note !== undefined && (typeof o.note !== 'string' || o.note.length > 200))
    throw new Error('note must be a string of at most 200 characters');
  if (o.color !== undefined && (typeof o.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(o.color)))
    throw new Error('color must be #RRGGBB');

  const projects = loadProjects(root);
  const base = slug(name);
  let id = base;
  for (let n = 2; projects.some((p) => p.id === id); n++) id = `${base}-${n}`;
  const project: FleetProject = {
    id,
    name,
    dir: resolve(dir),
    ...(typeof o.note === 'string' && o.note ? { note: o.note } : {}),
    ...(typeof o.color === 'string' ? { color: o.color } : {}),
    createdAt: Date.now(),
  };
  writeFileSync(file(root), `${JSON.stringify({ projects: [...projects, project] }, null, 2)}\n`);
  return project;
}
