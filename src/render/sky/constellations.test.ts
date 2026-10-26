import { describe, expect, it } from 'vitest';
import { THEME_IDS, type ThemeId } from '../../world/types.ts';
import {
  CONSTELLATIONS,
  CONSTELLATION_LOOK as LOOK,
  CONSTELLATION_MAX as MAX,
} from '../../content/constellations.ts';
import { moonDir } from '../../env/env-state.ts';
import {
  CONST_ROW,
  cometLift,
  constellationTexels,
  constellationWindow,
  glyphRadius,
  placeConstellations,
} from './constellations.ts';

const DEG = Math.PI / 180;

// seed 1001's layout (island centres)
const ISLANDS: { theme: ThemeId; cx: number; cz: number }[] = [
  { theme: 'hq', cx: 0, cz: -1 },
  { theme: 'marketing', cx: -195, cz: -10 },
  { theme: 'coding', cx: -115, cz: 160 },
  { theme: 'devops', cx: 195, cz: -35 },
  { theme: 'qa', cx: 101, cz: -155 },
  { theme: 'design', cx: -101, cz: -163 },
  { theme: 'research', cx: 110, cz: 106 },
];

const angle = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) =>
  Math.acos(Math.min(1, a.x * b.x + a.y * b.y + a.z * b.z)) / DEG;

describe('culture constellations (TASK-491 W:G4)', () => {
  it('glyph tables: 6–9 stars, lines join existing stars, within the texture slots', () => {
    for (const t of THEME_IDS) {
      const g = CONSTELLATIONS[t];
      expect(g.stars.length).toBeGreaterThanOrEqual(6);
      expect(g.stars.length).toBeLessThanOrEqual(MAX.stars);
      expect(g.lines.length).toBeLessThanOrEqual(MAX.lines);
      for (const [a, b] of g.lines) {
        expect(g.stars[a]).toBeDefined();
        expect(g.stars[b]).toBeDefined();
        expect(a).not.toBe(b);
      }
    }
    expect(LOOK.lineAlpha).toBeLessThanOrEqual(0.15);
    expect(LOOK.lineAlphaComet).toBeLessThanOrEqual(0.15);
  });

  it('places one glyph per theme on its island bearing, apart from each other and the moon', () => {
    const p = placeConstellations(ISLANDS);
    expect(p.map((c) => c.theme).sort()).toEqual([...THEME_IDS].sort());
    const research = p.find((c) => c.theme === 'research')!;
    expect(research.bearingDeg).toBeCloseTo(47, 0);
    for (const c of p) {
      expect(c.elevationDeg).toBeGreaterThanOrEqual(LOOK.elevationDeg[0]);
      expect(Math.hypot(c.dir.x, c.dir.y, c.dir.z)).toBeCloseTo(1, 6);
    }
    // no two glyph discs overlap
    for (let i = 0; i < p.length; i++) {
      for (let j = i + 1; j < p.length; j++) {
        const r = (glyphRadius(p[i].theme) + glyphRadius(p[j].theme)) * LOOK.scaleDeg;
        expect(angle(p[i].dir, p[j].dir)).toBeGreaterThan(r);
      }
    }
    // the moon stays clear of every glyph at night
    const m = { x: 0, y: 0, z: 0 };
    for (const h of [20, 21, 22, 23, 0, 2, 4]) {
      moonDir(h, m);
      for (const c of p) {
        expect(angle(c.dir, m)).toBeGreaterThan(glyphRadius(c.theme) * LOOK.scaleDeg);
      }
    }
    expect(placeConstellations([])).toEqual([]);
  });

  it('is deterministic and follows the layout', () => {
    const a = placeConstellations(ISLANDS);
    const b = placeConstellations(ISLANDS);
    expect(a).toEqual(b);
    const moved = ISLANDS.map((i) => (i.theme === 'qa' ? { ...i, cx: -i.cx, cz: -i.cz } : i));
    const qa = placeConstellations(moved).find((c) => c.theme === 'qa')!;
    expect(qa.bearingDeg).not.toBeCloseTo(a.find((c) => c.theme === 'qa')!.bearingDeg, 0);
  });

  it('texels: one row per theme, empty slots dark and far', () => {
    const d = constellationTexels();
    expect(d.length).toBe(CONST_ROW * THEME_IDS.length * 4);
    const row = THEME_IDS.indexOf('qa');
    const g = CONSTELLATIONS.qa;
    const o = row * CONST_ROW * 4;
    expect([d[o], d[o + 1], d[o + 2]]).toEqual([...g.stars[0]].map(Math.fround));
    // unused star slot: brightness 0
    expect(d[o + (MAX.stars - 1) * 4 + 2]).toBe(0);
    // first line = stars 0 → 1
    const l = o + MAX.stars * 4;
    expect([d[l], d[l + 1], d[l + 2], d[l + 3]]).toEqual(
      [...g.stars[0].slice(0, 2), ...g.stars[1].slice(0, 2)].map(Math.fround),
    );
    // unused line slot sits far away
    expect(d[o + (CONST_ROW - 1) * 4]).toBeGreaterThan(1000);
  });

  it('hour window: full 21:00–04:00, off by day; Comet Night lift eases in and out', () => {
    expect(constellationWindow(21)).toBe(1);
    expect(constellationWindow(0)).toBe(1);
    expect(constellationWindow(4)).toBe(1);
    expect(constellationWindow(12)).toBe(0);
    expect(constellationWindow(18)).toBe(0);
    expect(constellationWindow(6)).toBe(0);
    expect(constellationWindow(20.5)).toBeGreaterThan(0);
    expect(constellationWindow(20.5)).toBeLessThan(1);
    expect(cometLift(-1)).toBe(0);
    expect(cometLift(0)).toBe(0);
    expect(cometLift(0.5)).toBe(1);
    expect(cometLift(1)).toBe(0);
  });
});
