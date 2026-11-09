/**
 * Fleet config (pure: no fs). `fleet/fleet.config.json` holds fleet-wide values; each island's
 * `island.json` is validated by hand against `fleet/schema/island.schema.json` (no ajv).
 */
import { THEME_IDS } from '../src/world/types.ts';
import { FLEET_PORT, type FleetIsland } from '../src/fleet/protocol.ts';

/** Hand-offs one final message may open (M42, D-149): 2 for every island, 7 for hq. */
export const FLEET_CHAIN = { maxPerMessage: 2, maxPerMessageHq: 7 } as const;
export const maxPerMessage = (island: FleetIsland): number =>
  island === 'hq' ? FLEET_CHAIN.maxPerMessageHq : FLEET_CHAIN.maxPerMessage;

export interface FleetConfig {
  port: number;
  /** Model alias of the title job. */
  titleModel: string;
  /** Defaults used when a manifest omits them. */
  maxTurns: number;
  maxChildren: number;
  /** M43: HQ auto-memory dir served as the `hq-memory` kb source (`~` allowed). */
  hqMemoryDir?: string;
}

export interface IslandManifest {
  theme: FleetIsland;
  name: string;
  role: string;
  model: 'haiku' | 'sonnet' | 'opus';
  maxTurns: number;
  maxChildren: number;
  /** false = a child session of this island opens no gates (default true). */
  childGates?: boolean;
  allowedTools: string[];
  addDirs: string[];
  owner: 'hq' | 'user';
  agents?: string[];
  panel?: { accent?: string };
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** `FLEET_PORT` env wins over the file (a second bridge next to the user's own). */
export function withEnvPort(
  cfg: FleetConfig,
  env: Record<string, string | undefined>,
): FleetConfig {
  const n = Number(env.FLEET_PORT);
  return Number.isInteger(n) && n >= 1 && n <= 65535 ? { ...cfg, port: n } : cfg;
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
  if (raw.titleModel !== undefined && (typeof raw.titleModel !== 'string' || !raw.titleModel))
    throw new Error('fleet.config: titleModel must be a non-empty string');
  return {
    port,
    titleModel: (raw.titleModel as string | undefined) ?? 'haiku',
    maxTurns: posInt(raw.maxTurns, 'maxTurns', 30),
    maxChildren: posInt(raw.maxChildren, 'maxChildren', 6),
    ...(typeof raw.hqMemoryDir === 'string' && raw.hqMemoryDir
      ? { hqMemoryDir: raw.hqMemoryDir }
      : {}),
  };
}

function parseJson(text: string, what: string): unknown {
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(`${what}: invalid JSON (${(e as Error).message})`, { cause: e });
  }
}

export const parseConfigText = (text: string): FleetConfig =>
  parseConfig(parseJson(text, 'fleet.config'));

const MODELS = ['haiku', 'sonnet', 'opus'];
const KEYS = [
  'theme',
  'name',
  'role',
  'model',
  'maxTurns',
  'maxChildren',
  'childGates',
  'allowedTools',
  'addDirs',
  'owner',
  'agents',
  'panel',
];
const REQUIRED = ['theme', 'name', 'role', 'model', 'maxTurns', 'allowedTools', 'addDirs', 'owner'];

const strArr = (v: unknown, minLen: number): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === 'string' && x.length >= minLen);

/** Problems with an island manifest (empty = valid). `dirName` must equal `theme`. */
export function validateManifest(raw: unknown, dirName: string): string[] {
  if (!isObj(raw)) return ['island.json: root must be an object'];
  const p: string[] = [];
  for (const k of REQUIRED) if (raw[k] === undefined) p.push(`missing required key "${k}"`);
  for (const k of Object.keys(raw)) if (!KEYS.includes(k)) p.push(`unknown key "${k}"`);
  const { theme, name, role, model, maxTurns, maxChildren, owner } = raw;
  if (theme !== undefined) {
    if (!(THEME_IDS as readonly string[]).includes(theme as string))
      p.push(`theme "${String(theme)}" is not a ThemeId`);
    if (theme !== dirName) p.push(`theme "${String(theme)}" != directory "${dirName}"`);
  }
  const str = (v: unknown, k: string, min: number, max: number): void => {
    if (v !== undefined && (typeof v !== 'string' || v.length < min || v.length > max))
      p.push(`${k} must be a string of ${min}-${max} chars`);
  };
  str(name, 'name', 2, 40);
  str(role, 'role', 10, 200);
  if (model !== undefined && !MODELS.includes(model as string))
    p.push(`model "${String(model)}" must be one of ${MODELS.join('|')} (never fable)`);
  const int = (v: unknown, k: string, min: number, max: number): void => {
    if (v !== undefined && (!Number.isInteger(v) || (v as number) < min || (v as number) > max))
      p.push(`${k} must be an integer ${min}-${max}`);
  };
  int(maxTurns, 'maxTurns', 1, 200);
  int(maxChildren, 'maxChildren', 0, 20);
  if (raw.childGates !== undefined && typeof raw.childGates !== 'boolean')
    p.push('childGates must be a boolean');
  if (raw.allowedTools !== undefined && !strArr(raw.allowedTools, 1))
    p.push('allowedTools must be a list of non-empty strings');
  if (raw.addDirs !== undefined && !strArr(raw.addDirs, 1))
    p.push('addDirs must be a list of non-empty strings');
  if (owner !== undefined && owner !== 'hq' && owner !== 'user') p.push('owner must be hq|user');
  if (raw.agents !== undefined && !strArr(raw.agents, 0))
    p.push('agents must be a list of strings');
  if (raw.panel !== undefined) {
    const a = isObj(raw.panel) ? raw.panel.accent : undefined;
    if (!isObj(raw.panel) || (a !== undefined && !/^#[0-9a-fA-F]{6}$/.test(String(a))))
      p.push('panel.accent must be #rrggbb');
  }
  return p;
}

/** Validate + fill the `maxChildren` default. Throws with every problem listed. */
export function parseManifest(raw: unknown, dirName: string, fleet: FleetConfig): IslandManifest {
  const problems = validateManifest(raw, dirName);
  if (problems.length) throw new Error(`island ${dirName}: ${problems.join('; ')}`);
  const m = raw as IslandManifest;
  return {
    ...m,
    maxChildren: m.maxChildren ?? fleet.maxChildren,
    childGates: m.childGates ?? true,
  };
}

export const parseManifestText = (
  text: string,
  dirName: string,
  fleet: FleetConfig,
): IslandManifest => parseManifest(parseJson(text, `island ${dirName}`), dirName, fleet);

export interface IslandSpawn {
  /** Working directory of the session. */
  cwd: string;
  /** Manifest-derived claude flags (tools, turns, model, add-dir, settings). */
  args: string[];
  /** Repo-relative prefixes (trailing slash) the session may write to. */
  writable: string[];
}

/**
 * The one place the island folder layout is applied (FLEET.md "Dizin yapısı"): cwd is the island
 * dir, the rest comes from its manifest. Auto-memory lands in `<island>/memory/` through
 * `autoMemoryDirectory`.
 */
export function islandSpawn(root: string, m: IslandManifest): IslandSpawn {
  const cwd = `${root}/fleet/islands/${m.theme}`;
  const args = [
    '--allowedTools',
    m.allowedTools.join(','),
    '--max-turns',
    String(m.maxTurns),
    '--model',
    m.model,
    ...m.addDirs.flatMap((d) => ['--add-dir', `${root}/${d}`]),
    '--settings',
    JSON.stringify({ autoMemoryDirectory: `${cwd}/memory` }),
  ];
  const writable = [
    `fleet/islands/${m.theme}/`,
    ...m.addDirs.map((d) => `${d.replace(/\/+$/, '')}/`),
  ];
  return { cwd, args, writable };
}
