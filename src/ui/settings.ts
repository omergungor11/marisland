/**
 * Persisted HUD preferences (localStorage; private mode just falls back to defaults).
 * Quality has its own key in core/quality.ts.
 */
export interface UiPrefs {
  /** `null` = not chosen by the user (follow `prefers-reduced-motion`). */
  reducedMotion: boolean | null;
  compass: boolean;
}

const KEY = 'marisland.ui';

export function loadPrefs(): UiPrefs {
  const def: UiPrefs = { reducedMotion: null, compass: true };
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    if (!raw) return def;
    const v = JSON.parse(raw) as Partial<UiPrefs>;
    return {
      reducedMotion: typeof v.reducedMotion === 'boolean' ? v.reducedMotion : null,
      compass: typeof v.compass === 'boolean' ? v.compass : true,
    };
  } catch {
    return def;
  }
}

export function storePrefs(p: UiPrefs): void {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(p));
  } catch {
    /* private mode etc. */
  }
}
