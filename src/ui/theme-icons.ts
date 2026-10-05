import type { ThemeIconKey } from '../content/themes.ts';

/**
 * Department glyphs for the island labels (Phase 3, TASK-308): ART_BIBLE §9 icon style —
 * 24 viewBox, stroke 2.5, round caps / joins, `currentColor`.
 */
const THEME_ICON_PATHS: Readonly<Record<ThemeIconKey, string>> = {
  // hub: a centre node wired to three team nodes
  hub: '<circle cx="12" cy="13" r="3"/><circle cx="12" cy="4" r="2"/><circle cx="4.5" cy="19" r="2"/><circle cx="19.5" cy="19" r="2"/><path d="M12 6v4M6.2 17.7l3.4-2.6M17.8 17.7l-3.4-2.6"/>',
  // code: </>
  code: '<path d="M8 6.5L2.5 12 8 17.5M16 6.5l5.5 5.5-5.5 5.5M13.8 4.5l-3.6 15"/>',
  // megaphone with a sound wave
  megaphone:
    '<path d="M3.5 9.5v5h3l9 4.5v-14l-9 4.5z"/><path d="M6.5 14.5l1.5 5"/><path d="M19 9a4 4 0 0 1 0 6"/>',
  // magnifier with a check inside
  magnifier:
    '<circle cx="10.5" cy="10.5" r="7"/><path d="M15.7 15.7l5 5"/><path d="M7.3 10.7l2.2 2.2 3.8-4"/>',
  // palette (thumb notch + paint dots) and a brush across it
  palette:
    '<path d="M11 3.5a8 8 0 1 0 0 16c1.3 0 1.9-.8 1.7-1.8-.3-1.3.4-2.2 1.7-2.2"/><path d="M11 3.5a8 8 0 0 1 7.4 5"/><circle cx="7" cy="11" r=".6"/><circle cx="10" cy="7.5" r=".6"/><path d="M21 9.5l-6.5 6.5"/><path d="M14.5 16c-1.5 0-2.5 1-2.5 2.5v1h1c1.5 0 2.5-1 2.5-2.5z"/>',
  // server rack unit with a gear
  gear: '<rect x="2.5" y="3" width="10" height="6.5" rx="2"/><path d="M6 6.25h.01M9 6.25h.01"/><circle cx="16" cy="16" r="3.5"/><path d="M19 17.75l1.75 1M16 19.5v2M13 17.75l-1.75 1M13 14.25l-1.75-1M16 12.5v-2M19 14.25l1.75-1"/>',
  // conical lab flask with a liquid line
  flask:
    '<path d="M9 3.5h6M10 3.5v6L4.5 18.6a1.5 1.5 0 0 0 1.3 2.4h12.4a1.5 1.5 0 0 0 1.3-2.4L14 9.5v-6"/><path d="M7.2 15h9.6"/>',
};

/** Inline SVG for a department glyph (decorative: the label's aria-label carries the text). */
export function themeIcon(key: ThemeIconKey, size = 14): string {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${THEME_ICON_PATHS[key]}</svg>`;
}
