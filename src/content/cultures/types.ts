/**
 * Island culture contract (M19 "Seven Cultures", TASK-408): pure data + types, no geometry.
 * Each theme gets one `CultureDef` (content/cultures/<theme>.ts); wave 1 fills the kit ledger,
 * waves 2–3 hang story spots, rhythm slots and the relay step on it. Colours are hex strings that
 * must already exist in a palette table (content/palette*.ts, theme accents / team tints) —
 * `validateCultures` (validate.ts) enforces that, the per-island def cap and the tier mix.
 */
import type { ThemeId } from '../../world/types.ts';

/** Pennant cut = the island's flag silhouette (same meaning everywhere in the world). */
export type PennantCut =
  'swallowtail' | 'kite' | 'square' | 'streamer' | 'chevron' | 'scallop' | 'star';

/**
 * One NEW prop def an island culture adds. Variants of existing defs are not ledger entries.
 * `tier` = first tier the def shows at (0–3); the validator rejects tier 0 and caps tier 1.
 */
export interface KitEntry {
  /** Prop def id (content/props-themes). */
  id: string;
  tier: 0 | 1 | 2 | 3;
  /** PropFlag bits of the def (e.g. `PropFlag.noShadow` for tier-3 micro props). */
  flags: number;
}

/** A story spot the placer will emit (T3 mini scene); `defs` are the prop def ids it uses. */
export interface StorySpotDef {
  kind: string;
  defs: readonly string[];
}

/** A named slot of the island's day (game hour 0–24). */
export interface RhythmSlot {
  id: string;
  hour: number;
}

/** The island's turn in the shared Launch Day Relay (1 = first, 7 = last). */
export interface RelayStep {
  order: number;
  id: string;
}

export interface CulturePalette {
  /** Pennant / label colour (the theme accent). */
  accent: string;
  /** Roof hues. */
  roofs: readonly string[];
  /** Wall hues. */
  walls: readonly string[];
  /** Trim / signage hues. */
  trims: readonly string[];
}

export interface CultureDef {
  theme: ThemeId;
  /** Culture id, e.g. 'harbourGuild'. */
  id: string;
  /** Display name (Turkish, as chosen). */
  name: string;
  /** English name, used in docs and the HUD tooltip. */
  nameEn: string;
  palette: CulturePalette;
  pennant: { cut: PennantCut; accent: string };
  /** New defs this culture adds (≤ budgets.cultureDefsPerIsland). */
  kit: readonly KitEntry[];
  storySpots: readonly StorySpotDef[];
  rhythm: readonly RhythmSlot[];
  relay: RelayStep;
}
