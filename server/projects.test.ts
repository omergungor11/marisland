import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { addProject, loadProjects } from './projects.ts';

function fixture(): { root: string; dir: string } {
  const root = mkdtempSync(join(tmpdir(), 'proj-'));
  mkdirSync(join(root, 'fleet'));
  const dir = join(root, 'work');
  mkdirSync(dir);
  return { root, dir };
}

describe('projects', () => {
  it('missing file gives []', () => {
    expect(loadProjects(fixture().root)).toEqual([]);
  });

  it('adds with slug id, suffixes clashes, writes pretty JSON', () => {
    const { root, dir } = fixture();
    const a = addProject(root, { name: 'Piton Studios', dir, note: 'x', color: '#AABBCC' });
    expect(a.id).toBe('piton-studios');
    expect(addProject(root, { name: 'Piton Studios', dir }).id).toBe('piton-studios-2');
    const text = readFileSync(join(root, 'fleet/projects.json'), 'utf8');
    expect(text.endsWith('}\n')).toBe(true);
    expect(text).toContain('\n  "projects": [');
    expect(loadProjects(root)).toHaveLength(2);
  });

  it('validates input', () => {
    const { root, dir } = fixture();
    writeFileSync(join(dir, 'f.txt'), '');
    expect(() => addProject(root, { name: '', dir })).toThrow(/name/);
    expect(() => addProject(root, { name: 'a'.repeat(61), dir })).toThrow(/name/);
    expect(() => addProject(root, { name: 'a', dir: 'rel/x' })).toThrow(/absolute/);
    expect(() => addProject(root, { name: 'a', dir: join(dir, 'none') })).toThrow(/directory/);
    expect(() => addProject(root, { name: 'a', dir: join(dir, 'f.txt') })).toThrow(/directory/);
    expect(() => addProject(root, { name: 'a', dir, note: 'n'.repeat(201) })).toThrow(/note/);
    expect(() => addProject(root, { name: 'a', dir, color: 'red' })).toThrow(/color/);
    expect(() => addProject(root, null)).toThrow(/object/);
  });
});
