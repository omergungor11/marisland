import type { DirtyRegion, EditCommand, EditLog, EditResult } from '../world/edit-types.ts';
import type { WorldData } from '../world/types.ts';

/**
 * The pure edit model (`world/edit.ts`, TASK-201) as seen by the app / render side. Loaded
 * lazily so this side builds and tests before (and without) that module: when the file is
 * missing, `import.meta.glob` yields nothing and `loadWorldEditApi` resolves to null — edit
 * URLs and `api.edit` then report "edit api unavailable" instead of failing the build.
 */
export interface WorldEditApi {
  applyEdit(world: WorldData, cmd: EditCommand): EditResult;
  replay(world: WorldData, log: EditLog): DirtyRegion;
  encodeLog(log: EditLog): string;
  decodeLog(s: string): EditLog;
  /** Placement dry run for ghost previews (TASK-212), when the module provides it. */
  canPlace?(world: WorldData, cmd: EditCommand): boolean | { ok: boolean; reason?: string };
}

const REQUIRED = ['applyEdit', 'replay', 'encodeLog', 'decodeLog'] as const;

/** Check a loaded module's shape; null when a required export is missing. */
export function adaptWorldEditModule(mod: unknown): WorldEditApi | null {
  if (!mod || typeof mod !== 'object') return null;
  const m = mod as Record<string, unknown>;
  for (const k of REQUIRED) if (typeof m[k] !== 'function') return null;
  const api: WorldEditApi = {
    applyEdit: m.applyEdit as WorldEditApi['applyEdit'],
    replay: m.replay as WorldEditApi['replay'],
    encodeLog: m.encodeLog as WorldEditApi['encodeLog'],
    decodeLog: m.decodeLog as WorldEditApi['decodeLog'],
  };
  if (typeof m.canPlace === 'function') api.canPlace = m.canPlace as WorldEditApi['canPlace'];
  return api;
}

let cached: Promise<WorldEditApi | null> | null = null;

/** The edit model, or null when `world/edit.ts` is not part of this build. */
export function loadWorldEditApi(): Promise<WorldEditApi | null> {
  if (cached) return cached;
  const mods = import.meta.glob('../world/edit.ts');
  const load = mods['../world/edit.ts'];
  cached = load
    ? load().then(
        (mod) => adaptWorldEditModule(mod),
        (e: unknown) => {
          console.warn('[marisland] world/edit.ts failed to load', e);
          return null;
        },
      )
    : Promise.resolve(null);
  return cached;
}
