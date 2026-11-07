/** `fleet/fleet.config.json` load + validate (pure: no fs). Defaults fill whatever is missing. */
import { THEME_IDS } from '../src/world/types.ts';
import { FLEET_PORT, type FleetIsland } from '../src/fleet/protocol.ts';

export interface IslandConfig {
  addDirs: string[];
}

export interface FleetConfig {
  port: number;
  maxTurns: number;
  /** Child sessions per request (M42). */
  maxChildren: number;
  /** Model alias for `--model`; omitted = the CLI default. */
  model?: string;
  allowedTools: string[];
  islands: Record<FleetIsland, IslandConfig>;
}

export const DEFAULT_ALLOWED_TOOLS: readonly string[] = [
  'Read',
  'Edit',
  'Write',
  'Glob',
  'Grep',
  'Bash(pnpm *)',
  'Bash(git status*)',
  'Bash(git diff*)',
  'Bash(git log*)',
];

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function strList(v: unknown, where: string): string[] {
  if (!Array.isArray(v) || v.some((x) => typeof x !== 'string' || x === ''))
    throw new Error(`fleet.config: ${where} must be a list of non-empty strings`);
  return v as string[];
}

function posInt(v: unknown, where: string, fallback: number): number {
  if (v === undefined) return fallback;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1)
    throw new Error(`fleet.config: ${where} must be a positive integer`);
  return v;
}

export function parseConfig(raw: unknown): FleetConfig {
  if (!isObj(raw)) throw new Error('fleet.config: root must be an object');
  const port = posInt(raw.port, 'port', FLEET_PORT);
  if (port > 65535) throw new Error('fleet.config: port out of range');
  if (raw.model !== undefined && (typeof raw.model !== 'string' || raw.model === ''))
    throw new Error('fleet.config: model must be a non-empty string');
  const rawIslands = raw.islands ?? {};
  if (!isObj(rawIslands)) throw new Error('fleet.config: islands must be an object');
  for (const k of Object.keys(rawIslands))
    if (!(THEME_IDS as readonly string[]).includes(k))
      throw new Error(`fleet.config: unknown island "${k}"`);
  const islands = {} as Record<FleetIsland, IslandConfig>;
  for (const id of THEME_IDS) {
    const c = rawIslands[id];
    if (c !== undefined && !isObj(c))
      throw new Error(`fleet.config: islands.${id} must be an object`);
    islands[id] = {
      addDirs: c?.addDirs === undefined ? [] : strList(c.addDirs, `islands.${id}.addDirs`),
    };
  }
  return {
    port,
    maxTurns: posInt(raw.maxTurns, 'maxTurns', 30),
    maxChildren: posInt(raw.maxChildren, 'maxChildren', 6),
    ...(raw.model !== undefined ? { model: raw.model as string } : {}),
    allowedTools:
      raw.allowedTools === undefined
        ? [...DEFAULT_ALLOWED_TOOLS]
        : strList(raw.allowedTools, 'allowedTools'),
    islands,
  };
}

/** `JSON.parse` + `parseConfig`, with a readable error for broken JSON. */
export function parseConfigText(text: string): FleetConfig {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    throw new Error(`fleet.config: invalid JSON (${(e as Error).message})`, { cause: e });
  }
  return parseConfig(raw);
}

export interface IslandSpawn {
  /** Working directory of the session. */
  cwd: string;
  /** Layout flags (`--add-dir`, later `--plugin-dir` / `--settings`) appended to the claude argv. */
  args: string[];
}

/**
 * The one place the island folder layout is applied (cwd and per-island spawn flags). Current
 * layout: `<root>/fleet/islands/<island>/` as cwd + `--add-dir` per `islands.<island>.addDirs`.
 * TODO(layout spec): `--plugin-dir`, `--settings` for per-island skills/agents/memory.
 */
export function islandSpawn(root: string, cfg: FleetConfig, island: FleetIsland): IslandSpawn {
  return {
    cwd: `${root}/fleet/islands/${island}`,
    args: cfg.islands[island].addDirs.flatMap((d) => ['--add-dir', d]),
  };
}
