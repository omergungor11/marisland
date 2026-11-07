import { THEME_IDS, type ArchetypeId, type ThemeId } from '../world/types.ts';
import { ARCHETYPES } from './islands.ts';
import { THEMES, THEME_BY_ARCHETYPE } from './themes.ts';

/**
 * Island accent colours for labels, keyed by archetype display name: the island's department
 * accent (content/themes, D-024).
 */
export const ISLAND_ACCENTS: Record<string, string> = Object.fromEntries(
  (Object.keys(ARCHETYPES) as ArchetypeId[]).map((a) => [
    ARCHETYPES[a].displayName,
    THEMES[THEME_BY_ARCHETYPE[a]].accent,
  ]),
);

/** Department accents by theme id (the fleet panel, TASK-563). */
export const THEME_ACCENTS: Record<ThemeId, string> = Object.fromEntries(
  THEME_IDS.map((t) => [t, THEMES[t].accent]),
) as Record<ThemeId, string>;
