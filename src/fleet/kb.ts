/**
 * Knowledge-base data layer of the admin window (M43, TASK-585): the bridge's read-only KB routes
 * (`protocol.ts`, the `KbSource` comment block) behind one small interface, plus the pure helpers
 * the window uses (tab filter, stale check, `[[link]]` lookup, hit grouping, dir shortening).
 * No three.js, no DOM.
 */
import { ADMIN, type AdminTab } from '../content/fleet.ts';
import type { FleetMode } from './client.ts';
import { createKbMock } from './kb-mock.ts';
import type { FleetProject, KbDoc, KbFile, KbFileKind, KbHit, KbSource } from './protocol.ts';

export interface KbTreeResponse {
  sources: KbSource[];
  files: KbFile[];
}
export interface ProjectInput {
  name: string;
  dir: string;
  note?: string;
}
export interface KbApi {
  /** Rejects when the bridge cannot be reached. */
  tree(): Promise<KbTreeResponse>;
  /** null: no such file (404). */
  doc(path: string): Promise<KbDoc | null>;
  search(q: string): Promise<KbHit[]>;
  /** `project` on 201, `error` on 400 (or when the bridge is unreachable). */
  addProject(input: ProjectInput): Promise<{ project?: FleetProject; error?: string }>;
}

/** `ws://host:port/ws` → `http://host:port` (`wss` → `https`). */
export function httpBaseOf(wsUrl: string): string {
  const u = new URL(wsUrl);
  return `${u.protocol === 'wss:' ? 'https:' : 'http:'}//${u.host}`;
}

export function createKbApi(httpBase: string, f: typeof fetch = (...a) => fetch(...a)): KbApi {
  const get = async <T>(path: string): Promise<T> => {
    const r = await f(`${httpBase}${path}`);
    if (!r.ok) throw new Error(`kb ${path}: ${r.status}`);
    return (await r.json()) as T;
  };
  return {
    tree: () => get<KbTreeResponse>('/api/kb/tree'),
    async doc(path) {
      const r = await f(`${httpBase}/api/kb/file?path=${encodeURIComponent(path)}`);
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`kb file: ${r.status}`);
      return (await r.json()) as KbDoc;
    },
    search: async (q) =>
      (await get<{ hits: KbHit[] }>(`/api/kb/search?q=${encodeURIComponent(q)}`)).hits,
    async addProject(input) {
      try {
        const r = await f(`${httpBase}/api/projects`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(input),
        });
        const body = (await r.json().catch(() => ({}))) as {
          project?: FleetProject;
          error?: string;
        };
        if (r.ok && body.project) return { project: body.project };
        return { error: body.error ?? `HTTP ${r.status}` };
      } catch {
        return { error: ADMIN.kb.offline };
      }
    },
  };
}

/** The KB the window reads: the bridge (live), the deterministic mock (mock), null (off). */
export function createKb(
  mode: FleetMode,
  o: { httpBase: string; seed: number; now: number },
): KbApi | null {
  if (mode === 'mock') return createKbMock(o.seed, o.now);
  if (mode === 'live') return createKbApi(o.httpBase);
  return null;
}

// ---- pure helpers ----------------------------------------------------------------------------

const KB_TABS: Readonly<
  Record<Exclude<AdminTab, 'projeler' | 'sessionlar'>, readonly KbFileKind[]>
> = {
  hafiza: ['memory'],
  bilgi: ['knowledge', 'claude', 'config', 'doc', 'other'],
  raporlar: ['report'],
};

/**
 * The tab's files (optionally one source): grouped by source in `sourceOrder` (the tree's order),
 * then by path; reports newest first (dated names).
 */
export function tabFiles(
  files: readonly KbFile[],
  tab: Exclude<AdminTab, 'projeler' | 'sessionlar'>,
  source = '',
  sourceOrder: readonly string[] = [],
): KbFile[] {
  const kinds = KB_TABS[tab];
  const rank = (f: KbFile): number => {
    const i = sourceOrder.indexOf(f.source);
    return i < 0 ? sourceOrder.length : i;
  };
  const out = files.filter((f) => kinds.includes(f.kind) && (!source || f.source === source));
  return out.sort(
    (a, b) =>
      rank(a) - rank(b) ||
      (tab === 'raporlar' ? b.path.localeCompare(a.path) : a.path.localeCompare(b.path)),
  );
}

export const kbTabOf = (kind: KbFileKind): Exclude<AdminTab, 'projeler' | 'sessionlar'> =>
  kind === 'memory' ? 'hafiza' : kind === 'report' ? 'raporlar' : 'bilgi';

export const isStale = (f: Pick<KbFile, 'mtime'>, now: number, days = ADMIN.staleDays): boolean =>
  now - f.mtime > days * 86_400_000;

const baseName = (path: string): string => {
  const name = path.slice(path.lastIndexOf('/') + 1);
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
};

/** `[[name]]` → the file whose title or file name (with / without extension) is `name`, same source first. */
export function resolveLink(
  files: readonly KbFile[],
  name: string,
  fromSource: string,
): KbFile | undefined {
  const n = name.trim().toLowerCase();
  const hit = (f: KbFile): boolean =>
    f.title.toLowerCase() === n ||
    baseName(f.path).toLowerCase() === n ||
    f.path.slice(f.path.lastIndexOf('/') + 1).toLowerCase() === n;
  return files.find((f) => f.source === fromSource && hit(f)) ?? files.find(hit);
}

export interface HitGroup {
  path: string;
  hits: KbHit[];
  total: number;
}
/** Hits grouped by file in first-seen order, `cap` lines kept per file. */
export function groupHits(hits: readonly KbHit[], cap = ADMIN.search.linesPerFile): HitGroup[] {
  const by = new Map<string, HitGroup>();
  for (const h of hits) {
    let g = by.get(h.path);
    if (!g) by.set(h.path, (g = { path: h.path, hits: [], total: 0 }));
    g.total++;
    if (g.hits.length < cap) g.hits.push(h);
  }
  return [...by.values()];
}

/** `/Users/<x>/…` or `/home/<x>/…` → `~/…` (the browser cannot read the real home). */
export const shortDir = (dir: string): string =>
  dir.replace(/^\/(?:Users|home)\/[^/]+(?=\/|$)/, '~');

/**
 * The body line (0-based) a search hit points at: `KbHit.line` counts file lines (frontmatter
 * included) while the doc text has none, so the line whose text matches the hit nearest to
 * `line - 1 - offset` wins (offset unknown: try the nearest match to the raw line); -1 when no
 * line matches.
 */
export function hitLine(text: string, hit: Pick<KbHit, 'line' | 'text'>): number {
  const want = hit.text.trim();
  if (!want) return -1;
  const lines = text.split('\n');
  let best = -1;
  for (let i = 0; i < lines.length; i++)
    if (lines[i].trim() === want || (want.length > 8 && lines[i].includes(want)))
      if (best < 0 || Math.abs(i - (hit.line - 1)) < Math.abs(best - (hit.line - 1))) best = i;
  return best;
}
