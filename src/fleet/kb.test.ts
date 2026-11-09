import { describe, expect, it, vi } from 'vitest';
import { FLEET } from '../content/fleet.ts';
import {
  createKbApi,
  groupHits,
  hitLine,
  httpBaseOf,
  isStale,
  resolveLink,
  shortDir,
  tabFiles,
} from './kb.ts';
import { createKbMock, splitFrontmatter } from './kb-mock.ts';
import { applyFleetEvent, emptyFleetState } from './client.ts';
import { createFleetMock } from './mock.ts';
import type { FleetEvent } from './protocol.ts';

const NOW = FLEET.captureNow;

describe('kb mock (TASK-585)', () => {
  it('is deterministic per seed and shaped like the bridge tree', async () => {
    const a = await createKbMock(1001, NOW).tree();
    const b = await createKbMock(1001, NOW).tree();
    expect(a).toEqual(b);
    expect((await createKbMock(1002, NOW).tree()).files).not.toEqual(a.files);
    expect(a.sources.map((s) => s.id)).toEqual([
      'island:hq',
      'island:coding',
      'island:marketing',
      'island:qa',
      'island:design',
      'island:devops',
      'island:research',
      'fleet',
      'mar-docs',
      'hq-memory',
    ]);
    for (const f of a.files) expect(f.path.startsWith(`${f.source}/`)).toBe(true);
    // every island: CLAUDE.md, MEMORY.md, ≥ 1 memory file, a knowledge file
    for (const s of a.sources.filter((x) => x.island)) {
      const own = a.files.filter((f) => f.source === s.id);
      expect(own.some((f) => f.path.endsWith('/CLAUDE.md'))).toBe(true);
      expect(own.some((f) => f.path.endsWith('/memory/MEMORY.md'))).toBe(true);
      expect(own.filter((f) => f.kind === 'memory').length).toBeGreaterThanOrEqual(2);
      expect(own.some((f) => f.kind === 'knowledge')).toBe(true);
    }
    expect(a.files.filter((f) => f.kind === 'report')).toHaveLength(4);
    expect(a.files.filter((f) => f.source === 'hq-memory')).toHaveLength(4);
    expect(a.files.filter((f) => isStale(f, NOW))).toHaveLength(1);
  });

  it('serves docs without frontmatter, with flattened keys and links', async () => {
    const kb = createKbMock(1001, NOW);
    const doc = await kb.doc('island:coding/memory/golge-acne.md');
    expect(doc?.file.title).toBe('Gölge acne: iskele');
    expect(doc?.file.type).toBe('feedback');
    expect(doc?.frontmatter['metadata.type']).toBe('feedback');
    expect(doc?.text.startsWith('# Gölge acne')).toBe(true);
    expect(doc?.links).toEqual(['worker-testleri', 'eski-shader-notu']);
    expect(await kb.doc('island:coding/nope.md')).toBeNull();
  });

  it('searches every file case-insensitively with 1-based file lines', async () => {
    const kb = createKbMock(1001, NOW);
    const hits = await kb.search('NORMALBIAS');
    expect(hits.length).toBeGreaterThan(0);
    for (const h of hits) {
      const raw = kb.raw(h.path) ?? '';
      expect(raw.split('\n')[h.line - 1].trim()).toBe(h.text);
      expect(h.text.toLowerCase()).toContain('normalbias');
    }
    expect(await kb.search('zzzz-yok')).toEqual([]);
  });

  it('addProject validates like the bridge', async () => {
    const kb = createKbMock(1001, NOW);
    expect((await kb.addProject({ name: '', dir: '/x' })).error).toBeTruthy();
    expect((await kb.addProject({ name: 'Yeni', dir: 'rel/dir' })).error).toBeTruthy();
    expect((await kb.addProject({ name: 'Marisland', dir: '/x' })).error).toBeTruthy();
    const ok = await kb.addProject({ name: 'Çiçek Dükkânı', dir: '/Users/o/cicek', note: 'site' });
    expect(ok.project).toMatchObject({ id: 'cicek-dukkani', dir: '/Users/o/cicek', note: 'site' });
  });
});

describe('kb helpers (TASK-585)', () => {
  it('filters tabs by kind; reports newest first', async () => {
    const { files } = await createKbMock(1001, NOW).tree();
    expect(tabFiles(files, 'hafiza').every((f) => f.kind === 'memory')).toBe(true);
    expect(tabFiles(files, 'bilgi').map((f) => f.kind)).toContain('claude');
    expect(tabFiles(files, 'bilgi').map((f) => f.kind)).toContain('config');
    // grouped by source in the tree's order (hq-memory last), not by raw path
    const { sources } = await createKbMock(1001, NOW).tree();
    const mem = tabFiles(
      files,
      'hafiza',
      '',
      sources.map((s) => s.id),
    ).map((f) => f.source);
    expect(mem[0]).toBe('island:hq');
    expect(mem[mem.length - 1]).toBe('hq-memory');
    const reports = tabFiles(files, 'raporlar', 'island:hq').map((f) => f.path);
    expect(reports).toEqual(['island:hq/reports/2026-W45.md', 'island:hq/reports/2026-W44.md']);
  });

  it('resolves [[links]] by title or file name, same source first', async () => {
    const { files } = await createKbMock(1001, NOW).tree();
    expect(resolveLink(files, 'worker-testleri', 'island:coding')?.path).toBe(
      'island:coding/memory/worker-testleri.md',
    );
    expect(resolveLink(files, 'Gölge acne: iskele', 'fleet')?.path).toBe(
      'island:coding/memory/golge-acne.md',
    );
    // MEMORY exists in every island: the own source wins
    expect(resolveLink(files, 'MEMORY', 'island:qa')?.path).toBe('island:qa/memory/MEMORY.md');
    expect(resolveLink(files, 'eski-shader-notu', 'island:coding')).toBeUndefined();
  });

  it('groups hits per file with a line cap', () => {
    const h = (path: string, line: number) => ({ path, line, text: `l${line}` });
    const g = groupHits([h('a', 1), h('b', 2), h('a', 3), h('a', 4), h('a', 5)], 3);
    expect(g.map((x) => [x.path, x.hits.length, x.total])).toEqual([
      ['a', 3, 4],
      ['b', 1, 1],
    ]);
  });

  it('maps a file-line hit onto the body line', async () => {
    const kb = createKbMock(1001, NOW);
    const [hit] = await kb.search('Gölge kamerası');
    const doc = await kb.doc(hit.path);
    const i = hitLine(doc?.text ?? '', hit);
    expect(doc?.text.split('\n')[i]).toContain('Gölge kamerası');
  });

  it('shortens home dirs and derives the http base', () => {
    expect(shortDir('/Users/omer/Work/x')).toBe('~/Work/x');
    expect(shortDir('/home/omer')).toBe('~');
    expect(shortDir('/opt/x')).toBe('/opt/x');
    expect(httpBaseOf('ws://localhost:5174/ws')).toBe('http://localhost:5174');
    expect(httpBaseOf('wss://example.com/ws')).toBe('https://example.com');
  });

  it('splits nested frontmatter', () => {
    const r = splitFrontmatter('---\nname: a\nmetadata:\n  type: user\n---\nbody');
    expect(r).toEqual({ frontmatter: { name: 'a', 'metadata.type': 'user' }, body: 'body' });
  });

  it('createKbApi: routes, 404 → null, 400 → error, unreachable → offline', async () => {
    const f = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      if (u.includes('/api/kb/file')) return new Response('', { status: 404 });
      if (init?.method === 'POST')
        return new Response(JSON.stringify({ error: 'dir yok' }), { status: 400 });
      return new Response(JSON.stringify({ hits: [{ path: 'p', line: 1, text: 't' }] }));
    }) as unknown as typeof fetch;
    const api = createKbApi('http://h:1', f);
    expect(await api.doc('a/b.md')).toBeNull();
    expect(await api.search('x y')).toHaveLength(1);
    expect(vi.mocked(f).mock.calls[1][0]).toBe('http://h:1/api/kb/search?q=x%20y');
    expect(await api.addProject({ name: 'a', dir: '/b' })).toEqual({ error: 'dir yok' });
    const down = createKbApi('http://h:1', (() =>
      Promise.reject(new TypeError('x'))) as typeof fetch);
    await expect(down.tree()).rejects.toThrow();
    expect((await down.addProject({ name: 'a', dir: '/b' })).error).toBeTruthy();
  });
});

describe('store projects (TASK-585)', () => {
  it('fills from the snapshot and upserts on `project` events', () => {
    const st = emptyFleetState();
    const evs: FleetEvent[] = [];
    createFleetMock({ seed: 1001, now: NOW, frozen: true }, (e) => evs.push(e)).stop();
    for (const e of evs) applyFleetEvent(st, e);
    expect([...st.projects.keys()]).toEqual(['marisland', 'piton-studios', 'realestate-pipeline']);
    const on = [...st.sessions.values()].filter((s) => s.project === 'marisland');
    expect(on.length).toBeGreaterThanOrEqual(3);
    applyFleetEvent(st, {
      type: 'project',
      project: { id: 'marisland', name: 'M2', dir: '/x', createdAt: 1 },
    });
    expect(st.projects.get('marisland')?.name).toBe('M2');
    expect(st.projects.size).toBe(3);
  });
});
